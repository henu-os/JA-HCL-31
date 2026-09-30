// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Member Control Account Reconciliation Controller
// ═══════════════════════════════════════════════════════════

let controlData = [];
let currentSocietyName = 'SHREE SAI RESIDENCY CO-OP HSG SOC LTD';

document.addEventListener('DOMContentLoaded', () => {
  initSocietyInfo();
  loadControlAccount();
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
    if (lbl) lbl.innerHTML = `<i class="bi bi-building"></i> ${currentSocietyName} — Month-by-Month Control Account Reconciliation`;
    const prtSoc = document.getElementById('prt-soc-name');
    if (prtSoc) prtSoc.innerText = currentSocietyName;
  } catch (e) {}
}

async function loadControlAccount() {
  const tbody = document.getElementById('tbl-ctrl-body');
  if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="col-center" style="padding:30px; color:#94a3b8;"><i class="bi bi-hourglass-split"></i> Loading Control Account Reconciliation...</td></tr>`;

  try {
    // Fetch live bills, receipts, and opening balance
    const [bRes, rRes, oRes] = await Promise.all([
      fetch(getApiUrl('member-bills?societyId=1&fyId=1')).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(getApiUrl('member-receipts?societyId=1&fyId=1')).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(getApiUrl('members?societyId=1')).then(r => r.json()).catch(() => ({ data: [] }))
    ]);

    const bills = (bRes.success && Array.isArray(bRes.data)) ? bRes.data : (Array.isArray(bRes) ? bRes : []);
    const receipts = (rRes.success && Array.isArray(rRes.data)) ? rRes.data : (Array.isArray(rRes) ? rRes : []);
    const members = (oRes.success && Array.isArray(oRes.data)) ? oRes.data : (Array.isArray(oRes) ? oRes : []);

    let startOpening = 0;
    members.forEach(m => {
      startOpening += parseFloat(m.openingBalance || m.openBal) || 0;
    });

    const months = [
      { name: 'April 2026', key: '2026-04' },
      { name: 'May 2026', key: '2026-05' },
      { name: 'June 2026', key: '2026-06' },
      { name: 'July 2026', key: '2026-07' },
      { name: 'August 2026', key: '2026-08' },
      { name: 'September 2026', key: '2026-09' },
      { name: 'October 2026', key: '2026-10' },
      { name: 'November 2026', key: '2026-11' },
      { name: 'December 2026', key: '2026-12' },
      { name: 'January 2027', key: '2027-01' },
      { name: 'February 2027', key: '2027-02' },
      { name: 'March 2027', key: '2027-03' }
    ];

    let runningBal = startOpening;
    controlData = [];

    months.forEach((m, idx) => {
      let mBills = 0;
      let mReceipts = 0;
      let mDebitNotes = 0;
      let mCreditNotes = 0;
      let mAdjustments = 0;

      bills.forEach(b => {
        const d = b.billDate || '';
        if (d.startsWith(m.key)) {
          mBills += parseFloat(b.principalAmount) || parseFloat(b.totalAmount) || 0;
        }
      });

      receipts.forEach(r => {
        const d = r.voucherDate || r.receiptDate || '';
        if (d.startsWith(m.key)) {
          mReceipts += parseFloat(r.amount) || 0;
        }
      });

      const opBal = runningBal;
      const clBal = opBal + mBills + mDebitNotes - mReceipts - mCreditNotes + mAdjustments;
      runningBal = clBal;

      controlData.push({
        srNo: idx + 1,
        month: m.name,
        opening: opBal,
        billed: mBills,
        debitNotes: mDebitNotes,
        receipts: mReceipts,
        creditNotes: mCreditNotes,
        adjustments: mAdjustments,
        closing: clBal
      });
    });

    renderSummary(startOpening, runningBal);
    renderTable();
  } catch (err) {
    console.error('Failed to load control account:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="col-center" style="padding:30px; color:#dc2626;">Error calculating control account: ${err.message}</td></tr>`;
  }
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

function renderSummary(startOpening, finalClosing) {
  let totBilled = 0;
  let totCollected = 0;

  controlData.forEach(d => {
    totBilled += d.billed;
    totCollected += d.receipts;
  });

  if (document.getElementById('stat-opening')) document.getElementById('stat-opening').innerText = '₹' + formatCurrency(startOpening);
  if (document.getElementById('stat-billed')) document.getElementById('stat-billed').innerText = '₹' + formatCurrency(totBilled);
  if (document.getElementById('stat-collected')) document.getElementById('stat-collected').innerText = '₹' + formatCurrency(totCollected);
  if (document.getElementById('stat-closing')) document.getElementById('stat-closing').innerText = '₹' + formatCurrency(finalClosing);
}

