/**
 * debit-note-register.js — Member Debit Note Register Engine (Landscape A4)
 * Architecture: Real ERP Backend Data + Active Published HENU OS DESIGN + Mail to Committee UX
 */

(function () {
  'use strict';

  const REPORT_KEY = 'debit-note-register';
  let activeDesign = null;
  let currentReportData = null;

  async function init() {
    initDateFilters();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    HenuOsReportEngine.applyDesignToDOM(activeDesign);
    await loadDebitNoteRegister();
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

  async function loadDebitNoteRegister() {
    const container = document.getElementById('dnrContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading Debit Note Register from ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const wing = document.getElementById('wing')?.value?.trim() || '';
    const member = document.getElementById('fromMember')?.value?.trim() || '';

    let url = `${ctx.apiBase}/reports/member/debit-note-register?societyId=${ctx.societyId}&fyId=${ctx.fyId}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;
    if (wing) url += `&wing=${encodeURIComponent(wing)}`;
    if (member) url += `&fromMember=${encodeURIComponent(member)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to fetch debit note register data.');
      }

      currentReportData = data;
      const notes = data.notes || data.items || [];
      updateKpis(notes);

      if (notes.length === 0) {
        HenuOsReportEngine.renderEmpty(
          container,
          'No debit note records found for the selected criteria.',
          'Try adjusting your Date, Wing, or Member filters.'
        );
        return;
      }

      renderDebitNoteRegister(data);
    } catch (err) {
      console.error('[DebitNoteRegister] Load error:', err);
      HenuOsReportEngine.renderError(
        container,
        'Unable to load Debit Note Register data from ERP server.',
        err.message || 'Network request failed.',
        loadDebitNoteRegister
      );
    }
  }

  function updateKpis(notes) {
    const totalAmount = notes.reduce((acc, row) => acc + Number(row.debitAmount || row.amount || 0), 0);
    const countEl = document.getElementById('kpiTotalNotes');
    const amtEl = document.getElementById('kpiTotalAmount');

    if (countEl) countEl.textContent = notes.length;
    if (amtEl) amtEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totalAmount)}`;
  }

  function renderDebitNoteRegister(data) {
    const container = document.getElementById('dnrContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    const soc = data.society || {};
    const notes = data.notes || data.items || [];
    const totalAmount = notes.reduce((acc, row) => acc + Number(row.debitAmount || row.amount || 0), 0);

    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';

    const rowsHtml = notes.map((row, idx) => {
      const statusClass = (row.status || 'Posted').toLowerCase() === 'posted' ? 'posted' : 'draft';
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center" style="font-weight:700;">${HenuOsReportEngine.escapeHtml(row.debitNoteNumber || row.noteNo || '-')}</td>
          <td class="center">${HenuOsReportEngine.formatDate(row.date || row.noteDate)}</td>
          <td><strong>${HenuOsReportEngine.escapeHtml(row.memberName || row.residentName || '-')}</strong></td>
          <td class="center">${HenuOsReportEngine.escapeHtml(row.wing || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(row.flatNo || row.unit || '-')}</td>
          <td>${HenuOsReportEngine.escapeHtml(row.reason || row.description || '-')}</td>
          <td>${HenuOsReportEngine.escapeHtml(row.accountHead || row.ledgerHead || 'Sundry Charges')}</td>
          <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(row.debitAmount || row.amount || 0)}</td>
          <td class="center"><span class="dnr-status-tag ${statusClass}">${HenuOsReportEngine.escapeHtml(row.status || 'Posted')}</span></td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="dnr-report-page henu-dynamic-document">
        <header class="dnr-header">
          <div class="dnr-soc-name">${HenuOsReportEngine.escapeHtml(soc.SocietyName || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.')}</div>
          <div class="dnr-soc-sub">
            ${soc.RegistrationNo ? 'Reg. No: ' + HenuOsReportEngine.escapeHtml(soc.RegistrationNo) + ' | ' : ''}
            ${soc.Address || soc.address || 'Registered Society Premises'}
          </div>
        </header>

        <div class="dnr-title-bar">
          <div class="dnr-doc-title">MEMBER DEBIT NOTE REGISTER</div>
          <div class="dnr-period-tag">Period: ${HenuOsReportEngine.formatDate(fromDate)} to ${HenuOsReportEngine.formatDate(toDate)}</div>
        </div>

        <div class="dnr-table-wrapper">
          <table class="dnr-table">
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
                <th class="right" style="width:85px;">Debit (₹)</th>
                <th class="center" style="width:65px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="8" class="right" style="font-weight:700;">TOTAL DEBIT AMOUNT:</td>
                <td class="right" style="color:var(--dnr-primary); font-weight:800;">₹ ${HenuOsReportEngine.formatINR(totalAmount)}</td>
                <td class="center">-</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="dnr-summary-grid">
          <div class="dnr-summary-item">
            <div class="lbl">Total Debit Notes</div>
            <div class="val">${notes.length}</div>
          </div>
          <div class="dnr-summary-item">
            <div class="lbl">Total Debit Amount</div>
            <div class="val" style="color:var(--dnr-primary); font-weight:800;">₹ ${HenuOsReportEngine.formatINR(totalAmount)}</div>
          </div>
        </div>

        <footer class="dnr-footer">
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
    loadDebitNoteRegister();
  }

  window.loadDebitNoteRegister = loadDebitNoteRegister;
  window.resetFilters = resetFilters;
  window.printReport = () => window.print();
  window.exportPdf = () => window.print();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
