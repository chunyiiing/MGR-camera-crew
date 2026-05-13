// ─── SUPABASE INIT ───────────────────────────────────────────────
let supabase = null;

function initSupabase() {
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  if (url && key) {
    supabase = window.supabase.createClient(url, key);
    return true;
  }
  return false;
}

function saveSettings() {
  const url = document.getElementById('sbUrl').value.trim();
  const key = document.getElementById('sbKey').value.trim();
  if (!url || !key) { showToast('請填寫 URL 和 Key', 'warn'); return; }
  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  supabase = window.supabase.createClient(url, key);
  testConnection();
}

async function testConnection() {
  const el = document.getElementById('dbStatus');
  el.textContent = '連線測試中…';
  try {
    const { error } = await supabase.from('equipments').select('id').limit(1);
    if (error) throw error;
    el.textContent = '✅ 連線成功';
    el.className = 'text-center text-sm text-success';
    showToast('Supabase 連線成功！');
  } catch (e) {
    el.textContent = '❌ 連線失敗：' + e.message;
    el.className = 'text-center text-sm text-danger';
  }
}

function openSettings() {
  document.getElementById('sbUrl').value = localStorage.getItem('sb_url') || '';
  document.getElementById('sbKey').value = localStorage.getItem('sb_key') || '';
  openModal('settingsModal');
}

// ─── HELPERS ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast slide-up';
  if (type === 'warn') el.style.borderLeftColor = '#f59e0b';
  if (type === 'error') el.style.borderLeftColor = '#ef4444';
  if (type === 'success') el.style.borderLeftColor = '#22c55e';
  el.textContent = msg;
  document.getElementById('toaster').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`;
}
function fmtTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── NAV TABS ────────────────────────────────────────────────────
let currentTab = 'checkout';
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
  currentTab = tab;
  stopAllScanners();
  if (tab === 'list') loadEquipmentList();
  if (tab === 'inventory') loadInventory();
  if (tab === 'status') loadStatusLog();
}

// ─── SCANNER MANAGEMENT ──────────────────────────────────────────
const scanners = {};
const scannerActive = {};

async function toggleScanner(divId, btnId, callback) {
  const btn = document.getElementById(btnId);
  const div = document.getElementById(divId);

  if (scannerActive[divId]) {
    await stopScanner(divId);
    btn.textContent = '開始掃描';
    div.style.display = 'none';
    return;
  }

  div.style.display = 'block';
  btn.textContent = '停止掃描';

  try {
    const scanner = new Html5Qrcode(divId);
    scanners[divId] = scanner;
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        callback(decodedText);
        stopScanner(divId);
        btn.textContent = '開始掃描';
        div.style.display = 'none';
      },
      () => {}
    );
    scannerActive[divId] = true;
  } catch (e) {
    showToast('無法開啟相機：' + e, 'error');
    div.style.display = 'none';
    btn.textContent = '開始掃描';
  }
}

async function stopScanner(divId) {
  if (scanners[divId]) {
    try { await scanners[divId].stop(); } catch {}
    try { await scanners[divId].clear(); } catch {}
    delete scanners[divId];
  }
  scannerActive[divId] = false;
}

async function stopAllScanners() {
  for (const id of Object.keys(scannerActive)) {
    if (scannerActive[id]) await stopScanner(id);
  }
  ['toggleScan1','toggleScan2','toggleScan3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '開始掃描';
  });
  ['qr-reader','qr-reader2','qr-reader3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ─── QR CODE PARSING ─────────────────────────────────────────────
// Expected QR format: JSON {"name":"鏡頭 A","code":"A-001"} or plain "name|code"
function parseQR(text) {
  try {
    const obj = JSON.parse(text);
    return { name: obj.name || '', code: obj.code || obj.id || '' };
  } catch {
    const parts = text.split('|');
    if (parts.length >= 2) return { name: parts[0].trim(), code: parts[1].trim() };
    return { name: text, code: '' };
  }
}

// ─── TAB 1: 今日出庫 ─────────────────────────────────────────────
let checkoutItems = [];

function handleCheckoutScan(text) {
  const { name, code } = parseQR(text);
  if (!name) { showToast('無法解析 QR Code', 'warn'); return; }

  // Check if already added
  if (checkoutItems.find(i => i.code === code && i.name === name)) {
    showToast(`${name} #${code} 已在列表中`, 'warn');
    return;
  }

  const item = { name, code, scannedAt: new Date().toISOString(), id: Date.now() };
  checkoutItems.push(item);
  renderCheckoutItems();
  showToast(`✅ 已加入：${name} ${code}`);
}

