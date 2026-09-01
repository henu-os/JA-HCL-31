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
    document.getElementById('frm-billdate').value = todayISO();
    document.getElementById('frm-duedate').value = futureISO(15);
    document.getElementById('frm-period').value = getCurrentPeriodName();

    document.getElementById('frm-member-input').value = '';
    document.getElementById('frm-memberid').value = '';
    document.getElementById('frm-particular1').value = '';
    document.getElementById('frm-particular2').value = '';

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

    var payload = {
      societyId: parseInt(getActiveSocietyId(), 10),
      fyId: parseInt(getFyId(), 10),
      billNo: document.getElementById('frm-billno').value,
      billTypeId: curTypeId,
      billType: activeTypeName,
      billDate: document.getElementById('frm-billdate').value,
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

  window.updateAutoGenerateFields = function () {
    var sel = document.getElementById('ag-bill-type');
    var selectedType = sel ? sel.value : (activeBillType || 'Maintenance');
    var curPeriod = getCurrentPeriodName();

    var activeVoucherNo = (typeof getTxNextVoucherNo === 'function') ? getTxNextVoucherNo('bill', bills) : 'MBIL/2025-26/01';

    var startInp = document.getElementById('ag-start-no');
    if (startInp) startInp.value = activeVoucherNo;

    var periodInp = document.getElementById('ag-period');
    if (periodInp) periodInp.value = curPeriod;

    var partInp = document.getElementById('ag-particular');
    if (partInp) partInp.value = selectedType + ' Charges for ' + curPeriod;
  };

  window.openAutoGenerateModal = function () {
    var titleEl = document.getElementById('ag-modal-title');
    var activeTypeName = (activeBillType === 'ALL' ? 'MAINTENANCE' : activeBillType.toUpperCase());
    if (titleEl) {
      titleEl.innerHTML = '<i class="bi bi-lightning-charge-fill"></i> Auto Generate Bill | ' + activeTypeName;
    }

    var sel = document.getElementById('ag-bill-type');
    if (sel) {
      var html = '';
      billTypes.forEach(function (bt) {
        var name = bt.billTypeName || bt.name || 'Maintenance';
        var selected = (name.toUpperCase() === activeTypeName ? ' selected' : '');
        html += '<option value="' + escHtml(name) + '"' + selected + '>' + name + '</option>';
      });
      if (!html) html = '<option value="Maintenance">Maintenance</option>';
      sel.innerHTML = html;
    }

    document.getElementById('ag-bill-date').value = todayISO();
    document.getElementById('ag-due-date').value = futureISO(15);

    updateAutoGenerateFields();

    var fromSel = document.getElementById('ag-member-from');
    var toSel = document.getElementById('ag-member-to');
    if (fromSel && toSel) {
      var mHtml = '<option value="ALL">All Members</option>';
      members.forEach(function (m) {
        var code = m.memCode || m.memberCode || '';
        var name = m.memName || m.name || '';
        mHtml += '<option value="' + (m.memberId || m.socMemId) + '">' + code + ' - ' + name + '</option>';
      });
      fromSel.innerHTML = mHtml;
      toSel.innerHTML = mHtml;
    }

    document.getElementById('modal-auto-generate').style.display = 'flex';
  };

  window.runAutoGenerate = async function () {
    var billTypeVal = document.getElementById('ag-bill-type').value || 'Maintenance';
    var startNo = document.getElementById('ag-start-no').value || 'MBIL/25-26/1';
    var billDateVal = document.getElementById('ag-bill-date').value || todayISO();
    var dueDateVal = document.getElementById('ag-due-date').value || futureISO(15);
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
