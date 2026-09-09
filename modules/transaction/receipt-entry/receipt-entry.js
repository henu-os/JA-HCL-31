// Receipt Entry JS
let voucherList = [];
let accountsList = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireContext()) return;
  document.getElementById('socName').textContent = Auth.getSocietyName();
  document.getElementById('fyLabel').textContent = Auth.getFYLabel();
  await loadAccounts();
  loadVouchers();
});

async function loadAccounts() {
  const societyId = Auth.getSocietyId();
  try {
    const res = await API.get(`/accounts?societyId=${societyId}`);
    if (res.success) {
      accountsList = res.data || [];
      const cbSel = document.getElementById('cashBankCode');
      cbSel.innerHTML = '<option value="">— Select Cash / Bank Ledger —</option>' +
        accountsList.map(a => `<option value="${a.accountId}">${escHtml(a.accCode)} - ${escHtml(a.accName)}</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to load accounts:', err);
  }
}

async function loadVouchers() {
  const societyId = Auth.getSocietyId();
  const fyId      = Auth.getFYId();
  if (!societyId || !fyId) return;

  showLoading('Loading Receipt Vouchers...');

  try {
    const res = await API.get(`/vouchers?societyId=${societyId}&fyId=${fyId}&type=Receipt`);
    if (res.success) {
      voucherList = res.data || [];
      renderList(voucherList);
    }
  } catch (err) {
    handleError(err, 'Failed to load receipt vouchers.');
  } finally {
    hideLoading();
  }
}

function renderList(list) {
  const tbody = document.getElementById('voucherTableBody');
  document.getElementById('recordCount').textContent = `Total: ${list.length}`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding:30px;">No Receipt Vouchers found. Click "New Receipt Entry" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((v, idx) => `
    <tr>
      <td class="td-center">${idx + 1}</td>
      <td class="text-bold text-navy">${escHtml(v.voucherNo)}</td>
      <td>${formatDate(v.voucherDate)}</td>
      <td>${escHtml(v.cashBankName || '—')}</td>
      <td class="text-bold">${escHtml(v.personName || '—')}</td>
      <td class="td-num text-bold">${formatAmount(v.amount)}</td>
      <td>${escHtml(v.chqNo || '—')}</td>
      <td class="td-center"><span class="erp-badge erp-badge-success">${escHtml(v.status || 'Posted')}</span></td>
      <td class="td-center">
        <button class="erp-btn erp-btn-sm" onclick="viewVoucher(${v.voucherId})" title="View"><i class="bi bi-eye"></i></button>
        <button class="erp-btn erp-btn-sm erp-btn-danger" onclick="deleteVoucher(${v.voucherId}, '${escHtml(v.voucherNo)}')" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function filterList() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = voucherList.filter(v =>
    !q ||
    v.voucherNo.toLowerCase().includes(q) ||
    (v.personName && v.personName.toLowerCase().includes(q)) ||
    (v.chqNo && v.chqNo.toLowerCase().includes(q))
  );
  renderList(filtered);
}

function showListView() {
  document.getElementById('listView').style.display = 'flex';
  document.getElementById('formView').style.display = 'none';
}

async function showFormView() {
  document.getElementById('listView').style.display = 'none';
  document.getElementById('formView').style.display = 'flex';

  document.getElementById('vDate').value = todayISO();
  document.getElementById('cashBankCode').value = '';
  document.getElementById('personName').value = '';
  document.getElementById('chqNo').value = '';
  document.getElementById('chqDate').value = '';
  document.getElementById('narration').value = '';

  const societyId = Auth.getSocietyId();
  const fyId      = Auth.getFYId();

  try {
    const res = await API.get(`/vouchers/next-no?societyId=${societyId}&fyId=${fyId}&type=Receipt`);
    if (res.success) {
      document.getElementById('vNo').value = res.nextVoucherNo;
    }
  } catch (_) {
    document.getElementById('vNo').value = 'RV-0001';
  }

  document.getElementById('gridBody').innerHTML = '';
  addRow();
  recalcGridTotals();
}

function addRow() {
  const tbody = document.getElementById('gridBody');
  const rowIdx = tbody.children.length + 1;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="td-center sr-num">${rowIdx}</td>
    <td>
      <select class="inp-acc-select erp-select" style="height:22px;">
        <option value="">— Select Credit / Income Ledger —</option>
        ${accountsList.map(a => `<option value="${a.accountId}">${escHtml(a.accCode)} - ${escHtml(a.accName)}</option>`).join('')}
      </select>
    </td>
    <td><input type="number" step="0.01" class="inp-amt text-right" value="0.00" onchange="recalcGridTotals()"></td>
    <td><input type="text" class="inp-narr" placeholder="Line details"></td>
    <td class="td-center"><button type="button" class="erp-btn erp-btn-sm erp-btn-danger" onclick="removeRow(this)">✕</button></td>
  `;

  tbody.appendChild(tr);
  updateSrNumbers();
}

function removeRow(btn) {
  const tbody = document.getElementById('gridBody');
  if (tbody.children.length <= 1) {
    showToast('Receipt voucher must have at least 1 account row.', 'warning');
    return;
  }
  btn.closest('tr').remove();
  updateSrNumbers();
  recalcGridTotals();
}

function updateSrNumbers() {
  document.querySelectorAll('#gridBody tr').forEach((tr, i) => {
    tr.querySelector('.sr-num').textContent = i + 1;
  });
}

function recalcGridTotals() {
  let tot = 0;
  document.querySelectorAll('#gridBody tr .inp-amt').forEach(inp => {
    tot += parseFloat(inp.value) || 0;
  });
  document.getElementById('txtTotAmount').textContent = formatAmount(tot);
}

async function saveReceipt(e) {
  e.preventDefault();

  const cbSel = document.getElementById('cashBankCode');
  if (!cbSel.value) {
    showToast('Please select a Cash / Bank deposit target account.', 'warning');
    return;
  }

  const cbAccObj = accountsList.find(a => a.accountId.toString() === cbSel.value);
  const cbCode = cbAccObj ? cbAccObj.accCode : '';
  const cbName = cbAccObj ? cbAccObj.accName : '';

  const items = [];
  document.querySelectorAll('#gridBody tr').forEach(tr => {
    const accIdStr = tr.querySelector('.inp-acc-select').value;
    const amt = parseFloat(tr.querySelector('.inp-amt').value) || 0;
    const narr = tr.querySelector('.inp-narr').value.trim();

    if (accIdStr && amt > 0) {
      const accId = parseInt(accIdStr);
      const accObj = accountsList.find(a => a.accountId === accId);
      items.push({
        accountId: accId,
        accountCode: accObj ? accObj.accCode : '',
        accountName: accObj ? accObj.accName : '',
        debit: 0,
        credit: amt,  // Credit income account
        narration: narr
      });
    }
  });

  if (items.length === 0) {
    showToast('Please enter at least one valid line amount.', 'warning');
    return;
  }

  const totalAmt = items.reduce((sum, i) => sum + i.credit, 0);

  // Add the Debit line for Cash/Bank
  items.push({
    accountId: parseInt(cbSel.value),
    accountCode: cbCode,
    accountName: cbName,
    debit: totalAmt,
    credit: 0,
    narration: 'Receipt deposited into Cash/Bank'
  });

  const body = {
    societyId:    parseInt(Auth.getSocietyId()),
    fyId:         parseInt(Auth.getFYId()),
    voucherNo:    document.getElementById('vNo').value.trim(),
    voucherType:  'Receipt',
    voucherDate:  document.getElementById('vDate').value,
    cashBankCode: cbCode,
    cashBankName: cbName,
    personName:   document.getElementById('personName').value.trim(),
    chqNo:        document.getElementById('chqNo').value.trim(),
    chqDate:      document.getElementById('chqDate').value || null,
    narration:    document.getElementById('narration').value.trim(),
    items:        items
  };

  showLoading('Saving Receipt Voucher...');

  try {
    const res = await API.post('/vouchers', body);
    if (res.success) {
      showToast(res.message || 'Receipt Voucher saved.', 'success');
      showListView();
      loadVouchers();
    }
  } catch (err) {
    handleError(err, 'Failed to save receipt voucher.');
  } finally {
    hideLoading();
  }
}

async function viewVoucher(id) {
  showLoading('Loading Voucher Details...');

  try {
    const res = await API.get(`/vouchers/${id}`);
    if (res.success) {
      const v = res.data;
      showAlert(`
        RV No: ${v.voucherNo} | Date: ${formatDate(v.voucherDate)}
        Deposited Into: ${v.cashBankName}
        Received From: ${v.personName || '—'}
        Cheque / Ref No: ${v.chqNo || '—'}
        ---------------------------------------------------------
        Total Receipt Amount: ₹${formatAmount(v.amount)}
        Narration: ${v.narration || '—'}
      `, 'Receipt Voucher Details', 'info');
    }
  } catch (err) {
    handleError(err, 'Failed to load details.');
  } finally {
    hideLoading();
  }
}

async function deleteVoucher(id, no) {
  const ok = await showConfirm(`Are you sure you want to delete Receipt Voucher "${no}"?`, 'Delete Voucher');
  if (!ok) return;

  showLoading('Deleting...');

  try {
    const res = await API.delete(`/vouchers/${id}`);
    if (res.success) {
      showToast(res.message || 'Receipt Voucher deleted.', 'success');
      loadVouchers();
    }
  } catch (err) {
    handleError(err, 'Failed to delete voucher.');
  } finally {
    hideLoading();
  }
}
