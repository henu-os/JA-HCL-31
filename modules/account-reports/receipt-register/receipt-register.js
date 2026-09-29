/**
 * receipt-register.js — JEEVIKA ERP v2
 * Comprehensive Statutory Receipt Voucher Register (Other Receipts & Inflows)
 * Interactive ERP Software UX, KPI Metrics, Double-Entry Verification, Print & Excel Engine
 */

(function () {
  'use strict';

  let rawVouchers = [];
  let filteredVouchers = [];
  let cashBankAccounts = [];
  let membersList = [];
  let selectedMember = 'all';
  let selectedPrintFormat = 'register';

  let societyDetails = {
    societyName: 'CO-OPERATIVE HOUSING SOCIETY LTD.',
    registrationNo: '',
    address: '',
    city: '',
    pincode: '',
    email: '',
    phone: ''
  };

  // ── 1. INITIALIZATION ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
    initDates();
    await loadSocietyDetails();
    await loadAccountsList();
    await loadMembersList();
    await loadReceiptRegister();
  });

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

  async function loadSocietyDetails() {
    const sid = getActiveSocietyId();
    const defaultName = (window.Auth && Auth.getSocietyName && Auth.getSocietyName() !== '—') 
      ? Auth.getSocietyName() 
      : (sessionStorage.getItem('activeSocietyName') || 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.');
    
    societyDetails.societyName = defaultName;

    try {
      if (window.API && API.get) {
        const res = await API.get(`/societies/${sid}`);
        if (res && res.success && res.data) {
          const s = res.data;
          societyDetails.societyName = s.societyName || defaultName;
          societyDetails.registrationNo = s.registrationNo || '';
          societyDetails.address = s.address || '';
          societyDetails.city = s.city || '';
          societyDetails.pincode = s.pincode || s.pinCode || '';
          societyDetails.email = s.email || '';
          societyDetails.phone = s.phone || s.contactPhone1 || '';
        }
      }
    } catch (e) {
      console.warn('Could not load full society details:', e);
    }

    const prtSoc = document.getElementById('prtSocName');
    if (prtSoc) prtSoc.textContent = societyDetails.societyName.toUpperCase();

    const prtSub = document.getElementById('prtSocSub');
    if (prtSub) {
      let subParts = [];
      if (societyDetails.registrationNo) subParts.push(`Registration No: ${societyDetails.registrationNo}`);
      if (societyDetails.city) subParts.push(societyDetails.city);
      prtSub.textContent = subParts.length > 0 ? subParts.join(' | ') : 'Registration No: BOM/HSG/0000 | Mumbai';
    }
  }

  function syncSocietyInfo() {
    loadSocietyDetails();
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
    loadReceiptRegister();
  };

  window.onDateChange = function () {
    const presetEl = document.getElementById('datePresetSelect');
    if (presetEl) presetEl.value = 'custom';
    updatePrintDates();
    loadReceiptRegister();
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

  // ── 2B. LOAD MEMBERS & PAYERS LIST ─────────────────────────────────────────
  async function loadMembersList() {
    const sid = getActiveSocietyId();
    try {
      if (window.API && API.get) {
        const res = await API.get(`/members?societyId=${sid}`);
        if (res && res.success && Array.isArray(res.data)) {
          membersList = res.data;
        } else if (Array.isArray(res)) {
          membersList = res;
        }
      }
    } catch (e) {
      console.warn('Could not load members list:', e);
    }
    renderMemberDropdownOptions();
  }

  function renderMemberDropdownOptions() {
    const memSel = document.getElementById('memberSelect');
    const pfMemSel = document.getElementById('pfMemberSelect');
    if (!memSel && !pfMemSel) return;

    const memberOptions = [];
    const seenNames = new Set();

    // From member master
    membersList.forEach(m => {
      const name = (m.memName || m.memName1 || '').trim();
      if (!name) return;
      const flat = [m.wing, m.flatNo].filter(Boolean).join('-');
      const label = flat ? `[${flat}] ${name}` : name;
      seenNames.add(name.toLowerCase());
      memberOptions.push({ value: name, label: label, sortKey: flat || name });
    });

    // Also collect distinct payers from loaded rawVouchers (e.g. parties, other payers)
    rawVouchers.forEach(v => {
      const p = (v.personName || v.paidTo || '').trim();
      if (p && p !== 'NONE' && p !== 'General' && !seenNames.has(p.toLowerCase())) {
        seenNames.add(p.toLowerCase());
        memberOptions.push({ value: p, label: p, sortKey: p });
      }
    });

    memberOptions.sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true }));

    let opts = '<option value="all">All Members / Payers</option>';
    memberOptions.forEach(o => {
      opts += `<option value="${escHtml(o.value)}">${escHtml(o.label)}</option>`;
    });

    if (memSel) {
      const cur = memSel.value;
      memSel.innerHTML = opts;
      if (cur && Array.from(memSel.options).some(x => x.value === cur)) {
        memSel.value = cur;
      }
    }

    if (pfMemSel) {
      const cur = pfMemSel.value;
      pfMemSel.innerHTML = opts;
      if (cur && Array.from(pfMemSel.options).some(x => x.value === cur)) {
        pfMemSel.value = cur;
      }
    }
  }

  window.onMemberFilterChange = function () {
    const memSel = document.getElementById('memberSelect');
    selectedMember = memSel ? memSel.value : 'all';

    const pfMemSel = document.getElementById('pfMemberSelect');
    if (pfMemSel) pfMemSel.value = selectedMember;

    updateModalMemberNotice();
    filterTable();
  };

  window.onModalMemberChange = function (val) {
    selectedMember = val || 'all';

    const memSel = document.getElementById('memberSelect');
    if (memSel) memSel.value = selectedMember;

    updateModalMemberNotice();
    filterTable();
  };

  function updateModalMemberNotice() {
    const textEl = document.getElementById('pfMemberAlertText');
    if (!textEl) return;
    if (selectedMember && selectedMember !== 'all') {
      textEl.innerHTML = `Selected: <strong>${escHtml(selectedMember)}</strong> — Will print <strong>2 identical copies on 1 page</strong> (Society Copy &amp; Member Copy).`;
    } else {
      textEl.textContent = 'When an individual member is selected, 2 identical copies will be printed on one page (Society Copy & Member Copy).';
    }
  }

  // ── 3. FETCH RECEIPT REGISTER ───────────────────────────────────────────
  window.loadReceiptRegister = async function () {
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
            Fetching live Receipt Register records...
          </td>
        </tr>
      `;
    }

    let records = [];

    try {
      let url = `/vouchers/register?societyId=${societyId}&type=OtherReceipt`;
      if (fromDate) url += `&fromDate=${fromDate}`;
      if (toDate) url += `&toDate=${toDate}`;
      if (accFilter && accFilter !== 'all') url += `&cashBankCode=${encodeURIComponent(accFilter)}`;

      const res = await API.get(url);
      if (res && res.success && Array.isArray(res.data)) {
        records = res.data;
      }
    } catch (err) {
      console.error('Live Receipt Register API error:', err);
      if (window.showToast) showToast('Failed to load real-time receipt entries.', 'error');
    }

    // Sort by voucherDate ASC, then voucherNo ASC
    records.sort((a, b) => {
      const dComp = (a.voucherDate || '').localeCompare(b.voucherDate || '');
      if (dComp !== 0) return dComp;
      return String(a.voucherNo || '').localeCompare(String(b.voucherNo || ''), undefined, { numeric: true });
    });

    rawVouchers = records;
    renderMemberDropdownOptions();
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
            No receipt vouchers found for the selected criteria.
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
      const items = (v.items && v.items.length > 0) ? v.items : synthesizeReceiptLines(v);

      let vDebitSum = 0;
      let vCreditSum = 0;

      items.forEach((item, itemIdx) => {
        const dAmt = parseFloat(item.debit) || 0;
        const cAmt = parseFloat(item.credit) || 0;
        vDebitSum += dAmt;
        vCreditSum += cAmt;

        const isFirst = (itemIdx === 0);
        const isLast = (itemIdx === items.length - 1);
        const code = item.accountCode || '';
        const name = item.accountName || 'Account';

        let codeClass = 'acc-code-inc';
        if (code.startsWith('20') || name.toLowerCase().includes('bank') || name.toLowerCase().includes('cash')) {
          codeClass = 'acc-code-bank';
        } else if (code.startsWith('35') || name.toLowerCase().includes('deposit')) {
          codeClass = 'acc-code-deposit';
        }

        const codeHtml = (showCodes && code) 
          ? `<span class="acc-code-pill ${codeClass}">${escHtml(code)}</span>` 
          : '';

        html += `
          <tr class="${isFirst ? 'reg-voucher-main' : 'reg-voucher-split'}">
            <!-- Date & Voucher No -->
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
                <span style="font-weight:${dAmt > 0 ? '700' : '500'};color:${dAmt > 0 ? '#0D47A1' : '#1e293b'};">
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

      const cbName = (v.cashBankName || '').toLowerCase();
      const vAmt = parseFloat(v.amount) || vDebitSum || 0;
      if (cbName.includes('cash')) {
        cashAmount += vAmt;
      } else {
        bankAmount += vAmt;
      }
    });

    tbody.innerHTML = html;

    updateKPIs(list.length, grandTotDebit, bankAmount, cashAmount);
    updateFooters(grandTotDebit, grandTotCredit);
  };

  // Helper: Extract Line 1 and Line 2 particulars / narration
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

    // If line2 is still empty, match "Other Receipt" behavior:
    // 1. Check item-level narration
    // 2. Check payment mode: Cash or Cheque / Bank (exactly like other-receipt.js line 408)
    if (!line2) {
      const itemNarr = (v.items || [])
        .map(it => (it.narration || '').trim())
        .find(n => n && n !== line1 && n !== (v.narration || '').trim());
      if (itemNarr) {
        line2 = itemNarr;
      } else {
        const cb = (v.cashBankName || v.cashBankCode || '').toLowerCase();
        const isCash = cb.includes('cash') || cb.includes('1001') || (v.transType === 'Cash');
        if (isCash) {
          line2 = 'Cash';
        } else if (v.chqNo && v.chqNo !== '-') {
          line2 = 'Cheque No: ' + v.chqNo;
        } else if (cb) {
          line2 = v.cashBankName || 'Bank';
        }
      }
    }

    return { line1, line2 };
  }

  function renderNarrationBox(v) {
    let chips = '';
    if (v.chqNo && v.chqNo !== '-') {
      chips += `<span class="reg-chip reg-chip-chq"><i class="bi bi-file-earmark-text"></i> ${escHtml(v.chqNo)}</span>`;
    }
    if (v.chqDate) {
      chips += `<span class="reg-chip"><i class="bi bi-calendar-event"></i> Dt: ${formatDateDisplay(v.chqDate)}</span>`;
    }
    const party = v.personName || v.paidTo;
    if (party && party !== 'NONE' && party !== 'General') {
      chips += `<span class="reg-chip reg-chip-party"><i class="bi bi-person"></i> Received from: ${escHtml(party)}</span>`;
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

  function synthesizeReceiptLines(v) {
    const amt = parseFloat(v.amount) || 0;
    const cbCode = v.cashBankCode || '204';
    const cbName = v.cashBankName || 'Bank Account';
    const headName = v.personName || v.particular1 || 'Income / Other Receipt';
    const headCode = 'INC';

    return [
      { accountCode: cbCode, accountName: cbName, debit: amt, credit: 0 },
      { accountCode: headCode, accountName: headName, debit: 0, credit: amt }
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

  // ── 6. REAL-TIME SEARCH & MEMBER FILTER ──────────────────────────────────
  window.filterTable = function () {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const mem = (selectedMember || 'all').toLowerCase().trim();

    filteredVouchers = rawVouchers.filter(v => {
      // 1. Member / Payer Filter
      if (mem !== 'all') {
        const p = (v.personName || v.paidTo || '').toLowerCase();
        const p1 = (v.particular1 || '').toLowerCase();
        const narr = (v.narration || '').toLowerCase();
        const matchesMember = p.includes(mem) || p1.includes(mem) || narr.includes(mem);
        if (!matchesMember) return false;
      }

      // 2. Search Query Filter
      if (!q) return true;

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
    rows.push([socName]);
    rows.push([`RECEIPT VOUCHER REGISTER FROM ${formatDateDisplay(fromDate)} TO ${formatDateDisplay(toDate)}`]);
    rows.push([]);

    rows.push(['Date', 'Rcpt No.', 'Code', 'Account Head & Particulars', 'Debit (₹)', 'Credit (₹)']);

    let totalDr = 0;
    let totalCr = 0;

    filteredVouchers.forEach(v => {
      const items = (v.items && v.items.length > 0) ? v.items : synthesizeReceiptLines(v);
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

      const { line1, line2 } = getNarrationLines(v);
      const narrText = [line1, line2].filter(Boolean).join(' | ');
      if (narrText) {
        rows.push(['', '', '', `Particulars: ${narrText}`, '', '']);
      }
    });

    rows.push([]);
    rows.push(['', 'TOTAL', '', 'TOTAL COLLECTIONS (BALANCED)', totalDr, totalCr]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    ws['!cols'] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 60 },
      { wch: 15 },
      { wch: 15 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Receipt Register');
    const cleanSoc = socName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    XLSX.writeFile(wb, `${cleanSoc}_Receipt_Register_${fromDate}_to_${toDate}.xlsx`);
  };

  // ── 8. PRINT FORMAT MODAL & MULTI-FORMAT PRINT ENGINE ────────────────────

  window.openPrintModal = function () {
    loadSocietyDetails();
    updatePrintDates();

    const memSel = document.getElementById('memberSelect');
    selectedMember = memSel ? memSel.value : 'all';

    const pfMemSel = document.getElementById('pfMemberSelect');
    if (pfMemSel) pfMemSel.value = selectedMember;

    updateModalMemberNotice();
    setPrintFormat(selectedPrintFormat || 'register');

    const modal = document.getElementById('printFormatModal');
    if (modal) modal.style.display = 'flex';
  };

  window.closePrintModal = function () {
    const modal = document.getElementById('printFormatModal');
    if (modal) modal.style.display = 'none';
  };

  window.handleModalBackdropClick = function (event) {
    if (event.target && event.target.id === 'printFormatModal') {
      closePrintModal();
    }
  };

  window.setPrintFormat = function (format) {
    selectedPrintFormat = format || 'register';

    const cardReg = document.getElementById('optCardRegister');
    const cardVou = document.getElementById('optCardVoucher');
    const radioReg = document.getElementById('pfRadioRegister');
    const radioVou = document.getElementById('pfRadioVoucher');

    if (selectedPrintFormat === 'register') {
      if (cardReg) cardReg.classList.add('active');
      if (cardVou) cardVou.classList.remove('active');
      if (radioReg) radioReg.checked = true;
    } else {
      if (cardVou) cardVou.classList.add('active');
      if (cardReg) cardReg.classList.remove('active');
      if (radioVou) radioVou.checked = true;
    }
  };

  window.confirmAndPrint = function () {
    closePrintModal();

    if (selectedPrintFormat === 'voucher') {
      printVoucherFormat();
    } else {
      printRegister();
    }
  };

  // Option 1: Print standard Receipt Register (Current format)
  window.printRegister = function () {
    document.body.classList.remove('print-voucher-mode');
    document.body.classList.add('print-register-mode');

    loadSocietyDetails();
    updatePrintDates();

    const socName = (societyDetails.societyName || 'Society').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const origTitle = document.title;
    document.title = `${socName}_Receipt_Register_${fromDate}_${toDate}`;

    window.print();

    const resetTitle = () => {
      document.title = origTitle;
      document.body.classList.remove('print-register-mode');
      window.removeEventListener('afterprint', resetTitle);
    };
    window.addEventListener('afterprint', resetTitle);
    setTimeout(resetTitle, 2000);
  };

  // Option 2: Print Receipt Voucher (Image 1 Format — Exactly 2 receipts per page)
  window.printVoucherFormat = function () {
    let vouchersToPrint = [];

    if (selectedMember && selectedMember !== 'all') {
      const mem = selectedMember.toLowerCase().trim();
      vouchersToPrint = rawVouchers.filter(v => {
        const p = (v.personName || v.paidTo || '').toLowerCase();
        const p1 = (v.particular1 || '').toLowerCase();
        const narr = (v.narration || '').toLowerCase();
        return p.includes(mem) || p1.includes(mem) || narr.includes(mem);
      });
    } else {
      vouchersToPrint = [...filteredVouchers];
    }

    if (vouchersToPrint.length === 0) {
      if (window.showToast) {
        showToast('No receipt vouchers found to print for the selected criteria.', 'warning');
      } else {
        alert('No receipt vouchers found to print for the selected criteria.');
      }
      return;
    }

    const printArea = document.getElementById('voucherPrintArea');
    if (!printArea) return;

    // Generate sheets: exactly 2 vouchers per page (Society Copy & Member Copy)
    let sheetsHtml = '';
    vouchersToPrint.forEach(v => {
      sheetsHtml += buildVoucherSheetHtml(v);
    });

    printArea.innerHTML = sheetsHtml;

    document.body.classList.remove('print-register-mode');
    document.body.classList.add('print-voucher-mode');

    const cleanSoc = (societyDetails.societyName || 'Society').replace(/[^a-zA-Z0-9_-]/g, '_');
    const memberTag = (selectedMember && selectedMember !== 'all') ? `_${selectedMember.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
    const origTitle = document.title;
    document.title = `${cleanSoc}_Receipt_Voucher${memberTag}`;

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

  // Build Voucher Sheet (Containing exactly 2 vouchers on one page: Top Society Copy, Bottom Member Copy)
  function buildVoucherSheetHtml(v) {
    return `
      <div class="voucher-sheet">
        <!-- Top: Society Copy -->
        ${buildVoucherCardHtml(v, 'Society Copy')}

        <!-- Cut Line Divider -->
        <div class="voucher-cut-line">
          ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        </div>

        <!-- Bottom: Member Copy (Identical Counterpart) -->
        ${buildVoucherCardHtml(v, 'Member Copy')}
      </div>
    `;
  }

  // Build Individual Voucher Card (Faithful to Image 1 Layout)
  function buildVoucherCardHtml(v, copyType) {
    const sName = (societyDetails.societyName || 'Tagore Nagar Shree Dattasai Sahakari Gruhnirman Sanstha Maryadit.').trim();
    const regNo = (societyDetails.registrationNo || 'MUM/MHADB/HSG/(TC)/12570/YEAR-2005-06').trim();
    const addr = societyDetails.address || 'Chawl No. 103 to 107, Tagore Nagar, Group No 6, Vikhroli (East)';
    const city = societyDetails.city || 'Mumbai';
    const pin = societyDetails.pincode || '400 083';
    const email = societyDetails.email || '';
    const phone = societyDetails.phone || '';

    let fullAddr = addr;
    if (city && !fullAddr.includes(city)) fullAddr += ', ' + city;
    if (pin && !fullAddr.includes(pin)) fullAddr += ' - ' + pin;

    const contactLine = `email Id: ${email}, Tel No.: ${phone}`;

    const vNo = v.voucherNo || '—';
    const vDate = formatDateDisplay(v.voucherDate);
    const payer = (v.personName || v.paidTo || 'Member / Payer').toUpperCase();

    // Extract Credit breakdown lines (Particulars & Amount)
    const items = (v.items && v.items.length > 0) ? v.items : synthesizeReceiptLines(v);
    let creditItems = items.filter(it => parseFloat(it.credit) > 0.005);
    if (creditItems.length === 0) {
      creditItems = [{ accountName: v.particular1 || 'Income / Other Receipt', credit: v.amount }];
    }

    const itemRowsHtml = creditItems.map(it => `
      <tr>
        <td class="td-part">${escHtml(it.accountName || 'Particular')}</td>
        <td class="td-amt">${formatINR(it.credit)}</td>
      </tr>
    `).join('');

    const totalAmt = parseFloat(v.amount) || creditItems.reduce((acc, it) => acc + (parseFloat(it.credit) || 0), 0);
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

    // Narration line (BY ...)
    const { line1 } = getNarrationLines(v);
    let narrText = line1 || v.narration || 'ENTRANCE & TRANSFER FEES RECEIVED';
    if (!narrText.toUpperCase().startsWith('BY ')) {
      narrText = 'BY ' + narrText;
    }

    return `
      <div class="voucher-card">
        <div class="vcard-header">
          <div class="vcard-title">Receipt Voucher</div>
          <div class="vcard-soc-name">${escHtml(sName)}</div>
          <div class="vcard-soc-reg">Registration No : ${escHtml(regNo)}</div>
          <div class="vcard-soc-addr">Address: ${escHtml(fullAddr)}.</div>
          <div class="vcard-soc-contact">${escHtml(contactLine)}</div>
          <div class="vcard-copy-badge">${escHtml(copyType)}</div>
        </div>

        <div class="vcard-hr"></div>

        <div class="vcard-meta-row">
          <div class="vcard-meta-no">No. : &nbsp;&nbsp;&nbsp;&nbsp;<strong>${escHtml(vNo)}</strong></div>
          <div class="vcard-meta-date">Date : &nbsp;<strong>${escHtml(vDate)}</strong></div>
        </div>

        <div class="vcard-payer-row">
          <span class="vcard-thanks-box">Received with Thanks from</span>
          <span class="vcard-payer-name">${escHtml(payer)}</span>
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
            <div class="vcard-disclaimer">Subject to realisation of cheque(s)</div>
          </div>
          <div class="vcard-footer-right">
            <div class="vcard-sign-soc">${escHtml(sName)}</div>
            <div class="vcard-sign-space"></div>
            <div class="vcard-sign-title">Hon.Secretary/Treasurer</div>
          </div>
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

    const items = (v.items && v.items.length > 0) ? v.items : synthesizeReceiptLines(v);
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
              <i class="bi bi-file-earmark-check"></i> Receipt Voucher Details: #${escHtml(v.voucherNo)}
            </div>
            <button onclick="document.getElementById('vDetailModalBackdrop').remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">&times;</button>
          </div>
          <div style="padding:16px;max-height:80vh;overflow:auto;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px;background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:12px;">
              <div><strong>Voucher Date:</strong> ${formatDateDisplay(v.voucherDate)}</div>
              <div><strong>Received Into:</strong> ${escHtml(v.cashBankName || '—')}</div>
              <div><strong>Received From:</strong> ${escHtml(v.personName || '—')}</div>
              <div><strong>Total Amount:</strong> <span style="font-weight:800;color:#16a34a;">₹ ${formatINR(v.amount)}</span></div>
              ${v.chqNo ? `<div><strong>Instrument / Ref:</strong> ${escHtml(v.chqNo)}</div>` : ''}
              ${v.chqDate ? `<div><strong>Date:</strong> ${formatDateDisplay(v.chqDate)}</div>` : ''}
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

            ${v.narration ? `
              <div style="font-size:11px;background:#f8fafc;padding:8px 12px;border-left:3px solid #10b981;border-radius:4px;color:#475569;">
                <strong>Narration:</strong><br>${escHtml(v.narration)}
              </div>
            ` : ''}
          </div>
          <div style="background:#f8fafc;padding:10px 16px;display:flex;justify-content:flex-end;border-top:1px solid #e2e8f0;">
            <button onclick="document.getElementById('vDetailModalBackdrop').remove()" class="reg-btn">Close</button>
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
