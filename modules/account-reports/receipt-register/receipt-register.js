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

// 100% Real-Time Synchronized with Backend SocVoucherHeader & SocVoucherDetail

  // ── 1. INITIALIZATION ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;
    initDates();
    syncSocietyInfo();
    await loadAccountsList();
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

  function renderNarrationBox(v) {
    const narr = v.narration || '';
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

    const desc = narr || v.particular1 || '';
    if (!chips && !desc) return '';

    return `
      <div class="reg-narr-box">
        ${chips ? `<div style="margin-bottom:3px;">${chips}</div>` : ''}
        ${desc ? `<div>${escHtml(desc)}</div>` : ''}
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
    document.getElementById('kpiTotalVouchers').textContent = count.toLocaleString('en-IN');
    document.getElementById('kpiTotalAmount').textContent = '₹ ' + formatINR(total);
    document.getElementById('kpiBankAmount').textContent = '₹ ' + formatINR(bank);
    document.getElementById('kpiCashAmount').textContent = '₹ ' + formatINR(cash);
    document.getElementById('recordCountLabel').textContent = `${count} Vouchers Displayed`;
  }

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
        const chq = (v.chqNo || '').toLowerCase();
        const itemsMatch = (v.items || []).some(item => 
          (item.accountName || '').toLowerCase().includes(q) ||
          (item.accountCode || '').toLowerCase().includes(q)
        );

        return vNo.includes(q) || cb.includes(q) || p.includes(q) || n.includes(q) || chq.includes(q) || itemsMatch;
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

      if (v.narration) {
        rows.push(['', '', '', `Narration: ${v.narration}`, '', '']);
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

  // ── 8. PRINT REGISTER ───────────────────────────────────────────────────
  window.printRegister = function () {
    updatePrintDates();
    window.print();
  };

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
