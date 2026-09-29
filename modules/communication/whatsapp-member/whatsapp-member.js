// ═══════════════════════════════════════════════════════════
// HENU ERP — COMMUNICATION MODULE: WHATSAPP TO MEMBER
// Meta Cloud API WhatsApp Dispatch with Template Selection & Dynamic PDF
// ═══════════════════════════════════════════════════════════

(() => {
  let allMembers = [];
  let filteredMembers = [];
  let selectedMemberIds = new Set();
  let currentFeature = 'BILL_FORMAT';
  let availableTemplates = [];

  const DEFAULT_TEMPLATES = {
    BILL_FORMAT: {
      body: `*{{society_name}} — Maintenance Bill*\n\nDear {{member_name}},\n\nYour maintenance bill for Unit *{{flat_no}}* for month *{{bill_date}}* is generated.\n\n*Bill No:* {{bill_no}}\n*Amount:* {{bill_amount}}\n*Total Outstanding:* {{outstanding_amount}}\n*Due Date:* {{due_date}}\n\nPlease find the attached official bill PDF.\n\n_Regards, Management Committee_`,
      attachment: 'Maintenance Bill PDF'
    },
    RECEIPT: {
      body: `*{{society_name}} — Payment Receipt*\n\nDear {{member_name}},\n\nThank you! We have received your payment for Unit *{{flat_no}}*.\n\n*Receipt No:* {{receipt_no}}\n*Amount:* {{bill_amount}}\n*Date:* {{bill_date}}\n\nPlease find your formal receipt attached.\n\n_Regards, {{society_name}}_`,
      attachment: 'Payment Receipt PDF'
    },
    MEMBER_ACCOUNT: {
      body: `*{{society_name}} — Member Statement*\n\nDear {{member_name}},\n\nAttached is your account statement for Unit *{{flat_no}}* for the period *{{financial_year}}*.\n\n*Closing Balance:* {{outstanding_amount}}\n\n_Regards, Accounts Office_`,
      attachment: 'Member Account Statement PDF'
    },
    MEMBER_REGISTER: {
      body: `*{{society_name}} — Member Profile*\n\nDear {{member_name}},\n\nHere is your official registered member record copy for Unit *{{flat_no}}*.\n\n_Regards, Hon. Secretary_`,
      attachment: 'Member Register PDF'
    },
    OUTSTANDING_REMINDER: {
      body: `*{{society_name}} — Overdue Dues Reminder*\n\nDear {{member_name}},\n\nOur records show an overdue balance of *{{outstanding_amount}}* for Unit *{{flat_no}}*.\n\nKindly arrange payment at your earliest convenience to avoid interest charges.\n\n_Regards, Managing Committee_`,
      attachment: 'None (WhatsApp Text)'
    },
    MESSAGE: {
      body: `*{{society_name}} — Notice*\n\nDear {{member_name}},\n\nPlease note the upcoming maintenance notice for Unit *{{flat_no}}*.\n\nFor any questions, kindly reach out to society office.\n\n_Regards, Managing Committee_`,
      attachment: 'None'
    },
    BALANCE_CONFIRMATION: {
      body: `*{{society_name}} — Balance Confirmation Letter*\n\nDear {{member_name}},\n\nPlease find attached the Balance Confirmation Letter for Unit *{{flat_no}}* as of {{financial_year}}.\n\n*Ledger Balance:* {{outstanding_amount}}\n\n_Regards, Management Committee_`,
      attachment: 'Balance Confirmation Letter PDF'
    },
    MESSAGE_WITH_PDF: {
      body: `*{{society_name}} — Circular*\n\nDear {{member_name}},\n\nPlease find attached the official circular/notice for Unit *{{flat_no}}*.\n\n_Regards, Management Office_`,
      attachment: 'Custom PDF Document'
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
    const sSid = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || localStorage.getItem('current_society_id');
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
    await loadTemplates();
    onFeatureChanged(currentFeature);
    await loadMembers();
  };

  const loadTemplates = async () => {
    const select = document.getElementById('templateSelect');
    if (!select) return;

    try {
      const res = await fetch(`${getApiBase()}/api/communication/whatsapp/templates?societyId=${getSocietyId()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          availableTemplates = json.data;
          
          let optionsHtml = `<option value="">-- Standard / Default Report Message --</option>`;
          availableTemplates.forEach(t => {
            const name = t.metaTemplateName || t.meta_template_name || t.templateName || t.template_name || `template_${t.id}`;
            const cat = t.category || 'UTILITY';
            optionsHtml += `<option value="${escapeHtml(name)}" data-id="${t.id}">${escapeHtml(name)} (${cat})</option>`;
          });
          select.innerHTML = optionsHtml;
        }
      }
    } catch (err) {
      console.warn('Failed to load message templates for members:', err);
    }
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

    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
      templateSelect.addEventListener('change', onTemplateSelected);
    }

    document.querySelectorAll('.var-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const variable = tag.getAttribute('data-var');
        const textarea = document.getElementById('whatsappBody');
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

    document.getElementById('btnPreviewWhatsApp').addEventListener('click', showPreviewModal);
    document.getElementById('btnQueueWhatsApp').addEventListener('click', confirmAndQueue);

    document.getElementById('btnClosePreview').addEventListener('click', hidePreviewModal);
    document.getElementById('btnDismissPreview').addEventListener('click', hidePreviewModal);
    document.getElementById('btnConfirmQueue').addEventListener('click', () => {
      hidePreviewModal();
      confirmAndQueue();
    });
  };

  const onTemplateSelected = () => {
    const select = document.getElementById('templateSelect');
    const selectedVal = select.value;

    if (!selectedVal) {
      loadTemplate(currentFeature);
      return;
    }

    const tmpl = availableTemplates.find(t => {
      const name = t.metaTemplateName || t.meta_template_name || t.templateName || t.template_name;
      return name === selectedVal;
    });

    if (tmpl && tmpl.body) {
      document.getElementById('whatsappBody').value = tmpl.body;
      toast(`Loaded template: ${selectedVal}`, true);
    }
  };

  const onFeatureChanged = (feature) => {
    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect && templateSelect.value) {
      const tmpl = availableTemplates.find(t => {
        const name = t.metaTemplateName || t.meta_template_name || t.templateName || t.template_name;
        return name === templateSelect.value;
      });
      if (tmpl && tmpl.body) {
        document.getElementById('whatsappBody').value = tmpl.body;
      } else {
        loadTemplate(feature);
      }
    } else {
      loadTemplate(feature);
    }

    const isDateRange = feature === 'MEMBER_ACCOUNT' || feature === 'BALANCE_CONFIRMATION';
    document.getElementById('groupDateRange').style.display = isDateRange ? 'flex' : 'none';
    document.getElementById('groupBillMonth').style.display = isDateRange ? 'none' : 'flex';

    const isCustomFile = feature === 'MESSAGE_WITH_PDF';
    document.getElementById('customFileGroup').style.display = isCustomFile ? 'flex' : 'none';
  };

  const loadTemplate = (feature) => {
    const tpl = DEFAULT_TEMPLATES[feature] || DEFAULT_TEMPLATES.BILL_FORMAT;
    document.getElementById('whatsappBody').value = tpl.body;
    document.getElementById('attachmentLabel').textContent = tpl.attachment;
  };

  const loadMembers = async () => {
    const tbody = document.getElementById('memberTableBody');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);"><i class="bi bi-hourglass-split"></i> Loading member records...</td></tr>`;

    try {
      const res = await fetch(`${getApiBase()}/api/communication/members?societyId=${getSocietyId()}&fyId=${getFYId()}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        allMembers = data.data;
        populateWingDropdown(allMembers);
        applyFilters();
      } else {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 16px;">Failed to load members: ${data.message || 'Unknown error'}</td></tr>`;
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 16px;">Error connecting to API: ${err.message}</td></tr>`;
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
      if (status === 'VALID_MOBILE' && (!m.contactNo || m.contactNo.replace(/\D/g, '').length < 10)) return false;
      if (status === 'MISSING_MOBILE' && m.contactNo && m.contactNo.replace(/\D/g, '').length >= 10) return false;

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
      if (m.contactNo && m.contactNo.replace(/\D/g, '').length >= 10) {
        selectedMemberIds.add(Number(m.memberId));
      }
    });

    renderTableRows();
    updateCounters();
  };

  const renderTableRows = () => {
    const tbody = document.getElementById('memberTableBody');
    if (filteredMembers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">No member records match the filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredMembers.map(m => {
      const id = Number(m.memberId);
      const isSelected = selectedMemberIds.has(id);
      const phone = m.contactNo || m.phone || '';
      const hasMobile = phone && phone.replace(/\D/g, '').length >= 10;
      const statusTag = hasMobile 
        ? `<span class="status-tag ok"><i class="bi bi-check-circle-fill"></i> Valid (${phone})</span>` 
        : `<span class="status-tag bad"><i class="bi bi-x-circle-fill"></i> Missing/Invalid</span>`;

      return `
        <tr class="${isSelected ? 'selected-row' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="row-chk" data-id="${id}" ${isSelected ? 'checked' : ''}>
          </td>
          <td><strong>${m.wing ? m.wing + '-' : ''}${m.flatNo || '-'}</strong></td>
          <td><code>${m.memberCode || '-'}</code></td>
          <td>${m.memberName}</td>
          <td>${phone || '<span style="color:var(--text-muted); font-style:italic;">None</span>'}</td>
          <td style="text-align: right; font-weight: 700;">₹${(m.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: center;">${statusTag}</td>
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
    const valid = filteredMembers.filter(m => {
      const id = Number(m.memberId);
      const phone = m.contactNo || m.phone || '';
      return selectedMemberIds.has(id) && phone && phone.replace(/\D/g, '').length >= 10;
    }).length;
    const missing = filteredMembers.filter(m => {
      const id = Number(m.memberId);
      const phone = m.contactNo || m.phone || '';
      return selectedMemberIds.has(id) && (!phone || phone.replace(/\D/g, '').length < 10);
    }).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statSelected').textContent = selected;
    document.getElementById('statValid').textContent = valid;
    document.getElementById('statMissing').textContent = missing;
    document.getElementById('countSelectedTop').textContent = selected;
  };

  const showPreviewModal = async () => {
    if (selectedMemberIds.size === 0) {
      toast('Please select at least one member to preview WhatsApp message.', false);
      return;
    }

    const firstSelectedId = Array.from(selectedMemberIds)[0];
    const member = allMembers.find(m => Number(m.memberId) === Number(firstSelectedId));
    if (!member) {
      toast('Selected member details not found.', false);
      return;
    }

    const rawBody = document.getElementById('whatsappBody').value;
    const billMonth = document.getElementById('inputMonth').value || '2026-09';
    const tpl = DEFAULT_TEMPLATES[currentFeature] || DEFAULT_TEMPLATES.BILL_FORMAT;

    // Client Render Fallback
    let renderedText = rawBody
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
      .replace(/\{\{society_name\}\}/gi, 'HENU ERP')
      .replace(/\{\{1\}\}/g, member.memberName || 'Member')
      .replace(/\{\{2\}\}/g, member.flatNo || '')
      .replace(/\{\{3\}\}/g, `₹${(member.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);

    document.getElementById('previewRecipient').textContent = `${member.memberName} (${member.flatNo || '-'}) - ${member.contactNo || 'NO MOBILE'}`;
    document.getElementById('previewAttachment').innerHTML = `<i class="bi bi-file-earmark-pdf-fill text-danger"></i> ${tpl.attachment}`;
    document.getElementById('previewContent').textContent = renderedText;
    document.getElementById('previewCount').textContent = selectedMemberIds.size;

    const modal = document.getElementById('previewModal');
    modal.classList.add('show');
    modal.style.display = 'flex';

    // Server enhancement
    const payload = {
      societyId: getSocietyId(),
      fyId: getFYId(),
      channel: 'WHATSAPP',
      communicationType: currentFeature,
      memberId: Number(member.memberId),
      templateSubject: 'WhatsApp Member Notice',
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
          document.getElementById('previewRecipient').textContent = `${result.data.recipientName} (${result.data.flatNo || '-'}) - ${result.data.recipientMobile || 'NO MOBILE'}`;
          document.getElementById('previewAttachment').innerHTML = `<i class="bi bi-file-earmark-pdf-fill text-danger"></i> ${result.data.attachmentName || tpl.attachment}`;
          document.getElementById('previewContent').textContent = result.data.renderedBody || renderedText;
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
      toast('Please select at least one member.', false);
      return;
    }

    const validMembers = allMembers.filter(m => {
      const id = Number(m.memberId);
      const phone = m.contactNo || m.phone || '';
      return selectedMemberIds.has(id) && phone && phone.replace(/\D/g, '').length >= 10;
    });

    if (validMembers.length === 0) {
      toast('None of the selected members have a valid 10-digit mobile number.', false);
      return;
    }

    const billMonth = document.getElementById('inputMonth').value || '2026-09';
    const templateSelect = document.getElementById('templateSelect');
    const chosenTemplate = templateSelect ? templateSelect.value : '';

    const payload = {
      societyId: getSocietyId(),
      fyId: getFYId(),
      channel: 'WHATSAPP',
      communicationType: chosenTemplate ? `TEMPLATE:${chosenTemplate}` : currentFeature,
      memberIds: validMembers.map(m => Number(m.memberId)),
      templateSubject: chosenTemplate ? `TEMPLATE:${chosenTemplate}` : 'WhatsApp Member Notice',
      templateBody: document.getElementById('whatsappBody').value,
      billMonth: billMonth
    };

    toast(`Dispatching WhatsApp messages to ${validMembers.length} member recipient(s)...`, true);

    try {
      const res = await fetch(`${getApiBase()}/api/communication/members/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.success) {
        await fetch(`${getApiBase()}/api/communication/outbox/process?societyId=${getSocietyId()}`, { method: 'POST' }).catch(() => {});
        toast(`✅ WhatsApp Dispatched! ${result.data?.queuedCount || validMembers.length} message(s) processed live via Meta Cloud API.`, true);
      } else {
        const errMsg = result?.message || result?.error || result?.title || (result?.errors ? Object.values(result.errors).flat().join(', ') : 'Unknown error');
        toast(`Failed to dispatch: ${errMsg}`, false);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, false);
    }
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
