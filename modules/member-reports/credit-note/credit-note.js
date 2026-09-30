/**
 * Credit Note Report Controller (credit-note.js) — Jeevika ERP v2
 * Multi-Template Engine: Half Page, Full Page 14 Heads, Full Page 21 Heads
 * 100% Dynamic Database Binding & Re-Preview Guarantee
 */

(function () {
    'use strict';

    const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE : 'http://localhost:5002/api';
    let loadedCreditNotesData = null;

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

    function formatDateToInput(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return normalizeDate(dateStr);
        return d.toISOString().split('T')[0];
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

        // 3. Fetch Min / Max Note Numbers
        try {
            const fromNoInput = document.getElementById('fromNo');
            const toNoInput = document.getElementById('toNo');
            if (fromNoInput && toNoInput) {
                let noteMeta;
                if (typeof API !== 'undefined' && API.get) {
                    noteMeta = await API.get(`reports/credit-note-number-bounds?societyId=${activeSocietyId}&fyId=${activeFYId}`);
                } else {
                    const res = await fetch(`${API_BASE}/reports/credit-note-number-bounds?societyId=${activeSocietyId}&fyId=${activeFYId}`, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    noteMeta = await res.json();
                }

                if (noteMeta && noteMeta.success) {
                    fromNoInput.value = noteMeta.minNoteNo || 1;
                    toNoInput.value = noteMeta.maxNoteNo || 999999999;
                }
            }
        } catch (e) {
            console.warn("Failed fetching credit note bounds dynamically", e);
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

        const formatTemplate = getVal('formatTemplate', 'FullPage14');
        const fromNo = getVal('fromNo', '1');
        const toNo = getVal('toNo', '999999999');
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
            formatType: formatTemplate,
            fromNo: fromNo,
            toNo: toNo,
            fromDate: fDate,
            toDate: tDate,
            fromMemberCode: fromMem,
            toMemberCode: toMem,
            emailFilter: emailFilter,
            blankAcNo: getVal('blankAcNo', 'No'),
            showBldgWing: getVal('showBldgWing', 'Yes'),
            showArrears: getVal('showArrears', 'No'),
            arrearsBifurcation: getVal('arrearsBifurcation', 'Yes'),
            showSrNo: getVal('showSrNo', 'Yes'),
            printQr: getVal('printQr', 'Yes'),
            printSign: getVal('printSign', 'Yes'),
            headingTitle: getVal('headingTitle', 'CREDIT NOTE'),
            printPan: document.getElementById('printPan')?.checked ?? true,
            printGst: document.getElementById('printGst')?.checked ?? true
        };
    }

    // Render Credit Notes Multi-Template Engine
    function renderCreditNotes(data, params) {
        const container = document.getElementById('preview-render-area');
        if (!container) return;
        container.innerHTML = '';

        const society = data.society || {};
        const notes = data.notes || [];
        const format = params.formatType || 'FullPage14';
        const showBldgWing = params.showBldgWing === 'Yes';
        const showArrears = params.showArrears === 'Yes';
        const arrearsBifurcation = params.arrearsBifurcation === 'Yes';
        const showSrNo = params.showSrNo === 'Yes';
        const heading = params.headingTitle || 'CREDIT NOTE';

        if (notes.length === 0) {
            container.innerHTML = `
                <div style="color: #cbd5e1; text-align: center; margin-top: 140px;">
                    <i class="bi bi-info-circle" style="font-size: 36px; display: block; margin-bottom: 8px;"></i>
                    <div style="font-size: 15px; font-weight: 600;">No Credit Notes Found</div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Try expanding your Date, Number, or Member range.</div>
                </div>
            `;
            const statusSummary = document.getElementById('statusSummary');
            if (statusSummary) statusSummary.textContent = 'No credit notes matching criteria.';
            const printBtn = document.getElementById('btn-print');
            if (printBtn) printBtn.disabled = true;
            return;
        }

        const statusSummary = document.getElementById('statusSummary');
        if (statusSummary) statusSummary.textContent = `Found ${notes.length} credit note(s) in ${format} format.`;
        const printBtn = document.getElementById('btn-print');
        if (printBtn) printBtn.disabled = false;
        updateSummaryMetrics(notes);

        // Determine target padding rows based on template
        let targetRows = 14;
        let pageClass = 'credit-note-full-14';
        if (format === 'FullPage21') {
            targetRows = 21;
            pageClass = 'credit-note-full-21';
        } else if (format === 'HalfPage') {
            targetRows = 6;
            pageClass = 'credit-note-half';
        }

        notes.forEach((cn) => {
            const pageDiv = document.createElement('div');
            pageDiv.className = `cn-page ${pageClass}`;

            // Member Info Line
            const bldgParts = [];
            if (cn.member.building) bldgParts.push(cn.member.building);
            const flat = [cn.member.wing, cn.member.flatNo].filter(Boolean).join('-');
            if (flat) bldgParts.push(flat);
            const bldgDesc = (showBldgWing && bldgParts.length > 0) ? ` (${bldgParts.join(', ')})` : '';

            // Amount in words
            let wordsText = '';
            if (typeof amountInWords === 'function') {
                wordsText = amountInWords(cn.note.totalAmount);
            } else {
                wordsText = `Rupees ${Number(cn.note.totalAmount).toFixed(2)} Only`;
            }

            // Generate Table Rows
            const items = cn.items || [];
            let rowsHtml = '';
            items.forEach((it, idx) => {
                const sr = showSrNo ? (it.srNo || idx + 1) : '';
                rowsHtml += `
                    <tr>
                        ${showSrNo ? `<td style="width: 40px; text-align: center;">${sr}</td>` : ''}
                        <td><strong>${it.particulars}</strong>${it.narration ? `<div style="font-size: 9.5px; color: #444;">${it.narration}</div>` : ''}</td>
                        <td style="width: 130px; text-align: right; font-weight: 700;">${Number(it.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                `;
            });

            // Pad empty rows to match Crystal Report layout
            const emptyRowsCount = Math.max(0, targetRows - items.length);
            for (let i = 0; i < emptyRowsCount; i++) {
                rowsHtml += `
                    <tr class="cn-empty-row">
                        ${showSrNo ? `<td style="width: 40px;">&nbsp;</td>` : ''}
                        <td>&nbsp;</td>
                        <td style="width: 130px;">&nbsp;</td>
                    </tr>
                `;
            }

            // Bank details / PAN / GSTIN
            let metaSubLines = [];
            if (params.printPan && society.pan) metaSubLines.push(`PAN: ${society.pan}`);
            if (params.printGst && society.gstin) metaSubLines.push(`GSTIN: ${society.gstin}`);
            if (society.sacCode) metaSubLines.push(`SAC: ${society.sacCode}`);

            let bankLine = '';
            if (params.blankAcNo !== 'Yes' && society.bankName && society.accountNo) {
                bankLine = `<strong>Bank:</strong> ${society.bankName} | <strong>A/c:</strong> ${society.accountNo}${society.ifsc ? ' | <strong>IFSC:</strong> ' + society.ifsc : ''}`;
            }

            // Arrears Block if enabled
            let arrearsHtml = '';
            if (showArrears && cn.arrears) {
                if (arrearsBifurcation) {
                    arrearsHtml = `
                        <div class="cn-arrears-box">
                            <div><strong>Outstanding Dues:</strong></div>
                            <div>Principal: ₹ ${Number(cn.arrears.principal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                            <div>Interest: ₹ ${Number(cn.arrears.interest).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                            <div><strong>Net Balance: ₹ ${Number(cn.arrears.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                        </div>
                    `;
                } else {
                    arrearsHtml = `
                        <div class="cn-arrears-box">
                            <div><strong>Outstanding Net Balance: ₹ ${Number(cn.arrears.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                        </div>
                    `;
                }
            }

            pageDiv.innerHTML = `
                <!-- Header -->
                <div class="cn-header">
                    <div class="cn-title">${heading}</div>
                    <div class="cn-society-name">${society.name || 'SOCIETY NAME'}</div>
                    <div class="cn-society-sub">Registration No.: ${society.registrationNo || '—'}</div>
                    <div class="cn-society-sub">${society.address || '—'}</div>
                    ${metaSubLines.length > 0 ? `<div class="cn-society-sub">${metaSubLines.join(' | ')}</div>` : ''}
                </div>

                <!-- Meta Info Grid -->
                <div class="cn-meta-grid">
                    <div class="cn-meta-col">
                        <div><strong>To:</strong> [${cn.member.code}] <strong>${cn.member.name}</strong>${bldgDesc}</div>
                        <div><strong>Flat No:</strong> ${flat || '—'} ${cn.member.area ? `| <strong>Area:</strong> ${cn.member.area} Sq.Ft.` : ''}</div>
                    </div>
                    <div class="cn-meta-col" style="text-align: right;">
                        <div><strong>Credit Note No:</strong> <span style="font-weight: 800;">${cn.note.noteNo}</span></div>
                        <div><strong>Date:</strong> ${cn.note.noteDate}</div>
                        ${cn.note.refBillNo ? `<div><strong>Ref Bill / Mem:</strong> ${cn.note.refBillNo}</div>` : ''}
                    </div>
                </div>

                <!-- Particulars Table -->
                <div class="cn-table-wrap">
                    <table class="cn-table">
                        <thead>
                            <tr>
                                ${showSrNo ? `<th style="width: 40px;" class="text-center">Sr.</th>` : ''}
                                <th>Particulars / Allowance / Reversal Description</th>
                                <th style="width: 130px;" class="text-right">Amount (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                            <tr class="total-row">
                                ${showSrNo ? `<td></td>` : ''}
                                <td style="text-align: right; text-transform: uppercase;">Total Credit Note Amount</td>
                                <td style="text-align: right;">₹ ${Number(cn.note.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Words -->
                <div class="cn-words-line">
                    <strong>Amount in Words:</strong> ${wordsText}
                </div>

                ${arrearsHtml}

                <!-- Footer & Signature -->
                <div class="cn-footer">
                    <div class="dn-bank-details" style="font-size: 10px; line-height: 1.4;">
                        ${bankLine ? `<div>${bankLine}</div>` : ''}
                        <div style="color: #444; font-size: 9px; margin-top: 3px;">* Note: The amount credited has been adjusted against your member ledger account.</div>
                    </div>
                    ${params.printSign === 'Yes' ? `
                    <div class="cn-signatory-box">
                        <div>For <strong>${society.name || 'Society'}</strong></div>
                        <div class="cn-signature-line">Hon. Treasurer / Secretary</div>
                    </div>` : ''}
                </div>
            `;

            container.appendChild(pageDiv);
        });
    }

    // Fetch Credit Notes & Render Preview (Idempotent, completely flushes DOM on every call)
    async function loadPreview() {
        const renderArea = document.getElementById('preview-render-area');
        if (renderArea) {
            renderArea.innerHTML = `
                <div style="color: #cbd5e1; text-align: center; margin-top: 140px;">
                    <div class="spinner-border text-light" role="status" style="width: 2.5rem; height: 2.5rem; border: 3px solid #cbd5e1; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <div style="margin-top: 10px; font-size: 13px;">Generating credit note preview...</div>
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
                result = await API.get(`reports/credit-note-print?${qs}`);
            } else {
                const token = sessionStorage.getItem('jwtToken');
                const res = await fetch(`${API_BASE}/reports/credit-note-print?${qs}`, {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'X-Society-Id': params.societyId,
                        'X-FY-Id': params.fyId
                    }
                });
                result = await res.json();
            }

            if (result && result.success) {
                loadedCreditNotesData = result;
                renderCreditNotes(result, params);
            } else {
                throw new Error((result && result.message) || 'Failed fetching credit note data.');
            }
        } catch (err) {
            console.error("Credit note preview error", err);
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
        if (!renderArea || !loadedCreditNotesData) {
            alert('Please click "Preview" first to generate the credit notes before printing.');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=900,height=800');
        printWindow.document.open();
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Credit Note Print</title>
                <link rel="stylesheet" href="credit-note.css">
                <style>
                    @page { size: A4 portrait; margin: 0; }
                    body { margin: 0; padding: 10mm; background: #fff; }
                    .cn-page { box-shadow: none !important; margin: 0 auto 10mm auto !important; }
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
        const formatSel = document.getElementById('formatTemplate');
        if (formatSel) formatSel.value = 'FullPage14';

        const fromSel = document.getElementById('fromMember');
        const toSel = document.getElementById('toMember');
        if (fromSel && fromSel.options.length) fromSel.selectedIndex = 0;
        if (toSel && toSel.options.length) toSel.selectedIndex = toSel.options.length - 1;

        const blankAc = document.getElementById('blankAcNo');
        if (blankAc) blankAc.value = 'No';

        const bldgWing = document.getElementById('showBldgWing');
        if (bldgWing) bldgWing.value = 'Yes';

        const arrears = document.getElementById('showArrears');
        if (arrears) arrears.value = 'No';

        const arrearsSplit = document.getElementById('arrearsBifurcation');
        if (arrearsSplit) arrearsSplit.value = 'Yes';

        const srNo = document.getElementById('showSrNo');
        if (srNo) srNo.value = 'Yes';

        const qr = document.getElementById('printQr');
        if (qr) qr.value = 'Yes';

        const sign = document.getElementById('printSign');
        if (sign) sign.value = 'Yes';

        const heading = document.getElementById('headingTitle');
        if (heading) heading.value = 'CREDIT NOTE';

        const allRadio = document.querySelector('input[name="emailFilter"][value="all"]');
        if (allRadio) allRadio.checked = true;

        initDynamicParameters();

        const statusSummary = document.getElementById('statusSummary');
        if (statusSummary) statusSummary.textContent = 'Ready. Select parameters and click Preview.';

        const renderArea = document.getElementById('preview-render-area');
        if (renderArea) {
            renderArea.innerHTML = `
                <div class="preview-placeholder" style="color: #94a3b8; text-align: center; margin-top: 140px;">
                    <i class="bi bi-journal-check" style="font-size: 48px; display: block; margin-bottom: 10px;"></i>
                    <div style="font-size: 15px; font-weight: 600; color: #cbd5e1;">Credit Note Report Preview</div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Choose format (Half Page, Full Page 14/21 Heads) and click <strong>Preview</strong>.</div>
                </div>`;
        }

        const printBtn = document.getElementById('btn-print');
        if (printBtn) printBtn.disabled = true;
        loadedCreditNotesData = null;
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

    function updateSummaryMetrics(notes) {
        const count = notes.length;
        let totAmt = 0;
        notes.forEach(n => {
            totAmt += Number(n.totalAmount || n.summary?.totalAmount || 0);
        });

        const badge = document.getElementById('badgeNoteCount');
        if (badge) badge.textContent = `${count} Notes`;
        const kpiCount = document.getElementById('kpiNoteCount');
        if (kpiCount) kpiCount.textContent = `${count} Notes`;
        const kpiAmt = document.getElementById('kpiTotalAmount');
        if (kpiAmt) kpiAmt.textContent = `₹${totAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Expose globally
    window.loadCreditNotesPreview = loadPreview;
    window.loadPreview = loadPreview;
    window.triggerPrint = triggerPrint;
    window.resetForm = resetForm;
    window.loadAndPreviewCreditNotes = loadPreview;
    window.printCreditNotes = triggerPrint;
    window.resetCreditNoteFilters = resetForm;
})();
