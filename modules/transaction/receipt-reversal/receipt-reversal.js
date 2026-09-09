/**
 * receipt-reversal.js — JEEVIKA ERP v2
 * Member Receipt Reversal Directory & Live Ledger Panel Logic
 */

(function () {
  'use strict';

  var reversals = [];
  var receipts = [];
  var members = [];
  var accounts = [];
  var bills = [];
  var billTypes = [];
  var activeBillType = 'MAINTENANCE';
  var selectedReversalId = null;
  var sortDirection = 'desc';
  var activeDebitAccountType = 'Cash/Bank'; // 'Cash/Bank' or 'Other Ledger'
  var selectedMemberObj = null;
  var activeReversalFormBillType = 'MAINTENANCE';
  var pendingMismatchReceipt = null;

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
    return (window.Auth && window.Auth.getSocietyId) ? window.Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4');
  }

  function getFyId() {
    return (window.Auth && window.Auth.getFYId) ? window.Auth.getFYId() : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1');
  }

  function getFyLabel() {
    return (window.Auth && window.Auth.getFYLabel) ? window.Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');
  }

  async function fetchApiData(endpoint) {
    try {
      if (window.API && API.get) {
        var res = await API.get(endpoint);
        if (res) {
          if (Array.isArray(res)) return res;
          if (res.data && Array.isArray(res.data)) return res.data;
          if (res.items && Array.isArray(res.items)) return res.items;
          return res;
        }
      }
    } catch (e) {}
    try {
      var apiBase = (window.AppConfig && window.AppConfig.apiBase) ? window.AppConfig.apiBase : (window.API_BASE_URL || 'http://localhost:5002');
      var token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      var resp = await fetch(apiBase + endpoint, { headers: headers });
      if (resp.ok) {
        var json = await resp.json();
        if (json) {
          if (Array.isArray(json)) return json;
          if (json.data && Array.isArray(json.data)) return json.data;
          if (json.items && Array.isArray(json.items)) return json.items;
        }
      }
    } catch (err) {}
    return null;
  }

  // ── 1. LOAD DATA ────────────────────────────────────────────────
  async function loadBillTypes() {
    var sid = getActiveSocietyId();
    billTypes = [];

    // 1. Fetch from API
    var data = await fetchApiData('/api/bill-types?societyId=' + sid);
    if (data && Array.isArray(data) && data.length > 0) {
      data.forEach(function (b) {
        var name = (b.billTypeName || b.name || '').trim();
        if (name && !billTypes.some(function (x) { return x.billTypeName.toUpperCase() === name.toUpperCase(); })) {
          billTypes.push({
            billTypeId: b.billTypeId || b.id || Date.now(),
            billTypeName: name
          });
        }
      });
    }

    // 2. If API was empty, sync from localStorage
    if (billTypes.length === 0) {
      var storedStr = localStorage.getItem('jeevika_bill_types_' + sid) || localStorage.getItem('jeevika_bill_types_global');
      if (storedStr) {
        try {
          var parsed = JSON.parse(storedStr);
          if (Array.isArray(parsed)) {
            parsed.forEach(function (b) {
              var name = (b.billTypeName || b.name || '').trim();
              if (name && !billTypes.some(function (x) { return x.billTypeName.toUpperCase() === name.toUpperCase(); })) {
                billTypes.push({ billTypeId: b.billTypeId || b.id, billTypeName: name });
              }
            });
          } else if (parsed && typeof parsed === 'object') {
            Object.keys(parsed).forEach(function (typeName) {
              var name = typeName.trim();
              if (name && !billTypes.some(function (x) { return x.billTypeName.toUpperCase() === name.toUpperCase(); })) {
                billTypes.push({
                  billTypeId: (parsed[typeName] && parsed[typeName].id) || Date.now(),
                  billTypeName: name
                });
              }
            });
          }
        } catch (e) {}
      }
    }

    if (!billTypes || billTypes.length === 0) {
      billTypes = [
        { billTypeId: 1, billTypeName: 'MAINTENANCE' }
      ];
    }

    renderBillTypePills();
  }

  function renderBillTypePills() {
    var container = document.getElementById('rr-billtype-pills');
    if (!container) return;

    var html = '<button class="billtype-pill ' + (activeBillType === 'ALL' ? 'active' : '') + '" onclick="filterByBillType(\'ALL\', this)">ALL</button>';
    var seen = {};

    billTypes.forEach(function (bt) {
      var name = (bt.billTypeName || bt.name || '').trim().toUpperCase();
      if (!name || seen[name]) return;
      seen[name] = true;
      var isActive = (activeBillType === name);
      html += '<button class="billtype-pill ' + (isActive ? 'active' : '') + '" onclick="filterByBillType(\'' + escHtml(name) + '\', this)">' + escHtml(name) + '</button>';
    });

    container.innerHTML = html;
  }

  window.filterByBillType = function (type, el) {
    activeBillType = type.toUpperCase();
    renderBillTypePills();
    renderReversalsTable();
  };

  async function loadAccounts() {
    var sid = getActiveSocietyId();
    var data = await fetchApiData('/api/accounts?societyId=' + sid);
    if (data && Array.isArray(data) && data.length > 0) {
      accounts = data;
    } else if (typeof getStandardMasterAccounts === 'function') {
      accounts = getStandardMasterAccounts();
    } else {
      var stored = localStorage.getItem('jeevika_master_accounts') || localStorage.getItem('jeevika_accounts_' + sid);
      if (stored) {
        try { accounts = JSON.parse(stored); } catch (e) {}
      }
    }

    if (!accounts || accounts.length === 0) {
      accounts = [
        { accountId: 3001, accCode: 'ASS-1001', accName: 'Cash in Hand', groupName: 'Cash & Bank Balance', grpMainId: 1, mainGroup: 'Asset' },
        { accountId: 3002, accCode: 'ASS-1002', accName: 'The M.D C.C. Bank A/C No.', groupName: 'Cash & Bank Balance', grpMainId: 1, mainGroup: 'Asset' },
        { accountId: 3003, accCode: 'ASS-1003', accName: 'The Saraswat Bank A/C No.', groupName: 'Cash & Bank Balance', grpMainId: 1, mainGroup: 'Asset' },
        { accountId: 3004, accCode: 'ASS-1004', accName: 'HDFC Bank A/c 9482', groupName: 'Cash & Bank Balance', grpMainId: 1, mainGroup: 'Asset' },
        { accountId: 3005, accCode: 'ASS-1005', accName: 'SBI Current A/c 0184', groupName: 'Cash & Bank Balance', grpMainId: 1, mainGroup: 'Asset' },
        { accountId: 1001, accCode: 'INC-1001', accName: 'Property Tax', groupName: 'Rent & Taxes', grpMainId: 3, mainGroup: 'Income' },
        { accountId: 1004, accCode: 'INC-1004', accName: 'Service Charges', groupName: 'Maintenance & Service Charges', grpMainId: 3, mainGroup: 'Income' },
        { accountId: 1008, accCode: 'INC-1008', accName: 'Interest From Member', groupName: 'Interest Received From', grpMainId: 3, mainGroup: 'Income' },
        { accountId: 2001, accCode: 'EXP-1001', accName: 'Property Tax Exp.', groupName: 'Rent, Rates & Taxes', grpMainId: 4, mainGroup: 'Expenditure' },
        { accountId: 2010, accCode: 'EXP-1010', accName: 'Repair & Maintenance Exp.', groupName: 'Maintenance', grpMainId: 4, mainGroup: 'Expenditure' },
        { accountId: 4001, accCode: 'LIA-1001', accName: 'Paidup Share Capital', groupName: 'Issued, Sub. & Paid Up Captial', grpMainId: 2, mainGroup: 'Liability' }
      ];
    }
  }

  async function loadBills() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var data = await fetchApiData('/api/member-bills?societyId=' + sid + '&fyId=' + fyid);
    if (data && Array.isArray(data)) bills = data;

    if (!bills || bills.length === 0) {
      var stored = localStorage.getItem('jeevika_member_bills_' + sid);
      if (stored) {
        try { bills = JSON.parse(stored); } catch (e) {}
      }
    }
    if (!bills) bills = [];
  }

  async function loadReceipts() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var data = await fetchApiData('/api/member-receipts?societyId=' + sid + '&fyId=' + fyid);
    if (data && Array.isArray(data) && data.length > 0) {
      receipts = data;
    } else {
      var keys = ['jeevika_member_receipts_' + sid, 'jeevika_receipts_' + sid, 'jeevika_member_receipts_global', 'jeevika_receipts_global'];
      for (var i = 0; i < keys.length; i++) {
        var stored = localStorage.getItem(keys[i]);
        if (stored) {
          try {
            var parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              receipts = parsed;
              break;
            }
          } catch (e) {}
        }
      }
    }
    if (!receipts) receipts = [];
  }

  async function loadReversals() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var data = await fetchApiData('/api/receipt-reversals?societyId=' + sid + '&fyId=' + fyid);
    if (!data || !Array.isArray(data) || data.length === 0) {
      data = await fetchApiData('/api/receipt-reversals?societyId=' + sid);
    }
    reversals = (data && Array.isArray(data)) ? data : [];
    renderReversalsTable();
  }

  // ── 2. RENDER REGISTER TABLE & SORTING ────────────────────────────
  window.toggleReversalNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-revno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderReversalsTable();
  };

  function cleanParticulars(str) {
    if (!str || str === '-' || str === '—') return '-';
    var clean = String(str).replace(/\[BillType:[^\]]+\]\s*/gi, '').trim();
    return clean || '-';
  }

  function renderReversalsHeader() {
    var thead = document.querySelector('table.rr-main-table thead');
    if (!thead) return;
    var showBt = (activeBillType === 'ALL');
    thead.innerHTML = '<tr>' +
      '<th style="width:36px; text-align:center;"><input type="checkbox" id="chk-select-all" onclick="ERP_MultiChange.toggleSelectAll(this.checked, reversals.map(r=>r.reversalId||r.voucherId))" title="Select / Deselect All"></th>' +
      '<th style="width:125px; cursor:pointer;" onclick="toggleReversalNoSort()" title="Click to sort Top to Bottom / Bottom to Top">' +
        'REVERSAL NO. <span id="sort-revno-icon">' + (sortDirection === 'desc' ? '▼' : '▲') + '</span>' +
      '</th>' +
      '<th style="width:85px;">DATE</th>' +
      (showBt ? '<th style="width:110px; text-align:center;">BILL TYPE</th>' : '') +
      '<th style="width:110px;">CASH / BANK</th>' +
      '<th style="width:70px; text-align:center;">FLAT</th>' +
      '<th>MEM. NAME</th>' +
      '<th style="width:105px; text-align:right;">AMOUNT</th>' +
      '<th style="width:90px;">CHQ. NO.</th>' +
      '<th style="width:85px;">CHQ. DATE</th>' +
      '<th style="width:130px;">BANK</th>' +
      '<th style="width:110px;">BILL NO.</th>' +
      '<th style="width:140px;">PARTICULAR 1</th>' +
      '<th style="width:140px;">PARTICULAR 2</th>' +
      '<th style="width:90px; text-align:center;">CLEAR DATE</th>' +
    '</tr>';
  }

  function renderReversalsTable() {
    renderReversalsHeader();
    var tbody = document.getElementById('rr-list-tbody');
    if (!tbody) return;

    var showBt = (activeBillType === 'ALL');

    var filtered = reversals.filter(function (r) {
      if (activeBillType !== 'ALL' && (r.billType || 'MAINTENANCE').toUpperCase() !== activeBillType) return false;

      var fNo = (document.getElementById('flt-revno') ? document.getElementById('flt-revno').value.toLowerCase().trim() : '');
      var fMem = (document.getElementById('flt-member') ? document.getElementById('flt-member').value.toLowerCase().trim() : '');
      var fChq = (document.getElementById('flt-chqno') ? document.getElementById('flt-chqno').value.toLowerCase().trim() : '');

      if (fNo && (r.reversalNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fMem) {
        var mName = (r.memberName || '').toLowerCase();
        var pName = (r.personName || '').toLowerCase();
        var flat = (r.flatNo || r.wingFlat || '').toLowerCase();
        var wing = (r.wing || '').toLowerCase();
        var mCode = (r.memberCode || r.memCode || '').toLowerCase();
        var bNo = (r.billNo || '').toLowerCase();
        var part1 = (r.particular1 || '').toLowerCase();

        var matches = (
          mName.indexOf(fMem) !== -1 ||
          pName.indexOf(fMem) !== -1 ||
          flat.indexOf(fMem) !== -1 ||
          wing.indexOf(fMem) !== -1 ||
          mCode.indexOf(fMem) !== -1 ||
          bNo.indexOf(fMem) !== -1 ||
          part1.indexOf(fMem) !== -1
        );
        if (!matches) return false;
      }

      if (fChq && (r.chqNo || '').toLowerCase().indexOf(fChq) === -1) return false;

      return true;
    });

    filtered.sort(function (a, b) {
      var noA = (a.reversalNo || '').toLowerCase();
      var noB = (b.reversalNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('rr-list-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      var colspan = showBt ? 14 : 13;
      tbody.innerHTML = '<tr><td colspan="' + colspan + '" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Member Receipt Reversals Found</td></tr>';
      document.getElementById('sum-rev-count').textContent = '0';
      document.getElementById('sum-rev-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalGrd = 0;

    filtered.forEach(function (r) {
      var isSel = (r.reversalId === selectedReversalId);
      var amt = r.amount || 0;
      totalGrd += amt;

      var bTypeStr = (r.billType || 'MAINTENANCE').toUpperCase();
      var isRepair = bTypeStr.indexOf('REPAIR') !== -1;
      var btBadge = isRepair
        ? '<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:4px; font-weight:700; font-size:10px; border:1px solid #fde68a;">' + escHtml(bTypeStr) + '</span>'
        : '<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:700; font-size:10px; border:1px solid #bae6fd;">' + escHtml(bTypeStr) + '</span>';

      var rId = r.reversalId || r.voucherId;
      var chkHtml = (window.ERP_MultiChange && typeof ERP_MultiChange.renderCheckbox === 'function')
        ? ERP_MultiChange.renderCheckbox(rId)
        : '<td style="width:36px; text-align:center;"><input type="checkbox" class="row-chk" value="' + rId + '"></td>';

      html += '<tr class="' + (isSel ? 'selected' : '') + '" data-id="'+(r.reversalId||r.voucherId||r.reversalNo||r.voucherNo||'')+'" onclick="selectReversalRow(this.dataset.id, this)" ondblclick="editSelectedReversal(this.dataset.id)">' +
        chkHtml +
        '<td style="font-weight:700; color:#C62828;">' + (r.reversalNo || '') + '</td>' +
        '<td>' + (r.reversalDate || '') + '</td>' +
        (showBt ? '<td style="text-align:center;">' + btBadge + '</td>' : '') +
        '<td>' + (r.cashBank || 'Cash in Hand') + '</td>' +
        '<td style="text-align:center; font-weight:600;">' + (r.flatNo || r.wingFlat || '—') + '</td>' +
        '<td style="font-weight:700;">' + (r.memberName || r.personName || '') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#C62828;">' + amt.toFixed(2) + '</td>' +
        '<td>' + (r.chqNo || '—') + '</td>' +
        '<td>' + (r.chqDate || '—') + '</td>' +
        '<td>' + (r.bankName || '—') + '</td>' +
        '<td>' + (r.billNo || '—') + '</td>' +
        '<td>' + escHtml(cleanParticulars(r.particular1)) + '</td>' +
        '<td>' + escHtml(cleanParticulars(r.particular2)) + '</td>' +
        '<td style="text-align:center;">' + (r.clearDate || r.reversalDate || '—') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-rev-count').textContent = filtered.length;
    document.getElementById('sum-rev-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    initColumnResizing();
  }

  function initColumnResizing() {
    setTimeout(function () {
      var tables = document.querySelectorAll('table.rr-main-table');
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

  window.selectReversalRow = function (id, trEl) {
    selectedReversalId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('selected'); });
      trEl.classList.add('selected');
    }
  };

  // ── 3. ACCOUNTS FILTERING & SEARCHABLE COMBOBOX ──────────────────
  // Main Group: Asset (grpMainId === 1 or mainGroup === 'Asset')
  // Primary Group: Cash & Bank Balance (groupName contains 'Cash & Bank')
  function isCashBankAccount(a) {
    var isAsset = (a.grpMainId === 1) || (String(a.mainGroup || '').toLowerCase() === 'asset');
    var isCashBankGrp = String(a.groupName || a.grpName || '').toLowerCase().includes('cash & bank') ||
                        String(a.groupName || a.grpName || '').toLowerCase().includes('cash and bank');
    return isAsset && isCashBankGrp;
  }

  window.onDebitAccountTypeChange = function (type, preselectedAccValue) {
    activeDebitAccountType = type || 'Cash/Bank';
    var isCashBank = (activeDebitAccountType === 'Cash/Bank');

    // Sync radio buttons
    var radCB = document.getElementById('deb-cashbank');
    var radOther = document.getElementById('deb-other');
    if (radCB) radCB.checked = isCashBank;
    if (radOther) radOther.checked = !isCashBank;

    var filteredAccs = accounts.filter(function (a) {
      var isCB = isCashBankAccount(a);
      return isCashBank ? isCB : !isCB;
    });

    if (filteredAccs.length === 0) {
      if (isCashBank) {
        filteredAccs = [
          { accountId: 3001, accCode: 'ASS-1001', accName: 'Cash in Hand' },
          { accountId: 3002, accCode: 'ASS-1002', accName: 'The M.D C.C. Bank A/C No.' },
          { accountId: 3003, accCode: 'ASS-1003', accName: 'The Saraswat Bank A/C No.' },
          { accountId: 3004, accCode: 'ASS-1004', accName: 'HDFC Bank A/c 9482' },
          { accountId: 3005, accCode: 'ASS-1005', accName: 'SBI Current A/c 0184' }
        ];
      } else {
        filteredAccs = accounts.filter(function (a) { return !isCashBankAccount(a); });
      }
    }

    // Format options for select & combobox
    var sel = document.getElementById('frm-account');
    if (sel) {
      var html = '<option value="">— Select Account —</option>';
      filteredAccs.forEach(function (a) {
        var label = (a.accCode ? a.accCode + ' - ' : '') + (a.accName || '');
        var val = a.accName || a.accountId;
        html += '<option value="' + escHtml(val) + '" data-id="' + (a.accountId || '') + '" data-code="' + escHtml(a.accCode || '') + '">' + escHtml(label) + '</option>';
      });
      sel.innerHTML = html;
    }

    // Remove existing combo wrap so it cleanly re-binds with new filtered list
    var existingWrap = document.getElementById('frm-account-combo-wrap');
    if (existingWrap) existingWrap.remove();
    if (sel) sel.style.display = '';

    // Initialize searchable combobox
    if (typeof initAccountSearchCombobox === 'function') {
      initAccountSearchCombobox('frm-account', filteredAccs);
    }

    // Pre-select if value is provided
    if (preselectedAccValue) {
      var foundAcc = filteredAccs.find(function (a) {
        return (a.accName || '').toLowerCase() === String(preselectedAccValue).toLowerCase() ||
               (a.accCode || '').toLowerCase() === String(preselectedAccValue).toLowerCase() ||
               String(a.accountId) === String(preselectedAccValue);
      });
      if (foundAcc && typeof _setComboValue === 'function') {
        var lbl = (foundAcc.accCode ? foundAcc.accCode + ' - ' : '') + foundAcc.accName;
        _setComboValue('frm-account', foundAcc.accName || foundAcc.accountId, lbl);
      } else if (sel) {
        sel.value = preselectedAccValue;
        var inp = document.getElementById('frm-account-combo-inp');
        if (inp) inp.value = preselectedAccValue;
      }
    } else if (filteredAccs.length > 0) {
      var firstAcc = filteredAccs[0];
      var firstLbl = (firstAcc.accCode ? firstAcc.accCode + ' - ' : '') + firstAcc.accName;
      if (typeof _setComboValue === 'function') {
        _setComboValue('frm-account', firstAcc.accName || firstAcc.accountId, firstLbl);
      }
    }
  };

  // ── 4. MEMBERS DATA & MANUAL MODE ────────────────────────────────
  async function loadMembers() {
    var sid = getActiveSocietyId();
    var data = await fetchApiData('/api/members?societyId=' + sid);
    if (!data || !Array.isArray(data) || data.length === 0) {
      data = await fetchApiData('/api/members');
    }
    if (data && Array.isArray(data) && data.length > 0) {
      members = data;
    } else {
      var keys = ['jeevika_master_members', 'mmList', 'jeevika_members_' + sid, 'jeevika_members_global', 'jeevika_society_members', 'jeevika_member_master'];
      for (var i = 0; i < keys.length; i++) {
        var stored = localStorage.getItem(keys[i]);
        if (stored) {
          try {
            var parsed = JSON.parse(stored);
            if (parsed) {
              if (Array.isArray(parsed) && parsed.length > 0) { members = parsed; break; }
              if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) { members = parsed.data; break; }
            }
          } catch (e) {}
        }
      }
    }

    if (!members) members = [];
  }

  function isMemberManualModeConfigured() {
    var sid = getActiveSocietyId();
    var cfgStr = localStorage.getItem('jeevika_config_notes_' + sid) || localStorage.getItem('jeevika_config_notes_global');
    if (cfgStr) {
      try {
        var cfg = JSON.parse(cfgStr);
        if (typeof cfg.allowMemberManualMode !== 'undefined') return !!cfg.allowMemberManualMode;
        if (cfg.manualModules && Array.isArray(cfg.manualModules)) {
          var rev = cfg.manualModules.find(function (m) { return m.key === 'Reversal'; });
          if (rev) return !!rev.manual;
        }
      } catch (e) {}
    }
    return true; // default true to allow user flexible toggling
  }

  async function populateManualMembersDropdown() {
    var sel = document.getElementById('frm-memname-select');
    if (!sel) return;

    if (!members || members.length === 0) {
      await loadMembers();
    }

    var html = '<option value="">— Select Member —</option>';
    var seen = {};

    members.forEach(function (m) {
      var name = (m.memName || m.memberName || m.name || m.MemName || '').trim();
      if (!name) return;
      var wing = (m.wing || m.Wing || '').trim();
      var flat = (m.flatNo || m.FlatNo || '').trim();
      var mCode = (m.memCode || m.memberCode || m.MemCode || '').trim();
      var flatLabel = (wing || flat ? (wing ? wing + '-' : '') + flat : '');
      if (!mCode) mCode = flatLabel;

      var displayLabel = (mCode ? mCode + ' - ' : '') + name + (flatLabel ? ' (' + flatLabel + ')' : '');
      var id = m.memberId || m.socMemId || m.MemberId || (wing + flat);

      var key = id + '|' + name.toUpperCase();
      if (seen[key]) return;
      seen[key] = true;

      html += '<option value="' + id + '" data-code="' + escHtml(mCode) + '" data-wing="' + escHtml(wing) + '" data-flat="' + escHtml(flat) + '" data-name="' + escHtml(name) + '">' + escHtml(displayLabel) + '</option>';
    });

    sel.innerHTML = html;
  }

  window.toggleMemberManualMode = function (checked) {
    var inp = document.getElementById('frm-memname');
    var sel = document.getElementById('frm-memname-select');
    var btnFetch = document.querySelector('.btn-fetch-red');
    var rcptInp = document.getElementById('frm-receiptno');
    var prin = document.getElementById('frm-principal');
    var intInp = document.getElementById('frm-interest');
    var amtInp = document.getElementById('frm-amount');

    if (checked) {
      if (inp) inp.style.display = 'none';
      if (sel) {
        sel.style.display = 'block';
        populateManualMembersDropdown();
      }
      if (btnFetch) {
        btnFetch.style.opacity = '0.5';
      }
      if (rcptInp) {
        rcptInp.readOnly = true;
        rcptInp.style.background = '#e2e8f0';
        rcptInp.value = 'Manual Mode: N/A';
      }
      if (amtInp) {
        amtInp.readOnly = false;
        amtInp.style.background = '#ffffff';
      }
      if (prin) {
        prin.readOnly = false;
        prin.style.background = '#ffffff';
      }
      if (intInp) {
        intInp.readOnly = false;
        intInp.style.background = '#ffffff';
      }
    } else {
      if (inp) inp.style.display = 'block';
      if (sel) sel.style.display = 'none';
      if (btnFetch) {
        btnFetch.style.opacity = '1';
      }
      if (rcptInp) {
        rcptInp.readOnly = false;
        rcptInp.style.background = '#ffffff';
        rcptInp.value = '';
        rcptInp.placeholder = '01';
      }
      if (amtInp) {
        amtInp.readOnly = true;
        amtInp.style.background = '#e2e8f0';
      }
      if (prin) {
        prin.readOnly = true;
        prin.style.background = '#e2e8f0';
      }
      if (intInp) {
        intInp.readOnly = true;
        intInp.style.background = '#e2e8f0';
      }
    }
  };

  window.onManualMemberSelect = async function (val) {
    if (!val) {
      selectedMemberObj = null;
      document.getElementById('frm-memcode').value = '—';
      document.getElementById('frm-memname').value = '';
      document.getElementById('rr-ledger-empty').style.display = 'flex';
      document.getElementById('rr-ledger-content').style.display = 'none';
      return;
    }

    if (!receipts || receipts.length === 0) {
      await loadReceipts();
    }

    var sel = document.getElementById('frm-memname-select');
    var opt = sel ? sel.options[sel.selectedIndex] : null;
    var name = opt ? opt.getAttribute('data-name') : '';
    var code = opt ? opt.getAttribute('data-code') : '';
    var wing = opt ? opt.getAttribute('data-wing') : '';
    var flat = opt ? opt.getAttribute('data-flat') : '';

    var m = members.find(function (x) {
      return String(x.memberId || x.socMemId || x.MemberId) === String(val) ||
             (x.memName && x.memName === name);
    });
    selectedMemberObj = m || { memName: name, wing: wing, flatNo: flat, memCode: code };

    // Check if this member has ANY receipts in database
    var memberReceipts = receipts.filter(function (r) {
      var rMid = r.memberId || r.socMemId;
      var rName = (r.memberName || r.personName || '').toLowerCase().trim();
      var rFlat = (r.flatNo || r.wingFlat || '').toLowerCase().trim();
      var targetFlat = (wing && flat ? wing + '-' + flat : (flat || code || '')).toLowerCase().trim();
      return (rMid && String(rMid) === String(val)) ||
             (name && rName === name.toLowerCase().trim()) ||
             (targetFlat && (rFlat === targetFlat || (flat && rFlat.includes(flat.toLowerCase()))));
    });

    if (memberReceipts.length === 0) {
      if (typeof showAlert === 'function') {
        await showAlert('This member does not have any receipts to reverse.', 'No Receipts Found', 'warning');
      } else if (typeof showAlertModal === 'function') {
        await showAlertModal('This member does not have any receipts to reverse.', 'No Receipts Found', 'warning');
      } else {
        toast('This member does not have any receipts to reverse.', false);
      }
      if (sel) sel.value = '';
      document.getElementById('frm-memcode').value = '—';
      document.getElementById('frm-memname').value = '';
      document.getElementById('rr-ledger-empty').style.display = 'flex';
      document.getElementById('rr-ledger-content').style.display = 'none';
      return;
    }

    document.getElementById('frm-memname').value = name;
    document.getElementById('frm-memcode').value = code || (wing && flat ? wing + '-' + flat : flat);

    // Populate Member Info Card in sidebar
    var flatLabel = (wing && flat) ? (wing + '-' + flat) : (flat || code || '—');
    document.getElementById('led-flat').textContent = flatLabel;
    document.getElementById('led-area').textContent = (m && m.area) ? (m.area + ' sq.ft') : '—';
    document.getElementById('led-mobile1').textContent = (m && (m.mobileNo || m.mobile1 || m.contactNo)) ? (m.mobileNo || m.mobile1 || m.contactNo) : '—';
    document.getElementById('led-mobile2').textContent = (m && (m.mobile2 || m.altContact)) ? (m.mobile2 || m.altContact) : '—';

    // Populate Member Bills into Against Bill
    var memBills = bills.filter(function (b) {
      return (String(b.memberId) === String(val)) ||
             (b.memCode && b.memCode === code) ||
             (b.flatNo && b.flatNo === flat);
    });

    if (memBills.length > 0) {
      document.getElementById('frm-against-bill').value = memBills[0].billNo || ('BILL/' + (memBills[0].billId || '01'));
    } else {
      document.getElementById('frm-against-bill').value = '—';
    }

    // Calculate Dues for BEFORE REVERSAL
    var totPrin = 0, totInt = 0;
    if (memBills.length > 0) {
      memBills.forEach(function (b) {
        totPrin += (b.balanceAmount || b.principalAmount || 0);
        totInt += (b.interestAmount || 0);
      });
    } else {
      totPrin = 5000.00;
      totInt = 1200.00;
    }

    document.getElementById('led-bef-prin').textContent = totPrin.toFixed(2);
    document.getElementById('led-bef-int').textContent = totInt.toFixed(2);
    document.getElementById('led-bef-tot').textContent = (totPrin + totInt).toFixed(2);

    // Dynamic calculate adjustments
    onAmountOrBifurcationChange();

    document.getElementById('rr-ledger-empty').style.display = 'none';
    document.getElementById('rr-ledger-content').style.display = 'flex';
  };

  window.enableManualBifurcation = function () {
    var prin = document.getElementById('frm-principal');
    var intInp = document.getElementById('frm-interest');
    if (prin) {
      prin.readOnly = false;
      prin.style.background = '#ffffff';
      prin.style.border = '1px solid #1565C0';
      prin.focus();
    }
    if (intInp) {
      intInp.readOnly = false;
      intInp.style.background = '#ffffff';
      intInp.style.border = '1px solid #1565C0';
    }
    toast('Manual bifurcation enabled. You can now edit Principal and Interest.', true);
  };

  // ── 5. LIVE REVERSAL AMOUNT & DUES CALCULATION ─────────────────────
  window.onAmountOrBifurcationChange = function () {
    var amtInp = document.getElementById('frm-amount');
    var prinInp = document.getElementById('frm-principal');
    var intInp = document.getElementById('frm-interest');

    var amt = parseFloat(amtInp ? amtInp.value : 0) || 0;
    var prin = parseFloat(prinInp ? prinInp.value : 0) || 0;
    var intAmt = parseFloat(intInp ? intInp.value : 0) || 0;

    // If principal is 0 and amount is entered, default principal to amount
    if (amt > 0 && prin === 0 && intAmt === 0 && prinInp && prinInp.readOnly) {
      prin = amt;
      prinInp.value = prin.toFixed(2);
    } else if (amt === 0 && (prin > 0 || intAmt > 0)) {
      amt = prin + intAmt;
      if (amtInp) amtInp.value = amt.toFixed(2);
    }

    var befPrin = parseFloat(document.getElementById('led-bef-prin').textContent) || 0;
    var befInt = parseFloat(document.getElementById('led-bef-int').textContent) || 0;
    var befTot = befPrin + befInt;

    var adjPrin = prin;
    var adjInt = intAmt;

    var aftPrin = befPrin + adjPrin;
    var aftInt = befInt + adjInt;
    var aftTot = befTot + (adjPrin + adjInt);

    // Update Adjustment card
    document.getElementById('led-adj-prin').textContent = adjPrin.toFixed(2);
    document.getElementById('led-adj-int').textContent = adjInt.toFixed(2);

    // Update After Reversal card
    document.getElementById('led-aft-prin').textContent = aftPrin.toFixed(2);
    document.getElementById('led-aft-int').textContent = aftInt.toFixed(2);
    document.getElementById('led-aft-tot').textContent = aftTot.toFixed(2);
  };

  function getMemberReceiptPrefix() {
    if (typeof getTxNextVoucherNo === 'function') {
      var sample = getTxNextVoucherNo('receipt', 0);
      var lastSlash = sample.lastIndexOf('/');
      if (lastSlash !== -1) {
        return sample.substring(0, lastSlash + 1);
      }
    }
    var fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    return 'MRV/' + fy + '/';
  }

  // ── 6. FETCH VIA MEMBER RECEIPT NO. & LOOKUP MODAL ────────────────
  window.fetchReceiptForReversal = async function (specificReceiptNo) {
    var rawInput = (specificReceiptNo || (document.getElementById('frm-receiptno') ? document.getElementById('frm-receiptno').value : '') || '').trim();
    var pfxEl = document.getElementById('lbl-rcpt-prefix');
    var prefix = pfxEl ? pfxEl.textContent.trim() : getMemberReceiptPrefix();

    // If no query entered, open Receipt Lookup Modal for easy browsing
    if (!rawInput || rawInput === 'MANUAL MODE: N/A') {
      openReceiptLookupModal();
      return;
    }

    if (!receipts || receipts.length === 0) {
      await loadReceipts();
    }

    var cleanInput = rawInput.toUpperCase();
    var cleanPrefix = prefix.toUpperCase();

    // Candidate patterns for matching
    var candidate1 = cleanInput;
    var candidate2 = cleanInput.startsWith(cleanPrefix) ? cleanInput : (cleanPrefix + cleanInput);
    var candidate3 = cleanInput.startsWith(cleanPrefix) ? cleanInput : (cleanPrefix + cleanInput.padStart(2, '0'));
    var shortPrefix = cleanPrefix.replace('/20', '/');
    var candidate4 = cleanInput.startsWith(shortPrefix) ? cleanInput : (shortPrefix + cleanInput);
    var candidate5 = cleanInput.startsWith(shortPrefix) ? cleanInput : (shortPrefix + cleanInput.padStart(2, '0'));

    function isMatchingReceipt(r) {
      var rNo = (r.receiptNo || r.voucherNo || '').trim().toUpperCase();
      if (!rNo) return false;

      // 1. Exact full code matches
      if (rNo === candidate1 || rNo === candidate2 || rNo === candidate3 || rNo === candidate4 || rNo === candidate5) {
        return true;
      }

      // 2. Numeric trailing part match (e.g. user typed "2", "02", "002")
      if (/^\d+$/.test(cleanInput)) {
        var parts = rNo.split('/');
        var lastPart = parts[parts.length - 1].trim();
        if (lastPart === cleanInput || parseInt(lastPart, 10) === parseInt(cleanInput, 10)) {
          return true;
        }
      }

      // 3. Exact match on part after last slash
      var lastSlash = rNo.lastIndexOf('/');
      if (lastSlash !== -1) {
        var suffix = rNo.substring(lastSlash + 1).trim();
        if (suffix === cleanInput || (suffix.length > 0 && suffix.padStart(2, '0') === cleanInput.padStart(2, '0'))) {
          return true;
        }
      }

      return false;
    }

    var found = receipts.find(isMatchingReceipt);

    if (!found) {
      // Query API dynamically if not found in current FY cache
      var sid = getActiveSocietyId();
      var data = await fetchApiData('/api/member-receipts?societyId=' + sid + '&fyId=0');
      if (data && Array.isArray(data) && data.length > 0) {
        receipts = data;
        found = receipts.find(isMatchingReceipt);
      }
    }

    if (!found) {
      toast('Receipt ' + (cleanInput.startsWith(cleanPrefix) ? cleanInput : (cleanPrefix + cleanInput)) + ' not found. Select from the receipt list.', false);
      openReceiptLookupModal(cleanInput);
      return;
    }

    var rcptBillType = (found.billType || found.billTypeName || 'Maintenance').trim();
    var curFormType = (activeReversalFormBillType || 'Maintenance').trim();

    if (rcptBillType.toUpperCase() !== curFormType.toUpperCase()) {
      pendingMismatchReceipt = found;
      showBillTypeMismatchModal(found, rcptBillType, curFormType);
      return;
    }

    populateReceiptDataIntoForm(found);
  };

  function showBillTypeMismatchModal(receipt, actualType, currentType) {
    var rNo = receipt.receiptNo || receipt.voucherNo || '—';
    var modal = document.getElementById('modal-billtype-mismatch');
    if (!modal) {
      if (confirm("Receipt " + rNo + " belongs to '" + actualType + "' bill type, but current form is open for '" + currentType + "'. Switch to " + actualType + " and proceed?")) {
        confirmBillTypeMismatchSwitch();
      }
      return;
    }

    var elRNo = document.getElementById('btm-receipt-no');
    var elActual = document.getElementById('btm-actual-billtype');
    var elCurrent = document.getElementById('btm-current-billtype');
    var elPrompt = document.getElementById('btm-prompt-billtype');
    var btnSwitch = document.getElementById('btn-btm-switch');

    if (elRNo) elRNo.textContent = rNo;
    if (elActual) elActual.textContent = actualType.toUpperCase();
    if (elCurrent) elCurrent.textContent = currentType.toUpperCase();
    if (elPrompt) elPrompt.textContent = "'" + actualType.toUpperCase() + "'";
    if (btnSwitch) btnSwitch.innerHTML = '<i class="bi bi-arrow-repeat"></i> SWITCH TO ' + escHtml(actualType.toUpperCase()) + ' &amp; PROCEED';

    modal.style.display = 'flex';
  }

  window.cancelBillTypeMismatch = function () {
    pendingMismatchReceipt = null;
    closeModal('modal-billtype-mismatch');
    var inp = document.getElementById('frm-receiptno');
    if (inp) {
      inp.focus();
      inp.select();
    }
  };

  window.confirmBillTypeMismatchSwitch = async function () {
    if (!pendingMismatchReceipt) {
      closeModal('modal-billtype-mismatch');
      return;
    }
    var targetReceipt = pendingMismatchReceipt;
    pendingMismatchReceipt = null;
    closeModal('modal-billtype-mismatch');

    var newBillType = (targetReceipt.billType || targetReceipt.billTypeName || 'Maintenance').trim();
    activeReversalFormBillType = newBillType;
    var formattedName = newBillType.charAt(0).toUpperCase() + newBillType.slice(1).toLowerCase();
    var titleEl = document.getElementById('rr-module-title');
    if (titleEl) {
      titleEl.textContent = 'Member Receipt Reversal [' + formattedName + ']';
    }

    populateReceiptDataIntoForm(targetReceipt);
    toast('Switched to ' + newBillType + ' Reversal.', true);
  };

  function populateReceiptDataIntoForm(found) {
    var rNo = found.receiptNo || found.voucherNo || '';
    var pfx = getMemberReceiptPrefix();
    var pfxEl = document.getElementById('lbl-rcpt-prefix');
    if (pfxEl) pfxEl.textContent = pfx;

    if (rNo.toUpperCase().startsWith(pfx.toUpperCase())) {
      document.getElementById('frm-receiptno').value = rNo.substring(pfx.length);
    } else if (rNo.toUpperCase().startsWith(pfx.replace('/20', '/').toUpperCase())) {
      document.getElementById('frm-receiptno').value = rNo.substring(pfx.replace('/20', '/').length);
    } else {
      document.getElementById('frm-receiptno').value = rNo;
    }
    document.getElementById('frm-revdate').value = todayISO();

    var flat = found.flatNo || found.wingFlat || '';
    var mName = found.memberName || found.personName || '';

    // Match member in member master
    var m = members.find(function (x) {
      var xName = (x.memName || x.memberName || x.name || '').toLowerCase().trim();
      var xFlat = (x.flatNo || x.FlatNo || '').toLowerCase().trim();
      var xWing = (x.wing || x.Wing || '').toLowerCase().trim();
      var fullFlat = (xWing ? xWing + '-' : '') + xFlat;

      return (found.memberId && String(x.memberId || x.socMemId) === String(found.memberId)) ||
             (mName && xName === mName.toLowerCase().trim()) ||
             (flat && (fullFlat === flat.toLowerCase().trim() || xFlat === flat.toLowerCase().trim()));
    });

    selectedMemberObj = m;

    var memCodeVal = m ? (m.memCode || ((m.wing ? m.wing + '-' : '') + (m.flatNo || ''))) : (flat || '—');
    var memNameVal = m ? (m.memName || m.name || mName) : mName;

    document.getElementById('frm-memcode').value = memCodeVal;
    document.getElementById('frm-memname').value = memNameVal;

    // Debit Account Type & Deposit To (Account)
    var cashBankVal = found.cashBank || 'Cash in Hand';
    var isCashBank = cashBankVal.toLowerCase().includes('cash') ||
                     cashBankVal.toLowerCase().includes('bank') ||
                     cashBankVal.toLowerCase().includes('hdfc') ||
                     cashBankVal.toLowerCase().includes('sbi') ||
                     cashBankVal.toLowerCase().includes('ass-100');

    window.onDebitAccountTypeChange(isCashBank ? 'Cash/Bank' : 'Other Ledger', cashBankVal);

    document.getElementById('frm-against-bill').value = found.billNo || found.refNo || '—';
    document.getElementById('frm-transtype').value = found.transType || (found.chqNo ? 'Cheque' : 'Cash');
    document.getElementById('frm-chqno').value = found.chqNo || '—';
    document.getElementById('frm-chqdate').value = found.chqDate || '';
    document.getElementById('frm-refno').value = found.refNo || found.receiptNo || '—';
    document.getElementById('frm-bank').value = found.bankName || '—';

    var amt = parseFloat(found.amount || 0);
    var prin = parseFloat(found.principalAmount || found.amount || 0);
    var intAmt = parseFloat(found.interestAmount || 0);

    document.getElementById('frm-amount').value = amt.toFixed(2);
    document.getElementById('frm-principal').value = prin.toFixed(2);
    document.getElementById('frm-interest').value = intAmt.toFixed(2);

    document.getElementById('frm-particular1').value = 'Reversal of Receipt ' + (found.receiptNo || found.voucherNo || '');
    document.getElementById('frm-particular2').value = 'Cheque Dishonoured by Bank';

    // Populate Right Sidebar: MEMBER INFO
    var wingFlatStr = m ? ((m.wing ? m.wing + '-' : '') + (m.flatNo || '')) : (flat || '—');
    document.getElementById('led-flat').textContent = wingFlatStr;
    document.getElementById('led-area').textContent = (m && m.area) ? (m.area + ' sq.ft') : '—';
    document.getElementById('led-mobile1').textContent = (m && (m.mobileNo || m.mobile1 || m.contactNo)) ? (m.mobileNo || m.mobile1 || m.contactNo) : '—';
    document.getElementById('led-mobile2').textContent = (m && (m.mobile2 || m.altContact)) ? (m.mobile2 || m.altContact) : '—';

    // Calculate Dues for BEFORE REVERSAL
    var mId = m ? (m.memberId || m.socMemId) : found.memberId;
    var memBills = bills.filter(function (b) {
      return (mId && String(b.memberId) === String(mId)) ||
             (flat && (b.flatNo === flat || (b.wing && b.flatNo && (b.wing + '-' + b.flatNo) === flat)));
    });

    var totPrin = 0, totInt = 0;
    if (memBills.length > 0) {
      memBills.forEach(function (b) {
        totPrin += (b.balanceAmount || b.principalAmount || 0);
        totInt += (b.interestAmount || 0);
      });
    } else {
      totPrin = 5000.00;
      totInt = 1200.00;
    }

    document.getElementById('led-bef-prin').textContent = totPrin.toFixed(2);
    document.getElementById('led-bef-int').textContent = totInt.toFixed(2);
    document.getElementById('led-bef-tot').textContent = (totPrin + totInt).toFixed(2);

    // Compute adjustment & after reversal
    onAmountOrBifurcationChange();

    document.getElementById('rr-ledger-empty').style.display = 'none';
    document.getElementById('rr-ledger-content').style.display = 'flex';

    toast('Receipt ' + (found.receiptNo || '') + ' fetched successfully.', true);
  }

  // ── RECEIPT LOOKUP MODAL ─────────────────────────────────────────
  window.openReceiptLookupModal = async function (searchFilter) {
    if (!receipts || receipts.length === 0) {
      await loadReceipts();
    }

    var modal = document.getElementById('modal-receipt-lookup');
    var searchInp = document.getElementById('lookup-receipt-search');
    if (searchInp) searchInp.value = searchFilter || '';

    if (modal) modal.style.display = 'flex';
    filterReceiptLookupTable();
    if (searchInp) {
      setTimeout(function () { searchInp.focus(); }, 100);
    }
  };

  window.filterReceiptLookupTable = function () {
    var searchInp = document.getElementById('lookup-receipt-search');
    var q = (searchInp ? searchInp.value : '').toLowerCase().trim();
    var tbody = document.getElementById('lookup-receipt-tbody');
    var countEl = document.getElementById('lookup-receipt-count');
    if (!tbody) return;

    var filtered = receipts.filter(function (r) {
      if (!q) return true;
      var rNo = (r.receiptNo || r.voucherNo || '').toLowerCase();
      var mName = (r.memberName || r.personName || '').toLowerCase();
      var flat = (r.flatNo || r.wingFlat || '').toLowerCase();
      var chq = (r.chqNo || '').toLowerCase();
      var bName = (r.bankName || '').toLowerCase();
      return rNo.indexOf(q) !== -1 || mName.indexOf(q) !== -1 || flat.indexOf(q) !== -1 || chq.indexOf(q) !== -1 || bName.indexOf(q) !== -1;
    });

    if (countEl) countEl.textContent = filtered.length + ' receipts';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:25px; color:#94a3b8; font-weight:600;">No matching receipts found.</td></tr>';
      return;
    }

    var html = '';
    filtered.forEach(function (r, idx) {
      var bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      var rNo = r.receiptNo || r.voucherNo || '';
      var amt = parseFloat(r.amount || 0);

      html += '<tr style="background:' + bg + '; cursor:pointer; border-bottom:1px solid #e2e8f0;" ' +
        'onclick="selectReceiptFromLookup(\'' + escHtml(rNo) + '\')" ' +
        'onmouseover="this.style.background=\'#e0f2fe\'" onmouseout="this.style.background=\'' + bg + '\'">' +
        '<td style="padding:6px 10px; font-weight:700; color:#1565C0;">' + escHtml(rNo) + '</td>' +
        '<td style="padding:6px 10px;">' + escHtml(r.receiptDate || '') + '</td>' +
        '<td style="padding:6px 10px; text-align:center; font-weight:600;">' + escHtml(r.flatNo || r.wingFlat || '—') + '</td>' +
        '<td style="padding:6px 10px; font-weight:600;">' + escHtml(r.memberName || r.personName || '') + '</td>' +
        '<td style="padding:6px 10px; text-align:right; font-weight:800; color:#2E7D32;">₹' + amt.toFixed(2) + '</td>' +
        '<td style="padding:6px 10px;">' + escHtml(r.chqNo || '—') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
  };

  window.selectReceiptFromLookup = function (receiptNo) {
    closeModal('modal-receipt-lookup');
    var r = receipts.find(function (x) { return (x.receiptNo || x.voucherNo) === receiptNo; });
    if (r) {
      var rcptBillType = (r.billType || r.billTypeName || 'Maintenance').trim();
      var curFormType = (activeReversalFormBillType || 'Maintenance').trim();

      if (rcptBillType.toUpperCase() !== curFormType.toUpperCase()) {
        pendingMismatchReceipt = r;
        showBillTypeMismatchModal(r, rcptBillType, curFormType);
        return;
      }

      populateReceiptDataIntoForm(r);
    }
  };

  // ── 7. OPEN FORM & INITIALIZATION ────────────────────────────────
  window.handleAddReversalClick = async function (evt) {
    if (evt) {
      evt.preventDefault();
      evt.stopPropagation();
    }
    await loadBillTypes();
    var menu = document.getElementById('add-reversal-menu');
    if (activeBillType === 'ALL') {
      if (menu) {
        if (menu.style.display === 'block') {
          menu.style.display = 'none';
        } else {
          var listToRender = (billTypes && billTypes.length > 0) ? billTypes : [
            { billTypeName: 'MAINTENANCE' }
          ];
          var html = '';
          var seen = {};
          listToRender.forEach(function (bt) {
            var name = (bt.billTypeName || bt.name || '').trim();
            var key = name.toUpperCase();
            if (!name || seen[key]) return;
            seen[key] = true;
            html += '<div style="padding:6px 12px; font-size:11px; font-weight:700; color:#1e293b; cursor:pointer; text-transform:uppercase;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'" onclick="openAddReversalFormForType(\'' + escHtml(name) + '\')">' + escHtml(name) + '</div>';
          });
          menu.innerHTML = html;
          menu.style.display = 'block';
        }
      }
    } else {
      if (menu) menu.style.display = 'none';
      openAddReversalFormForType(activeBillType);
    }
  };

  window.openAddReversalFormForType = async function (typeName) {
    var menu = document.getElementById('add-reversal-menu');
    if (menu) menu.style.display = 'none';

    selectedReversalId = null;
    selectedMemberObj = null;
    var displayName = typeName || 'Maintenance';
    activeReversalFormBillType = displayName;
    var formattedName = displayName.charAt(0).toUpperCase() + displayName.slice(1).toLowerCase();
    document.getElementById('rr-module-title').textContent = 'Member Receipt Reversal [' + formattedName + ']';

    var showToggle = isMemberManualModeConfigured();
    var wrapToggle = document.getElementById('wrap-mem-manual-toggle');
    if (wrapToggle) wrapToggle.style.display = showToggle ? 'flex' : 'none';

    var btnBifurcation = document.querySelector('.btn-manual-entry');
    if (btnBifurcation) btnBifurcation.style.display = 'inline-flex';

    var chkManual = document.getElementById('chk-mem-manual-mode');
    if (chkManual) {
      chkManual.checked = false;
      toggleMemberManualMode(false);
    }

    var revNoEl = document.getElementById('frm-revno');
    if (revNoEl) {
      revNoEl.readOnly = false;
      revNoEl.disabled = false;
      revNoEl.value = (typeof fetchTxNextVoucherNo === 'function') 
        ? await fetchTxNextVoucherNo('reversal', reversals) 
        : getTxNextVoucherNo('reversal', reversals);
    }
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-revno', 'Reversal');

    var rcptPrefix = getMemberReceiptPrefix();
    var pfxEl = document.getElementById('lbl-rcpt-prefix');
    if (pfxEl) pfxEl.textContent = rcptPrefix;

    document.getElementById('frm-receiptno').value = '';
    document.getElementById('frm-revdate').value = todayISO();
    document.getElementById('frm-memcode').value = '—';
    document.getElementById('frm-memname').value = '';
    document.getElementById('frm-against-bill').value = '—';
    document.getElementById('frm-transtype').value = '';
    document.getElementById('frm-chqno').value = '';
    document.getElementById('frm-chqdate').value = '';
    document.getElementById('frm-refno').value = '';
    document.getElementById('frm-bank').value = '';
    document.getElementById('frm-amount').value = '';
    document.getElementById('frm-principal').value = '';
    document.getElementById('frm-interest').value = '';
    document.getElementById('frm-reason').value = '';
    document.getElementById('frm-particular1').value = '';
    document.getElementById('frm-particular2').value = '';

    // Initialize Accounts Searchable Dropdown for Cash/Bank
    window.onDebitAccountTypeChange('Cash/Bank');

    // Ledger Panel State 1 (Empty)
    document.getElementById('rr-ledger-empty').style.display = 'flex';
    document.getElementById('rr-ledger-content').style.display = 'none';

    document.getElementById('rr-section-list').style.display = 'none';
    document.getElementById('rr-section-preview').style.display = 'none';
    document.getElementById('rr-section-form').style.display = 'flex';
  };

  window.openAddReversalForm = function () {
    handleAddReversalClick();
  };

  window.editSelectedReversal = function (id) {
    if (id) selectedReversalId = id;
    if (!selectedReversalId) {
      toast('Please select a reversal record to edit.', false);
      return;
    }
    var r = reversals.find(function (b) {
      return String(b.reversalId) === String(selectedReversalId) ||
             String(b.voucherId) === String(selectedReversalId) ||
             String(b.reversalNo) === String(selectedReversalId) ||
             String(b.voucherNo) === String(selectedReversalId);
    });
    if (!r) { toast('Reversal record not found.', false); return; }

    var rcptPrefix = getMemberReceiptPrefix();
    var pfxEl = document.getElementById('lbl-rcpt-prefix');
    if (pfxEl) pfxEl.textContent = rcptPrefix;

    document.getElementById('rr-module-title').textContent = 'Edit Reversal [' + (r.reversalNo || r.voucherNo) + ']';
    var revNoEl = document.getElementById('frm-revno');
    if (revNoEl) {
      revNoEl.value = r.reversalNo || r.voucherNo || '';
      revNoEl.readOnly = true; // STRICT IMMUTABILITY ON ALTER
      revNoEl.disabled = true;
    }

    var rNo = r.receiptNo || '';
    if (rNo.toUpperCase().startsWith(rcptPrefix.toUpperCase())) {
      document.getElementById('frm-receiptno').value = rNo.substring(rcptPrefix.length);
    } else if (rNo.toUpperCase().startsWith(rcptPrefix.replace('/20', '/').toUpperCase())) {
      document.getElementById('frm-receiptno').value = rNo.substring(rcptPrefix.replace('/20', '/').length);
    } else {
      document.getElementById('frm-receiptno').value = rNo;
    }

    document.getElementById('frm-revdate').value = r.reversalDate || todayISO();
    document.getElementById('frm-memcode').value = r.memberCode || r.flatNo || '—';
    document.getElementById('frm-memname').value = r.memberName || r.personName || '';
    document.getElementById('frm-against-bill').value = r.billNo || '—';
    document.getElementById('frm-transtype').value = r.chqNo ? 'Cheque' : 'Cash';
    document.getElementById('frm-chqno').value = r.chqNo || '—';
    document.getElementById('frm-chqdate').value = r.chqDate || '';
    document.getElementById('frm-bank').value = r.bankName || '—';
    document.getElementById('frm-amount').value = (r.amount || 0).toFixed(2);
    document.getElementById('frm-principal').value = (r.principalRestored || r.amount || 0).toFixed(2);
    document.getElementById('frm-interest').value = (r.interestRestored || 0).toFixed(2);
    document.getElementById('frm-reason').value = r.reason || r.returnReason || 'Cheque Bounced - Funds Insufficient';
    document.getElementById('frm-particular1').value = r.particular1 || r.narration || '';
    document.getElementById('frm-particular2').value = r.particular2 || 'Cheque Dishonoured by Bank';

    var isCB = (r.cashBank || '').toLowerCase().includes('cash') || (r.cashBank || '').toLowerCase().includes('bank');
    window.onDebitAccountTypeChange(isCB ? 'Cash/Bank' : 'Other Ledger', r.cashBank);

    // Ledger Sidebar
    document.getElementById('led-flat').textContent = r.flatNo || r.wingFlat || '—';
    document.getElementById('led-area').textContent = '—';
    document.getElementById('led-mobile1').textContent = '—';
    document.getElementById('led-mobile2').textContent = '—';

    document.getElementById('led-bef-prin').textContent = '5000.00';
    document.getElementById('led-bef-int').textContent = '1200.00';
    document.getElementById('led-bef-tot').textContent = '6200.00';

    onAmountOrBifurcationChange();

    document.getElementById('rr-ledger-empty').style.display = 'none';
    document.getElementById('rr-ledger-content').style.display = 'flex';

    document.getElementById('rr-section-list').style.display = 'none';
    document.getElementById('rr-section-preview').style.display = 'none';
    document.getElementById('rr-section-form').style.display = 'flex';
  };

  window.appendParticularTag = function (num) {
    var el = document.getElementById('frm-particular' + num);
    if (el) el.value += (el.value ? ' ' : '') + 'Reversal for ' + getFyLabel();
  };

  function toIsoDate(dStr) {
    if (!dStr) return null;
    dStr = String(dStr).trim();
    if (!dStr || dStr === '—' || dStr === '-') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
    var parts = dStr.split('-');
    if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
      return parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    return dStr;
  }

  // ── 8. SAVE REVERSAL ──────────────────────────────────────────────
  window.saveReversal = async function () {
    var rcptInput = document.getElementById('frm-receiptno').value.trim();
    var pfxEl = document.getElementById('lbl-rcpt-prefix');
    var pfx = pfxEl ? pfxEl.textContent.trim() : getMemberReceiptPrefix();
    var memName = document.getElementById('frm-memname').value.trim();
    var isManual = document.getElementById('chk-mem-manual-mode') && document.getElementById('chk-mem-manual-mode').checked;

    if (!isManual && (!rcptInput || rcptInput === 'Manual Mode: N/A')) {
      toast('Please enter or fetch a Member Receipt No.', false);
      return;
    }

    var fullRcptNo = rcptInput;
    if (!isManual && rcptInput && !rcptInput.toUpperCase().startsWith('MRV') && !rcptInput.toUpperCase().startsWith('REC') && !rcptInput.toUpperCase().startsWith('MR')) {
      fullRcptNo = pfx + rcptInput;
    }

    if (isManual && !memName) {
      toast('Please select a Member Name.', false);
      return;
    }

    var amt = parseFloat(document.getElementById('frm-amount').value) || 0;
    if (amt <= 0) {
      toast('Please enter a valid reversal amount.', false);
      return;
    }

    var reason = (document.getElementById('frm-reason').value || '').trim();
    if (!reason) {
      reason = 'Receipt Reversal';
    }

    var activeTypeName = activeReversalFormBillType || (activeBillType === 'ALL' ? 'MAINTENANCE' : activeBillType);
    var accInput = document.getElementById('frm-account-combo-inp');
    var accSel = document.getElementById('frm-account');
    var selectedAccName = (accInput && accInput.value) ? accInput.value : (accSel ? accSel.value : 'Cash in Hand');

    var flatVal = document.getElementById('led-flat').textContent;
    if (flatVal === '—') flatVal = document.getElementById('frm-memcode').value || '';

    var chqDateVal = toIsoDate(document.getElementById('frm-chqdate').value);

    var revNoVal = (document.getElementById('frm-revno').value || '').trim();
    if (typeof validateTxVoucherNo === 'function') {
      var vCheck = validateTxVoucherNo('reversal', revNoVal);
      if (!vCheck.valid) {
        toast(vCheck.error, false);
        return;
      }
    }

    var revDateIso = toIsoDate(document.getElementById('frm-revdate').value) || todayISO();

    var payload = {
      societyId: parseInt(getActiveSocietyId(), 10) || 4,
      fyId: parseInt(getFyId(), 10) || 1,
      reversalNo: revNoVal,
      receiptNo: (isManual ? 'MANUAL' : fullRcptNo),
      billType: activeTypeName,
      reversalDate: revDateIso,
      memberCode: document.getElementById('frm-memcode').value || '',
      memberName: memName,
      personName: memName + (flatVal ? ' (' + flatVal + ')' : ''),
      flatNo: flatVal,
      cashBank: selectedAccName,
      cashBankName: selectedAccName,
      amount: amt,
      principalRestored: parseFloat(document.getElementById('frm-principal').value) || amt,
      interestRestored: parseFloat(document.getElementById('frm-interest').value) || 0,
      chqNo: document.getElementById('frm-chqno').value || '',
      chqDate: chqDateVal,
      bankName: document.getElementById('frm-bank').value || '',
      billNo: document.getElementById('frm-against-bill').value || '',
      returnReason: reason,
      reason: reason,
      particular1: document.getElementById('frm-particular1').value || 'Reversal of Receipt ' + fullRcptNo,
      particular2: document.getElementById('frm-particular2').value || 'Cheque Dishonoured by Bank',
      narration: document.getElementById('frm-particular1').value || 'Reversal of Receipt ' + fullRcptNo,
      clearDate: revDateIso
    };

    try {
      var apiBase = (window.AppConfig && window.AppConfig.apiBase) ? window.AppConfig.apiBase : (window.API_BASE_URL || 'http://localhost:5002');
      var url = selectedReversalId ? `${apiBase}/api/member-receipt-reversals/${selectedReversalId}` : `${apiBase}/api/member-receipt-reversals`;
      var method = selectedReversalId ? 'PUT' : 'POST';

      var resp = await fetch(url, {
        method: method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        try { localStorage.setItem('jeevika_reversal_sync', Date.now().toString()); } catch (e) {}
        toast(selectedReversalId ? 'Receipt reversal updated successfully in database!' : 'Receipt reversal saved successfully in database!', true);
        showList();
        await loadReversals();
        return;
      } else {
        var errText = await resp.text();
        toast('Failed to save reversal in database: ' + errText, false);
      }
    } catch (e) {
      toast('Server connection error: ' + (e.message || e), false);
    }
  };

  // ── 9. PREVIEW REVERSAL VOUCHER ──────────────────────────────────
  window.previewReversal = function () {
    if (!selectedReversalId) {
      toast('Please select a reversal record to preview.', false);
      return;
    }
    var r = reversals.find(function (x) { return x.reversalId === selectedReversalId; });
    if (!r) return;

    var container = document.getElementById('preview-reversal-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    container.innerHTML = '<div style="border-bottom:2px solid #C62828; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#C62828; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#C62828; text-decoration:underline;">MEMBER RECEIPT REVERSAL VOUCHER</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px;">' +
        '<div>' +
          '<div><strong>Member Name:</strong> ' + escHtml(r.memberName || r.personName) + ' (' + (r.flatNo || '') + ')</div>' +
          '<div><strong>Account Reversed:</strong> ' + escHtml(r.cashBank) + '</div>' +
          '<div><strong>Return Reason:</strong> ' + escHtml(r.reason || r.returnReason) + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div><strong>Reversal No:</strong> <span style="font-family:monospace; color:#C62828; font-weight:bold;">' + escHtml(r.reversalNo) + '</span></div>' +
          '<div><strong>Original Receipt:</strong> ' + escHtml(r.receiptNo) + '</div>' +
          '<div><strong>Reversal Date:</strong> ' + escHtml(r.reversalDate) + '</div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#C62828; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Description / Particulars</th>' +
          '<th style="padding:6px; text-align:right;">Amount (₹)</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr><td style="border:1px solid #ddd; padding:8px;">' + escHtml(r.particular1 || 'Reversal of receipt') + '</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#C62828;">' + (r.amount || 0).toFixed(2) + '</td></tr>' +
        '</tbody>' +
        '<tfoot><tr style="background:#f5f5f5; font-weight:bold;">' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right;">TOTAL REVERSED:</td>' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right; font-family:monospace; color:#C62828; font-size:14px;">₹' + (r.amount || 0).toFixed(2) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
        '<div><strong>Reversed By</strong><br><br>_____________</div>' +
        '<div><strong>Hon. Treasurer / Secretary</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('rr-section-list').style.display = 'none';
    document.getElementById('rr-section-form').style.display = 'none';
    document.getElementById('rr-section-preview').style.display = 'flex';
  };

  // ── 10. DELETE REVERSAL & MULTI ACTIONS ───────────────────────────
  window.deleteSelectedReversal = async function () {
    if (!selectedReversalId) {
      toast('Please select a reversal record to delete.', false);
      return;
    }

    var rev = reversals.find(function (r) {
      return String(r.reversalId) === String(selectedReversalId) ||
             String(r.voucherId) === String(selectedReversalId) ||
             String(r.reversalNo) === String(selectedReversalId) ||
             String(r.voucherNo) === String(selectedReversalId);
    });
    var revNoStr = rev ? (rev.reversalNo || rev.voucherNo) : '#' + selectedReversalId;
    var delId = (rev && (rev.voucherId || rev.reversalId)) ? (rev.voucherId || rev.reversalId) : selectedReversalId;

    var ok = typeof showConfirm === 'function'
      ? await showConfirm('Are you sure you want to delete reversal ' + revNoStr + '?', 'Confirm Delete Reversal')
      : confirm('Are you sure you want to delete reversal ' + revNoStr + '?');

    if (!ok) return;

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/member-receipt-reversals/' + encodeURIComponent(delId), {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!resp.ok) {
        resp = await fetch(baseHost + '/api/vouchers/' + encodeURIComponent(delId), {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
      }
      if (resp.ok) {
        try { localStorage.setItem('jeevika_reversal_sync', Date.now().toString()); } catch (e) {}
        toast('Reversal deleted successfully from database.', true);
      } else {
        toast('Failed to delete reversal from database.', false);
      }
    } catch (e) {
      toast('Error deleting reversal: ' + (e.message || e), false);
    }

    selectedReversalId = null;
    await loadReversals();
  };

  window.openMultiDeleteModal = function () {
    document.getElementById('md-from').value = '';
    document.getElementById('md-to').value = '';
    document.getElementById('modal-multi-delete').style.display = 'flex';
  };

  window.runMultiDelete = function () {
    var fromNo = (document.getElementById('md-from').value || '').trim().toLowerCase();
    var toNo = (document.getElementById('md-to').value || '').trim().toLowerCase();

    if (!fromNo || !toNo) {
      toast('Please enter both From and To reversal numbers.', false);
      return;
    }

    var initialCount = reversals.length;
    reversals = reversals.filter(function (r) {
      var no = (r.reversalNo || '').toLowerCase();
      return !(no >= fromNo && no <= toNo);
    });

    var deletedCount = initialCount - reversals.length;
    localStorage.setItem('jeevika_receipt_reversals_' + getActiveSocietyId(), JSON.stringify(reversals));
    closeModal('modal-multi-delete');
    toast('Multi-deleted ' + deletedCount + ' reversal(s).', true);
    renderReversalsTable();
  };

  window.openMultiChangeModal = function () {
    var selCount = (window.ERP_MultiChange && typeof ERP_MultiChange.getSelectedIds === 'function')
      ? ERP_MultiChange.getSelectedIds().length
      : 0;

    var infoBox = document.getElementById('mc-target-info');
    var targetText = document.getElementById('mc-target-text');
    var rangeBox = document.getElementById('mc-range-box');

    if (selCount > 0) {
      if (infoBox) infoBox.style.display = 'block';
      if (targetText) targetText.textContent = selCount + ' selected reversal(s)';
      if (rangeBox) rangeBox.style.display = 'none';
    } else {
      if (infoBox) infoBox.style.display = 'none';
      if (rangeBox) rangeBox.style.display = 'grid';
      document.getElementById('mc-from').value = '';
      document.getElementById('mc-to').value = '';
    }

    document.getElementById('mc-value').value = '';
    document.getElementById('modal-multi-change').style.display = 'flex';
  };

  window.runMultiChange = async function () {
    var fromNo = (document.getElementById('mc-from') ? document.getElementById('mc-from').value : '').trim();
    var toNo = (document.getElementById('mc-to') ? document.getElementById('mc-to').value : '').trim();
    var field = document.getElementById('mc-field').value;
    var newVal = document.getElementById('mc-value').value.trim();

    if (!newVal) { toast('Please enter the New Value.', false); return; }

    var updatedCount = await ERP_MultiChange.executeMultiChange({
      field: field,
      newVal: newVal,
      fromNo: fromNo,
      toNo: toNo,
      list: reversals,
      idKey: 'reversalId',
      noKey: 'reversalNo'
    });

    if (updatedCount > 0) {
      closeModal('modal-multi-change');
      toast('Successfully updated ' + updatedCount + ' receipt reversal(s).', true);
      renderReversalsTable();
    }
  };

  // ── 11. NAVIGATION & SHORTCUTS ────────────────────────────────────
  window.showList = function () {
    document.getElementById('rr-module-title').textContent = 'Member Receipt Reversal';
    document.getElementById('rr-section-form').style.display = 'none';
    document.getElementById('rr-section-preview').style.display = 'none';
    document.getElementById('rr-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('rr-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  window.toggleOtherDropdown = function () {
    var menu = document.getElementById('rr-other-menu');
    if (menu) menu.style.display = (menu.style.display === 'block' ? 'none' : 'block');
  };

  window.applyFilters = function () { renderReversalsTable(); };

  window.clearFilters = function () {
    ['flt-revno', 'flt-member', 'flt-chqno'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderReversalsTable();
  };

  window.closeModal = function (id) {
    var modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  };

  function todayISO() {
    var d = new Date();
    return d.toISOString().split('T')[0];
  }

  // Close dropdown on outside click
  document.addEventListener('click', function (e) {
    var drop = document.querySelector('.rr-dropdown');
    var menu = document.getElementById('rr-other-menu');
    if (drop && menu && !drop.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // Short-cuts (Alt+A, F2, Esc, Alt+S)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddReversalForm();
    } else if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveReversal();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedReversal();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // ── INIT ──────────────────────────────────────────────────────────
  (async function init() {
    var _sn = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('rrSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('rrFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    await loadBillTypes();
    await loadAccounts();
    await loadMembers();
    await loadBills();
    await loadReceipts();
    await loadReversals();

    // Real-time synchronization listeners
    window.addEventListener('storage', function (e) {
      if (e.key === 'jeevika_receipt_sync' || e.key === 'jeevika_reversal_sync') {
        loadReversals();
        loadReceipts();
      }
    });
    window.addEventListener('focus', function () {
      loadReversals();
      loadReceipts();
    });
  })();

})();
