// ═════════════════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MULTI REPORT UNIFIED REPORTING ENGINE LOGIC
// ═════════════════════════════════════════════════════════════════════

let currentMultiData = null;

document.addEventListener('DOMContentLoaded', () => {
  generateMultiReport();
});

function getApiUrl(endpoint) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:5002/api';
  return `${base}/additional-reports/${endpoint}`;
}

async function generateMultiReport() {
  const fy = document.getElementById('multi-fy').value;
  const lblPeriod = document.getElementById('lbl-multi-period');
  if (lblPeriod) lblPeriod.textContent = `FY ${fy}`;

  try {
    const res = await fetch(getApiUrl('multi/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fy: fy })
    });
    const data = await res.json();
    if (data.success) {
      currentMultiData = data;
      renderSocietyHeader(data.society);
      renderKpis(data);
      renderMembers(data.memberSummary);
      renderAccounts(data.accountSummary);
      renderVouchers(data.voucherSummary);
      renderTax(data.taxSummary);
      renderFunds(data.fundsSummary);
      renderReconciliation(data.reconciliation);

      const genTime = document.getElementById('lbl-gen-time');
      if (genTime && data.generatedAt) genTime.textContent = `Generated: ${data.generatedAt}`;
    }
  } catch (err) {
    console.error('Multi report generation error:', err);
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

function renderKpis(d) {
  const fmt = (n) => '₹ ' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totDues = (d.memberSummary || []).reduce((acc, m) => acc + (parseFloat(m.outstanding) || 0), 0);
  document.getElementById('kpi-m-dues').textContent = fmt(totDues);

  const rv = (d.reconciliation && d.reconciliation.totalReceipts) || 0;
  const pv = (d.reconciliation && d.reconciliation.totalPayments) || 0;
  document.getElementById('kpi-m-rv').textContent = fmt(rv);
  document.getElementById('kpi-m-pv').textContent = fmt(pv);

  const gst = (d.taxSummary && d.taxSummary.gstTotal) || 0;
  const tds = (d.taxSummary && d.taxSummary.tdsDeducted) || 0;
  document.getElementById('kpi-m-gst').textContent = fmt(gst);
  document.getElementById('kpi-m-tds').textContent = fmt(tds);

  const fnd = (d.fundsSummary && d.fundsSummary.totalFunds) || 0;
  document.getElementById('kpi-m-funds').textContent = fmt(fnd);
}

function renderMembers(list) {
  const tbody = document.getElementById('tbl-multi-members-body');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 20px;">No members recorded.</td></tr>`;
    return;
  }

  let html = '';
  list.forEach((m, i) => {
    html += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td><strong>${escapeHtml(m.name)}</strong></td>
        <td><span class="badge-stat">${m.flatNo || '-'}</span></td>
        <td class="text-right">₹ ${(parseFloat(m.currentCharges) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right" style="font-weight:700; color:#dc2626;">₹ ${(parseFloat(m.outstanding) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderAccounts(list) {
  const tbody = document.getElementById('tbl-multi-accounts-body');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 20px;">No accounts recorded.</td></tr>`;
    return;
  }

  let html = '';
  list.forEach(a => {
    html += `
      <tr>
        <td><code>${a.code}</code></td>
        <td><strong>${escapeHtml(a.name)}</strong></td>
        <td><span class="badge-stat">${escapeHtml(a.group)}</span></td>
        <td class="text-right">₹ ${(parseFloat(a.debit) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">₹ ${(parseFloat(a.credit) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderVouchers(list) {
  const tbody = document.getElementById('tbl-multi-vouchers-body');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="padding: 20px;">No vouchers recorded.</td></tr>`;
    return;
  }

  let html = '';
  list.forEach(v => {
    let name = v.voucherType;
    if (v.voucherType === 'RV') name = 'Receipt Voucher (RV)';
    if (v.voucherType === 'PV') name = 'Payment Voucher (PV)';
    if (v.voucherType === 'JV') name = 'Journal Voucher (JV)';
    if (v.voucherType === 'CV') name = 'Contra Voucher (CV)';

    html += `
      <tr>
        <td><strong>${name}</strong></td>
        <td class="text-center">${v.count}</td>
        <td class="text-right" style="font-weight:700;">₹ ${(parseFloat(v.totalAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderTax(tax) {
  if (!tax) return;
  const fmt = (n) => '₹ ' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('row-tds-gross').textContent = fmt(tax.tdsGross);
  document.getElementById('row-tds-ded').textContent = fmt(tax.tdsDeducted);
  document.getElementById('row-gst-taxable').textContent = fmt(tax.gstTaxable);
  document.getElementById('row-gst-total').textContent = fmt(tax.gstTotal);
}

function renderFunds(funds) {
  if (!funds) return;
  const fmt = (n) => '₹ ' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('row-total-funds').textContent = fmt(funds.totalFunds);
}

function renderReconciliation(rec) {
  if (!rec) return;
  const fmt = (n) => '₹ ' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('rec-tot-rv').textContent = fmt(rec.totalReceipts);
  document.getElementById('rec-tot-pv').textContent = fmt(rec.totalPayments);
  document.getElementById('rec-tot-jv').textContent = fmt(rec.totalJournals);
  document.getElementById('rec-tot-cv').textContent = fmt(rec.totalContras);
}

function toggleSection(secId, isVisible) {
  const el = document.getElementById(secId);
  if (el) el.style.display = isVisible ? 'block' : 'none';
}

function applyPreset(preset) {
  const secMembers = document.getElementById('sec-members');
  const secAccounts = document.getElementById('sec-accounts');
  const secVouchers = document.getElementById('sec-vouchers');
  const secTax = document.getElementById('sec-tax');
  const secFunds = document.getElementById('sec-funds');
  const secRec = document.getElementById('sec-rec');

  const chkM = document.getElementById('chk-members');
  const chkA = document.getElementById('chk-accounts');
  const chkV = document.getElementById('chk-vouchers');
  const chkT = document.getElementById('chk-tax');
  const chkF = document.getElementById('chk-funds');
  const chkR = document.getElementById('chk-rec');

  function setAll(m, a, v, t, f, r) {
    if (secMembers) secMembers.style.display = m ? 'block' : 'none';
    if (chkM) chkM.checked = m;
    if (secAccounts) secAccounts.style.display = a ? 'block' : 'none';
    if (chkA) chkA.checked = a;
    if (secVouchers) secVouchers.style.display = v ? 'block' : 'none';
    if (chkV) chkV.checked = v;
    if (secTax) secTax.style.display = t ? 'block' : 'none';
    if (chkT) chkT.checked = t;
    if (secFunds) secFunds.style.display = f ? 'block' : 'none';
    if (chkF) chkF.checked = f;
    if (secRec) secRec.style.display = r ? 'block' : 'none';
    if (chkR) chkR.checked = r;
  }

  if (preset === 'ALL') setAll(true, true, true, true, true, true);
  if (preset === 'MEMBER_DUES') setAll(true, false, false, false, false, false);
  if (preset === 'ACCOUNTING_AUDIT') setAll(false, true, true, false, false, true);
  if (preset === 'TAX_COMPLIANCE') setAll(false, false, false, true, false, false);
  if (preset === 'FUNDS_RESERVES') setAll(false, false, false, false, true, false);
}

function openSavePresetModal() {
  const m = document.getElementById('modal-save-preset');
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

async function submitSavePreset() {
  const title = document.getElementById('preset-title').value.trim();
  const desc = document.getElementById('preset-desc').value.trim();

  if (!title) {
    alert('Please enter a preset title.');
    return;
  }

  const payload = {
    reportName: title,
    description: desc,
    selectedSections: ['members', 'accounts', 'vouchers', 'tax', 'funds', 'reconciliation']
  };

  try {
    const res = await fetch(getApiUrl('multi/saved-configs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('Report preset saved successfully.');
      closeModal('modal-save-preset');
    } else {
      alert('Failed: ' + data.message);
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

function exportMultiExcel() {
  if (!currentMultiData) {
    alert('Please generate multi-report first.');
    return;
  }

  let csv = '=== UNIFIED SOCIETY MULTI-REPORT ===\n\n';

  csv += 'SECTION 2: MEMBERS & OUTSTANDING DUES\n';
  csv += 'Sr No,Member Name,Flat,Billed Charges,Outstanding Dues\n';
  (currentMultiData.memberSummary || []).forEach((m, i) => {
    csv += `"${i + 1}","${m.name}","${m.flatNo}","${m.currentCharges}","${m.outstanding}"\n`;
  });

  csv += '\nSECTION 3: ACCOUNTS & LEDGERS\n';
  csv += 'Account Code,Account Name,Group,Total Debit,Total Credit\n';
  (currentMultiData.accountSummary || []).forEach(a => {
    csv += `"${a.code}","${a.name}","${a.group}","${a.debit}","${a.credit}"\n`;
  });

  csv += '\nSECTION 4: VOUCHER TOTALS\n';
  csv += 'Voucher Type,Count,Total Amount\n';
  (currentMultiData.voucherSummary || []).forEach(v => {
    csv += `"${v.voucherType}","${v.count}","${v.totalAmount}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Multi_Report_${document.getElementById('multi-fy').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
