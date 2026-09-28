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
    loadSocietyDetails();
    await loadAccountsList();
    await loadContraRegister();
  });

  // Society details state for professional voucher printing
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

    const pName = document.getElementById('prtSocName');
    if (pName) pName.textContent = societyDetails.societyName;
    const pSub = document.getElementById('prtSocSub');
    if (pSub) pSub.textContent = `Registration No: ${societyDetails.registrationNo} | ${societyDetails.city || 'Mumbai'}`;
  }

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
            particular1: c.particular1 || c.narration || '',
            particular2: c.particular2 || '',
            refNo: c.refNo || '',
            chqNo: c.chqNo || '',
            chqDate: c.chqDate || null,
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

  // Helper: Extract Line 1 and Line 2 narration/particulars
  function getNarrationLines(v) {
    let line1 = (v.particular1 || '').trim();
    let line2 = (v.particular2 || '').trim();

    if (!line1 && v.narration) {
      const parts = v.narration.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      line1 = parts[0] || '';
      if (!line2 && parts.length > 1) {
        line2 = parts.slice(1).join(' ');
      }
    } else if (line1 && !line2 && v.narration) {
      const narr = v.narration.trim();
      if (narr !== line1) {
        line2 = narr;
      }
    } else if (line1 && line2 && v.narration) {
      const narr = v.narration.trim();
      if (narr !== line1 && narr !== line2) {
        line2 += ` (${narr})`;
      }
    }

    if (!line1 && !line2) {
      line1 = 'Contra Voucher';
    }

    return { line1, line2 };
  }

  window.filterTable = function () {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const showCodes = document.getElementById('chk-voucher-no')?.checked ?? true;
    const accFilter = document.getElementById('accountSelect')?.value || 'all';

    let filtered = rawVouchers.filter(v => {
      if (q) {
        const vNo = (v.voucherNo || '').toLowerCase();
        const narr = (v.narration || '').toLowerCase();
        const p1 = (v.particular1 || '').toLowerCase();
        const p2 = (v.particular2 || '').toLowerCase();
        const amt = String(v.amount || '');
        const ref = (v.refNo || '').toLowerCase();
        const chq = (v.chqNo || '').toLowerCase();
        let matchText = vNo.includes(q) || narr.includes(q) || p1.includes(q) || p2.includes(q) || amt.includes(q) || ref.includes(q) || chq.includes(q);

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
      if (v.chqNo && v.chqNo !== '-') {
        metaChips += `<span class="reg-chip reg-chip-chq"><i class="bi bi-card-text"></i> Chq: ${escHtml(v.chqNo)}${v.chqDate ? ' (' + formatDate(v.chqDate) + ')' : ''}</span>`;
      }
      if (v.refNo) {
        metaChips += `<span class="reg-chip"><i class="bi bi-hash"></i> Ref: ${escHtml(v.refNo)}</span>`;
      }

      const { line1, line2 } = getNarrationLines(v);
      const narrBox = (line1 || line2 || metaChips)
        ? `<div class="reg-narr-box">
             ${metaChips ? `<div style="margin-bottom:2px;">${metaChips}</div>` : ''}
             ${line1 ? `<div class="reg-narr-line1">${escHtml(line1)}</div>` : ''}
             ${line2 ? `<div class="reg-narr-line2">${escHtml(line2)}</div>` : ''}
           </div>`
        : '';

      const printUrl = `../contra-voucher-print/contra-voucher-print.html?id=${vId}&vno=${encodeURIComponent(vNo)}`;

      // Main Row (Credit / Transfer From)
      html += `
        <tr class="reg-voucher-main">
          <td class="td-center" style="font-weight:700;">${vDateStr}</td>
          <td class="td-center">
            <a href="javascript:void(0)" onclick="viewVoucherDetails('${escHtml(vNo)}')" class="voucher-pill" title="Click to view details or print voucher #${escHtml(vNo)}">
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

  // ── 5. DIRECT PRINT ENGINES (CURRENT FORMAT & CONTINUOUS) ─────────────────

  // Option 1: Print standard Contra Register (Current format visible on screen)
  window.printRegister = function () {
    document.body.classList.remove('print-voucher-mode');
    document.body.classList.add('print-register-mode');

    loadSocietyDetails();
    updatePrintDates();

    const socName = (societyDetails.societyName || 'Society').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fromVal = document.getElementById('fromDate')?.value || '';
    const toVal = document.getElementById('toDate')?.value || '';
    const origTitle = document.title;
    document.title = `${socName}_Contra_Register_${fromVal}_${toVal}`;

    window.print();

    const resetTitle = () => {
      document.title = origTitle;
      document.body.classList.remove('print-register-mode');
      window.removeEventListener('afterprint', resetTitle);
    };
    window.addEventListener('afterprint', resetTitle);
    setTimeout(resetTitle, 2000);
  };

  // Option 2: Print Continuous (No duplicates; exactly 2 distinct contra vouchers per single A4 page)
  window.printVouchersContinuous = async function (singleVoucherNo) {
    await loadSocietyDetails();

    let vouchersToPrint = [];
    if (singleVoucherNo) {
      const v = rawVouchers.find(x => String(x.voucherNo) === String(singleVoucherNo));
      if (v) vouchersToPrint = [v];
    } else {
      vouchersToPrint = [...rawVouchers];
      const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
      const accFilter = document.getElementById('accountSelect')?.value || 'all';
      if (q || (accFilter && accFilter !== 'all')) {
        vouchersToPrint = rawVouchers.filter(v => {
          if (q) {
            const vNo = (v.voucherNo || '').toLowerCase();
            const narr = (v.narration || '').toLowerCase();
            const amt = String(v.amount || '');
            if (!vNo.includes(q) && !narr.includes(q) && !amt.includes(q)) return false;
          }
          if (accFilter && accFilter !== 'all') {
            const needle = accFilter.toLowerCase();
            const cb = (v.cashBankCode || '' + v.cashBankName || '').toLowerCase();
            if (!cb.includes(needle)) return false;
          }
          return true;
        });
      }
    }

    if (vouchersToPrint.length === 0) {
      alert('No contra vouchers found to print.');
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
          <!-- Top: Contra Voucher 1 -->
          ${buildContraVoucherCardHtml(v1)}

          <!-- Cut Line Divider -->
          <div class="voucher-cut-line">
            ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          </div>

          <!-- Bottom: Contra Voucher 2 (or placeholder if odd total) -->
          ${v2 ? buildContraVoucherCardHtml(v2) : '<div class="voucher-card-placeholder" style="height:130mm; visibility:hidden;"></div>'}
        </div>
      `;
    }

    printArea.innerHTML = sheetsHtml;

    document.body.classList.remove('print-register-mode');
    document.body.classList.add('print-voucher-mode');

    const cleanSoc = (societyDetails.societyName || 'Society').replace(/[^a-zA-Z0-9_-]/g, '_');
    const origTitle = document.title;
    document.title = `${cleanSoc}_Contra_Vouchers_Continuous`;

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

  // Helper: Print a single contra voucher
  window.printSingleVoucher = function (voucherNo) {
    printVouchersContinuous(voucherNo);
  };

  // Build Individual Contra Voucher Card (Faithful to Image 2 design, 130mm height)
  function buildContraVoucherCardHtml(v) {
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
    const vDateStr = formatDate(v.voucherDate);
    const vAmt = parseFloat(v.amount) || 0;

    const items = Array.isArray(v.items) && v.items.length > 0 ? v.items : [];
    let fromItem = items.find(it => parseFloat(it.credit) > 0);
    let toItem = items.find(it => parseFloat(it.debit) > 0);

    if (!fromItem && !toItem) {
      fromItem = { accountName: v.cashBankName || 'Cash in Hand (Source)', credit: vAmt };
      toItem = { accountName: v.personName || 'Bank Account (Destination)', debit: vAmt };
    }

    const fromAccName = fromItem ? fromItem.accountName : (v.cashBankName || 'Cash/Bank (Source)');
    const toAccName = toItem ? toItem.accountName : (v.personName || 'Bank/Cash (Destination)');
    const crAmt = fromItem ? (parseFloat(fromItem.credit) || vAmt) : vAmt;
    const drAmt = toItem ? (parseFloat(toItem.debit) || vAmt) : vAmt;

    // Detect transfer type
    let transType = 'Fund Transfer';
    const fLower = fromAccName.toLowerCase();
    const tLower = toAccName.toLowerCase();
    if (fLower.includes('cash') && tLower.includes('bank')) {
      transType = 'Cash Deposit into Bank';
    } else if (fLower.includes('bank') && tLower.includes('cash')) {
      transType = 'Cash Withdrawal from Bank';
    } else if (fLower.includes('bank') && tLower.includes('bank')) {
      transType = 'Inter-Bank Transfer';
    }

    // Instrument line
    let instrLine = '';
    if (v.chqNo && v.chqNo !== '-') {
      const cDate = v.chqDate ? formatDate(v.chqDate) : vDateStr;
      instrLine = `Cheque No. &nbsp;&nbsp;<strong>${escHtml(v.chqNo)}</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; dated &nbsp;&nbsp; <strong>${escHtml(cDate)}</strong>`;
    } else if (v.refNo) {
      instrLine = `Mode / Ref: &nbsp;&nbsp;<strong>${escHtml(v.refNo)}</strong>`;
    } else {
      instrLine = `Mode: &nbsp;&nbsp;<strong>Fund Transfer Entry</strong>`;
    }

    // Narration
    const { line1, line2 } = getNarrationLines(v);
    let narrText = line1 || v.narration || '';
    if (line2 && line2 !== line1) narrText += (narrText ? ' ' : '') + line2;
    if (!narrText) narrText = `TOWARDS ${transType.toUpperCase()}`;

    const words = convertToIndianWords(vAmt);

    return `
      <div class="voucher-card">
        <div class="vcard-header">
          <div class="vcard-title">Contra Voucher</div>
          <div class="vcard-soc-name">${escHtml(sName)}</div>
          <div class="vcard-soc-reg">Registration No.: ${escHtml(regNo)}</div>
          <div class="vcard-soc-addr">Address: ${escHtml(fullAddr)}.</div>
          <div class="vcard-soc-contact">${escHtml(contactLine)}</div>
        </div>

        <div class="vcard-hr"></div>

        <div class="vcard-meta-row">
          <div class="vcard-meta-left">
            Transfer Type : &nbsp;&nbsp;<strong>${escHtml(transType)}</strong>
          </div>
          <div class="vcard-meta-right">
            Contra No. : &nbsp;&nbsp;<strong>${escHtml(vNo)}</strong>
          </div>
        </div>

        <div class="vcard-meta-row" style="margin-top:1px;">
          <div class="vcard-meta-left">
            From (Source A/c) : &nbsp;&nbsp;<strong>${escHtml(fromAccName)}</strong>
          </div>
          <div class="vcard-meta-right">
            Date : &nbsp;&nbsp;<strong>${escHtml(vDateStr)}</strong>
          </div>
        </div>

        <div class="vcard-meta-row" style="margin-top:1px;">
          <div class="vcard-meta-left">
            To (Destination A/c) : &nbsp;&nbsp;<strong>${escHtml(toAccName)}</strong>
          </div>
          <div class="vcard-meta-right">
            ${v.refNo ? `Ref: &nbsp;&nbsp;<strong>${escHtml(v.refNo)}</strong>` : ''}
          </div>
        </div>

        <div class="vcard-hr"></div>

        <div class="vcard-body-table-wrap">
          <table class="vcard-table">
            <thead>
              <tr>
                <th class="th-part">Transfer Particulars</th>
                <th class="th-amt">Debit (₹)</th>
                <th class="th-amt">Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="td-part">To ${escHtml(toAccName)} (Inflow)</td>
                <td class="td-amt">${formatINR(drAmt)}</td>
                <td class="td-amt">—</td>
              </tr>
              <tr>
                <td class="td-part">By ${escHtml(fromAccName)} (Outflow)</td>
                <td class="td-amt">—</td>
                <td class="td-amt">${formatINR(crAmt)}</td>
              </tr>
            </tbody>
          </table>

          <div class="vcard-total-row">
            <div class="vcard-words">${escHtml(words)}</div>
            <div class="vcard-total-box">
              <span class="vcard-total-num">Total: ₹ ${formatINR(vAmt)}</span>
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
            <div class="vcard-receiver-lbl">Passed By / Cashier</div>
          </div>
        </div>

        <div class="vcard-sign-row">
          <span class="vcard-sign-col">Prepared By</span>
          <span class="vcard-sign-col">Checked By</span>
          <span class="vcard-sign-col">Hon. Secretary</span>
          <span class="vcard-sign-col" style="text-align:right;">Treasurer</span>
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

  // ── 6. VIEW CONTRA VOUCHER DETAILS MODAL ─────────────────────────────────
  window.viewVoucherDetails = function (voucherNo) {
    const v = rawVouchers.find(x => String(x.voucherNo) === String(voucherNo));
    if (!v) return;

    const vAmt = parseFloat(v.amount) || 0;
    const items = Array.isArray(v.items) && v.items.length > 0 ? v.items : [];
    let fromItem = items.find(it => parseFloat(it.credit) > 0);
    let toItem = items.find(it => parseFloat(it.debit) > 0);
    if (!fromItem && !toItem) {
      fromItem = { accountCode: v.cashBankCode || 'ASS-1001', accountName: v.cashBankName || 'Cash in Hand', credit: vAmt, debit: 0 };
      toItem = { accountCode: 'ASS-1002', accountName: v.personName || 'Bank Account', debit: vAmt, credit: 0 };
    }

    const { line1, line2 } = getNarrationLines(v);

    const modalHtml = `
      <div id="vDetailModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
        <div style="background:#ffffff;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.2);width:90%;max-width:650px;overflow:hidden;border:1px solid #cbd5e1;">
          <div style="background:#0D47A1;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:13px;font-weight:700;">
              <i class="bi bi-arrow-left-right"></i> Contra Voucher Details: #${escHtml(v.voucherNo)}
            </div>
            <button onclick="document.getElementById('vDetailModalBackdrop').remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">&times;</button>
          </div>
          <div style="padding:16px;max-height:80vh;overflow:auto;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px;background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:12px;">
              <div><strong>Voucher Date:</strong> ${formatDate(v.voucherDate)}</div>
              <div><strong>Transfer Amount:</strong> <span style="font-weight:800;color:#0D47A1;">₹ ${formatINR(v.amount)}</span></div>
              <div><strong>Paid From (Cr):</strong> ${escHtml(fromItem ? fromItem.accountName : 'Source')}</div>
              <div><strong>Deposited To (Dr):</strong> ${escHtml(toItem ? toItem.accountName : 'Destination')}</div>
              ${v.chqNo ? `<div><strong>Cheque No:</strong> ${escHtml(v.chqNo)}</div>` : ''}
              ${v.chqDate ? `<div><strong>Cheque Date:</strong> ${formatDate(v.chqDate)}</div>` : ''}
              ${v.refNo ? `<div><strong>Reference:</strong> ${escHtml(v.refNo)}</div>` : ''}
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
                <tr>
                  <td style="padding:6px;font-family:monospace;font-weight:700;">${escHtml(toItem?.accountCode || '—')}</td>
                  <td style="padding:6px;">${escHtml(toItem?.accountName || '—')}</td>
                  <td style="padding:6px;text-align:right;font-family:monospace;color:#15803d;font-weight:700;">₹ ${formatINR(toItem?.debit || vAmt)}</td>
                  <td style="padding:6px;text-align:right;font-family:monospace;">—</td>
                </tr>
                <tr>
                  <td style="padding:6px;font-family:monospace;font-weight:700;">${escHtml(fromItem?.accountCode || '—')}</td>
                  <td style="padding:6px;">${escHtml(fromItem?.accountName || '—')}</td>
                  <td style="padding:6px;text-align:right;font-family:monospace;">—</td>
                  <td style="padding:6px;text-align:right;font-family:monospace;color:#b91c1c;font-weight:700;">₹ ${formatINR(fromItem?.credit || vAmt)}</td>
                </tr>
              </tbody>
            </table>

            ${(line1 || line2) ? `
              <div style="font-size:11px;background:#f8fafc;padding:8px 12px;border-left:3px solid #0D47A1;border-radius:4px;color:#475569;">
                <strong>Narration:</strong><br>
                ${line1 ? `<div>${escHtml(line1)}</div>` : ''}
                ${line2 ? `<div style="margin-top:3px;color:#64748b;">${escHtml(line2)}</div>` : ''}
              </div>
            ` : ''}
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
