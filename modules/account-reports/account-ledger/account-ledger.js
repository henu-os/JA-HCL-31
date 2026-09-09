// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Account Ledger Statement Engine
// Multi-Account Continuous Reporting & Filter Engine
// ═══════════════════════════════════════════════════════════

let accountsList = [];
let groupsList = [];
let currentReportData = null;
let currentScope = 'single';
let currentFYStart = '2025-04-01';
let currentFYEnd = '2026-03-31';

function getActiveSocietyId() {
  const urlParams = new URLSearchParams(window.location.search);
  const qId = urlParams.get('societyId') || urlParams.get('socId');
  if (qId) return qId;
  return (window.Auth && Auth.getSocietyId ? Auth.getSocietyId() : null) || sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4';
}

function getActiveFYId() {
  const urlParams = new URLSearchParams(window.location.search);
  const qFy = urlParams.get('fyId');
  if (qFy) return qFy;
  return (window.Auth && Auth.getFYId ? Auth.getFYId() : null) || sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1';
}

function getActiveFYLabel() {
  return (window.Auth && Auth.getFYLabel ? Auth.getFYLabel() : null) || sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26';
}

function getActiveSocietyName() {
  return (window.Auth && Auth.getSocietyName ? Auth.getSocietyName() : null) || sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName') || 'THE AZAD CO-OPERATIVE HOUSING SOCIETY LTD.';
}

document.addEventListener('DOMContentLoaded', async () => {
  initContext();
  initDateBounds();
  await loadInitialData();
  // Auto load ledger on startup
  setTimeout(() => {
    loadLedger();
  }, 100);
});

function initContext() {
  const socName = getActiveSocietyName();
  const fyLabel = getActiveFYLabel();

  const socEl = document.getElementById('socName');
  if (socEl) socEl.textContent = socName;

  const fyEl = document.getElementById('fyLabel');
  if (fyEl) fyEl.textContent = fyLabel;
}

function initDateBounds() {
  const fyLabel = getActiveFYLabel();
  const parts = fyLabel.split('-');
  let startYear = 2025;
  if (parts.length > 0 && !isNaN(parseInt(parts[0]))) {
    const yr = parseInt(parts[0]);
    startYear = yr < 100 ? 2000 + yr : yr;
  }
  const endYear = startYear + 1;

  currentFYStart = `${startYear}-04-01`;
  currentFYEnd = `${endYear}-03-31`;

  const fromInput = document.getElementById('fromDate');
  const toInput = document.getElementById('toDate');

  if (fromInput) fromInput.value = currentFYStart;
  if (toInput) toInput.value = currentFYEnd;
}

async function loadInitialData() {
  const societyId = getActiveSocietyId();

  try {
    // 1. Load Accounts
    let resAcc = null;
    if (window.API) {
      resAcc = await API.get(`/accounts?societyId=${societyId}`);
    } else {
      const resp = await fetch(`http://localhost:5002/api/accounts?societyId=${societyId}`);
      resAcc = await resp.json();
    }

    if (resAcc && resAcc.success) {
      const rawAccounts = resAcc.data || [];
      const isExcludedAccount = (a) => {
        const code = (a.accCode || '').toUpperCase();
        const name = (a.accName || '').toLowerCase();
        const gname = (a.groupName || a.grpName || '').toLowerCase();

        // 1. Exclude Member Dues & Advance (managed in Dues/Advance Ledger)
        if (code === 'ASS-1025' || code === 'LIA-1020' || name.includes('dues from member') || name.includes('advance from member')) return true;

        // 2. Exclude Cash & Bank Balance accounts (managed in Cash/Bank Book)
        if (gname.includes('cash & bank') || gname.includes('cash and bank') || name === 'cash in hand' || code === 'ASS-1001' || code === 'ASS-1002' || code === 'ASS-1003') return true;

        return false;
      };
      accountsList = rawAccounts.filter(a => !isExcludedAccount(a));
      populateAccountSelectors();
    }

    // 2. Load Groups
    let resGrp = null;
    if (window.API) {
      resGrp = await API.get(`/groups?societyId=${societyId}`);
    } else {
      const resp = await fetch(`http://localhost:5002/api/groups?societyId=${societyId}`);
      resGrp = await resp.json();
    }

    if (resGrp && resGrp.success) {
      const rawGroups = resGrp.data || [];
      groupsList = rawGroups.filter(g => {
        const gname = (g.grpName || g.groupName || '').toLowerCase();
        return !gname.includes('dues from member') && !gname.includes('advance from member') && !gname.includes('cash & bank') && !gname.includes('cash and bank');
      });
      populateGroupSelectors();
    }
  } catch (err) {
    console.error('Failed to load initial ledger master data:', err);
  }
}

