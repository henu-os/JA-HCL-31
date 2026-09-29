// ═══════════════════════════════════════════════════════════
// HENU ERP — WACRM WhatsApp Connection & Configuration Logic
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await loadWhatsAppConfig();
  await loadWhatsAppHistory();
});

function getEffectiveSocietyId() {
  const urlParams = new URLSearchParams(window.location.search);
  const qSid = urlParams.get('societyId') || urlParams.get('sid');
  if (qSid && parseInt(qSid, 10) > 0) return parseInt(qSid, 10);

  if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
    const aSid = window.Auth.getSocietyId();
    if (aSid && parseInt(aSid, 10) > 0) return parseInt(aSid, 10);
  }

  const sSid = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
  if (sSid && parseInt(sSid, 10) > 0) return parseInt(sSid, 10);

  return 2; // Default to HOS/111 or active society
}

function copyToClipboard(elementId, btn) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.value || el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check2" style="color:#059669;"></i>';
    showToast('Copied to clipboard!', 'success');
    setTimeout(() => { btn.innerHTML = origHtml; }, 2000);
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
}

async function loadWhatsAppConfig() {
  const sid = getEffectiveSocietyId();

  try {
    const res = await API.get(`communication/whatsapp/config?societyId=${sid}`);
    if (res && res.success && res.data) {
      const d = res.data;
      document.getElementById('phoneNumberId').value = d.phoneNumberId || '';
      document.getElementById('wabaId').value = d.wabaId || '';
      document.getElementById('webhookVerifyToken').value = d.webhookVerifyToken || 'HENUOS2025';
      document.getElementById('webhookVerifyTokenDisplay').value = d.webhookVerifyToken || 'HENUOS2025';
      if (d.webhookUrl) {
        document.getElementById('webhookUrl').value = d.webhookUrl;
      }
      document.getElementById('defaultLanguage').value = d.defaultLanguage || 'en_US';
      document.getElementById('dailyLimit').value = d.dailyLimit || 1000;

      const tokenInput = document.getElementById('accessToken');
      if (d.tokenConfigured) {
        tokenInput.value = '';
        tokenInput.placeholder = 'Token is hidden for security. Re-enter it to update configuration.';
      } else {
        tokenInput.value = '';
        tokenInput.placeholder = 'Enter Meta System User Permanent Access Token';
      }

      const statusPill = document.getElementById('tokenStatusPill');
      const statusText = document.getElementById('tokenStatusText');
      if (d.phoneNumberId && d.tokenConfigured && d.isActive) {
        statusPill.className = 'status-badge-pill';
        statusText.textContent = 'Credentials valid';
      } else {
        statusPill.className = 'status-badge-pill invalid';
        statusText.textContent = 'Credentials not configured';
      }
    }
  } catch (err) {
    console.error('Failed to load whatsapp config:', err);
    showToast('Error loading WhatsApp configuration: ' + err.message, 'error');
  }
}

