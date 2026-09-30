// ═════════════════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — TDS REPORT & COMPLIANCE LOGIC
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

  loadTdsData();
  recalcTdsModal();
});

function getApiUrl(endpoint) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:5002/api';
  return `${base}/additional-reports/${endpoint}`;
}

async function loadTdsData() {
  const fy = document.getElementById('tds-fy').value;
  const quarter = document.getElementById('tds-quarter').value;
  const section = document.getElementById('tds-section-filter').value;
  const status = document.getElementById('tds-status-filter').value;
  const search = document.getElementById('tds-search').value.trim();

  // Update Period Label
  const lblPeriod = document.getElementById('lbl-period');
  if (lblPeriod) lblPeriod.textContent = `FY ${fy} (${quarter === 'ALL' ? 'Full Year' : quarter})`;

  try {
    // 1. Fetch Summary
    const sumRes = await fetch(getApiUrl(`tds/summary?quarter=${encodeURIComponent(quarter)}`));
    const sumData = await sumRes.json();
    if (sumData.success) {
      currentSummary = sumData;
      renderSocietyHeader(sumData.society);
      renderKpiCards(sumData.summary);
      renderSectionSummary(sumData.sectionSummary);
    }

    // 2. Fetch Transactions
    let txnUrl = `tds/transactions?quarter=${encodeURIComponent(quarter)}&section=${encodeURIComponent(section)}&status=${encodeURIComponent(status)}`;
    if (search) txnUrl += `&search=${encodeURIComponent(search)}`;
    const txnRes = await fetch(getApiUrl(txnUrl));
    const txnData = await txnRes.json();
    if (txnData.success) {
      currentTransactions = txnData.data || [];
      renderTransactionsTable(currentTransactions);
      renderDeducteesSummary(currentTransactions);
    }

    // 3. Fetch Challans
    const chRes = await fetch(getApiUrl('tds/challans'));
    const chData = await chRes.json();
    if (chData.success) {
      currentChallans = chData.data || [];
      renderChallansTable(currentChallans);
      const cntCh = document.getElementById('cnt-challans');
      if (cntCh) cntCh.textContent = currentChallans.length;
    }

    // 4. Fetch Rules
    const rRes = await fetch(getApiUrl('tds/rules'));
    const rData = await rRes.json();
    if (rData.success) {
      currentRules = rData.data || [];
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
        <td class="text-right" style="color:#16a34a;">₹ ${depAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#dc2626; font-weight:600;">₹ ${outAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="status-tag ${stClass}">${t.status}</span></td>
        <td class="text-center btn-no-print">
          <button class="tds-btn" style="height:22px; padding:0 6px;" onclick="viewTxnDetails(${t.id})" title="View / Drilldown"><i class="bi bi-eye"></i></button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  updateTotals(totGross, totTaxable, totTds, totDep, totOut);
}

function updateTotals(gross, taxable, tds, dep, out) {
  const fmt = (n) => '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tg = document.getElementById('tot-gross');
  if (tg) tg.textContent = fmt(gross);
  const tt = document.getElementById('tot-taxable');
  if (tt) tt.textContent = fmt(taxable);
  const ttds = document.getElementById('tot-tds');
  if (ttds) ttds.textContent = fmt(tds);
  const td = document.getElementById('tot-dep');
  if (td) td.textContent = fmt(dep);
  const to = document.getElementById('tot-out');
  if (to) to.textContent = fmt(out);
}

function renderSectionSummary(sections) {
  const tbody = document.getElementById('tbl-sections-body');
  if (!tbody) return;

  if (!sections || sections.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 20px; color: #64748b;">No section-wise data available.</td></tr>`;
    return;
  }

  let html = '';
  sections.forEach(s => {
    const out = Math.max(0, (parseFloat(s.tdsAmount) || 0) - (parseFloat(s.depositedAmount) || 0));
    html += `
      <tr>
        <td><strong>Sec ${s.section}</strong></td>
        <td>${escapeHtml(s.natureOfPayment)}</td>
        <td class="text-center">${s.count}</td>
        <td class="text-right">₹ ${(parseFloat(s.grossAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${(parseFloat(s.tdsAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#16a34a;">₹ ${(parseFloat(s.depositedAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#dc2626; font-weight:600;">₹ ${out.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderDeducteesSummary(txns) {
  const tbody = document.getElementById('tbl-deductees-summary-body');
  if (!tbody) return;

  const map = {};
  txns.forEach(t => {
    const key = t.deducteeName || 'Unknown';
    if (!map[key]) {
      map[key] = { name: key, pan: t.pan, count: 0, gross: 0, tds: 0, dep: 0, out: 0 };
    }
    map[key].count++;
    map[key].gross += parseFloat(t.grossAmount) || 0;
    map[key].tds += parseFloat(t.tdsAmount) || 0;
    if (t.status === 'Deposited') {
      map[key].dep += parseFloat(t.tdsAmount) || 0;
    } else {
      map[key].out += parseFloat(t.tdsAmount) || 0;
    }
  });

  const list = Object.values(map);
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 20px; color: #64748b;">No deductee transactions available.</td></tr>`;
    return;
  }

  let html = '';
  list.forEach(d => {
    html += `
      <tr>
        <td><strong>${escapeHtml(d.name)}</strong></td>
        <td><code>${d.pan || '-'}</code></td>
        <td class="text-center">${d.count}</td>
        <td class="text-right">₹ ${d.gross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${d.tds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#16a34a;">₹ ${d.dep.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#dc2626; font-weight:600;">₹ ${d.out.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderChallansTable(challans) {
  const tbody = document.getElementById('tbl-challans-body');
  if (!tbody) return;

  if (!challans || challans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center" style="padding: 20px; color: #64748b;">No TDS Challans deposited yet. Click "Record Challan Deposit" to add ITNS 281 records.</td></tr>`;
    return;
  }

  let html = '';
  challans.forEach(c => {
    html += `
      <tr>
        <td><strong>${c.challanNo}</strong></td>
        <td><code>${c.bsrCode}</code></td>
        <td>${c.challanDate}</td>
        <td>${c.paymentDate}</td>
        <td class="text-right">₹ ${(c.tdsAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(c.interest || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(c.fee || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#16a34a;">₹ ${(c.totalDeposited || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#0D47A1;">₹ ${(c.allocatedTds || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#d97706;">₹ ${(c.unallocatedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="badge-stat">${c.quarter}</span></td>
        <td class="text-center"><span class="status-tag status-matched">${c.status}</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderRulesTable(rules) {
  const tbody = document.getElementById('tbl-rules-body');
  if (!tbody) return;

  if (!rules || rules.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 20px;">No tax rules configured.</td></tr>`;
    return;
  }

  let html = '';
  rules.forEach(r => {
    html += `
      <tr>
        <td><strong>Sec ${r.section}</strong></td>
        <td>${escapeHtml(r.natureOfPayment)}</td>
        <td>${r.deducteeType}</td>
        <td class="text-center" style="font-weight:700; color:#0D47A1;">${r.rate}%</td>
        <td class="text-right">₹ ${(r.threshold || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td>${r.effectiveFrom}</td>
        <td>${r.applicableAct}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// ── Tab Switching ──────────────────────────────────────────────
function switchTab(tabId, btn) {
  document.querySelectorAll('.tds-tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.tds-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ── Auto-Detect TDS ───────────────────────────────────────────
async function detectTdsTransactions() {
  try {
    const res = await fetch(getApiUrl('tds/detect'), { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`Auto-Detection Complete: ${data.detectedCount} new TDS eligible transaction(s) identified and marked as 'Suggested'.`);
      loadTdsData();
    } else {
      alert('Detection note: ' + (data.message || 'No new transactions found.'));
    }
  } catch (err) {
    alert('Failed to run TDS scanner: ' + err.message);
  }
}

// ── Modal Operations ──────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

function openNewTransactionModal() {
  document.getElementById('txn-vno').value = 'PV-2026-' + Math.floor(100 + Math.random() * 900);
  recalcTdsModal();
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

function viewTxnDetails(id) {
  const t = currentTransactions.find(x => x.id === id);
  if (!t) return;
  alert(`TDS Transaction Details:\n\nVoucher: ${t.voucherNo} (${t.voucherDate})\nDeductee: ${t.deducteeName} (PAN: ${t.pan})\nSection: ${t.section} (${t.tdsRate}%)\nGross Amount: ₹ ${t.grossAmount}\nTDS Deducted: ₹ ${t.tdsAmount}\nNet Payable: ₹ ${t.netPayable}\nStatus: ${t.status}\nRemarks: ${t.remarks}`);
}

function exportToExcel() {
  if (!currentTransactions || currentTransactions.length === 0) {
    alert('No data to export.');
    return;
  }

  let csv = 'Sr No,Voucher No,Voucher Date,Deductee Name,PAN,Section,Nature of Payment,Gross Amount,Taxable Amount,TDS Rate,TDS Amount,Net Payable,Challan No,Challan Date,Status\n';
  currentTransactions.forEach((t, i) => {
    csv += `"${i + 1}","${t.voucherNo}","${t.voucherDate}","${t.deducteeName}","${t.pan}","${t.section}","${t.natureOfPayment}","${t.grossAmount}","${t.taxableAmount}","${t.tdsRate}%","${t.tdsAmount}","${t.netPayable}","${t.challanNo}","${t.challanDate}","${t.status}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TDS_Report_${document.getElementById('tds-quarter').value}_${document.getElementById('tds-fy').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
