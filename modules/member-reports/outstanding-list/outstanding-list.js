// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Member Outstanding Dues List Engine
// Granular Principal, Interest, Closing Debit & Credit Report
// ═══════════════════════════════════════════════════════════

let outstandingData = [];
let availableBillTypes = [];
let _fyStartDate = '';
let _fyEndDate = '';

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireContext()) return;
  initContext();
  setupFinancialYearDates();
  await loadBillTypes();
  await loadOutstandingData();
});

function initContext() {
  const socName = Auth.getSocietyName();
  const fyLabel = Auth.getFYLabel();

  const pSocEl = document.getElementById('printSocName');
  if (pSocEl) pSocEl.textContent = socName;

  const pFyEl = document.getElementById('printFYLabel');
  if (pFyEl) pFyEl.textContent = fyLabel;
}

function setupFinancialYearDates() {
  const fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2026-27');
  const parts = fyLabel.split('-');
  let startYear = parseInt(parts[0], 10) || 2026;
  if (startYear < 2000) startYear += 2000;
  const endYear = startYear + 1;

  _fyStartDate = `${startYear}-04-01`;
  _fyEndDate = `${endYear}-03-31`;

  const toEl = document.getElementById('toDate');
  if (toEl && !toEl.value) toEl.value = _fyEndDate;
}

function getDisplayBillTypeName(selectedType, fallbackRecords = []) {
  if (!selectedType || selectedType.toUpperCase() !== 'ALL') {
    return selectedType || '—';
  }
  const masterTypes = availableBillTypes.filter(bt => bt && bt.toUpperCase() !== 'ALL');
  if (masterTypes.length > 0) {
    return masterTypes.join(' & ');
  }
  if (Array.isArray(fallbackRecords) && fallbackRecords.length > 0) {
    const fromRecords = [...new Set(fallbackRecords.map(r => (r.billType || r.BillType || '').trim()).filter(Boolean))];
    if (fromRecords.length > 0) {
      return fromRecords.join(' & ');
    }
  }
  return 'All Bill Types';
}

window.applyDatePreset = function (preset) {
  const toEl = document.getElementById('toDate');
  if (!toEl) return;

  if (!_fyStartDate) setupFinancialYearDates();
  const fyStart = new Date(_fyStartDate);
  const fyEnd = new Date(_fyEndDate);
  const now = new Date();

  const fmt = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (preset === 'today') {
    toEl.value = fmt(now);
  } else if (preset === 'this-month') {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    toEl.value = fmt(end);
  } else if (preset === 'last-month') {
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    toEl.value = fmt(end);
  } else if (preset === 'q1') {
    toEl.value = `${fyStart.getFullYear()}-06-30`;
  } else if (preset === 'q2') {
    toEl.value = `${fyStart.getFullYear()}-09-30`;
  } else if (preset === 'q3') {
    toEl.value = `${fyStart.getFullYear()}-12-31`;
  } else if (preset === 'q4' || preset === 'full') {
    toEl.value = `${fyEnd.getFullYear()}-03-31`;
  }

  loadOutstandingData();
};

window.onDateChange = function () {
  const presetEl = document.getElementById('datePresetSelect');
  if (presetEl) presetEl.value = 'custom';
  loadOutstandingData();
};

function extractTxDate(tx) {
  if (!tx) return '';
  const d = tx.billDate || tx.BillDate || tx.receiptDate || tx.ReceiptDate || tx.noteDate || tx.NoteDate || tx.reversalDate || tx.ReversalDate || tx.transferDate || tx.TransferDate || tx.voucherDate || tx.VoucherDate || tx.date || tx.Date || '';
  if (!d) return '';
  return typeof d === 'string' ? d.substring(0, 10) : (d instanceof Date ? d.toISOString().substring(0, 10) : '');
}

function formatDisplayDate(dStr) {
  if (!dStr) return '';
  const parts = dStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dStr;
}

