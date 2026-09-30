// ═════════════════════════════════════════════════════════════════════
// HENU ERP — FUND REPORTS & INVESTMENTS LOGIC
// ═════════════════════════════════════════════════════════════════════

let currentFunds = [];
let currentReportFunds = [];
let currentLedger = [];
let currentInvestments = [];
let currentSummary = null;
let currentSociety = null;

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];

  const invStart = document.getElementById('inv-start');
  if (invStart) invStart.value = today;
  const invMat = document.getElementById('inv-mat-date');
  if (invMat) invMat.value = nextYear;

  onFundFyChanged(); // Initializes From & To date
  loadFundAccounts();
  loadFundData();
});

function getApiUrl(endpoint) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:5002/api';
  return `${base}/additional-reports/${endpoint}`;
}

function onFundFyChanged() {
  const fy = document.getElementById('fnd-fy').value || '2026-2027';
  const startYear = parseInt(fy.split('-')[0]) || 2026;
  const endYear = startYear + 1;

  const fromDate = `${startYear}-04-01`;
  const toDate = `${endYear}-03-31`;

  const fromEl = document.getElementById('fnd-from-date');
  const toEl = document.getElementById('fnd-to-date');
  if (fromEl) fromEl.value = fromDate;
  if (toEl) toEl.value = toDate;

  loadFundData();
}

async function loadFundAccounts() {
  try {
    const res = await fetch(getApiUrl('funds/accounts'));
    const data = await res.json();
    if (data.success && data.data) {
      const sel = document.getElementById('fnd-select-fund');
      if (sel) {
        const cur = sel.value || 'ALL';
        sel.innerHTML = '<option value="ALL">All Society Funds</option>';
        data.data.forEach(acc => {
          const opt = document.createElement('option');
          opt.value = acc.code;
          opt.textContent = `${acc.code} - ${acc.name}`;
          sel.appendChild(opt);
        });
        sel.value = cur;
      }
    }
  } catch (err) {
    console.error('Failed to load fund accounts:', err);
  }
}

