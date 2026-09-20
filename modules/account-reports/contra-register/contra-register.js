/**
 * contra-register.js — JEEVIKA ERP v2
 * Comprehensive Real-Time Contra Voucher Register (Bank & Cash Fund Transfers)
 * Modeled after Statutory Receipt & Payment Registers with Live PostgreSQL Sourcing,
 * Double-Entry Integrity, Interactive Search, Rich Print & Excel Export
 */

(function () {
  'use strict';

  let rawVouchers = [];
  let cashBankAccounts = [];

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatINR(val, zeroBlank = false) {
    const num = parseFloat(val);
    if (isNaN(num) || Math.abs(num) < 0.005) {
      return zeroBlank ? '' : '0.00';
    }
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDate(val) {
    if (!val) return '—';
    const s = String(val).split('T')[0].trim();
    if (s.includes('-')) {
      const p = s.split('-');
      if (p[0].length === 4) return `${p[2]}/${p[1]}/${p[0]}`;
    }
    return s;
  }

  // ── 1. INITIALIZATION ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
    initDateBounds();
    await loadAccountsList();
    await loadContraRegister();
  });

  function initDateBounds() {
    let fyStart = sessionStorage.getItem('activeFYStart') || localStorage.getItem('activeFYStart') || '';
    let fyEnd = sessionStorage.getItem('activeFYEnd') || localStorage.getItem('activeFYEnd') || '';

    if (!fyStart || !fyEnd) {
      const fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2026-27');
      const parts = fyLabel.split('-');
      let sYear = parseInt(parts[0], 10) || 2026;
      if (sYear < 2000) sYear += 2000;
      fyStart = `${sYear}-04-01`;
      fyEnd = `${sYear + 1}-03-31`;
    }

    window._fyStartDate = fyStart;
    window._fyEndDate = fyEnd;

    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (fromEl && toEl) {
      fromEl.value = fyStart;
      toEl.value = fyEnd;
    }

    updatePrintDates();
  }

  function updatePrintDates() {
    const fromVal = document.getElementById('fromDate')?.value;
    const toVal = document.getElementById('toDate')?.value;
    const prtFrom = document.getElementById('prtFromDate');
    const prtTo = document.getElementById('prtToDate');
    if (prtFrom) prtFrom.textContent = formatDate(fromVal) || 'Start';
    if (prtTo) prtTo.textContent = formatDate(toVal) || 'End';

    const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const pName = document.getElementById('prtSocName');
    if (pName) pName.textContent = socName;
  }

  window.applyDatePreset = function (preset) {
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (!fromEl || !toEl) return;

    const fyStart = new Date(window._fyStartDate || '2026-04-01');
    const fyEnd = new Date(window._fyEndDate || '2027-03-31');
    const now = new Date();
    const fmt = d => d.toISOString().split('T')[0];

    if (preset === 'all') {
      fromEl.value = '';
      toEl.value = '';
    } else if (preset === 'full') {
      fromEl.value = window._fyStartDate;
      toEl.value = window._fyEndDate;
    } else if (preset === 'this-month') {
      fromEl.value = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
      toEl.value = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (preset === 'last-month') {
      fromEl.value = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      toEl.value = fmt(new Date(now.getFullYear(), now.getMonth(), 0));
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

    updatePrintDates();
    loadContraRegister();
  };

  window.onDateChange = function () {
    const presetEl = document.getElementById('datePresetSelect');
    if (presetEl) presetEl.value = 'custom';
    updatePrintDates();
    loadContraRegister();
  };

  function getActiveSocietyId() {
    let id = (window.Auth && Auth.getSocietyId && Auth.getSocietyId() && Auth.getSocietyId() !== '—') ? Auth.getSocietyId() : null;
    if (!id || id === '—') {
      id = sessionStorage.getItem('activeSocietyId') ||
           localStorage.getItem('activeSocietyId') ||
           '1';
    }
    return parseInt(id, 10) || 1;
  }

  function getActiveFYId() {
    let id = (window.Auth && Auth.getFYId && Auth.getFYId()) ? Auth.getFYId() : null;
    if (!id || id === '—') {
      id = sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1';
    }
    return parseInt(id, 10) || 1;
  }

  // ── 2. LOAD BANK & CASH ACCOUNTS ─────────────────────────────────────────
  async function loadAccountsList() {
    const societyId = getActiveSocietyId();
    const selectEl = document.getElementById('accountSelect');
    if (!selectEl) return;

    try {
      const res = await API.get(`/accounts?societyId=${societyId}`);
      const accounts = Array.isArray(res) ? res : (res.data || []);
      cashBankAccounts = accounts.filter(a => {
        const name = (a.accName || a.accountName || '').toLowerCase();
        const code = (a.accCode || a.accountCode || '');
        return a.grpMainId === 1 || name.includes('bank') || name.includes('cash') || code.startsWith('20') || code.startsWith('ASS-100');
      });

      let opts = '<option value="all">All Cash &amp; Bank Accounts</option>';
      cashBankAccounts.forEach(a => {
        const code = a.accCode || a.accountCode || '';
        const name = a.accName || a.accountName || 'Account';
        opts += `<option value="${code || name}">[${code}] ${name}</option>`;
      });
      selectEl.innerHTML = opts;
    } catch (e) {
      console.warn('Could not load cash & bank accounts list:', e);
    }
  }

  // ── 3. FETCH CONTRA REGISTER ─────────────────────────────────────────────
  window.loadContraRegister = async function () {
    const societyId = getActiveSocietyId();
    const fyId = getActiveFYId();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const accFilter = document.getElementById('accountSelect')?.value || 'all';

    const tbody = document.getElementById('regTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin" style="font-size:20px;display:block;margin-bottom:8px;color:#0D47A1;"></i>
            Fetching live Contra Register records...
          </td>
        </tr>
      `;
    }

    let records = [];

    try {
      let url = `/vouchers/register?societyId=${societyId}&type=Contra`;
      if (fromDate) url += `&fromDate=${fromDate}`;
      if (toDate) url += `&toDate=${toDate}`;
      if (accFilter && accFilter !== 'all') url += `&cashBankCode=${encodeURIComponent(accFilter)}`;

      const res = await API.get(url);
      if (res && res.success && Array.isArray(res.data)) {
        records = res.data;
      } else {
        // Fallback to /contra-entries if vouchers/register returned 0
        const cUrl = `/contra-entries?societyId=${societyId}&fyId=${fyId}`;
        const cRes = await API.get(cUrl);
        if (Array.isArray(cRes)) {
          records = cRes.map(c => ({
            voucherId: c.contraId,
            voucherNo: c.voucherNo,
            voucherDate: c.voucherDate,
            voucherType: 'Contra',
            amount: c.amount,
            narration: c.narration,
            status: c.status,
            items: []
          }));
        }
      }
    } catch (err) {
      console.error('Contra Register API error:', err);
      if (window.showToast) showToast('Failed to load real-time contra entries.', 'error');
    }

    // Sort by voucherDate ASC, then voucherNo ASC
    records.sort((a, b) => {
      const dComp = (a.voucherDate || '').localeCompare(b.voucherDate || '');
      if (dComp !== 0) return dComp;
      return String(a.voucherNo || '').localeCompare(String(b.voucherNo || ''), undefined, { numeric: true });
    });

    rawVouchers = records;
    filterTable();
  };

  // ── 4. RENDER REGISTER VIEW ──────────────────────────────────────────────
  window.renderRegisterView = function () {
    filterTable();
  };

  window.filterTable = function () {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const showCodes = document.getElementById('chk-voucher-no')?.checked ?? true;
    const accFilter = document.getElementById('accountSelect')?.value || 'all';

    let filtered = rawVouchers.filter(v => {
      if (q) {
        const vNo = (v.voucherNo || '').toLowerCase();
        const narr = (v.narration || '').toLowerCase();
        const amt = String(v.amount || '');
        const ref = (v.refNo || '').toLowerCase();
        const chq = (v.chqNo || '').toLowerCase();
        let matchText = vNo.includes(q) || narr.includes(q) || amt.includes(q) || ref.includes(q) || chq.includes(q);

        if (!matchText && Array.isArray(v.items)) {
          matchText = v.items.some(it => {
            const code = (it.accountCode || '').toLowerCase();
            const name = (it.accountName || '').toLowerCase();
            return code.includes(q) || name.includes(q);
          });
        }
        if (!matchText) return false;
      }

      if (accFilter && accFilter !== 'all') {
        const needle = accFilter.toLowerCase();
        let matches = false;
        if (Array.isArray(v.items) && v.items.length > 0) {
          matches = v.items.some(it => {
            const code = (it.accountCode || '').toLowerCase();
            const name = (it.accountName || '').toLowerCase();
            return code.includes(needle) || name.includes(needle);
          });
        } else {
          matches = (v.cashBankCode || '').toLowerCase().includes(needle) ||
                    (v.cashBankName || '').toLowerCase().includes(needle);
        }
        if (!matches) return false;
      }

      return true;
    });

    const tbody = document.getElementById('regTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-inbox" style="font-size:24px;display:block;margin-bottom:8px;color:#94a3b8;"></i>
            No contra voucher records found matching current criteria.
          </td>
        </tr>
      `;
      updateKPIs([], 0, 0, 0);
      return;
    }

    let html = '';
    let totalDebit = 0;
    let totalCredit = 0;
    let bankOutflow = 0;
    let cashOutflow = 0;

    filtered.forEach(v => {
      const vAmt = parseFloat(v.amount) || 0;
      const vNo = v.voucherNo || 'CV-????';
      const vDateStr = formatDate(v.voucherDate);
      const vId = v.voucherId || '';

      const items = Array.isArray(v.items) && v.items.length > 0 ? v.items : [];
      let fromItem = items.find(it => parseFloat(it.credit) > 0);
      let toItem = items.find(it => parseFloat(it.debit) > 0);

      // Fallback if items not provided
      if (!fromItem && !toItem) {
        fromItem = {
          accountCode: v.cashBankCode || 'ASS-1001',
          accountName: v.cashBankName || 'Cash in Hand (Source)',
          credit: vAmt,
          debit: 0
        };
        toItem = {
          accountCode: 'ASS-1002',
          accountName: v.personName || 'Bank A/c (Destination)',
          debit: vAmt,
          credit: 0
        };
      }

      const crAmt = fromItem ? (parseFloat(fromItem.credit) || vAmt) : vAmt;
      const drAmt = toItem ? (parseFloat(toItem.debit) || vAmt) : vAmt;

      totalCredit += crAmt;
      totalDebit += drAmt;

      const fromName = fromItem ? (fromItem.accountName || '').toLowerCase() : '';
      if (fromName.includes('cash')) {
        cashOutflow += crAmt;
      } else {
        bankOutflow += crAmt;
      }

      const fromCodeHtml = (showCodes && fromItem && fromItem.accountCode)
        ? `<span class="acc-code-pill ${fromName.includes('cash') ? 'acc-code-cash' : 'acc-code-bank'}">[${escHtml(fromItem.accountCode)}]</span>`
        : '';

      const toName = toItem ? (toItem.accountName || '').toLowerCase() : '';
      const toCodeHtml = (showCodes && toItem && toItem.accountCode)
        ? `<span class="acc-code-pill ${toName.includes('cash') ? 'acc-code-cash' : 'acc-code-bank'}">[${escHtml(toItem.accountCode)}]</span>`
        : '';

      // Chips for Reference & Cheque
      let metaChips = '';
      if (v.chqNo) {
        metaChips += `<span class="reg-chip reg-chip-chq"><i class="bi bi-card-text"></i> Chq: ${escHtml(v.chqNo)}${v.chqDate ? ' (' + formatDate(v.chqDate) + ')' : ''}</span>`;
      }
      if (v.refNo) {
        metaChips += `<span class="reg-chip"><i class="bi bi-hash"></i> Ref: ${escHtml(v.refNo)}</span>`;
      }

      const narrBox = (v.narration || metaChips)
        ? `<div class="reg-narr-box">${metaChips}${escHtml(v.narration || 'Contra Fund Transfer')}</div>`
        : '';

      const printUrl = `../contra-voucher-print/contra-voucher-print.html?id=${vId}&vno=${encodeURIComponent(vNo)}`;

      // Main Row (Credit / Transfer From)
      html += `
        <tr class="reg-voucher-main">
          <td class="td-center" style="font-weight:700;">${vDateStr}</td>
          <td class="td-center">
            <a href="${printUrl}" target="_blank" class="voucher-pill" title="Print Contra Voucher">
              <i class="bi bi-file-earmark-text"></i> ${escHtml(vNo)}
            </a>
          </td>
          <td>
            <div style="font-weight:700; color:#b91c1c; display:flex; align-items:center; gap:4px;">
              <i class="bi bi-arrow-up-right" style="font-size:12px;"></i>
              <span style="font-size:10px; color:#64748b; text-transform:uppercase;">From (Cr):</span>
              ${fromCodeHtml}
              <span>${escHtml(fromItem ? fromItem.accountName : 'Source Account')}</span>
            </div>
          </td>
          <td class="td-amt">—</td>
          <td class="td-amt" style="font-weight:700; color:#b91c1c;">${formatINR(crAmt)}</td>
        </tr>
      `;

      // Split Row (Debit / Transfer To + Narration)
      html += `
        <tr class="reg-voucher-split">
          <td class="td-center" style="color:#94a3b8;">↳</td>
          <td class="td-center" style="font-size:10px; color:#64748b;">Transfer In</td>
          <td>
            <div style="font-weight:700; color:#15803d; display:flex; align-items:center; gap:4px;">
              <i class="bi bi-arrow-down-left" style="font-size:12px;"></i>
              <span style="font-size:10px; color:#64748b; text-transform:uppercase;">To (Dr):</span>
              ${toCodeHtml}
              <span>${escHtml(toItem ? toItem.accountName : 'Destination Account')}</span>
            </div>
            ${narrBox}
          </td>
          <td class="td-amt" style="font-weight:700; color:#15803d;">${formatINR(drAmt)}</td>
          <td class="td-amt">—</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

    // Grand Totals in Footer
    const footDr = document.getElementById('footTotDebit');
    const footCr = document.getElementById('footTotCredit');
    if (footDr) footDr.textContent = `₹ ${formatINR(totalDebit)}`;
    if (footCr) footCr.textContent = `₹ ${formatINR(totalCredit)}`;

    // Status Banner Check
    const diff = Math.abs(totalDebit - totalCredit);
    const balBanner = document.getElementById('balancedBanner');
    const diffBanner = document.getElementById('diffBanner');
    const diffLabel = document.getElementById('diffAmountLabel');

    if (diff > 0.05) {
      if (balBanner) balBanner.style.display = 'none';
      if (diffBanner) diffBanner.style.display = 'flex';
      if (diffLabel) diffLabel.textContent = `Diff: ₹ ${formatINR(diff)}`;
    } else {
      if (balBanner) balBanner.style.display = 'flex';
      if (diffBanner) diffBanner.style.display = 'none';
    }

    const recCount = document.getElementById('recordCountLabel');
    if (recCount) recCount.textContent = `${filtered.length} Vouchers Displayed`;

    updateKPIs(filtered, totalCredit, bankOutflow, cashOutflow);
  };

  function updateKPIs(vouchers, totalAmt, bankOut, cashOut) {
    const kpiCount = document.getElementById('kpiTotalVouchers');
    const kpiTot = document.getElementById('kpiTotalAmount');
    const kpiBank = document.getElementById('kpiBankOutflow');
    const kpiCash = document.getElementById('kpiCashOutflow');

    if (kpiCount) kpiCount.textContent = vouchers.length;
    if (kpiTot) kpiTot.textContent = `₹ ${formatINR(totalAmt)}`;
    if (kpiBank) kpiBank.textContent = `₹ ${formatINR(bankOut)}`;
    if (kpiCash) kpiCash.textContent = `₹ ${formatINR(cashOut)}`;
  }

  // ── 5. PRINT STATEMENT ───────────────────────────────────────────────────
  window.printRegister = function () {
    updatePrintDates();
    const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Contra_Register';
    const origTitle = document.title;
    document.title = `${socName}_Contra_Register`.replace(/\s+/g, '_');
    window.print();
    setTimeout(() => { document.title = origTitle; }, 1000);
  };

  // ── 6. EXCEL EXPORT ENGINE ───────────────────────────────────────────────
  window.exportToExcel = function () {
    if (!rawVouchers || rawVouchers.length === 0) {
      alert('No Contra Voucher records available to export.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Excel export engine is initializing. Please try again in a moment.');
      return;
    }

    const socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'CO-OPERATIVE HOUSING SOCIETY LTD.');
    const fromVal = document.getElementById('fromDate')?.value || '';
    const toVal = document.getElementById('toDate')?.value || '';
    const dateRangeStr = `Period: ${formatDate(fromVal) || 'Start'} To ${formatDate(toVal) || 'End'}`;

    const ws = {};
    const merges = [];

    const thinBorder = { style: 'thin', color: { rgb: 'CBD5E1' } };
    const doubleBorder = { style: 'double', color: { rgb: '000000' } };
    const headerBorder = { style: 'thin', color: { rgb: '0F172A' } };

    function getCellBorder(topB, bottomB) {
      return {
        top: topB || thinBorder,
        bottom: bottomB || thinBorder,
        left: thinBorder,
        right: thinBorder
      };
    }

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

    // Row 0: Society Name (Merged A1:F1)
    setCell(0, 0, socName, 's', {
      font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: '0D47A1' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    for (let c = 1; c < 6; c++) setCell(0, c, '', 's', {});
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });

    // Row 1: Title (Merged A2:F2)
    setCell(1, 0, 'CONTRA VOUCHER REGISTER (FUND TRANSFERS)', 's', {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F172A' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    for (let c = 1; c < 6; c++) setCell(1, c, '', 's', {});
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });

    // Row 2: Date Range (Merged A3:F3)
    setCell(2, 0, dateRangeStr, 's', {
      font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: '475569' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    for (let c = 1; c < 6; c++) setCell(2, c, '', 's', {});
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 5 } });

    // Row 3: Column Headers
    const hRow = 3;
    const headers = ['Date', 'Voucher No', 'Transfer From (Credit)', 'Transfer To (Debit)', 'Narration / Details', 'Amount (₹)'];
    headers.forEach((h, c) => {
      setCell(hRow, c, h, 's', {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '0D47A1' } },
        alignment: { horizontal: (c === 5 ? 'right' : (c <= 1 ? 'center' : 'left')), vertical: 'center' },
        border: getCellBorder(headerBorder, headerBorder)
      });
    });

    let curR = 4;
    const amountCells = [];

    rawVouchers.forEach(v => {
      const vAmt = parseFloat(v.amount) || 0;
      const vNo = v.voucherNo || '';
      const vDateStr = formatDate(v.voucherDate);

      const items = Array.isArray(v.items) && v.items.length > 0 ? v.items : [];
      let fromItem = items.find(it => parseFloat(it.credit) > 0);
      let toItem = items.find(it => parseFloat(it.debit) > 0);

      const fromName = fromItem ? `[${fromItem.accountCode || ''}] ${fromItem.accountName || ''}` : (v.cashBankName || 'Cash/Bank');
      const toName = toItem ? `[${toItem.accountCode || ''}] ${toItem.accountName || ''}` : (v.personName || 'Bank/Cash');
      const narr = [v.narration, v.refNo ? `Ref: ${v.refNo}` : '', v.chqNo ? `Chq: ${v.chqNo}` : ''].filter(Boolean).join(' | ');

      setCell(curR, 0, vDateStr, 's', {
        font: { name: 'Calibri', sz: 9.5 },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: getCellBorder()
      });

      setCell(curR, 1, vNo, 's', {
        font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: '0D47A1' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: getCellBorder()
      });

      setCell(curR, 2, fromName, 's', {
        font: { name: 'Calibri', sz: 9.5, color: { rgb: 'B91C1C' } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: getCellBorder()
      });

      setCell(curR, 3, toName, 's', {
        font: { name: 'Calibri', sz: 9.5, color: { rgb: '15803D' } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: getCellBorder()
      });

      setCell(curR, 4, narr, 's', {
        font: { name: 'Calibri', sz: 9, color: { rgb: '475569' } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: getCellBorder()
      });

      setCell(curR, 5, vAmt, 'n', {
        font: { name: 'Calibri', sz: 9.5, bold: true },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: getCellBorder()
      }, '#,##0.00');

      amountCells.push(`F${curR + 1}`);
      curR++;
    });

    // Grand Total Row
    const rTot = curR;
    setCell(rTot, 0, '', 's', { border: getCellBorder(thinBorder, doubleBorder) });
    setCell(rTot, 1, '', 's', { border: getCellBorder(thinBorder, doubleBorder) });
    setCell(rTot, 2, '', 's', { border: getCellBorder(thinBorder, doubleBorder) });
    setCell(rTot, 3, '', 's', { border: getCellBorder(thinBorder, doubleBorder) });
    setCell(rTot, 4, 'TOTAL TRANSFERS', 's', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '0F172A' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getCellBorder(thinBorder, doubleBorder)
    });

    const totFormula = amountCells.length > 0 ? `SUM(${amountCells[0]}:${amountCells[amountCells.length - 1]})` : undefined;
    const sumAmt = rawVouchers.reduce((acc, v) => acc + (parseFloat(v.amount) || 0), 0);

    setCell(rTot, 5, sumAmt, 'n', {
      font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: '0D47A1' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: getCellBorder(thinBorder, doubleBorder)
    }, '#,##0.00', totFormula);

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rTot + 1, c: 5 } });
    ws['!merges'] = merges;

    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 16 }, // Voucher No
      { wch: 32 }, // From Account
      { wch: 32 }, // To Account
      { wch: 36 }, // Narration
      { wch: 18 }  // Amount
    ];

    ws['!rows'] = [
      { hpt: 24 }, // Soc Name
      { hpt: 18 }, // Title
      { hpt: 16 }, // Period
      { hpt: 24 }  // Headers
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contra Register');

    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 24);
    const fname = `${cleanSoc}_Contra_Register_${(new Date()).toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

})();
