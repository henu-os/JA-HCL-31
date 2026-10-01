/**
 * bill-register.js — Member Bill Register Engine (Landscape A4)
 * Architecture: Real ERP Backend Data + Active Published HENU OS DESIGN + Mail to Committee UX
 */

(function () {
  'use strict';

  const REPORT_KEY = 'bill-register';
  let activeDesign = null;
  let currentReportData = null;

  async function init() {
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    HenuOsReportEngine.applyDesignToDOM(activeDesign);
    await loadBillRegister();
  }

  async function loadBillRegister() {
    const container = document.getElementById('brContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading Bill Register from ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const wing = document.getElementById('filterWing')?.value?.trim() || '';
    const member = document.getElementById('filterMember')?.value?.trim() || '';
    const fyId = document.getElementById('filterFy')?.value || ctx.fyId;
    const period = document.getElementById('filterPeriod')?.value || '';

    let url = `${ctx.apiBase}/reports/member/bill-register?societyId=${ctx.societyId}&fyId=${fyId}`;
    if (wing) url += `&wing=${encodeURIComponent(wing)}`;
    if (member) url += `&fromMember=${encodeURIComponent(member)}`;
    if (period) url += `&period=${encodeURIComponent(period)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to fetch bill register data.');
      }

      currentReportData = data;
      updateKpis(data);

      const bills = data.bills || [];
      if (bills.length === 0) {
        HenuOsReportEngine.renderEmpty(
          container,
          'No bill records found for the selected criteria.',
          'Try clearing or adjusting your Wing, Member, or Financial Year filters.'
        );
        return;
      }

      renderBillRegister(data);
    } catch (err) {
      console.error('[BillRegister] Load error:', err);
      HenuOsReportEngine.renderError(
        container,
        'Unable to load Bill Register data from ERP server.',
        err.message || 'Network request failed.',
        loadBillRegister
      );
    }
  }

  function updateKpis(data) {
    const bills = data.bills || [];
    const countEl = document.getElementById('kpiTotalBills');
    const taxableEl = document.getElementById('kpiTotalTaxable');
    const taxEl = document.getElementById('kpiTotalTax');
    const grandEl = document.getElementById('kpiGrandTotal');

    let totalTaxable = 0, totalTax = 0, grandTotal = 0;
    bills.forEach(b => {
      totalTaxable += Number(b.taxable || 0);
      totalTax += Number(b.cgst || 0) + Number(b.sgst || 0);
      grandTotal += Number(b.total || 0);
    });

    if (countEl) countEl.textContent = bills.length;
    if (taxableEl) taxableEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totalTaxable)}`;
    if (taxEl) taxEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totalTax)}`;
    if (grandEl) grandEl.textContent = `₹ ${HenuOsReportEngine.formatINR(grandTotal)}`;
  }

  function renderBillRegister(data) {
    const container = document.getElementById('brContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    const society = data.society || {};
    const bills = data.bills || [];

    let totMaint = 0, totSink = 0, totPark = 0, totNonOcc = 0, totOther = 0, totArrears = 0, totTaxable = 0, totCgst = 0, totSgst = 0, totGrand = 0;

    bills.forEach(b => {
      totMaint += Number(b.maintenance || 0);
      totSink += Number(b.sinking || 0);
      totPark += Number(b.parking || 0);
      totNonOcc += Number(b.nonOccupancy || 0);
      totOther += Number(b.other || 0);
      totArrears += Number(b.arrears || 0);
      totTaxable += Number(b.taxable || 0);
      totCgst += Number(b.cgst || 0);
      totSgst += Number(b.sgst || 0);
      totGrand += Number(b.total || 0);
    });

    const rowsHtml = bills.map((b, idx) => `
      <tr>
        <td class="center">${b.srNo || (idx + 1)}</td>
        <td><strong>${HenuOsReportEngine.escapeHtml(b.billNo || '-')}</strong></td>
        <td class="center">${HenuOsReportEngine.formatDate(b.billDate)}</td>
        <td class="center"><b>${HenuOsReportEngine.escapeHtml(b.wing ? b.wing + '-' : '')}${HenuOsReportEngine.escapeHtml(b.flatNo || '-')}</b></td>
        <td>${HenuOsReportEngine.escapeHtml(b.memberName || '-')}</td>
        <td class="right">${HenuOsReportEngine.formatINR(b.maintenance)}</td>
        <td class="right">${HenuOsReportEngine.formatINR(b.sinking)}</td>
        <td class="right">${HenuOsReportEngine.formatINR(b.parking)}</td>
        <td class="right">${HenuOsReportEngine.formatINR(b.nonOccupancy)}</td>
        <td class="right">${HenuOsReportEngine.formatINR(b.arrears)}</td>
        <td class="right">${HenuOsReportEngine.formatINR(b.taxable)}</td>
        <td class="right">${HenuOsReportEngine.formatINR(b.cgst)}</td>
        <td class="right">${HenuOsReportEngine.formatINR(b.sgst)}</td>
        <td class="right"><strong>${HenuOsReportEngine.formatINR(b.total)}</strong></td>
      </tr>
    `).join('');

    const html = `
      <div class="br-report-page henu-dynamic-document">
        <!-- 1. Header -->
        <div class="br-header">
          <div class="br-soc-name">${HenuOsReportEngine.escapeHtml(society.SocietyName || society.societyName || 'CO-OPERATIVE HOUSING SOCIETY LTD.')}</div>
          <div style="font-size:8pt; color:var(--br-text-muted);">${HenuOsReportEngine.escapeHtml(society.Address || society.address || 'Registered Society Premises')} ${society.RegistrationNo ? '| Reg: ' + HenuOsReportEngine.escapeHtml(society.RegistrationNo) : ''}</div>
        </div>

        <!-- 2. Title Bar -->
        <div class="br-title-bar">
          <div class="br-doc-title">MEMBER BILL REGISTER (DEMAND REGISTER)</div>
          <div style="font-size:8.5pt; font-weight:600;">Billing Period: ${HenuOsReportEngine.escapeHtml(data.period || 'Current Period')}</div>
        </div>

        <!-- 3. Register Data Table -->
        <table class="br-table">
          <thead>
            <tr>
              <th style="width:25px;" class="center">#</th>
              <th style="width:85px;">Bill No</th>
              <th style="width:65px;" class="center">Date</th>
              <th style="width:35px;" class="center">W-Fl</th>
              <th>Member Name</th>
              <th style="width:70px;" class="right">Maint (₹)</th>
              <th style="width:60px;" class="right">Sinking (₹)</th>
              <th style="width:60px;" class="right">Parking (₹)</th>
              <th style="width:60px;" class="right">Non-Occ (₹)</th>
              <th style="width:65px;" class="right">Arrears (₹)</th>
              <th style="width:75px;" class="right">Taxable (₹)</th>
              <th style="width:60px;" class="right">CGST (₹)</th>
              <th style="width:60px;" class="right">SGST (₹)</th>
              <th style="width:85px;" class="right">Total Bill (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="br-totals-row">
              <td colspan="5" style="text-align:right; font-weight:700;">REGISTER TOTALS:</td>
              <td class="right">${HenuOsReportEngine.formatINR(totMaint)}</td>
              <td class="right">${HenuOsReportEngine.formatINR(totSink)}</td>
              <td class="right">${HenuOsReportEngine.formatINR(totPark)}</td>
              <td class="right">${HenuOsReportEngine.formatINR(totNonOcc)}</td>
              <td class="right">${HenuOsReportEngine.formatINR(totArrears)}</td>
              <td class="right">${HenuOsReportEngine.formatINR(totTaxable)}</td>
              <td class="right">${HenuOsReportEngine.formatINR(totCgst)}</td>
              <td class="right">${HenuOsReportEngine.formatINR(totSgst)}</td>
              <td class="right" style="font-size:8.5pt; font-weight:800;">₹ ${HenuOsReportEngine.formatINR(totGrand)}</td>
            </tr>
          </tbody>
        </table>

        <!-- 4. Footer -->
        <div class="br-footer">
          <div>Total Bills: <b>${bills.length}</b> | Generated: ${new Date().toLocaleString('en-IN')}</div>
          <div>Page 1 of 1</div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function resetFilters() {
    const wing = document.getElementById('filterWing');
    const member = document.getElementById('filterMember');
    const period = document.getElementById('filterPeriod');
    if (wing) wing.value = '';
    if (member) member.value = '';
    if (period) period.value = '';
    loadBillRegister();
  }

  window.loadBillRegister = loadBillRegister;
  window.resetFilters = resetFilters;
  window.printReport = () => window.print();
  window.exportPdf = () => window.print();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
