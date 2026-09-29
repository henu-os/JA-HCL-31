// ═══════════════════════════════════════════════════════════
// WhatsApp Templates Controller (WACRM Reference)
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE = 'http://localhost:5002';

  function getEffectiveSocietyId() {
    const urlParams = new URLSearchParams(window.location.search);
    const qSid = urlParams.get('societyId') || urlParams.get('sid');
    if (qSid && parseInt(qSid, 10) > 0) return parseInt(qSid, 10);

    if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
      const aSid = window.Auth.getSocietyId();
      if (aSid && parseInt(aSid, 10) > 0) return parseInt(aSid, 10);
    }

    const sSid = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || localStorage.getItem('current_society_id');
    if (sSid && parseInt(sSid, 10) > 0) return parseInt(sSid, 10);

    return 1;
  }

  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  const societyId = getEffectiveSocietyId();

  const templatesGrid = document.getElementById('templatesGrid');
  const searchFilter = document.getElementById('searchFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const statusFilter = document.getElementById('statusFilter');
  const btnSyncMeta = document.getElementById('btnSyncMeta');
  const btnOpenNewTemplateModal = document.getElementById('btnOpenNewTemplateModal');

  // New Template Modal Elements
  const newTemplateModal = document.getElementById('newTemplateModal');
  const btnCloseNewTmplModal = document.getElementById('btnCloseNewTmplModal');
  const btnCancelNewTmpl = document.getElementById('btnCancelNewTmpl');
  const btnSubmitNewTemplate = document.getElementById('btnSubmitNewTemplate');
  const newTmplName = document.getElementById('newTmplName');
  const newTmplCategory = document.getElementById('newTmplCategory');
  const newTmplLanguage = document.getElementById('newTmplLanguage');
  const newTmplHeader = document.getElementById('newTmplHeader');
  const newTmplBody = document.getElementById('newTmplBody');
  const newTmplFooter = document.getElementById('newTmplFooter');
  const bodyCharCount = document.getElementById('bodyCharCount');

  // Inspector & Test Modal Elements
  const inspectorModal = document.getElementById('inspectorModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const btnDispatchTest = document.getElementById('btnDispatchTest');
  const modalMetaName = document.getElementById('modalMetaName');
  const modalCatLang = document.getElementById('modalCatLang');
  const modalStatus = document.getElementById('modalStatus');
  const variableInputsContainer = document.getElementById('variableInputsContainer');
  const bubbleHeader = document.getElementById('bubbleHeader');
  const bubbleBody = document.getElementById('bubbleBody');
  const bubbleFooter = document.getElementById('bubbleFooter');
  const testMobileInput = document.getElementById('testMobileInput');

  let allTemplates = [];
  let selectedTemplate = null;

  async function loadTemplates() {
    try {
      const sid = getEffectiveSocietyId();
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/templates?societyId=${sid}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          allTemplates = data.data;
          renderTemplates();
        }
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
      templatesGrid.innerHTML = `<div class="wacrm-loading text-danger">Error loading templates: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderTemplates() {
    const q = (searchFilter ? searchFilter.value : '').toLowerCase().trim();
    const cat = categoryFilter ? categoryFilter.value : '';
    const st = statusFilter ? statusFilter.value : '';

    const filtered = allTemplates.filter(t => {
      const category = (t.category || '').toUpperCase();
      const status = (t.status || '').toUpperCase();
      const tmplName = (t.templateName || t.template_name || '').toLowerCase();
      const metaName = (t.metaTemplateName || t.meta_template_name || '').toLowerCase();
      const bodyText = (t.body || '').toLowerCase();

      if (cat && category !== cat) return false;
      if (st && status !== st) return false;
      if (q) {
        if (!tmplName.includes(q) && !metaName.includes(q) && !bodyText.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      templatesGrid.innerHTML = `<div class="wacrm-loading">No message templates found. Click "Sync from Meta" to import or "New Template" to create.</div>`;
      return;
    }

    templatesGrid.innerHTML = filtered.map(t => {
      const name = t.metaTemplateName || t.meta_template_name || t.templateName || t.template_name || 'template';
      const category = (t.category || 'UTILITY').toUpperCase();
      const catClass = category === 'MARKETING' ? 'marketing' : category === 'AUTHENTICATION' ? 'authentication' : 'utility';
      const catLabel = category === 'MARKETING' ? 'Marketing' : category === 'AUTHENTICATION' ? 'Authentication' : 'Utility';

      const status = (t.status || 'APPROVED').toUpperCase();
      const stClass = status === 'PENDING' ? 'pending' : status === 'REJECTED' ? 'rejected' : 'approved';
      const stLabel = status === 'PENDING' ? 'Pending' : status === 'REJECTED' ? 'Rejected' : 'Approved';

      const lang = (t.language || 'en_US').toUpperCase();

      let domainTag = '';
      const safeName = name || '';
      const safeBody = t.body || '';
      if (safeBody.includes('http') || safeName.includes('market')) {
        domainTag = `<div class="sample-domain-tag"><i class="bi bi-link-45deg"></i> developers.facebook.com</div>`;
      }

      return `
        <div class="wacrm-tmpl-card">
          <div>
            <div class="wacrm-card-head">
              <div class="wacrm-card-title-row">
                <span class="wacrm-tmpl-name">${escapeHtml(safeName)}</span>
                <span class="pill-cat ${catClass}">${catLabel}</span>
                <span class="pill-status ${stClass}">${stLabel}</span>
                <span class="pill-lang">${escapeHtml(lang)}</span>
              </div>
              <div class="wacrm-card-actions">
                <button type="button" class="action-icon-btn" onclick="window.openInspector(${t.id})" title="Inspect & Test Send">
                  <i class="bi bi-pencil"></i> Edit
                </button>
                <button type="button" class="action-icon-btn delete" onclick="window.deleteTemplate(${t.id}, '${escapeHtml(safeName)}')" title="Delete Template">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>

            <div class="wacrm-card-body-text">
              ${escapeHtml(safeBody)}
            </div>

            ${domainTag}
          </div>
        </div>
      `;
    }).join('');
  }

  window.openInspector = function(id) {
    try {
      const tmpl = allTemplates.find(t => String(t.id) === String(id));
      if (!tmpl) {
        console.warn('Template not found for id:', id);
        return;
      }
      selectedTemplate = tmpl;

      const templateName = tmpl.metaTemplateName || tmpl.meta_template_name || tmpl.templateName || tmpl.template_name || 'Template';
      modalMetaName.textContent = templateName;
      modalCatLang.textContent = `${tmpl.category || 'Utility'} • ${tmpl.language || 'en_US'}`;
      modalStatus.innerHTML = `<span class="pill-status approved">${tmpl.status || 'Approved'}</span>`;

      // Parse placeholders {{1}}, {{2}}
      const bodyText = tmpl.body || '';
      const varMatches = bodyText.match(/{{\s*(\w+)\s*}}/g) || [];
      const uniqueVars = [...new Set(varMatches)];

      if (uniqueVars.length > 0) {
        variableInputsContainer.innerHTML = uniqueVars.map((v) => {
          const cleanVar = v.replace(/[{}]/g, '').trim();
          const placeholderVal = cleanVar === '1' ? 'Rajesh Sharma' : cleanVar === '2' ? 'INV-2026-0042' : '₹12,500';
          return `
            <div class="var-input-row">
              <span class="var-badge">${v}</span>
              <input type="text" class="wacrm-input var-input" data-placeholder="${v}" placeholder="Value for ${v} (e.g. ${placeholderVal})" value="${placeholderVal}">
            </div>
          `;
        }).join('');

        variableInputsContainer.querySelectorAll('.var-input').forEach(inp => {
          inp.addEventListener('input', updateBubblePreview);
        });
      } else {
        variableInputsContainer.innerHTML = `<div class="no-vars-msg text-muted small">No dynamic placeholders in this template.</div>`;
      }

      updateBubblePreview();
      inspectorModal.style.display = 'flex';
    } catch (err) {
      console.error('Error opening inspector:', err);
    }
  };

  function updateBubblePreview() {
    if (!selectedTemplate) return;
    let previewBody = selectedTemplate.body || '';

    const varInputs = variableInputsContainer.querySelectorAll('.var-input');
    varInputs.forEach(inp => {
      const ph = inp.getAttribute('data-placeholder');
      const val = inp.value.trim() || ph;
      previewBody = previewBody.split(ph).join(val);
    });

    bubbleBody.textContent = previewBody;
  }

  async function syncTemplatesFromMeta() {
    btnSyncMeta.disabled = true;
    btnSyncMeta.innerHTML = `<i class="bi bi-arrow-repeat spin-icon"></i> Syncing...`;

    try {
      const sid = getEffectiveSocietyId();
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/templates/sync?societyId=${sid}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        alert(`Meta Cloud API Template Sync Complete!\n${data.count || 0} approved templates imported.`);
        await loadTemplates();
      } else {
        alert(`Template Sync Failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Sync Network Error: ${err.message}`);
    } finally {
      btnSyncMeta.disabled = false;
      btnSyncMeta.innerHTML = `<i class="bi bi-arrow-repeat"></i> Sync from Meta`;
    }
  }

  window.deleteTemplate = async function(id, name) {
    if (!confirm(`Are you sure you want to delete template "${name}"?`)) return;
    try {
      const sid = getEffectiveSocietyId();
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/templates/${id}?societyId=${sid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        await loadTemplates();
      } else {
        alert('Delete failed: ' + (data.message || 'Error'));
      }
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  };

  async function dispatchTestTemplate() {
    if (!selectedTemplate) return;
    const rawPhone = testMobileInput.value.trim();
    if (!rawPhone) return alert('Please enter recipient mobile number.');

    const templateName = selectedTemplate.metaTemplateName || selectedTemplate.meta_template_name || selectedTemplate.templateName || selectedTemplate.template_name || '';
    if (!templateName) return alert('Template name is missing.');

    btnDispatchTest.disabled = true;
    btnDispatchTest.innerHTML = `<i class="bi bi-arrow-repeat spin-icon"></i> Sending...`;

    const varInputs = Array.from(variableInputsContainer.querySelectorAll('.var-input')).map(inp => inp.value.trim());

    try {
      const sid = getEffectiveSocietyId();
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/send/template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          societyId: sid,
          phoneNumber: rawPhone,
          templateName: templateName,
          languageCode: selectedTemplate.language || 'en_US',
          parameters: varInputs
        })
      });

      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { }

      if (res.ok && data.success) {
        alert(`WhatsApp Template Dispatched Live!\nMeta WAMID: ${data.wamid || 'Outbox Sent'}`);
        inspectorModal.style.display = 'none';
      } else {
        alert(`Dispatch failed: ${data.message || text || 'Meta Cloud API Error'}`);
      }
    } catch (err) {
      alert(`Dispatch network error: ${err.message}`);
    } finally {
      btnDispatchTest.disabled = false;
      btnDispatchTest.innerHTML = `<i class="bi bi-send-fill me-1"></i> Send Test Template Message`;
    }
  }

  // New Template Modal Logic
  btnOpenNewTemplateModal.addEventListener('click', () => {
    newTemplateModal.style.display = 'flex';
  });
  btnCloseNewTmplModal.addEventListener('click', () => newTemplateModal.style.display = 'none');
  btnCancelNewTmpl.addEventListener('click', () => newTemplateModal.style.display = 'none');

  newTmplBody.addEventListener('input', () => {
    bodyCharCount.textContent = `${newTmplBody.value.length}/1024`;
  });

  btnSubmitNewTemplate.addEventListener('click', async () => {
    const name = newTmplName.value.trim().toLowerCase().replace(/\s+/g, '_');
    const body = newTmplBody.value.trim();
    const cat = newTmplCategory.value;
    const lang = newTmplLanguage.value;
    const header = newTmplHeader.value.trim();
    const footer = newTmplFooter.value.trim();

    if (!name || !body) return alert('Template name and body text are required.');

    btnSubmitNewTemplate.disabled = true;
    btnSubmitNewTemplate.innerHTML = `<i class="bi bi-arrow-repeat spin-icon"></i> Submitting to Meta...`;

    try {
      const sid = getEffectiveSocietyId();
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          societyId: sid,
          templateName: name,
          metaTemplateName: name,
          category: cat,
          language: lang,
          subject: header,
          body: body,
          components: JSON.stringify({ header, footer }),
          status: 'APPROVED',
          isActive: true
        })
      });

      const data = await res.json();
      if (data.success) {
        alert('Template successfully saved & added to Meta message templates!');
        newTemplateModal.style.display = 'none';
        newTmplName.value = '';
        newTmplBody.value = '';
        await loadTemplates();
      } else {
        alert('Failed to save template: ' + (data.message || 'Error'));
      }
    } catch (err) {
      alert('Save template error: ' + err.message);
    } finally {
      btnSubmitNewTemplate.disabled = false;
      btnSubmitNewTemplate.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i> Submit &amp; Save Template`;
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (searchFilter) searchFilter.addEventListener('input', renderTemplates);
  if (categoryFilter) categoryFilter.addEventListener('change', renderTemplates);
  if (statusFilter) statusFilter.addEventListener('change', renderTemplates);
  if (btnSyncMeta) btnSyncMeta.addEventListener('click', syncTemplatesFromMeta);
  if (btnCloseModal) btnCloseModal.addEventListener('click', () => inspectorModal.style.display = 'none');
  if (btnCancelModal) btnCancelModal.addEventListener('click', () => inspectorModal.style.display = 'none');
  if (btnDispatchTest) btnDispatchTest.addEventListener('click', dispatchTestTemplate);

  await loadTemplates();
});
