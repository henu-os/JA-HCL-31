/**
 * ═════════════════════════════════════════════════════════════════════
 * JEEVIKA ERP v2 — JOURNAL VOUCHER PRINT CONTROLLER
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
    await loadLedgerAccounts();
    await loadJournalVouchers();

    // Check URL parameters for direct voucher preview
    checkUrlParams();
  });

  // ── 1. LOAD LEDGER ACCOUNTS FOR FILTER ────────────────────────────
  async function loadLedgerAccounts() {
    const sel = document.getElementById('accountSelect');
    if (!sel) return;

    try {
      const sid = VoucherPrintCommon.getActiveSocietyId();
      const res = await API.get(`/accounts?societyId=${sid}`);
      if (res && res.data && Array.isArray(res.data)) {
        sel.innerHTML = '<option value="all">All Ledgers / Heads</option>';
        res.data.forEach(acc => {
          const opt = document.createElement('option');
          opt.value = acc.accCode || acc.code || acc.accountId;
          opt.textContent = `${acc.accCode ? acc.accCode + ' - ' : ''}${acc.accName || acc.name}`;
          sel.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('[JournalVoucherPrint] loadLedgerAccounts error:', e);
    }
  }

  // ── 2. LOAD JOURNAL VOUCHERS FROM BACKEND ──────────────────────────
  window.loadJournalVouchers = async function () {
    const sid = VoucherPrintCommon.getActiveSocietyId();
    const fyId = VoucherPrintCommon.getActiveFYId();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const accCode = document.getElementById('accountSelect')?.value || 'all';
    const vNo = document.getElementById('vouchNoFilter')?.value || '';

    const tbody = document.getElementById('journalTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin" style="font-size:20px;display:block;margin-bottom:8px;"></i>
            Loading Journal Vouchers from database...
          </td>
        </tr>
      `;
    }

    try {
      let url = `/vouchers/register?societyId=${sid}&fyId=${fyId}&type=Journal`;
      if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
      if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;
      if (accCode && accCode !== 'all') url += `&accountCode=${encodeURIComponent(accCode)}`;
      if (vNo) url += `&voucherNo=${encodeURIComponent(vNo)}`;

      const res = await API.get(url);
      if (res && res.success && Array.isArray(res.data)) {
        allVouchers = res.data;
      } else {
        allVouchers = [];
      }

      renderGrid();
    } catch (e) {
      console.error('[JournalVoucherPrint] Error loading vouchers:', e);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="11" class="td-center" style="padding:30px; color:#dc2626;">
              <i class="bi bi-exclamation-triangle-fill" style="font-size:24px;display:block;margin-bottom:8px;"></i>
              Failed to load Journal Vouchers. Please ensure backend is running.
            </td>
          </tr>
        `;
      }
    }
  };

  // ── 3. RENDER TABLE GRID ───────────────────────────────────────────
  function renderGrid() {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('journalTableBody');
    if (!tbody) return;

    filteredVouchers = allVouchers.filter(v => {
      if (!q) return true;
      const str = [
        v.voucherNo,
        v.personName,
        v.refNo,
        v.narration,
        v.particular1,
        v.particular2,
        v.amount
      ].join(' ').toLowerCase();

      // Check items if any
      if (Array.isArray(v.items)) {
        const itemStr = v.items.map(it => `${it.accountCode} ${it.accountName} ${it.narration}`).join(' ').toLowerCase();
        if (itemStr.includes(q)) return true;
      }
      return str.includes(q);
    });

    if (filteredVouchers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-folder2-open" style="font-size:24px;display:block;margin-bottom:8px;color:#94a3b8;"></i>
            No matching Journal Vouchers found for the selected criteria.
          </td>
        </tr>
      `;
      updateSummaryKPIs(0, 0, 0);
      return;
    }

    let html = '';
    let grandTotDebit = 0;
    let grandTotCredit = 0;

    filteredVouchers.forEach((v, idx) => {
      const vid = v.voucherId || v.journalId;
      const isChecked = selectedVoucherIds.has(vid);

      // Calculate debit and credit totals for this JV
      let jvDebit = 0;
      let jvCredit = 0;
      let headsSummary = '';

      if (Array.isArray(v.items) && v.items.length > 0) {
        v.items.forEach(it => {
          const dr = parseFloat(it.debit) || 0;
          const cr = parseFloat(it.credit) || 0;
          jvDebit += dr;
          jvCredit += cr;
        });

        // First 2 head names
        const names = v.items.map(it => it.accountName).filter(Boolean);
        headsSummary = names.slice(0, 2).join(' / ') + (names.length > 2 ? ` (+${names.length - 2} more)` : '');
      } else {
        const amt = parseFloat(v.amount) || 0;
        jvDebit = amt;
        jvCredit = amt;
        headsSummary = v.particular1 || v.narration || 'Journal Entries';
      }

      grandTotDebit += jvDebit;
      grandTotCredit += jvCredit;

      const diff = Math.abs(Math.round((jvDebit - jvCredit) * 100) / 100);
      const isBalanced = (diff < 0.05);

      const vNoDisplay = v.voucherNo || `JV-${String(vid).padStart(4, '0')}`;
      const vDateDisplay = VoucherPrintCommon.formatDate(v.voucherDate);
      const refDisplay = v.refNo || '—';

      html += `
        <tr class="${isChecked ? 'selected' : ''}" id="row-${vid}">
          <td class="td-center">
            <input type="checkbox" class="row-chk" data-vid="${vid}" ${isChecked ? 'checked' : ''} onchange="toggleRowSelect(${vid}, this.checked)">
          </td>
          <td class="td-center text-muted">${idx + 1}</td>
          <td class="td-center"><span class="badge-voucher" style="background:#f1f5f9; color:#0f172a;">${VoucherPrintCommon.escHtml(vNoDisplay)}</span></td>
          <td class="td-center">${VoucherPrintCommon.escHtml(vDateDisplay)}</td>
          <td><strong>${VoucherPrintCommon.escHtml(headsSummary)}</strong></td>
          <td>${VoucherPrintCommon.escHtml(refDisplay)}</td>
          <td class="td-amt" style="color:#1d4ed8;">${VoucherPrintCommon.formatNumber(jvDebit)}</td>
          <td class="td-amt" style="color:#059669;">${VoucherPrintCommon.formatNumber(jvCredit)}</td>
          <td class="td-center">
            ${isBalanced 
              ? '<span class="badge-balanced"><i class="bi bi-check-circle"></i> Balanced</span>' 
              : `<span class="badge-unbalanced"><i class="bi bi-exclamation-triangle"></i> Diff: ₹${diff.toFixed(2)}</span>`}
          </td>
          <td title="${VoucherPrintCommon.escHtml(v.narration || '')}" style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${VoucherPrintCommon.escHtml(v.narration || v.particular1 || '—')}
          </td>
          <td class="td-center">
            <button type="button" class="row-action-btn" onclick="previewVoucher(${vid})" title="Preview Voucher">
              <i class="bi bi-eye"></i> Preview
            </button>
            <button type="button" class="row-action-btn btn-prt" onclick="printVoucher(${vid})" title="Print Journal Voucher">
              <i class="bi bi-printer"></i> Print
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    updateSummaryKPIs(filteredVouchers.length, grandTotDebit, grandTotCredit);
  }

  function updateSummaryKPIs(count, totalDr, totalCr) {
    const elCount = document.getElementById('kpiTotalVouchers');
    const elDr = document.getElementById('kpiTotalDebit');
    const elCr = document.getElementById('kpiTotalCredit');
    const elFootDr = document.getElementById('footTotDebit');
    const elFootCr = document.getElementById('footTotCredit');
    const elDiffVal = document.getElementById('kpiDiffVal');
    const elDiffChip = document.getElementById('kpiDiffChip');

    if (elCount) elCount.textContent = count;
    if (elDr) elDr.textContent = VoucherPrintCommon.formatCurrency(totalDr);
    if (elCr) elCr.textContent = VoucherPrintCommon.formatCurrency(totalCr);
    if (elFootDr) elFootDr.textContent = VoucherPrintCommon.formatCurrency(totalDr);
    if (elFootCr) elFootCr.textContent = VoucherPrintCommon.formatCurrency(totalCr);

    const diff = Math.abs(Math.round((totalDr - totalCr) * 100) / 100);
    if (elDiffVal) elDiffVal.textContent = VoucherPrintCommon.formatCurrency(diff);

    if (elDiffChip) {
      if (diff < 0.05) {
        elDiffChip.innerHTML = `<i class="bi bi-shield-check" style="color:#16a34a;"></i> <span>Balanced:</span> <span class="vp-chip-val" style="color:#16a34a;">₹ 0.00</span>`;
      } else {
        elDiffChip.innerHTML = `<i class="bi bi-exclamation-triangle-fill" style="color:#dc2626;"></i> <span>Imbalance:</span> <span class="vp-chip-val" style="color:#dc2626;">${VoucherPrintCommon.formatCurrency(diff)}</span>`;
      }
    }

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
      const vid = v.voucherId || v.journalId;
      if (checked) selectedVoucherIds.add(vid);
      else selectedVoucherIds.delete(vid);
    });

    document.querySelectorAll('.row-chk').forEach(chk => {
      chk.checked = checked;
    });

    document.querySelectorAll('#journalTableBody tr').forEach(tr => {
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
    const v = allVouchers.find(x => (x.voucherId || x.journalId) === vid);
    if (!v) {
      alert('Voucher data not found.');
      return;
    }

    const items = Array.isArray(v.items) ? v.items : [];
    const soc = await VoucherPrintCommon.fetchSocietyInfo();
    const html = VoucherPrintCommon.renderSingleVoucherHtml(v, items, 'Journal', soc);

    VoucherPrintCommon.openPreviewModal(html, `Journal Voucher — ${v.voucherNo || vid}`, () => {
      printVoucher(vid);
    });
  };

  window.printVoucher = async function (vid) {
    const v = allVouchers.find(x => (x.voucherId || x.journalId) === vid);
    if (!v) return;

    const items = Array.isArray(v.items) ? v.items : [];
    const soc = await VoucherPrintCommon.fetchSocietyInfo();
    const html = VoucherPrintCommon.renderSingleVoucherHtml(v, items, 'Journal', soc);

    VoucherPrintCommon.preparePrintArea(html);
    VoucherPrintCommon.triggerBrowserPrint(`Journal_Voucher_${v.voucherNo || vid}`);
  };

  // ── 6. BATCH PREVIEW & BATCH PRINT ─────────────────────────────────
  window.previewSelectedVouchers = async function () {
    if (selectedVoucherIds.size === 0) {
      alert('Please select at least one voucher using the checkboxes to preview in batch.');
      return;
    }

    const targetList = allVouchers.filter(v => selectedVoucherIds.has(v.voucherId || v.journalId));
    const soc = await VoucherPrintCommon.fetchSocietyInfo();

    let combinedHtml = '';
    targetList.forEach(v => {
      const items = Array.isArray(v.items) ? v.items : [];
      combinedHtml += VoucherPrintCommon.renderSingleVoucherHtml(v, items, 'Journal', soc);
    });

    VoucherPrintCommon.openPreviewModal(combinedHtml, `Batch Journal Vouchers (${targetList.length})`, () => {
      printSelectedVouchers();
    });
  };

  window.printSelectedVouchers = async function () {
    if (selectedVoucherIds.size === 0) {
      alert('Please select at least one voucher using the checkboxes to print.');
      return;
    }

    const targetList = allVouchers.filter(v => selectedVoucherIds.has(v.voucherId || v.journalId));
    const soc = await VoucherPrintCommon.fetchSocietyInfo();

    let combinedHtml = '';
    targetList.forEach(v => {
      const items = Array.isArray(v.items) ? v.items : [];
      combinedHtml += VoucherPrintCommon.renderSingleVoucherHtml(v, items, 'Journal', soc);
    });

    VoucherPrintCommon.preparePrintArea(combinedHtml);
    VoucherPrintCommon.triggerBrowserPrint(`Batch_Journal_Vouchers_${targetList.length}`);
  };

  // ── 7. FILTERS & PRESETS ──────────────────────────────────────────
  window.onPresetClick = function (preset, btn) {
    document.querySelectorAll('.vp-preset-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    VoucherPrintCommon.applyDatePreset(preset, 'fromDate', 'toDate', () => {
      loadJournalVouchers();
    });
  };

  window.onVoucherNoFilterKey = function (e) {
    if (e.key === 'Enter') loadJournalVouchers();
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
    loadJournalVouchers();
  };

  // ── 8. EXPORT TO EXCEL ─────────────────────────────────────────────
  window.exportGridToExcel = function () {
    const headers = [
      'Sr No', 'Voucher No', 'Date', 'Type', 'Account Code',
      'Account Name', 'Debit (₹)', 'Credit (₹)', 'Narration'
    ];

    const rows = [];
    let totDr = 0, totCr = 0;

    filteredVouchers.forEach(v => {
      const vDate = VoucherPrintCommon.formatDate(v.voucherDate);
      const vNo = v.voucherNo || '';
      const vNarr = v.narration || '';
      const items = Array.isArray(v.items) ? v.items : [];

      if (items.length > 0) {
        items.forEach((it, idx) => {
          const dr = parseFloat(it.debit) || 0;
          const cr = parseFloat(it.credit) || 0;
          totDr += dr; totCr += cr;

          rows.push([
            idx + 1,
            vNo,
            vDate,
            dr > 0 ? 'Debit' : 'Credit',
            it.accountCode || '',
            it.accountName || '',
            dr > 0 ? dr : '',
            cr > 0 ? cr : '',
            it.narration || vNarr
          ]);
        });
      } else {
        const amt = parseFloat(v.amount) || 0;
        totDr += amt; totCr += amt;
        rows.push([1, vNo, vDate, 'Debit', '', v.particular1 || '', amt, '', vNarr]);
        rows.push([2, vNo, vDate, 'Credit', '', v.particular2 || '', '', amt, vNarr]);
      }
    });

    // Grand Total
    rows.push([]);
    rows.push(['', '', '', '', '', 'TOTAL', totDr, totCr, '']);

    const fromDate = document.getElementById('fromDate')?.value || 'All';
    const toDate = document.getElementById('toDate')?.value || 'All';
    VoucherPrintCommon.exportGridToExcel(headers, rows, 'Journal Vouchers', `Journal_Vouchers_${fromDate}_to_${toDate}.xlsx`);
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
          const html = VoucherPrintCommon.renderSingleVoucherHtml(targetVoucher, targetVoucher.items || [], 'Journal', soc);
          VoucherPrintCommon.openPreviewModal(html, `Journal Voucher — ${targetVoucher.voucherNo || vNo || vId}`, () => {
            VoucherPrintCommon.preparePrintArea(html);
            VoucherPrintCommon.triggerBrowserPrint(`Journal_Voucher_${targetVoucher.voucherNo || vNo || vId}`);
          });
        }
      } catch (err) {
        console.warn('[JournalVoucherPrint] Deep link preview error:', err);
      }
    }
  }

})();
