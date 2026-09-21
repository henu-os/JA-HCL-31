// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Group Master JS
// Real-time backend API sync: /api/groups
// ═══════════════════════════════════════════════════════════

'use strict';

let gmList        = [];
let gmSelectedId  = 0;
let gmChecked     = {};
let gmMultiMode   = false;
let gmConfirmCb   = null;

let gmAllAccounts           = [];
let gmAccountsLoaded        = false;
let gmCurrentLinkedAccounts = [];
let gmActiveGroupId         = 0;

const mainGroupNames = { 1: 'Asset', 2: 'Liability', 3: 'Income', 4: 'Expenditure' };
const codePrefix     = { 1: 'AS', 2: 'LI', 3: 'IN', 4: 'EX' };

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  gmInitWorkspaceLabel();
  gmLoadList();
  gmLoadAccounts();
  gmSetupKeyboardNav();
});

function gmApiBase() {
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.AppConfig && window.AppConfig.apiBase) return window.AppConfig.apiBase;
  return 'http://localhost:5002';
}

function gmGetActiveSocietyCode() {
  return localStorage.getItem('activeSocietyCode') || sessionStorage.getItem('activeSocietyCode') || '';
}

function gmGetActiveSocietyId() {
  const id = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
  return id ? parseInt(id, 10) : 0;
}

function gmInitWorkspaceLabel() {
  const socCode = gmGetActiveSocietyCode();
  const socName = localStorage.getItem('activeSocietyName') || sessionStorage.getItem('activeSocietyName') || '—';
  const socSpan = document.querySelector('.gm-soc-span');
  const fySpan  = document.querySelector('.gm-fy-span');
  if (socSpan) socSpan.textContent = socName ? `${socName} (${socCode || '—'})` : '—';
  if (fySpan)  fySpan.textContent  = '2025-26';
}

// ── Load List ─────────────────────────────────────────────
async function gmLoadList() {
  const tbody = document.getElementById('gm-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#808080;">
    <i class="bi bi-hourglass-split"></i> Loading groups...</td></tr>`;

  try {
    const socId = gmGetActiveSocietyId();
    const url = socId > 0 ? `${gmApiBase()}/api/groups?societyId=${socId}` : `${gmApiBase()}/api/groups`;
    const res  = await fetch(url, { headers: getAuthHeaders() });
    const json = await res.json();

    if (!res.ok) throw new Error(json.message || 'API error');

    gmList = Array.isArray(json.data) ? json.data : [];
    
    // Process items for default tags
    gmList.forEach(g => {
      const code = g.grpCode || g.GrpCode || '';
      const type = g.grpType || g.GrpType || 1;
      g._isDefault = (type === 2);
      g._code      = g._isDefault ? `${code} (D)` : code;
    });

    // Sort order: 3=Income, 4=Expenditure, 1=Asset, 2=Liability
    const typeOrder = { 3: 1, 4: 2, 1: 3, 2: 4 };
    gmList.sort((a, b) => {
      const orderA = typeOrder[a.grpMainId || a.GrpMainId] || 99;
      const orderB = typeOrder[b.grpMainId || b.GrpMainId] || 99;
      if (orderA !== orderB) return orderA - orderB;
      const codeA = (a.grpCode || '').toLowerCase();
      const codeB = (b.grpCode || '').toLowerCase();
      return codeA.localeCompare(codeB);
    });

    gmRenderList();

    if (gmList.length > 0 && !gmSelectedId) {
      gmSelectRow(gmList[0].socGroupId || gmList[0].groupId);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#dc2626;">
      <i class="bi bi-exclamation-triangle"></i> Connection Error: ${e.message}</td></tr>`;
  }
}

