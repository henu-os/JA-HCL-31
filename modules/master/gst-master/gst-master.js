/**
 * gst-master.js
 * Context bridge & external initialization hook for GST Master.
 * Primary UI logic is contained in gst-master.html.
 */

window.init_gst_master = async function () {
  if (window.GST && typeof window.GST.resetSettings === 'function') {
    window.GST.resetSettings();
  }
};
