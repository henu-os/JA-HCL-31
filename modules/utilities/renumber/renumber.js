// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Renumber Utility Logic
// ═══════════════════════════════════════════════════════════

let renumberRecords = [];

document.addEventListener('DOMContentLoaded', () => {
  updatePrefixDefault();
});

function updatePrefixDefault() {
  const vType = document.getElementById('voucherType').value;
  const pfxInput = document.getElementById('prefix');
  switch (vType) {
    case 'Receipt':
      pfxInput.value = 'RV-';
      break;
    case 'Payment':
      pfxInput.value = 'PV-';
      break;
    case 'Contra':
      pfxInput.value = 'CV-';
      break;
    case 'Journal':
      pfxInput.value = 'JV-';
      break;
    case 'OtherReceipt':
      pfxInput.value = 'ORV-';
      break;
    default:
      pfxInput.value = `${vType}-`;
  }
}

function resetRenumberForm() {
  document.getElementById('voucherType').value = 'Payment';
  updatePrefixDefault();
  document.getElementById('startingNumber').value = '1';
  document.getElementById('numberPadding').value = '4';
  document.getElementById('fromDate').value = '';
  document.getElementById('toDate').value = '';
  const btnExec = document.getElementById('btnExecuteRenumber');
  if (btnExec) btnExec.style.display = 'none';
  document.getElementById('metricCount').textContent = '0';
  document.getElementById('metricSeries').textContent = '—';
  document.getElementById('metricAmount').textContent = '₹0.00';
  document.getElementById('recordCount').textContent = 'Showing 0 voucher(s)';
  renumberRecords = [];
  renderRenumberTable();
}

async function loadRenumberPreview() {
  const sid = Auth.getSocietyId();
  const fyId = Auth.getFYId();
  const vType = document.getElementById('voucherType').value;
  const prefix = document.getElementById('prefix').value.trim();
  const startNo = parseInt(document.getElementById('startingNumber').value, 10) || 1;
  const padding = parseInt(document.getElementById('numberPadding').value, 10) || 4;
  const fromDate = document.getElementById('fromDate').value;
  const toDate = document.getElementById('toDate').value;

  const tbody = document.getElementById('renumberTableBody');
  tbody.innerHTML = '<tr><td colspan="8" class="td-center" style="padding:30px;"><div class="erp-spinner"></div> Calculating voucher sequence preview...</td></tr>';

  try {
    const payload = {
      societyId: sid,
      fyId: fyId || 0,
      voucherType: vType,
      prefix: prefix,
      startingNumber: startNo,
      numberPadding: padding,
      fromDate: fromDate || null,
      toDate: toDate || null
    };

    const res = await API.post('utility/renumber/preview', payload);
    if (res && res.success) {
      renumberRecords = res.data || [];
      renderRenumberTable();

      const totalAmt = renumberRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      document.getElementById('metricCount').textContent = `${res.count}`;
      document.getElementById('metricSeries').textContent = res.count > 0 ? `${prefix}${startNo.toString().padStart(padding, '0')} ... ${prefix}${(res.endNo).toString().padStart(padding, '0')}` : 'None';
      document.getElementById('metricAmount').textContent = formatAmount(totalAmt);
      document.getElementById('recordCount').textContent = `Showing ${res.count} voucher(s)`;

      const btnExec = document.getElementById('btnExecuteRenumber');
      if (btnExec) btnExec.style.display = res.count > 0 ? 'inline-flex' : 'none';
    } else {
      showToast(res.message || 'Failed to load renumber preview.', 'error');
      tbody.innerHTML = '<tr><td colspan="8" class="td-center text-danger" style="padding:30px;">Error calculating sequence preview</td></tr>';
    }
  } catch (err) {
    console.error('Renumber preview error:', err);
    showToast(err.message || 'Error executing preview.', 'error');
    tbody.innerHTML = `<tr><td colspan="8" class="td-center text-danger" style="padding:30px;">${err.message}</td></tr>`;
  }
}

function renderRenumberTable() {
  const tbody = document.getElementById('renumberTableBody');
  if (!renumberRecords || renumberRecords.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No vouchers found matching the specified type and date range.</td></tr>';
    document.getElementById('recordCount').textContent = 'Showing 0 voucher(s)';
    return;
  }

  let html = '';
  renumberRecords.forEach((item, idx) => {
    html += `
      <tr>
        <td class="td-center font-bold">${idx + 1}</td>
        <td>${formatDate(item.voucherDate)}</td>
        <td><span class="old-vno">${escapeHtml(item.oldVoucherNo)}</span></td>
        <td><span class="new-vno">${escapeHtml(item.newVoucherNo)}</span></td>
        <td><span class="badge-vtype ${item.voucherType}">${escapeHtml(item.voucherType)}</span></td>
        <td class="td-right font-bold">${formatAmount(item.amount)}</td>
        <td>${escapeHtml(item.personName || '—')}</td>
        <td class="text-muted">${escapeHtml(item.narration || '')}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function confirmExecuteRenumber() {
  if (!renumberRecords || renumberRecords.length === 0) {
    showToast('No vouchers available to renumber.', 'warning');
    return;
  }

  const sid = Auth.getSocietyId();
  const fyId = Auth.getFYId();
  const vType = document.getElementById('voucherType').value;
  const prefix = document.getElementById('prefix').value.trim();
  const startNo = parseInt(document.getElementById('startingNumber').value, 10) || 1;
  const padding = parseInt(document.getElementById('numberPadding').value, 10) || 4;
  const fromDate = document.getElementById('fromDate').value;
  const toDate = document.getElementById('toDate').value;

  const ok = confirm(`CRITICAL WARNING: This will permanently re-sequence ${renumberRecords.length} '${vType}' vouchers starting from '${prefix}${startNo.toString().padStart(padding, '0')}'.\n\nAll voucher links and report associations will be updated transactionally.\n\nDo you want to proceed?`);
  if (!ok) return;

  const btn = document.getElementById('btnExecuteRenumber');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner small"></div> Resequencing...';

  try {
    const payload = {
      societyId: sid,
      fyId: fyId || 0,
      voucherType: vType,
      prefix: prefix,
      startingNumber: startNo,
      numberPadding: padding,
      fromDate: fromDate || null,
      toDate: toDate || null
    };

    const res = await API.post('utility/renumber/execute', payload);
    if (res && res.success) {
      showToast(res.message || 'Vouchers successfully renumbered!', 'success');
      alert(`✅ Success: ${res.message}`);
      await loadRenumberPreview();
    } else {
      showToast(res.message || 'Renumber execution failed.', 'error');
      alert(`❌ Renumber Error: ${res.message}`);
    }
  } catch (err) {
    console.error('Execute renumber error:', err);
    showToast('Error during renumber execution: ' + err.message, 'error');
    alert('❌ Exception during renumber: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-lightning-charge-fill"></i> Execute Renumbering';
  }
}
