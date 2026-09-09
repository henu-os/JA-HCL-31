// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — WORKSPACE MANAGER
// Full Accordion Sidebar & Top Bar Sync (Matching Screenshot)
// ═══════════════════════════════════════════════════════════

const WorkspaceManager = (() => {

  const CATEGORIES = [
    { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-1x2-fill', hasSub: false },
    { id: 'master', label: 'Masters', icon: 'bi-grid-3x3-gap-fill', hasSub: true },
    { id: 'transaction', label: 'Transactions', icon: 'bi-lightning-charge-fill', hasSub: true },
    { id: 'member-report', label: 'Member Reports', icon: 'bi-people-fill', hasSub: true },
    { id: 'account-report', label: 'Account Reports', icon: 'bi-file-earmark-text-fill', hasSub: true },
    { id: 'additional-report', label: 'Additional Reports', icon: 'bi-file-earmark-diff-fill', hasSub: true },
    { id: 'utility', label: 'Utilities', icon: 'bi-tools', hasSub: true },
    { id: 'communication', label: 'Communication', icon: 'bi-envelope-fill', hasSub: true },
    { id: 'billing-utility', label: 'Billing Utilities', icon: 'bi-receipt-cutoff', hasSub: true },
    { id: 'statutory', label: 'Statutory', icon: 'bi-journal-bookmark-fill', hasSub: true },
    { id: 'admin', label: 'Admin', icon: 'bi-gear-fill', hasSub: true },
    { id: 'help', label: 'Help & Documentation', icon: 'bi-question-circle-fill', hasSub: false }
  ];

  const MODULES = [
    // MASTERS
    { id: 'society-master', label: 'Society Master', category: 'master', path: 'modules/master/society-master/society-master.html' },
    { id: 'group-master', label: 'Group Master', category: 'master', path: 'modules/master/group-master/group-master.html' },
    { id: 'account-master', label: 'Account Master', category: 'master', path: 'modules/master/account-master/account-master.html' },
    { id: 'member-master', label: 'Member Master', category: 'master', path: 'modules/master/member-master/member-master.html' },
    { id: 'bill-type-master', label: 'Bill Type & Notes Master', category: 'master', path: 'modules/master/bill-type-master/bill-type-master.html' },
    { id: 'billing-master', label: 'Billing Master', category: 'master', path: 'modules/master/billing-master/billing-master.html' },
    { id: 'opening-bank-reco', label: 'Opening Bank Reco', category: 'master', path: 'modules/master/opening-bank-reco/opening-bank-reco.html' },
    { id: 'opening-balances', label: 'Opening Balances', category: 'master', path: 'modules/master/opening-balances/opening-balances.html' },
    { id: 'bill-print-setup', label: 'Bill Print Setup', category: 'master', path: 'modules/master/bill-print-setup/bill-print-setup.html' },
    { id: 'gst-master', label: 'GST Master', category: 'master', path: 'modules/master/gst-master/gst-master.html' },
    { id: 'committee-master', label: 'Committee Master', category: 'master', path: 'modules/master/committee-master/committee-master.html' },
    { id: 'staff-master', label: 'Staff Master', category: 'master', path: 'modules/master/staff-master/staff-master.html' },
    { id: 'vendor-master', label: 'Vendor Master', category: 'master', path: 'modules/master/vendor-master/vendor-master.html' },
    { id: 'config-notes-master', label: 'Configuration & Notes Master', category: 'master', path: 'modules/master/config-notes-master/config-notes-master.html' },

    // TRANSACTIONS
    { id: 'member-bill', label: 'Bill / Invoice Generation', category: 'transaction', path: 'modules/transaction/member-bill/member-bill.html' },
    { id: 'member-receipt', label: 'Member Receipt Entry', category: 'transaction', path: 'modules/transaction/member-receipt/member-receipt.html' },
    { id: 'receipt-reversal', label: 'Member Receipt Reversal', category: 'transaction', path: 'modules/transaction/receipt-reversal/receipt-reversal.html' },
    {
      id: 'member-notes-group',
      label: 'Member Notes',
      category: 'transaction',
      isGroup: true,
      children: [
        { id: 'debit-note', label: 'Member Debit Note', path: 'modules/transaction/member-debit-note/member-debit-note.html' },
        { id: 'credit-note', label: 'Member Credit Note', path: 'modules/transaction/member-credit-note/member-credit-note.html' }
      ]
    },
    { id: 'bill-type-transfer', label: 'Member Bill Type Transfer', category: 'transaction', path: 'modules/transaction/member-bill-type-transfer/member-bill-type-transfer.html' },
    { id: 'other-receipt', label: 'Other Receipt Entry (RV)', category: 'transaction', path: 'modules/transaction/other-receipt/other-receipt.html' },
    { id: 'payment-entry', label: 'Payment Entry (PV)', category: 'transaction', path: 'modules/transaction/payment-entry/payment-entry.html' },
    { id: 'contra-entry', label: 'Contra Entry (CV)', category: 'transaction', path: 'modules/transaction/contra-entry/contra-entry.html' },
    { id: 'journal-voucher', label: 'Journal Voucher (JV)', category: 'transaction', path: 'modules/transaction/journal-voucher/journal-voucher.html' },
    { id: 'purchase-order', label: 'Purchase Order (PO)', category: 'transaction', path: 'modules/transaction/purchase-order/purchase-order.html' },
    {
      id: 'fixed-deposit-group',
      label: 'Fixed Deposit',
      category: 'transaction',
      isGroup: true,
      children: [
        { id: 'fixed-deposit', label: 'Fixed Deposit', path: 'modules/transaction/fixed-deposit/fixed-deposit.html' },
        { id: 'fd-accrued-interest', label: 'FD Accrued Interest', path: 'modules/transaction/fd-accrued-interest/fd-accrued-interest.html' }
      ]
    },
    { id: 'bank-reco', label: 'Bank Reconciliation', category: 'transaction', path: 'modules/transaction/bank-reco/bank-reco.html' },
    { id: 'voucher-check', label: 'Voucher Check', category: 'transaction', path: 'modules/transaction/voucher-check/voucher-check.html' },

    // MEMBER REPORTS
    { id: 'mr-bill-format', label: 'Bill Format', category: 'member-report', path: 'modules/member-reports/bill-format/bill-format.html' },
    { id: 'mr-receipt', label: 'Receipt', category: 'member-report', path: 'modules/member-reports/receipt/receipt.html' },
    { id: 'mr-debit-note', label: 'Debit Note', category: 'member-report', path: 'modules/member-reports/debit-note/debit-note.html' },
    { id: 'mr-credit-note', label: 'Credit Note', category: 'member-report', path: 'modules/member-reports/credit-note/credit-note.html' },
    { id: 'mr-adjustment', label: 'Adjustment', category: 'member-report', path: 'modules/member-reports/adjustment/adjustment.html' },
    { id: 'mr-outstanding-list', label: 'Outstanding List', category: 'member-report', path: 'modules/member-reports/outstanding-list/outstanding-list.html' },
    {
      id: 'member-ledger-group',
      label: 'Member Ledger',
      category: 'member-report',
      isGroup: true,
      children: [
        { id: 'mr-member-account-head-wise', label: 'Member Account | Head wise', path: 'modules/member-reports/member-account-head-wise/member-account-head-wise.html' },
        { id: 'mr-member-register-dr-cr', label: 'Member Register [Dr/Cr]', path: 'modules/member-reports/member-register-drcr/member-register-drcr.html' }
      ]
    },
    { id: 'mr-member-control-account', label: 'Member Control Account', category: 'member-report', path: 'modules/member-reports/member-control-account/member-control-account.html' },
    { id: 'mr-balance-confirmation-letter', label: 'Balance Confirmation Letter', category: 'member-report', path: 'modules/member-reports/balance-confirmation-letter/balance-confirmation-letter.html' },
    {
      id: 'bill-register-group',
      label: 'Bill Register',
      category: 'member-report',
      isGroup: true,
      children: [
        { id: 'mr-bill-register', label: 'Bill Register', path: 'modules/member-reports/bill-register/bill-register.html' },
        { id: 'mr-receipt-register', label: 'Receipt Register', path: 'modules/member-reports/receipt-register/receipt-register.html' }
      ]
    },
    {
      id: 'note-register-group',
      label: 'Note Register',
      category: 'member-report',
      isGroup: true,
      children: [
        { id: 'mr-debit-note-register', label: 'Debit Note Register', path: 'modules/member-reports/debit-note-register/debit-note-register.html' },
        { id: 'mr-credit-note-register', label: 'Credit Note Register', path: 'modules/member-reports/credit-note-register/credit-note-register.html' }
      ]
    },
    { id: 'mr-adjustment-register', label: 'Adjustment Register', category: 'member-report', path: 'modules/member-reports/adjustment-register/adjustment-register.html' },
    { id: 'mr-member-jv-register', label: 'Member JV Register', category: 'member-report', path: 'modules/member-reports/member-jv-register/member-jv-register.html' },

    // ACCOUNT REPORTS
    { id: 'ar-cash-bank-book', label: 'Cash/Bank Book', category: 'account-report', path: 'modules/account-reports/cash-bank-book/cash-bank-book.html' },
    { id: 'ar-account-ledger', label: 'Account Ledger', category: 'account-report', path: 'modules/account-reports/account-ledger/account-ledger.html' },
    { id: 'ar-dues-advance-ledger', label: 'Dues/Advance Ledger', category: 'account-report', path: 'modules/account-reports/dues-advance-ledger/dues-advance-ledger.html' },
    { id: 'ar-trial-balance', label: 'Trial Balance', category: 'account-report', path: 'modules/account-reports/trial-balance/trial-balance.html' },
    { id: 'ar-balance-sheet', label: 'Balance Sheet', category: 'account-report', path: 'modules/account-reports/balance-sheet/balance-sheet.html' },
    { id: 'ar-income-expenditure', label: 'Income & Expenditure', category: 'account-report', path: 'modules/account-reports/income-expenditure/income-expenditure.html' },
    { id: 'ar-monthly-report', label: 'Monthly Report', category: 'account-report', path: 'modules/account-reports/monthly-report/monthly-report.html' },
    { id: 'ar-receipt-register', label: 'Receipt Register', category: 'account-report', path: 'modules/account-reports/receipt-register/receipt-register.html' },
    { id: 'ar-payment-register', label: 'Payment Register', category: 'account-report', path: 'modules/account-reports/payment-register/payment-register.html' },
    { id: 'ar-contra-register', label: 'Contra Register', category: 'account-report', path: 'modules/account-reports/contra-register/contra-register.html' },

    // ADDITIONAL REPORTS
    { id: 'adr-receipt-voucher-print', label: 'Receipt Voucher Print', category: 'additional-report', path: 'modules/additional-reports/receipt-voucher-print/receipt-voucher-print.html' },
    { id: 'adr-payment-voucher-print', label: 'Payment Voucher Print', category: 'additional-report', path: 'modules/additional-reports/payment-voucher-print/payment-voucher-print.html' },
    { id: 'adr-contra-voucher-print', label: 'Contra Voucher Print', category: 'additional-report', path: 'modules/additional-reports/contra-voucher-print/contra-voucher-print.html' },
    { id: 'adr-journal-voucher-print', label: 'Journal Voucher Print', category: 'additional-report', path: 'modules/additional-reports/journal-voucher-print/journal-voucher-print.html' },
    { id: 'adr-multi-report', label: 'Multi Report', category: 'additional-report', path: 'modules/additional-reports/multi-report/multi-report.html' },

    // UTILITIES
    { id: 'ut-quick-note', label: 'Quick Note', category: 'utility', path: 'modules/utilities/quick-note/quick-note.html' },
    { id: 'ut-transfer', label: 'Transfer', category: 'utility', path: 'modules/utilities/transfer/transfer.html' },
    { id: 'ut-last-year-bf', label: 'Last Year B/F', category: 'utility', path: 'modules/utilities/last-year-bf/last-year-bf.html' },
    { id: 'ut-import-master-data', label: 'Import Master Data', category: 'utility', path: 'modules/utilities/import-master-data/import-master-data.html' },
    { id: 'ut-export-member-master', label: 'Export Member Master', category: 'utility', path: 'modules/utilities/export-member-master/export-member-master.html' },
    { id: 'ut-default-group-setting', label: 'Default Group Setting', category: 'utility', path: 'modules/utilities/default-group-setting/default-group-setting.html' },
    { id: 'ut-rebuild', label: 'Rebuild', category: 'utility', path: 'modules/utilities/rebuild/rebuild.html' },
    { id: 'ut-bulk-sms', label: 'Bulk SMS & Notification', category: 'utility', path: 'modules/utilities/bulk-sms/bulk-sms.html' },
    { id: 'ut-data-backup', label: 'Data Backup & Restore', category: 'utility', path: 'modules/utilities/data-backup/data-backup.html' },
    { id: 'ut-check-difference', label: 'Check Difference', category: 'utility', path: 'modules/utilities/check-difference/check-difference.html' },
    { id: 'ut-new-year-cf', label: 'New Year C/F', category: 'utility', path: 'modules/utilities/new-year-cf/new-year-cf.html' },
    { id: 'ut-new-voucher-type', label: 'New Voucher Type', category: 'utility', path: 'modules/utilities/new-voucher-type/new-voucher-type.html' },
    { id: 'ut-select-year', label: 'Select Year', category: 'utility', path: 'modules/utilities/select-year/select-year.html' },
    { id: 'ut-calculator', label: 'Calculator', category: 'utility', path: 'modules/utilities/calculator/calculator.html' },
    { id: 'ut-gst-calculator', label: 'GST Calculator', category: 'utility', path: 'modules/utilities/gst-calculator/gst-calculator.html' },
    { id: 'ut-year-extension', label: 'Year Extension', category: 'utility', path: 'modules/utilities/year-extension/year-extension.html' },
    { id: 'ut-read-number', label: 'Read Number', category: 'utility', path: 'modules/utilities/read-number/read-number.html' },

    // COMMUNICATION
    { id: 'email-settings', label: 'Email SMTP Configuration', category: 'communication', path: 'modules/communication/email-settings/email-settings.html' },
    { id: 'whatsapp-member', label: 'Send WhatsApp Bills', category: 'communication', path: 'modules/communication/whatsapp-member/whatsapp-member.html' },

    // BILLING UTILITY
    { id: 'bill-master', label: 'Bill Schedule Master', category: 'billing-utility', path: 'modules/billing-utilities/bill-master/bill-master.html' },
    { id: 'bill-settings', label: 'Bill Calculation Settings', category: 'billing-utility', path: 'modules/billing-utilities/bill-settings/bill-settings.html' },
    { id: 'interest-calculator', label: 'Overdue Interest Calc', category: 'billing-utility', path: 'modules/billing-utilities/interest-calculator/interest-calculator.html' },

    // STATUTORY
    { id: 'i-register', label: 'Form I Register', category: 'statutory', path: 'modules/statutory/i-register/i-register.html' },
    { id: 'j-register', label: 'Form J Register', category: 'statutory', path: 'modules/statutory/j-register/j-register.html' },
    { id: 'share-register', label: 'Share Certificate Register', category: 'statutory', path: 'modules/statutory/share-register/share-register.html' },

    // ADMIN
    { id: 'user-management', label: 'User & Password Setup', category: 'admin', path: 'modules/admin/user-management/user-management.html' },
    { id: 'role-permissions', label: 'Role Access Permissions', category: 'admin', path: 'modules/admin/role-permissions/role-permissions.html' },
    { id: 'audit-log', label: 'System Audit Logs', category: 'admin', path: 'modules/admin/audit-log/audit-log.html' }
  ];

  let openCategories = { 'master': true };
  let openSubGroups = {};
  let openTabs = [];
  let activeTabId = null;

  function isGstEnabled() {
    const directFlag = sessionStorage.getItem('activeSocietyGSTApplicable') || localStorage.getItem('activeSocietyGSTApplicable');
    if (directFlag === 'N' || directFlag === 'No' || directFlag === 'false' || directFlag === '0') return false;
    if (directFlag === 'Y' || directFlag === 'Yes' || directFlag === 'true' || directFlag === '1') return true;

    if (window.currentSociety) {
      const val = window.currentSociety.GSTApplicable !== undefined ? window.currentSociety.GSTApplicable : window.currentSociety.gstApplicable;
      if (val === 'N' || val === false || val === 'No' || val === '0') return false;
      if (val === 'Y' || val === true || val === 'Yes' || val === '1') return true;
    }

    return false;
  }

  function injectSocietyContextToFrame(frame) {
    if (!frame) return;
    try {
      const doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      if (!doc) return;

      const socName = (window.Auth ? window.Auth.getSocietyName() : null) || sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName') || '—';
      const fyLabel = (window.Auth ? window.Auth.getFYLabel() : null) || sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '—';

      const socSelectors = ['.module-society', '.sm-soc-span', '.am-soc-span', '#socName', '#obSocName', '#bpsSocName', '#gstSocName', '#smSocName', '#cnmSocName'];
      socSelectors.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => { el.textContent = socName; });
      });

      const fySelectors = ['.module-year', '.sm-fy-span', '.am-fy-span', '#fyLabel', '#obFyLabel', '#bpsFyLabel', '#gstFyLabel', '#cnmFyLabel', '#mhlFyLabel', '#mregFyLabel', '#socFyLabel'];
      fySelectors.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => { el.textContent = fyLabel; });
      });
    } catch (e) { }
  }

  function updateGstMenuVisibility() {
    const gstOn = isGstEnabled();
    renderSidebar();
    if (!gstOn && openTabs.some(t => t.id === 'gst-master')) {
      closeTab('gst-master');
    }
  }

  function setActiveFY(fyId, fyLabel, fyStart, fyEnd) {
    if (!fyLabel) return;
    const strId = String(fyId || '1');
    sessionStorage.setItem('activeFYId', strId);
    sessionStorage.setItem('activeFYLabel', fyLabel);
    if (fyStart) sessionStorage.setItem('activeFYStart', fyStart);
    if (fyEnd) sessionStorage.setItem('activeFYEnd', fyEnd);

    localStorage.setItem('activeFYId', strId);
    localStorage.setItem('activeFYLabel', fyLabel);
    if (fyStart) localStorage.setItem('activeFYStart', fyStart);
    if (fyEnd) localStorage.setItem('activeFYEnd', fyEnd);

    if (window.Auth && window.Auth.setFY) {
      window.Auth.setFY({ fYId: fyId, fYLabel: fyLabel, fYStart: fyStart, fYEnd: fyEnd });
    }

    const sbFY = document.getElementById('sbFYLabel');
    if (sbFY) sbFY.textContent = fyLabel;

    const frame = document.getElementById('moduleFrame');
    if (frame) injectSocietyContextToFrame(frame);
  }

  function setActiveSociety(code, name, gstOn, fyId, fyLabel) {
    const gstFlag = (gstOn === true || gstOn === 'Y' || gstOn === 'Yes') ? 'Y' : 'N';
    sessionStorage.setItem('activeSocietyCode', code);
    sessionStorage.setItem('activeSocietyName', name);
    sessionStorage.setItem('activeSocietyGSTApplicable', gstFlag);

    localStorage.setItem('activeSocietyCode', code);
    localStorage.setItem('activeSocietyName', name);
    localStorage.setItem('activeSocietyGSTApplicable', gstFlag);

    if (fyLabel) {
      setActiveFY(fyId, fyLabel);
    }

    window.currentSociety = {
      code: code,
      name: name,
      GSTApplicable: gstFlag,
      year: sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26'
    };

    const sbSoc = document.getElementById('sbSocName');
    if (sbSoc) sbSoc.textContent = name;

    const sideSoc = document.getElementById('sideSocSub');
    if (sideSoc) sideSoc.textContent = name;

    const sideProfile = document.getElementById('sideProfileSocName');
    if (sideProfile) sideProfile.textContent = name;

    const frame = document.getElementById('moduleFrame');
    if (frame) injectSocietyContextToFrame(frame);

    updateGstMenuVisibility();
  }

  function getModule(id) {
    for (const m of MODULES) {
      if (m.id === id) return m;
      if (m.isGroup && Array.isArray(m.children)) {
        const found = m.children.find(c => c.id === id);
        if (found) return { ...found, category: m.category };
      }
    }
    return null;
  }

  function getModulesByCategory(cat) {
    return MODULES.filter(m => {
      if (m.category !== cat) return false;
      if (m.id === 'gst-master' && !isGstEnabled()) return false;
      return true;
    });
  }

  function toggleSubGroup(groupId) {
    openSubGroups[groupId] = !openSubGroups[groupId];
    renderSidebar();
  }

  function renderSidebar() {
    const menu = document.getElementById('sidebarMenu');
    if (!menu) return;

    let html = '';
    CATEGORIES.forEach(cat => {
      const isOpen = !!openCategories[cat.id];
      const subs = getModulesByCategory(cat.id);

      html += `
        <div class="sidebar-head ${isOpen ? 'open' : ''}" onclick="WorkspaceManager.toggleCategory('${cat.id}')">
          <div class="sidebar-head-left">
            <i class="bi ${cat.icon}"></i>
            <span>${escHtmlWs(cat.label)}</span>
          </div>
          ${cat.hasSub ? `<i class="bi bi-chevron-right sidebar-head-arrow"></i>` : ''}
        </div>`;

      if (cat.hasSub && subs.length > 0) {
        html += `<div class="sidebar-sub-group ${isOpen ? 'open' : ''}">`;
        subs.forEach(m => {
          if (m.isGroup) {
            const isGrpOpen = !!openSubGroups[m.id];
            html += `
              <div class="sidebar-nested-head ${isGrpOpen ? 'open' : ''}" onclick="WorkspaceManager.toggleSubGroup('${m.id}')" title="${escHtmlWs(m.label)}">
                <span>• ${escHtmlWs(m.label)}</span>
                <i class="bi bi-chevron-right nested-arrow"></i>
              </div>`;

            if (isGrpOpen && Array.isArray(m.children)) {
              html += `<div class="sidebar-nested-children open">`;
              m.children.forEach(c => {
                const isActive = c.id === activeTabId;
                html += `
                  <div class="sidebar-nested-item ${isActive ? 'active' : ''}"
                       onclick="WorkspaceManager.openModule('${c.id}')" title="${escHtmlWs(c.label)}">
                    • ${escHtmlWs(c.label)}
                  </div>`;
              });
              html += `</div>`;
            }
          } else {
            const isActive = m.id === activeTabId;
            html += `
              <div class="sidebar-sub-item ${isActive ? 'active' : ''}"
                   onclick="WorkspaceManager.openModule('${m.id}')" title="${escHtmlWs(m.label)}">
                • ${escHtmlWs(m.label)}
              </div>`;
          }
        });
        html += `</div>`;
      }
    });

    menu.innerHTML = html;
  }

  function toggleCategory(catId) {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (cat && !cat.hasSub) {
      if (catId === 'dashboard') showDashboard();
      return;
    }
    openCategories[catId] = !openCategories[catId];
    renderSidebar();
  }

  function setCategory(catId) {
    // Top bar category clicked -> open sidebar category and render
    openCategories[catId] = true;

    // Update active top tab visual
    document.querySelectorAll('.erp-nav-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.cat === catId);
    });

    renderSidebar();
  }

  function renderOpenTabsStrip() {
    const strip = document.getElementById('openTabsStrip');
    if (!strip) return;

    if (openTabs.length === 0) {
      strip.innerHTML = '';
      return;
    }

    strip.innerHTML = openTabs.map(t => `
      <div class="erp-bottom-tab ${t.id === activeTabId ? 'active' : ''}"
           onclick="WorkspaceManager.activateTab('${t.id}')" style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:${t.id === activeTabId ? '#1565C0' : '#E2E8F0'};border:1px solid ${t.id === activeTabId ? '#1565C0' : '#CBD5E1'};border-bottom:none;border-radius:4px 4px 0 0;font-size:11px;font-weight:700;color:${t.id === activeTabId ? '#FFFFFF' : '#475569'};cursor:pointer;margin-right:4px;transition:all 0.15s ease;">
        <span>${escHtmlWs(t.label)}</span>
        <span onclick="event.stopPropagation(); WorkspaceManager.closeTab('${t.id}')" style="cursor:pointer;font-weight:bold;margin-left:6px;color:${t.id === activeTabId ? '#FFFFFF' : '#94A3B8'};opacity:0.8;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">✕</span>
      </div>
    `).join('');
  }

  function loadModuleFrame(moduleId, queryParams = '') {
    const frame = document.getElementById('moduleFrame');
    const placeholder = document.getElementById('modulePlaceholder');
    const mod = getModule(moduleId);
    if (!mod) return;

    if (frame) {
      frame.style.display = 'block';
      frame.onload = function () {
        injectSocietyContextToFrame(frame);
      };
      const sep = mod.path.includes('?') ? '&' : '?';
      frame.src = mod.path + sep + 't=' + Date.now() + (queryParams ? '&' + queryParams : '');
      if (placeholder) placeholder.style.display = 'none';
    }
  }

  function openModule(moduleId, queryParams = '') {
    const mod = getModule(moduleId);
    if (!mod) return;

    const MAX_TABS = 7;
    if (!openTabs.find(t => t.id === moduleId)) {
      while (openTabs.length >= MAX_TABS) {
        openTabs.shift(); // FIFO: remove oldest tab when limit reached
      }
      openTabs.push({ id: mod.id, label: mod.label });
    }

    activeTabId = moduleId;
    openCategories[mod.category] = true;

    // Highlight navbar tab
    document.querySelectorAll('.erp-nav-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.cat === mod.category);
    });

    renderSidebar();
    renderOpenTabsStrip();
    loadModuleFrame(moduleId, queryParams);
  }

  function activateTab(moduleId) {
    activeTabId = moduleId;
    const mod = getModule(moduleId);
    if (mod) openCategories[mod.category] = true;

    renderSidebar();
    renderOpenTabsStrip();
    loadModuleFrame(moduleId);
  }

  function closeTab(moduleId) {
    openTabs = openTabs.filter(t => t.id !== moduleId);
    if (activeTabId === moduleId) {
      if (openTabs.length > 0) {
        activateTab(openTabs[openTabs.length - 1].id);
      } else {
        activeTabId = null;
        const frame = document.getElementById('moduleFrame');
        const placeholder = document.getElementById('modulePlaceholder');
        if (frame) frame.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
      }
    }
    renderSidebar();
    renderOpenTabsStrip();
  }

  function escHtmlWs(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showDashboard() {
    activeTabId = null;
    openTabs = [];
    const frame = document.getElementById('moduleFrame');
    const placeholder = document.getElementById('modulePlaceholder');
    if (frame) {
      frame.style.display = 'none';
      frame.src = 'about:blank';
    }
    if (placeholder) placeholder.style.display = 'flex';
    renderSidebar();
    renderOpenTabsStrip();
  }

  async function syncActiveSocietyGST() {
    const socId = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
    if (!socId) return;
    try {
      const apiBase = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ? window.APP_CONFIG.API_BASE.replace(/\/api\/?$/, '') : 'http://localhost:5002';
      const token = sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken');
      const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
      const res = await fetch(`${apiBase}/api/societies/${socId}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && json.data) {
          const soc = json.data;
          const isGst = (soc.gstApplicable === true || soc.GSTApplicable === true || soc.gstApplicable === 'Y' || soc.GSTApplicable === 'Y');
          const flag = isGst ? 'Y' : 'N';
          sessionStorage.setItem('activeSocietyGSTApplicable', flag);
          localStorage.setItem('activeSocietyGSTApplicable', flag);
          updateGstMenuVisibility();
        }
      }
    } catch (e) {
      console.warn('Could not sync society GST applicability:', e);
    }
  }

  function updateGstMenuVisibility() {
    renderSidebar();
  }

  function setActiveSociety(code, name, gstOn, fyId, fyLabel) {
    if (typeof Auth !== 'undefined' && Auth.setContext) {
      Auth.setContext({ societyCode: code, societyName: name }, { fYId: fyId, fYLabel: fyLabel });
    }
    if (name) {
      sessionStorage.setItem('activeSocietyName', name);
      localStorage.setItem('activeSocietyName', name);
    }
    if (code) {
      sessionStorage.setItem('activeSocietyCode', code);
      localStorage.setItem('activeSocietyCode', code);
    }
    if (fyLabel) {
      sessionStorage.setItem('activeFYLabel', fyLabel);
      localStorage.setItem('activeFYLabel', fyLabel);
    }
    if (fyId) {
      sessionStorage.setItem('activeFYId', fyId);
      localStorage.setItem('activeFYId', fyId);
    }

    if (typeof window.updateHeaderAndFooterContext === 'function') {
      window.updateHeaderAndFooterContext();
    }
    if (activeTabId) {
      loadModuleFrame(activeTabId);
    }
  }

  function setActiveFY(fyId, fyLabel, fyStart, fyEnd) {
    if (typeof Auth !== 'undefined' && Auth.setFY) {
      Auth.setFY({ fYId: fyId, fYLabel: fyLabel, fYStart: fyStart, fYEnd: fyEnd });
    } else {
      sessionStorage.setItem('activeFYId', fyId);
      sessionStorage.setItem('activeFYLabel', fyLabel);
      localStorage.setItem('activeFYId', fyId);
      localStorage.setItem('activeFYLabel', fyLabel);
    }

    if (typeof window.updateHeaderAndFooterContext === 'function') {
      window.updateHeaderAndFooterContext();
    }
    if (activeTabId) {
      loadModuleFrame(activeTabId);
    }
  }

  function purgeStaleStorageKeys() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('jeevika_payments') || k.startsWith('jeevika_payment_entries') || k.startsWith('jeevika_pos'))) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) {}
  }

  function init() {
    purgeStaleStorageKeys();
    showDashboard();
    syncActiveSocietyGST();
  }

  // ── PostMessage Listener for Child Iframe Modules ─────────────────────────────
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'JEEVIKA_WORKSPACE_CMD') return;

    const action = data.action;
    const payload = data.payload || {};

    switch (action) {
      case 'closeTab':
        if (payload.tabId || payload.moduleId) {
          closeTab(payload.tabId || payload.moduleId);
        }
        break;
      case 'openModule':
      case 'openTab':
        if (payload.moduleId) {
          openModule(payload.moduleId, payload.queryParams || payload.params || '');
        }
        break;
      case 'setActiveSociety':
        setActiveSociety(payload.code, payload.name, payload.gstOn, payload.fyId, payload.fyLabel);
        break;
      case 'setActiveFY':
        setActiveFY(payload.fyId, payload.fyLabel, payload.fyStart, payload.fyEnd);
        break;
      case 'updateGstMenuVisibility':
        updateGstMenuVisibility();
        break;
      default:
        console.warn('Unknown WorkspaceManager action:', action);
    }
  });

  return {
    init,
    showDashboard,
    setCategory,
    toggleCategory,
    toggleSubGroup,
    openModule,
    activateTab,
    closeTab,
    setActiveSociety,
    setActiveFY,
    updateGstMenuVisibility
  };

})();
if (typeof window !== 'undefined') {
  window.WorkspaceManager = WorkspaceManager;
}

