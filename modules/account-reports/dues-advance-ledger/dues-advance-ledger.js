// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Dues / Advance Ledger Statement Engine
// Per-Bill-Type Granular Financial Ledger
// ═══════════════════════════════════════════════════════════

let duesAdvanceData = [];
let availableBillTypes = [];
let _fyStartDate = '';
let _fyEndDate = '';

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireContext()) return;
  initContext();
  setupFinancialYearDates();
  await loadBillTypes();
  await loadDuesAdvanceData();
});

function initContext() {
  const socName = Auth.getSocietyName();
  const fyLabel = Auth.getFYLabel();

  const socEl = document.getElementById('socName');
  if (socEl) socEl.textContent = socName;

  const fyEl = document.getElementById('fyLabel');
  if (fyEl) fyEl.textContent = fyLabel;

  const pSocEl = document.getElementById('printSocName');
  if (pSocEl) pSocEl.textContent = socName;

  const pFyEl = document.getElementById('printFYLabel');
  if (pFyEl) pFyEl.textContent = fyLabel;
}

function setupFinancialYearDates() {
  const fyLabel = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');
  const parts = fyLabel.split('-');
  let startYear = parseInt(parts[0], 10) || 2025;
  if (startYear < 2000) startYear += 2000;
  const endYear = startYear + 1;

  _fyStartDate = `${startYear}-04-01`;
  _fyEndDate = `${endYear}-03-31`;

  const fromEl = document.getElementById('fromDate');
  const toEl = document.getElementById('toDate');
  if (fromEl && !fromEl.value) fromEl.value = _fyStartDate;
  if (toEl && !toEl.value) toEl.value = _fyEndDate;
}

window.applyDatePreset = function (preset) {
  const fromEl = document.getElementById('fromDate');
  const toEl = document.getElementById('toDate');
  if (!fromEl || !toEl) return;

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

  if (preset === 'full') {
    fromEl.value = _fyStartDate;
    toEl.value = _fyEndDate;
  } else if (preset === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    fromEl.value = fmt(start);
    toEl.value = fmt(end);
  } else if (preset === 'last-month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    fromEl.value = fmt(start);
    toEl.value = fmt(end);
  } else if (preset === 'q1') {
    fromEl.value = `${fyStart.getFullYear()}-04-01`;
    toEl.value = `${fyStart.getFullYear()}-06-30`;
  } else if (preset === 'q2') {
    fromEl.value = `${fyStart.getFullYear()}-07-01`;
    toEl.value = `${fyStart.getFullYear()}-09-30`;
  } else if (preset === 'q3') {
    fromEl.value = `${fyStart.getFullYear()}-10-01`;
    toEl.value = `${fyStart.getFullYear()}-12-31`;
  } else if (preset === 'q4') {
    fromEl.value = `${fyEnd.getFullYear()}-01-01`;
    toEl.value = `${fyEnd.getFullYear()}-03-31`;
  }

  loadDuesAdvanceData();
};

window.onDateChange = function () {
  const presetEl = document.getElementById('datePresetSelect');
  if (presetEl) presetEl.value = 'custom';
  loadDuesAdvanceData();
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
      // Check localStorage fallback
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

  // Ensure 'ALL' is at the top of the dropdown list once
  availableBillTypes = availableBillTypes.filter(bt => bt.toUpperCase() !== 'ALL');
  availableBillTypes.unshift('ALL');

  const currentVal = selectEl.value;
  selectEl.innerHTML = availableBillTypes.map(bt => `<option value="${escHtml(bt)}">${escHtml(bt)}</option>`).join('');
  
  // Set default selection: keep current selection if valid, else pick first concrete bill type, else 'ALL'
  if (currentVal && availableBillTypes.includes(currentVal)) {
    selectEl.value = currentVal;
  } else if (availableBillTypes.length > 1) {
    selectEl.value = availableBillTypes[1];
  } else if (availableBillTypes.length > 0) {
    selectEl.value = availableBillTypes[0];
  }
}

function onBillTypeChange() {
  loadDuesAdvanceData();
}

