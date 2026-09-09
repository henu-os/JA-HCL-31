// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MEMBER ACCOUNT LEDGER | HEAD WISE
// 100% Dynamic DB Driven UI & Print Engine — Zero Hardcoding
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  var reportData = null;

  function getActiveSocietyId() {
    var id = (window.Auth && Auth.getSocietyId && Auth.getSocietyId()) ||
             sessionStorage.getItem('activeSocietyId') ||
             localStorage.getItem('activeSocietyId') ||
             (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeSocietyId')) ||
             (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeSocietyId')) ||
             '4';
    return id ? String(id) : '4';
  }

  function getFyId() {
    var id = (window.Auth && Auth.getFYId && Auth.getFYId()) ||
             sessionStorage.getItem('activeFYId') ||
             localStorage.getItem('activeFYId') ||
             (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeFYId')) ||
             (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeFYId')) ||
             '1';
    return id ? String(id) : '1';
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

  function toTitleCase(str) {
    if (!str) return '';
    return str.replace(/\w\S*/g, function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
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
    loadHeadwiseReport();
  };

  window.onToMemberChange = function () {
    var indSel = document.getElementById('flt-ind-mem');
    if (indSel) indSel.value = '';
    loadHeadwiseReport();
  };

  window.onIndividualMemberChange = function () {
    var indVal = document.getElementById('flt-ind-mem').value;
    if (indVal) {
      if (document.getElementById('flt-from-mem')) document.getElementById('flt-from-mem').value = '';
      if (document.getElementById('flt-to-mem')) document.getElementById('flt-to-mem').value = '';
    }
    loadHeadwiseReport();
  };

  window.resetFilters = function () {
    if (document.getElementById('flt-from-mem')) document.getElementById('flt-from-mem').value = '';
    if (document.getElementById('flt-to-mem')) document.getElementById('flt-to-mem').value = '';
    if (document.getElementById('flt-ind-mem')) document.getElementById('flt-ind-mem').value = '';
    if (document.getElementById('flt-bill-type')) document.getElementById('flt-bill-type').value = '';
    if (document.getElementById('flt-from-date')) document.getElementById('flt-from-date').value = '';
    if (document.getElementById('flt-to-date')) document.getElementById('flt-to-date').value = '';
    loadHeadwiseReport();
  };

  // ── 2. LOAD HEADWISE REPORT ──────────────────────────────────────
  async function loadHeadwiseReport() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var btId = document.getElementById('flt-bill-type') ? document.getElementById('flt-bill-type').value : '';
    var fromMem = document.getElementById('flt-from-mem') ? document.getElementById('flt-from-mem').value : '';
    var toMem = document.getElementById('flt-to-mem') ? document.getElementById('flt-to-mem').value : '';
    var indMem = document.getElementById('flt-ind-mem') ? document.getElementById('flt-ind-mem').value : '';
    var fromDate = document.getElementById('flt-from-date') ? document.getElementById('flt-from-date').value : '';
    var toDate = document.getElementById('flt-to-date') ? document.getElementById('flt-to-date').value : '';

    var container = document.getElementById('mhl-cards-container');
    if (container) container.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b; font-weight:700;"><i class="bi bi-arrow-repeat spin"></i> Loading Member Account Ledger...</div>';

    var query = '/api/reports/member-headwise-ledger?societyId=' + sid + '&fyId=' + fyid;
    if (btId) query += '&billTypeId=' + encodeURIComponent(btId);
    if (indMem) {
      query += '&individualMemberCode=' + encodeURIComponent(indMem);
    } else if (fromMem && toMem && fromMem === toMem) {
      query += '&individualMemberCode=' + encodeURIComponent(fromMem);
    } else {
      if (fromMem) query += '&fromMemberCode=' + encodeURIComponent(fromMem);
      if (toMem) query += '&toMemberCode=' + encodeURIComponent(toMem);
    }
    if (fromDate) query += '&fromDate=' + encodeURIComponent(fromDate);
    if (toDate) query += '&toDate=' + encodeURIComponent(toDate);

    try {
      var res = await API.get(query);
      if (res && res.success) {
        reportData = res;

        // Dynamically update UI headers and date fields from API response
        if (res.startDate && document.getElementById('flt-from-date') && !document.getElementById('flt-from-date').value) {
          document.getElementById('flt-from-date').value = res.startDate;
        }
        if (res.endDate && document.getElementById('flt-to-date') && !document.getElementById('flt-to-date').value) {
          document.getElementById('flt-to-date').value = res.endDate;
        }

        var curFrom = document.getElementById('flt-from-date') ? document.getElementById('flt-from-date').value : res.startDate;
        var curTo = document.getElementById('flt-to-date') ? document.getElementById('flt-to-date').value : res.endDate;

        var btSelEl = document.getElementById('flt-bill-type');
        var bTypeTitle = (res.billTypeName || (btSelEl && btSelEl.selectedIndex >= 0 && btSelEl.value ? btSelEl.options[btSelEl.selectedIndex].text : '') || '').trim();
        var bTypeSubText = (bTypeTitle && !bTypeTitle.startsWith('--')) ? (' (' + bTypeTitle.toUpperCase() + ')') : '';

        var sublineEl = document.getElementById('mhlDateSubline');
        if (sublineEl && curFrom && curTo) {
          sublineEl.textContent = 'MEMBER ACCOUNT' + bTypeSubText + ' FROM ' + formatDateDDMMM(curFrom).toUpperCase() + ' TO ' + formatDateDDMMM(curTo).toUpperCase();
        }

        var socNameEl = document.getElementById('mhlSocName');
        if (socNameEl && res.societyName) socNameEl.textContent = res.societyName;

        var fyLabelEl = document.getElementById('mhlFyLabel');
        if (fyLabelEl && res.fyLabel) fyLabelEl.textContent = res.fyLabel;

        // Print Header Elements
        var prtSocName = document.getElementById('prtSocName');
        if (prtSocName && res.societyName) prtSocName.textContent = res.societyName;

        var prtSubtitle = document.getElementById('prtSubtitle');
        if (prtSubtitle && curFrom && curTo) prtSubtitle.textContent = 'Member Register' + bTypeSubText + ' from ' + formatDateDDMMYYYY(curFrom) + ' to ' + formatDateDDMMYYYY(curTo);

        var prtFyLabel = document.getElementById('prtFyLabel');
        if (prtFyLabel && curFrom && curTo) prtFyLabel.textContent = 'F.Y. : ' + formatDateDDMMYYYY(curFrom) + '-' + formatDateDDMMYYYY(curTo);

        renderReportUI(res);
        renderReportPrint(res);
      } else {
        if (container) container.innerHTML = '<div style="text-align:center; padding:30px; color:#c62828; font-weight:700;">Failed to load report data.</div>';
      }
    } catch (e) {
      console.error('Headwise Ledger Load Error:', e);
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

  // ── 3A. RENDER WORKSPACE UI SCREEN VIEW ──────────────────────────
  function renderReportUI(data) {
    var container = document.getElementById('mhl-cards-container');
    if (!container) return;

    var cols = data.dynamicColumns || [];
    var ledgers = data.memberLedgers || [];

    if (ledgers.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b; font-weight:700;">No Member Records Found.</div>';
      return;
    }

    var isAccumulate = document.getElementById('chk-accumulate') ? document.getElementById('chk-accumulate').checked : false;
    var bTypeLabel = (data.billTypeName || (document.getElementById('flt-bill-type') && document.getElementById('flt-bill-type').selectedIndex >= 0 && document.getElementById('flt-bill-type').value ? document.getElementById('flt-bill-type').options[document.getElementById('flt-bill-type').selectedIndex].text : '') || 'MAINTENANCE').trim().toUpperCase();
    if (bTypeLabel.startsWith('--') || bTypeLabel === 'BILL TYPE') bTypeLabel = 'ACCOUNT';

    var html = '';

    ledgers.forEach(function (m) {
      var info = m.memberInfo || {};
      var op = m.openingBalance || {};
      var txs = m.transactions || [];
      var cl = m.closingBalance || {};
      var cols = (m.dynamicColumns && m.dynamicColumns.length > 0) ? m.dynamicColumns : (data.dynamicColumns || []);

      var currentBType = (m.billTypeName || bTypeLabel || 'MAINTENANCE').trim().toUpperCase();
      if (currentBType.startsWith('--') || currentBType === 'BILL TYPE') currentBType = 'ACCOUNT';

      var fullMemTitle = (info.memberName || 'MEMBER') +
        (info.contactNo ? (' (' + info.contactNo + ')') : '') +
        ' (' + (info.flatNo || info.memberCode || '') + ') - ' + currentBType + ' LEDGER';

      html += '<div class="member-card-ui">';
      html += '  <div class="member-card-title-ui">' + fullMemTitle + '</div>';
      html += '  <div class="table-wrap-ui">';
      html += '    <table class="headwise-table-ui" style="min-width:' + (isAccumulate ? '1350px' : '100%') + ';">';
      html += '      <thead><tr>';
      html += '        <th style="width:90px;">DATE</th>';
      html += '        <th style="width:130px;">TYPE-NO</th>';
      html += '        <th style="width:140px;">PERIOD / PARTICULARS</th>';

      cols.forEach(function (c) {
        html += '        <th style="text-align:right;">' + (c.headName || 'HEAD').toUpperCase() + '</th>';
      });

      html += '        <th style="width:110px; text-align:right;">TOTAL DEBIT</th>';
      html += '        <th style="width:110px; text-align:right;">TOTAL CREDIT</th>';
      html += '        <th style="width:120px; text-align:right;">BALANCE</th>';
      if (isAccumulate) {
        html += '        <th style="width:140px; text-align:right; background:#0f172a; color:#38bdf8;">ACCUMULATED PRINCIPAL</th>';
        html += '        <th style="width:140px; text-align:right; background:#0f172a; color:#fbbf24;">ACCUMULATED INTEREST</th>';
      }
      html += '      </tr></thead>';
      html += '      <tbody>';

      var opHeadMap = op.headWise || {};
      var opInt = parseFloat(opHeadMap['Interest'] || opHeadMap['INTEREST'] || op.interest || 0);
      var opPrinc = (parseFloat(op.totalOpening) || 0) - opInt;
      if (opPrinc < 0) opPrinc = 0;

      var curAccPrinc = opPrinc;
      var curAccInt = opInt;

      // Opening Row
      html += '      <tr>';
      html += '        <td class="col-center">—</td>';
      html += '        <td class="text-opening">Opening</td>';
      html += '        <td></td>';

      cols.forEach(function (c) {
        var opAmt = (op.headWise && op.headWise[c.headName]) ? op.headWise[c.headName] : 0.00;
        html += '        <td class="col-right">' + (opAmt > 0 ? formatMoney(opAmt) : '—') + '</td>';
      });

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
        var hAmts = t.headAmounts || {};
        var intAmt = parseFloat(hAmts['Interest'] || hAmts['INTEREST'] || 0);
        var princAmt = drAmt > 0 ? (drAmt - intAmt) : 0;

        if (drAmt > 0) {
          curAccPrinc += princAmt;
          curAccInt += intAmt;
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

        html += '      <tr>';
        html += '        <td class="col-center">' + formatDateDDMMM(t.voucherDate) + '</td>';
        html += '        <td class="col-center bold-num">' + (t.voucherNo || '—') + '</td>';
        html += '        <td>' + (t.period || t.voucherType || '—') + '</td>';

        cols.forEach(function (c) {
          var amt = (t.headAmounts && t.headAmounts[c.headName]) ? t.headAmounts[c.headName] : 0.00;
          html += '        <td class="col-right">' + (amt > 0 ? formatMoney(amt) : '—') + '</td>';
        });

        html += '        <td class="col-right">' + (drAmt > 0 ? formatMoney(drAmt) : '—') + '</td>';
        html += '        <td class="col-right">' + (crAmt > 0 ? formatMoney(crAmt) : '—') + '</td>';
        html += '        <td class="col-right bold-num">' + formatMoney(t.runningBalance) + '</td>';
        if (isAccumulate) {
          html += '        <td class="col-right bold-num" style="background:#f8fafc; color:#0284c7;">' + formatMoney(curAccPrinc) + '</td>';
          html += '        <td class="col-right bold-num" style="background:#f8fafc; color:#d97706;">' + formatMoney(curAccInt) + '</td>';
        }
        html += '      </tr>';
      });

      // Closing Row
      html += '      <tr class="row-closing">';
      html += '        <td class="col-center">—</td>';
      html += '        <td class="text-closing">CLOSING</td>';
      html += '        <td></td>';

      cols.forEach(function (c) {
        var clAmt = (cl.headWiseTotals && cl.headWiseTotals[c.headName]) ? cl.headWiseTotals[c.headName] : 0.00;
        html += '        <td class="col-right bold-num">' + (clAmt > 0 ? formatMoney(clAmt) : '—') + '</td>';
      });

      html += '        <td class="col-right bold-num">' + (cl.grandTotalDebit > 0 ? formatMoney(cl.grandTotalDebit) : '—') + '</td>';
      html += '        <td class="col-right bold-num">' + (cl.grandTotalCredit > 0 ? formatMoney(cl.grandTotalCredit) : '—') + '</td>';
      html += '        <td class="col-right bold-num">' + formatMoney(cl.netClosingBalance) + '</td>';
      if (isAccumulate) {
        html += '        <td class="col-right bold-num" style="background:#f8fafc; color:#0284c7;">' + formatMoney(curAccPrinc) + '</td>';
        html += '        <td class="col-right bold-num" style="background:#f8fafc; color:#d97706;">' + formatMoney(curAccInt) + '</td>';
      }
      html += '      </tr>';

      html += '      </tbody></table></div></div>';
    });

    container.innerHTML = html;
  }

  // ── 3B. RENDER PRINT VIEW LAYOUT (100% DYNAMIC DB BINDING) ─────────
  function renderReportPrint(data) {
    var container = document.getElementById('mhl-print-cards-container');
    if (!container) return;

    var ledgers = data.memberLedgers || [];

    if (ledgers.length === 0) {
      container.innerHTML = '';
      return;
    }

    var bTypeLabel = (data.billTypeName || (document.getElementById('flt-bill-type') && document.getElementById('flt-bill-type').selectedIndex >= 0 && document.getElementById('flt-bill-type').value ? document.getElementById('flt-bill-type').options[document.getElementById('flt-bill-type').selectedIndex].text : '') || 'MAINTENANCE').trim().toUpperCase();
    if (bTypeLabel.startsWith('--') || bTypeLabel === 'BILL TYPE') bTypeLabel = 'ACCOUNT';

    var html = '';

    ledgers.forEach(function (m) {
      var info = m.memberInfo || {};
      var op = m.openingBalance || {};
      var txs = m.transactions || [];
      var cl = m.closingBalance || {};
      var cols = (m.dynamicColumns && m.dynamicColumns.length > 0) ? m.dynamicColumns : (data.dynamicColumns || []);

      var currentBType = (m.billTypeName || bTypeLabel || 'MAINTENANCE').trim().toUpperCase();
      if (currentBType.startsWith('--') || currentBType === 'BILL TYPE') currentBType = 'ACCOUNT';

      var bldgText = info.building ? (' BLDG : "' + info.building + '"') : '';
      var areaText = (info.areaSqFt && info.areaSqFt > 0) ? (' AREA : ' + info.areaSqFt) : '';

      html += '<div class="member-card-print">';
      html += '  <div class="print-ledger-title">' + currentBType + ' LEDGER</div>';
      html += '  <div class="print-mem-line1">FLAT NO.' + (info.flatNo || info.memberCode || '') + (bldgText ? (' &nbsp;' + bldgText) : '') + ' &nbsp; WING : ' + (info.wing || '—') + (areaText ? (' &nbsp;' + areaText) : '') + '</div>';
      html += '  <div class="print-mem-line2">' + (info.memberName || '') + (info.contactNo ? (' (' + info.contactNo + ')') : '') + '</div>';

      html += '  <div class="table-wrap-print">';
      html += '    <table class="headwise-table-print">';
      html += '      <thead><tr>';
      html += '        <th class="col-left" style="width:110px;">No.</th>';
      html += '        <th class="col-center" style="width:80px;">Date</th>';
      html += '        <th class="col-left" style="width:100px;">Particular</th>';

      cols.forEach(function (c) {
        html += '        <th>' + toTitleCase(c.headName || 'Head') + '</th>';
      });

      html += '        <th style="width:85px;">Debit</th>';
      html += '        <th style="width:85px;">Credit</th>';
      html += '        <th style="width:95px;">Balance</th>';
      html += '      </tr></thead>';
      html += '      <tbody>';

      // Opening Row
      html += '      <tr>';
      html += '        <td class="col-left">—</td>';
      html += '        <td class="col-center">—</td>';
      html += '        <td class="col-left text-opening">Opening Balance</td>';

      cols.forEach(function (c) {
        var opAmt = (op.headWise && op.headWise[c.headName]) ? op.headWise[c.headName] : 0.00;
        html += '        <td>' + (opAmt > 0 ? formatMoney(opAmt) : '—') + '</td>';
      });

      html += '        <td>—</td>';
      html += '        <td>—</td>';
      html += '        <td style="font-weight:700;">' + formatMoney(op.totalOpening) + '</td>';
      html += '      </tr>';

      // Transactions Rows
      txs.forEach(function (t) {
        html += '      <tr>';
        html += '        <td class="col-left">' + (t.voucherNo || '') + '</td>';
        html += '        <td class="col-center">' + formatDateDDMMYYYY(t.voucherDate) + '</td>';
        html += '        <td class="col-left">' + (t.period || '') + '</td>';

        cols.forEach(function (c) {
          var amt = (t.headAmounts && t.headAmounts[c.headName]) ? t.headAmounts[c.headName] : 0.00;
          html += '        <td>' + (amt > 0 ? formatMoney(amt) : '—') + '</td>';
        });

        html += '        <td>' + (t.totalDebit > 0 ? formatMoney(t.totalDebit) : '—') + '</td>';
        html += '        <td>' + (t.totalCredit > 0 ? formatMoney(t.totalCredit) : '—') + '</td>';
        html += '        <td style="font-weight:700;">' + formatMoney(t.runningBalance) + '</td>';
        html += '      </tr>';
      });

      // Closing Row
      html += '      <tr class="row-closing-print">';
      html += '        <td class="col-left">—</td>';
      html += '        <td class="col-center">—</td>';
      html += '        <td class="col-left text-closing">Closing Balance</td>';

      cols.forEach(function (c) {
        var clAmt = (cl.headWiseTotals && cl.headWiseTotals[c.headName]) ? cl.headWiseTotals[c.headName] : 0.00;
        html += '        <td>' + (clAmt > 0 ? formatMoney(clAmt) : '—') + '</td>';
      });

      html += '        <td>' + (cl.grandTotalDebit > 0 ? formatMoney(cl.grandTotalDebit) : '0.00') + '</td>';
      html += '        <td>' + (cl.grandTotalCredit > 0 ? formatMoney(cl.grandTotalCredit) : '0.00') + '</td>';
      html += '        <td style="font-weight:900;">' + formatMoney(cl.netClosingBalance) + '</td>';
      html += '      </tr>';

      html += '      </tbody></table></div></div>';
    });

    container.innerHTML = html;
  }

  // ── 4. EXPORT TO EXCEL ──────────────────────────────────────────
  window.exportToExcel = function () {
    if (!reportData || !reportData.memberLedgers) {
      alert('No data available to export.');
      return;
    }

    var csv = [];
    var cols = reportData.dynamicColumns || [];

    // Header line
    var header = ['Member Code', 'Member Name', 'Wing', 'Flat No', 'No.', 'Date', 'Particular'];
    cols.forEach(function (c) { header.push('"' + toTitleCase(c.headName) + '"'); });
    header.push('Debit', 'Credit', 'Balance');
    csv.push(header.join(','));

    reportData.memberLedgers.forEach(function (m) {
      var info = m.memberInfo || {};
      (m.transactions || []).forEach(function (t) {
        var row = [
          '"' + (info.memberCode || '') + '"',
          '"' + (info.memberName || '') + '"',
          '"' + (info.wing || '') + '"',
          '"' + (info.flatNo || '') + '"',
          '"' + (t.voucherNo || '') + '"',
          '"' + formatDateDDMMYYYY(t.voucherDate) + '"',
          '"' + (t.period || '') + '"'
        ];
        cols.forEach(function (c) {
          var amt = (t.headAmounts && t.headAmounts[c.headName]) ? t.headAmounts[c.headName] : 0;
          row.push(amt);
        });
        row.push(t.totalDebit, t.totalCredit, t.runningBalance);
        csv.push(row.join(','));
      });
    });

    var blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Member_Headwise_Ledger_' + Date.now() + '.csv';
    link.click();
  };

  // ── INIT ────────────────────────────────────────────────────────
  window.loadHeadwiseReport = loadHeadwiseReport;

  document.addEventListener('DOMContentLoaded', async function () {
    await loadMasters();
    await loadHeadwiseReport();
  });

})();