function renderCheckoutItems() {
  const container = document.getElementById('checkoutItems');
  document.getElementById('checkoutCount').textContent = checkoutItems.length + ' 件';
  if (!checkoutItems.length) {
    container.innerHTML = '<div class="text-center text-subtle text-sm py-8">尚未掃描任何器材</div>';
    return;
  }
  container.innerHTML = checkoutItems.map((item, i) => `
    <div class="card slide-up flex items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="text-text font-medium text-sm truncate">${item.name}</div>
        <div class="text-subtle text-xs mt-0.5">#${item.code} · ${fmtTime(item.scannedAt)}</div>
      </div>
      <button onclick="openScheduleModal('${item.name}','${item.code}')" class="chip chip-blue shrink-0 text-xs px-3 py-1.5">大表</button>
      <button onclick="removeCheckoutItem(${i})" class="w-8 h-8 rounded-full bg-card flex items-center justify-center text-danger shrink-0">✕</button>
    </div>
  `).join('');
}

function removeCheckoutItem(i) {
  checkoutItems.splice(i, 1);
  renderCheckoutItems();
}

async function saveCheckout() {
  const user = document.getElementById('checkoutUser').value;
  const date = document.getElementById('checkoutDate').value;
  const orderNo = document.getElementById('checkoutOrderNo').value;

  if (!user) { showToast('請選擇使用者', 'warn'); return; }
  if (!checkoutItems.length) { showToast('請先掃描器材', 'warn'); return; }
  if (!supabase) { showToast('請先設定 Supabase 連線', 'error'); openSettings(); return; }

  try {
    const rows = checkoutItems.map(item => ({
      equipment_name: item.name,
      equipment_code: item.code,
      user_name: user,
      order_no: orderNo || null,
      checkout_date: date,
      checkout_time: item.scannedAt,
      status: 'rented',
    }));
    const { error } = await supabase.from('rentals').insert(rows);
    if (error) throw error;
    showToast('✅ 出庫儲存成功！', 'success');

    // Also update equipment status
    for (const item of checkoutItems) {
      await supabase.from('equipments')
        .update({ status: 'rented' })
        .eq('code', item.code);
    }
    checkoutItems = [];
    renderCheckoutItems();
  } catch (e) {
    showToast('儲存失敗：' + e.message, 'error');
  }
}

async function exportCheckoutPDF() {
  const user = document.getElementById('checkoutUser').value;
  const date = document.getElementById('checkoutDate').value;
  const orderNo = document.getElementById('checkoutOrderNo').value;

  if (!checkoutItems.length) { showToast('沒有出庫品項', 'warn'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  // Use built-in font (no custom font needed for basic output)
  doc.setFont('helvetica');
  doc.setFontSize(18);
  doc.text('Equipment Checkout Report', 20, 25);

  doc.setFontSize(11);
  doc.text(`User: ${user || '-'}`, 20, 38);
  doc.text(`Date: ${date || todayStr()}`, 20, 46);
  doc.text(`Order No: ${orderNo || '-'}`, 20, 54);
  doc.text(`Items: ${checkoutItems.length}`, 20, 62);

  doc.setLineWidth(0.3);
  doc.line(20, 67, 190, 67);

  let y = 76;
  doc.setFontSize(10);
  checkoutItems.forEach((item, i) => {
    doc.text(`${i + 1}. ${item.name}  #${item.code}  ${fmtTime(item.scannedAt)}`, 20, y);
    y += 9;
  });

  y += 10;
  doc.line(20, y, 120, y);
  doc.text('Signature:', 20, y + 7);

  const blob = doc.output('blob');
  const file = new File([blob], `checkout_${date || todayStr()}.pdf`, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '出庫單', text: `${user} 出庫單 ${date}` });
    } catch (e) {
      if (e.name !== 'AbortError') doc.save(file.name);
    }
  } else {
    doc.save(file.name);
    showToast('PDF 已下載');
  }
}

// ─── USERS ───────────────────────────────────────────────────────
function openAddUserModal() { openModal('addUserModal'); }

