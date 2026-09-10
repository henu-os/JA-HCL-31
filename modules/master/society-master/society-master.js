// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Society Master JS
// All data fetched from and saved to backend API only.
// Zero hardcoded data. API: /api/societies
// ═══════════════════════════════════════════════════════════

'use strict';

// ── State ────────────────────────────────────────────────
let smEditId = 0;
let smList = [];
let smConfirmCb = null;

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const socName = (typeof Auth !== 'undefined' && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName') || '—');
  const fyLabel = (typeof Auth !== 'undefined' && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '—');
  document.querySelectorAll('.sm-soc-span, .module-society').forEach(el => { el.textContent = socName; });
  document.querySelectorAll('.sm-fy-span, .module-year').forEach(el => { el.textContent = fyLabel; });

  smLoadList();
});

// ── API Base ─────────────────────────────────────────────
function smApiBase() {
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.AppConfig && window.AppConfig.apiBase) return window.AppConfig.apiBase;
  return 'http://localhost:5002';
}

// ── Load List ─────────────────────────────────────────────
async function smLoadList() {
  const tbody = document.getElementById('sm-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#808080;">
    <i class="bi bi-hourglass-split"></i> Loading...</td></tr>`;

  try {
    const res = await fetch(`${smApiBase()}/api/societies`);
    const json = await res.json();

    if (!res.ok) throw new Error(json.message || 'API error');

    smList = Array.isArray(json.data) ? json.data : [];
    smRenderList(smList);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#8B0000;">
      <i class="bi bi-exclamation-triangle"></i> Connection Error: ${e.message}</td></tr>`;
  }
}

// ── Render List ───────────────────────────────────────────
function smRenderList(list) {
  const tbody = document.getElementById('sm-tbody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#808080;">
      No societies found. Click ADD to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const id = s.societyId || s.SocietyId || 0;
    const code = s.societyCode || s.SocietyCode || '';
    const name = s.societyName || s.SocietyName || '';
    const regno = s.registrationNo || s.RegistrationNo || '';
    const city = s.city || s.City || '';
    const pan = s.panNumber || s.PANNumber || '—';
    const tan = s.tan || s.TAN || '—';
    const gst = s.gstNumber || s.GSTNumber || '—';
    const sel = smEditId === id ? 'selected' : '';

    return `<tr class="${sel}" onclick="smSelectRow(this, ${id})" style="cursor:pointer;">
      <td>${code}</td>
      <td style="font-weight:bold;">${name}</td>
      <td>${regno}</td>
      <td>${city}</td>
      <td>${pan} / ${tan}</td>
      <td>${gst}</td>
      <td>
        <button onclick="event.stopPropagation(); smOpenWorkspace('${code}','${name}')"
          class="sm-btn" style="font-size:10px;padding:1px 6px;">
          OPEN ➔
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ── Filter ────────────────────────────────────────────────
function smFilter(val) {
  const q = (val || '').toLowerCase().trim();
  const filtered = q
    ? smList.filter(s =>
      (s.societyCode || '').toLowerCase().includes(q) ||
      (s.societyName || '').toLowerCase().includes(q) ||
      (s.registrationNo || '').toLowerCase().includes(q))
    : smList;
  smRenderList(filtered);
}

// ── Select Row ────────────────────────────────────────────
function smSelectRow(row, id) {
  document.querySelectorAll('#sm-tbody tr').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  smEditId = id;
}

// ── Show / Hide States ────────────────────────────────────
function smShowList() {
  document.getElementById('sm-form-state').style.display = 'none';
  document.getElementById('sm-list-state').style.display = 'flex';

  show('sm-btn-add', 'sm-btn-alter', 'sm-btn-delete', 'sm-btn-print', 'sm-other-drop', 'sm-btn-search');
  hide('sm-btn-save', 'sm-btn-cancel');

  smRemoveSearchStrip();
  smFilter('');
}

function smShowForm() {
  document.getElementById('sm-list-state').style.display = 'none';
  document.getElementById('sm-form-state').style.display = 'flex';

  hide('sm-btn-add', 'sm-btn-alter', 'sm-btn-delete', 'sm-btn-print', 'sm-other-drop', 'sm-btn-search');
  show('sm-btn-save', 'sm-btn-cancel');
}

function show(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('sm-btn-hidden');
  });
}

function hide(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('sm-btn-hidden');
  });
}

// ── ADD ───────────────────────────────────────────────────
function smAdd() {
  smEditId = 0;
  smClearForm();
  smShowForm();
  document.getElementById('sm-code').focus();
}

// ── ALTER ─────────────────────────────────────────────────
function smAlter() {
  if (!smEditId) {
    smAlert('Select a society from the list first.', true);
    return;
  }
  const s = smList.find(x => (x.societyId || x.SocietyId) === smEditId);
  if (!s) { smAlert('Society not found.', true); return; }
  smFillForm(s);
  smShowForm();
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
function smDelete() {
  if (!smEditId) {
    smAlert('Select a society from the list first.', true);
    return;
  }
  smConfirm('Are you sure you want to delete this society?', async (ok) => {
    if (!ok) return;
    try {
      const res = await fetch(`${smApiBase()}/api/societies/${smEditId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (res.ok && json.success) {
        smAlert('Society deleted successfully.');
        smEditId = 0;
        smLoadList();
      } else {
        smAlert('Delete failed: ' + (json.message || 'Unknown'), true);
      }
    } catch (e) {
      smAlert('Error: ' + e.message, true);
    }
  });
}

