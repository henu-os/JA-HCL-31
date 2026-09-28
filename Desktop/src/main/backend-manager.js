// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Backend Lifecycle Manager
// ═══════════════════════════════════════════════════════════
// Strict Process Ownership Manager
// - Electron ONLY starts a backend if no backend is already active
// - Electron ONLY terminates the specific child process it started
// - NEVER terminates independently started backends (run.bat, IDE, CLI)
// - NEVER executes blanket port kills
// ═══════════════════════════════════════════════════════════

const { spawn, execSync } = require('child_process');
const fs = require('fs');

class BackendManager {
  constructor() {
    this.managedProcess = null;
    this.isOwnedByElectron = false;
    this.processPid = null;
    this.hasExited = false;
  }

  /**
   * Launch the local ASP.NET Core backend process
   * @param {import('../shared/configuration')} config
   * @returns {boolean} True if process spawn succeeded
   */
  startManagedBackend(config) {
    if (this.managedProcess && !this.hasExited) {
      console.log('[BackendManager] Managed backend process is already running (PID:', this.processPid, ')');
      return true;
    }

    console.log('[BackendManager] Spawning managed ASP.NET Core backend...');

    try {
      const useCompiledDll = fs.existsSync(config.backendDll);
      const command = 'dotnet';
      const args = useCompiledDll
        ? [config.backendDll]
        : ['run', '--project', 'JeevikaERP.csproj'];

      this.managedProcess = spawn(command, args, {
        cwd: config.backendDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ASPNETCORE_ENVIRONMENT: config.isDevelopment ? 'Development' : 'Production'
        }
      });

      this.isOwnedByElectron = true;
      this.processPid = this.managedProcess.pid;
      this.hasExited = false;

      console.log(`[BackendManager] Successfully spawned child backend (PID: ${this.processPid})`);

      this.managedProcess.stdout.on('data', (data) => {
        const line = data.toString().trim();
        if (line) console.log(`[Backend stdout] ${line}`);
      });

      this.managedProcess.stderr.on('data', (data) => {
        const line = data.toString().trim();
        if (line) console.error(`[Backend stderr] ${line}`);
      });

      this.managedProcess.on('exit', (code, signal) => {
        console.log(`[BackendManager] Child backend (PID: ${this.processPid}) exited with code ${code}, signal ${signal}`);
        this.hasExited = true;
        this.managedProcess = null;
      });

      return true;
    } catch (err) {
      console.error('[BackendManager] Failed to spawn backend process:', err);
      this.managedProcess = null;
      this.isOwnedByElectron = false;
      this.processPid = null;
      return false;
    }
  }

  /**
   * Terminate the managed backend process if and only if Electron owns it
   */
  stopManagedBackend() {
    if (!this.isOwnedByElectron || !this.managedProcess || this.hasExited) {
      if (!this.isOwnedByElectron) {
        console.log('[BackendManager] Backend was started independently. Preserving independent process.');
      }
      return;
    }

    console.log(`[BackendManager] Terminating managed child backend process (PID: ${this.processPid})...`);

    try {
      if (process.platform === 'win32') {
        // Use taskkill only on the explicit PID tracked by this manager
        execSync(`taskkill /pid ${this.processPid} /T /F >nul 2>&1`);
      } else {
        this.managedProcess.kill('SIGTERM');
      }
    } catch (err) {
      // Process may already have terminated cleanly
    }

    this.managedProcess = null;
    this.isOwnedByElectron = false;
    this.hasExited = true;
    console.log('[BackendManager] Managed backend process cleanly terminated.');
  }

  /**
   * Get current ownership and process state
   */
  getState() {
    return {
      isOwnedByElectron: this.isOwnedByElectron,
      processPid: this.processPid,
      isRunning: this.managedProcess !== null && !this.hasExited
    };
  }
}

module.exports = new BackendManager();
