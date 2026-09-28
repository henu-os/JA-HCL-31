// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Window Manager
// ═══════════════════════════════════════════════════════════
// Configures and instantiates the secure Electron BrowserWindow
// - Enforces Chromium sandboxing and context isolation
// - Integrates navigation security guards
// - Provides diagnostic fallback error interface
// ═══════════════════════════════════════════════════════════

const { BrowserWindow } = require('electron');
const constants = require('../shared/constants');
const { attachNavigationGuards } = require('./navigation-guard');

let mainWindow = null;

/**
 * Creates the primary application window with secure defaults
 * @param {import('../shared/configuration')} config
 * @returns {BrowserWindow}
 */
function createMainWindow(config) {
  mainWindow = new BrowserWindow({
    ...constants.WINDOW_CONFIG,
    webPreferences: {
      preload: config.preloadScriptPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  // Attach navigation and origin guards
  attachNavigationGuards(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Returns active main window instance
 * @returns {BrowserWindow|null}
 */
function getMainWindow() {
  return mainWindow;
}

/**
 * Loads target application URL into main window
 * @param {BrowserWindow} window
 * @param {string} url
 * @returns {Promise<void>}
 */
async function loadApplicationUrl(window, url) {
  if (!window || window.isDestroyed()) return;
  await window.loadURL(url);
}

/**
 * Displays diagnostic error screen if backend cannot be reached
 * @param {BrowserWindow} window
 * @param {string} reason
 * @param {string} targetUrl
 */
function loadErrorScreen(window, reason, targetUrl) {
  if (!window || window.isDestroyed()) return;

  const errorHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>JEEVIKA ERP — Startup Error</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          background: #0F172A;
          color: #F8FAFC;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .card {
          background: #1E293B;
          padding: 36px;
          border-radius: 12px;
          border: 1px solid #334155;
          max-width: 540px;
          width: 100%;
          text-align: center;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        .icon {
          width: 54px;
          height: 54px;
          background: rgba(239, 68, 68, 0.15);
          color: #EF4444;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          font-weight: bold;
          margin-bottom: 16px;
        }
        h1 { color: #F1F5F9; font-size: 20px; margin: 0 0 12px; font-weight: 600; }
        p { color: #94A3B8; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
        .details {
          background: #0F172A;
          border: 1px solid #334155;
          padding: 12px;
          border-radius: 6px;
          color: #38BDF8;
          font-family: monospace;
          font-size: 13px;
          margin-bottom: 24px;
          word-break: break-all;
        }
        .btn {
          padding: 10px 24px;
          background: #2563EB;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: background 0.2s;
        }
        .btn:hover { background: #1D4ED8; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">!</div>
        <h1>Backend Initialization Failed</h1>
        <p>JEEVIKA ERP Desktop Host was unable to establish a connection to the local API service.</p>
        <div class="details">Target: ${targetUrl}<br>Reason: ${reason}</div>
        <p>Ensure that .NET 8 runtime is installed, no port conflicts exist on port 5002, and your database service is running.</p>
        <button class="btn" onclick="location.reload()">Retry Connection</button>
      </div>
    </body>
    </html>
  `;

  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
}

module.exports = {
  createMainWindow,
  getMainWindow,
  loadApplicationUrl,
  loadErrorScreen
};
