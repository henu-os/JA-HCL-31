/**
 * journal-register.js — JEEVIKA ERP v2
 * High-Density Statutory Journal Voucher Register
 */

(function () {
  'use strict';

  let allRecords = [];
  let currentSocietyInfo = null;

  function getActiveSocietyId() {
    return (window.Auth && Auth.getSocietyId && Auth.getSocietyId()) ||
           sessionStorage.getItem('activeSocietyId') ||
           localStorage.getItem('activeSocietyId') ||
           '4';
  }

  function getActiveFYId() {
    return (window.Auth && Auth.getFYId && Auth.getFYId()) ||
           sessionStorage.getItem('activeFYId') ||
           localStorage.getItem('activeFYId') ||
           '1';
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCurrency(val) {
    const num = parseFloat(val) || 0;
    return '₹ ' + num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDate(dStr) {
    if (!dStr) return '—';
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const yr = d.getFullYear();
    return `${day}-${mon}-${yr}`;
  }

  // ── 1. INITIALIZATION & DATES ──────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async () => {
    await fetchSocietyInfo();
    initFYDates();
    await loadAccountsDropdown();
    await loadJournalRegister();
  });

  async function fetchSocietyInfo() {
    try {
      const sid = getActiveSocietyId();
      if (window.API && API.get) {
        const res = await API.get(`/society/${sid}`);
        if (res && res.success && res.data) {
          currentSocietyInfo = res.data;
          const sName = currentSocietyInfo.societyName || currentSocietyInfo.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
          const regNo = currentSocietyInfo.registrationNo || currentSocietyInfo.regNo || '—';
          const city = currentSocietyInfo.city || 'Mumbai';
          const elName = document.getElementById('prtSocName');
          const elSub = document.getElementById('prtSocSub');
          if (elName) elName.textContent = sName.toUpperCase();
          if (elSub) elSub.textContent = `Registration No: ${regNo} | City: ${city}`;
        }
      }
    } catch (e) {
      console.warn('Could not fetch society info for print header', e);
    }
  }

  function initFYDates() {
    const fyLabel = (window.Auth && Auth.getFYLabel && Auth.getFYLabel()) ||
                    sessionStorage.getItem('activeFYLabel') ||
                    '2026-27';

    let startYear = 2026;
    const match = fyLabel.match(/(\d{4})/);
    if (match) startYear = parseInt(match[1], 10);

    const fromDateStr = `${startYear}-04-01`;
    const toDateStr = `${startYear + 1}-03-31`;

    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (fromEl && !fromEl.value) fromEl.value = fromDateStr;
    if (toEl && !toEl.value) toEl.value = toDateStr;
  }

  window.applyDatePreset = function (preset) {
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (!fromEl || !toEl) return;

    const fyLabel = (window.Auth && Auth.getFYLabel && Auth.getFYLabel()) ||
                    sessionStorage.getItem('activeFYLabel') || '2026-27';
    let startYear = 2026;
    const match = fyLabel.match(/(\d{4})/);
    if (match) startYear = parseInt(match[1], 10);

    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth(); // 0-indexed

    switch (preset) {
      case 'all':
        fromEl.value = '';
        toEl.value = '';
        break;
      case 'full':
        fromEl.value = `${startYear}-04-01`;
        toEl.value = `${startYear + 1}-03-31`;
        break;
      case 'this-month': {
        const first = new Date(currYear, currMonth, 1);
        const last = new Date(currYear, currMonth + 1, 0);
        fromEl.value = toIsoDate(first);
        toEl.value = toIsoDate(last);
        break;
      }
      case 'last-month': {
        const first = new Date(currYear, currMonth - 1, 1);
        const last = new Date(currYear, currMonth, 0);
        fromEl.value = toIsoDate(first);
        toEl.value = toIsoDate(last);
        break;
      }
      case 'q1':
        fromEl.value = `${startYear}-04-01`;
        toEl.value = `${startYear}-06-30`;
        break;
      case 'q2':
        fromEl.value = `${startYear}-07-01`;
        toEl.value = `${startYear}-09-30`;
        break;
      case 'q3':
        fromEl.value = `${startYear}-10-01`;
        toEl.value = `${startYear}-12-31`;
        break;
      case 'q4':
        fromEl.value = `${startYear + 1}-01-01`;
        toEl.value = `${startYear + 1}-03-31`;
        break;
      case 'custom':
      default:
        break;
    }

    loadJournalRegister();
  };

  function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  window.onDateChange = function () {
    const preset = document.getElementById('datePresetSelect');
    if (preset) preset.value = 'custom';
    loadJournalRegister();
  };

  // ── 2. LOAD ACCOUNTS DROPDOWN ──────────────────────────────────────────────
  async function loadAccountsDropdown() {
    const sel = document.getElementById('accountSelect');
    if (!sel) return;

    try {
      const sid = getActiveSocietyId();
      let accs = [];
      if (typeof fetchMasterAccounts === 'function') {
        accs = await fetchMasterAccounts(sid);
      } else if (typeof getStandardMasterAccounts === 'function') {
        accs = getStandardMasterAccounts();
      }

      if (Array.isArray(accs) && accs.length > 0) {
        let opts = '<option value="all">All Accounts</option>';
        accs.forEach(a => {
          const code = a.accCode || '';
          const name = a.accName || '';
          const label = code ? `[${code}] ${name}` : name;
          opts += `<option value="${escHtml(code || name)}">${escHtml(label)}</option>`;
        });
        sel.innerHTML = opts;
      }
    } catch (e) {
      console.warn('Could not populate accounts dropdown', e);
    }
  }

  // ── 3. FETCH JOURNAL REGISTER ──────────────────────────────────────────────
  window.loadJournalRegister = async function () {
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
            Fetching live Journal Register records...
          </td>
        </tr>
      `;
    }

    let records = [];

    try {
      let url = `/vouchers/register?societyId=${societyId}&type=Journal`;
      if (fromDate) url += `&fromDate=${fromDate}`;
      if (toDate) url += `&toDate=${toDate}`;
      if (accFilter && accFilter !== 'all') url += `&cashBankCode=${encodeURIComponent(accFilter)}`;

      const res = await API.get(url);
      if (res && res.success && Array.isArray(res.data)) {
        records = res.data;
      } else {
        // Fallback to /journal-vouchers if vouchers/register returned 0
        const jUrl = `/journal-vouchers?societyId=${societyId}&fyId=${fyId}`;
        const jRes = await API.get(jUrl);
        if (Array.isArray(jRes)) {
          records = jRes.map(j => ({
            voucherId: j.voucherId || j.journalId || j.id,
            voucherNo: j.voucherNo || j.jvNo,
            voucherDate: j.voucherDate || j.date,
            voucherType: 'Journal',
            amount: j.amount || j.totalAmount,
            narration: j.narration,
            status: j.status || 'Posted',
            items: j.items || []
          }));
        }
      }
    } catch (err) {
      console.error('Journal Register API error:', err);
      if (window.showToast) showToast('Failed to load real-time journal entries.', 'error');
    }

    // Sort by voucherDate ASC, then voucherNo ASC
    records.sort((a, b) => {
      const dComp = (a.voucherDate || '').localeCompare(b.voucherDate || '');
      if (dComp !== 0) return dComp;
      return String(a.voucherNo || '').localeCompare(String(b.voucherNo || ''), undefined, { numeric: true });
    });

    allRecords = records;
    renderRegisterView();
  };

  // ── 4. RENDER REGISTER VIEW ────────────────────────────────────────────────
  window.renderRegisterView = function () {
    const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const accFilter = document.getElementById('accountSelect')?.value || 'all';
    const showCodes = document.getElementById('chk-voucher-no')?.checked ?? true;

    // Filter by query and account
    const filtered = allRecords.filter(v => {
      if (q) {
        const vNo = (v.voucherNo || '').toLowerCase();
        const narr = (v.narration || '').toLowerCase();
        const ref = (v.refNo || '').toLowerCase();
        const matchHead = vNo.includes(q) || narr.includes(q) || ref.includes(q);
        let matchLines = false;
        if (Array.isArray(v.items)) {
          matchLines = v.items.some(it => {
            const code = (it.accountCode || '').toLowerCase();
            const name = (it.accountName || '').toLowerCase();
            const itNarr = (it.narration || '').toLowerCase();
            return code.includes(q) || name.includes(q) || itNarr.includes(q);
          });
        }
        if (!matchHead && !matchLines) return false;
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
            No journal voucher records found matching current criteria.
          </td>
        </tr>
      `;
      updateKPIs([], 0, 0);
      return;
    }

    let html = '';
    let totalDebit = 0;
    let totalCredit = 0;

    filtered.forEach(v => {
      const vNo = v.voucherNo || 'JV-????';
      const vDateStr = formatDate(v.voucherDate);
      const vId = v.voucherId || '';
      const items = Array.isArray(v.items) && v.items.length > 0 ? v.items : [];

      let vDrSum = 0;
      let vCrSum = 0;

      // Group line items: debits first, then credits
      const drLines = items.filter(it => (parseFloat(it.debit) || 0) > 0);
      const crLines = items.filter(it => (parseFloat(it.credit) || 0) > 0);

      // If no detail rows, create a row from header amount
      if (drLines.length === 0 && crLines.length === 0) {
        const amt = parseFloat(v.amount) || 0;
        drLines.push({
          accountCode: 'EXP-1001',
          accountName: v.personName || 'Journal Adjustment (Debit)',
          debit: amt,
          credit: 0
        });
        crLines.push({
          accountCode: 'LIA-1008',
          accountName: 'General Adjustment (Credit)',
          debit: 0,
          credit: amt
        });
      }

      const allLines = [...drLines, ...crLines];

      allLines.forEach((line, idx) => {
        const isFirst = idx === 0;
        const isDebit = (parseFloat(line.debit) || 0) > 0;
        const drVal = parseFloat(line.debit) || 0;
        const crVal = parseFloat(line.credit) || 0;

        vDrSum += drVal;
        vCrSum += crVal;
        totalDebit += drVal;
        totalCredit += crVal;

        const codeHtml = (showCodes && line.accountCode)
          ? `<span class="acc-code-pill">[${escHtml(line.accountCode)}]</span>`
          : '';

        const prefix = isDebit
          ? `<span class="acc-dr-label">Dr.</span>`
          : `<span class="acc-cr-label" style="margin-left:14px;">To</span>`;

        html += `
          <tr class="${isFirst ? 'reg-voucher-main' : ''}">
            <td class="td-center" style="font-weight:${isFirst ? '700' : 'normal'}; color:${isFirst ? '#0f172a' : 'transparent'};">
              ${isFirst ? escHtml(vDateStr) : ''}
            </td>
            <td class="td-center">
              ${isFirst ? `
                <a class="voucher-pill" onclick="openJournalVoucher('${escHtml(vNo)}', ${vId})" title="Click to view/print voucher">
                  <i class="bi bi-file-earmark-text"></i> ${escHtml(vNo)}
                </a>
              ` : ''}
            </td>
            <td>
              <div>
                ${prefix} ${codeHtml} <strong>${escHtml(line.accountName || '—')}</strong>
              </div>
              ${line.narration ? `<div style="font-size:10px; color:#64748b; margin-left:22px;">— ${escHtml(line.narration)}</div>` : ''}
              ${(idx === allLines.length - 1 && v.narration) ? `
                <div class="reg-narr-box">
                  <strong>Narration:</strong> (Being ${escHtml(v.narration)})
                </div>
              ` : ''}
            </td>
            <td class="td-amt" style="color:${drVal > 0 ? '#dc2626' : '#94a3b8'};">
              ${drVal > 0 ? drVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </td>
            <td class="td-amt" style="color:${crVal > 0 ? '#16a34a' : '#94a3b8'};">
              ${crVal > 0 ? crVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </td>
          </tr>
        `;
      });
    });

    tbody.innerHTML = html;
    updateKPIs(filtered, totalDebit, totalCredit);

    // Update Footers
    const footDr = document.getElementById('footTotDebit');
    const footCr = document.getElementById('footTotCredit');
    if (footDr) footDr.textContent = formatCurrency(totalDebit);
    if (footCr) footCr.textContent = formatCurrency(totalCredit);

    // Print Header Dates
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    const prtFrom = document.getElementById('prtFromDate');
    const prtTo = document.getElementById('prtToDate');
    if (prtFrom) prtFrom.textContent = fromEl && fromEl.value ? formatDate(fromEl.value) : 'Start';
    if (prtTo) prtTo.textContent = toEl && toEl.value ? formatDate(toEl.value) : 'Current';
  };

  function updateKPIs(filtered, totalDebit, totalCredit) {
    const kpiCount = document.getElementById('kpiTotalVouchers');
    const kpiDr = document.getElementById('kpiTotalDebit');
    const kpiCr = document.getElementById('kpiTotalCredit');
    const kpiDiff = document.getElementById('kpiDiff');
    const countLabel = document.getElementById('recordCountLabel');
    const balancedBanner = document.getElementById('balancedBanner');
    const diffBanner = document.getElementById('diffBanner');
    const diffAmountLabel = document.getElementById('diffAmountLabel');

    if (kpiCount) kpiCount.textContent = filtered.length;
    if (kpiDr) kpiDr.textContent = formatCurrency(totalDebit);
    if (kpiCr) kpiCr.textContent = formatCurrency(totalCredit);

    const diff = Math.abs(Math.round((totalDebit - totalCredit) * 100) / 100);
    if (kpiDiff) kpiDiff.textContent = formatCurrency(diff);
    if (countLabel) countLabel.textContent = `${filtered.length} Vouchers Displayed`;

    if (diff < 0.05) {
      if (balancedBanner) balancedBanner.style.display = 'flex';
      if (diffBanner) diffBanner.style.display = 'none';
    } else {
      if (balancedBanner) balancedBanner.style.display = 'none';
      if (diffBanner) diffBanner.style.display = 'flex';
      if (diffAmountLabel) diffAmountLabel.textContent = `Diff: ${formatCurrency(diff)}`;
    }
  }

  window.filterTable = function () {
    renderRegisterView();
  };

  // ── 5. OPEN JOURNAL VOUCHER (PRINT / VIEW) ──────────────────────────────────
  window.openJournalVoucher = function (vNo, vId) {
    if (window.parent && typeof window.parent.openModule === 'function') {
      window.parent.openModule('adr-journal-voucher-print', { voucherNo: vNo, voucherId: vId });
    } else {
      window.open(`../../additional-reports/journal-voucher-print/journal-voucher-print.html?vNo=${encodeURIComponent(vNo)}`, '_blank');
    }
  };

  // ── 6. STATUTORY PRINT ─────────────────────────────────────────────────────
  window.printRegister = function () {
    window.print();
  };

  // ── 7. EXPORT TO EXCEL (.XLSX) ─────────────────────────────────────────────
  window.exportToExcel = function () {
    if (typeof XLSX === 'undefined') {
      alert('Excel export library not loaded. Please ensure an active internet connection or try again.');
      return;
    }

    const socName = (currentSocietyInfo && (currentSocietyInfo.societyName || currentSocietyInfo.name)) || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';

    const wb = XLSX.utils.book_new();
    const rows = [];

    // Header Metadata
    rows.push([socName.toUpperCase()]);
    rows.push([`JOURNAL VOUCHER REGISTER`]);
    rows.push([`Period: ${fromDate ? formatDate(fromDate) : 'Start'} to ${toDate ? formatDate(toDate) : 'End'}`]);
    rows.push([]);

    // Table Column Headers
    rows.push(['Date', 'Voucher No.', 'Type', 'Account Code', 'Account Name', 'Debit (₹)', 'Credit (₹)', 'Narration']);

    let totDr = 0;
    let totCr = 0;

    allRecords.forEach(v => {
      const vDate = formatDate(v.voucherDate);
      const vNo = v.voucherNo || '';
      const vNarr = v.narration || '';
      const items = Array.isArray(v.items) ? v.items : [];

      items.forEach(it => {
        const dr = parseFloat(it.debit) || 0;
        const cr = parseFloat(it.credit) || 0;
        totDr += dr;
        totCr += cr;

        rows.push([
          vDate,
          vNo,
          dr > 0 ? 'Debit' : 'Credit',
          it.accountCode || '',
          it.accountName || '',
          dr > 0 ? dr : '',
          cr > 0 ? cr : '',
          it.narration || vNarr
        ]);
      });
    });

    // Grand Totals
    rows.push([]);
    rows.push(['', '', '', '', 'TOTAL', totDr, totCr, '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set Column Widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 18 }, // Voucher No
      { wch: 10 }, // Type
      { wch: 12 }, // Code
      { wch: 32 }, // Account Name
      { wch: 15 }, // Debit
      { wch: 15 }, // Credit
      { wch: 35 }  // Narration
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Journal Register');

    const fileName = `Journal_Register_${fromDate || 'All'}_to_${toDate || 'All'}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

})();
