/**
 * data-sheet.js — Member Master DATA SHEET Engine (Landscape A4)
 * Connects 100% to Live ERP Database & Active HENU OS Design
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_DATA_SHEET';
  let activeDesign = null;

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    loadDataSheet();
  });

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadDataSheet());
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadDataSheet());
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnPdf')?.addEventListener('click', () => window.print());
  }

  function resetFilters() {
    document.getElementById('filterWing').value = '';
    document.getElementById('filterFlatType').value = '';
    document.getElementById('filterSearch').value = '';
    loadDataSheet();
  }

  async function loadDataSheet() {
    const container = document.getElementById('dataSheetContainer');
    const kpiStrip = document.getElementById('kpiStrip');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading member master directory from HENU ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const wing = document.getElementById('filterWing')?.value?.trim() || '';
    const flatType = document.getElementById('filterFlatType')?.value?.trim() || '';
    const search = document.getElementById('filterSearch')?.value?.trim() || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId);
      if (wing) params.append('wing', wing);
      if (flatType) params.append('flatType', flatType);
      if (search) params.append('searchText', search);

      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/data-sheet?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const members = data.members || data.items || [];
      const society = data.society || {};

      if (members.length === 0) {
        HenuOsReportEngine.renderEmpty(container, 'No member records found for the selected filter criteria.');
        if (kpiStrip) kpiStrip.style.display = 'none';
        return;
      }

      // Update KPI strip
      if (kpiStrip) {
        let totalArea = 0;
        let totalOp = 0;

        members.forEach(m => {
          totalArea += (m.areaSqft || m.area || 0);
          totalOp += (m.totalOpening || (m.opPrincipal || 0) + (m.opInterest || 0));
        });

        document.getElementById('kpiTotalMembers').textContent = members.length;
        document.getElementById('kpiTotalArea').textContent = `${totalArea.toLocaleString('en-IN')} Sq.Ft`;
        document.getElementById('kpiTotalOpening').textContent = HenuOsReportEngine.formatINR(totalOp);
        kpiStrip.style.display = 'flex';
      }

      renderDataSheetHTML(society, members, container);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[Data Sheet] Error loading data sheet:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load member master data sheet from server.', () => loadDataSheet());
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  function renderDataSheetHTML(soc, members, container) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const addr = soc.Address || soc.address || '';

    let totalArea = 0;
    let totalOpening = 0;
    let trRows = '';

    members.forEach((m, idx) => {
      const area = m.areaSqft || m.area || 0;
      const op = m.totalOpening || (m.opPrincipal || 0) + (m.opInterest || 0);
      totalArea += area;
      totalOpening += op;

      trRows += `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center" style="font-weight:700;">${HenuOsReportEngine.escapeHtml(m.memberCode || m.code || '-')}</td>
          <td><strong>${HenuOsReportEngine.escapeHtml(m.memberName || m.name || '-')}</strong></td>
          <td>${HenuOsReportEngine.escapeHtml(m.coOwner || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(m.wing || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(m.flat || m.flatNo || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(m.flatType || m.ownership || '-')}</td>
          <td class="right">${area > 0 ? area.toLocaleString('en-IN') : '-'}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(m.mobile || m.contactNo || '-')}</td>
          <td>${HenuOsReportEngine.escapeHtml(m.email || '-')}</td>
          <td class="center">${HenuOsReportEngine.escapeHtml(m.pan || '-')}</td>
          <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(op)}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div class="ds-report-page">
        <!-- Header -->
        <header class="ds-header">
          <div class="ds-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
          <div style="font-size:8pt; color:#64748b; margin-top:2px;">
            ${regNo ? `Reg No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
            ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong> | ` : ''}
            ${addr ? HenuOsReportEngine.escapeHtml(addr) : ''}
          </div>
        </header>

        <!-- Title Bar -->
        <div class="ds-title-bar">
          <div class="ds-doc-title">MEMBER MASTER DATA SHEET</div>
          <div>Total Listed Units: <strong>${members.length}</strong></div>
        </div>

        <!-- Master Table (Landscape) -->
        <table class="ds-table">
          <thead>
            <tr>
              <th class="center" style="width:30px;">Sr</th>
              <th class="center" style="width:70px;">Mem Code</th>
              <th style="width:160px;">Primary Member Name</th>
              <th style="width:130px;">Associate / Co-Owner</th>
              <th class="center" style="width:45px;">Wing</th>
              <th class="center" style="width:50px;">Flat</th>
              <th class="center" style="width:75px;">Type</th>
              <th class="right" style="width:65px;">Area (SqFt)</th>
              <th class="center" style="width:90px;">Contact No</th>
              <th style="width:140px;">Email Address</th>
              <th class="center" style="width:85px;">PAN</th>
              <th class="right" style="width:95px;">Opening (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${trRows}
            <tr style="background:#e2e8f0; font-weight:800; border-top:2px solid var(--ds-primary);">
              <td colspan="7" class="right">TOTALS:</td>
              <td class="right">${totalArea.toLocaleString('en-IN')}</td>
              <td colspan="3" class="center">-</td>
              <td class="right" style="color:var(--ds-primary);">${HenuOsReportEngine.formatINR(totalOpening)}</td>
            </tr>
          </tbody>
        </table>

        <!-- Stats Bar -->
        <div class="ds-stats-bar">
          <div>Total Registered Flats: <strong>${members.length}</strong></div>
          <div>Cumulative Area: <strong>${totalArea.toLocaleString('en-IN')} Sq.Ft</strong></div>
          <div>Total Opening Debtors: <strong>${HenuOsReportEngine.formatINR(totalOpening)}</strong></div>
        </div>

        <!-- Footer -->
        <footer class="ds-footer">
          <div>Generated by HENU ERP on ${new Date().toLocaleString()}</div>
          <div>Page 1 of 1</div>
        </footer>
      </div>
    `;
  }
})();
