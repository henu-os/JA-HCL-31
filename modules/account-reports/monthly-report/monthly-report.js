// ════════════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Monthly Account Report JS
// 12-Month Financial Year Spread (April to March)
// ════════════════════════════════════════════════════════════════

let _currentReportType = 'EXPENDITURE';
let _reportData = null;
let _groupsList = [];

document.addEventListener('DOMContentLoaded', () => {
  if (window.Auth && !Auth.requireContext()) return;

  // Initialize As On Date dynamically from active financial year
  const asOnInput = document.getElementById('asOnDate');
  const sessionFyEnd = sessionStorage.getItem('activeSocietyFYEnd') || (window.Auth && Auth.getFYEnd && Auth.getFYEnd()) || '';
  if (asOnInput && sessionFyEnd) {
    asOnInput.value = sessionFyEnd.split('T')[0];
  }

  loadSubGroups();
  refreshData();
});

// ── 1. LOAD SUB-GROUPS DROPDOWN ──────────────────────────────
async function loadSubGroups() {
  try {
    const sid = Auth.getSocietyId();
    if (!sid) return;

    const res = await API.get(`/api/groups?societyId=${sid}`);
    if (res && res.success && Array.isArray(res.data)) {
      _groupsList = res.data;
      populateSubGroupSelect();
    }
  } catch (err) {
    console.warn('Failed to load sub groups list:', err);
  }
}

function populateSubGroupSelect() {
  const sel = document.getElementById('subGroupSelect');
  if (!sel) return;

  sel.innerHTML = '<option value="">-- Choose Sub Group --</option>';
  _groupsList.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.groupId;
    opt.textContent = `${g.grpCode ? g.grpCode + ' - ' : ''}${g.grpName || 'Unnamed Group'}`;
    sel.appendChild(opt);
  });
}

// ── 2. REPORT TYPE SWITCHER ──────────────────────────────────
window.selectReportType = function(type) {
  _currentReportType = type.toUpperCase();

  // Update UI buttons
  const buttons = document.querySelectorAll('#typeSegmentedGroup .type-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('data-type') === _currentReportType) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const subgroupWrapper = document.getElementById('subgroupWrapper');
  if (subgroupWrapper) {
    if (_currentReportType === 'SELECTED') {
      subgroupWrapper.classList.remove('hidden');
      const sel = document.getElementById('subGroupSelect');
      if (sel && !sel.value && sel.options.length > 1) {
        // Pre-select first real group for convenience
        sel.selectedIndex = 1;
      }
    } else {
      subgroupWrapper.classList.add('hidden');
    }
  }

  refreshData();
};

window.onSubGroupChanged = function() {
  if (_currentReportType === 'SELECTED') {
    refreshData();
  }
};

// ── 3. DATA REFRESH ──────────────────────────────────────────
window.refreshData = async function() {
  const tbody = document.getElementById('mainTableBody');
  const tfoot = document.getElementById('mainTableFoot');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16" style="text-align:center; padding:50px; color:#64748b;">
          <i class="bi bi-hourglass-split" style="font-size:24px; color:var(--primary); display:block; margin-bottom:8px;"></i>
          Fetching monthly account summary...
        </td>
      </tr>
    `;
  }
  if (tfoot) tfoot.innerHTML = '';

  const sid = Auth.getSocietyId();
  const fid = Auth.getFYId();
  if (!sid || !fid) {
    showToast('Society and Financial Year context required.', 'warning');
    return;
  }

  const asOnVal = document.getElementById('asOnDate')?.value || '';
  let subGroupId = null;
  if (_currentReportType === 'SELECTED') {
    subGroupId = document.getElementById('subGroupSelect')?.value || null;
  }

  try {
    let url = `/api/reports/monthly-account-summary?societyId=${sid}&fyId=${fid}&reportType=${encodeURIComponent(_currentReportType)}`;
    if (subGroupId) url += `&groupId=${subGroupId}`;
    if (asOnVal)    url += `&asOnDate=${encodeURIComponent(asOnVal)}`;

    const res = await API.get(url);
    if (!res || !res.success) {
      throw new Error(res?.message || 'Failed to load Monthly Account Report.');
    }

    _reportData = res;

    // Dynamically set As On Date from API if input was empty
    const asOnInput = document.getElementById('asOnDate');
    if (asOnInput && !asOnInput.value && res.period && res.period.asOnDate) {
      asOnInput.value = res.period.asOnDate;
    }

    updateMasthead(res);
    filterTable();

  } catch (err) {
    console.error('Error in refreshData:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="16" style="text-align:center; padding:40px; color:#dc2626;">
            <i class="bi bi-exclamation-triangle" style="font-size:24px; display:block; margin-bottom:8px;"></i>
            ${escHtml(err.message || 'Error loading Monthly Account Report')}
          </td>
        </tr>
      `;
    }
    showToast(err.message || 'Failed to load Monthly Account Report.', 'danger');
  }
};

