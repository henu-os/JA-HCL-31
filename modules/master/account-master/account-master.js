// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Account Master JS
// Real-time backend API sync: /api/accounts
// ═══════════════════════════════════════════════════════════

'use strict';

let amList             = [];
let amGroupList        = [];
let amSelectedId       = 0;
let amChecked          = {};
let amMultiMode        = false;
let amConfirmCb        = null;
let amModalGroupIdx    = 0;
let amFilteredModalGrp = [];

const mainNames = { 1: 'Asset', 2: 'Liability', 3: 'Income', 4: 'Expenditure' };
const accPrefix = { 1: 'ASS', 2: 'LIA', 3: 'INC', 4: 'EXP' };

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  amInitWorkspaceLabel();
  await amLoadGroups();
  await amLoadList();
  amSetupKeyboardNav();

  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action') || urlParams.get('mode');
  let alterId = urlParams.get('id') || urlParams.get('accountId') || urlParams.get('socAccId');
  let alterCode = urlParams.get('code') || urlParams.get('accCode');
  let alterName = urlParams.get('name') || urlParams.get('accName');

  const pendingRaw = sessionStorage.getItem('jeevika_account_master_pending_alter');
  if (pendingRaw) {
    sessionStorage.removeItem('jeevika_account_master_pending_alter');
    try {
      const parsed = JSON.parse(pendingRaw);
      if (parsed && typeof parsed === 'object') {
        alterId = alterId || parsed.id;
        alterCode = alterCode || parsed.code;
        alterName = alterName || parsed.name;
      } else {
        alterId = alterId || pendingRaw;
      }
    } catch (e) {
      alterId = alterId || pendingRaw;
    }
  }

  if (action === 'add') {
    setTimeout(amAdd, 250);
  } else if (action === 'alter' || action === 'edit' || alterId || alterCode) {
    setTimeout(() => {
      amAlterById(alterId, alterCode, alterName);
    }, 250);
  }
});

window.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.action === 'add' || e.data === 'addAccount') {
    amAdd();
  } else if (e.data.action === 'alter' || e.data.action === 'edit') {
    const id = e.data.id || e.data.accountId || e.data.socAccId;
    const code = e.data.code || e.data.accCode;
    const name = e.data.name || e.data.accName;
    if (id || code || name) {
      amAlterById(id, code, name);
    } else {
      amAlter();
    }
  }
});

function amApiBase() {
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.AppConfig && window.AppConfig.apiBase) return window.AppConfig.apiBase;
  return 'http://localhost:5002';
}

function amGetActiveSocietyCode() {
  return localStorage.getItem('activeSocietyCode') || sessionStorage.getItem('activeSocietyCode') || '';
}

function amInitWorkspaceLabel() {
  const socCode = amGetActiveSocietyCode();
  const socName = localStorage.getItem('activeSocietyName') || sessionStorage.getItem('activeSocietyName') || 'Sai Ram Society';
  const socSpan = document.querySelector('.am-soc-span');
  const fySpan  = document.querySelector('.am-fy-span');
  if (socSpan) socSpan.textContent = socName ? `${socName} (${socCode || 'SRS001'})` : '—';
  if (fySpan)  fySpan.textContent  = '2025-26';
}

function amGetActiveSocietyId() {
  const id = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
  return id ? parseInt(id, 10) : 0;
}

function amGetActiveFYId() {
  const id = (window.Auth && Auth.getFYId) ? Auth.getFYId() : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId'));
  return id ? parseInt(id, 10) : 0;
}

// ── Load Groups for Selection ──────────────────────────────
async function amLoadGroups() {
  try {
    const socId = amGetActiveSocietyId();
    const url = socId > 0 ? `${amApiBase()}/api/groups?societyId=${socId}` : `${amApiBase()}/api/groups`;
    const res  = await fetch(url, { headers: getAuthHeaders() });
    const json = await res.json();
    if (res.ok && json.success) {
      amGroupList = Array.isArray(json.data) ? json.data : [];
    }
  } catch (e) {
    console.error('Failed loading groups:', e);
  }
}

