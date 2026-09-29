// ═══════════════════════════════════════════════════════════
// HENU ERP — WHATSAPP API DELIVERY CONTROL JAVASCRIPT
// Real-time Gateway Monitoring, Outbox Processing & Delivery Verification
// ═══════════════════════════════════════════════════════════

(() => {
  let allLogs = [];
  let filteredLogs = [];

  const getApiBase = () => {
    if (window.CONFIG && window.CONFIG.apiBase) return window.CONFIG.apiBase;
    if (window.APP_CONFIG && window.APP_CONFIG.API_BASE) return window.APP_CONFIG.API_BASE.replace(/\/api\/?$/, '');
    if (typeof window.getApiBaseUrl === 'function') return window.getApiBaseUrl();
    return 'http://localhost:5002';
  };

  const getSocietyId = () => {
    if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
      const aSid = window.Auth.getSocietyId();
      if (aSid && aSid !== '—' && parseInt(aSid, 10) > 0) return parseInt(aSid, 10);
    }
    const sSid = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
    if (sSid && parseInt(sSid, 10) > 0) return parseInt(sSid, 10);
    return 1;
  };

  function toast(msg, ok = true) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, ok ? 'success' : 'error');
    } else {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;padding:10px 20px;font-size:12px;font-weight:700;color:#FFF;border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,0.3);background:' + (ok ? '#2E7D32' : '#C62828') + ';';
      d.textContent = msg;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 3500);
    }
  }

  const init = async () => {
    const sid = getSocietyId();
    const socLabel = document.getElementById('kpiSocietyLabel');
    if (socLabel) socLabel.textContent = `Society #${sid}`;

    bindEvents();
    await loadGatewayInfo();
    await loadOutboxAndLogs();
  };

  const bindEvents = () => {
    document.getElementById('btnRefreshLogs').addEventListener('click', async () => {
      await loadGatewayInfo();
      await loadOutboxAndLogs();
      toast('WhatsApp delivery stream refreshed.', true);
    });

    document.getElementById('btnTriggerOutbox').addEventListener('click', triggerOutboxProcessing);
    document.getElementById('btnSendQuickTest').addEventListener('click', sendQuickTest);

    document.getElementById('filterSearch').addEventListener('input', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
  };

  const loadGatewayInfo = async () => {
    const sid = getSocietyId();
    try {
      const res = await fetch(`${getApiBase()}/api/communication/whatsapp/config?societyId=${sid}`);
      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        document.getElementById('kpiDailyLimit').textContent = `${d.dailyLimit || 1000} / Day`;
        const badge = document.getElementById('gatewayStatusBadge');
        if (d.phoneNumberId && d.isActive) {
          badge.className = 'status-badge active';
          badge.innerHTML = '<i class="bi bi-broadcast"></i> LIVE GATEWAY ACTIVE';
        } else {
          badge.className = 'status-badge failed';
          badge.innerHTML = '<i class="bi bi-exclamation-triangle"></i> GATEWAY INACTIVE';
        }
      }
    } catch (e) {
      console.warn("Could not load gateway status:", e);
    }
  };

  const loadOutboxAndLogs = async () => {
    const sid = getSocietyId();
    const tbody = document.getElementById('outboxTableBody');

    try {
      const [outboxRes, historyRes] = await Promise.all([
        fetch(`${getApiBase()}/api/communication/outbox?societyId=${sid}&channel=WHATSAPP`).then(r => r.json()).catch(() => ({ success: false, data: [] })),
        fetch(`${getApiBase()}/api/communication/history?societyId=${sid}&channel=WHATSAPP`).then(r => r.json()).catch(() => ({ success: false, data: [] }))
      ]);

      const outboxList = (outboxRes.success && Array.isArray(outboxRes.data)) ? outboxRes.data : [];
      const historyList = (historyRes.success && Array.isArray(historyRes.data)) ? historyRes.data : [];

      // Combine logs
      const combined = [...outboxList];
      allLogs = combined;

      // Calculate KPIs
      const sent = allLogs.filter(l => l.status === 'SENT' || l.status === 'DELIVERED').length;
      const queued = allLogs.filter(l => l.status === 'QUEUED' || l.status === 'RETRY').length;
      const failed = allLogs.filter(l => l.status === 'FAILED').length;

      document.getElementById('kpiSentCount').textContent = sent;
      document.getElementById('kpiQueuedCount').textContent = queued;
      document.getElementById('kpiFailedCount').textContent = failed;

      applyFilters();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--danger);">Failed to load activity stream: ${err.message}</td></tr>`;
    }
  };

  const applyFilters = () => {
    const q = document.getElementById('filterSearch').value.trim().toLowerCase();
    const st = document.getElementById('filterStatus').value;

    filteredLogs = allLogs.filter(l => {
      if (st !== 'ALL') {
        if (st === 'SENT' && l.status !== 'SENT' && l.status !== 'DELIVERED') return false;
        if (st === 'QUEUED' && l.status !== 'QUEUED' && l.status !== 'RETRY') return false;
        if (st === 'FAILED' && l.status !== 'FAILED') return false;
      }
      if (q) {
        const recip = (l.recipientAddress || l.recipientName || '').toLowerCase();
        const sub = (l.subject || l.messageBody || '').toLowerCase();
        if (!recip.includes(q) && !sub.includes(q)) return false;
      }
      return true;
    });

    renderTable();
  };

  const renderTable = () => {
    const tbody = document.getElementById('outboxTableBody');
    if (filteredLogs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #6B7280;">No WhatsApp activity found matching the criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredLogs.map((l, idx) => {
      let stBadge = `<span class="status-badge queued">QUEUED</span>`;
      if (l.status === 'SENT' || l.status === 'DELIVERED') {
        stBadge = `<span class="status-badge sent"><i class="bi bi-check-all"></i> SENT</span>`;
      } else if (l.status === 'FAILED') {
        stBadge = `<span class="status-badge failed"><i class="bi bi-x-circle"></i> FAILED</span>`;
      }

      const time = l.sentAt || l.scheduledAt || '-';

      return `
        <tr>
          <td style="font-weight:700; color: #6B7280;">#${l.id || (idx + 1)}</td>
          <td>
            <strong>${l.recipientName || 'Member'}</strong>
            <div style="font-size: 11px; color: #6B7280; font-family: monospace;">${l.recipientAddress}</div>
          </td>
          <td><span style="font-size: 11px; background: #E0F2FE; color: #0369A1; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${l.communicationType || 'DISPATCH'}</span></td>
          <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.subject || l.messageBody || 'WhatsApp Statement'}</td>
          <td style="text-align: center;">${stBadge}</td>
          <td style="font-size: 11px; color: #6B7280;">${time}</td>
          <td style="text-align: center;">
            <button class="btn-act secondary" style="padding: 3px 8px; font-size: 11px;" onclick="retryJob(${l.id})">
              <i class="bi bi-arrow-repeat"></i> Retry
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };

  const triggerOutboxProcessing = async () => {
    const sid = getSocietyId();
    toast('Processing WhatsApp outbox queue...', true);
    try {
      const res = await fetch(`${getApiBase()}/api/communication/outbox/process?societyId=${sid}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        toast(`✅ ${data.message}`, true);
        await loadOutboxAndLogs();
      } else {
        toast(`Outbox error: ${data.message}`, false);
      }
    } catch (e) {
      toast(`Outbox worker error: ${e.message}`, false);
    }
  };

  const sendQuickTest = async () => {
    const sid = getSocietyId();
    const mobile = document.getElementById('quickTestMobile').value.trim();
    const msg = document.getElementById('quickTestMsg').value.trim();

    if (!mobile) {
      toast('Please enter a test mobile number.', false);
      return;
    }

    toast(`Dispatching live WhatsApp to ${mobile}...`, true);
    try {
      const res = await fetch(`${getApiBase()}/api/communication/whatsapp/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societyId: sid,
          recipientMobile: mobile,
          messageText: msg
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(`✅ ${data.message}`, true);
        await loadOutboxAndLogs();
      } else {
        toast(`Test failed: ${data.message}`, false);
      }
    } catch (e) {
      toast(`Error: ${e.message}`, false);
    }
  };

  window.retryJob = async (id) => {
    toast(`Retrying job #${id}...`, true);
    try {
      const res = await fetch(`${getApiBase()}/api/communication/history/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await triggerOutboxProcessing();
      } else {
        toast(`Retry failed: ${data.message}`, false);
      }
    } catch (e) {
      toast(`Retry error: ${e.message}`, false);
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
