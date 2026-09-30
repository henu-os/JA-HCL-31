// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Member Adjustment Register Controller
// ═══════════════════════════════════════════════════════════

let allAdjustments = [];
let filteredAdjustments = [];
let currentSocietyName = 'SHREE SAI RESIDENCY CO-OP HSG SOC LTD';

document.addEventListener('DOMContentLoaded', () => {
  initSocietyInfo();
  loadAdjustments();
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
    if (lbl) lbl.innerHTML = `<i class="bi bi-building"></i> ${currentSocietyName} — Member Dues & Inter-Head Adjustments`;
    const prtSoc = document.getElementById('prt-soc-name');
    if (prtSoc) prtSoc.innerText = currentSocietyName;
  } catch (e) {}
}

async function loadAdjustments() {
  const tbody = document.getElementById('tbl-adj-body');
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="col-center" style="padding:30px; color:#94a3b8;"><i class="bi bi-hourglass-split"></i> Loading Adjustments...</td></tr>`;

  try {
    const res = await fetch(getApiUrl('vouchers/register?societyId=1&fyId=1&type=Adjustment'));
    const data = await res.json();

    if (data.success && Array.isArray(data.data)) {
      allAdjustments = data.data;
    } else if (Array.isArray(data)) {
      allAdjustments = data;
    } else {
      allAdjustments = [];
    }

    applyFilters();
  } catch (err) {
    console.error('Failed to load adjustments:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="col-center" style="padding:30px; color:#dc2626;">Error loading adjustments: ${err.message}</td></tr>`;
  }
}

function applyFilters() {
  const search = (document.getElementById('flt-search')?.value || '').toLowerCase().trim();

  filteredAdjustments = allAdjustments.filter(a => {
    if (search) {
      const match = (a.voucherNo || '').toLowerCase().includes(search) ||
                    (a.personName || a.memName || '').toLowerCase().includes(search) ||
                    (a.personCode || a.memCode || '').toLowerCase().includes(search) ||
                    (a.narration || '').toLowerCase().includes(search) ||
                    (a.particular1 || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    return true;
  });

  renderSummary();
  renderTable();
}

function resetFilters() {
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
  let count = filteredAdjustments.length;
  let tot = 0;

  filteredAdjustments.forEach(a => {
    tot += parseFloat(a.amount) || 0;
  });

  const sCount = document.getElementById('stat-count');
  if (sCount) sCount.innerText = `${count} Vouchers`;
  const pCount = document.getElementById('pop-count');
  if (pCount) pCount.innerText = `${count} Vouchers`;

  if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = '₹' + formatCurrency(tot);
}

function renderTable() {
  const tbody = document.getElementById('tbl-adj-body');
  const tfoot = document.getElementById('tbl-adj-foot');
  const prtTbody = document.getElementById('prt-tbody');
  const prtTfoot = document.getElementById('prt-tfoot');
  if (!tbody) return;

  if (filteredAdjustments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="col-center" style="padding:30px; color:#64748b;">No adjustment entries match selected criteria.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    if (prtTbody) prtTbody.innerHTML = `<tr><td colspan="8" class="col-center">No records found.</td></tr>`;
    return;
  }

  let html = '';
  let prtHtml = '';
  let totAmt = 0;

  filteredAdjustments.forEach((a, idx) => {
    const amt = parseFloat(a.amount) || 0;
    totAmt += amt;

    const aDate = a.voucherDate ? a.voucherDate.split('T')[0] : '-';
    const vNo = a.voucherNo || ('ADJ-' + (a.voucherId || idx + 1));
    const memCode = a.personCode || a.memCode || '-';
    const memName = a.personName || a.memName || 'Member Adjustment';
    const part = a.particular1 || a.cashBankName || 'Member Ledger Adjustment';
    const narr = a.narration || 'Inter-head transfer / dues set-off';

    html += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td><strong>${escapeHtml(vNo)}</strong></td>
        <td class="col-center">${aDate}</td>
        <td class="col-center"><strong>${escapeHtml(memCode)}</strong></td>
        <td>${escapeHtml(memName)}</td>
        <td>${escapeHtml(part)}</td>
        <td class="col-right" style="color:#d97706; font-weight:700;">${formatCurrency(amt)}</td>
        <td><span style="color:#64748b; font-size:10.5px;">${escapeHtml(narr)}</span></td>
      </tr>
    `;

    prtHtml += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td>${escapeHtml(vNo)}</td>
        <td class="col-center">${aDate}</td>
        <td class="col-center">${escapeHtml(memCode)}</td>
        <td>${escapeHtml(memName)}</td>
        <td>${escapeHtml(part)}</td>
        <td class="col-right"><strong>${formatCurrency(amt)}</strong></td>
        <td>${escapeHtml(narr)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  if (prtTbody) prtTbody.innerHTML = prtHtml;

  const footHtml = `
    <tr>
      <td colspan="6" class="col-left" style="font-weight:800; text-transform:uppercase;">Total Adjustments (${filteredAdjustments.length})</td>
      <td class="col-right" style="color:#d97706; font-size:12px;">₹ ${formatCurrency(totAmt)}</td>
      <td></td>
    </tr>
  `;
  if (tfoot) tfoot.innerHTML = footHtml;
  if (prtTfoot) prtTfoot.innerHTML = footHtml;
}

function exportAdjustmentRegisterExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded.');
    return;
  }

  const wsData = [
    [currentSocietyName],
    ['MEMBER ADJUSTMENT REGISTER'],
    [`Generated on: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Sr No', 'Voucher No', 'Date', 'Member Code', 'Member Name', 'Particular / Account', 'Adjusted Amount (₹)', 'Narration']
  ];

  filteredAdjustments.forEach((a, idx) => {
    const amt = parseFloat(a.amount) || 0;
    const aDate = a.voucherDate ? a.voucherDate.split('T')[0] : '';
    const vNo = a.voucherNo || ('ADJ-' + (a.voucherId || idx + 1));
    const memCode = a.personCode || a.memCode || '';
    const memName = a.personName || a.memName || '';
    const part = a.particular1 || a.cashBankName || '';
    const narr = a.narration || '';

    wsData.push([
      idx + 1,
      vNo,
      aDate,
      memCode,
      memName,
      part,
      amt,
      narr
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Adjustments');
  XLSX.writeFile(wb, `Member_Adjustment_Register_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function formatCurrency(val) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
