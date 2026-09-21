// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — UTILITIES
// Shared helper functions used across all modules.
// ═══════════════════════════════════════════════════════════

// ── Date Formatting ────────────────────────────────────────

/**
 * Format ISO/DB date to DD/MM/YYYY
 * @param {string|Date} val
 */
function formatDate(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (isNaN(d)) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch (_) { return ''; }
}

/**
 * Convert DD/MM/YYYY to YYYY-MM-DD for input[type=date]
 */
function toInputDate(ddmmyyyy) {
  if (!ddmmyyyy) return '';
  if (ddmmyyyy.includes('-') && ddmmyyyy.length === 10) return ddmmyyyy; // already ISO
  const parts = ddmmyyyy.split('/');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/**
 * Today's date as YYYY-MM-DD
 */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Today's date as DD/MM/YYYY
 */
function todayDisplay() {
  return formatDate(new Date());
}

// ── Amount Formatting ──────────────────────────────────────

/**
 * Format number as Indian currency: 1,23,456.00
 */
function formatAmount(val, decimals = 2) {
  const num = parseFloat(val);
  if (isNaN(num)) return '0.00';
  const fixed = num.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  // Indian number grouping
  const lastThree = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;
  return grouped + (decPart ? '.' + decPart : '');
}

/**
 * Parse formatted Indian amount string back to float
 */
function parseAmount(str) {
  if (!str) return 0;
  const clean = str.toString().replace(/,/g, '').trim();
  return parseFloat(clean) || 0;
}

// ── Toast Notifications ────────────────────────────────────

let _toastContainer = null;

function _getToastContainer() {
  if (_toastContainer) return _toastContainer;
  _toastContainer = document.getElementById('erp-toast-container');
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'erp-toast-container';
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'danger'|'warning'|'info'} type
 * @param {number} duration ms (default 3500)
 */
function showToast(message, type = 'info', duration = 3500) {
  const icons = {
    success: '✔',
    danger:  '✖',
    warning: '⚠',
    info:    'ℹ'
  };

  const container = _getToastContainer();
  const toast = document.createElement('div');
  toast.className = `erp-toast erp-toast-${type}`;
  toast.innerHTML = `
    <span class="erp-toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="erp-toast-msg">${escHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Confirm & Alert Dialogs (Custom Software Design) ──────────

/**
 * Show a software-styled confirm dialog. Returns Promise<boolean>
 * @param {string} message
 * @param {string} title
 * @param {object} options { confirmText, cancelText, isDanger }
 */
function showConfirm(message, title = 'Confirm Action', options = {}) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'erp-modal-backdrop';
    backdrop.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 999999;
      display: flex; align-items: center; justify-content: center;
      animation: erpDlgFadeIn 0.18s ease-out;
    `;

    const isDelete = options.isDanger || (message && message.toLowerCase().includes('delete'));
    const confirmBtnText = options.confirmText || (isDelete ? 'Yes, Delete' : 'Yes');
    const cancelBtnText = options.cancelText || 'Cancel';
    const dlgTitle = title || (isDelete ? 'Confirm Delete' : 'Confirm Action');

    backdrop.innerHTML = `
      <style>
        @keyframes erpDlgFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      </style>
      <div style="
        width: 420px;
        max-width: 92vw;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        border: 1px solid #cbd5e1;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          background: linear-gradient(135deg, #000080 0%, #1565C0 100%);
          color: #ffffff;
          padding: 12px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <span style="font-size: 13.5px; font-weight: 800; display: flex; align-items: center; gap: 8px; letter-spacing: 0.3px;">
            <i class="bi ${isDelete ? 'bi-exclamation-triangle-fill' : 'bi-question-circle-fill'}" style="font-size: 15px; color: ${isDelete ? '#fca5a5' : '#93c5fd'};"></i>
            ${escHtml(dlgTitle)}
          </span>
          <i class="bi bi-x-lg" id="_dlg_close_x" style="cursor: pointer; font-size: 14px; opacity: 0.8;"></i>
        </div>
        <div style="padding: 20px 18px; background: #ffffff;">
          <div style="display: flex; gap: 14px; align-items: flex-start;">
            <div style="
              width: 40px; height: 40px;
              border-radius: 50%;
              background: ${isDelete ? '#fee2e2' : '#e0f2fe'};
              color: ${isDelete ? '#dc2626' : '#0284c7'};
              display: flex; align-items: center; justify-content: center;
              font-size: 20px; flex-shrink: 0;
            ">
              <i class="bi ${isDelete ? 'bi-trash3-fill' : 'bi-question-circle-fill'}"></i>
            </div>
            <p style="font-size: 13px; font-weight: 600; color: #1e293b; line-height: 1.5; margin: 4px 0 0 0;">
              ${escHtml(message)}
            </p>
          </div>
        </div>
        <div style="
          padding: 12px 18px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        ">
          <button id="_dlg_no" style="
            padding: 7px 16px;
            font-size: 12px;
            font-weight: 700;
            color: #475569;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            cursor: pointer;
            transition: all 0.15s;
          ">${escHtml(cancelBtnText)}</button>
          <button id="_dlg_yes" style="
            padding: 7px 18px;
            font-size: 12px;
            font-weight: 700;
            color: #ffffff;
            background: ${isDelete ? '#dc2626' : '#1565C0'};
            border: 1px solid ${isDelete ? '#b91c1c' : '#0d47a1'};
            border-radius: 5px;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: all 0.15s;
          ">${escHtml(confirmBtnText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const yesBtn = backdrop.querySelector('#_dlg_yes');
    const noBtn = backdrop.querySelector('#_dlg_no');
    const closeX = backdrop.querySelector('#_dlg_close_x');

    const closeDlg = (val) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') closeDlg(false);
    };

    document.addEventListener('keydown', onKey);
    yesBtn.addEventListener('click', () => closeDlg(true));
    noBtn.addEventListener('click', () => closeDlg(false));
    if (closeX) closeX.addEventListener('click', () => closeDlg(false));
    yesBtn.focus();
  });
}

/**
 * Show a software-styled alert dialog. Returns Promise<void>
 */
function showAlert(message, title = 'Information', type = 'info') {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'erp-modal-backdrop';
    backdrop.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 999999;
      display: flex; align-items: center; justify-content: center;
      animation: erpDlgFadeIn 0.18s ease-out;
    `;

    const iconMap = {
      info: 'bi-info-circle-fill',
      success: 'bi-check-circle-fill',
      danger: 'bi-x-circle-fill',
      warning: 'bi-exclamation-triangle-fill'
    };

    const colorMap = {
      info: '#0284c7',
      success: '#16a34a',
      danger: '#dc2626',
      warning: '#d97706'
    };

    backdrop.innerHTML = `
      <div style="
        width: 400px;
        max-width: 90vw;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        border: 1px solid #cbd5e1;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          background: linear-gradient(135deg, #000080 0%, #1565C0 100%);
          color: #ffffff;
          padding: 12px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <span style="font-size: 13.5px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            <i class="bi ${iconMap[type] || 'bi-info-circle-fill'}" style="font-size: 15px; color: ${colorMap[type] || '#93c5fd'};"></i>
            ${escHtml(title)}
          </span>
          <i class="bi bi-x-lg" id="_dlg_close_x" style="cursor: pointer; font-size: 14px; opacity: 0.8;"></i>
        </div>
        <div style="padding: 20px 18px; background: #ffffff;">
          <div style="display: flex; gap: 14px; align-items: flex-start;">
            <div style="
              width: 38px; height: 38px;
              border-radius: 50%;
              background: ${colorMap[type]}15;
              color: ${colorMap[type]};
              display: flex; align-items: center; justify-content: center;
              font-size: 20px; flex-shrink: 0;
            ">
              <i class="bi ${iconMap[type] || 'bi-info-circle-fill'}"></i>
            </div>
            <p style="font-size: 13px; font-weight: 600; color: #1e293b; line-height: 1.5; margin: 4px 0 0 0;">
              ${escHtml(message)}
            </p>
          </div>
        </div>
        <div style="
          padding: 12px 18px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: flex-end;
        ">
          <button id="_dlg_ok" style="
            padding: 7px 22px;
            font-size: 12px;
            font-weight: 700;
            color: #ffffff;
            background: #1565C0;
            border: 1px solid #0d47a1;
            border-radius: 5px;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          ">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    const okBtn = backdrop.querySelector('#_dlg_ok');
    const closeX = backdrop.querySelector('#_dlg_close_x');

    const closeDlg = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve();
    };

    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') closeDlg();
    };

    document.addEventListener('keydown', onKey);
    okBtn.addEventListener('click', closeDlg);
    if (closeX) closeX.addEventListener('click', closeDlg);
    okBtn.focus();
  });
}

if (typeof window !== 'undefined') {
  window.showConfirm = showConfirm;
  window.showAlert = showAlert;
  window.showAlertModal = showAlert;
}

// ── String Utilities ───────────────────────────────────────

/**
 * Escape HTML special characters (prevents XSS)
 */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate next code in sequence: GRP-001, GRP-002...
 * @param {string} prefix  e.g. 'GRP'
 * @param {number} lastNo  last used number
 * @param {number} pad     digit padding (default 3)
 */
function nextCode(prefix, lastNo, pad = 3) {
  return `${prefix}-${String(lastNo + 1).padStart(pad, '0')}`;
}

/**
 * Debounce: call fn only after `delay` ms of no calls
 */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Error Handling ─────────────────────────────────────────

/**
 * Handle API errors cleanly — shows toast + logs to console
 */
function handleError(err, fallbackMsg = 'An error occurred.') {
  const msg = err?.message || fallbackMsg;
  console.error('[ERP Error]', err);
  showToast(msg, 'danger', 5000);
}

// ── Loading Indicator ──────────────────────────────────────

let _loadingCount = 0;
let _loadingEl = null;

function showLoading(msg = 'Loading...') {
  _loadingCount++;
  if (_loadingEl) return;
  _loadingEl = document.createElement('div');
  _loadingEl.className = 'erp-loading-overlay';
  _loadingEl.innerHTML = `
    <div class="erp-spinner"></div>
    <span style="font-size:12px;color:var(--txt-secondary);">${escHtml(msg)}</span>
  `;
  document.body.appendChild(_loadingEl);
}

function hideLoading() {
  _loadingCount = Math.max(0, _loadingCount - 1);
  if (_loadingCount === 0 && _loadingEl) {
    _loadingEl.remove();
    _loadingEl = null;
  }
}

// ── Number to Words (Indian system) ───────────────────────

function numberToWords(num) {
  num = Math.abs(Math.floor(num));
  if (num === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
    'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
    'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
    'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '');
  }

  let words = '';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh  = Math.floor(num / 100000);   num %= 100000;
  const thousand = Math.floor(num / 1000);  num %= 1000;
  const rest = num;

  if (crore)    words += inWords(crore)    + ' Crore ';
  if (lakh)     words += inWords(lakh)     + ' Lakh ';
  if (thousand) words += inWords(thousand) + ' Thousand ';
  if (rest)     words += inWords(rest);

  return words.trim();
}

/**
 * Amount in words including Rupees and Paise
 */
function amountInWords(amount) {
  const num = parseFloat(amount) || 0;
  const rupees = Math.floor(num);
  const paise  = Math.round((num - rupees) * 100);
  let result = 'Rupees ' + numberToWords(rupees);
  if (paise > 0) result += ' and ' + numberToWords(paise) + ' Paise';
  return result + ' Only';
}

// ── FY Utilities & Date Restrictions ───────────────────────────

/**
 * Get active FY date boundaries (startDate and endDate in YYYY-MM-DD format)
 */
function getFYDateRange() {
  let fyStart = (window.Auth && window.Auth.getFYStart && window.Auth.getFYStart()) ||
                (window.SafeStorage ? (window.SafeStorage.session.getItem('activeFYStart') || window.SafeStorage.local.getItem('activeFYStart')) : null) ||
                sessionStorage.getItem('activeFYStart') || localStorage.getItem('activeFYStart');

  let fyEnd = (window.Auth && window.Auth.getFYEnd && window.Auth.getFYEnd()) ||
              (window.SafeStorage ? (window.SafeStorage.session.getItem('activeFYEnd') || window.SafeStorage.local.getItem('activeFYEnd')) : null) ||
              sessionStorage.getItem('activeFYEnd') || localStorage.getItem('activeFYEnd');

  let fyLabel = (window.Auth && window.Auth.getFYLabel && window.Auth.getFYLabel()) ||
                (window.SafeStorage ? (window.SafeStorage.session.getItem('activeFYLabel') || window.SafeStorage.local.getItem('activeFYLabel')) : null) ||
                sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2026-27';

  // Fallback if running inside child iframe
  if ((!fyStart || !fyEnd) && window.parent && window.parent !== window) {
    try {
      if (window.parent.Auth) {
        fyStart = fyStart || window.parent.Auth.getFYStart();
        fyEnd = fyEnd || window.parent.Auth.getFYEnd();
        fyLabel = fyLabel || window.parent.Auth.getFYLabel();
      }
      if (!fyStart) fyStart = window.parent.sessionStorage.getItem('activeFYStart') || window.parent.localStorage.getItem('activeFYStart');
      if (!fyEnd) fyEnd = window.parent.sessionStorage.getItem('activeFYEnd') || window.parent.localStorage.getItem('activeFYEnd');
      if (!fyLabel) fyLabel = window.parent.sessionStorage.getItem('activeFYLabel') || window.parent.localStorage.getItem('activeFYLabel');
    } catch (_) { }
  }

  // Normalize YYYY-MM-DD (strip any ISO time)
  if (fyStart && fyStart.includes('T')) fyStart = fyStart.split('T')[0];
  if (fyEnd && fyEnd.includes('T')) fyEnd = fyEnd.split('T')[0];

  // Derive automatically from fyLabel if still missing (e.g. "2026-27" or "2026-2027")
  if (!fyStart || !fyEnd) {
    const match = String(fyLabel).match(/(\d{4})[-/](\d{2,4})/);
    if (match) {
      const sYear = parseInt(match[1], 10);
      const eYear = match[2].length === 2 ? Math.floor(sYear / 100) * 100 + parseInt(match[2], 10) : parseInt(match[2], 10);
      fyStart = fyStart || `${sYear}-04-01`;
      fyEnd = fyEnd || `${eYear}-03-31`;
    } else {
      fyStart = fyStart || '2026-04-01';
      fyEnd = fyEnd || '2027-03-31';
    }
  }

  return {
    startDate: fyStart,
    endDate: fyEnd,
    label: fyLabel
  };
}

/**
 * Get safe default date within active FY.
 * If today is within FY, returns todayISO().
 * If today is outside FY, returns fyStart (or fyEnd if today is later).
 */
function getFYDefaultDate() {
  const range = getFYDateRange();
  const today = todayISO();
  if (today >= range.startDate && today <= range.endDate) {
    return today;
  }
  if (today > range.endDate) {
    return range.endDate;
  }
  return range.startDate;
}

/**
 * Check if a date string is within the active FY
 */
function isInActiveFY(dateStr) {
  if (!dateStr) return true;
  const range = getFYDateRange();
  const iso = dateStr.includes('/') ? toInputDate(dateStr) : dateStr.split('T')[0];
  return iso >= range.startDate && iso <= range.endDate;
}

/**
 * Validate a specific date input against the active FY.
 * Alerts user and resets to FY default if out of bounds.
 */
function validateFYDateInput(input) {
  if (!input || !input.value) return true;
  const range = getFYDateRange();
  const val = input.value.includes('/') ? toInputDate(input.value) : input.value.split('T')[0];

  if (val < range.startDate || val > range.endDate) {
    const msg = `Selected date (${formatDate(val) || val}) is outside the active Financial Year (${formatDate(range.startDate)} to ${formatDate(range.endDate)}).`;
    if (typeof showToast === 'function') {
      showToast(msg, 'warning', 4500);
    } else {
      alert(msg);
    }
    input.value = getFYDefaultDate();
    if (typeof input.focus === 'function') input.focus();
    return false;
  }
  return true;
}

/**
 * Automatically restrict all date pickers in container to the active FY.
 * Sets min, max, and attaches live validation.
 */
function applyFYDateRestrictions(container = document) {
  if (!container) return;
  try {
    const range = getFYDateRange();
    if (!range || !range.startDate || !range.endDate) return;

    const inputs = container.querySelectorAll ? container.querySelectorAll('input[type="date"], .fy-date, [data-fy-restricted="true"]') : [];
    inputs.forEach(input => {
      // Allow opting out if explicitly marked
      if ((input.dataset && input.dataset.fyIgnore === 'true') || (input.classList && input.classList.contains('no-fy-limit'))) {
        return;
      }

      input.min = range.startDate;
      input.max = range.endDate;

      // If current value is out of bounds, fix it
      if (input.value) {
        const val = input.value.includes('/') ? toInputDate(input.value) : input.value.split('T')[0];
        if (val < range.startDate || val > range.endDate) {
          input.value = getFYDefaultDate();
        }
      }

      if (!input._fyBound) {
        input._fyBound = true;
        input.addEventListener('change', function () {
          validateFYDateInput(this);
        });
        input.addEventListener('blur', function () {
          validateFYDateInput(this);
        });
      }
    });
  } catch (e) {
    console.warn('[applyFYDateRestrictions]', e);
  }
}

// Global auto-binder on page load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyFYDateRestrictions());
  } else {
    setTimeout(() => applyFYDateRestrictions(), 50);
  }
}

/**
 * Get FY label for current session
 */
function getActiveFYLabel() {
  return (window.Auth && window.Auth.getFYLabel && window.Auth.getFYLabel()) ||
         sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '—';
}

/**
 * Get active society name for current session
 */
function getActiveSocietyName() {
  return (window.Auth && window.Auth.getSocietyName && window.Auth.getSocietyName()) ||
         sessionStorage.getItem('activeSocietyName') || localStorage.getItem('activeSocietyName') || '—';
}

// ── Transaction Serial Number & Prefix Generator ─────────────

/**
 * Compute next Voucher / Bill / Invoice / Note number matching Configuration & Notes Master
 * @param {string} moduleId - 'bill', 'receipt', 'reversal', 'debit', 'credit', 'transfer', 'otherReceipt', 'payCash', 'payBank', 'paySwiss', 'contra', 'jv', 'po'
 * @param {number|Array} countOrRecords - Current count of existing records or array of records
 * @returns {string} Formatted voucher string e.g. "MBIL/2025-26/01" or "MRV/2025-26/50"
 */
function getTxPrefixPattern(moduleId) {
  var socId = (window.Auth && window.Auth.getSocietyId) ? window.Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4');
  var fyLabel = (window.Auth && window.Auth.getFYLabel) ? window.Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');

  var parts = fyLabel.split('-');
  var shortFy = (parts[0] ? parts[0].slice(-2) : '25') + '-' + (parts[1] || '26');

  var defaultConfig = {
    bill: { prefix: 'MBIL', altPrefix: 'MINV', useAltPrefix: false, startNo: 1, useShortFy: false },
    receipt: { prefix: 'MRV', startNo: 1, useShortFy: false },
    reversal: { prefix: 'MRV-R', startNo: 1, useShortFy: false },
    debit: { prefix: 'MDN', startNo: 1, useShortFy: false },
    credit: { prefix: 'MCN', startNo: 1, useShortFy: false },
    transfer: { prefix: 'MTT-B', altPrefix: 'MTT-I', useAltPrefix: false, startNo: 1, useShortFy: false },
    otherreceipt: { prefix: 'ORV', startNo: 1, useShortFy: false },
    otherReceipt: { prefix: 'ORV', startNo: 1, useShortFy: false },
    payment: { prefix: 'PYMT', startNo: 1, useShortFy: false },
    paycash: { prefix: 'CASH', startNo: 1, useShortFy: false },
    paybank: { prefix: 'PYMT', startNo: 1, useShortFy: false },
    payswiss: { prefix: 'SWIF', startNo: 1, useShortFy: false },
    contra: { prefix: 'CV', startNo: 1, useShortFy: false },
    jv: { prefix: 'JV', startNo: 1, useShortFy: false },
    po: { prefix: 'PO', startNo: 1, useShortFy: false }
  };

  var key = (moduleId || '').toLowerCase();
  if (key === 'memberdebitnote' || key === 'member-debit-note' || key === 'debitnote') key = 'debit';
  if (key === 'membercreditnote' || key === 'member-credit-note' || key === 'creditnote') key = 'credit';
  if (key === 'memberreceiptreversal' || key === 'receiptreversal' || key === 'receipt-reversal') key = 'reversal';
  if (key === 'memberreceipt' || key === 'member-receipt') key = 'receipt';
  if (key === 'memberbill' || key === 'member-bill') key = 'bill';
  if (key === 'memberbilltypetransfer' || key === 'billtypetransfer') key = 'transfer';
  if (key === 'otherreceipt' || key === 'other-receipt' || key === 'other_receipt' || key === 'other') key = 'otherreceipt';
  if (key === 'journal' || key === 'journalvoucher' || key === 'journal-voucher') key = 'jv';
  if (key === 'contraentry' || key === 'contra-entry') key = 'contra';
  if (key === 'payment' || key === 'paymententry' || key === 'payment-entry') key = 'paybank';

  var cfg = defaultConfig[key] || { prefix: (moduleId || '').toUpperCase(), startNo: 1, useShortFy: false };

  try {
    var savedStr = localStorage.getItem('jeevika_config_notes_global') || localStorage.getItem('jeevika_config_notes_' + socId);
    if (!savedStr) {
      for (var k in localStorage) {
        if (k.indexOf('jeevika_config_notes_') === 0) {
          savedStr = localStorage.getItem(k);
          if (savedStr) break;
        }
      }
    }
    if (savedStr) {
      var savedObj = JSON.parse(savedStr);
      if (savedObj && Array.isArray(savedObj.txModules)) {
        var cleanKey = key.replace(/[-_]/g, '');
        var found = savedObj.txModules.find(function (m) { 
          var mId = (m.id || '').toLowerCase().replace(/[-_]/g, '');
          return mId === cleanKey; 
        });
        if (!found) {
          found = savedObj.txModules.find(function (m) {
            var mName = (m.name || '').toLowerCase().replace(/[-_ ]/g, '');
            var mPfx = (m.prefix || '').toLowerCase().replace(/[-_ ]/g, '');
            return mName === cleanKey || mPfx === cleanKey;
          });
        }
        if (found) {
          cfg = Object.assign({}, found);
          if (key === 'bill' && (!cfg.altPrefix || cfg.altPrefix === 'BILL')) cfg.altPrefix = 'MINV';
          if (key === 'transfer' && (!cfg.altPrefix || cfg.altPrefix === 'MTT')) cfg.altPrefix = 'MTT-I';
        }
      }
    }
  } catch (e) {
    console.warn('Error loading jeevika_config_notes_', e);
  }

  var prefix = (cfg.useAltPrefix && cfg.altPrefix) ? cfg.altPrefix : (cfg.prefix || 'VCH');
  var pattern = prefix + '/' + (cfg.useShortFy ? shortFy : fyLabel) + '/';
  var altPattern = cfg.altPrefix ? (cfg.altPrefix + '/' + (cfg.useShortFy ? shortFy : fyLabel) + '/') : null;

  return {
    prefix: prefix,
    altPrefix: cfg.altPrefix || null,
    pattern: pattern,
    altPattern: altPattern,
    cfg: cfg,
    fyLabel: fyLabel
  };
}

/**
 * Validate that a manually entered or generated voucher number matches the prefix configured in Transaction Types.
 * @param {string} moduleId - e.g. 'debit', 'reversal', 'credit', 'receipt', 'bill', 'transfer', 'jv'
 * @param {string} voucherNo - full entered voucher number string
 * @returns {{valid: boolean, error?: string, pattern?: string}}
 */
function validateTxVoucherNo(moduleId, voucherNo) {
  if (!voucherNo || !voucherNo.trim()) {
    return { valid: false, error: 'Voucher number cannot be empty.' };
  }
  var pInfo = getTxPrefixPattern(moduleId);
  var vNo = voucherNo.trim().toUpperCase();
  var p1 = pInfo.pattern.toUpperCase();
  var p1Short = (pInfo.prefix + '/').toUpperCase();
  var p2 = pInfo.altPattern ? pInfo.altPattern.toUpperCase() : null;

  var matches = vNo.startsWith(p1) || vNo.startsWith(p1Short) || (p2 && (vNo.startsWith(p2) || vNo.startsWith((pInfo.altPrefix + '/').toUpperCase())));
  if (!matches) {
    return {
      valid: false,
      pattern: pInfo.pattern,
      error: 'Voucher Number must follow the configured prefix pattern "' + pInfo.pattern + '" (e.g. ' + pInfo.pattern + '01)'
    };
  }
  return { valid: true, pattern: pInfo.pattern };
}

function getTxNextVoucherNo(moduleId, countOrRecords) {
  var pInfo = getTxPrefixPattern(moduleId);
  var cfg = pInfo.cfg;
  var pattern = pInfo.pattern;

  var maxSeq = 0;
  if (Array.isArray(countOrRecords)) {
    countOrRecords.forEach(function(r) {
      var vNo = typeof r === 'string' ? r : (r.voucherNo || r.vNo || r.noteNo || r.receiptNo || r.billNo || '');
      if (vNo) {
        var match = String(vNo).match(/(\d+)$/);
        if (match && match[1]) {
          var parsed = parseInt(match[1], 10);
          if (!isNaN(parsed) && parsed > maxSeq) maxSeq = parsed;
        }
      }
    });
  } else if (typeof countOrRecords === 'number') {
    maxSeq = countOrRecords;
  }

  var startNumber = parseInt(cfg.startNo);
  if (isNaN(startNumber)) startNumber = 1;

  var nextSeq = Math.max(startNumber, maxSeq + 1);
  var padLen = (startNumber >= 10 || String(cfg.startNo || '').length >= 2) ? Math.max(2, String(nextSeq).length) : 2;
  var numPadded = String(nextSeq).padStart(padLen, '0');

  return pattern + numPadded;
}

/**
 * Asynchronously fetch true database-driven monotonic next voucher number
 * @param {string} moduleId - e.g. 'jv', 'payment', 'contra', 'otherReceipt', 'po', 'debit', 'credit', 'receipt'
 * @param {Array} [fallbackRecords] - optional array of records in memory for offline/failure fallback
 * @returns {Promise<string>}
 */
async function fetchTxNextVoucherNo(moduleId, fallbackRecords) {
  var pInfo = getTxPrefixPattern(moduleId);
  var socId = (window.Auth && window.Auth.getSocietyId) ? window.Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4');
  var fyId = (window.Auth && window.Auth.getFYId) ? window.Auth.getFYId() : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1');
  var fyLabel = (window.Auth && window.Auth.getFYLabel) ? window.Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');

  var typeMap = {
    jv: 'Journal',
    payment: 'Payment',
    paybank: 'Payment',
    paycash: 'Payment',
    payswiss: 'Payment',
    contra: 'Contra',
    otherreceipt: 'OtherReceipt',
    otherReceipt: 'OtherReceipt',
    po: 'PurchaseOrder',
    debit: 'MemberDebitNote',
    credit: 'MemberCreditNote',
    receipt: 'MemberReceipt',
    reversal: 'ReceiptReversal',
    transfer: 'BillTypeTransfer',
    bill: 'MemberBill'
  };
  var vType = typeMap[(moduleId || '').toLowerCase()] || 'Journal';
  var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';

  try {
    var url = baseHost + '/api/vouchers/next-no?societyId=' + socId + '&fyId=' + fyId + '&type=' + encodeURIComponent(vType) + '&prefix=' + encodeURIComponent(pInfo.prefix) + '&fyLabel=' + encodeURIComponent(fyLabel);
    var resp = await fetch(url, { headers: { 'X-Society-Id': String(socId), 'X-FY-Id': String(fyId) } });
    if (resp.ok) {
      var json = await resp.json();
      if (json && json.success && json.nextVoucherNo) {
        return json.nextVoucherNo;
      }
    }
  } catch (e) {
    console.warn('fetchTxNextVoucherNo backend query failed, using scan calculation:', e);
  }
  return getTxNextVoucherNo(moduleId, fallbackRecords || []);
}

if (typeof window !== 'undefined') {
  window.getTxPrefixPattern = getTxPrefixPattern;
  window.validateTxVoucherNo = validateTxVoucherNo;
  window.getTxNextVoucherNo = getTxNextVoucherNo;
}

/**
 * Check if manual voucher/invoice number input is allowed for a given transaction module.
 * Reads from config saved by Configuration & Notes Master (manualModules array).
 * @param {string} moduleKey - e.g. 'Payment', 'Contra', 'JV', 'OtherReceipt', 'PurchaseOrder', 'Receipt', etc.
 * @returns {boolean} true if manual input is allowed, false if auto-generated (readonly)
 */
function getManualVoucherAllowed(moduleKey) {
  try {
    var socId = (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1');
    var savedStr = localStorage.getItem('jeevika_config_notes_global') || localStorage.getItem('jeevika_config_notes_' + socId);
    if (!savedStr) {
      for (var k in localStorage) {
        if (k.indexOf('jeevika_config_notes_') === 0) {
          savedStr = localStorage.getItem(k);
          if (savedStr) break;
        }
      }
    }
    if (savedStr) {
      var cfg = JSON.parse(savedStr);
      if (cfg && Array.isArray(cfg.manualModules)) {
        var mod = cfg.manualModules.find(function (m) {
          return m.key && m.key.toLowerCase() === (moduleKey || '').toLowerCase();
        });
        if (mod) return !!mod.manual;
      }
    }
  } catch (e) {}
  return false; // default: auto (readonly)
}

if (typeof window !== 'undefined') {
  window.getManualVoucherAllowed = getManualVoucherAllowed;
}

/**
 * Apply manual/auto voucher number mode to an input element.
 * Call this after setting the voucher number in any transaction form.
 * @param {string} inputId - ID of the voucher number input element
 * @param {string} moduleKey - module key e.g. 'Payment', 'JV', 'PurchaseOrder'
 */
function applyVoucherNoMode(inputId, moduleKey) {
  var el = document.getElementById(inputId);
  if (!el) return;
  var isManual = getManualVoucherAllowed(moduleKey);
  if (isManual) {
    el.removeAttribute('readonly');
    el.style.background = '#fff';
    el.style.color = '#0D47A1';
    el.style.fontWeight = '800';
    var pInfo = getTxPrefixPattern(moduleKey);
    el.title = 'Manual entry allowed — must follow pattern: ' + pInfo.pattern;

    el.onblur = function () {
      var val = (el.value || '').trim();
      if (val) {
        var vRes = validateTxVoucherNo(moduleKey, val);
        if (!vRes.valid) {
          if (typeof window.showToast === 'function') {
            window.showToast(vRes.error, 'error');
          }
          el.style.borderColor = '#dc2626';
        } else {
          el.style.borderColor = '';
        }
      }
    };
  } else {
    el.setAttribute('readonly', 'readonly');
    el.style.background = '#f0f4f8';
    el.style.color = '#475569';
    el.style.fontWeight = '700';
    el.title = 'Auto-generated — manual entry not allowed';
    el.onblur = null;
    el.style.borderColor = '';
  }
}

if (typeof window !== 'undefined') {
  window.applyVoucherNoMode = applyVoucherNoMode;
}

/**
 * Get account group visibility settings for a module ('paymententry', 'otherreceipt', 'purchaseorder')
 * Reads from Configuration & Notes Master (groupVisibilityModules).
 * @param {string} moduleKey - e.g. 'paymententry', 'otherreceipt', 'purchaseorder'
 * @returns {{Assets: boolean, Liabilities: boolean, Income: boolean, Expense: boolean}}
 */
function getModuleGroupVisibility(moduleKey) {
  var normKey = (moduleKey || '').toLowerCase().replace(/[^a-z]/g, '');
  var defaultGroups = { Assets: true, Liabilities: true, Income: true, Expense: true };
  try {
    var socId = (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1');
    var savedStr = localStorage.getItem('jeevika_config_notes_global') || localStorage.getItem('jeevika_config_notes_' + socId);
    if (!savedStr) {
      for (var k in localStorage) {
        if (k.indexOf('jeevika_config_notes_') === 0) {
          savedStr = localStorage.getItem(k);
          if (savedStr) break;
        }
      }
    }
    if (savedStr) {
      var cfg = JSON.parse(savedStr);
      if (cfg && Array.isArray(cfg.groupVisibilityModules)) {
        var mod = cfg.groupVisibilityModules.find(function (m) {
          var mKey = (m.key || '').toLowerCase().replace(/[^a-z]/g, '');
          return mKey === normKey || (normKey.indexOf(mKey) >= 0) || (mKey.indexOf(normKey) >= 0);
        });
        if (mod && mod.groups) {
          return {
            Assets: mod.groups.Assets !== undefined ? !!mod.groups.Assets : true,
            Liabilities: mod.groups.Liabilities !== undefined ? !!mod.groups.Liabilities : true,
            Income: mod.groups.Income !== undefined ? !!mod.groups.Income : true,
            Expense: mod.groups.Expense !== undefined ? !!mod.groups.Expense : true
          };
        }
      }
    }
  } catch (e) {}
  return defaultGroups;
}

/**
 * Filter an account list by primary group visibility for a specific module
 * @param {Array} list - Array of account objects
 * @param {string} moduleKey - 'paymententry', 'otherreceipt', or 'purchaseorder'
 * @returns {Array} Filtered accounts list
 */
function filterAccountsByGroupVisibility(list, moduleKey) {
  if (!Array.isArray(list)) return [];
  var vis = getModuleGroupVisibility(moduleKey);
  return list.filter(function (acc) {
    if (!acc) return false;
    var grpId = acc.grpMainId;
    var mg = (acc.mainGroup || acc.primaryGroup || '').toLowerCase();
    var code = (acc.accCode || '').toUpperCase();

    var isAsset = (grpId === 1) || mg.startsWith('asset') || code.startsWith('ASS');
    var isLiability = (grpId === 2) || mg.startsWith('liab') || code.startsWith('LIA');
    var isIncome = (grpId === 3) || mg.startsWith('inc') || code.startsWith('INC');
    var isExpense = (grpId === 4) || mg.startsWith('exp') || code.startsWith('EXP');

    if (isAsset && !vis.Assets) return false;
    if (isLiability && !vis.Liabilities) return false;
    if (isIncome && !vis.Income) return false;
    if (isExpense && !vis.Expense) return false;

    return true;
  });
}

if (typeof window !== 'undefined') {
  window.getModuleGroupVisibility = getModuleGroupVisibility;
  window.filterAccountsByGroupVisibility = filterAccountsByGroupVisibility;
}



// ── Bill Type Charge Heads Generator ───────────────────────────

/**
 * Retrieve configured charge heads for a given Bill Type (e.g. "Maintenance", "Water Bill", "Clubhouse Usage", "Repair Fund")
 * Dynamically synchronized with Bill Type & Notes Master (localStorage + API)
 * @param {string} typeName - Name of bill type e.g. "Maintenance"
 * @returns {Array<{srNo: number, accountCode: string, accountName: string, defaultAmt: number}>}
 */
function getBillTypeConfiguredHeads(typeName) {
  var socId = (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1');
  var targetName = (typeName || 'Maintenance').trim().toUpperCase();

  var heads = [];

  try {
    var storedStr = localStorage.getItem('jeevika_bill_types_' + socId) ||
                    localStorage.getItem('jeevika_bill_types_global');

    if (!storedStr) {
      for (var k in localStorage) {
        if (k.indexOf('jeevika_bill_types_') === 0) {
          storedStr = localStorage.getItem(k);
          if (storedStr) break;
        }
      }
    }

    if (storedStr) {
      var bTypes = JSON.parse(storedStr);
      var foundKey = Object.keys(bTypes).find(function (k) {
        return k.trim().toUpperCase() === targetName;
      });

      if (foundKey && bTypes[foundKey] && Array.isArray(bTypes[foundKey].heads)) {
        bTypes[foundKey].heads.forEach(function (h) {
          if (h && (h.accCode || h.accName || h.accountCode || h.accountName)) {
            var code = h.accCode || h.accountCode || '';
            var name = h.accName || h.accountName || '';
            if (code || name) {
              heads.push({
                srNo: heads.length + 1,
                accountCode: code,
                accountName: name,
                defaultAmt: 0.00
              });
            }
          }
        });
      }
    }
  } catch (e) {
    console.warn('Error reading jeevika_bill_types from localStorage', e);
  }

  return heads;
}

// ═══════════════════════════════════════════════════════════
// STANDARD ACCOUNT MASTER DATA & DYNAMIC LOOKUP MODAL
// ═══════════════════════════════════════════════════════════

var _masterAccountsList = [
  // Income
  { accountId: 1001, accCode: 'INC-1001', accName: 'Property Tax', accBSName: 'Property Tax', mainGroup: 'Income', groupName: 'Rent & Taxes', grpMainId: 3 },
  { accountId: 1002, accCode: 'INC-1002', accName: 'Water Charges', accBSName: 'Water Charges', mainGroup: 'Income', groupName: 'Rent & Taxes', grpMainId: 3 },
  { accountId: 1003, accCode: 'INC-1003', accName: 'Electricity Charges', accBSName: 'Electricity Charges', mainGroup: 'Income', groupName: 'Rent & Taxes', grpMainId: 3 },
  { accountId: 1004, accCode: 'INC-1004', accName: 'Service Charges', accBSName: 'Service Charges', mainGroup: 'Income', groupName: 'Maintenance & Service Charges', grpMainId: 3 },
  { accountId: 1005, accCode: 'INC-1005', accName: 'Non Occupancy Charges', accBSName: 'Non Occupancy Charges', mainGroup: 'Income', groupName: 'Maintenance & Service Charges', grpMainId: 3 },
  { accountId: 1006, accCode: 'INC-1006', accName: '4-Wheeler Parking Charges', accBSName: '4-Wheeler Parking Charges', mainGroup: 'Income', groupName: 'Maintenance & Service Charges', grpMainId: 3 },
  { accountId: 1007, accCode: 'INC-1007', accName: '2-Wheeler Parking Charges', accBSName: '2-Wheeler Parking Charges', mainGroup: 'Income', groupName: 'Maintenance & Service Charges', grpMainId: 3 },
  { accountId: 1008, accCode: 'INC-1008', accName: 'Interest From Member', accBSName: 'Interest From Member', mainGroup: 'Income', groupName: 'Interest Received From', grpMainId: 3 },
  { accountId: 1009, accCode: 'INC-1009', accName: 'Bank SB A/c. Interest', accBSName: 'Bank SB A/c. Interest', mainGroup: 'Income', groupName: 'Interest Received From', grpMainId: 3 },
  { accountId: 1010, accCode: 'INC-1010', accName: 'Interest on FDR', accBSName: 'Interest on FDR', mainGroup: 'Income', groupName: 'Interest Received From', grpMainId: 3 },
  { accountId: 1011, accCode: 'INC-1011', accName: 'Bank Charges', accBSName: 'Bank Charges', mainGroup: 'Income', groupName: 'Interest Received From', grpMainId: 3 },
  { accountId: 1012, accCode: 'INC-1012', accName: 'Other Income', accBSName: 'Other Income', mainGroup: 'Income', groupName: 'Other Sources', grpMainId: 3 },
  { accountId: 1013, accCode: 'INC-1013', accName: 'Sale of Scrap', accBSName: 'Sale of Scrap', mainGroup: 'Income', groupName: 'Other Sources', grpMainId: 3 },
  { accountId: 1999, accCode: 'INC-1999', accName: 'Excess of Expenditure over Income', accBSName: 'Excess of Expenditure over Income', mainGroup: 'Income', groupName: 'Other Sources', grpMainId: 3 },

  // Expenditure
  { accountId: 2001, accCode: 'EXP-1001', accName: 'Property Tax Exp.', accBSName: 'Property Tax Exp.', mainGroup: 'Expenditure', groupName: 'Rent, Rates & Taxes', grpMainId: 4 },
  { accountId: 2002, accCode: 'EXP-1002', accName: 'Water Charges Exp.', accBSName: 'Water Charges Exp.', mainGroup: 'Expenditure', groupName: 'Rent, Rates & Taxes', grpMainId: 4 },
  { accountId: 2003, accCode: 'EXP-1003', accName: 'Electricity Charges Exp.', accBSName: 'Electricity Charges Exp.', mainGroup: 'Expenditure', groupName: 'Rent, Rates & Taxes', grpMainId: 4 },
  { accountId: 2004, accCode: 'EXP-1004', accName: 'Security Charges Exp.', accBSName: 'Security Charges Exp.', mainGroup: 'Expenditure', groupName: 'Establishment Expenses', grpMainId: 4 },
  { accountId: 2005, accCode: 'EXP-1005', accName: 'Housekeeping Charges Exp.', accBSName: 'Housekeeping Charges Exp.', mainGroup: 'Expenditure', groupName: 'Establishment Expenses', grpMainId: 4 },
  { accountId: 2006, accCode: 'EXP-1006', accName: 'Building Insurance Exp.', accBSName: 'Building Insurance Exp.', mainGroup: 'Expenditure', groupName: 'Establishment Expenses', grpMainId: 4 },
  { accountId: 2007, accCode: 'EXP-1007', accName: 'CCTV Maintance & AMC Exp.', accBSName: 'CCTV Maintance & AMC Exp.', mainGroup: 'Expenditure', groupName: 'Establishment Expenses', grpMainId: 4 },
  { accountId: 2008, accCode: 'EXP-1008', accName: 'Lift Maintenace & AMC Exp.', accBSName: 'Lift Maintenace & AMC Exp.', mainGroup: 'Expenditure', groupName: 'Establishment Expenses', grpMainId: 4 },
  { accountId: 2009, accCode: 'EXP-1009', accName: 'Pest Control Exp.', accBSName: 'Pest Control Exp.', mainGroup: 'Expenditure', groupName: 'Establishment Expenses', grpMainId: 4 },
  { accountId: 2010, accCode: 'EXP-1010', accName: 'Repair & Maintenance Exp.', accBSName: 'Repair & Maintenance Exp.', mainGroup: 'Expenditure', groupName: 'Maintenance', grpMainId: 4 },
  { accountId: 2011, accCode: 'EXP-1011', accName: 'Salary & Wages Exp.', accBSName: 'Salary & Wages Exp.', mainGroup: 'Expenditure', groupName: 'Establishment Expenses', grpMainId: 4 },
  { accountId: 2012, accCode: 'EXP-1012', accName: 'Managerial Salary Exp.', accBSName: 'Managerial Salary Exp.', mainGroup: 'Expenditure', groupName: 'Establishment Expenses', grpMainId: 4 },
  { accountId: 2013, accCode: 'EXP-1013', accName: 'Legal Fees Exp.', accBSName: 'Legal Fees Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2014, accCode: 'EXP-1014', accName: 'Professional Fees Exp.', accBSName: 'Professional Fees Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2015, accCode: 'EXP-1015', accName: 'Accounting Charges Exp.', accBSName: 'Accounting Charges Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2016, accCode: 'EXP-1016', accName: 'Audit Fees Exp.', accBSName: 'Audit Fees Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2017, accCode: 'EXP-1017', accName: 'Accounting Software AMC Exp', accBSName: 'Accounting Software AMC Exp', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2018, accCode: 'EXP-1018', accName: 'Printing & Stationary Exp.', accBSName: 'Printing & Stationary Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2019, accCode: 'EXP-1019', accName: 'Postage & Telegram Exp.', accBSName: 'Postage & Telegram Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2020, accCode: 'EXP-1020', accName: 'Function & Festival Exp.', accBSName: 'Function & Festival Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2021, accCode: 'EXP-1021', accName: 'Travel & Conveyance Exp.', accBSName: 'Travel & Conveyance Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2022, accCode: 'EXP-1022', accName: 'Telephone Exp.', accBSName: 'Telephone Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2023, accCode: 'EXP-1023', accName: 'Education & Training Fund', accBSName: 'Education & Training Fund', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2024, accCode: 'EXP-1024', accName: 'Miscellaneous Exp.', accBSName: 'Miscellaneous Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2025, accCode: 'EXP-1025', accName: 'Meeting Exp. (AGM,SGM & MCM)', accBSName: 'Meeting Exp. (AGM,SGM & MCM)', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2026, accCode: 'EXP-1026', accName: 'Housing Federation Subscription Exp.', accBSName: 'Housing Federation Subscription Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2027, accCode: 'EXP-1027', accName: 'Bank Charges Exp.', accBSName: 'Bank Charges Exp.', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2028, accCode: 'EXP-1028', accName: 'Depreciation', accBSName: 'Depreciation', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },
  { accountId: 2999, accCode: 'EXP-1999', accName: 'Excess of Income over Expenditure', accBSName: 'Excess of Income over Expenditure', mainGroup: 'Expenditure', groupName: 'Others', grpMainId: 4 },

  // Assets
  { accountId: 3001, accCode: 'ASS-1001', accName: 'Cash in Hand', accBSName: 'Cash in Hand', mainGroup: 'Asset', groupName: 'Cash & Bank Balance', grpMainId: 1 },
  { accountId: 3002, accCode: 'ASS-1002', accName: 'The M.D C.C. Bank A/C No.', accBSName: 'The M.D C.C. Bank A/C No.', mainGroup: 'Asset', groupName: 'Cash & Bank Balance', grpMainId: 1 },
  { accountId: 3003, accCode: 'ASS-1003', accName: 'The Saraswat Bank A/C No.', accBSName: 'The Saraswat Bank A/C No.', mainGroup: 'Asset', groupName: 'Cash & Bank Balance', grpMainId: 1 },
  { accountId: 3004, accCode: 'ASS-1004', accName: 'One Share of Housing Federation', accBSName: 'One Share of Housing Federation', mainGroup: 'Asset', groupName: 'Investments', grpMainId: 1 },
  { accountId: 3005, accCode: 'ASS-1005', accName: 'One Share of MDCC Bank', accBSName: 'One Share of MDCC Bank', mainGroup: 'Asset', groupName: 'Investments', grpMainId: 1 },
  { accountId: 3006, accCode: 'ASS-1006', accName: 'FDR Share Capital - (Bank name)', accBSName: 'FDR Share Capital - (Bank name)', mainGroup: 'Asset', groupName: 'Investments', grpMainId: 1 },
  { accountId: 3007, accCode: 'ASS-1007', accName: 'FDR Reserve Fund - (Bank Name)', accBSName: 'FDR Reserve Fund - (Bank Name)', mainGroup: 'Asset', groupName: 'Investments', grpMainId: 1 },
  { accountId: 3008, accCode: 'ASS-1008', accName: 'FDR Sinking Fund - (Bank Name)', accBSName: 'FDR Sinking Fund - (Bank Name)', mainGroup: 'Asset', groupName: 'Investments', grpMainId: 1 },
  { accountId: 3009, accCode: 'ASS-1009', accName: 'FDR Repair & Maintenance Fund - (Bank Name)', accBSName: 'FDR Repair & Maintenance Fund - (Bank Name)', mainGroup: 'Asset', groupName: 'Investments', grpMainId: 1 },
  { accountId: 3010, accCode: 'ASS-1010', accName: 'FDR General Fund - (Bank Name)', accBSName: 'FDR General Fund - (Bank Name)', mainGroup: 'Asset', groupName: 'Investments', grpMainId: 1 },
  { accountId: 3011, accCode: 'ASS-1011', accName: 'Accrued Int on-MDCC Share Capital', accBSName: 'Accrued Int on-MDCC Share Capital', mainGroup: 'Asset', groupName: 'Accrued Interest', grpMainId: 1 },
  { accountId: 3012, accCode: 'ASS-1012', accName: 'Accrued Int on MDCC Bank - Reserve Fund', accBSName: 'Accrued Int on MDCC Bank - Reserve Fund', mainGroup: 'Asset', groupName: 'Accrued Interest', grpMainId: 1 },
  { accountId: 3013, accCode: 'ASS-1013', accName: 'Accrued Int on MDCC Bank - Sinking Fund', accBSName: 'Accrued Int on MDCC Bank - Sinking Fund', mainGroup: 'Asset', groupName: 'Accrued Interest', grpMainId: 1 },
  { accountId: 3014, accCode: 'ASS-1014', accName: 'Accrued Int on MDCC Bank - Repair & Maint Fund', accBSName: 'Accrued Int on MDCC Bank - Repair & Maint Fund', mainGroup: 'Asset', groupName: 'Accrued Interest', grpMainId: 1 },
  { accountId: 3015, accCode: 'ASS-1015', accName: 'Accrued Int on MDCC Bank - General Fund', accBSName: 'Accrued Int on MDCC Bank - General Fund', mainGroup: 'Asset', groupName: 'Accrued Interest', grpMainId: 1 },
  { accountId: 3016, accCode: 'ASS-1016', accName: 'Deposit With MSEDC', accBSName: 'Deposit With MSEDC', mainGroup: 'Asset', groupName: 'Advance & Deposit', grpMainId: 1 },
  { accountId: 3017, accCode: 'ASS-1017', accName: 'Deposit With Water Connection', accBSName: 'Deposit With Water Connection', mainGroup: 'Asset', groupName: 'Advance & Deposit', grpMainId: 1 },
  { accountId: 3018, accCode: 'ASS-1018', accName: 'Furniture and Fixture', accBSName: 'Furniture and Fixture', mainGroup: 'Asset', groupName: 'Fixed Assets', grpMainId: 1 },
  { accountId: 3019, accCode: 'ASS-1019', accName: 'Fire Fighting Equipments', accBSName: 'Fire Fighting Equipments', mainGroup: 'Asset', groupName: 'Fixed Assets', grpMainId: 1 },
  { accountId: 3020, accCode: 'ASS-1020', accName: 'Water Moter Pump', accBSName: 'Water Moter Pump', mainGroup: 'Asset', groupName: 'Fixed Assets', grpMainId: 1 },
  { accountId: 3021, accCode: 'ASS-1021', accName: 'CCTV System', accBSName: 'CCTV System', mainGroup: 'Asset', groupName: 'Fixed Assets', grpMainId: 1 },
  { accountId: 3022, accCode: 'ASS-1022', accName: 'Computer System', accBSName: 'Computer System', mainGroup: 'Asset', groupName: 'Fixed Assets', grpMainId: 1 },
  { accountId: 3023, accCode: 'ASS-1023', accName: 'Mobile Phone', accBSName: 'Mobile Phone', mainGroup: 'Asset', groupName: 'Fixed Assets', grpMainId: 1 },
  { accountId: 3024, accCode: 'ASS-1024', accName: 'Epson Printer', accBSName: 'Epson Printer', mainGroup: 'Asset', groupName: 'Fixed Assets', grpMainId: 1 },
  { accountId: 3025, accCode: 'ASS-1025', accName: 'Dues From Members', accBSName: 'Dues From Members', mainGroup: 'Asset', groupName: 'Dues from Members', grpMainId: 1 },
  { accountId: 3026, accCode: 'ASS-1026', accName: 'TDS Receivable', accBSName: 'TDS Receivable', mainGroup: 'Asset', groupName: 'Advance & Deposit', grpMainId: 1 },
  { accountId: 3027, accCode: 'ASS-1027', accName: 'Input CGST', accBSName: 'Input CGST', mainGroup: 'Asset', groupName: 'INPUT GST', grpMainId: 1 },
  { accountId: 3028, accCode: 'ASS-1028', accName: 'Input SGST', accBSName: 'Input SGST', mainGroup: 'Asset', groupName: 'INPUT GST', grpMainId: 1 },
  { accountId: 3029, accCode: 'ASS-1029', accName: 'Input IGST', accBSName: 'Input IGST', mainGroup: 'Asset', groupName: 'INPUT GST', grpMainId: 1 },
  { accountId: 3999, accCode: 'ASS-1999', accName: 'INCOME & EXPENDITURE A/C', accBSName: 'INCOME & EXPENDITURE A/C', mainGroup: 'Asset', groupName: 'Income & Expenditure', grpMainId: 1 },

  // Liabilities
  { accountId: 4001, accCode: 'LIA-1001', accName: 'Paidup Share Capital', accBSName: 'Paidup Share Capital', mainGroup: 'Liability', groupName: 'Issued, Sub. & Paid Up Captial', grpMainId: 2 },
  { accountId: 4002, accCode: 'LIA-1002', accName: 'Reserve Fund', accBSName: 'Reserve Fund', mainGroup: 'Liability', groupName: 'Reserve Fund', grpMainId: 2 },
  { accountId: 4003, accCode: 'LIA-1003', accName: 'Common Amenity Fund', accBSName: 'Common Amenity Fund', mainGroup: 'Liability', groupName: 'Ammenity Fund', grpMainId: 2 },
  { accountId: 4004, accCode: 'LIA-1004', accName: 'Sinking Fund', accBSName: 'Sinking Fund', mainGroup: 'Liability', groupName: 'Sinking Fund', grpMainId: 2 },
  { accountId: 4005, accCode: 'LIA-1005', accName: 'Repair & Major Repair Fund', accBSName: 'Repair & Major Repair Fund', mainGroup: 'Liability', groupName: 'Building Repair Fund', grpMainId: 2 },
  { accountId: 4006, accCode: 'LIA-1006', accName: 'Education & Training Fund', accBSName: 'Education & Training Fund', mainGroup: 'Liability', groupName: 'Education Fund', grpMainId: 2 },
  { accountId: 4007, accCode: 'LIA-1007', accName: 'Social Welfare Fund', accBSName: 'Social Welfare Fund', mainGroup: 'Liability', groupName: 'Common Welfare Fund', grpMainId: 2 },
  { accountId: 4008, accCode: 'LIA-1008', accName: 'TDS Payable', accBSName: 'TDS Payable', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4009, accCode: 'LIA-1009', accName: 'Prov. Audit Fees Payable', accBSName: 'Prov. Audit Fees Payable', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4010, accCode: 'LIA-1010', accName: 'Prov. Accounting Charges', accBSName: 'Prov. Accounting Charges', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4011, accCode: 'LIA-1011', accName: 'Prov. Professional Fees', accBSName: 'Prov. Professional Fees', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4012, accCode: 'LIA-1012', accName: 'Prov. Salary & Wages', accBSName: 'Prov. Salary & Wages', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4013, accCode: 'LIA-1013', accName: 'Prov. Managerial Salary', accBSName: 'Prov. Managerial Salary', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4014, accCode: 'LIA-1014', accName: 'Prov. Security Charges', accBSName: 'Prov. Security Charges', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4015, accCode: 'LIA-1015', accName: 'Prov. Houekeeping Charges', accBSName: 'Prov. Houekeeping Charges', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4016, accCode: 'LIA-1016', accName: 'Prov. Waste Manegment', accBSName: 'Prov. Waste Manegment', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4017, accCode: 'LIA-1017', accName: 'Prov. Pest Control Exp.', accBSName: 'Prov. Pest Control Exp.', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4018, accCode: 'LIA-1018', accName: 'Prov. Accounting Software AMC Exp.', accBSName: 'Prov. Accounting Software AMC Exp.', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4019, accCode: 'LIA-1019', accName: 'Prov. Income Tax', accBSName: 'Prov. Income Tax', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4020, accCode: 'LIA-1020', accName: 'Dues From Members', accBSName: 'Dues From Members', mainGroup: 'Liability', groupName: 'Dues from Members', grpMainId: 2 },
  { accountId: 4021, accCode: 'LIA-1021', accName: 'Output CGST', accBSName: 'Output CGST', mainGroup: 'Liability', groupName: 'OUTPUT GST', grpMainId: 2 },
  { accountId: 4022, accCode: 'LIA-1022', accName: 'Output SGST', accBSName: 'Output SGST', mainGroup: 'Liability', groupName: 'OUTPUT GST', grpMainId: 2 },
  { accountId: 4023, accCode: 'LIA-1023', accName: 'Output IGST', accBSName: 'Output IGST', mainGroup: 'Liability', groupName: 'OUTPUT GST', grpMainId: 2 },
  { accountId: 4032, accCode: 'LIA-1032', accName: 'CGST 9%', accBSName: 'CGST 9%', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4033, accCode: 'LIA-1033', accName: 'SGST 9%', accBSName: 'SGST 9%', mainGroup: 'Liability', groupName: 'Current Liabilities & Provisions', grpMainId: 2 },
  { accountId: 4999, accCode: 'LIA-1999', accName: 'INCOME & EXPENDITURE A/C', accBSName: 'INCOME & EXPENDITURE A/C', mainGroup: 'Liability', groupName: 'Income & Expenditure', grpMainId: 2 }
];

function getStandardMasterAccounts() {
  return JSON.parse(JSON.stringify(_masterAccountsList));
}

var _activeLookupTargetSelectId = 'entry-acc-sel';
var _activeLookupOnSelectCallback = null;
var _cachedMasterAccounts = null;

async function fetchMasterAccounts(societyId) {
  var sid = societyId || (window.Auth && Auth.getSocietyId ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4'));
  try {
    if (window.API && API.get) {
      var res = await API.get('/api/accounts?societyId=' + sid);
      if (res && Array.isArray(res) && res.length > 0) {
        _cachedMasterAccounts = res.map(function(a) {
          var mainNames = { 1: 'Asset', 2: 'Liability', 3: 'Income', 4: 'Expenditure' };
          var mainId = a.grpMainId || a.GrpMainId || 1;
          return {
            accountId: a.accountId || a.socAccId || a.id,
            accCode: a.accCode || a.AccCode || '',
            accName: a.accName || a.AccName || '',
            accBSName: a.accBSName || a.AccBSName || a.accName || '',
            mainGroup: a.mainGroup || mainNames[mainId] || 'Asset',
            groupName: a.groupName || a.grpName || a.GroupName || a.primaryGroup || 'General',
            grpMainId: mainId
          };
        });
        return _cachedMasterAccounts;
      }
    }
  } catch (e) {
    console.warn('Could not fetch accounts from API, using standard Account Master register', e);
  }

  if (!_cachedMasterAccounts) {
    _cachedMasterAccounts = getStandardMasterAccounts();
  }
  return _cachedMasterAccounts;
}

var _isAccountLookupEditMode = false;

function toggleAccountLookupEditMode() {
  _isAccountLookupEditMode = !_isAccountLookupEditMode;
  var btn = document.getElementById('btn-acc-lookup-edit-mode');
  var hint = document.getElementById('acc-lookup-edit-hint');
  if (btn) {
    if (_isAccountLookupEditMode) {
      btn.style.background = '#d97706';
      btn.style.borderColor = '#b45309';
      btn.style.boxShadow = '0 0 8px rgba(217,119,6,0.6)';
      btn.innerHTML = '<i class="bi bi-pencil-square"></i> Edit Mode: ON';
      btn.title = 'Edit Mode is ON: Double-click any account to alter it in Account Master';
    } else {
      btn.style.background = '#475569';
      btn.style.borderColor = '#64748b';
      btn.style.boxShadow = 'none';
      btn.innerHTML = '<i class="bi bi-pencil"></i> Edit Mode: OFF';
      btn.title = 'Click to enable Edit Mode (allows altering accounts on double-click)';
    }
  }
  if (hint) {
    hint.style.display = _isAccountLookupEditMode ? 'flex' : 'none';
  }

  var searchInp = document.getElementById('acc-lookup-search');
  var query = (searchInp ? searchInp.value : '').toLowerCase().trim();
  var list = _cachedMasterAccounts || getStandardMasterAccounts();
  if (!query) {
    renderAccountLookupTable(list);
  } else {
    filterAccountLookupTable();
  }
}

function ensureAccountLookupModalDom() {
  var modal = document.getElementById('modal-account-lookup');
  if (modal) return modal;

  var div = document.createElement('div');
  div.id = 'modal-account-lookup';
  div.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.55); z-index:99999; align-items:center; justify-content:center; box-sizing:border-box; padding:16px;';
  
  div.innerHTML = 
    '<div style="background:#fff; border-radius:4px; width:980px; max-width:96vw; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.35); overflow:hidden; border:1px solid #1e3a8a;">' +
      '<!-- HEADER -->' +
      '<div style="background:#000080; color:#fff; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">' +
        '<div style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:800; letter-spacing:0.3px;">' +
          '<i class="bi bi-book" style="font-size:15px;"></i> SELECT ACCOUNT — ACCOUNT MASTER' +
        '</div>' +
        '<div style="display:flex; align-items:center; gap:8px;">' +
          '<button type="button" id="btn-acc-lookup-edit-mode" onclick="toggleAccountLookupEditMode()" style="background:#475569; color:#fff; border:1px solid #64748b; padding:5px 12px; border-radius:3px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.15s ease;" title="Click to enable Edit Mode (allows altering accounts on double-click)">' +
            '<i class="bi bi-pencil"></i> Edit Mode: OFF' +
          '</button>' +
          '<button type="button" onclick="redirectToAccountMasterAdd()" style="background:#2E7D32; color:#fff; border:none; padding:5px 14px; border-radius:3px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;">' +
            '+ Add New Account' +
          '</button>' +
          '<button type="button" onclick="closeAccountLookupModal()" style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer; line-height:1; font-weight:bold; padding:0 4px;">✕</button>' +
        '</div>' +
      '</div>' +

      '<!-- EDIT MODE HINT BANNER -->' +
      '<div id="acc-lookup-edit-hint" style="display:none; background:#fffbeb; color:#92400e; border-bottom:1px solid #fde68a; padding:6px 14px; font-size:11px; font-weight:700; align-items:center; gap:6px; flex-shrink:0;">' +
        '<i class="bi bi-pencil-square" style="color:#d97706; font-size:13px;"></i>' +
        '<span><strong>EDIT MODE ACTIVE:</strong> Double-click on any account to open its Alter space in Account Master.</span>' +
      '</div>' +

      '<!-- SEARCH BAR -->' +
      '<div style="padding:10px 14px; background:#f8fafc; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; gap:10px; flex-shrink:0;">' +
        '<div style="position:relative; flex:1;">' +
          '<i class="bi bi-search" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#64748b; font-size:13px;"></i>' +
          '<input type="text" id="acc-lookup-search" oninput="filterAccountLookupTable()" placeholder="Type Account Code, Name, B/Sheet Name, or Group to search..." style="width:100%; height:32px; padding:4px 10px 4px 32px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; outline:none; box-sizing:border-box;">' +
        '</div>' +
      '</div>' +

      '<!-- TABLE BODY CONTAINER -->' +
      '<div style="flex:1; overflow-y:auto; min-height:260px; max-height:420px; background:#fff;">' +
        '<table style="width:100%; border-collapse:collapse; font-size:11.5px; table-layout:fixed;">' +
          '<thead>' +
            '<tr style="background:#1565C0; color:#fff; position:sticky; top:0; z-index:2;">' +
              '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:130px;">ACCOUNT CODE</th>' +
              '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1;">ACCOUNT NAME</th>' +
              '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1;">NAME IN B/SHEET</th>' +
              '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:120px;">MAIN GROUP</th>' +
              '<th style="padding:8px 12px; text-align:left; font-weight:700; width:180px;">PRIMARY GROUP</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody id="acc-lookup-tbody">' +
            '<!-- Rendered rows -->' +
          '</tbody>' +
        '</table>' +
      '</div>' +

      '<!-- FOOTER -->' +
      '<div style="padding:8px 16px; background:#f8fafc; border-top:1px solid #cbd5e1; display:flex; justify-content:flex-end; flex-shrink:0;">' +
        '<button type="button" onclick="closeAccountLookupModal()" style="background:#fff; color:#334155; border:1px solid #cbd5e1; padding:6px 20px; font-size:11px; font-weight:700; border-radius:3px; cursor:pointer;">CANCEL</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(div);
  return div;
}

var _activeLookupFilterFn = null;

async function openAccountLookupModal(targetSelectId, onSelectCb, filterFn) {
  _activeLookupTargetSelectId = targetSelectId || 'entry-acc-sel';
  _activeLookupOnSelectCallback = (typeof onSelectCb === 'function') ? onSelectCb : null;
  
  if (typeof filterFn === 'function') {
    _activeLookupFilterFn = filterFn;
  } else if (typeof filterFn === 'string') {
    _activeLookupFilterFn = function (a) { return filterAccountsByGroupVisibility([a], filterFn).length > 0; };
  } else {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('payment-entry') >= 0) {
      _activeLookupFilterFn = function (a) { return filterAccountsByGroupVisibility([a], 'paymententry').length > 0; };
    } else if (path.indexOf('other-receipt') >= 0) {
      _activeLookupFilterFn = function (a) { return filterAccountsByGroupVisibility([a], 'otherreceipt').length > 0; };
    } else if (path.indexOf('purchase-order') >= 0) {
      _activeLookupFilterFn = function (a) { return filterAccountsByGroupVisibility([a], 'purchaseorder').length > 0; };
    } else {
      _activeLookupFilterFn = null;
    }
  }

  var modal = ensureAccountLookupModalDom();
  var searchInp = document.getElementById('acc-lookup-search');
  if (searchInp) searchInp.value = '';

  modal.style.display = 'flex';

  var list = await fetchMasterAccounts();
  if (_activeLookupFilterFn) {
    list = list.filter(_activeLookupFilterFn);
  }
  renderAccountLookupTable(list);

  if (searchInp) {
    setTimeout(function () { searchInp.focus(); }, 50);
  }
}

function closeAccountLookupModal() {
  var modal = document.getElementById('modal-account-lookup');
  if (modal) modal.style.display = 'none';
}

function filterAccountLookupTable() {
  var searchInp = document.getElementById('acc-lookup-search');
  var query = (searchInp ? searchInp.value : '').toLowerCase().trim();
  var list = _cachedMasterAccounts || getStandardMasterAccounts();
  if (_activeLookupFilterFn) {
    list = list.filter(_activeLookupFilterFn);
  }

  if (!query) {
    renderAccountLookupTable(list);
    return;
  }

  var filtered = list.filter(function (a) {
    var c = (a.accCode || '').toLowerCase();
    var n = (a.accName || '').toLowerCase();
    var b = (a.accBSName || '').toLowerCase();
    var m = (a.mainGroup || '').toLowerCase();
    var g = (a.groupName || '').toLowerCase();
    return c.indexOf(query) !== -1 || n.indexOf(query) !== -1 || b.indexOf(query) !== -1 || m.indexOf(query) !== -1 || g.indexOf(query) !== -1;
  });

  renderAccountLookupTable(filtered);
}

function renderAccountLookupTable(list) {
  var tbody = document.getElementById('acc-lookup-tbody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:#64748b; font-weight:600;">No matching accounts found in Account Master.</td></tr>';
    return;
  }

  var html = '';
  list.forEach(function (a, idx) {
    var bg = idx % 2 === 1 ? '#f0f9ff' : '#ffffff';
    var rowTitle = _isAccountLookupEditMode 
      ? 'Double-click to Alter ' + (a.accName || 'Account') + ' in Account Master' 
      : 'Click to select ' + (a.accName || 'Account');
    var safeCode = (a.accCode || '').replace(/'/g, "\\'");
    var safeName = (a.accName || '').replace(/'/g, "\\'");
    html += '<tr onclick="onAccountLookupRowClick(' + a.accountId + ', \'' + safeCode + '\', \'' + safeName + '\')" ondblclick="onAccountLookupRowDblClick(' + a.accountId + ', \'' + safeCode + '\', \'' + safeName + '\')" title="' + rowTitle + '" style="background:' + bg + '; cursor:pointer; border-bottom:1px solid #e2e8f0; transition:background 0.1s;" onmouseover="this.style.background=\'#dbeafe\'" onmouseout="this.style.background=\'' + bg + '\'">' +
      '<td style="padding:7px 12px; font-weight:800; font-family:\'Consolas\', monospace; color:#0f172a; border-right:1px solid #e2e8f0;">' + (a.accCode || '') + '</td>' +
      '<td style="padding:7px 12px; font-weight:700; color:#0f172a; border-right:1px solid #e2e8f0;">' + (a.accName || '') + '</td>' +
      '<td style="padding:7px 12px; color:#475569; border-right:1px solid #e2e8f0;">' + (a.accBSName || a.accName || '') + '</td>' +
      '<td style="padding:7px 12px; color:#1e293b; font-weight:600; border-right:1px solid #e2e8f0;">' + (a.mainGroup || '') + '</td>' +
      '<td style="padding:7px 12px; color:#475569;">' + (a.groupName || '') + '</td>' +
    '</tr>';
  });

  tbody.innerHTML = html;
}

function onAccountLookupRowClick(accId, accCode, accName) {
  if (_isAccountLookupEditMode) {
    if (typeof window.showToast === 'function') {
      window.showToast('Edit Mode ON: Double-click ' + (accName || accCode || 'account') + ' to open Alter space.', 'info');
    }
  } else {
    selectAccountFromLookup(accId);
  }
}

function onAccountLookupRowDblClick(accId, accCode, accName) {
  if (_isAccountLookupEditMode) {
    redirectToAccountMasterAlter(accId, accCode, accName);
  } else {
    selectAccountFromLookup(accId);
  }
}

function redirectToAccountMasterAlter(accId, accCode, accName) {
  closeAccountLookupModal();
  
  var payload = {
    id: accId,
    code: accCode || '',
    name: accName || ''
  };
  sessionStorage.setItem('jeevika_account_master_pending_alter', JSON.stringify(payload));

  var query = 'action=alter&id=' + encodeURIComponent(accId) + (accCode ? '&code=' + encodeURIComponent(accCode) : '') + (accName ? '&name=' + encodeURIComponent(accName) : '');

  // Send message to open frame if already active
  try {
    var frame = document.getElementById('moduleFrame') || (window.parent && window.parent.document.getElementById('moduleFrame'));
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ action: 'alter', id: accId, code: accCode, name: accName }, '*');
    }
  } catch (e) {}

  if (window.WorkspaceBridge && typeof window.WorkspaceBridge.openModule === 'function') {
    window.WorkspaceBridge.openModule('account-master', query);
  } else if (window.parent && window.parent.WorkspaceManager && typeof window.parent.WorkspaceManager.openModule === 'function') {
    window.parent.WorkspaceManager.openModule('account-master', query);
  } else {
    window.location.href = '../../master/account-master/account-master.html?' + query;
  }
}

function selectAccountFromLookup(accId) {
  var list = _cachedMasterAccounts || getStandardMasterAccounts();
  var found = list.find(function (a) { return String(a.accountId) === String(accId); });
  if (!found) return;

  var sel = document.getElementById(_activeLookupTargetSelectId);
  if (sel) {
    // Check if option exists, otherwise add it
    var optExists = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (String(sel.options[i].value) === String(found.accountId) || sel.options[i].value === found.accCode) {
        sel.selectedIndex = i;
        optExists = true;
        break;
      }
    }

    if (!optExists) {
      var opt = document.createElement('option');
      opt.value = found.accountId;
      opt.textContent = (found.accCode ? found.accCode + ' - ' : '') + found.accName;
      sel.appendChild(opt);
      sel.value = found.accountId;
    }

    // Trigger change event
    var event = new Event('change', { bubbles: true });
    sel.dispatchEvent(event);
  }

  if (typeof _activeLookupOnSelectCallback === 'function') {
    _activeLookupOnSelectCallback(found);
  }

  closeAccountLookupModal();
  if (typeof showToast === 'function') {
    showToast('Selected Account: ' + (found.accCode ? found.accCode + ' - ' : '') + found.accName, 'success');
  }
}

function redirectToAccountMasterAdd() {
  closeAccountLookupModal();
  if (window.WorkspaceBridge && typeof window.WorkspaceBridge.openModule === 'function') {
    window.WorkspaceBridge.openModule('account-master', 'action=add');
  } else if (window.parent && window.parent.WorkspaceManager && typeof window.parent.WorkspaceManager.openModule === 'function') {
    window.parent.WorkspaceManager.openModule('account-master', 'action=add');
  } else {
    window.location.href = '../../master/account-master/account-master.html?action=add';
  }
}

// ═══════════════════════════════════════════════════════════
// PERSON (VENDOR / STAFF / MEMBER) MASTER LOOKUP MODAL
// ═══════════════════════════════════════════════════════════

var _activePersonLookupTargetSelectId = 'frm-person-name';
var _activePersonLookupTypeSelectId = 'frm-person-type';
var _activePersonLookupOnSelectCallback = null;
var _activePersonLookupType = 'Vendor';
var _isPersonLookupEditMode = false;
var _cachedMasterPersons = { Vendor: null, Staff: null, Member: null };

async function fetchMasterPersons(pType, societyId) {
  var sid = societyId || (window.Auth && Auth.getSocietyId ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4'));
  var endpoint = (pType === 'Staff') ? '/api/staff' : ((pType === 'Member') ? '/api/members' : '/api/vendors');
  var list = [];

  // 1. Try via API.get
  try {
    var url = sid ? (endpoint + '?societyId=' + sid) : endpoint;
    var res = null;
    if (window.API && API.get) {
      res = await API.get(url);
    } else if (typeof fetchApiData === 'function') {
      res = await fetchApiData(url);
    }
    list = (res && Array.isArray(res)) ? res : ((res && res.data && Array.isArray(res.data)) ? res.data : []);
  } catch (e) {}

  // 2. If empty, try direct fetch with full localhost url and societyId
  if (!list || list.length === 0) {
    try {
      var base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ? window.APP_CONFIG.API_BASE.replace(/\/api$/, '') : 'http://localhost:5002';
      var directUrl = base + endpoint + (sid ? ('?societyId=' + sid) : '');
      var raw = await fetch(directUrl, { headers: { 'Content-Type': 'application/json' } });
      if (raw.ok) {
        var j = await raw.json();
        list = (j && Array.isArray(j)) ? j : ((j && j.data && Array.isArray(j.data)) ? j.data : []);
      }
    } catch(e) {}
  }

  // 3. If still empty, try direct fetch without societyId filter
  if (!list || list.length === 0) {
    try {
      var base2 = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ? window.APP_CONFIG.API_BASE.replace(/\/api$/, '') : 'http://localhost:5002';
      var directUrl2 = base2 + endpoint;
      var raw2 = await fetch(directUrl2, { headers: { 'Content-Type': 'application/json' } });
      if (raw2.ok) {
        var j2 = await raw2.json();
        list = (j2 && Array.isArray(j2)) ? j2 : ((j2 && j2.data && Array.isArray(j2.data)) ? j2.data : []);
      }
    } catch(e) {}
  }

  // 4. Local storage fallback if still empty
  if (!list || list.length === 0) {
    if (pType === 'Member') {
      var localM = localStorage.getItem('jeevika_master_members') || localStorage.getItem('jeevika_members_' + sid) || localStorage.getItem('jeevika_members_4') || localStorage.getItem('jeevika_members_1');
      if (localM) try { list = JSON.parse(localM); } catch(ex){}
    } else if (pType === 'Vendor') {
      var localV = localStorage.getItem('jeevika_vendor_master') || localStorage.getItem('jeevika_vendors_' + sid) || localStorage.getItem('jeevika_vendors_4') || localStorage.getItem('jeevika_vendors_1');
      if (localV) try { list = JSON.parse(localV); } catch(ex){}
    } else if (pType === 'Staff') {
      var localS = localStorage.getItem('jeevika_staff_' + sid) || localStorage.getItem('jeevika_staff_global') || localStorage.getItem('jeevika_staff_4') || localStorage.getItem('jeevika_staff_1');
      if (localS) try { list = JSON.parse(localS); } catch(ex){}
    }
  }

  if (pType === 'Vendor') {
    _cachedMasterPersons.Vendor = (list || []).map(function(v) {
      var code = v.vendorCode || v.code || v.VendorCode || '';
      var name = v.vendorName || v.name || v.VendorName || '';
      var cat = v.category || v.Category || v.designation || 'Contractor';
      return {
        id: v.vendorId || v.id || v.VendorId || code || name,
        code: code,
        name: name,
        category: cat,
        contact: v.contactNo || v.phone || v.ContactNo || v.Phone || '—',
        cost: parseFloat(v.contractValue || v.contractVal || v.ContractValue || v.cost || 0) || 0,
        tds: (v.tdsRate !== undefined && v.tdsRate !== null && v.tdsRate !== '')
             ? (String(v.tdsRate).includes('%') ? String(v.tdsRate) : (parseFloat(v.tdsRate) + '%'))
             : (v.TDSRate ? (String(v.TDSRate).includes('%') ? String(v.TDSRate) : (parseFloat(v.TDSRate) + '%')) : '0%'),
        tdsRate: parseFloat(v.tdsRate ?? v.TDSRate ?? v.TdsRate ?? 0) || 0,
        tdsSec: v.tdsSection || v.tdsSec || v.TDSSection || v.TdsSection || '194C',
        label: (code ? ('[' + code + '] ') : '') + name + (cat ? (' (' + cat + ')') : ''),
        raw: v
      };
    });
    return _cachedMasterPersons.Vendor;
  } else if (pType === 'Staff') {
    _cachedMasterPersons.Staff = (list || []).map(function(s) {
      var code = s.staffCode || s.code || s.StaffCode || '';
      var name = s.staffName || s.name || s.StaffName || '';
      var desig = s.designation || s.category || s.Designation || 'Staff';
      return {
        id: s.staffId || s.id || s.StaffId || code || name,
        code: code,
        name: name,
        category: desig,
        contact: s.contactNo || s.phone || s.ContactNo || s.Phone || '—',
        cost: parseFloat(s.monthlySalary || s.salary || s.MonthlySalary || s.MonthlyCost || 0) || 0,
        status: s.status || s.Status || 'Active',
        tds: (s.tdsRate !== undefined && s.tdsRate !== null && s.tdsRate !== '')
             ? (String(s.tdsRate).includes('%') ? String(s.tdsRate) : (parseFloat(s.tdsRate) + '%'))
             : (s.TDSRate ? (String(s.TDSRate).includes('%') ? String(s.TDSRate) : (parseFloat(s.TDSRate) + '%')) : '0%'),
        tdsRate: parseFloat(s.tdsRate ?? s.TDSRate ?? s.TdsRate ?? 0) || 0,
        tdsSec: s.tdsSection || s.tdsSec || s.TDSSection || s.TdsSection || '194J',
        label: (code ? ('[' + code + '] ') : '') + name + (desig ? (' (' + desig + ')') : ''),
        raw: s
      };
    });
    return _cachedMasterPersons.Staff;
  } else {
    _cachedMasterPersons.Member = (list || []).map(function(m) {
      var code = m.memCode || m.MemCode || m.code || '';
      var name = m.memName || m.MemName || m.name || m.memberName || '';
      var wing = m.wing || m.Wing || '';
      var flatNo = m.flatNo || m.FlatNo || m.flat || '';
      var flat = (wing ? (wing + '-') : '') + flatNo;
      return {
        id: m.socMemId || m.memberId || m.MemberId || m.id || flat || name,
        code: code,
        name: name,
        flatNo: flat,
        wing: wing,
        contact: m.contactNo || m.mobile || m.phone || m.ContactNo || '—',
        status: m.status || m.Status || 'Active',
        label: (code ? ('[' + code + '] ') : '') + name + (flat ? (' (' + flat + ')') : ''),
        raw: m
      };
    });
    return _cachedMasterPersons.Member;
  }
}

function ensurePersonLookupModalDom() {
  var modal = document.getElementById('modal-person-lookup');
  if (modal) return modal;

  var div = document.createElement('div');
  div.id = 'modal-person-lookup';
  div.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.55); z-index:99999; align-items:center; justify-content:center; box-sizing:border-box; padding:16px;';

  div.innerHTML =
    '<div style="background:#fff; border-radius:4px; width:980px; max-width:96vw; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.35); overflow:hidden; border:1px solid #1e3a8a;">' +
      '<!-- HEADER -->' +
      '<div style="background:#000080; color:#fff; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">' +
        '<div style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:800; letter-spacing:0.3px;">' +
          '<i class="bi bi-book" style="font-size:15px;"></i> <span id="person-lookup-title">SELECT PERSON — PERSON MASTER</span>' +
        '</div>' +
        '<div style="display:flex; align-items:center; gap:8px;">' +
          '<select id="person-lookup-type-sel" onchange="switchPersonLookupType(this.value)" style="background:#1e3a8a; color:#fff; border:1px solid #3b82f6; border-radius:3px; padding:4px 8px; font-size:11px; font-weight:700; cursor:pointer;">' +
            '<option value="Member">Member</option>' +
            '<option value="Vendor">Vendor</option>' +
            '<option value="Staff">Staff</option>' +
          '</select>' +
          '<button type="button" id="btn-person-lookup-edit-mode" onclick="togglePersonLookupEditMode()" style="background:#475569; color:#fff; border:1px solid #64748b; padding:5px 12px; border-radius:3px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.15s ease;" title="Click to enable Edit Mode (allows altering person on double-click)">' +
            '<i class="bi bi-pencil"></i> Edit Mode: OFF' +
          '</button>' +
          '<button type="button" id="btn-person-lookup-add" onclick="redirectToPersonMasterAdd()" style="background:#2E7D32; color:#fff; border:none; padding:5px 14px; border-radius:3px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;">' +
            '+ Add New' +
          '</button>' +
          '<button type="button" onclick="closePersonLookupModal()" style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer; line-height:1; font-weight:bold; padding:0 4px;">✕</button>' +
        '</div>' +
      '</div>' +

      '<!-- EDIT MODE HINT BANNER -->' +
      '<div id="person-lookup-edit-hint" style="display:none; background:#fffbeb; color:#92400e; border-bottom:1px solid #fde68a; padding:6px 14px; font-size:11px; font-weight:700; align-items:center; gap:6px; flex-shrink:0;">' +
        '<i class="bi bi-pencil-square" style="color:#d97706; font-size:13px;"></i>' +
        '<span id="person-lookup-edit-hint-text"><strong>EDIT MODE ACTIVE:</strong> Double-click on any record to open its Alter space in Master.</span>' +
      '</div>' +

      '<!-- SEARCH BAR -->' +
      '<div style="padding:10px 14px; background:#f8fafc; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; gap:10px; flex-shrink:0;">' +
        '<div style="position:relative; flex:1;">' +
          '<i class="bi bi-search" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#64748b; font-size:13px;"></i>' +
          '<input type="text" id="person-lookup-search" oninput="filterPersonLookupTable()" placeholder="Type Code, Name, Category, Phone to search..." style="width:100%; height:32px; padding:4px 10px 4px 32px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; outline:none; box-sizing:border-box;">' +
        '</div>' +
      '</div>' +

      '<!-- TABLE BODY CONTAINER -->' +
      '<div style="flex:1; overflow-y:auto; min-height:260px; max-height:420px; background:#fff;">' +
        '<table style="width:100%; border-collapse:collapse; font-size:11.5px; table-layout:fixed;">' +
          '<thead id="person-lookup-thead">' +
            '<!-- Dynamic thead -->' +
          '</thead>' +
          '<tbody id="person-lookup-tbody">' +
            '<!-- Rendered rows -->' +
          '</tbody>' +
        '</table>' +
      '</div>' +

      '<!-- FOOTER -->' +
      '<div style="padding:8px 16px; background:#f8fafc; border-top:1px solid #cbd5e1; display:flex; justify-content:flex-end; flex-shrink:0;">' +
        '<button type="button" onclick="closePersonLookupModal()" style="background:#fff; color:#334155; border:1px solid #cbd5e1; padding:6px 20px; font-size:11px; font-weight:700; border-radius:3px; cursor:pointer;">CANCEL</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(div);
  return div;
}

function togglePersonLookupEditMode() {
  _isPersonLookupEditMode = !_isPersonLookupEditMode;
  var btn = document.getElementById('btn-person-lookup-edit-mode');
  var hint = document.getElementById('person-lookup-edit-hint');
  if (btn) {
    if (_isPersonLookupEditMode) {
      btn.style.background = '#d97706';
      btn.style.borderColor = '#b45309';
      btn.style.boxShadow = '0 0 8px rgba(217,119,6,0.6)';
      btn.innerHTML = '<i class="bi bi-pencil-square"></i> Edit Mode: ON';
      btn.title = 'Edit Mode is ON: Double-click any record to alter it in Master';
    } else {
      btn.style.background = '#475569';
      btn.style.borderColor = '#64748b';
      btn.style.boxShadow = 'none';
      btn.innerHTML = '<i class="bi bi-pencil"></i> Edit Mode: OFF';
      btn.title = 'Click to enable Edit Mode (allows altering records on double-click)';
    }
  }
  if (hint) {
    hint.style.display = _isPersonLookupEditMode ? 'flex' : 'none';
  }

  var list = _cachedMasterPersons[_activePersonLookupType] || [];
  var searchInp = document.getElementById('person-lookup-search');
  var query = (searchInp ? searchInp.value : '').toLowerCase().trim();
  if (!query) {
    renderPersonLookupTable(list);
  } else {
    filterPersonLookupTable();
  }
}

async function switchPersonLookupType(newType) {
  _activePersonLookupType = newType || 'Member';
  var titleEl = document.getElementById('person-lookup-title');
  var addBtn = document.getElementById('btn-person-lookup-add');
  var hintText = document.getElementById('person-lookup-edit-hint-text');
  var sel = document.getElementById('person-lookup-type-sel');
  if (sel) sel.value = _activePersonLookupType;

  if (titleEl) titleEl.textContent = 'SELECT ' + _activePersonLookupType.toUpperCase() + ' — ' + _activePersonLookupType.toUpperCase() + ' MASTER';
  if (addBtn) addBtn.innerHTML = '+ Add New ' + _activePersonLookupType;
  if (hintText) hintText.innerHTML = '<strong>EDIT MODE ACTIVE:</strong> Double-click on any ' + _activePersonLookupType.toLowerCase() + ' to open its Alter space in Master.';

  // Also sync form person type select if exists
  var formTypeEl = document.getElementById(_activePersonLookupTypeSelectId);
  if (formTypeEl && formTypeEl.value !== _activePersonLookupType) {
    formTypeEl.value = _activePersonLookupType;
    if (typeof onPersonTypeChange === 'function') {
      onPersonTypeChange();
    }
  }

  var list = await fetchMasterPersons(_activePersonLookupType);
  renderPersonLookupTable(list);
}

async function openPersonLookupModal(targetSelectId, personTypeSelectId, onSelectCb) {
  _activePersonLookupTargetSelectId = targetSelectId || 'frm-person-name';
  _activePersonLookupTypeSelectId = personTypeSelectId || 'frm-person-type';
  _activePersonLookupOnSelectCallback = (typeof onSelectCb === 'function') ? onSelectCb : null;

  var typeEl = document.getElementById(_activePersonLookupTypeSelectId);
  _activePersonLookupType = (typeEl && typeEl.value) ? typeEl.value : 'Member';

  var modal = ensurePersonLookupModalDom();
  var searchInp = document.getElementById('person-lookup-search');
  if (searchInp) searchInp.value = '';

  modal.style.display = 'flex';
  await switchPersonLookupType(_activePersonLookupType);

  if (searchInp) {
    setTimeout(function () { searchInp.focus(); }, 50);
  }
}

function closePersonLookupModal() {
  var modal = document.getElementById('modal-person-lookup');
  if (modal) modal.style.display = 'none';
}

function filterPersonLookupTable() {
  var searchInp = document.getElementById('person-lookup-search');
  var query = (searchInp ? searchInp.value : '').toLowerCase().trim();
  var list = _cachedMasterPersons[_activePersonLookupType] || [];

  if (!query) {
    renderPersonLookupTable(list);
    return;
  }

  var filtered = list.filter(function (p) {
    var c = (p.code || '').toLowerCase();
    var n = (p.name || '').toLowerCase();
    var cat = (p.category || p.designation || '').toLowerCase();
    var phone = (p.contact || '').toLowerCase();
    var flat = (p.flatNo || '').toLowerCase();
    return c.indexOf(query) !== -1 || n.indexOf(query) !== -1 || cat.indexOf(query) !== -1 || phone.indexOf(query) !== -1 || flat.indexOf(query) !== -1;
  });

  renderPersonLookupTable(filtered);
}

function renderPersonLookupTable(list) {
  var thead = document.getElementById('person-lookup-thead');
  var tbody = document.getElementById('person-lookup-tbody');
  if (!tbody || !thead) return;

  var pType = _activePersonLookupType || 'Vendor';

  // Render dynamic header
  if (pType === 'Vendor') {
    thead.innerHTML = '<tr style="background:#1565C0; color:#fff; position:sticky; top:0; z-index:2;">' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:130px;">VENDOR CODE</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:150px;">CATEGORY</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1;">VENDOR NAME</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:130px;">CONTACT NO</th>' +
      '<th style="padding:8px 12px; text-align:right; font-weight:700; border-right:1px solid #0D47A1; width:130px;">MONTHLY COST</th>' +
      '<th style="padding:8px 12px; text-align:center; font-weight:700; width:100px;">TDS SEC.</th>' +
    '</tr>';
  } else if (pType === 'Staff') {
    thead.innerHTML = '<tr style="background:#1565C0; color:#fff; position:sticky; top:0; z-index:2;">' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:130px;">STAFF CODE</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:150px;">DESIGNATION</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1;">STAFF NAME</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:130px;">CONTACT NO</th>' +
      '<th style="padding:8px 12px; text-align:right; font-weight:700; border-right:1px solid #0D47A1; width:130px;">MONTHLY SALARY</th>' +
      '<th style="padding:8px 12px; text-align:center; font-weight:700; width:100px;">STATUS</th>' +
    '</tr>';
  } else {
    thead.innerHTML = '<tr style="background:#1565C0; color:#fff; position:sticky; top:0; z-index:2;">' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:130px;">FLAT / UNIT</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:90px;">WING</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1;">MEMBER NAME</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:130px;">CONTACT NO</th>' +
      '<th style="padding:8px 12px; text-align:left; font-weight:700; border-right:1px solid #0D47A1; width:120px;">MEMBER CODE</th>' +
      '<th style="padding:8px 12px; text-align:center; font-weight:700; width:90px;">STATUS</th>' +
    '</tr>';
  }

  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b; font-weight:600;">No ' + pType.toLowerCase() + ' records found in Master.</td></tr>';
    return;
  }

  var html = '';
  list.forEach(function (p, idx) {
    var bg = idx % 2 === 1 ? '#f0f9ff' : '#ffffff';
    var rowTitle = _isPersonLookupEditMode 
      ? 'Double-click to Alter ' + (p.name || pType) + ' in Master' 
      : 'Click to select ' + (p.name || pType);
    var safeCode = (p.code || p.flatNo || '').replace(/'/g, "\\'");
    var safeName = (p.name || '').replace(/'/g, "\\'");
    var pId = (typeof p.id === 'string') ? "'" + p.id.replace(/'/g, "\\'") + "'" : p.id;

    if (pType === 'Vendor') {
      html += '<tr onclick="onPersonLookupRowClick(' + pId + ', \'' + safeCode + '\', \'' + safeName + '\')" ondblclick="onPersonLookupRowDblClick(' + pId + ', \'' + safeCode + '\', \'' + safeName + '\')" title="' + rowTitle + '" style="background:' + bg + '; cursor:pointer; border-bottom:1px solid #e2e8f0; transition:background 0.1s;" onmouseover="this.style.background=\'#dbeafe\'" onmouseout="this.style.background=\'' + bg + '\'">' +
        '<td style="padding:7px 12px; font-weight:800; font-family:\'Consolas\', monospace; color:#0f172a; border-right:1px solid #e2e8f0;">' + (p.code || '—') + '</td>' +
        '<td style="padding:7px 12px; color:#1e293b; font-weight:600; border-right:1px solid #e2e8f0;">' + (p.category || 'General') + '</td>' +
        '<td style="padding:7px 12px; font-weight:700; color:#0f172a; border-right:1px solid #e2e8f0;">' + (p.name || '—') + '</td>' +
        '<td style="padding:7px 12px; color:#475569; border-right:1px solid #e2e8f0;">' + (p.contact || '—') + '</td>' +
        '<td style="padding:7px 12px; text-align:right; font-family:\'Consolas\', monospace; font-weight:700; color:#0f172a; border-right:1px solid #e2e8f0;">₹ ' + (p.cost || 0).toFixed(2) + '</td>' +
        '<td style="padding:7px 12px; text-align:center; font-weight:700; color:#1565C0;">' + (p.tds || '—') + '</td>' +
      '</tr>';
    } else if (pType === 'Staff') {
      html += '<tr onclick="onPersonLookupRowClick(' + pId + ', \'' + safeCode + '\', \'' + safeName + '\')" ondblclick="onPersonLookupRowDblClick(' + pId + ', \'' + safeCode + '\', \'' + safeName + '\')" title="' + rowTitle + '" style="background:' + bg + '; cursor:pointer; border-bottom:1px solid #e2e8f0; transition:background 0.1s;" onmouseover="this.style.background=\'#dbeafe\'" onmouseout="this.style.background=\'' + bg + '\'">' +
        '<td style="padding:7px 12px; font-weight:800; font-family:\'Consolas\', monospace; color:#0f172a; border-right:1px solid #e2e8f0;">' + (p.code || '—') + '</td>' +
        '<td style="padding:7px 12px; color:#1e293b; font-weight:600; border-right:1px solid #e2e8f0;">' + (p.category || 'Staff') + '</td>' +
        '<td style="padding:7px 12px; font-weight:700; color:#0f172a; border-right:1px solid #e2e8f0;">' + (p.name || '—') + '</td>' +
        '<td style="padding:7px 12px; color:#475569; border-right:1px solid #e2e8f0;">' + (p.contact || '—') + '</td>' +
        '<td style="padding:7px 12px; text-align:right; font-family:\'Consolas\', monospace; font-weight:700; color:#0f172a; border-right:1px solid #e2e8f0;">₹ ' + (p.cost || 0).toFixed(2) + '</td>' +
        '<td style="padding:7px 12px; text-align:center; font-weight:700; color:#15803d;">' + (p.status || 'Active') + '</td>' +
      '</tr>';
    } else {
      html += '<tr onclick="onPersonLookupRowClick(' + pId + ', \'' + safeCode + '\', \'' + safeName + '\')" ondblclick="onPersonLookupRowDblClick(' + pId + ', \'' + safeCode + '\', \'' + safeName + '\')" title="' + rowTitle + '" style="background:' + bg + '; cursor:pointer; border-bottom:1px solid #e2e8f0; transition:background 0.1s;" onmouseover="this.style.background=\'#dbeafe\'" onmouseout="this.style.background=\'' + bg + '\'">' +
        '<td style="padding:7px 12px; font-weight:800; font-family:\'Consolas\', monospace; color:#0f172a; border-right:1px solid #e2e8f0;">' + (p.flatNo || '—') + '</td>' +
        '<td style="padding:7px 12px; color:#1e293b; font-weight:600; border-right:1px solid #e2e8f0;">' + (p.wing || '—') + '</td>' +
        '<td style="padding:7px 12px; font-weight:700; color:#0f172a; border-right:1px solid #e2e8f0;">' + (p.name || '—') + '</td>' +
        '<td style="padding:7px 12px; color:#475569; border-right:1px solid #e2e8f0;">' + (p.contact || '—') + '</td>' +
        '<td style="padding:7px 12px; font-family:\'Consolas\', monospace; color:#0f172a; border-right:1px solid #e2e8f0;">' + (p.code || '—') + '</td>' +
        '<td style="padding:7px 12px; text-align:center; font-weight:700; color:#15803d;">' + (p.status || 'Active') + '</td>' +
      '</tr>';
    }
  });

  tbody.innerHTML = html;
}

function onPersonLookupRowClick(id, code, name) {
  if (_isPersonLookupEditMode) {
    if (typeof window.showToast === 'function') {
      window.showToast('Edit Mode ON: Double-click ' + (name || code || 'person') + ' to open Alter space.', 'info');
    }
  } else {
    selectPersonFromLookup(id);
  }
}

function onPersonLookupRowDblClick(id, code, name) {
  if (_isPersonLookupEditMode) {
    redirectToPersonMasterAlter(id, code, name);
  } else {
    selectPersonFromLookup(id);
  }
}

function selectPersonFromLookup(id) {
  var pType = _activePersonLookupType || 'Vendor';
  var list = _cachedMasterPersons[pType] || [];
  var found = list.find(function (p) { return String(p.id) === String(id) || String(p.code) === String(id) || String(p.name) === String(id); });
  if (!found) return;

  var sel = document.getElementById(_activePersonLookupTargetSelectId);
  var label = found.name;

  // Sync with combobox wrapper if present
  var inp = document.getElementById(_activePersonLookupTargetSelectId + '-combo-inp');
  if (inp && typeof _setComboValue === 'function') {
    _setComboValue(_activePersonLookupTargetSelectId, found.id, label);
  } else if (sel) {
    var optExists = false;
    for (var i = 0; i < sel.options.length; i++) {
      var optVal = String(sel.options[i].value || '').toLowerCase();
      var optTxt = String(sel.options[i].text || '').toLowerCase();
      var fId = String(found.id || '').toLowerCase();
      var fCode = String(found.code || '').toLowerCase();
      var fName = String(found.name || '').toLowerCase();

      if ((fId && optVal === fId) ||
          (fName && (optVal === fName || optVal.includes(fName) || optTxt.includes(fName))) ||
          (fCode && (optVal.includes(fCode) || optTxt.includes(fCode)))) {
        sel.selectedIndex = i;
        optExists = true;
        break;
      }
    }
    if (!optExists) {
      var opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      sel.appendChild(opt);
      sel.value = label;
    }
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (typeof _activePersonLookupOnSelectCallback === 'function') {
    _activePersonLookupOnSelectCallback(found);
  } else if (typeof window.onPersonSelect === 'function') {
    window.onPersonSelect();
  }

  closePersonLookupModal();
  if (typeof window.showToast === 'function') {
    window.showToast('Selected ' + pType + ': ' + label, 'success');
  }
}

function redirectToPersonMasterAdd() {
  closePersonLookupModal();
  var pType = _activePersonLookupType || 'Vendor';
  var targetModule = (pType === 'Staff') ? 'staff-master' : ((pType === 'Member') ? 'member-master' : 'vendor-master');

  if (window.WorkspaceBridge && typeof window.WorkspaceBridge.openModule === 'function') {
    window.WorkspaceBridge.openModule(targetModule, 'action=add');
  } else if (window.parent && window.parent.WorkspaceManager && typeof window.parent.WorkspaceManager.openModule === 'function') {
    window.parent.WorkspaceManager.openModule(targetModule, 'action=add');
  } else {
    window.location.href = '../../master/' + targetModule + '/' + targetModule + '.html?action=add';
  }
}

function redirectToPersonMasterAlter(id, code, name) {
  closePersonLookupModal();
  var pType = _activePersonLookupType || 'Vendor';
  var targetModule = (pType === 'Staff') ? 'staff-master' : ((pType === 'Member') ? 'member-master' : 'vendor-master');

  var payload = { id: id, code: code || '', name: name || '' };
  var storageKey = 'jeevika_' + (targetModule.replace(/-/g, '_')) + '_pending_alter';
  sessionStorage.setItem(storageKey, JSON.stringify(payload));

  var query = 'action=alter&id=' + encodeURIComponent(id) + (code ? '&code=' + encodeURIComponent(code) : '') + (name ? '&name=' + encodeURIComponent(name) : '');

  // Send message to open frame if already active
  try {
    var frame = document.getElementById('moduleFrame') || (window.parent && window.parent.document.getElementById('moduleFrame'));
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ action: 'alter', id: id, code: code, name: name }, '*');
    }
  } catch (e) {}

  if (window.WorkspaceBridge && typeof window.WorkspaceBridge.openModule === 'function') {
    window.WorkspaceBridge.openModule(targetModule, query);
  } else if (window.parent && window.parent.WorkspaceManager && typeof window.parent.WorkspaceManager.openModule === 'function') {
    window.parent.WorkspaceManager.openModule(targetModule, query);
  } else {
    window.location.href = '../../master/' + targetModule + '/' + targetModule + '.html?' + query;
  }
}

// ── SEARCHABLE ACCOUNT COMBOBOX ──────────────────────────────────────────────
// Replaces a plain <select id="selectId"> with a type-to-search combobox.
// Filters by account code AND account name in real-time.
// Compatible with selectAccountFromLookup() — both sources sync to same hidden value.

var _comboAccountsMap = {};
var _comboRenderMap = {};

function _escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function focusNextFormControl(currentEl) {
  if (!currentEl) return;
  var container = currentEl.closest('.form-left-panel') ||
                  currentEl.closest('.form-main-container') ||
                  currentEl.closest('.pe-form-panel') ||
                  currentEl.closest('.ore-form-panel') ||
                  currentEl.closest('#pe-section-form') ||
                  currentEl.closest('#ore-section-form') ||
                  currentEl.closest('#jv-section-form') ||
                  currentEl.closest('#ce-section-form') ||
                  currentEl.closest('#po-section-form') ||
                  currentEl.closest('form') ||
                  document.body;

  var focusables = Array.from(container.querySelectorAll(
    'input:not([type="hidden"]):not([disabled]):not([readonly]):not([style*="display: none"]):not([style*="display:none"]), select:not([disabled]):not([style*="display: none"]):not([style*="display:none"]), textarea:not([disabled]), button.btn-confirm:not([disabled]), button#btn-confirm:not([disabled]), button[onclick*="confirmAddLineItem"]:not([disabled])'
  )).filter(function(el) {
    return el.offsetParent !== null && !el.closest('[style*="display: none"]') && !el.closest('[style*="display:none"]');
  });

  var idx = focusables.indexOf(currentEl);
  if (idx !== -1 && idx < focusables.length - 1) {
    var nextEl = focusables[idx + 1];
    nextEl.focus();
    if (typeof nextEl.select === 'function' && nextEl.type !== 'button') {
      nextEl.select();
    }
  }
}

function initAccountSearchCombobox(selectId, accountsList) {
  var sel = document.getElementById(selectId);
  if (!sel) return;

  // Store accounts for re-use
  _comboAccountsMap[selectId] = accountsList || [];

  // If wrapper already exists, just refresh account list and keep closed
  var existingWrap = document.getElementById(selectId + '-combo-wrap');
  if (existingWrap) {
    var existingInp = document.getElementById(selectId + '-combo-inp');
    if (existingInp && (!sel.value || sel.value === '')) {
      existingInp.value = '';
    }
    var existingPanel = document.getElementById(selectId + '-combo-panel');
    if (existingPanel) {
      existingPanel.style.display = 'none';
    }
    if (typeof _comboRenderMap[selectId] === 'function') {
      _comboRenderMap[selectId]('', false);
    }
    return;
  }

  // --- Build wrapper in place of the <select> ---
  var wrapper = document.createElement('div');
  wrapper.id = selectId + '-combo-wrap';
  wrapper.style.cssText = 'position:relative; flex:1; min-width:0;';

  // Text input (visible)
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.id = selectId + '-combo-inp';
  inp.autocomplete = 'off';
  inp.spellcheck = false;
  inp.placeholder = '\u2014 Select \u2014';
  inp.style.cssText = [
    'width:100%', 'box-sizing:border-box',
    'height:28px', 'padding:3px 28px 3px 8px',
    'border:1px solid #94a3b8', 'border-radius:3px',
    'font-size:12px', 'font-weight:600', 'color:#0f172a',
    'font-family:inherit', 'outline:none', 'background:#fff',
    'cursor:text'
  ].join(';');

  // Dropdown arrow pseudo-decoration
  var arrow = document.createElement('span');
  arrow.style.cssText = 'position:absolute; right:7px; top:50%; transform:translateY(-50%); cursor:pointer; color:#64748b; font-size:10px; padding:4px; user-select:none; z-index:2;';
  arrow.innerHTML = '&#9660;';

  // Dropdown list panel
  var panel = document.createElement('div');
  panel.id = selectId + '-combo-panel';
  panel.style.cssText = [
    'display:none', 'position:absolute', 'top:calc(100% + 1px)', 'left:0', 'right:0',
    'background:#fff', 'border:1px solid #1565C0', 'border-radius:0 0 4px 4px',
    'max-height:230px', 'overflow-y:auto',
    'z-index:99998', 'box-shadow:0 6px 18px rgba(0,0,0,0.18)'
  ].join(';');

  wrapper.appendChild(inp);
  wrapper.appendChild(arrow);
  wrapper.appendChild(panel);

  // Insert wrapper just before the hidden select; keep select in DOM (for value)
  sel.parentNode.insertBefore(wrapper, sel);
  sel.style.display = 'none';
  sel.style.width = '0';
  sel.style.height = '0';

  var activeIndex = -1;

  function _highlightItem(items, idx) {
    items.forEach(function(el, i) {
      if (i === idx) {
        el.style.background = '#1565C0';
        el.style.color = '#ffffff';
        el.scrollIntoView({ block: 'nearest' });
      } else {
        var isCurrent = (String(el.dataset.id) === String(sel.value));
        el.style.background = isCurrent ? '#E3F2FD' : (i % 2 === 0 ? '#ffffff' : '#f0f9ff');
        el.style.color = '#0f172a';
      }
    });
  }

  // ---- Internal render ----
  function renderList(query, showPanel) {
    var accs = _comboAccountsMap[selectId] || [];
    var q = (query || '').toLowerCase().trim();
    var curSelectedLabel = (sel && sel.options[sel.selectedIndex]) ? (sel.options[sel.selectedIndex].text || '').toLowerCase().trim() : '';

    // If query is blank OR matches the current selected label exactly, show ALL accounts!
    var isShowingAll = (!q || q === curSelectedLabel || (inp.dataset.selectedLabel && q === inp.dataset.selectedLabel.toLowerCase().trim()));

    var filtered = isShowingAll ? accs : accs.filter(function(a) {
      var code = (a.accCode || '').toLowerCase();
      var name = (a.accName || '').toLowerCase();
      var full1 = (code + ' - ' + name);
      var full2 = (code + ' ' + name);
      return code.indexOf(q) !== -1 ||
             name.indexOf(q) !== -1 ||
             full1.indexOf(q) !== -1 ||
             full2.indexOf(q) !== -1;
    });

    activeIndex = -1;

    if (filtered.length === 0) {
      panel.innerHTML = '<div style="padding:10px 12px; color:#94a3b8; font-size:12px; font-weight:600;">No records found</div>';
    } else {
      panel.innerHTML = filtered.map(function(a, i) {
        var isCurrent = (String(a.accountId) === String(sel.value));
        var bg = isCurrent ? '#E3F2FD' : (i % 2 === 0 ? '#ffffff' : '#f0f9ff');
        var borderLeft = isCurrent ? 'border-left:4px solid #1565C0;' : '';
        var fontWt = isCurrent ? 'font-weight:800;' : 'font-weight:600;';
        var code = _escHtml(a.accCode || '');
        var name = _escHtml(a.accName || '');
        var fullLabel = (a.accCode && !a.accName.includes(a.accCode)) ? (a.accCode + ' - ' + a.accName) : a.accName;
        return '<div data-id="' + a.accountId + '" data-label="' + _escHtml(fullLabel).replace(/"/g,'&quot;') + '" ' +
          'style="padding:6px 12px; font-size:12px; ' + fontWt + ' background:' + bg + '; cursor:pointer; border-bottom:1px solid #e2e8f0; ' + borderLeft + ' white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" ' +
          'onmouseover="this.style.background=\'#1565C0\'; this.style.color=\'#fff\';" ' +
          'onmouseout="this.style.background=\'' + bg + '\'; this.style.color=\'#0f172a\';">' +
          (code ? ('<span style="font-family:Consolas,monospace; font-weight:800; color:inherit; margin-right:6px;">' + code + '</span>') : '') +
          name +
          '</div>';
      }).join('');
    }

    if (showPanel === true) {
      panel.style.display = 'block';
      // Auto-scroll to selected item if visible
      setTimeout(function() {
        var curItem = panel.querySelector('[style*="border-left"]');
        if (curItem) curItem.scrollIntoView({ block: 'nearest' });
      }, 0);
    } else {
      panel.style.display = 'none';
    }
  }

  _comboRenderMap[selectId] = renderList;

  // ---- Events ----
  inp.addEventListener('focus', function() {
    // Only select text on focus; do not force open dropdown menu automatically
    setTimeout(function() {
      if (document.activeElement === inp && typeof inp.select === 'function') {
        inp.select();
      }
    }, 10);
  });

  inp.addEventListener('click', function() {
    renderList('', true); // Always show all accounts when clicked
    if (typeof inp.select === 'function') inp.select();
  });

  inp.addEventListener('input', function() {
    renderList(inp.value, true);
  });

  arrow.addEventListener('click', function(e) {
    e.stopPropagation();
    if (panel.style.display === 'block') {
      panel.style.display = 'none';
    } else {
      inp.focus();
      renderList('', true);
    }
  });

  inp.addEventListener('keydown', function(e) {
    var items = panel.querySelectorAll('[data-id]');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (panel.style.display !== 'block') {
        renderList('', true);
        items = panel.querySelectorAll('[data-id]');
      }
      if (items.length > 0) {
        activeIndex = (activeIndex + 1) % items.length;
        _highlightItem(items, activeIndex);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (panel.style.display !== 'block') {
        renderList('', true);
        items = panel.querySelectorAll('[data-id]');
      }
      if (items.length > 0) {
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        _highlightItem(items, activeIndex);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (panel.style.display === 'block' && items.length > 0) {
        var targetItem = (activeIndex >= 0 && activeIndex < items.length) ? items[activeIndex] : items[0];
        if (targetItem) {
          _setComboValue(selectId, targetItem.dataset.id, targetItem.dataset.label);
        }
        panel.style.display = 'none';
      }
      focusNextFormControl(inp);
    } else if (e.key === 'Tab') {
      if (panel.style.display === 'block' && items.length > 0 && activeIndex >= 0) {
        var targetItem = items[activeIndex];
        if (targetItem) {
          _setComboValue(selectId, targetItem.dataset.id, targetItem.dataset.label);
        }
        panel.style.display = 'none';
      }
    } else if (e.key === 'Escape') {
      panel.style.display = 'none';
    }
  });

  panel.addEventListener('mousedown', function(e) {
    var item = e.target.closest('[data-id]');
    if (!item) return;
    e.preventDefault();
    _setComboValue(selectId, item.dataset.id, item.dataset.label);
    focusNextFormControl(inp);
  });

  // Close on outside click
  document.addEventListener('mousedown', function(e) {
    if (!wrapper.contains(e.target)) {
      panel.style.display = 'none';
    }
  });

  // Focus style
  inp.addEventListener('focus', function() { inp.style.borderColor = '#1565C0'; inp.style.boxShadow = '0 0 0 2px rgba(21,101,192,0.15)'; });
  inp.addEventListener('blur', function()  { inp.style.borderColor = '#94a3b8'; inp.style.boxShadow = ''; });
}

// Global Enter key advancing across form controls
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    var target = e.target;
    if (!target) return;
    var tag = target.tagName ? target.tagName.toUpperCase() : '';
    if (tag === 'TEXTAREA' || (tag === 'BUTTON' && target.type === 'submit')) return;

    if (tag === 'INPUT' || tag === 'SELECT') {
      // If it's a combobox input, let its keydown listener handle it
      if (target.id && target.id.endsWith('-combo-inp')) {
        return;
      }

      // If on entry-amount, trigger Confirm button directly
      if (target.id === 'entry-amount' || target.id === 'frm-amount') {
        var confirmBtn = document.getElementById('btn-confirm') ||
                         document.querySelector('button[onclick*="confirmAddLineItem"]') ||
                         document.querySelector('.btn-confirm');
        if (confirmBtn && typeof confirmBtn.click === 'function') {
          e.preventDefault();
          confirmBtn.click();
          setTimeout(function() {
            var accComboInp = document.getElementById('entry-acc-sel-combo-inp') ||
                              document.getElementById('entry-acc-sel') ||
                              document.getElementById('frm-account-combo-inp');
            if (accComboInp) {
              accComboInp.focus();
              if (accComboInp.select) accComboInp.select();
            }
          }, 50);
          return;
        }
      }

      e.preventDefault();
      focusNextFormControl(target);
    }
  }
});

// Set combobox display value and underlying hidden select
function _setComboValue(selectId, accountId, label) {
  var sel = document.getElementById(selectId);
  var inp = document.getElementById(selectId + '-combo-inp');
  var panel = document.getElementById(selectId + '-combo-panel');

  if (inp) {
    inp.value = label || '';
    inp.dataset.selectedId = accountId || '';
    inp.dataset.selectedLabel = label || '';
  }
  if (panel) { panel.style.display = 'none'; }

  if (sel) {
    var exists = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (String(sel.options[i].value) === String(accountId || '')) {
        sel.selectedIndex = i;
        exists = true;
        break;
      }
    }
    if (!exists && accountId) {
      var opt = document.createElement('option');
      opt.value = accountId;
      opt.textContent = label;
      opt.selected = true;
      sel.appendChild(opt);
    }
    sel.value = accountId || '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (label && typeof window.showToast === 'function') {
    window.showToast('Account selected: ' + label, 'success');
  }
}

// ── UPDATED selectAccountFromLookup — also syncs combobox ───────────────────
function selectAccountFromLookup(accId) {
  var list = _cachedMasterAccounts || getStandardMasterAccounts();
  var found = list.find(function(a) { return String(a.accountId) === String(accId); });
  if (!found) return;

  var label = (found.accCode ? found.accCode + ' - ' : '') + found.accName;

  // Update combobox if present
  var inp = document.getElementById(_activeLookupTargetSelectId + '-combo-inp');
  if (inp) {
    _setComboValue(_activeLookupTargetSelectId, found.accountId, label);
  } else {
    // Fallback: update raw select
    var sel = document.getElementById(_activeLookupTargetSelectId);
    if (sel) {
      var optExists = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (String(sel.options[i].value) === String(found.accountId) || sel.options[i].value === found.accCode) {
          sel.selectedIndex = i;
          optExists = true;
          break;
        }
      }
      if (!optExists) {
        var opt = document.createElement('option');
        opt.value = found.accountId;
        opt.textContent = label;
        sel.appendChild(opt);
        sel.value = found.accountId;
      }
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  if (typeof _activeLookupOnSelectCallback === 'function') {
    _activeLookupOnSelectCallback(found);
  }

  closeAccountLookupModal();
  if (typeof window.showToast === 'function') {
    window.showToast('Account selected: ' + label, 'success');
  }
}

if (typeof window !== 'undefined') {
  window.getBillTypeConfiguredHeads = getBillTypeConfiguredHeads;
  window.getStandardMasterAccounts = getStandardMasterAccounts;
  window.fetchMasterAccounts = fetchMasterAccounts;
  window.openAccountLookupModal = openAccountLookupModal;
  window.closeAccountLookupModal = closeAccountLookupModal;
  window.filterAccountLookupTable = filterAccountLookupTable;
  window.toggleAccountLookupEditMode = toggleAccountLookupEditMode;
  window.onAccountLookupRowClick = onAccountLookupRowClick;
  window.onAccountLookupRowDblClick = onAccountLookupRowDblClick;
  window.redirectToAccountMasterAlter = redirectToAccountMasterAlter;
  window.selectAccountFromLookup = selectAccountFromLookup;
  window.redirectToAccountMasterAdd = redirectToAccountMasterAdd;
  window.initAccountSearchCombobox = initAccountSearchCombobox;
  window.setAccountSearchComboboxValue = _setComboValue;

  // Date helpers
  window.toIsoDate = function (dateStr) {
    if (!dateStr || String(dateStr).trim() === '' || dateStr === '-') return null;
    var s = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split('T')[0];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      var p = s.split('/');
      return p[2] + '-' + p[1] + '-' + p[0];
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      var p2 = s.split('-');
      return p2[2] + '-' + p2[1] + '-' + p2[0];
    }
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return null;
  };

  // Person Master Lookup
  window.fetchMasterPersons = fetchMasterPersons;
  window.openPersonLookupModal = openPersonLookupModal;
  window.closePersonLookupModal = closePersonLookupModal;
  window.filterPersonLookupTable = filterPersonLookupTable;
  window.togglePersonLookupEditMode = togglePersonLookupEditMode;
  window.switchPersonLookupType = switchPersonLookupType;
  window.onPersonLookupRowClick = onPersonLookupRowClick;
  window.onPersonLookupRowDblClick = onPersonLookupRowDblClick;
  window.selectPersonFromLookup = selectPersonFromLookup;
  window.redirectToPersonMasterAdd = redirectToPersonMasterAdd;
  window.redirectToPersonMasterAlter = redirectToPersonMasterAlter;
}

// ═════════════════════════════════════════════════════════════════
// GLOBAL AMOUNT INPUT SMART CLEAR & AUTO-SELECT HANDLER
// Ensures 0.00 defaults are never accidentally appended to (e.g. 500 => 5000)
// ═════════════════════════════════════════════════════════════════
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    
    var isAmount = el.type === 'number' ||
                   el.classList.contains('amount-inp') ||
                   el.classList.contains('form-inp') ||
                   el.classList.contains('form-input') ||
                   (el.id && /amount|principal|interest|rate|price|amt|total|diff|charge|tax|qty|fine/i.test(el.id)) ||
                   (el.placeholder && /0\.00|0|amount|0\.0/i.test(el.placeholder));

    if (isAmount && !el.readOnly && !el.disabled) {
      var val = (el.value || '').trim();
      if (val === '0' || val === '0.00' || val === '0.0' || (val !== '' && !isNaN(val) && parseFloat(val) === 0)) {
        el.value = '';
      } else if (val !== '' && typeof el.select === 'function') {
        setTimeout(function () {
          try { el.select(); } catch (_) {}
        }, 10);
      }
    }
  }, true);

  // ═════════════════════════════════════════════════════════════════
  // GLOBAL 4-DIGIT YEAR RESTRICTION & SANITIZATION
  // Restricts all Date and Year inputs strictly to 4-digit years
  // ═════════════════════════════════════════════════════════════════
  function sanitizeDateInput(el) {
    if (!el) return;
    if (el.type === 'date') {
      if (!el.getAttribute('max')) el.setAttribute('max', '2099-12-31');
      if (!el.getAttribute('min')) el.setAttribute('min', '1900-01-01');
      var v = el.value || '';
      if (v) {
        var parts = v.split('-');
        if (parts.length === 3 && parts[0].length > 4) {
          var y = parseInt(parts[0].slice(0, 4), 10);
          if (y > 2099) y = 2099;
          if (y < 1900) y = 1900;
          el.value = y + '-' + parts[1] + '-' + parts[2];
        }
      }
    } else if (el.type === 'number' || el.type === 'text') {
      if (el.id && /year|fy|yr/i.test(el.id)) {
        if (el.value && el.value.length > 4) {
          el.value = el.value.slice(0, 4);
        }
      }
    }
  }

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (el.type === 'date' || (el.id && /year|fy|yr/i.test(el.id))) {
      sanitizeDateInput(el);
    }
  }, true);

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (el.type === 'date' || (el.id && /year|fy|yr/i.test(el.id))) {
      sanitizeDateInput(el);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var dateInputs = document.querySelectorAll('input[type="date"]');
      dateInputs.forEach(function (inp) {
        if (!inp.getAttribute('max')) inp.setAttribute('max', '2099-12-31');
        if (!inp.getAttribute('min')) inp.setAttribute('min', '1900-01-01');
      });
    });
  } else {
    var dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(function (inp) {
      if (!inp.getAttribute('max')) inp.setAttribute('max', '2099-12-31');
      if (!inp.getAttribute('min')) inp.setAttribute('min', '1900-01-01');
    });
  }
}

// ═════════════════════════════════════════════════════════════════
// UNIFIED MULTI-SELECT & MULTI-CHANGE ENGINE
// Provides consistent multi-select checkboxes & bulk updates across all transaction modules
// ═════════════════════════════════════════════════════════════════
window.ERP_MultiChange = (function () {
  var selectedIds = new Set();
  var currentConfig = null;

  function init(config) {
    currentConfig = config;
    selectedIds.clear();
    updateBadge();
  }

  function getSelectedIds() {
    return Array.from(selectedIds);
  }

  function toggleSelectAll(checked, allIds) {
    if (checked && Array.isArray(allIds)) {
      allIds.forEach(function (id) { selectedIds.add(String(id)); });
    } else {
      selectedIds.clear();
    }
    var chks = document.querySelectorAll('.row-chk');
    chks.forEach(function (chk) { chk.checked = checked; });
    updateBadge();
  }

  function onRowCheckChange(id, checked) {
    if (checked) selectedIds.add(String(id));
    else selectedIds.delete(String(id));
    
    var allChks = document.querySelectorAll('.row-chk');
    var chkAll = document.getElementById('chk-select-all');
    if (chkAll) {
      chkAll.checked = allChks.length > 0 && Array.from(allChks).every(function (c) { return c.checked; });
    }
    updateBadge();
  }

  function updateBadge() {
    var badges = document.querySelectorAll('.mc-sel-badge, #mc-sel-badge');
    badges.forEach(function (b) {
      if (selectedIds.size > 0) {
        b.style.display = 'inline-block';
        b.textContent = selectedIds.size + ' Selected';
      } else {
        b.style.display = 'none';
        b.textContent = '0';
      }
    });
  }

  function isSelected(id) {
    return selectedIds.has(String(id));
  }

  function renderCheckbox(id) {
    var chk = isSelected(id) ? 'checked' : '';
    return '<td style="width:36px; text-align:center; padding:2px 4px;" onclick="event.stopPropagation()">' +
           '<input type="checkbox" class="row-chk" value="' + id + '" ' + chk + ' onchange="ERP_MultiChange.onRowCheckChange(\'' + id + '\', this.checked)">' +
           '</td>';
  }

  function renderHeaderCheckbox(allIdsExpr) {
    return '<th style="width:36px; text-align:center; padding:2px 4px;">' +
           '<input type="checkbox" id="chk-select-all" onclick="ERP_MultiChange.toggleSelectAll(this.checked, ' + allIdsExpr + ')" title="Select / Deselect All">' +
           '</th>';
  }

  async function executeMultiChange(options) {
    var field = options.field;
    var newVal = options.newVal;
    var fromNo = (options.fromNo || '').trim().toLowerCase();
    var toNo = (options.toNo || '').trim().toLowerCase();
    var list = options.list || [];
    var idKey = options.idKey || 'voucherId';
    var noKey = options.noKey || 'voucherNo';

    var targetList = [];
    if (selectedIds.size > 0) {
      targetList = list.filter(function (item) {
        return selectedIds.has(String(item[idKey] || item.voucherId || item.id));
      });
    } else if (fromNo && toNo) {
      targetList = list.filter(function (item) {
        var no = (item[noKey] || item.voucherNo || '').trim().toLowerCase();
        return no >= fromNo && no <= toNo;
      });
    }

    if (targetList.length === 0) {
      alert('No matching entries found to update.');
      return 0;
    }

    // Apply to in-memory list
    targetList.forEach(function (item) {
      item[field] = newVal;
      if (field === 'particular1') item.narration = newVal;
      if (field === 'narration') item.particular1 = newVal;
    });

    // Sync to backend API
    var voucherIds = targetList.map(function (item) {
      return parseInt(item.voucherId || item[idKey], 10);
    }).filter(function (id) {
      return id > 0 && id < 1000000000000;
    });

    var payload = {
      societyId: parseInt(typeof getActiveSocietyId === 'function' ? getActiveSocietyId() : 1, 10),
      fyId: parseInt(typeof getFyId === 'function' ? getFyId() : 1, 10),
      voucherIds: voucherIds.length > 0 ? voucherIds : null,
      fromVoucherNo: voucherIds.length === 0 ? fromNo : null,
      toVoucherNo: voucherIds.length === 0 ? toNo : null,
      field: field,
      newValue: newVal
    };

    if (window.API && API.post) {
      try {
        await API.post('/api/vouchers/multi-change', payload);
      } catch (e) {
        console.warn('Backend multi-change sync warning (updated locally):', e);
      }
    }

    selectedIds.clear();
    updateBadge();
    return targetList.length;
  }

  return {
    init: init,
    getSelectedIds: getSelectedIds,
    toggleSelectAll: toggleSelectAll,
    onRowCheckChange: onRowCheckChange,
    updateBadge: updateBadge,
    isSelected: isSelected,
    renderCheckbox: renderCheckbox,
    renderHeaderCheckbox: renderHeaderCheckbox,
    executeMultiChange: executeMultiChange
  };
})();

if (typeof window !== 'undefined') {
  window.getFYDateRange = getFYDateRange;
  window.getFYDefaultDate = getFYDefaultDate;
  window.isInActiveFY = isInActiveFY;
  window.validateFYDateInput = validateFYDateInput;
  window.applyFYDateRestrictions = applyFYDateRestrictions;
}