function populateAccountSelectors() {
  const selSingle = document.getElementById('accountSelect');
  const selFrom = document.getElementById('fromAccSelect');
  const selTo = document.getElementById('toAccSelect');

  if (!selSingle || accountsList.length === 0) return;

  // Group accounts by main category
  const groups = {
    'Income': accountsList.filter(a => a.grpMainId === 3),
    'Expenditure': accountsList.filter(a => a.grpMainId === 4),
    'Assets': accountsList.filter(a => a.grpMainId === 1),
    'Liabilities': accountsList.filter(a => a.grpMainId === 2),
    'Other': accountsList.filter(a => ![1, 2, 3, 4].includes(a.grpMainId))
  };

  let htmlSingle = '<option value="">— Select Ledger Account —</option>';
  for (const [grpName, items] of Object.entries(groups)) {
    if (items.length > 0) {
      htmlSingle += `<optgroup label="── ${grpName} ──">`;
      items.forEach(a => {
        const grpSub = a.groupName || a.grpName || '';
        const grpText = grpSub ? ` [${grpSub}]` : '';
        htmlSingle += `<option value="${a.accountId}">${escHtml(a.accCode)} - ${escHtml(a.accName)}${grpText}</option>`;
      });
      htmlSingle += `</optgroup>`;
    }
  }
  selSingle.innerHTML = htmlSingle;

  // Populate Range selectors
  let htmlRange = accountsList.map(a => `<option value="${escHtml(a.accCode)}">${escHtml(a.accCode)} - ${escHtml(a.accName)}</option>`).join('');
  if (selFrom) selFrom.innerHTML = htmlRange;
  if (selTo) {
    selTo.innerHTML = htmlRange;
    if (accountsList.length > 0) {
      selTo.value = accountsList[accountsList.length - 1].accCode;
    }
  }
}

function populateGroupSelectors() {
  const selGrp = document.getElementById('subGroupSelect');
  if (!selGrp) return;

  if (groupsList.length === 0) {
    // Extract distinct groups from accountsList as fallback
    const distinct = {};
    accountsList.forEach(a => {
      if (a.groupId && a.groupName) distinct[a.groupId] = a.groupName;
    });
    let html = '<option value="">— Select Sub Group —</option>';
    for (const [gid, gname] of Object.entries(distinct)) {
      html += `<option value="${gid}">${escHtml(gname)}</option>`;
    }
    selGrp.innerHTML = html;
    return;
  }

  let html = '<option value="">— Select Sub Group —</option>';
  groupsList.forEach(g => {
    const gid = g.groupId || g.socGroupId || g.id;
    const gname = g.grpName || g.groupName || '';
    if (gid && gname) {
      html += `<option value="${gid}">${escHtml(gname)}</option>`;
    }
  });
  selGrp.innerHTML = html;
}