async function loadDuesAdvanceData() {
  const societyId = Auth.getSocietyId();
  const fyId      = Auth.getFYId();
  if (!societyId || !fyId) return;

  const defaultBt = availableBillTypes.length > 1 ? availableBillTypes[1] : (availableBillTypes[0] || 'ALL');
  const billType = document.getElementById('billTypeSelect')?.value || defaultBt;
  const isAll = (billType.toUpperCase() === 'ALL');
  const pBtEl = document.getElementById('printBillType');
  if (pBtEl) pBtEl.textContent = billType;

  const fromDate = document.getElementById('fromDate')?.value || '';
  const toDate   = document.getElementById('toDate')?.value || '';

  const pPeriodEl = document.getElementById('printDatePeriod');
  if (pPeriodEl) {
    if (fromDate && toDate) {
      pPeriodEl.textContent = `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`;
    } else if (fromDate) {
      pPeriodEl.textContent = `From ${formatDisplayDate(fromDate)}`;
    } else if (toDate) {
      pPeriodEl.textContent = `Up to ${formatDisplayDate(toDate)}`;
    } else {
      pPeriodEl.textContent = 'All Transactions';
    }
  }

  showLoading(`Loading Dues & Advance for ${billType}...`);

  try {
    // 1. Fetch Members & Data
    const [memRes, billRes, recRes, opRes, cnRes, dnRes, trRes, revRes] = await Promise.all([
      API.get(`/members?societyId=${societyId}`).catch(() => ({ data: [] })),
      API.get(`/member-bills?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] })),
      API.get(`/member-receipts?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] })),
      isAll 
        ? Promise.all(availableBillTypes.filter(bt => bt.toUpperCase() !== 'ALL').map(bt => API.get(`/opening-balances/member?societyId=${societyId}&fyId=${fyId}&billType=${encodeURIComponent(bt)}`).catch(() => ({ data: [] }))))
        : API.get(`/opening-balances/member?societyId=${societyId}&fyId=${fyId}&billType=${encodeURIComponent(billType)}`).catch(() => ({ data: [] })),
      API.get(`/member-credit-notes?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] })),
      API.get(`/member-debit-notes?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] })),
      API.get(`/member-bill-type-transfers?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] })),
      API.get(`/receipt-reversals?societyId=${societyId}&fyId=${fyId}`).catch(() => ({ data: [] }))
    ]);

    const members = Array.isArray(memRes.data) ? memRes.data : (Array.isArray(memRes) ? memRes : []);
    const allBills = Array.isArray(billRes.data) ? billRes.data : (Array.isArray(billRes) ? billRes : []);
    const allReceipts = Array.isArray(recRes.data) ? recRes.data : (Array.isArray(recRes) ? recRes : []);
    const allCreditNotes = Array.isArray(cnRes.data) ? cnRes.data : (Array.isArray(cnRes) ? cnRes : []);
    const allDebitNotes = Array.isArray(dnRes.data) ? dnRes.data : (Array.isArray(dnRes) ? dnRes : []);
    const allTransfers = Array.isArray(trRes.data) ? trRes.data : (Array.isArray(trRes) ? trRes : []);
    const allReversals = Array.isArray(revRes.data) ? revRes.data : (Array.isArray(revRes) ? revRes : []);

    // Filter bills and receipts strictly matching the selected Bill Type (or all if ALL)
    const bills = isAll ? allBills : allBills.filter(b => {
      const bType = (b.billType || b.BillType || '').toLowerCase().trim();
      return bType === billType.toLowerCase().trim();
    });

    const receipts = isAll ? allReceipts : allReceipts.filter(r => {
      const rType = (r.billType || r.BillType || '').toLowerCase().trim();
      return rType === billType.toLowerCase().trim();
    });

    const creditNotes = isAll ? allCreditNotes : allCreditNotes.filter(cn => {
      const cType = (cn.billType || cn.BillType || '').toLowerCase().trim();
      return cType === billType.toLowerCase().trim();
    });

    const debitNotes = isAll ? allDebitNotes : allDebitNotes.filter(dn => {
      const dType = (dn.billType || dn.BillType || '').toLowerCase().trim();
      return dType === billType.toLowerCase().trim();
    });

    const reversals = isAll ? allReversals : allReversals.filter(rv => {
      const rvType = (rv.billType || rv.BillType || '').toLowerCase().trim();
      return rvType === billType.toLowerCase().trim();
    });

    // Opening balances
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

    // Aggregate Billed by Member (Partitioned by Date)
    const billMap = {};
    const priorBillMap = {};

    bills.forEach(b => {
      const mId = b.memberId || b.MemberId;
      const amt = parseFloat(b.totalAmount || b.TotalAmount || b.amount || 0);
      const d = extractTxDate(b);
      if (fromDate && d && d < fromDate) {
        priorBillMap[mId] = (priorBillMap[mId] || 0) + amt;
      } else if ((!fromDate || !d || d >= fromDate) && (!toDate || !d || d <= toDate)) {
        billMap[mId] = (billMap[mId] || 0) + amt;
      }
    });

    debitNotes.forEach(dn => {
      const mId = dn.memberId || dn.MemberId;
      const amt = parseFloat(dn.amount || dn.Amount || dn.totalAmount || 0);
      const d = extractTxDate(dn);
      if (fromDate && d && d < fromDate) {
        priorBillMap[mId] = (priorBillMap[mId] || 0) + amt;
      } else if ((!fromDate || !d || d >= fromDate) && (!toDate || !d || d <= toDate)) {
        billMap[mId] = (billMap[mId] || 0) + amt;
      }
    });

    // Aggregate Received by Member (Partitioned by Date)
    const recMap = {};
    const priorRecMap = {};

    receipts.forEach(r => {
      const mId = r.memberId || r.MemberId;
      const amt = parseFloat(r.amount || r.Amount || r.totalAmount || 0);
      const d = extractTxDate(r);
      if (fromDate && d && d < fromDate) {
        priorRecMap[mId] = (priorRecMap[mId] || 0) + amt;
      } else if ((!fromDate || !d || d >= fromDate) && (!toDate || !d || d <= toDate)) {
        recMap[mId] = (recMap[mId] || 0) + amt;
      }
    });

    creditNotes.forEach(cn => {
      const mId = cn.memberId || cn.MemberId;
      const amt = parseFloat(cn.amount || cn.Amount || cn.totalAmount || 0);
      const d = extractTxDate(cn);
      if (fromDate && d && d < fromDate) {
        priorRecMap[mId] = (priorRecMap[mId] || 0) + amt;
      } else if ((!fromDate || !d || d >= fromDate) && (!toDate || !d || d <= toDate)) {
        recMap[mId] = (recMap[mId] || 0) + amt;
      }
    });

    reversals.forEach(rv => {
      let mId = rv.memberId || rv.MemberId;
      if (!mId && rv.flatNo) {
        const mem = members.find(m => (m.flatNo || '').toLowerCase() === (rv.flatNo || '').toLowerCase());
        if (mem) mId = mem.memberId || mem.id;
      }
      if (!mId && rv.personName) {
        const mem = members.find(m => (rv.personName || '').toLowerCase().includes((m.flatNo || '').toLowerCase()));
        if (mem) mId = mem.memberId || mem.id;
      }
      const amt = parseFloat(rv.amount || rv.Amount || 0);
      const d = extractTxDate(rv);
      if (mId) {
        if (fromDate && d && d < fromDate) {
          priorRecMap[mId] = (priorRecMap[mId] || 0) - amt;
        } else if ((!fromDate || !d || d >= fromDate) && (!toDate || !d || d <= toDate)) {
          recMap[mId] = (recMap[mId] || 0) - amt;
        }
      }
    });

    // Transfers (Partitioned by Date)
    allTransfers.forEach(tr => {
      const mId = tr.memberId || tr.MemberId;
      const amt = parseFloat(tr.amount || tr.Amount || 0);
      const toBt = (tr.toBillType || tr.ToBillType || '').toLowerCase().trim();
      const fromBt = (tr.fromBillType || tr.FromBillType || '').toLowerCase().trim();
      const curBt = billType.toLowerCase().trim();
      const d = extractTxDate(tr);

      if (!isAll) {
        if (fromDate && d && d < fromDate) {
          if (toBt === curBt) {
            priorRecMap[mId] = (priorRecMap[mId] || 0) + amt;
          } else if (fromBt === curBt) {
            priorBillMap[mId] = (priorBillMap[mId] || 0) + amt;
          }
        } else if ((!fromDate || !d || d >= fromDate) && (!toDate || !d || d <= toDate)) {
          if (toBt === curBt) {
            recMap[mId] = (recMap[mId] || 0) + amt;
          } else if (fromBt === curBt) {
            billMap[mId] = (billMap[mId] || 0) + amt;
          }
        }
      }
    });

    // Build Rows
    duesAdvanceData = members.map((m, idx) => {
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
      const priorDr = priorBillMap[mId] || 0;
      const priorCr = priorRecMap[mId] || 0;
      const effectiveOpNet = baseOpTotal + priorDr - priorCr;

      let opDues = 0;
      let opAdv = 0;
      if (effectiveOpNet >= 0) {
        opDues = effectiveOpNet;
      } else {
        opAdv = Math.abs(effectiveOpNet);
      }

      const totalDebit = billMap[mId] || 0;
      const totalCredit = recMap[mId] || 0;

      // Net Balance: (OpDues - OpAdv) + TotalDebit - TotalCredit
      const net = (opDues - opAdv) + totalDebit - totalCredit;
      const closingDues = net > 0 ? net : 0;
      const closingAdv  = net < 0 ? Math.abs(net) : 0;

      return {
        idx: idx + 1,
        memberId: mId,
        flatNo: m.flatNo || m.FlatNo || '—',
        wing: m.wing || m.Wing || '',
        memName: m.memName || m.MemName || '—',
        billType: billType,
        opDues: opDues,
        opAdv: opAdv,
        totalDebit: totalDebit,
        totalCredit: totalCredit,
        closingDues: closingDues,
        closingAdv: closingAdv,
        net: net
      };
    });

    filterTable();
  } catch (err) {
    handleError(err, 'Failed to load Dues/Advance Ledger.');
  } finally {
    hideLoading();
  }
}

function renderThead(isAll) {
  const thead = document.querySelector('table.ledger-grid thead');
  if (!thead) return;
  thead.innerHTML = `
    <tr>
      <th style="width:40px; text-align:center;">#</th>
      <th style="width:90px; text-align:center;">Flat No</th>
      <th style="width:70px; text-align:center;">Wing</th>
      <th>Member Name</th>
      ${isAll ? '<th style="width:110px; text-align:center;">Bill Type</th>' : ''}
      <th style="width:125px; text-align:right;">Opening Dues (DR)</th>
      <th style="width:125px; text-align:right;">Opening Adv (CR)</th>
      <th style="width:130px; text-align:right;">Transaction Debit</th>
      <th style="width:130px; text-align:right;">Transaction Credit</th>
      <th style="width:130px; text-align:right;">Closing Dues (DR)</th>
      <th style="width:130px; text-align:right;">Closing Adv (CR)</th>
      <th style="width:95px; text-align:center;">Status</th>
    </tr>
  `;
}

function renderTfoot(isAll) {
  const tfoot = document.querySelector('table.ledger-grid tfoot');
  if (!tfoot) return;
  const colSpan = isAll ? 5 : 4;
  tfoot.innerHTML = `
    <tr>
      <td colspan="${colSpan}" style="text-align:right;">Grand Total:</td>
      <td class="td-num val-debit" id="ftOpeningDues">0.00</td>
      <td class="td-num val-credit" id="ftOpeningAdv">0.00</td>
      <td class="td-num val-debit" id="ftDebit">0.00</td>
      <td class="td-num val-credit" id="ftCredit">0.00</td>
      <td class="td-num val-debit" id="ftClosingDues">0.00</td>
      <td class="td-num val-credit" id="ftClosingAdv">0.00</td>
      <td></td>
    </tr>
  `;
}

function renderTable(list) {
  const tbody = document.getElementById('mainTableBody');
  const selectedBT = (document.getElementById('billTypeSelect')?.value || 'Maintenance').trim();
  const isAll = (selectedBT.toUpperCase() === 'ALL');

  renderThead(isAll);
  renderTfoot(isAll);

  if (!list || list.length === 0) {
    const totalCols = isAll ? 12 : 11;
    tbody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align:center; padding:40px; color:#64748b;">No member records found for the selected criteria.</td></tr>`;
    updateKPIs([], 0, 0, 0, 0, 0, 0);
    return;
  }

  let totOpDues = 0, totOpAdv = 0, totDr = 0, totCr = 0, totClDues = 0, totClAdv = 0;

  tbody.innerHTML = list.map((item, i) => {
    totOpDues += item.opDues;
    totOpAdv  += item.opAdv;
    totDr     += item.totalDebit;
    totCr     += item.totalCredit;
    totClDues += item.closingDues;
    totClAdv  += item.closingAdv;

    let statusBadge = '<span class="erp-badge" style="background:#f1f5f9; color:#475569; font-weight:700;">Nil</span>';
    if (item.closingDues > 0) {
      statusBadge = '<span class="erp-badge erp-badge-danger" style="font-weight:700;">Dues (Dr)</span>';
    } else if (item.closingAdv > 0) {
      statusBadge = '<span class="erp-badge erp-badge-success" style="font-weight:700;">Advance (Cr)</span>';
    }

    return `
      <tr>
        <td style="text-align:center; color:#64748b; font-weight:600;">${i + 1}</td>
        <td style="text-align:center; font-weight:800; color:#0f172a;">${escHtml(item.flatNo)}</td>
        <td style="text-align:center; font-weight:600;">${escHtml(item.wing)}</td>
        <td style="font-weight:700; color:#0D47A1;">${escHtml(item.memName)}</td>
        ${isAll ? `<td style="text-align:center;"><span class="erp-badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #dbeafe; font-size:10px;">${escHtml(item.billType || 'ALL')}</span></td>` : ''}
        <td class="td-num ${item.opDues > 0 ? 'val-debit' : ''}">${item.opDues > 0 ? formatAmount(item.opDues) : '—'}</td>
        <td class="td-num ${item.opAdv > 0 ? 'val-credit' : ''}">${item.opAdv > 0 ? formatAmount(item.opAdv) : '—'}</td>
        <td class="td-num ${item.totalDebit > 0 ? 'val-debit' : ''}">${item.totalDebit > 0 ? formatAmount(item.totalDebit) : '—'}</td>
        <td class="td-num ${item.totalCredit > 0 ? 'val-credit' : ''}">${item.totalCredit > 0 ? formatAmount(item.totalCredit) : '—'}</td>
        <td class="td-num ${item.closingDues > 0 ? 'val-debit' : ''}" style="font-weight:800;">${item.closingDues > 0 ? formatAmount(item.closingDues) : '0.00'}</td>
        <td class="td-num ${item.closingAdv > 0 ? 'val-credit' : ''}" style="font-weight:800;">${item.closingAdv > 0 ? formatAmount(item.closingAdv) : '0.00'}</td>
        <td style="text-align:center;">${statusBadge}</td>
      </tr>
    `;
  }).join('');

  updateKPIs(list, totOpDues, totOpAdv, totDr, totCr, totClDues, totClAdv);
}

