// ═════════════════════════════════════════════════════════════════════
// HENU ERP — GST REPORT & RECONCILIATION LOGIC
// ═════════════════════════════════════════════════════════════════════

let currentMemberBills = [];
let currentPurchases = [];
let currentSalesReport = [];
let currentPurchaseReport = [];
let currentSummary = null;
let currentCategories = [];
let currentSociety = null;

document.addEventListener('DOMContentLoaded', () => {
  onGstMonthChanged(); // sets default From & To date based on FY & Month
  loadGstData();
});

function getApiUrl(endpoint) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:5002/api';
  return `${base}/additional-reports/${endpoint}`;
}

function onGstFyChanged() {
  onGstMonthChanged();
}

function onGstMonthChanged() {
  const fy = document.getElementById('gst-fy').value || '2026-2027';
  const m = document.getElementById('gst-month').value || 'ALL';
  const startYear = parseInt(fy.split('-')[0]) || 2026;
  const endYear = startYear + 1;

  let fromDate = `${startYear}-04-01`;
  let toDate = `${endYear}-03-31`;

  if (m !== 'ALL') {
    const monthNum = parseInt(m, 10);
    const yr = (monthNum >= 4 && monthNum <= 12) ? startYear : endYear;
    const padM = String(monthNum).padStart(2, '0');
    fromDate = `${yr}-${padM}-01`;
    const lastDay = new Date(yr, monthNum, 0).getDate();
    toDate = `${yr}-${padM}-${String(lastDay).padStart(2, '0')}`;
  }

  const fromEl = document.getElementById('gst-from-date');
  const toEl = document.getElementById('gst-to-date');
  if (fromEl) fromEl.value = fromDate;
  if (toEl) toEl.value = toDate;

  loadGstData();
}

async function loadGstData() {
  const fy = document.getElementById('gst-fy').value;
  const month = document.getElementById('gst-month').value;
  const fromDate = document.getElementById('gst-from-date') ? document.getElementById('gst-from-date').value : '';
  const toDate = document.getElementById('gst-to-date') ? document.getElementById('gst-to-date').value : '';
  const taxability = document.getElementById('gst-taxability').value;
  const search = document.getElementById('gst-search').value.trim();

  const lblPeriod = document.getElementById('lbl-gst-period');
  if (lblPeriod) {
    lblPeriod.textContent = `FY ${fy} ${month !== 'ALL' ? `(Month ${month})` : `(${fromDate} to ${toDate})`}`;
  }

  try {
    // 1. Fetch Master GST Report Data
    let reportUrl = `gst/report?fy=${encodeURIComponent(fy)}&month=${encodeURIComponent(month)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&taxability=${encodeURIComponent(taxability)}`;
    if (search) reportUrl += `&search=${encodeURIComponent(search)}`;

    const repRes = await fetch(getApiUrl(reportUrl));
    const repData = await repRes.json();

    if (repData.success) {
      currentSummary = repData.summary;
      currentSociety = repData.society;
      currentMemberBills = repData.memberBills || [];
      currentPurchases = repData.purchases || [];
      currentSalesReport = repData.salesReport || [];
      currentPurchaseReport = repData.purchaseReport || [];
      currentCategories = repData.categories || [];

      renderSocietyHeader(repData.society);
      renderApplicability(repData.applicability);
      renderKpiCards(repData.summary);
      renderChargeSummary(repData.chargeSummary);
      renderMemberTable(currentMemberBills);
      renderPurchaseTable(currentPurchases);
      renderMonthlySummary(repData.summary);
      renderReconciliation(repData.reconciliation, repData.warnings);
      renderCategoriesTable(currentCategories);
    }
  } catch (err) {
    console.error('Failed to load GST data:', err);
  }
}

