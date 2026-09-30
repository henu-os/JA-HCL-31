// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Member Bill Register Controller
// ═══════════════════════════════════════════════════════════

let allBills = [];
let filteredBills = [];
let currentSocietyName = 'SHREE SAI RESIDENCY CO-OP HSG SOC LTD';

document.addEventListener('DOMContentLoaded', () => {
  initSocietyInfo();
  loadBillRegister();
});

function getApiUrl(endpoint) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:5002/api';
  return `${base}/${endpoint}`;
}

async function initSocietyInfo() {
  try {
    const activeSoc = sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName');
    if (activeSoc) {
      currentSocietyName = activeSoc;
    }
    const lbl = document.getElementById('lbl-society-period');
    if (lbl) lbl.innerHTML = `<i class="bi bi-building"></i> ${currentSocietyName} — Maintenance & Assessment Register`;
    const prtSoc = document.getElementById('prt-soc-name');
    if (prtSoc) prtSoc.innerText = currentSocietyName;
  } catch (e) {}
}

async function loadBillRegister() {
  const tbody = document.getElementById('tbl-bills-body');
  if (tbody) tbody.innerHTML = `<tr><td colspan="16" class="col-center" style="padding:30px; color:#94a3b8;"><i class="bi bi-hourglass-split"></i> Loading Member Bill Register...</td></tr>`;

  try {
    const res = await fetch(getApiUrl('member-bills?societyId=1&fyId=1'));
    const data = await res.json();

    if (data.success && Array.isArray(data.data)) {
      allBills = data.data;
    } else if (Array.isArray(data)) {
      allBills = data;
    } else {
      allBills = [];
    }

    populateWings();
    applyFilters();
  } catch (err) {
    console.error('Failed to load bill register:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="16" class="col-center" style="padding:30px; color:#dc2626;">Error loading bills: ${err.message}</td></tr>`;
  }
}

function populateWings() {
  const wingSet = new Set();
  allBills.forEach(b => {
    if (b.wing) wingSet.add(b.wing.trim());
  });

  const selWing = document.getElementById('flt-wing');
  if (selWing) {
    const cur = selWing.value;
    selWing.innerHTML = `<option value="ALL">-- All Wings --</option>` +
      Array.from(wingSet).sort().map(w => `<option value="${w}">${w}</option>`).join('');
    if (wingSet.has(cur)) selWing.value = cur;
  }
}

function applyFilters() {
  const bType = document.getElementById('flt-bill-type')?.value || 'ALL';
  const wing = document.getElementById('flt-wing')?.value || 'ALL';
  const status = document.getElementById('flt-status')?.value || 'ALL';
  const search = (document.getElementById('flt-search')?.value || '').toLowerCase().trim();

  filteredBills = allBills.filter(b => {
    if (bType !== 'ALL' && b.billType !== bType) return false;
    if (wing !== 'ALL' && (b.wing || '').trim() !== wing) return false;
    
    const paid = parseFloat(b.paidAmount) || 0;
    const tot = parseFloat(b.totalAmount) || 0;
    const bal = parseFloat(b.balanceAmount) || (tot - paid);

    if (status === 'PAID' && bal > 0.01) return false;
    if (status === 'UNPAID' && paid > 0) return false;
    if (status === 'PARTIAL' && (paid <= 0 || bal <= 0.01)) return false;

    if (search) {
      const match = (b.billNo || '').toLowerCase().includes(search) ||
                    (b.memName || b.memberName || '').toLowerCase().includes(search) ||
                    (b.memCode || b.memberCode || '').toLowerCase().includes(search) ||
                    (b.flatNo || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    return true;
  });

  renderSummary();
  renderTable();
}

function resetFilters() {
  if (document.getElementById('flt-bill-type')) document.getElementById('flt-bill-type').value = 'ALL';
  if (document.getElementById('flt-wing')) document.getElementById('flt-wing').value = 'ALL';
  if (document.getElementById('flt-status')) document.getElementById('flt-status').value = 'ALL';
  if (document.getElementById('flt-search')) document.getElementById('flt-search').value = '';
  applyFilters();
}

function toggleSummaryPopover(e) {
  if (e) e.stopPropagation();
  const p = document.getElementById('summaryPopover');
  if (p) p.classList.toggle('show');
}

document.addEventListener('click', (e) => {
  const p = document.getElementById('summaryPopover');
  if (p && p.classList.contains('show') && !e.target.closest('.summary-dropdown-wrap')) {
    p.classList.remove('show');
  }
});

function renderSummary() {
  let count = filteredBills.length;
  let totPrin = 0;
  let totArr = 0;
  let totInt = 0;
  let totGross = 0;
  let totPaid = 0;
  let totBal = 0;

  filteredBills.forEach(b => {
    const prin = parseFloat(b.principalAmount) || 0;
    const arr = parseFloat(b.arrearsAmount) || 0;
    const int = parseFloat(b.interestAmount) || 0;
    const gross = parseFloat(b.totalAmount) || (prin + arr + int);
    const paid = parseFloat(b.paidAmount) || 0;
    const bal = parseFloat(b.balanceAmount) || (gross - paid);

    totPrin += prin;
    totArr += arr;
    totInt += int;
    totGross += gross;
    totPaid += paid;
    totBal += bal;
  });

  const bCount = document.getElementById('stat-count');
  if (bCount) bCount.innerText = `${count} Bills`;
  const pCount = document.getElementById('pop-count');
  if (pCount) pCount.innerText = `${count} Bills`;

  if (document.getElementById('stat-principal')) document.getElementById('stat-principal').innerText = '₹' + formatCurrency(totPrin);
  if (document.getElementById('stat-arrears')) document.getElementById('stat-arrears').innerText = '₹' + formatCurrency(totArr);
  if (document.getElementById('stat-interest')) document.getElementById('stat-interest').innerText = '₹' + formatCurrency(totInt);
  if (document.getElementById('stat-gross')) document.getElementById('stat-gross').innerText = '₹' + formatCurrency(totGross);
  if (document.getElementById('stat-paid')) document.getElementById('stat-paid').innerText = '₹' + formatCurrency(totPaid);
  if (document.getElementById('stat-balance')) document.getElementById('stat-balance').innerText = '₹' + formatCurrency(totBal);
}

function renderTable() {
  const tbody = document.getElementById('tbl-bills-body');
  const tfoot = document.getElementById('tbl-bills-foot');
  const prtTbody = document.getElementById('prt-tbody');
  const prtTfoot = document.getElementById('prt-tfoot');
  if (!tbody) return;

  if (filteredBills.length === 0) {
    tbody.innerHTML = `<tr><td colspan="16" class="col-center" style="padding:30px; color:#64748b;">No maintenance bills match selected criteria.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    if (prtTbody) prtTbody.innerHTML = `<tr><td colspan="16" class="col-center">No records found.</td></tr>`;
    return;
  }

  let html = '';
  let prtHtml = '';
  let totPrin = 0, totArr = 0, totInt = 0, totGross = 0, totPaid = 0, totBal = 0;

  filteredBills.forEach((b, idx) => {
    const prin = parseFloat(b.principalAmount) || 0;
    const arr = parseFloat(b.arrearsAmount) || 0;
    const int = parseFloat(b.interestAmount) || 0;
    const gross = parseFloat(b.totalAmount) || (prin + arr + int);
    const paid = parseFloat(b.paidAmount) || 0;
    const bal = parseFloat(b.balanceAmount) || (gross - paid);

    totPrin += prin;
    totArr += arr;
    totInt += int;
    totGross += gross;
    totPaid += paid;
    totBal += bal;

    let statusBadge = `<span class="badge-status badge-unpaid">Unpaid</span>`;
    let statusText = 'UNPAID';
    if (bal <= 0.01) {
      statusBadge = `<span class="badge-status badge-paid">Paid</span>`;
      statusText = 'PAID';
    } else if (paid > 0) {
      statusBadge = `<span class="badge-status badge-partial">Partially Paid</span>`;
      statusText = 'PARTIAL';
    }

    const bDate = b.billDate ? (b.billDate.split('T')[0]) : '-';
    const dDate = b.dueDate ? (b.dueDate.split('T')[0]) : '-';
    const memCode = b.memCode || b.memberCode || '';
    const memName = b.memName || b.memberName || '';
    const flat = (b.wing ? (b.wing + '-') : '') + (b.flatNo || '');

    html += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td><strong>${escapeHtml(b.billNo || '')}</strong></td>
        <td class="col-center">${bDate}</td>
        <td class="col-center">${dDate}</td>
        <td><span style="font-weight:700; color:#2563eb;">${escapeHtml(b.billType || 'Maintenance')}</span></td>
        <td>${escapeHtml(b.period || '-')}</td>
        <td class="col-center"><strong>${escapeHtml(memCode)}</strong></td>
        <td>${escapeHtml(memName)}</td>
        <td class="col-center">${escapeHtml(flat)}</td>
        <td class="col-right">${formatCurrency(prin)}</td>
        <td class="col-right" style="color:#d97706;">${formatCurrency(arr)}</td>
        <td class="col-right" style="color:#dc2626;">${formatCurrency(int)}</td>
        <td class="col-right" style="font-weight:700; color:#0f172a;">${formatCurrency(gross)}</td>
        <td class="col-right" style="color:#16a34a;">${formatCurrency(paid)}</td>
        <td class="col-right" style="font-weight:700; color:#dc2626;">${formatCurrency(bal)}</td>
        <td class="col-center">${statusBadge}</td>
      </tr>
    `;

    prtHtml += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td>${escapeHtml(b.billNo || '')}</td>
        <td class="col-center">${bDate}</td>
        <td class="col-center">${dDate}</td>
        <td>${escapeHtml(b.billType || 'Maintenance')}</td>
        <td>${escapeHtml(b.period || '-')}</td>
        <td class="col-center">${escapeHtml(memCode)}</td>
        <td>${escapeHtml(memName)}</td>
        <td class="col-center">${escapeHtml(flat)}</td>
        <td class="col-right">${formatCurrency(prin)}</td>
        <td class="col-right">${formatCurrency(arr)}</td>
        <td class="col-right">${formatCurrency(int)}</td>
        <td class="col-right"><strong>${formatCurrency(gross)}</strong></td>
        <td class="col-right">${formatCurrency(paid)}</td>
        <td class="col-right"><strong>${formatCurrency(bal)}</strong></td>
        <td class="col-center">${statusText}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  if (prtTbody) prtTbody.innerHTML = prtHtml;

  const footHtml = `
    <tr>
      <td colspan="9" class="col-left" style="font-weight:800; text-transform:uppercase;">Grand Total (${filteredBills.length} Bills)</td>
      <td class="col-right">${formatCurrency(totPrin)}</td>
      <td class="col-right">${formatCurrency(totArr)}</td>
      <td class="col-right">${formatCurrency(totInt)}</td>
      <td class="col-right" style="color:#2563eb;">${formatCurrency(totGross)}</td>
      <td class="col-right" style="color:#16a34a;">${formatCurrency(totPaid)}</td>
      <td class="col-right" style="color:#dc2626;">${formatCurrency(totBal)}</td>
      <td></td>
    </tr>
  `;
  if (tfoot) tfoot.innerHTML = footHtml;
  if (prtTfoot) prtTfoot.innerHTML = footHtml;
}

function exportBillRegisterExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded.');
    return;
  }

  const wsData = [
    [currentSocietyName],
    ['MEMBER BILL REGISTER'],
    [`Generated on: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Sr No', 'Bill No', 'Bill Date', 'Due Date', 'Bill Type', 'Period', 'Member Code', 'Member Name', 'Flat/Unit', 'Assessment (₹)', 'Arrears (₹)', 'Interest (₹)', 'Gross Billed (₹)', 'Paid (₹)', 'Balance Due (₹)', 'Status']
  ];

  filteredBills.forEach((b, idx) => {
    const prin = parseFloat(b.principalAmount) || 0;
    const arr = parseFloat(b.arrearsAmount) || 0;
    const int = parseFloat(b.interestAmount) || 0;
    const gross = parseFloat(b.totalAmount) || (prin + arr + int);
    const paid = parseFloat(b.paidAmount) || 0;
    const bal = parseFloat(b.balanceAmount) || (gross - paid);
    const status = bal <= 0.01 ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID');
    const flat = (b.wing ? (b.wing + '-') : '') + (b.flatNo || '');

    wsData.push([
      idx + 1,
      b.billNo || '',
      b.billDate ? b.billDate.split('T')[0] : '',
      b.dueDate ? b.dueDate.split('T')[0] : '',
      b.billType || 'Maintenance',
      b.period || '',
      b.memCode || b.memberCode || '',
      b.memName || b.memberName || '',
      flat,
      prin,
      arr,
      int,
      gross,
      paid,
      bal,
      status
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Bill Register');
  XLSX.writeFile(wb, `Member_Bill_Register_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function formatCurrency(val) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
