// ═══════════════════════════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Statutory Receipt & Payment Report (T-Format)
// ═══════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  let rawReportData = null;
  let activeSocietyId = 4;
  let activeFYId = 8;

  document.addEventListener('DOMContentLoaded', async () => {
    initContext();
    setupFinancialYearDates();
    await loadRPData();
  });

  function getActiveSocietyId() {
    let id = (window.Auth && Auth.getSocietyId && Auth.getSocietyId() && Auth.getSocietyId() !== '—') ? Auth.getSocietyId() : null;
    if (!id || id === '—') {
      id = sessionStorage.getItem('activeSocietyId') ||
           localStorage.getItem('activeSocietyId') ||
           (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeSocietyId')) ||
           (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeSocietyId')) ||
           (window.parent && window.parent.Auth && window.parent.Auth.getSocietyId && window.parent.Auth.getSocietyId()) ||
           '4';
    }
    return parseInt(id, 10) || 4;
  }

  function getActiveFYId() {
    let fy = (window.Auth && Auth.getFYId && Auth.getFYId() && Auth.getFYId() !== '—') ? Auth.getFYId() : null;
    if (!fy || fy === '—') {
      fy = sessionStorage.getItem('activeFYId') ||
           localStorage.getItem('activeFYId') ||
           (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeFYId')) ||
           (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeFYId')) ||
           (window.parent && window.parent.Auth && window.parent.Auth.getFYId && window.parent.Auth.getFYId()) ||
           '8';
    }
    return parseInt(fy, 10) || 8;
  }

  function initContext() {
    activeSocietyId = getActiveSocietyId();
    activeFYId = getActiveFYId();

    const socName = (window.Auth && Auth.getSocietyName && Auth.getSocietyName() !== '—') ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const dispSoc = document.getElementById('disp-soc-name');
    const dispSign = document.getElementById('disp-sign-soc-name');
    if (dispSoc) dispSoc.textContent = socName.toUpperCase();
    if (dispSign) dispSign.textContent = socName.toUpperCase();
  }

  function setupFinancialYearDates() {
    const fyLabel = (window.Auth && Auth.getFYLabel && Auth.getFYLabel() !== '—') ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2026-27');
    const parts = fyLabel.split('-');
    let startYear = parseInt(parts[0], 10) || 2026;
    if (startYear < 2000) startYear += 2000;
    const endYear = startYear + 1;

    window._fyStartDate = `${startYear}-04-01`;
    window._fyEndDate = `${endYear}-03-31`;

    const fromEl = document.getElementById('rp-from-date');
    const toEl = document.getElementById('rp-to-date');
    if (fromEl) fromEl.value = window._fyStartDate;
    if (toEl) toEl.value = window._fyEndDate;
  }

  window.applyDatePreset = function (preset) {
    const fromEl = document.getElementById('rp-from-date');
    const toEl = document.getElementById('rp-to-date');
    if (!fromEl || !toEl) return;

    const fyStart = new Date(window._fyStartDate);
    const fyEnd = new Date(window._fyEndDate);
    const now = new Date();
    const fmt = d => d.toISOString().split('T')[0];

    if (preset === 'full') {
      fromEl.value = window._fyStartDate;
      toEl.value = window._fyEndDate;
    } else if (preset === 'today') {
      fromEl.value = fmt(now);
      toEl.value = fmt(now);
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
    } else if (preset === 'all') {
      fromEl.value = '2000-04-01';
      toEl.value = '2099-03-31';
    }

    loadRPData();
  };

  window.onDateChange = function () {
    const presetEl = document.getElementById('rp-preset-select');
    if (presetEl) presetEl.value = 'custom';
    loadRPData();
  };

  window.onSearchInput = function () {
    renderRPView();
  };

  function formatINR(val, hideZero = false) {
    const n = parseFloat(val);
    if (isNaN(n) || (hideZero && Math.abs(n) < 0.005)) return '';
    return n.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatCurrency(val) {
    const n = parseFloat(val) || 0;
    return '₹' + n.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  window.loadRPData = async function () {
    activeSocietyId = getActiveSocietyId();
    activeFYId = getActiveFYId();

    const fromDate = document.getElementById('rp-from-date').value || window._fyStartDate;
    const toDate = document.getElementById('rp-to-date').value || window._fyEndDate;

    const tbody = document.getElementById('rpTBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:40px;">
        <i class="bi bi-arrow-repeat spin" style="font-size:22px; color:#0a3880;"></i><br>
        <span style="font-weight:600; margin-top:8px; display:inline-block;">Loading Statutory Receipt &amp; Payment Statement...</span>
      </td></tr>`;
    }

    try {
      let data = null;
      try {
        const url = `/reports/receipt-payment?societyId=${activeSocietyId}&fyId=${activeFYId}&fromDate=${fromDate}&toDate=${toDate}`;
        const res = await API.get(url);
        if (res && res.success) {
          data = res;
        } else if (res && res.data && res.data.success) {
          data = res.data;
        }
      } catch (apiErr) {
        console.warn('API /reports/receipt-payment failed directly, trying absolute URL', apiErr);
        const absRes = await fetch(`http://localhost:5002/api/reports/receipt-payment?societyId=${activeSocietyId}&fyId=${activeFYId}&fromDate=${fromDate}&toDate=${toDate}`);
        data = await absRes.json();
      }

      if (!data || !data.success) {
        throw new Error((data && data.message) || 'Failed to load report data');
      }

      rawReportData = data;

      // Update Society & Header context
      if (data.society) {
        const soc = data.society;
        const dispSoc = document.getElementById('disp-soc-name');
        const dispSub = document.getElementById('disp-soc-sub');
        const dispSign = document.getElementById('disp-sign-soc-name');

        if (dispSoc) dispSoc.textContent = (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.').toUpperCase();
        if (dispSign) dispSign.textContent = (soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.').toUpperCase();
        if (dispSub) dispSub.textContent = `Registration No: ${soc.registrationNo || '—'} | Address: ${soc.address || '—'} ${soc.city ? '(' + soc.city + ')' : ''}`;
      }

      const dispPeriod = document.getElementById('disp-period');
      if (dispPeriod) {
        dispPeriod.textContent = `${data.fromDateDisplay || fromDate} TO ${data.toDateDisplay || toDate}`;
      }

      // Update KPIs
      const kpiOpening = document.getElementById('kpi-opening');
      const kpiReceipts = document.getElementById('kpi-receipts');
      const kpiPayments = document.getElementById('kpi-payments');
      const kpiClosing = document.getElementById('kpi-closing');

      if (kpiOpening) kpiOpening.textContent = formatCurrency(data.totalOpening);
      if (kpiReceipts) kpiReceipts.textContent = formatCurrency(data.totalReceipts);
      if (kpiPayments) kpiPayments.textContent = formatCurrency(data.totalPayments);
      if (kpiClosing) kpiClosing.textContent = formatCurrency(data.totalClosing);

      // Update Reconciliation Banner
      const banner = document.getElementById('recon-banner');
      const badge = document.getElementById('recon-badge');
      const reconText = document.getElementById('recon-text');
      const reconCounts = document.getElementById('recon-counts');

      if (data.isBalanced) {
        if (banner) banner.className = 'rp-recon-banner balanced';
        if (badge) {
          badge.className = 'rp-recon-badge badge-balanced';
          badge.textContent = '✓ BALANCED';
        }
        if (reconText) {
          reconText.textContent = `Double-Entry Validated: Receipts Side (${formatCurrency(data.grandTotalReceiptSide)}) equals Payments Side (${formatCurrency(data.grandTotalPaymentSide)}) | Diff: ₹0.00`;
        }
      } else {
        if (banner) banner.className = 'rp-recon-banner unbalanced';
        if (badge) {
          badge.className = 'rp-recon-badge badge-unbalanced';
          badge.textContent = '⚠ UNBALANCED';
        }
        if (reconText) {
          reconText.textContent = `Reconciliation Difference: ${formatCurrency(data.difference)} (Receipts Side: ${formatCurrency(data.grandTotalReceiptSide)} vs Payments Side: ${formatCurrency(data.grandTotalPaymentSide)})`;
        }
      }

      if (reconCounts) {
        reconCounts.textContent = `${(data.receipts || []).length} Receipt Groups · ${(data.payments || []).length} Payment Groups`;
      }

      renderRPView();

    } catch (err) {
      console.error('Error loading Receipt & Payment report:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding:40px;">
          <i class="bi bi-exclamation-triangle-fill" style="font-size:24px;"></i><br>
          <span style="font-weight:700; margin-top:8px; display:inline-block;">Failed to load Receipt &amp; Payment Report</span><br>
          <small class="text-muted">${err.message || err}</small>
        </td></tr>`;
      }
    }
  };

  window.renderRPView = function () {
    if (!rawReportData) return;

    const data = rawReportData;
    const tbody = document.getElementById('rpTBody');
    if (!tbody) return;

    const viewMode = document.getElementById('rp-view-mode')?.value || 'detailed';
    const showCodes = document.getElementById('chk-voucher-no')?.checked ?? true;
    const hideZero = document.getElementById('chk-hide-zero')?.checked ?? false;
    const search = (document.getElementById('rp-search-input')?.value || '').trim().toLowerCase();

    // ─────────────────────────────────────────────────────────────────────────
    // Build Left Side Rows (RECEIPTS)
    // ─────────────────────────────────────────────────────────────────────────
    const leftRows = [];

    // 1. OPENING BALANCES SECTION
    leftRows.push({
      type: 'section',
      text: 'OPENING BALANCES (CASH/BANK BOOK)',
      subAmt: '',
      totAmt: ''
    });

    const openAccounts = (data.openingBalances || []).filter(a => {
      if (hideZero && a.amount === 0) return false;
      if (search) {
        return a.accName.toLowerCase().includes(search) || a.accCode.toLowerCase().includes(search);
      }
      return true;
    });

    openAccounts.forEach(a => {
      let label = a.accName;
      if (showCodes && a.accCode) {
        label = `<span class="rp-code-pill">[${a.accCode}]</span> ${a.accName}`;
      }
      if (a.isOverdraft) {
        label += ` <span class="rp-overdraft-pill">Cr / Overdraft</span>`;
      }
      leftRows.push({
        type: 'item',
        isHead: true,
        text: label,
        subAmt: formatINR(a.amount),
        totAmt: ''
      });
    });

    leftRows.push({
      type: 'subtotal',
      text: 'TOTAL OPENING BALANCES',
      subAmt: '',
      totAmt: formatINR(data.totalOpening)
    });

    // 2. RECEIPTS (GROUP-WISE & HEAD-WISE)
    leftRows.push({
      type: 'section',
      text: 'RECEIPTS (INCOME & COLLECTIONS)',
      subAmt: '',
      totAmt: ''
    });

    let displayedReceiptTotal = 0;
    (data.receipts || []).forEach(grp => {
      const matchGroup = grp.groupName.toLowerCase().includes(search);
      const filteredAccs = (grp.accounts || []).filter(a => {
        if (hideZero && a.amount === 0) return false;
        if (search) {
          return matchGroup || a.accName.toLowerCase().includes(search) || a.accCode.toLowerCase().includes(search);
        }
        return true;
      });

      if (search && !matchGroup && filteredAccs.length === 0) return;

      displayedReceiptTotal += grp.totalAmount;

      const shouldPrintDetail = (viewMode === 'detailed' || grp.grpSubtotal === true || grp.grpSubtotal === 'True');

      // Group Header Row
      leftRows.push({
        type: 'group',
        text: `<div class="rp-group-title"><span class="rp-group-bullet">■</span> ${grp.groupName}</div>`,
        subAmt: '',
        totAmt: formatINR(grp.totalAmount)
      });

      // Individual Heads (if detailed mode OR if group has "PRINT SUB-TOTAL IN REPORTS" enabled in summary mode)
      if (shouldPrintDetail) {
        filteredAccs.forEach(acc => {
          let headLabel = acc.accName;
          if (showCodes && acc.accCode) {
            headLabel = `<span class="rp-code-pill">[${acc.accCode}]</span> ${acc.accName}`;
          }
          if (acc.voucherCount > 0) {
            headLabel += ` <span class="rp-badge-count">${acc.voucherCount} txn</span>`;
          }
          leftRows.push({
            type: 'head',
            isHead: true,
            text: headLabel,
            subAmt: formatINR(acc.amount),
            totAmt: ''
          });
        });
      }
    });

    leftRows.push({
      type: 'subtotal',
      text: 'TOTAL RECEIPTS',
      subAmt: '',
      totAmt: formatINR(data.totalReceipts)
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Build Right Side Rows (PAYMENTS)
    // ─────────────────────────────────────────────────────────────────────────
    const rightRows = [];

    // 1. PAYMENTS (GROUP-WISE & HEAD-WISE)
    rightRows.push({
      type: 'section',
      text: 'PAYMENTS (EXPENSES & DISBURSEMENTS)',
      subAmt: '',
      totAmt: ''
    });

    let displayedPaymentTotal = 0;
    (data.payments || []).forEach(grp => {
      const matchGroup = grp.groupName.toLowerCase().includes(search);
      const filteredAccs = (grp.accounts || []).filter(a => {
        if (hideZero && a.amount === 0) return false;
        if (search) {
          return matchGroup || a.accName.toLowerCase().includes(search) || a.accCode.toLowerCase().includes(search);
        }
        return true;
      });

      if (search && !matchGroup && filteredAccs.length === 0) return;

      displayedPaymentTotal += grp.totalAmount;

      const shouldPrintDetail = (viewMode === 'detailed' || grp.grpSubtotal === true || grp.grpSubtotal === 'True');

      // Group Header Row
      rightRows.push({
        type: 'group',
        text: `<div class="rp-group-title"><span class="rp-group-bullet">■</span> ${grp.groupName}</div>`,
        subAmt: '',
        totAmt: formatINR(grp.totalAmount)
      });

      // Individual Heads (if detailed mode OR if group has "PRINT SUB-TOTAL IN REPORTS" enabled in summary mode)
      if (shouldPrintDetail) {
        filteredAccs.forEach(acc => {
          let headLabel = acc.accName;
          if (showCodes && acc.accCode) {
            headLabel = `<span class="rp-code-pill">[${acc.accCode}]</span> ${acc.accName}`;
          }
          if (acc.voucherCount > 0) {
            headLabel += ` <span class="rp-badge-count">${acc.voucherCount} txn</span>`;
          }
          rightRows.push({
            type: 'head',
            isHead: true,
            text: headLabel,
            subAmt: formatINR(acc.amount),
            totAmt: ''
          });
        });
      }
    });

    rightRows.push({
      type: 'subtotal',
      text: 'TOTAL PAYMENTS',
      subAmt: '',
      totAmt: formatINR(data.totalPayments)
    });

    // 2. CLOSING BALANCES SECTION
    rightRows.push({
      type: 'section',
      text: 'CLOSING BALANCES (CASH/BANK BOOK)',
      subAmt: '',
      totAmt: ''
    });

    const closeAccounts = (data.closingBalances || []).filter(a => {
      if (hideZero && a.amount === 0) return false;
      if (search) {
        return a.accName.toLowerCase().includes(search) || a.accCode.toLowerCase().includes(search);
      }
      return true;
    });

    closeAccounts.forEach(a => {
      let label = a.accName;
      if (showCodes && a.accCode) {
        label = `<span class="rp-code-pill">[${a.accCode}]</span> ${a.accName}`;
      }
      if (a.isOverdraft) {
        label += ` <span class="rp-overdraft-pill">Cr / Overdraft</span>`;
      }
      rightRows.push({
        type: 'item',
        isHead: true,
        text: label,
        subAmt: formatINR(a.amount),
        totAmt: ''
      });
    });

    rightRows.push({
      type: 'subtotal',
      text: 'TOTAL CLOSING BALANCES',
      subAmt: '',
      totAmt: formatINR(data.totalClosing)
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Zip Both Sides Together & Render T-Table Body
    // ─────────────────────────────────────────────────────────────────────────
    const maxRows = Math.max(leftRows.length, rightRows.length);
    let html = '';

    for (let i = 0; i < maxRows; i++) {
      const L = leftRows[i];
      const R = rightRows[i];

      html += '<tr>';

      // Left (Receipts) 3 columns
      if (L) {
        if (L.type === 'section') {
          html += `<td colspan="3" class="rp-table-cell rp-section-header rp-side-divider">${L.text}</td>`;
        } else if (L.type === 'group') {
          html += `<td class="rp-table-cell rp-group-row">${L.text}</td>`;
          html += `<td class="rp-table-cell rp-num rp-group-row">${L.subAmt}</td>`;
          html += `<td class="rp-table-cell rp-num rp-group-row rp-side-divider">${L.totAmt}</td>`;
        } else if (L.type === 'subtotal') {
          html += `<td class="rp-table-cell rp-subtotal-row" style="font-weight:800;">${L.text}</td>`;
          html += `<td class="rp-table-cell rp-num rp-subtotal-row">${L.subAmt}</td>`;
          html += `<td class="rp-table-cell rp-num rp-subtotal-row rp-side-divider" style="font-weight:800;">${L.totAmt}</td>`;
        } else {
          // Normal head / item row
          const indentClass = L.isHead ? 'rp-head-indent' : '';
          html += `<td class="rp-table-cell rp-head-row ${indentClass}">${L.text}</td>`;
          html += `<td class="rp-table-cell rp-num rp-head-row">${L.subAmt}</td>`;
          html += `<td class="rp-table-cell rp-num rp-head-row rp-side-divider">${L.totAmt}</td>`;
        }
      } else {
        html += `<td class="rp-table-cell rp-empty-cell"></td><td class="rp-table-cell rp-empty-cell"></td><td class="rp-table-cell rp-empty-cell rp-side-divider"></td>`;
      }

      // Right (Payments) 3 columns
      if (R) {
        if (R.type === 'section') {
          html += `<td colspan="3" class="rp-table-cell rp-section-header">${R.text}</td>`;
        } else if (R.type === 'group') {
          html += `<td class="rp-table-cell rp-group-row">${R.text}</td>`;
          html += `<td class="rp-table-cell rp-num rp-group-row">${R.subAmt}</td>`;
          html += `<td class="rp-table-cell rp-num rp-group-row">${R.totAmt}</td>`;
        } else if (R.type === 'subtotal') {
          html += `<td class="rp-table-cell rp-subtotal-row" style="font-weight:800;">${R.text}</td>`;
          html += `<td class="rp-table-cell rp-num rp-subtotal-row">${R.subAmt}</td>`;
          html += `<td class="rp-table-cell rp-num rp-subtotal-row" style="font-weight:800;">${R.totAmt}</td>`;
        } else {
          // Normal head / item row
          const indentClass = R.isHead ? 'rp-head-indent' : '';
          html += `<td class="rp-table-cell rp-head-row ${indentClass}">${R.text}</td>`;
          html += `<td class="rp-table-cell rp-num rp-head-row">${R.subAmt}</td>`;
          html += `<td class="rp-table-cell rp-num rp-head-row">${R.totAmt}</td>`;
        }
      } else {
        html += `<td class="rp-table-cell rp-empty-cell"></td><td class="rp-table-cell rp-empty-cell"></td><td class="rp-table-cell rp-empty-cell"></td>`;
      }

      html += '</tr>';
    }

    tbody.innerHTML = html;

    // Update Footer Grand Totals
    const footRec = document.getElementById('foot-tot-receipts-side');
    const footPay = document.getElementById('foot-tot-payments-side');
    if (footRec) footRec.textContent = formatCurrency(data.grandTotalReceiptSide);
    if (footPay) footPay.textContent = formatCurrency(data.grandTotalPaymentSide);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Print Statement
  // ───────────────────────────────────────────────────────────────────────────
  window.printReport = function () {
    window.print();
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Export to Excel (Styled with xlsx-js-style)
  // ───────────────────────────────────────────────────────────────────────────
  window.exportToExcel = function () {
    if (!rawReportData) {
      alert('Report data is still loading. Please wait.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading. Please try again in a moment.');
      return;
    }

    const data = rawReportData;
    const soc = data.society || {};
    const socName = soc.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const periodStr = `${data.fromDateDisplay || data.fromDate} to ${data.toDateDisplay || data.toDate}`;

    // Styling constants
    const TITLE_STYLE = { font: { bold: true, sz: 14, color: { rgb: '0A3880' } }, alignment: { horizontal: 'center' } };
    const SUB_STYLE = { font: { sz: 10, italic: true, color: { rgb: '475569' } }, alignment: { horizontal: 'center' } };
    const SUPER_TH_STYLE = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0A3880' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
    const TH_STYLE = {
      font: { bold: true, sz: 10, color: { rgb: '0F172A' } },
      fill: { fgColor: { rgb: 'F1F5F9' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top: { style: 'thin', color: { rgb: 'CBD5E1' } }, bottom: { style: 'thin', color: { rgb: 'CBD5E1' } } }
    };
    const SEC_HDR_STYLE = {
      font: { bold: true, sz: 10.5, color: { rgb: '0A3880' } },
      fill: { fgColor: { rgb: 'F8FAFC' } },
      border: { top: { style: 'thin', color: { rgb: '94A3B8' } }, bottom: { style: 'thin', color: { rgb: '94A3B8' } } }
    };
    const GRP_STYLE = { font: { bold: true, sz: 10, color: { rgb: '0F172A' } } };
    const HEAD_STYLE = { font: { sz: 9.5, color: { rgb: '334155' } } };
    const SUBTOTAL_STYLE = {
      font: { bold: true, sz: 10, color: { rgb: '0F172A' } },
      fill: { fgColor: { rgb: 'F1F5F9' } },
      border: { top: { style: 'thin', color: { rgb: '64748B' } }, bottom: { style: 'thin', color: { rgb: '64748B' } } }
    };
    const GRAND_STYLE = {
      font: { bold: true, sz: 11, color: { rgb: '0A3880' } },
      fill: { fgColor: { rgb: 'E2E8F0' } },
      border: { top: { style: 'medium', color: { rgb: '0A3880' } }, bottom: { style: 'double', color: { rgb: '0A3880' } } }
    };

    const wsData = [
      [{ v: socName.toUpperCase(), s: TITLE_STYLE }, '', '', '', '', ''],
      [{ v: `Registration No: ${soc.registrationNo || '—'} | Address: ${soc.address || '—'}`, s: SUB_STYLE }, '', '', '', '', ''],
      [{ v: `STATUTORY RECEIPT & PAYMENT STATEMENT FOR THE PERIOD: ${periodStr.toUpperCase()}`, s: SUB_STYLE }, '', '', '', '', ''],
      ['', '', '', '', '', ''],
      [
        { v: 'RECEIPTS', s: SUPER_TH_STYLE }, '', '',
        { v: 'PAYMENTS', s: SUPER_TH_STYLE }, '', ''
      ],
      [
        { v: 'RECEIPTS / PARTICULARS', s: TH_STYLE },
        { v: 'SUB AMOUNT (₹)', s: TH_STYLE },
        { v: 'TOTAL AMOUNT (₹)', s: TH_STYLE },
        { v: 'PAYMENTS / PARTICULARS', s: TH_STYLE },
        { v: 'SUB AMOUNT (₹)', s: TH_STYLE },
        { v: 'TOTAL AMOUNT (₹)', s: TH_STYLE }
      ]
    ];

    // Build items exactly corresponding to the visual report
    const leftRows = [];
    leftRows.push({ type: 'sec', text: 'OPENING BALANCES (CASH/BANK BOOK)' });
    (data.openingBalances || []).forEach(a => {
      leftRows.push({
        type: 'head',
        text: `  [${a.accCode}] ${a.accName}${a.isOverdraft ? ' (Cr / Overdraft)' : ''}`,
        sub: a.amount
      });
    });
    leftRows.push({ type: 'sub', text: 'TOTAL OPENING BALANCES', tot: data.totalOpening });

    leftRows.push({ type: 'sec', text: 'RECEIPTS (INCOME & COLLECTIONS)' });
    (data.receipts || []).forEach(grp => {
      leftRows.push({ type: 'grp', text: grp.groupName, tot: grp.totalAmount });
      (grp.accounts || []).forEach(a => {
        leftRows.push({ type: 'head', text: `  [${a.accCode}] ${a.accName}`, sub: a.amount });
      });
    });
    leftRows.push({ type: 'sub', text: 'TOTAL RECEIPTS', tot: data.totalReceipts });

    const rightRows = [];
    rightRows.push({ type: 'sec', text: 'PAYMENTS (EXPENSES & DISBURSEMENTS)' });
    (data.payments || []).forEach(grp => {
      rightRows.push({ type: 'grp', text: grp.groupName, tot: grp.totalAmount });
      (grp.accounts || []).forEach(a => {
        rightRows.push({ type: 'head', text: `  [${a.accCode}] ${a.accName}`, sub: a.amount });
      });
    });
    rightRows.push({ type: 'sub', text: 'TOTAL PAYMENTS', tot: data.totalPayments });

    rightRows.push({ type: 'sec', text: 'CLOSING BALANCES (CASH/BANK BOOK)' });
    (data.closingBalances || []).forEach(a => {
      rightRows.push({
        type: 'head',
        text: `  [${a.accCode}] ${a.accName}${a.isOverdraft ? ' (Cr / Overdraft)' : ''}`,
        sub: a.amount
      });
    });
    rightRows.push({ type: 'sub', text: 'TOTAL CLOSING BALANCES', tot: data.totalClosing });

    const maxRows = Math.max(leftRows.length, rightRows.length);
    for (let i = 0; i < maxRows; i++) {
      const L = leftRows[i];
      const R = rightRows[i];

      const row = [];

      // Left
      if (L) {
        if (L.type === 'sec') {
          row.push({ v: L.text, s: SEC_HDR_STYLE }, { v: '', s: SEC_HDR_STYLE }, { v: '', s: SEC_HDR_STYLE });
        } else if (L.type === 'grp') {
          row.push({ v: L.text, s: GRP_STYLE }, '', { v: L.tot || 0, t: 'n', z: '₹#,##0.00', s: GRP_STYLE });
        } else if (L.type === 'sub') {
          row.push({ v: L.text, s: SUBTOTAL_STYLE }, { v: '', s: SUBTOTAL_STYLE }, { v: L.tot || 0, t: 'n', z: '₹#,##0.00', s: SUBTOTAL_STYLE });
        } else {
          row.push({ v: L.text, s: HEAD_STYLE }, { v: L.sub || 0, t: 'n', z: '₹#,##0.00', s: HEAD_STYLE }, '');
        }
      } else {
        row.push('', '', '');
      }

      // Right
      if (R) {
        if (R.type === 'sec') {
          row.push({ v: R.text, s: SEC_HDR_STYLE }, { v: '', s: SEC_HDR_STYLE }, { v: '', s: SEC_HDR_STYLE });
        } else if (R.type === 'grp') {
          row.push({ v: R.text, s: GRP_STYLE }, '', { v: R.tot || 0, t: 'n', z: '₹#,##0.00', s: GRP_STYLE });
        } else if (R.type === 'sub') {
          row.push({ v: R.text, s: SUBTOTAL_STYLE }, { v: '', s: SUBTOTAL_STYLE }, { v: R.tot || 0, t: 'n', z: '₹#,##0.00', s: SUBTOTAL_STYLE });
        } else {
          row.push({ v: R.text, s: HEAD_STYLE }, { v: R.sub || 0, t: 'n', z: '₹#,##0.00', s: HEAD_STYLE }, '');
        }
      } else {
        row.push('', '', '');
      }

      wsData.push(row);
    }

    // Grand Totals Row
    wsData.push([
      { v: 'GRAND TOTAL RECEIPTS', s: GRAND_STYLE },
      { v: '', s: GRAND_STYLE },
      { v: data.grandTotalReceiptSide || 0, t: 'n', z: '₹#,##0.00', s: GRAND_STYLE },
      { v: 'GRAND TOTAL PAYMENTS', s: GRAND_STYLE },
      { v: '', s: GRAND_STYLE },
      { v: data.grandTotalPaymentSide || 0, t: 'n', z: '₹#,##0.00', s: GRAND_STYLE }
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Merge titles and super headers
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } },
      { s: { r: 4, c: 3 }, e: { r: 4, c: 5 } }
    ];

    ws['!cols'] = [
      { wch: 38 }, { wch: 16 }, { wch: 18 },
      { wch: 38 }, { wch: 16 }, { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Receipt & Payment');
    const safeSoc = (soc.societyName || 'Society').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    XLSX.writeFile(wb, `Receipt_Payment_Report_${safeSoc}_${data.fyLabel || 'FY'}.xlsx`);
  };

})();