// ── Render List ───────────────────────────────────────────
function gmRenderList() {
  const tbody    = document.getElementById('gm-tbody');
  const searchInp = document.getElementById('gm-search-inp');
  const filterSel = document.getElementById('gm-filter-sel');
  const chkAll   = document.getElementById('gm-chk-all');

  if (!tbody) return;

  const search = (searchInp ? searchInp.value : '').toLowerCase().trim();
  const filter = filterSel ? filterSel.value : '';

  const filtered = gmList.filter(g => {
    const mainId = g.grpMainId || g.GrpMainId;
    if (filter && String(mainId) !== filter) return false;
    if (search) {
      const code = (g._code || g.grpCode || '').toLowerCase();
      const name = (g.grpName || g.GrpName || '').toLowerCase();
      const main = (mainGroupNames[mainId] || '').toLowerCase();
      if (!code.includes(search) && !name.includes(search) && !main.includes(search)) return false;
    }
    return true;
  });

  if (chkAll) chkAll.style.display = gmMultiMode ? 'inline-block' : 'none';

  const badge = document.getElementById('gm-count-badge');
  if (badge) badge.textContent = `${filtered.length} Records`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#808080;">
      No matching groups found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(g => {
    const id        = g.socGroupId || g.groupId || g.SocGroupId;
    const code      = g._code || g.grpCode || '';
    const name      = g.grpName || g.GrpName || '';
    const mainId    = g.grpMainId || g.GrpMainId;
    const mainLabel = mainGroupNames[mainId] || '—';
    const sel       = id === gmSelectedId ? 'class="selected"' : '';
    const isChecked = gmChecked[id] ? 'checked' : '';

    return `<tr ${sel} onclick="gmSelectRow(${id})" ondblclick="gmAlterById(${id})">
      <td style="text-align:center;">
        ${gmMultiMode ? `<input type="checkbox" ${isChecked} onclick="event.stopPropagation();gmChk(${id}, this.checked)" style="accent-color:#1565C0;">` : ''}
      </td>
      <td style="font-weight:700;">${code}</td>
      <td style="font-weight:700;">${name}</td>
      <td>${mainLabel}</td>
    </tr>`;
  }).join('');
}

// ── Select Row ────────────────────────────────────────────
function gmSelectRow(id) {
  gmSelectedId = id;
  const rows = document.querySelectorAll('#gm-tbody tr');
  rows.forEach(r => r.classList.remove('selected'));

  const g = gmList.find(x => (x.socGroupId || x.groupId || x.SocGroupId) === id);
  if (g) {
    // Fill viewer if form mode is not active
    const isSaveVisible = document.getElementById('gm-btn-save').classList.contains('gm-btn-hidden') === false;
    if (!isSaveVisible) {
      setVal('gm-edit-id', id);
      setVal('gm-code', g.grpCode || g.GrpCode || '');
      setVal('gm-name', g.grpName || g.GrpName || '');
      setVal('gm-mainid', g.grpMainId || g.GrpMainId || '');
      setChk('gm-subtotal', (g.grpSubtotal === 'True' || g.grpSubtotal === true));
      setText('gm-frame-title', `Group Viewer — ${g.grpName || g.GrpName}`);

      disableFormInputs(true);
      gmRenderLinkedAccounts(id);
    }
  }
  gmRenderList();
}

// ── Show / Hide States ────────────────────────────────────
function gmShowList() {
  document.getElementById('gm-form-state').style.display = 'none';
  document.getElementById('gm-list-state').style.display = 'flex';

  show('gm-btn-add', 'gm-btn-alter', 'gm-btn-delete', 'gm-btn-print', 'gm-other-drop', 'gm-btn-search');
  hide('gm-btn-save', 'gm-btn-cancel');

  disableFormInputs(true);
  if (gmSelectedId) gmSelectRow(gmSelectedId);
}

function gmShowForm() {
  document.getElementById('gm-list-state').style.display = 'none';
  document.getElementById('gm-form-state').style.display = 'flex';

  hide('gm-btn-add', 'gm-btn-alter', 'gm-btn-delete', 'gm-btn-print', 'gm-other-drop', 'gm-btn-search');
  show('gm-btn-save', 'gm-btn-cancel');

  disableFormInputs(false);
}

function disableFormInputs(disabled) {
  ['gm-code', 'gm-name', 'gm-mainid', 'gm-subtotal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
  gmUpdateToggleStatus();
}

function show(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('gm-btn-hidden');
  });
}

