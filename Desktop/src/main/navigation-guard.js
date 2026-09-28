// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Navigation & Window Security Guard
// ═══════════════════════════════════════════════════════════
// Enforces strict origin whitelist & prevents arbitrary navigation
// - Intercepts window navigation & redirects external URLs to OS browser
// - Intercepts popup / new-window creation
// - Disables webviews
// ═══════════════════════════════════════════════════════════

const { shell } = require('electron');
const constants = require('../shared/constants');

/**
 * Validates whether a URL belongs to the whitelisted local ERP endpoints
 * @param {string} rawUrl
 * @returns {boolean}
 */
function isAllowedInternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const isHttp = parsed.protocol === 'http:';
    const isAllowedHost = constants.ALLOWED_HOSTNAMES.includes(parsed.hostname);
    const isAllowedPort = constants.ALLOWED_PORTS.includes(parsed.port);
    return isHttp && isAllowedHost && isAllowedPort;
  } catch (err) {
    return false;
  }
}

/**
 * Attaches security guards to an Electron BrowserWindow instance
 * @param {import('electron').BrowserWindow} window
 */
function attachNavigationGuards(window) {
  const contents = window.webContents;

  // 1. Guard against navigation within the primary window
  contents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedInternalUrl(navigationUrl)) {
      event.preventDefault();
      console.log(`[NavigationGuard] Intercepted external navigation to: ${navigationUrl}`);
      shell.openExternal(navigationUrl).catch((err) => {
        console.error('[NavigationGuard] Failed to open external URL:', err);
      });
    }
  });

  // 2. Guard against window.open and popup windows
  contents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedInternalUrl(url)) {
      console.log(`[NavigationGuard] Opening external link in system browser: ${url}`);
      shell.openExternal(url).catch((err) => {
        console.error('[NavigationGuard] Failed to open external URL:', err);
      });
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 3. Block unauthorized <webview> creation
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.warn('[NavigationGuard] Blocked attempt to attach webview in renderer.');
  });
}

module.exports = {
  isAllowedInternalUrl,
  attachNavigationGuards
};
