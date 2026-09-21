// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Member Master JS
// Real-time backend API sync: /api/members
// Controls 6 tabs on ADD, 8 tabs on ALTER, Member Transfer toggle,
// Transferee execution, NOC tenant management, Parking totals,
// Share Certificate calculations, and Nominee database setup.
// ═══════════════════════════════════════════════════════════

'use strict';

let mmList = [];
let mmSelectedId = 0;
let mmChecked = {};
let mmMultiMode = false;
let mmConfirmCb = null;
let mmActiveTab = 0;
let mmEditId = 0;

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  mmInitWorkspaceLabel();
  mmLoadCustomTypes();
  await mmLoadList();
  await mmLoadBillTypes();
  mmSetupKeyboardNav();

  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action') || urlParams.get('mode');
  let alterId = urlParams.get('id') || urlParams.get('memberId');
  let alterCode = urlParams.get('code') || urlParams.get('memCode') || urlParams.get('flatNo');
  let alterName = urlParams.get('name') || urlParams.get('memName');

  const pendingRaw = sessionStorage.getItem('jeevika_member_master_pending_alter');
  if (pendingRaw) {
    sessionStorage.removeItem('jeevika_member_master_pending_alter');
    try {
      const parsed = JSON.parse(pendingRaw);
      if (parsed && typeof parsed === 'object') {
        alterId = alterId || parsed.id;
        alterCode = alterCode || parsed.code || parsed.flatNo;
        alterName = alterName || parsed.name;
      } else {
        alterId = alterId || pendingRaw;
      }
    } catch (e) {
      alterId = alterId || pendingRaw;
    }
  }

  if (action === 'add') {
    setTimeout(mmAdd, 300);
  } else if (action === 'alter' || action === 'edit' || alterId || alterCode) {
    setTimeout(() => {
      mmAlterById(alterId, alterCode, alterName);
    }, 350);
  }
});

window.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.action === 'add' || e.data === 'addMember') {
    mmAdd();
  } else if (e.data.action === 'alter' || e.data.action === 'edit') {
    mmAlterById(e.data.id || e.data.memberId, e.data.code || e.data.memCode || e.data.flatNo, e.data.name || e.data.memName);
  }
});

function mmApiBase() {
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.AppConfig && window.AppConfig.apiBase) return window.AppConfig.apiBase;
  return 'http://localhost:5002';
}

let mmLastBillType = 'Maintenance';
let mmOpBalStore = {};

function mmOnBillTypeChange() {
  const selectEl = document.getElementById('mm-opbal-billtype');
  if (!selectEl) return;
  const newType = selectEl.value;

  // Save current values to store for mmLastBillType
  const curPrin = parseFloat(val('mm-opbal-principal')) || 0;
  const curInt = parseFloat(val('mm-opbal-interest')) || 0;
  mmOpBalStore[mmLastBillType] = { principal: curPrin, interest: curInt };

  // Load new values for newType
  const newBal = mmOpBalStore[newType] || { principal: 0, interest: 0 };
  const prinVal = newBal.principal !== undefined ? newBal.principal : (newBal.Principal !== undefined ? newBal.Principal : 0);
  const intVal = newBal.interest !== undefined ? newBal.interest : (newBal.Interest !== undefined ? newBal.Interest : 0);
  setVal('mm-opbal-principal', (parseFloat(prinVal) || 0).toFixed(2));
  setVal('mm-opbal-interest', (parseFloat(intVal) || 0).toFixed(2));
  mmCalcTotalBal();

  mmLastBillType = newType;
}

async function mmLoadBillTypes() {
  const selectEl = document.getElementById('mm-opbal-billtype');
  if (!selectEl) return;
  const socId = mmGetActiveSocietyId();
  let types = [];

  // 1. Check LocalStorage bill types (instant sync with Bill Type & Notes Master)
  try {
    const localKey = 'jeevika_bill_types_' + socId;
    let localRaw = localStorage.getItem(localKey) || localStorage.getItem('jeevika_bill_types_global');
    if (!localRaw) {
      for (let k in localStorage) {
        if (k.indexOf('jeevika_bill_types_') === 0 && k !== 'jeevika_bill_types_sync_ts') {
          localRaw = localStorage.getItem(k);
          if (localRaw) break;
        }
      }
    }
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(name => {
          const cleanName = (name || '').trim();
          if (cleanName && !types.includes(cleanName)) {
            types.push(cleanName);
          }
        });
      }
    }
  } catch (e) {
    console.warn('Local bill types load error', e);
  }

  // 2. Query API /api/bill-types
  try {
    const url = socId > 0 ? `${mmApiBase()}/api/bill-types?societyId=${socId}` : `${mmApiBase()}/api/bill-types`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
        json.data.forEach(b => {
          const name = (b.billTypeName || b.BillTypeName || '').trim();
          if (name && !types.includes(name)) {
            types.push(name);
          }
        });
      }
    }
  } catch (e) {
    console.warn('Failed to load bill types for member master', e);
  }

  if (types.length === 0) {
    types = ['Maintenance'];
  }

  selectEl.innerHTML = types.map(t => `<option value="${t}">${t}</option>`).join('');
  if (mmLastBillType && types.includes(mmLastBillType)) {
    selectEl.value = mmLastBillType;
  } else {
    selectEl.value = types[0];
    mmLastBillType = types[0];
  }
}

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = (typeof Auth !== 'undefined' && Auth.getToken)
    ? Auth.getToken()
    : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

function mmGetActiveSocietyCode() {
  return localStorage.getItem('activeSocietyCode') || sessionStorage.getItem('activeSocietyCode') || '';
}

function mmInitWorkspaceLabel() {
  const socCode = mmGetActiveSocietyCode();
  const socName = localStorage.getItem('activeSocietyName') || sessionStorage.getItem('activeSocietyName') || 'Sai Ram Society';
  const socSpan = document.querySelector('.mm-soc-span');
  const fySpan = document.querySelector('.mm-fy-span');
  if (socSpan) socSpan.textContent = socName ? `${socName} (${socCode || 'SRS001'})` : '—';
  if (fySpan) fySpan.textContent = '2025-26';
}

function mmGetActiveSocietyId() {
  if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
    const s = window.Auth.getSocietyId();
    if (s && !isNaN(parseInt(s, 10)) && parseInt(s, 10) > 0) return parseInt(s, 10);
  }
  const raw = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || sessionStorage.getItem('activeSocietyCode') || localStorage.getItem('activeSocietyCode') || '';
  const num = parseInt(raw, 10);
  if (!isNaN(num) && num > 0) return num;
  const rawUpper = String(raw).toUpperCase().trim();
  if (rawUpper.includes('SRS') || rawUpper.includes('SAI')) return 2;
  if (rawUpper.includes('GDS') || rawUpper.includes('GOKUL')) return 1;
  return 1;
}

// ── Load Members List ─────────────────────────────────────
async function mmLoadList() {
  const tbody = document.getElementById('mm-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#808080;">
    <i class="bi bi-hourglass-split"></i> Loading members...</td></tr>`;

  try {
    const socId = mmGetActiveSocietyId();
    const url = socId > 0 ? `${mmApiBase()}/api/members?societyId=${socId}` : `${mmApiBase()}/api/members`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    const json = await res.json();

    if (!res.ok) throw new Error(json.message || 'API error');

    mmList = Array.isArray(json.data) ? json.data : [];

    mmRenderList();

    if (mmList.length > 0 && !mmSelectedId) {
      mmSelectRow(mmList[0].socMemId || mmList[0].memberId);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#dc2626;">
      <i class="bi bi-exclamation-triangle"></i> Connection Error: ${e.message}</td></tr>`;
  }
}

// ── Render Members List ───────────────────────────────────
function mmRenderList() {
  const tbody = document.getElementById('mm-tbody');
  const searchInp = document.getElementById('mm-search-inp');
  const chkAll = document.getElementById('mm-chk-all');

  if (!tbody) return;

  const search = (searchInp ? searchInp.value : '').toLowerCase().trim();

  const filtered = mmList.filter(m => {
    if (!search) return true;
    const code = (m.memCode || m.MemCode || '').toLowerCase();
    const name = (m.memName || m.MemName || '').toLowerCase();
    const flat = (m.flatNo || m.FlatNo || '').toLowerCase();
    const wing = (m.wing || m.Wing || '').toLowerCase();
    const bldg = (m.building || m.Building || '').toLowerCase();
    const mob = (m.contactNo || m.memMobile || '').toLowerCase();
    return code.includes(search) || name.includes(search) || flat.includes(search) ||
      wing.includes(search) || bldg.includes(search) || mob.includes(search);
  });

  if (chkAll) chkAll.style.display = mmMultiMode ? 'inline-block' : 'none';

  const badge = document.getElementById('mm-count-badge');
  if (badge) badge.textContent = `${filtered.length} Records`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#808080;">
      No matching members found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const id = m.socMemId || m.memberId || m.MemberId;
    const code = m.memCode || m.MemCode || '';
    const name = m.memName || m.MemName || '';
    const flat = m.flatNo || m.FlatNo || '—';
    const wing = m.wing || m.Wing || '—';
    const bldg = m.building || m.Building || '—';
    const type = m.flatType || m.FlatType || '—';
    const area = m.areaSqft || m.sqft || 0;
    const mobile = m.contactNo || m.memMobile || '—';
    const email = m.email || m.memEmail || '—';
    const sel = id === mmSelectedId ? 'class="selected"' : '';
    const isChecked = mmChecked[id] ? 'checked' : '';

    return `<tr ${sel} onclick="mmSelectRow(${id})" ondblclick="mmAlterById(${id})">
      <td style="text-align:center;">
        ${mmMultiMode ? `<input type="checkbox" ${isChecked} onclick="event.stopPropagation();mmChk(${id}, this.checked)" style="accent-color:#1565C0;">` : ''}
      </td>
      <td style="font-weight:700; text-align:center;">${code}</td>
      <td style="font-weight:700; text-align:center;">${flat}</td>
      <td style="text-align:center;">${wing}</td>
      <td>${bldg}</td>
      <td>${type}</td>
      <td style="font-weight:700;">${name}</td>
      <td>${area}</td>
      <td>${mobile}</td>
      <td>${email}</td>
    </tr>`;
  }).join('');
}

// ── Select Row ────────────────────────────────────────────
function mmSelectRow(id) {
  mmSelectedId = id;
  const rows = document.querySelectorAll('#mm-tbody tr');
  rows.forEach(r => r.classList.remove('selected'));

  const m = mmList.find(x => (x.socMemId || x.memberId || x.MemberId) === id);
  if (m) {
    const isSaveVisible = document.getElementById('mm-btn-save').classList.contains('mm-btn-hidden') === false;
    if (!isSaveVisible) {
      setVal('mm-edit-id', id);
      setVal('mm-code', m.memCode || m.MemCode || '');
      setVal('mm-name1', m.memName || m.MemName || '');
      setVal('mm-name2', m.memName2 || m.MemName2 || '');
      setVal('mm-name3', m.memName3 || m.MemName3 || '');
      setVal('mm-name4', m.memName4 || m.MemName4 || '');
      setVal('mm-name5', m.memName5 || m.MemName5 || '');
      setVal('mm-name6', m.memName6 || m.MemName6 || '');

      setVal('mm-unittype', m.unitType || m.UnitType || '');
      setVal('mm-flatno', m.flatNo || m.FlatNo || '');
      setVal('mm-wing', m.wing || m.Wing || '');
      setVal('mm-floor', m.floor || m.Floor || '');
      setVal('mm-flattype', m.flatType || m.FlatType || '');
      setVal('mm-bldg', m.building || m.Building || '');
      setVal('mm-gstin', m.gstin || '');
      setVal('mm-panno', m.panNo || m.PANNo || '');
      setVal('mm-areavalue', (m.areaSqft !== undefined && m.areaSqft !== null && m.areaSqft !== '') ? m.areaSqft : (m.sqft !== undefined && m.sqft !== null && m.sqft !== '' ? m.sqft : (m.AreaSqft !== undefined && m.AreaSqft !== null && m.AreaSqft !== '' ? m.AreaSqft : '')));

      if (m.opBalances && typeof m.opBalances === 'object' && Object.keys(m.opBalances).length > 0) {
        mmOpBalStore = JSON.parse(JSON.stringify(m.opBalances));
      } else {
        mmOpBalStore = {};
        const p0 = parseFloat(m.opPrincipal || m.OpPrincipal || 0) || 0;
        const i0 = parseFloat(m.opInterest || m.OpInterest || 0) || 0;
        mmOpBalStore['Maintenance'] = { principal: p0, interest: i0 };
      }
      const bSelectRow = document.getElementById('mm-opbal-billtype');
      const selTypeRow = bSelectRow ? bSelectRow.value : 'Maintenance';
      mmLastBillType = selTypeRow;
      const selBalRow = mmOpBalStore[selTypeRow] || (selTypeRow === 'Maintenance' ? { principal: m.opPrincipal || 0, interest: m.opInterest || 0 } : { principal: 0, interest: 0 });
      const selPRow = selBalRow.principal !== undefined ? selBalRow.principal : (selBalRow.Principal || 0);
      const selIRow = selBalRow.interest !== undefined ? selBalRow.interest : (selBalRow.Interest || 0);
      setVal('mm-opbal-principal', (parseFloat(selPRow) || 0).toFixed(2));
      setVal('mm-opbal-interest', (parseFloat(selIRow) || 0).toFixed(2));
      mmCalcTotalBal();

      // Non Occ
      const isOcc = m.nonOccApplicable === 'Yes';
      mmSetNocStatus(isOcc);
      setVal('mm-nonocc-charges', m.nonOccCharges || 0);
      setVal('mm-tenant-name', m.tenantName || '');
      setVal('mm-tenant-contact', m.tenantContact || '');

      // Parking
      setVal('mm-park4-stilt', m.parkingSlot4W || '1');
      setVal('mm-park4-stilt-reg', m.vehicleNo4W || 'MH-12-QR-3456');

      // Share Cert
      setVal('mm-sc-certno', m.shareCertNo || 'SC-701');
      setVal('mm-sc-memno', m.folioNo ? `M-${m.folioNo}` : 'M-701');
      setVal('mm-sc-numshares', m.shares || 10);
      mmCalcShareCertValues();

      // Lien
      setVal('mm-lien-status', m.lienStatus || 'None');
      setVal('mm-lien-bank-name', m.lienBankName || '');
      setVal('mm-lien-amt-val', m.lienAmount || 0);

      // Nominee
      setVal('mm-nominee-name', m.nomineeName || '');
      setVal('mm-nominee-relation', m.nomineeRelation || '');
      setVal('mm-nominee-pct', m.nomineeSharePct || 100);

      // MEMBER KYC & VERIFICATION
      setVal('mm-agreement-date', m.agreementDate || '');
      setVal('mm-registration-date', m.registrationDate || '');
      setVal('mm-stamp-date', m.stampDate || '');
      setVal('mm-agreement-reg-no', m.agreementRegNo || '');
      setVal('mm-agreement-value', m.agreementValue || 0);
      setVal('mm-stamp-value', m.stampValue || 0);
      setVal('mm-reg-fees', m.registrationFees || 0);

      // Transfer action toggle defaults to 'No' (OFF) for normal member viewing/editing
      setVal('mm-transfer-toggle', 'No');
      mmOnTransferToggleChange('No');
      setVal('mm-transfer-is', m.isTransferred || 'No');

      disableFormInputs(true);
    }
  }
  mmRenderList();
}

function mmCalcTotalBal() {
  const p = parseFloat(val('mm-opbal-principal')) || 0;
  const i = parseFloat(val('mm-opbal-interest')) || 0;
  setVal('mm-total-bal', (p + i).toFixed(2));
}


// ── Share Certificate Calculations ───────────────────────
function mmCalcShareCertValues() {
  const count = parseFloat(val('mm-sc-numshares')) || 0;
  const valE = parseFloat(val('mm-sc-valeach')) || 100;
  setVal('mm-sc-totalval', count * valE);
}

// ── Nominee Table Row Addition ───────────────────────────
let mmNomRowIdx = 2;
function mmAddActiveNomineeRow() {
  const tbody = document.getElementById('mm-active-nominees-tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="text-align:center;font-weight:bold;">${mmNomRowIdx++}</td>
    <td><input type="text" class="mm-input" style="width:100%;" placeholder="Name of Nominee..."></td>
    <td><input type="text" class="mm-input" style="width:100%;" placeholder="Relationship..."></td>
    <td><input type="number" class="mm-input" style="width:100%;text-align:right;" value="0"></td>
    <td><input type="date" class="mm-input" style="width:100%;"></td>
    <td>
      <select class="mm-select" style="width:100%;">
        <option value="Major">Major</option>
        <option value="Minor">Minor</option>
      </select>
    </td>
    <td style="text-align:center;">
      <button type="button" class="mm-btn mm-btn-danger" style="height:22px;padding:0 6px;" onclick="this.closest('tr').remove()"><i class="bi bi-trash"></i></button>
    </td>
  `;
  tbody.appendChild(tr);
}

// ── Member Transfer Toggle Change ─────────────────────────
function mmOnTransferToggleChange(val) {
  const drawer = document.getElementById('mm-transfer-drawer');
  if (drawer) {
    drawer.style.display = val === 'Yes' ? 'block' : 'none';
  }
}


// ── Additional Info Toggle ────────────────────────────────
function mmToggleAdditionalInfo() {
  const body = document.getElementById('mm-additional-body');
  const btn = document.getElementById('mm-additional-toggle-btn');
  if (!body) return;
  const isOpen = body.style.display === 'flex';
  body.style.display = isOpen ? 'none' : 'flex';
  if (btn) btn.innerHTML = isOpen ? '<i class="bi bi-chevron-down"></i>' : '<i class="bi bi-chevron-up"></i>';
}

let mmAddCounter = 3;
function mmAddAdditionalRow() {
  const body = document.getElementById('mm-additional-body');
  const btn = document.getElementById('mm-additional-toggle-btn');
  if (body) {
    body.style.display = 'flex';
    if (btn) btn.innerHTML = '<i class="bi bi-chevron-up"></i>';
  }

  const container = document.getElementById('mm-dynamic-additional-rows');
  if (!container) return;

  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:140px 90px 1fr 90px 1fr 80px 1fr 30px;gap:6px;align-items:center;border-bottom:1px dashed #cbd5e1;padding-bottom:6px;';
  div.innerHTML = `
    <span style="font-weight:bold;color:#1565C0;">${mmAddCounter++}. Custom Detail</span>
    <label style="text-align:right;">Provider</label>
    <input type="text" class="mm-input" placeholder="Service provider">
    <label style="text-align:right;">Account No.</label>
    <input type="text" class="mm-input" placeholder="Account No.">
    <label style="text-align:right;">Ref ID</label>
    <input type="text" class="mm-input" placeholder="Reference ID">
    <button type="button" class="mm-btn mm-btn-danger" style="height:22px;padding:0 6px;" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(div);
}

// ── Document File Handle ──────────────────────────────────
function mmHandleDocFile(input, previewBoxId) {
  const box = document.getElementById(previewBoxId);
  if (!box || !input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      box.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width:100%;max-height:100%;object-fit:contain;">`;
    };
    reader.readAsDataURL(file);
  } else {
    box.innerHTML = `<div style="text-align:center;padding:10px;"><i class="bi bi-file-earmark-pdf-fill" style="font-size:24px;color:#dc2626;"></i><br><span style="font-size:10px;color:#334155;">${file.name}</span></div>`;
  }
}

// ── Tab Switcher ──────────────────────────────────────────
function mmSwitchTab(idx) {
  mmActiveTab = idx;
  const btns = document.querySelectorAll('.mm-tab-btn');
  const pages = document.querySelectorAll('.mm-tab-page');

  btns.forEach((b, i) => b.classList.toggle('active', i === idx));
  pages.forEach((p, i) => p.classList.toggle('active', i === idx));

  // Auto check NOC config when switching to Tab 2 (Non Occupancy Management)
  if (idx === 1) {
    if (typeof mmCheckNocConfiguredInBillTypes === 'function') {
      mmCheckNocConfiguredInBillTypes().then(res => {
        const nocCodeInput = document.getElementById('mm-noc-code');
        if (nocCodeInput) {
          if (res.configured && res.accCode) {
            nocCodeInput.value = res.accCode;
            nocCodeInput.title = `Mapped from ${res.billType}: ${res.accName}`;
          } else {
            nocCodeInput.value = 'Not Set';
            nocCodeInput.title = 'NOC ledger not selected in Bill Type Master';
          }
        }
      }).catch(() => {});
    }
  }

  // Auto check Parking config when switching to Tab 3 (Parking Slot)
  if (idx === 2) {
    if (typeof mmCheckParkingConfiguredInBillTypes === 'function') {
      mmCheckParkingConfiguredInBillTypes('4w').then(res => {
        const codeInput = document.getElementById('mm-park4-code');
        if (codeInput) {
          if (res.configured && res.accCode) {
            codeInput.value = res.accCode;
            codeInput.title = `Mapped from ${res.billType}: ${res.accName}`;
          } else {
            codeInput.value = 'Not Set';
            codeInput.title = '4-Wheeler Parking ledger not selected in Bill Type Master';
          }
        }
      }).catch(() => {});

      mmCheckParkingConfiguredInBillTypes('2w').then(res => {
        const codeInput = document.getElementById('mm-park2-code');
        if (codeInput) {
          if (res.configured && res.accCode) {
            codeInput.value = res.accCode;
            codeInput.title = `Mapped from ${res.billType}: ${res.accName}`;
          } else {
            codeInput.value = 'Not Set';
            codeInput.title = '2-Wheeler Parking ledger not selected in Bill Type Master';
          }
        }
      }).catch(() => {});
    }
    if (typeof mmCalcParkingTotals === 'function') mmCalcParkingTotals();
  }

  // Auto load transfer history log when switching to Tab 7 (Member Transfer)
  if (idx === 6) {
    const memberId = mmEditId || mmSelectedId;
    if (memberId) {
      mmLoadTransferHistoryLog(memberId);
    }
  }

  // Auto load bill breakup when switching to Tab 8 (Bill Breakup)
  if (idx === 7) {
    mmLoadBreakupBillTypes();
  }
}

// ── Show / Hide States ────────────────────────────────────
function mmShowList() {
  document.getElementById('mm-form-state').style.display = 'none';
  document.getElementById('mm-list-state').style.display = 'flex';

  show('mm-btn-add', 'mm-btn-alter', 'mm-btn-delete', 'mm-btn-print', 'mm-other-drop', 'mm-btn-search');
  hide('mm-btn-save', 'mm-btn-cancel');

  disableFormInputs(true);
  if (mmSelectedId) mmSelectRow(mmSelectedId);
}

function mmShowForm(isAlter = false) {
  mmEditId = isAlter ? mmSelectedId : 0;
  document.getElementById('mm-list-state').style.display = 'none';
  document.getElementById('mm-form-state').style.display = 'flex';

  const titleBar = document.getElementById('mm-form-mode-title');
  const tab7 = document.getElementById('mm-tab-btn-7');
  const tab8 = document.getElementById('mm-tab-btn-8');
  const trContainer = document.getElementById('mm-transfer-toggle-container');
  const trDrawer = document.getElementById('mm-transfer-drawer');

  if (isAlter) {
    const m = mmList.find(x => (x.socMemId || x.memberId || x.MemberId) === mmSelectedId);
    if (titleBar) titleBar.textContent = `UPDATE MEMBER — ${m ? (m.memName || m.MemName) : ''}`;

    // Show 8 Tabs & Member Transfer toggle on ALTER
    if (tab7) tab7.classList.remove('mm-tab-hidden');
    if (tab8) tab8.classList.remove('mm-tab-hidden');
    if (trContainer) trContainer.style.display = 'flex';
    setVal('mm-transfer-toggle', 'No');
    mmOnTransferToggleChange('No');
  } else {
    if (titleBar) titleBar.textContent = 'NEW MEMBER CREATION';

    // Hide Member Transfer toggle & Tab 7 & 8 on ADD
    if (tab7) tab7.classList.add('mm-tab-hidden');
    if (tab8) tab8.classList.add('mm-tab-hidden');
    if (trContainer) trContainer.style.display = 'none';
    if (trDrawer) trDrawer.style.display = 'none';
  }

  hide('mm-btn-add', 'mm-btn-alter', 'mm-btn-delete', 'mm-btn-print', 'mm-other-drop', 'mm-btn-search');
  show('mm-btn-save', 'mm-btn-cancel');

  disableFormInputs(false);
  if (typeof mmLoadBillTypes === 'function') mmLoadBillTypes();
  mmSwitchTab(0);
}

function disableFormInputs(disabled) {
  const inputs = document.querySelectorAll('#mm-form-state input, #mm-form-state select, #mm-form-state textarea');
  inputs.forEach(el => el.disabled = disabled);
}

function show(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('mm-btn-hidden');
  });
}

function hide(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('mm-btn-hidden');
  });
}

// ── ADD ───────────────────────────────────────────────────
function mmAdd() {
  mmSelectedId = 0;
  setVal('mm-edit-id', '0');
  setVal('mm-code', '');
  setVal('mm-name1', '');
  setVal('mm-name2', '');
  setVal('mm-name3', '');
  setVal('mm-name4', '');
  setVal('mm-name5', '');
  setVal('mm-name6', '');

  setVal('mm-unittype', '');
  mmUpdateUnitTypeLabels('');
  setVal('mm-flatno', '');
  setVal('mm-wing', '');
  setVal('mm-floor', '');
  setVal('mm-flattype', '');
  setVal('mm-bldg', '');
  setVal('mm-gstin', '');
  setVal('mm-panno', '');
  setVal('mm-areavalue', '');

  mmOpBalStore = {};
  mmLastBillType = 'Maintenance';
  const bSel = document.getElementById('mm-opbal-billtype');
  if (bSel) bSel.value = 'Maintenance';
  setVal('mm-opbal-principal', '0.00');
  setVal('mm-opbal-interest', '0.00');
  setVal('mm-total-bal', '0.00');

  mmSetNocStatus(false);
  setVal('mm-nonocc-charges', '0');
  setVal('mm-tenant-name', '');
  setVal('mm-nonocc-members-count', '');
  setVal('mm-tenant-contact', '');
  setVal('mm-nonocc-family-names', '');
  setVal('mm-nonocc-phone2', '');
  setVal('mm-nonocc-period-from', '');
  setVal('mm-nonocc-period-to', '');
  setVal('mm-nonocc-agreement-assign', '');

  mmTenantHistoryList = [];
  mmRenderTenantHistory();
  mmNocDocs = { agree: null, aadhar: null, police: null };
  ['agree', 'aadhar', 'police'].forEach(type => {
    const sel = document.getElementById(`mm-noc-${type}-verify`);
    if (sel) sel.value = 'NO';
    mmToggleNocDocWrap(type, 'NO');
  });
  setVal('mm-noc-code', 'INC-1005');
  setVal('mm-park4-code', 'INC-1006');
  setVal('mm-park2-code', 'INC-1007');
  setVal('mm-park4-stilt', '');
  setVal('mm-park4-stilt-reg', '');
  setVal('mm-park4-stilt-charge', '0');
  setVal('mm-park4-podium', '');
  setVal('mm-park4-podium-reg', '');
  setVal('mm-park4-podium-charge', '0');
  setVal('mm-park2-stilt', '');
  setVal('mm-park2-stilt-reg', '');
  setVal('mm-park2-stilt-charge', '0');
  setVal('mm-park2-podium', '');
  setVal('mm-park2-podium-reg', '');
  setVal('mm-park2-podium-charge', '0');
  setVal('mm-park-bill-combined', '4-Wheeler');

  mmParkingRcDocs = {};
  mmBulkRcFileList = [];
  mmRenderRowRcActions('4w-stilt');
  mmRenderRowRcActions('4w-podium');
  mmRenderRowRcActions('2w-stilt');
  mmRenderRowRcActions('2w-podium');
  mmCalcParkingTotals();

  setVal('mm-sc-certno', 'SC-701');
  setVal('mm-sc-memno', 'M-701');
  setVal('mm-sc-numshares', '10');

  setVal('mm-lien-status', 'None');
  setVal('mm-lien-bank-name', '');
  setVal('mm-lien-amt-val', '0');

  setVal('mm-nominee-name', '');
  setVal('mm-nominee-relation', '');
  setVal('mm-nominee-pct', '100');

  setVal('mm-transfer-toggle', 'No');
  mmOnTransferToggleChange('No');

  mmShowForm(false);
  setTimeout(() => document.getElementById('mm-flatno').focus(), 100);
}

