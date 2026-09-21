// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Electron Main Entry Point
// ═══════════════════════════════════════════════════════════
// Clean Modular Desktop Host Entry
// ═══════════════════════════════════════════════════════════

const config = require('../shared/configuration');
const { registerIpcHandlers } = require('./ipc/ipc-handlers');
const { initializeApp } = require('./app-lifecycle');

console.log('====================================================');
console.log('  JEEVIKA ERP 2.0 — SECURE DESKTOP HOST');
console.log('====================================================');
console.log(`[Main] Environment : ${config.isDevelopment ? 'Development' : 'Production'}`);
console.log(`[Main] Backend URL : ${config.backendUrl}`);
console.log(`[Main] Entry URL   : ${config.appEntryUrl}`);
console.log('====================================================');

// Register whitelisted IPC handlers
registerIpcHandlers(config);

// Run application lifecycle
initializeApp(config);