// ── SAVE (Create or Update) ───────────────────────────────
async function smSave() {
  const code = (document.getElementById('sm-code').value || '').trim();
  const name = (document.getElementById('sm-name').value || '').trim();

  if (!code || !name) {
    smAlert('Society Code and Name are required.', true);
    return;
  }

  const gstOn = document.getElementById('sm-gst-toggle').checked;

  const payload = {
    SocietyCode: code,
    SocietyName: name,
    StartingYear: val('sm-startyear'),
    RegistrationNo: val('sm-regno'),
    Address: val('sm-addr'),
    Email: val('sm-email'),
    PANNumber: val('sm-pan'),
    TAN: val('sm-tan'),
    PTNo: val('sm-ptno'),
    UIDNumber: val('sm-uid'),
    AreaType: val('sm-areatype'),
    AreaCategory: val('sm-areacat'),
    AreaUnit: val('sm-areaunit') || 'Sq.Ft',
    GSTApplicable: gstOn,
    GSTNumber: val('sm-gstin'),
    HSNCode: val('sm-hsn'),
    CGSTCode: val('sm-cgstcode'),
    SGSTCode: val('sm-sgstcode'),
    CGSTPct: parseFloat(val('sm-cgstpct') || '9'),
    SGSTPct: parseFloat(val('sm-sgstpct') || '9'),
    IntDuesGST: val('sm-intdues') || 'No',
    ExemptLimit: parseFloat(val('sm-exemptlimit') || '7500'),
    ExemptAmount: parseFloat(val('sm-exemptamt') || '7500'),
    ContactName1: val('sm-cn1'),
    ContactPhone1: val('sm-cp1'),
    ContactEmail1: val('sm-ce1'),
    ContactName2: val('sm-cn2'),
    ContactPhone2: val('sm-cp2'),
    ContactEmail2: val('sm-ce2'),
    CommWhatsApp: chk('sm-cwa') ? 'Y' : 'N',
    CommSMS: chk('sm-csms') ? 'Y' : 'N',
    CommRCS: chk('sm-crcs') ? 'Y' : 'N',
    CommEmail: chk('sm-cemail') ? 'Y' : 'N',
    CommNotification: chk('sm-cnotif') ? 'Y' : 'N'
  };

  const url = smEditId ? `${smApiBase()}/api/societies/${smEditId}` : `${smApiBase()}/api/societies`;
  const method = smEditId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    if (res.ok && json.success) {
      smAlert('Society saved successfully!');

      if (json.activeFY && json.activeFY.fYLabel) {
        sessionStorage.setItem('activeFYId', String(json.activeFY.fYId || '1'));
        sessionStorage.setItem('activeFYLabel', json.activeFY.fYLabel);
        localStorage.setItem('activeFYId', String(json.activeFY.fYId || '1'));
        localStorage.setItem('activeFYLabel', json.activeFY.fYLabel);

        if (typeof WorkspaceBridge !== 'undefined' && WorkspaceBridge.setActiveFY) {
          WorkspaceBridge.setActiveFY(json.activeFY.fYId, json.activeFY.fYLabel, json.activeFY.fYStart, json.activeFY.fYEnd);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'JEEVIKA_WORKSPACE_CMD',
            action: 'setActiveFY',
            payload: json.activeFY
          }, '*');
        }
      }

      const currentCode = localStorage.getItem('activeSocietyCode') || sessionStorage.getItem('activeSocietyCode');
      if (payload.SocietyCode === currentCode || payload.societyCode === currentCode) {
        localStorage.setItem('activeSocietyGSTApplicable', gstOn ? 'Y' : 'N');
        sessionStorage.setItem('activeSocietyGSTApplicable', gstOn ? 'Y' : 'N');
        if (typeof WorkspaceBridge !== 'undefined') {
          WorkspaceBridge.updateGstMenuVisibility();
        }
      }

      smShowList();
      smLoadList();
    } else {
      smAlert('Error: ' + (json.message || 'Unknown'), true);
    }
  } catch (e) {
    smAlert('Error saving: ' + e.message, true);
  }
}

