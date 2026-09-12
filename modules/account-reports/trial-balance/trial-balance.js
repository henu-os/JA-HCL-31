// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Trial Balance Statement Engine
// Full 11-Column Double-Entry Financial Audit Statement
// ═══════════════════════════════════════════════════════════

let tbDataList = [];
let _fyStartDate = '';
let _fyEndDate = '';

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireContext()) return;
  initContext();
  setupFinancialYearDates();
  await loadTrialBalance();
});

function initContext() {
  const socName = Auth.getSocietyName();
  const fyLabel = Auth.getFYLabel();

  const pSocEl = document.getElementById('printSocName');
  if (pSocEl) pSocEl.textContent = socName;

  const pFyEl = document.getElementById('printFYLabel');
  if (pFyEl) pFyEl.textContent = fyLabel;
}

function setupFinancialYearDates() {
  const fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2026-27');
  const parts = fyLabel.split('-');
  let startYear = parseInt(parts[0], 10) || 2026;
  if (startYear < 2000) startYear += 2000;
  const endYear = startYear + 1;

  _fyStartDate = `${startYear}-04-01`;
  _fyEndDate = `${endYear}-03-31`;

  const fromEl = document.getElementById('fromDate');
  const toEl = document.getElementById('toDate');
  if (fromEl && !fromEl.value) fromEl.value = _fyStartDate;
  if (toEl && !toEl.value) toEl.value = _fyEndDate;
}

window.applyDatePreset = function (preset) {
  const fromEl = document.getElementById('fromDate');
  const toEl = document.getElementById('toDate');
  if (!fromEl || !toEl) return;

  if (!_fyStartDate) setupFinancialYearDates();
  const fyStart = new Date(_fyStartDate);
  const fyEnd = new Date(_fyEndDate);
  const now = new Date();

  const fmt = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (preset === 'full') {
    fromEl.value = _fyStartDate;
    toEl.value = _fyEndDate;
  } else if (preset === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    fromEl.value = fmt(start);
    toEl.value = fmt(end);
  } else if (preset === 'last-month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    fromEl.value = fmt(start);
    toEl.value = fmt(end);
  } else if (preset === 'q1') {
    fromEl.value = `${fyStart.getFullYear()}-04-01`;
    toEl.value = `${fyStart.getFullYear()}-06-30`;
  } else if (preset === 'q2') {
    fromEl.value = `${fyStart.getFullYear()}-07-01`;
    toEl.value = `${fyStart.getFullYear()}-09-30`;
  } else if (preset === 'q3') {
    fromEl.value = `${fyStart.getFullYear()}-10-01`;
    toEl.value = `${fyStart.getFullYear()}-12-31`;
  } else if (preset === 'q4') {
    fromEl.value = `${fyEnd.getFullYear()}-01-01`;
    toEl.value = `${fyEnd.getFullYear()}-03-31`;
  }

  loadTrialBalance();
};

window.onDateChange = function () {
  const presetEl = document.getElementById('datePresetSelect');
  if (presetEl) presetEl.value = 'custom';
  loadTrialBalance();
};

window.onFilterChange = function () {
  const sel = document.getElementById('mainGroupSelect');
  const printGrp = document.getElementById('printGroup');
  if (sel && printGrp) {
    printGrp.textContent = sel.options[sel.selectedIndex].text;
  }
  loadTrialBalance();
};

function formatDisplayDate(dStr) {
  if (!dStr) return '';
  const parts = dStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dStr;
}

