// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Import Master Data Logic
// ═══════════════════════════════════════════════════════════

let rawFileData = [];
let validatedRows = [];

function onImportTypeChange() {
  resetImport();
}

function resetImport() {
  document.getElementById('fileInput').value = '';
  rawFileData = [];
  validatedRows = [];
  document.getElementById('metricTotal').textContent = '0';
  document.getElementById('metricValid').textContent = '0';
  document.getElementById('metricInvalid').textContent = '0';
  document.getElementById('recordCount').textContent = 'Ready to import';
  const btn = document.getElementById('btnExecuteImport');
  if (btn) btn.style.display = 'none';
  renderImportTable();
}

function handleFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!json || json.length === 0) {
        showToast('The uploaded file contains no data rows.', 'warning');
        return;
      }

      rawFileData = json;
      validateAndProcessRows();
    } catch (err) {
      console.error('File parsing error:', err);
      showToast('Error reading Excel/CSV file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function validateAndProcessRows() {
  const type = document.getElementById('importType').value;
  validatedRows = [];

  let validCount = 0;
  let invalidCount = 0;

  rawFileData.forEach((row, idx) => {
    let pk = '', name = '', sub = '', details = '', status = 'VALID', feedback = 'Ready for import';

    // Normalize keys
    const getVal = (keys) => {
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase().replace(/[\s_-]/g, ''));
        if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
          return String(row[found]).trim();
        }
      }
      return '';
    };

    if (type === 'MemberMaster') {
      pk = getVal(['FlatNo', 'Flat', 'UnitNo', 'Unit']);
      name = getVal(['MemName', 'MemberName', 'Name', 'Owner']);
      sub = getVal(['Wing', 'Block', 'Building']) || 'General';
      const contact = getVal(['ContactNo', 'Mobile', 'Phone']);
      const share = getVal(['Shares', 'ShareCertNo']);
      const dues = getVal(['OpPrincipal', 'Principal', 'OpeningDues']);

      details = `Contact: ${contact || '—'} | Dues: ₹${dues || '0.00'} | Shares: ${share || '—'}`;

      if (!pk) {
        status = 'ERROR';
        feedback = 'Missing required Flat / Unit No';
        invalidCount++;
      } else if (!name) {
        status = 'ERROR';
        feedback = 'Missing required Member Name';
        invalidCount++;
      } else {
        validCount++;
      }

      validatedRows.push({
        rowIdx: idx + 1,
        status,
        pk,
        name,
        sub,
        details,
        feedback,
        raw: {
          FlatNo: pk,
          MemName: name,
          Wing: sub,
          ContactNo: contact,
          OpPrincipal: parseFloat(dues) || 0,
          Shares: parseInt(share, 10) || 5
        }
      });
    } else if (type === 'AccountMaster') {
      pk = getVal(['AccCode', 'Code', 'AccountCode']);
      name = getVal(['AccName', 'AccountName', 'Name', 'Ledger']);
      sub = getVal(['GroupName', 'Group', 'GrpName']) || 'Sundry';
      const opBal = getVal(['OpBal', 'OpeningBalance', 'Amount']) || '0';
      const drcr = getVal(['DrCr', 'Type']) || 'Dr';

      details = `Group: ${sub} | OpBal: ₹${opBal} ${drcr}`;

      if (!name) {
        status = 'ERROR';
        feedback = 'Missing required Account / Ledger Name';
        invalidCount++;
      } else {
        validCount++;
      }

      validatedRows.push({
        rowIdx: idx + 1,
        status,
        pk: pk || `ACC-${idx + 1}`,
        name,
        sub,
        details,
        feedback,
        raw: {
          AccCode: pk || `ACC-${idx + 1}`,
          AccName: name,
          GroupName: sub,
          OpBal: parseFloat(opBal) || 0,
          OpDrCr: drcr
        }
      });
    } else if (type === 'GroupMaster') {
      pk = getVal(['GrpCode', 'Code']);
      name = getVal(['GrpName', 'GroupName', 'Name']);
      const mainId = getVal(['GrpMainId', 'Type', 'Category']) || '1';
      const mainMap = { '1': 'Asset', '2': 'Liability', '3': 'Income', '4': 'Expense' };
      sub = mainMap[mainId] || 'Asset';
      details = `Main Nature: ${sub} (ID: ${mainId})`;

      if (!name) {
        status = 'ERROR';
        feedback = 'Missing required Group Name';
        invalidCount++;
      } else {
        validCount++;
      }

      validatedRows.push({
        rowIdx: idx + 1,
        status,
        pk: pk || `GRP-${idx + 1}`,
        name,
        sub,
        details,
        feedback,
        raw: {
          GrpCode: pk || `GRP-${idx + 1}`,
          GrpName: name,
          GrpMainId: parseInt(mainId, 10) || 1
        }
      });
    } else if (type === 'OpeningBalance') {
      pk = getVal(['AccCode', 'Code']);
      name = getVal(['AccName', 'AccountName', 'Name']);
      const bal = getVal(['OpBal', 'Balance', 'Amount', 'OpenBal']) || '0';
      const drcr = getVal(['DrCr', 'Type']) || 'Dr';
      sub = drcr;
      details = `Opening Balance: ₹${bal} ${drcr}`;

      if (!name && !pk) {
        status = 'ERROR';
        feedback = 'Must specify either Account Code or Account Name';
        invalidCount++;
      } else {
        validCount++;
      }

      validatedRows.push({
        rowIdx: idx + 1,
        status,
        pk: pk || '—',
        name: name || pk,
        sub,
        details,
        feedback,
        raw: {
          AccCode: pk,
          AccName: name,
          OpenBal: parseFloat(bal) || 0,
          DrCr: drcr
        }
      });
    }
  });

  document.getElementById('metricTotal').textContent = `${validatedRows.length}`;
  document.getElementById('metricValid').textContent = `${validCount}`;
  document.getElementById('metricInvalid').textContent = `${invalidCount}`;
  document.getElementById('recordCount').textContent = `Showing ${validatedRows.length} parsed row(s)`;

  const btn = document.getElementById('btnExecuteImport');
  if (btn) btn.style.display = validCount > 0 ? 'inline-flex' : 'none';

  renderImportTable();
}

