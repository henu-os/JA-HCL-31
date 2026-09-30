// ═════════════════════════════════════════════════════════════════════
// HENU ERP — TDS REPORT & COMPLIANCE LOGIC
// ═════════════════════════════════════════════════════════════════════

let currentTransactions = [];
let currentSummary = null;
let currentChallans = [];
let currentRules = [];

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('txn-date');
  if (dateInput) dateInput.value = today;
  const chDate = document.getElementById('ch-date');
  if (chDate) chDate.value = today;

  onQuarterChanged(); // initializes From & To date according to FY and quarter
  loadTdsData();
  recalcTdsModal();
});

function getApiUrl(endpoint) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:5002/api';
  return `${base}/additional-reports/${endpoint}`;
}

function onFyChanged() {
  onQuarterChanged();
}

function onQuarterChanged() {
  const fy = document.getElementById('tds-fy').value || '2026-2027';
  const q = document.getElementById('tds-quarter').value || 'ALL';
  const startYear = parseInt(fy.split('-')[0]) || 2026;
  const endYear = startYear + 1;

  let fromDate = `${startYear}-04-01`;
  let toDate = `${endYear}-03-31`;

  if (q === 'Q1') {
    fromDate = `${startYear}-04-01`;
    toDate = `${startYear}-06-30`;
  } else if (q === 'Q2') {
    fromDate = `${startYear}-07-01`;
    toDate = `${startYear}-09-30`;
  } else if (q === 'Q3') {
    fromDate = `${startYear}-10-01`;
    toDate = `${startYear}-12-31`;
  } else if (q === 'Q4') {
    fromDate = `${endYear}-01-01`;
    toDate = `${endYear}-03-31`;
  }

  const fromEl = document.getElementById('tds-from-date');
  const toEl = document.getElementById('tds-to-date');
  if (fromEl) fromEl.value = fromDate;
  if (toEl) toEl.value = toDate;

  loadTdsData();
}

