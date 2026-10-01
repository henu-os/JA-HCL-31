/**
 * member-control-account.js — Member Control Account Ledger Engine
 * Connects 100% to Live ERP Database & Active HENU OS Design
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_CONTROL_ACCOUNT';
  let activeDesign = null;

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    loadControlAccount();
  });

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadControlAccount());
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadControlAccount());
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnPdf')?.addEventListener('click', () => window.print());
  }

  function resetFilters() {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    loadControlAccount();
  }

  async function loadControlAccount() {
    const container = document.getElementById('controlAccountContainer');
    const kpiStrip = document.getElementById('kpiStrip');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading control account ledger from HENU ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const fromDate = document.getElementById('filterDateFrom')?.value || '';
    const toDate = document.getElementById('filterDateTo')?.value || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId);
      if (ctx.fyId) params.append('fyId', ctx.fyId);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);

      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/control-account?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const rows = data.rows || data.items || [];
      const society = data.society || {};
      const summary = data.summary || {};

      if (rows.length === 0 && (!summary.openingDebtors && !summary.closingReceivable)) {
        HenuOsReportEngine.renderEmpty(container, 'No control account transactions found for the selected period.');
        if (kpiStrip) kpiStrip.style.display = 'none';
        return;
      }

      // Update KPI strip
      if (kpiStrip) {
        document.getElementById('kpiOpening').textContent = HenuOsReportEngine.formatINR(data.openingDebtors || summary.openingDebtors || 0);
        document.getElementById('kpiDemand').textContent = HenuOsReportEngine.formatINR(data.totalDebits || summary.totalMaintenanceRaised || 0);
        document.getElementById('kpiCollections').textContent = HenuOsReportEngine.formatINR(data.totalCredits || summary.totalCollections || 0);
        document.getElementById('kpiClosing').textContent = HenuOsReportEngine.formatINR(data.closingReceivable || summary.closingReceivable || 0);
        kpiStrip.style.display = 'flex';
      }

      renderControlAccountHTML(society, data, rows, container);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[Control Account] Error loading control account:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load member control account ledger from server.', () => loadControlAccount());
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  function renderControlAccountHTML(soc, data, rows, container) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const addr = soc.Address || soc.address || '';

    const opening = data.openingDebtors || data.summary?.openingDebtors || 0;
    const closing = data.closingReceivable || data.summary?.closingReceivable || 0;
    const totRaised = data.totalDebits || data.summary?.totalMaintenanceRaised || 0;
    const totCol = data.totalCredits || data.summary?.totalCollections || 0;
    const totAdj = data.summary?.totalAdjustments || 0;

    let trRows = '';
    rows.forEach(r => {
      trRows += `
        <tr>
          <td class="center" style="width:35px;">${r.srNo || '-'}</td>
          <td class="center" style="width:75px;">${HenuOsReportEngine.formatDate(r.postingDate || r.date)}</td>
          <td class="center" style="font-weight:700; width:90px;">${HenuOsReportEngine.escapeHtml(r.voucher || r.voucherNo || '-')}</td>
          <td>${HenuOsReportEngine.escapeHtml(r.transaction || r.particulars || r.monthName || '-')}</td>
          <td class="right" style="width:105px; ${r.debit > 0 ? 'font-weight:700;' : 'color:#94a3b8;'}">${r.debit > 0 ? HenuOsReportEngine.formatINR(r.debit) : '-'}</td>
          <td class="right" style="width:105px; ${r.credit > 0 ? 'font-weight:700; color:#15803d;' : 'color:#94a3b8;'}">${r.credit > 0 ? HenuOsReportEngine.formatINR(r.credit) : '-'}</td>
          <td class="right" style="width:115px; font-weight:800; color:var(--ctrl-primary);">${HenuOsReportEngine.formatINR(r.runningBalance || 0)}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div class="ctrl-report-page">
        <!-- Header -->
        <header class="ctrl-header">
          <div class="ctrl-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
          <div class="ctrl-soc-meta">
            ${regNo ? `Reg No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
            ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong>` : ''}
            ${addr ? `<br>${HenuOsReportEngine.escapeHtml(addr)}` : ''}
          </div>
        </header>

        <!-- Title Bar -->
        <div class="ctrl-title-bar">
          <div class="ctrl-doc-title">MEMBER CONTROL ACCOUNT LEDGER</div>
          <div>Period: <strong>${data.fyLabel || 'Financial Year'}</strong></div>
        </div>

        <!-- Opening Debtors Strip -->
        <div class="ctrl-opening-box">
          <div><strong style="color:var(--ctrl-primary);">Account Classification:</strong> Sundry Debtors (Member Receivables Control Account)</div>
          <div>Opening Debtors Balance: <strong style="font-size:10pt; color:var(--ctrl-primary);">${HenuOsReportEngine.formatINR(opening)} Dr</strong></div>
        </div>

        <!-- Transactions Ledger Table -->
        <table class="ctrl-table">
          <thead>
            <tr>
              <th class="center">Sr</th>
              <th class="center">Date</th>
              <th class="center">Voucher Ref</th>
              <th>Particulars / Monthly Summary</th>
              <th class="right">Debit (Demand) (₹)</th>
              <th class="right">Credit (Collected) (₹)</th>
              <th class="right">Running Receivable (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${trRows}
            <tr style="background:#e2e8f0; font-weight:800; border-top:2px solid var(--ctrl-primary);">
              <td colspan="4" class="right">TOTAL TRANSACTIONS:</td>
              <td class="right">${HenuOsReportEngine.formatINR(totRaised)}</td>
              <td class="right" style="color:#15803d;">${HenuOsReportEngine.formatINR(totCol)}</td>
              <td class="right" style="color:var(--ctrl-primary); font-size:9.5pt;">${HenuOsReportEngine.formatINR(closing)}</td>
            </tr>
          </tbody>
        </table>

        <!-- 6-Box Reconciliation Matrix -->
        <div class="ctrl-recon-matrix">
          <div class="ctrl-recon-item">
            <div class="lbl">Opening Debtors</div>
            <div class="val">${HenuOsReportEngine.formatINR(opening)}</div>
          </div>
          <div class="ctrl-recon-item">
            <div class="lbl">Maintenance Raised (+)</div>
            <div class="val">${HenuOsReportEngine.formatINR(totRaised)}</div>
          </div>
          <div class="ctrl-recon-item">
            <div class="lbl">Total Collections (-)</div>
            <div class="val" style="color:#15803d;">${HenuOsReportEngine.formatINR(totCol)}</div>
          </div>
          <div class="ctrl-recon-item">
            <div class="lbl">Adjustments / Transfers</div>
            <div class="val">${HenuOsReportEngine.formatINR(totAdj)}</div>
          </div>
          <div class="ctrl-recon-item">
            <div class="lbl">Net Movement</div>
            <div class="val">${HenuOsReportEngine.formatINR(totRaised - totCol)}</div>
          </div>
          <div class="ctrl-recon-item">
            <div class="lbl">Closing Receivable</div>
            <div class="val" style="color:var(--ctrl-primary);">${HenuOsReportEngine.formatINR(closing)}</div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="ctrl-footer">
          <div>Generated by HENU ERP on ${new Date().toLocaleString()}</div>
          <div>Page 1 of 1</div>
        </footer>
      </div>
    `;
  }
})();
