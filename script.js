// ── DATA ──────────────────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { id: 'Glass',   name: 'Glass',       emoji: '🥤', price: 20,  stockKey: 'Glass'   },
  { id: 'water',   name: 'Water',       emoji: '💧', price: 20,  stockKey: 'water'   },
  { id: 'Ciggy',   name: 'Ciggy',       emoji: '🍟', price: 30,  stockKey: 'Ciggy'   },
  { id: 'Storia',     name: 'Storia',         emoji: '☕', price: 40,  stockKey: 'Storia'     },
  { id: 'MMP',  name: 'MMP',      emoji: '☕', price: 30,  stockKey: 'MMP'  },
  { id: 'Sting', name: 'Stings',    emoji: '🍪', price: 25,  stockKey: 'Sting' },
  { id: 'Can',  name: 'Can',      emoji: '🫔', price: 45,  stockKey: 'Can'  },
  { id: 'Nimbooz',   name: 'Nimbooz',       emoji: '🧃', price: 25,  stockKey: 'Nimbooz'   },
  { id: 'redBull',  name: 'Red Bull',    emoji: '⚡', price: 130,  stockKey: 'redBull'  },
  { id: 'Gatorade',  name: 'Gatorade',    emoji: '⚡', price: 25,  stockKey: 'gatorade'  },
];

const TABLE_DEFS = [
  { id: 'P1', label: 'P1' },
  { id: 'P2', label: 'P2' },
  { id: 'M1', label: 'M1' },
  { id: 'M2', label: 'M2' },
  { id: 'S1', label: 'S1' },
];

function tablePrice(tableId, ms) {

  const mins = ms / 60000;

  const rates = {
    P1: { halfHour: 90, hour: 150 },
    P2: { halfHour: 90, hour: 150 },

    M1: { halfHour: 130, hour: 220 },
    M2: { halfHour: 130, hour: 220 },

    S1: { halfHour: 180, hour: 350 }
  };

  const r = rates[tableId];

  if (!r) return 0;

  if (mins <= 35) {
    return r.halfHour;
  }

  const hours = mins / 60;

  return r.hour * hours;
}

// Persistent state
let stock = {};
MENU_ITEMS.forEach(m => stock[m.stockKey] = 40);

// Counter sales log
let salesLog = [];
let counterQtys = {};

// ___ transactions _______________

let transactions = JSON.parse(
  localStorage.getItem("transactions") || "[]"
);

function saveTransactions() {
  localStorage.setItem(
    "transactions",
    JSON.stringify(transactions)
  );
}

// Per-table session state
let sessions = {};
TABLE_DEFS.forEach(t => {
  sessions[t.id] = {
    active: false,
    playerName:"",
    startTime: null,
    elapsedMs: 0,
    intervalId: null,
    items: [],       // { menuId, qty }
  };
});

// Modal state
let modalTargetTable = null;
let modalQtys = {};   // menuId → qty to add
let billTargetTable   = null;

// ── PRICE FORMULA ─────────────────────────────────────────────────────────────
// Table rate: ₹10 per minute / 6  → i.e. ₹10 per 6-minute block
function tablePrice(tableId, ms) {

  const mins = ms / 60000;

  const rates = {
    P1: { halfHour: 90, hour: 150 },
    P2: { halfHour: 90, hour: 150 },

    M1: { halfHour: 130, hour: 220 },
    M2: { halfHour: 130, hour: 220 },

    S1: { halfHour: 180, hour: 350 }
  };

  const r = rates[tableId];

  if (!r) return 0;

  if (mins <= 35) {
    return r.halfHour;
  }

  const hours = mins / 60;

  return r.hour * hours;
}

function itemsTotal(tableId) {
  return sessions[tableId].items.reduce((sum, entry) => {
    const m = MENU_ITEMS.find(x => x.id === entry.menuId);
    return sum + (m ? m.price * entry.qty : 0);
  }, 0);
}

function totalBill(tableId) {
  const s = sessions[tableId];
  return tablePrice(tableId, s.elapsedMs) + itemsTotal(tableId);
}