async function loadTrialBalance() {
  const societyId = Auth.getSocietyId();
  const fyId      = Auth.getFYId();
  if (!societyId || !fyId) return;

  const fromDate = document.getElementById('fromDate')?.value || '';
  const toDate   = document.getElementById('toDate')?.value || '';
  const mainGroupVal = document.getElementById('mainGroupSelect')?.value || 'ALL';

  const pPeriodEl = document.getElementById('printDatePeriod');
  if (pPeriodEl) {
    if (fromDate && toDate) {
      pPeriodEl.textContent = `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`;
    } else if (fromDate) {
      pPeriodEl.textContent = `From ${formatDisplayDate(fromDate)}`;
    } else if (toDate) {
      pPeriodEl.textContent = `Up to ${formatDisplayDate(toDate)}`;
    } else {
      pPeriodEl.textContent = 'All Transactions';
    }
  }

  showLoading('Generating Trial Balance statement...');

  try {
    let url = `/reports/trial-balance?societyId=${societyId}&fyId=${fyId}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;
    if (mainGroupVal !== 'ALL') url += `&mainGroupId=${encodeURIComponent(mainGroupVal)}`;

    const res = await API.get(url);
    if (res.success) {
      tbDataList = res.data || [];
      sortAccountsByGroup(tbDataList);
      filterTable();
    } else {
      showToast(res.message || 'Failed to load Trial Balance.', 'error');
    }
  } catch (err) {
    handleError(err, 'Failed to load Trial Balance.');
  } finally {
    hideLoading();
  }
}

function filterTable() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const filterType = document.getElementById('filterType')?.value || 'ALL';

  const filtered = tbDataList.filter(item => {
    // Search query
    const text = `${item.accCode || ''} ${item.accName || ''} ${item.groupName || ''} ${item.grpMainName || ''}`.toLowerCase();
    if (q && !text.includes(q)) return false;

    // Balance scope filter
    if (filterType === 'DEBIT' && item.closingDr <= 0) return false;
    if (filterType === 'CREDIT' && item.closingCr <= 0) return false;
    if (filterType === 'ACTIVE') {
      const hasActivity = (item.openingDr > 0 || item.openingCr > 0 || item.totalDebit > 0 || item.totalCredit > 0 || item.closingDr > 0 || item.closingCr > 0);
      if (!hasActivity) return false;
    }
    if (filterType === 'NIL' && (item.closingDr > 0 || item.closingCr > 0)) return false;

    return true;
  });

  // Sort: Main category (Assets->Liab->Inc->Exp), then Account Group (groupName), then Account Code
  sortAccountsByGroup(filtered);

  renderTable(filtered);
}

function sortAccountsByGroup(arr) {
  if (!arr || !Array.isArray(arr)) return arr;
  return arr.sort((a, b) => {
    const gA = a.grpMainId || 0, gB = b.grpMainId || 0;
    if (gA !== gB) return gA - gB;
    const grpA = (a.groupName || '').toUpperCase();
    const grpB = (b.groupName || '').toUpperCase();
    if (grpA !== grpB) return grpA.localeCompare(grpB);
    return (a.accCode || '').localeCompare(b.accCode || '');
  });
}

function getGroupBadgeHtml(grpMainId, groupName) {
  let cls = 'grp-badge';
  if (grpMainId === 1) cls += ' grp-asset';
  else if (grpMainId === 2) cls += ' grp-liab';
  else if (grpMainId === 3) cls += ' grp-inc';
  else if (grpMainId === 4) cls += ' grp-exp';

  return `<span class="${cls}" title="${escHtml(groupName)}">${escHtml(groupName)}</span>`;
}

function renderTable(list) {
  const tbody = document.getElementById('mainTableBody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px; color:#64748b;">No account records found matching the selected criteria.</td></tr>`;
    updateKPIs([], 0, 0, 0, 0, 0, 0);
    return;
  }

  let totOpDr = 0, totOpCr = 0;
  let totTxnDr = 0, totTxnCr = 0;
  let totClDr = 0, totClCr = 0;

  let html = '';
  let currentGroup = null;
  let subOpDr = 0, subOpCr = 0;
  let subTxnDr = 0, subTxnCr = 0;
  let subClDr = 0, subClCr = 0;

  const closeSubTotalRow = (grpName) => {
    return `
      <tr class="row-group-subtotal">
        <td colspan="3" style="text-align:right; font-weight:700; font-size:11px; color:#1e293b; padding-right:12px;">
          Sub-Total: ${escHtml(grpName)}
        </td>
        <td class="td-num" style="font-weight:700; color:#0f172a;">${subOpDr > 0 ? formatAmount(subOpDr) : '0.00'}</td>
        <td class="td-num" style="font-weight:700; color:#0f172a;">${subOpCr > 0 ? formatAmount(subOpCr) : '0.00'}</td>
        <td class="td-num" style="font-weight:700; color:#0f172a;">${subTxnDr > 0 ? formatAmount(subTxnDr) : '0.00'}</td>
        <td class="td-num" style="font-weight:700; color:#0f172a;">${subTxnCr > 0 ? formatAmount(subTxnCr) : '0.00'}</td>
        <td class="td-num" style="font-weight:800; color:#0f172a;">${subClDr > 0 ? formatAmount(subClDr) : '0.00'}</td>
        <td class="td-num" style="font-weight:800; color:#0f172a;">${subClCr > 0 ? formatAmount(subClCr) : '0.00'}</td>
      </tr>
    `;
  };

  list.forEach((item, i) => {
    totOpDr  += (item.openingDr || 0);
    totOpCr  += (item.openingCr || 0);
    totTxnDr += (item.totalDebit || 0);
    totTxnCr += (item.totalCredit || 0);
    totClDr  += (item.closingDr || 0);
    totClCr  += (item.closingCr || 0);

    const grpName = (item.groupName || '').trim() || 'General';

    if (grpName !== currentGroup) {
      if (currentGroup !== null) {
        html += closeSubTotalRow(currentGroup);
      }
      currentGroup = grpName;
      subOpDr = 0; subOpCr = 0;
      subTxnDr = 0; subTxnCr = 0;
      subClDr = 0; subClCr = 0;

      html += `
        <tr class="row-group-header">
          <td colspan="9">
            <span style="font-size:10px; margin-right:5px; color:#1a3a6e;">&#9654;</span> ${escHtml(grpName)}
          </td>
        </tr>
      `;
    }

    subOpDr  += (item.openingDr || 0);
    subOpCr  += (item.openingCr || 0);
    subTxnDr += (item.totalDebit || 0);
    subTxnCr += (item.totalCredit || 0);
    subClDr  += (item.closingDr || 0);
    subClCr  += (item.closingCr || 0);

    html += `
      <tr>
        <td style="text-align:center; color:#64748b; font-weight:600;">${i + 1}</td>
        <td style="text-align:center; font-weight:800; color:#0f172a;">${escHtml(item.accCode || '—')}</td>
        <td style="font-weight:700; color:#0D47A1;">${escHtml(item.accName || '—')}</td>
        <td class="td-num ${item.openingDr > 0 ? 'val-debit' : ''}">${item.openingDr > 0 ? formatAmount(item.openingDr) : '—'}</td>
        <td class="td-num ${item.openingCr > 0 ? 'val-credit' : ''}">${item.openingCr > 0 ? formatAmount(item.openingCr) : '—'}</td>
        <td class="td-num ${item.totalDebit > 0 ? 'val-debit' : ''}">${item.totalDebit > 0 ? formatAmount(item.totalDebit) : '—'}</td>
        <td class="td-num ${item.totalCredit > 0 ? 'val-credit' : ''}">${item.totalCredit > 0 ? formatAmount(item.totalCredit) : '—'}</td>
        <td class="td-num ${item.closingDr > 0 ? 'val-debit' : ''}" style="font-weight:800;">${item.closingDr > 0 ? formatAmount(item.closingDr) : '0.00'}</td>
        <td class="td-num ${item.closingCr > 0 ? 'val-credit' : ''}" style="font-weight:800;">${item.closingCr > 0 ? formatAmount(item.closingCr) : '0.00'}</td>
      </tr>
    `;
  });

  if (currentGroup !== null) {
    html += closeSubTotalRow(currentGroup);
  }

  tbody.innerHTML = html;

  updateKPIs(list, totOpDr, totOpCr, totTxnDr, totTxnCr, totClDr, totClCr);
}

