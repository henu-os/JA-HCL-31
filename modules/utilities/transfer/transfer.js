// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Transfer Utility Logic
// ═══════════════════════════════════════════════════════════

let allAccounts = [];
let previewRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadAccounts();
});

async function loadAccounts() {
  try {
    const sid = Auth.getSocietyId();
    const res = await API.get(`accounts?societyId=${sid}`);
    if (res && res.data) {
      allAccounts = res.data;
      populateAccountDropdowns();
    }
  } catch (err) {
    console.error('Failed to load accounts:', err);
    showToast('Failed to load accounts: ' + err.message, 'error');
  }
}

function populateAccountDropdowns() {
  const fromSel = document.getElementById('fromAccount');
  const toSel = document.getElementById('toAccount');

  fromSel.innerHTML = '<option value="">-- Select Source Account --</option>';
  toSel.innerHTML = '<option value="">-- Select Target Account --</option>';

  allAccounts.forEach(acc => {
    const optFrom = document.createElement('option');
    optFrom.value = acc.accountId;
    optFrom.textContent = `${acc.accCode} - ${acc.accName}`;

    const optTo = document.createElement('option');
    optTo.value = acc.accountId;
    optTo.textContent = `${acc.accCode} - ${acc.accName}`;

    fromSel.appendChild(optFrom);
    toSel.appendChild(optTo);
  });
}

function resetForm() {
  document.getElementById('fromAccount').value = '';
  document.getElementById('toAccount').value = '';
  document.getElementById('fromDate').value = '';
  document.getElementById('toDate').value = '';
  document.getElementById('voucherType').value = 'ALL';
  const btnExec = document.getElementById('btnExecuteTransfer');
  if (btnExec) btnExec.style.display = 'none';
  document.getElementById('metricRecords').textContent = '0';
  document.getElementById('metricVouchers').textContent = '0';
  document.getElementById('metricDebit').textContent = '₹0.00';
  document.getElementById('metricCredit').textContent = '₹0.00';
  document.getElementById('recordCount').textContent = 'Showing 0 transaction(s)';
  previewRecords = [];
  renderPreviewTable();
}