// ── Fill form from API data ───────────────────────────────
function smFillForm(s) {
  set('sm-startyear', s.startingYear || s.StartingYear || '');
  set('sm-code', s.societyCode || s.SocietyCode || '');
  set('sm-name', s.societyName || s.SocietyName || '');
  set('sm-regno', s.registrationNo || s.RegistrationNo || '');
  set('sm-addr', s.address || s.Address || '');
  set('sm-email', s.email || s.Email || '');
  set('sm-pan', s.panNumber || s.PANNumber || '');
  set('sm-tan', s.tan || s.TAN || '');
  set('sm-ptno', s.ptNo || s.PTNo || '');
  set('sm-uid', s.uidNumber || s.UIDNumber || '');
  set('sm-areatype', s.areaType || s.AreaType || '');
  set('sm-areacat', s.areaCategory || s.AreaCategory || '');
  set('sm-areaunit', s.areaUnit || s.AreaUnit || 'Sq.Ft');

  const gstOn = !!(s.gstApplicable || s.GSTApplicable);
  document.getElementById('sm-gst-toggle').checked = gstOn;
  smToggleGST();

  set('sm-gstin', s.gstNumber || s.GSTNumber || '');
  set('sm-hsn', s.hsnCode || s.HSNCode || '');
  set('sm-cgstcode', s.cgstCode || s.CGSTCode || '');
  set('sm-sgstcode', s.sgstCode || s.SGSTCode || '');
  set('sm-cgstpct', s.cgstPct !== undefined ? s.cgstPct : 9);
  set('sm-sgstpct', s.sgstPct !== undefined ? s.sgstPct : 9);
  set('sm-intdues', s.intDuesGST || s.IntDuesGST || 'No');
  set('sm-exemptlimit', s.exemptLimit || s.ExemptLimit || 7500);
  set('sm-exemptamt', s.exemptAmount || s.ExemptAmount || 7500);

  set('sm-cn1', s.contactName1 || s.ContactName1 || '');
  set('sm-cp1', s.contactPhone1 || s.ContactPhone1 || '');
  set('sm-ce1', s.contactEmail1 || s.ContactEmail1 || '');
  set('sm-cn2', s.contactName2 || s.ContactName2 || '');
  set('sm-cp2', s.contactPhone2 || s.ContactPhone2 || '');
  set('sm-ce2', s.contactEmail2 || s.ContactEmail2 || '');

  setChk('sm-cwa', (s.commWhatsApp || s.CommWhatsApp) === 'Y');
  setChk('sm-csms', (s.commSMS || s.CommSMS) === 'Y');
  setChk('sm-crcs', (s.commRCS || s.CommRCS) === 'Y');
  setChk('sm-cemail', (s.commEmail || s.CommEmail) === 'Y');
  setChk('sm-cnotif', (s.commNotification || s.CommNotification) === 'Y');
}

