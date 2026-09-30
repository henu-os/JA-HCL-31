// Quick Replies Controller (WACRM Reference)
document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE = 'http://localhost:5002';
  const token = localStorage.getItem('token') || '';
  const societyId = localStorage.getItem('current_society_id') || '1';

  const quickRepliesList = document.getElementById('quickRepliesList');
  const btnOpenNewQrModal = document.getElementById('btnOpenNewQrModal');

  // Modal Elements
  const qrModal = document.getElementById('qrModal');
  const qrModalTitle = document.getElementById('qrModalTitle');
  const btnCloseQrModal = document.getElementById('btnCloseQrModal');
  const btnCancelQrModal = document.getElementById('btnCancelQrModal');
  const btnSaveQr = document.getElementById('btnSaveQr');

  const qrNameInput = document.getElementById('qrNameInput');
  const btnTypeTabInteractive = document.getElementById('btnTypeTabInteractive');
  const btnTypeTabText = document.getElementById('btnTypeTabText');
  const subTypeToggleRow = document.getElementById('subTypeToggleRow');
  const btnSubReplyButtons = document.getElementById('btnSubReplyButtons');
  const btnSubList = document.getElementById('btnSubList');

  const qrBodyInput = document.getElementById('qrBodyInput');
  const qrBodyCharCount = document.getElementById('qrBodyCharCount');
  const interactiveFieldsSection = document.getElementById('interactiveFieldsSection');
  const qrHeaderInput = document.getElementById('qrHeaderInput');
  const qrHeaderCharCount = document.getElementById('qrHeaderCharCount');
  const qrFooterInput = document.getElementById('qrFooterInput');
  const qrFooterCharCount = document.getElementById('qrFooterCharCount');
  const qrListButtonLabel = document.getElementById('qrListButtonLabel');
  const qrButtonCharCount = document.getElementById('qrButtonCharCount');
  const listButtonField = document.getElementById('listButtonField');
  const rowsContainer = document.getElementById('rowsContainer');

  // Preview elements
  const previewHeader = document.getElementById('previewHeader');
  const previewBody = document.getElementById('previewBody');
  const previewFooter = document.getElementById('previewFooter');
  const previewActionBtn = document.getElementById('previewActionBtn');
  const previewActionLabel = document.getElementById('previewActionLabel');

  let allQuickReplies = [];
  let currentEditingId = 0;
  let currentType = 'INTERACTIVE';
  let currentInteractiveType = 'LIST';

  async function loadQuickReplies() {
    try {
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/quick-replies?societyId=${societyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          allQuickReplies = data.data;
          renderQuickReplies();
        }
      }
    } catch (err) {
      console.error('Failed to load quick replies:', err);
      quickRepliesList.innerHTML = `<div class="wacrm-loading text-danger">Error loading quick replies: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderQuickReplies() {
    if (allQuickReplies.length === 0) {
      quickRepliesList.innerHTML = `<div class="wacrm-loading">No quick replies found. Click "New quick reply" to create one.</div>`;
      return;
    }

    quickRepliesList.innerHTML = allQuickReplies.map(qr => {
      const isInteractive = qr.type === 'INTERACTIVE';
      const icon = isInteractive ? '<i class="bi bi-ui-checks-grid"></i>' : '<i class="bi bi-lightning-charge"></i>';

      return `
        <div class="qr-item-card">
          <div class="qr-icon-wrap">${icon}</div>
          <div class="qr-content-wrap">
            <div class="qr-name-title">${escapeHtml(qr.name)}</div>
            <div class="qr-body-snippet">${escapeHtml(qr.body)}</div>
          </div>
          <div class="qr-actions-wrap">
            <button type="button" class="qr-action-btn" onclick="window.editQuickReply(${qr.id})" title="Edit">
              <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="qr-action-btn delete" onclick="window.deleteQuickReply(${qr.id}, '${escapeHtml(qr.name)}')" title="Delete">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.editQuickReply = function(id) {
    const qr = allQuickReplies.find(q => q.id === id);
    if (!qr) return;
    currentEditingId = id;
    qrModalTitle.textContent = 'Edit quick reply';

    qrNameInput.value = qr.name || '';
    qrBodyInput.value = qr.body || '';
    qrHeaderInput.value = qr.header || '';
    qrFooterInput.value = qr.footer || '';
    qrListButtonLabel.value = qr.list_button_label || 'Menu';

    setType(qr.type || 'TEXT');
    setInteractiveType(qr.interactive_type || 'BUTTONS');

    updateCharCounts();
    updatePreview();
    qrModal.style.display = 'flex';
  };

  window.deleteQuickReply = async function(id, name) {
    if (!confirm(`Are you sure you want to delete quick reply "${name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/quick-replies/${id}?societyId=${societyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        await loadQuickReplies();
      } else {
        alert('Delete failed: ' + (data.message || 'Error'));
      }
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  };

  function setType(type) {
    currentType = type;
    if (type === 'INTERACTIVE') {
      btnTypeTabInteractive.classList.add('active');
      btnTypeTabText.classList.remove('active');
      subTypeToggleRow.style.display = 'flex';
      interactiveFieldsSection.style.display = 'block';
    } else {
      btnTypeTabText.classList.add('active');
      btnTypeTabInteractive.classList.remove('active');
      subTypeToggleRow.style.display = 'none';
      interactiveFieldsSection.style.display = 'none';
    }
    updatePreview();
  }

  function setInteractiveType(itype) {
    currentInteractiveType = itype;
    if (itype === 'LIST') {
      btnSubList.classList.add('active');
      btnSubReplyButtons.classList.remove('active');
      listButtonField.style.display = 'block';
    } else {
      btnSubReplyButtons.classList.add('active');
      btnSubList.classList.remove('active');
      listButtonField.style.display = 'none';
    }
    updatePreview();
  }

  function updateCharCounts() {
    qrBodyCharCount.textContent = `${qrBodyInput.value.length}/1024`;
    qrHeaderCharCount.textContent = `${qrHeaderInput.value.length}/60`;
    qrFooterCharCount.textContent = `${qrFooterInput.value.length}/60`;
    qrButtonCharCount.textContent = `${qrListButtonLabel.value.length}/20`;
  }

  function updatePreview() {
    previewHeader.textContent = qrHeaderInput.value.trim() || 'Header (Optional)';
    previewHeader.style.display = (currentType === 'INTERACTIVE' && qrHeaderInput.value.trim()) ? 'block' : 'none';

    previewBody.textContent = qrBodyInput.value.trim() || 'Enter body text...';

    previewFooter.textContent = qrFooterInput.value.trim() || 'Footer (Optional)';
    previewFooter.style.display = (currentType === 'INTERACTIVE' && qrFooterInput.value.trim()) ? 'block' : 'none';

    if (currentType === 'INTERACTIVE') {
      previewActionBtn.style.display = 'flex';
      if (currentInteractiveType === 'LIST') {
        previewActionBtn.innerHTML = `<i class="bi bi-list-ul me-1"></i> <span>${escapeHtml(qrListButtonLabel.value.trim() || 'Menu')}</span>`;
      } else {
        previewActionBtn.innerHTML = `<span>Reply Buttons</span>`;
      }
    } else {
      previewActionBtn.style.display = 'none';
    }
  }

  // Event Listeners
  btnTypeTabInteractive.addEventListener('click', () => setType('INTERACTIVE'));
  btnTypeTabText.addEventListener('click', () => setType('TEXT'));
  btnSubReplyButtons.addEventListener('click', () => setInteractiveType('BUTTONS'));
  btnSubList.addEventListener('click', () => setInteractiveType('LIST'));

  [qrNameInput, qrBodyInput, qrHeaderInput, qrFooterInput, qrListButtonLabel].forEach(inp => {
    inp.addEventListener('input', () => {
      updateCharCounts();
      updatePreview();
    });
  });

  btnOpenNewQrModal.addEventListener('click', () => {
    currentEditingId = 0;
    qrModalTitle.textContent = 'New quick reply';
    qrNameInput.value = '';
    qrBodyInput.value = '';
    qrHeaderInput.value = '';
    qrFooterInput.value = '';
    qrListButtonLabel.value = 'Menu';
    setType('INTERACTIVE');
    setInteractiveType('LIST');
    updateCharCounts();
    updatePreview();
    qrModal.style.display = 'flex';
  });

  btnCloseQrModal.addEventListener('click', () => qrModal.style.display = 'none');
  btnCancelQrModal.addEventListener('click', () => qrModal.style.display = 'none');

  btnSaveQr.addEventListener('click', async () => {
    const name = qrNameInput.value.trim();
    const body = qrBodyInput.value.trim();
    if (!name || !body) return alert('Name and body are required.');

    const rows = Array.from(document.querySelectorAll('.qr-row-input'))
      .map(inp => inp.value.trim())
      .filter(v => v.length > 0)
      .map((title, i) => ({ id: `row_${i+1}`, title: title }));

    const payload = {
      societyId: parseInt(societyId),
      name: name,
      type: currentType,
      interactiveType: currentInteractiveType,
      body: body,
      header: qrHeaderInput.value.trim(),
      footer: qrFooterInput.value.trim(),
      listButtonLabel: qrListButtonLabel.value.trim(),
      rowsJson: JSON.stringify(rows)
    };

    btnSaveQr.disabled = true;
    btnSaveQr.textContent = 'Saving...';

    try {
      const url = currentEditingId > 0
        ? `${API_BASE}/api/communication/whatsapp/quick-replies/${currentEditingId}`
        : `${API_BASE}/api/communication/whatsapp/quick-replies`;
      const method = currentEditingId > 0 ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        qrModal.style.display = 'none';
        await loadQuickReplies();
      } else {
        alert('Save failed: ' + (data.message || 'Error'));
      }
    } catch (err) {
      alert('Save network error: ' + err.message);
    } finally {
      btnSaveQr.disabled = false;
      btnSaveQr.textContent = 'Save';
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  await loadQuickReplies();
});
