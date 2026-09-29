// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Last Year B/f Utility Logic
// ═══════════════════════════════════════════════════════════

let allFYs = [];
let bfPreviewRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadFinancialYears();
});

async function loadFinancialYears() {
  try {
    const sid = Auth.getSocietyId();
    const res = await API.get(`financial-years?societyId=${sid}`);
    if (res && res.data) {
      allFYs = res.data;
      populateFYDropdowns();
    }
  } catch (err) {
    console.error('Failed to load FYs:', err);
    showToast('Failed to load financial years: ' + err.message, 'error');
  }
}

function populateFYDropdowns() {
  const prevSel = document.getElementById('prevFY');
  const currSel = document.getElementById('currFY');
  const activeFYId = Auth.getFYId();

  prevSel.innerHTML = '<option value="">-- Select Source Year --</option>';
  currSel.innerHTML = '<option value="">-- Select Target Year --</option>';

  allFYs.forEach(fy => {
    const optP = document.createElement('option');
    optP.value = fy.fYId;
    optP.textContent = `${fy.fYLabel} (${formatDate(fy.fYStart)} to ${formatDate(fy.fYEnd)})${fy.isClosed ? ' [Closed]' : ''}`;

    const optC = document.createElement('option');
    optC.value = fy.fYId;
    optC.textContent = `${fy.fYLabel} (${formatDate(fy.fYStart)} to ${formatDate(fy.fYEnd)})${fy.isActive ? ' [Active]' : ''}`;

    prevSel.appendChild(optP);
    currSel.appendChild(optC);
  });

  if (activeFYId) {
    currSel.value = activeFYId;
    const idx = allFYs.findIndex(f => f.fYId === activeFYId);
    if (idx !== -1 && idx < allFYs.length - 1) {
      prevSel.value = allFYs[idx + 1].fYId;
    }
  }
}

function resetBfForm() {
  populateFYDropdowns();
  document.getElementById('searchAccount').value = '';
  const btnExec = document.getElementById('btnExecuteBf');
  if (btnExec) btnExec.style.display = 'none';
  document.getElementById('metricCount').textContent = '0';
  document.getElementById('metricDebit').textContent = '₹0.00';
  document.getElementById('metricCredit').textContent = '₹0.00';
  document.getElementById('recordCount').textContent = 'Showing 0 account(s)';
  bfPreviewRecords = [];
  renderBfTable();
}