function setScope(scope) {
  currentScope = scope;

  // Sync dropdown if changed programmatically
  const scopeSelect = document.getElementById('reportScopeSelect');
  if (scopeSelect && scopeSelect.value !== scope) {
    scopeSelect.value = scope;
  }

  // Toggle visible filter blocks
  const blkSingle = document.getElementById('blockSingleAcc');
  const blkMain = document.getElementById('blockMainGroup');
  const blkSub = document.getElementById('blockSubGroup');
  const blkFrom = document.getElementById('blockRangeFrom');
  const blkTo = document.getElementById('blockRangeTo');
  const badge = document.getElementById('scopeBadge');

  if (blkSingle) blkSingle.style.display = scope === 'single' ? '' : 'none';
  if (blkMain) blkMain.style.display = scope === 'main-group' ? '' : 'none';
  if (blkSub) blkSub.style.display = scope === 'sub-group' ? '' : 'none';
  if (blkFrom) blkFrom.style.display = scope === 'range' ? '' : 'none';
  if (blkTo) blkTo.style.display = scope === 'range' ? '' : 'none';

  let scopeLabel = 'Single Account';
  if (scope === 'main-group') scopeLabel = 'Main Group';
  else if (scope === 'sub-group') scopeLabel = 'Sub Group';
  else if (scope === 'range') scopeLabel = 'Account Range';
  else if (scope === 'all') scopeLabel = 'All Accounts';

  if (badge) badge.textContent = scopeLabel;

  loadLedger();
}

function onDateInputChange() {
  const presetSel = document.getElementById('datePresetSelect');
  if (presetSel) presetSel.value = 'custom';
  updateDateInputsReadonlyState(true);
  loadLedger();
}

function updateDateInputsReadonlyState(isCustom) {
  const fromInput = document.getElementById('fromDate');
  const toInput = document.getElementById('toDate');
  if (!fromInput || !toInput) return;

  if (isCustom) {
    fromInput.readOnly = false;
    toInput.readOnly = false;
    fromInput.style.background = '#ffffff';
    toInput.style.background = '#ffffff';
    fromInput.style.cursor = 'text';
    toInput.style.cursor = 'text';
  } else {
    fromInput.readOnly = true;
    toInput.readOnly = true;
    fromInput.style.background = '#f1f5f9';
    toInput.style.background = '#f1f5f9';
    fromInput.style.cursor = 'default';
    toInput.style.cursor = 'default';
  }
}

function applyPreset(presetType) {
  const presetSel = document.getElementById('datePresetSelect');
  if (presetSel && presetSel.value !== presetType) {
    presetSel.value = presetType;
  }

  const fromInput = document.getElementById('fromDate');
  const toInput = document.getElementById('toDate');
  if (!fromInput || !toInput) return;

  const isCustom = presetType === 'custom';
  updateDateInputsReadonlyState(isCustom);

  const parts = currentFYStart.split('-');
  const startYr = parseInt(parts[0]);
  const endYr = startYr + 1;

  const today = new Date();
  const curY = today.getFullYear();
  const curM = String(today.getMonth() + 1).padStart(2, '0');

  switch (presetType) {
    case 'full':
      fromInput.value = currentFYStart;
      toInput.value = currentFYEnd;
      break;
    case 'this-month': {
      const firstDay = `${curY}-${curM}-01`;
      const lastDayDate = new Date(curY, today.getMonth() + 1, 0);
      const lastDay = `${curY}-${curM}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
      fromInput.value = firstDay;
      toInput.value = lastDay;
      break;
    }
    case 'last-month': {
      const prevMDate = new Date(curY, today.getMonth() - 1, 1);
      const prevY = prevMDate.getFullYear();
      const prevM = String(prevMDate.getMonth() + 1).padStart(2, '0');
      const lastDayDate = new Date(prevY, prevMDate.getMonth() + 1, 0);
      fromInput.value = `${prevY}-${prevM}-01`;
      toInput.value = `${prevY}-${prevM}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
      break;
    }
    case 'q1':
      fromInput.value = `${startYr}-04-01`;
      toInput.value = `${startYr}-06-30`;
      break;
    case 'q2':
      fromInput.value = `${startYr}-07-01`;
      toInput.value = `${startYr}-09-30`;
      break;
    case 'q3':
      fromInput.value = `${startYr}-10-01`;
      toInput.value = `${startYr}-12-31`;
      break;
    case 'q4':
      fromInput.value = `${endYr}-01-01`;
      toInput.value = `${endYr}-03-31`;
      break;
    case 'custom':
      // Maintain current custom date values
      break;
  }

  loadLedger();
}

