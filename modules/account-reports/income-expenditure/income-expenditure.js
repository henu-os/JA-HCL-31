// Income & Expenditure JS
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireContext()) return;
  document.getElementById('socName')?.textContent = Auth.getSocietyName();
  document.getElementById('fyLabel')?.textContent = Auth.getFYLabel();
  loadIE();
});

async function loadIE() {
  const societyId = Auth.getSocietyId();
  const fyId      = Auth.getFYId();
  if (!societyId || !fyId) return;

  showLoading('Generating Income & Expenditure...');

  try {
    const res = await API.get(`/reports/trial-balance?societyId=${societyId}&fyId=${fyId}`);
    if (res.success) {
      const items = res.data || [];
      const exps = items.filter(i => i.grpMainId === 4);
      const incs = items.filter(i => i.grpMainId === 3);

      const totExp = exps.reduce((s, i) => s + (i.closingDr || i.totalDebit), 0);
      const totInc = incs.reduce((s, i) => s + (i.closingCr || i.totalCredit), 0);

      document.getElementById('expBody').innerHTML = exps.map(i => `
        <tr><td>${escHtml(i.accName)}</td><td class="td-num text-bold">${formatAmount(i.closingDr || i.totalDebit)}</td></tr>
      `).join('') || '<tr><td colspan="2" class="text-center text-muted">No expenses recorded.</td></tr>';

      document.getElementById('incBody').innerHTML = incs.map(i => `
        <tr><td>${escHtml(i.accName)}</td><td class="td-num text-bold">${formatAmount(i.closingCr || i.totalCredit)}</td></tr>
      `).join('') || '<tr><td colspan="2" class="text-center text-muted">No income recorded.</td></tr>';

      document.getElementById('totExp').textContent = formatAmount(totExp);
      document.getElementById('totInc').textContent = formatAmount(totInc);
    }
  } catch (err) {
    handleError(err, 'Failed to generate statement.');
  } finally {
    hideLoading();
  }
}
