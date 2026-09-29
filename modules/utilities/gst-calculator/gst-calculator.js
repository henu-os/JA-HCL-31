// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — GST Calculator Engine
// ═══════════════════════════════════════════════════════════

let activeGstRate = 18;

document.addEventListener('DOMContentLoaded', () => {
  calculateGST();
});

function selectRate(rate, element) {
  activeGstRate = rate;
  document.getElementById('customRateInput').value = rate;

  document.querySelectorAll('.rate-pill').forEach(el => el.classList.remove('active'));
  if (element) element.classList.add('active');

  calculateGST();
}

function onCustomRateInput() {
  const val = parseFloat(document.getElementById('customRateInput').value) || 0;
  activeGstRate = val;

  document.querySelectorAll('.rate-pill').forEach(el => {
    el.classList.remove('active');
    if (el.textContent.trim() === `${val}%`) el.classList.add('active');
  });

  calculateGST();
}

function resetGSTCalculator() {
  document.getElementById('amountInput').value = '10000';
  document.getElementById('calcMode').value = 'FORWARD';
  document.getElementById('supplyType').value = 'INTRA';
  selectRate(18, document.querySelectorAll('.rate-pill')[3]);
}

function calculateGST() {
  const mode = document.getElementById('calcMode').value;
  const inputAmt = parseFloat(document.getElementById('amountInput').value) || 0;
  const supply = document.getElementById('supplyType').value;
  const rate = activeGstRate;

  document.getElementById('amountLabel').textContent = mode === 'FORWARD'
    ? 'Taxable Base Amount (₹) *'
    : 'Gross Invoice Total (₹) *';

  let taxable = 0;
  let gstAmount = 0;
  let gross = 0;

  if (mode === 'FORWARD') {
    taxable = inputAmt;
    gstAmount = Number(((taxable * rate) / 100).toFixed(2));
    gross = Number((taxable + gstAmount).toFixed(2));
  } else {
    gross = inputAmt;
    taxable = Number(((gross * 100) / (100 + rate)).toFixed(2));
    gstAmount = Number((gross - taxable).toFixed(2));
  }

  const isIntra = supply === 'INTRA';
  const halfRate = (rate / 2).toFixed(1);
  const halfGst = Number((gstAmount / 2).toFixed(2));

  // Update Top Stats
  document.getElementById('metricTaxable').textContent = formatAmount(taxable);
  document.getElementById('metricTax').textContent = formatAmount(gstAmount);
  document.getElementById('metricGross').textContent = formatAmount(gross);

  // Update Breakdown Card
  document.getElementById('resTaxable').textContent = formatAmount(taxable);
  document.getElementById('resTotalTax').textContent = formatAmount(gstAmount);
  document.getElementById('resGrossTotal').textContent = formatAmount(gross);

  if (isIntra) {
    document.getElementById('rowCGST').style.display = 'flex';
    document.getElementById('rowSGST').style.display = 'flex';
    document.getElementById('rowIGST').style.display = 'none';

    document.getElementById('lblCgstRate').textContent = `${halfRate}%`;
    document.getElementById('lblSgstRate').textContent = `${halfRate}%`;
    document.getElementById('resCGST').textContent = formatAmount(halfGst);
    document.getElementById('resSGST').textContent = formatAmount(halfGst);
  } else {
    document.getElementById('rowCGST').style.display = 'none';
    document.getElementById('rowSGST').style.display = 'none';
    document.getElementById('rowIGST').style.display = 'flex';

    document.getElementById('lblIgstRate').textContent = `${rate}%`;
    document.getElementById('resIGST').textContent = formatAmount(gstAmount);
  }
}

function copyGSTSummary() {
  const taxable = document.getElementById('resTaxable').textContent;
  const tax = document.getElementById('resTotalTax').textContent;
  const gross = document.getElementById('resGrossTotal').textContent;
  const supply = document.getElementById('supplyType').value;

  const text = `GST Invoice Breakdown:\nTaxable Base: ${taxable}\nTax Rate: ${activeGstRate}%\nGST Amount: ${tax}\nGross Invoice Total: ${gross}\nType: ${supply === 'INTRA' ? 'Intrastate (CGST+SGST)' : 'Interstate (IGST)'}`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Tax breakdown copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy text.', 'error');
  });
}
