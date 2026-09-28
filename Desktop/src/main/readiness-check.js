// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Backend Readiness Checker
// ═══════════════════════════════════════════════════════════
// Reliable, non-blocking HTTP probe for backend responsiveness
// - Probes primary Swagger endpoint and fallback static endpoint
// - Enforces strict timeout and retry counts to prevent hangs
// ═══════════════════════════════════════════════════════════

const http = require('http');
const constants = require('../shared/constants');

/**
 * Performs a single HTTP GET probe against a target endpoint
 * @param {string} host
 * @param {number} port
 * @param {string} path
 * @param {number} timeoutMs
 * @returns {Promise<{ ok: boolean, statusCode?: number, error?: string }>}
 */
function probeEndpoint(host, port, path, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: host,
        port: port,
        path: path,
        method: 'GET',
        timeout: timeoutMs
      },
      (res) => {
        // Any HTTP response from the server (200-499) proves the port is actively listening and responding
        const isResponding = res.statusCode >= 200 && res.statusCode < 500;
        resolve({ ok: isResponding, statusCode: res.statusCode });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.code || err.message });
    });

    req.end();
  });
}

/**
 * Probes primary health endpoint with fallback to static entry point
 * @param {import('../shared/configuration')} config
 * @returns {Promise<boolean>}
 */
async function checkBackendHealth(config) {
  const primaryResult = await probeEndpoint(config.host, config.port, constants.HEALTH_CHECK_PATH);
  if (primaryResult.ok) return true;

  // Fallback to static root /login.html
  const fallbackResult = await probeEndpoint(config.host, config.port, constants.FALLBACK_CHECK_PATH);
  return fallbackResult.ok;
}

/**
 * Polls backend readiness until healthy or timeout reached
 * @param {import('../shared/configuration')} config
 * @param {function(number, number): void} [onProgress]
 * @returns {Promise<{ ready: boolean, attempts: number, durationMs: number, error?: string }>}
 */
async function waitForBackendReady(config, onProgress) {
  const startTime = Date.now();
  const maxRetries = constants.MAX_READINESS_RETRIES;
  const delayMs = constants.READINESS_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (onProgress) onProgress(attempt, maxRetries);

    const isHealthy = await checkBackendHealth(config);
    if (isHealthy) {
      return {
        ready: true,
        attempts: attempt,
        durationMs: Date.now() - startTime
      };
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return {
    ready: false,
    attempts: maxRetries,
    durationMs: Date.now() - startTime,
    error: `Backend failed to respond after ${maxRetries} attempts (${(maxRetries * delayMs) / 1000}s)`
  };
}

module.exports = {
  probeEndpoint,
  checkBackendHealth,
  waitForBackendReady
};