async function loadBillTypes() {
  const societyId = Auth.getSocietyId();
  const selectEl = document.getElementById('billTypeSelect');
  if (!selectEl) return;

  try {
    const res = await API.get(`/bill-types?societyId=${societyId}`).catch(() => null);
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      const names = res.data.map(bt => (bt.billTypeName || bt.name || bt.typeName || '').trim()).filter(Boolean);
      availableBillTypes = [...new Set(names)];
    } else {
      const localKey = 'jeevika_bill_types_' + societyId;
      const raw = localStorage.getItem(localKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          availableBillTypes = [...new Set(Object.keys(parsed).map(k => k.trim()).filter(Boolean))];
        }
      }
    }
  } catch (e) {
    console.warn('Bill types load error:', e);
  }

  availableBillTypes = availableBillTypes.filter(bt => bt.toUpperCase() !== 'ALL');
  availableBillTypes.unshift('ALL');

  const currentVal = selectEl.value;
  selectEl.innerHTML = availableBillTypes.map(bt => `<option value="${escHtml(bt)}">${escHtml(bt)}</option>`).join('');

  if (currentVal && availableBillTypes.includes(currentVal)) {
    selectEl.value = currentVal;
  } else if (availableBillTypes.length > 1) {
    selectEl.value = availableBillTypes[1];
  } else if (availableBillTypes.length > 0) {
    selectEl.value = availableBillTypes[0];
  }
}

window.onBillTypeChange = function () {
  loadOutstandingData();
};