function updateKPIs(list, opDr, opCr, txnDr, txnCr, clDr, clCr) {
  const accCountText = `${list.length} Accounts`;
  const badgeEl = document.getElementById('badgeAccCount');
  if (badgeEl) badgeEl.textContent = accCountText;

  const kpiCountEl = document.getElementById('kpiAccCount');
  if (kpiCountEl) kpiCountEl.textContent = accCountText;

  document.getElementById('kpiOpeningDr').textContent = '₹' + formatAmount(opDr);
  document.getElementById('kpiOpeningCr').textContent = '₹' + formatAmount(opCr);
  document.getElementById('kpiTxnDebit').textContent  = '₹' + formatAmount(txnDr);
  document.getElementById('kpiTxnCredit').textContent = '₹' + formatAmount(txnCr);
  document.getElementById('kpiClosingDr').textContent = '₹' + formatAmount(clDr);
  document.getElementById('kpiClosingCr').textContent = '₹' + formatAmount(clCr);

  document.getElementById('ftOpeningDr').textContent = formatAmount(opDr);
  document.getElementById('ftOpeningCr').textContent = formatAmount(opCr);
  document.getElementById('ftTxnDr').textContent     = formatAmount(txnDr);
  document.getElementById('ftTxnCr').textContent     = formatAmount(txnCr);
  document.getElementById('ftClosingDr').textContent = formatAmount(clDr);
  document.getElementById('ftClosingCr').textContent = formatAmount(clCr);

  // Calculate Differences
  const diffOp = opDr - opCr;
  const absDiffOp = Math.abs(diffOp);
  const diffTxn = txnDr - txnCr;
  const absDiffTxn = Math.abs(diffTxn);
  const diffCl = clDr - clCr;
  const absDiffCl = Math.abs(diffCl);

  // Populate Difference Bar Cells
  const ftDiffOpening = document.getElementById('ftDiffOpening');
  if (ftDiffOpening) {
    if (absDiffOp < 0.01) {
      ftDiffOpening.innerHTML = `<span class="erp-badge erp-badge-success" style="font-weight:800; font-size:10.5px;">₹0.00</span>`;
    } else {
      const side = diffOp > 0 ? 'Dr' : 'Cr';
      ftDiffOpening.innerHTML = `<span class="erp-badge erp-badge-danger" style="font-weight:800; font-size:10.5px;">₹${formatAmount(absDiffOp)} (${side})</span>`;
    }
  }

  const ftDiffTxn = document.getElementById('ftDiffTxn');
  if (ftDiffTxn) {
    if (absDiffTxn < 0.01) {
      ftDiffTxn.innerHTML = `<span class="erp-badge erp-badge-success" style="font-weight:800; font-size:10.5px;">₹0.00</span>`;
    } else {
      const side = diffTxn > 0 ? 'Dr' : 'Cr';
      ftDiffTxn.innerHTML = `<span class="erp-badge erp-badge-danger" style="font-weight:800; font-size:10.5px;">₹${formatAmount(absDiffTxn)} (${side})</span>`;
    }
  }

  const ftDiffClosing = document.getElementById('ftDiffClosing');
  if (ftDiffClosing) {
    if (absDiffCl < 0.01) {
      ftDiffClosing.innerHTML = `<span class="erp-badge erp-badge-success" style="font-weight:800; font-size:10.5px;">₹0.00 (Balanced)</span>`;
    } else {
      const side = diffCl > 0 ? 'Dr' : 'Cr';
      ftDiffClosing.innerHTML = `<span class="erp-badge erp-badge-danger" style="font-weight:800; font-size:10.5px;">₹${formatAmount(absDiffCl)} (${side})</span>`;
    }
  }

  const rowDiff = document.getElementById('rowDifference');
  if (rowDiff) {
    if (absDiffCl < 0.01 && absDiffOp < 0.01 && absDiffTxn < 0.01) {
      rowDiff.style.background = '#f0fdf4';
    } else {
      rowDiff.style.background = '#fff1f2';
    }
  }

  const isBalanced = absDiffCl < 0.01;
  const auditBadge = document.getElementById('kpiAuditBadge');
  const auditDesc = document.getElementById('kpiAuditDesc');

  if (isBalanced) {
    if (auditBadge) {
      auditBadge.className = 'erp-badge erp-badge-success';
      auditBadge.textContent = 'Balanced (₹0.00 Diff)';
    }
    if (auditDesc) {
      auditDesc.textContent = 'Total Closing Debit exactly equals Total Closing Credit. Audit verified.';
      auditDesc.style.color = '#15803d';
    }
  } else {
    if (auditBadge) {
      auditBadge.className = 'erp-badge erp-badge-danger';
      auditBadge.textContent = `Unbalanced (₹${formatAmount(absDiffCl)} Diff)`;
    }
    if (auditDesc) {
      auditDesc.textContent = `Audit Alert: Net difference of ₹${formatAmount(absDiffCl)} detected between Debits and Credits.`;
      auditDesc.style.color = '#dc2626';
    }
  }
}