async function loadPreview() {
  const sid = Auth.getSocietyId();
  const fyId = Auth.getFYId();
  const fromAccId = parseInt(document.getElementById('fromAccount').value, 10);
  const toAccId = parseInt(document.getElementById('toAccount').value, 10);
  const fromDate = document.getElementById('fromDate').value;
  const toDate = document.getElementById('toDate').value;
  const voucherType = document.getElementById('voucherType').value;

  if (!fromAccId) {
    showToast('Please select a Source (From) Account.', 'warning');
    return;
  }
  if (!toAccId) {
    showToast('Please select a Destination (To) Account.', 'warning');
    return;
  }
  if (fromAccId === toAccId) {
    showToast('Source and Destination accounts cannot be the same.', 'warning');
    return;
  }

  const tbody = document.getElementById('previewTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="td-center" style="padding:30px;"><div class="erp-spinner"></div> Loading transfer preview...</td></tr>';

  try {
    const payload = {
      societyId: sid,
      fyId: fyId || 0,
      fromAccountId: fromAccId,
      toAccountId: toAccId,
      fromDate: fromDate || null,
      toDate: toDate || null,
      voucherType: voucherType
    };

    const res = await API.post('utility/transfer/preview', payload);
    if (res && res.success) {
      previewRecords = res.data || [];
      renderPreviewTable();

      // Update metrics
      document.getElementById('metricRecords').textContent = `${res.count}`;
      document.getElementById('metricVouchers').textContent = `${res.totalVouchers}`;
      document.getElementById('metricDebit').textContent = formatAmount(res.totalDebit);
      document.getElementById('metricCredit').textContent = formatAmount(res.totalCredit);
      document.getElementById('recordCount').textContent = `Showing ${res.count} transaction(s)`;
      const btnExec = document.getElementById('btnExecuteTransfer');
      if (btnExec) btnExec.style.display = res.count > 0 ? 'inline-flex' : 'none';
    } else {
      showToast(res.message || 'Failed to load preview.', 'error');
      tbody.innerHTML = '<tr><td colspan="9" class="td-center text-danger" style="padding:30px;">Error loading preview</td></tr>';
    }
  } catch (err) {
    console.error('Preview error:', err);
    showToast(err.message || 'Error executing preview.', 'error');
    tbody.innerHTML = `<tr><td colspan="9" class="td-center text-danger" style="padding:30px;">${err.message}</td></tr>`;
  }
}

function renderPreviewTable() {
  const tbody = document.getElementById('previewTableBody');
  if (!previewRecords || previewRecords.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:36px;">No ledger entries found matching the specified parameters.</td></tr>';
    document.getElementById('recordCount').textContent = 'Total: 0';
    return;
  }

  let html = '';
  previewRecords.forEach((item, idx) => {
    html += `
      <tr>
        <td class="td-center"><input type="checkbox" class="record-cb" data-id="${item.detailId}" checked onchange="updateSelectedCount()"></td>
        <td>${formatDate(item.voucherDate)}</td>
        <td><strong>${item.voucherNo}</strong></td>
        <td><span class="erp-badge">${item.voucherType}</span></td>
        <td>${item.narration || '-'}</td>
        <td>${item.personName || '-'}</td>
        <td class="td-right">${item.debit > 0 ? formatAmount(item.debit) : '-'}</td>
        <td class="td-right">${item.credit > 0 ? formatAmount(item.credit) : '-'}</td>
        <td class="td-center"><span class="badge-clean">${item.status}</span></td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function toggleSelectAll() {
  const master = document.getElementById('selectAll').checked;
  document.querySelectorAll('.record-cb').forEach(cb => cb.checked = master);
  updateSelectedCount();
}

function updateSelectedCount() {
  const cbs = document.querySelectorAll('.record-cb:checked');
  document.getElementById('recordCount').textContent = `Selected: ${cbs.length} of ${previewRecords.length}`;
}

async function confirmExecuteTransfer() {
  const selectedCbs = Array.from(document.querySelectorAll('.record-cb:checked')).map(cb => parseInt(cb.dataset.id, 10));
  if (selectedCbs.length === 0) {
    showToast('Please select at least one record to transfer.', 'warning');
    return;
  }

  const fromSel = document.getElementById('fromAccount');
  const toSel = document.getElementById('toAccount');
  const fromText = fromSel.options[fromSel.selectedIndex].text;
  const toText = toSel.options[toSel.selectedIndex].text;

  const confirmed = confirm(
    `CONFIRM ATOMIC LEDGER TRANSFER:\n\n` +
    `Transfer ${selectedCbs.length} selected entries from:\n` +
    `Source: ${fromText}\n` +
    `Destination: ${toText}\n\n` +
    `This operation is atomic and irreversible without re-transferring. Do you want to proceed?`
  );

  if (!confirmed) return;

  const btn = document.getElementById('btnExecuteTransfer');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner small"></div> Transferring...';

  try {
    const payload = {
      societyId: Auth.getSocietyId(),
      fyId: Auth.getFYId() || 0,
      fromAccountId: parseInt(fromSel.value, 10),
      toAccountId: parseInt(toSel.value, 10),
      fromDate: document.getElementById('fromDate').value || null,
      toDate: document.getElementById('toDate').value || null,
      voucherType: document.getElementById('voucherType').value,
      selectedDetailIds: selectedCbs
    };

    const res = await API.post('utility/transfer/execute', payload);
    if (res && res.success) {
      showToast(res.message || 'Transfer completed successfully!', 'success');
      alert(`SUCCESS:\n\n${res.message}`);
      await loadPreview();
    } else {
      showToast(res.message || 'Transfer failed.', 'error');
    }
  } catch (err) {
    console.error('Execution error:', err);
    showToast(err.message || 'Failed to execute transfer.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Execute Transfer';
  }
}
