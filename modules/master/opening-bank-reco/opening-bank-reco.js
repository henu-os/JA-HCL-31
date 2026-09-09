// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Opening Bank Reconciliation JS
// Live REST API Integration, Bank Account Querying & Grid Traversal
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  function obrApiBase() {
    if (window.API_BASE_URL) return window.API_BASE_URL;
    if (window.AppConfig && window.AppConfig.apiBase) return window.AppConfig.apiBase;
    return 'http://localhost:5002';
  }

  function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = (typeof Auth !== 'undefined' && Auth.getToken)
      ? Auth.getToken()
      : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }

  let bankAccounts = [];
  let vouchers = [];
  let selectedIdx = 0;
  let multiMode = false;

  function toast(m, ok) {
    if (typeof window.toast === 'function') {
      window.toast(m, ok !== false ? 'success' : 'error');
    } else {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:12px;right:12px;z-index:100000;padding:10px 18px;font-size:12px;font-weight:700;color:#FFF;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.2);background:' + (ok !== false ? '#2E7D32' : '#C62828') + ';';
      d.textContent = m;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 2500);
    }
  }

  async function loadBankAccounts() {
    try {
      const res = await fetch(`${obrApiBase()}/api/opening-bank-reco/banks`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          bankAccounts = json.data;
        }
      }
    } catch (e) {
      console.warn("Failed to load bank accounts from API:", e);
    }
    OBR.populateBanks();
  }

  async function loadFromServer() {
    try {
      const res = await fetch(`${obrApiBase()}/api/opening-bank-reco`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          vouchers = json.data;
        } else {
          vouchers = [];
        }
      } else {
        vouchers = [];
      }
    } catch (e) {
      vouchers = [];
    }
    OBR.renderGrid();
  }

  window.OBR = {
    renderGrid: function () {
      const fieldEl = document.getElementById('obr-search-field');
      const kwEl = document.getElementById('obr-search-kw');
      const field = fieldEl ? fieldEl.value : 'all';
      const kw = kwEl ? kwEl.value.toLowerCase().trim() : '';

      const filtered = vouchers.filter(v => {
        if (!kw) return true;
        if (field === 'all') {
          return ((v.vchNo || '') + (v.chqNo || '') + (v.bank || '') + (v.amount || '') + (v.paidTo || '') + (v.vchDate || '')).toLowerCase().indexOf(kw) >= 0;
        } else {
          const val = (v[field] || '').toString().toLowerCase();
          return val.indexOf(kw) >= 0;
        }
      });

      if (selectedIdx < 0) selectedIdx = 0;
      if (selectedIdx >= filtered.length) selectedIdx = Math.max(0, filtered.length - 1);

      const chkAll = document.getElementById('obr-chk-all');
      if (chkAll) chkAll.style.display = multiMode ? 'inline' : 'none';

      const thCheckbox = document.getElementById('obr-th-checkbox');
      if (thCheckbox) thCheckbox.style.display = multiMode ? '' : 'none';

      const tbody = document.getElementById('obr-tbody');
      if (!tbody) return;

      let html = '';
      if (filtered.length === 0) {
        html = '<tr><td colspan="11" style="text-align:center; padding:30px; color:#9E9E9E; font-weight:bold;">No vouchers found in database. Click ADD to create a voucher.</td></tr>';
      } else {
        filtered.forEach((v, idx) => {
          const isSelected = (idx === selectedIdx);
          const trClass = isSelected ? 'selected' : '';
          let tr = `<tr class="${trClass}" onclick="OBR.selectRow(${idx})" ondblclick="OBR.openAlter()">`;
          if (multiMode) {
            tr += `<td style="text-align:center;"><input type="checkbox" ${v.checked ? 'checked' : ''} onclick="OBR.checkRow(${v.id}, this.checked); event.stopPropagation();" style="accent-color:#1565C0;"></td>`;
          } else {
            tr += `<td style="display:none;"></td>`;
          }
          tr += `<td style="font-family:monospace; font-weight:bold; color:#1565C0;">${v.vchNo}</td>`;
          tr += `<td style="font-family:monospace;">${v.vchDate || ''}</td>`;
          tr += `<td style="font-family:monospace; font-weight:bold; color:#1565C0;">${v.bank || ''}</td>`;
          tr += `<td style="text-align:right; font-family:monospace; font-weight:bold; color:#1565C0;">${parseFloat(v.amount || 0).toFixed(2)}</td>`;
          tr += `<td style="font-family:monospace;">${v.chqNo || ''}</td>`;
          tr += `<td style="font-family:monospace;">${v.chqDate || ''}</td>`;
          tr += `<td style="font-family:monospace;">${v.billNo || ''}</td>`;
          tr += `<td style="font-family:monospace;">${v.paidTo || ''}</td>`;
          tr += `<td style="font-family:monospace; color:#616161;">${v.part1 || ''}</td>`;
          tr += `<td style="font-family:monospace; color:#616161;">${v.part2 || ''}</td>`;
          tr += `</tr>`;
          html += tr;
        });
      }
      tbody.innerHTML = html;

      const countEl = document.getElementById('obr-status-count');
      if (countEl) countEl.textContent = filtered.length + ' Vouchers';

      OBR.currentFiltered = filtered;
    },

    selectRow: function (idx) {
      selectedIdx = idx;
      OBR.renderGrid();
    },

    checkRow: function (id, val) {
      const v = vouchers.find(x => x.id === id);
      if (v) v.checked = val;
    },

    toggleAll: function (val) {
      if (OBR.currentFiltered) {
        OBR.currentFiltered.forEach(v => v.checked = val);
        OBR.renderGrid();
      }
    },

    populateBanks: function () {
      const selForm = document.getElementById('obr-f-bank');
      const selBulk = document.getElementById('obr-mc-bank');
      if (!selForm) return;

      let html = '';
      if (bankAccounts.length > 0) {
        bankAccounts.forEach(b => {
          html += `<option value="${b.accName}">${b.accCode ? '[' + b.accCode + '] ' : ''}${b.accName}</option>`;
        });
      } else {
        html = '<option value="HDFC Bank">HDFC Bank</option><option value="ICICI Bank">ICICI Bank</option><option value="SBI Bank">SBI Bank</option><option value="Cash In Hand">Cash In Hand</option>';
      }

      selForm.innerHTML = html;
      if (selBulk) selBulk.innerHTML = '<option value="">-- No Change --</option>' + html;
    },

    openAdd: function () {
      document.getElementById('obr-f-id').value = '0';

      // Auto-sequence next voucher number while keeping input fully editable (BOTH Auto & Manual)
      const maxSeq = vouchers.reduce((acc, curr) => {
        const num = parseInt((curr.vchNo || '').replace(/[^0-9]/g, '')) || 0;
        return Math.max(acc, num);
      }, 1000);
      document.getElementById('obr-f-vchno').value = 'OBR-' + (maxSeq + 1);

      document.getElementById('obr-f-vchdate').value = new Date().toISOString().split('T')[0];
      if (document.getElementById('obr-f-bank').options.length > 0) {
        document.getElementById('obr-f-bank').selectedIndex = 0;
      }
      document.getElementById('obr-f-amt').value = '0.00';
      document.getElementById('obr-f-chqno').value = '';
      document.getElementById('obr-f-chqdate').value = '';
      document.getElementById('obr-f-billno').value = '';
      document.getElementById('obr-f-paidto').value = '';
      document.getElementById('obr-f-narration').value = '';
      document.getElementById('obr-f-part1').value = '';
      document.getElementById('obr-f-part2').value = '';

      document.getElementById('obr-modal-title').innerHTML = '<i class="bi bi-file-earmark-text-fill"></i> New Opening Bank Reco';
      document.getElementById('obr-entry-modal').classList.add('active');
    },

    openAlter: function () {
      if (!OBR.currentFiltered || OBR.currentFiltered.length === 0) return;
      const v = OBR.currentFiltered[selectedIdx];
      if (!v) return;

      document.getElementById('obr-f-id').value = v.id;
      document.getElementById('obr-f-vchno').value = v.vchNo;
      document.getElementById('obr-f-vchdate').value = v.vchDate || '';
      document.getElementById('obr-f-bank').value = v.bank || '';
      document.getElementById('obr-f-amt').value = v.amount || 0;
      document.getElementById('obr-f-chqno').value = v.chqNo || '';
      document.getElementById('obr-f-chqdate').value = v.chqDate || '';
      document.getElementById('obr-f-billno').value = v.billNo || '';
      document.getElementById('obr-f-paidto').value = v.paidTo || '';
      document.getElementById('obr-f-narration').value = v.narration || '';
      document.getElementById('obr-f-part1').value = v.part1 || '';
      document.getElementById('obr-f-part2').value = v.part2 || '';

      document.getElementById('obr-modal-title').innerHTML = '<i class="bi bi-pencil-square"></i> Alter Voucher: ' + v.vchNo;
      document.getElementById('obr-entry-modal').classList.add('active');
    },

    saveVoucher: async function () {
      const id = parseInt(document.getElementById('obr-f-id').value) || 0;
      const newV = {
        vchNo: document.getElementById('obr-f-vchno').value,
        vchDate: document.getElementById('obr-f-vchdate').value,
        bank: document.getElementById('obr-f-bank').value,
        amount: parseFloat(document.getElementById('obr-f-amt').value) || 0,
        chqNo: document.getElementById('obr-f-chqno').value,
        chqDate: document.getElementById('obr-f-chqdate').value,
        billNo: document.getElementById('obr-f-billno').value,
        paidTo: document.getElementById('obr-f-paidto').value,
        part1: document.getElementById('obr-f-part1').value,
        part2: document.getElementById('obr-f-part2').value,
        narration: document.getElementById('obr-f-narration').value,
        isCleared: false
      };

      let url = `${obrApiBase()}/api/opening-bank-reco`;
      let method = 'POST';
      if (id !== 0) {
        url += '/' + id;
        method = 'PUT';
      }

      try {
        const res = await fetch(url, {
          method: method,
          headers: getAuthHeaders(),
          body: JSON.stringify(newV)
        });
        const json = await res.json();
        if (res.ok && json.success) {
          toast(id === 0 ? 'Opening bank reco voucher saved.' : 'Reco voucher updated.', true);
          document.getElementById('obr-entry-modal').classList.remove('active');
          loadFromServer();
        } else {
          alert(json.message || 'Save failed');
        }
      } catch (e) {
        alert('Save Error: ' + e.message);
      }
    },

    deleteSingle: async function () {
      if (multiMode) {
        const toDel = vouchers.filter(v => v.checked);
        if (toDel.length === 0) { toast('No vouchers checked.', false); return; }
        if (!confirm('Delete ' + toDel.length + ' selected vouchers permanently?')) return;

        try {
          const promises = toDel.map(v => fetch(`${obrApiBase()}/api/opening-bank-reco/${v.id}`, { method: 'DELETE', headers: getAuthHeaders() }));
          await Promise.all(promises);
          multiMode = false;
          toast(toDel.length + ' vouchers deleted.', true);
          loadFromServer();
        } catch (e) {
          toast('Failed to delete some vouchers.', false);
        }
      } else {
        if (!OBR.currentFiltered || OBR.currentFiltered.length === 0) return;
        const v = OBR.currentFiltered[selectedIdx];
        if (!v) return;
        if (!confirm('Delete voucher ' + v.vchNo + ' permanently?')) return;

        try {
          const res = await fetch(`${obrApiBase()}/api/opening-bank-reco/${v.id}`, { method: 'DELETE', headers: getAuthHeaders() });
          const json = await res.json();
          if (res.ok && json.success) {
            toast('Voucher deleted from reconciliation list.', true);
            loadFromServer();
          } else {
            alert(json.message || 'Delete failed');
          }
        } catch (e) {
          alert('Error: ' + e.message);
        }
      }
    },

    viewVoucher: function () {
      OBR.openAlter();
    },

    printRegister: function () {
      const w = window.open('', '_blank');
      let html = `<html><head><title>Opening Bank Reco Register</title><style>body{font-family:"Segoe UI",sans-serif;font-size:10px;margin:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #808080;padding:4px;text-align:left;}th{background:#F5F5F5;font-weight:bold;text-align:center;}h2{text-align:center;}</style></head><body><h2>Opening Bank Reconciliation Register</h2><table><thead><tr><th>Voucher No</th><th>Date</th><th>Bank Ledger</th><th>Chq No</th><th>Chq Date</th><th>Paid To / Recd From</th><th style="text-align:right;">Amount</th></tr></thead><tbody>`;

      let tot = 0;
      (OBR.currentFiltered || vouchers).forEach(v => {
        tot += parseFloat(v.amount) || 0;
        html += `<tr><td>${v.vchNo}</td><td>${v.vchDate || ''}</td><td>${v.bank || ''}</td><td>${v.chqNo || ''}</td><td>${v.chqDate || ''}</td><td>${v.paidTo || ''}</td><td style="text-align:right;">${parseFloat(v.amount || 0).toFixed(2)}</td></tr>`;
      });
      html += `<tr><td colspan="6" style="text-align:right;font-weight:bold;">Total Uncleared Sum</td><td style="text-align:right;font-weight:bold;color:#1565C0;">${tot.toFixed(2)}</td></tr>`;
      html += '</tbody></table></body></html>';
      w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 300);
    },

    multiDeleteMode: function () {
      multiMode = !multiMode;
      vouchers.forEach(v => v.checked = false);
      OBR.renderGrid();
      toast(multiMode ? 'Multi Delete mode active.' : 'Multi Delete deactivated.', true);
    },

    multiChangeMode: function () {
      const checked = vouchers.filter(v => v.checked);
      if (!multiMode || checked.length === 0) {
        multiMode = true;
        OBR.renderGrid();
        toast('Select vouchers first using checkboxes, then click Bulk Change.', true);
        return;
      }
      document.getElementById('obr-mc-modal').classList.add('active');
    },

    applyMultiChange: async function () {
      const nb = document.getElementById('obr-mc-bank').value;
      const nd = document.getElementById('obr-mc-date').value;
      const st = document.getElementById('obr-mc-status').value;

      const checked = vouchers.filter(v => v.checked);
      try {
        const promises = checked.map(v => {
          const updated = Object.assign({}, v);
          if (nb) updated.bank = nb;
          if (nd) updated.chqDate = nd;
          if (st === 'cleared') updated.isCleared = true;
          if (st === 'uncleared') updated.isCleared = false;
          return fetch(`${obrApiBase()}/api/opening-bank-reco/${v.id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updated)
          });
        });
        await Promise.all(promises);
        document.getElementById('obr-mc-modal').classList.remove('active');
        multiMode = false;
        vouchers.forEach(v => v.checked = false);
        toast('Bulk change applied successfully.', true);
        loadFromServer();
      } catch (e) {
        toast('Failed to apply some updates.', false);
      }
    },

    importData: function () { toast('Import Excel started...', true); },
    exportData: function (fmt) { toast('Exporting data as ' + fmt.toUpperCase(), true); },

    exit: function () {
      if (typeof window.WorkspaceBridge !== 'undefined') {
        window.WorkspaceBridge.closeTab('opening-bank-reco');
      }
    }
  };

  // Keyboard navigation
  document.addEventListener('keydown', function (e) {
    const p = document.getElementById('obr-panel');
    if (!p || p.offsetWidth === 0 || p.offsetHeight === 0) return;

    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, (OBR.currentFiltered || vouchers).length - 1); OBR.renderGrid(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); OBR.renderGrid(); }
    if (e.key === 'Escape') { e.preventDefault(); OBR.exit(); }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await loadBankAccounts();
      await loadFromServer();
    });
  } else {
    loadBankAccounts();
    loadFromServer();
  }

})();
