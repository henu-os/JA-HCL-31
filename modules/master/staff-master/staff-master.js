/**
 * staff-master.js
 * Context bridge & external initialization hook for Staff Master.
 * Primary UI logic is contained in staff-master.html.
 */

window.init_staff_master = async function () {
  if (window.STAFF) {
    if (typeof window.STAFF.loadCustomStaffItems === 'function') window.STAFF.loadCustomStaffItems();
    if (typeof window.STAFF.render === 'function') window.STAFF.render();
  }
};
