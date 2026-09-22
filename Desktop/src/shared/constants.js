// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Desktop Host Constants
// ═══════════════════════════════════════════════════════════
// Centralized, frozen constants for Desktop Host configuration
// ═══════════════════════════════════════════════════════════

const DEFAULT_PORT = 5002;
const DEFAULT_HOST = '127.0.0.1';
const HEALTH_CHECK_PATH = '/swagger/v1/swagger.json';
const FALLBACK_CHECK_PATH = '/login.html';
const APP_ENTRY_PATH = '/login.html';
const MAX_READINESS_RETRIES = 30;
const READINESS_RETRY_DELAY_MS = 500;
const READINESS_TIMEOUT_MS = 15000;

const ALLOWED_HOSTNAMES = ['localhost', '127.0.0.1'];
const ALLOWED_PORTS = ['5002', '3000'];

const WINDOW_CONFIG = {
  width: 1280,
  height: 800,
  minWidth: 1024,
  minHeight: 700,
  title: 'JEEVIKA ERP v2.0 - Desktop Host',
  backgroundColor: '#0F172A',
  autoHideMenuBar: false
};

const IPC_CHANNELS = {
  WINDOW_CONTROL: 'window-control',
  GET_BACKEND_STATUS: 'get-backend-status',
  GET_APP_INFO: 'get-app-info'
};

module.exports = {
  DEFAULT_PORT,
  DEFAULT_HOST,
  HEALTH_CHECK_PATH,
  FALLBACK_CHECK_PATH,
  APP_ENTRY_PATH,
  MAX_READINESS_RETRIES,
  READINESS_RETRY_DELAY_MS,
  READINESS_TIMEOUT_MS,
  ALLOWED_HOSTNAMES,
  ALLOWED_PORTS,
  WINDOW_CONFIG,
  IPC_CHANNELS
};