// ── ALTER ─────────────────────────────────────────────────
function mmAlter() {
  if (!mmSelectedId) {
    mmAlert('Select a member from the list first.', true);
    return;
  }
  mmAlterById(mmSelectedId);
}

function mmAlterById(id, code, name) {
  const targetId = String(id || '').trim();
  const targetCode = String(code || '').trim().toLowerCase();
  const targetName = String(name || '').trim().toLowerCase();

  const m = mmList.find(x => {
    const xId = String(x.socMemId || x.memberId || x.MemberId || x.id || '').trim();
    const xCode = String(x.memCode || x.MemCode || x.code || '').trim().toLowerCase();
    const xFlat = String((x.wing || x.Wing ? (x.wing || x.Wing) + '-' : '') + (x.flatNo || x.FlatNo || x.flat || '')).trim().toLowerCase();
    const xFlatNoOnly = String(x.flatNo || x.FlatNo || x.flat || '').trim().toLowerCase();
    const xName = String(x.memName || x.MemName || x.name || '').trim().toLowerCase();

    if (targetId && xId && xId === targetId) return true;
    if (targetCode && xCode && xCode === targetCode) return true;
    if (targetCode && xFlat && xFlat === targetCode) return true;
    if (targetCode && xFlatNoOnly && xFlatNoOnly === targetCode) return true;
    if (targetId && xCode && xCode === targetId.toLowerCase()) return true;
    if (targetId && xFlat && xFlat === targetId.toLowerCase()) return true;
    if (targetName && xName && xName === targetName) return true;
    if (targetId && xName && xName === targetId.toLowerCase()) return true;
    return false;
  });

  if (!m) { mmAlert('Member not found in master list.', true); return; }

  const realId = m.socMemId || m.memberId || m.MemberId || id || 0;
  mmSelectedId = realId;
  setVal('mm-edit-id', realId.toString());
  setVal('mm-code', m.memCode || m.MemCode || '');
  setVal('mm-name1', m.memName || m.MemName || '');
  setVal('mm-name2', m.memName2 || m.MemName2 || '');
  setVal('mm-name3', m.memName3 || m.MemName3 || '');
  setVal('mm-name4', m.memName4 || m.MemName4 || '');
  setVal('mm-name5', m.memName5 || m.MemName5 || '');
  setVal('mm-name6', m.memName6 || m.MemName6 || '');

  setVal('mm-unittype', m.unitType || m.UnitType || '');
  mmUpdateUnitTypeLabels(m.unitType || m.UnitType || '');
  setVal('mm-flatno', m.flatNo || m.FlatNo || '');
  setVal('mm-wing', m.wing || m.Wing || '');
  setVal('mm-floor', m.floor || m.Floor || '');
  setVal('mm-flattype', m.flatType || m.FlatType || '');
  setVal('mm-bldg', m.building || m.Building || '');
  setVal('mm-gstin', m.gstinNo || m.GSTINNo || m.gstin || '');
  setVal('mm-panno', m.panNo || m.PANNo || '');
  setVal('mm-areavalue', (m.areaSqft !== undefined && m.areaSqft !== null && m.areaSqft !== '') ? m.areaSqft.toString() : ((m.AreaSqft !== undefined && m.AreaSqft !== null && m.AreaSqft !== '') ? m.AreaSqft.toString() : ((m.sqft !== undefined && m.sqft !== null && m.sqft !== '') ? m.sqft.toString() : '')));

  const mPrin = parseFloat(m.opPrincipal || m.OpPrincipal || m.op_Prin || 0) || 0;
  const mInt = parseFloat(m.opInterest || m.OpInterest || m.op_Int || 0) || 0;

  mmOpBalStore = {};
  if (m.opBalances && typeof m.opBalances === 'object' && Object.keys(m.opBalances).length > 0) {
    mmOpBalStore = JSON.parse(JSON.stringify(m.opBalances));
  } else {
    mmOpBalStore['Maintenance'] = { principal: mPrin, interest: mInt };
  }

  const bSelect = document.getElementById('mm-opbal-billtype');
  const selType = bSelect ? bSelect.value : 'Maintenance';
  mmLastBillType = selType;

  const initBal = mmOpBalStore[selType] || (selType === 'Maintenance' ? { principal: mPrin, interest: mInt } : { principal: 0, interest: 0 });
  const initP = initBal.principal !== undefined ? initBal.principal : (initBal.Principal !== undefined ? initBal.Principal : 0);
  const initI = initBal.interest !== undefined ? initBal.interest : (initBal.Interest !== undefined ? initBal.Interest : 0);
  setVal('mm-opbal-principal', (parseFloat(initP) || 0).toFixed(2));
  setVal('mm-opbal-interest', (parseFloat(initI) || 0).toFixed(2));
  mmCalcTotalBal();

  setVal('mm-phone1', m.contactNo || m.ContactNo || '');
  setVal('mm-email1', m.email || m.Email || '');

  const hasTenant = (m.nonOccApplicable || m.NonOccApplicable) === 'Yes' || !!(m.tenantName || m.TenantName);
  mmSetNocStatus(hasTenant);
  let nocAmt = parseFloat(m.nonOccCharges || m.NonOccCharges) || 0;
  if (nocAmt === 0 && hasTenant) {
    const memId = m.socMemId || m.memberId || m.MemberId || mmEditId || mmSelectedId || 0;
    const flat = m.flatNo || m.FlatNo || '';
    const code = m.memCode || m.MemCode || '';
    nocAmt = (typeof mmGetNocAmountFromMatrix === 'function') ? mmGetNocAmountFromMatrix(memId, flat, code) : 0;
  }
  setVal('mm-nonocc-charges', nocAmt.toString());
  setVal('mm-tenant-name', m.tenantName || m.TenantName || '');
  setVal('mm-nonocc-members-count', (m.tenantMembersCount || '').toString());
  setVal('mm-tenant-contact', m.tenantContact || m.TenantContact || '');
  setVal('mm-nonocc-family-names', m.tenantFamilyNames || '');
  setVal('mm-nonocc-phone2', m.tenantPhone2 || '');
  setVal('mm-nonocc-period-from', m.tenantPeriodFrom || '');
  setVal('mm-nonocc-period-to', m.tenantPeriodTo || '');
  setVal('mm-nonocc-agreement-assign', m.tenantAgreementAssign || '');

  mmTenantHistoryList = m.tenantHistory || [];
  mmRenderTenantHistory();

  mmNocDocs = m.nocDocs || { agree: null, aadhar: null, police: null };
  ['agree', 'aadhar', 'police'].forEach(type => {
    const doc = mmNocDocs[type];
    const sel = document.getElementById(`mm-noc-${type}-verify`);
    if (doc) {
      if (sel) sel.value = 'YES';
      mmToggleNocDocWrap(type, 'YES');
      const nameEl = document.getElementById(`mm-noc-${type}-filename`);
      const wrap = document.getElementById(`mm-noc-${type}-actions`);
      if (nameEl) nameEl.textContent = doc.name;
      if (wrap) wrap.style.display = 'inline-flex';
    } else {
      if (sel) sel.value = 'NO';
      mmToggleNocDocWrap(type, 'NO');
    }
  });

  setVal('mm-noc-code', 'INC-1005');
  setVal('mm-park4-code', 'INC-1006');
  setVal('mm-park2-code', 'INC-1007');
  setVal('mm-park4-stilt', m.parkingSlot4W || m.ParkingSlot4W || '');
  setVal('mm-park4-stilt-reg', m.vehicleNo4W || m.VehicleNo4W || '');

  let p4Amt = parseFloat(m.parkingCharge4W !== undefined ? m.parkingCharge4W : (m.ParkingCharge4W !== undefined ? m.ParkingCharge4W : 0)) || 0;
  if (p4Amt === 0 && typeof mmGetParkingAmountFromMatrix === 'function') {
    const memId = m.socMemId || m.memberId || m.MemberId || mmEditId || mmSelectedId || 0;
    const flat = m.flatNo || m.FlatNo || '';
    const code = m.memCode || m.MemCode || '';
    p4Amt = mmGetParkingAmountFromMatrix(memId, flat, code, '4w');
  }
  setVal('mm-park4-stilt-charge', p4Amt.toString());
  setVal('mm-park4-podium', m.parkingSlot4WPodium || '');
  setVal('mm-park4-podium-reg', m.vehicleNo4WPodium || '');
  setVal('mm-park4-podium-charge', '0');

  setVal('mm-park2-stilt', m.parkingSlot2W || m.ParkingSlot2W || '');
  setVal('mm-park2-stilt-reg', m.vehicleNo2W || m.VehicleNo2W || '');

  let p2Amt = parseFloat(m.parkingCharge2W !== undefined ? m.parkingCharge2W : (m.ParkingCharge2W !== undefined ? m.ParkingCharge2W : 0)) || 0;
  if (p2Amt === 0 && typeof mmGetParkingAmountFromMatrix === 'function') {
    const memId = m.socMemId || m.memberId || m.MemberId || mmEditId || mmSelectedId || 0;
    const flat = m.flatNo || m.FlatNo || '';
    const code = m.memCode || m.MemCode || '';
    p2Amt = mmGetParkingAmountFromMatrix(memId, flat, code, '2w');
  }
  setVal('mm-park2-stilt-charge', p2Amt.toString());
  setVal('mm-park2-podium', m.parkingSlot2WPodium || '');
  setVal('mm-park2-podium-reg', m.vehicleNo2WPodium || '');
  setVal('mm-park2-podium-charge', '0');

  setVal('mm-park-bill-combined', m.parkingBillCombined || '4-Wheeler');

  mmParkingRcDocs = m.parkingRcDocs || {};
  mmBulkRcFileList = m.parkingBulkRcFiles || [];
  mmRenderRowRcActions('4w-stilt');
  mmRenderRowRcActions('4w-podium');
  mmRenderRowRcActions('2w-stilt');
  mmRenderRowRcActions('2w-podium');
  if (typeof mmCalcParkingTotals === 'function') mmCalcParkingTotals();

  setVal('mm-sc-certno', m.shareCertNo || m.ShareCertNo || '');
  setVal('mm-sc-memno', m.folioNo || m.FolioNo || '');
  setVal('mm-sc-numshares', (m.shares || m.Shares || 10).toString());

  setVal('mm-lien-status', m.lienStatus || m.LienStatus || 'None');
  setVal('mm-lien-bank-name', m.lienBankName || m.LienBankName || '');
  setVal('mm-lien-amt-val', (m.lienAmount || m.LienAmount || 0).toString());

  setVal('mm-nominee-name', m.nomineeName || m.NomineeName || '');
  setVal('mm-nominee-relation', m.nomineeRelation || m.NomineeRelation || '');
  setVal('mm-nominee-pct', (m.nomineeSharePct || m.NomineeSharePct || 100).toString());

  mmShowForm(true);
  mmSelectRow(id);
  disableFormInputs(false);
  mmLoadTransferHistoryLog(id);
  setTimeout(() => document.getElementById('mm-name1').focus(), 100);
}

// ── DELETE ────────────────────────────────────────────────
async function mmDelete() {
  if (mmMultiMode) {
    mmExecuteMultiDelete();
    return;
  }

  if (!mmSelectedId) {
    mmAlert('Select a member from the list first.', true);
    return;
  }

  const m = mmList.find(x => (x.socMemId || x.memberId || x.MemberId) === mmSelectedId);
  const memName = m ? (m.memName || m.MemName) : '';
  const memCode = m ? (m.memCode || m.MemCode || m.flatNo) : '';

  mmConfirm(`Are you sure you want to delete member: <b>${memName}</b> (${memCode})?`, async (ok) => {
    if (!ok) return;
    try {
      const res = await fetch(`${mmApiBase()}/api/members/${mmSelectedId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (res.ok && json.success) {
        mmAlert('Member deleted successfully.');
        mmSelectedId = 0;
        mmLoadList();
      } else {
        mmAlert(json.message || 'Delete failed.', true);
      }
    } catch (e) {
      mmAlert('Error deleting member: ' + e.message, true);
    }
  });
}

// ── SAVE (Create or Update) ───────────────────────────────
async function mmSave() {
  const code = val('mm-code').trim();
  const name = val('mm-name1').trim();
  const flat = val('mm-flatno').trim();
  const wing = val('mm-wing').trim();

  if (!code) {
    mmAlert('Member Code is required. Please enter a valid Member Code.', true);
    mmSwitchTab(0);
    document.getElementById('mm-code').focus();
    return;
  }

  if (!name) {
    mmAlert('Primary Owner (Person 1) is required.', true);
    mmSwitchTab(0);
    document.getElementById('mm-name1').focus();
    return;
  }

  if (!flat) {
    const uType = (val('mm-unittype') || 'Flat').trim();
    const unitNoun = /^shop$/i.test(uType) ? 'Shop' : (/^office$/i.test(uType) ? 'Office' : (/^unit$/i.test(uType) ? 'Unit' : (/^room$/i.test(uType) ? 'Room' : 'Flat')));
    mmAlert(`${unitNoun} No. is required.`, true);
    mmSwitchTab(0);
    document.getElementById('mm-flatno').focus();
    return;
  }

  const id = parseInt(val('mm-edit-id')) || 0;

  // Duplicate code check
  const dup = mmList.find(x => {
    const xId = x.socMemId || x.memberId || x.MemberId;
    const xCode = (x.memCode || x.MemCode || '').trim().toUpperCase();
    return xId !== id && xCode === code.toUpperCase();
  });

  if (dup) {
    mmAlert(`Member Code / Flat '${code}' already exists in this society.`, true);
    return;
  }

  const badge = document.getElementById('mm-nonocc-status-badge');
  const isTenantActive = badge ? (badge.textContent === 'ACTIVE' ? 'Yes' : 'No') : 'No';

  const selectEl = document.getElementById('mm-opbal-billtype');
  const activeType = selectEl ? selectEl.value : 'Maintenance';
  const curPrin = parseFloat(val('mm-opbal-principal')) || 0;
  const curInt = parseFloat(val('mm-opbal-interest')) || 0;
  mmOpBalStore[activeType] = { principal: curPrin, interest: curInt };

  const payload = {
    SocietyId: mmGetActiveSocietyId(),
    MemCode: code,
    MemName: name,
    MemName2: val('mm-name2').trim(),
    MemName3: val('mm-name3').trim(),
    MemName4: val('mm-name4').trim(),
    MemName5: val('mm-name5').trim(),
    MemName6: val('mm-name6').trim(),
    Building: val('mm-bldg').trim(),
    Wing: wing,
    FlatNo: flat,
    Floor: val('mm-floor').trim(),
    UnitType: val('mm-unittype'),
    FlatType: val('mm-flattype'),
    UnitNo: val('mm-flatno').trim(),
    AreaSqft: parseFloat(val('mm-areavalue')) || 0,
    AreaType: 'RERA',
    AreaCategory: 'Carpet',
    AreaUnit: 'Sq.Ft',
    ContactNo: val('mm-phone1').trim(),
    Email: val('mm-email1').trim(),
    PANNo: val('mm-panno').trim(),
    OpBalances: mmOpBalStore,
    OpPrincipal: (mmOpBalStore['Maintenance'] && mmOpBalStore['Maintenance'].principal > 0) ? mmOpBalStore['Maintenance'].principal : curPrin,
    OpInterest: (mmOpBalStore['Maintenance'] && mmOpBalStore['Maintenance'].interest > 0) ? mmOpBalStore['Maintenance'].interest : curInt,

    NonOccApplicable: isTenantActive,
    NonOccReason: val('mm-nonocc-reason').trim(),
    NonOccCharges: parseFloat(val('mm-nonocc-charges')) || 0,
    TenantName: val('mm-tenant-name').trim(),
    TenantContact: val('mm-tenant-contact').trim(),
    TenantMembersCount: parseInt(val('mm-nonocc-members-count')) || null,
    TenantFamilyNames: val('mm-nonocc-family-names').trim(),
    TenantPhone2: val('mm-nonocc-phone2').trim(),
    TenantPeriodFrom: val('mm-nonocc-period-from') || null,
    TenantPeriodTo: val('mm-nonocc-period-to') || null,
    TenantAgreementAssign: val('mm-nonocc-agreement-assign').trim(),
    TenantHistory: mmTenantHistoryList,
    NocDocs: mmNocDocs,
    ParkingSlot4W: val('mm-park4-stilt').trim(),
    VehicleNo4W: val('mm-park4-stilt-reg').trim(),
    ParkingCharge4W: parseFloat(val('mm-park4-stilt-charge')) || 0,
    ParkingSlot4WPodium: val('mm-park4-podium').trim(),
    VehicleNo4WPodium: val('mm-park4-podium-reg').trim(),
    ParkingSlot2W: val('mm-park2-stilt').trim(),
    VehicleNo2W: val('mm-park2-stilt-reg').trim(),
    ParkingCharge2W: parseFloat(val('mm-park2-stilt-charge')) || 0,
    ParkingSlot2WPodium: val('mm-park2-podium').trim(),
    VehicleNo2WPodium: val('mm-park2-podium-reg').trim(),
    ParkingBillCombined: val('mm-park-bill-combined'),
    ParkingTotal: parseFloat(val('mm-park-grand-total')) || 0,
    ParkingRcDocs: mmParkingRcDocs,
    ParkingBulkRcFiles: mmBulkRcFileList,
    LienBankName: val('mm-lien-bank-name').trim(),
    LienAmount: parseFloat(val('mm-lien-amt-val')) || 0,

    ShareCertNo: val('mm-sc-certno').trim(),
    FolioNo: val('mm-sc-memno').trim(),
    Shares: parseInt(val('mm-sc-numshares')) || 10,

    NomineeName: val('mm-nominee-name').trim(),
    NomineeRelation: val('mm-nominee-relation').trim(),
    NomineeSharePct: parseFloat(val('mm-nominee-pct')) || 100,

    IsTransferred: val('mm-transfer-toggle'),
    TransferDate: val('mm-transfer-date') ? val('mm-transfer-date') : null,
    TransferType: val('mm-transfer-type'),
    TransfereeName: val('mm-tr-new-name1').trim()
  };

  const url = id ? `${mmApiBase()}/api/members/${id}` : `${mmApiBase()}/api/members`;
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    if (res.ok && json.success) {
      const finalNocAmt = isTenantActive === 'Yes' ? (parseFloat(val('mm-nonocc-charges')) || 0) : 0;
      if (typeof mmSyncNocToMatrixCache === 'function') {
        mmSyncNocToMatrixCache(finalNocAmt);
      }
      const finalPark4Amt = parseFloat(val('mm-park4-total')) || 0;
      const finalPark2Amt = parseFloat(val('mm-park2-total')) || 0;
      if (typeof mmSyncParkingToMatrixAndBreakup === 'function') {
        mmSyncParkingToMatrixAndBreakup();
      }
      try {
        const socId = mmGetActiveSocietyId();
        const currentMemId = id || (json.data && (json.data.socMemId || json.data.memberId)) || 0;
        const singleRowPayload = [{
          memberId: currentMemId,
          memNo: flat || code,
          flatNo: flat,
          wing: wing,
          name: name,
          sqft: parseFloat(val('mm-areavalue')) || 0,
          amounts: {
            'INC-1005': finalNocAmt,
            'Non Occupancy Charges': finalNocAmt,
            'INC-1006': finalPark4Amt,
            '4-Wheeler Parking Charges': finalPark4Amt,
            'INC-1007': finalPark2Amt,
            '2-Wheeler Parking Charges': finalPark2Amt
          },
          checked: false
        }];
        fetch(`${mmApiBase()}/api/billing-master?billType=Maintenance&societyId=${socId}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(singleRowPayload)
        }).catch(() => {});
      } catch (e) { }

      mmAlert(id ? 'Member updated successfully!' : 'Member created successfully!');
      mmShowList();
      mmLoadList();
    } else {
      mmAlert('Error: ' + (json.message || 'Unknown'), true);
    }
  } catch (e) {
    mmAlert('Error saving member: ' + e.message, true);
  }
}

// ── Execute Member Transfer ───────────────────────────────
async function mmExecuteMemberTransfer() {
  const newName = val('mm-tr-new-name1').trim();
  const trDate = val('mm-transfer-date');

  if (!newName) {
    mmAlert('New Transferee Primary Name (NEW PERSON 1) is required.', true);
    document.getElementById('mm-tr-new-name1').focus();
    return;
  }

  if (!trDate) {
    mmAlert('Transfer Date is required.', true);
    document.getElementById('mm-transfer-date').focus();
    return;
  }

  const memberId = mmEditId || mmSelectedId;
  if (!memberId) {
    mmAlert('No member selected for transfer.', true);
    return;
  }

  mmConfirm(`Are you sure you want to execute transfer of this flat to <b>${newName}</b>?`, async (ok) => {
    if (!ok) return;

    try {
      const payload = {
        TransferDate: trDate || null,
        TransferType: val('mm-transfer-type') || 'Sell',
        MeetingType: val('mm-transfer-meeting-type') || 'AGM',
        MeetingDate: val('mm-transfer-meeting-date') || null,
        ResolutionNo: val('mm-transfer-resolution-no').trim(),
        TransferNo: val('mm-transfer-no').trim(),
        RegNoTransferor: val('mm-transfer-reg-no-transfer').trim(),
        RegNoTransferee: val('mm-transfer-reg-no-transferee').trim(),
        AgreementAssign: val('mm-tr-agree-regno').trim(),
        TransfereeName: newName,
        NewPerson2: val('mm-tr-new-name2').trim(),
        NewPerson3: val('mm-tr-new-name3').trim(),
        NewPerson4: val('mm-tr-new-name4').trim(),
        NewPerson5: val('mm-tr-new-name5').trim(),
        NewPerson6: val('mm-tr-new-name6').trim(),
        NewMobilePhone: val('mm-tr-new-phone').trim(),
        NewEmailID: val('mm-tr-new-email').trim(),
        Remarks: val('mm-tr-remarks').trim(),
        AgreementDate: val('mm-tr-agree-date') || null,
        RegistrationDate: val('mm-tr-reg-date') || null,
        StampDate: val('mm-tr-stamp-date') || null,
        AgreementRegNo: val('mm-tr-agree-regno').trim(),
        AgreementValue: parseFloat(val('mm-tr-agree-val')) || 0,
        StampValue: parseFloat(val('mm-tr-stamp-val')) || 0,
        RegistrationFees: parseFloat(val('mm-tr-reg-fees')) || 0
      };

      const res = await fetch(`${mmApiBase()}/api/members/${memberId}/transfer`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Transfer failed');
      }

      // Update current form fields with new transferee details
      setVal('mm-name1', newName);
      setVal('mm-name2', val('mm-tr-new-name2').trim());
      setVal('mm-name3', val('mm-tr-new-name3').trim());
      setVal('mm-name4', val('mm-tr-new-name4').trim());
      setVal('mm-name5', val('mm-tr-new-name5').trim());
      setVal('mm-name6', val('mm-tr-new-name6').trim());
      if (val('mm-tr-new-phone').trim()) setVal('mm-phone1', val('mm-tr-new-phone').trim());
      if (val('mm-tr-new-email').trim()) setVal('mm-email1', val('mm-tr-new-email').trim());

      // Copy transferee agreement & registration values to MEMBER KYC & VERIFICATION frame
      if (val('mm-tr-agree-date')) setVal('mm-agreement-date', val('mm-tr-agree-date'));
      if (val('mm-tr-reg-date')) setVal('mm-registration-date', val('mm-tr-reg-date'));
      if (val('mm-tr-stamp-date')) setVal('mm-stamp-date', val('mm-tr-stamp-date'));
      if (val('mm-tr-agree-regno').trim()) setVal('mm-agreement-reg-no', val('mm-tr-agree-regno').trim());
      if (val('mm-tr-agree-val')) setVal('mm-agreement-value', val('mm-tr-agree-val'));
      if (val('mm-tr-stamp-val')) setVal('mm-stamp-value', val('mm-tr-stamp-val'));
      if (val('mm-tr-reg-fees')) setVal('mm-reg-fees', val('mm-tr-reg-fees'));

      // Reset Member Transfer toggle to OFF ('No') and hide drawer
      setVal('mm-transfer-toggle', 'No');
      mmOnTransferToggleChange('No');

      mmAlert(`Transfer successfully executed! Flat ownership updated to ${newName}.`);

      // Refresh list & transfer log
      await mmLoadList();
      mmLoadTransferHistoryLog(memberId);

    } catch (e) {
      mmAlert(`Error executing transfer: ${e.message}`, true);
    }
  });
}

// ── Multi Delete Mode ─────────────────────────────────────
function mmToggleMultiDelete() {
  mmMultiMode = !mmMultiMode;
  mmChecked = {};
  mmRenderList();

  const delBtn = document.getElementById('mm-btn-delete');
  if (mmMultiMode) {
    mmAlert('Multi-Delete mode active. Check rows in grid and click DELETE SELECTION.');
    if (delBtn) delBtn.innerHTML = '<i class="bi bi-trash"></i> DELETE SELECTION';
  } else {
    if (delBtn) delBtn.innerHTML = '<i class="bi bi-trash"></i> DELETE';
  }
}

function mmChk(id, checked) {
  mmChecked[id] = checked;
}

function mmToggleAll(checked) {
  mmList.forEach(m => {
    const id = m.socMemId || m.memberId || m.MemberId;
    mmChecked[id] = checked;
  });
  mmRenderList();
}

