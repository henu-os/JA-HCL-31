// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Approved IPC Handlers
// ═══════════════════════════════════════════════════════════
// Strictly whitelisted IPC surface
// - Zero arbitrary IPC routing
// - Zero renderer-controlled shell or filesystem operations
// ═══════════════════════════════════════════════════════════

const { ipcMain, BrowserWindow } = require('electron');
const constants = require('../../shared/constants');
const backendManager = require('../backend-manager');
const readinessCheck = require('../readiness-check');

/**
 * Registers whitelisted IPC handlers
 * @param {import('../../shared/configuration')} config
 */
function registerIpcHandlers(config) {
  // 1. Safe Window Control (minimize, maximize, close)
  ipcMain.on(constants.IPC_CHANNELS.WINDOW_CONTROL, (event, action) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;

    if (action === 'minimize') {
      window.minimize();
    } else if (action === 'maximize') {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    } else if (action === 'close') {
      window.close();
    } else {
      console.warn(`[IPC] Rejected unapproved window-control action: ${action}`);
    }
  });

  // 2. Safe Backend Status Query
  ipcMain.handle(constants.IPC_CHANNELS.GET_BACKEND_STATUS, async () => {
    const isHealthy = await readinessCheck.checkBackendHealth(config);
    const processState = backendManager.getState();

    return {
      status: isHealthy ? 'ONLINE' : 'OFFLINE',
      backendUrl: config.backendUrl,
      isManagedByElectron: processState.isOwnedByElectron,
      processPid: processState.processPid
    };
  });

  // 3. Safe App Info Query
  ipcMain.handle(constants.IPC_CHANNELS.GET_APP_INFO, () => {
    return {
      name: 'JEEVIKA ERP',
      version: '2.0.0',
      environment: 'Desktop Host',
      platform: process.platform
    };
  });
}

module.exports = {
  registerIpcHandlers
};
