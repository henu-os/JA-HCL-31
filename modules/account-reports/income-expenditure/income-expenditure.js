/**
 * income-expenditure.js — Jeevika ERP v2
 * Statutory Indian Co-operative Housing Society "Form N" T-Format Income & Expenditure Engine
 * Real-Time PostgreSQL API Integration, Dual-Column Grid, Excel Export, Print Engine
 */

(function () {
  'use strict';

  let currentIEReport = null;

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
    await loadIEData();
  });

  function initDateBounds() {
    const fromInp = document.getElementById('ie-from-date');
    const toInp = document.getElementById('ie-to-date');
    if (!fromInp || !toInp) return;

    let fyStart = '';
    let fyEnd = '';

    if (typeof getFYDateRange === 'function') {
      const range = getFYDateRange();
      if (range && range.fyStart && range.fyEnd) {
        fyStart = range.fyStart;
        fyEnd = range.fyEnd;
      }
    }

    if (!fyStart || !fyEnd) {
      fyStart = sessionStorage.getItem('activeFYStart') || localStorage.getItem('activeFYStart') || '';
      fyEnd = sessionStorage.getItem('activeFYEnd') || localStorage.getItem('activeFYEnd') || '';
    }

    if (!fyStart || !fyEnd) {
      const fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2026-27');
      const parts = fyLabel.split('-');
      let sYear = parseInt(parts[0], 10) || 2026;
      if (sYear < 2000) sYear += 2000;
      fyStart = `${sYear}-04-01`;
      fyEnd = `${sYear + 1}-03-31`;
    }

    fromInp.value = fyStart;
    toInp.value = fyEnd;
  }

  // ── 2. DATA FETCHING ────────────────────────────────────────────────────
  window.loadIEData = async function () {
    const societyId = (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || '1');
    const fyId = (window.Auth && Auth.getFYId) ? Auth.getFYId() : (sessionStorage.getItem('activeFYId') || '1');
    const fromInp = document.getElementById('ie-from-date');
    const toInp = document.getElementById('ie-to-date');
    const fromDate = fromInp ? fromInp.value : '';
    const toDate = toInp ? toInp.value : '';
    const comparePrev = 'true';

    const tbody = document.getElementById('ieTBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin"></i> Generating Statutory Income &amp; Expenditure Statement...
          </td>
        </tr>`;
    }

    try {
      const url = `/api/reports/income-expenditure?societyId=${societyId}&fyId=${fyId}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&comparePrevFY=${comparePrev}`;
      const res = await API.get(url);

      if (res && res.success) {
        currentIEReport = res;
        renderHeaderInfo(res);
        renderIEView();
      } else {
        showError((res && res.message) ? res.message : 'Failed to generate Income & Expenditure Statement.');
      }
    } catch (err) {
      console.error('Income & Expenditure API error:', err);
      showError(err.message || 'Error connecting to accounting report server.');
    }
  };

  function showError(msg) {
    const tbody = document.getElementById('ieTBody');
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
    const periodEl = document.getElementById('disp-period');

    const activeSocName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    if (nameEl) nameEl.textContent = activeSocName;

    let subParts = [];
    if (soc.registrationNo) subParts.push(`Registration No: ${soc.registrationNo}`);
    if (soc.city || soc.address) subParts.push(`Address: ${[soc.address, soc.city].filter(Boolean).join(', ')}`);
    if (subEl) subEl.textContent = subParts.join(' | ') || 'Statutory Financial Statement';

    function toDDMMYYYY(val) {
      if (!val) return '';
      const str = String(val).split('T')[0].trim();
      if (str.includes('-')) {
        const parts = str.split('-');
        if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return str.replace(/-/g, '/');
    }

    const p = data.period || {};
    const curFromStr = toDDMMYYYY(p.fromDate || p.fromDisplay);
    const curToStr = toDDMMYYYY(p.toDate || p.toDisplay);

    if (periodEl) {
      periodEl.textContent = `${curFromStr || ''} To ${curToStr || ''}`;
    }

    const curDateText = curToStr ? `${curToStr}<br>Amount(Rs.)` : 'Current Year<br>Amount(Rs.)';

    const prevToDate = (data.prevPeriod && (data.prevPeriod.toDate || data.prevPeriod.toDisplay || data.prevPeriod.fyEnd)) || '';
    let prevDateText = prevToDate ? `${toDDMMYYYY(prevToDate)}<br>Amount(Rs.)` : '';
    if (!prevDateText && data.prevPeriod && data.prevPeriod.fyLabel) {
      prevDateText = `${data.prevPeriod.fyLabel}<br>Amount(Rs.)`;
    }
    if (!prevDateText) prevDateText = 'Prev Year<br>Amount(Rs.)';

    const thPrevE = document.getElementById('th-prev-exp');
    const thPrevI = document.getElementById('th-prev-inc');
    const thCurE = document.getElementById('th-cur-exp');
    const thCurI = document.getElementById('th-cur-inc');

    if (thPrevE) thPrevE.innerHTML = prevDateText;
    if (thPrevI) thPrevI.innerHTML = prevDateText;
    if (thCurE) thCurE.innerHTML = curDateText;
    if (thCurI) thCurI.innerHTML = curDateText;

    // Print Masthead Elements (repeated in thead for PDF/Print)
    const printNameEl = document.getElementById('print-disp-soc-name');
    if (printNameEl) printNameEl.textContent = activeSocName;

    const printSubEl = document.getElementById('print-disp-soc-sub');
    if (printSubEl) {
      printSubEl.textContent = soc.registrationNo ? `Registration No. : ${soc.registrationNo}` : '';
    }

    const printTitleEl = document.getElementById('print-disp-title');
    if (printTitleEl) {
      if (curFromStr && curToStr) {
        printTitleEl.textContent = `Income & Expenditure Statement For The Period ${curFromStr} To ${curToStr}`;
      } else if (curToStr) {
        printTitleEl.textContent = `Income & Expenditure Statement For The Year Ended ${curToStr}`;
      } else {
        printTitleEl.textContent = 'Income & Expenditure Statement';
      }
    }

    // Print Signatory Society Name
    const signSocEl = document.getElementById('ieSignSocName');
    if (signSocEl) {
      signSocEl.textContent = `For ${activeSocName}`;
    }
  }

  // ── 4. T-FORMAT SIDE-BY-SIDE RENDERER ────────────────────────────────────
  window.renderIEView = function () {
    if (!currentIEReport) return;

    const viewMode = document.getElementById('ie-view-mode')?.value || 'detailed';
    const comparePrev = true;
    const showVoucherNo = document.getElementById('chk-voucher-no') ? document.getElementById('chk-voucher-no').checked : true;
    const hideZero = true;

    // Sync visibility of previous year columns (statutory requirement: always visible)
    document.querySelectorAll('.col-prev').forEach(el => {
      el.style.display = '';
    });

    // 1. Build Aligned Left (Expenditure) and Right (Income) Rows
    const { leftRows, rightRows, maxRows } = buildAlignedSides(currentIEReport, viewMode, hideZero);

    const tbody = document.getElementById('ieTBody');
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
    const totals = currentIEReport.totals || {};
    const footCurE = document.getElementById('foot-tot-cur-exp');
    const footCurI = document.getElementById('foot-tot-cur-inc');
    const footPrevE = document.getElementById('foot-tot-prev-exp');
    const footPrevI = document.getElementById('foot-tot-prev-inc');

    if (footCurE) footCurE.textContent = formatINR(totals.grandTotalCurrent);
    if (footCurI) footCurI.textContent = formatINR(totals.grandTotalCurrent);
    if (footPrevE) footPrevE.textContent = formatINR(totals.grandTotalPrev);
    if (footPrevI) footPrevI.textContent = formatINR(totals.grandTotalPrev);
  };

  /**
   * Aligns Expenditure and Income side rows such that any Surplus or Deficit balancing
   * row is placed strictly at the VERY BOTTOM (last row before totals), with empty filler
   * rows appearing above it on the shorter side.
   */
  function buildAlignedSides(report, viewMode, hideZero) {
    const sd = report.surplusDeficit || {};
    const leftBase = buildSideRows(report.expenditure || [], 'exp', viewMode, hideZero);
    const rightBase = buildSideRows(report.income || [], 'inc', viewMode, hideZero);

    let surplusDeficitRow = null;
    let targetSide = null; // 'exp' (left) or 'inc' (right)

    if (sd.isSurplus && Math.abs(sd.netAmount) > 0.005) {
      targetSide = 'exp';
      surplusDeficitRow = {
        type: 'surplus-deficit',
        label: 'To Excess of Income over Expenditure (Surplus carried to Balance Sheet)',
        prevAmount: sd.prevNetAmount > 0 ? sd.prevNetAmount : 0,
        currentAmount: sd.netAmount
      };
    } else if (!sd.isSurplus && Math.abs(sd.netAmount) > 0.005) {
      targetSide = 'inc';
      surplusDeficitRow = {
        type: 'surplus-deficit',
        label: 'By Excess of Expenditure over Income (Deficit carried to Balance Sheet)',
        prevAmount: sd.prevNetAmount < 0 ? Math.abs(sd.prevNetAmount) : 0,
        currentAmount: Math.abs(sd.netAmount)
      };
    }

    let maxRows = Math.max(leftBase.length, rightBase.length);
    if (targetSide === 'exp') {
      maxRows = Math.max(leftBase.length + 1, rightBase.length);
    } else if (targetSide === 'inc') {
      maxRows = Math.max(leftBase.length, rightBase.length + 1);
    }

    const leftRows = new Array(maxRows).fill(null);
    const rightRows = new Array(maxRows).fill(null);

    // Populate base rows
    for (let i = 0; i < leftBase.length; i++) {
      leftRows[i] = leftBase[i];
    }
    for (let i = 0; i < rightBase.length; i++) {
      rightRows[i] = rightBase[i];
    }

    // Place surplus/deficit row at the VERY BOTTOM (index maxRows - 1)
    if (surplusDeficitRow) {
      if (targetSide === 'exp') {
        leftRows[maxRows - 1] = surplusDeficitRow;
      } else if (targetSide === 'inc') {
        rightRows[maxRows - 1] = surplusDeficitRow;
      }
    }

    return { leftRows, rightRows, maxRows };
  }

  /**
   * Builds an array of row objects for either Expenditure or Income adhering to Pranav I&E layout.
   * Eliminates redundant "TOTAL <CATEGORY>" rows and formats single vs multi-item groups cleanly.
   */
  function buildSideRows(groups, sideType, viewMode, hideZero) {
    const rows = [];

    groups.forEach(g => {
      const accounts = g.accounts || [];

      // Filter zero balance accounts if requested, and filter out placeholder balancing ledgers
      const filteredAccounts = accounts.filter(a => {
        const code = (a.accCode || '').toLowerCase().trim();
        const name = (a.accName || '').toLowerCase().trim();
        const isBalancingPlaceholder = code === 'inc-1999' || code === 'exp-1999' ||
          name.includes('excess of expenditure over income') ||
          name.includes('excess of income over expenditure');
        if (isBalancingPlaceholder) return false;

        if (hideZero) {
          return Math.abs(a.currentAmount) > 0.005 || Math.abs(a.prevAmount) > 0.005;
        }
        return true;
      });

      if (hideZero && filteredAccounts.length === 0 && Math.abs(g.totalCurrent) < 0.005 && Math.abs(g.totalPrev) < 0.005) {
        return; // Skip empty group in hideZero mode
      }

      // Preserve full group title with numbering intact (e.g. "1.Establishment Expenses", "2.Administrative Charges")
      const groupTitle = (g.groupName || '').trim();

      if (viewMode === 'summary' && !g.grpSubtotal) {
        // In summary mode: single summary line
        rows.push({
          type: 'group-summary',
          groupName: groupTitle,
          prevAmount: g.totalPrev,
          currentAmount: g.totalCurrent
        });
        return;
      }

      // 1. Group Header Row
      rows.push({
        type: 'group-header',
        groupName: groupTitle,
        groupCode: g.groupCode || ''
      });

      // 2. Regular Accounts in Group
      const accCount = filteredAccounts.length;
      if (accCount === 1) {
        // Single-account group: direct outer column placement (Col D / Col H)
        const acc = filteredAccounts[0];
        rows.push({
          type: 'account-direct',
          accCode: acc.accCode || '',
          accName: acc.accName || '',
          prevAmount: acc.prevAmount || g.totalPrev || 0,
          currentAmount: acc.currentAmount || g.totalCurrent || 0
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
            isLast: isLast
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
   * Renders the 4 HTML table cells for either the Left (Expenditure) or Right (Income) side.
   * Matches statutory Form N table structure with clean ruled accounting lines.
   */
  function renderHalfRowCells(rowObj, side, comparePrev, showVoucherNo = true) {
    const isLeft = (side === 'left');
    const dividerClass = isLeft ? 'ie-side-divider' : '';
    const prevStyle = comparePrev ? '' : 'display:none;';

    if (!rowObj) {
      return `
        <td class="ie-table-cell col-prev ie-num" style="${prevStyle}">&nbsp;</td>
        <td class="ie-table-cell ie-acc-row">&nbsp;</td>
        <td class="ie-table-cell ie-num ie-inner-amt">&nbsp;</td>
        <td class="ie-table-cell ie-num ${dividerClass}">&nbsp;</td>
      `;
    }

    if (rowObj.type === 'group-header') {
      return `
        <td class="ie-table-cell col-prev ie-num" style="${prevStyle}">&nbsp;</td>
        <td class="ie-table-cell ie-group-header-cell" colspan="2" style="font-weight:800; background:#f8fafc;">
          <span class="ie-group-title">${escHtml(rowObj.groupName)}</span>
        </td>
        <td class="ie-table-cell ie-num ${dividerClass}" style="background:#f8fafc;">&nbsp;</td>
      `;
    }

    if (rowObj.type === 'account-direct') {
      const codeHtml = (showVoucherNo && rowObj.accCode) ? `<span class="ie-acc-code">[${escHtml(rowObj.accCode)}]</span>` : '';
      return `
        <td class="ie-table-cell col-prev ie-num text-muted" style="${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="ie-table-cell ie-acc-row">
          ${codeHtml}${escHtml(rowObj.accName)}
        </td>
        <td class="ie-table-cell ie-num ie-inner-amt">&nbsp;</td>
        <td class="ie-table-cell ie-num ie-cell-subtotal-outer ${dividerClass}">${formatINR(rowObj.currentAmount, true)}</td>
      `;
    }

    if (rowObj.type === 'account-multi') {
      const codeHtml = (showVoucherNo && rowObj.accCode) ? `<span class="ie-acc-code">[${escHtml(rowObj.accCode)}]</span>` : '';
      const outerHtml = rowObj.isLast
        ? `<span class="ie-cell-subtotal-outer">${formatINR(rowObj.outerAmount, true)}</span>`
        : '&nbsp;';
      const outerClass = rowObj.isLast ? 'ie-cell-subtotal-outer' : '';
      return `
        <td class="ie-table-cell col-prev ie-num text-muted" style="${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="ie-table-cell ie-acc-row" style="padding-left:16px;">
          ${codeHtml}${escHtml(rowObj.accName)}
        </td>
        <td class="ie-table-cell ie-num ie-inner-amt">${formatINR(rowObj.currentAmount, true)}</td>
        <td class="ie-table-cell ie-num ${outerClass} ${dividerClass}">${outerHtml}</td>
      `;
    }

    if (rowObj.type === 'group-summary') {
      return `
        <td class="ie-table-cell col-prev ie-num" style="font-weight:700; ${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="ie-table-cell ie-group-summary-cell" colspan="2" style="font-weight:800; color:var(--navy-primary);">
          ${escHtml(rowObj.groupName)}
        </td>
        <td class="ie-table-cell ie-num ie-cell-subtotal-outer ${dividerClass}" style="font-weight:800;">${formatINR(rowObj.currentAmount, true)}</td>
      `;
    }

    if (rowObj.type === 'surplus-deficit') {
      return `
        <td class="ie-table-cell col-prev ie-num ie-surplus-row" style="${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="ie-table-cell ie-surplus-row" colspan="2" style="font-weight:800;">
          ${escHtml(rowObj.label)}
        </td>
        <td class="ie-table-cell ie-num ie-cell-subtotal-outer ie-surplus-row ${dividerClass}" style="font-weight:800;">${formatINR(rowObj.currentAmount, true)}</td>
      `;
    }

    return '';
  }

  // ── 5. TOGGLE HANDLERS ──────────────────────────────────────────────────
  window.toggleComparePrevYear = function () {
    renderIEView();
  };

  window.toggleVoucherNo = function () {
    renderIEView();
  };

  // ── 6. PRINT ENGINE ─────────────────────────────────────────────────────
  window.printReport = function () {
    const socName = (currentIEReport && currentIEReport.society) ? currentIEReport.society.societyName : 'Income_Expenditure';
    const period = (currentIEReport && currentIEReport.period) ? currentIEReport.period.toDate : '';
    const origTitle = document.title;
    document.title = `${socName}_Income_Expenditure_${period}`.replace(/\s+/g, '_');
    window.print();
    setTimeout(() => { document.title = origTitle; }, 1000);
  };

  // ── 7. EXCEL EXPORT ENGINE (Formula-Driven 8-Column Master Blueprint) ──
  window.exportToExcel = function () {
    if (!currentIEReport) {
      alert('Please wait for the Income & Expenditure statement to load before exporting.');
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

    const soc = currentIEReport.society || {};
    const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (soc.societyName || 'Sai Ram Co-op. Housing Society Ltd.');
    const p = currentIEReport.period || {};
    const curFromStr = toDDMMYYYY(p.fromDate || p.fromDisplay);
    const curToStr = toDDMMYYYY(p.toDate || p.toDisplay);
    const periodDisplay = `For The Period ${curFromStr || ''} To ${curToStr || ''}`.trim();
    const statementTitle = curToStr ? `Income & Expenditure Account For The Year Ended ${curToStr}` : (periodDisplay ? `Income & Expenditure Account ${periodDisplay}` : 'Income & Expenditure Account');

    const prevToDate = (currentIEReport.prevPeriod && (currentIEReport.prevPeriod.toDate || currentIEReport.prevPeriod.toDisplay || currentIEReport.prevPeriod.fyEnd)) || '';
    let prevDateHeader = prevToDate ? `${toDDMMYYYY(prevToDate)}\nAmount(Rs.)` : '';
    if (!prevDateHeader && currentIEReport.prevPeriod && currentIEReport.prevPeriod.fyLabel) {
      prevDateHeader = `${currentIEReport.prevPeriod.fyLabel}\nAmount(Rs.)`;
    }
    if (!prevDateHeader) prevDateHeader = '31/03/2025\nAmount(Rs.)';

    const curDateHeader = curToStr ? `${curToStr}\nAmount(Rs.)` : '31/03/2026\nAmount(Rs.)';

    // Styling definitions matching Balance Sheet
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
    setCell(2, 0, statementTitle, 's', {
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
    setCell(hRow, 1, 'Expenditure', 's', {
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
    setCell(hRow, 5, 'Income', 's', {
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
    const hideZero = true;
    const viewMode = document.getElementById('ie-view-mode')?.value || 'detailed';
    const comparePrev = true;
    const showVoucherNo = document.getElementById('chk-voucher-no') ? document.getElementById('chk-voucher-no').checked : true;
    const { leftRows, rightRows, maxRows } = buildAlignedSides(currentIEReport, viewMode, hideZero);

    let curR = 4;
    const expOuterCells = [];
    const incOuterCells = [];
    const expRegularOuterCells = [];
    const incRegularOuterCells = [];
    let expGroupStartRow = curR + 1;
    let incGroupStartRow = curR + 1;

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

      // Populate Left (Expenditure) Columns 0..3
      if (l) {
        if (l.type === 'group-header') {
          expGroupStartRow = curR + 2; // Next row in Excel (1-indexed)
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
          expOuterCells.push(`D${curR + 1}`);
          expRegularOuterCells.push(`D${curR + 1}`);
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
            const sumFormula = `SUM(C${expGroupStartRow}:C${curR + 1})`;
            setCell(curR, 3, parseFloat(l.outerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(3, undefined, thinBorder)
            }, '#,##0.00', sumFormula);
            expOuterCells.push(`D${curR + 1}`);
            expRegularOuterCells.push(`D${curR + 1}`);
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
          expOuterCells.push(`D${curR + 1}`);
          expRegularOuterCells.push(`D${curR + 1}`);
        } else if (l.type === 'surplus-deficit') {
          const expSumRef = expRegularOuterCells.length > 0 ? `SUM(${expRegularOuterCells.join(',')})` : '0';
          const incSumRef = incRegularOuterCells.length > 0 ? `SUM(${incRegularOuterCells.join(',')})` : '0';
          const surplusFormula = `MAX(0, ${incSumRef} - ${expSumRef})`;
          setCell(curR, 1, l.label || '', 's', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(1)
          });
          if (comparePrev && l.prevAmount) {
            setCell(curR, 0, parseFloat(l.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(0)
            }, '#,##0.00');
          }
          setCell(curR, 3, parseFloat(l.currentAmount) || 0, 'n', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(3, undefined, thinBorder)
          }, '#,##0.00', surplusFormula);
          expOuterCells.push(`D${curR + 1}`);
        }
      }

      // Populate Right (Income) Columns 4..7
      if (rData) {
        if (rData.type === 'group-header') {
          incGroupStartRow = curR + 2; // Next row in Excel (1-indexed)
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
          incOuterCells.push(`H${curR + 1}`);
          incRegularOuterCells.push(`H${curR + 1}`);
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
            const sumFormula = `SUM(G${incGroupStartRow}:G${curR + 1})`;
            setCell(curR, 7, parseFloat(rData.outerAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(7, undefined, thinBorder)
            }, '#,##0.00', sumFormula);
            incOuterCells.push(`H${curR + 1}`);
            incRegularOuterCells.push(`H${curR + 1}`);
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
          incOuterCells.push(`H${curR + 1}`);
          incRegularOuterCells.push(`H${curR + 1}`);
        } else if (rData.type === 'surplus-deficit') {
          const expSumRef = expRegularOuterCells.length > 0 ? `SUM(${expRegularOuterCells.join(',')})` : '0';
          const incSumRef = incRegularOuterCells.length > 0 ? `SUM(${incRegularOuterCells.join(',')})` : '0';
          const deficitFormula = `MAX(0, ${expSumRef} - ${incSumRef})`;
          setCell(curR, 5, rData.label || '', 's', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: getBorders(5)
          });
          if (comparePrev && rData.prevAmount) {
            setCell(curR, 4, parseFloat(rData.prevAmount) || 0, 'n', {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: getBorders(4)
            }, '#,##0.00');
          }
          setCell(curR, 7, parseFloat(rData.currentAmount) || 0, 'n', {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: getBorders(7, undefined, thinBorder)
          }, '#,##0.00', deficitFormula);
          incOuterCells.push(`H${curR + 1}`);
        }
      }

      curR++;
    }

    // Grand Total Row
    const totals = currentIEReport.totals || {};
    const rTotal = curR;

    for (let c = 0; c < 8; c++) {
      setCell(rTotal, c, '', 's', {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
        alignment: { vertical: 'center' },
        border: getBorders(c, thinBorder, doubleBorder)
      });
    }

    // Col A: Prev Expenditure Grand Total
    if (comparePrev) {
      setCell(rTotal, 0, parseFloat(totals.grandTotalPrev) || 0, 'n', {
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

    // Col D: Current Expenditure Grand Total Formula
    const expTotFormula = expOuterCells.length > 0 ? `SUM(${expOuterCells.join(',')})` : undefined;
    setCell(rTotal, 3, parseFloat(totals.grandTotalCurrent) || 0, 'n', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getBorders(3, thinBorder, doubleBorder)
    }, '#,##0.00', expTotFormula);

    // Col E: Prev Income Grand Total
    if (comparePrev) {
      setCell(rTotal, 4, parseFloat(totals.grandTotalPrev) || 0, 'n', {
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

    // Col H: Current Income Grand Total Formula
    const incTotFormula = incOuterCells.length > 0 ? `SUM(${incOuterCells.join(',')})` : undefined;
    setCell(rTotal, 7, parseFloat(totals.grandTotalCurrent) || 0, 'n', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getBorders(7, thinBorder, doubleBorder)
    }, '#,##0.00', incTotFormula);

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
    merges.push({ s: { r: rBoxes, c: 0 }, e: { r: rBoxes, c: 3 } });

    // Set Range
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rBoxes + 1, c: 7 } });

    // Merges
    ws['!merges'] = merges;

    // Column Widths
    ws['!cols'] = [
      { wch: 18 }, // Col A: Prev Exp
      { wch: 42 }, // Col B: Expenditure Particulars
      { wch: 15 }, // Col C: Inner Amount
      { wch: 18 }, // Col D: Current Exp Total
      { wch: 18 }, // Col E: Prev Income
      { wch: 42 }, // Col F: Income Particulars
      { wch: 15 }, // Col G: Inner Amount
      { wch: 18 }  // Col H: Current Income Total
    ];

    // Row Heights
    ws['!rows'] = [
      { hpt: 24 }, // Soc Name
      { hpt: 18 }, // Reg & Addr
      { hpt: 20 }, // Title
      { hpt: 28 }  // Header row
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Income & Expenditure');

    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const dateStr = (p.toDate || '31-03').replace(/[^0-9-]/g, '');
    XLSX.writeFile(wb, `${cleanSoc}_Income_Expenditure_${dateStr}.xlsx`);
  };

})();
