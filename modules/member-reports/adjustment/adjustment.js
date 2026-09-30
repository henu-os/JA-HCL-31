/**
 * Member Payment & Adjustment Report Controller (adjustment.js) — Jeevika ERP v2
 * Crystal Report Slip / Full Page A4 Layout
 * 100% Dynamic Database Binding & Re-Preview Guarantee
 */

(function () {
    'use strict';

    const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE : 'http://localhost:5002/api';
    let loadedAdjustmentData = null;

    // Helper: Convert YYYY-MM-DD or DD-MM-YYYY to YYYY-MM-DD
    function normalizeDate(val) {
        if (!val) return '';
        const trimmed = String(val).trim();
        if (trimmed.includes('-') && trimmed.split('-')[0].length === 4) return trimmed;
        const parts = trimmed.split(/[-/]/);
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return trimmed;
    }

    // Active Society ID Resolution matching Member Master
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

    // Dynamic Parameter Initialization (Society, FY, Members, Bounds)
    async function initDynamicParameters() {
        const activeSocietyId = getActiveSocietyId();
        const activeFYId = sessionStorage.getItem('activeFYId') || 1;
        const token = sessionStorage.getItem('jwtToken');

        // 1. Fetch Financial Year Bounds
        try {
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

                const fromDateInput = document.getElementById('fromDate');
                const toDateInput = document.getElementById('toDate');
                if (fromDateInput && !fromDateInput.value) fromDateInput.value = startDate;
                if (toDateInput && !toDateInput.value) toDateInput.value = endDate;
            }
        } catch (e) {
            console.error("Failed fetching financial years dynamically", e);
        }

        // 2. Fetch Members ordered naturally
        try {
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
                    return `<option value="${code}">${code} - ${name}${flatDesc}</option>`;
                }).join('');

                fromSelect.innerHTML = options;
                toSelect.innerHTML = options;
                fromSelect.selectedIndex = 0;
                toSelect.selectedIndex = members.length - 1;
            }
        } catch (e) {
            console.error("Failed fetching members dynamically", e);
        }

        // 3. Fetch Min / Max Voucher Numbers
        try {
            const fromNoInput = document.getElementById('fromNo');
            const toNoInput = document.getElementById('toNo');
            if (fromNoInput && toNoInput) {
                let noteMeta;
                if (typeof API !== 'undefined' && API.get) {
                    noteMeta = await API.get(`reports/adjustment-number-bounds?societyId=${activeSocietyId}&fyId=${activeFYId}`);
                } else {
                    const res = await fetch(`${API_BASE}/reports/adjustment-number-bounds?societyId=${activeSocietyId}&fyId=${activeFYId}`, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    noteMeta = await res.json();
                }

                if (noteMeta && noteMeta.success) {
                    fromNoInput.value = noteMeta.minAdjustmentNo || 1;
                    toNoInput.value = noteMeta.maxAdjustmentNo || 999999;
                }
            }
        } catch (e) {
            console.warn("Failed fetching adjustment bounds dynamically", e);
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

        const formatStyle = getVal('formatStyle', 'Slip');
        const fromNo = getVal('fromNo', '1');
        const toNo = getVal('toNo', '999999');
        const fDate = normalizeDate(getVal('fromDate'));
        const tDate = normalizeDate(getVal('toDate'));
        const fromMem = getVal('fromMember');
        const toMem = getVal('toMember');

        let emailFilter = 'all';
        const checkedRadio = document.querySelector('input[name="emailFilter"]:checked');
        if (checkedRadio) emailFilter = checkedRadio.value || 'all';

        return {
            societyId: activeSocietyId,
            fyId: activeFYId,
            formatStyle: formatStyle,
            fromNo: fromNo,
            toNo: toNo,
            fromDate: fDate,
            toDate: tDate,
            fromMemberCode: fromMem,
            toMemberCode: toMem,
            emailFilter: emailFilter,
            showBldgWing: getVal('showBldgWing', 'Yes'),
            printSign: getVal('printSign', 'Yes')
        };
    }

    // Render Member Adjustments HTML
    function renderAdjustments(data, params) {
        const container = document.getElementById('preview-render-area');
        if (!container) return;
        container.innerHTML = '';

        const society = data.society || {};
        const adjustments = data.adjustments || [];
        const format = params.formatStyle || 'Slip';
        const showWing = params.showBldgWing === 'Yes';
        const printSign = params.printSign === 'Yes';

        if (adjustments.length === 0) {
            container.innerHTML = `
                <div style="color: #cbd5e1; text-align: center; margin-top: 140px;">
                    <i class="bi bi-info-circle" style="font-size: 36px; display: block; margin-bottom: 8px;"></i>
                    <div style="font-size: 15px; font-weight: 600;">No Adjustment Vouchers Found</div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Try expanding your Date, Number, or Member range.</div>
                </div>
            `;
            const statusSummary = document.getElementById('statusSummary');
            if (statusSummary) statusSummary.textContent = 'No adjustment vouchers matching criteria.';
            const printBtn = document.getElementById('btn-print');
            if (printBtn) printBtn.disabled = true;
            return;
        }

        const statusSummary = document.getElementById('statusSummary');
        if (statusSummary) statusSummary.textContent = `Found ${adjustments.length} adjustment voucher(s) in ${format} format.`;
        const printBtn = document.getElementById('btn-print');
        if (printBtn) printBtn.disabled = false;
        updateSummaryMetrics(adjustments);

        adjustments.forEach(a => {
            const card = document.createElement('div');
            card.className = `adj-voucher-card ${format === 'Slip' ? 'adj-voucher-slip' : 'adj-voucher-full'}`;

            // Amount in words
            let wordsText = '';
            if (typeof amountInWords === 'function') {
                wordsText = amountInWords(a.amount);
            } else {
                wordsText = `Rupees ${Number(a.amount).toFixed(2)} Only`;
            }

            // Member Info Line
            const memberObj = a.member || {};
            const bldgParts = [];
            if (memberObj.building) bldgParts.push(memberObj.building);
            const flat = [memberObj.wing, memberObj.flatNo].filter(Boolean).join('-');
            if (flat) bldgParts.push(flat);
            const bldgDesc = (showWing && bldgParts.length > 0) ? ` (${bldgParts.join(', ')})` : '';

            const memberDisplay = memberObj.code 
                ? `[<strong>${memberObj.code}</strong>] ${memberObj.name || ''}${bldgDesc}`
                : (a.refNo ? `[Ref: <strong>${a.refNo}</strong>] ${memberObj.name || 'Member'}` : 'General / Ledger Adjustment');

            card.innerHTML = `
                <div class="adj-header">
                    <div class="adj-title">M E M B E R &nbsp; P A Y M E N T</div>
                    <div class="adj-soc-name">${society.name || 'SOCIETY NAME'}</div>
                    <div class="adj-soc-meta">Registration No.: ${society.registrationNo || '—'}</div>
                    <div class="adj-soc-meta">${society.address || '—'}</div>
                </div>

                <div class="adj-meta-row">
                    <div>Mem.Adjustment No. &nbsp;<span class="adj-underline-field">${a.adjustmentNo}</span></div>
                    <div>Date : &nbsp;<span class="adj-underline-field">${a.date}</span></div>
                </div>

                <div class="adj-fill-block">
                    <div class="adj-line">
                        <span>Being Amount Paid/Adjusted to</span>
                        <span class="adj-line-underline">${memberDisplay}</span>
                    </div>
                    <div class="adj-line">
                        <span class="adj-line-underline">${a.narration || (a.refNo ? 'Adjusted against Ref: ' + a.refNo : 'Advance maintenance / inter-head adjustment')}</span>
                    </div>
                    <div class="adj-empty-underline"></div>

                    <div class="adj-line">
                        <span>a sum of</span>
                        <span class="adj-line-underline">Rupees ${wordsText} Only</span>
                    </div>

                    <div class="adj-line">
                        <span>by</span>
                        <span class="adj-line-underline" style="max-width: 160px;">${a.paymentMode}</span>
                        <span>dated</span>
                        <span class="adj-line-underline" style="max-width: 110px;">${a.date}</span>
                        <span>drawn on</span>
                        <span class="adj-line-underline">${a.drawnOn || '-'}</span>
                    </div>
                    <div class="adj-empty-underline"></div>
                </div>

                <div class="adj-footer">
                    <div class="adj-amount-box">
                        Rs. &nbsp; ${Number(a.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    ${printSign ? `
                    <div class="adj-signature-box">
                        <div>For <strong>${society.name || 'Society'}</strong></div>
                        <div class="adj-signature-space"></div>
                        <div style="border-top: 1px solid #000; padding-top: 2px; min-width: 140px; text-align: center;">Hon. Treasurer / Secretary</div>
                    </div>` : ''}
                </div>
            `;
            container.appendChild(card);
        });
    }

    // Fetch Adjustments & Render Preview (Idempotent, completely flushes DOM on every call)
    async function loadPreview() {
        const renderArea = document.getElementById('preview-render-area');
        if (renderArea) {
            renderArea.innerHTML = `
                <div style="color: #cbd5e1; text-align: center; margin-top: 140px;">
                    <div class="spinner-border text-light" role="status" style="width: 2.5rem; height: 2.5rem; border: 3px solid #cbd5e1; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <div style="margin-top: 10px; font-size: 13px;">Generating adjustment vouchers preview...</div>
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
                result = await API.get(`reports/adjustment-print?${qs}`);
            } else {
                const token = sessionStorage.getItem('jwtToken');
                const res = await fetch(`${API_BASE}/reports/adjustment-print?${qs}`, {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'X-Society-Id': params.societyId,
                        'X-FY-Id': params.fyId
                    }
                });
                result = await res.json();
            }

            if (result && result.success) {
                loadedAdjustmentData = result;
                renderAdjustments(result, params);
            } else {
                throw new Error((result && result.message) || 'Failed fetching adjustment data.');
            }
        } catch (err) {
            console.error("Adjustment preview error", err);
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
        if (!renderArea || !loadedAdjustmentData) {
            alert('Please click "Preview" first to generate the adjustment vouchers before printing.');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=900,height=800');
        printWindow.document.open();
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Member Payment & Adjustment Print</title>
                <link rel="stylesheet" href="adjustment.css">
                <style>
                    @page { size: A4 portrait; margin: 8mm; }
                    body { margin: 0; padding: 8mm; background: #fff; }
                    .adj-voucher-card { box-shadow: none !important; margin: 0 auto 12mm auto !important; }
                    @media print {
                        body { padding: 0; }
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
        const formatSel = document.getElementById('formatStyle');
        if (formatSel) formatSel.value = 'Slip';

        const fromSel = document.getElementById('fromMember');
        const toSel = document.getElementById('toMember');
        if (fromSel && fromSel.options.length) fromSel.selectedIndex = 0;
        if (toSel && toSel.options.length) toSel.selectedIndex = toSel.options.length - 1;

        const bldgWing = document.getElementById('showBldgWing');
        if (bldgWing) bldgWing.value = 'Yes';

        const sign = document.getElementById('printSign');
        if (sign) sign.value = 'Yes';

        const allRadio = document.querySelector('input[name="emailFilter"][value="all"]');
        if (allRadio) allRadio.checked = true;

        initDynamicParameters();

        const statusSummary = document.getElementById('statusSummary');
        if (statusSummary) statusSummary.textContent = 'Ready. Select parameters and click Preview.';

        const renderArea = document.getElementById('preview-render-area');
        if (renderArea) {
            renderArea.innerHTML = `
                <div class="preview-placeholder" style="color: #94a3b8; text-align: center; margin-top: 140px;">
                    <i class="bi bi-receipt-cutoff" style="font-size: 48px; color: #94a3b8; display: block; margin-bottom: 10px;"></i>
                    <div style="font-size: 15px; font-weight: 600; color: #cbd5e1;">Member Adjustment / Payment Preview</div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Select parameters and click Preview to render vouchers.</div>
                </div>`;
        }

        const printBtn = document.getElementById('btn-print');
        if (printBtn) printBtn.disabled = true;
        loadedAdjustmentData = null;
    }

    // Attach Event Listeners
    function attachEvents() {
        const previewBtn = document.getElementById('btn-preview');
        if (previewBtn) previewBtn.onclick = loadPreview;

        const printBtn = document.getElementById('btn-print');
        if (printBtn) printBtn.onclick = triggerPrint;

        const resetBtn = document.getElementById('btn-reset');
        if (resetBtn) resetBtn.onclick = resetForm;
    }

    // Bootstrap
    async function init() {
        await initDynamicParameters();
        attachEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Popover Toggles
    window.toggleSummaryPopover = function(e) {
        if (e) e.stopPropagation();
        const pop = document.getElementById('summaryPopover');
        if (pop) pop.classList.toggle('show');
        const optPop = document.getElementById('optionsPopover');
        if (optPop) optPop.classList.remove('show');
    };

    window.toggleOptionsPopover = function(e) {
        if (e) e.stopPropagation();
        const optPop = document.getElementById('optionsPopover');
        if (optPop) optPop.classList.toggle('show');
        const pop = document.getElementById('summaryPopover');
        if (pop) pop.classList.remove('show');
    };

    window.closeOptionsPopover = function() {
        const optPop = document.getElementById('optionsPopover');
        if (optPop) optPop.classList.remove('show');
    };

    document.addEventListener('click', function(e) {
        const pop = document.getElementById('summaryPopover');
        const btn = document.getElementById('btnSummaryToggle');
        if (pop && pop.classList.contains('show') && !pop.contains(e.target) && btn && !btn.contains(e.target)) {
            pop.classList.remove('show');
        }
        const optPop = document.getElementById('optionsPopover');
        if (optPop && optPop.classList.contains('show') && !optPop.contains(e.target)) {
            optPop.classList.remove('show');
        }
    });

    function updateSummaryMetrics(vouchers) {
        const count = vouchers.length;
        let totAmt = 0;
        vouchers.forEach(v => {
            totAmt += Number(v.amount || v.totalAmount || 0);
        });

        const badge = document.getElementById('badgeAdjCount');
        if (badge) badge.textContent = `${count} Vouchers`;
        const kpiCount = document.getElementById('kpiAdjCount');
        if (kpiCount) kpiCount.textContent = `${count} Vouchers`;
        const kpiAmt = document.getElementById('kpiTotalAmount');
        if (kpiAmt) kpiAmt.textContent = `₹${totAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Expose globally
    window.loadAdjustmentPreview = loadPreview;
    window.loadPreview = loadPreview;
    window.triggerPrint = triggerPrint;
    window.resetForm = resetForm;
    window.loadAndPreviewAdjustments = loadPreview;
    window.printAdjustments = triggerPrint;
    window.resetAdjustmentFilters = resetForm;
})();
