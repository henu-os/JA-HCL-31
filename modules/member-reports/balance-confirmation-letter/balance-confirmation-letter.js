// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Balance Confirmation Letter Controller
// ═══════════════════════════════════════════════════════════

let allMembers = [];
let filteredMembers = [];
let currentSocietyName = 'SHREE SAI RESIDENCY CO-OP HSG SOC LTD';

document.addEventListener('DOMContentLoaded', () => {
  initSocietyInfo();
  loadConfirmationData();
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
    if (lbl) lbl.innerHTML = `<i class="bi bi-building"></i> ${currentSocietyName} — Member Dues &amp; Audit Confirmation Letters`;
  } catch (e) {}
}

async function loadConfirmationData() {
  const container = document.getElementById('letters-container');
  if (container) container.innerHTML = `<div style="text-align:center; padding:50px; color:#94a3b8;"><i class="bi bi-hourglass-split"></i> Loading Member Ledger Balances for Confirmation Letters...</div>`;

  try {
    // Fetch live member ledger data
    const [mRes, bRes, rRes] = await Promise.all([
      fetch(getApiUrl('members?societyId=1')).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(getApiUrl('member-bills?societyId=1&fyId=1')).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(getApiUrl('member-receipts?societyId=1&fyId=1')).then(r => r.json()).catch(() => ({ data: [] }))
    ]);

    const members = (mRes.success && Array.isArray(mRes.data)) ? mRes.data : (Array.isArray(mRes) ? mRes : []);
    const bills = (bRes.success && Array.isArray(bRes.data)) ? bRes.data : (Array.isArray(bRes) ? bRes : []);
    const receipts = (rRes.success && Array.isArray(rRes.data)) ? rRes.data : (Array.isArray(rRes) ? rRes : []);

    allMembers = members.map(m => {
      const code = (m.memCode || m.memberCode || '').trim();
      const mId = m.memberId;
      const openBal = parseFloat(m.openingBalance || m.openBal) || 0;

      let totBilled = 0;
      bills.forEach(b => {
        if (b.memberId === mId || (b.memCode && b.memCode.trim() === code)) {
          totBilled += parseFloat(b.principalAmount) || parseFloat(b.totalAmount) || 0;
        }
      });

      let totPaid = 0;
      receipts.forEach(r => {
        if (r.memberId === mId || (r.personCode && r.personCode.trim() === code)) {
          totPaid += parseFloat(r.amount) || 0;
        }
      });

      const closing = openBal + totBilled - totPaid;

      return {
        ...m,
        openingBal: openBal,
        totalBilled: totBilled,
        totalPaid: totPaid,
        closingBal: closing
      };
    });

    populateWings();
    applyFilters();
  } catch (err) {
    console.error('Failed to load confirmation data:', err);
    if (container) container.innerHTML = `<div style="text-align:center; padding:50px; color:#dc2626;">Error calculating confirmation letters: ${err.message}</div>`;
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
  const balType = document.getElementById('flt-bal-type')?.value || 'DUES';
  const search = (document.getElementById('flt-search')?.value || '').toLowerCase().trim();

  filteredMembers = allMembers.filter(m => {
    if (wing !== 'ALL' && (m.wing || '').trim() !== wing) return false;

    if (balType === 'DUES' && m.closingBal <= 0.01) return false;
    if (balType === 'ADVANCE' && m.closingBal >= -0.01) return false;
    if (balType === 'NIL' && Math.abs(m.closingBal) > 0.01) return false;

    if (search) {
      const match = (m.memCode || m.memberCode || '').toLowerCase().includes(search) ||
                    (m.memName || m.memberName || '').toLowerCase().includes(search) ||
                    (m.flatNo || '').toLowerCase().includes(search);
      if (!match) return false;
    }
    return true;
  });

  renderSummary();
  renderView();
}

function resetFilters() {
  if (document.getElementById('flt-wing')) document.getElementById('flt-wing').value = 'ALL';
  if (document.getElementById('flt-bal-type')) document.getElementById('flt-bal-type').value = 'DUES';
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
  let drCount = 0;
  let crCount = 0;
  let totalDues = 0;

  allMembers.forEach(m => {
    if (m.closingBal > 0.01) {
      drCount++;
      totalDues += m.closingBal;
    } else if (m.closingBal < -0.01) {
      crCount++;
    }
  });

  const sCount = document.getElementById('stat-count');
  if (sCount) sCount.innerText = `${count} Letters`;
  const pCount = document.getElementById('pop-count');
  if (pCount) pCount.innerText = `${count} Letters`;

  if (document.getElementById('stat-dr-count')) document.getElementById('stat-dr-count').innerText = drCount;
  if (document.getElementById('stat-cr-count')) document.getElementById('stat-cr-count').innerText = crCount;
  if (document.getElementById('stat-total-dues')) document.getElementById('stat-total-dues').innerText = '₹' + formatCurrency(totalDues);
}

function toggleViewMode() {
  const mode = document.getElementById('flt-view-mode')?.value || 'LETTERS';
  const panelTable = document.getElementById('panel-table-view');
  const panelLetters = document.getElementById('panel-letters-view');

  if (mode === 'TABLE') {
    if (panelTable) panelTable.style.display = 'block';
    if (panelLetters) panelLetters.style.display = 'none';
  } else {
    if (panelTable) panelTable.style.display = 'none';
    if (panelLetters) panelLetters.style.display = 'block';
  }
  renderView();
}

function renderView() {
  renderLetters();
  renderTable();
}

function renderLetters() {
  const container = document.getElementById('letters-container');
  if (!container) return;

  if (filteredMembers.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:50px; color:#64748b;">No member records match selected criteria for confirmation letters.</div>`;
    return;
  }

  let html = '';
  filteredMembers.forEach((m, idx) => {
    const memCode = m.memCode || m.memberCode || '-';
    const memName = m.memName || m.memberName || '-';
    const flat = (m.wing ? (m.wing + '-') : '') + (m.flatNo || '');
    const bal = m.closingBal;
    const isDr = bal >= 0;
    const balText = isDr ? `${formatCurrency(bal)} (Debit / Due)` : `${formatCurrency(Math.abs(bal))} (Credit / Advance)`;

    html += `
      <div class="letter-preview-sheet">
        <div class="letter-header">
          <div class="letter-soc-title">${escapeHtml(currentSocietyName)}</div>
          <div class="letter-soc-sub">Registered Under Maharashtra Co-operative Societies Act, 1960 | Registration No: BOM/HSG/2020/2026</div>
        </div>

        <div class="letter-meta">
          <div>
            <strong>To:</strong><br>
            ${escapeHtml(memName)}<br>
            Flat No: ${escapeHtml(flat)}<br>
            Member Code: ${escapeHtml(memCode)}
          </div>
          <div style="text-align: right;">
            <strong>Date:</strong> 31st March 2027<br>
            <strong>Ref:</strong> JEEV/CONF/2026-27/${idx + 1}<br>
            <strong>F.Y.:</strong> 2026 - 2027
          </div>
        </div>

        <div class="letter-title-badge">CONFIRMATION OF ACCOUNT BALANCE AS ON 31/03/2027</div>

        <div class="letter-body">
          <p>Dear Member,</p>
          <p style="margin-top: 8px;">
            In connection with the statutory annual audit of our Society for the financial year ending <strong>31st March 2027</strong>, 
            please confirm directly to our statutory auditors the correctness of the balance outstanding in your maintenance account as stated below:
          </p>

          <table class="letter-table">
            <thead>
              <tr>
                <th>Particulars</th>
                <th style="text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Opening Balance as on 01/04/2026</td>
                <td style="text-align: right; font-family: Consolas;">${formatCurrency(m.openingBal)}</td>
              </tr>
              <tr>
                <td>Add: Maintenance &amp; Charges Billed during the Year</td>
                <td style="text-align: right; font-family: Consolas;">${formatCurrency(m.totalBilled)}</td>
              </tr>
              <tr>
                <td>Less: Total Collections &amp; Receipts Received</td>
                <td style="text-align: right; font-family: Consolas;">${formatCurrency(m.totalPaid)}</td>
              </tr>
              <tr style="background: #f8fafc; font-weight: 800;">
                <td>Net Outstanding Closing Balance as on 31/03/2027</td>
                <td style="text-align: right; font-family: Consolas; color: ${isDr ? '#dc2626' : '#16a34a'};">${balText}</td>
              </tr>
            </tbody>
          </table>

          <p style="font-size: 11px; color: #475569;">
            If the above balance is in agreement with your records, please sign and return the confirmation slip below. 
            If not, please specify the differences with complete payment particulars.
          </p>
        </div>

        <div class="letter-sign-block">
          <div>
            __________________________<br>
            <strong>Hon. Secretary / Treasurer</strong><br>
            ${escapeHtml(currentSocietyName)}
          </div>
          <div style="text-align: right;">
            __________________________<br>
            <strong>Statutory Auditor</strong><br>
            Chartered Accountants
          </div>
        </div>

        <div class="letter-ack-slip">
          <div style="text-align: center; font-weight: 800; font-size: 11px; margin-bottom: 8px;">(PLEASE DETACH AND RETURN THIS CONFIRMATION SLIP)</div>
          <p style="font-size: 11px;">
            To The Statutory Auditor, <strong>${escapeHtml(currentSocietyName)}</strong>.<br>
            I/We hereby confirm that the balance of <strong>₹ ${balText}</strong> appearing against my Flat No: <strong>${escapeHtml(flat)}</strong> as on 31/03/2027 is correct.
          </p>
          <div style="display: flex; justify-content: space-between; margin-top: 24px; font-size: 11px;">
            <div>Date: ______________</div>
            <div>Mobile: ______________</div>
            <div>Signature of Member: ______________________</div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderTable() {
  const tbody = document.getElementById('tbl-summary-body');
  const tfoot = document.getElementById('tbl-summary-foot');
  if (!tbody) return;

  if (filteredMembers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="col-center" style="padding:30px; color:#64748b;">No records match selected criteria.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let html = '';
  let totOp = 0, totBill = 0, totPd = 0, totCl = 0;

  filteredMembers.forEach((m, idx) => {
    totOp += m.openingBal;
    totBill += m.totalBilled;
    totPd += m.totalPaid;
    totCl += m.closingBal;

    const memCode = m.memCode || m.memberCode || '-';
    const memName = m.memName || m.memberName || '-';
    const wing = m.wing || '-';
    const flat = m.flatNo || '-';
    const phone = m.contactNo || m.mobile || '-';

    html += `
      <tr>
        <td class="col-center">${idx + 1}</td>
        <td class="col-center"><strong>${escapeHtml(memCode)}</strong></td>
        <td><strong>${escapeHtml(memName)}</strong></td>
        <td class="col-center">${escapeHtml(wing)}</td>
        <td class="col-center"><strong>${escapeHtml(flat)}</strong></td>
        <td class="col-center">${escapeHtml(phone)}</td>
        <td class="col-right">${formatCurrency(m.openingBal)}</td>
        <td class="col-right" style="color:#2563eb;">${formatCurrency(m.totalBilled)}</td>
        <td class="col-right" style="color:#16a34a;">${formatCurrency(m.totalPaid)}</td>
        <td class="col-right" style="color:${m.closingBal > 0 ? '#dc2626' : '#16a34a'}; font-weight:800;">${formatCurrency(m.closingBal)}</td>
        <td class="col-center">
          <button class="btn-reset" style="height:24px; padding:0 8px; font-size:10px;" onclick="printSingleMember('${escapeHtml(memCode)}')"><i class="bi bi-printer"></i> Letter</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  const footHtml = `
    <tr>
      <td colspan="6" class="col-left" style="font-weight:800; text-transform:uppercase;">Total (${filteredMembers.length} Members)</td>
      <td class="col-right">${formatCurrency(totOp)}</td>
      <td class="col-right" style="color:#2563eb;">${formatCurrency(totBill)}</td>
      <td class="col-right" style="color:#16a34a;">${formatCurrency(totPd)}</td>
      <td class="col-right" style="color:#dc2626; font-size:12px;">₹ ${formatCurrency(totCl)}</td>
      <td></td>
    </tr>
  `;
  if (tfoot) tfoot.innerHTML = footHtml;
}

function printSingleMember(memCode) {
  document.getElementById('flt-view-mode').value = 'LETTERS';
  document.getElementById('flt-search').value = memCode;
  applyFilters();
  window.print();
}

function exportConfirmationSummaryExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded.');
    return;
  }

  const wsData = [
    [currentSocietyName],
    ['MEMBER BALANCE CONFIRMATION AUDIT SUMMARY'],
    [`Generated on: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Sr No', 'Member Code', 'Member Name', 'Wing', 'Flat No', 'Contact No', 'Opening Balance (₹)', 'Total Billed (₹)', 'Total Paid (₹)', 'Closing Balance (₹)', 'Status']
  ];

  filteredMembers.forEach((m, idx) => {
    const status = m.closingBal > 0.01 ? 'DUES / DR' : (m.closingBal < -0.01 ? 'ADVANCE / CR' : 'NIL');
    wsData.push([
      idx + 1,
      m.memCode || m.memberCode || '',
      m.memName || m.memberName || '',
      m.wing || '',
      m.flatNo || '',
      m.contactNo || m.mobile || '',
      m.openingBal,
      m.totalBilled,
      m.totalPaid,
      m.closingBal,
      status
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Audit Confirmations');
  XLSX.writeFile(wb, `Balance_Confirmation_Summary_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function formatCurrency(val) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
