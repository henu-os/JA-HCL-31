// Receipt Register JS
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireContext()) return;
  document.getElementById('socName')?.textContent = Auth.getSocietyName();
  document.getElementById('fyLabel')?.textContent = Auth.getFYLabel();
  await loadRegister();
});

async function loadRegister() {
  const societyId = Auth.getSocietyId();
  const fyId      = Auth.getFYId();
  if (!societyId || !fyId) return;

  showLoading('Loading Receipt Register...');

  try {
    const res = await API.get(`/vouchers?societyId=${societyId}&fyId=${fyId}&type=Receipt`);
    if (res.success) {
      const list = res.data || [];
      document.getElementById('rrBody').innerHTML = list.map((v, idx) => `
        <tr>
          <td class="td-center">${idx + 1}</td>
          <td class="text-bold text-navy">${escHtml(v.voucherNo)}</td>
          <td>${formatDate(v.voucherDate)}</td>
          <td>${escHtml(v.cashBankName || '—')}</td>
          <td>${escHtml(v.personName || v.narration || '—')}</td>
          <td class="td-num text-bold text-success">${formatAmount(v.amount)}</td>
        </tr>
      `).join('') || '<tr><td colspan="6" class="text-center text-muted" style="padding:30px;">No receipts recorded in this financial year.</td></tr>';
    }
  } catch (err) {
    handleError(err, 'Failed to load receipt register.');
  } finally {
    hideLoading();
  }
}
