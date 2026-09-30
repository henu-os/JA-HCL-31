// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Member JV Register Controller
// ═══════════════════════════════════════════════════════════

let allJVs = [];
let filteredJVs = [];
let currentSocietyName = 'SHREE SAI RESIDENCY CO-OP HSG SOC LTD';

document.addEventListener('DOMContentLoaded', () => {
  initSocietyInfo();
  loadMemberJVs();
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
    if (lbl) lbl.innerHTML = `<i class="bi bi-building"></i> ${currentSocietyName} — Member Journal Vouchers`;
    const prtSoc = document.getElementById('prt-soc-name');
    if (prtSoc) prtSoc.innerText = currentSocietyName;
  } catch (e) {}
}

async function loadMemberJVs() {
  const tbody = document.getElementById('tbl-jv-body');
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="col-center" style="padding:30px; color:#94a3b8;"><i class="bi bi-hourglass-split"></i> Loading Member JVs...</td></tr>`;

  try {
    const res = await fetch(getApiUrl('vouchers/register?societyId=1&fyId=1&type=Journal'));
    const data = await res.json();

    if (data.success && Array.isArray(data.data)) {
      allJVs = data.data;
    } else if (Array.isArray(data)) {
      allJVs = data;
    } else {
      allJVs = [];
    }

    applyFilters();
  } catch (err) {
    console.error('Failed to load member JVs:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="col-center" style="padding:30px; color:#dc2626;">Error loading member JVs: ${err.message}</td></tr>`;
  }
}

function applyFilters() {
  const search = (document.getElementById('flt-search')?.value || '').toLowerCase().trim();

  filteredJVs = allJVs.filter(j => {
    if (search) {
      const match = (j.voucherNo || '').toLowerCase().includes(search) ||
                    (j.personName || j.memName || '').toLowerCase().includes(search) ||
                    (j.personCode || j.memCode || '').toLowerCase().includes(search) ||
                    (j.narration || '').toLowerCase().includes(search) ||
                    (j.particular1 || '').toLowerCase().includes(search);
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
  let count = filteredJVs.length;
  let tot = 0;

  filteredJVs.forEach(j => {
    tot += parseFloat(j.amount) || 0;
  });

  const sCount = document.getElementById('stat-count');
  if (sCount) sCount.innerText = `${count} JVs`;
  const pCount = document.getElementById('pop-count');
  if (pCount) pCount.innerText = `${count} JVs`;

  if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = '₹' + formatCurrency(tot);
}

function renderTable() {
  const tbody = document.getElementById('tbl-jv-body');
  const tfoot = document.getElementById('tbl-jv-foot');
  const prtTbody = document.getElementById('prt-tbody');
  const prtTfoot = document.getElementById('prt-tfoot');
  if (!tbody) return;

  if (filteredJVs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="col-center" style="padding:30px; color:#64748b;">No member journal entries match selected criteria.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    if (prtTbody) prtTbody.innerHTML = `<tr><td colspan="8" class="col-center">No records found.</td></tr>`;
    return;
  }

  let html = '';
  let prtHtml = '';
  let totAmt = 0;

  filteredJVs.forEach((j, idx) => {
    const amt = parseFloat(j.amount) || 0;
    totAmt += amt;

    const jDate = j.voucherDate ? j.voucherDate.split('T')[0] : '-';
    const vNo = j.voucherNo || ('JV-' + (j.voucherId || idx + 1));
    const memCode = j.personCode || j.memCode || '-';
    const memName = j.personName || j.memName || 'Member Journal Entry';
    const part = j.particular1 || j.cashBankName || 'Member Ledger Account';
    const narr = j.narration || 'Year-end / audit adjustment';

    html += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td><strong>${escapeHtml(vNo)}</strong></td>
        <td class="col-center">${jDate}</td>
        <td class="col-center"><strong>${escapeHtml(memCode)}</strong></td>
        <td>${escapeHtml(memName)}</td>
        <td>${escapeHtml(part)}</td>
        <td class="col-right" style="color:#2563eb; font-weight:700;">${formatCurrency(amt)}</td>
        <td><span style="color:#64748b; font-size:10.5px;">${escapeHtml(narr)}</span></td>
      </tr>
    `;

    prtHtml += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td>${escapeHtml(vNo)}</td>
        <td class="col-center">${jDate}</td>
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
      <td colspan="6" class="col-left" style="font-weight:800; text-transform:uppercase;">Total Member JVs (${filteredJVs.length})</td>
      <td class="col-right" style="color:#2563eb; font-size:12px;">₹ ${formatCurrency(totAmt)}</td>
      <td></td>
    </tr>
  `;
  if (tfoot) tfoot.innerHTML = footHtml;
  if (prtTfoot) prtTfoot.innerHTML = footHtml;
}

function exportMemberJvRegisterExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded.');
    return;
  }

  const wsData = [
    [currentSocietyName],
    ['MEMBER JV REGISTER'],
    [`Generated on: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Sr No', 'JV No', 'Date', 'Member Code', 'Member Name', 'Particular / Account', 'Amount (₹)', 'Narration']
  ];

  filteredJVs.forEach((j, idx) => {
    const amt = parseFloat(j.amount) || 0;
    const jDate = j.voucherDate ? j.voucherDate.split('T')[0] : '';
    const vNo = j.voucherNo || ('JV-' + (j.voucherId || idx + 1));
    const memCode = j.personCode || j.memCode || '';
    const memName = j.personName || j.memName || '';
    const part = j.particular1 || j.cashBankName || '';
    const narr = j.narration || '';

    wsData.push([
      idx + 1,
      vNo,
      jDate,
      memCode,
      memName,
      part,
      amt,
      narr
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Member JVs');
  XLSX.writeFile(wb, `Member_JV_Register_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function formatCurrency(val) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
