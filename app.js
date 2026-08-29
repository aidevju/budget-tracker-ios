(() => {
  "use strict";

  const STORAGE_KEY = "ledger_transactions_v1";
  const SETTINGS_KEY = "ledger_settings_v1";
  const LISTS_KEY = "ledger_lists_v1";
  const TEMPLATES_KEY = "ledger_templates_v1";

  // Default category/payment-method lists, seeded into ledger_lists_v1 the
  // first time the app runs (or the first time it runs after this feature
  // shipped) so existing users see identical dropdowns/colors as before.
  // "Bills" and the payment-methods list are new as of this feature.
  const DEFAULT_LISTS = {
    expenseCategories: ["Food", "Transport", "Housing", "Utilities", "Shopping", "Health", "Entertainment", "Other", "Bills"],
    incomeCategories: ["Salary", "Freelance", "Gift", "Other"],
    paymentMethods: ["Cash", "Debit Card", "Credit Card", "Transfer", "GCash", "Other"],
    // Expense category -> fixed chart-color slot, assigned once at creation
    // and never reassigned by renaming/reordering. Slots 0-8 map to the
    // curated --cat-1..9 CSS variables; slot 9+ (only reachable once a user
    // adds a 10th expense category) falls back to a generated color.
    expenseCategoryColorSlots: { Food: 0, Transport: 1, Housing: 2, Utilities: 3, Shopping: 4, Health: 5, Entertainment: 6, Other: 7, Bills: 8 },
    nextExpenseColorSlot: 9
  };

  // "none" (no symbol) is the default. Dollars first, then PHP, then the rest.
  const CURRENCIES = [
    { code: "none", symbol: "", label: "No symbol" },
    { code: "USD", symbol: "$", label: "USD — $" },
    { code: "PHP", symbol: "₱", label: "PHP — ₱" },
    { code: "EUR", symbol: "€", label: "EUR — €" },
    { code: "GBP", symbol: "£", label: "GBP — £" },
    { code: "JPY", symbol: "¥", label: "JPY — ¥" },
    { code: "INR", symbol: "₹", label: "INR — ₹" },
    { code: "AUD", symbol: "A$", label: "AUD — A$" },
    { code: "CAD", symbol: "C$", label: "CAD — C$" },
    { code: "CNY", symbol: "¥", label: "CNY — ¥" },
    { code: "KRW", symbol: "₩", label: "KRW — ₩" }
  ];

  const DEFAULT_SETTINGS = { theme: "system", currency: "none", monthlyTarget: null, ccSuggestWindowDays: 60 };

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // ---------- Toasts ----------
  const toastContainer = document.getElementById("toastContainer");
  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, 2500);
  }

  // ---------- State ----------
  let transactions = loadTransactions();
  let settings = loadSettings();
  let lists = loadLists();
  let templates = loadTemplates();
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-indexed
  let editingId = null; // null = adding new
  let currentType = "expense";
  let currentBillAccount = null; // account key ("" = Unspecified card) the Pay Card Bill sheet is open for
  let billShowOlder = false;
  let billCheckedIds = new Set(); // ids of candidate charges currently checked in the Pay Card Bill sheet
  let editingTemplateId = null; // null = adding new
  let templateType = "expense"; // independent from currentType — the template sheet has its own type toggle

  // ---------- Storage ----------
  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load transactions", e);
      return [];
    }
  }

  function saveTransactions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
      return true;
    } catch (e) {
      console.error("Failed to save transactions", e);
      showToast("Couldn't save — storage may be full.", "error");
      return false;
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      console.error("Failed to load settings", e);
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch (e) {
      console.error("Failed to save settings", e);
      showToast("Couldn't save settings.", "error");
      return false;
    }
  }

  function loadLists() {
    try {
      const raw = localStorage.getItem(LISTS_KEY);
      if (raw) return { ...DEFAULT_LISTS, ...JSON.parse(raw) };
    } catch (e) {
      console.error("Failed to load lists", e);
    }
    const seeded = JSON.parse(JSON.stringify(DEFAULT_LISTS));
    try {
      localStorage.setItem(LISTS_KEY, JSON.stringify(seeded));
    } catch (e) {
      console.error("Failed to save lists", e);
    }
    return seeded;
  }

  function saveLists() {
    try {
      localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
      return true;
    } catch (e) {
      console.error("Failed to save lists", e);
      showToast("Couldn't save changes.", "error");
      return false;
    }
  }

  function loadTemplates() {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load templates", e);
      return [];
    }
  }

  function saveTemplates() {
    try {
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
      return true;
    } catch (e) {
      console.error("Failed to save templates", e);
      showToast("Couldn't save template.", "error");
      return false;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- List management (Settings) ----------
  function listFieldAndType(listKey) {
    if (listKey === "paymentMethods") return { field: "paymentMethod", type: null };
    if (listKey === "incomeCategories") return { field: "category", type: "income" };
    return { field: "category", type: "expense" };
  }

  function listUsageCounts(listKey, value) {
    const { field, type } = listFieldAndType(listKey);
    const matches = (t) => t[field] === value && (type === null || t.type === type);
    return { transactions: transactions.filter(matches).length, templates: templates.filter(matches).length };
  }

  function addListValue(listKey, rawValue) {
    const value = rawValue.trim();
    if (!value) return;
    const arr = lists[listKey];
    if (arr.includes(value)) return;
    arr.push(value);
    if (listKey === "expenseCategories") {
      lists.expenseCategoryColorSlots[value] = lists.nextExpenseColorSlot++;
    }
    saveLists();
  }

  function renameListValue(listKey, oldValue, rawNewValue) {
    const newValue = rawNewValue.trim();
    if (!newValue || newValue === oldValue) return;
    const arr = lists[listKey];
    const idx = arr.indexOf(oldValue);
    if (idx === -1 || arr.includes(newValue)) return;
    arr[idx] = newValue;

    if (listKey === "expenseCategories" && lists.expenseCategoryColorSlots[oldValue] !== undefined) {
      lists.expenseCategoryColorSlots[newValue] = lists.expenseCategoryColorSlots[oldValue];
      delete lists.expenseCategoryColorSlots[oldValue];
    }

    const { field, type } = listFieldAndType(listKey);
    transactions.forEach(t => {
      if (t[field] === oldValue && (type === null || t.type === type)) t[field] = newValue;
    });
    templates.forEach(t => {
      if (t[field] === oldValue && (type === null || t.type === type)) t[field] = newValue;
    });

    saveTransactions();
    saveTemplates();
    saveLists();
  }

  // Returns an error message if the value is in use (delete refused), or null on success.
  function deleteListValue(listKey, value) {
    const usage = listUsageCounts(listKey, value);
    if (usage.transactions > 0 || usage.templates > 0) {
      const parts = [];
      if (usage.transactions > 0) parts.push(`${usage.transactions} transaction${usage.transactions === 1 ? "" : "s"}`);
      if (usage.templates > 0) parts.push(`${usage.templates} template${usage.templates === 1 ? "" : "s"}`);
      return `Can't delete — used by ${parts.join(" and ")}.`;
    }
    const arr = lists[listKey];
    const idx = arr.indexOf(value);
    if (idx === -1) return null;
    arr.splice(idx, 1);
    if (listKey === "expenseCategories") delete lists.expenseCategoryColorSlots[value];
    saveLists();
    return null;
  }

  // ---------- Helpers ----------
  function currencySymbol() {
    const c = CURRENCIES.find(c => c.code === settings.currency);
    return c ? c.symbol : "";
  }

  function formatNumber(n) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatMoney(n) {
    const sign = n < 0 ? "-" : "";
    return sign + currencySymbol() + formatNumber(Math.abs(n));
  }

  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  // Shifts an ISO date string by `days` (may be negative), staying in local
  // calendar-day terms the same way todayISO() does.
  function shiftDateISO(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function getTransactionsForMonth(year, month) {
    return transactions.filter(t => {
      const d = new Date(t.date + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }

  function getMonthTransactions() {
    return getTransactionsForMonth(viewYear, viewMonth);
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function dateLabel(iso) {
    const d = new Date(iso + "T00:00:00");
    const now = new Date();
    const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(d, now)) return "Today";
    if (isSameDay(d, yesterday)) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Autosuggest (subcategory / account) ----------
  // Native <datalist> has poor/inconsistent support in iOS Safari (this
  // app's actual install target), so subcategory/account suggestions are a
  // small custom dropdown instead. Suggestions are computed live from
  // `transactions` each time they're shown — no cache to keep in sync.
  function distinctFieldValues(field) {
    const set = new Set();
    transactions.forEach(t => { if (t[field]) set.add(t[field]); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function setupAutosuggest(inputEl, listEl, field) {
    function showSuggestions() {
      const query = inputEl.value.trim().toLowerCase();
      const values = distinctFieldValues(field);
      const matches = (query ? values.filter(v => v.toLowerCase().includes(query)) : values).slice(0, 8);
      if (matches.length === 0) {
        listEl.hidden = true;
        listEl.innerHTML = "";
        return;
      }
      listEl.innerHTML = matches.map(v => `<div class="autosuggest-item">${escapeHtml(v)}</div>`).join("");
      listEl.hidden = false;
    }
    inputEl.addEventListener("focus", showSuggestions);
    inputEl.addEventListener("input", showSuggestions);
    inputEl.addEventListener("blur", () => {
      // Delay so a tap on a suggestion (see mousedown below) still registers.
      setTimeout(() => { listEl.hidden = true; }, 150);
    });
    listEl.addEventListener("mousedown", (e) => e.preventDefault()); // don't blur the input before the click lands
    listEl.addEventListener("click", (e) => {
      const item = e.target.closest(".autosuggest-item");
      if (!item) return;
      inputEl.value = item.textContent;
      listEl.hidden = true;
    });
  }

  // ---------- Rendering ----------
  function renderMonthLabel() {
    document.getElementById("monthLabel").textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  }

  function renderSummary(monthTx) {
    const income = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    document.getElementById("balanceAmount").textContent = formatMoney(income - expense);
    document.getElementById("incomeAmount").textContent = formatMoney(income);
    document.getElementById("expenseAmount").textContent = formatMoney(expense);
  }

  function categoryTotals(expenses) {
    const totals = {};
    expenses.forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }

  function csvField(value) {
    const str = String(value);
    return /[",\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }

  function csvRow(fields) {
    return fields.map(csvField).join(",");
  }

  function reconciledWithLabel(t) {
    if (!t.reconciledBillId) return "";
    const bill = transactions.find(b => b.id === t.reconciledBillId);
    return bill ? `${bill.date} — ${bill.note}` : "";
  }

  function exportMonthCSV() {
    const monthTx = getMonthTransactions();
    const income = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const catRows = categoryTotals(monthTx.filter(t => t.type === "expense"));

    const lines = [
      csvRow([`Ledger — ${MONTH_NAMES[viewMonth]} ${viewYear}`]),
      "",
      csvRow(["Summary"]),
      csvRow(["Income", income.toFixed(2)]),
      csvRow(["Expenses", expense.toFixed(2)]),
      csvRow(["Balance", (income - expense).toFixed(2)]),
      ""
    ];

    if (catRows.length > 0) {
      lines.push(csvRow(["By category"]));
      catRows.forEach(([cat, amt]) => lines.push(csvRow([cat, amt.toFixed(2)])));
      lines.push("");
    }

    lines.push(csvRow(["Transactions"]));
    lines.push(csvRow(["Date", "Type", "Category", "Subcategory", "Payment Method", "Account", "Note", "Reconciled With", "Amount"]));
    [...monthTx]
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .forEach(t => {
        lines.push(csvRow([
          t.date,
          t.type === "income" ? "Income" : "Expense",
          t.category,
          t.subcategory || "",
          t.paymentMethod || "Cash",
          t.account || "",
          t.note || "",
          reconciledWithLabel(t),
          t.amount.toFixed(2)
        ]));
      });

    // Leading BOM so Excel reads the UTF-8 currency symbols correctly.
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const filename = `ledger_${viewYear}-${String(viewMonth + 1).padStart(2, "0")}.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("CSV exported");
  }

  // Expense category -> chart color. Slots 0-8 use the curated --cat-1..9
  // CSS variables; anything beyond (only reachable once a user adds a 10th
  // expense category via Settings) falls back to a generated color, since
  // the fixed CSS palette can't scale to an arbitrary user-extended list.
  function categoryColor(category) {
    let slot = lists.expenseCategoryColorSlots[category];
    if (slot === undefined) slot = 0;
    if (slot < 9) return `var(--cat-${slot + 1})`;
    return generatedCategoryColor(slot);
  }

  function generatedCategoryColor(slot) {
    const hue = (slot * 47) % 360;
    const dark = resolvedIsDark(settings.theme);
    const light = dark ? 68 : 45;
    return `hsl(${hue}, 45%, ${light}%)`;
  }

  // Builds SVG pie slices for category rows (sorted [category, amount] pairs) as a fraction of `total`.
  function buildPieSlices(rows, total) {
    const cx = 50, cy = 50, r = 45;
    if (rows.length === 1) {
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${categoryColor(rows[0][0])}"></circle>`;
    }
    let angle = -90; // start at 12 o'clock
    return rows.map(([cat, amt]) => {
      const sweep = (amt / total) * 360;
      const endAngle = angle + sweep;
      const x1 = cx + r * Math.cos(angle * Math.PI / 180);
      const y1 = cy + r * Math.sin(angle * Math.PI / 180);
      const x2 = cx + r * Math.cos(endAngle * Math.PI / 180);
      const y2 = cy + r * Math.sin(endAngle * Math.PI / 180);
      const largeArc = sweep > 180 ? 1 : 0;
      const path = `M${cx},${cy} L${x1.toFixed(3)},${y1.toFixed(3)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(3)},${y2.toFixed(3)} Z`;
      angle = endAngle;
      return `<path d="${path}" fill="${categoryColor(cat)}"></path>`;
    }).join("");
  }

  function renderBreakdown(monthTx) {
    const section = document.getElementById("breakdown");
    const list = document.getElementById("breakdownList");
    const expenses = monthTx.filter(t => t.type === "expense");

    if (expenses.length === 0) {
      section.hidden = true;
      list.innerHTML = "";
      return;
    }
    section.hidden = false;

    const rows = categoryTotals(expenses);
    const max = rows[0][1];

    list.innerHTML = rows.map(([cat, amt]) => `
      <div class="breakdown-row">
        <span class="cat-name">${escapeHtml(cat)}</span>
        <span class="breakdown-bar-track"><span class="breakdown-bar-fill" style="width:${Math.max(4, (amt / max) * 100)}%"></span></span>
        <span class="cat-amount mono">${formatMoney(amt)}</span>
      </div>
    `).join("");
  }

  function renderTargetCard(monthTx) {
    const targetCard = document.getElementById("targetCard");
    if (!settings.monthlyTarget) {
      targetCard.hidden = true;
      return;
    }
    targetCard.hidden = false;

    const expense = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    const totalDays = daysInMonth(viewYear, viewMonth);
    const target = settings.monthlyTarget;
    const pct = Math.round((expense / target) * 100);
    const remaining = target - expense;
    const fill = document.getElementById("targetBarFill");

    document.getElementById("targetPercent").textContent = pct + "%";
    fill.style.width = Math.min(100, Math.max(0, pct)) + "%";
    fill.classList.toggle("warning", pct >= 80 && pct < 100);
    fill.classList.toggle("over", pct >= 100);

    const statusEl = document.getElementById("targetStatus");
    if (remaining >= 0) {
      if (isCurrentMonth) {
        const daysLeft = Math.max(1, totalDays - today.getDate() + 1);
        const dailySafe = remaining / daysLeft;
        statusEl.textContent = `${formatMoney(remaining)} left · ${formatMoney(dailySafe)}/day for ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
      } else {
        statusEl.textContent = `${formatMoney(remaining)} under target`;
      }
    } else {
      statusEl.textContent = `${formatMoney(Math.abs(remaining))} over target`;
    }
  }

  // ---------- Credit-card bill reconciliation ----------
  function unbilledTotalsByAccount() {
    const totals = {};
    transactions.forEach(t => {
      if (t.type === "expense" && t.paymentMethod === "Credit Card" && !t.reconciledBillId) {
        const key = t.account || "";
        totals[key] = (totals[key] || 0) + t.amount;
      }
    });
    return Object.entries(totals)
      .filter(([, amt]) => amt > 0.005)
      .sort((a, b) => b[1] - a[1]);
  }

  function getCandidateCharges(account, billDate, includeOlder) {
    const windowStart = includeOlder ? null : shiftDateISO(billDate, -settings.ccSuggestWindowDays);
    return transactions.filter(t =>
      t.type === "expense" &&
      t.paymentMethod === "Credit Card" &&
      (t.account || "") === account &&
      !t.reconciledBillId &&
      t.date <= billDate &&
      (windowStart === null || t.date >= windowStart)
    ).sort((a, b) => a.date.localeCompare(b.date));
  }

  function hasAnyBillPayment() {
    return transactions.some(t => t.category === "Bills" && t.subcategory === "Credit Card");
  }

  function renderCreditCardsPanel() {
    const card = document.getElementById("ccCard");
    const rows = unbilledTotalsByAccount();
    if (rows.length === 0 && !hasAnyBillPayment()) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    document.getElementById("ccList").innerHTML = rows.length > 0 ? rows.map(([account, total]) => `
      <div class="cc-row">
        <span class="cc-account">${escapeHtml(account || "Unspecified card")}</span>
        <span class="cc-balance mono">${formatMoney(total)}</span>
        <button type="button" class="link-btn cc-pay-btn" data-account="${escapeHtml(account)}">Pay Bill</button>
      </div>
    `).join("") : `<p class="cc-empty">No unbilled charges right now.</p>`;
    document.querySelectorAll(".cc-pay-btn").forEach(btn => {
      btn.addEventListener("click", () => openBillSheet(btn.dataset.account));
    });
  }

  function renderBillHistoryScreen() {
    const bills = transactions
      .filter(t => t.category === "Bills" && t.subcategory === "Credit Card")
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    const listEl = document.getElementById("billHistoryList");
    document.getElementById("billHistoryEmpty").hidden = bills.length > 0;

    listEl.innerHTML = bills.map(bill => {
      const linked = transactions.filter(t => t.reconciledBillId === bill.id);
      return `
        <div class="bill-history-item">
          <button type="button" class="bill-history-row" data-id="${bill.id}">
            <span class="bill-candidate-main">
              <span class="bill-candidate-date">${bill.date}</span>
              <span class="bill-candidate-note">${escapeHtml(bill.note || "Credit Card Bill")}</span>
            </span>
            <span class="bill-history-meta">
              <span class="bill-candidate-amount mono">${formatMoney(bill.amount)}</span>
              <span class="bill-history-count" aria-label="${linked.length} charge${linked.length === 1 ? "" : "s"}">
                <svg class="count-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="12" height="15" rx="2"/><path d="M4 8v11a2 2 0 0 0 2 2h11"/></svg>
                ${linked.length}
              </span>
            </span>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="linked-charges-list" hidden>
            ${linked.length > 0 ? renderChargeRows(linked) : `<p class="bill-history-none">No charges linked to this payment.</p>`}
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll(".bill-history-row").forEach(row => {
      row.addEventListener("click", () => {
        const details = row.nextElementSibling;
        details.hidden = !details.hidden;
        row.classList.toggle("open", !details.hidden);
      });
    });
  }

  function renderDashboardScreen() {
    const monthTx = getMonthTransactions();
    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    const totalDays = daysInMonth(viewYear, viewMonth);
    const expense = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

    document.getElementById("dashboardEmpty").hidden = transactions.length > 0;

    // Quick insights: top category + average daily spend, for the month last viewed
    const insightRow = document.getElementById("insightRow");
    const expenses = monthTx.filter(t => t.type === "expense");
    const rows = categoryTotals(expenses);

    if (expenses.length === 0) {
      insightRow.innerHTML = "";
    } else {
      const topCategory = rows[0];
      const elapsedDays = isCurrentMonth ? today.getDate() : totalDays;
      const avgDaily = expense / elapsedDays;

      insightRow.innerHTML = `
        <div class="insight-chip">
          <span class="insight-label">Top category (${escapeHtml(MONTH_NAMES[viewMonth].slice(0, 3))})</span>
          <span class="insight-value">${escapeHtml(topCategory[0])} <span class="mono">${formatMoney(topCategory[1])}</span></span>
        </div>
        <div class="insight-chip">
          <span class="insight-label">Avg / day</span>
          <span class="insight-value mono">${formatMoney(avgDaily)}</span>
        </div>
      `;
    }

    // Spending-by-category pie chart, for the same month
    const pieCard = document.getElementById("pieCard");
    if (expenses.length === 0) {
      pieCard.hidden = true;
    } else {
      pieCard.hidden = false;
      document.getElementById("pieLabel").textContent = `Spending by category (${MONTH_NAMES[viewMonth].slice(0, 3)})`;
      document.getElementById("pieSlices").innerHTML = buildPieSlices(rows, expense);
      document.getElementById("pieLegend").innerHTML = rows.map(([cat, amt]) => `
        <div class="pie-legend-row">
          <span class="pie-swatch" style="background:${categoryColor(cat)}"></span>
          <span class="pie-legend-name">${escapeHtml(cat)}</span>
          <span class="pie-legend-pct mono">${Math.round((amt / expense) * 100)}%</span>
          <span class="pie-legend-amt mono">${formatMoney(amt)}</span>
        </div>
      `).join("");
    }

    // 6-month trend, ending on the month last viewed — tap a bar to jump there
    const trendCard = document.getElementById("trendCard");
    const months = [];
    for (let i = 5; i >= 0; i--) {
      let m = viewMonth - i, y = viewYear;
      while (m < 0) { m += 12; y--; }
      const tx = getTransactionsForMonth(y, m);
      const total = tx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      months.push({ year: y, month: m, total });
    }
    const hasTrendData = months.some(m => m.total > 0);
    if (!hasTrendData) {
      trendCard.hidden = true;
    } else {
      trendCard.hidden = false;
      const max = Math.max(...months.map(m => m.total), 1);
      const trendBars = document.getElementById("trendBars");
      trendBars.innerHTML = months.map(m => `
        <button type="button" class="trend-bar-col" data-year="${m.year}" data-month="${m.month}" aria-label="${MONTH_NAMES[m.month]} ${m.year}, ${formatMoney(m.total)} spent">
          <div class="trend-bar-track">
            <div class="trend-bar-fill ${m.year === viewYear && m.month === viewMonth ? "current" : ""}" style="height:${Math.max(2, (m.total / max) * 100)}%"></div>
          </div>
          <span class="trend-bar-label">${MONTH_NAMES[m.month].slice(0, 3)}</span>
        </button>
      `).join("");
      trendBars.querySelectorAll(".trend-bar-col").forEach(btn => {
        btn.addEventListener("click", () => {
          viewYear = parseInt(btn.dataset.year, 10);
          viewMonth = parseInt(btn.dataset.month, 10);
          renderAll();
          showScreen("month");
        });
      });
    }

    renderCreditCardsPanel();
  }

  // ---------- Screen switching ----------
  let currentScreen = "month";
  const SCREENS = {
    month: document.getElementById("monthScreen"),
    dashboard: document.getElementById("dashboardScreen"),
    billHistory: document.getElementById("billHistoryScreen"),
    templates: document.getElementById("templatesScreen"),
    settings: document.getElementById("settingsScreen")
  };
  const goToTodayBtn = document.getElementById("goToTodayBtn");
  const exportBtn = document.getElementById("exportBtn");
  const addBtn = document.getElementById("addBtn");

  function showScreen(name) {
    currentScreen = name;
    Object.entries(SCREENS).forEach(([key, el]) => { el.hidden = key !== name; });
    addBtn.hidden = name !== "month";
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.screen === name));
    if (name === "dashboard") renderDashboardScreen();
    if (name === "billHistory") renderBillHistoryScreen();
    if (name === "templates") renderTemplatesScreen();
    if (name === "settings") syncSettingsUI();
  }

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => showScreen(tab.dataset.screen));
  });
  document.getElementById("viewBillHistoryBtn").addEventListener("click", () => showScreen("billHistory"));
  document.getElementById("billHistoryBackBtn").addEventListener("click", () => showScreen("dashboard"));
  goToTodayBtn.addEventListener("click", () => {
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    renderAll();
    showScreen("month");
  });
  exportBtn.addEventListener("click", exportMonthCSV);

  function renderList(monthTx) {
    const listEl = document.getElementById("txList");
    if (monthTx.length === 0) {
      listEl.innerHTML = `<p class="empty-state">No transactions yet this month. Tap + to add your first one.</p>`;
      return;
    }

    const sorted = [...monthTx].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const groups = [];
    let lastDate = null;
    sorted.forEach(t => {
      if (t.date !== lastDate) {
        groups.push({ date: t.date, items: [] });
        lastDate = t.date;
      }
      groups[groups.length - 1].items.push(t);
    });

    listEl.innerHTML = groups.map(g => `
      <div class="tx-date-group">${dateLabel(g.date)}</div>
      ${g.items.map(t => `
        <button class="tx-row" data-id="${t.id}">
          <span class="tx-dot ${t.type}"></span>
          <span class="tx-main">
            <span class="tx-category">${escapeHtml(t.category)}</span>
            ${t.note ? `<span class="tx-note">${escapeHtml(t.note)}</span>` : ""}
          </span>
          <span class="tx-amount ${t.type} mono">${t.type === "expense" ? "-" : "+"}${currencySymbol()}${formatNumber(t.amount)}</span>
        </button>
      `).join("")}
    `).join("");

    listEl.querySelectorAll(".tx-row").forEach(row => {
      row.addEventListener("click", () => openSheet("edit", row.dataset.id));
    });
  }

  function renderAll() {
    renderMonthLabel();
    const monthTx = getMonthTransactions();
    renderSummary(monthTx);
    renderTargetCard(monthTx);
    renderBreakdown(monthTx);
    renderList(monthTx);
    if (currentScreen === "dashboard") renderDashboardScreen();
  }

  // ---------- Templates screen ----------
  // Templates are dateless, flat, and unlinked to transactions created from
  // them (applying one is a one-time copy) — see PROJECT.md's data model.
  function templateLabel(t) {
    let label = t.subcategory ? `${t.category} · ${t.subcategory}` : t.category;
    if (t.note) label += ` — ${t.note}`;
    return label;
  }

  function renderTemplateRow(t) {
    const metaParts = [];
    if (t.note) metaParts.push(t.note);
    if (t.paymentMethod) metaParts.push(t.paymentMethod);
    if (t.account) metaParts.push(t.account);
    const amountClass = t.amount != null ? `tx-amount ${t.type} mono` : "tx-amount mono";
    const amountText = t.amount != null
      ? (t.type === "expense" ? "-" : "+") + currencySymbol() + formatNumber(t.amount)
      : "—";
    return `
      <button class="tx-row" data-id="${t.id}">
        <span class="tx-dot ${t.type}"></span>
        <span class="tx-main">
          <span class="tx-category">${escapeHtml(t.category)}${t.subcategory ? " · " + escapeHtml(t.subcategory) : ""}</span>
          ${metaParts.length ? `<span class="tx-note">${escapeHtml(metaParts.join(" · "))}</span>` : ""}
        </span>
        <span class="${amountClass}">${amountText}</span>
      </button>
    `;
  }

  function renderTemplatesScreen() {
    const listEl = document.getElementById("templateList");
    if (templates.length === 0) {
      listEl.innerHTML = `<p class="empty-state">No templates yet. Tap + Add to create one from a recurring income or expense.</p>`;
      return;
    }
    listEl.innerHTML = templates.map(renderTemplateRow).join("");
    listEl.querySelectorAll(".tx-row").forEach(row => {
      row.addEventListener("click", () => openTemplateSheet("edit", row.dataset.id));
    });
  }

  // ---------- Sheet (add/edit form) ----------
  const backdrop = document.getElementById("sheetBackdrop");
  const form = document.getElementById("txForm");
  const templatePickerField = document.getElementById("templatePickerField");
  const templatePickerInput = document.getElementById("templatePickerInput");
  const amountInput = document.getElementById("amountInput");
  const categoryInput = document.getElementById("categoryInput");
  const subcategoryInput = document.getElementById("subcategoryInput");
  const paymentMethodInput = document.getElementById("paymentMethodInput");
  const accountInput = document.getElementById("accountInput");
  const noteInput = document.getElementById("noteInput");
  const dateInput = document.getElementById("dateInput");
  const formError = document.getElementById("formError");
  const deleteBtn = document.getElementById("deleteBtn");
  const sheetTitle = document.getElementById("sheetTitle");
  const linkedChargesSection = document.getElementById("linkedChargesSection");
  const linkedChargesToggle = document.getElementById("linkedChargesToggle");
  const linkedChargesList = document.getElementById("linkedChargesList");

  setupAutosuggest(subcategoryInput, document.getElementById("subcategorySuggestions"), "subcategory");
  setupAutosuggest(accountInput, document.getElementById("accountSuggestions"), "account");

  function populateCategories() {
    const list = currentType === "expense" ? lists.expenseCategories : lists.incomeCategories;
    categoryInput.innerHTML = list.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  function populatePaymentMethodOptions(selectEl) {
    selectEl.innerHTML = lists.paymentMethods.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  }

  function populateTemplatePicker() {
    const matching = templates.filter(t => t.type === currentType);
    templatePickerInput.innerHTML = `<option value="">Use a template (optional)</option>` +
      matching.map(t => `<option value="${t.id}">${escapeHtml(templateLabel(t))}</option>`).join("");
  }

  function setType(type) {
    currentType = type;
    document.querySelectorAll("#typeToggle .type-btn").forEach(b => b.classList.toggle("active", b.dataset.type === type));
    populateCategories();
    populateTemplatePicker();
  }

  function renderChargeRows(charges) {
    return [...charges].sort((a, b) => a.date.localeCompare(b.date)).map(t => `
      <div class="linked-charge-row">
        <span class="bill-candidate-main">
          <span class="bill-candidate-date">${t.date}</span>
          <span class="bill-candidate-note">${escapeHtml(t.category)}${t.note ? " · " + escapeHtml(t.note) : ""}</span>
        </span>
        <span class="bill-candidate-amount mono">${formatMoney(t.amount)}</span>
      </div>
    `).join("");
  }

  function openSheet(mode, id) {
    formError.hidden = true;
    templatePickerField.hidden = mode !== "add";
    if (mode === "edit") {
      const tx = transactions.find(t => t.id === id);
      if (!tx) return;
      editingId = id;
      sheetTitle.textContent = "Edit transaction";
      setType(tx.type);
      amountInput.value = tx.amount;
      categoryInput.value = tx.category;
      subcategoryInput.value = tx.subcategory || "";
      paymentMethodInput.value = tx.paymentMethod || "Cash";
      accountInput.value = tx.account || "";
      noteInput.value = tx.note || "";
      dateInput.value = tx.date;
      deleteBtn.hidden = false;

      const linked = transactions.filter(t => t.reconciledBillId === id);
      if (linked.length > 0) {
        linkedChargesSection.hidden = false;
        linkedChargesToggle.textContent = `Includes ${linked.length} charge${linked.length === 1 ? "" : "s"} — View`;
        linkedChargesList.hidden = true;
        linkedChargesList.innerHTML = renderChargeRows(linked);
      } else {
        linkedChargesSection.hidden = true;
      }
    } else {
      editingId = null;
      sheetTitle.textContent = "Add transaction";
      setType("expense");
      templatePickerInput.value = "";
      amountInput.value = "";
      subcategoryInput.value = "";
      paymentMethodInput.value = "Cash";
      accountInput.value = "";
      noteInput.value = "";
      dateInput.value = todayISO();
      deleteBtn.hidden = true;
      linkedChargesSection.hidden = true;
    }
    backdrop.classList.add("open");
    setTimeout(() => amountInput.focus(), 200);
  }

  function closeSheet() {
    backdrop.classList.remove("open");
  }

  addBtn.addEventListener("click", () => openSheet("add"));
  document.getElementById("cancelBtn").addEventListener("click", closeSheet);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeSheet(); });

  linkedChargesToggle.addEventListener("click", () => {
    linkedChargesList.hidden = !linkedChargesList.hidden;
  });

  document.getElementById("typeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".type-btn");
    if (btn) setType(btn.dataset.type);
  });

  templatePickerInput.addEventListener("change", () => {
    const id = templatePickerInput.value;
    if (!id) return;
    const t = templates.find(tpl => tpl.id === id);
    if (t) {
      categoryInput.value = t.category;
      subcategoryInput.value = t.subcategory || "";
      paymentMethodInput.value = t.paymentMethod || "Cash";
      accountInput.value = t.account || "";
      noteInput.value = t.note || "";
      if (t.amount != null) amountInput.value = t.amount;
    }
    templatePickerInput.value = ""; // one-time apply — not a sticky/bound selection
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat(amountInput.value);
    const category = categoryInput.value;
    const subcategory = subcategoryInput.value.trim();
    const paymentMethod = paymentMethodInput.value;
    const account = accountInput.value.trim();
    const date = dateInput.value;

    if (!amount || amount <= 0) {
      formError.textContent = "Enter an amount greater than 0.";
      formError.hidden = false;
      amountInput.focus();
      return;
    }
    if (!date) {
      formError.textContent = "Choose a date.";
      formError.hidden = false;
      dateInput.focus();
      return;
    }

    const isEdit = !!editingId;
    if (editingId) {
      const tx = transactions.find(t => t.id === editingId);
      Object.assign(tx, { type: currentType, amount, category, subcategory, note: noteInput.value.trim(), date, paymentMethod, account });
    } else {
      transactions.push({
        id: uid(),
        type: currentType,
        amount,
        category,
        subcategory,
        note: noteInput.value.trim(),
        date,
        paymentMethod,
        account
      });
    }
    const saved = saveTransactions();
    closeSheet();

    // Jump the visible month to the transaction's date so the user sees it.
    const d = new Date(date + "T00:00:00");
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    renderAll();
    if (saved) showToast(isEdit ? "Transaction updated" : "Transaction added");
  });

  deleteBtn.addEventListener("click", () => {
    if (!editingId) return;
    // Unlink any charges this transaction had settled, rather than leaving
    // dangling reconciledBillId references — they become unbilled again.
    transactions.forEach(t => { if (t.reconciledBillId === editingId) delete t.reconciledBillId; });
    transactions = transactions.filter(t => t.id !== editingId);
    const saved = saveTransactions();
    closeSheet();
    renderAll();
    if (saved) showToast("Transaction deleted");
  });

  // ---------- Pay Card Bill sheet ----------
  const billBackdrop = document.getElementById("billSheetBackdrop");
  const billForm = document.getElementById("billForm");
  const billSheetTitle = document.getElementById("billSheetTitle");
  const billDateInput = document.getElementById("billDateInput");
  const billAmountInput = document.getElementById("billAmountInput");
  const billPaymentMethodInput = document.getElementById("billPaymentMethodInput");
  const billPaidAccountInput = document.getElementById("billPaidAccountInput");
  const billCandidatesList = document.getElementById("billCandidatesList");
  const billCandidatesEmpty = document.getElementById("billCandidatesEmpty");
  const billSelectedCount = document.getElementById("billSelectedCount");
  const billRunningSum = document.getElementById("billRunningSum");
  const billVariance = document.getElementById("billVariance");
  const billShowOlderToggle = document.getElementById("billShowOlderToggle");
  const billFormError = document.getElementById("billFormError");
  const billCancelBtn = document.getElementById("billCancelBtn");

  setupAutosuggest(billPaidAccountInput, document.getElementById("billPaidAccountSuggestions"), "account");

  function ensureBillsCategoryExists() {
    if (!lists.expenseCategories.includes("Bills")) {
      lists.expenseCategories.push("Bills");
      if (lists.expenseCategoryColorSlots["Bills"] === undefined) {
        lists.expenseCategoryColorSlots["Bills"] = lists.nextExpenseColorSlot++;
      }
      saveLists();
      if (currentType === "expense") populateCategories();
    }
  }

  function openBillSheet(account) {
    currentBillAccount = account;
    billShowOlder = false;
    billShowOlderToggle.textContent = "Show older charges";
    billFormError.hidden = true;
    billDateInput.value = todayISO();
    billAmountInput.value = "";
    billPaymentMethodInput.value = "Transfer";
    billPaidAccountInput.value = "";
    billSheetTitle.textContent = account ? `Pay Bill — ${account}` : "Pay Bill — Unspecified card";
    billCheckedIds = new Set(getCandidateCharges(account, billDateInput.value, false).map(t => t.id));
    renderBillCandidates();
    billBackdrop.classList.add("open");
  }

  function closeBillSheet() {
    billBackdrop.classList.remove("open");
  }

  function renderBillCandidates() {
    const candidates = getCandidateCharges(currentBillAccount, billDateInput.value || todayISO(), billShowOlder);
    billCandidatesEmpty.hidden = candidates.length > 0;
    billCandidatesList.innerHTML = candidates.map(t => `
      <label class="bill-candidate-row">
        <input type="checkbox" class="bill-candidate-checkbox" data-id="${t.id}" ${billCheckedIds.has(t.id) ? "checked" : ""}>
        <span class="bill-candidate-main">
          <span class="bill-candidate-date">${t.date}</span>
          <span class="bill-candidate-note">${escapeHtml(t.category)}${t.note ? " · " + escapeHtml(t.note) : ""}</span>
        </span>
        <span class="bill-candidate-amount mono">${formatMoney(t.amount)}</span>
      </label>
    `).join("");
    billCandidatesList.querySelectorAll(".bill-candidate-checkbox").forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) billCheckedIds.add(cb.dataset.id);
        else billCheckedIds.delete(cb.dataset.id);
        updateBillSummary();
      });
    });
    updateBillSummary();
  }

  function updateBillSummary() {
    const sum = transactions.filter(t => billCheckedIds.has(t.id)).reduce((s, t) => s + t.amount, 0);
    billSelectedCount.textContent = billCheckedIds.size;
    billRunningSum.textContent = formatMoney(sum);
    const stated = parseFloat(billAmountInput.value);
    billVariance.classList.remove("over", "short");
    if (isNaN(stated)) {
      billVariance.textContent = "—";
    } else {
      const variance = stated - sum;
      billVariance.textContent = formatMoney(variance);
      if (variance < -0.005) billVariance.classList.add("over");
      else if (variance > 0.005) billVariance.classList.add("short");
    }
  }

  billDateInput.addEventListener("change", () => {
    billShowOlder = false;
    billShowOlderToggle.textContent = "Show older charges";
    billCheckedIds = new Set(getCandidateCharges(currentBillAccount, billDateInput.value, false).map(t => t.id));
    renderBillCandidates();
  });

  billAmountInput.addEventListener("input", updateBillSummary);

  billShowOlderToggle.addEventListener("click", () => {
    billShowOlder = !billShowOlder;
    billShowOlderToggle.textContent = billShowOlder ? "Hide older charges" : "Show older charges";
    renderBillCandidates();
  });

  billCancelBtn.addEventListener("click", closeBillSheet);
  billBackdrop.addEventListener("click", (e) => { if (e.target === billBackdrop) closeBillSheet(); });

  billForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat(billAmountInput.value);
    const date = billDateInput.value;

    if (!amount || amount <= 0) {
      billFormError.textContent = "Enter an amount greater than 0.";
      billFormError.hidden = false;
      billAmountInput.focus();
      return;
    }
    if (!date) {
      billFormError.textContent = "Choose a date.";
      billFormError.hidden = false;
      billDateInput.focus();
      return;
    }

    ensureBillsCategoryExists();

    const accountLabel = currentBillAccount || "Unspecified card";
    const newTx = {
      id: uid(),
      type: "expense",
      amount,
      category: "Bills",
      subcategory: "Credit Card",
      note: `${accountLabel} Credit Card Bill`,
      date,
      paymentMethod: billPaymentMethodInput.value,
      account: billPaidAccountInput.value.trim()
    };
    transactions.push(newTx);
    transactions.forEach(t => { if (billCheckedIds.has(t.id)) t.reconciledBillId = newTx.id; });
    const saved = saveTransactions();
    closeBillSheet();
    renderAll();
    if (saved) showToast("Bill payment recorded");
  });

  // ---------- Template sheet ----------
  const templateBackdrop = document.getElementById("templateSheetBackdrop");
  const templateForm = document.getElementById("templateForm");
  const templateSheetTitle = document.getElementById("templateSheetTitle");
  const templateCategoryInput = document.getElementById("templateCategoryInput");
  const templateSubcategoryInput = document.getElementById("templateSubcategoryInput");
  const templatePaymentMethodInput = document.getElementById("templatePaymentMethodInput");
  const templateAccountInput = document.getElementById("templateAccountInput");
  const templateNoteInput = document.getElementById("templateNoteInput");
  const templateAmountInput = document.getElementById("templateAmountInput");
  const templateFormError = document.getElementById("templateFormError");
  const templateDeleteBtn = document.getElementById("templateDeleteBtn");
  const templateCancelBtn = document.getElementById("templateCancelBtn");
  const addTemplateBtn = document.getElementById("addTemplateBtn");

  setupAutosuggest(templateSubcategoryInput, document.getElementById("templateSubcategorySuggestions"), "subcategory");
  setupAutosuggest(templateAccountInput, document.getElementById("templateAccountSuggestions"), "account");

  function populateTemplateCategories() {
    const list = templateType === "expense" ? lists.expenseCategories : lists.incomeCategories;
    templateCategoryInput.innerHTML = list.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  function setTemplateType(type) {
    templateType = type;
    document.querySelectorAll("#templateTypeToggle .type-btn").forEach(b => b.classList.toggle("active", b.dataset.type === type));
    populateTemplateCategories();
  }

  function openTemplateSheet(mode, id) {
    templateFormError.hidden = true;
    if (mode === "edit") {
      const t = templates.find(tpl => tpl.id === id);
      if (!t) return;
      editingTemplateId = id;
      templateSheetTitle.textContent = "Edit template";
      setTemplateType(t.type);
      templateCategoryInput.value = t.category;
      templateSubcategoryInput.value = t.subcategory || "";
      templatePaymentMethodInput.value = t.paymentMethod || "Cash";
      templateAccountInput.value = t.account || "";
      templateNoteInput.value = t.note || "";
      templateAmountInput.value = t.amount != null ? t.amount : "";
      templateDeleteBtn.hidden = false;
    } else {
      editingTemplateId = null;
      templateSheetTitle.textContent = "Add template";
      setTemplateType("expense");
      templateSubcategoryInput.value = "";
      templatePaymentMethodInput.value = "Cash";
      templateAccountInput.value = "";
      templateNoteInput.value = "";
      templateAmountInput.value = "";
      templateDeleteBtn.hidden = true;
    }
    templateBackdrop.classList.add("open");
  }

  function closeTemplateSheet() {
    templateBackdrop.classList.remove("open");
  }

  addTemplateBtn.addEventListener("click", () => openTemplateSheet("add"));
  templateCancelBtn.addEventListener("click", closeTemplateSheet);
  templateBackdrop.addEventListener("click", (e) => { if (e.target === templateBackdrop) closeTemplateSheet(); });

  document.getElementById("templateTypeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".type-btn");
    if (btn) setTemplateType(btn.dataset.type);
  });

  templateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const category = templateCategoryInput.value;
    const subcategory = templateSubcategoryInput.value.trim();
    const paymentMethod = templatePaymentMethodInput.value;
    const account = templateAccountInput.value.trim();
    const note = templateNoteInput.value.trim();
    const amountRaw = templateAmountInput.value.trim();
    let amount = null;
    if (amountRaw !== "") {
      const parsed = parseFloat(amountRaw);
      if (isNaN(parsed) || parsed <= 0) {
        templateFormError.textContent = "Amount must be greater than 0, or left blank.";
        templateFormError.hidden = false;
        templateAmountInput.focus();
        return;
      }
      amount = parsed;
    }

    const isEdit = !!editingTemplateId;
    if (editingTemplateId) {
      const t = templates.find(tpl => tpl.id === editingTemplateId);
      Object.assign(t, { type: templateType, category, subcategory, paymentMethod, account, note, amount });
    } else {
      templates.push({ id: uid(), type: templateType, category, subcategory, paymentMethod, account, note, amount });
    }
    const saved = saveTemplates();
    closeTemplateSheet();
    renderTemplatesScreen();
    populateTemplatePicker();
    if (saved) showToast(isEdit ? "Template updated" : "Template saved");
  });

  templateDeleteBtn.addEventListener("click", () => {
    if (!editingTemplateId) return;
    templates = templates.filter(t => t.id !== editingTemplateId);
    const saved = saveTemplates();
    closeTemplateSheet();
    renderTemplatesScreen();
    populateTemplatePicker();
    if (saved) showToast("Template deleted");
  });

  // ---------- Import CSV ----------
  // Accepts a plain transactions CSV (header row + data rows, columns
  // matched by name not position) — not the multi-section Export CSV file,
  // though Export's own Transactions section happens to be a subset of this
  // shape, so re-importing an exported file works without editing it first.
  const IMPORT_COLUMN_MAP = {
    "date": "date",
    "type": "type",
    "category": "category",
    "subcategory": "subcategory",
    "payment method": "paymentMethod",
    "account": "account",
    "note": "note",
    "reconciled with": "reconciledWith",
    "amount": "amount"
  };

  // Proper quoted-field CSV reader: handles embedded commas/newlines and
  // escaped "" inside quotes, which a naive split(",") would corrupt.
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip UTF-8 BOM (Export writes one)
    const rows = [];
    let row = [], field = "", inQuotes = false;
    let i = 0;
    const len = text.length;
    while (i < len) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r" || c === "\n") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
        i++; continue;
      }
      field += c; i++;
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  function buildImportHeaderIndex(headerRow) {
    const index = {};
    headerRow.forEach((h, i) => {
      const key = IMPORT_COLUMN_MAP[h.trim().toLowerCase()];
      if (key) index[key] = i;
    });
    return index;
  }

  function importCell(rawRow, headerIndex, key) {
    const idx = headerIndex[key];
    if (idx === undefined || idx >= rawRow.length) return "";
    return (rawRow[idx] || "").trim();
  }

  function isValidISODate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12) return false;
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  function parseImportAmount(raw) {
    if (!raw) return NaN;
    const cleaned = raw.replace(/[^0-9.\-]/g, "");
    if (!cleaned) return NaN;
    return parseFloat(cleaned);
  }

  // Maps one raw data row to a transaction-shaped object, or a rejection
  // reason. Category/Payment Method are never rejected here — an unknown
  // value is auto-created at confirm time (see buildImportPreview).
  function parseImportRow(headerIndex, rawRow) {
    const dateRaw = importCell(rawRow, headerIndex, "date");
    if (!isValidISODate(dateRaw)) return { ok: false, reason: "Missing or invalid Date" };

    const typeRaw = importCell(rawRow, headerIndex, "type").toLowerCase();
    if (typeRaw !== "income" && typeRaw !== "expense") return { ok: false, reason: "Type must be Income or Expense" };

    const category = importCell(rawRow, headerIndex, "category");
    if (!category) return { ok: false, reason: "Missing Category" };

    const amount = parseImportAmount(importCell(rawRow, headerIndex, "amount"));
    if (isNaN(amount) || amount <= 0) return { ok: false, reason: "Missing or invalid Amount" };

    return {
      ok: true,
      reconciledWithRaw: importCell(rawRow, headerIndex, "reconciledWith"),
      tx: {
        type: typeRaw,
        amount,
        category,
        subcategory: importCell(rawRow, headerIndex, "subcategory"),
        paymentMethod: importCell(rawRow, headerIndex, "paymentMethod") || "Cash",
        account: importCell(rawRow, headerIndex, "account"),
        note: importCell(rawRow, headerIndex, "note"),
        date: dateRaw
      }
    };
  }

  function rejectedRowLabel(raw) {
    const cells = raw.filter(c => c.trim() !== "").slice(0, 3);
    return cells.length ? cells.join(", ") : "(blank row)";
  }

  // Parses the whole file and computes everything the preview needs:
  // valid/rejected rows, which list values would be auto-created, how many
  // Reconciled With links resolve within this file, and summary totals.
  // Nothing is written to state here — that only happens on confirm.
  function hasRequiredImportColumns(headerIndex) {
    return headerIndex.date !== undefined && headerIndex.type !== undefined &&
      headerIndex.category !== undefined && headerIndex.amount !== undefined;
  }

  function buildImportPreview(text) {
    const rows = parseCSV(text).filter(r => r.some(c => c.trim() !== ""));
    if (rows.length === 0) return { headerError: "The file appears to be empty." };

    // Scan for the header row rather than assuming row 0, so the app's own
    // multi-section Export CSV (title/summary/category-breakdown preamble
    // before the Transactions header) can be re-imported directly, not just
    // a standalone header-first transactions CSV.
    let headerRowIdx = -1, headerIndex = null;
    for (let i = 0; i < rows.length; i++) {
      const candidate = buildImportHeaderIndex(rows[i]);
      if (hasRequiredImportColumns(candidate)) { headerRowIdx = i; headerIndex = candidate; break; }
    }
    if (headerRowIdx === -1) {
      return { headerError: "The file is missing one or more required columns (Date, Type, Category, Amount)." };
    }

    const validRows = [], rejectedRows = [];
    rows.slice(headerRowIdx + 1).forEach(raw => {
      const result = parseImportRow(headerIndex, raw);
      if (result.ok) validRows.push(result);
      else rejectedRows.push({ row: raw, reason: result.reason });
    });

    const seenExpense = new Set(lists.expenseCategories);
    const seenIncome = new Set(lists.incomeCategories);
    const seenPM = new Set(lists.paymentMethods);
    const newExpenseCategories = [], newIncomeCategories = [], newPaymentMethods = [];
    validRows.forEach(({ tx }) => {
      if (tx.type === "expense") {
        if (!seenExpense.has(tx.category) && !newExpenseCategories.includes(tx.category)) newExpenseCategories.push(tx.category);
      } else if (!seenIncome.has(tx.category) && !newIncomeCategories.includes(tx.category)) {
        newIncomeCategories.push(tx.category);
      }
      if (tx.paymentMethod && !seenPM.has(tx.paymentMethod) && !newPaymentMethods.includes(tx.paymentMethod)) {
        newPaymentMethods.push(tx.paymentMethod);
      }
    });

    const lookup = new Set(validRows.map(({ tx }) => tx.date + " — " + tx.note));
    let reconciledCount = 0, reconciledResolvedCount = 0;
    validRows.forEach(({ reconciledWithRaw }) => {
      if (reconciledWithRaw) {
        reconciledCount++;
        if (lookup.has(reconciledWithRaw)) reconciledResolvedCount++;
      }
    });

    let totalIncome = 0, totalExpense = 0, dateMin = null, dateMax = null;
    validRows.forEach(({ tx }) => {
      if (tx.type === "income") totalIncome += tx.amount; else totalExpense += tx.amount;
      if (dateMin === null || tx.date < dateMin) dateMin = tx.date;
      if (dateMax === null || tx.date > dateMax) dateMax = tx.date;
    });

    return {
      validRows, rejectedRows,
      newExpenseCategories, newIncomeCategories, newPaymentMethods,
      reconciledCount, reconciledResolvedCount,
      totalIncome, totalExpense, dateMin, dateMax
    };
  }

  const importBackdrop = document.getElementById("importSheetBackdrop");
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFileInput");
  const importError = document.getElementById("importError");
  const importSummaryBody = document.getElementById("importSummaryBody");
  const importRowSummary = document.getElementById("importRowSummary");
  const importRejectedBlock = document.getElementById("importRejectedBlock");
  const importErrorList = document.getElementById("importErrorList");
  const importNewValuesBlock = document.getElementById("importNewValuesBlock");
  const importNewValuesList = document.getElementById("importNewValuesList");
  const importReconciledSummary = document.getElementById("importReconciledSummary");
  const importTotalIncome = document.getElementById("importTotalIncome");
  const importTotalExpense = document.getElementById("importTotalExpense");
  const importDateRange = document.getElementById("importDateRange");
  const importCancelBtn = document.getElementById("importCancelBtn");
  const importConfirmBtn = document.getElementById("importConfirmBtn");

  let importParseResult = null;

  function renderImportPreview(result) {
    if (result.headerError) {
      importError.hidden = false;
      importError.textContent = result.headerError;
      importSummaryBody.hidden = true;
      importConfirmBtn.disabled = true;
      return;
    }
    importError.hidden = true;
    importSummaryBody.hidden = false;

    const total = result.validRows.length + result.rejectedRows.length;
    importRowSummary.textContent = `${result.validRows.length} of ${total} row${total === 1 ? "" : "s"} ready to import`;

    if (result.rejectedRows.length > 0) {
      importRejectedBlock.hidden = false;
      const shown = result.rejectedRows.slice(0, 10);
      importErrorList.innerHTML = shown.map(r => `<li>${escapeHtml(rejectedRowLabel(r.row))} — ${escapeHtml(r.reason)}</li>`).join("")
        + (result.rejectedRows.length > shown.length ? `<li>…and ${result.rejectedRows.length - shown.length} more</li>` : "");
    } else {
      importRejectedBlock.hidden = true;
      importErrorList.innerHTML = "";
    }

    const newValueLines = [];
    if (result.newExpenseCategories.length) newValueLines.push(`Expense categor${result.newExpenseCategories.length === 1 ? "y" : "ies"}: ${result.newExpenseCategories.join(", ")}`);
    if (result.newIncomeCategories.length) newValueLines.push(`Income categor${result.newIncomeCategories.length === 1 ? "y" : "ies"}: ${result.newIncomeCategories.join(", ")}`);
    if (result.newPaymentMethods.length) newValueLines.push(`Payment method${result.newPaymentMethods.length === 1 ? "" : "s"}: ${result.newPaymentMethods.join(", ")}`);
    if (newValueLines.length > 0) {
      importNewValuesBlock.hidden = false;
      importNewValuesList.innerHTML = newValueLines.map(l => `<li>${escapeHtml(l)}</li>`).join("");
    } else {
      importNewValuesBlock.hidden = true;
      importNewValuesList.innerHTML = "";
    }

    if (result.reconciledCount > 0) {
      importReconciledSummary.hidden = false;
      const unresolved = result.reconciledCount - result.reconciledResolvedCount;
      importReconciledSummary.textContent = unresolved > 0
        ? `${result.reconciledResolvedCount} charge${result.reconciledResolvedCount === 1 ? "" : "s"} will be linked to a bill payment in this file; ${unresolved} reference${unresolved === 1 ? "s" : ""} a bill not included and will stay unbilled.`
        : `${result.reconciledResolvedCount} charge${result.reconciledResolvedCount === 1 ? "" : "s"} will be linked to a bill payment in this file.`;
    } else {
      importReconciledSummary.hidden = true;
    }

    importTotalIncome.textContent = formatMoney(result.totalIncome);
    importTotalExpense.textContent = formatMoney(result.totalExpense);
    importDateRange.textContent = result.dateMin ? `${result.dateMin} to ${result.dateMax}` : "—";

    importConfirmBtn.disabled = result.validRows.length === 0;
  }

  function openImportSheet(text) {
    importParseResult = buildImportPreview(text);
    renderImportPreview(importParseResult);
    importBackdrop.classList.add("open");
  }

  function closeImportSheet() {
    importBackdrop.classList.remove("open");
    importParseResult = null;
  }

  importBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", () => {
    const file = importFileInput.files[0];
    importFileInput.value = ""; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => openImportSheet(reader.result);
    reader.readAsText(file);
  });

  importCancelBtn.addEventListener("click", closeImportSheet);
  importBackdrop.addEventListener("click", (e) => { if (e.target === importBackdrop) closeImportSheet(); });

  importConfirmBtn.addEventListener("click", () => {
    const result = importParseResult;
    if (!result || result.headerError || result.validRows.length === 0) return;

    result.newExpenseCategories.forEach(v => addListValue("expenseCategories", v));
    result.newIncomeCategories.forEach(v => addListValue("incomeCategories", v));
    result.newPaymentMethods.forEach(v => addListValue("paymentMethods", v));

    // Two passes: create every transaction first (so every potential "bill"
    // row has an id), then resolve Reconciled With links against them.
    const lookup = new Map();
    const created = result.validRows.map(({ tx, reconciledWithRaw }) => {
      const newTx = { id: uid(), ...tx };
      transactions.push(newTx);
      lookup.set(tx.date + " — " + tx.note, newTx.id);
      return { newTx, reconciledWithRaw };
    });
    created.forEach(({ newTx, reconciledWithRaw }) => {
      if (reconciledWithRaw && lookup.has(reconciledWithRaw)) newTx.reconciledBillId = lookup.get(reconciledWithRaw);
    });

    const savedTx = saveTransactions();
    const savedLists = saveLists();
    const count = created.length;
    renderAllListEditors();
    closeImportSheet();
    renderAll();
    if (savedTx && savedLists) showToast(`Imported ${count} transaction${count === 1 ? "" : "s"}`);
  });

  // ---------- Clear Entries ----------
  const clearEntriesBackdrop = document.getElementById("clearEntriesSheetBackdrop");
  const clearEntriesBtn = document.getElementById("clearEntriesBtn");
  const clearEntriesModeToggle = document.getElementById("clearEntriesModeToggle");
  const clearEntriesDaysField = document.getElementById("clearEntriesDaysField");
  const clearEntriesDaysInput = document.getElementById("clearEntriesDaysInput");
  const clearEntriesCount = document.getElementById("clearEntriesCount");
  const clearEntriesError = document.getElementById("clearEntriesError");
  const clearEntriesCancelBtn = document.getElementById("clearEntriesCancelBtn");
  const clearEntriesConfirmBtn = document.getElementById("clearEntriesConfirmBtn");
  const clearEntriesConfirmMessage = document.getElementById("clearEntriesConfirmMessage");

  let clearEntriesMode = "all";
  let clearEntriesPending = null; // candidate transactions awaiting the "are you sure" step, or null while still choosing

  // A transaction is "linked" if it's a reconciled charge (points at a bill
  // payment) or is itself a bill payment that charges point back to.
  function isTransactionLinked(t) {
    if (t.reconciledBillId) return true;
    return transactions.some(other => other.reconciledBillId === t.id);
  }

  function getClearCandidates(mode, days) {
    if (mode === "all") return transactions.slice();
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    return transactions.filter(t => new Date(t.date + "T00:00:00") >= cutoff);
  }

  function updateClearEntriesPreview() {
    clearEntriesError.hidden = true;
    const days = parseInt(clearEntriesDaysInput.value, 10);
    if (clearEntriesMode === "days" && (!days || days <= 0)) {
      clearEntriesCount.textContent = "Enter a number of days.";
      return;
    }
    const candidates = getClearCandidates(clearEntriesMode, days);
    clearEntriesCount.textContent = `${candidates.length} entr${candidates.length === 1 ? "y" : "ies"} will be deleted.`;
  }

  // Resets the sheet to the "choose what to delete" step, hiding the
  // "are you sure" step from any previous pass.
  function resetClearEntriesStep() {
    clearEntriesPending = null;
    clearEntriesModeToggle.hidden = false;
    clearEntriesDaysField.hidden = clearEntriesMode !== "days";
    clearEntriesCount.hidden = false;
    clearEntriesError.hidden = true;
    clearEntriesConfirmMessage.hidden = true;
    clearEntriesConfirmBtn.textContent = "Clear";
  }

  function openClearEntriesSheet() {
    clearEntriesMode = "all";
    document.querySelectorAll("#clearEntriesModeToggle .type-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === "all"));
    clearEntriesDaysInput.value = "";
    resetClearEntriesStep();
    updateClearEntriesPreview();
    clearEntriesBackdrop.classList.add("open");
  }

  function closeClearEntriesSheet() {
    clearEntriesBackdrop.classList.remove("open");
  }

  clearEntriesBtn.addEventListener("click", openClearEntriesSheet);
  clearEntriesCancelBtn.addEventListener("click", closeClearEntriesSheet);
  clearEntriesBackdrop.addEventListener("click", (e) => { if (e.target === clearEntriesBackdrop) closeClearEntriesSheet(); });

  clearEntriesModeToggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".type-btn");
    if (!btn) return;
    clearEntriesMode = btn.dataset.mode;
    document.querySelectorAll("#clearEntriesModeToggle .type-btn").forEach(b => b.classList.toggle("active", b === btn));
    clearEntriesDaysField.hidden = clearEntriesMode !== "days";
    updateClearEntriesPreview();
  });

  clearEntriesDaysInput.addEventListener("input", updateClearEntriesPreview);

  // First click validates the selection and swaps in an "are you sure" step
  // (in-sheet, not window.confirm — confirm() is unreliable in a standalone
  // iOS home-screen PWA, where it can silently no-op). Second click deletes.
  clearEntriesConfirmBtn.addEventListener("click", () => {
    if (clearEntriesPending) {
      const idsToDelete = new Set(clearEntriesPending.map(t => t.id));
      const count = clearEntriesPending.length;
      transactions = transactions.filter(t => !idsToDelete.has(t.id));
      const saved = saveTransactions();
      closeClearEntriesSheet();
      renderAll();
      if (saved) showToast(`${count} entr${count === 1 ? "y" : "ies"} deleted`);
      return;
    }

    const days = parseInt(clearEntriesDaysInput.value, 10);
    if (clearEntriesMode === "days" && (!days || days <= 0)) {
      clearEntriesError.textContent = "Enter a valid number of days.";
      clearEntriesError.hidden = false;
      return;
    }

    const candidates = getClearCandidates(clearEntriesMode, days);
    if (candidates.length === 0) {
      clearEntriesError.textContent = "No entries match.";
      clearEntriesError.hidden = false;
      return;
    }

    // "all" wipes every transaction, so no link between two deleted entries
    // can be left dangling — skip the linkage check in that mode only.
    if (clearEntriesMode !== "all") {
      const linkedCount = candidates.filter(isTransactionLinked).length;
      if (linkedCount > 0) {
        clearEntriesError.textContent = `Can't clear — ${linkedCount} of these ${linkedCount === 1 ? "entry is" : "entries are"} linked to a credit card bill payment. Unlink or reconcile ${linkedCount === 1 ? "it" : "them"} individually first.`;
        clearEntriesError.hidden = false;
        return;
      }
    }

    clearEntriesPending = candidates;
    clearEntriesModeToggle.hidden = true;
    clearEntriesDaysField.hidden = true;
    clearEntriesCount.hidden = true;
    clearEntriesError.hidden = true;

    const rangeLabel = clearEntriesMode === "all" ? "ALL" : `the last ${days} day${days === 1 ? "" : "s"} of`;
    clearEntriesConfirmMessage.textContent = `Are you sure? This will permanently delete ${rangeLabel} entries (${candidates.length} total) and can't be undone.`;
    clearEntriesConfirmMessage.hidden = false;
    clearEntriesConfirmBtn.textContent = "Yes, delete";
  });

  // ---------- Theme ----------
  function resolvedIsDark(theme) {
    if (theme === "dark") return true;
    if (theme === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function applyTheme(theme) {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolvedIsDark(theme) ? "#1b1c1e" : "#20262c");
  }

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (settings.theme === "system") applyTheme("system");
    });
  }

  // ---------- Settings screen ----------
  const currencySelect = document.getElementById("currencySelect");
  const targetInput = document.getElementById("targetInput");
  const ccWindowInput = document.getElementById("ccWindowInput");

  function populateCurrencyOptions() {
    currencySelect.innerHTML = CURRENCIES.map(c => `<option value="${c.code}">${c.label}</option>`).join("");
    currencySelect.value = settings.currency;
  }

  function setThemeChoice(theme) {
    settings.theme = theme;
    document.querySelectorAll("#themeToggle .type-btn").forEach(b => b.classList.toggle("active", b.dataset.theme === theme));
    applyTheme(theme);
    saveSettings();
  }

  function syncSettingsUI() {
    document.querySelectorAll("#themeToggle .type-btn").forEach(b => b.classList.toggle("active", b.dataset.theme === settings.theme));
    currencySelect.value = settings.currency;
    targetInput.value = settings.monthlyTarget != null ? settings.monthlyTarget : "";
    ccWindowInput.value = settings.ccSuggestWindowDays;
    renderAllListEditors();
  }

  document.getElementById("themeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".type-btn");
    if (btn) setThemeChoice(btn.dataset.theme);
  });

  currencySelect.addEventListener("change", () => {
    settings.currency = currencySelect.value;
    saveSettings();
    renderAll();
  });

  targetInput.addEventListener("change", () => {
    const val = parseFloat(targetInput.value);
    settings.monthlyTarget = (targetInput.value.trim() === "" || isNaN(val) || val <= 0) ? null : val;
    saveSettings();
    renderAll();
  });

  ccWindowInput.addEventListener("change", () => {
    const val = parseInt(ccWindowInput.value, 10);
    settings.ccSuggestWindowDays = (!val || val <= 0) ? DEFAULT_SETTINGS.ccSuggestWindowDays : val;
    ccWindowInput.value = settings.ccSuggestWindowDays;
    saveSettings();
  });

  // ---------- Settings: list management (categories / payment methods) ----------
  function renderListEditor(containerEl, listKey) {
    const values = lists[listKey];
    containerEl.innerHTML = values.map(v => `
      <div class="list-editor-row" data-value="${escapeHtml(v)}">
        <span class="list-editor-value">${escapeHtml(v)}</span>
        <button type="button" class="link-btn list-editor-edit">Rename</button>
        <button type="button" class="link-btn list-editor-delete">Delete</button>
      </div>
    `).join("") + `
      <div class="list-editor-add">
        <input type="text" class="list-editor-add-input" placeholder="Add new…" maxlength="60">
        <button type="button" class="btn-secondary list-editor-add-btn">Add</button>
      </div>
    `;

    containerEl.querySelectorAll(".list-editor-row").forEach(row => {
      const value = row.dataset.value;

      row.querySelector(".list-editor-edit").addEventListener("click", () => {
        if (row.classList.contains("editing")) return;
        row.classList.add("editing");
        const valueSpan = row.querySelector(".list-editor-value");
        const input = document.createElement("input");
        input.type = "text";
        input.className = "list-editor-rename-input";
        input.value = value;
        input.maxLength = 60;
        valueSpan.replaceWith(input);
        input.focus();
        input.select();
        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const newValue = input.value.trim();
          if (newValue && newValue !== value) renameListValue(listKey, value, newValue);
          renderAllListEditors();
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); input.blur(); }
          if (e.key === "Escape") { e.preventDefault(); committed = true; renderAllListEditors(); }
        });
      });

      row.querySelector(".list-editor-delete").addEventListener("click", () => {
        const err = deleteListValue(listKey, value);
        if (err) {
          let msg = row.querySelector(".list-editor-error");
          if (!msg) {
            msg = document.createElement("div");
            msg.className = "list-editor-error";
            row.appendChild(msg);
          }
          msg.textContent = err;
        } else {
          renderAllListEditors();
        }
      });
    });

    const addInput = containerEl.querySelector(".list-editor-add-input");
    const addBtn = containerEl.querySelector(".list-editor-add-btn");
    const doAdd = () => {
      const v = addInput.value.trim();
      if (!v) return;
      addListValue(listKey, v);
      renderAllListEditors();
    };
    addBtn.addEventListener("click", doAdd);
    addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doAdd(); } });
  }

  function renderAllListEditors() {
    renderListEditor(document.getElementById("expenseCategoryList"), "expenseCategories");
    renderListEditor(document.getElementById("incomeCategoryList"), "incomeCategories");
    renderListEditor(document.getElementById("paymentMethodListMgmt"), "paymentMethods");
    populateCategories();
    populatePaymentMethodOptions(paymentMethodInput);
    populatePaymentMethodOptions(billPaymentMethodInput);
    populateTemplateCategories();
    populatePaymentMethodOptions(templatePaymentMethodInput);
  }

  // List sections start collapsed (each panel already carries `hidden` in
  // index.html) to keep Settings from being dominated by long lists.
  function setupCollapsible(toggleId, panelEl) {
    const toggle = document.getElementById(toggleId);
    toggle.addEventListener("click", () => {
      const expanded = !panelEl.hidden;
      panelEl.hidden = expanded;
      toggle.setAttribute("aria-expanded", String(!expanded));
    });
  }
  setupCollapsible("expenseCategoryToggle", document.getElementById("expenseCategoryList"));
  setupCollapsible("incomeCategoryToggle", document.getElementById("incomeCategoryList"));
  setupCollapsible("paymentMethodToggle", document.getElementById("paymentMethodListMgmt"));

  populateCurrencyOptions();
  applyTheme(settings.theme);

  // ---------- Month navigation ----------
  document.getElementById("prevMonth").addEventListener("click", () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderAll();
  });
  document.getElementById("nextMonth").addEventListener("click", () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderAll();
  });

  // ---------- Init ----------
  populateCategories();
  populatePaymentMethodOptions(paymentMethodInput);
  populatePaymentMethodOptions(billPaymentMethodInput);
  populatePaymentMethodOptions(templatePaymentMethodInput);
  populateTemplateCategories();
  populateTemplatePicker();
  renderAll();

  // ---------- Service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(err => {
        console.error("Service worker registration failed", err);
      });
    });
  }
})();
