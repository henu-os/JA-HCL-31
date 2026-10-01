/**
 * debit-note.js — Member Debit Note Engine
 * Connects 100% to Live ERP Database & Active HENU OS Design
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_DEBIT_NOTE';
  let activeDesign = null;

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadMembersDropdown();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    loadDebitNotes();
  });

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadDebitNotes());
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadDebitNotes());
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnPdf')?.addEventListener('click', () => window.print());
  }

  function resetFilters() {
    document.getElementById('filterNoteNo').value = '';
    document.getElementById('filterMember').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    loadDebitNotes();
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
      console.warn('[Debit Note] Could not load member dropdown:', err);
    }
  }

  async function loadDebitNotes() {
    const container = document.getElementById('debitNoteContainer');
    const kpiStrip = document.getElementById('kpiStrip');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading debit notes from HENU ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const noteNo = document.getElementById('filterNoteNo')?.value?.trim() || '';
    const member = document.getElementById('filterMember')?.value?.trim() || '';
    const fromDate = document.getElementById('filterDateFrom')?.value || '';
    const toDate = document.getElementById('filterDateTo')?.value || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId);
      if (ctx.fyId) params.append('fyId', ctx.fyId);
      if (noteNo) params.append('fromNoteNo', noteNo);
      if (member) params.append('fromMember', member);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);

      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/debit-note?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const notes = data.notes || data.items || [];
      const society = data.society || {};

      if (notes.length === 0) {
        HenuOsReportEngine.renderEmpty(container, 'No debit notes found for the selected criteria.');
        if (kpiStrip) kpiStrip.style.display = 'none';
        return;
      }

      // Update KPI strip
      if (kpiStrip) {
        let totalAmt = 0;
        notes.forEach(n => {
          const noteObj = n.note || n;
          totalAmt += (noteObj.totalAmount || noteObj.amount || 0);
        });
        document.getElementById('kpiTotalNotes').textContent = notes.length;
        document.getElementById('kpiTotalDebit').textContent = HenuOsReportEngine.formatINR(totalAmt);
        kpiStrip.style.display = 'flex';
      }

      renderDebitNotesHTML(society, notes, container);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[Debit Note] Error loading debit notes:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load debit note records from server.', () => loadDebitNotes());
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  function renderDebitNotesHTML(soc, notes, container) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const addr = soc.Address || soc.address || '';

    let html = '';

    notes.forEach((item, idx) => {
      const isLast = idx === notes.length - 1;
      const mem = item.member || {};
      const note = item.note || item;
      const entries = item.items || item.particulars || [
        { srNo: 1, particulars: note.reason || note.narration || 'Debit Note Particulars', amount: note.totalAmount || note.amount || 0 }
      ];
      const totalAmount = note.totalAmount || note.amount || 0;
      const words = HenuOsReportEngine.numberToWordsINR(totalAmount);

      let rowsHtml = '';
      entries.forEach((e, eIdx) => {
        rowsHtml += `
          <tr>
            <td class="center" style="width:40px;">${e.srNo || (eIdx + 1)}</td>
            <td>
              <strong>${HenuOsReportEngine.escapeHtml(e.particulars || e.accountHead || 'Debit Adjustment')}</strong>
              ${e.narration ? `<div style="font-size:8pt; color:#64748b; margin-top:2px;">${HenuOsReportEngine.escapeHtml(e.narration)}</div>` : ''}
            </td>
            <td class="right" style="width:120px; font-weight:700;">${HenuOsReportEngine.formatINR(e.amount || 0)}</td>
          </tr>
        `;
      });

      html += `
        <div class="debit-note-page ${!isLast ? 'page-break' : ''}">
          <!-- Header -->
          <header class="debit-header">
            <div class="debit-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
            <div class="debit-soc-meta">
              ${regNo ? `Reg No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
              ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong>` : ''}
              ${addr ? `<br>${HenuOsReportEngine.escapeHtml(addr)}` : ''}
            </div>
          </header>

          <!-- Title Bar -->
          <div class="debit-title-bar">
            <div class="debit-doc-title">DEBIT NOTE</div>
            <div>Date: <strong>${HenuOsReportEngine.formatDate(note.noteDate || note.date)}</strong></div>
          </div>

          <!-- Meta Grid -->
          <div class="debit-meta-grid">
            <div class="debit-meta-box">
              <div class="debit-meta-title">Member / Resident Details</div>
              <div style="font-weight:700; font-size:10pt;">${HenuOsReportEngine.escapeHtml(mem.name || mem.memberName || note.personName || '-')}</div>
              <div style="margin-top:3px; color:#475569;">
                Flat / Unit: <strong>${HenuOsReportEngine.escapeHtml(mem.flatNo || mem.flat || '-')}</strong> ${mem.wing ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}
              </div>
              <div style="color:#64748b;">Member Code: ${HenuOsReportEngine.escapeHtml(mem.code || mem.memberCode || '-')}</div>
            </div>

            <div class="debit-meta-box">
              <div class="debit-meta-title">Document Information</div>
              <div>Note Number: <strong style="color:var(--dn-primary);">${HenuOsReportEngine.escapeHtml(note.noteNo || note.voucherNo || '-')}</strong></div>
              <div style="margin-top:3px;">Date Issued: <strong>${HenuOsReportEngine.formatDate(note.noteDate || note.date)}</strong></div>
              ${note.refBillNo ? `<div>Against Bill: <strong>${HenuOsReportEngine.escapeHtml(note.refBillNo)}</strong></div>` : ''}
            </div>
          </div>

          <!-- Transactions Table -->
          <table class="debit-table">
            <thead>
              <tr>
                <th class="center">Sr</th>
                <th>Account Head / Reason for Debit</th>
                <th class="right">Debit Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <!-- Summary Bar -->
          <div class="debit-summary-bar">
            <div>
              <div style="font-size:7.5pt; font-weight:700; color:#64748b; text-transform:uppercase;">Amount in Words:</div>
              <div style="font-size:8.5pt; font-style:italic; font-weight:600;">${HenuOsReportEngine.escapeHtml(words)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:7.5pt; font-weight:700; color:#64748b; text-transform:uppercase;">Total Debit Amount</div>
              <div style="font-size:13pt; font-weight:800; color:var(--dn-primary);">${HenuOsReportEngine.formatINR(totalAmount)}</div>
            </div>
          </div>

          <!-- Signatures Footer -->
          <footer class="debit-footer">
            <div class="debit-sig-row">
              <div class="debit-sig-col">
                <div class="debit-sig-line">Prepared By</div>
              </div>
              <div class="debit-sig-col">
                <div class="debit-sig-line">Checked By</div>
              </div>
              <div class="debit-sig-col">
                <div class="debit-sig-line">Hon. Treasurer / Secretary</div>
              </div>
            </div>
          </footer>
        </div>
      `;
    });

    container.innerHTML = html;
  }
})();
