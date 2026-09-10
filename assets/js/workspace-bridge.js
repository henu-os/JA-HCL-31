// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — WORKSPACE BRIDGE (Cross-Origin & Iframe Safe)
// Enables child iframe modules to communicate with WorkspaceManager
// using window.postMessage without cross-origin SecurityErrors.
// ═══════════════════════════════════════════════════════════

const WorkspaceBridge = (() => {

  function _send(action, payload = {}) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'JEEVIKA_WORKSPACE_CMD',
          action: action,
          payload: payload
        }, '*');
      } else if (typeof window.WorkspaceManager !== 'undefined' && typeof window.WorkspaceManager[action] === 'function') {
        if (action === 'setActiveSociety') {
          window.WorkspaceManager.setActiveSociety(payload.societyId || payload.id, payload.code, payload.name, payload.gstOn, payload.fyId, payload.fyLabel);
        } else if (action === 'closeTab') {
          window.WorkspaceManager.closeTab(payload.tabId || payload.moduleId);
        } else if (action === 'openModule' || action === 'openTab') {
          window.WorkspaceManager.openModule(payload.moduleId, payload.queryParams || payload.params || '');
        } else if (action === 'updateGstMenuVisibility') {
          window.WorkspaceManager.updateGstMenuVisibility();
        }
      }
    } catch (e) {
      console.warn('[WorkspaceBridge] postMessage error:', e);
    }
  }

  return {
    closeTab: function(tabId) {
      _send('closeTab', { tabId: tabId });
    },
    openModule: function(moduleId, queryParams = '') {
      _send('openModule', { moduleId: moduleId, queryParams: queryParams });
    },
    openTab: function(moduleId, queryParams = '') {
      _send('openModule', { moduleId: moduleId, queryParams: queryParams });
    },
    setActiveSociety: function(societyId, code, name, gstOn, fyId, fyLabel) {
      if (typeof societyId === 'string' && isNaN(parseInt(societyId, 10))) {
        _send('setActiveSociety', { societyId: null, code: societyId, name: code, gstOn: name, fyId: gstOn, fyLabel: fyId });
      } else {
        _send('setActiveSociety', { societyId: societyId, code: code, name: name, gstOn: gstOn, fyId: fyId, fyLabel: fyLabel });
      }
    },
    setActiveFY: function(fyId, fyLabel, fyStart, fyEnd) {
      _send('setActiveFY', { fyId: fyId, fyLabel: fyLabel, fyStart: fyStart, fyEnd: fyEnd });
    },
    updateGstMenuVisibility: function() {
      _send('updateGstMenuVisibility', {});
    }
  };

})();

if (typeof window !== 'undefined') {
  window.WorkspaceBridge = WorkspaceBridge;
}