function renderSocietyHeader(soc) {
  if (!soc) return;
  const elName = document.getElementById('soc-name');
  if (elName && soc.societyName) elName.textContent = soc.societyName;
  const elAddr = document.getElementById('soc-address');
  if (elAddr && soc.address) elAddr.textContent = `${soc.address}, ${soc.state || ''} - ${soc.pincode || ''}`;
  const elGst = document.getElementById('soc-gstin');
  if (elGst && soc.gstin) elGst.textContent = soc.gstin;
  const elPan = document.getElementById('soc-pan');
  if (elPan && soc.pan) elPan.textContent = soc.pan;
}

function renderApplicability(app) {
  if (!app) return;
  const elRule = document.getElementById('lbl-applicability-rule');
  if (elRule && app.relevantRule) elRule.textContent = app.relevantRule;
  const elSt = document.getElementById('lbl-reg-status');
  if (elSt && app.registrationStatus) elSt.textContent = app.registrationStatus;
}

function renderKpiCards(sum) {
  if (!sum) return;
  const fmt = (n) => '₹ ' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('kpi-invoices').textContent = sum.totalInvoices || 0;
  document.getElementById('kpi-gross').textContent = fmt(sum.totalGrossAmount);
  document.getElementById('kpi-taxable').textContent = fmt(sum.totalTaxableValue);
  document.getElementById('kpi-cgst').textContent = fmt(sum.totalCgst);
  document.getElementById('kpi-sgst').textContent = fmt(sum.totalSgst);
  document.getElementById('kpi-total-gst').textContent = fmt(sum.totalGst);
  document.getElementById('kpi-exempt').textContent = fmt(sum.totalExempt);

  const cnt = document.getElementById('cnt-member-bills');
  if (cnt) cnt.textContent = sum.totalInvoices || 0;
}

