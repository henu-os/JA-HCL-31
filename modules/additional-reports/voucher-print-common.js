/**
 * ═════════════════════════════════════════════════════════════════════
 * JEEVIKA ERP v2 — ADDITIONAL REPORTS: VOUCHER PRINT COMMON ENGINE
 * Shared logic for Receipt, Payment, Contra, and Journal Voucher Prints
 * ═════════════════════════════════════════════════════════════════════
 */

const VoucherPrintCommon = (function () {
  'use strict';

  let _cachedSocietyInfo = null;

  // ── 1. ACTIVE CONTEXT HELPERS ─────────────────────────────────────
  function getActiveSocietyId() {
    return (window.Auth && Auth.getSocietyId && Auth.getSocietyId()) ||
           sessionStorage.getItem('activeSocietyId') ||
           localStorage.getItem('activeSocietyId') ||
           '2';
  }

  function getActiveFYId() {
    return (window.Auth && Auth.getFYId && Auth.getFYId()) ||
           sessionStorage.getItem('activeFYId') ||
           localStorage.getItem('activeFYId') ||
           '1';
  }

  function getActiveFYLabel() {
    return (window.Auth && Auth.getFYLabel && Auth.getFYLabel()) ||
           sessionStorage.getItem('activeFYLabel') ||
           localStorage.getItem('activeFYLabel') ||
           '2026-27';
  }

  function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCurrency(val) {
    const num = parseFloat(val) || 0;
    return '₹ ' + num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatNumber(val) {
    const num = parseFloat(val) || 0;
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDate(dStr) {
    if (!dStr) return '—';
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const yr = d.getFullYear();
    return `${day}/${mon}/${yr}`;
  }

  // ── 2. NUMBER TO WORDS (INDIAN NUMBERING SYSTEM) ───────────────────
  function numberToWords(num) {
    num = Math.abs(Math.floor(num));
    if (num === 0) return 'Zero';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
      'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
      'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
      'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function inWords(n) {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '');
    }

    let words = '';
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh  = Math.floor(num / 100000);   num %= 100000;
    const thousand = Math.floor(num / 1000);  num %= 1000;
    const rest = num;

    if (crore)    words += inWords(crore)    + ' Crore ';
    if (lakh)     words += inWords(lakh)     + ' Lakh ';
    if (thousand) words += inWords(thousand) + ' Thousand ';
    if (rest)     words += inWords(rest);

    return words.trim();
  }

  function amountInWords(amount) {
    const num = parseFloat(amount) || 0;
    const rupees = Math.floor(num);
    const paise  = Math.round((num - rupees) * 100);
    let result = 'Rupees ' + numberToWords(rupees);
    if (paise > 0) result += ' and ' + numberToWords(paise) + ' Paise';
    return result + ' Only';
  }

  // ── 3. SOCIETY INFO FETCH & CACHE ──────────────────────────────────
  async function fetchSocietyInfo() {
    if (_cachedSocietyInfo) return _cachedSocietyInfo;
    try {
      const sid = getActiveSocietyId();
      if (window.API && API.get) {
        const res = await API.get(`/societies/${sid}`);
        if (res && res.success && res.data) {
          _cachedSocietyInfo = res.data;
          return _cachedSocietyInfo;
        }
      }
    } catch (e) {
      console.warn('[VoucherPrintCommon] fetchSocietyInfo warning:', e);
    }

    // Fallback default
    _cachedSocietyInfo = {
      societyName: (window.Auth && Auth.getSocietyName && Auth.getSocietyName()) || 'CO-OPERATIVE HOUSING SOCIETY LTD.',
      registrationNo: 'BOM/HSG/0000',
      address: 'Society Address, Sector / Area',
      city: 'Mumbai',
      pincode: '400001',
      phone: '',
      email: '',
      panNumber: '',
      gstNumber: ''
    };
    return _cachedSocietyInfo;
  }

  // ── 4. FINANCIAL YEAR DATE INITIALIZATION & PRESETS ───────────────
  function initFYDates(fromElId = 'fromDate', toElId = 'toDate') {
    const fyLabel = getActiveFYLabel();
    let startYear = 2026;
    const match = fyLabel.match(/(\d{4})/);
    if (match) startYear = parseInt(match[1], 10);

    const fromDateStr = `${startYear}-04-01`;
    const toDateStr = `${startYear + 1}-03-31`;

    const fromEl = document.getElementById(fromElId);
    const toEl = document.getElementById(toElId);
    if (fromEl && !fromEl.value) fromEl.value = fromDateStr;
    if (toEl && !toEl.value) toEl.value = toDateStr;

    return { fromDate: fromDateStr, toDate: toDateStr };
  }

  function applyDatePreset(preset, fromElId = 'fromDate', toElId = 'toDate', callback = null) {
    const fromEl = document.getElementById(fromElId);
    const toEl = document.getElementById(toElId);
    if (!fromEl || !toEl) return;

    const fyLabel = getActiveFYLabel();
    let startYear = 2026;
    const match = fyLabel.match(/(\d{4})/);
    if (match) startYear = parseInt(match[1], 10);
    const endYear = startYear + 1;

    const fyStart = new Date(startYear, 3, 1);
    const fyEnd = new Date(endYear, 2, 31);
    const now = new Date();
    const fmt = d => d.toISOString().split('T')[0];

    if (preset === 'all') {
      fromEl.value = '';
      toEl.value = '';
    } else if (preset === 'full') {
      fromEl.value = `${startYear}-04-01`;
      toEl.value = `${endYear}-03-31`;
    } else if (preset === 'this-month') {
      fromEl.value = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
      toEl.value = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (preset === 'last-month') {
      fromEl.value = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      toEl.value = fmt(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (preset === 'q1') {
      fromEl.value = `${startYear}-04-01`;
      toEl.value = `${startYear}-06-30`;
    } else if (preset === 'q2') {
      fromEl.value = `${startYear}-07-01`;
      toEl.value = `${startYear}-09-30`;
    } else if (preset === 'q3') {
      fromEl.value = `${startYear}-10-01`;
      toEl.value = `${startYear}-12-31`;
    } else if (preset === 'q4') {
      fromEl.value = `${endYear}-01-01`;
      toEl.value = `${endYear}-03-31`;
    }

    if (typeof callback === 'function') callback();
  }

  // ── 5. SINGLE & BATCH VOUCHER RENDERING TEMPLATES ─────────────────

  /**
   * Builds the official statutory voucher HTML for one voucher
   * @param {Object} v - Voucher header record
   * @param {Array} items - Line items from SocVoucherDetail
   * @param {'Receipt'|'Payment'|'Contra'|'Journal'} type - Voucher category
   * @param {Object} soc - Society info
   */
  function renderSingleVoucherHtml(v, items = [], type = 'Receipt', soc = null) {
    soc = soc || _cachedSocietyInfo || { societyName: 'HOUSING SOCIETY LTD.' };
    const sName = soc.societyName || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const sAddress = soc.address || '';
    const sCity = soc.city || '';
    const sPin = soc.pincode || '';
    const sReg = soc.registrationNo || soc.regNo || '';
    const sPan = soc.panNumber || soc.panNo || '';
    const sGst = soc.gstNumber || soc.gstin || '';
    const sPhone = soc.phone || soc.contactNo || '';
    const sEmail = soc.email || '';

    const fyLabel = v.fyLabel || getActiveFYLabel();
    const vNo = v.voucherNo || '—';
    const vDate = formatDate(v.voucherDate);
    const vAmount = parseFloat(v.amount) || 0;
    const vNarr = v.narration || v.particular1 || '—';
    const chqNo = v.chqNo || '';
    const chqDate = v.chqDate ? formatDate(v.chqDate) : '';
    const bankName = v.bankName || '';
    const cashBankName = v.cashBankName || (v.cashBankCode ? `A/c (${v.cashBankCode})` : '—');
    const personName = v.personName || v.paidTo || '—';
    const refNo = v.refNo || '';

    // Determine Mode
    let modeLabel = 'Cash';
    if (cashBankName.toLowerCase().includes('bank') || bankName || chqNo) {
      modeLabel = 'Bank / Instrument';
    } else if (type === 'Contra') {
      modeLabel = 'Internal Transfer';
    }

    // ── Generate Voucher-Specific Layouts ──
    let title = 'VOUCHER';
    let metaHtml = '';
    let tableHtml = '';
    let wordsAmount = vAmount;
    let signatureHtml = '';

    if (type === 'Receipt') {
      title = 'RECEIPT VOUCHER';
      metaHtml = `
        <div class="v-meta-row"><span class="v-meta-lbl">Voucher No:</span><span class="v-meta-val"><strong>${escHtml(vNo)}</strong></span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Date:</span><span class="v-meta-val">${escHtml(vDate)}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Received From:</span><span class="v-meta-val"><strong>${escHtml(personName)}</strong></span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Receipt Mode:</span><span class="v-meta-val">${escHtml(modeLabel)}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Deposited In:</span><span class="v-meta-val">${escHtml(cashBankName)}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Cheque / Ref No:</span><span class="v-meta-val">${escHtml(chqNo || refNo || '—')}${chqDate ? ' Dt: ' + escHtml(chqDate) : ''}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Drawn On Bank:</span><span class="v-meta-val">${escHtml(bankName || '—')}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Financial Year:</span><span class="v-meta-val">${escHtml(fyLabel)}</span></div>
      `;

      // Line items: credit lines represent receipt particulars
      let rows = '';
      let tot = 0;
      if (items.length > 0) {
        items.forEach((it, idx) => {
          const amt = parseFloat(it.credit) > 0 ? parseFloat(it.credit) : (parseFloat(it.debit) || 0);
          tot += amt;
          rows += `
            <tr>
              <td class="td-center" style="width:35px;">${idx + 1}</td>
              <td><strong>${escHtml(it.accountName || 'Receipt Head')}</strong></td>
              <td style="width:110px;">${escHtml(it.accountCode || '—')}</td>
              <td>${escHtml(it.narration || vNarr)}</td>
              <td class="td-right td-amt" style="width:130px;">${formatNumber(amt)}</td>
            </tr>
          `;
        });
      } else {
        tot = vAmount;
        rows = `
          <tr>
            <td class="td-center">1</td>
            <td><strong>${escHtml(v.particular1 || 'Collections / Income Head')}</strong></td>
            <td>${escHtml(v.cashBankCode || '—')}</td>
            <td>${escHtml(vNarr)}</td>
            <td class="td-right td-amt">${formatNumber(vAmount)}</td>
          </tr>
        `;
      }
      wordsAmount = tot;

      tableHtml = `
        <table class="v-particulars-table">
          <thead>
            <tr>
              <th class="td-center" style="width:35px;">#</th>
              <th>Particulars / Account Head</th>
              <th style="width:110px;">Account Code</th>
              <th>Description / Narration</th>
              <th class="td-right" style="width:130px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="td-right" style="font-weight:800; text-transform:uppercase;">Total Amount Received:</td>
              <td class="td-right td-amt">${formatCurrency(tot)}</td>
            </tr>
          </tfoot>
        </table>
      `;

      signatureHtml = `
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Depositor / Payer's Sign</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Prepared By</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Checked By</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Hon. Treasurer / Secretary</div>
        </div>
      `;

    } else if (type === 'Payment') {
      title = 'PAYMENT VOUCHER';
      metaHtml = `
        <div class="v-meta-row"><span class="v-meta-lbl">Voucher No:</span><span class="v-meta-val"><strong>${escHtml(vNo)}</strong></span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Date:</span><span class="v-meta-val">${escHtml(vDate)}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Paid To:</span><span class="v-meta-val"><strong>${escHtml(personName)}</strong></span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Payment Mode:</span><span class="v-meta-val">${escHtml(modeLabel)}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Paid Through:</span><span class="v-meta-val">${escHtml(cashBankName)}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Cheque / Ref No:</span><span class="v-meta-val">${escHtml(chqNo || refNo || '—')}${chqDate ? ' Dt: ' + escHtml(chqDate) : ''}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Bank / Branch:</span><span class="v-meta-val">${escHtml(bankName || '—')}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Financial Year:</span><span class="v-meta-val">${escHtml(fyLabel)}</span></div>
      `;

      let rows = '';
      let tot = 0;
      if (items.length > 0) {
        items.forEach((it, idx) => {
          const dr = parseFloat(it.debit) || 0;
          const cr = parseFloat(it.credit) || 0;
          const amt = dr > 0 ? dr : cr;
          tot += dr > 0 ? dr : 0;
          rows += `
            <tr>
              <td class="td-center" style="width:35px;">${idx + 1}</td>
              <td><strong>${escHtml(it.accountName || 'Expense Head')}</strong></td>
              <td style="width:110px;">${escHtml(it.accountCode || '—')}</td>
              <td>${escHtml(it.narration || vNarr)}</td>
              <td class="td-right td-amt" style="width:130px;">${formatNumber(amt)}</td>
            </tr>
          `;
        });
      } else {
        tot = vAmount;
        rows = `
          <tr>
            <td class="td-center">1</td>
            <td><strong>${escHtml(v.particular1 || personName || 'Expense Head')}</strong></td>
            <td>${escHtml(v.cashBankCode || '—')}</td>
            <td>${escHtml(vNarr)}</td>
            <td class="td-right td-amt">${formatNumber(vAmount)}</td>
          </tr>
        `;
      }
      wordsAmount = tot || vAmount;

      tableHtml = `
        <table class="v-particulars-table">
          <thead>
            <tr>
              <th class="td-center" style="width:35px;">#</th>
              <th>Paid To / Expense Head</th>
              <th style="width:110px;">Account Code</th>
              <th>Description / Bill Details</th>
              <th class="td-right" style="width:130px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="td-right" style="font-weight:800; text-transform:uppercase;">Total Amount Paid:</td>
              <td class="td-right td-amt">${formatCurrency(tot || vAmount)}</td>
            </tr>
          </tfoot>
        </table>
      `;

      signatureHtml = `
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Receiver's Signature</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Prepared By</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Checked By</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Hon. Treasurer / Secretary</div>
        </div>
      `;

    } else if (type === 'Contra') {
      title = 'CONTRA VOUCHER';
      metaHtml = `
        <div class="v-meta-row"><span class="v-meta-lbl">Voucher No:</span><span class="v-meta-val"><strong>${escHtml(vNo)}</strong></span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Date:</span><span class="v-meta-val">${escHtml(vDate)}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Transfer Type:</span><span class="v-meta-val">${escHtml(v.personName || 'Internal Contra Transfer')}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Cheque / Ref No:</span><span class="v-meta-val">${escHtml(chqNo || refNo || '—')}${chqDate ? ' Dt: ' + escHtml(chqDate) : ''}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Bank Details:</span><span class="v-meta-val">${escHtml(bankName || '—')}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Financial Year:</span><span class="v-meta-val">${escHtml(fyLabel)}</span></div>
      `;

      let rows = '';
      let totDr = 0, totCr = 0;
      if (items.length > 0) {
        items.forEach((it, idx) => {
          const dr = parseFloat(it.debit) || 0;
          const cr = parseFloat(it.credit) || 0;
          totDr += dr; totCr += cr;
          const direction = dr > 0 ? 'To (Debit — Deposit)' : 'From (Credit — Withdrawal)';
          rows += `
            <tr>
              <td class="td-center" style="width:35px;">${idx + 1}</td>
              <td style="width:180px;"><strong>${direction}</strong></td>
              <td><strong>${escHtml(it.accountName || 'Cash/Bank Head')}</strong></td>
              <td style="width:100px;">${escHtml(it.accountCode || '—')}</td>
              <td class="td-right td-amt" style="width:110px;">${dr > 0 ? formatNumber(dr) : '—'}</td>
              <td class="td-right td-amt" style="width:110px;">${cr > 0 ? formatNumber(cr) : '—'}</td>
            </tr>
          `;
        });
      } else {
        totDr = vAmount; totCr = vAmount;
        rows = `
          <tr>
            <td class="td-center">1</td>
            <td><strong>From (Credit)</strong></td>
            <td>${escHtml(v.particular1 || 'Cash / Source Bank')}</td>
            <td>—</td>
            <td class="td-right td-amt">—</td>
            <td class="td-right td-amt">${formatNumber(vAmount)}</td>
          </tr>
          <tr>
            <td class="td-center">2</td>
            <td><strong>To (Debit)</strong></td>
            <td>${escHtml(v.particular2 || 'Destination Bank / Cash')}</td>
            <td>—</td>
            <td class="td-right td-amt">${formatNumber(vAmount)}</td>
            <td class="td-right td-amt">—</td>
          </tr>
        `;
      }
      wordsAmount = totDr || vAmount;

      tableHtml = `
        <table class="v-particulars-table">
          <thead>
            <tr>
              <th class="td-center" style="width:35px;">#</th>
              <th style="width:180px;">Transfer Direction</th>
              <th>Account Head / Particulars</th>
              <th style="width:100px;">Account Code</th>
              <th class="td-right" style="width:110px;">Debit (₹)</th>
              <th class="td-right" style="width:110px;">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="td-right" style="font-weight:800; text-transform:uppercase;">Total Contra Transfer:</td>
              <td class="td-right td-amt">${formatCurrency(totDr)}</td>
              <td class="td-right td-amt">${formatCurrency(totCr)}</td>
            </tr>
          </tfoot>
        </table>
      `;

      signatureHtml = `
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Prepared By</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Checked By</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Hon. Secretary</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Hon. Treasurer</div>
        </div>
      `;

    } else if (type === 'Journal') {
      title = 'JOURNAL VOUCHER';
      metaHtml = `
        <div class="v-meta-row"><span class="v-meta-lbl">Voucher No:</span><span class="v-meta-val"><strong>${escHtml(vNo)}</strong></span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Date:</span><span class="v-meta-val">${escHtml(vDate)}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Reference / Doc:</span><span class="v-meta-val">${escHtml(refNo || '—')}</span></div>
        <div class="v-meta-row"><span class="v-meta-lbl">Financial Year:</span><span class="v-meta-val">${escHtml(fyLabel)}</span></div>
      `;

      let rows = '';
      let totDr = 0, totCr = 0;
      if (items.length > 0) {
        items.forEach((it, idx) => {
          const dr = parseFloat(it.debit) || 0;
          const cr = parseFloat(it.credit) || 0;
          totDr += dr; totCr += cr;
          const isCr = cr > 0;
          const prefix = isCr ? '&nbsp;&nbsp;&nbsp;&nbsp;To ' : '';
          rows += `
            <tr>
              <td class="td-center" style="width:35px;">${idx + 1}</td>
              <td>${prefix}<strong>${escHtml(it.accountName || 'Ledger Head')}</strong></td>
              <td style="width:110px;">${escHtml(it.accountCode || '—')}</td>
              <td>${escHtml(it.narration || '')}</td>
              <td class="td-right td-amt" style="width:120px;">${dr > 0 ? formatNumber(dr) : ''}</td>
              <td class="td-right td-amt" style="width:120px;">${cr > 0 ? formatNumber(cr) : ''}</td>
            </tr>
          `;
        });
      } else {
        totDr = vAmount; totCr = vAmount;
        rows = `
          <tr>
            <td class="td-center">1</td>
            <td><strong>${escHtml(v.particular1 || 'Debit Head')}</strong></td>
            <td>—</td>
            <td>${escHtml(vNarr)}</td>
            <td class="td-right td-amt">${formatNumber(vAmount)}</td>
            <td class="td-right td-amt">—</td>
          </tr>
          <tr>
            <td class="td-center">2</td>
            <td>&nbsp;&nbsp;&nbsp;&nbsp;To <strong>${escHtml(v.particular2 || 'Credit Head')}</strong></td>
            <td>—</td>
            <td>—</td>
            <td class="td-right td-amt">—</td>
            <td class="td-right td-amt">${formatNumber(vAmount)}</td>
          </tr>
        `;
      }
      wordsAmount = totDr;

      const diff = Math.abs(Math.round((totDr - totCr) * 100) / 100);
      let balanceStatusHtml = '';
      if (diff < 0.05) {
        balanceStatusHtml = `<span style="color:#16a34a; font-weight:700;"><i class="bi bi-shield-check"></i> Balanced (₹ 0.00 difference)</span>`;
      } else {
        balanceStatusHtml = `<span style="color:#dc2626; font-weight:700;"><i class="bi bi-exclamation-triangle-fill"></i> UNBALANCED ENTRY (Difference: ${formatCurrency(diff)})</span>`;
      }

      tableHtml = `
        <table class="v-particulars-table">
          <thead>
            <tr>
              <th class="td-center" style="width:35px;">#</th>
              <th>Particulars / Ledger Head</th>
              <th style="width:110px;">Account Code</th>
              <th>Description / Sub-narration</th>
              <th class="td-right" style="width:120px;">Debit (₹)</th>
              <th class="td-right" style="width:120px;">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="td-right" style="font-weight:800; text-transform:uppercase;">Totals: &nbsp; [${balanceStatusHtml}]</td>
              <td class="td-right td-amt">${formatCurrency(totDr)}</td>
              <td class="td-right td-amt">${formatCurrency(totCr)}</td>
            </tr>
          </tfoot>
        </table>
      `;

      signatureHtml = `
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Prepared By</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Checked By</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Hon. Secretary</div>
        </div>
        <div class="v-sig-block">
          <div class="v-sig-line"></div>
          <div class="v-sig-title">Hon. Treasurer</div>
        </div>
      `;
    }

    // Assemble the complete voucher sheet
    return `
      <div class="voucher-paper" id="vpaper-${escHtml(vNo)}">
        <div class="voucher-border-frame">
          <!-- Company Letterhead -->
          <div class="v-header-box">
            <div class="v-soc-name">${escHtml(sName)}</div>
            ${sAddress ? `<div class="v-soc-address">${escHtml(sAddress)}${sCity ? ', ' + escHtml(sCity) : ''}${sPin ? ' - ' + escHtml(sPin) : ''}</div>` : ''}
            <div class="v-soc-meta">
              ${sReg ? `<span><strong>Reg. No:</strong> ${escHtml(sReg)}</span>` : ''}
              ${sPan ? `<span><strong>PAN:</strong> ${escHtml(sPan)}</span>` : ''}
              ${sGst ? `<span><strong>GSTIN:</strong> ${escHtml(sGst)}</span>` : ''}
              ${sPhone ? `<span><strong>Phone:</strong> ${escHtml(sPhone)}</span>` : ''}
              ${sEmail ? `<span><strong>Email:</strong> ${escHtml(sEmail)}</span>` : ''}
            </div>
          </div>

          <!-- Title Banner -->
          <div class="v-title-ribbon">
            <div class="v-title-text">${title}</div>
          </div>

          <!-- Metadata Box -->
          <div class="v-meta-grid">
            ${metaHtml}
          </div>

          <!-- Particulars Table -->
          ${tableHtml}

          <!-- Amount in Words -->
          <div class="v-words-box">
            <span class="v-words-lbl">Amount in Words:</span>
            <span class="v-words-val">${escHtml(amountInWords(wordsAmount))}</span>
          </div>

          <!-- Narration Master Box -->
          <div class="v-narr-box">
            <span class="v-narr-lbl">Narration / Remark:</span>
            <span>${escHtml(vNarr)}</span>
          </div>

          <!-- Signature Section -->
          <div class="v-signature-row">
            ${signatureHtml}
          </div>
        </div>
      </div>
    `;
  }

  // ── 6. MODAL PREVIEW CONTROLLER ───────────────────────────────────
  let _previewBackdropEl = null;

  function openPreviewModal(htmlContent, title = 'Voucher Print Preview', onPrintCallback = null) {
    closePreviewModal();

    _previewBackdropEl = document.createElement('div');
    _previewBackdropEl.className = 'vp-modal-backdrop';
    _previewBackdropEl.id = 'voucherPreviewModal';
    _previewBackdropEl.onclick = function (e) {
      if (e.target === _previewBackdropEl) closePreviewModal();
    };

    _previewBackdropEl.innerHTML = `
      <div class="vp-modal-card">
        <div class="vp-modal-header no-print">
          <div class="vp-modal-title">
            <i class="bi bi-file-earmark-text-fill"></i>
            <span>${escHtml(title)}</span>
          </div>
          <div class="vp-modal-actions">
            <button type="button" class="vp-btn vp-btn-primary" id="vpModalPrintBtn">
              <i class="bi bi-printer-fill"></i> Print / Export PDF
            </button>
            <button type="button" class="vp-modal-close-btn" id="vpModalCloseBtn" title="Close Preview">&times;</button>
          </div>
        </div>
        <div class="vp-modal-body">
          <div class="voucher-preview-wrapper" style="display:flex; flex-direction:column; align-items:center; width:100%;">
            ${htmlContent}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(_previewBackdropEl);

    document.getElementById('vpModalCloseBtn').onclick = closePreviewModal;
    document.getElementById('vpModalPrintBtn').onclick = function () {
      if (typeof onPrintCallback === 'function') {
        onPrintCallback();
      } else {
        triggerBrowserPrint(title);
      }
    };

    // Keyboard ESC to close
    const onKey = function (e) {
      if (e.key === 'Escape') {
        closePreviewModal();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  function closePreviewModal() {
    if (_previewBackdropEl) {
      _previewBackdropEl.remove();
      _previewBackdropEl = null;
    }
  }

  // ── 7. BROWSER PRINT ENGINE ───────────────────────────────────────
  function triggerBrowserPrint(printTitle = 'Voucher') {
    const origTitle = document.title;
    const cleanTitle = printTitle.replace(/[^\w\d-_]+/g, '_');
    document.title = cleanTitle;
    window.print();
    setTimeout(() => { document.title = origTitle; }, 1000);
  }

  /**
   * Sets the print container DOM for printing
   */
  function preparePrintArea(htmlContent) {
    let area = document.getElementById('voucherPrintArea');
    if (!area) {
      area = document.createElement('div');
      area.id = 'voucherPrintArea';
      area.className = 'voucher-print-zone';
      document.body.appendChild(area);
    }
    area.innerHTML = htmlContent;
  }

  // ── 8. EXCEL EXPORT HELPER ─────────────────────────────────────────
  function exportGridToExcel(headers, rows, sheetName = 'Voucher Report', fileName = 'Report.xlsx') {
    if (typeof XLSX === 'undefined') {
      alert('Excel export library not loaded. Please try again.');
      return;
    }

    const soc = _cachedSocietyInfo || { societyName: 'HOUSING SOCIETY LTD.' };
    const wb = XLSX.utils.book_new();
    const aoa = [];

    // Letterhead
    aoa.push([soc.societyName.toUpperCase()]);
    aoa.push([sheetName.toUpperCase()]);
    aoa.push([`Generated On: ${formatDate(new Date())}`]);
    aoa.push([]);

    // Headers
    aoa.push(headers);

    // Rows
    rows.forEach(r => aoa.push(r));

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
    XLSX.writeFile(wb, fileName);
  }

  // ── PUBLIC API EXPORTS ────────────────────────────────────────────
  return {
    getActiveSocietyId,
    getActiveFYId,
    getActiveFYLabel,
    escHtml,
    formatCurrency,
    formatNumber,
    formatDate,
    numberToWords,
    amountInWords,
    fetchSocietyInfo,
    initFYDates,
    applyDatePreset,
    renderSingleVoucherHtml,
    openPreviewModal,
    closePreviewModal,
    triggerBrowserPrint,
    preparePrintArea,
    exportGridToExcel
  };

})();
