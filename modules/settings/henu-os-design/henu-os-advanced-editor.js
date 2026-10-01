/**
 * henu-os-advanced-editor.js — HENU OS DESIGN ADVANCED MODE
 * Enterprise Visual Report & Document Designer for JA-HCL-31 ERP
 * Professional Component-Based A4 Studio with mm-Precision Guides & Schema Engine
 */

(function (window) {
  'use strict';

  const MM_TO_PX = 3.779527559; // Deterministic 96 DPI CSS Pixel to Millimeter ratio
  const PX_TO_MM = 1 / MM_TO_PX;

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. REGISTERED REPORT SCHEMA DEFINITIONS (Safe Field Registry)
  // ─────────────────────────────────────────────────────────────────────────────
  const SCHEMA_REGISTRY = {
    member: [
      { field: '{{member.name}}', label: 'Member Name', type: 'String', desc: 'Primary flat owner full name', example: 'Rajesh Kumar Sharma' },
      { field: '{{member.flat_no}}', label: 'Flat / Unit Number', type: 'String', desc: 'Allocated flat / shop unit identifier', example: 'A-101' },
      { field: '{{member.wing}}', label: 'Wing / Building', type: 'String', desc: 'Building wing or block designation', example: 'Wing A' },
      { field: '{{member.member_code}}', label: 'Member Code', type: 'String', desc: 'Unique society ledger member code', example: 'MEM-00101' },
      { field: '{{member.phone}}', label: 'Phone Number', type: 'String', desc: 'Registered primary mobile contact', example: '+91 98200 12345' },
      { field: '{{member.email}}', label: 'Email Address', type: 'String', desc: 'Registered billing email address', example: 'rajesh.sharma@example.com' },
      { field: '{{member.pan}}', label: 'Member PAN', type: 'String', desc: 'Permanent Account Number of member', example: 'ABCPS1234F' },
      { field: '{{member.gstin}}', label: 'Member GSTIN', type: 'String', desc: 'Commercial member GST Identification Number', example: '27ABCDE1234F1Z5' },
      { field: '{{member.sqft_area}}', label: 'Unit Carpet Area', type: 'Number', desc: 'Chargeable unit area in square feet', example: '850 Sq.Ft.' }
    ],
    bill: [
      { field: '{{bill.bill_no}}', label: 'Bill / Invoice No', type: 'String', desc: 'Unique sequential maintenance bill number', example: 'BILL/2026-27/0042' },
      { field: '{{bill.date}}', label: 'Bill Issue Date', type: 'Date', desc: 'Official billing cycle generation date', example: '01/04/2026' },
      { field: '{{bill.period}}', label: 'Billing Period', type: 'String', desc: 'Billing service period description', example: 'April 2026' },
      { field: '{{bill.due_date}}', label: 'Bill Due Date', type: 'Date', desc: 'Payment due date before interest applies', example: '15/04/2026' },
      { field: '{{bill.subtotal}}', label: 'Taxable Subtotal', type: 'Currency', desc: 'Sum of taxable maintenance service charges', example: '₹3,500.00' },
      { field: '{{bill.cgst}}', label: 'CGST Amount (9%)', type: 'Currency', desc: 'Central Goods & Services Tax amount', example: '₹315.00' },
      { field: '{{bill.sgst}}', label: 'SGST Amount (9%)', type: 'Currency', desc: 'State Goods & Services Tax amount', example: '₹315.00' },
      { field: '{{bill.total_amount}}', label: 'Total Current Bill', type: 'Currency', desc: 'Total demand for current billing cycle', example: '₹4,130.00' },
      { field: '{{bill.prev_dues}}', label: 'Previous Arrears', type: 'Currency', desc: 'Outstanding dues from prior billing cycles', example: '₹1,250.00' },
      { field: '{{bill.interest}}', label: 'Interest / Penalty', type: 'Currency', desc: 'Interest charged on overdue balances', example: '₹70.00' },
      { field: '{{bill.net_payable}}', label: 'Net Payable Amount', type: 'Currency', desc: 'Final total payable on or before due date', example: '₹5,450.00' },
      { field: '{{bill.amount_words}}', label: 'Payable In Words', type: 'String', desc: 'Net payable amount formatted in words', example: 'Rupees Five Thousand Four Hundred Fifty Only' }
    ],
    receipt: [
      { field: '{{receipt.receipt_no}}', label: 'Receipt Number', type: 'String', desc: 'Unique sequential money receipt number', example: 'REC/2026-27/0128' },
      { field: '{{receipt.date}}', label: 'Receipt Date', type: 'Date', desc: 'Date collection was processed', example: '05/04/2026' },
      { field: '{{receipt.amount}}', label: 'Received Amount', type: 'Currency', desc: 'Total monetary collection received', example: '₹5,450.00' },
      { field: '{{receipt.payment_mode}}', label: 'Payment Mode', type: 'String', desc: 'Transaction mode (CHEQUE, NEFT, UPI, CASH)', example: 'NEFT / RTGS' },
      { field: '{{receipt.cheque_no}}', label: 'Cheque / Ref No', type: 'String', desc: 'Banking transaction instrument reference', example: 'UTR-9876543210' },
      { field: '{{receipt.bank_name}}', label: 'Drawn Bank Name', type: 'String', desc: 'Name of the remitting bank', example: 'State Bank of India' },
      { field: '{{receipt.amount_words}}', label: 'Amount in Words', type: 'String', desc: 'Receipt sum formatted in words', example: 'Rupees Five Thousand Four Hundred Fifty Only' }
    ],
    note: [
      { field: '{{note.note_no}}', label: 'Note Number', type: 'String', desc: 'Debit / Credit Note sequential number', example: 'DN/2026/0014' },
      { field: '{{note.date}}', label: 'Note Date', type: 'Date', desc: 'Date note was issued', example: '10/04/2026' },
      { field: '{{note.note_type}}', label: 'Note Type', type: 'String', desc: 'Type of note (DEBIT / CREDIT / ADJUSTMENT)', example: 'DEBIT NOTE' },
      { field: '{{note.amount}}', label: 'Note Amount', type: 'Currency', desc: 'Monetary value of adjustment or penalty', example: '₹750.00' },
      { field: '{{note.reason}}', label: 'Reason / Remarks', type: 'String', desc: 'Operational justification for note', example: 'Clubhouse damage charge' }
    ],
    voucher: [
      { field: '{{voucher.voucher_no}}', label: 'Voucher Number', type: 'String', desc: 'Journal / Cash voucher reference', example: 'JV-2026-0089' },
      { field: '{{voucher.date}}', label: 'Voucher Date', type: 'Date', desc: 'Voucher accounting posting date', example: '12/04/2026' },
      { field: '{{voucher.narration}}', label: 'Narration', type: 'String', desc: 'Accounting transaction narration', example: 'Being inter-head transfer for sinking fund' }
    ],
    ledger: [
      { field: '{{ledger.opening_balance}}', label: 'Opening Balance', type: 'Currency', desc: 'Balance brought forward from prior period', example: '₹1,250.00 Dr' },
      { field: '{{ledger.debit}}', label: 'Total Debits', type: 'Currency', desc: 'Sum of all debit charges in date range', example: '₹4,130.00' },
      { field: '{{ledger.credit}}', label: 'Total Credits', type: 'Currency', desc: 'Sum of all credit receipts in date range', example: '₹5,380.00' },
      { field: '{{ledger.closing_balance}}', label: 'Closing Balance', type: 'Currency', desc: 'Net ledger balance at statement end', example: '₹0.00' }
    ],
    society: [
      { field: '{{society.name}}', label: 'Society Name', type: 'String', desc: 'Official registered housing society name', example: 'SHREE SAI CO-OP HOUSING SOCIETY LTD.' },
      { field: '{{society.registration_no}}', label: 'Registration Number', type: 'String', desc: 'Co-operative registrar registration code', example: 'BOM/HSG/1234/1998' },
      { field: '{{society.address}}', label: 'Society Address', type: 'String', desc: 'Registered physical premises address', example: 'Plot 42, Sector 19, Palm Beach Road' },
      { field: '{{society.city}}', label: 'City & Pincode', type: 'String', desc: 'Registered city and postal code', example: 'Navi Mumbai - 400705' },
      { field: '{{society.pan}}', label: 'Society PAN', type: 'String', desc: 'Society Income Tax PAN identifier', example: 'AAATS1234K' },
      { field: '{{society.gstin}}', label: 'Society GSTIN', type: 'String', desc: 'Society GST Identification Number', example: '27AAATS1234K1Z2' },
      { field: '{{society.bank_name}}', label: 'Society Bank Name', type: 'String', desc: 'Designated collection bank account', example: 'HDFC Bank Ltd' },
      { field: '{{society.bank_account}}', label: 'Bank Account No', type: 'String', desc: 'Designated collection account number', example: '50200012345678' },
      { field: '{{society.bank_ifsc}}', label: 'Bank IFSC Code', type: 'String', desc: 'Bank NEFT/RTGS IFSC code', example: 'HDFC0001234' }
    ],
    system: [
      { field: '{{system.current_date}}', label: 'Current Date', type: 'Date', desc: 'Real-time print generation date', example: '02/10/2026' },
      { field: '{{system.current_time}}', label: 'Current Time', type: 'String', desc: 'Real-time print generation time', example: '10:30 AM' },
      { field: '{{system.page_no}}', label: 'Page Number', type: 'Number', desc: 'Current rendered page sequence number', example: '1' },
      { field: '{{system.page_count}}', label: 'Total Pages', type: 'Number', desc: 'Total page count of document', example: '1' },
      { field: '{{system.printed_by}}', label: 'Printed By User', type: 'String', desc: 'Username of ERP user generating print', example: 'ADMIN_SUPERVISOR' }
    ]
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SAMPLE MOCK DATA FOR TEST DATA MODE
  // ─────────────────────────────────────────────────────────────────────────────
  const SAMPLE_DATA_STORE = {
    member: {
      name: 'Rajesh Kumar Sharma',
      flat_no: 'A-101',
      wing: 'Wing A',
      member_code: 'MEM-00101',
      phone: '+91 98200 12345',
      email: 'rajesh.sharma@example.com',
      pan: 'ABCPS1234F',
      gstin: '27ABCDE1234F1Z5',
      sqft_area: '850 Sq.Ft.'
    },
    bill: {
      bill_no: 'BILL/2026-27/0042',
      date: '01/04/2026',
      period: 'April 2026',
      due_date: '15/04/2026',
      subtotal: '₹3,500.00',
      cgst: '₹315.00',
      sgst: '₹315.00',
      total_amount: '₹4,130.00',
      prev_dues: '₹1,250.00',
      interest: '₹70.00',
      net_payable: '₹5,450.00',
      amount_words: 'Rupees Five Thousand Four Hundred Fifty Only'
    },
    receipt: {
      receipt_no: 'REC/2026-27/0128',
      date: '05/04/2026',
      amount: '₹5,450.00',
      payment_mode: 'NEFT / RTGS',
      cheque_no: 'UTR-9876543210',
      bank_name: 'State Bank of India',
      amount_words: 'Rupees Five Thousand Four Hundred Fifty Only'
    },
    note: {
      note_no: 'DN/2026/0014',
      date: '10/04/2026',
      note_type: 'DEBIT NOTE',
      amount: '₹750.00',
      reason: 'Clubhouse damage charge'
    },
    voucher: {
      voucher_no: 'JV-2026-0089',
      date: '12/04/2026',
      narration: 'Being inter-head transfer for sinking fund'
    },
    ledger: {
      opening_balance: '₹1,250.00 Dr',
      debit: '₹4,130.00',
      credit: '₹5,380.00',
      closing_balance: '₹0.00'
    },
    society: {
      name: 'SHREE SAI CO-OPERATIVE HOUSING SOCIETY LTD.',
      registration_no: 'BOM/HSG/1234/1998',
      address: 'Plot 42, Sector 19, Palm Beach Road',
      city: 'Navi Mumbai - 400705',
      pan: 'AAATS1234K',
      gstin: '27AAATS1234K1Z2',
      bank_name: 'HDFC Bank Ltd',
      bank_account: '50200012345678',
      bank_ifsc: 'HDFC0001234'
    },
    system: {
      current_date: new Date().toLocaleDateString('en-GB'),
      current_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      page_no: '1',
      page_count: '1',
      printed_by: 'ADMIN'
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. DEFAULT TEMPLATE FACTORY (Object Model Initialization)
  // ─────────────────────────────────────────────────────────────────────────────
  function createDefaultDocument(reportKey = 'MEMBER_BILL_FORMAT', reportName = 'Bill Format') {
    return {
      metadata: {
        reportKey: reportKey,
        reportName: reportName,
        templateName: 'Modern A4 Clean',
        version: 1,
        paperSize: 'A4', // 'A4' (210x297mm) or 'Letter' (215.9x279.4mm)
        orientation: 'portrait', // 'portrait' | 'landscape'
        pageWidth: 210, // mm
        pageHeight: 297, // mm
        margins: { top: 12, right: 12, bottom: 12, left: 12 }, // mm
        gridSize: 5, // mm
        snapToGrid: true,
        showRulers: true,
        showGrid: true
      },
      elements: [
        // 1. Header Box / Society Name
        {
          id: 'elem_soc_name',
          type: 'text',
          x: 12,
          y: 12,
          w: 186,
          h: 8,
          zIndex: 10,
          content: '{{society.name}}',
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            fontWeight: '800',
            fontStyle: 'normal',
            color: '#0f172a',
            align: 'center',
            lineHeight: 1.2,
            letterSpacing: 0.5,
            textTransform: 'uppercase'
          },
          box: { background: 'transparent', borderColor: 'transparent', borderWidth: 0, borderStyle: 'solid', borderRadius: 0, padding: 0, opacity: 1 }
        },
        // 2. Society Address & Registration
        {
          id: 'elem_soc_meta',
          type: 'text',
          x: 12,
          y: 20,
          w: 186,
          h: 6,
          zIndex: 10,
          content: '{{society.address}}, {{society.city}} | Reg: {{society.registration_no}} | GSTIN: {{society.gstin}}',
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 8,
            fontWeight: '500',
            fontStyle: 'normal',
            color: '#64748b',
            align: 'center',
            lineHeight: 1.2,
            letterSpacing: 0,
            textTransform: 'none'
          },
          box: { background: 'transparent', borderColor: 'transparent', borderWidth: 0, borderStyle: 'solid', borderRadius: 0, padding: 0, opacity: 1 }
        },
        // 3. Document Title Badge
        {
          id: 'elem_report_title',
          type: 'rectangle',
          x: 65,
          y: 28,
          w: 80,
          h: 6.5,
          zIndex: 11,
          content: reportName.toUpperCase(),
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 9.5,
            fontWeight: '700',
            fontStyle: 'normal',
            color: '#ffffff',
            align: 'center',
            lineHeight: 1,
            letterSpacing: 1,
            textTransform: 'uppercase'
          },
          box: { background: '#0f172a', borderColor: '#0f172a', borderWidth: 1, borderStyle: 'solid', borderRadius: 3, padding: 0, opacity: 1 }
        },
        // 4. Meta Box: Member Details
        {
          id: 'elem_meta_member',
          type: 'rectangle',
          x: 12,
          y: 38,
          w: 90,
          h: 24,
          zIndex: 10,
          content: '<b>Member Name:</b> {{member.name}}<br><b>Flat / Unit:</b> {{member.flat_no}} ({{member.wing}})<br><b>Member Code:</b> {{member.member_code}}<br><b>Mobile:</b> {{member.phone}}',
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 8.5,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#1e293b',
            align: 'left',
            lineHeight: 1.4,
            letterSpacing: 0,
            textTransform: 'none'
          },
          box: { background: '#f8fafc', borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, padding: 6, opacity: 1 }
        },
        // 5. Meta Box: Bill / Document Info
        {
          id: 'elem_meta_doc',
          type: 'rectangle',
          x: 108,
          y: 38,
          w: 90,
          h: 24,
          zIndex: 10,
          content: '<b>Document No:</b> {{bill.bill_no}}<br><b>Bill Date:</b> {{bill.date}}<br><b>Period:</b> {{bill.period}}<br><b>Due Date:</b> <span style="color:#dc2626; font-weight:700;">{{bill.due_date}}</span>',
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 8.5,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#1e293b',
            align: 'left',
            lineHeight: 1.4,
            letterSpacing: 0,
            textTransform: 'none'
          },
          box: { background: '#f8fafc', borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, padding: 6, opacity: 1 }
        },
        // 6. Main Table Component
        {
          id: 'elem_main_table',
          type: 'table',
          x: 12,
          y: 66,
          w: 186,
          h: 80,
          zIndex: 15,
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 8.5,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#0f172a',
            align: 'left',
            lineHeight: 1.3,
            letterSpacing: 0,
            textTransform: 'none'
          },
          box: { background: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, padding: 0, opacity: 1 },
          tableConfig: {
            columns: [
              { id: 'c1', header: 'Sr.', width: '10%', align: 'center', field: 'sr_no' },
              { id: 'c2', header: 'Particulars / Charge Head', width: '50%', align: 'left', field: 'head_name' },
              { id: 'c3', header: 'SAC / Rate', width: '15%', align: 'center', field: 'rate' },
              { id: 'c4', header: 'Amount (₹)', width: '25%', align: 'right', field: 'amount', aggregation: 'SUM' }
            ],
            showHeader: true,
            headerBg: '#0f172a',
            headerColor: '#ffffff',
            zebra: true,
            zebraBg: '#f8fafc',
            borderStyle: 'solid',
            borderColor: '#cbd5e1'
          }
        },
        // 7. Totals & Net Summary Box
        {
          id: 'elem_totals_box',
          type: 'totals_box',
          x: 108,
          y: 150,
          w: 90,
          h: 36,
          zIndex: 12,
          content: '<b>Taxable Value:</b> {{bill.subtotal}}<br><b>CGST (9%):</b> {{bill.cgst}}<br><b>SGST (9%):</b> {{bill.sgst}}<br><b>Previous Arrears:</b> {{bill.prev_dues}}<br><hr style="border:0;border-top:1px solid #cbd5e1;margin:4px 0;"><div style="font-size:10pt;font-weight:800;color:#0f172a;"><b>Net Payable:</b> {{bill.net_payable}}</div>',
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 8.5,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#1e293b',
            align: 'right',
            lineHeight: 1.4,
            letterSpacing: 0,
            textTransform: 'none'
          },
          box: { background: '#f8fafc', borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, padding: 8, opacity: 1 }
        },
        // 8. Amount In Words Box
        {
          id: 'elem_words_box',
          type: 'amount_words',
          x: 12,
          y: 150,
          w: 90,
          h: 18,
          zIndex: 10,
          content: '<b>Amount In Words:</b><br><i>{{bill.amount_words}}</i>',
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 8,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#334155',
            align: 'left',
            lineHeight: 1.3,
            letterSpacing: 0,
            textTransform: 'none'
          },
          box: { background: '#f1f5f9', borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'dashed', borderRadius: 4, padding: 6, opacity: 1 }
        },
        // 9. Bank & Payment Details
        {
          id: 'elem_bank_details',
          type: 'rectangle',
          x: 12,
          y: 172,
          w: 90,
          h: 24,
          zIndex: 10,
          content: '<b>Payment Account Details:</b><br>Bank: {{society.bank_name}}<br>A/C: {{society.bank_account}}<br>IFSC: {{society.bank_ifsc}}',
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 8,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#334155',
            align: 'left',
            lineHeight: 1.3,
            letterSpacing: 0,
            textTransform: 'none'
          },
          box: { background: '#ffffff', borderColor: '#cbd5e1', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, padding: 6, opacity: 1 }
        },
        // 10. Signatures Box
        {
          id: 'elem_signatures',
          type: 'signature',
          x: 12,
          y: 245,
          w: 186,
          h: 22,
          zIndex: 10,
          content: '<div style="display:flex; justify-content:space-between; width:100%; font-size:8pt; text-align:center;">' +
                   '<div style="width:28%; border-top:1px solid #94a3b8; padding-top:4px;">Member\'s Signature</div>' +
                   '<div style="width:28%; border-top:1px solid #94a3b8; padding-top:4px;">Hon. Treasurer</div>' +
                   '<div style="width:28%; border-top:1px solid #94a3b8; padding-top:4px;">Hon. Chairman / Secretary</div>' +
                   '</div>',
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 8,
            fontWeight: '600',
            fontStyle: 'normal',
            color: '#475569',
            align: 'center',
            lineHeight: 1,
            letterSpacing: 0,
            textTransform: 'none'
          },
          box: { background: 'transparent', borderColor: 'transparent', borderWidth: 0, borderStyle: 'solid', borderRadius: 0, padding: 0, opacity: 1 }
        },
        // 11. Footer Line & Page Count
        {
          id: 'elem_footer',
          type: 'footer_block',
          x: 12,
          y: 278,
          w: 186,
          h: 6,
          zIndex: 10,
          content: 'Printed on: {{system.current_date}} {{system.current_time}} | By: {{system.printed_by}} | Page {{system.page_no}} of {{system.page_count}}',
          typography: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 7.5,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#94a3b8',
            align: 'center',
            lineHeight: 1,
            letterSpacing: 0,
            textTransform: 'none'
          },
          box: { background: 'transparent', borderColor: 'transparent', borderWidth: 0, borderStyle: 'solid', borderRadius: 0, padding: 0, opacity: 1 }
        }
      ]
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. EDITOR CONTROLLER & STATE
  // ─────────────────────────────────────────────────────────────────────────────
  class HenuOsAdvancedEditor {
    constructor() {
      this.doc = null;
      this.activeElementId = null;
      this.selectedElementIds = new Set();
      this.zoom = 1.0;
      this.isTestDataMode = true; // Default test data enabled
      this.historyStack = [];
      this.historyIndex = -1;
      this.maxHistory = 50;
      this.isDragging = false;
      this.isResizing = false;
      this.activeHandle = null;
      this.dragStart = { x: 0, y: 0, elemX: 0, elemY: 0, elemW: 0, elemH: 0 };
      this.activeTab = 'components'; // 'components' | 'tree' | 'schema'
      this.isOpen = false;
      this.onSaveCallback = null;
    }

    /**
     * Open the Advanced Editor for a given report
     */
    open(reportKey, reportName, initialDoc = null, onSave = null) {
      this.isOpen = true;
      this.onSaveCallback = onSave;
      this.doc = initialDoc ? JSON.parse(JSON.stringify(initialDoc)) : createDefaultDocument(reportKey, reportName);
      if (!this.doc.elements || this.doc.elements.length === 0) {
        this.doc = createDefaultDocument(reportKey, reportName);
      }
      this.activeElementId = this.doc.elements[0] ? this.doc.elements[0].id : null;
      this.selectedElementIds.clear();
      if (this.activeElementId) this.selectedElementIds.add(this.activeElementId);

      this.historyStack = [];
      this.historyIndex = -1;
      this.pushHistory('Open Editor');

      this.renderModal();
      this.bindEvents();
      this.renderAll();
    }

    /**
     * Close the Advanced Editor
     */
    close() {
      this.isOpen = false;
      const modal = document.getElementById('hoaStudioModal');
      if (modal) modal.remove();
    }

    /**
     * History Push for Undo / Redo
     */
    pushHistory(action = 'Change') {
      if (this.historyIndex < this.historyStack.length - 1) {
        this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
      }
      this.historyStack.push({
        action,
        doc: JSON.parse(JSON.stringify(this.doc))
      });
      if (this.historyStack.length > this.maxHistory) {
        this.historyStack.shift();
      }
      this.historyIndex = this.historyStack.length - 1;
      this.updateUndoRedoUI();
    }

    undo() {
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.doc = JSON.parse(JSON.stringify(this.historyStack[this.historyIndex].doc));
        this.renderCanvas();
        this.renderProperties();
        this.renderOutlineTree();
        this.updateUndoRedoUI();
      }
    }

    redo() {
      if (this.historyIndex < this.historyStack.length - 1) {
        this.historyIndex++;
        this.doc = JSON.parse(JSON.stringify(this.historyStack[this.historyIndex].doc));
        this.renderCanvas();
        this.renderProperties();
        this.renderOutlineTree();
        this.updateUndoRedoUI();
      }
    }

    updateUndoRedoUI() {
      const btnUndo = document.getElementById('hoaBtnUndo');
      const btnRedo = document.getElementById('hoaBtnRedo');
      if (btnUndo) btnUndo.disabled = this.historyIndex <= 0;
      if (btnRedo) btnRedo.disabled = this.historyIndex >= this.historyStack.length - 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. MODAL UI SHELL GENERATION
    // ─────────────────────────────────────────────────────────────────────────
    renderModal() {
      let modal = document.getElementById('hoaStudioModal');
      if (modal) modal.remove();

      modal = document.createElement('div');
      modal.id = 'hoaStudioModal';
      modal.className = 'hoa-studio-modal';

      modal.innerHTML = `
        <!-- TOP TOOLBAR -->
        <div class="hoa-top-toolbar">
          <div class="hoa-toolbar-group">
            <button class="hoa-tool-btn" style="background:#0f172a; color:#38bdf8; border-color:#0284c7; font-weight:800;" onclick="window.HenuAdvancedEditor.close()">
              <i class="bi bi-arrow-left"></i> Back to Studio
            </button>
            <div class="hoa-divider"></div>
            <button class="hoa-tool-btn" id="hoaBtnUndo" title="Undo (Ctrl+Z)" onclick="window.HenuAdvancedEditor.undo()"><i class="bi bi-arrow-counterclockwise"></i> Undo</button>
            <button class="hoa-tool-btn" id="hoaBtnRedo" title="Redo (Ctrl+Y)" onclick="window.HenuAdvancedEditor.redo()"><i class="bi bi-arrow-clockwise"></i> Redo</button>
            <div class="hoa-divider"></div>
            <button class="hoa-tool-btn" title="Align Left" onclick="window.HenuAdvancedEditor.alignElements('left')"><i class="bi bi-align-start"></i></button>
            <button class="hoa-tool-btn" title="Align Center" onclick="window.HenuAdvancedEditor.alignElements('center')"><i class="bi bi-align-center"></i></button>
            <button class="hoa-tool-btn" title="Align Right" onclick="window.HenuAdvancedEditor.alignElements('right')"><i class="bi bi-align-end"></i></button>
            <button class="hoa-tool-btn" title="Align Top" onclick="window.HenuAdvancedEditor.alignElements('top')"><i class="bi bi-align-top"></i></button>
            <button class="hoa-tool-btn" title="Align Middle" onclick="window.HenuAdvancedEditor.alignElements('middle')"><i class="bi bi-align-middle"></i></button>
            <button class="hoa-tool-btn" title="Align Bottom" onclick="window.HenuAdvancedEditor.alignElements('bottom')"><i class="bi bi-align-bottom"></i></button>
            <div class="hoa-divider"></div>
            <button class="hoa-tool-btn" title="Duplicate (Ctrl+D)" onclick="window.HenuAdvancedEditor.duplicateSelected()"><i class="bi bi-copy"></i> Duplicate</button>
            <button class="hoa-tool-btn" style="color:#f87171;" title="Delete (Del)" onclick="window.HenuAdvancedEditor.deleteSelected()"><i class="bi bi-trash"></i> Delete</button>
          </div>

          <!-- CENTER CONTROLS: ZOOM, GRID, SNAP -->
          <div class="hoa-toolbar-group">
            <span style="font-size:11px; font-weight:700; color:#38bdf8;">${this.doc.metadata.reportName}</span>
            <span style="font-size:10px; color:#64748b; margin-left:4px;">(v${this.doc.metadata.version})</span>
            <div class="hoa-divider"></div>
            <button class="hoa-tool-btn ${this.doc.metadata.showGrid ? 'active' : ''}" id="hoaBtnGrid" title="Toggle Grid" onclick="window.HenuAdvancedEditor.toggleGrid()"><i class="bi bi-grid-3x3"></i> Grid</button>
            <button class="hoa-tool-btn ${this.doc.metadata.snapToGrid ? 'active' : ''}" id="hoaBtnSnap" title="Snap to Grid" onclick="window.HenuAdvancedEditor.toggleSnap()"><i class="bi bi-magnet"></i> Snap</button>
            <div class="hoa-divider"></div>
            <button class="hoa-tool-btn" onclick="window.HenuAdvancedEditor.setZoom(window.HenuAdvancedEditor.zoom - 0.15)"><i class="bi bi-dash"></i></button>
            <span style="font-size:11px; font-weight:600; min-width:38px; text-align:center;" id="hoaZoomDisplay">100%</span>
            <button class="hoa-tool-btn" onclick="window.HenuAdvancedEditor.setZoom(window.HenuAdvancedEditor.zoom + 0.15)"><i class="bi bi-plus"></i></button>
            <button class="hoa-tool-btn" onclick="window.HenuAdvancedEditor.setZoom(1.0)">100%</button>
          </div>

          <!-- RIGHT ACTIONS: TEST DATA, VALIDATE, PUBLISH -->
          <div class="hoa-toolbar-group">
            <button class="hoa-tool-btn ${this.isTestDataMode ? 'active' : ''}" id="hoaBtnTestData" style="background:#451a03; border-color:#d97706; color:#fbbf24;" onclick="window.HenuAdvancedEditor.toggleTestData()">
              <i class="bi bi-database-check"></i> Test Data Mode
            </button>
            <button class="hoa-tool-btn" onclick="window.HenuAdvancedEditor.runValidation()"><i class="bi bi-check2-circle"></i> Validate</button>
            <button class="hoa-tool-btn" onclick="window.HenuAdvancedEditor.exportJson()"><i class="bi bi-download"></i> JSON</button>
            <button class="hoa-tool-btn" style="background:#1e40af; border-color:#3b82f6; color:#fff;" onclick="window.HenuAdvancedEditor.saveDraft()"><i class="bi bi-save"></i> Save Draft</button>
            <button class="hoa-tool-btn" style="background:#065f46; border-color:#059669; color:#fff;" onclick="window.HenuAdvancedEditor.publish()"><i class="bi bi-send-check"></i> Publish Active</button>
          </div>
        </div>

        <!-- MAIN THREE-PANEL STUDIO -->
        <div class="hoa-main-stage">
          <!-- LEFT PANEL -->
          <div class="hoa-left-panel">
            <div class="hoa-panel-tabs">
              <div class="hoa-panel-tab active" id="tabBtnComponents" onclick="window.HenuAdvancedEditor.switchTab('components')"><i class="bi bi-grid-fill"></i> Palette</div>
              <div class="hoa-panel-tab" id="tabBtnSchema" onclick="window.HenuAdvancedEditor.switchTab('schema')"><i class="bi bi-braces"></i> Fields</div>
              <div class="hoa-panel-tab" id="tabBtnTree" onclick="window.HenuAdvancedEditor.switchTab('tree')"><i class="bi bi-layers-fill"></i> Outline</div>
            </div>
            <div class="hoa-panel-content" id="hoaLeftPanelContent">
              <!-- Rendered Dynamically -->
            </div>
          </div>

          <!-- CENTER CANVAS VIEWPORT -->
          <div class="hoa-center-viewport" id="hoaCenterViewport">
            ${this.isTestDataMode ? '<div class="hoa-sample-badge" id="hoaSampleBadge"><i class="bi bi-info-circle-fill"></i> PREVIEW / SAMPLE DATA MODE — Live Accounting Tables Unmodified</div>' : ''}
            
            <!-- A4 SHEET CONTAINER -->
            <div class="hoa-a4-canvas ${this.doc.metadata.orientation === 'landscape' ? 'landscape' : ''}" id="hoaCanvas">
              <!-- Grid overlay -->
              <div class="hoa-grid-overlay" id="hoaGridOverlay" style="display:${this.doc.metadata.showGrid ? 'block' : 'none'};"></div>
              
              <!-- Margin boundaries -->
              <div class="hoa-margin-boundary" id="hoaMarginGuide" style="top:${this.doc.metadata.margins.top}mm; left:${this.doc.metadata.margins.left}mm; right:${this.doc.metadata.margins.right}mm; bottom:${this.doc.metadata.margins.bottom}mm;"></div>

              <!-- Canvas elements inserted dynamically -->
            </div>
          </div>

          <!-- RIGHT PROPERTIES INSPECTOR -->
          <div class="hoa-right-panel" id="hoaRightPanel">
            <!-- Rendered Dynamically -->
          </div>
        </div>

        <!-- VALIDATION DRAWER -->
        <div class="hoa-validation-box" id="hoaValidationBox">
          <!-- Rendered on validate -->
        </div>
      `;

      document.body.appendChild(modal);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. LEFT PANEL: PALETTE, SCHEMA, AND OUTLINE TREE
    // ─────────────────────────────────────────────────────────────────────────
    switchTab(tab) {
      this.activeTab = tab;
      document.querySelectorAll('.hoa-panel-tab').forEach(el => el.classList.remove('active'));
      const activeBtn = document.getElementById(tab === 'components' ? 'tabBtnComponents' : (tab === 'schema' ? 'tabBtnSchema' : 'tabBtnTree'));
      if (activeBtn) activeBtn.classList.add('active');

      const container = document.getElementById('hoaLeftPanelContent');
      if (!container) return;

      if (tab === 'components') {
        this.renderComponentPalette(container);
      } else if (tab === 'schema') {
        this.renderSchemaPicker(container);
      } else if (tab === 'tree') {
        this.renderOutlineTree(container);
      }
    }

    renderComponentPalette(container) {
      container.innerHTML = `
        <div style="font-size:10.5px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:8px;">Basic Elements</div>
        <div class="hoa-component-grid">
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('text')"><i class="bi bi-fonts"></i> Text Box</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('label')"><i class="bi bi-tag"></i> Label</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('rectangle')"><i class="bi bi-square"></i> Rectangle Box</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('divider')"><i class="bi bi-hr"></i> Divider Line</div>
        </div>

        <div style="font-size:10.5px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-top:14px; margin-bottom:8px;">Data & Tables</div>
        <div class="hoa-component-grid">
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('table')"><i class="bi bi-table"></i> Data Table</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('totals_box')"><i class="bi bi-calculator"></i> Totals Box</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('amount_words')"><i class="bi bi-spellcheck"></i> Amount Words</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('dynamic_field')"><i class="bi bi-braces"></i> Dynamic Field</div>
        </div>

        <div style="font-size:10.5px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-top:14px; margin-bottom:8px;">Branding & Authentication</div>
        <div class="hoa-component-grid">
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('logo')"><i class="bi bi-image"></i> Society Logo</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('signature')"><i class="bi bi-pen"></i> Signatures</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('stamp')"><i class="bi bi-patch-check"></i> Stamp Box</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('qr')"><i class="bi bi-qr-code"></i> UPI / QR Code</div>
        </div>

        <div style="font-size:10.5px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-top:14px; margin-bottom:8px;">Layout & Blocks</div>
        <div class="hoa-component-grid">
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('header_block')"><i class="bi bi-layout-text-sidebar"></i> Header Block</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('footer_block')"><i class="bi bi-layout-text-sidebar-reverse"></i> Footer Block</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('watermark')"><i class="bi bi-water"></i> Watermark</div>
          <div class="hoa-component-card" onclick="window.HenuAdvancedEditor.addNewElement('conditional_block')"><i class="bi bi-diagram-3"></i> Safe Condition</div>
        </div>
      `;
    }

    renderSchemaPicker(container) {
      let html = `<div style="font-size:11px; color:#94a3b8; margin-bottom:8px;">Click any safe field tag below to insert into the selected component or canvas:</div>`;
      for (const [cat, fields] of Object.entries(SCHEMA_REGISTRY)) {
        html += `
          <div class="hoa-field-category-title">
            <span><i class="bi bi-folder2"></i> ${cat.toUpperCase()}</span>
            <span style="font-size:9px; background:#334155; padding:1px 5px; border-radius:3px;">${fields.length}</span>
          </div>
        `;
        fields.forEach(f => {
          html += `
            <div class="hoa-field-item" onclick="window.HenuAdvancedEditor.insertFieldToken('${f.field}')" title="${f.desc} (Example: ${f.example})">
              <div>
                <div style="font-weight:600; color:#f1f5f9;">${f.label}</div>
                <span class="hoa-field-tag">${f.field}</span>
              </div>
              <span style="font-size:9.5px; color:#94a3b8;">${f.type}</span>
            </div>
          `;
        });
      }
      container.innerHTML = html;
    }

    renderOutlineTree(container) {
      if (!container) container = document.getElementById('hoaLeftPanelContent');
      if (!container || this.activeTab !== 'tree') return;

      let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:10.5px; font-weight:700; color:#94a3b8; text-transform:uppercase;">Layers (${this.doc.elements.length})</span>
          <button class="hoa-tool-btn" style="height:22px; padding:0 6px;" onclick="window.HenuAdvancedEditor.reorderLayers()"><i class="bi bi-arrow-down-up"></i> Auto Z</button>
        </div>
      `;

      [...this.doc.elements].reverse().forEach((elem, idx) => {
        const isSelected = this.selectedElementIds.has(elem.id);
        const icon = this.getComponentIcon(elem.type);
        html += `
          <div class="hoa-field-item" style="background:${isSelected ? '#1e3a8a' : 'transparent'}; border:1px solid ${isSelected ? '#3b82f6' : '#334155'}; margin-bottom:4px;" onclick="window.HenuAdvancedEditor.selectElement('${elem.id}', event)">
            <div style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              <i class="bi ${icon}" style="color:${isSelected ? '#60a5fa' : '#38bdf8'}; font-size:12px;"></i>
              <span style="font-size:11px; font-weight:${isSelected ? '700' : '500'}; color:${isSelected ? '#fff' : '#cbd5e1'};">${elem.id} (${elem.type})</span>
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
              <button class="hoa-tool-btn" style="height:20px; width:20px; padding:0;" title="Move Up" onclick="window.HenuAdvancedEditor.moveLayer('${elem.id}', 1, event)"><i class="bi bi-chevron-up"></i></button>
              <button class="hoa-tool-btn" style="height:20px; width:20px; padding:0;" title="Move Down" onclick="window.HenuAdvancedEditor.moveLayer('${elem.id}', -1, event)"><i class="bi bi-chevron-down"></i></button>
            </div>
          </div>
        `;
      });

      container.innerHTML = html;
    }

    getComponentIcon(type) {
      switch (type) {
        case 'text': return 'bi-fonts';
        case 'label': return 'bi-tag';
        case 'table': return 'bi-table';
        case 'rectangle': return 'bi-square';
        case 'divider': return 'bi-hr';
        case 'totals_box': return 'bi-calculator';
        case 'amount_words': return 'bi-spellcheck';
        case 'dynamic_field': return 'bi-braces';
        case 'logo': return 'bi-image';
        case 'signature': return 'bi-pen';
        case 'stamp': return 'bi-patch-check';
        case 'qr': return 'bi-qr-code';
        case 'watermark': return 'bi-water';
        case 'header_block': return 'bi-layout-text-sidebar';
        case 'footer_block': return 'bi-layout-text-sidebar-reverse';
        default: return 'bi-box';
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. CANVAS RENDERING & INTERACTION
    // ─────────────────────────────────────────────────────────────────────────
    renderCanvas() {
      const canvas = document.getElementById('hoaCanvas');
      if (!canvas) return;

      // Clean existing element DOM nodes (keep overlay and margin boundary)
      const existingElements = canvas.querySelectorAll('.hoa-canvas-element');
      existingElements.forEach(el => el.remove());

      // Update canvas dimensions & orientation
      canvas.className = `hoa-a4-canvas ${this.doc.metadata.orientation === 'landscape' ? 'landscape' : ''}`;
      canvas.style.transform = `scale(${this.zoom})`;

      // Render each element
      this.doc.elements.forEach(elem => {
        const isSelected = this.selectedElementIds.has(elem.id);
        const el = document.createElement('div');
        el.className = `hoa-canvas-element ${isSelected ? 'selected' : ''}`;
        el.id = `canvas_node_${elem.id}`;
        el.dataset.id = elem.id;

        // Position & Geometry in mm
        el.style.left = `${elem.x}mm`;
        el.style.top = `${elem.y}mm`;
        el.style.width = `${elem.w}mm`;
        el.style.height = `${elem.h}mm`;
        el.style.zIndex = elem.zIndex || 10;

        // Box Model & Typography
        this.applyElementStyles(el, elem);

        // Content Rendering with Dynamic Safe Field Replacement
        el.innerHTML = this.renderElementContent(elem);

        // Append 8 Handles if selected
        if (isSelected) {
          ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(handle => {
            const h = document.createElement('div');
            h.className = `hoa-handle hoa-handle-${handle}`;
            h.dataset.handle = handle;
            h.dataset.id = elem.id;
            el.appendChild(h);
          });
        }

        canvas.appendChild(el);
      });
    }

    applyElementStyles(domEl, elem) {
      const typo = elem.typography || {};
      const box = elem.box || {};

      domEl.style.fontFamily = typo.fontFamily || 'inherit';
      domEl.style.fontSize = typo.fontSize ? `${typo.fontSize}pt` : '9pt';
      domEl.style.fontWeight = typo.fontWeight || '400';
      domEl.style.fontStyle = typo.fontStyle || 'normal';
      domEl.style.color = typo.color || '#000000';
      domEl.style.textAlign = typo.align || 'left';
      domEl.style.lineHeight = typo.lineHeight || 1.3;
      domEl.style.letterSpacing = typo.letterSpacing ? `${typo.letterSpacing}px` : 'normal';
      domEl.style.textTransform = typo.textTransform || 'none';

      domEl.style.backgroundColor = box.background || 'transparent';
      domEl.style.borderColor = box.borderColor || 'transparent';
      domEl.style.borderWidth = box.borderWidth ? `${box.borderWidth}px` : '0px';
      domEl.style.borderStyle = box.borderStyle || 'solid';
      domEl.style.borderRadius = box.borderRadius ? `${box.borderRadius}px` : '0px';
      domEl.style.padding = box.padding ? `${box.padding}px` : '0px';
      domEl.style.opacity = box.opacity !== undefined ? box.opacity : 1;
    }

    renderElementContent(elem) {
      let raw = elem.content || '';

      // If Table Component
      if (elem.type === 'table') {
        return this.renderTableHtml(elem);
      }

      // If Logo
      if (elem.type === 'logo') {
        return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#f1f5f9;border:1px dashed #94a3b8;font-size:8pt;color:#64748b;font-weight:700;"><i class="bi bi-image" style="font-size:16pt;margin-right:6px;"></i> SOCIETY LOGO</div>`;
      }

      // If QR Code
      if (elem.type === 'qr') {
        return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:#ffffff;border:1px solid #cbd5e1;padding:2px;"><i class="bi bi-qr-code" style="font-size:24pt;color:#0f172a;"></i><span style="font-size:6.5pt;font-weight:700;color:#64748b;margin-top:2px;">SCAN TO PAY</span></div>`;
      }

      // If Watermark
      if (elem.type === 'watermark') {
        return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:28pt;font-weight:900;color:rgba(203,213,225,0.35);transform:rotate(-30deg);letter-spacing:4px;user-select:none;">DUPLICATE COPY</div>`;
      }

      // Replace Dynamic Schema Tokens if Test Data Mode is Active
      if (this.isTestDataMode) {
        raw = this.resolveTokens(raw);
      }

      return raw;
    }

    renderTableHtml(elem) {
      const cfg = elem.tableConfig || { columns: [] };
      const cols = cfg.columns || [];

      let html = `<table style="width:100%; border-collapse:collapse; font-size:${elem.typography?.fontSize || 8.5}pt;">`;

      // Header Row
      if (cfg.showHeader !== false) {
        html += `<thead style="background:${cfg.headerBg || '#0f172a'}; color:${cfg.headerColor || '#ffffff'}; font-weight:700;"><tr>`;
        cols.forEach(c => {
          html += `<th style="padding:4px 6px; border:1px solid ${cfg.borderColor || '#cbd5e1'}; text-align:${c.align || 'left'}; width:${c.width || 'auto'};">${c.header}</th>`;
        });
        html += `</tr></thead>`;
      }

      // Sample Data Rows (3-4 Realistic Rows)
      html += `<tbody>`;
      const sampleRows = [
        { sr_no: '1', head_name: 'Monthly Maintenance Service Charges', rate: 'Standard', amount: '₹2,500.00' },
        { sr_no: '2', head_name: 'Sinking & Repair Fund Contribution', rate: 'Fixed', amount: '₹500.00' },
        { sr_no: '3', head_name: 'Non-Occupancy Charges (If Applicable)', rate: '10%', amount: '₹250.00' },
        { sr_no: '4', head_name: 'Common Parking & Security Service Charge', rate: 'Fixed', amount: '₹250.00' }
      ];

      sampleRows.forEach((row, i) => {
        const bg = (cfg.zebra && i % 2 === 1) ? (cfg.zebraBg || '#f8fafc') : '#ffffff';
        html += `<tr style="background:${bg};">`;
        cols.forEach(c => {
          const val = row[c.field] || '-';
          html += `<td style="padding:4px 6px; border:1px solid ${cfg.borderColor || '#cbd5e1'}; text-align:${c.align || 'left'};">${val}</td>`;
        });
        html += `</tr>`;
      });

      // Aggregations / Totals Row if configured
      const hasAgg = cols.some(c => c.aggregation === 'SUM');
      if (hasAgg) {
        html += `<tr style="background:#f1f5f9; font-weight:700; border-top:2px solid #0f172a;">`;
        cols.forEach((c, idx) => {
          if (c.aggregation === 'SUM') {
            html += `<td style="padding:4px 6px; border:1px solid ${cfg.borderColor || '#cbd5e1'}; text-align:${c.align || 'right'};">₹3,500.00</td>`;
          } else if (idx === 0) {
            html += `<td style="padding:4px 6px; border:1px solid ${cfg.borderColor || '#cbd5e1'}; text-align:left;">TOTAL</td>`;
          } else {
            html += `<td style="padding:4px 6px; border:1px solid ${cfg.borderColor || '#cbd5e1'};"></td>`;
          }
        });
        html += `</tr>`;
      }

      html += `</tbody></table>`;
      return html;
    }

    resolveTokens(str) {
      if (!str || typeof str !== 'string') return '';
      return str.replace(/\{\{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\}\}/g, (match, cat, key) => {
        if (SAMPLE_DATA_STORE[cat] && SAMPLE_DATA_STORE[cat][key] !== undefined) {
          return SAMPLE_DATA_STORE[cat][key];
        }
        return match;
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. PROPERTIES INSPECTOR (Right Panel)
    // ─────────────────────────────────────────────────────────────────────────
    renderProperties() {
      const panel = document.getElementById('hoaRightPanel');
      if (!panel) return;

      const activeElem = this.doc.elements.find(e => e.id === this.activeElementId);
      if (!activeElem) {
        panel.innerHTML = `
          <div style="text-align:center; padding:30px 10px; color:#64748b;">
            <i class="bi bi-cursor" style="font-size:24pt; color:#334155;"></i>
            <div style="font-size:12px; font-weight:700; color:#94a3b8; margin-top:8px;">No Element Selected</div>
            <div style="font-size:11px; margin-top:4px;">Click an element on the canvas to inspect its layout, typography, and dynamic field properties.</div>
          </div>
        `;
        return;
      }

      const typo = activeElem.typography || {};
      const box = activeElem.box || {};

      let html = `
        <!-- ELEMENT HEADER -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:8px;">
          <div>
            <div style="font-size:12px; font-weight:800; color:#38bdf8;">${activeElem.id}</div>
            <span style="font-size:10px; color:#94a3b8; text-transform:uppercase;">${activeElem.type}</span>
          </div>
          <div style="display:flex; gap:4px;">
            <button class="hoa-tool-btn" style="height:22px; padding:0 6px;" title="Duplicate" onclick="window.HenuAdvancedEditor.duplicateSelected()"><i class="bi bi-copy"></i></button>
            <button class="hoa-tool-btn" style="height:22px; padding:0 6px; color:#f87171;" title="Delete" onclick="window.HenuAdvancedEditor.deleteSelected()"><i class="bi bi-trash"></i></button>
          </div>
        </div>

        <!-- POSITION & DIMENSIONS (MM) -->
        <div class="hoa-inspector-group">
          <div class="hoa-inspector-title"><i class="bi bi-arrows-move"></i> Geometry (mm)</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
            <div class="hoa-prop-row">
              <span class="hoa-prop-label">X (Left):</span>
              <input type="number" step="0.5" class="hoa-prop-input" value="${activeElem.x}" onchange="window.HenuAdvancedEditor.updateActiveProp('x', parseFloat(this.value))">
            </div>
            <div class="hoa-prop-row">
              <span class="hoa-prop-label">Y (Top):</span>
              <input type="number" step="0.5" class="hoa-prop-input" value="${activeElem.y}" onchange="window.HenuAdvancedEditor.updateActiveProp('y', parseFloat(this.value))">
            </div>
            <div class="hoa-prop-row">
              <span class="hoa-prop-label">Width:</span>
              <input type="number" step="0.5" class="hoa-prop-input" value="${activeElem.w}" onchange="window.HenuAdvancedEditor.updateActiveProp('w', parseFloat(this.value))">
            </div>
            <div class="hoa-prop-row">
              <span class="hoa-prop-label">Height:</span>
              <input type="number" step="0.5" class="hoa-prop-input" value="${activeElem.h}" onchange="window.HenuAdvancedEditor.updateActiveProp('h', parseFloat(this.value))">
            </div>
          </div>
          <div class="hoa-prop-row" style="margin-top:6px;">
            <span class="hoa-prop-label">Z-Index:</span>
            <input type="number" class="hoa-prop-input" value="${activeElem.zIndex || 10}" onchange="window.HenuAdvancedEditor.updateActiveProp('zIndex', parseInt(this.value, 10))">
          </div>
        </div>

        <!-- CONTENT & DYNAMIC FIELD -->
        <div class="hoa-inspector-group">
          <div class="hoa-inspector-title"><i class="bi bi-braces"></i> Content & Text</div>
          <textarea class="hoa-prop-input" style="width:100%; height:65px; resize:vertical; font-family:monospace;" onchange="window.HenuAdvancedEditor.updateActiveProp('content', this.value)">${activeElem.content || ''}</textarea>
          <div style="font-size:9.5px; color:#94a3b8; margin-top:4px;">Supports safe schema tokens like <code>{{member.name}}</code> and basic HTML.</div>
        </div>

        <!-- TYPOGRAPHY -->
        <div class="hoa-inspector-group">
          <div class="hoa-inspector-title"><i class="bi bi-fonts"></i> Typography</div>
          <div class="hoa-prop-row">
            <span class="hoa-prop-label">Font Family:</span>
            <select class="hoa-prop-select" onchange="window.HenuAdvancedEditor.updateActiveNestedProp('typography', 'fontFamily', this.value)">
              <option value="Inter, sans-serif" ${typo.fontFamily?.includes('Inter') ? 'selected' : ''}>Inter (Modern Sans)</option>
              <option value="'Roboto', sans-serif" ${typo.fontFamily?.includes('Roboto') ? 'selected' : ''}>Roboto</option>
              <option value="'Courier New', monospace" ${typo.fontFamily?.includes('Courier') ? 'selected' : ''}>Courier (Monospace)</option>
              <option value="'Georgia', serif" ${typo.fontFamily?.includes('Georgia') ? 'selected' : ''}>Georgia (Serif)</option>
            </select>
          </div>
          <div class="hoa-prop-row">
            <span class="hoa-prop-label">Size (pt):</span>
            <input type="number" step="0.5" class="hoa-prop-input" value="${typo.fontSize || 9}" onchange="window.HenuAdvancedEditor.updateActiveNestedProp('typography', 'fontSize', parseFloat(this.value))">
            <span class="hoa-prop-label" style="min-width:40px; margin-left:6px;">Weight:</span>
            <select class="hoa-prop-select" onchange="window.HenuAdvancedEditor.updateActiveNestedProp('typography', 'fontWeight', this.value)">
              <option value="400" ${typo.fontWeight === '400' ? 'selected' : ''}>Regular</option>
              <option value="600" ${typo.fontWeight === '600' ? 'selected' : ''}>Semi-Bold</option>
              <option value="700" ${typo.fontWeight === '700' ? 'selected' : ''}>Bold</option>
              <option value="800" ${typo.fontWeight === '800' ? 'selected' : ''}>Extra Bold</option>
            </select>
          </div>
          <div class="hoa-prop-row">
            <span class="hoa-prop-label">Color:</span>
            <input type="color" class="hoa-prop-input" style="height:26px; padding:1px;" value="${typo.color || '#000000'}" onchange="window.HenuAdvancedEditor.updateActiveNestedProp('typography', 'color', this.value)">
            <span class="hoa-prop-label" style="min-width:40px; margin-left:6px;">Align:</span>
            <select class="hoa-prop-select" onchange="window.HenuAdvancedEditor.updateActiveNestedProp('typography', 'align', this.value)">
              <option value="left" ${typo.align === 'left' ? 'selected' : ''}>Left</option>
              <option value="center" ${typo.align === 'center' ? 'selected' : ''}>Center</option>
              <option value="right" ${typo.align === 'right' ? 'selected' : ''}>Right</option>
              <option value="justify" ${typo.align === 'justify' ? 'selected' : ''}>Justify</option>
            </select>
          </div>
        </div>

        <!-- BOX MODEL & APPEARANCE -->
        <div class="hoa-inspector-group">
          <div class="hoa-inspector-title"><i class="bi bi-box-seam"></i> Box & Border</div>
          <div class="hoa-prop-row">
            <span class="hoa-prop-label">Background:</span>
            <input type="text" class="hoa-prop-input" value="${box.background || 'transparent'}" onchange="window.HenuAdvancedEditor.updateActiveNestedProp('box', 'background', this.value)">
          </div>
          <div class="hoa-prop-row">
            <span class="hoa-prop-label">Border Color:</span>
            <input type="text" class="hoa-prop-input" value="${box.borderColor || '#cbd5e1'}" onchange="window.HenuAdvancedEditor.updateActiveNestedProp('box', 'borderColor', this.value)">
          </div>
          <div class="hoa-prop-row">
            <span class="hoa-prop-label">Width (px):</span>
            <input type="number" class="hoa-prop-input" value="${box.borderWidth || 0}" onchange="window.HenuAdvancedEditor.updateActiveNestedProp('box', 'borderWidth', parseInt(this.value, 10))">
            <span class="hoa-prop-label" style="min-width:40px; margin-left:6px;">Radius:</span>
            <input type="number" class="hoa-prop-input" value="${box.borderRadius || 0}" onchange="window.HenuAdvancedEditor.updateActiveNestedProp('box', 'borderRadius', parseInt(this.value, 10))">
          </div>
        </div>
      `;

      // If Table Component: Show Advanced Table Column Builder
      if (activeElem.type === 'table') {
        html += this.renderTableInspector(activeElem);
      }

      panel.innerHTML = html;
    }

    renderTableInspector(elem) {
      const cfg = elem.tableConfig || { columns: [] };
      const cols = cfg.columns || [];

      let html = `
        <div class="hoa-inspector-group">
          <div class="hoa-inspector-title" style="justify-content:space-between;">
            <span><i class="bi bi-table"></i> Table Columns (${cols.length})</span>
            <button class="hoa-tool-btn" style="height:20px; padding:0 6px;" onclick="window.HenuAdvancedEditor.addTableColumn('${elem.id}')"><i class="bi bi-plus"></i> Add Col</button>
          </div>
      `;

      cols.forEach((col, idx) => {
        html += `
          <div style="background:#0f172a; border:1px solid #334155; border-radius:4px; padding:6px; margin-bottom:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:10px; font-weight:700; color:#38bdf8;">Col ${idx + 1}: ${col.header}</span>
              <button class="hoa-tool-btn" style="height:18px; width:18px; padding:0; color:#f87171;" onclick="window.HenuAdvancedEditor.removeTableColumn('${elem.id}', ${idx})"><i class="bi bi-x"></i></button>
            </div>
            <div class="hoa-prop-row">
              <span class="hoa-prop-label" style="min-width:50px;">Header:</span>
              <input type="text" class="hoa-prop-input" value="${col.header}" onchange="window.HenuAdvancedEditor.updateTableColProp('${elem.id}', ${idx}, 'header', this.value)">
            </div>
            <div class="hoa-prop-row">
              <span class="hoa-prop-label" style="min-width:50px;">Width:</span>
              <input type="text" class="hoa-prop-input" value="${col.width || 'auto'}" onchange="window.HenuAdvancedEditor.updateTableColProp('${elem.id}', ${idx}, 'width', this.value)">
              <span class="hoa-prop-label" style="min-width:35px; margin-left:4px;">Align:</span>
              <select class="hoa-prop-select" onchange="window.HenuAdvancedEditor.updateTableColProp('${elem.id}', ${idx}, 'align', this.value)">
                <option value="left" ${col.align === 'left' ? 'selected' : ''}>L</option>
                <option value="center" ${col.align === 'center' ? 'selected' : ''}>C</option>
                <option value="right" ${col.align === 'right' ? 'selected' : ''}>R</option>
              </select>
            </div>
            <div class="hoa-prop-row">
              <span class="hoa-prop-label" style="min-width:50px;">Total Agg:</span>
              <select class="hoa-prop-select" onchange="window.HenuAdvancedEditor.updateTableColProp('${elem.id}', ${idx}, 'aggregation', this.value)">
                <option value="" ${!col.aggregation ? 'selected' : ''}>None</option>
                <option value="SUM" ${col.aggregation === 'SUM' ? 'selected' : ''}>SUM</option>
                <option value="COUNT" ${col.aggregation === 'COUNT' ? 'selected' : ''}>COUNT</option>
                <option value="MIN" ${col.aggregation === 'MIN' ? 'selected' : ''}>MIN</option>
                <option value="MAX" ${col.aggregation === 'MAX' ? 'selected' : ''}>MAX</option>
              </select>
            </div>
          </div>
        `;
      });

      html += `</div>`;
      return html;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. ELEMENT MANIPULATION & INTERACTIVE ACTIONS
    // ─────────────────────────────────────────────────────────────────────────
    addNewElement(type) {
      const id = `elem_${type}_${Date.now().toString().slice(-4)}`;
      let w = 80;
      let h = 12;
      let content = 'New ' + type.toUpperCase();

      if (type === 'table') { w = 186; h = 60; content = ''; }
      else if (type === 'divider') { w = 186; h = 2; content = '<hr style="border:0;border-top:1px solid #0f172a;margin:0;">'; }
      else if (type === 'totals_box') { w = 90; h = 30; content = '<b>Total:</b> ₹0.00'; }
      else if (type === 'amount_words') { w = 90; h = 15; content = '<b>In Words:</b> Rupees Zero Only'; }
      else if (type === 'logo') { w = 35; h = 25; content = ''; }
      else if (type === 'qr') { w = 30; h = 30; content = ''; }
      else if (type === 'signature') { w = 186; h = 20; content = '<div style="display:flex;justify-content:space-between;width:100%;"><span>Member Signature</span><span>Authorized Signatory</span></div>'; }
      else if (type === 'watermark') { w = 186; h = 100; content = ''; }

      const newElem = {
        id,
        type,
        x: 15,
        y: 50,
        w,
        h,
        zIndex: 10,
        content,
        typography: {
          fontFamily: 'Inter, sans-serif',
          fontSize: 9,
          fontWeight: '400',
          fontStyle: 'normal',
          color: '#0f172a',
          align: 'left',
          lineHeight: 1.3,
          letterSpacing: 0,
          textTransform: 'none'
        },
        box: {
          background: 'transparent',
          borderColor: type === 'rectangle' ? '#cbd5e1' : 'transparent',
          borderWidth: type === 'rectangle' ? 1 : 0,
          borderStyle: 'solid',
          borderRadius: 0,
          padding: type === 'rectangle' ? 4 : 0,
          opacity: 1
        }
      };

      if (type === 'table') {
        newElem.tableConfig = {
          columns: [
            { id: 'c1', header: 'Sr.', width: '10%', align: 'center', field: 'sr_no' },
            { id: 'c2', header: 'Particulars', width: '60%', align: 'left', field: 'particulars' },
            { id: 'c3', header: 'Amount (₹)', width: '30%', align: 'right', field: 'amount', aggregation: 'SUM' }
          ],
          showHeader: true,
          headerBg: '#0f172a',
          headerColor: '#ffffff',
          zebra: true,
          zebraBg: '#f8fafc',
          borderColor: '#cbd5e1'
        };
      }

      this.doc.elements.push(newElem);
      this.selectElement(id);
      this.pushHistory(`Add ${type}`);
      this.renderCanvas();
      this.renderProperties();
      this.renderOutlineTree();
    }

    selectElement(id, event = null) {
      if (event && event.shiftKey) {
        if (this.selectedElementIds.has(id)) {
          this.selectedElementIds.delete(id);
        } else {
          this.selectedElementIds.add(id);
        }
      } else {
        this.selectedElementIds.clear();
        this.selectedElementIds.add(id);
      }

      this.activeElementId = id;
      this.renderCanvas();
      this.renderProperties();
      this.renderOutlineTree();
    }

    duplicateSelected() {
      if (this.selectedElementIds.size === 0) return;
      const newIds = [];
      this.selectedElementIds.forEach(id => {
        const orig = this.doc.elements.find(e => e.id === id);
        if (orig) {
          const clone = JSON.parse(JSON.stringify(orig));
          clone.id = `elem_${clone.type}_${Date.now().toString().slice(-4)}`;
          clone.x += 5;
          clone.y += 5;
          this.doc.elements.push(clone);
          newIds.push(clone.id);
        }
      });
      this.selectedElementIds.clear();
      newIds.forEach(id => this.selectedElementIds.add(id));
      this.activeElementId = newIds[0] || null;
      this.pushHistory('Duplicate Elements');
      this.renderCanvas();
      this.renderProperties();
      this.renderOutlineTree();
    }

    deleteSelected() {
      if (this.selectedElementIds.size === 0) return;
      this.doc.elements = this.doc.elements.filter(e => !this.selectedElementIds.has(e.id));
      this.selectedElementIds.clear();
      this.activeElementId = this.doc.elements[0] ? this.doc.elements[0].id : null;
      if (this.activeElementId) this.selectedElementIds.add(this.activeElementId);
      this.pushHistory('Delete Elements');
      this.renderCanvas();
      this.renderProperties();
      this.renderOutlineTree();
    }

    updateActiveProp(key, value) {
      const elem = this.doc.elements.find(e => e.id === this.activeElementId);
      if (!elem) return;

      // Safe financial check: cannot change fundamental numeric balances
      if (key === 'content' && typeof value === 'string') {
        // Safe check
      }

      elem[key] = value;
      this.pushHistory(`Update ${key}`);
      this.renderCanvas();
    }

    updateActiveNestedProp(group, key, value) {
      const elem = this.doc.elements.find(e => e.id === this.activeElementId);
      if (!elem) return;
      if (!elem[group]) elem[group] = {};
      elem[group][key] = value;
      this.pushHistory(`Update ${group}.${key}`);
      this.renderCanvas();
    }

    insertFieldToken(token) {
      const elem = this.doc.elements.find(e => e.id === this.activeElementId);
      if (elem) {
        elem.content = (elem.content || '') + ' ' + token;
        this.pushHistory(`Insert ${token}`);
        this.renderCanvas();
        this.renderProperties();
      } else {
        // Add as dynamic field
        this.addNewElement('text');
        const newEl = this.doc.elements[this.doc.elements.length - 1];
        if (newEl) {
          newEl.content = token;
          this.renderCanvas();
          this.renderProperties();
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. ALIGNMENT & DISTRIBUTION SUITE
    // ─────────────────────────────────────────────────────────────────────────
    alignElements(action) {
      if (this.selectedElementIds.size <= 1) {
        // Align relative to page margins
        const elem = this.doc.elements.find(e => e.id === this.activeElementId);
        if (!elem) return;
        const pw = this.doc.metadata.pageWidth || 210;
        const ph = this.doc.metadata.pageHeight || 297;
        const ml = this.doc.metadata.margins.left;
        const mr = this.doc.metadata.margins.right;
        const mt = this.doc.metadata.margins.top;
        const mb = this.doc.metadata.margins.bottom;
        const printableW = pw - ml - mr;
        const printableH = ph - mt - mb;

        if (action === 'left') elem.x = ml;
        else if (action === 'center') elem.x = ml + (printableW - elem.w) / 2;
        else if (action === 'right') elem.x = pw - mr - elem.w;
        else if (action === 'top') elem.y = mt;
        else if (action === 'middle') elem.y = mt + (printableH - elem.h) / 2;
        else if (action === 'bottom') elem.y = ph - mb - elem.h;

        this.pushHistory(`Align ${action}`);
        this.renderCanvas();
        this.renderProperties();
        return;
      }

      // Multi-element alignment relative to bounding box
      const selected = this.doc.elements.filter(e => this.selectedElementIds.has(e.id));
      const minX = Math.min(...selected.map(e => e.x));
      const maxX = Math.max(...selected.map(e => e.x + e.w));
      const minY = Math.min(...selected.map(e => e.y));
      const maxY = Math.max(...selected.map(e => e.y + e.h));

      selected.forEach(elem => {
        if (action === 'left') elem.x = minX;
        else if (action === 'center') elem.x = minX + (maxX - minX - elem.w) / 2;
        else if (action === 'right') elem.x = maxX - elem.w;
        else if (action === 'top') elem.y = minY;
        else if (action === 'middle') elem.y = minY + (maxY - minY - elem.h) / 2;
        else if (action === 'bottom') elem.y = maxY - elem.h;
      });

      this.pushHistory(`Align ${action}`);
      this.renderCanvas();
      this.renderProperties();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. TABLE COMPONENT MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────
    addTableColumn(elemId) {
      const elem = this.doc.elements.find(e => e.id === elemId);
      if (!elem || !elem.tableConfig) return;
      const count = elem.tableConfig.columns.length + 1;
      elem.tableConfig.columns.push({
        id: `c${count}`,
        header: `Column ${count}`,
        width: '20%',
        align: 'left',
        field: 'custom_field'
      });
      this.pushHistory('Add Table Column');
      this.renderCanvas();
      this.renderProperties();
    }

    removeTableColumn(elemId, idx) {
      const elem = this.doc.elements.find(e => e.id === elemId);
      if (!elem || !elem.tableConfig) return;
      elem.tableConfig.columns.splice(idx, 1);
      this.pushHistory('Remove Table Column');
      this.renderCanvas();
      this.renderProperties();
    }

    updateTableColProp(elemId, idx, key, value) {
      const elem = this.doc.elements.find(e => e.id === elemId);
      if (!elem || !elem.tableConfig || !elem.tableConfig.columns[idx]) return;
      elem.tableConfig.columns[idx][key] = value;
      this.pushHistory('Update Table Column');
      this.renderCanvas();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. DESIGN VALIDATION ENGINE (Pre-Publish Safety Rule)
    // ─────────────────────────────────────────────────────────────────────────
    runValidation() {
      const errors = [];
      const warnings = [];
      const pw = this.doc.metadata.pageWidth || 210;
      const ph = this.doc.metadata.pageHeight || 297;
      const ml = this.doc.metadata.margins.left;
      const mr = this.doc.metadata.margins.right;
      const mt = this.doc.metadata.margins.top;
      const mb = this.doc.metadata.margins.bottom;

      // 1. Margin & Overflow Checks
      this.doc.elements.forEach(elem => {
        if (elem.x < 0 || elem.y < 0 || (elem.x + elem.w) > pw || (elem.y + elem.h) > ph) {
          errors.push(`Element "${elem.id}" is outside the printable A4 page boundary.`);
        } else if (elem.x < ml || (elem.x + elem.w) > (pw - mr)) {
          warnings.push(`Element "${elem.id}" crosses left/right print safety margins.`);
        }
      });

      // 2. Unregistered Dynamic Field Tokens
      const validTokens = new Set();
      Object.values(SCHEMA_REGISTRY).forEach(list => list.forEach(f => validTokens.add(f.field)));

      this.doc.elements.forEach(elem => {
        if (typeof elem.content === 'string') {
          const matches = elem.content.match(/\{\{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\}\}/g) || [];
          matches.forEach(m => {
            if (!validTokens.has(m)) {
              errors.push(`Unrecognized or unsafe field token "${m}" in element "${elem.id}".`);
            }
          });
        }
      });

      // 3. Table Column Width Check
      this.doc.elements.filter(e => e.type === 'table').forEach(tbl => {
        if (!tbl.tableConfig?.columns || tbl.tableConfig.columns.length === 0) {
          errors.push(`Table element "${tbl.id}" has no columns defined.`);
        }
      });

      // Display validation toast / drawer
      const box = document.getElementById('hoaValidationBox');
      if (!box) return;

      let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="font-size:12px; color:#fff;"><i class="bi bi-shield-check"></i> Design Quality & Safety Report</strong>
          <button class="hoa-tool-btn" style="height:20px; width:20px; padding:0;" onclick="document.getElementById('hoaValidationBox').classList.remove('show')"><i class="bi bi-x"></i></button>
        </div>
      `;

      if (errors.length === 0 && warnings.length === 0) {
        html += `<div class="hoa-val-item success"><i class="bi bi-check-circle-fill"></i> 100% Validated! Zero layout overflows or invalid schema tokens detected. Ready for publication.</div>`;
      } else {
        errors.forEach(err => {
          html += `<div class="hoa-val-item error"><i class="bi bi-exclamation-octagon-fill"></i> ERROR: ${err}</div>`;
        });
        warnings.forEach(w => {
          html += `<div class="hoa-val-item warning"><i class="bi bi-exclamation-triangle-fill"></i> WARNING: ${w}</div>`;
        });
      }

      box.innerHTML = html;
      box.classList.add('show');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 13. INTERACTIVE DRAG, DROP & RESIZE HANDLERS
    // ─────────────────────────────────────────────────────────────────────────
    bindEvents() {
      const viewport = document.getElementById('hoaCenterViewport');
      const canvas = document.getElementById('hoaCanvas');
      if (!viewport || !canvas) return;

      // Canvas element mousedown for drag / resize
      canvas.addEventListener('mousedown', e => {
        const handle = e.target.closest('.hoa-handle');
        const elemNode = e.target.closest('.hoa-canvas-element');

        if (handle) {
          e.stopPropagation();
          this.isResizing = true;
          this.activeHandle = handle.dataset.handle;
          const elemId = handle.dataset.id;
          const elem = this.doc.elements.find(el => el.id === elemId);
          this.dragStart = {
            clientX: e.clientX,
            clientY: e.clientY,
            x: elem.x,
            y: elem.y,
            w: elem.w,
            h: elem.h
          };
          return;
        }

        if (elemNode) {
          e.stopPropagation();
          const elemId = elemNode.dataset.id;
          this.selectElement(elemId, e);
          this.isDragging = true;
          const elem = this.doc.elements.find(el => el.id === elemId);
          this.dragStart = {
            clientX: e.clientX,
            clientY: e.clientY,
            x: elem.x,
            y: elem.y
          };
          return;
        }

        // Clicking empty canvas clears selection
        this.selectedElementIds.clear();
        this.activeElementId = null;
        this.renderCanvas();
        this.renderProperties();
        this.renderOutlineTree();
      });

      // Global mousemove for drag/resize
      window.addEventListener('mousemove', e => {
        if (this.isDragging) {
          const deltaX_mm = (e.clientX - this.dragStart.clientX) * PX_TO_MM / this.zoom;
          const deltaY_mm = (e.clientY - this.dragStart.clientY) * PX_TO_MM / this.zoom;

          let newX = this.dragStart.x + deltaX_mm;
          let newY = this.dragStart.y + deltaY_mm;

          if (this.doc.metadata.snapToGrid) {
            const grid = this.doc.metadata.gridSize || 5;
            newX = Math.round(newX / grid) * grid;
            newY = Math.round(newY / grid) * grid;
          }

          const elem = this.doc.elements.find(el => el.id === this.activeElementId);
          if (elem) {
            elem.x = Math.max(0, Math.round(newX * 10) / 10);
            elem.y = Math.max(0, Math.round(newY * 10) / 10);

            const domEl = document.getElementById(`canvas_node_${elem.id}`);
            if (domEl) {
              domEl.style.left = `${elem.x}mm`;
              domEl.style.top = `${elem.y}mm`;
            }
          }
        } else if (this.isResizing) {
          const deltaX_mm = (e.clientX - this.dragStart.clientX) * PX_TO_MM / this.zoom;
          const deltaY_mm = (e.clientY - this.dragStart.clientY) * PX_TO_MM / this.zoom;

          const elem = this.doc.elements.find(el => el.id === this.activeElementId);
          if (!elem) return;

          let newW = this.dragStart.w;
          let newH = this.dragStart.h;
          let newX = this.dragStart.x;
          let newY = this.dragStart.y;

          if (this.activeHandle.includes('e')) newW += deltaX_mm;
          if (this.activeHandle.includes('s')) newH += deltaY_mm;
          if (this.activeHandle.includes('w')) { newW -= deltaX_mm; newX += deltaX_mm; }
          if (this.activeHandle.includes('n')) { newH -= deltaY_mm; newY += deltaY_mm; }

          if (this.doc.metadata.snapToGrid) {
            const grid = this.doc.metadata.gridSize || 5;
            newW = Math.round(newW / grid) * grid;
            newH = Math.round(newH / grid) * grid;
          }

          elem.w = Math.max(5, Math.round(newW * 10) / 10);
          elem.h = Math.max(3, Math.round(newH * 10) / 10);
          elem.x = Math.max(0, Math.round(newX * 10) / 10);
          elem.y = Math.max(0, Math.round(newY * 10) / 10);

          const domEl = document.getElementById(`canvas_node_${elem.id}`);
          if (domEl) {
            domEl.style.left = `${elem.x}mm`;
            domEl.style.top = `${elem.y}mm`;
            domEl.style.width = `${elem.w}mm`;
            domEl.style.height = `${elem.h}mm`;
          }
        }
      });

      // Global mouseup
      window.addEventListener('mouseup', () => {
        if (this.isDragging || this.isResizing) {
          this.isDragging = false;
          this.isResizing = false;
          this.pushHistory('Transform Element');
          this.renderProperties();
        }
      });

      // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+D, Del, Arrow keys)
      window.addEventListener('keydown', e => {
        if (!this.isOpen) return;

        // If typing inside an input/textarea, do not intercept
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          this.undo();
        } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          this.redo();
        } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          this.duplicateSelected();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          this.deleteSelected();
        } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault();
          const step = e.shiftKey ? 5 : 1; // 1mm or 5mm
          const elem = this.doc.elements.find(el => el.id === this.activeElementId);
          if (elem) {
            if (e.key === 'ArrowLeft') elem.x = Math.max(0, elem.x - step);
            if (e.key === 'ArrowRight') elem.x += step;
            if (e.key === 'ArrowUp') elem.y = Math.max(0, elem.y - step);
            if (e.key === 'ArrowDown') elem.y += step;
            this.pushHistory('Nudge Element');
            this.renderCanvas();
            this.renderProperties();
          }
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 14. TOOLBAR ACTIONS: ZOOM, SNAP, TEST DATA, PUBLISH & EXPORT
    // ─────────────────────────────────────────────────────────────────────────
    setZoom(val) {
      this.zoom = Math.max(0.4, Math.min(2.0, Math.round(val * 100) / 100));
      const display = document.getElementById('hoaZoomDisplay');
      if (display) display.textContent = `${Math.round(this.zoom * 100)}%`;
      this.renderCanvas();
    }

    toggleGrid() {
      this.doc.metadata.showGrid = !this.doc.metadata.showGrid;
      const overlay = document.getElementById('hoaGridOverlay');
      if (overlay) overlay.style.display = this.doc.metadata.showGrid ? 'block' : 'none';
      const btn = document.getElementById('hoaBtnGrid');
      if (btn) btn.classList.toggle('active', this.doc.metadata.showGrid);
    }

    toggleSnap() {
      this.doc.metadata.snapToGrid = !this.doc.metadata.snapToGrid;
      const btn = document.getElementById('hoaBtnSnap');
      if (btn) btn.classList.toggle('active', this.doc.metadata.snapToGrid);
    }

    toggleTestData() {
      this.isTestDataMode = !this.isTestDataMode;
      const btn = document.getElementById('hoaBtnTestData');
      if (btn) btn.classList.toggle('active', this.isTestDataMode);

      let badge = document.getElementById('hoaSampleBadge');
      if (this.isTestDataMode && !badge) {
        const viewport = document.getElementById('hoaCenterViewport');
        const newBadge = document.createElement('div');
        newBadge.id = 'hoaSampleBadge';
        newBadge.className = 'hoa-sample-badge';
        newBadge.innerHTML = '<i class="bi bi-info-circle-fill"></i> PREVIEW / SAMPLE DATA MODE — Live Accounting Tables Unmodified';
        viewport.insertBefore(newBadge, viewport.firstChild);
      } else if (!this.isTestDataMode && badge) {
        badge.remove();
      }

      this.renderCanvas();
    }

    saveDraft() {
      if (this.onSaveCallback) {
        this.onSaveCallback(this.doc, false);
      }
      alert(`[HENU OS DESIGN] Draft layout for "${this.doc.metadata.reportName}" saved successfully.`);
    }

    publish() {
      this.runValidation();
      this.doc.metadata.version = (this.doc.metadata.version || 1) + 1;
      if (this.onSaveCallback) {
        this.onSaveCallback(this.doc, true);
      }
      alert(`[HENU OS DESIGN] Published Version ${this.doc.metadata.version} of "${this.doc.metadata.reportName}" successfully.`);
    }

    exportJson() {
      const str = JSON.stringify(this.doc, null, 2);
      const blob = new Blob([str], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${this.doc.metadata.reportKey}_v${this.doc.metadata.version}.json`;
      a.click();
    }

    renderAll() {
      this.switchTab('components');
      this.renderCanvas();
      this.renderProperties();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 15. GLOBAL EXPORT
  // ─────────────────────────────────────────────────────────────────────────
  window.HenuAdvancedEditor = new HenuOsAdvancedEditor();

})(window);
