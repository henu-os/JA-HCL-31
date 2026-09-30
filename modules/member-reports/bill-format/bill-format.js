/**
 * Bill Format - G02. Full Page - GST1 with Receipt Controller
 * Dynamic Re-Preview & Dynamic Database Parameter Binding (Zero Hardcoding)
 */
(function () {
    const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE : 'http://localhost:5002/api';

    let loadedBillsData = null;

    // Helper: Convert YYYY-MM-DD or DD-MM-YYYY to YYYY-MM-DD
    function normalizeDate(val) {
        if (!val) return '';
        const trimmed = String(val).trim();
        if (trimmed.includes('-') && trimmed.split('-')[0].length === 4) return trimmed; // Already YYYY-MM-DD
        const parts = trimmed.split(/[-/]/);
        if (parts.length === 3) {
            // DD-MM-YYYY to YYYY-MM-DD
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
                    
                    // Format matching Member Master: [Flat] Code - Name (Wing) or Code - Name (Flat: Wing-Flat)
                    const flatDesc = (wing || flat) ? ` (Flat: ${wing ? wing + '-' : ''}${flat})` : '';
                    const label = `${code} - ${name}${flatDesc}`;
                    return `<option value="${code}">${label}</option>`;
                }).join('');

                fromSelect.innerHTML = options;
                toSelect.innerHTML = options;
                fromSelect.selectedIndex = 0; // First member according to Member Master
                toSelect.selectedIndex = members.length - 1; // Last member according to Member Master
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
    }

    // Extract Form Parameters live from inputs at execution time (Zero Caching)
    function getFilterParams() {
        const getVal = (id, fallback = '') => {
            const el = document.getElementById(id);
            return el ? String(el.value).trim() : fallback;
        };

        const activeSocietyId = getActiveSocietyId();
        const activeFYId = sessionStorage.getItem('activeFYId') || 1;

        const fromMem = getVal('fromMember');
        const toMem = getVal('toMember');
        const bFrom = normalizeDate(getVal('billFrom'));
        const bTo = normalizeDate(getVal('billTo'));
        const rFrom = normalizeDate(getVal('rcptFrom'));
        const rTo = normalizeDate(getVal('rcptTo'));

        // Email filter dropdown or radio
        let emailFilter = getVal('emailFilterSelect') || 'all';
        const checkedRadio = document.querySelector('input[name="emailFilter"]:checked');
        if (checkedRadio) {
            emailFilter = checkedRadio.value || emailFilter;
        }

        return {
            societyId: activeSocietyId,
            fyId: activeFYId,
            fromMemberCode: fromMem,
            toMemberCode: toMem,
            billDateFrom: bFrom,
            billDateTo: bTo,
            receiptDateFrom: rFrom,
            receiptDateTo: rTo,
            emailFilter: emailFilter
        };
    }

    // Summary Popover toggle
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

    function updateSummaryMetrics(bills) {
        const count = bills.length;
        let totCurrent = 0;
        let totArrears = 0;
        let totPayable = 0;

        bills.forEach(b => {
            totCurrent += Number(b.summary?.currentBill || 0);
            totArrears += Number(b.summary?.arrearsTotal || 0);
            totPayable += Number(b.summary?.netPayable || 0);
        });

        const badge = document.getElementById('badgeBillCount');
        if (badge) badge.textContent = `${count} Bills`;
        const kpiCount = document.getElementById('kpiBillCount');
        if (kpiCount) kpiCount.textContent = `${count} Bills`;
        const kpiCur = document.getElementById('kpiCurrentBill');
        if (kpiCur) kpiCur.textContent = `₹${totCurrent.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const kpiArr = document.getElementById('kpiArrears');
        if (kpiArr) kpiArr.textContent = `₹${totArrears.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const kpiPay = document.getElementById('kpiTotalPayable');
        if (kpiPay) kpiPay.textContent = `₹${totPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Fetch Bills & Render Preview (Idempotent, completely flushes DOM on every call)
    async function loadPreview() {
        const renderArea = document.getElementById('preview-render-area');
        if (renderArea) {
            // Completely flush previous DOM nodes and show immediate spinner
            renderArea.innerHTML = `
                <div style="color: #cbd5e1; text-align: center; margin-top: 140px;">
                    <div class="spinner-border text-light" role="status" style="width: 2.5rem; height: 2.5rem;"></div>
                    <div style="margin-top: 10px; font-size: 13px;">Generating preview...</div>
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
                result = await API.get(`reports/bill-format/gst-a4?${qs}`);
            } else {
                const token = sessionStorage.getItem('jwtToken');
                const res = await fetch(`${API_BASE}/reports/bill-format/gst-a4?${qs}`, {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'X-Society-Id': params.societyId,
                        'X-FY-Id': params.fyId
                    }
                });
                if (!res.ok) {
                    const text = await res.text();
                    let errMsg = `Server error (${res.status})`;
                    try { const j = JSON.parse(text); errMsg = j.message || errMsg; } catch (_) { if (text) errMsg = text; }
                    throw new Error(errMsg);
                }
                result = await res.json();
            }

            if (!result.success || !result.bills || result.bills.length === 0) {
                if (statusSummary) statusSummary.textContent = 'No bills found for current criteria.';
                if (renderArea) {
                    renderArea.innerHTML = `
                        <div class="preview-placeholder" style="color: #94a3b8; text-align: center; margin-top: 140px;">
                            <i class="bi bi-file-earmark-pdf" style="font-size: 48px; display: block; margin-bottom: 10px;"></i>
                            <div style="font-size: 15px; font-weight: 600; color: #cbd5e1;">No Bills Found</div>
                            <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">No maintenance bills match the selected member range or dates.</div>
                        </div>
                    `;
                }
                alert(result.message || 'No maintenance bills found for the selected criteria.');
                return;
            }

            loadedBillsData = result;
            updateSummaryMetrics(result.bills || []);
            renderBillsHTML(result);

            // Enable print button
            const printBtn = document.getElementById('btn-print');
            if (printBtn) printBtn.disabled = false;
            if (statusSummary) statusSummary.textContent = `Loaded ${result.bills.length} bill(s). Ready to print.`;
        } catch (err) {
            console.error("Preview render failed", err);
            if (statusSummary) statusSummary.textContent = 'Error loading bills.';
            if (renderArea) {
                renderArea.innerHTML = `
                    <div style="color: #f87171; text-align: center; margin-top: 140px;">
                        <i class="bi bi-exclamation-triangle" style="font-size: 40px; display: block; margin-bottom: 10px;"></i>
                        <div style="font-size: 14px; font-weight: 600;">Failed to Load Preview</div>
                        <div style="font-size: 12px; margin-top: 4px;">${err.message}</div>
                    </div>
                `;
            }
            alert("Error generating bill preview: " + err.message);
        }
    }

    // Dynamic UI Toggle Evaluation & A4 Sheet Generation
    function renderBillsHTML(data) {
        const { society, bills } = data;
        let container = document.getElementById('preview-render-area');
        if (!container) {
            const viewport = document.getElementById('preview-viewport') || document.body;
            container = document.createElement('div');
            container.id = 'preview-render-area';
            container.style.width = '100%';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            viewport.appendChild(container);
        }

        container.innerHTML = '';

        // Read all toggles and parameters dynamically
        const headingTitle = (document.getElementById('headingTitle')?.value || 'GST INVOICE').trim();
        const prefixBillNo = (document.getElementById('prefixBillNo')?.value || '').trim();
        const printPan = document.getElementById('printPan')?.checked ?? true;
        const printGst = document.getElementById('printGst')?.checked ?? true;

        const blankAcNo = (document.getElementById('blankAcNo')?.value || 'No') === 'Yes';
        const showBldgWing = (document.getElementById('showBldgWing')?.value || 'Yes') === 'Yes';
        const showArrears = (document.getElementById('showArrears')?.value || 'Yes') === 'Yes';
        const arrearsBifurcation = (document.getElementById('arrearsBifurcation')?.value || 'Yes') === 'Yes';
        const blankReceipt = (document.getElementById('blankReceipt')?.value || 'Yes') === 'Yes';
        const printQr = (document.getElementById('printQr')?.value || 'Yes') === 'Yes';
        const printSign = (document.getElementById('printSign')?.value || 'Yes') === 'Yes';

        bills.forEach((b) => {
            const page = document.createElement('div');
            page.className = 'bill-page';

            const displayBillNo = prefixBillNo ? `${prefixBillNo}${b.bill.billNo}` : b.bill.billNo;

            // Dynamic UPI String
            const upiString = `upi://pay?pa=${society.accountNo}@${society.ifsc}.ifsc&pn=${encodeURIComponent(society.name)}&am=${b.summary.netPayable}&cu=INR`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(upiString)}`;

            // Arrears calculations based on toggles
            let arrearsBlockHtml = '';
            if (showArrears) {
                if (arrearsBifurcation) {
                    arrearsBlockHtml = `
                        <div style="border-top: 1px solid #000; padding-top: 4px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Arrears Prin.</span>
                                <span>${Number(b.summary.arrearsPrin).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Arrears Int.</span>
                                <span>${Number(b.summary.arrearsInt).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid #ccc;">
                                <span>Arrears Total</span>
                                <span>${Number(b.summary.arrearsTotal).toFixed(2)}</span>
                            </div>
                        </div>
                    `;
                } else {
                    arrearsBlockHtml = `
                        <div style="border-top: 1px solid #000; padding-top: 4px;">
                            <div style="display: flex; justify-content: space-between; font-weight: bold;">
                                <span>Arrears Total</span>
                                <span>${Number(b.summary.arrearsTotal).toFixed(2)}</span>
                            </div>
                        </div>
                    `;
                }
            }

            const netPayable = showArrears ? b.summary.netPayable : b.summary.currentBill;

            page.innerHTML = `
                <!-- Society Header -->
                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px;">
                    <div style="font-size: 16px; font-weight: bold; text-transform: uppercase;">${society.name}</div>
                    <div style="font-size: 10px; margin-top: 2px;">Registration No.: ${society.registrationNo}</div>
                    <div style="font-size: 10px;">Address: ${society.address}</div>
                    <div style="font-size: 10px;">Email: ${society.email} | Tel No.: ${society.phone || '-'}</div>
                    <div style="font-size: 11px; font-weight: bold; margin-top: 4px; display: flex; justify-content: space-between;">
                        <span>${printPan ? `PAN No.: ${society.pan}` : ''}</span>
                        <span>${printGst ? `GSTIN: ${society.gstin} (SAC-${society.sacCode})` : ''}</span>
                    </div>
                </div>

                <!-- Member and Invoice Meta Grid -->
                <div style="display: flex; border-bottom: 1px solid #000;">
                    <div style="flex: 1.3; padding: 6px; border-right: 1px solid #000;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span><strong>Flat No:</strong> ${b.member.flatNo}</span>
                            <span><strong>Floor:</strong> ${b.member.floor || 'FIRST'}</span>
                            ${showBldgWing ? `<span><strong>Bldg:</strong> ${b.member.building || '-'}</span><span><strong>Wing:</strong> ${b.member.wing || '-'}</span>` : ''}
                        </div>
                        <div style="margin-bottom: 4px;"><strong>Name:</strong> ${b.member.name}</div>
                        <div><strong>Area:</strong> ${b.member.area} Sq.Ft.</div>
                    </div>
                    <div style="flex: 1; padding: 6px;">
                        <div style="font-weight: bold; font-size: 13px; text-align: center; margin-bottom: 4px;">"${headingTitle}"</div>
                        <div style="display: flex; justify-content: space-between; border-top: 1px solid #ccc; padding-top: 2px;">
                            <span><strong>No.:</strong> ${displayBillNo}</span>
                            <span><strong>Due Date:</strong> ${b.bill.dueDate}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span><strong>Date:</strong> ${b.bill.billDate}</span>
                            <span><strong>Month:</strong> ${b.bill.month}</span>
                        </div>
                    </div>
                </div>

                <!-- Columns: Line Items & Bill Summary -->
                <div style="display: flex; border-bottom: 1px solid #000; min-height: 480px;">
                    <!-- Particulars Column -->
                    <div style="flex: 1.4; border-right: 1px solid #000; display: flex; flex-direction: column;">
                        <div style="display: flex; font-weight: bold; border-bottom: 1px solid #000; background: #eee; padding: 4px;">
                            <span style="flex: 1;">Particulars</span>
                            <span style="width: 75px; text-align: right;">Amount</span>
                            <span style="width: 75px; text-align: right;">Total</span>
                        </div>
                        <div style="padding: 4px; flex: 1;">
                            <div style="font-weight: bold; margin-top: 3px;">NON-GST APPLICABLE ACCOUNT :</div>
                            ${b.nonGstItems.map(i => `
                                <div style="display: flex; justify-content: space-between; padding-left: 10px;">
                                    <span>${i.head}</span>
                                    <span>${Number(i.amount).toFixed(2)}</span>
                                </div>
                            `).join('')}
                            <div style="text-align: right; font-weight: bold; border-bottom: 1px solid #ddd; padding: 2px 0;">
                                ${Number(b.summary.subtotalNonGst).toFixed(2)}
                            </div>

                            <div style="font-weight: bold; margin-top: 8px;">EXEMPT-GST ACCOUNT :</div>
                            ${b.exemptItems.map(i => `
                                <div style="display: flex; justify-content: space-between; padding-left: 10px;">
                                    <span>${i.head}</span>
                                    <span>${Number(i.amount).toFixed(2)}</span>
                                </div>
                            `).join('')}
                            <div style="text-align: right; font-weight: bold; border-bottom: 1px solid #ddd; padding: 2px 0;">
                                ${Number(b.summary.subtotalExempt).toFixed(2)}
                            </div>

                            <div style="font-weight: bold; margin-top: 8px;">GST APPLICABLE ACCOUNT :</div>
                            ${b.taxableItems.map(i => `
                                <div style="display: flex; justify-content: space-between; padding-left: 10px;">
                                    <span>${i.head}</span>
                                    <span>${Number(i.amount).toFixed(2)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Bill Summary Column -->
                    <div style="flex: 1; display: flex; flex-direction: column;">
                        <div style="font-weight: bold; border-bottom: 1px solid #000; background: #eee; padding: 4px; text-align: center;">
                            Bill Summary
                        </div>
                        <div style="padding: 6px; font-size: 11px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Total (GST A/c Head)</span>
                                <span>${Number(b.summary.subtotalTaxable).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>CGST - 9%</span>
                                <span>${Number(b.summary.cgst).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>SGST - 9%</span>
                                <span>${Number(b.summary.sgst).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid #000; margin-top: 4px;">
                                <span>Total GST A/c Head + GST</span>
                                <span>${Number(b.summary.totalGstHeadPlusTax).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding-bottom: 4px;">
                                <span>Total (Non GST + Exempt)</span>
                                <span>${Number(b.summary.totalNonGstPlusExempt).toFixed(2)}</span>
                            </div>

                            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; padding: 6px 0;">
                                <span>Current Bill</span>
                                <span>${Number(b.summary.currentBill).toFixed(2)}</span>
                            </div>

                            ${arrearsBlockHtml}

                            <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; background: #eee; padding: 6px; margin-top: 12px; border: 1px solid #000;">
                                <span>Net Payable</span>
                                <span>₹${Number(netPayable).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer: Bank, QR, Signature -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${printQr ? `<img src="${qrUrl}" alt="UPI QR" style="width: 85px; height: 85px; border: 1px solid #999; padding: 2px;" />` : ''}
                        <div style="font-size: 10px;">
                            <div><strong>Bank:</strong> ${society.bankName || '-'}</div>
                            <div><strong>A/c No:</strong> ${blankAcNo ? 'XXXXXXXXXXXX' : (society.accountNo || '-')}</div>
                            <div><strong>IFSC:</strong> ${society.ifsc || '-'}</div>
                            <div>Scan to pay directly via any UPI App</div>
                        </div>
                    </div>
                    <div style="text-align: center; width: 220px; border-top: 1px solid #000; padding-top: 4px; margin-top: 45px; visibility: ${printSign ? 'visible' : 'hidden'};">
                        <strong>For ${society.name}</strong><br>
                        <span style="font-size: 10px;">Hon. Secretary / Treasurer</span>
                    </div>
                </div>

                ${blankReceipt ? `
                <!-- Receipt Counterfoil -->
                <div style="border: 1.5px dashed #000; margin-top: 12px; padding: 8px; font-size: 10px; background: #fdfdfd;">
                    <div style="text-align: center; font-weight: bold; font-size: 11px; margin-bottom: 4px; border-bottom: 1px solid #999; padding-bottom: 2px;">
                        RECEIPT COUNTERFOIL (FOR MEMBER'S RECORD)
                    </div>
                    <div style="display: flex; justify-content: space-between; line-height: 1.6;">
                        <div>
                            <div><strong>Received From:</strong> ${b.member.name} (${b.member.code})</div>
                            <div><strong>Flat No:</strong> ${b.member.flatNo} | <strong>Bill No:</strong> ${displayBillNo}</div>
                        </div>
                        <div style="text-align: right;">
                            <div><strong>Amount:</strong> ₹${Number(netPayable).toFixed(2)}</div>
                            <div><strong>Date:</strong> ___________________</div>
                        </div>
                    </div>
                    <div style="text-align: right; margin-top: 14px; font-weight: bold;">
                        Authorized Signatory
                    </div>
                </div>
                ` : ''}
            `;
            container.appendChild(page);
        });
    }

    // Direct High-Fidelity PDF Creation & Print Engine
    function triggerPrint() {
        const renderArea = document.getElementById('preview-render-area');
        if (!renderArea || !loadedBillsData) {
            alert('Please click "Preview" first to generate the bills before printing.');
            return;
        }

        const printWindow = window.open('', '_blank', 'width=900,height=800');
        printWindow.document.open();
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>GST Maintenance Invoices</title>
                <style>
                    @page { size: A4 portrait; margin: 0; }
                    body { margin: 0; padding: 10mm; background: #fff; }
                    .bill-page { width: 190mm !important; min-height: 275mm !important; margin: 0 auto 20mm auto !important; page-break-after: always !important; }
                    @media print {
                        body { padding: 0; }
                        .bill-page { border: none !important; margin: 0 !important; }
                    }
                </style>
            </head>
            <body>
                ${renderArea.innerHTML}
                <script>
                    window.onload = function() {
                        window.focus();
                        window.print();
                        window.close();
                    };
                <\/script>
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

        initFiscalDates();

        const statusSummary = document.getElementById('statusSummary');
        if (statusSummary) statusSummary.textContent = 'Ready. Select parameters and click Preview.';

        const renderArea = document.getElementById('preview-render-area');
        if (renderArea) {
            renderArea.innerHTML = `
                <div class="preview-placeholder" style="color: #94a3b8; text-align: center; margin-top: 140px;">
                    <i class="bi bi-file-earmark-pdf" style="font-size: 48px; display: block; margin-bottom: 10px;"></i>
                    <div style="font-size: 15px; font-weight: 600; color: #cbd5e1;">A4 GST Invoice Preview</div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Configure parameters on the left and click <strong>Preview</strong>.</div>
                </div>`;
        }

        const printBtn = document.getElementById('btn-print');
        if (printBtn) printBtn.disabled = true;
        loadedBillsData = null;
    }

    // Idempotent Event Bindings (Zero stack duplication)
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

    // Expose functions globally
    window.loadAndPreviewBills = loadPreview;
    window.printBills = triggerPrint;
    window.resetFilters = resetForm;
})();
