// ═══════════════════════════════════════════════════════════
// HENU ERP — COMMUNICATION MODULE: MAIL TO COMMITTEE
// Official Accounting Financial Reports Dispatch to Management Committee
// ═══════════════════════════════════════════════════════════

(() => {
  let allCommittee = [];
  let filteredCommittee = [];
  let selectedCommitteeIds = new Set();
  let currentReport = 'INCOME_EXPENDITURE';

  const REPORT_CONFIG = {
    INCOME_EXPENDITURE: {
      title: 'Income & Expenditure Statement',
      attachment: 'Income_and_Expenditure_Statement.pdf'
    },
    BALANCE_SHEET: {
      title: 'Balance Sheet Statement',
      attachment: 'Balance_Sheet.pdf'
    },
    TRIAL_BALANCE: {
      title: 'Trial Balance Report',
      attachment: 'Trial_Balance.pdf'
    },
    CASH_BANK_BOOK: {
      title: 'Cash and Bank Book Statement',
      attachment: 'Cash_Bank_Book.pdf'
    },
    LEDGER_CODE_WISE: {
      title: 'Account Ledger (Code Wise)',
      attachment: 'Account_Ledger_CodeWise.pdf'
    },
    LEDGER_GROUP_WISE: {
      title: 'Account Ledger (Group Wise)',
      attachment: 'Account_Ledger_GroupWise.pdf'
    },
    RECEIPT_PAYMENT_GROUP: {
      title: 'Receipt & Payment Summary (Groupwise)',
      attachment: 'Receipt_Payment_Groupwise.pdf'
    },
    RECEIPT_PAYMENT_ACCOUNT: {
      title: 'Receipt & Payment Summary (Accountwise)',
      attachment: 'Receipt_Payment_Accountwise.pdf'
    },
    SCHEDULE: {
      title: 'Financial Balance Sheet Schedules',
      attachment: 'Financial_Schedules.pdf'
    },
    MONTHLY_REPORT: {
      title: 'Monthly Financial Summary Report',
      attachment: 'Monthly_Financial_Report.pdf'
    },
    RECEIPT_REGISTER: {
      title: 'Receipt Voucher Register',
      attachment: 'Receipt_Register.pdf'
    },
    PAYMENT_REGISTER: {
      title: 'Payment Voucher Register',
      attachment: 'Payment_Register.pdf'
    },
    CONTRA_REGISTER: {
      title: 'Contra Voucher Register',
      attachment: 'Contra_Register.pdf'
    },
    JOURNAL_REGISTER: {
      title: 'Journal Voucher Register',
      attachment: 'Journal_Register.pdf'
    }
  };

  function toast(msg, ok = true) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, ok ? 'success' : 'error');
    } else if (window.parent && typeof window.parent.showToast === 'function') {
      window.parent.showToast(msg, ok ? 'success' : 'error');
    } else {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;padding:10px 20px;font-size:12px;font-weight:700;color:#FFF;border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,0.3);background:' + (ok ? '#2E7D32' : '#C62828') + ';';
      d.textContent = msg;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 3500);
    }
  }

  const getApiBase = () => {
    if (window.CONFIG && window.CONFIG.apiBase) return window.CONFIG.apiBase;
    if (window.APP_CONFIG && window.APP_CONFIG.API_BASE) return window.APP_CONFIG.API_BASE.replace(/\/api\/?$/, '');
    if (typeof window.getApiBaseUrl === 'function') return window.getApiBaseUrl();
    return 'http://localhost:5002';
  };

  const getSocietyId = () => {
    try {
      if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
        const raw = window.Auth.getSocietyId();
        const num = parseInt(String(raw).replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > 0) return num;
      }
    } catch (_) {}
    const sSid = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
    if (sSid) {
      const num = parseInt(String(sSid).replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > 0) return num;
    }
    return 1;
  };

  const getFYId = () => {
    try {
      const sFy = sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId');
      if (sFy) {
        const num = parseInt(String(sFy).replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > 0) return num;
      }
    } catch (_) {}
    return 1;
  };

  const init = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const initialRep = urlParams.get('rep');
    if (initialRep && REPORT_CONFIG[initialRep]) {
      currentReport = initialRep;
      const targetTab = document.querySelector(`#reportTabs .rep-tab[data-report="${initialRep}"]`);
      if (targetTab) {
        document.querySelectorAll('#reportTabs .rep-tab').forEach(t => t.classList.remove('active'));
        targetTab.classList.add('active');
      }
    }

    bindEvents();
    onReportChanged(currentReport);
    await loadCommittee();
  };

  const bindEvents = () => {
    const tabs = document.querySelectorAll('#reportTabs .rep-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentReport = tab.getAttribute('data-report');
        onReportChanged(currentReport);
      });
    });

    document.getElementById('filterDesignation').addEventListener('change', applyFilters);
    document.getElementById('searchCommittee').addEventListener('input', applyFilters);
    document.getElementById('btnRefreshCommittee').addEventListener('click', loadCommittee);

    document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
      const checked = e.target.checked;
      filteredCommittee.forEach(c => {
        const id = Number(c.committeeId || c.commMemberId);
        if (checked) {
          selectedCommitteeIds.add(id);
        } else {
          selectedCommitteeIds.delete(id);
        }
      });
      renderTableRows();
      updateCounters();
    });

    document.getElementById('btnPreviewReportMail').addEventListener('click', showPreviewModal);
    document.getElementById('btnQueueReportMail').addEventListener('click', confirmAndQueue);

    document.getElementById('btnClosePreview').addEventListener('click', hidePreviewModal);
    document.getElementById('btnDismissPreview').addEventListener('click', hidePreviewModal);
    document.getElementById('btnConfirmQueue').addEventListener('click', () => {
      hidePreviewModal();
      confirmAndQueue();
    });
  };

  const onReportChanged = (reportKey) => {
    const config = REPORT_CONFIG[reportKey] || REPORT_CONFIG.INCOME_EXPENDITURE;
    const fDate = document.getElementById('repFromDate').value || '01-04-2026';
    const tDate = document.getElementById('repToDate').value || '31-03-2027';
    const socName = (window.Auth && typeof window.Auth.getSocietyName === 'function' && window.Auth.getSocietyName()) 
      ? window.Auth.getSocietyName() 
      : (sessionStorage.getItem('activeSocietyName') || 'HENU CO-OP HOUSING SOCIETY LTD.');

    document.getElementById('committeeSubject').value = `${socName}: Official Financial Statement - ${config.title}`;
    document.getElementById('committeeBody').value = `Respected {{member_name}} ({{designation}}),\n\nPlease find attached the official ${config.title} for your review and records.\n\nSociety: ${socName}\nFinancial Period: ${fDate} to ${tDate}\n\nRegards,\nAccounts & Finance Department\n${socName}`;
    document.getElementById('attachedReportTitle').textContent = config.attachment;
  };

  const loadCommittee = async () => {
    const tbody = document.getElementById('committeeTableBody');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);"><i class="bi bi-hourglass-split"></i> Loading committee records...</td></tr>`;

    try {
      const res = await fetch(`${getApiBase()}/api/communication/committee?societyId=${getSocietyId()}&fyId=${getFYId()}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        allCommittee = data.data;
        applyFilters();
      } else {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 16px;">Failed to load committee: ${data.message || 'Unknown error'}</td></tr>`;
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 16px;">Error connecting to API: ${err.message}</td></tr>`;
    }
  };

  const applyFilters = () => {
    const designation = document.getElementById('filterDesignation').value;
    const query = document.getElementById('searchCommittee').value.trim().toLowerCase();

    filteredCommittee = allCommittee.filter(c => {
      if (designation && (c.designation || '') !== designation) return false;
      if (query) {
        const nameMatch = (c.memberName || c.name || '').toLowerCase().includes(query);
        const desigMatch = (c.designation || '').toLowerCase().includes(query);
        if (!nameMatch && !desigMatch) return false;
      }
      return true;
    });

    selectedCommitteeIds.clear();
    filteredCommittee.forEach(c => {
      const email = c.email || c.email_Id || '';
      const id = Number(c.committeeId || c.commMemberId);
      if (email && email.includes('@')) {
        selectedCommitteeIds.add(id);
      }
    });

    renderTableRows();
    updateCounters();
  };

  const renderTableRows = () => {
    const tbody = document.getElementById('committeeTableBody');
    if (filteredCommittee.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">No committee records match the filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredCommittee.map(c => {
      const id = Number(c.committeeId || c.commMemberId);
      const isSelected = selectedCommitteeIds.has(id);
      const email = c.email || c.email_Id || '';
      const hasValidEmail = email && email.includes('@');
      const emailStatusTag = hasValidEmail 
        ? `<span class="status-tag ok"><i class="bi bi-check-circle-fill"></i> Valid</span>` 
        : `<span class="status-tag bad"><i class="bi bi-x-circle-fill"></i> Missing</span>`;

      return `
        <tr class="${isSelected ? 'selected-row' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="row-chk" data-id="${id}" ${isSelected ? 'checked' : ''}>
          </td>
          <td><strong>${c.memberName || c.name || 'Member'}</strong></td>
          <td><span class="designation-badge">${c.designation || 'Member'}</span></td>
          <td>${email || '<span style="color:var(--text-muted); font-style:italic;">None</span>'}</td>
          <td>${c.contactNo || c.phone || '-'}</td>
          <td style="font-size: 11px; color: var(--text-muted);">${c.fromDate ? String(c.fromDate).substring(0, 10) : ''} to ${c.toDate ? String(c.toDate).substring(0, 10) : 'Active'}</td>
          <td style="text-align: center;">${emailStatusTag}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.row-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = Number(e.target.getAttribute('data-id'));
        if (e.target.checked) {
          selectedCommitteeIds.add(id);
        } else {
          selectedCommitteeIds.delete(id);
        }
        updateCounters();
        const tr = e.target.closest('tr');
        if (tr) tr.classList.toggle('selected-row', e.target.checked);
      });
    });
  };

  const updateCounters = () => {
    const total = filteredCommittee.length;
    const selected = selectedCommitteeIds.size;
    const valid = filteredCommittee.filter(c => {
      const id = Number(c.committeeId || c.commMemberId);
      const email = c.email || c.email_Id || '';
      return selectedCommitteeIds.has(id) && email && email.includes('@');
    }).length;
    const missing = filteredCommittee.filter(c => {
      const id = Number(c.committeeId || c.commMemberId);
      const email = c.email || c.email_Id || '';
      return selectedCommitteeIds.has(id) && (!email || !email.includes('@'));
    }).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statSelected').textContent = selected;
    document.getElementById('statValid').textContent = valid;
    document.getElementById('statMissing').textContent = missing;
    document.getElementById('countSelectedTop').textContent = selected;
  };

  const showPreviewModal = async () => {
    if (selectedCommitteeIds.size === 0) {
      toast('Please select at least one committee member to preview email.', false);
      return;
    }

    const firstSelectedId = Array.from(selectedCommitteeIds)[0];
    const committee = allCommittee.find(c => Number(c.committeeId || c.commMemberId) === Number(firstSelectedId));
    if (!committee) {
      toast('Selected committee member not found.', false);
      return;
    }

    const config = REPORT_CONFIG[currentReport] || REPORT_CONFIG.INCOME_EXPENDITURE;
    const rawSub = document.getElementById('committeeSubject').value;
    const rawBody = document.getElementById('committeeBody').value;
    const fDate = document.getElementById('repFromDate').value || '01-04-2026';
    const tDate = document.getElementById('repToDate').value || '31-03-2027';

    // Client Render Fallback
    let renderedSub = rawSub.replace(/\[Society\]/gi, 'HENU ERP').replace(/\{\{report_name\}\}/gi, config.title);
    let renderedBody = rawBody
      .replace(/Respected Committee Member/gi, `Respected ${committee.memberName || committee.name} (${committee.designation || 'Member'})`)
      .replace(/\{\{member_name\}\}/gi, committee.memberName || committee.name || 'Member')
      .replace(/\{\{designation\}\}/gi, committee.designation || 'Member')
      .replace(/\{\{report_name\}\}/gi, config.title);

    document.getElementById('previewRecipient').textContent = `${committee.memberName || committee.name} <${committee.email || committee.email_Id || 'NO EMAIL'}> (${committee.designation || 'Member'})`;
    document.getElementById('previewSubject').textContent = renderedSub;
    document.getElementById('previewAttachment').innerHTML = `<i class="bi bi-file-earmark-pdf-fill text-danger"></i> ${config.attachment}`;
    document.getElementById('previewContent').textContent = renderedBody;
    document.getElementById('previewCount').textContent = selectedCommitteeIds.size;

    const modal = document.getElementById('previewModal');
    modal.classList.add('show');
    modal.style.display = 'flex';

    // Server enhancement
    const payload = {
      societyId: getSocietyId(),
      fyId: getFYId(),
      channel: 'EMAIL',
      reportType: currentReport,
      committeeId: Number(committee.committeeId || committee.commMemberId),
      templateSubject: rawSub,
      templateBody: rawBody,
      fromDate: fDate,
      toDate: tDate
    };

    try {
      const res = await fetch(`${getApiBase()}/api/communication/committee/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          document.getElementById('previewRecipient').textContent = `${result.data.recipientName} <${result.data.recipientEmail || 'NO EMAIL'}> (${result.data.designation})`;
          document.getElementById('previewSubject').textContent = result.data.renderedSubject || renderedSub;
          document.getElementById('previewAttachment').innerHTML = `<i class="bi bi-file-earmark-pdf-fill text-danger"></i> ${result.data.attachmentName}`;
          document.getElementById('previewContent').textContent = result.data.renderedBody || renderedBody;
        }
      }
    } catch (err) {
      console.warn("Using client preview fallback:", err);
    }
  };

  const hidePreviewModal = () => {
    const modal = document.getElementById('previewModal');
    modal.classList.remove('show');
    modal.style.display = 'none';
  };

  const confirmAndQueue = async () => {
    if (selectedCommitteeIds.size === 0) {
      toast('Please select at least one committee member to queue.', false);
      return;
    }

    const validCommittee = allCommittee.filter(c => {
      const id = Number(c.committeeId || c.commMemberId);
      const email = c.email || c.email_Id || '';
      return selectedCommitteeIds.has(id) && email && email.includes('@');
    });

    if (validCommittee.length === 0) {
      toast('None of the selected committee members have a valid email address.', false);
      return;
    }

    const config = REPORT_CONFIG[currentReport] || REPORT_CONFIG.INCOME_EXPENDITURE;
    const fDate = document.getElementById('repFromDate').value || '01-04-2026';
    const tDate = document.getElementById('repToDate').value || '31-03-2027';

    const payload = {
      societyId: getSocietyId(),
      fyId: getFYId(),
      channel: 'EMAIL',
      reportType: currentReport,
      committeeIds: validCommittee.map(c => Number(c.committeeId || c.commMemberId)),
      templateSubject: document.getElementById('committeeSubject').value,
      templateBody: document.getElementById('committeeBody').value,
      fromDate: fDate,
      toDate: tDate
    };

    toast(`Queueing ${config.title} email report to ${validCommittee.length} committee recipient(s)...`, true);

    try {
      const res = await fetch(`${getApiBase()}/api/communication/committee/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.success) {
        await fetch(`${getApiBase()}/api/communication/outbox/process?societyId=${getSocietyId()}`, { method: 'POST' }).catch(() => {});
        toast(`✅ Success! Queued ${result.data?.queuedCount || validCommittee.length} report email(s) in outbox. Dispatching live.`, true);
      } else {
        const errMsg = result?.message || result?.error || result?.title || (result?.errors ? Object.values(result.errors).flat().join(', ') : 'Unknown error');
        toast(`Failed to queue: ${errMsg}`, false);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, false);
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