async function loadLedger() {
  const societyId = getActiveSocietyId();
  const fyId = getActiveFYId();

  const scopeSelect = document.getElementById('reportScopeSelect');
  if (scopeSelect && scopeSelect.value) {
    currentScope = scopeSelect.value;
  }

  const fromDate = document.getElementById('fromDate')?.value || '';
  const toDate = document.getElementById('toDate')?.value || '';
  const billingMode = document.getElementById('billingMode')?.value || 'summary';
  const blankAcMode = document.getElementById('blankAcMode')?.value || 'hide';
  const hideBlank = blankAcMode === 'hide';

  let url = `/reports/ledger?societyId=${societyId}&fyId=${fyId}&billingMode=${billingMode}&hideBlank=${hideBlank}`;
  if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
  if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;

  // Attach scope parameters
  if (currentScope === 'single') {
    const accId = document.getElementById('accountSelect')?.value;
    if (!accId) {
      resetLedgerGrid('Please select an Account above to generate statement.');
      return;
    }
    url += `&accountId=${accId}`;
  } else if (currentScope === 'main-group') {
    const mgid = document.getElementById('mainGroupSelect')?.value;
    if (mgid) url += `&mainGroupId=${mgid}`;
  } else if (currentScope === 'sub-group') {
    const gid = document.getElementById('subGroupSelect')?.value;
    if (gid) url += `&groupId=${gid}`;
  } else if (currentScope === 'range') {
    const fromCode = document.getElementById('fromAccSelect')?.value;
    const toCode = document.getElementById('toAccSelect')?.value;
    if (fromCode) url += `&fromAccCode=${encodeURIComponent(fromCode)}`;
    if (toCode) url += `&toAccCode=${encodeURIComponent(toCode)}`;
  }

  if (window.showLoading) showLoading('Generating Account Ledger Statement...');

  try {
    let res = null;
    if (window.API) {
      res = await API.get(url);
    } else {
      const resp = await fetch(`http://localhost:5002/api${url}`);
      res = await resp.json();
    }

    if (res && res.success) {
      currentReportData = res;
      renderContinuousLedger(res, fromDate, toDate);
    } else {
      showError(res?.message || 'Unable to fetch ledger data.');
    }
  } catch (err) {
    console.error('Ledger fetch error:', err);
    if (window.handleError) handleError(err, 'Failed to load ledger.');
  } finally {
    if (window.hideLoading) hideLoading();
  }
}

function toggleSummaryPopover(event) {
  if (event) event.stopPropagation();
  const pop = document.getElementById('summaryPopover');
  const btn = document.getElementById('btnSummaryToggle');
  if (!pop) return;

  const isShown = pop.classList.contains('show');
  if (isShown) {
    pop.classList.remove('show');
    if (btn) btn.classList.remove('active');
  } else {
    pop.classList.add('show');
    if (btn) btn.classList.add('active');
  }
}

// Close summary popover when clicking anywhere else
document.addEventListener('click', (e) => {
  const pop = document.getElementById('summaryPopover');
  const btn = document.getElementById('btnSummaryToggle');
  if (pop && pop.classList.contains('show')) {
    if (!pop.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
      pop.classList.remove('show');
      if (btn) btn.classList.remove('active');
    }
  }
});

