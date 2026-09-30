// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Bank Deposit List & Pay-in Slip Controller
// ═══════════════════════════════════════════════════════════

let allDeposits = [];
let filteredDeposits = [];
let currentSocietyName = 'SHREE SAI RESIDENCY CO-OP HSG SOC LTD';

document.addEventListener('DOMContentLoaded', () => {
  initSocietyInfo();
  loadBankDeposits();
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
    if (lbl) lbl.innerHTML = `<i class="bi bi-building"></i> ${currentSocietyName} — Cheque &amp; DD Deposit Slips`;
    const prtSoc = document.getElementById('prt-soc-name');
    if (prtSoc) prtSoc.innerText = currentSocietyName;
  } catch (e) {}
}

async function loadBankDeposits() {
  const tbody = document.getElementById('tbl-deposit-body');
  if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="col-center" style="padding:30px; color:#94a3b8;"><i class="bi bi-hourglass-split"></i> Loading Bank Deposit List...</td></tr>`;

  try {
    const res = await fetch(getApiUrl('member-receipts?societyId=1&fyId=1'));
    const data = await res.json();

    let list = [];
    if (data.success && Array.isArray(data.data)) {
      list = data.data;
    } else if (Array.isArray(data)) {
      list = data;
    }

    // Filter only cheque / DD / instrument payments
    allDeposits = list.filter(r => {
      const pMode = (r.paymentMode || r.mode || r.voucherType || '').toLowerCase();
      const bName = (r.cashBankName || r.bankName || '').toLowerCase();
      if (pMode.includes('cash') || bName.includes('cash')) return false;
      return true;
    });

    populateBankAccounts();
    applyFilters();
  } catch (err) {
    console.error('Failed to load bank deposit list:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="col-center" style="padding:30px; color:#dc2626;">Error loading deposit list: ${err.message}</td></tr>`;
  }
}

function populateBankAccounts() {
  const bankSet = new Set();
  allDeposits.forEach(r => {
    const bName = r.cashBankName || r.bankName;
    if (bName) bankSet.add(bName.trim());
  });

  const selBank = document.getElementById('flt-bank');
  if (selBank) {
    const cur = selBank.value;
    selBank.innerHTML = `<option value="ALL">-- All Bank Accounts --</option>` +
      Array.from(bankSet).sort().map(b => `<option value="${b}">${b}</option>`).join('');
    if (bankSet.has(cur)) selBank.value = cur;
  }
}