// ── Load Accounts List ────────────────────────────────────
async function amLoadList() {
  const tbody = document.getElementById('am-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#808080;">
    <i class="bi bi-hourglass-split"></i> Loading accounts...</td></tr>`;

  try {
    const socId = amGetActiveSocietyId();
    const fyId  = amGetActiveFYId();
    const url = socId > 0 
      ? `${amApiBase()}/api/accounts?societyId=${socId}${fyId > 0 ? `&fyId=${fyId}` : ''}` 
      : `${amApiBase()}/api/accounts`;
    const res  = await fetch(url, { headers: getAuthHeaders() });
    const json = await res.json();

    if (!res.ok) throw new Error(json.message || 'API error');

    amList = Array.isArray(json.data) ? json.data : [];

    amList.forEach(a => {
      const code = a.accCode || a.AccCode || '';
      const def  = a.isDefault || a.IsDefault || false;
      a._isDefault = def;
      a._code      = def ? `${code} (D)` : code;
    });

    // Sort order: 3=Income, 4=Expenditure, 1=Asset, 2=Liability
    const typeOrder = { 3: 1, 4: 2, 1: 3, 2: 4 };
    amList.sort((a, b) => {
      const orderA = typeOrder[a.grpMainId || a.GrpMainId] || 99;
      const orderB = typeOrder[b.grpMainId || b.GrpMainId] || 99;
      if (orderA !== orderB) return orderA - orderB;
      const codeA = (a.accCode || '').toLowerCase();
      const codeB = (b.accCode || '').toLowerCase();
      return codeA.localeCompare(codeB);
    });

    amRenderList();

    if (amList.length > 0 && !amSelectedId) {
      amSelectRow(amList[0].socAccId || amList[0].accountId);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#dc2626;">
      <i class="bi bi-exclamation-triangle"></i> Connection Error: ${e.message}</td></tr>`;
  }
}

// ── Render Accounts List ──────────────────────────────────
function amRenderList() {
  const tbody     = document.getElementById('am-tbody');
  const searchInp = document.getElementById('am-search-inp');
  const filterSel = document.getElementById('am-filter-sel');
  const chkAll    = document.getElementById('am-chk-all');

  if (!tbody) return;

  const search = (searchInp ? searchInp.value : '').toLowerCase().trim();
  const filter = filterSel ? filterSel.value : '';

  const filtered = amList.filter(a => {
    const mainId = a.grpMainId || a.GrpMainId;
    if (filter && String(mainId) !== filter) return false;
    if (search) {
      const code = (a._code || a.accCode || '').toLowerCase();
      const name = (a.accName || a.AccName || '').toLowerCase();
      const bs   = (a.accBSName || a.AccBSName || '').toLowerCase();
      const grp  = (a.groupName || a.GroupName || '').toLowerCase();
      if (!code.includes(search) && !name.includes(search) && !bs.includes(search) && !grp.includes(search)) return false;
    }
    return true;
  });

  if (chkAll) chkAll.style.display = amMultiMode ? 'inline-block' : 'none';

  const badge = document.getElementById('am-count-badge');
  if (badge) badge.textContent = `${filtered.length} Records`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#808080;">
      No matching accounts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const id        = a.socAccId || a.accountId || a.SocAccId;
    const code      = a._code || a.accCode || '';
    const name      = a.accName || a.AccName || '';
    const bsName    = a.accBSName || a.AccBSName || name;
    const mainId    = a.grpMainId || a.GrpMainId;
    const mainLabel = mainNames[mainId] || '—';
    const grpName   = a.groupName || a.GroupName || '—';
    const sel       = id === amSelectedId ? 'class="selected"' : '';
    const isChecked = amChecked[id] ? 'checked' : '';

    return `<tr ${sel} onclick="amSelectRow(${id})" ondblclick="amAlterById(${id})">
      <td style="text-align:center;">
        ${amMultiMode ? `<input type="checkbox" ${isChecked} onclick="event.stopPropagation();amChk(${id}, this.checked)" style="accent-color:#1565C0;">` : ''}
      </td>
      <td style="font-weight:700;">${code}</td>
      <td style="font-weight:700;">${name}</td>
      <td>${bsName}</td>
      <td>${mainLabel}</td>
      <td>${grpName}</td>
    </tr>`;
  }).join('');
}

// ── Select Row ────────────────────────────────────────────
function amSelectRow(id) {
  amSelectedId = id;
  const rows = document.querySelectorAll('#am-tbody tr');
  rows.forEach(r => r.classList.remove('selected'));

  const a = amList.find(x => (x.socAccId || x.accountId || x.SocAccId) === id);
  if (a) {
    const isSaveVisible = document.getElementById('am-btn-save').classList.contains('am-btn-hidden') === false;
    if (!isSaveVisible) {
      const mainId = a.grpMainId || a.GrpMainId || 1;
      setVal('am-edit-id', id);
      setVal('am-group-id', a.socSubGroupId || a.groupId || 0);
      setVal('am-main-id', mainId);
      setVal('am-group-name', a.groupName || a.GroupName || '');
      setVal('am-code', a.accCode || a.AccCode || '');
      setVal('am-name', a.accName || a.AccName || '');
      setVal('am-bs-name', a.accBSName || a.AccBSName || a.accName || '');
      setVal('am-add', a.accAddress || a.AccAddress || '');
      setVal('am-contact', a.mobile || a.Mobile || '');
      setVal('am-contact2', a.mobile2 || a.Mobile2 || '');
      setVal('am-email', a.email || a.Email || '');
      setVal('am-pan', a.accPAN || a.AccPAN || '');
      setVal('am-gstin', a.gstin || a.GSTIN || '');
      setVal('am-tds-rate', a.tdsRate || 0);
      setVal('am-tds-section', a.tdsSection || 'None');
      setVal('am-opbal', a.opBal ?? a.OpBal ?? 0);
      setVal('am-opdrcr', a.opDrCr || a.OpDrCr || 'Dr');
      setVal('am-prbal', a.prBal ?? a.PrBal ?? 0);
      setVal('am-prdrcr', a.prDrCr || a.PrDrCr || 'Dr');

      const isFixedAsset = (a.groupName || '').toLowerCase().includes('fixed asset');
      document.getElementById('am-dep-section').style.display = isFixedAsset ? 'block' : 'none';
      setVal('am-dep-annual', a.depAnnual || 0);
      setVal('am-dep-half', a.depHalf || 0);

      setText('am-frame-title', `Account Viewer — ${a.accName || a.AccName}`);
      disableFormInputs(true);
    }
  }
  amRenderList();
}