function hide(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('gm-btn-hidden');
  });
}

// ── Real-Time Auto Code Generator from Database ──────────
async function gmFetchNextCode(mainId) {
  if (!mainId) return;
  const socId = gmGetActiveSocietyId();
  if (!socId) return;
  try {
    const res = await fetch(`${gmApiBase()}/api/groups/next-code?societyId=${socId}&mainId=${mainId}`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.nextCode) {
        const codeInput = document.getElementById('gm-code');
        if (codeInput && (!codeInput.value || codeInput.dataset.autoGenerated === 'true')) {
          codeInput.value = json.nextCode;
          codeInput.dataset.autoGenerated = 'true';
        }
      }
    }
  } catch (e) {
    console.error('Error fetching live next code:', e);
  }
}

function gmOnMainGroupChange() {
  const editId = parseInt(val('gm-edit-id')) || 0;
  if (editId === 0) {
    const mainId = parseInt(val('gm-mainid')) || 0;
    if (mainId > 0) {
      gmFetchNextCode(mainId);
    }
  }
}

// ── ADD ───────────────────────────────────────────────────
function gmAdd() {
  gmSelectedId = 0;
  setVal('gm-edit-id', '0');
  const codeInput = document.getElementById('gm-code');
  if (codeInput) {
    codeInput.value = '';
    codeInput.dataset.autoGenerated = 'true';
  }
  setVal('gm-name', '');
  setVal('gm-mainid', '');
  setChk('gm-subtotal', false);
  setText('gm-frame-title', 'New Group Creation');

  gmRenderLinkedAccounts(0);
  gmShowForm();
  setTimeout(() => document.getElementById('gm-name').focus(), 100);
}

// ── ALTER ─────────────────────────────────────────────────
function gmAlter() {
  if (!gmSelectedId) {
    gmAlert('Select a group from the list first.', true);
    return;
  }
  gmAlterById(gmSelectedId);
}

function gmAlterById(id) {
  const g = gmList.find(x => (x.socGroupId || x.groupId || x.SocGroupId) === id);
  if (!g) { gmAlert('Group not found.', true); return; }

  gmSelectedId = id;
  setVal('gm-edit-id', id);
  const codeInput = document.getElementById('gm-code');
  if (codeInput) {
    codeInput.value = g.grpCode || g.GrpCode || '';
    codeInput.dataset.autoGenerated = 'false';
  }
  setVal('gm-name', g.grpName || g.GrpName || '');
  setVal('gm-mainid', g.grpMainId || g.GrpMainId || '');
  setChk('gm-subtotal', (g.grpSubtotal === 'True' || g.grpSubtotal === true));
  setText('gm-frame-title', `Update Group — ${g.grpName || g.GrpName}`);

  gmRenderLinkedAccounts(id);
  gmShowForm();
  setTimeout(() => document.getElementById('gm-name').focus(), 100);
}

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = (typeof Auth !== 'undefined' && Auth.getToken)
    ? Auth.getToken()
    : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