async function loadOutstandingData() {
  const societyId = Auth.getSocietyId();
  const fyId      = Auth.getFYId();
  if (!societyId || !fyId) return;

  const defaultBt = availableBillTypes.length > 1 ? availableBillTypes[1] : (availableBillTypes[0] || 'ALL');
  const billType = document.getElementById('billTypeSelect')?.value || defaultBt;
  const isAll = (billType.toUpperCase() === 'ALL');
  const pBtEl = document.getElementById('printBillType');
  if (pBtEl) pBtEl.textContent = getDisplayBillTypeName(billType);

  const toDate   = document.getElementById('toDate')?.value || '';

  const pPeriodEl = document.getElementById('printDatePeriod');
  if (pPeriodEl) {
    pPeriodEl.textContent = toDate ? formatDisplayDate(toDate) : 'Current / All Records';
  }

  showLoading(`Loading Outstanding Dues for ${billType}...`);

  try {
    const [memRes, billRes, recRes, opRes, cnRes, dnRes, revRes] = await Promise.all([
      API.get(`/members?societyId=${societyId}`).catch(() => ({ data: [] })),
      API.get(`/member-bills?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] })),
      API.get(`/member-receipts?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] })),
      isAll 
        ? Promise.all(availableBillTypes.filter(bt => bt.toUpperCase() !== 'ALL').map(bt => API.get(`/opening-balances/member?societyId=${societyId}&fyId=${fyId}&billType=${encodeURIComponent(bt)}`).catch(() => ({ data: [] }))))
        : API.get(`/opening-balances/member?societyId=${societyId}&fyId=${fyId}&billType=${encodeURIComponent(billType)}`).catch(() => ({ data: [] })),
      API.get(`/member-credit-notes?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] })),
      API.get(`/member-debit-notes?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] })),
      API.get(`/receipt-reversals?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] }))
    ]);

    const members = Array.isArray(memRes.data) ? memRes.data : (Array.isArray(memRes) ? memRes : []);
    const allBills = Array.isArray(billRes.data) ? billRes.data : (Array.isArray(billRes) ? billRes : []);
    const allReceipts = Array.isArray(recRes.data) ? recRes.data : (Array.isArray(recRes) ? recRes : []);
    const allCreditNotes = Array.isArray(cnRes.data) ? cnRes.data : (Array.isArray(cnRes) ? cnRes : []);
    const allDebitNotes = Array.isArray(dnRes.data) ? dnRes.data : (Array.isArray(dnRes) ? dnRes : []);
    const allReversals = Array.isArray(revRes.data) ? revRes.data : (Array.isArray(revRes) ? revRes : []);

    if (isAll && pBtEl) {
      pBtEl.textContent = getDisplayBillTypeName(billType, [...allBills, ...allReceipts]);
    }

    const bills = isAll ? allBills : allBills.filter(b => (b.billType || b.BillType || '').toLowerCase().trim() === billType.toLowerCase().trim());
    const receipts = isAll ? allReceipts : allReceipts.filter(r => (r.billType || r.BillType || '').toLowerCase().trim() === billType.toLowerCase().trim());
    const creditNotes = isAll ? allCreditNotes : allCreditNotes.filter(cn => (cn.billType || cn.BillType || '').toLowerCase().trim() === billType.toLowerCase().trim());
    const debitNotes = isAll ? allDebitNotes : allDebitNotes.filter(dn => (dn.billType || dn.BillType || '').toLowerCase().trim() === billType.toLowerCase().trim());
    const reversals = isAll ? allReversals : allReversals.filter(rv => (rv.billType || rv.BillType || '').toLowerCase().trim() === billType.toLowerCase().trim());

    // Opening balances map
    const opBalMap = {};
    if (isAll) {
      if (Array.isArray(opRes)) {
        opRes.forEach(opResItem => {
          if (Array.isArray(opResItem.data)) {
            opResItem.data.forEach(ob => {
              const mId = ob.id || ob.memberId || ob.MemberId;
              if (mId) {
                if (!opBalMap[mId]) opBalMap[mId] = { prin: 0, intr: 0 };
                opBalMap[mId].prin += parseFloat(ob.prin !== undefined ? ob.prin : (ob.opPrincipal || 0)) || 0;
                opBalMap[mId].intr += parseFloat(ob.int !== undefined ? ob.int : (ob.opInterest || 0)) || 0;
              }
            });
          }
        });
      }
    } else {
      if (Array.isArray(opRes.data)) {
        opRes.data.forEach(ob => {
          const mId = ob.id || ob.memberId || ob.MemberId;
          if (mId) {
            opBalMap[mId] = {
              prin: parseFloat(ob.prin !== undefined ? ob.prin : (ob.opPrincipal || 0)) || 0,
              intr: parseFloat(ob.int !== undefined ? ob.int : (ob.opInterest || 0)) || 0
            };
          }
        });
      }
    }

    // Maps partitioned by toDate
    const billPrinMap = {};
    const billIntrMap = {};

    bills.forEach(b => {
      const mId = b.memberId || b.MemberId;
      const amt = parseFloat(b.totalAmount || b.TotalAmount || b.amount || 0);
      const d = extractTxDate(b);

      let bIntr = 0;
      let bPrin = amt;
      // Check if bill has line items
      const items = b.items || b.BillItems || b.billItems || [];
      if (Array.isArray(items) && items.length > 0) {
        bIntr = 0;
        bPrin = 0;
        items.forEach(it => {
          const itName = (it.accountName || it.AccountName || '').toLowerCase();
          const itAmt = parseFloat(it.amount || it.Amount || 0);
          if (itName.includes('interest') || itName.includes('late fee')) {
            bIntr += itAmt;
          } else {
            bPrin += itAmt;
          }
        });
      }

      if (!toDate || !d || d <= toDate) {
        billPrinMap[mId] = (billPrinMap[mId] || 0) + bPrin;
        billIntrMap[mId] = (billIntrMap[mId] || 0) + bIntr;
      }
    });

    debitNotes.forEach(dn => {
      const mId = dn.memberId || dn.MemberId;
      const amt = parseFloat(dn.amount || dn.Amount || dn.totalAmount || 0);
      const d = extractTxDate(dn);
      if (!toDate || !d || d <= toDate) {
        billPrinMap[mId] = (billPrinMap[mId] || 0) + amt;
      }
    });

    // Received maps up to toDate
    const recMap = {};

    receipts.forEach(r => {
      const mId = r.memberId || r.MemberId;
      const amt = parseFloat(r.amount || r.Amount || r.totalAmount || 0);
      const d = extractTxDate(r);
      if (!toDate || !d || d <= toDate) {
        recMap[mId] = (recMap[mId] || 0) + amt;
      }
    });

    creditNotes.forEach(cn => {
      const mId = cn.memberId || cn.MemberId;
      const amt = parseFloat(cn.amount || cn.Amount || cn.totalAmount || 0);
      const d = extractTxDate(cn);
      if (!toDate || !d || d <= toDate) {
        recMap[mId] = (recMap[mId] || 0) + amt;
      }
    });

    reversals.forEach(rv => {
      let mId = rv.memberId || rv.MemberId;
      if (!mId && rv.flatNo) {
        const mem = members.find(m => (m.flatNo || '').toLowerCase() === (rv.flatNo || '').toLowerCase());
        if (mem) mId = mem.memberId || mem.id;
      }
      const amt = parseFloat(rv.amount || rv.Amount || 0);
      const d = extractTxDate(rv);
      if (mId) {
        if (!toDate || !d || d <= toDate) {
          recMap[mId] = (recMap[mId] || 0) - amt;
        }
      }
    });

    // Build Rows
    outstandingData = members.map((m, idx) => {
      const mId = m.memberId || m.MemberId;

      let op = opBalMap[mId];
      if (!op || (op.prin === 0 && op.intr === 0)) {
        if (m.opBalances && typeof m.opBalances === 'object') {
          const bObj = m.opBalances[billType] || m.opBalances[billType.toLowerCase()];
          if (bObj) {
            op = {
              prin: parseFloat(bObj.principal !== undefined ? bObj.principal : (bObj.Principal || 0)) || 0,
              intr: parseFloat(bObj.interest !== undefined ? bObj.interest : (bObj.Interest || 0)) || 0
            };
          }
        }
      }

      if (!op) {
        if (billType.toLowerCase() === 'maintenance' || isAll) {
          op = {
            prin: parseFloat(m.opPrincipal || m.OpPrincipal || 0) || 0,
            intr: parseFloat(m.opInterest || m.OpInterest || 0) || 0
          };
        } else {
          op = { prin: 0, intr: 0 };
        }
      }

      const baseOpTotal = (op.prin || 0) + (op.intr || 0);
      const effectiveOpNet = baseOpTotal;

      let opDues = 0;
      let opAdv = 0;
      if (effectiveOpNet >= 0) {
        opDues = effectiveOpNet;
      } else {
        opAdv = Math.abs(effectiveOpNet);
      }

      const curPrin = billPrinMap[mId] || 0;
      const curIntr = billIntrMap[mId] || 0;
      const totalBilled = curPrin + curIntr;
      const totalRec = recMap[mId] || 0;

      // Net Balance = (OpDues - OpAdv) + TotalDebit - TotalCredit
      const net = (opDues - opAdv) + totalBilled - totalRec;

      let closingDebit = 0;
      let closingCredit = 0;
      let principalDues = 0;
      let interestDues = 0;

      if (net > 0) {
        closingDebit = net;
        closingCredit = 0;

        // Breakdown into Principal and Interest
        const totalIntrCandidate = (op.intr || 0) + curIntr;
        if (closingDebit <= totalIntrCandidate) {
          interestDues = closingDebit;
          principalDues = 0;
        } else {
          interestDues = totalIntrCandidate;
          principalDues = closingDebit - interestDues;
        }
      } else if (net < 0) {
        closingDebit = 0;
        closingCredit = Math.abs(net);
        principalDues = 0;
        interestDues = 0;
      }

      return {
        idx: idx + 1,
        memberId: mId,
        memCode: m.memCode || m.MemCode || '',
        flatNo: m.flatNo || m.FlatNo || '—',
        wing: m.wing || m.Wing || '',
        memName: m.memName || m.MemName || '—',
        principal: principalDues,
        interest: interestDues,
        closingDebit: closingDebit,
        closingCredit: closingCredit,
        net: net
      };
    });

    filterTable();
  } catch (err) {
    handleError(err, 'Failed to load Outstanding Dues statement.');
  } finally {
    hideLoading();
  }
}

function renderTable(list) {
  const tbody = document.getElementById('mainTableBody');
  if (!tbody) return;

  const isClosingOnly = (document.getElementById('columnViewMode')?.value === 'closing_only');

  if (!list || list.length === 0) {
    const colspan = isClosingOnly ? 6 : 8;
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; padding:40px; color:#64748b;">No member records found matching the selected criteria.</td></tr>`;
    updateKPIs([], 0, 0, 0, 0);
    return;
  }

  let totPrin = 0, totIntr = 0, totClDr = 0, totClCr = 0;

  tbody.innerHTML = list.map((item, i) => {
    totPrin += item.principal;
    totIntr += item.interest;
    totClDr += item.closingDebit;
    totClCr += item.closingCredit;

    return `
      <tr>
        <td style="text-align:center; color:#64748b; font-weight:600;">${i + 1}</td>
        <td style="text-align:center; font-weight:800; color:#0f172a;">${escHtml(item.flatNo)}</td>
        <td style="text-align:center; font-weight:600;">${escHtml(item.wing)}</td>
        <td style="font-weight:700; color:#0D47A1;">${escHtml(item.memName)}</td>
        <td class="td-num ${item.principal > 0 ? 'val-debit' : ''} col-breakdown">${item.principal > 0 ? formatAmount(item.principal) : '—'}</td>
        <td class="td-num ${item.interest > 0 ? 'val-debit' : ''} col-breakdown">${item.interest > 0 ? formatAmount(item.interest) : '—'}</td>
        <td class="td-num ${item.closingDebit > 0 ? 'val-debit' : ''}" style="font-weight:800;">${item.closingDebit > 0 ? formatAmount(item.closingDebit) : '0.00'}</td>
        <td class="td-num ${item.closingCredit > 0 ? 'val-credit' : ''}" style="font-weight:800;">${item.closingCredit > 0 ? formatAmount(item.closingCredit) : '0.00'}</td>
      </tr>
    `;
  }).join('');

  applyColumnView();
  updateKPIs(list, totPrin, totIntr, totClDr, totClCr);
}

