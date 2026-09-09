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

  window.editSelectedReceipt = function (id) {
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

    var savedAcc = r.cashBank || '';
    var isCash = savedAcc.toLowerCase().includes('cash');
    var rdoCash = document.querySelector('input[name="payMode"][value="Cash"]');
    var rdoBank = document.querySelector('input[name="payMode"][value="Bank"]');
    if (isCash) {
      if (rdoCash) rdoCash.checked = true;
      togglePayMode('Cash', savedAcc);
    } else {
      if (rdoBank) rdoBank.checked = true;
      togglePayMode('Bank', savedAcc);
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

  window.togglePayMode = function (mode, selectedValue) {
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
        html = '<option value="Cash in Hand">[ASS-1001] Cash in Hand</option>';
      } else {
        cashAccs.forEach(function (a) {
          var name = a.accName || a.accountName || 'Cash in Hand';
          var code = a.accCode || a.accountCode || '';
          var label = code ? ('[' + code + '] ' + name) : name;
          html += '<option value="' + escHtml(name) + '">' + escHtml(label) + '</option>';
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
          html += '<option value="' + escHtml(name) + '">' + escHtml(label) + '</option>';
        });
      }
    }

    sel.innerHTML = html;
    if (selectedValue) {
      sel.value = selectedValue;
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
    if (el) el.value += (el.value ? ' ' : '') + 'Receipt for ' + getFyLabel();
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

  window.showChequeManagement = function () {
    var tbody = document.getElementById('chq-tbody');
    var chqs = receipts.filter(function (r) { return r.chqNo && r.chqNo !== '—'; });

    document.getElementById('mr-cheque-count').textContent = chqs.length + ' Cheques';

    var html = '';
    chqs.forEach(function (c) {
      html += '<tr>' +
        '<td class="mr-mono">' + c.receiptDate + '</td>' +
        '<td class="mr-mono" style="font-weight:700; color:#1565C0;">' + c.receiptNo + '</td>' +
        '<td>' + (c.memberName || c.personName) + '</td>' +
        '<td class="mr-mono" style="font-weight:700;">' + c.chqNo + '</td>' +
        '<td>' + (c.bankName || '—') + '</td>' +
        '<td>' + c.cashBank + '</td>' +
        '<td class="mr-mono" style="text-align:right; font-weight:700;">' + (c.amount || 0).toFixed(2) + '</td>' +
        '<td style="text-align:center;"><span style="color:#2E7D32; font-weight:700;">Received</span></td>' +
        '</tr>';
    });

    tbody.innerHTML = html || '<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:30px;">No cheques recorded yet.</td></tr>';

    document.getElementById('mr-section-list').style.display = 'none';
    document.getElementById('mr-section-form').style.display = 'none';
    document.getElementById('mr-section-cheque').style.display = 'flex';
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
      toast('Please enter both From and To receipt numbers.', false);
      return;
    }

    var initialCount = receipts.length;
    receipts = receipts.filter(function (r) {
      var no = (r.receiptNo || '').toLowerCase();
      return !(no >= fromNo && no <= toNo);
    });

    var deletedCount = initialCount - receipts.length;
    localStorage.setItem('jeevika_member_receipts_' + getActiveSocietyId(), JSON.stringify(receipts));
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

  window.toggleOtherDropdown = function () {
    var menu = document.getElementById('mr-other-menu');
    if (menu) menu.style.display = (menu.style.display === 'block' ? 'none' : 'block');
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

  // Close dropdown on outside click
  document.addEventListener('click', function (e) {
    var drop = document.querySelector('.mr-dropdown');
    var menu = document.getElementById('mr-other-menu');
    if (drop && menu && !drop.contains(e.target)) {
      menu.style.display = 'none';
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
