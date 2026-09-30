/**
 * JEEVIKA ERP v2 — Member Outstanding / Member Balance Report Controller
 * Dynamic Split Screen Ledger & Crystal Report A4 Multi-Page Generator
 * 100% Database Driven — Zero Hardcoding
 */

(function () {
    const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE : 'http://localhost:5002/api';

    let currentReportData = null;
    let allMembersList = [];
    let activeSocietyInfo = null;

    // ── Helper: Format Currency ──────────────────────────────────────────
    function fmtAmt(val) {
        if (typeof formatAmount === 'function') {
            return formatAmount(val || 0);
        }
        const num = parseFloat(val) || 0;
        return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Active Context Resolution ───────────────────────────────────────
    function getActiveSocietyId() {
        if (window.Auth && typeof window.Auth.getSocietyId === 'function') {
            const s = window.Auth.getSocietyId();
            if (s && !isNaN(parseInt(s, 10)) && parseInt(s, 10) > 0) return parseInt(s, 10);
        }
        const raw = sessionStorage.getItem('activeSocietyId') || localStorage.getItem('activeSocietyId') || '';
        const num = parseInt(raw, 10);
        return (!isNaN(num) && num > 0) ? num : 1;
    }

    function getActiveFYId() {
        if (window.Auth && typeof window.Auth.getFYId === 'function') {
            const f = window.Auth.getFYId();
            if (f && !isNaN(parseInt(f, 10)) && parseInt(f, 10) > 0) return parseInt(f, 10);
        }
        const raw = sessionStorage.getItem('activeFYId') || localStorage.getItem('activeFYId') || '';
        const num = parseInt(raw, 10);
        return (!isNaN(num) && num > 0) ? num : 1;
    }

    // ── Populate Member Range ───────────────────────────────────────────
    async function loadMembers() {
        try {
            const sid = getActiveSocietyId();
            let members = [];

            if (typeof API !== 'undefined' && API.get) {
                const res = await API.get(`members?societyId=${sid}`);
                members = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
            } else {
                const res = await fetch(`${API_BASE}/members?societyId=${sid}`);
                const data = await res.json();
                members = (data && data.data) ? data.data : (Array.isArray(data) ? data : []);
            }

            allMembersList = members;

            // Sort members naturally by Wing, Flat, Name
            members.sort((a, b) => {
                const codeA = String(a.memCode || a.MemCode || '').toUpperCase();
                const codeB = String(b.memCode || b.MemCode || '').toUpperCase();
                return codeA.localeCompare(codeB, undefined, { numeric: true });
            });

            const fromSelect = document.getElementById('fromMember');
            const toSelect = document.getElementById('toMember');

            if (fromSelect && toSelect && members.length > 0) {
                const options = members.map(m => {
                    const code = m.memCode || m.MemCode || '';
                    const name = m.memName || m.MemName || '';
                    const flat = m.flatNo || m.FlatNo || '';
                    const wing = m.wing || m.Wing || '';
                    const loc = (wing || flat) ? ` (${wing ? wing + '-' : ''}${flat})` : '';
                    return `<option value="${esc(code)}">${esc(code)} - ${esc(name)}${esc(loc)}</option>`;
                }).join('');

                fromSelect.innerHTML = options;
                toSelect.innerHTML = options;

                fromSelect.selectedIndex = 0;
                toSelect.selectedIndex = members.length - 1;
            }
        } catch (err) {
            console.error('[Outstanding] Failed to load members:', err);
        }
    }

    // ── Initialize Fiscal Year Dates ────────────────────────────────────
    async function initFiscalDates() {
        try {
            const sid = getActiveSocietyId();
            const activeFYId = getActiveFYId();
            let fyList = [];

            if (typeof API !== 'undefined' && API.get) {
                const res = await API.get(`financial-years?societyId=${sid}`);
                fyList = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
            } else {
                const res = await fetch(`${API_BASE}/financial-years?societyId=${sid}`);
                const data = await res.json();
                fyList = (data && data.data) ? data.data : (Array.isArray(data) ? data : []);
            }

            const activeFY = fyList.find(f => (f.fyId || f.fYId) === activeFYId) || fyList.find(f => f.isActive) || fyList[0];
            const dateInput = document.getElementById('asOnDate');

            if (dateInput) {
                if (activeFY && (activeFY.fyEnd || activeFY.fYEnd)) {
                    const rawEnd = activeFY.fyEnd || activeFY.fYEnd;
                    dateInput.value = rawEnd.includes('T') ? rawEnd.split('T')[0] : rawEnd;
                } else {
                    dateInput.value = new Date().toISOString().split('T')[0];
                }
            }
        } catch (err) {
            console.error('[Outstanding] Failed to init fiscal dates:', err);
            const dateInput = document.getElementById('asOnDate');
            if (dateInput && !dateInput.value) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
        }
    }

    // ── Fetch Report from Server ─────────────────────────────────────────
    async function fetchOutstandingReport() {
        const sid = getActiveSocietyId();
        const fyid = getActiveFYId();

        const fromMember = document.getElementById('fromMember')?.value || '';
        const toMember = document.getElementById('toMember')?.value || '';
        const periodMode = document.querySelector('input[name="periodMode"]:checked')?.value || 'asOn';
        const isOpeningOnly = (periodMode === 'opening');
        const asOnDate = document.getElementById('asOnDate')?.value || '';
        const minAmountVal = document.getElementById('minAmount')?.value;
        const maxAmountVal = document.getElementById('maxAmount')?.value;
        const showZeroBalance = (document.getElementById('showZeroBalance')?.value === 'Yes');
        const showBldgWing = (document.getElementById('showBldgWing')?.value === 'Yes');

        const params = new URLSearchParams();
        params.append('societyId', sid);
        params.append('fyId', fyid);
        if (fromMember) params.append('fromMemberCode', fromMember);
        if (toMember) params.append('toMemberCode', toMember);
        if (asOnDate) params.append('asOnDate', asOnDate);
        params.append('isOpeningOnly', isOpeningOnly);
        params.append('showZeroBalance', showZeroBalance);
        params.append('showBldgWing', showBldgWing);

        if (minAmountVal !== '' && !isNaN(parseFloat(minAmountVal))) {
            params.append('minAmount', parseFloat(minAmountVal));
        }
        if (maxAmountVal !== '' && !isNaN(parseFloat(maxAmountVal))) {
            params.append('maxAmount', parseFloat(maxAmountVal));
        }

        const url = `reports/member-outstanding?${params.toString()}`;
        let res = null;

        if (typeof API !== 'undefined' && API.get) {
            res = await API.get(url);
        } else {
            const resp = await fetch(`${API_BASE}/${url}`);
            res = await resp.json();
        }

        if (!res || !res.success) {
            throw new Error((res && res.message) ? res.message : 'Failed to retrieve outstanding report.');
        }

        currentReportData = res;
        activeSocietyInfo = res.society;
        return res;
    }

    // ── Render Interactive DataGrid ─────────────────────────────────────
    function renderDataGrid(data) {
        const tbody = document.getElementById('outstandingGridBody');
        const tfoot = document.getElementById('outstandingGridFoot');
        const theadRow = document.getElementById('gridTheadRow');
        const footTotalDebit = document.getElementById('footTotalDebit');
        const footTotalCredit = document.getElementById('footTotalCredit');
        const footLabelCell = document.getElementById('footLabelCell');

        if (!tbody) return;

        const showBldgWing = (document.getElementById('showBldgWing')?.value === 'Yes');
        const showContact = (document.getElementById('showContact')?.value.toUpperCase() === 'YES');

        // Dynamically build header columns
        let headerHtml = `<th style="width: 90px;">Code</th><th>Name</th>`;
        let colCount = 2;
        if (showBldgWing) {
            headerHtml += `<th style="width: 100px;">Bldg/Wing</th><th style="width: 80px;">Flat No</th>`;
            colCount += 2;
        }
        if (showContact) {
            headerHtml += `<th style="width: 110px;">Contact</th>`;
            colCount += 1;
        }
        headerHtml += `
            <th style="width: 110px; text-align: right;">Principal</th>
            <th style="width: 90px; text-align: right;">Interest</th>
            <th style="width: 120px; text-align: right;">Debit</th>
            <th style="width: 120px; text-align: right;">Credit</th>
        `;
        colCount += 4;
        if (theadRow) theadRow.innerHTML = headerHtml;

        const rows = (data && data.rows) ? data.rows : [];

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center; color: #94a3b8; padding: 40px;">No outstanding member records found for the selected criteria.</td></tr>`;
            if (tfoot) tfoot.style.display = 'none';
            return;
        }

        let bodyHtml = '';
        rows.forEach(r => {
            const bldgWing = [r.building, r.wing].filter(Boolean).join(' / ');
            bodyHtml += `
                <tr data-code="${esc(r.code)}" data-name="${esc(r.name)}" data-flat="${esc(r.flatNo)}" data-contact="${esc(r.contactNo)}">
                    <td style="font-weight: 600; color: #0284c7;">${esc(r.code)}</td>
                    <td style="font-weight: 600;">${esc(r.name)}</td>
                    ${showBldgWing ? `<td>${esc(bldgWing || '—')}</td><td>${esc(r.flatNo || '—')}</td>` : ''}
                    ${showContact ? `<td>${esc(r.contactNo || '—')}</td>` : ''}
                    <td style="text-align: right;">${fmtAmt(r.principal)}</td>
                    <td style="text-align: right;">${fmtAmt(r.interest)}</td>
                    <td style="text-align: right; font-weight: 600; color: ${r.debit > 0 ? '#b91c1c' : '#334155'};">${fmtAmt(r.debit)}</td>
                    <td style="text-align: right; font-weight: 600; color: ${r.credit > 0 ? '#15803d' : '#334155'};">${fmtAmt(r.credit)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = bodyHtml;

        // Row selection highlight
        tbody.querySelectorAll('tr').forEach(tr => {
            tr.addEventListener('click', () => {
                tbody.querySelectorAll('tr').forEach(other => other.classList.remove('selected'));
                tr.classList.add('selected');
            });
        });

        // Update Footers
        if (footLabelCell) footLabelCell.colSpan = colCount - 2;
        if (footTotalDebit) footTotalDebit.textContent = fmtAmt(data.totalDebit || 0);
        if (footTotalCredit) footTotalCredit.textContent = fmtAmt(data.totalCredit || 0);
        if (tfoot) tfoot.style.display = '';
    }

    // ── Client-side Quick Search ─────────────────────────────────────────
    function setupGridSearch() {
        const searchInput = document.getElementById('gridSearchInput');
        if (!searchInput) return;

        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase().trim();
            const tbody = document.getElementById('outstandingGridBody');
            if (!tbody) return;

            const trs = tbody.querySelectorAll('tr');
            let visibleDebit = 0;
            let visibleCredit = 0;
            let visibleCount = 0;

            trs.forEach(tr => {
                const code = tr.getAttribute('data-code')?.toLowerCase() || '';
                const name = tr.getAttribute('data-name')?.toLowerCase() || '';
                const flat = tr.getAttribute('data-flat')?.toLowerCase() || '';
                const contact = tr.getAttribute('data-contact')?.toLowerCase() || '';

                if (!q || code.includes(q) || name.includes(q) || flat.includes(q) || contact.includes(q)) {
                    tr.style.display = '';
                    visibleCount++;
                    // Read debit and credit cells
                    const cells = tr.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const debitText = cells[cells.length - 2].textContent.replace(/,/g, '');
                        const creditText = cells[cells.length - 1].textContent.replace(/,/g, '');
                        visibleDebit += parseFloat(debitText) || 0;
                        visibleCredit += parseFloat(creditText) || 0;
                    }
                } else {
                    tr.style.display = 'none';
                }
            });

            const footTotalDebit = document.getElementById('footTotalDebit');
            const footTotalCredit = document.getElementById('footTotalCredit');
            if (footTotalDebit) footTotalDebit.textContent = fmtAmt(visibleDebit);
            if (footTotalCredit) footTotalCredit.textContent = fmtAmt(visibleCredit);
        });
    }

    // ── Render Crystal Report (A4 Multi-Page Generator) ─────────────────
    function renderCrystalReport(data) {
        const renderArea = document.getElementById('preview-render-area');
        if (!renderArea) return;

        const rows = (data && data.rows) ? data.rows : [];
        const society = data.society || {};
        const asOnDateDisplay = data.asOnDate || '';
        const reportPeriod = data.reportPeriod || (society.fyLabel ? `F.Y. ${society.fyLabel}` : '');

        const showBldgWing = (document.getElementById('showBldgWing')?.value === 'Yes');
        const showContact = (document.getElementById('showContact')?.value.toUpperCase() === 'YES');

        if (rows.length === 0) {
            renderArea.innerHTML = `
                <div class="cr-balance-page">
                    <div class="cr-soc-heading">${esc(society.name || 'SOCIETY NAME')}</div>
                    ${society.address ? `<div class="cr-soc-sub">${esc(society.address)}</div>` : ''}
                    <div class="cr-report-subheading">MEMBER BALANCE AS ON : ${esc(asOnDateDisplay)}</div>
                    <div class="cr-meta-strip">
                        <span>F.Y. : ${esc(reportPeriod)}</span>
                        <span>Page No : Page 1 of 1</span>
                    </div>
                    <table class="cr-table">
                        <thead>
                            <tr>
                                <th style="text-align: left; width: 14%;">Code</th>
                                <th style="text-align: left;">Member Name</th>
                                <th style="text-align: right; width: 15%;">Principal</th>
                                <th style="text-align: right; width: 15%;">Interest</th>
                                <th style="text-align: right; width: 16%;">Debit</th>
                                <th style="text-align: right; width: 16%;">Credit</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="6" style="text-align: center; padding: 40px; color: #555;">No outstanding records found for the selected criteria.</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
            return;
        }

        // Chunk records into batches of 38 rows per page
        const ROWS_PER_PAGE = 38;
        const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE);
        let pagesHtml = '';

        for (let p = 0; p < totalPages; p++) {
            const pageRows = rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
            const isLastPage = (p === totalPages - 1);

            let pageTableRows = '';
            pageRows.forEach(r => {
                const bldgWing = [r.building, r.wing, r.flatNo ? `Flat ${r.flatNo}` : ''].filter(Boolean).join(' ');
                pageTableRows += `
                    <tr>
                        <td style="text-align: left; font-weight: bold;">${esc(r.code)}</td>
                        <td style="text-align: left;">
                            ${esc(r.name)}
                            ${showBldgWing && bldgWing ? `<span style="font-size: 9.5px; color: #444; margin-left: 4px;">(${esc(bldgWing)})</span>` : ''}
                            ${showContact && r.contactNo ? `<span style="font-size: 9.5px; color: #444; margin-left: 4px;">[${esc(r.contactNo)}]</span>` : ''}
                        </td>
                        <td style="text-align: right;">${fmtAmt(r.principal)}</td>
                        <td style="text-align: right;">${fmtAmt(r.interest)}</td>
                        <td style="text-align: right; font-weight: ${r.debit > 0 ? 'bold' : 'normal'};">${fmtAmt(r.debit)}</td>
                        <td style="text-align: right; font-weight: ${r.credit > 0 ? 'bold' : 'normal'};">${fmtAmt(r.credit)}</td>
                    </tr>
                `;
            });

            // Tfoot only on the final sheet
            let tfootHtml = '';
            if (isLastPage) {
                tfootHtml = `
                    <tfoot>
                        <tr>
                            <td colspan="2" style="text-align: left; font-weight: bold;">Total:</td>
                            <td style="text-align: right; font-weight: bold;"></td>
                            <td style="text-align: right; font-weight: bold;"></td>
                            <td style="text-align: right; font-weight: bold;">${fmtAmt(data.totalDebit || 0)}</td>
                            <td style="text-align: right; font-weight: bold;">${fmtAmt(data.totalCredit || 0)}</td>
                        </tr>
                    </tfoot>
                `;
            }

            pagesHtml += `
                <div class="cr-balance-page">
                    <div class="cr-soc-heading">${esc(society.name || 'SOCIETY NAME')}</div>
                    ${society.address ? `<div class="cr-soc-sub">${esc(society.address)}${society.regNo ? ` | Reg: ${esc(society.regNo)}` : ''}</div>` : ''}
                    <div class="cr-report-subheading">MEMBER BALANCE AS ON : ${esc(asOnDateDisplay)}</div>
                    
                    <div class="cr-meta-strip">
                        <span>F.Y. : ${esc(reportPeriod)}</span>
                        <span>Page No : Page ${p + 1} of ${totalPages}</span>
                    </div>

                    <table class="cr-table">
                        <thead>
                            <tr>
                                <th style="text-align: left; width: 14%;">Code</th>
                                <th style="text-align: left;">Member Name</th>
                                <th style="text-align: right; width: 15%;">Principal</th>
                                <th style="text-align: right; width: 15%;">Interest</th>
                                <th style="text-align: right; width: 16%;">Debit</th>
                                <th style="text-align: right; width: 16%;">Credit</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pageTableRows}
                        </tbody>
                        ${tfootHtml}
                    </table>
                </div>
            `;
        }

        renderArea.innerHTML = pagesHtml;
    }

    // ── Tab Navigation ──────────────────────────────────────────────────
    function switchTab(target) {
        const tabGrid = document.getElementById('tab-grid');
        const tabReport = document.getElementById('tab-report');
        const gridContainer = document.getElementById('grid-view-container');
        const reportContainer = document.getElementById('report-view-container');

        if (target === 'grid') {
            tabGrid?.classList.add('active');
            tabReport?.classList.remove('active');
            if (gridContainer) gridContainer.style.display = 'flex';
            if (reportContainer) reportContainer.style.display = 'none';
        } else {
            tabReport?.classList.add('active');
            tabGrid?.classList.remove('active');
            if (gridContainer) gridContainer.style.display = 'none';
            if (reportContainer) reportContainer.style.display = 'flex';
        }
    }

    // ── Wire Actions & Event Handlers ───────────────────────────────────
    function initEvents() {
        const btnShowGrid = document.getElementById('btn-show-grid');
        const btnPreviewCr = document.getElementById('btn-preview-cr');
        const btnPrint = document.getElementById('btn-print');
        const btnReset = document.getElementById('btn-reset');
        const tabGrid = document.getElementById('tab-grid');
        const tabReport = document.getElementById('tab-report');

        tabGrid?.addEventListener('click', () => switchTab('grid'));
        tabReport?.addEventListener('click', () => {
            switchTab('report');
            if (!currentReportData) {
                executeReportGeneration(true);
            }
        });

        btnShowGrid?.addEventListener('click', async () => {
            switchTab('grid');
            await executeReportGeneration(false);
        });

        btnPreviewCr?.addEventListener('click', async () => {
            switchTab('report');
            await executeReportGeneration(true);
        });

        btnPrint?.addEventListener('click', async () => {
            if (!currentReportData) {
                await executeReportGeneration(true);
            }
            switchTab('report');
            window.print();
        });

        btnReset?.addEventListener('click', async () => {
            const dateInput = document.getElementById('asOnDate');
            const minInput = document.getElementById('minAmount');
            const maxInput = document.getElementById('maxAmount');
            const zeroSelect = document.getElementById('showZeroBalance');
            const bldgSelect = document.getElementById('showBldgWing');
            const contactSelect = document.getElementById('showContact');
            const typeSelect = document.getElementById('reportType');
            const fromSelect = document.getElementById('fromMember');
            const toSelect = document.getElementById('toMember');

            if (minInput) minInput.value = '-999999999';
            if (maxInput) maxInput.value = '999999999';
            if (zeroSelect) zeroSelect.value = 'No';
            if (bldgSelect) bldgSelect.value = 'No';
            if (contactSelect) contactSelect.value = 'NO';
            if (typeSelect) typeSelect.value = 'Summary';
            if (fromSelect) fromSelect.selectedIndex = 0;
            if (toSelect && allMembersList.length > 0) toSelect.selectedIndex = allMembersList.length - 1;

            const radioAsOn = document.querySelector('input[name="periodMode"][value="asOn"]');
            if (radioAsOn) radioAsOn.checked = true;

            await initFiscalDates();
            await executeReportGeneration(false);
        });

        // Period Mode Radio changes
        document.querySelectorAll('input[name="periodMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const dateInput = document.getElementById('asOnDate');
                if (dateInput) {
                    if (e.target.value === 'opening') {
                        dateInput.disabled = true;
                        dateInput.style.opacity = '0.5';
                    } else {
                        dateInput.disabled = false;
                        dateInput.style.opacity = '1';
                    }
                }
            });
        });

        setupGridSearch();
    }

    async function executeReportGeneration(isReportTab) {
        const btnShowGrid = document.getElementById('btn-show-grid');
        const btnPreviewCr = document.getElementById('btn-preview-cr');
        const origGridText = btnShowGrid?.innerHTML;
        const origPreviewText = btnPreviewCr?.innerHTML;

        try {
            if (btnShowGrid) btnShowGrid.innerHTML = `<i class="bi bi-hourglass-split"></i> Calculating...`;
            if (btnPreviewCr) btnPreviewCr.innerHTML = `<i class="bi bi-hourglass-split"></i> Rendering...`;

            const data = await fetchOutstandingReport();
            renderDataGrid(data);
            renderCrystalReport(data);
        } catch (err) {
            console.error('[Outstanding] Generation error:', err);
            alert('Error generating report: ' + (err.message || err));
        } finally {
            if (btnShowGrid && origGridText) btnShowGrid.innerHTML = origGridText;
            if (btnPreviewCr && origPreviewText) btnPreviewCr.innerHTML = origPreviewText;
        }
    }

    // ── Module Initialization ───────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        initEvents();
        await Promise.all([loadMembers(), initFiscalDates()]);
        // Auto-run initial ledger calculation
        await executeReportGeneration(false);
    });

})();