// ── RENDER: STOCK BAR ─────────────────────────────────────────────────────────
function renderStock() {
  const list = document.getElementById('stockList');
  list.innerHTML = '';
  MENU_ITEMS.forEach(m => {
    const qty = stock[m.stockKey];
    const div = document.createElement('div');
    div.className = 'stock-item';
    div.title = `${m.name} — click to adjust`;

    const qtyClass = qty === 0 ? 'out' : qty <= 5 ? 'low' : '';

    div.innerHTML = `
      <div class="stock-item__img">${m.emoji}</div>
      <div class="stock-item__name">${m.name}</div>
      <div class="stock-item__qty ${qtyClass}">×${qty}</div>
    `;
    div.addEventListener('click', () => openRestockModal(m.stockKey));
    list.appendChild(div);
  });
}

// ── RENDER: ALL TABLE CARDS ───────────────────────────────────────────────────
function renderTables() {
  const area = document.getElementById('tablesArea');
  area.innerHTML = '';
  TABLE_DEFS.forEach(t => area.appendChild(buildTableCard(t)));
}

function buildTableCard(t) {
  const s = sessions[t.id];
  const wrapper = document.createElement('div');
  wrapper.className = 'table-card';
  wrapper.id = `card-${t.id}`;

  const label = document.createElement('div');
  label.className = 'table-card__label';
  label.textContent = t.label;

  const felt = document.createElement('div');
  felt.className = 'table-felt' + (s.active ? ' active' : '');

  // pocket corners (top-right, bottom-right)
  felt.innerHTML = `
    <div class="table-felt__pockets-tr"></div>
    <div class="table-felt__pockets-br"></div>
  `;

  // top bar
  const top = document.createElement('div');
  top.className = 'table-felt__top';

  const btn = document.createElement('button');
  btn.className = 'btn-session ' + (s.active ? 'end' : 'start');
  btn.textContent = s.active ? 'End' : 'Start';
  btn.addEventListener('click', () => s.active ? openEndModal(t.id) : startSession(t.id));
  top.appendChild(btn);
  felt.appendChild(top);

  // items area
  const itemsArea = document.createElement('div');
  itemsArea.className = 'table-felt__items';
  itemsArea.id = `items-${t.id}`;

  if (s.active && s.items.length > 0) {
    s.items.forEach(entry => {
      const m = MENU_ITEMS.find(x => x.id === entry.menuId);
      if (!m) return;
      const chip = document.createElement('div');
      chip.className = 'table-item-chip';
      chip.innerHTML = `<div class="table-item-chip__img">${m.emoji}</div>${m.name} ×${entry.qty}`;
      itemsArea.appendChild(chip);
    });
  } else if (!s.active) {
    const idle = document.createElement('div');
    idle.className = 'table-felt__idle';
    idle.textContent = 'IDLE';
    itemsArea.appendChild(idle);
  }
  felt.appendChild(itemsArea);

  // footer
  const footer = document.createElement('div');
  footer.className = 'table-felt__footer';
  footer.id = `footer-${t.id}`;
  felt.appendChild(footer);
  updateFooter(t.id, footer);

  wrapper.appendChild(label);
  wrapper.appendChild(felt);

  // add items button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-add-items';
  addBtn.textContent = '+ Add Item';
  addBtn.disabled = !s.active;
  addBtn.addEventListener('click', () => openAddItemModal(t.id));
  wrapper.appendChild(addBtn);

  return wrapper;
}

function updateFooter(tableId, el) {
  const s = sessions[tableId];
  if (!el) el = document.getElementById(`footer-${tableId}`);
  if (!el) return;

  if (!s.active && s.startTime === null) {
    el.innerHTML = `<div class="meta">Press Start to begin</div>`;
    return;
  }

  const start = s.startTime ? formatTime(new Date(s.startTime)) : '—';
  const elapsed = formatElapsed(s.elapsedMs);
  const rate = tablePrice(tableId, s.elapsedMs);
  const total = rate + itemsTotal(tableId);

  el.innerHTML = `
    <div class="meta">Start: <span>${start}</span></div>
    <div class="player-name">${s.playerName || "No Player"}</div>
    <div class="timer">${elapsed}${s.active ? ' ●' : ' ■'}</div>
    <div class="price">₹${total.toFixed(0)}</div>
  `;
}

