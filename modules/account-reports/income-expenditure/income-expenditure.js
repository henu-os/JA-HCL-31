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
    const comparePrev = document.getElementById('chk-compare-prev')?.checked ? 'true' : 'false';

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
    const signSocEl = document.getElementById('disp-sign-soc-name');

    const activeSocName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    if (nameEl) nameEl.textContent = activeSocName;
    if (signSocEl) signSocEl.textContent = activeSocName;

    let subParts = [];
    if (soc.registrationNo) subParts.push(`Registration No: ${soc.registrationNo}`);
    if (soc.city || soc.address) subParts.push(`Address: ${[soc.address, soc.city].filter(Boolean).join(', ')}`);
    if (subEl) subEl.textContent = subParts.join(' | ') || 'Statutory Financial Statement';

    if (periodEl) {
      const p = data.period || {};
      periodEl.textContent = `${p.fromDisplay || p.fromDate || ''} To ${p.toDisplay || p.toDate || ''}`;
    }

    // Previous year column headers
    const thPrevE = document.getElementById('th-prev-exp');
    const thPrevI = document.getElementById('th-prev-inc');
    const prevText = (data.prevPeriod && data.prevPeriod.fyLabel)
      ? `${data.prevPeriod.fyLabel} Amount (₹)`
      : 'Prev Year (₹)';

    if (thPrevE) thPrevE.textContent = prevText;
    if (thPrevI) thPrevI.textContent = prevText;
  }

  // ── 4. T-FORMAT SIDE-BY-SIDE RENDERER ────────────────────────────────────
  window.renderIEView = function () {
    if (!currentIEReport) return;

    const viewMode = document.getElementById('ie-view-mode')?.value || 'detailed';
    const comparePrev = document.getElementById('chk-compare-prev')?.checked;
    const hideZero = document.getElementById('chk-hide-zero')?.checked;

    // Sync visibility of previous year columns
    document.querySelectorAll('.col-prev').forEach(el => {
      el.style.display = comparePrev ? '' : 'none';
    });

    const sd = currentIEReport.surplusDeficit || {};

    // 1. Build Left Side (Expenditure) Rows
    const leftRows = buildSideRows(currentIEReport.expenditure || [], 'exp', viewMode, hideZero, sd);

    // 2. Build Right Side (Income) Rows
    const rightRows = buildSideRows(currentIEReport.income || [], 'inc', viewMode, hideZero, sd);

    // 3. Align heights so both sides are completely equal
    const maxRows = Math.max(leftRows.length, rightRows.length);
    const tbody = document.getElementById('ieTBody');
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
   * Builds an array of row objects for either Expenditure or Income.
   */
  function buildSideRows(groups, sideType, viewMode, hideZero, sd) {
    const rows = [];
    let groupIndex = 1;

    groups.forEach(g => {
      const accounts = g.accounts || [];

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
            currentAmount: acc.currentAmount || 0
          });
        });

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

    // ── Append Surplus or Deficit Balancing Row ─────────────────────────────
    // If Net Surplus (Income > Expenditure): append to Expenditure side
    if (sideType === 'exp' && sd.isSurplus && Math.abs(sd.netAmount) > 0.005) {
      rows.push({
        type: 'surplus-deficit',
        label: 'Excess of Income over Expenditure A/c (Surplus)',
        prevAmount: sd.prevNetAmount > 0 ? sd.prevNetAmount : 0,
        currentAmount: sd.netAmount
      });
    }
    // If Net Deficit (Expenditure > Income): append to Income side
    else if (sideType === 'inc' && !sd.isSurplus && Math.abs(sd.netAmount) > 0.005) {
      rows.push({
        type: 'surplus-deficit',
        label: 'Excess of Expenditure over Income A/c (Deficit)',
        prevAmount: sd.prevNetAmount < 0 ? Math.abs(sd.prevNetAmount) : 0,
        currentAmount: Math.abs(sd.netAmount)
      });
    }

    return rows;
  }

  /**
   * Renders the 4 HTML table cells for either the Left (Expenditure) or Right (Income) side.
   */
  function renderHalfRowCells(rowObj, side, comparePrev) {
    const isLeft = (side === 'left');
    const dividerClass = isLeft ? 'ie-side-divider' : '';
    const prevStyle = comparePrev ? '' : 'display:none;';

    if (!rowObj) {
      return `
        <td class="ie-table-cell col-prev ie-num" style="${prevStyle}">&nbsp;</td>
        <td class="ie-table-cell">&nbsp;</td>
        <td class="ie-table-cell ie-num">&nbsp;</td>
        <td class="ie-table-cell ie-num ${dividerClass}">&nbsp;</td>
      `;
    }

    if (rowObj.type === 'spacer') {
      return `
        <td class="ie-table-cell col-prev" style="${prevStyle}">&nbsp;</td>
        <td class="ie-table-cell" style="height:12px;">&nbsp;</td>
        <td class="ie-table-cell">&nbsp;</td>
        <td class="ie-table-cell ${dividerClass}">&nbsp;</td>
      `;
    }

    if (rowObj.type === 'group-header') {
      return `
        <td class="ie-table-cell col-prev ie-num text-muted" style="${prevStyle}"></td>
        <td class="ie-table-cell" style="font-weight:800; color:#0a3880; background:#f8fafc;">
          <span class="ie-group-title">${escHtml(rowObj.groupName)}</span>
        </td>
        <td class="ie-table-cell ie-num" style="background:#f8fafc;"></td>
        <td class="ie-table-cell ie-num ${dividerClass}" style="background:#f8fafc;"></td>
      `;
    }

    if (rowObj.type === 'account') {
      const codeHtml = rowObj.accCode ? `<span class="ie-acc-code">[${escHtml(rowObj.accCode)}]</span>` : '';
      return `
        <td class="ie-table-cell col-prev ie-num text-muted" style="${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="ie-table-cell" style="padding-left:18px;">
          ${codeHtml}${escHtml(rowObj.accName)}
        </td>
        <td class="ie-table-cell ie-num">${formatINR(rowObj.currentAmount, true)}</td>
        <td class="ie-table-cell ie-num ${dividerClass}"></td>
      `;
    }

    if (rowObj.type === 'group-total') {
      return `
        <td class="ie-table-cell col-prev ie-num ie-group-total" style="${prevStyle}">${formatINR(rowObj.prevAmount)}</td>
        <td class="ie-table-cell ie-group-total" style="text-align:right; font-size:10.5px; text-transform:uppercase; color:#475569;">
          ${escHtml(rowObj.groupName)}
        </td>
        <td class="ie-table-cell ie-num ie-group-total"></td>
        <td class="ie-table-cell ie-num ie-group-total ${dividerClass}">${formatINR(rowObj.currentAmount)}</td>
      `;
    }

    if (rowObj.type === 'group-summary') {
      return `
        <td class="ie-table-cell col-prev ie-num" style="font-weight:700; ${prevStyle}">${formatINR(rowObj.prevAmount)}</td>
        <td class="ie-table-cell" style="font-weight:800; color:#0a3880;">
          ${escHtml(rowObj.groupName)}
        </td>
        <td class="ie-table-cell ie-num"></td>
        <td class="ie-table-cell ie-num ${dividerClass}" style="font-weight:800;">${formatINR(rowObj.currentAmount)}</td>
      `;
    }

    if (rowObj.type === 'surplus-deficit') {
      return `
        <td class="ie-table-cell col-prev ie-num ie-surplus-row" style="${prevStyle}">${formatINR(rowObj.prevAmount, true)}</td>
        <td class="ie-table-cell ie-surplus-row" style="font-weight:800;">
          <i class="bi bi-patch-check-fill" style="margin-right:4px;"></i> ${escHtml(rowObj.label)}
        </td>
        <td class="ie-table-cell ie-num ie-surplus-row"></td>
        <td class="ie-table-cell ie-num ie-surplus-row ${dividerClass}">${formatINR(rowObj.currentAmount)}</td>
      `;
    }

    return '';
  }

  // ── 5. TOGGLE HANDLERS ──────────────────────────────────────────────────
  window.toggleComparePrevYear = function () {
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

  // ── 7. EXCEL EXPORT ENGINE (Statutory Dual T-Column) ─────────────────────
  window.exportToExcel = function () {
    if (!currentIEReport) {
      alert('Please wait for the Income & Expenditure statement to load before exporting.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading. Please try again in a few seconds.');
      return;
    }

    const soc = currentIEReport.society || {};
    const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const p = currentIEReport.period || {};
    const periodDisplay = `${p.fromDisplay || p.fromDate || ''} To ${p.toDisplay || p.toDate || ''}`;
    const prevDateDisplay = (currentIEReport.prevPeriod && currentIEReport.prevPeriod.fyLabel) ? currentIEReport.prevPeriod.fyLabel : 'Previous FY';

    const wsData = [];

    // Header Rows
    wsData.push([socName]);
    wsData.push([`Registration No: ${soc.registrationNo || '—'} | Address: ${soc.address || ''} ${soc.city || ''}`.trim()]);
    wsData.push([`Income & Expenditure Statement For The Period ${periodDisplay}`]);
    wsData.push([]); // blank separator

    // Super Header
    wsData.push(['EXPENDITURE', '', '', '', 'INCOME', '', '', '']);

    // Column Headers
    wsData.push([
      `Prev Year (${prevDateDisplay}) (₹)`,
      'Expenditure Particulars',
      'Amount (₹)',
      'Total (₹)',
      `Prev Year (${prevDateDisplay}) (₹)`,
      'Income Particulars',
      'Amount (₹)',
      'Total (₹)'
    ]);

    const hideZero = document.getElementById('chk-hide-zero')?.checked;
    const viewMode = document.getElementById('ie-view-mode')?.value || 'detailed';
    const sd = currentIEReport.surplusDeficit || {};

    const leftRows = buildSideRows(currentIEReport.expenditure || [], 'exp', viewMode, hideZero, sd);
    const rightRows = buildSideRows(currentIEReport.income || [], 'inc', viewMode, hideZero, sd);
    const maxRows = Math.max(leftRows.length, rightRows.length);

    for (let i = 0; i < maxRows; i++) {
      const l = leftRows[i] || null;
      const r = rightRows[i] || null;

      const lPrev = l ? (l.prevAmount ? parseFloat(l.prevAmount) : '') : '';
      const lName = l ? (l.groupName || (l.accCode ? `[${l.accCode}] ${l.accName}` : l.accName) || l.label || '') : '';
      const lAmt  = l ? (l.type === 'account' ? parseFloat(l.currentAmount) : '') : '';
      const lTot  = l ? ((l.type === 'group-total' || l.type === 'group-summary' || l.type === 'surplus-deficit') ? parseFloat(l.currentAmount) : '') : '';

      const rPrev = r ? (r.prevAmount ? parseFloat(r.prevAmount) : '') : '';
      const rName = r ? (r.groupName || (r.accCode ? `[${r.accCode}] ${r.accName}` : r.accName) || r.label || '') : '';
      const rAmt  = r ? (r.type === 'account' ? parseFloat(r.currentAmount) : '') : '';
      const rTot  = r ? ((r.type === 'group-total' || r.type === 'group-summary' || r.type === 'surplus-deficit') ? parseFloat(r.currentAmount) : '') : '';

      wsData.push([lPrev, lName, lAmt, lTot, rPrev, rName, rAmt, rTot]);
    }

    // Grand Total Row
    const totals = currentIEReport.totals || {};
    wsData.push([]);
    wsData.push([
      parseFloat(totals.grandTotalPrev) || 0,
      'TOTAL EXPENDITURE',
      '',
      parseFloat(totals.grandTotalCurrent) || 0,
      parseFloat(totals.grandTotalPrev) || 0,
      'TOTAL INCOME',
      '',
      parseFloat(totals.grandTotalCurrent) || 0
    ]);

    // Signatory Section in Excel
    wsData.push([]);
    wsData.push([`For ${socName}`]);
    wsData.push([]);
    wsData.push(['', 'SECRETARY', '', '', '', 'CHAIRMAN', '', 'TREASURER']);

    // Create Worksheet & Set Column Widths
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 16 }, // Prev Exp
      { wch: 38 }, // Exp Particulars
      { wch: 15 }, // Inner Exp Amt
      { wch: 16 }, // Outer Exp Tot
      { wch: 16 }, // Prev Inc
      { wch: 38 }, // Inc Particulars
      { wch: 15 }, // Inner Inc Amt
      { wch: 16 }  // Outer Inc Tot
    ];

    // Merges for headers
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // Soc Name
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }, // Sub
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } }, // Title
      { s: { r: 4, c: 0 }, e: { r: 4, c: 3 } }, // Super Header Expenditure
      { s: { r: 4, c: 4 }, e: { r: 4, c: 7 } }  // Super Header Income
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Income & Expenditure');

    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const dateStr = (p.toDate || '31-03').replace(/[^0-9-]/g, '');
    XLSX.writeFile(wb, `${cleanSoc}_Income_Expenditure_${dateStr}.xlsx`);
  };

})();
