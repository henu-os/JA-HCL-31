/**
 * member-jv-register.js — Member Journal Voucher (JV) Register Engine (Landscape A4)
 * Architecture: Real ERP Backend Data + Multi-line JV Grouping + Variance Reconciliation + Mail to Committee UX
 */

(function () {
  'use strict';

  const REPORT_KEY = 'member-jv-register';
  let activeDesign = null;
  let currentReportData = null;

  async function init() {
    initDateFilters();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    HenuOsReportEngine.applyDesignToDOM(activeDesign);
    await loadJVRegister();
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

  async function loadJVRegister() {
    const container = document.getElementById('jvContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading Member JV Register from ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const wing = document.getElementById('wing')?.value?.trim() || '';
    const member = document.getElementById('fromMember')?.value?.trim() || '';

    let url = `${ctx.apiBase}/reports/member/member-jv-register?societyId=${ctx.societyId}&fyId=${ctx.fyId}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;
    if (wing) url += `&wing=${encodeURIComponent(wing)}`;
    if (member) url += `&fromMember=${encodeURIComponent(member)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to fetch member JV register data.');
      }

      currentReportData = data;
      const jvs = data.jvs || data.items || [];
      updateKpis(jvs);

      if (jvs.length === 0) {
        HenuOsReportEngine.renderEmpty(
          container,
          'No journal voucher records found for the selected criteria.',
          'Try adjusting your Date, Wing, or Member filters.'
        );
        return;
      }

      renderJVRegister(data);
    } catch (err) {
      console.error('[JVRegister] Load error:', err);
      HenuOsReportEngine.renderError(
        container,
        'Unable to load Member JV Register data from ERP server.',
        err.message || 'Network request failed.',
        loadJVRegister
      );
    }
  }

  function updateKpis(jvs) {
    let totalDebit = 0;
    let totalCredit = 0;

    jvs.forEach(jv => {
      const lines = jv.lines || [jv];
      lines.forEach(line => {
        totalDebit += Number(line.debit || line.debitAmount || 0);
        totalCredit += Number(line.credit || line.creditAmount || 0);
      });
    });

    const variance = Math.abs(totalDebit - totalCredit);
    const isMatched = variance < 0.01;

    const countEl = document.getElementById('kpiTotalJvs');
    const drEl = document.getElementById('kpiTotalDebit');
    const crEl = document.getElementById('kpiTotalCredit');
    const varEl = document.getElementById('kpiVariance');
    const statusEl = document.getElementById('kpiStatus');
    const pillEl = document.getElementById('kpiStatusPill');

    if (countEl) countEl.textContent = jvs.length;
    if (drEl) drEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totalDebit)}`;
    if (crEl) crEl.textContent = `₹ ${HenuOsReportEngine.formatINR(totalCredit)}`;
    if (varEl) varEl.textContent = `₹ ${HenuOsReportEngine.formatINR(variance)}`;
    if (statusEl) {
      statusEl.textContent = isMatched ? 'MATCHED' : 'UNBALANCED';
      statusEl.style.color = isMatched ? '#166534' : '#b91c1c';
      statusEl.style.fontWeight = '800';
    }
    if (pillEl) {
      pillEl.className = isMatched ? 'kpi-pill' : 'kpi-pill primary';
    }
  }

  function renderJVRegister(data) {
    const container = document.getElementById('jvContainer') || document.getElementById('reportOutputArea');
    if (!container) return;

    const soc = data.society || {};
    const jvs = data.jvs || data.items || [];

    let totalDebit = 0;
    let totalCredit = 0;
    let rowsHtml = '';

    jvs.forEach((jv, jvIdx) => {
      const lines = jv.lines || [jv];
      const jvNo = jv.jvNumber || jv.jvNo || jv.voucherNo || `JV-${1000 + jvIdx}`;
      const date = jv.date || jv.voucherDate || '';
      const unit = jv.flatNo || jv.unit || '';
      const wing = jv.wing ? jv.wing + '-' : '';
      const memberName = jv.memberName || jv.residentName || '-';
      const narration = jv.narration || '';

      lines.forEach((line, lineIdx) => {
        const dr = Number(line.debit || line.debitAmount || 0);
        const cr = Number(line.credit || line.creditAmount || 0);
        totalDebit += dr;
        totalCredit += cr;

        const isFirst = lineIdx === 0;
        const groupClass = isFirst ? 'jv-group-start' : '';

        rowsHtml += `
          <tr class="${groupClass}">
            ${isFirst ? `<td class="center" rowspan="${lines.length}" style="font-weight:700; vertical-align:top;">${HenuOsReportEngine.escapeHtml(jvNo)}</td>` : ''}
            ${isFirst ? `<td class="center" rowspan="${lines.length}" style="vertical-align:top;">${HenuOsReportEngine.formatDate(date)}</td>` : ''}
            ${isFirst ? `<td class="center" rowspan="${lines.length}" style="vertical-align:top;"><b>${HenuOsReportEngine.escapeHtml(wing + unit)}</b></td>` : ''}
            ${isFirst ? `<td rowspan="${lines.length}" style="vertical-align:top;"><strong>${HenuOsReportEngine.escapeHtml(memberName)}</strong></td>` : ''}
            <td>${HenuOsReportEngine.escapeHtml(line.ledgerHead || line.accountHead || 'General Ledger')}</td>
            <td class="right" style="${dr > 0 ? 'font-weight:700;' : 'color:#94a3b8;'}">${dr > 0 ? HenuOsReportEngine.formatINR(dr) : '-'}</td>
            <td class="right" style="${cr > 0 ? 'font-weight:700;' : 'color:#94a3b8;'}">${cr > 0 ? HenuOsReportEngine.formatINR(cr) : '-'}</td>
          </tr>
        `;
      });

      if (narration) {
        rowsHtml += `
          <tr class="jv-narration-row">
            <td colspan="7" style="background:#f8fafc; font-size:7.5pt; color:#475569; padding:4px 8px;">
              <span style="font-weight:700; color:#1e293b;">Narration:</span> ${HenuOsReportEngine.escapeHtml(narration)}
            </td>
          </tr>
        `;
      }
    });

    const variance = Math.abs(totalDebit - totalCredit);
    const isMatched = variance < 0.01;

    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';

    const html = `
      <div class="jv-report-page henu-dynamic-document">
        <header class="jv-header">
          <div class="jv-soc-name">${HenuOsReportEngine.escapeHtml(soc.SocietyName || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.')}</div>
          <div class="jv-soc-sub">
            ${soc.RegistrationNo ? 'Reg. No: ' + HenuOsReportEngine.escapeHtml(soc.RegistrationNo) + ' | ' : ''}
            ${soc.Address || soc.address || 'Registered Society Premises'}
          </div>
        </header>

        <div class="jv-title-bar">
          <div class="jv-doc-title">MEMBER JOURNAL VOUCHER (JV) REGISTER</div>
          <div class="jv-period-tag">Period: ${HenuOsReportEngine.formatDate(fromDate)} to ${HenuOsReportEngine.formatDate(toDate)}</div>
        </div>

        <div class="jv-table-wrapper">
          <table class="jv-table">
            <thead>
              <tr>
                <th class="center" style="width:85px;">JV No</th>
                <th class="center" style="width:75px;">Date</th>
                <th class="center" style="width:55px;">Unit</th>
                <th style="width:160px;">Member Name</th>
                <th>Ledger Head</th>
                <th class="right" style="width:105px;">Debit (₹)</th>
                <th class="right" style="width:105px;">Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td colspan="5" class="right" style="font-weight:700;">GRAND TOTAL:</td>
                <td class="right" style="color:var(--jv-primary); font-weight:800;">₹ ${HenuOsReportEngine.formatINR(totalDebit)}</td>
                <td class="right" style="color:var(--jv-primary); font-weight:800;">₹ ${HenuOsReportEngine.formatINR(totalCredit)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="jv-summary-grid">
          <div class="jv-summary-item">
            <div class="lbl">Total Debit</div>
            <div class="val">₹ ${HenuOsReportEngine.formatINR(totalDebit)}</div>
          </div>
          <div class="jv-summary-item">
            <div class="lbl">Total Credit</div>
            <div class="val">₹ ${HenuOsReportEngine.formatINR(totalCredit)}</div>
          </div>
          <div class="jv-summary-item">
            <div class="lbl">Variance (Dr - Cr)</div>
            <div class="val" style="color:${isMatched ? '#166534' : '#b91c1c'}; font-weight:800;">
              ₹ ${HenuOsReportEngine.formatINR(variance)}
            </div>
          </div>
          <div class="jv-summary-item" style="display:flex; flex-direction:column; justify-content:center; align-items:flex-start;">
            <div class="lbl">Reconciliation Status</div>
            <div style="margin-top:4px;">
              <span class="jv-variance-badge ${isMatched ? 'matched' : 'unbalanced'}" style="padding:4px 8px; border-radius:4px; font-weight:800; font-size:8pt; background:${isMatched ? '#dcfce7' : '#fee2e2'}; color:${isMatched ? '#166534' : '#b91c1c'};">
                <i class="bi ${isMatched ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}"></i>
                ${isMatched ? 'MATCHED' : 'UNBALANCED'}
              </span>
            </div>
          </div>
        </div>

        <footer class="jv-footer">
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
    loadJVRegister();
  }

  window.loadJVRegister = loadJVRegister;
  window.resetFilters = resetFilters;
  window.printReport = () => window.print();
  window.exportPdf = () => window.print();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
