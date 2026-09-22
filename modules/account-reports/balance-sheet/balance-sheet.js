/**
 * balance-sheet.js — Jeevika ERP v2
 * Statutory Indian Co-operative Housing Society "Form N" T-Format Balance Sheet Engine
 * Real-Time PostgreSQL API Integration, Dual-Column Grid, Excel Export, Print Engine
 */

(function () {
  'use strict';

  let currentBSReport = null;

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatINR(val, zeroAsBlank = false) {
    const num = parseFloat(val);
    if (isNaN(num) || Math.abs(num) < 0.005) {
      return zeroAsBlank ? '' : '0.00';
    }
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // ── 1. INITIALIZATION ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
    initDateBounds();
    await loadBalanceSheetData();
  });

  function initDateBounds() {
    const dateInp = document.getElementById('bs-as-on-date');
    if (!dateInp) return;

    let fyEnd = '';
    if (typeof getFYDateRange === 'function') {
      const range = getFYDateRange();
      if (range && range.fyEnd) {
        fyEnd = range.fyEnd;
        dateInp.min = range.fyStart;
        dateInp.max = range.fyEnd;
      }
    }

    if (!fyEnd) {
      fyEnd = sessionStorage.getItem('activeFYEnd') || localStorage.getItem('activeFYEnd') || '';
    }

    if (!fyEnd) {
      const fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2026-27');
      const parts = fyLabel.split('-');
      let sYear = parseInt(parts[0], 10) || 2026;
      if (sYear < 2000) sYear += 2000;
      fyEnd = `${sYear + 1}-03-31`;
    }

    dateInp.value = fyEnd;
  }

  // ── 2. DATA FETCHING ────────────────────────────────────────────────────
  window.loadBalanceSheetData = async function () {
    const societyId = (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || '1');
    const fyId = (window.Auth && Auth.getFYId) ? Auth.getFYId() : (sessionStorage.getItem('activeFYId') || '1');
    const asOnInp = document.getElementById('bs-as-on-date');
    const asOnDate = asOnInp ? asOnInp.value : '';
    const comparePrev = 'true';
    const memberBreakup = document.getElementById('chk-member-breakup')?.checked ? 'true' : 'false';

    const tbody = document.getElementById('bsTBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin"></i> Generating Statutory Balance Sheet...
          </td>
        </tr>`;
    }

    try {
      const url = `/api/reports/balance-sheet?societyId=${societyId}&fyId=${fyId}&asOnDate=${encodeURIComponent(asOnDate)}&comparePrevFY=${comparePrev}&includeMemberBreakup=${memberBreakup}`;
      const res = await API.get(url);

      if (res && res.success) {
        currentBSReport = res;
        renderHeaderInfo(res);
        renderBalanceSheetView();
      } else {
        showError((res && res.message) ? res.message : 'Failed to generate Balance Sheet.');
      }
    } catch (err) {
      console.error('Balance Sheet API error:', err);
      showError(err.message || 'Error connecting to accounting report server.');
    }
  };

  function showError(msg) {
    const tbody = document.getElementById('bsTBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-danger" style="padding:30px; font-weight:700;">
            <i class="bi bi-exclamation-octagon-fill"></i> ${escHtml(msg)}
          </td>
        </tr>`;
    }
  }

  // ── 3. HEADER RENDERING ─────────────────────────────────────────────────
  function renderHeaderInfo(data) {
    const soc = data.society || {};
    const nameEl = document.getElementById('disp-soc-name');
    const subEl = document.getElementById('disp-soc-sub');
    const asOnEl = document.getElementById('disp-as-on-date');

    const activeSocName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : soc.societyName;
    if (nameEl) nameEl.textContent = activeSocName || 'CO-OPERATIVE HOUSING SOCIETY LTD.';

    let subParts = [];
    if (soc.registrationNo) subParts.push(`Registration No: ${soc.registrationNo}`);
    if (soc.city || soc.address) subParts.push(`Address: ${[soc.address, soc.city].filter(Boolean).join(', ')}`);
    if (subEl) subEl.textContent = subParts.join(' | ') || 'Statutory Financial Statement';

    if (asOnEl) asOnEl.textContent = data.asOnDateDisplay || data.asOnDate;

    function toDDMMYYYY(val) {
      if (!val) return '';
      const str = String(val).split('T')[0].trim();
      if (str.includes('-')) {
        const parts = str.split('-');
        if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return str.replace(/-/g, '/');
    }

    const curAsOnStr = toDDMMYYYY(data.asOnDate || data.asOnDateDisplay);
    const curText = curAsOnStr ? `${curAsOnStr}<br>Amount(Rs.)` : 'Current Year<br>Amount(Rs.)';

    const prevAsOnStr = toDDMMYYYY(data.prevFY && (data.prevFY.asOnDate || data.prevFY.asOnDateDisplay || data.prevFY.fyEnd));
    let prevText = prevAsOnStr ? `${prevAsOnStr}<br>Amount(Rs.)` : '';
    if (!prevText && data.prevFY && data.prevFY.fyLabel) {
      prevText = `${data.prevFY.fyLabel}<br>Amount(Rs.)`;
    }
    if (!prevText) prevText = 'Prev Year<br>Amount(Rs.)';

    // Screen headers
    const thPrevL = document.getElementById('th-prev-liab');
    const thPrevA = document.getElementById('th-prev-asset');
    const thCurL = document.getElementById('th-cur-liab');
    const thCurA = document.getElementById('th-cur-asset');

    if (thPrevL) thPrevL.innerHTML = prevText;
    if (thPrevA) thPrevA.innerHTML = prevText;
    if (thCurL) thCurL.innerHTML = curText;
    if (thCurA) thCurA.innerHTML = curText;

    // Print Masthead Elements (repeated in thead for PDF/Print)
    const printNameEl = document.getElementById('print-disp-soc-name');
    if (printNameEl) printNameEl.textContent = activeSocName || 'CO-OPERATIVE HOUSING SOCIETY LTD.';

    const printSubEl = document.getElementById('print-disp-soc-sub');
    if (printSubEl) {
      printSubEl.textContent = soc.registrationNo ? `Registration No. : ${soc.registrationNo}` : '';
    }

    const printTitleEl = document.getElementById('print-disp-title');
    if (printTitleEl) {
      printTitleEl.textContent = `Balance Sheet As On ${curAsOnStr || data.asOnDate || '—'}`;
    }

    // Print Signatory Society Name
    const signSocEl = document.getElementById('bsSignSocName');
    if (signSocEl) {
      signSocEl.textContent = `For ${activeSocName || 'Co-Operative Housing Society Ltd.'}`;
    }
  }

  // ── 4. T-FORMAT SIDE-BY-SIDE RENDERER ────────────────────────────────────
  window.renderBalanceSheetView = function () {
    if (!currentBSReport) return;

    const viewMode = document.getElementById('bs-view-mode')?.value || 'detailed';
    const comparePrev = true;
    const showVoucherNo = document.getElementById('chk-voucher-no') ? document.getElementById('chk-voucher-no').checked : true;
    const showMemberBreakup = document.getElementById('chk-member-breakup')?.checked;
    const hideZero = true;

    // Sync visibility of previous year columns (statutory requirement: always visible)
    document.querySelectorAll('.col-prev').forEach(el => {
      el.style.display = '';
    });

    // 1. Build Left Side (Liabilities) Rows
    const leftRows = buildSideRows(currentBSReport.liabilities || [], 'liab', viewMode, hideZero, showMemberBreakup, currentBSReport.memberAdvances || []);

    // 2. Build Right Side (Assets) Rows
    const rightRows = buildSideRows(currentBSReport.assets || [], 'asset', viewMode, hideZero, showMemberBreakup, currentBSReport.memberDues || []);

    // 3. Align heights so both sides are completely equal
    const maxRows = Math.max(leftRows.length, rightRows.length);
    const tbody = document.getElementById('bsTBody');
    if (!tbody) return;

    let html = '';
    for (let i = 0; i < maxRows; i++) {
      const l = leftRows[i] || null;
      const r = rightRows[i] || null;

      html += '<tr>';
      html += renderHalfRowCells(l, 'left', comparePrev, showVoucherNo);
      html += renderHalfRowCells(r, 'right', comparePrev, showVoucherNo);
      html += '</tr>';
    }

    if (maxRows === 0) {
      html = '<tr><td colspan="8" class="text-center text-muted" style="padding:30px;">No accounts found matching active filters.</td></tr>';
    }

    tbody.innerHTML = html;

    // 4. Update Grand Totals in Footer
    const totals = currentBSReport.totals || {};
    const footCurL = document.getElementById('foot-tot-cur-liab');
    const footCurA = document.getElementById('foot-tot-cur-asset');
    const footPrevL = document.getElementById('foot-tot-prev-liab');
    const footPrevA = document.getElementById('foot-tot-prev-asset');

    if (footCurL) footCurL.textContent = formatINR(totals.currentLiabilities);
    if (footCurA) footCurA.textContent = formatINR(totals.currentAssets);
    if (footPrevL) footPrevL.textContent = formatINR(totals.prevLiabilities);
    if (footPrevA) footPrevA.textContent = formatINR(totals.prevAssets);

    // 5. Difference Banner Check (Screen only; hidden in print)
    const diffBanner = document.getElementById('bsDiffBanner');
    const balBanner = document.getElementById('bsBalancedBanner');
    const diffAmtEl = document.getElementById('bsDiffAmount');

    const diff = parseFloat(totals.difference) || 0;
    if (diff > 0.05) {
      if (diffBanner) diffBanner.style.display = 'flex';
      if (balBanner) balBanner.style.display = 'none';
      if (diffAmtEl) diffAmtEl.textContent = `₹ ${formatINR(diff)}`;
    } else {
      if (diffBanner) diffBanner.style.display = 'none';
      if (balBanner) balBanner.style.display = 'block';
    }
  };

  /**
   * Builds an array of row objects for either Liabilities or Assets adhering to Pranav BS layout.
   * Eliminates redundant "TOTAL <GROUP>" rows and correctly formats single vs multi-item groups.
   */
  function buildSideRows(groups, sideType, viewMode, hideZero, showMemberBreakup, memberItems = []) {
    const rows = [];

    // Separate Income & Expenditure to ensure it sits at the bottom of the section (Liabilities for Surplus, Assets for Deficit)
    let sortedGroups = [...groups];
    const ieIndex = sortedGroups.findIndex(g => (g.groupName || '').toLowerCase().includes('income & expenditure'));
    if (ieIndex >= 0) {
      const [ieGroup] = sortedGroups.splice(ieIndex, 1);
      sortedGroups.push(ieGroup);
    }

    sortedGroups.forEach(g => {
      const accounts = g.accounts || [];
      const gNameLower = (g.groupName || '').toLowerCase();
      const isMemberBreakupGroup = (sideType === 'liab')
        ? ((gNameLower.includes('advance') && gNameLower.includes('member')) || (g.groupCode || '').toUpperCase() === 'LI-14')
        : ((gNameLower.includes('dues') && gNameLower.includes('member')) || (g.groupCode || '').toUpperCase() === 'AS-05');

      // Filter zero balance accounts if requested
      const filteredAccounts = hideZero
        ? accounts.filter(a => Math.abs(a.currentAmount) > 0.005 || Math.abs(a.prevAmount) > 0.005)
        : accounts;

      const hasMemberItems = isMemberBreakupGroup && memberItems.some(m => {
        const amt = parseFloat(m.dueAmount != null ? m.dueAmount : m.advanceAmount) || 0;
        const pAmt = parseFloat(m.prevAmount) || 0;
        return Math.abs(amt) > 0.005 || Math.abs(pAmt) > 0.005;
      });

      if (hideZero && filteredAccounts.length === 0 && !hasMemberItems && Math.abs(g.totalCurrent) < 0.005 && Math.abs(g.totalPrev) < 0.005) {
        return; // Skip empty group in hideZero mode
      }

      // Preserve full group title with numbering intact (e.g. "1.Issued, Sub. & Paid Up Captial", "2.Reserve Fund")
      const groupTitle = (g.groupName || '').trim();

      if (viewMode === 'summary' && !g.grpSubtotal) {
        // In summary mode: single summary line
        const curAmt = (isMemberBreakupGroup && memberItems.length > 0)
          ? memberItems.reduce((sum, m) => sum + (parseFloat(m.dueAmount != null ? m.dueAmount : m.advanceAmount) || 0), 0)
          : g.totalCurrent;
        const prevAmt = (isMemberBreakupGroup && memberItems.length > 0)
          ? (memberItems.reduce((sum, m) => sum + (parseFloat(m.prevAmount) || 0), 0) || g.totalPrev)
          : g.totalPrev;
        rows.push({
          type: 'group-summary',
          groupName: groupTitle,
          prevAmount: prevAmt,
          currentAmount: curAmt
        });
        return;
      }

      // 1. Group Header Row
      rows.push({
        type: 'group-header',
        groupName: groupTitle,
        groupCode: g.groupCode || ''
      });

      // 2. Member Dues / Advances: Render accounts first (if any), then bill types / detailed members
      if (isMemberBreakupGroup && (memberItems.length > 0 || filteredAccounts.length > 0)) {
        // A. Render any constituent Ledger Accounts in this group that have opening/previous/current balance
        filteredAccounts.forEach(acc => {
          rows.push({
            type: 'account-multi',
            accCode: acc.accCode || '',
            accName: acc.accName || '',
            prevAmount: acc.prevAmount || 0,
            currentAmount: acc.currentAmount || 0,
            outerAmount: null,
            isLast: false,
            isSurplus: false
          });
        });

        // If no member items exist, mark the last account as last
        if (memberItems.length === 0) {
          if (filteredAccounts.length > 0) {
            rows[rows.length - 1].isLast = true;
            rows[rows.length - 1].outerAmount = g.totalCurrent;
          }
          return;
        }

        const groupsByBT = {};
        memberItems.forEach(m => {
          const bt = (m.billType || 'MAINTENANCE').trim().toUpperCase();
          if (!groupsByBT[bt]) groupsByBT[bt] = [];
          groupsByBT[bt].push(m);
        });

        const btKeys = Object.keys(groupsByBT).sort((a, b) => {
          const aMaint = a.includes('MAINT');
          const bMaint = b.includes('MAINT');
          if (aMaint && !bMaint) return -1;
          if (!aMaint && bMaint) return 1;
          return a.localeCompare(b);
        });

        const totalItemsCount = memberItems.length;
        const memberItemsTotal = memberItems.reduce((sum, m) => sum + (parseFloat(m.dueAmount != null ? m.dueAmount : m.advanceAmount) || 0), 0);
        const memberItemsPrevTotal = memberItems.reduce((sum, m) => sum + (parseFloat(m.prevAmount) || 0), 0);

        function formatBillTypeName(bt) {
          if (!bt) return '';
          return bt.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }

        if (showMemberBreakup) {
          // Member Dues Breakup TICK IS ON:
          // Show bill type section header and each individual member under it with previous year balance & current due
          let processedCount = 0;
          btKeys.forEach((bt) => {
            const items = groupsByBT[bt];
            if (!items || items.length === 0) return;

            rows.push({
              type: 'member-dues-section',
              billType: bt,
              prevAmount: ''
            });

            items.forEach((m) => {
              processedCount++;
              const isLastOfAll = (processedCount === totalItemsCount);
              const itemAmt = parseFloat(m.dueAmount != null ? m.dueAmount : m.advanceAmount) || 0;
              const itemPrevAmt = parseFloat(m.prevAmount) || 0;

              rows.push({
                type: 'member-dues-item',
                billType: bt,
                flatDisplay: m.flatDisplay || `${m.wing}-${m.flatNo}`,
                memName: m.memName,
                prevAmount: itemPrevAmt,
                dueAmount: itemAmt,
                outerAmount: isLastOfAll ? memberItemsTotal : null,
                isLast: isLastOfAll
              });
            });
          });
          return;
        } else {
          // Member Dues Breakup TICK IS OFF:
          // Below the account, show the total of each bill type
          btKeys.forEach((bt, idx) => {
            const items = groupsByBT[bt] || [];
            const btTotal = items.reduce((sum, m) => sum + (parseFloat(m.dueAmount != null ? m.dueAmount : m.advanceAmount) || 0), 0);
            const btPrevTotal = items.reduce((sum, m) => sum + (parseFloat(m.prevAmount) || 0), 0);
            const isLast = (idx === btKeys.length - 1);

            rows.push({
              type: 'account-multi',
              accCode: '',
              accName: formatBillTypeName(bt),
              prevAmount: btPrevTotal || 0,
              currentAmount: btTotal,
              outerAmount: isLast ? memberItemsTotal : null,
              isLast: isLast
            });
          });
          return;
        }
      }

      // 3. Regular Accounts in Group
      const accCount = filteredAccounts.length;
      if (accCount === 1) {
        // Single-account group: direct outer column placement (Col D / Col H)
        const acc = filteredAccounts[0];
        rows.push({
          type: 'account-direct',
          accCode: acc.accCode || '',
          accName: acc.accName || '',
          prevAmount: acc.prevAmount || g.totalPrev || 0,
          currentAmount: acc.currentAmount || g.totalCurrent || 0,
          isSurplus: !!acc.isSurplusEntry
        });
      } else if (accCount > 1) {
        // Multi-account group: Inner amounts (Col C / Col G), subtotal on the last row in outer column (Col D / Col H)
        const hasAnyAccPrev = filteredAccounts.some(a => Math.abs(a.prevAmount) > 0.005);
        filteredAccounts.forEach((acc, idx) => {
          const isLast = (idx === accCount - 1);
          rows.push({
            type: 'account-multi',
            accCode: acc.accCode || '',
            accName: acc.accName || '',
            prevAmount: hasAnyAccPrev ? (acc.prevAmount || 0) : (idx === 0 ? g.totalPrev : 0),
            currentAmount: acc.currentAmount || 0,
            outerAmount: isLast ? g.totalCurrent : null,
            isLast: isLast,
            isSurplus: !!acc.isSurplusEntry
          });
        });
      } else {
        // 0 accounts but group has total balances
        rows.push({
          type: 'account-direct',
          accCode: '',
          accName: groupTitle,
          prevAmount: g.totalPrev || 0,
          currentAmount: g.totalCurrent || 0
        });
      }
    });

    return rows;
  }

  /**
   * Renders the 4 HTML table cells for either the Left (Liabilities) or Right (Assets) side.
   * Matches statutory Form N table structure with clean ruled accounting lines.
   */
  function renderHalfRowCells(rowObj, side, comparePrev, showVoucherNo = true) {
    const isLeft = (side === 'left');
    const dividerClass = isLeft ? 'bs-side-divider' : '';
    const prevStyle = comparePrev ? '' : 'display:none;';

    if (!rowObj) {
      return `
        <td class="bs-table-cell col-prev bs-num" style="${prevStyle}">&nbsp;</td>
        <td class="bs-table-cell bs-acc-row">&nbsp;</td>
        <td class="bs-table-cell bs-num bs-inner-amt">&nbsp;</td>
        <td class="bs-table-cell bs-num ${dividerClass}">&nbsp;</td>
      `;
    }

    if (rowObj.type === 'group-header') {
      return `
        <td class="bs-table-cell col-prev bs-num" style="${prevStyle}">&nbsp;</td>
        <td class="bs-table-cell bs-group-header-cell" colspan="2" style="font-weight:800; background:#f8fafc;">
          <span class="bs-group-title">${escHtml(rowObj.groupName)}</span>
        </td>
        <td class="bs-table-cell bs-num ${dividerClass}" style="background:#f8fafc;">&nbsp;</td>
      `;
    }

    if (rowObj.type === 'account-direct') {
      const codeHtml = (showVoucherNo && rowObj.accCode) ? `<span class="bs-acc-code">[${escHtml(rowObj.accCode)}]</span>` : '';
      const surplusStyle = rowObj.isSurplus ? 'font-weight:700;' : '';
      return `
        <td class="bs-table-cell col-prev bs-num text-muted" style="${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="bs-table-cell bs-acc-row" style="${surplusStyle}">
          ${codeHtml}${escHtml(rowObj.accName)}
        </td>
        <td class="bs-table-cell bs-num bs-inner-amt">&nbsp;</td>
        <td class="bs-table-cell bs-num bs-cell-subtotal-outer ${dividerClass}" style="${surplusStyle}">${formatINR(rowObj.currentAmount, true)}</td>
      `;
    }

    if (rowObj.type === 'account-multi') {
      const codeHtml = (showVoucherNo && rowObj.accCode) ? `<span class="bs-acc-code">[${escHtml(rowObj.accCode)}]</span>` : '';
      const surplusStyle = rowObj.isSurplus ? 'font-weight:700;' : '';
      const outerHtml = rowObj.isLast
        ? `<span class="bs-cell-subtotal-outer">${formatINR(rowObj.outerAmount, true)}</span>`
        : '&nbsp;';
      const outerClass = rowObj.isLast ? 'bs-cell-subtotal-outer' : '';
      return `
        <td class="bs-table-cell col-prev bs-num text-muted" style="${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="bs-table-cell bs-acc-row" style="padding-left:16px; ${surplusStyle}">
          ${codeHtml}${escHtml(rowObj.accName)}
        </td>
        <td class="bs-table-cell bs-num bs-inner-amt" style="${surplusStyle}">${formatINR(rowObj.currentAmount, true)}</td>
        <td class="bs-table-cell bs-num ${outerClass} ${dividerClass}">${outerHtml}</td>
      `;
    }

    if (rowObj.type === 'member-dues-section') {
      return `
        <td class="bs-table-cell col-prev bs-num text-muted" style="${prevStyle}">${rowObj.prevAmount ? formatINR(rowObj.prevAmount, true) : '&nbsp;'}</td>
        <td class="bs-table-cell bs-acc-row" style="padding-left:14px; font-weight:800; color:#0D47A1; font-size:10.5px; text-transform:uppercase; background:#f0f7ff; letter-spacing:0.3px;">
          <i class="bi bi-bookmark-fill" style="font-size:9px; margin-right:5px; opacity:0.8;"></i>${escHtml(rowObj.billType)}
        </td>
        <td class="bs-table-cell bs-num bs-inner-amt" style="background:#f0f7ff;">&nbsp;</td>
        <td class="bs-table-cell bs-num ${dividerClass}" style="background:#f0f7ff;">&nbsp;</td>
      `;
    }

    if (rowObj.type === 'member-dues-item') {
      const outerHtml = rowObj.isLast
        ? `<span class="bs-cell-subtotal-outer">${formatINR(rowObj.outerAmount, true)}</span>`
        : '&nbsp;';
      const outerClass = rowObj.isLast ? 'bs-cell-subtotal-outer' : '';
      return `
        <td class="bs-table-cell col-prev bs-num text-muted" style="${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="bs-table-cell bs-acc-row" style="padding-left:24px; font-size:10px; color:#1e293b;">
          <span class="bs-flat-badge">${escHtml(rowObj.flatDisplay)}</span>
          <span style="margin-left:4px;">${escHtml(rowObj.memName)}</span>
        </td>
        <td class="bs-table-cell bs-num bs-inner-amt" style="font-size:10px;">${formatINR(rowObj.dueAmount, true)}</td>
        <td class="bs-table-cell bs-num ${outerClass} ${dividerClass}">${outerHtml}</td>
      `;
    }

    if (rowObj.type === 'group-summary') {
      return `
        <td class="bs-table-cell col-prev bs-num" style="font-weight:700; ${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="bs-table-cell" colspan="2" style="font-weight:800; color:var(--navy-primary);">
          ${escHtml(rowObj.groupName)}
        </td>
        <td class="bs-table-cell bs-num bs-cell-subtotal-outer ${dividerClass}" style="font-weight:800;">${formatINR(rowObj.currentAmount, true)}</td>
      `;
    }

    return '';
  }

  // ── 5. TOGGLE HANDLERS ──────────────────────────────────────────────────
  window.toggleComparePrevYear = function () {
    renderBalanceSheetView();
  };

  window.toggleVoucherNo = function () {
    renderBalanceSheetView();
  };

  window.toggleMemberBreakup = async function () {
    const chk = document.getElementById('chk-member-breakup');
    if (chk && chk.checked && (!currentBSReport || currentBSReport.memberDues === undefined)) {
      await loadBalanceSheetData();
    } else {
      renderBalanceSheetView();
    }
  };

  // ── 6. PRINT ENGINE ─────────────────────────────────────────────────────
  window.printReport = function () {
    const socName = (currentBSReport && currentBSReport.society) ? currentBSReport.society.societyName : 'Balance_Sheet';
    const asOn = (currentBSReport && currentBSReport.asOnDate) ? currentBSReport.asOnDate : '';
    const origTitle = document.title;
    document.title = `${socName}_Balance_Sheet_${asOn}`.replace(/\s+/g, '_');
    window.print();
    setTimeout(() => { document.title = origTitle; }, 1000);
  };

  // ── 7. EXCEL EXPORT ENGINE (Formula-Driven Statutory Pranav BS Format) ───
  window.exportToExcel = function () {
    if (!currentBSReport) {
      alert('Please wait for the Balance Sheet to load before exporting.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading. Please try again in a few seconds.');
      return;
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

    const soc = currentBSReport.society || {};
    const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const asOnDateStr = toDDMMYYYY(currentBSReport.asOnDate || currentBSReport.asOnDateDisplay);

    const prevAsOnDate = (currentBSReport.prevFY && (currentBSReport.prevFY.asOnDate || currentBSReport.prevFY.asOnDateDisplay || currentBSReport.prevFY.fyEnd)) || '';
    let prevDateHeader = prevAsOnDate ? `${toDDMMYYYY(prevAsOnDate)}\nAmount(Rs.)` : '';
    if (!prevDateHeader && currentBSReport.prevFY && currentBSReport.prevFY.fyLabel) {
      prevDateHeader = `${currentBSReport.prevFY.fyLabel}\nAmount(Rs.)`;
    }
    if (!prevDateHeader) prevDateHeader = 'Prev Year\nAmount(Rs.)';

    const curDateHeader = asOnDateStr ? `${asOnDateStr}\nAmount(Rs.)` : 'Current Year\nAmount(Rs.)';

    // Styling borders
    const thinBorder = { style: 'thin', color: { rgb: '000000' } };
    const mediumBorder = { style: 'medium', color: { rgb: '000000' } };
    const doubleBorder = { style: 'double', color: { rgb: '000000' } };

    function getBorders(c, topB, bottomB) {
      return {
        top: topB || undefined,
        bottom: bottomB || undefined,
        left: (c === 0) ? thinBorder : (c === 4 ? mediumBorder : thinBorder),
        right: (c === 3) ? mediumBorder : thinBorder
      };
    }

    const ws = {};
    const merges = [];

    function setCell(r, c, val, type, style, numFmt, formula) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = { v: (val !== undefined && val !== null) ? val : '' };
      if (type) cell.t = type;
      else if (typeof val === 'number') cell.t = 'n';
      else cell.t = 's';

      if (formula) {
        cell.t = 'n';
        cell.f = formula;
      }
      if (style) cell.s = style;
      if (numFmt) cell.z = numFmt;
      ws[addr] = cell;
    }

    // Row 0: Society Name (Merged A1:H1, 14pt Calibri Bold, Centered)
    setCell(0, 0, socName, 's', {
      font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    for (let c = 1; c < 8; c++) setCell(0, c, '', 's', {});
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });

    // Row 1: Registration Details (Merged A2:H2, 10pt Calibri, Centered)
    const regText = soc.registrationNo ? `Registration No. : ${soc.registrationNo}` : (soc.address || '');
    setCell(1, 0, regText, 's', {
      font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    for (let c = 1; c < 8; c++) setCell(1, c, '', 's', {});
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 7 } });

    // Row 2: Title (Merged A3:H3, 11pt Calibri Bold, Centered)
    setCell(2, 0, `Balance Sheet As On ${asOnDateStr}`, 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    for (let c = 1; c < 8; c++) setCell(2, c, '', 's', {});
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 7 } });

    // Row 3: Column Headers (Excel Row 4)
    const hRow = 3;
    setCell(hRow, 0, prevDateHeader, 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getBorders(0, thinBorder, thinBorder)
    });
    setCell(hRow, 1, 'Liabilities', 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: getBorders(1, thinBorder, thinBorder)
    });
    setCell(hRow, 2, 'Sub Total\nAmount(Rs.)', 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getBorders(2, thinBorder, thinBorder)
    });

    setCell(hRow, 3, curDateHeader, 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getBorders(3, thinBorder, thinBorder)
    });

    setCell(hRow, 4, prevDateHeader, 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getBorders(4, thinBorder, thinBorder)
    });
    setCell(hRow, 5, 'Assets', 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: getBorders(5, thinBorder, thinBorder)
    });
    setCell(hRow, 6, 'Sub Total\nAmount(Rs.)', 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getBorders(6, thinBorder, thinBorder)
    });

    setCell(hRow, 7, curDateHeader, 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getBorders(7, thinBorder, thinBorder)
    });

    // Data Rows
    const showMemberBreakup = document.getElementById('chk-member-breakup')?.checked;
    const hideZero = true;
    const viewMode = document.getElementById('bs-view-mode')?.value || 'detailed';
    const comparePrev = true;
    const showVoucherNo = document.getElementById('chk-voucher-no') ? document.getElementById('chk-voucher-no').checked : true;

    const leftRows = buildSideRows(currentBSReport.liabilities || [], 'liab', viewMode, hideZero, showMemberBreakup, currentBSReport.memberAdvances || []);
    const rightRows = buildSideRows(currentBSReport.assets || [], 'asset', viewMode, hideZero, showMemberBreakup, currentBSReport.memberDues || []);
    const maxRows = Math.max(leftRows.length, rightRows.length);

    let curR = 4;
    const liabOuterCells = [];
    const assetOuterCells = [];
    let liabGroupStartRow = curR + 1;
    let assetGroupStartRow = curR + 1;

    for (let i = 0; i < maxRows; i++) {
      const l = leftRows[i] || null;
      const rData = rightRows[i] || null;

      // Initialize all 8 cells with column borders (no inner horizontal borders for clean whitespace)
      for (let c = 0; c < 8; c++) {
        setCell(curR, c, '', 's', {
          font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
          alignment: { vertical: 'center' },
          border: getBorders(c)
        });
      }

      // Populate Left (Liabilities) Columns 0..3
      if (l) {
        if (l.type === 'group-header') {
          liabGroupStartRow = curR + 2; // Next row in Excel (1-indexed)
          setCell(curR, 1, l.groupName || '', 's', {
            font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(1)
          });
        } else if (l.type === 'account-direct') {
          const accLabel = ((showVoucherNo && l.accCode) ? `[${l.accCode}] ` : '') + (l.accName || '');
          setCell(curR, 1, accLabel, 's', {
            font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(1)
          });
          if (comparePrev && l.prevAmount) {
            setCell(curR, 0, parseFloat(l.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(0)
            }, '#,##0.00');
          }
          const curAmt = parseFloat(l.currentAmount) || 0;
          setCell(curR, 3, curAmt, 'n', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(3, undefined, thinBorder)
          }, '#,##0.00');
          liabOuterCells.push(`D${curR + 1}`);
        } else if (l.type === 'account-multi') {
          const accLabel = ((showVoucherNo && l.accCode) ? `[${l.accCode}] ` : '') + (l.accName || '');
          setCell(curR, 1, '  ' + accLabel, 's', {
            font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(1)
          });
          if (comparePrev && l.prevAmount) {
            setCell(curR, 0, parseFloat(l.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(0)
            }, '#,##0.00');
          }
          // Inner Amount in Col C
          setCell(curR, 2, parseFloat(l.currentAmount) || 0, 'n', {
            font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(2)
          }, '#,##0.00');

          if (l.isLast) {
            const sumFormula = `SUM(C${liabGroupStartRow}:C${curR + 1})`;
            setCell(curR, 3, parseFloat(l.outerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(3, undefined, thinBorder)
            }, '#,##0.00', sumFormula);
            liabOuterCells.push(`D${curR + 1}`);
          }
        } else if (l.type === 'member-dues-section') {
          setCell(curR, 1, `  ${l.billType || ''}`, 's', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '0D47A1' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(1)
          });
          if (comparePrev && l.prevAmount) {
            setCell(curR, 0, parseFloat(l.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(0)
            }, '#,##0.00');
          }
        } else if (l.type === 'member-dues-item') {
          const memLabel = `    ${l.flatDisplay || ''} - ${l.memName || ''}`;
          setCell(curR, 1, memLabel, 's', {
            font: { name: 'Calibri', sz: 9.5, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(1)
          });
          if (comparePrev && l.prevAmount) {
            setCell(curR, 0, parseFloat(l.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(0)
            }, '#,##0.00');
          }
          // Inner advance amount in Col C
          setCell(curR, 2, parseFloat(l.dueAmount) || 0, 'n', {
            font: { name: 'Calibri', sz: 9.5, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(2)
          }, '#,##0.00');

          if (l.isLast) {
            const sumFormula = `SUM(C${liabGroupStartRow}:C${curR + 1})`;
            setCell(curR, 3, parseFloat(l.outerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(3, undefined, thinBorder)
            }, '#,##0.00', sumFormula);
            liabOuterCells.push(`D${curR + 1}`);
          }
        } else if (l.type === 'group-summary') {
          setCell(curR, 1, l.groupName || '', 's', {
            font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(1)
          });
          if (comparePrev && l.prevAmount) {
            setCell(curR, 0, parseFloat(l.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(0)
            }, '#,##0.00');
          }
          setCell(curR, 3, parseFloat(l.currentAmount) || 0, 'n', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(3, undefined, thinBorder)
          }, '#,##0.00');
          liabOuterCells.push(`D${curR + 1}`);
        }
      }

      // Populate Right (Assets) Columns 4..7
      if (rData) {
        if (rData.type === 'group-header') {
          assetGroupStartRow = curR + 2; // Next row in Excel (1-indexed)
          setCell(curR, 5, rData.groupName || '', 's', {
            font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(5)
          });
        } else if (rData.type === 'account-direct') {
          const accLabel = ((showVoucherNo && rData.accCode) ? `[${rData.accCode}] ` : '') + (rData.accName || '');
          setCell(curR, 5, accLabel, 's', {
            font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(5)
          });
          if (comparePrev && rData.prevAmount) {
            setCell(curR, 4, parseFloat(rData.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(4)
            }, '#,##0.00');
          }
          const curAmt = parseFloat(rData.currentAmount) || 0;
          setCell(curR, 7, curAmt, 'n', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(7, undefined, thinBorder)
          }, '#,##0.00');
          assetOuterCells.push(`H${curR + 1}`);
        } else if (rData.type === 'account-multi') {
          const accLabel = ((showVoucherNo && rData.accCode) ? `[${rData.accCode}] ` : '') + (rData.accName || '');
          setCell(curR, 5, '  ' + accLabel, 's', {
            font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(5)
          });
          if (comparePrev && rData.prevAmount) {
            setCell(curR, 4, parseFloat(rData.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(4)
            }, '#,##0.00');
          }
          // Inner Amount in Col G
          setCell(curR, 6, parseFloat(rData.currentAmount) || 0, 'n', {
            font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(6)
          }, '#,##0.00');

          if (rData.isLast) {
            const sumFormula = `SUM(G${assetGroupStartRow}:G${curR + 1})`;
            setCell(curR, 7, parseFloat(rData.outerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(7, undefined, thinBorder)
            }, '#,##0.00', sumFormula);
            assetOuterCells.push(`H${curR + 1}`);
          }
        } else if (rData.type === 'member-dues-section') {
          setCell(curR, 5, `  ${rData.billType || ''}`, 's', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '0D47A1' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(5)
          });
          if (comparePrev && rData.prevAmount) {
            setCell(curR, 4, parseFloat(rData.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(4)
            }, '#,##0.00');
          }
        } else if (rData.type === 'member-dues-item') {
          const memLabel = `    ${rData.flatDisplay || ''} - ${rData.memName || ''}`;
          setCell(curR, 5, memLabel, 's', {
            font: { name: 'Calibri', sz: 9.5, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(5)
          });
          if (comparePrev && rData.prevAmount) {
            setCell(curR, 4, parseFloat(rData.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(4)
            }, '#,##0.00');
          }
          // Inner dues amount
          setCell(curR, 6, parseFloat(rData.dueAmount) || 0, 'n', {
            font: { name: 'Calibri', sz: 9.5, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(6)
          }, '#,##0.00');

          if (rData.isLast) {
            const sumFormula = `SUM(G${assetGroupStartRow}:G${curR + 1})`;
            setCell(curR, 7, parseFloat(rData.outerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(7, undefined, thinBorder)
            }, '#,##0.00', sumFormula);
            assetOuterCells.push(`H${curR + 1}`);
          }
        } else if (rData.type === 'group-summary') {
          setCell(curR, 5, rData.groupName || '', 's', {
            font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(5)
          });
          if (comparePrev && rData.prevAmount) {
            setCell(curR, 4, parseFloat(rData.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(4)
            }, '#,##0.00');
          }
          setCell(curR, 7, parseFloat(rData.currentAmount) || 0, 'n', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(7, undefined, thinBorder)
          }, '#,##0.00');
          assetOuterCells.push(`H${curR + 1}`);
        }
      }

      curR++;
    }

    // Grand Total Row
    const totals = currentBSReport.totals || {};
    const rTotal = curR;

    for (let c = 0; c < 8; c++) {
      setCell(rTotal, c, '', 's', {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
        alignment: { vertical: 'center' },
        border: getBorders(c, thinBorder, doubleBorder)
      });
    }

    // Col A: Prev Liabilities Total
    if (comparePrev) {
      setCell(rTotal, 0, parseFloat(totals.prevLiabilities) || 0, 'n', {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: getBorders(0, thinBorder, doubleBorder)
      }, '#,##0.00');
    }

    // Col B & C (Merged): "Total"
    setCell(rTotal, 1, 'Total', 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getBorders(1, thinBorder, doubleBorder)
    });
    setCell(rTotal, 2, '', 's', { border: getBorders(2, thinBorder, doubleBorder) });
    merges.push({ s: { r: rTotal, c: 1 }, e: { r: rTotal, c: 2 } });

    // Col D: Current Liabilities Total Formula
    const liabTotFormula = liabOuterCells.length > 0 ? `SUM(${liabOuterCells.join(',')})` : undefined;
    setCell(rTotal, 3, parseFloat(totals.currentLiabilities) || 0, 'n', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getBorders(3, thinBorder, doubleBorder)
    }, '#,##0.00', liabTotFormula);

    // Col E: Prev Assets Total
    if (comparePrev) {
      setCell(rTotal, 4, parseFloat(totals.prevAssets) || 0, 'n', {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: getBorders(4, thinBorder, doubleBorder)
      }, '#,##0.00');
    }

    // Col F & G (Merged): "Total"
    setCell(rTotal, 5, 'Total', 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getBorders(5, thinBorder, doubleBorder)
    });
    setCell(rTotal, 6, '', 's', { border: getBorders(6, thinBorder, doubleBorder) });
    merges.push({ s: { r: rTotal, c: 5 }, e: { r: rTotal, c: 6 } });

    // Col H: Current Assets Total Formula
    const assetTotFormula = assetOuterCells.length > 0 ? `SUM(${assetOuterCells.join(',')})` : undefined;
    setCell(rTotal, 7, parseFloat(totals.currentAssets) || 0, 'n', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getBorders(7, thinBorder, doubleBorder)
    }, '#,##0.00', assetTotFormula);

    // Signatory Section
    const rSign = rTotal + 2;
    setCell(rSign, 0, `For ${socName}`, 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    merges.push({ s: { r: rSign, c: 0 }, e: { r: rSign, c: 2 } });

    const rBoxes = rSign + 4;
    setCell(rBoxes, 0, 'Chairman                        Secretary                        Treasurer', 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    merges.push({ s: { r: rBoxes, c: 0 }, e: { r: rBoxes, c: 2 } });

    // Set Ref & Merges
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rBoxes + 1, c: 7 } });
    ws['!merges'] = merges;

    // Column Widths
    ws['!cols'] = [
      { wch: 18 }, // Col A: Prev Liab
      { wch: 42 }, // Col B: LIABILITIES
      { wch: 15 }, // Col C: Inner Amount
      { wch: 18 }, // Col D: Current Liab Total
      { wch: 18 }, // Col E: Prev Asset
      { wch: 42 }, // Col F: ASSETS
      { wch: 15 }, // Col G: Inner Amount
      { wch: 18 }  // Col H: Current Asset Total
    ];

    // Row Heights
    ws['!rows'] = [
      { hpt: 24 }, // Soc Name
      { hpt: 18 }, // Reg & Addr
      { hpt: 20 }, // Period
      { hpt: 26 }  // Header row
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');

    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const dateStr = (currentBSReport.asOnDate || '31-03').replace(/[^0-9-]/g, '');
    XLSX.writeFile(wb, `${cleanSoc}_Balance_Sheet_${dateStr}.xlsx`);
  };

})();
