// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Member Receipt Register Controller
// ═══════════════════════════════════════════════════════════

let allReceipts = [];
let filteredReceipts = [];
let currentSocietyName = 'SHREE SAI RESIDENCY CO-OP HSG SOC LTD';

document.addEventListener('DOMContentLoaded', () => {
  initSocietyInfo();
  loadReceiptRegister();
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
    if (lbl) lbl.innerHTML = `<i class="bi bi-building"></i> ${currentSocietyName} — Member Collection & Bank Register`;
    const prtSoc = document.getElementById('prt-soc-name');
    if (prtSoc) prtSoc.innerText = currentSocietyName;
  } catch (e) {}
}

async function loadReceiptRegister() {
  const tbody = document.getElementById('tbl-receipts-body');
  if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="col-center" style="padding:30px; color:#94a3b8;"><i class="bi bi-hourglass-split"></i> Loading Member Receipt Register...</td></tr>`;

  try {
    const res = await fetch(getApiUrl('member-receipts?societyId=1&fyId=1'));
    const data = await res.json();

    if (data.success && Array.isArray(data.data)) {
      allReceipts = data.data;
    } else if (Array.isArray(data)) {
      allReceipts = data;
    } else {
      allReceipts = [];
    }

    populateBankAccounts();
    applyFilters();
  } catch (err) {
    console.error('Failed to load receipt register:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="col-center" style="padding:30px; color:#dc2626;">Error loading receipts: ${err.message}</td></tr>`;
  }
}

