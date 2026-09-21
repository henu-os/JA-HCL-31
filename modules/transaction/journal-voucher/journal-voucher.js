/**
 * journal-voucher.js — Jeevika ERP v2
 * Journal Voucher Entry Directory, Dynamic Accounts & Line Items Logic
 */

(function () {
  'use strict';

  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && (k.startsWith('jeevika_jvs') || k.startsWith('jeevika_journal_vouchers'))) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

  var jvs = [];
  var members = [];
  var vendors = [];
  var staff = [];
  var accounts = [];
  var gridRows = [];
  var selectedJvId = null;
  var sortDirection = 'asc';

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
             '1';
    return id ? String(id) : '1';
  }

  function getFyLabel() {
    return (window.Auth && window.Auth.getFYLabel) ? window.Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');
  }

  function getAuthHeaders() {
    var token = (window.Auth && window.Auth.getToken) 
      ? window.Auth.getToken() 
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
    var headers = getAuthHeaders();
    var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
    var path = endpoint.startsWith('/api/') ? endpoint : ('/api' + (endpoint.startsWith('/') ? endpoint : '/' + endpoint));
    var fullUrl = baseHost + path;

    try {
      var resp = await fetch(fullUrl, { headers: headers });
      if (resp.ok) {
        var json = await resp.json();
        if (json && json.data && Array.isArray(json.data)) return json.data;
        if (Array.isArray(json)) return json;
        return json;
      }
    } catch (e) {
      console.warn("API fetch error for " + endpoint, e);
    }
    return null;
  }

  // ── 1. LOAD MASTER DATA ─────────────────────────────────────────
  async function loadMasterData() {
    var sid = getActiveSocietyId();

    // Load Accounts from Account Master
    if (typeof fetchMasterAccounts === 'function') {
      accounts = await fetchMasterAccounts(sid);
    } else {
      var accData = await fetchApiData('/api/accounts?societyId=' + sid);
      if (accData && Array.isArray(accData)) accounts = accData;
      if (!accounts || accounts.length === 0) {
        accounts = (typeof getStandardMasterAccounts === 'function') ? getStandardMasterAccounts() : [];
      }
    }

    // Load Members from API & Master
    try {
      if (typeof fetchMasterPersons === 'function') {
        var mList = await fetchMasterPersons('Member', sid);
        if (mList && mList.length > 0) {
          members = mList;
        }
      }
    } catch(e) {}
    if (!members || members.length === 0) {
      var mData = await fetchApiData(sid ? ('/api/members?societyId=' + sid) : '/api/members');
      if (!mData || (Array.isArray(mData) && mData.length === 0) || (mData.data && Array.isArray(mData.data) && mData.data.length === 0)) {
        var mDataAll = await fetchApiData('/api/members');
        if (mDataAll) mData = mDataAll;
      }
      var rawMembers = (mData && Array.isArray(mData)) ? mData : ((mData && mData.data && Array.isArray(mData.data)) ? mData.data : []);
      if (!rawMembers || rawMembers.length === 0) {
        var localM = localStorage.getItem('jeevika_master_members') || localStorage.getItem('jeevika_members_' + sid);
        if (localM) {
          try { rawMembers = JSON.parse(localM); } catch(ex){}
        }
      }
      members = (rawMembers || []).map(function(m) {
        var code = m.memCode || m.MemCode || m.code || '';
        var name = m.memName || m.MemName || m.name || m.memberName || '';
        var wing = m.wing || m.Wing || '';
        var flatNo = m.flatNo || m.FlatNo || m.flat || '';
        var flat = (wing ? (wing + '-') : '') + flatNo;
        return {
          id: m.memberId || m.socMemId || m.MemberId || m.id || flat || name,
          memberId: m.memberId || m.socMemId || m.MemberId || m.id || flat || name,
          code: code,
          name: name,
          wing: wing,
          flatNo: flat,
          label: (code ? ('[' + code + '] ') : '') + name + (flat ? (' (' + flat + ')') : '')
        };
      });
    }

    // Load Vendors from API & Master
    try {
      if (typeof fetchMasterPersons === 'function') {
        var vList = await fetchMasterPersons('Vendor', sid);
        if (vList && vList.length > 0) {
          vendors = vList;
        }
      }
    } catch(e) {}
    if (!vendors || vendors.length === 0) {
      var vData = await fetchApiData(sid ? ('/api/vendors?societyId=' + sid) : '/api/vendors');
      if (!vData || (Array.isArray(vData) && vData.length === 0) || (vData.data && Array.isArray(vData.data) && vData.data.length === 0)) {
        var vDataAll = await fetchApiData('/api/vendors');
        if (vDataAll) vData = vDataAll;
      }
      var rawVendors = (vData && Array.isArray(vData)) ? vData : ((vData && vData.data && Array.isArray(vData.data)) ? vData.data : []);
      if (!rawVendors || rawVendors.length === 0) {
        var localV = localStorage.getItem('jeevika_vendor_master') || localStorage.getItem('jeevika_vendors_' + sid) || localStorage.getItem('jeevika_vendor_master_' + sid);
        if (localV) {
          try { rawVendors = JSON.parse(localV); } catch(ex){}
        }
      }
      vendors = (rawVendors || []).map(function(v) {
        var code = v.vendorCode || v.code || v.VendorCode || '';
        var name = v.vendorName || v.name || v.VendorName || '';
        var cat = v.category || v.Category || v.designation || 'Vendor';
        return {
          id: v.vendorId || v.id || v.VendorId || code || name,
          vendorId: v.vendorId || v.id || v.VendorId || code || name,
          code: code,
          name: name,
          category: cat,
          label: (code ? ('[' + code + '] ') : '') + name + (cat ? (' (' + cat + ')') : '')
        };
      });
    }

    // Load Staff from API & Master
    try {
      if (typeof fetchMasterPersons === 'function') {
        var sList = await fetchMasterPersons('Staff', sid);
        if (sList && sList.length > 0) {
          staff = sList;
        }
      }
    } catch(e) {}
    if (!staff || staff.length === 0) {
      var sData = await fetchApiData(sid ? ('/api/staff?societyId=' + sid) : '/api/staff');
      if (!sData || (Array.isArray(sData) && sData.length === 0) || (sData.data && Array.isArray(sData.data) && sData.data.length === 0)) {
        var sDataAll = await fetchApiData('/api/staff');
        if (sDataAll) sData = sDataAll;
      }
      var rawStaff = (sData && Array.isArray(sData)) ? sData : ((sData && sData.data && Array.isArray(sData.data)) ? sData.data : []);
      if (!rawStaff || rawStaff.length === 0) {
        var localS = localStorage.getItem('jeevika_staff_' + sid) || localStorage.getItem('jeevika_staff_global');
        if (localS) {
          try { rawStaff = JSON.parse(localS); } catch(ex){}
        }
      }
      staff = (rawStaff || []).map(function(s) {
        var code = s.staffCode || s.code || s.StaffCode || '';
        var name = s.staffName || s.name || s.StaffName || '';
        var desig = s.designation || s.category || s.Designation || 'Staff';
        return {
          id: s.staffId || s.id || s.StaffId || code || name,
          staffId: s.staffId || s.id || s.StaffId || code || name,
          code: code,
          name: name,
          designation: desig,
          label: (code ? ('[' + code + '] ') : '') + name + (desig ? (' (' + desig + ')') : '')
        };
      });
    }

    populateFormDropdowns();
    onPersonTypeChange();
  }

  function getAllowCashBankJvConfig() {
    try {
      var sid = getActiveSocietyId();
      var cfgStr = localStorage.getItem('jeevika_config_notes_' + sid) || localStorage.getItem('jeevika_config_notes_global');
      if (cfgStr) {
        var cfg = JSON.parse(cfgStr);
        if (cfg && cfg.allowCashBankJv !== undefined) {
          return !!cfg.allowCashBankJv;
        }
      }
    } catch (e) {}
    return false;
  }

  window.jvAccountFilter = function (a) {
    if (getAllowCashBankJvConfig()) {
      return true;
    }
    var isAsset = (a.grpMainId === 1) || (String(a.mainGroup || '').toLowerCase() === 'asset');
    var isCashBankGrp = String(a.groupName || '').toLowerCase().includes('cash & bank') ||
                        String(a.groupName || '').toLowerCase().includes('cash and bank') ||
                        String(a.groupName || '').toLowerCase().includes('bank accounts') ||
                        String(a.groupName || '').toLowerCase().includes('cash-in-hand') ||
                        String(a.groupName || '').toLowerCase().includes('cash in hand');
    var isCashBank = isAsset && isCashBankGrp;
    return !isCashBank;
  };

  function getFilteredJvAccounts() {
    return accounts.filter(window.jvAccountFilter);
  }

  function populateFormDropdowns() {
    var jvAccs = getFilteredJvAccounts();
    if (typeof initAccountSearchCombobox === 'function') {
      initAccountSearchCombobox('entry-acc-sel', jvAccs);
    } else {
      var entrySel = document.getElementById('entry-acc-sel');
      if (entrySel) {
        var html = '<option value="">— Select Account —</option>';
        jvAccs.forEach(function (a) {
          html += '<option value="' + a.accountId + '">' + escHtml((a.accCode || '') + ' - ' + (a.accName || '')) + '</option>';
        });
        entrySel.innerHTML = html;
      }
    }
  }


  function persistJvsLocally(sid, list) {
    if (!sid) sid = getActiveSocietyId();
    try {
      var jsonStr = JSON.stringify(list || []);
      localStorage.setItem('jeevika_jvs_' + sid, jsonStr);
      localStorage.setItem('jeevika_jvs_1', jsonStr);
      localStorage.setItem('jeevika_jvs_global', jsonStr);
    } catch (e) {
      console.warn("Failed saving JVs to localStorage", e);
    }
  }

  async function loadJvs() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();

    var data = await fetchApiData('/api/vouchers?societyId=' + sid + '&fyId=' + fyid + '&type=Journal');
    if (!data || !Array.isArray(data) || data.length === 0) {
      data = await fetchApiData('/api/vouchers?societyId=' + sid + '&type=Journal');
    }
    var apiRecords = (data && Array.isArray(data)) ? data : ((data && data.data && Array.isArray(data.data)) ? data.data : []);

    jvs = apiRecords.map(function(item) {
      item.jvId = item.voucherId || item.jvId;
      item.personName = item.personName || 'Member Adjustment';
      item.particular1 = item.particular1 || item.narration || '';
      return item;
    });

    renderJvsTable();
  }

  // ── 2. REGISTER TABLE & SORTING ──────────────────────────────────
  window.toggleVoucherNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-vno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderJvsTable();
  };

  function renderJvsTable() {
    var tbody = document.getElementById('jv-list-tbody');
    if (!tbody) return;

    var filtered = jvs.filter(function (b) {
      var fNo = (document.getElementById('flt-vno') ? document.getElementById('flt-vno').value.toLowerCase().trim() : '');
      var fPerson = (document.getElementById('flt-person') ? document.getElementById('flt-person').value.toLowerCase().trim() : '');

      if (fNo && (b.voucherNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fPerson) {
        var pName = (b.personName || '').toLowerCase();
        var aName = (b.accountName || '').toLowerCase();
        var aCode = (b.accountCode || '').toLowerCase();
        var part1 = (b.particular1 || '').toLowerCase();
        var part2 = (b.particular2 || '').toLowerCase();
        var ref = (b.refNo || '').toLowerCase();
        var narr = (b.narration || '').toLowerCase();

        var matches = (
          pName.indexOf(fPerson) !== -1 ||
          aName.indexOf(fPerson) !== -1 ||
          aCode.indexOf(fPerson) !== -1 ||
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
      var noA = (a.voucherNo || '').toLowerCase();
      var noB = (b.voucherNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('jv-list-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Journal Vouchers Found</td></tr>';
      document.getElementById('sum-jv-count').textContent = '0';
      document.getElementById('sum-jv-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalGrd = 0;

    filtered.forEach(function (b) {
      var isSel = (b.jvId === selectedJvId);
      var amt = b.amount || 0;
      totalGrd += amt;

      var jId = b.jvId || b.voucherId;
      var chkHtml = '<td style="width:36px; text-align:center;"><input type="checkbox" class="row-chk" value="' + jId + '" onchange="selectJvRow(\'' + jId + '\', this.closest(\'tr\'))" ' + (isSel ? 'checked' : '') + '></td>';

      html += '<tr class="' + (isSel ? 'row-active' : '') + '" data-id="'+(b.jvId||b.voucherId||b.voucherNo||'')+'" onclick="selectJvRow(this.dataset.id, this)" ondblclick="editSelectedJv(this.dataset.id)">' +
        chkHtml +
        '<td style="font-weight:700; color:#0D47A1;">' + (b.voucherNo || '') + '</td>' +
        '<td>' + (b.voucherDate || '') + '</td>' +
        '<td>' + (b.cashBank || '-') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#0D47A1; font-family:\'Consolas\', monospace;">' + amt.toFixed(2) + '</td>' +
        '<td>' + (b.chqNo || '-') + '</td>' +
        '<td>' + (b.chqDate || '-') + '</td>' +
        '<td>' + (b.billNo || '-') + '</td>' +
        '<td style="font-weight:700;">' + (b.personName || '—') + '</td>' +
        '<td>' + (b.particular1 || '-') + '</td>' +
        '<td>' + (b.particular2 || '-') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-jv-count').textContent = filtered.length;
    document.getElementById('sum-jv-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    initColumnResizing();
  }

  window.selectJvRow = function (id, trEl) {
    selectedJvId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) {
        r.classList.remove('row-active', 'selected');
        var chk = r.querySelector('input.row-chk');
        if (chk && r !== trEl) chk.checked = false;
      });
      trEl.classList.add('row-active', 'selected');
      var thisChk = trEl.querySelector('input.row-chk');
      if (thisChk) thisChk.checked = true;
    }
  };

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

  // ── 3. FORM LOGIC & GRID ACTIONS ────────────────────────────────
  window.onPersonTypeChange = async function () {
    var typeEl = document.getElementById('frm-person-type');
    var pType = typeEl ? typeEl.value : 'Member';
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
      selPerson.innerHTML = '<option value="">— None (Direct Accounts) —</option>';
      selPerson.disabled = true;
      if (btnAdd) {
        btnAdd.disabled = true;
        btnAdd.style.opacity = '0.4';
        btnAdd.style.cursor = 'default';
        btnAdd.title = 'Not Applicable for Direct Account Vouchers';
      }
      return;
    }

    selPerson.disabled = false;
    if (btnAdd) {
      btnAdd.disabled = false;
      btnAdd.style.opacity = '1';
      btnAdd.style.cursor = 'pointer';
      btnAdd.title = 'Lookup ' + pType + ' (' + pType + ' Master)';
    }

    // Dynamic fetch if list is not loaded yet
    if (pType === 'Member' && (!members || members.length === 0)) {
      if (typeof fetchMasterPersons === 'function') members = await fetchMasterPersons('Member');
    } else if (pType === 'Vendor' && (!vendors || vendors.length === 0)) {
      if (typeof fetchMasterPersons === 'function') vendors = await fetchMasterPersons('Vendor');
    } else if (pType === 'Staff' && (!staff || staff.length === 0)) {
      if (typeof fetchMasterPersons === 'function') staff = await fetchMasterPersons('Staff');
    }

    var html = '<option value="">— Select ' + pType + ' —</option>';
    if (pType === 'Member') {
      (members || []).forEach(function (m) {
        var code = m.code || m.memCode || '';
        var name = m.name || m.memName || '';
        var flat = m.flatNo || '';
        var label = m.label || ((code ? ('[' + code + '] ') : '') + name + (flat ? (' (' + flat + ')') : ''));
        html += '<option value="' + escHtml(label) + '">' + escHtml(label) + '</option>';
      });
    } else if (pType === 'Vendor') {
      (vendors || []).forEach(function (v) {
        var code = v.code || v.vendorCode || '';
        var name = v.name || v.vendorName || '';
        var cat = v.category || '';
        var label = v.label || ((code ? ('[' + code + '] ') : '') + name + (cat ? (' (' + cat + ')') : ''));
        html += '<option value="' + escHtml(label) + '">' + escHtml(label) + '</option>';
      });
    } else {
      (staff || []).forEach(function (s) {
        var code = s.code || s.staffCode || '';
        var name = s.name || s.staffName || '';
        var desig = s.designation || '';
        var label = s.label || ((code ? ('[' + code + '] ') : '') + name + (desig ? (' (' + desig + ')') : ''));
        html += '<option value="' + escHtml(label) + '">' + escHtml(label) + '</option>';
      });
    }

    selPerson.innerHTML = html;
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

    // Reset account selection and amount to blank
    if (typeof setAccountSearchComboboxValue === 'function') {
      setAccountSearchComboboxValue('entry-acc-sel', '', '');
    } else {
      var s = document.getElementById('entry-acc-sel');
      if (s) s.value = '';
      var ci = document.getElementById('entry-acc-sel-combo-inp');
      if (ci) ci.value = '';
    }
    var amtEl = document.getElementById('entry-amount');
    if (amtEl) amtEl.value = '';

    renderGridTable();

    var comboInp = document.getElementById('entry-acc-sel-combo-inp') || document.getElementById('entry-acc-sel');
    if (comboInp) {
      comboInp.focus();
      var p = document.getElementById('entry-acc-sel-combo-panel');
      if (p) p.style.display = 'none';
      setTimeout(function() {
        if (p) p.style.display = 'none';
      }, 30);
    }
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
    var diffEl = document.getElementById('grid-diff');
    if (diffEl) {
      if (Math.abs(diff) < 0.001) {
        diffEl.innerHTML = '<span style="color:#2E7D32; font-weight:800;">0.00 (Matched)</span>';
      } else {
        diffEl.innerHTML = '<span style="color:#dc2626; font-weight:800;">' + Math.abs(diff).toFixed(2) + (diff > 0 ? ' Dr' : ' Cr') + '</span>';
      }
    }
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

  window.onGridAccountInput = function (idx, val) {
    if (!gridRows[idx]) gridRows[idx] = { sr: idx + 1, code: '', name: '', dr: 0, cr: 0 };
    var acc = findAccountByCodeOrName(val, getFilteredJvAccounts());
    var codeEl = document.getElementById('jv-grid-code-txt-' + idx);
    if (acc) {
      gridRows[idx].code = acc.accCode;
      gridRows[idx].name = acc.accName;
      if (codeEl) codeEl.textContent = acc.accCode;
      if (!gridRows[idx].dr && !gridRows[idx].cr) {
        var topAmt = parseFloat(document.getElementById('entry-amount').value) || 0;
        var topType = document.getElementById('entry-dr-cr') ? document.getElementById('entry-dr-cr').value : 'Dr';
        if (topAmt > 0) {
          if (topType === 'Dr') gridRows[idx].dr = topAmt;
          else gridRows[idx].cr = topAmt;
        }
      }
    } else {
      gridRows[idx].name = val;
      if (codeEl) codeEl.textContent = gridRows[idx].code || '—';
    }
    updateGridTotals();
  };

  window.onGridAccountSelect = function (idx, val) {
    window.onGridAccountInput(idx, val);
    var acc = findAccountByCodeOrName(val, getFilteredJvAccounts());
    if (acc) {
      var nameInp = document.getElementById('jv-grid-name-inp-' + idx);
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
    var tbody = document.getElementById('jv-grid-tbody');
    if (!tbody) return;

    var isInlineGridAllowed = getAllowGridAccountSelectConfig();
    var jvAccs = getFilteredJvAccounts();
    var html = '';
    var totDr = 0;
    var totCr = 0;

    // Refresh shared datalist for autocomplete
    var dl = document.getElementById('jv-grid-accounts-datalist');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'jv-grid-accounts-datalist';
      document.body.appendChild(dl);
    }
    var dlHtml = '';
    jvAccs.forEach(function (a) {
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
          '<td style="width:130px; text-align:center; font-family:\'Consolas\', monospace; font-weight:700; color:#0D47A1;" id="jv-grid-code-txt-' + idx + '">' +
            escHtml(r.code || '—') +
          '</td>' +
          '<td style="padding:3px 6px;">' +
            '<input type="text" class="form-inp" list="jv-grid-accounts-datalist" id="jv-grid-name-inp-' + idx + '" value="' + escHtml(displayVal) + '" placeholder="Select Account (Search by Code or Name)" oninput="onGridAccountInput(' + idx + ', this.value)" onchange="onGridAccountSelect(' + idx + ', this.value)" style="height:24px; padding:1px 8px; font-size:11px; font-weight:600; width:100%; border:1px solid #cbd5e1; border-radius:3px;">' +
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

    var diff = totDr - totCr;
    var diffEl = document.getElementById('grid-diff');
    if (diffEl) {
      if (Math.abs(diff) < 0.001) {
        diffEl.innerHTML = '<span style="color:#2E7D32; font-weight:800;">0.00 (Matched)</span>';
      } else {
        diffEl.innerHTML = '<span style="color:#dc2626; font-weight:800;">' + Math.abs(diff).toFixed(2) + (diff > 0 ? ' Dr' : ' Cr') + '</span>';
      }
    }
  }

  window.openAddJvForm = async function () {
    selectedJvId = null;
    var vNoEl = document.getElementById('frm-vno');
    if (vNoEl) {
      vNoEl.readOnly = false;
      vNoEl.disabled = false;
      vNoEl.value = (typeof fetchTxNextVoucherNo === 'function') 
        ? await fetchTxNextVoucherNo('jv') 
        : getTxNextVoucherNo('jv', jvs);
    }
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-vno', 'JV');
    document.getElementById('frm-vdate').value = todayISO();

    document.getElementById('frm-person-type').value = 'NONE';
    onPersonTypeChange();

    populateFormDropdowns();

    // Ensure account combobox panel is closed
    var pnl = document.getElementById('entry-acc-sel-combo-panel');
    if (pnl) pnl.style.display = 'none';

    gridRows = [];
    renderGridTable();

    document.getElementById('frm-transtype').value = 'Cheque';
    document.getElementById('frm-chqno').value = '';
    document.getElementById('frm-chqdate').value = '';
    document.getElementById('frm-refno').value = '';
    document.getElementById('frm-drawnon').value = '';
    document.getElementById('frm-particular1').value = '';
    document.getElementById('frm-particular2').value = '';

    document.getElementById('jv-section-list').style.display = 'none';
    document.getElementById('jv-section-form').style.display = 'flex';
  };

  window.showJvValidationError = function (title, msgHtml) {
    var modal = document.getElementById('modal-jv-validation');
    var tEl = document.getElementById('jv-val-title');
    var mEl = document.getElementById('jv-val-msg');
    if (tEl) tEl.textContent = title;
    if (mEl) mEl.innerHTML = msgHtml;
    if (modal) {
      modal.style.display = 'flex';
      var btn = document.getElementById('btn-jv-val-ok');
      if (btn) btn.focus();
    } else {
      alert(title + '\n\n' + msgHtml.replace(/<[^>]*>/g, ' '));
    }
  };

  window.editSelectedJv = async function (id) {
    if (id) selectedJvId = id;
    if (!selectedJvId) { toast('Please select a journal voucher row to edit.', false); return; }
    var b = jvs.find(function (x) {
      return String(x.jvId) === String(selectedJvId) ||
             String(x.voucherId) === String(selectedJvId) ||
             String(x.voucherNo) === String(selectedJvId);
    });
    if (!b) { toast('Journal voucher record not found.', false); return; }

    selectedJvId = b.voucherId || b.jvId;

    var vNoEl = document.getElementById('frm-vno');
    if (vNoEl) {
      vNoEl.value = b.voucherNo || '';
      vNoEl.readOnly = true; // STRICT IMMUTABILITY ON ALTER
      vNoEl.disabled = true;
    }
    document.getElementById('frm-vdate').value = b.voucherDate || b.date || todayISO();

    if (b.personType) {
      document.getElementById('frm-person-type').value = b.personType;
      onPersonTypeChange();
      var pSel = document.getElementById('frm-person-name');
      if (pSel && b.personName) {
        var optExists = false;
        for (var i = 0; i < pSel.options.length; i++) {
          if (pSel.options[i].value === b.personName || pSel.options[i].text.includes(b.personName)) {
            pSel.selectedIndex = i;
            optExists = true;
            break;
          }
        }
        if (!optExists) {
          var opt = document.createElement('option');
          opt.value = b.personName;
          opt.textContent = b.personName;
          pSel.appendChild(opt);
          pSel.value = b.personName;
        }
      }
    }

    // Fetch full line items from backend API if available
    var loadedItems = null;
    var vId = parseInt(b.voucherId || b.jvId, 10);
    if (vId && vId > 0 && vId < 1000000000000) {
      try {
        var fullData = await fetchApiData('/api/vouchers/' + vId);
        if (fullData && fullData.items && Array.isArray(fullData.items) && fullData.items.length > 0) {
          loadedItems = fullData.items;
        }
      } catch (e) {
        console.warn('Could not fetch detail lines from API, using cached lines:', e);
      }
    }

    if (loadedItems && loadedItems.length > 0) {
      gridRows = loadedItems.map(function (r, i) {
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
      gridRows = b.items.map(function (r, i) {
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
      gridRows = [];
    }
    renderGridTable();

    populateFormDropdowns();
    var pnl = document.getElementById('entry-acc-sel-combo-panel');
    if (pnl) pnl.style.display = 'none';

    document.getElementById('entry-amount').value = '';
    document.getElementById('frm-particular1').value = b.particular1 || b.narration || '';
    document.getElementById('frm-particular2').value = b.particular2 || '';

    document.getElementById('jv-section-list').style.display = 'none';
    document.getElementById('jv-section-form').style.display = 'flex';
  };

  window.saveJv = async function () {
    try {
      var pName = document.getElementById('frm-person-name').value;
      var validRows = gridRows.filter(function (r) { return r.code || r.name || (parseFloat(r.dr) || 0) > 0 || (parseFloat(r.cr) || 0) > 0; });
      var totDr = validRows.reduce(function (sum, r) { return sum + (parseFloat(r.dr) || 0); }, 0);
      var totCr = validRows.reduce(function (sum, r) { return sum + (parseFloat(r.cr) || 0); }, 0);

      if (validRows.length === 0) {
        showJvValidationError('No Line Items Entered', 'Please enter at least one Debit and Credit line item before saving.');
        return;
      }
      if (Math.abs(totDr - totCr) > 0.01 || totDr <= 0 || totCr <= 0) {
        var diff = Math.abs(totDr - totCr);
        showJvValidationError('Debit & Credit Totals Do Not Match',
          '<strong>Cannot save Journal Voucher:</strong> The Total Debit amount must equal the Total Credit amount.<br><br>' +
          '<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:4px; padding:10px; font-size:12px;">' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Total Debit (Dr):</span><strong style="color:#2E7D32;">₹' + totDr.toFixed(2) + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Total Credit (Cr):</span><strong style="color:#dc2626;">₹' + totCr.toFixed(2) + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; border-top:1px dashed #f87171; padding-top:4px; margin-top:4px;"><span>Difference:</span><strong style="color:#b91c1c;">₹' + diff.toFixed(2) + '</strong></div>' +
          '</div><br>' +
          '<span style="color:#64748b; font-size:11.5px;">Please balance the Debit and Credit amounts before clicking Save.</span>'
        );
        return;
      }
      var totAmt = totDr;

      var sid = getActiveSocietyId();
      var fyid = getFyId();
      var jId = selectedJvId || Date.now();
      var vNo = document.getElementById('frm-vno').value || ('JV/25-26/' + (jvs.length + 1));

      var refCode = '';
      if (pName) {
        var matchBracket = pName.match(/\[(.*?)\]/);
        if (matchBracket && matchBracket[1]) refCode = matchBracket[1];
        if (!refCode) {
          var foundMem = members.find(function(m) { return m.name === pName || m.label === pName || m.id === pName; });
          if (foundMem && foundMem.code) refCode = foundMem.code;
        }
      }

      var part1Val = document.getElementById('frm-particular1').value.trim();
      var part2Val = document.getElementById('frm-particular2').value.trim();

      var payload = {
        jvId: jId,
        voucherId: (typeof jId === 'number' && jId < 1000000000000) ? jId : 0,
        societyId: parseInt(sid, 10),
        fyId: parseInt(fyid, 10),
        voucherNo: vNo,
        voucherType: 'Journal',
        personType: (document.getElementById('frm-person-type') ? document.getElementById('frm-person-type').value : 'NONE') || 'NONE',
        personName: pName || '',
        paidTo: pName || '',
        refNo: refCode || '',
        amount: totAmt,
        narration: part1Val,
        particular1: part1Val,
        particular2: part2Val,
        gridRows: gridRows,
        items: validRows.map(function(r) {
          var accId = null;
          var found = accounts.find(function(a) { return a.accCode === r.code; });
          if (found) accId = found.accountId;
          return {
            accountId: accId,
            accountCode: r.code || '',
            accountName: r.name || '',
            debit: parseFloat(r.dr) || 0,
            credit: parseFloat(r.cr) || 0,
            narration: r.particulars || r.narration || ''
          };
        })
      };

      if (typeof validateTxVoucherNo === 'function') {
        var vCheck = validateTxVoucherNo('jv', vNo);
        if (!vCheck.valid) {
          toast(vCheck.error, false);
          return;
        }
      }

      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/vouchers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        var json = await resp.json();
        if (json && json.success) {
          toast(selectedJvId ? 'Journal Voucher updated successfully in database!' : 'Journal Voucher saved successfully in database!', true);
          showList();
          await loadJvs();
          return;
        }
      }
      var errText = await resp.text();
      toast('Failed to save Journal Voucher in database: ' + errText, false);
    } catch (e) {
      console.error('saveJv error:', e);
      toast('Error saving voucher: ' + (e.message || e), false);
    }
  };

  window.deleteSelectedJv = async function () {
    if (!selectedJvId) {
      var checkedBox = document.querySelector('#jv-list-tbody input.row-chk:checked');
      if (checkedBox && checkedBox.value) {
        selectedJvId = checkedBox.value;
      }
    }

    if (!selectedJvId) {
      toast('Please select a journal voucher to delete (click a row or check its box).', false);
      return;
    }

    var tr = jvs.find(function (b) {
      return String(b.jvId) === String(selectedJvId) ||
             String(b.voucherId) === String(selectedJvId) ||
             String(b.voucherNo) === String(selectedJvId);
    });
    var trNoStr = tr ? tr.voucherNo : '#' + selectedJvId;
    var delId = (tr && (tr.voucherId || tr.jvId)) ? (tr.voucherId || tr.jvId) : selectedJvId;

    var ok = typeof showConfirm === 'function'
      ? await showConfirm('Are you sure you want to delete journal voucher ' + trNoStr + '?', 'Confirm Delete Journal Voucher')
      : confirm('Are you sure you want to delete journal voucher ' + trNoStr + '?');

    if (!ok) return;

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/vouchers/' + encodeURIComponent(delId), {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (resp.ok) {
        toast('Journal Voucher deleted successfully from database.', true);
        selectedJvId = null;
        await loadJvs();
      } else {
        var errText = await resp.text();
        toast('Failed to delete Journal Voucher: ' + errText, false);
      }
    } catch (e) {
      toast('Error deleting Journal Voucher: ' + e.message, false);
    }
  };

  window.previewSelectedJv = function () {
    if (!selectedJvId) {
      var checkedBox = document.querySelector('#jv-list-tbody input.row-chk:checked');
      if (checkedBox && checkedBox.value) selectedJvId = checkedBox.value;
    }
    if (!selectedJvId) { toast('Please select a journal voucher to preview.', false); return; }
    var b = jvs.find(function (x) { return String(x.jvId) === String(selectedJvId) || String(x.voucherId) === String(selectedJvId) || String(x.voucherNo) === String(selectedJvId); });
    if (!b) return;

    var container = document.getElementById('preview-jv-card');
    var socName = (window.Auth && window.Auth.getSocietyName) ? window.Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    container.innerHTML = '<div style="border-bottom:2px solid #0D47A1; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#0D47A1; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#0D47A1; text-decoration:underline;">JOURNAL VOUCHER ENTRY</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px;">' +
        '<div>' +
          '<div><strong>Person / Party Name:</strong> ' + escHtml(b.personName) + '</div>' +
          '<div><strong>Adjustment Type:</strong> Journal Entry</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div><strong>Voucher No:</strong> <span style="font-family:monospace; color:#0D47A1; font-weight:bold;">' + escHtml(b.voucherNo) + '</span></div>' +
          '<div><strong>Date:</strong> ' + escHtml(b.voucherDate) + '</div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#0D47A1; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Particulars</th>' +
          '<th style="padding:6px; text-align:right;">Amount (₹)</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr><td style="border:1px solid #ddd; padding:8px;">' + escHtml(b.particular1 || 'Journal Voucher Entry') + '</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#0D47A1;">' + (b.amount || 0).toFixed(2) + '</td></tr>' +
        '</tbody>' +
        '<tfoot><tr style="background:#f5f5f5; font-weight:bold;">' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right;">TOTAL AMOUNT:</td>' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right; font-family:monospace; color:#0D47A1; font-size:14px;">₹' + (b.amount || 0).toFixed(2) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
        '<div><strong>Prepared By</strong><br><br>_____________</div>' +
        '<div><strong>Authorized Signatory</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('jv-section-list').style.display = 'none';
    document.getElementById('jv-section-form').style.display = 'none';
    document.getElementById('jv-section-preview').style.display = 'flex';
  };

  window.openMultiDeleteModal = function () {
    document.getElementById('md-from').value = '';
    document.getElementById('md-to').value = '';
    document.getElementById('modal-multi-delete').style.display = 'flex';
  };

  window.runMultiDelete = async function () {
    var fromNo = (document.getElementById('md-from').value || '').trim().toLowerCase();
    var toNo = (document.getElementById('md-to').value || '').trim().toLowerCase();

    if (!fromNo || !toNo) { toast('Please enter both From and To voucher numbers.', false); return; }

    var toDelete = jvs.filter(function (b) {
      var no = (b.voucherNo || '').toLowerCase();
      return (no >= fromNo && no <= toNo);
    });

    if (toDelete.length === 0) {
      toast('No vouchers match the given range.', false);
      return;
    }

    var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
    var delCount = 0;
    for (var i = 0; i < toDelete.length; i++) {
      var vid = toDelete[i].voucherId || toDelete[i].jvId || toDelete[i].voucherNo;
      try {
        await fetch(baseHost + '/api/vouchers/' + encodeURIComponent(vid), {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        delCount++;
      } catch (e) {}
    }

    closeModal('modal-multi-delete');
    toast('Deleted ' + delCount + ' voucher(s) from database.', true);
    await loadJvs();
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
      if (targetText) targetText.textContent = selCount + ' selected voucher(s)';
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
      list: jvs,
      idKey: 'jvId',
      noKey: 'voucherNo'
    });

    if (updatedCount > 0) {
      persistJvsLocally(getActiveSocietyId(), jvs);
      closeModal('modal-multi-change');
      toast('Successfully updated ' + updatedCount + ' journal voucher(s).', true);
      renderJvsTable();
    }
  };

  window.showList = function () {
    document.getElementById('jv-section-form').style.display = 'none';
    document.getElementById('jv-section-preview').style.display = 'none';
    document.getElementById('jv-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('jv-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  window.toggleOtherDropdown = function () {
    var menu = document.getElementById('jv-other-menu');
    if (menu) menu.style.display = (menu.style.display === 'block' ? 'none' : 'block');
  };

  window.applyFilters = function () { renderJvsTable(); };

  window.clearFilters = function () {
    ['flt-vno', 'flt-person'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    renderJvsTable();
  };

  window.appendParticularTag = function (num) {
    var el = document.getElementById('frm-particular' + num);
    if (el) el.value += (el.value ? ' ' : '') + 'Journal Voucher Entry for ' + getFyLabel();
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
    var drop = document.querySelector('.jv-dropdown');
    var menu = document.getElementById('jv-other-menu');
    if (drop && menu && !drop.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // Short-cuts (Alt+A, F2, Esc, Ctrl+P)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddJvForm();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedJv();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // Storage & Focus listeners for cross-module real-time sync
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.includes('member') || e.key.includes('vendor') || e.key.includes('staff') || e.key.includes('account') || e.key.includes('activeSocietyId')) {
      loadMasterData();
    }
  });

  window.addEventListener('focus', function () {
    loadMasterData();
  });

  // INIT
  (async function init() {
    var _sn = (window.Auth && window.Auth.getSocietyName) ? window.Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && window.Auth.getFYLabel) ? window.Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('jvSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('jvFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    await loadMasterData();
    await loadJvs();
    showList();
  })();

})();