// ── SESSION LOGIC ─────────────────────────────────────────────────────────────
function startSession(tableId) {

  const playerName = prompt("Player Name:");
  if (!playerName) return;

  const s = sessions[tableId];
  s.playerName = playerName;
  s.active    = true;
  s.startTime = Date.now();
  s.elapsedMs = 0;
  s.items     = [];

  s.intervalId = setInterval(() => {
    s.elapsedMs = Date.now() - s.startTime;
    updateFooter(tableId);
  }, 1000);

  refreshCard(tableId);
}

function endSession(tableId) {
  const s = sessions[tableId];
  clearInterval(s.intervalId);
  s.active     = false;
  s.intervalId = null;
  // keep startTime & elapsedMs for display
  refreshCard(tableId);
}

function resetSession(tableId) {
  const s = sessions[tableId];
  s.startTime = null;
  s.elapsedMs = 0;
  s.items     = [];
  refreshCard(tableId);
}

function refreshCard(tableId) {
  const area = document.getElementById('tablesArea');
  const old  = document.getElementById(`card-${tableId}`);
  const tDef = TABLE_DEFS.find(t => t.id === tableId);
  const newCard = buildTableCard(tDef);
  area.replaceChild(newCard, old);
}

// ── ADD ITEM MODAL ────────────────────────────────────────────────────────────
function openAddItemModal(tableId) {
  modalTargetTable = tableId;
  modalQtys = {};
  MENU_ITEMS.forEach(m => modalQtys[m.id] = 0);

  document.getElementById('modalTableName').textContent = `Table ${tableId}`;
  renderMenuGrid();
  document.getElementById('modalOverlay').classList.add('open');
}

function renderMenuGrid() {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';
  MENU_ITEMS.forEach(m => {
    const avail = stock[m.stockKey];
    const qty   = modalQtys[m.id];

    const div = document.createElement('div');
    div.className = 'menu-item' + (avail === 0 ? ' out-of-stock' : '');

    div.innerHTML = `
      <div class="menu-item__img">${m.emoji}</div>
      <div class="menu-item__name">${m.name}</div>
      <div class="menu-item__price">₹${m.price}</div>
      <div class="menu-item__stock">Stock: ${avail}</div>
      <div class="menu-item__qty-ctrl">
        <button class="qty-btn" data-id="${m.id}" data-dir="-1">−</button>
        <span class="qty-val" id="qv-${m.id}">${qty}</span>
        <button class="qty-btn" data-id="${m.id}" data-dir="1">＋</button>
      </div>
    `;
    grid.appendChild(div);
  });

  grid.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id  = e.currentTarget.dataset.id;
      const dir = parseInt(e.currentTarget.dataset.dir);
      const m   = MENU_ITEMS.find(x => x.id === id);
      const max = stock[m.stockKey];
      const cur = modalQtys[id];
      modalQtys[id] = Math.max(0, Math.min(cur + dir, max));
      document.getElementById(`qv-${id}`).textContent = modalQtys[id];
    });
  });
}

function confirmAddItems() {
  const tableId = modalTargetTable;
  const s = sessions[tableId];

  MENU_ITEMS.forEach(m => {
    const qty = modalQtys[m.id];
    if (qty === 0) return;

    stock[m.stockKey] = Math.max(0, stock[m.stockKey] - qty);

    const existing = s.items.find(x => x.menuId === m.id);
    if (existing) existing.qty += qty;
    else s.items.push({ menuId: m.id, qty });
  });

  closeModal('modalOverlay');
  renderStock();
  refreshCard(tableId);
}

