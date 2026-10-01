/**
 * bank-deposit-list.js — Member Bank Deposit Pay-in List Engine
 * Connects 100% to Live ERP Database & Active HENU OS Design
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_BANK_DEPOSIT';
  let activeDesign = null;

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    loadDeposits();
  });

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadDeposits());
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadDeposits());
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnPdf')?.addEventListener('click', () => window.print());
  }

  function resetFilters() {
    document.getElementById('filterBankName').value = '';
    document.getElementById('filterPaymentMode').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    loadDeposits();
  }

  async function loadDeposits() {
    const container = document.getElementById('bankDepositContainer');
    const kpiStrip = document.getElementById('kpiStrip');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading bank deposits from HENU ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const bankName = document.getElementById('filterBankName')?.value?.trim() || '';
    const paymentMode = document.getElementById('filterPaymentMode')?.value || '';
    const fromDate = document.getElementById('filterDateFrom')?.value || '';
    const toDate = document.getElementById('filterDateTo')?.value || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId);
      if (ctx.fyId) params.append('fyId', ctx.fyId);
      if (bankName) params.append('bankName', bankName);
      if (paymentMode) params.append('paymentMode', paymentMode);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);

      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/bank-deposit-list?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const deposits = data.deposits || data.items || [];
      const society = data.society || {};

      if (deposits.length === 0) {
        HenuOsReportEngine.renderEmpty(container, 'No deposit records found for the selected bank / date criteria.');
        if (kpiStrip) kpiStrip.style.display = 'none';
        return;
      }

      // Update KPI strip
      if (kpiStrip) {
        let totChq = 0;
        let totElec = 0;
        let grandTot = 0;

        deposits.forEach(d => {
          const amt = d.amount || 0;
          grandTot += amt;
          const mode = (d.paymentMode || d.instrument || '').toUpperCase();
          if (mode.includes('CHQ') || mode.includes('CHEQUE')) {
            totChq += amt;
          } else {
            totElec += amt;
          }
        });

        document.getElementById('kpiTotalDeposits').textContent = deposits.length;
        document.getElementById('kpiTotalCheques').textContent = HenuOsReportEngine.formatINR(totChq);
        document.getElementById('kpiTotalElectronic').textContent = HenuOsReportEngine.formatINR(totElec);
        document.getElementById('kpiGrandTotal').textContent = HenuOsReportEngine.formatINR(grandTot);
        kpiStrip.style.display = 'flex';
      }

      renderBankDepositsHTML(society, data, deposits, container);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[Bank Deposit List] Error loading deposits:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load deposit records from server.', () => loadDeposits());
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  function renderBankDepositsHTML(soc, data, deposits, container) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const addr = soc.Address || soc.address || '';
    const bankName = soc.BankName || soc.bankname || 'Bank of Baroda';
    const accNo = soc.BankAccountNo || soc.bankaccountno || '';
    const ifsc = soc.IFSCCode || soc.ifsccode || '';

    let totCash = 0;
    let totChq = 0;
    let totElec = 0;
    let grandTot = 0;
    let trRows = '';

    deposits.forEach((d, idx) => {
      const amt = d.amount || 0;
      grandTot += amt;
      const mode = (d.paymentMode || d.instrument || 'Cheque').toUpperCase();
      if (mode.includes('CASH')) totCash += amt;
      else if (mode.includes('CHQ') || mode.includes('CHEQUE')) totChq += amt;
      else totElec += amt;

      trRows += `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center">${HenuOsReportEngine.formatDate(d.depositDate || d.date)}</td>
          <td class="center"><strong>${HenuOsReportEngine.escapeHtml(d.receiptNo || d.voucherNo || '-')}</strong></td>
          <td><strong>${HenuOsReportEngine.escapeHtml(d.member || d.memberName || d.personName || '-')}</strong></td>
          <td class="center">${HenuOsReportEngine.escapeHtml(d.flat || d.flatNo || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(d.paymentMode || d.instrument || 'Cheque')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(d.chequeNo || d.instrumentNo || d.transactionRef || '-')}</td>
          <td>${HenuOsReportEngine.escapeHtml(d.bankName || d.drawnOnBank || '-')}</td>
          <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(amt)}</td>
          <td class="center"><span style="color:#15803d; font-weight:700; font-size:7.5pt;">${HenuOsReportEngine.escapeHtml(d.clearanceStatus || d.status || 'Received')}</span></td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div class="bd-report-page">
        <!-- Header -->
        <header class="bd-header">
          <div class="bd-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
          <div class="bd-soc-meta">
            ${regNo ? `Reg No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
            ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong>` : ''}
            ${addr ? `<br>${HenuOsReportEngine.escapeHtml(addr)}` : ''}
          </div>
        </header>

        <!-- Title Bar -->
        <div class="bd-title-bar">
          <div class="bd-doc-title">BANK DEPOSIT / PAY-IN LIST</div>
          <div>Period: <strong>${data.fyLabel || 'Current FY'}</strong></div>
        </div>

        <!-- Bank Account Target Strip -->
        <div class="bd-bank-info-box">
          <div>Deposit To: <strong>${HenuOsReportEngine.escapeHtml(bankName)}</strong></div>
          ${accNo ? `<div>Account No: <strong>${HenuOsReportEngine.escapeHtml(accNo)}</strong></div>` : ''}
          ${ifsc ? `<div>IFSC Code: <strong>${HenuOsReportEngine.escapeHtml(ifsc)}</strong></div>` : ''}
        </div>

        <!-- Deposits Table -->
        <table class="bd-table">
          <thead>
            <tr>
              <th class="center" style="width:30px;">Sr</th>
              <th class="center" style="width:70px;">Date</th>
              <th class="center" style="width:75px;">Receipt No</th>
              <th>Member Name</th>
              <th class="center" style="width:50px;">Flat</th>
              <th class="center" style="width:65px;">Mode</th>
              <th class="center" style="width:85px;">Inst / Ref No</th>
              <th>Drawn On Bank</th>
              <th class="right" style="width:95px;">Amount (₹)</th>
              <th class="center" style="width:65px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${trRows}
            <tr style="background:#e2e8f0; font-weight:800; border-top:2px solid var(--bd-primary);">
              <td colspan="8" class="right">GRAND TOTAL DEPOSITS:</td>
              <td class="right" style="color:var(--bd-primary); font-size:9pt;">${HenuOsReportEngine.formatINR(grandTot)}</td>
              <td class="center">-</td>
            </tr>
          </tbody>
        </table>

        <!-- Summary Grid -->
        <div class="bd-summary-grid">
          <div class="bd-summary-item">
            <div class="lbl">Total Cheques</div>
            <div class="val">${HenuOsReportEngine.formatINR(totChq)}</div>
          </div>
          <div class="bd-summary-item">
            <div class="lbl">Total Electronic (NEFT/UPI)</div>
            <div class="val">${HenuOsReportEngine.formatINR(totElec)}</div>
          </div>
          <div class="bd-summary-item">
            <div class="lbl">Total Cash</div>
            <div class="val">${HenuOsReportEngine.formatINR(totCash)}</div>
          </div>
          <div class="bd-summary-item">
            <div class="lbl">Grand Total Deposited</div>
            <div class="val" style="color:var(--bd-primary);">${HenuOsReportEngine.formatINR(grandTot)}</div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="bd-footer" style="margin-top:auto; padding-top:8px; border-top:1px solid #cbd5e1; display:flex; justify-content:space-between; font-size:7.5pt; color:#64748b;">
          <div>Generated by HENU ERP on ${new Date().toLocaleString()}</div>
          <div>Deposited By: ___________________ &nbsp; &nbsp; Bank Stamp: [ &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ]</div>
        </footer>
      </div>
    `;
  }
})();
