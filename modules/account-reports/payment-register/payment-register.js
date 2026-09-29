/**
 * payment-register.js — JEEVIKA ERP v2
 * Comprehensive Statutory Payment Voucher Register
 * Interactive ERP Software UX, KPI Metrics, Double-Entry Verification, Print & Excel Engine
 */

(function () {
  'use strict';

  let rawVouchers = [];
  let filteredVouchers = [];
  let cashBankAccounts = [];

// 100% Real-Time Synchronized with Backend SocVoucherHeader & SocVoucherDetail

  // ── 1. INITIALIZATION ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
    initDates();
    syncSocietyInfo();
    loadSocietyDetails();
    await loadAccountsList();
    await loadPaymentRegister();
  });

  // Society details state for professional voucher printing (Image 2)
  let societyDetails = {
    societyName: '',
    registrationNo: '',
    address: '',
    city: '',
    pincode: '',
    email: '',
    phone: '',
    panNo: ''
  };

  async function loadSocietyDetails() {
    const socId = getActiveSocietyId();
    try {
      const res = await API.get(`/societies/${socId}`);
      if (res && res.success && res.data) {
        societyDetails = { ...societyDetails, ...res.data };
      } else if (res && res.societyName) {
        societyDetails = { ...societyDetails, ...res };
      }
    } catch (e) {
      console.warn('Could not fetch full society details:', e);
    }
    if (!societyDetails.societyName || societyDetails.societyName === '—') {
      societyDetails.societyName = (window.Auth && Auth.getSocietyName && Auth.getSocietyName() !== '—') 
        ? Auth.getSocietyName() 
        : (sessionStorage.getItem('activeSocietyName') || 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.');
    }
    if (!societyDetails.registrationNo) {
      societyDetails.registrationNo = sessionStorage.getItem('activeSocietyRegNo') || 'BOM/WSG/TC/9121/2001-2005 DT. 17.08.2004';
    }
    if (!societyDetails.address) {
      societyDetails.address = sessionStorage.getItem('activeSocietyAddress') || 'KHANDELWAL MARG, NEAR USHA NAGAR, BHANDUP(WEST)';
    }
    if (!societyDetails.city) societyDetails.city = 'MUMBAI';
    if (!societyDetails.pincode) societyDetails.pincode = '400 078';
    if (!societyDetails.email) societyDetails.email = 'shreesaiushachsl@gmail.com';
    if (!societyDetails.phone) societyDetails.phone = '+91 9987962108';

    const prtSoc = document.getElementById('prtSocName');
    if (prtSoc) prtSoc.textContent = societyDetails.societyName;
    const prtSub = document.getElementById('prtSocSub');
    if (prtSub) prtSub.textContent = `Registration No: ${societyDetails.registrationNo} | ${societyDetails.city || 'Mumbai'}`;
  }

  function initDates() {
    let fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2026-27');
    const parts = fyLabel.split('-');
    let startYear = parseInt(parts[0], 10) || 2026;
    if (startYear < 2000) startYear += 2000;
    const endYear = startYear + 1;

    window._fyStartDate = `${startYear}-04-01`;
    window._fyEndDate = `${endYear}-03-31`;

    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (fromEl) fromEl.value = window._fyStartDate;
    if (toEl) toEl.value = window._fyEndDate;

    updatePrintDates();
  }

  function updatePrintDates() {
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    const prtFrom = document.getElementById('prtFromDate');
    const prtTo = document.getElementById('prtToDate');

    if (prtFrom && fromEl) prtFrom.textContent = formatDateDisplay(fromEl.value);
    if (prtTo && toEl) prtTo.textContent = formatDateDisplay(toEl.value);
  }

  function syncSocietyInfo() {
    const socName = (window.Auth && Auth.getSocietyName && Auth.getSocietyName() !== '—') 
      ? Auth.getSocietyName() 
      : (sessionStorage.getItem('activeSocietyName') || 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.');

    const prtSoc = document.getElementById('prtSocName');
    if (prtSoc) prtSoc.textContent = socName;
  }

  window.applyDatePreset = function (preset) {
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (!fromEl || !toEl) return;

    const fyStart = new Date(window._fyStartDate);
    const fyEnd = new Date(window._fyEndDate);
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
    loadPaymentRegister();
  };

  window.onDateChange = function () {
    const presetEl = document.getElementById('datePresetSelect');
    if (presetEl) presetEl.value = 'custom';
    updatePrintDates();
    loadPaymentRegister();
  };

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
      console.warn('Could not load accounts list:', e);
    }
  }

  // ── 3. FETCH PAYMENT REGISTER ───────────────────────────────────────────
  window.loadPaymentRegister = async function () {
    const societyId = getActiveSocietyId();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const accFilter = document.getElementById('accountSelect')?.value || 'all';

    const tbody = document.getElementById('regTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin" style="font-size:20px;display:block;margin-bottom:8px;color:#0D47A1;"></i>
            Fetching live Payment Register records...
          </td>
        </tr>
      `;
    }

    let records = [];

    try {
      let url = `/vouchers/register?societyId=${societyId}&type=Payment`;
      if (fromDate) url += `&fromDate=${fromDate}`;
      if (toDate) url += `&toDate=${toDate}`;
      if (accFilter && accFilter !== 'all') url += `&cashBankCode=${encodeURIComponent(accFilter)}`;

      const res = await API.get(url);
      if (res && res.success && Array.isArray(res.data)) {
        records = res.data;
      }
    } catch (err) {
      console.error('Live Payment Register API error:', err);
      if (window.showToast) showToast('Failed to load real-time payment entries.', 'error');
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

  // ── 4. RENDER VOUCHER TABLE ──────────────────────────────────────────────
  window.renderRegisterView = function () {
    const tbody = document.getElementById('regTableBody');
    if (!tbody) return;

    const showCodes = document.getElementById('chk-voucher-no')?.checked ?? true;
    const list = filteredVouchers;

    if (!list || list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-inbox" style="font-size:24px;display:block;margin-bottom:8px;color:#94a3b8;"></i>
            No payment vouchers found for the selected criteria.
          </td>
        </tr>
      `;
      updateKPIs(0, 0, 0, 0);
      updateFooters(0, 0);
      return;
    }

    let html = '';
    let grandTotDebit = 0;
    let grandTotCredit = 0;
    let bankAmount = 0;
    let cashAmount = 0;

    list.forEach((v, idx) => {
      const vDateDisplay = formatDateDisplay(v.voucherDate);
      const vNo = v.voucherNo || (idx + 1);
      const items = (v.items && v.items.length > 0) ? v.items : synthesizeLines(v);

      // Check voucher items debit & credit sums
      let vDebitSum = 0;
      let vCreditSum = 0;

      // Group rows for this voucher
      items.forEach((item, itemIdx) => {
        const dAmt = parseFloat(item.debit) || 0;
        const cAmt = parseFloat(item.credit) || 0;
        vDebitSum += dAmt;
        vCreditSum += cAmt;

        const isFirst = (itemIdx === 0);
        const isLast = (itemIdx === items.length - 1);
        const code = item.accountCode || '';
        const name = item.accountName || 'Account';

        // Code styling
        let codeClass = 'acc-code-exp';
        if (code.startsWith('20') || name.toLowerCase().includes('bank') || name.toLowerCase().includes('cash')) {
          codeClass = 'acc-code-bank';
        } else if (code.startsWith('01') || code.startsWith('02') || code.startsWith('33') || name.includes('GST') || name.includes('TDS')) {
          codeClass = 'acc-code-tax';
        }

        const codeHtml = (showCodes && code) 
          ? `<span class="acc-code-pill ${codeClass}">${escHtml(code)}</span>` 
          : '';

        html += `
          <tr class="${isFirst ? 'reg-voucher-main' : 'reg-voucher-split'}">
            <!-- Date & Voucher No (Shown on first line of voucher) -->
            <td class="td-center" style="${!isFirst ? 'border-top:none;color:transparent;' : ''}">
              ${isFirst ? `<strong>${vDateDisplay}</strong>` : ''}
            </td>
            <td class="td-center" style="${!isFirst ? 'border-top:none;' : ''}">
              ${isFirst ? `<a class="voucher-pill" href="javascript:void(0)" onclick="viewVoucherDetails('${vNo}')" title="Click to view voucher ${escHtml(vNo)}">${escHtml(vNo)}</a>` : ''}
            </td>

            <!-- Account Head -->
            <td>
              <div style="display:flex;align-items:center;flex-wrap:wrap;">
                ${codeHtml}
                <span style="font-weight:${cAmt > 0 ? '700' : '500'};color:${cAmt > 0 ? '#0D47A1' : '#1e293b'};">
                  ${escHtml(name)}
                </span>
              </div>

              <!-- On last item row of voucher, render Narration callout -->
              ${isLast ? renderNarrationBox(v) : ''}
            </td>

            <!-- Debit Column -->
            <td class="td-amt dr">
              ${dAmt > 0.005 ? formatINR(dAmt) : ''}
            </td>

            <!-- Credit Column -->
            <td class="td-amt cr">
              ${cAmt > 0.005 ? formatINR(cAmt) : ''}
            </td>
          </tr>
        `;
      });

      grandTotDebit += vDebitSum;
      grandTotCredit += vCreditSum;

      // Accumulate Bank vs Cash Outflow based on primary cash/bank account
      const cbName = (v.cashBankName || '').toLowerCase();
      const vAmt = parseFloat(v.amount) || vCreditSum || 0;
      if (cbName.includes('cash')) {
        cashAmount += vAmt;
      } else {
        bankAmount += vAmt;
      }
    });

    tbody.innerHTML = html;

    // Update KPI cards and footers
    updateKPIs(list.length, grandTotCredit, bankAmount, cashAmount);
    updateFooters(grandTotDebit, grandTotCredit);
  };

  // Helper: Extract Line 1 and Line 2 narration
  function getNarrationLines(v) {
    let line1 = (v.particular1 || '').trim();
    let line2 = (v.particular2 || '').trim();

    if (!line1 && v.narration) {
      const parts = v.narration.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      line1 = parts[0] || '';
      if (!line2 && parts.length > 1) {
        line2 = parts.slice(1).join(' ');
      }
    } else if (line1 && !line2 && v.narration && v.narration.includes('\n')) {
      const parts = v.narration.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        line2 = parts.slice(1).join(' ');
      }
    }

    return { line1, line2 };
  }

  // Render Narration callout box with chips for Cheque/Ref, Date, Party, and both Narration lines
  function renderNarrationBox(v) {
    let chips = '';
    if (v.chqNo && v.chqNo !== '-') {
      chips += `<span class="reg-chip reg-chip-chq"><i class="bi bi-file-earmark-text"></i> Chq: ${escHtml(v.chqNo)}</span>`;
    }
    if (v.chqDate) {
      chips += `<span class="reg-chip"><i class="bi bi-calendar-event"></i> Dt: ${formatDateDisplay(v.chqDate)}</span>`;
    }
    const party = v.personName || v.paidTo;
    if (party && party !== 'NONE' && party !== 'General') {
      chips += `<span class="reg-chip reg-chip-party"><i class="bi bi-person"></i> Paid to: ${escHtml(party)}</span>`;
    }

    const { line1, line2 } = getNarrationLines(v);
    if (!chips && !line1 && !line2) return '';

    return `
      <div class="reg-narr-box">
        ${chips ? `<div style="margin-bottom:3px;">${chips}</div>` : ''}
        ${line1 ? `<div class="reg-narr-line1">${escHtml(line1)}</div>` : ''}
        ${line2 ? `<div class="reg-narr-line2">${escHtml(line2)}</div>` : ''}
      </div>
    `;
  }

  // Synthesize double-entry lines if detail records aren't attached
  function synthesizeLines(v) {
    const amt = parseFloat(v.amount) || 0;
    const cbCode = v.cashBankCode || '204';
    const cbName = v.cashBankName || 'Bank Account';
    const headName = v.personName || v.particular1 || 'Expense / Payment Head';
    const headCode = 'EXP';

    return [
      { accountCode: cbCode, accountName: cbName, debit: 0, credit: amt },
      { accountCode: headCode, accountName: headName, debit: amt, credit: 0 }
    ];
  }

  // ── 5. KPI & FOOTER BALANCING ────────────────────────────────────────────
  function updateKPIs(count, total, bank, cash) {
    const elCount = document.getElementById('kpiTotalVouchers');
    const elTotal = document.getElementById('kpiTotalAmount');
    const elBank = document.getElementById('kpiBankAmount');
    const elCash = document.getElementById('kpiCashAmount');
    if (elCount) elCount.textContent = count.toLocaleString('en-IN');
    if (elTotal) elTotal.textContent = '₹ ' + formatINR(total);
    if (elBank) elBank.textContent = '₹ ' + formatINR(bank);
    if (elCash) elCash.textContent = '₹ ' + formatINR(cash);
    const recCount = document.getElementById('recordCountLabel');
    if (recCount) recCount.textContent = `${count} Vouchers Displayed`;
  }

  // ── Statement Summary Popover Toggle ───────────────────────────────────────
  window.toggleSummaryPopover = function (event) {
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
  };

  // Close summary popover when clicking anywhere outside
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

  function updateFooters(debit, credit) {
    const footDr = document.getElementById('footTotDebit');
    const footCr = document.getElementById('footTotCredit');
    const diff = Math.abs(debit - credit);

    if (footDr) footDr.textContent = '₹ ' + formatINR(debit);
    if (footCr) footCr.textContent = '₹ ' + formatINR(credit);

    const bBar = document.getElementById('balancedBanner');
    const dBar = document.getElementById('diffBanner');
    const dLbl = document.getElementById('diffAmountLabel');

    if (diff < 0.05) {
      if (bBar) bBar.style.display = 'flex';
      if (dBar) dBar.style.display = 'none';
    } else {
      if (bBar) bBar.style.display = 'none';
      if (dBar) dBar.style.display = 'flex';
      if (dLbl) dLbl.textContent = `Discrepancy: ₹ ${formatINR(diff)}`;
    }
  }

  // ── 6. REAL-TIME SEARCH FILTER ───────────────────────────────────────────
  window.filterTable = function () {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

    if (!q) {
      filteredVouchers = [...rawVouchers];
    } else {
      filteredVouchers = rawVouchers.filter(v => {
        const vNo = String(v.voucherNo || '').toLowerCase();
        const cb = (v.cashBankName || '').toLowerCase();
        const p = (v.personName || '').toLowerCase();
        const n = (v.narration || '').toLowerCase();
        const p1 = (v.particular1 || '').toLowerCase();
        const p2 = (v.particular2 || '').toLowerCase();
        const chq = (v.chqNo || '').toLowerCase();
        const itemsMatch = (v.items || []).some(item => 
          (item.accountName || '').toLowerCase().includes(q) ||
          (item.accountCode || '').toLowerCase().includes(q)
        );

        return vNo.includes(q) || cb.includes(q) || p.includes(q) || n.includes(q) || p1.includes(q) || p2.includes(q) || chq.includes(q) || itemsMatch;
      });
    }

    renderRegisterView();
  };

  // ── 7. EXPORT TO EXCEL (.xlsx) ───────────────────────────────────────────
  window.exportToExcel = function () {
    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading. Please try again in a few seconds.');
      return;
    }

    const socName = (window.Auth && Auth.getSocietyName && Auth.getSocietyName() !== '—') 
      ? Auth.getSocietyName() 
      : (sessionStorage.getItem('activeSocietyName') || 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.');
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const showCodes = document.getElementById('chk-voucher-no')?.checked ?? true;

    const rows = [];
    // Header block
    rows.push([socName]);
    rows.push([`PAYMENT VOUCHER REGISTER FROM ${formatDateDisplay(fromDate)} TO ${formatDateDisplay(toDate)}`]);
    rows.push([]);

    // Table Header
    rows.push(['Date', 'Pymt No.', 'Code', 'Account Head & Particulars', 'Debit (₹)', 'Credit (₹)']);

    let totalDr = 0;
    let totalCr = 0;

    filteredVouchers.forEach(v => {
      const items = (v.items && v.items.length > 0) ? v.items : synthesizeLines(v);
      items.forEach((item, itemIdx) => {
        const isFirst = (itemIdx === 0);
        const dAmt = parseFloat(item.debit) || 0;
        const cAmt = parseFloat(item.credit) || 0;
        totalDr += dAmt;
        totalCr += cAmt;

        rows.push([
          isFirst ? formatDateDisplay(v.voucherDate) : '',
          isFirst ? v.voucherNo : '',
          showCodes ? (item.accountCode || '') : '',
          item.accountName || '',
          dAmt > 0 ? dAmt : '',
          cAmt > 0 ? cAmt : ''
        ]);
      });

      // Narration row in excel (Line 1 & Line 2)
      const { line1, line2 } = getNarrationLines(v);
      const narrParts = [];
      if (line1) narrParts.push(line1);
      if (line2 && line2 !== line1) narrParts.push(line2);
      if (narrParts.length > 0) {
        rows.push(['', '', '', `Narration: ${narrParts.join(' | ')}`, '', '']);
      }
    });

    // Grand Totals
    rows.push([]);
    rows.push(['', 'TOTAL', '', 'TOTAL DISBURSEMENTS (BALANCED)', totalDr, totalCr]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 10 }, // Pymt No
      { wch: 10 }, // Code
      { wch: 60 }, // Account Head & Particulars
      { wch: 15 }, // Debit
      { wch: 15 }  // Credit
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payment Register');
    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    XLSX.writeFile(wb, `${cleanSoc}_Payment_Register_${fromDate}_to_${toDate}.xlsx`);
  };

  // ── 8. THREE DIRECT PRINT ENGINES (CURRENT FORMAT, DUPLICATE, CONTINUOUS) ──

  // Option 1: Print standard Payment Register (Current format visible on screen)
  window.printRegister = function () {
    document.body.classList.remove('print-voucher-mode');
    document.body.classList.add('print-register-mode');

    loadSocietyDetails();
    updatePrintDates();

    const socName = (societyDetails.societyName || 'Society').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const origTitle = document.title;
    document.title = `${socName}_Payment_Register_${fromDate}_${toDate}`;

    window.print();

    const resetTitle = () => {
      document.title = origTitle;
      document.body.classList.remove('print-register-mode');
      window.removeEventListener('afterprint', resetTitle);
    };
    window.addEventListener('afterprint', resetTitle);
    setTimeout(resetTitle, 2000);
  };

  // Option 2: Print with Duplicate (2 copies on 1 page: Society Copy on top, Vendor/Office Copy on bottom)
  window.printVouchersWithDuplicate = async function (singleVoucherNo) {
    await loadSocietyDetails();

    let vouchersToPrint = [];
    if (singleVoucherNo) {
      const v = rawVouchers.find(x => String(x.voucherNo) === String(singleVoucherNo));
      if (v) vouchersToPrint = [v];
    } else {
      vouchersToPrint = [...filteredVouchers];
    }

    if (vouchersToPrint.length === 0) {
      if (window.showToast) {
        showToast('No payment vouchers found to print for the selected criteria.', 'warning');
      } else {
        alert('No payment vouchers found to print for the selected criteria.');
      }
      return;
    }

    const printArea = document.getElementById('voucherPrintArea');
    if (!printArea) return;

    let sheetsHtml = '';
    vouchersToPrint.forEach(v => {
      sheetsHtml += `
        <div class="voucher-sheet">
          <!-- Top: Society Copy -->
          ${buildPaymentVoucherCardHtml(v, 'Society Copy')}

          <!-- Cut Line Divider -->
          <div class="voucher-cut-line">
            ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          </div>

          <!-- Bottom: Vendor / Office Copy -->
          ${buildPaymentVoucherCardHtml(v, 'Vendor / Office Copy')}
        </div>
      `;
    });

    printArea.innerHTML = sheetsHtml;

    document.body.classList.remove('print-register-mode');
    document.body.classList.add('print-voucher-mode');

    const cleanSoc = (societyDetails.societyName || 'Society').replace(/[^a-zA-Z0-9_-]/g, '_');
    const origTitle = document.title;
    document.title = `${cleanSoc}_Payment_Vouchers_With_Duplicate`;

    window.print();

    const cleanup = () => {
      document.title = origTitle;
      document.body.classList.remove('print-voucher-mode');
      printArea.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 2000);
  };

  // Option 3: Print Continuous (No duplicates; exactly 2 distinct payment vouchers per single A4 page)
  window.printVouchersContinuous = async function () {
    await loadSocietyDetails();

    const vouchersToPrint = [...filteredVouchers];
    if (vouchersToPrint.length === 0) {
      if (window.showToast) {
        showToast('No payment vouchers found to print for the selected criteria.', 'warning');
      } else {
        alert('No payment vouchers found to print for the selected criteria.');
      }
      return;
    }

    const printArea = document.getElementById('voucherPrintArea');
    if (!printArea) return;

    let sheetsHtml = '';
    for (let i = 0; i < vouchersToPrint.length; i += 2) {
      const v1 = vouchersToPrint[i];
      const v2 = (i + 1 < vouchersToPrint.length) ? vouchersToPrint[i + 1] : null;

      sheetsHtml += `
        <div class="voucher-sheet">
          <!-- Top: Payment Voucher 1 -->
          ${buildPaymentVoucherCardHtml(v1, '')}

          <!-- Cut Line Divider -->
          <div class="voucher-cut-line">
            ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          </div>

          <!-- Bottom: Payment Voucher 2 (or blank placeholder if odd count) -->
          ${v2 ? buildPaymentVoucherCardHtml(v2, '') : '<div class="voucher-card-placeholder" style="height:130mm; visibility:hidden;"></div>'}
        </div>
      `;
    }

    printArea.innerHTML = sheetsHtml;

    document.body.classList.remove('print-register-mode');
    document.body.classList.add('print-voucher-mode');

    const cleanSoc = (societyDetails.societyName || 'Society').replace(/[^a-zA-Z0-9_-]/g, '_');
    const origTitle = document.title;
    document.title = `${cleanSoc}_Payment_Vouchers_Continuous`;

    window.print();

    const cleanup = () => {
      document.title = origTitle;
      document.body.classList.remove('print-voucher-mode');
      printArea.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 2000);
  };

  // Helper: Print a single voucher with duplicate
  window.printSingleVoucher = function (voucherNo) {
    printVouchersWithDuplicate(voucherNo);
  };

  // Build Individual Payment Voucher Card (100% Faithful to Image 2)
  function buildPaymentVoucherCardHtml(v, copyType) {
    const sName = (societyDetails.societyName || 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.').trim();
    const regNo = (societyDetails.registrationNo || 'BOM/WSG/TC/9121/2001-2005 DT. 17.08.2004').trim();
    const addr = societyDetails.address || 'KHANDELWAL MARG, NEAR USHA NAGAR, BHANDUP(WEST)';
    const city = societyDetails.city || 'MUMBAI';
    const pin = societyDetails.pincode || '400 078';
    const email = societyDetails.email || 'shreesaiushachsl@gmail.com';
    const phone = societyDetails.phone || '+91 9987962108';

    let fullAddr = addr;
    if (city && !fullAddr.toUpperCase().includes(city.toUpperCase())) fullAddr += ', ' + city;
    if (pin && !fullAddr.includes(pin)) fullAddr += ' - ' + pin;

    const contactLine = `email Id: ${email} , Tel No.: ${phone}`;

    const vNo = v.voucherNo || '—';
    const vDate = formatDateDisplay(v.voucherDate);
    const payer = (v.personName || v.paidTo || 'Vendor / Payee').toUpperCase();

    // PAN / GSTIN display next to Pay to
    let panGstText = '';
    if (v.panNo && v.panNo !== '-') {
      panGstText = `(PAN NO: ${v.panNo})`;
    } else if (v.gstNo && v.gstNo !== '-') {
      panGstText = `(GSTIN: ${v.gstNo})`;
    } else if (v.gstin && v.gstin !== '-') {
      panGstText = `(GSTIN: ${v.gstin})`;
    }

    const paidBy = v.cashBankName || 'Cash / Bank Account';

    // Extract table items:
    // Debits = expenses / assets / taxes
    // Deductions = non-bank credits (like TDS, Retention) shown as -₹
    const items = (v.items && v.items.length > 0) ? v.items : synthesizeLines(v);

    function isBankOrCashAccount(item) {
      const c = (item.accountCode || '').toLowerCase();
      const n = (item.accountName || '').toLowerCase();
      return c.startsWith('20') || n.includes('bank') || n.includes('cash') || n.includes('petty');
    }

    const debitItems = items.filter(it => parseFloat(it.debit) > 0.005);
    const deductionItems = items.filter(it => parseFloat(it.credit) > 0.005 && !isBankOrCashAccount(it));

    let rowsToRender = [];
    debitItems.forEach(it => {
      rowsToRender.push({
        particular: it.accountName || 'Particular',
        amount: parseFloat(it.debit) || 0,
        isDeduction: false
      });
    });

    deductionItems.forEach(it => {
      rowsToRender.push({
        particular: it.accountName || 'Deduction / TDS',
        amount: parseFloat(it.credit) || 0,
        isDeduction: true
      });
    });

    if (rowsToRender.length === 0) {
      rowsToRender.push({
        particular: v.particular1 || 'Payment / Expense',
        amount: parseFloat(v.amount) || 0,
        isDeduction: false
      });
    }

    const itemRowsHtml = rowsToRender.map(r => `
      <tr>
        <td class="td-part">${escHtml(r.particular)}</td>
        <td class="td-amt">${r.isDeduction ? '-' : ''}${formatINR(r.amount)}</td>
      </tr>
    `).join('');

    const totalAmt = parseFloat(v.amount) || (debitItems.reduce((s, x) => s + (parseFloat(x.debit) || 0), 0) - deductionItems.reduce((s, x) => s + (parseFloat(x.credit) || 0), 0));
    const words = convertToIndianWords(totalAmt);

    // Instrument line (Cheque / Cash / Mode)
    let instrLine = '';
    if (v.chqNo && v.chqNo !== '-') {
      const cDate = v.chqDate ? formatDateDisplay(v.chqDate) : vDate;
      instrLine = `Cheque No. &nbsp;&nbsp;<strong>${escHtml(v.chqNo)}</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; dated &nbsp;&nbsp; <strong>${escHtml(cDate)}</strong>`;
    } else {
      const cb = (v.cashBankName || v.cashBankCode || '').toLowerCase();
      if (cb.includes('cash') || (v.transType === 'Cash')) {
        instrLine = `Payment Mode: &nbsp;&nbsp;<strong>Cash</strong>`;
      } else {
        instrLine = `Mode / Ref: &nbsp;&nbsp;<strong>${escHtml(v.refNo || v.cashBankName || 'Bank Transfer')}</strong>`;
      }
    }

    // Narration line (TOWARDS ...)
    const { line1, line2 } = getNarrationLines(v);
    let narrText = line1 || v.narration || '';
    if (line2 && line2 !== line1) narrText += (narrText ? ' ' : '') + line2;
    if (!narrText) narrText = `AMOUNT PAID TOWARDS ${escHtml(rowsToRender[0]?.particular || 'EXPENSES')}`;

    return `
      <div class="voucher-card">
        <div class="vcard-header">
          <div class="vcard-title">Payment Voucher</div>
          <div class="vcard-soc-name">${escHtml(sName)}</div>
          <div class="vcard-soc-reg">Registration No.: ${escHtml(regNo)}</div>
          <div class="vcard-soc-addr">Address: ${escHtml(fullAddr)}.</div>
          <div class="vcard-soc-contact">${escHtml(contactLine)}</div>
          ${copyType ? `<div class="vcard-copy-badge">${escHtml(copyType)}</div>` : ''}
        </div>

        <div class="vcard-hr"></div>

        <div class="vcard-meta-row">
          <div class="vcard-meta-left">
            Pay to : &nbsp;&nbsp;<strong>${escHtml(payer)}</strong> ${panGstText ? `<span class="vcard-pan-tag">&nbsp;&nbsp;${escHtml(panGstText)}</span>` : ''}
          </div>
          <div class="vcard-meta-right">
            Pymt No. : &nbsp;&nbsp;<strong>${escHtml(vNo)}</strong>
          </div>
        </div>

        <div class="vcard-meta-row" style="margin-top:1px;">
          <div class="vcard-meta-left">
            Paid by : &nbsp;&nbsp;<strong>${escHtml(paidBy)}</strong>
          </div>
          <div class="vcard-meta-right">
            Date : &nbsp;&nbsp;<strong>${escHtml(vDate)}</strong>
          </div>
        </div>

        <div class="vcard-hr"></div>

        <div class="vcard-body-table-wrap">
          <table class="vcard-table">
            <thead>
              <tr>
                <th class="th-part">Particular</th>
                <th class="th-amt">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHtml}
            </tbody>
          </table>

          <div class="vcard-total-row">
            <div class="vcard-words">${escHtml(words)}</div>
            <div class="vcard-total-box">
              <span class="vcard-total-num">${formatINR(totalAmt)}</span>
            </div>
          </div>
        </div>

        <div class="vcard-hr"></div>

        <div class="vcard-footer-grid">
          <div class="vcard-footer-left">
            <div class="vcard-chq-text">${instrLine}</div>
            <div class="vcard-narr-text">${escHtml(narrText)}</div>
          </div>
          <div class="vcard-footer-right">
            <div class="vcard-receiver-box"></div>
            <div class="vcard-receiver-lbl">Receiver Signature</div>
          </div>
        </div>

        <div class="vcard-sign-row">
          <span class="vcard-sign-col">Chairman</span>
          <span class="vcard-sign-col">Secretary</span>
          <span class="vcard-sign-col">Treasurer</span>
          <span class="vcard-sign-col" style="text-align:right;">Receiver Signature</span>
        </div>
      </div>
    `;
  }

  // Convert numbers to Indian Rupees words
  function convertToIndianWords(amt) {
    if (typeof window.amountInWords === 'function') {
      try {
        const res = window.amountInWords(amt);
        if (res && res !== 'Rupees Zero Only') return res;
      } catch (e) {}
    }

    const num = Math.round(parseFloat(amt) || 0);
    if (num === 0) return 'Rupees Zero Only';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function numToWords(n) {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
    }

    let words = '';
    let n = num;
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    const rest = n;

    if (crore) words += numToWords(crore) + ' Crore ';
    if (lakh) words += numToWords(lakh) + ' Lakh ';
    if (thousand) words += numToWords(thousand) + ' Thousand ';
    if (rest) words += numToWords(rest);

    return 'Rupees ' + words.trim() + ' Only';
  }

  // ── 9. VIEW VOUCHER DETAILS MODAL ───────────────────────────────────────
  window.viewVoucherDetails = function (voucherNo) {
    const v = rawVouchers.find(x => String(x.voucherNo) === String(voucherNo));
    if (!v) return;

    const items = (v.items && v.items.length > 0) ? v.items : synthesizeLines(v);
    const itemRows = items.map(i => `
      <tr>
        <td style="font-family:monospace;font-weight:700;">${escHtml(i.accountCode || '—')}</td>
        <td>${escHtml(i.accountName || '—')}</td>
        <td style="text-align:right;font-family:monospace;">${parseFloat(i.debit) > 0 ? '₹ ' + formatINR(i.debit) : '—'}</td>
        <td style="text-align:right;font-family:monospace;">${parseFloat(i.credit) > 0 ? '₹ ' + formatINR(i.credit) : '—'}</td>
      </tr>
    `).join('');

    const modalHtml = `
      <div id="vDetailModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
        <div style="background:#ffffff;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.2);width:90%;max-width:650px;overflow:hidden;border:1px solid #cbd5e1;">
          <div style="background:#0D47A1;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:13px;font-weight:700;">
              <i class="bi bi-file-earmark-check"></i> Payment Voucher Details: #${escHtml(v.voucherNo)}
            </div>
            <button onclick="document.getElementById('vDetailModalBackdrop').remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">&times;</button>
          </div>
          <div style="padding:16px;max-height:80vh;overflow:auto;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px;background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:12px;">
              <div><strong>Voucher Date:</strong> ${formatDateDisplay(v.voucherDate)}</div>
              <div><strong>Bank/Cash A/c:</strong> ${escHtml(v.cashBankName || '—')}</div>
              <div><strong>Payee / Vendor:</strong> ${escHtml(v.personName || '—')}</div>
              <div><strong>Total Amount:</strong> <span style="font-weight:800;color:#0D47A1;">₹ ${formatINR(v.amount)}</span></div>
              ${v.chqNo ? `<div><strong>Cheque No:</strong> ${escHtml(v.chqNo)}</div>` : ''}
              ${v.chqDate ? `<div><strong>Cheque Date:</strong> ${formatDateDisplay(v.chqDate)}</div>` : ''}
            </div>

            <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;" border="1" bordercolor="#e2e8f0">
              <thead style="background:#f1f5f9;color:#334155;">
                <tr>
                  <th style="padding:6px;text-align:left;">Code</th>
                  <th style="padding:6px;text-align:left;">Account Head</th>
                  <th style="padding:6px;text-align:right;">Debit (₹)</th>
                  <th style="padding:6px;text-align:right;">Credit (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>

            ${(() => {
              const { line1, line2 } = getNarrationLines(v);
              if (!line1 && !line2) return '';
              return `
                <div style="font-size:11px;background:#f8fafc;padding:8px 12px;border-left:3px solid #0D47A1;border-radius:4px;color:#475569;">
                  <strong>Narration:</strong><br>
                  ${line1 ? `<div>${escHtml(line1)}</div>` : ''}
                  ${line2 ? `<div style="margin-top:3px;color:#64748b;">${escHtml(line2)}</div>` : ''}
                </div>
              `;
            })()}
          </div>
          <div style="background:#f8fafc;padding:10px 16px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #e2e8f0;">
            <button onclick="document.getElementById('vDetailModalBackdrop').remove()" class="reg-btn">Close</button>
            <button onclick="document.getElementById('vDetailModalBackdrop').remove(); printSingleVoucher('${escHtml(v.voucherNo)}');" class="reg-btn reg-btn-primary"><i class="bi bi-printer"></i> Print Voucher</button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div.firstElementChild);
  };

  // ── UTILITIES ───────────────────────────────────────────────────────────
  function formatINR(val) {
    const num = parseFloat(val);
    if (isNaN(num) || Math.abs(num) < 0.005) return '0.00';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDateDisplay(dStr) {
    if (!dStr) return '—';
    const parts = dStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dStr;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
