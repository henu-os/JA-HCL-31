// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — HENU DB UNIVERSAL Client Module
// Financial-Year-Aware Universal Export & Import Engine
// ═══════════════════════════════════════════════════════════

const HenuDbUniversal = (() => {
  let loadedPackage = null;
  let availableSocieties = [];
  let availableFYs = [];

  function getApiClient() {
    return (typeof window !== 'undefined' && (window.API || window.Api)) || (typeof API !== 'undefined' ? API : (typeof Api !== 'undefined' ? Api : null));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('packageFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', handleFileSelect);
    }
    loadSocietiesAndFYs();
  });

  async function loadSocietiesAndFYs() {
    try {
      const api = getApiClient();
      if (!api) return;
      const resp = await api.get('/api/societies');
      if (resp && resp.data) {
        availableSocieties = resp.data;
        renderSocietyCheckboxes();
      }

      // Load FYs for all available societies
      availableFYs = [];
      for (const soc of availableSocieties) {
        try {
          const sId = soc.societyId || soc.SocietyId;
          const fyResp = await api.get(`/api/financial-years?societyId=${sId}`);
          if (fyResp && fyResp.data) {
            fyResp.data.forEach(fy => {
              availableFYs.push({
                ...fy,
                societyName: soc.societyName || soc.SocietyName,
                societyCode: soc.societyCode || soc.SocietyCode
              });
            });
          }
        } catch (_) {}
      }
      renderFYCheckboxes();
    } catch (e) {
      console.warn('Could not preload societies and FYs:', e);
    }
  }

  function renderSocietyCheckboxes() {
    const container = document.getElementById('societyCheckboxList');
    if (!container) return;
    if (availableSocieties.length === 0) {
      container.innerHTML = '<div style="font-size:12px; color:#64748b; padding:4px;">No societies found.</div>';
      return;
    }
    container.innerHTML = availableSocieties.map(soc => `
      <label style="font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #334155;">
        <input type="checkbox" class="soc-export-cb" value="${soc.societyId || soc.SocietyId}" checked onchange="HenuDbUniversal.onSocietySelectionChanged()">
        <span><strong>[ID: ${soc.societyId || soc.SocietyId}]</strong> ${soc.societyName || soc.SocietyName || 'Society'} (${soc.societyCode || soc.SocietyCode || 'SOC'})</span>
      </label>
    `).join('');
    updateExportSummary();
  }

  function renderFYCheckboxes() {
    const container = document.getElementById('fyCheckboxList');
    if (!container) return;
    if (availableFYs.length === 0) {
      container.innerHTML = '<div style="font-size:12px; color:#64748b; padding:4px;">No financial years found in database.</div>';
      return;
    }

    // Filter FYs based on currently selected societies if SELECT_SOCIETIES is active
    const scope = document.getElementById('exportScopeSelect').value;
    let targetSocIds = [];
    if (scope === 'SELECT_SOCIETIES') {
      targetSocIds = Array.from(document.querySelectorAll('.soc-export-cb:checked')).map(cb => String(cb.value));
    } else if (scope === 'CURRENT_SOCIETY') {
      const activeSocId = String((window.Auth && typeof Auth.getSocietyId === 'function') ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1'));
      targetSocIds = [activeSocId];
    }

    const filtered = (targetSocIds.length > 0)
      ? availableFYs.filter(f => targetSocIds.includes(String(f.societyId || f.SocietyId)))
      : availableFYs;

    if (filtered.length === 0) {
      container.innerHTML = '<div style="font-size:12px; color:#64748b; padding:4px;">No financial years available for selected societies.</div>';
      return;
    }

    container.innerHTML = filtered.map(fy => `
      <label style="font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #334155;">
        <input type="checkbox" class="fy-export-cb" value="${fy.fYId || fy.FYId}" checked onchange="HenuDbUniversal.updateExportSummary()">
        <span><strong>${fy.fYLabel || fy.FYLabel}</strong> — [${fy.societyName || 'Soc'} (${fy.fYStart} to ${fy.fYEnd})]</span>
      </label>
    `).join('');
    updateExportSummary();
  }

  function onSocietySelectionChanged() {
    renderFYCheckboxes();
    updateExportSummary();
  }

  function onExportScopeChange() {
    const scope = document.getElementById('exportScopeSelect').value;
    const socContainer = document.getElementById('selectSocietiesContainer');
    if (socContainer) {
      socContainer.style.display = (scope === 'SELECT_SOCIETIES') ? 'block' : 'none';
    }
    renderFYCheckboxes();
    updateExportSummary();
  }

  function onExportFyScopeChange() {
    const fyScope = document.getElementById('exportFyScopeSelect').value;
    const fyContainer = document.getElementById('selectFyContainer');
    if (fyContainer) {
      fyContainer.style.display = (fyScope === 'SELECT_FYS') ? 'block' : 'none';
    }
    renderFYCheckboxes();
    updateExportSummary();
  }

  function toggleSelectAllSocieties(selectAll) {
    const checkboxes = document.querySelectorAll('.soc-export-cb');
    checkboxes.forEach(cb => cb.checked = selectAll);
    onSocietySelectionChanged();
  }

  function toggleSelectAllFys(selectAll) {
    const checkboxes = document.querySelectorAll('.fy-export-cb');
    checkboxes.forEach(cb => cb.checked = selectAll);
    updateExportSummary();
  }

  function updateExportSummary() {
    const box = document.getElementById('exportSummaryBox');
    if (!box) return;
    const scope = document.getElementById('exportScopeSelect').value;
    const fyScope = document.getElementById('exportFyScopeSelect').value;

    let socText = '';
    if (scope === 'FULL') {
      socText = 'Full Database — All Societies';
    } else if (scope === 'CURRENT_SOCIETY') {
      const activeSocId = (window.Auth && typeof Auth.getSocietyId === 'function') ? Auth.getSocietyId() : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '1');
      const socObj = availableSocieties.find(s => String(s.societyId || s.SocietyId) === String(activeSocId));
      socText = `Current Society (${socObj ? (socObj.societyName || socObj.SocietyName) : `ID #${activeSocId}`})`;
    } else if (scope === 'SELECT_SOCIETIES') {
      const selected = Array.from(document.querySelectorAll('.soc-export-cb:checked')).map(cb => cb.value);
      socText = `Selected Societies (${selected.length} of ${availableSocieties.length} selected: [${selected.join(', ') || 'None'}])`;
    }

    let fyText = '';
    if (fyScope === 'ALL_FYS') {
      fyText = 'All Financial Years';
    } else if (fyScope === 'CURRENT_FY') {
      const activeFYLabel = (window.Auth && typeof Auth.getFYLabel === 'function') ? Auth.getFYLabel() : (sessionStorage.getItem('activeFYLabel') || localStorage.getItem('activeFYLabel') || 'Current FY');
      fyText = `Current Financial Year (${activeFYLabel})`;
    } else if (fyScope === 'SELECT_FYS') {
      const selectedFys = Array.from(document.querySelectorAll('.fy-export-cb:checked')).map(cb => cb.value);
      fyText = `Selected Financial Years (${selectedFys.length} selected: [${selectedFys.join(', ') || 'None'}])`;
    }

    box.innerHTML = `<strong>Society Scope:</strong> ${socText}<br><strong>Financial Year Scope:</strong> ${fyText}<br><strong>Includes:</strong> Associated groups, accounts, members, bills, and balanced vouchers strictly filtered by selected criteria.`;
  }

  function onImportFyScopeChange() {
    const fyScope = document.getElementById('importFyScopeSelect').value;
    const container = document.getElementById('importFyContainer');
    if (container) {
      container.style.display = (fyScope === 'SELECT_FYS') ? 'block' : 'none';
    }
  }

  function toggleSelectAllImportFys(selectAll) {
    const checkboxes = document.querySelectorAll('.pkg-fy-import-cb');
    checkboxes.forEach(cb => cb.checked = selectAll);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        loadedPackage = JSON.parse(event.target.result);
        renderMetadata(loadedPackage);
        renderImportFYCheckboxes(loadedPackage);
        document.getElementById('btnExecuteMerge').disabled = false;
      } catch (err) {
        alert('Invalid JSON package file: ' + err.message);
        loadedPackage = null;
        document.getElementById('btnExecuteMerge').disabled = true;
      }
    };
    reader.readAsText(file);
  }

  function renderImportFYCheckboxes(pkg) {
    const container = document.getElementById('importFyCheckboxList');
    if (!container || !pkg || !pkg.data) return;

    const fys = pkg.data.financialYear || pkg.data.FinancialYear || [];
    if (!Array.isArray(fys) || fys.length === 0) {
      container.innerHTML = '<div style="font-size:12px; color:#64748b; padding:4px;">No financial years present in this package.</div>';
      return;
    }

    container.innerHTML = fys.map(fy => {
      const fyId = fy.fYId ?? fy.FYId ?? fy.fyId ?? '';
      const fyLabel = fy.fYLabel ?? fy.FYLabel ?? fy.fyLabel ?? 'FY';
      const socId = fy.societyId ?? fy.SocietyId ?? fy.societyID ?? '1';
      const start = fy.fYStart ?? fy.FYStart ?? fy.fyStart ?? '—';
      const end = fy.fYEnd ?? fy.FYEnd ?? fy.fyEnd ?? '—';
      return `
      <label style="font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #334155;">
        <input type="checkbox" class="pkg-fy-import-cb" value="${fyId}" checked>
        <span><strong>${fyLabel}</strong> (Soc ID: ${socId}, Period: ${start} to ${end})</span>
      </label>
      `;
    }).join('');
  }

  function renderMetadata(pkg) {
    const box = document.getElementById('metadataBox');
    if (!pkg || !pkg.metadata) {
      box.textContent = 'Invalid package structure.';
      return;
    }
    const meta = pkg.metadata;
    const socCount = (pkg.data && pkg.data.societyInfo) ? pkg.data.societyInfo.length : 0;
    const fyCount = (pkg.data && pkg.data.financialYear) ? pkg.data.financialYear.length : 0;

    const lines = [
      `Format Version : ${meta.formatVersion || meta.FormatVersion || '1.0.0'}`,
      `App Version    : ${meta.appVersion || meta.AppVersion || '2.0.0'}`,
      `Scope          : ${meta.scope || meta.Scope || 'FULL'}`,
      `FY Scope       : ${meta.financialYearScope || meta.FinancialYearScope || 'ALL_FYS'}`,
      `Societies In Pkg: ${socCount}`,
      `Financial Years: ${fyCount}`,
      `Provider       : ${meta.sourceProvider || meta.SourceProvider || 'PostgreSQL'}`,
      `Timestamp      : ${meta.exportTimestampUtc || meta.ExportTimestampUtc || 'N/A'}`,
      `SHA256 Checksum: ${meta.checksumSha256 || meta.ChecksumSha256 || 'None'}`,
      `Record Counts  : ${JSON.stringify(meta.recordCounts || meta.RecordCounts || {}, null, 2)}`
    ];
    box.textContent = lines.join('\n');
  }

  async function previewPackage() {
    if (!loadedPackage) {
      alert('Please select an export package file (.json) first.');
      return;
    }

    const api = getApiClient();
    if (!api) {
      alert('API client not available. Please ensure api.js is loaded.');
      return;
    }

    const mode = document.getElementById('importModeSelect').value;
    const policy = document.getElementById('conflictPolicySelect').value;
    const fyScope = document.getElementById('importFyScopeSelect').value;

    let selectedFYIds = null;
    if (fyScope === 'SELECT_FYS') {
      selectedFYIds = Array.from(document.querySelectorAll('.pkg-fy-import-cb:checked'))
        .map(cb => parseInt(cb.value, 10))
        .filter(n => !isNaN(n));
      if (selectedFYIds.length === 0) {
        alert('Please select at least one financial year to import.');
        return;
      }
    }

    const activeFYId = (window.Auth && typeof Auth.getFYId === 'function') 
      ? Auth.getFYId() 
      : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || null);

    const reqPayload = {
      package: loadedPackage,
      importMode: "VALIDATE_ONLY",
      conflictPolicy: policy,
      financialYearScope: fyScope,
      targetCurrentFYId: activeFYId ? parseInt(activeFYId, 10) : null,
      selectedFinancialYearIds: selectedFYIds,
      sourceNodeId: "DESKTOP-UI"
    };

    try {
      const resp = await api.post('/api/data-transfer/import/preview', reqPayload);
      if (resp && resp.report) {
        renderReport(resp.report, true);
      } else {
        alert('Preview failed: ' + (resp?.message || 'Unknown error'));
      }
    } catch (err) {
      if (err.data && err.data.report) {
        renderReport(err.data.report, true);
      }
      alert('Error during preview: ' + err.message);
    }
  }

  async function executeMerge() {
    if (!loadedPackage) {
      alert('Please select an export package file (.json) first.');
      return;
    }

    const api = getApiClient();
    if (!api) {
      alert('API client not available. Please ensure api.js is loaded.');
      return;
    }

    const mode = document.getElementById('importModeSelect').value;
    const policy = document.getElementById('conflictPolicySelect').value;
    const fyScope = document.getElementById('importFyScopeSelect').value;

    let selectedFYIds = null;
    if (fyScope === 'SELECT_FYS') {
      selectedFYIds = Array.from(document.querySelectorAll('.pkg-fy-import-cb:checked'))
        .map(cb => parseInt(cb.value, 10))
        .filter(n => !isNaN(n));
      if (selectedFYIds.length === 0) {
        alert('Please select at least one financial year to import.');
        return;
      }
    }

    const activeFYId = (window.Auth && typeof Auth.getFYId === 'function') 
      ? Auth.getFYId() 
      : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || null);

    if (!confirm(`Are you sure you want to execute Universal Database Merge with Mode='${mode}', Policy='${policy}', and FY Scope='${fyScope}'?`)) {
      return;
    }

    const reqPayload = {
      package: loadedPackage,
      importMode: mode,
      conflictPolicy: policy,
      financialYearScope: fyScope,
      targetCurrentFYId: activeFYId ? parseInt(activeFYId, 10) : null,
      selectedFinancialYearIds: selectedFYIds,
      sourceNodeId: "DESKTOP-UI"
    };

    try {
      const resp = await api.post('/api/data-transfer/import/execute', reqPayload);
      if (resp && resp.report) {
        renderReport(resp.report, false);
        if (resp.report.success) {
          alert('Universal Database Merge completed successfully!');
        } else {
          alert('Universal Database Merge failed or rolled back: ' + resp.report.statusMessage);
        }
      } else {
        alert('Execution failed: ' + (resp?.message || 'Unknown error'));
      }
    } catch (err) {
      if (err.data && err.data.report) {
        renderReport(err.data.report, false);
      }
      alert('Error during merge execution: ' + err.message);
    }
  }

  function renderReport(report, isPreview) {
    const sec = document.getElementById('reportSection');
    sec.style.display = 'block';

    const badge = document.getElementById('reportStatusBadge');
    badge.className = 'stat-badge ' + (report.success ? 'badge-success' : 'badge-danger');
    badge.textContent = isPreview ? 'PREVIEW VALIDATION' : (report.success ? 'SUCCESS (COMMITTED)' : 'FAILED (ROLLED BACK)');

    const summary = document.getElementById('reportSummaryCards');
    summary.innerHTML = `
      <div style="background:#f8fafc; padding:12px; border:1px solid #cbd5e1; border-radius:6px;">
        <div style="font-size:11px; color:#64748b; font-weight:700;">RECORDS ADDED</div>
        <div style="font-size:22px; font-weight:800; color:#15803d;">${report.recordsAdded || 0}</div>
      </div>
      <div style="background:#f8fafc; padding:12px; border:1px solid #cbd5e1; border-radius:6px;">
        <div style="font-size:11px; color:#64748b; font-weight:700;">RECORDS MATCHED</div>
        <div style="font-size:22px; font-weight:800; color:#0369a1;">${report.recordsMatched || 0}</div>
      </div>
      <div style="background:#f8fafc; padding:12px; border:1px solid #cbd5e1; border-radius:6px;">
        <div style="font-size:11px; color:#64748b; font-weight:700;">CONFLICTS / REJECTED</div>
        <div style="font-size:22px; font-weight:800; color:#b91c1c;">${(report.recordsConflicted || 0) + (report.recordsRejected || 0)}</div>
      </div>
    `;

    const details = document.getElementById('reportDetails');
    let html = `<p style="font-size:12.5px; font-weight:700; margin:10px 0 6px 0;">${report.statusMessage}</p>`;
    
    if (report.validationErrors && report.validationErrors.length > 0) {
      html += `<div style="background:#fee2e2; border:1px solid #fca5a5; padding:10px; border-radius:6px; color:#b91c1c; font-size:12px; margin-top:10px;">
        <strong>Validation Errors:</strong>
        <ul style="margin:4px 0 0 16px; padding:0;">
          ${report.validationErrors.map(e => `<li>${e}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (report.idMappings && Object.keys(report.idMappings).length > 0) {
      html += `<div style="margin-top:14px;">
        <strong style="font-size:12px; color:#334155;">Source-to-Target ID Remappings:</strong>
        <pre style="background:#f1f5f9; padding:8px; border-radius:4px; font-size:11px; max-height:140px; overflow-y:auto;">${JSON.stringify(report.idMappings, null, 2)}</pre>
      </div>`;
    }

    details.innerHTML = html;
  }

  async function generateExport() {
    const api = getApiClient();
    if (!api) {
      alert('Export failed: API client not available.');
      return;
    }

    const scope = document.getElementById('exportScopeSelect').value;
    const fyScope = document.getElementById('exportFyScopeSelect').value;

    const socId = (window.Auth && typeof Auth.getSocietyId === 'function') 
      ? Auth.getSocietyId() 
      : (sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || null);

    const fyId = (window.Auth && typeof Auth.getFYId === 'function') 
      ? Auth.getFYId() 
      : (sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || null);

    let selectedSocietyIds = null;
    if (scope === 'SELECT_SOCIETIES') {
      const selected = Array.from(document.querySelectorAll('.soc-export-cb:checked')).map(cb => parseInt(cb.value, 10)).filter(n => !isNaN(n));
      if (selected.length === 0) {
        alert('Please select at least one society to export.');
        return;
      }
      selectedSocietyIds = selected;
    }

    let selectedFinancialYearIds = null;
    if (fyScope === 'SELECT_FYS') {
      const selectedFys = Array.from(document.querySelectorAll('.fy-export-cb:checked')).map(cb => parseInt(cb.value, 10)).filter(n => !isNaN(n));
      if (selectedFys.length === 0) {
        alert('Please select at least one financial year to export.');
        return;
      }
      selectedFinancialYearIds = selectedFys;
    }

    try {
      const payload = {
        scope: scope,
        societyId: scope === 'CURRENT_SOCIETY' ? (socId ? parseInt(socId, 10) : 1) : null,
        selectedSocietyIds: selectedSocietyIds,
        financialYearScope: fyScope,
        financialYearId: fyScope === 'CURRENT_FY' ? (fyId ? parseInt(fyId, 10) : 1) : null,
        selectedFinancialYearIds: selectedFinancialYearIds
      };

      const resp = await api.post('/api/data-transfer/export', payload);

      if (resp && resp.data) {
        const pkgStr = JSON.stringify(resp, null, 2);
        const blob = new Blob([pkgStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jeevika_erp_universal_export_${scope.toLowerCase()}_${fyScope.toLowerCase()}_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert('Export failed: ' + (resp?.message || 'Unknown error'));
      }
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  }

  return {
    previewPackage,
    executeMerge,
    generateExport,
    onExportScopeChange,
    onExportFyScopeChange,
    onSocietySelectionChanged,
    toggleSelectAllSocieties,
    toggleSelectAllFys,
    onImportFyScopeChange,
    toggleSelectAllImportFys,
    updateExportSummary
  };
})();