async function saveWhatsAppConfig() {
  const sid = getEffectiveSocietyId();
  const phoneId = document.getElementById('phoneNumberId').value.trim();

  if (!phoneId) {
    showToast('Phone Number ID is required.', 'warning');
    document.getElementById('phoneNumberId').focus();
    return;
  }

  const payload = {
    societyId: sid,
    providerType: 'META_CLOUD',
    phoneNumberId: phoneId,
    wabaId: document.getElementById('wabaId').value.trim(),
    accessToken: document.getElementById('accessToken').value || null,
    webhookVerifyToken: document.getElementById('webhookVerifyToken').value.trim() || 'HENUOS2025',
    webhookUrl: document.getElementById('webhookUrl').value.trim(),
    defaultLanguage: document.getElementById('defaultLanguage').value,
    dailyLimit: parseInt(document.getElementById('dailyLimit').value, 10) || 1000,
    rateLimit: 30,
    isActive: true
  };

  const btn = document.getElementById('btnSave');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner" style="width:14px;height:14px;border-width:2px;"></div> Saving...';

  try {
    const res = await API.post('communication/whatsapp/config', payload);
    if (res && res.success) {
      showToast(res.message || 'WhatsApp configuration saved successfully!', 'success');
      await loadWhatsAppConfig();
      await loadWhatsAppHistory();
    } else {
      showToast(res.message || 'Failed to save configuration.', 'error');
    }
  } catch (err) {
    console.error('Save whatsapp config error:', err);
    showToast('Error saving configuration: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check2"></i> Save Configuration';
  }
}

async function testWhatsAppConnection() {
  const sid = getEffectiveSocietyId();
  const phoneId = document.getElementById('phoneNumberId').value.trim();

  const btn = document.getElementById('btnTestConn');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner" style="width:14px;height:14px;border-width:2px;"></div> Testing...';

  try {
    const payload = {
      societyId: sid,
      phoneNumberId: phoneId,
      accessToken: document.getElementById('accessToken').value || null
    };

    const res = await API.post('communication/whatsapp/test-connection', payload);
    if (res && res.success) {
      showToast(res.message || 'Connected to WhatsApp Cloud API!', 'success');
      let detailsMsg = `Verified Name: ${res.details?.verified_name || 'N/A'}\nPhone: ${res.details?.display_phone_number || 'N/A'}\nQuality Rating: ${res.details?.quality_rating || 'GREEN'}`;
      alert(`✅ Meta Cloud API Connection Verified!\n\n${res.message}\n\n${detailsMsg}`);
    } else {
      showToast(res.message || 'Meta API connection failed.', 'error');
      alert(`❌ Meta API Connection Failed:\n\n${res.message}`);
    }
  } catch (err) {
    console.error('Test connection error:', err);
    showToast('Meta API test error: ' + err.message, 'error');
    alert(`❌ Error:\n${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-shield-check"></i> Test Connection';
  }
}

async function sendTestWhatsApp() {
  const sid = getEffectiveSocietyId();
  let mobile = document.getElementById('testMobileNumber').value.trim();

  if (!mobile || mobile.length < 10) {
    showToast('Please enter a valid mobile number for verification test.', 'warning');
    document.getElementById('testMobileNumber').focus();
    return;
  }

  const btn = document.getElementById('btnTestSend');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner" style="width:14px;height:14px;border-width:2px;"></div> Sending...';

  try {
    const payload = {
      societyId: sid,
      recipient: mobile,
      message: 'This test verifies active outgoing WhatsApp Meta Cloud API delivery from HENU ERP.'
    };

    const res = await API.post('communication/whatsapp/test-send', payload);
    if (res && res.success) {
      showToast(res.message || 'WhatsApp message dispatched successfully!', 'success');
      alert(`✅ WhatsApp Dispatched:\n\n${res.message}\nWAMID: ${res.wamid || '—'}`);
      await loadWhatsAppHistory();
    } else {
      showToast(res.message || 'Failed to send WhatsApp message.', 'error');
      alert(`❌ Send Error:\n\n${res.message}`);
      await loadWhatsAppHistory();
    }
  } catch (err) {
    console.error('Send test WhatsApp error:', err);
    showToast('Send error: ' + err.message, 'error');
    alert(`❌ Send Exception:\n${err.message}`);
    await loadWhatsAppHistory();
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-whatsapp"></i> Send Test Message';
  }
}

async function loadWhatsAppHistory() {
  const sid = getEffectiveSocietyId();
  const tbody = document.getElementById('waHistoryBody');
  if (!tbody) return;

  try {
    const res = await API.get(`communication/history?societyId=${sid}&channel=WHATSAPP`);
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      tbody.innerHTML = res.data.map((item, idx) => {
        let statusStyle = 'background:#fef3c7;color:#b45309;font-weight:700;';
        if (item.status === 'SENT' || item.status === 'DELIVERED' || item.status === 'READ') {
          statusStyle = 'background:#dcfce7;color:#15803d;font-weight:700;';
        } else if (item.status === 'FAILED') {
          statusStyle = 'background:#fee2e2;color:#b91c1c;font-weight:700;';
        }

        const logDetails = item.providerMessageId ? `WAMID: ${item.providerMessageId}` : (item.errorMessage || '—');

        return `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 14px;color:#64748b;">${idx + 1}</td>
            <td style="padding:10px 14px;font-weight:600;white-space:nowrap;">${item.createdAt || '—'}</td>
            <td style="padding:10px 14px;font-family:ui-monospace,monospace;">${item.recipient || '—'}</td>
            <td style="padding:10px 14px;"><span style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-size:10.5px;font-weight:600;">${item.communicationType || 'WHATSAPP'}</span></td>
            <td style="padding:10px 14px;"><span style="padding:3px 8px;border-radius:4px;font-size:10.5px;${statusStyle}">${item.status}</span></td>
            <td style="padding:10px 14px;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,monospace;font-size:11.5px;color:${item.status === 'FAILED' ? '#dc2626' : '#475569'};" title="${logDetails}">${logDetails}</td>
            <td style="padding:10px 14px;text-align:center;">
              ${item.status === 'FAILED' ? `
                <button type="button" class="wacrm-btn wacrm-btn-secondary" onclick="retryWhatsApp(${item.id})" style="height:24px;font-size:11px;padding:2px 8px;color:#dc2626;border-color:#fecaca;" title="Re-queue for immediate dispatch">
                  <i class="bi bi-arrow-repeat"></i> Retry
                </button>
              ` : '<span style="color:#94a3b8;font-size:12px;">—</span>'}
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty-cell">
            <i class="bi bi-chat-dots" style="font-size:22px;display:block;margin-bottom:8px;color:#cbd5e1;"></i>
            No WhatsApp dispatch logs recorded for Society #${sid} yet. Send a test message to verify.
          </td>
        </tr>
      `;
    }
  } catch (err) {
    console.error('Failed to load whatsapp history:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:16px;text-align:center;color:#ef4444;">
          Failed to load history logs: ${err.message}
        </td>
      </tr>
    `;
  }
}

async function retryWhatsApp(id) {
  try {
    const res = await API.post(`communication/history/${id}/retry`, {});
    if (res && res.success) {
      showToast('WhatsApp job re-queued for dispatch.', 'success');
      await loadWhatsAppHistory();
    } else {
      showToast(res.message || 'Failed to retry.', 'error');
    }
  } catch (err) {
    showToast('Retry error: ' + err.message, 'error');
  }
}
