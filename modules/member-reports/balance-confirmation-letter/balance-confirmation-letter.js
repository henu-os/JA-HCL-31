/**
 * balance-confirmation-letter.js — Member Balance Confirmation Letter Engine
 * Connects 100% to Live ERP Database & Active HENU OS Design
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_BALANCE_CONFIRMATION';
  let activeDesign = null;

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadMembersDropdown();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    loadLetters();
  });

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadLetters());
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadLetters());
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnPdf')?.addEventListener('click', () => window.print());
  }

  function resetFilters() {
    document.getElementById('filterMember').value = '';
    document.getElementById('filterWing').value = '';
    document.getElementById('filterAsOnDate').value = '';
    loadLetters();
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
      console.warn('[Balance Confirmation] Could not load member dropdown:', err);
    }
  }

  async function loadLetters() {
    const container = document.getElementById('letterContainer');
    const kpiStrip = document.getElementById('kpiStrip');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading balance confirmation statements from HENU ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const member = document.getElementById('filterMember')?.value?.trim() || '';
    const wing = document.getElementById('filterWing')?.value?.trim() || '';
    const asOnDate = document.getElementById('filterAsOnDate')?.value || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId);
      if (ctx.fyId) params.append('fyId', ctx.fyId);
      if (member) params.append('fromMember', member);
      if (wing) params.append('wing', wing);
      if (asOnDate) params.append('asOnDate', asOnDate);

      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/balance-confirmation?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const letters = data.letters || data.items || [];
      const society = data.society || {};

      if (letters.length === 0) {
        HenuOsReportEngine.renderEmpty(container, 'No member records found for balance confirmation.');
        if (kpiStrip) kpiStrip.style.display = 'none';
        return;
      }

      // Update KPI strip
      if (kpiStrip) {
        let totalOut = 0;
        letters.forEach(l => {
          totalOut += (l.closingBalance || l.closingDue || 0);
        });
        document.getElementById('kpiTotalLetters').textContent = letters.length;
        document.getElementById('kpiTotalOutstanding').textContent = HenuOsReportEngine.formatINR(totalOut);
        kpiStrip.style.display = 'flex';
      }

      renderLettersHTML(society, data, letters, container);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[Balance Confirmation] Error loading letters:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load confirmation letters from server.', () => loadLetters());
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  function renderLettersHTML(soc, data, letters, container) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const addr = soc.Address || soc.address || '';
    const asOnStr = data.asOnDate ? HenuOsReportEngine.formatDate(data.asOnDate) : HenuOsReportEngine.formatDate(new Date());

    let html = '';

    letters.forEach((item, idx) => {
      const isLast = idx === letters.length - 1;
      const mem = item.member || item;
      const closing = item.closingBalance || item.closingDue || 0;
      const opening = item.openingBalance || 0;
      const billed = item.billedAmount || item.demands || 0;
      const collected = item.collectedAmount || item.payments || 0;
      const adjustments = item.adjustedAmount || 0;
      const words = HenuOsReportEngine.numberToWordsINR(Math.abs(closing));

      html += `
        <div class="bac-letter-page ${!isLast ? 'page-break' : ''}">
          <!-- Letterhead -->
          <header class="bac-header">
            <div class="bac-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
            <div class="bac-soc-meta">
              ${regNo ? `Reg No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
              ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong>` : ''}
              ${addr ? `<br>${HenuOsReportEngine.escapeHtml(addr)}` : ''}
            </div>
          </header>

          <!-- Reference & Date -->
          <div class="bac-ref-date-row">
            <div>Ref No: <strong>BCL/${data.fyLabel || 'FY'}/${mem.flat || mem.flatNo || (idx + 1)}</strong></div>
            <div>Date: <strong>${asOnStr}</strong></div>
          </div>

          <!-- Addressee Member Box -->
          <div class="bac-addressee-box">
            <div style="font-weight:700; font-size:10pt;">To,</div>
            <div style="font-weight:800; font-size:10.5pt; color:var(--bac-primary);">${HenuOsReportEngine.escapeHtml(mem.name || mem.memberName || '-')}</div>
            <div>Flat / Unit No: <strong>${HenuOsReportEngine.escapeHtml(mem.flat || mem.flatNo || '-')}</strong> ${mem.wing ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</div>
            <div>Member Code: <strong>${HenuOsReportEngine.escapeHtml(mem.code || mem.memberCode || '-')}</strong></div>
          </div>

          <!-- Subject Line -->
          <div class="bac-subject-line">
            Subject: Confirmation of Account Balance as on ${asOnStr}
          </div>

          <!-- Formal Letter Body -->
          <div class="bac-body-para">
            Dear Member,<br>
            In connection with the finalization of society accounts and statutory audit for the financial period, please find below the statement of your maintenance and service charges account as per the society's books of accounts:
          </div>

          <!-- Financial Statement Table -->
          <table class="bac-summary-table">
            <thead>
              <tr>
                <th>Account Head / Particulars</th>
                <th class="right" style="width:140px;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Opening Balance as at beginning of period</td>
                <td class="right">${HenuOsReportEngine.formatINR(opening)}</td>
              </tr>
              <tr>
                <td>Add: Maintenance & Service Charges Billed during the period</td>
                <td class="right">${HenuOsReportEngine.formatINR(billed)}</td>
              </tr>
              <tr>
                <td>Less: Payments & Collections Received</td>
                <td class="right" style="color:#15803d;">${HenuOsReportEngine.formatINR(collected)}</td>
              </tr>
              ${adjustments !== 0 ? `
                <tr>
                  <td>Adjustments / Waivers / Transfers</td>
                  <td class="right">${HenuOsReportEngine.formatINR(adjustments)}</td>
                </tr>
              ` : ''}
              <tr class="closing-row">
                <td>CLOSING BALANCE RECEIVABLE AS ON ${asOnStr.toUpperCase()}:</td>
                <td class="right">${HenuOsReportEngine.formatINR(closing)}</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size:8.5pt; margin-bottom:12px;">
            Amount in Words: <strong style="font-style:italic;">${HenuOsReportEngine.escapeHtml(words)}</strong> (${closing >= 0 ? 'Debit / Receivable' : 'Credit / Advance'}).
          </div>

          <div class="bac-body-para" style="font-size:8.5pt;">
            Kindly verify the above balance with your records. If you find any discrepancy, please notify the society office within 15 days of receipt of this letter, along with supporting documents / receipts. Otherwise, this balance will be deemed as confirmed.
          </div>

          <!-- Signatures -->
          <div class="bac-sig-row">
            <div class="bac-sig-col">
              <div class="bac-sig-line">Prepared By (Accountant)</div>
            </div>
            <div class="bac-sig-col">
              <div class="bac-sig-line">Verified By (Auditor)</div>
            </div>
            <div class="bac-sig-col">
              <div class="bac-sig-line">Hon. Secretary / Treasurer</div>
            </div>
          </div>

          <!-- Tear-Off Acknowledgment Slip -->
          <div class="bac-tear-off">
            <div class="bac-tearoff-line">
              <span class="bac-tearoff-tag">✂ &nbsp; TEAR-OFF CONFIRMATION SLIP &nbsp; ✂</span>
            </div>
            <div class="bac-ack-card">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <div>To: The Hon. Secretary, <strong>${HenuOsReportEngine.escapeHtml(socName)}</strong></div>
                <div>Date: ______________</div>
              </div>
              <div style="font-size:7.5pt; margin-bottom:8px;">
                I/We confirm that the closing balance of <strong>${HenuOsReportEngine.formatINR(closing)}</strong> as on ${asOnStr} in respect of Flat/Unit <strong>${HenuOsReportEngine.escapeHtml(mem.flat || mem.flatNo || '-')}</strong> is correct.
              </div>
              <div style="display:flex; justify-content:space-between; align-items:flex-end; font-size:7.5pt;">
                <div>Member Name: <strong>${HenuOsReportEngine.escapeHtml(mem.name || mem.memberName || '-')}</strong></div>
                <div style="border-top:1px solid #334155; width:160px; text-align:center; padding-top:2px;">Signature of Member</div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }
})();