async function loadFundData() {
  const fy = document.getElementById('fnd-fy').value;
  const fromDate = document.getElementById('fnd-from-date') ? document.getElementById('fnd-from-date').value : '';
  const toDate = document.getElementById('fnd-to-date') ? document.getElementById('fnd-to-date').value : '';
  const selFund = document.getElementById('fnd-select-fund').value;

  const lblPeriod = document.getElementById('lbl-fnd-period');
  if (lblPeriod) {
    lblPeriod.textContent = `FY ${fy} (${fromDate} to ${toDate})`;
  }

  try {
    // 1. Fetch Primary Master Fund Report
    let repUrl = `funds/report?fy=${encodeURIComponent(fy)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`;
    if (selFund && selFund !== 'ALL') repUrl += `&fundAccount=${encodeURIComponent(selFund)}`;

    const repRes = await fetch(getApiUrl(repUrl));
    const repData = await repRes.json();

    if (repData.success) {
      currentSummary = repData.summary;
      currentSociety = repData.society;
      currentFunds = repData.funds || [];
      currentReportFunds = repData.reportFunds || [];
      currentLedger = repData.ledger || [];
      currentInvestments = repData.investments || [];

      renderSocietyHeader(repData.society);
      renderKpiCards(repData.summary);
      renderFundsTable(currentFunds);
      renderLedgerTable(currentLedger);
      renderInvestmentsTable(currentInvestments);
      renderFormN(currentFunds);
      populateFundDropdowns(currentFunds);

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
  list.forEach((l, i) => {
    const isAdd = l.transactionType === 'Contribution' || l.transactionType === 'Addition' || (parseFloat(l.amount) > 0 && l.debitCredit === 'Credit');
    const color = isAdd ? '#16a34a' : '#dc2626';
    const sign = isAdd ? '+' : '-';

    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td>${l.transactionDate || '-'}</td>
        <td><strong>${escapeHtml(l.fundName || '-')}</strong></td>
        <td><span class="badge-stat">${l.transactionType || '-'}</span></td>
        <td>${escapeHtml(l.description || '-')}</td>
        <td>${escapeHtml(l.sourceDestination || '-')}</td>
        <td><code>${l.voucherNo || '-'}</code></td>
        <td class="text-right" style="font-weight:700; color:${color};">${sign} ₹ ${(parseFloat(l.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="status-tag status-confirmed">${l.approvalStatus || 'Approved'}</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderInvestmentsTable(list) {
  const tbody = document.getElementById('tbl-investments-body');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 24px;">No Fixed Deposits or investments registered.</td></tr>`;
    return;
  }

  let html = '';
  list.forEach(inv => {
    html += `
      <tr>
        <td><strong>${escapeHtml(inv.bankName)}</strong></td>
        <td><span class="badge-stat">${escapeHtml(inv.fundName)}</span></td>
        <td><code>${inv.investmentNo}</code></td>
        <td class="text-right">₹ ${(parseFloat(inv.principalAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td>${inv.startDate || '-'}</td>
        <td>${inv.maturityDate || '-'}</td>
        <td class="text-center">${inv.interestRate}%</td>
        <td class="text-right" style="color:#16a34a;">₹ ${(parseFloat(inv.expectedInterest) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${(parseFloat(inv.maturityAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="status-tag status-deposited">${inv.status}</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderFormN(funds) {
  const tbody = document.getElementById('tbl-form-n-body');
  if (!tbody) return;

  if (!funds || funds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 20px;">No Form N schedule data.</td></tr>`;
    return;
  }

  let html = '';
  funds.forEach((f, i) => {
    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td><strong>Schedule III — ${escapeHtml(f.fundName)}</strong></td>
        <td><code>${f.fundCode}</code></td>
        <td class="text-right">₹ ${(parseFloat(f.openingBalance) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#16a34a;">₹ ${(parseFloat(f.additions) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="color:#dc2626;">₹ ${(parseFloat(f.deductions) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#0D47A1;">₹ ${(parseFloat(f.closingBalance) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function populateFundDropdowns(funds) {
  const src = document.getElementById('trf-src');
  const dest = document.getElementById('trf-dest');
  const invF = document.getElementById('inv-fund-id');
  const txnF = document.getElementById('ftxn-fund-id');

  if (!funds || funds.length === 0) return;

  const buildOpts = () => funds.map(f => `<option value="${f.id || f.fundCode}">${escapeHtml(f.fundName)} (${f.fundCode})</option>`).join('');
  if (src && src.options.length <= 1) src.innerHTML = buildOpts();
  if (dest && dest.options.length <= 1) dest.innerHTML = buildOpts();
  if (invF && invF.options.length <= 1) invF.innerHTML = buildOpts();
  if (txnF && txnF.options.length <= 1) txnF.innerHTML = buildOpts();
}

function switchFundTab(tabId, btn) {
  document.querySelectorAll('.fnd-tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.fnd-tab-btn').forEach(b => b.classList.remove('active'));
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

function openAddTxnModal() {
  openModal('modal-fund-txn');
}

function openTransferModal() {
  openModal('modal-transfer');
}

function openInvestmentModal() {
  openModal('modal-investment');
}

async function submitFundTxn() {
  const fundId = parseInt(document.getElementById('ftxn-fund-id').value);
  const date = document.getElementById('ftxn-date').value;
  const type = document.getElementById('ftxn-type').value;
  const desc = document.getElementById('ftxn-desc').value.trim();
  const source = document.getElementById('ftxn-source').value.trim();
  const vno = document.getElementById('ftxn-vno').value.trim();
  const amount = parseFloat(document.getElementById('ftxn-amount').value) || 0;

  if (amount <= 0 || !desc) {
    alert('Please enter a valid description and positive amount.');
    return;
  }

  const payload = {
    fundId: fundId,
    transactionDate: date,
    transactionType: type,
    description: desc,
    sourceDestination: source,
    voucherNo: vno,
    amount: amount
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

// ═════════════════════════════════════════════════════════════════════
// EXACT MULTI-FUND LEDGER EXCEL REPORT EXPORT (XLSX ONLY)
// ═════════════════════════════════════════════════════════════════════

function exportFundExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel export engine is loading. Please try again in a moment.');
    return;
  }

  const fy = document.getElementById('fnd-fy').value || '2026-2027';
  const fromDate = document.getElementById('fnd-from-date') ? document.getElementById('fnd-from-date').value : '';
  const toDate = document.getElementById('fnd-to-date') ? document.getElementById('fnd-to-date').value : '';
  const soc = currentSociety || {};
  const socName = soc.societyName || 'HENU CO-OPERATIVE HOUSING SOCIETY LTD.';
  const address = soc.address || '';
  const pan = soc.pan || '-';
  const tan = soc.tan || '-';

  const wb = XLSX.utils.book_new();
  const wsData = [];
  const merges = [];
  const sectionHeaderRowIdxs = [];
  const tableHeaderRowIdxs = [];
  const opRowIdxs = [];
  const clRowIdxs = [];

  // 1. Report Main Header Banner
  wsData.push([socName.toUpperCase()]);
  wsData.push([`STATUTORY FUND ACCOUNTING & LEDGER STATEMENT — FY ${fy}`]);
  wsData.push([`Fund Details From: ${fromDate} To: ${toDate} | PAN: ${pan} | TAN: ${tan}`]);
  if (address) wsData.push([`Address: ${address}`]);
  wsData.push([]); // spacer

  const headers = ['Date', 'Type - No', 'Code', 'Particular', 'Debit', 'Credit', 'Balance'];

  if (currentReportFunds && currentReportFunds.length > 0) {
    currentReportFunds.forEach(fund => {
      const curRow = wsData.length;

      // Section Banner: [ 309 - SINKING FUND ]
      wsData.push([`[ ${fund.accountCode} - ${fund.accountName.toUpperCase()} ]`, '', '', '', '', '', '']);
      merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 6 } });
      sectionHeaderRowIdxs.push(curRow);

      // Table Column Header Row
      const tblHdrRow = wsData.length;
      wsData.push(headers);
      tableHeaderRowIdxs.push(tblHdrRow);

      // Opening Balance Row
      const opRow = wsData.length;
      wsData.push([
        fromDate,
        '-',
        fund.accountCode,
        'Opening Balance b/f',
        0,
        0,
        parseFloat(fund.openingBalance) || 0
      ]);
      opRowIdxs.push(opRow);

      // Transaction Rows
      if (fund.transactions && fund.transactions.length > 0) {
        fund.transactions.forEach(t => {
          wsData.push([
            t.date || '',
            t.typeNo || '',
            t.code || fund.accountCode,
            t.particular || '',
            parseFloat(t.debit) || 0,
            parseFloat(t.credit) || 0,
            parseFloat(t.balance) || 0
          ]);
        });
      }

      // Closing Balance Row
      const clRow = wsData.length;
      wsData.push([
        toDate,
        '-',
        fund.accountCode,
        'Closing Balance c/f',
        parseFloat(fund.totalDebits) || 0,
        parseFloat(fund.totalCredits) || 0,
        parseFloat(fund.closingBalance) || 0
      ]);
      clRowIdxs.push(clRow);

      // Blank spacer row between fund sections
      wsData.push([]);
    });
  } else {
    // If no transactions found, show empty structure
    wsData.push(headers);
    tableHeaderRowIdxs.push(wsData.length - 1);
    wsData.push(['-', '-', '-', 'No fund movements found for selected criteria', 0, 0, 0]);
  }

  // Summary Table of All Funds
  const sumHdrRow = wsData.length;
  wsData.push(['SUMMARY OF ALL STATUTORY FUNDS', '', '', '', '', '', '']);
  merges.push({ s: { r: sumHdrRow, c: 0 }, e: { r: sumHdrRow, c: 6 } });
  sectionHeaderRowIdxs.push(sumHdrRow);

  const sumTblHdr = wsData.length;
  wsData.push(['Sr', 'Fund Name', 'Fund Code', 'Opening Balance', 'Contributions / Additions', 'Utilization / Deductions', 'Closing Balance']);
  tableHeaderRowIdxs.push(sumTblHdr);

  let gOp = 0, gAdd = 0, gDed = 0, gCl = 0;
  if (currentFunds && currentFunds.length > 0) {
    currentFunds.forEach((f, i) => {
      const op = parseFloat(f.openingBalance) || 0;
      const add = parseFloat(f.additions) || 0;
      const ded = parseFloat(f.deductions) || 0;
      const cl = parseFloat(f.closingBalance) || 0;

      gOp += op;
      gAdd += add;
      gDed += ded;
      gCl += cl;

      wsData.push([
        i + 1,
        f.fundName,
        f.fundCode,
        op,
        add,
        ded,
        cl
      ]);
    });
  }

  const grandTotRow = wsData.length;
  wsData.push(['TOTAL', '', '', gOp, gAdd, gDed, gCl]);
  clRowIdxs.push(grandTotRow);

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!merges'] = merges;

  // Column Widths
  ws['!cols'] = [
    { wch: 14 }, // Date / Sr
    { wch: 18 }, // Type - No / Fund Name
    { wch: 14 }, // Code
    { wch: 38 }, // Particular / Opening
    { wch: 16 }, // Debit / Additions
    { wch: 16 }, // Credit / Deductions
    { wch: 18 }  // Balance / Closing
  ];

  // Apply Styles to Fund Sheet
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
      // Section Banners: [ 309 - SINKING FUND ]
      else if (sectionHeaderRowIdxs.includes(R)) {
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "1E3A8A" } },
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          alignment: { horizontal: "left", vertical: "center" }
        };
      }
      // Table Header Rows
      else if (tableHeaderRowIdxs.includes(R)) {
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "2563EB" } },
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "CCCCCC" } },
            bottom: { style: "medium", color: { rgb: "1E3A8A" } },
            left: { style: "thin", color: { rgb: "CCCCCC" } },
            right: { style: "thin", color: { rgb: "CCCCCC" } }
          }
        };
      }
      // Opening Balance Row
      else if (opRowIdxs.includes(R)) {
        const isNum = (C >= 4);
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "F8FAFC" } },
          font: { bold: true, sz: 9.5, color: { rgb: "334155" } },
          alignment: { horizontal: isNum ? "right" : (C === 0 || C === 1 || C === 2 ? "center" : "left") },
          border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } }
          }
        };
        if (isNum && typeof ws[cellRef].v === 'number') ws[cellRef].z = '#,##0.00';
      }
      // Closing Balance / Grand Total Rows
      else if (clRowIdxs.includes(R)) {
        const isNum = (C >= 3);
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "EFF6FF" } },
          font: { bold: true, sz: 10, color: { rgb: "0D47A1" } },
          alignment: { horizontal: isNum ? "right" : (C === 0 ? "center" : "left") },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "double", color: { rgb: "000000" } }
          }
        };
        if (isNum && typeof ws[cellRef].v === 'number') ws[cellRef].z = '#,##0.00';
      }
      // Regular Data Rows
      else {
        const isNum = (typeof ws[cellRef].v === 'number');
        const isCenter = (C === 0 || C === 1 || C === 2);
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
        if (isNum) ws[cellRef].z = '#,##0.00';
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Fund Statement & Ledger');
  const filename = `Fund_Report_FY_${fy}_${fromDate}_to_${toDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