function addNewUser() {
  const name = document.getElementById('newUserName').value.trim();
  if (!name) { showToast('請輸入姓名', 'warn'); return; }

  // Persist in localStorage
  const saved = JSON.parse(localStorage.getItem('extra_users') || '[]');
  if (!saved.includes(name)) {
    saved.push(name);
    localStorage.setItem('extra_users', JSON.stringify(saved));
  }

  // Add to all user dropdowns
  ['checkoutUser', 'statusUser'].forEach(id => {
    const sel = document.getElementById(id);
    if (![...sel.options].find(o => o.value === name)) {
      sel.appendChild(new Option(name, name));
    }
    sel.value = name;
  });

  closeModal('addUserModal');
  showToast(`已新增使用者：${name}`, 'success');
}

function loadExtraUsers() {
  const saved = JSON.parse(localStorage.getItem('extra_users') || '[]');
  saved.forEach(name => {
    ['checkoutUser', 'statusUser'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel && ![...sel.options].find(o => o.value === name)) {
        sel.appendChild(new Option(name, name));
      }
    });
  });
}

// ─── SCHEDULE MODAL (大表) ────────────────────────────────────────
let calYear, calMonth, scheduleEquipName, scheduleEquipCode;
let calRentals = [];

async function openScheduleModal(name, code) {
  scheduleEquipName = name;
  scheduleEquipCode = code;
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();

  if (supabase) {
    const { data } = await supabase.from('rentals')
      .select('*')
      .eq('equipment_code', code)
      .in('status', ['rented', 'partial']);
    calRentals = data || [];
  } else {
    calRentals = [];
  }

  renderCalendar();
  openModal('scheduleModal');
}

function changeCalMonth(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

function renderCalendar() {
  const months = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  document.getElementById('calTitle').textContent = `${scheduleEquipName} · ${calYear} ${months[calMonth]}`;

  const grid = document.getElementById('calGrid');
  const days = ['日','一','二','三','四','五','六'];
  let html = days.map(d => `<div class="text-subtle text-xs font-medium py-1">${d}</div>`).join('');

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();

  // Blank cells
  for (let i = 0; i < firstDay; i++) html += '<div></div>';

  // Build rented date set
  const rentedDates = new Set();
  calRentals.forEach(r => {
    if (r.checkout_date) rentedDates.add(r.checkout_date.slice(0, 10));
  });

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    const isRented = rentedDates.has(dateStr);
    let cls = 'calendar-day mx-auto cursor-pointer';
    if (isToday) cls += ' today';
    if (isRented) cls += ' rented';
    html += `<div><div class="${cls}" onclick="showDayDetail('${dateStr}')">${d}</div></div>`;
  }

  grid.innerHTML = html;
}

function showDayDetail(dateStr) {
  const day = calRentals.filter(r => r.checkout_date && r.checkout_date.slice(0,10) === dateStr);
  const el = document.getElementById('scheduleDetail');
  if (!day.length) { el.innerHTML = `<p class="text-subtle text-sm text-center">${dateStr} 無借用記錄</p>`; return; }
  el.innerHTML = `<div class="text-sm text-subtle mb-1">${dateStr} 借用記錄：</div>` +
    day.map(r => `<div class="card mb-2"><div class="text-text font-medium">${r.user_name}</div><div class="text-subtle text-xs">單號：${r.order_no || '-'}</div></div>`).join('');
}

// ─── TAB 2: 器材列表 ─────────────────────────────────────────────
let allEquipments = [];

async function loadEquipmentList() {
  if (!supabase) { renderEquipmentList([]); return; }
  const { data, error } = await supabase
    .from('equipments')
    .select('*')
    .order('name');
  if (error) { showToast('載入失敗', 'error'); return; }
  allEquipments = data || [];
  renderEquipmentList(allEquipments);
}

function filterEquipment() {
  const q = document.getElementById('searchEquip').value.toLowerCase();
  renderEquipmentList(allEquipments.filter(e => e.name.toLowerCase().includes(q) || (e.code||'').toLowerCase().includes(q)));
}

