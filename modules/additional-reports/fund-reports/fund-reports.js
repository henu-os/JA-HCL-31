// ═════════════════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — FUND REPORTS & INVESTMENTS LOGIC
// ═════════════════════════════════════════════════════════════════════

let currentFunds = [];
let currentLedger = [];
let currentInvestments = [];
let currentSummary = null;

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];

  const invStart = document.getElementById('inv-start');
  if (invStart) invStart.value = today;
  const invMat = document.getElementById('inv-mat-date');
  if (invMat) invMat.value = nextYear;

  loadFundData();
});

function getApiUrl(endpoint) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:5002/api';
  return `${base}/additional-reports/${endpoint}`;
}

async function loadFundData() {
  const fy = document.getElementById('fnd-fy').value;
  const selFund = document.getElementById('fnd-select-fund').value;

  const lblPeriod = document.getElementById('lbl-fnd-period');
  if (lblPeriod) lblPeriod.textContent = `FY ${fy}`;

  try {
    // 1. Fetch Summary & Fund Balances
    const sumRes = await fetch(getApiUrl('funds/summary'));
    const sumData = await sumRes.json();
    if (sumData.success) {
      currentSummary = sumData;
      currentFunds = sumData.funds || [];
      renderSocietyHeader(sumData.society);
      renderKpiCards(sumData.summary);
      renderFundsTable(currentFunds);
      renderFormN(currentFunds);
      populateFundDropdowns(currentFunds);
    }

    // 2. Fetch Ledger
    let ledUrl = 'funds/ledger';
    if (selFund && selFund !== 'ALL') ledUrl += `?fundId=${selFund}`;
    const ledRes = await fetch(getApiUrl(ledUrl));
    const ledData = await ledRes.json();
    if (ledData.success) {
      currentLedger = ledData.data || [];
      renderLedgerTable(currentLedger);
    }

    // 3. Fetch Investments
    const invRes = await fetch(getApiUrl('funds/investments'));
    const invData = await invRes.json();
    if (invData.success) {
      currentInvestments = invData.data || [];
      renderInvestmentsTable(currentInvestments);
      const cntInv = document.getElementById('cnt-investments');
      if (cntInv) cntInv.textContent = currentInvestments.length;
    }
  } catch (err) {
    console.error('Failed to load Fund data:', err);
  }
}

function renderSocietyHeader(soc) {
  if (!soc) return;
  const elName = document.getElementById('soc-name');
  if (elName && soc.societyName) elName.textContent = soc.societyName;
  const elAddr = document.getElementById('soc-address');
  if (elAddr && soc.address) elAddr.textContent = `${soc.address}, ${soc.state || ''} - ${soc.pincode || ''}`;
  const elPan = document.getElementById('soc-pan');
  if (elPan && soc.pan) elPan.textContent = soc.pan;
  const elTan = document.getElementById('soc-tan');
  if (elTan && soc.tan) elTan.textContent = soc.tan;
}

function renderKpiCards(sum) {
  if (!sum) return;
  const fmt = (n) => '₹ ' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('kpi-fnd-count').textContent = sum.totalFundsCount || 0;
  document.getElementById('kpi-fnd-opening').textContent = fmt(sum.totalOpeningBalance);
  document.getElementById('kpi-fnd-contrib').textContent = fmt(sum.totalContributions);
  document.getElementById('kpi-fnd-util').textContent = fmt(sum.totalUtilization);
  document.getElementById('kpi-fnd-invest').textContent = fmt(sum.totalInvestments);
  document.getElementById('kpi-fnd-closing').textContent = fmt(sum.totalClosingBalance);
}

