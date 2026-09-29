// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — New Year C/f Logic
// ═══════════════════════════════════════════════════════════

let cfYears = [];
let cfRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadFinancialYears();
});

async function loadFinancialYears() {
  try {
    const sid = Auth.getSocietyId();
    const res = await API.get(`financial-years?societyId=${sid}`);
    if (res && res.data) {
      cfYears = res.data;
      populateYearDropdowns();
    }
  } catch (err) {
    console.error('Failed to load FYs:', err);
    showToast('Failed to load financial years: ' + err.message, 'error');
  }
}

function populateYearDropdowns() {
  const closeSel = document.getElementById('closingFY');
  const nextSel = document.getElementById('nextFY');
  const activeFYId = Auth.getFYId();

  closeSel.innerHTML = '<option value="">-- Select Year to Close --</option>';
  nextSel.innerHTML = '<option value="">-- Select Target Next Year --</option>';

  cfYears.forEach(fy => {
    const optClose = document.createElement('option');
    optClose.value = fy.fYId;
    optClose.textContent = `${fy.fYLabel} (${formatDate(fy.fYStart)} to ${formatDate(fy.fYEnd)})${fy.isClosed ? ' [Closed]' : ''}`;

    const optNext = document.createElement('option');
    optNext.value = fy.fYId;
    optNext.textContent = `${fy.fYLabel} (${formatDate(fy.fYStart)} to ${formatDate(fy.fYEnd)})${fy.isActive ? ' [Active]' : ''}`;

    closeSel.appendChild(optClose);
    nextSel.appendChild(optNext);
  });

  if (activeFYId) {
    closeSel.value = activeFYId;
  }
}

function resetCfWizard() {
  populateYearDropdowns();
  document.getElementById('searchAccount').value = '';
  const btn = document.getElementById('btnExecuteCf');
  if (btn) btn.style.display = 'none';
  document.getElementById('metricCount').textContent = '0';
  document.getElementById('metricSurplus').textContent = '₹0.00';
  document.getElementById('metricDebit').textContent = '₹0.00';
  document.getElementById('metricCredit').textContent = '₹0.00';
  document.getElementById('recordCount').textContent = 'Ready to evaluate';
  cfRecords = [];
  renderCfTable();
}