// ── DELETE ────────────────────────────────────────────────
async function gmDelete() {
  if (gmMultiMode) {
    gmExecuteMultiDelete();
    return;
  }

  if (!gmSelectedId) {
    gmAlert('Select a group from the list first.', true);
    return;
  }

  const g = gmList.find(x => (x.socGroupId || x.groupId || x.SocGroupId) === gmSelectedId);
  if (g && (g.grpType === 2 || g.GrpType === 2 || g._isDefault)) {
    gmAlert('This is a default system group and cannot be deleted at any cost.', true);
    return;
  }

  gmConfirm(`Are you sure you want to delete group: <b>${g ? (g.grpName || g.GrpName) : ''}</b>?`, async (ok) => {
    if (!ok) return;
    try {
      const res  = await fetch(`${gmApiBase()}/api/groups/${gmSelectedId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (res.ok && json.success) {
        gmAlert('Group deleted successfully.');
        gmSelectedId = 0;
        gmLoadList();
      } else {
        gmAlert('Delete failed: ' + (json.message || 'Unknown'), true);
      }
    } catch (e) {
      gmAlert('Error deleting: ' + e.message, true);
    }
  });
}

// ── SAVE (Create or Update) ───────────────────────────────
async function gmSave() {
  const name   = val('gm-name').trim();
  const mainId = parseInt(val('gm-mainid')) || 0;
  let code     = val('gm-code').trim();

  if (!name) {
    gmAlert('Group Name is required.', true);
    document.getElementById('gm-name').focus();
    return;
  }

  if (!mainId) {
    gmAlert('Please select a Main Group category.', true);
    return;
  }

  const id = parseInt(val('gm-edit-id')) || 0;

  // Front-end duplicate code check if code is explicitly provided
  if (code) {
    const dup = gmList.find(x => {
      const xId   = x.socGroupId || x.groupId || x.SocGroupId;
      const xCode = (x.grpCode || x.GrpCode || '').trim().toUpperCase();
      return xId !== id && xCode === code.toUpperCase();
    });

    if (dup) {
      gmAlert(`Group Code '${code}' already exists.`, true);
      return;
    }
  }

  const existing = id ? gmList.find(x => (x.socGroupId || x.groupId || x.SocGroupId) === id) : null;
  const grpType  = existing ? (existing.grpType || existing.GrpType || (existing._isDefault ? 2 : 1)) : 1;

  const payload = {
    GroupId: id || 0,
    SocietyId: gmGetActiveSocietyId(),
    GrpCode: code, // If empty, server database assigns next code atomically
    GrpName: name,
    GrpMainId: mainId,
    GrpPrimaryName: name,
    GrpSubtotal: chk('gm-subtotal'),
    GrpType: grpType
  };

  const url    = id ? `${gmApiBase()}/api/groups/${id}` : `${gmApiBase()}/api/groups`;
  const method = id ? 'PUT' : 'POST';

  try {
    const res  = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    if (res.ok && json.success) {
      gmAlert(id ? 'Group updated successfully!' : `Group '${json.grpCode || code || name}' created successfully!`);
      gmShowList();
      gmLoadList();
    } else {
      gmAlert('Error: ' + (json.message || 'Unknown'), true);
    }
  } catch (e) {
    gmAlert('Error saving group: ' + e.message, true);
  }
}

// ── Multi Delete Mode ─────────────────────────────────────
function gmToggleMultiDelete() {
  gmMultiMode = !gmMultiMode;
  gmChecked   = {};
  gmRenderList();

  const delBtn = document.getElementById('gm-btn-delete');
  if (gmMultiMode) {
    gmAlert('Multi-Delete mode active. Check rows in grid and click DELETE SELECTION.');
    if (delBtn) delBtn.innerHTML = '<i class="bi bi-trash"></i> DELETE SELECTION';
  } else {
    if (delBtn) delBtn.innerHTML = '<i class="bi bi-trash"></i> DELETE';
  }
}

function gmChk(id, checked) {
  gmChecked[id] = checked;
}

function gmToggleAll(checked) {
  gmList.forEach(g => {
    const id = g.socGroupId || g.groupId || g.SocGroupId;
    gmChecked[id] = checked;
  });
  gmRenderList();
}

async function gmExecuteMultiDelete() {
  const ids = Object.keys(gmChecked).filter(k => gmChecked[k]);
  if (ids.length === 0) {
    gmAlert('No rows selected in grid.', true);
    return;
  }

  const hasDefault = ids.some(id => {
    const g = gmList.find(x => (x.socGroupId || x.groupId || x.SocGroupId) === parseInt(id));
    return g && (g.grpType === 2 || g.GrpType === 2 || g._isDefault);
  });

  if (hasDefault) {
    gmAlert('One or more selected groups are default system groups and cannot be deleted at any cost.', true);
    return;
  }

  gmConfirm(`Are you sure you want to delete these <b>${ids.length}</b> group(s)?`, async (ok) => {
    if (!ok) return;

    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        const res = await fetch(`${gmApiBase()}/api/groups/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    gmAlert(`${successCount} group(s) deleted successfully.${failCount ? ` (${failCount} failed)` : ''}`);
    gmMultiMode = false;
    gmChecked = {};
    const delBtn = document.getElementById('gm-btn-delete');
    if (delBtn) delBtn.innerHTML = '<i class="bi bi-trash"></i> DELETE';
    gmLoadList();
  });
}

// ── Search Strip Toggle ───────────────────────────────────
function gmToggleSearch() {
  const strip = document.getElementById('gm-search-strip');
  if (strip) {
    strip.remove();
    gmRenderList();
  } else {
    const panel    = document.getElementById('gm-panel');
    const cmdStrip = document.getElementById('gm-cmd-strip');
    const div      = document.createElement('div');
    div.id         = 'gm-search-strip';
    div.className  = 'gm-search-strip';
    div.innerHTML  = `
      <label style="font-size:11px;font-weight:700;color:#334155;">SEARCH CODE / NAME:</label>
      <input type="text" class="gm-input" style="width:200px;" placeholder="Search group name/code..."
             oninput="gmRenderList()" id="gm-search-inp">
      <label style="font-size:11px;font-weight:700;color:#334155;margin-left:8px;">MAIN GROUP:</label>
      <select id="gm-filter-sel" class="gm-select" style="width:130px;" onchange="gmRenderList()">
        <option value="">All Types</option>
        <option value="3">Income</option>
        <option value="4">Expenditure</option>
        <option value="1">Asset</option>
        <option value="2">Liability</option>
      </select>
      <span style="font-size:11px;font-weight:700;color:#94a3b8;margin-left:auto;" id="gm-count-badge">
        ${gmList.length} Records
      </span>`;
    panel.insertBefore(div, cmdStrip.nextSibling);
    document.getElementById('gm-search-inp').focus();
    gmRenderList();
  }
}

// ── Print Register ────────────────────────────────────────
function gmPrint() {
  const w = window.open('', '_blank', 'width=800,height=600');
  let html = `<html><head><title>Group Master Register</title>
  <style>
    body { font-family: sans-serif; font-size:12px; margin:20px; color:#1e293b; }
    table { width:100%; border-collapse:collapse; margin-top:12px; }
    th { background:#1565C0; color:#fff; padding:6px 10px; text-align:left; font-size:10px; font-weight:bold; }
    td { padding:6px 10px; border-bottom:1px solid #e2e8f0; font-size:11px; }
    h2 { margin:0; color:#1565C0; font-size:16px; }
    p { margin:4px 0 12px; font-size:11px; color:#64748b; }
  </style></head><body>`;

  html += `<h2>GROUP MASTER REGISTER</h2><p>Active Society Ledger Classification. Printed: ${new Date().toLocaleString()}</p>`;
  html += `<table><thead><tr><th style="width:130px;">CODE</th><th>GROUP NAME</th><th>MAIN GROUP TYPE</th></tr></thead><tbody>`;

  gmList.forEach(g => {
    const mainLabel = mainGroupNames[g.grpMainId || g.GrpMainId] || '—';
    html += `<tr>
      <td><b>${g._code || g.grpCode || '—'}</b></td>
      <td><b>${g.grpName || g.GrpName || '—'}</b></td>
      <td>${mainLabel}</td>
    </tr>`;
  });

  html += `</tbody></table></body></html>`;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ── Export Excel ──────────────────────────────────────────
function gmExportExcel() {
  let csv = 'Code,Group Name,Main Group\n';
  gmList.forEach(g => {
    const mainLabel = mainGroupNames[g.grpMainId || g.GrpMainId] || '';
    csv += `"${g._code || g.grpCode || ''}","${g.grpName || g.GrpName || ''}","${mainLabel}"\n`;
  });
  const blob = new Blob([csv], { type: 'application/vnd.ms-excel' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'group-master.xls';
  a.click();
  gmAlert('Excel spreadsheet exported successfully.');
}

// ── Exit ──────────────────────────────────────────────────
function gmExit() {
  if (typeof WorkspaceManager !== 'undefined' && WorkspaceManager.closeTab) {
    WorkspaceManager.closeTab('group-master');
  }
}

// ── Keyboard Shortcuts ────────────────────────────────────
function gmSetupKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    const panel = document.getElementById('gm-panel');
    if (!panel || !panel.offsetParent) return;

    const isFormVisible = document.getElementById('gm-form-state').style.display === 'flex';
    if (isFormVisible) {
      if (e.key === 'Escape') gmShowList();
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); gmAdd(); }
    if (e.key === 'Delete' && gmSelectedId)        { e.preventDefault(); gmDelete(); }
    if (e.key === 'Enter' && gmSelectedId)         { e.preventDefault(); gmAlterById(gmSelectedId); }
    if (e.key === 'Escape') {
      gmMultiMode = false;
      gmChecked   = {};
      gmRenderList();
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!gmList.length) return;
      let idx = gmList.findIndex(g => (g.socGroupId || g.groupId || g.SocGroupId) === gmSelectedId);
      if (e.key === 'ArrowDown') idx = Math.min(idx + 1, gmList.length - 1);
      else idx = Math.max(idx - 1, 0);
      if (idx < 0) idx = 0;
      const target = gmList[idx];
      gmSelectRow(target.socGroupId || target.groupId || target.SocGroupId);

      const rows = document.querySelectorAll('#gm-tbody tr');
      if (rows[idx]) rows[idx].scrollIntoView({ block: 'nearest' });
    }
  });
}

