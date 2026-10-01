/**
 * henu-os-report-engine.js — Central HENU ERP Report Runtime Engine
 * Manages Live System Context, Active HENU OS Design Application, Formatting, and States
 */

(function (window) {
  'use strict';

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE) || 
                   (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || 
                   'http://localhost:5002/api';

  // 10 PRE-CURATED PALETTES
  const PALETTES = {
    deep_navy_crimson: { primary: '#1e3a8a', secondary: '#dc2626', bg: '#f8fafc', border: '#cbd5e1', text: '#0f172a', headerBg: '#1e3a8a', headerText: '#ffffff', zebra: '#f1f5f9' },
    luxury_charcoal_gold: { primary: '#1c1917', secondary: '#d97706', bg: '#fafaf9', border: '#e7e5e4', text: '#1c1917', headerBg: '#1c1917', headerText: '#fef3c7', zebra: '#f5f5f4' },
    executive_slate_emerald: { primary: '#334155', secondary: '#059669', bg: '#f8fafc', border: '#cbd5e1', text: '#1e293b', headerBg: '#334155', headerText: '#ffffff', zebra: '#f1f5f9' },
    tech_midnight_teal: { primary: '#090d16', secondary: '#0d9488', bg: '#f0fdfa', border: '#99f6e4', text: '#0f172a', headerBg: '#0f172a', headerText: '#2dd4bf', zebra: '#ccfbf1' },
    executive_corp_blue_mint: { primary: '#1e40af', secondary: '#10b981', bg: '#eff6ff', border: '#bfdbfe', text: '#1e293b', headerBg: '#1e40af', headerText: '#ffffff', zebra: '#dbeafe' },
    modern_slate_warm_amber: { primary: '#475569', secondary: '#f59e0b', bg: '#f8fafc', border: '#e2e8f0', text: '#1e293b', headerBg: '#475569', headerText: '#fef3c7', zebra: '#f1f5f9' },
    deep_emerald_trust: { primary: '#064e3b', secondary: '#047857', bg: '#ecfdf5', border: '#a7f3d0', text: '#064e3b', headerBg: '#064e3b', headerText: '#ffffff', zebra: '#d1fae5' },
    modern_indigo_clay: { primary: '#4338ca', secondary: '#ea580c', bg: '#eef2ff', border: '#c7d2fe', text: '#1e1b4b', headerBg: '#4338ca', headerText: '#ffffff', zebra: '#e0e7ff' },
    vault_navy: { primary: '#172554', secondary: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', text: '#172554', headerBg: '#172554', headerText: '#ffffff', zebra: '#dbeafe' },
    mineral_charcoal: { primary: '#27272a', secondary: '#52525b', bg: '#fafafa', border: '#e4e4e7', text: '#18181b', headerBg: '#27272a', headerText: '#ffffff', zebra: '#f4f4f5' }
  };

  function getSystemContext() {
    let societyId = 1;
    let fyId = '';

    if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
      const s = window.Auth.getSocietyId();
      if (s) societyId = parseInt(s, 10);
    } else {
      const storedSoc = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
      if (storedSoc) societyId = parseInt(storedSoc, 10);
    }

    if (window.Auth && typeof window.Auth.getFYId === 'function') {
      const f = window.Auth.getFYId();
      if (f) fyId = parseInt(f, 10);
    } else {
      const storedFy = sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId');
      if (storedFy) fyId = parseInt(storedFy, 10);
    }

    return { societyId: societyId || 1, fyId: fyId || '' };
  }

  async function loadActiveDesign(reportKey) {
    try {
      const res = await fetch(`${API_BASE}/reports/member/settings/${reportKey}`);
      if (res.ok) {
        const json = await res.json();
        if (json.settingsJson) {
          const design = typeof json.settingsJson === 'string' ? JSON.parse(json.settingsJson) : json.settingsJson;
          return design;
        }
      }
    } catch (err) {
      console.warn(`[HENU OS Report Engine] Could not load active design for ${reportKey}:`, err);
    }
    return null;
  }

  function applyDesignToDOM(design, rootSelector = '.report-page, .bill-page, .receipt-sheet, .debit-note-page, .credit-note-page, .adj-voucher-page, .ctrl-report-page, .bac-letter-page, .bd-report-page, .ds-report-page, .br-report-page, .rr-report-page, .dnr-report-page, .cnr-report-page, .ar-report-page, .jv-report-page') {
    if (!design) return;

    const pages = document.querySelectorAll(rootSelector);
    if (!pages || pages.length === 0) return;

    let pal = null;
    if (design.paletteId && PALETTES[design.paletteId]) {
      pal = PALETTES[design.paletteId];
    }

    const primaryColor = design.primaryColor || (pal ? pal.primary : null);
    const secondaryColor = design.secondaryColor || (pal ? pal.secondary : null);
    const headerBg = design.headerBg || (pal ? pal.headerBg : null);
    const headerText = design.headerText || (pal ? pal.headerText : null);
    const textColor = design.textColor || (pal ? pal.text : null);
    const borderColor = design.borderColor || (pal ? pal.border : null);
    const fontFamily = design.fontFamily || null;
    const fontSize = design.fontSizePt ? `${design.fontSizePt}pt` : null;

    pages.forEach(page => {
      if (primaryColor) {
        page.style.setProperty('--bill-primary', primaryColor);
        page.style.setProperty('--rcpt-primary', primaryColor);
        page.style.setProperty('--dn-primary', primaryColor);
        page.style.setProperty('--cn-primary', primaryColor);
        page.style.setProperty('--adj-primary', primaryColor);
        page.style.setProperty('--ctrl-primary', primaryColor);
        page.style.setProperty('--bac-primary', primaryColor);
        page.style.setProperty('--bd-primary', primaryColor);
        page.style.setProperty('--ds-primary', primaryColor);
        page.style.setProperty('--br-primary', primaryColor);
        page.style.setProperty('--rr-primary', primaryColor);
        page.style.setProperty('--dnr-primary', primaryColor);
        page.style.setProperty('--cnr-primary', primaryColor);
        page.style.setProperty('--ar-primary', primaryColor);
        page.style.setProperty('--jv-primary', primaryColor);
      }
      if (secondaryColor) {
        page.style.setProperty('--bill-accent', secondaryColor);
        page.style.setProperty('--rcpt-accent', secondaryColor);
        page.style.setProperty('--dn-accent', secondaryColor);
        page.style.setProperty('--cn-accent', secondaryColor);
      }
      if (fontFamily) {
        page.style.fontFamily = fontFamily;
      }
      if (fontSize) {
        page.style.fontSize = fontSize;
      }
      if (design.marginTopMm !== undefined) {
        page.style.paddingTop = `${design.marginTopMm}mm`;
      }
      if (design.marginBottomMm !== undefined) {
        page.style.paddingBottom = `${design.marginBottomMm}mm`;
      }
      if (design.marginLeftMm !== undefined) {
        page.style.paddingLeft = `${design.marginLeftMm}mm`;
      }
      if (design.marginRightMm !== undefined) {
        page.style.paddingRight = `${design.marginRightMm}mm`;
      }
      if (design.showHeader === false) {
        const hdr = page.querySelector('header, .bill-header, .receipt-header, .debit-header, .credit-header, .adj-header, .ctrl-header, .bac-header, .bd-header, .ds-header, .br-header, .rr-header, .dnr-header, .cnr-header, .ar-header, .jv-header');
        if (hdr) hdr.style.display = 'none';
      }
      if (design.showFooter === false) {
        const ftr = page.querySelector('footer, .bill-footer, .debit-footer, .credit-footer, .adj-footer, .ctrl-footer, .bd-footer, .ds-footer, .br-footer, .rr-footer, .dnr-footer, .cnr-footer, .ar-footer, .jv-footer');
        if (ftr) ftr.style.display = 'none';
      }
      if (design.showSignatures === false) {
        const sig = page.querySelector('.bill-signature-area, .receipt-footer-row, .debit-sig-row, .credit-sig-row, .adj-sig-row, .bac-sig-row');
        if (sig) sig.style.display = 'none';
      }
    });
  }

  function renderLoading(containerEl, msg = 'Loading report data from HENU ERP...') {
    if (!containerEl) return;
    containerEl.innerHTML = `
      <div class="erp-loading-state">
        <i class="bi bi-arrow-repeat"></i>
        <div class="state-title">${escapeHtml(msg)}</div>
        <div class="state-subtitle">Connecting to live ERP database...</div>
      </div>
    `;
  }

  function renderEmpty(containerEl, msg = 'No records found for the selected criteria.') {
    if (!containerEl) return;
    containerEl.innerHTML = `
      <div class="erp-empty-state">
        <i class="bi bi-inbox"></i>
        <div class="state-title">${escapeHtml(msg)}</div>
        <div class="state-subtitle">Try adjusting the date range, wing, or member filter.</div>
      </div>
    `;
  }

  function renderError(containerEl, msg = 'Unable to load report data.', onRetry) {
    if (!containerEl) return;
    containerEl.innerHTML = `
      <div class="erp-error-state">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <div class="state-title">${escapeHtml(msg)}</div>
        <div class="state-subtitle">There was an error communicating with the ERP backend service.</div>
        ${onRetry ? `<button class="btn-top btn-top-primary" style="margin-top:14px;" id="btn-state-retry"><i class="bi bi-arrow-counterclockwise"></i> Retry</button>` : ''}
      </div>
    `;
    if (onRetry) {
      document.getElementById('btn-state-retry')?.addEventListener('click', onRetry);
    }
  }

  function formatINR(val, zeroAsBlank = false) {
    const num = Number(val);
    if (isNaN(num) || Math.abs(num) < 0.005) {
      return zeroAsBlank ? '' : '₹0.00';
    }
    return '₹' + num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDate(dStr) {
    if (!dStr) return '';
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return String(dStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function numberToWordsINR(amount) {
    if (!amount || isNaN(amount) || amount === 0) return 'Rupees Zero Only';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function inWords(num) {
      if ((num = num.toString()).length > 9) return 'overflow';
      let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
      if (!n) return '';
      let str = '';
      str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
      str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
      str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
      str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
      str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
      return str.trim();
    }

    const whole = Math.floor(amount);
    const paise = Math.round((amount - whole) * 100);
    let result = 'Rupees ' + inWords(whole);
    if (paise > 0) {
      result += ' and ' + inWords(paise) + ' Paise';
    }
    return result + ' Only';
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderAdvancedDocument(params) {
    const { reportKey, data, design, targetContainer } = params || {};
    if (!targetContainer) return;
    if (design) applyDesignToDOM(design);
    return targetContainer;
  }

  window.HenuOsReportEngine = {
    MEMBER_REPORTS_SCOPE: true,
    API_BASE,
    PALETTES,
    getSystemContext,
    loadActiveDesign,
    applyDesignToDOM,
    renderAdvancedDocument,
    renderLoading,
    renderEmpty,
    renderError,
    formatINR,
    formatDate,
    numberToWordsINR,
    escapeHtml
  };

})(window);