async function loadBfPreview() {
  const sid = Auth.getSocietyId();
  const prevId = parseInt(document.getElementById('prevFY').value, 10);
  const currId = parseInt(document.getElementById('currFY').value, 10);

  if (!prevId) {
    showToast('Please select a Previous Financial Year.', 'warning');
    return;
  }
  if (!currId) {
    showToast('Please select a Current Financial Year.', 'warning');
    return;
  }
  if (prevId === currId) {
    showToast('Source and Target Financial Years must be different.', 'warning');
    return;
  }

  const tbody = document.getElementById('bfTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="td-center" style="padding:30px;"><div class="erp-spinner"></div> Calculating closing ledger balances...</td></tr>';

  try {
    const payload = {
      societyId: sid,
      prevFYId: prevId,
      currentFYId: currId
    };

    const res = await API.post('utility/last-year-bf/preview', payload);
    if (res && res.success) {
      bfPreviewRecords = res.data || [];
      renderBfTable();

      document.getElementById('metricCount').textContent = `${res.count}`;
      document.getElementById('metricDebit').textContent = formatAmount(res.totalDebit);
      document.getElementById('metricCredit').textContent = formatAmount(res.totalCredit);
      document.getElementById('recordCount').textContent = `Showing ${res.count} account(s)`;

      const btnExec = document.getElementById('btnExecuteBf');
      if (btnExec) btnExec.style.display = res.count > 0 ? 'inline-flex' : 'none';
    } else {
      showToast(res.message || 'Failed to calculate closing balances.', 'error');
      tbody.innerHTML = '<tr><td colspan="9" class="td-center text-danger" style="padding:30px;">Error calculating balances</td></tr>';
    }
  } catch (err) {
    console.error('B/f preview error:', err);
    showToast(err.message || 'Error executing preview.', 'error');
    tbody.innerHTML = `<tr><td colspan="9" class="td-center text-danger" style="padding:30px;">${err.message}</td></tr>`;
  }
}

function filterBfGrid() {
  renderBfTable();
}

function renderBfTable() {
  const tbody = document.getElementById('bfTableBody');
  const search = (document.getElementById('searchAccount')?.value || '').toLowerCase().trim();

  let filtered = bfPreviewRecords;
  if (search) {
    filtered = filtered.filter(r =>
      (r.accName || '').toLowerCase().includes(search) ||
      (r.accCode || '').toLowerCase().includes(search) ||
      (r.grpName || '').toLowerCase().includes(search)
    );
  }

  if (!filtered || filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No accounts found matching the filter.</td></tr>';
    document.getElementById('recordCount').textContent = 'Showing 0 account(s)';
    return;
  }

  let html = '';
  filtered.forEach((item, idx) => {
    const isDr = item.drcr === 'Dr';
    const statusClass = item.status === 'UPDATED' ? 'update' : (item.status === 'ZERO' ? 'zero' : 'new');

    html += `
      <tr>
        <td class="td-center font-bold">${idx + 1}</td>
        <td><span class="badge-vtype Journal">${escapeHtml(item.accCode)}</span></td>
        <td><strong>${escapeHtml(item.accName)}</strong></td>
        <td class="text-muted">${escapeHtml(item.grpName || '—')}</td>
        <td class="td-right font-bold">${formatAmount(item.prevClosingBal)}</td>
        <td class="td-center"><span class="${isDr ? 'drcr-dr' : 'drcr-cr'}">${item.prevClosingDrCr || 'Dr'}</span></td>
        <td class="td-right font-bold" style="color: var(--primary);">${formatAmount(item.newOpeningBal)}</td>
        <td class="td-center"><span class="${isDr ? 'drcr-dr' : 'drcr-cr'}">${item.drcr}</span></td>
        <td class="td-center"><span class="status-badge ${statusClass}">${item.status}</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  document.getElementById('recordCount').textContent = `Showing ${filtered.length} account(s)`;
}

async function confirmExecuteBf() {
  if (!bfPreviewRecords || bfPreviewRecords.length === 0) {
    showToast('No accounts available to bring forward.', 'warning');
    return;
  }

  const sid = Auth.getSocietyId();
  const prevId = parseInt(document.getElementById('prevFY').value, 10);
  const currId = parseInt(document.getElementById('currFY').value, 10);

  const prevText = document.getElementById('prevFY').selectedOptions[0]?.text || '';
  const currText = document.getElementById('currFY').selectedOptions[0]?.text || '';

  const ok = confirm(`CRITICAL CONFIRMATION: Bring forward ${bfPreviewRecords.length} closing balances?\n\nFrom: ${prevText}\nTo: ${currText}\n\nExisting opening balances in target year will be synchronized atomically.\n\nProceed?`);
  if (!ok) return;

  const btn = document.getElementById('btnExecuteBf');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner small"></div> Bringing Forward...';

  try {
    const payload = {
      societyId: sid,
      prevFYId: prevId,
      currentFYId: currId
    };

    const res = await API.post('utility/last-year-bf/execute', payload);
    if (res && res.success) {
      showToast(res.message || 'Opening balances brought forward successfully!', 'success');
      alert(`✅ Success: ${res.message}`);
      await loadBfPreview();
    } else {
      showToast(res.message || 'B/f execution failed.', 'error');
      alert(`❌ Error: ${res.message}`);
    }
  } catch (err) {
    console.error('Execute B/f error:', err);
    showToast('Error during B/f execution: ' + err.message, 'error');
    alert('❌ Exception: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Execute Bring Forward';
  }
}
