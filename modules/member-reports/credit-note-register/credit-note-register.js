// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Credit Note Register Controller
// ═══════════════════════════════════════════════════════════

let allNotes = [];
let filteredNotes = [];
let currentSocietyName = 'SHREE SAI RESIDENCY CO-OP HSG SOC LTD';

document.addEventListener('DOMContentLoaded', () => {
  initSocietyInfo();
  loadCreditNotes();
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
    if (lbl) lbl.innerHTML = `<i class="bi bi-building"></i> ${currentSocietyName} — Member Credit Note Adjustments`;
    const prtSoc = document.getElementById('prt-soc-name');
    if (prtSoc) prtSoc.innerText = currentSocietyName;
  } catch (e) {}
}

async function loadCreditNotes() {
  const tbody = document.getElementById('tbl-cn-body');
  if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="col-center" style="padding:30px; color:#94a3b8;"><i class="bi bi-hourglass-split"></i> Loading Credit Notes...</td></tr>`;

  try {
    const res = await fetch(getApiUrl('member-notes?societyId=1&fyId=1&type=creditnote'));
    const data = await res.json();

    if (data.success && Array.isArray(data.data)) {
      allNotes = data.data;
    } else if (Array.isArray(data)) {
      allNotes = data;
    } else {
      allNotes = [];
    }

    populateWings();
    applyFilters();
  } catch (err) {
    console.error('Failed to load credit notes:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="col-center" style="padding:30px; color:#dc2626;">Error loading credit notes: ${err.message}</td></tr>`;
  }
}

function populateWings() {
  const wingSet = new Set();
  allNotes.forEach(n => {
    if (n.wing) wingSet.add(n.wing.trim());
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

  filteredNotes = allNotes.filter(n => {
    if (wing !== 'ALL' && (n.wing || '').trim() !== wing) return false;

    if (search) {
      const match = (n.voucherNo || n.noteNo || '').toLowerCase().includes(search) ||
                    (n.personName || n.memName || n.memberName || '').toLowerCase().includes(search) ||
                    (n.personCode || n.memCode || n.memberCode || '').toLowerCase().includes(search) ||
                    (n.narration || '').toLowerCase().includes(search);
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
  let count = filteredNotes.length;
  let tot = 0;

  filteredNotes.forEach(n => {
    tot += parseFloat(n.amount) || 0;
  });

  const sCount = document.getElementById('stat-count');
  if (sCount) sCount.innerText = `${count} Notes`;
  const pCount = document.getElementById('pop-count');
  if (pCount) pCount.innerText = `${count} Notes`;

  if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = '₹' + formatCurrency(tot);
}

function renderTable() {
  const tbody = document.getElementById('tbl-cn-body');
  const tfoot = document.getElementById('tbl-cn-foot');
  const prtTbody = document.getElementById('prt-tbody');
  const prtTfoot = document.getElementById('prt-tfoot');
  if (!tbody) return;

  if (filteredNotes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="col-center" style="padding:30px; color:#64748b;">No credit notes match selected criteria.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    if (prtTbody) prtTbody.innerHTML = `<tr><td colspan="9" class="col-center">No records found.</td></tr>`;
    return;
  }

  let html = '';
  let prtHtml = '';
  let totAmt = 0;

  filteredNotes.forEach((n, idx) => {
    const amt = parseFloat(n.amount) || 0;
    totAmt += amt;

    const nDate = n.voucherDate || n.noteDate ? (n.voucherDate || n.noteDate).split('T')[0] : '-';
    const nNo = n.voucherNo || n.noteNo || ('CN-' + (n.voucherId || idx + 1));
    const memCode = n.personCode || n.memCode || n.memberCode || '-';
    const memName = n.personName || n.memName || n.memberName || '-';
    const flat = (n.wing ? (n.wing + '-') : '') + (n.flatNo || '');
    const bType = n.particular1 || n.billType || 'Maintenance';
    const narr = n.narration || 'Credit adjustment / concession';

    html += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td><strong>${escapeHtml(nNo)}</strong></td>
        <td class="col-center">${nDate}</td>
        <td class="col-center"><strong>${escapeHtml(memCode)}</strong></td>
        <td>${escapeHtml(memName)}</td>
        <td class="col-center">${escapeHtml(flat || '-')}</td>
        <td><span style="font-weight:700; color:#2563eb;">${escapeHtml(bType)}</span></td>
        <td class="col-right" style="color:#16a34a; font-weight:700;">${formatCurrency(amt)}</td>
        <td><span style="color:#64748b; font-size:10.5px;">${escapeHtml(narr)}</span></td>
      </tr>
    `;

    prtHtml += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td>${escapeHtml(nNo)}</td>
        <td class="col-center">${nDate}</td>
        <td class="col-center">${escapeHtml(memCode)}</td>
        <td>${escapeHtml(memName)}</td>
        <td class="col-center">${escapeHtml(flat || '-')}</td>
        <td>${escapeHtml(bType)}</td>
        <td class="col-right"><strong>${formatCurrency(amt)}</strong></td>
        <td>${escapeHtml(narr)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  if (prtTbody) prtTbody.innerHTML = prtHtml;

  const footHtml = `
    <tr>
      <td colspan="7" class="col-left" style="font-weight:800; text-transform:uppercase;">Total Credit Notes (${filteredNotes.length})</td>
      <td class="col-right" style="color:#16a34a; font-size:12px;">₹ ${formatCurrency(totAmt)}</td>
      <td></td>
    </tr>
  `;
  if (tfoot) tfoot.innerHTML = footHtml;
  if (prtTfoot) prtTfoot.innerHTML = footHtml;
}

function exportCreditNoteRegisterExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded.');
    return;
  }

  const wsData = [
    [currentSocietyName],
    ['MEMBER CREDIT NOTE REGISTER'],
    [`Generated on: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Sr No', 'Credit Note No', 'Date', 'Member Code', 'Member Name', 'Flat/Unit', 'Bill Type', 'Credit Amount (₹)', 'Reason / Narration']
  ];

  filteredNotes.forEach((n, idx) => {
    const amt = parseFloat(n.amount) || 0;
    const nDate = n.voucherDate || n.noteDate ? (n.voucherDate || n.noteDate).split('T')[0] : '';
    const nNo = n.voucherNo || n.noteNo || ('CN-' + (n.voucherId || idx + 1));
    const memCode = n.personCode || n.memCode || n.memberCode || '';
    const memName = n.personName || n.memName || n.memberName || '';
    const flat = (n.wing ? (n.wing + '-') : '') + (n.flatNo || '');
    const bType = n.particular1 || n.billType || 'Maintenance';
    const narr = n.narration || '';

    wsData.push([
      idx + 1,
      nNo,
      nDate,
      memCode,
      memName,
      flat,
      bType,
      amt,
      narr
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Credit Notes');
  XLSX.writeFile(wb, `Member_Credit_Note_Register_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function formatCurrency(val) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