// ── 4. MASTHEAD UPDATES ──────────────────────────────────────
function updateMasthead(data) {
  const socNameEl = document.getElementById('dispSocName');
  const titleEl   = document.getElementById('dispReportTitle');
  const fyLineEl  = document.getElementById('dispFyLine');

  const socName = (data.society && data.society.societyName) || (window.Auth && Auth.getSocietyName()) || '';
  if (socNameEl) socNameEl.textContent = socName ? socName.toUpperCase() : '';

  const asOnDisp = (data.period && data.period.asOnDateDisplay) || '';

  let typeTitle = 'Expenditure';
  if (_currentReportType === 'INCOME') typeTitle = 'Income';
  else if (_currentReportType === 'ASSETS') typeTitle = 'Assets';
  else if (_currentReportType === 'LIABILITIES') typeTitle = 'Liabilities';
  else if (_currentReportType === 'SELECTED') {
    const sel = document.getElementById('subGroupSelect');
    const selText = sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
    typeTitle = selText || 'Selected Sub-Group';
  }

  if (titleEl) {
    titleEl.textContent = asOnDisp ? `Monthly ${typeTitle} Report upto ${asOnDisp}` : `Monthly ${typeTitle} Report`;
  }

  if (fyLineEl) {
    const p = data.period || {};
    const fStart = toDDMMYYYY(p.fyStart);
    const fEnd   = toDDMMYYYY(p.fyEnd);
    fyLineEl.textContent = (fStart && fEnd) ? `F.Y. : ${fStart} - ${fEnd}` : '';
  }
}

