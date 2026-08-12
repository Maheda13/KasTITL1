// =============================================
// KAS TITL 1 — Main Application
// =============================================

// ===== KONFIGURASI =====
// Ganti dengan URL Web App GAS setelah deploy
const GAS_URL = '';

const START_DATE = new Date('2026-07-27');
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const PER_PAGE = 10;

// ===== STATE =====
let state = loadState();
let recapPage = 1;
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

// ===== UTILITY =====
function formatDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function escapeHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function isPaymentDay(dateStr) {
    const d = parseDate(dateStr);
    if (d < START_DATE) return false;
    if (!state.paymentDays.includes(d.getDay())) return false;
    if (state.holidays && state.holidays.some(h => h.date === dateStr)) return false;
    return true;
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
function confirmAction(msg, confirmText) {
    return new Promise(resolve => {
        const overlay = document.getElementById('confirmModal');
        document.getElementById('confirmMsg').textContent = msg;
        document.getElementById('confirmYes').textContent = confirmText || 'Ya, Hapus';
        overlay.classList.add('show');
        const cleanup = (val) => { overlay.classList.remove('show'); resolve(val); };
        document.getElementById('confirmYes').onclick = () => cleanup(true);
        document.getElementById('confirmNo').onclick = () => cleanup(false);
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
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
        const safeAttr = escapeHtml(name);
        const safeJs = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return `<li class="student-item">
            <span class="num">${start + i + 1}.</span>
            <span class="name">${safeAttr}</span>
            <div class="actions">
                <button class="btn btn-sm btn-outline" onclick="editStudent('${safeJs}')">✏️</button>
                <button class="btn btn-danger" onclick="removeStudent('${safeJs}')">✕</button>
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
        const n = h.note ? ` — ${escapeHtml(h.note)}` : '';
        return `<div class="holiday-item">
            <span>🔴 ${formatDisplayDate(h.date)}${n}</span>
            <button class="btn btn-danger" onclick="removeHoliday('${h.date}')">✕</button>
        </div>`;
    }).join('');
}

async function resetAll() {
    if (!(await confirmAction('Yakin hapus semua data?', 'Ya, Lanjutkan'))) return;
    if (!(await confirmAction('SEKALI LAGI: HAPUS SEMUA DATA?', 'Ya, Hapus Semua'))) return;
    localStorage.removeItem('kas_titl1');
    state = defaultState(); saveLocal();
    if (GAS_URL) await gasGet('resetAll', {});
    toggleSettings();
    renderStudentList();
    toast('Semua data dihapus', 'info');
}

// ===== INPUT KAS =====

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

function getStudentUnpaid(name) {
    const pastDates = getAllPaymentDates(); // hanya sampai hari ini
    const unpaid = pastDates.filter(d => !(state.payments[d] && state.payments[d][name]));
    return { dates: unpaid, count: unpaid.length, totalRp: unpaid.length * 1000 };
}

// Generate payment dates sampai jumlah hari tertentu dari sekarang
function getAllPaymentDatesUntil(daysAhead) {
    const dates = [];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);
    let d = new Date(START_DATE);
    while (d <= endDate) {
        const ds = formatDate(d);
        if (isPaymentDay(ds)) dates.push(ds);
        d.setDate(d.getDate() + 1);
    }
    return dates;
}

// Semua tanggal belum bayar (termasuk masa depan, untuk proses pembayaran advance)
function getStudentAllUnpaid(name) {
    // Ambil 1 tahun dulu — cukup untuk bayar 1 semester
    const allDates = getAllPaymentDatesUntil(365);
    return allDates.filter(d => !(state.payments[d] && state.payments[d][name]));
}

function renderInputPage() {
    const content = document.getElementById('payContent');
    const pg = document.getElementById('payPagination');
    const summary = document.getElementById('paySummary');

    if (state.students.length === 0) {
        summary.innerHTML = '';
        content.innerHTML = '<div class="no-data">Belum ada siswa.<br><small>Tambahkan di menu ⚙️ Pengaturan</small></div>';
        pg.innerHTML = '';
        return;
    }

    // Hitung tunggakan semua siswa
    let totalUnpaidDays = 0;
    const studentData = state.students.map(name => {
        const { dates, count, totalRp } = getStudentUnpaid(name);
        totalUnpaidDays += count;
        return { name, unpaidDays: count, unpaidRp: totalRp, dates };
    });

    // Summary
    const pastDates = getAllPaymentDates(); // sampai hari ini
    summary.innerHTML = `<div class="count-text" style="margin-bottom:12px;">
        📋 ${state.students.length} siswa &bull; ${pastDates.length} hari wajib bayar &bull; ${totalUnpaidDays} hari belum lunas
    </div>`;

    // Pagination
    const totalItems = studentData.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / LIST_PER_PAGE));
    if (payPage > totalPages) payPage = totalPages;
    const start = (payPage - 1) * LIST_PER_PAGE;
    const pageData = studentData.slice(start, start + LIST_PER_PAGE);

    let html = `<div style="overflow-x:auto;">
        <table class="pay-table">
        <thead><tr>
            <th class="th-num">No</th>
            <th>Nama</th>
            <th class="th-tunggakan">Hari</th>
            <th class="th-tunggakan">Tunggakan</th>
            <th class="th-bayar">Nominal Bayar</th>
            <th class="th-aksi"></th>
        </tr></thead><tbody>`;

    pageData.forEach((s, idx) => {
        const safeAttr = escapeHtml(s.name);
        const safeJs = s.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        const isLunas = s.unpaidDays === 0;
        html += `<tr>
            <td class="td-num">${start + idx + 1}</td>
            <td>${safeAttr}</td>
            <td class="td-tunggakan">${isLunas ? '<span class="tunggakan-zero">✓</span>' : s.unpaidDays + ' hari'}</td>
            <td class="td-tunggakan ${isLunas ? 'tunggakan-zero' : 'tunggakan-num'}">${isLunas ? 'Lunas' : 'Rp' + s.unpaidRp.toLocaleString('id-ID')}</td>
            <td class="td-bayar">
                ${isLunas ? '<span style="color:#999;font-size:0.8rem;">—</span>' :
                `<input type="number" class="pay-input" id="pay_${safeAttr}" placeholder="0" min="1000" step="1000"
                    onkeydown="if(event.key==='Enter')payStudent('${safeJs}')">`}
            </td>
            <td class="td-aksi">
                ${isLunas ? '' :
                `<button class="btn btn-sm btn-success pay-btn" onclick="payStudent('${safeJs}')">💾</button>`}
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    content.innerHTML = html;

    pg.innerHTML = `
        <button class="btn btn-sm btn-outline" onclick="payGoPage(-1)" ${payPage<=1?'disabled':''}>◀</button>
        <span class="page-info">Hal ${payPage}/${totalPages}</span>
        <button class="btn btn-sm btn-outline" onclick="payGoPage(1)" ${payPage>=totalPages?'disabled':''}>▶</button>`;
}

function payGoPage(delta) {
    payPage += delta;
    renderInputPage();
}

async function payStudent(name) {
    const input = document.getElementById('pay_' + name);
    if (!input) return;
    const amount = parseInt(input.value);

    if (!amount || amount < 1000 || amount % 1000 !== 0) {
        toast('Nominal minimal Rp1.000 (kelipatan 1.000)', 'error');
        input.focus();
        return;
    }

    const daysToPay = amount / 1000;
    const unpaidDates = getStudentAllUnpaid(name); // termasuk masa depan untuk advance

    if (unpaidDates.length === 0) {
        toast(`${name} sudah lunas!`, 'info');
        return;
    }

    // Ambil N tanggal terlama yang belum bayar
    const toPay = unpaidDates.slice(0, daysToPay);

    // Tandai sebagai sudah bayar
    toPay.forEach(date => {
        if (!state.payments[date]) state.payments[date] = {};
        state.payments[date][name] = true;
    });
    saveLocal();

    // Sync ke GAS (batch — satu request untuk semua tanggal)
    if (GAS_URL && toPay.length > 0) {
        await gasGet('savePayment', { dates: toPay.join('|'), name, paid: true });
    }

    // Hitung sisa
    const remaining = daysToPay - toPay.length;
    let msg = `✅ ${name} dibayar ${toPay.length} hari (Rp${(toPay.length * 1000).toLocaleString('id-ID')})`;
    if (remaining > 0) {
        msg += ` — Rp${(remaining * 1000).toLocaleString('id-ID')} (${remaining} hari) tidak terpakai (melebihi jadwal yang tersedia)`;
    }

    toast(msg);
    renderInputPage();
}

// ===== REKAP =====
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
            <td>${globalIdx}</td><td>${escapeHtml(r.name)}</td>
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