async function loadCfPreview() {
  const sid = Auth.getSocietyId();
  const closingId = parseInt(document.getElementById('closingFY').value, 10);
  const nextId = parseInt(document.getElementById('nextFY').value, 10);

  if (!closingId) {
    showToast('Please select a Closing Financial Year.', 'warning');
    return;
  }
  if (!nextId) {
    showToast('Please select a Target (Next) Financial Year.', 'warning');
    return;
  }
  if (closingId === nextId) {
    showToast('Closing Year and Next Year cannot be identical.', 'warning');
    return;
  }

  const tbody = document.getElementById('cfTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="td-center" style="padding:30px;"><div class="erp-spinner"></div> Calculating Year-End Balances and Surplus/Deficit...</td></tr>';

  try {
    const payload = {
      societyId: sid,
      closingFYId: closingId,
      nextFYId: nextId
    };

    const res = await API.post('utility/new-year-cf/preview', payload);
    if (res && res.success) {
      cfRecords = res.data || [];
      renderCfTable();

      const totalDr = cfRecords.reduce((s, r) => s + (parseFloat(r.closingDebit) || 0), 0);
      const totalCr = cfRecords.reduce((s, r) => s + (parseFloat(r.closingCredit) || 0), 0);

      document.getElementById('metricCount').textContent = `${res.count}`;
      document.getElementById('metricSurplus').textContent = formatAmount(res.surplusDeficit);
      document.getElementById('metricSurplus').className = res.surplusDeficit >= 0 ? 'stat-val-dr' : 'stat-val-cr';
      document.getElementById('metricDebit').textContent = formatAmount(totalDr);
      document.getElementById('metricCredit').textContent = formatAmount(totalCr);
      document.getElementById('recordCount').textContent = `Showing ${res.count} account(s)`;

      const btn = document.getElementById('btnExecuteCf');
      if (btn) btn.style.display = res.count > 0 ? 'inline-flex' : 'none';
    } else {
      showToast(res.message || 'Failed to calculate closing preview.', 'error');
      tbody.innerHTML = '<tr><td colspan="9" class="td-center text-danger" style="padding:30px;">Error calculating closing preview</td></tr>';
    }
  } catch (err) {
    console.error('C/f preview error:', err);
    showToast(err.message || 'Error executing preview.', 'error');
    tbody.innerHTML = `<tr><td colspan="9" class="td-center text-danger" style="padding:30px;">${err.message}</td></tr>`;
  }
}

function filterCfGrid() {
  renderCfTable();
}

function renderCfTable() {
  const tbody = document.getElementById('cfTableBody');
  const search = (document.getElementById('searchAccount')?.value || '').toLowerCase().trim();

  let filtered = cfRecords;
  if (search) {
    filtered = filtered.filter(r =>
      (r.accName || '').toLowerCase().includes(search) ||
      (r.accCode || '').toLowerCase().includes(search) ||
      (r.grpName || '').toLowerCase().includes(search)
    );
  }

  if (!filtered || filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No accounts found matching filter.</td></tr>';
    document.getElementById('recordCount').textContent = 'Showing 0 account(s)';
    return;
  }

  let html = '';
  filtered.forEach((item, idx) => {
    const isBS = item.grpMainId === 1 || item.grpMainId === 2;
    const isDr = item.nextOpeningDrCr === 'Dr';
    const natureMap = { 1: 'Asset', 2: 'Liability', 3: 'Income', 4: 'Expense' };
    const nature = natureMap[item.grpMainId] || 'Asset';

    html += `
      <tr>
        <td class="td-center font-bold">${idx + 1}</td>
        <td><span class="badge-vtype Journal">${escapeHtml(item.accCode)}</span></td>
        <td><strong>${escapeHtml(item.accName)}</strong></td>
        <td><span class="badge-vtype ${item.grpMainId === 1 || item.grpMainId === 3 ? 'Receipt' : 'Payment'}">${nature}</span></td>
        <td class="td-right font-bold">${formatAmount(item.closingDebit)}</td>
        <td class="td-right font-bold">${formatAmount(item.closingCredit)}</td>
        <td class="td-center"><span class="status-badge ${isBS ? 'carry' : 'close'}">${item.treatment}</span></td>
        <td class="td-right font-bold" style="color: var(--primary);">${isBS ? formatAmount(item.nextOpeningBal) : '—'}</td>
        <td class="td-center">${isBS ? `<span class="${isDr ? 'drcr-dr' : 'drcr-cr'}">${item.nextOpeningDrCr}</span>` : '—'}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  document.getElementById('recordCount').textContent = `Showing ${filtered.length} account(s)`;
}

async function confirmExecuteCf() {
  if (!cfRecords || cfRecords.length === 0) {
    showToast('No accounts available to close/carry forward.', 'warning');
    return;
  }

  const sid = Auth.getSocietyId();
  const closingId = parseInt(document.getElementById('closingFY').value, 10);
  const nextId = parseInt(document.getElementById('nextFY').value, 10);

  const closeText = document.getElementById('closingFY').selectedOptions[0]?.text || '';
  const nextText = document.getElementById('nextFY').selectedOptions[0]?.text || '';

  const confirmed = confirm(
    'CRITICAL FINANCIAL YEAR-END CLOSING:\n\n' +
    `Closing Financial Year: ${closeText}\n` +
    `Next Financial Year: ${nextText}\n\n` +
    'This will:\n' +
    '1. Calculate final Profit/Loss (Surplus/Deficit)\n' +
    '2. Transfer all Asset and Liability balances to Next Year Opening Balances\n' +
    '3. Optionally lock and finalize the closing year\n\n' +
    'Are you completely sure you want to execute this year-end operation?'
  );

  if (!confirmed) return;

  const btn = document.getElementById('btnExecuteCf');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner small"></div> Finalizing &amp; Carrying Forward...';

  try {
    const payload = {
      societyId: sid,
      closingFYId: closingId,
      nextFYId: nextId,
      closeOldYear: false
    };

    const res = await API.post('utility/new-year-cf/execute', payload);
    if (res && res.success) {
      showToast(res.message || 'Year closing & carry forward completed successfully!', 'success');
      alert(`✅ Success: ${res.message}\nCarried Forward: ${res.carriedForwardCount} accounts.`);
      await loadCfPreview();
    } else {
      showToast(res.message || 'Carry forward failed.', 'error');
      alert(`❌ Error: ${res.message}`);
    }
  } catch (err) {
    console.error('Execute C/f error:', err);
    showToast('Error during C/f execution: ' + err.message, 'error');
    alert('❌ Exception: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Execute Year Closing &amp; C/f';
  }
}