// ── 5. FILTER & RENDER TABLE ─────────────────────────────────
window.filterTable = function() {
  if (!_reportData || !_reportData.groups) return;

  const tbody = document.getElementById('mainTableBody');
  const tfoot = document.getElementById('mainTableFoot');
  if (!tbody || !tfoot) return;

  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const hideZero = document.getElementById('chkHideZero')?.checked ?? true;

  let totalAccountsRendered = 0;
  let html = '';

  let grandOp = 0;
  let grandMonths = new Array(12).fill(0);
  let grandTot = 0;

  _reportData.groups.forEach((grp, grpIdx) => {
    // Filter accounts in this group
    const matchedAccounts = (grp.accounts || []).filter(acc => {
      // Search match
      if (q) {
        const text = `${acc.accCode || ''} ${acc.accName || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      // Hide zero movement match
      if (hideZero) {
        const isOpZero = Math.abs(acc.opening || 0) < 0.001;
        const isTotZero = Math.abs(acc.total || 0) < 0.001;
        const areMonthsZero = (acc.months || []).every(m => Math.abs(m || 0) < 0.001);
        if (isOpZero && isTotZero && areMonthsZero) return false;
      }

      return true;
    });

    if (matchedAccounts.length === 0) return;

    // Display group title (e.g. "1.Rent, Rates & Taxes" matching Image 1)
    const displayGrpTitle = grp.groupName.match(/^\d+\./) ? grp.groupName : `${grp.groupIndex || (grpIdx + 1)}.${grp.groupName}`;

    html += `
      <tr class="row-section-header">
        <td colspan="16">
          <i class="bi bi-folder-fill" style="color:#0D47A1; margin-right:6px;"></i> ${escHtml(displayGrpTitle)}
        </td>
      </tr>
    `;

    let grpOp = 0;
    let grpMonths = new Array(12).fill(0);
    let grpTot = 0;

    matchedAccounts.forEach(acc => {
      totalAccountsRendered++;
      grpOp += (acc.opening || 0);
      grpTot += (acc.total || 0);

      html += `
        <tr>
          <td class="td-center" style="font-weight:700; color:#0f172a;">${escHtml(acc.accCode || '—')}</td>
          <td style="font-weight:600; color:#0D47A1;">${escHtml(acc.accName || '—')}</td>
          <td class="td-num ${formatClass(acc.opening)}">${formatCell(acc.opening, true)}</td>
      `;

      for (let m = 0; m < 12; m++) {
        const val = (acc.months && acc.months[m]) || 0;
        grpMonths[m] += val;
        html += `<td class="td-num ${formatClass(val)}">${formatCell(val, false)}</td>`;
      }

      html += `
          <td class="td-num" style="font-weight:700; background:#f8fafc;">${formatCell(acc.total, true)}</td>
        </tr>
      `;
    });

    // Subtotal for group (across all 12 months)
    html += `
      <tr class="row-group-subtotal">
        <td colspan="2" style="text-align:right; font-weight:800; color:#1e293b; padding-right:10px;">
          Sub-Total: ${escHtml(grp.groupName)}
        </td>
        <td class="td-num" style="font-weight:800;">${formatCell(grpOp, true)}</td>
    `;

    for (let m = 0; m < 12; m++) {
      html += `<td class="td-num" style="font-weight:800;">${formatCell(grpMonths[m], false)}</td>`;
    }

    html += `
        <td class="td-num" style="font-weight:800; background:#f1f5f9;">${formatCell(grpTot, true)}</td>
      </tr>
    `;

    grandOp += grpOp;
    for (let m = 0; m < 12; m++) {
      grandMonths[m] += grpMonths[m];
    }
    grandTot += grpTot;
  });

  if (totalAccountsRendered === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16" style="text-align:center; padding:40px; color:#64748b;">
          No account records found matching the selected filter criteria.
        </td>
      </tr>
    `;
    tfoot.innerHTML = '';
  } else {
    tbody.innerHTML = html;

    // Grand Total sticky footer
    let footHtml = `
      <tr class="gt-row">
        <td colspan="2" style="text-align:right; font-weight:800; letter-spacing:0.3px;">GRAND TOTAL:</td>
        <td class="td-num">${formatCell(grandOp, true)}</td>
    `;

    for (let m = 0; m < 12; m++) {
      footHtml += `<td class="td-num">${formatCell(grandMonths[m], false)}</td>`;
    }

    footHtml += `
        <td class="td-num" style="font-size:12px; font-weight:900;">${formatCell(grandTot, true)}</td>
      </tr>
    `;
    tfoot.innerHTML = footHtml;
  }

  const countBadge = document.getElementById('recordCountLabel');
  if (countBadge) {
    countBadge.textContent = `${totalAccountsRendered} Accounts`;
  }
};

// ── 6. CELL FORMATTERS ───────────────────────────────────────
function formatCell(val, keepZero) {
  if (val === undefined || val === null) return keepZero ? '0.00' : '—';
  if (Math.abs(val) < 0.001) {
    return keepZero ? '0.00' : '';
  }
  return Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatClass(val) {
  if (!val || Math.abs(val) < 0.001) return 'val-dim';
  if (val < 0) return 'val-negative';
  return 'val-positive';
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDDMMYYYY(val) {
  if (!val) return '';
  const str = String(val).split('T')[0].trim();
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str.replace(/-/g, '/');
}

// ── 7. EXCEL EXPORT ──────────────────────────────────────────
window.exportExcel = function() {
  if (!_reportData || !_reportData.groups) {
    showToast('No report data available to export.', 'warning');
    return;
  }

  const csvRows = [];
  const monthHeaders = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
  
  // Headers
  csvRows.push(['Acc Code', 'Account Name', 'Opening', ...monthHeaders, 'Total'].join(','));

  let grandOp = 0;
  let grandMonths = new Array(12).fill(0);
  let grandTot = 0;

  _reportData.groups.forEach((grp, grpIdx) => {
    const grpTitle = grp.groupName.match(/^\d+\./) ? grp.groupName : `${grp.groupIndex || (grpIdx + 1)}.${grp.groupName}`;
    csvRows.push(`"","[ ${grpTitle.replace(/"/g, '""')} ]",,,,,,,,,,,,,,`);

    let grpOp = 0;
    let grpMonths = new Array(12).fill(0);
    let grpTot = 0;

    (grp.accounts || []).forEach(acc => {
      grpOp += (acc.opening || 0);
      grpTot += (acc.total || 0);

      const row = [
        `"${(acc.accCode || '').replace(/"/g, '""')}"`,
        `"${(acc.accName || '').replace(/"/g, '""')}"`,
        (acc.opening || 0).toFixed(2)
      ];

      for (let m = 0; m < 12; m++) {
        const val = (acc.months && acc.months[m]) || 0;
        grpMonths[m] += val;
        row.push(val !== 0 ? val.toFixed(2) : '');
      }

      row.push((acc.total || 0).toFixed(2));
      csvRows.push(row.join(','));
    });

    // Sub-total
    const subRow = [
      '""',
      `"Sub-Total: ${grp.groupName.replace(/"/g, '""')}"`,
      grpOp.toFixed(2)
    ];
    for (let m = 0; m < 12; m++) {
      subRow.push(grpMonths[m].toFixed(2));
    }
    subRow.push(grpTot.toFixed(2));
    csvRows.push(subRow.join(','));

    grandOp += grpOp;
    for (let m = 0; m < 12; m++) {
      grandMonths[m] += grpMonths[m];
    }
    grandTot += grpTot;
  });

  // Grand Total
  const gtRow = [
    '""',
    '"GRAND TOTAL"',
    grandOp.toFixed(2)
  ];
  for (let m = 0; m < 12; m++) {
    gtRow.push(grandMonths[m].toFixed(2));
  }
  gtRow.push(grandTot.toFixed(2));
  csvRows.push(gtRow.join(','));

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const asOn = document.getElementById('asOnDate')?.value || new Date().toISOString().slice(0, 10);
  link.setAttribute('download', `Monthly_${_currentReportType}_Report_${asOn}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Monthly Account Report exported successfully.', 'success');
};

// ── 8. PRINT REPORT ──────────────────────────────────────────
window.printReport = function() {
  window.print();
};
