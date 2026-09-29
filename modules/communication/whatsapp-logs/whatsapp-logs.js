// WhatsApp Logs Controller
document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE = 'http://localhost:5002';
  const token = localStorage.getItem('token') || '';
  const societyId = localStorage.getItem('current_society_id') || '1';
  const societyName = localStorage.getItem('current_society_name') || 'Society #' + societyId;

  const statSocLabel = document.getElementById('statSocLabel');
  const statTotalLogs = document.getElementById('statTotalLogs');
  const logsTableBody = document.getElementById('logsTableBody');
  const searchFilter = document.getElementById('searchFilter');
  const statusFilter = document.getElementById('statusFilter');
  const typeFilter = document.getElementById('typeFilter');
  const directionFilter = document.getElementById('directionFilter');
  const logCountBadge = document.getElementById('logCountBadge');
  const btnRefreshLogs = document.getElementById('btnRefreshLogs');
  const btnExportLogs = document.getElementById('btnExportLogs');

  if (statSocLabel) statSocLabel.textContent = societyName;

  let allLogs = [];

  async function loadLogs() {
    try {
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/logs?societyId=${societyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          allLogs = data.data;
          statTotalLogs.textContent = allLogs.length;
          renderLogs();
        }
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
      logsTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Error loading logs: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderLogs() {
    const q = searchFilter.value.toLowerCase().trim();
    const st = statusFilter.value;
    const tp = typeFilter.value;
    const dir = directionFilter.value;

    const filtered = allLogs.filter(l => {
      if (st && l.status !== st) return false;
      if (tp && l.message_type !== tp) return false;
      if (dir && l.direction !== dir) return false;
      if (q) {
        const matchRecip = (l.phone_number || '').toLowerCase().includes(q) || (l.member_name || '').toLowerCase().includes(q);
        const matchBody = (l.body || '').toLowerCase().includes(q) || (l.template_name || '').toLowerCase().includes(q);
        const matchWamid = (l.whatsapp_message_id || '').toLowerCase().includes(q);
        if (!matchRecip && !matchBody && !matchWamid) return false;
      }
      return true;
    });

    logCountBadge.textContent = `Showing ${filtered.length} of ${allLogs.length} records`;

    if (filtered.length === 0) {
      logsTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4" style="color: #64748b;">No WhatsApp dispatch records found.</td></tr>`;
      return;
    }

    logsTableBody.innerHTML = filtered.map(l => {
      const timeStr = l.created_at ? new Date(l.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' }) : '—';
      const isInbound = l.direction === 'INBOUND';
      const dirBadge = isInbound
        ? `<span class="dir-badge inbound"><i class="bi bi-arrow-down-left"></i> INBOUND</span>`
        : `<span class="dir-badge outbound"><i class="bi bi-arrow-up-right"></i> OUTBOUND</span>`;

      let stClass = 'queued';
      let stIcon = 'bi-hourglass-split';
      let stLabel = l.status;
      if (l.status === 'SENT') { stClass = 'sent'; stIcon = 'bi-check'; stLabel = 'SENT (✓)'; }
      else if (l.status === 'DELIVERED') { stClass = 'delivered'; stIcon = 'bi-check-all'; stLabel = 'DELIVERED (✓✓)'; }
      else if (l.status === 'READ') { stClass = 'read'; stIcon = 'bi-check-all'; stLabel = 'READ (✓✓)'; }
      else if (l.status === 'FAILED') { stClass = 'failed'; stIcon = 'bi-exclamation-triangle-fill'; stLabel = 'FAILED'; }

      const stPill = `<span class="status-pill ${stClass}"><i class="bi ${stIcon}"></i> ${stLabel}</span>`;

      return `
        <tr>
          <td style="font-family: monospace; font-size: 11px; color: #475569;">${timeStr}</td>
          <td>${dirBadge}</td>
          <td>
            <div style="font-weight: 700; color: #1e293b;">${escapeHtml(l.member_name || 'Contact')}</div>
            <div style="font-family: monospace; font-size: 10.5px; color: #64748b;">${escapeHtml(l.phone_number || '')}</div>
          </td>
          <td><span class="erp-badge erp-badge-info">${l.message_type || 'TEXT'}</span></td>
          <td style="max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.body || l.template_name || '')}">
            ${l.template_name ? `<span class="template-tag"><i class="bi bi-layout-text-window me-1"></i>${escapeHtml(l.template_name)}</span>` : ''}
            <span>${escapeHtml(l.body || '')}</span>
          </td>
          <td style="text-align: center;">${stPill}</td>
          <td style="font-family: monospace; font-size: 10px; color: #64748b; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.whatsapp_message_id || '')}">
            ${escapeHtml(l.whatsapp_message_id || '—')}
          </td>
          <td style="font-size: 10.5px; color: #dc2626; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.error_message || '')}">
            ${escapeHtml(l.error_message || '—')}
          </td>
        </tr>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  searchFilter.addEventListener('input', renderLogs);
  statusFilter.addEventListener('change', renderLogs);
  typeFilter.addEventListener('change', renderLogs);
  directionFilter.addEventListener('change', renderLogs);
  btnRefreshLogs.addEventListener('click', loadLogs);

  btnExportLogs.addEventListener('click', () => {
    if (allLogs.length === 0) return alert('No logs to export');
    const headers = ['Time', 'Direction', 'Recipient', 'Phone', 'Type', 'Template', 'Message', 'Status', 'MetaMessageID', 'Error'];
    const rows = allLogs.map(l => [
      l.created_at,
      l.direction,
      l.member_name || '',
      l.phone_number || '',
      l.message_type || '',
      l.template_name || '',
      `"${(l.body || '').replace(/"/g, '""')}"`,
      l.status,
      l.whatsapp_message_id || '',
      `"${(l.error_message || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `whatsapp_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // SignalR live update
  try {
    if (window.signalR) {
      const connection = new signalR.HubConnectionBuilder()
        .withUrl(`${API_BASE}/hubs/communication`, {
          accessTokenFactory: () => token
        })
        .withAutomaticReconnect()
        .build();

      connection.on('WhatsAppMessageReceived', () => loadLogs());
      connection.on('WhatsAppMessageSent', () => loadLogs());
      connection.on('WhatsAppMessageDelivered', () => loadLogs());
      connection.on('WhatsAppMessageRead', () => loadLogs());
      connection.on('WhatsAppMessageFailed', () => loadLogs());

      await connection.start();
      await connection.invoke('JoinSociety', parseInt(societyId));
    }
  } catch (err) {
    console.warn('SignalR initialization note:', err.message);
  }

  await loadLogs();
});
