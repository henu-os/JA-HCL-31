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
    const directGst = sessionStorage.getItem('activeSocietyGSTApplicable') || localStorage.getItem('activeSocietyGSTApplicable');
    if (directGst === 'N' || directGst === 'No' || directGst === 'false' || directGst === '0') return false;
    if (directGst === 'Y' || directGst === 'Yes' || directGst === 'true' || directGst === '1') return true;
    if (window._billingMasterGstOn !== undefined) {
      return !!window._billingMasterGstOn;
    }
    return false;
  }

  function updateColsForCurrentType() {
    const typeData = billTypes[currentBillType];
    const isGstEnabled = getIsGstEnabled();

    // Toggle GST CALC dropdown in toolbar based on GST status
    const gstWrap = document.getElementById('bm-gst-calc-wrap');
    if (gstWrap) {
      gstWrap.style.display = isGstEnabled ? 'inline-flex' : 'none';
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
      headHtml += `<th data-col-key="_name" style="width:${getColWidth('_name', 150)}; text-align:left;">MEMBER NAME<div class="bm-resizer"></div></th>`;
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
      let principalVal = 0;
      userHeads.forEach(bh => {
        principalVal += Math.round(parseFloat(m.amounts[bh]) || 0);
      });
      m.amounts['Principal'] = principalVal;

      cols.forEach(c => {
        const val = Math.round(parseFloat(m.amounts[c]) || 0);
        colTotals[c] += val;
      });

      const interestVal = Math.round(parseFloat(m.amounts['Interest']) || 0);
      const cgstVal = isGstEnabled ? Math.round(parseFloat(m.amounts['CGST']) || 0) : 0;
      const sgstVal = isGstEnabled ? Math.round(parseFloat(m.amounts['SGST']) || 0) : 0;
      const rowTotal = principalVal + interestVal + cgstVal + sgstVal;
      grandTotal += rowTotal;
    });

    let footHtml = '<tr style="background-color:#F5F5F5; font-weight:bold;">';
    footHtml += '<td></td>';
    footHtml += '<td style="text-align:center;">TOTAL</td>';
    footHtml += '<td></td><td></td><td></td>';

    cols.forEach((c, colIdx) => {
      footHtml += `<td style="text-align:right; font-weight:bold;" id="bm-foot-col-${colIdx}">${Math.round(colTotals[c])}</td>`;
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
      const principalVal = Math.round(parseFloat(m.amounts['Principal']) || 0);
      const interestVal = Math.round(parseFloat(m.amounts['Interest']) || 0);
      const cgstVal = isGstEnabled ? Math.round(parseFloat(m.amounts['CGST']) || 0) : 0;
      const sgstVal = isGstEnabled ? Math.round(parseFloat(m.amounts['SGST']) || 0) : 0;
      const total = principalVal + interestVal + cgstVal + sgstVal;

      let rowHtml = `<tr ${sel} onclick="BM.selectRow(${idx})">`;
      rowHtml += `<td style="text-align:center;">${multiMode ? `<input type="checkbox" ${m.checked ? 'checked' : ''} onclick="BM.checkMember(${idx}, this.checked)" style="accent-color:#1565C0;">` : ''}</td>`;
      rowHtml += `<td style="text-align:center; font-weight:600; cursor:pointer;" ondblclick="BM.openMemberDetailModal(${idx})" title="Double click to open individual member bill">${m.memNo}</td>`;
      rowHtml += `<td style="text-align:center;">${m.wing || ''}</td>`;
      rowHtml += `<td style="text-align:left; font-weight:bold; cursor:pointer;" ondblclick="BM.openMemberDetailModal(${idx})" title="Double click to open individual member bill">${m.name}</td>`;
      rowHtml += `<td style="text-align:center; font-size:11px; font-weight:600;">${m.sqft || '—'}</td>`;

      cols.forEach((c, colIdx) => {
        const val = Math.round(parseFloat(m.amounts[c]) || 0);
        const isReadOnly = (c === 'Principal') ? 'readonly style="background-color: #FAFAFA !important; font-weight: bold; color: #424242;" tabindex="-1"' : '';
        rowHtml += `<td><input type="number" step="1" class="bm-grid-input" data-row="${idx}" data-col="${colIdx}" value="${val}" ${isReadOnly} onfocus="this.select()" onclick="event.stopPropagation()" onkeydown="BM.handleGridKeydown(event)" oninput="BM.onAmtInput(${idx}, '${c}', this.value)" onchange="BM.updateAmt(${idx}, '${c}', this.value)"></td>`;
      });

      rowHtml += `<td style="font-weight:900; color:#1565C0; border-left:2px solid #E0E0E0; text-align:center;" id="bm-tot-${idx}">${Math.round(total)}</td>`;
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
    loadMatrixData,
    switchBillType: function (type) {
      currentBillType = type;
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
        const baseHeads = cols.filter(c => c !== 'Principal' && c !== 'Interest' && c !== 'CGST' && c !== 'SGST');
        let principalVal = 0;
        baseHeads.forEach(bh => principalVal += Math.round(parseFloat(m.amounts[bh]) || 0));
        m.amounts['Principal'] = principalVal;

        // Update principal cell in DOM if present
        const pColIdx = cols.indexOf('Principal');
        if (pColIdx !== -1) {
          const pInput = document.querySelector(`.bm-grid-input[data-row="${idx}"][data-col="${pColIdx}"]`);
          if (pInput && pInput.value !== String(principalVal)) pInput.value = principalVal;
        }

        cols.forEach(c => {
          const val = Math.round(parseFloat(m.amounts[c]) || 0);
          colTotals[c] += val;
        });

        const interestVal = Math.round(parseFloat(m.amounts['Interest']) || 0);
        const cgstVal = isGstEnabled ? Math.round(parseFloat(m.amounts['CGST']) || 0) : 0;
        const sgstVal = isGstEnabled ? Math.round(parseFloat(m.amounts['SGST']) || 0) : 0;
        const rowTotal = principalVal + interestVal + cgstVal + sgstVal;
        grandTotal += rowTotal;

        const totEl = document.getElementById(`bm-tot-${idx}`);
        if (totEl) totEl.textContent = Math.round(rowTotal);
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
      BM.recalcTotalsDom();
    },

    updateAmt: function (idx, col, val) {
      hasChanges = true;
      const numVal = Math.round(parseFloat(val) || 0);
      if (!members[idx].amounts) members[idx].amounts = {};
      members[idx].amounts[col] = numVal;
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
        interestMethod: 'FULL_MONTH',
        interestRate: '21%',
        interestType: 'Simple',
        grossDate: '16',
        overdueDays: 16,
        dayCountBasis: 365,
        interestPriority: 'Interest First'
      };

      // 1. Check Configuration & Notes Master (Primary Config Source)
      try {
        const savedCnm = localStorage.getItem('jeevika_config_notes_' + socId) || localStorage.getItem('jeevika_config_notes_global');
        if (savedCnm) {
          const cnm = JSON.parse(savedCnm);
          if (cnm) {
            if (cnm.interestCalcMethod) intConfig.interestMethod = cnm.interestCalcMethod;
            if (cnm.interestRate !== undefined) intConfig.interestRate = cnm.interestRate + '%';
            if (cnm.interestOverdueDays !== undefined) {
              intConfig.overdueDays = parseInt(cnm.interestOverdueDays, 10) || 16;
              intConfig.grossDate = String(intConfig.overdueDays);
            }
            if (cnm.dayCountBasis !== undefined) intConfig.dayCountBasis = parseInt(cnm.dayCountBasis, 10) || 365;
          }
        }
      } catch (e) { }

      // 2. Query database for bill type notes override if applicable
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
              if (json.notes.interestMethod && !intConfig.interestMethod) intConfig.interestMethod = json.notes.interestMethod;
              if (json.notes.interestRate && !intConfig.interestRate) intConfig.interestRate = json.notes.interestRate;
              if (json.notes.interestType) intConfig.interestType = json.notes.interestType;
              if (json.notes.grossDays) intConfig.grossDate = json.notes.grossDays;
              if (json.notes.interestPriority) intConfig.interestPriority = json.notes.interestPriority;
            }
          }
        } catch (e) { }
      }

      const isDaily = (intConfig.interestMethod === 'DAILY_PRO_RATA' || intConfig.interestMethod === 'D-DD' || intConfig.interestMethod === 'M-DDME');
      const methodName = isDaily
        ? `Method 2 – Daily / Pro-Rata Interest (${intConfig.overdueDays || 16} Days)`
        : 'Method 1 – Full Month Interest';

      let rateStr = (intConfig.interestRate || '21%').toString().trim();
      if (!rateStr.endsWith('%') && !rateStr.toLowerCase().includes('p.a.')) rateStr += '%';
      if (!rateStr.toLowerCase().includes('p.a.')) rateStr += ' p.a.';

      const grossStr = isDaily ? `${intConfig.overdueDays || 16} Days Overdue` : 'Full Month (15th Due Date)';

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

    closeInterestConfirm: function (confirmed) {
      document.getElementById('bm-interest-confirm-overlay').classList.remove('active');
      if (confirmed) {
        const cfg = BM._activeIntConfig || { interestMethod: 'FULL_MONTH', interestRate: '21%' };
        const rateNum = parseFloat((cfg.interestRate || '21').toString().replace(/[^0-9.]/g, '')) || 21;
        const isDaily = (cfg.interestMethod === 'DAILY_PRO_RATA' || cfg.interestMethod === 'D-DD' || cfg.interestMethod === 'M-DDME');
        const overdueDays = parseInt(cfg.overdueDays || cfg.grossDate, 10) || 16;
        const dayBasis = parseInt(cfg.dayCountBasis, 10) || 365;

        let count = 0;
        members.forEach(m => {
          const opPrin = parseFloat(m.Op_Prin) || 0;
          // Negative Op_Prin OR explicit 'Cr' tag means member paid in advance — skip interest
          const isCredit = (opPrin < 0) || ((m.OpDrCr || '').toUpperCase() === 'CR');

          // Only charge interest on debit (dues) balances
          const baseAmt = (!isCredit && opPrin > 0) ? opPrin : 0;

          if (baseAmt <= 0) {
            // Credit or zero balance → no interest
            m.amounts['Interest'] = 0.00;
            return;
          }

          let interest = 0;
          const annualRate = rateNum / 100;

          if (isDaily) {
            // METHOD 2: Daily / Pro-Rata Interest = (Principal * Annual Rate * Overdue Days) / 365
            interest = (baseAmt * annualRate * overdueDays) / dayBasis;
          } else {
            // METHOD 1: Full Month Interest = (Principal * Annual Rate) / 12
            interest = (baseAmt * annualRate) / 12;
          }

          m.amounts['Interest'] = Math.round(interest);
          count++;
        });

        hasChanges = true;
        renderMatrix();
        const methodDesc = isDaily ? `Method 2 (Daily/Pro-Rata ${overdueDays}d)` : 'Method 1 (Full Month)';
        toast(`Interest calculated for ${count} member(s) via ${methodDesc} @ ${rateNum}% p.a.`, true);
      }
    },

    saveToggles: async function () {
      const gstVal = document.getElementById('bm-gst-calc').value;
      try {
        await fetch(`${bmApiBase()}/api/billing-master/settings`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ billType: currentBillType, gstCalc: gstVal })
        });
        toast('GST Calculation mode updated to ' + gstVal, true);
      } catch (e) { }
    },

    loadToggles: async function () {
      try {
        const res = await fetch(`${bmApiBase()}/api/billing-master/settings?billType=${encodeURIComponent(currentBillType)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const gstEl = document.getElementById('bm-gst-calc');
            if (gstEl) gstEl.value = json.data.gstCalc || 'MANUAL';
          }
        }
      } catch (e) { }
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
        html += `<td style="font-weight:bold; color:#1565C0;">${principalVal + interestVal}</td></tr>`;
      });
      html += '</tbody></table></body></html>';
      w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 300);
    },

    importData: function () { toast('CSV Matrix Import', true); },
    exportData: function (fmt) { toast(fmt.toUpperCase() + ' Matrix Export', true); },

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
    });
  } else {
    loadMatrixData();
    BM.loadToggles();
    BM.initColResize();
  }

})();