function populateBankAccounts() {
  const bankSet = new Set();
  allReceipts.forEach(r => {
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
  const mode = document.getElementById('flt-mode')?.value || 'ALL';
  const bank = document.getElementById('flt-bank')?.value || 'ALL';
  const search = (document.getElementById('flt-search')?.value || '').toLowerCase().trim();

  filteredReceipts = allReceipts.filter(r => {
    const pMode = (r.paymentMode || r.mode || r.voucherType || '').trim().toLowerCase();
    const chq = (r.chqNo || r.chequeNo || r.refNo || '').trim();
    const bName = (r.cashBankName || r.bankName || '').trim();

    if (mode === 'CHEQUE' && (!chq || pMode.includes('cash') || pMode.includes('online') || pMode.includes('neft') || pMode.includes('upi'))) return false;
    if (mode === 'ONLINE' && !pMode.includes('online') && !pMode.includes('neft') && !pMode.includes('rtgs') && !pMode.includes('upi') && !chq.toLowerCase().startsWith('utr')) return false;
    if (mode === 'CASH' && !pMode.includes('cash') && !bName.toLowerCase().includes('cash')) return false;

    if (bank !== 'ALL' && bName !== bank) return false;

    if (search) {
      const match = (r.voucherNo || r.receiptNo || '').toLowerCase().includes(search) ||
                    (r.personName || r.memName || r.memberName || '').toLowerCase().includes(search) ||
                    (r.personCode || r.memCode || r.memberCode || '').toLowerCase().includes(search) ||
                    (r.chqNo || r.chequeNo || r.refNo || '').toLowerCase().includes(search) ||
                    (r.narration || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    return true;
  });

  renderSummary();
  renderTable();
}

function resetFilters() {
  if (document.getElementById('flt-mode')) document.getElementById('flt-mode').value = 'ALL';
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
  let count = filteredReceipts.length;
  let tot = 0;
  let chq = 0;
  let online = 0;
  let cash = 0;

  filteredReceipts.forEach(r => {
    const amt = parseFloat(r.amount) || 0;
    tot += amt;

    const pMode = (r.paymentMode || r.mode || r.voucherType || '').toLowerCase();
    const cNo = (r.chqNo || r.chequeNo || r.refNo || '').toLowerCase();
    const bName = (r.cashBankName || r.bankName || '').toLowerCase();

    if (pMode.includes('cash') || bName.includes('cash')) {
      cash += amt;
    } else if (pMode.includes('neft') || pMode.includes('online') || pMode.includes('rtgs') || pMode.includes('upi') || cNo.startsWith('utr')) {
      online += amt;
    } else {
      chq += amt;
    }
  });

  const sCount = document.getElementById('stat-count');
  if (sCount) sCount.innerText = `${count} Receipts`;
  const pCount = document.getElementById('pop-count');
  if (pCount) pCount.innerText = `${count} Receipts`;

  if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = '₹' + formatCurrency(tot);
  if (document.getElementById('stat-cheque')) document.getElementById('stat-cheque').innerText = '₹' + formatCurrency(chq);
  if (document.getElementById('stat-online')) document.getElementById('stat-online').innerText = '₹' + formatCurrency(online);
  if (document.getElementById('stat-cash')) document.getElementById('stat-cash').innerText = '₹' + formatCurrency(cash);
}

function renderTable() {
  const tbody = document.getElementById('tbl-receipts-body');
  const tfoot = document.getElementById('tbl-receipts-foot');
  const prtTbody = document.getElementById('prt-tbody');
  const prtTfoot = document.getElementById('prt-tfoot');
  if (!tbody) return;

  if (filteredReceipts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="col-center" style="padding:30px; color:#64748b;">No member receipts match selected criteria.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    if (prtTbody) prtTbody.innerHTML = `<tr><td colspan="12" class="col-center">No records found.</td></tr>`;
    return;
  }

  let html = '';
  let prtHtml = '';
  let totAmt = 0;

  filteredReceipts.forEach((r, idx) => {
    const amt = parseFloat(r.amount) || 0;
    totAmt += amt;

    const rDate = r.voucherDate || r.receiptDate ? (r.voucherDate || r.receiptDate).split('T')[0] : '-';
    const cDate = r.chqDate ? r.chqDate.split('T')[0] : '-';
    const rNo = r.voucherNo || r.receiptNo || ('REC-' + (r.voucherId || idx + 1));
    const memCode = r.personCode || r.memCode || r.memberCode || '-';
    const memName = r.personName || r.memName || r.memberName || '-';
    const bankAcct = r.cashBankName || r.bankName || 'Society Bank A/c';
    const chq = r.chqNo || r.chequeNo || r.refNo || '-';
    const drawn = r.bankName || r.drawnOn || '-';
    const narr = r.narration || r.particular1 || 'Maintenance collection';

    let modeBadge = `<span class="badge-mode badge-cheque">Cheque</span>`;
    let modeText = 'CHEQUE';
    if (bankAcct.toLowerCase().includes('cash') || (r.paymentMode || '').toLowerCase().includes('cash')) {
      modeBadge = `<span class="badge-mode badge-cash">Cash</span>`;
      modeText = 'CASH';
    } else if (chq.toLowerCase().startsWith('utr') || (r.paymentMode || '').toLowerCase().includes('online')) {
      modeBadge = `<span class="badge-mode badge-neft">Online / NEFT</span>`;
      modeText = 'ONLINE';
    }

    html += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td><strong>${escapeHtml(rNo)}</strong></td>
        <td class="col-center">${rDate}</td>
        <td class="col-center"><strong>${escapeHtml(memCode)}</strong></td>
        <td>${escapeHtml(memName)}</td>
        <td>${escapeHtml(bankAcct)}</td>
        <td class="col-center">${modeBadge}</td>
        <td class="col-center">${escapeHtml(chq)}</td>
        <td class="col-center">${cDate}</td>
        <td>${escapeHtml(drawn)}</td>
        <td class="col-right" style="color:#16a34a; font-weight:700;">${formatCurrency(amt)}</td>
        <td><span style="color:#64748b; font-size:10.5px;">${escapeHtml(narr)}</span></td>
      </tr>
    `;

    prtHtml += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td>${escapeHtml(rNo)}</td>
        <td class="col-center">${rDate}</td>
        <td class="col-center">${escapeHtml(memCode)}</td>
        <td>${escapeHtml(memName)}</td>
        <td>${escapeHtml(bankAcct)}</td>
        <td class="col-center">${modeText}</td>
        <td class="col-center">${escapeHtml(chq)}</td>
        <td class="col-center">${cDate}</td>
        <td>${escapeHtml(drawn)}</td>
        <td class="col-right"><strong>${formatCurrency(amt)}</strong></td>
        <td>${escapeHtml(narr)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  if (prtTbody) prtTbody.innerHTML = prtHtml;

  const footHtml = `
    <tr>
      <td colspan="10" class="col-left" style="font-weight:800; text-transform:uppercase;">Grand Total Collections (${filteredReceipts.length} Receipts)</td>
      <td class="col-right" style="color:#16a34a; font-size:12px;">₹ ${formatCurrency(totAmt)}</td>
      <td></td>
    </tr>
  `;
  if (tfoot) tfoot.innerHTML = footHtml;
  if (prtTfoot) prtTfoot.innerHTML = footHtml;
}

function exportReceiptRegisterExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded.');
    return;
  }

  const wsData = [
    [currentSocietyName],
    ['MEMBER RECEIPT REGISTER'],
    [`Generated on: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Sr No', 'Receipt No', 'Receipt Date', 'Member Code', 'Member Name', 'Deposited Bank', 'Mode', 'Chq/Ref No', 'Chq Date', 'Drawn On', 'Amount (₹)', 'Narration']
  ];

  filteredReceipts.forEach((r, idx) => {
    const amt = parseFloat(r.amount) || 0;
    const rDate = r.voucherDate || r.receiptDate ? (r.voucherDate || r.receiptDate).split('T')[0] : '';
    const cDate = r.chqDate ? r.chqDate.split('T')[0] : '';
    const rNo = r.voucherNo || r.receiptNo || ('REC-' + (r.voucherId || idx + 1));
    const memCode = r.personCode || r.memCode || r.memberCode || '';
    const memName = r.personName || r.memName || r.memberName || '';
    const bankAcct = r.cashBankName || r.bankName || 'Society Bank A/c';
    const chq = r.chqNo || r.chequeNo || r.refNo || '';
    const drawn = r.bankName || r.drawnOn || '';
    const narr = r.narration || r.particular1 || '';

    wsData.push([
      idx + 1,
      rNo,
      rDate,
      memCode,
      memName,
      bankAcct,
      chq.startsWith('UTR') ? 'ONLINE' : (bankAcct.toLowerCase().includes('cash') ? 'CASH' : 'CHEQUE'),
      chq,
      cDate,
      drawn,
      amt,
      narr
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Receipt Register');
  XLSX.writeFile(wb, `Member_Receipt_Register_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function formatCurrency(val) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
