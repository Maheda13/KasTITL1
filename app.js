// =============================================
// KAS TITL 1 — Main Application
// =============================================

// ===== KONFIGURASI =====
// Ganti dengan URL Web App GAS setelah deploy
const GAS_URL = '';

const START_DATE = new Date('2026-07-27');
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const DAYS_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const PER_PAGE = 10;

// ===== STATE =====
let state = loadState();
let currentDate = getToday();
let payMode = 'harian';
let recapPage = 1;
let hidePaid = true;
let studentPage = 1;
let payPage = 1;
const LIST_PER_PAGE = 15;

function defaultState() {
    return { students: [], paymentDays: [1,2,3,4,5,6], payments: {}, holidays: [] };
}

function loadState() {
    try {
        const s = JSON.parse(localStorage.getItem('kas_titl1'));
        if (s && s.students) { if (!s.holidays) s.holidays = []; return s; }
    } catch(e) {}
    return defaultState();
}

function saveLocal() { localStorage.setItem('kas_titl1', JSON.stringify(state)); }

// ===== GAS API =====
async function gasGet(action, params) {
    if (!GAS_URL) return { success: false, error: 'GAS_URL belum diatur' };
    const query = new URLSearchParams({ action, ...params });
    try {
        const res = await fetch(GAS_URL + '?' + query.toString(), { redirect: 'follow' });
        return JSON.parse(await res.text());
    } catch(e) { return { success: false, error: e.toString() }; }
}

async function loadDataFromGAS() {
    if (!GAS_URL) return;
    const result = await gasGet('getData', {});
    if (result.success && result.data) {
        state.students = result.data.students || [];
        state.payments = result.data.payments || {};
        state.holidays = result.data.holidays || [];
        if (result.data.settings) state.paymentDays = result.data.settings.paymentDays || [1,2,3,4,5,6];
        saveLocal();
    }
}

function showLoading() {
    const div = document.createElement('div');
    div.id = 'loadingOverlay'; div.className = 'loading-overlay';
    div.innerHTML = '<div class="loading-spinner">Menyimpan<span class="dots"></span></div>';
    document.body.appendChild(div);
}
function hideLoading() { const el = document.getElementById('loadingOverlay'); if (el) el.remove(); }

// ===== UTILITY =====
function getToday() { return formatDate(new Date()); }
function formatDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }

function isPaymentDay(dateStr) {
    const d = parseDate(dateStr);
    if (d < START_DATE) return false;
    if (!state.paymentDays.includes(d.getDay())) return false;
    if (state.holidays && state.holidays.some(h => h.date === dateStr)) return false;
    return true;
}

function getHolidayNote(dateStr) {
    if (!state.holidays) return '';
    const h = state.holidays.find(h => h.date === dateStr);
    return h ? h.note : '';
}

