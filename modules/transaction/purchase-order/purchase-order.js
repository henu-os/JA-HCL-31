/**
 * purchase-order.js — Jeevika ERP v2
 * Purchase Order (Inventory Booking) - PO Directory, Dynamic Accounts & Line Items Logic
 */

(function () {
  'use strict';

  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && (k.startsWith('jeevika_pos') || k.startsWith('jeevika_purchase_orders'))) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

  var pos = [];
  var members = [];
  var vendors = [];
  var staff = [];
  var accounts = [];
  var gridRows = [];
  var selectedPoId = null;
  var sortDirection = 'asc';
  var activeSidebarTab = 'Vendor';

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
    var id = (window.Auth && window.Auth.getSocietyId && window.Auth.getSocietyId()) ||
             sessionStorage.getItem('activeSocietyId') ||
             localStorage.getItem('activeSocietyId') ||
             (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeSocietyId')) ||
             (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeSocietyId')) ||
             (window.parent && window.parent.Auth && window.parent.Auth.getSocietyId && window.parent.Auth.getSocietyId()) ||
             '4';
    return id ? String(id) : '4';
  }

  function getFyId() {
    var id = (window.Auth && window.Auth.getFYId && window.Auth.getFYId()) ||
             sessionStorage.getItem('activeFYId') ||
             localStorage.getItem('activeFYId') ||
             (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeFYId')) ||
             (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeFYId')) ||
             (window.parent && window.parent.Auth && window.parent.Auth.getFYId && window.parent.Auth.getFYId()) ||
             '';
    return id ? String(id) : '';
  }

  function getFyLabel() {
    return (window.Auth && window.Auth.getFYLabel) ? window.Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');
  }

  async function fetchApiData(endpoint) {
    if (window.API && API.get) {
      try {
        var res = await API.get(endpoint);
        if (res) return res;
      } catch (e) {}
    }

    var token = (typeof Auth !== 'undefined' && Auth.getToken) 
      ? Auth.getToken() 
      : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
    var societyId = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4';
    var fyId = sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1';

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (societyId) headers['X-Society-Id'] = societyId;
    if (fyId) headers['X-FY-Id'] = fyId;

    var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
    var path = endpoint.startsWith('/api/') ? endpoint : ('/api' + (endpoint.startsWith('/') ? endpoint : '/' + endpoint));
    var fullUrl = baseHost + path;

    try {
      var resp = await fetch(fullUrl, { headers: headers });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {}
    return null;
  }

  // ── 1. LOAD MASTER DATA ─────────────────────────────────────────
  async function loadMasterData() {
    var sid = getActiveSocietyId();

    // Load Accounts — use fetchMasterAccounts from utils.js
    if (typeof fetchMasterAccounts === 'function') {
      accounts = await fetchMasterAccounts(sid);
    } else {
      var accData = await fetchApiData(sid ? ('/api/accounts?societyId=' + sid) : '/api/accounts');
      if (accData && Array.isArray(accData)) accounts = accData;
      else if (accData && accData.data && Array.isArray(accData.data)) accounts = accData.data;
      if (!accounts || accounts.length === 0) {
        accounts = (typeof getStandardMasterAccounts === 'function') ? getStandardMasterAccounts() : [];
      }
    }
    if (!accounts) accounts = [];

    // Load Vendors
    try {
      if (typeof fetchMasterPersons === 'function') {
        var vList = await fetchMasterPersons('Vendor', sid);
        if (vList && vList.length > 0) vendors = vList;
      }
    } catch(e) {}
    if (!vendors || vendors.length === 0) {
      var vData = await fetchApiData(sid ? ('/api/vendors?societyId=' + sid) : '/api/vendors');
      var rawVendors = (vData && Array.isArray(vData)) ? vData : ((vData && vData.data && Array.isArray(vData.data)) ? vData.data : []);
      vendors = (rawVendors || []).map(function(v) {
        return {
          id: v.vendorId || v.id,
          vendorId: v.vendorId || v.id,
          name: v.vendorName || v.name || '',
          code: v.vendorCode || v.code || '',
          pan: v.panNo || v.pan || '',
          gstin: v.gstin || '',
          tds: v.tdsRate ? (v.tdsRate + '%') : (v.tds || '0%'),
          tdsSec: v.tdsSection || v.tdsSec || '194C',
          mob1: v.contactNo || v.mob1 || '',
          mob2: v.mob2 || '',
          contractVal: v.contractValue || v.contractVal || '0.00',
          remark: v.address || v.remark || '',
          category: v.category || 'Vendor',
          label: (v.vendorCode || v.code ? ('[' + (v.vendorCode || v.code) + '] ') : '') + (v.vendorName || v.name) + (v.category ? (' (' + v.category + ')') : '')
        };
      });
    }

    // Load Members
    try {
      if (typeof fetchMasterPersons === 'function') {
        var mList = await fetchMasterPersons('Member', sid);
        if (mList && mList.length > 0) members = mList;
      }
    } catch(e) {}
    if (!members || members.length === 0) {
      var mData = await fetchApiData(sid ? ('/api/members?societyId=' + sid) : '/api/members');
      var rawMembers = (mData && Array.isArray(mData)) ? mData : ((mData && mData.data && Array.isArray(mData.data)) ? mData.data : []);
      members = (rawMembers || []).map(function(m) {
        var flat = (m.wing ? (m.wing + '-') : '') + (m.flatNo || m.flat || '');
        return {
          id: m.memberId || m.socMemId || m.id,
          memberId: m.memberId || m.socMemId || m.id,
          name: m.memName || m.name || '',
          code: m.memCode || m.code || '',
          flatNo: flat,
          wing: m.wing || '',
          pan: m.panNo || m.pan || '',
          gstin: '',
          tds: '0%',
          tdsSec: '—',
          mob1: m.contactNo || m.memMobile || '',
          mob2: '',
          contractVal: '0.00',
          remark: '',
          label: (m.memCode || m.code ? ('[' + (m.memCode || m.code) + '] ') : '') + (m.memName || m.name) + (flat ? (' (' + flat + ')') : '')
        };
      });
    }

    // Load Staff
    try {
      if (typeof fetchMasterPersons === 'function') {
        var stList = await fetchMasterPersons('Staff', sid);
        if (stList && stList.length > 0) staff = stList;
      }
    } catch(e) {}
    if (!staff || staff.length === 0) {
      var stData = await fetchApiData(sid ? ('/api/staff?societyId=' + sid) : '/api/staff');
      var rawStaff = (stData && Array.isArray(stData)) ? stData : ((stData && stData.data && Array.isArray(stData.data)) ? stData.data : []);
      staff = (rawStaff || []).map(function(s) {
        return {
          id: s.staffId || s.id,
          staffId: s.staffId || s.id,
          name: s.staffName || s.name || '',
          code: s.staffCode || s.code || '',
          pan: s.panNo || s.pan || '',
          gstin: '',
          tds: s.tdsRate ? (s.tdsRate + '%') : '0%',
          tdsSec: s.tdsSection || '—',
          mob1: s.contactNo || s.phone || '',
          mob2: s.phone2 || '',
          contractVal: s.monthlyCost || '0.00',
          remark: s.notes || '',
          designation: s.designation || 'Staff',
          label: (s.staffCode || s.code ? ('[' + (s.staffCode || s.code) + '] ') : '') + (s.staffName || s.name) + (s.designation ? (' (' + s.designation + ')') : '')
        };
      });
    }

    populateFormDropdowns();
  }

  function getFilteredAccounts() {
    if (typeof filterAccountsByGroupVisibility === 'function') {
      return filterAccountsByGroupVisibility(accounts, 'purchaseorder');
    }
    return accounts;
  }

  function populateFormDropdowns() {
    var entrySel = document.getElementById('entry-acc-sel');
    if (entrySel) {
      var html = '<option value="">— Select Account —</option>';
      var visAccs = getFilteredAccounts();
      visAccs.forEach(function (a) {
        html += '<option value="' + a.accountId + '">' + escHtml((a.accCode || '') + ' - ' + (a.accName || '')) + '</option>';
      });
      entrySel.innerHTML = html;
      if (typeof initAccountSearchCombobox === 'function') {
        initAccountSearchCombobox('entry-acc-sel', visAccs);
      }
    }
  }

  function resolvePersonDisplayName(personVal, pType) {
    if (!personVal || personVal === '—' || personVal === '-') return '—';
    var list = (pType === 'Member') ? members : ((pType === 'Staff') ? staff : vendors);
    if (!list || list.length === 0) {
      list = [].concat(vendors || [], members || [], staff || []);
    }
    var found = list.find(function(x) {
      return String(x.id) === String(personVal) || 
             String(x.vendorId) === String(personVal) || 
             String(x.memberId) === String(personVal) || 
             String(x.staffId) === String(personVal) ||
             String(x.code) === String(personVal) ||
             String(x.name) === String(personVal) ||
             String(x.label) === String(personVal);
    });
    if (found) return found.name || found.memName || found.label || personVal;
    return personVal;
  }

  function persistPosLocally(sid, list) {
    if (!sid) sid = getActiveSocietyId();
    try {
      var jsonStr = JSON.stringify(list || []);
      localStorage.setItem('jeevika_pos_' + sid, jsonStr);
    } catch (e) {
      console.warn("Failed saving POs to localStorage", e);
    }
  }

  async function loadPos() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();

    var apiRecords = null;
    try {
      var data = await fetchApiData('/api/vouchers?societyId=' + sid + '&fyId=' + fyid + '&type=PurchaseOrder');
      if (data && Array.isArray(data)) {
        apiRecords = data;
      } else if (data && data.data && Array.isArray(data.data)) {
        apiRecords = data.data;
      }
    } catch (e) {
      console.warn("API fetch error for POs", e);
    }

    if (apiRecords && Array.isArray(apiRecords)) {
      pos = apiRecords.map(function(item) {
        item.poId = item.voucherId || item.poId;
        item.poNo = item.voucherNo || item.poNo;
        item.vendorName = resolvePersonDisplayName(item.vendorName || item.personName, item.personType || 'Vendor');
        item.personName = item.vendorName;
        item.particular1 = item.particular1 || item.narration || 'Purchase Order';
        return item;
      });
    } else {
      pos = [];
    }

    renderPosTable();
  }

  window.loadPos = loadPos;
  window.loadPurchaseOrders = loadPos;

  // ── 2. REGISTER TABLE & SORTING ──────────────────────────────────
  window.togglePoNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-vno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderPosTable();
  };

  function renderPosTable() {
    var tbody = document.getElementById('po-list-tbody');
    if (!tbody) return;

    var filtered = pos.filter(function (b) {
      var fNo = (document.getElementById('flt-vno') ? document.getElementById('flt-vno').value.toLowerCase().trim() : '');
      var fPerson = (document.getElementById('flt-person') ? document.getElementById('flt-person').value.toLowerCase().trim() : '');

      if (fNo && (b.poNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fPerson) {
        var pName = (b.vendorName || b.personName || '').toLowerCase();
        var part1 = (b.particular1 || '').toLowerCase();
        var part2 = (b.particular2 || '').toLowerCase();
        var ref = (b.refNo || '').toLowerCase();
        var narr = (b.narration || '').toLowerCase();

        var matches = (
          pName.indexOf(fPerson) !== -1 ||
          part1.indexOf(fPerson) !== -1 ||
          part2.indexOf(fPerson) !== -1 ||
          ref.indexOf(fPerson) !== -1 ||
          narr.indexOf(fPerson) !== -1
        );
        if (!matches) return false;
      }

      return true;
    });

    filtered.sort(function (a, b) {
      var noA = (a.poNo || '').toLowerCase();
      var noB = (b.poNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('po-list-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Purchase Orders Found</td></tr>';
      document.getElementById('sum-po-count').textContent = '0';
      document.getElementById('sum-po-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalGrd = 0;

    filtered.forEach(function (b) {
      var isSel = (String(b.poId) === String(selectedPoId) || String(b.poNo) === String(selectedPoId) || String(b.voucherNo) === String(selectedPoId));
      var amt = b.amount || 0;
      totalGrd += amt;

      var pId = b.poId || b.voucherId;
      var chkHtml = (window.ERP_MultiChange && typeof ERP_MultiChange.renderCheckbox === 'function')
        ? ERP_MultiChange.renderCheckbox(pId)
        : '<td style="width:36px; text-align:center;"><input type="checkbox" class="row-chk" value="' + pId + '"></td>';

      html += '<tr class="' + (isSel ? 'row-active' : '') + '" data-id="'+(b.poId||b.voucherId||b.poNo||b.voucherNo||'')+'" onclick="selectPoRow(this.dataset.id, this)" ondblclick="editSelectedPo(this.dataset.id)">' +
        chkHtml +
        '<td style="font-weight:700; color:#0D47A1;">' + (b.poNo || '') + '</td>' +
        '<td>' + (b.poDate || '') + '</td>' +
        '<td style="font-weight:700;">' + (b.vendorName || b.personName || '—') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#0D47A1; font-family:\'Consolas\', monospace;">' + amt.toFixed(2) + '</td>' +
        '<td>' + (b.invNo || '-') + '</td>' +
        '<td>' + (b.invDate || '-') + '</td>' +
        '<td>' + (b.period || '-') + '</td>' +
        '<td>' + (b.narration || b.particular1 || '-') + '</td>' +
        '<td style="text-align:center; font-weight:800; color:#2E7D32;">' + (b.status || 'BOOKED') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-po-count').textContent = filtered.length;
    document.getElementById('sum-po-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

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

  window.selectPoRow = function (id, trEl) {
    selectedPoId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('row-active', 'selected'); });
      trEl.classList.add('row-active', 'selected');
    }
  };

  // ── 3. FORM LOGIC & GRID ACTIONS ────────────────────────────────
  window.onPersonTypeChange = async function () {
    var pType = document.getElementById('frm-person-type') ? document.getElementById('frm-person-type').value : 'Vendor';
    var selPerson = document.getElementById('frm-person-name');
    var btnAdd = document.getElementById('btn-add-person');

    if (btnAdd) {
      btnAdd.disabled = false;
      btnAdd.title = 'Lookup ' + (pType || 'Person') + ' (' + (pType || 'Person') + ' Master)';
      btnAdd.style.opacity = '1';
      btnAdd.style.cursor = 'pointer';
    }

    if (!selPerson) return;

    if (!pType || pType === 'NONE') {
      selPerson.innerHTML = '<option value="">— None (Direct PO) —</option>';
      selPerson.disabled = true;
      if (btnAdd) {
        btnAdd.disabled = true;
        btnAdd.title = 'Not Applicable for Direct PO';
        btnAdd.style.opacity = '0.4';
        btnAdd.style.cursor = 'default';
      }
      return;
    }

    selPerson.disabled = false;
    if (btnAdd) {
      btnAdd.disabled = false;
      btnAdd.title = 'Lookup ' + pType + ' (' + pType + ' Master)';
      btnAdd.style.opacity = '1';
      btnAdd.style.cursor = 'pointer';
    }

    // Dynamic fetch if list is not loaded yet
    if (pType === 'Vendor' && (!vendors || vendors.length === 0)) {
      if (typeof fetchMasterPersons === 'function') vendors = await fetchMasterPersons('Vendor');
    } else if (pType === 'Member' && (!members || members.length === 0)) {
      if (typeof fetchMasterPersons === 'function') members = await fetchMasterPersons('Member');
    } else if (pType === 'Staff' && (!staff || staff.length === 0)) {
      if (typeof fetchMasterPersons === 'function') staff = await fetchMasterPersons('Staff');
    }

    var html = '<option value="">— Select ' + pType + ' —</option>';
    if (pType === 'Vendor') {
      (vendors || []).forEach(function (v) {
        var label = v.label || v.name;
        html += '<option value="' + escHtml(v.name) + '">' + escHtml(label) + '</option>';
      });
    } else if (pType === 'Member') {
      (members || []).forEach(function (m) {
        var mName = m.memName || m.name || '';
        var mCode = m.memCode || m.code || '';
        var mFlat = m.flatNo || m.flat || '';
        var label = m.label || ((mCode ? ('[' + mCode + '] ') : '') + mName + (mFlat ? (' (' + mFlat + ')') : ''));
        html += '<option value="' + escHtml(mName) + '">' + escHtml(label) + '</option>';
      });
    } else {
      (staff || []).forEach(function (s) {
        var label = s.label || s.name;
        html += '<option value="' + escHtml(s.name) + '">' + escHtml(label) + '</option>';
      });
    }

    selPerson.innerHTML = html;
    switchSidebarTab(pType);
    if (typeof onPersonSelect === 'function') onPersonSelect();
  };

  window.onPersonSelect = function () {
    var val = document.getElementById('frm-person-name') ? document.getElementById('frm-person-name').value : '';
    var pType = document.getElementById('frm-person-type') ? document.getElementById('frm-person-type').value : 'Vendor';

    var targetObj = null;
    var list = (pType === 'Vendor') ? vendors : ((pType === 'Member') ? members : staff);
    targetObj = list.find(function (x) {
      return x.name === val || x.id === val || x.code === val || (x.label && x.label === val) || (x.label && x.label.includes(val));
    });

    if (targetObj) {
      var panEl = document.getElementById('sb-pan');
      var tdsEl = document.getElementById('sb-tds');
      var tdsSecEl = document.getElementById('sb-tdssec');
      var gstinEl = document.getElementById('sb-gstin');
      var mob1El = document.getElementById('sb-mob1');
      var mob2El = document.getElementById('sb-mob2');
      var contValEl = document.getElementById('sb-contract-val');
      var contNoEl = document.getElementById('sb-contract-no');
      var remarkEl = document.getElementById('sb-remark');

      if (panEl) panEl.value = targetObj.pan || '';
      if (tdsEl) tdsEl.value = targetObj.tds || '0.00 %';
      if (tdsSecEl) tdsSecEl.value = targetObj.tdsSec || '194C';
      if (gstinEl) gstinEl.value = targetObj.gstin || '';
      if (mob1El) mob1El.value = targetObj.mob1 || targetObj.contact || '';
      if (mob2El) mob2El.value = targetObj.mob2 || '';
      if (contValEl) contValEl.value = targetObj.contractVal || targetObj.cost || '0.00';
      if (contNoEl) contNoEl.value = targetObj.contractNo || '';
      if (remarkEl) remarkEl.value = targetObj.remark || targetObj.flatNo || '';
    } else {
      ['sb-pan', 'sb-tdssec', 'sb-gstin', 'sb-mob1', 'sb-mob2', 'sb-remark', 'sb-contract-no'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
      var tdsEl2 = document.getElementById('sb-tds');
      if (tdsEl2) tdsEl2.value = '0.00 %';
      var cvEl2 = document.getElementById('sb-contract-val');
      if (cvEl2) cvEl2.value = '0.00';
    }
  };

  window.switchSidebarTab = function (tabName) {
    activeSidebarTab = tabName;
    ['Member', 'Vendor', 'Staff'].forEach(function (t) {
      var tabEl = document.getElementById('tab-' + t.toLowerCase());
      if (tabEl) {
        if (t === tabName) tabEl.classList.add('active');
        else tabEl.classList.remove('active');
      }
    });
  };

  window.toggleMoreInfo = function () {
    var body = document.getElementById('more-info-body');
    var icon = document.getElementById('more-info-toggle-icon');
    if (body) {
      var isHidden = (body.style.display === 'none');
      body.style.display = isHidden ? 'flex' : 'none';
      if (icon) icon.textContent = isHidden ? '-' : '+';
    }
  };

  window.confirmAddLineItem = function () {
    var accId = document.getElementById('entry-acc-sel') ? document.getElementById('entry-acc-sel').value : '';
    var type = document.getElementById('entry-type') ? document.getElementById('entry-type').value : 'Dr';
    var amtEl = document.getElementById('entry-amount');
    var amt = amtEl ? (parseFloat(amtEl.value) || 0) : 0;

    if (!accId) { toast('Please select an Account.', false); return; }

    var accObj = accounts.find(function (a) { return String(a.accountId) === String(accId); });
    var accCode = accObj ? accObj.accCode : '';
    var accName = accObj ? accObj.accName : '';

    gridRows.push({
      sr: gridRows.length + 1,
      code: accCode,
      name: accName,
      dr: (type === 'Dr' ? amt : 0),
      cr: (type === 'Cr' ? amt : 0)
    });

    // Reset entry inputs
    if (document.getElementById('entry-acc-sel')) document.getElementById('entry-acc-sel').value = '';
    var comboInp = document.getElementById('entry-acc-sel-combo-inp');
    if (comboInp) comboInp.value = '';
    if (amtEl) amtEl.value = '';
    renderGridTable();
  };

  window.removeGridRow = function (idx) {
    gridRows.splice(idx, 1);
    renderGridTable();
  };

  function getAllowGridAccountSelectConfig() {
    try {
      var sid = getActiveSocietyId();
      var cfgStr = localStorage.getItem('jeevika_config_notes_' + sid) || localStorage.getItem('jeevika_config_notes_global');
      if (cfgStr) {
        var cfg = JSON.parse(cfgStr);
        if (cfg && cfg.allowGridAccountSelect !== undefined) {
          return !!cfg.allowGridAccountSelect;
        }
      }
    } catch (e) {}
    return false;
  }

  function findAccountByCodeOrName(val, list) {
    if (!val) return null;
    var accList = list || accounts || [];
    val = String(val).trim();
    var dashIdx = val.indexOf(' - ');
    if (dashIdx > 0) {
      var codePart = val.substring(0, dashIdx).trim();
      var namePart = val.substring(dashIdx + 3).trim();
      var match = accList.find(function (a) {
        return (a.accCode && a.accCode.toLowerCase() === codePart.toLowerCase()) ||
               (a.accName && a.accName.toLowerCase() === namePart.toLowerCase());
      });
      if (match) return match;
    }
    var matchByCode = accList.find(function (a) {
      return a.accCode && a.accCode.toLowerCase() === val.toLowerCase();
    });
    if (matchByCode) return matchByCode;
    var matchByName = accList.find(function (a) {
      return a.accName && a.accName.toLowerCase() === val.toLowerCase();
    });
    if (matchByName) return matchByName;
    var matchPrefix = accList.find(function (a) {
      return a.accCode && val.toLowerCase().startsWith(a.accCode.toLowerCase());
    });
    if (matchPrefix) return matchPrefix;
    return null;
  }

  function updateGridTotals() {
    var totDr = 0;
    var totCr = 0;
    gridRows.forEach(function (r) {
      totDr += (parseFloat(r.dr) || 0);
      totCr += (parseFloat(r.cr) || 0);
    });
    var elDr = document.getElementById('grid-tot-dr');
    if (elDr) elDr.textContent = totDr.toFixed(2);
    var elCr = document.getElementById('grid-tot-cr');
    if (elCr) elCr.textContent = totCr.toFixed(2);

    var diff = totDr - totCr;
    var elNet = document.getElementById('grid-net-bal');
    if (elNet) elNet.textContent = Math.abs(diff).toFixed(2);
  }

  window.onGridAccountInput = function (idx, val) {
    if (!gridRows[idx]) gridRows[idx] = { sr: idx + 1, code: '', name: '', dr: 0, cr: 0 };
    var acc = findAccountByCodeOrName(val, getFilteredAccounts());
    var codeEl = document.getElementById('po-grid-code-txt-' + idx);
    if (acc) {
      gridRows[idx].code = acc.accCode;
      gridRows[idx].name = acc.accName;
      if (codeEl) codeEl.textContent = acc.accCode;
    } else {
      gridRows[idx].name = val;
      if (codeEl) codeEl.textContent = gridRows[idx].code || '—';
    }
    updateGridTotals();
  };

  window.onGridAccountSelect = function (idx, val) {
    window.onGridAccountInput(idx, val);
    var acc = findAccountByCodeOrName(val, getFilteredAccounts());
    if (acc) {
      var nameInp = document.getElementById('po-grid-name-inp-' + idx);
      if (nameInp) nameInp.value = acc.accName;
    }
    renderGridTable();
  };

  window.onGridDrChange = function (idx, val) {
    if (!gridRows[idx]) gridRows[idx] = { sr: idx + 1, code: '', name: '', dr: 0, cr: 0 };
    gridRows[idx].dr = parseFloat(val) || 0;
    updateGridTotals();
  };

  window.onGridCrChange = function (idx, val) {
    if (!gridRows[idx]) gridRows[idx] = { sr: idx + 1, code: '', name: '', dr: 0, cr: 0 };
    gridRows[idx].cr = parseFloat(val) || 0;
    updateGridTotals();
  };

  function renderGridTable() {
    var tbody = document.getElementById('po-grid-tbody');
    if (!tbody) return;

    var isInlineGridAllowed = getAllowGridAccountSelectConfig();
    var html = '';
    var totDr = 0;
    var totCr = 0;

    // Refresh shared datalist for autocomplete
    var dl = document.getElementById('po-grid-accounts-datalist');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'po-grid-accounts-datalist';
      document.body.appendChild(dl);
    }
    var dlHtml = '';
    var visAccs = getFilteredAccounts();
    visAccs.forEach(function (a) {
      dlHtml += '<option value="' + escHtml(a.accCode + ' - ' + a.accName) + '"></option>';
    });
    dl.innerHTML = dlHtml;

    if (isInlineGridAllowed) {
      while (gridRows.length < 4) {
        gridRows.push({ sr: gridRows.length + 1, code: '', name: '', dr: 0, cr: 0 });
      }

      gridRows.forEach(function (r, idx) {
        r.sr = idx + 1;
        totDr += (parseFloat(r.dr) || 0);
        totCr += (parseFloat(r.cr) || 0);

        var displayVal = r.name || '';

        html += '<tr>' +
          '<td style="text-align:center; font-weight:700; width:45px;">' + r.sr + '</td>' +
          '<td style="width:130px; text-align:center; font-family:\'Consolas\', monospace; font-weight:700; color:#0D47A1;" id="po-grid-code-txt-' + idx + '">' +
            escHtml(r.code || '—') +
          '</td>' +
          '<td style="padding:3px 6px;">' +
            '<input type="text" class="form-inp" list="po-grid-accounts-datalist" id="po-grid-name-inp-' + idx + '" value="' + escHtml(displayVal) + '" placeholder="Select Account (Search by Code or Name)" oninput="onGridAccountInput(' + idx + ', this.value)" onchange="onGridAccountSelect(' + idx + ', this.value)" style="height:24px; padding:1px 8px; font-size:11px; font-weight:600; width:100%; border:1px solid #cbd5e1; border-radius:3px;">' +
          '</td>' +
          '<td style="width:120px; padding:3px 6px; text-align:right;">' +
            '<input type="number" step="0.01" value="' + (r.dr > 0 ? r.dr : '') + '" placeholder="" oninput="onGridDrChange(' + idx + ', this.value)" style="height:24px; padding:1px 6px; font-size:11px; text-align:right; font-family:\'Consolas\', monospace; font-weight:700; width:100%; border:1px solid #cbd5e1; border-radius:3px; color:#2E7D32; box-sizing:border-box;">' +
          '</td>' +
          '<td style="width:120px; padding:3px 6px; text-align:right;">' +
            '<input type="number" step="0.01" value="' + (r.cr > 0 ? r.cr : '') + '" placeholder="" oninput="onGridCrChange(' + idx + ', this.value)" style="height:24px; padding:1px 6px; font-size:11px; text-align:right; font-family:\'Consolas\', monospace; font-weight:700; width:100%; border:1px solid #cbd5e1; border-radius:3px; color:#dc2626; box-sizing:border-box;">' +
          '</td>' +
          '</tr>';
      });

    } else {
      if (gridRows.length === 0) {
        for (var i = 1; i <= 4; i++) {
          html += '<tr>' +
            '<td style="text-align:center; color:#94a3b8; font-weight:700;">' + i + '</td>' +
            '<td style="color:#94a3b8;">—</td>' +
            '<td style="color:#94a3b8; font-style:italic;">Select Account</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#94a3b8;">-</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#94a3b8;">-</td>' +
            '</tr>';
        }
      } else {
        gridRows.forEach(function (r, idx) {
          r.sr = idx + 1;
          totDr += (parseFloat(r.dr) || 0);
          totCr += (parseFloat(r.cr) || 0);
          html += '<tr>' +
            '<td style="text-align:center; font-weight:700;">' + r.sr + '</td>' +
            '<td style="font-family:\'Consolas\', monospace; font-weight:700; color:#0D47A1;">' + escHtml(r.code) + '</td>' +
            '<td style="font-weight:600; display:flex; justify-content:space-between; align-items:center;">' +
              '<span>' + escHtml(r.name) + '</span>' +
              '<button type="button" onclick="removeGridRow(' + idx + ')" style="border:none; background:none; color:#ef4444; cursor:pointer; font-size:12px; font-weight:bold; padding:0 4px;" title="Remove row">✕</button>' +
            '</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#2E7D32; font-weight:700;">' + (r.dr > 0 ? Number(r.dr).toFixed(2) : '-') + '</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#dc2626; font-weight:700;">' + (r.cr > 0 ? Number(r.cr).toFixed(2) : '-') + '</td>' +
            '</tr>';
        });
      }
    }

    tbody.innerHTML = html;

    var elDr = document.getElementById('grid-tot-dr');
    if (elDr) elDr.textContent = totDr.toFixed(2);
    var elCr = document.getElementById('grid-tot-cr');
    if (elCr) elCr.textContent = totCr.toFixed(2);

    var diff = Math.round((totDr - totCr) * 100) / 100;
    var elNet = document.getElementById('grid-net-bal');
    var statusLbl = document.getElementById('grid-status-label');

    if (elNet) {
      if (diff > 0.01) {
        if (statusLbl) statusLbl.textContent = 'Net Vendor Payable:';
        elNet.textContent = '₹' + diff.toFixed(2) + ' (Cr to Vendor)';
        elNet.style.color = '#0D47A1';
      } else if (diff < -0.01) {
        if (statusLbl) statusLbl.textContent = 'Credits exceed Debits:';
        elNet.textContent = '₹' + Math.abs(diff).toFixed(2) + ' (Unbalanced)';
        elNet.style.color = '#dc2626';
      } else if (totDr > 0) {
        if (statusLbl) statusLbl.textContent = 'Double-Entry Status:';
        elNet.textContent = '✓ BALANCED (₹' + totDr.toFixed(2) + ')';
        elNet.style.color = '#15803d';
      } else {
        if (statusLbl) statusLbl.textContent = 'Net Balance:';
        elNet.textContent = '0.00';
        elNet.style.color = '#0D47A1';
      }
    }
  }

  window.quickApplyTds = function (rate) {
    var grossDr = gridRows.reduce(function (s, r) { return s + (parseFloat(r.dr) || 0); }, 0);
    if (grossDr <= 0) {
      grossDr = parseFloat(document.getElementById('entry-amount') ? document.getElementById('entry-amount').value : 0) || 0;
    }
    if (grossDr <= 0) {
      toast('Please enter or add an Expense Debit line first before calculating TDS.', false);
      return;
    }

    var tdsRate = parseFloat(rate) || 1;
    var tdsAmt = Math.round(grossDr * (tdsRate / 100) * 100) / 100;
    if (tdsAmt <= 0) {
      toast('TDS amount must be greater than 0.', false);
      return;
    }

    var tdsAcc = accounts.find(function (a) { 
      return (a.accCode && a.accCode.toUpperCase() === 'LIA-1008') || 
             (a.accName && a.accName.toLowerCase().includes('tds payable')); 
    });

    var code = tdsAcc ? tdsAcc.accCode : 'LIA-1008';
    var name = tdsAcc ? tdsAcc.accName : 'TDS Payable';

    var existingIdx = gridRows.findIndex(function (r) { 
      return (r.code && r.code.toUpperCase() === 'LIA-1008') || 
             (r.name && r.name.toLowerCase().includes('tds payable')); 
    });

    if (existingIdx >= 0) {
      gridRows[existingIdx].cr = tdsAmt;
    } else {
      gridRows.push({
        sr: gridRows.length + 1,
        code: code,
        name: name,
        dr: 0,
        cr: tdsAmt,
        particulars: 'TDS @ ' + tdsRate + '% on ' + grossDr.toFixed(2)
      });
    }

    renderGridTable();
    var netPay = Math.max(0, grossDr - tdsAmt);
    toast('Applied ' + tdsRate + '% TDS (₹' + tdsAmt.toFixed(2) + '). Net Vendor Payable: ₹' + netPay.toFixed(2), true);
  };

  window.openAddPoForm = async function () {
    selectedPoId = null;
    var vNoEl = document.getElementById('frm-vno');
    if (vNoEl) {
      vNoEl.readOnly = false;
      vNoEl.disabled = false;
      vNoEl.value = (typeof fetchTxNextVoucherNo === 'function') 
        ? await fetchTxNextVoucherNo('po') 
        : getTxNextVoucherNo('po', pos);
    }
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-vno', 'PO');
    document.getElementById('frm-vdate').value = todayISO();

    document.getElementById('frm-person-type').value = 'Vendor';
    onPersonTypeChange();

    populateFormDropdowns();

    // Ensure account combobox panel is closed
    var pnl = document.getElementById('entry-acc-sel-combo-panel');
    if (pnl) pnl.style.display = 'none';

    gridRows = [];
    renderGridTable();

    document.getElementById('frm-invno').value = '';
    document.getElementById('frm-invdate').value = '';
    document.getElementById('frm-invduedate').value = '';
    document.getElementById('frm-invperiod').value = '';
    document.getElementById('frm-particular1').value = '';
    document.getElementById('frm-particular2').value = '';

    ['chk-comm', 'chk-recv', 'chk-supp', 'chk-meet', 'chk-tds', 'chk-vouch', 'chk-cash'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.checked = false;
    });

    document.getElementById('po-section-list').style.display = 'none';
    document.getElementById('po-section-form').style.display = 'flex';
  };

  window.editSelectedPo = async function (id) {
    if (id) selectedPoId = id;
    if (!selectedPoId) { toast('Please select a purchase order row to edit.', false); return; }
    var b = pos.find(function (x) {
      return String(x.poId) === String(selectedPoId) ||
             String(x.voucherId) === String(selectedPoId) ||
             String(x.poNo) === String(selectedPoId) ||
             String(x.voucherNo) === String(selectedPoId);
    });
    if (!b) { toast('Purchase order record not found.', false); return; }

    selectedPoId = b.voucherId || b.poId;

    var vNoEl = document.getElementById('frm-vno');
    if (vNoEl) {
      vNoEl.value = b.poNo || b.voucherNo || '';
      vNoEl.readOnly = true; // STRICT IMMUTABILITY ON ALTER
      vNoEl.disabled = true;
    }
    document.getElementById('frm-vdate').value = b.poDate || b.voucherDate || todayISO();

    var pType = b.personType || 'Vendor';
    var pTypeEl = document.getElementById('frm-person-type');
    if (pTypeEl) pTypeEl.value = pType;
    await onPersonTypeChange();

    var targetPerson = b.vendorName || b.personName || '';
    var pSel = document.getElementById('frm-person-name');
    var comboInp = document.getElementById('frm-person-name-combo-inp');
    if (pSel) pSel.value = targetPerson;
    if (comboInp) comboInp.value = targetPerson;
    onPersonSelect();

    // Fetch full lines from backend API if available
    var loadedItems = null;
    var vId = parseInt(b.voucherId || b.poId, 10);
    if (vId && vId > 0 && vId < 1000000000000) {
      try {
        var fullData = null;
        if (window.API && API.get) {
          fullData = await API.get('/api/vouchers/' + vId);
        } else if (typeof fetchApiData === 'function') {
          fullData = await fetchApiData('/api/vouchers/' + vId);
        } else {
          var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
          var resp = await fetch(baseHost + '/api/vouchers/' + vId, { headers: (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}) });
          if (resp.ok) fullData = await resp.json();
        }
        if (fullData && fullData.items && Array.isArray(fullData.items) && fullData.items.length > 0) {
          loadedItems = fullData.items;
        }
      } catch (e) {
        console.warn('Could not fetch detail lines from API, using cached lines:', e);
      }
    }

    if (loadedItems && loadedItems.length > 0) {
      // In PO voucher, Debit lines are the booked expenses/items, and Credit line is the vendor payable.
      var debitLines = loadedItems.filter(function(r) { return (parseFloat(r.debit || r.dr) || 0) > 0; });
      var linesToMap = debitLines.length > 0 ? debitLines : loadedItems;
      gridRows = linesToMap.map(function (r, i) {
        return {
          sr: i + 1,
          code: r.accountCode || '',
          name: r.accountName || '',
          dr: parseFloat(r.debit || r.dr) || 0,
          cr: parseFloat(r.credit || r.cr) || 0,
          particulars: r.narration || ''
        };
      });
    } else if (b.gridRows && Array.isArray(b.gridRows) && b.gridRows.length > 0) {
      gridRows = b.gridRows.map(function (r, i) {
        return {
          sr: i + 1,
          code: r.code || '',
          name: r.name || '',
          dr: parseFloat(r.dr) || 0,
          cr: parseFloat(r.cr) || 0,
          particulars: r.particulars || ''
        };
      });
    } else if (b.items && Array.isArray(b.items) && b.items.length > 0) {
      var pName = (b.paidTo || b.personName || '').toLowerCase();
      var isVendorCredit = function(r) {
        var cr = parseFloat(r.credit || r.cr) || 0;
        if (cr <= 0) return false;
        var nm = String(r.accountName || r.name || '').toLowerCase();
        return (pName && nm.includes(pName)) || nm.includes('vendor') || nm.includes('payable') || nm.includes('sundry creditor');
      };
      var nonVendorItems = b.items.filter(function(r) { return !isVendorCredit(r); });
      var src = nonVendorItems.length > 0 ? nonVendorItems : b.items;
      gridRows = src.map(function (r, i) {
        return {
          sr: i + 1,
          code: r.accountCode || r.code || '',
          name: r.accountName || r.name || '',
          dr: parseFloat(r.debit || r.dr) || 0,
          cr: parseFloat(r.credit || r.cr) || 0,
          particulars: r.narration || r.particulars || ''
        };
      });
    } else {
      var defCode = b.accountCode || '';
      var defName = b.accountName || b.particular1 || 'Expense';
      gridRows = [
        { sr: 1, code: defCode, name: defName, dr: b.amount || 0, cr: 0, particulars: b.particular1 || 'Purchase Order' }
      ];
    }
    renderGridTable();

    // Populate top entry controls with primary line item or header amount
    var primaryRow = (gridRows && gridRows.length > 0) ? gridRows[0] : null;
    var primaryAmt = primaryRow ? (primaryRow.dr || primaryRow.cr || b.amount || 0) : (b.amount || 0);
    var entryAmtEl = document.getElementById('entry-amount');
    if (entryAmtEl) entryAmtEl.value = (primaryAmt > 0 ? primaryAmt : '');

    var entryAccSel = document.getElementById('entry-acc-sel');
    var entryComboInp = document.getElementById('entry-acc-sel-combo-inp');
    if (primaryRow && (primaryRow.code || primaryRow.name)) {
      var foundAcc = (accounts || []).find(function(a) {
        return (primaryRow.code && String(a.accCode).toLowerCase() === String(primaryRow.code).toLowerCase()) ||
               (primaryRow.name && String(a.accName).toLowerCase() === String(primaryRow.name).toLowerCase());
      });
      if (foundAcc && entryAccSel) {
        entryAccSel.value = String(foundAcc.accountId);
        if (entryComboInp) entryComboInp.value = (foundAcc.accCode ? (foundAcc.accCode + ' - ') : '') + foundAcc.accName;
      } else if (primaryRow.name && entryComboInp) {
        entryComboInp.value = (primaryRow.code ? (primaryRow.code + ' - ') : '') + primaryRow.name;
      }
    }

    document.getElementById('frm-invno').value = b.invNo || b.refNo || '';
    document.getElementById('frm-invdate').value = b.invDate || '';
    document.getElementById('frm-invduedate').value = b.invDueDate || '';
    document.getElementById('frm-invperiod').value = b.period || '';
    document.getElementById('frm-particular1').value = b.particular1 || b.narration || '';
    document.getElementById('frm-particular2').value = b.particular2 || '';

    ['chk-comm', 'chk-recv', 'chk-supp', 'chk-meet', 'chk-tds', 'chk-vouch', 'chk-cash'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.checked = !!(b.checklist && b.checklist[id]);
    });

    document.getElementById('po-section-list').style.display = 'none';
    document.getElementById('po-section-form').style.display = 'flex';
  };

  window.savePo = async function () {
    var pNameEl = document.getElementById('frm-person-name');
    var comboInp = document.getElementById('frm-person-name-combo-inp');
    var rawPersonVal = (pNameEl ? pNameEl.value : '') || (comboInp ? comboInp.value : '');
    var pType = document.getElementById('frm-person-type') ? document.getElementById('frm-person-type').value : 'Vendor';
    var pName = resolvePersonDisplayName(rawPersonVal, pType);
    if (!pName || pName === '—') {
      pName = (comboInp && comboInp.value) ? comboInp.value.trim() : (pNameEl ? pNameEl.value.trim() : '');
    }
    if (!pName || pType === 'NONE') {
      pName = (pName && pName !== '—') ? pName : 'General Vendor';
    }

    var entryAccId = document.getElementById('entry-acc-sel') ? document.getElementById('entry-acc-sel').value : '';
    var entryAmt = parseFloat(document.getElementById('entry-amount') ? document.getElementById('entry-amount').value : 0) || 0;
    if (gridRows.length === 0 && entryAmt > 0) {
      var accObj = accounts.find(function(a) { return String(a.accountId) === String(entryAccId); });
      if (!accObj) {
        toast('Please select an Expense Account before saving.', false);
        return;
      }
      var entryType = document.getElementById('entry-type') ? document.getElementById('entry-type').value : 'Dr';
      gridRows.push({
        sr: 1,
        code: accObj.accCode || '',
        name: accObj.accName || '',
        dr: (entryType === 'Dr' ? entryAmt : 0),
        cr: (entryType === 'Cr' ? entryAmt : 0)
      });
      renderGridTable();
    }

    var validRows = gridRows.filter(function (r) { return r.code || r.name || (parseFloat(r.dr) || 0) > 0 || (parseFloat(r.cr) || 0) > 0; });
    var totAmt = validRows.reduce(function (sum, r) { return sum + (parseFloat(r.dr) || 0); }, 0);
    if (totAmt <= 0) totAmt = parseFloat(document.getElementById('entry-amount') ? document.getElementById('entry-amount').value : 0) || 0;

    if (totAmt <= 0) {
      toast('Please enter the purchase order amount or add line items.', false);
      return;
    }

    if (validRows.length === 0) {
      toast('Please add at least one line item (Expense Account) for the Purchase Order.', false);
      return;
    }

    var sid = getActiveSocietyId();
    if (!sid) {
      toast('Active Society not selected.', false);
      return;
    }
    var fyid = getFyId() || 1;
    var pId = selectedPoId || Date.now();
    var vNo = document.getElementById('frm-vno').value || ('PO/25-26/' + (pos.length + 1));
    var invNo = document.getElementById('frm-invno') ? document.getElementById('frm-invno').value : '';

    var checklist = {};
    ['chk-comm', 'chk-recv', 'chk-supp', 'chk-meet', 'chk-tds', 'chk-vouch', 'chk-cash'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) checklist[id] = el.checked;
    });

    var items = [];
    var totalDebitSum = 0;
    validRows.forEach(function(r) {
      var accId = null;
      var found = accounts.find(function(a) { return (a.accCode && a.accCode === r.code) || (a.accName && a.accName === r.name); });
      if (found && typeof found.accountId === 'number' && found.accountId < 1000000) {
        accId = found.accountId;
      }
      var drVal = parseFloat(r.dr) || 0;
      var crVal = parseFloat(r.cr) || 0;
      if (drVal > 0) totalDebitSum += drVal;
      items.push({
        accountId: accId,
        accountCode: r.code || (found ? found.accCode : ''),
        accountName: r.name || (found ? found.accName : 'Expense'),
        debit: drVal,
        credit: crVal,
        narration: r.particulars || r.narration || ''
      });
    });

      var totDr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.debit) || 0); }, 0) * 100) / 100;
      var totCr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.credit) || 0); }, 0) * 100) / 100;

      // Check if vendor payable account is already explicitly included in items with credit
      var hasVendorCredit = items.some(function(it) {
        return it.credit > 0 && (
          (it.accountName && pName && it.accountName.toLowerCase().includes(pName.toLowerCase())) ||
          (it.accountName && it.accountName.toLowerCase().includes('vendor payable'))
        );
      });

      if (!hasVendorCredit) {
        var netCrNeeded = Math.round((totDr - totCr) * 100) / 100;
        if (netCrNeeded > 0) {
          var vAcc = accounts.find(function(a) {
            var nm = (a.accName || '').toLowerCase();
            return (pName && nm.includes(pName.toLowerCase())) ||
                   nm.includes('sundry creditor') ||
                   nm.includes('vendor payable');
          });
          items.push({
            accountId: (vAcc && typeof vAcc.accountId === 'number' && vAcc.accountId < 1000000) ? vAcc.accountId : null,
            accountCode: vAcc ? (vAcc.accCode || '') : '',
            accountName: pName || (vAcc ? vAcc.accName : 'Vendor Payable'),
            debit: 0,
            credit: netCrNeeded,
            narration: 'Vendor Payable - ' + pName
          });
          totCr += netCrNeeded;
        }
      }

      var finalDr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.debit) || 0); }, 0) * 100) / 100;
      var finalCr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.credit) || 0); }, 0) * 100) / 100;

      if (Math.abs(finalDr - finalCr) > 0.01) {
        toast('Double-entry unbalanced: Total Debit (₹' + finalDr.toFixed(2) + ') must equal Total Credit (₹' + finalCr.toFixed(2) + '). Difference: ₹' + Math.abs(finalDr - finalCr).toFixed(2), false);
        return;
      }

    var part1Val = document.getElementById('frm-particular1').value.trim();
    var part2Val = document.getElementById('frm-particular2').value.trim();

    var payload = {
      poId: pId,
      voucherId: (typeof pId === 'number' && pId < 1000000000000) ? pId : 0,
      societyId: parseInt(sid, 10),
      fyId: parseInt(fyid, 10),
      poNo: vNo,
      voucherNo: vNo,
      poDate: document.getElementById('frm-vdate').value || todayISO(),
      voucherDate: document.getElementById('frm-vdate').value || todayISO(),
      voucherType: 'PurchaseOrder',
      personType: document.getElementById('frm-person-type').value,
      vendorName: pName,
      personName: pName,
      amount: totAmt,
      refNo: invNo,
      invNo: invNo,
      invDate: document.getElementById('frm-invdate') ? document.getElementById('frm-invdate').value : '',
      invDueDate: document.getElementById('frm-invduedate') ? document.getElementById('frm-invduedate').value : '',
      period: document.getElementById('frm-invperiod') ? document.getElementById('frm-invperiod').value : '',
      narration: part1Val,
      particular1: part1Val,
      particular2: part2Val,
      checklist: checklist,
      gridRows: gridRows,
      items: items
    };

    if (!selectedPoId && typeof validateTxVoucherNo === 'function') {
      var vCheck = validateTxVoucherNo('po', vNo);
      if (!vCheck.valid) {
        var uNo = vNo.toUpperCase();
        if (!uNo.startsWith('PO') && !uNo.startsWith('PUR') && !uNo.startsWith('PV')) {
          toast(vCheck.error, false);
          return;
        }
      }
    }

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/vouchers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        var json = await resp.json();
        if (json && json.success) {
          toast(selectedPoId ? 'Purchase Order updated successfully in database!' : 'Purchase Order saved successfully in database!', true);
          showList();
          await loadPos();
          return;
        }
      }
      var errText = await resp.text();
      toast('Failed to save Purchase Order: ' + errText, false);
    } catch (e) {
      toast('Server connection error: ' + (e.message || e), false);
    }
  };

  window.deleteSelectedPo = async function () {
    var checkedIds = (window.ERP_MultiChange && typeof ERP_MultiChange.getSelectedIds === 'function')
      ? ERP_MultiChange.getSelectedIds()
      : [];

    var targetIds = [];
    if (checkedIds.length > 0) {
      targetIds = checkedIds;
    } else if (selectedPoId) {
      targetIds = [selectedPoId];
    }

    if (targetIds.length === 0) {
      toast('Please select purchase order(s) to delete.', false);
      return;
    }

    var count = targetIds.length;
    var msg = (count === 1) ? 'Are you sure you want to delete this purchase order?' : ('Are you sure you want to delete ' + count + ' selected purchase order(s)?');
    var ok = typeof showConfirm === 'function'
      ? await showConfirm(msg, 'Confirm Delete Purchase Order')
      : confirm(msg);
    if (!ok) return;

    var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
    var delCount = 0;
    for (var i = 0; i < targetIds.length; i++) {
      var id = targetIds[i];
      var tr = pos.find(function (b) { return String(b.poId) === String(id) || String(b.poNo) === String(id) || String(b.voucherNo) === String(id); });
      var delId = (tr && tr.voucherId) ? tr.voucherId : (tr && tr.poId ? tr.poId : id);
      try {
        await fetch(baseHost + '/api/vouchers/' + encodeURIComponent(delId), {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        delCount++;
      } catch (e) {}
    }

    selectedPoId = null;
    toast('Deleted ' + delCount + ' purchase order(s) from database.', true);
    await loadPos();
    if (window.ERP_MultiChange && typeof ERP_MultiChange.clearSelection === 'function') {
      ERP_MultiChange.clearSelection();
    }
  };

  window.previewSelectedPo = function () {
    if (!selectedPoId) { toast('Please select a purchase order to preview.', false); return; }
    var b = pos.find(function (x) { return x.poId === selectedPoId; });
    if (!b) return;

    var container = document.getElementById('preview-po-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    container.innerHTML = '<div style="border-bottom:2px solid #0D47A1; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#0D47A1; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#0D47A1; text-decoration:underline;">PURCHASE ORDER (INVENTORY BOOKING)</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px;">' +
        '<div>' +
          '<div><strong>Vendor Name:</strong> ' + escHtml(b.vendorName || b.personName) + '</div>' +
          '<div><strong>Invoice No:</strong> ' + escHtml(b.invNo) + '</div>' +
          '<div><strong>Period:</strong> ' + escHtml(b.period) + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div><strong>PO No:</strong> <span style="font-family:monospace; color:#0D47A1; font-weight:bold;">' + escHtml(b.poNo) + '</span></div>' +
          '<div><strong>Date:</strong> ' + escHtml(b.poDate) + '</div>' +
          '<div><strong>Status:</strong> <span style="color:#2E7D32; font-weight:bold;">' + escHtml(b.status || 'BOOKED') + '</span></div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#0D47A1; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Narration / Description</th>' +
          '<th style="padding:6px; text-align:right;">Amount (₹)</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr><td style="border:1px solid #ddd; padding:8px;">' + escHtml(b.narration || b.particular1 || 'Purchase Order') + '</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#0D47A1;">' + (b.amount || 0).toFixed(2) + '</td></tr>' +
        '</tbody>' +
        '<tfoot><tr style="background:#f5f5f5; font-weight:bold;">' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right;">TOTAL PO AMOUNT:</td>' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right; font-family:monospace; color:#0D47A1; font-size:14px;">₹' + (b.amount || 0).toFixed(2) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
        '<div><strong>Prepared By</strong><br><br>_____________</div>' +
        '<div><strong>Authorized Signatory</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('po-section-list').style.display = 'none';
    document.getElementById('po-section-form').style.display = 'none';
    document.getElementById('po-section-preview').style.display = 'flex';
  };

  window.showList = function () {
    document.getElementById('po-section-form').style.display = 'none';
    document.getElementById('po-section-preview').style.display = 'none';
    document.getElementById('po-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('po-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  window.applyFilters = function () { renderPosTable(); };

  window.clearFilters = function () {
    ['flt-vno', 'flt-person'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    renderPosTable();
  };

  window.appendParticularTag = function (num) {
    var el = document.getElementById('frm-particular' + num);
    if (el) el.value += (el.value ? ' ' : '') + 'Purchase Order for ' + getFyLabel();
  };

  function todayISO() {
    var d = new Date();
    return d.toISOString().split('T')[0];
  }

  window.openMultiChangeModal = function () {
    var selCount = (window.ERP_MultiChange && typeof ERP_MultiChange.getSelectedIds === 'function')
      ? ERP_MultiChange.getSelectedIds().length
      : 0;

    var infoBox = document.getElementById('mc-target-info');
    var targetText = document.getElementById('mc-target-text');
    var rangeBox = document.getElementById('mc-range-box');

    if (selCount > 0) {
      if (infoBox) infoBox.style.display = 'block';
      if (targetText) targetText.textContent = selCount + ' selected purchase order(s)';
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
      list: pos,
      idKey: 'poId',
      noKey: 'poNo'
    });

    if (updatedCount > 0) {
      persistPosLocally(getActiveSocietyId(), pos);
      closeModal('modal-multi-change');
      toast('Successfully updated ' + updatedCount + ' purchase order(s).', true);
      renderPosTable();
    }
  };

  window.closeModal = function (id) {
    var modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  };

  // Short-cuts (Alt+A, Alt+S, F2, Esc, Ctrl+P)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddPoForm();
    } else if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      savePo();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedPo();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // INIT
  (async function init() {
    var _sn = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('poSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('poFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    await loadMasterData();
    await loadPos();
    showList();
  })();

})();