function updateKPIs(list, opDues, opAdv, dr, cr, clDues, clAdv) {
  const memCountText = `${list.length} Members`;
  const badgeEl = document.getElementById('badgeMemCount');
  if (badgeEl) badgeEl.textContent = memCountText;

  const kpiCountEl = document.getElementById('kpiMemCount');
  if (kpiCountEl) kpiCountEl.textContent = memCountText;

  document.getElementById('kpiOpeningDues').textContent   = '₹' + formatAmount(opDues);
  document.getElementById('kpiOpeningAdvance').textContent= '₹' + formatAmount(opAdv);
  document.getElementById('kpiBilled').textContent        = '₹' + formatAmount(dr);
  document.getElementById('kpiReceived').textContent      = '₹' + formatAmount(cr);
  document.getElementById('kpiClosingDues').textContent   = '₹' + formatAmount(clDues);
  document.getElementById('kpiClosingAdvance').textContent= '₹' + formatAmount(clAdv);

  document.getElementById('ftOpeningDues').textContent = formatAmount(opDues);
  document.getElementById('ftOpeningAdv').textContent  = formatAmount(opAdv);
  document.getElementById('ftDebit').textContent       = formatAmount(dr);
  document.getElementById('ftCredit').textContent      = formatAmount(cr);
  document.getElementById('ftClosingDues').textContent = formatAmount(clDues);
  document.getElementById('ftClosingAdv').textContent  = formatAmount(clAdv);
}

