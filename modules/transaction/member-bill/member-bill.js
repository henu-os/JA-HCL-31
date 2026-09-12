/**
 * member-bill.js — JEEVIKA ERP v2
 * Bill / Invoice Generation Engine
 * Fully aligned with exact UI specs, real-time DB Bill Types, and Member Master integration.
 */

(function () {
  'use strict';

  var bills = [];
  var members = [];
  var billTypes = [];
  var activeBillType = 'MAINTENANCE'; // Default active tab is MAINTENANCE
  var selectedBillId = null;

  function toast(msg, ok) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, ok ? 'success' : 'error');
    } else {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;padding:8px 16px;font-size:11.5px;font-weight:700;color:#FFF;border-radius:4px;box-shadow:0 3px 12px rgba(0,0,0,0.2);background:' + (ok !== false ? '#2E7D32' : '#C62828') + ';';
      d.textContent = msg;
      document.body.appendChild(d);
      setTimeout(function(){ d.remove(); }, 2500);
    }
  }

  function getActiveSocietyId() {
    var sid = (window.Auth && window.Auth.getSocietyId) ? window.Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId'));
    if (!sid || sid === '0') {
      if (members && members.length > 0 && members[0].societyId) return String(members[0].societyId);
      sid = '1';
    }
    return String(sid);
  }

  function getFyId() {
    return (window.Auth && window.Auth.getFYId) ? window.Auth.getFYId() : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1');
  }

  function getSocietyName() {
    return (window.Auth && window.Auth.getSocietyName) ? window.Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName') || 'SHREE SAI SOCIETY');
  }

  function getFyLabel() {
    return (window.Auth && window.Auth.getFYLabel) ? window.Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');
  }

  async function fetchApiData(endpoint) {
    if (window.API && API.get) {
      try {
        var res = await API.get(endpoint);
        if (res && res.data && Array.isArray(res.data)) return res.data;
        if (Array.isArray(res)) return res;
      } catch (e) {}
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

    var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
    var path = endpoint.startsWith('/api/') ? endpoint : ('/api' + (endpoint.startsWith('/') ? endpoint : '/' + endpoint));
    var fullUrl = baseHost + path;

    try {
      var resp = await fetch(fullUrl, { headers: headers });
      if (resp.ok) {
        var json = await resp.json();
        if (json && json.data && Array.isArray(json.data)) return json.data;
        if (Array.isArray(json)) return json;
      }
    } catch (e) {}
    return null;
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var socEl = document.getElementById('mbSocName');
    if (socEl) socEl.textContent = getSocietyName();

    var fyEl = document.getElementById('mbFyLabel');
    if (fyEl) fyEl.textContent = getFyLabel();

    await loadBillTypes();
    await loadMembers();
    await loadBills();
    initShortcuts();
    initMemberCombobox();
  });

  // ── 1. LOAD BILL TYPES FROM DATABASE ──────────────────────────────
  async function loadBillTypes() {
    var sid = getActiveSocietyId();
    billTypes = [];

    var data = await fetchApiData('/api/bill-types?societyId=' + sid);
    if (data && Array.isArray(data) && data.length > 0) {
      billTypes = data;
    }

    var dataAll = await fetchApiData('/api/bill-types');
    if (dataAll && Array.isArray(dataAll)) {
      dataAll.forEach(function (bt) {
        if (!billTypes.some(function (existing) { return (existing.billTypeName || '').toUpperCase() === (bt.billTypeName || '').toUpperCase(); })) {
          billTypes.push(bt);
        }
      });
    }

    if (!billTypes.some(function (bt) { return (bt.billTypeName || '').toUpperCase().indexOf('MAINT') !== -1; })) {
      billTypes.unshift({ billTypeId: 1, billTypeName: 'Maintenance' });
    }

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

    uniqueList.sort(function (a, b) {
      var aName = (a.billTypeName || a.name || '').trim().toUpperCase();
      var bName = (b.billTypeName || b.name || '').trim().toUpperCase();
      if (aName === 'MAINTENANCE') return -1;
      if (bName === 'MAINTENANCE') return 1;
      return aName.localeCompare(bName);
    });

    billTypes = uniqueList;

    renderBillTypePills();
  }

  function renderBillTypePills() {
    var container = document.getElementById('mb-bill-type-pills');
    if (!container) return;

    var html = '<span class="mb-type-pill ' + (activeBillType === 'ALL' ? 'active' : '') + '" onclick="setBillTypeFilter(\'ALL\', this)">ALL</span>';

    var seenPills = {};
    billTypes.forEach(function (bt) {
      var name = (bt.billTypeName || bt.name || '').trim();
      var key = name.toUpperCase();
      if (!name || seenPills[key]) return;
      seenPills[key] = true;

      var isActive = (activeBillType.toUpperCase() === key);
      html += '<span class="mb-type-pill ' + (isActive ? 'active' : '') + '" onclick="setBillTypeFilter(\'' + key + '\', this)">' + name.toUpperCase() + '</span>';
    });

    container.innerHTML = html;

    var caret = document.getElementById('add-bill-caret');
    if (caret) {
      caret.style.display = (activeBillType === 'ALL' ? 'inline-block' : 'none');
    }
  }

  window.setBillTypeFilter = function (type, el) {
    activeBillType = type;
    document.querySelectorAll('.mb-type-pill').forEach(function(p){ p.classList.remove('active'); });
    if (el) el.classList.add('active');

    var caret = document.getElementById('add-bill-caret');
    if (caret) {
      caret.style.display = (activeBillType === 'ALL' ? 'inline-block' : 'none');
    }

    renderBillsTable();
  };

  // ── 2. LOAD MEMBERS FROM MEMBER MASTER ────────────────────────────
  async function loadMembers() {
    var sid = getActiveSocietyId();
    members = [];

    var data = await fetchApiData('/api/members?societyId=' + sid);
    if (data && Array.isArray(data) && data.length > 0) {
      members = data;
    }

    if (!members || members.length === 0) {
      var dataAll = await fetchApiData('/api/members');
      if (dataAll && Array.isArray(dataAll) && dataAll.length > 0) {
        members = dataAll;
      }
    }

    if (!members || members.length === 0) {
      var keys = ['jeevika_master_members', 'mmList', 'jeevika_members_' + sid, 'jeevika_members_4', 'jeevika_members_1', 'jeevika_members', 'members'];
      for (var i = 0; i < keys.length; i++) {
        var stored = localStorage.getItem(keys[i]);
        if (stored) {
          try {
            var parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              members = parsed;
              break;
            }
          } catch (e) {}
        }
      }
    }

    if (!members) members = [];
  }

  function initMemberCombobox() {
    var input = document.getElementById('frm-member-input');
    var dropdown = document.getElementById('frm-member-dropdown');
    if (!input || !dropdown) return;

    input.addEventListener('focus', function () {
      if (input.value.indexOf('— Select Member') !== -1) {
        input.value = '';
      }
      renderComboboxOptions('');
      dropdown.style.display = 'block';
    });

    input.addEventListener('click', function () {
      if (input.value.indexOf('— Select Member') !== -1) {
        input.value = '';
      }
      renderComboboxOptions('');
      dropdown.style.display = 'block';
    });

    input.addEventListener('input', function () {
      renderComboboxOptions(input.value);
      dropdown.style.display = 'block';
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.combobox-wrap')) {
        dropdown.style.display = 'none';
      }
      if (!e.target.closest('.add-bill-wrap')) {
        var menu = document.getElementById('add-bill-menu');
        if (menu) menu.style.display = 'none';
      }
    });
  }

  function renderComboboxOptions(query) {
    var dropdown = document.getElementById('frm-member-dropdown');
    if (!dropdown) return;

    var q = (query || '').toLowerCase().trim();
    if (q.indexOf('select member') !== -1 || q.indexOf('—') !== -1) {
      q = '';
    }

    var filtered = members.filter(function (m) {
      if (!q) return true;
      var code = (m.memCode || m.memberCode || m.MemCode || '').toLowerCase();
      var name = (m.memName || m.name || m.MemName || m.memberName || '').toLowerCase();
      var wing = (m.wing || m.Wing || '').toLowerCase();
      var flat = (m.flatNo || m.FlatNo || '').toLowerCase();
      var bldg = (m.building || m.Building || '').toLowerCase();

      return code.indexOf(q) !== -1 || name.indexOf(q) !== -1 || wing.indexOf(q) !== -1 || flat.indexOf(q) !== -1 || bldg.indexOf(q) !== -1;
    });

    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="combobox-item" style="color:#94a3b8; padding:8px;">No matching members found</div>';
      return;
    }

    var html = '';
    filtered.forEach(function (m) {
      var code = m.memCode || m.memberCode || m.MemCode || '';
      var name = m.memName || m.name || m.MemName || m.memberName || '';
      var wing = m.wing || m.Wing || '';
      var flat = m.flatNo || m.FlatNo || '';
      var flatLabel = (wing || flat ? (wing ? wing + '-' : '') + flat : '');
      var label = code + ' - ' + name + (flatLabel ? ' (' + flatLabel + ')' : '');
      var id = m.memberId || m.socMemId || m.MemberId || 1;

      html += '<div class="combobox-item" onclick="selectComboboxMember(' + id + ', \'' + escHtml(label) + '\')">' + label + '</div>';
    });

    dropdown.innerHTML = html;
  }

  var activeFormBillType = 'Maintenance';

  window.selectComboboxMember = function (memberId, label) {
    var input = document.getElementById('frm-member-input');
    var hiddenId = document.getElementById('frm-memberid');
    var dropdown = document.getElementById('frm-member-dropdown');

    if (input) input.value = label;
    if (hiddenId) hiddenId.value = memberId;
    if (dropdown) dropdown.style.display = 'none';

    onMemberSelected(memberId);
  };

  function escHtml(str) {
    return (str || '').replace(/'/g, "\\'");
  }

  function onMemberSelected(memberId) {
    loadMemberBillingMatrix(memberId);
  }

  async function loadMemberBillingMatrix(memberId) {
    var sid = getActiveSocietyId();
    var curType = activeFormBillType || (activeBillType !== 'ALL' ? activeBillType : (billTypes.length > 0 ? (billTypes[0].billTypeName || billTypes[0].name) : 'Maintenance'));
    
    var mObj = null;
    if (members && members.length > 0) {
      mObj = members.find(function (m) {
        return String(m.memberId || m.socMemId || m.MemberId) === String(memberId) ||
               String(m.memCode || m.memberCode || '').trim().toLowerCase() === String(memberId).trim().toLowerCase() ||
               String(m.flatNo || '').trim().toLowerCase() === String(memberId).trim().toLowerCase();
      });
    }

    var btObj = billTypes.find(function (b) {
      return (b.billTypeName || b.name || '').trim().toLowerCase() === curType.trim().toLowerCase();
    });
    var curTypeId = btObj ? (btObj.billTypeId || btObj.id || 0) : 0;

    try {
      var data = await fetchApiData('/api/billing-master?billTypeId=' + curTypeId + '&billType=' + encodeURIComponent(curType) + '&societyId=' + sid);
      
      // Fallback to local matrix storage if API returns empty
      if (!data || !Array.isArray(data) || data.length === 0) {
        var localKeys = [
          'jeevika_bm_matrix_' + sid + '_' + curType,
          'jeevika_bm_matrix_' + sid + '_' + curTypeId,
          'jeevika_bm_matrix_1_' + curType,
          'jeevika_bm_matrix_1_' + curTypeId,
          'jeevika_bm_matrix_4_' + curType,
          'jeevika_bm_matrix_' + sid + '_' + curType.toUpperCase(),
          'jeevika_bm_matrix_1_' + curType.toUpperCase()
        ];
        for (var k = 0; k < localKeys.length; k++) {
          var str = localStorage.getItem(localKeys[k]);
          if (str) {
            try {
              var parsed = JSON.parse(str);
              if (Array.isArray(parsed) && parsed.length > 0) {
                data = parsed;
                break;
              }
            } catch (e) {}
          }
        }
      }

      if (data && Array.isArray(data)) {
        var targetMemCode = mObj ? (mObj.memCode || mObj.memberCode || mObj.MemCode || '').trim().toLowerCase() : '';
        var targetFlat = mObj ? (mObj.flatNo || mObj.FlatNo || '').trim().toLowerCase() : '';
        var targetName = mObj ? (mObj.memName || mObj.name || mObj.MemName || mObj.memberName || '').trim().toLowerCase() : '';
        var targetWing = mObj ? (mObj.wing || mObj.Wing || '').trim().toLowerCase() : '';
        var targetId = String(memberId).trim().toLowerCase();

        var mRow = data.find(function (r) { 
          var rId = String(r.memberId || r.MemberId || r.id || '').trim().toLowerCase();
          var rNo = String(r.memNo || r.MemNo || '').trim().toLowerCase();
          var rFlat = String(r.flatNo || r.FlatNo || '').trim().toLowerCase();
          var rName = String(r.name || r.memName || r.MemName || '').trim().toLowerCase();
          var rWing = String(r.wing || r.Wing || '').trim().toLowerCase();

          // 1. Direct ID match
          if (rId && (rId === targetId || (mObj && rId === String(mObj.memberId || mObj.socMemId || mObj.MemberId)))) return true;
          // 2. Member No match
          if (rNo && (rNo === targetId || (targetMemCode && rNo === targetMemCode) || (targetFlat && rNo === targetFlat))) return true;
          // 3. Flat No match
          if (rFlat && (rFlat === targetId || (targetFlat && rFlat === targetFlat) || (targetMemCode && rFlat === targetMemCode))) return true;
          // 4. Wing + Flat match
          if (targetWing && targetFlat && rWing === targetWing && (rFlat === targetFlat || rNo === targetFlat)) return true;
          // 5. Member Name match
          if (targetName && rName && (rName === targetName || rName.indexOf(targetName) !== -1 || targetName.indexOf(rName) !== -1)) return true;

          return false;
        });

        if (mRow && mRow.amounts) {
          document.querySelectorAll('#frm-grid-tbody tr').forEach(function (tr) {
            var inp = tr.querySelector('.inp-grid-amt');
            if (inp) {
              var code = (inp.getAttribute('data-account-code') || '').trim();
              var name = (inp.getAttribute('data-account-name') || '').trim();
              var val = null;
              if (mRow.amounts[code] !== undefined) val = mRow.amounts[code];
              else if (mRow.amounts[name] !== undefined) val = mRow.amounts[name];
              else {
                var codeLower = code.toLowerCase();
                var nameLower = name.toLowerCase();
                for (var ak in mRow.amounts) {
                  var akLower = ak.toLowerCase().trim();
                  if (akLower === codeLower || akLower === nameLower || (nameLower && akLower.indexOf(nameLower) !== -1)) {
                    val = mRow.amounts[ak];
                    break;
                  }
                }
              }
              if (val !== null && val !== undefined) {
                inp.value = Math.round(parseFloat(val) || 0);
              }
            }
          });
          recalcFormTotal();
        }
      }
    } catch (e) {
      console.error('loadMemberBillingMatrix error:', e);
    }
  }

  function getActiveBillPrefix() {
    if (typeof getTxNextVoucherNo === 'function') {
      var next = getTxNextVoucherNo('bill', []);
      var pfxMatch = next.match(/^(.*?)(\d+)$/);
      if (pfxMatch) return pfxMatch[1];
    }
    var fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');
    return 'MBIL/' + fyLabel + '/';
  }

  // ── 3. LOAD & RENDER BILLS LIST ──────────────────────────────────
  async function loadBills() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();

    var data = await fetchApiData('/api/member-bills?societyId=' + sid + '&fyId=' + fyid);
    if (data && Array.isArray(data)) {
      bills = data;
      localStorage.setItem('jeevika_member_bills_' + sid, JSON.stringify(bills));
    } else if (!bills || bills.length === 0) {
      var stored = localStorage.getItem('jeevika_member_bills_' + sid);
      if (stored) {
        try { bills = JSON.parse(stored); } catch (e) {}
      }
    }
    if (!bills) bills = [];
    renderBillsTable();
  }

  var sortDirection = 'desc';

  window.toggleFilterBar = function () {
    var bar = document.getElementById('mb-filter-bar');
    if (bar) {
      var isHidden = (bar.style.display === 'none' || !bar.style.display);
      bar.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        var inp = document.getElementById('flt-membername') || document.getElementById('flt-billno');
        if (inp) inp.focus();
      }
    }
  };

  window.applyFilters = function () {
    renderBillsTable();
  };

  window.clearFilters = function () {
    if (document.getElementById('flt-billno')) document.getElementById('flt-billno').value = '';
    if (document.getElementById('flt-membercode')) document.getElementById('flt-membercode').value = '';
    if (document.getElementById('flt-membername')) document.getElementById('flt-membername').value = '';
    if (document.getElementById('flt-status')) document.getElementById('flt-status').value = '';
    renderBillsTable();
  };

  window.toggleBillNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-billno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderBillsTable();
  };

  function renderBillsTable() {
    var tbody = document.getElementById('mb-list-tbody');
    if (!tbody) return;

    var showBillTypeCol = (activeBillType === 'ALL');
    var thBillType = document.querySelectorAll('.col-bill-type');
    thBillType.forEach(function (el) { el.style.display = showBillTypeCol ? '' : 'none'; });

    var filtered = bills.filter(function (b) {
      if (activeBillType !== 'ALL' && (b.billType || '').toUpperCase() !== activeBillType.toUpperCase()) return false;

      var fNo = (document.getElementById('flt-billno') ? document.getElementById('flt-billno').value.toLowerCase().trim() : '');
      var fCode = (document.getElementById('flt-membercode') ? document.getElementById('flt-membercode').value.toLowerCase().trim() : '');
      var fName = (document.getElementById('flt-membername') ? document.getElementById('flt-membername').value.toLowerCase().trim() : '');
      var fStatus = (document.getElementById('flt-status') ? document.getElementById('flt-status').value : '');

      if (fNo && (b.billNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fCode) {
        var mCode = (b.memberCode || b.memCode || '').toLowerCase();
        var wing = (b.wing || '').toLowerCase();
        if (mCode.indexOf(fCode) === -1 && wing.indexOf(fCode) === -1) return false;
      }

      if (fName) {
        var mName = (b.memberName || b.memName || '').toLowerCase();
        var wing = (b.wing || '').toLowerCase();
        var fType = (b.flatType || '').toLowerCase();
        var part1 = (b.particular1 || '').toLowerCase();
        var part2 = (b.particular2 || '').toLowerCase();
        var mCode = (b.memberCode || b.memCode || '').toLowerCase();

        var matches = (
          mName.indexOf(fName) !== -1 ||
          wing.indexOf(fName) !== -1 ||
          fType.indexOf(fName) !== -1 ||
          part1.indexOf(fName) !== -1 ||
          part2.indexOf(fName) !== -1 ||
          mCode.indexOf(fName) !== -1
        );
        if (!matches) return false;
      }

      if (fStatus && (b.status || '') !== fStatus) return false;

      return true;
    });

    // Sort by Bill No top-to-bottom or bottom-to-top
    filtered.sort(function (a, b) {
      var noA = (a.billNo || '').toLowerCase();
      var noB = (b.billNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('mb-list-count').textContent = filtered.length + ' bills';

    if (filtered.length === 0) {
      var colSpan = showBillTypeCol ? 15 : 14;
      tbody.innerHTML = '<tr><td colspan="' + colSpan + '" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Bills Found</td></tr>';
      document.getElementById('sum-count').textContent = '0';
      document.getElementById('sum-principal').textContent = '₹0.00';
      document.getElementById('sum-interest').textContent = '₹0.00';
      document.getElementById('sum-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalPrn = 0, totalInt = 0, totalGrd = 0;

    filtered.forEach(function (b) {
      var isSel = (b.billId == selectedBillId || b.billNo == selectedBillId);
      var prn = Math.round(b.principalAmount || 0);
      var intAmt = Math.round(b.interestAmount || 0);
      var grd = Math.round(b.totalAmount || (prn + intAmt));

      totalPrn += prn;
      totalInt += intAmt;
      totalGrd += grd;

      var code = b.memberCode || b.memCode || '';
      var wing = b.wing || '';
      var flat = b.flatNo || '';
      var name = b.memberName || b.memName || '';

      if ((!code || !wing) && b.memberId && members && members.length > 0) {
        var mObj = members.find(function (m) { return (m.memberId || m.socMemId || m.MemberId) === b.memberId; });
        if (mObj) {
          if (!code) code = mObj.memCode || mObj.memberCode || mObj.MemCode || '';
          if (!wing) wing = mObj.wing || mObj.Wing || '';
          if (!flat) flat = mObj.flatNo || mObj.FlatNo || '';
          if (name.includes('(') || name.startsWith('-')) name = mObj.memName || mObj.name || mObj.MemName || name;
        }
      }

      // If name is still concatenated (e.g. "- E-101 - Ramesh Sharma (D-102)")
      if (name.startsWith('- ') || name.includes(' - ')) {
        var parts = name.split(' - ');
        if (parts.length >= 2) {
          var cleanName = parts[parts.length - 1].replace(/\s*\([^)]*\)/, '').trim();
          if (cleanName) name = cleanName;
        }
      }

      var statusBadge = (b.status === 'Paid')
        ? '<span style="color:#2E7D32; font-weight:800;">Paid</span>'
        : '<span style="color:#dc2626; font-weight:800;">Unpaid</span>';

      html += '<tr class="' + (isSel ? 'selected' : '') + '" data-id="'+(b.billId||b.voucherId||b.billNo||b.voucherNo||'')+'" onclick="selectBillRow(this.dataset.id, this)" ondblclick="editSelectedBill(this.dataset.id)">' +
        '<td style="font-weight:700; color:#1565C0;">' + (b.billNo || '') + '</td>' +
        '<td>' + (b.billDate || '') + '</td>' +
        (showBillTypeCol ? '<td class="col-bill-type" style="font-weight:600;">' + (b.billType || 'Maintenance') + '</td>' : '') +
        '<td>' + code + '</td>' +
        '<td style="text-align:center;">' + wing + '</td>' +
        '<td>' + (b.flatType || 'Flat') + '</td>' +
        '<td style="font-weight:700;">' + name + '</td>' +
        '<td>' + (b.period || getCurrentPeriodName()) + '</td>' +
        '<td>' + (b.dueDate || '') + '</td>' +
        '<td style="text-align:right; font-weight:700;">' + prn.toFixed(2) + '</td>' +
        '<td style="text-align:right;">' + intAmt.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#1565C0;">' + grd.toFixed(2) + '</td>' +
        '<td>' + (b.particular1 || '-') + '</td>' +
        '<td>' + (b.particular2 || '-') + '</td>' +
        '<td style="text-align:center;">' + statusBadge + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-count').textContent = filtered.length;
    document.getElementById('sum-principal').textContent = '₹' + totalPrn.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('sum-interest').textContent = '₹' + totalInt.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('sum-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    initColumnResizing();
  }

  function initColumnResizing() {
    setTimeout(function () {
      var tables = document.querySelectorAll('table.mb-main-table, table.form-grid-table');
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

  window.selectBillRow = function (id, trEl) {
    selectedBillId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('selected'); });
      trEl.classList.add('selected');
    }
  };

  // ── 4. ADD BILL HANDLER & FORM OPENING ───────────────────────────
  window.handleAddBillClick = function (evt) {
    if (evt) evt.stopPropagation();
    var menu = document.getElementById('add-bill-menu');

    if (activeBillType === 'ALL') {
      if (menu) {
        var isVisible = (menu.style.display === 'block');
        if (isVisible) {
          menu.style.display = 'none';
        } else {
          var html = '';
          billTypes.forEach(function (bt) {
            var name = (bt.billTypeName || bt.name || '').trim();
            if (name) {
              html += '<div class="add-bill-dropdown-item" onclick="openAddBillFormForType(\'' + escHtml(name) + '\')">' + name + '</div>';
            }
          });
          if (!html) {
            html = '<div class="add-bill-dropdown-item" onclick="openAddBillFormForType(\'Maintenance\')">Maintenance</div>';
          }
          menu.innerHTML = html;
          menu.style.display = 'block';
        }
      }
    } else {
      if (menu) menu.style.display = 'none';
      openAddBillFormForType(activeBillType);
    }
  };

  window.openAddBillFormForType = function (typeName) {
    var menu = document.getElementById('add-bill-menu');
    if (menu) menu.style.display = 'none';

    selectedBillId = null;

    var displayName = typeName || 'Maintenance';
    activeFormBillType = displayName;
    document.getElementById('mb-module-title').textContent = 'Bill / Invoice Generation [' + displayName.toUpperCase() + ']';

    document.getElementById('frm-billno').value = (typeof getTxNextVoucherNo === 'function') ? getTxNextVoucherNo('bill', bills) : ('MBIL/25-26/' + Math.floor(100 + Math.random() * 900));
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-billno', 'Bill');
    
    // Enforce active Financial Year dates
    var defaultBillDate = (typeof getFYDefaultDate === 'function') ? getFYDefaultDate() : todayISO();
    document.getElementById('frm-billdate').value = defaultBillDate;

    var defaultDueDate = futureISO(15);
    if (typeof isInActiveFY === 'function' && !isInActiveFY(defaultDueDate)) {
      var fyR = (typeof getFYDateRange === 'function') ? getFYDateRange() : null;
      if (fyR && defaultDueDate > fyR.endDate) defaultDueDate = fyR.endDate;
    }
    document.getElementById('frm-duedate').value = defaultDueDate;
    document.getElementById('frm-period').value = getCurrentPeriodName();

    document.getElementById('frm-member-input').value = '';
    document.getElementById('frm-memberid').value = '';
    document.getElementById('frm-particular1').value = '';
    document.getElementById('frm-particular2').value = '';

    // Apply FY bounds to date inputs
    if (typeof applyFYDateRestrictions === 'function') {
      applyFYDateRestrictions(document.getElementById('mb-section-form'));
    }

    // Ensure member dropdown options are ready
    renderComboboxOptions('');

    loadFormAccountHeads(displayName);

    document.getElementById('mb-section-list').style.display = 'none';
    document.getElementById('mb-section-form').style.display = 'flex';
  };

  window.openAddBillForm = function () {
    handleAddBillClick();
  };

  window.editSelectedBill = async function (id) {
    if (id) selectedBillId = id;
    if (!selectedBillId) {
      toast('Please select a bill record to edit.', false);
      return;
    }

    var bill = bills.find(function (b) {
      return String(b.billId) === String(selectedBillId) ||
             String(b.voucherId) === String(selectedBillId) ||
             String(b.billNo) === String(selectedBillId) ||
             String(b.voucherNo) === String(selectedBillId);
    });
    if (!bill) { toast('Bill record not found.', false); return; }

    var billTypeName = bill.billType || 'Maintenance';
    activeFormBillType = billTypeName;
    document.getElementById('mb-module-title').textContent = 'Bill / Invoice Generation [' + billTypeName.toUpperCase() + ']';

    document.getElementById('frm-billno').value = bill.billNo || '';
    document.getElementById('frm-billdate').value = bill.billDate || todayISO();
    document.getElementById('frm-duedate').value = bill.dueDate || futureISO(15);
    document.getElementById('frm-period').value = bill.period || getCurrentPeriodName();

    var flatLabel = (bill.wing ? bill.wing + '-' : '') + (bill.flatNo || '');
    var memText = (bill.memberCode || '') + (bill.memberName ? ' - ' + bill.memberName : '') + (flatLabel ? ' (' + flatLabel + ')' : '');
    document.getElementById('frm-member-input').value = memText;
    document.getElementById('frm-memberid').value = bill.memberId || '';
    document.getElementById('frm-particular1').value = bill.particular1 || '';
    document.getElementById('frm-particular2').value = bill.particular2 || '';

    // Fetch line items from API if not loaded yet
    var items = bill.items;
    if (!items || items.length === 0) {
      try {
        var detailRes = await fetchApiData('/api/member-bills/' + selectedBillId);
        if (detailRes && detailRes.items && Array.isArray(detailRes.items) && detailRes.items.length > 0) {
          items = detailRes.items;
          bill.items = items;
        }
      } catch (e) {}
    }

    // If still no items, fallback to matrix for this member
    if (!items || items.length === 0) {
      var sid = getActiveSocietyId();
      var matData = await fetchApiData('/api/billing-master?billType=' + encodeURIComponent(billTypeName) + '&societyId=' + sid);
      if (matData && Array.isArray(matData)) {
        var mRow = matData.find(function (r) { return r.memberId === bill.memberId; });
        if (mRow && mRow.amounts) {
          items = [];
          for (var k in mRow.amounts) {
            items.push({ accountCode: k, accountName: k, amount: mRow.amounts[k] });
          }
        }
      }
    }

    await loadFormAccountHeads(billTypeName, items);

    document.getElementById('mb-section-list').style.display = 'none';
    document.getElementById('mb-section-form').style.display = 'flex';
  };

  async function loadFormAccountHeads(typeName, existingItems) {
    var tbody = document.getElementById('frm-grid-tbody');
    if (!tbody) return;

    var configuredHeads = [];
    var normType = (typeName || 'MAINTENANCE').toUpperCase();

    if (typeof getBillTypeConfiguredHeads === 'function') {
      var dynamicHeads = getBillTypeConfiguredHeads(typeName);
      if (dynamicHeads && dynamicHeads.length > 0) {
        configuredHeads = dynamicHeads;
      }
    }

    if (!configuredHeads || configuredHeads.length === 0) {
      var btObj = billTypes.find(function (bt) {
        return (bt.billTypeName || bt.name || '').toUpperCase() === normType;
      });

      if (btObj && (btObj.billTypeId || btObj.id)) {
        var id = btObj.billTypeId || btObj.id;
        var detailData = await fetchApiData('/api/bill-types/' + id);
        if (detailData && detailData.heads && Array.isArray(detailData.heads) && detailData.heads.length > 0) {
          configuredHeads = detailData.heads.map(function (h, idx) {
            return {
              srNo: h.srNo || (idx + 1),
              accountCode: h.accCode || h.accountCode || h.MasterCode || 'ACC-' + (100 + idx),
              accountName: h.accName || h.accountName || h.MasterName || 'Charge Head ' + (idx + 1),
              defaultAmt: h.defaultAmt || 0.00
            };
          });
        }
      }
    }

    if (!configuredHeads || configuredHeads.length === 0) {
      try {
        var sid = getActiveSocietyId();
        var accRes = await fetchApiData('/api/accounts?societyId=' + sid);
        if (accRes && Array.isArray(accRes)) {
          configuredHeads = accRes
            .filter(function (a) { return (a.grpMainId === 3 || a.grpmainid === 3 || (a.grpName && a.grpName.toLowerCase().includes('income')) || (a.groupName && a.groupName.toLowerCase().includes('income'))) && a.accName; })
            .map(function (a, idx) {
              return {
                srNo: idx + 1,
                accountCode: a.accCode || a.accountCode || ('ACC-' + (100 + idx)),
                accountName: a.accName || a.accountName || ('Head ' + (idx + 1)),
                defaultAmt: 0.00
              };
            });
        }
      } catch (e) {}
    }

    if (!configuredHeads) configuredHeads = [];

    var html = '';
    if (configuredHeads.length === 0) {
      html = '<tr><td colspan="4" style="text-align:center;padding:30px;color:#64748b;font-weight:600;"><i class="bi bi-info-circle" style="color:#0284c7;margin-right:6px;"></i> No accounts configured for ' + normType + ' in Bill Type Master.</td></tr>';
    } else {
      configuredHeads.forEach(function (h, idx) {
        var sr = h.srNo || (idx + 1);
        var code = h.accountCode || h.MasterCode || '';
        var name = h.accountName || h.MasterName || '';
        var amt = 0.00;

        if (existingItems && Array.isArray(existingItems)) {
          var match = existingItems.find(function (item) {
            var iCode = (item.accountCode || item.accCode || '').toLowerCase().trim();
            var iName = (item.accountName || item.accName || '').toLowerCase().trim();
            var hCode = (code || '').toLowerCase().trim();
            var hName = (name || '').toLowerCase().trim();

            if (hCode && (iCode === hCode || iName === hCode)) return true;
            if (hName && (iCode === hName || iName === hName)) return true;

            if (hCode === 'inc-1008' || (hName === 'interest' && hCode !== 'inc-1009')) {
              if (iCode === 'inc-1008' || iName === 'interest') return true;
            }
            if (hName.indexOf('cgst') !== -1 && (iName.indexOf('cgst') !== -1 || iCode === 'lia-1032')) return true;
            if (hName.indexOf('sgst') !== -1 && (iName.indexOf('sgst') !== -1 || iCode === 'lia-1033')) return true;

            return false;
          });
          if (match) amt = Math.round(parseFloat(match.amount) || 0);
        }

        html += '<tr>' +
          '<td style="text-align:center; font-weight:bold; color:#64748b;">' + sr + '</td>' +
          '<td style="font-weight:700; color:#1565C0;">' + code + '</td>' +
          '<td style="font-weight:600;">' + name + '</td>' +
          '<td><input type="number" step="1" class="inp-grid-amt" data-index="' + idx + '" data-account-code="' + code + '" data-account-name="' + name + '" value="' + Math.round(amt) + '" oninput="recalcFormTotal()" onkeydown="handleGridNav(event, ' + idx + ')"></td>' +
          '</tr>';
      });
    }

    tbody.innerHTML = html;
    recalcFormTotal();
    initColumnResizing();

    var curMemId = document.getElementById('frm-memberid') ? document.getElementById('frm-memberid').value : '';
    if (curMemId && (!existingItems || existingItems.length === 0)) {
      loadMemberBillingMatrix(curMemId);
    }
  }

  window.handleGridNav = function (evt, idx) {
    if (evt.key === 'Enter' || evt.key === 'ArrowDown') {
      evt.preventDefault();
      var nextInput = document.querySelector('.inp-grid-amt[data-index="' + (idx + 1) + '"]');
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      } else {
        var part1 = document.getElementById('frm-particular1');
        if (part1) part1.focus();
      }
    } else if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      var prevInput = document.querySelector('.inp-grid-amt[data-index="' + (idx - 1) + '"]');
      if (prevInput) {
        prevInput.focus();
        prevInput.select();
      }
    }
  };

  window.recalcFormTotal = function () {
    var inputs = document.querySelectorAll('.inp-grid-amt');
    var sum = 0;
    inputs.forEach(function (inp) {
      sum += Math.round(parseFloat(inp.value) || 0);
    });

    var totEl = document.getElementById('frm-total-amount');
    if (totEl) totEl.textContent = '₹' + Math.round(sum).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  };

  window.appendParticularTag = function (lineNo) {
    var inp = document.getElementById('frm-particular' + lineNo);
    if (inp) {
      inp.value += ' [Period: May 2025]';
      toast('Appended period tag to Particular ' + lineNo, true);
    }
  };

  // ── 5. SAVE BILL ACTION ──────────────────────────────────────────
  window.saveBill = async function () {
    var memberIdStr = document.getElementById('frm-memberid').value;
    var memberInput = document.getElementById('frm-member-input').value;

    if (!memberInput && !memberIdStr) {
      toast('Please select a Member Code / Name.', false);
      return;
    }

    var selectedMem = members.find(function (m) {
      return (m.memberId || m.socMemId || m.MemberId) === parseInt(memberIdStr, 10);
    });

    var memberId = parseInt(memberIdStr, 10);
    if ((!memberId || isNaN(memberId)) && selectedMem) {
      memberId = selectedMem.memberId || selectedMem.socMemId || selectedMem.MemberId;
    }
    if ((!memberId || isNaN(memberId)) && members && members.length > 0 && memberInput) {
      var matchMem = members.find(function(m) {
        var c = (m.memCode || m.memberCode || '').toLowerCase();
        var n = (m.memName || m.name || '').toLowerCase();
        var inp = memberInput.toLowerCase();
        return (c && inp.indexOf(c) !== -1) || (n && inp.indexOf(n) !== -1);
      });
      if (matchMem) memberId = matchMem.memberId || matchMem.socMemId || matchMem.MemberId;
    }

    if (!memberId || isNaN(memberId)) {
      toast('Please select a valid member from the list.', false);
      return;
    }

    var pureMemberName = selectedMem ? (selectedMem.memName || selectedMem.name || selectedMem.MemName || selectedMem.memberName || '') : memberInput;
    var memberCode = selectedMem ? (selectedMem.memCode || selectedMem.memberCode || selectedMem.MemCode || '') : '';
    var memberWing = selectedMem ? (selectedMem.wing || selectedMem.Wing || '') : '';
    var memberFlat = selectedMem ? (selectedMem.flatNo || selectedMem.FlatNo || '') : '';

    if (!pureMemberName && memberInput) {
      pureMemberName = memberInput.replace(/^-\s*/, '').replace(/\s*\([^)]*\)$/, '').trim();
    }

    var items = [];
    var totalPrincipal = 0;
    var totalInterest = 0;

    document.querySelectorAll('#frm-grid-tbody tr').forEach(function (tr) {
      var inp = tr.querySelector('.inp-grid-amt');
      if (inp) {
        var amt = Math.round(parseFloat(inp.value) || 0);
        var code = inp.getAttribute('data-account-code') || '';
        var name = inp.getAttribute('data-account-name') || '';

        if (code === 'INC-1008' || (name.trim().toLowerCase() === 'interest' && code !== 'INC-1009')) {
          totalInterest += amt;
        } else {
          totalPrincipal += amt;
        }

        items.push({
          accountCode: code,
          accountName: name,
          amount: amt
        });
      }
    });

    totalPrincipal = Math.round(totalPrincipal);
    totalInterest = Math.round(totalInterest);
    var grandTotal = Math.round(totalPrincipal + totalInterest);

    var activeTypeName = activeFormBillType || (activeBillType !== 'ALL' ? activeBillType : (billTypes.length > 0 ? (billTypes[0].billTypeName || billTypes[0].name) : 'Maintenance'));

    var btObj = billTypes.find(function (b) {
      return (b.billTypeName || b.name || '').trim().toLowerCase() === activeTypeName.trim().toLowerCase();
    });
    var curTypeId = btObj ? (btObj.billTypeId || btObj.id || 0) : 0;

    var billDateVal = document.getElementById('frm-billdate').value;
    if (!billDateVal) {
      alert('Please select a valid Bill Date.');
      document.getElementById('frm-billdate').focus();
      return;
    }
    if (typeof isInActiveFY === 'function' && !isInActiveFY(billDateVal)) {
      var fyR = (typeof getFYDateRange === 'function') ? getFYDateRange() : null;
      alert('Bill Date must fall within the current Financial Year' + (fyR ? ' (' + formatDate(fyR.startDate) + ' to ' + formatDate(fyR.endDate) + ')' : '') + '.');
      document.getElementById('frm-billdate').focus();
      return;
    }

    var payload = {
      societyId: parseInt(getActiveSocietyId(), 10),
      fyId: parseInt(getFyId(), 10),
      billNo: document.getElementById('frm-billno').value,
      billTypeId: curTypeId,
      billType: activeTypeName,
      billDate: billDateVal,
      dueDate: document.getElementById('frm-duedate').value,
      period: document.getElementById('frm-period').value,
      memberId: memberId,
      memberCode: memberCode,
      memberName: pureMemberName,
      wing: memberWing,
      flatNo: memberFlat,
      principalAmount: totalPrincipal,
      interestAmount: totalInterest,
      totalAmount: grandTotal,
      particular1: document.getElementById('frm-particular1').value,
      particular2: document.getElementById('frm-particular2').value,
      items: items
    };

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var url = baseHost.replace(/\/api\/?$/, '') + '/api/member-bills';
      var token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      headers['X-Society-Id'] = getActiveSocietyId();
      headers['X-FY-Id'] = getFyId();

      var resp = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      var res = await resp.json();
      if (resp.ok && res && res.success) {
        toast('Bill saved successfully!', true);
        showList();
        await loadBills();
        return;
      } else {
        toast((res && res.message) || 'Error saving bill to database.', false);
      }
    } catch (e) {
      console.error('API saveBill error:', e);
      toast('Failed to save bill to server.', false);
    }
  };

  window.showList = function () {
    document.getElementById('mb-module-title').textContent = 'Bill / Invoice Generation';
    document.getElementById('mb-section-form').style.display = 'none';
    document.getElementById('mb-section-preview').style.display = 'none';
    document.getElementById('mb-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('mb-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  // ── 6. MODAL ACTIONS & TOOLBAR BUTTON HANDLERS ───────────────────
  window.deleteSelectedBill = async function () {
    if (!selectedBillId) {
      toast('Please select a bill record to delete.', false);
      return;
    }

    var bill = bills.find(function (b) { return (b.billId == selectedBillId || b.billNo == selectedBillId); });
    var billNoStr = (bill && bill.billNo) ? bill.billNo : (selectedBillId || 'record');

    var ok = typeof showConfirm === 'function' 
      ? await showConfirm('Are you sure you want to delete bill ' + billNoStr + '?', 'Confirm Delete Bill')
      : confirm('Are you sure you want to delete bill ' + billNoStr + '?');

    if (!ok) {
      return;
    }

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var url = baseHost.replace(/\/api\/?$/, '') + '/api/member-bills/' + (bill ? bill.billId : selectedBillId);
      var token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      var resp = await fetch(url, { method: 'DELETE', headers: headers });
      var json = await resp.json();
      if (resp.ok && json && json.success) {
        selectedBillId = null;
        toast('Bill deleted successfully!', true);
        await loadBills();
        return;
      }
    } catch (e) {
      console.warn('API delete error:', e);
    }

    bills = bills.filter(function (b) { return (b.billId != selectedBillId && b.billNo != selectedBillId); });
    localStorage.setItem('jeevika_member_bills_' + getActiveSocietyId(), JSON.stringify(bills));

    selectedBillId = null;
    toast('Bill deleted successfully!', true);
    renderBillsTable();
  };

  function getCurrentPeriodName() {
    var d = new Date();
    var months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    return months[d.getMonth()] + ' ' + d.getFullYear();
  }

  window.selectAgFrequency = function (freq) {
    ['monthly', 'quarterly', 'custom'].forEach(function (f) {
      var btn = document.getElementById('ag-freq-' + f);
      if (btn) {
        if (f === freq.toLowerCase()) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });

    var monthsInp = document.getElementById('ag-months');
    if (freq === 'Monthly') {
      if (monthsInp) monthsInp.value = 1;
    } else if (freq === 'Quarterly') {
      if (monthsInp) monthsInp.value = 3;
    } else {
      if (monthsInp) {
        monthsInp.focus();
        monthsInp.select();
      }
    }

    updateAutoGenerateNarration();
    recalcAgSummary();
  };

  window.onAgBillDateChange = function () {
    var bDateVal = document.getElementById('ag-bill-date').value;
    if (bDateVal) {
      try {
        var d = new Date(bDateVal);
        d.setDate(d.getDate() + 19);
        var yyyy = d.getFullYear();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        document.getElementById('ag-due-date').value = yyyy + '-' + mm + '-' + dd;
      } catch (e) {}
    }
  };

  window.onAgPeriodSelectChange = function (val) {
    var pInp = document.getElementById('ag-period');
    if (pInp) pInp.value = val;
    updateAutoGenerateNarration();
    recalcAgSummary();
  };

  window.onAgMonthsInput = function (val) {
    var m = parseInt(val, 10) || 1;
    ['monthly', 'quarterly', 'custom'].forEach(function (f) {
      var btn = document.getElementById('ag-freq-' + f);
      if (btn) btn.classList.remove('active');
    });
    if (m === 1) {
      var b1 = document.getElementById('ag-freq-monthly');
      if (b1) b1.classList.add('active');
    } else if (m === 3) {
      var b3 = document.getElementById('ag-freq-quarterly');
      if (b3) b3.classList.add('active');
    } else {
      var bc = document.getElementById('ag-freq-custom');
      if (bc) bc.classList.add('active');
    }

    updateAutoGenerateNarration();
    recalcAgSummary();
  };

  function updateAutoGenerateNarration() {
    var sel = document.getElementById('ag-bill-type');
    var selectedType = sel ? sel.value : (activeBillType || 'Maintenance');
    var periodSel = document.getElementById('ag-period-select');
    var curPeriod = (periodSel && periodSel.value) ? periodSel.value : getCurrentPeriodName();
    var pInp = document.getElementById('ag-period');
    if (pInp) pInp.value = curPeriod;

    var partInp = document.getElementById('ag-particular');
    if (partInp) partInp.value = selectedType + ' Charges for ' + curPeriod;
  }

  window.updateAutoGenerateFields = function () {
    var sel = document.getElementById('ag-bill-type');
    var selectedType = sel ? sel.value : (activeBillType || 'Maintenance');

    var activeVoucherNo = (typeof getTxNextVoucherNo === 'function') ? getTxNextVoucherNo('bill', bills) : 'MBIL/2026-27/01';
    var startInp = document.getElementById('ag-start-no');
    if (startInp) startInp.value = activeVoucherNo;

    updateAutoGenerateNarration();
    recalcAgSummary();
  };

  window.onAgMemberRangeChange = function () {
    recalcAgSummary();
  };

  function getFilteredAgMembers() {
    if (!members || members.length === 0) return [];
    var fromVal = document.getElementById('ag-member-from') ? document.getElementById('ag-member-from').value : 'ALL';
    var toVal = document.getElementById('ag-member-to') ? document.getElementById('ag-member-to').value : 'ALL';

    var fromIdx = 0;
    var toIdx = members.length - 1;

    if (fromVal !== 'ALL') {
      var f = members.findIndex(function (m) { return (m.memberId || m.socMemId) == fromVal; });
      if (f >= 0) fromIdx = f;
    }
    if (toVal !== 'ALL') {
      var t = members.findIndex(function (m) { return (m.memberId || m.socMemId) == toVal; });
      if (t >= 0) toIdx = t;
    }

    if (fromIdx > toIdx) {
      var temp = fromIdx;
      fromIdx = toIdx;
      toIdx = temp;
    }

    return members.slice(fromIdx, toIdx + 1);
  }

  window.recalcAgSummary = function () {
    var totalMems = members ? members.length : 0;
    var subMems = getFilteredAgMembers();
    var count = subMems.length;

    var months = parseInt(document.getElementById('ag-months')?.value || '1', 10) || 1;
    var incArrears = document.getElementById('ag-opt-arrears')?.checked !== false;
    var incInterest = document.getElementById('ag-opt-interest')?.checked !== false;

    var totalAmt = 0;
    var totalInt = 0;
    var totalArr = 0;

    subMems.forEach(function (m) {
      var prin = parseFloat(m.opPrincipal || m.opPrin || m.maintenanceAmount || 2500) || 2500;
      totalAmt += (prin * months);

      if (incInterest) {
        var intAmt = parseFloat(m.opInterest || m.interest || 0) || 0;
        if (intAmt <= 0 && prin > 0) intAmt = Math.round(prin * 0.015);
        totalInt += intAmt;
      }

      if (incArrears) {
        var arrAmt = parseFloat(m.arrears || m.dueAmount || 0) || 0;
        if (arrAmt <= 0 && m.totalOpening && m.totalOpening > 0) arrAmt = parseFloat(m.totalOpening);
        totalArr += arrAmt;
      }
    });

    var grandTotal = totalAmt + totalInt + totalArr;

    var elMems = document.getElementById('ag-sum-total-members');
    if (elMems) elMems.textContent = totalMems;

    var elBills = document.getElementById('ag-sum-bills-count');
    if (elBills) elBills.textContent = count;

    var elAmt = document.getElementById('ag-sum-amount');
    if (elAmt) elAmt.textContent = '₹ ' + totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var elInt = document.getElementById('ag-sum-interest');
    if (elInt) elInt.textContent = '₹ ' + totalInt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var elArr = document.getElementById('ag-sum-arrears');
    if (elArr) elArr.textContent = '₹ ' + totalArr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var elGrand = document.getElementById('ag-sum-grand');
    if (elGrand) elGrand.textContent = '₹ ' + grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  window.openAgBatchPreviewModal = function () {
    var subMems = getFilteredAgMembers();
    var tbody = document.getElementById('ag-batch-preview-tbody');
    var startNo = document.getElementById('ag-start-no')?.value || 'MBIL/2026-27/01';
    var prefix = startNo.replace(/\d+$/, '');
    var startNumMatch = startNo.match(/(\d+)$/);
    var startNum = startNumMatch ? parseInt(startNumMatch[1], 10) : 1;
    var padLen = startNumMatch ? startNumMatch[1].length : 2;

    var months = parseInt(document.getElementById('ag-months')?.value || '1', 10) || 1;
    var incArrears = document.getElementById('ag-opt-arrears')?.checked !== false;
    var incInterest = document.getElementById('ag-opt-interest')?.checked !== false;

    var html = '';
    var totalSum = 0;

    subMems.forEach(function (m, idx) {
      var curNum = startNum + idx;
      var bNo = prefix + String(curNum).padStart(padLen, '0');
      var flat = (m.wing ? m.wing + '-' : '') + (m.flatNo || m.memCode || '—');
      var name = m.memName || m.name || 'Member ' + (idx + 1);

      var prin = (parseFloat(m.opPrincipal || m.opPrin || m.maintenanceAmount || 2500) || 2500) * months;
      var intAmt = incInterest ? (parseFloat(m.opInterest || m.interest || 0) || Math.round(prin * 0.015)) : 0;
      var arrAmt = incArrears ? (parseFloat(m.arrears || m.dueAmount || m.totalOpening || 0) || 0) : 0;
      var rowTot = prin + intAmt + arrAmt;
      totalSum += rowTot;

      html += '<tr>' +
        '<td style="font-weight:700; color:#1565C0;">' + bNo + '</td>' +
        '<td>' + flat + '</td>' +
        '<td style="font-weight:600;">' + name + '</td>' +
        '<td style="text-align:right;">' + prin.toFixed(2) + '</td>' +
        '<td style="text-align:right;">' + intAmt.toFixed(2) + '</td>' +
        '<td style="text-align:right;">' + arrAmt.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#16a34a;">' + rowTot.toFixed(2) + '</td>' +
        '</tr>';
    });

    if (tbody) tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center; padding:20px;">No members selected</td></tr>';
    var fEl = document.getElementById('ag-batch-preview-footer');
    if (fEl) fEl.textContent = subMems.length + ' Bills Preview — Grand Total: ₹ ' + totalSum.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    var modal = document.getElementById('modal-ag-batch-preview');
    if (modal) modal.style.display = 'flex';
  };

  window.openAutoGenerateModal = function () {
    var sel = document.getElementById('ag-bill-type');
    var activeTypeName = (activeBillType === 'ALL' ? 'MAINTENANCE' : activeBillType.toUpperCase());

    if (sel) {
      var html = '';
      billTypes.forEach(function (bt) {
        var name = bt.billTypeName || bt.name || 'Maintenance';
        var btid = bt.billTypeId || bt.id || '';
        var selected = (name.toUpperCase() === activeTypeName ? ' selected' : '');
        html += '<option value="' + escHtml(name) + '" data-id="' + btid + '"' + selected + '>' + name + '</option>';
      });
      if (!html) html = '<option value="Maintenance">Maintenance</option>';
      sel.innerHTML = html;
    }

    var pSel = document.getElementById('ag-period-select');
    if (pSel) {
      var monthNames = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
      var dNow = new Date();
      var curMonthIdx = dNow.getMonth();
      var curYear = dNow.getFullYear();
      var pHtml = '';

      var fyStartYear = curMonthIdx >= 3 ? curYear : (curYear - 1);
      monthNames.forEach(function (mName, idx) {
        var mYear = (idx < 9) ? fyStartYear : (fyStartYear + 1);
        var pVal = mName + ' ' + mYear;
        var isCur = (pVal.toUpperCase() === getCurrentPeriodName().toUpperCase() || (idx === 5));
        pHtml += '<option value="' + pVal + '"' + (isCur ? ' selected' : '') + '>' + pVal + '</option>';
      });
      pSel.innerHTML = pHtml;
      var curP = pSel.value;
      if (document.getElementById('ag-period')) document.getElementById('ag-period').value = curP;
    }

    var defaultAgBillDate = (typeof getFYDefaultDate === 'function') ? getFYDefaultDate() : todayISO();
    document.getElementById('ag-bill-date').value = defaultAgBillDate;

    var defaultAgDueDate = futureISO(20);
    if (typeof isInActiveFY === 'function' && !isInActiveFY(defaultAgDueDate)) {
      var fyR = (typeof getFYDateRange === 'function') ? getFYDateRange() : null;
      if (fyR && defaultAgDueDate > fyR.endDate) defaultAgDueDate = fyR.endDate;
    }
    document.getElementById('ag-due-date').value = defaultAgDueDate;

    if (typeof applyFYDateRestrictions === 'function') {
      applyFYDateRestrictions(document.getElementById('modal-auto-generate'));
    }

    selectAgFrequency('Monthly');

    var fromSel = document.getElementById('ag-member-from');
    var toSel = document.getElementById('ag-member-to');
    if (fromSel && toSel && members && members.length > 0) {
      var fromHtml = '<option value="ALL">All Members (Start)</option>';
      var toHtml = '<option value="ALL">All Members (End)</option>';

      var sortedMems = members.slice().sort(function (a, b) {
        var fA = (a.wing ? a.wing + '-' : '') + (a.flatNo || a.memCode || '');
        var fB = (b.wing ? b.wing + '-' : '') + (b.flatNo || b.memCode || '');
        return fA.localeCompare(fB, undefined, { numeric: true });
      });

      sortedMems.forEach(function (m) {
        var flat = (m.wing ? m.wing + '-' : '') + (m.flatNo || m.memCode || '');
        var name = m.memName || m.name || '';
        var val = m.memberId || m.socMemId;
        var label = '[' + flat + '] ' + name;
        fromHtml += '<option value="' + val + '">' + escHtml(label) + '</option>';
        toHtml += '<option value="' + val + '">' + escHtml(label) + '</option>';
      });

      fromSel.innerHTML = fromHtml;
      toSel.innerHTML = toHtml;
    }

    updateAutoGenerateFields();
    recalcAgSummary();

    document.getElementById('modal-auto-generate').style.display = 'flex';
  };

  window.runAutoGenerate = async function () {
    var sel = document.getElementById('ag-bill-type');
    var billTypeVal = (sel && sel.value) ? sel.value : 'Maintenance';
    var billTypeIdVal = (sel && sel.options && sel.selectedIndex >= 0) ? sel.options[sel.selectedIndex].getAttribute('data-id') : null;
    var startNo = document.getElementById('ag-start-no').value || 'MBIL/2026-27/01';
    var billDateVal = document.getElementById('ag-bill-date').value || (typeof getFYDefaultDate === 'function' ? getFYDefaultDate() : todayISO());
    
    if (typeof isInActiveFY === 'function' && !isInActiveFY(billDateVal)) {
      var fyRange = (typeof getFYDateRange === 'function') ? getFYDateRange() : null;
      alert('Auto-generate Bill Date must fall within the current Financial Year' + (fyRange ? ' (' + formatDate(fyRange.startDate) + ' to ' + formatDate(fyRange.endDate) + ')' : '') + '.');
      document.getElementById('ag-bill-date').focus();
      return;
    }

    var dueDateVal = document.getElementById('ag-due-date').value || futureISO(20);
    var periodVal = document.getElementById('ag-period').value || getCurrentPeriodName();
    var particularVal = document.getElementById('ag-particular').value || (billTypeVal + ' Charges for ' + periodVal);

    var sid = parseInt(getActiveSocietyId(), 10);
    var fyid = parseInt(getFyId(), 10);

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var url = baseHost.replace(/\/api\/?$/, '') + '/api/member-bills/generate-batch';
      var token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      var memberFromVal = document.getElementById('ag-member-from') ? document.getElementById('ag-member-from').value : 'ALL';
      var memberToVal = document.getElementById('ag-member-to') ? document.getElementById('ag-member-to').value : 'ALL';

      var res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          societyId: sid,
          fyId: fyid,
          billType: billTypeVal,
          billTypeId: billTypeIdVal ? parseInt(billTypeIdVal, 10) : null,
          startNo: startNo,
          period: periodVal,
          particular1: particularVal,
          billDate: billDateVal,
          dueDate: dueDateVal,
          memberFrom: memberFromVal === 'ALL' ? null : parseInt(memberFromVal, 10),
          memberTo: memberToVal === 'ALL' ? null : parseInt(memberToVal, 10)
        })
      });

      var json = await res.json();
      if (res.ok && json && json.success) {
        closeModal('modal-auto-generate');
        toast(json.message || 'Bills generated successfully from Billing Master!', true);
        if (activeBillType !== 'ALL') {
          activeBillType = billTypeVal.toUpperCase();
          document.querySelectorAll('.mb-type-pill').forEach(function(p) {
            if (p.textContent.trim().toUpperCase() === activeBillType) {
              p.classList.add('active');
            } else {
              p.classList.remove('active');
            }
          });
        }
        await loadBills();
        return;
      } else {
        toast((json && json.message) || 'Failed to generate bills.', false);
        return;
      }
    } catch (e) {
      console.warn('API batch generation error:', e);
      toast('Failed to connect to billing service.', false);
      return;
    }

    // Client-side fallback reading live matrix
    var matrixData = await fetchApiData('/api/billing-master?billType=' + encodeURIComponent(billTypeVal) + '&societyId=' + sid);
    var matrixMap = {};
    if (matrixData && Array.isArray(matrixData)) {
      matrixData.forEach(function (r) { matrixMap[r.memberId] = r; });
    }

    // Member range filter
    var memberFromVal = document.getElementById('ag-member-from') ? document.getElementById('ag-member-from').value : 'ALL';
    var memberToVal = document.getElementById('ag-member-to') ? document.getElementById('ag-member-to').value : 'ALL';
    var fromIdx = 0;
    var toIdx = members.length - 1;
    if (memberFromVal !== 'ALL') {
      var fIdx = members.findIndex(function (m) { return (m.memberId || m.socMemId) == memberFromVal; });
      if (fIdx >= 0) fromIdx = fIdx;
    }
    if (memberToVal !== 'ALL') {
      var tIdx = members.findIndex(function (m) { return (m.memberId || m.socMemId) == memberToVal; });
      if (tIdx >= 0) toIdx = tIdx;
    }
    if (fromIdx > toIdx) {
      var tmp = fromIdx;
      fromIdx = toIdx;
      toIdx = tmp;
    }
    var filteredMembers = members.slice(fromIdx, toIdx + 1);

    var prefix = startNo.replace(/\d+$/, '');
    var startNumMatch = startNo.match(/(\d+)$/);
    var startNum = startNumMatch ? parseInt(startNumMatch[1], 10) : 1;

    var skippedKeys = ['cgst', 'sgst', 'principal', 'total heads', 'lia-1032', 'lia-1033'];
    var generatedCount = 0;
    filteredMembers.forEach(function (m, idx) {
      var num = startNum + idx;
      var billNo = prefix + num;
      var memCode = m.memCode || m.memberCode || 'M00' + (idx + 1);
      var memName = m.memName || m.name || 'Member ' + (idx + 1);
      var mId = m.memberId || m.socMemId || (idx + 1);

      var prin = 0;
      var interest = 0;  // Start from 0 — only use matrix value, NOT opInterest
      if (matrixMap[mId] && matrixMap[mId].amounts) {
        var ams = matrixMap[mId].amounts;
        for (var k in ams) {
          var kl = k.toLowerCase();
          if (kl === 'interest' || k === 'INC-1008') {
            interest = ams[k];  // Use saved matrix interest directly
          } else if (skippedKeys.indexOf(kl) === -1) {
            prin += (ams[k] || 0);
          }
        }
      }
      if (prin <= 0) prin = m.opPrincipal || m.opPrin || 0;
      if (prin <= 0 && interest <= 0) return;

      var newBill = {
        billId: Date.now() + idx,
        societyId: sid,
        fyId: fyid,
        billNo: billNo,
        billType: billTypeVal,
        billDate: billDateVal,
        dueDate: dueDateVal,
        period: periodVal,
        memberId: mId,
        memberCode: memCode,
        memberName: memName,
        wing: m.wing || m.Wing || 'A',
        flatType: m.flatType || 'Flat',
        principalAmount: prin,
        interestAmount: interest,
        totalAmount: prin + interest,
        particular1: particularVal,
        particular2: '',
        status: 'Unpaid'
      };

      bills.unshift(newBill);
      generatedCount++;
    });

    localStorage.setItem('jeevika_member_bills_' + sid, JSON.stringify(bills));
    closeModal('modal-auto-generate');
    toast('Generated ' + generatedCount + ' bills from Billing Master successfully!', true);
    renderBillsTable();
  };

  window.openMultiDeleteModal = function () {
    var badge = document.getElementById('md-prefix-badge');
    if (badge) badge.textContent = getActiveBillPrefix();
    document.getElementById('md-from').value = '';
    document.getElementById('md-to').value = '';
    document.getElementById('modal-multi-delete').style.display = 'flex';
  };

  window.runMultiDelete = async function () {
    var fromNo = (document.getElementById('md-from').value || '').trim();
    var toNo = (document.getElementById('md-to').value || '').trim();

    if (!fromNo || !toNo) {
      toast('Please enter both From Bill No and To Bill No.', false);
      return;
    }

    var sid = parseInt(getActiveSocietyId(), 10);
    var fyid = parseInt(getFyId(), 10);

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var url = baseHost.replace(/\/api\/?$/, '') + '/api/member-bills/multi-delete';
      var token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      var res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          societyId: sid,
          fyId: fyid,
          fromBillNo: fromNo,
          toBillNo: toNo
        })
      });

      var json = await res.json();
      if (res.ok && json && json.success) {
        closeModal('modal-multi-delete');
        toast(json.message || 'Bills in range deleted successfully.', true);
        await loadBills();
        return;
      } else {
        toast((json && json.message) || 'Failed to delete bills in range.', false);
      }
    } catch (e) {
      console.warn('Multi-delete API error:', e);
    }

    // Client-side fallback if offline
    var numFrom = parseInt(fromNo, 10) || 0;
    var numTo = parseInt(toNo, 10) || 0;
    if (numFrom > numTo) { var t = numFrom; numFrom = numTo; numTo = t; }

    var initialCount = bills.length;
    bills = bills.filter(function (b) {
      var numMatch = (b.billNo || '').match(/(\d+)$/);
      if (numMatch) {
        var n = parseInt(numMatch[1], 10);
        if (n >= numFrom && n <= numTo) return false;
      }
      var no = (b.billNo || '').toLowerCase();
      return !(no >= fromNo.toLowerCase() && no <= toNo.toLowerCase());
    });

    var deletedCount = initialCount - bills.length;
    localStorage.setItem('jeevika_member_bills_' + sid, JSON.stringify(bills));
    closeModal('modal-multi-delete');
    toast('Multi-deleted ' + deletedCount + ' bill(s) in range.', true);
    renderBillsTable();
  };

  window.openMultiChangeModal = function () {
    document.getElementById('mc-from').value = '';
    document.getElementById('mc-to').value = '';
    document.getElementById('mc-value').value = '';
    document.getElementById('modal-multi-change').style.display = 'flex';
  };

  window.runMultiChange = function () {
    var fromNo = (document.getElementById('mc-from').value || '').trim().toLowerCase();
    var toNo = (document.getElementById('mc-to').value || '').trim().toLowerCase();
    var field = document.getElementById('mc-field').value;
    var newVal = document.getElementById('mc-value').value;

    if (!fromNo || !toNo || !newVal) {
      toast('Please fill in From Bill No, To Bill No, and New Value.', false);
      return;
    }

    var updatedCount = 0;
    bills.forEach(function (b) {
      var no = (b.billNo || '').toLowerCase();
      if (no >= fromNo && no <= toNo) {
        b[field] = newVal;
        updatedCount++;
      }
    });

    localStorage.setItem('jeevika_member_bills_' + getActiveSocietyId(), JSON.stringify(bills));
    closeModal('modal-multi-change');
    toast('Updated ' + field + ' for ' + updatedCount + ' bill(s).', true);
    renderBillsTable();
  };

  window.closeModal = function (id) {
    var modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  };

  function todayISO() {
    var d = new Date();
    return d.toISOString().split('T')[0];
  }

  function futureISO(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  function numToWords(n) {
    var num = Math.round(n);
    if (num <= 0) return 'Zero';
    var a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    var b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function inWords(num) {
      if ((num = num.toString()).length > 9) return 'overflow';
      var n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
      if (!n) return '';
      var str = '';
      str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + ' Crore ' : '';
      str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + ' Lakh ' : '';
      str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + ' Thousand ' : '';
      str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + ' Hundred ' : '';
      str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
      return str.trim();
    }
    return inWords(num);
  }

  window.previewInvoice = async function (targetBillId) {
    var bId = targetBillId || selectedBillId;
    if (!bId && bills && bills.length > 0) {
      bId = bills[0].billId || bills[0].billNo;
    }
    if (!bId) {
      toast('Please select a bill to preview.', false);
      return;
    }

    var bill = bills.find(function (x) { return String(x.billId) === String(bId) || String(x.billNo) === String(bId); });
    var items = [];

    var numericId = parseInt(bId, 10);
    if (numericId > 0) {
      try {
        var detail = await fetchApiData('/api/member-bills/' + numericId);
        if (detail) {
          if (detail.data) bill = Object.assign({}, bill || {}, detail.data);
          if (detail.items && Array.isArray(detail.items)) items = detail.items;
        }
      } catch (e) {}
    }

    if (!bill) {
      toast('Bill details not found.', false);
      return;
    }

    var sid = getActiveSocietyId();
    var socInfo = {};
    try {
      var socRes = await fetchApiData('/api/societies/' + sid);
      if (socRes && socRes.data) socInfo = socRes.data;
      else if (socRes && !socRes.data && socRes.societyName) socInfo = socRes;
    } catch (e) {}

    var btHeads = [];
    var btId = bill.billTypeId;
    if (!btId && billTypes) {
      var matchBt = billTypes.find(function (t) { return (t.billTypeName || '').toLowerCase() === (bill.billType || '').toLowerCase(); });
      if (matchBt) btId = matchBt.billTypeId || matchBt.id;
    }
    if (btId) {
      try {
        var btRes = await fetchApiData('/api/bill-types/' + btId);
        if (btRes && btRes.heads) btHeads = btRes.heads;
      } catch (e) {}
    }

    // Categorize items into NON-GST, EXEMPT-GST, and GST APPLICABLE
    var nonGstItems = [];
    var exemptGstItems = [];
    var gstAppItems = [];
    var cgstAmt = 0;
    var sgstAmt = 0;
    var cgstPct = socInfo.cgstPct || 9;
    var sgstPct = socInfo.sgstPct || 9;

    items.forEach(function (it) {
      var c = (it.accountCode || '').toUpperCase().trim();
      var n = (it.accountName || '').toLowerCase().trim();
      var amt = parseFloat(it.amount) || 0;

      if (c === 'LIA-1032' || n.includes('cgst')) {
        cgstAmt += amt;
        return;
      }
      if (c === 'LIA-1033' || n.includes('sgst')) {
        sgstAmt += amt;
        return;
      }
      if (c === 'INC-1008' || n === 'interest') {
        return;
      }

      var headDef = btHeads.find(function (h) {
        return (h.accCode && h.accCode.toUpperCase().trim() === c) ||
               (h.accName && h.accName.toLowerCase().trim() === n);
      });

      if (headDef) {
        if (headDef.gstApp) gstAppItems.push({ name: it.accountName, amount: amt });
        else if (headDef.gstExm) exemptGstItems.push({ name: it.accountName, amount: amt });
        else nonGstItems.push({ name: it.accountName, amount: amt });
      } else {
        if (n.includes('tax') || n.includes('water') || n.includes('electricity') || n.includes('n.a.')) {
          nonGstItems.push({ name: it.accountName, amount: amt });
        } else if (n.includes('service') || n.includes('sinking') || n.includes('repair') || n.includes('welfare')) {
          exemptGstItems.push({ name: it.accountName, amount: amt });
        } else {
          gstAppItems.push({ name: it.accountName, amount: amt });
        }
      }
    });

    var nonGstTotal = nonGstItems.reduce(function (sum, x) { return sum + x.amount; }, 0);
    var exemptGstTotal = exemptGstItems.reduce(function (sum, x) { return sum + x.amount; }, 0);
    var gstAppTotal = gstAppItems.reduce(function (sum, x) { return sum + x.amount; }, 0);

    // If GST amounts were not in line items but society has GST enabled
    if (cgstAmt <= 0 && sgstAmt <= 0) {
      var limit = socInfo.exemptLimit || 7500;
      var taxBase = ((gstAppTotal + exemptGstTotal) > limit) ? (gstAppTotal + exemptGstTotal) : gstAppTotal;
      if (taxBase > 0) {
        cgstAmt = Math.round((taxBase * cgstPct) / 100);
        sgstAmt = Math.round((taxBase * sgstPct) / 100);
      }
    }

    var totalGstHeadWithTax = gstAppTotal + cgstAmt + sgstAmt;
    var totalNonAndExempt = nonGstTotal + exemptGstTotal;
    var currentBill = totalGstHeadWithTax + totalNonAndExempt;
    var interestAmt = parseFloat(bill.interestAmount || 0);
    var totalDues = currentBill + interestAmt;

    // Member info
    var mFlat = bill.flatNo || '';
    var mWing = bill.wing || '';
    var mName = bill.memberName || '';
    var mArea = '550';
    var matchedM = members.find(function (m) { return (m.memberId || m.socMemId) === bill.memberId; });
    if (matchedM) {
      if (matchedM.carpetArea || matchedM.sqft || matchedM.areaSqft) {
        mArea = matchedM.carpetArea || matchedM.sqft || matchedM.areaSqft;
      }
    }

    var socName = socInfo.societyName || getSocietyName() || 'SHREE SAI USHA COMPLEX CO-OP. HOUSING SOCIETY LTD.';
    var socReg = socInfo.registrationNo ? ('Registration No.: ' + socInfo.registrationNo) : 'Registration No.: BOM/WSG/TC/9121/2001-2005 DT.17.08.2004';
    var socAddr = socInfo.address ? ('Address: ' + socInfo.address + (socInfo.city ? ', ' + socInfo.city : '') + (socInfo.pincode ? ' - ' + socInfo.pincode : '')) : 'Address: KHANDELWAL MARG, NEAR USHA NAGAR, BHANDUP (WEST), MUMBAI - 400 078.';
    var socEmail = socInfo.email || socInfo.contactEmail1 || 'shreesaiushachsl@gmail.com';
    var socPhone = socInfo.phone || socInfo.contactPhone1 || '+91 9987962108';
    var socPan = socInfo.panNumber || 'AACAS3185R';
    var socGstin = socInfo.gstNumber || '27AACAS3185R1ZR';

    var periodTxt = bill.period || getCurrentPeriodName();
    var billNoTxt = bill.billNo || '1274';
    var billDateTxt = bill.billDate || todayISO();
    var dueDateTxt = bill.dueDate || futureISO(15);

    var wordsTxt = numToWords(totalDues);

    var win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>GST Invoice - ' + billNoTxt + '</title>' +
      '<style>' +
      '* { box-sizing: border-box; margin: 0; padding: 0; }' +
      'body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 20px; }' +
      '.bill-box { border: 2px solid #000; width: 850px; margin: 0 auto; }' +
      '.header-box { text-align: center; padding: 8px 12px; border-bottom: 1px solid #000; }' +
      '.header-box h1 { font-size: 14px; font-weight: bold; margin-bottom: 3px; }' +
      '.header-box .sub { font-size: 10px; line-height: 1.35; }' +
      '.header-pan-gst { font-size: 10.5px; font-weight: bold; margin-top: 4px; display: flex; justify-content: space-around; }' +
      '.meta-box { display: flex; border-bottom: 1px solid #000; }' +
      '.meta-left { flex: 1.5; padding: 6px 10px; border-right: 1px solid #000; font-size: 11px; }' +
      '.meta-left-row { display: flex; justify-content: space-between; margin-bottom: 4px; }' +
      '.meta-right { flex: 1; border-left: 1px solid #000; }' +
      '.meta-right-title { text-align: center; font-weight: bold; font-size: 11px; padding: 4px; border-bottom: 1px solid #000; background: #f2f2f2; }' +
      '.meta-right-grid { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #000; }' +
      '.meta-right-grid div { padding: 4px 6px; border-right: 1px solid #000; border-bottom: 1px solid #000; text-align: center; font-size: 10.5px; }' +
      '.meta-right-grid div:nth-child(2n) { border-right: none; }' +
      '.meta-right-period { text-align: center; padding: 4px; font-weight: bold; font-size: 10.5px; }' +
      '.main-grid { display: flex; }' +
      '.col-left { flex: 1.5; border-right: 1px solid #000; }' +
      '.col-right { flex: 1; }' +
      'table.part-table { width: 100%; border-collapse: collapse; }' +
      'table.part-table th { border-bottom: 1px solid #000; padding: 4px 8px; font-size: 10.5px; text-align: left; }' +
      'table.part-table td { padding: 2px 8px; font-size: 10.5px; vertical-align: top; }' +
      '.sec-title { font-weight: bold; font-size: 11px; padding: 5px 8px 3px; text-transform: uppercase; }' +
      '.sec-subtot { font-weight: bold; text-align: right; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2px 8px; }' +
      'table.sum-table { width: 100%; border-collapse: collapse; }' +
      'table.sum-table th { border-bottom: 1px solid #000; padding: 4px 8px; font-size: 11px; text-align: center; background: #f2f2f2; }' +
      'table.sum-table td { padding: 3px 8px; font-size: 10.5px; }' +
      '.sum-highlight { font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; }' +
      '.curr-bill-row { font-weight: bold; background: #e8e8e8; border-top: 1px solid #000; border-bottom: 1px solid #000; }' +
      '.dues-row { font-weight: bold; font-size: 12px; border-top: 1px solid #000; border-bottom: 1px solid #000; }' +
      '.words-box { background: #f0f0f0; padding: 6px 8px; font-size: 10.5px; font-weight: bold; border-top: 1px solid #000; }' +
      '.notes-sec { padding: 6px 10px; border-top: 1px solid #000; font-size: 10px; }' +
      '.print-bar { text-align: center; margin-bottom: 12px; }' +
      '.print-btn { padding: 6px 18px; font-size: 12px; font-weight: bold; background: #1565C0; color: #fff; border: none; border-radius: 4px; cursor: pointer; }' +
      '@media print { .print-bar { display: none; } body { padding: 0; } }' +
      '</style></head><body>' +
      '<div class="print-bar"><button class="print-btn" onclick="window.print()">Print Invoice (Ctrl+P)</button></div>' +
      '<div class="bill-box">' +
      '<div class="header-box">' +
      '<h1>' + socName + '</h1>' +
      '<div class="sub">' + socReg + '</div>' +
      '<div class="sub">' + socAddr + '</div>' +
      '<div class="sub">email Id: ' + socEmail + ' Tel.No.: ' + socPhone + '</div>' +
      '<div class="header-pan-gst"><span>PAN No.: ' + socPan + '</span><span>GSTIN: ' + socGstin + ' (SAC - 9995)</span></div>' +
      '</div>' +
      '<div class="meta-box">' +
      '<div class="meta-left">' +
      '<div class="meta-left-row"><span>Flat No. <strong>' + mFlat + '</strong></span><span>Floor <strong>EIGHT</strong></span><span>Bldg. No. <strong>2</strong></span><span>Wing <strong>\"' + mWing + '\"</strong></span></div>' +
      '<div style="display:flex; justify-content:space-between; margin-top:8px;"><div>Name: <strong>' + mName + '</strong></div><div>Area: <strong>' + mArea + ' Sq.Ft.</strong></div></div>' +
      '</div>' +
      '<div class="meta-right">' +
      '<div class="meta-right-title">GST INVOICE</div>' +
      '<div class="meta-right-grid"><div>No.</div><div><strong>' + billNoTxt + '</strong></div><div>Date</div><div><strong>' + billDateTxt + '</strong></div><div>Due Date</div><div><strong>' + dueDateTxt + '</strong></div></div>' +
      '<div class="meta-right-period">' + periodTxt.toUpperCase() + '</div>' +
      '</div></div>' +
      '<div class="main-grid">' +
      '<div class="col-left">' +
      '<table class="part-table"><thead><tr><th style="width:65%;">Particulars</th><th style="width:20%; text-align:right;">Amount</th><th style="width:15%; text-align:right;">Total</th></tr></thead><tbody>' +
      '<tr><td colspan="3" class="sec-title">NON-GST APPLICABLE ACCOUNT :</td></tr>' +
      nonGstItems.map(function (x) { return '<tr><td style="padding-left:14px;">' + x.name + '</td><td style="text-align:right;">' + x.amount.toFixed(2) + '</td><td></td></tr>'; }).join('') +
      '<tr><td></td><td></td><td class="sec-subtot">' + nonGstTotal.toFixed(2) + '</td></tr>' +
      '<tr><td colspan="3" class="sec-title">EXEMPT-GST ACCOUNT :</td></tr>' +
      exemptGstItems.map(function (x) { return '<tr><td style="padding-left:14px;">' + x.name + '</td><td style="text-align:right;">' + x.amount.toFixed(2) + '</td><td></td></tr>'; }).join('') +
      '<tr><td></td><td></td><td class="sec-subtot">' + exemptGstTotal.toFixed(2) + '</td></tr>' +
      '<tr><td colspan="3" class="sec-title">GST APPLICABLE ACCOUNT :</td></tr>' +
      gstAppItems.map(function (x) { return '<tr><td style="padding-left:14px;">' + x.name + '</td><td style="text-align:right;">' + x.amount.toFixed(2) + '</td><td></td></tr>'; }).join('') +
      '<tr><td></td><td></td><td class="sec-subtot">' + gstAppTotal.toFixed(2) + '</td></tr>' +
      '</tbody></table></div>' +
      '<div class="col-right">' +
      '<table class="sum-table"><thead><tr><th colspan="2">Bill Summary</th></tr></thead><tbody>' +
      '<tr><td>Total (GST A/c Head)</td><td style="text-align:right;">' + gstAppTotal.toFixed(2) + '</td></tr>' +
      '<tr><td>CGST - ' + cgstPct + '%</td><td style="text-align:right;">' + cgstAmt.toFixed(2) + '</td></tr>' +
      '<tr><td>SGST - ' + sgstPct + '%</td><td style="text-align:right;">' + sgstAmt.toFixed(2) + '</td></tr>' +
      '<tr class="sum-highlight"><td>Total GST A/c Head + GST</td><td style="text-align:right;">' + totalGstHeadWithTax.toFixed(2) + '</td></tr>' +
      '<tr><td>Total (Non GST + Exempt GST)</td><td style="text-align:right;">' + totalNonAndExempt.toFixed(2) + '</td></tr>' +
      '<tr class="curr-bill-row"><td>Current Bill</td><td style="text-align:right;">' + currentBill.toFixed(2) + '</td></tr>' +
      '<tr><td>Arrears Prin.</td><td style="text-align:right;">0.00</td></tr>' +
      '<tr><td>Arrears Int.</td><td style="text-align:right;">' + interestAmt.toFixed(2) + '</td></tr>' +
      '<tr><td>Arrears Total</td><td style="text-align:right;">' + interestAmt.toFixed(2) + '</td></tr>' +
      '<tr class="dues-row"><td>Total Dues</td><td style="text-align:right;">Rs. ' + totalDues.toFixed(2) + '</td></tr>' +
      '</tbody></table>' +
      '<div class="words-box">Rupees ' + wordsTxt + ' Only</div>' +
      '</div></div>' +
      '<div class="notes-sec"><strong>Notes:</strong><br>1. Cheques should be drawn in favor of "' + socName + '".<br>2. Late payment interest will be charged on overdue bills as per Society Bye-Laws.<br>3. This is a computer-generated invoice and requires no signature.</div>' +
      '</div></body></html>');
    win.document.close();
  };

  function initShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (document.getElementById('mb-section-form').style.display !== 'none') {
          saveBill();
        }
      } else if (e.key === 'Escape') {
        showList();
      }
    });
  }

})();
