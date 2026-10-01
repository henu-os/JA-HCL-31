/**
 * credit-note-register.js — Member Credit Note Register Engine (Landscape A4)
 * Architecture: Real ERP Backend Data + Active Published HENU OS DESIGN + Mail to Committee UX
 */

(function () {
  'use strict';

  const REPORT_KEY = 'credit-note-register';
  let activeDesign = null;
  let currentReportData = null;

  async function init() {
    initDateFilters();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    HenuOsReportEngine.applyDesignToDOM(activeDesign);
    await loadCreditNoteRegister();
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

  async function loadCreditNoteRegister() {
    const container = document.getElementById('cnrContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading Credit Note Register from ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const wing = document.getElementById('wing')?.value?.trim() || '';
    const member = document.getElementById('fromMember')?.value?.trim() || '';

    let url = `${ctx.apiBase}/reports/member/credit-note-register?societyId=${ctx.societyId}&fyId=${ctx.fyId}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;
    if (wing) url += `&wing=${encodeURIComponent(wing)}`;
    if (member) url += `&fromMember=${encodeURIComponent(member)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to fetch credit note register data.');
      }

      currentReportData = data;
      const notes = data.notes || data.items || [];
      updateKpis(notes);

      if (notes.length === 0) {
        HenuOsReportEngine.renderEmpty(
          container,
          'No credit note records found for the selected criteria.',
          'Try adjusting your Date, Wing, or Member filters.'
        );
        return;
      }

      renderCreditNoteRegister(data);
    } catch (err) {
      console.error('[CreditNoteRegister] Load error:', err);
      HenuOsReportEngine.renderError(
        container,
        'Unable to load Credit Note Register data from ERP server.',
        err.message || 'Network request failed.',
        loadCreditNoteRegister
      );
    }
  }

  function updateKpis(notes) {
    const totalAmount = notes.reduce((acc, row) => acc + Number(row.creditAmount || row.amount || 0), 0);
    const countEl = document.getElementById('kpiTotalNotes');
    const amtEl = document.getElementById('kpiTotalAmount');

    if (countEl) countEl.textContent = notes.length;
    if (amtEl) amtEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totalAmount)}`;
  }

  function renderCreditNoteRegister(data) {
    const container = document.getElementById('cnrContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    const soc = data.society || {};
    const notes = data.notes || data.items || [];
    const totalAmount = notes.reduce((acc, row) => acc + Number(row.creditAmount || row.amount || 0), 0);

    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';

    const rowsHtml = notes.map((row, idx) => {
      const statusClass = (row.status || 'Posted').toLowerCase() === 'posted' ? 'posted' : 'draft';
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center" style="font-weight:700;">${HenuOsReportEngine.escapeHtml(row.creditNoteNumber || row.noteNo || '-')}</td>
          <td class="center">${HenuOsReportEngine.formatDate(row.date || row.noteDate)}</td>
          <td><strong>${HenuOsReportEngine.escapeHtml(row.memberName || row.residentName || '-')}</strong></td>
          <td class="center">${HenuOsReportEngine.escapeHtml(row.wing || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(row.flatNo || row.unit || '-')}</td>
          <td>${HenuOsReportEngine.escapeHtml(row.reason || row.description || '-')}</td>
          <td>${HenuOsReportEngine.escapeHtml(row.accountHead || row.ledgerHead || 'Maintenance Waiver')}</td>
          <td class="right" style="font-weight:700; color:var(--cnr-primary);">${HenuOsReportEngine.formatINR(row.creditAmount || row.amount || 0)}</td>
          <td class="center"><span class="cnr-status-tag ${statusClass}">${HenuOsReportEngine.escapeHtml(row.status || 'Posted')}</span></td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="cnr-report-page henu-dynamic-document">
        <header class="cnr-header">
          <div class="cnr-soc-name">${HenuOsReportEngine.escapeHtml(soc.SocietyName || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.')}</div>
          <div class="cnr-soc-sub">
            ${soc.RegistrationNo ? 'Reg. No: ' + HenuOsReportEngine.escapeHtml(soc.RegistrationNo) + ' | ' : ''}
            ${soc.Address || soc.address || 'Registered Society Premises'}
          </div>
        </header>

        <div class="cnr-title-bar">
          <div class="cnr-doc-title">MEMBER CREDIT NOTE REGISTER</div>
          <div class="cnr-period-tag">Period: ${HenuOsReportEngine.formatDate(fromDate)} to ${HenuOsReportEngine.formatDate(toDate)}</div>
        </div>

        <div class="cnr-table-wrapper">
          <table class="cnr-table">
            <thead>
              <tr>
                <th class="center" style="width:35px;">Sr</th>
                <th class="center" style="width:75px;">Note No</th>
                <th class="center" style="width:70px;">Date</th>
                <th style="width:160px;">Member Name</th>
                <th class="center" style="width:45px;">Wing</th>
                <th class="center" style="width:45px;">Flat</th>
                <th>Reason / Particulars</th>
                <th style="width:140px;">Account Head</th>
                <th class="right" style="width:85px;">Credit (₹)</th>
                <th class="center" style="width:65px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="8" class="right" style="font-weight:700;">TOTAL CREDIT AMOUNT:</td>
                <td class="right" style="color:var(--cnr-primary); font-weight:800;">₹ ${HenuOsReportEngine.formatINR(totalAmount)}</td>
                <td class="center">-</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="cnr-summary-grid">
          <div class="cnr-summary-item">
            <div class="lbl">Total Credit Notes</div>
            <div class="val">${notes.length}</div>
          </div>
          <div class="cnr-summary-item">
            <div class="lbl">Total Credit Amount</div>
            <div class="val" style="color:var(--cnr-primary); font-weight:800;">₹ ${HenuOsReportEngine.formatINR(totalAmount)}</div>
          </div>
        </div>

        <footer class="cnr-footer">
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
    loadCreditNoteRegister();
  }

  window.loadCreditNoteRegister = loadCreditNoteRegister;
  window.resetFilters = resetFilters;
  window.printReport = () => window.print();
  window.exportPdf = () => window.print();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
