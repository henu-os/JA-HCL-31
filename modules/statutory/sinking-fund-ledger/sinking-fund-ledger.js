// Sinking Fund & Building Repair Fund Ledger JS
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireContext()) return;
  document.getElementById('socName')?.textContent = Auth.getSocietyName();
  document.getElementById('fyLabel')?.textContent = Auth.getFYLabel();
  refreshData();
});

function refreshData() {
  showToast('Sinking Fund & Building Repair Fund Ledger ready.', 'info');
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const rows = document.querySelectorAll('#mainTableBody tr');
  rows.forEach(tr => {
    const text = tr.innerText.toLowerCase();
    tr.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}
