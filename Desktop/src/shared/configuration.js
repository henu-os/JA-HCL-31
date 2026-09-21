// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Desktop Host Configuration
// ═══════════════════════════════════════════════════════════
// Dynamic configuration helper for host endpoints & options
// ═══════════════════════════════════════════════════════════

const path = require('path');
const constants = require('./constants');

class DesktopConfig {
  constructor() {
    this.port = parseInt(process.env.JEEVIKA_BACKEND_PORT || constants.DEFAULT_PORT, 10);
    this.host = process.env.JEEVIKA_BACKEND_HOST || constants.DEFAULT_HOST;
    this.isDevelopment = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
    this.rootDir = path.resolve(__dirname, '..', '..', '..');
    this.backendDir = path.join(this.rootDir, 'Backend');
    this.backendDll = path.join(this.backendDir, 'bin', 'Debug', 'net8.0', 'JeevikaERP.dll');
  }

  get backendUrl() {
    return `http://${this.host}:${this.port}`;
  }

  get appEntryUrl() {
    return `${this.backendUrl}${constants.APP_ENTRY_PATH}`;
  }

  get healthCheckUrl() {
    return `${this.backendUrl}${constants.HEALTH_CHECK_PATH}`;
  }

  get fallbackCheckUrl() {
    return `${this.backendUrl}${constants.FALLBACK_CHECK_PATH}`;
  }

  get preloadScriptPath() {
    return path.join(__dirname, '..', 'preload', 'preload.js');
  }
}

module.exports = new DesktopConfig();