// ── Show / Hide States ────────────────────────────────────
function amShowList() {
  document.getElementById('am-form-state').style.display = 'none';
  document.getElementById('am-list-state').style.display = 'flex';

  show('am-btn-add', 'am-btn-alter', 'am-btn-delete', 'am-btn-print', 'am-other-drop', 'am-btn-search');
  hide('am-btn-save', 'am-btn-cancel');

  disableFormInputs(true);
  if (amSelectedId) amSelectRow(amSelectedId);
}

function amShowForm() {
  document.getElementById('am-list-state').style.display = 'none';
  document.getElementById('am-form-state').style.display = 'flex';

  hide('am-btn-add', 'am-btn-alter', 'am-btn-delete', 'am-btn-print', 'am-other-drop', 'am-btn-search');
  show('am-btn-save', 'am-btn-cancel');

  disableFormInputs(false);
}

// ── Update Balance Fields (Asset/Liability vs Income/Expenditure) ──────
function amUpdateBalanceFields(mainId, isFormEditable) {
  const isIncomeOrExp = (mainId === 3 || mainId === 4);
  const lblOp  = document.getElementById('am-lbl-opbal');
  const lblPr  = document.getElementById('am-lbl-prbal');
  const inpOp  = document.getElementById('am-opbal');
  const selOp  = document.getElementById('am-opdrcr');
  const inpPr  = document.getElementById('am-prbal');
  const selPr  = document.getElementById('am-prdrcr');
  const hintOp = document.getElementById('am-hint-opbal');
  const hintPr = document.getElementById('am-hint-prbal');

  if (isIncomeOrExp) {
    // Income / Expenditure -> Prev. Year Balance active, Opening Balance disabled
    if (lblOp) lblOp.style.color = '#94a3b8';
    if (lblPr) lblPr.style.color = '#0f172a';
    if (hintOp) hintOp.style.display = 'none';
    if (hintPr) hintPr.style.display = 'block';

    if (inpOp) {
      inpOp.disabled = true;
      if (isFormEditable) inpOp.value = '0';
    }
    if (selOp) selOp.disabled = true;

    if (inpPr) inpPr.disabled = !isFormEditable;
    if (selPr) selPr.disabled = !isFormEditable;
  } else {
    // Asset / Liability -> Opening Balance active, Prev. Year Balance disabled
    if (lblOp) lblOp.style.color = '#0f172a';
    if (lblPr) lblPr.style.color = '#94a3b8';
    if (hintOp) hintOp.style.display = 'block';
    if (hintPr) hintPr.style.display = 'none';

    if (inpOp) inpOp.disabled = !isFormEditable;
    if (selOp) selOp.disabled = !isFormEditable;

    if (inpPr) {
      inpPr.disabled = true;
      if (isFormEditable) inpPr.value = '0';
    }
    if (selPr) selPr.disabled = true;
  }
}

function disableFormInputs(disabled) {
  ['am-code', 'am-name', 'am-bs-name', 'am-add', 'am-contact', 'am-contact2',
   'am-email', 'am-pan', 'am-gstin', 'am-tds-rate', 'am-tds-section',
   'am-dep-annual'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
  const mainId = parseInt(val('am-main-id') || '1', 10);
  amUpdateBalanceFields(mainId, !disabled);
}

function show(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('am-btn-hidden');
  });
}

function hide(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('am-btn-hidden');
  });
}

// ── Auto Code Generator ───────────────────────────────────
function amGenerateCode(mainId) {
  const pfx = accPrefix[mainId] || 'ACC';
  const existing = amList.filter(a => (a.accCode || '').startsWith(`${pfx}-`));
  let max = 1000;
  existing.forEach(a => {
    const num = parseInt((a.accCode || '').replace(`${pfx}-`, ''), 10);
    if (!isNaN(num) && num < 1900 && num > max) max = num;
  });
  const next = max + 1;
  return `${pfx}-${next}`;
}