function renderFundsTable(funds) {
  const tbody = document.getElementById('tbl-funds-body');
  if (!tbody) return;

  if (!funds || funds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 24px;">No society funds found.</td></tr>`;
    return;
  }

  let totOp = 0, totAdd = 0, totDed = 0, totClose = 0;
  let html = '';

  funds.forEach((f, i) => {
    totOp += parseFloat(f.openingBalance) || 0;
    totAdd += parseFloat(f.additions) || 0;
    totDed += parseFloat(f.deductions) || 0;
    totClose += parseFloat(f.closingBalance) || 0;

    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td><strong>${escapeHtml(f.fundName)}</strong></td>
        <td><code>${f.fundCode}</code></td>
        <td><span class="badge-stat">${f.fundType}</span></td>
        <td class="text-right">₹ ${(parseFloat(f.openingBalance) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#16a34a;">₹ ${(parseFloat(f.additions) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#dc2626;">₹ ${(parseFloat(f.deductions) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${(parseFloat(f.closingBalance) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="status-tag status-confirmed">Active</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  const fmt = (n) => '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const top = document.getElementById('tot-fnd-opening');
  if (top) top.textContent = fmt(totOp);
  const tadd = document.getElementById('tot-fnd-add');
  if (tadd) tadd.textContent = fmt(totAdd);
  const tded = document.getElementById('tot-fnd-ded');
  if (tded) tded.textContent = fmt(totDed);
  const tcls = document.getElementById('tot-fnd-closing');
  if (tcls) tcls.textContent = fmt(totClose);
}

function renderLedgerTable(list) {
  const tbody = document.getElementById('tbl-ledger-body');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 24px; color: #64748b;">No fund movements found. Click "Add Transaction" or "Inter-Fund Transfer" to record entries.</td></tr>`;
    return;
  }

  let html = '';
  list.forEach((t, i) => {
    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td>${t.txnDate}</td>
        <td><strong>${escapeHtml(t.fundName)}</strong></td>
        <td><span class="badge-stat">${t.txnType}</span></td>
        <td>${escapeHtml(t.description || '-')}</td>
        <td>${escapeHtml(t.partyName || '-')}</td>
        <td>${t.voucherRef || '-'}</td>
        <td class="text-right" style="font-weight:700;">₹ ${(parseFloat(t.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="status-tag status-confirmed">${t.approvalStatus}</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderInvestmentsTable(list) {
  const tbody = document.getElementById('tbl-investments-body');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 20px; color: #64748b;">No Fixed Deposits or Term Investments recorded yet.</td></tr>`;
    return;
  }

  let html = '';
  list.forEach(inv => {
    html += `
      <tr>
        <td><strong>${escapeHtml(inv.bankName)}</strong></td>
        <td>${escapeHtml(inv.fundName)}</td>
        <td><code>${inv.investmentNo}</code></td>
        <td class="text-right" style="font-weight:700;">₹ ${(parseFloat(inv.principal) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td>${inv.startDate}</td>
        <td>${inv.maturityDate}</td>
        <td class="text-center">${inv.interestRate}%</td>
        <td class="text-right" style="color:#16a34a;">₹ ${(parseFloat(inv.expectedInterest) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${(parseFloat(inv.maturityAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="status-tag status-confirmed">${inv.status}</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderFormN(funds) {
  const tbody = document.getElementById('tbl-form-n-body');
  if (!tbody) return;

  let html = '';
  let tot = 0;
  funds.forEach(f => {
    const amt = parseFloat(f.closingBalance) || 0;
    tot += amt;
    html += `
      <tr>
        <td><strong>${escapeHtml(f.fundName)}</strong> (${f.fundType})</td>
        <td class="text-right" style="font-weight:600;">₹ ${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  html += `
    <tr class="total-row">
      <td class="text-right"><strong>Total Statutory Funds (Form N Schedule):</strong></td>
      <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${tot.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>
  `;
  tbody.innerHTML = html;
}

function populateFundDropdowns(funds) {
  const selTop = document.getElementById('fnd-select-fund');
  const selTxn = document.getElementById('txn-fund-id');
  const selTrfSrc = document.getElementById('trf-src');
  const selTrfDest = document.getElementById('trf-dest');
  const selInv = document.getElementById('inv-fund-id');

  let opts = '<option value="ALL">All Society Funds</option>';
  let modalOpts = '';

  funds.forEach(f => {
    opts += `<option value="${f.fundId}">${escapeHtml(f.fundName)} (${f.fundCode})</option>`;
    modalOpts += `<option value="${f.fundId}">${escapeHtml(f.fundName)} (${f.fundCode})</option>`;
  });

  if (selTop) selTop.innerHTML = opts;
  if (selTxn) selTxn.innerHTML = modalOpts;
  if (selTrfSrc) selTrfSrc.innerHTML = modalOpts;
  if (selTrfDest) selTrfDest.innerHTML = modalOpts;
  if (selInv) selInv.innerHTML = modalOpts;
}

function switchFundTab(tabId, btn) {
  document.querySelectorAll('.fnd-tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.fnd-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ── Modals ─────────────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

function openAddTxnModal() {
  openModal('modal-fund-txn');
}

function openTransferModal() {
  openModal('modal-transfer');
}

function openInvestmentModal() {
  document.getElementById('inv-no').value = 'FD-' + Math.floor(100000 + Math.random() * 900000);
  openModal('modal-investment');
}

async function submitFundTxn() {
  const fundId = parseInt(document.getElementById('txn-fund-id').value);
  const type = document.getElementById('txn-type').value;
  const amount = parseFloat(document.getElementById('txn-amount').value) || 0;
  const desc = document.getElementById('txn-desc').value.trim();
  const party = document.getElementById('txn-party').value.trim();
  const vref = document.getElementById('txn-vref').value.trim();

  if (amount <= 0 || !fundId) {
    alert('Please enter a valid amount and select a fund.');
    return;
  }

  const payload = {
    fundId: fundId,
    txnType: type,
    amount: amount,
    description: desc,
    partyName: party,
    voucherRef: vref
  };

  try {
    const res = await fetch(getApiUrl('funds/transactions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('Fund transaction recorded successfully.');
      closeModal('modal-fund-txn');
      loadFundData();
    } else {
      alert('Failed: ' + data.message);
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function submitTransfer() {
  const src = parseInt(document.getElementById('trf-src').value);
  const dest = parseInt(document.getElementById('trf-dest').value);
  const amount = parseFloat(document.getElementById('trf-amount').value) || 0;
  const reason = document.getElementById('trf-reason').value.trim();

  if (src === dest) {
    alert('Source and destination funds cannot be the same.');
    return;
  }
  if (amount <= 0) {
    alert('Please enter a valid transfer amount.');
    return;
  }

  const payload = {
    sourceFundId: src,
    destFundId: dest,
    amount: amount,
    reason: reason
  };

  try {
    const res = await fetch(getApiUrl('funds/transfer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('Inter-Fund transfer completed successfully.');
      closeModal('modal-transfer');
      loadFundData();
    } else {
      alert('Transfer failed: ' + data.message);
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function submitInvestment() {
  const fundId = parseInt(document.getElementById('inv-fund-id').value);
  const bank = document.getElementById('inv-bank').value.trim();
  const invNo = document.getElementById('inv-no').value.trim();
  const principal = parseFloat(document.getElementById('inv-principal').value) || 0;
  const start = document.getElementById('inv-start').value;
  const matDate = document.getElementById('inv-mat-date').value;
  const rate = parseFloat(document.getElementById('inv-rate').value) || 6.75;

  if (principal <= 0 || !invNo) {
    alert('Please enter valid principal amount and FD receipt number.');
    return;
  }

  const payload = {
    fundId: fundId,
    bankName: bank,
    investmentNo: invNo,
    principal: principal,
    startDate: start,
    maturityDate: matDate,
    interestRate: rate
  };

  try {
    const res = await fetch(getApiUrl('funds/investments'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('Fixed Deposit investment recorded successfully.');
      closeModal('modal-investment');
      loadFundData();
    } else {
      alert('Failed: ' + data.message);
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

function exportFundExcel() {
  if (!currentFunds || currentFunds.length === 0) {
    alert('No data to export.');
    return;
  }

  let csv = 'Sr No,Fund Name,Code,Type,Opening Balance,Additions / Receipts,Utilization / Deductions,Closing Balance\n';
  currentFunds.forEach((f, i) => {
    csv += `"${i + 1}","${f.fundName}","${f.fundCode}","${f.fundType}","${f.openingBalance}","${f.additions}","${f.deductions}","${f.closingBalance}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Fund_Accounting_Report_${document.getElementById('fnd-fy').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
