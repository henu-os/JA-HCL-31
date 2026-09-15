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
    const comparePrev = document.getElementById('chk-compare-prev')?.checked ? 'true' : 'false';
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

    // Previous year column headers
    const thPrevL = document.getElementById('th-prev-liab');
    const thPrevA = document.getElementById('th-prev-asset');
    const prevText = (data.prevFY && data.prevFY.asOnDateDisplay)
      ? `${data.prevFY.asOnDateDisplay} Amount (₹)`
      : 'Prev Year (₹)';

    if (thPrevL) thPrevL.textContent = prevText;
    if (thPrevA) thPrevA.textContent = prevText;
  }

  // ── 4. T-FORMAT SIDE-BY-SIDE RENDERER ────────────────────────────────────
  window.renderBalanceSheetView = function () {
    if (!currentBSReport) return;

    const viewMode = document.getElementById('bs-view-mode')?.value || 'detailed';
    const comparePrev = document.getElementById('chk-compare-prev')?.checked;
    const showMemberBreakup = document.getElementById('chk-member-breakup')?.checked;
    const hideZero = document.getElementById('chk-hide-zero')?.checked;

    // Sync visibility of previous year columns
    document.querySelectorAll('.col-prev').forEach(el => {
      el.style.display = comparePrev ? '' : 'none';
    });

    // 1. Build Left Side (Liabilities) Rows
    const leftRows = buildSideRows(currentBSReport.liabilities || [], 'liab', viewMode, hideZero, false);

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
      html += renderHalfRowCells(l, 'left', comparePrev);
      html += renderHalfRowCells(r, 'right', comparePrev);
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

    // 5. Difference Banner Check
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
   * Builds an array of row objects for either Liabilities or Assets.
   */
  function buildSideRows(groups, sideType, viewMode, hideZero, showMemberBreakup, memberDues = []) {
    const rows = [];
    let groupIndex = 1;

    groups.forEach(g => {
      const accounts = g.accounts || [];
      const isDuesGroup = (g.groupName || '').toLowerCase().includes('dues from member');

      // Filter zero balance accounts if requested
      const filteredAccounts = hideZero
        ? accounts.filter(a => Math.abs(a.currentAmount) > 0.005 || Math.abs(a.prevAmount) > 0.005)
        : accounts;

      if (hideZero && filteredAccounts.length === 0 && Math.abs(g.totalCurrent) < 0.005 && Math.abs(g.totalPrev) < 0.005) {
        return; // Skip empty group in hideZero mode
      }

      // Group Header Row
      const groupTitle = `${groupIndex}. ${g.groupName}`;
      groupIndex++;

      if (viewMode === 'summary') {
        // In summary mode, group row carries the total directly
        rows.push({
          type: 'group-summary',
          groupName: groupTitle,
          prevAmount: g.totalPrev,
          currentAmount: g.totalCurrent
        });
      } else {
        // In detailed mode: Group Header Row
        rows.push({
          type: 'group-header',
          groupName: groupTitle,
          groupCode: g.groupCode || ''
        });

        // Detailed Accounts Rows
        filteredAccounts.forEach(acc => {
          rows.push({
            type: 'account',
            accCode: acc.accCode || '',
            accName: acc.accName || '',
            prevAmount: acc.prevAmount || 0,
            currentAmount: acc.currentAmount || 0,
            isSurplus: !!acc.isSurplusEntry
          });
        });

        // Special: If this is "Dues from Members" group and Member Breakup is enabled
        if (isDuesGroup && showMemberBreakup && memberDues.length > 0) {
          memberDues.forEach(m => {
            rows.push({
              type: 'member-dues-item',
              flatDisplay: m.flatDisplay || `${m.wing}-${m.flatNo}`,
              memName: m.memName,
              dueAmount: m.dueAmount
            });
          });
        }

        // Group Total Row (Sub-total)
        rows.push({
          type: 'group-total',
          groupName: `Total ${g.groupName}`,
          prevAmount: g.totalPrev,
          currentAmount: g.totalCurrent
        });

        // Empty separator row for breathing room
        rows.push({ type: 'spacer' });
      }
    });

    return rows;
  }

  /**
   * Renders the 4 HTML table cells for either the Left (Liabilities) or Right (Assets) side.
   */
  function renderHalfRowCells(rowObj, side, comparePrev) {
    const isLeft = (side === 'left');
    const dividerClass = isLeft ? 'bs-side-divider' : '';
    const prevStyle = comparePrev ? '' : 'display:none;';

    if (!rowObj) {
      return `
        <td class="bs-table-cell col-prev bs-num" style="${prevStyle}">&nbsp;</td>
        <td class="bs-table-cell">&nbsp;</td>
        <td class="bs-table-cell bs-num">&nbsp;</td>
        <td class="bs-table-cell bs-num ${dividerClass}">&nbsp;</td>
      `;
    }

    if (rowObj.type === 'spacer') {
      return `
        <td class="bs-table-cell col-prev" style="${prevStyle}">&nbsp;</td>
        <td class="bs-table-cell" style="height:12px;">&nbsp;</td>
        <td class="bs-table-cell">&nbsp;</td>
        <td class="bs-table-cell ${dividerClass}">&nbsp;</td>
      `;
    }

    if (rowObj.type === 'group-header') {
      return `
        <td class="bs-table-cell col-prev bs-num text-muted" style="${prevStyle}"></td>
        <td class="bs-table-cell" style="font-weight:800; color:#0a3880; background:#f8fafc;">
          <span class="bs-group-title">${escHtml(rowObj.groupName)}</span>
        </td>
        <td class="bs-table-cell bs-num" style="background:#f8fafc;"></td>
        <td class="bs-table-cell bs-num ${dividerClass}" style="background:#f8fafc;"></td>
      `;
    }

    if (rowObj.type === 'account') {
      const codeHtml = rowObj.accCode ? `<span class="bs-acc-code">[${escHtml(rowObj.accCode)}]</span>` : '';
      const surplusStyle = rowObj.isSurplus ? 'font-weight:700; color:#0d9488;' : '';
      return `
        <td class="bs-table-cell col-prev bs-num text-muted" style="${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="bs-table-cell bs-acc-row" style="padding-left:18px; ${surplusStyle}">
          ${codeHtml}${escHtml(rowObj.accName)}
        </td>
        <td class="bs-table-cell bs-num" style="${surplusStyle}">${formatINR(rowObj.currentAmount, true)}</td>
        <td class="bs-table-cell bs-num ${dividerClass}"></td>
      `;
    }

    if (rowObj.type === 'member-dues-item') {
      return `
        <td class="bs-table-cell col-prev" style="${prevStyle}"></td>
        <td class="bs-table-cell" style="padding-left:32px; font-size:10.5px; color:#475569;">
          <span class="bs-flat-badge">${escHtml(rowObj.flatDisplay)}</span>
          <span style="margin-left:6px;">${escHtml(rowObj.memName)}</span>
        </td>
        <td class="bs-table-cell bs-num" style="font-size:10.5px; color:#475569;">${formatINR(rowObj.dueAmount)}</td>
        <td class="bs-table-cell bs-num ${dividerClass}"></td>
      `;
    }

    if (rowObj.type === 'group-total') {
      return `
        <td class="bs-table-cell col-prev bs-num bs-group-total" style="${prevStyle}">${formatINR(rowObj.prevAmount)}</td>
        <td class="bs-table-cell bs-group-total" style="text-align:right; font-size:10.5px; text-transform:uppercase; color:#475569;">
          ${escHtml(rowObj.groupName)}
        </td>
        <td class="bs-table-cell bs-num bs-group-total"></td>
        <td class="bs-table-cell bs-num bs-group-total ${dividerClass}">${formatINR(rowObj.currentAmount)}</td>
      `;
    }

    if (rowObj.type === 'group-summary') {
      return `
        <td class="bs-table-cell col-prev bs-num" style="font-weight:700; ${prevStyle}">${formatINR(rowObj.prevAmount)}</td>
        <td class="bs-table-cell" style="font-weight:800; color:#0a3880;">
          ${escHtml(rowObj.groupName)}
        </td>
        <td class="bs-table-cell bs-num"></td>
        <td class="bs-table-cell bs-num ${dividerClass}" style="font-weight:800;">${formatINR(rowObj.currentAmount)}</td>
      `;
    }

    return '';
  }

  // ── 5. TOGGLE HANDLERS ──────────────────────────────────────────────────
  window.toggleComparePrevYear = function () {
    renderBalanceSheetView();
  };

  window.toggleMemberBreakup = async function () {
    const chk = document.getElementById('chk-member-breakup');
    if (chk && chk.checked && (!currentBSReport.memberDues || currentBSReport.memberDues.length === 0)) {
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

  // ── 7. EXCEL EXPORT ENGINE (Statutory Dual T-Column) ─────────────────────
  window.exportToExcel = function () {
    if (!currentBSReport) {
      alert('Please wait for the Balance Sheet to load before exporting.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading. Please try again in a few seconds.');
      return;
    }

    const soc = currentBSReport.society || {};
    const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const asOnDateDisplay = currentBSReport.asOnDateDisplay || currentBSReport.asOnDate;
    const prevDateDisplay = (currentBSReport.prevFY && currentBSReport.prevFY.asOnDateDisplay) ? currentBSReport.prevFY.asOnDateDisplay : 'Previous FY';

    const wsData = [];

    // Header Rows
    wsData.push([socName]);
    wsData.push([`Registration No: ${soc.registrationNo || '—'} | Address: ${soc.address || ''} ${soc.city || ''}`.trim()]);
    wsData.push([`Balance Sheet As On ${asOnDateDisplay}`]);
    wsData.push([]); // blank separator

    // Super Header
    wsData.push(['LIABILITIES', '', '', '', 'ASSETS', '', '', '']);

    // Column Headers
    wsData.push([
      `As on ${prevDateDisplay} (₹)`,
      'Liabilities & Capital Funds',
      'Amount (₹)',
      'Total (₹)',
      `As on ${prevDateDisplay} (₹)`,
      'Property & Assets',
      'Amount (₹)',
      'Total (₹)'
    ]);

    const showMemberBreakup = document.getElementById('chk-member-breakup')?.checked;
    const hideZero = document.getElementById('chk-hide-zero')?.checked;
    const viewMode = document.getElementById('bs-view-mode')?.value || 'detailed';

    const leftRows = buildSideRows(currentBSReport.liabilities || [], 'liab', viewMode, hideZero, false);
    const rightRows = buildSideRows(currentBSReport.assets || [], 'asset', viewMode, hideZero, showMemberBreakup, currentBSReport.memberDues || []);
    const maxRows = Math.max(leftRows.length, rightRows.length);

    for (let i = 0; i < maxRows; i++) {
      const l = leftRows[i] || null;
      const r = rightRows[i] || null;

      const lPrev = l ? (l.prevAmount ? parseFloat(l.prevAmount) : '') : '';
      const lName = l ? (l.groupName || (l.accCode ? `[${l.accCode}] ${l.accName}` : l.accName) || '') : '';
      const lAmt  = l ? (l.type === 'account' ? parseFloat(l.currentAmount) : '') : '';
      const lTot  = l ? ((l.type === 'group-total' || l.type === 'group-summary') ? parseFloat(l.currentAmount) : '') : '';

      const rPrev = r ? (r.prevAmount ? parseFloat(r.prevAmount) : '') : '';
      const rName = r ? (r.type === 'member-dues-item' ? `  • [${r.flatDisplay}] ${r.memName}` : (r.groupName || (r.accCode ? `[${r.accCode}] ${r.accName}` : r.accName) || '')) : '';
      const rAmt  = r ? ((r.type === 'account' || r.type === 'member-dues-item') ? parseFloat(r.currentAmount || r.dueAmount) : '') : '';
      const rTot  = r ? ((r.type === 'group-total' || r.type === 'group-summary') ? parseFloat(r.currentAmount) : '') : '';

      wsData.push([lPrev, lName, lAmt, lTot, rPrev, rName, rAmt, rTot]);
    }

    // Grand Total Row
    const totals = currentBSReport.totals || {};
    wsData.push([]);
    wsData.push([
      parseFloat(totals.prevLiabilities) || 0,
      'TOTAL LIABILITIES',
      '',
      parseFloat(totals.currentLiabilities) || 0,
      parseFloat(totals.prevAssets) || 0,
      'TOTAL ASSETS',
      '',
      parseFloat(totals.currentAssets) || 0
    ]);

    // Create Worksheet & Set Column Widths
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 16 }, // Prev Liab
      { wch: 38 }, // Liab Particulars
      { wch: 15 }, // Inner Liab Amt
      { wch: 16 }, // Outer Liab Tot
      { wch: 16 }, // Prev Asset
      { wch: 38 }, // Asset Particulars
      { wch: 15 }, // Inner Asset Amt
      { wch: 16 }  // Outer Asset Tot
    ];

    // Merges for headers
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // Soc Name
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }, // Sub
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } }, // Title
      { s: { r: 4, c: 0 }, e: { r: 4, c: 3 } }, // Super Header Liabilities
      { s: { r: 4, c: 4 }, e: { r: 4, c: 7 } }  // Super Header Assets
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');

    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const dateStr = (currentBSReport.asOnDate || '31-03').replace(/[^0-9-]/g, '');
    XLSX.writeFile(wb, `${cleanSoc}_Balance_Sheet_${dateStr}.xlsx`);
  };

})();