// ── Alert Dialog ──────────────────────────────────────────
function gmAlert(msg, isError) {
  if (window.JeevikaDialog && window.JeevikaDialog.alert) {
    window.JeevikaDialog.alert(msg, isError ? 'Error' : 'Information');
    return;
  }
  const overlay = document.getElementById('gm-alert-overlay');
  const title   = document.getElementById('gm-alert-title');
  const icon    = document.getElementById('gm-alert-icon');
  const msgEl   = document.getElementById('gm-alert-msg');

  if (!overlay) { alert(msg); return; }

  if (isError) {
    title.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> ERROR';
    icon.className  = 'bi bi-exclamation-triangle-fill err';
  } else {
    title.innerHTML = '<i class="bi bi-info-circle-fill"></i> INFORMATION';
    icon.className  = 'bi bi-info-circle-fill';
  }
  msgEl.innerHTML       = msg;
  overlay.style.display = 'flex';
}

function gmCloseAlert() {
  const el = document.getElementById('gm-alert-overlay');
  if (el) el.style.display = 'none';
}

// ── Confirm Dialog ────────────────────────────────────────
function gmConfirm(msg, cb) {
  if (window.JeevikaDialog && window.JeevikaDialog.confirm) {
    window.JeevikaDialog.confirm(msg, null, 'Confirm').then(ok => { if (cb) cb(ok); });
    return;
  }
  const overlay = document.getElementById('gm-confirm-overlay');
  const msgEl   = document.getElementById('gm-confirm-msg');
  if (!overlay) { cb(confirm(msg)); return; }

  gmConfirmCb           = cb;
  msgEl.innerHTML       = msg;
  overlay.style.display = 'flex';

  document.getElementById('gm-confirm-yes').onclick = () => gmCloseConfirm(true);
}

