// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Application Lifecycle Orchestrator
// ═══════════════════════════════════════════════════════════
// Coordinates Electron initialization, readiness probes,
// backend process management, and clean application exit.
// ═══════════════════════════════════════════════════════════

const { app } = require('electron');
const windowManager = require('./window-manager');
const backendManager = require('./backend-manager');
const readinessCheck = require('./readiness-check');

/**
 * Initializes and runs the complete application lifecycle
 * @param {import('../shared/configuration')} config
 */
function initializeApp(config) {
  app.whenReady().then(async () => {
    console.log('[Lifecycle] Electron ready. Creating main window...');
    const mainWindow = windowManager.createMainWindow(config);

    console.log(`[Lifecycle] Checking initial backend health on ${config.backendUrl}...`);
    let isHealthy = await readinessCheck.checkBackendHealth(config);

    if (!isHealthy) {
      console.log('[Lifecycle] Backend is offline. Starting managed local backend process...');
      const started = backendManager.startManagedBackend(config);

      if (started) {
        console.log('[Lifecycle] Polling backend readiness probe...');
        const readiness = await readinessCheck.waitForBackendReady(config, (attempt, max) => {
          console.log(`[Lifecycle] Probing backend readiness (attempt ${attempt}/${max})...`);
        });

        isHealthy = readiness.ready;
        if (!isHealthy) {
          console.error(`[Lifecycle] Readiness check failed: ${readiness.error}`);
          windowManager.loadErrorScreen(mainWindow, readiness.error || 'Readiness timeout', config.appEntryUrl);
          return;
        }
      } else {
        console.error('[Lifecycle] Failed to start backend process.');
        windowManager.loadErrorScreen(mainWindow, 'Could not launch ASP.NET Core process', config.appEntryUrl);
        return;
      }
    } else {
      console.log('[Lifecycle] Connected to existing active backend process.');
    }

    if (isHealthy) {
      console.log(`[Lifecycle] Backend ready. Loading application entry: ${config.appEntryUrl}`);
      windowManager.loadApplicationUrl(mainWindow, config.appEntryUrl).catch((err) => {
        console.error('[Lifecycle] Failed to load application URL:', err);
        windowManager.loadErrorScreen(mainWindow, err.message, config.appEntryUrl);
      });
    }

    app.on('activate', () => {
      if (windowManager.getMainWindow() === null) {
        windowManager.createMainWindow(config);
      }
    });
  });

  // Teardown hooks
  app.on('window-all-closed', () => {
    console.log('[Lifecycle] All windows closed. Initiating teardown...');
    backendManager.stopManagedBackend();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    console.log('[Lifecycle] Application quitting. Stopping managed backend...');
    backendManager.stopManagedBackend();
  });

  app.on('will-quit', () => {
    backendManager.stopManagedBackend();
  });
}

module.exports = {
  initializeApp
};
