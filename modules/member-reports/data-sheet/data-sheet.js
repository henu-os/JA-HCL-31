// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Member Data Sheet & Directory Controller
// ═══════════════════════════════════════════════════════════

let allMembers = [];
let filteredMembers = [];
let currentSocietyName = 'SHREE SAI RESIDENCY CO-OP HSG SOC LTD';

document.addEventListener('DOMContentLoaded', () => {
  initSocietyInfo();
  loadMembers();
});

function getApiUrl(endpoint) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 'http://localhost:5002/api';
  return `${base}/${endpoint}`;
}

async function initSocietyInfo() {
  try {
    const activeSoc = sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName');
    if (activeSoc) {
      currentSocietyName = activeSoc;
    }
    const lbl = document.getElementById('lbl-society-period');
    if (lbl) lbl.innerHTML = `<i class="bi bi-building"></i> ${currentSocietyName} — Complete Member Master Directory`;
    const prtSoc = document.getElementById('prt-soc-name');
    if (prtSoc) prtSoc.innerText = currentSocietyName;
  } catch (e) {}
}

async function loadMembers() {
  const tbody = document.getElementById('tbl-data-sheet-body');
  if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="col-center" style="padding:30px; color:#94a3b8;"><i class="bi bi-hourglass-split"></i> Loading Member Data Sheet...</td></tr>`;

  try {
    const res = await fetch(getApiUrl('members?societyId=1'));
    const data = await res.json();

    if (data.success && Array.isArray(data.data)) {
      allMembers = data.data;
    } else if (Array.isArray(data)) {
      allMembers = data;
    } else {
      allMembers = [];
    }

    populateWings();
    applyFilters();
  } catch (err) {
    console.error('Failed to load member data sheet:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="col-center" style="padding:30px; color:#dc2626;">Error loading member data: ${err.message}</td></tr>`;
  }
}

function populateWings() {
  const wingSet = new Set();
  allMembers.forEach(m => {
    if (m.wing) wingSet.add(m.wing.trim());
  });

  const selWing = document.getElementById('flt-wing');
  if (selWing) {
    const cur = selWing.value;
    selWing.innerHTML = `<option value="ALL">-- All Wings --</option>` +
      Array.from(wingSet).sort().map(w => `<option value="${w}">${w}</option>`).join('');
    if (wingSet.has(cur)) selWing.value = cur;
  }
}

