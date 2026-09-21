/**
 * vendor-master.js
 * Context bridge & external initialization hook for Vendor Master.
 * Primary UI logic is contained in vendor-master.html.
 */

window.init_vendor_master = async function () {
  if (window.VENDOR) {
    if (typeof window.VENDOR.loadCustomVendorItems === 'function') window.VENDOR.loadCustomVendorItems();
    if (typeof window.VENDOR.render === 'function') window.VENDOR.render();
  }
};
