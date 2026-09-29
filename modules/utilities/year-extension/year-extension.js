// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Year Extension Logic
// ═══════════════════════════════════════════════════════════

let currentFYInfo = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadYearExtensionInfo();
});

async function loadYearExtensionInfo() {
  try {
    const sid = Auth.getSocietyId();
    const fyId = Auth.getFYId();
    const res = await API.get(`utility/year-extension/info?societyId=${sid}&fyId=${fyId || 0}`);
    if (res && res.success) {
      currentFYInfo = res.data;
      renderFYInfo();
    } else {
      showToast('Failed to load FY info.', 'error');
    }
  } catch (err) {
    console.error('FY info load error:', err);
    showToast(err.message || 'Error loading financial year info.', 'error');
  }
}

function renderFYInfo() {
  if (!currentFYInfo) return;

  document.getElementById('metricFYLabel').textContent = currentFYInfo.fyLabel;
  document.getElementById('metricCurrentEnd').textContent = formatDate(currentFYInfo.fyEnd);

  document.getElementById('dispStartDate').textContent = formatDate(currentFYInfo.fyStart);
  document.getElementById('dispCurrentEndDate').textContent = formatDate(currentFYInfo.fyEnd);

  if (!document.getElementById('newEndDate').value) {
    document.getElementById('newEndDate').value = currentFYInfo.fyEnd;
  }
}

async function confirmExecuteYearExtension() {
  if (!currentFYInfo) return;

  const newEnd = document.getElementById('newEndDate').value;
  const reason = document.getElementById('extensionReason').value.trim();
  const adminKey = document.getElementById('adminKey').value.trim();

  if (!newEnd) {
    showToast('Please select a new end date.', 'warning');
    return;
  }
  if (!adminKey) {
    showToast('Administrator security key is required.', 'warning');
    document.getElementById('adminKey').focus();
    return;
  }

  const ok = confirm(
    'ADMINISTRATIVE YEAR EXTENSION:\n\n' +
    `Current End Date: ${formatDate(currentFYInfo.fyEnd)}\n` +
    `New Extended Date: ${formatDate(newEnd)}\n` +
    `Reason: ${reason || 'Statutory Audit Extension'}\n\n` +
    'Do you authorize this operating period change?'
  );

  if (!ok) return;

  const btn = document.getElementById('btnExtendYear');
  btn.disabled = true;
  btn.innerHTML = '<div class="erp-spinner small"></div> Extending...';

  try {
    const payload = {
      societyId: currentFYInfo.societyId,
      fyId: currentFYInfo.fyId,
      newFYEnd: newEnd,
      adminKey: adminKey,
      reason: reason
    };

    const res = await API.post('utility/year-extension/extend', payload);
    if (res && res.success) {
      showToast(res.message || 'Financial year extended successfully!', 'success');
      alert(`✅ Success: ${res.message}`);
      await loadYearExtensionInfo();
    } else {
      showToast(res.message || 'Year extension failed.', 'error');
      alert(`❌ Error: ${res.message}`);
    }
  } catch (err) {
    console.error('Execute extension error:', err);
    showToast('Error extending year: ' + err.message, 'error');
    alert('❌ Exception: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check2-circle"></i> Save Extension';
  }
}