window.applyColumnView = function () {
  const mode = document.getElementById('columnViewMode')?.value || 'detailed';
  const table = document.getElementById('mainTable');
  if (!table) return;

  if (mode === 'closing_only') {
    table.classList.add('hide-breakdown');
  } else {
    table.classList.remove('hide-breakdown');
  }
};

function updateKPIs(list, prin, intr, clDr, clCr) {
  const memCountText = `${list.length} Members`;
  const badgeEl = document.getElementById('badgeMemCount');
  if (badgeEl) badgeEl.textContent = memCountText;

  const kpiCountEl = document.getElementById('kpiMemCount');
  if (kpiCountEl) kpiCountEl.textContent = memCountText;

  document.getElementById('kpiPrincipal').textContent     = '₹' + formatAmount(prin);
  document.getElementById('kpiInterest').textContent      = '₹' + formatAmount(intr);
  document.getElementById('kpiClosingDebit').textContent  = '₹' + formatAmount(clDr);
  document.getElementById('kpiClosingCredit').textContent = '₹' + formatAmount(clCr);

  const netCollectible = clDr - clCr;
  const netEl = document.getElementById('kpiNetOutstanding');
  if (netEl) {
    if (netCollectible >= 0) {
      netEl.className = 'pop-val debit';
      netEl.textContent = '₹' + formatAmount(netCollectible) + ' (Dues)';
    } else {
      netEl.className = 'pop-val credit';
      netEl.textContent = '₹' + formatAmount(Math.abs(netCollectible)) + ' (Advance)';
    }
  }

  // Footer totals
  document.getElementById('ftPrincipal').textContent     = formatAmount(prin);
  document.getElementById('ftInterest').textContent      = formatAmount(intr);
  document.getElementById('ftClosingDebit').textContent  = formatAmount(clDr);
  document.getElementById('ftClosingCredit').textContent = formatAmount(clCr);

  // Difference bar cells
  const ftDiffPI = document.getElementById('ftDiffPrincipalInterest');
  if (ftDiffPI) {
    ftDiffPI.innerHTML = `<span class="erp-badge" style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:10.5px;">Prin: ₹${formatAmount(prin)} | Int: ₹${formatAmount(intr)}</span>`;
  }

  const ftDiffCl = document.getElementById('ftDiffClosing');
  if (ftDiffCl) {
    if (clDr >= clCr) {
      ftDiffCl.innerHTML = `<span class="erp-badge erp-badge-danger" style="font-weight:800; font-size:10.5px;">Net Dues: ₹${formatAmount(clDr - clCr)} (Dr)</span>`;
    } else {
      ftDiffCl.innerHTML = `<span class="erp-badge erp-badge-success" style="font-weight:800; font-size:10.5px;">Net Adv: ₹${formatAmount(clCr - clDr)} (Cr)</span>`;
    }
  }
}

