/**
 * bill-print-setup.js
 * Context bridge & external initialization hook for Bill Print Setup.
 * Primary UI logic is contained in bill-print-setup.html.
 */

window.init_bill_print_setup = async function () {
  if (window.BPS && typeof window.BPS.resetConfig === 'function') {
    window.BPS.resetConfig();
  }
};
