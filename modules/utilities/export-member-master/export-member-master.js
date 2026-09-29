// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Export Member Master Logic
// ═══════════════════════════════════════════════════════════

let rawMembers = [];
let filteredMembers = [];
let currentView = 'list'; // 'list' or 'form'

document.addEventListener('DOMContentLoaded', async () => {
  await loadMembers();
});

async function loadMembers() {
  try {
    const sid = Auth.getSocietyId();
    const res = await API.get(`utility/export-members?societyId=${sid}`);
    if (res && res.data) {
      rawMembers = res.data;
      populateFilterDropdowns();
      applyMemberFilters();
      populateSingleMemberDropdown();
    }
  } catch (err) {
    console.error('Failed to load members:', err);
    showToast('Failed to load member records: ' + err.message, 'error');
  }
}

function populateFilterDropdowns() {
  const wingSel = document.getElementById('filterWing');
  const wings = new Set();

  rawMembers.forEach(m => {
    if (m.wing) wings.add(m.wing.trim().toUpperCase());
  });

  wingSel.innerHTML = '<option value="ALL">All Wings</option>';
  wings.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w;
    opt.textContent = `Wing ${w}`;
    wingSel.appendChild(opt);
  });
}

function populateSingleMemberDropdown() {
  const sel = document.getElementById('selectSingleMember');
  sel.innerHTML = '<option value="">-- Choose Member --</option>';

  rawMembers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.memberId;
    opt.textContent = `${m.flatNo} - ${m.memName} (${m.wing || 'Main'})`;
    sel.appendChild(opt);
  });
}

