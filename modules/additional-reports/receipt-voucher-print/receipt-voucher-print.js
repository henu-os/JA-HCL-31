/**
 * ═════════════════════════════════════════════════════════════════════
 * JEEVIKA ERP v2 — RECEIPT VOUCHER PRINT CONTROLLER
 * ═════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  let allVouchers = [];
  let filteredVouchers = [];
  const selectedVoucherIds = new Set();

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Auth !== 'undefined' && !Auth.requireContext()) return;

    await VoucherPrintCommon.fetchSocietyInfo();
    VoucherPrintCommon.initFYDates('fromDate', 'toDate');
    await loadCashBankAccounts();
    await loadReceiptVouchers();

    // Check URL parameters for direct voucher preview
    checkUrlParams();
  });

  // ── 1. LOAD CASH & BANK ACCOUNTS ─────────────────────────────────
  async function loadCashBankAccounts() {
    const sel = document.getElementById('accountSelect');
    if (!sel) return;

    try {
      const sid = VoucherPrintCommon.getActiveSocietyId();
      let res = await API.get(`/accounts/cash-bank?societyId=${sid}`);
      if (!res || !res.success || !Array.isArray(res.data) || res.data.length === 0) {
        // Fallback to all accounts
        res = await API.get(`/accounts?societyId=${sid}`);
      }

      if (res && res.data && Array.isArray(res.data)) {
        sel.innerHTML = '<option value="all">All Cash &amp; Bank Accounts</option>';
        res.data.forEach(acc => {
          const opt = document.createElement('option');
          opt.value = acc.accCode || acc.code || acc.accountId;
          opt.textContent = `${acc.accCode ? acc.accCode + ' - ' : ''}${acc.accName || acc.name}`;
          sel.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('[ReceiptVoucherPrint] loadCashBankAccounts error:', e);
    }
  }

  // ── 2. LOAD RECEIPT VOUCHERS FROM BACKEND ───────────────────────────
  window.loadReceiptVouchers = async function () {
    const sid = VoucherPrintCommon.getActiveSocietyId();
    const fyId = VoucherPrintCommon.getActiveFYId();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const cbCode = document.getElementById('accountSelect')?.value || 'all';
    const vNo = document.getElementById('vouchNoFilter')?.value || '';

    const tbody = document.getElementById('receiptTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin" style="font-size:20px;display:block;margin-bottom:8px;"></i>
            Loading Receipt Vouchers from database...
          </td>
        </tr>
      `;
    }

    try {
      let url = `/vouchers/register?societyId=${sid}&fyId=${fyId}&type=Receipt`;
      if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
      if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;
      if (cbCode && cbCode !== 'all') url += `&cashBankCode=${encodeURIComponent(cbCode)}`;
      if (vNo) url += `&voucherNo=${encodeURIComponent(vNo)}`;

      const res = await API.get(url);
      if (res && res.success && Array.isArray(res.data)) {
        allVouchers = res.data;
      } else {
        allVouchers = [];
      }

      renderGrid();
    } catch (e) {
      console.error('[ReceiptVoucherPrint] Error loading vouchers:', e);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" class="td-center" style="padding:30px; color:#dc2626;">
              <i class="bi bi-exclamation-triangle-fill" style="font-size:24px;display:block;margin-bottom:8px;"></i>
              Failed to load Receipt Vouchers. Please ensure backend is running.
            </td>
          </tr>
        `;
      }
    }
  };

  // ── 3. RENDER TABLE GRID ───────────────────────────────────────────
  function renderGrid() {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('receiptTableBody');
    if (!tbody) return;

    filteredVouchers = allVouchers.filter(v => {
      if (!q) return true;
      const str = [
        v.voucherNo,
        v.personName,
        v.paidTo,
        v.cashBankName,
        v.bankName,
        v.chqNo,
        v.refNo,
        v.narration,
        v.particular1,
        v.particular2,
        v.amount
      ].join(' ').toLowerCase();
      return str.includes(q);
    });

    if (filteredVouchers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-folder2-open" style="font-size:24px;display:block;margin-bottom:8px;color:#94a3b8;"></i>
            No matching Receipt Vouchers found for the selected criteria.
          </td>
        </tr>
      `;
      updateSummaryKPIs(0, 0, 0, 0);
      return;
    }

    let html = '';
    let totalAmt = 0;
    let bankAmt = 0;
    let cashAmt = 0;

    filteredVouchers.forEach((v, idx) => {
      const vid = v.voucherId || v.receiptId;
      const isChecked = selectedVoucherIds.has(vid);
      const amt = parseFloat(v.amount) || 0;
      totalAmt += amt;

      const cbName = (v.cashBankName || '').toLowerCase();
      if (cbName.includes('cash')) cashAmt += amt;
      else bankAmt += amt;

      const vNoDisplay = v.voucherNo || `RV-${String(vid).padStart(4, '0')}`;
      const vDateDisplay = VoucherPrintCommon.formatDate(v.voucherDate);
      const payerDisplay = v.personName || v.paidTo || '—';
      const refDisplay = (v.chqNo || v.refNo) ? `${v.chqNo ? 'Chq: ' + v.chqNo : ''}${v.bankName ? ' (' + v.bankName + ')' : ''}` : '—';

      html += `
        <tr class="${isChecked ? 'selected' : ''}" id="row-${vid}">
          <td class="td-center">
            <input type="checkbox" class="row-chk" data-vid="${vid}" ${isChecked ? 'checked' : ''} onchange="toggleRowSelect(${vid}, this.checked)">
          </td>
          <td class="td-center text-muted">${idx + 1}</td>
          <td class="td-center"><span class="badge-voucher">${VoucherPrintCommon.escHtml(vNoDisplay)}</span></td>
          <td class="td-center">${VoucherPrintCommon.escHtml(vDateDisplay)}</td>
          <td><strong>${VoucherPrintCommon.escHtml(payerDisplay)}</strong></td>
          <td>${VoucherPrintCommon.escHtml(v.cashBankName || '—')}</td>
          <td>${VoucherPrintCommon.escHtml(refDisplay)}</td>
          <td class="td-amt">${VoucherPrintCommon.formatNumber(amt)}</td>
          <td title="${VoucherPrintCommon.escHtml(v.narration || '')}" style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${VoucherPrintCommon.escHtml(v.narration || v.particular1 || '—')}
          </td>
          <td class="td-center">
            <button type="button" class="row-action-btn" onclick="previewVoucher(${vid})" title="Preview Voucher">
              <i class="bi bi-eye"></i> Preview
            </button>
            <button type="button" class="row-action-btn btn-prt" onclick="printVoucher(${vid})" title="Print Receipt">
              <i class="bi bi-printer"></i> Print
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    updateSummaryKPIs(filteredVouchers.length, totalAmt, bankAmt, cashAmt);
  }

  function updateSummaryKPIs(count, total, bank, cash) {
    const elCount = document.getElementById('kpiTotalVouchers');
    const elTot = document.getElementById('kpiTotalAmount');
    const elBank = document.getElementById('kpiBankAmount');
    const elCash = document.getElementById('kpiCashAmount');
    const elFoot = document.getElementById('footTotAmount');

    if (elCount) elCount.textContent = count;
    if (elTot) elTot.textContent = VoucherPrintCommon.formatCurrency(total);
    if (elBank) elBank.textContent = VoucherPrintCommon.formatCurrency(bank);
    if (elCash) elCash.textContent = VoucherPrintCommon.formatCurrency(cash);
    if (elFoot) elFoot.textContent = VoucherPrintCommon.formatCurrency(total);

    updateSelectedCountUi();
  }

  // ── 4. SELECTION CONTROLS ──────────────────────────────────────────
  window.toggleRowSelect = function (vid, checked) {
    if (checked) selectedVoucherIds.add(vid);
    else selectedVoucherIds.delete(vid);

    const row = document.getElementById(`row-${vid}`);
    if (row) {
      if (checked) row.classList.add('selected');
      else row.classList.remove('selected');
    }

    updateSelectedCountUi();
  };

  window.toggleSelectAll = function (checked) {
    filteredVouchers.forEach(v => {
      const vid = v.voucherId || v.receiptId;
      if (checked) selectedVoucherIds.add(vid);
      else selectedVoucherIds.delete(vid);
    });

    document.querySelectorAll('.row-chk').forEach(chk => {
      chk.checked = checked;
    });

    document.querySelectorAll('#receiptTableBody tr').forEach(tr => {
      if (checked) tr.classList.add('selected');
      else tr.classList.remove('selected');
    });

    updateSelectedCountUi();
  };

  function updateSelectedCountUi() {
    const cnt = selectedVoucherIds.size;
    const elLbl = document.getElementById('selectedCountLabel');
    const elPrev = document.getElementById('selCountPreview');
    const chkAll = document.getElementById('chkSelectAll');

    if (elLbl) elLbl.textContent = `${cnt} voucher${cnt === 1 ? '' : 's'} selected for batch printing`;
    if (elPrev) elPrev.textContent = cnt;

    if (chkAll && filteredVouchers.length > 0) {
      chkAll.checked = (cnt === filteredVouchers.length);
    }
  }

  // ── 5. SINGLE VOUCHER PREVIEW & PRINT ──────────────────────────────
  window.previewVoucher = async function (vid) {
    const v = allVouchers.find(x => (x.voucherId || x.receiptId) === vid);
    if (!v) {
      alert('Voucher data not found.');
      return;
    }

    const items = Array.isArray(v.items) ? v.items : [];
    const soc = await VoucherPrintCommon.fetchSocietyInfo();
    const html = VoucherPrintCommon.renderSingleVoucherHtml(v, items, 'Receipt', soc);

    VoucherPrintCommon.openPreviewModal(html, `Receipt Voucher — ${v.voucherNo || vid}`, () => {
      printVoucher(vid);
    });
  };

  window.printVoucher = async function (vid) {
    const v = allVouchers.find(x => (x.voucherId || x.receiptId) === vid);
    if (!v) return;

    const items = Array.isArray(v.items) ? v.items : [];
    const soc = await VoucherPrintCommon.fetchSocietyInfo();
    const html = VoucherPrintCommon.renderSingleVoucherHtml(v, items, 'Receipt', soc);

    VoucherPrintCommon.preparePrintArea(html);
    VoucherPrintCommon.triggerBrowserPrint(`Receipt_Voucher_${v.voucherNo || vid}`);
  };

  // ── 6. BATCH PREVIEW & BATCH PRINT ─────────────────────────────────
  window.previewSelectedVouchers = async function () {
    if (selectedVoucherIds.size === 0) {
      alert('Please select at least one voucher using the checkboxes to preview in batch.');
      return;
    }

    const targetList = allVouchers.filter(v => selectedVoucherIds.has(v.voucherId || v.receiptId));
    const soc = await VoucherPrintCommon.fetchSocietyInfo();

    let combinedHtml = '';
    targetList.forEach(v => {
      const items = Array.isArray(v.items) ? v.items : [];
      combinedHtml += VoucherPrintCommon.renderSingleVoucherHtml(v, items, 'Receipt', soc);
    });

    VoucherPrintCommon.openPreviewModal(combinedHtml, `Batch Receipt Vouchers (${targetList.length})`, () => {
      printSelectedVouchers();
    });
  };

  window.printSelectedVouchers = async function () {
    if (selectedVoucherIds.size === 0) {
      alert('Please select at least one voucher using the checkboxes to print.');
      return;
    }

    const targetList = allVouchers.filter(v => selectedVoucherIds.has(v.voucherId || v.receiptId));
    const soc = await VoucherPrintCommon.fetchSocietyInfo();

    let combinedHtml = '';
    targetList.forEach(v => {
      const items = Array.isArray(v.items) ? v.items : [];
      combinedHtml += VoucherPrintCommon.renderSingleVoucherHtml(v, items, 'Receipt', soc);
    });

    VoucherPrintCommon.preparePrintArea(combinedHtml);
    VoucherPrintCommon.triggerBrowserPrint(`Batch_Receipt_Vouchers_${targetList.length}`);
  };

  // ── 7. FILTERS & PRESETS ──────────────────────────────────────────
  window.onPresetClick = function (preset, btn) {
    document.querySelectorAll('.vp-preset-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    VoucherPrintCommon.applyDatePreset(preset, 'fromDate', 'toDate', () => {
      loadReceiptVouchers();
    });
  };

  window.onVoucherNoFilterKey = function (e) {
    if (e.key === 'Enter') loadReceiptVouchers();
  };

  window.filterTable = function () {
    renderGrid();
  };

  window.resetFilters = function () {
    document.getElementById('vouchNoFilter').value = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('accountSelect').value = 'all';
    document.querySelectorAll('.vp-preset-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnPresetFull')?.classList.add('active');
    VoucherPrintCommon.initFYDates('fromDate', 'toDate');
    selectedVoucherIds.clear();
    loadReceiptVouchers();
  };

  // ── 8. EXPORT TO EXCEL ─────────────────────────────────────────────
  window.exportGridToExcel = function () {
    const headers = [
      'Sr No', 'Voucher No', 'Date', 'Received From / Payer',
      'Cash / Bank Account', 'Reference / Cheque', 'Bank Name',
      'Amount (₹)', 'Narration'
    ];

    const rows = [];
    filteredVouchers.forEach((v, idx) => {
      rows.push([
        idx + 1,
        v.voucherNo || '',
        VoucherPrintCommon.formatDate(v.voucherDate),
        v.personName || v.paidTo || '',
        v.cashBankName || '',
        v.chqNo || v.refNo || '',
        v.bankName || '',
        parseFloat(v.amount) || 0,
        v.narration || v.particular1 || ''
      ]);
    });

    const fromDate = document.getElementById('fromDate')?.value || 'All';
    const toDate = document.getElementById('toDate')?.value || 'All';
    VoucherPrintCommon.exportGridToExcel(headers, rows, 'Receipt Vouchers', `Receipt_Vouchers_${fromDate}_to_${toDate}.xlsx`);
  };

  // ── 9. URL PARAMETER DEEP-LINKING ─────────────────────────────────
  async function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const vNo = params.get('vNo') || params.get('vno') || params.get('voucherNo');
    const vId = params.get('id') || params.get('voucherId');

    if (vNo || vId) {
      try {
        const sid = VoucherPrintCommon.getActiveSocietyId();
        let targetVoucher = null;

        if (vId) {
          const res = await API.get(`/vouchers/${vId}`);
          if (res && res.success && res.data) {
            targetVoucher = res.data;
            targetVoucher.items = res.items || [];
          }
        } else if (vNo) {
          const res = await API.get(`/vouchers/find?societyId=${sid}&voucherNo=${encodeURIComponent(vNo)}`);
          if (res && res.success && res.data) {
            targetVoucher = res.data;
            targetVoucher.items = res.items || [];
          }
        }

        if (targetVoucher) {
          const soc = await VoucherPrintCommon.fetchSocietyInfo();
          const html = VoucherPrintCommon.renderSingleVoucherHtml(targetVoucher, targetVoucher.items || [], 'Receipt', soc);
          VoucherPrintCommon.openPreviewModal(html, `Receipt Voucher — ${targetVoucher.voucherNo || vNo || vId}`, () => {
            VoucherPrintCommon.preparePrintArea(html);
            VoucherPrintCommon.triggerBrowserPrint(`Receipt_Voucher_${targetVoucher.voucherNo || vNo || vId}`);
          });
        }
      } catch (err) {
        console.warn('[ReceiptVoucherPrint] Deep link preview error:', err);
      }
    }
  }

})();
