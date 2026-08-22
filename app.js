(() => {
  "use strict";

  const STORAGE_KEY = "ledger_transactions_v1";

  const CATEGORIES = {
    expense: ["Food", "Transport", "Housing", "Utilities", "Shopping", "Health", "Entertainment", "Other"],
    income: ["Salary", "Freelance", "Gift", "Other"]
  };

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // ---------- State ----------
  let transactions = loadTransactions();
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

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- Helpers ----------
  function formatMoney(n) {
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toFixed(2);
  }

  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function getMonthTransactions() {
    return transactions.filter(t => {
      const d = new Date(t.date + "T00:00:00");
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    });
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

    const totals = {};
    expenses.forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const max = rows[0][1];

    list.innerHTML = rows.map(([cat, amt]) => `
      <div class="breakdown-row">
        <span class="cat-name">${escapeHtml(cat)}</span>
        <span class="breakdown-bar-track"><span class="breakdown-bar-fill" style="width:${Math.max(4, (amt / max) * 100)}%"></span></span>
        <span class="cat-amount mono">${formatMoney(amt)}</span>
      </div>
    `).join("");
  }

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
          <span class="tx-amount ${t.type} mono">${t.type === "expense" ? "-" : "+"}${formatMoney(t.amount).replace("$","").replace("-","")}</span>
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
    renderBreakdown(monthTx);
    renderList(monthTx);
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

  document.getElementById("addBtn").addEventListener("click", () => openSheet("add"));
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
