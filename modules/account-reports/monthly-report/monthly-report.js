// Monthly Account Report JS
document.addEventListener('DOMContentLoaded', () => {
  if (window.Auth && !Auth.requireContext()) return;
  const socEl = document.getElementById('socName');
  const fyEl = document.getElementById('fyLabel');
  if (socEl && window.Auth) socEl.textContent = Auth.getSocietyName() || '—';
  if (fyEl && window.Auth) fyEl.textContent = Auth.getFYLabel() || '—';
  refreshData();
});

function refreshData() {
  if (window.showToast) {
    showToast('Monthly Account Report refreshed.', 'info');
  }
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const rows = document.querySelectorAll('#mainTableBody tr');
  rows.forEach(tr => {
    const text = tr.innerText.toLowerCase();
    tr.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}
