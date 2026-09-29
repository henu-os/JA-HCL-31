// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — WhatsApp Shared Inbox Controller (WACRM)
// ═══════════════════════════════════════════════════════════

const WhatsAppInbox = (() => {
  let activeSocietyId = 1;
  let activeConversationId = null;
  let activeConversationData = null;
  let currentFilter = "ALL";
  let searchTimeout = null;
  let signalRConnection = null;
  let availableTemplates = [];
  let availableQuickReplies = [];
  let selectedTemplate = null;

  const API_BASE = "http://localhost:5002";
  const token = localStorage.getItem("token") || "";

  // ── INIT ──────────────────────────────────────────────────
  async function init() {
    loadSocietyContext();
    bindEvents();
    await initSignalR();
    await loadConversations();
    await loadTemplates();
    await loadQuickReplies();
  }

  function loadSocietyContext() {
    try {
      const storedId = localStorage.getItem("current_society_id") || "1";
      activeSocietyId = parseInt(storedId) || 1;
    } catch { }
  }

  // ── REAL-TIME SIGNALR ─────────────────────────────────────
  async function initSignalR() {
    if (typeof signalR === "undefined") return;

    try {
      signalRConnection = new signalR.HubConnectionBuilder()
        .withUrl(`${API_BASE}/hubs/communication`, {
          accessTokenFactory: () => token
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000])
        .build();

      signalRConnection.on("WhatsAppMessageReceived", (data) => {
        if (activeConversationId && (data.conversationId === activeConversationId || data.conversation_id === activeConversationId)) {
          appendMessageToThread(data);
          scrollToBottom();
          markActiveRead();
        }
        loadConversations();
      });

      signalRConnection.on("WhatsAppMessageSent", (data) => {
        if (activeConversationId && (data.conversationId === activeConversationId || data.conversation_id === activeConversationId)) {
          updateMessageStatus(data.messageId || data.id, "SENT", data.wamid);
        }
        loadConversations();
      });

      signalRConnection.on("WhatsAppMessageDelivered", (data) => {
        if (activeConversationId) {
          updateMessageStatus(data.messageId || data.id, "DELIVERED", data.wamid);
        }
      });

      signalRConnection.on("WhatsAppMessageRead", (data) => {
        if (activeConversationId) {
          updateMessageStatus(data.messageId || data.id, "READ", data.wamid);
        }
      });

      signalRConnection.on("WhatsAppMessageFailed", (data) => {
        if (activeConversationId) {
          updateMessageStatus(data.messageId || data.id, "FAILED", null, data.error);
        }
      });

      signalRConnection.on("WhatsAppConversationUpdated", () => loadConversations());

      await signalRConnection.start();
      await signalRConnection.invoke("JoinSociety", activeSocietyId);
    } catch (err) {
      console.warn("[WhatsAppInbox] SignalR notice:", err);
    }
  }

  // ── CONVERSATIONS LIST ────────────────────────────────────
  async function loadConversations() {
    const spinner = document.getElementById("convLoadingSpinner");
    const emptyState = document.getElementById("convEmptyState");
    const container = document.getElementById("conversationsListContainer");
    const searchVal = document.getElementById("convSearchInput")?.value?.trim() || "";

    try {
      let url = `${API_BASE}/api/communication/whatsapp/conversations?societyId=${activeSocietyId}`;
      if (searchVal) url += `&search=${encodeURIComponent(searchVal)}`;

      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const json = await res.json();

      if (spinner) spinner.style.display = "none";

      if (!json.success || !Array.isArray(json.data)) {
        if (emptyState) emptyState.style.display = "block";
        return;
      }

      let convs = json.data;

      // Filter in-memory
      if (currentFilter === "UNREAD") {
        convs = convs.filter(c => (c.unread_count || 0) > 0);
      } else if (currentFilter === "OPEN" || currentFilter === "PENDING" || currentFilter === "CLOSED") {
        convs = convs.filter(c => (c.status || "OPEN").toUpperCase() === currentFilter);
      }

      if (convs.length === 0) {
        if (emptyState) emptyState.style.display = "block";
        const items = container.querySelectorAll(".conv-item");
        items.forEach(el => el.remove());
        return;
      }

      if (emptyState) emptyState.style.display = "none";
      renderConversationList(convs);
    } catch (err) {
      console.error("[WhatsAppInbox] Error loading conversations:", err);
      if (spinner) spinner.style.display = "none";
    }
  }

  function renderConversationList(convs) {
    const container = document.getElementById("conversationsListContainer");
    const existingItems = container.querySelectorAll(".conv-item");
    existingItems.forEach(el => el.remove());

    convs.forEach(c => {
      const item = document.createElement("div");
      item.className = `conv-item ${c.id === activeConversationId ? "active" : ""}`;
      item.setAttribute("data-id", c.id);
      item.onclick = () => selectConversation(c.id, c);

      const contactName = c.contact_name || c.phone_number || "Contact";
      const initial = (contactName.charAt(0) || "S").toUpperCase();
      const timeStr = formatRelativeTime(c.last_message_at || c.updated_at || c.created_at);

      const st = (c.status || "OPEN").toLowerCase();

      item.innerHTML = `
        <div class="conv-avatar">${initial}</div>
        <div class="conv-info">
          <div class="conv-top-row">
            <span class="conv-name" title="${escapeHtml(contactName)}">${escapeHtml(contactName)}</span>
            <span class="conv-time">${timeStr}</span>
          </div>
          <div class="conv-bottom-row">
            <span class="conv-preview" title="${escapeHtml(c.last_message || '')}">${escapeHtml(c.last_message || 'No messages yet')}</span>
            <span class="conv-status-dot ${st}"></span>
          </div>
        </div>
      `;

      container.appendChild(item);
    });
  }

  // ── SELECT CONVERSATION ───────────────────────────────────
  async function selectConversation(convId, convData) {
    activeConversationId = convId;
    activeConversationData = convData;

    document.querySelectorAll(".conv-item").forEach(el => {
      el.classList.toggle("active", el.getAttribute("data-id") == convId);
    });

    document.getElementById("chatPlaceholder").style.display = "none";
    document.getElementById("chatActiveContainer").style.display = "flex";

    const name = convData.contact_name || convData.phone_number || "Contact";
    document.getElementById("activeContactName").innerText = name;
    document.getElementById("activeContactAvatar").innerText = (name.charAt(0) || "S").toUpperCase();
    document.getElementById("activeContactPhone").innerText = convData.phone_number || "";

    const st = (convData.status || "OPEN").toUpperCase();
    const stSelect = document.getElementById("activeStatusSelect");
    if (stSelect) stSelect.value = st;

    await loadMessages(convId);

    if (convData.unread_count > 0) {
      markActiveRead();
    }
  }

  // ── MESSAGES THREAD ───────────────────────────────────────
  async function loadMessages(convId) {
    const thread = document.getElementById("chatMessagesContainer");
    thread.innerHTML = `<div class="inbox-loading"><i class="bi bi-arrow-repeat spin-icon"></i> Loading thread...</div>`;

    try {
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/conversations/${convId}/messages`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const json = await res.json();

      thread.innerHTML = "";

      if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
        thread.innerHTML = `
          <div class="no-messages-thread-placeholder">
            <div class="notice-title">No messages yet</div>
            <div class="notice-sub">Send a template to start the conversation</div>
          </div>
        `;
        return;
      }

      json.data.forEach(msg => appendMessageToThread(msg));
      scrollToBottom();
    } catch (err) {
      console.error("[WhatsAppInbox] Error loading messages:", err);
      thread.innerHTML = `<div class="inbox-loading text-danger">Error loading messages: ${escapeHtml(err.message)}</div>`;
    }
  }

  function appendMessageToThread(msg) {
    const thread = document.getElementById("chatMessagesContainer");
    if (!thread) return;

    const emptyNotice = thread.querySelector(".no-messages-thread-placeholder");
    if (emptyNotice) emptyNotice.remove();
    const loading = thread.querySelector(".inbox-loading");
    if (loading) loading.remove();

    const isInbound = (msg.direction || "OUTBOUND").toUpperCase() === "INBOUND";
    const msgDiv = document.createElement("div");
    msgDiv.className = `msg-bubble-wrap ${isInbound ? "inbound" : "outbound"}`;
    msgDiv.setAttribute("data-msg-id", msg.id || "");

    let tickHtml = "";
    if (!isInbound) {
      const st = (msg.status || "SENT").toUpperCase();
      if (st === "QUEUED") tickHtml = `<i class="bi bi-hourglass-split tick-sent" title="Queued"></i>`;
      else if (st === "SENT") tickHtml = `<i class="bi bi-check tick-sent" title="Sent (✓)"></i>`;
      else if (st === "DELIVERED") tickHtml = `<i class="bi bi-check-all tick-delivered" title="Delivered (✓✓)"></i>`;
      else if (st === "READ") tickHtml = `<i class="bi bi-check-all tick-read" title="Read (✓✓ Blue)"></i>`;
      else if (st === "FAILED") tickHtml = `<i class="bi bi-exclamation-triangle-fill tick-failed" title="Failed"></i>`;
    }

    const timeStr = formatTimeOnly(msg.created_at || new Date().toISOString());

    let docHtml = "";
    if (msg.message_type === "DOCUMENT" || msg.media_url) {
      docHtml = `
        <div class="doc-attachment-card">
          <i class="bi bi-file-earmark-pdf-fill doc-icon-large"></i>
          <div>
            <strong>${escapeHtml(msg.filename || "Society Statement.pdf")}</strong>
            <div style="font-size: 10px; color: #64748b;">Official ERP Document</div>
          </div>
        </div>
      `;
    }

    msgDiv.innerHTML = `
      <div class="msg-bubble">
        ${docHtml}
        <div class="msg-body">${escapeHtml(msg.body || '')}</div>
        <div class="msg-meta">
          <span>${timeStr}</span>
          ${tickHtml}
        </div>
      </div>
    `;

    thread.appendChild(msgDiv);
  }

  function updateMessageStatus(msgId, status, wamid, error) {
    const thread = document.getElementById("chatMessagesContainer");
    if (!thread) return;

    const bubble = thread.querySelector(`[data-msg-id="${msgId}"]`);
    if (!bubble) return;

    const meta = bubble.querySelector(".msg-meta");
    if (!meta) return;

    let tickHtml = "";
    if (status === "SENT") tickHtml = `<i class="bi bi-check tick-sent" title="Sent (✓)"></i>`;
    else if (status === "DELIVERED") tickHtml = `<i class="bi bi-check-all tick-delivered" title="Delivered (✓✓)"></i>`;
    else if (status === "READ") tickHtml = `<i class="bi bi-check-all tick-read" title="Read (✓✓ Blue)"></i>`;
    else if (status === "FAILED") tickHtml = `<i class="bi bi-exclamation-triangle-fill tick-failed" title="Failed: ${escapeHtml(error || '')}"></i>`;

    const timeSpan = meta.querySelector("span");
    const timeStr = timeSpan ? timeSpan.innerText : "";
    meta.innerHTML = `<span>${timeStr}</span> ${tickHtml}`;
  }

  // ── SEND OUTBOUND MESSAGE ─────────────────────────────────
  async function sendMessage() {
    if (!activeConversationId) return;

    const textarea = document.getElementById("composerTextInput");
    const text = textarea?.value?.trim();
    if (!text) return;

    textarea.value = "";

    try {
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          society_id: activeSocietyId,
          message_type: "TEXT",
          body: text
        })
      });

      const json = await res.json();
      if (json.success && json.data) {
        appendMessageToThread(json.data);
        scrollToBottom();
      } else {
        alert("Failed to send message: " + (json.message || "Unknown error"));
      }
    } catch (err) {
      alert("Error sending message: " + err.message);
    }
  }

  // ── MARK READ ─────────────────────────────────────────────
  async function markActiveRead() {
    if (!activeConversationId) return;
    try {
      await fetch(`${API_BASE}/api/communication/whatsapp/conversations/${activeConversationId}/read`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
    } catch { }
  }

  // ── QUICK REPLIES ─────────────────────────────────────────
  async function loadQuickReplies() {
    try {
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/quick-replies?societyId=${activeSocietyId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        availableQuickReplies = json.data;
        renderQuickRepliesPopover();
      }
    } catch (err) {
      console.error("[WhatsAppInbox] Error loading quick replies:", err);
    }
  }

  function renderQuickRepliesPopover() {
    const popList = document.getElementById("qrPopoverList");
    if (!popList) return;

    if (availableQuickReplies.length === 0) {
      popList.innerHTML = `<div class="p-2 text-muted small">No quick replies created yet.</div>`;
      return;
    }

    popList.innerHTML = availableQuickReplies.map(qr => `
      <div class="qr-pop-item" onclick="WhatsAppInbox.insertQuickReply('${escapeHtml(qr.body.replace(/'/g, "\\'"))}')">
        <div class="qr-pop-name">${escapeHtml(qr.name)}</div>
        <div class="qr-pop-snippet">${escapeHtml(qr.body)}</div>
      </div>
    `).join('');
  }

  function insertQuickReply(text) {
    const textarea = document.getElementById("composerTextInput");
    if (textarea) {
      textarea.value = text;
      textarea.focus();
    }
    const pop = document.getElementById("qrPopover");
    if (pop) pop.style.display = "none";
  }

  // ── TEMPLATES MODAL ───────────────────────────────────────
  async function loadTemplates() {
    try {
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/templates?societyId=${activeSocietyId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        availableTemplates = json.data.filter(t => (t.status || "").toUpperCase() === "APPROVED");
        renderTemplateModalList();
      }
    } catch (err) {
      console.error("[WhatsAppInbox] Error loading templates:", err);
    }
  }

  function renderTemplateModalList() {
    const listContainer = document.getElementById("templateModalList");
    if (!listContainer) return;

    if (availableTemplates.length === 0) {
      listContainer.innerHTML = `<div class="text-muted small p-2">No approved Meta templates found.</div>`;
      return;
    }

    listContainer.innerHTML = availableTemplates.map(t => `
      <div class="tmpl-option-card" onclick="WhatsAppInbox.selectTemplate(${t.id})">
        <div class="tmpl-option-name">${escapeHtml(t.meta_template_name || t.template_name)}</div>
        <div class="tmpl-option-cat">${escapeHtml(t.category || 'UTILITY')} • ${escapeHtml(t.language || 'en_US')}</div>
      </div>
    `).join('');
  }

  function selectTemplate(tmplId) {
    const tmpl = availableTemplates.find(t => t.id === tmplId);
    if (!tmpl) return;

    selectedTemplate = tmpl;
    document.querySelectorAll(".tmpl-option-card").forEach(el => el.classList.remove("selected"));
    event.currentTarget?.classList.add("selected");

    const bubble = document.getElementById("templatePreviewBubble");
    const varsBox = document.getElementById("templateVariablesBox");
    const varsList = document.getElementById("resolvedVarsList");
    const btnSend = document.getElementById("btnConfirmSendTemplate");

    if (bubble) bubble.innerText = tmpl.body || "";
    if (btnSend) btnSend.disabled = false;

    const varMatches = (tmpl.body || "").match(/{{\s*(\w+)\s*}}/g) || [];
    if (varMatches.length > 0 && varsBox && varsList) {
      varsBox.style.display = "block";
      varsList.innerHTML = varMatches.map(v => `
        <li style="font-size: 11px; margin-bottom: 2px;">
          <code>${v}</code> &rarr; <strong>${activeConversationData?.contact_name || 'Member'}</strong>
        </li>
      `).join('');
    } else if (varsBox) {
      varsBox.style.display = "none";
    }
  }

  async function sendSelectedTemplate() {
    if (!selectedTemplate || !activeConversationId || !activeConversationData) return;

    const phone = activeConversationData.phone_number;
    if (!phone) return alert("Recipient phone number missing.");

    const btn = document.getElementById("btnConfirmSendTemplate");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="bi bi-arrow-repeat spin-icon"></i> Sending...`;
    }

    try {
      const res = await fetch(`${API_BASE}/api/communication/whatsapp/send/template`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          societyId: activeSocietyId,
          phoneNumber: phone,
          templateName: selectedTemplate.meta_template_name || selectedTemplate.template_name,
          languageCode: selectedTemplate.language || "en_US",
          parameters: [activeConversationData.contact_name || "Member"]
        })
      });

      const text = await res.text();
      let json = {};
      try { json = JSON.parse(text); } catch { }

      document.getElementById("templatePickerModal").style.display = "none";

      if (res.ok && json.success) {
        alert("Template message dispatched live via Meta Cloud API!");
        loadMessages(activeConversationId);
      } else {
        alert("Failed to send template: " + (json.message || text || "Meta API Error"));
      }
    } catch (err) {
      alert("Error sending template: " + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-whatsapp me-1"></i> Send Template Message`;
      }
    }
  }

  // ── ATTACHMENT MODAL & SENDER ─────────────────────────────
  async function sendSelectedDocument() {
    if (!activeConversationId || !activeConversationData) return;

    const docType = document.querySelector('input[name="docTypeRadio"]:checked')?.value || "BILL_FORMAT";
    const caption = document.getElementById("attachCaptionInput")?.value || "";
    const memberId = activeConversationData.member_id || 0;

    const btn = document.getElementById("btnConfirmSendDoc");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="bi bi-arrow-repeat spin-icon"></i> Generating PDF...`;
    }

    try {
      const res = await fetch(`${API_BASE}/api/communication/member/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          societyId: activeSocietyId,
          channel: "WHATSAPP",
          communicationType: docType,
          memberIds: [memberId],
          customMessage: caption
        })
      });

      const json = await res.json();
      document.getElementById("attachmentModal").style.display = "none";

      if (json.success) {
        alert("Official Statement PDF generated from member ledger and dispatched to WhatsApp.");
        loadMessages(activeConversationId);
      } else {
        alert("Failed to dispatch document: " + (json.message || "Error"));
      }
    } catch (err) {
      alert("Error generating document: " + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-send-fill me-1"></i> Generate &amp; Dispatch PDF`;
      }
    }
  }

  // ── HELPERS & EVENTS ──────────────────────────────────────
  function bindEvents() {
    const searchInput = document.getElementById("convSearchInput");
    const clearBtn = document.getElementById("btnClearSearch");

    searchInput?.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      if (clearBtn) clearBtn.style.display = e.target.value ? "block" : "none";
      searchTimeout = setTimeout(loadConversations, 300);
    });

    clearBtn?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      clearBtn.style.display = "none";
      loadConversations();
    });

    document.getElementById("statusFilterSelect")?.addEventListener("change", (e) => {
      currentFilter = e.target.value;
      loadConversations();
    });

    // Composer send
    document.getElementById("btnSendMessage")?.addEventListener("click", sendMessage);
    document.getElementById("composerTextInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Quick Replies Popover Toggle
    const qrPop = document.getElementById("qrPopover");
    document.getElementById("btnQuickRepliesToggle")?.addEventListener("click", () => {
      if (qrPop) qrPop.style.display = qrPop.style.display === "none" ? "flex" : "none";
    });
    document.getElementById("btnCloseQrPop")?.addEventListener("click", () => {
      if (qrPop) qrPop.style.display = "none";
    });

    // AI Draft reply simulation
    document.getElementById("btnAiDraft")?.addEventListener("click", () => {
      const textarea = document.getElementById("composerTextInput");
      if (textarea) {
        textarea.value = "Namaste! Thank you for reaching out to the society office. We have received your query and will update you shortly.";
        textarea.focus();
      }
    });

    // Template Modal
    const tmplModal = document.getElementById("templatePickerModal");
    document.getElementById("btnOpenTemplateModal")?.addEventListener("click", () => {
      if (tmplModal) tmplModal.style.display = "flex";
    });
    document.getElementById("btnQuickTemplate")?.addEventListener("click", () => {
      if (tmplModal) tmplModal.style.display = "flex";
    });
    document.getElementById("btnCloseTemplateModal")?.addEventListener("click", () => {
      if (tmplModal) tmplModal.style.display = "none";
    });
    document.getElementById("btnCancelTemplateModal")?.addEventListener("click", () => {
      if (tmplModal) tmplModal.style.display = "none";
    });
    document.getElementById("btnConfirmSendTemplate")?.addEventListener("click", sendSelectedTemplate);

    // Attachment Modal
    const attachModal = document.getElementById("attachmentModal");
    document.getElementById("btnOpenAttachModal")?.addEventListener("click", () => {
      if (attachModal) attachModal.style.display = "flex";
    });
    document.getElementById("btnAttachDoc")?.addEventListener("click", () => {
      if (attachModal) attachModal.style.display = "flex";
    });
    document.getElementById("btnCloseAttachModal")?.addEventListener("click", () => {
      if (attachModal) attachModal.style.display = "none";
    });
    document.getElementById("btnCancelAttachModal")?.addEventListener("click", () => {
      if (attachModal) attachModal.style.display = "none";
    });
    document.getElementById("btnConfirmSendDoc")?.addEventListener("click", sendSelectedDocument);

    document.getElementById("btnRefreshThread")?.addEventListener("click", () => {
      if (activeConversationId) loadMessages(activeConversationId);
    });
  }

  function scrollToBottom() {
    const container = document.getElementById("chatMessagesContainer");
    if (container) {
      setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
    }
  }

  function formatRelativeTime(dtStr) {
    if (!dtStr) return "";
    try {
      const d = new Date(dtStr);
      const now = new Date();
      const diffMs = now - d;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (diffDays === 1) {
        return "yesterday";
      } else if (diffDays < 30) {
        return `${diffDays} days`;
      } else {
        const months = Math.floor(diffDays / 30);
        return `about ${months} months`;
      }
    } catch {
      return dtStr;
    }
  }

  function formatTimeOnly(dtStr) {
    if (!dtStr) return "";
    try {
      const d = new Date(dtStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dtStr;
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return {
    init,
    selectConversation,
    selectTemplate,
    insertQuickReply
  };
})();

document.addEventListener("DOMContentLoaded", WhatsAppInbox.init);