// ── END SESSION (BILL) MODAL ──────────────────────────────────────────────────
function openEndModal(tableId) {
  billTargetTable = tableId;
  const s = sessions[tableId];

  document.getElementById('billTableName').textContent = `Table ${tableId}`;

  const rate  = tablePrice(tableId, s.elapsedMs);
  const iTotal = itemsTotal(tableId);
  const grand  = rate + iTotal;

  const body = document.getElementById('billBody');
  body.innerHTML = '';

  // table time row
  const elapsed = formatElapsed(s.elapsedMs);
  addBillRow(body, `Table Time (${elapsed})`, `₹${rate.toFixed(0)}`);

  // item rows
  s.items.forEach(entry => {
    const m = MENU_ITEMS.find(x => x.id === entry.menuId);
    if (!m) return;
    addBillRow(body, `${m.emoji} ${m.name} ×${entry.qty}`, `₹${(m.price * entry.qty).toFixed(0)}`);
  });

  document.getElementById('billTotal').textContent = `Total: ₹${grand.toFixed(0)}`;
  document.getElementById('endOverlay').classList.add('open');
}

function addBillRow(parent, label, value) {
  const row = document.createElement('div');
  row.className = 'bill-row';
  row.innerHTML = `<span>${label}</span><span>${value}</span>`;
  parent.appendChild(row);
}

// ── RESTOCK MODAL ─────────────────────────────────────────────────────────────
function openRestockModal(focusKey) {
  const grid = document.getElementById('restockGrid');
  grid.innerHTML = '';

  MENU_ITEMS.forEach(m => {
    const row = document.createElement('div');
    row.className = 'restock-row';
    row.innerHTML = `
      <div class="restock-row__info">
        <div class="restock-row__img">${m.emoji}</div>
        <div>
          <div class="restock-row__name">${m.name}</div>
          <div class="restock-row__current">Current: ${stock[m.stockKey]}</div>
        </div>
      </div>
      <div class="restock-row__ctrl">
        <input class="restock-input" id="ri-${m.stockKey}" type="number" min="0" max="999"
               value="${stock[m.stockKey]}" />
      </div>
    `;
    grid.appendChild(row);
  });

  document.getElementById('restockOverlay').classList.add('open');

  if (focusKey) {
    setTimeout(() => {
      const inp = document.getElementById(`ri-${focusKey}`);
      if (inp) { inp.focus(); inp.select(); }
    }, 80);
  }
}

