// Dashboard Home JS
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireContext()) return;

  document.getElementById('socName')?.textContent = Auth.getSocietyName();
  document.getElementById('fyLabel')?.textContent = Auth.getFYLabel();

  loadDashboardData();
});

async function loadDashboardData() {
  const societyId = Auth.getSocietyId();
  if (!societyId) return;

  showLoading('Loading Dashboard...');

  try {
    // 1. Fetch Society Info
    const socRes = await API.get(`/societies/${societyId}`);
    if (socRes.success && socRes.data) {
      const s = socRes.data;
      document.getElementById('infoCode').textContent = s.societyCode || '—';
      document.getElementById('infoName').textContent = s.societyName || '—';
      document.getElementById('infoReg').textContent = s.registrationNo || '—';
      document.getElementById('infoAddr').textContent = s.address || '—';
      document.getElementById('infoCity').textContent = (s.city || '') + (s.pincode ? ' - ' + s.pincode : '');
      document.getElementById('infoTax').textContent = (s.pANNumber || '—') + ' / ' + (s.gSTNumber || '—');
      document.getElementById('infoBank').textContent = (s.bankName || '—') + ' (' + (s.bankAccountNo || '—') + ')';
    }

    // 2. Counts
    const [memRes, accRes, venRes, stfRes] = await Promise.allSettled([
      API.get(`/members?societyId=${societyId}`),
      API.get(`/accounts?societyId=${societyId}`),
      API.get(`/vendors?societyId=${societyId}`),
      API.get(`/staff?societyId=${societyId}`)
    ]);

    if (memRes.status === 'fulfilled' && memRes.value.success) {
      document.getElementById('cntMembers').textContent = memRes.value.count || 0;
    }
    if (accRes.status === 'fulfilled' && accRes.value.success) {
      document.getElementById('cntAccounts').textContent = accRes.value.count || 0;
    }
    if (venRes.status === 'fulfilled' && venRes.value.success) {
      document.getElementById('cntVendors').textContent = venRes.value.count || 0;
    }
    if (stfRes.status === 'fulfilled' && stfRes.value.success) {
      document.getElementById('cntStaff').textContent = stfRes.value.count || 0;
    }

  } catch (err) {
    handleError(err, 'Failed to load dashboard.');
  } finally {
    hideLoading();
  }
}

function openNav(moduleId) {
  if (parent && parent.WorkspaceManager) {
    parent.WorkspaceManager.openModule(moduleId);
  } else {
    showToast(`Navigate to module: ${moduleId}`, 'info');
  }
}