function renderEquipmentList(list) {
  const container = document.getElementById('equipmentList');
  if (!list.length) {
    container.innerHTML = '<div class="text-center text-subtle text-sm py-12">暫無器材資料<br><span class="text-xs">請先設定 Supabase 或新增器材</span></div>';
    return;
  }
  container.innerHTML = list.map(e => {
    const remaining = (e.total_qty || 0) - (e.rented_qty || 0) - (e.repair_qty || 0);
    let statusChip = '';
    if (e.status === 'repair') statusChip = '<span class="chip chip-red">維修中</span>';
    else if (e.status === 'rented') statusChip = '<span class="chip chip-yellow">出租中</span>';
    else statusChip = '<span class="chip chip-green">在庫</span>';

    return `
    <div class="card slide-up">
      <div class="flex items-start justify-between mb-2">
        <div>
          <div class="text-text font-semibold text-sm">${e.name}</div>
          <div class="text-subtle text-xs">#${e.code || '-'}</div>
        </div>
        ${statusChip}
      </div>
      <div class="flex gap-3 mt-2">
        <div class="flex-1 bg-surface rounded-xl p-2 text-center">
          <div class="text-text font-bold">${e.total_qty || 0}</div>
          <div class="text-subtle text-[10px]">總數</div>
        </div>
        <div class="flex-1 bg-surface rounded-xl p-2 text-center">
          <div class="text-success font-bold">${remaining < 0 ? 0 : remaining}</div>
          <div class="text-subtle text-[10px]">剩餘</div>
        </div>
        <div class="flex-1 bg-surface rounded-xl p-2 text-center">
          <div class="text-warn font-bold">${e.rented_qty || 0}</div>
          <div class="text-subtle text-[10px]">出租中</div>
        </div>
        <div class="flex-1 bg-surface rounded-xl p-2 text-center">
          <div class="text-danger font-bold">${e.repair_qty || 0}</div>
          <div class="text-subtle text-[10px]">維修</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── TAB 3: 器材狀態 ─────────────────────────────────────────────
function handleStatusScan(text) {
  const { name, code } = parseQR(text);
  document.getElementById('statusEquipName').value = name;
  document.getElementById('statusEquipNo').value = code;
  showToast(`已帶入：${name} #${code}`);
}

function onStatusTypeChange() {
  // Visual feedback for repair selection
  const val = document.getElementById('statusType').value;
  if (val === 'repair') showToast('⚠️ 選擇送修將同步標記為維修中', 'warn');
}

async function saveStatus() {
  const equip_name = document.getElementById('statusEquipName').value;
  const equip_code = document.getElementById('statusEquipNo').value;
  const user_name  = document.getElementById('statusUser').value;
  const status     = document.getElementById('statusType').value;
  const date       = document.getElementById('statusDate').value;
  const note       = document.getElementById('statusNote').value;

  if (!equip_name) { showToast('請先掃描器材', 'warn'); return; }
  if (!user_name)  { showToast('請選擇填寫人', 'warn'); return; }
  if (!supabase)   { showToast('請先設定 Supabase 連線', 'error'); openSettings(); return; }

  try {
    const { error } = await supabase.from('status_logs').insert([{
      equipment_name: equip_name,
      equipment_code: equip_code,
      user_name,
      status,
      log_date: date,
      note,
    }]);
    if (error) throw error;

    // Sync equipment status if repair
    if (status === 'repair') {
      await supabase.from('equipments')
        .update({ status: 'repair' })
        .eq('code', equip_code);

      // Update repair_qty
      const { data: eq } = await supabase.from('equipments').select('repair_qty').eq('code', equip_code).single();
      if (eq) {
        await supabase.from('equipments')
          .update({ repair_qty: (eq.repair_qty || 0) + 1 })
          .eq('code', equip_code);
      }
    } else if (status === 'normal') {
      await supabase.from('equipments')
        .update({ status: 'available' })
        .eq('code', equip_code);
    }

    showToast('✅ 狀態已儲存', 'success');
    document.getElementById('statusEquipName').value = '';
    document.getElementById('statusEquipNo').value = '';
    document.getElementById('statusNote').value = '';
    loadStatusLog();
  } catch (e) {
    showToast('儲存失敗：' + e.message, 'error');
  }
}

async function loadStatusLog() {
  if (!supabase) return;
  const { data } = await supabase.from('status_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const container = document.getElementById('statusLogList');
  if (!data || !data.length) {
    container.innerHTML = '<div class="text-center text-subtle text-sm py-6">暫無狀態記錄</div>';
    return;
  }

  const statusMap = { normal: ['chip-green','正常'], pending: ['chip-yellow','未處理'], repair: ['chip-red','送修'] };
  container.innerHTML = data.map(r => {
    const [chipCls, label] = statusMap[r.status] || ['chip-gray', r.status];
    return `
    <div class="card slide-up">
      <div class="flex items-center justify-between mb-1">
        <span class="text-text font-medium text-sm">${r.equipment_name} #${r.equipment_code}</span>
        <span class="chip ${chipCls}">${label}</span>
      </div>
      <div class="text-subtle text-xs">${r.user_name} · ${fmtDate(r.log_date)}</div>
      ${r.note ? `<div class="text-subtle text-xs mt-1 bg-surface rounded-lg px-2 py-1">${r.note}</div>` : ''}
    </div>`;
  }).join('');
}

// ─── TAB 4: 盤點表 ───────────────────────────────────────────────
async function loadInventory() {
  if (!supabase) {
    document.getElementById('inventoryList').innerHTML = '<div class="text-center text-subtle text-sm py-12">請先設定 Supabase 連線</div>';
    return;
  }

  const { data: equips } = await supabase.from('equipments').select('*').order('name');
  const { data: rentals } = await supabase.from('rentals').select('*').eq('status', 'rented');

  if (!equips) return;

  // Build rented map: equipment_code -> [rental]
  const rentedMap = {};
  (rentals || []).forEach(r => {
    if (!rentedMap[r.equipment_code]) rentedMap[r.equipment_code] = [];
    rentedMap[r.equipment_code].push(r);
  });

  let totalAll = 0, totalPresent = 0, totalOut = 0, totalRepair = 0;

  const rows = equips.map(e => {
    const rented    = e.rented_qty  || 0;
    const repair    = e.repair_qty  || 0;
    const total     = e.total_qty   || 0;
    const shouldBe  = total - repair - rented;
    const missing   = Math.max(0, shouldBe - (shouldBe)); // placeholder; real scan not implemented in demo
    const rentedItems = rentedMap[e.code] || [];

    totalAll    += total;
    totalPresent += Math.max(0, shouldBe);
    totalOut    += rented;
    totalRepair += repair;

    let rentedRows = rentedItems.map(r =>
      `<div class="flex items-center gap-2 mt-1 pl-2 border-l-2 border-warn">
        <span class="text-warn text-xs">⚙️ #${r.equipment_code} (${r.user_name}) 出租中</span>
      </div>`
    ).join('');

    return `
    <div class="card slide-up">
      <div class="flex items-center justify-between mb-2">
        <div>
          <span class="text-text font-semibold text-sm">${e.name}</span>
          <span class="text-subtle text-xs ml-2">#${e.code}</span>
        </div>
        <span class="chip chip-gray text-xs">${shouldBe}/${total}/${repair}</span>
      </div>
      <div class="text-subtle text-[10px] mb-1">應到 / 總數 / 維修</div>
      <div class="flex gap-2">
        <div class="flex-1 bg-surface rounded-lg p-2 text-center">
          <div class="text-text font-bold text-sm">${total}</div>
          <div class="text-subtle text-[10px]">總數</div>
        </div>
        <div class="flex-1 bg-surface rounded-lg p-2 text-center">
          <div class="text-success font-bold text-sm">${Math.max(0,shouldBe)}</div>
          <div class="text-subtle text-[10px]">應到</div>
        </div>
        <div class="flex-1 bg-surface rounded-lg p-2 text-center">
          <div class="text-warn font-bold text-sm">${rented}</div>
          <div class="text-subtle text-[10px]">出租中</div>
        </div>
        <div class="flex-1 bg-surface rounded-lg p-2 text-center">
          <div class="text-danger font-bold text-sm">${repair}</div>
          <div class="text-subtle text-[10px]">維修</div>
        </div>
      </div>
      ${rentedRows}
    </div>`;
  });

  document.getElementById('invTotal').textContent = totalAll;
  document.getElementById('invPresent').textContent = totalPresent;
  document.getElementById('invOut').textContent = totalOut;
  document.getElementById('invRepair').textContent = totalRepair;
  document.getElementById('inventoryList').innerHTML = rows.join('');
}

// ─── TAB 5: 入庫 ─────────────────────────────────────────────────
let inboundItems = [];

function handleInboundScan(text) {
  const { name, code } = parseQR(text);
  document.getElementById('inboundName').value = name;
  document.getElementById('inboundCode').value = code;
  showToast(`已帶入：${name} #${code}`);
}

function addInboundItem() {
  const name = document.getElementById('inboundName').value.trim();
  const code = document.getElementById('inboundCode').value.trim();
  const qty  = parseInt(document.getElementById('inboundQty').value) || 1;
  const note = document.getElementById('inboundNote').value.trim();

  if (!name) { showToast('請填寫器材名稱', 'warn'); return; }
  inboundItems.push({ name, code, qty, note, id: Date.now() });
  renderInboundItems();

  document.getElementById('inboundName').value = '';
  document.getElementById('inboundCode').value = '';
  document.getElementById('inboundQty').value = '1';
  document.getElementById('inboundNote').value = '';
}

function renderInboundItems() {
  document.getElementById('inboundCount').textContent = inboundItems.length + ' 件';
  const container = document.getElementById('inboundItems');
  if (!inboundItems.length) {
    container.innerHTML = '<div class="text-center text-subtle text-sm py-6">尚未加入品項</div>';
    return;
  }
  container.innerHTML = inboundItems.map((item, i) => `
    <div class="card slide-up flex items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="text-text font-medium text-sm truncate">${item.name}</div>
        <div class="text-subtle text-xs">#${item.code} · 數量：${item.qty}</div>
      </div>
      <button onclick="removeInboundItem(${i})" class="w-8 h-8 rounded-full bg-card flex items-center justify-center text-danger shrink-0">✕</button>
    </div>
  `).join('');
}

function removeInboundItem(i) {
  inboundItems.splice(i, 1);
  renderInboundItems();
}

async function saveInbound() {
  // Also try adding the currently-filled item if not added to list
  const name = document.getElementById('inboundName').value.trim();
  const code = document.getElementById('inboundCode').value.trim();
  const qty  = parseInt(document.getElementById('inboundQty').value) || 1;
  const note = document.getElementById('inboundNote').value.trim();

  let items = [...inboundItems];
  if (name) items.push({ name, code, qty, note });

  if (!items.length) { showToast('請先掃描或填寫器材', 'warn'); return; }
  if (!supabase) { showToast('請先設定 Supabase 連線', 'error'); openSettings(); return; }

  try {
    for (const item of items) {
      // Check if equipment exists
      const { data: existing } = await supabase.from('equipments')
        .select('*').eq('code', item.code).single();

      if (existing) {
        await supabase.from('equipments')
          .update({ total_qty: (existing.total_qty || 0) + item.qty, status: 'available' })
          .eq('code', item.code);
      } else {
        await supabase.from('equipments').insert([{
          name: item.name,
          code: item.code,
          total_qty: item.qty,
          rented_qty: 0,
          repair_qty: 0,
          status: 'available',
          note: item.note || null,
        }]);
      }
    }

    showToast(`✅ 入庫成功，共 ${items.length} 筆`, 'success');
    inboundItems = [];
    renderInboundItems();
    document.getElementById('inboundName').value = '';
    document.getElementById('inboundCode').value = '';
    document.getElementById('inboundQty').value = '1';
    document.getElementById('inboundNote').value = '';
  } catch (e) {
    showToast('入庫失敗：' + e.message, 'error');
  }
}

// ─── RETURN LOGIC ─────────────────────────────────────────────────
let returnTarget = null;

function openReturnModal(rental) {
  returnTarget = rental;
  document.getElementById('returnModalTitle').textContent = `歸還確認：${rental.equipment_name}`;
  document.getElementById('returnModalMsg').textContent = `借用人：${rental.user_name}  出庫日：${fmtDate(rental.checkout_date)}`;
  openModal('returnModal');
}

async function confirmReturn() {
  if (!returnTarget) return;
  try {
    await supabase.from('rentals').update({ status: 'returned', returned_at: new Date().toISOString() })
      .eq('id', returnTarget.id);
    await supabase.from('equipments')
      .update({ status: 'available', rented_qty: Math.max(0, (returnTarget.rented_qty_snapshot || 1) - 1) })
      .eq('code', returnTarget.equipment_code);
    showToast('✅ 已標記歸還', 'success');
    closeModal('returnModal');
    returnTarget = null;
  } catch (e) {
    showToast('操作失敗：' + e.message, 'error');
  }
}

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Default dates
  document.getElementById('checkoutDate').value = todayStr();
  document.getElementById('statusDate').value = todayStr();

  // Init Supabase
  initSupabase();

  // Load extra users
  loadExtraUsers();

  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Render empty states
  renderCheckoutItems();
  renderInboundItems();
});

// ─── INBOUND ITEM ADD ON ENTER / FAB ────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && currentTab === 'inbound') {
    const name = document.getElementById('inboundName').value.trim();
    if (name) addInboundItem();
  }
});
