// Bill Register JS
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireContext()) return;
  refreshData();
});

function refreshData() {
  showToast('Bill Register refreshed.', 'info');
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const rows = document.querySelectorAll('#mainTableBody tr');
  rows.forEach(tr => {
    const text = tr.innerText.toLowerCase();
    tr.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}