function filterTable() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const filterType = document.getElementById('filterType')?.value || 'ALL';

  const filtered = duesAdvanceData.filter(item => {
    // Search query
    const text = `${item.flatNo} ${item.wing} ${item.memName}`.toLowerCase();
    if (q && !text.includes(q)) return false;

    // Balance scope filter
    if (filterType === 'DUES' && item.closingDues <= 0) return false;
    if (filterType === 'ADVANCE' && item.closingAdv <= 0) return false;
    if (filterType === 'NIL' && (item.closingDues > 0 || item.closingAdv > 0)) return false;

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
  if (!duesAdvanceData || duesAdvanceData.length === 0) {
    showToast('No data to export.', 'warning');
    return;
  }

  const selectedBT = document.getElementById('billTypeSelect')?.value || 'Maintenance';
  const isAll = (selectedBT.toUpperCase() === 'ALL');

  const headers = isAll
    ? ['#', 'Flat No', 'Wing', 'Member Name', 'Bill Type', 'Opening Dues (DR)', 'Opening Adv (CR)', 'Transaction Debit', 'Transaction Credit', 'Closing Dues (DR)', 'Closing Adv (CR)', 'Status']
    : ['#', 'Flat No', 'Wing', 'Member Name', 'Opening Dues (DR)', 'Opening Adv (CR)', 'Transaction Debit', 'Transaction Credit', 'Closing Dues (DR)', 'Closing Adv (CR)', 'Status'];

  const csvRows = [headers.join(',')];

  duesAdvanceData.forEach((r, i) => {
    const status = r.closingDues > 0 ? 'Dues (Dr)' : (r.closingAdv > 0 ? 'Advance (Cr)' : 'Nil');
    const row = isAll
      ? [
          i + 1,
          `"${r.flatNo}"`,
          `"${r.wing}"`,
          `"${r.memName.replace(/"/g, '""')}"`,
          `"${r.billType}"`,
          r.opDues.toFixed(2),
          r.opAdv.toFixed(2),
          r.totalDebit.toFixed(2),
          r.totalCredit.toFixed(2),
          r.closingDues.toFixed(2),
          r.closingAdv.toFixed(2),
          `"${status}"`
        ]
      : [
          i + 1,
          `"${r.flatNo}"`,
          `"${r.wing}"`,
          `"${r.memName.replace(/"/g, '""')}"`,
          r.opDues.toFixed(2),
          r.opAdv.toFixed(2),
          r.totalDebit.toFixed(2),
          r.totalCredit.toFixed(2),
          r.closingDues.toFixed(2),
          r.closingAdv.toFixed(2),
          `"${status}"`
        ];
    csvRows.push(row.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const fromDate = document.getElementById('fromDate')?.value || '';
  const toDate   = document.getElementById('toDate')?.value || '';
  const dateSuffix = (fromDate && toDate) ? `_${fromDate}_to_${toDate}` : `_${new Date().toISOString().slice(0, 10)}`;
  link.setAttribute('download', `Dues_Advance_Ledger_${selectedBT}${dateSuffix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Dues/Advance Ledger (${selectedBT}) exported to CSV.`, 'success');
}