function gmCloseConfirm(result) {
  const el = document.getElementById('gm-confirm-overlay');
  if (el) el.style.display = 'none';
  const cb = gmConfirmCb;
  gmConfirmCb = null;
  if (cb) cb(result);
}

// ── Utility Helpers ───────────────────────────────────────
function val(id)         { const el = document.getElementById(id); return el ? el.value || '' : ''; }
function setVal(id, v)   { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
function chk(id)         { const el = document.getElementById(id); return el ? el.checked : false; }
function setChk(id, v)   { 
  const el = document.getElementById(id); 
  if (el) {
    el.checked = !!v; 
    if (id === 'gm-subtotal') gmUpdateToggleStatus();
  }
}
function setText(id, t)  { const el = document.getElementById(id); if (el) el.textContent = t; }

// ── Modern Toggle Switch Status ───────────────────────────
function gmUpdateToggleStatus() {
  const el = document.getElementById('gm-subtotal');
  const badge = document.getElementById('gm-toggle-badge');
  if (!badge) return;
  if (el && el.checked) {
    badge.textContent = 'YES';
    badge.className = 'gm-toggle-badge active';
  } else {
    badge.textContent = 'NO';
    badge.className = 'gm-toggle-badge';
  }
}

// ── Linked Accounts Fetch & Render ────────────────────────
async function gmLoadAccounts() {
  try {
    const socId = gmGetActiveSocietyId();
    const url = socId > 0 ? `${gmApiBase()}/api/accounts?societyId=${socId}` : `${gmApiBase()}/api/accounts`;
    const res  = await fetch(url, { headers: getAuthHeaders() });
    const json = await res.json();
    if (res.ok && Array.isArray(json.data)) {
      gmAllAccounts = json.data;
      gmAccountsLoaded = true;
      if (gmActiveGroupId) {
        gmRenderLinkedAccounts(gmActiveGroupId);
      }
    }
  } catch (e) {
    console.warn('Accounts could not be loaded for Group Master:', e);
  }
}

async function gmRenderLinkedAccounts(groupId) {
  gmActiveGroupId = groupId;
  const container = document.getElementById('gm-accounts-container');
  const countBadge = document.getElementById('gm-acc-count');
  const searchInput = document.getElementById('gm-acc-search');
  if (searchInput) searchInput.value = '';

  if (!container) return;

  // New Group Mode
  if (!groupId) {
    if (countBadge) countBadge.textContent = '0 Accounts';
    container.innerHTML = `
      <div class="gm-acc-empty-state">
        <i class="bi bi-folder-plus" style="color:#0284c7;"></i>
        <h4>New Group Creation</h4>
        <p>Save this group first. Once created, accounts can be linked to this group in Account Master.</p>
      </div>`;
    return;
  }

  // If accounts haven't loaded yet, show loading indicator
  if (!gmAccountsLoaded) {
    container.innerHTML = `
      <div class="gm-acc-empty-state">
        <i class="bi bi-hourglass-split" style="color:#1565C0;"></i>
        <h4>Loading Accounts...</h4>
        <p>Fetching accounts under this group...</p>
      </div>`;
    await gmLoadAccounts();
  }

  const groupObj = gmList.find(x => (x.socGroupId || x.groupId || x.SocGroupId) === groupId);
  const targetName = (groupObj ? (groupObj.grpName || groupObj.GrpName || '') : '').trim().toLowerCase();

  gmCurrentLinkedAccounts = gmAllAccounts.filter(a => {
    const accGrpId = a.socSubGroupId || a.groupId || a.SocSubGroupId || a.GroupId;
    const accGrpName = (a.groupName || a.GroupName || '').trim().toLowerCase();
    if (accGrpId && Number(accGrpId) === Number(groupId)) return true;
    if (targetName && accGrpName && accGrpName === targetName) return true;
    return false;
  });

  // Sort by account code / name
  gmCurrentLinkedAccounts.sort((a, b) => {
    const codeA = (a.accCode || a.AccCode || '').toLowerCase();
    const codeB = (b.accCode || b.AccCode || '').toLowerCase();
    return codeA.localeCompare(codeB, undefined, { numeric: true });
  });

  gmRenderLinkedAccountsTable(gmCurrentLinkedAccounts);
}

function gmFilterLinkedAccounts() {
  const search = (val('gm-acc-search') || '').toLowerCase().trim();
  if (!search) {
    gmRenderLinkedAccountsTable(gmCurrentLinkedAccounts);
    return;
  }
  const filtered = gmCurrentLinkedAccounts.filter(a => {
    const code = (a.accCode || a.AccCode || '').toLowerCase();
    const name = (a.accName || a.AccName || '').toLowerCase();
    const bsName = (a.accBSName || a.AccBSName || '').toLowerCase();
    return code.includes(search) || name.includes(search) || bsName.includes(search);
  });
  gmRenderLinkedAccountsTable(filtered);
}

function gmRenderLinkedAccountsTable(list) {
  const container = document.getElementById('gm-accounts-container');
  const countBadge = document.getElementById('gm-acc-count');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${list.length} Account${list.length === 1 ? '' : 's'}`;
  }

  if (list.length === 0) {
    const isSearching = !!val('gm-acc-search');
    container.innerHTML = `
      <div class="gm-acc-empty-state">
        <i class="bi ${isSearching ? 'bi-search' : 'bi-folder-x'}"></i>
        <h4>${isSearching ? 'No Matching Accounts' : 'No Accounts Under This Group'}</h4>
        <p>${isSearching ? 'Try changing your search filter.' : 'There are currently no ledger accounts mapped under this group.'}</p>
      </div>`;
    return;
  }

  let totalBal = 0;
  let drCount = 0;
  let crCount = 0;

  const rows = list.map(a => {
    const code = a.accCode || a.AccCode || '—';
    const name = a.accName || a.AccName || 'Unnamed Account';
    const bsName = a.accBSName || a.AccBSName || '';
    const opBal = parseFloat(a.opBal ?? a.OpBal ?? 0) || 0;
    const dc = (a.opDrCr || a.OpDrCr || 'Dr').trim();
    const isDef = a.isDefault || a.IsDefault;

    totalBal += opBal;
    if (dc.toLowerCase() === 'cr') crCount++; else drCount++;

    const formattedBal = '₹ ' + opBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const badgeClass = dc.toLowerCase() === 'cr' ? 'gm-badge-cr' : 'gm-badge-dr';

    return `
      <tr>
        <td style="width:90px;"><span class="gm-acc-code-tag">${code}</span></td>
        <td>
          <div class="gm-acc-name-box">
            <span class="gm-acc-name-main">${name}${isDef ? '<span class="gm-badge-default-acc">DEFAULT</span>' : ''}</span>
            ${bsName && bsName !== name ? `<span class="gm-acc-name-sub">${bsName}</span>` : ''}
          </div>
        </td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;width:120px;">
          ${formattedBal}
        </td>
        <td style="text-align:center;width:60px;">
          <span class="${badgeClass}">${dc}</span>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="gm-acc-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Account / Ledger Name</th>
          <th style="text-align:right;">Opening Bal</th>
          <th style="text-align:center;">Type</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <div class="gm-acc-summary-bar">
      <span>Total: <b>${list.length}</b> (${drCount} Dr / ${crCount} Cr)</span>
      <span>Total Op. Bal: <b>₹ ${totalBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
    </div>
  `;
}

// Expose functions for inline HTML calls
window.gmAdd                  = gmAdd;
window.gmAlter                = gmAlter;
window.gmDelete               = gmDelete;
window.gmSave                 = gmSave;
window.gmShowList             = gmShowList;
window.gmToggleSearch         = gmToggleSearch;
window.gmToggleMultiDelete    = gmToggleMultiDelete;
window.gmToggleAll            = gmToggleAll;
window.gmChk                  = gmChk;
window.gmCloseAlert           = gmCloseAlert;
window.gmCloseConfirm         = gmCloseConfirm;
window.gmPrint                = gmPrint;
window.gmExportExcel          = gmExportExcel;
window.gmExit                 = gmExit;
window.gmRenderList           = gmRenderList;
window.gmSelectRow            = gmSelectRow;
window.gmAlterById            = gmAlterById;
window.gmUpdateToggleStatus   = gmUpdateToggleStatus;
window.gmFilterLinkedAccounts = gmFilterLinkedAccounts;
window.gmRenderLinkedAccounts = gmRenderLinkedAccounts;
window.gmOnMainGroupChange    = gmOnMainGroupChange;
window.gmFetchNextCode        = gmFetchNextCode;

// Module entry point for workspace.html
window.init_group_master = function() { 
  gmLoadList(); 
  gmLoadAccounts(); 
};