// ── Sync Name to B/Sheet ──────────────────────────────────
function amOnNameInput(val) {
  const bsInp = document.getElementById('am-bs-name');
  if (bsInp && !bsInp.dataset.userEdited) {
    bsInp.value = val;
  }
}

// ── Auto Calculate Half-Year Depreciation ─────────────────
function amUpdateHalfYearDep() {
  const ann  = parseFloat(val('am-dep-annual')) || 0;
  const half = (ann / 2).toFixed(2);
  setVal('am-dep-half', half);
}

// ── ADD ───────────────────────────────────────────────────
function amAdd() {
  amSelectedId = 0;
  setVal('am-edit-id', '0');
  setVal('am-group-id', '0');
  setVal('am-main-id', '1');
  setVal('am-group-name', '');
  setVal('am-code', '');
  setVal('am-name', '');
  setVal('am-bs-name', '');
  setVal('am-add', '');
  setVal('am-contact', '');
  setVal('am-contact2', '');
  setVal('am-email', '');
  setVal('am-pan', '');
  setVal('am-gstin', '');
  setVal('am-tds-rate', '0');
  setVal('am-tds-section', 'None');
  setVal('am-opbal', '0');
  setVal('am-opdrcr', 'Dr');
  setVal('am-prbal', '0');
  setVal('am-prdrcr', 'Dr');
  setVal('am-dep-annual', '0');
  setVal('am-dep-half', '0');

  document.getElementById('am-dep-section').style.display = 'none';
  setText('am-frame-title', 'New Account Ledger Creation');

  amShowForm();
  amUpdateBalanceFields(1, true);
  amOpenGroupModal();
}

// ── ALTER ─────────────────────────────────────────────────
function amAlter() {
  if (!amSelectedId) {
    amAlert('Select an account ledger from the list first.', true);
    return;
  }
  amAlterById(amSelectedId);
}

