/**
 * adjustment-register.js — Member Adjustment Register Engine (Landscape A4)
 * Architecture: Real ERP Backend Data + Active Published HENU OS DESIGN + Mail to Committee UX
 */

(function () {
  'use strict';

  const REPORT_KEY = 'adjustment-register';
  let activeDesign = null;
  let currentReportData = null;

  async function init() {
    initDateFilters();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    HenuOsReportEngine.applyDesignToDOM(activeDesign);
    await loadAdjustmentRegister();
  }

  function initDateFilters() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    
    if (fromEl && !fromEl.value) fromEl.value = `${y}-04-01`;
    if (toEl && !toEl.value) toEl.value = `${y}-${m}-${d}`;
  }

  async function loadAdjustmentRegister() {
    const container = document.getElementById('arContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading Adjustment Register from ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const wing = document.getElementById('wing')?.value?.trim() || '';
    const member = document.getElementById('fromMember')?.value?.trim() || '';

    let url = `${ctx.apiBase}/reports/member/adjustment-register?societyId=${ctx.societyId}&fyId=${ctx.fyId}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;
    if (wing) url += `&wing=${encodeURIComponent(wing)}`;
    if (member) url += `&fromMember=${encodeURIComponent(member)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to fetch adjustment register data.');
      }

      currentReportData = data;
      const items = data.adjustments || data.items || [];
      updateKpis(items);

      if (items.length === 0) {
        HenuOsReportEngine.renderEmpty(
          container,
          'No adjustment records found for the selected criteria.',
          'Try adjusting your Date, Wing, or Member filters.'
        );
        return;
      }

      renderAdjustmentRegister(data);
    } catch (err) {
      console.error('[AdjustmentRegister] Load error:', err);
      HenuOsReportEngine.renderError(
        container,
        'Unable to load Adjustment Register data from ERP server.',
        err.message || 'Network request failed.',
        loadAdjustmentRegister
      );
    }
  }

  function updateKpis(items) {
    const totalAmount = items.reduce((acc, row) => acc + Number(row.amount || 0), 0);
    const countEl = document.getElementById('kpiTotalCount');
    const amtEl = document.getElementById('kpiTotalAmount');

    if (countEl) countEl.textContent = items.length;
    if (amtEl) amtEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totalAmount)}`;
  }

  function renderAdjustmentRegister(data) {
    const container = document.getElementById('arContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    const soc = data.society || {};
    const items = data.adjustments || data.items || [];
    const totalAmount = items.reduce((acc, row) => acc + Number(row.amount || 0), 0);

    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';

    const rowsHtml = items.map((row, idx) => {
      const statusClass = (row.status || 'Posted').toLowerCase() === 'posted' ? 'posted' : 'draft';
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center" style="font-weight:700;">${HenuOsReportEngine.escapeHtml(row.adjustmentNumber || row.adjNo || '-')}</td>
          <td class="center">${HenuOsReportEngine.formatDate(row.date || row.adjustmentDate)}</td>
          <td><strong>${HenuOsReportEngine.escapeHtml(row.memberName || row.residentName || '-')}</strong></td>
          <td class="center">${HenuOsReportEngine.escapeHtml(row.wing || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(row.flatNo || row.unit || '-')}</td>
          <td>${HenuOsReportEngine.escapeHtml(row.sourceHead || row.source || 'Advance Maintenance')}</td>
          <td>${HenuOsReportEngine.escapeHtml(row.destHead || row.destination || 'Current Dues')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(row.adjustmentType || row.adjType || 'Adjustment')}</td>
          <td class="right" style="font-weight:700; color:var(--ar-primary);">${HenuOsReportEngine.formatINR(row.amount || 0)}</td>
          <td>${HenuOsReportEngine.escapeHtml(row.narration || '-')}</td>
          <td class="center"><span class="ar-status-tag ${statusClass}">${HenuOsReportEngine.escapeHtml(row.status || 'Posted')}</span></td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="ar-report-page henu-dynamic-document">
        <header class="ar-header">
          <div class="ar-soc-name">${HenuOsReportEngine.escapeHtml(soc.SocietyName || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.')}</div>
          <div class="ar-soc-sub">
            ${soc.RegistrationNo ? 'Reg. No: ' + HenuOsReportEngine.escapeHtml(soc.RegistrationNo) + ' | ' : ''}
            ${soc.Address || soc.address || 'Registered Society Premises'}
          </div>
        </header>

        <div class="ar-title-bar">
          <div class="ar-doc-title">MEMBER ADJUSTMENT REGISTER</div>
          <div class="ar-period-tag">Period: ${HenuOsReportEngine.formatDate(fromDate)} to ${HenuOsReportEngine.formatDate(toDate)}</div>
        </div>

        <div class="ar-table-wrapper">
          <table class="ar-table">
            <thead>
              <tr>
                <th class="center" style="width:30px;">Sr</th>
                <th class="center" style="width:75px;">Adj No</th>
                <th class="center" style="width:70px;">Date</th>
                <th style="width:140px;">Member Name</th>
                <th class="center" style="width:40px;">Wing</th>
                <th class="center" style="width:40px;">Flat</th>
                <th style="width:120px;">Source Head</th>
                <th style="width:120px;">Destination Head</th>
                <th class="center" style="width:85px;">Type</th>
                <th class="right" style="width:75px;">Amount (₹)</th>
                <th>Narration</th>
                <th class="center" style="width:60px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="9" class="right" style="font-weight:700;">TOTAL ADJUSTMENT AMOUNT:</td>
                <td class="right" style="color:var(--ar-primary); font-weight:800;">₹ ${HenuOsReportEngine.formatINR(totalAmount)}</td>
                <td colspan="2" class="center">-</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="ar-summary-grid">
          <div class="ar-summary-item">
            <div class="lbl">Total Adjustments</div>
            <div class="val">${items.length}</div>
          </div>
          <div class="ar-summary-item">
            <div class="lbl">Total Adjusted Amount</div>
            <div class="val" style="color:var(--ar-primary); font-weight:800;">₹ ${HenuOsReportEngine.formatINR(totalAmount)}</div>
          </div>
        </div>

        <footer class="ar-footer">
          <div>Generated by JEEVIKA ERP on ${new Date().toLocaleString('en-IN')}</div>
          <div>Page 1 of 1</div>
        </footer>
      </div>
    `;

    container.innerHTML = html;
  }

  function resetFilters() {
    const wing = document.getElementById('wing');
    const member = document.getElementById('fromMember');
    if (wing) wing.value = '';
    if (member) member.value = '';
    initDateFilters();
    loadAdjustmentRegister();
  }

  window.loadAdjustmentRegister = loadAdjustmentRegister;
  window.resetFilters = resetFilters;
  window.printReport = () => window.print();
  window.exportPdf = () => window.print();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
