/**
 * receipt-register.js — Member Receipt Register Engine (Landscape A4)
 * Architecture: Real ERP Backend Data + Active Published HENU OS DESIGN + Mail to Committee UX
 */

(function () {
  'use strict';

  const REPORT_KEY = 'receipt-register';
  let activeDesign = null;
  let currentReportData = null;

  async function init() {
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    HenuOsReportEngine.applyDesignToDOM(activeDesign);
    await loadReceiptRegister();
  }

  async function loadReceiptRegister() {
    const container = document.getElementById('rrContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading Receipt Register from ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const mode = document.getElementById('filterMode')?.value || 'all';
    const member = document.getElementById('filterMember')?.value?.trim() || '';
    const fromDate = document.getElementById('filterFromDate')?.value || '';
    const toDate = document.getElementById('filterToDate')?.value || '';

    let url = `${ctx.apiBase}/reports/member/receipt-register?societyId=${ctx.societyId}&fyId=${ctx.fyId}`;
    if (mode && mode !== 'all') url += `&paymentMode=${encodeURIComponent(mode)}`;
    if (member) url += `&fromMember=${encodeURIComponent(member)}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to fetch receipt register data.');
      }

      currentReportData = data;
      updateKpis(data);

      const receipts = data.receipts || [];
      if (receipts.length === 0) {
        HenuOsReportEngine.renderEmpty(
          container,
          'No receipt records found for the selected criteria.',
          'Try clearing or adjusting your Date, Payment Mode, or Member filters.'
        );
        return;
      }

      renderReceiptRegister(data);
    } catch (err) {
      console.error('[ReceiptRegister] Load error:', err);
      HenuOsReportEngine.renderError(
        container,
        'Unable to load Receipt Register data from ERP server.',
        err.message || 'Network request failed.',
        loadReceiptRegister
      );
    }
  }

  function updateKpis(data) {
    const receipts = data.receipts || [];
    let totCash = 0, totCheque = 0, totDigital = 0, grandTotal = 0;

    receipts.forEach(r => {
      const amt = Number(r.amount || 0);
      grandTotal += amt;
      const m = (r.mode || '').toUpperCase();
      if (m.includes('CASH')) totCash += amt;
      else if (m.includes('CHEQUE')) totCheque += amt;
      else totDigital += amt;
    });

    const countEl = document.getElementById('kpiReceiptCount');
    const cashEl = document.getElementById('kpiCash');
    const chequeEl = document.getElementById('kpiCheque');
    const digitalEl = document.getElementById('kpiDigital');
    const totalEl = document.getElementById('kpiTotalCollections');

    if (countEl) countEl.textContent = receipts.length;
    if (cashEl) cashEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totCash)}`;
    if (chequeEl) chequeEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totCheque)}`;
    if (digitalEl) digitalEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totDigital)}`;
    if (totalEl) totalEl.textContent = `₹ ${HenuOsReportEngine.formatINR(grandTotal)}`;
  }

  function renderReceiptRegister(data) {
    const container = document.getElementById('rrContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    const society = data.society || {};
    const receipts = data.receipts || [];

    let totCash = 0, totCheque = 0, totDigital = 0, grandTotal = 0;

    receipts.forEach(r => {
      const amt = Number(r.amount || 0);
      grandTotal += amt;
      const m = (r.mode || '').toUpperCase();
      if (m.includes('CASH')) totCash += amt;
      else if (m.includes('CHEQUE')) totCheque += amt;
      else totDigital += amt;
    });

    const rowsHtml = receipts.map((r, idx) => `
      <tr>
        <td class="center">${r.srNo || (idx + 1)}</td>
        <td><strong>${HenuOsReportEngine.escapeHtml(r.receiptNo || '-')}</strong></td>
        <td class="center">${HenuOsReportEngine.formatDate(r.date)}</td>
        <td><strong>${HenuOsReportEngine.escapeHtml(r.memberName || '-')}</strong></td>
        <td class="center">${HenuOsReportEngine.escapeHtml(r.wing || '-')}</td>
        <td class="center"><b>${HenuOsReportEngine.escapeHtml(r.flatNo || '-')}</b></td>
        <td class="center"><span style="font-size:7pt; background:#f1f5f9; padding:2px 6px; border-radius:3px; font-weight:700;">${HenuOsReportEngine.escapeHtml(r.mode || 'OTHER')}</span></td>
        <td>${HenuOsReportEngine.escapeHtml(r.refNo || '-')}</td>
        <td>${HenuOsReportEngine.escapeHtml(r.bank || '-')}</td>
        <td class="right"><strong>${HenuOsReportEngine.formatINR(r.amount)}</strong></td>
        <td class="center"><span style="font-size:7pt; background:#dcfce7; color:#166534; padding:2px 5px; border-radius:3px; font-weight:700;">${HenuOsReportEngine.escapeHtml(r.status || 'CLEARED')}</span></td>
      </tr>
    `).join('');

    const html = `
      <div class="rr-report-page henu-dynamic-document">
        <!-- 1. Header -->
        <div class="rr-header">
          <div class="rr-soc-name">${HenuOsReportEngine.escapeHtml(society.SocietyName || society.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.')}</div>
          <div style="font-size:8pt; color:var(--rr-text-muted);">${HenuOsReportEngine.escapeHtml(society.Address || society.address || 'Registered Society Premises')} ${society.RegistrationNo ? '| Reg: ' + HenuOsReportEngine.escapeHtml(society.RegistrationNo) : ''}</div>
        </div>

        <!-- 2. Title Bar -->
        <div class="rr-title-bar">
          <div class="rr-doc-title">MEMBER RECEIPT REGISTER (COLLECTIONS LOG)</div>
          <div style="font-size:8.5pt; font-weight:600;">Period: ${HenuOsReportEngine.escapeHtml(data.period || 'Current Financial Year')}</div>
        </div>

        <!-- 3. Summary Breakdown Matrix -->
        <div class="rr-summary-grid">
          <div class="rr-summary-item">
            <div class="lbl">Total Cash Collections</div>
            <div class="val">₹ ${HenuOsReportEngine.formatINR(totCash)}</div>
          </div>
          <div class="rr-summary-item">
            <div class="lbl">Total Cheque Collections</div>
            <div class="val">₹ ${HenuOsReportEngine.formatINR(totCheque)}</div>
          </div>
          <div class="rr-summary-item">
            <div class="lbl">Total Digital / NEFT / UPI</div>
            <div class="val">₹ ${HenuOsReportEngine.formatINR(totDigital)}</div>
          </div>
          <div class="rr-summary-item">
            <div class="lbl">Grand Total Received</div>
            <div class="val" style="color:var(--rr-accent); font-size:11pt; font-weight:800;">₹ ${HenuOsReportEngine.formatINR(grandTotal)}</div>
          </div>
        </div>

        <!-- 4. Register Data Table -->
        <table class="rr-table">
          <thead>
            <tr>
              <th style="width:30px;" class="center">#</th>
              <th style="width:105px;">Receipt No</th>
              <th style="width:75px;" class="center">Date</th>
              <th>Member Name</th>
              <th style="width:40px;" class="center">Wing</th>
              <th style="width:50px;" class="center">Flat</th>
              <th style="width:75px;" class="center">Mode</th>
              <th style="width:125px;">Cheque / Ref No</th>
              <th>Drawn Bank</th>
              <th style="width:100px;" class="right">Amount (₹)</th>
              <th style="width:75px;" class="center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#e2e8f0; font-weight:800; border-top:2px solid var(--rr-primary);">
              <td colspan="9" style="text-align:right;">TOTAL COLLECTIONS:</td>
              <td class="right" style="color:var(--rr-primary); font-size:9pt; font-weight:800;">₹ ${HenuOsReportEngine.formatINR(grandTotal)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <!-- 5. Footer -->
        <div class="rr-footer">
          <div>Total Receipts: <b>${receipts.length}</b> | Generated: ${new Date().toLocaleString('en-IN')}</div>
          <div>Page 1 of 1</div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function resetFilters() {
    const mode = document.getElementById('filterMode');
    const member = document.getElementById('filterMember');
    const fromDate = document.getElementById('filterFromDate');
    const toDate = document.getElementById('filterToDate');
    if (mode) mode.value = 'all';
    if (member) member.value = '';
    if (fromDate) fromDate.value = '';
    if (toDate) toDate.value = '';
    loadReceiptRegister();
  }

  window.loadReceiptRegister = loadReceiptRegister;
  window.resetFilters = resetFilters;
  window.printReport = () => window.print();
  window.exportPdf = () => window.print();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