function renderChargeSummary(charges) {
  const tbody = document.getElementById('tbl-charge-summary-body');
  if (!tbody) return;

  if (!charges || charges.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 20px;">No charge breakdown available.</td></tr>`;
    return;
  }

  let totTaxable = 0, totCgst = 0, totSgst = 0, totGst = 0;
  let html = '';

  charges.forEach((c, i) => {
    const taxVal = parseFloat(c.taxableValue) || 0;
    const cgst = parseFloat(c.cgst) || 0;
    const sgst = parseFloat(c.sgst) || 0;
    const totalGst = parseFloat(c.totalGst) || 0;

    totTaxable += taxVal;
    totCgst += cgst;
    totSgst += sgst;
    totGst += totalGst;

    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td><strong>${escapeHtml(c.chargeName)}</strong></td>
        <td class="text-center"><span class="badge-stat">${c.taxability}</span></td>
        <td class="text-right">₹ ${taxVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center">${c.cgstRate}%</td>
        <td class="text-right">₹ ${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center">${c.sgstRate}%</td>
        <td class="text-right">₹ ${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-center">0%</td>
        <td class="text-right">₹ 0.00</td>
        <td class="text-right" style="font-weight:700; color:#16a34a;">₹ ${totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  const fmt = (n) => '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tchTax = document.getElementById('tot-ch-taxable');
  if (tchTax) tchTax.textContent = fmt(totTaxable);
  const tchCgst = document.getElementById('tot-ch-cgst');
  if (tchCgst) tchCgst.textContent = fmt(totCgst);
  const tchSgst = document.getElementById('tot-ch-sgst');
  if (tchSgst) tchSgst.textContent = fmt(totSgst);
  const tchGst = document.getElementById('tot-ch-gst');
  if (tchGst) tchGst.textContent = fmt(totGst);
}

function renderMemberTable(list) {
  const tbody = document.getElementById('tbl-member-body');
  if (!tbody) return;

  const countEl = document.getElementById('lbl-member-count');
  if (countEl) countEl.textContent = `${list.length} invoices`;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 24px; color: #64748b;">No member tax invoices found.</td></tr>`;
    return;
  }

  let totTax = 0, totCgst = 0, totSgst = 0, totGst = 0, totGross = 0;
  let html = '';

  list.forEach((m, i) => {
    totTax += parseFloat(m.taxableValue) || 0;
    totCgst += parseFloat(m.cgst) || 0;
    totSgst += parseFloat(m.sgst) || 0;
    totGst += parseFloat(m.totalGst) || 0;
    totGross += parseFloat(m.grossAmount) || 0;

    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td><strong>${m.billNo}</strong></td>
        <td>${m.billDate}</td>
        <td><strong>${escapeHtml(m.memberName)}</strong></td>
        <td><span class="badge-stat">${m.flatNo || '-'}</span></td>
        <td class="text-right">₹ ${(m.taxableValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(m.cgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(m.sgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(m.igst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#16a34a;">₹ ${(m.totalGst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700;">₹ ${(m.grossAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  const fmt = (n) => '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tTax = document.getElementById('tot-mem-taxable');
  if (tTax) tTax.textContent = fmt(totTax);
  const tCgst = document.getElementById('tot-mem-cgst');
  if (tCgst) tCgst.textContent = fmt(totCgst);
  const tSgst = document.getElementById('tot-mem-sgst');
  if (tSgst) tSgst.textContent = fmt(totSgst);
  const tGst = document.getElementById('tot-mem-gst');
  if (tGst) tGst.textContent = fmt(totGst);
  const tGross = document.getElementById('tot-mem-gross');
  if (tGross) tGross.textContent = fmt(totGross);
}

function renderPurchaseTable(list) {
  const tbody = document.getElementById('tbl-purchase-body');
  if (!tbody) return;

  const cnt = document.getElementById('cnt-purchases');
  if (cnt) cnt.textContent = list.length || 0;
  const countEl = document.getElementById('lbl-purchase-count');
  if (countEl) countEl.textContent = `${list.length} vouchers`;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="padding: 24px; color: #64748b;">No purchase / Input ITC vouchers found for selected period.</td></tr>`;
    return;
  }

  let totTax = 0, totCgst = 0, totSgst = 0, totGross = 0;
  let html = '';

  list.forEach((p, i) => {
    totTax += parseFloat(p.taxableAmount) || 0;
    totCgst += parseFloat(p.cgst) || 0;
    totSgst += parseFloat(p.sgst) || 0;
    totGross += parseFloat(p.totalAmount) || 0;

    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td>${p.billDate || '-'}</td>
        <td><strong>${p.billNo || '-'}</strong></td>
        <td>${p.voucherNo || '-'}</td>
        <td><strong>${escapeHtml(p.vendorName || '-')}</strong></td>
        <td><code>${p.gstin || '-'}</code></td>
        <td>${escapeHtml(p.accountHead || '-')}</td>
        <td class="text-right">₹ ${(p.taxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(p.cgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(p.sgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700;">₹ ${(p.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  const fmt = (n) => '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tTax = document.getElementById('tot-pur-taxable');
  if (tTax) tTax.textContent = fmt(totTax);
  const tCgst = document.getElementById('tot-pur-cgst');
  if (tCgst) tCgst.textContent = fmt(totCgst);
  const tSgst = document.getElementById('tot-pur-sgst');
  if (tSgst) tSgst.textContent = fmt(totSgst);
  const tGross = document.getElementById('tot-pur-gross');
  if (tGross) tGross.textContent = fmt(totGross);
}

function renderMonthlySummary(sum) {
  const tbody = document.getElementById('tbl-monthly-body');
  if (!tbody || !sum) return;

  const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
  const avgTax = (sum.totalTaxableValue || 0) / 12.0;
  const avgCgst = (sum.totalCgst || 0) / 12.0;
  const avgSgst = (sum.totalSgst || 0) / 12.0;
  const avgGst = (sum.totalGst || 0) / 12.0;

  let html = '';
  months.forEach(m => {
    html += `
      <tr>
        <td><strong>${m} 2026</strong></td>
        <td class="text-right">₹ ${avgTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${avgCgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${avgSgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-right">₹ 0.00</td>
        <td class="text-right" style="font-weight:700; color:#16a34a;">₹ ${avgGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderReconciliation(rec, warnings) {
  if (!rec) return;
  const fmt = (n) => '₹ ' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('rec-billed').textContent = fmt(rec.billedGst);
  document.getElementById('rec-collected').textContent = fmt(rec.receiptsGst);
  document.getElementById('rec-ledger').textContent = fmt(rec.ledgerOutputGst);
  document.getElementById('rec-diff').textContent = fmt(rec.difference);

  const warnBox = document.getElementById('rec-warnings-box');
  if (warnBox && warnings) {
    let wHtml = '';
    warnings.forEach(w => {
      wHtml += `<div class="warning-item"><i class="bi bi-shield-exclamation text-warning"></i> <span>${escapeHtml(w)}</span></div>`;
    });
    warnBox.innerHTML = wHtml;
  }
}

function renderCategoriesTable(cats) {
  const tbody = document.getElementById('tbl-cat-body');
  if (!tbody) return;

  if (!cats || cats.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 20px;">No categories found.</td></tr>`;
    return;
  }

  let html = '';
  cats.forEach(c => {
    html += `
      <tr>
        <td><strong>${escapeHtml(c.categoryName)}</strong></td>
        <td class="text-center"><span class="badge-stat">${c.taxability}</span></td>
        <td><code>${c.hsnSac || '999598'}</code></td>
        <td class="text-center">${c.cgstRate}%</td>
        <td class="text-center">${c.sgstRate}%</td>
        <td class="text-center">${c.igstRate}%</td>
        <td class="text-center">${c.isRcm ? '<span class="status-tag status-outstanding">RCM Applicable</span>' : 'No'}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function switchGstTab(tabId, btn) {
  document.querySelectorAll('.gst-tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.gst-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ═════════════════════════════════════════════════════════════════════
// MULTI-SHEET GST EXCEL REPORT EXPORT (XLSX ONLY)
// ═════════════════════════════════════════════════════════════════════

function exportGstExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel export engine is loading. Please try again in a moment.');
    return;
  }

  const fy = document.getElementById('gst-fy').value || '2026-2027';
  const fromDate = document.getElementById('gst-from-date') ? document.getElementById('gst-from-date').value : '';
  const toDate = document.getElementById('gst-to-date') ? document.getElementById('gst-to-date').value : '';
  const soc = currentSociety || {};
  const socName = soc.societyName || 'HENU CO-OPERATIVE HOUSING SOCIETY LTD.';
  const gstin = soc.gstin || '-';
  const pan = soc.pan || '-';
  const address = soc.address || '';

  const wb = XLSX.utils.book_new();

  // ─────────────────────────────────────────────────────────────────
  // SHEET 1: GST SALES (OUTWARD MEMBER BILLING) — 30 COLUMNS
  // ─────────────────────────────────────────────────────────────────
  const wsSalesData = [];
  wsSalesData.push([socName.toUpperCase()]);
  wsSalesData.push([`GST OUTWARD BILLING STATEMENT (SALES REGISTER) — FY ${fy}`]);
  wsSalesData.push([`Period: ${fromDate} to ${toDate} | GSTIN: ${gstin} | PAN: ${pan} | SAC: 999598`]);
  if (address) wsSalesData.push([`Address: ${address}`]);
  wsSalesData.push([]); // blank spacer

  const salesHeaders = [
    'Sr No',
    'GST Invoice No.',
    'Bill Date',
    'Flat No.',
    'Member Name',
    'Area (Sq.Ft)',
    'Property Tax',
    'Water & Electricity',
    'Mhada Lease & NA Tax',
    'GST Not Applicable',
    'Sinking Fund',
    'Repair & Maint Fund',
    'Lift AMC & Repair',
    'AMC/DG Set/Gym/Intercom',
    'CCTV Rental',
    'Security & Housekeeping',
    'Meeting & Welfare',
    'Salary & Wages',
    'Insurance & Audit',
    'Total GST Exempt',
    'Non Occupancy Charges',
    'Parking Charges',
    'Bank Charges',
    'Other Charges',
    'Interest',
    'GST Applicable Amount',
    'CGST (9%)',
    'SGST (9%)',
    'Total GST',
    'Total Bill Amount'
  ];
  wsSalesData.push(salesHeaders);

  const salesTotals = new Array(salesHeaders.length).fill(0);

  if (currentSalesReport && currentSalesReport.length > 0) {
    currentSalesReport.forEach((r, idx) => {
      const row = [
        idx + 1,
        r.billNo || '',
        r.billDate || '',
        r.flatNo || '',
        r.memberName || '',
        parseFloat(r.areaSqft) || 0,
        parseFloat(r.propertyTax) || 0,
        parseFloat(r.waterElectricity) || 0,
        parseFloat(r.mhadaLeaseNaTax) || 0,
        parseFloat(r.gstNotApplicable) || 0,
        parseFloat(r.sinkingFund) || 0,
        parseFloat(r.repairMaintFund) || 0,
        parseFloat(r.liftAmcRepair) || 0,
        parseFloat(r.amcDgGymIntercom) || 0,
        parseFloat(r.cctvRental) || 0,
        parseFloat(r.securityHousekeeping) || 0,
        parseFloat(r.meetingWelfare) || 0,
        parseFloat(r.salaryWages) || 0,
        parseFloat(r.insuranceAudit) || 0,
        parseFloat(r.totalGstExempt) || 0,
        parseFloat(r.nonOccupancyCharges) || 0,
        parseFloat(r.parkingCharges) || 0,
        parseFloat(r.bankCharges) || 0,
        parseFloat(r.otherCharges) || 0,
        parseFloat(r.interest) || 0,
        parseFloat(r.gstApplicable) || 0,
        parseFloat(r.cgst) || 0,
        parseFloat(r.sgst) || 0,
        parseFloat(r.totalGst) || 0,
        parseFloat(r.totalBill) || 0
      ];

      for (let c = 5; c < salesHeaders.length; c++) {
        salesTotals[c] += row[c];
      }

      wsSalesData.push(row);
    });
  }

  // Sales Total Row
  const salesTotRow = ['TOTAL', '', '', '', ''];
  for (let c = 5; c < salesHeaders.length; c++) {
    salesTotRow.push(salesTotals[c]);
  }
  wsSalesData.push(salesTotRow);

  const wsSales = XLSX.utils.aoa_to_sheet(wsSalesData);

  // Column widths for sales
  wsSales['!cols'] = salesHeaders.map((_, i) => {
    if (i === 0) return { wch: 8 };
    if (i === 1) return { wch: 18 };
    if (i === 2) return { wch: 14 };
    if (i === 3) return { wch: 12 };
    if (i === 4) return { wch: 28 };
    return { wch: 15 };
  });

  // Apply Styling for Sales Sheet
  styleWorksheet(wsSales, address ? 5 : 4, salesHeaders.length);
  XLSX.utils.book_append_sheet(wb, wsSales, 'GST Sales (Outward)');

  // ─────────────────────────────────────────────────────────────────
  // SHEET 2: GST PURCHASE (INPUT TAX CREDIT / ITC) — 12 COLUMNS
  // ─────────────────────────────────────────────────────────────────
  const wsPurData = [];
  wsPurData.push([socName.toUpperCase()]);
  wsPurData.push([`GST INPUT TAX CREDIT (PURCHASE REGISTER) — FY ${fy}`]);
  wsPurData.push([`Period: ${fromDate} to ${toDate} | Society GSTIN: ${gstin}`]);
  if (address) wsPurData.push([`Address: ${address}`]);
  wsPurData.push([]); // blank spacer

  const purHeaders = [
    'Sr No',
    'Bill Date',
    'Vendor Bill No.',
    'Voucher No.',
    'Vendor / Party Name',
    'Vendor GSTIN',
    'Account Head / Category',
    'Particulars / Description',
    'Taxable Amount',
    'CGST Amount',
    'SGST Amount',
    'Total Amount'
  ];
  wsPurData.push(purHeaders);

  let pTax = 0, pCgst = 0, pSgst = 0, pTot = 0;

  if (currentPurchaseReport && currentPurchaseReport.length > 0) {
    currentPurchaseReport.forEach((p, idx) => {
      const taxAmt = parseFloat(p.taxableAmount) || 0;
      const cgstAmt = parseFloat(p.cgst) || 0;
      const sgstAmt = parseFloat(p.sgst) || 0;
      const totAmt = parseFloat(p.totalAmount) || (taxAmt + cgstAmt + sgstAmt);

      pTax += taxAmt;
      pCgst += cgstAmt;
      pSgst += sgstAmt;
      pTot += totAmt;

      wsPurData.push([
        idx + 1,
        p.billDate || '',
        p.billNo || '',
        p.voucherNo || '',
        p.vendorName || '',
        p.gstin || '',
        p.accountHead || '',
        p.particulars || '',
        taxAmt,
        cgstAmt,
        sgstAmt,
        totAmt
      ]);
    });
  }

  // Purchase Total Row
  wsPurData.push([
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    pTax,
    pCgst,
    pSgst,
    pTot
  ]);

  const wsPur = XLSX.utils.aoa_to_sheet(wsPurData);

  wsPur['!cols'] = [
    { wch: 8 },  // Sr
    { wch: 14 }, // Bill Date
    { wch: 18 }, // Vendor Bill No
    { wch: 16 }, // Voucher No
    { wch: 28 }, // Vendor Name
    { wch: 18 }, // GSTIN
    { wch: 22 }, // Account Head
    { wch: 26 }, // Particulars
    { wch: 16 }, // Taxable Amount
    { wch: 14 }, // CGST
    { wch: 14 }, // SGST
    { wch: 16 }  // Total Amount
  ];

  styleWorksheet(wsPur, address ? 5 : 4, purHeaders.length);
  XLSX.utils.book_append_sheet(wb, wsPur, 'GST Purchase (Input ITC)');

  const filename = `GST_Report_FY_${fy}_${fromDate}_to_${toDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function styleWorksheet(ws, headerRowIdx, totalCols) {
  const range = XLSX.utils.decode_range(ws['!ref']);

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) continue;

      if (R === 0) {
        ws[cellRef].s = {
          font: { bold: true, sz: 14, color: { rgb: "0D47A1" } },
          alignment: { horizontal: "left" }
        };
      } else if (R > 0 && R < headerRowIdx) {
        ws[cellRef].s = {
          font: { bold: true, sz: 10, color: { rgb: "333333" } },
          alignment: { horizontal: "left" }
        };
      } else if (R === headerRowIdx) {
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "1565C0" } },
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 9.5 },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "CCCCCC" } },
            bottom: { style: "medium", color: { rgb: "0D47A1" } },
            left: { style: "thin", color: { rgb: "CCCCCC" } },
            right: { style: "thin", color: { rgb: "CCCCCC" } }
          }
        };
      } else if (R === range.e.r) {
        const isNum = (typeof ws[cellRef].v === 'number');
        ws[cellRef].s = {
          fill: { fgColor: { rgb: "E3F2FD" } },
          font: { bold: true, sz: 9.5, color: { rgb: "0D47A1" } },
          alignment: { horizontal: isNum ? "right" : (C === 0 ? "center" : "left") },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "double", color: { rgb: "000000" } }
          }
        };
        if (isNum) ws[cellRef].z = '#,##0.00';
      } else {
        const isNum = (typeof ws[cellRef].v === 'number');
        const isCenter = (C === 0 || C === 1 || C === 2 || C === 3 || C === 5);
        ws[cellRef].s = {
          font: { sz: 9 },
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
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
