/**
 * henu-os-template.js — Jeevika ERP v2 / HENU OS
 * Professional Co-operative Balance Sheet Template ("HENU OS FORMATE")
 * Master Visual Reference: Co-operative-balancesheet format-04.docx
 *
 * NOTE: Presentation-only template. All accounting calculations, ledger queries,
 * and balances are supplied strictly by the existing Balance Sheet calculation engine.
 */

(function (window) {
  'use strict';

  // ── 1. CENTRALIZED THEME CONFIGURATION ─────────────────────────────────
  const HENU_OS_THEME = {
    primary: '#A39ED4',        // RGB: 163, 158, 212 — Main Table Header Background
    primaryDark: '#817BB8',    // RGB: 129, 123, 184 — Strong Borders / Accents
    primaryLight: '#E9E7F5',   // RGB: 233, 231, 245 — Major Section Row Background
    border: '#8D8D8D',         // RGB: 141, 141, 141 — Controlled Grid Borders
    borderDark: '#333333',     // Center vertical divider
    text: '#1a1a1a',           // Body text
    mutedText: '#4a4a4a',      // Subtitle / Notes text
    white: '#FFFFFF',          // Table cell background
    page: '#FFFFFF',           // Page background
    totalBackground: '#DCD9EE' // RGB: 220, 217, 238 — Grand Total Row Background
  };

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

  function toDDMMYYYY(val) {
    if (!val) return '';
    const str = String(val).split('T')[0].trim();
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return str.replace(/-/g, '/');
  }

  // ── 2. AUTHORISED SHARE CAPITAL HELPER ──────────────────────────────────
  function getAuthorisedShareCapital() {
    try {
      const socId = (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1');
      let cfg = null;
      const raw = localStorage.getItem('jeevika_config_notes_' + socId) || localStorage.getItem('jeevika_config_notes_global');
      if (raw) cfg = JSON.parse(raw);
      if (!cfg) return null;
      const desc = (cfg.shareName || '').trim();
      const amtStr = (cfg.shareAmount || '').toString().trim();
      const amt = parseFloat(amtStr.replace(/[^0-9.]/g, '')) || 0;
      if (!desc && amt <= 0) return null;
      return {
        description: desc || 'Authorised Share Capital',
        amount: amt
      };
    } catch (e) {
      return null;
    }
  }

  // ── 3. STANDARD CO-OPERATIVE SECTION STRUCTURE ──────────────────────────
  const STANDARD_LIAB_SECTIONS = [
    { code: 'SEC-I', title: 'I. Share Capital', keywords: ['share capital', 'capital', 'shares'] },
    { code: 'SEC-IA', title: 'I-A. Subscription towards shares', keywords: ['subscription', 'share application'] },
    { code: 'SEC-II', title: 'II. Reserve Fund and Other Funds', keywords: ['reserve', 'sinking', 'building fund', 'repairs', 'education'] },
    { code: 'SEC-III', title: 'III. Staff Provident Fund', keywords: ['staff provident', 'provident fund'] },
    { code: 'SEC-IV', title: 'IV. Secured Loans', keywords: ['secured loan', 'bank loan secured', 'mortgage'] },
    { code: 'SEC-V', title: 'V. Unsecured Loans', keywords: ['unsecured loan', 'borrowing', 'loans'] },
    { code: 'SEC-VI', title: 'VI. Deposits', keywords: ['deposit from member', 'fixed deposit', 'security deposit'] },
    { code: 'SEC-VII', title: 'VII. Current Liabilities and Provisions', keywords: ['current liabilit', 'provision', 'creditor', 'advance from member', 'payable', 'dues to'] },
    { code: 'SEC-VIII', title: 'VIII. Unpaid Dividends', keywords: ['unpaid dividend', 'dividend payable'] },
    { code: 'SEC-IX', title: 'IX. Interest accrued due but not paid', keywords: ['interest accrued', 'accrued interest'] },
    { code: 'SEC-X', title: 'X. Other Liabilities', keywords: ['other liabilit', 'miscellaneous liabilit'] },
    { code: 'SEC-XI', title: 'XI. Profit & Loss / Surplus', keywords: ['income & expenditure', 'surplus', 'profit'] }
  ];

  const STANDARD_ASSET_SECTIONS = [
    { code: 'SEC-I', title: 'I. Cash and Bank balances', keywords: ['cash', 'bank', 'bank balance', 'in hand'] },
    { code: 'SEC-II', title: 'II. Investments', keywords: ['investment', 'shares of co-op', 'fixed deposits', 'fd with'] },
    { code: 'SEC-III1', title: 'III. (1) Investment of Staff Provident Fund', keywords: ['staff provident investment', 'pf investment'] },
    { code: 'SEC-III2', title: 'III. (2) Advances against Staff Provident Fund', keywords: ['advances against staff provident', 'pf advance'] },
    { code: 'SEC-IV', title: 'IV. Loans and Advances', keywords: ['loans and advance', 'staff advance', 'advance to vendor'] },
    { code: 'SEC-V', title: 'V. Sundry Debtors', keywords: ['sundry debtor', 'dues from member', 'member dues', 'receivable'] },
    { code: 'SEC-VI', title: 'VI. Current Assets', keywords: ['current asset', 'prepaid', 'deposit with', 'tax deducted'] },
    { code: 'SEC-VII', title: 'VII. Fixed Assets', keywords: ['fixed asset', 'furniture', 'building', 'equipment', 'lift', 'borewell', 'land'] },
    { code: 'SEC-VIII', title: 'VIII. Miscellaneous expenses and losses', keywords: ['miscellaneous expense', 'preliminary'] },
    { code: 'SEC-IX', title: 'IX. Other Items', keywords: ['other item', 'other asset', 'suspense'] },
    { code: 'SEC-X', title: 'X. Profit & Loss Account / Deficit', keywords: ['deficit', 'income & expenditure'] }
  ];

  // ── 4. VIEW MODEL BUILDER ───────────────────────────────────────────────
  function buildHenuOsSideRows(groups, sideType, viewMode, hideZero, showMemberBreakup, memberItems = []) {
    const rows = [];

    // Authorised Share Capital disclosure
    if (sideType === 'liab') {
      const authCap = getAuthorisedShareCapital();
      if (authCap) {
        rows.push({
          type: 'section-header',
          title: 'I. Share Capital',
          isAuthCapital: true
        });
        rows.push({
          type: 'item-row',
          indent: 1,
          name: 'Authorised share Capital',
          isHeaderSub: true,
          prevAmount: null,
          innerAmount: null,
          outerAmount: null
        });
        rows.push({
          type: 'item-row',
          indent: 2,
          name: authCap.description || 'Ordinary Shares',
          prevAmount: authCap.amount,
          innerAmount: authCap.amount,
          outerAmount: authCap.amount,
          isAuthCapital: true,
          isGroupEnd: true
        });
      }
    }

    // Separate Income & Expenditure to place Surplus/Deficit at bottom
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

      const filteredAccounts = hideZero
        ? accounts.filter(a => Math.abs(a.currentAmount) > 0.005 || Math.abs(a.prevAmount) > 0.005)
        : accounts;

      const hasMemberItems = isMemberBreakupGroup && memberItems.some(m => {
        const amt = parseFloat(m.dueAmount != null ? m.dueAmount : m.advanceAmount) || 0;
        const pAmt = parseFloat(m.prevAmount) || 0;
        return Math.abs(amt) > 0.005 || Math.abs(pAmt) > 0.005;
      });

      if (hideZero && filteredAccounts.length === 0 && !hasMemberItems && Math.abs(g.totalCurrent) < 0.005 && Math.abs(g.totalPrev) < 0.005) {
        return;
      }

      // Group section title
      let groupTitle = (g.groupName || '').trim();

      // Check if group already begins with Roman numeral or needs standard match
      const isRoman = /^[IVXLCDM]+\./i.test(groupTitle);
      let sectionTitle = groupTitle;
      if (!isRoman) {
        const standardList = (sideType === 'liab') ? STANDARD_LIAB_SECTIONS : STANDARD_ASSET_SECTIONS;
        const matched = standardList.find(s => s.keywords.some(k => gNameLower.includes(k)));
        if (matched) {
          sectionTitle = `${matched.title} (${groupTitle})`;
        }
      }

      // 1. Group Header Row
      rows.push({
        type: 'section-header',
        title: sectionTitle,
        groupCode: g.groupCode || ''
      });

      if (viewMode === 'summary') {
        const curAmt = (isMemberBreakupGroup && memberItems.length > 0)
          ? memberItems.reduce((sum, m) => sum + (parseFloat(m.dueAmount != null ? m.dueAmount : m.advanceAmount) || 0), 0)
          : g.totalCurrent;
        const prevAmt = (isMemberBreakupGroup && memberItems.length > 0)
          ? (memberItems.reduce((sum, m) => sum + (parseFloat(m.prevAmount) || 0), 0) || g.totalPrev)
          : g.totalPrev;
        rows.push({
          type: 'item-row',
          indent: 1,
          name: groupTitle,
          prevAmount: prevAmt,
          innerAmount: null,
          outerAmount: curAmt,
          isGroupEnd: true
        });
        return;
      }

      // 2. Member Dues / Advances Breakup Group
      if (isMemberBreakupGroup && (memberItems.length > 0 || filteredAccounts.length > 0)) {
        const otherAccounts = filteredAccounts.filter(acc => {
          const c = (acc.accCode || '').toUpperCase().trim();
          const n = (acc.accName || '').toLowerCase().trim();
          return c !== 'ASS-1025' && c !== 'LIA-1020' && n !== 'dues from members' && n !== 'dues from member' && n !== 'advance from members' && n !== 'advance from member';
        });

        otherAccounts.forEach(acc => {
          rows.push({
            type: 'item-row',
            indent: 1,
            accCode: acc.accCode || '',
            name: acc.accName || '',
            prevAmount: acc.prevAmount || 0,
            innerAmount: acc.currentAmount || 0,
            outerAmount: null,
            isLast: false
          });
        });

        if (memberItems.length === 0) {
          if (otherAccounts.length > 0) {
            rows[rows.length - 1].isLast = true;
            rows[rows.length - 1].isGroupEnd = true;
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

        function formatBillTypeName(bt) {
          if (!bt) return '';
          return bt.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }

        if (showMemberBreakup) {
          let processedCount = 0;
          btKeys.forEach((bt) => {
            const items = groupsByBT[bt];
            if (!items || items.length === 0) return;

            rows.push({
              type: 'sub-header',
              indent: 1,
              name: formatBillTypeName(bt)
            });

            items.forEach((m) => {
              processedCount++;
              const isLastOfAll = (processedCount === totalItemsCount);
              const itemAmt = parseFloat(m.dueAmount != null ? m.dueAmount : m.advanceAmount) || 0;
              const itemPrevAmt = parseFloat(m.prevAmount) || 0;

              rows.push({
                type: 'item-row',
                indent: 2,
                name: `${m.flatDisplay || `${m.wing}-${m.flatNo}`} - ${m.memName || ''}`,
                prevAmount: itemPrevAmt,
                innerAmount: itemAmt,
                outerAmount: isLastOfAll ? g.totalCurrent : null,
                isLast: isLastOfAll,
                isGroupEnd: isLastOfAll
              });
            });
          });
          return;
        } else {
          btKeys.forEach((bt, idx) => {
            const items = groupsByBT[bt] || [];
            const btTotal = items.reduce((sum, m) => sum + (parseFloat(m.dueAmount != null ? m.dueAmount : m.advanceAmount) || 0), 0);
            const btPrevTotal = items.reduce((sum, m) => sum + (parseFloat(m.prevAmount) || 0), 0);
            const isLast = (idx === btKeys.length - 1);

            rows.push({
              type: 'item-row',
              indent: 1,
              accCode: '',
              name: formatBillTypeName(bt),
              prevAmount: btPrevTotal || 0,
              innerAmount: btTotal,
              outerAmount: isLast ? g.totalCurrent : null,
              isLast: isLast,
              isGroupEnd: isLast
            });
          });
          return;
        }
      }

      // 3. Regular Accounts
      const accCount = filteredAccounts.length;
      if (accCount === 1) {
        const acc = filteredAccounts[0];
        rows.push({
          type: 'item-row',
          indent: 1,
          accCode: acc.accCode || '',
          name: acc.accName || '',
          prevAmount: acc.prevAmount || g.totalPrev || 0,
          innerAmount: null,
          outerAmount: acc.currentAmount || g.totalCurrent || 0,
          isSurplus: !!acc.isSurplusEntry,
          isGroupEnd: true
        });
      } else if (accCount > 1) {
        const hasAnyAccPrev = filteredAccounts.some(a => Math.abs(a.prevAmount) > 0.005);
        filteredAccounts.forEach((acc, idx) => {
          const isLast = (idx === accCount - 1);
          rows.push({
            type: 'item-row',
            indent: 1,
            accCode: acc.accCode || '',
            name: acc.accName || '',
            prevAmount: hasAnyAccPrev ? (acc.prevAmount || 0) : (idx === 0 ? g.totalPrev : 0),
            innerAmount: acc.currentAmount || 0,
            outerAmount: isLast ? g.totalCurrent : null,
            isLast: isLast,
            isGroupEnd: isLast,
            isSurplus: !!acc.isSurplusEntry
          });
        });
      } else {
        rows.push({
          type: 'item-row',
          indent: 1,
          accCode: '',
          name: groupTitle,
          prevAmount: g.totalPrev || 0,
          innerAmount: null,
          outerAmount: g.totalCurrent || 0,
          isGroupEnd: true
        });
      }
    });

    return rows;
  }

  // ── 5. SCREEN RENDERER (8 Logical Columns in Strict DOC Order) ──────────
  function renderHenuOsScreen(reportData, containerEl) {
    if (!reportData || !containerEl) return;

    const soc = reportData.society || {};
    const activeSocName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const asOnStr = toDDMMYYYY(reportData.asOnDate || reportData.asOnDateDisplay);
    const prevAsOnStr = toDDMMYYYY(reportData.prevFY && (reportData.prevFY.asOnDate || reportData.prevFY.asOnDateDisplay || reportData.prevFY.fyEnd));

    const viewMode = document.getElementById('bs-view-mode')?.value || 'detailed';
    const showVoucherNo = document.getElementById('chk-voucher-no') ? document.getElementById('chk-voucher-no').checked : true;
    const showMemberBreakup = document.getElementById('chk-member-breakup')?.checked;
    const hideZero = true;

    // Build side rows
    const leftRows = buildHenuOsSideRows(reportData.liabilities || [], 'liab', viewMode, hideZero, showMemberBreakup, reportData.memberAdvances || []);
    const rightRows = buildHenuOsSideRows(reportData.assets || [], 'asset', viewMode, hideZero, showMemberBreakup, reportData.memberDues || []);
    const maxRows = Math.max(leftRows.length, rightRows.length);

    // Build Society address lines
    let addrLine1 = soc.address || '';
    let addrLine2Parts = [];
    if (soc.city) addrLine2Parts.push(soc.city);
    if (soc.state) addrLine2Parts.push(soc.state);
    if (soc.pincode) addrLine2Parts.push(`PIN: ${soc.pincode}`);
    if (soc.registrationNo) addrLine2Parts.push(`Reg No: ${soc.registrationNo}`);
    let addrLine2 = addrLine2Parts.join(' | ');

    let html = `
      <div class="henu-os-wrapper" id="henuOsReportWrapper">
        <!-- Masthead -->
        <div class="henu-os-masthead">
          <div class="henu-os-soc-name">${escHtml(activeSocName)}</div>
          ${addrLine1 ? `<div class="henu-os-soc-addr">${escHtml(addrLine1)}</div>` : ''}
          ${addrLine2 ? `<div class="henu-os-soc-addr">${escHtml(addrLine2)}</div>` : ''}
          <div>
            <span class="henu-os-report-title">BALANCE SHEET AS OF ${escHtml(asOnStr || reportData.asOnDate || '—')}</span>
          </div>
        </div>

        <!-- Two-Sided Table (8 Logical Columns matching DOC Reference) -->
        <div class="henu-os-table-wrapper">
          <table class="henu-os-table">
            <colgroup>
              <!-- Liabilities: Particulars(25%), Inner(8.5%), Current Year(8.25%), Previous Year(8.25%) -->
              <col style="width: 25%;">
              <col style="width: 8.5%;">
              <col style="width: 8.25%;">
              <col style="width: 8.25%;">
              <!-- Assets: Particulars(25%), Inner(8.5%), Current Year(8.25%), Previous Year(8.25%) -->
              <col style="width: 25%;">
              <col style="width: 8.5%;">
              <col style="width: 8.25%;">
              <col style="width: 8.25%;">
            </colgroup>
            <thead>
              <tr class="henu-os-col-header-row">
                <th colspan="2">LIABILITIES</th>
                <th>${asOnStr ? `${escHtml(asOnStr)}<br>Amount (₹)` : 'CURRENT YEAR<br>Amount (₹)'}</th>
                <th class="henu-os-divider">${prevAsOnStr ? `${escHtml(prevAsOnStr)}<br>Amount (₹)` : 'PREVIOUS YEAR<br>Amount (₹)'}</th>

                <th colspan="2">ASSETS</th>
                <th>${asOnStr ? `${escHtml(asOnStr)}<br>Amount (₹)` : 'CURRENT YEAR<br>Amount (₹)'}</th>
                <th>${prevAsOnStr ? `${escHtml(prevAsOnStr)}<br>Amount (₹)` : 'PREVIOUS YEAR<br>Amount (₹)'}</th>
              </tr>
            </thead>
            <tbody>
    `;

    for (let i = 0; i < maxRows; i++) {
      const l = leftRows[i] || null;
      const r = rightRows[i] || null;

      html += '<tr>';
      html += renderHenuOsHalfRow(l, 'left', showVoucherNo);
      html += renderHenuOsHalfRow(r, 'right', showVoucherNo);
      html += '</tr>';
    }

    if (maxRows === 0) {
      html += '<tr><td colspan="8" class="text-center text-muted" style="padding:40px;">No accounting data available.</td></tr>';
    }

    // Totals
    const totals = reportData.totals || {};
    html += `
            </tbody>
            <tfoot>
              <tr class="henu-os-grand-total-row">
                <td colspan="2" style="text-align:right; padding-right:12px;">TOTAL LIABILITIES</td>
                <td class="henu-os-num">${formatINR(totals.currentLiabilities)}</td>
                <td class="henu-os-num henu-os-divider">${formatINR(totals.prevLiabilities)}</td>

                <td colspan="2" style="text-align:right; padding-right:12px;">TOTAL ASSETS</td>
                <td class="henu-os-num">${formatINR(totals.currentAssets)}</td>
                <td class="henu-os-num">${formatINR(totals.prevAssets)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Statutory Signature Section (DOC Format) -->
        <div class="henu-os-signature-block">
          <div class="henu-os-sign-left">
            <div class="henu-os-sign-society">For: ${escHtml(activeSocName)}</div>
            <div class="henu-os-sign-date">Date: ${escHtml(asOnStr || reportData.asOnDate || '—')}</div>
            <div class="henu-os-sign-ca">For: (C/A)</div>
          </div>
          <div class="henu-os-sign-right">
            <div style="min-height:48px;">&nbsp;</div>
            <div class="henu-os-sign-roles">
              <span>(Proprietor)</span>
              <span>(Chairman)</span>
              <span>(Secretary)</span>
            </div>
          </div>
        </div>
      </div>
    `;

    containerEl.innerHTML = html;
  }

  function renderHenuOsHalfRow(row, side, showVoucherNo) {
    const isLeft = (side === 'left');
    const dividerClass = isLeft ? 'henu-os-divider' : '';

    if (!row) {
      return `
        <td class="henu-os-cell henu-os-blank-cell">&nbsp;</td>
        <td class="henu-os-cell henu-os-blank-cell">&nbsp;</td>
        <td class="henu-os-cell henu-os-blank-cell">&nbsp;</td>
        <td class="henu-os-cell henu-os-blank-cell ${dividerClass}">&nbsp;</td>
      `;
    }

    if (row.type === 'section-header') {
      return `
        <td class="henu-os-cell henu-os-section-row" colspan="2">
          <strong>${escHtml(row.title)}</strong>
        </td>
        <td class="henu-os-cell henu-os-section-row">&nbsp;</td>
        <td class="henu-os-cell henu-os-section-row ${dividerClass}">&nbsp;</td>
      `;
    }

    if (row.type === 'sub-header') {
      const indentClass = row.indent ? `henu-os-indent-${row.indent}` : '';
      return `
        <td class="henu-os-cell henu-os-sub-section-row ${indentClass}" colspan="2">
          <em>${escHtml(row.name)}</em>
        </td>
        <td class="henu-os-cell henu-os-sub-section-row">&nbsp;</td>
        <td class="henu-os-cell henu-os-sub-section-row ${dividerClass}">&nbsp;</td>
      `;
    }

    if (row.type === 'item-row') {
      const indentClass = row.indent ? `henu-os-indent-${row.indent}` : '';
      const codeHtml = (showVoucherNo && row.accCode) ? `<span style="font-size:9.5px; color:#555;">[${escHtml(row.accCode)}]</span> ` : '';
      const prevHtml = row.prevAmount ? formatINR(row.prevAmount, true) : '&nbsp;';
      const innerHtml = row.innerAmount != null ? formatINR(row.innerAmount, true) : '&nbsp;';
      const outerHtml = row.outerAmount != null ? formatINR(row.outerAmount, true) : '&nbsp;';
      const fontBold = row.isHeaderSub ? 'font-weight:700;' : (row.isSurplus ? 'font-weight:700;' : '');
      const subtotalClass = (row.outerAmount != null && row.isGroupEnd) ? 'henu-os-subtotal-cell' : '';

      return `
        <td class="henu-os-cell henu-os-particulars ${indentClass}" style="${fontBold}">
          ${codeHtml}${escHtml(row.name)}
        </td>
        <td class="henu-os-cell henu-os-num">${innerHtml}</td>
        <td class="henu-os-cell henu-os-num ${subtotalClass}" style="${fontBold}">${outerHtml}</td>
        <td class="henu-os-cell henu-os-num ${dividerClass}">${prevHtml}</td>
      `;
    }

    return '';
  }

  // ── 6. PRINT ENGINE ─────────────────────────────────────────────────────
  function printHenuOsReport(reportData) {
    const soc = reportData ? (reportData.society || {}) : {};
    const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (soc.societyName || 'Balance_Sheet');
    const asOn = (reportData && reportData.asOnDate) ? reportData.asOnDate : '';
    const origTitle = document.title;
    document.title = `${socName}_Balance_Sheet_HENU_OS_FORMATE_${asOn}`.replace(/\s+/g, '_');
    window.print();
    setTimeout(() => { document.title = origTitle; }, 1000);
  }

  // ── 7. EXCEL EXPORT ENGINE (HENU OS FORMATE 8-Column Architecture) ────────
  function exportHenuOsExcel(reportData) {
    if (!reportData) {
      alert('Please wait for the Balance Sheet to load before exporting.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading. Please try again in a few seconds.');
      return;
    }

    const soc = reportData.society || {};
    const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const asOnDateStr = toDDMMYYYY(reportData.asOnDate || reportData.asOnDateDisplay);
    const prevAsOnDate = (reportData.prevFY && (reportData.prevFY.asOnDate || reportData.prevFY.asOnDateDisplay || reportData.prevFY.fyEnd)) || '';
    const prevDateHeader = prevAsOnDate ? `${toDDMMYYYY(prevAsOnDate)}\nAmount (₹)` : 'PREVIOUS YEAR\nAmount (₹)';
    const curDateHeader = asOnDateStr ? `${asOnDateStr}\nAmount (₹)` : 'CURRENT YEAR\nAmount (₹)';

    // Theme Border Styles
    const borderGrayHex = '8D8D8D';
    const borderDarkHex = '333333';
    const thinBorder = { style: 'thin', color: { rgb: borderGrayHex } };
    const thickBorder = { style: 'medium', color: { rgb: borderDarkHex } };
    const doubleBorder = { style: 'double', color: { rgb: borderDarkHex } };

    function getHenuBorders(c, topB, bottomB) {
      return {
        top: topB || thinBorder,
        bottom: bottomB || thinBorder,
        left: (c === 0 || c === 4) ? thickBorder : thinBorder,
        right: (c === 3 || c === 7) ? thickBorder : thinBorder
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
      font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: '1a1a1a' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    for (let c = 1; c < 8; c++) setCell(0, c, '', 's', {});
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });

    // Row 1: Address & Reg Details (Merged A2:H2, 10pt Calibri, Centered)
    let addrLine2Parts = [];
    if (soc.address) addrLine2Parts.push(soc.address);
    if (soc.city) addrLine2Parts.push(soc.city);
    if (soc.registrationNo) addrLine2Parts.push(`Reg No: ${soc.registrationNo}`);
    const regText = addrLine2Parts.join(' | ');
    setCell(1, 0, regText, 's', {
      font: { name: 'Calibri', sz: 10, color: { rgb: '4a4a4a' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    for (let c = 1; c < 8; c++) setCell(1, c, '', 's', {});
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 7 } });

    // Row 2: Title (Merged A3:H3, 11pt Calibri Bold, Centered, Fill #E9E7F5)
    setCell(2, 0, `BALANCE SHEET AS OF ${asOnDateStr}`, 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1a1a1a' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: 'E9E7F5' } },
      border: {
        top: thinBorder,
        bottom: thinBorder,
        left: thickBorder,
        right: thickBorder
      }
    });
    for (let c = 1; c < 8; c++) {
      setCell(2, c, '', 's', {
        fill: { fgColor: { rgb: 'E9E7F5' } },
        border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: (c === 7 ? thickBorder : thinBorder) }
      });
    }
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 7 } });

    // Row 3: Column Headers (Fill #A39ED4, Bold, Centered in 8-Column Format)
    // Left: LIABILITIES (A:B), CURRENT YEAR (C), PREVIOUS YEAR (D)
    // Right: ASSETS (E:F), CURRENT YEAR (G), PREVIOUS YEAR (H)
    const hRow = 3;
    const headerFill = { fgColor: { rgb: 'A39ED4' } };
    const headerFont = { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '1a1a1a' } };

    // Col A & B: LIABILITIES
    setCell(hRow, 0, 'LIABILITIES', 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1a1a1a' } },
      fill: headerFill,
      alignment: { horizontal: 'center', vertical: 'center' },
      border: getHenuBorders(0, thickBorder, thickBorder)
    });
    setCell(hRow, 1, '', 's', { fill: headerFill, border: getHenuBorders(1, thickBorder, thickBorder) });
    merges.push({ s: { r: hRow, c: 0 }, e: { r: hRow, c: 1 } });

    // Col C: Cur Liab
    setCell(hRow, 2, curDateHeader, 's', {
      font: headerFont,
      fill: headerFill,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getHenuBorders(2, thickBorder, thickBorder)
    });

    // Col D: Prev Liab
    setCell(hRow, 3, prevDateHeader, 's', {
      font: headerFont,
      fill: headerFill,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getHenuBorders(3, thickBorder, thickBorder)
    });

    // Col E & F: ASSETS
    setCell(hRow, 4, 'ASSETS', 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1a1a1a' } },
      fill: headerFill,
      alignment: { horizontal: 'center', vertical: 'center' },
      border: getHenuBorders(4, thickBorder, thickBorder)
    });
    setCell(hRow, 5, '', 's', { fill: headerFill, border: getHenuBorders(5, thickBorder, thickBorder) });
    merges.push({ s: { r: hRow, c: 4 }, e: { r: hRow, c: 5 } });

    // Col G: Cur Asset
    setCell(hRow, 6, curDateHeader, 's', {
      font: headerFont,
      fill: headerFill,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getHenuBorders(6, thickBorder, thickBorder)
    });

    // Col H: Prev Asset
    setCell(hRow, 7, prevDateHeader, 's', {
      font: headerFont,
      fill: headerFill,
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: getHenuBorders(7, thickBorder, thickBorder)
    });

    // Build Data Rows
    const viewMode = document.getElementById('bs-view-mode')?.value || 'detailed';
    const showVoucherNo = document.getElementById('chk-voucher-no') ? document.getElementById('chk-voucher-no').checked : true;
    const showMemberBreakup = document.getElementById('chk-member-breakup')?.checked;
    const hideZero = true;

    const leftRows = buildHenuOsSideRows(reportData.liabilities || [], 'liab', viewMode, hideZero, showMemberBreakup, reportData.memberAdvances || []);
    const rightRows = buildHenuOsSideRows(reportData.assets || [], 'asset', viewMode, hideZero, showMemberBreakup, reportData.memberDues || []);
    const maxRows = Math.max(leftRows.length, rightRows.length);

    let curR = 4;
    const liabOuterCells = [];
    const assetOuterCells = [];

    const sectionFill = { fgColor: { rgb: 'E9E7F5' } };
    const sectionFont = { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '1a1a1a' } };

    for (let i = 0; i < maxRows; i++) {
      const l = leftRows[i] || null;
      const r = rightRows[i] || null;

      // Base blank row
      for (let c = 0; c < 8; c++) {
        setCell(curR, c, '', 's', {
          font: { name: 'Calibri', sz: 10, color: { rgb: '1a1a1a' } },
          alignment: { vertical: 'center' },
          border: getHenuBorders(c)
        });
      }

      // Left Side (Liabilities: Col 0..3)
      if (l) {
        if (l.type === 'section-header') {
          setCell(curR, 0, l.title, 's', {
            font: sectionFont,
            fill: sectionFill,
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getHenuBorders(0)
          });
          setCell(curR, 1, '', 's', { fill: sectionFill, border: getHenuBorders(1) });
          merges.push({ s: { r: curR, c: 0 }, e: { r: curR, c: 1 } });
          setCell(curR, 2, '', 's', { fill: sectionFill, border: getHenuBorders(2) });
          setCell(curR, 3, '', 's', { fill: sectionFill, border: getHenuBorders(3) });
        } else if (l.type === 'sub-header') {
          setCell(curR, 0, '   ' + l.name, 's', {
            font: { name: 'Calibri', sz: 10, bold: true, italic: true, color: { rgb: '1a1a1a' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getHenuBorders(0)
          });
          merges.push({ s: { r: curR, c: 0 }, e: { r: curR, c: 1 } });
        } else if (l.type === 'item-row') {
          const indent = l.indent ? ' '.repeat(l.indent * 3) : '';
          const code = (showVoucherNo && l.accCode) ? `[${l.accCode}] ` : '';
          const label = indent + code + (l.name || '');

          setCell(curR, 0, label, 's', {
            font: { name: 'Calibri', sz: 10, bold: !!(l.isHeaderSub || l.isSurplus), color: { rgb: '1a1a1a' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getHenuBorders(0)
          });

          // Col B (1): Inner Amount
          if (l.innerAmount != null) {
            setCell(curR, 1, parseFloat(l.innerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '1a1a1a' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getHenuBorders(1)
            }, '#,##0.00');
          }

          // Col C (2): Current Year Outer / Subtotal
          if (l.outerAmount != null) {
            setCell(curR, 2, parseFloat(l.outerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1a1a1a' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getHenuBorders(2, thinBorder, l.isGroupEnd ? thickBorder : thinBorder)
            }, '#,##0.00');
            if (!l.isAuthCapital) {
              liabOuterCells.push(`C${curR + 1}`);
            }
          }

          // Col D (3): Previous Year Amount
          if (l.prevAmount) {
            setCell(curR, 3, parseFloat(l.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '1a1a1a' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getHenuBorders(3)
            }, '#,##0.00');
          }
        }
      }

      // Right Side (Assets: Col 4..7)
      if (r) {
        if (r.type === 'section-header') {
          setCell(curR, 4, r.title, 's', {
            font: sectionFont,
            fill: sectionFill,
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getHenuBorders(4)
          });
          setCell(curR, 5, '', 's', { fill: sectionFill, border: getHenuBorders(5) });
          merges.push({ s: { r: curR, c: 4 }, e: { r: curR, c: 5 } });
          setCell(curR, 6, '', 's', { fill: sectionFill, border: getHenuBorders(6) });
          setCell(curR, 7, '', 's', { fill: sectionFill, border: getHenuBorders(7) });
        } else if (r.type === 'sub-header') {
          setCell(curR, 4, '   ' + r.name, 's', {
            font: { name: 'Calibri', sz: 10, bold: true, italic: true, color: { rgb: '1a1a1a' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getHenuBorders(4)
          });
          merges.push({ s: { r: curR, c: 4 }, e: { r: curR, c: 5 } });
        } else if (r.type === 'item-row') {
          const indent = r.indent ? ' '.repeat(r.indent * 3) : '';
          const code = (showVoucherNo && r.accCode) ? `[${r.accCode}] ` : '';
          const label = indent + code + (r.name || '');

          setCell(curR, 4, label, 's', {
            font: { name: 'Calibri', sz: 10, bold: !!(r.isHeaderSub || r.isSurplus), color: { rgb: '1a1a1a' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getHenuBorders(4)
          });

          // Col F (5): Inner Amount
          if (r.innerAmount != null) {
            setCell(curR, 5, parseFloat(r.innerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '1a1a1a' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getHenuBorders(5)
            }, '#,##0.00');
          }

          // Col G (6): Current Year Outer / Subtotal
          if (r.outerAmount != null) {
            setCell(curR, 6, parseFloat(r.outerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1a1a1a' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getHenuBorders(6, thinBorder, r.isGroupEnd ? thickBorder : thinBorder)
            }, '#,##0.00');
            assetOuterCells.push(`G${curR + 1}`);
          }

          // Col H (7): Previous Year Amount
          if (r.prevAmount) {
            setCell(curR, 7, parseFloat(r.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, color: { rgb: '1a1a1a' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getHenuBorders(7)
            }, '#,##0.00');
          }
        }
      }

      curR++;
    }

    // Grand Total Row (Fill #DCD9EE, Double Bottom Border)
    const totals = reportData.totals || {};
    const rTotal = curR;
    const totalFill = { fgColor: { rgb: 'DCD9EE' } };
    const totalFont = { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1a1a1a' } };

    for (let c = 0; c < 8; c++) {
      setCell(rTotal, c, '', 's', {
        font: totalFont,
        fill: totalFill,
        alignment: { vertical: 'center' },
        border: getHenuBorders(c, thickBorder, doubleBorder)
      });
    }

    // Col A & B: TOTAL LIABILITIES
    setCell(rTotal, 0, 'TOTAL LIABILITIES', 's', {
      font: totalFont,
      fill: totalFill,
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getHenuBorders(0, thickBorder, doubleBorder)
    });
    setCell(rTotal, 1, '', 's', { fill: totalFill, border: getHenuBorders(1, thickBorder, doubleBorder) });
    merges.push({ s: { r: rTotal, c: 0 }, e: { r: rTotal, c: 1 } });

    // Col C (2): Current Liab Total Formula
    const liabTotFormula = liabOuterCells.length > 0 ? `SUM(${liabOuterCells.join(',')})` : undefined;
    setCell(rTotal, 2, parseFloat(totals.currentLiabilities) || 0, 'n', {
      font: totalFont,
      fill: totalFill,
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getHenuBorders(2, thickBorder, doubleBorder)
    }, '#,##0.00', liabTotFormula);

    // Col D (3): Prev Liab Total
    setCell(rTotal, 3, parseFloat(totals.prevLiabilities) || 0, 'n', {
      font: totalFont,
      fill: totalFill,
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getHenuBorders(3, thickBorder, doubleBorder)
    }, '#,##0.00');

    // Col E & F: TOTAL ASSETS
    setCell(rTotal, 4, 'TOTAL ASSETS', 's', {
      font: totalFont,
      fill: totalFill,
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getHenuBorders(4, thickBorder, doubleBorder)
    });
    setCell(rTotal, 5, '', 's', { fill: totalFill, border: getHenuBorders(5, thickBorder, doubleBorder) });
    merges.push({ s: { r: rTotal, c: 4 }, e: { r: rTotal, c: 5 } });

    // Col G (6): Current Asset Total Formula
    const assetTotFormula = assetOuterCells.length > 0 ? `SUM(${assetOuterCells.join(',')})` : undefined;
    setCell(rTotal, 6, parseFloat(totals.currentAssets) || 0, 'n', {
      font: totalFont,
      fill: totalFill,
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getHenuBorders(6, thickBorder, doubleBorder)
    }, '#,##0.00', assetTotFormula);

    // Col H (7): Prev Asset Total
    setCell(rTotal, 7, parseFloat(totals.prevAssets) || 0, 'n', {
      font: totalFont,
      fill: totalFill,
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getHenuBorders(7, thickBorder, doubleBorder)
    }, '#,##0.00');

    // Signature Block Rows (Matching DOC reference)
    const rSign = rTotal + 2;
    for (let i = 0; i < 5; i++) {
      for (let c = 0; c < 8; c++) {
        setCell(rSign + i, c, '', 's', {});
      }
    }

    // Left Signature
    setCell(rSign, 0, `For: ${socName}`, 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1a1a1a' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    merges.push({ s: { r: rSign, c: 0 }, e: { r: rSign, c: 3 } });

    setCell(rSign + 1, 0, `Date: ${asOnDateStr}`, 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1a1a1a' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    merges.push({ s: { r: rSign + 1, c: 0 }, e: { r: rSign + 1, c: 3 } });

    setCell(rSign + 2, 0, 'For: (C/A)', 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1a1a1a' } },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    merges.push({ s: { r: rSign + 2, c: 0 }, e: { r: rSign + 2, c: 3 } });

    // Right Signatures: (Proprietor), (Chairman), (Secretary)
    setCell(rSign + 3, 4, '(Proprietor)', 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1a1a1a' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    setCell(rSign + 3, 5, '(Chairman)', 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1a1a1a' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    setCell(rSign + 3, 7, '(Secretary)', 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1a1a1a' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });

    // Sheet Range & Properties
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rSign + 4, c: 7 } });
    ws['!merges'] = merges;

    // Column Widths
    ws['!cols'] = [
      { wch: 38 }, // Col A (0): Liabilities Description
      { wch: 14 }, // Col B (1): Inner Amount
      { wch: 16 }, // Col C (2): Current Liab Total
      { wch: 16 }, // Col D (3): Prev Liab
      { wch: 38 }, // Col E (4): Assets Description
      { wch: 14 }, // Col F (5): Inner Amount
      { wch: 16 }, // Col G (6): Current Asset Total
      { wch: 16 }  // Col H (7): Prev Asset
    ];

    // Row Heights
    ws['!rows'] = [
      { hpt: 24 }, // Soc Name
      { hpt: 18 }, // Address
      { hpt: 20 }, // Title
      { hpt: 26 }  // Column Header
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');

    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const dateStr = (reportData.asOnDate || '31-03').replace(/[^0-9-]/g, '');
    XLSX.writeFile(wb, `${cleanSoc}_Balance_Sheet_HENU_OS_FORMATE_${dateStr}.xlsx`);
  }

  // ── 8. EXPOSE PUBLIC API ────────────────────────────────────────────────
  window.HenuOsBalanceSheet = {
    THEME: HENU_OS_THEME,
    render: renderHenuOsScreen,
    print: printHenuOsReport,
    exportExcel: exportHenuOsExcel
  };

})(window);
