// ═══════════════════════════════════════════════════════════
// HENU ERP v2 — Email ID Setting & SMTP Configuration Logic
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await loadEmailConfig();
  await loadEmailHistory();
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

async function loadEmailConfig() {
  const sid = getEffectiveSocietyId();
  const socLabelEl = document.getElementById('metricSocLabel');
  if (socLabelEl) socLabelEl.textContent = `Society #${sid}`;

  try {
    const res = await API.get(`communication/email/config?societyId=${sid}`);
    if (res && res.success && res.data) {
      const d = res.data;
      document.getElementById('providerType').value = d.providerType || 'SMTP';
      document.getElementById('smtpSecure').value = d.smtpSecure || 'STARTTLS';
      document.getElementById('smtpHost').value = d.smtpHost || '';
      document.getElementById('smtpPort').value = d.smtpPort || 587;
      document.getElementById('smtpUsername').value = d.smtpUsername || '';
      document.getElementById('fromEmail').value = d.fromEmail || '';
      document.getElementById('fromName').value = d.fromName || '';
      document.getElementById('replyTo').value = d.replyTo || '';
      document.getElementById('dailyLimit').value = d.dailyLimit || 1000;
      document.getElementById('rateLimit').value = d.rateLimit || 30;

      const pwdInput = document.getElementById('smtpPassword');
      if (d.passwordConfigured) {
        pwdInput.value = '';
        pwdInput.placeholder = '●●●●●●●● (Password Configured - Leave blank to retain)';
      } else {
        pwdInput.value = '';
        pwdInput.placeholder = 'Enter SMTP Password or App Password';
      }

      document.getElementById('metricFromEmail').textContent = d.fromEmail || '—';
      const statusBadge = document.getElementById('metricStatus');
      if (d.smtpHost && d.fromEmail && d.isActive) {
        statusBadge.className = 'status-badge active';
        statusBadge.textContent = 'ACTIVE & READY';
      } else {
        statusBadge.className = 'status-badge inactive';
        statusBadge.textContent = 'NOT CONFIGURED';
      }
    }
  } catch (err) {
    console.error('Failed to load email config:', err);
    showToast('Error loading email configuration: ' + err.message, 'error');
  }
}

