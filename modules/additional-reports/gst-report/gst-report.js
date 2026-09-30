// ═════════════════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — GST REPORT & RECONCILIATION LOGIC
// ═════════════════════════════════════════════════════════════════════

let currentMemberBills = [];
let currentSummary = null;
let currentCategories = [];

document.addEventListener('DOMContentLoaded', () => {
  loadGstData();
});

function getApiUrl(endpoint) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:5002/api';
  return `${base}/additional-reports/${endpoint}`;
}

async function loadGstData() {
  const fy = document.getElementById('gst-fy').value;
  const month = document.getElementById('gst-month').value;
  const search = document.getElementById('gst-search').value.trim();

  const lblPeriod = document.getElementById('lbl-gst-period');
  if (lblPeriod) lblPeriod.textContent = `FY ${fy} ${month !== 'ALL' ? `(Month ${month})` : ''}`;

  try {
    // 1. Fetch Summary
    const sumRes = await fetch(getApiUrl('gst/summary'));
    const sumData = await sumRes.json();
    if (sumData.success) {
      currentSummary = sumData;
      renderSocietyHeader(sumData.society);
      renderApplicability(sumData.applicability);
      renderKpiCards(sumData.summary);
      renderChargeSummary(sumData.chargeSummary);
      renderMonthlySummary(sumData.summary);
    }

    // 2. Fetch Member Invoices
    let memUrl = 'gst/member-wise';
    if (search) memUrl += `?search=${encodeURIComponent(search)}`;
    const memRes = await fetch(getApiUrl(memUrl));
    const memData = await memRes.json();
    if (memData.success) {
      currentMemberBills = memData.data || [];
      renderMemberTable(currentMemberBills);
    }

    // 3. Fetch Reconciliation
    const recRes = await fetch(getApiUrl('gst/reconciliation'));
    const recData = await recRes.json();
    if (recData.success) {
      renderReconciliation(recData.reconciliation, recData.warnings);
    }

    // 4. Fetch Categories
    const catRes = await fetch(getApiUrl('gst/categories'));
    const catData = await catRes.json();
    if (catData.success) {
      currentCategories = catData.data || [];
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

function exportGstExcel() {
  if (!currentMemberBills || currentMemberBills.length === 0) {
    alert('No data to export.');
    return;
  }

  let csv = 'Sr No,Bill No,Bill Date,Member Name,Flat No,Taxable Value,CGST (9%),SGST (9%),IGST,Total GST,Gross Amount\n';
  currentMemberBills.forEach((m, i) => {
    csv += `"${i + 1}","${m.billNo}","${m.billDate}","${m.memberName}","${m.flatNo}","${m.taxableValue}","${m.cgst}","${m.sgst}","${m.igst}","${m.totalGst}","${m.grossAmount}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GST_Outward_Supply_Report_${document.getElementById('gst-fy').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
