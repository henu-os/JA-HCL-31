// Cash/Bank Book Module JS — JEEVIKA ERP
(function () {
  'use strict';

  let rawTransactions = [];
  let currentOpeningBal = 0;
  let currentOpeningType = 'Dr';
  let cashBankAccounts = [];

  document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireContext()) return;

    syncHeaderContext();
    setupFinancialYearDates();
    await loadCashBankAccounts();
  });

  function syncHeaderContext() {
    const socName = (window.Auth && Auth.getSocietyName && Auth.getSocietyName() !== '—') ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Co-op Housing Society');
    const fyLabel = (window.Auth && Auth.getFYLabel && Auth.getFYLabel() !== '—') ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');

    const elSoc = document.getElementById('socName');
    const elFy = document.getElementById('fyLabel');
    const prtSoc = document.getElementById('prtSocName');
    const prtFy = document.getElementById('prtFYLabel');
    const prtDate = document.getElementById('prtPrintDate');

    if (elSoc) elSoc.textContent = socName;
    if (elFy) elFy.textContent = fyLabel;
    if (prtSoc) prtSoc.textContent = socName;
    if (prtFy) prtFy.textContent = fyLabel;
    if (prtDate) prtDate.textContent = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function setupFinancialYearDates() {
    const fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    const parts = fyLabel.split('-');
    let startYear = parseInt(parts[0], 10) || 2025;
    if (startYear < 2000) startYear += 2000;
    const endYear = startYear + 1;

    window._fyStartDate = `${startYear}-04-01`;
    window._fyEndDate = `${endYear}-03-31`;

    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (fromEl) fromEl.value = window._fyStartDate;
    if (toEl) toEl.value = window._fyEndDate;
  }

  window.applyDatePreset = function (preset) {
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (!fromEl || !toEl) return;

    const fyStart = new Date(window._fyStartDate);
    const fyEnd = new Date(window._fyEndDate);
    const now = new Date();

    const fmt = d => d.toISOString().split('T')[0];

    if (preset === 'full') {
      fromEl.value = window._fyStartDate;
      toEl.value = window._fyEndDate;
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
    }

    loadCashBankBook();
  };

  window.onDateChange = function () {
    const presetEl = document.getElementById('datePresetSelect');
    if (presetEl) presetEl.value = 'custom';
    loadCashBankBook();
  };

  async function loadCashBankAccounts() {
    const societyId = Auth.getSocietyId();
    const selectEl = document.getElementById('accountSelect');
    if (!selectEl) return;

    try {
      let accounts = [];
      try {
        const res = await API.get(`/accounts?societyId=${societyId}`);
        if (res && res.data && Array.isArray(res.data)) {
          accounts = res.data;
        } else if (Array.isArray(res)) {
          accounts = res;
        }
      } catch (e) {
        console.warn('API /accounts failed, using fallback list', e);
      }

      // STRICT FILTER: Main Group = Asset AND Primary Group = Cash & Bank Balance
      cashBankAccounts = accounts.filter(a => {
        const mg = (a.mainGroup || a.grpMainName || '').toString().toLowerCase().trim();
        const pg = (a.groupName || a.primaryGroup || a.grpName || '').toString().toLowerCase().trim();
        const code = (a.accCode || '').toString().toUpperCase().trim();
        const mainId = parseInt(a.grpMainId || a.mainGroupId, 10);

        const isAsset = (mg.includes('asset') || mainId === 1 || code.startsWith('ASS'));
        const isCashBank = (pg.includes('cash & bank') || pg.includes('cash and bank') || pg.includes('bank balance') || code === 'ASS-1001' || code === 'ASS-1002' || code === 'ASS-1003');

        return (isAsset && isCashBank) || isCashBank;
      });

      // Fallback if none returned by API
      if (cashBankAccounts.length === 0) {
        cashBankAccounts = [
          { accountId: 136, accCode: 'ASS-1001', accName: 'Cash in Hand', groupName: 'Cash & Bank Balance', mainGroup: 'Asset' },
          { accountId: 137, accCode: 'ASS-1002', accName: 'The M.D C.C. Bank A/C No.', groupName: 'Cash & Bank Balance', mainGroup: 'Asset' },
          { accountId: 138, accCode: 'ASS-1003', accName: 'The Saraswat Bank A/C No.', groupName: 'Cash & Bank Balance', mainGroup: 'Asset' }
        ];
      }

      selectEl.innerHTML = cashBankAccounts.map((a, idx) => `
        <option value="${a.accountId || a.id}" ${idx === 0 ? 'selected' : ''}>
          [${a.accCode || ('ASS-' + (idx + 1001))}] ${a.accName}
        </option>
      `).join('');

      await loadCashBankBook();

    } catch (err) {
      console.error('Error loading cash & bank accounts', err);
      selectEl.innerHTML = '<option value="">Error loading accounts</option>';
    }
  }

  window.loadCashBankBook = async function () {
    const societyId = Auth.getSocietyId();
    const fyId = Auth.getFYId();
    const selectEl = document.getElementById('accountSelect');
    const tbody = document.getElementById('cashBankTableBody');

    const accountId = selectEl ? selectEl.value : null;
    if (!accountId) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:40px;">Please select a Cash or Bank account above.</td></tr>';
      return;
    }

    const selectedAcc = cashBankAccounts.find(a => String(a.accountId || a.id) === String(accountId)) || {};
    const accTitle = selectedAcc.accName || 'Cash / Bank Account';
    const prtAccEl = document.getElementById('prtAccName');
    if (prtAccEl) prtAccEl.textContent = `[${selectedAcc.accCode || 'ASS'}] ${accTitle}`;

    const fromDate = document.getElementById('fromDate').value || window._fyStartDate;
    const toDate = document.getElementById('toDate').value || window._fyEndDate;

    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:40px;"><i class="bi bi-arrow-repeat spin" style="font-size:20px; color:#0D47A1;"></i><br>Loading Cash/Bank statement...</td></tr>';

    try {
      let txs = [];
      let opBal = 0;
      let opDrCr = 'Dr';

      try {
        const res = await API.get(`/reports/ledger?societyId=${societyId}&fyId=${fyId}&accountId=${accountId}&fromDate=${fromDate}&toDate=${toDate}`);
        if (res && res.success) {
          txs = res.transactions || (res.accounts && res.accounts[0] && res.accounts[0].transactions) || [];
          opBal = parseFloat(res.opBal !== undefined ? res.opBal : (res.accounts && res.accounts[0] && res.accounts[0].opBal)) || 0;
          opDrCr = res.opDrCr || (res.accounts && res.accounts[0] && res.accounts[0].opDrCr) || 'Dr';
        }
      } catch (e) {
        console.warn('Backend report ledger query returned empty:', e);
      }

      currentOpeningBal = opBal;
      currentOpeningType = opDrCr;
      rawTransactions = txs;

      renderGrid();

    } catch (err) {
      console.error('Failed to load Cash/Bank Book', err);
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger" style="padding:40px;">Failed to load Cash/Bank Book statement.</td></tr>';
    }
  };

  function renderGrid() {
    const tbody = document.getElementById('cashBankTableBody');
    const vtypeFilter = (document.getElementById('vtypeFilter')?.value || 'ALL').toUpperCase();
    const searchTxt = (document.getElementById('txtSearch')?.value || '').toLowerCase().trim();

    let filtered = rawTransactions.filter(t => {
      if (vtypeFilter !== 'ALL') {
        const vt = (t.voucherType || '').toUpperCase();
        if (vtypeFilter === 'RECEIPT' && !vt.includes('RECEIPT') && !vt.includes('MRV') && !vt.includes('ORV')) return false;
        if (vtypeFilter === 'PAYMENT' && !vt.includes('PAYMENT') && !vt.includes('PYMT') && !vt.includes('CASH')) return false;
        if (vtypeFilter === 'CONTRA' && !vt.includes('CONTRA') && !vt.includes('CV')) return false;
        if (vtypeFilter === 'JOURNAL' && !vt.includes('JOURNAL') && !vt.includes('JV')) return false;
      }

      if (searchTxt) {
        const str = `${t.voucherNo || ''} ${t.particulars || ''} ${t.contraAccount || ''} ${t.chequeNo || ''}`.toLowerCase();
        if (!str.includes(searchTxt)) return false;
      }

      return true;
    });

    let runningBal = (currentOpeningType === 'Cr' ? -currentOpeningBal : currentOpeningBal);
    let totalDebit = 0;
    let totalCredit = 0;

    let html = '';

    // Opening Balance Row
    html += `
      <tr class="row-opening">
        <td style="text-align:center;"><i class="bi bi-box-arrow-in-right"></i></td>
        <td><strong>${formatDate(document.getElementById('fromDate').value || window._fyStartDate)}</strong></td>
        <td><span class="badge-vtype" style="background:#dcfce7; color:#166534;">OPENING BAL</span></td>
        <td colspan="3"><strong>Opening Balance Brought Forward (B/F)</strong></td>
        <td class="td-num val-debit">${currentOpeningBal > 0 && currentOpeningType !== 'Cr' ? formatAmount(currentOpeningBal) : '—'}</td>
        <td class="td-num val-credit">${currentOpeningBal > 0 && currentOpeningType === 'Cr' ? formatAmount(currentOpeningBal) : '—'}</td>
        <td class="td-num" style="font-weight:800; color:#0D47A1;">${formatAmount(Math.abs(runningBal))} ${runningBal >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>
    `;

    if (filtered.length === 0) {
      html += `
        <tr>
          <td colspan="9" class="text-center text-muted" style="padding:35px;">
            No transactions found for the selected account and filters in this date range.
          </td>
        </tr>
      `;
    } else {
      filtered.forEach((t, idx) => {
        const dr = parseFloat(t.debit || t.cashIn || t.bankIn) || 0;
        const cr = parseFloat(t.credit || t.cashOut || t.bankOut) || 0;

        totalDebit += dr;
        totalCredit += cr;
        runningBal += (dr - cr);

        const vtype = (t.voucherType || 'VOUCHER').toUpperCase();
        let badgeClass = 'badge-vtype';
        if (vtype.includes('RCPT') || vtype.includes('RECEIPT') || vtype.includes('MRV') || vtype.includes('ORV')) badgeClass += ' rcpt';
        else if (vtype.includes('PAY') || vtype.includes('PYMT') || vtype.includes('CASH')) badgeClass += ' pmt';
        else if (vtype.includes('CONTRA') || vtype.includes('CV')) badgeClass += ' contra';
        else if (vtype.includes('JV') || vtype.includes('JOURNAL')) badgeClass += ' jv';

        html += `
          <tr>
            <td style="text-align:center; font-weight:700; color:#64748b;">${idx + 1}</td>
            <td style="font-weight:600;">${formatDate(t.voucherDate)}</td>
            <td>
              <strong style="color:#0D47A1;">${escHtml(t.voucherNo || '—')}</strong>
              <span class="${badgeClass}" style="margin-left:4px;">${escHtml(t.voucherType || 'Voucher')}</span>
            </td>
            <td style="font-weight:600; color:#1e293b;">${escHtml(t.contraAccount || t.headName || '—')}</td>
            <td>${escHtml(t.particulars || t.narration || '—')}</td>
            <td style="font-family:monospace; font-size:10.5px; color:#475569;">${escHtml(t.chequeNo || t.refNo || '—')}</td>
            <td class="td-num val-debit">${dr > 0 ? formatAmount(dr) : '—'}</td>
            <td class="td-num val-credit">${cr > 0 ? formatAmount(cr) : '—'}</td>
            <td class="td-num" style="font-weight:800; color:#0D47A1;">${formatAmount(Math.abs(runningBal))} ${runningBal >= 0 ? 'Dr' : 'Cr'}</td>
          </tr>
        `;
      });
    }

    // Closing Balance Row
    html += `
      <tr class="row-closing">
        <td style="text-align:center;"><i class="bi bi-flag-fill" style="color:#0D47A1;"></i></td>
        <td><strong>${formatDate(document.getElementById('toDate').value || window._fyEndDate)}</strong></td>
        <td colspan="4"><strong>CLOSING BALANCE CARRIED FORWARD (C/F) &amp; PERIOD TOTALS</strong></td>
        <td class="td-num val-debit" style="font-size:12px; font-weight:800;">${formatAmount(totalDebit)}</td>
        <td class="td-num val-credit" style="font-size:12px; font-weight:800;">${formatAmount(totalCredit)}</td>
        <td class="td-num" style="font-size:12.5px; font-weight:800; color:#0D47A1;">${formatAmount(Math.abs(runningBal))} ${runningBal >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>
    `;

    tbody.innerHTML = html;

    // Update KPI Strip
    const opEl = document.getElementById('kpiOpeningBal');
    const drEl = document.getElementById('kpiTotalDr');
    const crEl = document.getElementById('kpiTotalCr');
    const clEl = document.getElementById('kpiClosingBal');
    const countEl = document.getElementById('kpiRowCount');

    if (opEl) opEl.textContent = `₹ ${formatAmount(currentOpeningBal)} ${currentOpeningType}`;
    if (drEl) drEl.textContent = `₹ ${formatAmount(totalDebit)}`;
    if (crEl) crEl.textContent = `₹ ${formatAmount(totalCredit)}`;
    if (clEl) clEl.textContent = `₹ ${formatAmount(Math.abs(runningBal))} ${runningBal >= 0 ? 'Dr' : 'Cr'}`;
    if (countEl) countEl.textContent = `Showing ${filtered.length} transaction(s)`;
  }

  window.filterLocalGrid = function () {
    renderGrid();
  };

  window.exportToExcel = function () {
    const table = document.getElementById('cashBankTable');
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
      const cols = row.querySelectorAll('td, th');
      const rowData = [];
      cols.forEach(col => {
        let text = col.innerText.replace(/"/g, '""').trim();
        rowData.push(`"${text}"`);
      });
      csv.push(rowData.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv.join('\n'));
    const link = document.createElement('a');
    const accEl = document.getElementById('accountSelect');
    const accName = accEl ? accEl.options[accEl.selectedIndex].text.replace(/[^a-zA-Z0-9]/g, '_') : 'Cash_Bank_Book';
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `${accName}_Register.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  function formatDate(dStr) {
    if (!dStr) return '—';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      const day = String(d.getDate()).padStart(2, '0');
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      return `${day}/${m}/${y}`;
    } catch (e) {
      return dStr;
    }
  }

  function formatAmount(num) {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
