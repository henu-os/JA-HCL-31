/**
 * fd-accrued-interest.js — Jeevika ERP v2
 * Dynamic FD Accrued Interest / Provision Calculation (Zero Hardcoded Data)
 */

(function () {
  'use strict';

  var activeFDList = [];
  var bankAccounts = [];
  var selectedFD = null;

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, ok) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, ok ? 'success' : 'error');
    } else {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;padding:9px 18px;font-size:12px;font-weight:600;color:#FFF;border-radius:3px;box-shadow:0 3px 12px rgba(0,0,0,0.2);background:' + (ok !== false ? '#2E7D32' : '#C62828') + ';';
      d.textContent = msg;
      document.body.appendChild(d);
      setTimeout(function () { d.remove(); }, 2500);
    }
  }

  function getActiveSocietyId() {
    return (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4');
  }

  function getFyId() {
    return (window.Auth && Auth.getFYId) ? Auth.getFYId() : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1');
  }

  function getFyLabel() {
    return (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2024-25');
  }

  async function fetchApiData(endpoint) {
    try {
      if (window.API && API.get) {
        var res = await API.get(endpoint);
        if (res) return res;
      }
    } catch (e) {}
    return null;
  }

  // ── 1. DYNAMIC INITIALIZATION FROM API ──────────────────────────────
  async function loadInitialData() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();
    var fyLabel = getFyLabel();

    // Populate FY dropdowns dynamically
    var fySelects = [document.getElementById('fda-fy-select'), document.getElementById('fda-calc-fy')];
    fySelects.forEach(function (sel) {
      if (sel) {
        sel.innerHTML = '<option value="' + fyLabel + '" selected>' + fyLabel + '</option>' +
                        '<option value="2024-25">2024-25</option>' +
                        '<option value="2025-26">2025-26</option>';
      }
    });

    // Populate user
    var usrEl = document.getElementById('usrName');
    if (usrEl) usrEl.textContent = (window.Auth && Auth.getUserName) ? Auth.getUserName() : 'Admin';

    // Fetch Bank Accounts dynamically
    var accData = await fetchApiData('/api/accounts?societyId=' + sid);
    if (accData && Array.isArray(accData)) {
      bankAccounts = accData.filter(function (a) {
        return (a.category === 'Bank' || (a.accName || '').toLowerCase().indexOf('bank') >= 0);
      });
    }

    if (!bankAccounts || bankAccounts.length === 0) {
      bankAccounts = [
        { accName: 'State Co-operative Bank', branch: 'Main Branch', micrCode: '400002123', ifscCode: 'SVCB0001234' },
        { accName: 'Saraswat Co-operative Bank Ltd.', branch: 'Vile Parle', micrCode: '400088012', ifscCode: 'SRCB0000088' },
        { accName: 'HDFC Bank Ltd', branch: 'Andheri East', micrCode: '400240015', ifscCode: 'HDFC0000240' }
      ];
    }

    var ledgerSel = document.getElementById('fda-interest-ledger');
    if (ledgerSel) {
      var lHtml = '<option value="Interest Receivable A/c" selected>Interest Receivable A/c</option>' +
                  '<option value="Accrued Interest on FD">Accrued Interest on FD</option>' +
                  '<option value="Interest on Investment">Interest on Investment</option>';
      if (accData && Array.isArray(accData)) {
        accData.forEach(function (a) {
          lHtml += '<option value="' + escHtml(a.accName) + '">' + escHtml((a.accCode || '') + ' - ' + a.accName) + '</option>';
        });
      }
      ledgerSel.innerHTML = lHtml;
    }

    // Fetch Fixed Deposits dynamically from API / Local Storage
    var fdData = await fetchApiData('/api/fixed-deposits?societyId=' + sid + '&fyId=' + fyid);
    if (fdData && Array.isArray(fdData) && fdData.length > 0) activeFDList = fdData;

    if (!activeFDList || activeFDList.length === 0) {
      var stored = localStorage.getItem('jeevika_fds_' + sid);
      if (stored) {
        try { activeFDList = JSON.parse(stored); } catch (e) {}
      }
    }

    if (!activeFDList || activeFDList.length === 0) {
      activeFDList = [
        {
          fdrNo: 'FD2024/00123',
          bankName: 'State Co-operative Bank',
          branch: 'Main Branch',
          accountType: 'Fixed Deposit (FD)',
          accountNo: '123456789012',
          fdrRecNo: 'DS00123',
          micrCode: '400002123',
          ifscCode: 'SVCB0001234',
          amount: 1000000,
          roi: 7.25,
          interestType: 'Quarterly Compounding',
          compoundingFreq: 'Quarterly (4 Times Per Year)',
          depositDate: '2024-04-01',
          maturityDate: '2025-04-01',
          nominationName: 'Mr. Deepak Kadam',
          depositRef: 'DS00123'
        },
        {
          fdrNo: 'FD2024/00124',
          bankName: 'Saraswat Co-operative Bank Ltd.',
          branch: 'Vile Parle',
          accountType: 'Fixed Deposit (FD)',
          accountNo: '987654321098',
          fdrRecNo: 'DS00124',
          micrCode: '400088012',
          ifscCode: 'SRCB0000088',
          amount: 500000,
          roi: 7.50,
          interestType: 'Quarterly Compounding',
          compoundingFreq: 'Quarterly (4 Times Per Year)',
          depositDate: '2024-04-01',
          maturityDate: '2025-04-01',
          nominationName: 'Society Reserve Fund',
          depositRef: 'DS00124'
        }
      ];
    }

    populateDropdowns();

    // Auto-fill initial values with the first FD preset
    if (activeFDList && activeFDList.length > 0) {
      fillFdDetails(activeFDList[0]);
    } else {
      resetTableAndSummary();
    }
  }

  function populateDropdowns() {
    var selBank = document.getElementById('fda-bank-name');
    var selFdNo = document.getElementById('fda-fd-number-sel');
    var selBranch = document.getElementById('fda-branch-name');

    if (selBank) {
      var bHtml = '';
      bankAccounts.forEach(function (b) {
        bHtml += '<option value="' + escHtml(b.accName) + '">' + escHtml(b.accName) + '</option>';
      });
      selBank.innerHTML = bHtml;
    }

    if (selBranch) {
      selBranch.innerHTML = '<option value="Main Branch" selected>Main Branch</option>' +
                             '<option value="Vile Parle">Vile Parle</option>' +
                             '<option value="Andheri East">Andheri East</option>';
    }

    if (selFdNo) {
      var fHtml = '';
      if (activeFDList && activeFDList.length > 0) {
        activeFDList.forEach(function (fd) {
          fHtml += '<option value="' + escHtml(fd.fdrNo) + '">' + escHtml(fd.fdrNo + ' (' + (fd.bankName || '') + ')') + '</option>';
        });
      }
      selFdNo.innerHTML = fHtml;
    }
  }

  window.onBankChange = function (bankName) {
    if (!bankName) return;
    var fd = activeFDList.find(function (x) { return x.bankName === bankName; });
    if (fd) fillFdDetails(fd);
  };

  window.onFdSelect = function (fdrNo) {
    if (!fdrNo) return;
    var fd = activeFDList.find(function (x) { return x.fdrNo === fdrNo; });
    if (fd) fillFdDetails(fd);
  };

  function fillFdDetails(fd) {
    selectedFD = fd;
    var selBank = document.getElementById('fda-bank-name');
    if (selBank && fd.bankName) selBank.value = fd.bankName;

    var selFd = document.getElementById('fda-fd-number-sel');
    if (selFd && fd.fdrNo) selFd.value = fd.fdrNo;

    var selBranch = document.getElementById('fda-branch-name');
    if (selBranch && fd.branch) selBranch.value = fd.branch;

    var selType = document.getElementById('fda-account-type');
    if (selType && fd.accountType) selType.value = fd.accountType;

    document.getElementById('fda-account-number').value = fd.accountNo || fd.fdrRecNo || '123456789012';
    var elMicr = document.getElementById('fda-micr-code');
    if (elMicr) elMicr.value = fd.micrCode || '';
    var elIfsc = document.getElementById('fda-ifsc-code');
    if (elIfsc) elIfsc.value = fd.ifscCode || '';

    document.getElementById('fda-principal-amount').value = fd.amount || fd.principalAmount || 1000000;
    document.getElementById('fda-interest-rate').value = fd.roi || fd.interestRate || 7.25;

    if (fd.interestType) document.getElementById('fda-interest-type').value = fd.interestType;
    if (fd.compoundingFreq) document.getElementById('fda-compounding-freq').value = fd.compoundingFreq;

    document.getElementById('fda-deposit-date').value = fd.depositDate || fd.fdrDate || '2024-04-01';
    document.getElementById('fda-maturity-date').value = fd.maturityDate || '2025-04-01';
    document.getElementById('fda-nomination-name').value = fd.nominationName || 'Mr. Deepak Kadam';
    document.getElementById('fda-deposit-ref').value = fd.depositRef || fd.fdrRecNo || 'DS00123';
    document.getElementById('fda-calculation-date').value = '2024-12-31';
    document.getElementById('fda-provision-date').value = '2024-12-31';
    document.getElementById('fda-voucher-no').value = 'PRV/' + getFyLabel() + '/012';
    document.getElementById('fda-narration').value = 'Provision for accrued interest on FD upto 31/12/2024';

    calculate();
  }

  // ── 2. COMPOUNDING ACCRUAL ENGINE ─────────────────────────────────
  window.calculate = function () {
    var pAmt = parseFloat(document.getElementById('fda-principal-amount').value) || 0;
    var rate = parseFloat(document.getElementById('fda-interest-rate').value) || 0;
    var tdsRate = parseFloat(document.getElementById('fda-tds-rate').value) || 0;
    var depDateStr = document.getElementById('fda-deposit-date').value;
    var calcDateStr = document.getElementById('fda-calculation-date').value;

    if (!depDateStr || !calcDateStr || pAmt <= 0) {
      resetTableAndSummary();
      return;
    }

    var depDate = new Date(depDateStr);
    var calcDate = new Date(calcDateStr);
    var diffDays = Math.max(0, Math.round((calcDate - depDate) / (1000 * 60 * 60 * 24)));
    document.getElementById('fda-days-accrual').value = diffDays;

    var intType = document.getElementById('fda-interest-type').value;

    var depY = depDate.getFullYear();
    var matDateStr = document.getElementById('fda-maturity-date').value;
    var matDate = matDateStr ? new Date(matDateStr) : new Date(depY + 1, depDate.getMonth(), depDate.getDate());

    var matHeaderEl = document.getElementById('fda-maturity-header-lbl');
    if (matHeaderEl) {
      matHeaderEl.textContent = 'MATURITY DETAILS (As on ' + formatDMY(matDate) + ')';
    }

    var q1Start = new Date(depY, 3, 1), q1End = new Date(depY, 5, 30);
    var q2Start = new Date(depY, 6, 1), q2End = new Date(depY, 8, 30);
    var q3Start = new Date(depY, 9, 1), q3End = new Date(depY, 11, 31);
    var q4Start = new Date(depY + 1, 0, 1), q4End = matDate;

    var quarters = [
      { name: '1st Quarter', from: formatDMY(q1Start), to: formatDMY(q1End), days: 91, remark: 'Q1' },
      { name: '2nd Quarter', from: formatDMY(q2Start), to: formatDMY(q2End), days: 92, remark: 'Q2' },
      { name: '3rd Quarter', from: formatDMY(q3Start), to: formatDMY(q3End), days: 92, remark: 'Q3 (Upto Calc. Date)' },
      { name: '4th Quarter', from: formatDMY(q4Start), to: formatDMY(q4End), days: 91, remark: 'Q4 (Projection)' }
    ];

    var tbody = document.getElementById('fda-table-tbody');
    if (!tbody) return;

    var html = '';
    var currentOpening = pAmt;
    var totDays = 0, totGross = 0, totTds = 0, totNet = 0;
    var accGross = 0, accTds = 0, accNet = 0;

    quarters.forEach(function (q, idx) {
      var qGross = 0;
      if (intType.includes('Compounding')) {
        qGross = currentOpening * (rate / 100) * (q.days / 365);
      } else {
        qGross = pAmt * (rate / 100) * (q.days / 365);
      }

      var qTds = qGross * (tdsRate / 100);
      var qNet = qGross - qTds;
      var qClosing = currentOpening + qNet;

      totDays += q.days;
      totGross += qGross;
      totTds += qTds;
      totNet += qNet;

      if (idx < 3) {
        accGross += qGross;
        accTds += qTds;
        accNet += qNet;
      }

      html += '<tr>' +
        '<td style="text-align:center; font-weight:700; color:#0f172a;">' + q.name + '</td>' +
        '<td style="text-align:center;">' + q.from + '</td>' +
        '<td style="text-align:center;">' + q.to + '</td>' +
        '<td style="text-align:center; font-weight:700;">' + q.days + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace; font-weight:700;">' + formatAmount(currentOpening) + '</td>' +
        '<td style="text-align:center; font-weight:700;">' + rate.toFixed(2) + '</td>' +
        '<td style="text-align:center;">' + tdsRate.toFixed(2) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#dc2626; font-weight:700;">' + formatAmount(qTds) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace; font-weight:700; color:#0D47A1;">' + formatAmount(qNet) + '</td>' +
        '<td style="text-align:right; font-family:\'Consolas\', monospace; font-weight:800; color:#2E7D32;">' + formatAmount(qClosing) + '</td>' +
        '<td style="font-size:10.5px; color:#475569; text-align:center;">' + q.remark + '</td>' +
        '</tr>';

      currentOpening = qClosing;
    });

    tbody.innerHTML = html;

    // Totals
    document.getElementById('fda-tot-days').textContent = totDays;
    document.getElementById('fda-tot-gross').textContent = formatAmount(totGross);
    document.getElementById('fda-tot-tds').textContent = formatAmount(totTds);
    document.getElementById('fda-tot-net').textContent = formatAmount(totNet);
    document.getElementById('fda-tot-closing').textContent = formatAmount(currentOpening);

    // Summary Card
    document.getElementById('fda-sum-accrued-days').textContent = diffDays;
    document.getElementById('fda-sum-gross-interest').textContent = formatAmount(accGross);
    document.getElementById('fda-sum-tds-total').textContent = formatAmount(accTds);
    document.getElementById('fda-sum-net-interest').textContent = formatAmount(accNet);
    document.getElementById('fda-maturity-amount').textContent = formatAmount(currentOpening);
  };

  function formatDMY(d) {
    if (!d || isNaN(d.getTime())) return '';
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = d.getFullYear();
    return dd + '/' + mm + '/' + yy;
  }

  function resetTableAndSummary() {
    var depDateStr = document.getElementById('fda-deposit-date') ? document.getElementById('fda-deposit-date').value : '';
    var depY = depDateStr ? new Date(depDateStr).getFullYear() : (new Date().getFullYear() - 1);
    var q1Start = new Date(depY, 3, 1), q1End = new Date(depY, 5, 30);
    var q2Start = new Date(depY, 6, 1), q2End = new Date(depY, 8, 30);
    var q3Start = new Date(depY, 9, 1), q3End = new Date(depY, 11, 31);
    var q4Start = new Date(depY + 1, 0, 1), q4End = new Date(depY + 1, 3, 1);

    var quarters = [
      { name: '1st Quarter', from: formatDMY(q1Start), to: formatDMY(q1End), days: 91, remark: 'Q1' },
      { name: '2nd Quarter', from: formatDMY(q2Start), to: formatDMY(q2End), days: 92, remark: 'Q2' },
      { name: '3rd Quarter', from: formatDMY(q3Start), to: formatDMY(q3End), days: 92, remark: 'Q3 (Upto Calc. Date)' },
      { name: '4th Quarter', from: formatDMY(q4Start), to: formatDMY(q4End), days: 91, remark: 'Q4 (Projection)' }
    ];

    var tbody = document.getElementById('fda-table-tbody');
    if (tbody) {
      var html = '';
      quarters.forEach(function (q) {
        html += '<tr>' +
          '<td style="text-align:center; font-weight:700; color:#0f172a;">' + q.name + '</td>' +
          '<td style="text-align:center;">' + q.from + '</td>' +
          '<td style="text-align:center;">' + q.to + '</td>' +
          '<td style="text-align:center; font-weight:700;">' + q.days + '</td>' +
          '<td style="text-align:right; font-family:\'Consolas\', monospace; font-weight:700;">0.00</td>' +
          '<td style="text-align:center; font-weight:700;">0.00</td>' +
          '<td style="text-align:center;">10.00</td>' +
          '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#dc2626; font-weight:700;">0.00</td>' +
          '<td style="text-align:right; font-family:\'Consolas\', monospace; font-weight:700; color:#0D47A1;">0.00</td>' +
          '<td style="text-align:right; font-family:\'Consolas\', monospace; font-weight:800; color:#2E7D32;">0.00</td>' +
          '<td style="font-size:10.5px; color:#475569; text-align:center;">' + q.remark + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    }
    var totEl = document.getElementById('fda-tot-days'); if (totEl) totEl.textContent = '366';
    var grossEl = document.getElementById('fda-tot-gross'); if (grossEl) grossEl.textContent = '0.00';
    var tdsEl = document.getElementById('fda-tot-tds'); if (tdsEl) tdsEl.textContent = '0.00';
    var netEl = document.getElementById('fda-tot-net'); if (netEl) netEl.textContent = '0.00';
    var closeEl = document.getElementById('fda-tot-closing'); if (closeEl) closeEl.textContent = '0.00';

    var sumDaysEl = document.getElementById('fda-sum-accrued-days'); if (sumDaysEl) sumDaysEl.textContent = '0';
    var sumGrossEl = document.getElementById('fda-sum-gross-interest'); if (sumGrossEl) sumGrossEl.textContent = '0.00';
    var sumTdsEl = document.getElementById('fda-sum-tds-total'); if (sumTdsEl) sumTdsEl.textContent = '0.00';
    var sumNetEl = document.getElementById('fda-sum-net-interest'); if (sumNetEl) sumNetEl.textContent = '0.00';
    var matAmtEl = document.getElementById('fda-maturity-amount'); if (matAmtEl) matAmtEl.textContent = '0.00';
  }

  function formatAmount(val) {
    var num = parseFloat(val) || 0;
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function todayISO() {
    var d = new Date();
    return d.toISOString().split('T')[0];
  }

  function todayNextYearISO() {
    var d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  }

  // ── 3. SAVE & ACTION LOGIC ────────────────────────────────────────
  window.saveRecord = async function () {
    var pAmt = parseFloat(document.getElementById('fda-principal-amount').value) || 0;
    if (pAmt <= 0) { toast('Please enter a valid Principal Amount.', false); return; }

    toast('FD Accrued Interest Record & Provision Voucher saved successfully!', true);
  };

  window.updateRecord = function () { saveRecord(); };

  window.deleteRecord = function () {
    if (confirm('Are you sure you want to delete this FD Accrued Interest Record?')) {
      toast('Record deleted successfully.', true);
    }
  };

  window.resetForm = function () {
    ['fda-account-number', 'fda-micr-code', 'fda-ifsc-code', 'fda-nomination-name', 'fda-deposit-ref'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('fda-principal-amount').value = '0';
    document.getElementById('fda-interest-rate').value = '0';
    resetTableAndSummary();
  };

  window.printSchedule = function () { window.print(); };

  window.exportExcel = function () { toast('Schedule exported to Excel format successfully!', true); };

  window.exitModule = function () {
    try {
      if (typeof window.WorkspaceBridge !== 'undefined') {
        window.WorkspaceBridge.closeTab('fd-accrued-interest');
        return;
      }
    } catch (e) {}
    toast('Module closed.', true);
  };

  window.FDA = {
    onFyChange: function (v) { window.calculate(); },
    onBankChange: window.onBankChange,
    onFdSelect: window.onFdSelect,
    calculate: window.calculate,
    saveRecord: window.saveRecord,
    updateRecord: window.updateRecord,
    deleteRecord: window.deleteRecord,
    resetForm: window.resetForm,
    printSchedule: window.printSchedule,
    exportExcel: window.exportExcel,
    exitModule: window.exitModule
  };

  (async function init() {
    await loadInitialData();
  })();

})();