async function loadTdsData() {
  const fy = document.getElementById('tds-fy').value;
  const quarter = document.getElementById('tds-quarter').value;
  const fromDate = document.getElementById('tds-from-date') ? document.getElementById('tds-from-date').value : '';
  const toDate = document.getElementById('tds-to-date') ? document.getElementById('tds-to-date').value : '';
  const section = document.getElementById('tds-section-filter').value;
  const status = document.getElementById('tds-status-filter').value;
  const search = document.getElementById('tds-search').value.trim();

  // Update Period Label
  const lblPeriod = document.getElementById('lbl-period');
  if (lblPeriod) {
    lblPeriod.textContent = `FY ${fy} (${quarter === 'ALL' ? `${fromDate} to ${toDate}` : quarter})`;
  }

  try {
    // 1. Fetch Primary Verified TDS Report Dataset
    let reportUrl = `tds/report?fy=${encodeURIComponent(fy)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&section=${encodeURIComponent(section)}&status=${encodeURIComponent(status)}`;
    if (search) reportUrl += `&search=${encodeURIComponent(search)}`;

    const rRes = await fetch(getApiUrl(reportUrl));
    const rData = await rRes.json();

    if (rData.success) {
      currentSummary = {
        society: rData.society,
        summary: rData.summary,
        sectionSummary: rData.sectionSummary
      };
      currentTransactions = rData.data || [];

      renderSocietyHeader(rData.society);
      renderKpiCards(rData.summary);
      renderTransactionsTable(currentTransactions);
      renderSectionSummary(rData.sectionSummary);
      renderDeducteesSummary(currentTransactions);
    }

    // 2. Fetch Challans
    const chRes = await fetch(getApiUrl('tds/challans'));
    const chData = await chRes.json();
    if (chData.success) {
      currentChallans = chData.data || [];
      renderChallansTable(currentChallans);
      const cntCh = document.getElementById('cnt-challans');
      if (cntCh) cntCh.textContent = currentChallans.length;
    }

    // 3. Fetch Rules
    const rulesRes = await fetch(getApiUrl('tds/rules'));
    const rulesData = await rulesRes.json();
    if (rulesData.success) {
      currentRules = rulesData.data || [];
      renderRulesTable(currentRules);
    }
  } catch (err) {
    console.error('Failed to load TDS data:', err);
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
  const elGst = document.getElementById('soc-gstin');
  if (elGst && soc.gstin) elGst.textContent = soc.gstin;
}

function renderKpiCards(sum) {
  if (!sum) return;
  const fmt = (n) => '₹ ' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('kpi-txns').textContent = sum.totalTransactions || 0;
  document.getElementById('kpi-gross').textContent = fmt(sum.totalGrossAmount);
  document.getElementById('kpi-deducted').textContent = fmt(sum.totalTdsDeducted);
  document.getElementById('kpi-deposited').textContent = fmt(sum.totalTdsDeposited);
  document.getElementById('kpi-outstanding').textContent = fmt(sum.totalOutstanding);
  document.getElementById('kpi-challans').textContent = sum.totalChallans || 0;
  document.getElementById('kpi-interest').textContent = fmt((sum.totalInterest || 0) + (sum.totalFees || 0));

  const cntTx = document.getElementById('cnt-txns');
  if (cntTx) cntTx.textContent = sum.totalTransactions || 0;
}

function renderTransactionsTable(list) {
  const tbody = document.getElementById('tbl-tds-body');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="17" class="text-center" style="padding: 24px; color: #64748b;">No TDS transactions found for selected criteria. Click "Detect TDS" or "Add Entry" to create records.</td></tr>`;
    updateTotals(0, 0, 0, 0, 0);
    return;
  }

  let totGross = 0, totTaxable = 0, totTds = 0, totDep = 0, totOut = 0;
  let html = '';

  list.forEach((t, i) => {
    totGross += parseFloat(t.grossAmount) || 0;
    totTaxable += parseFloat(t.taxableAmount) || 0;
    totTds += parseFloat(t.tdsAmount) || 0;
    const depAmt = t.status === 'Deposited' ? (parseFloat(t.tdsAmount) || 0) : 0;
    const outAmt = t.status !== 'Deposited' ? (parseFloat(t.tdsAmount) || 0) : 0;
    totDep += depAmt;
    totOut += outAmt;

    let stClass = 'status-confirmed';
    if (t.status === 'Deposited') stClass = 'status-deposited';
    if (t.status === 'Suggested') stClass = 'status-suggested';
    if (t.status === 'Outstanding') stClass = 'status-outstanding';

    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td><strong>${t.voucherNo || '-'}</strong></td>
        <td>${t.voucherDate || '-'}</td>
        <td><strong>${escapeHtml(t.deducteeName)}</strong></td>
        <td><code>${t.pan || '-'}</code></td>
        <td>${escapeHtml(t.natureOfPayment || '-')}</td>
        <td class="text-center"><span class="badge-stat">${t.section}</span></td>
        <td class="text-right">₹ ${(t.grossAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(t.taxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center">${t.tdsRate}%</td>
        <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${(t.tdsAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td>${t.challanNo || '-'}</td>
        <td>${t.challanDate || '-'}</td>
        <td class="text-right">₹ ${depAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color: #dc2626; font-weight:600;">₹ ${outAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="status-tag ${stClass}">${t.status}</span></td>
        <td class="text-center btn-no-print">
          <button class="tds-btn-action" title="View details" onclick="viewTxnDetails(${t.id})"><i class="bi bi-eye"></i></button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  updateTotals(totGross, totTaxable, totTds, totDep, totOut);
}

function updateTotals(gross, tax, tds, dep, out) {
  const fmt = (n) => '₹ ' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tg = document.getElementById('tot-gross');
  if (tg) tg.textContent = fmt(gross);
  const tt = document.getElementById('tot-taxable');
  if (tt) tt.textContent = fmt(tax);
  const td = document.getElementById('tot-tds');
  if (td) td.textContent = fmt(tds);
  const tdp = document.getElementById('tot-dep');
  if (tdp) tdp.textContent = fmt(dep);
  const to = document.getElementById('tot-out');
  if (to) to.textContent = fmt(out);
}

function renderSectionSummary(sections) {
  const tbody = document.getElementById('tbl-sections-body');
  if (!tbody) return;

  if (!sections || sections.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 20px;">No section summary available.</td></tr>`;
    return;
  }

  let html = '';
  sections.forEach(s => {
    html += `
      <tr>
        <td><strong>Section ${s.section}</strong></td>
        <td>${escapeHtml(s.nature)}</td>
        <td class="text-center">${s.transactionsCount}</td>
        <td class="text-right">₹ ${(s.totalGross || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${(s.totalTds || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(s.totalDeposited || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color: #dc2626; font-weight:600;">₹ ${(s.totalOutstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderDeducteesSummary(list) {
  const tbody = document.getElementById('tbl-ded-summary-body');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 20px;">No deductee summary available.</td></tr>`;
    return;
  }

  const map = {};
  list.forEach(t => {
    const key = t.deducteeName || 'Unknown';
    if (!map[key]) {
      map[key] = {
        name: key,
        pan: t.pan || '-',
        section: t.section,
        rate: t.tdsRate,
        count: 0,
        gross: 0,
        tds: 0,
        status: t.status
      };
    }
    map[key].count++;
    map[key].gross += parseFloat(t.grossAmount) || 0;
    map[key].tds += parseFloat(t.tdsAmount) || 0;
  });

  let html = '';
  Object.values(map).forEach(d => {
    html += `
      <tr>
        <td><strong>${escapeHtml(d.name)}</strong></td>
        <td><code>${d.pan}</code></td>
        <td class="text-center"><span class="badge-stat">${d.section}</span></td>
        <td class="text-center">${d.rate}%</td>
        <td class="text-center">${d.count}</td>
        <td class="text-right">₹ ${d.gross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${d.tds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="status-tag status-confirmed">Valid PAN</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderChallansTable(challans) {
  const tbody = document.getElementById('tbl-challans-body');
  if (!tbody) return;

  if (!challans || challans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 20px;">No TDS challan deposits recorded. Click "Add Challan" to record Bank OLTAS/ITNS-281 payments.</td></tr>`;
    return;
  }

  let html = '';
  challans.forEach((c, i) => {
    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td><strong>${c.challanNo}</strong></td>
        <td><code>${c.bsrCode || '-'}</code></td>
        <td>${c.challanDate}</td>
        <td class="text-center">${c.quarter || '-'}</td>
        <td class="text-right">₹ ${(c.tdsAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(c.interest || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#16a34a;">₹ ${(c.totalPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="status-tag status-deposited">Deposited</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderRulesTable(rules) {
  const tbody = document.getElementById('tbl-rules-body');
  if (!tbody) return;

  if (!rules || rules.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 20px;">No TDS threshold rules found.</td></tr>`;
    return;
  }

  let html = '';
  rules.forEach(r => {
    html += `
      <tr>
        <td><strong>${r.section}</strong></td>
        <td>${escapeHtml(r.natureOfPayment)}</td>
        <td class="text-center" style="font-weight:600;">${r.rateIndividual}%</td>
        <td class="text-center" style="font-weight:600;">${r.rateOthers}%</td>
        <td class="text-right">₹ ${(r.singleThreshold || 0).toLocaleString('en-IN')}</td>
        <td class="text-right">₹ ${(r.aggregateThreshold || 0).toLocaleString('en-IN')}</td>
        <td class="text-center">${r.rateWithoutPan}%</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tds-tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.tds-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function openNewTransactionModal() {
  openModal('modal-new-txn');
}

function openChallanModal() {
  switchTab('tab-challans', document.querySelectorAll('.tds-tab-btn')[3]);
}

function openAddChallanModal() {
  document.getElementById('ch-no').value = 'CH-2026-' + Math.floor(1000 + Math.random() * 9000);
  openModal('modal-add-challan');
}

function openDeducteeModal() {
  openModal('modal-deductee');
}

function onSectionChanged() {
  const sec = document.getElementById('txn-section').value;
  const rateInput = document.getElementById('txn-rate');
  const natInput = document.getElementById('txn-nature');

  if (sec === '194C') {
    rateInput.value = '2.0';
    natInput.value = 'Contractor / Subcontractor Payment';
  } else if (sec === '194J') {
    rateInput.value = '10.0';
    natInput.value = 'Legal & Professional Technical Fees';
  } else if (sec === '194I') {
    rateInput.value = '10.0';
    natInput.value = 'Rent for Office / Premise';
  } else if (sec === '194H') {
    rateInput.value = '5.0';
    natInput.value = 'Commission / Brokerage';
  }
  recalcTdsModal();
}

function recalcTdsModal() {
  const gross = parseFloat(document.getElementById('txn-gross').value) || 0;
  const rate = parseFloat(document.getElementById('txn-rate').value) || 0;
  const tds = Math.round(gross * (rate / 100.0) * 100) / 100;
  const net = gross - tds;

  document.getElementById('txn-tds-amt').value = tds.toFixed(2);
  document.getElementById('txn-net').value = net.toFixed(2);
}

async function submitTdsTransaction() {
  const vno = document.getElementById('txn-vno').value.trim();
  const deductee = document.getElementById('txn-deductee').value.trim();
  const pan = document.getElementById('txn-pan').value.trim();
  const sec = document.getElementById('txn-section').value;
  const nature = document.getElementById('txn-nature').value.trim();
  const gross = parseFloat(document.getElementById('txn-gross').value) || 0;
  const rate = parseFloat(document.getElementById('txn-rate').value) || 0;

  if (!deductee || gross <= 0) {
    alert('Please enter a valid deductee name and gross amount.');
    return;
  }

  const payload = {
    voucherNo: vno,
    deducteeName: deductee,
    pan: pan,
    section: sec,
    natureOfPayment: nature,
    grossAmount: gross,
    tdsRate: rate,
    status: 'Confirmed'
  };

  try {
    const res = await fetch(getApiUrl('tds/transactions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('TDS transaction recorded successfully.');
      closeModal('modal-new-txn');
      loadTdsData();
    } else {
      alert('Failed: ' + (data.message || 'Error occurred'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function submitChallan() {
  const chNo = document.getElementById('ch-no').value.trim();
  const bsr = document.getElementById('ch-bsr').value.trim();
  const chDate = document.getElementById('ch-date').value;
  const quarter = document.getElementById('ch-quarter').value;
  const tds = parseFloat(document.getElementById('ch-tds').value) || 0;
  const interest = parseFloat(document.getElementById('ch-interest').value) || 0;
  const fee = parseFloat(document.getElementById('ch-fee').value) || 0;

  if (!chNo || tds <= 0) {
    alert('Please enter a valid Challan Serial Number and TDS amount.');
    return;
  }

  const payload = {
    challanNo: chNo,
    bsrCode: bsr,
    challanDate: chDate,
    quarter: quarter,
    tdsAmount: tds,
    interest: interest,
    fee: fee
  };

  try {
    const res = await fetch(getApiUrl('tds/challans'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('TDS Challan recorded successfully.');
      closeModal('modal-add-challan');
      loadTdsData();
    } else {
      alert('Failed: ' + data.message);
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function submitDeductee() {
  const name = document.getElementById('ded-name').value.trim();
  const pt = document.getElementById('ded-type').value;
  const pan = document.getElementById('ded-pan').value.trim();
  const sec = document.getElementById('ded-sec').value;
  const rate = parseFloat(document.getElementById('ded-rate').value) || 2.0;
  const mobile = document.getElementById('ded-mobile').value.trim();
  const email = document.getElementById('ded-email').value.trim();

  if (!name) {
    alert('Please enter Deductee name.');
    return;
  }

  const payload = {
    name: name,
    partyType: pt,
    pan: pan,
    tdsSection: sec,
    defaultTdsRate: rate,
    mobile: mobile,
    email: email
  };

  try {
    const res = await fetch(getApiUrl('tds/deductees'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('Deductee registered successfully.');
      closeModal('modal-deductee');
      loadTdsData();
    } else {
      alert('Failed: ' + data.message);
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function detectTdsTransactions() {
  try {
    const res = await fetch(getApiUrl('tds/detect'), { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`TDS auto-detection complete: ${data.detectedCount || 0} candidate transactions detected.`);
      loadTdsData();
    } else {
      alert('Auto-detection notice: ' + (data.message || 'Complete'));
    }
  } catch (err) {
    console.error(err);
  }
}

function viewTxnDetails(id) {
  const t = currentTransactions.find(x => x.id === id);
  if (!t) return;
  alert(`TDS Transaction Details:\n\nVoucher: ${t.voucherNo} (${t.voucherDate})\nDeductee: ${t.deducteeName} (PAN: ${t.pan})\nSection: ${t.section} (${t.tdsRate}%)\nGross Amount: ₹ ${t.grossAmount}\nTDS Deducted: ₹ ${t.tdsAmount}\nNet Payable: ₹ ${t.netPayable}\nStatus: ${t.status}\nRemarks: ${t.remarks}`);
}

// ═════════════════════════════════════════════════════════════════════
// EXACT 20-COLUMN TDS EXCEL REPORT EXPORT (XLSX ONLY)
// ═════════════════════════════════════════════════════════════════════

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel export engine is loading. Please try again in a moment.');
    return;
  }

  const fy = document.getElementById('tds-fy').value || '2026-2027';
  const fromDate = document.getElementById('tds-from-date') ? document.getElementById('tds-from-date').value : '';
  const toDate = document.getElementById('tds-to-date') ? document.getElementById('tds-to-date').value : '';
  const soc = (currentSummary && currentSummary.society) || {};
  const socName = soc.societyName || 'HENU CO-OPERATIVE HOUSING SOCIETY LTD.';
  const pan = soc.pan || '-';
  const tan = soc.tan || '-';
  const gstin = soc.gstin || '-';
  const address = soc.address || '';

  const wb = XLSX.utils.book_new();
  const wsData = [];

  // 1. Report Header Rows
  wsData.push([socName.toUpperCase()]);
  wsData.push([`TAX DEDUCTED AT SOURCE (TDS) REGISTER — FY ${fy}`]);
  wsData.push([`Period: ${fromDate} to ${toDate} | PAN: ${pan} | TAN: ${tan} | GSTIN: ${gstin}`]);
  if (address) wsData.push([`Address: ${address}`]);
  wsData.push([]); // blank row

  // 2. Exact 20-Column Table Header
  const headers = [
    'Date of Payment',
    'Voucher No.',
    'Invoice/Bill Date',
    'Vendor/Party Invoice No.',
    'Vendor/Party Name',
    'Vendor/Party PAN No.',
    'Account Head',
    'Particulars',
    'Section Code (New)',
    'Section Code (Old)',
    'Bill/Invoice Amount',
    'CGST',
    'SGST',
    'Less TDS %',
    'TDS Amount',
    'Net Paid',
    'BSR Code',
    'Challan Date',
    'Challan No.',
    'TDS Payment Status'
  ];
  wsData.push(headers);

  // 3. Data Rows
  let totBill = 0, totCgst = 0, totSgst = 0, totTds = 0, totNet = 0;

  if (currentTransactions && currentTransactions.length > 0) {
    currentTransactions.forEach(t => {
      const billAmt = parseFloat(t.grossAmount) || 0;
      const cgstAmt = parseFloat(t.cgst) || 0;
      const sgstAmt = parseFloat(t.sgst) || 0;
      const tdsAmt = parseFloat(t.tdsAmount) || 0;
      const netPaid = parseFloat(t.netPayable) || (billAmt - tdsAmt);

      totBill += billAmt;
      totCgst += cgstAmt;
      totSgst += sgstAmt;
      totTds += tdsAmt;
      totNet += netPaid;

      wsData.push([
        t.voucherDate || '',
        t.voucherNo || '',
        t.billDate || t.voucherDate || '',
        t.billNo || t.invoiceNo || '',
        t.deducteeName || '',
        t.pan || '',
        t.accountHead || t.natureOfPayment || 'Contract / Professional Charges',
        t.natureOfPayment || t.remarks || '',
        t.section || '194C',
        t.oldSection || t.section || '194C',
        billAmt,
        cgstAmt,
        sgstAmt,
        parseFloat(t.tdsRate) || 0,
        tdsAmt,
        netPaid,
        t.bsrCode || '',
        t.challanDate || '',
        t.challanNo || '',
        t.status || 'Confirmed'
      ]);
    });
  }

  // 4. Totals Row
  wsData.push([
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    totBill,
    totCgst,
    totSgst,
    '',
    totTds,
    totNet,
    '',
    '',
    '',
    ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // 5. Column Widths
  ws['!cols'] = [
    { wch: 14 }, // Date of Payment
    { wch: 14 }, // Voucher No
    { wch: 14 }, // Invoice Date
    { wch: 18 }, // Party Invoice No
    { wch: 28 }, // Vendor Name
    { wch: 14 }, // PAN
    { wch: 22 }, // Account Head
    { wch: 26 }, // Particulars
    { wch: 16 }, // Section New
    { wch: 16 }, // Section Old
    { wch: 16 }, // Bill Amount
    { wch: 12 }, // CGST
    { wch: 12 }, // SGST
    { wch: 12 }, // TDS %
    { wch: 14 }, // TDS Amount
    { wch: 16 }, // Net Paid
    { wch: 12 }, // BSR Code
    { wch: 14 }, // Challan Date
    { wch: 16 }, // Challan No
    { wch: 16 }  // Status
  ];

  // 6. Style Cells (Header, Colors, Borders, Number Formats)
  const headerRowIdx = address ? 5 : 4;
  const range = XLSX.utils.decode_range(ws['!ref']);

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) continue;

      // Title rows
      if (R === 0) {
        ws[cellRef].s = {
          font: { bold: true, sz: 14, color: { rgb: "0D47A1" } },
          alignment: { horizontal: "left" }
        };
      } else if (R === 1 || R === 2 || (address && R === 3)) {
        ws[cellRef].s = {
          font: { bold: true, sz: 10, color: { rgb: "333333" } },
          alignment: { horizontal: "left" }
        };
      }
      // Table Header Row
      else if (R === headerRowIdx) {
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "1565C0" } },
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "CCCCCC" } },
            bottom: { style: "medium", color: { rgb: "0D47A1" } },
            left: { style: "thin", color: { rgb: "CCCCCC" } },
            right: { style: "thin", color: { rgb: "CCCCCC" } }
          }
        };
      }
      // Total Row
      else if (R === range.e.r) {
        const isNum = (C === 10 || C === 11 || C === 12 || C === 14 || C === 15);
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "E3F2FD" } },
          font: { bold: true, sz: 10, color: { rgb: "0D47A1" } },
          alignment: { horizontal: isNum ? "right" : (C === 0 ? "center" : "left") },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "double", color: { rgb: "000000" } }
          }
        };
        if (isNum && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = '#,##0.00';
        }
      }
      // Data Rows
      else if (R > headerRowIdx && R < range.e.r) {
        const isNum = (C === 10 || C === 11 || C === 12 || C === 14 || C === 15);
        const isCenter = (C === 0 || C === 1 || C === 2 || C === 5 || C === 8 || C === 9 || C === 13 || C === 16 || C === 17 || C === 18 || C === 19);
        
        ws[cellRef].s = {
          font: { sz: 9.5 },
          alignment: { horizontal: isNum ? "right" : (isCenter ? "center" : "left") },
          border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } }
          }
        };
        if (isNum && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = '#,##0.00';
        } else if (C === 13 && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = '0.0%';
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'TDS Register');
  const filename = `TDS_Report_FY_${fy}_${fromDate}_to_${toDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
