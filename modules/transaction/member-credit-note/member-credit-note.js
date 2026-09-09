/**
 * member-credit-note.js — Jeevika ERP v2
 * Member Credit Note Directory & Bill Summary Logic
 */

(function () {
  'use strict';

  var creditNotes = [];
  var members = [];
  var bills = [];
  var billTypes = [];
  var activeBillType = 'MAINTENANCE';
  var selectedCreditNoteId = null;
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
          if (!billTypes.some(function (existing) { return (existing.billTypeName || existing.name || '').toUpperCase() === typeName.trim().toUpperCase(); })) {
            billTypes.push({ billTypeId: bObj[typeName].id || Date.now(), billTypeName: typeName });
          }
        });
      }
    } catch (e) {}

    renderBillTypePills();
  }

  function renderBillTypePills() {
    var container = document.getElementById('mcn-billtype-pills');
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
    renderCreditNotesTable();
  };

  async function loadMembers() {
    var sid = getActiveSocietyId();
    var data = await fetchApiData('/api/members?societyId=' + sid);
    if (data && Array.isArray(data)) members = data;

    if (!members || members.length === 0) {
      var stored = localStorage.getItem('jeevika_master_members') || localStorage.getItem('mmList') || localStorage.getItem('jeevika_members_' + sid);
      if (stored) {
        try { members = JSON.parse(stored); } catch (e) {}
      }
    }

    if (!members) members = [];

    var sel = document.getElementById('frm-membername');
    if (sel) {
      var html = '<option value="">— Select Member —</option>';
      members.forEach(function (m) {
        var id = m.memberId || m.socMemId || m.id;
        var code = m.memCode || m.memberCode || 'M101';
        var name = m.memName || m.memberName || m.name || '';
        var wing = m.wing || m.Wing || 'A';
        var flat = m.flatNo || m.FlatNo || '101';
        html += '<option value="' + id + '">' + escHtml(code + ' - ' + name + ' (' + wing + '-' + flat + ')') + '</option>';
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

  async function loadCreditNotes() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var data = await fetchApiData('/api/member-notes?societyId=' + sid + '&fyId=' + fyid + '&type=creditnote');
    if (!data || !Array.isArray(data) || data.length === 0) {
      data = await fetchApiData('/api/member-notes?societyId=' + sid + '&type=creditnote');
    }
    if (data && Array.isArray(data)) {
      creditNotes = data.map(function(n) {
        return {
          cnId: n.noteId || n.voucherId || Date.now(),
          voucherId: n.voucherId || n.noteId,
          noteId: n.noteId || n.voucherId,
          cnNo: n.noteNo || n.voucherNo || n.cnNo,
          voucherNo: n.voucherNo || n.noteNo || n.cnNo,
          cnDate: n.noteDate || n.voucherDate || n.cnDate,
          voucherDate: n.voucherDate || n.noteDate || n.cnDate,
          memberId: n.memberId || 0,
          memberCode: n.memberCode || '',
          memberName: n.memberName || n.personName,
          personName: n.personName || n.memberName,
          wing: n.wing || '',
          flatNo: n.flatNo || '',
          totalAmount: parseFloat(n.totalAmount || n.amount || 0),
          principalAmount: parseFloat(n.principalAmount || n.amount || 0),
          interestAmount: parseFloat(n.interestAmount || 0),
          period: n.period || '',
          particular1: n.particular1 || n.narration || 'Member Credit Note',
          particular2: n.particular2 || '',
          status: n.status || 'Adjusted',
          billType: n.billType || 'MAINTENANCE',
          items: n.items || []
        };
      });
    } else {
      creditNotes = [];
    }
    renderCreditNotesTable();
  }

  // ── 2. RENDER REGISTER TABLE & SORTING ────────────────────────────
  window.toggleCreditNoteNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-cnno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderCreditNotesTable();
  };

  function cleanParticulars(str) {
    if (!str || str === '-' || str === '—') return '-';
    var clean = String(str).replace(/\[BillType:[^\]]+\]\s*/gi, '').trim();
    return clean || '-';
  }

  function renderCreditNotesHeader() {
    var thead = document.querySelector('table.mcn-main-table thead');
    if (!thead) return;
    var showBt = (activeBillType === 'ALL');
    thead.innerHTML = '<tr>' +
      '<th style="width:36px; text-align:center;"><input type="checkbox" id="chk-select-all" onclick="ERP_MultiChange.toggleSelectAll(this.checked, creditNotes.map(r=>r.cnId||r.voucherId))" title="Select / Deselect All"></th>' +
      '<th style="width:110px; cursor:pointer;" onclick="toggleCreditNoteNoSort()" title="Click to sort Top to Bottom / Bottom to Top">' +
        'NO. <span id="sort-cnno-icon">' + (sortDirection === 'desc' ? '▼' : '▲') + '</span>' +
      '</th>' +
      '<th style="width:85px;">DATE</th>' +
      (showBt ? '<th style="width:110px; text-align:center;">BILL TYPE</th>' : '') +
      '<th style="width:95px;">MEM CODE</th>' +
      '<th>MEM.NAME</th>' +
      '<th style="width:90px;">PERIOD</th>' +
      '<th style="width:105px; text-align:right;">PRINCIPAL</th>' +
      '<th style="width:100px; text-align:right;">INTEREST</th>' +
      '<th style="width:105px; text-align:right;">TOTAL</th>' +
      '<th style="width:85px;">DUE DATE</th>' +
      '<th style="width:140px;">PARTICULAR 1</th>' +
      '<th style="width:140px;">PARTICULAR 2</th>' +
      '<th style="width:80px; text-align:center;">STATUS</th>' +
    '</tr>';
  }

  function renderCreditNotesTable() {
    renderCreditNotesHeader();
    var tbody = document.getElementById('mcn-list-tbody');
    if (!tbody) return;

    var showBt = (activeBillType === 'ALL');

    var filtered = creditNotes.filter(function (b) {
      if (activeBillType !== 'ALL' && (b.billType || 'MAINTENANCE').toUpperCase() !== activeBillType) return false;

      var fNo = (document.getElementById('flt-cnno') ? document.getElementById('flt-cnno').value.toLowerCase().trim() : '');
      var fMem = (document.getElementById('flt-member') ? document.getElementById('flt-member').value.toLowerCase().trim() : '');
      var fPer = (document.getElementById('flt-period') ? document.getElementById('flt-period').value.toLowerCase().trim() : '');

      if (fNo && (b.cnNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fMem) {
        var mName = (b.memberName || b.memName || '').toLowerCase();
        var flat = (b.flatNo || b.wingFlat || '').toLowerCase();
        var wing = (b.wing || '').toLowerCase();
        var mCode = (b.memberCode || b.memCode || '').toLowerCase();
        var part1 = (b.particular1 || '').toLowerCase();
        var part2 = (b.particular2 || '').toLowerCase();
        var matches = (
          mName.indexOf(fMem) !== -1 ||
          flat.indexOf(fMem) !== -1 ||
          wing.indexOf(fMem) !== -1 ||
          mCode.indexOf(fMem) !== -1 ||
          part1.indexOf(fMem) !== -1 ||
          part2.indexOf(fMem) !== -1
        );
        if (!matches) return false;
      }

      if (fPer && (b.period || '').toLowerCase().indexOf(fPer) === -1) return false;

      return true;
    });

    filtered.sort(function (a, b) {
      var noA = (a.cnNo || '').toLowerCase();
      var noB = (b.cnNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('mcn-list-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      var colspan = showBt ? 13 : 12;
      tbody.innerHTML = '<tr><td colspan="' + colspan + '" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Credit Notes Found</td></tr>';
      document.getElementById('sum-cn-count').textContent = '0';
      document.getElementById('sum-cn-principal').textContent = '₹0.00';
      document.getElementById('sum-cn-interest').textContent = '₹0.00';
      document.getElementById('sum-cn-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalPrn = 0, totalInt = 0, totalGrd = 0;

    filtered.forEach(function (b) {
      var isSel = (b.cnId === selectedCreditNoteId);
      totalPrn += (b.principalAmount || 0);
      totalInt += (b.interestAmount || 0);
      totalGrd += (b.totalAmount || 0);

      var statusBadge = (b.status === 'Adjusted')
        ? '<span style="color:#2E7D32; font-weight:800;">Adjusted</span>'
        : '<span style="color:#2E7D32; font-weight:800;">Active</span>';

      var bTypeStr = (b.billType || 'MAINTENANCE').toUpperCase();
      var isRepair = bTypeStr.indexOf('REPAIR') !== -1;
      var btBadge = isRepair
        ? '<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:4px; font-weight:700; font-size:10px; border:1px solid #fde68a;">' + escHtml(bTypeStr) + '</span>'
        : '<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:700; font-size:10px; border:1px solid #bae6fd;">' + escHtml(bTypeStr) + '</span>';

      var cId = b.cnId || b.voucherId;
      var chkHtml = (window.ERP_MultiChange && typeof ERP_MultiChange.renderCheckbox === 'function')
        ? ERP_MultiChange.renderCheckbox(cId)
        : '<td style="width:36px; text-align:center;"><input type="checkbox" class="row-chk" value="' + cId + '"></td>';

      html += '<tr class="' + (isSel ? 'selected' : '') + '" data-id="'+(b.cnId||b.voucherId||b.cnNo||b.voucherNo||'')+'" onclick="selectCreditNoteRow(this.dataset.id, this)" ondblclick="editSelectedCreditNote(this.dataset.id)">' +
        chkHtml +
        '<td style="font-weight:700; color:#2E7D32;">' + (b.cnNo || '') + '</td>' +
        '<td>' + (b.cnDate || '') + '</td>' +
        (showBt ? '<td style="text-align:center;">' + btBadge + '</td>' : '') +
        '<td>' + (b.memberCode || b.memCode || '') + '</td>' +
        '<td style="font-weight:700;">' + (b.memberName || b.memName || '') + '</td>' +
        '<td>' + (b.period || 'May 2025') + '</td>' +
        '<td style="text-align:right; font-weight:700;">' + (b.principalAmount || 0).toFixed(2) + '</td>' +
        '<td style="text-align:right;">' + (b.interestAmount || 0).toFixed(2) + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#2E7D32;">' + (b.totalAmount || 0).toFixed(2) + '</td>' +
        '<td>' + (b.dueDate || '') + '</td>' +
        '<td>' + escHtml(cleanParticulars(b.particular1)) + '</td>' +
        '<td>' + escHtml(cleanParticulars(b.particular2)) + '</td>' +
        '<td style="text-align:center;">' + statusBadge + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-cn-count').textContent = filtered.length;
    document.getElementById('sum-cn-principal').textContent = '₹' + totalPrn.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('sum-cn-interest').textContent = '₹' + totalInt.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    document.getElementById('sum-cn-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    initColumnResizing();
  }

  function initColumnResizing() {
    setTimeout(function () {
      var tables = document.querySelectorAll('table.mcn-main-table, table.form-grid-table');
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

  window.selectCreditNoteRow = function (id, trEl) {
    selectedCreditNoteId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('selected'); });
      trEl.classList.add('selected');
    }
  };

  // ── 3. FORM CONTROLS & ACCOUNTS GRID ─────────────────────────────
  window.handleAddClick = function (e) {
    if (e) e.stopPropagation();
    if (activeBillType === 'ALL') {
      var menu = document.getElementById('add-billtype-menu');
      if (menu) {
        if (menu.style.display === 'block') {
          menu.style.display = 'none';
          return;
        }
        var seen = {};
        var list = [];
        if (billTypes && billTypes.length > 0) {
          billTypes.forEach(function (bt) {
            var name = (bt.billTypeName || bt.name || '').trim().toUpperCase();
            if (name && !seen[name]) { seen[name] = true; list.push(name); }
          });
        }
        if (list.length === 0) list = ['MAINTENANCE', 'MAJOR REPAIR'];

        var html = '';
        list.forEach(function (name) {
          html += '<div style="padding:7px 14px; font-size:11px; font-weight:700; color:#1e293b; cursor:pointer; text-transform:uppercase;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'" onclick="openAddFormForType(\'' + escHtml(name) + '\')">' + escHtml(name) + '</div>';
        });
        menu.innerHTML = html;
        menu.style.display = 'block';
      }
    } else {
      var menu = document.getElementById('add-billtype-menu');
      if (menu) menu.style.display = 'none';
      openAddFormForType(activeBillType);
    }
  };

  window.openAddFormForType = async function (typeName) {
    var menu = document.getElementById('add-billtype-menu');
    if (menu) menu.style.display = 'none';

    selectedCreditNoteId = null;
    var displayName = typeName || 'Maintenance';
    var formattedName = displayName.charAt(0).toUpperCase() + displayName.slice(1).toLowerCase();
    document.getElementById('mcn-module-title').textContent = 'Member Credit Note [' + formattedName + ']';

    var cnNoEl = document.getElementById('frm-cnno');
    if (cnNoEl) {
      cnNoEl.readOnly = false;
      cnNoEl.disabled = false;
      cnNoEl.value = (typeof fetchTxNextVoucherNo === 'function') 
        ? await fetchTxNextVoucherNo('credit') 
        : getTxNextVoucherNo('credit', creditNotes);
    }
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-cnno', 'Credit');
    document.getElementById('frm-cndate').value = todayISO();
    document.getElementById('frm-period').value = 'May 2025';
    document.getElementById('frm-duedate').value = futureISO(15);
    document.getElementById('frm-membername').value = '';
    document.getElementById('frm-particular1').value = '';
    document.getElementById('frm-particular2').value = '';

    loadFormAccountHeads(formattedName, []);

    document.getElementById('mcn-section-list').style.display = 'none';
    document.getElementById('mcn-section-form').style.display = 'flex';
  };

  window.openAddCreditNoteForm = function () {
    window.handleAddClick();
  };

  window.editSelectedCreditNote = function (id) {
    if (id) selectedCreditNoteId = id;
    if (!selectedCreditNoteId) {
      toast('Please select a credit note to edit.', false);
      return;
    }
    var b = creditNotes.find(function (x) {
      return String(x.cnId) === String(selectedCreditNoteId) ||
             String(x.voucherId) === String(selectedCreditNoteId) ||
             String(x.cnNo) === String(selectedCreditNoteId) ||
             String(x.voucherNo) === String(selectedCreditNoteId);
    });
    if (!b) { toast('Credit note record not found.', false); return; }

    var activeTypeName = (b.billType || 'MAINTENANCE');
    document.getElementById('mcn-module-title').textContent = 'Edit Member Credit Note [' + (b.cnNo || b.voucherNo) + ']';

    var cnNoEl = document.getElementById('frm-cnno');
    if (cnNoEl) {
      cnNoEl.value = b.cnNo || b.voucherNo || '';
      cnNoEl.readOnly = true; // STRICT IMMUTABILITY ON ALTER
      cnNoEl.disabled = true;
    }
    document.getElementById('frm-cndate').value = b.cnDate || todayISO();
    document.getElementById('frm-period').value = b.period || 'May 2025';
    document.getElementById('frm-duedate').value = b.dueDate || futureISO(15);
    document.getElementById('frm-particular1').value = b.particular1 || '';
    document.getElementById('frm-particular2').value = b.particular2 || '';

    // Match member in dropdown
    var memId = b.memberId;
    if ((!memId || memId === 0) && members && members.length > 0) {
      var foundMem = members.find(function(m) {
        var mCode = (m.memCode || m.code || '').toLowerCase().trim();
        var mName = (m.memName || m.name || '').toLowerCase().trim();
        var mFlat = (m.flatNo || '').toLowerCase().trim();
        var bCode = (b.memberCode || b.memCode || '').toLowerCase().trim();
        var bName = (b.memberName || b.personName || '').toLowerCase().trim();
        var bPer  = (b.period || '').toLowerCase().trim();
        return (bCode && mCode === bCode) ||
               (bName && mName === bName) ||
               (bPer && (mFlat === bPer || (m.wing && (m.wing + '-' + m.flatNo).toLowerCase() === bPer)));
      });
      if (foundMem) memId = foundMem.memberId || foundMem.socMemId || foundMem.id;
    }

    if (memId) {
      document.getElementById('frm-membername').value = memId;
      onMemberSelect(memId);
    }

    var itemsToLoad = b.items;
    if ((!itemsToLoad || itemsToLoad.length === 0) && (b.totalAmount || b.principalAmount || b.amount)) {
      itemsToLoad = [{
        amount: b.totalAmount || b.principalAmount || b.amount || 0
      }];
    }
    loadFormAccountHeads(activeTypeName, itemsToLoad);

    document.getElementById('mcn-section-list').style.display = 'none';
    document.getElementById('mcn-section-form').style.display = 'flex';
  };

  async function loadFormAccountHeads(typeName, existingItems) {
    var tbody = document.getElementById('frm-grid-tbody');
    if (!tbody) return;

    var configuredHeads = [];
    if (typeof getBillTypeConfiguredHeads === 'function') {
      var dynamicHeads = getBillTypeConfiguredHeads(typeName);
      if (dynamicHeads && dynamicHeads.length > 0) {
        configuredHeads = dynamicHeads;
      }
    }

    if (!configuredHeads || configuredHeads.length === 0) {
      var normType = (typeName || 'MAINTENANCE').toUpperCase();
      var btObj = billTypes.find(function (bt) {
        return (bt.billTypeName || bt.name || '').toUpperCase() === normType;
      });

      if (btObj && (btObj.billTypeId || btObj.id)) {
        var id = btObj.billTypeId || btObj.id;
        var detail = await fetchApiData('/api/bill-types/' + id);
        if (detail && detail.heads && Array.isArray(detail.heads) && detail.heads.length > 0) {
          configuredHeads = detail.heads.map(function (h, idx) {
            return {
              srNo: h.srNo || (idx + 1),
              accountCode: h.accCode || h.accountCode || 'ACC-' + (100 + idx),
              accountName: h.accName || h.accountName || 'Charge Head ' + (idx + 1),
              defaultAmt: h.defaultAmt || 0.00
            };
          });
        }
      }
    }

    if (!configuredHeads) configuredHeads = [];

    var html = '';
    if (configuredHeads.length === 0) {
      // Fallback default charges if no bill type head configured
      var defAmt = (existingItems && existingItems[0]) ? (existingItems[0].amount || 0) : 0;
      html = '<tr>' +
        '<td style="text-align:center; font-weight:700;">1</td>' +
        '<td style="font-weight:700; color:#2E7D32;">ACC-101</td>' +
        '<td style="font-weight:600;">Maintenance Concession / Rebate</td>' +
        '<td><input type="number" step="0.01" class="inp-grid-amt" data-index="0" data-code="ACC-101" data-name="Maintenance Concession" value="' + defAmt.toFixed(2) + '" oninput="recalcFormTotal()" onkeydown="handleGridNav(event, 0)"></td>' +
        '</tr>';
    } else {
      configuredHeads.forEach(function (h, idx) {
        var amt = h.defaultAmt || 0.00;
        if (existingItems && Array.isArray(existingItems) && existingItems.length > 0) {
          var ex = existingItems.find(function (x) {
            return (x.accountCode && (x.accountCode || '').toUpperCase() === (h.accountCode || '').toUpperCase());
          });
          if (ex) {
            amt = ex.amount || 0;
          } else if (idx === 0 && existingItems.length === 1 && !existingItems[0].accountCode) {
            amt = existingItems[0].amount || 0;
          }
        }

        html += '<tr>' +
          '<td style="text-align:center; font-weight:700;">' + (h.srNo || (idx + 1)) + '</td>' +
          '<td style="font-family:\'Consolas\', monospace; font-weight:700; color:#2E7D32;">' + escHtml(h.accountCode || '') + '</td>' +
          '<td style="font-weight:600;">' + escHtml(h.accountName || '') + '</td>' +
          '<td>' +
            '<input type="number" class="inp-grid-amt" data-index="' + idx + '" data-code="' + escHtml(h.accountCode || '') + '" data-name="' + escHtml(h.accountName || '') + '" value="' + amt.toFixed(2) + '" step="0.01" oninput="recalcFormTotal()" onkeydown="handleGridNav(event, ' + idx + ')">' +
          '</td>' +
          '</tr>';
      });
    }

    tbody.innerHTML = html;
    recalcFormTotal();
    initColumnResizing();
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
    var redPrincipal = 0, redInterest = 0;

    inputs.forEach(function (inp) {
      var name = (inp.getAttribute('data-name') || '').toLowerCase();
      var val = parseFloat(inp.value) || 0;
      if (name.indexOf('interest') !== -1 || name.indexOf('penalty') !== -1) {
        redInterest += val;
      } else {
        redPrincipal += val;
      }
    });

    var sum = redPrincipal + redInterest;
    var totEl = document.getElementById('frm-total-amount');
    if (totEl) totEl.textContent = '₹' + sum.toFixed(2);

    // Update Right Sidebar: BILL SUMMARY -> CREDIT NOTE REDUCTION (Matching Images 2 & 3)
    document.getElementById('led-red-prin').textContent = '₹' + redPrincipal.toFixed(2);
    document.getElementById('led-red-int').textContent = '₹' + redInterest.toFixed(2);
    document.getElementById('led-red-tot').textContent = '₹' + sum.toFixed(2);

    var curPrin = parseFloat((document.getElementById('led-cur-prin').textContent || '').replace(/[^\d.]/g, '')) || 0;
    var curInt = parseFloat((document.getElementById('led-cur-int').textContent || '').replace(/[^\d.]/g, '')) || 0;

    var newPrin = Math.max(0, curPrin - redPrincipal);
    var newInt = Math.max(0, curInt - redInterest);

    document.getElementById('led-new-prin').textContent = '₹' + newPrin.toFixed(2);
    document.getElementById('led-new-int').textContent = '₹' + newInt.toFixed(2);
    document.getElementById('led-new-tot').textContent = '₹' + (newPrin + newInt).toFixed(2);
  };

  window.onMemberSelect = function (memberId) {
    if (!memberId) {
      document.getElementById('led-flat').textContent = '—';
      document.getElementById('led-area').textContent = '—';
      document.getElementById('led-mobile1').textContent = '—';
      document.getElementById('led-mobile2').textContent = '—';
      document.getElementById('led-cur-prin').textContent = '₹0.00';
      document.getElementById('led-cur-int').textContent = '₹0.00';
      document.getElementById('led-cur-tot').textContent = '₹0.00';
      recalcFormTotal();
      return;
    }

    var m = members.find(function (x) {
      return String(x.memberId || x.socMemId || x.id) === String(memberId);
    });

    var wing = m ? (m.wing || m.Wing || 'A') : 'A';
    var flat = m ? (m.flatNo || m.FlatNo || '101') : '101';
    var mob = m ? (m.mobileNo || m.mobile1 || '9876543210') : '9876543210';

    document.getElementById('led-flat').textContent = wing + '-' + flat;
    document.getElementById('led-area').textContent = m && m.area ? m.area + ' sq.ft' : '—';
    document.getElementById('led-mobile1').textContent = mob;

    var memBills = bills.filter(function (b) {
      return String(b.memberId) === String(memberId) && b.status !== 'Paid';
    });

    var totPrin = 0, totInt = 0;
    memBills.forEach(function (b) {
      totPrin += (b.principalAmount || 0);
      totInt += (b.interestAmount || 0);
    });

    document.getElementById('led-cur-prin').textContent = '₹' + totPrin.toFixed(2);
    document.getElementById('led-cur-int').textContent = '₹' + totInt.toFixed(2);
    document.getElementById('led-cur-tot').textContent = '₹' + (totPrin + totInt).toFixed(2);

    recalcFormTotal();
  };

  window.appendParticularTag = function (num) {
    var el = document.getElementById('frm-particular' + num);
    if (el) el.value += (el.value ? ' ' : '') + 'Credit Note for ' + getFyLabel();
  };

  // ── 4. SAVE & ACTIONS ─────────────────────────────────────────────
  window.saveCreditNote = async function () {
    var mVal = document.getElementById('frm-membername').value;
    if (!mVal) {
      toast('Please select a Member Name.', false);
      return;
    }

    var m = members.find(function (x) { return String(x.memberId || x.socMemId || x.id) === String(mVal); });
    var mName = m ? (m.memName || m.memberName || m.name || 'Member') : 'Member';
    var mCode = m ? (m.memCode || m.memberCode || 'M101') : 'M101';

    var activeTypeName = (activeBillType === 'ALL' ? 'MAINTENANCE' : activeBillType);

    var items = [];
    var redPrincipal = 0, redInterest = 0;
    var inputs = document.querySelectorAll('.inp-grid-amt');
    inputs.forEach(function (inp) {
      var amt = parseFloat(inp.value) || 0;
      if (amt > 0) {
        var code = inp.getAttribute('data-code');
        var name = inp.getAttribute('data-name');
        if ((name || '').toLowerCase().indexOf('interest') !== -1 || (name || '').toLowerCase().indexOf('penalty') !== -1) {
          redInterest += amt;
        } else {
          redPrincipal += amt;
        }
        items.push({ accountCode: code, accountName: name, amount: amt });
      }
    });

    if (redPrincipal + redInterest <= 0) {
      toast('Please enter an amount in at least one account head.', false);
      return;
    }

    var cnNoVal = (document.getElementById('frm-cnno').value || '').trim();
    if (typeof validateTxVoucherNo === 'function') {
      var vCheck = validateTxVoucherNo('credit', cnNoVal);
      if (!vCheck.valid) {
        toast(vCheck.error, false);
        return;
      }
    }

    var cnDateIso = toIsoDate(document.getElementById('frm-cndate').value) || todayISO();

    var payload = {
      societyId: parseInt(getActiveSocietyId(), 10) || 4,
      fyId: parseInt(getFyId(), 10) || 1,
      cnNo: cnNoVal,
      billType: activeTypeName,
      cnDate: cnDateIso,
      dueDate: toIsoDate(document.getElementById('frm-duedate').value) || futureISO(15),
      period: document.getElementById('frm-period').value,
      memberId: parseInt(mVal, 10),
      memberCode: mCode,
      memberName: mName,
      principalAmount: redPrincipal,
      interestAmount: redInterest,
      totalAmount: redPrincipal + redInterest,
      particular1: document.getElementById('frm-particular1').value || 'Credit Note',
      particular2: document.getElementById('frm-particular2').value || '',
      status: 'Adjusted',
      items: items
    };

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var notePayload = {
        societyId: payload.societyId,
        fyId: payload.fyId,
        noteNo: payload.cnNo,
        noteType: 'MemberCreditNote',
        billType: payload.billType || activeTypeName,
        noteDate: payload.cnDate,
        amount: payload.totalAmount,
        memberId: payload.memberId,
        memberCode: payload.memberCode,
        memberName: payload.memberName,
        period: payload.period,
        particular1: payload.particular1,
        particular2: payload.particular2,
        narration: payload.particular1,
        items: payload.items
      };

      var resp = await fetch(baseHost + '/api/member-notes', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(notePayload)
      });

      if (resp.ok) {
        toast('Credit Note saved successfully in database!', true);
        showList();
        await loadCreditNotes();
        return;
      } else {
        var errText = await resp.text();
        toast('Failed to save Credit Note in database: ' + errText, false);
      }
    } catch (e) {
      toast('Server connection error: ' + (e.message || e), false);
    }
  };

  window.deleteSelectedCreditNote = async function () {
    if (!selectedCreditNoteId) {
      toast('Please select a credit note record to delete.', false);
      return;
    }

    var cn = creditNotes.find(function (b) {
      return String(b.cnId) === String(selectedCreditNoteId) ||
             String(b.voucherId) === String(selectedCreditNoteId) ||
             String(b.noteId) === String(selectedCreditNoteId) ||
             String(b.cnNo) === String(selectedCreditNoteId) ||
             String(b.voucherNo) === String(selectedCreditNoteId);
    });
    var cnNoStr = cn ? (cn.cnNo || cn.voucherNo || cn.noteNo) : '#' + selectedCreditNoteId;
    var delId = (cn && (cn.voucherId || cn.noteId || cn.cnId)) ? (cn.voucherId || cn.noteId || cn.cnId) : (cn ? (cn.cnNo || cn.voucherNo) : selectedCreditNoteId);

    var ok = typeof showConfirm === 'function'
      ? await showConfirm('Are you sure you want to delete credit note ' + cnNoStr + '?', 'Confirm Delete Credit Note', { isDanger: true })
      : confirm('Are you sure you want to delete credit note ' + cnNoStr + '?');

    if (!ok) return;

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(`${baseHost}/api/member-credit-notes/${encodeURIComponent(delId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (resp.ok) {
        toast('Credit Note ' + cnNoStr + ' deleted successfully!', true);
      } else {
        var errText = await resp.text();
        toast('Failed to delete credit note: ' + errText, false);
      }
    } catch (e) {
      toast('Error deleting credit note: ' + (e.message || e), false);
    }

    selectedCreditNoteId = null;
    await loadCreditNotes();
  };

  window.previewCreditNote = function () {
    if (!selectedCreditNoteId) {
      toast('Please select a credit note to preview.', false);
      return;
    }
    var b = creditNotes.find(function (x) { return x.cnId === selectedCreditNoteId; });
    if (!b) return;

    var container = document.getElementById('preview-creditnote-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    container.innerHTML = '<div style="border-bottom:2px solid #2E7D32; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#2E7D32; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#2E7D32; text-decoration:underline;">MEMBER CREDIT NOTE VOUCHER</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px;">' +
        '<div>' +
          '<div><strong>Member Name:</strong> ' + escHtml(b.memberName) + ' (' + escHtml(b.memberCode) + ')</div>' +
          '<div><strong>Billing Period:</strong> ' + escHtml(b.period) + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div><strong>Credit Note No:</strong> <span style="font-family:monospace; color:#2E7D32; font-weight:bold;">' + escHtml(b.cnNo) + '</span></div>' +
          '<div><strong>Credit Note Date:</strong> ' + escHtml(b.cnDate) + '</div>' +
          '<div><strong>Due Date:</strong> ' + escHtml(b.dueDate) + '</div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#2E7D32; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Account Head</th>' +
          '<th style="padding:6px; text-align:right;">Amount (₹)</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr><td style="border:1px solid #ddd; padding:8px;">' + escHtml(b.particular1 || 'Credit Note Discount / Relief') + '</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#2E7D32;">' + (b.totalAmount || 0).toFixed(2) + '</td></tr>' +
        '</tbody>' +
        '<tfoot><tr style="background:#f5f5f5; font-weight:bold;">' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right;">TOTAL CREDIT NOTE REDUCTION:</td>' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right; font-family:monospace; color:#2E7D32; font-size:14px;">₹' + (b.totalAmount || 0).toFixed(2) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
        '<div><strong>Prepared By</strong><br><br>_____________</div>' +
        '<div><strong>Hon. Treasurer / Secretary</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('mcn-section-list').style.display = 'none';
    document.getElementById('mcn-section-form').style.display = 'none';
    document.getElementById('mcn-section-preview').style.display = 'flex';
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
      toast('Please enter both From and To credit note numbers.', false);
      return;
    }

    var initialCount = creditNotes.length;
    creditNotes = creditNotes.filter(function (b) {
      var no = (b.cnNo || '').toLowerCase();
      return !(no >= fromNo && no <= toNo);
    });

    var deletedCount = initialCount - creditNotes.length;
    localStorage.setItem('jeevika_member_credit_notes_' + getActiveSocietyId(), JSON.stringify(creditNotes));
    closeModal('modal-multi-delete');
    toast('Multi-deleted ' + deletedCount + ' credit note(s).', true);
    renderCreditNotesTable();
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
      if (targetText) targetText.textContent = selCount + ' selected credit note(s)';
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
      list: creditNotes,
      idKey: 'cnId',
      noKey: 'cnNo'
    });

    if (updatedCount > 0) {
      closeModal('modal-multi-change');
      toast('Successfully updated ' + updatedCount + ' credit note(s).', true);
      renderCreditNotesTable();
    }
  };

  window.showList = function () {
    document.getElementById('mcn-module-title').textContent = 'Member Credit Note';
    document.getElementById('mcn-section-form').style.display = 'none';
    document.getElementById('mcn-section-preview').style.display = 'none';
    document.getElementById('mcn-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('mcn-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  window.toggleOtherDropdown = function () {
    var menu = document.getElementById('mcn-other-menu');
    if (menu) menu.style.display = (menu.style.display === 'block' ? 'none' : 'block');
  };

  window.applyFilters = function () { renderCreditNotesTable(); };

  window.onQuickSearchMember = function (val) {
    var flt = document.getElementById('flt-member');
    if (flt) flt.value = val;
    renderCreditNotesTable();
  };

  window.clearFilters = function () {
    ['flt-cnno', 'flt-member', 'flt-period'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderCreditNotesTable();
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

  // Close dropdown on outside click
  document.addEventListener('click', function (e) {
    var drop = document.querySelector('.mcn-dropdown');
    var menu = document.getElementById('mcn-other-menu');
    if (drop && menu && !drop.contains(e.target)) {
      menu.style.display = 'none';
    }

    var addBtn = document.getElementById('btn-add-credit-note');
    var addMenu = document.getElementById('add-billtype-menu');
    if (addMenu && addMenu.style.display === 'block') {
      if (addBtn && addBtn.contains(e.target)) return;
      if (!addMenu.contains(e.target)) {
        addMenu.style.display = 'none';
      }
    }
  });

  // Short-cuts (Alt+A, F2, Esc, Ctrl+P)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddCreditNoteForm();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedCreditNote();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // INIT
  (async function init() {
    var _sn = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('mcnSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('mcnFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    await loadBillTypes();
    await loadMembers();
    await loadBills();
    await loadCreditNotes();
  })();

})();