async function mmExecuteMultiDelete() {
  const ids = Object.keys(mmChecked).filter(k => mmChecked[k]);
  if (ids.length === 0) {
    mmAlert('No rows selected in grid.', true);
    return;
  }

  mmConfirm(`Are you sure you want to delete these <b>${ids.length}</b> member(s)?`, async (ok) => {
    if (!ok) return;

    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        const res = await fetch(`${mmApiBase()}/api/members/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    mmAlert(`${successCount} member(s) deleted successfully.${failCount ? ` (${failCount} failed)` : ''}`);
    mmMultiMode = false;
    mmChecked = {};
    const delBtn = document.getElementById('mm-btn-delete');
    if (delBtn) delBtn.innerHTML = '<i class="bi bi-trash"></i> DELETE';
    mmLoadList();
  });
}

// ── Search Strip Toggle ───────────────────────────────────
function mmToggleSearch() {
  const strip = document.getElementById('mm-search-strip');
  if (strip) {
    strip.remove();
    mmRenderList();
  } else {
    const panel = document.getElementById('mm-panel');
    const cmdStrip = document.getElementById('mm-cmd-strip');
    const div = document.createElement('div');
    div.id = 'mm-search-strip';
    div.className = 'mm-search-strip';
    div.innerHTML = `
      <label style="font-size:11px;font-weight:700;color:#334155;">SEARCH MEMBER / FLAT / WING / PHONE:</label>
      <input type="text" class="mm-input" style="width:260px;" placeholder="Search flat, name, wing, phone..."
             oninput="mmRenderList()" id="mm-search-inp">
      <span style="font-size:11px;font-weight:700;color:#94a3b8;margin-left:auto;" id="mm-count-badge">
        ${mmList.length} Records
      </span>`;
    panel.insertBefore(div, cmdStrip.nextSibling);
    document.getElementById('mm-search-inp').focus();
    mmRenderList();
  }
}

// ── Print Register ────────────────────────────────────────
function mmPrint() {
  const w = window.open('', '_blank', 'width=800,height=600');
  let html = `<html><head><title>Member Directory Register</title>
  <style>
    body { font-family: sans-serif; font-size:12px; margin:20px; color:#1e293b; }
    table { width:100%; border-collapse:collapse; margin-top:12px; }
    th { background:#1565C0; color:#fff; padding:6px 10px; text-align:left; font-size:10px; font-weight:bold; }
    td { padding:6px 10px; border-bottom:1px solid #e2e8f0; font-size:11px; }
    h2 { margin:0; color:#1565C0; font-size:16px; }
    p { margin:4px 0 12px; font-size:11px; color:#64748b; }
  </style></head><body>`;

  html += `<h2>MEMBER DIRECTORY REGISTER</h2><p>Active Society Member Roster. Printed: ${new Date().toLocaleString()}</p>`;
  html += `<table><thead><tr><th style="width:90px;">CODE</th><th style="width:70px;">FLAT</th><th style="width:50px;">WING</th><th>MEMBER NAME</th><th style="width:70px;">AREA</th><th style="width:110px;">MOBILE NO.</th></tr></thead><tbody>`;

  mmList.forEach(m => {
    html += `<tr>
      <td style="text-align:center;"><b>${m.memCode || m.MemCode || '—'}</b></td>
      <td style="text-align:center;"><b>${m.flatNo || m.FlatNo || '—'}</b></td>
      <td style="text-align:center;">${m.wing || m.Wing || '—'}</td>
      <td><b>${m.memName || m.MemName || '—'}</b></td>
      <td>${m.areaSqft || m.sqft || 0}</td>
      <td>${m.contactNo || m.memMobile || '—'}</td>
    </tr>`;
  });

  html += `</tbody></table></body></html>`;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ── Export Excel ──────────────────────────────────────────
function mmExportExcel() {
  let csv = 'Code,Flat No,Wing,Building,Member Name,Area Sqft,Mobile,Email\n';
  mmList.forEach(m => {
    csv += `"${m.memCode || m.MemCode || ''}","${m.flatNo || m.FlatNo || ''}","${m.wing || m.Wing || ''}","${m.building || m.Building || ''}","${m.memName || m.MemName || ''}","${m.areaSqft || m.sqft || 0}","${m.contactNo || m.memMobile || ''}","${m.email || m.memEmail || ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'member-directory.xls';
  a.click();
  mmAlert('Excel spreadsheet exported successfully.');
}

// ── Exit ──────────────────────────────────────────────────
function mmExit() {
  if (typeof WorkspaceManager !== 'undefined' && WorkspaceManager.closeTab) {
    WorkspaceManager.closeTab('member-master');
  }
}

// ── Keyboard Shortcuts ────────────────────────────────────
function mmSetupKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    const panel = document.getElementById('mm-panel');
    if (!panel || !panel.offsetParent) return;

    const isFormVisible = document.getElementById('mm-form-state').style.display === 'flex';
    if (isFormVisible) {
      if (e.key === 'Escape') mmShowList();
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); mmAdd(); }
    if (e.key === 'Delete' && mmSelectedId) { e.preventDefault(); mmDelete(); }
    if (e.key === 'Enter' && mmSelectedId) { e.preventDefault(); mmAlterById(mmSelectedId); }
    if (e.key === 'Escape') {
      mmMultiMode = false;
      mmChecked = {};
      mmRenderList();
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!mmList.length) return;
      let idx = mmList.findIndex(m => (m.socMemId || m.memberId || m.MemberId) === mmSelectedId);
      if (e.key === 'ArrowDown') idx = Math.min(idx + 1, mmList.length - 1);
      else idx = Math.max(idx - 1, 0);
      if (idx < 0) idx = 0;
      const target = mmList[idx];
      mmSelectRow(target.socMemId || target.memberId || target.MemberId);

      const rows = document.querySelectorAll('#mm-tbody tr');
      if (rows[idx]) rows[idx].scrollIntoView({ block: 'nearest' });
    }
  });
}

// ── Person & Code Field Keyboard Navigation (Enter, Tab, Arrows) ─
function mmHandlePersonKeyNav(e, idx) {
  const ids = [
    'mm-code',  // 0
    'mm-name1', // 1
    'mm-name2', // 2
    'mm-name3', // 3
    'mm-name4', // 4
    'mm-name5', // 5
    'mm-name6'  // 6
  ];

  const focusTarget = (targetId) => {
    const el = document.getElementById(targetId);
    if (el) {
      el.focus();
      if (typeof el.select === 'function') el.select();
      return true;
    }
    return false;
  };

  // 1. Enter Key -> move forward in sequence (0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> Flat / Location details)
  if (e.key === 'Enter') {
    e.preventDefault();
    if (idx >= 0 && idx < 6) {
      focusTarget(ids[idx + 1]);
    } else if (idx === 6) {
      if (!focusTarget('mm-unittype')) focusTarget('mm-flatno');
    }
    return;
  }

  // 2. Tab Key / Shift+Tab Key -> enforce exact sequence 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6
  if (e.key === 'Tab') {
    if (!e.shiftKey) {
      if (idx >= 0 && idx < 6) {
        e.preventDefault();
        focusTarget(ids[idx + 1]);
      }
    } else {
      if (idx > 0 && idx <= 6) {
        e.preventDefault();
        focusTarget(ids[idx - 1]);
      }
    }
    return;
  }

  // 3. ArrowDown -> Move down column or to next person
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (idx === 0) focusTarget('mm-name1');
    else if (idx === 1) focusTarget('mm-name2');
    else if (idx === 2) focusTarget('mm-name3');
    else if (idx === 3) focusTarget('mm-name4');
    else if (idx === 4) focusTarget('mm-name5');
    else if (idx === 5) focusTarget('mm-name6');
    else if (idx === 6) {
      if (!focusTarget('mm-unittype')) focusTarget('mm-flatno');
    }
    return;
  }

  // 4. ArrowUp -> Move up column or to previous person
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (idx === 6) focusTarget('mm-name5');
    else if (idx === 5) focusTarget('mm-name4');
    else if (idx === 4) focusTarget('mm-name3');
    else if (idx === 3) focusTarget('mm-name2');
    else if (idx === 2) focusTarget('mm-name1');
    else if (idx === 1) focusTarget('mm-code');
    return;
  }

  // 5. ArrowRight -> Jump horizontally across from Left column to Right column
  if (e.key === 'ArrowRight') {
    if (idx === 1) { e.preventDefault(); focusTarget('mm-name4'); }
    else if (idx === 2) { e.preventDefault(); focusTarget('mm-name5'); }
    else if (idx === 3) { e.preventDefault(); focusTarget('mm-name6'); }
    return;
  }

  // 6. ArrowLeft -> Jump horizontally across from Right column to Left column
  if (e.key === 'ArrowLeft') {
    if (idx === 4) { e.preventDefault(); focusTarget('mm-name1'); }
    else if (idx === 5) { e.preventDefault(); focusTarget('mm-name2'); }
    else if (idx === 6) { e.preventDefault(); focusTarget('mm-name3'); }
    return;
  }
}

// ── Alert Dialog ──────────────────────────────────────────
function mmAlert(msg, isError) {
  if (window.JeevikaDialog && window.JeevikaDialog.alert) {
    window.JeevikaDialog.alert(msg, isError ? 'Error' : 'Information');
    return;
  }
  const overlay = document.getElementById('mm-alert-overlay');
  const title = document.getElementById('mm-alert-title');
  const icon = document.getElementById('mm-alert-icon');
  const msgEl = document.getElementById('mm-alert-msg');

  if (!overlay) { alert(msg); return; }

  if (isError) {
    title.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> ERROR';
    icon.className = 'bi bi-exclamation-triangle-fill err';
  } else {
    title.innerHTML = '<i class="bi bi-info-circle-fill"></i> INFORMATION';
    icon.className = 'bi bi-info-circle-fill';
  }
  msgEl.innerHTML = msg;
  overlay.style.display = 'flex';
}

function mmCloseAlert() {
  const el = document.getElementById('mm-alert-overlay');
  if (el) el.style.display = 'none';
}

// ── Confirm Dialog ────────────────────────────────────────
function mmConfirm(msg, cb) {
  if (window.JeevikaDialog && window.JeevikaDialog.confirm) {
    window.JeevikaDialog.confirm(msg, null, 'Confirm').then(ok => { if (cb) cb(ok); });
    return;
  }
  const overlay = document.getElementById('mm-confirm-overlay');
  const msgEl = document.getElementById('mm-confirm-msg');
  if (!overlay) { cb(confirm(msg)); return; }

  mmConfirmCb = cb;
  msgEl.innerHTML = msg;
  overlay.style.display = 'flex';

  document.getElementById('mm-confirm-yes').onclick = () => mmCloseConfirm(true);
}

function mmCloseConfirm(result) {
  const el = document.getElementById('mm-confirm-overlay');
  if (el) el.style.display = 'none';
  const cb = mmConfirmCb;
  mmConfirmCb = null;
  if (cb) cb(result);
}

function val(id) { const el = document.getElementById(id); return el ? el.value || '' : ''; }
function setVal(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  const valToSet = v ?? '';
  if (el.tagName === 'SELECT') {
    el.value = valToSet;
    if (valToSet && el.value !== String(valToSet)) {
      let matched = false;
      for (let opt of el.options) {
        if (opt.value && opt.value.toLowerCase() === String(valToSet).toLowerCase()) {
          el.value = opt.value;
          matched = true;
          break;
        }
      }
      if (!matched && valToSet && !String(valToSet).startsWith('__ADD_')) {
        const newOpt = document.createElement('option');
        newOpt.value = String(valToSet);
        newOpt.textContent = String(valToSet);
        const addOpt = el.querySelector('option[value^="__ADD_"]');
        if (addOpt) el.insertBefore(newOpt, addOpt);
        else el.appendChild(newOpt);
        el.value = String(valToSet);
      }
    }
  } else {
    el.value = valToSet;
  }
}

// ── Statement Audit Modal ─────────────────────────────────
async function mmShowStatement() {
  if (!mmSelectedId) {
    mmAlert('Please select a member row first to view statement audit.', true);
    return;
  }
  const overlay = document.getElementById('mm-detail-overlay');
  const tbody = document.getElementById('mm-detail-tbody');
  const flatEl = document.getElementById('mm-stmt-flat');
  const nameEl = document.getElementById('mm-stmt-name');

  if (!overlay || !tbody) return;

  tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;color:#808080;">
    <i class="bi bi-hourglass-split"></i> Fetching statement...</td></tr>`;
  overlay.style.display = 'flex';

  try {
    const res = await fetch(`${mmApiBase()}/api/members/${mmSelectedId}/statement`);
    const json = await res.json();

    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load statement');

    if (flatEl) flatEl.textContent = `${json.member.wing || ''}-${json.member.flat || ''}`.replace(/^-/, '');
    if (nameEl) nameEl.textContent = json.member.memName || '';

    const data = json.data || [];
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;color:#808080;">No statement entries found.</td></tr>`;
      return;
    }

    let rowsHtml = '';
    let tMaint = 0, tWater = 0, tElec = 0, tPark = 0, tInt = 0, tCgst = 0, tSgst = 0, tNoc = 0, tOth = 0, tTot = 0;

    data.forEach(r => {
      tMaint += (r.maint || 0); tWater += (r.water || 0); tElec += (r.elec || 0);
      tPark += (r.park || 0); tInt += (r.interest || 0); tCgst += (r.cgst || 0);
      tSgst += (r.sgst || 0); tNoc += (r.noc || 0); tOth += (r.other || 0); tTot += (r.total || 0);

      rowsHtml += `
        <tr>
          <td>${r.date || ''}</td>
          <td><b>${r.particulars || ''}</b></td>
          <td style="text-align:right;">${(r.maint || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(r.water || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(r.elec || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(r.park || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(r.interest || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(r.cgst || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(r.sgst || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(r.noc || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(r.other || 0).toFixed(2)}</td>
          <td style="text-align:right;font-weight:bold;">${(r.total || 0).toFixed(2)}</td>
        </tr>`;
    });

    rowsHtml += `
      <tr style="background:#f1f5f9;font-weight:bold;border-top:2px solid #1565C0;">
        <td colspan="2" style="text-align:right;">TOTAL DUES (₹):</td>
        <td style="text-align:right;">${tMaint.toFixed(2)}</td>
        <td style="text-align:right;">${tWater.toFixed(2)}</td>
        <td style="text-align:right;">${tElec.toFixed(2)}</td>
        <td style="text-align:right;">${tPark.toFixed(2)}</td>
        <td style="text-align:right;">${tInt.toFixed(2)}</td>
        <td style="text-align:right;">${tCgst.toFixed(2)}</td>
        <td style="text-align:right;">${tSgst.toFixed(2)}</td>
        <td style="text-align:right;">${tNoc.toFixed(2)}</td>
        <td style="text-align:right;">${tOth.toFixed(2)}</td>
        <td style="text-align:right;color:#1565C0;">${tTot.toFixed(2)}</td>
      </tr>`;

    tbody.innerHTML = rowsHtml;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;color:#dc2626;">Error: ${e.message}</td></tr>`;
  }
}

function mmCloseDetail() {
  const el = document.getElementById('mm-detail-overlay');
  if (el) el.style.display = 'none';
}

function mmPrintDetail() {
  window.print();
}

// ── Bulk Reassignment ─────────────────────────────────────
function mmOpenBulkReassign() {
  const ids = Object.keys(mmChecked).filter(k => mmChecked[k]);
  if (ids.length === 0) {
    mmAlert('Please check at least one member checkbox to reassign Wing/Building in bulk.', true);
    return;
  }
  document.getElementById('mm-mc-overlay').style.display = 'flex';
}

async function mmApplyBulkReassign() {
  const ids = Object.keys(mmChecked).filter(k => mmChecked[k]).map(Number);
  const wing = val('mm-mc-wing').trim();
  const bldg = val('mm-mc-bldg').trim();

  if (ids.length === 0) return;
  if (!wing && !bldg) {
    mmAlert('Please enter a new Wing or Building to update.', true);
    return;
  }

  try {
    const res = await fetch(`${mmApiBase()}/api/members/bulk-reassign`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ memberIds: ids, wing, building: bldg })
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed bulk reassign');

    document.getElementById('mm-mc-overlay').style.display = 'none';
    mmAlert(json.message || 'Bulk reassignment applied successfully!');
    mmLoadList();
  } catch (e) {
    mmAlert(`Bulk Error: ${e.message}`, true);
  }
}

// ═══════════════════════════════════════════════════════════
// 28 STANDARD COLUMNS DEFINITION & TEMPLATE / EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════
const MM_28_COLUMNS = [
  "Member Code",
  "Person 1",
  "Person 2",
  "Person 3",
  "Person 4",
  "Person 5",
  "Person 6",
  "Type",
  "Flat No.",
  "Wing Name/No.",
  "Floor Number",
  "Flat Type",
  "Building Name",
  "GSTIN Registration",
  "PAN No.",
  "Area Value",
  "Area Type",
  "Bill Type",
  "Opening Principal (₹)",
  "Opening Interest (₹)",
  "Total Balance (₹)",
  "Date of Agreement",
  "Date of Registration",
  "Date of Stamp Duty",
  "Agreement Reg. No.",
  "Agreement Value (₹)",
  "Stamp Duty Value (₹)",
  "Registration Fees (₹)"
];

let mmImportParsedData = [];

// ── Open Bulk Import Modal ────────────────────────────────
function mmOpenBulkImportModal() {
  const overlay = document.getElementById('mm-import-overlay');
  if (overlay) overlay.style.display = 'flex';
  const fileInp = document.getElementById('mm-import-file');
  if (fileInp) fileInp.value = '';
  const selBadge = document.getElementById('mm-import-selected-file');
  if (selBadge) selBadge.style.display = 'none';
  const prevBox = document.getElementById('mm-import-preview-box');
  if (prevBox) prevBox.style.display = 'none';
  const btn = document.getElementById('mm-btn-do-import');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill"></i> START IMPORT & SYNC';
  }
  mmImportParsedData = [];
}
function mmOpenImportCSV() {
  mmOpenBulkImportModal();
}

