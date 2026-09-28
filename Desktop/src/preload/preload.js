// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Electron Preload Script (Secure Bridge)
// ═══════════════════════════════════════════════════════════
// Enforces Context Isolation and exposes only a strictly
// whitelisted, sanitized API surface to the ERP frontend.
//
// Zero Node.js primitives (require, process, Buffer, fs) leaked.
// Zero database credentials or secrets exposed.
// ═══════════════════════════════════════════════════════════

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jeevikaDesktop', {
  isDesktop: true,
  appVersion: '2.0.0',
  platform: process.platform,

  // Safe application info retrieval
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Safe backend status check
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),

  // Safe window control requests via validated IPC
  minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
  maximizeWindow: () => ipcRenderer.send('window-control', 'maximize'),
  closeWindow: () => ipcRenderer.send('window-control', 'close')
});
