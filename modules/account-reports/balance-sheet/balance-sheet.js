// Balance Sheet JS
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireContext()) return;
  document.getElementById('socName')?.textContent = Auth.getSocietyName();
  document.getElementById('fyLabel')?.textContent = Auth.getFYLabel();
  loadBalanceSheet();
});

async function loadBalanceSheet() {
  const societyId = Auth.getSocietyId();
  const fyId      = Auth.getFYId();
  if (!societyId || !fyId) return;

  showLoading('Generating Balance Sheet...');

  try {
    const res = await API.get(`/reports/trial-balance?societyId=${societyId}&fyId=${fyId}`);
    if (res.success) {
      const items = res.data || [];
      const liabs  = items.filter(i => i.grpMainId === 2 || i.closingCr > 0);
      const assets = items.filter(i => i.grpMainId === 1 || i.closingDr > 0);

      const totLiab = liabs.reduce((s, i) => s + (i.closingCr || i.closingDr), 0);
      const totAsset = assets.reduce((s, i) => s + (i.closingDr || i.closingCr), 0);

      document.getElementById('liabBody').innerHTML = liabs.map(i => `
        <tr><td>${escHtml(i.accName)}</td><td class="td-num text-bold">${formatAmount(i.closingCr || i.closingDr)}</td></tr>
      `).join('') || '<tr><td colspan="2" class="text-center text-muted">No liabilities recorded.</td></tr>';

      document.getElementById('assetBody').innerHTML = assets.map(i => `
        <tr><td>${escHtml(i.accName)}</td><td class="td-num text-bold">${formatAmount(i.closingDr || i.closingCr)}</td></tr>
      `).join('') || '<tr><td colspan="2" class="text-center text-muted">No assets recorded.</td></tr>';

      document.getElementById('totLiab').textContent   = formatAmount(totLiab);
      document.getElementById('totAssets').textContent = formatAmount(totAsset);
    }
  } catch (err) {
    handleError(err, 'Failed to generate Balance Sheet.');
  } finally {
    hideLoading();
  }
}