function applyFilters() {
  const wing = document.getElementById('flt-wing')?.value || 'ALL';
  const search = (document.getElementById('flt-search')?.value || '').toLowerCase().trim();

  filteredMembers = allMembers.filter(m => {
    if (wing !== 'ALL' && (m.wing || '').trim() !== wing) return false;

    if (search) {
      const match = (m.memCode || m.memberCode || '').toLowerCase().includes(search) ||
                    (m.memName || m.memberName || '').toLowerCase().includes(search) ||
                    (m.flatNo || '').toLowerCase().includes(search) ||
                    (m.contactNo || m.mobile || '').toLowerCase().includes(search) ||
                    (m.email || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    return true;
  });

  renderSummary();
  renderTable();
}

function resetFilters() {
  if (document.getElementById('flt-wing')) document.getElementById('flt-wing').value = 'ALL';
  if (document.getElementById('flt-search')) document.getElementById('flt-search').value = '';
  applyFilters();
}

function toggleSummaryPopover(e) {
  if (e) e.stopPropagation();
  const p = document.getElementById('summaryPopover');
  if (p) p.classList.toggle('show');
}

document.addEventListener('click', (e) => {
  const p = document.getElementById('summaryPopover');
  if (p && p.classList.contains('show') && !e.target.closest('.summary-dropdown-wrap')) {
    p.classList.remove('show');
  }
});

function renderSummary() {
  let count = filteredMembers.length;
  let totArea = 0;
  let totOpening = 0;

  filteredMembers.forEach(m => {
    totArea += parseFloat(m.areaSqFt || m.carpetArea) || 0;
    totOpening += parseFloat(m.openingBalance || m.openBal) || 0;
  });

  const sCount = document.getElementById('stat-count');
  if (sCount) sCount.innerText = `${count} Members`;
  const pCount = document.getElementById('pop-count');
  if (pCount) pCount.innerText = `${count} Members`;

  if (document.getElementById('stat-area')) document.getElementById('stat-area').innerText = formatCurrency(totArea) + ' Sq.Ft';
  if (document.getElementById('stat-opening')) document.getElementById('stat-opening').innerText = '₹' + formatCurrency(totOpening);
}

function renderTable() {
  const tbody = document.getElementById('tbl-data-sheet-body');
  const tfoot = document.getElementById('tbl-data-sheet-foot');
  const prtTbody = document.getElementById('prt-tbody');
  const prtTfoot = document.getElementById('prt-tfoot');
  if (!tbody) return;

  if (filteredMembers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="col-center" style="padding:30px; color:#64748b;">No member records found.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    if (prtTbody) prtTbody.innerHTML = `<tr><td colspan="10" class="col-center">No records found.</td></tr>`;
    return;
  }

  let html = '';
  let prtHtml = '';
  let totArea = 0, totOpening = 0;

  filteredMembers.forEach((m, idx) => {
    const area = parseFloat(m.areaSqFt || m.carpetArea) || 0;
    const openBal = parseFloat(m.openingBalance || m.openBal) || 0;
    totArea += area;
    totOpening += openBal;

    const memCode = m.memCode || m.memberCode || '-';
    const memName = m.memName || m.memberName || '-';
    const wing = m.wing || '-';
    const flat = m.flatNo || '-';
    const certNo = m.shareCertNo || m.certificateNo || '-';
    const phone = m.contactNo || m.mobile || '-';
    const email = m.email || '-';

    html += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td class="col-center"><strong>${escapeHtml(memCode)}</strong></td>
        <td><strong>${escapeHtml(memName)}</strong></td>
        <td class="col-center">${escapeHtml(wing)}</td>
        <td class="col-center"><strong>${escapeHtml(flat)}</strong></td>
        <td class="col-right">${area ? formatCurrency(area) : '-'}</td>
        <td class="col-center">${escapeHtml(certNo)}</td>
        <td class="col-center">${escapeHtml(phone)}</td>
        <td>${escapeHtml(email)}</td>
        <td class="col-right" style="color:${openBal > 0 ? '#dc2626' : (openBal < 0 ? '#16a34a' : '#64748b')}; font-weight:700;">${formatCurrency(openBal)}</td>
      </tr>
    `;

    prtHtml += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td class="col-center">${escapeHtml(memCode)}</td>
        <td>${escapeHtml(memName)}</td>
        <td class="col-center">${escapeHtml(wing)}</td>
        <td class="col-center">${escapeHtml(flat)}</td>
        <td class="col-right">${area ? formatCurrency(area) : '-'}</td>
        <td class="col-center">${escapeHtml(certNo)}</td>
        <td class="col-center">${escapeHtml(phone)}</td>
        <td>${escapeHtml(email)}</td>
        <td class="col-right"><strong>${formatCurrency(openBal)}</strong></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  if (prtTbody) prtTbody.innerHTML = prtHtml;

  const footHtml = `
    <tr>
      <td colspan="5" class="col-left" style="font-weight:800; text-transform:uppercase;">Total Members (${filteredMembers.length})</td>
      <td class="col-right" style="color:#2563eb;">${formatCurrency(totArea)} Sq.Ft</td>
      <td colspan="3"></td>
      <td class="col-right" style="color:#0f172a; font-size:12px;">₹ ${formatCurrency(totOpening)}</td>
    </tr>
  `;
  if (tfoot) tfoot.innerHTML = footHtml;
  if (prtTfoot) prtTfoot.innerHTML = footHtml;
}

function exportDataSheetExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded.');
    return;
  }

  const wsData = [
    [currentSocietyName],
    ['MEMBER MASTER DIRECTORY & DATA SHEET'],
    [`Generated on: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Sr No', 'Member Code', 'Member Name', 'Wing', 'Flat No', 'Area (Sq.Ft)', 'Share Certificate No', 'Mobile / Contact', 'Email Address', 'Opening Balance (₹)']
  ];

  filteredMembers.forEach((m, idx) => {
    const area = parseFloat(m.areaSqFt || m.carpetArea) || 0;
    const openBal = parseFloat(m.openingBalance || m.openBal) || 0;

    wsData.push([
      idx + 1,
      m.memCode || m.memberCode || '',
      m.memName || m.memberName || '',
      m.wing || '',
      m.flatNo || '',
      area,
      m.shareCertNo || m.certificateNo || '',
      m.contactNo || m.mobile || '',
      m.email || '',
      openBal
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Member Directory');
  XLSX.writeFile(wb, `Member_Data_Sheet_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function formatCurrency(val) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