function formatDisplayDate(dateStr) {
    const d = parseDate(dateStr);
    return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

// ===== TOAST NOTIFICATION =====
let _toastTimer = null;
function toast(msg, type = 'success') {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    clearTimeout(_toastTimer);
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    document.body.appendChild(div);
    _toastTimer = setTimeout(() => div.remove(), 2500);
}

// ===== CONFIRM MODAL =====
function confirmAction(msg) {
    return new Promise(resolve => {
        const overlay = document.getElementById('confirmModal');
        document.getElementById('confirmMsg').textContent = msg;
        overlay.classList.add('show');
        document.getElementById('confirmYes').onclick = () => { overlay.classList.remove('show'); resolve(true); };
        document.getElementById('confirmNo').onclick = () => { overlay.classList.remove('show'); resolve(false); };
    });
}

// ===== NAVIGATION =====
let settingsOpen = false;

function showPage(page) {
    settingsOpen = false;
    document.getElementById('gearBtn').classList.remove('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tabs = document.querySelectorAll('.tab');
    const idx = ['students','input','recap'].indexOf(page);
    if (idx >= 0) tabs[idx].classList.add('active');
    if (page === 'students') renderStudentList();
    if (page === 'input') renderInputPage();
    if (page === 'recap') renderRecap();
}

function toggleSettings() {
    settingsOpen = !settingsOpen;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('page-settings').classList.add('active');
    document.getElementById('gearBtn').classList.toggle('active', settingsOpen);
    renderSettings();
}

// ===== SISWA =====
async function addStudent() {
    const input = document.getElementById('studentName');
    const btn = input.nextElementSibling;
    const name = input.value.trim();
    if (!name) return;
    if (state.students.some(s => s.toLowerCase() === name.toLowerCase())) { toast('Nama sudah ada!', 'error'); return; }
    btn.disabled = true;
    state.students.push(name);
    saveLocal();
    if (GAS_URL) await gasGet('addStudent', { name });
    input.value = '';
    input.focus();
    btn.disabled = false;
    renderSettings();
    renderStudentList();
    toast(`${name} ditambahkan`);
}

async function addBulkStudents() {
    const ta = document.getElementById('bulkNames');
    const lines = ta.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    if (lines.length === 0) return;
    let added = 0;
    lines.forEach(name => {
        if (!state.students.some(s => s.toLowerCase() === name.toLowerCase())) { state.students.push(name); added++; }
    });
    saveLocal();
    if (GAS_URL) await gasGet('addBulkStudents', { names: lines.join('|') });
    ta.value = '';
    renderSettings();
    renderStudentList();
    toast(`${added} siswa ditambahkan`);
}

async function removeStudent(name) {
    if (!(await confirmAction(`Hapus "${name}"?`))) return;
    state.students = state.students.filter(s => s !== name);
    saveLocal();
    if (GAS_URL) await gasGet('removeStudent', { name });
    renderStudentList();
    toast(`${name} dihapus`, 'info');
}

async function editStudent(oldName) {
    const newName = prompt(`Edit nama "${oldName}":`, oldName);
    if (!newName || newName.trim() === '' || newName.trim() === oldName) return;
    const trimmed = newName.trim();
    if (state.students.some(s => s.toLowerCase() === trimmed.toLowerCase() && s !== oldName)) {
        toast('Nama sudah ada!', 'error'); return;
    }
    const idx = state.students.indexOf(oldName);
    if (idx >= 0) state.students[idx] = trimmed;
    Object.keys(state.payments).forEach(date => {
        if (state.payments[date][oldName] !== undefined) {
            state.payments[date][trimmed] = state.payments[date][oldName];
            delete state.payments[date][oldName];
        }
    });
    saveLocal();
    if (GAS_URL) await gasGet('editStudent', { oldName, newName: trimmed });
    renderStudentList();
    toast(`${oldName} → ${trimmed}`);
}

function renderStudentList() {
    document.getElementById('studentCount').textContent = state.students.length;
    const list = document.getElementById('studentList');
    if (state.students.length === 0) {
        list.innerHTML = '<div class="no-data">Belum ada siswa.<br><small>Tambahkan di menu ⚙️ Pengaturan</small></div>';
        document.getElementById('studentPagination').innerHTML = '';
        return;
    }

    const total = state.students.length;
    const totalPages = Math.max(1, Math.ceil(total / LIST_PER_PAGE));
    if (studentPage > totalPages) studentPage = totalPages;
    const start = (studentPage - 1) * LIST_PER_PAGE;
    const pageData = state.students.slice(start, start + LIST_PER_PAGE);

    list.innerHTML = pageData.map((name, i) => {
        const safe = name.replace(/'/g, "\\'");
        return `<li class="student-item">
            <span class="num">${start + i + 1}.</span>
            <span class="name">${name}</span>
            <div class="actions">
                <button class="btn btn-sm btn-outline" onclick="editStudent('${safe}')">✏️</button>
                <button class="btn btn-danger" onclick="removeStudent('${safe}')">✕</button>
            </div>
        </li>`;
    }).join('');

    document.getElementById('studentPagination').innerHTML = `
        <button class="btn btn-sm btn-outline" onclick="studentGoPage(-1)" ${studentPage<=1?'disabled':''}>◀</button>
        <span class="page-info">Hal ${studentPage}/${totalPages}</span>
        <button class="btn btn-sm btn-outline" onclick="studentGoPage(1)" ${studentPage>=totalPages?'disabled':''}>▶</button>`;
}

function studentGoPage(delta) {
    studentPage += delta;
    renderStudentList();
}

// ===== PENGATURAN =====
function renderSettings() {
    const grid = document.getElementById('dayGrid');
    const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    grid.innerHTML = dayNames.map((name, i) =>
        `<div class="day-btn ${state.paymentDays.includes(i) ? 'active' : ''}"
            onclick="toggleDay(${i})">${name}</div>`
    ).join('');
    document.getElementById('dayWarning').style.display = state.paymentDays.length === 0 ? 'block' : 'none';
    renderHolidays();
}

async function toggleDay(day) {
    const idx = state.paymentDays.indexOf(day);
    if (idx >= 0) state.paymentDays.splice(idx, 1);
    else { state.paymentDays.push(day); state.paymentDays.sort(); }
    saveLocal();
    if (GAS_URL) await gasGet('saveSettings', { paymentDays: state.paymentDays.join(','), startDate: '2026-07-27' });
    renderSettings();
}

async function addHoliday() {
    const dateInput = document.getElementById('holidayDate');
    const noteInput = document.getElementById('holidayNote');
    const date = dateInput.value;
    const note = noteInput.value.trim();
    if (!date) { toast('Pilih tanggal!', 'error'); return; }
    if (!state.holidays) state.holidays = [];
    if (state.holidays.some(h => h.date === date)) { toast('Tanggal sudah ada!', 'error'); return; }
    state.holidays.push({ date, note });
    state.holidays.sort((a, b) => a.date.localeCompare(b.date));
    saveLocal();
    if (GAS_URL) await gasGet('addHoliday', { date, note });
    dateInput.value = ''; noteInput.value = '';
    renderHolidays();
    toast('Tanggal libur ditambahkan');
}

async function removeHoliday(date) {
    if (!(await confirmAction('Hapus tanggal libur ini?'))) return;
    state.holidays = state.holidays.filter(h => h.date !== date);
    saveLocal();
    if (GAS_URL) await gasGet('removeHoliday', { date });
    renderHolidays();
    toast('Tanggal libur dihapus', 'info');
}

function renderHolidays() {
    const c = document.getElementById('holidayList');
    if (!state.holidays || state.holidays.length === 0) {
        c.innerHTML = '<div class="no-data">Belum ada tanggal libur.</div>'; return;
    }
    c.innerHTML = state.holidays.map(h => {
        const n = h.note ? ` — ${h.note}` : '';
        return `<div class="holiday-item">
            <span>🔴 ${formatDisplayDate(h.date)}${n}</span>
            <button class="btn btn-danger" onclick="removeHoliday('${h.date}')">✕</button>
        </div>`;
    }).join('');
}

async function resetAll() {
    if (!(await confirmAction('Yakin hapus semua data?'))) return;
    if (!(await confirmAction('SEKALI LAGI: HAPUS SEMUA DATA?'))) return;
    if (GAS_URL) await gasGet('resetAll', {});
    localStorage.removeItem('kas_titl1');
    state = defaultState(); saveLocal();
    toggleSettings();
    renderStudentList();
    toast('Semua data dihapus', 'info');
}

// ===== INPUT KAS — MODE HARIAN =====
function setPayMode(mode) {
    payMode = mode;
    document.getElementById('modeHarian').classList.toggle('active', mode === 'harian');
    document.getElementById('modeSiswa').classList.toggle('active', mode === 'siswa');
    document.getElementById('payModeHarian').style.display = mode === 'harian' ? '' : 'none';
    document.getElementById('payModeSiswa').style.display = mode === 'siswa' ? '' : 'none';
    if (mode === 'harian') renderInputPage();
    if (mode === 'siswa') renderPerStudentSelect();
}

function changeDate(delta) {
    const d = parseDate(currentDate);
    d.setDate(d.getDate() + delta);
    currentDate = formatDate(d);
    payPage = 1;
    renderInputPage();
}

function pickDate(val) { currentDate = val; payPage = 1; renderInputPage(); }

function renderInputPage() {
    const d = parseDate(currentDate);
    const dayName = DAYS_ID[d.getDay()];
    document.getElementById('datePicker').value = currentDate;
    const holidayNote = getHolidayNote(currentDate);
    let statusText = isPaymentDay(currentDate) ? '✅ Hari wajib bayar' : '⬜ Bukan hari wajib bayar';
    if (holidayNote) statusText = `🏖️ Libur — ${holidayNote}`;
    document.getElementById('dateDisplay').innerHTML = `${dayName}, ${formatDisplayDate(currentDate)}<small>${statusText}</small>`;

    const btn = document.getElementById('btnHidePaid');
    if (hidePaid) {
        btn.textContent = '👁 Tampilkan semua';
        btn.style.background = '#e3f2fd';
    } else {
        btn.textContent = '👁 Sembunyikan sudah bayar';
        btn.style.background = '';
    }

    const content = document.getElementById('payContent');
    const pg = document.getElementById('payPagination');
    if (state.students.length === 0) { content.innerHTML = '<div class="no-data">Belum ada siswa.</div>'; pg.innerHTML = ''; return; }
    if (!isPaymentDay(currentDate)) { content.innerHTML = '<div class="warning-box">📅 Bukan hari wajib bayar.</div>'; pg.innerHTML = ''; return; }
    if (!state.payments[currentDate]) state.payments[currentDate] = {};

    let visibleStudents = state.students.map((name, i) => ({ name, i }));
    if (hidePaid) {
        visibleStudents = visibleStudents.filter(s => state.payments[currentDate][s.name] !== true);
    }

    if (visibleStudents.length === 0) {
        const total = state.students.length;
        content.innerHTML = `<div class="no-data success">✅ Semua ${total} siswa sudah bayar hari ini!</div>`;
        pg.innerHTML = '';
        return;
    }

    const totalItems = visibleStudents.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / LIST_PER_PAGE));
    if (payPage > totalPages) payPage = totalPages;
    const start = (payPage - 1) * LIST_PER_PAGE;
    const pageData = visibleStudents.slice(start, start + LIST_PER_PAGE);

    const hiddenCount = state.students.length - visibleStudents.length;
    let html = '';
    if (hidePaid && hiddenCount > 0) {
        html += `<div class="count-text">📋 ${totalItems} dari ${state.students.length} siswa ditampilkan (${hiddenCount} sudah bayar, disembunyikan)</div>`;
    } else {
        html += `<div class="count-text">📋 ${totalItems} siswa</div>`;
    }
    html += `<table class="pay-table">
        <thead><tr><th style="width:36px;">No</th><th>Nama</th><th style="width:80px;text-align:center;">Bayar</th></tr></thead><tbody>`;
    pageData.forEach((s, idx) => {
        const paid = state.payments[currentDate][s.name] === true;
        const safe = s.name.replace(/'/g, "\\'");
        html += `<tr><td>${start + idx + 1}</td><td>${s.name}</td><td style="text-align:center;">
            <input type="checkbox" class="pay-check" ${paid?'checked':''}
                onchange="handleCheck(this,'${currentDate}','${safe}')"></td></tr>`;
    });
    html += '</tbody></table>';
    content.innerHTML = html;

    pg.innerHTML = `
        <button class="btn btn-sm btn-outline" onclick="payGoPage(-1)" ${payPage<=1?'disabled':''}>◀</button>
        <span class="page-info">Hal ${payPage}/${totalPages}</span>
        <button class="btn btn-sm btn-outline" onclick="payGoPage(1)" ${payPage>=totalPages?'disabled':''}>▶</button>`;
}

function toggleHidePaid() {
    hidePaid = !hidePaid;
    payPage = 1;
    renderInputPage();
}

function payGoPage(delta) {
    payPage += delta;
    renderInputPage();
}

// === Confirmation flow for unchecking paid students ===
let _pendingCheck = null;

function handleCheck(el, date, name) {
    const checking = el.checked;
    if (checking) {
        togglePayment(date, name, true);
    } else {
        const wasPaid = state.payments[date] && state.payments[date][name] === true;
        if (wasPaid) {
            el.checked = true;
            _pendingCheck = { el, date, name };
            document.getElementById('modalStudentName').textContent = name;
            document.getElementById('uncheckModal').classList.add('show');
        } else {
            togglePayment(date, name, false);
        }
    }
}

function confirmUncheck() {
    if (!_pendingCheck) return;
    const { date, name } = _pendingCheck;
    _pendingCheck = null;
    document.getElementById('uncheckModal').classList.remove('show');
    togglePayment(date, name, false);
}

function cancelUncheck() {
    _pendingCheck = null;
    document.getElementById('uncheckModal').classList.remove('show');
}

async function togglePayment(date, name, checked) {
    if (!state.payments[date]) state.payments[date] = {};
    state.payments[date][name] = checked;
    saveLocal();
    if (GAS_URL) await gasGet('savePayment', { date, name, paid: checked });
}

function checkAll() {
    if (!isPaymentDay(currentDate) || state.students.length === 0) return;
    if (!state.payments[currentDate]) state.payments[currentDate] = {};
    state.students.forEach(name => { state.payments[currentDate][name] = true; });
    saveLocal();
    savePaymentsToGAS(currentDate);
    renderInputPage();
}

async function uncheckAll() {
    if (!state.payments[currentDate]) return;
    const paidStudents = state.students.filter(n => state.payments[currentDate][n] === true);
    if (paidStudents.length > 0 && !(await confirmAction(`Ada ${paidStudents.length} siswa yang sudah ditandai bayar. Hapus semua centang?`))) return;
    state.students.forEach(name => { state.payments[currentDate][name] = false; });
    saveLocal();
    savePaymentsToGAS(currentDate);
    renderInputPage();
}

async function savePaymentsToGAS(date) {
    if (!GAS_URL) return;
    state.students.forEach(name => {
        const paid = state.payments[date] && state.payments[date][name] === true;
        gasGet('savePayment', { date, name, paid });
    });
}

// ===== INPUT KAS — MODE PER SISWA =====
function renderPerStudentSelect() {
    const sel = document.getElementById('payStudentSelect');
    const current = sel.value;
    sel.innerHTML = '<option value="">— Pilih Nama —</option>';
    state.students.forEach(name => {
        sel.innerHTML += `<option value="${name}" ${name===current?'selected':''}>${name}</option>`;
    });
    document.getElementById('perStudentResult').innerHTML = '';
}

function getAllPaymentDatesUpToToday() {
    const dates = [];
    const today = new Date();
    let d = new Date(START_DATE);
    while (d <= today) {
        const ds = formatDate(d);
        if (isPaymentDay(ds)) dates.push(ds);
        d.setDate(d.getDate() + 1);
    }
    return dates;
}

async function processPerStudentPay() {
    const name = document.getElementById('payStudentSelect').value;
    const amount = parseInt(document.getElementById('payAmount').value);
    if (!name) { toast('Pilih nama siswa!', 'error'); return; }
    if (!amount || amount < 1000 || amount % 1000 !== 0) { toast('Nominal harus kelipatan Rp1.000!', 'error'); return; }

    const daysToPay = amount / 1000;
    const allDates = getAllPaymentDatesUpToToday();
    const unpaidDates = allDates.filter(d => !(state.payments[d] && state.payments[d][name]));

    if (unpaidDates.length === 0) { toast(`${name} tidak ada tunggakan!`, 'info'); return; }
    const toPay = unpaidDates.slice(0, daysToPay);

    toPay.forEach(date => {
        if (!state.payments[date]) state.payments[date] = {};
        state.payments[date][name] = true;
    });
    saveLocal();

    if (GAS_URL) {
        for (const date of toPay) {
            await gasGet('savePayment', { date, name, paid: true });
        }
    }

    document.getElementById('perStudentResult').innerHTML =
        `<div class="warning-box success">
            ✅ ${name} dibayar ${toPay.length} hari (Rp${(toPay.length*1000).toLocaleString('id-ID')})<br>
            <small>${toPay.map(d => formatDisplayDate(d)).join(', ')}</small>
        </div>`;
    document.getElementById('payAmount').value = '';
}

// ===== REKAP =====
function getAllPaymentDates() {
    const dates = [];
    const today = new Date();
    let d = new Date(START_DATE);
    while (d <= today) {
        const ds = formatDate(d);
        if (isPaymentDay(ds)) dates.push(ds);
        d.setDate(d.getDate() + 1);
    }
    return dates;
}

function renderRecap() {
    const allDates = getAllPaymentDates();
    const monthSelect = document.getElementById('recapMonth');
    const months = new Set();
    allDates.forEach(ds => { const d = parseDate(ds); months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); });
    const currentVal = monthSelect.value;
    monthSelect.innerHTML = '<option value="all">Semua Bulan</option>';
    [...months].sort().reverse().forEach(m => {
        const [y, mo] = m.split('-');
        monthSelect.innerHTML += `<option value="${m}" ${m===currentVal?'selected':''}>${MONTHS_ID[parseInt(mo)-1]} ${y}</option>`;
    });

    const filterVal = monthSelect.value;
    const dates = filterVal === 'all' ? allDates : allDates.filter(ds => ds.startsWith(filterVal));
    const students = state.students;
    let totalPaid = 0, totalUnpaid = 0, totalAmount = 0;
    const studentRecaps = [];

    students.forEach(name => {
        let paid = 0, unpaid = 0;
        dates.forEach(d => { if (state.payments[d] && state.payments[d][name]) paid++; else unpaid++; });
        totalPaid += paid; totalUnpaid += unpaid; totalAmount += unpaid * 1000;
        studentRecaps.push({ name, paid, unpaid });
    });

    document.getElementById('summaryGrid').innerHTML = `
        <div class="summary-card blue"><div class="num">${students.length}</div><div class="lbl">Total Siswa</div></div>
        <div class="summary-card green"><div class="num">${dates.length}</div><div class="lbl">Hari Wajib Bayar</div></div>
        <div class="summary-card orange"><div class="num">${totalPaid}</div><div class="lbl">Total Bayar</div></div>
        <div class="summary-card red"><div class="num">Rp${totalAmount.toLocaleString('id-ID')}</div><div class="lbl">Total Tunggakan</div></div>`;

    const search = (document.getElementById('recapSearch').value || '').toLowerCase();
    const filtered = search ? studentRecaps.filter(r => r.name.toLowerCase().includes(search)) : studentRecaps;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    if (recapPage > totalPages) recapPage = totalPages;
    const start = (recapPage - 1) * PER_PAGE;
    const pageData = filtered.slice(start, start + PER_PAGE);

    const table = document.getElementById('recapTable');
    if (filtered.length === 0) {
        table.innerHTML = '<tr><td colspan="5" class="no-data">Tidak ada data.</td></tr>';
        document.getElementById('recapPagination').innerHTML = '';
        return;
    }

    let html = `<thead><tr><th>No</th><th>Nama</th><th>Bayar</th><th>Tunggakan</th><th>Sisa</th></tr></thead><tbody>`;
    pageData.forEach((r, i) => {
        const globalIdx = start + i + 1;
        html += `<tr>
            <td>${globalIdx}</td><td>${r.name}</td>
            <td><span class="badge badge-paid">${r.paid}x</span></td>
            <td><span class="badge badge-unpaid">${r.unpaid}x</span></td>
            <td class="${r.unpaid>0?'tunggakan-num':'tunggakan-zero'}">Rp${(r.unpaid*1000).toLocaleString('id-ID')}</td>
        </tr>`;
    });
    html += '</tbody>';
    table.innerHTML = html;

    const pg = document.getElementById('recapPagination');
    pg.innerHTML = `
        <button class="btn btn-sm btn-outline" onclick="recapGoPage(-1)" ${recapPage<=1?'disabled':''}>◀</button>
        <span class="page-info">Hal ${recapPage}/${totalPages}</span>
        <button class="btn btn-sm btn-outline" onclick="recapGoPage(1)" ${recapPage>=totalPages?'disabled':''}>▶</button>`;
}

function recapGoPage(delta) {
    recapPage += delta;
    renderRecap();
}

// ===== EXPORT =====
function exportCSV() {
    const dates = getAllPaymentDates();
    const filterVal = document.getElementById('recapMonth').value;
    const fd = filterVal === 'all' ? dates : dates.filter(ds => ds.startsWith(filterVal));
    let csv = '﻿No,Nama,' + fd.map(d => { const dd=parseDate(d); return `${dd.getDate()}/${dd.getMonth()+1}/${dd.getFullYear()}`; }).join(',') + ',Tunggakan (Rp)\n';
    state.students.forEach((name, i) => {
        const flags = fd.map(d => (state.payments[d]&&state.payments[d][name])?'✓':'✗');
        const unpaid = fd.filter(d => !(state.payments[d]&&state.payments[d][name])).length;
        csv += `${i+1},"${name}",${flags.join(',')},${unpaid*1000}\n`;
    });
    downloadFile(csv, `Kas_TITL1_${filterVal==='all'?'Semua':filterVal}.csv`, 'text/csv;charset=utf-8');
}

function exportExcel() {
    if (typeof XLSX === 'undefined') { toast('Library belum dimuat.', 'error'); return; }
    const dates = getAllPaymentDates();
    const filterVal = document.getElementById('recapMonth').value;
    const fd = filterVal === 'all' ? dates : dates.filter(ds => ds.startsWith(filterVal));
    const wsData = [['No','Nama']];
    fd.forEach(d => { const dd=parseDate(d); wsData[0].push(`${dd.getDate()}/${dd.getMonth()+1}`); });
    wsData[0].push('Tunggakan (Rp)');
    state.students.forEach((name, i) => {
        const row = [i+1, name];
        fd.forEach(d => { row.push((state.payments[d]&&state.payments[d][name])?'✓':'✗'); });
        const unpaid = fd.filter(d => !(state.payments[d]&&state.payments[d][name])).length;
        row.push(unpaid*1000); wsData.push(row);
    });
    wsData.push([]); wsData.push(['','TOTAL',...fd.map(d=>`${state.students.filter(s=>state.payments[d]&&state.payments[d][s]).length}/${state.students.length}`),'']);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = wsData[0].map((_,ci)=>({wch: ci<=1?15:ci===wsData[0].length-1?15:6}));
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Kas');
    XLSX.writeFile(wb, `Kas_TITL1_${filterVal==='all'?'Semua':filterVal}.xlsx`);
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// ===== PWA =====
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; document.getElementById('installBanner').classList.add('show'); });
function installApp() { if (!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt.userChoice.then(c => { if (c.outcome==='accepted') document.getElementById('installBanner').classList.remove('show'); deferredPrompt=null; }); }
function dismissInstall() { document.getElementById('installBanner').classList.remove('show'); }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

// ===== INIT =====
renderStudentList();
if (GAS_URL) loadDataFromGAS();
