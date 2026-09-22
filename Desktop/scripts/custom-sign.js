// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP 2.0 — Custom Code Sign Handler
// Unsigned local / enterprise development packaging handler
// ═══════════════════════════════════════════════════════════

exports.default = async function sign(configuration) {
  // Bypasses external signtool timestamp network lookup for offline/local builds
  return;
};
