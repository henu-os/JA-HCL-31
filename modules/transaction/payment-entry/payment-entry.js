/**
 * payment-entry.js — Jeevika ERP v2
 * Payment Entry (Voucher) Directory, Dynamic Accounts & Line Items Logic
 */

(function () {
  'use strict';

  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && (k.startsWith('jeevika_payments') || k.startsWith('jeevika_payment_entries'))) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

  var payments = [];
  var purchaseOrders = [];
  var members = [];
  var vendors = [];
  var staff = [];
  var accounts = [];
  var gridRows = [];
  var selectedPaymentId = null;
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
    if (!dateStr || String(dateStr).trim() === '' || dateStr === '-') return null;
    var s = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split('T')[0];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      var p = s.split('/');
      return p[2] + '-' + p[1] + '-' + p[0];
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      var p2 = s.split('-');
      return p2[2] + '-' + p2[1] + '-' + p2[0];
    }
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return null;
  }

  async function fetchApiData(endpoint) {
    if (window.API && API.get) {
      try {
        var ep = endpoint.startsWith('/') ? endpoint : ('/' + endpoint);
        var res = await API.get(ep);
        if (res !== undefined && res !== null) return res;
      } catch (e) {
        return null;
      }
    }

    var token = (typeof Auth !== 'undefined' && Auth.getToken) 
      ? Auth.getToken() 
      : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
    var societyId = getActiveSocietyId();
    var fyId = getFyId();

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (societyId) headers['X-Society-Id'] = societyId;
    if (fyId) headers['X-FY-Id'] = fyId;

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

    // Load Purchase Orders
    await loadPurchaseOrders();

    populateFormDropdowns();
  }

  async function loadPurchaseOrders() {
    var sid = getActiveSocietyId() || '1';
    var fyid = getFyId() || '1';
    var data = await fetchApiData('/api/purchase-orders?societyId=' + sid + '&fyId=' + fyid);
    if (data && Array.isArray(data) && data.length > 0) {
      purchaseOrders = data;
    } else {
      var stored = localStorage.getItem('jeevika_pos_' + sid);
      if (stored) {
        try { purchaseOrders = JSON.parse(stored); } catch (e) {}
      }
    }
    if (!purchaseOrders) purchaseOrders = [];
  }

  function getFilteredAccounts() {
    if (typeof filterAccountsByGroupVisibility === 'function') {
      return filterAccountsByGroupVisibility(accounts, 'paymententry');
    }
    return accounts;
  }

  function populateFormDropdowns() {
    // Withdraw Account Selector
    onCreditTypeChange();

    // Person Type & Name Selector
    onPersonTypeChange();

    var visAccs = getFilteredAccounts();

    // Entry Account — Searchable Combobox
    if (typeof initAccountSearchCombobox === 'function') {
      initAccountSearchCombobox('entry-acc-sel', visAccs);
    } else {
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


  // localStorage write intentionally removed — DB is single source of truth
  function persistPaymentsLocally(sid, list) { /* no-op: DB only */ }

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

  function getVoucherTypeFromRecord(item) {
    var vNo = (item.voucherNo || '').toUpperCase();
    var cb = (item.cashBankName || item.cashBank || '').toLowerCase();
    var vt = (item.voucherType || '').toLowerCase();

    if (vt === 'cash voucher' || vNo.startsWith('CASH') || vNo.startsWith('CPY') || vNo.startsWith('CSH') || cb.includes('cash')) {
      return 'Cash Voucher';
    }
    if (vt === 'swift voucher' || vNo.startsWith('SWIF') || vNo.startsWith('SWIFT') || cb.includes('swift') || cb.includes('swif')) {
      return 'Swift Voucher';
    }
    return 'Bank Voucher';
  }

  async function loadPayments() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();

    try {
      localStorage.removeItem('jeevika_payments_' + sid);
      localStorage.removeItem('jeevika_payments_1');
      localStorage.removeItem('jeevika_payments_4');
      localStorage.removeItem('jeevika_payments_global');
      localStorage.removeItem('jeevika_payment_entries_' + sid);
      localStorage.removeItem('jeevika_payment_entries_4');
    } catch (e) {}

    var apiRecords = null;
    try {
      var data = await fetchApiData('/api/vouchers?societyId=' + sid + '&fyId=' + fyid + '&type=Payment');
      if (data && Array.isArray(data)) {
        apiRecords = data;
      } else if (data && data.data && Array.isArray(data.data)) {
        apiRecords = data.data;
      }
    } catch (e) {
      console.warn("API fetch error for payments", e);
    }

    if (apiRecords && Array.isArray(apiRecords)) {
      payments = apiRecords.map(function(item) {
        item.paymentId = item.voucherId || item.paymentId;
        item.cashBank = item.cashBank || item.cashBankName || 'ASS-1002 - Bank A/C';
        item.paidTo = resolvePersonDisplayName(item.paidTo || item.personName, item.personType);
        item.personName = item.paidTo;
        item.particular1 = item.particular1 || item.narration || 'Payment Voucher';
        item.voucherType = getVoucherTypeFromRecord(item);
        return item;
      });
    } else {
      payments = [];
    }

    renderPaymentsTable();
  }

  // ── 2. REGISTER TABLE & SORTING ──────────────────────────────────
  window.toggleVoucherNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-vno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderPaymentsTable();
  };

  function renderPaymentsTable() {
    var tbody = document.getElementById('pe-list-tbody');
    if (!tbody) return;

    var filtered = payments.filter(function (b) {
      var fNo = (document.getElementById('flt-vno') ? document.getElementById('flt-vno').value.toLowerCase().trim() : '');
      var fPerson = (document.getElementById('flt-person') ? document.getElementById('flt-person').value.toLowerCase().trim() : '');

      if (fNo && (b.voucherNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fPerson) {
        var pName = (b.paidTo || b.personName || '').toLowerCase();
        var aName = (b.accountName || '').toLowerCase();
        var aCode = (b.accountCode || '').toLowerCase();
        var chq = (b.chqNo || '').toLowerCase();
        var bName = (b.bankName || '').toLowerCase();
        var narr = (b.narration || '').toLowerCase();

        var matches = (
          pName.indexOf(fPerson) !== -1 ||
          aName.indexOf(fPerson) !== -1 ||
          aCode.indexOf(fPerson) !== -1 ||
          chq.indexOf(fPerson) !== -1 ||
          bName.indexOf(fPerson) !== -1 ||
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

    document.getElementById('pe-list-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Payment Voucher Entries Found</td></tr>';
      document.getElementById('sum-pay-count').textContent = '0';
      document.getElementById('sum-pay-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalGrd = 0;

    filtered.forEach(function (b) {
      var isSel = (String(b.paymentId) === String(selectedPaymentId) || String(b.voucherNo) === String(selectedPaymentId));
      var amt = b.amount || 0;
      totalGrd += amt;

      var pId = b.paymentId || b.voucherId;
      var chkHtml = (window.ERP_MultiChange && typeof ERP_MultiChange.renderCheckbox === 'function')
        ? ERP_MultiChange.renderCheckbox(pId)
        : '<td style="width:36px; text-align:center;"><input type="checkbox" class="row-chk" value="' + pId + '"></td>';

      html += '<tr class="' + (isSel ? 'row-active' : '') + '" data-id="'+(b.paymentId||b.voucherId||b.voucherNo||'')+'" onclick="selectPaymentRow(this.dataset.id, this)" ondblclick="editSelectedPayment(this.dataset.id)">' +
        chkHtml +
        '<td style="font-weight:700; color:#0D47A1;">' + (b.voucherNo || '') + '</td>' +
        '<td>' + (b.voucherDate || '') + '</td>' +
        '<td>' + (b.cashBank || 'ASS-1002 - Bank A/C') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#0D47A1; font-family:\'Consolas\', monospace;">' + amt.toFixed(2) + '</td>' +
        '<td>' + (b.chqNo || '-') + '</td>' +
        '<td>' + (b.chqDate || '-') + '</td>' +
        '<td>' + (b.billNo || '-') + '</td>' +
        '<td style="font-weight:700;">' + (b.paidTo || b.personName || '—') + '</td>' +
        '<td>' + (b.particular1 || '-') + '</td>' +
        '<td>' + (b.particular2 || '-') + '</td>' +
        '<td style="text-align:center; font-weight:800; color:#d97706;">' + (b.voucherType || 'Bank') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-pay-count').textContent = filtered.length;
    document.getElementById('sum-pay-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

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

  window.selectPaymentRow = function (id, trEl) {
    selectedPaymentId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('row-active', 'selected'); });
      trEl.classList.add('row-active', 'selected');
    }
  };

  // ── 3. FORM LOGIC & ACTIONS ──────────────────────────────────────
  function getPaymentSubModules() {
    var defaults = [
      { id: 'payBank', name: 'Bank Voucher', prefix: 'PYMT', startNo: 1, useShortFy: false, isPaymentSub: true },
      { id: 'payCash', name: 'Cash Voucher', prefix: 'CASH', startNo: 1, useShortFy: false, isPaymentSub: true },
      { id: 'paySwiss', name: 'Swift Voucher', prefix: 'SWIF', startNo: 1, useShortFy: false, isPaymentSub: true }
    ];

    try {
      var socId = (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1');
      var savedStr = localStorage.getItem('jeevika_config_notes_global') || localStorage.getItem('jeevika_config_notes_' + socId);
      if (!savedStr) {
        for (var k in localStorage) {
          if (k.indexOf('jeevika_config_notes_') === 0) {
            savedStr = localStorage.getItem(k);
            if (savedStr) break;
          }
        }
      }
      if (savedStr) {
        var savedObj = JSON.parse(savedStr);
        if (savedObj && Array.isArray(savedObj.txModules)) {
          var subs = savedObj.txModules.filter(function (m) { return m.isPaymentSub; });
          if (subs && subs.length > 0) {
            return subs.map(function (m) {
              var cleanName = m.name;
              if (m.id === 'payCash' && (!m.name || m.name.includes('(A)'))) cleanName = 'Cash Voucher';
              else if (m.id === 'payBank' && (!m.name || m.name.includes('(B)'))) cleanName = 'Bank Voucher';
              else if (m.id === 'paySwiss' && (!m.name || m.name.includes('(C)'))) cleanName = 'Swift Voucher';
              return {
                id: m.id,
                name: cleanName,
                prefix: m.prefix,
                startNo: m.startNo,
                useShortFy: m.useShortFy,
                isPaymentSub: true
              };
            });
          }
        }
      }
    } catch (e) {
      console.warn('Error loading payment sub-types config', e);
    }
    return defaults;
  }

  function populateVoucherTypeOptions(selectedVal) {
    var vTypeSel = document.getElementById('frm-vtype');
    if (!vTypeSel) return;
    var subModules = getPaymentSubModules();
    var html = '';
    subModules.forEach(function (m) {
      var isSel = (selectedVal && (selectedVal === m.name || selectedVal === m.id)) || (!selectedVal && m.id === 'payBank');
      html += '<option value="' + escHtml(m.name) + '" data-id="' + escHtml(m.id) + '" data-prefix="' + escHtml(m.prefix) + '"' + (isSel ? ' selected' : '') + '>' + escHtml(m.name) + '</option>';
    });
    vTypeSel.innerHTML = html;
  }

  function updateVoucherNoForType(vTypeVal) {
    if (selectedPaymentId) return;
    var vTypeSel = document.getElementById('frm-vtype');
    var opt = vTypeSel ? vTypeSel.options[vTypeSel.selectedIndex] : null;
    var modId = opt ? opt.getAttribute('data-id') : 'payBank';
    var prefix = opt ? opt.getAttribute('data-prefix') : 'PYMT';

    if (!modId) {
      if ((vTypeVal || '').toLowerCase().includes('cash')) modId = 'payCash';
      else if ((vTypeVal || '').toLowerCase().includes('swif')) modId = 'paySwiss';
      else modId = 'payBank';
    }

    var matchingPayments = (payments || []).filter(function (p) {
      return (p.voucherType && p.voucherType.toLowerCase() === (vTypeVal || '').toLowerCase()) ||
             (p.voucherNo && prefix && p.voucherNo.startsWith(prefix));
    });

    var nextVNo = (typeof getTxNextVoucherNo === 'function') ? getTxNextVoucherNo(modId, matchingPayments) : (prefix + '/25-26/' + (matchingPayments.length + 1));
    var vnoInp = document.getElementById('frm-vno');
    if (vnoInp) vnoInp.value = nextVNo;
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-vno', 'Payment');
  }

  window.onVoucherTypeChange = function () {
    var vTypeSel = document.getElementById('frm-vtype');
    var vType = vTypeSel ? vTypeSel.value : '';
    var credCash = document.getElementById('cred-cash');
    var credBank = document.getElementById('cred-bank');

    var isCash = vType.toLowerCase().includes('cash');
    if (isCash) {
      if (credCash) credCash.checked = true;
    } else {
      if (credBank) credBank.checked = true;
    }
    onCreditTypeChange(true);
    updateVoucherNoForType(vType);
  };

  window.onCreditTypeChange = function (skipSync) {
    var isBank = document.getElementById('cred-bank').checked;
    var sel = document.getElementById('frm-withdraw-acc');
    var vTypeSel = document.getElementById('frm-vtype');

    if (!skipSync && vTypeSel) {
      if (isBank) {
        if (vTypeSel.value.toLowerCase().includes('cash')) {
          vTypeSel.value = 'Bank Voucher';
          updateVoucherNoForType('Bank Voucher');
        }
      } else {
        vTypeSel.value = 'Cash Voucher';
        updateVoucherNoForType('Cash Voucher');
      }
    }

    if (!sel) return;

    var filteredAccs = accounts.filter(function (a) {
      var isAsset = (a.grpMainId === 1) || (String(a.mainGroup || '').toLowerCase() === 'asset');
      var isCashBankGrp = String(a.groupName || '').toLowerCase().includes('cash & bank') || String(a.groupName || '').toLowerCase().includes('cash and bank');
      var isCashBank = isAsset && isCashBankGrp;

      if (!isCashBank) return false;

      var isCashAcc = String(a.accName || '').toLowerCase().includes('cash') || String(a.accCode || '').toLowerCase() === 'ass-1001';
      return isBank ? !isCashAcc : isCashAcc;
    });

    if (filteredAccs.length === 0) {
      filteredAccs = accounts.filter(function (a) {
        var isAsset = (a.grpMainId === 1) || (String(a.mainGroup || '').toLowerCase() === 'asset');
        var isCashAcc = String(a.accName || '').toLowerCase().includes('cash') || String(a.accCode || '').toLowerCase() === 'ass-1001';
        return isAsset && (isBank ? !isCashAcc : isCashAcc);
      });
    }

    var html = '';
    filteredAccs.forEach(function (a) {
      html += '<option value="' + a.accountId + '">' + escHtml((a.accCode || '') + ' - ' + (a.accName || '')) + '</option>';
    });
    if (html === '') {
      html = isBank ? '<option value="">— No Bank Account Found —</option>' : '<option value="">— No Cash Account Found —</option>';
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
      btnAdd.title = isLookupAvailable ? ('Lookup ' + (pType || 'Person') + ' (' + (pType || 'Person') + ' Master)') : 'Not Applicable';
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
        var mName = m.memName || m.name || '';
        var mCode = m.memCode || m.code || '';
        var mFlat = m.flatNo || m.flat || '';
        var lbl = m.label || ((mCode ? ('[' + mCode + '] ') : '') + mName + (mFlat ? (' (' + mFlat + ')') : ''));
        return { id: m.memberId || m.socMemId || m.id || mName, label: lbl, obj: m };
      });
    } else if (pType === 'Staff') {
      personList = (staff || []).map(function (s) {
        return { id: s.staffId || s.id || s.name, label: s.label || s.name, obj: s };
      });
    }

    // Convert to account-style objects for the combobox
    var accStyleList = personList.map(function(p) {
      var code = (p.obj && (p.obj.code || p.obj.memCode || p.obj.vendorCode || p.obj.staffCode)) 
        ? (p.obj.code || p.obj.memCode || p.obj.vendorCode || p.obj.staffCode) 
        : '';
      return { accountId: p.id, accCode: code, accName: p.label, _obj: p.obj };
    });

    // Init searchable combobox (clears existing wrapper first)
    var existingWrap = document.getElementById('frm-person-name-combo-wrap');
    if (existingWrap) existingWrap.remove();

    var selPerson = document.getElementById('frm-person-name');
    if (selPerson) {
      selPerson.style.display = '';
      selPerson.innerHTML = '<option value="">— Select ' + (pType || 'Person') + ' —</option>';
      personList.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        selPerson.appendChild(opt);
      });
    }

    if (typeof initAccountSearchCombobox === 'function') {
      window._personObjMap = {};
      accStyleList.forEach(function(a) { window._personObjMap[String(a.accountId)] = a._obj; });
      initAccountSearchCombobox('frm-person-name', accStyleList);
      var inp = document.getElementById('frm-person-name-combo-inp');
      if (inp) inp.placeholder = (accStyleList.length === 0 ? 'No ' + pType + 's in master — click + to add' : '— Select ' + pType + ' —');
    }

    if (pType) switchSidebarTab(pType);
  };

  window.onPersonSelect = function () {
    var selPerson = document.getElementById('frm-person-name');
    var personId = selPerson ? selPerson.value : '';
    var pType = document.getElementById('frm-person-type').value;

    var targetObj = null;
    if (window._personObjMap && window._personObjMap[String(personId)]) {
      targetObj = window._personObjMap[String(personId)];
    } else {
      var list = (pType === 'Vendor') ? vendors : ((pType === 'Member') ? members : staff);
      targetObj = (list || []).find(function (x) {
        return String(x.name || x.memName || x.vendorName || x.staffName) === String(personId) || 
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
      ['sb-pan', 'sb-tds', 'sb-tdssec', 'sb-gstin', 'sb-mob1', 'sb-mob2', 'sb-contract-val', 'sb-remark', 'sb-period-from', 'sb-period-to'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
    }
  };

  window.redirectToAddPerson = function () {
    var pType = document.getElementById('frm-person-type') ? document.getElementById('frm-person-type').value : '';
    var targetModule = (pType === 'Staff') ? 'staff-master' : ((pType === 'Member') ? 'member-master' : 'vendor-master');
    if (window.WorkspaceBridge && typeof window.WorkspaceBridge.openModule === 'function') {
      window.WorkspaceBridge.openModule(targetModule);
    } else if (window.parent && window.parent.WorkspaceManager && typeof window.parent.WorkspaceManager.openModule === 'function') {
      window.parent.WorkspaceManager.openModule(targetModule);
    } else {
      window.location.href = '../../master/' + targetModule + '/' + targetModule + '.html?action=add';
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

  function getAllowPoModeConfig() {
    try {
      var sid = getActiveSocietyId();
      var cfgStr = localStorage.getItem('jeevika_config_notes_' + sid) || localStorage.getItem('jeevika_config_notes_global');
      if (cfgStr) {
        var cfg = JSON.parse(cfgStr);
        if (cfg && cfg.allowPoMode !== undefined) {
          return !!cfg.allowPoMode;
        }
      }
    } catch (e) {}
    return true; // Default enabled
  }

  function applyPoModeConfigVisibility() {
    var allowPo = getAllowPoModeConfig();
    var badge = document.getElementById('po-mode-badge-wrap');
    if (badge) {
      badge.style.display = allowPo ? 'inline-flex' : 'none';
    }
    if (!allowPo) {
      var chk = document.getElementById('chk-po-mode');
      if (chk && chk.checked) {
        chk.checked = false;
        onPoModeToggleChange(false);
      }
    }
  }

  window.togglePoMode = function () {
    if (!getAllowPoModeConfig()) return;
    var chk = document.getElementById('chk-po-mode');
    if (chk) {
      chk.checked = !chk.checked;
      onPoModeToggleChange(chk.checked);
    }
  };

  window.onPoModeToggleChange = async function (isOn) {
    var poVendorWrap = document.getElementById('po-vendor-wrap');
    var poSelectWrap = document.getElementById('po-select-wrap');
    var secInv = document.getElementById('sec-invoice-details');
    var selPoVendor = document.getElementById('frm-po-vendor');
    var selPoNo = document.getElementById('frm-po-no');

    if (isOn) {
      if (!purchaseOrders || purchaseOrders.length === 0) {
        await loadPurchaseOrders();
      }

      // Extract unique vendors who have POs
      var poVendors = [];
      var seenVendors = {};
      purchaseOrders.forEach(function (po) {
        var vName = (po.vendorName || po.personName || '').trim();
        if (vName && !seenVendors[vName.toLowerCase()]) {
          seenVendors[vName.toLowerCase()] = true;
          poVendors.push({
            name: vName,
            vendorId: po.vendorId || ''
          });
        }
      });

      if (selPoVendor) {
        var html = '<option value="">— Select PO Vendor —</option>';
        poVendors.forEach(function (v) {
          html += '<option value="' + escHtml(v.name) + '">' + escHtml(v.name) + '</option>';
        });
        if (poVendors.length === 0) {
          html = '<option value="">(No Vendors with POs)</option>';
        }
        selPoVendor.innerHTML = html;
      }

      if (poVendorWrap) poVendorWrap.style.display = 'block';
      if (poSelectWrap) poSelectWrap.style.display = 'none';
      if (secInv) secInv.style.display = 'none';
    } else {
      if (poVendorWrap) poVendorWrap.style.display = 'none';
      if (poSelectWrap) poSelectWrap.style.display = 'none';
      if (secInv) secInv.style.display = 'none';
      if (selPoVendor) selPoVendor.value = '';
      if (selPoNo) selPoNo.innerHTML = '<option value="">— Select Purchase Order —</option>';
      clearInvoiceFields();
    }
  };

  window.onPoVendorSelect = function () {
    var selPoVendor = document.getElementById('frm-po-vendor');
    var vName = selPoVendor ? selPoVendor.value : '';
    var poSelectWrap = document.getElementById('po-select-wrap');
    var selPoNo = document.getElementById('frm-po-no');
    var secInv = document.getElementById('sec-invoice-details');

    if (!vName) {
      if (poSelectWrap) poSelectWrap.style.display = 'none';
      if (secInv) secInv.style.display = 'none';
      if (selPoNo) selPoNo.innerHTML = '<option value="">— Select Purchase Order —</option>';
      clearInvoiceFields();
      return;
    }

    // Sync main person selection and right sidebar
    var pTypeSel = document.getElementById('frm-person-type');
    if (pTypeSel) {
      pTypeSel.value = 'Vendor';
      onPersonTypeChange();
    }
    var pNameSel = document.getElementById('frm-person-name');
    if (pNameSel) {
      pNameSel.value = vName;
      var comboInp = document.getElementById('frm-person-name-combo-inp');
      if (comboInp) comboInp.value = vName;
      onPersonSelect();
    }

    // Filter POs for this vendor
    var vendorPos = purchaseOrders.filter(function (po) {
      var name = (po.vendorName || po.personName || '').trim().toLowerCase();
      return name === vName.toLowerCase();
    });

    if (selPoNo) {
      var html = '<option value="">— Select Purchase Order —</option>';
      vendorPos.forEach(function (po) {
        var poLabel = (po.poNo || 'PO') + (po.poDate ? ' (' + po.poDate + ')' : '') + (po.amount ? ' - ₹' + Number(po.amount).toLocaleString('en-IN') : '');
        var val = po.poId || po.poNo;
        html += '<option value="' + escHtml(val) + '">' + escHtml(poLabel) + '</option>';
      });
      selPoNo.innerHTML = html;
    }

    if (poSelectWrap) poSelectWrap.style.display = 'block';
    if (secInv) secInv.style.display = 'none';
    clearInvoiceFields();
  };

  window.onPurchaseOrderSelect = function () {
    var selPoNo = document.getElementById('frm-po-no');
    var poVal = selPoNo ? selPoNo.value : '';
    var secInv = document.getElementById('sec-invoice-details');

    if (!poVal) {
      if (secInv) secInv.style.display = 'none';
      clearInvoiceFields();
      return;
    }

    var poObj = purchaseOrders.find(function (po) {
      return String(po.poId) === String(poVal) || String(po.poNo) === String(poVal);
    });

    if (secInv) secInv.style.display = 'block';

    if (poObj) {
      var setVal = function (id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
      setVal('frm-invno', poObj.invNo && poObj.invNo !== '-' ? poObj.invNo : (poObj.poNo ? 'INV/' + poObj.poNo : ''));
      setVal('frm-invdate', poObj.invDate && poObj.invDate !== '-' ? poObj.invDate : (poObj.poDate || todayISO()));
      setVal('frm-invduedate', poObj.invDueDate && poObj.invDueDate !== '-' ? poObj.invDueDate : '');
      setVal('frm-invperiod', poObj.period && poObj.period !== '-' ? poObj.period : '');

      if (poObj.amount && gridRows.length === 0) {
        var amtInp = document.getElementById('entry-amount');
        if (amtInp) amtInp.value = poObj.amount;
      }
      if (poObj.narration || poObj.particular1) {
        var p1 = document.getElementById('frm-particular1');
        if (p1 && !p1.value) p1.value = 'Payment against PO ' + (poObj.poNo || '') + (poObj.narration ? ' - ' + poObj.narration : '');
      }
    }
  };

  function clearInvoiceFields() {
    ['frm-invno', 'frm-invdate', 'frm-invduedate', 'frm-invperiod'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

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

    // Move focus back to the account selection for next entry
    var comboInp = document.getElementById('entry-acc-sel-combo-inp') || document.getElementById('entry-acc-sel');
    if (comboInp) comboInp.focus();
  };

  window.editGridRow = function (idx) {
    var r = gridRows[idx];
    if (!r) return;

    // Find account in chart of accounts
    var accObj = accounts.find(function (a) {
      return (a.accCode && r.code && a.accCode.trim().toLowerCase() === r.code.trim().toLowerCase()) ||
             (a.accName && r.name && a.accName.trim().toLowerCase() === r.name.trim().toLowerCase());
    });

    if (accObj) {
      var label = (accObj.accCode ? accObj.accCode + ' - ' : '') + (accObj.accName || '');
      if (typeof setAccountSearchComboboxValue === 'function') {
        setAccountSearchComboboxValue('entry-acc-sel', accObj.accountId || accObj.id, label);
      } else {
        var s = document.getElementById('entry-acc-sel');
        if (s) s.value = accObj.accountId || accObj.id;
        var ci = document.getElementById('entry-acc-sel-combo-inp');
        if (ci) ci.value = label;
      }
    }

    var typeEl = document.getElementById('entry-type');
    if (typeEl) {
      typeEl.value = (parseFloat(r.dr) || 0) > 0 ? 'Dr' : 'Cr';
    }

    var amtEl = document.getElementById('entry-amount');
    if (amtEl) {
      var amt = (parseFloat(r.dr) || 0) > 0 ? r.dr : r.cr;
      amtEl.value = (parseFloat(amt) || 0) > 0 ? amt : '';
      amtEl.focus();
      if (typeof amtEl.select === 'function') amtEl.select();
    }

    // Remove row from grid so user can adjust and re-confirm
    gridRows.splice(idx, 1);
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

  window.quickApplyTds = function (rate) {
    var grossDr = gridRows.reduce(function (s, r) { return s + (parseFloat(r.dr) || 0); }, 0);
    if (grossDr <= 0) {
      grossDr = parseFloat(document.getElementById('entry-amount').value) || 0;
    }
    if (grossDr <= 0) {
      toast('Please enter or add an expense/party Debit line first before calculating TDS.', false);
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
    toast('Applied ' + tdsRate + '% TDS (₹' + tdsAmt.toFixed(2) + '). Net Bank Outflow: ₹' + netPay.toFixed(2), true);
  };

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
    var diff = Math.round((totDr - totCr) * 100) / 100;
    var elNet = document.getElementById('grid-net-bal');
    var elStatusLbl = document.getElementById('grid-status-label');

    if (elNet) {
      if (diff > 0.01) {
        if (elStatusLbl) elStatusLbl.textContent = 'Net Bank/Cash Outflow Needed:';
        elNet.textContent = '₹' + diff.toFixed(2) + ' (Cr to Bank)';
        elNet.style.color = '#0D47A1';
      } else if (diff < -0.01) {
        if (elStatusLbl) elStatusLbl.textContent = 'Credits exceed Debits:';
        elNet.textContent = '₹' + Math.abs(diff).toFixed(2) + ' (Unbalanced)';
        elNet.style.color = '#dc2626';
      } else if (totDr > 0) {
        if (elStatusLbl) elStatusLbl.textContent = 'Double-Entry Status:';
        elNet.textContent = '✓ BALANCED (₹' + totDr.toFixed(2) + ')';
        elNet.style.color = '#15803d';
      } else {
        if (elStatusLbl) elStatusLbl.textContent = 'Net Balance:';
        elNet.textContent = '0.00';
        elNet.style.color = '#0D47A1';
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
    var acc = findAccountByCodeOrName(val, getFilteredAccounts());
    var codeEl = document.getElementById('pe-grid-code-txt-' + idx);
    if (acc) {
      gridRows[idx].code = acc.accCode;
      gridRows[idx].name = acc.accName;
      if (codeEl) codeEl.textContent = acc.accCode;
      if (!gridRows[idx].dr && !gridRows[idx].cr) {
        var topAmt = parseFloat(document.getElementById('entry-amount').value) || 0;
        if (topAmt > 0) gridRows[idx].dr = topAmt;
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
      var nameInp = document.getElementById('pe-grid-name-inp-' + idx);
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
    var tbody = document.getElementById('pe-grid-tbody');
    if (!tbody) return;

    var isInlineGridAllowed = getAllowGridAccountSelectConfig();
    var html = '';
    var totDr = 0;
    var totCr = 0;

    // Refresh shared datalist for autocomplete
    var dl = document.getElementById('pe-grid-accounts-datalist');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'pe-grid-accounts-datalist';
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
          '<td style="width:130px; text-align:center; font-family:\'Consolas\', monospace; font-weight:700; color:#0D47A1;" id="pe-grid-code-txt-' + idx + '">' +
            escHtml(r.code || '—') +
          '</td>' +
          '<td style="padding:3px 6px;">' +
            '<input type="text" class="form-inp" list="pe-grid-accounts-datalist" id="pe-grid-name-inp-' + idx + '" value="' + escHtml(displayVal) + '" placeholder="Select Account (Search by Code or Name)" oninput="onGridAccountInput(' + idx + ', this.value)" onchange="onGridAccountSelect(' + idx + ', this.value)" style="height:24px; padding:1px 8px; font-size:11px; font-weight:600; width:100%; border:1px solid #cbd5e1; border-radius:3px;">' +
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
              '<div style="display:inline-flex; align-items:center; gap:8px;">' +
                '<button type="button" onclick="editGridRow(' + idx + ')" style="border:none; background:none; color:#1565C0; cursor:pointer; font-size:13px; font-weight:bold; padding:0 3px;" title="Edit entry (move to top for edit)">✎</button>' +
                '<button type="button" onclick="removeGridRow(' + idx + ')" style="border:none; background:none; color:#ef4444; cursor:pointer; font-size:12px; font-weight:bold; padding:0 3px;" title="Remove row">✕</button>' +
              '</div>' +
            '</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#2E7D32; font-weight:700;">' + (r.dr > 0 ? Number(r.dr).toFixed(2) : '-') + '</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#dc2626; font-weight:700;">' + (r.cr > 0 ? Number(r.cr).toFixed(2) : '-') + '</td>' +
            '</tr>';
        });
      }
    }

    tbody.innerHTML = html;

    document.getElementById('grid-tot-dr').textContent = totDr.toFixed(2);
    document.getElementById('grid-tot-cr').textContent = totCr.toFixed(2);

    var diff = totDr - totCr;
    document.getElementById('grid-net-bal').textContent = Math.abs(diff).toFixed(2) + (diff >= 0 ? ' Dr' : ' Cr');
  }

  window.openAddPaymentForm = async function () {
    selectedPaymentId = null;
    var vNoEl = document.getElementById('frm-vno');
    if (vNoEl) {
      vNoEl.readOnly = false;
      vNoEl.disabled = false;
      vNoEl.value = (typeof fetchTxNextVoucherNo === 'function')
        ? await fetchTxNextVoucherNo('payment')
        : getTxNextVoucherNo('payment', payments);
    }
    populateVoucherTypeOptions('Bank Voucher');
    document.getElementById('frm-vtype').value = 'Bank Voucher';
    document.getElementById('frm-vdate').value = todayISO();

    document.getElementById('frm-person-type').value = 'Vendor';
    onPersonTypeChange();

    document.getElementById('cred-bank').checked = true;
    onCreditTypeChange();

    gridRows = [];
    renderGridTable();

    applyPoModeConfigVisibility();

    var chkPo = document.getElementById('chk-po-mode');
    if (chkPo) {
      chkPo.checked = false;
      onPoModeToggleChange(false);
    }
    clearInvoiceFields();

    document.getElementById('frm-transtype').value = 'Cheque';
    document.getElementById('frm-chqno').value = '';
    document.getElementById('frm-chqdate').value = '';
    document.getElementById('frm-refno').value = '';
    document.getElementById('frm-drawnon').value = '';
    document.getElementById('frm-particular1').value = '';
    document.getElementById('frm-particular2').value = '';

    document.getElementById('pe-section-list').style.display = 'none';
    document.getElementById('pe-section-form').style.display = 'flex';
  };

  window.editSelectedPayment = async function (id) {
    try {
      if (id) selectedPaymentId = id;
      if (!selectedPaymentId) { toast('Please select a payment row to edit.', false); return; }
      var b = payments.find(function (x) {
        return String(x.paymentId) === String(selectedPaymentId) || 
               String(x.voucherId) === String(selectedPaymentId) || 
               String(x.voucherNo) === String(selectedPaymentId);
      });
      if (!b) { toast('Payment record not found.', false); return; }

      selectedPaymentId = b.voucherId || b.paymentId;

      var vNoEl = document.getElementById('frm-vno');
      if (vNoEl) {
        vNoEl.value = b.voucherNo || '';
        vNoEl.readOnly = true; // STRICT IMMUTABILITY ON ALTER
        vNoEl.disabled = true;
      }

      var vType = b.voucherType || '';
      if (!vType || vType === 'Payment') {
        vType = ((b.cashBankName || b.cashBank || '').toLowerCase().includes('cash') || (b.cashBankCode || '').startsWith('CSH')) 
          ? 'Cash Voucher' 
          : 'Bank Voucher';
      }
      populateVoucherTypeOptions(vType);
      var vTypeEl = document.getElementById('frm-vtype');
      if (vTypeEl) vTypeEl.value = vType;

      var isCash = vType.toLowerCase().includes('cash');
      var credCash = document.getElementById('cred-cash');
      var credBank = document.getElementById('cred-bank');
      if (isCash) { if (credCash) credCash.checked = true; }
      else { if (credBank) credBank.checked = true; }
      if (typeof onCreditTypeChange === 'function') onCreditTypeChange(true);

      document.getElementById('frm-vdate').value = b.voucherDate || todayISO();

      applyPoModeConfigVisibility();

      var pType = b.personType || 'Vendor';
      var pTypeEl = document.getElementById('frm-person-type');
      if (pTypeEl) pTypeEl.value = pType;
      await onPersonTypeChange();

      var targetPerson = b.paidTo || b.personName || '';
      var pSel = document.getElementById('frm-person-name');
      var comboInp = document.getElementById('frm-person-name-combo-inp');
      if (pSel) pSel.value = targetPerson;
      if (comboInp) comboInp.value = targetPerson;
      if (typeof onPersonSelect === 'function') onPersonSelect();

      // Fetch detail lines from DB if needed
      var loadedItems = null;
      var vId = parseInt(b.voucherId || b.paymentId, 10);
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
          console.warn('Could not fetch detail lines from DB, using cached lines:', e);
        }
      }

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
        // Find the credit item that is a Cash/Bank account
        bankItem = allItems.find(function(r) {
          return (parseFloat(r.credit || r.cr) || 0) > 0 && isCashBankAcc(r);
        });
        // Fallback: if not matched by group, find any credit item that is not a tax/tds liability
        if (!bankItem) {
          bankItem = allItems.find(function(r) {
            var c = (parseFloat(r.credit || r.cr) || 0);
            var nm = String(r.accountName || r.name || '').toLowerCase();
            return c > 0 && !nm.includes('tds') && !nm.includes('tax') && !nm.includes('gst');
          });
        }
      }

      // Grid rows are ALL non-bank items (both Expense Debits and TDS Credits)
      if (allItems && allItems.length > 0) {
        var nonBankItems = bankItem ? allItems.filter(function(r) { return r !== bankItem; }) : allItems;
        gridRows = nonBankItems.map(function (r, i) {
          return {
            sr: i + 1,
            code: r.accountCode || r.code || '',
            name: r.accountName || r.name || '',
            dr: parseFloat(r.debit || r.dr) || 0,
            cr: parseFloat(r.credit || r.cr) || 0
          };
        });
      } else if (b.gridRows && Array.isArray(b.gridRows) && b.gridRows.length > 0) {
        gridRows = b.gridRows.map(function (r, i) {
          return {
            sr: i + 1,
            code: r.code || '',
            name: r.name || '',
            dr: parseFloat(r.dr) || 0,
            cr: parseFloat(r.cr) || 0
          };
        });
      } else {
        gridRows = [
          { sr: 1, code: b.accountCode || '', name: b.accountName || b.particular1 || 'Expense', dr: b.amount || 0, cr: 0 }
        ];
      }
      renderGridTable();

      // Restore Withdrawal Account (Cash/Bank)
      var targetAccCode = bankItem ? bankItem.accountCode : (b.cashBankCode || '');
      var targetAccName = bankItem ? (bankItem.accountName || bankItem.name) : (b.cashBankName || b.cashBank || '');
      var targetAccId = bankItem ? (bankItem.accountId || bankItem.id) : null;

      // Determine Cash vs Bank paymode
      var isCashAcc = false;
      if (targetAccCode && targetAccCode.toUpperCase() === 'ASS-1001') isCashAcc = true;
      else if (targetAccName && targetAccName.toLowerCase().includes('cash')) isCashAcc = true;
      else if (b.voucherType && b.voucherType.toLowerCase().includes('cash')) isCashAcc = true;

      var credCash = document.getElementById('cred-cash');
      var credBank = document.getElementById('cred-bank');
      if (isCashAcc) {
        if (credCash) credCash.checked = true;
        if (credBank) credBank.checked = false;
      } else {
        if (credBank) credBank.checked = true;
        if (credCash) credCash.checked = false;
      }
      if (typeof onCreditTypeChange === 'function') onCreditTypeChange(true);

      var matchedAcc = (accounts || []).find(function(a) {
        if (targetAccId && a.accountId === targetAccId) return true;
        if (targetAccCode && String(a.accCode || '').toUpperCase() === String(targetAccCode).toUpperCase()) return true;
        if (targetAccName) {
          var cleanTgt = targetAccName.toLowerCase().replace(/\[.*?\]\s*/g, '').replace(/^[a-z]+-\d+\s*-\s*/g, '').trim();
          var cleanA = String(a.accName || '').toLowerCase().replace(/\[.*?\]\s*/g, '').replace(/^[a-z]+-\d+\s*-\s*/g, '').trim();
          if (cleanTgt && cleanA && (cleanTgt === cleanA || cleanTgt.includes(cleanA) || cleanA.includes(cleanTgt))) return true;
        }
        return false;
      });

      var withdrawSel = document.getElementById('frm-withdraw-acc');
      if (withdrawSel) {
        var resolvedVal = null;
        if (matchedAcc && matchedAcc.accountId) {
          resolvedVal = String(matchedAcc.accountId);
        } else if (targetAccId) {
          resolvedVal = String(targetAccId);
        }
        if (resolvedVal) withdrawSel.value = resolvedVal;

        if (!withdrawSel.value || withdrawSel.selectedIndex < 0) {
          for (var optIdx = 0; optIdx < withdrawSel.options.length; optIdx++) {
            var opt = withdrawSel.options[optIdx];
            if (targetAccCode && opt.text.toUpperCase().includes(targetAccCode.toUpperCase())) {
              withdrawSel.selectedIndex = optIdx;
              break;
            }
            if (targetAccName && opt.text.toLowerCase().includes(targetAccName.toLowerCase())) {
              withdrawSel.selectedIndex = optIdx;
              break;
            }
          }
        }

        // Failsafe: Never allow bank field to be blank if bank details exist
        if ((!withdrawSel.value || withdrawSel.selectedIndex < 0) && (targetAccName || targetAccCode)) {
          var optVal = resolvedVal || targetAccCode || Date.now();
          var optLabel = (targetAccCode ? ('[' + targetAccCode + '] ') : '') + (targetAccName || 'Bank Account');
          var newOpt = document.createElement('option');
          newOpt.value = optVal;
          newOpt.textContent = optLabel;
          withdrawSel.appendChild(newOpt);
          withdrawSel.value = optVal;
        }
      }

      // Restore Bank / Cheque Details
      var transTypeEl = document.getElementById('frm-transtype');
      if (transTypeEl) {
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

      var chqNoEl = document.getElementById('frm-chqno');
      if (chqNoEl) chqNoEl.value = (b.chqNo && b.chqNo !== '-') ? b.chqNo : '';

      var chqDateEl = document.getElementById('frm-chqdate');
      if (chqDateEl) chqDateEl.value = toIsoDate(b.chqDate) || '';

      var refNoEl = document.getElementById('frm-refno');
      if (refNoEl) refNoEl.value = (b.refNo && b.refNo !== '-') ? b.refNo : ((b.billNo && b.billNo !== '-') ? b.billNo : '');

      var drawnOnEl = document.getElementById('frm-drawnon');
      if (drawnOnEl) drawnOnEl.value = b.bankName || b.drawnOn || '';

      document.getElementById('frm-particular1').value = b.particular1 || '';
      document.getElementById('frm-particular2').value = b.particular2 || '';
    } catch (err) {
      console.error('Error loading payment voucher for edit:', err);
    } finally {
      document.getElementById('pe-section-list').style.display = 'none';
      document.getElementById('pe-section-form').style.display = 'flex';
    }
  };

  window.savePayment = async function () {
    try {
      var pNameEl = document.getElementById('frm-person-name');
      var comboInp = document.getElementById('frm-person-name-combo-inp');
      var rawPersonVal = (pNameEl ? pNameEl.value : '') || (comboInp ? comboInp.value : '');
      var pType = document.getElementById('frm-person-type') ? document.getElementById('frm-person-type').value : 'Vendor';
      var pName = resolvePersonDisplayName(rawPersonVal, pType);
      if (!pName || pName === '—') {
        pName = (comboInp && comboInp.value) ? comboInp.value.trim() : (pNameEl ? pNameEl.value.trim() : '');
      }
      if (!pName || pType === 'NONE') {
        pName = (pName && pName !== '—') ? pName : 'General';
      }

      var entryAccId = document.getElementById('entry-account') ? document.getElementById('entry-account').value : '';
      var entryAmt = parseFloat(document.getElementById('entry-amount') ? document.getElementById('entry-amount').value : 0) || 0;
      if (gridRows.length === 0 && entryAmt > 0) {
        var accObj = accounts.find(function(a) { return String(a.accountId) === String(entryAccId); });
        var entryType = document.getElementById('entry-type') ? document.getElementById('entry-type').value : 'Dr';
        gridRows.push({
          sr: 1,
          code: accObj ? (accObj.accCode || '') : '',
          name: accObj ? (accObj.accName || 'Expense') : 'General Expense',
          dr: (entryType === 'Dr' ? entryAmt : 0),
          cr: (entryType === 'Cr' ? entryAmt : 0)
        });
        renderGridTable();
      }

      var validRows = gridRows.filter(function (r) { return r.code || r.name || (parseFloat(r.dr) || 0) > 0 || (parseFloat(r.cr) || 0) > 0; });
      var totAmt = validRows.reduce(function (sum, r) { return sum + (parseFloat(r.dr) || 0); }, 0);
      if (totAmt <= 0) {
        toast('Please enter an amount and select an account head.', false);
        return;
      }

      var withdrawSel = document.getElementById('frm-withdraw-acc');
      if (withdrawSel && (!withdrawSel.value || withdrawSel.selectedIndex < 0) && withdrawSel.options.length > 0) {
        withdrawSel.selectedIndex = 0;
      }
      var withdrawText = (withdrawSel && withdrawSel.selectedIndex >= 0 && withdrawSel.options[withdrawSel.selectedIndex])
        ? withdrawSel.options[withdrawSel.selectedIndex].text
        : '';
      if (!withdrawSel || !withdrawSel.value) {
        toast('Please select a Withdrawal Account (Cash/Bank).', false);
        return;
      }

      var isPoMode = document.getElementById('chk-po-mode') ? document.getElementById('chk-po-mode').checked : false;
      var invNo = document.getElementById('frm-invno') ? document.getElementById('frm-invno').value : '';

      var items = [];
      validRows.forEach(function(r) {
        var accId = null;
        var found = accounts.find(function(a) { 
          return (a.accCode && a.accCode === r.code) || 
                 (a.accName && a.accName === r.name) ||
                 (a.accountId && String(a.accountId) === String(r.code)); 
        });
        if (found) accId = found.accountId;
        var drVal = parseFloat(r.dr) || 0;
        var crVal = parseFloat(r.cr) || 0;
        items.push({
          accountId: accId,
          accountCode: r.code || (found ? found.accCode : ''),
          accountName: r.name || (found ? found.accName : ''),
          debit: drVal,
          credit: crVal,
          narration: r.particulars || r.narration || ''
        });
      });

      var totDr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.debit) || 0); }, 0) * 100) / 100;
      var totCr = Math.round(items.reduce(function(s, i) { return s + (parseFloat(i.credit) || 0); }, 0) * 100) / 100;

      // Withdrawal Cash/Bank credit entry
      var withdrawAccId = withdrawSel ? parseInt(withdrawSel.value, 10) : null;
      var withdrawAcc = accounts.find(function(a) { return a.accountId === withdrawAccId; });
      if (!withdrawAcc) {
        var isCashAcc = withdrawText.toLowerCase().includes('cash') || (document.getElementById('cred-cash') && document.getElementById('cred-cash').checked);
        withdrawAcc = accounts.find(function(a) { 
          return isCashAcc 
            ? ((a.accCode && a.accCode.toLowerCase() === 'ass-1001') || (a.accName && a.accName.toLowerCase().includes('cash')))
            : ((a.accCode && a.accCode.toLowerCase() === 'ass-1002') || (a.accName && a.accName.toLowerCase().includes('bank')));
        });
      }

      // Check if withdrawal account is already explicitly included with credit in items
      var hasBankCredit = items.some(function(it) {
        return it.credit > 0 && (
          (withdrawAcc && it.accountId === withdrawAcc.accountId) ||
          (withdrawAcc && it.accountCode && it.accountCode.toLowerCase() === withdrawAcc.accCode.toLowerCase()) ||
          (it.accountName && it.accountName.toLowerCase().includes('bank')) ||
          (it.accountName && it.accountName.toLowerCase().includes('cash in hand'))
        );
      });

      if (!hasBankCredit) {
        var netCrNeeded = Math.round((totDr - totCr) * 100) / 100;
        if (netCrNeeded > 0) {
          var isCashPay = (withdrawText.toLowerCase().includes('cash') || (document.getElementById('cred-cash') && document.getElementById('cred-cash').checked));
          items.push({
            accountId: (withdrawAcc && typeof withdrawAcc.accountId === 'number' && withdrawAcc.accountId < 1000000) ? withdrawAcc.accountId : null,
            accountCode: withdrawAcc ? (withdrawAcc.accCode || '') : (isCashPay ? 'ASS-1001' : 'ASS-1002'),
            accountName: withdrawAcc ? (withdrawAcc.accName || '') : withdrawText,
            debit: 0,
            credit: netCrNeeded,
            narration: 'Payment via ' + (withdrawAcc ? withdrawAcc.accName : withdrawText)
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

      var rawChqDate = document.getElementById('frm-chqdate') ? document.getElementById('frm-chqdate').value : '';
      var chqDateVal = (rawChqDate && rawChqDate.trim() !== '' && rawChqDate !== '-') ? rawChqDate : null;

      var sid = getActiveSocietyId();
      var fyid = getFyId();
      var payId = selectedPaymentId || Date.now();
      var vNo = document.getElementById('frm-vno').value || ('PYMT/2025-26/' + (payments.length + 1));

      var vTypeVal = document.getElementById('frm-vtype') ? document.getElementById('frm-vtype').value : 'Bank Voucher';
      var modKey = 'payment';
      if (vTypeVal.toLowerCase().includes('cash')) modKey = 'payCash';
      else if (vTypeVal.toLowerCase().includes('swif')) modKey = 'paySwiss';

      if (!selectedPaymentId && typeof validateTxVoucherNo === 'function') {
        var vCheck = validateTxVoucherNo(modKey, vNo);
        if (!vCheck.valid) {
          var uNo = vNo.toUpperCase();
          if (!uNo.startsWith('PYMT') && !uNo.startsWith('PAY') && !uNo.startsWith('CASH') && !uNo.startsWith('CPY') && !uNo.startsWith('CSH') && !uNo.startsWith('SWIF') && !uNo.startsWith('SWIFT')) {
            toast(vCheck.error, false);
            return;
          }
        }
      }

      var payload = {
        paymentId: payId,
        voucherId: (typeof payId === 'number' && payId < 1000000000000) ? payId : 0,
        societyId: parseInt(sid, 10),
        fyId: parseInt(fyid, 10),
        voucherNo: vNo,
        voucherDate: document.getElementById('frm-vdate').value || todayISO(),
        voucherType: 'Payment',
        personType: document.getElementById('frm-person-type').value,
        paidTo: pName,
        personName: pName,
        cashBankCode: withdrawAcc ? withdrawAcc.accCode : '',
        cashBankName: withdrawText,
        cashBank: withdrawText,
        amount: totAmt,
        chqNo: document.getElementById('frm-chqno').value || '-',
        chqDate: chqDateVal,
        refNo: invNo || '',
        billNo: invNo || '-',
        narration: document.getElementById('frm-particular1').value || 'Payment Voucher',
        particular1: document.getElementById('frm-particular1').value || 'Payment Voucher',
        particular2: document.getElementById('frm-particular2').value || '',
        gridRows: gridRows,
        items: items
      };

      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/vouchers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        var json = await resp.json();
        if (json && json.success) {
          toast(selectedPaymentId ? 'Payment Voucher updated successfully in database!' : 'Payment Voucher saved successfully in database!', true);
          selectedPaymentId = null;
          showList();
          await loadPayments();
          return;
        }
      }

      var errText = await resp.text();
      toast('Failed to save Payment Voucher: ' + errText, false);
    } catch (e) {
      console.error('savePayment error:', e);
      toast('Error saving payment: ' + (e.message || e), false);
    }
  };

  window.deleteSelectedPayment = async function () {
    var checkedIds = (window.ERP_MultiChange && typeof ERP_MultiChange.getSelectedIds === 'function')
      ? ERP_MultiChange.getSelectedIds()
      : [];

    var targetIds = [];
    if (checkedIds.length > 0) {
      targetIds = checkedIds;
    } else if (selectedPaymentId) {
      targetIds = [selectedPaymentId];
    } else {
      var chks = document.querySelectorAll('#pe-list-tbody input.row-chk:checked');
      chks.forEach(function (c) { if (c.value) targetIds.push(c.value); });
    }

    if (targetIds.length === 0) {
      toast('Please select payment record(s) to delete.', false);
      return;
    }

    var count = targetIds.length;
    var msg = (count === 1) ? 'Are you sure you want to delete this payment voucher?' : ('Are you sure you want to delete ' + count + ' selected payment voucher(s)?');
    var ok = typeof showConfirm === 'function'
      ? await showConfirm(msg, 'Confirm Delete Payment')
      : confirm(msg);
    if (!ok) return;

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      for (var i = 0; i < targetIds.length; i++) {
        var id = targetIds[i];
        var tr = payments.find(function (b) { return String(b.paymentId) === String(id) || String(b.voucherNo) === String(id) || String(b.voucherId) === String(id); });
        var delId = (tr && tr.voucherId) ? tr.voucherId : id;
        var rDel = await fetch(baseHost + '/api/vouchers/' + encodeURIComponent(delId), {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (!rDel.ok) {
          var errT = await rDel.text();
          toast('Failed to delete payment voucher ' + id + ': ' + errT, false);
        }
      }
      toast('Payment voucher(s) deleted successfully from database.', true);
      selectedPaymentId = null;
      showList();
      await loadPayments();
    } catch (e) {
      console.error('deleteSelectedPayment error:', e);
      toast('Error deleting payment voucher: ' + (e.message || e), false);
    }
  };

  window.previewSelectedPayment = function () {
    if (!selectedPaymentId) { toast('Please select a payment record to preview.', false); return; }
    var b = payments.find(function (x) { return x.paymentId === selectedPaymentId; });
    if (!b) return;

    var container = document.getElementById('preview-payment-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    container.innerHTML = '<div style="border-bottom:2px solid #0D47A1; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#0D47A1; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#0D47A1; text-decoration:underline;">PAYMENT VOUCHER (' + escHtml(b.voucherType || 'Bank') + ')</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px;">' +
      '<div>' +
      '<div><strong>Paid To:</strong> ' + escHtml(b.paidTo || b.personName) + '</div>' +
      '<div><strong>Person Type:</strong> ' + escHtml(b.personType) + '</div>' +
      '<div><strong>Withdraw From:</strong> ' + escHtml(b.cashBank) + '</div>' +
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
      '<tr><td style="border:1px solid #ddd; padding:8px;">' + escHtml(b.particular1 || 'Payment Voucher') + '</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#0D47A1;">' + (b.amount || 0).toFixed(2) + '</td></tr>' +
      '</tbody>' +
      '<tfoot><tr style="background:#f5f5f5; font-weight:bold;">' +
      '<td style="border:1px solid #ddd; padding:6px; text-align:right;">TOTAL PAID:</td>' +
      '<td style="border:1px solid #ddd; padding:6px; text-align:right; font-family:monospace; color:#0D47A1; font-size:14px;">₹' + (b.amount || 0).toFixed(2) + '</td>' +
      '</tr></tfoot>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
      '<div><strong>Prepared By</strong><br><br>_____________</div>' +
      '<div><strong>Receiver\'s Signature</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('pe-section-list').style.display = 'none';
    document.getElementById('pe-section-form').style.display = 'none';
    document.getElementById('pe-section-preview').style.display = 'flex';
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

    var toDelete = payments.filter(function (b) {
      var no = (b.voucherNo || '').toLowerCase();
      return no >= fromNo && no <= toNo;
    });

    for (var i = 0; i < toDelete.length; i++) {
      var delId = toDelete[i].voucherId || toDelete[i].paymentId;
      try {
        if (window.API && API.delete) {
          await API.delete('/api/vouchers/' + encodeURIComponent(delId));
        }
      } catch (e) {}
    }

    closeModal('modal-multi-delete');
    toast('Multi-deleted ' + toDelete.length + ' voucher(s).', true);
    await loadPayments();
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
      if (targetText) targetText.textContent = selCount + ' selected payment(s)';
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
      list: payments,
      idKey: 'paymentId',
      noKey: 'voucherNo'
    });

    if (updatedCount > 0) {
      persistPaymentsLocally(getActiveSocietyId(), payments);
      closeModal('modal-multi-change');
      toast('Successfully updated ' + updatedCount + ' payment voucher(s).', true);
      renderPaymentsTable();
    }
  };

  window.showList = function () {
    document.getElementById('pe-section-form').style.display = 'none';
    document.getElementById('pe-section-preview').style.display = 'none';
    document.getElementById('pe-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('pe-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  window.toggleOtherDropdown = function () {
    var menu = document.getElementById('pe-other-menu');
    if (menu) menu.style.display = (menu.style.display === 'block' ? 'none' : 'block');
  };

  window.applyFilters = function () { renderPaymentsTable(); };

  window.clearFilters = function () {
    ['flt-vno', 'flt-person'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    renderPaymentsTable();
  };

  window.appendParticularTag = function (num) {
    var el = document.getElementById('frm-particular' + num);
    if (el) el.value += (el.value ? ' ' : '') + 'Payment Voucher for ' + getFyLabel();
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
    var drop = document.querySelector('.pe-dropdown');
    var menu = document.getElementById('pe-other-menu');
    if (drop && menu && !drop.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // Short-cuts (Alt+A, F2, Esc, Ctrl+P)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddPaymentForm();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedPayment();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // INIT
  (async function init() {
    var _sn = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('peSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('peFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    populateVoucherTypeOptions();
    applyPoModeConfigVisibility();
    await loadMasterData();
    await loadPayments();
    showList();
  })();

})();
