// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — GLOBAL CONFIGURATION
// ═══════════════════════════════════════════════════════════
// THIS IS THE ONLY PLACE WHERE THE API URL IS DEFINED.
// Change API_BASE here → it updates across the ENTIRE project.
// ═══════════════════════════════════════════════════════════

window.APP_CONFIG = {
  API_BASE:             'http://localhost:5002/api',
  APP_NAME:             'JEEVIKA ERP',
  APP_VERSION:          '2.0.0',
  SESSION_TIMEOUT_HOURS: 8,
  SUPABASE_URL:         'https://mvoskgwpqtjaeszvtvdz.supabase.co',
  SUPABASE_ANON_KEY:    'sb_publishable_gO93ZL2r3X8sXVtgbCUnPg_q_VUr0G0'
};

// Supabase Global Config
window.SUPABASE_CONFIG = {
  url: 'https://mvoskgwpqtjaeszvtvdz.supabase.co',
  anonKey: 'sb_publishable_gO93ZL2r3X8sXVtgbCUnPg_q_VUr0G0'
};

// Global aliases for legacy & master module helper methods
window.CONFIG = { apiBase: 'http://localhost:5002', API_BASE: 'http://localhost:5002/api' };
window.AppConfig = { apiBase: 'http://localhost:5002', API_BASE: 'http://localhost:5002/api' };
window.API_BASE_URL = 'http://localhost:5002';

window.getApiBaseUrl = function () {
  var b = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ||
          (window.CONFIG && (window.CONFIG.API_BASE || window.CONFIG.apiBase)) ||
          window.API_BASE_URL ||
          'http://localhost:5002';
  return String(b).replace(/\/api\/?$/, '');
};

// ── Safe Storage Implementation ───────────────────────────
// Prevents DOMException / SecurityError when storage is blocked by Tracking Prevention or file:// protocol
(function () {
  const _memLocal = {};
  const _memSession = {};

  function createSafeStorage(nativeStorage, memStore) {
    return {
      getItem: function (key) {
        try {
          if (nativeStorage) {
            const val = nativeStorage.getItem(key);
            if (val !== null) return val;
          }
        } catch (e) { }
        return memStore.hasOwnProperty(key) ? memStore[key] : null;
      },
      setItem: function (key, value) {
        const strVal = String(value);
        try {
          if (nativeStorage) {
            nativeStorage.setItem(key, strVal);
          }
        } catch (e) { }
        memStore[key] = strVal;
      },
      removeItem: function (key) {
        try {
          if (nativeStorage) {
            nativeStorage.removeItem(key);
          }
        } catch (e) { }
        delete memStore[key];
      },
      clear: function () {
        try {
          if (nativeStorage) {
            nativeStorage.clear();
          }
        } catch (e) { }
        for (const k in memStore) delete memStore[k];
      },
      key: function (index) {
        try {
          if (nativeStorage) return nativeStorage.key(index);
        } catch (e) { }
        return Object.keys(memStore)[index] || null;
      },
      get length() {
        try {
          if (nativeStorage) return nativeStorage.length;
        } catch (e) { }
        return Object.keys(memStore).length;
      }
    };
  }

  let nativeLocal = null;
  let nativeSession = null;

  try { nativeLocal = window.localStorage; } catch (e) { }
  try { nativeSession = window.sessionStorage; } catch (e) { }

  window.SafeStorage = {
    local: createSafeStorage(nativeLocal, _memLocal),
    session: createSafeStorage(nativeSession, _memSession)
  };
})();
