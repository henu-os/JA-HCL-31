// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — CENTRAL API CLIENT
// All HTTP calls go through this file.
// Never use raw fetch() in modules — always use API.*
// ═══════════════════════════════════════════════════════════

const API = (() => {

  // ── Build request headers ──────────────────────────────
  function _headers(extra = {}) {
    const token = (typeof Auth !== 'undefined' && Auth.getToken)
      ? Auth.getToken()
      : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
    const societyId = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId');
    const fyId = sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId');

    const headers = {
      'Content-Type': 'application/json',
      ...extra
    };

    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (societyId) headers['X-Society-Id'] = societyId;
    if (fyId) headers['X-FY-Id'] = fyId;

    return headers;
  }

  // ── Build full URL ─────────────────────────────────────
  function _url(endpoint) {
    let base = window.APP_CONFIG?.API_BASE || 'http://localhost:5002/api';
    if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;
    if (base.endsWith('/api') && endpoint.startsWith('/api/')) {
      endpoint = endpoint.substring(4);
    }
    return base + endpoint;
  }

  // ── Core fetch wrapper ─────────────────────────────────
  async function _request(method, endpoint, body = null, raw = false) {
    const opts = {
      method,
      headers: _headers()
    };

    if (body !== null && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(_url(endpoint), opts);

      // Handle 401 Unauthorized → redirect to login
      if (res.status === 401) {
        if (window.SafeStorage) window.SafeStorage.session.clear(); else try { sessionStorage.clear(); } catch(e){}
        if (!window.location.pathname.includes('login.html')) {
          const target = typeof resolveRootPath === 'function' ? resolveRootPath('login.html') : 'login.html';
          window.location.href = target;
        }
        throw new Error('Session expired. Please login again.');
      }

      // Handle non-OK responses
      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        let errData = null;
        try {
          errData = await res.json();
          errMsg = errData.message || errData.error || errData.report?.statusMessage || errMsg;
        } catch (_) {}
        const err = new Error(errMsg);
        if (errData) err.data = errData;
        throw err;
      }

      if (raw) return res;
      return await res.json();

    } catch (err) {
      // Network error
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Is the backend running?');
      }
      throw err;
    }
  }

  // ── Public Methods ─────────────────────────────────────
  return {

    // GET /api/endpoint
    get(endpoint) {
      return _request('GET', endpoint);
    },

    // POST /api/endpoint with body
    post(endpoint, body) {
      return _request('POST', endpoint, body);
    },

    // PUT /api/endpoint with body
    put(endpoint, body) {
      return _request('PUT', endpoint, body);
    },

    // DELETE /api/endpoint
    delete(endpoint) {
      return _request('DELETE', endpoint);
    },

    // Build query string from params object
    // e.g. API.query('/groups', { societyId: 1, fyId: 3 })
    // → GET /api/groups?societyId=1&fyId=3
    query(endpoint, params = {}) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      return _request('GET', qs ? `${endpoint}?${qs}` : endpoint);
    }
  };

})();

if (typeof window !== 'undefined') {
  window.API = API;
  window.Api = API;
}
const Api = API;
