// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Billing Master Matrix JS
// Excel-Style DataGrid, Resizable & Frozen Columns, REST API Integration
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  function bmApiBase() {
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

  let billTypes = {};
  let currentBillType = 'Maintenance';
  let cols = [];
  let shortNames = [];
  let members = [];
  let originalMembers = [];
  let defaultHeads = [];
  let multiMode = false;
  let selectedRow = 0;
  let hasChanges = false;
  let activeAreaType = '';
  let activeAreaCategory = '';
  let activeAreaValue = 0;
  let activeAreaUnit = 'Sq.Ft';
  let isPanelActive = true;
  let currentDetailMemberIdx = -1;

  let currentGstSettings = {
    societyId: 1,
    gstApplicable: false,
    cgstPct: 9,
    sgstPct: 9,
    exemptLimit: 7500,
    intDuesGST: 'No'
  };

  async function loadGstMasterSettings(socId) {
    try {
      const res = await fetch(`${bmApiBase()}/api/gst-master/settings?societyId=${socId}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && json.data) {
          currentGstSettings = Object.assign(currentGstSettings, json.data);
          if (currentGstSettings.gstApplicable !== undefined) {
            window._billingMasterGstOn = !!currentGstSettings.gstApplicable;
            sessionStorage.setItem('activeSocietyGSTApplicable', currentGstSettings.gstApplicable ? 'Y' : 'N');
          }
        }
      }
    } catch (e) {
      console.warn('Could not load GST master settings:', e);
    }
  }

  let colWidths = {};
  try {
    const savedWidths = localStorage.getItem('jeevika_bm_col_widths');
    if (savedWidths) colWidths = JSON.parse(savedWidths);
  } catch (e) { }

  function getColWidth(key, defaultVal) {
    return (colWidths[key] || defaultVal) + 'px';
  }

  function toast(m, ok) {
    if (typeof window.toast === 'function') {
      window.toast(m, ok ? 'success' : 'error');
    } else {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:12px;right:12px;z-index:100000;padding:10px 18px;font-size:12px;font-weight:700;color:#FFF;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.2);background:' + (ok ? '#2E7D32' : '#C62828') + ';';
      d.textContent = m;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 2500);
    }
  }

  function getIsGstEnabled() {
    if (currentGstSettings && currentGstSettings.gstApplicable) return true;
    const directGst = sessionStorage.getItem('activeSocietyGSTApplicable') || localStorage.getItem('activeSocietyGSTApplicable');
    if (directGst === 'N' || directGst === 'No' || directGst === 'false' || directGst === '0') return false;
    if (directGst === 'Y' || directGst === 'Yes' || directGst === 'true' || directGst === '1') return true;
    if (window._billingMasterGstOn !== undefined) {
      return !!window._billingMasterGstOn;
    }
    return false;
  }

  function recalcRowGSTAndPrincipal(m) {
    const isGstEnabled = getIsGstEnabled();
    const userHeads = cols.filter(c => c !== 'Principal' && c !== 'Interest' && c !== 'CGST' && c !== 'SGST');

    let principalVal = 0;
    userHeads.forEach(bh => {
      principalVal += Math.round(parseFloat(m.amounts[bh]) || 0);
    });

    m.amounts['Principal'] = principalVal;

    const interestVal = Math.round(parseFloat(m.amounts['Interest']) || 0);
    const cgstVal = isGstEnabled ? Math.round(parseFloat(m.amounts['CGST']) || 0) : 0;
    const sgstVal = isGstEnabled ? Math.round(parseFloat(m.amounts['SGST']) || 0) : 0;

    return {
      principalVal,
      interestVal,
      cgstVal,
      sgstVal,
      rowTotal: principalVal + interestVal + cgstVal + sgstVal
    };
  }

  function updateColsForCurrentType() {
    const typeData = billTypes[currentBillType];
    const isGstEnabled = getIsGstEnabled();

    // Toggle GST controls in toolbar based on GST status
    const gstControls = document.getElementById('bm-gst-controls');
    if (gstControls) {
      gstControls.style.display = isGstEnabled ? 'flex' : 'none';
    }
    const gstSep = document.getElementById('bm-gst-sep');
    if (gstSep) {
      gstSep.style.display = isGstEnabled ? 'block' : 'none';
    }

    let baseHeads = [];
    if (typeData && Array.isArray(typeData.heads)) {
      const activeHeads = typeData.heads.filter(h => h && h.accName && h.accName.trim() !== '');
      baseHeads = activeHeads
        .filter(h => {
          const name = (h.accName || '').toLowerCase().trim();
          return name !== '' && name !== 'interest' && name !== 'cgst' && name !== 'sgst' && name !== 'principal' && name !== 'total heads';
        })
        .map(h => h.accName.trim());
    }

    cols = [];
    cols = cols.concat(baseHeads);
    cols.push('Principal');
    cols.push('Interest');
    if (isGstEnabled) {
      cols.push('CGST');
      cols.push('SGST');
    }

    shortNames = cols.map(c => c.substring(0, 14).toUpperCase());
  }

  function getActiveSocietyId() {
    if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
      const s = window.Auth.getSocietyId();
      if (s && parseInt(s, 10) > 0) return parseInt(s, 10);
    }
    const s1 = sessionStorage.getItem('activeSocietyId');
    if (s1 && parseInt(s1, 10) > 0) return parseInt(s1, 10);
    const s2 = localStorage.getItem('activeSocietyId');
    if (s2 && parseInt(s2, 10) > 0) return parseInt(s2, 10);
    return 1;
  }

  async function loadMatrixData(forceReload) {
    try {
      if (forceReload) {
        hasChanges = false;
      }

      const socId = getActiveSocietyId();
      await loadGstMasterSettings(socId);
      await BM.loadToggles();
      billTypes = {};

      // 1. Load active Bill Types & configured heads from LocalStorage first
      try {
        const localRaw = localStorage.getItem('jeevika_bill_types_' + socId) || localStorage.getItem('jeevika_bill_types_global');
        if (localRaw) {
          const parsed = JSON.parse(localRaw);
          if (parsed && typeof parsed === 'object') {
            Object.keys(parsed).forEach(k => {
              const item = parsed[k];
              const rawHeads = Array.isArray(item.heads) ? item.heads : [];
              const cleanHeads = rawHeads.filter(h => {
                if (!h || !h.accName || !h.accName.trim()) return false;
                const n = h.accName.trim().toLowerCase();
                return n !== 'interest' && n !== 'cgst' && n !== 'sgst' && n !== 'principal';
              });
              billTypes[k] = {
                id: item.id || 1,
                heads: cleanHeads
              };
            });
          }
        }
      } catch (e) { }

      // Fetch default society heads for fallback
      defaultHeads = [];
      try {
        const accRes = await fetch(`${bmApiBase()}/api/accounts?societyId=${socId}`, { headers: getAuthHeaders() });
        if (accRes.ok) {
          const accJson = await accRes.json();
          const accList = Array.isArray(accJson) ? accJson : (accJson.data || []);
          defaultHeads = accList
            .filter(a => ((a.grpMainId === 3 || a.grpmainid === 3 || (a.grpName && a.grpName.toLowerCase().includes('income')) || (a.groupName && a.groupName.toLowerCase().includes('income'))) && a.accName))
            .map(a => ({ accName: a.accName.trim(), accCode: a.accCode || '' }))
            .filter(h => {
              const n = h.accName.toLowerCase();
              return n !== 'interest' && n !== 'cgst' && n !== 'sgst' && n !== 'principal';
            });
        }
      } catch (e) { }

      // 2. Fetch Bill Types from API (overrides with database state)
      try {
        const btUrl = `${bmApiBase()}/api/bill-types?societyId=${socId}`;
        const btRes = await fetch(btUrl, { headers: getAuthHeaders() });
        if (btRes.ok) {
          const btData = await btRes.json();
          if (btData && btData.success) {
            if (btData.isGstEnabled !== undefined) {
              window._billingMasterGstOn = !!btData.isGstEnabled;
            }
            if (Array.isArray(btData.data) && btData.data.length > 0) {
              for (const t of btData.data) {
                try {
                  const detailRes = await fetch(`${bmApiBase()}/api/bill-types/${t.billTypeId}`, { headers: getAuthHeaders() });
                  if (detailRes.ok) {
                    const detailJson = await detailRes.json();
                    if (detailJson.success) {
                      const rawHeads = Array.isArray(detailJson.heads) ? detailJson.heads : [];
                      let cleanHeads = rawHeads.filter(h => {
                        if (!h || !h.accName || !h.accName.trim()) return false;
                        const n = h.accName.trim().toLowerCase();
                        return n !== 'interest' && n !== 'cgst' && n !== 'sgst' && n !== 'principal';
                      });
                      if (cleanHeads.length === 0 && defaultHeads.length > 0) {
                        cleanHeads = defaultHeads;
                      }
                      billTypes[t.billTypeName] = {
                        id: t.billTypeId,
                        heads: cleanHeads
                      };
                    }
                  }
                } catch (err) { }
              }
            }
          }
        }
      } catch (e) {
        console.warn("Bill Type API offline, using fallback", e);
      }

      if (!billTypes[currentBillType] && Object.keys(billTypes).length > 0) {
        currentBillType = Object.keys(billTypes)[0];
      }

      updateColsForCurrentType();
      renderBillTypeDropdown();

      // Fetch Members from API
      let apiMembers = [];
      try {
        const memUrl = parseInt(socId, 10) > 0 ? `${bmApiBase()}/api/members?societyId=${socId}` : `${bmApiBase()}/api/members`;
        const memRes = await fetch(memUrl, { headers: getAuthHeaders() });
        if (memRes.ok) {
          const memResult = await memRes.json();
          if (memResult.success && Array.isArray(memResult.data)) {
            apiMembers = memResult.data;
          }
        }
      } catch (e) { }

      // Fetch saved Matrix from API
      let savedMatrix = [];
      const currentTypeId = billTypes[currentBillType] ? (billTypes[currentBillType].id || 0) : 0;
      try {
        const matrixRes = await fetch(`${bmApiBase()}/api/billing-master?billTypeId=${currentTypeId}&billType=${encodeURIComponent(currentBillType)}&societyId=${socId}`, { headers: getAuthHeaders() });
        if (matrixRes.ok) {
          const matrixResult = await matrixRes.json();
          if (matrixResult.success && Array.isArray(matrixResult.data)) {
            savedMatrix = matrixResult.data;
          }
        }
      } catch (e) { }

      // Also check LocalStorage backup if empty
      if (savedMatrix.length === 0) {
        try {
          const localSaved = localStorage.getItem(`jeevika_bm_matrix_${socId}_${currentBillType}`);
          if (localSaved) savedMatrix = JSON.parse(localSaved);
        } catch (e) { }
      }

      members = apiMembers.map(m => {
        const memId = m.SocMemId || m.MemberId || m.socMemId || m.memberId || 0;
        const flatNo = m.flatNo || m.FlatNo || '';
        const memCode = m.memCode || m.MemCode || m.MemberCode || '';
        const code = flatNo || memCode || ('FL-' + memId);
        const name = m.memName || m.MemName || m.MemberName || '';

        const existing = savedMatrix.find(x => {
          const xId = x.memberId || x.MemberId || 0;
          const xNo = (x.memNo || x.MemNo || '').trim().toLowerCase();
          const xFlat = (x.flatNo || x.FlatNo || '').trim().toLowerCase();
          return (memId > 0 && xId === memId) ||
                 (code && xNo === String(code).trim().toLowerCase()) ||
                 (memCode && xNo === String(memCode).trim().toLowerCase()) ||
                 (flatNo && xFlat === String(flatNo).trim().toLowerCase()) ||
                 (flatNo && xNo === String(flatNo).trim().toLowerCase());
        });

        const amounts = {};
        const typeData = billTypes[currentBillType];

        cols.forEach(c => {
          if (c === 'Principal') {
            amounts[c] = 0;
            return;
          }
          const cLower = (c || '').toLowerCase().trim();
          let val = undefined;
          if (existing && existing.amounts) {
            // 1. Direct match with column name
            const foundKey = Object.keys(existing.amounts).find(k => k.toLowerCase().trim() === cLower);
            if (foundKey !== undefined) {
              val = Math.round(parseFloat(existing.amounts[foundKey]) || 0);
            } else if (cLower === 'cgst' && (existing.amounts['LIA-1032'] !== undefined || existing.amounts['lia-1032'] !== undefined)) {
              val = Math.round(parseFloat(existing.amounts['LIA-1032'] !== undefined ? existing.amounts['LIA-1032'] : existing.amounts['lia-1032']) || 0);
            } else if (cLower === 'sgst' && (existing.amounts['LIA-1033'] !== undefined || existing.amounts['lia-1033'] !== undefined)) {
              val = Math.round(parseFloat(existing.amounts['LIA-1033'] !== undefined ? existing.amounts['LIA-1033'] : existing.amounts['lia-1033']) || 0);
            } else if (cLower === 'interest' && (existing.amounts['INC-1008'] !== undefined || existing.amounts['inc-1008'] !== undefined)) {
              val = Math.round(parseFloat(existing.amounts['INC-1008'] !== undefined ? existing.amounts['INC-1008'] : existing.amounts['inc-1008']) || 0);
            } else {
              // 2. Head match by code or name
              const allHeads = (typeData && Array.isArray(typeData.heads)) ? typeData.heads : [];
              const matchingHead = allHeads.find(h =>
                (h.accName && h.accName.toLowerCase().trim() === cLower) ||
                (h.accCode && h.accCode.toLowerCase().trim() === cLower)
              ) || (defaultHeads || []).find(h =>
                (h.accName && h.accName.toLowerCase().trim() === cLower) ||
                (h.accCode && h.accCode.toLowerCase().trim() === cLower)
              );
              if (matchingHead) {
                const codeKey = Object.keys(existing.amounts).find(k =>
                  (matchingHead.accCode && k.toLowerCase().trim() === matchingHead.accCode.toLowerCase().trim()) ||
                  (matchingHead.accName && k.toLowerCase().trim() === matchingHead.accName.toLowerCase().trim())
                );
                if (codeKey !== undefined) {
                  val = Math.round(parseFloat(existing.amounts[codeKey]) || 0);
                }
              }
            }
          }
          if (val === undefined) {
            const isNocCol = cLower.includes('non occupancy') || cLower.includes('non-occupancy') || cLower === 'noc';
            const isTenantApp = (m.nonOccApplicable || m.NonOccApplicable) === 'Yes';
            if (isNocCol && isTenantApp) {
              val = Math.round(parseFloat(m.nonOccCharges || m.NonOccCharges) || 0);
            }
            const isPark4Col = cLower.includes('4-wheeler') || cLower.includes('4 wheeler') || cLower.includes('4w parking') || (cLower.includes('parking') && !cLower.includes('2-wheeler') && !cLower.includes('2 wheeler') && !cLower.includes('2w'));
            if (isPark4Col) {
              val = Math.round(parseFloat(m.parkingCharge4W || m.ParkingCharge4W) || 0);
            }
            const isPark2Col = cLower.includes('2-wheeler') || cLower.includes('2 wheeler') || cLower.includes('two wheeler') || cLower.includes('2w parking');
            if (isPark2Col) {
              val = Math.round(parseFloat(m.parkingCharge2W || m.ParkingCharge2W) || 0);
            }
          }
          amounts[c] = (val !== undefined) ? val : 0;
        });

        // Op_Prin comes from members API (opPrincipal) or from billing matrix API (op_Prin / Op_Prin)
        const rawOpPrin = parseFloat(
          m.opPrincipal !== undefined ? m.opPrincipal :
          (m.OpPrincipal !== undefined ? m.OpPrincipal :
          (m.op_Prin !== undefined ? m.op_Prin :
          (existing && existing.op_Prin !== undefined ? existing.op_Prin : 0)))
        ) || 0;
        // Negative Op_Prin means member has Credit (advance) balance
        const opDrCr = rawOpPrin < 0 ? 'Cr' : 'Dr';

        return {
          id: memId,
          memNo: code,
          flatNo: flatNo,
          wing: m.wing || m.Wing || '',
          name: name,
          checked: false,
          amounts: amounts,
          sqft: parseFloat(m.carpetArea !== undefined && m.carpetArea !== null && m.carpetArea !== '' ? m.carpetArea : (m.Sqft !== undefined && m.Sqft !== null && m.Sqft !== '' ? m.Sqft : (m.sqft !== undefined && m.sqft !== null && m.sqft !== '' ? m.sqft : (m.areaSqft !== undefined && m.areaSqft !== null && m.areaSqft !== '' ? m.areaSqft : 0)))) || 0,
          Op_Prin: rawOpPrin,
          OpDrCr: opDrCr,
          Op_Int: parseFloat(m.opInterest !== undefined ? m.opInterest : (m.OpInterest !== undefined ? m.OpInterest : (m.op_Int !== undefined ? m.op_Int : 0))) || 0
        };
      });

      originalMembers = JSON.parse(JSON.stringify(members));
      renderMatrix();
    } catch (e) {
      console.error("Error loading matrix:", e);
    }
  }

  function renderMatrix() {
    const tableEl = document.getElementById('bm-table');
    if (!tableEl) return;

    const isGstEnabled = getIsGstEnabled();

    // 1. Render Table Header
    const thead = tableEl.querySelector('thead');
    if (thead) {
      let headHtml = '<tr>';
      headHtml += `<th data-col-key="_chk" style="width:${getColWidth('_chk', 30)}; text-align:center;"><input type="checkbox" id="bm-chk-all" onclick="BM.toggleAll(this.checked)" style="accent-color:#1565C0;"><div class="bm-resizer"></div></th>`;
      headHtml += `<th data-col-key="_membno" style="width:${getColWidth('_membno', 60)}; text-align:center;">MEMB NO<div class="bm-resizer"></div></th>`;
      headHtml += `<th data-col-key="_wing" style="width:${getColWidth('_wing', 50)}; text-align:center;">WING<div class="bm-resizer"></div></th>`;
      headHtml += `<th data-col-key="_name" style="width:${getColWidth('_name', 150)}; text-align:left; padding-left:10px;">MEMBER NAME<div class="bm-resizer"></div></th>`;
      headHtml += `<th data-col-key="_area" style="width:${getColWidth('_area', 120)}; text-align:left;">CARPET SQ FT<div class="bm-resizer"></div></th>`;

      cols.forEach(c => {
        headHtml += `<th data-col-key="${c}" style="width:${getColWidth(c, 115)}; text-align:right;">${c.toUpperCase()}<div class="bm-resizer"></div></th>`;
      });

      headHtml += `<th data-col-key="_total" style="width:${getColWidth('_total', 120)}; text-align:center; border-left:2px solid #E0E0E0;">TOTAL HEADS<div class="bm-resizer"></div></th>`;
      headHtml += '</tr>';
      thead.innerHTML = headHtml;
    }

    // 2. Render Table Footer
    let tfoot = tableEl.querySelector('tfoot');
    if (!tfoot) {
      tfoot = document.createElement('tfoot');
      tableEl.appendChild(tfoot);
    }

    const colTotals = {};
    cols.forEach(c => colTotals[c] = 0);
    let grandTotal = 0;

    const userHeads = cols.filter(c => c !== 'Principal' && c !== 'CGST' && c !== 'SGST' && c !== 'Interest');

    members.forEach(m => {
      const calc = recalcRowGSTAndPrincipal(m);

      cols.forEach(c => {
        const val = Math.round(parseFloat(m.amounts[c]) || 0);
        colTotals[c] += val;
      });

      grandTotal += calc.rowTotal;
    });

    let footHtml = '<tr style="background-color:#F5F5F5; font-weight:bold;">';
    footHtml += '<td></td>';
    footHtml += '<td style="text-align:center;">TOTAL</td>';
    footHtml += '<td></td><td></td><td></td>';

    cols.forEach((c, colIdx) => {
      footHtml += `<td style="text-align:right; font-weight:bold; padding-right:8px !important;" id="bm-foot-col-${colIdx}">${Math.round(colTotals[c])}</td>`;
    });

    footHtml += `<td style="text-align:center; font-weight:900; color:#1565C0; border-left:2px solid #E0E0E0;" id="bm-foot-grand">${Math.round(grandTotal)}</td>`;
    footHtml += '</tr>';
    tfoot.innerHTML = footHtml;

    // 3. Render Table Body
    const tbody = document.getElementById('bm-tbody');
    let html = '';

    if (!members.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length + 6}" style="text-align:center; padding:40px; color:#9E9E9E;">No members found.</td></tr>`;
      return;
    }

    members.forEach((m, idx) => {
      const sel = (idx === selectedRow) ? 'style="background-color:#E3F2FD;"' : '';
      const calc = recalcRowGSTAndPrincipal(m);

      let rowHtml = `<tr ${sel} onclick="BM.selectRow(${idx})">`;
      rowHtml += `<td style="text-align:center;">${multiMode ? `<input type="checkbox" ${m.checked ? 'checked' : ''} onclick="BM.checkMember(${idx}, this.checked)" style="accent-color:#1565C0;">` : ''}</td>`;
      rowHtml += `<td style="text-align:center; font-weight:600; cursor:pointer;" ondblclick="BM.openMemberDetailModal(${idx})" title="Double click to open individual member bill">${m.memNo}</td>`;
      rowHtml += `<td style="text-align:center;">${m.wing || ''}</td>`;
      rowHtml += `<td class="bm-cell-name" style="text-align:left; font-weight:bold; cursor:pointer; padding:0 10px !important;" ondblclick="BM.openMemberDetailModal(${idx})" title="Double click to open individual member bill">${m.name}</td>`;
      rowHtml += `<td style="text-align:center; font-size:11px; font-weight:600;">${m.sqft || '—'}</td>`;

      cols.forEach((c, colIdx) => {
        const val = Math.round(parseFloat(m.amounts[c]) || 0);
        const isReadOnly = (c === 'Principal') ? 'readonly style="background-color: #FAFAFA !important; font-weight: bold; color: #424242;" tabindex="-1"' : '';
        rowHtml += `<td><input type="number" step="1" class="bm-grid-input" data-row="${idx}" data-col="${colIdx}" value="${val}" ${isReadOnly} onfocus="this.select()" onclick="event.stopPropagation()" onkeydown="BM.handleGridKeydown(event)" oninput="BM.onAmtInput(${idx}, '${c}', this.value)" onchange="BM.updateAmt(${idx}, '${c}', this.value)"></td>`;
      });

      rowHtml += `<td style="font-weight:900; color:#1565C0; border-left:2px solid #E0E0E0; text-align:center;" id="bm-tot-${idx}">${Math.round(calc.rowTotal)}</td>`;
      rowHtml += '</tr>';
      html += rowHtml;
    });

    tbody.innerHTML = html;

    // Populate auto-complete dropdown accounts
    const addAcc = document.getElementById('bm-add-acc');
    const mulAcc = document.getElementById('bm-mul-acc');
    const allowedAddCols = cols.filter(c => c.toLowerCase() !== 'principal' && c.toLowerCase() !== 'interest');
    const optHtmlAdd = allowedAddCols.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
    const optHtmlMul = cols.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
    if (addAcc) addAcc.innerHTML = optHtmlAdd;
    if (mulAcc) mulAcc.innerHTML = optHtmlMul;
  }

  function renderBillTypeDropdown() {
    const menu = document.getElementById('bm-type-content');
    if (!menu) return;
    let html = '';
    Object.keys(billTypes).forEach(type => {
      const isActive = (type === currentBillType);
      const activeStyle = isActive ? 'font-weight:bold; background:#E3F2FD; color:#1565C0;' : '';
      html += `<div class="bm-menu-item bm-type-item" data-type="${type}" style="${activeStyle}">${type}</div>`;
    });
    menu.innerHTML = html;
    menu.querySelectorAll('.bm-type-item').forEach(el => {
      el.addEventListener('click', function () {
        BM.switchBillType(this.getAttribute('data-type'));
      });
    });
  }

  window.BM = {
    _interestZeroed: false,
    _interestRecalculated: false,
    loadMatrixData,
    switchBillType: function (type) {
      currentBillType = type;
      BM._interestZeroed = false;
      BM._interestRecalculated = false;
      const btn = document.getElementById('bm-current-type');
      if (btn) btn.textContent = type + ' ▾';
      updateColsForCurrentType();
      renderBillTypeDropdown();
      loadMatrixData(true);
      toast('Switched bill type to ' + type, true);
    },

    selectRow: function (idx) {
      selectedRow = idx;
      renderMatrix();
    },

    checkMember: function (idx, val) {
      members[idx].checked = val;
    },

    toggleAll: function (val) {
      members.forEach(m => m.checked = val);
      renderMatrix();
    },

    recalcTotalsDom: function () {
      const isGstEnabled = getIsGstEnabled();
      const colTotals = {};
      cols.forEach(c => colTotals[c] = 0);
      let grandTotal = 0;

      members.forEach((m, idx) => {
        const calc = recalcRowGSTAndPrincipal(m);

        // Update principal cell in DOM if present
        const pColIdx = cols.indexOf('Principal');
        if (pColIdx !== -1) {
          const pInput = document.querySelector(`.bm-grid-input[data-row="${idx}"][data-col="${pColIdx}"]`);
          if (pInput && pInput.value !== String(calc.principalVal)) pInput.value = calc.principalVal;
        }

        cols.forEach(c => {
          const val = Math.round(parseFloat(m.amounts[c]) || 0);
          colTotals[c] += val;
        });

        grandTotal += calc.rowTotal;

        const totEl = document.getElementById(`bm-tot-${idx}`);
        if (totEl) totEl.textContent = Math.round(calc.rowTotal);
      });

      cols.forEach((c, colIdx) => {
        const fEl = document.getElementById(`bm-foot-col-${colIdx}`);
        if (fEl) fEl.textContent = Math.round(colTotals[c]);
      });

      const grandEl = document.getElementById('bm-foot-grand');
      if (grandEl) grandEl.textContent = Math.round(grandTotal);
    },

    handleGridKeydown: function (e) {
      const allowedKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab'];
      if (allowedKeys.indexOf(e.key) === -1) return;

      const row = parseInt(e.target.getAttribute('data-row'), 10);
      const col = parseInt(e.target.getAttribute('data-col'), 10);
      if (isNaN(row) || isNaN(col)) return;

      let targetRow = row;
      let targetCol = col;

      const totalRows = members.length;
      const totalCols = cols.length;

      const isColEditable = (cIdx) => {
        if (cIdx < 0 || cIdx >= totalCols) return false;
        const colName = cols[cIdx];
        return colName !== 'Principal';
      };

      if (e.key === 'Tab') {
        e.preventDefault();
        if (!e.shiftKey) {
          // Tab Forward -> next editable column (wraps to next row)
          let found = false;
          let nextR = row;
          let nextC = col + 1;
          while (nextR < totalRows) {
            while (nextC < totalCols) {
              if (isColEditable(nextC)) {
                targetRow = nextR;
                targetCol = nextC;
                found = true;
                break;
              }
              nextC++;
            }
            if (found) break;
            nextR++;
            nextC = 0;
          }
        } else {
          // Shift+Tab Backward -> prev editable column (wraps to prev row)
          let found = false;
          let prevR = row;
          let prevC = col - 1;
          while (prevR >= 0) {
            while (prevC >= 0) {
              if (isColEditable(prevC)) {
                targetRow = prevR;
                targetCol = prevC;
                found = true;
                break;
              }
              prevC--;
            }
            if (found) break;
            prevR--;
            prevC = totalCols - 1;
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.shiftKey) {
          // Enter -> down to next row in same column
          targetRow = Math.min(row + 1, totalRows - 1);
        } else {
          // Shift+Enter -> up to previous row in same column
          targetRow = Math.max(row - 1, 0);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        targetRow = Math.min(row + 1, totalRows - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        targetRow = Math.max(row - 1, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        let nextC = col + 1;
        while (nextC < totalCols && !isColEditable(nextC)) nextC++;
        if (nextC < totalCols) {
          targetCol = nextC;
        } else if (row + 1 < totalRows) {
          targetRow = row + 1;
          let wrapC = 0;
          while (wrapC < totalCols && !isColEditable(wrapC)) wrapC++;
          targetCol = wrapC;
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        let prevC = col - 1;
        while (prevC >= 0 && !isColEditable(prevC)) prevC--;
        if (prevC >= 0) {
          targetCol = prevC;
        } else if (row - 1 >= 0) {
          targetRow = row - 1;
          let wrapC = totalCols - 1;
          while (wrapC >= 0 && !isColEditable(wrapC)) wrapC--;
          targetCol = wrapC;
        }
      }

      if (targetRow !== row || targetCol !== col) {
        selectedRow = targetRow;
        // Fast row highlight in DOM without redrawing table
        const trs = document.querySelectorAll('#bm-tbody tr');
        trs.forEach((tr, rIdx) => {
          tr.style.backgroundColor = (rIdx === targetRow) ? '#E3F2FD' : '';
        });

        const targetInput = document.querySelector(`.bm-grid-input[data-row="${targetRow}"][data-col="${targetCol}"]`);
        if (targetInput) {
          targetInput.focus();
          targetInput.select();
          targetInput.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
    },

    onAmtInput: function (idx, col, val) {
      hasChanges = true;
      const numVal = Math.round(parseFloat(val) || 0);
      if (!members[idx].amounts) members[idx].amounts = {};
      members[idx].amounts[col] = numVal;
      if (col === 'Interest') {
        BM._interestRecalculated = false;
        if (numVal > 0) BM._interestZeroed = false;
      }
      BM.recalcTotalsDom();
    },

    updateAmt: function (idx, col, val) {
      hasChanges = true;
      const numVal = Math.round(parseFloat(val) || 0);
      if (!members[idx].amounts) members[idx].amounts = {};
      members[idx].amounts[col] = numVal;
      if (col === 'Interest') {
        BM._interestRecalculated = false;
        if (numVal > 0) BM._interestZeroed = false;
      }
      BM.recalcTotalsDom();
    },

    saveAll: function () {
      document.getElementById('bm-confirm-overlay').classList.add('active');
    },

    closeConfirm: async function (confirmed) {
      document.getElementById('bm-confirm-overlay').classList.remove('active');
      if (confirmed) {
        const socId = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1';
        const typeData = billTypes[currentBillType];

        const payload = members.map(m => {
          const mappedAmounts = {};
          Object.keys(m.amounts || {}).forEach(k => {
            const num = parseFloat(m.amounts[k]) || 0;
            mappedAmounts[k] = num;
            if (k.toUpperCase() === 'CGST') mappedAmounts['LIA-1032'] = num;
            if (k.toUpperCase() === 'SGST') mappedAmounts['LIA-1033'] = num;
            if (k.toUpperCase() === 'INTEREST') mappedAmounts['INC-1008'] = num;
            const allHeads = (typeData && Array.isArray(typeData.heads)) ? typeData.heads : [];
            const h = allHeads.find(x => (x.accName || '').toLowerCase().trim() === k.toLowerCase().trim())
                   || (defaultHeads || []).find(x => (x.accName || '').toLowerCase().trim() === k.toLowerCase().trim());
            if (h && h.accCode) {
              mappedAmounts[h.accCode] = num;
            }
          });

          return {
            memberId: m.id,
            memNo: m.memNo,
            flatNo: m.flatNo,
            wing: m.wing,
            name: m.name,
            sqft: m.sqft,
            amounts: mappedAmounts,
            checked: !!m.checked
          };
        });

        // Instant LocalStorage backup
        try {
          localStorage.setItem(`jeevika_bm_matrix_${socId}_${currentBillType}`, JSON.stringify(payload));
          localStorage.setItem(`jeevika_bm_matrix_1_${currentBillType}`, JSON.stringify(payload));
        } catch (e) { }

        try {
          const currentTypeId = typeData ? (typeData.id || 0) : 0;
          const res = await fetch(`${bmApiBase()}/api/billing-master?billTypeId=${currentTypeId}&billType=${encodeURIComponent(currentBillType)}&societyId=${socId}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (res.ok && json.success) {
            originalMembers = JSON.parse(JSON.stringify(members));
            hasChanges = false;
            toast('All billing matrix adjustments saved to database successfully.', true);
          } else {
            // Keep local changes active and stored
            originalMembers = JSON.parse(JSON.stringify(members));
            hasChanges = false;
            toast(json.message || 'Saved locally (server sync pending)', true);
          }
        } catch (e) {
          originalMembers = JSON.parse(JSON.stringify(members));
          hasChanges = false;
          toast('Saved locally (offline mode active)', true);
        }
      } else {
        members = JSON.parse(JSON.stringify(originalMembers));
        hasChanges = false;
        renderMatrix();
      }
    },

    openAutoMasterAdd: function () {
      document.getElementById('bm-autoadd-overlay').classList.add('active');
    },

    onFormulaChange: function () {
      const formula = document.getElementById('bm-add-formula').value;
      const label = document.getElementById('bm-add-val-label');
      if (formula === 'By Percentage') label.textContent = 'Percentage (%)';
      else if (formula === 'By Sq.ft') label.textContent = 'Rate per Sq.ft (₹)';
      else label.textContent = 'Amount (₹)';
    },

    onTargetChange: function () {
      const target = document.getElementById('bm-add-target').value;
      const rangeWrap = document.getElementById('bm-add-range-wrap');
      if (target === 'Range') rangeWrap.style.display = 'grid';
      else rangeWrap.style.display = 'none';
    },

    applyAutoAdd: function () {
      const col = document.getElementById('bm-add-acc').value;
      const formula = document.getElementById('bm-add-formula').value;
      const amt = parseFloat(document.getElementById('bm-add-amt').value) || 0;
      const target = document.getElementById('bm-add-target').value;
      const fromVal = document.getElementById('bm-add-from-member').value.trim().toLowerCase();
      const toVal = document.getElementById('bm-add-to-member').value.trim().toLowerCase();

      let count = 0;
      members.forEach((m, idx) => {
        let matchesTarget = false;
        if (target === 'All') matchesTarget = true;
        else if (target === 'Selected') matchesTarget = multiMode ? m.checked : (idx === selectedRow);
        else if (target === 'Range') {
          const c = m.memNo.trim().toLowerCase();
          matchesTarget = (c >= fromVal && c <= toVal);
        }

        if (matchesTarget) {
          let calculatedAmt = 0;
          if (formula === 'By Sq.ft') calculatedAmt = amt * (m.sqft || 0);
          else if (formula === 'By Percentage') calculatedAmt = (amt / 100) * (m.sqft || 0);
          else calculatedAmt = amt;

          m.amounts[col] = Math.round(calculatedAmt);
          count++;
        }
      });

      hasChanges = true;
      document.getElementById('bm-autoadd-overlay').classList.remove('active');
      renderMatrix();
      toast('Applied ' + formula + ' formula to ' + count + ' member(s).', true);
    },

    openAutoMasterMultiply: function () {
      document.getElementById('bm-automul-overlay').classList.add('active');
    },

    applyAutoMul: function () {
      const col = document.getElementById('bm-mul-acc').value;
      const fac = parseFloat(document.getElementById('bm-mul-factor').value) || 1;
      members.forEach(m => {
        if (!multiMode || m.checked) {
          const curr = parseFloat(m.amounts[col]) || 0;
          m.amounts[col] = Math.round(curr * fac);
        }
      });
      hasChanges = true;
      document.getElementById('bm-automul-overlay').classList.remove('active');
      renderMatrix();
      toast('Multiplied ' + col + ' by ' + fac, true);
    },

    multiDeleteMode: function () {
      multiMode = !multiMode;
      renderMatrix();
      toast(multiMode ? 'Bulk selection mode active.' : 'Bulk selection deactivated.', true);
    },

    triggerInterestCalc: async function () {
      const socId = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1';
      let intConfig = {
        interestMethod: 'M-CM',
        interestRate: '21%',
        interestType: 'Simple',
        billDue: 15,
        grossDate: '0',
        dayCountBasis: 365,
        interestPriority: 'Interest First'
      };

      // Query database for the active Bill Type's settings strictly from Bill Type & Notes Master
      const curBt = billTypes[currentBillType];
      let btId = curBt ? (curBt.billTypeId || curBt.id) : null;

      if (!btId) {
        try {
          const res = await fetch(`${bmApiBase()}/api/bill-types?societyId=${socId}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const json = await res.json();
            if (json && json.data && Array.isArray(json.data)) {
              const matched = json.data.find(x => (x.billTypeName || '').toLowerCase().trim() === currentBillType.toLowerCase().trim());
              if (matched) btId = matched.billTypeId || matched.id;
            }
          }
        } catch (e) { }
      }

      if (btId) {
        try {
          const res = await fetch(`${bmApiBase()}/api/bill-types/${btId}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const json = await res.json();
            if (json && json.notes) {
              if (json.notes.interestMethod) intConfig.interestMethod = json.notes.interestMethod;
              if (json.notes.interestRate) intConfig.interestRate = json.notes.interestRate;
              if (json.notes.interestType) intConfig.interestType = json.notes.interestType;
              if (json.notes.grossDays !== undefined) intConfig.grossDate = json.notes.grossDays;
              if (json.notes.billDue !== undefined) intConfig.billDue = parseInt(json.notes.billDue, 10) || 15;
              if (json.notes.interestPriority) intConfig.interestPriority = json.notes.interestPriority;
            }
          }
        } catch (e) { }
      }

      // Map method code to user-friendly label
      const mCode = (intConfig.interestMethod || 'M-CM').toUpperCase().trim();
      const dueDay = parseInt(intConfig.billDue, 10) || 15;
      const grossDays = parseInt(intConfig.grossDate, 10) || 0;

      let methodName = 'Monthly | Full Month Charge';
      if (mCode === 'M-DDME') {
        const days = Math.max(1, 30 - dueDay);
        methodName = `Monthly | Due Date → Month-End Only (${days} Days)`;
      } else if (mCode === 'D-DD' || mCode === 'DAILY_PRO_RATA') {
        const days = grossDays > 0 ? grossDays : 2;
        methodName = `Day-Wise | Delayed Days Only (${days} Days)`;
      } else {
        methodName = 'Monthly | Full Month Charge';
      }

      let rateStr = (intConfig.interestRate || '21%').toString().trim();
      if (!rateStr.endsWith('%') && !rateStr.toLowerCase().includes('p.a.')) rateStr += '%';
      if (!rateStr.toLowerCase().includes('p.a.')) rateStr += ' p.a.';

      const grossStr = grossDays > 0 ? `${grossDays} Days Grace` : 'None (Due on ' + dueDay + 'th)';

      const typeNameEl = document.getElementById('bm-int-type-name');
      const methodEl = document.getElementById('bm-int-method-txt');
      const rateEl = document.getElementById('bm-int-rate-txt');
      const grossEl = document.getElementById('bm-int-gross-txt');

      if (typeNameEl) typeNameEl.textContent = currentBillType;
      if (methodEl) methodEl.textContent = methodName;
      if (rateEl) rateEl.textContent = rateStr;
      if (grossEl) grossEl.textContent = grossStr;

      BM._activeIntConfig = intConfig;
      document.getElementById('bm-interest-confirm-overlay').classList.add('active');
    },

    resetInterestToZero: function () {
      let count = 0;
      members.forEach(m => {
        if (!m.amounts) m.amounts = {};
        m.amounts['Interest'] = 0;
        count++;
      });
      BM._interestZeroed = true;
      BM._interestRecalculated = false;
      hasChanges = true;
      BM.recalcTotalsDom();
      renderMatrix();
      toast(`Interest set to 0 for ${count} member(s).`, true);
    },

    resetGstToZero: function () {
      let count = 0;
      members.forEach(m => {
        if (!m.amounts) m.amounts = {};
        m.amounts['CGST'] = 0;
        m.amounts['SGST'] = 0;
        count++;
      });
      hasChanges = true;
      BM.recalcTotalsDom();
      renderMatrix();
      toast(`GST (CGST & SGST) set to 0 for ${count} member(s).`, true);
    },

    closeGstMustZeroModal: function () {
      const el = document.getElementById('bm-gst-must-zero-overlay');
      if (el) el.classList.remove('active');
    },

    actionSetZeroFromModal: function () {
      BM.closeGstMustZeroModal();
      BM.resetInterestToZero();
    },

    closeGstZeroConfirmModal: function (confirmed) {
      const el = document.getElementById('bm-gst-zero-confirm-overlay');
      if (el) el.classList.remove('active');
      if (confirmed) {
        BM.executeGstCalculation();
      }
    },

    closeInterestConfirm: function (confirmed) {
      document.getElementById('bm-interest-confirm-overlay').classList.remove('active');
      if (confirmed) {
        BM._interestRecalculated = true;
        const cfg = BM._activeIntConfig || { interestMethod: 'M-CM', interestRate: '21%' };
        const rateNum = parseFloat((cfg.interestRate || '21').toString().replace(/[^0-9.]/g, '')) || 21;
        const mCode = (cfg.interestMethod || 'M-CM').toUpperCase().trim();
        const dueDay = parseInt(cfg.billDue, 10) || 15;
        const grossDays = parseInt(cfg.grossDate, 10) || 0;
        const dayBasis = parseInt(cfg.dayCountBasis, 10) || 365;

        let count = 0;
        members.forEach(m => {
          const isGstEnabled = getIsGstEnabled();
          const opPrin = parseFloat(m.Op_Prin) || 0;
          const currPrin = Math.round(parseFloat(m.amounts['Principal']) || 0);
          const cgstAmt = isGstEnabled ? (Math.round(parseFloat(m.amounts['CGST']) || 0)) : 0;
          const sgstAmt = isGstEnabled ? (Math.round(parseFloat(m.amounts['SGST']) || 0)) : 0;
          const gstAmt = cgstAmt + sgstAmt;

          // Negative Op_Prin OR explicit 'Cr' tag means member paid in advance — skip interest
          const isCredit = (opPrin < 0) || ((m.OpDrCr || '').toUpperCase() === 'CR');

          let basePrin = 0;
          if (!isCredit && opPrin > 0) {
            basePrin = opPrin;
          } else if (!isCredit && currPrin > 0) {
            basePrin = currPrin;
          }

          if (basePrin <= 0) {
            // Credit or zero balance → no interest
            m.amounts['Interest'] = 0.00;
            return;
          }

          // Count interest on SUM of [PRINCIPAL + GST]
          const baseAmt = basePrin + gstAmt;

          let interest = 0;
          const annualRate = rateNum / 100;

          if (mCode === 'M-DDME') {
            // Monthly | Due Date → Month-End Only
            const daysToMonthEnd = Math.max(1, 30 - dueDay);
            interest = (baseAmt * annualRate * daysToMonthEnd) / dayBasis;
          } else if (mCode === 'D-DD' || mCode === 'DAILY_PRO_RATA') {
            // Day-Wise | Delayed Days Only
            const delayedDays = grossDays > 0 ? grossDays : 2;
            interest = (baseAmt * annualRate * delayedDays) / dayBasis;
          } else {
            // Monthly | Full Month Charge (M-CM)
            interest = (baseAmt * annualRate) / 12;
          }

          m.amounts['Interest'] = Math.round(interest);
          count++;
        });

        hasChanges = true;
        renderMatrix();
        let methodDesc = 'Monthly | Full Month Charge';
        if (mCode === 'M-DDME') methodDesc = 'Monthly | Due Date → Month-End Only';
        else if (mCode === 'D-DD' || mCode === 'DAILY_PRO_RATA') methodDesc = 'Day-Wise | Delayed Days Only';
        toast(`Interest calculated for ${count} member(s) via ${methodDesc} @ ${rateNum}% p.a.`, true);
      }
    },

    triggerGstCalc: function () {
      const isGstEnabled = getIsGstEnabled();
      if (!isGstEnabled) {
        toast('GST is not applicable for this society.', false);
        return;
      }

      // If interest was zeroed AND then recalculated via % INTEREST CALC,
      // allow calculating GST directly with the recalculated interest included!
      if (BM._interestZeroed && BM._interestRecalculated) {
        BM.executeGstCalculation();
        return;
      }

      // Check if any member currently has Interest > 0 in the matrix
      const hasInterest = (members || []).some(m => Math.round(parseFloat(m.amounts && m.amounts['Interest']) || 0) > 0);

      // Condition B: If interest is already present/calculated, user must first set interest to zero
      if (hasInterest) {
        const modalB = document.getElementById('bm-gst-must-zero-overlay');
        if (modalB) modalB.classList.add('active');
        return;
      }

      // Condition A: Interest is zero [0] across all members.
      // Confirm calculating GST using zero interest and Accumulated Principal
      const modalA = document.getElementById('bm-gst-zero-confirm-overlay');
      if (modalA) {
        modalA.classList.add('active');
        return;
      }

      // Fallback
      BM.executeGstCalculation();
    },

    executeGstCalculation: async function () {
      const isGstEnabled = getIsGstEnabled();
      if (!isGstEnabled) {
        toast('GST is not applicable for this society.', false);
        return;
      }

      const socId = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1';
      const fyId = (window.Auth && Auth.getFYId && Auth.getFYId()) ||
                   sessionStorage.getItem('activeFYId') ||
                   localStorage.getItem('activeFYId') ||
                   (window.parent && window.parent.sessionStorage && window.parent.sessionStorage.getItem('activeFYId')) ||
                   (window.parent && window.parent.localStorage && window.parent.localStorage.getItem('activeFYId')) ||
                   '1';

      const limit = currentGstSettings.exemptLimit || 7500;
      const cgstRate = currentGstSettings.cgstPct !== undefined ? currentGstSettings.cgstPct : 9;
      const sgstRate = currentGstSettings.sgstPct !== undefined ? currentGstSettings.sgstPct : 9;

      const typeData = billTypes[currentBillType];
      const currentTypeId = typeData ? (typeData.id || 0) : 0;
      let allHeads = (typeData && Array.isArray(typeData.heads)) ? typeData.heads : [];
      const userHeads = cols.filter(c => c !== 'Principal' && c !== 'Interest' && c !== 'CGST' && c !== 'SGST');

      // Fetch fresh bill type heads configuration to ensure latest gstApp & gstExm flags
      if (currentTypeId > 0) {
        try {
          const detailRes = await fetch(`${bmApiBase()}/api/bill-types/${currentTypeId}`, { headers: getAuthHeaders() });
          if (detailRes.ok) {
            const detailJson = await detailRes.json();
            if (detailJson && detailJson.success && Array.isArray(detailJson.heads)) {
              allHeads = detailJson.heads;
            }
          }
        } catch (e) { }
      }

      toast('Fetching Accumulated Principal from Member Account Head-Wise...', true);

      // Fetch headwise ledger to resolve exact Accumulated Principal for each member
      let memberAccMap = {};
      try {
        const ledgerUrl = `${bmApiBase()}/api/reports/member-headwise-ledger?societyId=${socId}&fyId=${fyId}&billTypeId=${currentTypeId}`;
        const res = await fetch(ledgerUrl, { headers: getAuthHeaders() });
        if (res.ok) {
          const json = await res.json();
          const ledgers = (json && json.memberLedgers) ? json.memberLedgers : [];
          ledgers.forEach(function (l) {
            const info = l.memberInfo || {};
            const mId = info.memberId;
            const mCode = (info.memberCode || '').trim().toLowerCase();
            const mFlat = (info.flatNo || '').trim().toLowerCase();

            const op = l.openingBalance || {};
            const txs = l.transactions || [];
            const opHeadMap = op.headWise || {};
            const opInt = parseFloat(opHeadMap['Interest'] || opHeadMap['INTEREST'] || op.interest || 0);
            let opPrinc = (parseFloat(op.totalOpening) || 0) - opInt;
            if (opPrinc < 0) opPrinc = 0;

            let curAccPrinc = opPrinc;
            let curAccInt = opInt;

            txs.forEach(function (t) {
              const drAmt = parseFloat(t.totalDebit) || 0;
              const crAmt = parseFloat(t.totalCredit) || 0;
              const hAmts = t.headAmounts || {};
              const intAmt = parseFloat(hAmts['Interest'] || hAmts['INTEREST'] || 0);
              const princAmt = drAmt > 0 ? (drAmt - intAmt) : 0;

              if (drAmt > 0) {
                curAccPrinc += princAmt;
                curAccInt += intAmt;
              }

              if (crAmt > 0) {
                let remCredit = crAmt;
                if (curAccInt > 0) {
                  if (remCredit <= curAccInt) {
                    curAccInt -= remCredit;
                    remCredit = 0;
                  } else {
                    remCredit -= curAccInt;
                    curAccInt = 0;
                    curAccPrinc -= remCredit;
                  }
                } else {
                  curAccPrinc -= remCredit;
                }
              }
            });

            const finalAcc = Math.max(0, Math.round(curAccPrinc));
            if (mId) memberAccMap['id_' + mId] = finalAcc;
            if (mCode) memberAccMap['code_' + mCode] = finalAcc;
            if (mFlat) memberAccMap['flat_' + mFlat] = finalAcc;
          });
        }
      } catch (e) {
        console.warn('Headwise ledger fetch failed, using member Op_Prin fallback:', e);
      }

      let count = 0;
      members.forEach(m => {
        let prinTotal = 0;
        let gstAppTotal = 0;
        let gstExmTotal = 0;

        userHeads.forEach(bh => {
          const v = Math.round(parseFloat(m.amounts[bh]) || 0);
          prinTotal += v;

          const bhLower = bh.toLowerCase().trim();
          const hMatch = allHeads.find(h =>
            (h.accName && h.accName.toLowerCase().trim() === bhLower) ||
            (h.accCode && h.accCode.toLowerCase().trim() === bhLower) ||
            (h.accountName && h.accountName.toLowerCase().trim() === bhLower) ||
            (h.accountCode && h.accountCode.toLowerCase().trim() === bhLower)
          ) || (defaultHeads || []).find(h =>
            (h.accName && h.accName.toLowerCase().trim() === bhLower) ||
            (h.accCode && h.accCode.toLowerCase().trim() === bhLower)
          );

          if (hMatch) {
            const isApp = !!(hMatch.gstApp === true || hMatch.gstApp === 1 || hMatch.gstApp === 'true' || hMatch.GSTApplicable === true || hMatch.GSTApplicable === 1 || hMatch.GSTApplicable === 'true');
            const isExm = !!(hMatch.gstExm === true || hMatch.gstExm === 1 || hMatch.gstExm === 'true' || hMatch.GSTExempted === true || hMatch.GSTExempted === 1 || hMatch.GSTExempted === 'true');
            if (isApp) {
              gstAppTotal += v;
            } else if (isExm) {
              gstExmTotal += v;
            }
          }
        });

        // Set row Principal as sum of current bill user heads
        m.amounts['Principal'] = prinTotal;

        // Base for GST is Accumulated Principal from Member Account | Head Wise
        let accPrinc = 0;
        if (m.id && memberAccMap['id_' + m.id] !== undefined) {
          accPrinc = memberAccMap['id_' + m.id];
        } else if (m.memNo && memberAccMap['code_' + String(m.memNo).trim().toLowerCase()] !== undefined) {
          accPrinc = memberAccMap['code_' + String(m.memNo).trim().toLowerCase()];
        } else if (m.flatNo && memberAccMap['flat_' + String(m.flatNo).trim().toLowerCase()] !== undefined) {
          accPrinc = memberAccMap['flat_' + String(m.flatNo).trim().toLowerCase()];
        } else {
          accPrinc = Math.max(0, Math.round(parseFloat(m.Op_Prin) || 0));
        }

        // 1. Check if total (Accumulated Principal + Interest or GST App + GST Exm + Interest) exceeds limit (7500)
        // 2. If it exceeds 7500 -> both GST Applicable & GST Exempted + Interest are taxed
        // 3. If it does NOT exceed 7500 -> GST is counted on GST Applicable + Interest
        const rowInterest = Math.round(parseFloat(m.amounts['Interest']) || 0);
        const basePrinc = accPrinc > 0 ? accPrinc : (gstAppTotal + gstExmTotal);
        const totalToCheck = basePrinc + rowInterest;

        let taxableBase = 0;
        if (totalToCheck > limit) {
          taxableBase = basePrinc + rowInterest;
        } else {
          taxableBase = gstAppTotal + rowInterest;
        }

        const cgstVal = Math.round((taxableBase * cgstRate) / 100);
        const sgstVal = Math.round((taxableBase * sgstRate) / 100);

        m.amounts['CGST'] = cgstVal;
        m.amounts['SGST'] = sgstVal;
        count++;
      });

      hasChanges = true;
      BM.recalcTotalsDom();
      renderMatrix();
      toast(`GST calculated for ${count} member(s) (CGST ${cgstRate}% + SGST ${sgstRate}% | Limit ₹${limit}).`, true);
    },

    saveToggles: async function () {
      // Legacy - GST calculation is now executed on demand via BM.triggerGstCalc()
    },

    loadToggles: async function () {
      // Legacy - GST calculation is now executed on demand via BM.triggerGstCalc()
    },

    printList: function () {
      const w = window.open('', '_blank');
      let html = `<html><head><title>Billing Master Matrix - ${currentBillType}</title><style>body{font-family:"Segoe UI",sans-serif;font-size:10px;margin:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #808080;padding:4px;text-align:right;}th{background:#F5F5F5;font-weight:bold;text-align:center;}h2{text-align:center;}</style></head><body><h2>Society Billing Matrix Report (${currentBillType.toUpperCase()})</h2><table><thead><tr><th>Memb No</th><th>Wing</th><th>Name</th>`;
      cols.forEach(c => html += `<th>${c.toUpperCase()}</th>`);
      html += '<th>TOTAL</th></tr></thead><tbody>';

      members.forEach(m => {
        html += `<tr><td style="text-align:center;">${m.memNo}</td><td style="text-align:center;">${m.wing || ''}</td><td style="text-align:left;">${m.name}</td>`;
        cols.forEach(c => {
          const v = Math.round(parseFloat(m.amounts[c]) || 0);
          html += `<td>${v}</td>`;
        });
        const principalVal = Math.round(parseFloat(m.amounts['Principal']) || 0);
        const interestVal = Math.round(parseFloat(m.amounts['Interest']) || 0);
        const cgstVal = Math.round(parseFloat(m.amounts['CGST']) || 0);
        const sgstVal = Math.round(parseFloat(m.amounts['SGST']) || 0);
        const isGstEnabled = getIsGstEnabled();
        const rowTot = principalVal + interestVal + (isGstEnabled ? (cgstVal + sgstVal) : 0);
        html += `<td style="font-weight:bold; color:#1565C0;">${rowTot}</td></tr>`;
      });
      html += '</tbody></table></body></html>';
      w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 300);
    },

    _currentImportData: null,

    // Dynamic Head Discovery: extracts configured active heads for current bill type
    getDynamicHeadsConfig: function () {
      const typeData = billTypes[currentBillType];
      const isGstEnabled = getIsGstEnabled();
      let baseHeads = [];

      if (typeData && Array.isArray(typeData.heads)) {
        const activeHeads = typeData.heads.filter(h => h && h.accName && h.accName.trim() !== '');
        baseHeads = activeHeads
          .filter(h => {
            const name = (h.accName || '').toLowerCase().trim();
            return name !== '' && name !== 'interest' && name !== 'cgst' && name !== 'sgst' && name !== 'principal' && name !== 'total heads';
          })
          .map(h => ({
            name: h.accName.trim(),
            code: h.accCode || '',
            id: h.headId || h.accountId || null
          }));
      }

      // Fallback to cols if baseHeads is empty
      if (baseHeads.length === 0) {
        const userCols = cols.filter(c => c !== 'Principal' && c !== 'Interest' && c !== 'CGST' && c !== 'SGST');
        baseHeads = userCols.map(c => {
          const match = (defaultHeads || []).find(h => (h.accName || '').toLowerCase().trim() === c.toLowerCase().trim());
          return {
            name: c,
            code: match ? match.accCode : '',
            id: null
          };
        });
      }

      return {
        baseHeads,
        isGstEnabled
      };
    },

    getColLetter: function (colIdx) {
      let str = '';
      colIdx++;
      while (colIdx > 0) {
        let rem = (colIdx - 1) % 26;
        str = String.fromCharCode(65 + rem) + str;
        colIdx = Math.floor((colIdx - 1) / 26);
      }
      return str;
    },

    downloadCsv: function (csvContent, filename) {
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    // ── TEMPLATE GENERATION (DYNAMIC HEADS ONLY) ──
    downloadTemplate: function (format) {
      const { baseHeads } = BM.getDynamicHeadsConfig();
      const dateStr = new Date().toISOString().slice(0, 10);
      const isCsv = (format || '').toLowerCase() === 'csv';

      // Headers: Member & Property Info + Configured Dynamic Heads only
      const headers = ['MEMB NO', 'WING', 'MEMBER NAME', 'CARPET SQ FT'];
      baseHeads.forEach(h => {
        headers.push(h.name.toUpperCase());
      });

      // Pre-populate with current members in society
      const rowsData = members.length > 0 ? members : [{ memNo: '101', wing: 'A', name: 'Sample Member', sqft: 650, amounts: {} }];

      if (isCsv) {
        let csvContent = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\r\n';
        rowsData.forEach(m => {
          const rowVals = [
            `"${(m.memNo || m.flatNo || '').replace(/"/g, '""')}"`,
            `"${(m.wing || '').replace(/"/g, '""')}"`,
            `"${(m.name || '').replace(/"/g, '""')}"`,
            m.sqft || 0
          ];
          // Dynamic heads default to 0
          baseHeads.forEach(() => rowVals.push(0));
          csvContent += rowVals.join(',') + '\r\n';
        });

        BM.downloadCsv(csvContent, `Billing_Matrix_Template_${currentBillType}_${dateStr}.csv`);
        toast(`CSV Template downloaded for ${currentBillType}.`, true);
        return;
      }

      // Excel (XLSX) with clean styling
      if (typeof XLSX === 'undefined' || !XLSX.utils) {
        toast('Excel library loading, please try again in a moment...', false);
        return;
      }

      const aoa = [headers];

      rowsData.forEach((m) => {
        const row = [
          m.memNo || m.flatNo || '',
          m.wing || '',
          m.name || '',
          m.sqft || 0
        ];

        // Dynamic billing heads initialized to 0
        baseHeads.forEach(() => {
          row.push(0);
        });

        aoa.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const range = XLSX.utils.decode_range(ws['!ref']);
      const colWidthsArr = [];

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const headerText = headers[C] || '';
        let maxLen = Math.max(headerText.length + 3, 11);
        colWidthsArr.push({ wch: Math.min(maxLen, 32) });

        // Header style
        const headRef = XLSX.utils.encode_cell({ r: 0, c: C });
        if (ws[headRef]) {
          ws[headRef].s = {
            font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '1565C0' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: {
              top: { style: 'thin', color: { rgb: 'CBD5E1' } },
              bottom: { style: 'medium', color: { rgb: '0F172A' } },
              left: { style: 'thin', color: { rgb: 'CBD5E1' } },
              right: { style: 'thin', color: { rgb: 'CBD5E1' } }
            }
          };
        }

        // Data row cells
        for (let R = 1; R <= range.e.r; ++R) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[cellRef];
          if (!cell) continue;

          const isNum = (C >= 3);
          cell.s = {
            font: { name: 'Segoe UI', sz: 9.5 },
            alignment: {
              horizontal: isNum ? 'right' : (C === 0 || C === 1 ? 'center' : 'left'),
              vertical: 'center'
            },
            border: {
              top: { style: 'thin', color: { rgb: 'E2E8F0' } },
              bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
              left: { style: 'thin', color: { rgb: 'E2E8F0' } },
              right: { style: 'thin', color: { rgb: 'E2E8F0' } }
            }
          };
          if (isNum && C >= 4) {
            cell.z = '#,##0.00';
          }
        }
      }

      ws['!cols'] = colWidthsArr;

      const wb = XLSX.utils.book_new();
      const safeSheetName = (currentBillType || 'Matrix').replace(/[:\\/?*\[\]]/g, '').substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      XLSX.writeFile(wb, `Billing_Matrix_Template_${currentBillType}_${dateStr}.xlsx`);
      toast(`Excel Template downloaded for ${currentBillType}.`, true);
    },

    // ── EXPORT MATRIX (DYNAMIC HEADS ONLY) ──
    exportData: function (fmt) {
      const { baseHeads } = BM.getDynamicHeadsConfig();
      const dateStr = new Date().toISOString().slice(0, 10);
      const isCsv = (fmt || '').toLowerCase() === 'csv';

      // Headers: Fixed Info + Configured Dynamic Heads only
      const headers = ['MEMB NO', 'WING', 'MEMBER NAME', 'CARPET SQ FT'];
      baseHeads.forEach(h => {
        headers.push(h.name.toUpperCase());
      });

      // Calculate totals
      const headTotals = {};
      baseHeads.forEach(h => headTotals[h.name] = 0);
      let totSqft = 0;

      const rowsData = members.map(m => {
        totSqft += parseFloat(m.sqft) || 0;

        const row = [
          m.memNo || m.flatNo || '',
          m.wing || '',
          m.name || '',
          m.sqft || 0
        ];

        baseHeads.forEach(h => {
          const val = Math.round(parseFloat(m.amounts && m.amounts[h.name]) || 0);
          headTotals[h.name] += val;
          row.push(val);
        });

        return row;
      });

      // Summary Footer Row
      const footerRow = ['TOTAL', '', '', Math.round(totSqft * 100) / 100];
      baseHeads.forEach(h => footerRow.push(headTotals[h.name]));

      if (isCsv) {
        let csvContent = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\r\n';
        rowsData.forEach(r => {
          const rowVals = r.map((c, i) => {
            if (i < 3) return `"${String(c || '').replace(/"/g, '""')}"`;
            return c;
          });
          csvContent += rowVals.join(',') + '\r\n';
        });
        csvContent += footerRow.map((c, i) => i < 3 ? `"${c}"` : c).join(',') + '\r\n';

        BM.downloadCsv(csvContent, `Billing_Matrix_${currentBillType}_${dateStr}.csv`);
        toast(`CSV Export downloaded for ${currentBillType}.`, true);
        return;
      }

      // Excel Export
      if (typeof XLSX === 'undefined' || !XLSX.utils) {
        toast('Excel library loading, please try again in a moment...', false);
        return;
      }

      const aoa = [headers, ...rowsData, footerRow];
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      const range = XLSX.utils.decode_range(ws['!ref']);
      const colWidthsArr = [];
      const footerR = range.e.r;

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const headerText = headers[C] || '';
        let maxLen = Math.max(headerText.length + 3, 11);
        colWidthsArr.push({ wch: Math.min(maxLen, 32) });

        // Header style
        const headRef = XLSX.utils.encode_cell({ r: 0, c: C });
        if (ws[headRef]) {
          ws[headRef].s = {
            font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '1565C0' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: {
              top: { style: 'thin', color: { rgb: 'CBD5E1' } },
              bottom: { style: 'medium', color: { rgb: '0F172A' } },
              left: { style: 'thin', color: { rgb: 'CBD5E1' } },
              right: { style: 'thin', color: { rgb: 'CBD5E1' } }
            }
          };
        }

        // Data rows style
        for (let R = 1; R < footerR; ++R) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[cellRef];
          if (!cell) continue;

          const isNum = (C >= 3);
          cell.s = {
            font: { name: 'Segoe UI', sz: 9.5 },
            fill: { fgColor: { rgb: (R % 2 === 0) ? 'F8FAFC' : 'FFFFFF' } },
            alignment: {
              horizontal: isNum ? 'right' : (C === 0 || C === 1 ? 'center' : 'left'),
              vertical: 'center'
            },
            border: {
              top: { style: 'thin', color: { rgb: 'E2E8F0' } },
              bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
              left: { style: 'thin', color: { rgb: 'E2E8F0' } },
              right: { style: 'thin', color: { rgb: 'E2E8F0' } }
            }
          };
          if (isNum && C >= 4) {
            cell.z = '#,##0.00';
          }
        }

        // Footer cell style
        const footRef = XLSX.utils.encode_cell({ r: footerR, c: C });
        if (ws[footRef]) {
          const isNum = (C >= 3);
          ws[footRef].s = {
            font: { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: '0F172A' } },
            fill: { fgColor: { rgb: 'F1F5F9' } },
            alignment: {
              horizontal: isNum ? 'right' : (C === 0 ? 'center' : 'left'),
              vertical: 'center'
            },
            border: {
              top: { style: 'thin', color: { rgb: '94A3B8' } },
              bottom: { style: 'double', color: { rgb: '0F172A' } },
              left: { style: 'thin', color: { rgb: 'CBD5E1' } },
              right: { style: 'thin', color: { rgb: 'CBD5E1' } }
            }
          };
          if (isNum && C >= 4) {
            ws[footRef].z = '#,##0.00';
          }
        }
      }

      ws['!cols'] = colWidthsArr;

      const wb = XLSX.utils.book_new();
      const safeSheetName = (currentBillType || 'Matrix').replace(/[:\\/?*\[\]]/g, '').substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      XLSX.writeFile(wb, `Billing_Matrix_${currentBillType}_${dateStr}.xlsx`);
      toast(`Excel Export downloaded for ${currentBillType}.`, true);
    },

    // ── IMPORT MODAL & FILE PROCESSING ──
    importData: function () {
      BM.openImportModal();
    },

    openImportModal: function () {
      BM._currentImportData = null;
      const modal = document.getElementById('bm-import-modal');
      if (modal) modal.style.display = 'flex';

      const typeBadge = document.getElementById('bm-import-type-badge');
      if (typeBadge) typeBadge.textContent = currentBillType;

      const fileInp = document.getElementById('bm-import-file-input');
      if (fileInp) fileInp.value = '';

      const statsBar = document.getElementById('bm-import-stats-bar');
      if (statsBar) statsBar.style.display = 'none';

      const alertBox = document.getElementById('bm-import-alert-box');
      if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.innerHTML = '';
      }

      const previewWrap = document.getElementById('bm-import-preview-wrap');
      if (previewWrap) previewWrap.style.display = 'none';

      const commitBtn = document.getElementById('bm-btn-commit-import');
      if (commitBtn) {
        commitBtn.disabled = true;
        commitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> COMMIT IMPORT';
      }

      BM.setupImportDragDrop();
    },

    closeImportModal: function () {
      const modal = document.getElementById('bm-import-modal');
      if (modal) modal.style.display = 'none';
      BM._currentImportData = null;
    },

    setupImportDragDrop: function () {
      const dz = document.getElementById('bm-import-dropzone');
      if (!dz || dz._dragInit) return;
      dz._dragInit = true;

      ['dragenter', 'dragover'].forEach(eventName => {
        dz.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dz.classList.add('dragover');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dz.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dz.classList.remove('dragover');
        }, false);
      });

      dz.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt && dt.files;
        if (files && files.length > 0) {
          BM.processImportFile(files[0]);
        }
      }, false);
    },

    handleFileSelect: function (e) {
      const file = e.target.files && e.target.files[0];
      if (file) {
        BM.processImportFile(file);
      }
    },

    processImportFile: function (file) {
      if (!file) return;
      const fName = file.name || '';
      const ext = fName.split('.').pop().toLowerCase();
      if (['xlsx', 'xls', 'csv'].indexOf(ext) === -1) {
        BM.showImportAlert('Please select a valid Excel (.xlsx, .xls) or CSV file.', 'danger');
        return;
      }

      if (typeof XLSX === 'undefined' || !XLSX.read) {
        BM.showImportAlert('Excel parser library is loading, please try again in a few seconds.', 'danger');
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
            BM.showImportAlert('No sheets found in the uploaded file.', 'danger');
            return;
          }
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
          if (!rawRows || rawRows.length < 2) {
            BM.showImportAlert('The selected file contains no data rows.', 'danger');
            return;
          }
          BM.validateAndPreviewImport(file, rawRows);
        } catch (err) {
          console.error('Error reading import file:', err);
          BM.showImportAlert('Failed to parse file: ' + (err.message || 'Unknown error'), 'danger');
        }
      };
      reader.readAsArrayBuffer(file);
    },

    showImportAlert: function (htmlMessage, type) {
      const alertBox = document.getElementById('bm-import-alert-box');
      if (!alertBox) return;
      alertBox.style.display = 'block';
      if (type === 'danger') {
        alertBox.style.background = '#FEE2E2';
        alertBox.style.color = '#B91C1C';
        alertBox.style.border = '1px solid #FCA5A5';
      } else if (type === 'warning') {
        alertBox.style.background = '#FEF3C7';
        alertBox.style.color = '#92400E';
        alertBox.style.border = '1px solid #FCD34D';
      } else {
        alertBox.style.background = '#DCFCE7';
        alertBox.style.color = '#166534';
        alertBox.style.border = '1px solid #86EFAC';
      }
      alertBox.innerHTML = htmlMessage;
    },

    validateAndPreviewImport: function (file, rawRows) {
      const { baseHeads, isGstEnabled } = BM.getDynamicHeadsConfig();
      const rawHeaders = rawRows[0].map(h => String(h || '').trim());

      const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // Identify Tier A Fixed Columns
      let memNoIdx = -1, wingIdx = -1, nameIdx = -1, sqftIdx = -1;
      rawHeaders.forEach((h, idx) => {
        const n = norm(h);
        if (memNoIdx === -1 && (n === 'membno' || n === 'flatno' || n === 'memcode' || n === 'code' || n === 'flat' || n === 'unitno' || n.includes('flatno') || n.includes('membno'))) {
          memNoIdx = idx;
        } else if (wingIdx === -1 && (n === 'wing' || n === 'bldg' || n === 'block')) {
          wingIdx = idx;
        } else if (nameIdx === -1 && (n === 'name' || n === 'membername' || n === 'ownername' || n === 'partyname')) {
          nameIdx = idx;
        } else if (sqftIdx === -1 && (n === 'sqft' || n === 'carpetsqft' || n === 'carpetarea' || n === 'area' || n === 'carpet')) {
          sqftIdx = idx;
        }
      });

      if (memNoIdx === -1) {
        BM.showImportAlert('<strong>Missing Column:</strong> Could not identify a "MEMB NO" or "FLAT NO" column in row 1 of the file.', 'danger');
        return;
      }

      // Map Dynamic Heads to File Column Indices
      const mappedHeads = [];
      const missingHeads = [];

      baseHeads.forEach(bh => {
        const hNameNorm = norm(bh.name);
        const hCodeNorm = bh.code ? norm(bh.code) : '';

        let matchedIdx = -1;
        rawHeaders.forEach((rawH, idx) => {
          if (idx === memNoIdx || idx === wingIdx || idx === nameIdx || idx === sqftIdx) return;
          const rawNorm = norm(rawH);
          if (rawNorm === hNameNorm || (hCodeNorm && (rawNorm === hCodeNorm || rawNorm.includes(hCodeNorm)))) {
            matchedIdx = idx;
          }
        });

        if (matchedIdx !== -1) {
          mappedHeads.push({ ...bh, fileColIdx: matchedIdx });
        } else {
          missingHeads.push(bh);
          mappedHeads.push({ ...bh, fileColIdx: -1 });
        }
      });

      // Check Calculated columns in file
      let filePrincipalIdx = -1, fileInterestIdx = -1, fileCgstIdx = -1, fileSgstIdx = -1;
      rawHeaders.forEach((rawH, idx) => {
        const n = norm(rawH);
        if (n === 'principal') filePrincipalIdx = idx;
        if (n === 'interest') fileInterestIdx = idx;
        if (n === 'cgst') fileCgstIdx = idx;
        if (n === 'sgst') fileSgstIdx = idx;
      });

      // Parse and Validate Rows
      const validRows = [];
      const invalidRows = [];
      const allRows = [];

      for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || !Array.isArray(row)) continue;

        const isBlank = row.every(c => String(c || '').trim() === '');
        if (isBlank) continue;

        const rawMemVal = String(row[memNoIdx] || '').trim();
        if (!rawMemVal) continue;

        if (rawMemVal.toLowerCase() === 'total' || rawMemVal.toLowerCase().startsWith('grand total')) {
          continue;
        }

        const normVal = rawMemVal.toLowerCase();
        const matchedMem = members.find(m => {
          const mCode = (m.memNo || '').toLowerCase().trim();
          const fCode = (m.flatNo || '').toLowerCase().trim();
          const idStr = String(m.id || '');
          return mCode === normVal || fCode === normVal || idStr === normVal;
        });

        const rowAmounts = {};
        let principalVal = 0;

        // Dynamic Heads
        mappedHeads.forEach(h => {
          let val = 0;
          if (h.fileColIdx !== -1) {
            const rawCell = String(row[h.fileColIdx] || '').replace(/,/g, '').trim();
            val = Math.round(parseFloat(rawCell) || 0);
          }
          rowAmounts[h.name] = val;
          if (h.code) rowAmounts[h.code] = val;
          principalVal += val;
        });

        if (filePrincipalIdx !== -1) {
          const rawP = String(row[filePrincipalIdx] || '').replace(/,/g, '').trim();
          if (rawP !== '') principalVal = Math.round(parseFloat(rawP) || 0);
        }
        rowAmounts['Principal'] = principalVal;

        // Interest
        let interestVal = 0;
        if (fileInterestIdx !== -1) {
          const rawInt = String(row[fileInterestIdx] || '').replace(/,/g, '').trim();
          interestVal = Math.round(parseFloat(rawInt) || 0);
        } else if (matchedMem) {
          interestVal = Math.round(parseFloat(matchedMem.amounts && matchedMem.amounts['Interest']) || 0);
        }
        rowAmounts['Interest'] = interestVal;

        // GST
        let cgstVal = 0, sgstVal = 0;
        if (isGstEnabled) {
          if (fileCgstIdx !== -1) {
            cgstVal = Math.round(parseFloat(String(row[fileCgstIdx] || '').replace(/,/g, '')) || 0);
          } else if (matchedMem) {
            cgstVal = Math.round(parseFloat(matchedMem.amounts && matchedMem.amounts['CGST']) || 0);
          }
          if (fileSgstIdx !== -1) {
            sgstVal = Math.round(parseFloat(String(row[fileSgstIdx] || '').replace(/,/g, '')) || 0);
          } else if (matchedMem) {
            sgstVal = Math.round(parseFloat(matchedMem.amounts && matchedMem.amounts['SGST']) || 0);
          }
          rowAmounts['CGST'] = cgstVal;
          rowAmounts['SGST'] = sgstVal;
        }

        const rowTotal = principalVal + interestVal + (isGstEnabled ? (cgstVal + sgstVal) : 0);

        if (matchedMem) {
          const item = {
            status: 'VALID',
            memberId: matchedMem.id,
            memNo: matchedMem.memNo || rawMemVal,
            flatNo: matchedMem.flatNo || rawMemVal,
            wing: matchedMem.wing || (wingIdx !== -1 ? String(row[wingIdx] || '').trim() : ''),
            name: matchedMem.name || (nameIdx !== -1 ? String(row[nameIdx] || '').trim() : ''),
            sqft: matchedMem.sqft || (sqftIdx !== -1 ? parseFloat(row[sqftIdx]) || 0 : 0),
            amounts: rowAmounts,
            principalVal,
            interestVal,
            cgstVal,
            sgstVal,
            rowTotal,
            note: ''
          };
          validRows.push(item);
          allRows.push(item);
        } else {
          const item = {
            status: 'INVALID',
            memberId: 0,
            memNo: rawMemVal,
            flatNo: rawMemVal,
            wing: wingIdx !== -1 ? String(row[wingIdx] || '').trim() : '',
            name: nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '',
            sqft: sqftIdx !== -1 ? parseFloat(row[sqftIdx]) || 0 : 0,
            amounts: rowAmounts,
            principalVal,
            interestVal,
            cgstVal,
            sgstVal,
            rowTotal,
            note: `Member "${rawMemVal}" not found in active society register.`
          };
          invalidRows.push(item);
          allRows.push(item);
        }
      }

      // Update Stats Bar
      const totalCount = allRows.length;
      const validCount = validRows.length;
      const errorCount = invalidRows.length;
      const missingCount = missingHeads.length;

      document.getElementById('bm-import-filename').innerHTML = `<i class="bi bi-file-earmark-spreadsheet-fill" style="color:#16A34A;"></i> ${file.name}`;
      document.getElementById('bm-import-filesize').textContent = `(${Math.round(file.size / 1024)} KB)`;
      document.getElementById('bm-stat-total').textContent = totalCount;
      document.getElementById('bm-stat-valid').textContent = validCount;

      const missingWrap = document.getElementById('bm-stat-missing-wrap');
      if (missingWrap) {
        missingWrap.style.display = missingCount > 0 ? 'inline' : 'none';
        document.getElementById('bm-stat-missing').textContent = missingCount;
      }

      const errWrap = document.getElementById('bm-stat-error-wrap');
      if (errWrap) {
        errWrap.style.display = errorCount > 0 ? 'inline' : 'none';
        document.getElementById('bm-stat-error').textContent = errorCount;
      }

      document.getElementById('bm-import-stats-bar').style.display = 'flex';

      // Update Validation Alert Box
      let alertHtml = '';
      if (missingCount > 0) {
        const missingNames = missingHeads.map(h => `<strong>${h.name}</strong>`).join(', ');
        alertHtml += `<div style="margin-bottom:${errorCount > 0 ? '6px' : '0'};"><i class="bi bi-exclamation-triangle-fill" style="color:#D97706;"></i> <strong>Dynamic Billing Head Notice:</strong> The following configured heads were not found in the uploaded file and will default to <strong>₹ 0.00</strong>: ${missingNames}.</div>`;
      }
      if (errorCount > 0) {
        alertHtml += `<div><i class="bi bi-x-circle-fill" style="color:#DC2626;"></i> <strong>${errorCount} row(s)</strong> could not be matched with members in this society and will be skipped.</div>`;
      }
      if (!alertHtml && validCount > 0) {
        alertHtml = `<div><i class="bi bi-check-circle-fill" style="color:#16A34A;"></i> Ready to import: <strong>${validCount} members</strong> matched with active society register. All configured heads mapped dynamically.</div>`;
        BM.showImportAlert(alertHtml, 'success');
      } else if (alertHtml) {
        BM.showImportAlert(alertHtml, errorCount > 0 ? 'warning' : 'warning');
      }

      // Render Preview Table
      const thead = document.getElementById('bm-import-preview-thead');
      const tbody = document.getElementById('bm-import-preview-tbody');

      let thHtml = '<tr>';
      thHtml += '<th style="text-align:center; width:70px;">STATUS</th>';
      thHtml += '<th style="text-align:center; width:80px;">MEMB NO</th>';
      thHtml += '<th style="text-align:center; width:55px;">WING</th>';
      thHtml += '<th style="text-align:left; width:160px;">MEMBER NAME</th>';
      thHtml += '<th style="text-align:right; width:90px;">SQ FT</th>';

      mappedHeads.forEach(h => {
        const isMiss = (h.fileColIdx === -1);
        const missStyle = isMiss ? 'color:#B45309; background:#FEF3C7;' : '';
        const missTitle = isMiss ? 'title="Missing in file — defaulted to 0"' : '';
        thHtml += `<th style="text-align:right; ${missStyle}" ${missTitle}>${h.name.toUpperCase()}</th>`;
      });

      thHtml += '<th style="text-align:right; width:95px;">PRINCIPAL</th>';
      thHtml += '<th style="text-align:right; width:90px;">INTEREST</th>';
      if (isGstEnabled) {
        thHtml += '<th style="text-align:right; width:80px;">CGST</th>';
        thHtml += '<th style="text-align:right; width:80px;">SGST</th>';
      }
      thHtml += '<th style="text-align:right; width:100px; font-weight:800;">TOTAL HEADS</th>';
      thHtml += '<th style="text-align:left; min-width:140px;">NOTES</th>';
      thHtml += '</tr>';
      thead.innerHTML = thHtml;

      let tbHtml = '';
      const previewLimit = Math.min(allRows.length, 250);
      for (let i = 0; i < previewLimit; i++) {
        const row = allRows[i];
        const isValid = (row.status === 'VALID');
        const rowClass = isValid ? '' : 'class="row-invalid"';
        const badge = isValid
          ? '<span class="bm-badge bm-badge-success">VALID</span>'
          : '<span class="bm-badge bm-badge-danger">INVALID</span>';

        tbHtml += `<tr ${rowClass}>`;
        tbHtml += `<td style="text-align:center;">${badge}</td>`;
        tbHtml += `<td style="text-align:center; font-weight:700;">${row.memNo}</td>`;
        tbHtml += `<td style="text-align:center;">${row.wing || '—'}</td>`;
        tbHtml += `<td style="text-align:left; font-weight:600;">${row.name || '—'}</td>`;
        tbHtml += `<td style="text-align:right;">${row.sqft || 0}</td>`;

        mappedHeads.forEach(h => {
          const val = row.amounts[h.name] || 0;
          tbHtml += `<td style="text-align:right;">${val.toLocaleString('en-IN')}</td>`;
        });

        tbHtml += `<td style="text-align:right; font-weight:700; color:#1E40AF;">${row.principalVal.toLocaleString('en-IN')}</td>`;
        tbHtml += `<td style="text-align:right;">${row.interestVal.toLocaleString('en-IN')}</td>`;
        if (isGstEnabled) {
          tbHtml += `<td style="text-align:right;">${row.cgstVal.toLocaleString('en-IN')}</td>`;
          tbHtml += `<td style="text-align:right;">${row.sgstVal.toLocaleString('en-IN')}</td>`;
        }
        tbHtml += `<td style="text-align:right; font-weight:800; color:#1565C0;">${row.rowTotal.toLocaleString('en-IN')}</td>`;
        tbHtml += `<td style="color:${isValid ? '#64748B' : '#DC2626'}; font-weight:${isValid ? 'normal' : '600'}; font-size:10.5px;">${row.note || 'OK'}</td>`;
        tbHtml += '</tr>';
      }

      tbody.innerHTML = tbHtml;
      document.getElementById('bm-import-preview-wrap').style.display = 'flex';

      // Commit Button state
      const commitBtn = document.getElementById('bm-btn-commit-import');
      if (commitBtn) {
        commitBtn.disabled = (validCount === 0);
        commitBtn.innerHTML = `<i class="bi bi-check2-circle"></i> COMMIT IMPORT (${validCount} MEMBERS)`;
      }

      BM._currentImportData = {
        validRows,
        missingHeads,
        currentBillType
      };
    },

    commitImport: async function () {
      if (!BM._currentImportData || !BM._currentImportData.validRows || BM._currentImportData.validRows.length === 0) {
        toast('No valid member records to import.', false);
        return;
      }

      const commitBtn = document.getElementById('bm-btn-commit-import');
      if (commitBtn) {
        commitBtn.disabled = true;
        commitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> COMMITTING IMPORT...';
      }

      const socId = getActiveSocietyId();
      const typeData = billTypes[currentBillType];
      const curBtId = typeData ? (typeData.id || 1) : 1;

      const rowsPayload = BM._currentImportData.validRows.map(vr => ({
        memberId: vr.memberId,
        memNo: vr.memNo,
        flatNo: vr.flatNo,
        amounts: vr.amounts
      }));

      try {
        const url = `${bmApiBase()}/api/billing-master/bulk-import`;
        const res = await fetch(url, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            societyId: socId,
            billTypeId: curBtId,
            billTypeName: currentBillType,
            rows: rowsPayload
          })
        });

        const json = await res.json();
        if (res.ok && json.success) {
          // Update in-memory members matrix
          BM._currentImportData.validRows.forEach(vr => {
            const m = members.find(x => x.id === vr.memberId || (x.memNo && x.memNo.toLowerCase() === vr.memNo.toLowerCase()));
            if (m) {
              if (!m.amounts) m.amounts = {};
              Object.keys(vr.amounts).forEach(k => {
                m.amounts[k] = vr.amounts[k];
              });
              recalcRowGSTAndPrincipal(m);
            }
          });

          // Backup to LocalStorage
          try {
            const currentPayload = members.map(m => ({
              memberId: m.id,
              memNo: m.memNo,
              flatNo: m.flatNo,
              wing: m.wing,
              name: m.name,
              sqft: m.sqft,
              amounts: m.amounts,
              checked: !!m.checked
            }));
            localStorage.setItem(`jeevika_bm_matrix_${socId}_${currentBillType}`, JSON.stringify(currentPayload));
            localStorage.setItem(`jeevika_bm_matrix_1_${currentBillType}`, JSON.stringify(currentPayload));
          } catch (e) { }

          originalMembers = JSON.parse(JSON.stringify(members));
          hasChanges = false;
          BM.recalcTotalsDom();
          renderMatrix();
          BM.closeImportModal();
          toast(`Successfully imported ${json.count || rowsPayload.length} member records into ${currentBillType} Matrix!`, true);
        } else {
          if (commitBtn) {
            commitBtn.disabled = false;
            commitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> COMMIT IMPORT';
          }
          BM.showImportAlert('Import failed: ' + (json.message || 'Server error'), 'danger');
          toast(json.message || 'Import failed', false);
        }
      } catch (err) {
        console.error('Error committing bulk import:', err);
        if (commitBtn) {
          commitBtn.disabled = false;
          commitBtn.innerHTML = '<i class="bi bi-check2-circle"></i> COMMIT IMPORT';
        }
        BM.showImportAlert('Network / Server Error: ' + err.message, 'danger');
        toast('Failed to commit import to server', false);
      }
    },

    openMemberDetailModal: function (idx) {
      currentDetailMemberIdx = idx;
      const m = members[idx];
      if (!m) return;

      const codeEl = document.getElementById('imb-profile-code');
      const nameEl = document.getElementById('imb-profile-name');
      const wingEl = document.getElementById('imb-profile-wing');
      const sqftEl = document.getElementById('imb-profile-sqft');
      const typeEl = document.getElementById('imb-profile-type');
      const tbody = document.getElementById('imb-table-body');

      if (codeEl) codeEl.textContent = m.memNo || '—';
      if (nameEl) nameEl.textContent = m.name || '—';
      if (wingEl) wingEl.textContent = m.wing || '—';
      if (sqftEl) sqftEl.textContent = (m.sqft !== undefined && m.sqft !== null && m.sqft !== '') ? m.sqft : '—';
      if (typeEl) typeEl.textContent = (currentBillType || 'MAINTENANCE').toUpperCase();

      // Render Breakdown Rows
      let html = '';
      let srNo = 1;

      cols.forEach(c => {
        const val = Math.round(parseFloat(m.amounts[c]) || 0);
        const isPrincipal = (c === 'Principal');
        const readOnlyAttr = isPrincipal ? 'readonly style="background-color:#F1F5F9; color:#334155; font-weight:bold; text-align:right;"' : 'style="text-align:right; font-weight:bold;"';

        html += `
          <tr style="border-bottom:1px solid #E2E8F0;">
            <td style="text-align:center; padding:6px 10px; font-weight:600; color:#64748B; border-right:1px solid #E2E8F0;">${srNo++}</td>
            <td style="text-align:left; padding:6px 10px; font-weight:700; color:#1E293B; border-right:1px solid #E2E8F0; text-transform:uppercase;">${c}</td>
            <td style="padding:4px 10px; text-align:right;">
              <input type="number" step="1" class="classic-erp-input imb-col-input" data-col="${c}" id="imb-col-${c.replace(/\s+/g, '-').replace(/\./g, '')}" value="${val}" ${readOnlyAttr} oninput="BM.recalcImbTotal()" onfocus="this.select()" style="width:120px; text-align:right; font-weight:bold; height:28px; padding:2px 8px;">
            </td>
          </tr>
        `;
      });

      if (tbody) tbody.innerHTML = html;
      BM.recalcImbTotal();

      const overlay = document.getElementById('bm-individual-bill-overlay');
      if (overlay) overlay.classList.add('active');
    },

    recalcImbTotal: function () {
      if (currentDetailMemberIdx < 0 || !members[currentDetailMemberIdx]) return;

      const inputs = document.querySelectorAll('.imb-col-input');
      const tempAmounts = {};

      inputs.forEach(inp => {
        const col = inp.getAttribute('data-col');
        if (col && col !== 'Principal') {
          tempAmounts[col] = Math.round(parseFloat(inp.value) || 0);
        }
      });

      // Recalculate Principal
      const baseHeads = cols.filter(c => c !== 'Principal' && c !== 'Interest' && c !== 'CGST' && c !== 'SGST');
      let principalVal = 0;
      baseHeads.forEach(bh => principalVal += Math.round(parseFloat(tempAmounts[bh]) || 0));

      const principalInp = document.getElementById('imb-col-Principal');
      if (principalInp) principalInp.value = principalVal;

      const isGstEnabled = getIsGstEnabled();
      const interestVal = Math.round(parseFloat(tempAmounts['Interest']) || 0);
      const cgstVal = isGstEnabled ? Math.round(parseFloat(tempAmounts['CGST']) || 0) : 0;
      const sgstVal = isGstEnabled ? Math.round(parseFloat(tempAmounts['SGST']) || 0) : 0;
      const grandTotal = principalVal + interestVal + cgstVal + sgstVal;

      const totalEl = document.getElementById('imb-grand-total');
      if (totalEl) totalEl.textContent = `₹ ${grandTotal}`;
    },

    saveIndividualBill: async function () {
      if (currentDetailMemberIdx < 0 || !members[currentDetailMemberIdx]) return;
      const m = members[currentDetailMemberIdx];

      const inputs = document.querySelectorAll('.imb-col-input');
      inputs.forEach(inp => {
        const col = inp.getAttribute('data-col');
        if (col && col !== 'Principal') {
          m.amounts[col] = Math.round(parseFloat(inp.value) || 0);
        }
      });

      // Recalculate Principal
      const baseHeads = cols.filter(c => c !== 'Principal' && c !== 'Interest' && c !== 'CGST' && c !== 'SGST');
      let principalVal = 0;
      baseHeads.forEach(bh => principalVal += Math.round(parseFloat(m.amounts[bh]) || 0));
      m.amounts['Principal'] = principalVal;

      hasChanges = false;
      renderMatrix();
      BM.closeIndividualBill();

      // Two-way synchronization with backend and LocalStorage
      const socId = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1';
      const typeData = billTypes[currentBillType];

      const mappedAmounts = {};
      Object.keys(m.amounts || {}).forEach(k => {
        const num = parseFloat(m.amounts[k]) || 0;
        mappedAmounts[k] = num;
        const allHeads = (typeData && Array.isArray(typeData.heads)) ? typeData.heads : [];
        const h = allHeads.find(x => (x.accName || '').toLowerCase().trim() === k.toLowerCase().trim())
               || (defaultHeads || []).find(x => (x.accName || '').toLowerCase().trim() === k.toLowerCase().trim());
        if (h && h.accCode) mappedAmounts[h.accCode] = num;
      });

      // Update LocalStorage Matrix
      try {
        const localKeys = [`jeevika_bm_matrix_${socId}_${currentBillType}`, `jeevika_bm_matrix_1_${currentBillType}`];
        localKeys.forEach(k => {
          let matrixList = [];
          try {
            const raw = localStorage.getItem(k);
            if (raw) matrixList = JSON.parse(raw);
          } catch (e) { }
          if (!Array.isArray(matrixList)) matrixList = [];

          const existingIdx = matrixList.findIndex(r => {
            const rId = r.memberId || r.MemberId || r.id || 0;
            const rMemNo = (r.memNo || r.MemNo || '').trim().toLowerCase();
            return (m.id > 0 && rId === m.id) || (m.memNo && rMemNo === String(m.memNo).trim().toLowerCase());
          });

          if (existingIdx >= 0) {
            matrixList[existingIdx].amounts = { ...matrixList[existingIdx].amounts, ...mappedAmounts };
          } else {
            matrixList.push({
              memberId: m.id,
              memNo: m.memNo,
              flatNo: m.flatNo,
              wing: m.wing,
              name: m.name,
              sqft: m.sqft,
              amounts: mappedAmounts,
              checked: !!m.checked
            });
          }
          localStorage.setItem(k, JSON.stringify(matrixList));
        });
      } catch (e) { }

      // Save via API
      try {
        const payload = [{
          memberId: m.id,
          memNo: m.memNo,
          flatNo: m.flatNo,
          wing: m.wing,
          name: m.name,
          sqft: m.sqft,
          amounts: mappedAmounts,
          checked: !!m.checked
        }];

        const currentTypeId = typeData ? (typeData.id || 0) : 0;
        await fetch(`${bmApiBase()}/api/billing-master?billTypeId=${currentTypeId}&billType=${encodeURIComponent(currentBillType)}&societyId=${socId}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });

        toast(`Bill updated for ${m.name} successfully!`, true);
      } catch (e) {
        toast(`Saved locally for ${m.name}`, true);
      }
    },

    closeIndividualBill: function () {
      const overlay = document.getElementById('bm-individual-bill-overlay');
      if (overlay) overlay.classList.remove('active');
    },

    exit: function () {
      if (typeof window.WorkspaceBridge !== 'undefined') {
        window.WorkspaceBridge.closeTab('billing-master');
      }
    }
  };

  let resizeThEl = null;
  let resizeStartWidth = 0;
  let resizeStartX = 0;

  BM.initColResize = function () {
    const table = document.getElementById('bm-table');
    if (!table) return;

    table.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('bm-resizer')) {
        e.preventDefault();
        resizeThEl = e.target.parentElement;
        resizeStartWidth = resizeThEl.offsetWidth;
        resizeStartX = e.clientX;

        window.addEventListener('mousemove', BM.onColResize);
        window.addEventListener('mouseup', BM.stopColResize);
      }
    });
  };

  BM.onColResize = function (e) {
    if (!resizeThEl) return;
    const deltaX = e.clientX - resizeStartX;
    const newWidth = Math.max(30, resizeStartWidth + deltaX);
    resizeThEl.style.width = newWidth + 'px';

    const colKey = resizeThEl.getAttribute('data-col-key');
    if (colKey) {
      colWidths[colKey] = newWidth;
    }
  };

  BM.stopColResize = function () {
    resizeThEl = null;
    window.removeEventListener('mousemove', BM.onColResize);
    window.removeEventListener('mouseup', BM.stopColResize);
    localStorage.setItem('jeevika_bm_col_widths', JSON.stringify(colWidths));
  };

  window.addEventListener('storage', (e) => {
    if (e.key && (e.key.startsWith('jeevika_bill_types') || e.key.startsWith('activeSociety'))) {
      loadMatrixData(true);
    }
  });

  window.addEventListener('focus', () => {
    loadMatrixData(true);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadMatrixData();
      BM.loadToggles();
      BM.initColResize();
      BM.setupImportDragDrop();
    });
  } else {
    loadMatrixData();
    BM.loadToggles();
    BM.initColResize();
    BM.setupImportDragDrop();
  }

})();