function amAlterById(id, code, name) {
  const targetId = String(id || '').trim();
  const targetCode = String(code || '').trim().toLowerCase();
  const targetName = String(name || '').trim().toLowerCase();

  const a = amList.find(x => {
    const xId = String(x.socAccId || x.accountId || x.SocAccId || x.id || '').trim();
    const xCode = String(x.accCode || x.AccCode || '').trim().toLowerCase();
    const xName = String(x.accName || x.AccName || '').trim().toLowerCase();

    // 1. Direct ID match
    if (targetId && xId && xId === targetId) return true;

    // 2. Direct Code match
    if (targetCode && xCode && xCode === targetCode) return true;
    if (targetId && xCode && xCode === targetId.toLowerCase()) return true;

    // 3. Direct Name match
    if (targetName && xName && xName === targetName) return true;
    if (targetId && xName && xName === targetId.toLowerCase()) return true;

    // 4. Code suffix / contains match: e.g. targetId is '1001' and xCode is 'inc-1001'
    if (targetId && xCode && (xCode.endsWith('-' + targetId) || xCode.endsWith(targetId))) return true;
    if (targetCode && xCode && (xCode.includes(targetCode) || targetCode.includes(xCode))) return true;

    return false;
  });

  if (!a) {
    amAlert('Account not found in ledger list.', true);
    return;
  }

  const realId = a.socAccId || a.accountId || a.SocAccId || a.id || id || 0;
  const mainId = a.grpMainId || a.GrpMainId || 1;
  amSelectedId = realId;
  setVal('am-edit-id', realId);
  setVal('am-group-id', a.socSubGroupId || a.groupId || 0);
  setVal('am-main-id', mainId);
  setVal('am-group-name', a.groupName || a.GroupName || '');
  setVal('am-code', a.accCode || a.AccCode || '');
  setVal('am-name', a.accName || a.AccName || '');
  setVal('am-bs-name', a.accBSName || a.AccBSName || a.accName || '');
  setVal('am-add', a.accAddress || a.AccAddress || '');
  setVal('am-contact', a.mobile || a.Mobile || '');
  setVal('am-contact2', a.mobile2 || a.Mobile2 || '');
  setVal('am-email', a.email || a.Email || '');
  setVal('am-pan', a.accPAN || a.AccPAN || '');
  setVal('am-gstin', a.gstin || a.GSTIN || '');
  setVal('am-tds-rate', a.tdsRate || 0);
  setVal('am-tds-section', a.tdsSection || 'None');
  setVal('am-opbal', a.opBal ?? a.OpBal ?? 0);
  setVal('am-opdrcr', a.opDrCr || a.OpDrCr || 'Dr');
  setVal('am-prbal', a.prBal ?? a.PrBal ?? 0);
  setVal('am-prdrcr', a.prDrCr || a.PrDrCr || 'Dr');

  const isFixedAsset = (a.groupName || '').toLowerCase().includes('fixed asset');
  document.getElementById('am-dep-section').style.display = isFixedAsset ? 'block' : 'none';
  setVal('am-dep-annual', a.depAnnual || 0);
  setVal('am-dep-half', a.depHalf || 0);

  setText('am-frame-title', `Update Account Ledger — ${a.accName || a.AccName}`);

  amShowForm();
  amUpdateBalanceFields(mainId, true);
  setTimeout(() => document.getElementById('am-name').focus(), 100);
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
async function amDelete() {
  if (amMultiMode) {
    amExecuteMultiDelete();
    return;
  }

  if (!amSelectedId) {
    amAlert('Select an account ledger from the list first.', true);
    return;
  }

  const a = amList.find(x => (x.socAccId || x.accountId || x.SocAccId) === amSelectedId);
  if (a && (a.isDefault || a.IsDefault || a._isDefault)) {
    amAlert('This is a system default account and cannot be deleted.', true);
    return;
  }

  amConfirm(`Are you sure you want to delete account: <b>${a ? (a.accName || a.AccName) : ''}</b>?`, async (ok) => {
    if (!ok) return;
    try {
      const res  = await fetch(`${amApiBase()}/api/accounts/${amSelectedId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (res.ok && json.success) {
        amAlert('Account deleted successfully.');
        amSelectedId = 0;
        amLoadList();
      } else {
        amAlert('Delete failed: ' + (json.message || 'Unknown'), true);
      }
    } catch (e) {
      amAlert('Error deleting account: ' + e.message, true);
    }
  });
}

// ── SAVE (Create or Update) ───────────────────────────────
async function amSave() {
  const name    = val('am-name').trim();
  const groupId = parseInt(val('am-group-id')) || 0;
  const mainId  = parseInt(val('am-main-id')) || 1;
  let code      = val('am-code').trim();

  if (!groupId) {
    amAlert('Please select a Primary Group.', true);
    amOpenGroupModal();
    return;
  }

  if (!name) {
    amAlert('Account Name is required.', true);
    document.getElementById('am-name').focus();
    return;
  }

  if (!code) {
    code = amGenerateCode(mainId);
  }

  const id = parseInt(val('am-edit-id')) || 0;

  // Front-end duplicate code check
  const dup = amList.find(x => {
    const xId   = x.socAccId || x.accountId || x.SocAccId;
    const xCode = (x.accCode || x.AccCode || '').trim().toUpperCase();
    return xId !== id && xCode === code.toUpperCase();
  });

  if (dup) {
    amAlert(`Account Code '${code}' already exists.`, true);
    return;
  }

  const isIncomeOrExp = (mainId === 3 || mainId === 4);
  const payload = {
    SocietyId: amGetActiveSocietyId(),
    AccCode: code,
    AccName: name,
    AccBSName: val('am-bs-name').trim() || name,
    GroupId: groupId,
    GrpMainId: mainId,
    AccAddress: val('am-add').trim(),
    Mobile: val('am-contact').trim(),
    Mobile2: val('am-contact2').trim(),
    Email: val('am-email').trim(),
    AccPAN: val('am-pan').trim(),
    GSTIN: val('am-gstin').trim(),
    TdsRate: parseFloat(val('am-tds-rate')) || 0,
    TdsSection: val('am-tds-section'),
    OpBal: isIncomeOrExp ? 0 : (parseFloat(val('am-opbal')) || 0),
    OpDrCr: isIncomeOrExp ? 'Dr' : (val('am-opdrcr') || 'Dr'),
    PrBal: isIncomeOrExp ? (parseFloat(val('am-prbal')) || 0) : 0,
    PrDrCr: isIncomeOrExp ? (val('am-prdrcr') || 'Dr') : 'Dr',
    DepAnnual: parseFloat(val('am-dep-annual')) || 0,
    DepHalf: parseFloat(val('am-dep-half')) || 0,
    FYId: amGetActiveFYId()
  };

  const url    = id ? `${amApiBase()}/api/accounts/${id}` : `${amApiBase()}/api/accounts`;
  const method = id ? 'PUT' : 'POST';

  try {
    const res  = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    if (res.ok && json.success) {
      amAlert(id ? 'Account updated successfully!' : 'Account created successfully!');
      amShowList();
      amLoadList();
    } else {
      amAlert('Error: ' + (json.message || 'Unknown'), true);
    }
  } catch (e) {
    amAlert('Error saving account: ' + e.message, true);
  }
}

// ── Group Selection Modal Handler ─────────────────────────
function amOpenGroupModal() {
  const overlay = document.getElementById('am-group-overlay');
  if (overlay) overlay.style.display = 'flex';
  setVal('am-group-search', '');
  amRenderGroupModal();
  setTimeout(() => document.getElementById('am-group-search').focus(), 100);
}

function amCloseGroupModal() {
  const overlay = document.getElementById('am-group-overlay');
  if (overlay) overlay.style.display = 'none';
}

function amRenderGroupModal() {
  const tbody  = document.getElementById('am-group-tbody');
  const search = (val('am-group-search') || '').toLowerCase().trim();

  if (!tbody) return;

  amFilteredModalGrp = amGroupList.filter(g => {
    const name = (g.grpName || g.GrpName || '').toLowerCase();
    const main = (mainNames[g.grpMainId || g.GrpMainId] || '').toLowerCase();
    return !search || name.includes(search) || main.includes(search);
  });

  if (amFilteredModalGrp.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:#808080;">No groups found</td></tr>`;
    return;
  }

  tbody.innerHTML = amFilteredModalGrp.map((g, idx) => {
    const id        = g.socGroupId || g.groupId || g.SocGroupId;
    const name      = g.grpName || g.GrpName || '';
    const mainId    = g.grpMainId || g.GrpMainId;
    const mainLabel = mainNames[mainId] || '—';
    const sel       = idx === amModalGroupIdx ? 'class="selected"' : '';

    return `<tr ${sel} onclick="amSelectGroupFromModal(${id}, '${name.replace(/'/g, "\\'")}', ${mainId})">
      <td style="font-weight:700;">${name}</td>
      <td>${mainLabel}</td>
    </tr>`;
  }).join('');
}

function amSelectGroupFromModal(id, name, mainId) {
  mainId = parseInt(mainId, 10) || 1;
  setVal('am-group-id', id);
  setVal('am-main-id', mainId);
  setVal('am-group-name', name);

  // Set default Dr / Cr based on Group Main Type
  if (mainId === 1) { // Asset
    setVal('am-opdrcr', 'Dr');
  } else if (mainId === 2) { // Liability
    setVal('am-opdrcr', 'Cr');
  } else if (mainId === 3) { // Income
    setVal('am-prdrcr', 'Cr');
  } else if (mainId === 4) { // Expenditure
    setVal('am-prdrcr', 'Dr');
  }

  const isSaveVisible = !document.getElementById('am-btn-save').classList.contains('am-btn-hidden');
  amUpdateBalanceFields(mainId, isSaveVisible);

  const isFixedAsset = (name || '').toLowerCase().includes('fixed asset');
  document.getElementById('am-dep-section').style.display = isFixedAsset ? 'block' : 'none';

  amCloseGroupModal();
  document.getElementById('am-name').focus();
}

function amSelectCurrentModalGroup() {
  if (amFilteredModalGrp.length > 0) {
    const target = amFilteredModalGrp[amModalGroupIdx] || amFilteredModalGrp[0];
    const id     = target.socGroupId || target.groupId || target.SocGroupId;
    const name   = target.grpName || target.GrpName || '';
    const mainId = target.grpMainId || target.GrpMainId || 1;
    amSelectGroupFromModal(id, name, mainId);
  } else {
    amCloseGroupModal();
  }
}

// ── Multi Delete Mode ─────────────────────────────────────
function amToggleMultiDelete() {
  amMultiMode = !amMultiMode;
  amChecked   = {};
  amRenderList();

  const delBtn = document.getElementById('am-btn-delete');
  if (amMultiMode) {
    amAlert('Multi-Delete mode active. Check rows in grid and click DELETE SELECTION.');
    if (delBtn) delBtn.innerHTML = '<i class="bi bi-trash"></i> DELETE SELECTION';
  } else {
    if (delBtn) delBtn.innerHTML = '<i class="bi bi-trash"></i> DELETE';
  }
}

function amChk(id, checked) {
  amChecked[id] = checked;
}

function amToggleAll(checked) {
  amList.forEach(a => {
    const id = a.socAccId || a.accountId || a.SocAccId;
    amChecked[id] = checked;
  });
  amRenderList();
}

async function amExecuteMultiDelete() {
  const ids = Object.keys(amChecked).filter(k => amChecked[k]);
  if (ids.length === 0) {
    amAlert('No rows selected in grid.', true);
    return;
  }

  const hasDefault = ids.some(id => {
    const a = amList.find(x => (x.socAccId || x.accountId || x.SocAccId) === parseInt(id));
    return a && (a.isDefault || a.IsDefault || a._isDefault);
  });

  if (hasDefault) {
    amAlert('One or more selected accounts are default system accounts and cannot be deleted.', true);
    return;
  }

  amConfirm(`Are you sure you want to delete these <b>${ids.length}</b> account(s)?`, async (ok) => {
    if (!ok) return;

    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        const res = await fetch(`${amApiBase()}/api/accounts/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    amAlert(`${successCount} account(s) deleted successfully.${failCount ? ` (${failCount} failed)` : ''}`);
    amMultiMode = false;
    amChecked = {};
    const delBtn = document.getElementById('am-btn-delete');
    if (delBtn) delBtn.innerHTML = '<i class="bi bi-trash"></i> DELETE';
    amLoadList();
  });
}

// ── Search Strip Toggle ───────────────────────────────────
function amToggleSearch() {
  const strip = document.getElementById('am-search-strip');
  if (strip) {
    strip.remove();
    amRenderList();
  } else {
    const panel    = document.getElementById('am-panel');
    const cmdStrip = document.getElementById('am-cmd-strip');
    const div      = document.createElement('div');
    div.id         = 'am-search-strip';
    div.className  = 'am-search-strip';
    div.innerHTML  = `
      <label style="font-size:11px;font-weight:700;color:#334155;">SEARCH CODE / NAME / GROUP:</label>
      <input type="text" class="am-input" style="width:200px;" placeholder="Search ledger name/code..."
             oninput="amRenderList()" id="am-search-inp">
      <label style="font-size:11px;font-weight:700;color:#334155;margin-left:8px;">MAIN GROUP:</label>
      <select id="am-filter-sel" class="am-select" style="width:130px;" onchange="amRenderList()">
        <option value="">All Types</option>
        <option value="3">Income</option>
        <option value="4">Expenditure</option>
        <option value="1">Asset</option>
        <option value="2">Liability</option>
      </select>
      <span style="font-size:11px;font-weight:700;color:#94a3b8;margin-left:auto;" id="am-count-badge">
        ${amList.length} Records
      </span>`;
    panel.insertBefore(div, cmdStrip.nextSibling);
    document.getElementById('am-search-inp').focus();
    amRenderList();
  }
}

// ── Print Register ────────────────────────────────────────
function amPrint() {
  const w = window.open('', '_blank', 'width=800,height=600');
  let html = `<html><head><title>Account Master Register</title>
  <style>
    body { font-family: sans-serif; font-size:12px; margin:20px; color:#1e293b; }
    table { width:100%; border-collapse:collapse; margin-top:12px; }
    th { background:#1565C0; color:#fff; padding:6px 10px; text-align:left; font-size:10px; font-weight:bold; }
    td { padding:6px 10px; border-bottom:1px solid #e2e8f0; font-size:11px; }
    h2 { margin:0; color:#1565C0; font-size:16px; }
    p { margin:4px 0 12px; font-size:11px; color:#64748b; }
  </style></head><body>`;

  html += `<h2>ACCOUNT MASTER REGISTER</h2><p>Active Society Ledger Register. Printed: ${new Date().toLocaleString()}</p>`;
  html += `<table><thead><tr><th style="width:110px;">CODE</th><th>ACCOUNT NAME</th><th>NAME IN B/SHEET</th><th style="width:120px;">MAIN GROUP</th><th>PRIMARY GROUP</th></tr></thead><tbody>`;

  amList.forEach(a => {
    const mainLabel = mainNames[a.grpMainId || a.GrpMainId] || '—';
    const grpName   = a.groupName || a.GroupName || '—';
    html += `<tr>
      <td><b>${a._code || a.accCode || '—'}</b></td>
      <td><b>${a.accName || a.AccName || '—'}</b></td>
      <td>${a.accBSName || a.AccBSName || a.accName || '—'}</td>
      <td>${mainLabel}</td>
      <td>${grpName}</td>
    </tr>`;
  });

  html += `</tbody></table></body></html>`;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ── Export Excel ──────────────────────────────────────────
function amExportExcel() {
  let csv = 'Code,Account Name,Name in B/Sheet,Main Group,Primary Group\n';
  amList.forEach(a => {
    const mainLabel = mainNames[a.grpMainId || a.GrpMainId] || '';
    const grpName   = a.groupName || a.GroupName || '';
    csv += `"${a._code || a.accCode || ''}","${a.accName || a.AccName || ''}","${a.accBSName || a.AccBSName || ''}","${mainLabel}","${grpName}"\n`;
  });
  const blob = new Blob([csv], { type: 'application/vnd.ms-excel' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'account-master.xls';
  a.click();
  amAlert('Excel spreadsheet exported successfully.');
}

// ── Exit ──────────────────────────────────────────────────
function amExit() {
  if (typeof WorkspaceManager !== 'undefined' && WorkspaceManager.closeTab) {
    WorkspaceManager.closeTab('account-master');
  }
}

// ── Keyboard Shortcuts ────────────────────────────────────
function amSetupKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    const panel = document.getElementById('am-panel');
    if (!panel || !panel.offsetParent) return;

    const isGroupModalVisible = document.getElementById('am-group-overlay').style.display === 'flex';
    if (isGroupModalVisible) {
      if (e.key === 'Escape') amCloseGroupModal();
      if (e.key === 'Enter')  { e.preventDefault(); amSelectCurrentModalGroup(); }
      return;
    }

    const isFormVisible = document.getElementById('am-form-state').style.display === 'flex';
    if (isFormVisible) {
      if (e.key === 'Escape') amShowList();
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); amAdd(); }
    if (e.key === 'Delete' && amSelectedId)        { e.preventDefault(); amDelete(); }
    if (e.key === 'Enter' && amSelectedId)         { e.preventDefault(); amAlterById(amSelectedId); }
    if (e.key === 'Escape') {
      amMultiMode = false;
      amChecked   = {};
      amRenderList();
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!amList.length) return;
      let idx = amList.findIndex(a => (a.socAccId || a.accountId || a.SocAccId) === amSelectedId);
      if (e.key === 'ArrowDown') idx = Math.min(idx + 1, amList.length - 1);
      else idx = Math.max(idx - 1, 0);
      if (idx < 0) idx = 0;
      const target = amList[idx];
      amSelectRow(target.socAccId || target.accountId || target.SocAccId);

      const rows = document.querySelectorAll('#am-tbody tr');
      if (rows[idx]) rows[idx].scrollIntoView({ block: 'nearest' });
    }
  });
}

// ── Alert Dialog ──────────────────────────────────────────
function amAlert(msg, isError) {
  if (window.JeevikaDialog && window.JeevikaDialog.alert) {
    window.JeevikaDialog.alert(msg, isError ? 'Error' : 'Information');
    return;
  }
  const overlay = document.getElementById('am-alert-overlay');
  const title   = document.getElementById('am-alert-title');
  const icon    = document.getElementById('am-alert-icon');
  const msgEl   = document.getElementById('am-alert-msg');

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

function amCloseAlert() {
  const el = document.getElementById('am-alert-overlay');
  if (el) el.style.display = 'none';
}

// ── Confirm Dialog ────────────────────────────────────────
function amConfirm(msg, cb) {
  if (window.JeevikaDialog && window.JeevikaDialog.confirm) {
    window.JeevikaDialog.confirm(msg, null, 'Confirm').then(ok => { if (cb) cb(ok); });
    return;
  }
  const overlay = document.getElementById('am-confirm-overlay');
  const msgEl   = document.getElementById('am-confirm-msg');
  if (!overlay) { cb(confirm(msg)); return; }

  amConfirmCb           = cb;
  msgEl.innerHTML       = msg;
  overlay.style.display = 'flex';

  document.getElementById('am-confirm-yes').onclick = () => amCloseConfirm(true);
}

function amCloseConfirm(result) {
  const el = document.getElementById('am-confirm-overlay');
  if (el) el.style.display = 'none';
  const cb = amConfirmCb;
  amConfirmCb = null;
  if (cb) cb(result);
}

// ── Utility Helpers ───────────────────────────────────────
function val(id)         { const el = document.getElementById(id); return el ? el.value || '' : ''; }
function setVal(id, v)   { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
function chk(id)         { const el = document.getElementById(id); return el ? el.checked : false; }
function setChk(id, v)   { const el = document.getElementById(id); if (el) el.checked = !!v; }
function setText(id, t)  { const el = document.getElementById(id); if (el) el.textContent = t; }

// Expose functions for inline HTML calls
window.amAdd                    = amAdd;
window.amAlter                  = amAlter;
window.amDelete                 = amDelete;
window.amSave                   = amSave;
window.amShowList               = amShowList;
window.amToggleSearch           = amToggleSearch;
window.amToggleMultiDelete      = amToggleMultiDelete;
window.amToggleAll              = amToggleAll;
window.amChk                    = amChk;
window.amCloseAlert             = amCloseAlert;
window.amCloseConfirm           = amCloseConfirm;
window.amPrint                  = amPrint;
window.amExportExcel            = amExportExcel;
window.amExit                   = amExit;
window.amRenderList             = amRenderList;
window.amSelectRow              = amSelectRow;
window.amAlterById              = amAlterById;
window.amOpenGroupModal         = amOpenGroupModal;
window.amCloseGroupModal        = amCloseGroupModal;
window.amRenderGroupModal       = amRenderGroupModal;
window.amSelectGroupFromModal   = amSelectGroupFromModal;
window.amSelectCurrentModalGroup= amSelectCurrentModalGroup;
window.amOnNameInput            = amOnNameInput;
window.amUpdateHalfYearDep      = amUpdateHalfYearDep;

// Module entry point for workspace.html
window.init_account_master = function() {
  amLoadGroups();
  amLoadList();
};
