/**
 * contra-entry.js — Jeevika ERP v2
 * Contra Entry (Voucher) Directory, Dynamic Accounts & Line Items Logic
 */

(function () {
  'use strict';

  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && (k.startsWith('jeevika_contras') || k.startsWith('jeevika_contra_entries'))) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

  var contras = [];
  var accounts = [];
  var gridRows = [];
  var selectedContraId = null;
  var sortDirection = 'asc';

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, ok) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, ok ? 'success' : 'error');
    } else {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;padding:9px 18px;font-size:12px;font-weight:600;color:#FFF;border-radius:3px;box-shadow:0 3px 12px rgba(0,0,0,0.2);background:' + (ok !== false ? '#2E7D32' : '#C62828') + ';';
      d.textContent = msg;
      document.body.appendChild(d);
      setTimeout(function () { d.remove(); }, 2500);
    }
  }

  function getActiveSocietyId() {
    return (window.Auth && Auth.getSocietyId) ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '4');
  }

  function getFyId() {
    return (window.Auth && Auth.getFYId) ? Auth.getFYId() : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '1');
  }

  function getFyLabel() {
    return (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || '2025-26');
  }

  function getAuthHeaders() {
    var token = (typeof Auth !== 'undefined' && Auth.getToken) 
      ? Auth.getToken() 
      : (sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken'));
    var societyId = getActiveSocietyId();
    var fyId = getFyId();

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (societyId) headers['X-Society-Id'] = societyId;
    if (fyId) headers['X-FY-Id'] = fyId;
    return headers;
  }

  async function fetchApiData(endpoint) {
    var headers = getAuthHeaders();
    var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
    var path = endpoint.startsWith('/api/') ? endpoint : ('/api' + (endpoint.startsWith('/') ? endpoint : '/' + endpoint));
    var fullUrl = baseHost + path;

    try {
      var resp = await fetch(fullUrl, { headers: headers });
      if (resp.ok) {
        var json = await resp.json();
        if (json && json.data && Array.isArray(json.data)) return json.data;
        if (Array.isArray(json)) return json;
        return json;
      }
    } catch (e) {
      console.warn("API fetch error for " + endpoint, e);
    }
    return null;
  }

  // ── 1. LOAD MASTER DATA ─────────────────────────────────────────
  async function loadMasterData() {
    var sid = getActiveSocietyId();

    if (typeof fetchMasterAccounts === 'function') {
      accounts = await fetchMasterAccounts(sid);
    } else {
      var accData = await fetchApiData('/api/accounts?societyId=' + sid);
      if (accData && Array.isArray(accData)) accounts = accData;
      if (!accounts || accounts.length === 0) {
        accounts = (typeof getStandardMasterAccounts === 'function') ? getStandardMasterAccounts() : [];
      }
    }

    populateFormDropdowns();
  }

  window.contraAccountFilter = function (a) {
    var isAsset = (a.grpMainId === 1) || (String(a.mainGroup || '').toLowerCase() === 'asset');
    var isCashBankGrp = String(a.groupName || '').toLowerCase().includes('cash & bank') || String(a.groupName || '').toLowerCase().includes('cash and bank');
    return isAsset && isCashBankGrp;
  };

  function getFilteredContraAccounts() {
    var filtered = accounts.filter(window.contraAccountFilter);
    if (filtered.length === 0) {
      filtered = accounts.filter(function (a) {
        var isAsset = (a.grpMainId === 1) || (String(a.mainGroup || '').toLowerCase() === 'asset');
        var isCashAcc = String(a.accName || '').toLowerCase().includes('cash') || String(a.accName || '').toLowerCase().includes('bank');
        return isAsset && isCashAcc;
      });
    }
    return filtered;
  }

  function populateFormDropdowns() {
    var contraAccs = getFilteredContraAccounts();
    if (typeof initAccountSearchCombobox === 'function') {
      initAccountSearchCombobox('entry-acc-sel', contraAccs);
    } else {
      var entrySel = document.getElementById('entry-acc-sel');
      if (entrySel) {
        var html = '<option value="">— Select Account —</option>';
        contraAccs.forEach(function (a) {
          html += '<option value="' + a.accountId + '">' + escHtml((a.accCode || '') + ' - ' + (a.accName || '')) + '</option>';
        });
        entrySel.innerHTML = html;
      }
    }
  }


  function persistContrasLocally(sid, list) {
    if (!sid) sid = getActiveSocietyId();
    try {
      var jsonStr = JSON.stringify(list || []);
      localStorage.setItem('jeevika_contras_' + sid, jsonStr);
      localStorage.setItem('jeevika_contras_1', jsonStr);
      localStorage.setItem('jeevika_contras_global', jsonStr);
    } catch (e) {
      console.warn("Failed saving contras to localStorage", e);
    }
  }

  async function loadContras() {
    var sid = getActiveSocietyId();
    var fyid = getFyId();

    var data = await fetchApiData('/api/vouchers?societyId=' + sid + '&fyId=' + fyid + '&type=Contra');
    if (!data || (Array.isArray(data) && data.length === 0) || (data.data && Array.isArray(data.data) && data.data.length === 0)) {
      var dataAll = await fetchApiData('/api/vouchers?societyId=' + sid + '&type=Contra');
      if (dataAll) data = dataAll;
    }
    var apiRecords = (data && Array.isArray(data)) ? data : ((data && data.data && Array.isArray(data.data)) ? data.data : []);

    contras = apiRecords.map(function(item) {
      item.contraId = item.voucherId || item.contraId;
      item.cashBank = item.cashBank || item.cashBankName || 'Cash / Bank Transfer';
      item.personName = item.personName || 'Self Cash/Bank Transfer';
      item.particular1 = item.particular1 || item.narration || 'Contra Voucher';
      return item;
    });

    renderContrasTable();
  }

  // ── 2. REGISTER TABLE & SORTING ──────────────────────────────────
  window.toggleVoucherNoSort = function () {
    sortDirection = (sortDirection === 'desc' ? 'asc' : 'desc');
    var icon = document.getElementById('sort-vno-icon');
    if (icon) icon.textContent = (sortDirection === 'desc' ? '▼' : '▲');
    renderContrasTable();
  };

  function renderContrasTable() {
    var tbody = document.getElementById('ce-list-tbody');
    if (!tbody) return;

    var filtered = contras.filter(function (b) {
      var fNo = (document.getElementById('flt-vno') ? document.getElementById('flt-vno').value.toLowerCase().trim() : '');
      var fPerson = (document.getElementById('flt-person') ? document.getElementById('flt-person').value.toLowerCase().trim() : '');

      if (fNo && (b.voucherNo || '').toLowerCase().indexOf(fNo) === -1) return false;

      if (fPerson) {
        var pName = (b.personName || '').toLowerCase();
        var cb = (b.cashBank || '').toLowerCase();
        var chq = (b.chqNo || '').toLowerCase();
        var bNo = (b.billNo || '').toLowerCase();
        var part1 = (b.particular1 || '').toLowerCase();
        var part2 = (b.particular2 || '').toLowerCase();

        var matches = (
          pName.indexOf(fPerson) !== -1 ||
          cb.indexOf(fPerson) !== -1 ||
          chq.indexOf(fPerson) !== -1 ||
          bNo.indexOf(fPerson) !== -1 ||
          part1.indexOf(fPerson) !== -1 ||
          part2.indexOf(fPerson) !== -1
        );
        if (!matches) return false;
      }

      return true;
    });

    filtered.sort(function (a, b) {
      var noA = (a.voucherNo || '').toLowerCase();
      var noB = (b.voucherNo || '').toLowerCase();
      if (sortDirection === 'asc') {
        return noA.localeCompare(noB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return noB.localeCompare(noA, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    document.getElementById('ce-list-count').textContent = filtered.length + ' entries';

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:35px; color:#94a3b8; font-weight:600;">No Contra Vouchers Found</td></tr>';
      document.getElementById('sum-con-count').textContent = '0';
      document.getElementById('sum-con-total').textContent = '₹0.00';
      return;
    }

    var html = '';
    var totalGrd = 0;

    filtered.forEach(function (b) {
      var isSel = (b.contraId === selectedContraId);
      var amt = b.amount || 0;
      totalGrd += amt;

      var cId = b.contraId || b.voucherId;
      var chkHtml = (window.ERP_MultiChange && typeof ERP_MultiChange.renderCheckbox === 'function')
        ? ERP_MultiChange.renderCheckbox(cId)
        : '<td style="width:36px; text-align:center;"><input type="checkbox" class="row-chk" value="' + cId + '"></td>';

      html += '<tr class="' + (isSel ? 'row-active' : '') + '" data-id="'+(b.contraId||b.voucherId||b.voucherNo||'')+'" onclick="selectContraRow(this.dataset.id, this)" ondblclick="editSelectedContra(this.dataset.id)">' +
        chkHtml +
        '<td style="font-weight:700; color:#0D47A1;">' + (b.voucherNo || '') + '</td>' +
        '<td>' + (b.voucherDate || '') + '</td>' +
        '<td>' + (b.cashBank || 'Cash/Bank') + '</td>' +
        '<td style="text-align:right; font-weight:800; color:#0D47A1; font-family:\'Consolas\', monospace;">' + amt.toFixed(2) + '</td>' +
        '<td>' + (b.chqNo || '-') + '</td>' +
        '<td>' + (b.chqDate || '-') + '</td>' +
        '<td>' + (b.billNo || '-') + '</td>' +
        '<td style="font-weight:700;">' + (b.personName || '—') + '</td>' +
        '<td>' + (b.particular1 || '-') + '</td>' +
        '<td>' + (b.particular2 || '-') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;

    document.getElementById('sum-con-count').textContent = filtered.length;
    document.getElementById('sum-con-total').textContent = '₹' + totalGrd.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    initColumnResizing();
  }

  function initColumnResizing() {
    setTimeout(function () {
      var tables = document.querySelectorAll('table.erp-table');
      tables.forEach(function (table) {
        var ths = table.querySelectorAll('th');
        ths.forEach(function (th) {
          if (th.querySelector('.col-resizer')) return;

          var resizer = document.createElement('div');
          resizer.className = 'col-resizer';
          th.appendChild(resizer);

          var startX, startWidth;

          resizer.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            startX = e.pageX;
            startWidth = th.offsetWidth;
            resizer.classList.add('resizing');

            function onMouseMove(e) {
              var newWidth = startWidth + (e.pageX - startX);
              if (newWidth > 35) {
                th.style.width = newWidth + 'px';
                th.style.minWidth = newWidth + 'px';
              }
            }

            function onMouseUp() {
              resizer.classList.remove('resizing');
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          });
        });
      });
    }, 100);
  }

  window.selectContraRow = function (id, trEl) {
    selectedContraId = id;
    if (trEl && trEl.parentElement) {
      trEl.parentElement.querySelectorAll('tr').forEach(function (r) { r.classList.remove('row-active', 'selected'); });
      trEl.classList.add('row-active', 'selected');
    }
  };

  // ── 3. FORM LOGIC & GRID ACTIONS ────────────────────────────────
  window.confirmAddLineItem = function () {
    var accId = document.getElementById('entry-acc-sel').value;
    var type = document.getElementById('entry-type').value;
    var amt = parseFloat(document.getElementById('entry-amount').value) || 0;

    if (!accId) { toast('Please select an Account.', false); return; }
    if (amt <= 0) { toast('Please enter a valid Entry Amount.', false); return; }

    var accObj = accounts.find(function (a) { return String(a.accountId) === String(accId); });
    var accCode = accObj ? accObj.accCode : 'ASS-1001';
    var accName = accObj ? accObj.accName : 'Cash in Hand';

    gridRows.push({
      sr: gridRows.length + 1,
      code: accCode,
      name: accName,
      dr: (type === 'Dr' ? amt : 0),
      cr: (type === 'Cr' ? amt : 0)
    });

    // Reset account selection and amount to blank
    if (typeof setAccountSearchComboboxValue === 'function') {
      setAccountSearchComboboxValue('entry-acc-sel', '', '');
    } else {
      var s = document.getElementById('entry-acc-sel');
      if (s) s.value = '';
      var ci = document.getElementById('entry-acc-sel-combo-inp');
      if (ci) ci.value = '';
    }
    var amtEl = document.getElementById('entry-amount');
    if (amtEl) amtEl.value = '';

    renderGridTable();

    var comboInp = document.getElementById('entry-acc-sel-combo-inp') || document.getElementById('entry-acc-sel');
    if (comboInp) {
      comboInp.focus();
      var p = document.getElementById('entry-acc-sel-combo-panel');
      if (p) p.style.display = 'none';
      setTimeout(function() {
        if (p) p.style.display = 'none';
      }, 30);
    }
  };

  window.removeGridRow = function (idx) {
    gridRows.splice(idx, 1);
    renderGridTable();
  };

  function getAllowGridAccountSelectConfig() {
    try {
      var sid = getActiveSocietyId();
      var cfgStr = localStorage.getItem('jeevika_config_notes_' + sid) || localStorage.getItem('jeevika_config_notes_global');
      if (cfgStr) {
        var cfg = JSON.parse(cfgStr);
        if (cfg && cfg.allowGridAccountSelect !== undefined) {
          return !!cfg.allowGridAccountSelect;
        }
      }
    } catch (e) {}
    return false;
  }

  function updateGridTotals() {
    var totDr = 0;
    var totCr = 0;
    gridRows.forEach(function (r) {
      totDr += (parseFloat(r.dr) || 0);
      totCr += (parseFloat(r.cr) || 0);
    });
    var elDr = document.getElementById('grid-tot-dr');
    if (elDr) elDr.textContent = totDr.toFixed(2);
    var elCr = document.getElementById('grid-tot-cr');
    if (elCr) elCr.textContent = totCr.toFixed(2);

    var diff = totDr - totCr;
    var elDiff = document.getElementById('grid-diff');
    if (elDiff) elDiff.textContent = Math.abs(diff).toFixed(2) + (diff >= 0 ? ' Dr' : ' Cr');
    var elNet = document.getElementById('grid-net-bal');
    if (elNet) elNet.textContent = Math.abs(diff).toFixed(2) + (diff >= 0 ? ' Dr' : ' Cr');
  }

  function findAccountByCodeOrName(val, list) {
    if (!val) return null;
    var accList = list || accounts || [];
    val = String(val).trim();
    var dashIdx = val.indexOf(' - ');
    if (dashIdx > 0) {
      var codePart = val.substring(0, dashIdx).trim();
      var namePart = val.substring(dashIdx + 3).trim();
      var match = accList.find(function (a) {
        return (a.accCode && a.accCode.toLowerCase() === codePart.toLowerCase()) ||
               (a.accName && a.accName.toLowerCase() === namePart.toLowerCase());
      });
      if (match) return match;
    }
    var matchByCode = accList.find(function (a) {
      return a.accCode && a.accCode.toLowerCase() === val.toLowerCase();
    });
    if (matchByCode) return matchByCode;
    var matchByName = accList.find(function (a) {
      return a.accName && a.accName.toLowerCase() === val.toLowerCase();
    });
    if (matchByName) return matchByName;
    var matchPrefix = accList.find(function (a) {
      return a.accCode && val.toLowerCase().startsWith(a.accCode.toLowerCase());
    });
    if (matchPrefix) return matchPrefix;
    return null;
  }

  window.onGridAccountInput = function (idx, val) {
    if (!gridRows[idx]) gridRows[idx] = { sr: idx + 1, code: '', name: '', dr: 0, cr: 0 };
    var acc = findAccountByCodeOrName(val, accounts);
    var codeEl = document.getElementById('ce-grid-code-txt-' + idx);
    if (acc) {
      gridRows[idx].code = acc.accCode;
      gridRows[idx].name = acc.accName;
      if (codeEl) codeEl.textContent = acc.accCode;
      if (!gridRows[idx].dr && !gridRows[idx].cr) {
        var topAmt = parseFloat(document.getElementById('entry-amount').value) || 0;
        if (topAmt > 0) gridRows[idx].dr = topAmt;
      }
    } else {
      gridRows[idx].name = val;
      if (codeEl) codeEl.textContent = gridRows[idx].code || '—';
    }
    updateGridTotals();
  };

  window.onGridAccountSelect = function (idx, val) {
    window.onGridAccountInput(idx, val);
    var acc = findAccountByCodeOrName(val, accounts);
    if (acc) {
      var nameInp = document.getElementById('ce-grid-name-inp-' + idx);
      if (nameInp) nameInp.value = acc.accName;
    }
    renderGridTable();
  };

  window.onGridDrChange = function (idx, val) {
    if (!gridRows[idx]) gridRows[idx] = { sr: idx + 1, code: '', name: '', dr: 0, cr: 0 };
    gridRows[idx].dr = parseFloat(val) || 0;
    updateGridTotals();
  };

  window.onGridCrChange = function (idx, val) {
    if (!gridRows[idx]) gridRows[idx] = { sr: idx + 1, code: '', name: '', dr: 0, cr: 0 };
    gridRows[idx].cr = parseFloat(val) || 0;
    updateGridTotals();
  };

  function renderGridTable() {
    var tbody = document.getElementById('ce-grid-tbody');
    if (!tbody) return;

    var isInlineGridAllowed = getAllowGridAccountSelectConfig();
    var html = '';
    var totDr = 0;
    var totCr = 0;

    // Refresh shared datalist for autocomplete
    var dl = document.getElementById('ce-grid-accounts-datalist');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'ce-grid-accounts-datalist';
      document.body.appendChild(dl);
    }
    var dlHtml = '';
    accounts.forEach(function (a) {
      dlHtml += '<option value="' + escHtml(a.accCode + ' - ' + a.accName) + '"></option>';
    });
    dl.innerHTML = dlHtml;

    if (isInlineGridAllowed) {
      while (gridRows.length < 4) {
        gridRows.push({ sr: gridRows.length + 1, code: '', name: '', dr: 0, cr: 0 });
      }

      gridRows.forEach(function (r, idx) {
        r.sr = idx + 1;
        totDr += (parseFloat(r.dr) || 0);
        totCr += (parseFloat(r.cr) || 0);

        var displayVal = r.name || '';

        html += '<tr>' +
          '<td style="text-align:center; font-weight:700; width:45px;">' + r.sr + '</td>' +
          '<td style="width:130px; text-align:center; font-family:\'Consolas\', monospace; font-weight:700; color:#0D47A1;" id="ce-grid-code-txt-' + idx + '">' +
            escHtml(r.code || '—') +
          '</td>' +
          '<td style="padding:3px 6px;">' +
            '<input type="text" class="form-inp" list="ce-grid-accounts-datalist" id="ce-grid-name-inp-' + idx + '" value="' + escHtml(displayVal) + '" placeholder="Select Account (Search by Code or Name)" oninput="onGridAccountInput(' + idx + ', this.value)" onchange="onGridAccountSelect(' + idx + ', this.value)" style="height:24px; padding:1px 8px; font-size:11px; font-weight:600; width:100%; border:1px solid #cbd5e1; border-radius:3px;">' +
          '</td>' +
          '<td style="width:120px; padding:3px 6px; text-align:right;">' +
            '<input type="number" step="0.01" value="' + (r.dr > 0 ? r.dr : '') + '" placeholder="" oninput="onGridDrChange(' + idx + ', this.value)" style="height:24px; padding:1px 6px; font-size:11px; text-align:right; font-family:\'Consolas\', monospace; font-weight:700; width:100%; border:1px solid #cbd5e1; border-radius:3px; color:#2E7D32; box-sizing:border-box;">' +
          '</td>' +
          '<td style="width:120px; padding:3px 6px; text-align:right;">' +
            '<input type="number" step="0.01" value="' + (r.cr > 0 ? r.cr : '') + '" placeholder="" oninput="onGridCrChange(' + idx + ', this.value)" style="height:24px; padding:1px 6px; font-size:11px; text-align:right; font-family:\'Consolas\', monospace; font-weight:700; width:100%; border:1px solid #cbd5e1; border-radius:3px; color:#dc2626; box-sizing:border-box;">' +
          '</td>' +
          '</tr>';
      });

    } else {
      if (gridRows.length === 0) {
        for (var i = 1; i <= 4; i++) {
          html += '<tr>' +
            '<td style="text-align:center; color:#94a3b8; font-weight:700;">' + i + '</td>' +
            '<td style="color:#94a3b8;">—</td>' +
            '<td style="color:#94a3b8; font-style:italic;">Select Account</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#94a3b8;">-</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#94a3b8;">-</td>' +
            '</tr>';
        }
      } else {
        gridRows.forEach(function (r, idx) {
          r.sr = idx + 1;
          totDr += (parseFloat(r.dr) || 0);
          totCr += (parseFloat(r.cr) || 0);
          html += '<tr>' +
            '<td style="text-align:center; font-weight:700;">' + r.sr + '</td>' +
            '<td style="font-family:\'Consolas\', monospace; font-weight:700; color:#0D47A1;">' + escHtml(r.code) + '</td>' +
            '<td style="font-weight:600; display:flex; justify-content:space-between; align-items:center;">' +
              '<span>' + escHtml(r.name) + '</span>' +
              '<button type="button" onclick="removeGridRow(' + idx + ')" style="border:none; background:none; color:#ef4444; cursor:pointer; font-size:12px; font-weight:bold; padding:0 4px;" title="Remove row">✕</button>' +
            '</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#2E7D32; font-weight:700;">' + (r.dr > 0 ? Number(r.dr).toFixed(2) : '-') + '</td>' +
            '<td style="text-align:right; font-family:\'Consolas\', monospace; color:#dc2626; font-weight:700;">' + (r.cr > 0 ? Number(r.cr).toFixed(2) : '-') + '</td>' +
            '</tr>';
        });
      }
    }

    tbody.innerHTML = html;

    var elDr = document.getElementById('grid-tot-dr');
    if (elDr) elDr.textContent = totDr.toFixed(2);
    var elCr = document.getElementById('grid-tot-cr');
    if (elCr) elCr.textContent = totCr.toFixed(2);

    var diff = totDr - totCr;
    var elDiff = document.getElementById('grid-diff');
    if (elDiff) elDiff.textContent = Math.abs(diff).toFixed(2) + (diff >= 0 ? ' Dr' : ' Cr');
    var elNet = document.getElementById('grid-net-bal');
    if (elNet) elNet.textContent = Math.abs(diff).toFixed(2) + (diff >= 0 ? ' Dr' : ' Cr');
  }

  window.openAddContraForm = async function () {
    selectedContraId = null;
    var vNoEl = document.getElementById('frm-vno');
    if (vNoEl) {
      vNoEl.readOnly = false;
      vNoEl.disabled = false;
      vNoEl.value = (typeof fetchTxNextVoucherNo === 'function') 
        ? await fetchTxNextVoucherNo('contra') 
        : getTxNextVoucherNo('contra', contras);
    }
    if (typeof applyVoucherNoMode === 'function') applyVoucherNoMode('frm-vno', 'Contra');
    document.getElementById('frm-vdate').value = todayISO();

    gridRows = [];
    renderGridTable();

    document.getElementById('frm-transtype').value = 'Cheque';
    document.getElementById('frm-chqno').value = '';
    document.getElementById('frm-chqdate').value = '';
    document.getElementById('frm-refno').value = '';
    document.getElementById('frm-drawnon').value = '';
    document.getElementById('frm-particular1').value = '';
    document.getElementById('frm-particular2').value = '';

    document.getElementById('ce-section-list').style.display = 'none';
    document.getElementById('ce-section-form').style.display = 'flex';
  };

  window.editSelectedContra = async function (id) {
    if (id) selectedContraId = id;
    if (!selectedContraId) { toast('Please select a contra row to edit.', false); return; }
    var b = contras.find(function (x) {
      return String(x.contraId) === String(selectedContraId) ||
             String(x.voucherId) === String(selectedContraId) ||
             String(x.voucherNo) === String(selectedContraId);
    });
    if (!b) { toast('Contra record not found.', false); return; }

    selectedContraId = b.voucherId || b.contraId;

    var vNoEl = document.getElementById('frm-vno');
    if (vNoEl) {
      vNoEl.value = b.voucherNo || '';
      vNoEl.readOnly = true; // STRICT IMMUTABILITY ON ALTER
      vNoEl.disabled = true;
    }
    document.getElementById('frm-vdate').value = b.voucherDate || todayISO();

    // Fetch full lines from DB if needed
    var loadedItems = null;
    var vId = parseInt(b.voucherId || b.contraId, 10);
    if (vId && vId > 0 && vId < 1000000000000) {
      try {
        var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
        var resp = await fetch(baseHost + '/api/vouchers/' + vId, { headers: getAuthHeaders() });
        if (resp.ok) {
          var fullData = await resp.json();
          if (fullData && fullData.items && Array.isArray(fullData.items) && fullData.items.length > 0) {
            loadedItems = fullData.items;
          }
        }
      } catch (e) {
        console.warn('Could not fetch detail lines from DB:', e);
      }
    }

    if (loadedItems && loadedItems.length > 0) {
      gridRows = loadedItems.map(function (r, i) {
        return {
          sr: i + 1,
          code: r.accountCode || '',
          name: r.accountName || '',
          dr: parseFloat(r.debit || r.dr) || 0,
          cr: parseFloat(r.credit || r.cr) || 0,
          particulars: r.narration || ''
        };
      });
    } else if (b.gridRows && Array.isArray(b.gridRows) && b.gridRows.length > 0) {
      gridRows = b.gridRows.map(function (r, i) {
        return {
          sr: i + 1,
          code: r.code || '',
          name: r.name || '',
          dr: parseFloat(r.dr) || 0,
          cr: parseFloat(r.cr) || 0,
          particulars: r.particulars || ''
        };
      });
    } else if (b.items && Array.isArray(b.items) && b.items.length > 0) {
      gridRows = b.items.map(function (r, i) {
        return {
          sr: i + 1,
          code: r.accountCode || r.code || '',
          name: r.accountName || r.name || '',
          dr: parseFloat(r.debit || r.dr) || 0,
          cr: parseFloat(r.credit || r.cr) || 0,
          particulars: r.narration || r.particulars || ''
        };
      });
    } else {
      gridRows = [
        { sr: 1, code: 'ASS-1002', name: 'The M.D C.C. Bank A/C', dr: b.amount || 25000, cr: 0 },
        { sr: 2, code: 'ASS-1001', name: 'Cash in Hand', dr: 0, cr: b.amount || 25000 }
      ];
    }
    renderGridTable();

    document.getElementById('frm-particular1').value = b.particular1 || b.narration || '';
    document.getElementById('frm-particular2').value = b.particular2 || '';

    document.getElementById('ce-section-list').style.display = 'none';
    document.getElementById('ce-section-form').style.display = 'flex';
  };

  window.showContraValidationError = function (title, msgHtml) {
    var modal = document.getElementById('modal-contra-validation');
    var tEl = document.getElementById('contra-val-title');
    var mEl = document.getElementById('contra-val-msg');
    if (tEl) tEl.textContent = title;
    if (mEl) mEl.innerHTML = msgHtml;
    if (modal) {
      modal.style.display = 'flex';
      var btn = document.getElementById('btn-contra-val-ok');
      if (btn) btn.focus();
    } else {
      alert(title + '\n\n' + msgHtml.replace(/<[^>]*>/g, ' '));
    }
  };

  window.saveContra = async function () {
    try {
      var validRows = gridRows.filter(function (r) { return r.code || r.name || (parseFloat(r.dr) || 0) > 0 || (parseFloat(r.cr) || 0) > 0; });
      var totDr = validRows.reduce(function (sum, r) { return sum + (parseFloat(r.dr) || 0); }, 0);
      var totCr = validRows.reduce(function (sum, r) { return sum + (parseFloat(r.cr) || 0); }, 0);

      if (validRows.length === 0) {
        showContraValidationError('No Line Items Entered', 'Please enter at least one Debit and Credit line item before saving.');
        return;
      }
      if (Math.abs(totDr - totCr) > 0.01 || totDr <= 0 || totCr <= 0) {
        var diff = Math.abs(totDr - totCr);
        showContraValidationError('Debit & Credit Totals Do Not Match',
          '<strong>Cannot save Contra Voucher:</strong> The Total Debit amount must equal the Total Credit amount.<br><br>' +
          '<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:4px; padding:10px; font-size:12px;">' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Total Debit (Dr):</span><strong style="color:#2E7D32;">₹' + totDr.toFixed(2) + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Total Credit (Cr):</span><strong style="color:#dc2626;">₹' + totCr.toFixed(2) + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; border-top:1px dashed #f87171; padding-top:4px; margin-top:4px;"><span>Difference:</span><strong style="color:#b91c1c;">₹' + diff.toFixed(2) + '</strong></div>' +
          '</div><br>' +
          '<span style="color:#64748b; font-size:11.5px;">Please balance the Debit and Credit line items before clicking Save.</span>'
        );
        return;
      }

      var sid = getActiveSocietyId();
      var fyid = getFyId();
      var cId = selectedContraId || Date.now();
      var vNo = document.getElementById('frm-vno').value || ('CV/25-26/' + (contras.length + 1));

      if (!selectedContraId && typeof validateTxVoucherNo === 'function') {
        var vCheck = validateTxVoucherNo('contra', vNo);
        if (!vCheck.valid) {
          toast(vCheck.error, false);
          return;
        }
      }

      var primeDrAcc = validRows.find(function(r) { return (parseFloat(r.dr) || 0) > 0; }) || {};
      var primeCrAcc = validRows.find(function(r) { return (parseFloat(r.cr) || 0) > 0; }) || {};

      var payload = {
        contraId: cId,
        voucherId: (typeof cId === 'number' && cId < 1000000000000) ? cId : 0,
        societyId: parseInt(sid, 10),
        fyId: parseInt(fyid, 10),
        voucherNo: vNo,
        voucherType: 'Contra',
        voucherDate: document.getElementById('frm-vdate').value || todayISO(),
        personType: 'Other',
        paidTo: primeDrAcc.name || 'Internal Transfer',
        personName: primeDrAcc.name || 'Internal Transfer',
        cashBankCode: primeCrAcc.code || '',
        cashBankName: primeCrAcc.name || 'Cash/Bank',
        amount: totDr,
        chqNo: document.getElementById('frm-chqno').value || '-',
        chqDate: (document.getElementById('frm-chqdate').value && document.getElementById('frm-chqdate').value.trim() !== '' && document.getElementById('frm-chqdate').value !== '-') ? document.getElementById('frm-chqdate').value : null,
        refNo: document.getElementById('frm-refno').value || '',
        narration: document.getElementById('frm-particular1').value || 'Contra Voucher',
        particular1: document.getElementById('frm-particular1').value || 'Contra Voucher',
        particular2: document.getElementById('frm-particular2').value || '',
        gridRows: gridRows,
        items: validRows.map(function(r) {
          var accId = null;
          var found = accounts.find(function(a) { return a.accCode === r.code; });
          if (found) accId = found.accountId;
          return {
            accountId: accId,
            accountCode: r.code || '',
            accountName: r.name || '',
            debit: parseFloat(r.dr) || 0,
            credit: parseFloat(r.cr) || 0,
            narration: r.particulars || r.narration || ''
          };
        })
      };

      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/vouchers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        var json = await resp.json();
        if (json && json.success) {
          toast(selectedContraId ? 'Contra Voucher updated successfully in database!' : 'Contra Voucher saved successfully in database!', true);
          selectedContraId = null;
          showList();
          await loadContras();
          return;
        }
      }
      var errText = await resp.text();
      toast('Failed to save Contra Voucher: ' + errText, false);
    } catch (e) {
      console.error('saveContra error:', e);
      toast('Error saving contra: ' + (e.message || e), false);
    }
  };

  window.deleteSelectedContra = async function () {
    if (!selectedContraId) {
      var checkedBox = document.querySelector('#contra-list-tbody input.row-chk:checked, #contra-list-tbody input[type="checkbox"]:checked');
      if (checkedBox && checkedBox.value) selectedContraId = checkedBox.value;
    }

    if (!selectedContraId) { toast('Please select a contra record to delete.', false); return; }
    var tr = contras.find(function (b) {
      return String(b.contraId) === String(selectedContraId) ||
             String(b.voucherId) === String(selectedContraId) ||
             String(b.voucherNo) === String(selectedContraId);
    });
    var trNoStr = tr ? tr.voucherNo : '#' + selectedContraId;
    var delId = (tr && (tr.voucherId || tr.contraId)) ? (tr.voucherId || tr.contraId) : selectedContraId;

    var ok = typeof showConfirm === 'function'
      ? await showConfirm('Are you sure you want to delete contra ' + trNoStr + '?', 'Confirm Delete Contra Entry')
      : confirm('Are you sure you want to delete contra ' + trNoStr + '?');

    if (!ok) return;

    try {
      var baseHost = (typeof window.getApiBaseUrl === 'function') ? window.getApiBaseUrl() : 'http://localhost:5002';
      var resp = await fetch(baseHost + '/api/vouchers/' + encodeURIComponent(delId), {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (resp.ok) {
        toast('Contra entry deleted successfully from database.', true);
        selectedContraId = null;
        await loadContras();
      } else {
        var errText = await resp.text();
        toast('Failed to delete Contra entry: ' + errText, false);
      }
    } catch (e) {
      toast('Error deleting Contra entry: ' + e.message, false);
    }
  };

  window.previewSelectedContra = function () {
    if (!selectedContraId) { toast('Please select a contra record to preview.', false); return; }
    var b = contras.find(function (x) { return x.contraId === selectedContraId; });
    if (!b) return;

    var container = document.getElementById('preview-contra-card');
    var socName = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : 'Shree Sai Co-op Housing Society Ltd';

    container.innerHTML = '<div style="border-bottom:2px solid #0D47A1; padding-bottom:12px; margin-bottom:16px; text-align:center;">' +
      '<h2 style="color:#0D47A1; font-size:18px; margin:0; text-transform:uppercase;">' + escHtml(socName) + '</h2>' +
      '<div style="font-size:11px; color:#555; margin-top:4px;">Reg. No: MUM/MH/102948/2012 &nbsp;|&nbsp; Financial Year: ' + getFyLabel() + '</div>' +
      '<h3 style="font-size:13px; margin-top:10px; color:#0D47A1; text-decoration:underline;">CONTRA VOUCHER ENTRY</h3>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px;">' +
        '<div>' +
          '<div><strong>Person / Detail:</strong> ' + escHtml(b.personName) + '</div>' +
          '<div><strong>Transfer Type:</strong> Cash / Bank Internal Transfer</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div><strong>Voucher No:</strong> <span style="font-family:monospace; color:#0D47A1; font-weight:bold;">' + escHtml(b.voucherNo) + '</span></div>' +
          '<div><strong>Date:</strong> ' + escHtml(b.voucherDate) + '</div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12px;">' +
        '<thead><tr style="background:#0D47A1; color:#fff;">' +
          '<th style="padding:6px; text-align:left;">Particulars</th>' +
          '<th style="padding:6px; text-align:right;">Amount (₹)</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr><td style="border:1px solid #ddd; padding:8px;">' + escHtml(b.particular1 || 'Contra Voucher') + '</td><td style="border:1px solid #ddd; padding:8px; text-align:right; font-family:monospace; font-weight:bold; color:#0D47A1;">' + (b.amount || 0).toFixed(2) + '</td></tr>' +
        '</tbody>' +
        '<tfoot><tr style="background:#f5f5f5; font-weight:bold;">' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right;">TOTAL CONTRA AMOUNT:</td>' +
          '<td style="border:1px solid #ddd; padding:6px; text-align:right; font-family:monospace; color:#0D47A1; font-size:14px;">₹' + (b.amount || 0).toFixed(2) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
      '<div style="font-size:11px; color:#555; margin-top:30px; display:flex; justify-content:space-between;">' +
        '<div><strong>Prepared By</strong><br><br>_____________</div>' +
        '<div><strong>Authorized Signatory</strong><br><br>_____________</div>' +
      '</div>';

    document.getElementById('ce-section-list').style.display = 'none';
    document.getElementById('ce-section-form').style.display = 'none';
    document.getElementById('ce-section-preview').style.display = 'flex';
  };

  window.openMultiDeleteModal = function () {
    document.getElementById('md-from').value = '';
    document.getElementById('md-to').value = '';
    document.getElementById('modal-multi-delete').style.display = 'flex';
  };

  window.runMultiDelete = function () {
    var fromNo = (document.getElementById('md-from').value || '').trim().toLowerCase();
    var toNo = (document.getElementById('md-to').value || '').trim().toLowerCase();

    if (!fromNo || !toNo) { toast('Please enter both From and To voucher numbers.', false); return; }

    var initialCount = contras.length;
    contras = contras.filter(function (b) {
      var no = (b.voucherNo || '').toLowerCase();
      return !(no >= fromNo && no <= toNo);
    });

    var deletedCount = initialCount - contras.length;
    localStorage.setItem('jeevika_contras_' + getActiveSocietyId(), JSON.stringify(contras));
    closeModal('modal-multi-delete');
    toast('Multi-deleted ' + deletedCount + ' voucher(s).', true);
    renderContrasTable();
  };

  window.openMultiChangeModal = function () {
    var selCount = (window.ERP_MultiChange && typeof ERP_MultiChange.getSelectedIds === 'function')
      ? ERP_MultiChange.getSelectedIds().length
      : 0;

    var infoBox = document.getElementById('mc-target-info');
    var targetText = document.getElementById('mc-target-text');
    var rangeBox = document.getElementById('mc-range-box');

    if (selCount > 0) {
      if (infoBox) infoBox.style.display = 'block';
      if (targetText) targetText.textContent = selCount + ' selected voucher(s)';
      if (rangeBox) rangeBox.style.display = 'none';
    } else {
      if (infoBox) infoBox.style.display = 'none';
      if (rangeBox) rangeBox.style.display = 'grid';
      document.getElementById('mc-from').value = '';
      document.getElementById('mc-to').value = '';
    }

    document.getElementById('mc-value').value = '';
    document.getElementById('modal-multi-change').style.display = 'flex';
  };

  window.runMultiChange = async function () {
    var fromNo = (document.getElementById('mc-from') ? document.getElementById('mc-from').value : '').trim();
    var toNo = (document.getElementById('mc-to') ? document.getElementById('mc-to').value : '').trim();
    var field = document.getElementById('mc-field').value;
    var newVal = document.getElementById('mc-value').value.trim();

    if (!newVal) { toast('Please enter the New Value.', false); return; }

    var updatedCount = await ERP_MultiChange.executeMultiChange({
      field: field,
      newVal: newVal,
      fromNo: fromNo,
      toNo: toNo,
      list: contras,
      idKey: 'contraId',
      noKey: 'voucherNo'
    });

    if (updatedCount > 0) {
      persistContrasLocally(getActiveSocietyId(), contras);
      closeModal('modal-multi-change');
      toast('Successfully updated ' + updatedCount + ' contra voucher(s).', true);
      renderContrasTable();
    }
  };

  window.showList = function () {
    document.getElementById('ce-section-form').style.display = 'none';
    document.getElementById('ce-section-preview').style.display = 'none';
    document.getElementById('ce-section-list').style.display = 'flex';
  };

  window.toggleFilterBar = function () {
    var bar = document.getElementById('ce-filter-bar');
    if (bar) bar.style.display = (bar.style.display === 'none' ? 'flex' : 'none');
  };

  window.toggleOtherDropdown = function () {
    var menu = document.getElementById('ce-other-menu');
    if (menu) menu.style.display = (menu.style.display === 'block' ? 'none' : 'block');
  };

  window.applyFilters = function () { renderContrasTable(); };

  window.clearFilters = function () {
    ['flt-vno', 'flt-person'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    renderContrasTable();
  };

  window.appendParticularTag = function (num) {
    var el = document.getElementById('frm-particular' + num);
    if (el) el.value += (el.value ? ' ' : '') + 'Contra Voucher for ' + getFyLabel();
  };

  window.closeModal = function (id) {
    var modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  };

  function todayISO() {
    var d = new Date();
    return d.toISOString().split('T')[0];
  }

  // Close dropdown on outside click
  document.addEventListener('click', function (e) {
    var drop = document.querySelector('.ce-dropdown');
    var menu = document.getElementById('ce-other-menu');
    if (drop && menu && !drop.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // Short-cuts (Alt+A, F2, Esc, Ctrl+P)
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      openAddContraForm();
    } else if (e.key === 'F2') {
      e.preventDefault();
      editSelectedContra();
    } else if (e.key === 'Escape') {
      showList();
    }
  });

  // INIT
  (async function init() {
    var _sn = (window.Auth && Auth.getSocietyName) ? Auth.getSocietyName() : (sessionStorage.getItem('activeSocietyName') || 'Society Name');
    var _fy = (window.Auth && Auth.getFYLabel) ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || '2025-26');
    var _elSoc = document.getElementById('ceSocName'); if (_elSoc) _elSoc.textContent = _sn;
    var _elFy  = document.getElementById('ceFyLabel');  if (_elFy)  _elFy.textContent  = _fy;
    await loadMasterData();
    await loadContras();
    showList();
  })();

})();