function saveRestock() {
  MENU_ITEMS.forEach(m => {
    const inp = document.getElementById(`ri-${m.stockKey}`);
    if (inp) {
      const val = parseInt(inp.value);
      if (!isNaN(val) && val >= 0) stock[m.stockKey] = val;
    }
  });
  closeModal('restockOverlay');
  renderStock();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function formatTime(date) {
  let h = date.getHours(), m = date.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,'0')}${ampm}`;
}

function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

// ── COUNTER SALE ──────────────────────────────────────────────────────────────
function openCounterModal() {
  counterQtys = {};
  MENU_ITEMS.forEach(m => counterQtys[m.id] = 0);
  renderCounterGrid();
  document.getElementById('counterOverlay').classList.add('open');
}

function renderCounterGrid() {
  const grid = document.getElementById('counterMenuGrid');
  grid.innerHTML = '';
  MENU_ITEMS.forEach(m => {
    const avail = stock[m.stockKey];
    const qty   = counterQtys[m.id];

    const div = document.createElement('div');
    div.className = 'menu-item' + (avail === 0 ? ' out-of-stock' : '');
    div.innerHTML = `
      <div class="menu-item__img">${m.emoji}</div>
      <div class="menu-item__name">${m.name}</div>
      <div class="menu-item__price">₹${m.price}</div>
      <div class="menu-item__stock">Stock: ${avail}</div>
      <div class="menu-item__qty-ctrl">
        <button class="qty-btn" data-id="${m.id}" data-dir="-1">−</button>
        <span class="qty-val" id="cqv-${m.id}">${qty}</span>
        <button class="qty-btn" data-id="${m.id}" data-dir="1">＋</button>
      </div>
    `;
    grid.appendChild(div);
  });

  grid.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const id  = e.currentTarget.dataset.id;
      const dir = parseInt(e.currentTarget.dataset.dir);
      const m   = MENU_ITEMS.find(x => x.id === id);
      counterQtys[id] = Math.max(0, Math.min(counterQtys[id] + dir, stock[m.stockKey]));
      document.getElementById(`cqv-${id}`).textContent = counterQtys[id];
    });
  });
}

function openCounterBill() {
  const hasItems = MENU_ITEMS.some(m => counterQtys[m.id] > 0);
  if (!hasItems) { alert('Please select at least one item.'); return; }

  const body = document.getElementById('counterBillBody');
  body.innerHTML = '';
  let total = 0;

  MENU_ITEMS.forEach(m => {
    const qty = counterQtys[m.id];
    if (!qty) return;
    const sub = m.price * qty;
    total += sub;
    addBillRow(body, `${m.emoji} ${m.name} ×${qty}`, `₹${sub}`);
  });

  document.getElementById('counterBillTotal').textContent = `Total: ₹${total}`;
  document.getElementById('counterBillTime').textContent  = `@ ${formatTime(new Date())}`;

  closeModal('counterOverlay');
  document.getElementById('counterBillOverlay').classList.add('open');
}

function confirmCounterSale() {
  const now = Date.now();
  const items = MENU_ITEMS
    .filter(m => counterQtys[m.id] > 0)
    .map(m => ({ name: m.name, qty: counterQtys[m.id], price: m.price * counterQtys[m.id], menuId: m.id }));

  const total = items.reduce((sum, entry) => sum + entry.price, 0);

  // deduct stock
  MENU_ITEMS.forEach(m => {
    stock[m.stockKey] = Math.max(0, stock[m.stockKey] - counterQtys[m.id]);
  });

  transactions.push({
    type: 'counter',
    items,
    total,
    billedAt: now
  });
  saveTransactions();

  salesLog.push({
    time: new Date(now).toISOString(),
    items
  });

  closeModal('counterBillOverlay');
  renderStock();
  updateCounterBadge();
}

function updateCounterBadge() {
  const btn = document.getElementById('btnCounter');
  const existing = btn.querySelector('.sale-count');
  if (existing) existing.remove();
  if (salesLog.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'sale-count';
    badge.textContent = salesLog.length;
    btn.appendChild(badge);
  }
}

// ── EVENT WIRING ──────────────────────────────────────────────────────────────
document.getElementById('btnRestock').addEventListener('click', () => openRestockModal(null));
document.getElementById('btnCounter').addEventListener('click', openCounterModal);
document.getElementById('btnCounterCancel').addEventListener('click', () => closeModal('counterOverlay'));
document.getElementById('btnCounterBill').addEventListener('click', openCounterBill);
document.getElementById('btnCounterBillBack').addEventListener('click', () => {
  closeModal('counterBillOverlay');
  document.getElementById('counterOverlay').classList.add('open');
});
document.getElementById('btnCounterBillConfirm').addEventListener('click', confirmCounterSale);
document.getElementById('btnRestockClose').addEventListener('click', saveRestock);
document.getElementById('btnModalClose').addEventListener('click', () => {
  confirmAddItems();
});
document.getElementById('btnBillCancel').addEventListener('click', () => closeModal('endOverlay'));
document.getElementById('btnBillConfirm').addEventListener('click', () => {
  
  const transaction = {
    type: "table",
    table: billTargetTable,
    customer: sessions[billTargetTable].playerName,
    startTime: sessions[billTargetTable].startTime,
    endTime: Date.now(),
    durationMs: sessions[billTargetTable].elapsedMs,
    items: [...sessions[billTargetTable].items],
    total: totalBill(billTargetTable),
    billedAt: Date.now()
  };

  transactions.push(transaction);
  saveTransactions();

  closeModal('endOverlay');
  endSession(billTargetTable);

  setTimeout(() => resetSession(billTargetTable), 1000);
});

// close modals on overlay click
['modalOverlay','restockOverlay','endOverlay','counterOverlay','counterBillOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal(id);
  });
});

// ── INIT ──────────────────────────────────────────────────────────────────────
renderStock();
renderTables();

