/**
 * adjustment.js — Member Adjustment Voucher Engine
 * Connects 100% to Live ERP Database & Active HENU OS Design
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_ADJUSTMENT';
  let activeDesign = null;

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadMembersDropdown();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    loadAdjustments();
  });

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadAdjustments());
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadAdjustments());
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnPdf')?.addEventListener('click', () => window.print());
  }

  function resetFilters() {
    document.getElementById('filterVoucherNo').value = '';
    document.getElementById('filterMember').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    loadAdjustments();
  }

  async function loadMembersDropdown() {
    const select = document.getElementById('filterMember');
    if (!select) return;
    const ctx = HenuOsReportEngine.getSystemContext();

    try {
      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/data-sheet?societyId=${ctx.societyId}`);
      if (res.ok) {
        const json = await res.json();
        const members = json.members || [];
        select.innerHTML = '<option value="">-- All Members --</option>';
        members.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.memberCode || m.memberId || '';
          opt.textContent = `${m.flat || ''} ${m.wing ? '(' + m.wing + ')' : ''} - ${m.memberName || ''}`.trim();
          select.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('[Adjustment] Could not load member dropdown:', err);
    }
  }

  async function loadAdjustments() {
    const container = document.getElementById('adjustmentContainer');
    const kpiStrip = document.getElementById('kpiStrip');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading adjustment vouchers from HENU ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const voucherNo = document.getElementById('filterVoucherNo')?.value?.trim() || '';
    const member = document.getElementById('filterMember')?.value?.trim() || '';
    const fromDate = document.getElementById('filterDateFrom')?.value || '';
    const toDate = document.getElementById('filterDateTo')?.value || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId);
      if (ctx.fyId) params.append('fyId', ctx.fyId);
      if (voucherNo) params.append('fromVoucherNo', voucherNo);
      if (member) params.append('fromMember', member);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);

      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/adjustment?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const vouchers = data.vouchers || data.items || [];
      const society = data.society || {};

      if (vouchers.length === 0) {
        HenuOsReportEngine.renderEmpty(container, 'No adjustment vouchers found for the selected criteria.');
        if (kpiStrip) kpiStrip.style.display = 'none';
        return;
      }

      // Update KPI strip
      if (kpiStrip) {
        let totalAmt = 0;
        vouchers.forEach(v => {
          totalAmt += (v.amount || v.totalAmount || 0);
        });
        document.getElementById('kpiTotalAdjustments').textContent = vouchers.length;
        document.getElementById('kpiTotalAmount').textContent = HenuOsReportEngine.formatINR(totalAmt);
        kpiStrip.style.display = 'flex';
      }

      renderAdjustmentsHTML(society, vouchers, container);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[Adjustment] Error loading adjustments:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load adjustment records from server.', () => loadAdjustments());
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  function renderAdjustmentsHTML(soc, vouchers, container) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const addr = soc.Address || soc.address || '';

    let html = '';

    vouchers.forEach((v, idx) => {
      const isLast = idx === vouchers.length - 1;
      const mem = v.member || {};
      const amount = v.amount || v.totalAmount || 0;
      const words = HenuOsReportEngine.numberToWordsINR(amount);
      const entries = v.entries || v.items || [
        { accountHead: v.sourceHead || 'Advance Maintenance', debit: amount, credit: 0 },
        { accountHead: v.destHead || 'Maintenance Bill Dues', debit: 0, credit: amount }
      ];

      let rowsHtml = '';
      entries.forEach(e => {
        rowsHtml += `
          <tr>
            <td><strong>${HenuOsReportEngine.escapeHtml(e.accountHead || e.ledgerHead || 'Transfer Account')}</strong></td>
            <td class="right">${e.debit > 0 ? HenuOsReportEngine.formatINR(e.debit) : '-'}</td>
            <td class="right">${e.credit > 0 ? HenuOsReportEngine.formatINR(e.credit) : '-'}</td>
          </tr>
        `;
      });

      html += `
        <div class="adj-voucher-page ${!isLast ? 'page-break' : ''}">
          <!-- Header -->
          <header class="adj-header">
            <div class="adj-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
            <div class="adj-soc-meta">
              ${regNo ? `Reg No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
              ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong>` : ''}
              ${addr ? `<br>${HenuOsReportEngine.escapeHtml(addr)}` : ''}
            </div>
          </header>

          <!-- Title Bar -->
          <div class="adj-title-bar">
            <div class="adj-doc-title">ADJUSTMENT / TRANSFER VOUCHER</div>
            <div>Date: <strong>${HenuOsReportEngine.formatDate(v.date || v.voucherDate)}</strong></div>
          </div>

          <!-- Meta Grid -->
          <div class="adj-meta-grid">
            <div class="adj-meta-box">
              <div class="adj-meta-title">Resident & Unit Information</div>
              <div style="font-weight:700; font-size:10pt;">${HenuOsReportEngine.escapeHtml(mem.name || mem.memberName || v.personName || '-')}</div>
              <div style="margin-top:3px; color:#475569;">
                Flat / Unit: <strong>${HenuOsReportEngine.escapeHtml(mem.flatNo || mem.flat || '-')}</strong> ${mem.wing ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}
              </div>
              <div style="color:#64748b;">Member Code: ${HenuOsReportEngine.escapeHtml(mem.code || mem.memberCode || '-')}</div>
            </div>

            <div class="adj-meta-box">
              <div class="adj-meta-title">Voucher Details</div>
              <div>Voucher No: <strong style="color:var(--adj-primary);">${HenuOsReportEngine.escapeHtml(v.voucherNo || v.adjustmentNo || '-')}</strong></div>
              <div style="margin-top:3px;">Adjustment Type: <strong>${HenuOsReportEngine.escapeHtml(v.adjType || v.type || 'Internal Allocation')}</strong></div>
              ${v.refNo ? `<div>Reference: <strong>${HenuOsReportEngine.escapeHtml(v.refNo)}</strong></div>` : ''}
            </div>
          </div>

          <!-- Transfer Flow Card -->
          <div class="adj-transfer-box">
            <div>
              <span style="font-size:7.5pt; color:#64748b; font-weight:700; text-transform:uppercase;">Source (Transfer From):</span><br>
              <strong style="color:#b91c1c;">${HenuOsReportEngine.escapeHtml(v.sourceHead || v.source || 'Credit Balance')}</strong>
            </div>
            <div style="font-size:14pt; color:var(--adj-primary); font-weight:800;">➔</div>
            <div>
              <span style="font-size:7.5pt; color:#64748b; font-weight:700; text-transform:uppercase;">Destination (Transfer To):</span><br>
              <strong style="color:#15803d;">${HenuOsReportEngine.escapeHtml(v.destHead || v.destination || 'Bill Dues Offset')}</strong>
            </div>
          </div>

          <!-- Accounting Entries Table -->
          <table class="adj-table">
            <thead>
              <tr>
                <th>Ledger Account Head</th>
                <th class="right" style="width:130px;">Debit (₹)</th>
                <th class="right" style="width:130px;">Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr style="background:#e2e8f0; font-weight:800; border-top:2px solid var(--adj-primary);">
                <td class="right">TOTAL:</td>
                <td class="right">${HenuOsReportEngine.formatINR(amount)}</td>
                <td class="right">${HenuOsReportEngine.formatINR(amount)}</td>
              </tr>
            </tbody>
          </table>

          <!-- Narration -->
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:8px 12px; margin-bottom:14px; font-size:8.5pt;">
            <strong style="color:#475569;">Narration / Remarks:</strong> ${HenuOsReportEngine.escapeHtml(v.narration || 'Being amount adjusted against maintenance dues as per approved instructions.')}
          </div>

          <!-- Summary Bar -->
          <div class="adj-summary-bar">
            <div>
              <div style="font-size:7.5pt; font-weight:700; color:#64748b; text-transform:uppercase;">Amount in Words:</div>
              <div style="font-size:8.5pt; font-style:italic; font-weight:600;">${HenuOsReportEngine.escapeHtml(words)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:7.5pt; font-weight:700; color:#64748b; text-transform:uppercase;">Total Adjusted Amount</div>
              <div style="font-size:13pt; font-weight:800; color:var(--adj-primary);">${HenuOsReportEngine.formatINR(amount)}</div>
            </div>
          </div>

          <!-- Signatures Footer -->
          <footer class="adj-footer">
            <div class="adj-sig-row">
              <div class="adj-sig-col">
                <div class="adj-sig-line">Prepared By</div>
              </div>
              <div class="adj-sig-col">
                <div class="adj-sig-line">Verified By</div>
              </div>
              <div class="adj-sig-col">
                <div class="adj-sig-line">Hon. Treasurer / Secretary</div>
              </div>
            </div>
          </footer>
        </div>
      `;
    });

    container.innerHTML = html;
  }
})();