// ── Download Standard 28-Column Template ──────────────────
function mmDownloadMemberTemplate(format) {
  format = (format || 'xlsx').toLowerCase();

  if (format === 'xlsx' && typeof XLSX !== 'undefined') {
    const wsData = [MM_28_COLUMNS];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply #535fc1 header styling
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:AB1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ c: C, r: 0 });
      if (!ws[cellRef]) continue;
      ws[cellRef].s = {
        fill: { fgColor: { rgb: "535FC1" } },
        font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }

    // Set column widths
    ws['!cols'] = MM_28_COLUMNS.map(col => ({ wch: Math.max(col.length + 4, 14) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MemberMaster");
    XLSX.writeFile(wb, "Member_Master_Blank_Template.xlsx");
    return;
  }

  if (format === 'csv' || format === 'xlsx') {
    let csv = MM_28_COLUMNS.map(c => `"${c}"`).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Member_Master_Blank_Template.csv';
    a.click();
    return;
  }

  if (format === 'xls') {
    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Template</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      </head>
      <body>
      <table border="1">
        <thead>
          <tr>
            ${MM_28_COLUMNS.map(c => `<th style="background-color:#535fc1;color:#ffffff;font-family:Arial,sans-serif;font-size:11pt;font-weight:bold;padding:8px;border:1px solid #3d4a99;text-align:center;">${c}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
        </tbody>
      </table>
      </body>
      </html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Member_Master_Blank_Template.xls';
    a.click();
  }
}

// ── Export Members (All 28 Standard Columns) ──────────────
function mmExportMembers(format) {
  format = (format || 'xlsx').toLowerCase();
  const members = Array.isArray(mmList) ? mmList : [];
  if (members.length === 0) {
    mmAlert('No members found to export.', true);
    return;
  }

  const rows = members.map(m => {
    const memCode   = m.memCode || m.MemCode || '';
    const person1   = m.memName || m.memName1 || m.MemName || '';
    const person2   = m.memName2 || m.MemName2 || '';
    const person3   = m.memName3 || m.MemName3 || '';
    const person4   = m.memName4 || m.MemName4 || '';
    const person5   = m.memName5 || m.MemName5 || '';
    const person6   = m.memName6 || m.MemName6 || '';
    const memType   = m.memberType || m.MemberType || 'Owner';
    const flatNo    = m.flatNo || m.FlatNo || '';
    const wing      = m.wing || m.Wing || '';
    const floor     = m.floor || m.Floor || '';
    const flatType  = m.flatType || m.FlatType || 'Residential';
    const building  = m.building || m.bldg || m.Building || '';
    const gstin     = m.gstin || m.GSTIN || '';
    const panNo     = m.panNo || m.PANNo || '';
    const areaVal   = parseFloat(m.areaSqft || m.sqft || m.AreaSqft || 0);
    const areaType  = m.areaType || m.AreaType || 'Carpet';
    const billType  = m.defaultBillType || m.billType || 'Maintenance';

    // Opening balances
    let opPrin = 0;
    let opInt  = 0;
    if (m.opBalances && typeof m.opBalances === 'object') {
      const bEntry = m.opBalances[billType] || m.opBalances['Maintenance'] || Object.values(m.opBalances)[0];
      if (bEntry) {
        opPrin = parseFloat(bEntry.principal || bEntry.Principal || 0);
        opInt  = parseFloat(bEntry.interest || bEntry.Interest || 0);
      }
    }
    if (opPrin === 0 && opInt === 0) {
      opPrin = parseFloat(m.opPrincipal || m.OpPrincipal || 0);
      opInt  = parseFloat(m.opInterest || m.OpInterest || 0);
    }
    const totBal = opPrin + opInt;

    const agreeDate = m.agreementDate || m.AgreementDate || '';
    const regDate   = m.registrationDate || m.RegistrationDate || '';
    const stampDate = m.stampDate || m.StampDate || '';
    const agreeReg  = m.agreementRegNo || m.AgreementRegNo || '';
    const agreeVal  = parseFloat(m.agreementValue || m.AgreementValue || 0);
    const stampVal  = parseFloat(m.stampValue || m.StampValue || 0);
    const regFees   = parseFloat(m.registrationFees || m.RegistrationFees || 0);

    return [
      memCode,
      person1,
      person2,
      person3,
      person4,
      person5,
      person6,
      memType,
      flatNo,
      wing,
      floor,
      flatType,
      building,
      gstin,
      panNo,
      areaVal,
      areaType,
      billType,
      opPrin,
      opInt,
      totBal,
      agreeDate,
      regDate,
      stampDate,
      agreeReg,
      agreeVal,
      stampVal,
      regFees
    ];
  });

  const todayStr = new Date().toISOString().split('T')[0];

  if (format === 'xlsx' && typeof XLSX !== 'undefined') {
    const wsData = [MM_28_COLUMNS, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply #535fc1 header styling
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:AB1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ c: C, r: 0 });
      if (!ws[cellRef]) continue;
      ws[cellRef].s = {
        fill: { fgColor: { rgb: "535FC1" } },
        font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }
    ws['!cols'] = MM_28_COLUMNS.map(col => ({ wch: Math.max(col.length + 4, 14) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Members");
    XLSX.writeFile(wb, `Member_Master_Export_${todayStr}.xlsx`);
    mmAlert(`Exported ${members.length} members successfully.`);
    return;
  }

  if (format === 'csv' || format === 'xlsx') {
    let csv = MM_28_COLUMNS.map(c => `"${c}"`).join(',') + '\n';
    rows.forEach(r => {
      csv += r.map(v => typeof v === 'number' ? v : `"${(v || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Member_Master_Export_${todayStr}.csv`;
    a.click();
    mmAlert(`Exported ${members.length} members successfully.`);
    return;
  }

  if (format === 'xls') {
    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Members</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      </head>
      <body>
      <table border="1">
        <thead>
          <tr>
            ${MM_28_COLUMNS.map(c => `<th style="background-color:#535fc1;color:#ffffff;font-family:Arial,sans-serif;font-size:11pt;font-weight:bold;padding:8px;border:1px solid #3d4a99;text-align:center;">${c}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `<tr>${r.map(v => `<td style="padding:5px;font-family:Arial,sans-serif;font-size:10pt;">${v !== null && v !== undefined ? v : ''}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
      </body>
      </html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Member_Master_Export_${todayStr}.xls`;
    a.click();
    mmAlert(`Exported ${members.length} members successfully.`);
  }
}
function mmExportExcel() {
  mmExportMembers('xlsx');
}

// ── File Selection & Drop Handlers ────────────────────────
function mmHandleFileDrop(e) {
  const dt = e.dataTransfer;
  if (dt && dt.files && dt.files.length > 0) {
    const fileInp = document.getElementById('mm-import-file');
    if (fileInp) {
      fileInp.files = dt.files;
      mmHandleImportFileSelect(fileInp);
    }
  }
}

function mmHandleImportFileSelect(input) {
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];

  const selBadge = document.getElementById('mm-import-selected-file');
  const fNameEl = document.getElementById('mm-import-filename');
  const fSizeEl = document.getElementById('mm-import-filesize');
  if (selBadge && fNameEl) {
    fNameEl.textContent = file.name;
    if (fSizeEl) fSizeEl.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
    selBadge.style.display = 'flex';
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = e.target.result;
      let rows = [];

      if (typeof XLSX !== 'undefined') {
        const wb = XLSX.read(data, { type: 'array', cellDates: true, raw: false });
        const firstSheet = wb.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1, defval: '' });
      } else {
        // Fallback CSV text decoder
        const text = new TextDecoder("utf-8").decode(data);
        rows = text.split(/\r?\n/).map(line => {
          return line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
        });
      }

      if (!rows || rows.length <= 1) {
        mmAlert('File contains no data rows.', true);
        return;
      }

      const headers = rows[0].map(h => (h || '').toString().trim());
      mmParseImportRows(headers, rows.slice(1));
    } catch (err) {
      console.error('File parse error:', err);
      mmAlert('Failed to parse file: ' + err.message, true);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── Helper to normalize column header names ──────────────
function mmNormalizeColKey(h) {
  if (!h) return '';
  return h.toLowerCase()
    .replace(/[₹\(\)\.\/,\-_]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function mmParseImportRows(headers, dataRows) {
  // Build header mapping
  const colMap = {};
  headers.forEach((h, idx) => {
    const norm = mmNormalizeColKey(h);
    if (norm.includes('membercode') || norm === 'code') colMap['memCode'] = idx;
    else if (norm === 'person1' || norm === 'membername' || norm === 'name') colMap['person1'] = idx;
    else if (norm === 'person2') colMap['person2'] = idx;
    else if (norm === 'person3') colMap['person3'] = idx;
    else if (norm === 'person4') colMap['person4'] = idx;
    else if (norm === 'person5') colMap['person5'] = idx;
    else if (norm === 'person6') colMap['person6'] = idx;
    else if (norm === 'type' || norm === 'membertype') colMap['type'] = idx;
    else if (norm.includes('flatno') || norm === 'flat') colMap['flatNo'] = idx;
    else if (norm.includes('wing')) colMap['wing'] = idx;
    else if (norm.includes('floor')) colMap['floor'] = idx;
    else if (norm.includes('flattype')) colMap['flatType'] = idx;
    else if (norm.includes('building') || norm === 'bldg') colMap['building'] = idx;
    else if (norm.includes('gstin') || norm.includes('gst')) colMap['gstin'] = idx;
    else if (norm.includes('panno') || norm === 'pan') colMap['panNo'] = idx;
    else if (norm.includes('areavalue') || norm.includes('areasqft') || norm === 'area') colMap['areaValue'] = idx;
    else if (norm.includes('areatype')) colMap['areaType'] = idx;
    else if (norm.includes('billtype')) colMap['billType'] = idx;
    else if (norm.includes('openingprincipal') || norm.includes('opprincipal')) colMap['opPrincipal'] = idx;
    else if (norm.includes('openinginterest') || norm.includes('opinterest')) colMap['opInterest'] = idx;
    else if (norm.includes('totalbalance')) colMap['totalBalance'] = idx;
    else if (norm.includes('dateofagreement') || norm.includes('agreementdate')) colMap['agreementDate'] = idx;
    else if (norm.includes('dateofregistration') || norm.includes('registrationdate')) colMap['registrationDate'] = idx;
    else if (norm.includes('dateofstamp') || norm.includes('stampdate')) colMap['stampDate'] = idx;
    else if (norm.includes('agreementregno') || norm.includes('agreementreg')) colMap['agreementRegNo'] = idx;
    else if (norm.includes('agreementvalue')) colMap['agreementValue'] = idx;
    else if (norm.includes('stampdutyvalue') || norm.includes('stampvalue')) colMap['stampValue'] = idx;
    else if (norm.includes('registrationfees') || norm.includes('regfees')) colMap['registrationFees'] = idx;
  });

  // If column names didn't match, fallback by standard position (0..27)
  const isPositional = Object.keys(colMap).length < 5;
  const getVal = (row, key, pos) => {
    let val = '';
    if (!isPositional && colMap[key] !== undefined) {
      val = row[colMap[key]];
    } else if (pos < row.length) {
      val = row[pos];
    }
    return val !== null && val !== undefined ? String(val).trim() : '';
  };

  mmImportParsedData = [];

  dataRows.forEach((row, i) => {
    if (!row || row.length === 0) return;

    const memCode  = getVal(row, 'memCode', 0);
    const person1  = getVal(row, 'person1', 1);
    const person2  = getVal(row, 'person2', 2);
    const person3  = getVal(row, 'person3', 3);
    const person4  = getVal(row, 'person4', 4);
    const person5  = getVal(row, 'person5', 5);
    const person6  = getVal(row, 'person6', 6);
    const type     = getVal(row, 'type', 7) || 'Owner';
    const flatNo   = getVal(row, 'flatNo', 8);
    const wing     = getVal(row, 'wing', 9);
    const floor    = getVal(row, 'floor', 10);
    const flatType = getVal(row, 'flatType', 11) || 'Residential';
    const building = getVal(row, 'building', 12);
    const gstin    = getVal(row, 'gstin', 13);
    const panNo    = getVal(row, 'panNo', 14);
    const areaVal  = parseFloat(getVal(row, 'areaValue', 15)) || 0;
    const areaType = getVal(row, 'areaType', 16) || 'Carpet';
    const billType = getVal(row, 'billType', 17) || 'Maintenance';
    const opPrin   = parseFloat(getVal(row, 'opPrincipal', 18)) || 0;
    const opInt    = parseFloat(getVal(row, 'opInterest', 19)) || 0;
    const totBal   = parseFloat(getVal(row, 'totalBalance', 20)) || (opPrin + opInt);
    const agreeDate = getVal(row, 'agreementDate', 21);
    const regDate   = getVal(row, 'registrationDate', 22);
    const stampDate = getVal(row, 'stampDate', 23);
    const agreeReg  = getVal(row, 'agreementRegNo', 24);
    const agreeVal  = parseFloat(getVal(row, 'agreementValue', 25)) || 0;
    const stampVal  = parseFloat(getVal(row, 'stampValue', 26)) || 0;
    const regFees   = parseFloat(getVal(row, 'registrationFees', 27)) || 0;

    // Skip empty rows
    if (!memCode && !person1 && !flatNo && !wing) return;

    // Check duplicate code against existing members and seen codes in file
    const existingCodes = new Set(
      (mmList || []).map(m => (m.memCode || m.MemCode || '').trim().toUpperCase()).filter(Boolean)
    );
    const isCodeExisting = existingCodes.has(memCode.toUpperCase());
    const isCodeInFile = (window._mmSeenImportCodes || new Set()).has(memCode.toUpperCase());
    const isDuplicate = isCodeExisting || isCodeInFile;
    let duplicateReason = '';
    if (isCodeExisting) {
      duplicateReason = `Code '${memCode}' already exists in Member Master`;
    } else if (isCodeInFile) {
      duplicateReason = `Duplicate code '${memCode}' within file`;
    }

    if (!window._mmSeenImportCodes) window._mmSeenImportCodes = new Set();
    if (memCode) window._mmSeenImportCodes.add(memCode.toUpperCase());

    mmImportParsedData.push({
      memCode,
      person1: person1 || (memCode ? `Member ${memCode}` : `Member ${wing}-${flatNo}`),
      person2,
      person3,
      person4,
      person5,
      person6,
      type,
      flatNo,
      wing,
      floor,
      flatType,
      building,
      gstin,
      panNo,
      areaValue: areaVal,
      areaType,
      billType,
      opPrincipal: opPrin,
      opInterest: opInt,
      totalBalance: totBal,
      agreementDate: agreeDate,
      registrationDate: regDate,
      stampDate: stampDate,
      agreementRegNo: agreeReg,
      agreementValue: agreeVal,
      stampValue: stampVal,
      registrationFees: regFees,
      isDuplicate,
      duplicateReason
    });
  });

  // Clean up temporary set
  delete window._mmSeenImportCodes;

  // Render preview
  const prevBox = document.getElementById('mm-import-preview-box');
  const rCountEl = document.getElementById('mm-preview-row-count');
  const theadRow = document.getElementById('mm-preview-thead-row');
  const tbody = document.getElementById('mm-preview-tbody');
  const dupAlert = document.getElementById('mm-import-duplicate-alert');
  const dupAlertText = document.getElementById('mm-duplicate-alert-text');

  const duplicateRows = mmImportParsedData.filter(r => r.isDuplicate);
  if (dupAlert) {
    if (duplicateRows.length > 0) {
      if (dupAlertText) {
        dupAlertText.innerHTML = `<b>${duplicateRows.length} member(s)</b> have existing or duplicate Member Codes (shown in <b>RED</b> below). Strictly NO existing member will be overwritten. These entries will be skipped during import.`;
      }
      dupAlert.style.display = 'block';
    } else {
      dupAlert.style.display = 'none';
    }
  }

  if (rCountEl) rCountEl.textContent = mmImportParsedData.length;
  if (theadRow) {
    theadRow.innerHTML = MM_28_COLUMNS.slice(0, 10).map(c => `<th style="padding:6px 8px;white-space:nowrap;">${c}</th>`).join('') +
      `<th style="padding:6px 8px;white-space:nowrap;">Bill Type</th><th style="padding:6px 8px;white-space:nowrap;">Total Bal (₹)</th><th style="padding:6px 8px;white-space:nowrap;">Status</th>`;
  }

  if (tbody) {
    const previewRows = mmImportParsedData.slice(0, 10);
    tbody.innerHTML = previewRows.map((r, idx) => {
      const isDup = !!r.isDuplicate;
      const rowBg = isDup ? '#fef2f2' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc');
      const textCol = isDup ? '#991b1b' : '#1e293b';
      const borderCol = isDup ? 'border-bottom:1px solid #fca5a5;' : 'border-bottom:1px solid #e2e8f0;';

      const statusBadge = isDup
        ? `<span style="background:#fee2e2;color:#dc2626;font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:4px;border:1px solid #f87171;white-space:nowrap;">REJECT (DUPLICATE)</span>`
        : `<span style="background:#f0fdf4;color:#16a34a;font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:4px;border:1px solid #86efac;white-space:nowrap;">VALID (NEW)</span>`;

      return `
        <tr style="${borderCol}background:${rowBg};">
          <td style="padding:5px 8px;font-weight:bold;color:${textCol};">
            ${r.memCode || '—'}
          </td>
          <td style="padding:5px 8px;font-weight:600;color:${textCol};">${r.person1 || '—'}</td>
          <td style="padding:5px 8px;color:${isDup ? '#b91c1c' : '#64748b'};">${r.person2 || '—'}</td>
          <td style="padding:5px 8px;color:${isDup ? '#b91c1c' : '#64748b'};">${r.person3 || '—'}</td>
          <td style="padding:5px 8px;color:${isDup ? '#b91c1c' : '#64748b'};">${r.person4 || '—'}</td>
          <td style="padding:5px 8px;color:${isDup ? '#b91c1c' : '#64748b'};">${r.person5 || '—'}</td>
          <td style="padding:5px 8px;color:${isDup ? '#b91c1c' : '#64748b'};">${r.person6 || '—'}</td>
          <td style="padding:5px 8px;color:${textCol};">${r.type}</td>
          <td style="padding:5px 8px;font-weight:bold;color:${textCol};">${r.flatNo}</td>
          <td style="padding:5px 8px;color:${textCol};">${r.wing}</td>
          <td style="padding:5px 8px;color:${textCol};">${r.billType}</td>
          <td style="padding:5px 8px;text-align:right;font-weight:bold;color:${isDup ? '#dc2626' : '#0f766e'};">₹${(r.totalBalance || 0).toFixed(2)}</td>
          <td style="padding:5px 8px;text-align:center;">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }

  if (prevBox) prevBox.style.display = 'block';
}

// ── Process Bulk Import & Sync With Deduplication ─────────
async function mmProcessMemberBulkImport() {
  if (!mmImportParsedData || mmImportParsedData.length === 0) {
    mmAlert('Please select or drop a valid Excel or CSV file with member data.', true);
    return;
  }

  const btn = document.getElementById('mm-btn-do-import');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split spin"></i> IMPORTING...';
  }

  const payload = {
    societyId: mmGetActiveSocietyId(),
    members: mmImportParsedData
  };

  try {
    const res = await fetch(`${mmApiBase()}/api/members/bulk-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      const summary = data.summary || {};
      const skippedList = data.skippedMembers || [];

      // Close import file upload dialog
      document.getElementById('mm-import-overlay').style.display = 'none';

      // If duplicate members were rejected, show popup listing them
      if (skippedList.length > 0) {
        const rejTbody = document.getElementById('mm-rejection-tbody');
        if (rejTbody) {
          rejTbody.innerHTML = skippedList.map(sm => `
            <tr style="border-bottom:1px solid #fecaca; background:#fff5f5;">
              <td style="padding:6px 10px; font-weight:bold; color:#64748b;">${sm.row || '—'}</td>
              <td style="padding:6px 10px; font-weight:700; color:#dc2626;">${sm.memberCode || '—'}</td>
              <td style="padding:6px 10px; font-weight:600; color:#1e293b;">${sm.memberName || '—'}</td>
              <td style="padding:6px 10px; color:#475569;">${sm.wingFlat || '—'}</td>
              <td style="padding:6px 10px; color:#b91c1c; font-size:10.5px;">${sm.reason || 'Duplicate Member Code'}</td>
            </tr>
          `).join('');
        }
        document.getElementById('mm-import-rejection-modal').style.display = 'flex';
      }

      const msg = `Bulk Import Finished!\n\n` +
        `• Total Rows in File: ${summary.total || mmImportParsedData.length}\n` +
        `• Successfully Inserted (New): ${summary.inserted || 0}\n` +
        `• Skipped (Duplicate Member Codes): ${skippedList.length}`;

      mmAlert(msg);
      mmLoadList();
    } else {
      mmAlert(data.message || 'Import failed on server.', true);
    }
  } catch (err) {
    console.error('Import error:', err);
    mmAlert('Import error: ' + err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill"></i> START IMPORT & SYNC';
    }
  }
}
function mmProcessImportCSV() {
  mmProcessMemberBulkImport();
}

function mmAlterTenantHistory() {
  mmAlert('Tenant history edit mode active.');
}

function mmDeleteTenantHistory() {
  mmConfirm('Delete selected tenant history entry?', (ok) => {
    if (ok) mmAlert('Tenant entry removed.');
  });
}

// ── NOC / Non-Occupancy Dynamic Toggle Logic ──────────────
let mmNocState = 'VACANT';
let mmTenantHistory = [];
let mmLienHistory = [];
let mmSavedNominations = [];
let mmJointOwnerCounter = 0;

async function mmCheckNocConfiguredInBillTypes() {
  const socId = mmGetActiveSocietyId();

  // 1. Check LocalStorage bill types first (instant)
  try {
    const localKey = 'jeevika_bill_types_' + socId;
    let localDataStr = localStorage.getItem(localKey) || localStorage.getItem('jeevika_bill_types_global');
    if (!localDataStr) {
      for (let k in localStorage) {
        if (k.indexOf('jeevika_bill_types_') === 0) {
          localDataStr = localStorage.getItem(k);
          if (localDataStr) break;
        }
      }
    }
    if (localDataStr) {
      const bTypes = JSON.parse(localDataStr);
      for (const tName of Object.keys(bTypes)) {
        const bt = bTypes[tName];
        if (bt && Array.isArray(bt.heads)) {
          for (const h of bt.heads) {
            const code = (h.accCode || h.accountCode || '').trim();
            const name = (h.accName || h.accountName || '').trim();
            if (code || name) {
              const codeUp = code.toUpperCase();
              const nameUp = name.toUpperCase();
              if (codeUp === 'INC-1005' || codeUp === 'A006' ||
                  nameUp.includes('NON OCCUPANCY') || nameUp.includes('NON-OCCUPANCY') || nameUp.includes('NON OCCUPANCY CHARGES') ||
                  codeUp.includes('NOC') || nameUp === 'NOC' || nameUp.includes('N.O.C')) {
                return { configured: true, accCode: code || 'INC-1005', accName: name || 'Non Occupancy Charges', billType: tName };
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error checking local bill types for NOC', e);
  }

  // 2. Query API /api/bill-types & /api/bill-types/{id}
  try {
    const url = socId > 0 ? `${mmApiBase()}/api/bill-types?societyId=${socId}` : `${mmApiBase()}/api/bill-types`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (res.ok) {
      const json = await res.json();
      const list = (json && json.success && Array.isArray(json.data)) ? json.data : [];
      for (const bt of list) {
        if (!bt.billTypeId) continue;
        const dtRes = await fetch(`${mmApiBase()}/api/bill-types/${bt.billTypeId}`, { headers: getAuthHeaders() });
        if (dtRes.ok) {
          const dtJson = await dtRes.json();
          const heads = dtJson.heads || (dtJson.data && dtJson.data.heads) || [];
          if (Array.isArray(heads)) {
            for (const h of heads) {
              const code = (h.accCode || h.MasterCode || h.AccountCode || '').trim();
              const name = (h.accName || h.MasterName || h.AccountName || '').trim();
              if (code || name) {
                const codeUp = code.toUpperCase();
                const nameUp = name.toUpperCase();
                if (codeUp === 'INC-1005' || codeUp === 'A006' ||
                    nameUp.includes('NON OCCUPANCY') || nameUp.includes('NON-OCCUPANCY') || nameUp.includes('NON OCCUPANCY CHARGES') ||
                    codeUp.includes('NOC') || nameUp === 'NOC' || nameUp.includes('N.O.C')) {
                  return { configured: true, accCode: code || 'INC-1005', accName: name || 'Non Occupancy Charges', billType: bt.billTypeName || 'Maintenance' };
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('API bill types NOC check error', e);
  }

  return { configured: false, accCode: '', accName: '', billType: '' };
}

async function mmCheckParkingConfiguredInBillTypes(wheelerType) {
  const is4W = (wheelerType === '4w' || wheelerType === '4-Wheeler' || wheelerType === '4W');
  const socId = mmGetActiveSocietyId();

  // 1. Check LocalStorage bill types
  try {
    const localKey = 'jeevika_bill_types_' + socId;
    let localDataStr = localStorage.getItem(localKey) || localStorage.getItem('jeevika_bill_types_global');
    if (!localDataStr) {
      for (let k in localStorage) {
        if (k.indexOf('jeevika_bill_types_') === 0) {
          localDataStr = localStorage.getItem(k);
          if (localDataStr) break;
        }
      }
    }
    if (localDataStr) {
      const bTypes = JSON.parse(localDataStr);
      for (const tName of Object.keys(bTypes)) {
        const bt = bTypes[tName];
        if (bt && Array.isArray(bt.heads)) {
          for (const h of bt.heads) {
            const code = (h.accCode || h.accountCode || '').trim();
            const name = (h.accName || h.accountName || '').trim();
            if (code || name) {
              const codeUp = code.toUpperCase();
              const nameUp = name.toUpperCase();
              if (is4W) {
                if (codeUp === 'INC-1006' || codeUp === 'A007' ||
                    nameUp.includes('4-WHEELER') || nameUp.includes('4 WHEELER') || nameUp.includes('4W PARKING') ||
                    (nameUp.includes('PARKING') && !nameUp.includes('2-WHEELER') && !nameUp.includes('2 WHEELER') && !nameUp.includes('2W') && !nameUp.includes('TWO WHEELER'))) {
                  return { configured: true, accCode: code || 'INC-1006', accName: name || '4-Wheeler Parking Charges', billType: tName };
                }
              } else {
                if (codeUp === 'INC-1007' ||
                    nameUp.includes('2-WHEELER') || nameUp.includes('2 WHEELER') || nameUp.includes('2W PARKING') || nameUp.includes('TWO WHEELER')) {
                  return { configured: true, accCode: code || 'INC-1007', accName: name || '2-Wheeler Parking Charges', billType: tName };
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error checking local bill types for parking', e);
  }

  // 2. Query API /api/bill-types & /api/bill-types/{id}
  try {
    const url = socId > 0 ? `${mmApiBase()}/api/bill-types?societyId=${socId}` : `${mmApiBase()}/api/bill-types`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (res.ok) {
      const json = await res.json();
      const list = (json && json.success && Array.isArray(json.data)) ? json.data : [];
      for (const bt of list) {
        if (!bt.billTypeId) continue;
        const dtRes = await fetch(`${mmApiBase()}/api/bill-types/${bt.billTypeId}`, { headers: getAuthHeaders() });
        if (dtRes.ok) {
          const dtJson = await dtRes.json();
          const heads = dtJson.heads || (dtJson.data && dtJson.data.heads) || [];
          if (Array.isArray(heads)) {
            for (const h of heads) {
              const code = (h.accCode || h.MasterCode || h.AccountCode || '').trim();
              const name = (h.accName || h.MasterName || h.AccountName || '').trim();
              if (code || name) {
                const codeUp = code.toUpperCase();
                const nameUp = name.toUpperCase();
                if (is4W) {
                  if (codeUp === 'INC-1006' || codeUp === 'A007' ||
                      nameUp.includes('4-WHEELER') || nameUp.includes('4 WHEELER') || nameUp.includes('4W PARKING') ||
                      (nameUp.includes('PARKING') && !nameUp.includes('2-WHEELER') && !nameUp.includes('2 WHEELER') && !nameUp.includes('2W') && !nameUp.includes('TWO WHEELER'))) {
                    return { configured: true, accCode: code || 'INC-1006', accName: name || '4-Wheeler Parking Charges', billType: bt.billTypeName || 'Maintenance' };
                  }
                } else {
                  if (codeUp === 'INC-1007' ||
                      nameUp.includes('2-WHEELER') || nameUp.includes('2 WHEELER') || nameUp.includes('2W PARKING') || nameUp.includes('TWO WHEELER')) {
                    return { configured: true, accCode: code || 'INC-1007', accName: name || '2-Wheeler Parking Charges', billType: bt.billTypeName || 'Maintenance' };
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('API bill types parking check error', e);
  }

  return { configured: false, accCode: '', accName: '', billType: '' };
}

async function mmOnParkingChargeInput(input, wheelerType) {
  const is4W = (wheelerType === '4w' || wheelerType === '4-Wheeler' || wheelerType === '4W');
  const check = await mmCheckParkingConfiguredInBillTypes(is4W ? '4w' : '2w');
  if (!check.configured) {
    input.value = '0';
    if (typeof mmCalcParkingTotals === 'function') await mmCalcParkingTotals();
    const label = is4W ? '4-Wheeler Parking' : '2-Wheeler Parking';
    if (typeof mmAlert === 'function') {
      mmAlert(`Cannot enter charges: ${label} account is not selected in any Bill Type under Bill Type & Notes Master.<br><br>Please select the ${label} ledger in Bill Type Master first.`, true);
    } else {
      alert(`Cannot enter charges: ${label} account is not selected in any Bill Type under Bill Type & Notes Master. Please select the ${label} ledger in Bill Type Master first.`);
    }
    return;
  }

  if (typeof mmCalcParkingTotals === 'function') await mmCalcParkingTotals();
  mmSyncParkingToMatrixAndBreakup();
}

function mmSyncParkingToMatrixAndBreakup() {
  const total4W = parseFloat(val('mm-park4-total')) || 0;
  const total2W = parseFloat(val('mm-park2-total')) || 0;

  // 1. Update in mmCurrentBreakupData if active
  if (typeof mmCurrentBreakupData !== 'undefined' && mmCurrentBreakupData && Array.isArray(mmCurrentBreakupData.heads)) {
    const head4W = mmCurrentBreakupData.heads.find(h =>
      (h.accCode && (h.accCode.toUpperCase() === 'INC-1006' || h.accCode.toUpperCase() === 'A007')) ||
      (h.accName && (h.accName.toUpperCase().includes('4-WHEELER') || h.accName.toUpperCase().includes('4 WHEELER') || (h.accName.toUpperCase().includes('PARKING') && !h.accName.toUpperCase().includes('2-WHEELER') && !h.accName.toUpperCase().includes('2 WHEELER') && !h.accName.toUpperCase().includes('2W'))))
    );
    if (head4W) head4W.amount = total4W;

    const head2W = mmCurrentBreakupData.heads.find(h =>
      (h.accCode && h.accCode.toUpperCase() === 'INC-1007') ||
      (h.accName && (h.accName.toUpperCase().includes('2-WHEELER') || h.accName.toUpperCase().includes('2 WHEELER') || h.accName.toUpperCase().includes('TWO WHEELER') || h.accName.toUpperCase().includes('2W')))
    );
    if (head2W) head2W.amount = total2W;

    const inp4W = document.querySelector('.mm-bb-amt-input[data-is-park4="1"]');
    if (inp4W) inp4W.value = total4W.toFixed(2);

    const inp2W = document.querySelector('.mm-bb-amt-input[data-is-park2="1"]');
    if (inp2W) inp2W.value = total2W.toFixed(2);

    if (typeof mmCalcBreakupTotal === 'function') mmCalcBreakupTotal();
    if (!inp4W && !inp2W && typeof mmRenderBreakupTable === 'function') mmRenderBreakupTable();
  }

  // 2. Sync to LocalStorage Matrix Cache
  try {
    const memberId = mmEditId || mmSelectedId;
    if (!memberId) return;
    const socId = mmGetActiveSocietyId();
    const currentMem = mmList.find(x => (x.socMemId || x.memberId || x.MemberId) === memberId);
    const currentMemId = currentMem ? (currentMem.socMemId || currentMem.memberId || currentMem.MemberId || memberId) : memberId;
    const memCode = currentMem ? (currentMem.memCode || currentMem.flatNo || '') : '';
    const flatNo = currentMem ? (currentMem.flatNo || '') : '';
    const memName = currentMem ? (currentMem.memName || '') : '';
    const wing = currentMem ? (currentMem.wing || '') : '';
    const sqft = currentMem ? (currentMem.areaSqft || currentMem.sqft || 0) : 0;

    const btName = 'Maintenance';
    const localKeys = [`jeevika_bm_matrix_${socId}_${btName}`, `jeevika_bm_matrix_1_${btName}`];

    localKeys.forEach(k => {
      let matrixList = [];
      try {
        const raw = localStorage.getItem(k);
        if (raw) matrixList = JSON.parse(raw);
      } catch (e) { }
      if (!Array.isArray(matrixList)) matrixList = [];

      const existingIdx = matrixList.findIndex(r => {
        const rId = r.memberId || r.MemberId || r.id || 0;
        const rMemNo = (r.memNo || r.MemNo || '').trim().toLowerCase();
        const rFlat = (r.flatNo || r.FlatNo || '').trim().toLowerCase();
        return (currentMemId > 0 && rId === currentMemId) ||
               (flatNo && (rMemNo === flatNo.toLowerCase() || rFlat === flatNo.toLowerCase())) ||
               (memCode && rMemNo === memCode.toLowerCase());
      });

      if (existingIdx >= 0) {
        if (!matrixList[existingIdx].amounts) matrixList[existingIdx].amounts = {};
        matrixList[existingIdx].amounts['INC-1006'] = total4W;
        matrixList[existingIdx].amounts['4-Wheeler Parking Charges'] = total4W;
        matrixList[existingIdx].amounts['INC-1007'] = total2W;
        matrixList[existingIdx].amounts['2-Wheeler Parking Charges'] = total2W;
      } else {
        matrixList.push({
          memberId: currentMemId,
          memNo: flatNo || memCode,
          flatNo: flatNo,
          wing: wing,
          name: memName,
          sqft: sqft,
          amounts: {
            'INC-1006': total4W,
            '4-Wheeler Parking Charges': total4W,
            'INC-1007': total2W,
            '2-Wheeler Parking Charges': total2W
          },
          checked: false
        });
      }
      localStorage.setItem(k, JSON.stringify(matrixList));
    });
  } catch (e) {
    console.warn('Error syncing parking to matrix cache', e);
  }
}

function mmGetParkingAmountFromMatrix(memberId, flatNo, memCode, wheelerType) {
  const is4W = (wheelerType === '4w' || wheelerType === '4-Wheeler' || wheelerType === '4W');
  try {
    const socId = mmGetActiveSocietyId();
    const localKeys = [`jeevika_bm_matrix_${socId}_Maintenance`, `jeevika_bm_matrix_1_Maintenance`];
    for (const k of localKeys) {
      const raw = localStorage.getItem(k);
      if (raw) {
        const matrixList = JSON.parse(raw);
        if (Array.isArray(matrixList)) {
          const row = matrixList.find(r => {
            const rId = r.memberId || r.MemberId || r.id || 0;
            const rMemNo = (r.memNo || r.MemNo || '').trim().toLowerCase();
            const rFlat = (r.flatNo || r.FlatNo || '').trim().toLowerCase();
            return (memberId > 0 && rId === memberId) ||
                   (flatNo && (rMemNo === flatNo.toLowerCase() || rFlat === flatNo.toLowerCase())) ||
                   (memCode && rMemNo === memCode.toLowerCase());
          });
          if (row && row.amounts) {
            for (const key of Object.keys(row.amounts)) {
              const kUp = key.trim().toUpperCase();
              if (is4W) {
                if (kUp === 'INC-1006' || kUp === 'A007' || kUp.includes('4-WHEELER') || kUp.includes('4 WHEELER') || (kUp.includes('PARKING') && !kUp.includes('2-WHEELER') && !kUp.includes('2W') && !kUp.includes('TWO WHEELER'))) {
                  const amt = parseFloat(row.amounts[key]) || 0;
                  if (amt > 0) return amt;
                }
              } else {
                if (kUp === 'INC-1007' || kUp.includes('2-WHEELER') || kUp.includes('2 WHEELER') || kUp.includes('TWO WHEELER') || kUp.includes('2W')) {
                  const amt = parseFloat(row.amounts[key]) || 0;
                  if (amt > 0) return amt;
                }
              }
            }
          }
        }
      }
    }
  } catch (e) { }
  return 0;
}

async function mmToggleNocStatus() {
  const badge = document.getElementById('mm-nonocc-status-badge');
  const btn = document.getElementById('mm-nonocc-btn-toggle');
  const form = document.getElementById('mm-tenant-form-container');

  if (mmNocState === 'VACANT') {
    // Validate that NOC is configured in Bill Type & Notes Master
    const check = await mmCheckNocConfiguredInBillTypes();
    if (!check.configured) {
      if (typeof mmAlert === 'function') {
        mmAlert('Cannot assign tenant: Non-Occupancy Charges (NOC) account is not selected in any Bill Type in Bill Type & Notes Master.<br><br>Please select the NOC ledger in Bill Type Master first.', true);
      } else {
        alert('Cannot assign tenant: Non-Occupancy Charges (NOC) account is not selected in any Bill Type in Bill Type & Notes Master. Please select the NOC ledger in Bill Type Master first.');
      }
      return;
    }

    if (check.accCode) {
      setVal('mm-noc-code', check.accCode);
    }

    // Switch to OCCUPIED
    mmNocState = 'OCCUPIED';
    if (badge) {
      badge.textContent = 'OCCUPIED';
      badge.style.background = '#15803d'; // Green
    }
    if (btn) {
      btn.textContent = 'LEAVE / MARK VACANT';
      btn.style.color = '#dc2626';
    }
    if (form) form.style.display = 'flex';
  } else {
    // Leaving / Mark Vacant -> Archive active tenant to history table
    const tenantName = val('mm-tenant-name').trim();
    const periodFrom = val('mm-nonocc-period-from');
    const periodTo = val('mm-nonocc-period-to');
    const mobile = val('mm-tenant-contact').trim();
    const assign = val('mm-nonocc-agreement-assign').trim();
    const agreeVer = val('mm-noc-agree-verify');
    const aadharVer = val('mm-noc-aadhar-verify');
    const policeVer = val('mm-noc-police-verify');

    if (tenantName) {
      const timePeriod = (periodFrom || periodTo) ? `${periodFrom} to ${periodTo}` : 'Active Lease';
      mmTenantHistory.push({
        srNo: mmTenantHistory.length + 1,
        tenantName,
        timePeriod,
        mobile: mobile || '—',
        assign: assign || '—',
        agreeVer: agreeVer === 'YES' ? '✔ Uploaded' : 'No',
        aadharVer: aadharVer === 'YES' ? '✔ Uploaded' : 'No',
        policeVer: policeVer === 'YES' ? '✔ Verified' : 'No'
      });
      mmRenderTenantHistory();
    }

    // Switch back to VACANT
    mmNocState = 'VACANT';
    if (badge) {
      badge.textContent = 'VACANT';
      badge.style.background = '#dc2626'; // Red
    }
    if (btn) {
      btn.textContent = 'ASSIGN TENANT (OCCUPIED)';
      btn.style.color = '#1565C0';
    }
    if (form) form.style.display = 'none';

    // Clear form inputs
    setVal('mm-tenant-name', '');
    setVal('mm-nonocc-charges', '0');
    if (typeof mmSyncNocToMatrixCache === 'function') {
      mmSyncNocToMatrixCache(0);
    }
    if (typeof mmCurrentBreakupData !== 'undefined' && mmCurrentBreakupData && Array.isArray(mmCurrentBreakupData.heads)) {
      const nocHead = mmCurrentBreakupData.heads.find(h =>
        (h.accCode && (h.accCode.toUpperCase() === 'INC-1005' || h.accCode.toUpperCase() === 'A006')) ||
        (h.accName && (/non\s*[-]?\s*occupancy|\bnoc\b/i.test(h.accName))) ||
        (h.accCode && (/non\s*[-]?\s*occupancy|\bnoc\b/i.test(h.accCode)))
      );
      if (nocHead) {
        nocHead.amount = 0;
        if (typeof mmRenderBreakupTable === 'function') mmRenderBreakupTable();
      }
    }
    setVal('mm-nonocc-members-count', '');
    setVal('mm-tenant-contact', '');
    setVal('mm-nonocc-family-names', '');
    setVal('mm-nonocc-phone2', '');
    setVal('mm-nonocc-agreement-assign', '');
    setVal('mm-nonocc-period-from', '');
    setVal('mm-nonocc-period-to', '');
  }
}

function mmRenderTenantHistory() {
  const tbody = document.getElementById('mm-tenant-history-tbody');
  if (!tbody) return;

  if (mmTenantHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:14px;color:#94a3b8;">No lease history recorded.</td></tr>`;
    return;
  }

  let html = '';
  mmTenantHistory.forEach((t, i) => {
    html += `
      <tr>
        <td style="text-align:center;font-weight:bold;">${i + 1}</td>
        <td><b>${t.tenantName}</b></td>
        <td>${t.timePeriod}</td>
        <td>${t.mobile}</td>
        <td>${t.assign}</td>
        <td style="text-align:center;">${t.agreeVer}</td>
        <td style="text-align:center;">${t.aadharVer}</td>
        <td style="text-align:center;">${t.policeVer}</td>
      </tr>`;
  });
  tbody.innerHTML = html;
}

// ── Lien Archiving Logic ──────────────────────────────────
function mmArchiveCurrentLien() {
  const bankName = val('mm-lien-bank-name').trim();
  const bankAddr = val('mm-lien-bank-addr').trim();
  const loanAmt = val('mm-lien-amt-val');
  const period = val('mm-lien-period').trim();
  const meetingDate = val('mm-lien-meeting-date');
  const resNo = val('mm-lien-res-no').trim();
  const sanctionDate = val('mm-lien-sanction-date');
  const nocDate = val('mm-lien-noc-date');
  const cancelDate = val('mm-lien-cancel-date');

  if (!bankName && (!loanAmt || loanAmt === '0')) {
    mmAlert('Please enter Bank Name or Loan Amount to archive lien.', true);
    return;
  }

  mmLienHistory.push({
    srNo: mmLienHistory.length + 1,
    bankName: bankName || 'Bank Loan',
    loanAmt: parseFloat(loanAmt) || 0,
    period: period || '—',
    meetingDate: meetingDate || '—',
    resNo: resNo || '—',
    nocDate: nocDate || '—',
    cancelDate: cancelDate || '—'
  });

  mmRenderLienHistory();

  // Clear top form
  setVal('mm-lien-bank-name', '');
  setVal('mm-lien-bank-addr', '');
  setVal('mm-lien-amt-val', '0');
  setVal('mm-lien-period', '');
  setVal('mm-lien-meeting-date', '');
  setVal('mm-lien-res-no', '');
  setVal('mm-lien-sanction-date', '');
  setVal('mm-lien-noc-date', '');
  setVal('mm-lien-cancel-date', '');

  mmAlert('Current lien archived to past history roster successfully!');
}

function mmRenderLienHistory() {
  const tbody = document.getElementById('mm-lien-history-tbody');
  if (!tbody) return;

  if (mmLienHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:14px;color:#94a3b8;">No lien history recorded.</td></tr>`;
    return;
  }

  let html = '';
  mmLienHistory.forEach((l, i) => {
    html += `
      <tr>
        <td style="text-align:center;font-weight:bold;">${i + 1}</td>
        <td><b>${l.bankName}</b></td>
        <td style="text-align:right;">₹ ${l.loanAmt.toFixed(2)}</td>
        <td>${l.period}</td>
        <td>${l.meetingDate}</td>
        <td>${l.resNo}</td>
        <td>${l.nocDate}</td>
        <td>${l.cancelDate}</td>
        <td style="text-align:center;"><span style="color:#1565C0;cursor:pointer;"><i class="bi bi-file-earmark-pdf"></i> View</span></td>
      </tr>`;
  });
  tbody.innerHTML = html;
}

// ── Share Cert. Old Data Toggle & Joint Owners ───────────
function mmToggleOldShareCert(status) {
  const body = document.getElementById('mm-old-sc-body');
  if (!body) return;
  if (status === 'ON') {
    body.style.display = 'flex';
  } else {
    body.style.display = 'none';
  }
}

function mmAddJointOwnerBlock() {
  const container = document.getElementById('mm-joint-owners-container');
  if (!container) return;
  mmJointOwnerCounter++;

  const box = document.createElement('div');
  box.className = 'mm-joint-owner-box';
  box.style.cssText = 'border:1px solid #cbd5e1;background:#f8fafc;padding:8px;border-radius:4px;display:flex;flex-direction:column;gap:6px;';
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #cbd5e1;padding-bottom:4px;">
      <span style="font-weight:bold;color:#1e293b;font-size:11px;">${mmJointOwnerCounter} Owner Name</span>
      <button type="button" class="mm-btn mm-btn-danger" style="height:20px;padding:0 6px;font-size:10px;" onclick="this.closest('.mm-joint-owner-box').remove()"><i class="bi bi-trash"></i> DELETE</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
      <input type="text" class="mm-input" placeholder="Joint Owner 1">
      <input type="text" class="mm-input" placeholder="Joint Owner 2">
      <input type="text" class="mm-input" placeholder="Joint Owner 3">
      <input type="text" class="mm-input" placeholder="Joint Owner 4">
    </div>`;
  container.appendChild(box);
}

// ── Nominee Info Save Logic ───────────────────────────────
function mmSaveNomination() {
  const rcvDate = val('mm-nom-rcv-date');
  const meetingType = val('mm-nom-meeting-type');
  const meetingDate = val('mm-nom-meeting-date');
  const resNo = val('mm-nom-resno').trim();
  const address = val('mm-nom-addr').trim();

  const rows = document.querySelectorAll('#mm-active-nominees-tbody tr');
  const nomineeList = [];

  rows.forEach(tr => {
    const nameInput = tr.querySelector('.mm-nom-name');
    const relInput = tr.querySelector('.mm-nom-rel');
    const pctInput = tr.querySelector('.mm-nom-pct');
    if (nameInput && nameInput.value.trim()) {
      nomineeList.push({
        name: nameInput.value.trim(),
        rel: relInput ? relInput.value.trim() : '',
        pct: pctInput ? pctInput.value : '100'
      });
    }
  });

  if (nomineeList.length === 0) {
    mmAlert('Please enter at least one Nominee Name in the active nominees list.', true);
    return;
  }

  const nomineeSummary = nomineeList.map(n => `${n.name} (${n.rel || 'Nominee'} - ${n.pct}%)`).join(', ');

  mmSavedNominations.push({
    srNo: mmSavedNominations.length + 1,
    rcvDate: rcvDate || '—',
    meetingType: meetingType || 'MCM',
    meetingDate: meetingDate || '—',
    resNo: resNo || '—',
    details: nomineeSummary
  });

  mmRenderSavedNominations();

  // Clear top forms
  setVal('mm-nom-rcv-date', '');
  setVal('mm-nom-meeting-type', '');
  setVal('mm-nom-meeting-date', '');
  setVal('mm-nom-mem-regno', '');
  setVal('mm-nom-resno', '');
  setVal('mm-nom-addr', '');

  // Reset active nominee table
  const tbody = document.getElementById('mm-active-nominees-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td style="text-align:center;font-weight:bold;">1</td>
        <td><input type="text" class="mm-input mm-nom-name" style="width:100%;" placeholder="Name of Nominee..."></td>
        <td><input type="text" class="mm-input mm-nom-rel" style="width:100%;" placeholder="Relationship..."></td>
        <td><input type="number" class="mm-input mm-nom-pct" style="width:100%;text-align:right;" value="0"></td>
        <td><input type="date" class="mm-input mm-nom-dob" style="width:100%;"></td>
        <td>
          <select class="mm-select mm-nom-major" style="width:100%;">
            <option value="Major">Major</option>
            <option value="Minor">Minor</option>
          </select>
        </td>
        <td style="text-align:center;">
          <button type="button" class="mm-btn mm-btn-danger" style="height:22px;padding:0 6px;" onclick="this.closest('tr').remove()"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
  }

  mmAlert('Nomination form saved to database successfully!');
}

function mmRenderSavedNominations() {
  const tbody = document.getElementById('mm-saved-nom-tbody');
  if (!tbody) return;

  if (mmSavedNominations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:14px;color:#94a3b8;">No saved nominations.</td></tr>`;
    return;
  }

  let html = '';
  mmSavedNominations.forEach((n, i) => {
    html += `
      <tr>
        <td style="text-align:center;font-weight:bold;">${i + 1}</td>
        <td>${n.rcvDate}</td>
        <td>${n.meetingType}</td>
        <td>${n.meetingDate}</td>
        <td>${n.resNo}</td>
        <td><b>${n.details}</b></td>
        <td style="text-align:center;"><span style="color:#1565C0;cursor:pointer;"><i class="bi bi-eye"></i> View</span></td>
        <td style="text-align:center;">
          <button type="button" class="mm-btn mm-btn-danger" style="height:20px;padding:0 4px;" onclick="mmSavedNominations.splice(${i},1);mmRenderSavedNominations()"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
  });
  tbody.innerHTML = html;
}

// ── Lien Document Upload & Actions ────────────────────────
let mmLienDocs = {
  sanction: null,
  noc: null,
  cancel: null
};

function mmTriggerLienDocUpload(docType) {
  const fileInput = document.getElementById(`mm-lien-${docType}-file`);
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

function mmHandleLienDocUpload(docType, input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    mmLienDocs[docType] = {
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.type,
      dataUrl: e.target.result
    };

    const btn = document.getElementById(`mm-lien-${docType}-btn`);
    const btnText = document.getElementById(`mm-lien-${docType}-btn-text`);
    const actionsWrap = document.getElementById(`mm-lien-${docType}-actions`);
    const nameEl = document.getElementById(`mm-lien-${docType}-filename`);

    if (btnText) btnText.textContent = file.name;
    if (btn) {
      btn.style.background = '#f0fdf4';
      btn.style.borderColor = '#86efac';
      btn.style.color = '#15803d';
    }
    if (nameEl) nameEl.textContent = file.name;
    if (actionsWrap) actionsWrap.style.display = 'inline-flex';
    mmShowToast(`Lien document "${file.name}" attached.`);
  };
  reader.readAsDataURL(file);
}

function mmPreviewLienDoc(docType) {
  const doc = mmLienDocs[docType];
  if (!doc || !doc.dataUrl) {
    mmAlert('No document uploaded to preview.', true);
    return;
  }

  const modal = document.getElementById('mm-rc-preview-modal');
  const titleEl = document.getElementById('mm-rc-preview-title');
  const bodyEl = document.getElementById('mm-rc-preview-body');

  const titles = {
    sanction: 'BANK SANCTION LETTER',
    noc: 'DATE OF NOC BY SOCIETY',
    cancel: 'DATE OF LIEN CANCELLATION'
  };

  if (titleEl) titleEl.innerHTML = `<i class="bi bi-file-earmark-medical"></i> ${titles[docType] || 'LIEN DOCUMENT'} — ${doc.name}`;

  if (bodyEl) {
    if (doc.type && doc.type.includes('pdf')) {
      bodyEl.innerHTML = `<iframe src="${doc.dataUrl}" style="width:100%;height:550px;border:none;border-radius:4px;"></iframe>`;
    } else {
      bodyEl.innerHTML = `<img src="${doc.dataUrl}" alt="Doc Preview" style="max-width:100%;max-height:550px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;">`;
    }
  }

  if (modal) modal.style.display = 'flex';
}

function mmDownloadLienDoc(docType) {
  const doc = mmLienDocs[docType];
  if (!doc || !doc.dataUrl) {
    mmAlert('No document available to download.', true);
    return;
  }
  const a = document.createElement('a');
  a.href = doc.dataUrl;
  a.download = doc.name || `${docType}_lien_doc.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function mmDeleteLienDoc(docType) {
  mmConfirm('Are you sure you want to remove this lien document?', (ok) => {
    if (!ok) return;
    mmLienDocs[docType] = null;
    const fileInput = document.getElementById(`mm-lien-${docType}-file`);
    const btn = document.getElementById(`mm-lien-${docType}-btn`);
    const btnText = document.getElementById(`mm-lien-${docType}-btn-text`);
    const actionsWrap = document.getElementById(`mm-lien-${docType}-actions`);

    if (fileInput) fileInput.value = '';
    if (btnText) btnText.textContent = 'UPLOAD';
    if (btn) {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
    if (actionsWrap) actionsWrap.style.display = 'none';
    mmShowToast('Lien document removed.');
  });
}

function mmDeleteLienHistory() {
  if (mmLienHistory.length === 0) {
    mmAlert('No lien history records to delete.', true);
    return;
  }
  mmConfirm('Delete all past lien mark history records?', (ok) => {
    if (!ok) return;
    mmLienHistory = [];
    mmRenderLienHistory();
    mmShowToast('Lien history cleared.');
  });
}

// ── Nominee Document Upload & Actions ─────────────────────
let mmNomineeDoc = null;

function mmTriggerNomineeDocUpload() {
  const fileInput = document.getElementById('mm-nom-doc-file');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

function mmHandleNomineeDocUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    mmNomineeDoc = {
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.type,
      dataUrl: e.target.result
    };

    const btn = document.getElementById('mm-nom-doc-btn');
    const btnText = document.getElementById('mm-nom-doc-btn-text');
    const actionsWrap = document.getElementById('mm-nom-doc-actions');
    const nameEl = document.getElementById('mm-nom-doc-filename');

    if (btnText) btnText.textContent = file.name;
    if (btn) {
      btn.style.background = '#f0fdf4';
      btn.style.borderColor = '#86efac';
      btn.style.color = '#15803d';
    }
    if (nameEl) nameEl.textContent = file.name;
    if (actionsWrap) actionsWrap.style.display = 'inline-flex';
    mmShowToast(`Nominee form "${file.name}" attached.`);
  };
  reader.readAsDataURL(file);
}

function mmPreviewNomineeDoc() {
  if (!mmNomineeDoc || !mmNomineeDoc.dataUrl) {
    mmAlert('No nominee form uploaded to preview.', true);
    return;
  }

  const modal = document.getElementById('mm-rc-preview-modal');
  const titleEl = document.getElementById('mm-rc-preview-title');
  const bodyEl = document.getElementById('mm-rc-preview-body');

  if (titleEl) titleEl.innerHTML = `<i class="bi bi-file-earmark-medical"></i> NOMINEE FORM — ${mmNomineeDoc.name}`;

  if (bodyEl) {
    if (mmNomineeDoc.type && mmNomineeDoc.type.includes('pdf')) {
      bodyEl.innerHTML = `<iframe src="${mmNomineeDoc.dataUrl}" style="width:100%;height:550px;border:none;border-radius:4px;"></iframe>`;
    } else {
      bodyEl.innerHTML = `<img src="${mmNomineeDoc.dataUrl}" alt="Doc Preview" style="max-width:100%;max-height:550px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;">`;
    }
  }

  if (modal) modal.style.display = 'flex';
}

function mmDownloadNomineeDoc() {
  if (!mmNomineeDoc || !mmNomineeDoc.dataUrl) {
    mmAlert('No nominee form available to download.', true);
    return;
  }
  const a = document.createElement('a');
  a.href = mmNomineeDoc.dataUrl;
  a.download = mmNomineeDoc.name || 'nominee_form.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function mmDeleteNomineeDoc() {
  mmConfirm('Are you sure you want to remove the nominee form document?', (ok) => {
    if (!ok) return;
    mmNomineeDoc = null;
    const fileInput = document.getElementById('mm-nom-doc-file');
    const btn = document.getElementById('mm-nom-doc-btn');
    const btnText = document.getElementById('mm-nom-doc-btn-text');
    const actionsWrap = document.getElementById('mm-nom-doc-actions');

    if (fileInput) fileInput.value = '';
    if (btnText) btnText.textContent = 'UPLOAD';
    if (btn) {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
    if (actionsWrap) actionsWrap.style.display = 'none';
    mmShowToast('Nominee form removed.');
  });
}

// Expose functions for inline HTML calls
window.mmAdd = mmAdd;
window.mmAlter = mmAlter;
window.mmDelete = mmDelete;
window.mmSave = mmSave;
window.mmShowList = mmShowList;
window.mmToggleSearch = mmToggleSearch;
window.mmToggleMultiDelete = mmToggleMultiDelete;
window.mmToggleAll = mmToggleAll;
window.mmChk = mmChk;
window.mmCloseAlert = mmCloseAlert;
window.mmCloseConfirm = mmCloseConfirm;
window.mmPrint = mmPrint;
window.mmExportExcel = mmExportExcel;
window.mmExit = mmExit;
window.mmRenderList = mmRenderList;
window.mmSelectRow = mmSelectRow;
window.mmAlterById = mmAlterById;
window.mmSwitchTab = mmSwitchTab;
window.mmOnTransferToggleChange = mmOnTransferToggleChange;
window.mmToggleNocStatus = mmToggleNocStatus;
window.mmToggleNocDocWrap = mmToggleNocDocWrap;
window.mmToggleAdditionalInfo = mmToggleAdditionalInfo;
window.mmAddAdditionalRow = mmAddAdditionalRow;
window.mmHandleDocFile = mmHandleDocFile;
window.mmCalcTotalBal = mmCalcTotalBal;
window.mmCalcParkingTotals = mmCalcParkingTotals;
window.mmCalcShareCertValues = mmCalcShareCertValues;
window.mmAddActiveNomineeRow = mmAddActiveNomineeRow;
window.mmExecuteMemberTransfer = mmExecuteMemberTransfer;
window.mmShowStatement = mmShowStatement;
window.mmCloseDetail = mmCloseDetail;
window.mmPrintDetail = mmPrintDetail;
window.mmOpenBulkReassign = mmOpenBulkReassign;
window.mmApplyBulkReassign = mmApplyBulkReassign;
window.mmOpenImportCSV = mmOpenImportCSV;
window.mmProcessImportCSV = mmProcessImportCSV;
window.mmAlterTenantHistory = mmAlterTenantHistory;
window.mmDeleteTenantHistory = mmDeleteTenantHistory;
window.mmArchiveCurrentLien = mmArchiveCurrentLien;
window.mmToggleOldShareCert = mmToggleOldShareCert;
window.mmAddJointOwnerBlock = mmAddJointOwnerBlock;
// ── Transfer Log Preview & Docs Functions ────────────────────
let mmTransferLogs = [];

async function mmLoadTransferHistoryLog(memberId) {
  const tbody = document.getElementById('mm-transfer-log-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:20px;color:#808080;">
    <i class="bi bi-hourglass-split"></i> Loading transfer logs...</td></tr>`;

  try {
    const res = await fetch(`${mmApiBase()}/api/members/${memberId}/transfers`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load transfers');
    const json = await res.json();
    mmTransferLogs = (json && json.success && Array.isArray(json.data)) ? json.data : [];

    if (mmTransferLogs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:20px;color:#94a3b8;">No transfer history recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = mmTransferLogs.map((log, idx) => {
      const date = log.transferDate || '—';
      const type = log.transferType || 'Sell';
      const mType = log.meetingType || 'AGM: ANNUAL GENERAL BODY MEETING';
      const mDate = log.meetingDate || date;
      const resNo = log.resolutionNo || '12';
      const transNo = log.transferNo || '5';
      const regTransferor = log.regNoTransferor || '—';
      const regTransferee = log.regNoTransferee || '—';
      const assign = log.agreementAssign || '—';
      const transferor = log.transferorName || '—';
      const transferee = log.transfereeName || '—';
      const remarks = log.remarks || '—';

      return `<tr>
        <td style="font-weight:bold;">${date}</td>
        <td><span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;font-weight:bold;font-size:11px;">${type}</span></td>
        <td>${mType}</td>
        <td>${mDate}</td>
        <td style="text-align:center;font-weight:bold;">${resNo}</td>
        <td style="text-align:center;font-weight:bold;">${transNo}</td>
        <td>${regTransferor}</td>
        <td>${regTransferee}</td>
        <td>${assign}</td>
        <td style="font-weight:bold;color:#1e3a8a;">${transferor}</td>
        <td style="font-weight:bold;color:#15803d;">${transferee}</td>
        <td>${remarks}</td>
        <td style="text-align:center;">
          <button type="button" class="mm-btn" style="background:#ffffff;border:1px solid #cbd5e1;color:#1e40af;font-weight:bold;padding:3px 10px;font-size:11px;" onclick="mmOpenTransferPreview(${idx})">
            <i class="bi bi-eye"></i> PREVIEW
          </button>
        </td>
        <td style="text-align:center;">
          <button type="button" class="mm-btn" style="background:#ffffff;border:1px solid #cbd5e1;color:#334155;font-weight:bold;padding:3px 10px;font-size:11px;" onclick="mmOpenTransferDocs(${idx})">
            <i class="bi bi-file-earmark-arrow-down"></i> DOCS
          </button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.warn('Error loading transfer history', e);
    tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:20px;color:#dc2626;">Error loading transfer logs.</td></tr>`;
  }
}

function mmOpenTransferPreview(idx) {
  const log = mmTransferLogs[idx];
  if (!log) return;

  const tName = log.transferorName || 'OLD MEMBER';
  const nameEl = document.getElementById('mm-prev-member-name');
  if (nameEl) nameEl.textContent = tName.toUpperCase();

  let snap = {};
  try {
    snap = typeof log.snapshot === 'string' ? JSON.parse(log.snapshot) : (log.snapshot || {});
  } catch { snap = {}; }

  const bodyEl = document.getElementById('mm-transfer-preview-body');
  if (!bodyEl) return;

  bodyEl.innerHTML = `
    <div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:4px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);display:flex;flex-direction:column;gap:16px;">
      
      <div style="text-align:center;border-bottom:2px solid #000080;padding-bottom:10px;">
        <h2 style="margin:0;color:#000080;font-size:18px;font-weight:bold;">MEMBER PROFILE FORM (HISTORICAL RECORD)</h2>
        <span style="font-size:12px;color:#475569;font-weight:bold;">Prior to Transfer Date: ${log.transferDate || '—'}</span>
      </div>

      <!-- 1. BASIC DETAILS -->
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div style="background:#000080;color:#ffffff;padding:6px 12px;font-weight:bold;font-size:12px;">1. BASIC DETAILS</div>
        <div style="padding:12px;display:grid;grid-template-columns:repeat(4, 1fr);gap:10px 16px;font-size:12px;">
          <div><b>Member Code:</b> ${snap.memCode || 'D-101'}</div>
          <div><b>Building:</b> ${snap.building || snap.bldg || 'Gokul Dham'}</div>
          <div><b>Wing:</b> ${snap.wing || 'D'}</div>
          <div><b>Flat/Unit No:</b> ${snap.flatNo || '101'}</div>
          <div><b>Floor:</b> ${snap.floor || '1'}</div>
          <div><b>Unit Type:</b> ${snap.flatType || 'Residential'}</div>
          <div><b>Area (Sqft):</b> ${snap.areaSqft || snap.sqft || 0} Sq. Ft</div>
          <div><b>Area Category:</b> Build up</div>
          <div style="grid-column:span 4;border-top:1px dashed #cbd5e1;padding-top:8px;">
            <b>Owners Registered:</b><br>
            1. Owner 1: ${snap.memName || tName}<br>
            2. Owner 2: ${snap.memName2 || '—'}<br>
            3. Owner 3: ${snap.memName3 || '—'}<br>
            4. Owner 4: ${snap.memName4 || '—'}<br>
            5. Owner 5: ${snap.memName5 || '—'}<br>
            6. Owner 6: ${snap.memName6 || '—'}
          </div>
          <div style="grid-column:span 4;border-top:1px dashed #cbd5e1;padding-top:8px;display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;">
            <div><b>Mobile 1:</b> ${snap.contactNo || snap.memMobile || '9876543219'}</div>
            <div><b>Mobile 2:</b> —</div>
            <div><b>Email 1:</b> ${snap.email || snap.memEmail || '—'}</div>
            <div><b>Email 2:</b> —</div>
            <div><b>GSTIN:</b> —</div>
            <div><b>Bank Name:</b> PNB</div>
            <div><b>Account No:</b> —</div>
            <div><b>IFSC Code:</b> —</div>
          </div>
          <div style="grid-column:span 4;border-top:1px dashed #cbd5e1;padding-top:8px;display:flex;gap:30px;">
            <div><b>Opening Principal:</b> ₹ ${(parseFloat(snap.opPrincipal) || 0).toFixed(2)}</div>
            <div><b>Opening Interest:</b> ₹ ${(parseFloat(snap.opInterest) || 0).toFixed(2)}</div>
            <div><b>Total Opening Dues:</b> ₹ ${((parseFloat(snap.opPrincipal) || 0) + (parseFloat(snap.opInterest) || 0)).toFixed(2)}</div>
          </div>
        </div>
      </div>

      <!-- 2. NON OCCUPANCY MANAGEMENT -->
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div style="background:#000080;color:#ffffff;padding:6px 12px;font-weight:bold;font-size:12px;">2. NON OCCUPANCY MANAGEMENT</div>
        <div style="padding:12px;display:grid;grid-template-columns:repeat(3, 1fr);gap:10px 16px;font-size:12px;">
          <div><b>Occupancy Status:</b> Vacant</div>
          <div><b>Tenant/Lender Name:</b> ${snap.tenantName || '—'}</div>
          <div><b>Members Count:</b> —</div>
          <div><b>Lease Period:</b> —</div>
          <div><b>Non-Occupancy Charges:</b> ₹ 0.00</div>
          <div><b>Police Verification:</b> NO</div>
          <div><b>Agreement Assign Between:</b> —</div>
          <div style="grid-column:span 2;"><b>Emergency Family Contact:</b> —</div>
          <div style="grid-column:span 3;border-top:1px dashed #cbd5e1;padding-top:8px;">
            <b>Lease History:</b>
            <table class="mm-table" style="margin-top:6px;width:100%;">
              <thead>
                <tr style="background:#f1f5f9;color:#334155;">
                  <th>Sr No</th><th>Tenant Name</th><th>Period</th><th>Mobile</th><th>Agreement Assign Between</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colspan="5" style="text-align:center;padding:8px;color:#94a3b8;">No lease history recorded.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 3. PARKING SLOT -->
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div style="background:#000080;color:#ffffff;padding:6px 12px;font-weight:bold;font-size:12px;">3. PARKING SLOT</div>
        <div style="padding:12px;display:grid;grid-template-columns:repeat(3, 1fr);gap:10px 16px;font-size:12px;">
          <div><b>4-Wh Stilt Slot:</b> ${snap.parkingSlot4W || '1'}</div>
          <div><b>4-Wh Stilt Reg:</b> ${snap.vehicleNo4W || 'MH-12-QR-3456'}</div>
          <div><b>Charges:</b> ₹ 0.00</div>
          <div><b>4-Wh Podium Slot:</b> 0</div>
          <div><b>4-Wh Podium Reg:</b> —</div>
          <div><b>Charges:</b> ₹ 0.00</div>
          <div><b>2-Wh Stilt Slot:</b> —</div>
          <div><b>2-Wh Stilt Reg:</b> —</div>
          <div><b>Charges:</b> ₹ 0.00</div>
          <div><b>2-Wh Podium Slot:</b> —</div>
          <div><b>2-Wh Podium Reg:</b> —</div>
          <div><b>Charges:</b> ₹ 0.00</div>
          <div style="grid-column:span 3;border-top:1px dashed #cbd5e1;padding-top:8px;">
            <b>Dynamic/Other Parking Slots:</b>
            <table class="mm-table" style="margin-top:6px;width:100%;">
              <thead>
                <tr style="background:#f1f5f9;color:#334155;">
                  <th>Wheeler Type</th><th>Slot Head</th><th>Slot No</th><th>Reg No</th><th>Charges</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colspan="5" style="text-align:center;padding:8px;color:#94a3b8;">No custom parking slots.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 4. LIEN MARK DETAILS -->
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div style="background:#000080;color:#ffffff;padding:6px 12px;font-weight:bold;font-size:12px;">4. LIEN MARK DETAILS</div>
        <div style="padding:12px;display:grid;grid-template-columns:repeat(3, 1fr);gap:10px 16px;font-size:12px;">
          <div><b>Lien Bank Name:</b> ${snap.lienBankName || '—'}</div>
          <div style="grid-column:span 2;"><b>Bank Address:</b> —</div>
          <div><b>Loan Amount:</b> ₹ ${(parseFloat(snap.lienAmount) || 300000).toFixed(2)}</div>
          <div><b>Period of Loan:</b> 5 Years</div>
          <div><b>Resolution No:</b> —</div>
          <div><b>Meeting Date:</b> —</div>
          <div><b>Bank Sanction Letter Date:</b> —</div>
          <div><b>NOC Date by Society:</b> —</div>
          <div style="grid-column:span 3;"><b>Lien Cancellation Date:</b> —</div>
          <div style="grid-column:span 3;border-top:1px dashed #cbd5e1;padding-top:8px;">
            <b>Lien Mark History:</b>
            <table class="mm-table" style="margin-top:6px;width:100%;">
              <thead>
                <tr style="background:#f1f5f9;color:#334155;">
                  <th>Sr No</th><th>Bank Name</th><th>Loan Amt (₹)</th><th>Period</th><th>Meeting Date</th><th>Res No</th><th>NOC Date</th><th>Cancel Date</th><th>Docs</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colspan="9" style="text-align:center;padding:8px;color:#94a3b8;">No lien history recorded.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 5. SHARE CERTIFICATE -->
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div style="background:#000080;color:#ffffff;padding:6px 12px;font-weight:bold;font-size:12px;">5. SHARE CERTIFICATE</div>
        <div style="padding:12px;display:grid;grid-template-columns:repeat(4, 1fr);gap:10px 16px;font-size:12px;">
          <div><b>Certificate No:</b> ${snap.shareCertNo || 'SC-701'}</div>
          <div><b>Membership No:</b> ${snap.folioNo || 'M-701'}</div>
          <div><b>Shares From:</b> ${snap.shareFromNo || 701}</div>
          <div><b>Shares To:</b> ${snap.shareToNo || 710}</div>
          <div><b>No. of Shares:</b> ${snap.shares || 10}</div>
          <div><b>Share Amount:</b> ₹ 1000.00</div>
          <div><b>New Share Sr. No:</b> —</div>
          <div><b>New Share Value:</b> ₹ 0.00</div>
          <div style="grid-column:span 4;"><b>Member Classification:</b> Ordinary Member</div>
          <div style="grid-column:span 4;border-top:1px dashed #cbd5e1;padding-top:8px;color:#64748b;">
            <b>Old Share Certificate details:</b><br><i>Old Share Certificate Data is OFF.</i>
          </div>
        </div>
      </div>

      <!-- 6. SPECIAL REMARKS -->
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
        <div style="background:#000080;color:#ffffff;padding:6px 12px;font-weight:bold;font-size:12px;">6. SPECIAL REMARKS</div>
        <div style="padding:12px;display:flex;flex-direction:column;gap:6px;font-size:12px;">
          <div><b>Special Remark 1:</b> —</div>
          <div><b>Special Remark 2:</b> —</div>
        </div>
      </div>

      <!-- 7. TRANSFER TRANSACTION DETAILS -->
      <div style="border:1px solid #991b1b;border-radius:4px;overflow:hidden;">
        <div style="background:#991b1b;color:#ffffff;padding:6px 12px;font-weight:bold;font-size:12px;">7. TRANSFER TRANSACTION DETAILS</div>
        <div style="padding:12px;display:grid;grid-template-columns:repeat(4, 1fr);gap:10px 16px;font-size:12px;background:#fff5f5;">
          <div><b>Transfer Date:</b> ${log.transferDate || '13/08/2026'}</div>
          <div><b>Transfer Type:</b> ${log.transferType || 'Sell'}</div>
          <div><b>Meeting Type:</b> ${log.meetingType || 'AGM: ANNUAL GENERAL BODY MEETING'}</div>
          <div><b>Meeting Date:</b> ${log.meetingDate || '13/08/2026'}</div>
          <div><b>Resolution No:</b> ${log.resolutionNo || '12'}</div>
          <div><b>Transfer No:</b> ${log.transferNo || '5'}</div>
          <div><b>Reg No Transferor:</b> ${log.regNoTransferor || '—'}</div>
          <div><b>Reg No Transferee:</b> ${log.regNoTransferee || '—'}</div>
          <div><b>Agreement Assign:</b> ${log.agreementAssign || '—'}</div>
          <div><b>Agreement Reg No:</b> 45</div>
          <div><b>Agreement Date:</b> 06/08/2026</div>
          <div><b>Registration Date:</b> 28/08/2026</div>
          <div><b>Stamp Duty Date:</b> 31/08/2026</div>
          <div><b>Agreement Value:</b> ₹ 0.00</div>
          <div><b>Stamp Duty Value:</b> ₹ 0.00</div>
          <div><b>Registration Fees:</b> ₹ 0.00</div>
          <div style="grid-column:span 4;"><b>Remarks:</b> ${log.remarks || '—'}</div>
        </div>
      </div>

    </div>
  `;

  document.getElementById('mm-transfer-preview-overlay').style.display = 'flex';
}

function mmCloseTransferPreview() {
  const overlay = document.getElementById('mm-transfer-preview-overlay');
  if (overlay) overlay.style.display = 'none';
}

function mmPrintTransferPreview() {
  const body = document.getElementById('mm-transfer-preview-body');
  if (!body) return;
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<html><head><title>Historical Member Profile</title><style>body{font-family:sans-serif;padding:20px;}</style></head><body>${body.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function mmDownloadTransferPreviewHtml() {
  const body = document.getElementById('mm-transfer-preview-body');
  if (!body) return;
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Historical Member Profile</title></head><body>${body.innerHTML}</body></html>`;
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Historical_Member_Profile.html`;
  a.click();
}

function mmOpenTransferDocs(idx) {
  const log = mmTransferLogs[idx];
  const tName = log ? (log.transferorName || 'OLD MEMBER') : 'OLD MEMBER';
  const nameEl = document.getElementById('mm-docs-member-name');
  if (nameEl) nameEl.textContent = tName.toUpperCase();

  const container = document.getElementById('mm-transfer-docs-list-container');
  if (container) {
    container.innerHTML = `<span style="color:#64748b;font-size:13px;">No uploaded documents found for this historical member record.</span>`;
  }

  const overlay = document.getElementById('mm-transfer-docs-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function mmCloseTransferDocs() {
  const overlay = document.getElementById('mm-transfer-docs-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── TAB 8: MEMBER BILL BREAKUP LOGIC ──────────────────────
let mmBillTypesList = [];
let mmActiveBreakupBillTypeId = 0;
let mmBreakupIsEditing = false;
let mmCurrentBreakupData = null;

async function mmLoadBreakupBillTypes() {
  const container = document.getElementById('mm-bb-billtype-pills');
  if (!container) return;

  const memberId = mmEditId || mmSelectedId;
  if (!memberId) {
    container.innerHTML = '<span style="color:#64748b;font-size:11px;font-style:italic;">Select or edit a member first.</span>';
    return;
  }

  try {
    const socId = mmGetActiveSocietyId();
    let rawList = [];

    // 1. Fetch from backend API
    try {
      const url = `${mmApiBase()}/api/bill-types?societyId=${socId}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && Array.isArray(json.data)) {
          rawList = json.data.filter(b => b.isActive !== false);
        }
      }
    } catch (e) {
      console.warn('API bill types fetch error', e);
    }

    // 2. Also merge bill types from LocalStorage (from Bill Type Master)
    try {
      const localKey = 'jeevika_bill_types_' + socId;
      const localDataStr = localStorage.getItem(localKey) || localStorage.getItem('jeevika_bill_types_global');
      if (localDataStr) {
        const localObj = JSON.parse(localDataStr);
        Object.keys(localObj).forEach((name, idx) => {
          const existing = rawList.find(b => (b.billTypeName || b.billTypeCode || '').trim().toUpperCase() === name.trim().toUpperCase());
          if (!existing) {
            rawList.push({
              billTypeId: localObj[name].id || (100 + idx),
              billTypeName: name,
              billTypeCode: name.substring(0, 5).toUpperCase()
            });
          }
        });
      }
    } catch (e) {
      console.warn('Local bill types parse error', e);
    }

    if (rawList.length === 0) {
      rawList = [
        { billTypeId: 1, billTypeName: 'Maintenance', billTypeCode: 'MAINT' }
      ];
    }

    // Deduplicate bill types by normalized name
    const seenNames = new Set();
    mmBillTypesList = [];
    rawList.forEach(b => {
      const nameKey = (b.billTypeName || b.billTypeCode || '').trim().toUpperCase();
      if (nameKey && !seenNames.has(nameKey)) {
        seenNames.add(nameKey);
        mmBillTypesList.push(b);
      }
    });

    // Ensure 'MAINTENANCE' is ALWAYS first in pills list
    mmBillTypesList.sort((a, b) => {
      const aMaint = (a.billTypeName || a.billTypeCode || '').trim().toLowerCase() === 'maintenance';
      const bMaint = (b.billTypeName || b.billTypeCode || '').trim().toLowerCase() === 'maintenance';
      if (aMaint) return -1;
      if (bMaint) return 1;
      return (a.billTypeName || '').localeCompare(b.billTypeName || '');
    });

    // Default active bill type to Maintenance
    const maintBt = mmBillTypesList.find(b => (b.billTypeName || '').toLowerCase() === 'maintenance');
    if (maintBt) {
      mmActiveBreakupBillTypeId = maintBt.billTypeId;
    } else if (mmBillTypesList.length > 0) {
      mmActiveBreakupBillTypeId = mmBillTypesList[0].billTypeId;
    }

    mmRenderBreakupBillTypePills();
    await mmLoadMemberBillBreakup(memberId, mmActiveBreakupBillTypeId);
  } catch (e) {
    console.error('Failed to load bill types for Tab 8:', e);
    container.innerHTML = `<span style="color:#dc2626;font-size:11px;">Error loading bill types: ${e.message}</span>`;
  }
}

function mmRenderBreakupBillTypePills() {
  const container = document.getElementById('mm-bb-billtype-pills');
  if (!container) return;

  container.innerHTML = mmBillTypesList.map(bt => {
    const isActive = bt.billTypeId === mmActiveBreakupBillTypeId;
    const activeClass = isActive ? 'active' : '';
    const name = (bt.billTypeName || bt.billTypeCode || 'Bill Type').toUpperCase();
    return `<button type="button" class="mm-bb-pill ${activeClass}" onclick="mmSelectBreakupBillType(${bt.billTypeId})">${name}</button>`;
  }).join('');
}

async function mmSelectBreakupBillType(billTypeId) {
  mmActiveBreakupBillTypeId = billTypeId;
  mmBreakupIsEditing = false;
  mmRenderBreakupBillTypePills();

  const memberId = mmEditId || mmSelectedId;
  if (memberId) {
    await mmLoadMemberBillBreakup(memberId, billTypeId);
  }
}

async function mmLoadMemberBillBreakup(memberId, billTypeId) {
  const tbody = document.getElementById('mm-bb-tbody');
  const titleEl = document.getElementById('mm-bb-header-title');
  const totalEl = document.getElementById('mm-bb-header-total');
  const editBtn = document.getElementById('mm-bb-btn-edit');

  if (!tbody) return;

  const currentBt = mmBillTypesList.find(b => b.billTypeId === billTypeId);
  const btName = currentBt ? (currentBt.billTypeName || currentBt.billTypeCode || 'Bill') : 'Bill';
  const normName = btName.toUpperCase();

  if (titleEl) titleEl.textContent = `${normName} BILL BREAKUP`;
  if (editBtn) {
    editBtn.innerHTML = '<i class="bi bi-pencil-fill"></i> EDIT';
    editBtn.style.background = '#ffffff';
    editBtn.style.color = '#1565C0';
  }

  tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:30px;color:#808080;"><i class="bi bi-hourglass-split"></i> Loading accounts for ${btName}...</td></tr>`;

  try {
    const socId = mmGetActiveSocietyId();
    let configuredHeads = [];
    let memberAmountsMap = {};
    let foundInConfig = false;

    // 1. Check LocalStorage First (reflects active Bill Type Master state)
    try {
      const localKey = 'jeevika_bill_types_' + socId;
      const localDataStr = localStorage.getItem(localKey) || localStorage.getItem('jeevika_bill_types_global');
      if (localDataStr) {
        const localObj = JSON.parse(localDataStr);
        const matchingKey = Object.keys(localObj).find(k => k.trim().toUpperCase() === normName);
        const btData = matchingKey ? localObj[matchingKey] : localObj[btName];
        if (btData) {
          foundInConfig = true;
          if (Array.isArray(btData.heads)) {
            // Take custom user configured rows that have non-empty account codes or names
            const maxCheck = btData.heads.length;
            const userRows = btData.heads.slice(0, maxCheck).filter((h, idx) => {
              const isFixedInterest = (idx === 29 || idx === 30) && ((h.accName || '').toLowerCase().includes('interest'));
              const isFixedGst = (idx >= 30) && ((h.accName || '').toLowerCase().includes('gst'));
              // Exclude fixed empty interest/gst rows if unconfigured
              if (isFixedInterest || isFixedGst) return false;
              return (h.accCode || '').trim() !== '' && (h.accName || '').trim() !== '';
            });

            configuredHeads = userRows.map((h, idx) => ({
              srNo: idx + 1,
              accCode: (h.accCode || '').trim(),
              accName: (h.accName || '').trim(),
              amount: 0
            }));
          }
        }
      }
    } catch (e) {
      console.warn('Local bill types check error', e);
    }

    // 2. If not found in local config, fetch from API
    if (!foundInConfig) {
      try {
        const btRes = await fetch(`${mmApiBase()}/api/bill-types/${billTypeId}`, { headers: getAuthHeaders() });
        if (btRes.ok) {
          const btJson = await btRes.json();
          const rawHeads = btJson.heads || (btJson.data && btJson.data.heads) || [];
          if (Array.isArray(rawHeads) && rawHeads.length > 0) {
            configuredHeads = rawHeads
              .filter(h => (h.accCode || h.MasterCode || h.AccountCode || '').trim() !== '' && (h.accName || h.MasterName || h.AccountName || '').trim() !== '')
              .map((h, idx) => ({
                srNo: idx + 1,
                accCode: (h.accCode || h.MasterCode || h.AccountCode || '').trim(),
                accName: (h.accName || h.MasterName || h.AccountName || '').trim(),
                amount: 0
              }));
          }
        }
      } catch (e) {
        console.warn('Bill type details fetch error', e);
      }
    }

    if (!configuredHeads || configuredHeads.length === 0) {
      configuredHeads = [];
      mmCurrentBreakupData = {
        billTypeId,
        billTypeName: btName,
        total: 0,
        heads: []
      };
      mmRenderBreakupTable();
      return;
    }

    // 3. Fetch Member Matrix Amounts from Billing Master (API + LocalStorage mirror)
    const currentMem = mmList.find(x => (x.socMemId || x.memberId || x.MemberId) === memberId);
    const currentMemId = currentMem ? (currentMem.socMemId || currentMem.memberId || currentMem.MemberId || memberId) : memberId;
    const flatNo = (currentMem ? (currentMem.flatNo || '') : '').trim().toLowerCase();
    const memCode = (currentMem ? (currentMem.memCode || currentMem.flatNo || '') : '').trim().toLowerCase();

    let matrixList = [];

    // Check LocalStorage cache first
    try {
      const localKeys = [`jeevika_bm_matrix_${socId}_${btName}`, `jeevika_bm_matrix_1_${btName}`];
      for (const k of localKeys) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            matrixList = parsed;
            break;
          }
        }
      }
    } catch (e) { }

    // Also fetch from API
    try {
      const bmRes = await fetch(`${mmApiBase()}/api/billing-master?billType=${encodeURIComponent(btName)}&societyId=${socId}`, { headers: getAuthHeaders() });
      if (bmRes.ok) {
        const bmJson = await bmRes.json();
        if (bmJson && bmJson.success && Array.isArray(bmJson.data) && bmJson.data.length > 0) {
          matrixList = bmJson.data;
        }
      }
    } catch (e) {
      console.warn('Billing master fetch error', e);
    }

    let memRow = null;
    if (matrixList && Array.isArray(matrixList)) {
      memRow = matrixList.find(r => {
        const rId = r.memberId || r.MemberId || r.id || 0;
        const rMemNo = (r.memNo || r.MemNo || '').trim().toLowerCase();
        const rFlat = (r.flatNo || r.FlatNo || '').trim().toLowerCase();
        return (currentMemId > 0 && rId === currentMemId) ||
               (flatNo && (rMemNo === flatNo || rFlat === flatNo)) ||
               (memCode && rMemNo === memCode);
      });
    }

    if (memRow && memRow.amounts) {
      Object.keys(memRow.amounts).forEach(k => {
        memberAmountsMap[k.trim().toUpperCase()] = parseFloat(memRow.amounts[k]) || 0;
      });
    }

    // 4. Merge amounts into configured heads (checking by BOTH Code and Name)
    let calculatedTotal = 0;
    const finalHeads = (configuredHeads || []).map(h => {
      const codeKey = (h.accCode || '').trim().toUpperCase();
      const nameKey = (h.accName || '').trim().toUpperCase();

      let amt = 0;
      if (memberAmountsMap[codeKey] !== undefined) {
        amt = memberAmountsMap[codeKey];
      } else if (memberAmountsMap[nameKey] !== undefined) {
        amt = memberAmountsMap[nameKey];
      } else if (memRow && memRow.amounts) {
        const found = Object.keys(memRow.amounts).find(k =>
          k.trim().toUpperCase() === codeKey || k.trim().toUpperCase() === nameKey
        );
        if (found) amt = parseFloat(memRow.amounts[found]) || 0;
      }

      calculatedTotal += amt;
      return {
        ...h,
        amount: amt
      };
    });

    mmCurrentBreakupData = {
      billTypeId,
      billTypeName: btName,
      total: calculatedTotal,
      heads: finalHeads
    };

    mmRenderBreakupTable();
  } catch (e) {
    console.error('Failed to load member bill breakup:', e);
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:30px;color:#dc2626;"><i class="bi bi-exclamation-triangle"></i> Error: ${e.message}</td></tr>`;
  }
}

function mmGetNocAmountFromMatrix(memberId, flatNo, memCode) {
  try {
    const socId = mmGetActiveSocietyId();
    const localKeys = [`jeevika_bm_matrix_${socId}_Maintenance`, `jeevika_bm_matrix_1_Maintenance`];
    for (const k of localKeys) {
      const raw = localStorage.getItem(k);
      if (raw) {
        const matrixList = JSON.parse(raw);
        if (Array.isArray(matrixList)) {
          const row = matrixList.find(r => {
            const rId = r.memberId || r.MemberId || r.id || 0;
            const rMemNo = (r.memNo || r.MemNo || '').trim().toLowerCase();
            const rFlat = (r.flatNo || r.FlatNo || '').trim().toLowerCase();
            return (memberId > 0 && rId === memberId) ||
                   (flatNo && (rMemNo === flatNo.toLowerCase() || rFlat === flatNo.toLowerCase())) ||
                   (memCode && rMemNo === memCode.toLowerCase());
          });
          if (row && row.amounts) {
            for (const key of Object.keys(row.amounts)) {
              const kUp = key.trim().toUpperCase();
              if (kUp === 'INC-1005' || kUp === 'A006' || kUp.includes('NON OCCUPANCY') || kUp.includes('NON-OCCUPANCY') || kUp === 'NOC') {
                const amt = parseFloat(row.amounts[key]) || 0;
                if (amt > 0) return amt;
              }
            }
          }
        }
      }
    }
  } catch (e) { }
  return 0;
}

function mmSyncNocToMatrixCache(amt) {
  try {
    const memberId = mmEditId || mmSelectedId;
    if (!memberId) return;
    const socId = mmGetActiveSocietyId();
    const currentMem = mmList.find(x => (x.socMemId || x.memberId || x.MemberId) === memberId);
    const currentMemId = currentMem ? (currentMem.socMemId || currentMem.memberId || currentMem.MemberId || memberId) : memberId;
    const memCode = currentMem ? (currentMem.memCode || currentMem.flatNo || '') : '';
    const flatNo = currentMem ? (currentMem.flatNo || '') : '';
    const memName = currentMem ? (currentMem.memName || '') : '';
    const wing = currentMem ? (currentMem.wing || '') : '';
    const sqft = currentMem ? (currentMem.areaSqft || currentMem.sqft || 0) : 0;

    const btName = 'Maintenance';
    const localKeys = [`jeevika_bm_matrix_${socId}_${btName}`, `jeevika_bm_matrix_1_${btName}`];

    localKeys.forEach(k => {
      let matrixList = [];
      try {
        const raw = localStorage.getItem(k);
        if (raw) matrixList = JSON.parse(raw);
      } catch (e) { }
      if (!Array.isArray(matrixList)) matrixList = [];

      const existingIdx = matrixList.findIndex(r => {
        const rId = r.memberId || r.MemberId || r.id || 0;
        const rMemNo = (r.memNo || r.MemNo || '').trim().toLowerCase();
        const rFlat = (r.flatNo || r.FlatNo || '').trim().toLowerCase();
        return (currentMemId > 0 && rId === currentMemId) ||
               (flatNo && (rMemNo === flatNo.toLowerCase() || rFlat === flatNo.toLowerCase())) ||
               (memCode && rMemNo === memCode.toLowerCase());
      });

      const nocKey = 'INC-1005';
      const nocNameKey = 'Non Occupancy Charges';

      if (existingIdx >= 0) {
        if (!matrixList[existingIdx].amounts) matrixList[existingIdx].amounts = {};
        matrixList[existingIdx].amounts[nocKey] = amt;
        matrixList[existingIdx].amounts[nocNameKey] = amt;
      } else {
        matrixList.push({
          memberId: currentMemId,
          memNo: flatNo || memCode,
          flatNo: flatNo,
          wing: wing,
          name: memName,
          sqft: sqft,
          amounts: { [nocKey]: amt, [nocNameKey]: amt },
          checked: false
        });
      }
      localStorage.setItem(k, JSON.stringify(matrixList));
    });
  } catch (e) {
    console.warn('Error syncing NOC to matrix cache', e);
  }
}

function mmOnNocChargesInput(valStr) {
  const amt = parseFloat(valStr) || 0;
  if (mmCurrentBreakupData && Array.isArray(mmCurrentBreakupData.heads)) {
    const nocHead = mmCurrentBreakupData.heads.find(h =>
      (h.accCode && (h.accCode.toUpperCase() === 'INC-1005' || h.accCode.toUpperCase() === 'A006')) ||
      (h.accName && (/non\s*[-]?\s*occupancy|\bnoc\b/i.test(h.accName))) ||
      (h.accCode && (/non\s*[-]?\s*occupancy|\bnoc\b/i.test(h.accCode)))
    );
    if (nocHead) {
      nocHead.amount = amt;
      const inp = document.querySelector('.mm-bb-amt-input[data-is-noc="1"]');
      if (inp) {
        inp.value = amt.toFixed(2);
        mmCalcBreakupTotal();
      } else {
        mmRenderBreakupTable();
      }
    }
  }
  mmSyncNocToMatrixCache(amt);
}

function mmOnBreakupInput(inp) {
  mmCalcBreakupTotal();
  const isNoc = inp.getAttribute('data-is-noc') === '1';
  const isPark4 = inp.getAttribute('data-is-park4') === '1';
  const isPark2 = inp.getAttribute('data-is-park2') === '1';

  if (isNoc) {
    const valAmt = parseFloat(inp.value) || 0;
    setVal('mm-nonocc-charges', valAmt.toString());
    mmSyncNocToMatrixCache(valAmt);
  } else if (isPark4) {
    const valAmt = parseFloat(inp.value) || 0;
    setVal('mm-park4-stilt-charge', valAmt.toString());
    setVal('mm-park4-podium-charge', '0');
    if (typeof mmCalcParkingTotals === 'function') mmCalcParkingTotals();
    if (typeof mmSyncParkingToMatrixAndBreakup === 'function') mmSyncParkingToMatrixAndBreakup();
  } else if (isPark2) {
    const valAmt = parseFloat(inp.value) || 0;
    setVal('mm-park2-stilt-charge', valAmt.toString());
    setVal('mm-park2-podium-charge', '0');
    if (typeof mmCalcParkingTotals === 'function') mmCalcParkingTotals();
    if (typeof mmSyncParkingToMatrixAndBreakup === 'function') mmSyncParkingToMatrixAndBreakup();
  }
}

function mmRenderBreakupTable() {
  const tbody = document.getElementById('mm-bb-tbody');
  const totalEl = document.getElementById('mm-bb-header-total');
  const editBtn = document.getElementById('mm-bb-btn-edit');
  if (!tbody || !mmCurrentBreakupData) return;

  const heads = Array.isArray(mmCurrentBreakupData.heads) ? mmCurrentBreakupData.heads : [];

  if (heads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:35px 20px;color:#64748b;font-size:12px;font-weight:600;"><i class="bi bi-info-circle" style="font-size:18px;margin-right:8px;vertical-align:middle;color:#0284c7;"></i> No account heads configured for "${mmCurrentBreakupData.billTypeName || 'this bill type'}" in Bill Type Master.</td></tr>`;
    if (totalEl) totalEl.textContent = 'TOTAL: ₹ 0.00';
    if (editBtn) editBtn.style.display = 'none';
    return;
  }

  if (editBtn) editBtn.style.display = 'inline-flex';

  let total = 0;
  tbody.innerHTML = heads.map(h => {
    const isNocHead = (h.accCode && (h.accCode.toUpperCase() === 'INC-1005' || h.accCode.toUpperCase() === 'A006')) ||
                      (h.accName && (/non\s*[-]?\s*occupancy|\bnoc\b/i.test(h.accName))) ||
                      (h.accCode && (/non\s*[-]?\s*occupancy|\bnoc\b/i.test(h.accCode)));

    const isPark4Head = (h.accCode && (h.accCode.toUpperCase() === 'INC-1006' || h.accCode.toUpperCase() === 'A007')) ||
                        (h.accName && (h.accName.toUpperCase().includes('4-WHEELER') || h.accName.toUpperCase().includes('4 WHEELER') || (h.accName.toUpperCase().includes('PARKING') && !h.accName.toUpperCase().includes('2-WHEELER') && !h.accName.toUpperCase().includes('2 WHEELER') && !h.accName.toUpperCase().includes('2W') && !h.accName.toUpperCase().includes('TWO WHEELER'))));

    const isPark2Head = (h.accCode && h.accCode.toUpperCase() === 'INC-1007') ||
                        (h.accName && (h.accName.toUpperCase().includes('2-WHEELER') || h.accName.toUpperCase().includes('2 WHEELER') || h.accName.toUpperCase().includes('TWO WHEELER') || h.accName.toUpperCase().includes('2W')));

    let amt = parseFloat(h.amount) || 0;
    const tab2Charges = parseFloat(val('mm-nonocc-charges')) || 0;
    const tab3Park4 = parseFloat(val('mm-park4-total')) || 0;
    const tab3Park2 = parseFloat(val('mm-park2-total')) || 0;
    const badge = document.getElementById('mm-nonocc-status-badge');
    const isTenantActive = badge && (badge.textContent === 'ACTIVE' || badge.textContent === 'OCCUPIED');

    if (isNocHead) {
      if (isTenantActive && tab2Charges > 0 && amt === 0) {
        amt = tab2Charges;
        h.amount = tab2Charges;
      } else if (!isTenantActive) {
        amt = 0;
        h.amount = 0;
      } else if (amt > 0 && tab2Charges === 0 && isTenantActive) {
        setVal('mm-nonocc-charges', amt.toString());
      }
    } else if (isPark4Head) {
      if (tab3Park4 > 0 && amt === 0) {
        amt = tab3Park4;
        h.amount = tab3Park4;
      } else if (amt > 0 && tab3Park4 === 0) {
        setVal('mm-park4-stilt-charge', amt.toString());
        setVal('mm-park4-podium-charge', '0');
        if (typeof mmCalcParkingTotals === 'function') mmCalcParkingTotals();
      }
    } else if (isPark2Head) {
      if (tab3Park2 > 0 && amt === 0) {
        amt = tab3Park2;
        h.amount = tab3Park2;
      } else if (amt > 0 && tab3Park2 === 0) {
        setVal('mm-park2-stilt-charge', amt.toString());
        setVal('mm-park2-podium-charge', '0');
        if (typeof mmCalcParkingTotals === 'function') mmCalcParkingTotals();
      }
    }

    total += amt;
    const formattedAmt = amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    return `<tr>
      <td style="font-weight:700;padding:6px 10px;border-right:1px solid #f1f5f9;color:#1e293b;">${h.accCode || '—'}</td>
      <td style="padding:6px 10px;border-right:1px solid #f1f5f9;color:#1e293b;font-weight:600;">${h.accName || '—'}</td>
      <td style="padding:4px 10px;text-align:right;font-weight:700;color:#0f172a;">
        ${mmBreakupIsEditing
          ? `<input type="number" class="mm-input mm-bb-amt-input" data-code="${h.accCode}" data-is-noc="${isNocHead ? '1' : '0'}" data-is-park4="${isPark4Head ? '1' : '0'}" data-is-park2="${isPark2Head ? '1' : '0'}" step="0.01" style="width:130px;text-align:right;font-weight:700;" value="${amt.toFixed(2)}" oninput="mmOnBreakupInput(this)">`
          : `₹ ${formattedAmt}`
        }
      </td>
    </tr>`;
  }).join('');

  if (totalEl) {
    totalEl.textContent = `TOTAL: ₹ ${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function mmCalcBreakupTotal() {
  const inputs = document.querySelectorAll('.mm-bb-amt-input');
  let total = 0;
  inputs.forEach(inp => {
    total += parseFloat(inp.value) || 0;
  });

  const totalEl = document.getElementById('mm-bb-header-total');
  if (totalEl) {
    totalEl.textContent = `TOTAL: ₹ ${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

async function mmToggleBreakupEdit() {
  const editBtn = document.getElementById('mm-bb-btn-edit');
  const memberId = mmEditId || mmSelectedId;

  if (!memberId) {
    mmAlert('No member selected.', true);
    return;
  }

  if (!mmBreakupIsEditing) {
    // Switch to Edit Mode
    mmBreakupIsEditing = true;
    if (editBtn) {
      editBtn.innerHTML = '<i class="bi bi-check-lg"></i> SAVE';
      editBtn.style.background = '#22c55e';
      editBtn.style.color = '#ffffff';
    }
    mmRenderBreakupTable();
    const firstInput = document.querySelector('.mm-bb-amt-input');
    if (firstInput) firstInput.focus();
  } else {
    // Save Breakup Changes
    await mmSaveMemberBillBreakup();
  }
}

async function mmSaveMemberBillBreakup() {
  const memberId = mmEditId || mmSelectedId;
  const editBtn = document.getElementById('mm-bb-btn-edit');
  if (!memberId || !mmActiveBreakupBillTypeId) return;

  const currentBt = mmBillTypesList.find(b => b.billTypeId === mmActiveBreakupBillTypeId);
  const btName = currentBt ? (currentBt.billTypeName || 'Maintenance') : 'Maintenance';
  const socId = mmGetActiveSocietyId();
  const currentMem = mmList.find(x => (x.socMemId || x.memberId || x.MemberId) === memberId);
  const currentMemId = currentMem ? (currentMem.socMemId || currentMem.memberId || currentMem.MemberId || memberId) : memberId;
  const memCode = currentMem ? (currentMem.memCode || currentMem.flatNo || '') : '';
  const flatNo = currentMem ? (currentMem.flatNo || '') : '';
  const memName = currentMem ? (currentMem.memName || '') : '';
  const wing = currentMem ? (currentMem.wing || '') : '';
  const sqft = currentMem ? (currentMem.areaSqft || currentMem.sqft || 0) : 0;

  const inputs = document.querySelectorAll('.mm-bb-amt-input');
  const headsPayload = [];
  const amountsDict = {};

  inputs.forEach(inp => {
    const code = inp.getAttribute('data-code');
    const amt = parseFloat(inp.value) || 0;
    const isNoc = inp.getAttribute('data-is-noc') === '1';
    if (code) {
      const headObj = (mmCurrentBreakupData && mmCurrentBreakupData.heads)
        ? mmCurrentBreakupData.heads.find(h => h.accCode === code)
        : null;
      const headName = headObj ? headObj.accName : code;

      headsPayload.push({ accCode: code, accName: headName, amount: amt });
      amountsDict[code] = amt;
      if (headName) amountsDict[headName] = amt;

      if (headObj) headObj.amount = amt;

      if (isNoc) {
        setVal('mm-nonocc-charges', amt.toString());
      }
    }
  });

  // 1. Update LocalStorage Matrix Backup for Billing Master
  try {
    const localKeys = [`jeevika_bm_matrix_${socId}_${btName}`, `jeevika_bm_matrix_1_${btName}`];
    localKeys.forEach(k => {
      let matrixList = [];
      try {
        const raw = localStorage.getItem(k);
        if (raw) matrixList = JSON.parse(raw);
      } catch (e) { }
      if (!Array.isArray(matrixList)) matrixList = [];

      const existingIdx = matrixList.findIndex(r => {
        const rId = r.memberId || r.MemberId || r.id || 0;
        const rMemNo = (r.memNo || r.MemNo || '').trim().toLowerCase();
        const rFlat = (r.flatNo || r.FlatNo || '').trim().toLowerCase();
        return (currentMemId > 0 && rId === currentMemId) ||
               (flatNo && (rMemNo === flatNo.toLowerCase() || rFlat === flatNo.toLowerCase())) ||
               (memCode && rMemNo === memCode.toLowerCase());
      });

      if (existingIdx >= 0) {
        matrixList[existingIdx].amounts = {
          ...(matrixList[existingIdx].amounts || {}),
          ...amountsDict
        };
      } else {
        matrixList.push({
          memberId: currentMemId,
          memNo: flatNo || memCode,
          flatNo: flatNo,
          wing: wing,
          name: memName,
          sqft: sqft,
          amounts: amountsDict,
          checked: false
        });
      }
      localStorage.setItem(k, JSON.stringify(matrixList));
    });
  } catch (e) { }

  // 2. Save via Billing Master API
  try {
    const singleRowPayload = [{
      memberId: currentMemId,
      memNo: flatNo || memCode,
      flatNo: flatNo,
      wing: wing,
      name: memName,
      sqft: sqft,
      amounts: amountsDict,
      checked: false
    }];

    await fetch(`${mmApiBase()}/api/billing-master?billType=${encodeURIComponent(btName)}&societyId=${socId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(singleRowPayload)
    });
  } catch (e) {
    console.warn('API sync error', e);
  }

  mmAlert('Member bill breakup saved successfully!');
  mmBreakupIsEditing = false;
  if (editBtn) {
    editBtn.innerHTML = '<i class="bi bi-pencil-fill"></i> EDIT';
    editBtn.style.background = '#ffffff';
    editBtn.style.color = '#1565C0';
  }
  mmRenderBreakupTable();
}

// ── TOAST NOTIFICATION UTILITY (Green Top-Right Banner) ───
function mmShowToast(msg, type = 'success') {
  const existing = document.getElementById('mm-toast-banner');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'mm-toast-banner';
  toast.style.cssText = `
    position: fixed;
    top: 14px;
    right: 18px;
    z-index: 999999;
    padding: 10px 18px;
    font-size: 12px;
    font-weight: 700;
    color: #ffffff;
    border-radius: 4px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.22);
    background: ${type === 'success' ? '#15803d' : '#dc2626'};
    display: flex;
    align-items: center;
    gap: 8px;
    transition: opacity 0.3s ease, transform 0.3s ease;
    font-family: inherit;
  `;
  toast.innerHTML = `<i class="bi ${type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill'}"></i> <span>${msg}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ── TAB 2: NON-OCCUPANCY / TENANT LOGIC ────────────────────
let mmNocDocs = {
  agree: null,
  aadhar: null,
  police: null
};
let mmTenantHistoryList = [];
let mmSelectedTenantHistoryIdx = -1;

function mmSetNocStatus(isActive) {
  const badge = document.getElementById('mm-nonocc-status-badge');
  const btn = document.getElementById('mm-nonocc-btn-toggle');
  const chargesWrap = document.getElementById('mm-nonocc-top-charges-wrap');
  const formContainer = document.getElementById('mm-tenant-form-container');

  if (isActive) {
    if (badge) {
      badge.textContent = 'ACTIVE';
      badge.style.background = '#15803d';
      badge.style.color = '#ffffff';
    }
    if (btn) {
      btn.textContent = 'LEAVE / MARK VACANT';
      btn.style.color = '#1565C0';
      btn.style.background = '#e0f2fe';
      btn.style.borderColor = '#0284c7';
    }
    if (chargesWrap) chargesWrap.style.display = 'flex';
    if (formContainer) formContainer.style.display = 'flex';
  } else {
    if (badge) {
      badge.textContent = 'VACANT';
      badge.style.background = '#dc2626';
      badge.style.color = '#ffffff';
    }
    if (btn) {
      btn.textContent = 'ASSIGN TENANT (OCCUPIED)';
      btn.style.color = '#1565C0';
      btn.style.background = '#e0f2fe';
      btn.style.borderColor = '#0284c7';
    }
    if (chargesWrap) chargesWrap.style.display = 'none';
    if (formContainer) formContainer.style.display = 'none';
  }
}

async function mmToggleNocStatus() {
  const badge = document.getElementById('mm-nonocc-status-badge');
  const isCurrentlyActive = badge && (badge.textContent === 'ACTIVE' || badge.textContent === 'OCCUPIED');

  if (!isCurrentlyActive) {
    // Validate that NOC is configured in Bill Type & Notes Master
    const check = await mmCheckNocConfiguredInBillTypes();
    if (!check.configured) {
      if (typeof mmAlert === 'function') {
        mmAlert('Cannot assign tenant: Non-Occupancy Charges (NOC) account is not selected in any Bill Type under Bill Type & Notes Master.<br><br>Please select the NOC ledger in Bill Type Master first.', true);
      } else {
        alert('Cannot assign tenant: Non-Occupancy Charges (NOC) account is not selected in any Bill Type under Bill Type & Notes Master. Please select the NOC ledger in Bill Type Master first.');
      }
      return;
    }

    if (check.accCode) {
      setVal('mm-noc-code', check.accCode);
      const nocCodeInput = document.getElementById('mm-noc-code');
      if (nocCodeInput) {
        nocCodeInput.title = `Mapped from ${check.billType}: ${check.accName}`;
      }
    }

    // Switch from VACANT to ACTIVE (Occupied)
    mmSetNocStatus(true);
    mmShowToast('Tenant marked as active (Occupied).', 'success');
    const firstInput = document.getElementById('mm-tenant-name');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  } else {
    // Switch from ACTIVE to VACANT -> Archive current tenant into history
    const tName = val('mm-tenant-name').trim();
    const tContact = val('mm-tenant-contact').trim();
    const fromDate = val('mm-nonocc-period-from');
    const toDate = val('mm-nonocc-period-to');
    const assignBetween = val('mm-nonocc-agreement-assign').trim();

    if (tName) {
      let timePeriod = '—';
      if (fromDate || toDate) {
        timePeriod = `${fromDate || '—'} to ${toDate || '—'}`;
      }

      mmTenantHistoryList.push({
        srNo: mmTenantHistoryList.length + 1,
        tenantName: tName,
        timePeriod: timePeriod,
        contact: tContact || '—',
        agreementBetween: assignBetween || '—',
        agreeDoc: mmNocDocs.agree ? { ...mmNocDocs.agree } : null,
        aadharDoc: mmNocDocs.aadhar ? { ...mmNocDocs.aadhar } : null,
        policeDoc: mmNocDocs.police ? { ...mmNocDocs.police } : null
      });
      mmRenderTenantHistory();
    }

    // Reset current tenant form fields
    setVal('mm-tenant-name', '');
    setVal('mm-nonocc-members-count', '');
    setVal('mm-tenant-contact', '');
    setVal('mm-nonocc-family-names', '');
    setVal('mm-nonocc-phone2', '');
    setVal('mm-nonocc-period-from', '');
    setVal('mm-nonocc-period-to', '');
    setVal('mm-nonocc-agreement-assign', '');
    setVal('mm-nonocc-charges', '0');
    if (typeof mmSyncNocToMatrixCache === 'function') {
      mmSyncNocToMatrixCache(0);
    }
    if (typeof mmCurrentBreakupData !== 'undefined' && mmCurrentBreakupData && Array.isArray(mmCurrentBreakupData.heads)) {
      const nocHead = mmCurrentBreakupData.heads.find(h =>
        (h.accCode && (h.accCode.toUpperCase() === 'INC-1005' || h.accCode.toUpperCase() === 'A006')) ||
        (h.accName && (/non\s*[-]?\s*occupancy|\bnoc\b/i.test(h.accName))) ||
        (h.accCode && (/non\s*[-]?\s*occupancy|\bnoc\b/i.test(h.accCode)))
      );
      if (nocHead) {
        nocHead.amount = 0;
        if (typeof mmRenderBreakupTable === 'function') mmRenderBreakupTable();
      }
    }

    // Reset documents
    ['agree', 'aadhar', 'police'].forEach(type => {
      const sel = document.getElementById(`mm-noc-${type}-verify`);
      if (sel) sel.value = 'NO';
      mmToggleNocDocWrap(type, 'NO');
    });

    mmSetNocStatus(false);
    mmShowToast('Tenant details archived to lease history and fields reset.', 'success');
  }
}

// ── NOC Document Upload & Actions ─────────────────────────
function mmTriggerNocDocUpload(docType) {
  const sel = document.getElementById(`mm-noc-${docType}-verify`);
  if (!sel || sel.value !== 'YES') {
    mmAlert('Please set the dropdown to YES to upload a document.', true);
    return;
  }
  const fileInput = document.getElementById(`mm-noc-${docType}-file`);
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

function mmToggleNocDocWrap(docType, val) {
  const btn = document.getElementById(`mm-noc-${docType}-btn`);
  const btnText = document.getElementById(`mm-noc-${docType}-btn-text`);
  const fileInput = document.getElementById(`mm-noc-${docType}-file`);
  const actionsWrap = document.getElementById(`mm-noc-${docType}-actions`);

  if (val === 'YES') {
    if (btn) {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.borderColor = '#0284c7';
      btn.style.color = '#0284c7';
      btn.style.background = '#ffffff';
    }
  } else {
    if (btn) {
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.style.borderColor = '#cbd5e1';
      btn.style.color = '#64748b';
      btn.style.background = '#f8fafc';
    }
    if (btnText) btnText.textContent = 'Choose File';
    if (fileInput) fileInput.value = '';
    if (actionsWrap) actionsWrap.style.display = 'none';
    mmNocDocs[docType] = null;
  }
}

function mmHandleNocDocUpload(docType, input) {
  const sel = document.getElementById(`mm-noc-${docType}-verify`);
  if (!sel || sel.value !== 'YES') {
    input.value = '';
    mmAlert('Please select YES before uploading the document.', true);
    return;
  }

  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    mmNocDocs[docType] = {
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.type,
      dataUrl: e.target.result
    };

    const btn = document.getElementById(`mm-noc-${docType}-btn`);
    const btnText = document.getElementById(`mm-noc-${docType}-btn-text`);
    const actionsWrap = document.getElementById(`mm-noc-${docType}-actions`);
    const nameEl = document.getElementById(`mm-noc-${docType}-filename`);

    if (btnText) btnText.textContent = file.name;
    if (btn) {
      btn.style.background = '#f0fdf4';
      btn.style.borderColor = '#86efac';
      btn.style.color = '#15803d';
    }
    if (nameEl) nameEl.textContent = file.name;
    if (actionsWrap) actionsWrap.style.display = 'inline-flex';
    mmShowToast(`Document "${file.name}" attached successfully.`);
  };
  reader.readAsDataURL(file);
}

function mmPreviewNocDoc(docType) {
  const doc = mmNocDocs[docType];
  if (!doc || !doc.dataUrl) {
    mmAlert('No document uploaded to preview.', true);
    return;
  }

  const modal = document.getElementById('mm-rc-preview-modal');
  const titleEl = document.getElementById('mm-rc-preview-title');
  const bodyEl = document.getElementById('mm-rc-preview-body');

  const titles = {
    agree: 'AGREEMENT INDEX DOCUMENT',
    aadhar: 'TENANT AADHAR CARD',
    police: 'POLICE VERIFICATION LETTER'
  };

  if (titleEl) titleEl.innerHTML = `<i class="bi bi-file-earmark-medical"></i> ${titles[docType] || 'DOCUMENT PREVIEW'} — ${doc.name}`;

  if (bodyEl) {
    if (doc.type && doc.type.includes('pdf')) {
      bodyEl.innerHTML = `<iframe src="${doc.dataUrl}" style="width:100%;height:550px;border:none;border-radius:4px;"></iframe>`;
    } else {
      bodyEl.innerHTML = `<img src="${doc.dataUrl}" alt="Doc Preview" style="max-width:100%;max-height:550px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;">`;
    }
  }

  if (modal) modal.style.display = 'flex';
}

function mmDownloadNocDoc(docType) {
  const doc = mmNocDocs[docType];
  if (!doc || !doc.dataUrl) {
    mmAlert('No document available to download.', true);
    return;
  }
  const a = document.createElement('a');
  a.href = doc.dataUrl;
  a.download = doc.name || `${docType}_document.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function mmDeleteNocDoc(docType) {
  mmConfirm('Are you sure you want to remove this uploaded document?', (ok) => {
    if (!ok) return;
    mmNocDocs[docType] = null;
    const fileInput = document.getElementById(`mm-noc-${docType}-file`);
    const btn = document.getElementById(`mm-noc-${docType}-btn`);
    const btnText = document.getElementById(`mm-noc-${docType}-btn-text`);
    const actionsWrap = document.getElementById(`mm-noc-${docType}-actions`);

    if (fileInput) fileInput.value = '';
    if (btnText) btnText.textContent = 'Choose File';
    if (btn) {
      btn.style.background = '#ffffff';
      btn.style.borderColor = '#0284c7';
      btn.style.color = '#0284c7';
    }
    if (actionsWrap) actionsWrap.style.display = 'none';
    mmShowToast('Document removed.');
  });
}

// ── Tenant Lease History Table ────────────────────────────
function mmRenderTenantHistory() {
  const tbody = document.getElementById('mm-tenant-history-tbody');
  if (!tbody) return;

  if (mmTenantHistoryList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:14px;color:#94a3b8;">No lease history recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = mmTenantHistoryList.map((item, idx) => `
    <tr onclick="mmSelectTenantHistoryRow(${idx})" style="cursor:pointer;${mmSelectedTenantHistoryIdx === idx ? 'background:#e0f2fe;' : ''}">
      <td style="text-align:center;font-weight:bold;">${idx + 1}</td>
      <td style="font-weight:bold;color:#1e3a8a;">${item.tenantName || '—'}</td>
      <td>${item.timePeriod || '—'}</td>
      <td>${item.contact || '—'}</td>
      <td>${item.agreementBetween || '—'}</td>
      <td style="text-align:center;">
        ${item.agreeDoc ? `<button type="button" class="mm-btn mm-btn-icon" onclick="mmPreviewHistoryDoc(${idx}, 'agree')" title="Preview Agreement"><i class="bi bi-file-earmark-check-fill" style="color:#0284c7;"></i></button>` : '—'}
      </td>
      <td style="text-align:center;">
        ${item.aadharDoc ? `<button type="button" class="mm-btn mm-btn-icon" onclick="mmPreviewHistoryDoc(${idx}, 'aadhar')" title="Preview Aadhar"><i class="bi bi-person-badge-fill" style="color:#15803d;"></i></button>` : '—'}
      </td>
      <td style="text-align:center;">
        ${item.policeDoc ? `<button type="button" class="mm-btn mm-btn-icon" onclick="mmPreviewHistoryDoc(${idx}, 'police')" title="Preview Verification"><i class="bi bi-shield-check" style="color:#b45309;"></i></button>` : '—'}
      </td>
    </tr>
  `).join('');
}

function mmSelectTenantHistoryRow(idx) {
  mmSelectedTenantHistoryIdx = idx;
  mmRenderTenantHistory();
}

function mmPreviewHistoryDoc(idx, docType) {
  const item = mmTenantHistoryList[idx];
  if (!item) return;
  const doc = item[`${docType}Doc`];
  if (!doc || !doc.dataUrl) return;

  const modal = document.getElementById('mm-rc-preview-modal');
  const titleEl = document.getElementById('mm-rc-preview-title');
  const bodyEl = document.getElementById('mm-rc-preview-body');

  if (titleEl) titleEl.innerHTML = `<i class="bi bi-file-earmark-medical"></i> HISTORICAL LEASE DOC — ${item.tenantName} (${doc.name})`;
  if (bodyEl) {
    if (doc.type && doc.type.includes('pdf')) {
      bodyEl.innerHTML = `<iframe src="${doc.dataUrl}" style="width:100%;height:550px;border:none;border-radius:4px;"></iframe>`;
    } else {
      bodyEl.innerHTML = `<img src="${doc.dataUrl}" alt="Doc Preview" style="max-width:100%;max-height:550px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;">`;
    }
  }
  if (modal) modal.style.display = 'flex';
}

function mmAlterTenantHistory() {
  if (mmSelectedTenantHistoryIdx < 0 || mmSelectedTenantHistoryIdx >= mmTenantHistoryList.length) {
    mmAlert('Please select a lease history entry to alter.', true);
    return;
  }
  const item = mmTenantHistoryList[mmSelectedTenantHistoryIdx];
  if (!item) return;

  // Populate back into the active form
  setVal('mm-tenant-name', item.tenantName || '');
  setVal('mm-tenant-contact', item.contact || '');
  setVal('mm-nonocc-agreement-assign', item.agreementBetween || '');
  mmSetNocStatus(true);
  mmTenantHistoryList.splice(mmSelectedTenantHistoryIdx, 1);
  mmSelectedTenantHistoryIdx = -1;
  mmRenderTenantHistory();
  mmShowToast('Lease entry loaded for editing.', 'success');
}

function mmDeleteTenantHistory() {
  if (mmSelectedTenantHistoryIdx < 0 || mmSelectedTenantHistoryIdx >= mmTenantHistoryList.length) {
    mmAlert('Please select a lease history entry to delete.', true);
    return;
  }
  mmConfirm('Delete the selected historical lease entry?', (ok) => {
    if (!ok) return;
    mmTenantHistoryList.splice(mmSelectedTenantHistoryIdx, 1);
    mmSelectedTenantHistoryIdx = -1;
    mmRenderTenantHistory();
    mmShowToast('Lease history entry deleted.', 'success');
  });
}

window.mmSave = mmSave;
window.mmShowList = mmShowList;
window.mmToggleSearch = mmToggleSearch;
window.mmToggleMultiDelete = mmToggleMultiDelete;
window.mmToggleAll = mmToggleAll;
window.mmChk = mmChk;
window.mmCloseAlert = mmCloseAlert;
window.mmCloseConfirm = mmCloseConfirm;
window.mmPrint = mmPrint;
window.mmExportExcel = mmExportExcel;
window.mmExit = mmExit;
window.mmRenderList = mmRenderList;
window.mmSelectRow = mmSelectRow;
window.mmAlterById = mmAlterById;
window.mmSwitchTab = mmSwitchTab;
window.mmOnTransferToggleChange = mmOnTransferToggleChange;
window.mmToggleNocStatus = mmToggleNocStatus;
window.mmToggleNocDocWrap = mmToggleNocDocWrap;
window.mmToggleAdditionalInfo = mmToggleAdditionalInfo;
window.mmAddAdditionalRow = mmAddAdditionalRow;
window.mmHandleDocFile = mmHandleDocFile;
window.mmCalcTotalBal = mmCalcTotalBal;
window.mmCalcParkingTotals = mmCalcParkingTotals;
window.mmCalcShareCertValues = mmCalcShareCertValues;
window.mmAddActiveNomineeRow = mmAddActiveNomineeRow;
window.mmExecuteMemberTransfer = mmExecuteMemberTransfer;
window.mmShowStatement = mmShowStatement;
window.mmCloseDetail = mmCloseDetail;
window.mmPrintDetail = mmPrintDetail;
window.mmOpenBulkReassign = mmOpenBulkReassign;
window.mmApplyBulkReassign = mmApplyBulkReassign;
window.mmOpenImportCSV = mmOpenImportCSV;
window.mmProcessImportCSV = mmProcessImportCSV;
window.mmAlterTenantHistory = mmAlterTenantHistory;
window.mmDeleteTenantHistory = mmDeleteTenantHistory;
window.mmArchiveCurrentLien = mmArchiveCurrentLien;
window.mmToggleOldShareCert = mmToggleOldShareCert;
window.mmAddJointOwnerBlock = mmAddJointOwnerBlock;
window.mmSaveNomination = mmSaveNomination;
window.mmLoadTransferHistoryLog = mmLoadTransferHistoryLog;
window.mmOpenTransferPreview = mmOpenTransferPreview;
window.mmCloseTransferPreview = mmCloseTransferPreview;
window.mmPrintTransferPreview = mmPrintTransferPreview;
window.mmDownloadTransferPreviewHtml = mmDownloadTransferPreviewHtml;
window.mmOpenTransferDocs = mmOpenTransferDocs;
window.mmLoadBreakupBillTypes = mmLoadBreakupBillTypes;
window.mmSelectBreakupBillType = mmSelectBreakupBillType;
window.mmToggleBreakupEdit = mmToggleBreakupEdit;
window.mmCalcBreakupTotal = mmCalcBreakupTotal;
window.mmSaveMemberBillBreakup = mmSaveMemberBillBreakup;
// ── Custom Unit Type & Flat Type Add+ Logic ───────────────
let mmCustomUnitTypes = [];
let mmCustomFlatTypes = [];

function mmLoadCustomTypes() {
  try {
    const savedUnitTypes = localStorage.getItem('mm_custom_unit_types');
    if (savedUnitTypes) {
      mmCustomUnitTypes = JSON.parse(savedUnitTypes);
      const sel = document.getElementById('mm-unittype');
      if (sel) {
        mmCustomUnitTypes.forEach(t => {
          if (!sel.querySelector(`option[value="${t}"]`)) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            const addOpt = sel.querySelector('option[value="__ADD_UNIT_TYPE__"]');
            if (addOpt) sel.insertBefore(opt, addOpt);
            else sel.appendChild(opt);
          }
        });
      }
    }

    const savedFlatTypes = localStorage.getItem('mm_custom_flat_types');
    if (savedFlatTypes) {
      mmCustomFlatTypes = JSON.parse(savedFlatTypes);
      const sel = document.getElementById('mm-flattype');
      if (sel) {
        mmCustomFlatTypes.forEach(t => {
          if (!sel.querySelector(`option[value="${t}"]`)) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            const addOpt = sel.querySelector('option[value="__ADD_FLAT_TYPE__"]');
            if (addOpt) sel.insertBefore(opt, addOpt);
            else sel.appendChild(opt);
          }
        });
      }
    }
  } catch (e) { console.warn('Error loading custom unit/flat types', e); }
}

function mmUpdateUnitTypeLabels(typeVal) {
  const t = (typeVal || '').trim();
  let baseUpper = 'FLAT';
  let baseTitle = 'Flat';

  if (t && t !== '__ADD_UNIT_TYPE__') {
    if (/^shop$/i.test(t)) {
      baseUpper = 'SHOP';
      baseTitle = 'Shop';
    } else if (/^office$/i.test(t)) {
      baseUpper = 'OFFICE';
      baseTitle = 'Office';
    } else if (/^unit$/i.test(t)) {
      baseUpper = 'UNIT';
      baseTitle = 'Unit';
    } else if (/^room$/i.test(t)) {
      baseUpper = 'ROOM';
      baseTitle = 'Room';
    } else if (/^residential$/i.test(t)) {
      baseUpper = 'FLAT';
      baseTitle = 'Flat';
    } else {
      baseUpper = t.toUpperCase();
      baseTitle = t.charAt(0).toUpperCase() + t.slice(1);
    }
  }

  // Dynamic label for Flat No. / Shop No. / Office No.
  const lblFlatNo = document.getElementById('lbl-mm-flatno');
  if (lblFlatNo) {
    lblFlatNo.innerHTML = `${baseUpper} NO. <span style="color:red;">*</span>`;
  }

  // Dynamic label for Flat Type / Shop Type / Office Type
  const lblFlatType = document.getElementById('lbl-mm-flattype');
  if (lblFlatType) {
    lblFlatType.textContent = `${baseUpper} TYPE`;
  }

  // Dynamic placeholder for input
  const inpFlatNo = document.getElementById('mm-flatno');
  if (inpFlatNo) {
    inpFlatNo.placeholder = baseTitle === 'Shop' ? 'e.g. S-101' : (baseTitle === 'Office' ? 'e.g. O-101' : 'e.g. 101');
  }

  // Dynamic first option in Flat Type dropdown
  const selFlatType = document.getElementById('mm-flattype');
  if (selFlatType && selFlatType.options.length > 0) {
    selFlatType.options[0].text = `-- Select ${baseTitle} Type --`;
  }

  // Dynamic title in Add New Flat Type modal
  const modalTitle = document.getElementById('lbl-mm-new-flat-type-title');
  if (modalTitle) {
    modalTitle.innerHTML = `<i class="bi bi-plus-circle-fill"></i> ADD NEW ${baseUpper} TYPE`;
  }

  const modalLbl = document.getElementById('lbl-mm-new-flat-type-name');
  if (modalLbl) {
    modalLbl.textContent = `${baseUpper} TYPE NAME:`;
  }
}

function mmOnUnitTypeChange(val) {
  if (val === '__ADD_UNIT_TYPE__') {
    const input = document.getElementById('mm-new-unit-type-input');
    if (input) input.value = '';
    const overlay = document.getElementById('mm-add-unit-type-overlay');
    if (overlay) overlay.style.display = 'flex';
    setTimeout(() => input && input.focus(), 100);
    return;
  }
  mmUpdateUnitTypeLabels(val);
}

function mmCloseAddUnitType() {
  const overlay = document.getElementById('mm-add-unit-type-overlay');
  if (overlay) overlay.style.display = 'none';
  const sel = document.getElementById('mm-unittype');
  if (sel && sel.value === '__ADD_UNIT_TYPE__') {
    sel.value = '';
    mmUpdateUnitTypeLabels('');
  }
}

function mmSaveNewUnitType() {
  const input = document.getElementById('mm-new-unit-type-input');
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) {
    mmAlert('Please enter a Unit Type Name.', true);
    return;
  }

  const sel = document.getElementById('mm-unittype');
  if (sel) {
    let opt = sel.querySelector(`option[value="${newName}"]`);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = newName;
      opt.textContent = newName;
      const addOpt = sel.querySelector('option[value="__ADD_UNIT_TYPE__"]');
      if (addOpt) sel.insertBefore(opt, addOpt);
      else sel.appendChild(opt);

      if (!mmCustomUnitTypes.includes(newName)) {
        mmCustomUnitTypes.push(newName);
        localStorage.setItem('mm_custom_unit_types', JSON.stringify(mmCustomUnitTypes));
      }
    }
    sel.value = newName;
    mmUpdateUnitTypeLabels(newName);
  }

  document.getElementById('mm-add-unit-type-overlay').style.display = 'none';
}

function mmOnFlatTypeChange(val) {
  if (val === '__ADD_FLAT_TYPE__') {
    const input = document.getElementById('mm-new-flat-type-input');
    if (input) input.value = '';
    const overlay = document.getElementById('mm-add-flat-type-overlay');
    if (overlay) overlay.style.display = 'flex';
    setTimeout(() => input && input.focus(), 100);
  }
}

function mmCloseAddFlatType() {
  const overlay = document.getElementById('mm-add-flat-type-overlay');
  if (overlay) overlay.style.display = 'none';
  const sel = document.getElementById('mm-flattype');
  if (sel && sel.value === '__ADD_FLAT_TYPE__') {
    sel.value = '';
  }
}

function mmSaveNewFlatType() {
  const input = document.getElementById('mm-new-flat-type-input');
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) {
    mmAlert('Please enter a Flat Type Name.', true);
    return;
  }

  const sel = document.getElementById('mm-flattype');
  if (sel) {
    let opt = sel.querySelector(`option[value="${newName}"]`);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = newName;
      opt.textContent = newName;
      const addOpt = sel.querySelector('option[value="__ADD_FLAT_TYPE__"]');
      if (addOpt) sel.insertBefore(opt, addOpt);
      else sel.appendChild(opt);

      if (!mmCustomFlatTypes.includes(newName)) {
        mmCustomFlatTypes.push(newName);
        localStorage.setItem('mm_custom_flat_types', JSON.stringify(mmCustomFlatTypes));
      }
    }
    sel.value = newName;
  }

  document.getElementById('mm-add-flat-type-overlay').style.display = 'none';
}

// ── TAB 3: PARKING SLOT & RC UPLOAD LOGIC ──────────────────
let mmParkingRcDocs = {};
let mmActiveRcSlotKey = '';
let mmBulkRcFileList = [];
let mmCustomParkingRowCount = 0;

async function mmCalcParkingTotals() {
  // 4-Wheeler Total
  let total4W = 0;
  const inputs4W = document.querySelectorAll('#mm-park4-rows-container .mm-park-charge-input');
  inputs4W.forEach(inp => {
    total4W += parseFloat(inp.value) || 0;
  });
  const t4El = document.getElementById('mm-park4-total');
  if (t4El) t4El.value = total4W.toString();

  // 2-Wheeler Total
  let total2W = 0;
  const inputs2W = document.querySelectorAll('#mm-park2-rows-container .mm-park-charge-input');
  inputs2W.forEach(inp => {
    total2W += parseFloat(inp.value) || 0;
  });
  const t2El = document.getElementById('mm-park2-total');
  if (t2El) t2El.value = total2W.toString();

  // Check account configurations in Bill Types
  let check4W = { configured: true };
  let check2W = { configured: true };
  if (typeof mmCheckParkingConfiguredInBillTypes === 'function') {
    check4W = await mmCheckParkingConfiguredInBillTypes('4w');
    check2W = await mmCheckParkingConfiguredInBillTypes('2w');
  }

  const combSelect = document.getElementById('mm-park-bill-combined');
  const combVal = combSelect ? combSelect.value : 'Both';

  let grandTotal = 0;
  if (check4W.configured && check2W.configured) {
    if (combVal === '4-Wheeler') {
      grandTotal = total4W;
    } else if (combVal === '2-Wheeler') {
      grandTotal = total2W;
    } else {
      grandTotal = total4W + total2W;
    }
  } else if (check4W.configured && !check2W.configured) {
    grandTotal = total4W;
  } else if (!check4W.configured && check2W.configured) {
    grandTotal = total2W;
  } else {
    grandTotal = 0;
  }

  const grandEl = document.getElementById('mm-park-grand-total');
  if (grandEl) grandEl.value = grandTotal.toString();
}

// ── Single Row RC Upload & Actions ────────────────────────
function mmTriggerRowRcUpload(slotKey) {
  mmActiveRcSlotKey = slotKey;
  const fileInput = document.getElementById('mm-single-rc-file-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

function mmHandleSingleRcFileSelected(input) {
  const file = input.files && input.files[0];
  if (!file || !mmActiveRcSlotKey) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    mmParkingRcDocs[mmActiveRcSlotKey] = {
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.type,
      dataUrl: e.target.result,
      uploadTime: new Date().toLocaleTimeString()
    };
    mmRenderRowRcActions(mmActiveRcSlotKey);
    mmAlert(`RC Book document "${file.name}" uploaded for slot.`);
  };
  reader.readAsDataURL(file);
}

function mmRenderRowRcActions(slotKey) {
  const wrap = document.getElementById(`mm-rc-wrap-${slotKey}`);
  if (!wrap) return;

  const doc = mmParkingRcDocs[slotKey];
  if (doc && doc.dataUrl) {
    // Show 5 Action Buttons: [Upload/Replace], [Download], [Preview], [Scan], [Delete]
    wrap.innerHTML = `
      <button type="button" class="mm-btn mm-btn-icon" onclick="mmTriggerRowRcUpload('${slotKey}')" title="Re-upload / Replace RC (${doc.name})"><i class="bi bi-upload"></i></button>
      <button type="button" class="mm-btn mm-btn-icon" onclick="mmDownloadRowRc('${slotKey}')" title="Download RC"><i class="bi bi-download"></i></button>
      <button type="button" class="mm-btn mm-btn-icon" onclick="mmPreviewRowRc('${slotKey}')" title="Preview RC"><i class="bi bi-eye"></i></button>
      <button type="button" class="mm-btn mm-btn-icon" onclick="mmScanRowRc('${slotKey}')" title="Scan / Read RC Details"><i class="bi bi-qr-code-scan"></i></button>
      <button type="button" class="mm-btn mm-btn-icon mm-btn-danger-outline" onclick="mmDeleteRowRc('${slotKey}')" title="Remove RC"><i class="bi bi-x-lg"></i></button>
    `;
  } else {
    // Default 1 Upload Button
    wrap.innerHTML = `
      <button type="button" class="mm-btn mm-btn-icon" onclick="mmTriggerRowRcUpload('${slotKey}')" title="Upload RC"><i class="bi bi-upload"></i></button>
    `;
  }
}

function mmDownloadRowRc(slotKey) {
  const doc = mmParkingRcDocs[slotKey];
  if (!doc || !doc.dataUrl) {
    mmAlert('No RC document found for this slot.', true);
    return;
  }
  const a = document.createElement('a');
  a.href = doc.dataUrl;
  a.download = doc.name || `RC_Document_${slotKey}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function mmPreviewRowRc(slotKey) {
  const doc = mmParkingRcDocs[slotKey];
  if (!doc || !doc.dataUrl) {
    mmAlert('No RC document uploaded to preview.', true);
    return;
  }

  const modal = document.getElementById('mm-rc-preview-modal');
  const titleEl = document.getElementById('mm-rc-preview-title');
  const bodyEl = document.getElementById('mm-rc-preview-body');

  if (titleEl) titleEl.innerHTML = `<i class="bi bi-file-earmark-medical"></i> RC DOCUMENT PREVIEW — ${doc.name}`;
  
  if (bodyEl) {
    if (doc.type && doc.type.includes('pdf')) {
      bodyEl.innerHTML = `<iframe src="${doc.dataUrl}" style="width:100%;height:550px;border:none;border-radius:4px;"></iframe>`;
    } else {
      bodyEl.innerHTML = `<img src="${doc.dataUrl}" alt="RC Preview" style="max-width:100%;max-height:550px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;">`;
    }
  }

  if (modal) modal.style.display = 'flex';
}

function mmScanRowRc(slotKey) {
  const doc = mmParkingRcDocs[slotKey];
  if (!doc) {
    mmAlert('Please upload an RC document before scanning.', true);
    return;
  }

  // Find reg number from the row input if present
  const row = document.querySelector(`.mm-park-row[data-slot-key="${slotKey}"]`);
  let regNo = '';
  if (row) {
    const regInput = row.querySelectorAll('input[type="text"]')[1];
    if (regInput) regNo = regInput.value;
  }
  if (!regNo) regNo = 'MH-12-AB-1234';

  const modal = document.getElementById('mm-rc-preview-modal');
  const titleEl = document.getElementById('mm-rc-preview-title');
  const bodyEl = document.getElementById('mm-rc-preview-body');

  if (titleEl) titleEl.innerHTML = `<i class="bi bi-qr-code-scan"></i> VEHICLE RC SCAN & OCR DETAILS`;

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="width:100%;max-width:550px;display:flex;flex-direction:column;gap:12px;font-size:12px;">
        <div style="padding:10px;background:#f0fdf4;border:1px solid #86efac;border-radius:4px;color:#166534;font-weight:bold;display:flex;align-items:center;gap:8px;">
          <i class="bi bi-check-circle-fill"></i> RC Book verified &amp; OCR processed successfully!
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;font-weight:bold;color:#475569;width:160px;">REGISTRATION NO:</td><td style="padding:6px 8px;font-weight:bold;color:#1565C0;">${regNo}</td></tr>
          <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;font-weight:bold;color:#475569;">DOCUMENT FILE:</td><td style="padding:6px 8px;">${doc.name} (${doc.size})</td></tr>
          <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;font-weight:bold;color:#475569;">VEHICLE CLASS:</td><td style="padding:6px 8px;">MOTOR CAR (LMV) / TWO WHEELER</td></tr>
          <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;font-weight:bold;color:#475569;">OWNER NAME:</td><td style="padding:6px 8px;">${val('mm-name1') || 'Society Member'}</td></tr>
          <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;font-weight:bold;color:#475569;">REGISTERING AUTH:</td><td style="padding:6px 8px;">RTO PUNE (MH-12)</td></tr>
          <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;font-weight:bold;color:#475569;">FITNESS VALIDITY:</td><td style="padding:6px 8px;color:#15803d;font-weight:bold;">VALID UP TO 14-OCT-2035</td></tr>
          <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;font-weight:bold;color:#475569;">INSURANCE STATUS:</td><td style="padding:6px 8px;color:#15803d;font-weight:bold;">ACTIVE</td></tr>
          <tr><td style="padding:6px 8px;font-weight:bold;color:#475569;">PUC VALIDITY:</td><td style="padding:6px 8px;color:#15803d;font-weight:bold;">VALID</td></tr>
        </table>
      </div>
    `;
  }

  if (modal) modal.style.display = 'flex';
}

function mmDeleteRowRc(slotKey) {
  mmConfirm('Are you sure you want to remove the uploaded RC document for this slot?', (ok) => {
    if (!ok) return;
    delete mmParkingRcDocs[slotKey];
    mmRenderRowRcActions(slotKey);
    mmAlert('RC document removed.');
  });
}

function mmCloseRcPreview() {
  const modal = document.getElementById('mm-rc-preview-modal');
  if (modal) modal.style.display = 'none';
}

// ── ADD PARKING SLOT ROW MODAL LOGIC (Image 3 & 4) ────────
function mmOpenAddParkingRowModal() {
  const modal = document.getElementById('mm-parking-add-row-modal');
  const headInput = document.getElementById('mm-add-park-head-name');
  const typeSel = document.getElementById('mm-add-park-wheeler-type');

  if (headInput) headInput.value = '';
  if (typeSel) typeSel.value = '4-Wheeler';
  if (modal) modal.style.display = 'flex';
  setTimeout(() => headInput && headInput.focus(), 100);
}

function mmCloseAddParkingRowModal() {
  const modal = document.getElementById('mm-parking-add-row-modal');
  if (modal) modal.style.display = 'none';
}

function mmConfirmAddParkingRow() {
  const headInput = document.getElementById('mm-add-park-head-name');
  const typeSel = document.getElementById('mm-add-park-wheeler-type');

  const headName = headInput ? headInput.value.trim() : '';
  const wheelerType = typeSel ? typeSel.value : '4-Wheeler';

  if (!headName) {
    mmAlert('Please enter a Head Name (e.g. Backyard, Garage, Roof).', true);
    if (headInput) headInput.focus();
    return;
  }

  mmCustomParkingRowCount++;
  const normHead = headName.toUpperCase();

  if (wheelerType === '4-Wheeler' || wheelerType.includes('Both')) {
    const container4W = document.getElementById('mm-park4-rows-container');
    if (container4W) {
      const slotKey = `4w_custom_${mmCustomParkingRowCount}_${Date.now()}`;
      const div = document.createElement('div');
      div.className = 'mm-park-row';
      div.setAttribute('data-wheeler-type', '4-Wheeler');
      div.setAttribute('data-slot-key', slotKey);
      div.innerHTML = `
        <label>${normHead} SLOT NO.</label>
        <input type="text" class="mm-input" placeholder="e.g. ${headName}-1" value="">
        <label>${normHead} REG NO.</label>
        <input type="text" class="mm-input" placeholder="MH-12-AB-1234" value="">
        <label>CHARGES (₹)</label>
        <input type="number" class="mm-input mm-park-charge-input" value="0" oninput="mmOnParkingChargeInput(this, '4w')">
        <label>RC UPLOAD</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="mm-rc-actions-wrap" id="mm-rc-wrap-${slotKey}">
            <button type="button" class="mm-btn mm-btn-icon" onclick="mmTriggerRowRcUpload('${slotKey}')" title="Upload RC"><i class="bi bi-upload"></i></button>
          </div>
          <button type="button" class="mm-btn mm-btn-icon mm-btn-danger-outline" onclick="mmRemoveCustomParkingRow(this)" title="Delete this slot row" style="border-color:#ef4444;color:#ef4444;"><i class="bi bi-trash"></i></button>
        </div>
      `;
      container4W.appendChild(div);
    }
  }

  if (wheelerType === '2-Wheeler' || wheelerType.includes('Both')) {
    const container2W = document.getElementById('mm-park2-rows-container');
    if (container2W) {
      const slotKey = `2w_custom_${mmCustomParkingRowCount}_${Date.now()}`;
      const div = document.createElement('div');
      div.className = 'mm-park-row';
      div.setAttribute('data-wheeler-type', '2-Wheeler');
      div.setAttribute('data-slot-key', slotKey);
      div.innerHTML = `
        <label>${normHead} SLOT NO.</label>
        <input type="text" class="mm-input" placeholder="e.g. ${headName}-1" value="">
        <label>${normHead} REG NO.</label>
        <input type="text" class="mm-input" placeholder="MH-12-XY-9999" value="">
        <label>CHARGES (₹)</label>
        <input type="number" class="mm-input mm-park-charge-input" value="0" oninput="mmOnParkingChargeInput(this, '2w')">
        <label>RC UPLOAD</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="mm-rc-actions-wrap" id="mm-rc-wrap-${slotKey}">
            <button type="button" class="mm-btn mm-btn-icon" onclick="mmTriggerRowRcUpload('${slotKey}')" title="Upload RC"><i class="bi bi-upload"></i></button>
          </div>
          <button type="button" class="mm-btn mm-btn-icon mm-btn-danger-outline" onclick="mmRemoveCustomParkingRow(this)" title="Delete this slot row" style="border-color:#ef4444;color:#ef4444;"><i class="bi bi-trash"></i></button>
        </div>
      `;
      container2W.appendChild(div);
    }
  }

  mmCalcParkingTotals();
  mmCloseAddParkingRowModal();
  mmAlert(`Parking Slot "${headName}" added.`);
}

function mmRemoveCustomParkingRow(btn) {
  const row = btn.closest('.mm-park-row');
  if (row) {
    const slotKey = row.getAttribute('data-slot-key');
    if (slotKey && mmParkingRcDocs[slotKey]) {
      delete mmParkingRcDocs[slotKey];
    }
    row.remove();
    mmCalcParkingTotals();
  }
}

// ── BULK RC UPLOAD MODAL LOGIC (Image 5) ──────────────────
function mmOpenBulkRcModal() {
  const modal = document.getElementById('mm-parking-bulk-rc-modal');
  if (modal) modal.style.display = 'flex';
  mmRenderBulkRcItems();
}

function mmCloseBulkRcModal() {
  const modal = document.getElementById('mm-parking-bulk-rc-modal');
  if (modal) modal.style.display = 'none';
}

function mmHandleBulkRcFiles(input) {
  const files = input.files;
  if (!files || files.length === 0) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const reader = new FileReader();
    reader.onload = function (e) {
      mmBulkRcFileList.push({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type,
        dataUrl: e.target.result
      });
      mmRenderBulkRcItems();
    };
    reader.readAsDataURL(file);
  }
  input.value = '';
}

function mmRenderBulkRcItems() {
  const emptyMsg = document.getElementById('mm-bulk-rc-empty-msg');
  const itemsContainer = document.getElementById('mm-bulk-rc-items');

  if (!itemsContainer || !emptyMsg) return;

  if (mmBulkRcFileList.length === 0) {
    emptyMsg.style.display = 'block';
    itemsContainer.style.display = 'none';
    itemsContainer.innerHTML = '';
  } else {
    emptyMsg.style.display = 'none';
    itemsContainer.style.display = 'flex';
    itemsContainer.innerHTML = mmBulkRcFileList.map((item, idx) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#ffffff;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;">
        <div style="display:flex;align-items:center;gap:8px;overflow:hidden;">
          <i class="bi ${item.type && item.type.includes('pdf') ? 'bi-file-earmark-pdf-fill' : 'bi-file-earmark-image-fill'}" style="font-size:16px;color:#1565C0;"></i>
          <span style="font-weight:bold;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px;" title="${item.name}">${item.name}</span>
          <span style="color:#64748b;font-size:10px;">(${item.size})</span>
        </div>
        <div style="display:flex;gap:4px;">
          <button type="button" class="mm-btn mm-btn-icon" onclick="mmPreviewBulkRcItem(${idx})" title="Preview"><i class="bi bi-eye"></i></button>
          <button type="button" class="mm-btn mm-btn-icon" onclick="mmDownloadBulkRcItem(${idx})" title="Download"><i class="bi bi-download"></i></button>
          <button type="button" class="mm-btn mm-btn-icon mm-btn-danger-outline" onclick="mmDeleteBulkRcItem(${idx})" title="Delete"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `).join('');
  }
}

function mmPreviewBulkRcItem(index) {
  const item = mmBulkRcFileList[index];
  if (!item) return;

  const modal = document.getElementById('mm-rc-preview-modal');
  const titleEl = document.getElementById('mm-rc-preview-title');
  const bodyEl = document.getElementById('mm-rc-preview-body');

  if (titleEl) titleEl.innerHTML = `<i class="bi bi-file-earmark-medical"></i> RC DOCUMENT PREVIEW — ${item.name}`;
  if (bodyEl) {
    if (item.type && item.type.includes('pdf')) {
      bodyEl.innerHTML = `<iframe src="${item.dataUrl}" style="width:100%;height:550px;border:none;border-radius:4px;"></iframe>`;
    } else {
      bodyEl.innerHTML = `<img src="${item.dataUrl}" alt="RC Preview" style="max-width:100%;max-height:550px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;">`;
    }
  }
  if (modal) modal.style.display = 'flex';
}

function mmDownloadBulkRcItem(index) {
  const item = mmBulkRcFileList[index];
  if (!item) return;
  const a = document.createElement('a');
  a.href = item.dataUrl;
  a.download = item.name || 'RC_Document.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function mmDeleteBulkRcItem(index) {
  mmBulkRcFileList.splice(index, 1);
  mmRenderBulkRcItems();
}

window.mmShowToast = mmShowToast;
window.mmSetNocStatus = mmSetNocStatus;
window.mmToggleNocStatus = mmToggleNocStatus;
window.mmToggleNocDocWrap = mmToggleNocDocWrap;
window.mmTriggerNocDocUpload = mmTriggerNocDocUpload;
window.mmHandleNocDocUpload = mmHandleNocDocUpload;
window.mmPreviewNocDoc = mmPreviewNocDoc;
window.mmDownloadNocDoc = mmDownloadNocDoc;
window.mmDeleteNocDoc = mmDeleteNocDoc;
window.mmTriggerLienDocUpload = mmTriggerLienDocUpload;
window.mmHandleLienDocUpload = mmHandleLienDocUpload;
window.mmPreviewLienDoc = mmPreviewLienDoc;
window.mmDownloadLienDoc = mmDownloadLienDoc;
window.mmDeleteLienDoc = mmDeleteLienDoc;
window.mmDeleteLienHistory = mmDeleteLienHistory;
window.mmTriggerNomineeDocUpload = mmTriggerNomineeDocUpload;
window.mmHandleNomineeDocUpload = mmHandleNomineeDocUpload;
window.mmPreviewNomineeDoc = mmPreviewNomineeDoc;
window.mmDownloadNomineeDoc = mmDownloadNomineeDoc;
window.mmDeleteNomineeDoc = mmDeleteNomineeDoc;
window.mmRenderTenantHistory = mmRenderTenantHistory;
window.mmSelectTenantHistoryRow = mmSelectTenantHistoryRow;
window.mmPreviewHistoryDoc = mmPreviewHistoryDoc;
window.mmAlterTenantHistory = mmAlterTenantHistory;
window.mmDeleteTenantHistory = mmDeleteTenantHistory;
window.mmCalcParkingTotals = mmCalcParkingTotals;
window.mmTriggerRowRcUpload = mmTriggerRowRcUpload;
window.mmHandleSingleRcFileSelected = mmHandleSingleRcFileSelected;
window.mmRenderRowRcActions = mmRenderRowRcActions;
window.mmDownloadRowRc = mmDownloadRowRc;
window.mmPreviewRowRc = mmPreviewRowRc;
window.mmScanRowRc = mmScanRowRc;
window.mmDeleteRowRc = mmDeleteRowRc;
window.mmCloseRcPreview = mmCloseRcPreview;
window.mmOpenAddParkingRowModal = mmOpenAddParkingRowModal;
window.mmCloseAddParkingRowModal = mmCloseAddParkingRowModal;
window.mmConfirmAddParkingRow = mmConfirmAddParkingRow;
window.mmRemoveCustomParkingRow = mmRemoveCustomParkingRow;
window.mmOpenBulkRcModal = mmOpenBulkRcModal;
window.mmCloseBulkRcModal = mmCloseBulkRcModal;
window.mmHandleBulkRcFiles = mmHandleBulkRcFiles;
window.mmRenderBulkRcItems = mmRenderBulkRcItems;
window.mmPreviewBulkRcItem = mmPreviewBulkRcItem;
window.mmDownloadBulkRcItem = mmDownloadBulkRcItem;
window.mmDeleteBulkRcItem = mmDeleteBulkRcItem;
window.mmOnUnitTypeChange = mmOnUnitTypeChange;
window.mmUpdateUnitTypeLabels = mmUpdateUnitTypeLabels;
window.mmCloseAddUnitType = mmCloseAddUnitType;
window.mmSaveNewUnitType = mmSaveNewUnitType;
window.mmOnFlatTypeChange = mmOnFlatTypeChange;
window.mmCloseAddFlatType = mmCloseAddFlatType;
window.mmSaveNewFlatType = mmSaveNewFlatType;
window.mmCheckNocConfiguredInBillTypes = mmCheckNocConfiguredInBillTypes;
window.mmGetNocAmountFromMatrix = mmGetNocAmountFromMatrix;
window.mmSyncNocToMatrixCache = mmSyncNocToMatrixCache;
window.mmOnNocChargesInput = mmOnNocChargesInput;
window.mmOnBreakupInput = mmOnBreakupInput;
window.mmCheckParkingConfiguredInBillTypes = mmCheckParkingConfiguredInBillTypes;
window.mmOnParkingChargeInput = mmOnParkingChargeInput;
window.mmSyncParkingToMatrixAndBreakup = mmSyncParkingToMatrixAndBreakup;
window.mmGetParkingAmountFromMatrix = mmGetParkingAmountFromMatrix;
window.mmHandlePersonKeyNav = mmHandlePersonKeyNav;
window.MM_28_COLUMNS = MM_28_COLUMNS;
window.mmOpenBulkImportModal = mmOpenBulkImportModal;
window.mmDownloadMemberTemplate = mmDownloadMemberTemplate;
window.mmExportMembers = mmExportMembers;
window.mmProcessMemberBulkImport = mmProcessMemberBulkImport;
window.mmHandleFileDrop = mmHandleFileDrop;
window.mmHandleImportFileSelect = mmHandleImportFileSelect;

// Module entry point for workspace.html
window.init_member_master = function () { mmLoadCustomTypes(); mmLoadList(); };


