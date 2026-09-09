/**
 * committee-master.js
 * Context bridge & external initialization hook for Committee Master.
 * Primary UI logic is contained in committee-master.html.
 */

window.init_committee_master = async function () {
  if (window.COMM && typeof window.COMM.render === 'function') {
    window.COMM.render();
  }
};
