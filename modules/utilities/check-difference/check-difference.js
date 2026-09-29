// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Check Difference Logic
// ═══════════════════════════════════════════════════════════

let allAuditRecords = [];
let displayedRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  await runDifferenceCheck();
});

function resetDifferenceFilters() {
  document.getElementById('diffVoucherType').value = 'ALL';
  document.getElementById('diffStatusFilter').value = 'ALL';
  document.getElementById('diffFromDate').value = '';
  document.getElementById('diffToDate').value = '';
  runDifferenceCheck();
}

async function runDifferenceCheck() {
  const sid = Auth.getSocietyId();
  const fyId = Auth.getFYId();
  const vType = document.getElementById('diffVoucherType')?.value || 'ALL';
  const fromDate = document.getElementById('diffFromDate')?.value;
  const toDate = document.getElementById('diffToDate')?.value;

  const tbody = document.getElementById('diffTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="td-center" style="padding:30px;"><div class="erp-spinner"></div> Auditing database vouchers for Debit ≠ Credit imbalances...</td></tr>';

  try {
    let url = `utility/check-difference?societyId=${sid}&fyId=${fyId || 0}`;
    if (vType && vType !== 'ALL') url += `&voucherType=${encodeURIComponent(vType)}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;

    const res = await API.get(url);
    if (res && res.success) {
      allAuditRecords = res.data || [];

      const cleanCount = res.totalVouchers - res.unbalancedCount;
      document.getElementById('metricTotalAudited').textContent = `${res.totalVouchers}`;
      document.getElementById('metricBalanced').textContent = `${cleanCount}`;
      document.getElementById('metricUnbalanced').textContent = `${res.unbalancedCount}`;
      document.getElementById('metricTotalDiff').textContent = formatAmount(res.totalDifference);

      applyLocalStatusFilter();
    } else {
      showToast(res.message || 'Audit failed.', 'error');
      tbody.innerHTML = '<tr><td colspan="9" class="td-center text-danger">Error running audit</td></tr>';
    }
  } catch (err) {
    console.error('Audit error:', err);
    showToast(err.message || 'Failed to execute audit.', 'error');
    tbody.innerHTML = `<tr><td colspan="9" class="td-center text-danger">${err.message}</td></tr>`;
  }
}

function applyLocalStatusFilter() {
  const filterType = document.getElementById('diffStatusFilter')?.value || 'ALL';

  if (filterType === 'UNBALANCED') {
    displayedRecords = allAuditRecords.filter(r => r.status !== 'BALANCED');
  } else if (filterType === 'BALANCED') {
    displayedRecords = allAuditRecords.filter(r => r.status === 'BALANCED');
  } else {
    displayedRecords = allAuditRecords;
  }

  renderAuditTable();
}

function renderAuditTable() {
  const tbody = document.getElementById('diffTableBody');
  document.getElementById('recordCount').textContent = `Showing ${displayedRecords.length} of ${allAuditRecords.length} voucher(s)`;

  if (!displayedRecords || displayedRecords.length === 0) {
    const isUnbalancedOnly = document.getElementById('diffStatusFilter')?.value === 'UNBALANCED';
    tbody.innerHTML = isUnbalancedOnly
      ? '<tr><td colspan="9" class="td-center text-success" style="padding:36px;"><i class="bi bi-shield-check" style="font-size:28px; display:block; margin-bottom:6px;"></i><strong>Zero Discrepancies Found!</strong> All audited vouchers have 100% mathematical Debit/Credit parity.</td></tr>'
      : '<tr><td colspan="9" class="empty-state">No vouchers match the specified filter criteria.</td></tr>';
    return;
  }

  let html = '';
  displayedRecords.forEach((item, idx) => {
    const statusClass = item.status === 'UNBALANCED' ? 'UNBALANCED' : (item.status === 'EMPTY' ? 'EMPTY' : 'BALANCED');

    html += `
      <tr>
        <td class="td-center font-bold">${idx + 1}</td>
        <td>${formatDate(item.voucherDate)}</td>
        <td><strong>${escapeHtml(item.voucherNo)}</strong></td>
        <td><span class="badge-vtype ${item.voucherType}">${escapeHtml(item.voucherType)}</span></td>
        <td class="td-right font-bold">${formatAmount(item.totalDebit)}</td>
        <td class="td-right font-bold">${formatAmount(item.totalCredit)}</td>
        <td class="td-right font-bold" style="color: ${item.difference > 0 ? 'var(--danger)' : 'var(--success)'};">
          ${item.difference > 0 ? formatAmount(item.difference) : '0.00'}
        </td>
        <td class="td-center"><span class="status-badge ${statusClass}">${item.status}</span></td>
        <td class="${item.status !== 'BALANCED' ? 'text-danger font-bold' : 'text-muted'}">${escapeHtml(item.issue)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function exportDiscrepanciesExcel() {
  if (!displayedRecords || displayedRecords.length === 0) {
    showToast('No audit records to export.', 'warning');
    return;
  }

  const exportData = displayedRecords.map((r, idx) => ({
    'Sr No': idx + 1,
    'Date': r.voucherDate,
    'Voucher No': r.voucherNo,
    'Voucher Type': r.voucherType,
    'Total Debit': r.totalDebit,
    'Total Credit': r.totalCredit,
    'Difference': r.difference,
    'Status': r.status,
    'Issue': r.issue
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Audit_Check');
  XLSX.writeFile(wb, `Audit_Check_Difference_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Audit report exported to Excel successfully!', 'success');
}
