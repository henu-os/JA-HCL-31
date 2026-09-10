/**
 * other-receipt.js — Jeevika ERP v2
 * Other Receipt Entry Directory, Dynamic Accounts & Line Items Logic
 */

(function () {
  'use strict';

  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && (k.startsWith('jeevika_other_receipts') || k.startsWith('jeevika_receipts'))) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

  var receipts = [];
  var members = [];
  var vendors = [];
  var staff = [];
  var accounts = [];
  var gridRows = [];
  var selectedReceiptId = null;
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

  function toIsoDate(dateStr) {
    if (!dateStr || dateStr.trim() === '' || dateStr === '-') return null;
    var s = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split('T')[0];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      var p = s.split('/');
      return p[2] + '-' + p[1] + '-' + p[0];
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      var p = s.split('-');
      return p[2] + '-' + p[1] + '-' + p[0];
    }
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return null;
  }

  function getAuthHeaders() {
    var token = (typeof Auth !== 'undefined' && Auth.getToken) 
      ? Auth.getToken() 
      : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
    var societyId = getActiveSocietyId();
    var fyId = getFyId();

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (societyId) headers['X-Society-Id'] = societyId;
    if (fyId) headers['X-FY-Id'] = fyId;
    return headers;
  }

  async function fetchApiData(endpoint) {
    if (window.API && API.get) {
      try {
        var ep = endpoint.startsWith('/') ? endpoint : ('/' + endpoint);
        var res = await API.get(ep);
        if (res) return res;
      } catch (e) {}
    }

    var headers = getAuthHeaders();
    var baseHost = (window.APP_CONFIG ? window.APP_CONFIG.API_BASE : '') || (window.CONFIG ? window.CONFIG.API_BASE : '') || window.API_BASE_URL || 'http://localhost:5002';
    var path = endpoint.startsWith('/api/') ? endpoint : ('/api' + (endpoint.startsWith('/') ? endpoint : '/' + endpoint));
    if (baseHost.endsWith('/api') && path.startsWith('/api/')) {
      path = path.substring(4);
    }
    var fullUrl = baseHost.startsWith('http') ? (baseHost + path) : ('http://localhost:5002' + path);

    try {
      var resp = await fetch(fullUrl, { headers: headers });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {}
    return null;
  }

  // ── 1. LOAD DATA ────────────────────────────────────────────────
  async function loadMasterData() {
    var sid = getActiveSocietyId();

    // Load Accounts from Account Master
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
      return filterAccountsByGroupVisibility(accounts, 'otherreceipt');
    }
    return accounts;
  }

  function populateFormDropdowns() {
    // Deposit Account Selector
    onDebitTypeChange();

    // Person Type & Name Selector
    onPersonTypeChange();

    var visAccs = getFilteredAccounts();

    // Entry Account — Searchable Combobox
    if (typeof initAccountSearchCombobox === 'function') {
      initAccountSearchCombobox('entry-acc-sel', visAccs);
    } else {
      // Fallback: plain select
      var entrySel = document.getElementById('entry-acc-sel');
      if (entrySel) {
        var html = '<option value="">— Select Account —</option>';
        visAccs.forEach(function (a) {
          html += '<option value="' + a.accountId + '">' + escHtml((a.accCode || '') + ' - ' + (a.accName || '')) + '</option>';
        });
        entrySel.innerHTML = html;
      }
    }
  }


  function persistReceiptsLocally(sid, list) {
    if (!sid) sid = getActiveSocietyId();
    try {
      var jsonStr = JSON.stringify(list || []);
      localStorage.setItem('jeevika_other_receipts_' + sid, jsonStr);
      
      
    } catch (e) {
      console.warn("Failed saving receipts to localStorage", e);
    }
  }

  async function loadReceipts() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();

    var data = await fetchApiData('/api/vouchers?societyId=' + sid + '&fyId=' + fyid + '&type=OtherReceipt');
    if (!data || (Array.isArray(data) && data.length === 0) || (data.data && Array.isArray(data.data) && data.data.length === 0)) {
      var dataAll = await fetchApiData('/api/vouchers?societyId=' + sid + '&type=OtherReceipt');
      if (dataAll) data = dataAll;
    }
    var apiRecords = (data && Array.isArray(data)) ? data : ((data && data.data && Array.isArray(data.data)) ? data.data : []);

    receipts = apiRecords.map(function(item) {
      item.receiptId = item.voucherId || item.receiptId;
      var cbCode = item.cashBankCode || '';
      var cbName = item.cashBankName || item.cashBank || '';
      if (cbCode && cbName && !cbName.startsWith(cbCode)) {
        item.cashBank = cbCode + ' - ' + cbName;
      } else {
        item.cashBank = cbName || item.cashBank || (cbCode ? (cbCode + ' - Cash/Bank') : '—');
      }
      item.paidTo = item.paidTo || item.personName || '—';
      item.particular1 = item.particular1 || item.narration || 'Other Receipt';
      var isCash = (item.cashBank || '').toLowerCase().includes('cash') || (cbCode || '').toLowerCase().startsWith('csh') || (cbCode || '').toLowerCase() === 'ass-1001';
      item.transType = item.transType || (isCash ? 'Cash' : 'Bank');
      return item;
    });

    renderReceiptsTable();
  }

  // ── 2. REGISTER TABLE & SORTING ──────────────────────────────────
  window.toggleVoucherNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-vno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderReceiptsTable();
  };

  function renderReceiptsTable() {
    var tbody = document.getElementById('ore-list-tbody');
    if (!tbody) return;

    var filtered = receipts.filter(function (b) {
      var fNo = (document.getElementById('flt-vno') ? document.getElementById('flt-vno').value.toLowerCase().trim() : '');
      var fPerson = (document.getElementById('flt-person') ? document.getElementById('flt-person').value.toLowerCase().trim() : '');

      if (fNo && (b.voucherNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fPerson) {
        var pName = (b.paidTo || b.personName || '').toLowerCase();
        var aName = (b.accountName || '').toLowerCase();
        var aCode = (b.accountCode || '').toLowerCase();
        var chq = (b.chqNo || '').toLowerCase();
        var bName = (b.bankName || '').toLowerCase();
        var part1 = (b.particular1 || '').toLowerCase();
        var narr = (b.narration || '').toLowerCase();

        var matches = (
          pName.indexOf(fPerson) !== -1 ||
          aName.indexOf(fPerson) !== -1 ||
          aCode.indexOf(fPerson) !== -1 ||
          chq.indexOf(fPerson) !== -1 ||
          bName.indexOf(fPerson) !== -1 ||
          part1.indexOf(fPerson) !== -1 ||
          narr.indexOf(fPerson) !== -1
        );
        if (!matches) return false;
      }

      return true;
    });

    filtered.sort(function (a, b) {
      var noA = (a.voucherNo || '').toLowerCase();
      var noB = (b.voucherNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('ore-list-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Other Receipt Entries Found</td></tr>';
      document.getElementById('sum-rec-count').textContent = '0';
      document.getElementById('sum-rec-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalGrd = 0;

    filtered.forEach(function (b) {
      var isSel = (b.receiptId === selectedReceiptId);
      var amt = b.amount || 0;
      totalGrd += amt;

      var isCash = (b.transType === 'Cash' || (b.cashBank || '').toLowerCase().includes('cash'));
      var typeLabel = isCash ? 'Cash Voucher' : 'Bank Voucher';
      var typeColor = isCash ? '#15803d' : '#d97706';

      var rId = b.oreId || b.receiptId || b.voucherId;
      var chkHtml = (window.ERP_MultiChange && typeof ERP_MultiChange.renderCheckbox === 'function')
        ? ERP_MultiChange.renderCheckbox(rId)
        : '<td style="width:36px; text-align:center;"><input type="checkbox" class="row-chk" value="' + rId + '"></td>';

      html += '<tr class="' + (isSel ? 'row-active' : '') + '" data-id="'+(b.receiptId||b.voucherId||b.voucherNo||'')+'" onclick="selectReceiptRow(this.dataset.id, this)" ondblclick="editSelectedReceipt(this.dataset.id)">' +
        chkHtml +
        '<td style="font-weight:700; color:#1565C0;">' + escHtml(b.voucherNo || '') + '</td>' +
        '<td>' + escHtml(b.voucherDate || '') + '</td>' +
        '<td>' + escHtml(b.cashBank || '—') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#1565C0; font-family:\'Consolas\', monospace;">' + amt.toFixed(2) + '</td>' +
        '<td>' + escHtml(b.chqNo || '-') + '</td>' +
        '<td>' + escHtml(b.chqDate || '-') + '</td>' +
        '<td>' + escHtml(b.billNo || '-') + '</td>' +
        '<td style="font-weight:700; color:#0f172a;">' + escHtml(b.paidTo || b.personName || '—') + '</td>' +
        '<td>' + escHtml(b.particular1 || '') + '</td>' +
        '<td>' + escHtml(b.particular2 || (isCash ? 'Cash' : 'Cheque Issued')) + '</td>' +
        '<td style="font-weight:800; color:' + typeColor + ';">' + typeLabel + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-rec-count').textContent = filtered.length;
    document.getElementById('sum-rec-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

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

  window.selectReceiptRow = function (id, trEl) {
    selectedReceiptId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('row-active', 'selected'); });
      trEl.classList.add('row-active', 'selected');
    }
  };

  // ── 3. FORM LOGIC & ACTIONS ──────────────────────────────────────
  window.onDebitTypeChange = function () {
    var isCash = document.getElementById('deb-cash').checked;
    var sel = document.getElementById('frm-deposit-acc');
    if (!sel) return;

    var filteredAccs = accounts.filter(function (a) {
      var isAsset = (a.grpMainId === 1) || (String(a.mainGroup || '').toLowerCase() === 'asset');
      var isCashBankGrp = String(a.groupName || '').toLowerCase().includes('cash & bank') || String(a.groupName || '').toLowerCase().includes('cash and bank');
      var isCashBank = isAsset && isCashBankGrp;

      if (!isCashBank) return false;

      var isCashAcc = String(a.accName || '').toLowerCase().includes('cash') || String(a.accCode || '').toLowerCase() === 'ass-1001';
      return isCash ? isCashAcc : !isCashAcc;
    });

    if (filteredAccs.length === 0) {
      filteredAccs = accounts.filter(function (a) {
        var isAsset = (a.grpMainId === 1) || (String(a.mainGroup || '').toLowerCase() === 'asset');
        var isCashAcc = String(a.accName || '').toLowerCase().includes('cash') || String(a.accCode || '').toLowerCase() === 'ass-1001';
        return isAsset && (isCash ? isCashAcc : !isCashAcc);
      });
    }

    var html = '';
    filteredAccs.forEach(function (a) {
      html += '<option value="' + a.accountId + '">' + escHtml((a.accCode || '') + ' - ' + (a.accName || '')) + '</option>';
    });
    if (html === '') {
      html = isCash ? '<option value="">— No Cash Account Found —</option>' : '<option value="">— No Bank Account Found —</option>';
    }
    sel.innerHTML = html;
  };

  window.onPersonTypeChange = async function () {
    var pType = document.getElementById('frm-person-type').value;
    var btnAdd = document.getElementById('btn-add-person');

    // Book lookup button: enabled for Member, Vendor, and Staff; disabled for NONE
    if (btnAdd) {
      var isLookupAvailable = (pType === 'Member' || pType === 'Vendor' || pType === 'Staff');
      btnAdd.disabled = !isLookupAvailable;
      btnAdd.title = isLookupAvailable ? ('Lookup ' + pType + ' (' + pType + ' Master)') : 'Not Applicable';
      btnAdd.style.opacity = isLookupAvailable ? '1' : '0.4';
      btnAdd.style.cursor = isLookupAvailable ? 'pointer' : 'default';
    }

    // Dynamic fetch if list is not loaded yet
    if (pType === 'Vendor' && (!vendors || vendors.length === 0)) {
      if (typeof fetchMasterPersons === 'function') vendors = await fetchMasterPersons('Vendor');
    } else if (pType === 'Member' && (!members || members.length === 0)) {
      if (typeof fetchMasterPersons === 'function') members = await fetchMasterPersons('Member');
    } else if (pType === 'Staff' && (!staff || staff.length === 0)) {
      if (typeof fetchMasterPersons === 'function') staff = await fetchMasterPersons('Staff');
    }

    // Build persons list for the selected type
    var personList = [];
    if (pType === 'Vendor') {
      personList = (vendors || []).map(function (v) {
        return { id: v.vendorId || v.id || v.name, label: v.label || v.name, obj: v };
      });
    } else if (pType === 'Member') {
      personList = (members || []).map(function (m) {
        return { id: m.memberId || m.id || m.name, label: m.label || ((m.name || '') + (m.flatNo ? ' (' + m.flatNo + ')' : '')), obj: m };
      });
    } else if (pType === 'Staff') {
      personList = (staff || []).map(function (s) {
        return { id: s.staffId || s.id || s.name, label: s.label || s.name, obj: s };
      });
    }

    // Convert to account-style objects for the combobox
    var accStyleList = personList.map(function(p) {
      var code = (p.obj && p.obj.code) ? p.obj.code : '';
      return { accountId: p.id, accCode: code, accName: p.label, _obj: p.obj };
    });

    // Init searchable combobox (clears existing wrapper first)
    var existingWrap = document.getElementById('frm-person-name-combo-wrap');
    if (existingWrap) existingWrap.remove();

    var selPerson = document.getElementById('frm-person-name');
    if (selPerson) {
      selPerson.style.display = '';
      selPerson.innerHTML = '<option value="">\u2014 Select ' + (pType || 'Person') + ' \u2014</option>';
      personList.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        selPerson.appendChild(opt);
      });
    }

    if (typeof initAccountSearchCombobox === 'function') {
      // Store the _obj mapping so onPersonSelect can retrieve full object
      window._personObjMap = {};
      accStyleList.forEach(function(a) { window._personObjMap[String(a.accountId)] = a._obj; });
      initAccountSearchCombobox('frm-person-name', accStyleList);
      // Update placeholder text
      var inp = document.getElementById('frm-person-name-combo-inp');
      if (inp) inp.placeholder = (accStyleList.length === 0 ? 'No ' + pType + 's in master — click + to add' : '\u2014 Select ' + pType + ' \u2014');
    }

    if (pType) switchSidebarTab(pType);
  };

  window.onPersonSelect = function () {
    var selPerson = document.getElementById('frm-person-name');
    var personId = selPerson ? selPerson.value : '';
    var pType = document.getElementById('frm-person-type').value;

    // Try to get the full object from the mapping set by onPersonTypeChange
    var targetObj = null;
    if (window._personObjMap && window._personObjMap[String(personId)]) {
      targetObj = window._personObjMap[String(personId)];
    } else {
      // Fallback: search by name, id, or code
      var list = (pType === 'Vendor') ? vendors : ((pType === 'Member') ? members : staff);
      targetObj = list.find(function (x) {
        return String(x.name) === String(personId) || 
               String(x.id) === String(personId) || 
               String(x.vendorId) === String(personId) || 
               String(x.memberId) === String(personId) || 
               String(x.staffId) === String(personId) || 
               (x.label && x.label === personId) ||
               (x.label && x.label.includes(personId));
      });
    }

    if (targetObj) {
      var setVal = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
      setVal('sb-pan', targetObj.pan || (targetObj.raw && targetObj.raw.panNo) || '');
      setVal('sb-tds', targetObj.tds || (targetObj.raw && targetObj.raw.tdsRate ? (targetObj.raw.tdsRate + '%') : '0%'));
      setVal('sb-tdssec', targetObj.tdsSec || (targetObj.raw && targetObj.raw.tdsSection) || '194C');
      setVal('sb-gstin', targetObj.gstin || (targetObj.raw && targetObj.raw.gstin) || '');
      setVal('sb-mob1', targetObj.mob1 || targetObj.contact || (targetObj.raw && (targetObj.raw.contactNo || targetObj.raw.phone)) || '');
      setVal('sb-mob2', targetObj.mob2 || (targetObj.raw && targetObj.raw.phone2) || '');
      setVal('sb-contract-val', targetObj.contractVal || targetObj.cost || (targetObj.raw && (targetObj.raw.contractValue || targetObj.raw.monthlyCost)) || '');
      setVal('sb-remark', targetObj.remark || targetObj.flatNo || (targetObj.raw && (targetObj.raw.address || targetObj.raw.notes)) || '');
      setVal('sb-period-from', targetObj.contractFrom || (targetObj.raw && targetObj.raw.contractFrom ? String(targetObj.raw.contractFrom).split('T')[0] : ''));
      setVal('sb-period-to', targetObj.contractTo || (targetObj.raw && targetObj.raw.contractTo ? String(targetObj.raw.contractTo).split('T')[0] : ''));
    } else {
      ['sb-pan','sb-tds','sb-tdssec','sb-gstin','sb-mob1','sb-mob2','sb-contract-val','sb-remark','sb-period-from','sb-period-to'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
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
    var accId = document.getElementById('entry-acc-sel').value;
    var type = document.getElementById('entry-type').value;
    var amt = parseFloat(document.getElementById('entry-amount').value) || 0;

    if (!accId) { toast('Please select an Account.', false); return; }
    if (amt <= 0) { toast('Please enter a valid Entry Amount.', false); return; }

    var accObj = accounts.find(function (a) { return String(a.accountId) === String(accId); });
    if (!accObj) { toast('Selected account not found in current society chart of accounts.', false); return; }
    var accCode = accObj.accCode || '';
    var accName = accObj.accName || '';

    gridRows.push({
      sr: gridRows.length + 1,
      code: accCode,
      name: accName,
      dr: (type === 'Dr' ? amt : 0),
      cr: (type === 'Cr' ? amt : 0)
    });

    document.getElementById('entry-amount').value = '';
    renderGridTable();
  };

  window.removeGridRow = function (idx) {
    gridRows.splice(idx, 1);
    renderGridTable();
  };

  window.redirectToAddPerson = function () {
    var pType = document.getElementById('frm-person-type') ? document.getElementById('frm-person-type').value : '';
    if (pType === 'Member') {
      return; // + is not allowed for Member
    }
    
    var targetModule = (pType === 'Staff') ? 'staff-master' : 'vendor-master';
    if (window.WorkspaceBridge && typeof window.WorkspaceBridge.openModule === 'function') {
      window.WorkspaceBridge.openModule(targetModule);
    } else if (window.parent && window.parent.WorkspaceManager && typeof window.parent.WorkspaceManager.openModule === 'function') {
      window.parent.WorkspaceManager.openModule(targetModule);
    } else {
      window.location.href = '../../master/' + targetModule + '/' + targetModule + '.html?action=add';
    }
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

  window.quickApplyTds = function (rate) {
    var grossCr = gridRows.reduce(function (s, r) { return s + (parseFloat(r.cr) || 0); }, 0);
    if (grossCr <= 0) {
      grossCr = parseFloat(document.getElementById('entry-amount') ? document.getElementById('entry-amount').value : 0) || 0;
    }
    if (grossCr <= 0) {
      toast('Please enter or add an Income Credit line first before calculating TDS.', false);
      return;
    }

    var tdsRate = parseFloat(rate) || 1;
    var tdsAmt = Math.round(grossCr * (tdsRate / 100) * 100) / 100;
    if (tdsAmt <= 0) {
      toast('TDS amount must be greater than 0.', false);
      return;
    }

    var tdsAcc = accounts.find(function (a) { 
      return (a.accCode && a.accCode.toUpperCase() === 'ASS-1026') || 
             (a.accName && a.accName.toLowerCase().includes('tds receivable')); 
    });

    var code = tdsAcc ? tdsAcc.accCode : 'ASS-1026';
    var name = tdsAcc ? tdsAcc.accName : 'TDS Receivable';

    var existingIdx = gridRows.findIndex(function (r) { 
      return (r.code && r.code.toUpperCase() === 'ASS-1026') || 
             (r.name && r.name.toLowerCase().includes('tds receivable')); 
    });

    if (existingIdx >= 0) {
      gridRows[existingIdx].dr = tdsAmt;
    } else {
      gridRows.push({
        sr: gridRows.length + 1,
        code: code,
        name: name,
        dr: tdsAmt,
        cr: 0,
        particulars: 'TDS Receivable @ ' + tdsRate + '% on ' + grossCr.toFixed(2)
      });
    }

    renderGridTable();
    var netRecv = Math.max(0, grossCr - tdsAmt);
    toast('Applied ' + tdsRate + '% TDS Receivable (₹' + tdsAmt.toFixed(2) + '). Net Bank Inflow: ₹' + netRecv.toFixed(2), true);
  };

  function updateGridTotals() {
    var totDr = 0;
    var totCr = 0;
    gridRows.forEach(function (r) {
      totDr += (parseFloat(r.dr) || 0);
      totCr += (parseFloat(r.cr) || 0);
    });
    var drEl = document.getElementById('grid-tot-dr');
    var crEl = document.getElementById('grid-tot-cr');
    if (drEl) drEl.textContent = totDr.toFixed(2);
    if (crEl) crEl.textContent = totCr.toFixed(2);

    var netBalEl = document.getElementById('grid-net-bal');
    var statusLbl = document.getElementById('grid-status-label');
    var diff = Math.round((totCr - totDr) * 100) / 100;

    if (netBalEl) {
      if (diff > 0.01) {
        if (statusLbl) statusLbl.textContent = 'Net Bank/Cash Inflow Needed:';
        netBalEl.textContent = '₹' + diff.toFixed(2) + ' (Dr to Bank)';
        netBalEl.style.color = '#15803d';
      } else if (diff < -0.01) {
        if (statusLbl) statusLbl.textContent = 'Debits exceed Credits:';
        netBalEl.textContent = '₹' + Math.abs(diff).toFixed(2) + ' (Unbalanced)';
        netBalEl.style.color = '#dc2626';
      } else if (totCr > 0) {
        if (statusLbl) statusLbl.textContent = 'Double-Entry Status:';
        netBalEl.textContent = '✓ BALANCED (₹' + totCr.toFixed(2) + ')';
        netBalEl.style.color = '#15803d';
      } else {
        if (statusLbl) statusLbl.textContent = 'Net Balance:';
        netBalEl.textContent = '0.00';
        netBalEl.style.color = '#15803d';
      }
    }
  }

  window.onGridAccountInput = function (idx, val) {
    if (!gridRows[idx]) gridRows[idx] = { sr: idx + 1, code: '', name: '', dr: 0, cr: 0 };
    var acc = findAccountByCodeOrName(val, getFilteredAccounts());
    var codeEl = document.getElementById('ore-grid-code-txt-' + idx);
    if (acc) {
      gridRows[idx].code = acc.accCode;
      gridRows[idx].name = acc.accName;
      if (codeEl) codeEl.textContent = acc.accCode;
      if (!gridRows[idx].dr && !gridRows[idx].cr) {
        var topAmt = parseFloat(document.getElementById('entry-amount').value) || 0;
        if (topAmt > 0) gridRows[idx].cr = topAmt;
      }
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
      var nameInp = document.getElementById('ore-grid-name-inp-' + idx);
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
    var tbody = document.getElementById('ore-grid-tbody');
    if (!tbody) return;

    var isInlineGridAllowed = getAllowGridAccountSelectConfig();
    var html = '';
    var totDr = 0;
    var totCr = 0;

    // Refresh shared datalist for autocomplete
    var dl = document.getElementById('ore-grid-accounts-datalist');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'ore-grid-accounts-datalist';
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
          '<td style="width:130px; text-align:center; font-family:\'Consolas\', monospace; font-weight:700; color:#0D47A1;" id="ore-grid-code-txt-' + idx + '">' +
            escHtml(r.code || '—') +
          '</td>' +
          '<td style="padding:3px 6px;">' +
            '<input type="text" class="form-inp" list="ore-grid-accounts-datalist" id="ore-grid-name-inp-' + idx + '" value="' + escHtml(displayVal) + '" placeholder="Select Account (Search by Code or Name)" oninput="onGridAccountInput(' + idx + ', this.value)" onchange="onGridAccountSelect(' + idx + ', this.value)" style="height:24px; padding:1px 8px; font-size:11px; font-weight:600; width:100%; border:1px solid #cbd5e1; border-radius:3px;">' +
          '</td>' +
          '<td style="width:120px; padding:3px 6px; text-align:right;">' +
            '<input type="number" step="0.01" value="' + (r.dr > 0 ? r.dr : '') + '" placeholder="" oninput="onGridDrChange(' + idx + ', this.value)" style="height:24px; padding:1px 6px; font-size:11px; text-align:right; font-family:\'Consolas\', monospace; font-weight:700; width:100%; border:1px solid #cbd5e1; border-radius:3px; color:#dc2626; box-sizing:border-box;">' +
          '</td>' +
          '<td style="width:120px; padding:3px 6px; text-align:right;">' +
            '<input type="number" step="0.01" value="' + (r.cr > 0 ? r.cr : '') + '" placeholder="" oninput="onGridCrChange(' + idx + ', this.value)" style="height:24px; padding:1px 6px; font-size:11px; text-align:right; font-family:\'Consolas\', monospace; font-weight:700; width:100%; border:1px solid #cbd5e1; border-radius:3px; color:#15803d; box-sizing:border-box;">' +
          '</td>' +
          '</tr>';
      });

    } else {
      if (gridRows.length === 0) {
        for (var i = 1; i <= 4; i++) {
          html += '<tr>' +
            '<td style="text-align:center; color:#64748b; font-weight:700;">' + i + '</td>' +
            '<td>&nbsp;</td>' +
            '<td style="color:#94a3b8;">Select Account</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#64748b;">0.00</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#64748b;">0.00</td>' +
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
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:' + (r.dr > 0 ? '#dc2626' : '#64748b') + '; font-weight:700;">' + (r.dr > 0 ? Number(r.dr).toFixed(2) : '0.00') + '</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:' + (r.cr > 0 ? '#15803d' : '#64748b') + '; font-weight:700;">' + (r.cr > 0 ? Number(r.cr).toFixed(2) : '0.00') + '</td>' +
            '</tr>';
        });
      }
    }

    tbody.innerHTML = html;

    var drEl = document.getElementById('grid-tot-dr');
    var crEl = document.getElementById('grid-tot-cr');
    if (drEl) drEl.textContent = totDr.toFixed(2);
    if (crEl) crEl.textContent = totCr.toFixed(2);

    var diff = totCr - totDr;
    var netBalEl = document.getElementById('grid-net-bal');
    if (netBalEl) {
      if (totDr === 0 && totCr === 0) {
        netBalEl.textContent = '0.00 Cr';
        netBalEl.style.color = '#15803d';
      } else if (totDr > totCr) {
        netBalEl.textContent = (totDr - totCr).toFixed(2) + ' Dr';
        netBalEl.style.color = '#dc2626';
      } else {
        netBalEl.textContent = (totCr - totDr).toFixed(2) + ' Cr';
        netBalEl.style.color = '#15803d';
      }
    }
  }

  window.openAddReceiptForm = async function () {
    selectedReceiptId = null;
    var vNoEl = document.getElementById('frm-vno');
    if (vNoEl) {
      vNoEl.readOnly = false;
      vNoEl.disabled = false;
      vNoEl.value = (typeof fetchTxNextVoucherNo === 'function') 
        ? await fetchTxNextVoucherNo('otherReceipt') 
        : getTxNextVoucherNo('otherReceipt', receipts);
    }
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-vno', 'OtherReceipt');
    document.getElementById('frm-vdate').value = todayISO();

    document.getElementById('frm-person-type').value = '';
    onPersonTypeChange();

    document.getElementById('deb-cash').checked = true;
    onDebitTypeChange();

    gridRows = [];
    renderGridTable();

    document.getElementById('entry-amount').value = '';
    document.getElementById('frm-transtype').value = 'Cash';
    document.getElementById('frm-chqno').value = '';
    document.getElementById('frm-chqdate').value = '';
    document.getElementById('frm-refno').value = '';
    document.getElementById('frm-drawnon').value = '';
    if (document.getElementById('frm-particular1')) document.getElementById('frm-particular1').value = '';
    if (document.getElementById('frm-particular2')) document.getElementById('frm-particular2').value = '';

    document.getElementById('ore-section-list').style.display = 'none';
    document.getElementById('ore-section-form').style.display = 'flex';
  };

  window.editSelectedReceipt = async function (id) {
    if (id) selectedReceiptId = id;
    if (!selectedReceiptId) { toast('Please select a receipt row to edit.', false); return; }
    var b = receipts.find(function (x) {
      return String(x.receiptId) === String(selectedReceiptId) ||
             String(x.oreId) === String(selectedReceiptId) ||
             String(x.voucherId) === String(selectedReceiptId) ||
             String(x.voucherNo) === String(selectedReceiptId);
    });
    if (!b) { toast('Receipt record not found.', false); return; }

    selectedReceiptId = b.voucherId || b.receiptId || b.oreId;

    var vNoEl = document.getElementById('frm-vno');
    if (vNoEl) {
      vNoEl.value = b.voucherNo || '';
      vNoEl.readOnly = true; // STRICT IMMUTABILITY ON ALTER
      vNoEl.disabled = true;
    }
    document.getElementById('frm-vdate').value = toIsoDate(b.voucherDate || b.date) || todayISO();

    // 1. Fetch full detail lines and header from DB if available
    var loadedItems = null;
    var vId = parseInt(b.voucherId || b.receiptId || b.oreId, 10);
    if (vId && vId > 0 && vId < 1000000000000) {
      try {
        var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
        var resp = await fetch(baseHost + '/api/vouchers/' + vId, { headers: getAuthHeaders() });
        if (resp.ok) {
          var fullData = await resp.json();
          if (fullData) {
            if (fullData.data) b = Object.assign({}, b, fullData.data);
            if (fullData.items && Array.isArray(fullData.items) && fullData.items.length > 0) {
              loadedItems = fullData.items;
            }
          }
        }
      } catch (e) {
        console.warn('Could not fetch detail lines from DB:', e);
      }
    }

    // 2. Restore Person
    var pType = b.personType || 'Vendor';
    var pTypeEl = document.getElementById('frm-person-type');
    if (pTypeEl) pTypeEl.value = pType;
    await onPersonTypeChange();

    var pNameVal = b.paidTo || b.personName || '';
    var pSel = document.getElementById('frm-person-name');
    var comboInp = document.getElementById('frm-person-name-combo-inp');
    if (pSel) pSel.value = pNameVal;
    if (comboInp) comboInp.value = pNameVal;
    onPersonSelect();

    // Helper to identify Cash & Bank Asset accounts
    function isCashBankAcc(item) {
      if (!item) return false;
      var code = String(item.accountCode || item.code || '').trim().toUpperCase();
      var name = String(item.accountName || item.name || '').trim().toLowerCase();
      if (code.startsWith('ASS-1001') || code.startsWith('ASS-1002') || code.startsWith('ASS-1003') || code.startsWith('ASS-1004') || code.startsWith('ASS-1005')) return true;
      if (name.includes('cash in hand') || name.includes('bank a/c') || name.includes('bank account') || name.includes('current a/c') || name.includes('saving a/c')) return true;
      var found = (accounts || []).find(function(a) {
        return (item.accountId && a.accountId === item.accountId) ||
               (code && String(a.accCode || '').toUpperCase() === code) ||
               (name && String(a.accName || '').toLowerCase() === name);
      });
      if (found) {
        var isAsset = (found.grpMainId === 1) || String(found.mainGroup || '').toLowerCase() === 'asset';
        var grp = String(found.groupName || found.grpPrimaryName || '').toLowerCase();
        var isCBGrp = grp.includes('cash & bank') || grp.includes('cash and bank') || grp.includes('bank account') || grp.includes('cash-in-hand') || grp.includes('cash in hand');
        return isAsset && isCBGrp;
      }
      return false;
    }

    var allItems = (loadedItems && loadedItems.length > 0) ? loadedItems : (b.items || []);
    var bankItem = null;
    if (allItems && allItems.length > 0) {
      // Find the debit item that is a Cash/Bank account
      bankItem = allItems.find(function(r) {
        return (parseFloat(r.debit || r.dr) || 0) > 0 && isCashBankAcc(r);
      });
      // Fallback: if not matched by group, find any debit item that is not TDS/tax receivable
      if (!bankItem) {
        bankItem = allItems.find(function(r) {
          var d = (parseFloat(r.debit || r.dr) || 0);
          var nm = String(r.accountName || r.name || '').toLowerCase();
          return d > 0 && !nm.includes('tds') && !nm.includes('tax');
        });
      }
    }

    // 3. Restore Cash / Bank Account Type & Deposit To Account (Dynamic Sync)
    var targetAccCode = bankItem ? bankItem.accountCode : (b.cashBankCode || '');
    var targetAccName = bankItem ? (bankItem.accountName || bankItem.name) : (b.cashBankName || b.cashBank || '');
    var targetAccId = bankItem ? (bankItem.accountId || bankItem.id) : null;

    var matchedAcc = accounts.find(function(a) {
      if (targetAccId && a.accountId === targetAccId) return true;
      if (targetAccCode && String(a.accCode || '').toUpperCase() === String(targetAccCode).toUpperCase()) return true;
      if (targetAccName) {
        var cleanTgt = targetAccName.toLowerCase().replace(/\[.*?\]\s*/g, '').replace(/^[a-z]+-\d+\s*-\s*/g, '').trim();
        var cleanA = String(a.accName || '').toLowerCase().replace(/\[.*?\]\s*/g, '').replace(/^[a-z]+-\d+\s*-\s*/g, '').trim();
        if (cleanTgt && cleanA && (cleanTgt === cleanA || cleanTgt.includes(cleanA) || cleanA.includes(cleanTgt))) return true;
      }
      return false;
    });

    var isCash = false;
    if (targetAccCode && targetAccCode.toUpperCase() === 'ASS-1001') isCash = true;
    else if (targetAccName && targetAccName.toLowerCase().includes('cash')) isCash = true;
    else if (matchedAcc) {
      var accNameLow = String(matchedAcc.accName || '').toLowerCase();
      var accCodeLow = String(matchedAcc.accCode || '').toLowerCase();
      isCash = accNameLow.includes('cash') || accCodeLow === 'ass-1001';
    }

    var radCash = document.getElementById('deb-cash');
    var radBank = document.getElementById('deb-bank');
    if (radCash) radCash.checked = isCash;
    if (radBank) radBank.checked = !isCash;
    onDebitTypeChange();

    var depSel = document.getElementById('frm-deposit-acc');
    if (depSel) {
      var resolvedVal = null;
      if (matchedAcc && matchedAcc.accountId) {
        resolvedVal = String(matchedAcc.accountId);
      } else if (targetAccId) {
        resolvedVal = String(targetAccId);
      }
      if (resolvedVal) depSel.value = resolvedVal;

      if (!depSel.value || depSel.selectedIndex < 0) {
        for (var optIdx = 0; optIdx < depSel.options.length; optIdx++) {
          var opt = depSel.options[optIdx];
          if (targetAccCode && opt.text.toUpperCase().includes(targetAccCode.toUpperCase())) {
            depSel.selectedIndex = optIdx;
            break;
          }
          if (targetAccName && opt.text.toLowerCase().includes(targetAccName.toLowerCase())) {
            depSel.selectedIndex = optIdx;
            break;
          }
        }
      }

      // Failsafe: Never allow deposit field to be blank if bank details exist
      if ((!depSel.value || depSel.selectedIndex < 0) && (targetAccName || targetAccCode)) {
        var optVal = resolvedVal || targetAccCode || Date.now();
        var optLabel = (targetAccCode ? ('[' + targetAccCode + '] ') : '') + (targetAccName || 'Bank Account');
        var newOpt = document.createElement('option');
        newOpt.value = optVal;
        newOpt.textContent = optLabel;
        depSel.appendChild(newOpt);
        depSel.value = optVal;
      }
    }

    // 4. Restore Bank Details
    var transTypeEl = document.getElementById('frm-transtype');
    if (transTypeEl) {
      if (isCash) {
        transTypeEl.value = 'Cash';
      } else {
        var p2 = (b.particular2 || b.transType || '').toLowerCase();
        var selectedType = 'Cheque';
        for (var i = 0; i < transTypeEl.options.length; i++) {
          var optVal = transTypeEl.options[i].value;
          if (p2 && p2.includes(optVal.toLowerCase())) {
            selectedType = optVal;
            break;
          }
        }
        transTypeEl.value = selectedType;
      }
    }
    var chqNoEl = document.getElementById('frm-chqno');
    if (chqNoEl) chqNoEl.value = (b.chqNo && b.chqNo !== '-') ? b.chqNo : '';

    var chqDateEl = document.getElementById('frm-chqdate');
    if (chqDateEl) chqDateEl.value = toIsoDate(b.chqDate) || '';

    var refNoEl = document.getElementById('frm-refno');
    if (refNoEl) refNoEl.value = (b.refNo && b.refNo !== '-') ? b.refNo : ((b.billNo && b.billNo !== '-') ? b.billNo : '');

    var drawnOnEl = document.getElementById('frm-drawnon');
    if (drawnOnEl) drawnOnEl.value = b.bankName || b.drawnOn || '';

    // 5. Restore Line Items Grid (All Non-Bank items: Income Cr and TDS Receivable Dr)
    if (allItems && allItems.length > 0) {
      var nonBankItems = bankItem ? allItems.filter(function(r) { return r !== bankItem; }) : allItems;
      gridRows = nonBankItems.map(function (r, i) {
        return {
          sr: i + 1,
          code: r.accountCode || r.code || '',
          name: r.accountName || r.name || '',
          dr: parseFloat(r.debit || r.dr) || 0,
          cr: parseFloat(r.credit || r.cr) || 0,
          particulars: r.narration || r.particulars || ''
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
    } else {
      gridRows = [
        { sr: 1, code: b.accountCode || '', name: b.accountName || b.particular1 || 'Income', dr: 0, cr: b.amount || 0 }
      ];
    }
    renderGridTable();

    // 6. Restore Particulars
    var p1El = document.getElementById('frm-particular1');
    if (p1El) p1El.value = b.particular1 || b.narration || '';
    var p2El = document.getElementById('frm-particular2');
    if (p2El) p2El.value = b.particular2 || '';

    document.getElementById('ore-section-list').style.display = 'none';
    document.getElementById('ore-section-form').style.display = 'flex';
  };

  window.saveReceipt = async function () {
    try {
      // 1. Resolve Person
      var pNameEl = document.getElementById('frm-person-name');
      var comboInp = document.getElementById('frm-person-name-combo-inp');
      var rawPersonVal = (pNameEl ? pNameEl.value : '') || (comboInp ? comboInp.value : '');
      var pName = (comboInp && comboInp.value) ? comboInp.value.trim() : (pNameEl ? pNameEl.value.trim() : '');
      var pType = document.getElementById('frm-person-type') ? document.getElementById('frm-person-type').value : 'General';
      
      var personList = (pType === 'Vendor') ? vendors : ((pType === 'Member') ? members : staff);
      var foundPerson = (personList || []).find(function(x) {
        return String(x.id) === String(rawPersonVal) || 
               String(x.vendorId) === String(rawPersonVal) || 
               String(x.memberId) === String(rawPersonVal) || 
               String(x.staffId) === String(rawPersonVal) ||
               String(x.name) === String(rawPersonVal) ||
               String(x.label) === String(rawPersonVal);
      });
      if (foundPerson) {
        pName = foundPerson.name || foundPerson.memName || foundPerson.label || pName;
      }
      if (!pName) pName = 'General';

      // 2. Resolve Grid Rows & Amount
      var entryAccId = document.getElementById('entry-acc-sel') ? document.getElementById('entry-acc-sel').value : '';
      var entryAmt = parseFloat(document.getElementById('entry-amount') ? document.getElementById('entry-amount').value : 0) || 0;
      
      if (gridRows.length === 0 && entryAmt > 0) {
        var accObj = accounts.find(function(a) { return String(a.accountId) === String(entryAccId); });
        if (!accObj) {
          toast('Please select an Account for the receipt line item.', false);
          return;
        }
        var entryType = document.getElementById('entry-type') ? document.getElementById('entry-type').value : 'Cr';
        gridRows.push({
          sr: 1,
          code: accObj.accCode || '',
          name: accObj.accName || '',
          dr: (entryType === 'Dr' ? entryAmt : 0),
          cr: (entryType === 'Cr' ? entryAmt : 0)
        });
      }

      var validRows = gridRows.filter(function (r) { 
        return r.code || r.name || (parseFloat(r.dr) || 0) > 0 || (parseFloat(r.cr) || 0) > 0; 
      });
      var totAmt = validRows.reduce(function (sum, r) { 
        var rCr = parseFloat(r.cr) || 0;
        var rDr = parseFloat(r.dr) || 0;
        return sum + (rCr > 0 ? rCr : (rDr > 0 ? rDr : 0)); 
      }, 0);
      if (totAmt <= 0) {
        totAmt = parseFloat(document.getElementById('entry-amount') ? document.getElementById('entry-amount').value : 0) || 0;
      }

      if (totAmt <= 0) {
        toast('Please enter a valid receipt amount greater than 0.', false);
        return;
      }

      if (validRows.length === 0) {
        toast('Please add at least one line item (Income/Receivable) to the receipt.', false);
        return;
      }

      // 3. Resolve Deposit Cash/Bank Account
      var depositSel = document.getElementById('frm-deposit-acc');
      var depositText = (depositSel && depositSel.selectedIndex >= 0 && depositSel.options[depositSel.selectedIndex])
        ? depositSel.options[depositSel.selectedIndex].text
        : '';
      var depositAccId = depositSel ? parseInt(depositSel.value, 10) : null;
      if (!depositAccId) {
        toast('Please select a valid Deposit Account (Cash/Bank).', false);
        return;
      }
      var depositAcc = accounts.find(function(a) { return a.accountId === depositAccId; });

      // 4. Build Double-Entry Line Items
      var items = [];
      validRows.forEach(function(r) {
        var accId = null;
        var found = accounts.find(function(a) { return (a.accCode && a.accCode === r.code) || (a.accName && a.accName === r.name); });
        if (found && typeof found.accountId === 'number' && found.accountId < 1000000) {
          accId = found.accountId;
        }
        var drVal = parseFloat(r.dr) || 0;
        var crVal = parseFloat(r.cr) || 0;
        if (crVal <= 0 && drVal <= 0) crVal = totAmt;
        items.push({
          accountId: accId,
          accountCode: r.code || (found ? found.accCode : 'INC-4001'),
          accountName: r.name || (found ? found.accName : 'Other Income'),
          debit: drVal, credit: crVal,
          narration: r.particulars || r.narration || (document.getElementById('frm-particular1') ? document.getElementById('frm-particular1').value : 'Other Receipt')
        });
      });

      var totDr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.debit) || 0); }, 0) * 100) / 100;
      var totCr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.credit) || 0); }, 0) * 100) / 100;

      // Check if deposit account is already explicitly included with debit in items
      var hasDepositDebit = items.some(function(it) {
        return it.debit > 0 && (
          (depositAcc && it.accountId === depositAcc.accountId) ||
          (depositAcc && it.accountCode && it.accountCode.toLowerCase() === depositAcc.accCode.toLowerCase()) ||
          (it.accountName && it.accountName.toLowerCase().includes('bank')) ||
          (it.accountName && it.accountName.toLowerCase().includes('cash in hand'))
        );
      });

      if (!hasDepositDebit) {
        var netDrNeeded = Math.round((totCr - totDr) * 100) / 100;
        if (netDrNeeded > 0) {
          items.push({
            accountId: (depositAcc && typeof depositAcc.accountId === 'number' && depositAcc.accountId < 1000000) ? depositAcc.accountId : null,
            accountCode: depositAcc ? (depositAcc.accCode || '') : 'ASS-1001',
            accountName: depositAcc ? (depositAcc.accName || '') : depositText,
            debit: netDrNeeded,
            credit: 0,
            narration: 'Receipt deposited into ' + (depositAcc ? depositAcc.accName : depositText)
          });
          totDr += netDrNeeded;
        }
      }

      var finalDr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.debit) || 0); }, 0) * 100) / 100;
      var finalCr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.credit) || 0); }, 0) * 100) / 100;

      if (Math.abs(finalDr - finalCr) > 0.01) {
        toast('Double-entry unbalanced: Total Debit (₹' + finalDr.toFixed(2) + ') must equal Total Credit (₹' + finalCr.toFixed(2) + '). Difference: ₹' + Math.abs(finalDr - finalCr).toFixed(2), false);
        return;
      }

      // 5. Header Metadata & Voucher Number
      var rawChqDate = document.getElementById('frm-chqdate') ? document.getElementById('frm-chqdate').value : '';
      var chqDateVal = toIsoDate(rawChqDate);
      var rawVDate = document.getElementById('frm-vdate') ? document.getElementById('frm-vdate').value : '';
      var vDateIso = toIsoDate(rawVDate) || todayISO();
      var sid = getActiveSocietyId();
      var fyid = getFyId();
      var recId = selectedReceiptId || 0;
      var vNo = document.getElementById('frm-vno').value || ('ORV/' + getFyLabel() + '/01');
      var transType = document.getElementById('frm-transtype') ? document.getElementById('frm-transtype').value : (depositText.toLowerCase().includes('bank') ? 'Bank' : 'Cash');

      // 6. Build API Payload
      var payload = {
        voucherId: (typeof recId === 'number' && recId < 1000000000000) ? recId : 0,
        societyId: parseInt(sid, 10),
        fyId: parseInt(fyid, 10),
        voucherNo: vNo,
        voucherDate: vDateIso,
        voucherType: 'OtherReceipt',
        personType: pType,
        paidTo: pName,
        personName: pName,
        cashBankCode: depositAcc ? depositAcc.accCode : '',
        cashBankName: depositText,
        cashBank: depositText,
        bankName: (document.getElementById('frm-drawnon') ? document.getElementById('frm-drawnon').value : '') || '',
        drawnOn: (document.getElementById('frm-drawnon') ? document.getElementById('frm-drawnon').value : '') || '',
        transType: transType,
        amount: totAmt,
        chqNo: document.getElementById('frm-chqno') ? document.getElementById('frm-chqno').value || '-' : '-',
        chqDate: chqDateVal,
        refNo: document.getElementById('frm-refno') ? document.getElementById('frm-refno').value : '',
        billNo: document.getElementById('frm-refno') ? document.getElementById('frm-refno').value : '-',
        narration: (document.getElementById('frm-particular1') ? document.getElementById('frm-particular1').value : 'Other Receipt') || 'Other Receipt',
        particular1: (document.getElementById('frm-particular1') ? document.getElementById('frm-particular1').value : 'Other Receipt') || 'Other Receipt',
        particular2: (document.getElementById('frm-particular2') ? document.getElementById('frm-particular2').value : '') || '',
        items: items
      };

      // 7. Send to Backend
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var endpointUrl = baseHost.replace(/\/api\/?$/, '') + '/api/vouchers';
      
      var resp = await fetch(endpointUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        var json = await resp.json();
        if (json && (json.success || json.voucherId)) {
          toast(selectedReceiptId ? 'Other Receipt updated successfully!' : 'Other Receipt saved successfully!', true);
          selectedReceiptId = null;
          showList();
          await loadReceipts();
          return;
        }
      }

      var errText = await resp.text();
      try {
        var errJson = JSON.parse(errText);
        toast('Failed to save: ' + (errJson.message || errText), false);
      } catch (err) {
        toast('Failed to save Other Receipt: ' + errText, false);
      }

    } catch (e) {
      console.error('saveReceipt error:', e);
      toast('Error saving receipt: ' + (e.message || e), false);
    }
  };

  window.deleteSelectedReceipt = async function () {
    if (!selectedReceiptId) {
      var checkedBox = document.querySelector('#ore-list-tbody input.row-chk:checked, #ore-list-tbody input[type="checkbox"]:checked');
      if (checkedBox && checkedBox.value) selectedReceiptId = checkedBox.value;
    }

    if (!selectedReceiptId) { toast('Please select a receipt record to delete.', false); return; }
    var tr = receipts.find(function (b) {
      return String(b.receiptId) === String(selectedReceiptId) ||
             String(b.oreId) === String(selectedReceiptId) ||
             String(b.voucherId) === String(selectedReceiptId) ||
             String(b.voucherNo) === String(selectedReceiptId);
    });
    var trNoStr = tr ? tr.voucherNo : '#' + selectedReceiptId;
    var delId = (tr && (tr.voucherId || tr.receiptId || tr.oreId)) ? (tr.voucherId || tr.receiptId || tr.oreId) : selectedReceiptId;

    var ok = typeof showConfirm === 'function'
      ? await showConfirm('Are you sure you want to delete receipt ' + trNoStr + '?', 'Confirm Delete Other Receipt')
      : confirm('Are you sure you want to delete receipt ' + trNoStr + '?');

    if (!ok) return;

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/vouchers/' + encodeURIComponent(delId), {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (resp.ok) {
        toast('Other Receipt deleted successfully from database.', true);
        selectedReceiptId = null;
        await loadReceipts();
      } else {
        var errText = await resp.text();
        toast('Failed to delete Other Receipt: ' + errText, false);
      }
    } catch (e) {
      toast('Error deleting Other Receipt: ' + e.message, false);
    }
  };

  window.previewSelectedReceipt = function () {
    if (!selectedReceiptId) { toast('Please select a receipt record to preview.', false); return; }
    var b = receipts.find(function (x) { return x.receiptId === selectedReceiptId; });
    if (!b) return;

    var container = document.getElementById('preview-receipt-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    container.innerHTML = '<div style="border-bottom:2px solid #1565C0; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#1565C0; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#1565C0; text-decoration:underline;">OTHER RECEIPT VOUCHER</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px;">' +
        '<div>' +
          '<div><strong>Received From:</strong> ' + escHtml(b.paidTo || b.personName) + '</div>' +
          '<div><strong>Person Type:</strong> ' + escHtml(b.personType) + '</div>' +
          '<div><strong>Deposit To:</strong> ' + escHtml(b.cashBank) + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div><strong>Receipt No:</strong> <span style="font-family:monospace; color:#1565C0; font-weight:bold;">' + escHtml(b.voucherNo) + '</span></div>' +
          '<div><strong>Date:</strong> ' + escHtml(b.voucherDate) + '</div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#1565C0; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Particulars</th>' +
          '<th style="padding:6px; text-align:right;">Amount (₹)</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr><td style="border:1px solid #ddd; padding:8px;">' + escHtml(b.particular1 || 'Other Receipt') + '</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#1565C0;">' + (b.amount || 0).toFixed(2) + '</td></tr>' +
        '</tbody>' +
        '<tfoot><tr style="background:#f5f5f5; font-weight:bold;">' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right;">TOTAL RECEIVED:</td>' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right; font-family:monospace; color:#1565C0; font-size:14px;">₹' + (b.amount || 0).toFixed(2) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
        '<div><strong>Prepared By</strong><br><br>_____________</div>' +
        '<div><strong>Receiver\'s Signature</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('ore-section-list').style.display = 'none';
    document.getElementById('ore-section-form').style.display = 'none';
    document.getElementById('ore-section-preview').style.display = 'flex';
  };

  window.openMultiDeleteModal = function () {
    document.getElementById('md-from').value = '';
    document.getElementById('md-to').value = '';
    document.getElementById('modal-multi-delete').style.display = 'flex';
  };

  window.runMultiDelete = function () {
    var fromNo = (document.getElementById('md-from').value || '').trim().toLowerCase();
    var toNo = (document.getElementById('md-to').value || '').trim().toLowerCase();

    if (!fromNo || !toNo) { toast('Please enter both From and To receipt numbers.', false); return; }

    var initialCount = receipts.length;
    receipts = receipts.filter(function (b) {
      var no = (b.voucherNo || '').toLowerCase();
      return !(no >= fromNo && no <= toNo);
    });

    var deletedCount = initialCount - receipts.length;
    localStorage.setItem('jeevika_other_receipts_' + getActiveSocietyId(), JSON.stringify(receipts));
    closeModal('modal-multi-delete');
    toast('Multi-deleted ' + deletedCount + ' receipt(s).', true);
    renderReceiptsTable();
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
      if (targetText) targetText.textContent = selCount + ' selected receipt(s)';
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
      list: receipts,
      idKey: 'oreId',
      noKey: 'voucherNo'
    });

    if (updatedCount > 0) {
      persistReceiptsLocally(getActiveSocietyId(), receipts);
      closeModal('modal-multi-change');
      toast('Successfully updated ' + updatedCount + ' other receipt(s).', true);
      renderReceiptsTable();
    }
  };

  window.showList = function () {
    document.getElementById('ore-section-form').style.display = 'none';
    document.getElementById('ore-section-preview').style.display = 'none';
    document.getElementById('ore-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('ore-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  window.toggleOtherDropdown = function () {
    var menu = document.getElementById('ore-other-menu');
    if (menu) menu.style.display = (menu.style.display === 'block' ? 'none' : 'block');
  };

  window.applyFilters = function () { renderReceiptsTable(); };

  window.clearFilters = function () {
    ['flt-vno', 'flt-person'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    renderReceiptsTable();
  };

  window.appendParticularTag = function (num) {
    var el = document.getElementById('frm-particular' + num);
    if (el) el.value += (el.value ? ' ' : '') + 'Other Receipt for ' + getFyLabel();
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
    var drop = document.querySelector('.ore-dropdown');
    var menu = document.getElementById('ore-other-menu');
    if (drop && menu && !drop.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // Short-cuts (Alt+A, F2, Esc, Ctrl+P)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddReceiptForm();
    } else if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveReceipt();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedReceipt();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // INIT
  (async function init() {
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var elSoc = document.getElementById('oreSocName');
    if (elSoc) elSoc.textContent = socName;

    var elFy = document.getElementById('oreFyLabel');
    if (elFy) elFy.textContent = getFyLabel();

    await loadMasterData();
    await loadReceipts();
    showList();
  })();
})();
