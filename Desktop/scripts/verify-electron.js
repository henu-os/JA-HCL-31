// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Electron Automated Verification Suite
// ═══════════════════════════════════════════════════════════
// Executes runtime security, bridge, and architecture validation
// ═══════════════════════════════════════════════════════════

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

console.log('============================================================');
console.log('JEEVIKA ERP 2.0 — STAGE 5 ELECTRON VERIFICATION SUITE');
console.log('============================================================');

let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
  totalCount++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

app.whenReady().then(async () => {
  try {
    const desktopRoot = path.resolve(__dirname, '..');
    const preloadPath = path.join(desktopRoot, 'src', 'preload', 'preload.js');
    const mainPath = path.join(desktopRoot, 'src', 'main', 'main.js');
    const configPath = path.join(desktopRoot, 'src', 'shared', 'configuration.js');
    const backendManagerPath = path.join(desktopRoot, 'src', 'main', 'backend-manager.js');

    // 1. Structural Checks
    assert(fs.existsSync(mainPath), 'Main process entry exists: src/main/main.js');
    assert(fs.existsSync(preloadPath), 'Preload script exists: src/preload/preload.js');
    assert(fs.existsSync(configPath), 'Configuration helper exists: src/shared/configuration.js');
    assert(fs.existsSync(backendManagerPath), 'Backend process manager exists: src/main/backend-manager.js');

    // 2. Process Ownership Invariant
    const backendManager = require('../src/main/backend-manager');
    const initialState = backendManager.getState();
    assert(initialState.isOwnedByElectron === false, 'Initial backend ownership state is unowned (false)');
    assert(initialState.isRunning === false, 'Initial backend manager state is not running');

    // Verify stopManagedBackend does nothing if not owned
    backendManager.stopManagedBackend();
    assert(backendManager.getState().isOwnedByElectron === false, 'stopManagedBackend preserves unowned state safely');

    // 3. BrowserWindow Construction & Security Invariants
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });

    const prefs = win.webContents.getLastWebPreferences
      ? win.webContents.getLastWebPreferences()
      : win.webContents.webPreferences;

    assert(prefs.contextIsolation === true, 'contextIsolation is strictly ENFORCED (true)');
    assert(prefs.nodeIntegration === false, 'nodeIntegration is strictly DISABLED (false)');
    assert(prefs.sandbox === true, 'Chromium sandbox is strictly ENFORCED (true)');
    assert(prefs.webSecurity === true, 'webSecurity is strictly ENFORCED (true)');

    // 4. Runtime Context Bridge & Node Isolation Test
    await win.loadURL('data:text/html,<html><head><title>Test</title></head><body><h1>Bridge Test</h1></body></html>');

    const runtimeInspection = await win.webContents.executeJavaScript(`
      ({
        isDesktop: window.jeevikaDesktop?.isDesktop,
        appVersion: window.jeevikaDesktop?.appVersion,
        platform: window.jeevikaDesktop?.platform,
        hasMinimize: typeof window.jeevikaDesktop?.minimizeWindow === 'function',
        hasRequire: typeof window.require !== 'undefined',
        hasProcess: typeof window.process !== 'undefined',
        hasBuffer: typeof window.Buffer !== 'undefined',
        hasFs: typeof window.fs !== 'undefined'
      })
    `);

    assert(runtimeInspection.isDesktop === true, 'window.jeevikaDesktop.isDesktop is true in renderer');
    assert(runtimeInspection.appVersion === '2.0.0', 'window.jeevikaDesktop.appVersion is "2.0.0"');
    assert(runtimeInspection.hasMinimize === true, 'window.jeevikaDesktop exposes safe window control API');
    assert(runtimeInspection.hasRequire === false, 'Node require is strictly inaccessible in renderer');
    assert(runtimeInspection.hasProcess === false, 'Node process object is strictly inaccessible in renderer');
    assert(runtimeInspection.hasBuffer === false, 'Node Buffer is strictly inaccessible in renderer');
    assert(runtimeInspection.hasFs === false, 'Node fs is strictly inaccessible in renderer');

    // 5. Origin Guard Logic Check
    const { isAllowedInternalUrl } = require('../src/main/navigation-guard');
    assert(isAllowedInternalUrl('http://localhost:5002/login.html') === true, 'Allows internal http://localhost:5002/login.html');
    assert(isAllowedInternalUrl('http://127.0.0.1:5002/swagger') === true, 'Allows internal http://127.0.0.1:5002/swagger');
    assert(isAllowedInternalUrl('https://evil.com/phishing') === false, 'Blocks external https://evil.com');
    assert(isAllowedInternalUrl('file:///C:/Windows/System32') === false, 'Blocks local file:/// URLs');

    console.log('============================================================');
    console.log(`RESULTS: ${passedCount}/${totalCount} CHECKS PASSED`);
    console.log('Overall Status: ALL ELECTRON CHECKS PASSED (PASS)');
    console.log('============================================================');

    win.destroy();
    app.exit(0);
  } catch (err) {
    console.error('Verification failed with error:', err);
    app.exit(1);
  }
});