function filterTable() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const filterType = document.getElementById('filterType')?.value || 'DUES';

  const filtered = outstandingData.filter(item => {
    // Search query
    const text = `${item.flatNo} ${item.wing} ${item.memName} ${item.memCode}`.toLowerCase();
    if (q && !text.includes(q)) return false;

    // Balance scope filter
    if (filterType === 'DUES' && item.closingDebit <= 0) return false;
    if (filterType === 'ADVANCE' && item.closingCredit <= 0) return false;
    if (filterType === 'NIL' && (item.closingDebit > 0 || item.closingCredit > 0)) return false;

    return true;
  });

  renderTable(filtered);
}

function toggleSummaryPopover(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('summaryPopover');
  if (popover) {
    popover.classList.toggle('show');
  }
}

document.addEventListener('click', (e) => {
  const popover = document.getElementById('summaryPopover');
  const btn = document.getElementById('btnSummaryToggle');
  if (popover && popover.classList.contains('show')) {
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
      popover.classList.remove('show');
    }
  }
});

function exportCsv() {
  if (!outstandingData || outstandingData.length === 0) {
    showToast('No data to export.', 'warning');
    return;
  }

  const selectedBT = document.getElementById('billTypeSelect')?.value || 'Maintenance';
  const isClosingOnly = (document.getElementById('columnViewMode')?.value === 'closing_only');

  const headers = isClosingOnly ? [
    '#',
    'Flat No',
    'Wing',
    'Member Name',
    'Closing Debit (₹)',
    'Closing Credit (₹)'
  ] : [
    '#',
    'Flat No',
    'Wing',
    'Member Name',
    'Principal (₹)',
    'Interest (₹)',
    'Closing Debit (₹)',
    'Closing Credit (₹)'
  ];

  const csvRows = [headers.join(',')];

  let totPrin = 0, totIntr = 0, totClDr = 0, totClCr = 0;

  outstandingData.forEach((r, i) => {
    totPrin += r.principal;
    totIntr += r.interest;
    totClDr += r.closingDebit;
    totClCr += r.closingCredit;

    const row = isClosingOnly ? [
      i + 1,
      `"${r.flatNo}"`,
      `"${r.wing}"`,
      `"${r.memName.replace(/"/g, '""')}"`,
      r.closingDebit.toFixed(2),
      r.closingCredit.toFixed(2)
    ] : [
      i + 1,
      `"${r.flatNo}"`,
      `"${r.wing}"`,
      `"${r.memName.replace(/"/g, '""')}"`,
      r.principal.toFixed(2),
      r.interest.toFixed(2),
      r.closingDebit.toFixed(2),
      r.closingCredit.toFixed(2)
    ];
    csvRows.push(row.join(','));
  });

  // Grand Total Row
  const totalRow = isClosingOnly ? [
    '""',
    '""',
    '"GRAND TOTAL"',
    '""',
    totClDr.toFixed(2),
    totClCr.toFixed(2)
  ] : [
    '""',
    '""',
    '"GRAND TOTAL"',
    '""',
    totPrin.toFixed(2),
    totIntr.toFixed(2),
    totClDr.toFixed(2),
    totClCr.toFixed(2)
  ];
  csvRows.push(totalRow.join(','));

  // Difference Row
  const diffRow = isClosingOnly ? [
    '""',
    '""',
    '"DIFFERENCE / NET COLLECTIBLE"',
    '""',
    `"Net Dues: ${(totClDr - totClCr).toFixed(2)}"`,
    '""'
  ] : [
    '""',
    '""',
    '"DIFFERENCE / NET COLLECTIBLE"',
    '""',
    `"Prin: ${totPrin.toFixed(2)}"`,
    `"Int: ${totIntr.toFixed(2)}"`,
    `"Net Dues: ${(totClDr - totClCr).toFixed(2)}"`,
    '""'
  ];
  csvRows.push(diffRow.join(','));

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const toDate = document.getElementById('toDate')?.value || '';
  const dateSuffix = toDate ? `_AsOn_${toDate}` : `_${new Date().toISOString().slice(0, 10)}`;
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Outstanding_Dues_${selectedBT}${dateSuffix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Outstanding Dues (${selectedBT}) exported to CSV.`, 'success');
}

// Ensure print header always reflects the dynamic bill type and As On date before print dialog opens
window.addEventListener('beforeprint', () => {
  const billType = document.getElementById('billTypeSelect')?.value || 'ALL';
  const pBtEl = document.getElementById('printBillType');
  if (pBtEl) {
    pBtEl.textContent = getDisplayBillTypeName(billType, outstandingData || []);
  }
  const toDate = document.getElementById('toDate')?.value || '';
  const pPeriodEl = document.getElementById('printDatePeriod');
  if (pPeriodEl) {
    pPeriodEl.textContent = toDate ? formatDisplayDate(toDate) : 'Current (All Records)';
  }
});
