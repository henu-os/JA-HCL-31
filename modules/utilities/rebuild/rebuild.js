// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Rebuild Utility Logic
// ═══════════════════════════════════════════════════════════

let isRebuilding = false;

function resetRebuildView() {
  const tbody = document.getElementById('rebuildTableBody');
  tbody.innerHTML = `
    <tr>
      <td colspan="4" class="empty-state">
        <i class="bi bi-cpu" style="font-size: 24px; display: block; margin-bottom: 6px;"></i>
        Click <strong>Start Full Diagnostic &amp; Rebuild</strong> to execute safety verification and balance synchronization across the current database.
      </td>
    </tr>
  `;
  document.getElementById('metricCompleted').textContent = '0 / 7';
  document.getElementById('metricStatus').textContent = 'READY';
  document.getElementById('recordCount').textContent = 'System Ready';
}

async function confirmExecuteRebuild() {
  if (isRebuilding) return;

  const confirmed = confirm(
    'CONFIRM DATABASE DIAGNOSTIC & REBUILD:\n\n' +
    'This will perform a comprehensive mathematical verification:\n' +
    '• Verify Master Tables (Accounts, Groups, Members)\n' +
    '• Resolve Orphan Line Items\n' +
    '• Synchronize Voucher Header Totals\n' +
    '• Recalculate Account Closing Balances from double-entry lines\n' +
    '• Verify Control Account vs Member Balance Parity\n' +
    '• Confirm Trial Balance Debit = Credit equation\n\n' +
    'Do you wish to proceed?'
  );

  if (!confirmed) return;

  isRebuilding = true;
  const btn = document.getElementById('btnStartRebuild');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner small"></div> Running Diagnostic...';

  document.getElementById('metricStatus').textContent = 'RUNNING';
  document.getElementById('recordCount').textContent = 'Executing 7 stages...';

  const tbody = document.getElementById('rebuildTableBody');
  tbody.innerHTML = '<tr><td colspan="4" class="td-center" style="padding:30px;"><div class="erp-spinner"></div> Executing 7-stage diagnostic and recalculation engine...</td></tr>';

  try {
    const payload = {
      societyId: Auth.getSocietyId(),
      fyId: Auth.getFYId() || 0
    };

    const res = await API.post('utility/rebuild/execute', payload);
    if (res && res.success) {
      const stages = res.stages || [];
      renderStagesTable(stages);

      document.getElementById('metricCompleted').textContent = `${stages.length} / 7`;
      document.getElementById('metricStatus').textContent = 'PASSED';
      document.getElementById('recordCount').textContent = 'All 7 stages passed';

      showToast(res.message || 'Rebuild & diagnostic completed successfully!', 'success');
      alert(`✅ Success: ${res.message}`);
    } else {
      showToast(res.message || 'Rebuild encountered an issue.', 'error');
      document.getElementById('metricStatus').textContent = 'FAILED';
      tbody.innerHTML = '<tr><td colspan="4" class="td-center text-danger" style="padding:30px;">Diagnostic failed</td></tr>';
      alert(`❌ Error: ${res.message}`);
    }
  } catch (err) {
    console.error('Rebuild execution error:', err);
    showToast('Error during rebuild: ' + err.message, 'error');
    document.getElementById('metricStatus').textContent = 'ERROR';
    tbody.innerHTML = `<tr><td colspan="4" class="td-center text-danger" style="padding:30px;">${err.message}</td></tr>`;
    alert('❌ Exception: ' + err.message);
  } finally {
    isRebuilding = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-play-fill"></i> Start Full Diagnostic &amp; Rebuild';
  }
}

function renderStagesTable(stages) {
  const tbody = document.getElementById('rebuildTableBody');
  if (!stages || stages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No diagnostic results returned.</td></tr>';
    return;
  }

  let html = '';
  stages.forEach(s => {
    html += `
      <tr>
        <td class="td-center font-bold">${s.stage}</td>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td class="td-center"><span class="status-badge ${s.status}">${escapeHtml(s.status)}</span></td>
        <td class="text-muted">${escapeHtml(s.details)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}
