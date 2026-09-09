// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Bill Type & Notes Master JS
// 100% Parity with Reference Logic, Modals, Drag-and-Drop & API Sync
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  let isGstEnabled = false;
  let currentType = 'Maintenance';
  let currentTypeId = 1;
  let targetRowIdx = -1;
  let pendingLookupCode = '';
  let pendingLookupName = '';
  let pendingLookupAccId = null;
  let accountsList = [];

  let defaultAccountsList = [
    { accountId: 1, accCode: 'A001', accName: 'Property Tax' },
    { accountId: 2, accCode: 'A002', accName: 'Water Charges' },
    { accountId: 3, accCode: 'A003', accName: 'Sinking Fund' },
    { accountId: 4, accCode: 'A004', accName: 'Repairs & Maintenance' },
    { accountId: 5, accCode: 'A005', accName: 'Electricity Charges' },
    { accountId: 6, accCode: 'A006', accName: 'Non-Occupancy Charges' },
    { accountId: 7, accCode: 'A007', accName: 'Parking Charges' },
    { accountId: 8, accCode: 'A008', accName: 'Welfare Fund' }
  ];

  function btmApiBase() {
    if (window.API_BASE_URL) return window.API_BASE_URL;
    if (window.AppConfig && window.AppConfig.apiBase) return window.AppConfig.apiBase;
    return 'http://localhost:5002';
  }

  function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = (typeof Auth !== 'undefined' && Auth.getToken)
      ? Auth.getToken()
      : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }

  function defaultHeads(gstOn) {
    if (gstOn === undefined) gstOn = isGstEnabled;
    const length = gstOn ? 33 : 30;
    return Array.from({ length }).map((_, i) => {
      let name = '';
      let code = '';
      if (gstOn) {
        if (i === 30) { name = 'Interest'; code = 'INC-1008'; }
        else if (i === 31) { name = 'CGST'; code = 'LIA-1032'; }
        else if (i === 32) { name = 'SGST'; code = 'LIA-1033'; }
      } else {
        if (i === 29) { name = 'Interest'; code = 'INC-1008'; }
      }
      return { no: i + 1, accCode: code, accName: name, gstApp: false, gstExm: false, accountId: null };
    });
  }

  // Local state cache for Bill Types
  let billTypes = {
    'Maintenance': {
      id: 1,
      heads: defaultHeads(false),
      notes: Array.from({ length: 13 }).map(() => ''),
      qrImage: '',
      signatureImage: '',
      dynamicQR: false,
      interestMethod: 'M-CM',
      interestRate: '21%',
      interestType: 'Simple',
      grossDate: '',
      interestPriority: 'Interest First',
      showBillPeriodNotes: false,
      billMethod: 'Monthly',
      billMonths: '1',
      billDate: '01',
      billDue: '15',
      billPeriod: ''
    }
  };

  function getActiveSocietyId() {
    if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
      const s = window.Auth.getSocietyId();
      if (s && parseInt(s, 10) > 0) return parseInt(s, 10);
    }
    const s1 = sessionStorage.getItem('activeSocietyId');
    if (s1 && parseInt(s1, 10) > 0) return parseInt(s1, 10);
    const s2 = localStorage.getItem('activeSocietyId');
    if (s2 && parseInt(s2, 10) > 0) return parseInt(s2, 10);
    return 1;
  }

  function getActiveTypeObj(type) {
    if (!type) type = currentType;
    if (!billTypes || typeof billTypes !== 'object') {
      billTypes = {};
    }
    if (billTypes[type]) {
      currentType = type;
      return billTypes[type];
    }
    const norm = (type || '').trim().toLowerCase();
    const foundKey = Object.keys(billTypes).find(k => k.trim().toLowerCase() === norm);
    if (foundKey && billTypes[foundKey]) {
      currentType = foundKey;
      return billTypes[foundKey];
    }
    const firstKey = Object.keys(billTypes)[0];
    if (firstKey && billTypes[firstKey]) {
      currentType = firstKey;
      return billTypes[firstKey];
    }
    currentType = 'Maintenance';
    billTypes['Maintenance'] = {
      id: 1,
      heads: defaultHeads(isGstEnabled),
      notes: Array.from({ length: 13 }).map(() => ''),
      qrImage: '',
      signatureImage: '',
      dynamicQR: false,
      interestMethod: 'M-CM',
      interestRate: '21%',
      interestType: 'Simple',
      grossDate: '',
      interestPriority: 'Interest First',
      showBillPeriodNotes: false,
      billMethod: 'Monthly',
      billMonths: '1',
      billDate: '01',
      billDue: '15',
      billPeriod: ''
    };
    return billTypes['Maintenance'];
  }

  function saveLocalBillTypes() {
    try {
      const socId = getActiveSocietyId();
      localStorage.setItem('jeevika_bill_types_' + socId, JSON.stringify(billTypes));
      localStorage.setItem('jeevika_bill_types_global', JSON.stringify(billTypes));
    } catch (e) {
      console.warn('Failed saving billTypes locally', e);
    }
  }

  function toast(m, ok) {
    if (typeof window.toast === 'function') {
      window.toast(m, ok ? 'success' : 'error');
    } else {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;padding:8px 16px;font-size:12px;font-weight:600;color:#FFF;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.2);background:' + (ok ? '#2E7D32' : '#C62828') + ';';
      d.textContent = m;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 2500);
    }
  }

  function syncFixedHeads(billTypesObj, gstOn) {
    if (!billTypesObj) return;
    Object.keys(billTypesObj).forEach(type => {
      const heads = billTypesObj[type].heads;
      if (!Array.isArray(heads)) return;

      if (gstOn) {
        while (heads.length < 30) {
          heads.push({ no: heads.length + 1, accCode: '', accName: '', gstApp: false, gstExm: false, accountId: null });
        }
        // If index 29 (Row 30) has leftover fixed Interest from GST OFF mode, clear it!
        if (heads[29] && heads[29].accCode === 'INC-1008' && heads[29].accName === 'Interest') {
          heads[29] = { no: 30, accCode: '', accName: '', gstApp: false, gstExm: false, accountId: null };
        }
        heads.length = 33;
        heads[30] = { no: 31, accCode: 'INC-1008', accName: 'Interest', gstApp: false, gstExm: false, accountId: null };
        heads[31] = { no: 32, accCode: 'LIA-1032', accName: 'CGST', gstApp: false, gstExm: false, accountId: null };
        heads[32] = { no: 33, accCode: 'LIA-1033', accName: 'SGST', gstApp: false, gstExm: false, accountId: null };
      } else {
        while (heads.length < 29) {
          heads.push({ no: heads.length + 1, accCode: '', accName: '', gstApp: false, gstExm: false, accountId: null });
        }
        heads.length = 30;
        heads[29] = { no: 30, accCode: 'INC-1008', accName: 'Interest', gstApp: false, gstExm: false, accountId: null };
      }
      heads.forEach((h, idx) => { h.no = idx + 1; });
    });
  }

  window.BTM = {
    toast,

    showConfirm: function (title, message, submessage, isWarning) {
      return new Promise(resolve => {
        const modal = document.getElementById('btm-confirm-modal');
        const titlebar = document.getElementById('btm-confirm-titlebar');
        const titleEl = document.getElementById('btm-confirm-title');
        const iconEl = document.getElementById('btm-confirm-icon');
        const msgEl = document.getElementById('btm-confirm-message');
        const subEl = document.getElementById('btm-confirm-submessage');
        const okBtn = document.getElementById('btm-confirm-ok-btn');

        if (!modal) { resolve(false); return; }

        titleEl.textContent = title;
        msgEl.textContent = message;
        subEl.textContent = submessage || '';

        if (isWarning) {
          titlebar.className = 'btm-modal-titlebar warning';
          iconEl.className = 'bi bi-exclamation-triangle-fill';
          iconEl.style.color = '#8B0000';
        } else {
          titlebar.className = 'btm-modal-titlebar';
          iconEl.className = 'bi bi-question-circle-fill';
          iconEl.style.color = '#0A246A';
        }

        okBtn.onclick = () => {
          modal.classList.remove('active');
          resolve(true);
        };

        BTM._confirmResolve = resolve;
        modal.classList.add('active');
      });
    },

    closeConfirmModal: function (result) {
      const modal = document.getElementById('btm-confirm-modal');
      if (modal) modal.classList.remove('active');
      if (BTM._confirmResolve) {
        BTM._confirmResolve(result);
        BTM._confirmResolve = null;
      }
    },

    toggleGST: function (val) {
      isGstEnabled = val;
      syncFixedHeads(billTypes, val);
      BTM.applyGSTColumnVisibility();
      BTM.renderTypeMenu();
      BTM.renderGrid();
      BTM.renderNotes();
      const titleEl = document.getElementById('btm-panel-title-text');
      if (titleEl) titleEl.textContent = currentType.toUpperCase();
    },

    applyGSTColumnVisibility: function () {
      const tbl = document.getElementById('btm-table');
      if (!tbl) return;
      if (isGstEnabled) tbl.classList.add('gst-on');
      else tbl.classList.remove('gst-on');

      const badge = document.getElementById('btm-gst-badge');
      if (badge) badge.textContent = isGstEnabled ? '✔ GST Enabled' : '';
    },

    toggleOtherMenu: function (e) {
      if (e) e.stopPropagation();
      const m = document.getElementById('btm-other-menu-content');
      const tm = document.getElementById('btm-type-menu-content');
      if (tm) tm.classList.remove('active');
      if (m) m.classList.toggle('active');
    },

    toggleTypeMenu: function (e) {
      if (e) e.stopPropagation();
      const m = document.getElementById('btm-type-menu-content');
      const om = document.getElementById('btm-other-menu-content');
      if (om) om.classList.remove('active');
      if (m) m.classList.toggle('active');
    },

    toggleNotesPanel: function () {
      const ws = document.getElementById('btm-workspace') || document.querySelector('.btm-workspace');
      if (!ws) return;
      const isCollapsed = ws.classList.toggle('notes-collapsed');
      const dockedTab = document.getElementById('btm-notes-docked-tab');
      if (dockedTab) {
        dockedTab.style.display = isCollapsed ? 'flex' : 'none';
      }
      const quickBtn = document.getElementById('btm-notes-quick-btn');
      if (quickBtn) {
        quickBtn.style.display = isCollapsed ? 'inline-flex' : 'none';
      }
      try {
        sessionStorage.setItem('btm_notes_collapsed', isCollapsed ? '1' : '0');
      } catch (e) {}
    },

    initNotesCollapsedState: function () {
      try {
        const saved = sessionStorage.getItem('btm_notes_collapsed') === '1';
        const ws = document.getElementById('btm-workspace') || document.querySelector('.btm-workspace');
        const dockedTab = document.getElementById('btm-notes-docked-tab');
        const quickBtn = document.getElementById('btm-notes-quick-btn');
        if (ws) {
          if (saved) {
            ws.classList.add('notes-collapsed');
            if (dockedTab) dockedTab.style.display = 'flex';
            if (quickBtn) quickBtn.style.display = 'inline-flex';
          } else {
            ws.classList.remove('notes-collapsed');
            if (dockedTab) dockedTab.style.display = 'none';
            if (quickBtn) quickBtn.style.display = 'none';
          }
        }
      } catch (e) {}
    },

    switchType: function (type) {
      const tObj = getActiveTypeObj(type);
      if (tObj && tObj.id) currentTypeId = tObj.id;

      const btn = document.getElementById('btm-current-type');
      if (btn) btn.textContent = currentType + ' ▾';
      const titleEl = document.getElementById('btm-panel-title-text');
      if (titleEl) titleEl.textContent = currentType.toUpperCase();

      const tm = document.getElementById('btm-type-menu-content');
      if (tm) tm.classList.remove('active');

      BTM.renderTypeMenu();
      BTM.renderGrid();
      BTM.renderNotes();
    },

    openAddType: function () {
      document.getElementById('btm-new-name').value = '';
      document.getElementById('btm-new-desc').value = '';
      document.getElementById('btm-add-type-modal').classList.add('active');
    },

    addType: async function () {
      const name = document.getElementById('btm-new-name').value.trim();
      const desc = document.getElementById('btm-new-desc').value.trim();

      if (name) {
        if (billTypes[name]) {
          toast('Bill Type "' + name + '" already exists.');
          return;
        }

        try {
          const socId = parseInt(sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1', 10);
          const res = await fetch(`${btmApiBase()}/api/bill-types`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ societyId: socId, billTypeName: name, description: desc })
          });
          const json = await res.json();

          if (res.ok && json.success) {
            billTypes[name] = {
              id: json.billTypeId,
              heads: defaultHeads(),
              notes: Array.from({ length: 13 }).map(() => ''),
              qrImage: '',
              signatureImage: '',
              dynamicQR: false,
              interestMethod: 'M-CM',
              interestRate: '21%',
              interestType: 'Simple',
              grossDate: '',
              interestPriority: 'Interest First',
              showBillPeriodNotes: false,
              billMethod: 'Monthly',
              billMonths: '1',
              billDate: '01',
              billDue: '15',
              billPeriod: ''
            };
            BTM.switchType(name);
            saveLocalBillTypes();
            toast('Bill Type "' + name + '" created successfully.', true);
          } else {
            alert('Failed creating Bill Type: ' + (json.message || 'Unknown error'));
          }
        } catch (e) {
          alert('Error: ' + e.message);
        }
      }
      document.getElementById('btm-add-type-modal').classList.remove('active');
    },

    renderTypeMenu: function () {
      const menu = document.getElementById('btm-type-menu-content');
      if (!menu) return;
      getActiveTypeObj();
      let html = '';
      const allTypes = Object.keys(billTypes);
      allTypes.sort((a, b) => {
        if (a.trim().toLowerCase() === 'maintenance') return -1;
        if (b.trim().toLowerCase() === 'maintenance') return 1;
        return a.localeCompare(b);
      });
      allTypes.forEach(type => {
        const isActive = (type.toLowerCase().trim() === currentType.toLowerCase().trim());
        const activeStyle = isActive ? 'font-weight:bold;background:#E3F2FD;color:#1565C0;' : '';
        html += '<div class="btm-menu-item btm-type-item" data-type="' + type + '" style="' + activeStyle + '">' + type + '</div>';
      });
      menu.innerHTML = html;
      menu.querySelectorAll('.btm-type-item').forEach(el => {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          const t = this.getAttribute('data-type');
          BTM.switchType(t);
        });
      });
      const btn = document.getElementById('btm-current-type');
      if (btn) btn.textContent = currentType + ' ▾';
      const titleEl = document.getElementById('btm-panel-title-text');
      if (titleEl) titleEl.textContent = currentType.toUpperCase();
    },

    renderGrid: function () {
      const tObj = getActiveTypeObj();
      if (!tObj.heads || !Array.isArray(tObj.heads) || tObj.heads.length === 0) {
        tObj.heads = defaultHeads(isGstEnabled);
      }
      const data = tObj.heads;
      let html = '';
      data.forEach((h, idx) => {
        const isInterest = isGstEnabled ? (idx === 30) : (idx === 29);
        const isGST = isGstEnabled && (idx === 31 || idx === 32);
        const isFixed = isInterest || isGST;
        const rowClass = isGST ? 'gst-row' : (isInterest ? 'interest-row' : '');

        html += '<tr class="' + rowClass + '" draggable="' + (!isFixed) + '" ondragstart="BTM.dragStart(event, ' + idx + ')" ondragover="BTM.dragOver(event)" ondrop="BTM.drop(event, ' + idx + ')">';
        html += '<td class="td-center" style="font-weight:bold; cursor:' + (isFixed ? 'default' : 'grab') + ';">' + (idx + 1) + '</td>';

        if (!isFixed) {
          html += '<td class="td-center"><div class="btm-lookup-btn" onclick="BTM.openLookup(' + idx + ')">SELECT</div></td>';
        } else {
          html += '<td class="td-center" style="color:#888; font-size:10px;">[FIXED]</td>';
        }

        html += '<td style="font-family:monospace; font-size:10px; color:#444;">' + (h.accCode || '') + '</td>';
        html += '<td style="font-weight:' + (isFixed ? 'bold' : 'normal') + '; color:' + (isGST ? '#F57F17' : (isInterest ? '#1565C0' : '#424242')) + ';">' + (h.accName || '') + '</td>';
        html += '<td class="td-center btm-gst-col"><input type="checkbox" class="btm-gst-chk" ' + (h.gstApp ? 'checked' : '') + ' onchange="BTM.setGST(' + idx + ',\'app\', this.checked)" ' + (isFixed ? 'disabled' : '') + ' title="GST Applicable"></td>';
        html += '<td class="td-center btm-gst-col"><input type="checkbox" class="btm-gst-chk" ' + (h.gstExm ? 'checked' : '') + ' onchange="BTM.setGST(' + idx + ',\'exm\', this.checked)" ' + (isFixed ? 'disabled' : '') + ' title="GST Exempt Criteria"></td>';
        html += '</tr>';
      });
      const tbody = document.getElementById('btm-tbody');
      if (tbody) tbody.innerHTML = html;
    },

    setGST: function (idx, type, val) {
      if (!billTypes[currentType]) return;
      if (type === 'app') {
        billTypes[currentType].heads[idx].gstApp = !!val;
        if (val) billTypes[currentType].heads[idx].gstExm = false;
      }
      if (type === 'exm') {
        billTypes[currentType].heads[idx].gstExm = !!val;
        if (val) billTypes[currentType].heads[idx].gstApp = false;
      }
      saveLocalBillTypes();
      BTM.renderTable();
    },

    dragStart: function (e, idx) {
      const isFixed = isGstEnabled ? (idx >= 30) : (idx >= 29);
      if (isFixed) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', idx);
      e.dataTransfer.effectAllowed = 'move';
    },

    dragOver: function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },

    drop: function (e, targetIdx) {
      e.preventDefault();
      const isTargetFixed = isGstEnabled ? (targetIdx >= 30) : (targetIdx >= 29);
      if (isTargetFixed) return;

      const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (isNaN(sourceIdx) || sourceIdx === targetIdx) return;

      const isSourceFixed = isGstEnabled ? (sourceIdx >= 30) : (sourceIdx >= 29);
      if (isSourceFixed) return;

      const heads = billTypes[currentType].heads;
      const movedItem = heads.splice(sourceIdx, 1)[0];
      heads.splice(targetIdx, 0, movedItem);

      heads.forEach((h, i) => { h.no = i + 1; });
      BTM.renderGrid();
      saveLocalBillTypes();
      toast('Row moved successfully.', true);
    },

    openLookup: function (rowIdx) {
      targetRowIdx = rowIdx;
      pendingLookupCode = '';
      pendingLookupName = '';
      pendingLookupAccId = null;
      const searchEl = document.getElementById('btm-acc-search');
      if (searchEl) searchEl.value = '';
      document.getElementById('btm-account-modal').classList.add('active');
      BTM.loadAccounts();
    },

    loadAccounts: function () {
      const socId = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '0';
      const url = parseInt(socId, 10) > 0 ? `${btmApiBase()}/api/accounts?societyId=${socId}` : `${btmApiBase()}/api/accounts`;
      return fetch(url, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(d => {
          if (d.success && Array.isArray(d.data) && d.data.length > 0) {
            accountsList = d.data
              .map(item => ({
                accountId: item.accountId || item.AccountId || item.socAccId,
                accCode: (item.accCode || item.AccCode || item.accountCode || item.AccountCode || '').trim(),
                accName: (item.accName || item.AccName || item.accountName || item.AccountName || '').trim()
              }))
              .filter(item => item.accName.length > 0);
          } else {
            accountsList = defaultAccountsList;
          }
        })
        .catch(() => {
          accountsList = defaultAccountsList;
        })
        .finally(() => {
          BTM.renderLookup();
        });
    },

    renderLookup: function () {
      const searchVal = (document.getElementById('btm-acc-search')?.value || '').toLowerCase().trim();
      const tbody = document.getElementById('btm-acc-lookup-tbody');
      if (!tbody) return;

      const filtered = accountsList.filter(a => {
        if (!a.accName || !a.accName.trim()) return false;
        const code = (a.accCode || '').toLowerCase();
        const name = (a.accName || '').toLowerCase();
        return code.includes(searchVal) || name.includes(searchVal);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:#888;">No accounts found</td></tr>';
        return;
      }

      let html = '';
      filtered.forEach(a => {
        const code = a.accCode || '';
        const name = a.accName || '';
        const id = a.accountId || '';
        const escCode = code.replace(/'/g, "\\'");
        const escName = name.replace(/'/g, "\\'");
        html += `<tr onclick="BTM.selectAccount('${escCode}', '${escName}', ${id})" ondblclick="BTM.selectAccount('${escCode}', '${escName}', ${id}); BTM.confirmLookupSelect();" style="cursor:pointer;">`;
        html += `<td>${code}</td>`;
        html += `<td>${name}</td>`;
        html += `</tr>`;
      });
      tbody.innerHTML = html;
    },

    selectAccount: function (code, name, id) {
      pendingLookupCode = code;
      pendingLookupName = name;
      pendingLookupAccId = id;
      const rows = document.querySelectorAll('#btm-acc-lookup-tbody tr');
      rows.forEach(r => { r.style.background = ''; r.style.color = ''; });
      rows.forEach(r => {
        if (r.cells[0] && r.cells[0].textContent.trim() === code) {
          r.style.background = '#bae6fd';
          r.style.color = '#0f172a';
          r.style.fontWeight = '600';
        }
      });
    },

    confirmLookupSelect: function () {
      if (!pendingLookupName) { toast('Please select a ledger first.'); return; }
      BTM._applyLookup(pendingLookupCode, pendingLookupName, pendingLookupAccId);
    },

    _applyLookup: function (code, name, accId) {
      let isDuplicate = false;
      let duplicateMsg = 'ACCOUNT ALREADY SELECTED';
      const normCurrent = (currentType || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const normTargetCode = (code || '').trim().toLowerCase();

      // 1. Check other Bill Types in this society by account code / account ID
      Object.keys(billTypes).forEach(bt => {
        const normBt = bt.trim().replace(/\s+/g, ' ').toLowerCase();
        if (normBt !== normCurrent && billTypes[bt] && Array.isArray(billTypes[bt].heads)) {
          billTypes[bt].heads.forEach(h => {
            if (!h || !h.accCode || !h.accCode.trim()) return;
            const hId = h.accountId || null;
            const hCode = (h.accCode || '').trim().toLowerCase();
            if (hCode === 'inc-1008' || hCode === 'lia-1032' || hCode === 'lia-1033') return;

            if ((accId && hId && accId === hId) || (normTargetCode && hCode === normTargetCode)) {
              isDuplicate = true;
              duplicateMsg = `ACCOUNT ALREADY SELECTED IN '${bt.toUpperCase()}'`;
            }
          });
        }
      });

      // 2. Check within the active Bill Type (other rows except the target slot)
      if (!isDuplicate && billTypes[currentType] && Array.isArray(billTypes[currentType].heads)) {
        billTypes[currentType].heads.forEach((h, idx) => {
          if (idx === targetRowIdx || !h || !h.accCode || !h.accCode.trim()) return;
          const hId = h.accountId || null;
          const hCode = (h.accCode || '').trim().toLowerCase();
          if (hCode === 'inc-1008' || hCode === 'lia-1032' || hCode === 'lia-1033') return;

          if ((accId && hId && accId === hId) || (normTargetCode && hCode === normTargetCode)) {
            isDuplicate = true;
            duplicateMsg = `ACCOUNT ALREADY SELECTED ON ROW ${idx + 1}`;
          }
        });
      }

      if (isDuplicate) {
        const msgEl = document.getElementById('btm-warning-msg');
        if (msgEl) msgEl.textContent = duplicateMsg;
        document.getElementById('btm-account-modal').classList.remove('active');
        document.getElementById('btm-warning-modal').classList.add('active');
      } else {
        if (!billTypes[currentType]) billTypes[currentType] = { id: currentTypeId, heads: defaultHeads(isGstEnabled), notes: [] };
        if (!billTypes[currentType].heads[targetRowIdx]) {
          billTypes[currentType].heads[targetRowIdx] = { no: targetRowIdx + 1, accCode: '', accName: '', gstApp: false, gstExm: false, accountId: null };
        }
        billTypes[currentType].heads[targetRowIdx].accountId = accId;
        billTypes[currentType].heads[targetRowIdx].accCode = code;
        billTypes[currentType].heads[targetRowIdx].accName = name;
        document.getElementById('btm-account-modal').classList.remove('active');
        BTM.renderGrid();
        saveLocalBillTypes();
      }
    },

    renderNotes: function () {
      const tObj = getActiveTypeObj();
      if (!tObj.notes || !Array.isArray(tObj.notes)) {
        tObj.notes = Array.from({ length: 13 }).map(() => '');
      }
      const notes = tObj.notes;
      while (notes.length < 13) notes.push('');

      let html = '<div style="font-size:11px; font-weight:bold; margin-bottom:4px; color:#1565C0; text-transform:uppercase;">General Notes</div>';

      for (let i = 0; i < 8; i++) {
        html += `<div class="btm-note-row"><div class="btm-note-lbl">Line ${i + 1}</div><input type="text" class="btm-note-input" value="${notes[i]}" oninput="BTM.limitWords(this, 250)" onchange="BTM.updateNote(${i}, this.value)"></div>`;
      }

      html += '<div style="font-size:11px; font-weight:bold; margin:10px 0 4px 0; color:#1565C0; text-transform:uppercase;">Bank Details</div>';

      html += `<div class="btm-note-row" style="margin-bottom:4px; gap:8px; align-items:center;">
        <div class="btm-note-lbl bank" style="min-width:150px; width:150px; white-space:nowrap;">Bank Name &amp; Branch</div>
        <input type="text" class="btm-note-input" value="${notes[8]}" oninput="BTM.limitWords(this, 250)" onchange="BTM.updateNote(8, this.value)" style="flex:1;">
      </div>`;

      const accType = notes[12] || 'saving';
      const typeOptions = [
        { val: 'saving', name: 'Saving' },
        { val: 'current', name: 'Current' },
        { val: 'over draft', name: 'Over Draft' }
      ].map(opt => `<option value="${opt.val}"${opt.val === accType ? ' selected' : ''}>${opt.name}</option>`).join('');

      html += `<div class="btm-note-row" style="margin-bottom:4px; gap:8px; align-items:center;">
        <div class="btm-note-lbl bank" style="min-width:150px; width:150px; white-space:nowrap;">Account Number</div>
        <input type="text" class="btm-note-input" value="${notes[9]}" oninput="this.value=this.value.replace(/[^0-9]/g,''); BTM.limitWords(this, 250)" onchange="BTM.updateNote(9, this.value)" style="flex:1.5; min-width:170px;" inputmode="numeric">
        <div class="btm-note-lbl bank" style="min-width:70px; text-align:right; white-space:nowrap;">IFSC Code</div>
        <input type="text" class="btm-note-input" value="${notes[10]}" oninput="this.value=this.value.replace(/[^A-Za-z0-9]/g,'').toUpperCase(); BTM.limitWords(this, 250)" onchange="BTM.updateNote(10, this.value)" style="width:115px; flex:0 0 115px; text-transform:uppercase;" maxlength="11">
        <div class="btm-note-lbl bank" style="min-width:90px; text-align:right; white-space:nowrap;">Account Type</div>
        <select class="classic-erp-select btm-note-input" onchange="BTM.updateNote(12, this.value)" style="width:120px; flex:0 0 120px; height:28px;">
          ${typeOptions}
        </select>
      </div>`;

      html += `<div class="btm-note-row" style="margin-bottom:4px; gap:8px; align-items:center;">
        <div class="btm-note-lbl bank" style="min-width:150px; width:150px; white-space:nowrap;">UPI / Payment Note</div>
        <input type="text" class="btm-note-input" value="${notes[11]}" oninput="BTM.limitWords(this, 250)" onchange="BTM.updateNote(11, this.value)" style="flex:1;">
      </div>`;

      const qrSrc = billTypes[currentType].qrImage || '';
      const dynamicQr = billTypes[currentType].dynamicQR || false;
      const intMethod = billTypes[currentType].interestMethod || 'M-CM';
      const intRate = billTypes[currentType].interestRate || '21%';
      const grossDate = billTypes[currentType].grossDate || '';
      const intPriority = billTypes[currentType].interestPriority || 'Interest First';

      const methods = [
        { val: 'M-CM', name: 'Monthly | Full Month Charge' },
        { val: 'M-DDME', name: 'Monthly | Due Date → Month-End Only' },
        { val: 'D-DD', name: 'Day-Wise | Delayed Days Only' }
      ];
      const methodOptions = methods.map(m => `<option value="${m.val}"${m.val === intMethod ? ' selected' : ''}>${m.name}</option>`).join('');

      const priorities = ['Interest First', 'Principal First'];
      const priorityOptions = priorities.map(p => `<option value="${p}"${p === intPriority ? ' selected' : ''}>${p}</option>`).join('');

      html += `<div style="display:flex; gap:16px; margin-top:12px; padding-top:10px; border-top:1px solid #E0E0E0; align-items:flex-start;">`;

      html += `<div style="flex:0 0 120px; display:flex; flex-direction:column; gap:4px;">
        <div class="btm-qr-label" style="font-size:11px; font-weight:bold; color:#1565C0; text-transform:uppercase; white-space:nowrap;">QR Code (prints on bill)</div>
        <div class="btm-qr-box" onclick="BTM.uploadQR()" title="Click to upload QR code" style="width:120px; height:120px; border:2px dashed #BDBDBD; background:#FAFAFA; align-items:center; justify-content:center; cursor:pointer; position:relative; overflow:hidden; border-radius:4px; ${dynamicQr ? 'display:none;' : 'display:flex;'}">
          ${qrSrc ? `<img src="${qrSrc}" alt="QR Code" style="width:100%; height:100%; object-fit:contain; position:absolute; top:0; left:0;">` : `<div class="btm-qr-placeholder" style="display:flex; flex-direction:column; align-items:center; gap:4px; color:#9E9E9E; font-size:10px; text-align:center; pointer-events:none;"><i class="bi bi-qr-code" style="font-size:28px;"></i><span>Click to Upload<br>QR Code</span></div>`}
        </div>
        <div style="gap:4px; width:120px; ${dynamicQr ? 'display:none;' : 'display:flex;'}">
          <button type="button" class="btm-btn-3d" onclick="BTM.uploadQR()" style="font-size:10px; flex:1; padding:2px 4px; min-height:20px; display:inline-flex; align-items:center; justify-content:center; gap:3px;"><i class="bi bi-upload"></i> Upload</button>
          ${qrSrc ? `<button type="button" class="btm-btn-3d" onclick="BTM.removeQR()" style="font-size:10px;color:#C62828; padding:2px 4px; min-height:20px; display:inline-flex; align-items:center; justify-content:center;" title="Remove QR"><i class="bi bi-trash"></i></button>` : ''}
        </div>
        <div style="margin-top:4px; width:120px; ${qrSrc ? 'display:none;' : 'display:block;'}">
          <button type="button" class="btm-btn-3d" onclick="BTM.toggleDynamicQR()" style="font-size:10px; width:100%; padding:2px 4px; min-height:20px; display:inline-flex; align-items:center; justify-content:center; gap:3px; ${dynamicQr ? 'background:#E8F5E9; border-color:#2E7D32; color:#2E7D32; font-weight:bold;' : ''}" title="Toggle Dynamic QR code generation"><i class="bi bi-qr-code-scan"></i> ${dynamicQr ? 'DYNAMIC QR: ON' : 'DYNAMIC QR'}</button>
        </div>
      </div>`;

      const isGrossDateDisabled = (intMethod !== 'M-CM') ? 'disabled style="background-color: #F5F5F5; cursor: not-allowed;"' : '';
      const grossDateVal = (intMethod === 'M-CM') ? grossDate : '';

      html += `<div style="flex:1; display:flex; flex-direction:column; margin-left:8px;">
        <div style="font-size:11px; font-weight:bold; margin-bottom:8px; color:#1565C0; text-transform:uppercase;">SIMPLE INTEREST CALCULATION</div>
        <div class="btm-note-row" style="margin-bottom:4px; gap:8px;">
          <div class="btm-note-lbl">INTEREST METHOD</div>
          <select id="btm-int-method-sel" class="classic-erp-select btm-note-input" style="flex:1; height:28px;" onchange="BTM.updateIntField('interestMethod', this.value);">
            ${methodOptions}
          </select>
        </div>
        <div class="btm-note-row" style="margin-bottom:4px; gap:8px;">
          <div class="btm-note-lbl">RATE OF INT (%)</div>
          <input type="text" class="btm-note-input" style="flex:1; height:28px;" value="${intRate}" onchange="BTM.updateIntField('interestRate', this.value)">
          <div style="font-size:11px; font-weight:600; min-width:80px; text-align:right;">GROSS DAYS</div>
          <input type="number" min="0" step="1" class="btm-note-input" style="flex:1; height:28px; padding:0 4px;" value="${grossDateVal}" onchange="BTM.updateIntField('grossDate', this.value)" ${isGrossDateDisabled}>
        </div>
        <div class="btm-note-row" style="margin-bottom:4px; gap:8px;">
          <div class="btm-note-lbl">PRIORITY ORDER</div>
          <select class="classic-erp-select btm-note-input" style="flex:1; height:28px;" onchange="BTM.updateIntField('interestPriority', this.value)">
            ${priorityOptions}
          </select>
          <button type="button" class="btm-btn-3d" onclick="BTM.downloadIntMethodPDF()" style="color:#C62828; font-weight:bold; font-size:10px; padding:2px 8px; min-height:28px; display:inline-flex; align-items:center; justify-content:center; gap:4px;" title="Download Specification Sheet PDF"><i class="bi bi-download"></i> DOWNLOAD PDF</button>
        </div>`;

      const sigSrc = billTypes[currentType].signatureImage || '';
      html += `<div class="btm-note-row" style="margin-top:8px; gap:16px; align-items:flex-start; display:flex;">
        <div style="display:flex; flex-direction:column; gap:6px; min-width:120px;">
          <div class="btm-note-lbl" style="white-space: nowrap; margin-top: 4px; width: auto;">SIGNATURE UPLOAD</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button type="button" class="btm-btn-3d" onclick="BTM.uploadSig()" style="font-size:10px; padding:3px 12px; min-height:22px; display:inline-flex; align-items:center; justify-content:center; gap:4px; font-weight:700;"><i class="bi bi-upload"></i> UPLOAD</button>
            ${sigSrc ? `<button type="button" class="btm-btn-3d" onclick="BTM.removeSig()" style="font-size:10px; color:#C62828; padding:3px 8px; min-height:22px; display:inline-flex; align-items:center; justify-content:center;" title="Remove Signature"><i class="bi bi-trash"></i></button>` : ''}
          </div>
        </div>
        <div class="btm-sig-box" onclick="BTM.uploadSig()" title="Click to upload Signature">
          ${sigSrc ? `<img src="${sigSrc}" alt="Signature">` : `<span style="color:#9E9E9E; font-size:10px; font-weight:700; text-transform:uppercase; text-align:center; pointer-events:none;">PREVIEW</span>`}
        </div>
      </div>`;

      const billMethod = billTypes[currentType].billMethod || 'Monthly';
      const billMonths = billTypes[currentType].billMonths || '1';
      const billDate = billTypes[currentType].billDate || '01';
      const billDue = billTypes[currentType].billDue || '15';
      const billPeriod = billTypes[currentType].billPeriod || '';
      const showNotes = billTypes[currentType].showBillPeriodNotes === true;

      const methodsOpts = ['Monthly', '2-Month', 'Quarterly', 'Yearly', 'Customize']
        .map(m => `<option value="${m}"${m === billMethod ? ' selected' : ''}>${m}</option>`).join('');

      html += `<div style="display:flex; align-items:center; gap:8px; margin-top:14px; margin-bottom:8px; border-top:1px solid #E0E0E0; padding-top:10px;">
        <button type="button" class="btm-btn-3d" onclick="BTM.toggleBillPeriodNotes()" style="padding:2px 6px; min-height:20px; font-size:10px; display:inline-flex; align-items:center; justify-content:center; ${showNotes ? 'background:#E8F5E9; border-color:#2E7D32; color:#2E7D32; font-weight:bold;' : 'background:#FFEBEE; border-color:#C62828; color:#C62828; font-weight:bold;'}" title="Toggle Visibility of Billing Period Notes">${showNotes ? '<i class="bi bi-eye-fill"></i> ON' : '<i class="bi bi-eye-slash-fill"></i> OFF'}</button>
        <div style="font-size:11px; font-weight:bold; color:#1565C0; text-transform:uppercase;">BILLING PERIOD NOTES</div>
      </div>
      <div style="display:${showNotes ? 'block' : 'none'};">
        <div class="btm-note-row" style="margin-bottom:4px; gap:8px;">
          <div class="btm-note-lbl">BILLING METHOD</div>
          <select class="classic-erp-select" style="flex:1; height:20px; font-size:11px;" onchange="BTM.updateIntField('billMethod', this.value)">
            ${methodsOpts}
          </select>
          <div style="font-size:11px; font-weight:600; min-width:80px; text-align:right;">NO. OF MONTHS</div>
          <input type="text" class="btm-note-input" style="width:60px;" value="${billMonths}" onchange="BTM.updateIntField('billMonths', this.value)">
        </div>
        <div class="btm-note-row" style="margin-bottom:4px; gap:8px;">
          <div class="btm-note-lbl">BILL ISSUE DAYS</div>
          <input type="text" class="btm-note-input" style="flex:1;" value="${billDate}" onchange="BTM.updateIntField('billDate', this.value)">
          <div style="font-size:11px; font-weight:600; min-width:80px; text-align:right;">DUE DAYS</div>
          <input type="text" class="btm-note-input" style="width:60px;" value="${billDue}" onchange="BTM.updateIntField('billDue', this.value)">
        </div>
        <div class="btm-note-row" style="margin-bottom:4px; gap:8px;">
          <div class="btm-note-lbl">BILLING PERIOD</div>
          <input type="text" class="btm-note-input" style="flex:1;" placeholder="e.g. Apr-2025 to Mar-2026" value="${billPeriod}" onchange="BTM.updateIntField('billPeriod', this.value)">
        </div>
      </div>`;

      html += `</div></div>`;
      document.getElementById('btm-notes').innerHTML = html;

      BTM._attachQRInput();
      BTM._attachSigInput();
    },

    toggleDynamicQR: function () {
      if (!billTypes[currentType]) return;
      const currentVal = billTypes[currentType].dynamicQR || false;
      billTypes[currentType].dynamicQR = !currentVal;
      BTM.renderNotes();
      toast('Dynamic QR ' + (!currentVal ? 'enabled' : 'disabled') + '.', true);
    },

    toggleBillPeriodNotes: function () {
      if (!billTypes[currentType]) return;
      const currentVal = billTypes[currentType].showBillPeriodNotes === true;
      billTypes[currentType].showBillPeriodNotes = !currentVal;
      BTM.renderNotes();
      toast('Billing Period Notes details ' + (!currentVal ? 'visible' : 'hidden') + '.', true);
    },

    _attachQRInput: function () {
      const existing = document.getElementById('btm-qr-file-input');
      if (existing) existing.remove();
      const inp = document.createElement('input');
      inp.type = 'file'; inp.id = 'btm-qr-file-input'; inp.accept = 'image/*'; inp.style.display = 'none';
      inp.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          billTypes[currentType].qrImage = e.target.result;
          BTM.renderNotes();
          toast('QR Code uploaded.', true);
        };
        reader.readAsDataURL(file);
      });
      document.body.appendChild(inp);
    },

    uploadQR: function () {
      let inp = document.getElementById('btm-qr-file-input');
      if (!inp) { BTM._attachQRInput(); inp = document.getElementById('btm-qr-file-input'); }
      inp.value = ''; inp.click();
    },

    removeQR: function () {
      BTM.showConfirm('Remove QR Code', 'Remove QR Code for "' + currentType + '"?', 'This will remove the QR code image.', false).then(confirmed => {
        if (!confirmed) return;
        billTypes[currentType].qrImage = '';
        BTM.renderNotes();
        toast('QR Code removed.', true);
      });
    },

    _attachSigInput: function () {
      const existing = document.getElementById('btm-sig-file-input');
      if (existing) existing.remove();
      const inp = document.createElement('input');
      inp.type = 'file'; inp.id = 'btm-sig-file-input'; inp.accept = 'image/*'; inp.style.display = 'none';
      inp.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          billTypes[currentType].signatureImage = e.target.result;
          BTM.renderNotes();
          toast('Signature uploaded.', true);
        };
        reader.readAsDataURL(file);
      });
      document.body.appendChild(inp);
    },

    uploadSig: function () {
      let inp = document.getElementById('btm-sig-file-input');
      if (!inp) { BTM._attachSigInput(); inp = document.getElementById('btm-sig-file-input'); }
      inp.value = ''; inp.click();
    },

    removeSig: function () {
      BTM.showConfirm('Remove Signature', 'Remove Signature for "' + currentType + '"?', 'This will remove the signature image.', false).then(confirmed => {
        if (!confirmed) return;
        billTypes[currentType].signatureImage = '';
        BTM.renderNotes();
        toast('Signature removed.', true);
      });
    },

    updateNote: function (idx, val) {
      if (!billTypes[currentType]) return;
      billTypes[currentType].notes[idx] = val;
    },

    deleteCurrentType: async function () {
      if (currentType.trim().toLowerCase() === 'maintenance') {
        toast('Default "Maintenance" Bill Type cannot be deleted.', false);
        return;
      }
      const keys = Object.keys(billTypes);
      if (keys.length <= 1) {
        toast('Cannot delete the last remaining Bill Type.', false);
        return;
      }
      const confirmed = await BTM.showConfirm('Confirm Deletion', 'Delete Bill Type "' + currentType + '"?', 'This will permanently remove all its heads and notes.', true);
      if (!confirmed) return;

      const deletedType = currentType;
      const targetId = billTypes[deletedType].id || currentTypeId;

      try {
        const res = await fetch(`${btmApiBase()}/api/bill-types/${targetId}`, { method: 'DELETE', headers: getAuthHeaders() });
        const json = await res.json();

        if (res.ok && json.success) {
          const nextType = keys.find(k => k !== deletedType);
          delete billTypes[deletedType];
          BTM.switchType(nextType);
          saveLocalBillTypes();
          try { localStorage.setItem('jeevika_bill_types_sync_ts', String(Date.now())); } catch (e) {}
          toast('Bill Type "' + deletedType + '" deleted.', true);
        } else {
          const nextType = keys.find(k => k !== deletedType);
          delete billTypes[deletedType];
          BTM.switchType(nextType);
          saveLocalBillTypes();
          try { localStorage.setItem('jeevika_bill_types_sync_ts', String(Date.now())); } catch (e) {}
          toast('Bill Type "' + deletedType + '" deleted locally.', true);
        }
      } catch (e) {
        const nextType = keys.find(k => k !== deletedType);
        delete billTypes[deletedType];
        BTM.switchType(nextType);
        saveLocalBillTypes();
        try { localStorage.setItem('jeevika_bill_types_sync_ts', String(Date.now())); } catch (e) {}
        toast('Bill Type "' + deletedType + '" deleted locally.', true);
      }
    },

    limitWords: function (inputEl, maxWords) {
      const val = inputEl.value;
      const words = val.split(/\s+/).filter(Boolean);
      if (words.length > maxWords) {
        toast('Word limit of ' + maxWords + ' words exceeded.', false);
        inputEl.value = words.slice(0, maxWords).join(' ');
      }
    },

    saveAll: async function () {
      if (!billTypes[currentType]) return;

      const tData = billTypes[currentType];
      const payload = {
        note1: tData.notes[0] || '',
        note2: tData.notes[1] || '',
        note3: tData.notes[2] || '',
        note4: tData.notes[3] || '',
        note5: tData.notes[4] || '',
        note6: tData.notes[5] || '',
        note7: tData.notes[6] || '',
        note8: tData.notes[7] || '',
        bankName: tData.notes[8] || '',
        accountNo: tData.notes[9] || '',
        ifscCode: tData.notes[10] || '',
        accountType: tData.notes[12] || 'saving',
        upiNote: tData.notes[11] || '',
        qrCodePath: tData.qrImage || '',
        signaturePath: tData.signatureImage || '',
        dynamicQR: !!tData.dynamicQR,
        interestMethod: tData.interestMethod || 'M-CM',
        interestRate: tData.interestRate || '21%',
        interestType: tData.interestType || 'Simple',
        grossDays: tData.grossDate || '',
        interestPriority: tData.interestPriority || 'Interest First',
        showBillPeriodNotes: !!tData.showBillPeriodNotes,
        billMethod: tData.billMethod || 'Monthly',
        billMonths: tData.billMonths || '1',
        billDate: tData.billDate || '01',
        billDue: tData.billDue || '15',
        billPeriod: tData.billPeriod || '',
        heads: tData.heads.map((h, idx) => ({
          srNo: idx + 1,
          accountId: h.accountId,
          accCode: h.accCode,
          accName: h.accName,
          gstApplicable: !!h.gstApp,
          gstExempted: !!h.gstExm
        }))
      };

      try {
        saveLocalBillTypes();
        const targetId = tData.id || currentTypeId;
        const res = await fetch(`${btmApiBase()}/api/bill-types/${targetId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (res.ok && json.success) {
          toast('Configuration saved. GST dependency and Interest linked.', true);
          // Broadcast sync to other tabs
          try {
            localStorage.setItem('jeevika_bill_types_sync_ts', String(Date.now()));
          } catch (e) { }
        } else {
          toast('Saved locally.', true);
        }
      } catch (e) {
        saveLocalBillTypes();
        toast('Saved configuration locally.', true);
      }
    },

    reset: function () {
      loadConfig();
      toast('Reset to last saved state.', true);
    },

    exit: function () {
      if (typeof window.WorkspaceBridge !== 'undefined') {
        window.WorkspaceBridge.closeTab('bill-type-master');
      }
    },

    updateIntField: function (field, val) {
      if (!billTypes[currentType]) return;
      billTypes[currentType][field] = val;
      if (field === 'interestMethod') BTM.renderNotes();
    },

    downloadIntMethodPDF: function () {
      const typeData = billTypes[currentType];
      if (!typeData) return;

      const method = typeData.interestMethod || 'M-CM';
      const rate = typeData.interestRate || '21%';
      const grossDate = typeData.grossDate || '';
      const priority = typeData.interestPriority || 'Interest First';
      const sigSrc = typeData.signatureImage || '';
      const dueDay = parseInt(typeData.billDue, 10) || 15;
      const grossDays = parseInt(grossDate, 10) || 0;
      const displayGrossDays = grossDays ? grossDays + ' Days' : '0 Days';
      const numericRate = parseFloat(rate.replace('%', '')) || 21;
      const testPrincipal = 15000;

      let methodName = 'Monthly | Full Month Charge';
      let formulaText = 'Interest = Principal &times; (Rate / 12 / 100) &times; 1 Month';
      let explanation = 'A full month\'s interest is charged if payment is realized past the Gross Days grace period.';
      const grossDateDay = dueDay + grossDays;
      const paidDay = grossDateDay + 1;
      let delayMeasure = '1 Day past Gross Days (Paid on ' + paidDay + 'th)';
      let intAmount = (testPrincipal * (numericRate / 100)) / 12;
      let exampleCalc = 'Interest = ₹15,000 &times; (' + numericRate + '% / 12) &times; 1 = <strong>₹' + intAmount.toFixed(2) + '</strong>';
      let testDueDate = dueDay + '-Apr-2026';
      let testPaymentDate = paidDay + '-Apr-2026';

      if (method === 'D-DD') {
        const delayedDays = 2;
        intAmount = (testPrincipal * (numericRate / 100) * delayedDays) / 365;
        methodName = 'Day-Wise | Delayed Days Only';
        formulaText = 'Interest = Principal &times; (Rate / 365 / 100) &times; Delayed Days';
        explanation = 'Interest is charged strictly for the exact count of days delayed past the due date.';
        exampleCalc = 'Interest = ₹15,000 &times; (' + numericRate + '% / 365) &times; ' + delayedDays + ' Days = <strong>₹' + intAmount.toFixed(2) + '</strong>';
        delayMeasure = delayedDays + ' Days Delay (Paid on ' + (dueDay + 2) + 'th)';
        testDueDate = dueDay + '-Apr-2026';
        testPaymentDate = (dueDay + 2) + '-Apr-2026';
      } else if (method === 'M-DDME') {
        const daysToMonthEnd = Math.max(1, 30 - dueDay);
        intAmount = (testPrincipal * (numericRate / 100) * daysToMonthEnd) / 365;
        methodName = 'Monthly | Due Date → Month-End Only';
        formulaText = 'Interest = Principal &times; (Rate / 365 / 100) &times; Days (Due Date to Month-End)';
        explanation = 'If payment is delayed past the Due Date, interest is charged for the remaining days of that calendar month.';
        exampleCalc = 'Interest = ₹15,000 &times; (' + numericRate + '% / 365) &times; ' + daysToMonthEnd + ' Days = <strong>₹' + intAmount.toFixed(2) + '</strong>';
        delayMeasure = 'Delayed past Due Date (Paid on ' + (dueDay + 1) + 'th)';
        testDueDate = dueDay + '-Apr-2026';
        testPaymentDate = (dueDay + 1) + '-Apr-2026';
      }

      const intAmtStr = '₹' + intAmount.toFixed(2);
      const balDueStr = '₹' + (testPrincipal + intAmount).toFixed(2);

      const printWin = window.open('', '_blank', 'width=800,height=1000');
      if (!printWin) { alert('Please allow popups to print.'); return; }

      const html = `<!DOCTYPE html><html><head><title>Interest Method Specification - ${currentType}</title>
      <style>
        body { font-family: "Segoe UI", Arial, sans-serif; color: #333; margin: 0; padding: 15px; background: #FFF; font-size: 11.5px; }
        .letterhead { text-align: center; border-bottom: 2px double #0A246A; padding-bottom: 6px; margin-bottom: 12px; }
        .lh-title { font-size: 16px; font-weight: bold; color: #0A246A; font-family: "Georgia", serif; }
        .doc-title { text-align: center; font-size: 13px; font-weight: bold; text-decoration: underline; margin-bottom: 12px; text-transform: uppercase; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        .meta-table td { padding: 4px 8px; border: 1px solid #D0D0D0; }
        .meta-lbl { font-weight: bold; background: #F4F4F4; width: 25%; color: #0A246A; }
        .formula-box { background: #F9F9F9; border-left: 4px solid #0A246A; padding: 8px 12px; font-family: monospace; font-size: 12px; margin: 6px 0; }
        .calc-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        .calc-table th { background: #0A246A; color: #FFF; padding: 5px; border: 1px solid #0A246A; font-size: 9.5px; }
        .calc-table td { padding: 5px; border: 1px solid #D0D0D0; text-align: center; font-size: 10.5px; }
        .sig-section { margin-top: 25px; display: flex; justify-content: space-between; }
        .sig-box { width: 200px; text-align: center; }
        .sig-line { border-top: 1px solid #333; margin-top: 25px; padding-top: 3px; font-weight: bold; }
        .print-btn { display: block; width: 150px; margin: 0 auto 15px auto; padding: 6px 12px; background: #0A246A; color: #FFF; border: none; font-weight: bold; border-radius: 4px; cursor: pointer; text-align: center; }
        @media print { .print-btn { display: none; } }
      </style></head><body>
        <button class="print-btn" onclick="window.print()">PRINT RESOLUTION</button>
        <div class="letterhead">
          <div class="lh-title">JEEVIKA ERP CO-OPERATIVE HOUSING SOCIETY LTD.</div>
        </div>
        <div class="doc-title">Official Spec Sheet &amp; Board Resolution</div>
        <p><strong>Subject:</strong> Standardization of Interest Computation Method for Maintenance Dues.</p>
        <table class="meta-table">
          <tr><td class="meta-lbl">Bill Type</td><td>${currentType}</td><td class="meta-lbl">Interest Method</td><td>${methodName}</td></tr>
          <tr><td class="meta-lbl">Rate of Interest</td><td>${rate} p.a.</td><td class="meta-lbl">Gross Days</td><td>${displayGrossDays}</td></tr>
          <tr><td class="meta-lbl">Priority Order</td><td>${priority}</td><td class="meta-lbl">Effective Date</td><td>25-May-2026</td></tr>
        </table>
        <h3>1. Mathematical Formulation</h3>
        <div class="formula-box">${formulaText}</div>
        <p><strong>Operational Rule:</strong> ${explanation}</p>
        <h3>2. Worked Example</h3>
        <table class="calc-table">
          <thead><tr><th>Head Particulars</th><th>Principal Amt</th><th>Due Date</th><th>Realized Date</th><th>Delay Measure</th><th>Interest Rate</th><th>Interest Accrued</th><th>Total Balance</th></tr></thead>
          <tbody><tr><td><strong>Outstanding Dues</strong></td><td>₹15,000.00</td><td>${testDueDate}</td><td>${testPaymentDate}</td><td>${delayMeasure}</td><td>${rate} p.a.</td><td style="color:#C62828; font-weight:bold;">${intAmtStr}</td><td style="font-weight:bold; background:#F5F5F5;">${balDueStr}</td></tr></tbody>
        </table>
        <p><strong>Step-by-Step Logic:</strong> ${exampleCalc}</p>
        <div class="sig-section">
          <div class="sig-box">${sigSrc ? `<img src="${sigSrc}" style="max-height:40px; max-width:150px; object-fit:contain;"><br>` : ''}<div class="sig-line">Hon. Secretary</div></div>
          <div class="sig-box"><div class="sig-line">Hon. Chairman</div></div>
        </div>
      </body></html>`;

      printWin.document.write(html);
      printWin.document.close();
    }
  };

  function mapHeadsFromApi(apiHeads, gstOn) {
    const heads = defaultHeads(gstOn);
    if (Array.isArray(apiHeads) && apiHeads.length > 0) {
      apiHeads.forEach(h => {
        const slot = (h.srNo || h.no || 0) - 1;
        const maxUserSlot = gstOn ? 30 : 29;
        if (slot >= 0 && slot < maxUserSlot) {
          const nameLower = (h.accName || '').toLowerCase().trim();
          if (nameLower === 'interest' || nameLower === 'cgst' || nameLower === 'sgst') {
            return;
          }
          heads[slot] = {
            no: slot + 1,
            srNo: slot + 1,
            accountId: h.accountId || null,
            accCode: h.accCode || '',
            accName: h.accName || '',
            gstApp: !!(h.gstApplicable || h.gstApp),
            gstExm: !!(h.gstExempted || h.gstExm)
          };
        }
      });
    }
    return heads;
  }

  async function loadConfig() {
    // 1. Immediately render initial state synchronously so UI is never blank
    getActiveTypeObj();
    BTM.toggleGST(isGstEnabled);
    BTM.initNotesCollapsedState();

    try {
      const socId = getActiveSocietyId();

      // 2. Fetch from API to get PostgreSQL database source of truth
      const url = `${btmApiBase()}/api/bill-types?societyId=${socId}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json && json.success) {
          if (json.isGstEnabled !== undefined) {
            isGstEnabled = !!json.isGstEnabled;
            sessionStorage.setItem('activeSocietyGSTApplicable', isGstEnabled ? 'Y' : 'N');
            localStorage.setItem('activeSocietyGSTApplicable', isGstEnabled ? 'Y' : 'N');
          }

          if (Array.isArray(json.data) && json.data.length > 0) {
            const freshBillTypes = {};
            for (const t of json.data) {
              try {
                const typeName = (t.billTypeName || '').trim().replace(/\s+/g, ' ');
                const detailRes = await fetch(`${btmApiBase()}/api/bill-types/${t.billTypeId}`, { headers: getAuthHeaders() });
                if (detailRes.ok) {
                  const detailJson = await detailRes.json();
                  if (detailJson && detailJson.success) {
                    const n = detailJson.notes || {};
                    freshBillTypes[typeName] = {
                      id: t.billTypeId,
                      heads: mapHeadsFromApi(detailJson.heads, isGstEnabled),
                      notes: [
                        n.note1 || '', n.note2 || '', n.note3 || '', n.note4 || '',
                        n.note5 || '', n.note6 || '', n.note7 || '', n.note8 || '',
                        n.bankName || '', n.accountNo || '', n.ifscCode || '', n.upiNote || '', n.accountType || 'saving'
                      ],
                      qrImage: n.qrCodePath || '',
                      signatureImage: n.signaturePath || '',
                      dynamicQR: !!n.dynamicQR,
                      interestMethod: n.interestMethod || 'M-CM',
                      interestRate: n.interestRate || '21%',
                      interestType: n.interestType || 'Simple',
                      grossDate: n.grossDays || '',
                      interestPriority: n.interestPriority || 'Interest First',
                      showBillPeriodNotes: !!n.showBillPeriodNotes,
                      billMethod: n.billMethod || 'Monthly',
                      billMonths: n.billMonths || '1',
                      billDate: n.billDate || '01',
                      billDue: n.billDue || '15',
                      billPeriod: n.billPeriod || ''
                    };
                  }
                }
              } catch (err) {
                console.warn("Failed fetching detail for bill type:", t.billTypeId, err);
              }
            }
            // Ensure Maintenance is always present in freshBillTypes
            const hasMaintApi = Object.keys(freshBillTypes).some(k => k.trim().toLowerCase() === 'maintenance');
            if (!hasMaintApi) {
              const existingM = billTypes['Maintenance'] || (billTypes['MAINTENANCE'] ? billTypes['MAINTENANCE'] : null);
              freshBillTypes['Maintenance'] = existingM || {
                id: 1,
                heads: defaultHeads(isGstEnabled),
                notes: Array.from({ length: 13 }).map(() => ''),
                qrImage: '',
                signatureImage: '',
                dynamicQR: false,
                interestMethod: 'M-CM',
                interestRate: '21%',
                interestType: 'Simple',
                grossDate: '',
                interestPriority: 'Interest First',
                showBillPeriodNotes: false,
                billMethod: 'Monthly',
                billMonths: '1',
                billDate: '01',
                billDue: '15',
                billPeriod: ''
              };
            }

            if (Object.keys(freshBillTypes).length > 0) {
              billTypes = freshBillTypes;
            }
          }
        }
      }
    } catch (e) {
      console.warn("API load offline, using local fallback", e);
    } finally {
      // Ensure Maintenance is always present in billTypes!
      const hasMaintFinal = Object.keys(billTypes).some(k => k.trim().toLowerCase() === 'maintenance');
      if (!hasMaintFinal) {
        billTypes['Maintenance'] = {
          id: 1,
          heads: defaultHeads(isGstEnabled),
          notes: Array.from({ length: 13 }).map(() => ''),
          qrImage: '',
          signatureImage: '',
          dynamicQR: false,
          interestMethod: 'M-CM',
          interestRate: '21%',
          interestType: 'Simple',
          grossDate: '',
          interestPriority: 'Interest First',
          showBillPeriodNotes: false,
          billMethod: 'Monthly',
          billMonths: '1',
          billDate: '01',
          billDue: '15',
          billPeriod: ''
        };
      }
      getActiveTypeObj();
      BTM.toggleGST(isGstEnabled);
      saveLocalBillTypes();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadConfig);
  } else {
    loadConfig();
  }

})();