function applyMemberFilters() {
  const wing = document.getElementById('filterWing')?.value || 'ALL';
  const status = document.getElementById('filterStatus')?.value || 'ALL';
  const search = (document.getElementById('searchMember')?.value || '').toLowerCase().trim();

  filteredMembers = rawMembers.filter(m => {
    if (wing !== 'ALL' && (m.wing || '').toUpperCase() !== wing) return false;
    if (status !== 'ALL' && (m.status || 'Active').toLowerCase() !== status.toLowerCase()) return false;

    if (search) {
      const match = (m.flatNo || '').toLowerCase().includes(search) ||
                    (m.memName || '').toLowerCase().includes(search) ||
                    (m.coMemberName || '').toLowerCase().includes(search) ||
                    (m.contactNo || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    return true;
  });

  renderMemberListTable();
}

function renderMemberListTable() {
  const tbody = document.getElementById('memberTableBody');
  const totalShares = filteredMembers.reduce((s, m) => s + (parseInt(m.shares, 10) || 0), 0);
  const totalDues = filteredMembers.reduce((s, m) => s + (parseFloat(m.opPrincipal) || 0), 0);

  document.getElementById('metricCount').textContent = `${filteredMembers.length}`;
  document.getElementById('metricShares').textContent = `${totalShares}`;
  document.getElementById('metricDues').textContent = formatAmount(totalDues);
  document.getElementById('recordCount').textContent = `Showing ${filteredMembers.length} member(s)`;

  if (!filteredMembers || filteredMembers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No members found matching filters.</td></tr>';
    return;
  }

  let html = '';
  filteredMembers.forEach((m, idx) => {
    html += `
      <tr>
        <td class="td-center font-bold">${idx + 1}</td>
        <td><strong>${escapeHtml(m.flatNo)}</strong></td>
        <td class="td-center"><span class="badge-vtype Journal">${escapeHtml(m.wing || '—')}</span></td>
        <td><strong>${escapeHtml(m.memName)}</strong></td>
        <td class="text-muted">${escapeHtml(m.coMemberName || '—')}</td>
        <td>${escapeHtml(m.contactNo || '—')}</td>
        <td class="td-center font-bold">${m.shares || 0}</td>
        <td><code>${escapeHtml(m.shareCertNo || '—')}</code></td>
        <td class="td-right font-bold">${formatAmount(m.opPrincipal || 0)}</td>
        <td class="td-center"><span class="badge-vtype ${(m.status || 'Active') === 'Active' ? 'Receipt' : 'Payment'}">${escapeHtml(m.status || 'Active')}</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function switchViewMode(mode) {
  currentView = mode;
  const btnList = document.getElementById('btnModeList');
  const btnForm = document.getElementById('btnModeForm');
  const listContainer = document.getElementById('listViewContainer');
  const formContainer = document.getElementById('formViewContainer');

  const gWing = document.getElementById('groupWing');
  const gStatus = document.getElementById('groupStatus');
  const gSearch = document.getElementById('groupSearch');
  const gSingle = document.getElementById('groupSingleMember');

  if (mode === 'list') {
    btnList.classList.add('active');
    btnForm.classList.remove('active');
    listContainer.style.display = 'block';
    formContainer.style.display = 'none';

    gWing.style.display = 'flex';
    gStatus.style.display = 'flex';
    gSearch.style.display = 'flex';
    gSingle.style.display = 'none';
  } else {
    btnList.classList.remove('active');
    btnForm.classList.add('active');
    listContainer.style.display = 'none';
    formContainer.style.display = 'block';

    gWing.style.display = 'none';
    gStatus.style.display = 'none';
    gSearch.style.display = 'none';
    gSingle.style.display = 'flex';

    if (rawMembers.length > 0 && !document.getElementById('selectSingleMember').value) {
      document.getElementById('selectSingleMember').value = rawMembers[0].memberId;
      renderMemberForm();
    }
  }
}

function renderMemberForm() {
  const memId = parseInt(document.getElementById('selectSingleMember').value, 10);
  const card = document.getElementById('memberFormCard');

  if (!memId) {
    card.innerHTML = '<div class="empty-state">Select a member from the dropdown above to display the profile card.</div>';
    return;
  }

  const m = rawMembers.find(x => x.memberId === memId);
  if (!m) {
    card.innerHTML = '<div class="empty-state">Member details not found.</div>';
    return;
  }

  card.innerHTML = `
    <div class="member-form-header">
      <div>
        <div class="member-form-title">${escapeHtml(m.memName)}</div>
        <div class="text-muted" style="font-size:12px; margin-top:3px;">
          <i class="bi bi-door-open"></i> Flat No: <strong>${escapeHtml(m.flatNo)}</strong> | Wing: <strong>${escapeHtml(m.wing || 'Main')}</strong> | Building: <strong>${escapeHtml(m.building || 'Main')}</strong>
        </div>
      </div>
      <div>
        <span class="badge-vtype ${(m.status || 'Active') === 'Active' ? 'Receipt' : 'Payment'}" style="font-size:12px; padding:4px 10px;">
          ${escapeHtml(m.status || 'Active')}
        </span>
      </div>
    </div>

    <div class="member-form-grid">
      <div>
        <div class="form-info-row">
          <span class="form-info-label">Member Code:</span>
          <span class="form-info-val"><code>${escapeHtml(m.memCode || '—')}</code></span>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">Co-Member / Associate:</span>
          <span class="form-info-val">${escapeHtml(m.coMemberName || '—')}</span>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">Area (Sq. Ft.):</span>
          <span class="form-info-val">${m.areaSqft ? m.areaSqft + ' sq.ft' : '—'}</span>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">Contact / Mobile:</span>
          <span class="form-info-val">${escapeHtml(m.contactNo || '—')}</span>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">Email Address:</span>
          <span class="form-info-val">${escapeHtml(m.email || '—')}</span>
        </div>
      </div>

      <div>
        <div class="form-info-row">
          <span class="form-info-label">PAN Card No:</span>
          <span class="form-info-val">${escapeHtml(m.panNo || '—')}</span>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">Aadhar No:</span>
          <span class="form-info-val">${escapeHtml(m.aadharNo || '—')}</span>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">Share Capital (Qty):</span>
          <span class="form-info-val font-bold">${m.shares || 0} Shares</span>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">Share Certificate No:</span>
          <span class="form-info-val"><code>${escapeHtml(m.shareCertNo || '—')}</code></span>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">Opening Principal Dues:</span>
          <span class="form-info-val font-bold text-danger">${formatAmount(m.opPrincipal || 0)}</span>
        </div>
        <div class="form-info-row">
          <span class="form-info-label">Opening Interest Dues:</span>
          <span class="form-info-val font-bold text-danger">${formatAmount(m.opInterest || 0)}</span>
        </div>
      </div>
    </div>
  `;
}

function exportToExcel() {
  if (!filteredMembers || filteredMembers.length === 0) {
    showToast('No member data to export.', 'warning');
    return;
  }

  const exportData = filteredMembers.map((m, idx) => ({
    'Sr No': idx + 1,
    'Flat No': m.flatNo,
    'Wing': m.wing || '',
    'Building': m.building || '',
    'Member Name': m.memName,
    'Co-Member': m.coMemberName || '',
    'Contact No': m.contactNo || '',
    'Email': m.email || '',
    'PAN No': m.panNo || '',
    'Aadhar No': m.aadharNo || '',
    'Shares': m.shares || 0,
    'Share Cert No': m.shareCertNo || '',
    'Op Principal Dues': m.opPrincipal || 0,
    'Op Interest Dues': m.opInterest || 0,
    'Status': m.status || 'Active'
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Members');
  XLSX.writeFile(wb, `Member_Master_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Excel export generated successfully!', 'success');
}

function exportToCSV() {
  if (!filteredMembers || filteredMembers.length === 0) {
    showToast('No member data to export.', 'warning');
    return;
  }

  const exportData = filteredMembers.map((m, idx) => ({
    'Sr No': idx + 1,
    'Flat No': m.flatNo,
    'Wing': m.wing || '',
    'Member Name': m.memName,
    'Contact No': m.contactNo || '',
    'Shares': m.shares || 0,
    'Op Dues': m.opPrincipal || 0,
    'Status': m.status || 'Active'
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Member_Master_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('CSV export downloaded successfully!', 'success');
}
