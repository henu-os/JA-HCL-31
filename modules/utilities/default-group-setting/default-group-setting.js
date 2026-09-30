// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Default Group Setting Logic
// ═══════════════════════════════════════════════════════════

const SYSTEM_CATEGORIES = [
  { key: 'DEF_GRP_CASH_BANK', label: 'Cash & Bank Balance', mainId: 1, type: 'Assets', icon: 'bi-bank', iconClass: 'asset', desc: 'All physical cash registers, bank savings, current, and overdraft accounts.' },
  { key: 'DEF_GRP_DEBTORS', label: 'Dues from Members (Sundry Debtors)', mainId: 1, type: 'Assets', icon: 'bi-person-lines-fill', iconClass: 'asset', desc: 'Receivables from society members for maintenance and overdue interest.' },
  { key: 'DEF_GRP_INVESTMENT', label: 'Investments & Term Deposits', mainId: 1, type: 'Assets', icon: 'bi-graph-up-arrow', iconClass: 'asset', desc: 'Fixed deposits (FDs), government securities, and mutual fund holdings.' },
  { key: 'DEF_GRP_FIXED_ASSETS', label: 'Fixed Assets', mainId: 1, type: 'Assets', icon: 'bi-building', iconClass: 'asset', desc: 'Land, society office, solar plants, gym equipment, and club infrastructure.' },
  { key: 'DEF_GRP_CREDITORS', label: 'Sundry Creditors & Vendors', mainId: 2, type: 'Liabilities', icon: 'bi-truck', iconClass: 'liab', desc: 'Trade payables to service providers, security agencies, and contractors.' },
  { key: 'DEF_GRP_MEMBER_ADVANCE', label: 'Advances from Members', mainId: 2, type: 'Liabilities', icon: 'bi-cash-coin', iconClass: 'liab', desc: 'Excess or advance maintenance payments received from members.' },
  { key: 'DEF_GRP_SINKING_FUND', label: 'Sinking & Reserve Funds', mainId: 2, type: 'Liabilities', icon: 'bi-safe2', iconClass: 'liab', desc: 'Statutory sinking funds, repair funds, and general reserves.' },
  { key: 'DEF_GRP_MAINT_INCOME', label: 'Maintenance & Service Income', mainId: 3, type: 'Income', icon: 'bi-receipt-cutoff', iconClass: 'inc', desc: 'Monthly society maintenance, water, parking, and non-occupancy charges.' },
  { key: 'DEF_GRP_INTEREST_INCOME', label: 'Interest & Other Sources', mainId: 3, type: 'Income', icon: 'bi-percent', iconClass: 'inc', desc: 'Bank FD interest, late payment interest, hall booking, and NOC fees.' },
  { key: 'DEF_GRP_EXPENSES', label: 'Establishment & Maintenance Expenses', mainId: 4, type: 'Expenses', icon: 'bi-tools', iconClass: 'exp', desc: 'Electricity, security guards, housekeeping, auditing, and repair works.' }
];

let availableGroups = [];
let activeMappings = {};

document.addEventListener('DOMContentLoaded', async () => {
  await loadDefaultGroups();
});

async function loadDefaultGroups() {
  const tbody = document.getElementById('mappingTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="td-center" style="padding:30px;"><div class="erp-spinner"></div> Loading group settings...</td></tr>';

  try {
    const sid = Auth.getSocietyId();
    const res = await API.get(`utility/default-groups?societyId=${sid}`);
    if (res && res.success) {
      availableGroups = res.groups || [];
      activeMappings = res.mappings || {};
      document.getElementById('metricGrpCount').textContent = `${availableGroups.length}`;
      document.getElementById('metricCatCount').textContent = `${SYSTEM_CATEGORIES.length}`;
      renderGroupMatrix();
    } else {
      showToast('Failed to load default groups.', 'error');
      tbody.innerHTML = '<tr><td colspan="5" class="td-center text-danger">Error loading groups</td></tr>';
    }
  } catch (err) {
    console.error('Group setting load error:', err);
    showToast(err.message || 'Error loading group settings.', 'error');
    tbody.innerHTML = `<tr><td colspan="5" class="td-center text-danger">${err.message}</td></tr>`;
  }
}

function renderGroupMatrix() {
  const tbody = document.getElementById('mappingTableBody');
  let html = '';

  SYSTEM_CATEGORIES.forEach((cat, idx) => {
    const eligibleGroups = availableGroups.filter(g => g.grpMainId === cat.mainId || g.grpMainId === 0);
    const selectedVal = activeMappings[cat.key] || '';

    let options = '<option value="">-- Select Accounting Group --</option>';
    eligibleGroups.forEach(g => {
      const isSel = String(g.groupId) === String(selectedVal) || g.grpName.toLowerCase().includes(cat.label.toLowerCase().slice(0, 8));
      options += `<option value="${g.groupId}" ${isSel ? 'selected' : ''}>${g.grpCode ? `[${g.grpCode}] ` : ''}${g.grpName}</option>`;
    });

    html += `
      <tr>
        <td class="td-center font-bold">${idx + 1}</td>
        <td>
          <span class="cat-icon ${cat.iconClass}"><i class="bi ${cat.icon}"></i></span>
          <strong>${cat.label}</strong>
        </td>
        <td><span class="badge-vtype Journal">${cat.type}</span></td>
        <td>
          <select class="mapping-select group-map-dropdown" data-key="${cat.key}">
            ${options}
          </select>
        </td>
        <td class="text-muted" style="font-size:11px;">${cat.desc}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function saveDefaultGroupMappings() {
  const dropdowns = document.querySelectorAll('.group-map-dropdown');
  const mappings = {};

  dropdowns.forEach(d => {
    mappings[d.dataset.key] = d.value;
  });

  const confirmed = confirm(
    'CONFIRM DEFAULT GROUP MAPPINGS:\n\n' +
    'Are you sure you want to update the default account group mappings?\n' +
    'These mappings will apply to future automated ledger and voucher creation.'
  );

  if (!confirmed) return;

  const btn = document.getElementById('btnSaveMappings');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner small"></div> Saving...';

  try {
    const sid = Auth.getSocietyId();
    const payload = {
      societyId: sid,
      mappings: mappings
    };

    const res = await API.post('utility/default-groups', payload);
    if (res && res.success) {
      showToast(res.message || 'Default group settings saved successfully!', 'success');
      alert(`✅ Success: ${res.message}`);
    } else {
      showToast(res.message || 'Failed to save mappings.', 'error');
      alert(`❌ Error: ${res.message}`);
    }
  } catch (err) {
    console.error('Save group settings error:', err);
    showToast('Error saving settings: ' + err.message, 'error');
    alert('❌ Exception: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save"></i> Save Mappings';
  }
}