async function saveEmailConfig() {
  const sid = getEffectiveSocietyId();
  const host = document.getElementById('smtpHost').value.trim();
  const port = parseInt(document.getElementById('smtpPort').value, 10) || 587;
  const fromE = document.getElementById('fromEmail').value.trim();
  const fromN = document.getElementById('fromName').value.trim();

  if (!host || !fromE || !fromN) {
    showToast('Please fill in SMTP Host, From Email, and Sender Display Name.', 'warning');
    return;
  }

  const payload = {
    societyId: sid,
    providerType: document.getElementById('providerType').value,
    smtpHost: host,
    smtpPort: port,
    smtpSecure: document.getElementById('smtpSecure').value,
    smtpUsername: document.getElementById('smtpUsername').value.trim(),
    smtpPassword: document.getElementById('smtpPassword').value || null,
    fromEmail: fromE,
    fromName: fromN,
    replyTo: document.getElementById('replyTo').value.trim() || null,
    dailyLimit: parseInt(document.getElementById('dailyLimit').value, 10) || 1000,
    rateLimit: parseInt(document.getElementById('rateLimit').value, 10) || 30,
    isActive: true
  };

  const btn = document.getElementById('btnSave');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner"></div> Saving...';

  try {
    const res = await API.post('communication/email/config', payload);
    if (res && res.success) {
      showToast(res.message || 'Email configuration saved successfully!', 'success');
      await loadEmailConfig();
      await loadEmailHistory();
    } else {
      showToast(res.message || 'Failed to save configuration.', 'error');
    }
  } catch (err) {
    console.error('Save email config error:', err);
    showToast('Error saving configuration: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save2-fill"></i> Save Configuration';
  }
}

async function deleteEmailConfig() {
  const sid = getEffectiveSocietyId();
  if (!confirm(`Are you sure you want to reset/clear SMTP email settings for Society #${sid}?`)) return;

  const btn = document.getElementById('btnReset');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner"></div> Resetting...';

  try {
    const res = await API.delete(`communication/email/config?societyId=${sid}`);
    if (res && res.success) {
      showToast('Email configuration has been reset.', 'info');
      document.getElementById('emailConfigForm').reset();
      await loadEmailConfig();
      await loadEmailHistory();
    } else {
      showToast(res.message || 'Failed to reset settings.', 'error');
    }
  } catch (err) {
    console.error('Delete email config error:', err);
    showToast('Error resetting configuration: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-trash-fill"></i> Reset Settings';
  }
}

async function testSmtpConnection() {
  const sid = getEffectiveSocietyId();
  const host = document.getElementById('smtpHost').value.trim();
  const port = parseInt(document.getElementById('smtpPort').value, 10) || 587;

  const btn = document.getElementById('btnTestConn');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner"></div> Testing...';

  try {
    const payload = {
      societyId: sid,
      smtpHost: host,
      smtpPort: port,
      smtpSecure: document.getElementById('smtpSecure').value,
      smtpUsername: document.getElementById('smtpUsername').value.trim(),
      smtpPassword: document.getElementById('smtpPassword').value || null
    };

    const res = await API.post('communication/email/test-connection', payload);
    if (res && res.success) {
      showToast(res.message || 'SMTP Connection Successful!', 'success');
      alert(`✅ SMTP Test Passed:\n\n${res.message}`);
    } else {
      showToast(res.message || 'Connection test failed.', 'error');
      alert(`❌ Connection Test Failed:\n\n${res.message}`);
    }
  } catch (err) {
    console.error('Test connection error:', err);
    showToast('Connection test error: ' + err.message, 'error');
    alert(`❌ Error:\n${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-plug-fill"></i> Test Connection';
  }
}

async function sendTestEmail() {
  const sid = getEffectiveSocietyId();
  const recipient = document.getElementById('testEmailRecipient').value.trim();

  if (!recipient || !recipient.includes('@')) {
    showToast('Please enter a valid recipient email address for the test.', 'warning');
    document.getElementById('testEmailRecipient').focus();
    return;
  }

  const btn = document.getElementById('btnTestSend');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner"></div> Sending...';

  try {
    const payload = {
      societyId: sid,
      recipient: recipient,
      subject: 'HENU ERP — Real-Time Email Delivery Verification',
      message: 'This test verifies active outgoing SMTP configuration from your HENU ERP cooperative housing society accounting instance.'
    };

    const res = await API.post('communication/email/test-send', payload);
    if (res && res.success) {
      showToast(res.message || 'Test email dispatched successfully!', 'success');
      alert(`✅ Email Dispatched:\n\n${res.message}`);
      await loadEmailHistory();
    } else {
      showToast(res.message || 'Failed to send test email.', 'error');
      alert(`❌ Send Error:\n\n${res.message}`);
      await loadEmailHistory();
    }
  } catch (err) {
    console.error('Send test email error:', err);
    showToast('Send error: ' + err.message, 'error');
    alert(`❌ Send Exception:\n${err.message}`);
    await loadEmailHistory();
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send-fill"></i> Send Test Mail';
  }
}

async function loadEmailHistory() {
  const sid = getEffectiveSocietyId();
  const tbody = document.getElementById('emailHistoryBody');
  if (!tbody) return;

  try {
    const res = await API.get(`communication/history?societyId=${sid}&channel=EMAIL`);
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      tbody.innerHTML = res.data.map((item, idx) => {
        let badgeClass = 'inactive';
        if (item.status === 'SENT') badgeClass = 'active';
        else if (item.status === 'FAILED') badgeClass = 'status-failed';
        else if (item.status === 'QUEUED') badgeClass = 'status-queued';

        const statusStyle = item.status === 'SENT' ? 'background:#dcfce7;color:#15803d;font-weight:700;' :
          item.status === 'FAILED' ? 'background:#fee2e2;color:#b91c1c;font-weight:700;' :
          'background:#fef3c7;color:#b45309;font-weight:700;';

        const errorText = item.errorMessage || (item.status === 'SENT' ? 'Delivered via SMTP Gateway (250 OK)' : '—');

        return `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;color:#64748b;">${idx + 1}</td>
            <td style="padding:8px 12px;font-weight:600;white-space:nowrap;">${item.createdAt || '—'}</td>
            <td style="padding:8px 12px;font-family:monospace;">${item.recipient || '—'}</td>
            <td style="padding:8px 12px;"><span style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-size:10px;">${item.communicationType || 'EMAIL'}</span></td>
            <td style="padding:8px 12px;"><span style="padding:2px 8px;border-radius:4px;font-size:10px;${statusStyle}">${item.status}</span></td>
            <td style="padding:8px 12px;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${item.status === 'FAILED' ? '#dc2626' : '#475569'};" title="${errorText}">${errorText}</td>
            <td style="padding:8px 12px;text-align:center;">
              ${item.status === 'FAILED' ? `
                <button type="button" class="btn-top" onclick="retryEmail(${item.id})" style="height:22px;font-size:10px;padding:1px 6px;background:#fff1f2;color:#e11d48;border-color:#fecdd3;" title="Re-queue for immediate dispatch">
                  <i class="bi bi-arrow-repeat"></i> Retry
                </button>
              ` : '<span style="color:#94a3b8;font-size:11px;">—</span>'}
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding:24px;text-align:center;color:#94a3b8;">
            <i class="bi bi-inbox" style="font-size:20px;display:block;margin-bottom:6px;"></i>
            No email dispatch logs recorded for Society #${sid} yet. Send a test email to verify.
          </td>
        </tr>
      `;
    }
  } catch (err) {
    console.error('Failed to load email history:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:16px;text-align:center;color:#ef4444;">
          Failed to load history logs: ${err.message}
        </td>
      </tr>
    `;
  }
}

async function retryEmail(id) {
  try {
    const res = await API.post(`communication/history/${id}/retry`, {});
    if (res && res.success) {
      showToast('Email job re-queued for dispatch.', 'success');
      await loadEmailHistory();
    } else {
      showToast(res.message || 'Failed to retry.', 'error');
    }
  } catch (err) {
    showToast('Retry error: ' + err.message, 'error');
  }
}
