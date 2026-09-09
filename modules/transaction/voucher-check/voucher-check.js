/**
 * voucher-check.js — Jeevika ERP v2
 * Voucher Check (Audit) Module, 22-Column Grid, Audit Checklist, Approval & Rejection Logic
 */

(function () {
  'use strict';

  var vouchers = [];
  var selectedVoucherNo = null;

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
  async function loadVouchers() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var data = await fetchApiData('/api/vouchers?societyId=' + sid + '&fyId=' + fyid);

    if (data && Array.isArray(data)) vouchers = data;

    if (!vouchers || vouchers.length === 0) {
      var stored = localStorage.getItem('jeevika_voucher_check_' + sid);
      if (stored) {
        try { vouchers = JSON.parse(stored); } catch (e) {}
      }
    }

    if (!vouchers) vouchers = [];

    var socEl = document.getElementById('vcSocName');
    if (socEl) socEl.textContent = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Society Name';

    var fyEl = document.getElementById('vcFyLabel');
    if (fyEl) fyEl.textContent = getFyLabel();

    renderList();
  }

  // ── 2. REGISTER TABLE RENDERING ─────────────────────────────────
  window.renderList = function () {
    var tbody = document.getElementById('vc-list-tbody');
    if (!tbody) return;

    var fVType = (document.getElementById('flt-vtype') ? document.getElementById('flt-vtype').value : '');
    var fStatus = (document.getElementById('flt-status') ? document.getElementById('flt-status').value : '');
    var qSearch = (document.getElementById('srch-vouchers') ? document.getElementById('srch-vouchers').value.toLowerCase() : '');

    var filtered = vouchers.filter(function (v) {
      if (fVType && (v.voucherType || '').toLowerCase().indexOf(fVType.toLowerCase()) === -1) return false;
      if (fStatus) {
        var st = v.auditStatus || v.status || 'Pending';
        if (st.toLowerCase() !== fStatus.toLowerCase()) return false;
      }

      if (qSearch) {
        var str = ((v.voucherNo || '') + ' ' + (v.personName || '') + ' ' + (v.chqNo || '') + ' ' + (v.particular1 || '')).toLowerCase();
        if (str.indexOf(qSearch) === -1) return false;
      }

      return true;
    });

    document.getElementById('vc-count').textContent = filtered.length + ' vouchers';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="22" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Vouchers Found</td></tr>';
      updateSummary([]);
      renderSubGrid(null);
      return;
    }

    var html = '';
    filtered.forEach(function (v) {
      var vNo = v.voucherNo || v.id;
      var isSel = (vNo === selectedVoucherNo);
      var st = v.auditStatus || v.status || 'Pending';
      var stColor = (st === 'Approved') ? '#2E7D32' : ((st === 'Rejected') ? '#dc2626' : '#d97706');

      html += '<tr class="' + (isSel ? 'row-active' : '') + '" onclick="selectVoucherRow(\'' + vNo + '\')">' +
        '<td>' + (v.voucherType || 'JV') + '</td>' +
        '<td style="font-weight:700; color:#0D47A1;">' + (v.voucherNo || '-') + '</td>' +
        '<td>' + (v.voucherDate || '-') + '</td>' +
        '<td style="text-align:right; font-weight:700; font-family:\'Consolas\', monospace;">' + (v.amount ? parseFloat(v.amount).toFixed(2) : '0.00') + '</td>' +
        '<td style="text-align:center;">' + (v.chkChecked ? '✓' : '-') + '</td>' +
        '<td style="text-align:center;">' + (v.chkNoComm ? '✓' : '-') + '</td>' +
        '<td style="text-align:center;">' + (v.chkNoRecv ? '✓' : '-') + '</td>' +
        '<td style="text-align:center;">' + (v.chkNoSupp ? '✓' : '-') + '</td>' +
        '<td style="text-align:center;">' + (v.chkNoMeet ? '✓' : '-') + '</td>' +
        '<td style="text-align:center;">' + (v.chkNoTds ? '✓' : '-') + '</td>' +
        '<td style="text-align:center;">' + (v.chkNoVouch ? '✓' : '-') + '</td>' +
        '<td style="text-align:center;">' + (v.chkExcessCash ? '✓' : '-') + '</td>' +
        '<td>' + (v.remark || '') + '</td>' +
        '<td>' + (v.remark1 || '') + '</td>' +
        '<td>' + (v.chqNo || '-') + '</td>' +
        '<td>' + (v.billNo || '-') + '</td>' +
        '<td>' + (v.personName || '-') + '</td>' +
        '<td>' + (v.particular1 || v.narration || '-') + '</td>' +
        '<td>' + (v.particular2 || '-') + '</td>' +
        '<td>' + (v.bankName || v.cashBankName || '-') + '</td>' +
        '<td style="font-weight:700; color:' + stColor + ';">' + st + '</td>' +
        '<td>' + (v.entryNo || v.id || '-') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
    updateSummary(filtered);
    initColumnResizing();
  };

  function updateSummary(list) {
    var totAmt = 0, app = 0, pnd = 0, rej = 0;

    list.forEach(function (v) {
      totAmt += parseFloat(v.amount || 0);
      var st = v.auditStatus || v.status || 'Pending';
      if (st === 'Approved') app++;
      else if (st === 'Rejected') rej++;
      else pnd++;
    });

    document.getElementById('sum-tot-cnt').textContent = list.length;
    document.getElementById('sum-app-cnt').textContent = app;
    document.getElementById('sum-pnd-cnt').textContent = pnd;
    document.getElementById('sum-rej-cnt').textContent = rej;
    document.getElementById('sum-tot-amt').textContent = '₹' + totAmt.toFixed(2);
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

  window.selectVoucherRow = function (vNo) {
    selectedVoucherNo = vNo;
    renderList();

    var v = vouchers.find(function (x) { return String(x.voucherNo || x.id) === String(vNo); });
    if (!v) return;

    renderSubGrid(v);
    populateRightPanel(v);
  };

  function renderSubGrid(v) {
    var tbody = document.getElementById('vc-subgrid-tbody');
    if (!tbody) return;

    if (!v || !v.items || v.items.length === 0) {
      var amt = v ? parseFloat(v.amount || 0) : 0;
      tbody.innerHTML = '<tr><td>ACC-101</td><td>Expense Ledger Account</td><td style="text-align:right; font-family:\'Consolas\', monospace;">' + amt.toFixed(2) + '</td><td style="text-align:right;">0.00</td><td style="text-align:center;">No</td><td>General</td></tr>' +
        '<tr><td>BANK-01</td><td>Bank Account</td><td style="text-align:right;">0.00</td><td style="text-align:right; font-family:\'Consolas\', monospace;">' + amt.toFixed(2) + '</td><td style="text-align:center;">No</td><td>Bank</td></tr>';
      return;
    }

    var html = '';
    v.items.forEach(function (item) {
      html += '<tr style="border-bottom:1px solid #f1f5f9;">' +
        '<td>' + (item.code || '—') + '</td>' +
        '<td style="font-weight:600;">' + (item.accountName || item.name || '—') + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace;">' + (item.debit ? parseFloat(item.debit).toFixed(2) : '0.00') + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace;">' + (item.credit ? parseFloat(item.credit).toFixed(2) : '0.00') + '</td>' +
        '<td style="text-align:center;">' + (item.gst || 'No') + '</td>' +
        '<td>' + (item.ledgerType || 'General') + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  function populateRightPanel(v) {
    document.getElementById('det-chqno').value = v.chqNo || '';
    document.getElementById('det-chqdate').value = v.chqDate || v.voucherDate || '';
    document.getElementById('det-billno').value = v.billNo || '';
    document.getElementById('det-person').value = v.personName || '';
    document.getElementById('det-particular').value = v.particular1 || v.narration || '';
    document.getElementById('det-narration').value = v.narration || '';
    document.getElementById('det-app-remark').value = v.approvalRemark || '';
    document.getElementById('det-aud-remark').value = v.auditorRemark || '';
    document.getElementById('det-rej-reason').value = v.rejectionReason || '';

    document.getElementById('det-updated-by').textContent = v.updatedBy || (window.Auth && Auth.getUserName ? Auth.getUserName() : 'Admin');
    document.getElementById('det-updated-time').textContent = v.updatedTime || todayISO();

    document.getElementById('chk-check').checked = !!v.chkChecked;
    document.getElementById('chk-noComm').checked = !!v.chkNoComm;
    document.getElementById('chk-noRecv').checked = !!v.chkNoRecv;
    document.getElementById('chk-noSupp').checked = !!v.chkNoSupp;
    document.getElementById('chk-noMeet').checked = !!v.chkNoMeet;
    document.getElementById('chk-noTds').checked = !!v.chkNoTds;
    document.getElementById('chk-noVouch').checked = !!v.chkNoVouch;
  }

  // ── 3. ACTIONS: UPDATE, APPROVE, REJECT ────────────────────────────
  window.processUpdate = function () {
    if (!selectedVoucherNo) { toast('Please select a voucher from the grid first.', false); return; }

    var v = vouchers.find(function (x) { return String(x.voucherNo || x.id) === String(selectedVoucherNo); });
    if (!v) return;

    v.chkChecked = document.getElementById('chk-check').checked;
    v.chkNoComm = document.getElementById('chk-noComm').checked;
    v.chkNoRecv = document.getElementById('chk-noRecv').checked;
    v.chkNoSupp = document.getElementById('chk-noSupp').checked;
    v.chkNoMeet = document.getElementById('chk-noMeet').checked;
    v.chkNoTds = document.getElementById('chk-noTds').checked;
    v.chkNoVouch = document.getElementById('chk-noVouch').checked;

    v.approvalRemark = document.getElementById('det-app-remark').value;
    v.auditorRemark = document.getElementById('det-aud-remark').value;

    v.updatedBy = (window.Auth && Auth.getUserName) ? Auth.getUserName() : 'Admin';
    v.updatedTime = todayISO();

    localStorage.setItem('jeevika_voucher_check_' + getActiveSocietyId(), JSON.stringify(vouchers));
    toast('Voucher audit checks & remarks updated successfully!', true);
    renderList();
  };

  window.processApprove = function () {
    if (!selectedVoucherNo) { toast('Please select a voucher from the grid first.', false); return; }

    var v = vouchers.find(function (x) { return String(x.voucherNo || x.id) === String(selectedVoucherNo); });
    if (!v) return;

    v.auditStatus = 'Approved';
    v.status = 'Approved';
    v.chkChecked = true;
    v.updatedBy = (window.Auth && Auth.getUserName) ? Auth.getUserName() : 'Admin';
    v.updatedTime = todayISO();

    localStorage.setItem('jeevika_voucher_check_' + getActiveSocietyId(), JSON.stringify(vouchers));
    toast('Voucher ' + v.voucherNo + ' approved successfully!', true);
    renderList();
  };

  window.processReject = function () {
    if (!selectedVoucherNo) { toast('Please select a voucher from the grid first.', false); return; }
    document.getElementById('modal-reject').style.display = 'flex';
  };

  window.closeModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  };

  window.confirmReject = function () {
    var reason = document.getElementById('rej-reason-input').value;
    if (!reason) { toast('Please enter a rejection reason.', false); return; }

    var v = vouchers.find(function (x) { return String(x.voucherNo || x.id) === String(selectedVoucherNo); });
    if (v) {
      v.auditStatus = 'Rejected';
      v.status = 'Rejected';
      v.rejectionReason = reason;
      v.updatedBy = (window.Auth && Auth.getUserName) ? Auth.getUserName() : 'Admin';
      v.updatedTime = todayISO();
    }

    localStorage.setItem('jeevika_voucher_check_' + getActiveSocietyId(), JSON.stringify(vouchers));
    closeModal('modal-reject');
    toast('Voucher rejected successfully.', true);
    renderList();
  };

  window.showAuditModal = function () {
    if (!selectedVoucherNo) { toast('Please select a voucher to view its audit trail.', false); return; }
    toast('Audit Trail: Voucher ' + selectedVoucherNo + ' created & reviewed by Admin.', true);
  };

  window.showMultiApproveModal = function () {
    if (confirm('Approve all pending vouchers in current view?')) {
      var count = 0;
      vouchers.forEach(function (v) {
        if ((v.auditStatus || v.status || 'Pending') === 'Pending') {
          v.auditStatus = 'Approved';
          v.status = 'Approved';
          v.chkChecked = true;
          count++;
        }
      });
      localStorage.setItem('jeevika_voucher_check_' + getActiveSocietyId(), JSON.stringify(vouchers));
      toast('Approved ' + count + ' pending vouchers successfully!', true);
      renderList();
    }
  };

  window.showPreview = function () {
    var container = document.getElementById('preview-vc-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    var app = 0, pnd = 0, rej = 0, totAmt = 0;
    vouchers.forEach(function (v) {
      totAmt += parseFloat(v.amount || 0);
      var st = v.auditStatus || v.status || 'Pending';
      if (st === 'Approved') app++;
      else if (st === 'Rejected') rej++;
      else pnd++;
    });

    container.innerHTML = '<div style="border-bottom:2px solid #0D47A1; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#0D47A1; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#0D47A1; text-decoration:underline;">VOUCHER AUDIT CHECK SUMMARY REPORT</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-around; margin-bottom:20px; font-size:12px; font-weight:bold;">' +
        '<span style="color:#0D47A1;">Total: ' + vouchers.length + '</span>' +
        '<span style="color:#2E7D32;">Approved: ' + app + '</span>' +
        '<span style="color:#d97706;">Pending: ' + pnd + '</span>' +
        '<span style="color:#dc2626;">Rejected: ' + rej + '</span>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; font-size:11px;">' +
        '<thead><tr style="background:#0D47A1; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Voucher No</th>' +
          '<th style="padding:6px; text-align:left;">Date</th>' +
          '<th style="padding:6px; text-align:right;">Amount (₹)</th>' +
          '<th style="padding:6px; text-align:center;">Status</th>' +
        '</tr></thead>' +
        '<tbody>' +
        vouchers.map(function (v) {
          return '<tr>' +
            '<td style="border:1px solid #ddd; padding:6px; font-weight:bold;">' + (v.voucherNo || '-') + '</td>' +
            '<td style="border:1px solid #ddd; padding:6px;">' + (v.voucherDate || '-') + '</td>' +
            '<td style="border:1px solid #ddd; padding:6px; text-align:right; font-family:monospace;">' + (v.amount ? parseFloat(v.amount).toFixed(2) : '0.00') + '</td>' +
            '<td style="border:1px solid #ddd; padding:6px; text-align:center; font-weight:bold;">' + (v.auditStatus || 'Pending') + '</td>' +
            '</tr>';
        }).join('') +
        '</tbody>' +
      '</table>';

    document.getElementById('vc-section-list').style.display = 'none';
    document.getElementById('vc-section-preview').style.display = 'flex';
  };

  window.showList = function () {
    document.getElementById('vc-section-preview').style.display = 'none';
    document.getElementById('vc-section-list').style.display = 'flex';
  };

  window.exitModule = function () {
    try {
      if (typeof window.WorkspaceBridge !== 'undefined') {
        window.WorkspaceBridge.closeTab('voucher-check');
        return;
      }
    } catch (e) {}
    toast('Module closed.', true);
  };

  function todayISO() {
    var d = new Date();
    return d.toISOString().split('T')[0];
  }

  // Short-cuts
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      showMultiApproveModal();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      processApprove();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      loadVouchers();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // INIT
  (async function init() {
    await loadVouchers();
    showList();
  })();

})();