function applyFilters() {
  const bank = document.getElementById('flt-bank')?.value || 'ALL';
  const search = (document.getElementById('flt-search')?.value || '').toLowerCase().trim();

  filteredDeposits = allDeposits.filter(r => {
    const bName = (r.cashBankName || r.bankName || '').trim();
    if (bank !== 'ALL' && bName !== bank) return false;

    if (search) {
      const match = (r.voucherNo || r.receiptNo || '').toLowerCase().includes(search) ||
                    (r.personName || r.memName || r.memberName || '').toLowerCase().includes(search) ||
                    (r.personCode || r.memCode || r.memberCode || '').toLowerCase().includes(search) ||
                    (r.chqNo || r.chequeNo || r.refNo || '').toLowerCase().includes(search) ||
                    (r.bankName || r.drawnOn || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    return true;
  });

  renderSummary();
  renderTable();
}

function resetFilters() {
  if (document.getElementById('flt-bank')) document.getElementById('flt-bank').value = 'ALL';
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
  let count = filteredDeposits.length;
  let tot = 0;

  filteredDeposits.forEach(r => {
    tot += parseFloat(r.amount) || 0;
  });

  const sCount = document.getElementById('stat-count');
  if (sCount) sCount.innerText = `${count} Cheques`;
  const pCount = document.getElementById('pop-count');
  if (pCount) pCount.innerText = `${count} Cheques`;

  if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = '₹' + formatCurrency(tot);
}

function renderTable() {
  const tbody = document.getElementById('tbl-deposit-body');
  const tfoot = document.getElementById('tbl-deposit-foot');
  const prtTbody = document.getElementById('prt-tbody');
  const prtTfoot = document.getElementById('prt-tfoot');
  if (!tbody) return;

  if (filteredDeposits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="col-center" style="padding:30px; color:#64748b;">No cheques / deposit items match selected criteria.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    if (prtTbody) prtTbody.innerHTML = `<tr><td colspan="10" class="col-center">No records found.</td></tr>`;
    return;
  }

  let html = '';
  let prtHtml = '';
  let totAmt = 0;

  filteredDeposits.forEach((r, idx) => {
    const amt = parseFloat(r.amount) || 0;
    totAmt += amt;

    const rDate = r.voucherDate || r.receiptDate ? (r.voucherDate || r.receiptDate).split('T')[0] : '-';
    const cDate = r.chqDate ? r.chqDate.split('T')[0] : '-';
    const rNo = r.voucherNo || r.receiptNo || ('REC-' + (r.voucherId || idx + 1));
    const memCode = r.personCode || r.memCode || r.memberCode || '-';
    const memName = r.personName || r.memName || r.memberName || '-';
    const chq = r.chqNo || r.chequeNo || r.refNo || '-';
    const drawn = r.bankName || r.drawnOn || '-';
    const bankAcct = r.cashBankName || 'Society Bank Account';

    html += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td><strong>${escapeHtml(rNo)}</strong></td>
        <td class="col-center">${rDate}</td>
        <td class="col-center"><strong>${escapeHtml(memCode)}</strong></td>
        <td>${escapeHtml(memName)}</td>
        <td class="col-center"><strong>${escapeHtml(chq)}</strong></td>
        <td class="col-center">${cDate}</td>
        <td>${escapeHtml(drawn)}</td>
        <td>${escapeHtml(bankAcct)}</td>
        <td class="col-right" style="color:#16a34a; font-weight:700;">${formatCurrency(amt)}</td>
      </tr>
    `;

    prtHtml += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td>${escapeHtml(rNo)}</td>
        <td class="col-center">${rDate}</td>
        <td class="col-center">${escapeHtml(memCode)}</td>
        <td>${escapeHtml(memName)}</td>
        <td class="col-center"><strong>${escapeHtml(chq)}</strong></td>
        <td class="col-center">${cDate}</td>
        <td>${escapeHtml(drawn)}</td>
        <td>${escapeHtml(bankAcct)}</td>
        <td class="col-right"><strong>${formatCurrency(amt)}</strong></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  if (prtTbody) prtTbody.innerHTML = prtHtml;

  const footHtml = `
    <tr>
      <td colspan="9" class="col-left" style="font-weight:800; text-transform:uppercase;">Total Deposit Amount (${filteredDeposits.length} Items)</td>
      <td class="col-right" style="color:#16a34a; font-size:12px;">₹ ${formatCurrency(totAmt)}</td>
    </tr>
  `;
  if (tfoot) tfoot.innerHTML = footHtml;
  if (prtTfoot) prtTfoot.innerHTML = footHtml;
}

function exportBankDepositExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded.');
    return;
  }

  const wsData = [
    [currentSocietyName],
    ['BANK DEPOSIT LIST / PAY-IN STATEMENT'],
    [`Generated on: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Sr No', 'Receipt No', 'Receipt Date', 'Member Code', 'Member Name', 'Cheque / DD No', 'Cheque Date', 'Drawn On Bank', 'Deposited Bank', 'Amount (₹)']
  ];

  filteredDeposits.forEach((r, idx) => {
    const amt = parseFloat(r.amount) || 0;
    const rDate = r.voucherDate || r.receiptDate ? (r.voucherDate || r.receiptDate).split('T')[0] : '';
    const cDate = r.chqDate ? r.chqDate.split('T')[0] : '';
    const rNo = r.voucherNo || r.receiptNo || ('REC-' + (r.voucherId || idx + 1));
    const memCode = r.personCode || r.memCode || r.memberCode || '';
    const memName = r.personName || r.memName || r.memberName || '';
    const chq = r.chqNo || r.chequeNo || r.refNo || '';
    const drawn = r.bankName || r.drawnOn || '';
    const bankAcct = r.cashBankName || 'Society Bank Account';

    wsData.push([
      idx + 1,
      rNo,
      rDate,
      memCode,
      memName,
      chq,
      cDate,
      drawn,
      bankAcct,
      amt
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Deposit List');
  XLSX.writeFile(wb, `Bank_Deposit_List_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function formatCurrency(val) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
