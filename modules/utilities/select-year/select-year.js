// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Select Year Logic
// ═══════════════════════════════════════════════════════════

let fyList = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadYears();
});

async function loadYears() {
  const tbody = document.getElementById('yearTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="td-center" style="padding:30px;"><div class="erp-spinner"></div> Loading financial years...</td></tr>';

  try {
    const sid = Auth.getSocietyId();
    const res = await API.get(`financial-years?societyId=${sid}`);
    if (res && res.data) {
      fyList = res.data;
      renderFYTable();
    } else {
      showToast('Failed to load financial years.', 'error');
      tbody.innerHTML = '<tr><td colspan="6" class="td-center text-danger">Error loading data</td></tr>';
    }
  } catch (err) {
    console.error('FY load error:', err);
    showToast(err.message || 'Error loading financial years.', 'error');
    tbody.innerHTML = `<tr><td colspan="6" class="td-center text-danger">${err.message}</td></tr>`;
  }
}

function renderFYTable() {
  const tbody = document.getElementById('yearTableBody');
  const currentActiveFYId = Auth.getFYId();
  const currentActiveLabel = Auth.getFYLabel() || '2026-2027';

  document.getElementById('metricActiveYear').textContent = currentActiveLabel;
  document.getElementById('metricTotalYears').textContent = `${fyList.length}`;
  document.getElementById('recordCount').textContent = `Showing ${fyList.length} configured year(s)`;

  if (!fyList || fyList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No financial years found in database.</td></tr>';
    return;
  }

  let html = '';
  fyList.forEach((item, idx) => {
    const isCurrentContext = item.fYId === currentActiveFYId || (!currentActiveFYId && item.isActive);
    const badgeStatus = item.isClosed
      ? '<span class="badge-vtype Payment">Closed</span>'
      : '<span class="badge-vtype Receipt">Open / Active</span>';

    html += `
      <tr class="${isCurrentContext ? 'active-fy-row' : ''}">
        <td class="td-center font-bold">${idx + 1}</td>
        <td><strong>${escapeHtml(item.fYLabel)}</strong></td>
        <td>${formatDate(item.fYStart)}</td>
        <td>${formatDate(item.fYEnd)}</td>
        <td class="td-center">${badgeStatus}</td>
        <td class="td-center">
          ${isCurrentContext
            ? '<span class="active-pill"><i class="bi bi-check-circle-fill"></i> Current Active</span>'
            : `<button type="button" class="btn-switch" onclick="switchActiveFY(${item.fYId})"><i class="bi bi-box-arrow-in-right"></i> Switch Context</button>`
          }
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function switchActiveFY(targetFYId) {
  const targetFY = fyList.find(f => f.fYId === targetFYId);
  if (!targetFY) return;

  // Update storage context
  Auth.setFY(targetFY.fYId, targetFY.fYLabel, targetFY.fYStart, targetFY.fYEnd);

  // Update top bar in workspace shell if available
  try {
    if (window.parent && window.parent.document) {
      const topBarFY = window.parent.document.getElementById('topBarFY');
      if (topBarFY) topBarFY.textContent = targetFY.fYLabel;
      const topBarFYBtn = window.parent.document.querySelector('.topbar-fy-btn');
      if (topBarFYBtn) topBarFYBtn.title = `Financial Year: ${targetFY.fYLabel}`;
    }
  } catch { }

  showToast(`Financial year switched to ${targetFY.fYLabel}!`, 'success');
  renderFYTable();
}
