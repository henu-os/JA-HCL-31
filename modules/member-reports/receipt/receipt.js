/**
 * receipt.js — Member Receipt Engine (A4 2-Up & 1-Up Format)
 * Connects 100% to Live ERP Database & Active HENU OS Design
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_RECEIPT';
  let activeDesign = null;

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadMembersDropdown();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    loadReceipts();
  });

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadReceipts());
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadReceipts());
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnPdf')?.addEventListener('click', () => window.print());
  }

  function resetFilters() {
    document.getElementById('filterReceiptNo').value = '';
    document.getElementById('filterMember').value = '';
    document.getElementById('filterPaymentMode').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    loadReceipts();
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
      console.warn('[Receipt] Could not load member dropdown:', err);
    }
  }

  async function loadReceipts() {
    const container = document.getElementById('receiptContainer');
    const kpiStrip = document.getElementById('kpiStrip');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading receipts from HENU ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const receiptNo = document.getElementById('filterReceiptNo')?.value?.trim() || '';
    const member = document.getElementById('filterMember')?.value?.trim() || '';
    const paymentMode = document.getElementById('filterPaymentMode')?.value || '';
    const fromDate = document.getElementById('filterDateFrom')?.value || '';
    const toDate = document.getElementById('filterDateTo')?.value || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId);
      if (ctx.fyId) params.append('fyId', ctx.fyId);
      if (receiptNo) params.append('fromReceiptNo', receiptNo);
      if (member) params.append('fromMember', member);
      if (paymentMode) params.append('paymentMode', paymentMode);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);

      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/receipt?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const receipts = data.receipts || data.items || [];
      const society = data.society || {};

      if (receipts.length === 0) {
        HenuOsReportEngine.renderEmpty(container, 'No receipt vouchers found for the selected criteria.');
        if (kpiStrip) kpiStrip.style.display = 'none';
        return;
      }

      // Update KPI strip
      if (kpiStrip) {
        let totalAmt = 0;
        receipts.forEach(r => {
          totalAmt += (r.amount || 0);
        });
        document.getElementById('kpiTotalReceipts').textContent = receipts.length;
        document.getElementById('kpiTotalAmount').textContent = HenuOsReportEngine.formatINR(totalAmt);
        kpiStrip.style.display = 'flex';
      }

      renderReceiptSheetsHTML(society, receipts, container);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[Receipt] Error loading receipts:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load receipt records from server.', () => loadReceipts());
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  function renderReceiptSheetsHTML(soc, receipts, container) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const addr = soc.Address || soc.address || '';

    let html = '';

    // Group receipts 2 per A4 sheet
    for (let i = 0; i < receipts.length; i += 2) {
      const r1 = receipts[i];
      const r2 = receipts[i + 1] || null;
      const isLastSheet = (i + 2) >= receipts.length;

      html += `
        <div class="receipt-sheet ${!isLastSheet ? 'page-break' : ''}">
          <!-- RECEIPT 1 (Top Half - 131mm) -->
          ${renderSingleReceiptCard(socName, regNo, pan, addr, r1)}

          <!-- CENTER CUT PERFORATION LINE (148.5mm boundary) -->
          <div class="receipt-cut-line">
            ✂ &nbsp; &nbsp; CUT HERE &nbsp; &nbsp; ✂
          </div>

          <!-- RECEIPT 2 (Bottom Half - 131mm) -->
          ${r2 ? renderSingleReceiptCard(socName, regNo, pan, addr, r2) : `
            <div class="receipt-card" style="display:flex; align-items:center; justify-content:center; color:#94a3b8; border-style:dashed;">
              <div style="font-size:9pt; font-weight:600;">[ Blank / End of Receipt Batch ]</div>
            </div>
          `}
        </div>
      `;
    }

    container.innerHTML = html;
  }

  function renderSingleReceiptCard(socName, regNo, pan, addr, r) {
    const mem = r.member || {};
    const amount = r.amount || 0;
    const amountWords = HenuOsReportEngine.numberToWordsINR(amount);
    const particulars = r.particulars || r.items || [
      { head: 'Maintenance & Service Charges Received', amount: amount }
    ];

    let rowsHtml = '';
    particulars.forEach(p => {
      rowsHtml += `
        <tr>
          <td>${HenuOsReportEngine.escapeHtml(p.head || p.description || 'Payment Allocation')}</td>
          <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(p.amount || 0)}</td>
        </tr>
      `;
    });

    return `
      <div class="receipt-card">
        <!-- Header -->
        <div class="receipt-header">
          <div>
            <div class="receipt-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
            <div class="receipt-soc-meta">
              ${regNo ? `Reg. No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
              ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong>` : ''}
              ${addr ? `<br>${HenuOsReportEngine.escapeHtml(addr)}` : ''}
            </div>
          </div>
          <div class="receipt-badge-box">
            <span class="receipt-title-badge">RECEIPT</span>
            <div class="receipt-no-date">
              No: <strong>${HenuOsReportEngine.escapeHtml(r.receiptNo || r.voucherNo || '-')}</strong><br>
              Date: <strong>${HenuOsReportEngine.formatDate(r.date || r.voucherDate)}</strong>
            </div>
          </div>
        </div>

        <!-- Meta Grid -->
        <div class="receipt-meta-grid">
          <div>
            <div class="receipt-meta-row">
              <span class="receipt-meta-lbl">Received From:</span>
              <span class="receipt-meta-val">${HenuOsReportEngine.escapeHtml(mem.name || mem.memberName || r.personName || '-')}</span>
            </div>
            <div class="receipt-meta-row">
              <span class="receipt-meta-lbl">Flat / Unit:</span>
              <span class="receipt-meta-val">${HenuOsReportEngine.escapeHtml(mem.flatNo || mem.flat || '-')} ${mem.wing ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</span>
            </div>
          </div>
          <div>
            <div class="receipt-meta-row">
              <span class="receipt-meta-lbl">Billing Period:</span>
              <span class="receipt-meta-val">${HenuOsReportEngine.escapeHtml(r.period || '-')}</span>
            </div>
            <div class="receipt-meta-row">
              <span class="receipt-meta-lbl">Member Code:</span>
              <span class="receipt-meta-val">${HenuOsReportEngine.escapeHtml(mem.memberCode || mem.code || '-')}</span>
            </div>
          </div>
        </div>

        <!-- Particulars Mini-Table -->
        <table class="receipt-particulars-table">
          <thead>
            <tr>
              <th>Particulars</th>
              <th class="right" style="width:100px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <!-- Amount & Words Strip -->
        <div class="receipt-totals-bar">
          <div>
            <span style="font-size:7pt; color:#64748b; font-weight:700; text-transform:uppercase;">Amount in Words:</span><br>
            <span class="receipt-words-text">${HenuOsReportEngine.escapeHtml(amountWords)}</span>
          </div>
          <div class="receipt-amount-display">${HenuOsReportEngine.formatINR(amount)}</div>
        </div>

        <!-- Payment Mode & Instrument Details -->
        <div class="receipt-payment-row">
          <div>Mode: <strong>${HenuOsReportEngine.escapeHtml(r.paymentMode || 'Direct Credit')}</strong></div>
          ${r.chequeNo ? `<div>Cheque / Ref No: <strong>${HenuOsReportEngine.escapeHtml(r.chequeNo)}</strong></div>` : ''}
          ${r.bankName ? `<div>Bank: <strong>${HenuOsReportEngine.escapeHtml(r.bankName)}</strong></div>` : ''}
          <div>Subject to realization</div>
        </div>

        <!-- Signatures Row -->
        <div class="receipt-footer-row">
          <div style="font-size:7pt; color:#64748b;">Collected By: ${HenuOsReportEngine.escapeHtml(r.collectedBy || 'ERP System')}</div>
          <div style="text-align:right;">
            <div style="font-size:7pt; color:#64748b; margin-bottom:12px;">For ${HenuOsReportEngine.escapeHtml(socName)}</div>
            <div style="border-top:1px solid #334155; font-size:7.5pt; font-weight:700; padding-top:2px;">Authorized Signatory</div>
          </div>
        </div>
      </div>
    `;
  }
})();
