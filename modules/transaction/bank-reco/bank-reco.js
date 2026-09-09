/**
 * bank-reco.js — Jeevika ERP v2
 * Bank Reconciliation Module, 13-Column Grid, Filtering, Clearing Entry & Statement
 */

(function () {
  'use strict';

  var vouchers = [];
  var bankAccounts = [];
  var selectedVoucherId = null;

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, ok) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, ok ? 'success' : 'error');
    } else {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;padding:9px 18px;font-size:12px;font-weight:600;color:#FFF;border-radius:3px;box-shadow:0 3px 12px rgba(0,0,0,0.2);background:' + (ok !== false ? '#2E7D32' : '#C62828') + ';';
      d.textContent = msg;
      document.body.appendChild(d);
      setTimeout(function () { d.remove(); }, 2500);
    }
  }

  function getActiveSocietyId() {
    return (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4');
  }

  function getFyId() {
    return (window.Auth && Auth.getFYId) ? Auth.getFYId() : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1');
  }

  function getFyLabel() {
    return (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');
  }

  async function fetchApiData(endpoint) {
    try {
      if (window.API && API.get) {
        var res = await API.get(endpoint);
        if (res) return res;
      }
    } catch (e) {}
    return null;
  }

  // ── 1. MASTER DATA LOADING ──────────────────────────────────────
  async function loadMasterData() {
    var sid = getActiveSocietyId();
    var accData = await fetchApiData('/api/accounts?societyId=' + sid);

    if (accData && Array.isArray(accData)) {
      bankAccounts = accData.filter(function (a) {
        return (a.category === 'Bank' || (a.accName || '').toLowerCase().indexOf('bank') >= 0);
      });
    }

    if (!bankAccounts) bankAccounts = [];

    var selBank = document.getElementById('flt-bank');
    if (selBank) {
      var html = '<option value="">-- All Banks --</option>';
      bankAccounts.forEach(function (b) {
        html += '<option value="' + escHtml(b.accName) + '">' + escHtml(b.accName) + '</option>';
      });
      selBank.innerHTML = html;
    }

    await loadVouchers();
  }

  async function loadVouchers() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var data = await fetchApiData('/api/vouchers?societyId=' + sid + '&fyId=' + fyid);

    if (data && Array.isArray(data)) vouchers = data;

    if (!vouchers || vouchers.length === 0) {
      var stored = localStorage.getItem('jeevika_bank_reco_' + sid);
      if (stored) {
        try { vouchers = JSON.parse(stored); } catch (e) {}
      }
    }

    if (!vouchers) vouchers = [];

    renderList();
  }

  // ── 2. REGISTER TABLE RENDERING ─────────────────────────────────
  window.renderList = function () {
    var tbody = document.getElementById('br-list-tbody');
    if (!tbody) return;

    var fBank = (document.getElementById('flt-bank') ? document.getElementById('flt-bank').value : '');
    var fTxn = (document.getElementById('flt-txntype') ? document.getElementById('flt-txntype').value : '');
    var fStatus = (document.getElementById('flt-status') ? document.getElementById('flt-status').value : '');
    var fVType = (document.getElementById('flt-vtype') ? document.getElementById('flt-vtype').value : '');
    var qSearch = (document.getElementById('srch-vno') ? document.getElementById('srch-vno').value.toLowerCase() : '');
    var memSearch = (document.getElementById('flt-mem') ? document.getElementById('flt-mem').value.toLowerCase() : '');

    var filtered = vouchers.filter(function (v) {
      if (fBank && (v.bankName || v.cashBankName || '') !== fBank) return false;
      if (fTxn) {
        if (fTxn === 'Receipt' && (v.voucherType || '').indexOf('RV') === -1 && (v.voucherType || '').indexOf('Receipt') === -1) return false;
        if (fTxn === 'Payment' && (v.voucherType || '').indexOf('PV') === -1 && (v.voucherType || '').indexOf('Payment') === -1) return false;
      }
      if (fStatus) {
        if (fStatus === 'Cleared' && !v.clearingDate) return false;
        if (fStatus === 'Uncleared' && v.clearingDate) return false;
      }
      if (fVType && (v.voucherType || '').toLowerCase().indexOf(fVType.toLowerCase()) === -1) return false;

      if (qSearch) {
        var str = ((v.voucherNo || '') + ' ' + (v.chqNo || '') + ' ' + (v.personName || '') + ' ' + (v.particular1 || '')).toLowerCase();
        if (str.indexOf(qSearch) === -1) return false;
      }

      if (memSearch && (v.memberCode || '').toLowerCase().indexOf(memSearch) === -1) return false;

      return true;
    });

    document.getElementById('br-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Entries Found</td></tr>';
      updateSummary([]);
      return;
    }

    var html = '';
    filtered.forEach(function (v) {
      var vId = v.voucherId || v.voucherNo || v.id;
      var isSel = (vId === selectedVoucherId);
      var isCleared = !!v.clearingDate;

      var isDr = (v.voucherType === 'Payment' || v.voucherType === 'PV' || v.debit > 0);
      var drAmt = isDr ? (v.debit || v.amount || 0) : 0;
      var crAmt = !isDr ? (v.credit || v.amount || 0) : 0;

      html += '<tr class="' + (isSel ? 'row-active' : '') + '" onclick="selectVoucherRow(\'' + vId + '\')">' +
        '<td style="font-weight:700; color:' + (isCleared ? '#2E7D32' : '#dc2626') + ';">' + (v.clearingDate || 'Uncleared') + '</td>' +
        '<td>' + (v.voucherDate || '-') + '</td>' +
        '<td style="text-align:right; font-weight:700; color:#dc2626; font-family:\'Consolas\', monospace;">' + (drAmt > 0 ? drAmt.toFixed(2) : '-') + '</td>' +
        '<td style="text-align:right; font-weight:700; color:#2E7D32; font-family:\'Consolas\', monospace;">' + (crAmt > 0 ? crAmt.toFixed(2) : '-') + '</td>' +
        '<td>' + (v.transType || 'Chq') + '</td>' +
        '<td>' + (v.chqNo || '-') + '</td>' +
        '<td>' + (v.memberCode || '-') + '</td>' +
        '<td>' + (v.chqNo || '-') + '</td>' +
        '<td>' + (v.voucherType || 'RV') + '</td>' +
        '<td style="font-weight:700; color:#0D47A1;">' + (v.voucherNo || '-') + '</td>' +
        '<td>' + (v.particular1 || v.narration || '-') + '</td>' +
        '<td>' + (v.particular2 || '-') + '</td>' +
        '<td>' + (v.bankName || '—') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
    updateSummary(filtered);
    initColumnResizing();
  };

  function updateSummary(list) {
    var totDr = 0, totCr = 0, cleared = 0, uncleared = 0;

    list.forEach(function (v) {
      var isDr = (v.voucherType === 'Payment' || v.voucherType === 'PV' || v.debit > 0);
      var amt = parseFloat(v.amount || v.debit || v.credit || 0);

      if (isDr) totDr += amt;
      else totCr += amt;

      if (v.clearingDate) cleared += amt;
      else uncleared += amt;
    });

    document.getElementById('sum-tot-dr').textContent = '₹' + totDr.toFixed(2);
    document.getElementById('sum-tot-cr').textContent = '₹' + totCr.toFixed(2);
    document.getElementById('sum-cleared').textContent = '₹' + cleared.toFixed(2);
    document.getElementById('sum-uncleared').textContent = '₹' + uncleared.toFixed(2);
    document.getElementById('sum-diff').textContent = '₹' + Math.abs(totCr - totDr).toFixed(2);
  }

  function initColumnResizing() {
    setTimeout(function () {
      var tables = document.querySelectorAll('table.erp-table');
      tables.forEach(function (table) {
        var ths = table.querySelectorAll('th');
        ths.forEach(function (th) {
          if (th.querySelector('.col-resizer')) return;

          var resizer = document.createElement('div');
          resizer.className = 'col-resizer';
          th.appendChild(resizer);

          var startX, startWidth;

          resizer.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            startX = e.pageX;
            startWidth = th.offsetWidth;
            resizer.classList.add('resizing');

            function onMouseMove(e) {
              var newWidth = startWidth + (e.pageX - startX);
              if (newWidth > 35) {
                th.style.width = newWidth + 'px';
                th.style.minWidth = newWidth + 'px';
              }
            }

            function onMouseUp() {
              resizer.classList.remove('resizing');
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          });
        });
      });
    }, 100);
  }

  window.selectVoucherRow = function (vId) {
    selectedVoucherId = vId;
    renderList();

    var v = vouchers.find(function (x) { return String(x.voucherId || x.voucherNo || x.id) === String(vId); });
    if (!v) return;

    document.getElementById('sb-bank').textContent = v.bankName || 'State Bank of India';
    document.getElementById('sb-chqdate').textContent = v.chqDate || v.voucherDate || '-';
    document.getElementById('sb-person').textContent = v.personName || 'Self';

    document.getElementById('sb-part1').textContent = v.particular1 || v.narration || '-';
    document.getElementById('sb-part2').textContent = v.particular2 || '-';
    document.getElementById('sb-narr').textContent = v.narration || '-';

    document.getElementById('sb-clearingdate').value = v.clearingDate || todayISO();
    document.getElementById('sb-remark').value = v.remark || '';
  };

  window.clearSelection = function () {
    selectedVoucherId = null;
    document.getElementById('sb-bank').textContent = '-';
    document.getElementById('sb-chqdate').textContent = '-';
    document.getElementById('sb-person').textContent = '-';
    document.getElementById('sb-part1').textContent = '-';
    document.getElementById('sb-part2').textContent = '-';
    document.getElementById('sb-narr').textContent = '-';
    document.getElementById('sb-clearingdate').value = '';
    document.getElementById('sb-remark').value = '';
    renderList();
  };

  // ── 3. RECONCILIATION SAVE & AUTO MATCH ────────────────────────────
  window.saveReconciliationDetail = async function () {
    if (!selectedVoucherId) { toast('Please select a voucher row from the grid first.', false); return; }

    var v = vouchers.find(function (x) { return String(x.voucherId || x.voucherNo || x.id) === String(selectedVoucherId); });
    if (!v) return;

    var clDate = document.getElementById('sb-clearingdate').value;
    if (!clDate) { toast('Please select a Clearing Date.', false); return; }

    v.clearingDate = clDate;
    v.remark = document.getElementById('sb-remark').value;

    try {
      if (window.API && API.post) {
        await API.post('/api/bank-reco', { voucherNo: v.voucherNo, clearingDate: clDate, remark: v.remark });
      }
    } catch (e) {}

    localStorage.setItem('jeevika_bank_reco_' + getActiveSocietyId(), JSON.stringify(vouchers));
    toast('Clearing Date saved successfully!', true);
    renderList();
  };

  window.autoMatch = function () {
    var count = 0;
    var today = todayISO();

    vouchers.forEach(function (v) {
      if (!v.clearingDate && v.chqNo && v.chqNo !== '-') {
        v.clearingDate = v.chqDate || v.voucherDate || today;
        v.remark = 'Auto Matched via Cheque No';
        count++;
      }
    });

    if (count > 0) {
      localStorage.setItem('jeevika_bank_reco_' + getActiveSocietyId(), JSON.stringify(vouchers));
      renderList();
      toast('Auto-matched ' + count + ' uncleared transactions successfully!', true);
    } else {
      toast('No matching uncleared cheque transactions found.', false);
    }
  };

  window.showMultiClearModal = function () {
    document.getElementById('modal-multi-clear').style.display = 'flex';
  };

  window.closeModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  };

  window.runMultiClear = function () {
    var fromV = document.getElementById('mc-from').value;
    var toV = document.getElementById('mc-to').value;
    var clDate = document.getElementById('mc-date').value || todayISO();

    if (!fromV || !toV) { toast('Please enter From and To Voucher Numbers.', false); return; }

    var count = 0;
    vouchers.forEach(function (v) {
      if (v.voucherNo >= fromV && v.voucherNo <= toV) {
        v.clearingDate = clDate;
        count++;
      }
    });

    localStorage.setItem('jeevika_bank_reco_' + getActiveSocietyId(), JSON.stringify(vouchers));
    closeModal('modal-multi-clear');
    renderList();
    toast('Multi-cleared ' + count + ' vouchers successfully!', true);
  };

  window.showPreview = function () {
    var bankName = document.getElementById('flt-bank').value || 'State Bank of India';
    var container = document.getElementById('preview-br-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    var totDr = 0, totCr = 0, unclearedDr = 0, unclearedCr = 0;
    vouchers.forEach(function (v) {
      var isDr = (v.voucherType === 'Payment' || v.voucherType === 'PV' || v.debit > 0);
      var amt = parseFloat(v.amount || v.debit || v.credit || 0);
      if (isDr) {
        totDr += amt;
        if (!v.clearingDate) unclearedDr += amt;
      } else {
        totCr += amt;
        if (!v.clearingDate) unclearedCr += amt;
      }
    });

    var bookBal = totCr - totDr;
    var stmtBal = bookBal - (unclearedCr - unclearedDr);

    container.innerHTML = '<div style="border-bottom:2px solid #0D47A1; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#0D47A1; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Bank: ' + escHtml(bankName) + ' &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#0D47A1; text-decoration:underline;">BANK RECONCILIATION STATEMENT</h3>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#0D47A1; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Particulars</th>' +
          '<th style="padding:6px; text-align:right;">Amount (₹)</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr><td style="border:1px solid #ddd; padding:8px; font-weight:bold;">Balance as per Cash Book (Bank Ledger)</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#0D47A1;">' + bookBal.toFixed(2) + '</td></tr>' +
          '<tr><td style="border:1px solid #ddd; padding:8px;">Add: Cheques issued but not presented for payment</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace;">' + unclearedDr.toFixed(2) + '</td></tr>' +
          '<tr><td style="border:1px solid #ddd; padding:8px;">Less: Cheques deposited but not cleared by bank</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace;">(' + unclearedCr.toFixed(2) + ')</td></tr>' +
        '</tbody>' +
        '<tfoot><tr style="background:#e8f5e9; font-weight:bold; color:#2E7D32;">' +
          '<td style="border:1px solid #ddd; padding:8px;">Balance as per Bank Passbook / Statement</td>' +
          '<td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-size:14px;">₹' + stmtBal.toFixed(2) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
        '<div><strong>Prepared By</strong><br><br>_____________</div>' +
        '<div><strong>Auditor / Authorized Signatory</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('br-section-list').style.display = 'none';
    document.getElementById('br-section-preview').style.display = 'flex';
  };

  window.showList = function () {
    document.getElementById('br-section-preview').style.display = 'none';
    document.getElementById('br-section-list').style.display = 'flex';
  };

  function todayISO() {
    var d = new Date();
    return d.toISOString().split('T')[0];
  }

  // Short-cuts (Alt+A, Ctrl+R, Ctrl+M, Ctrl+P, Esc)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      saveReconciliationDetail();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      loadVouchers();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      autoMatch();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // INIT
  (async function init() {
    var _sn = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('brSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('brFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    await loadMasterData();
    showList();
  })();

})();
