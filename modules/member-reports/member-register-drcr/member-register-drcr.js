// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MEMBER REGISTER [Dr/Cr]
// Dual Print Format Engine (Compact vs Detailed Break-Up)
// 100% Dynamic DB Driven — Zero Hardcoding
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  var reportData = null;
  var selectedPrintOption = 'compact'; // 'compact' or 'breakup'

  function getActiveSocietyId() {
    var id = (window.Auth && Auth.getSocietyId && Auth.getSocietyId()) ||
             (window.parent && window.parent.Auth && window.parent.Auth.getSocietyId && window.parent.Auth.getSocietyId()) ||
             sessionStorage.getItem('activeSocietyId') ||
             localStorage.getItem('activeSocietyId') ||
             (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeSocietyId')) ||
             (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeSocietyId')) ||
             '';
    if (!id || id === 'undefined' || id === 'null' || isNaN(parseInt(id, 10))) return '';
    return String(parseInt(id, 10));
  }

  function getFyId() {
    var id = (window.Auth && Auth.getFYId && Auth.getFYId()) ||
             (window.parent && window.parent.Auth && window.parent.Auth.getFYId && window.parent.Auth.getFYId()) ||
             sessionStorage.getItem('activeFYId') ||
             localStorage.getItem('activeFYId') ||
             (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeFYId')) ||
             (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeFYId')) ||
             '';
    if (!id || id === 'undefined' || id === 'null' || isNaN(parseInt(id, 10))) return '';
    return String(parseInt(id, 10));
  }

  function formatMoney(num) {
    if (num === null || num === undefined || num === 0) return '—';
    var val = parseFloat(num) || 0;
    if (val === 0) return '—';
    return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDateDDMMYYYY(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      var day = String(d.getDate()).padStart(2, '0');
      var month = String(d.getMonth() + 1).padStart(2, '0');
      var year = d.getFullYear();
      return day + '/' + month + '/' + year;
    } catch (e) {
      return dateStr;
    }
  }

  function formatDateDDMMM(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var day = String(d.getDate()).padStart(2, '0');
      var month = months[d.getMonth()];
      var year = d.getFullYear();
      return day + '-' + month + '-' + year;
    } catch (e) {
      return dateStr;
    }
  }

  // ── 1. POPULATE MASTER DROPDOWNS ──────────────────────────────────
  async function loadMasters() {
    var sid = getActiveSocietyId();

    // Load Bill Types
    try {
      var btRes = await API.get('/api/bill-types?societyId=' + sid);
      var btSel = document.getElementById('flt-bill-type');
      if (btSel && btRes) {
        var list = Array.isArray(btRes) ? btRes : (btRes.data || []);
        list.forEach(function (bt) {
          var opt = document.createElement('option');
          opt.value = bt.billTypeId || bt.billtypeid;
          opt.textContent = bt.billTypeName || bt.billtypename || 'Bill Type';
          btSel.appendChild(opt);
        });
      }
    } catch (e) {}

    // Load Members
    try {
      var memRes = await API.get('/api/members?societyId=' + sid);
      var fromSel = document.getElementById('flt-from-mem');
      var toSel = document.getElementById('flt-to-mem');
      var indSel = document.getElementById('flt-ind-mem');

      var mList = Array.isArray(memRes) ? memRes : (memRes.data || []);
      mList.sort(function (a, b) { return (a.flatNo || '').localeCompare(b.flatNo || ''); });

      mList.forEach(function (m) {
        var code = m.memCode || m.memcode || m.flatNo;
        var label = '[' + (m.flatNo || code) + '] ' + (m.memName || m.memname);

        [fromSel, toSel, indSel].forEach(function (sel) {
          if (sel) {
            var opt = document.createElement('option');
            opt.value = code;
            opt.textContent = label;
            sel.appendChild(opt);
          }
        });
      });
    } catch (e) {}
  }

  window.onFromMemberChange = function () {
    var fromVal = document.getElementById('flt-from-mem').value;
    var toSel = document.getElementById('flt-to-mem');
    var indSel = document.getElementById('flt-ind-mem');
    if (indSel) indSel.value = '';
    if (fromVal && toSel && !toSel.value) {
      toSel.value = fromVal;
    }
    loadMemberRegister();
  };

  window.onToMemberChange = function () {
    var indSel = document.getElementById('flt-ind-mem');
    if (indSel) indSel.value = '';
    loadMemberRegister();
  };

  window.onIndividualMemberChange = function () {
    var indVal = document.getElementById('flt-ind-mem').value;
    if (indVal) {
      if (document.getElementById('flt-from-mem')) document.getElementById('flt-from-mem').value = '';
      if (document.getElementById('flt-to-mem')) document.getElementById('flt-to-mem').value = '';
    }
    loadMemberRegister();
  };

  window.resetFilters = function () {
    if (document.getElementById('flt-from-mem')) document.getElementById('flt-from-mem').value = '';
    if (document.getElementById('flt-to-mem')) document.getElementById('flt-to-mem').value = '';
    if (document.getElementById('flt-ind-mem')) document.getElementById('flt-ind-mem').value = '';
    if (document.getElementById('flt-bill-type')) document.getElementById('flt-bill-type').value = '';
    if (document.getElementById('flt-from-date')) document.getElementById('flt-from-date').value = '';
    if (document.getElementById('flt-to-date')) document.getElementById('flt-to-date').value = '';
    loadMemberRegister();
  };

  // ── 2. LOAD MEMBER REGISTER DATA ──────────────────────────────────
  async function loadMemberRegister() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var btId = document.getElementById('flt-bill-type') ? document.getElementById('flt-bill-type').value : '';
    var fromMem = document.getElementById('flt-from-mem') ? document.getElementById('flt-from-mem').value : '';
    var toMem = document.getElementById('flt-to-mem') ? document.getElementById('flt-to-mem').value : '';
    var indMem = document.getElementById('flt-ind-mem') ? document.getElementById('flt-ind-mem').value : '';
    var fromDate = document.getElementById('flt-from-date') ? document.getElementById('flt-from-date').value : '';
    var toDate = document.getElementById('flt-to-date') ? document.getElementById('flt-to-date').value : '';

    var container = document.getElementById('mreg-cards-container');
    if (container) container.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b; font-weight:700;"><i class="bi bi-arrow-repeat spin"></i> Loading Member Register [Dr/Cr]...</div>';

    var params = [];
    if (sid) params.push('societyId=' + encodeURIComponent(sid));
    if (fyid) params.push('fyId=' + encodeURIComponent(fyid));
    if (btId) params.push('billTypeId=' + encodeURIComponent(btId));
    if (indMem) {
      params.push('individualMemberCode=' + encodeURIComponent(indMem));
    } else if (fromMem && toMem && fromMem === toMem) {
      params.push('individualMemberCode=' + encodeURIComponent(fromMem));
    } else {
      if (fromMem) params.push('fromMemberCode=' + encodeURIComponent(fromMem));
      if (toMem) params.push('toMemberCode=' + encodeURIComponent(toMem));
    }
    if (fromDate) params.push('fromDate=' + encodeURIComponent(fromDate));
    if (toDate) params.push('toDate=' + encodeURIComponent(toDate));

    var query = '/api/reports/member-drcr-register' + (params.length > 0 ? ('?' + params.join('&')) : '');

    try {
      var res = await API.get(query);
      if (res && res.success) {
        reportData = res;

        // Auto populate date inputs if blank
        if (res.startDate && document.getElementById('flt-from-date') && !document.getElementById('flt-from-date').value) {
          document.getElementById('flt-from-date').value = res.startDate;
        }
        if (res.endDate && document.getElementById('flt-to-date') && !document.getElementById('flt-to-date').value) {
          document.getElementById('flt-to-date').value = res.endDate;
        }

        var curFrom = document.getElementById('flt-from-date') ? document.getElementById('flt-from-date').value : res.startDate;
        var curTo = document.getElementById('flt-to-date') ? document.getElementById('flt-to-date').value : res.endDate;

        var sublineEl = document.getElementById('mregDateSubline');
        if (sublineEl && curFrom && curTo) {
          sublineEl.textContent = 'MEMBER ACCOUNT FROM ' + formatDateDDMMM(curFrom).toUpperCase() + ' TO ' + formatDateDDMMM(curTo).toUpperCase();
        }

        var socNameEl = document.getElementById('mregSocName');
        if (socNameEl && res.societyName) socNameEl.textContent = res.societyName;

        var fyLabelEl = document.getElementById('mregFyLabel');
        if (fyLabelEl && res.fyLabel) fyLabelEl.textContent = res.fyLabel;

        // Print Headers
        var prtSocName = document.getElementById('prtSocName');
        if (prtSocName && res.societyName) prtSocName.textContent = res.societyName;

        var prtSubtitle = document.getElementById('prtSubtitle');
        if (prtSubtitle && curFrom && curTo) prtSubtitle.textContent = 'Member Account from ' + formatDateDDMMYYYY(curFrom) + ' to ' + formatDateDDMMYYYY(curTo);

        var prtFyLabel = document.getElementById('prtFyLabel');
        if (prtFyLabel && curFrom && curTo) prtFyLabel.textContent = 'F.Y. : ' + formatDateDDMMYYYY(curFrom) + '-' + formatDateDDMMYYYY(curTo);

        renderReportUI(res);
        renderReportPrint(res, selectedPrintOption);
      } else {
        if (container) container.innerHTML = '<div style="text-align:center; padding:30px; color:#c62828; font-weight:700;">Failed to load report data.</div>';
      }
    } catch (e) {
      console.error('Member Register Load Error:', e);
      if (container) container.innerHTML = '<div style="text-align:center; padding:30px; color:#c62828; font-weight:700;">Error: ' + (e.message || 'Server error') + '</div>';
    }
  }

  window.toggleAccumulateColumns = function (checked) {
    var slider = document.getElementById('toggle-slider-btn');
    var knob = slider ? slider.querySelector('.toggle-knob') : null;
    var lbl = document.getElementById('lbl-accumulate-status');
    if (checked) {
      if (slider) slider.style.background = '#2563eb';
      if (knob) knob.style.transform = 'translateX(20px)';
      if (lbl) { lbl.textContent = 'ON'; lbl.style.color = '#2563eb'; }
    } else {
      if (slider) slider.style.background = '#cbd5e1';
      if (knob) knob.style.transform = 'translateX(0)';
      if (lbl) { lbl.textContent = 'OFF'; lbl.style.color = '#64748b'; }
    }
    if (reportData) {
      renderReportUI(reportData);
    }
  };

  // ── 3A. RENDER WORKSPACE UI SCREEN VIEW ───────────────────────────
  function renderReportUI(data) {
    var container = document.getElementById('mreg-cards-container');
    if (!container) return;

    var ledgers = data.memberRegisters || [];

    if (ledgers.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b; font-weight:700;">No Member Records Found.</div>';
      return;
    }

    var isAccumulate = document.getElementById('chk-accumulate') ? document.getElementById('chk-accumulate').checked : false;
    var html = '';

    ledgers.forEach(function (m) {
      var info = m.memberInfo || {};
      var op = m.openingBalance || {};
      var txs = m.transactions || [];
      var cl = m.closingBalance || {};

      var bTypeTitle = (m.billTypeName || data.billTypeName || 'MAINTENANCE').trim().toUpperCase();
      if (bTypeTitle.startsWith('--') || bTypeTitle === 'BILL TYPE') bTypeTitle = 'ACCOUNT';

      var fullMemTitle = (info.memberName || 'MEMBER') +
        (info.contactNo ? (' (' + info.contactNo + ')') : '') +
        ' (' + (info.flatNo || info.memberCode || '') + ') - ' + bTypeTitle + ' LEDGER';

      html += '<div class="member-card-ui">';
      html += '  <div class="member-card-title-ui">';
      html += '    <span><i class="bi bi-circle-fill" style="font-size:8px; color:#1d4ed8; margin-right:6px;"></i>' + fullMemTitle + '</span>';
      html += '    <span>' + (info.areaSqFt ? info.areaSqFt : '0') + '</span>';
      html += '  </div>';
      html += '  <div class="table-wrap-ui">';
      html += '    <table class="mreg-table-ui" style="min-width:' + (isAccumulate ? '1450px' : '1100px') + ';">';
      html += '      <thead><tr>';
      html += '        <th style="width:90px;">DATE</th>';
      html += '        <th style="width:130px;">TYPE-NO</th>';
      html += '        <th style="width:160px;">PERIOD / PARTICULARS</th>';
      html += '        <th style="width:100px; text-align:right;">PRINCIPAL</th>';
      html += '        <th style="width:100px; text-align:right;">INTEREST</th>';
      html += '        <th style="width:110px; text-align:right;">DEBIT</th>';
      html += '        <th style="width:110px; text-align:right;">CREDIT</th>';
      html += '        <th style="width:120px; text-align:right;">BALANCE</th>';
      if (isAccumulate) {
        html += '        <th style="width:140px; text-align:right; background:#0f172a; color:#38bdf8;">ACCUMULATED PRINCIPAL</th>';
        html += '        <th style="width:140px; text-align:right; background:#0f172a; color:#fbbf24;">ACCUMULATED INTEREST</th>';
      }
      html += '      </tr></thead>';
      html += '      <tbody>';

      var curAccPrinc = parseFloat(op.principal) || 0;
      var curAccInt = parseFloat(op.interest) || 0;

      // Opening Balance Row
      html += '      <tr>';
      html += '        <td class="col-center">—</td>';
      html += '        <td colspan="2" style="font-weight:700; color:#475569;">Opening Balance .........</td>';
      html += '        <td class="col-right">' + (op.principal > 0 ? formatMoney(op.principal) : '—') + '</td>';
      html += '        <td class="col-right">' + (op.interest > 0 ? formatMoney(op.interest) : '—') + '</td>';
      html += '        <td class="col-right">—</td>';
      html += '        <td class="col-right">—</td>';
      html += '        <td class="col-right bold-num">' + formatMoney(op.totalOpening) + '</td>';
      if (isAccumulate) {
        html += '        <td class="col-right bold-num" style="background:#f8fafc; color:#0284c7;">' + formatMoney(curAccPrinc) + '</td>';
        html += '        <td class="col-right bold-num" style="background:#f8fafc; color:#d97706;">' + formatMoney(curAccInt) + '</td>';
      }
      html += '      </tr>';

      // Transactions Rows
      txs.forEach(function (t) {
        var drAmt = parseFloat(t.totalDebit) || 0;
        var crAmt = parseFloat(t.totalCredit) || 0;
        var princAmt = parseFloat(t.principalAmount) || 0;
        var intAmt = parseFloat(t.interestAmount) || 0;

        if (drAmt > 0) {
          if (princAmt > 0 || intAmt > 0) {
            curAccPrinc += princAmt;
            curAccInt += intAmt;
          } else {
            curAccPrinc += drAmt;
          }
        }

        if (crAmt > 0) {
          var remCredit = crAmt;
          if (curAccInt > 0) {
            if (remCredit <= curAccInt) {
              curAccInt -= remCredit;
              remCredit = 0;
            } else {
              remCredit -= curAccInt;
              curAccInt = 0;
              curAccPrinc -= remCredit;
            }
          } else {
            curAccPrinc -= remCredit;
          }
        }

        if (t.runningBalance <= 0) {
          curAccPrinc = 0;
          curAccInt = 0;
        } else {
          curAccPrinc = Math.max(0, curAccPrinc);
          curAccInt = Math.max(0, curAccInt);
        }

        html += '      <tr>';
        html += '        <td class="col-center">' + formatDateDDMMYYYY(t.voucherDate) + '</td>';
        html += '        <td class="text-blue">' + (t.voucherNo || '') + '</td>';
        html += '        <td>' + (t.period || '') + '</td>';
        html += '        <td class="col-right">' + (princAmt > 0 ? formatMoney(princAmt) : '—') + '</td>';
        html += '        <td class="col-right">' + (intAmt > 0 ? formatMoney(intAmt) : '—') + '</td>';
        html += '        <td class="col-right text-red">' + (drAmt > 0 ? formatMoney(drAmt) : '—') + '</td>';
        html += '        <td class="col-right text-green">' + (crAmt > 0 ? formatMoney(crAmt) : '—') + '</td>';
        html += '        <td class="col-right bold-num">' + formatMoney(t.runningBalance) + '</td>';
        if (isAccumulate) {
          html += '        <td class="col-right bold-num" style="color:#0284c7;">' + formatMoney(curAccPrinc) + '</td>';
          html += '        <td class="col-right bold-num" style="color:#d97706;">' + formatMoney(curAccInt) + '</td>';
        }
        html += '      </tr>';
      });

      // Closing Balance Summary Row
      var uiPrinc = (cl.netClosingBalance > 0 && cl.totalPrincipal > 0) ? formatMoney(cl.totalPrincipal) : '0.00';
      var uiInt = (cl.netClosingBalance > 0 && cl.totalInterest > 0) ? formatMoney(cl.totalInterest) : '0.00';

      html += '      <tr class="row-closing-ui">';
      html += '        <td class="col-center">—</td>';
      html += '        <td colspan="2" style="font-weight:800; color:#0F172A; text-transform:uppercase;">CLOSING BALANCE .........</td>';
      html += '        <td class="col-right bold-num">' + uiPrinc + '</td>';
      html += '        <td class="col-right bold-num">' + uiInt + '</td>';
      html += '        <td class="col-right text-red">' + (cl.grandTotalDebit > 0 ? formatMoney(cl.grandTotalDebit) : '0.00') + '</td>';
      html += '        <td class="col-right text-green">' + (cl.grandTotalCredit > 0 ? formatMoney(cl.grandTotalCredit) : '0.00') + '</td>';
      html += '        <td class="col-right bold-num" style="font-size:11px; color:#0D47A1;">' + formatMoney(cl.netClosingBalance) + '</td>';
      if (isAccumulate) {
        var accClPrinc = cl.netClosingBalance > 0 ? curAccPrinc : 0;
        var accClInt = cl.netClosingBalance > 0 ? curAccInt : 0;
        html += '        <td class="col-right bold-num" style="font-size:11px; color:#0369a1; background:#f1f5f9;">' + formatMoney(accClPrinc) + '</td>';
        html += '        <td class="col-right bold-num" style="font-size:11px; color:#b45309; background:#f1f5f9;">' + formatMoney(accClInt) + '</td>';
      }
      html += '      </tr>';

      html += '      </tbody></table></div></div>';
    });

    container.innerHTML = html;
  }

  // ── 3B. RENDER PRINT VIEW ENGINE (MATCHES IMAGE 2 & IMAGE 3) ──────
  function renderReportPrint(data, formatOption) {
    var container = document.getElementById('mreg-print-container');
    if (!container) return;

    var ledgers = data.memberRegisters || [];

    if (ledgers.length === 0) {
      container.innerHTML = '';
      return;
    }

    var isBreakup = (formatOption === 'breakup');
    var html = '';

    ledgers.forEach(function (m) {
      var info = m.memberInfo || {};
      var op = m.openingBalance || {};
      var txs = m.transactions || [];
      var cl = m.closingBalance || {};

      var bTypeTitle = (m.billTypeName || data.billTypeName || 'MAINTENANCE').trim().toUpperCase();
      if (bTypeTitle.startsWith('--') || bTypeTitle === 'BILL TYPE') bTypeTitle = 'ACCOUNT';

      var fullMemTitle = '[ ' + (info.flatNo || info.memberCode || '') + ' ]  ' + (info.memberName || '') +
        (info.contactNo ? (' (' + info.contactNo + ')') : '') + ' — ' + bTypeTitle + ' LEDGER';
      var areaText = (info.areaSqFt && info.areaSqFt > 0) ? ('AREA : ' + info.areaSqFt) : 'AREA : 850';

      html += '<div class="member-card-print">';
      html += '  <div class="print-mem-title-line">';
      html += '    <span>' + fullMemTitle + '</span>';
      html += '    <span>' + areaText + '</span>';
      html += '  </div>';

      html += '  <table class="mreg-table-print">';
      html += '    <thead><tr>';
      html += '      <th style="width:75px; text-align:left;">Date</th>';
      html += '      <th style="width:110px; text-align:left;">Type - No.</th>';
      html += '      <th style="text-align:left;">Particular</th>';

      if (isBreakup) {
        html += '      <th style="width:80px; text-align:right;">Principal</th>';
        html += '      <th style="width:75px; text-align:right;">Interest</th>';
      }

      html += '      <th style="width:80px; text-align:right;">Debit</th>';
      html += '      <th style="width:80px; text-align:right;">Credit</th>';
      html += '      <th style="width:90px; text-align:right;">Balance</th>';
      html += '    </tr></thead>';
      html += '    <tbody>';

      // Opening Row
      html += '    <tr>';
      html += '      <td style="text-align:left;">—</td>';
      html += '      <td style="text-align:left;">—</td>';
      html += '      <td style="text-align:left; font-weight:700;">Opening Balance .........</td>';

      if (isBreakup) {
        html += '      <td style="text-align:right;">' + (op.principal > 0 ? formatMoney(op.principal) : '—') + '</td>';
        html += '      <td style="text-align:right;">' + (op.interest > 0 ? formatMoney(op.interest) : '—') + '</td>';
      }

      html += '      <td style="text-align:right;">—</td>';
      html += '      <td style="text-align:right;">—</td>';
      html += '      <td style="text-align:right; font-weight:700;">' + formatMoney(op.totalOpening) + '</td>';
      html += '    </tr>';

      // Transactions Rows
      txs.forEach(function (t) {
        html += '    <tr>';
        html += '      <td style="text-align:left;">' + formatDateDDMMYYYY(t.voucherDate) + '</td>';
        html += '      <td style="text-align:left;">' + (t.voucherNo || '') + '</td>';
        html += '      <td style="text-align:left;">' + (t.period || '') + '</td>';

        if (isBreakup) {
          html += '      <td style="text-align:right;">' + (t.principalAmount > 0 ? formatMoney(t.principalAmount) : '—') + '</td>';
          html += '      <td style="text-align:right;">' + (t.interestAmount > 0 ? formatMoney(t.interestAmount) : '—') + '</td>';
        }

        html += '      <td style="text-align:right;" class="col-debit">' + (t.totalDebit > 0 ? formatMoney(t.totalDebit) : '—') + '</td>';
        html += '      <td style="text-align:right;">' + (t.totalCredit > 0 ? formatMoney(t.totalCredit) : '—') + '</td>';
        html += '      <td style="text-align:right; font-weight:700;">' + formatMoney(t.runningBalance) + '</td>';
        html += '    </tr>';
      });

      // Closing Row
      html += '    <tr class="row-closing-print">';
      html += '      <td style="text-align:left;">—</td>';
      html += '      <td style="text-align:left;">—</td>';
      html += '      <td style="text-align:left; font-weight:800; text-transform:uppercase;">Closing Balance .........</td>';

      if (isBreakup) {
        var printPrinc = (cl.netClosingBalance > 0 && cl.totalPrincipal > 0) ? formatMoney(cl.totalPrincipal) : '0.00';
        var printInt = (cl.netClosingBalance > 0 && cl.totalInterest > 0) ? formatMoney(cl.totalInterest) : '0.00';
        html += '      <td style="text-align:right; font-weight:800;">' + printPrinc + '</td>';
        html += '      <td style="text-align:right; font-weight:800;">' + printInt + '</td>';
      }

      html += '      <td style="text-align:right;" class="col-debit">' + (cl.grandTotalDebit > 0 ? formatMoney(cl.grandTotalDebit) : '0.00') + '</td>';
      html += '      <td style="text-align:right; font-weight:800;">' + (cl.grandTotalCredit > 0 ? formatMoney(cl.grandTotalCredit) : '0.00') + '</td>';
      html += '      <td style="text-align:right; font-weight:900;">' + formatMoney(cl.netClosingBalance) + '</td>';
      html += '    </tr>';

      html += '    </tbody></table></div>';
    });

    container.innerHTML = html;
  }

  // ── 4. PRINT MODAL INTERACTION (IMAGE 1) ──────────────────────────
  window.openPrintModal = function () {
    var modal = document.getElementById('printOptionsModal');
    if (modal) modal.style.display = 'flex';
  };

  window.closePrintModal = function () {
    var modal = document.getElementById('printOptionsModal');
    if (modal) modal.style.display = 'none';
  };

  window.selectPrintOption = function (type) {
    selectedPrintOption = type;

    var cardCompact = document.getElementById('optCardCompact');
    var cardBreakup = document.getElementById('optCardBreakup');
    var radioCompact = document.getElementById('radioCompact');
    var radioBreakup = document.getElementById('radioBreakup');

    if (type === 'compact') {
      if (cardCompact) cardCompact.classList.add('active');
      if (cardBreakup) cardBreakup.classList.remove('active');
      if (radioCompact) radioCompact.checked = true;
      if (radioBreakup) radioBreakup.checked = false;
    } else {
      if (cardBreakup) cardBreakup.classList.add('active');
      if (cardCompact) cardCompact.classList.remove('active');
      if (radioBreakup) radioBreakup.checked = true;
      if (radioCompact) radioCompact.checked = false;
    }
  };

  window.executePrint = function () {
    closePrintModal();
    if (reportData) {
      renderReportPrint(reportData, selectedPrintOption);
    }
    setTimeout(function () {
      window.print();
    }, 150);
  };

  // ── 5. EXPORT TO EXCEL ──────────────────────────────────────────
  window.exportToExcel = function () {
    if (!reportData || !reportData.memberRegisters) {
      alert('No data available to export.');
      return;
    }

    var csv = [];
    var header = ['Member Code', 'Member Name', 'Wing', 'Flat No', 'Date', 'Type-No.', 'Particular', 'Principal', 'Interest', 'Debit', 'Credit', 'Balance'];
    csv.push(header.join(','));

    reportData.memberRegisters.forEach(function (m) {
      var info = m.memberInfo || {};
      (m.transactions || []).forEach(function (t) {
        var row = [
          '"' + (info.memberCode || '') + '"',
          '"' + (info.memberName || '') + '"',
          '"' + (info.wing || '') + '"',
          '"' + (info.flatNo || '') + '"',
          '"' + formatDateDDMMYYYY(t.voucherDate) + '"',
          '"' + (t.voucherNo || '') + '"',
          '"' + (t.period || '') + '"',
          t.principalAmount,
          t.interestAmount,
          t.totalDebit,
          t.totalCredit,
          t.runningBalance
        ];
        csv.push(row.join(','));
      });
    });

    var blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Member_Register_DrCr_' + Date.now() + '.csv';
    link.click();
  };

  // ── INIT ────────────────────────────────────────────────────────
  window.loadMemberRegister = loadMemberRegister;

  document.addEventListener('DOMContentLoaded', async function () {
    await loadMasters();
    await loadMemberRegister();
  });

})();