function renderTable() {
  const tbody = document.getElementById('tbl-ctrl-body');
  const tfoot = document.getElementById('tbl-ctrl-foot');
  const prtTbody = document.getElementById('prt-tbody');
  const prtTfoot = document.getElementById('prt-tfoot');
  if (!tbody) return;

  let html = '';
  let prtHtml = '';
  let totBilled = 0, totDN = 0, totRec = 0, totCN = 0, totAdj = 0;

  controlData.forEach(d => {
    totBilled += d.billed;
    totDN += d.debitNotes;
    totRec += d.receipts;
    totCN += d.creditNotes;
    totAdj += d.adjustments;

    html += `
      <tr>
        <td class="col-center">${d.srNo}</td>
        <td><strong>${d.month}</strong></td>
        <td class="col-right" style="color:#d97706;">${formatCurrency(d.opening)}</td>
        <td class="col-right" style="color:#2563eb; font-weight:700;">${formatCurrency(d.billed)}</td>
        <td class="col-right" style="color:#dc2626;">${formatCurrency(d.debitNotes)}</td>
        <td class="col-right" style="color:#16a34a; font-weight:700;">${formatCurrency(d.receipts)}</td>
        <td class="col-right" style="color:#16a34a;">${formatCurrency(d.creditNotes)}</td>
        <td class="col-right">${formatCurrency(d.adjustments)}</td>
        <td class="col-right" style="color:#dc2626; font-weight:800;">${formatCurrency(d.closing)}</td>
      </tr>
    `;

    prtHtml += `
      <tr>
        <td class="col-center">${d.srNo}</td>
        <td><strong>${d.month}</strong></td>
        <td class="col-right">${formatCurrency(d.opening)}</td>
        <td class="col-right"><strong>${formatCurrency(d.billed)}</strong></td>
        <td class="col-right">${formatCurrency(d.debitNotes)}</td>
        <td class="col-right"><strong>${formatCurrency(d.receipts)}</strong></td>
        <td class="col-right">${formatCurrency(d.creditNotes)}</td>
        <td class="col-right">${formatCurrency(d.adjustments)}</td>
        <td class="col-right"><strong>${formatCurrency(d.closing)}</strong></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  if (prtTbody) prtTbody.innerHTML = prtHtml;

  const startOp = controlData[0] ? controlData[0].opening : 0;
  const endCl = controlData[controlData.length - 1] ? controlData[controlData.length - 1].closing : 0;

  const footHtml = `
    <tr>
      <td colspan="2" class="col-left" style="font-weight:800; text-transform:uppercase;">Annual Reconciliation Total</td>
      <td class="col-right" style="color:#d97706;">${formatCurrency(startOp)}</td>
      <td class="col-right" style="color:#2563eb;">${formatCurrency(totBilled)}</td>
      <td class="col-right" style="color:#dc2626;">${formatCurrency(totDN)}</td>
      <td class="col-right" style="color:#16a34a;">${formatCurrency(totRec)}</td>
      <td class="col-right" style="color:#16a34a;">${formatCurrency(totCN)}</td>
      <td class="col-right">${formatCurrency(totAdj)}</td>
      <td class="col-right" style="color:#dc2626; font-size:12px;">₹ ${formatCurrency(endCl)}</td>
    </tr>
  `;
  if (tfoot) tfoot.innerHTML = footHtml;
  if (prtTfoot) prtTfoot.innerHTML = footHtml;
}

function exportControlAccountExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel library not loaded.');
    return;
  }

  const wsData = [
    [currentSocietyName],
    ['MEMBER CONTROL ACCOUNT (SUNDRY DEBTORS) RECONCILIATION'],
    [`Generated on: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['Sr No', 'Month / Period', 'Opening Balance (₹)', 'Maintenance Billed (₹)', 'Debit Notes (₹)', 'Collections (₹)', 'Credit Notes (₹)', 'Adjustments (₹)', 'Closing Balance (₹)']
  ];

  controlData.forEach(d => {
    wsData.push([
      d.srNo,
      d.month,
      d.opening,
      d.billed,
      d.debitNotes,
      d.receipts,
      d.creditNotes,
      d.adjustments,
      d.closing
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Control Account');
  XLSX.writeFile(wb, `Member_Control_Account_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function formatCurrency(val) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
