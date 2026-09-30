/**
 * Member Receipt Report Controller (receipt.js) — Jeevika ERP v2
 * Full Page / Classical Crystal Report Format
 * Dynamic Re-Preview & Parameter Binding (Zero Hardcoding)
 */

(function () {
    'use strict';

    const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE : 'http://localhost:5002/api';
    let loadedReceiptsData = null;

    // Helper: Convert YYYY-MM-DD or DD-MM-YYYY to YYYY-MM-DD
    function normalizeDate(val) {
        if (!val) return '';
        const trimmed = String(val).trim();
        if (trimmed.includes('-') && trimmed.split('-')[0].length === 4) return trimmed; // Already YYYY-MM-DD
        const parts = trimmed.split(/[-/]/);
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return trimmed;
    }

    function formatDateToInput(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) {
            return normalizeDate(dateStr);
        }
        return d.toISOString().split('T')[0];
    }

    // Active Society ID Resolution matching Member Master exactly
    function getActiveSocietyId() {
        if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
            const s = window.Auth.getSocietyId();
            if (s && !isNaN(parseInt(s, 10)) && parseInt(s, 10) > 0) return parseInt(s, 10);
        }
        const raw = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || sessionStorage.getItem('activeSocietyCode') || localStorage.getItem('activeSocietyCode') || '';
        const num = parseInt(raw, 10);
        if (!isNaN(num) && num > 0) return num;
        const rawUpper = String(raw).toUpperCase().trim();
        if (rawUpper.includes('SRS') || rawUpper.includes('SAI')) return 2;
        if (rawUpper.includes('GDS') || rawUpper.includes('GOKUL')) return 1;
        return 1;
    }

    // Dynamic Member Range Populating from Database matching Member Master
    async function loadMembers() {
        try {
            const activeSocietyId = getActiveSocietyId();
            const token = sessionStorage.getItem('jwtToken');
            let members = [];

            if (typeof API !== 'undefined' && API.get) {
                const res = await API.get(`members?societyId=${activeSocietyId}`);
                members = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
            } else {
                const res = await fetch(`${API_BASE}/members?societyId=${activeSocietyId}`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                members = (data && data.data) ? data.data : (Array.isArray(data) ? data : []);
            }

            // Sort members naturally by MemCode so fromMember and toMember form a proper boundary
            members.sort((a, b) => {
                const codeA = String(a.memCode || a.code || a.MemCode || '').toUpperCase();
                const codeB = String(b.memCode || b.code || b.MemCode || '').toUpperCase();
                return codeA.localeCompare(codeB, undefined, { numeric: true });
            });

            const fromSelect = document.getElementById('fromMember');
            const toSelect = document.getElementById('toMember');

            if (fromSelect && toSelect && members.length > 0) {
                const options = members.map(m => {
                    const code = m.memCode || m.code || m.MemCode || '';
                    const name = m.memName || m.name || m.MemName || '';
                    const flat = m.flatNo || m.FlatNo || '';
                    const wing = m.wing || m.Wing || '';
                    
                    const flatDesc = (wing || flat) ? ` (Flat: ${wing ? wing + '-' : ''}${flat})` : '';
                    const label = `${code} - ${name}${flatDesc}`;
                    return `<option value="${code}">${label}</option>`;
                }).join('');

                fromSelect.innerHTML = options;
                toSelect.innerHTML = options;
                fromSelect.selectedIndex = 0; // First member
                toSelect.selectedIndex = members.length - 1; // Last member
            }
        } catch (e) {
            console.error("Failed loading members dynamically", e);
        }
    }

    // Dynamic Fiscal Year & Date Initialization from Database
    async function initFiscalDates() {
        try {
            const activeSocietyId = getActiveSocietyId();
            const activeFYId = sessionStorage.getItem('activeFYId') || 1;
            const token = sessionStorage.getItem('jwtToken');
            let fyList = [];

            if (typeof API !== 'undefined' && API.get) {
                const res = await API.get(`financial-years?societyId=${activeSocietyId}`);
                fyList = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
            } else {
                const res = await fetch(`${API_BASE}/financial-years?societyId=${activeSocietyId}`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                fyList = (data && data.data) ? data.data : (Array.isArray(data) ? data : []);
            }

            let activeFY = fyList.find(f => String(f.fYId || f.fyId) === String(activeFYId)) || 
                           fyList.find(f => f.isActive || f.isDefault) || 
                           fyList[0];

            if (activeFY && (activeFY.fYStart || activeFY.fyStart) && (activeFY.fYEnd || activeFY.fyEnd)) {
                const startDate = (activeFY.fYStart || activeFY.fyStart).split('T')[0];
                const endDate = (activeFY.fYEnd || activeFY.fyEnd).split('T')[0];

                const dateFromInputs = document.querySelectorAll('input[name="billFrom"], input[name="rcptFrom"], #billFrom, #rcptFrom, #fromDate');
                const dateToInputs = document.querySelectorAll('input[name="billTo"], input[name="rcptTo"], #billTo, #rcptTo, #toDate');

                dateFromInputs.forEach(input => { if (input) input.value = startDate; });
                dateToInputs.forEach(input => { if (input) input.value = endDate; });
            }
        } catch (e) {
            console.error("Failed initializing fiscal year dates dynamically", e);
        }

        // 3. Dynamic Min/Max Receipt Numbers from DB
        try {
            const activeSocietyId = getActiveSocietyId();
            const activeFYId = sessionStorage.getItem('activeFYId') || 1;
            const fromRcptNoInput = document.getElementById('fromReceiptNo') || document.getElementById('fromNo');
            const toRcptNoInput = document.getElementById('toReceiptNo') || document.getElementById('toNo');

            if (fromRcptNoInput && toRcptNoInput) {
                let rcptMeta;
                if (typeof API !== 'undefined' && API.get) {
                    rcptMeta = await API.get(`reports/receipt-number-bounds?societyId=${activeSocietyId}&fyId=${activeFYId}`);
                } else {
                    const token = sessionStorage.getItem('jwtToken');
                    const res = await fetch(`${API_BASE}/reports/receipt-number-bounds?societyId=${activeSocietyId}&fyId=${activeFYId}`, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    rcptMeta = await res.json();
                }

                if (rcptMeta && rcptMeta.success) {
                    fromRcptNoInput.value = rcptMeta.minReceiptNo || 1;
                    toRcptNoInput.value = rcptMeta.maxReceiptNo || 999999999;
                }
            }
        } catch (e) {
            console.warn("Failed fetching receipt number bounds dynamically", e);
        }
    }

    // Extract Form Parameters live from inputs at execution time (Zero Caching)
    function getFilterParams() {
        const getVal = (id, fallback = '') => {
            const el = document.getElementById(id);
            return el ? String(el.value).trim() : fallback;
        };

        const activeSocietyId = getActiveSocietyId();
        const activeFYId = sessionStorage.getItem('activeFYId') || 1;

        const fromRcpt = getVal('fromReceiptNo', '1');
        const toRcpt = getVal('toReceiptNo', '999999999');
        const fDate = normalizeDate(getVal('fromDate'));
        const tDate = normalizeDate(getVal('toDate'));
        const fromMem = getVal('fromMember');
        const toMem = getVal('toMember');
        const indexBy = getVal('indexBy', 'Numberwise');
        const printBldgWing = getVal('printBldgWing', 'No');
        const newPageEach = getVal('newPageEach', 'No');

        let emailFilter = 'all';
        const checkedRadio = document.querySelector('input[name="emailFilter"]:checked');
        if (checkedRadio) {
            emailFilter = checkedRadio.value || 'all';
        }

        return {
            societyId: activeSocietyId,
            fyId: activeFYId,
            fromReceiptNo: fromRcpt,
            toReceiptNo: toRcpt,
            fromDate: fDate,
            toDate: tDate,
            fromMemberCode: fromMem,
            toMemberCode: toMem,
            indexBy: indexBy,
            printBldgWing: printBldgWing,
            newPageEach: newPageEach,
            emailFilter: emailFilter
        };
    }

    // Render Receipts into Preview Area
    function renderReceipts(data, params) {
        const container = document.getElementById('preview-render-area');
        if (!container) return;
        container.innerHTML = '';

        const society = data.society || {};
        const receipts = data.receipts || [];
        const showBldgWing = params.printBldgWing === 'Yes';
        const newPageEach = params.newPageEach === 'Yes';

        if (receipts.length === 0) {
            container.innerHTML = `
                <div style="color: #cbd5e1; text-align: center; margin-top: 140px;">
                    <i class="bi bi-info-circle" style="font-size: 36px; display: block; margin-bottom: 8px;"></i>
                    <div style="font-size: 15px; font-weight: 600;">No Receipts Found</div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Try expanding your Receipt No, Date, or Member range.</div>
                </div>
            `;
            const statusSummary = document.getElementById('statusSummary');
            if (statusSummary) statusSummary.textContent = 'No receipts matching criteria.';
            const printBtn = document.getElementById('btn-print');
            if (printBtn) printBtn.disabled = true;
            return;
        }

        const statusSummary = document.getElementById('statusSummary');
        if (statusSummary) statusSummary.textContent = `Found ${receipts.length} receipt(s). Ready for Print/PDF.`;
        const printBtn = document.getElementById('btn-print');
        if (printBtn) printBtn.disabled = false;
        updateSummaryMetrics(receipts);

        // Grouping: 1 receipt per page OR 2 receipts per page
        const chunkSize = newPageEach ? 1 : 2;
        for (let i = 0; i < receipts.length; i += chunkSize) {
            const pageReceipts = receipts.slice(i, i + chunkSize);
            const pageDiv = document.createElement('div');
            pageDiv.className = 'receipt-page';

            pageReceipts.forEach(r => {
                const card = document.createElement('div');
                card.className = 'receipt-card';

                // Member building/flat info
                let bldgFlatInfo = '';
                if (showBldgWing) {
                    const parts = [];
                    if (r.member.building) parts.push(r.member.building);
                    const flatParts = [r.member.wing, r.member.flatNo].filter(Boolean).join('-');
                    if (flatParts) parts.push(flatParts);
                    if (parts.length > 0) bldgFlatInfo = ` (${parts.join(', ')})`;
                }

                // Amount in words
                let wordsText = '';
                if (typeof amountInWords === 'function') {
                    wordsText = amountInWords(r.amount);
                } else {
                    wordsText = `Rupees ${Number(r.amount).toFixed(2)} Only`;
                }

                // Payment instrument details
                let instrumentText = '';
                if (r.paymentMode === 'Cheque') {
                    instrumentText = `by Cheque No. <span class="short-val">${r.chequeNo || '—'}</span> dated <span class="short-val">${r.chequeDate || r.receiptDate}</span> drawn on <span class="fill-line">${r.bankName || '—'}${r.branchName ? ' - ' + r.branchName : ''}</span>`;
                } else if (r.paymentMode === 'Cash') {
                    instrumentText = `by <span class="short-val">CASH</span> on date <span class="short-val">${r.receiptDate}</span>`;
                } else {
                    instrumentText = `by ${r.paymentMode} Ref No. <span class="short-val">${r.transactionRef || r.chequeNo || '—'}</span> dated <span class="short-val">${r.receiptDate}</span> drawn on <span class="fill-line">${r.bankName || 'Online Transfer'}</span>`;
                }

                // Settlement Reference
                const againstText = (r.againstBill && r.againstBill.billNo)
                    ? `Bill No.: ${r.againstBill.billNo}${r.againstBill.billDate ? ' - Dated ' + r.againstBill.billDate : ''}`
                    : 'Maintenance Dues / Advance';

                card.innerHTML = `
                    <!-- Header -->
                    <div class="receipt-header">
                        <div class="receipt-title">RECEIPT</div>
                        <div class="society-name">${society.name || 'SOCIETY NAME'}</div>
                        <div class="society-meta">Registration No.: ${society.registrationNo || '—'}</div>
                        <div class="society-meta">${society.address || '—'}</div>
                        <div class="society-meta">Email: ${society.email || '—'}${society.phone ? ' | Tel No.: ' + society.phone : ''}</div>
                    </div>

                    <!-- Metadata Top Row -->
                    <div class="receipt-meta-row">
                        <div><strong>Receipt No. :</strong> <span class="underline-val">${r.receiptNo}</span></div>
                        <div><strong>Date :</strong> <span class="underline-val">${r.receiptDate}</span></div>
                    </div>

                    <!-- Payer Line -->
                    <div class="receipt-line">
                        <span class="label">Received with thanks from</span>
                        <span class="fill-line"><strong>[${r.member.code}] ${r.member.name}</strong>${bldgFlatInfo}</span>
                    </div>

                    <!-- Amount in Words -->
                    <div class="receipt-line">
                        <span class="label">a sum of</span>
                        <span class="fill-line"><strong>${wordsText}</strong></span>
                    </div>

                    <!-- Payment Instrument Mode -->
                    <div class="receipt-line">
                        ${instrumentText}
                    </div>

                    <!-- Allocation Reference -->
                    <div class="receipt-line">
                        <span class="label">Against:</span>
                        <span class="fill-line"><strong>${againstText}</strong></span>
                    </div>

                    <!-- Bottom Signature Block -->
                    <div class="receipt-footer">
                        <div class="amount-badge">₹ ${Number(r.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div class="signatory-box">
                            <div>For <strong>${society.name || 'Society'}</strong></div>
                            <div class="signature-line">Hon. Treasurer / Secretary</div>
                        </div>
                    </div>
                `;

                pageDiv.appendChild(card);
            });

            container.appendChild(pageDiv);
        }
    }

    // Fetch Receipts & Render Preview (Idempotent, completely flushes DOM on every call)
    async function loadPreview() {
        const renderArea = document.getElementById('preview-render-area');
        if (renderArea) {
            renderArea.innerHTML = `
                <div style="color: #cbd5e1; text-align: center; margin-top: 140px;">
                    <div class="spinner-border text-light" role="status" style="width: 2.5rem; height: 2.5rem; border: 3px solid #cbd5e1; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <div style="margin-top: 10px; font-size: 13px;">Generating receipt preview...</div>
                </div>
            `;
        }

        const statusSummary = document.getElementById('statusSummary');
        if (statusSummary) statusSummary.textContent = 'Generating preview...';

        const params = getFilterParams();
        const qs = new URLSearchParams(params).toString();

        try {
            let result;
            if (typeof API !== 'undefined' && API.get) {
                result = await API.get(`reports/receipt-print?${qs}`);
            } else {
                const token = sessionStorage.getItem('jwtToken');
                const res = await fetch(`${API_BASE}/reports/receipt-print?${qs}`, {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'X-Society-Id': params.societyId,
                        'X-FY-Id': params.fyId
                    }
                });
                result = await res.json();
            }

            if (result && result.success) {
                loadedReceiptsData = result;
                renderReceipts(result, params);
            } else {
                throw new Error((result && result.message) || 'Failed fetching receipt data.');
            }
        } catch (err) {
            console.error("Preview generation error", err);
            if (renderArea) {
                renderArea.innerHTML = `
                    <div style="color: #ef4444; text-align: center; margin-top: 140px; padding: 20px;">
                        <i class="bi bi-exclamation-triangle" style="font-size: 40px;"></i>
                        <div style="font-size: 15px; font-weight: 600; margin-top: 8px;">Failed to Generate Preview</div>
                        <div style="font-size: 12px; color: #f87171; margin-top: 4px;">${err.message || 'Check server connection and try again.'}</div>
                    </div>
                `;
            }
            if (statusSummary) statusSummary.textContent = 'Error generating preview.';
        }
    }

    // Direct Isolated PDF Creation & Print Engine
    function triggerPrint() {
        const renderArea = document.getElementById('preview-render-area');
        if (!renderArea || !loadedReceiptsData) {
            alert('Please click "Preview" first to generate the receipts before printing.');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=900,height=800');
        printWindow.document.open();
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Member Receipts Print</title>
                <link rel="stylesheet" href="receipt.css">
                <style>
                    @page { size: A4 portrait; margin: 0; }
                    body { margin: 0; padding: 10mm; background: #fff; }
                    .receipt-page { width: 190mm !important; min-height: 275mm !important; margin: 0 auto 20mm auto !important; page-break-after: always !important; box-shadow: none !important; }
                    @media print {
                        body { padding: 0; }
                        .receipt-page { border: none !important; margin: 0 !important; }
                    }
                </style>
            </head>
            <body>
                ${renderArea.innerHTML}
                <script>
                    window.onload = function() {
                        window.focus();
                        window.print();
                        window.onafterprint = function() { window.close(); };
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    // Reset Form Controls
    function resetForm() {
        const fromSel = document.getElementById('fromMember');
        const toSel = document.getElementById('toMember');
        if (fromSel && fromSel.options.length) fromSel.selectedIndex = 0;
        if (toSel && toSel.options.length) toSel.selectedIndex = toSel.options.length - 1;

        const fromRcpt = document.getElementById('fromReceiptNo');
        const toRcpt = document.getElementById('toReceiptNo');
        if (fromRcpt) fromRcpt.value = '1';
        if (toRcpt) toRcpt.value = '999999999';

        const printBldgWing = document.getElementById('printBldgWing');
        if (printBldgWing) printBldgWing.value = 'No';

        const indexBy = document.getElementById('indexBy');
        if (indexBy) indexBy.value = 'Numberwise';

        const newPageEach = document.getElementById('newPageEach');
        if (newPageEach) newPageEach.value = 'No';

        const allRadio = document.querySelector('input[name="emailFilter"][value="all"]');
        if (allRadio) allRadio.checked = true;

        initFiscalDates();

        const statusSummary = document.getElementById('statusSummary');
        if (statusSummary) statusSummary.textContent = 'Ready. Select parameters and click Preview.';

        const renderArea = document.getElementById('preview-render-area');
        if (renderArea) {
            renderArea.innerHTML = `
                <div class="preview-placeholder" style="color: #94a3b8; text-align: center; margin-top: 140px;">
                    <i class="bi bi-receipt" style="font-size: 48px; display: block; margin-bottom: 10px;"></i>
                    <div style="font-size: 15px; font-weight: 600; color: #cbd5e1;">Member Receipt Report Preview</div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Configure parameters on the left and click <strong>Preview</strong>.</div>
                </div>`;
        }

        const printBtn = document.getElementById('btn-print');
        if (printBtn) printBtn.disabled = true;
        loadedReceiptsData = null;
    }

    // Idempotent Event Bindings
    function attachEvents() {
        const previewBtn = document.getElementById('btn-preview');
        if (previewBtn) previewBtn.onclick = loadPreview;

        const printBtn = document.getElementById('btn-print');
        if (printBtn) printBtn.onclick = triggerPrint;

        const resetBtn = document.getElementById('btn-reset');
        if (resetBtn) resetBtn.onclick = resetForm;
    }

    // Bootstrap Module
    async function init() {
        await Promise.all([loadMembers(), initFiscalDates()]);
        attachEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Summary Popover toggle
    window.toggleSummaryPopover = function(e) {
        if (e) e.stopPropagation();
        const pop = document.getElementById('summaryPopover');
        if (pop) pop.classList.toggle('show');
    };

    document.addEventListener('click', function(e) {
        const pop = document.getElementById('summaryPopover');
        const btn = document.getElementById('btnSummaryToggle');
        if (pop && pop.classList.contains('show') && !pop.contains(e.target) && btn && !btn.contains(e.target)) {
            pop.classList.remove('show');
        }
    });

    function updateSummaryMetrics(receipts) {
        const count = receipts.length;
        let totAmt = 0;
        receipts.forEach(r => {
            totAmt += Number(r.amount || r.totalAmount || 0);
        });

        const badge = document.getElementById('badgeRcptCount');
        if (badge) badge.textContent = `${count} Receipts`;
        const kpiCount = document.getElementById('kpiRcptCount');
        if (kpiCount) kpiCount.textContent = `${count} Receipts`;
        const kpiAmt = document.getElementById('kpiTotalAmount');
        if (kpiAmt) kpiAmt.textContent = `₹${totAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Expose functions globally
    window.loadReceiptsPreview = loadPreview;
    window.loadPreview = loadPreview;
    window.triggerPrint = triggerPrint;
    window.resetForm = resetForm;
    window.loadAndPreviewReceipts = loadPreview;
    window.printReceipts = triggerPrint;
    window.resetReceiptFilters = resetForm;
})();
