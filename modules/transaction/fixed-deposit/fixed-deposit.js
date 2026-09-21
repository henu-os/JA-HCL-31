/**
 * fixed-deposit.js — Jeevika ERP v2
 * Fixed Deposit Entry Register, 15-Column Table, FDR Master Entry & Interest Calculation Tables
 */

(function () {
  'use strict';

  var fds = [];
  var banks = [];
  var selectedFdId = null;
  var sortDirection = 'desc';

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
    var id = (window.Auth && Auth.getSocietyId && Auth.getSocietyId()) ||
             sessionStorage.getItem('activeSocietyId') ||
             localStorage.getItem('activeSocietyId') ||
             (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeSocietyId')) ||
             (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeSocietyId')) ||
             (window.parent && window.parent.Auth && window.parent.Auth.getSocietyId && window.parent.Auth.getSocietyId()) ||
             '4';
    return id ? String(id) : '4';
  }

  function getFyId() {
    var id = (window.Auth && Auth.getFYId && Auth.getFYId()) ||
             sessionStorage.getItem('activeFYId') ||
             localStorage.getItem('activeFYId') ||
             (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeFYId')) ||
             (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeFYId')) ||
             (window.parent && window.parent.Auth && window.parent.Auth.getFYId && window.parent.Auth.getFYId()) ||
             '1';
    return id ? String(id) : '1';
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
      banks = accData.filter(function (a) {
        return (a.category === 'Bank' || (a.accName || '').toLowerCase().indexOf('bank') >= 0);
      });
    }

    if (!banks) banks = [];

    var selBank = document.getElementById('frm-bankname');
    if (selBank) {
      var html = '<option value="">-- Select Bank --</option>';
      banks.forEach(function (b) {
        html += '<option value="' + escHtml(b.accName) + '">' + escHtml(b.accName) + '</option>';
      });
      selBank.innerHTML = html;
    }
  }

  async function loadFds() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var data = await fetchApiData('/api/fixed-deposits?societyId=' + sid + '&fyId=' + fyid);

    if (data && Array.isArray(data)) {
      fds = data.map(function(item) {
        item.fdId = item.fDId || item.fdId;
        item.fdrNo = item.fDNo || item.fdrNo || item.fdNo;
        item.amount = item.principal || item.amount;
        item.matAmt = item.maturityAmount || item.matAmt;
        item.depDate = item.startDate || item.depDate;
        item.matDate = item.maturityDate || item.matDate;
        return item;
      });
    } else if (data && data.data && Array.isArray(data.data)) {
      fds = data.data.map(function(item) {
        item.fdId = item.fDId || item.fdId;
        item.fdrNo = item.fDNo || item.fdrNo || item.fdNo;
        item.amount = item.principal || item.amount;
        item.matAmt = item.maturityAmount || item.matAmt;
        item.depDate = item.startDate || item.depDate;
        item.matDate = item.maturityDate || item.matDate;
        return item;
      });
    } else {
      var stored = localStorage.getItem('jeevika_fds_' + sid);
      if (stored) {
        try { fds = JSON.parse(stored); } catch (e) {}
      }
    }

    if (!fds) fds = [];

    renderFdsTable();
  }

  // ── 2. REGISTER TABLE & SORTING ──────────────────────────────────
  window.toggleFdrNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-vno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderFdsTable();
  };

  function renderFdsTable() {
    var tbody = document.getElementById('fd-list-tbody');
    if (!tbody) return;

    var filtered = fds.filter(function (b) {
      var fNo = (document.getElementById('flt-fdrno') ? document.getElementById('flt-fdrno').value.toLowerCase().trim() : '');
      var fBank = (document.getElementById('flt-bank') ? document.getElementById('flt-bank').value.toLowerCase().trim() : '');

      if (fNo && (b.fdrNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fBank) {
        var bName = (b.bankName || '').toLowerCase();
        var aName = (b.accountName || '').toLowerCase();
        var part1 = (b.particular1 || '').toLowerCase();
        var part2 = (b.particular2 || '').toLowerCase();
        var iType = (b.intType || '').toLowerCase();

        var matches = (
          bName.indexOf(fBank) !== -1 ||
          aName.indexOf(fBank) !== -1 ||
          part1.indexOf(fBank) !== -1 ||
          part2.indexOf(fBank) !== -1 ||
          iType.indexOf(fBank) !== -1
        );
        if (!matches) return false;
      }

      return true;
    });

    filtered.sort(function (a, b) {
      var noA = (a.fdrNo || '').toLowerCase();
      var noB = (b.fdrNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('fd-list-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="15" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Fixed Deposits Found</td></tr>';
      document.getElementById('sum-fd-count').textContent = '0';
      document.getElementById('sum-fd-amount').textContent = '₹0.00';
      document.getElementById('sum-fd-maturity').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totAmt = 0;
    var totMat = 0;

    filtered.forEach(function (b, idx) {
      var isSel = (b.fdId === selectedFdId);
      var amt = b.amount || 0;
      var mat = b.maturityAmt || 0;
      totAmt += amt;
      totMat += mat;

      html += '<tr class="' + (isSel ? 'row-active' : '') + '" data-id="'+(b.fdId||b.voucherId||b.fdrNo||b.voucherNo||'')+'" onclick="selectFdRow(this.dataset.id, this)" ondblclick="editSelectedFd(this.dataset.id)">' +
        '<td style="text-align:center; font-weight:700;">' + (idx + 1) + '</td>' +
        '<td style="font-weight:700; color:#0D47A1;">' + (b.fdrNo || '') + '</td>' +
        '<td>' + (b.fdrRecNo || '-') + '</td>' +
        '<td>' + (b.fdrDate || '') + '</td>' +
        '<td style="font-weight:700;">' + (b.bankName || '—') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#0D47A1; font-family:\'Consolas\', monospace;">' + amt.toFixed(2) + '</td>' +
        '<td style="text-align:center; font-weight:700;">' + (b.roi ? b.roi.toFixed(2) + '%' : '-') + '</td>' +
        '<td>' + (b.maturityDate || '-') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#2E7D32; font-family:\'Consolas\', monospace;">' + mat.toFixed(2) + '</td>' +
        '<td>' + (b.earmarked || '-') + '</td>' +
        '<td style="text-align:center; font-weight:800; color:#0D47A1;">' + (b.status || 'Live') + '</td>' +
        '<td style="text-align:center; font-weight:700;">' + (b.status1 || 'New') + '</td>' +
        '<td style="text-align:center; font-weight:700;">' + (b.reminder || 'Yes/No') + '</td>' +
        '<td style="text-align:right; font-weight:700; font-family:\'Consolas\', monospace;">' + (b.accruedInt ? b.accruedInt.toFixed(2) : '0.00') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#0D47A1; font-family:\'Consolas\', monospace;">' + (b.earnedInt ? b.earnedInt.toFixed(2) : '0.00') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-fd-count').textContent = filtered.length;
    document.getElementById('sum-fd-amount').textContent = '₹' + totAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('sum-fd-maturity').textContent = '₹' + totMat.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    initColumnResizing();
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

  window.selectFdRow = function (id, trEl) {
    selectedFdId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('row-active', 'selected'); });
      trEl.classList.add('row-active', 'selected');
    }
  };

  // ── 3. FORM FORMULAS & INTEREST CALCULATIONS ──────────────────────
  window.calcMaturityInterest = function () {
    var depAmt = parseFloat(document.getElementById('frm-depamt').value) || 0;
    var matAmt = parseFloat(document.getElementById('frm-matamt').value) || 0;
    var earned = matAmt - depAmt;
    if (earned < 0) earned = 0;

    document.getElementById('frm-earned-int').value = earned.toFixed(2);
    calcAccruedTable();
  };

  window.calcAccruedTable = function () {
    var grandNet = 0;
    var grandTds = 0;
    var grandTot = 0;

    for (var i = 1; i <= 6; i++) {
      var net = parseFloat(document.getElementById('acc-net-y' + i).value) || 0;
      var tds = parseFloat(document.getElementById('acc-tds-y' + i).value) || 0;
      var tot = net + tds;

      document.getElementById('acc-tot-y' + i).value = tot.toFixed(2);
      document.getElementById('acc-sum-y' + i).textContent = tot.toFixed(2);

      grandNet += net;
      grandTds += tds;
      grandTot += tot;
    }

    document.getElementById('acc-net-tot').textContent = grandNet.toFixed(2);
    document.getElementById('acc-tds-tot').textContent = grandTds.toFixed(2);
    document.getElementById('acc-tot-tot').textContent = grandTot.toFixed(2);
    document.getElementById('acc-sum-grand').textContent = grandTot.toFixed(2);

    calcWorkingTable(grandNet);
  };

  function calcWorkingTable(totalNetInt) {
    var earnedInt = parseFloat(document.getElementById('frm-earned-int').value) || 0;
    var matAmt = parseFloat(document.getElementById('frm-matamt').value) || 0;

    var resA = earnedInt - totalNetInt;
    var resB = matAmt;
    var resC = resA - resB;
    var resD = resC;

    document.getElementById('wrk-result-a').textContent = resA.toFixed(2);
    document.getElementById('wrk-result-b').textContent = resB.toFixed(2);
    document.getElementById('wrk-result-c').textContent = resC.toFixed(2);
    document.getElementById('wrk-result-d').textContent = resD.toFixed(2);
  }

  // ── 4. CRUD ACTIONS ──────────────────────────────────────────────
  window.openAddFdForm = function () {
    selectedFdId = null;
    document.getElementById('frm-srno').value = fds.length + 1;
    document.getElementById('frm-fdrno').value = 'FDR/2026/00' + (fds.length + 1);
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-fdrno', 'FixedDeposit');
    document.getElementById('frm-recno').value = '';
    document.getElementById('frm-depdate').value = todayISO();
    document.getElementById('frm-matdate').value = todayNextYearISO();

    document.getElementById('frm-depamt').value = '0';
    document.getElementById('frm-matamt').value = '0';
    document.getElementById('frm-roi').value = '0';
    document.getElementById('frm-period').value = '12';
    document.getElementById('frm-period-unit').value = 'Days/Month/Year';
    document.getElementById('frm-earmarked').value = '';

    if (banks.length > 0) document.getElementById('frm-bankname').value = banks[0].accName;
    document.getElementById('frm-status').value = 'Live';
    document.getElementById('frm-status1').value = 'New';
    document.getElementById('frm-reminder').value = 'Yes/No';
    document.getElementById('frm-earned-int').value = '0.00';
    document.getElementById('frm-remark').value = '';

    for (var i = 1; i <= 6; i++) {
      document.getElementById('acc-net-y' + i).value = '0.00';
      document.getElementById('acc-tds-y' + i).value = '0.00';
    }
    calcAccruedTable();

    document.getElementById('fd-section-list').style.display = 'none';
    document.getElementById('fd-section-form').style.display = 'flex';
  };

  window.editSelectedFd = function (id) {
    if (id) selectedFdId = id;
    if (!selectedFdId) { toast('Please select a Fixed Deposit row to edit.', false); return; }
    var b = fds.find(function (x) {
      return String(x.fdId) === String(selectedFdId) ||
             String(x.voucherId) === String(selectedFdId) ||
             String(x.fdrNo) === String(selectedFdId) ||
             String(x.voucherNo) === String(selectedFdId);
    });
    if (!b) { toast('Fixed deposit record not found.', false); return; }

    document.getElementById('frm-srno').value = b.srNo || 1;
    document.getElementById('frm-fdrno').value = b.fdrNo;
    document.getElementById('frm-recno').value = b.fdrRecNo || '';
    document.getElementById('frm-depdate').value = b.fdrDate || todayISO();
    document.getElementById('frm-matdate').value = b.maturityDate || todayNextYearISO();

    document.getElementById('frm-depamt').value = b.amount || 0;
    document.getElementById('frm-matamt').value = b.maturityAmt || 0;
    document.getElementById('frm-roi').value = b.roi || 0;
    document.getElementById('frm-earmarked').value = b.earmarked || '';
    document.getElementById('frm-bankname').value = b.bankName || '';
    document.getElementById('frm-status').value = b.status || 'Live';
    document.getElementById('frm-status1').value = b.status1 || 'New';
    document.getElementById('frm-reminder').value = b.reminder || 'Yes/No';
    document.getElementById('frm-earned-int').value = (b.earnedInt || 0).toFixed(2);
    document.getElementById('frm-remark').value = b.remark || '';

    calcAccruedTable();

    document.getElementById('fd-section-list').style.display = 'none';
    document.getElementById('fd-section-form').style.display = 'flex';
  };

  window.saveFd = async function () {
    var fdrNo = document.getElementById('frm-fdrno').value;
    var bank = document.getElementById('frm-bankname').value;
    var depAmt = parseFloat(document.getElementById('frm-depamt').value) || 0;
    var matAmt = parseFloat(document.getElementById('frm-matamt').value) || 0;

    if (!fdrNo) { toast('Please enter FDR No.', false); return; }
    if (!bank) { toast('Please select Bank Name.', false); return; }
    if (depAmt <= 0) { toast('Please enter Deposit Amount.', false); return; }

    var depDateVal = document.getElementById('frm-depdate') ? document.getElementById('frm-depdate').value : '';
    var matDateVal = document.getElementById('frm-matdate') ? document.getElementById('frm-matdate').value : '';

    var payload = {
      societyId: parseInt(getActiveSocietyId(), 10),
      fyId: parseInt(getFyId(), 10),
      fdNo: fdrNo,
      fdrNo: fdrNo,
      bankName: bank,
      principal: depAmt,
      amount: depAmt,
      interestRate: parseFloat(document.getElementById('frm-roi').value) || 0,
      roi: parseFloat(document.getElementById('frm-roi').value) || 0,
      startDate: (depDateVal && depDateVal.trim() !== '') ? depDateVal : null,
      fdrDate: depDateVal,
      maturityDate: (matDateVal && matDateVal.trim() !== '') ? matDateVal : null,
      maturityAmount: matAmt,
      maturityAmt: matAmt,
      remark: document.getElementById('frm-remark') ? document.getElementById('frm-remark').value : ''
    };

    try {
      if (window.API && API.post) {
        var res = await API.post('/api/fixed-deposits', payload);
        if (res && res.success) {
          toast('Fixed Deposit Entry saved successfully!', true);
          showList();
          await loadFds();
          return;
        } else {
          toast((res && res.message) ? res.message : 'Failed to save Fixed Deposit.', false);
          return;
        }
      }
    } catch (e) {
      console.error('FD save error:', e);
      toast('Error saving FD: ' + (e.message || 'Server error'), false);
      return;
    }

    payload.fdId = selectedFdId || Date.now();
    if (selectedFdId) {
      var idx = fds.findIndex(function (b) { return b.fdId === selectedFdId; });
      if (idx >= 0) fds[idx] = payload;
    } else {
      fds.unshift(payload);
    }

    localStorage.setItem('jeevika_fds_' + getActiveSocietyId(), JSON.stringify(fds));
    toast('Fixed Deposit Entry saved successfully!', true);
    showList();
    renderFdsTable();
  };

  window.deleteSelectedFd = async function () {
    if (!selectedFdId) { toast('Please select a Fixed Deposit to delete.', false); return; }
    var tr = fds.find(function (b) {
      return String(b.fdId) === String(selectedFdId) ||
             String(b.voucherId) === String(selectedFdId) ||
             String(b.fdrNo) === String(selectedFdId) ||
             String(b.voucherNo) === String(selectedFdId);
    });
    var trNoStr = tr ? (tr.fdrNo || tr.voucherNo) : '#' + selectedFdId;
    var delId = (tr && (tr.voucherId || tr.fdId)) ? (tr.voucherId || tr.fdId) : selectedFdId;

    var ok = typeof showConfirm === 'function'
      ? await showConfirm('Are you sure you want to delete Fixed Deposit ' + trNoStr + '?', 'Confirm Delete Fixed Deposit')
      : confirm('Are you sure you want to delete Fixed Deposit ' + trNoStr + '?');

    if (!ok) return;

    try {
      if (window.API && API.delete) {
        var res = await API.delete('/api/fixed-deposits/' + encodeURIComponent(delId));
        if (!res || !res.success) {
          await API.delete('/api/vouchers/' + encodeURIComponent(delId));
        }
      }
    } catch (e) {
      try { await API.delete('/api/vouchers/' + encodeURIComponent(delId)); } catch (err) {}
    }

    fds = fds.filter(function (b) {
      return String(b.fdId) !== String(selectedFdId) &&
             String(b.voucherId) !== String(selectedFdId) &&
             String(b.fdrNo) !== String(selectedFdId) &&
             String(b.voucherNo) !== String(selectedFdId);
    });
    localStorage.setItem('jeevika_fds_' + getActiveSocietyId(), JSON.stringify(fds));

    selectedFdId = null;
    toast('Fixed Deposit deleted successfully!', true);
    await loadFds();
  };

  window.previewSelectedFd = function () {
    if (!selectedFdId) { toast('Please select a Fixed Deposit to preview.', false); return; }
    var b = fds.find(function (x) { return x.fdId === selectedFdId; });
    if (!b) return;

    var container = document.getElementById('preview-fd-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    container.innerHTML = '<div style="border-bottom:2px solid #0D47A1; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#0D47A1; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#0D47A1; text-decoration:underline;">FIXED DEPOSIT RECEIPT ADVICE</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px;">' +
        '<div>' +
          '<div><strong>Bank Name:</strong> ' + escHtml(b.bankName) + '</div>' +
          '<div><strong>FD Receipt No:</strong> ' + escHtml(b.fdrRecNo) + '</div>' +
          '<div><strong>Earmarked Fund:</strong> ' + escHtml(b.earmarked) + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div><strong>FDR No:</strong> <span style="font-family:monospace; color:#0D47A1; font-weight:bold;">' + escHtml(b.fdrNo) + '</span></div>' +
          '<div><strong>FDR Date:</strong> ' + escHtml(b.fdrDate) + '</div>' +
          '<div><strong>Maturity Date:</strong> ' + escHtml(b.maturityDate) + '</div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#0D47A1; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Deposit Amount</th>' +
          '<th style="padding:6px; text-align:center;">ROI (%)</th>' +
          '<th style="padding:6px; text-align:right;">Maturity Amount</th>' +
          '<th style="padding:6px; text-align:right;">Earned Interest</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr>' +
            '<td style="border:1px solid #ddd; padding:8px; font-weight:bold; font-family:monospace;">₹' + (b.amount || 0).toFixed(2) + '</td>' +
            '<td style="border:1px solid #ddd; padding:8px; text-align:center;">' + (b.roi || 0).toFixed(2) + '%</td>' +
            '<td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; color:#2E7D32; font-weight:bold;">₹' + (b.maturityAmt || 0).toFixed(2) + '</td>' +
            '<td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; color:#0D47A1; font-weight:bold;">₹' + (b.earnedInt || 0).toFixed(2) + '</td>' +
          '</tr>' +
        '</tbody>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
        '<div><strong>Prepared By</strong><br><br>_____________</div>' +
        '<div><strong>Secretary / Treasurer</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('fd-section-list').style.display = 'none';
    document.getElementById('fd-section-form').style.display = 'none';
    document.getElementById('fd-section-preview').style.display = 'flex';
  };

  window.showList = function () {
    document.getElementById('fd-section-form').style.display = 'none';
    document.getElementById('fd-section-preview').style.display = 'none';
    document.getElementById('fd-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('fd-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  window.applyFilters = function () { renderFdsTable(); };

  window.clearFilters = function () {
    ['flt-fdrno', 'flt-bank'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    renderFdsTable();
  };

  function todayISO() {
    var d = new Date();
    return d.toISOString().split('T')[0];
  }

  function todayNextYearISO() {
    var d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  }

  // Short-cuts (Alt+A, F2, Esc, Ctrl+P)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddFdForm();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedFd();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // INIT
  (async function init() {
    var _sn = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('fdSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('fdFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    await loadMasterData();
    await loadFds();
    showList();
  })();

})();