function toggleSummaryPopover(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('summaryPopover');
  if (popover) {
    popover.classList.toggle('show');
  }
}

document.addEventListener('click', (e) => {
  const popover = document.getElementById('summaryPopover');
  const btn = document.getElementById('btnSummaryToggle');
  if (popover && popover.classList.contains('show')) {
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
      popover.classList.remove('show');
    }
  }
});

function exportCsv() {
  if (!tbDataList || tbDataList.length === 0) {
    showToast('No data to export.', 'warning');
    return;
  }

  const mainGroupVal = document.getElementById('mainGroupSelect')?.value || 'ALL';
  const headers = [
    '#',
    'Account Code',
    'Account Name',
    'Opening Bal (DR)',
    'Opening Bal (CR)',
    'Transaction Debit',
    'Transaction Credit',
    'Closing Bal (DR)',
    'Closing Bal (CR)'
  ];

  const csvRows = [headers.join(',')];

  let totOpDr = 0, totOpCr = 0, totTxnDr = 0, totTxnCr = 0, totClDr = 0, totClCr = 0;

  let currentCsvGroup = null;
  let subOpDr = 0, subOpCr = 0, subTxnDr = 0, subTxnCr = 0, subClDr = 0, subClCr = 0;

  const closeCsvSubTotal = (grp) => {
    return [
      '""', '""', `"Sub-Total: ${(grp || '').replace(/"/g, '""')}"`,
      subOpDr.toFixed(2), subOpCr.toFixed(2), subTxnDr.toFixed(2), subTxnCr.toFixed(2), subClDr.toFixed(2), subClCr.toFixed(2)
    ].join(',');
  };

  tbDataList.forEach((r, i) => {
    totOpDr  += (r.openingDr || 0);
    totOpCr  += (r.openingCr || 0);
    totTxnDr += (r.totalDebit || 0);
    totTxnCr += (r.totalCredit || 0);
    totClDr  += (r.closingDr || 0);
    totClCr  += (r.closingCr || 0);

    const grpName = (r.groupName || '').trim() || 'General';

    if (grpName !== currentCsvGroup) {
      if (currentCsvGroup !== null) {
        csvRows.push(closeCsvSubTotal(currentCsvGroup));
      }
      currentCsvGroup = grpName;
      subOpDr = 0; subOpCr = 0;
      subTxnDr = 0; subTxnCr = 0;
      subClDr = 0; subClCr = 0;

      csvRows.push(`"","","[ ${grpName.replace(/"/g, '""')} ]","","","","","",""`);
    }

    subOpDr  += (r.openingDr || 0);
    subOpCr  += (r.openingCr || 0);
    subTxnDr += (r.totalDebit || 0);
    subTxnCr += (r.totalCredit || 0);
    subClDr  += (r.closingDr || 0);
    subClCr  += (r.closingCr || 0);

    const row = [
      i + 1,
      `"${(r.accCode || '').replace(/"/g, '""')}"`,
      `"${(r.accName || '').replace(/"/g, '""')}"`,
      (r.openingDr || 0).toFixed(2),
      (r.openingCr || 0).toFixed(2),
      (r.totalDebit || 0).toFixed(2),
      (r.totalCredit || 0).toFixed(2),
      (r.closingDr || 0).toFixed(2),
      (r.closingCr || 0).toFixed(2)
    ];
    csvRows.push(row.join(','));
  });

  if (currentCsvGroup !== null) {
    csvRows.push(closeCsvSubTotal(currentCsvGroup));
  }

  // Grand Total Row
  const totalRow = [
    '""',
    '""',
    '"GRAND TOTAL"',
    totOpDr.toFixed(2),
    totOpCr.toFixed(2),
    totTxnDr.toFixed(2),
    totTxnCr.toFixed(2),
    totClDr.toFixed(2),
    totClCr.toFixed(2)
  ];
  csvRows.push(totalRow.join(','));

  // Difference Row
  const diffOp = (totOpDr - totOpCr).toFixed(2);
  const diffTxn = (totTxnDr - totTxnCr).toFixed(2);
  const diffCl = (totClDr - totClCr).toFixed(2);
  const diffRow = [
    '""',
    '""',
    '"DIFFERENCE"',
    diffOp,
    '""',
    diffTxn,
    '""',
    diffCl,
    '""'
  ];
  csvRows.push(diffRow.join(','));

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const fromDate = document.getElementById('fromDate')?.value || '';
  const toDate   = document.getElementById('toDate')?.value || '';
  const dateSuffix = (fromDate && toDate) ? `_${fromDate}_to_${toDate}` : `_${new Date().toISOString().slice(0, 10)}`;
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Trial_Balance_${mainGroupVal}${dateSuffix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Trial Balance exported to CSV successfully.', 'success');
}