// ── Clear Form ────────────────────────────────────────────
function smClearForm() {
  document.querySelectorAll('#sm-form-state input[type=text]').forEach(el => el.value = '');
  document.querySelectorAll('#sm-form-state input[type=email]').forEach(el => el.value = '');
  document.querySelectorAll('#sm-form-state input[type=tel]').forEach(el => el.value = '');
  document.querySelectorAll('#sm-form-state input[type=number]').forEach(el => el.value = '');
  document.querySelectorAll('#sm-form-state input[type=checkbox]').forEach(el => el.checked = false);
  document.querySelectorAll('#sm-form-state select').forEach(el => el.selectedIndex = 0);

  set('sm-areaunit', 'Sq.Ft');
  set('sm-cgstpct', '9');
  set('sm-sgstpct', '9');
  set('sm-exemptlimit', '7500');
  set('sm-exemptamt', '7500');
  set('sm-intdues', 'No');

  document.getElementById('sm-gst-toggle').checked = false;
  smToggleGST();
}

// ── GST Toggle ────────────────────────────────────────────
function smToggleGST() {
  const tog = document.getElementById('sm-gst-toggle');
  const track = document.getElementById('sm-gst-track');
  const thumb = document.getElementById('sm-gst-thumb');
  const status = document.getElementById('sm-gst-status');
  const fields = document.getElementById('sm-gst-fields');

  if (tog.checked) {
    if (track) track.style.background = '#000080';
    if (thumb) thumb.style.transform = 'translateX(20px)';
    if (status) { status.textContent = 'ON'; status.style.color = '#000080'; }
    if (fields) fields.style.display = 'flex';
  } else {
    if (track) track.style.background = '#999';
    if (thumb) thumb.style.transform = 'translateX(0)';
    if (status) { status.textContent = 'OFF'; status.style.color = '#808080'; }
    if (fields) fields.style.display = 'none';
  }
}

// ── Search Strip ──────────────────────────────────────────
function smToggleSearch() {
  const strip = document.getElementById('sm-search-strip');
  if (strip) {
    strip.remove();
  } else {
    const panel = document.getElementById('sm-panel');
    const cmdStrip = document.getElementById('sm-cmd-strip');
    const div = document.createElement('div');
    div.id = 'sm-search-strip';
    div.className = 'sm-search-strip';
    div.innerHTML = `
      <label style="font-size:11px;font-weight:bold;">Search Code/Name:</label>
      <input type="text" class="sm-input" style="width:220px;" placeholder="Search society..."
             oninput="smFilter(this.value)" id="sm-search-inp">
      <span style="font-size:11px;font-weight:bold;color:#808080;margin-left:auto;"
            id="sm-count-badge">${smList.length} Registered</span>`;
    panel.insertBefore(div, cmdStrip.nextSibling);
    document.getElementById('sm-search-inp').focus();
  }
}

function smRemoveSearchStrip() {
  const strip = document.getElementById('sm-search-strip');
  if (strip) strip.remove();
}

// ── Open Workspace ────────────────────────────────────────
function smOpenWorkspace(code, name) {
  const current = localStorage.getItem('activeSocietyCode') || '';
  const s = smList.find(x => (x.societyCode || x.SocietyCode) === code);
  const gstOn = s ? (
    s.gstApplicable === true || s.GSTApplicable === true ||
    s.gstApplicable === 'Y' || s.GSTApplicable === 'Y' ||
    s.gstApplicable === 'Yes' || s.GSTApplicable === 'Yes' ||
    (s.gstNumber && String(s.gstNumber).trim().length > 0) ||
    (s.GSTNumber && String(s.GSTNumber).trim().length > 0)
  ) : false;

  const doSwitch = () => {
    localStorage.setItem('activeSocietyCode', code);
    localStorage.setItem('activeSocietyName', name);
    localStorage.setItem('activeSocietyGSTApplicable', gstOn ? 'Y' : 'N');
    sessionStorage.setItem('activeSocietyCode', code);
    sessionStorage.setItem('activeSocietyName', name);
    sessionStorage.setItem('activeSocietyGSTApplicable', gstOn ? 'Y' : 'N');

    const socId = (s && (s.societyId || s.SocietyId)) ? (s.societyId || s.SocietyId).toString() : '';
    if (socId) {
      localStorage.setItem('activeSocietyId', socId);
      sessionStorage.setItem('activeSocietyId', socId);
    }

    if (typeof WorkspaceBridge !== 'undefined') {
      WorkspaceBridge.setActiveSociety(socId ? parseInt(socId, 10) : null, code, name, gstOn);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'JEEVIKA_WORKSPACE_CMD',
        action: 'setActiveSociety',
        payload: { societyId: socId ? parseInt(socId, 10) : null, code: code, name: name, gstOn: gstOn }
      }, '*');
    }

    const socSpan = document.querySelector('.sm-soc-span');
    if (socSpan) socSpan.textContent = `${name} (${code})`;

    smAlert(`Switched active workspace to: <b>${name}</b>`);
  };

  if (code !== current) {
    smConfirm(`Switch active workspace to <b>${name}</b>?`, ok => { if (ok) doSwitch(); });
  } else {
    smAlert(`Already in workspace: ${name}`);
  }
}

