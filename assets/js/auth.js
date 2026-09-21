// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — AUTH MANAGER
// Session management, JWT storage, redirect guards.
// ═══════════════════════════════════════════════════════════

const Auth = (() => {

  const KEYS = {
    TOKEN:         'jwtToken',
    USER_NAME:     'userName',
    USER_TYPE:     'userType',
    USER_LEVEL:    'userLevel',
    SOC_ID:        'activeSocietyId',
    SOC_NAME:      'activeSocietyName',
    SOC_CODE:      'activeSocietyCode',
    FY_ID:         'activeFYId',
    FY_LABEL:      'activeFYLabel',
    FY_START:      'activeFYStart',
    FY_END:        'activeFYEnd',
    LOGIN_TIME:    'loginTime'
  };

  const getStorageItem = (key, isSessionOnly = false) => {
    if (window.SafeStorage) {
      const s = window.SafeStorage.session.getItem(key);
      if (s !== null && s !== undefined) return s;
      if (!isSessionOnly) {
        const l = window.SafeStorage.local.getItem(key);
        if (l !== null && l !== undefined) return l;
      }
      return null;
    }
    try {
      const s = sessionStorage.getItem(key);
      if (s !== null && s !== undefined) return s;
      if (!isSessionOnly) {
        const l = localStorage.getItem(key);
        if (l !== null && l !== undefined) return l;
      }
    } catch (e) {}
    return null;
  };

  const setStorageItem = (key, val, isSessionOnly = false) => {
    if (val === null || val === undefined) return;
    const strVal = String(val);
    if (window.SafeStorage) {
      window.SafeStorage.session.setItem(key, strVal);
      if (!isSessionOnly) window.SafeStorage.local.setItem(key, strVal);
      return;
    }
    try {
      sessionStorage.setItem(key, strVal);
      if (!isSessionOnly) localStorage.setItem(key, strVal);
    } catch (e) {}
  };

  return {

    // ── Login: store session ─────────────────────────────
    setSession(data) {
      setStorageItem(KEYS.TOKEN,      data.token, true);
      setStorageItem(KEYS.USER_NAME,  data.userName || '', true);
      setStorageItem(KEYS.USER_TYPE,  data.userType || 'USER', true);
      setStorageItem(KEYS.USER_LEVEL, data.userLevel || '1', true);
      setStorageItem(KEYS.LOGIN_TIME, Date.now().toString(), true);
    },

    // ── Setup: store society + FY ────────────────────────
    setContext(society, fy) {
      if (society) {
        if (society.societyId) setStorageItem(KEYS.SOC_ID, society.societyId.toString());
        if (society.societyName) setStorageItem(KEYS.SOC_NAME, society.societyName);
        if (society.societyCode) setStorageItem(KEYS.SOC_CODE, society.societyCode);
      }
      if (fy) {
        if (fy.fYId) setStorageItem(KEYS.FY_ID, fy.fYId.toString());
        if (fy.fYLabel) setStorageItem(KEYS.FY_LABEL, fy.fYLabel);
        if (fy.fYStart) setStorageItem(KEYS.FY_START, fy.fYStart);
        if (fy.fYEnd) setStorageItem(KEYS.FY_END, fy.fYEnd);
      }
    },

    setFY(fy) {
      if (fy) {
        if (fy.fYId) setStorageItem(KEYS.FY_ID, fy.fYId.toString());
        if (fy.fYLabel) setStorageItem(KEYS.FY_LABEL, fy.fYLabel);
        if (fy.fYStart) setStorageItem(KEYS.FY_START, fy.fYStart);
        if (fy.fYEnd) setStorageItem(KEYS.FY_END, fy.fYEnd);
      }
    },

    // ── Getters ──────────────────────────────────────────
    getToken()      { return getStorageItem(KEYS.TOKEN); },
    getUserName()   { return getStorageItem(KEYS.USER_NAME) || ''; },
    getUserType()   { return getStorageItem(KEYS.USER_TYPE) || ''; },
    getSocietyId()  { return getStorageItem(KEYS.SOC_ID) || getStorageItem('activeSocietyId'); },
    getSocietyName(){ return getStorageItem(KEYS.SOC_NAME) || getStorageItem('activeSocietyName') || '—'; },
    getFYId()       { return getStorageItem(KEYS.FY_ID) || getStorageItem('activeFYId'); },
    getFYLabel()    { return getStorageItem(KEYS.FY_LABEL) || getStorageItem('activeFYLabel') || '2025-26'; },
    getFYStart()    { return getStorageItem(KEYS.FY_START); },
    getFYEnd()      { return getStorageItem(KEYS.FY_END); },

    // ── Check if fully logged in and context set ─────────
    isLoggedIn() {
      return !!this.getToken();
    },

    isContextSet() {
      return !!this.getSocietyId() && !!this.getFYId();
    },

    // ── Logout ───────────────────────────────────────────
    logout() {
      if (window.SafeStorage) {
        window.SafeStorage.session.clear();
      } else {
        try { sessionStorage.clear(); } catch(e) {}
      }
      window.location.href = resolveRootPath('login.html');
    },

    // ── Guards ───────────────────────────────────────────
    // Call at top of each page to enforce correct state
    requireLogin() {
      if (!this.isLoggedIn()) {
        window.location.href = resolveRootPath('login.html');
        return false;
      }
      return true;
    },

    requireContext() {
      if (!this.isLoggedIn()) {
        window.location.href = resolveRootPath('login.html');
        return false;
      }
      if (!this.isContextSet()) {
        window.location.href = resolveRootPath('setup.html');
        return false;
      }
      return true;
    },

    // ── Session timeout check ────────────────────────────
    isSessionExpired() {
      const loginTime = parseInt(getStorageItem(KEYS.LOGIN_TIME) || '0');
      if (!loginTime) return true;
      const hours = window.APP_CONFIG?.SESSION_TIMEOUT_HOURS || 8;
      const elapsed = (Date.now() - loginTime) / 3600000;
      return elapsed >= hours;
    }
  };

})();

// ── Resolve path relative to root regardless of current depth
function resolveRootPath(page) {
  if (!page) page = '';
  if (page.startsWith('/')) page = page.substring(1);

  const pathname = window.location.pathname || '';
  const modulesIdx = pathname.toLowerCase().indexOf('/modules/');

  if (modulesIdx !== -1) {
    const subpath = pathname.substring(modulesIdx + '/modules/'.length);
    const parts = subpath.split('/').filter(Boolean);
    const depth = parts.length;
    return '../'.repeat(depth) + page;
  }

  return page;
}

// ── Global Helper for Auth Headers ────────────────────────
function getAuthHeaders(extra = {}) {
  const token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : (window.SafeStorage ? window.SafeStorage.session.getItem('jwtToken') : null);
  const societyId = (typeof Auth !== 'undefined' && Auth.getSocietyId) ? Auth.getSocietyId() : (window.SafeStorage ? window.SafeStorage.session.getItem('activeSocietyId') : null);
  const fyId = (typeof Auth !== 'undefined' && Auth.getFYId) ? Auth.getFYId() : (window.SafeStorage ? window.SafeStorage.session.getItem('activeFYId') : null);

  const headers = {
    'Content-Type': 'application/json',
    ...extra
  };

  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (societyId) headers['X-Society-Id'] = societyId;
  if (fyId) headers['X-FY-Id'] = fyId;

  return headers;
}

