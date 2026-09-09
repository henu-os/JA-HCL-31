/**
 * opening-balances.js
 * Context bridge — actual logic is embedded in opening-balances.html (IIFE pattern).
 * This file is kept for compatibility; exposes init hook if needed externally.
 */

// Expose init hook for workspace re-open scenarios
window.init_opening_balances = async function () {
  if (window.OB && typeof window.OB.renderGrid === 'function') {
    OB.renderGrid();
  }
};
