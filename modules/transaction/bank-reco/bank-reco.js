/**
 * bank-reco.js — Jeevika ERP v2
 * Bank Reconciliation Module, 13-Column Grid, Filtering, Clearing Entry & Statement
 * Adheres strictly to the accounting inverse rule:
 *   - ERP Books: Bank is Asset -> Receipts/Deposits = DEBIT (Dr), Payments/Withdrawals = CREDIT (Cr)
 *   - Physical Statement: Customer is Liability -> Deposits = CREDIT (Cr), Withdrawals = DEBIT (Dr)
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
    return (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1');
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
        if (res && res.data && Array.isArray(res.data)) return res.data;
        if (res && Array.isArray(res)) return res;
      }
    } catch (e) {}
    return null;
  }

  // ── Helper: Classify Bank Debit / Credit according to standard Double-Entry rules ──
  function getVoucherBankAmounts(v) {
    var vt = (v.voucherType || '').toLowerCase();
    var isReceipt = (vt.indexOf('receipt') >= 0 || vt === 'rv' || vt === 'mrv' || vt === 'otherreceipt');
    var isPayment = (vt.indexOf('payment') >= 0 || vt === 'pv' || vt === 'pymt' || vt === 'paymententry');

    var drAmt = 0;
    var crAmt = 0;

    if (v.debit !== undefined && v.credit !== undefined && (parseFloat(v.debit) > 0 || parseFloat(v.credit) > 0)) {
      drAmt = parseFloat(v.debit) || 0;
      crAmt = parseFloat(v.credit) || 0;
    } else if (isReceipt) {
      // In ERP Books: Bank Receipt = Bank DEBIT (Inflow / Deposit) -> Statement CREDIT
      drAmt = parseFloat(v.amount || 0);
      crAmt = 0;
    } else if (isPayment) {
      // In ERP Books: Bank Payment = Bank CREDIT (Outflow / Withdrawal) -> Statement DEBIT
      drAmt = 0;
      crAmt = parseFloat(v.amount || 0);
    } else {
      // Contra or other vouchers
      var narr = ((v.narration || '') + ' ' + (v.particular1 || '')).toLowerCase();
      var amt = parseFloat(v.amount || 0);
      if (narr.indexOf('deposit') >= 0 || narr.indexOf('to bank') >= 0) {
        drAmt = amt;
      } else {
        crAmt = amt;
      }
    }

    return {
      isReceipt: isReceipt || (drAmt > 0 && crAmt === 0),
      isPayment: isPayment || (crAmt > 0 && drAmt === 0),
      drAmt: drAmt,
      crAmt: crAmt,
      netAmt: drAmt > 0 ? drAmt : (crAmt > 0 ? crAmt : parseFloat(v.amount || 0))
    };
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

    // 1. Try dedicated Bank Reco endpoint
    var data = await fetchApiData('/api/bank-reco?societyId=' + sid + '&fyId=' + fyid);

    // 2. Fallback to /api/vouchers if bank-reco endpoint returned empty
    if (!data || !Array.isArray(data) || data.length === 0) {
      data = await fetchApiData('/api/vouchers?societyId=' + sid + '&fyId=' + fyid);
    }

    if (data && Array.isArray(data)) vouchers = data;

    if (!vouchers || vouchers.length === 0) {
      var stored = localStorage.getItem('jeevika_bank_reco_' + sid);
      if (stored) {
        try { vouchers = JSON.parse(stored); } catch (e) {}
      }
    }

    if (!vouchers) vouchers = [];

    // Sync any locally cached clearing dates if not already present
    var storedClearing = localStorage.getItem('jeevika_bank_reco_' + sid);
    if (storedClearing) {
      try {
        var localList = JSON.parse(storedClearing);
        if (Array.isArray(localList)) {
          var clearMap = {};
          localList.forEach(function (x) {
            if (x.clearingDate) clearMap[String(x.voucherNo || x.voucherId)] = x;
          });
          vouchers.forEach(function (v) {
            var key = String(v.voucherNo || v.voucherId);
            if (!v.clearingDate && clearMap[key]) {
              v.clearingDate = clearMap[key].clearingDate;
              v.remark = v.remark || clearMap[key].remark;
            }
          });
        }
      } catch (e) {}
    }

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
      var b = getVoucherBankAmounts(v);

      if (fBank && (v.bankName || v.cashBankName || '') !== fBank) return false;
      if (fTxn) {
        if (fTxn === 'Receipt' && !b.isReceipt) return false;
        if (fTxn === 'Payment' && !b.isPayment) return false;
      }
      if (fStatus) {
        if (fStatus === 'Cleared' && !v.clearingDate) return false;
        if (fStatus === 'Uncleared' && v.clearingDate) return false;
      }
      if (fVType && (v.voucherType || '').toLowerCase().indexOf(fVType.toLowerCase()) === -1) return false;

      if (qSearch) {
        var str = ((v.voucherNo || '') + ' ' + (v.chqNo || '') + ' ' + (v.personName || '') + ' ' + (v.particular1 || '') + ' ' + (v.narration || '')).toLowerCase();
        if (str.indexOf(qSearch) === -1) return false;
      }

      if (memSearch && (v.memberCode || v.personName || '').toLowerCase().indexOf(memSearch) === -1) return false;

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

      var b = getVoucherBankAmounts(v);

      html += '<tr class="' + (isSel ? 'row-active' : '') + '" onclick="selectVoucherRow(\'' + vId + '\')">' +
        '<td style="font-weight:700; color:' + (isCleared ? '#2E7D32' : '#dc2626') + ';">' + (v.clearingDate || 'Uncleared') + '</td>' +
        '<td>' + (v.voucherDate || '-') + '</td>' +
        '<td style="text-align:right; font-weight:700; color:#2E7D32; font-family:\'Consolas\', monospace;" title="ERP Books: Bank Debit (Receipt/Inflow) | Statement: Bank Credit">' + (b.drAmt > 0 ? b.drAmt.toFixed(2) : '-') + '</td>' +
        '<td style="text-align:right; font-weight:700; color:#dc2626; font-family:\'Consolas\', monospace;" title="ERP Books: Bank Credit (Payment/Outflow) | Statement: Bank Debit">' + (b.crAmt > 0 ? b.crAmt.toFixed(2) : '-') + '</td>' +
        '<td>' + (v.transType || (v.chqNo ? 'Chq' : 'Bank')) + '</td>' +
        '<td>' + (v.chqNo || '-') + '</td>' +
        '<td>' + (v.memberCode || v.personCode || '-') + '</td>' +
        '<td>' + (v.chqNo || '-') + '</td>' +
        '<td>' + (v.voucherType || 'RV') + '</td>' +
        '<td style="font-weight:700; color:#0D47A1;">' + (v.voucherNo || '-') + '</td>' +
        '<td>' + (v.particular1 || v.narration || '-') + '</td>' +
        '<td>' + (v.particular2 || '-') + '</td>' +
        '<td>' + (v.bankName || v.cashBankName || '—') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
    updateSummary(filtered);
    initColumnResizing();
  };

  function updateSummary(list) {
    var totDr = 0, totCr = 0, cleared = 0, uncleared = 0;

    list.forEach(function (v) {
      var b = getVoucherBankAmounts(v);
      totDr += b.drAmt;
      totCr += b.crAmt;

      if (v.clearingDate) cleared += b.netAmt;
      else uncleared += b.netAmt;
    });

    var netBal = totDr - totCr; // Positive = Debit Balance (Asset), Negative = Credit Balance (Overdrawn)
    var balStr = '₹' + Math.abs(netBal).toFixed(2) + (netBal >= 0 ? ' Dr' : ' Cr');

    document.getElementById('sum-tot-dr').textContent = '₹' + totDr.toFixed(2);
    document.getElementById('sum-tot-cr').textContent = '₹' + totCr.toFixed(2);
    document.getElementById('sum-cleared').textContent = '₹' + cleared.toFixed(2);
    document.getElementById('sum-uncleared').textContent = '₹' + uncleared.toFixed(2);
    document.getElementById('sum-diff').textContent = balStr;
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

    document.getElementById('sb-bank').textContent = v.bankName || v.cashBankName || '-';
    document.getElementById('sb-chqdate').textContent = v.chqDate || v.voucherDate || '-';
    document.getElementById('sb-person').textContent = v.personName || '-';

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
        await API.post('/api/bank-reco', {
          societyId: parseInt(getActiveSocietyId(), 10),
          voucherNo: v.voucherNo,
          clearingDate: clDate,
          remark: v.remark
        });
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

  window.showMultiUnclearModal = function () {
    document.getElementById('modal-multi-unclear').style.display = 'flex';
  };

  window.closeModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  };

  window.runMultiClear = async function () {
    var fromV = document.getElementById('mc-from').value;
    var toV = document.getElementById('mc-to').value;
    var clDate = document.getElementById('mc-date').value || todayISO();

    if (!fromV || !toV) { toast('Please enter From and To Voucher Numbers.', false); return; }

    var sid = parseInt(getActiveSocietyId(), 10);
    var count = 0;
    vouchers.forEach(function (v) {
      if (v.voucherNo >= fromV && v.voucherNo <= toV) {
        v.clearingDate = clDate;
        v.remark = 'Multi Cleared';
        count++;
      }
    });

    try {
      if (window.API && API.post) {
        await API.post('/api/bank-reco/multi-clear', {
          societyId: sid,
          fromVoucherNo: fromV,
          toVoucherNo: toV,
          clearingDate: clDate,
          remark: 'Multi Cleared'
        });
      }
    } catch (e) {}

    localStorage.setItem('jeevika_bank_reco_' + sid, JSON.stringify(vouchers));
    closeModal('modal-multi-clear');
    renderList();
    toast('Multi-cleared ' + count + ' vouchers successfully!', true);
  };

  window.runMultiUnclear = async function () {
    var fromV = document.getElementById('muc-from').value;
    var toV = document.getElementById('muc-to').value;

    if (!fromV || !toV) { toast('Please enter From and To Voucher Numbers.', false); return; }

    var sid = parseInt(getActiveSocietyId(), 10);
    var unVchIds = [];
    var count = 0;
    vouchers.forEach(function (v) {
      if (v.voucherNo >= fromV && v.voucherNo <= toV) {
        v.clearingDate = null;
        v.remark = null;
        if (v.voucherId) unVchIds.push(v.voucherId);
        count++;
      }
    });

    try {
      if (window.API && API.post) {
        await API.post('/api/bank-reco/unclear', {
          societyId: sid,
          voucherIds: unVchIds
        });
      }
    } catch (e) {}

    localStorage.setItem('jeevika_bank_reco_' + sid, JSON.stringify(vouchers));
    closeModal('modal-multi-unclear');
    renderList();
    toast('Reset ' + count + ' vouchers to Uncleared.', true);
  };

  // ── 4. REPORT PREVIEW (BANK RECONCILIATION STATEMENT) ─────────────
  window.showPreview = function () {
    var bankName = document.getElementById('flt-bank').value || 'All Banks';
    var container = document.getElementById('preview-br-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName') || '');

    var totDr = 0;             // Total Receipts in Books (Dr)
    var totCr = 0;             // Total Payments in Books (Cr)
    var unclearedPayments = 0; // Cheques issued / payments made (Books Cr) not yet debited by bank
    var unclearedReceipts = 0; // Cheques deposited / receipts (Books Dr) not yet credited by bank

    vouchers.forEach(function (v) {
      var b = getVoucherBankAmounts(v);
      totDr += b.drAmt;
      totCr += b.crAmt;

      if (!v.clearingDate) {
        if (b.crAmt > 0) {
          unclearedPayments += b.crAmt;
        }
        if (b.drAmt > 0) {
          unclearedReceipts += b.drAmt;
        }
      }
    });

    // 1. Balance as per Cash Book (ERP Bank Ledger in Society Books)
    // Bank is an Asset. Positive = Debit balance; Negative = Credit balance (Overdrawn)
    var bookBal = totDr - totCr;

    // 2. Bank Reconciliation Statement Formula:
    // Balance as per Physical Bank Statement (Passbook) =
    //   Balance as per Books (Dr)
    //   + Cheques issued (ERP Bank Cr) but not yet presented in bank (Bank hasn't debited yet)
    //   - Cheques deposited (ERP Bank Dr) but not yet cleared by bank (Bank hasn't credited yet)
    var stmtBal = bookBal + unclearedPayments - unclearedReceipts;

    container.innerHTML = '<div style="border-bottom:2px solid #0D47A1; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#0D47A1; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Bank: ' + escHtml(bankName) + ' &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#0D47A1; text-decoration:underline; font-weight:800;">BANK RECONCILIATION STATEMENT</h3>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#0D47A1; color:#fff;">' +
          '<th style="padding:8px; text-align:left;">Particulars</th>' +
          '<th style="padding:8px; text-align:right;">Amount (₹)</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr>' +
            '<td style="border:1px solid #ddd; padding:8px; font-weight:bold;">' +
              'Balance as per Cash Book (ERP Bank Ledger)' +
              '<div style="font-size:10px; color:#64748b; font-weight:normal;">ERP Society Books: Bank Asset Account (Favourable Dr / Overdraft Cr)</div>' +
            '</td>' +
            '<td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#0D47A1;">' +
              (bookBal >= 0 ? '₹' + bookBal.toFixed(2) + ' Dr' : '₹' + Math.abs(bookBal).toFixed(2) + ' Cr (Overdraft)') +
            '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #ddd; padding:8px;">' +
              '<strong>Add:</strong> Cheques issued / Payments made but not presented for payment' +
              '<div style="font-size:10px; color:#64748b;">(ERP Bank Credit — Outflows recorded in Books, not yet debited in Bank Statement)</div>' +
            '</td>' +
            '<td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#2E7D32;">' +
              '+ ₹' + unclearedPayments.toFixed(2) +
            '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="border:1px solid #ddd; padding:8px;">' +
              '<strong>Less:</strong> Cheques deposited / Receipts made but not cleared by bank' +
              '<div style="font-size:10px; color:#64748b;">(ERP Bank Debit — Inflows recorded in Books, not yet credited in Bank Statement)</div>' +
            '</td>' +
            '<td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#dc2626;">' +
              '- ₹' + unclearedReceipts.toFixed(2) +
            '</td>' +
          '</tr>' +
        '</tbody>' +
        '<tfoot><tr style="background:#e8f5e9; font-weight:bold; color:#2E7D32;">' +
          '<td style="border:1px solid #ddd; padding:8px;">' +
            'Balance as per Physical Bank Passbook / Statement' +
            '<div style="font-size:10px; color:#166534; font-weight:normal;">(Bank Point of View: Favourable Cr / Overdraft Dr)</div>' +
          '</td>' +
          '<td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-size:13px; font-weight:bold;">' +
            (stmtBal >= 0 ? '₹' + stmtBal.toFixed(2) + ' Cr' : '₹' + Math.abs(stmtBal).toFixed(2) + ' Dr (Overdrawn)') +
          '</td>' +
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