// ── Import / Export ───────────────────────────────────────
function smImportExcel() {
  smAlert('Excel import coming soon.', false);
}

function smExportExcel() {
  smAlert('Excel export coming soon.', false);
}

// ── Exit ──────────────────────────────────────────────────
function smExit() {
  if (typeof WorkspaceManager !== 'undefined' && WorkspaceManager.closeTab) {
    WorkspaceManager.closeTab('society-master');
  }
}

// ── Alert Dialog ──────────────────────────────────────────
function smAlert(msg, isError) {
  if (window.JeevikaDialog && window.JeevikaDialog.alert) {
    window.JeevikaDialog.alert(msg, isError ? 'Error' : 'Information');
    return;
  }
  const overlay = document.getElementById('sm-alert-overlay');
  const title = document.getElementById('sm-alert-title');
  const icon = document.getElementById('sm-alert-icon');
  const msgEl = document.getElementById('sm-alert-msg');

  if (!overlay) { alert(msg); return; }

  if (isError) {
    title.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> ERROR';
    icon.className = 'bi bi-exclamation-triangle-fill err';
  } else {
    title.innerHTML = '<i class="bi bi-info-circle-fill"></i> INFORMATION';
    icon.className = 'bi bi-info-circle-fill';
  }
  msgEl.textContent = msg;
  overlay.style.display = 'flex';
}

function smCloseAlert() {
  const el = document.getElementById('sm-alert-overlay');
  if (el) el.style.display = 'none';
}

// ── Confirm Dialog ────────────────────────────────────────
function smConfirm(msg, cb) {
  if (window.JeevikaDialog && window.JeevikaDialog.confirm) {
    window.JeevikaDialog.confirm(msg, null, 'Confirm').then(ok => { if (cb) cb(ok); });
    return;
  }
  const overlay = document.getElementById('sm-confirm-overlay');
  const msgEl = document.getElementById('sm-confirm-msg');
  if (!overlay) { cb(confirm(msg)); return; }

  smConfirmCb = cb;
  msgEl.innerHTML = msg;
  overlay.style.display = 'flex';

  document.getElementById('sm-confirm-yes').onclick = () => smCloseConfirm(true);
}

function smCloseConfirm(result) {
  const el = document.getElementById('sm-confirm-overlay');
  if (el) el.style.display = 'none';
  const cb = smConfirmCb;
  smConfirmCb = null;
  if (cb) cb(result);
}

// ── Utility helpers ───────────────────────────────────────
function val(id) { const el = document.getElementById(id); return el ? el.value || '' : ''; }
function set(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
function chk(id) { const el = document.getElementById(id); return el ? el.checked : false; }
function setChk(id, v) { const el = document.getElementById(id); if (el) el.checked = !!v; }

// ── Expose globals for workspace.html inline calls ────────
window.smAdd = smAdd;
window.smAlter = smAlter;
window.smDelete = smDelete;
window.smSave = smSave;
window.smShowList = smShowList;
window.smToggleSearch = smToggleSearch;
window.smToggleGST = smToggleGST;
window.smCloseAlert = smCloseAlert;
window.smCloseConfirm = smCloseConfirm;
window.smOpenWorkspace = smOpenWorkspace;
window.smFilter = smFilter;
window.smImportExcel = smImportExcel;
window.smExportExcel = smExportExcel;
window.smExit = smExit;

// Entry point called by workspace.html when module is loaded
window.init_society_master = function () { smLoadList(); };
