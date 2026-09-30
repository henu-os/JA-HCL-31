// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — New Tran Type Logic
// ═══════════════════════════════════════════════════════════

let tranTypesList = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadTranTypes();
});

function resetTranTypeForm() {
  document.getElementById('tranVoucherType').value = '';
  document.getElementById('tranPrefix').value = '';
  document.getElementById('tranStartNo').value = '1';
  document.getElementById('tranLastNo').value = '0';
  document.getElementById('tranVoucherType').focus();
}

async function loadTranTypes() {
  const tbody = document.getElementById('tranTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="td-center" style="padding:30px;"><div class="erp-spinner"></div> Loading transaction number series...</td></tr>';

  try {
    const sid = Auth.getSocietyId();
    const fyId = Auth.getFYId();
    const res = await API.get(`utility/tran-types?societyId=${sid}&fyId=${fyId || 0}`);
    if (res && res.success) {
      tranTypesList = res.data || [];
      document.getElementById('metricCount').textContent = `${tranTypesList.length}`;
      document.getElementById('recordCount').textContent = `Showing ${tranTypesList.length} series`;
      renderTranTypesTable();
    } else {
      showToast('Failed to load transaction types.', 'error');
      tbody.innerHTML = '<tr><td colspan="7" class="td-center text-danger">Error loading data</td></tr>';
    }
  } catch (err) {
    console.error('Tran type error:', err);
    showToast(err.message || 'Error loading transaction types.', 'error');
    tbody.innerHTML = `<tr><td colspan="7" class="td-center text-danger">${err.message}</td></tr>`;
  }
}

function renderTranTypesTable() {
  const tbody = document.getElementById('tranTableBody');
  if (!tranTypesList || tranTypesList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No transaction numbering configurations found. Enter a type name and click Save.</td></tr>';
    return;
  }

  let html = '';
  tranTypesList.forEach((item, idx) => {
    const nextSeq = (item.lastNo || 0) + 1;
    const sampleNo = `${item.prefix || ''}${String(nextSeq).padStart(4, '0')}`;

    html += `
      <tr>
        <td class="td-center font-bold">${idx + 1}</td>
        <td><strong>${escapeHtml(item.voucherType)}</strong></td>
        <td><code>${escapeHtml(item.prefix || '—')}</code></td>
        <td class="td-right font-bold">${item.startNo}</td>
        <td class="td-right font-bold text-muted">${item.lastNo}</td>
        <td><strong style="color: var(--primary);">${sampleNo}</strong></td>
        <td class="td-center">
          <button type="button" class="btn-action-icon" title="Edit this series" onclick="editTranType('${escapeHtml(item.voucherType)}', '${escapeHtml(item.prefix || '')}', ${item.startNo}, ${item.lastNo})">
            <i class="bi bi-pencil-square"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function editTranType(vType, prefix, startNo, lastNo) {
  document.getElementById('tranVoucherType').value = vType;
  document.getElementById('tranPrefix').value = prefix;
  document.getElementById('tranStartNo').value = startNo;
  document.getElementById('tranLastNo').value = lastNo;
  document.getElementById('tranVoucherType').focus();
}

async function saveTranType() {
  const vType = document.getElementById('tranVoucherType').value.trim();
  const prefix = document.getElementById('tranPrefix').value.trim();
  const startNo = parseInt(document.getElementById('tranStartNo').value, 10) || 1;
  const lastNo = parseInt(document.getElementById('tranLastNo').value, 10) || 0;

  if (!vType) {
    showToast('Please enter a Voucher Type Name.', 'warning');
    document.getElementById('tranVoucherType').focus();
    return;
  }

  const btn = document.getElementById('btnSaveTranType');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner small"></div> Saving...';

  try {
    const sid = Auth.getSocietyId();
    const fyId = Auth.getFYId();

    const payload = {
      societyId: sid,
      fyId: fyId || 0,
      voucherType: vType,
      prefix: prefix,
      startNo: startNo,
      lastNo: lastNo
    };

    const res = await API.post('utility/tran-types', payload);
    if (res && res.success) {
      showToast(res.message || 'Transaction type configured successfully!', 'success');
      resetTranTypeForm();
      await loadTranTypes();
    } else {
      showToast(res.message || 'Failed to save transaction type.', 'error');
    }
  } catch (err) {
    console.error('Save tran type error:', err);
    showToast('Error saving: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save"></i> Save Numbering Rule';
  }
}
