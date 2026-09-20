// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Trial Balance Statement Engine
// Full Double-Entry Financial Audit Statement (Statutory Layout)
// ═══════════════════════════════════════════════════════════

let tbDataList = [];
let _fyStartDate = '';
let _fyEndDate = '';
let _currentFormat = 'full'; // 'full' | 'opening' | 'closing'
let _currentOptions = {
  includeSubtotals: true,
  includeMembers: true,
  includeZeros: false
};
let _cachedMembersList = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireContext()) return;
  initContext();
  setupFinancialYearDates();
  await loadMembersCache();
  await loadTrialBalance();
});

function initContext() {
  const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.';
  const fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : '2026-27';

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

async function loadMembersCache() {
  if (_cachedMembersList && _cachedMembersList.length > 0) return;
  const sid = (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : '1';
  try {
    const res = await API.get('/members?societyId=' + sid);
    if (res && res.data && Array.isArray(res.data)) {
      _cachedMembersList = res.data;
    }
  } catch (e) {
    console.warn('Could not cache members list:', e);
  }
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

window.onFormatSelectChange = function (fmt) {
  _currentFormat = fmt || 'full';
  selectTbFormat(_currentFormat);
  filterTable();
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
  const mainGroupVal = document.getElementById('mainGroupSelect')?.value || 'ALL';

  const filtered = tbDataList.filter(item => {
    // Search query
    const text = `${item.accCode || ''} ${item.accName || ''} ${item.groupName || ''} ${item.grpMainName || ''}`.toLowerCase();
    if (q && !text.includes(q)) return false;

    // Main group filter
    if (mainGroupVal !== 'ALL' && String(item.grpMainId) !== String(mainGroupVal)) return false;

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

  const schedules = buildTrialBalanceSchedules(_currentFormat, _currentOptions, filtered);
  renderTable(schedules, _currentFormat, _currentOptions);
}

// ── DATA PREPARATION & SCHEDULE GROUPING (ACCOUNTING LOGIC) ──
function buildTrialBalanceSchedules(fmt, options, customSource) {
  const source = customSource || tbDataList || [];
  const includeZeros = options.includeZeros;
  const includeMembers = options.includeMembers;

  // Filter accounts
  const accounts = source.filter(item => {
    if (!includeZeros) {
      if (fmt === 'opening') {
        if ((item.openingDr || 0) === 0 && (item.openingCr || 0) === 0) return false;
      } else if (fmt === 'closing') {
        if ((item.closingDr || 0) === 0 && (item.closingCr || 0) === 0) return false;
      } else {
        const hasAct = (item.openingDr || 0) > 0 || (item.openingCr || 0) > 0 ||
                       (item.totalDebit || 0) > 0 || (item.totalCredit || 0) > 0 ||
                       (item.closingDr || 0) > 0 || (item.closingCr || 0) > 0;
        if (!hasAct) return false;
      }
    }
    return true;
  });

  // Schedule Definitions based on chosen format
  let scheduleDefs = [];
  if (fmt === 'opening') {
    scheduleDefs = [
      { id: 1, title: 'Assets', mainId: 1 },
      { id: 99, title: 'INCOME & EXPENDITURE A/C.', isSpecialIncExp: true },
      { id: 2, title: 'Liabilities & Funds', mainId: 2 }
    ];
  } else {
    // Full or Closing: Assets -> Income & Expenditure -> Expenditure -> Income -> Liabilities
    scheduleDefs = [
      { id: 1, title: 'Assets', mainId: 1 },
      { id: 99, title: 'INCOME & EXPENDITURE A/C.', isSpecialIncExp: true },
      { id: 4, title: 'Expenditure', mainId: 4 },
      { id: 3, title: 'Income', mainId: 3 },
      { id: 2, title: 'Liabilities & Funds', mainId: 2 }
    ];
  }

  const resultSchedules = [];

  scheduleDefs.forEach(sDef => {
    let sAccounts = [];
    if (sDef.isSpecialIncExp) {
      sAccounts = accounts.filter(a => {
        const code = (a.accCode || '').toLowerCase();
        const name = (a.accName || '').toLowerCase();
        return code === '299' || code === 'inc-1999' || code === 'exp-1999' ||
               name.includes('income & expenditure') || name.includes('income and expenditure');
      });
    } else {
      sAccounts = accounts.filter(a => {
        const code = (a.accCode || '').toLowerCase();
        const name = (a.accName || '').toLowerCase();
        const isIncExp = code === '299' || code === 'inc-1999' || code === 'exp-1999' ||
                         name.includes('income & expenditure') || name.includes('income and expenditure');
        return a.grpMainId === sDef.mainId && !isIncExp;
      });
    }

    if (sAccounts.length === 0 && !sDef.isSpecialIncExp) return;

    // Group accounts inside this schedule by groupName
    const groupMap = new Map();
    sAccounts.forEach(acc => {
      const gName = (acc.groupName || '').trim() || 'General';
      if (!groupMap.has(gName)) groupMap.set(gName, []);
      groupMap.get(gName).push(acc);
    });

    const groups = [];
    let runningGrpIndex = 1;

    groupMap.forEach((grpAccs, grpName) => {
      let title = grpName.toUpperCase();
      if (!/^\d+\./.test(title) && title !== 'CURRENT ASSETS' && title !== 'DUES FROM MEMBERS') {
        title = `${runningGrpIndex}.${title}`;
        runningGrpIndex++;
      }

      const isMemberGroup = grpName.toLowerCase().includes('due') && grpName.toLowerCase().includes('member');
      let finalItems = grpAccs.map(a => ({
        code: a.accCode || '',
        name: a.accName || '',
        openingDr: a.openingDr || 0,
        openingCr: a.openingCr || 0,
        txnDr: a.totalDebit || 0,
        txnCr: a.totalCredit || 0,
        closingDr: a.closingDr || 0,
        closingCr: a.closingCr || 0,
        isMember: false
      }));

      if (isMemberGroup && includeMembers && _cachedMembersList && _cachedMembersList.length > 0) {
        finalItems = _cachedMembersList.map(m => {
          const mCode = m.flatNo ? `${m.wing ? m.wing + '-' : ''}${m.flatNo}` : (m.memCode || 'M-');
          const mName = m.memName || m.name || '';
          const opPrin = parseFloat(m.opPrincipal) || 0;
          const opInt = parseFloat(m.opInterest) || 0;
          const totalOp = opPrin + opInt;
          const opDr = totalOp >= 0 ? totalOp : 0;
          const opCr = totalOp < 0 ? Math.abs(totalOp) : 0;

          return {
            code: mCode,
            name: mName,
            openingDr: opDr,
            openingCr: opCr,
            txnDr: 0,
            txnCr: 0,
            closingDr: opDr,
            closingCr: opCr,
            isMember: true
          };
        });
      }

      // Calculate group subtotals
      let subOpDr = 0, subOpCr = 0, subTxnDr = 0, subTxnCr = 0, subClDr = 0, subClCr = 0;
      finalItems.forEach(it => {
        subOpDr  += it.openingDr;
        subOpCr  += it.openingCr;
        subTxnDr += it.txnDr;
        subTxnCr += it.txnCr;
        subClDr  += it.closingDr;
        subClCr  += it.closingCr;
      });

      groups.push({
        groupName: grpName,
        displayTitle: title,
        items: finalItems,
        subtotals: {
          openingDr: subOpDr,
          openingCr: subOpCr,
          txnDr: subTxnDr,
          txnCr: subTxnCr,
          closingDr: subClDr,
          closingCr: subClCr
        }
      });
    });

    if (groups.length > 0) {
      resultSchedules.push({
        title: sDef.title,
        groups: groups
      });
    }
  });

  return resultSchedules;
}

// ── MODERN JEEVIKA ERP TABLE RENDERER ─────────────────────────
function renderTable(schedules, fmt, options) {
  const tbody = document.getElementById('mainTableBody');
  const thead = document.querySelector('#mainTable thead');
  const tfoot = document.querySelector('#mainTable tfoot');
  if (!tbody || !thead || !tfoot) return;

  const colCount = (fmt === 'full') ? 8 : 4;

  // 1. Dynamic Table Header (ERP Design)
  if (fmt === 'full') {
    thead.innerHTML = `
      <tr>
        <th style="width:95px; text-align:center;">Acc Code</th>
        <th>Account Name</th>
        <th style="width:110px; text-align:right;">Opening Dr</th>
        <th style="width:110px; text-align:right;">Opening Cr</th>
        <th style="width:120px; text-align:right;">Transaction Debit</th>
        <th style="width:120px; text-align:right;">Transaction Credit</th>
        <th style="width:120px; text-align:right;">Closing Dr</th>
        <th style="width:120px; text-align:right;">Closing Cr</th>
      </tr>
    `;
  } else if (fmt === 'opening') {
    thead.innerHTML = `
      <tr>
        <th style="width:120px; text-align:center;">Acc Code</th>
        <th>Account Name</th>
        <th style="width:160px; text-align:right;">Opening Dr</th>
        <th style="width:160px; text-align:right;">Opening Cr</th>
      </tr>
    `;
  } else {
    // Closing
    thead.innerHTML = `
      <tr>
        <th style="width:120px; text-align:center;">Acc Code</th>
        <th>Account Name</th>
        <th style="width:160px; text-align:right;">Closing Dr</th>
        <th style="width:160px; text-align:right;">Closing Cr</th>
      </tr>
    `;
  }

  // 2. Table Body (Sections -> Groups -> Items -> Subtotals)
  if (!schedules || schedules.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center; padding:40px; color:#64748b;">No account records found matching the selected criteria.</td></tr>`;
    tfoot.innerHTML = '';
    updateKPIs(0, 0, 0, 0, 0, 0, 0);
    return;
  }

  let html = '';
  let totOpDr = 0, totOpCr = 0;
  let totTxnDr = 0, totTxnCr = 0;
  let totClDr = 0, totClCr = 0;
  let totalAccountsCount = 0;

  schedules.forEach(sec => {
    if (!sec.groups || sec.groups.length === 0) return;

    // Major Schedule Header Banner (Deep Navy ERP Accent)
    html += `
      <tr class="row-section-header">
        <td colspan="${colCount}">
          <i class="bi bi-folder2-open" style="margin-right:6px;"></i> ${escHtml(sec.title)}
        </td>
      </tr>
    `;

    sec.groups.forEach(grp => {
      // Schedule Group Header Row (Ice-blue ERP Subheader)
      html += `
        <tr class="row-group-header">
          <td colspan="${colCount}">
            <span style="font-size:10px; margin-right:5px; color:#1a3a6e;">&#9654;</span> ${escHtml(grp.displayTitle)}
          </td>
        </tr>
      `;

      grp.items.forEach(it => {
        totalAccountsCount++;
        totOpDr  += (it.openingDr || 0);
        totOpCr  += (it.openingCr || 0);
        totTxnDr += (it.txnDr || 0);
        totTxnCr += (it.txnCr || 0);
        totClDr  += (it.closingDr || 0);
        totClCr  += (it.closingCr || 0);

        const memPad = it.isMember ? 'padding-left:22px; color:#475569; font-weight:600;' : '';
        const memIcon = it.isMember ? '<i class="bi bi-person-fill" style="color:#94a3b8; font-size:10px; margin-right:4px;"></i>' : '';

        if (fmt === 'full') {
          html += `
            <tr>
              <td style="text-align:center; font-weight:800; color:#0f172a;">${escHtml(it.code || '—')}</td>
              <td style="font-weight:700; color:#0D47A1; ${memPad}">${memIcon}${escHtml(it.name || '—')}</td>
              <td class="td-num ${it.openingDr > 0 ? 'val-debit' : ''}">${it.openingDr > 0 ? formatAmount(it.openingDr) : '—'}</td>
              <td class="td-num ${it.openingCr > 0 ? 'val-credit' : ''}">${it.openingCr > 0 ? formatAmount(it.openingCr) : '—'}</td>
              <td class="td-num ${it.txnDr > 0 ? 'val-debit' : ''}">${it.txnDr > 0 ? formatAmount(it.txnDr) : '—'}</td>
              <td class="td-num ${it.txnCr > 0 ? 'val-credit' : ''}">${it.txnCr > 0 ? formatAmount(it.txnCr) : '—'}</td>
              <td class="td-num ${it.closingDr > 0 ? 'val-debit' : ''}" style="font-weight:800;">${it.closingDr > 0 ? formatAmount(it.closingDr) : '0.00'}</td>
              <td class="td-num ${it.closingCr > 0 ? 'val-credit' : ''}" style="font-weight:800;">${it.closingCr > 0 ? formatAmount(it.closingCr) : '0.00'}</td>
            </tr>
          `;
        } else if (fmt === 'opening') {
          html += `
            <tr>
              <td style="text-align:center; font-weight:800; color:#0f172a;">${escHtml(it.code || '—')}</td>
              <td style="font-weight:700; color:#0D47A1; ${memPad}">${memIcon}${escHtml(it.name || '—')}</td>
              <td class="td-num ${it.openingDr > 0 ? 'val-debit' : ''}" style="font-weight:800;">${it.openingDr > 0 ? formatAmount(it.openingDr) : '0.00'}</td>
              <td class="td-num ${it.openingCr > 0 ? 'val-credit' : ''}" style="font-weight:800;">${it.openingCr > 0 ? formatAmount(it.openingCr) : '0.00'}</td>
            </tr>
          `;
        } else {
          // Closing
          html += `
            <tr>
              <td style="text-align:center; font-weight:800; color:#0f172a;">${escHtml(it.code || '—')}</td>
              <td style="font-weight:700; color:#0D47A1; ${memPad}">${memIcon}${escHtml(it.name || '—')}</td>
              <td class="td-num ${it.closingDr > 0 ? 'val-debit' : ''}" style="font-weight:800;">${it.closingDr > 0 ? formatAmount(it.closingDr) : '0.00'}</td>
              <td class="td-num ${it.closingCr > 0 ? 'val-credit' : ''}" style="font-weight:800;">${it.closingCr > 0 ? formatAmount(it.closingCr) : '0.00'}</td>
            </tr>
          `;
        }
      });

      // Group Sub-total Row
      if (options.includeSubtotals) {
        if (fmt === 'full') {
          html += `
            <tr class="row-group-subtotal">
              <td colspan="2" style="text-align:right; font-weight:700; font-size:11px; color:#1e293b; padding-right:12px;">
                Sub-Total: ${escHtml(grp.groupName)}
              </td>
              <td class="td-num" style="font-weight:700; color:#0f172a;">${grp.subtotals.openingDr > 0 ? formatAmount(grp.subtotals.openingDr) : '0.00'}</td>
              <td class="td-num" style="font-weight:700; color:#0f172a;">${grp.subtotals.openingCr > 0 ? formatAmount(grp.subtotals.openingCr) : '0.00'}</td>
              <td class="td-num" style="font-weight:700; color:#0f172a;">${grp.subtotals.txnDr > 0 ? formatAmount(grp.subtotals.txnDr) : '0.00'}</td>
              <td class="td-num" style="font-weight:700; color:#0f172a;">${grp.subtotals.txnCr > 0 ? formatAmount(grp.subtotals.txnCr) : '0.00'}</td>
              <td class="td-num" style="font-weight:800; color:#0f172a;">${grp.subtotals.closingDr > 0 ? formatAmount(grp.subtotals.closingDr) : '0.00'}</td>
              <td class="td-num" style="font-weight:800; color:#0f172a;">${grp.subtotals.closingCr > 0 ? formatAmount(grp.subtotals.closingCr) : '0.00'}</td>
            </tr>
          `;
        } else if (fmt === 'opening') {
          html += `
            <tr class="row-group-subtotal">
              <td colspan="2" style="text-align:right; font-weight:700; font-size:11px; color:#1e293b; padding-right:12px;">
                Sub-Total: ${escHtml(grp.groupName)}
              </td>
              <td class="td-num" style="font-weight:800; color:#0f172a;">${grp.subtotals.openingDr > 0 ? formatAmount(grp.subtotals.openingDr) : '0.00'}</td>
              <td class="td-num" style="font-weight:800; color:#0f172a;">${grp.subtotals.openingCr > 0 ? formatAmount(grp.subtotals.openingCr) : '0.00'}</td>
            </tr>
          `;
        } else {
          // Closing
          html += `
            <tr class="row-group-subtotal">
              <td colspan="2" style="text-align:right; font-weight:700; font-size:11px; color:#1e293b; padding-right:12px;">
                Sub-Total: ${escHtml(grp.groupName)}
              </td>
              <td class="td-num" style="font-weight:800; color:#0f172a;">${grp.subtotals.closingDr > 0 ? formatAmount(grp.subtotals.closingDr) : '0.00'}</td>
              <td class="td-num" style="font-weight:800; color:#0f172a;">${grp.subtotals.closingCr > 0 ? formatAmount(grp.subtotals.closingCr) : '0.00'}</td>
            </tr>
          `;
        }
      }
    });
  });

  tbody.innerHTML = html;

  // 3. Table Footer (Grand Totals & Differences)
  if (fmt === 'full') {
    const diffOp = totOpDr - totOpCr;
    const diffTxn = totTxnDr - totTxnCr;
    const diffCl = totClDr - totClCr;
    const isBalanced = Math.abs(diffCl) < 0.01;

    const badgeOp = Math.abs(diffOp) < 0.01
      ? `<span class="erp-badge erp-badge-success" style="font-weight:800; font-size:10.5px;">₹0.00</span>`
      : `<span class="erp-badge erp-badge-danger" style="font-weight:800; font-size:10.5px;">₹${formatAmount(Math.abs(diffOp))} (${diffOp > 0 ? 'Dr' : 'Cr'})</span>`;

    const badgeTxn = Math.abs(diffTxn) < 0.01
      ? `<span class="erp-badge erp-badge-success" style="font-weight:800; font-size:10.5px;">₹0.00</span>`
      : `<span class="erp-badge erp-badge-danger" style="font-weight:800; font-size:10.5px;">₹${formatAmount(Math.abs(diffTxn))} (${diffTxn > 0 ? 'Dr' : 'Cr'})</span>`;

    const badgeCl = isBalanced
      ? `<span class="erp-badge erp-badge-success" style="font-weight:800; font-size:10.5px;">₹0.00 (Balanced)</span>`
      : `<span class="erp-badge erp-badge-danger" style="font-weight:800; font-size:10.5px;">₹${formatAmount(Math.abs(diffCl))} (${diffCl > 0 ? 'Dr' : 'Cr'})</span>`;

    tfoot.innerHTML = `
      <tr class="gt-row">
        <td colspan="2" style="text-align:right; font-weight:800;">Grand Total:</td>
        <td class="td-num val-debit">${formatAmount(totOpDr)}</td>
        <td class="td-num val-credit">${formatAmount(totOpCr)}</td>
        <td class="td-num val-debit">${formatAmount(totTxnDr)}</td>
        <td class="td-num val-credit">${formatAmount(totTxnCr)}</td>
        <td class="td-num val-debit">${formatAmount(totClDr)}</td>
        <td class="td-num val-credit">${formatAmount(totClCr)}</td>
      </tr>
      <tr class="diff-row" style="background: ${isBalanced ? '#f0fdf4' : '#fff1f2'};">
        <td colspan="2" style="text-align:right; font-weight:800; color:#991b1b; text-transform:uppercase; font-size:11px; letter-spacing:0.3px;">Difference:</td>
        <td colspan="2" style="text-align:center; padding:5px 8px;">${badgeOp}</td>
        <td colspan="2" style="text-align:center; padding:5px 8px;">${badgeTxn}</td>
        <td colspan="2" style="text-align:center; padding:5px 8px;">${badgeCl}</td>
      </tr>
    `;
  } else if (fmt === 'opening') {
    const diffOp = totOpDr - totOpCr;
    const isBalanced = Math.abs(diffOp) < 0.01;
    const badgeOp = isBalanced
      ? `<span class="erp-badge erp-badge-success" style="font-weight:800; font-size:10.5px;">₹0.00 (Balanced)</span>`
      : `<span class="erp-badge erp-badge-danger" style="font-weight:800; font-size:10.5px;">₹${formatAmount(Math.abs(diffOp))} (${diffOp > 0 ? 'Dr' : 'Cr'})</span>`;

    tfoot.innerHTML = `
      <tr class="gt-row">
        <td colspan="2" style="text-align:right; font-weight:800;">Grand Total:</td>
        <td class="td-num val-debit">${formatAmount(totOpDr)}</td>
        <td class="td-num val-credit">${formatAmount(totOpCr)}</td>
      </tr>
      <tr class="diff-row" style="background: ${isBalanced ? '#f0fdf4' : '#fff1f2'};">
        <td colspan="2" style="text-align:right; font-weight:800; color:#991b1b; text-transform:uppercase; font-size:11px; letter-spacing:0.3px;">Difference:</td>
        <td colspan="2" style="text-align:center; padding:5px 8px;">${badgeOp}</td>
      </tr>
    `;
  } else {
    // Closing
    const diffCl = totClDr - totClCr;
    const isBalanced = Math.abs(diffCl) < 0.01;
    const badgeCl = isBalanced
      ? `<span class="erp-badge erp-badge-success" style="font-weight:800; font-size:10.5px;">₹0.00 (Balanced)</span>`
      : `<span class="erp-badge erp-badge-danger" style="font-weight:800; font-size:10.5px;">₹${formatAmount(Math.abs(diffCl))} (${diffCl > 0 ? 'Dr' : 'Cr'})</span>`;

    tfoot.innerHTML = `
      <tr class="gt-row">
        <td colspan="2" style="text-align:right; font-weight:800;">Grand Total:</td>
        <td class="td-num val-debit">${formatAmount(totClDr)}</td>
        <td class="td-num val-credit">${formatAmount(totClCr)}</td>
      </tr>
      <tr class="diff-row" style="background: ${isBalanced ? '#f0fdf4' : '#fff1f2'};">
        <td colspan="2" style="text-align:right; font-weight:800; color:#991b1b; text-transform:uppercase; font-size:11px; letter-spacing:0.3px;">Difference:</td>
        <td colspan="2" style="text-align:center; padding:5px 8px;">${badgeCl}</td>
      </tr>
    `;
  }

  updateKPIs(totalAccountsCount, totOpDr, totOpCr, totTxnDr, totTxnCr, totClDr, totClCr);
}

function updateKPIs(accCount, opDr, opCr, txnDr, txnCr, clDr, clCr) {
  const accCountText = `${accCount} Accounts`;
  const badgeEl = document.getElementById('badgeAccCount');
  if (badgeEl) badgeEl.textContent = accCountText;

  const kpiCountEl = document.getElementById('kpiAccCount');
  if (kpiCountEl) kpiCountEl.textContent = accCountText;

  const el = id => document.getElementById(id);
  if (el('kpiOpeningDr')) el('kpiOpeningDr').textContent = '₹' + formatAmount(opDr);
  if (el('kpiOpeningCr')) el('kpiOpeningCr').textContent = '₹' + formatAmount(opCr);
  if (el('kpiTxnDebit'))  el('kpiTxnDebit').textContent  = '₹' + formatAmount(txnDr);
  if (el('kpiTxnCredit')) el('kpiTxnCredit').textContent = '₹' + formatAmount(txnCr);
  if (el('kpiClosingDr')) el('kpiClosingDr').textContent = '₹' + formatAmount(clDr);
  if (el('kpiClosingCr')) el('kpiClosingCr').textContent = '₹' + formatAmount(clCr);

  const diffCl = clDr - clCr;
  const isBalanced = Math.abs(diffCl) < 0.01;
  const auditBadge = el('kpiAuditBadge');
  const auditDesc  = el('kpiAuditDesc');

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
      auditBadge.textContent = `Unbalanced (₹${formatAmount(Math.abs(diffCl))} Diff)`;
    }
    if (auditDesc) {
      auditDesc.textContent = `Audit Alert: Net difference of ₹${formatAmount(Math.abs(diffCl))} detected between Debits and Credits.`;
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

// ── PRINT & EXPORT ENGINE ─────────────────────────────────────
window.printStatement = function () {
  const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.';
  const fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : '2026-27';
  const fromDate = document.getElementById('fromDate')?.value || _fyStartDate || '';
  const toDate   = document.getElementById('toDate')?.value || _fyEndDate || '';

  const pSocEl = document.getElementById('printSocName');
  if (pSocEl) pSocEl.textContent = socName;

  const pFyEl = document.getElementById('printFYLabel');
  if (pFyEl) pFyEl.textContent = fyLabel;

  const pPeriodEl = document.getElementById('printDatePeriod');
  if (pPeriodEl) {
    pPeriodEl.textContent = (fromDate && toDate) ? `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}` : (toDate ? `As on ${formatDisplayDate(toDate)}` : 'All Transactions');
  }

  const pTitleEl = document.getElementById('printReportTitle');
  if (pTitleEl) {
    if (_currentFormat === 'opening') {
      pTitleEl.textContent = 'OPENING TRIAL BALANCE (FINANCIAL AUDIT)';
    } else if (_currentFormat === 'closing') {
      pTitleEl.textContent = `TRIAL BALANCE AS ON ${toDate ? formatDisplayDate(toDate) : '31/03/2027'} (FINANCIAL AUDIT)`;
    } else {
      pTitleEl.textContent = `TRIAL BALANCE STATEMENT (FINANCIAL AUDIT)`;
    }
  }

  if (_currentFormat === 'full') {
    document.body.classList.add('print-landscape');
    document.body.classList.remove('print-portrait');
  } else {
    document.body.classList.add('print-portrait');
    document.body.classList.remove('print-landscape');
  }

  window.print();
};

window.exportExcel = function () {
  exportExcelFormatted(_currentFormat, _currentOptions);
};

// ── EXCEL / CSV EXPORT ─────────────────────────────────────────
function exportExcelFormatted(fmt, options) {
  const schedules = buildTrialBalanceSchedules(fmt, options);
  const fromDate = document.getElementById('fromDate')?.value || _fyStartDate || '';
  const toDate   = document.getElementById('toDate')?.value || _fyEndDate || '';
  const dateSuffix = (fromDate && toDate) ? `_${fromDate}_to_${toDate}` : `_${new Date().toISOString().slice(0, 10)}`;

  let csvRows = [];
  let gtOpDr = 0, gtOpCr = 0, gtTxnDr = 0, gtTxnCr = 0, gtClDr = 0, gtClCr = 0;

  if (fmt === 'opening') {
    csvRows.push(['Code', 'Account Name', 'Debit', 'Credit'].join(','));

    schedules.forEach(sec => {
      csvRows.push(`"","[ ${sec.title.replace(/"/g, '""')} ]","",""`);

      sec.groups.forEach(grp => {
        csvRows.push(`"","${grp.displayTitle.replace(/"/g, '""')}","",""`);

        grp.items.forEach(it => {
          gtOpDr += it.openingDr;
          gtOpCr += it.openingCr;
          csvRows.push([
            `"${(it.code || '').replace(/"/g, '""')}"`,
            `"${(it.name || '').replace(/"/g, '""')}"`,
            it.openingDr > 0 ? it.openingDr.toFixed(2) : '',
            it.openingCr > 0 ? it.openingCr.toFixed(2) : ''
          ].join(','));
        });

        if (options.includeSubtotals) {
          csvRows.push([
            '""',
            `"Sub-Total: ${grp.groupName.replace(/"/g, '""')}"`,
            grp.subtotals.openingDr > 0 ? grp.subtotals.openingDr.toFixed(2) : '0.00',
            grp.subtotals.openingCr > 0 ? grp.subtotals.openingCr.toFixed(2) : '0.00'
          ].join(','));
        }
      });
    });

    csvRows.push([
      '""',
      '"GRAND TOTAL"',
      gtOpDr.toFixed(2),
      gtOpCr.toFixed(2)
    ].join(','));
  } else if (fmt === 'full') {
    csvRows.push([
      'Code', 'Account Name',
      'Opening Debit', 'Opening Credit',
      'Transaction Debit', 'Transaction Credit',
      'Closing Debit', 'Closing Credit'
    ].join(','));

    schedules.forEach(sec => {
      csvRows.push(`"","[ ${sec.title.replace(/"/g, '""')} ]","","","","","",""`);

      sec.groups.forEach(grp => {
        csvRows.push(`"","${grp.displayTitle.replace(/"/g, '""')}","","","","","",""`);

        grp.items.forEach(it => {
          gtOpDr  += it.openingDr;
          gtOpCr  += it.openingCr;
          gtTxnDr += it.txnDr;
          gtTxnCr += it.txnCr;
          gtClDr  += it.closingDr;
          gtClCr  += it.closingCr;

          csvRows.push([
            `"${(it.code || '').replace(/"/g, '""')}"`,
            `"${(it.name || '').replace(/"/g, '""')}"`,
            it.openingDr > 0 ? it.openingDr.toFixed(2) : '',
            it.openingCr > 0 ? it.openingCr.toFixed(2) : '',
            it.txnDr > 0 ? it.txnDr.toFixed(2) : '',
            it.txnCr > 0 ? it.txnCr.toFixed(2) : '',
            it.closingDr > 0 ? it.closingDr.toFixed(2) : '',
            it.closingCr > 0 ? it.closingCr.toFixed(2) : ''
          ].join(','));
        });

        if (options.includeSubtotals) {
          csvRows.push([
            '""',
            `"Sub-Total: ${grp.groupName.replace(/"/g, '""')}"`,
            grp.subtotals.openingDr.toFixed(2),
            grp.subtotals.openingCr.toFixed(2),
            grp.subtotals.txnDr.toFixed(2),
            grp.subtotals.txnCr.toFixed(2),
            grp.subtotals.closingDr.toFixed(2),
            grp.subtotals.closingCr.toFixed(2)
          ].join(','));
        }
      });
    });

    csvRows.push([
      '""',
      '"GRAND TOTAL"',
      gtOpDr.toFixed(2),
      gtOpCr.toFixed(2),
      gtTxnDr.toFixed(2),
      gtTxnCr.toFixed(2),
      gtClDr.toFixed(2),
      gtClCr.toFixed(2)
    ].join(','));
  } else {
    // Closing
    csvRows.push(['Code', 'Account Name', 'Debit', 'Credit'].join(','));

    schedules.forEach(sec => {
      csvRows.push(`"","[ ${sec.title.replace(/"/g, '""')} ]","",""`);

      sec.groups.forEach(grp => {
        csvRows.push(`"","${grp.displayTitle.replace(/"/g, '""')}","",""`);

        grp.items.forEach(it => {
          gtClDr += it.closingDr;
          gtClCr += it.closingCr;
          csvRows.push([
            `"${(it.code || '').replace(/"/g, '""')}"`,
            `"${(it.name || '').replace(/"/g, '""')}"`,
            it.closingDr > 0 ? it.closingDr.toFixed(2) : '',
            it.closingCr > 0 ? it.closingCr.toFixed(2) : ''
          ].join(','));
        });

        if (options.includeSubtotals) {
          csvRows.push([
            '""',
            `"Sub-Total: ${grp.groupName.replace(/"/g, '""')}"`,
            grp.subtotals.closingDr > 0 ? grp.subtotals.closingDr.toFixed(2) : '0.00',
            grp.subtotals.closingCr > 0 ? grp.subtotals.closingCr.toFixed(2) : '0.00'
          ].join(','));
        }
      });
    });

    csvRows.push([
      '""',
      '"GRAND TOTAL"',
      gtClDr.toFixed(2),
      gtClCr.toFixed(2)
    ].join(','));
  }

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Trial_Balance_${fmt.toUpperCase()}${dateSuffix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Trial Balance (${fmt.toUpperCase()}) exported successfully.`, 'success');
}

// ── PRESENTATION OPTIONS MODAL ────────────────────────────────
window.openExportModal = function () {
  const modal = document.getElementById('modal-tb-export');
  if (modal) {
    modal.classList.add('show');
  }
};

window.closeExportModal = function () {
  const modal = document.getElementById('modal-tb-export');
  if (modal) {
    modal.classList.remove('show');
  }
};

window.onModalOverlayClick = function (e) {
  if (e.target && e.target.id === 'modal-tb-export') {
    closeExportModal();
  }
};

window.selectTbFormat = function (fmt) {
  document.querySelectorAll('.tb-format-card').forEach(card => card.classList.remove('active'));
  const targetCard = document.getElementById('card-format-' + fmt);
  if (targetCard) targetCard.classList.add('active');
  const radio = document.getElementById('fmt-' + fmt);
  if (radio) radio.checked = true;
};

window.executeExport = function (action) {
  const fmt = document.querySelector('input[name="tbFormatOption"]:checked')?.value || 'full';
  const includeSubtotals = document.getElementById('tb-opt-subtotals')?.checked ?? true;
  const includeMembers = document.getElementById('tb-opt-members')?.checked ?? true;
  const includeZeros = document.getElementById('tb-opt-zeros')?.checked ?? false;

  closeExportModal();

  _currentFormat = fmt;
  _currentOptions = { includeSubtotals, includeMembers, includeZeros };

  const fmtSelect = document.getElementById('formatSelect');
  if (fmtSelect) fmtSelect.value = fmt;

  filterTable();

  if (action === 'excel') {
    exportExcelFormatted(fmt, _currentOptions);
  } else {
    setTimeout(() => {
      printStatement();
    }, 150);
  }
};
