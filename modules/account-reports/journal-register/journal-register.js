/**
 * journal-register.js — JEEVIKA ERP v2
 * High-Density Statutory Journal Voucher Register
 */

(function () {
  'use strict';

  let allRecords = [];

  function getActiveSocietyId() {
    return (window.Auth && Auth.getSocietyId && Auth.getSocietyId()) ||
           sessionStorage.getItem('activeSocietyId') ||
           localStorage.getItem('activeSocietyId') ||
           '4';
  }

  function getActiveFYId() {
    return (window.Auth && Auth.getFYId && Auth.getFYId()) ||
           sessionStorage.getItem('activeFYId') ||
           localStorage.getItem('activeFYId') ||
           '1';
  }

  function escHtml(str) {
    if (!str) return '';
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

  function formatDate(dStr) {
    if (!dStr) return '—';
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const yr = d.getFullYear();
    return `${day}-${mon}-${yr}`;
  }

  // ── 1. INITIALIZATION & DATES ──────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async () => {
    await fetchSocietyInfo();
    initFYDates();
    await loadAccountsDropdown();
    await loadJournalRegister();
  });

  let currentSocietyInfo = {
    societyName: '',
    registrationNo: '',
    address: '',
    city: '',
    pincode: '',
    email: '',
    phone: ''
  };

  async function fetchSocietyInfo() {
    try {
      const sid = getActiveSocietyId();
      if (window.API && API.get) {
        const res = await API.get(`/societies/${sid}`);
        if (res && res.success && res.data) {
          currentSocietyInfo = { ...currentSocietyInfo, ...res.data };
        } else if (res && res.societyName) {
          currentSocietyInfo = { ...currentSocietyInfo, ...res };
        }
      }
    } catch (e) {
      console.warn('Could not fetch society info for print header', e);
    }

    if (!currentSocietyInfo.societyName || currentSocietyInfo.societyName === '—') {
      currentSocietyInfo.societyName = (window.Auth && Auth.getSocietyName && Auth.getSocietyName() !== '—') 
        ? Auth.getSocietyName() 
        : (sessionStorage.getItem('activeSocietyName') || 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.');
    }
    if (!currentSocietyInfo.registrationNo) {
      currentSocietyInfo.registrationNo = sessionStorage.getItem('activeSocietyRegNo') || 'BOM/WSG/TC/9121/2001-2005 DT. 17.08.2004';
    }
    if (!currentSocietyInfo.address) {
      currentSocietyInfo.address = sessionStorage.getItem('activeSocietyAddress') || 'KHANDELWAL MARG, NEAR USHA NAGAR, BHANDUP(WEST)';
    }
    if (!currentSocietyInfo.city) currentSocietyInfo.city = 'MUMBAI';
    if (!currentSocietyInfo.pincode) currentSocietyInfo.pincode = '400 078';
    if (!currentSocietyInfo.email) currentSocietyInfo.email = 'shreesaiushachsl@gmail.com';
    if (!currentSocietyInfo.phone) currentSocietyInfo.phone = '+91 9987962108';

    const elName = document.getElementById('prtSocName');
    const elSub = document.getElementById('prtSocSub');
    if (elName) elName.textContent = currentSocietyInfo.societyName.toUpperCase();
    if (elSub) elSub.textContent = `Registration No: ${currentSocietyInfo.registrationNo} | City: ${currentSocietyInfo.city}`;
  }

  function initFYDates() {
    const fyLabel = (window.Auth && Auth.getFYLabel && Auth.getFYLabel()) ||
                    sessionStorage.getItem('activeFYLabel') ||
                    '2026-27';

    let startYear = 2026;
    const match = fyLabel.match(/(\d{4})/);
    if (match) startYear = parseInt(match[1], 10);

    const fromDateStr = `${startYear}-04-01`;
    const toDateStr = `${startYear + 1}-03-31`;

    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (fromEl && !fromEl.value) fromEl.value = fromDateStr;
    if (toEl && !toEl.value) toEl.value = toDateStr;
  }

  window.applyDatePreset = function (preset) {
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    if (!fromEl || !toEl) return;

    const fyLabel = (window.Auth && Auth.getFYLabel && Auth.getFYLabel()) ||
                    sessionStorage.getItem('activeFYLabel') || '2026-27';
    let startYear = 2026;
    const match = fyLabel.match(/(\d{4})/);
    if (match) startYear = parseInt(match[1], 10);

    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth(); // 0-indexed

    switch (preset) {
      case 'all':
        fromEl.value = '';
        toEl.value = '';
        break;
      case 'full':
        fromEl.value = `${startYear}-04-01`;
        toEl.value = `${startYear + 1}-03-31`;
        break;
      case 'this-month': {
        const first = new Date(currYear, currMonth, 1);
        const last = new Date(currYear, currMonth + 1, 0);
        fromEl.value = toIsoDate(first);
        toEl.value = toIsoDate(last);
        break;
      }
      case 'last-month': {
        const first = new Date(currYear, currMonth - 1, 1);
        const last = new Date(currYear, currMonth, 0);
        fromEl.value = toIsoDate(first);
        toEl.value = toIsoDate(last);
        break;
      }
      case 'q1':
        fromEl.value = `${startYear}-04-01`;
        toEl.value = `${startYear}-06-30`;
        break;
      case 'q2':
        fromEl.value = `${startYear}-07-01`;
        toEl.value = `${startYear}-09-30`;
        break;
      case 'q3':
        fromEl.value = `${startYear}-10-01`;
        toEl.value = `${startYear}-12-31`;
        break;
      case 'q4':
        fromEl.value = `${startYear + 1}-01-01`;
        toEl.value = `${startYear + 1}-03-31`;
        break;
      case 'custom':
      default:
        break;
    }

    loadJournalRegister();
  };

  function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  window.onDateChange = function () {
    const preset = document.getElementById('datePresetSelect');
    if (preset) preset.value = 'custom';
    loadJournalRegister();
  };

  // ── 2. LOAD ACCOUNTS DROPDOWN ──────────────────────────────────────────────
  async function loadAccountsDropdown() {
    const sel = document.getElementById('accountSelect');
    if (!sel) return;

    try {
      const sid = getActiveSocietyId();
      let accs = [];
      if (typeof fetchMasterAccounts === 'function') {
        accs = await fetchMasterAccounts(sid);
      } else if (typeof getStandardMasterAccounts === 'function') {
        accs = getStandardMasterAccounts();
      }

      if (Array.isArray(accs) && accs.length > 0) {
        let opts = '<option value="all">All Accounts</option>';
        accs.forEach(a => {
          const code = a.accCode || '';
          const name = a.accName || '';
          const label = code ? `[${code}] ${name}` : name;
          opts += `<option value="${escHtml(code || name)}">${escHtml(label)}</option>`;
        });
        sel.innerHTML = opts;
      }
    } catch (e) {
      console.warn('Could not populate accounts dropdown', e);
    }
  }

  // ── 3. FETCH JOURNAL REGISTER ──────────────────────────────────────────────
  window.loadJournalRegister = async function () {
    const societyId = getActiveSocietyId();
    const fyId = getActiveFYId();
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const accFilter = document.getElementById('accountSelect')?.value || 'all';

    const tbody = document.getElementById('regTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-arrow-repeat spin" style="font-size:20px;display:block;margin-bottom:8px;color:#0D47A1;"></i>
            Fetching live Journal Register records...
          </td>
        </tr>
      `;
    }

    let records = [];

    try {
      let url = `/vouchers/register?societyId=${societyId}&type=Journal`;
      if (fromDate) url += `&fromDate=${fromDate}`;
      if (toDate) url += `&toDate=${toDate}`;
      if (accFilter && accFilter !== 'all') url += `&cashBankCode=${encodeURIComponent(accFilter)}`;

      const res = await API.get(url);
      if (res && res.success && Array.isArray(res.data)) {
        records = res.data;
      } else {
        // Fallback to /journal-vouchers if vouchers/register returned 0
        const jUrl = `/journal-vouchers?societyId=${societyId}&fyId=${fyId}`;
        const jRes = await API.get(jUrl);
        if (Array.isArray(jRes)) {
          records = jRes.map(j => ({
            voucherId: j.voucherId || j.journalId || j.id,
            voucherNo: j.voucherNo || j.jvNo,
            voucherDate: j.voucherDate || j.date,
            voucherType: 'Journal',
            amount: j.amount || j.totalAmount,
            narration: j.narration,
            particular1: j.particular1 || j.narration || '',
            particular2: j.particular2 || '',
            refNo: j.refNo || '',
            chqNo: j.chqNo || '',
            chqDate: j.chqDate || null,
            status: j.status || 'Posted',
            items: j.items || []
          }));
        }
      }
    } catch (err) {
      console.error('Journal Register API error:', err);
      if (window.showToast) showToast('Failed to load real-time journal entries.', 'error');
    }

    // Sort by voucherDate ASC, then voucherNo ASC
    records.sort((a, b) => {
      const dComp = (a.voucherDate || '').localeCompare(b.voucherDate || '');
      if (dComp !== 0) return dComp;
      return String(a.voucherNo || '').localeCompare(String(b.voucherNo || ''), undefined, { numeric: true });
    });

    allRecords = records;
    renderRegisterView();
  };

  // Helper: Extract Line 1 and Line 2 narration/particulars
  function getNarrationLines(v) {
    let line1 = (v.particular1 || '').trim();
    let line2 = (v.particular2 || '').trim();

    if (!line1 && v.narration) {
      const parts = v.narration.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      line1 = parts[0] || '';
      if (!line2 && parts.length > 1) {
        line2 = parts.slice(1).join(' ');
      }
    } else if (line1 && !line2 && v.narration) {
      const narr = v.narration.trim();
      if (narr !== line1) {
        line2 = narr;
      }
    } else if (line1 && line2 && v.narration) {
      const narr = v.narration.trim();
      if (narr !== line1 && narr !== line2) {
        line2 += ` (${narr})`;
      }
    }

    if (!line1 && !line2) {
      line1 = 'Journal Voucher';
    }

    return { line1, line2 };
  }

  // ── 4. RENDER REGISTER VIEW ────────────────────────────────────────────────
  window.renderRegisterView = function () {
    const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const accFilter = document.getElementById('accountSelect')?.value || 'all';
    const showCodes = document.getElementById('chk-voucher-no')?.checked ?? true;

    // Filter by query and account
    const filtered = allRecords.filter(v => {
      if (q) {
        const vNo = (v.voucherNo || '').toLowerCase();
        const narr = (v.narration || '').toLowerCase();
        const p1 = (v.particular1 || '').toLowerCase();
        const p2 = (v.particular2 || '').toLowerCase();
        const ref = (v.refNo || '').toLowerCase();
        const chq = (v.chqNo || '').toLowerCase();
        const matchHead = vNo.includes(q) || narr.includes(q) || p1.includes(q) || p2.includes(q) || ref.includes(q) || chq.includes(q);
        let matchLines = false;
        if (Array.isArray(v.items)) {
          matchLines = v.items.some(it => {
            const code = (it.accountCode || '').toLowerCase();
            const name = (it.accountName || '').toLowerCase();
            const itNarr = (it.narration || '').toLowerCase();
            return code.includes(q) || name.includes(q) || itNarr.includes(q);
          });
        }
        if (!matchHead && !matchLines) return false;
      }

      if (accFilter && accFilter !== 'all') {
        const needle = accFilter.toLowerCase();
        let matches = false;
        if (Array.isArray(v.items) && v.items.length > 0) {
          matches = v.items.some(it => {
            const code = (it.accountCode || '').toLowerCase();
            const name = (it.accountName || '').toLowerCase();
            return code.includes(needle) || name.includes(needle);
          });
        }
        if (!matches) return false;
      }

      return true;
    });

    const tbody = document.getElementById('regTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="td-center text-muted" style="padding:40px;">
            <i class="bi bi-inbox" style="font-size:24px;display:block;margin-bottom:8px;color:#94a3b8;"></i>
            No journal voucher records found matching current criteria.
          </td>
        </tr>
      `;
      updateKPIs([], 0, 0);
      return;
    }

    let html = '';
    let totalDebit = 0;
    let totalCredit = 0;

    filtered.forEach(v => {
      const vNo = v.voucherNo || 'JV-????';
      const vDateStr = formatDate(v.voucherDate);
      const vId = v.voucherId || '';
      const items = Array.isArray(v.items) && v.items.length > 0 ? v.items : [];

      let vDrSum = 0;
      let vCrSum = 0;

      // Group line items: debits first, then credits
      const drLines = items.filter(it => (parseFloat(it.debit) || 0) > 0);
      const crLines = items.filter(it => (parseFloat(it.credit) || 0) > 0);

      // If no detail rows, create a row from header amount
      if (drLines.length === 0 && crLines.length === 0) {
        const amt = parseFloat(v.amount) || 0;
        drLines.push({
          accountCode: 'EXP-1001',
          accountName: v.personName || 'Journal Adjustment (Debit)',
          debit: amt,
          credit: 0
        });
        crLines.push({
          accountCode: 'LIA-1008',
          accountName: 'General Adjustment (Credit)',
          debit: 0,
          credit: amt
        });
      }

      const allLines = [...drLines, ...crLines];

      allLines.forEach((line, idx) => {
        const isFirst = idx === 0;
        const isDebit = (parseFloat(line.debit) || 0) > 0;
        const drVal = parseFloat(line.debit) || 0;
        const crVal = parseFloat(line.credit) || 0;

        vDrSum += drVal;
        vCrSum += crVal;
        totalDebit += drVal;
        totalCredit += crVal;

        const codeHtml = (showCodes && line.accountCode)
          ? `<span class="acc-code-pill">[${escHtml(line.accountCode)}]</span>`
          : '';

        const prefix = isDebit
          ? `<span class="acc-dr-label">Dr.</span>`
          : `<span class="acc-cr-label" style="margin-left:14px;">To</span>`;

        let narrBoxHtml = '';
        if (idx === allLines.length - 1) {
          const { line1, line2 } = getNarrationLines(v);
          let metaChips = '';
          if (v.chqNo && v.chqNo !== '-') {
            metaChips += `<span class="reg-chip reg-chip-chq"><i class="bi bi-card-text"></i> Chq: ${escHtml(v.chqNo)}${v.chqDate ? ' (' + formatDate(v.chqDate) + ')' : ''}</span>`;
          }
          if (v.refNo) {
            metaChips += `<span class="reg-chip"><i class="bi bi-hash"></i> Ref: ${escHtml(v.refNo)}</span>`;
          }
          if (line1 || line2 || metaChips) {
            narrBoxHtml = `
              <div class="reg-narr-box">
                ${metaChips ? `<div style="margin-bottom:2px;">${metaChips}</div>` : ''}
                ${line1 ? `<div class="reg-narr-line1">${escHtml(line1)}</div>` : ''}
                ${line2 ? `<div class="reg-narr-line2">${escHtml(line2)}</div>` : ''}
              </div>
            `;
          }
        }

        html += `
          <tr class="${isFirst ? 'reg-voucher-main' : ''}">
            <td class="td-center" style="font-weight:${isFirst ? '700' : 'normal'}; color:${isFirst ? '#0f172a' : 'transparent'};">
              ${isFirst ? escHtml(vDateStr) : ''}
            </td>
            <td class="td-center">
              ${isFirst ? `
                <a class="voucher-pill" onclick="openJournalVoucher('${escHtml(vNo)}', ${vId})" title="Click to view/print voucher">
                  <i class="bi bi-file-earmark-text"></i> ${escHtml(vNo)}
                </a>
              ` : ''}
            </td>
            <td>
              <div>
                ${prefix} ${codeHtml} <strong>${escHtml(line.accountName || '—')}</strong>
              </div>
              ${line.narration ? `<div style="font-size:10px; color:#64748b; margin-left:22px;">— ${escHtml(line.narration)}</div>` : ''}
              ${narrBoxHtml}
            </td>
            <td class="td-amt" style="color:${drVal > 0 ? '#dc2626' : '#94a3b8'};">
              ${drVal > 0 ? drVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </td>
            <td class="td-amt" style="color:${crVal > 0 ? '#16a34a' : '#94a3b8'};">
              ${crVal > 0 ? crVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </td>
          </tr>
        `;
      });
    });

    tbody.innerHTML = html;
    updateKPIs(filtered, totalDebit, totalCredit);

    // Update Footers
    const footDr = document.getElementById('footTotDebit');
    const footCr = document.getElementById('footTotCredit');
    if (footDr) footDr.textContent = formatCurrency(totalDebit);
    if (footCr) footCr.textContent = formatCurrency(totalCredit);

    // Print Header Dates
    const fromEl = document.getElementById('fromDate');
    const toEl = document.getElementById('toDate');
    const prtFrom = document.getElementById('prtFromDate');
    const prtTo = document.getElementById('prtToDate');
    if (prtFrom) prtFrom.textContent = fromEl && fromEl.value ? formatDate(fromEl.value) : 'Start';
    if (prtTo) prtTo.textContent = toEl && toEl.value ? formatDate(toEl.value) : 'Current';
  };

  function updateKPIs(filtered, totalDebit, totalCredit) {
    const kpiCount = document.getElementById('kpiTotalVouchers');
    const kpiDr = document.getElementById('kpiTotalDebit');
    const kpiCr = document.getElementById('kpiTotalCredit');
    const kpiDiff = document.getElementById('kpiDiff');
    const countLabel = document.getElementById('recordCountLabel');
    const balancedBanner = document.getElementById('balancedBanner');
    const diffBanner = document.getElementById('diffBanner');
    const diffAmountLabel = document.getElementById('diffAmountLabel');

    if (kpiCount) kpiCount.textContent = filtered.length;
    if (kpiDr) kpiDr.textContent = formatCurrency(totalDebit);
    if (kpiCr) kpiCr.textContent = formatCurrency(totalCredit);

    const diff = Math.abs(Math.round((totalDebit - totalCredit) * 100) / 100);
    if (kpiDiff) kpiDiff.textContent = formatCurrency(diff);
    if (countLabel) countLabel.textContent = `${filtered.length} Vouchers Displayed`;

    if (diff < 0.05) {
      if (balancedBanner) balancedBanner.style.display = 'flex';
      if (diffBanner) diffBanner.style.display = 'none';
    } else {
      if (balancedBanner) balancedBanner.style.display = 'none';
      if (diffBanner) diffBanner.style.display = 'flex';
      if (diffAmountLabel) diffAmountLabel.textContent = `Diff: ${formatCurrency(diff)}`;
    }
  }

  window.filterTable = function () {
    renderRegisterView();
  };

  // ── Statement Summary Popover Toggle ───────────────────────────────────────
  window.toggleSummaryPopover = function (event) {
    if (event) event.stopPropagation();
    const pop = document.getElementById('summaryPopover');
    const btn = document.getElementById('btnSummaryToggle');
    if (!pop) return;

    const isShown = pop.classList.contains('show');
    if (isShown) {
      pop.classList.remove('show');
      if (btn) btn.classList.remove('active');
    } else {
      pop.classList.add('show');
      if (btn) btn.classList.add('active');
    }
  };

  // Close summary popover when clicking anywhere outside
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('summaryPopover');
    const btn = document.getElementById('btnSummaryToggle');
    if (pop && pop.classList.contains('show')) {
      if (!pop.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
        pop.classList.remove('show');
        if (btn) btn.classList.remove('active');
      }
    }
  });

  // ── 5. DIRECT PRINT ENGINES (CURRENT FORMAT & CONTINUOUS) ─────────────────

  // Option 1: Print standard Journal Register (Current format visible on screen)
  window.printRegister = function () {
    document.body.classList.remove('print-voucher-mode');
    document.body.classList.add('print-register-mode');

    fetchSocietyInfo();

    const socName = (currentSocietyInfo.societyName || 'Society').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const origTitle = document.title;
    document.title = `${socName}_Journal_Register_${fromDate}_${toDate}`;

    window.print();

    const resetTitle = () => {
      document.title = origTitle;
      document.body.classList.remove('print-register-mode');
      window.removeEventListener('afterprint', resetTitle);
    };
    window.addEventListener('afterprint', resetTitle);
    setTimeout(resetTitle, 2000);
  };

  // Option 2: Print Continuous (No duplicates; exactly 2 distinct journal vouchers per single A4 page)
  window.printVouchersContinuous = async function (singleVoucherNo) {
    await fetchSocietyInfo();

    let vouchersToPrint = [];
    if (singleVoucherNo) {
      const v = allRecords.find(x => String(x.voucherNo) === String(singleVoucherNo));
      if (v) vouchersToPrint = [v];
    } else {
      vouchersToPrint = [...allRecords];
      const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
      const accFilter = document.getElementById('accountSelect')?.value || 'all';
      if (q || (accFilter && accFilter !== 'all')) {
        vouchersToPrint = allRecords.filter(v => {
          if (q) {
            const vNo = (v.voucherNo || '').toLowerCase();
            const narr = (v.narration || '').toLowerCase();
            const ref = (v.refNo || '').toLowerCase();
            let matchText = vNo.includes(q) || narr.includes(q) || ref.includes(q);
            if (!matchText && Array.isArray(v.items)) {
              matchText = v.items.some(it => {
                const c = (it.accountCode || '').toLowerCase();
                const n = (it.accountName || '').toLowerCase();
                return c.includes(q) || n.includes(q);
              });
            }
            if (!matchText) return false;
          }
          if (accFilter && accFilter !== 'all') {
            const needle = accFilter.toLowerCase();
            if (Array.isArray(v.items)) {
              const hasAcc = v.items.some(it => {
                const c = (it.accountCode || '').toLowerCase();
                const n = (it.accountName || '').toLowerCase();
                return c.includes(needle) || n.includes(needle);
              });
              if (!hasAcc) return false;
            }
          }
          return true;
        });
      }
    }

    if (vouchersToPrint.length === 0) {
      alert('No journal vouchers found to print.');
      return;
    }

    const printArea = document.getElementById('voucherPrintArea');
    if (!printArea) return;

    let sheetsHtml = '';
    for (let i = 0; i < vouchersToPrint.length; i += 2) {
      const v1 = vouchersToPrint[i];
      const v2 = (i + 1 < vouchersToPrint.length) ? vouchersToPrint[i + 1] : null;

      sheetsHtml += `
        <div class="voucher-sheet">
          <!-- Top: Journal Voucher 1 -->
          ${buildJournalVoucherCardHtml(v1)}

          <!-- Cut Line Divider -->
          <div class="voucher-cut-line">
            ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          </div>

          <!-- Bottom: Journal Voucher 2 (or placeholder if odd total) -->
          ${v2 ? buildJournalVoucherCardHtml(v2) : '<div class="voucher-card-placeholder" style="height:130mm; visibility:hidden;"></div>'}
        </div>
      `;
    }

    printArea.innerHTML = sheetsHtml;

    document.body.classList.remove('print-register-mode');
    document.body.classList.add('print-voucher-mode');

    const cleanSoc = (currentSocietyInfo.societyName || 'Society').replace(/[^a-zA-Z0-9_-]/g, '_');
    const origTitle = document.title;
    document.title = `${cleanSoc}_Journal_Vouchers_Continuous`;

    window.print();

    const cleanup = () => {
      document.title = origTitle;
      document.body.classList.remove('print-voucher-mode');
      printArea.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 2000);
  };

  // Helper: Print a single journal voucher
  window.printSingleVoucher = function (voucherNo) {
    printVouchersContinuous(voucherNo);
  };

  // Build Individual Journal Voucher Card (Faithful to Image 2 layout, 130mm height)
  function buildJournalVoucherCardHtml(v) {
    const sName = (currentSocietyInfo.societyName || 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.').trim();
    const regNo = (currentSocietyInfo.registrationNo || 'BOM/WSG/TC/9121/2001-2005 DT. 17.08.2004').trim();
    const addr = currentSocietyInfo.address || 'KHANDELWAL MARG, NEAR USHA NAGAR, BHANDUP(WEST)';
    const city = currentSocietyInfo.city || 'MUMBAI';
    const pin = currentSocietyInfo.pincode || '400 078';
    const email = currentSocietyInfo.email || 'shreesaiushachsl@gmail.com';
    const phone = currentSocietyInfo.phone || '+91 9987962108';

    let fullAddr = addr;
    if (city && !fullAddr.toUpperCase().includes(city.toUpperCase())) fullAddr += ', ' + city;
    if (pin && !fullAddr.includes(pin)) fullAddr += ' - ' + pin;

    const contactLine = `email Id: ${email} , Tel No.: ${phone}`;

    const vNo = v.voucherNo || '—';
    const vDateStr = formatDate(v.voucherDate);
    const items = Array.isArray(v.items) && v.items.length > 0 ? v.items : [];

    let totDebit = 0;
    let totCredit = 0;
    const itemRowsHtml = items.map(it => {
      const dAmt = parseFloat(it.debit || it.dr) || 0;
      const cAmt = parseFloat(it.credit || it.cr) || 0;
      totDebit += dAmt;
      totCredit += cAmt;
      const prefix = dAmt > 0 ? 'To' : 'By';
      return `
        <tr>
          <td class="td-part">${prefix} ${escHtml(it.accountName || 'Head')}</td>
          <td class="td-amt">${dAmt > 0 ? dAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
          <td class="td-amt">${cAmt > 0 ? cAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        </tr>
      `;
    }).join('');

    const balancedTotal = Math.max(totDebit, totCredit, parseFloat(v.amount) || 0);
    const words = convertToIndianWords(balancedTotal);
    const narrText = v.narration || (v.particular1 ? (v.particular1 + (v.particular2 ? ' ' + v.particular2 : '')) : 'BEING JOURNAL ADJUSTMENT RECORDED');

    return `
      <div class="voucher-card">
        <div class="vcard-header">
          <div class="vcard-title">Journal Voucher</div>
          <div class="vcard-soc-name">${escHtml(sName)}</div>
          <div class="vcard-soc-reg">Registration No.: ${escHtml(regNo)}</div>
          <div class="vcard-soc-addr">Address: ${escHtml(fullAddr)}.</div>
          <div class="vcard-soc-contact">${escHtml(contactLine)}</div>
        </div>

        <div class="vcard-hr"></div>

        <div class="vcard-meta-row">
          <div class="vcard-meta-left">
            Voucher No. : &nbsp;&nbsp;<strong>${escHtml(vNo)}</strong>
          </div>
          <div class="vcard-meta-right">
            Date : &nbsp;&nbsp;<strong>${escHtml(vDateStr)}</strong>
          </div>
        </div>

        <div class="vcard-meta-row" style="margin-top:1px;">
          <div class="vcard-meta-left">
            ${v.refNo ? `Reference / Doc No. : &nbsp;&nbsp;<strong>${escHtml(v.refNo)}</strong>` : 'Type : &nbsp;&nbsp;<strong>General Journal Entry</strong>'}
          </div>
          <div class="vcard-meta-right">
            Status : &nbsp;&nbsp;<strong>Balanced</strong>
          </div>
        </div>

        <div class="vcard-hr"></div>

        <div class="vcard-body-table-wrap">
          <table class="vcard-table">
            <thead>
              <tr>
                <th class="th-part">Account Head &amp; Particulars</th>
                <th class="th-amt">Debit (₹)</th>
                <th class="th-amt">Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHtml}
            </tbody>
          </table>

          <div class="vcard-total-row">
            <div class="vcard-words">${escHtml(words)}</div>
            <div class="vcard-total-box">
              <span class="vcard-total-num">Total: ₹ ${balancedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div class="vcard-hr"></div>

        <div class="vcard-footer-grid">
          <div class="vcard-footer-left">
            <div class="vcard-narr-text">Narration: ${escHtml(narrText)}</div>
          </div>
          <div class="vcard-footer-right">
            <div class="vcard-receiver-box"></div>
            <div class="vcard-receiver-lbl">Checked &amp; Passed</div>
          </div>
        </div>

        <div class="vcard-sign-row">
          <span class="vcard-sign-col">Prepared By</span>
          <span class="vcard-sign-col">Checked By</span>
          <span class="vcard-sign-col">Hon. Secretary</span>
          <span class="vcard-sign-col" style="text-align:right;">Treasurer / Chairman</span>
        </div>
      </div>
    `;
  }

  // Convert numbers to Indian Rupees words
  function convertToIndianWords(amt) {
    if (typeof window.amountInWords === 'function') {
      try {
        const res = window.amountInWords(amt);
        if (res && res !== 'Rupees Zero Only') return res;
      } catch (e) {}
    }

    const num = Math.round(parseFloat(amt) || 0);
    if (num === 0) return 'Rupees Zero Only';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function numToWords(n) {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
    }

    let words = '';
    let n = num;
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    const rest = n;

    if (crore) words += numToWords(crore) + ' Crore ';
    if (lakh) words += numToWords(lakh) + ' Lakh ';
    if (thousand) words += numToWords(thousand) + ' Thousand ';
    if (rest) words += numToWords(rest);

    return 'Rupees ' + words.trim() + ' Only';
  }

  // ── 6. VIEW JOURNAL VOUCHER DETAILS MODAL ────────────────────────────────
  window.viewVoucherDetails = function (voucherNo) {
    const v = allRecords.find(x => String(x.voucherNo) === String(voucherNo));
    if (!v) return;

    const items = Array.isArray(v.items) && v.items.length > 0 ? v.items : [];
    let totDebit = 0;
    let totCredit = 0;

    const itemRows = items.map(i => {
      const dAmt = parseFloat(i.debit || i.dr) || 0;
      const cAmt = parseFloat(i.credit || i.cr) || 0;
      totDebit += dAmt;
      totCredit += cAmt;
      return `
        <tr>
          <td style="font-family:monospace;font-weight:700;">${escHtml(i.accountCode || '—')}</td>
          <td>${escHtml(i.accountName || '—')}</td>
          <td style="text-align:right;font-family:monospace;color:#dc2626;font-weight:700;">${dAmt > 0 ? '₹ ' + dAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
          <td style="text-align:right;font-family:monospace;color:#16a34a;font-weight:700;">${cAmt > 0 ? '₹ ' + cAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
        </tr>
      `;
    }).join('');

    const modalHtml = `
      <div id="vDetailModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
        <div style="background:#ffffff;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.2);width:90%;max-width:650px;overflow:hidden;border:1px solid #cbd5e1;">
          <div style="background:#0D47A1;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:13px;font-weight:700;">
              <i class="bi bi-journal-text"></i> Journal Voucher Details: #${escHtml(v.voucherNo)}
            </div>
            <button onclick="document.getElementById('vDetailModalBackdrop').remove()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">&times;</button>
          </div>
          <div style="padding:16px;max-height:80vh;overflow:auto;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px;background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:12px;">
              <div><strong>Voucher Date:</strong> ${formatDate(v.voucherDate)}</div>
              <div><strong>Total Balanced Amount:</strong> <span style="font-weight:800;color:#0D47A1;">₹ ${totDebit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
              ${v.refNo ? `<div><strong>Reference / Bill:</strong> ${escHtml(v.refNo)}</div>` : ''}
              <div><strong>Type:</strong> General Journal Entry</div>
            </div>

            <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;" border="1" bordercolor="#e2e8f0">
              <thead style="background:#f1f5f9;color:#334155;">
                <tr>
                  <th style="padding:6px;text-align:left;">Code</th>
                  <th style="padding:6px;text-align:left;">Account Head</th>
                  <th style="padding:6px;text-align:right;">Debit (₹)</th>
                  <th style="padding:6px;text-align:right;">Credit (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
              <tfoot style="background:#f8fafc;font-weight:700;">
                <tr>
                  <td colspan="2" style="padding:6px;text-align:right;">TOTAL:</td>
                  <td style="padding:6px;text-align:right;color:#dc2626;">₹ ${totDebit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style="padding:6px;text-align:right;color:#16a34a;">₹ ${totCredit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>

            ${v.narration ? `
              <div style="font-size:11px;background:#f8fafc;padding:8px 12px;border-left:3px solid #0D47A1;border-radius:4px;color:#475569;">
                <strong>Narration:</strong><br>
                ${escHtml(v.narration)}
              </div>
            ` : ''}
          </div>
          <div style="background:#f8fafc;padding:10px 16px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #e2e8f0;">
            <button onclick="document.getElementById('vDetailModalBackdrop').remove()" class="reg-btn">Close</button>
            <button onclick="document.getElementById('vDetailModalBackdrop').remove(); printSingleVoucher('${escHtml(v.voucherNo)}');" class="reg-btn reg-btn-primary"><i class="bi bi-printer"></i> Print Voucher</button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div.firstElementChild);
  };

  // Compatibility hook for voucher clicks
  window.openJournalVoucher = function (vNo, vId) {
    viewVoucherDetails(vNo);
  };

  // ── 7. EXPORT TO EXCEL (.XLSX) ─────────────────────────────────────────────
  window.exportToExcel = function () {
    if (typeof XLSX === 'undefined') {
      alert('Excel export library not loaded. Please ensure an active internet connection or try again.');
      return;
    }

    const socName = (currentSocietyInfo && (currentSocietyInfo.societyName || currentSocietyInfo.name)) || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';

    const wb = XLSX.utils.book_new();
    const rows = [];

    // Header Metadata
    rows.push([socName.toUpperCase()]);
    rows.push([`JOURNAL VOUCHER REGISTER`]);
    rows.push([`Period: ${fromDate ? formatDate(fromDate) : 'Start'} to ${toDate ? formatDate(toDate) : 'End'}`]);
    rows.push([]);

    // Table Column Headers
    rows.push(['Date', 'Voucher No.', 'Type', 'Account Code', 'Account Name', 'Debit (₹)', 'Credit (₹)', 'Narration']);

    let totDr = 0;
    let totCr = 0;

    allRecords.forEach(v => {
      const vDate = formatDate(v.voucherDate);
      const vNo = v.voucherNo || '';
      const vNarr = v.narration || '';
      const items = Array.isArray(v.items) ? v.items : [];

      items.forEach(it => {
        const dr = parseFloat(it.debit) || 0;
        const cr = parseFloat(it.credit) || 0;
        totDr += dr;
        totCr += cr;

        rows.push([
          vDate,
          vNo,
          dr > 0 ? 'Debit' : 'Credit',
          it.accountCode || '',
          it.accountName || '',
          dr > 0 ? dr : '',
          cr > 0 ? cr : '',
          it.narration || vNarr
        ]);
      });
    });

    // Grand Totals
    rows.push([]);
    rows.push(['', '', '', '', 'TOTAL', totDr, totCr, '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set Column Widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 18 }, // Voucher No
      { wch: 10 }, // Type
      { wch: 12 }, // Code
      { wch: 32 }, // Account Name
      { wch: 15 }, // Debit
      { wch: 15 }, // Credit
      { wch: 35 }  // Narration
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Journal Register');

    const fileName = `Journal_Register_${fromDate || 'All'}_to_${toDate || 'All'}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

})();
