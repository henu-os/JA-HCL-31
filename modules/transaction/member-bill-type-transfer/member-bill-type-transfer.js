/**
 * member-bill-type-transfer.js — Jeevika ERP v2
 * Member Bill Type Transfer Directory & Balance Info Panel Logic
 */

(function () {
  'use strict';

  var transfers = [];
  var members = [];
  var bills = [];
  var billTypes = [];
  var activeBillType = 'ALL';
  var selectedTransferId = null;
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
    return (window.Auth && window.Auth.getSocietyId) ? window.Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4');
  }

  function getFyId() {
    return (window.Auth && window.Auth.getFYId) ? window.Auth.getFYId() : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1');
  }

  function getFyLabel() {
    return (window.Auth && window.Auth.getFYLabel) ? window.Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');
  }

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

  function getAuthHeaders() {
    var token = (typeof Auth !== 'undefined' && Auth.getToken) 
      ? Auth.getToken() 
      : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
    var societyId = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4';
    var fyId = sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1';

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (societyId) headers['X-Society-Id'] = societyId;
    if (fyId) headers['X-FY-Id'] = fyId;
    return headers;
  }

  async function fetchApiData(endpoint) {
    if (window.API && API.get) {
      try {
        var res = await API.get(endpoint);
        if (res && res.data && Array.isArray(res.data)) return res.data;
        if (Array.isArray(res)) return res;
        if (res) return res;
      } catch (e) {}
    }

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
    } catch (e) {}
    return null;
  }

  // ── 1. LOAD BILL TYPES (REAL-TIME SYNC) ──────────────────────────
  async function loadBillTypes() {
    var sid = getActiveSocietyId();
    billTypes = [];

    // 1. Try to fetch from API
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

    // 3. Fallback to Maintenance ONLY if completely empty
    if (billTypes.length === 0) {
      billTypes = [
        { billTypeId: 1, billTypeName: 'Maintenance' }
      ];
    }

    renderBillTypePills();
    populateFormBillTypeDropdowns();
  }

  function renderBillTypePills() {
    var container = document.getElementById('mtt-billtype-pills');
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
    renderTransfersTable();
  };

  function populateFormBillTypeDropdowns() {
    ['v1-billtype', 'v2-billtype'].forEach(function (selId, idx) {
      var sel = document.getElementById(selId);
      if (sel) {
        var currentVal = sel.value;
        var html = '';
        billTypes.forEach(function (bt) {
          var name = (bt.billTypeName || bt.name || '').trim();
          if (!name) return;
          html += '<option value="' + escHtml(name) + '">' + escHtml(name) + '</option>';
        });
        sel.innerHTML = html;

        if (currentVal && Array.from(sel.options).some(function (o) { return o.value.toUpperCase() === currentVal.toUpperCase(); })) {
          sel.value = currentVal;
        } else {
          if (idx === 0) {
            sel.value = billTypes[0] ? (billTypes[0].billTypeName || billTypes[0].name) : 'Maintenance';
          } else {
            sel.value = billTypes[1] ? (billTypes[1].billTypeName || billTypes[1].name) : (billTypes[0] ? (billTypes[0].billTypeName || billTypes[0].name) : 'Maintenance');
          }
        }
      }
    });
  }

  // ── 2. LOAD MEMBERS (REAL-TIME RESOLUTION) ────────────────────────
  async function loadMembers() {
    var sid = getActiveSocietyId();
    var data = await fetchApiData('/api/members?societyId=' + sid);
    if (!data || (Array.isArray(data) && data.length === 0)) {
      data = await fetchApiData('/api/members');
    }
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
    if (list && list.length > 0) {
      members = list;
    }
    populateMemberDropdowns();
  }

  function populateMemberDropdowns() {
    ['frm-member1', 'frm-member2'].forEach(function (selId, idx) {
      var sel = document.getElementById(selId);
      if (sel) {
        var currentVal = sel.value;
        var html = '<option value="">— Select Member —</option>';
        var seen = {};

        members.forEach(function (m) {
          var id = m.memberId || m.socMemId || m.MemberId || m.id;
          var name = (m.memName || m.memberName || m.name || m.MemName || '').trim();
          if (!name) return;
          var wing = (m.wing || m.Wing || '').trim();
          var flat = (m.flatNo || m.FlatNo || '').trim();
          var code = (m.memCode || m.memberCode || m.MemCode || '').trim();
          var flatLabel = (wing || flat ? (wing ? wing + '-' : '') + flat : '');
          if (!code) code = flatLabel;

          var displayLabel = (code ? code + ' - ' : '') + name + (flatLabel ? ' (' + flatLabel + ')' : '');
          var key = id + '|' + name.toUpperCase();
          if (seen[key]) return;
          seen[key] = true;

          html += '<option value="' + id + '" data-code="' + escHtml(code) + '" data-name="' + escHtml(name) + '" data-wing="' + escHtml(wing) + '" data-flat="' + escHtml(flat) + '">' + escHtml(displayLabel) + '</option>';
        });

        sel.innerHTML = html;
        if (currentVal) sel.value = currentVal;
      }
    });
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

  async function loadTransfers() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var data = await fetchApiData('/api/member-bill-type-transfers?societyId=' + sid + '&fyId=' + fyid);
    if (!data) data = await fetchApiData('/api/vouchers?societyId=' + sid + '&fyId=' + fyid + '&type=MemberBillTypeTransfer');
    if (data) {
      transfers = Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : []);
    } else {
      var stored = localStorage.getItem('jeevika_member_bill_type_transfers_' + sid);
      if (stored) {
        try { transfers = JSON.parse(stored); } catch (e) { transfers = []; }
      } else {
        transfers = [];
      }
    }

    renderTransfersTable();
  }

  // ── 3. RENDER REGISTER TABLE & SORTING ────────────────────────────
  window.toggleTransferNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-trfno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderTransfersTable();
  };

  function renderTransfersTable() {
    var tbody = document.getElementById('mtt-list-tbody');
    if (!tbody) return;

    var filtered = transfers.filter(function (b) {
      var fNo = (document.getElementById('flt-trfno') ? document.getElementById('flt-trfno').value.toLowerCase().trim() : '');
      var fMem = (document.getElementById('flt-member') ? document.getElementById('flt-member').value.toLowerCase().trim() : '');

      if (fNo && (b.trfNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fMem) {
        var mName = (b.memberName || '').toLowerCase();
        var flat = (b.flatNo || '').toLowerCase();
        var mCode = (b.memberCode || '').toLowerCase();
        var lType = (b.leftBillType || '').toLowerCase();
        var rType = (b.rightBillType || '').toLowerCase();
        var part1 = (b.particular1 || '').toLowerCase();
        var part2 = (b.particular2 || '').toLowerCase();

        var matches = (
          mName.indexOf(fMem) !== -1 ||
          flat.indexOf(fMem) !== -1 ||
          mCode.indexOf(fMem) !== -1 ||
          lType.indexOf(fMem) !== -1 ||
          rType.indexOf(fMem) !== -1 ||
          part1.indexOf(fMem) !== -1 ||
          part2.indexOf(fMem) !== -1
        );
        if (!matches) return false;
      }

      return true;
    });

    filtered.sort(function (a, b) {
      var noA = (a.trfNo || '').toLowerCase();
      var noB = (b.trfNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('mtt-list-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Member Bill Type Transfers Found</td></tr>';
      document.getElementById('sum-trf-count').textContent = '0';
      document.getElementById('sum-trf-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalGrd = 0;

    filtered.forEach(function (b) {
      var isSel = (b.trfId === selectedTransferId);
      var amt = parseFloat(b.amount || 0);
      totalGrd += amt;

      var tId = b.trfId || b.voucherId;
      var chkHtml = (window.ERP_MultiChange && typeof ERP_MultiChange.renderCheckbox === 'function')
        ? ERP_MultiChange.renderCheckbox(tId)
        : '<td style="width:36px; text-align:center;"><input type="checkbox" class="row-chk" value="' + tId + '"></td>';

      html += '<tr class="' + (isSel ? 'selected' : '') + '" data-id="'+(b.trfId||b.voucherId||b.voucherNo||b.trfNo||'')+'" onclick="selectTransferRow(this.dataset.id, this)" ondblclick="editSelectedTransfer(this.dataset.id)">' +
        chkHtml +
        '<td style="font-weight:700; color:#1565C0;">' + (b.trfNo || '') + '</td>' +
        '<td>' + (b.trfDate || '') + '</td>' +
        '<td style="text-align:center; font-weight:600;">' + (b.flatNo || '—') + '</td>' +
        '<td style="font-weight:700;">' + (b.memberName || '') + '</td>' +
        '<td style="font-weight:600; color:#1565C0;">' + (b.leftBillType || '—') + '</td>' +
        '<td style="text-align:center; font-weight:700; color:#dc2626;">' + (b.leftType || 'Dr') + '</td>' +
        '<td style="font-weight:600; color:#2E7D32;">' + (b.rightBillType || '—') + '</td>' +
        '<td style="text-align:center; font-weight:700; color:#2E7D32;">' + (b.rightType || 'Cr') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#1565C0;">' + amt.toFixed(2) + '</td>' +
        '<td>' + (b.particular1 || '-') + '</td>' +
        '<td>' + (b.particular2 || '-') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-trf-count').textContent = filtered.length;
    document.getElementById('sum-trf-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    initColumnResizing();
  }

  function initColumnResizing() {
    setTimeout(function () {
      var tables = document.querySelectorAll('table.mtt-main-table');
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

  window.selectTransferRow = function (id, trEl) {
    selectedTransferId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('selected'); });
      trEl.classList.add('selected');
    }
  };

  // ── 4. FORM CONTROLS & VOUCHERS LOGIC ─────────────────────────────
  window.openAddTransferForm = async function () {
    selectedTransferId = null;
    var titleEl = document.getElementById('mtt-module-title');
    if (titleEl) titleEl.textContent = 'New Member Bill Type Transfer';

    try {
      await loadBillTypes();
      await loadMembers();
    } catch (e) {
      console.warn('Error loading master data in openAddTransferForm:', e);
    }

    var trfNoEl = document.getElementById('frm-trfno');
    if (trfNoEl) {
      trfNoEl.value = (typeof getTxNextVoucherNo === 'function') 
        ? getTxNextVoucherNo('transfer', transfers) 
        : ('MTT-B/' + getFyLabel() + '/' + String(transfers.length + 1).padStart(2, '0'));
      trfNoEl.readOnly = false;
      trfNoEl.disabled = false;
    }
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-trfno', 'Transfer');
    
    var dateEl = document.getElementById('frm-trfdate');
    if (dateEl) dateEl.value = todayISO();
    
    var m1El = document.getElementById('frm-member1');
    if (m1El) m1El.value = '';
    var m2El = document.getElementById('frm-member2');
    if (m2El) m2El.value = '';

    if (billTypes && billTypes.length > 0) {
      var v1Bt = document.getElementById('v1-billtype');
      if (v1Bt) v1Bt.value = billTypes[0].billTypeName || 'Maintenance';
      var v2Bt = document.getElementById('v2-billtype');
      if (v2Bt) v2Bt.value = billTypes[1] ? billTypes[1].billTypeName : (billTypes[0].billTypeName || 'Maintenance');
    }
    
    var v1Type = document.getElementById('v1-type');
    if (v1Type) v1Type.value = 'Dr';
    var v1Prin = document.getElementById('v1-principal');
    if (v1Prin) v1Prin.value = '';
    var v1Int = document.getElementById('v1-interest');
    if (v1Int) v1Int.value = '';
    var v1Tot = document.getElementById('v1-total');
    if (v1Tot) v1Tot.value = '';

    var v2Type = document.getElementById('v2-type');
    if (v2Type) v2Type.value = 'Cr';
    var v2Prin = document.getElementById('v2-principal');
    if (v2Prin) v2Prin.value = '';
    var v2Int = document.getElementById('v2-interest');
    if (v2Int) v2Int.value = '';
    var v2Tot = document.getElementById('v2-total');
    if (v2Tot) v2Tot.value = '';

    if (document.getElementById('frm-transtype')) document.getElementById('frm-transtype').value = 'Cash';
    if (document.getElementById('frm-chqno')) document.getElementById('frm-chqno').value = '';
    if (document.getElementById('frm-chqdate')) document.getElementById('frm-chqdate').value = '';
    if (document.getElementById('frm-bank')) document.getElementById('frm-bank').value = '';
    if (document.getElementById('frm-refno')) document.getElementById('frm-refno').value = '';
    if (document.getElementById('frm-particular1')) document.getElementById('frm-particular1').value = '';
    if (document.getElementById('frm-particular2')) document.getElementById('frm-particular2').value = 'Approved by Society';

    if (typeof onMember1Select === 'function') onMember1Select('');
    if (typeof onMember2Select === 'function') onMember2Select('');
    if (typeof recalcTransferTotals === 'function') recalcTransferTotals();

    var listSec = document.getElementById('mtt-section-list');
    if (listSec) listSec.style.display = 'none';
    var prevSec = document.getElementById('mtt-section-preview');
    if (prevSec) prevSec.style.display = 'none';
    var formSec = document.getElementById('mtt-section-form');
    if (formSec) formSec.style.display = 'flex';
  };
  window.handleAddClick = window.openAddTransferForm;

  window.editSelectedTransfer = async function (id) {
    if (id) selectedTransferId = id;
    if (!selectedTransferId) {
      toast('Please select a transfer record to edit.', false);
      return;
    }
    var b = transfers.find(function (x) {
      return String(x.trfId) === String(selectedTransferId) ||
             String(x.voucherId) === String(selectedTransferId) ||
             String(x.trfNo) === String(selectedTransferId) ||
             String(x.voucherNo) === String(selectedTransferId);
    });
    if (!b) { toast('Transfer record not found.', false); return; }

    await loadBillTypes();
    await loadMembers();

    document.getElementById('mtt-module-title').textContent = 'Edit Member Bill Type Transfer [' + (b.trfNo || b.voucherNo) + ']';
    var trfNoEl = document.getElementById('frm-trfno');
    if (trfNoEl) {
      trfNoEl.value = b.trfNo || b.voucherNo || '';
      trfNoEl.readOnly = true;
      trfNoEl.disabled = true;
    }
    document.getElementById('frm-trfdate').value = toIsoDate(b.trfDate || b.date) || todayISO();

    // Match member 1 in dropdown
    var mem1Id = b.member1Id;
    if ((!mem1Id || mem1Id === 0) && members && members.length > 0) {
      var found1 = members.find(function(m) {
        var mCode = (m.memCode || m.code || '').toLowerCase().trim();
        var mName = (m.memName || m.name || '').toLowerCase().trim();
        var mFlat = (m.flatNo || '').toLowerCase().trim();
        var bCode = (b.memberCode || b.memCode || '').toLowerCase().trim();
        var bName = (b.memberName || b.memName || '').toLowerCase().trim();
        var bFlat = (b.flatNo || '').toLowerCase().trim();
        return (bCode && mCode === bCode) ||
               (bFlat && (mFlat === bFlat || (m.wing && (m.wing + '-' + m.flatNo).toLowerCase() === bFlat))) ||
               (bName && (bName.indexOf(mName) !== -1 || mName.indexOf(bName) !== -1));
      });
      if (found1) mem1Id = found1.memberId || found1.socMemId || found1.id;
    }

    var mem2Id = b.member2Id || mem1Id;

    if (mem1Id) {
      document.getElementById('frm-member1').value = mem1Id;
      onMember1Select(mem1Id);
    }
    if (mem2Id) {
      document.getElementById('frm-member2').value = mem2Id;
      onMember2Select(mem2Id);
    }

    if (b.leftBillType) document.getElementById('v1-billtype').value = b.leftBillType;
    if (b.leftType) document.getElementById('v1-type').value = b.leftType;
    document.getElementById('v1-principal').value = (b.leftPrincipal || b.amount || 0).toFixed(2);
    document.getElementById('v1-interest').value = (b.leftInterest || 0).toFixed(2);

    if (b.rightBillType) document.getElementById('v2-billtype').value = b.rightBillType;
    if (b.rightType) document.getElementById('v2-type').value = b.rightType;
    document.getElementById('v2-principal').value = (b.rightPrincipal || b.amount || 0).toFixed(2);
    document.getElementById('v2-interest').value = (b.rightInterest || 0).toFixed(2);

    document.getElementById('frm-particular1').value = b.particular1 || b.narration || '';
    document.getElementById('frm-particular2').value = b.particular2 || '';

    recalcTransferTotals();

    document.getElementById('mtt-section-list').style.display = 'none';
    document.getElementById('mtt-section-form').style.display = 'flex';
  };

  window.recalcTransferTotals = function () {
    var v1Prin = parseFloat(document.getElementById('v1-principal').value) || 0;
    var v1Int = parseFloat(document.getElementById('v1-interest').value) || 0;
    var v1Tot = v1Prin + v1Int;
    document.getElementById('v1-total').value = v1Tot.toFixed(2);

    var v2Prin = parseFloat(document.getElementById('v2-principal').value) || 0;
    var v2Int = parseFloat(document.getElementById('v2-interest').value) || 0;
    var v2Tot = v2Prin + v2Int;
    document.getElementById('v2-total').value = v2Tot.toFixed(2);

    var m1Val = document.getElementById('frm-member1').value;
    var m2Val = document.getElementById('frm-member2').value;

    var m1Obj = members.find(function (x) { return String(x.memberId || x.socMemId || x.id) === String(m1Val); });
    var m2Obj = members.find(function (x) { return String(x.memberId || x.socMemId || x.id) === String(m2Val); });

    var m1Code = m1Obj ? (m1Obj.memCode || m1Obj.memberCode || ((m1Obj.wing ? m1Obj.wing + '-' : '') + (m1Obj.flatNo || ''))) : '—';
    var m2Code = m2Obj ? (m2Obj.memCode || m2Obj.memberCode || ((m2Obj.wing ? m2Obj.wing + '-' : '') + (m2Obj.flatNo || ''))) : '—';

    var v1Bt = document.getElementById('v1-billtype').value;
    var v2Bt = document.getElementById('v2-billtype').value;

    var v1Type = document.getElementById('v1-type').value;
    var v2Type = document.getElementById('v2-type').value;

    var v1Dr = (v1Type === 'Dr' ? v1Tot : 0);
    var v1Cr = (v1Type === 'Cr' ? v1Tot : 0);

    var v2Dr = (v2Type === 'Dr' ? v2Tot : 0);
    var v2Cr = (v2Type === 'Cr' ? v2Tot : 0);

    var tbody = document.getElementById('frm-grid-tbody');
    if (tbody) {
      var html = '';
      html += '<tr>' +
        '<td style="text-align:center; font-weight:700;">1</td>' +
        '<td style="font-family:\'Consolas\', monospace; font-weight:700; color:#1565C0;">' + escHtml(m1Code) + '</td>' +
        '<td style="font-weight:600;">' + escHtml(v1Bt) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace;">' + v1Prin.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace;">' + v1Int.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#dc2626; font-weight:700;">' + v1Dr.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#2E7D32; font-weight:700;">' + v1Cr.toFixed(2) + '</td>' +
        '</tr>';

      html += '<tr>' +
        '<td style="text-align:center; font-weight:700;">2</td>' +
        '<td style="font-family:\'Consolas\', monospace; font-weight:700; color:#2E7D32;">' + escHtml(m2Code) + '</td>' +
        '<td style="font-weight:600;">' + escHtml(v2Bt) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace;">' + v2Prin.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace;">' + v2Int.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#dc2626; font-weight:700;">' + v2Dr.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#2E7D32; font-weight:700;">' + v2Cr.toFixed(2) + '</td>' +
        '</tr>';

      tbody.innerHTML = html;
    }

    var totPrin = v1Prin + v2Prin;
    var totInt = v1Int + v2Int;
    var totDr = v1Dr + v2Dr;
    var totCr = v1Cr + v2Cr;
    var diff = Math.abs(totDr - totCr);

    var diffEl = document.getElementById('frm-net-diff');
    if (diffEl) diffEl.textContent = diff.toFixed(2);
    var pEl = document.getElementById('frm-tot-prin') || document.getElementById('sum-frm-prin');
    if (pEl) pEl.textContent = totPrin.toFixed(2);
    var iEl = document.getElementById('frm-tot-int') || document.getElementById('sum-frm-int');
    if (iEl) iEl.textContent = totInt.toFixed(2);
    var drEl = document.getElementById('frm-tot-dr') || document.getElementById('sum-frm-dr');
    if (drEl) drEl.textContent = totDr.toFixed(2);
    var crEl = document.getElementById('frm-tot-cr') || document.getElementById('sum-frm-cr');
    if (crEl) crEl.textContent = totCr.toFixed(2);
  };

  window.onMember1Select = function (memberId) {
    var nEl = document.getElementById('m1-name');
    var fEl = document.getElementById('m1-flat');
    var mEl = document.getElementById('m1-mob');
    var bEl = document.getElementById('m1-balance-tbody');

    if (!memberId) {
      if (nEl) nEl.textContent = '—';
      if (fEl) fEl.textContent = '—';
      if (mEl) mEl.textContent = '—';
      if (bEl) bEl.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:8px; color:#94a3b8;">No member selected</td></tr>';
      recalcTransferTotals();
      return;
    }

    var m = members.find(function (x) { return String(x.memberId || x.socMemId || x.id) === String(memberId); });
    if (nEl) nEl.textContent = m ? (m.memName || m.memberName || m.name) : '—';
    if (fEl) fEl.textContent = m ? (((m.wing ? m.wing + '-' : '') + (m.flatNo || '')) || '—') : '—';
    if (mEl) mEl.textContent = m ? (m.mobileNo || m.mobile1 || m.contactNo || '—') : '—';

    renderMemberBalanceTable(memberId, 'm1-balance-tbody');
    recalcTransferTotals();
  };

  window.onMember2Select = function (memberId) {
    var nEl = document.getElementById('m2-name');
    var fEl = document.getElementById('m2-flat');
    var mEl = document.getElementById('m2-mob');
    var bEl = document.getElementById('m2-balance-tbody');

    if (!memberId) {
      if (nEl) nEl.textContent = '—';
      if (fEl) fEl.textContent = '—';
      if (mEl) mEl.textContent = '—';
      if (bEl) bEl.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:8px; color:#94a3b8;">No member selected</td></tr>';
      recalcTransferTotals();
      return;
    }

    var m = members.find(function (x) { return String(x.memberId || x.socMemId || x.id) === String(memberId); });
    if (nEl) nEl.textContent = m ? (m.memName || m.memberName || m.name) : '—';
    if (fEl) fEl.textContent = m ? (((m.wing ? m.wing + '-' : '') + (m.flatNo || '')) || '—') : '—';
    if (mEl) mEl.textContent = m ? (m.mobileNo || m.mobile1 || m.contactNo || '—') : '—';

    renderMemberBalanceTable(memberId, 'm2-balance-tbody');
    recalcTransferTotals();
  };

  function renderMemberBalanceTable(memberId, tbodyId) {
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    var memBills = bills.filter(function (b) {
      return String(b.memberId) === String(memberId);
    });

    if (memBills.length === 0) {
      var html = '';
      billTypes.forEach(function (bt) {
        var name = bt.billTypeName || bt.name;
        html += '<tr><td style="padding:4px;">' + escHtml(name) + '</td><td style="text-align:right;">0.00</td><td style="text-align:right;">0.00</td><td style="text-align:right; font-weight:700;">0.00</td></tr>';
      });
      tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center; padding:8px; color:#94a3b8;">0.00 Outstanding</td></tr>';
      return;
    }

    var html = '';
    memBills.forEach(function (b) {
      var p = b.principalAmount || b.balanceAmount || 0;
      var i = b.interestAmount || 0;
      var tot = p + i;
      html += '<tr>' +
        '<td style="padding:4px; font-weight:600;">' + escHtml(b.billType || 'Maintenance') + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace;">' + p.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace;">' + i.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace; font-weight:700;">' + tot.toFixed(2) + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  var isSaving = false;

  // ── 4. SAVE & ACTIONS ─────────────────────────────────────────────
  window.saveTransfer = async function () {
    if (isSaving) return;

    var m1Val = document.getElementById('frm-member1').value;
    var m2Val = document.getElementById('frm-member2').value;

    if (!m1Val) {
      toast('Please select Member 1 (From).', false);
      return;
    }
    if (!m2Val) {
      toast('Please select Member 2 (To).', false);
      return;
    }

    var v1Prin = parseFloat(document.getElementById('v1-principal').value) || 0;
    var v1Int = parseFloat(document.getElementById('v1-interest').value) || 0;
    var v1Tot = v1Prin + v1Int;

    var v2Prin = parseFloat(document.getElementById('v2-principal').value) || 0;
    var v2Int = parseFloat(document.getElementById('v2-interest').value) || 0;
    var v2Tot = v2Prin + v2Int;

    if (v1Tot <= 0 || v2Tot <= 0) {
      toast('Transfer amounts must be greater than zero.', false);
      return;
    }

    if (Math.abs(v1Tot - v2Tot) > 0.009) {
      toast('Left side total (₹' + v1Tot.toFixed(2) + ') must equal Right side total (₹' + v2Tot.toFixed(2) + ').', false);
      return;
    }

    var rNo = (document.getElementById('frm-trfno').value || '').trim();
    if (typeof validateTxVoucherNo === 'function') {
      var vCheck = validateTxVoucherNo('transfer', rNo);
      if (!vCheck.valid) {
        toast(vCheck.error, false);
        return;
      }
    }

    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var wasEditMode = Boolean(selectedTransferId);
    var rId = selectedTransferId || Date.now();

    var m1Obj = members.find(function (x) { return String(x.memberId || x.socMemId || x.id) === String(m1Val); });
    var m2Obj = members.find(function (x) { return String(x.memberId || x.socMemId || x.id) === String(m2Val); });

    var trfDateIso = toIsoDate(document.getElementById('frm-trfdate').value) || todayISO();

    var payload = {
      trfId: rId,
      voucherId: (typeof rId === 'number' && rId < 1000000000000) ? rId : 0,
      societyId: parseInt(sid, 10) || 1,
      fyId: parseInt(fyid, 10) || 1,
      trfNo: rNo,
      voucherNo: rNo,
      trfDate: trfDateIso,
      transferDate: trfDateIso,
      date: trfDateIso,
      member1Id: parseInt(m1Val, 10),
      member2Id: parseInt(m2Val, 10),
      memberName: m1Obj ? (m1Obj.memName || m1Obj.memberName || m1Obj.name) : '',
      memName: m1Obj ? (m1Obj.memName || m1Obj.memberName || m1Obj.name) : '',
      flatNo: m1Obj ? (((m1Obj.wing ? m1Obj.wing + '-' : '') + (m1Obj.flatNo || '')) || '—') : '—',
      memberCode: m1Obj ? (m1Obj.memCode || m1Obj.memberCode || '') : '',
      member2Name: m2Obj ? (m2Obj.memName || m2Obj.memberName || m2Obj.name) : '',
      member2Flat: m2Obj ? (((m2Obj.wing ? m2Obj.wing + '-' : '') + (m2Obj.flatNo || '')) || '—') : '—',
      leftBillType: document.getElementById('v1-billtype').value,
      leftType: document.getElementById('v1-type').value,
      leftPrincipal: v1Prin,
      leftInterest: v1Int,
      rightBillType: document.getElementById('v2-billtype').value,
      rightType: document.getElementById('v2-type').value,
      rightPrincipal: v2Prin,
      rightInterest: v2Int,
      amount: v1Tot,
      transType: document.getElementById('frm-transtype').value,
      chqNo: document.getElementById('frm-chqno').value || '',
      chqDate: toIsoDate(document.getElementById('frm-chqdate').value) || null,
      bankName: document.getElementById('frm-bank').value || '',
      refNo: document.getElementById('frm-refno').value || '',
      particular1: document.getElementById('frm-particular1').value || ('Bill Type Transfer ' + document.getElementById('v1-billtype').value + ' to ' + document.getElementById('v2-billtype').value),
      particular2: document.getElementById('frm-particular2').value || 'Approved by Society',
      status: 'Posted'
    };

    var saveBtn = document.querySelector('.form-action-bar .btn-save-green');
    try {
      isSaving = true;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.6'; }

      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/member-bill-type-transfers' + (wasEditMode ? '/' + encodeURIComponent(selectedTransferId) : ''), {
        method: wasEditMode ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        toast(wasEditMode ? 'Transfer updated successfully!' : 'Transfer saved successfully!', true);
        showList();
        await loadTransfers();
        return;
      } else {
        var errText = await resp.text();
        toast('Failed to save transfer: ' + errText, false);
      }
    } catch (e) {
      toast('Server connection error: ' + (e.message || e), false);
    } finally {
      isSaving = false;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
    }
  };

  // ── 5. DELETE TRANSFER ──────────────────────────────────────────
  window.deleteSelectedTransfer = async function () {
    var checkedIds = (window.ERP_MultiChange && typeof ERP_MultiChange.getSelectedIds === 'function')
      ? ERP_MultiChange.getSelectedIds()
      : [];

    var targetIds = [];
    if (checkedIds.length > 0) {
      targetIds = checkedIds;
    } else if (selectedTransferId) {
      targetIds = [selectedTransferId];
    } else {
      var chks = document.querySelectorAll('#mtt-list-tbody input.row-chk:checked');
      chks.forEach(function (c) { if (c.value) targetIds.push(c.value); });
    }

    if (targetIds.length === 0) {
      toast('Please select a transfer record to delete.', false);
      return;
    }

    var count = targetIds.length;
    var msg = (count === 1)
      ? 'Are you sure you want to delete this transfer voucher?'
      : ('Are you sure you want to delete ' + count + ' selected transfer voucher(s)?');

    var ok = typeof showConfirm === 'function'
      ? await showConfirm(msg, 'Confirm Delete Transfer', { isDanger: true })
      : confirm(msg);

    if (!ok) return;

    var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
    for (var i = 0; i < targetIds.length; i++) {
      var id = targetIds[i];
      var trf = transfers.find(function (r) {
        return String(r.trfId) === String(id) ||
               String(r.voucherId) === String(id) ||
               String(r.trfNo) === String(id) ||
               String(r.voucherNo) === String(id);
      });
      var delId = (trf && (trf.voucherId || trf.trfId)) ? (trf.voucherId || trf.trfId) : id;

      try {
        await fetch(baseHost + '/api/member-bill-type-transfers/' + encodeURIComponent(delId), {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
      } catch (e) {
        try { await fetch(baseHost + '/api/vouchers/' + encodeURIComponent(delId), { method: 'DELETE', headers: getAuthHeaders() }); } catch (err) {}
      }
    }

    selectedTransferId = null;
    if (window.ERP_MultiChange && typeof ERP_MultiChange.clearSelection === 'function') {
      ERP_MultiChange.clearSelection();
    }
    toast('Transfer(s) deleted successfully.', true);
    await loadTransfers();
  };

  // ── 6. PREVIEW & PRINT VOUCHER ────────────────────────────────────
  window.previewTransfer = function () {
    if (!selectedTransferId) {
      toast('Please select a transfer record to preview.', false);
      return;
    }
    var b = transfers.find(function (x) { return x.trfId === selectedTransferId; });
    if (!b) return;

    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';
    var amt = parseFloat(b.amount || 0);

    var printWin = window.open('', '_blank', 'width=800,height=900');
    if (!printWin) { toast('Please allow popups to preview voucher.', false); return; }

    var html = '<!DOCTYPE html><html><head><title>Member Bill Type Transfer Voucher - ' + escHtml(b.trfNo) + '</title>' +
      '<style>' +
      'body { font-family: "Segoe UI", Arial, sans-serif; padding: 20px; color: #1e293b; }' +
      '.hdr { border-bottom: 2px solid #1565C0; text-align: center; padding-bottom: 10px; margin-bottom: 16px; }' +
      '.hdr h2 { color: #1565C0; margin: 0; text-transform: uppercase; font-size: 18px; }' +
      '.meta-row { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12px; }' +
      'table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }' +
      'th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }' +
      'th { background: #1565C0; color: #fff; text-transform: uppercase; font-size: 11px; }' +
      '.total-row { background: #f8fafc; font-weight: bold; }' +
      '</style></head><body>' +
      '<div class="hdr">' +
      '<h2>' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#64748b; margin-top:4px;">Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:8px; color:#1565C0;">MEMBER BILL TYPE TRANSFER VOUCHER</h3>' +
      '</div>' +
      '<div class="meta-row">' +
      '<div>' +
      '<div><strong>Transfer No:</strong> ' + escHtml(b.trfNo) + '</div>' +
      '<div><strong>Date:</strong> ' + escHtml(b.trfDate) + '</div>' +
      '<div><strong>Debit Member:</strong> ' + escHtml(b.memberName) + ' (' + (b.flatNo || '') + ')</div>' +
      '</div>' +
      '<div style="text-align:right;">' +
      '<div><strong>Amount:</strong> ₹' + amt.toFixed(2) + '</div>' +
      '<div><strong>Debit Bill Type:</strong> ' + escHtml(b.leftBillType) + ' (' + (b.leftType || 'Dr') + ')</div>' +
      '<div><strong>Credit Bill Type:</strong> ' + escHtml(b.rightBillType) + ' (' + (b.rightType || 'Cr') + ')</div>' +
      '</div>' +
      '</div>' +
      '<table>' +
      '<thead><tr><th>Description / Particulars</th><th style="text-align:right; width:120px;">Amount (₹)</th></tr></thead>' +
      '<tbody>' +
      '<tr><td>' + escHtml(b.particular1 || 'Member Bill Type Transfer') + '</td><td style="text-align:right; font-weight:bold; color:#1565C0;">' + amt.toFixed(2) + '</td></tr>' +
      '</tbody>' +
      '<tfoot><tr class="total-row"><td style="text-align:right;">TOTAL TRANSFERRED:</td><td style="text-align:right; font-size:13px; color:#1565C0;">₹' + amt.toFixed(2) + '</td></tr></tfoot>' +
      '</table>' +
      '<div style="margin-top:40px; display:flex; justify-content:space-between; font-size:11px;">' +
      '<div><strong>Prepared By</strong><br><br>_____________</div>' +
      '<div><strong>Hon. Treasurer / Secretary</strong><br><br>_____________</div>' +
      '</div></body></html>';

    printWin.document.write(html);
    printWin.document.close();
  };

  // ── 7. MULTI DELETE & MULTI CHANGE ────────────────────────────────
  window.openMultiDeleteModal = function () {
    document.getElementById('md-from').value = '';
    document.getElementById('md-to').value = '';
    document.getElementById('modal-multi-delete').style.display = 'flex';
  };

  window.runMultiDelete = function () {
    var fromNo = (document.getElementById('md-from').value || '').trim().toLowerCase();
    var toNo = (document.getElementById('md-to').value || '').trim().toLowerCase();

    if (!fromNo || !toNo) {
      toast('Please enter both From and To transfer numbers.', false);
      return;
    }

    var initialCount = transfers.length;
    transfers = transfers.filter(function (b) {
      var no = (b.trfNo || '').toLowerCase();
      return !(no >= fromNo && no <= toNo);
    });

    var deletedCount = initialCount - transfers.length;
    localStorage.setItem('jeevika_member_bill_type_transfers_' + getActiveSocietyId(), JSON.stringify(transfers));
    closeModal('modal-multi-delete');
    toast('Multi-deleted ' + deletedCount + ' transfer(s).', true);
    renderTransfersTable();
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
      if (targetText) targetText.textContent = selCount + ' selected transfer(s)';
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
      list: transfers,
      idKey: 'trfId',
      noKey: 'trfNo'
    });

    if (updatedCount > 0) {
      closeModal('modal-multi-change');
      toast('Successfully updated ' + updatedCount + ' transfer(s).', true);
      renderTransfersTable();
    }
  };

  // ── 8. NAVIGATION & SHORTCUTS ────────────────────────────────────
  window.editSelectedTransfer = async function (id) {
    var targetId = id || selectedTransferId;
    if (!targetId) {
      toast('Please select a transfer record to edit.', false);
      return;
    }
    var trf = transfers.find(function (b) {
      return String(b.trfId) === String(targetId) ||
             String(b.voucherId) === String(targetId) ||
             String(b.trfNo) === String(targetId) ||
             String(b.voucherNo) === String(targetId);
    });
    if (!trf) return;

    selectedTransferId = trf.voucherId || trf.trfId || targetId;
    document.getElementById('mtt-module-title').textContent = 'Edit Member Bill Type Transfer (' + (trf.trfNo || trf.voucherNo) + ')';

    await loadBillTypes();
    await loadMembers();

    document.getElementById('frm-trfno').value = trf.trfNo || trf.voucherNo || '';
    document.getElementById('frm-trfdate').value = trf.trfDate || trf.date || todayISO();
    if (document.getElementById('frm-member1')) document.getElementById('frm-member1').value = trf.member1Id || '';
    if (document.getElementById('frm-member2')) document.getElementById('frm-member2').value = trf.member2Id || '';
    if (document.getElementById('v1-billtype')) document.getElementById('v1-billtype').value = trf.leftBillType || 'Major Repair';
    if (document.getElementById('v1-type')) document.getElementById('v1-type').value = trf.leftType || 'Dr';
    if (document.getElementById('v1-principal')) document.getElementById('v1-principal').value = trf.leftPrincipal || trf.amount || '0';
    if (document.getElementById('v1-interest')) document.getElementById('v1-interest').value = trf.leftInterest || '0';
    if (document.getElementById('v2-billtype')) document.getElementById('v2-billtype').value = trf.rightBillType || 'Maintenance';
    if (document.getElementById('v2-type')) document.getElementById('v2-type').value = trf.rightType || 'Cr';
    if (document.getElementById('v2-principal')) document.getElementById('v2-principal').value = trf.rightPrincipal || trf.amount || '0';
    if (document.getElementById('v2-interest')) document.getElementById('v2-interest').value = trf.rightInterest || '0';
    if (document.getElementById('frm-transtype')) document.getElementById('frm-transtype').value = trf.transType || 'Transfer';
    if (document.getElementById('frm-chqno')) document.getElementById('frm-chqno').value = trf.chqNo || '';
    if (document.getElementById('frm-chqdate')) document.getElementById('frm-chqdate').value = trf.chqDate || '';
    if (document.getElementById('frm-bank')) document.getElementById('frm-bank').value = trf.bankName || '';
    if (document.getElementById('frm-refno')) document.getElementById('frm-refno').value = trf.refNo || '';
    if (document.getElementById('frm-particular1')) document.getElementById('frm-particular1').value = trf.particular1 || '';
    if (document.getElementById('frm-particular2')) document.getElementById('frm-particular2').value = trf.particular2 || '';

    if (typeof updateTotals === 'function') updateTotals();
    document.getElementById('mtt-section-list').style.display = 'none';
    document.getElementById('mtt-section-form').style.display = 'flex';
  };

  window.onQuickSearchMember = function (val) {
    var flt = document.getElementById('flt-member');
    if (flt) flt.value = val;
    renderTransfersTable();
  };

  window.showList = function () {
    document.getElementById('mtt-module-title').textContent = 'Member Bill Type Transfer';
    document.getElementById('mtt-section-form').style.display = 'none';
    document.getElementById('mtt-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('mtt-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  window.toggleOtherDropdown = function () {
    var menu = document.getElementById('mtt-other-menu');
    if (menu) menu.style.display = (menu.style.display === 'block' ? 'none' : 'block');
  };

  window.applyFilters = function () { renderTransfersTable(); };

  window.clearFilters = function () {
    ['flt-trfno', 'flt-member', 'tb-search-member'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderTransfersTable();
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
    var drop = document.querySelector('.mtt-dropdown');
    var menu = document.getElementById('mtt-other-menu');
    if (drop && menu && !drop.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // Short-cuts (Alt+A, F2, Esc, Alt+S)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddTransferForm();
    } else if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveTransfer();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedTransfer();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // Storage / Focus listener for real-time cross-tab sync
  window.addEventListener('storage', async function (e) {
    if (!e.key || e.key.includes('bill_type') || e.key.includes('member')) {
      await loadBillTypes();
      await loadMembers();
    }
  });

  window.addEventListener('focus', async function () {
    await loadBillTypes();
  });

  // ── INIT ──────────────────────────────────────────────────────────
  (async function init() {
    var _sn = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('mttSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('mttFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    await loadBillTypes();
    await loadMembers();
    await loadBills();
    await loadTransfers();
  })();

})();