function renderImportTable() {
  const tbody = document.getElementById('importTableBody');
  if (!validatedRows || validatedRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Select an import category and upload an Excel or CSV file to validate and preview records.</td></tr>';
    return;
  }

  let html = '';
  validatedRows.forEach(r => {
    html += `
      <tr>
        <td class="td-center font-bold">${r.rowIdx}</td>
        <td class="td-center"><span class="status-badge ${r.status}">${r.status}</span></td>
        <td><code>${escapeHtml(r.pk)}</code></td>
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td><span class="badge-vtype Journal">${escapeHtml(r.sub)}</span></td>
        <td class="text-muted">${escapeHtml(r.details)}</td>
        <td class="${r.status === 'ERROR' ? 'text-danger font-bold' : 'text-success'}">${escapeHtml(r.feedback)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function downloadTemplate() {
  const type = document.getElementById('importType').value;
  let sampleData = [];
  let filename = 'template.xlsx';

  if (type === 'MemberMaster') {
    filename = 'Member_Master_Template.xlsx';
    sampleData = [
      { FlatNo: 'A-101', MemName: 'Shri Rajesh Sharma', Wing: 'A', ContactNo: '9876543210', OpPrincipal: 0, Shares: 5 },
      { FlatNo: 'A-102', MemName: 'Smt. Priya Patil', Wing: 'A', ContactNo: '9876543211', OpPrincipal: 1500, Shares: 5 }
    ];
  } else if (type === 'AccountMaster') {
    filename = 'Account_Master_Template.xlsx';
    sampleData = [
      { AccCode: 'EXP-5001', AccName: 'Lift Maintenance Charges', GroupName: 'Repairs & Maintenance', OpBal: 0, DrCr: 'Dr' },
      { AccCode: 'BNK-1001', AccName: 'SBI Current Account 12345', GroupName: 'Bank Accounts', OpBal: 50000, DrCr: 'Dr' }
    ];
  } else if (type === 'GroupMaster') {
    filename = 'Group_Master_Template.xlsx';
    sampleData = [
      { GrpCode: 'GRP-101', GrpName: 'Security & Housekeeping', GrpMainId: 4 },
      { GrpCode: 'GRP-102', GrpName: 'Fixed Deposits in Bank', GrpMainId: 1 }
    ];
  } else if (type === 'OpeningBalance') {
    filename = 'Opening_Balance_Template.xlsx';
    sampleData = [
      { AccCode: 'EXP-5001', AccName: 'Lift Maintenance Charges', OpenBal: 0, DrCr: 'Dr' },
      { AccCode: 'BNK-1001', AccName: 'SBI Current Account 12345', OpenBal: 50000, DrCr: 'Dr' }
    ];
  }

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, filename);
}

async function confirmExecuteImport() {
  const validItems = validatedRows.filter(r => r.status === 'VALID');
  if (!validItems || validItems.length === 0) {
    showToast('No valid rows available to import.', 'warning');
    return;
  }

  const sid = Auth.getSocietyId();
  const fyId = Auth.getFYId();
  const type = document.getElementById('importType').value;
  const dupMode = document.getElementById('duplicateMode').value;

  const ok = confirm(`CONFIRMATION: Import ${validItems.length} valid rows into ${type}?\nDuplicate handling mode: ${dupMode}.\n\nProceed?`);
  if (!ok) return;

  const btn = document.getElementById('btnExecuteImport');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner small"></div> Importing...';

  try {
    const payload = {
      societyId: sid,
      fyId: fyId || 0,
      importType: type,
      duplicateMode: dupMode,
      items: validItems.map(v => v.raw)
    };

    const res = await API.post('utility/import/execute', payload);
    if (res && res.success) {
      showToast(res.message || 'Data imported successfully!', 'success');
      alert(`✅ Success: ${res.message}\nImported: ${res.importedCount || validItems.length} rows.`);
      resetImport();
    } else {
      showToast(res.message || 'Import failed.', 'error');
      alert(`❌ Import Error: ${res.message}`);
    }
  } catch (err) {
    console.error('Execute import error:', err);
    showToast('Error during import: ' + err.message, 'error');
    alert('❌ Exception: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Execute Import';
  }
}
