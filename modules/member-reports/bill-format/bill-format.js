/**
 * bill-format.js — Member Bill Format Engine (A4 GST & Standard)
 * Connects 100% to Live ERP Database & Active HENU OS Design
 */

(function () {
  'use strict';

  const REPORT_KEY = 'MEMBER_BILL_FORMAT';
  let activeDesign = null;

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadMembersDropdown();
    activeDesign = await HenuOsReportEngine.loadActiveDesign(REPORT_KEY);
    loadBills();
  });

  function setupEventListeners() {
    document.getElementById('btnRefresh')?.addEventListener('click', () => loadBills());
    document.getElementById('btnApplyFilters')?.addEventListener('click', () => loadBills());
    document.getElementById('btnReset')?.addEventListener('click', () => resetFilters());
    document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
    document.getElementById('btnPdf')?.addEventListener('click', () => window.print());
  }

  function resetFilters() {
    document.getElementById('filterBillNo').value = '';
    document.getElementById('filterWing').value = '';
    document.getElementById('filterMember').value = '';
    document.getElementById('filterBillFrom').value = '';
    document.getElementById('filterBillTo').value = '';
    loadBills();
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
      console.warn('[Bill Format] Could not load member dropdown:', err);
    }
  }

  async function loadBills() {
    const container = document.getElementById('billContainer');
    const kpiStrip = document.getElementById('kpiStrip');
    if (!container) return;

    HenuOsReportEngine.renderLoading(container, 'Loading bills from HENU ERP database...');

    const ctx = HenuOsReportEngine.getSystemContext();
    const billNo = document.getElementById('filterBillNo')?.value?.trim() || '';
    const wing = document.getElementById('filterWing')?.value?.trim() || '';
    const member = document.getElementById('filterMember')?.value?.trim() || '';
    const fromDate = document.getElementById('filterBillFrom')?.value || '';
    const toDate = document.getElementById('filterBillTo')?.value || '';

    try {
      const params = new URLSearchParams();
      params.append('societyId', ctx.societyId);
      if (ctx.fyId) params.append('fyId', ctx.fyId);
      if (billNo) params.append('fromBillNo', billNo);
      if (wing) params.append('wing', wing);
      if (member) params.append('fromMember', member);
      if (fromDate) params.append('billFrom', fromDate);
      if (toDate) params.append('billTo', toDate);

      const res = await fetch(`${HenuOsReportEngine.API_BASE}/reports/member/bill-format?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const bills = data.bills || [];
      const society = data.society || {};

      if (bills.length === 0) {
        HenuOsReportEngine.renderEmpty(container, 'No billing records found for the selected criteria.');
        if (kpiStrip) kpiStrip.style.display = 'none';
        return;
      }

      // Update KPI strip
      if (kpiStrip) {
        let totalTaxable = 0;
        let totalTax = 0;
        let totalNet = 0;

        bills.forEach(b => {
          totalTaxable += (b.subtotalTaxable || b.principalAmount || 0);
          totalTax += ((b.cgstTotal || 0) + (b.sgstTotal || 0));
          totalNet += (b.netPayable || b.totalAmount || 0);
        });

        document.getElementById('kpiTotalBills').textContent = bills.length;
        document.getElementById('kpiTotalTaxable').textContent = HenuOsReportEngine.formatINR(totalTaxable);
        document.getElementById('kpiTotalTax').textContent = HenuOsReportEngine.formatINR(totalTax);
        document.getElementById('kpiNetPayable').textContent = HenuOsReportEngine.formatINR(totalNet);
        kpiStrip.style.display = 'flex';
      }

      renderBillsHTML(society, bills, container);
      HenuOsReportEngine.applyDesignToDOM(activeDesign);
    } catch (err) {
      console.error('[Bill Format] Error loading bills:', err);
      HenuOsReportEngine.renderError(container, 'Unable to load bill format records from server.', () => loadBills());
      if (kpiStrip) kpiStrip.style.display = 'none';
    }
  }

  function renderBillsHTML(soc, bills, container) {
    const socName = soc.SocietyName || soc.societyname || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationno || '';
    const pan = soc.PANNumber || soc.pannumber || soc.pan || '';
    const gstin = soc.GSTNumber || soc.gstnumber || soc.gstin || '';
    const addr = soc.Address || soc.address || '';
    const bankName = soc.BankName || soc.bankname || '';
    const accNo = soc.BankAccountNo || soc.bankaccountno || '';
    const ifsc = soc.IFSCCode || soc.ifsccode || '';

    let html = '';

    bills.forEach((bill, idx) => {
      const isLast = idx === bills.length - 1;
      const mem = bill.member || {};
      const items = bill.items || [];
      const isGst = bill.isGst !== undefined ? bill.isGst : (gstin.length > 0);
      const netPayable = bill.netPayable || bill.totalAmount || 0;
      const amountInWords = HenuOsReportEngine.numberToWordsINR(netPayable);

      let chargeRows = '';
      if (items.length > 0) {
        items.forEach((it, itIdx) => {
          chargeRows += `
            <tr>
              <td class="center" style="width:35px;">${itIdx + 1}</td>
              <td>${HenuOsReportEngine.escapeHtml(it.description || it.headName || 'Maintenance Charge')}</td>
              <td class="center" style="width:75px;">${HenuOsReportEngine.escapeHtml(it.sac || bill.sacCode || '999598')}</td>
              <td class="right" style="width:90px;">${HenuOsReportEngine.formatINR(it.taxable || it.amount || 0)}</td>
              ${isGst ? `
                <td class="right" style="width:70px;">${HenuOsReportEngine.formatINR(it.cgst || 0)}</td>
                <td class="right" style="width:70px;">${HenuOsReportEngine.formatINR(it.sgst || 0)}</td>
              ` : ''}
              <td class="right" style="width:95px; font-weight:700;">${HenuOsReportEngine.formatINR(it.amount || 0)}</td>
            </tr>
          `;
        });
      } else {
        chargeRows = `
          <tr>
            <td class="center">1</td>
            <td>Society Maintenance Charges</td>
            <td class="center">${HenuOsReportEngine.escapeHtml(bill.sacCode || '999598')}</td>
            <td class="right">${HenuOsReportEngine.formatINR(bill.principalAmount || 0)}</td>
            ${isGst ? `
              <td class="right">₹0.00</td>
              <td class="right">₹0.00</td>
            ` : ''}
            <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(bill.totalAmount || 0)}</td>
          </tr>
        `;
      }

      html += `
        <div class="bill-page ${!isLast ? 'page-break' : ''}">
          <!-- Header -->
          <header class="bill-header">
            <div class="bill-header-left">
              <div class="bill-soc-name">${HenuOsReportEngine.escapeHtml(socName)}</div>
              <div class="bill-soc-meta">
                ${regNo ? `Reg No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
                ${pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong> | ` : ''}
                ${gstin ? `GSTIN: <strong>${HenuOsReportEngine.escapeHtml(gstin)}</strong>` : ''}
              </div>
              <div class="bill-soc-meta">${HenuOsReportEngine.escapeHtml(addr)}</div>
            </div>
          </header>

          <!-- Document Title -->
          <div class="bill-title-bar">
            <div class="bill-doc-title">${isGst ? 'TAX INVOICE' : 'BILL OF SUPPLY / MAINTENANCE BILL'}</div>
            <div class="bill-doc-period">Billing Period: ${HenuOsReportEngine.escapeHtml(bill.period || HenuOsReportEngine.formatDate(bill.billDate))}</div>
          </div>

          <!-- Invoice & Member Meta Grid -->
          <div class="bill-meta-grid">
            <div class="bill-meta-box">
              <div class="bill-meta-title">Bill To (Member Details)</div>
              <div class="bill-meta-row">
                <span class="bill-meta-label">Member Name:</span>
                <span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.name || mem.memberName || '-')}</span>
              </div>
              <div class="bill-meta-row">
                <span class="bill-meta-label">Flat / Unit No:</span>
                <span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.flatNo || mem.flat || '-')} ${mem.wing ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</span>
              </div>
              <div class="bill-meta-row">
                <span class="bill-meta-label">Member Code:</span>
                <span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.memberCode || mem.code || '-')}</span>
              </div>
              ${mem.gstin ? `
                <div class="bill-meta-row">
                  <span class="bill-meta-label">Member GSTIN:</span>
                  <span class="bill-meta-val">${HenuOsReportEngine.escapeHtml(mem.gstin)}</span>
                </div>
              ` : ''}
            </div>

            <div class="bill-meta-box">
              <div class="bill-meta-title">Invoice Information</div>
              <div class="bill-meta-row">
                <span class="bill-meta-label">Bill / Inv No:</span>
                <span class="bill-meta-val" style="color:var(--bill-primary); font-weight:800;">${HenuOsReportEngine.escapeHtml(bill.billNo || '-')}</span>
              </div>
              <div class="bill-meta-row">
                <span class="bill-meta-label">Bill Date:</span>
                <span class="bill-meta-val">${HenuOsReportEngine.formatDate(bill.billDate)}</span>
              </div>
              <div class="bill-meta-row">
                <span class="bill-meta-label">Due Date:</span>
                <span class="bill-meta-val" style="color:var(--bill-accent); font-weight:700;">${HenuOsReportEngine.formatDate(bill.dueDate)}</span>
              </div>
              <div class="bill-meta-row">
                <span class="bill-meta-label">Area (Sq. Ft):</span>
                <span class="bill-meta-val">${mem.areaSqft || mem.area || '-'}</span>
              </div>
            </div>
          </div>

          <!-- Charge Table -->
          <div class="bill-table-wrapper">
            <table class="bill-table">
              <thead>
                <tr>
                  <th class="center">Sr</th>
                  <th>Particulars / Description</th>
                  <th class="center">SAC</th>
                  <th class="right">Taxable (₹)</th>
                  ${isGst ? `
                    <th class="right">CGST (₹)</th>
                    <th class="right">SGST (₹)</th>
                  ` : ''}
                  <th class="right">Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${chargeRows}
              </tbody>
            </table>
          </div>

          <!-- Summary & Totals Grid -->
          <div class="bill-summary-grid">
            <div class="bill-words-box">
              <div>
                <div style="font-weight:700; color:var(--bill-primary); margin-bottom:3px;">Amount in Words:</div>
                <div style="font-style:italic; line-height:1.3;">${HenuOsReportEngine.escapeHtml(amountInWords)}</div>
              </div>
              <div class="bill-payment-box" style="margin-top:8px;">
                <div style="font-weight:700; font-size:8pt; margin-bottom:2px; color:var(--bill-primary);">Bank Details for Payment:</div>
                <div style="font-size:8pt;">Bank: <strong>${HenuOsReportEngine.escapeHtml(bankName || 'Society Bank Account')}</strong></div>
                ${accNo ? `<div style="font-size:8pt;">A/C No: <strong>${HenuOsReportEngine.escapeHtml(accNo)}</strong> | IFSC: <strong>${HenuOsReportEngine.escapeHtml(ifsc)}</strong></div>` : ''}
              </div>
            </div>

            <div>
              <table class="bill-totals-table">
                <tr>
                  <td>Current Charges:</td>
                  <td class="right" style="font-weight:700;">${HenuOsReportEngine.formatINR(bill.currentBillTotal || bill.principalAmount || 0)}</td>
                </tr>
                ${isGst ? `
                  <tr>
                    <td>Total Taxes (CGST + SGST):</td>
                    <td class="right">${HenuOsReportEngine.formatINR((bill.cgstTotal || 0) + (bill.sgstTotal || 0))}</td>
                  </tr>
                ` : ''}
                ${(bill.prevArrears && bill.prevArrears > 0) ? `
                  <tr>
                    <td>Previous Arrears:</td>
                    <td class="right" style="color:var(--bill-accent);">${HenuOsReportEngine.formatINR(bill.prevArrears)}</td>
                  </tr>
                ` : ''}
                ${(bill.interest && bill.interest > 0) ? `
                  <tr>
                    <td>Interest on Arrears:</td>
                    <td class="right">${HenuOsReportEngine.formatINR(bill.interest)}</td>
                  </tr>
                ` : ''}
                <tr class="grand-total">
                  <td>NET PAYABLE AMOUNT:</td>
                  <td class="right" style="color:var(--bill-primary); font-size:10pt;">${HenuOsReportEngine.formatINR(netPayable)}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Signatures & Footer -->
          <footer class="bill-signature-area" style="margin-top:auto; padding-top:10px; border-top:1px solid var(--bill-border); display:flex; justify-content:space-between; text-align:center;">
            <div style="width:30%;">
              <div style="font-size:8pt; color:var(--bill-text-muted);">Prepared By</div>
              <div style="margin-top:25px; border-top:1px solid #334155; font-size:8pt; font-weight:700;">Accountant / Manager</div>
            </div>
            <div style="width:30%;">
              <div style="font-size:8pt; color:var(--bill-text-muted);">For ${HenuOsReportEngine.escapeHtml(socName)}</div>
              <div style="margin-top:25px; border-top:1px solid #334155; font-size:8pt; font-weight:700;">Hon. Treasurer / Secretary</div>
            </div>
          </footer>
        </div>
      `;
    });

    container.innerHTML = html;
  }
})();
