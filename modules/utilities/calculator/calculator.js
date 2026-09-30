// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Safe Accounting Calculator Engine
// ═══════════════════════════════════════════════════════════

if (typeof showToast !== 'function') {
  window.showToast = function(msg, type) {
    console.log(`[Toast ${type || 'info'}]: ${msg}`);
  };
}

if (typeof escapeHtml !== 'function') {
  window.escapeHtml = function(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
}

let currentInput = '0';
let previousOperand = null;
let currentOperator = null;
let waitingForNextOperand = false;
let memoryRegister = 0;
let historyTape = [];

document.addEventListener('DOMContentLoaded', () => {
  setupKeyboardListeners();
});

function updateDisplay() {
  const display = document.getElementById('calcDisplay');
  const history = document.getElementById('calcHistory');

  display.textContent = currentInput;

  if (previousOperand !== null && currentOperator) {
    const opSymbol = currentOperator === '*' ? '×' : (currentOperator === '/' ? '÷' : currentOperator);
    history.textContent = `${previousOperand} ${opSymbol}`;
  } else {
    history.textContent = '\u00A0';
  }
}

function handleCalcInput(val) {
  if (val >= '0' && val <= '9') {
    inputDigit(val);
  } else if (val === '00') {
    inputDigit('0');
    inputDigit('0');
  } else if (val === '.') {
    inputDot();
  } else if (val === '+' || val === '-' || val === '*' || val === '/') {
    inputOperator(val);
  } else if (val === '%') {
    inputPercentage();
  } else if (val === '=') {
    calculateResult();
  } else if (val === 'AC') {
    clearAll();
  } else if (val === 'BACK') {
    backspace();
  }
}

function inputDigit(digit) {
  if (waitingForNextOperand) {
    currentInput = String(digit);
    waitingForNextOperand = false;
  } else {
    currentInput = currentInput === '0' ? String(digit) : currentInput + digit;
  }
  updateDisplay();
}

function inputDot() {
  if (waitingForNextOperand) {
    currentInput = '0.';
    waitingForNextOperand = false;
  } else if (!currentInput.includes('.')) {
    currentInput += '.';
  }
  updateDisplay();
}

function backspace() {
  if (waitingForNextOperand) return;
  if (currentInput.length > 1) {
    currentInput = currentInput.slice(0, -1);
  } else {
    currentInput = '0';
  }
  updateDisplay();
}

function clearAll() {
  currentInput = '0';
  previousOperand = null;
  currentOperator = null;
  waitingForNextOperand = false;
  updateDisplay();
}

function inputOperator(op) {
  const inputValue = parseFloat(currentInput);

  if (previousOperand === null) {
    previousOperand = inputValue;
  } else if (currentOperator && !waitingForNextOperand) {
    const result = executeSafeMath(previousOperand, inputValue, currentOperator);
    currentInput = formatCalcResult(result);
    previousOperand = result;
  }

  currentOperator = op;
  waitingForNextOperand = true;
  updateDisplay();
}

function inputPercentage() {
  const current = parseFloat(currentInput);
  if (isNaN(current)) return;
  const result = current / 100;
  currentInput = formatCalcResult(result);
  updateDisplay();
}

function calculateResult() {
  if (previousOperand === null || currentOperator === null || waitingForNextOperand) return;

  const currentVal = parseFloat(currentInput);
  const result = executeSafeMath(previousOperand, currentVal, currentOperator);

  const opSymbol = currentOperator === '*' ? '×' : (currentOperator === '/' ? '÷' : currentOperator);
  const expr = `${previousOperand} ${opSymbol} ${currentVal}`;
  const resStr = formatCalcResult(result);

  addTapeEntry(expr, resStr);

  currentInput = resStr;
  previousOperand = null;
  currentOperator = null;
  waitingForNextOperand = true;
  updateDisplay();
}

function executeSafeMath(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0) {
        showToast('Division by zero is undefined.', 'error');
        return 0;
      }
      return a / b;
    default: return b;
  }
}

function formatCalcResult(num) {
  if (isNaN(num)) return '0';
  // Avoid precision artifacts like 0.1 + 0.2 = 0.30000000000000004
  const rounded = Math.round(num * 100000000) / 100000000;
  return String(rounded);
}

function handleCalcMem(cmd) {
  const val = parseFloat(currentInput) || 0;
  switch (cmd) {
    case 'MC':
      memoryRegister = 0;
      showToast('Memory Cleared (MC)', 'info');
      break;
    case 'MR':
      currentInput = formatCalcResult(memoryRegister);
      waitingForNextOperand = true;
      updateDisplay();
      showToast(`Memory Recalled: ${memoryRegister}`, 'info');
      break;
    case 'M+':
      memoryRegister += val;
      showToast(`Memory +: ${memoryRegister}`, 'info');
      break;
    case 'M-':
      memoryRegister -= val;
      showToast(`Memory -: ${memoryRegister}`, 'info');
      break;
  }
  document.getElementById('metricMemory').textContent = String(memoryRegister);
}

function addTapeEntry(expr, result) {
  historyTape.unshift({ expr, result, time: new Date().toLocaleTimeString() });
  if (historyTape.length > 50) historyTape.pop();

  document.getElementById('metricTapeCount').textContent = String(historyTape.length);
  renderTape();
}

function renderTape() {
  const tape = document.getElementById('calcTape');
  if (!historyTape || historyTape.length === 0) {
    tape.innerHTML = '<div class="empty-state" style="padding: 20px;">No calculations yet. Perform operations to record tape history.</div>';
    return;
  }

  let html = '';
  historyTape.forEach(t => {
    html += `
      <div class="tape-item">
        <div class="tape-expr">${escapeHtml(t.expr)} =</div>
        <div class="tape-res">${escapeHtml(t.result)}</div>
      </div>
    `;
  });
  tape.innerHTML = html;
}

function clearCalculatorTape() {
  historyTape = [];
  document.getElementById('metricTapeCount').textContent = '0';
  renderTape();
  showToast('Tape history cleared.', 'info');
}

function copyCalculatorResult() {
  navigator.clipboard.writeText(currentInput).then(() => {
    showToast(`Copied ${currentInput} to clipboard!`, 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard.', 'error');
  });
}

function setupKeyboardListeners() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.key >= '0' && e.key <= '9') {
      inputDigit(e.key);
    } else if (e.key === '.') {
      inputDot();
    } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
      inputOperator(e.key);
    } else if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      calculateResult();
    } else if (e.key === 'Backspace') {
      backspace();
    } else if (e.key === 'Escape') {
      clearAll();
    }
  });
}
