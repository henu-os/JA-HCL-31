/**
 * member-receipt.js — Jeevika ERP v2
 * Member Receipt Entry Directory & Ledger Panel Logic
 */

(function () {
  'use strict';

  var receipts = [];
  var members = [];
  var bills = [];
  var billTypes = [];
  var accounts = [];
  var activeBillType = 'MAINTENANCE';
  var selectedReceiptId = null;
  var originalBillType = null;
  var sortDirection = 'desc';

  async function loadAccounts() {
    var sid = getActiveSocietyId();
    try {
      if (typeof fetchMasterAccounts === 'function') {
        accounts = await fetchMasterAccounts(sid);
      } else {
        var data = await fetchApiData('/api/accounts?societyId=' + sid);
        if (data && Array.isArray(data)) accounts = data;
        else if (data && data.data && Array.isArray(data.data)) accounts = data.data;
        if (!accounts || accounts.length === 0) {
          accounts = (typeof getStandardMasterAccounts === 'function') ? getStandardMasterAccounts() : [];
        }
      }
    } catch (e) {
      console.warn('Failed loading accounts in member receipt', e);
      if (!accounts || accounts.length === 0) {
        accounts = (typeof getStandardMasterAccounts === 'function') ? getStandardMasterAccounts() : [];
      }
    }
  }

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
    var sid = (window.Auth && window.Auth.getSocietyId) ? window.Auth.getSocietyId() : null;
    return sid || sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4';
  }

  function getFyId() {
    var fy = (window.Auth && window.Auth.getFYId) ? window.Auth.getFYId() : null;
    return fy || sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1';
  }

  function getFyLabel() {
    var lbl = (window.Auth && window.Auth.getFYLabel) ? window.Auth.getFYLabel() : null;
    return lbl || sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2026-27';
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

  function getApiBaseHost() {
    if (typeof window.getApiBaseUrl === 'function') return window.getApiBaseUrl();
    if (window.APP_CONFIG && window.APP_CONFIG.API_BASE) {
      return window.APP_CONFIG.API_BASE.replace(/\/api\/?$/, '');
    }
    if (window.location && window.location.origin && window.location.origin.indexOf('http') === 0) {
      return window.location.origin;
    }
    return 'http://localhost:5002';
  }

  async function fetchApiData(endpoint) {
    var headers = getAuthHeaders();
    var baseHost = getApiBaseHost();
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

  // ── 1. LOAD DATA ────────────────────────────────────────────────
  async function loadBillTypes() {
    var sid = getActiveSocietyId();
    var data = await fetchApiData('/api/bill-types?societyId=' + sid);
    if (data && Array.isArray(data)) billTypes = data;

    try {
      var storedStr = localStorage.getItem('jeevika_bill_types_' + sid) || localStorage.getItem('jeevika_bill_types_global');
      if (storedStr) {
        var bObj = JSON.parse(storedStr);
        Object.keys(bObj).forEach(function (typeName) {
          var tClean = typeName.trim().toUpperCase();
          if (!billTypes.some(function (existing) { return (existing.billTypeName || existing.name || '').trim().toUpperCase() === tClean; })) {
            billTypes.push({ billTypeId: bObj[typeName].id || Date.now(), billTypeName: typeName });
          }
        });
      }
    } catch (e) {}

    // Deduplicate billTypes strictly by uppercase trim name
    var uniqueList = [];
    var seenMap = {};
    billTypes.forEach(function (bt) {
      var n = (bt.billTypeName || bt.name || '').trim();
      var key = n.toUpperCase();
      if (n && !seenMap[key]) {
        seenMap[key] = true;
        uniqueList.push(bt);
      }
    });
    billTypes = uniqueList;

    renderBillTypePills();
    populateFormBillTypes();
  }

  function populateFormBillTypes() {
    var sel = document.getElementById('frm-billtype');
    if (!sel) return;
    var html = '';
    var seen = {};
    billTypes.forEach(function (bt) {
      var name = (bt.billTypeName || bt.name || '').trim();
      if (!name || seen[name.toUpperCase()]) return;
      seen[name.toUpperCase()] = true;
      html += '<option value="' + escHtml(name) + '">' + escHtml(name.toUpperCase()) + '</option>';
    });
    if (!html) {
      html = '<option value="Maintenance">MAINTENANCE</option>';
    }
    sel.innerHTML = html;
  }

  window.onBillTypeFormChange = function(newType) {
    if (!newType) return;
    var formattedName = newType.charAt(0).toUpperCase() + newType.slice(1).toLowerCase();
    activeBillType = formattedName.toUpperCase();

    // Automatically update narration if it was default
    var part1El = document.getElementById('frm-particular1');
    if (part1El && (!part1El.value || part1El.value.toLowerCase().includes('receipt'))) {
      part1El.value = formattedName.toUpperCase() + ' Receipt';
    }

    var mVal = document.getElementById('frm-membername') ? document.getElementById('frm-membername').value : '';
    if (mVal) {
      onMemberSelect(mVal, false);
    } else {
      calcBifurcation();
    }
  };

  function renderBillTypePills() {
    var container = document.getElementById('mr-billtype-pills');
    if (!container) return;

    var html = '<button class="billtype-pill ' + (activeBillType === 'ALL' ? 'active' : '') + '" onclick="filterByBillType(\'ALL\', this)">ALL</button>';

    var seenPills = {};
    billTypes.forEach(function (bt) {
      var name = (bt.billTypeName || bt.name || '').trim();
      var key = name.toUpperCase();
      if (!name || seenPills[key]) return;
      seenPills[key] = true;

      var isActive = (activeBillType.toUpperCase() === key);
      html += '<button class="billtype-pill ' + (isActive ? 'active' : '') + '" onclick="filterByBillType(\'' + key + '\', this)">' + key + '</button>';
    });

    container.innerHTML = html;

    var caret = document.getElementById('add-receipt-caret');
    if (caret) {
      caret.style.display = (activeBillType === 'ALL' ? 'inline-block' : 'none');
    }
  }

  window.filterByBillType = function (type, el) {
    activeBillType = type.toUpperCase();
    var menu = document.getElementById('add-receipt-menu');
    if (menu) menu.style.display = 'none';
    renderBillTypePills();
    renderReceiptsTable();
  };

  async function loadMembers() {
    var sid = getActiveSocietyId();
    var data = await fetchApiData('/api/members?societyId=' + sid);
    if (!data || (Array.isArray(data) && data.length === 0)) {
      data = await fetchApiData('/api/members');
    }
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
    if (list && list.length > 0) members = list;

    var sel = document.getElementById('frm-membername');
    if (sel) {
      var html = '<option value="">— Select Member —</option>';
      members.forEach(function (m) {
        var id = m.memberId || m.socMemId || m.id;
        var code = (m.memCode || m.memberCode || '').trim();
        var name = (m.memName || m.memberName || m.name || '').trim();
        var wing = (m.wing || m.Wing || '').trim();
        var flat = (m.flatNo || m.FlatNo || '').trim();
        var flatLabel = (wing || flat ? (wing ? wing + '-' : '') + flat : '');
        if (!code) code = flatLabel;
        var displayLabel = (code ? code + ' - ' : '') + name + (flatLabel ? ' (' + flatLabel + ')' : '');
        html += '<option value="' + id + '">' + escHtml(displayLabel) + '</option>';
      });
      sel.innerHTML = html;
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

  function persistReceiptsLocally(sid, list) {
    if (!sid) sid = getActiveSocietyId();
    try {
      var jsonStr = JSON.stringify(list || []);
      localStorage.setItem('jeevika_member_receipts_' + sid, jsonStr);
      
      
    } catch (e) {
      console.warn("Failed saving member receipts to localStorage", e);
    }
  }

  async function loadReceipts() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();

    var data = await fetchApiData('/api/member-receipts?societyId=' + sid + '&fyId=' + fyid);
    if (!data || !Array.isArray(data) || data.length === 0) {
      data = await fetchApiData('/api/member-receipts?societyId=' + sid);
    }

    if (data && Array.isArray(data)) {
      receipts = data.map(function(item) {
        item.receiptId = item.receiptId || item.voucherId || Date.now();
        item.receiptNo = item.receiptNo || item.voucherNo;
        item.memberName = item.memberName || item.personName || '—';

        var bType = (item.billType || '').trim().toUpperCase();
        if (!bType || bType === 'MAINTENANCE') {
          var narr = (item.particular1 || item.narration || '').toUpperCase();
          if (narr.indexOf('MAJOR REPAIR') !== -1 || narr.indexOf('REPAIR') !== -1) {
            bType = 'MAJOR REPAIR';
          } else if (narr.indexOf('SINKING') !== -1) {
            bType = 'SINKING FUND';
          } else {
            bType = bType || 'MAINTENANCE';
          }
        }
        item.billType = bType;
        return item;
      });
    } else {
      receipts = [];
    }

    renderReceiptsTable();
  }

  // ── 2. RENDER REGISTER TABLE & SORTING ────────────────────────────
  window.toggleFilterBar = function () {
    var bar = document.getElementById('mr-filter-bar');
    if (bar) {
      var isHidden = (bar.style.display === 'none' || !bar.style.display);
      bar.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        var inp = document.getElementById('flt-member');
        if (inp) inp.focus();
      }
    }
  };

  window.applyFilters = function () {
    renderReceiptsTable();
  };

  window.clearFilters = function () {
    if (document.getElementById('flt-rcptno')) document.getElementById('flt-rcptno').value = '';
    if (document.getElementById('flt-member')) document.getElementById('flt-member').value = '';
    if (document.getElementById('flt-chqno')) document.getElementById('flt-chqno').value = '';
    renderReceiptsTable();
  };

  window.toggleReceiptNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-rcptno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderReceiptsTable();
  };

  function cleanParticulars(str) {
    if (!str || str === '-' || str === '—') return '-';
    var clean = String(str).replace(/\[BillType:[^\]]+\]\s*/gi, '').trim();
    return clean || '-';
  }

  function renderReceiptsHeader() {
    var thead = document.querySelector('table.mr-main-table thead');
    if (!thead) return;
    var showBt = (activeBillType === 'ALL');
    thead.innerHTML = '<tr>' +
      '<th style="width:36px; text-align:center;"><input type="checkbox" id="chk-select-all" onclick="ERP_MultiChange.toggleSelectAll(this.checked, receipts.map(r=>r.receiptId||r.voucherId))" title="Select / Deselect All"></th>' +
      '<th style="width:110px; cursor:pointer;" onclick="toggleReceiptNoSort()" title="Click to sort Top to Bottom / Bottom to Top">' +
        'NO. <span id="sort-rcptno-icon">' + (sortDirection === 'desc' ? '▼' : '▲') + '</span>' +
      '</th>' +
      '<th style="width:85px;">DATE</th>' +
      (showBt ? '<th style="width:110px; text-align:center;">BILL TYPE</th>' : '') +
      '<th style="width:110px;">CASH/BANK</th>' +
      '<th style="width:75px; text-align:center;">FLAT NO</th>' +
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

  function renderReceiptsTable() {
    renderReceiptsHeader();
    var tbody = document.getElementById('mr-list-tbody');
    if (!tbody) return;

    var showBt = (activeBillType === 'ALL');

    var filtered = receipts.filter(function (r) {
      var rType = (r.billType || 'MAINTENANCE').trim().toUpperCase();
      if (activeBillType !== 'ALL' && rType !== activeBillType) return false;

      var fNo = (document.getElementById('flt-rcptno') ? document.getElementById('flt-rcptno').value.toLowerCase().trim() : '');
      var fMem = (document.getElementById('flt-member') ? document.getElementById('flt-member').value.toLowerCase().trim() : '');
      var fChq = (document.getElementById('flt-chqno') ? document.getElementById('flt-chqno').value.toLowerCase().trim() : '');

      if (fNo && (r.receiptNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fMem) {
        var mName = (r.memberName || '').toLowerCase();
        var pName = (r.personName || '').toLowerCase();
        var flat = (r.flatNo || r.wingFlat || '').toLowerCase();
        var wing = (r.wing || '').toLowerCase();
        var mCode = (r.memberCode || r.memCode || '').toLowerCase();
        var bNo = (r.billNo || '').toLowerCase();

        var matches = (
          mName.indexOf(fMem) !== -1 ||
          pName.indexOf(fMem) !== -1 ||
          flat.indexOf(fMem) !== -1 ||
          wing.indexOf(fMem) !== -1 ||
          mCode.indexOf(fMem) !== -1 ||
          bNo.indexOf(fMem) !== -1
        );
        if (!matches) return false;
      }

      if (fChq && (r.chqNo || '').toLowerCase().indexOf(fChq) === -1) return false;

      return true;
    });

    filtered.sort(function (a, b) {
      var noA = (a.receiptNo || '').toLowerCase();
      var noB = (b.receiptNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('mr-list-count').textContent = filtered.length + ' receipts';

    if (filtered.length === 0) {
      var colspan = showBt ? 14 : 13;
      tbody.innerHTML = '<tr><td colspan="' + colspan + '" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Member Receipts Found</td></tr>';
      document.getElementById('sum-rcpt-count').textContent = '0';
      document.getElementById('sum-rcpt-cash').textContent = '₹0.00';
      document.getElementById('sum-rcpt-bank').textContent = '₹0.00';
      document.getElementById('sum-rcpt-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalCash = 0, totalBank = 0, totalGrd = 0;

    filtered.forEach(function (r) {
      var isSel = (r.receiptId === selectedReceiptId);
      var amt = r.amount || 0;
      totalGrd += amt;

      if ((r.cashBank || '').toLowerCase().indexOf('cash') !== -1) {
        totalCash += amt;
      } else {
        totalBank += amt;
      }

      var bTypeStr = (r.billType || 'MAINTENANCE').toUpperCase();
      var isRepair = bTypeStr.indexOf('REPAIR') !== -1;
      var btBadge = isRepair
        ? '<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:4px; font-weight:700; font-size:10px; border:1px solid #fde68a;">' + escHtml(bTypeStr) + '</span>'
        : '<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:700; font-size:10px; border:1px solid #bae6fd;">' + escHtml(bTypeStr) + '</span>';

      var rId = r.receiptId || r.voucherId;
      var chkHtml = (window.ERP_MultiChange && typeof ERP_MultiChange.renderCheckbox === 'function')
        ? ERP_MultiChange.renderCheckbox(rId)
        : '<td style="width:36px; text-align:center;"><input type="checkbox" class="row-chk" value="' + rId + '"></td>';

      html += '<tr class="' + (isSel ? 'selected' : '') + '" data-id="'+(r.receiptId||r.voucherId||r.receiptNo||r.voucherNo||'')+'" onclick="selectReceiptRow(this.dataset.id, this)" ondblclick="editSelectedReceipt(this.dataset.id)">' +
        chkHtml +
        '<td style="font-weight:700; color:#1565C0;">' + (r.receiptNo || '') + '</td>' +
        '<td>' + (r.receiptDate || '') + '</td>' +
        (showBt ? '<td style="text-align:center;">' + btBadge + '</td>' : '') +
        '<td>' + (r.cashBank || 'Cash In Hand') + '</td>' +
        '<td style="text-align:center; font-weight:600;">' + (r.flatNo || r.wingFlat || '—') + '</td>' +
        '<td style="font-weight:700;">' + (r.memberName || r.personName || '') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#1565C0;">' + amt.toFixed(2) + '</td>' +
        '<td>' + (r.chqNo || '—') + '</td>' +
        '<td>' + (r.chqDate || '—') + '</td>' +
        '<td>' + (r.bankName || '—') + '</td>' +
        '<td>' + (r.billNo || '—') + '</td>' +
        '<td>' + escHtml(cleanParticulars(r.particular1)) + '</td>' +
        '<td>' + escHtml(cleanParticulars(r.particular2)) + '</td>' +
        '<td style="text-align:center;">' + (r.clearDate || r.receiptDate || '—') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-rcpt-count').textContent = filtered.length;
    document.getElementById('sum-rcpt-cash').textContent = '₹' + totalCash.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('sum-rcpt-bank').textContent = '₹' + totalBank.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('sum-rcpt-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    initColumnResizing();
  }

  function initColumnResizing() {
    setTimeout(function () {
      var tables = document.querySelectorAll('table.mr-main-table');
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
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('selected'); });
      trEl.classList.add('selected');
    }
  };

  // ── 3. FORM CONTROLS & MEMBER LEDGER VIEW ──────────────────────────
  window.handleAddReceiptClick = function (evt) {
    if (evt) {
      evt.preventDefault();
      evt.stopPropagation();
    }
    var menu = document.getElementById('add-receipt-menu');
    if (activeBillType === 'ALL') {
      if (menu) {
        if (menu.style.display === 'block') {
          menu.style.display = 'none';
        } else {
          var html = '';
          var seen = {};
          billTypes.forEach(function (bt) {
            var name = (bt.billTypeName || bt.name || '').trim();
            var key = name.toUpperCase();
            if (!name || seen[key]) return;
            seen[key] = true;
            html += '<div style="padding:6px 12px; font-size:11px; font-weight:700; color:#1e293b; cursor:pointer; text-transform:uppercase;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'" onclick="openAddReceiptFormForType(\'' + escHtml(name) + '\')">' + name + '</div>';
          });
          if (!html) {
            html = '<div style="padding:6px 12px; font-size:11px; font-weight:700; color:#1e293b; cursor:pointer;" onclick="openAddReceiptFormForType(\'Maintenance\')">MAINTENANCE</div>';
          }
          menu.innerHTML = html;
          menu.style.display = 'block';
        }
      }
    } else {
      if (menu) menu.style.display = 'none';
      openAddReceiptFormForType(activeBillType);
    }
  };

  function getAutoSelectConfig() {
    try {
      var sid = getActiveSocietyId();
      var cfgStr = localStorage.getItem('jeevika_config_notes_' + sid) || localStorage.getItem('jeevika_config_notes_global');
      if (cfgStr) {
        var cfg = JSON.parse(cfgStr);
        if (cfg && cfg.autoSelectBill !== undefined) {
          return !!cfg.autoSelectBill;
        }
      }
    } catch (e) {}
    return false;
  }

  var isManualBillMode = false;

  function updateBillInputModeUI() {
    var selectWrap = document.getElementById('against-bill-select-wrap');
    var manualWrap = document.getElementById('against-bill-manual-wrap');
    var btn = document.getElementById('btn-manual-bill-mode');
    if (isManualBillMode) {
      if (selectWrap) selectWrap.style.display = 'none';
      if (manualWrap) manualWrap.style.display = 'flex';
      if (btn) btn.style.background = '#1565C0';
    } else {
      if (selectWrap) selectWrap.style.display = 'flex';
      if (manualWrap) manualWrap.style.display = 'none';
      if (btn) btn.style.background = '#334155';
    }
  }

  window.toggleManualBillMode = function () {
    isManualBillMode = !isManualBillMode;
    var manualInput = document.getElementById('frm-against-bill-manual');
    var selectEl = document.getElementById('frm-against-bill');
    if (isManualBillMode) {
      if (manualInput && selectEl && selectEl.value) manualInput.value = selectEl.value;
    } else {
      if (selectEl && manualInput && manualInput.value) selectEl.value = manualInput.value;
    }
    updateBillInputModeUI();
  };

  window.onAgainstBillSelectChange = function (val) {
    var manualInput = document.getElementById('frm-against-bill-manual');
    if (manualInput) manualInput.value = val;

    var sel = document.getElementById('frm-against-bill');
    if (sel && sel.selectedIndex >= 0) {
      var opt = sel.options[sel.selectedIndex];
      var amt = parseFloat(opt.getAttribute('data-amt')) || 0;
      var prin = parseFloat(opt.getAttribute('data-prin')) || 0;
      var intAmt = parseFloat(opt.getAttribute('data-int')) || 0;
      if (amt > 0) {
        var amtInput = document.getElementById('frm-amount');
        if (amtInput && (!amtInput.value || parseFloat(amtInput.value) === 0)) {
          amtInput.value = amt.toFixed(2);
        }
      }
    }
    calcBifurcation();
  };

  window.onAgainstBillManualInput = function (val) {
    var sel = document.getElementById('frm-against-bill');
    if (sel) sel.value = val;
  };

  window.openAddReceiptFormForType = async function (typeName) {
    var menu = document.getElementById('add-receipt-menu');
    if (menu) menu.style.display = 'none';

    selectedReceiptId = null;
    originalBillType = null;
    var displayName = typeName || 'Maintenance';
    var formattedName = displayName.charAt(0).toUpperCase() + displayName.slice(1).toLowerCase();
    activeBillType = formattedName.toUpperCase();
    document.getElementById('mr-module-title').textContent = 'Member Receipt Entry [' + formattedName + ']';

    var billTypeWrap = document.getElementById('wrap-frm-billtype');
    if (billTypeWrap) billTypeWrap.style.display = 'none';

    var billTypeSel = document.getElementById('frm-billtype');
    if (billTypeSel) {
      for (var bIdx = 0; bIdx < billTypeSel.options.length; bIdx++) {
        if (billTypeSel.options[bIdx].value.toUpperCase() === formattedName.toUpperCase()) {
          billTypeSel.selectedIndex = bIdx;
          break;
        }
      }
    }

    var rcptNoEl = document.getElementById('frm-rcptno');
    if (rcptNoEl) {
      rcptNoEl.readOnly = false;
      rcptNoEl.disabled = false;
      rcptNoEl.value = (typeof fetchTxNextVoucherNo === 'function') 
        ? await fetchTxNextVoucherNo('receipt', receipts) 
        : getTxNextVoucherNo('receipt', receipts);
    }
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-rcptno', 'Receipt');
    document.getElementById('frm-rcptdate').value = todayISO();
    document.getElementById('frm-membername').value = '';
    document.getElementById('frm-chqno').value = '';
    document.getElementById('frm-chqdate').value = '';
    document.getElementById('frm-refno').value = '';
    document.getElementById('frm-bank').value = '';
    window.isManualBifurcationActive = false;
    document.getElementById('frm-principal').readOnly = true;
    document.getElementById('frm-interest').readOnly = true;
    document.getElementById('frm-amount').value = '';
    document.getElementById('frm-principal').value = '';
    document.getElementById('frm-interest').value = '';
    if (document.getElementById('frm-against-bill')) document.getElementById('frm-against-bill').value = '';
    if (document.getElementById('frm-against-bill-manual')) document.getElementById('frm-against-bill-manual').value = '';
    document.getElementById('frm-particular1').value = '';
    document.getElementById('frm-particular2').value = '';

    // Set Auto-Select state based on Configuration & Notes Master
    var autoSelectOn = getAutoSelectConfig();
    var chkAuto = document.getElementById('chk-auto-select');
    var lblAuto = document.getElementById('lbl-auto-select');
    if (chkAuto) chkAuto.checked = autoSelectOn;
    if (lblAuto) lblAuto.textContent = autoSelectOn ? 'ON' : 'OFF';

    isManualBillMode = !autoSelectOn;
    updateBillInputModeUI();

    var rdoCash = document.querySelector('input[name="payMode"][value="Cash"]');
    if (rdoCash) rdoCash.checked = true;
    togglePayMode('Cash');

    // Ledger Panel State 1 (Empty)
    document.getElementById('mr-ledger-empty').style.display = 'flex';
    document.getElementById('mr-ledger-content').style.display = 'none';

    document.getElementById('mr-section-list').style.display = 'none';
    document.getElementById('mr-section-form').style.display = 'flex';
    calcBifurcation();
  };

  window.openAddReceiptForm = function () {
    handleAddReceiptClick();
  };

  document.addEventListener('click', function (e) {
    var wrap = document.querySelector('.add-receipt-wrap');
    var menu = document.getElementById('add-receipt-menu');
    if (menu && wrap && !wrap.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  window.editSelectedReceipt = async function (id) {
    if (id) selectedReceiptId = id;
    if (!selectedReceiptId) {
      toast('Please select a receipt record to edit.', false);
      return;
    }
    var r = receipts.find(function (b) {
      return String(b.receiptId) === String(selectedReceiptId) ||
             String(b.voucherId) === String(selectedReceiptId) ||
             String(b.receiptNo) === String(selectedReceiptId) ||
             String(b.voucherNo) === String(selectedReceiptId);
    });
    if (!r) { toast('Receipt record not found.', false); return; }

    // Fetch full voucher detail lines from DB if available
    var vId = parseInt(r.voucherId || r.receiptId, 10);
    var fullVoucher = null;
    if (vId && vId > 0 && vId < 1000000000000) {
      try {
        var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
        var resp = await fetch(baseHost + '/api/vouchers/' + vId, { headers: (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}) });
        if (resp.ok) fullVoucher = await resp.json();
      } catch (e) {
        console.warn('Could not fetch voucher details for member receipt:', e);
      }
    }

    var activeTypeName = (r.billType || 'Maintenance');
    var formattedName = activeTypeName.charAt(0).toUpperCase() + activeTypeName.slice(1).toLowerCase();
    activeBillType = formattedName.toUpperCase();
    originalBillType = activeTypeName;
    document.getElementById('mr-module-title').textContent = 'Edit Member Receipt [' + (r.receiptNo || r.voucherNo) + ']';

    var billTypeWrap = document.getElementById('wrap-frm-billtype');
    if (billTypeWrap) billTypeWrap.style.display = 'block';

    var billTypeSel = document.getElementById('frm-billtype');
    if (billTypeSel) {
      var matched = false;
      for (var bIdx = 0; bIdx < billTypeSel.options.length; bIdx++) {
        if (billTypeSel.options[bIdx].value.toUpperCase() === activeTypeName.toUpperCase()) {
          billTypeSel.selectedIndex = bIdx;
          matched = true;
          break;
        }
      }
      if (!matched && activeTypeName) {
        var opt = document.createElement('option');
        opt.value = activeTypeName;
        opt.textContent = activeTypeName.toUpperCase();
        billTypeSel.appendChild(opt);
        billTypeSel.value = activeTypeName;
      }
    }

    var rcptNoEl = document.getElementById('frm-rcptno');
    if (rcptNoEl) {
      rcptNoEl.value = r.receiptNo || r.voucherNo || '';
      rcptNoEl.readOnly = true; // STRICT IMMUTABILITY ON ALTER
      rcptNoEl.disabled = true;
    }
    document.getElementById('frm-rcptdate').value = r.receiptDate || todayISO();

    // Robust member resolution so Member Name is always populated
    var targetMem = null;
    if (r.memberId) {
      targetMem = members.find(function (m) {
        return String(m.memberId || m.socMemId || m.id) === String(r.memberId);
      });
    }
    if (!targetMem && r.personCode) {
      targetMem = members.find(function (m) {
        return String(m.memberId || m.socMemId || m.id) === String(r.personCode) ||
               String(m.memCode || m.memberCode || '').trim().toUpperCase() === String(r.personCode).trim().toUpperCase();
      });
    }
    if (!targetMem && (r.memberName || r.personName)) {
      var pName = (r.memberName || r.personName || '').trim().toLowerCase();
      var fNo = (r.flatNo || r.wingFlat || '').trim().toLowerCase();
      targetMem = members.find(function (m) {
        var mName = (m.memName || m.memberName || m.name || '').trim().toLowerCase();
        var mFlat = (m.flatNo || m.FlatNo || '').trim().toLowerCase();
        var mWing = (m.wing || m.Wing || '').trim().toLowerCase();
        if (fNo && (mFlat === fNo || (mWing + '-' + mFlat) === fNo || (mWing + mFlat) === fNo)) {
          return true;
        }
        return mName && (pName.includes(mName) || mName.includes(pName));
      });
    }

    var targetMemId = targetMem ? (targetMem.memberId || targetMem.socMemId || targetMem.id) : (r.memberId || '');
    var memSel = document.getElementById('frm-membername');
    if (memSel) {
      if (targetMemId) {
        memSel.value = targetMemId;
      }
      if (!memSel.value && (r.memberName || r.personName || targetMemId)) {
        var dispName = (r.memberName || r.personName || 'Member #' + targetMemId) + (r.flatNo ? ' (' + r.flatNo + ')' : '');
        var opt = document.createElement('option');
        opt.value = targetMemId || r.memberId || Date.now();
        opt.textContent = dispName;
        memSel.appendChild(opt);
        memSel.value = opt.value;
        targetMemId = opt.value;
      }
    }

    document.getElementById('frm-chqno').value = r.chqNo || '';
    document.getElementById('frm-chqdate').value = r.chqDate || '';
    document.getElementById('frm-refno').value = r.refNo || '';
    document.getElementById('frm-bank').value = r.bankName || '';
    window.isManualBifurcationActive = true;
    document.getElementById('frm-amount').value = r.amount || 0;
    var pVal = (r.principalAmount !== undefined && r.principalAmount !== null) ? parseFloat(r.principalAmount) : (parseFloat(r.amount) || 0);
    var iVal = (r.interestAmount !== undefined && r.interestAmount !== null) ? parseFloat(r.interestAmount) : 0;
    document.getElementById('frm-principal').value = pVal.toFixed(2);
    document.getElementById('frm-interest').value = iVal.toFixed(2);
    if (document.getElementById('frm-against-bill')) document.getElementById('frm-against-bill').value = r.billNo || '';
    if (document.getElementById('frm-against-bill-manual')) document.getElementById('frm-against-bill-manual').value = r.billNo || '';
    document.getElementById('frm-particular1').value = r.particular1 || '';
    document.getElementById('frm-particular2').value = r.particular2 || '';

    if (targetMemId) onMemberSelect(targetMemId, true);

    var debitItem = null;
    if (fullVoucher && fullVoucher.items && Array.isArray(fullVoucher.items)) {
      debitItem = fullVoucher.items.find(function(it) {
        var d = parseFloat(it.debit || it.dr) || 0;
        return d > 0;
      });
    }

    var savedAcc = (debitItem ? (debitItem.accountName || debitItem.name) : (r.cashBank || r.cashBankName || ''));
    var savedCode = (debitItem ? (debitItem.accountCode || debitItem.code) : (r.cashBankCode || ''));
    var savedAccId = (debitItem ? (debitItem.accountId || debitItem.id) : null);

    var isCash = (savedCode && String(savedCode).toUpperCase() === 'ASS-1001') ||
                 (savedAcc && String(savedAcc).toLowerCase().includes('cash'));

    var rdoCash = document.querySelector('input[name="payMode"][value="Cash"]');
    var rdoBank = document.querySelector('input[name="payMode"][value="Bank"]');
    if (isCash) {
      if (rdoCash) rdoCash.checked = true;
      if (rdoBank) rdoBank.checked = false;
      togglePayMode('Cash', savedAcc, savedCode, savedAccId);
    } else {
      if (rdoBank) rdoBank.checked = true;
      if (rdoCash) rdoCash.checked = false;
      togglePayMode('Bank', savedAcc, savedCode, savedAccId);
    }

    document.getElementById('mr-section-list').style.display = 'none';
    document.getElementById('mr-section-form').style.display = 'flex';
  };

  window.onMemberSelect = async function (memberId, isEditMode) {
    var emptyDiv = document.getElementById('mr-ledger-empty');
    var contentDiv = document.getElementById('mr-ledger-content');

    if (!memberId) {
      if (emptyDiv) emptyDiv.style.display = 'flex';
      if (contentDiv) contentDiv.style.display = 'none';
      var selBill = document.getElementById('frm-against-bill');
      if (selBill) selBill.innerHTML = '<option value="">— Select Bill (Optional) —</option>';
      return;
    }

    var m = members.find(function (x) {
      return String(x.memberId || x.socMemId || x.id) === String(memberId);
    });

    if (emptyDiv) emptyDiv.style.display = 'none';
    if (contentDiv) contentDiv.style.display = 'flex';

    var wing = m ? (m.wing || m.Wing || 'A') : 'A';
    var flat = m ? (m.flatNo || m.FlatNo || '102') : '102';
    var mob = m ? (m.mobileNo || m.mobile1 || '9876543211') : '9876543211';

    document.getElementById('led-flat').textContent = wing + '-' + flat;
    document.getElementById('led-area').textContent = m && (m.areaSqft || m.area) ? (m.areaSqft || m.area) + ' sq.ft' : '—';
    document.getElementById('led-mobile1').textContent = mob;

    var curBillType = (document.getElementById('frm-billtype') ? document.getElementById('frm-billtype').value : '') || (activeBillType === 'ALL' ? 'Maintenance' : activeBillType);
    var sid = getActiveSocietyId() || 4;
    var fyid = getFyId() || 0;

    var totPrin = 0, totInt = 0, netDue = 0;
    var unpaidBills = [];
    var recentTransactions = [];

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var res = await fetch(baseHost + '/api/member-receipts/member-due?societyId=' + sid + '&fyId=' + fyid + '&memberId=' + memberId + '&billType=' + encodeURIComponent(curBillType), {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        var data = await res.json();
        if (data.success) {
          totPrin = parseFloat(data.principalDue) || 0;
          totInt = parseFloat(data.interestDue) || 0;
          netDue = parseFloat(data.netDue) || 0;
          unpaidBills = data.unpaidBills || [];
          recentTransactions = data.recentTransactions || [];
          window._currentMemberBillInterest = (data.currentBillInterest !== undefined)
            ? parseFloat(data.currentBillInterest)
            : (unpaidBills.length > 0 ? (parseFloat(unpaidBills[0].interestAmount) || 0) : 0);
          window._currentMemberBillPrincipal = (data.currentBillPrincipal !== undefined)
            ? parseFloat(data.currentBillPrincipal)
            : (unpaidBills.length > 0 ? (parseFloat(unpaidBills[0].principalAmount) || 0) : 0);
        }
      }
    } catch (e) {
      console.warn('Could not fetch exact member ledger due:', e);
    }

    var txTbody = document.getElementById('led-tx-tbody');
    if (txTbody) {
      if (recentTransactions && recentTransactions.length > 0) {
        var txHtml = '';
        recentTransactions.forEach(function(tx) {
          txHtml += '<tr>' +
            '<td style="border:1px solid #e2e8f0; padding:3px;">' + escHtml(tx.date || '') + '</td>' +
            '<td style="border:1px solid #e2e8f0; padding:3px; font-weight:700; color:#1565C0;">' + escHtml(tx.vchNo || '') + '</td>' +
            '<td style="border:1px solid #e2e8f0; padding:3px; text-align:right; font-family:\'Consolas\', monospace;">' + (tx.dr ? parseFloat(tx.dr).toFixed(2) : '0.00') + '</td>' +
            '<td style="border:1px solid #e2e8f0; padding:3px; text-align:right; font-family:\'Consolas\', monospace;">' + (tx.cr ? parseFloat(tx.cr).toFixed(2) : '0.00') + '</td>' +
            '</tr>';
        });
        txTbody.innerHTML = txHtml;
      } else {
        txTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:8px; color:#94a3b8; font-style:italic;">No recent transactions</td></tr>';
      }
    }

    var selBill = document.getElementById('frm-against-bill');
    if (selBill) {
      var html = '<option value="">— Select Bill (Optional) —</option>';
      unpaidBills.forEach(function (b) {
        var bNo = b.billNo || ('BILL/' + (b.billId || '01'));
        var bAmt = parseFloat(b.totalAmount) || parseFloat(b.balanceAmount) || 0;
        var bDate = b.billDate || '';
        html += '<option value="' + escHtml(bNo) + '" data-amt="' + bAmt + '" data-prin="' + (b.principalAmount || 0) + '" data-int="' + (b.interestAmount || 0) + '">' + escHtml(bNo) + (bAmt ? ' - ₹' + bAmt.toFixed(2) : '') + (bDate ? ' (' + bDate + ')' : '') + '</option>';
      });
      selBill.innerHTML = html;
    }

    window._currentMemberOutstandingInterest = Math.max(0, totInt);
    window._currentMemberOutstandingPrincipal = Math.max(0, totPrin);

    document.getElementById('led-prin').textContent = totPrin.toFixed(2);
    document.getElementById('led-int').textContent = totInt.toFixed(2);
    document.getElementById('led-tot').textContent = netDue.toFixed(2);

    // Auto-Select Against Bill Logic based on Configuration
    var chkAuto = document.getElementById('chk-auto-select');
    var isAutoSelectOn = chkAuto ? chkAuto.checked : getAutoSelectConfig();

    if (!isEditMode) {
      var amtInput = document.getElementById('frm-amount');
      if (netDue > 0) {
        amtInput.value = netDue.toFixed(2);
      } else if (unpaidBills.length > 0) {
        var topBill = unpaidBills[0];
        var bAmt = topBill.totalAmount || topBill.balanceAmount || 0;
        amtInput.value = bAmt.toFixed(2);
      }

      if (isAutoSelectOn && unpaidBills.length > 0) {
        var topBill = unpaidBills[0];
        var topBillNo = topBill.billNo || ('BILL/' + (topBill.billId || '01'));
        if (selBill) selBill.value = topBillNo;
        var manualInput = document.getElementById('frm-against-bill-manual');
        if (manualInput) manualInput.value = topBillNo;
      } else if (!isAutoSelectOn) {
        if (selBill) selBill.value = '';
        var manualInput = document.getElementById('frm-against-bill-manual');
        if (manualInput) manualInput.value = '';
      }
      calcBifurcation();
    }
  };

  window.togglePayMode = function (mode, selectedValue, selectedAccCode, selectedAccId) {
    var sel = document.getElementById('frm-account');
    if (!sel) return;

    // Strictly filter accounts under Main Group: ASSET & Primary Group: CASH & BANK BALANCE
    var filtered = (accounts || []).filter(function (a) {
      var mainGrp = String(a.mainGroup || a.grpMainName || '').trim().toLowerCase();
      var isAsset = (a.grpMainId === 1 || mainGrp === 'asset' || mainGrp === 'assets');
      
      var primGrp = String(a.groupName || a.grpPrimaryName || a.primaryGroup || '').trim().toLowerCase();
      var isCashBank = primGrp.includes('cash & bank') || primGrp.includes('cash and bank') || primGrp.includes('bank accounts') || primGrp.includes('cash-in-hand') || primGrp.includes('cash in hand');

      return isAsset && isCashBank;
    });

    // Fallback only if no group-tagged accounts exist in database
    if (filtered.length === 0) {
      filtered = (accounts || []).filter(function (a) {
        var code = String(a.accCode || a.accountCode || '').toUpperCase();
        var name = String(a.accName || a.accountName || '').toLowerCase();
        return code === 'ASS-1001' || code === 'ASS-1002' || code === 'ASS-1003' || name === 'cash in hand';
      });
    }

    var html = '';
    if (mode === 'Cash') {
      var cashAccs = filtered.filter(function (a) {
        var accName = String(a.accName || a.accountName || '').toLowerCase();
        var primGrp = String(a.groupName || a.grpPrimaryName || '').toLowerCase();
        return accName.includes('cash') || primGrp.includes('cash');
      });

      if (cashAccs.length === 0) {
        html = '<option value="Cash in Hand" data-code="ASS-1001">[ASS-1001] Cash in Hand</option>';
      } else {
        cashAccs.forEach(function (a) {
          var name = a.accName || a.accountName || 'Cash in Hand';
          var code = a.accCode || a.accountCode || '';
          var label = code ? ('[' + code + '] ' + name) : name;
          html += '<option value="' + escHtml(name) + '" data-id="' + (a.accountId || '') + '" data-code="' + escHtml(code) + '">' + escHtml(label) + '</option>';
        });
      }
    } else {
      // Bank mode: strictly accounts under Cash & Bank Balance that are not cash
      var bankAccs = filtered.filter(function (a) {
        var accName = String(a.accName || a.accountName || '').toLowerCase();
        var primGrp = String(a.groupName || a.grpPrimaryName || '').toLowerCase();
        return !accName.includes('cash') && !primGrp.includes('cash-in-hand') && !primGrp.includes('cash in hand');
      });

      if (bankAccs.length === 0) {
        html = '<option value="">— No Bank Accounts Found in Cash & Bank Balance —</option>';
      } else {
        bankAccs.forEach(function (a) {
          var name = a.accName || a.accountName || '';
          var code = a.accCode || a.accountCode || '';
          var label = code ? ('[' + code + '] ' + name) : name;
          html += '<option value="' + escHtml(name) + '" data-id="' + (a.accountId || '') + '" data-code="' + escHtml(code) + '">' + escHtml(label) + '</option>';
        });
      }
    }

    sel.innerHTML = html;
    if (selectedValue || selectedAccCode || selectedAccId) {
      var sVal = String(selectedValue || '').trim();
      var cleanTarget = sVal.toLowerCase().replace(/\[.*?\]\s*/g, '').replace(/^[a-z]+-\d+\s*-\s*/g, '').trim();
      var matched = false;

      for (var optIdx = 0; optIdx < sel.options.length; optIdx++) {
        var opt = sel.options[optIdx];
        var optVal = opt.value.trim();
        var optCode = (opt.dataset.code || '').trim().toUpperCase();
        var optId = (opt.dataset.id || '').trim();

        if (optVal && sVal && optVal.toLowerCase() === sVal.toLowerCase()) {
          sel.selectedIndex = optIdx; matched = true; break;
        }
        if (selectedAccId && optId && optId === String(selectedAccId)) {
          sel.selectedIndex = optIdx; matched = true; break;
        }
        if (selectedAccCode && optCode && selectedAccCode.toUpperCase() === optCode) {
          sel.selectedIndex = optIdx; matched = true; break;
        }
        if (optCode && sVal && sVal.toUpperCase().includes(optCode)) {
          sel.selectedIndex = optIdx; matched = true; break;
        }
        var cleanOpt = optVal.toLowerCase().replace(/\[.*?\]\s*/g, '').replace(/^[a-z]+-\d+\s*-\s*/g, '').trim();
        if (cleanTarget && cleanOpt && (cleanTarget === cleanOpt || cleanOpt.includes(cleanTarget) || cleanTarget.includes(cleanOpt))) {
          sel.selectedIndex = optIdx; matched = true; break;
        }
      }

      // Failsafe: dynamically add option so Bank field is NEVER BLANK!
      if (!matched && (sVal || selectedAccCode)) {
        var opt = document.createElement('option');
        opt.value = sVal || selectedAccCode;
        opt.textContent = (sVal && sVal.startsWith('[')) ? sVal : ('[' + (selectedAccCode || 'BANK') + '] ' + (sVal || 'Bank Account'));
        sel.appendChild(opt);
        sel.value = opt.value;
      }
    }
  };

  function getBillTypeInterestPriority(typeName) {
    var bName = (typeName || '').trim().toLowerCase();
    var sid = getActiveSocietyId();

    // 1. Check in-memory billTypes array
    if (billTypes && billTypes.length > 0) {
      var found = billTypes.find(function (b) {
        var n = (b.billTypeName || b.name || '').trim().toLowerCase();
        return n === bName;
      });
      if (found && found.interestPriority) {
        return found.interestPriority;
      }
    }

    // 2. Check localStorage
    try {
      var storedStr = localStorage.getItem('jeevika_bill_types_' + sid) || localStorage.getItem('jeevika_bill_types_global');
      if (storedStr) {
        var bObj = JSON.parse(storedStr);
        if (bObj) {
          var directKey = Object.keys(bObj).find(function (k) { return k.trim().toLowerCase() === bName; });
          if (directKey && bObj[directKey] && bObj[directKey].interestPriority) {
            return bObj[directKey].interestPriority;
          }
        }
      }
    } catch (e) {}

    return 'Interest First';
  }

  window.onManualInterestInput = function () {
    window.isManualBifurcationActive = true;
    var amt = parseFloat(document.getElementById('frm-amount').value) || 0;
    var iVal = parseFloat(document.getElementById('frm-interest').value) || 0;
    if (amt > 0) {
      document.getElementById('frm-principal').value = Math.max(0, amt - iVal).toFixed(2);
    }
  };

  window.onManualPrincipalInput = function () {
    window.isManualBifurcationActive = true;
    var amt = parseFloat(document.getElementById('frm-amount').value) || 0;
    var pVal = parseFloat(document.getElementById('frm-principal').value) || 0;
    if (amt > 0) {
      document.getElementById('frm-interest').value = Math.max(0, amt - pVal).toFixed(2);
    }
  };

  window.calcBifurcation = function () {
    if (window.isManualBifurcationActive) return;
    var amt = parseFloat(document.getElementById('frm-amount').value) || 0;

    // Check if against-bill has a selected bill option
    var billInt = 0;
    var billPrin = 0;
    var selBill = document.getElementById('frm-against-bill');
    if (selBill && selBill.selectedIndex > 0) {
      var opt = selBill.options[selBill.selectedIndex];
      billInt = parseFloat(opt.getAttribute('data-int')) || 0;
      billPrin = parseFloat(opt.getAttribute('data-prin')) || 0;
    }

    var outInt = 0;
    var outPrin = 0;

    if (billInt > 0 || billPrin > 0) {
      outInt = billInt;
      outPrin = billPrin;
    } else if (window._currentMemberBillInterest !== undefined && window._currentMemberBillInterest > 0) {
      // Current bill interest (e.g. Ramesh Sharma current interest = 47.00)
      outInt = window._currentMemberBillInterest;
      outPrin = (window._currentMemberBillPrincipal !== undefined && window._currentMemberBillPrincipal > 0)
        ? window._currentMemberBillPrincipal
        : (window._currentMemberOutstandingPrincipal || 0);
    } else {
      outInt = (window._currentMemberOutstandingInterest !== undefined)
        ? window._currentMemberOutstandingInterest
        : (parseFloat(document.getElementById('led-int')?.textContent) || 0);
      outPrin = (window._currentMemberOutstandingPrincipal !== undefined)
        ? window._currentMemberOutstandingPrincipal
        : (parseFloat(document.getElementById('led-prin')?.textContent) || 0);
    }

    var curBillType = (document.getElementById('frm-billtype') ? document.getElementById('frm-billtype').value : '')
      || ((activeBillType && activeBillType !== 'ALL') ? activeBillType : 'Maintenance');
    var priority = getBillTypeInterestPriority(curBillType);

    var adjustedInterest = 0;
    var adjustedPrincipal = 0;

    if (amt > 0) {
      if (priority.toLowerCase().includes('principal')) {
        // ── PRINCIPAL FIRST ──
        // Allocate all received amount directly to Principal
        adjustedPrincipal = amt;
        adjustedInterest = 0;
      } else {
        // ── INTEREST FIRST ──
        if (outInt > 0) {
          adjustedInterest = Math.min(amt, outInt);
          adjustedPrincipal = Math.max(0, amt - adjustedInterest);
        } else {
          adjustedInterest = 0;
          adjustedPrincipal = amt;
        }
      }
    }

    document.getElementById('frm-principal').value = adjustedPrincipal.toFixed(2);
    document.getElementById('frm-interest').value = adjustedInterest.toFixed(2);
  };

  window.enableManualBifurcation = function () {
    window.isManualBifurcationActive = true;
    var pInp = document.getElementById('frm-principal');
    var iInp = document.getElementById('frm-interest');
    if (pInp) pInp.readOnly = false;
    if (iInp) iInp.readOnly = false;
    toast('Manual entry enabled for Principal & Interest.', true);
  };

  window.appendParticularTag = function (num) {
    var el = document.getElementById('frm-particular' + num);
    if (el) {
      var val = (el.value ? el.value + ' ' : '') + 'Receipt for ' + getFyLabel();
      el.value = val.slice(0, 75);
    }
  };

  // ── 4. SAVE & ACTIONS ─────────────────────────────────────────────
  window.saveReceipt = async function () {
    var mVal = (document.getElementById('frm-membername').value || '').trim();
    if (!mVal) {
      if (typeof showAlert === 'function') {
        await showAlert('Please select a Member Name to proceed with Receipt Entry.', 'Validation Required', 'warning');
      } else {
        toast('Please select a Member Name.', false);
      }
      var selM = document.getElementById('frm-membername');
      if (selM) selM.focus();
      return;
    }

    var amt = parseFloat(document.getElementById('frm-amount').value) || 0;
    if (amt <= 0) {
      if (typeof showAlert === 'function') {
        await showAlert('Please enter a valid Received Amount (₹) greater than 0.', 'Validation Required', 'warning');
      } else {
        toast('Please enter a valid received amount.', false);
      }
      var inpAmt = document.getElementById('frm-amount');
      if (inpAmt) inpAmt.focus();
      return;
    }

    var m = members.find(function (x) { return String(x.memberId || x.socMemId || x.id) === String(mVal); });
    var mName = m ? (m.memName || m.memberName || m.name || '') : '';
    var wing = m ? (m.wing || m.Wing || '') : '';
    var flat = m ? (m.flatNo || m.FlatNo || '') : '';

    var billTypeSel = document.getElementById('frm-billtype');
    var selectedBillType = (billTypeSel ? billTypeSel.value : '') || ((activeBillType && activeBillType !== 'ALL') ? activeBillType : 'Maintenance');
    var formattedBillTypeName = selectedBillType.charAt(0).toUpperCase() + selectedBillType.slice(1).toLowerCase();

    var billNoVal = isManualBillMode
      ? (document.getElementById('frm-against-bill-manual') ? document.getElementById('frm-against-bill-manual').value.trim() : '')
      : (document.getElementById('frm-against-bill') ? document.getElementById('frm-against-bill').value.trim() : '');
    if (!billNoVal && document.getElementById('frm-against-bill-manual')) {
      billNoVal = document.getElementById('frm-against-bill-manual').value.trim();
    }
    if (!billNoVal && document.getElementById('frm-against-bill')) {
      billNoVal = document.getElementById('frm-against-bill').value.trim();
    }

    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var rId = selectedReceiptId || Date.now();
    var rNo = (document.getElementById('frm-rcptno').value || '').trim() || ('MRV/' + getFyLabel() + '/' + String(receipts.length + 1).padStart(2, '0'));

    if (typeof validateTxVoucherNo === 'function') {
      var vCheck = validateTxVoucherNo('receipt', rNo);
      if (!vCheck.valid) {
        if (typeof showAlert === 'function') {
          await showAlert(vCheck.error, 'Voucher Number Invalid', 'warning');
        } else {
          toast(vCheck.error, false);
        }
        return;
      }
    }

    var depositAcc = (document.getElementById('frm-account') ? document.getElementById('frm-account').value : '') || '';
    if (!depositAcc) {
      var rdoCash = document.querySelector('input[name="payMode"][value="Cash"]');
      depositAcc = (rdoCash && rdoCash.checked) ? 'Cash in Hand' : 'Bank Account';
    }

    var chqDateVal = (document.getElementById('frm-chqdate') ? document.getElementById('frm-chqdate').value : '').trim();
    var chqNoVal = (document.getElementById('frm-chqno') ? document.getElementById('frm-chqno').value : '').trim();
    var bankNameVal = (document.getElementById('frm-bank') ? document.getElementById('frm-bank').value : '').trim();
    var narrationVal = (document.getElementById('frm-particular1') ? document.getElementById('frm-particular1').value : '').trim() || (formattedBillTypeName.toUpperCase() + ' Receipt');

    var payload = {
      receiptId: (typeof rId === 'number' && rId < 1000000000000) ? rId : null,
      voucherId: (typeof rId === 'number' && rId < 1000000000000) ? rId : 0,
      societyId: parseInt(sid, 10) || 1,
      fyId: parseInt(fyid, 10) || 1,
      receiptNo: rNo,
      voucherNo: rNo,
      billType: formattedBillTypeName,
      previousBillType: originalBillType || null,
      receiptDate: document.getElementById('frm-rcptdate').value || todayISO(),
      voucherDate: document.getElementById('frm-rcptdate').value || todayISO(),
      memberId: parseInt(mVal, 10),
      memberName: mName,
      personName: mName,
      flatNo: (wing && flat) ? (wing + '-' + flat) : flat,
      cashBank: depositAcc,
      cashBankName: depositAcc,
      cashBankCode: depositAcc.startsWith('[') ? depositAcc.substring(1, depositAcc.indexOf(']')) : null,
      amount: amt,
      principalAmount: parseFloat(document.getElementById('frm-principal').value) || amt,
      interestAmount: parseFloat(document.getElementById('frm-interest').value) || 0,
      chqNo: chqNoVal || null,
      chqDate: chqDateVal ? chqDateVal : null,
      bankName: bankNameVal || null,
      billNo: (billNoVal && billNoVal !== '—') ? billNoVal : null,
      particular1: narrationVal,
      particular2: (document.getElementById('frm-particular2') ? document.getElementById('frm-particular2').value : '') || '',
      narration: narrationVal,
      clearDate: document.getElementById('frm-rcptdate').value || todayISO(),
      status: 'Posted'
    };

    try {
      var res = null;
      if (typeof API !== 'undefined' && API.post) {
        res = await API.post('/member-receipts', payload);
      } else {
        var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
        var resp = await fetch(baseHost + '/api/member-receipts', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          var errText = await resp.text();
          throw new Error(errText || 'Failed to save receipt');
        }
        res = await resp.json();
      }

      if (res && (res.success || res.voucherId || res.receiptNo)) {
        try { localStorage.setItem('jeevika_receipt_sync', Date.now().toString()); } catch (e) {}
        toast('Receipt saved successfully!', true);
        showList();
        await loadReceipts();
      } else {
        throw new Error(res?.message || 'Unexpected response from server');
      }
    } catch (e) {
      if (typeof showAlert === 'function') {
        await showAlert('Failed to save receipt: ' + (e.message || e), 'Save Error', 'danger');
      } else {
        toast('Save failed: ' + (e.message || e), false);
      }
    }
  };

  window.deleteSelectedReceipt = async function () {
    if (!selectedReceiptId) {
      toast('Please select a receipt record to delete.', false);
      return;
    }

    var rcpt = receipts.find(function (r) {
      return String(r.receiptId) === String(selectedReceiptId) ||
             String(r.voucherId) === String(selectedReceiptId) ||
             String(r.receiptNo) === String(selectedReceiptId) ||
             String(r.voucherNo) === String(selectedReceiptId);
    });
    var rcptNoStr = rcpt ? (rcpt.receiptNo || rcpt.voucherNo) : '#' + selectedReceiptId;
    var delId = (rcpt && (rcpt.receiptId || rcpt.voucherId)) ? (rcpt.receiptId || rcpt.voucherId) : selectedReceiptId;

    var ok = typeof showConfirm === 'function'
      ? await showConfirm('Are you sure you want to delete receipt ' + rcptNoStr + '?', 'Confirm Delete Receipt')
      : confirm('Are you sure you want to delete receipt ' + rcptNoStr + '?');

    if (!ok) return;

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/vouchers/' + encodeURIComponent(delId), {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!resp.ok) {
        resp = await fetch(baseHost + '/api/member-receipts/' + encodeURIComponent(delId), {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
      }
      if (resp.ok) {
        try { localStorage.setItem('jeevika_receipt_sync', Date.now().toString()); } catch (e) {}
        toast('Receipt deleted successfully from database.', true);
      } else {
        toast('Failed to delete receipt from database.', false);
      }
    } catch (e) {
      toast('Error deleting receipt: ' + e.message, false);
    }

    selectedReceiptId = null;
    await loadReceipts();
  };

  window.previewReceipt = function () {
    if (!selectedReceiptId) {
      toast('Please select a receipt to preview.', false);
      return;
    }
    var r = receipts.find(function (x) { return x.receiptId === selectedReceiptId; });
    if (!r) return;

    var container = document.getElementById('preview-receipt-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    container.innerHTML = '<div style="border-bottom:2px solid #1565C0; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#1565C0; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#333; text-decoration:underline;">MEMBERS PAYMENT RECEIPT VOUCHER</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px;">' +
        '<div>' +
          '<div><strong>Received From:</strong> ' + escHtml(r.memberName || r.personName) + ' (' + (r.flatNo || '') + ')</div>' +
          '<div><strong>Deposit Account:</strong> ' + escHtml(r.cashBank) + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div><strong>Receipt No:</strong> <span style="font-family:monospace; color:#1565C0; font-weight:bold;">' + escHtml(r.receiptNo) + '</span></div>' +
          '<div><strong>Receipt Date:</strong> ' + escHtml(r.receiptDate) + '</div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#1565C0; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Description / Particulars</th>' +
          '<th style="padding:6px; text-align:right;">Amount (₹)</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr><td style="border:1px solid #ddd; padding:8px;">' + escHtml(r.particular1 || 'Maintenance Receipt Collection') + '</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold;">' + (r.amount || 0).toFixed(2) + '</td></tr>' +
        '</tbody>' +
        '<tfoot><tr style="background:#f5f5f5; font-weight:bold;">' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right;">TOTAL RECEIVED:</td>' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right; font-family:monospace; color:#1565C0; font-size:14px;">₹' + (r.amount || 0).toFixed(2) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
        '<div><strong>Received By</strong><br><br>_____________</div>' +
        '<div><strong>Hon. Treasurer / Secretary</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('mr-section-list').style.display = 'none';
    document.getElementById('mr-section-form').style.display = 'none';
    document.getElementById('mr-section-preview').style.display = 'flex';
  };

  // ── BANK SLIP (CHEQUE MANAGEMENT) ───────────────────────────
  window.currentBankSlipRecords = [];

  window.showBankSlip = function () {
    // Populate Deposit Account filter dropdown with distinct accounts present in receipts
    var bankSel = document.getElementById('bs-bank-filter');
    if (bankSel) {
      var currentVal = bankSel.value;
      var accSet = {};
      receipts.forEach(function (r) {
        if (r.cashBank && r.cashBank.trim()) {
          accSet[r.cashBank.trim()] = true;
        }
      });
      var accList = Object.keys(accSet).sort();
      var optHtml = '<option value="">-- All Deposit Accounts --</option>';
      accList.forEach(function (acc) {
        var sel = (acc === currentVal) ? ' selected' : '';
        optHtml += '<option value="' + escHtml(acc) + '"' + sel + '>' + escHtml(acc) + '</option>';
      });
      bankSel.innerHTML = optHtml;
    }

    filterBankSlip();

    document.getElementById('mr-section-list').style.display = 'none';
    document.getElementById('mr-section-form').style.display = 'none';
    if (document.getElementById('mr-section-preview')) {
      document.getElementById('mr-section-preview').style.display = 'none';
    }
    document.getElementById('mr-section-cheque').style.display = 'flex';
  };

  // Backwards compatibility
  window.showChequeManagement = window.showBankSlip;

  window.filterBankSlip = function () {
    var tbody = document.getElementById('chq-tbody');
    if (!tbody) return;

    var bankFilter = (document.getElementById('bs-bank-filter') ? document.getElementById('bs-bank-filter').value.trim() : '');
    var fromDate = (document.getElementById('bs-from-date') ? document.getElementById('bs-from-date').value.trim() : '');
    var toDate = (document.getElementById('bs-to-date') ? document.getElementById('bs-to-date').value.trim() : '');
    var fromNoRaw = (document.getElementById('bs-from-no') ? document.getElementById('bs-from-no').value.trim() : '');
    var toNoRaw = (document.getElementById('bs-to-no') ? document.getElementById('bs-to-no').value.trim() : '');

    function parseSeq(val) {
      var m = (val || '').match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : NaN;
    }
    var fromSeq = parseSeq(fromNoRaw);
    var toSeq = parseSeq(toNoRaw);
    var hasSeqRange = !isNaN(fromSeq) || !isNaN(toSeq);

    // Filter receipts with cheques/instruments
    var filtered = receipts.filter(function (r) {
      if (!r.chqNo || r.chqNo === '—' || !r.chqNo.trim()) return false;

      if (bankFilter && (r.cashBank || '').trim() !== bankFilter) return false;

      if (fromDate && (r.receiptDate || '') < fromDate) return false;
      if (toDate && (r.receiptDate || '') > toDate) return false;

      var rNo = (r.receiptNo || r.voucherNo || '').trim();
      if (hasSeqRange) {
        var s = parseSeq(rNo);
        if (!isNaN(s)) {
          if (!isNaN(fromSeq) && s < fromSeq) return false;
          if (!isNaN(toSeq) && s > toSeq) return false;
        }
      } else if (fromNoRaw || toNoRaw) {
        var rNoLow = rNo.toLowerCase();
        if (fromNoRaw && rNoLow < fromNoRaw.toLowerCase()) return false;
        if (toNoRaw && rNoLow > toNoRaw.toLowerCase()) return false;
      }

      return true;
    });

    window.currentBankSlipRecords = filtered;

    var totalAmt = 0;
    var html = '';
    filtered.forEach(function (c) {
      var amt = parseFloat(c.amount) || 0;
      totalAmt += amt;
      html += '<tr ondblclick="editSelectedReceipt(\'' + (c.receiptId || c.voucherId || c.receiptNo) + '\')">' +
        '<td class="mr-mono">' + escHtml(c.receiptDate || '') + '</td>' +
        '<td class="mr-mono" style="font-weight:700; color:#1565C0;">' + escHtml(c.receiptNo || c.voucherNo || '') + '</td>' +
        '<td>' + escHtml(c.memberName || c.personName || '') + '</td>' +
        '<td class="mr-mono" style="font-weight:700;">' + escHtml(c.chqNo || '') + '</td>' +
        '<td>' + escHtml(c.bankName || '—') + '</td>' +
        '<td>' + escHtml(c.cashBank || '') + '</td>' +
        '<td class="mr-mono" style="text-align:right; font-weight:700;">' + amt.toFixed(2) + '</td>' +
        '<td style="text-align:center;"><span style="color:#2E7D32; font-weight:700;">Received</span></td>' +
        '</tr>';
    });

    tbody.innerHTML = html || '<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:30px;">No cheques found matching filter criteria.</td></tr>';

    var countEl = document.getElementById('mr-cheque-count');
    if (countEl) countEl.textContent = filtered.length + ' Cheque(s)';

    var totalBadge = document.getElementById('mr-cheque-total');
    if (totalBadge) totalBadge.textContent = 'Total: ₹' + totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var totalFoot = document.getElementById('bs-total-amount');
    if (totalFoot) totalFoot.textContent = '₹' + totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  window.resetBankSlipFilters = function () {
    if (document.getElementById('bs-bank-filter')) document.getElementById('bs-bank-filter').value = '';
    if (document.getElementById('bs-from-date')) document.getElementById('bs-from-date').value = '';
    if (document.getElementById('bs-to-date')) document.getElementById('bs-to-date').value = '';
    if (document.getElementById('bs-from-no')) document.getElementById('bs-from-no').value = '';
    if (document.getElementById('bs-to-no')) document.getElementById('bs-to-no').value = '';
    filterBankSlip();
  };

  window.printBankSlip = function () {
    var rows = window.currentBankSlipRecords || [];
    if (!rows || rows.length === 0) {
      toast('No cheque records found to print.', false);
      return;
    }

    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var bankFilter = (document.getElementById('bs-bank-filter') ? document.getElementById('bs-bank-filter').value.trim() : '') || 'All Deposit Accounts';
    var fromDate = (document.getElementById('bs-from-date') ? document.getElementById('bs-from-date').value.trim() : '');
    var toDate = (document.getElementById('bs-to-date') ? document.getElementById('bs-to-date').value.trim() : '');
    var dateRangeStr = (fromDate && toDate) ? (fromDate + ' to ' + toDate) : (fromDate || toDate || todayISO());

    var totalAmt = rows.reduce(function (sum, r) { return sum + (parseFloat(r.amount) || 0); }, 0);
    var inWords = (typeof amountInWords === 'function') ? amountInWords(totalAmt) : ('Rupees ' + totalAmt.toFixed(2));

    var trs = '';
    rows.forEach(function (r, i) {
      var amt = parseFloat(r.amount) || 0;
      trs += '<tr>' +
        '<td style="border:1px solid #94a3b8; padding:5px 6px; text-align:center;">' + (i + 1) + '</td>' +
        '<td style="border:1px solid #94a3b8; padding:5px 6px; text-align:center;">' + escHtml(r.receiptDate || '') + '</td>' +
        '<td style="border:1px solid #94a3b8; padding:5px 6px; font-weight:bold; font-family:monospace;">' + escHtml(r.receiptNo || r.voucherNo || '') + '</td>' +
        '<td style="border:1px solid #94a3b8; padding:5px 6px;">' + escHtml(r.memberName || r.personName || '') + '</td>' +
        '<td style="border:1px solid #94a3b8; padding:5px 6px; text-align:center;">' + escHtml(r.flatNo || r.wingFlat || '—') + '</td>' +
        '<td style="border:1px solid #94a3b8; padding:5px 6px; font-weight:bold; font-family:monospace; text-align:center;">' + escHtml(r.chqNo || '') + '</td>' +
        '<td style="border:1px solid #94a3b8; padding:5px 6px;">' + escHtml(r.bankName || '—') + '</td>' +
        '<td style="border:1px solid #94a3b8; padding:5px 6px;">' + escHtml(r.cashBank || '') + '</td>' +
        '<td style="border:1px solid #94a3b8; padding:5px 6px; text-align:right; font-weight:bold; font-family:monospace;">' + amt.toFixed(2) + '</td>' +
        '</tr>';
    });

    var printHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>Bank Deposit Slip - ' + escHtml(socName) + '</title>' +
      '<style>' +
      'body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 15px; }' +
      '@page { size: A4 portrait; margin: 12mm; }' +
      '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }' +
      'th { background: #1e3a8a !important; color: white !important; font-weight: bold; border: 1px solid #1e3a8a; padding: 6px; font-size: 10px; text-align: left; }' +
      '</style>' +
      '</head><body>' +
      '<div style="text-align:center; border-bottom:2px solid #1e3a8a; padding-bottom:8px; margin-bottom:12px;">' +
      '<h2 style="margin:0; font-size:18px; color:#1e3a8a; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#475569; margin-top:3px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + escHtml(getFyLabel()) + '</div>' +
      '<h3 style="margin:8px 0 0 0; font-size:13px; color:#0f172a; letter-spacing:0.5px; text-decoration:underline;">BANK DEPOSIT SLIP / PAY-IN SLIP SUMMARY</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:10px; background:#f8fafc; padding:8px 10px; border:1px solid #cbd5e1; border-radius:4px;">' +
      '<div><strong>Deposit Account:</strong> ' + escHtml(bankFilter) + '</div>' +
      '<div><strong>Period / Date:</strong> ' + escHtml(dateRangeStr) + '</div>' +
      '<div><strong>Total Cheques:</strong> ' + rows.length + '</div>' +
      '<div><strong>Printed On:</strong> ' + todayISO() + '</div>' +
      '</div>' +
      '<table>' +
      '<thead>' +
      '<tr>' +
      '<th style="width:30px; text-align:center;">#</th>' +
      '<th style="width:75px; text-align:center;">DATE</th>' +
      '<th style="width:105px;">RECEIPT NO</th>' +
      '<th>MEMBER NAME</th>' +
      '<th style="width:65px; text-align:center;">FLAT</th>' +
      '<th style="width:85px; text-align:center;">CHEQUE NO</th>' +
      '<th style="width:115px;">DRAWEE BANK</th>' +
      '<th style="width:125px;">DEPOSIT ACC</th>' +
      '<th style="width:90px; text-align:right;">AMOUNT (₹)</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' + trs + '</tbody>' +
      '<tfoot>' +
      '<tr style="background:#f1f5f9; font-weight:bold;">' +
      '<td colspan="8" style="border:1px solid #94a3b8; padding:7px; text-align:right; font-size:11px;">TOTAL AMOUNT (₹):</td>' +
      '<td style="border:1px solid #94a3b8; padding:7px; text-align:right; font-size:12px; font-family:monospace; color:#1e3a8a;">₹' + totalAmt.toFixed(2) + '</td>' +
      '</tr>' +
      '</tfoot>' +
      '</table>' +
      '<div style="margin-top:8px; padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; font-size:11px;">' +
      '<strong>Amount in Words:</strong> ' + escHtml(inWords) +
      '</div>' +
      '<div style="margin-top:40px; display:flex; justify-content:space-between; text-align:center; font-size:11px; padding:0 20px;">' +
      '<div><div style="border-top:1px dashed #64748b; width:140px; margin-bottom:5px;"></div><strong>Prepared By</strong></div>' +
      '<div><div style="border-top:1px dashed #64748b; width:160px; margin-bottom:5px;"></div><strong>Hon. Treasurer / Secretary</strong></div>' +
      '<div><div style="border-top:1px dashed #64748b; width:150px; margin-bottom:5px;"></div><strong>Depositor\'s Signature</strong></div>' +
      '<div><div style="border-top:1px dashed #64748b; width:160px; margin-bottom:5px;"></div><strong>Bank Receiving Stamp & Sign</strong></div>' +
      '</div>' +
      '</body></html>';

    var printWin = window.open('', '_blank', 'width=950,height=750');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(printHtml);
      printWin.document.close();
      printWin.focus();
      setTimeout(function () {
        printWin.print();
      }, 350);
    } else {
      toast('Pop-up blocked. Please allow pop-ups to print bank slip.', false);
    }
  };

  window.exportBankSlipExcel = function () {
    var rows = window.currentBankSlipRecords || [];
    if (!rows || rows.length === 0) {
      toast('No cheque records found to export.', false);
      return;
    }

    if (typeof XLSX === 'undefined') {
      toast('Excel export library not available.', false);
      return;
    }

    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society');
    var bankFilter = (document.getElementById('bs-bank-filter') ? document.getElementById('bs-bank-filter').value.trim() : '') || 'All Deposit Accounts';
    var fromDate = (document.getElementById('bs-from-date') ? document.getElementById('bs-from-date').value.trim() : '');
    var toDate = (document.getElementById('bs-to-date') ? document.getElementById('bs-to-date').value.trim() : '');
    var dateStr = (fromDate && toDate) ? (fromDate + ' to ' + toDate) : (fromDate || toDate || todayISO());

    var wsData = [];
    wsData.push([socName.toUpperCase()]);
    wsData.push(['BANK DEPOSIT SLIP / CHEQUE SCHEDULE']);
    wsData.push(['Deposit Account: ' + bankFilter, '', 'Period: ' + dateStr, '', '', '', '', 'Generated: ' + todayISO()]);
    wsData.push([]);

    wsData.push(['SR NO', 'DATE', 'RECEIPT NO', 'MEMBER NAME', 'FLAT NO', 'CHEQUE NO', 'DRAWEE BANK', 'DEPOSIT ACCOUNT', 'AMOUNT (₹)', 'STATUS']);

    var totalAmt = 0;
    rows.forEach(function (c, idx) {
      var amt = parseFloat(c.amount) || 0;
      totalAmt += amt;
      wsData.push([
        idx + 1,
        c.receiptDate || '',
        c.receiptNo || c.voucherNo || '',
        c.memberName || c.personName || '',
        c.flatNo || c.wingFlat || '',
        c.chqNo || '',
        c.bankName || '',
        c.cashBank || '',
        amt,
        'Received'
      ]);
    });

    wsData.push(['', '', '', '', '', '', '', 'TOTAL AMOUNT:', totalAmt, rows.length + ' Cheques']);

    var ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 8 },
      { wch: 12 },
      { wch: 16 },
      { wch: 25 },
      { wch: 12 },
      { wch: 14 },
      { wch: 22 },
      { wch: 26 },
      { wch: 15 },
      { wch: 12 }
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bank Slip');

    var cleanBank = bankFilter.replace(/[^a-zA-Z0-9]/g, '_');
    var fileName = 'Bank_Deposit_Slip_' + cleanBank + '_' + todayISO() + '.xlsx';
    XLSX.writeFile(wb, fileName);
    toast('Bank slip exported to Excel successfully.', true);
  };

  window.openMultiDeleteModal = function () {
    document.getElementById('md-from').value = '';
    document.getElementById('md-to').value = '';
    document.getElementById('modal-multi-delete').style.display = 'flex';
  };

  window.runMultiDelete = async function () {
    var fromRaw = (document.getElementById('md-from').value || '').trim();
    var toRaw = (document.getElementById('md-to').value || '').trim();

    if (!fromRaw || !toRaw) {
      toast('Please enter both From and To receipt numbers.', false);
      return;
    }

    function parseSeq(val) {
      var m = (val || '').match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : NaN;
    }

    var fromNum = parseSeq(fromRaw);
    var toNum = parseSeq(toRaw);
    var hasNumRange = !isNaN(fromNum) && !isNaN(toNum);

    var fromLower = fromRaw.toLowerCase();
    var toLower = toRaw.toLowerCase();

    var targets = receipts.filter(function (r) {
      var no = (r.receiptNo || r.voucherNo || '').trim();
      if (!no) return false;
      var noLower = no.toLowerCase();

      if (hasNumRange) {
        var n = parseSeq(no);
        if (!isNaN(n)) {
          return n >= Math.min(fromNum, toNum) && n <= Math.max(fromNum, toNum);
        }
      }
      return (noLower >= fromLower && noLower <= toLower);
    });

    if (targets.length === 0) {
      toast('No receipts found in the specified range (' + fromRaw + ' to ' + toRaw + ').', false);
      return;
    }

    var ok = typeof showConfirm === 'function'
      ? await showConfirm('Are you sure you want to delete ' + targets.length + ' receipt(s) from ' + fromRaw + ' to ' + toRaw + '?', 'Confirm Multi Delete')
      : confirm('Are you sure you want to delete ' + targets.length + ' receipt(s) from ' + fromRaw + ' to ' + toRaw + '?');
    if (!ok) return;

    var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
    var deletedCount = 0;

    for (var i = 0; i < targets.length; i++) {
      var r = targets[i];
      var delId = r.voucherId || r.receiptId || r.receiptNo || r.voucherNo;
      try {
        var resp = await fetch(baseHost + '/api/member-receipts/' + encodeURIComponent(delId), {
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
          deletedCount++;
        }
      } catch (err) {
        console.error('Error deleting receipt ' + delId, err);
      }
    }

    try { localStorage.setItem('jeevika_receipt_sync', Date.now().toString()); } catch (e) {}
    closeModal('modal-multi-delete');
    toast('Successfully deleted ' + deletedCount + ' receipt(s).', true);
    await loadReceipts();
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
      idKey: 'receiptId',
      noKey: 'receiptNo'
    });

    if (updatedCount > 0) {
      persistReceiptsLocally(getActiveSocietyId(), receipts);
      closeModal('modal-multi-change');
      toast('Successfully updated ' + updatedCount + ' member receipt(s).', true);
      renderReceiptsTable();
    }
  };

  window.showList = function () {
    document.getElementById('mr-module-title').textContent = 'Member Receipt Entry';
    document.getElementById('mr-section-form').style.display = 'none';
    document.getElementById('mr-section-preview').style.display = 'none';
    document.getElementById('mr-section-cheque').style.display = 'none';
    document.getElementById('mr-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('mr-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  function closeAllToolbarDropdowns() {
    ['mr-export-menu', 'mr-template-menu', 'mr-other-menu', 'add-receipt-menu'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  window.toggleExportDropdown = function (evt) {
    if (evt) evt.stopPropagation();
    var menu = document.getElementById('mr-export-menu');
    if (!menu) return;
    var isShown = menu.style.display === 'block';
    closeAllToolbarDropdowns();
    if (!isShown) menu.style.display = 'block';
  };

  window.toggleTemplateDropdown = function (evt) {
    if (evt) evt.stopPropagation();
    var menu = document.getElementById('mr-template-menu');
    if (!menu) return;
    var isShown = menu.style.display === 'block';
    closeAllToolbarDropdowns();
    if (!isShown) menu.style.display = 'block';
  };

  window.toggleOtherDropdown = function (evt) {
    if (evt) evt.stopPropagation();
    var menu = document.getElementById('mr-other-menu');
    if (!menu) return;
    var isShown = menu.style.display === 'block';
    closeAllToolbarDropdowns();
    if (!isShown) menu.style.display = 'block';
  };

  window.applyFilters = function () { renderReceiptsTable(); };

  window.clearFilters = function () {
    ['flt-rcptno', 'flt-member', 'flt-chqno'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderReceiptsTable();
  };

  window.closeModal = function (id) {
    var modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  };

  function todayISO() {
    var d = new Date();
    return d.toISOString().split('T')[0];
  }

  function formatReceiptDate(d) {
    if (!d) return '';
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    var day = String(dt.getDate()).padStart(2, '0');
    var month = String(dt.getMonth() + 1).padStart(2, '0');
    var year = dt.getFullYear();
    return day + '-' + month + '-' + year;
  }

  function normalizeHeaderKey(str) {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, '')
      .trim();
  }

  function parseDateValue(val) {
    if (!val) return '';
    if (val instanceof Date) return formatReceiptDate(val);
    if (typeof val === 'number') {
      var d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return formatReceiptDate(d);
    }
    var str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      var parts = str.split('-');
      return parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(str)) {
      var segs = str.split(/[\/\-\.]/);
      var day = segs[0].padStart(2, '0');
      var mon = segs[1].padStart(2, '0');
      var yr  = segs[2];
      if (yr.length === 2) yr = '20' + yr;
      return day + '-' + mon + '-' + yr;
    }
    return str;
  }

  function getReceiptExportSchema() {
    return [
      { group: 'VOUCHER DETAILS', subGroup: 'VOUCHER DETAILS', label: 'Receipt No', key: 'receiptNo', width: 16, align: 'center' },
      { group: 'VOUCHER DETAILS', subGroup: 'VOUCHER DETAILS', label: 'Receipt Date (DD-MM-YYYY) *', key: 'receiptDate', width: 22, align: 'center' },
      { group: 'VOUCHER DETAILS', subGroup: 'VOUCHER DETAILS', label: 'Bill Type *', key: 'billType', width: 18, align: 'center' },
      { group: 'MEMBER DETAILS', subGroup: 'MEMBER DETAILS', label: 'Member Code', key: 'memberCode', width: 15, align: 'center' },
      { group: 'MEMBER DETAILS', subGroup: 'MEMBER DETAILS', label: 'Member Name *', key: 'memberName', width: 32, align: 'left' },
      { group: 'MEMBER DETAILS', subGroup: 'MEMBER DETAILS', label: 'Flat No', key: 'wingFlat', width: 12, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'ACCOUNTING', label: 'Debit Account Type *', key: 'debitAccountType', width: 18, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'ACCOUNTING', label: 'Deposit To Account *', key: 'depositToAccount', width: 30, align: 'left' },
      { group: 'BANKING & PAYMENT', subGroup: 'INSTRUMENT', label: 'Payment Mode *', key: 'transactionType', width: 16, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'INSTRUMENT', label: 'Cheque / Ref No', key: 'chqNo', width: 18, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'INSTRUMENT', label: 'Cheque Date', key: 'chqDate', width: 15, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'INSTRUMENT', label: 'Drawn On Bank', key: 'drawnOnBank', width: 20, align: 'left' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'AMOUNT', label: 'Received Amount (₹) *', key: 'amount', width: 18, type: 'number', align: 'right' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'ALLOCATION', label: 'Allocation Mode', key: 'allocationMode', width: 16, align: 'center' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'ALLOCATION', label: 'Principal Amount (₹)', key: 'principalAmount', width: 18, type: 'number', align: 'right' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'ALLOCATION', label: 'Interest Amount (₹)', key: 'interestAmount', width: 18, type: 'number', align: 'right' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'ALLOCATION', label: 'Against Bill / Invoice No', key: 'againstBillNo', width: 22, align: 'center' },
      { group: 'NARRATION & PARTICULARS', subGroup: 'NARRATION', label: 'Particulars 1 / Narration', key: 'particular1', width: 30, align: 'left' },
      { group: 'NARRATION & PARTICULARS', subGroup: 'NARRATION', label: 'Particulars 2 / Note', key: 'particular2', width: 24, align: 'left' }
    ];
  }

  function getReceiptImportTemplateSchema() {
    return [
      { group: 'VOUCHER DETAILS', subGroup: 'VOUCHER DETAILS', label: 'Receipt Date (DD-MM-YYYY) [Optional]', key: 'receiptDate', width: 24, align: 'center' },
      { group: 'VOUCHER DETAILS', subGroup: 'VOUCHER DETAILS', label: 'Bill Type *', key: 'billType', width: 18, align: 'center' },
      { group: 'MEMBER DETAILS', subGroup: 'MEMBER DETAILS', label: 'Member Code', key: 'memberCode', width: 15, align: 'center' },
      { group: 'MEMBER DETAILS', subGroup: 'MEMBER DETAILS', label: 'Member Name *', key: 'memberName', width: 32, align: 'left' },
      { group: 'MEMBER DETAILS', subGroup: 'MEMBER DETAILS', label: 'Flat No', key: 'wingFlat', width: 14, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'ACCOUNTING', label: 'Debit Account Type *', key: 'debitAccountType', width: 18, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'ACCOUNTING', label: 'Deposit To Account *', key: 'depositToAccount', width: 30, align: 'left' },
      { group: 'BANKING & PAYMENT', subGroup: 'INSTRUMENT', label: 'Payment Mode *', key: 'transactionType', width: 16, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'INSTRUMENT', label: 'Cheque / Ref No', key: 'chqNo', width: 18, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'INSTRUMENT', label: 'Cheque Date', key: 'chqDate', width: 15, align: 'center' },
      { group: 'BANKING & PAYMENT', subGroup: 'INSTRUMENT', label: 'Drawn On Bank', key: 'drawnOnBank', width: 20, align: 'left' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'AMOUNT', label: 'Received Amount (₹) *', key: 'amount', width: 18, type: 'number', align: 'right' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'ALLOCATION', label: 'Allocation Mode', key: 'allocationMode', width: 16, align: 'center' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'ALLOCATION', label: 'Principal Amount (₹)', key: 'principalAmount', width: 18, type: 'number', align: 'right' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'ALLOCATION', label: 'Interest Amount (₹)', key: 'interestAmount', width: 18, type: 'number', align: 'right' },
      { group: 'AMOUNT & ALLOCATION', subGroup: 'ALLOCATION', label: 'Against Bill / Invoice No', key: 'againstBillNo', width: 22, align: 'center' },
      { group: 'NARRATION & PARTICULARS', subGroup: 'NARRATION', label: 'Particulars 1 / Narration', key: 'particular1', width: 30, align: 'left' },
      { group: 'NARRATION & PARTICULARS', subGroup: 'NARRATION', label: 'Particulars 2 / Note', key: 'particular2', width: 24, align: 'left' }
    ];
  }

  async function fetchReceiptTemplateMeta() {
    var sid = getActiveSocietyId();
    var meta = await fetchApiData('/api/member-receipts/template-meta?societyId=' + sid);
    if (meta && meta.success && meta.members) {
      meta.members = meta.members.map(function (m) {
        return {
          memberId: m.memberId || m.socMemId,
          memCode: m.memCode || '',
          memName: m.memName || '',
          flatNo: m.flatNo || '',
          label: m.label || ('[' + (m.memCode || '') + '] ' + (m.memName || '')),
          netDue: parseFloat(m.netDue) || 0,
          principalDue: parseFloat(m.principalDue) || 0,
          interestDue: parseFloat(m.interestDue) || 0
        };
      });
      return meta;
    }

    return {
      success: true,
      billTypes: billTypes.map(function (bt) { return { billTypeId: bt.billTypeId || bt.id, billTypeName: bt.billTypeName || bt.name }; }),
      members: members.map(function (m) {
        var flatStr = m.wing ? (m.wing + '-' + (m.flatNo || m.flat)) : (m.flatNo || m.flat || '');
        return {
          memberId: m.memberId || m.socMemId,
          memCode: m.memCode || '',
          memName: m.memName || '',
          flatNo: flatStr,
          label: '[' + (m.memCode || '') + '] ' + (m.memName || '') + (flatStr ? ' (' + flatStr + ')' : ''),
          netDue: 0,
          principalDue: 0,
          interestDue: 0
        };
      }),
      cashAccounts: accounts.filter(function (a) { return (a.accCode === 'ASS-1001' || (a.accName || '').toLowerCase().includes('cash')); }),
      bankAccounts: accounts.filter(function (a) { return !(a.accCode === 'ASS-1001' || (a.accName || '').toLowerCase().includes('cash')); }),
      allDepositAccounts: accounts,
      transactionTypes: ['Cheque', 'NEFT', 'UPI', 'IMPS', 'IB [Internal Bank Transfer]', 'RTGS', 'Cash'],
      allocationModes: ['AUTO', 'MANUAL']
    };
  }

  // ── TEMPLATE GENERATION (Blank & With Members) ─────────────────
  window.downloadReceiptTemplate = async function (withMembers) {
    closeAllToolbarDropdowns();
    var meta = await fetchReceiptTemplateMeta();
    var schema = getReceiptImportTemplateSchema();

    if (typeof XLSX === 'undefined' || !XLSX.utils) {
      toast('Excel generation library is loading, please wait...', false);
      return;
    }

    var wsData = [
      [], // Row 0: Group Headers
      [], // Row 1: Sub-Group Headers
      []  // Row 2: Leaf Headers
    ];

    schema.forEach(function (c) {
      wsData[0].push(c.group);
      wsData[1].push(c.subGroup || c.group);
      wsData[2].push(c.label);
    });

    var todayStr = formatReceiptDate(new Date());
    var defaultBType = (activeBillType && activeBillType !== 'ALL') ? activeBillType : (meta.billTypes[0] ? meta.billTypes[0].billTypeName : 'Maintenance');
    var defaultBankAcc = (meta.bankAccounts && meta.bankAccounts[0]) ? meta.bankAccounts[0].label : (meta.allDepositAccounts[0] ? meta.allDepositAccounts[0].label : '[ASS-1001] Cash in Hand');
    var memberRowsCount = (meta.members || []).length;
    var listMax = Math.max(memberRowsCount + 1, 2);

    if (withMembers && meta.members && meta.members.length > 0) {
      meta.members.forEach(function (m) {
        var excelRowNum = wsData.length + 1;
        var fMemName = 'IFERROR(INDEX(Lists!$C$2:$C$' + listMax + ', MATCH(C' + excelRowNum + ', Lists!$B$2:$B$' + listMax + ', 0)), "' + (m.memName || '') + '")';
        var fFlat = 'IFERROR(INDEX(Lists!$D$2:$D$' + listMax + ', MATCH(C' + excelRowNum + ', Lists!$B$2:$B$' + listMax + ', 0)), IFERROR(INDEX(Lists!$D$2:$D$' + listMax + ', MATCH(D' + excelRowNum + ', Lists!$C$2:$C$' + listMax + ', 0)), "' + (m.flatNo || '') + '"))';
        var fAmt = 'IFERROR(INDEX(Lists!$J$2:$J$' + listMax + ', MATCH(C' + excelRowNum + ', Lists!$B$2:$B$' + listMax + ', 0)), IFERROR(INDEX(Lists!$J$2:$J$' + listMax + ', MATCH(D' + excelRowNum + ', Lists!$C$2:$C$' + listMax + ', 0)), ' + (m.netDue || 0) + '))';
        var fIntLookup = 'IFERROR(INDEX(Lists!$L$2:$L$' + listMax + ', MATCH(C' + excelRowNum + ', Lists!$B$2:$B$' + listMax + ', 0)), IFERROR(INDEX(Lists!$L$2:$L$' + listMax + ', MATCH(D' + excelRowNum + ', Lists!$C$2:$C$' + listMax + ', 0)), 0))';
        var fInt = 'IFERROR(IF(L' + excelRowNum + '>0, MIN(L' + excelRowNum + ', MAX(0, ' + fIntLookup + ')), 0), 0)';
        var fPrin = 'IFERROR(IF(L' + excelRowNum + '>0, MAX(0, L' + excelRowNum + ' - O' + excelRowNum + '), 0), 0)';

        var mNet = m.netDue || 0;
        var mIntDue = m.interestDue || 0;
        var initInt = (mNet > 0 && mIntDue > 0) ? Math.min(mNet, mIntDue) : 0;
        var initPrin = Math.max(0, mNet - initInt);

        wsData.push([
          todayStr, // Receipt Date (DD-MM-YYYY) [Optional]
          defaultBType, // Bill Type
          m.memCode || '', // Member Code
          { f: fMemName, v: m.memName || '' }, // Member Name (Auto-resolved from Code)
          { f: fFlat, v: m.flatNo || '' }, // Flat No (Auto-resolved)
          'BANK', // Debit Account Type
          defaultBankAcc, // Deposit To Account
          'Cheque', // Payment Mode
          '', // Cheque / Ref No
          '', // Cheque Date
          '', // Drawn On Bank
          { f: fAmt, v: mNet }, // Received Amount (Auto-filled with Member Due)
          'AUTO', // Allocation Mode
          { f: fPrin, v: initPrin }, // Principal Amount (Auto-split)
          { f: fInt, v: initInt }, // Interest Amount (Auto-split)
          '', // Against Bill No
          defaultBType + ' Receipt', // Particulars 1
          ''  // Particulars 2
        ]);
      });
    } else {
      // Blank Template: Provide 20 blank entry rows with formulas and defaults
      for (var b = 0; b < 20; b++) {
        var excelRowNum = wsData.length + 1;
        var fMemName = 'IFERROR(INDEX(Lists!$C$2:$C$' + listMax + ', MATCH(C' + excelRowNum + ', Lists!$B$2:$B$' + listMax + ', 0)), "")';
        var fFlat = 'IFERROR(INDEX(Lists!$D$2:$D$' + listMax + ', MATCH(C' + excelRowNum + ', Lists!$B$2:$B$' + listMax + ', 0)), IFERROR(INDEX(Lists!$D$2:$D$' + listMax + ', MATCH(D' + excelRowNum + ', Lists!$C$2:$C$' + listMax + ', 0)), ""))';
        var fAmt = 'IFERROR(INDEX(Lists!$J$2:$J$' + listMax + ', MATCH(C' + excelRowNum + ', Lists!$B$2:$B$' + listMax + ', 0)), IFERROR(INDEX(Lists!$J$2:$J$' + listMax + ', MATCH(D' + excelRowNum + ', Lists!$C$2:$C$' + listMax + ', 0)), 0))';
        var fIntLookup = 'IFERROR(INDEX(Lists!$L$2:$L$' + listMax + ', MATCH(C' + excelRowNum + ', Lists!$B$2:$B$' + listMax + ', 0)), IFERROR(INDEX(Lists!$L$2:$L$' + listMax + ', MATCH(D' + excelRowNum + ', Lists!$C$2:$C$' + listMax + ', 0)), 0))';
        var fInt = 'IFERROR(IF(L' + excelRowNum + '>0, MIN(L' + excelRowNum + ', MAX(0, ' + fIntLookup + ')), 0), 0)';
        var fPrin = 'IFERROR(IF(L' + excelRowNum + '>0, MAX(0, L' + excelRowNum + ' - O' + excelRowNum + '), 0), 0)';

        wsData.push([
          '', // Receipt Date (blank = today)
          defaultBType, // Bill Type
          '', // Member Code
          { f: fMemName, v: '' }, // Member Name (Auto-resolved from Code)
          { f: fFlat, v: '' }, // Flat No (Auto-resolved)
          'BANK', // Debit Account Type
          defaultBankAcc, // Deposit To Account
          'Cheque', // Payment Mode
          '', // Cheque / Ref No
          '', // Cheque Date
          '', // Drawn On Bank
          { f: fAmt, v: 0 }, // Received Amount (Auto-pulled from Member Due)
          'AUTO', // Allocation Mode
          { f: fPrin, v: 0 }, // Principal Amount (Auto-split)
          { f: fInt, v: 0 }, // Interest Amount (Auto-split)
          '', // Against Bill No
          defaultBType + ' Receipt', // Particulars 1
          ''  // Particulars 2
        ]);
      }
    }

    var ws = XLSX.utils.aoa_to_sheet(wsData);

    var borderAll = {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } }
    };

    var topHdrStyle = {
      fill: { fgColor: { rgb: '535FC1' } },
      font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: borderAll
    };
    var subHdrStyle = {
      fill: { fgColor: { rgb: '4852A8' } },
      font: { name: 'Arial', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: borderAll
    };
    var leafHdrStyle = {
      fill: { fgColor: { rgb: '3E4691' } },
      font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: borderAll
    };

    // Calculate Merges for 3-tier headers
    var merges = [];
    var colIdx = 0;
    while (colIdx < schema.length) {
      var grp = schema[colIdx].group;
      var endCol = colIdx;
      while (endCol + 1 < schema.length && schema[endCol + 1].group === grp) {
        endCol++;
      }
      merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: endCol } });

      var subCol = colIdx;
      while (subCol <= endCol) {
        var subGrp = schema[subCol].subGroup;
        var endSubCol = subCol;
        while (endSubCol + 1 <= endCol && schema[endSubCol + 1].subGroup === subGrp) {
          endSubCol++;
        }
        if (endSubCol >= subCol) {
          merges.push({ s: { r: 1, c: subCol }, e: { r: 1, c: endSubCol } });
        }
        subCol = endSubCol + 1;
      }
      colIdx = endCol + 1;
    }
    ws['!merges'] = merges;

    // Apply Header Cell Styles
    schema.forEach(function (c, cIdx) {
      var c0 = XLSX.utils.encode_cell({ r: 0, c: cIdx });
      var c1 = XLSX.utils.encode_cell({ r: 1, c: cIdx });
      var c2 = XLSX.utils.encode_cell({ r: 2, c: cIdx });

      if (ws[c0]) ws[c0].s = topHdrStyle;
      if (ws[c1]) ws[c1].s = subHdrStyle;
      if (ws[c2]) ws[c2].s = leafHdrStyle;
    });

    // Apply Data Cell Styles
    var rowCount = wsData.length;
    for (var r = 3; r < rowCount; r++) {
      schema.forEach(function (c, cIdx) {
        var cellRef = XLSX.utils.encode_cell({ r: r, c: cIdx });
        if (!ws[cellRef]) ws[cellRef] = { t: (c.type === 'number' ? 'n' : 's'), v: '' };
        var isNum = c.type === 'number';
        ws[cellRef].s = {
          font: { name: 'Arial', sz: 10, color: { rgb: '1E293B' } },
          alignment: { horizontal: c.align || (isNum ? 'right' : 'left'), vertical: 'center' },
          border: borderAll
        };
        if (isNum) ws[cellRef].z = '#,##0.00';
      });
    }

    ws['!cols'] = schema.map(function (c) { return { wch: c.width || 15 }; });
    ws['!rows'] = [{ hpt: 26 }, { hpt: 22 }, { hpt: 24 }];
    ws['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 3, topLeftCell: 'C4', activeCell: 'C4' }];

    // Hidden Lists Sheet for Data Validation Dropdowns & Dynamic Lookups
    var listBillTypes = (meta.billTypes || []).map(function (b) { return b.billTypeName; });
    var listMembers   = meta.members || [];
    var listDebit     = ['CASH', 'BANK'];
    var listAccounts  = (meta.allDepositAccounts || []).map(function (a) { return a.label || a.accName; });
    var listTxnTypes  = meta.transactionTypes || ['Cheque', 'NEFT', 'UPI', 'IMPS', 'IB [Internal Bank Transfer]', 'RTGS', 'Cash'];
    var listAlloc     = meta.allocationModes || ['AUTO', 'MANUAL'];

    var maxLen = Math.max(listBillTypes.length, memberRowsCount, listDebit.length, listAccounts.length, listTxnTypes.length, listAlloc.length, 1);
    var wsListsData = [['BILL TYPES', 'MEMBER CODE', 'MEMBER NAME', 'FLAT NO', 'MEMBER ID', 'DEBIT TYPES', 'DEPOSIT ACCOUNTS', 'PAYMENT MODES', 'ALLOCATION MODES', 'NET DUE', 'PRINCIPAL DUE', 'INTEREST DUE']];
    for (var i = 0; i < maxLen; i++) {
      var mItem = listMembers[i] || {};
      wsListsData.push([
        listBillTypes[i] || '',
        mItem.memCode || '',
        mItem.memName || '',
        mItem.flatNo || '',
        mItem.memberId || '',
        listDebit[i] || '',
        listAccounts[i] || '',
        listTxnTypes[i] || '',
        listAlloc[i] || '',
        mItem.netDue !== undefined ? mItem.netDue : 0,
        mItem.principalDue !== undefined ? mItem.principalDue : 0,
        mItem.interestDue !== undefined ? mItem.interestDue : 0
      ]);
    }

    var wsLists = XLSX.utils.aoa_to_sheet(wsListsData);
    wsLists['!state'] = 'hidden';

    var maxDataRows = Math.max(rowCount + 500, 1000);
    ws['!dataValidations'] = [
      {
        type: 'list',
        allowBlank: false,
        sqref: 'B4:B' + maxDataRows,
        formula1: 'Lists!$A$2:$A$' + (listBillTypes.length + 1)
      },
      {
        type: 'list',
        allowBlank: true,
        sqref: 'C4:C' + maxDataRows,
        formula1: 'Lists!$B$2:$B$' + listMax
      },
      {
        type: 'list',
        allowBlank: true,
        sqref: 'D4:D' + maxDataRows,
        formula1: 'Lists!$C$2:$C$' + listMax
      },
      {
        type: 'list',
        allowBlank: true,
        sqref: 'F4:F' + maxDataRows,
        formula1: 'Lists!$F$2:$F$3'
      },
      {
        type: 'list',
        allowBlank: true,
        sqref: 'G4:G' + maxDataRows,
        formula1: 'Lists!$G$2:$G$' + (listAccounts.length + 1)
      },
      {
        type: 'list',
        allowBlank: true,
        sqref: 'H4:H' + maxDataRows,
        formula1: 'Lists!$H$2:$H$' + (listTxnTypes.length + 1)
      },
      {
        type: 'list',
        allowBlank: true,
        sqref: 'M4:M' + maxDataRows,
        formula1: 'Lists!$I$2:$I$3'
      }
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Receipt_Entry');
    XLSX.utils.book_append_sheet(wb, wsLists, 'Lists');

    var fileName = withMembers ? 'Member_Receipt_Template_With_Members.xlsx' : 'Member_Receipt_Blank_Template.xlsx';
    XLSX.writeFile(wb, fileName);
    toast('Downloaded ' + (withMembers ? 'Template with Members' : 'Blank Template') + ' successfully.', true);
  };

  // ── EXPORT RECEIPTS (XLSX, CSV, XLS) ───────────────────────────
  window.exportReceipts = async function (format) {
    format = (format || 'xlsx').toLowerCase();
    closeAllToolbarDropdowns();

    var sid = getActiveSocietyId();
    var res = await fetchApiData('/api/member-receipts/export-data?societyId=' + sid);
    var exportRows = (res && res.data && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);

    if (exportRows.length === 0) {
      toast('No receipts found to export.', false);
      return;
    }

    var schema = getReceiptExportSchema();
    var todayStr = todayISO();

    // 1. XLSX Format (with 3-tier header, totals, styles)
    if (format === 'xlsx' && typeof XLSX !== 'undefined') {
      var wsData = [[], [], []];
      schema.forEach(function (c) {
        wsData[0].push(c.group);
        wsData[1].push(c.subGroup || c.group);
        wsData[2].push(c.label);
      });

      var sumAmount = 0;
      var sumPrin = 0;
      var sumInt = 0;

      exportRows.forEach(function (r) {
        var amt = parseFloat(r.amount || 0);
        var prin = parseFloat(r.principalAmount || 0);
        var intr = parseFloat(r.interestAmount || 0);
        sumAmount += amt;
        sumPrin += prin;
        sumInt += intr;

        wsData.push([
          r.receiptNo || '',
          r.receiptDate || '',
          r.billType || '',
          r.memberCode || '',
          r.memberName || '',
          r.wingFlat || '',
          r.debitAccountType || '',
          r.depositToAccount || '',
          r.transactionType || '',
          r.chqNo || '',
          r.chqDate || '',
          r.drawnOnBank || '',
          amt,
          r.allocationMode || 'AUTO',
          prin,
          intr,
          r.againstBillNo || '',
          r.particular1 || '',
          r.particular2 || ''
        ]);
      });

      // Append TOTALS Row
      var totalRow = new Array(schema.length).fill('');
      totalRow[0] = 'TOTAL (' + exportRows.length + ' Receipts)';
      totalRow[12] = Math.round(sumAmount * 100) / 100;
      totalRow[14] = Math.round(sumPrin * 100) / 100;
      totalRow[15] = Math.round(sumInt * 100) / 100;
      wsData.push(totalRow);

      var ws = XLSX.utils.aoa_to_sheet(wsData);

      var borderAll = {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } }
      };

      var topHdrStyle = {
        fill: { fgColor: { rgb: '535FC1' } },
        font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: borderAll
      };
      var subHdrStyle = {
        fill: { fgColor: { rgb: '4852A8' } },
        font: { name: 'Arial', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: borderAll
      };
      var leafHdrStyle = {
        fill: { fgColor: { rgb: '3E4691' } },
        font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: borderAll
      };

      // Merges for header
      var merges = [];
      var colIdx = 0;
      while (colIdx < schema.length) {
        var grp = schema[colIdx].group;
        var endCol = colIdx;
        while (endCol + 1 < schema.length && schema[endCol + 1].group === grp) {
          endCol++;
        }
        merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: endCol } });

        var subCol = colIdx;
        while (subCol <= endCol) {
          var subGrp = schema[subCol].subGroup;
          var endSubCol = subCol;
          while (endSubCol + 1 <= endCol && schema[endSubCol + 1].subGroup === subGrp) {
            endSubCol++;
          }
          if (endSubCol >= subCol) {
            merges.push({ s: { r: 1, c: subCol }, e: { r: 1, c: endSubCol } });
          }
          subCol = endSubCol + 1;
        }
        colIdx = endCol + 1;
      }

      // Merge cols 0 to 11 in TOTAL row
      var totalRowIdx = wsData.length - 1;
      merges.push({ s: { r: totalRowIdx, c: 0 }, e: { r: totalRowIdx, c: 11 } });
      ws['!merges'] = merges;

      // Header styles
      schema.forEach(function (c, cIdx) {
        var c0 = XLSX.utils.encode_cell({ r: 0, c: cIdx });
        var c1 = XLSX.utils.encode_cell({ r: 1, c: cIdx });
        var c2 = XLSX.utils.encode_cell({ r: 2, c: cIdx });
        if (ws[c0]) ws[c0].s = topHdrStyle;
        if (ws[c1]) ws[c1].s = subHdrStyle;
        if (ws[c2]) ws[c2].s = leafHdrStyle;
      });

      // Data cell styles
      for (var r = 3; r < totalRowIdx; r++) {
        schema.forEach(function (c, cIdx) {
          var cellRef = XLSX.utils.encode_cell({ r: r, c: cIdx });
          if (ws[cellRef]) {
            var isNum = c.type === 'number';
            ws[cellRef].s = {
              font: { name: 'Arial', sz: 10, color: { rgb: '1E293B' } },
              alignment: { horizontal: c.align || (isNum ? 'right' : 'left'), vertical: 'center' },
              border: borderAll
            };
            if (isNum) ws[cellRef].z = '#,##0.00';
          }
        });
      }

      // Total row styling
      var totalStyle = {
        fill: { fgColor: { rgb: 'E8EAF6' } },
        font: { name: 'Arial', sz: 10.5, bold: true, color: { rgb: '1A237E' } },
        alignment: { vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '535FC1' } },
          bottom: { style: 'double', color: { rgb: '535FC1' } },
          left: { style: 'thin', color: { rgb: 'CBD5E1' } },
          right: { style: 'thin', color: { rgb: 'CBD5E1' } }
        }
      };

      for (var col = 0; col < schema.length; col++) {
        var tRef = XLSX.utils.encode_cell({ r: totalRowIdx, c: col });
        if (!ws[tRef]) ws[tRef] = { t: 's', v: '' };
        var isNumCol = (col === 12 || col === 14 || col === 15);
        ws[tRef].s = Object.assign({}, totalStyle, {
          alignment: { horizontal: (isNumCol ? 'right' : (col === 0 ? 'left' : 'center')), vertical: 'center' }
        });
        if (isNumCol) ws[tRef].z = '#,##0.00';
      }

      ws['!cols'] = schema.map(function (c) { return { wch: c.width || 15 }; });
      ws['!rows'] = [{ hpt: 26 }, { hpt: 22 }, { hpt: 24 }];
      ws['!views'] = [{ state: 'frozen', xSplit: 2, ySplit: 3, topLeftCell: 'C4', activeCell: 'C4' }];

      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'MemberReceipts');
      XLSX.writeFile(wb, 'Member_Receipts_Export_' + todayStr + '.xlsx');
      toast('Exported ' + exportRows.length + ' receipts to Excel successfully.', true);
      return;
    }

    // 2. CSV Format
    if (format === 'csv') {
      var csvHeader = schema.map(function (c) { return '"' + c.label.replace(/"/g, '""') + '"'; }).join(',') + '\n';
      var csvLines = exportRows.map(function (r) {
        return [
          r.receiptNo || '',
          r.receiptDate || '',
          r.billType || '',
          r.memberCode || '',
          r.memberName || '',
          r.wingFlat || '',
          r.debitAccountType || '',
          r.depositToAccount || '',
          r.transactionType || '',
          r.chqNo || '',
          r.chqDate || '',
          r.drawnOnBank || '',
          r.amount || 0,
          r.allocationMode || 'AUTO',
          r.principalAmount || 0,
          r.interestAmount || 0,
          r.againstBillNo || '',
          r.particular1 || '',
          r.particular2 || ''
        ].map(function (val) {
          if (typeof val === 'number') return val;
          return '"' + String(val || '').replace(/"/g, '""') + '"';
        }).join(',');
      }).join('\n');

      var blob = new Blob([csvHeader + csvLines], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'Member_Receipts_Export_' + todayStr + '.csv';
      link.click();
      toast('Exported ' + exportRows.length + ' receipts to CSV successfully.', true);
      return;
    }

    // 3. XLS Format (HTML Table)
    if (format === 'xls') {
      var leafThs = schema.map(function (c) {
        return '<th style="background:#3E4691;color:#fff;padding:6px;border:1px solid #cbd5e1;">' + escHtml(c.label) + '</th>';
      }).join('');

      var rowsHtml = exportRows.map(function (r) {
        return '<tr>' + [
          r.receiptNo || '', r.receiptDate || '', r.billType || '', r.memberCode || '',
          r.memberName || '', r.wingFlat || '', r.debitAccountType || '', r.depositToAccount || '',
          r.transactionType || '', r.chqNo || '', r.chqDate || '', r.drawnOnBank || '',
          r.amount || 0, r.allocationMode || 'AUTO', r.principalAmount || 0, r.interestAmount || 0,
          r.againstBillNo || '', r.particular1 || '', r.particular2 || ''
        ].map(function (v) {
          return '<td style="padding:4px;border:1px solid #cbd5e1;">' + escHtml(v) + '</td>';
        }).join('') + '</tr>';
      }).join('');

      var xlsHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>' + leafThs + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></body></html>';

      var xlsBlob = new Blob([xlsHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      var xlsLink = document.createElement('a');
      xlsLink.href = URL.createObjectURL(xlsBlob);
      xlsLink.download = 'Member_Receipts_Export_' + todayStr + '.xls';
      xlsLink.click();
      toast('Exported ' + exportRows.length + ' receipts to XLS successfully.', true);
    }
  };

  // ── BULK IMPORT SYSTEM (Upload, Validate, Preview, Execute) ────
  var currentValidatedReceiptRows = [];

  window.openReceiptBulkImportModal = function () {
    closeAllToolbarDropdowns();
    resetReceiptImportUpload();
    var modal = document.getElementById('modal-receipt-bulk-import');
    if (modal) modal.style.display = 'flex';
  };

  window.resetReceiptImportUpload = function () {
    var fileInp = document.getElementById('mr-import-file-input');
    if (fileInp) fileInp.value = '';

    var uploadZone = document.getElementById('mr-import-upload-zone');
    var previewZone = document.getElementById('mr-import-preview-zone');
    var btnReset = document.getElementById('btn-import-reset');
    var btnConfirm = document.getElementById('btn-import-confirm');

    if (uploadZone) uploadZone.style.display = 'block';
    if (previewZone) previewZone.style.display = 'none';
    if (btnReset) btnReset.style.display = 'none';
    if (btnConfirm) btnConfirm.style.display = 'none';

    var tbody = document.getElementById('mr-import-preview-tbody');
    if (tbody) tbody.innerHTML = '';
    currentValidatedReceiptRows = [];
  };

  window.handleReceiptImportFileSelected = function (inp) {
    if (!inp || !inp.files || !inp.files[0]) return;
    handleReceiptImportFile(inp.files[0]);
  };

  async function handleReceiptImportFile(file) {
    if (!file) return;

    var fnameEl = document.getElementById('mr-import-filename');
    if (fnameEl) fnameEl.textContent = file.name;

    var reader = new FileReader();
    reader.onload = async function (e) {
      try {
        var rawData = e.target.result;
        var allRows = [];

        if (typeof XLSX !== 'undefined') {
          var wb = XLSX.read(rawData, { type: 'array', cellDates: true, raw: false });
          var sheetName = wb.SheetNames[0];
          allRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
        } else {
          var text = new TextDecoder('utf-8').decode(rawData);
          allRows = text.split(/\r?\n/).map(function (line) {
            return line.split(',').map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
          });
        }

        if (!allRows || allRows.length < 2) {
          toast('The uploaded file does not contain enough data rows.', false);
          return;
        }

        // Detect header row (support 1-tier, 2-tier, or 3-tier headers)
        var headerRowIdx = 0;
        var dataStartRowIdx = 1;

        var bestScore = -1;
        var searchRowsLimit = Math.min(allRows.length, 5);
        for (var ri = 0; ri < searchRowsLimit; ri++) {
          var rowCells = allRows[ri] || [];
          var score = 0;
          rowCells.forEach(function (c) {
            var norm = normalizeHeaderKey(c);
            if (norm === 'membercode' || norm === 'membername' || norm === 'amount' || norm === 'receivedamount' ||
                norm === 'billtype' || norm === 'debitaccounttype' || norm === 'deposittoaccount' || norm === 'paymentmode' ||
                norm.indexOf('receiptdate') === 0 || norm.indexOf('principalamount') === 0 || norm.indexOf('interestamount') === 0) {
              score += 2;
            } else if (norm.includes('member') || norm.includes('amount') || norm.includes('receipt') || norm.includes('chq') || norm.includes('bank')) {
              score += 1;
            }
          });
          if (score > bestScore && score >= 2) {
            bestScore = score;
            headerRowIdx = ri;
            dataStartRowIdx = ri + 1;
          }
        }

        var headers = allRows[headerRowIdx] || [];
        var colMap = {};
        headers.forEach(function (h, idx) {
          var norm = normalizeHeaderKey(h);
          if (norm) colMap[norm] = idx;
        });

        function getColVal(row, keyNames) {
          for (var i = 0; i < keyNames.length; i++) {
            var k = keyNames[i];
            if (colMap[k] !== undefined && row[colMap[k]] !== undefined) {
              return row[colMap[k]];
            }
          }
          return '';
        }

        var parsedRows = [];
        for (var r = dataStartRowIdx; r < allRows.length; r++) {
          var row = allRows[r];
          if (!row || row.length === 0) continue;

          var rowStr = row.map(function (c) { return String(c || '').trim(); }).join('');
          if (!rowStr) continue;

          var firstCell = String(row[0] || '').trim().toUpperCase();
          if (firstCell.startsWith('TOTAL')) continue;

          var rcptNo   = String(getColVal(row, ['receiptno', 'rcptno', 'voucherno', 'receiptnum'])).trim();
          var rcptDate = parseDateValue(getColVal(row, ['receiptdate', 'date', 'rcptdate', 'voucherdate', 'receiptdateddmmyyyyoptional', 'receiptdateoptional']));
          var bType    = String(getColVal(row, ['billtype', 'billtypename', 'type'])).trim();
          var mCode    = String(getColVal(row, ['membercode', 'memcode', 'code'])).trim();
          var mName    = String(getColVal(row, ['membername', 'member', 'person', 'personname', 'memname'])).trim();
          var wFlat    = String(getColVal(row, ['flatno', 'flat', 'wingflat', 'unitno', 'unit'])).trim();
          var debType  = String(getColVal(row, ['debitaccounttype', 'debittype', 'debitaccount', 'accounttype'])).trim();
          var depAcc   = String(getColVal(row, ['deposittoaccount', 'depositaccount', 'bankcashaccount', 'account'])).trim();
          var txnType  = String(getColVal(row, ['paymentmode', 'transactiontype', 'mode', 'paymode'])).trim();
          var chqNo    = String(getColVal(row, ['chequerefno', 'chequeno', 'chqno', 'refno', 'instrumentno'])).trim();
          var chqDate  = parseDateValue(getColVal(row, ['chequedate', 'chqdate', 'instrumentdate']));
          var bankName = String(getColVal(row, ['drawnonbank', 'bankname', 'drawnon', 'bank'])).trim();
          
          var rawAmt   = getColVal(row, ['receivedamount', 'amount', 'receivedamt', 'rcptamount', 'amt']);
          var amtNum   = parseFloat(String(rawAmt).replace(/,/g, '')) || 0;

          var allocMode = String(getColVal(row, ['allocationmode', 'mode'])).trim().toUpperCase();
          if (!allocMode) allocMode = 'AUTO';

          var rawPrin  = getColVal(row, ['principalamount', 'principal', 'prinamt']);
          var prinNum  = rawPrin !== '' ? (parseFloat(String(rawPrin).replace(/,/g, '')) || 0) : null;

          var rawInt   = getColVal(row, ['interestamount', 'interest', 'intamt']);
          var intNum   = rawInt !== '' ? (parseFloat(String(rawInt).replace(/,/g, '')) || 0) : null;

          var agstBill = String(getColVal(row, ['againstbillinvoiceno', 'againstbillno', 'againstbill', 'billno', 'invoiceno'])).trim();
          var part1    = String(getColVal(row, ['particulars1narration', 'particulars1', 'particular1', 'narration'])).trim();
          var part2    = String(getColVal(row, ['particulars2note', 'particulars2', 'particular2', 'note'])).trim();

          // A row is parsed if it specifies Member Code, Member Name, or Flat No
          if (!mCode && !mName && !wFlat) continue;

          parsedRows.push({
            rowIndex: r + 1,
            receiptNo: rcptNo,
            receiptDate: rcptDate,
            billType: bType,
            memberCode: mCode,
            memberName: mName,
            wingFlat: wFlat,
            debitAccountType: debType,
            depositToAccount: depAcc,
            transactionType: txnType,
            chqNo: chqNo,
            chqDate: chqDate,
            drawnOnBank: bankName,
            amount: amtNum,
            allocationMode: allocMode,
            principalAmount: prinNum,
            interestAmount: intNum,
            againstBillNo: agstBill,
            particular1: part1,
            particular2: part2
          });
        }

        if (parsedRows.length === 0) {
          toast('No valid receipt data rows found in the uploaded file.', false);
          return;
        }

        // Validate via backend
        var sid = getActiveSocietyId();
        var fyid = getFyId();
        var baseHost = getApiBaseHost();
        var resp = await fetch(baseHost + '/api/member-receipts/validate-bulk', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ societyId: parseInt(sid), fyId: parseInt(fyid), rows: parsedRows })
        });

        if (!resp.ok) {
          var errJson = await resp.json().catch(function () { return {}; });
          toast(errJson.message || 'Validation request failed with status ' + resp.status, false);
          return;
        }

        var valResult = await resp.json();
        currentValidatedReceiptRows = valResult.rows || [];
        renderValidationPreview(valResult);

      } catch (err) {
        console.error('File import error:', err);
        toast('Error processing file: ' + err.message, false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderValidationPreview(result) {
    var uploadZone = document.getElementById('mr-import-upload-zone');
    var previewZone = document.getElementById('mr-import-preview-zone');
    var btnReset = document.getElementById('btn-import-reset');
    var btnConfirm = document.getElementById('btn-import-confirm');

    if (uploadZone) uploadZone.style.display = 'none';
    if (previewZone) previewZone.style.display = 'flex';
    if (btnReset) btnReset.style.display = 'inline-flex';

    var totalRows = result.totalRows || 0;
    var validRows = result.validRows || 0;
    var errorRows = result.errorRows || 0;

    var bTotal = document.getElementById('mr-import-badge-total');
    var bValid = document.getElementById('mr-import-badge-valid');
    var bError = document.getElementById('mr-import-badge-error');
    var sAmt   = document.getElementById('mr-import-sum-amount');

    if (bTotal) bTotal.textContent = totalRows + ' Total Rows';
    if (bValid) bValid.textContent = validRows + ' Valid';
    if (bError) bError.textContent = errorRows + ' Errors';

    var totalSum = 0;
    (result.rows || []).forEach(function (r) {
      if (r.isValid) totalSum += (r.amount || 0);
    });
    if (sAmt) sAmt.textContent = '₹' + totalSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var tbody = document.getElementById('mr-import-preview-tbody');
    if (!tbody) return;

    var html = '';
    (result.rows || []).forEach(function (r) {
      var rowStatusHtml = r.isValid
        ? '<span style="background:#dcfce7; color:#15803d; font-size:10px; font-weight:800; padding:2px 8px; border-radius:10px;">VALID</span>'
        : '<span style="background:#fee2e2; color:#b91c1c; font-size:10px; font-weight:800; padding:2px 8px; border-radius:10px;">ERROR</span>';

      var bTypeBadge = '<span style="background:#eff6ff; color:#1d4ed8; padding:2px 6px; border-radius:3px; font-weight:700;">' + escHtml(r.resolvedBillTypeName || r.billType || 'Maintenance') + '</span>';
      var memLabel = r.resolvedMemberName ? ('<strong>' + escHtml(r.resolvedMemberName) + '</strong> (' + escHtml(r.resolvedFlatNo || '') + ')') : escHtml(r.memberName || r.memberCode || 'Unknown');
      var accLabel = r.resolvedAccountName ? ('[' + escHtml(r.resolvedAccountCode || '') + '] ' + escHtml(r.resolvedAccountName)) : escHtml(r.depositToAccount || 'Cash in Hand');

      var notesHtml = '';
      if (!r.isValid && r.errors && r.errors.length > 0) {
        notesHtml = '<div style="color:#b91c1c; font-weight:600; line-height:1.3;">' + r.errors.map(function (err) { return '• ' + escHtml(err); }).join('<br>') + '</div>';
      } else {
        var dueInfo = '';
        if (r.outstandingPrincipal > 0 || r.outstandingInterest > 0) {
          dueInfo = ' [Due: Prin ₹' + r.outstandingPrincipal.toFixed(2) + ', Int ₹' + r.outstandingInterest.toFixed(2) + ']';
        }
        notesHtml = '<span style="color:#15803d; font-weight:600;">✓ Ready to import' + dueInfo + '</span>';
      }

      html += '<tr style="border-bottom:1px solid #e2e8f0; ' + (!r.isValid ? 'background:#fff1f2;' : '') + '">' +
        '<td style="padding:6px 8px; text-align:center; font-weight:700; color:#64748b;">' + r.rowIndex + '</td>' +
        '<td style="padding:6px 8px; text-align:center;">' + rowStatusHtml + '</td>' +
        '<td style="padding:6px 8px; font-weight:700; color:#1e293b;">' + escHtml(r.receiptNo || '(Auto-gen)') + '</td>' +
        '<td style="padding:6px 8px;">' + escHtml(r.receiptDate || '') + '</td>' +
        '<td style="padding:6px 8px;">' + bTypeBadge + '</td>' +
        '<td style="padding:6px 8px;">' + memLabel + '</td>' +
        '<td style="padding:6px 8px;">' + accLabel + '</td>' +
        '<td style="padding:6px 8px; text-align:right; font-weight:700; font-family:\'Consolas\', monospace;">₹' + (r.amount || 0).toFixed(2) + '</td>' +
        '<td style="padding:6px 8px; text-align:right; font-family:\'Consolas\', monospace; color:#15803d;">₹' + (r.allocatedPrincipal || 0).toFixed(2) + '</td>' +
        '<td style="padding:6px 8px; text-align:right; font-family:\'Consolas\', monospace; color:#b45309;">₹' + (r.allocatedInterest || 0).toFixed(2) + '</td>' +
        '<td style="padding:6px 12px; font-size:10.5px;">' + notesHtml + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    if (btnConfirm) {
      if (validRows > 0) {
        btnConfirm.style.display = 'inline-flex';
        btnConfirm.disabled = false;
        if (errorRows > 0) {
          btnConfirm.innerHTML = '<i class="bi bi-check-circle-fill"></i> Import ' + validRows + ' Valid Receipts (' + errorRows + ' Errors Skipped)';
        } else {
          btnConfirm.innerHTML = '<i class="bi bi-check-circle-fill"></i> Confirm & Import ' + validRows + ' Receipts';
        }
      } else {
        btnConfirm.style.display = 'none';
      }
    }
  }

  window.executeReceiptBulkImport = async function () {
    var validRows = currentValidatedReceiptRows.filter(function (r) { return r.isValid; });
    if (validRows.length === 0) {
      toast('No valid receipt rows to import.', false);
      return;
    }

    var btnConfirm = document.getElementById('btn-import-confirm');
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = '<i class="bi bi-hourglass-split"></i> Importing receipts...';
    }

    try {
      var sid = getActiveSocietyId();
      var fyid = getFyId();
      var baseHost = getApiBaseHost();
      var resp = await fetch(baseHost + '/api/member-receipts/bulk-import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ societyId: parseInt(sid), fyId: parseInt(fyid), rows: validRows })
      });

      var resJson = await resp.json();
      var countVal = (resJson.count !== undefined) ? resJson.count : (resJson.importedCount !== undefined ? resJson.importedCount : validRows.length);
      if (resp.ok && resJson.success) {
        toast('Successfully imported ' + countVal + ' member receipt(s)!', true);
        closeModal('modal-receipt-bulk-import');
        await loadReceipts();
        try {
          localStorage.setItem('jeevika_receipt_sync', Date.now().toString());
        } catch (e) {}
      } else {
        toast(resJson.message || 'Bulk import failed.', false);
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = '<i class="bi bi-check-circle-fill"></i> Retry Import';
        }
      }
    } catch (err) {
      console.error('Import execution error:', err);
      toast('Import failed: ' + err.message, false);
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = '<i class="bi bi-check-circle-fill"></i> Retry Import';
      }
    }
  };

  // Close dropdown on outside click
  document.addEventListener('click', function (e) {
    var inDropdown = e.target.closest && (e.target.closest('.mr-dropdown') || e.target.closest('.add-receipt-wrap'));
    if (!inDropdown) {
      closeAllToolbarDropdowns();
    }
  });

  // Short-cuts (Alt+A, F2, Esc, Ctrl+P, Ctrl+D)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddReceiptForm();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedReceipt();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      openMultiDeleteModal();
    } else if (e.key === 'Escape') {
      var modals = ['modal-receipt-bulk-import', 'modal-multi-change', 'modal-multi-delete'];
      for (var mi = 0; mi < modals.length; mi++) {
        var mEl = document.getElementById(modals[mi]);
        if (mEl && mEl.style.display !== 'none' && mEl.style.display !== '') {
          closeModal(modals[mi]);
          return;
        }
      }
      showList();
    }
  });

  window.toggleAutoSelect = function(checked) {
    var lbl = document.getElementById('lbl-auto-select');
    if (lbl) lbl.textContent = checked ? 'ON' : 'OFF';
    
    isManualBillMode = !checked;
    updateBillInputModeUI();

    var mVal = document.getElementById('frm-membername') ? document.getElementById('frm-membername').value : '';
    if (mVal) {
      onMemberSelect(mVal, false);
    }
  };

  // INIT
  (async function init() {
    var _sn = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('mrSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('mrFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    await loadAccounts();
    await loadBillTypes();
    await loadMembers();
    await loadBills();
    await loadReceipts();
    togglePayMode('Cash');

    // Drag & Drop listeners on upload zone
    var dropZone = document.getElementById('mr-import-upload-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.style.borderColor = '#535FC1';
        dropZone.style.background = '#f0f4ff';
      });
      dropZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        dropZone.style.borderColor = '#94a3b8';
        dropZone.style.background = '#ffffff';
      });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.style.borderColor = '#94a3b8';
        dropZone.style.background = '#ffffff';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleReceiptImportFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Real-time synchronization listeners
    window.addEventListener('storage', function (e) {
      if (e.key === 'jeevika_reversal_sync' || e.key === 'jeevika_receipt_sync') {
        loadReceipts();
      }
    });
    window.addEventListener('focus', function () {
      loadReceipts();
    });
  })();

})();