function resetLedgerGrid(msg = 'Please select an Account or Group above to generate statement.') {
  currentReportData = null;
  const badgeEl = document.getElementById('badgeAccCount');
  if (badgeEl) badgeEl.textContent = '0 A/c';

  const kpiCountEl = document.getElementById('kpiAccCount');
  if (kpiCountEl) kpiCountEl.textContent = '0 Accounts';

  const opBalEl = document.getElementById('kpiOpBal');
  if (opBalEl) opBalEl.textContent = '₹ 0.00';

  const totalDrEl = document.getElementById('kpiTotalDr');
  if (totalDrEl) totalDrEl.textContent = '₹ 0.00';

  const totalCrEl = document.getElementById('kpiTotalCr');
  if (totalCrEl) totalCrEl.textContent = '₹ 0.00';

  const closingBalEl = document.getElementById('kpiClosingBal');
  if (closingBalEl) closingBalEl.textContent = '₹ 0.00';

  const tbody = document.getElementById('ledgerTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:50px; color:#64748b;">
          <i class="bi bi-journal-text" style="font-size:26px; color:var(--primary); display:block; margin-bottom:8px;"></i>
          ${msg}
        </td>
      </tr>
    `;
  }
}

function renderContinuousLedger(data, fromDate, toDate) {
  const tbody = document.getElementById('ledgerTableBody');
  if (!tbody) return;

  const rawAccounts = data.accounts || [];
  const accounts = rawAccounts.filter(a => {
    const code = (a.accCode || '').toUpperCase();
    const name = (a.accName || '').toLowerCase();
    const gname = (a.grpName || a.groupName || '').toLowerCase();
    if (code === 'ASS-1025' || code === 'LIA-1020' || name.includes('dues from member') || name.includes('advance from member')) return false;
    if (gname.includes('cash & bank') || gname.includes('cash and bank') || name === 'cash in hand' || code === 'ASS-1001' || code === 'ASS-1002' || code === 'ASS-1003') return false;
    return true;
  });
  const totalDr = accounts.reduce((s, a) => s + (a.totalDebit || 0), 0);
  const totalCr = accounts.reduce((s, a) => s + (a.totalCredit || 0), 0);

  if (accounts.length === 0) {
    resetLedgerGrid('No accounts or transactions found matching the selected criteria.');
    return;
  }

  // Compute Overall KPI summaries
  let sumOpBal = 0;
  let sumCloseBal = 0;
  accounts.forEach(a => {
    sumOpBal += (a.opDrCr === 'Dr' ? (a.opBal || 0) : -(a.opBal || 0));
    sumCloseBal += (a.closingDrCr === 'Dr' ? (a.closingBalance || 0) : -(a.closingBalance || 0));
  });

  const opSumDrCr = sumOpBal >= 0 ? 'Dr' : 'Cr';
  const closeSumDrCr = sumCloseBal >= 0 ? 'Dr' : 'Cr';

  const badgeEl = document.getElementById('badgeAccCount');
  if (badgeEl) badgeEl.textContent = `${accounts.length} A/c`;

  const countEl = document.getElementById('kpiAccCount');
  if (countEl) countEl.textContent = `${accounts.length} Accounts`;

  const opBalEl = document.getElementById('kpiOpBal');
  if (opBalEl) opBalEl.innerHTML = `${formatCur(Math.abs(sumOpBal))} <span class="badge-vtype" style="background:#e0f2fe;color:#0369a1;">${opSumDrCr}</span>`;

  const drEl = document.getElementById('kpiTotalDr');
  if (drEl) drEl.textContent = formatCur(totalDr);

  const crEl = document.getElementById('kpiTotalCr');
  if (crEl) crEl.textContent = formatCur(totalCr);

  const closeEl = document.getElementById('kpiClosingBal');
  if (closeEl) closeEl.innerHTML = `${formatCur(Math.abs(sumCloseBal))} <span class="badge-vtype" style="background:#dbeafe;color:#1e40af;">${closeSumDrCr}</span>`;

  const opDateStr = fromDate ? formatDateDMY(fromDate) : formatDateDMY(currentFYStart);

  let html = '';

  accounts.forEach((acc, accIdx) => {
    const grpMainStr = getMainGroupName(acc.grpMainId);
    const grpSubStr = acc.grpName || 'General';
    const txs = acc.transactions || [];
    const opAmt = acc.opBal || 0;
    const opType = acc.opDrCr || 'Dr';
    const closeAmt = acc.closingBalance || 0;
    const closeType = acc.closingDrCr || 'Dr';

    // 1. Account Section Banner (Clean Navy/Slate Bar)
    html += `
      <tr class="row-acc-banner">
        <td colspan="9">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="background:rgba(255,255,255,0.2); padding:2px 8px; border-radius:3px; font-weight:800; margin-right:6px;">[ ${escHtml(acc.accCode)} ]</span>
              <span style="font-size:12px; font-weight:800;">${escHtml(acc.accName)}</span>
            </div>
            <div style="font-size:10.5px; opacity:0.9;">
              <strong>{ ${grpMainStr} }</strong> — <strong>{ ${escHtml(grpSubStr)} }</strong>
            </div>
          </div>
        </td>
      </tr>
    `;

    // 2. Opening Balance Row
    html += `
      <tr class="row-opening">
        <td style="text-align:center; color:#166534;">0</td>
        <td><strong>${opDateStr}</strong></td>
        <td><span class="badge-vtype" style="background:#bbf7d0;color:#14532d;">OPENING</span></td>
        <td><strong>OPENING BALANCE B/F</strong></td>
        <td colspan="2" style="font-size:10px; color:#166534;">Initial balance brought forward</td>
        <td class="td-num val-debit">${opType === 'Dr' && opAmt > 0 ? formatAmount(opAmt) : '—'}</td>
        <td class="td-num val-credit">${opType === 'Cr' && opAmt > 0 ? formatAmount(opAmt) : '—'}</td>
        <td class="td-num" style="font-weight:800; color:#166534;">${formatAmount(opAmt)} ${opType}</td>
      </tr>
    `;

    // 3. Transactions Rows
    if (txs.length === 0) {
      html += `
        <tr>
          <td colspan="9" style="text-align:center; padding:12px; color:#64748b; font-style:italic;">
            No transactions recorded for this account in the selected period.
          </td>
        </tr>
      `;
    } else {
      txs.forEach((t, idx) => {
        const vtypeClass = getVoucherTypeClass(t.voucherType);
        const chqStr = formatChequeDetails(t.chqNo, t.chqDate, t.bankName);

        html += `
          <tr>
            <td style="text-align:center; color:#64748b;">${idx + 1}</td>
            <td>${formatDateDMY(t.voucherDate)}</td>
            <td>
              <span class="badge-vtype ${vtypeClass}">${escHtml(t.voucherType || 'VOUCHER')}</span>
              <span style="font-weight:700; color:#0f172a; margin-left:3px;">${escHtml(t.voucherNo || '')}</span>
            </td>
            <td>
              <span class="contra-tag" title="${escHtml(t.contraAccount || '—')}">
                ${escHtml(t.contraAccount || '—')}
              </span>
            </td>
            <td>
              <div style="font-weight:600; color:#1e293b;">${escHtml(t.personName || t.narration || '—')}</div>
              ${t.personName && t.narration && t.narration !== t.personName ? `<div style="font-size:10px; color:#64748b; margin-top:1px;">${escHtml(t.narration)}</div>` : ''}
            </td>
            <td style="font-size:10px; color:#475569;">${chqStr}</td>
            <td class="td-num val-debit">${t.debit > 0 ? formatAmount(t.debit) : '—'}</td>
            <td class="td-num val-credit">${t.credit > 0 ? formatAmount(t.credit) : '—'}</td>
            <td class="td-num" style="font-weight:700; color:#0f172a;">${formatAmount(t.runningBal)} <span style="font-size:9.5px; font-weight:800; color:#0369a1;">${t.balanceDrCr}</span></td>
          </tr>
        `;
      });
    }

    // 4. Closing Balance Row
    html += `
      <tr class="row-closing">
        <td colspan="6" style="text-align:right; font-weight:800; text-transform:uppercase;">
          Closing Balance C/F : [ ${escHtml(acc.accCode)} ] ${escHtml(acc.accName)}
        </td>
        <td class="td-num val-debit" style="font-weight:800;">${formatAmount(acc.totalDebit || 0)}</td>
        <td class="td-num val-credit" style="font-weight:800;">${formatAmount(acc.totalCredit || 0)}</td>
        <td class="td-num" style="font-weight:800; color:var(--primary);">${formatAmount(closeAmt)} ${closeType}</td>
      </tr>
      <tr class="row-divider"><td colspan="9"></td></tr>
    `;
  });

  // 5. Final Grand Total Row (across all accounts rendered)
  if (accounts.length > 1) {
    html += `
      <tr class="row-grand-total">
        <td colspan="6" style="text-align:right; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">
          GRAND TOTAL (All ${accounts.length} Accounts) :
        </td>
        <td class="td-num" style="color:#86efac !important; font-weight:800;">${formatAmount(totalDr)}</td>
        <td class="td-num" style="color:#fca5a5 !important; font-weight:800;">${formatAmount(totalCr)}</td>
        <td class="td-num" style="font-weight:800; color:#ffffff !important;">${formatAmount(Math.abs(sumCloseBal))} ${closeSumDrCr}</td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

function getMainGroupName(mainId) {
  switch (mainId) {
    case 1: return 'Assets';
    case 2: return 'Liabilities';
    case 3: return 'Income';
    case 4: return 'Expenditure';
    default: return 'General';
  }
}

function getVoucherTypeClass(vtype) {
  const v = (vtype || '').toLowerCase();
  if (v.includes('receipt') || v === 'rcpt' || v === 'mrv') return 'rcpt';
  if (v.includes('payment') || v === 'pmt') return 'pmt';
  if (v.includes('journal') || v === 'jv') return 'jv';
  if (v.includes('contra')) return 'contra';
  if (v.includes('bill') || v === 'mbil') return 'mbil';
  return '';
}

function formatChequeDetails(chqNo, chqDate, bankName) {
  const parts = [];
  if (chqNo) parts.push(`Chq: ${escHtml(chqNo)}`);
  if (chqDate) parts.push(`Dt: ${formatDateDMY(chqDate)}`);
  if (bankName) parts.push(escHtml(bankName));
  return parts.length > 0 ? parts.join(' | ') : '—';
}

function formatDateDMY(dStr) {
  if (!dStr) return '—';
  try {
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const yr = d.getFullYear();
    return `${day}/${mon}/${yr}`;
  } catch (e) {
    return dStr;
  }
}

function formatCur(val) {
  const n = parseFloat(val) || 0;
  return '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAmount(val) {
  const n = parseFloat(val) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Export to Excel (CSV) ────────────────────────────────────
function exportToExcel() {
  if (!currentReportData || !currentReportData.accounts || currentReportData.accounts.length === 0) {
    alert('Please load the ledger statement first before exporting.');
    return;
  }

  const socName = (window.Auth ? Auth.getSocietyName() : null) || sessionStorage.getItem('activeSocietyName') || 'Society';
  const fyLabel = (window.Auth ? Auth.getFYLabel() : null) || sessionStorage.getItem('activeFYLabel') || '2025-26';
  const fromDate = document.getElementById('fromDate')?.value || currentFYStart;
  const toDate = document.getElementById('toDate')?.value || currentFYEnd;

  const rows = [];
  rows.push([`"${socName}"`]);
  rows.push([`"Account Ledger Statement — FY ${fyLabel} (${formatDateDMY(fromDate)} to ${formatDateDMY(toDate)})"`]);
  rows.push([]);

  currentReportData.accounts.forEach(acc => {
    rows.push([`"ACCOUNT: [${acc.accCode}] ${acc.accName}"`, `"{ ${getMainGroupName(acc.grpMainId)} } - { ${acc.grpName || ''} }"`]);
    rows.push(['"Sr No"', '"Date"', '"Voucher No"', '"Voucher Type"', '"Contra Account"', '"Particulars / Narration"', '"Cheque / Ref"', '"Debit (Rs)"', '"Credit (Rs)"', '"Running Balance (Rs)"', '"Dr/Cr"']);

    // Opening Row
    const opAmt = acc.opBal || 0;
    const opType = acc.opDrCr || 'Dr';
    rows.push([
      '0',
      `"${formatDateDMY(fromDate)}"`,
      '""',
      '"OPENING"',
      '"OPENING BALANCE B/F"',
      '"Initial Balance Brought Forward"',
      '""',
      opType === 'Dr' ? opAmt.toFixed(2) : '0.00',
      opType === 'Cr' ? opAmt.toFixed(2) : '0.00',
      opAmt.toFixed(2),
      `"${opType}"`
    ]);

    // Transaction rows
    (acc.transactions || []).forEach((t, idx) => {
      rows.push([
        idx + 1,
        `"${formatDateDMY(t.voucherDate)}"`,
        `"${t.voucherNo || ''}"`,
        `"${t.voucherType || ''}"`,
        `"${(t.contraAccount || '').replace(/"/g, '""')}"`,
        `"${(t.narration || '').replace(/"/g, '""')}"`,
        `"${(t.chqNo ? 'Chq: ' + t.chqNo : '').replace(/"/g, '""')}"`,
        (t.debit || 0).toFixed(2),
        (t.credit || 0).toFixed(2),
        (t.runningBal || 0).toFixed(2),
        `"${t.balanceDrCr || ''}"`
      ]);
    });

    // Closing Row
    rows.push([
      '""',
      '""',
      '""',
      '""',
      `"CLOSING BALANCE: [${acc.accCode}]"`,
      '""',
      '""',
      (acc.totalDebit || 0).toFixed(2),
      (acc.totalCredit || 0).toFixed(2),
      (acc.closingBalance || 0).toFixed(2),
      `"${acc.closingDrCr || 'Dr'}"`
    ]);
    rows.push([]);
  });

  const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Account_Ledger_${fyLabel}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Trigger Print (Matching Image 3) ──────────────────────────
function triggerPrint() {
  if (!currentReportData || !currentReportData.accounts || currentReportData.accounts.length === 0) {
    alert('Please load the ledger statement first before printing.');
    return;
  }

  const socName = (window.Auth ? Auth.getSocietyName() : null) || sessionStorage.getItem('activeSocietyName') || 'Society';
  const fyLabel = (window.Auth ? Auth.getFYLabel() : null) || sessionStorage.getItem('activeFYLabel') || '2025-26';
  const fromDate = document.getElementById('fromDate')?.value || currentFYStart;
  const toDate = document.getElementById('toDate')?.value || currentFYEnd;

  const prtSoc = document.getElementById('prtSocName');
  if (prtSoc) prtSoc.textContent = socName;

  const prtTitle = document.getElementById('prtReportTitle');
  if (prtTitle) prtTitle.textContent = `Account Ledger from ${formatDateDMY(fromDate)} to ${formatDateDMY(toDate)}`;

  const prtFY = document.getElementById('prtFYLabel');
  if (prtFY) prtFY.textContent = `${formatDateDMY(currentFYStart)}-${formatDateDMY(currentFYEnd)}`;

  let scopeText = 'Single Account';
  if (currentScope === 'main-group') scopeText = 'Main Group: ' + (document.getElementById('mainGroupSelect')?.selectedOptions[0]?.text || '');
  else if (currentScope === 'sub-group') scopeText = 'Sub Group: ' + (document.getElementById('subGroupSelect')?.selectedOptions[0]?.text || '');
  else if (currentScope === 'range') scopeText = `Range: ${document.getElementById('fromAccSelect')?.value} to ${document.getElementById('toAccSelect')?.value}`;
  else if (currentScope === 'all') scopeText = 'All Accounts';

  const prtScope = document.getElementById('prtScope');
  if (prtScope) prtScope.textContent = scopeText;

  const prtDate = document.getElementById('prtPrintDate');
  if (prtDate) prtDate.textContent = formatDateDMY(new Date());

  window.print();
}
