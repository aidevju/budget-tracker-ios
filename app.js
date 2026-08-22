(() => {
  "use strict";

  const STORAGE_KEY = "ledger_transactions_v1";
  const SETTINGS_KEY = "ledger_settings_v1";

  const CATEGORIES = {
    expense: ["Food", "Transport", "Housing", "Utilities", "Shopping", "Health", "Entertainment", "Other"],
    income: ["Salary", "Freelance", "Gift", "Other"]
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

  const DEFAULT_SETTINGS = { theme: "system", currency: "none", monthlyTarget: null };

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // ---------- State ----------
  let transactions = loadTransactions();
  let settings = loadSettings();
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-indexed
  let editingId = null; // null = adding new
  let currentType = "expense";

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
    } catch (e) {
      console.error("Failed to save transactions", e);
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
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

  function categoryColor(category) {
    const idx = CATEGORIES.expense.indexOf(category);
    return `var(--cat-${(idx < 0 ? 0 : idx) + 1})`;
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
          showMonthScreen();
        });
      });
    }
  }

  // ---------- Screen switching ----------
  let currentScreen = "month";
  const monthScreen = document.getElementById("monthScreen");
  const dashboardScreen = document.getElementById("dashboardScreen");
  const dashboardBtn = document.getElementById("dashboardBtn");
  const goToTodayBtn = document.getElementById("goToTodayBtn");
  const addBtn = document.getElementById("addBtn");

  function showMonthScreen() {
    currentScreen = "month";
    monthScreen.hidden = false;
    dashboardScreen.hidden = true;
    addBtn.hidden = false;
    dashboardBtn.hidden = false;
    goToTodayBtn.hidden = true;
  }

  function showDashboardScreen() {
    currentScreen = "dashboard";
    monthScreen.hidden = true;
    dashboardScreen.hidden = false;
    addBtn.hidden = true;
    dashboardBtn.hidden = true;
    goToTodayBtn.hidden = false;
    renderDashboardScreen();
  }

  dashboardBtn.addEventListener("click", showDashboardScreen);
  document.getElementById("backToMonth").addEventListener("click", showMonthScreen);
  goToTodayBtn.addEventListener("click", () => {
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    renderAll();
    showMonthScreen();
  });

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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
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

  // ---------- Sheet (add/edit form) ----------
  const backdrop = document.getElementById("sheetBackdrop");
  const form = document.getElementById("txForm");
  const amountInput = document.getElementById("amountInput");
  const categoryInput = document.getElementById("categoryInput");
  const noteInput = document.getElementById("noteInput");
  const dateInput = document.getElementById("dateInput");
  const formError = document.getElementById("formError");
  const deleteBtn = document.getElementById("deleteBtn");
  const sheetTitle = document.getElementById("sheetTitle");

  function populateCategories() {
    categoryInput.innerHTML = CATEGORIES[currentType].map(c => `<option value="${c}">${c}</option>`).join("");
  }

  function setType(type) {
    currentType = type;
    document.querySelectorAll(".type-btn").forEach(b => b.classList.toggle("active", b.dataset.type === type));
    populateCategories();
  }

  function openSheet(mode, id) {
    formError.hidden = true;
    if (mode === "edit") {
      const tx = transactions.find(t => t.id === id);
      if (!tx) return;
      editingId = id;
      sheetTitle.textContent = "Edit transaction";
      setType(tx.type);
      amountInput.value = tx.amount;
      categoryInput.value = tx.category;
      noteInput.value = tx.note || "";
      dateInput.value = tx.date;
      deleteBtn.hidden = false;
    } else {
      editingId = null;
      sheetTitle.textContent = "Add transaction";
      setType("expense");
      amountInput.value = "";
      noteInput.value = "";
      dateInput.value = todayISO();
      deleteBtn.hidden = true;
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

  document.getElementById("typeToggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".type-btn");
    if (btn) setType(btn.dataset.type);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat(amountInput.value);
    const category = categoryInput.value;
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

    if (editingId) {
      const tx = transactions.find(t => t.id === editingId);
      Object.assign(tx, { type: currentType, amount, category, note: noteInput.value.trim(), date });
    } else {
      transactions.push({
        id: uid(),
        type: currentType,
        amount,
        category,
        note: noteInput.value.trim(),
        date
      });
    }
    saveTransactions();
    closeSheet();

    // Jump the visible month to the transaction's date so the user sees it.
    const d = new Date(date + "T00:00:00");
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    renderAll();
  });

  deleteBtn.addEventListener("click", () => {
    if (!editingId) return;
    transactions = transactions.filter(t => t.id !== editingId);
    saveTransactions();
    closeSheet();
    renderAll();
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

  // ---------- Settings sheet ----------
  const settingsBackdrop = document.getElementById("settingsBackdrop");
  const currencySelect = document.getElementById("currencySelect");
  const targetInput = document.getElementById("targetInput");

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

  document.getElementById("settingsBtn").addEventListener("click", () => {
    document.querySelectorAll("#themeToggle .type-btn").forEach(b => b.classList.toggle("active", b.dataset.theme === settings.theme));
    currencySelect.value = settings.currency;
    targetInput.value = settings.monthlyTarget != null ? settings.monthlyTarget : "";
    settingsBackdrop.classList.add("open");
  });
  document.getElementById("closeSettingsBtn").addEventListener("click", () => settingsBackdrop.classList.remove("open"));
  settingsBackdrop.addEventListener("click", (e) => { if (e.target === settingsBackdrop) settingsBackdrop.classList.remove("open"); });

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
