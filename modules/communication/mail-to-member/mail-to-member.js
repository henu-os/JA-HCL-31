// ═══════════════════════════════════════════════════════════
// HENU ERP — COMMUNICATION MODULE: MAIL TO MEMBER
// Real-time dynamic recipient resolver, template rendering, and outbox queue
// ═══════════════════════════════════════════════════════════

(() => {
  let allMembers = [];
  let filteredMembers = [];
  let selectedMemberIds = new Set();
  let currentFeature = 'BILL_FORMAT';

  const DEFAULT_TEMPLATES = {
    BILL_FORMAT: {
      subject: 'Maintenance Bill for Month: {{bill_date}} - {{society_name}}',
      body: `Dear {{member_name}},\n\nPlease find attached the maintenance bill for Unit {{flat_no}} for {{bill_date}}.\n\nBill No: {{bill_no}}\nBill Amount: {{bill_amount}}\nTotal Outstanding: {{outstanding_amount}}\nDue Date: {{due_date}}\n\nPlease arrange payment before the due date.\n\nRegards,\nManagement Committee\n{{society_name}}`,
      attachment: 'Maintenance Bill PDF'
    },
    RECEIPT: {
      subject: 'Payment Receipt Confirmation - {{society_name}}',
      body: `Dear {{member_name}},\n\nWe acknowledge receipt of your payment for Unit {{flat_no}}.\n\nReceipt No: {{receipt_no}}\nAmount Received: {{bill_amount}}\nDate: {{bill_date}}\n\nPlease find your formal receipt attached.\n\nThank you,\n{{society_name}}`,
      attachment: 'Payment Receipt Voucher PDF'
    },
    MEMBER_ACCOUNT: {
      subject: 'Member Account Statement: {{financial_year}} - {{society_name}}',
      body: `Dear {{member_name}},\n\nPlease find attached your detailed Member Account Statement for Unit {{flat_no}} for the financial year {{financial_year}}.\n\nCurrent Closing Balance: {{outstanding_amount}}\n\nKindly review and contact the management for any reconciliation queries.\n\nRegards,\n{{society_name}}`,
      attachment: 'Member Account Statement PDF'
    },
    MEMBER_REGISTER: {
      subject: 'Member Register Record Confirmation - {{society_name}}',
      body: `Dear {{member_name}},\n\nAttached is your registered member profile and statutory share ledger record in {{society_name}}.\n\nUnit: {{flat_no}}\nRegistered Name: {{member_name}}\n\nRegards,\nHon. Secretary`,
      attachment: 'Member Register PDF'
    },
    OUTSTANDING_REMINDER: {
      subject: 'Urgent: Maintenance Dues Reminder - Unit {{flat_no}}',
      body: `Dear {{member_name}},\n\nThis is a gentle reminder that an overdue maintenance balance of {{outstanding_amount}} is pending for Unit {{flat_no}} in {{society_name}}.\n\nPlease clear the outstanding dues immediately to avoid late interest charges.\n\nIf you have already made the payment, kindly share the transaction details.\n\nThank you,\nManagement Committee`,
      attachment: 'None (Email Text Only)'
    },
    OUTSTANDING_LETTER: {
      subject: 'Formal Demand Notice: Outstanding Dues for Unit {{flat_no}}',
      body: `Dear {{member_name}},\n\nPlease find attached the formal Demand Notice regarding outstanding maintenance dues amounting to {{outstanding_amount}} for Unit {{flat_no}} in {{society_name}}.\n\nYou are requested to remit the dues within 15 days.\n\nBy Order of the Managing Committee,\n{{society_name}}`,
      attachment: 'Formal Outstanding Demand Letter PDF'
    },
    MESSAGE: {
      subject: 'Important Notice from Managing Committee - {{society_name}}',
      body: `Dear {{member_name}},\n\nWe would like to inform you about the upcoming society maintenance schedule.\n\nUnit: {{flat_no}}\n\nShould you have any questions, please feel free to reach out to the society office.\n\nWarm regards,\nManaging Committee\n{{society_name}}`,
      attachment: 'None'
    },
    BALANCE_CONFIRMATION: {
      subject: 'Annual Balance Confirmation Request - {{society_name}}',
      body: `Dear {{member_name}},\n\nPlease find attached the Balance Confirmation Letter for the year {{financial_year}}.\n\nAs of date, your ledger shows a balance of {{outstanding_amount}}.\n\nPlease sign and return the confirmation copy for audit records.\n\nRegards,\n{{society_name}}`,
      attachment: 'Balance Confirmation Letter PDF'
    },
    MESSAGE_WITH_PDF: {
      subject: 'Circular / Notice with PDF Attachment - {{society_name}}',
      body: `Dear {{member_name}},\n\nPlease find attached the circular/document for your reference.\n\nFlat No: {{flat_no}}\nSociety: {{society_name}}\n\nRegards,\nManagement Office`,
      attachment: 'Custom Attached Document'
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
    const initialSub = urlParams.get('sub');
    if (initialSub && DEFAULT_TEMPLATES[initialSub]) {
      currentFeature = initialSub;
      const targetTab = document.querySelector(`#subfeatureTabs .sub-tab[data-feature="${initialSub}"]`);
      if (targetTab) {
        document.querySelectorAll('#subfeatureTabs .sub-tab').forEach(t => t.classList.remove('active'));
        targetTab.classList.add('active');
      }
    }

    bindEvents();
    onFeatureChanged(currentFeature);
    await loadMembers();
  };

  const bindEvents = () => {
    const tabs = document.querySelectorAll('#subfeatureTabs .sub-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFeature = tab.getAttribute('data-feature');
        onFeatureChanged(currentFeature);
      });
    });

    document.querySelectorAll('.var-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const variable = tag.getAttribute('data-var');
        const textarea = document.getElementById('emailBody');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + variable + text.substring(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + variable.length;
      });
    });

    document.getElementById('filterWing').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
    document.getElementById('searchMember').addEventListener('input', applyFilters);
    document.getElementById('btnRefreshMembers').addEventListener('click', loadMembers);

    document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
      const checked = e.target.checked;
      filteredMembers.forEach(m => {
        const id = Number(m.memberId);
        if (checked) {
          selectedMemberIds.add(id);
        } else {
          selectedMemberIds.delete(id);
        }
      });
      renderTableRows();
      updateCounters();
    });

    document.getElementById('btnPreviewMail').addEventListener('click', showPreviewModal);
    document.getElementById('btnQueueMail').addEventListener('click', confirmAndQueue);

    document.getElementById('btnClosePreview').addEventListener('click', hidePreviewModal);
    document.getElementById('btnDismissPreview').addEventListener('click', hidePreviewModal);
    document.getElementById('btnConfirmQueue').addEventListener('click', () => {
      hidePreviewModal();
      confirmAndQueue();
    });
  };

  const onFeatureChanged = (feature) => {
    loadTemplate(feature);

    const isDateRange = feature === 'MEMBER_ACCOUNT' || feature === 'BALANCE_CONFIRMATION';
    document.getElementById('groupDateRange').style.display = isDateRange ? 'flex' : 'none';
    document.getElementById('groupBillMonth').style.display = isDateRange ? 'none' : 'flex';

    const isCustomFile = feature === 'MESSAGE_WITH_PDF';
    document.getElementById('customFileGroup').style.display = isCustomFile ? 'flex' : 'none';
  };

  const loadTemplate = (feature) => {
    const tpl = DEFAULT_TEMPLATES[feature] || DEFAULT_TEMPLATES.BILL_FORMAT;
    document.getElementById('emailSubject').value = tpl.subject;
    document.getElementById('emailBody').value = tpl.body;
    document.getElementById('attachmentLabel').textContent = tpl.attachment;
  };

  const loadMembers = async () => {
    const tbody = document.getElementById('memberTableBody');
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);"><i class="bi bi-hourglass-split"></i> Loading member records...</td></tr>`;

    try {
      const res = await fetch(`${getApiBase()}/api/communication/members?societyId=${getSocietyId()}&fyId=${getFYId()}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        allMembers = data.data;
        populateWingDropdown(allMembers);
        applyFilters();
      } else {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 16px;">Failed to load members: ${data.message || 'Unknown error'}</td></tr>`;
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 16px;">Error connecting to API: ${err.message}</td></tr>`;
    }
  };

  const populateWingDropdown = (members) => {
    const wings = Array.from(new Set(members.map(m => m.wing).filter(Boolean))).sort();
    const select = document.getElementById('filterWing');
    select.innerHTML = '<option value="">-- All Wings --</option>';
    wings.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w;
      opt.textContent = `Wing ${w}`;
      select.appendChild(opt);
    });
  };

  const applyFilters = () => {
    const wing = document.getElementById('filterWing').value;
    const status = document.getElementById('filterStatus').value;
    const query = document.getElementById('searchMember').value.trim().toLowerCase();

    filteredMembers = allMembers.filter(m => {
      if (wing && m.wing !== wing) return false;
      if (status === 'VALID_EMAIL' && !m.hasValidEmail) return false;
      if (status === 'MISSING_EMAIL' && m.hasValidEmail) return false;

      if (query) {
        const nameMatch = (m.memberName || '').toLowerCase().includes(query);
        const flatMatch = (m.flatNo || '').toLowerCase().includes(query);
        const codeMatch = (m.memberCode || '').toLowerCase().includes(query);
        if (!nameMatch && !flatMatch && !codeMatch) return false;
      }
      return true;
    });

    selectedMemberIds.clear();
    filteredMembers.forEach(m => {
      if (m.hasValidEmail) {
        selectedMemberIds.add(Number(m.memberId));
      }
    });

    renderTableRows();
    updateCounters();
  };

  const renderTableRows = () => {
    const tbody = document.getElementById('memberTableBody');
    if (filteredMembers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">No member records match the filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredMembers.map(m => {
      const id = Number(m.memberId);
      const isSelected = selectedMemberIds.has(id);
      const emailStatusTag = m.hasValidEmail 
        ? `<span class="status-tag ok"><i class="bi bi-check-circle-fill"></i> Valid</span>` 
        : `<span class="status-tag bad"><i class="bi bi-x-circle-fill"></i> Missing</span>`;

      return `
        <tr class="${isSelected ? 'selected-row' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="row-chk" data-id="${id}" ${isSelected ? 'checked' : ''}>
          </td>
          <td><strong>${m.wing ? m.wing + '-' : ''}${m.flatNo || '-'}</strong></td>
          <td><code>${m.memberCode || '-'}</code></td>
          <td>${m.memberName}</td>
          <td>${m.email || '<span style="color:var(--text-muted); font-style:italic;">None</span>'}</td>
          <td>${m.contactNo || '-'}</td>
          <td style="text-align: right; font-weight: 700;">₹${(m.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: center;">${emailStatusTag}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.row-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = Number(e.target.getAttribute('data-id'));
        if (e.target.checked) {
          selectedMemberIds.add(id);
        } else {
          selectedMemberIds.delete(id);
        }
        updateCounters();
        const tr = e.target.closest('tr');
        if (tr) tr.classList.toggle('selected-row', e.target.checked);
      });
    });
  };

  const updateCounters = () => {
    const total = filteredMembers.length;
    const selected = selectedMemberIds.size;
    const valid = filteredMembers.filter(m => selectedMemberIds.has(Number(m.memberId)) && m.hasValidEmail).length;
    const missing = filteredMembers.filter(m => selectedMemberIds.has(Number(m.memberId)) && !m.hasValidEmail).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statSelected').textContent = selected;
    document.getElementById('statValid').textContent = valid;
    document.getElementById('statMissing').textContent = missing;
    document.getElementById('countSelectedTop').textContent = selected;
  };

  const showPreviewModal = async () => {
    if (selectedMemberIds.size === 0) {
      toast('Please select at least one member to preview email content.', false);
      return;
    }

    const firstSelectedId = Array.from(selectedMemberIds)[0];
    const member = allMembers.find(m => Number(m.memberId) === Number(firstSelectedId));
    if (!member) {
      toast('Selected member details not found.', false);
      return;
    }

    const rawSub = document.getElementById('emailSubject').value;
    const rawBody = document.getElementById('emailBody').value;
    const billMonth = document.getElementById('inputMonth').value || '2026-09';
    const tpl = DEFAULT_TEMPLATES[currentFeature] || DEFAULT_TEMPLATES.BILL_FORMAT;

    // Client Render Fallback
    let renderedSub = rawSub
      .replace(/\{\{member_name\}\}/gi, member.memberName || 'Member')
      .replace(/\{\{flat_no\}\}/gi, member.flatNo || '')
      .replace(/\{\{bill_date\}\}/gi, billMonth)
      .replace(/\{\{society_name\}\}/gi, 'HENU ERP');

    let renderedBody = rawBody
      .replace(/\{\{member_name\}\}/gi, member.memberName || 'Member')
      .replace(/\{member_name\}/gi, member.memberName || 'Member')
      .replace(/\{\{flat_no\}\}/gi, member.flatNo || '')
      .replace(/\{flat_no\}/gi, member.flatNo || '')
      .replace(/\{\{bill_date\}\}/gi, billMonth)
      .replace(/\{bill_date\}/gi, billMonth)
      .replace(/\{\{bill_no\}\}/gi, 'BILL/202609/001')
      .replace(/\{\{bill_amount\}\}/gi, '₹3,500.00')
      .replace(/\{\{outstanding_amount\}\}/gi, `₹${(member.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`)
      .replace(/\{\{due_date\}\}/gi, '15-10-2026')
      .replace(/\{\{society_name\}\}/gi, 'HENU ERP');

    document.getElementById('previewRecipient').textContent = `${member.memberName} <${member.email || 'NO EMAIL'}> (${member.flatNo || '-'})`;
    document.getElementById('previewSubject').textContent = renderedSub;
    document.getElementById('previewAttachment').innerHTML = `<i class="bi bi-file-earmark-pdf-fill text-danger"></i> ${tpl.attachment}`;
    document.getElementById('previewContent').textContent = renderedBody;
    document.getElementById('previewCount').textContent = selectedMemberIds.size;

    const modal = document.getElementById('previewModal');
    modal.classList.add('show');
    modal.style.display = 'flex';

    // Server enhancement
    const payload = {
      societyId: getSocietyId(),
      fyId: getFYId(),
      channel: 'EMAIL',
      communicationType: currentFeature,
      memberId: Number(member.memberId),
      templateSubject: rawSub,
      templateBody: rawBody,
      billMonth: billMonth
    };

    try {
      const res = await fetch(`${getApiBase()}/api/communication/members/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          document.getElementById('previewRecipient').textContent = `${result.data.recipientName} <${result.data.recipientEmail || 'NO EMAIL'}> (${result.data.flatNo || '-'})`;
          document.getElementById('previewSubject').textContent = result.data.renderedSubject || renderedSub;
          document.getElementById('previewAttachment').innerHTML = `<i class="bi bi-file-earmark-pdf-fill text-danger"></i> ${result.data.attachmentName || tpl.attachment}`;
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
    if (selectedMemberIds.size === 0) {
      toast('Please select at least one member to queue.', false);
      return;
    }

    const validMembers = allMembers.filter(m => selectedMemberIds.has(Number(m.memberId)) && m.hasValidEmail);
    if (validMembers.length === 0) {
      toast('None of the selected members have a valid email address configured.', false);
      return;
    }

    const billMonth = document.getElementById('inputMonth').value || '2026-09';
    const payload = {
      societyId: getSocietyId(),
      fyId: getFYId(),
      channel: 'EMAIL',
      communicationType: currentFeature,
      memberIds: validMembers.map(m => Number(m.memberId)),
      templateSubject: document.getElementById('emailSubject').value,
      templateBody: document.getElementById('emailBody').value,
      billMonth: billMonth
    };

    toast(`Queueing ${validMembers.length} email(s) for outbox dispatch...`, true);

    try {
      const res = await fetch(`${getApiBase()}/api/communication/members/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.success) {
        await fetch(`${getApiBase()}/api/communication/outbox/process?societyId=${getSocietyId()}`, { method: 'POST' }).catch(() => {});
        toast(`✅ Success! Queued ${result.data?.queuedCount || validMembers.length} email job(s) in outbox. Dispatching live.`, true);
      } else {
        const errMsg = result?.message || result?.error || result?.title || (result?.errors ? Object.values(result.errors).flat().join(', ') : 'Unknown error');
        toast(`Failed to queue emails: ${errMsg}`, false);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, false);
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
