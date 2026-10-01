/**
 * henu-os-design.js — HENU OS DESIGN Enterprise Configuration Studio
 * Architecture: Real ERP Backend Data + Active Published Design Control + Reactive Live Preview
 * Covers all 18 Registered Member Report Modules with Exact Standalone DOM Renderers & Isolated Test Data Fixtures
 */

(function () {
  'use strict';

  // 18 REGISTERED MEMBER REPORT MODULES (From Repository Registry)
  const MODULES = [
    { key: 'bill-format', name: 'Bill Format', icon: 'bi-file-earmark-text', endpoint: '/reports/member/bill-format', orientation: 'portrait', categories: ['general', 'header', 'member', 'table', 'amounts', 'labels', 'qr', 'footer', 'signature', 'page'] },
    { key: 'receipt', name: 'Receipt', icon: 'bi-receipt', endpoint: '/reports/member/receipt', orientation: 'portrait', categories: ['general', 'header', 'member', 'amounts', 'labels', 'qr', 'footer', 'signature', 'page'] },
    { key: 'debit-note', name: 'Debit Note', icon: 'bi-file-earmark-minus', endpoint: '/reports/member/debit-note', orientation: 'portrait', categories: ['general', 'header', 'member', 'table', 'amounts', 'labels', 'footer', 'signature', 'page'] },
    { key: 'credit-note', name: 'Credit Note', icon: 'bi-file-earmark-plus', endpoint: '/reports/member/credit-note', orientation: 'portrait', categories: ['general', 'header', 'member', 'table', 'amounts', 'labels', 'footer', 'signature', 'page'] },
    { key: 'adjustment', name: 'Adjustment', icon: 'bi-arrow-left-right', endpoint: '/reports/member/adjustment', orientation: 'portrait', categories: ['general', 'header', 'member', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'outstanding-list', name: 'Outstanding List', icon: 'bi-list-ol', endpoint: '/reports/member-outstanding', orientation: 'landscape', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'member-account-head-wise', name: 'Member Account | Head wise', icon: 'bi-table', endpoint: '/reports/member-account-ledger', orientation: 'landscape', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'member-register-dr-cr', name: 'Member Register [Dr/Cr]', icon: 'bi-journal-check', endpoint: '/reports/member-register-dr-cr', orientation: 'landscape', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'member-control-account', name: 'Member Control Account', icon: 'bi-shield-check', endpoint: '/reports/member/control-account', orientation: 'portrait', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'balance-confirmation-letter', name: 'Balance Confirmation Letter', icon: 'bi-envelope-paper', endpoint: '/reports/member/balance-confirmation', orientation: 'portrait', categories: ['general', 'header', 'member', 'amounts', 'labels', 'footer', 'signature', 'page'] },
    { key: 'bank-deposit-list', name: 'Bank Deposit List', icon: 'bi-bank', endpoint: '/reports/member/bank-deposit-list', orientation: 'portrait', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'data-sheet', name: 'DATA SHEET', icon: 'bi-layout-text-window', endpoint: '/reports/member/data-sheet', orientation: 'landscape', categories: ['general', 'header', 'table', 'labels', 'footer', 'page'] },
    { key: 'bill-register', name: 'Bill Register', icon: 'bi-receipt-cutoff', endpoint: '/reports/member/bill-register', orientation: 'landscape', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'receipt-register', name: 'Receipt Register', icon: 'bi-cash-coin', endpoint: '/reports/member/receipt-register', orientation: 'landscape', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'debit-note-register', name: 'Debit Note Register', icon: 'bi-journal-text', endpoint: '/reports/member/debit-note-register', orientation: 'landscape', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'credit-note-register', name: 'Credit Note Register', icon: 'bi-journal-text', endpoint: '/reports/member/credit-note-register', orientation: 'landscape', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'adjustment-register', name: 'Adjustment Register', icon: 'bi-arrow-repeat', endpoint: '/reports/member/adjustment-register', orientation: 'landscape', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] },
    { key: 'member-jv-register', name: 'Member JV Register', icon: 'bi-journal-code', endpoint: '/reports/member/member-jv-register', orientation: 'landscape', categories: ['general', 'header', 'table', 'amounts', 'labels', 'footer', 'page'] }
  ];

  // CATEGORY DEFINITIONS
  const ALL_CATEGORIES = [
    { id: 'general', label: 'General', icon: 'bi-sliders' },
    { id: 'header', label: 'Header', icon: 'bi-layout-text-sidebar' },
    { id: 'member', label: 'Member / Doc', icon: 'bi-person-vcard' },
    { id: 'table', label: 'Table & Cols', icon: 'bi-table' },
    { id: 'amounts', label: 'Amounts', icon: 'bi-currency-rupee' },
    { id: 'labels', label: 'Labels & Prefixes', icon: 'bi-tags' },
    { id: 'qr', label: 'QR / Payment', icon: 'bi-qr-code' },
    { id: 'footer', label: 'Footer', icon: 'bi-layout-text-sidebar-reverse' },
    { id: 'signature', label: 'Signature', icon: 'bi-pen' },
    { id: 'page', label: 'Page / Print', icon: 'bi-printer' }
  ];

  // DEFAULT BASE DESIGN CONFIGURATION
  const DEFAULT_DESIGN = {
    // General
    reportEnabled: true,
    showTitle: true,
    showSubtitle: true,
    titleAlign: 'center',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    baseFontSize: 12,
    density: 'normal',
    reportBgColor: '#ffffff',
    primaryColor: '#1e40af',
    secondaryColor: '#0284c7',

    // Header
    showHeader: true,
    showLogo: true,
    logoPosition: 'left',
    logoSize: 'medium',
    showSocietyName: true,
    showRegNo: true,
    showPan: true,
    showGstin: true,
    showTan: true,
    showAddress: true,
    showContact: true,
    headerAlign: 'center',
    headerBorder: 'bottom',
    headerBgColor: '#ffffff',
    headerTextColor: '#0f172a',

    // Member / Document
    showMemberName: true,
    showFlatNo: true,
    showWing: true,
    showDocNo: true,
    showDate: true,
    showBillingPeriod: true,
    showDueDate: true,
    showRefNo: true,

    // Table & Columns
    showTable: true,
    headerStyle: 'strong',
    borderStyle: 'grid',
    rowDensity: 'normal',
    alternateRows: true,
    tableHeaderBg: '#1e40af',
    tableHeaderText: '#ffffff',
    tableFontSize: 11,
    cellPadding: 'normal',

    // Amounts
    showDebit: true,
    showCredit: true,
    showRunningBalance: true,
    showGrandTotal: true,
    showAmountInWords: true,
    amountAlign: 'right',
    currencyFormat: 'INR',
    decimalPlaces: 2,

    // Labels & Prefixes
    customTitle: '',
    docPrefix: '',
    refPrefix: '',
    customRemarks: '',

    // QR & Payment
    showQrCode: true,
    qrPosition: 'right',
    qrSize: 'medium',
    showBankDetails: true,
    showUpiDetails: true,
    showPaymentInstructions: true,

    // Footer
    showFooter: true,
    showPageNumber: true,
    showGeneratedDate: true,
    showGeneratedBy: true,
    footerAlign: 'space-between',
    footerText: '',
    footerBorder: true,

    // Signature
    showSignature: true,
    signaturePosition: 'right',
    showAuthSignatory: true,
    showPreparedBy: false,
    showCheckedBy: false,

    // Page / Print
    paperSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    repeatHeader: true,
    printBackground: true
  };

  // APP STATE
  let state = {
    activeReportKey: 'bill-format',
    activeCategory: 'general',
    testDataMode: false, // false = REAL ERP DATA / BLANK, true = HENU TEST DATA
    configs: {}, // reportKey -> config
    reportDataCache: {},
    isDirty: false
  };

  // CENTRALIZED HENU OS PREVIEW FIXTURES (Strictly Preview-Only, ZERO DB mutation)
  const HENU_SOCIETY = {
    SocietyName: 'HENU OS DEMO CO-OPERATIVE HOUSING SOCIETY LTD.',
    RegistrationNo: 'BOM/HSG/2026/HENU-01',
    PANNumber: 'AAACH9999K',
    GSTNumber: '27AAACH9999K1Z5',
    Address: 'Plot No. 101, HENU High-Tech Park, Sector 21, Navi Mumbai - 400705',
    BankName: 'State Bank of India (HENU Branch)',
    BankAccountNo: '10293847561',
    IFSCCode: 'SBIN0001234'
  };

  const PREVIEW_FIXTURES = {
    'bill-format': {
      society: HENU_SOCIETY,
      bills: [
        {
          billNo: 'HENU-TEST-BILL-001',
          billDate: '2026-10-01',
          dueDate: '2026-10-21',
          period: 'October 2026',
          isGst: true,
          sacCode: '999598',
          principalAmount: 5500,
          subtotalTaxable: 5500,
          cgstTotal: 495,
          sgstTotal: 495,
          prevArrears: 1200,
          interest: 150,
          currentBillTotal: 5500,
          netPayable: 7840,
          totalAmount: 7840,
          member: {
            name: 'HENU TEST MEMBER',
            memberName: 'HENU TEST MEMBER',
            flatNo: 'HENU-A-101',
            flat: 'HENU-A-101',
            wing: 'HENU',
            memberCode: 'HENU-M-001',
            code: 'HENU-M-001',
            areaSqft: 1250,
            area: 1250,
            gstin: '27AABCT9999M1Z9'
          },
          items: [
            { description: 'Monthly Society Maintenance Charges', headName: 'Monthly Society Maintenance Charges', taxable: 3500, cgst: 315, sgst: 315, amount: 4130, sac: '999598' },
            { description: 'Sinking & Reserve Fund Contribution', headName: 'Sinking & Reserve Fund Contribution', taxable: 1000, cgst: 90, sgst: 90, amount: 1180, sac: '999598' },
            { description: 'Covered Four-Wheeler Parking Fee', headName: 'Covered Four-Wheeler Parking Fee', taxable: 1000, cgst: 90, sgst: 90, amount: 1180, sac: '999598' }
          ]
        }
      ]
    },

    'receipt': {
      society: HENU_SOCIETY,
      receipts: [
        {
          receiptNo: 'HENU-TEST-REC-001',
          voucherNo: 'HENU-TEST-REC-001',
          date: '2026-10-05',
          receiptDate: '2026-10-05',
          voucherDate: '2026-10-05',
          period: 'October 2026',
          amount: 7840,
          paymentMode: 'NEFT / Digital Banking',
          mode: 'NEFT',
          chequeNo: 'IMPS/987654321',
          refNo: 'IMPS/987654321',
          bankName: 'HDFC Bank Ltd.',
          bank: 'HDFC Bank Ltd.',
          collectedBy: 'HENU OS System Administrator',
          member: {
            name: 'HENU TEST MEMBER',
            memberName: 'HENU TEST MEMBER',
            flatNo: 'HENU-A-101',
            flat: 'HENU-A-101',
            wing: 'HENU',
            memberCode: 'HENU-M-001',
            code: 'HENU-M-001'
          },
          particulars: [
            { head: 'Maintenance Charges Dues Cleared', amount: 6490 },
            { head: 'Arrears & Late Payment Surcharge', amount: 1350 }
          ]
        }
      ]
    },

    'debit-note': {
      society: HENU_SOCIETY,
      notes: [
        {
          note: {
            noteNo: 'HENU-TEST-DN-001',
            voucherNo: 'HENU-TEST-DN-001',
            noteDate: '2026-10-08',
            date: '2026-10-08',
            refBillNo: 'HENU-TEST-BILL-001',
            reason: 'Common Area Event Space Usage & Cleanup Charge',
            totalAmount: 2500,
            amount: 2500
          },
          member: {
            name: 'HENU TEST MEMBER',
            memberName: 'HENU TEST MEMBER',
            flatNo: 'HENU-A-101',
            flat: 'HENU-A-101',
            wing: 'HENU',
            code: 'HENU-M-001',
            memberCode: 'HENU-M-001'
          },
          items: [
            { srNo: 1, particulars: 'Clubhouse / Hall Event Maintenance', accountHead: 'Clubhouse / Hall Event Maintenance', amount: 2000, narration: 'Society Clubhouse booked for family gathering on 02/10/2026' },
            { srNo: 2, particulars: 'Premises Sanitation & Waste Disposal', accountHead: 'Premises Sanitation & Waste Disposal', amount: 500, narration: 'Deep sanitization post-event' }
          ]
        }
      ]
    },

    'credit-note': {
      society: HENU_SOCIETY,
      notes: [
        {
          note: {
            noteNo: 'HENU-TEST-CN-001',
            voucherNo: 'HENU-TEST-CN-001',
            noteDate: '2026-10-10',
            date: '2026-10-10',
            refBillNo: 'HENU-TEST-BILL-001',
            reason: 'Reversal of Excess Parking Charges Invoiced in Error',
            totalAmount: 1000,
            amount: 1000
          },
          member: {
            name: 'HENU TEST MEMBER',
            memberName: 'HENU TEST MEMBER',
            flatNo: 'HENU-A-101',
            flat: 'HENU-A-101',
            wing: 'HENU',
            code: 'HENU-M-001',
            memberCode: 'HENU-M-001'
          },
          items: [
            { srNo: 1, particulars: 'Parking Fee Waiver / Correction', accountHead: 'Parking Fee Waiver / Correction', amount: 1000, narration: 'Reversal of extra slot fee billed during maintenance renovation period' }
          ]
        }
      ]
    },

    'adjustment': {
      society: HENU_SOCIETY,
      adjustments: [
        {
          voucherNo: 'HENU-TEST-ADJ-001',
          adjustmentNo: 'HENU-TEST-ADJ-001',
          date: '2026-10-12',
          voucherDate: '2026-10-12',
          adjType: 'Advance Maintenance Set-off',
          type: 'Advance Maintenance Set-off',
          sourceHead: 'Member Advance Deposit Ledger',
          destHead: 'Current Maintenance Dues',
          amount: 3500,
          totalAmount: 3500,
          narration: 'Being advance payment received in previous quarter adjusted against current billing dues.',
          member: {
            name: 'HENU TEST MEMBER',
            memberName: 'HENU TEST MEMBER',
            flatNo: 'HENU-A-101',
            flat: 'HENU-A-101',
            wing: 'HENU',
            code: 'HENU-M-001',
            memberCode: 'HENU-M-001'
          },
          entries: [
            { accountHead: 'Member Advance Balance A/C', debit: 3500, credit: 0 },
            { accountHead: 'Maintenance Receivables Control A/C', debit: 0, credit: 3500 }
          ]
        }
      ]
    },

    'outstanding-list': {
      society: HENU_SOCIETY,
      period: 'October 2026',
      members: [
        { srNo: 1, flatNo: '101', wing: 'HENU-A', memName: 'HENU TEST MEMBER 1', principal: 4500, interest: 120, closingDebit: 4620, closingCredit: 0 },
        { srNo: 2, flatNo: '102', wing: 'HENU-A', memName: 'HENU TEST MEMBER 2', principal: 6200, interest: 180, closingDebit: 6380, closingCredit: 0 },
        { srNo: 3, flatNo: '201', wing: 'HENU-B', memName: 'HENU TEST MEMBER 3', principal: 0, interest: 0, closingDebit: 0, closingCredit: 1500 }
      ]
    },

    'member-account-head-wise': {
      society: HENU_SOCIETY,
      period: 'FY 2026-27',
      billTypeName: 'MAINTENANCE',
      dynamicColumns: [
        { headName: 'Maintenance', key: 'maint' },
        { headName: 'Sinking Fund', key: 'sinking' },
        { headName: 'Parking', key: 'parking' }
      ],
      memberLedgers: [
        {
          memberInfo: { memberName: 'HENU TEST MEMBER', flatNo: 'HENU-A-101', memberCode: 'HENU-M-001', contactNo: '9876543210' },
          openingBalance: { totalOpening: 1200, interest: 100, headWise: { Maintenance: 1100, Sinking: 0, Parking: 0, Interest: 100 } },
          transactions: [
            { date: '2026-10-01', voucherTypeNo: 'BILL-001', particulars: 'Monthly Bill', headWiseAmounts: { maint: 3500, sinking: 1000, parking: 1000 }, totalDebit: 5500, totalCredit: 0, runningBalance: 6700 },
            { date: '2026-10-05', voucherTypeNo: 'REC-001', particulars: 'Bank Transfer Recv', headWiseAmounts: { maint: 0, sinking: 0, parking: 0 }, totalDebit: 0, totalCredit: 6700, runningBalance: 0 }
          ],
          closingBalance: { totalClosing: 0, debit: 0, credit: 0 }
        }
      ]
    },

    'member-register-dr-cr': {
      society: HENU_SOCIETY,
      period: 'FY 2026-27',
      billTypeName: 'MAINTENANCE',
      memberRegisters: [
        {
          memberInfo: { memberName: 'HENU TEST MEMBER', flatNo: 'HENU-A-101', memberCode: 'HENU-M-001', contactNo: '9876543210', areaSqFt: '1250' },
          openingBalance: { principal: 1100, interest: 100, totalOpening: 1200 },
          transactions: [
            { date: '2026-10-01', voucherTypeNo: 'BILL-001', particulars: 'Maintenance Demand Oct 2026', principal: 5500, interest: 0, totalDebit: 5500, totalCredit: 0, balance: 6700 },
            { date: '2026-10-05', voucherTypeNo: 'REC-001', particulars: 'Receipt via NEFT', principal: 0, interest: 0, totalDebit: 0, totalCredit: 6700, balance: 0 }
          ],
          closingBalance: { totalClosing: 0, debit: 0, credit: 0 }
        }
      ]
    },

    'member-control-account': {
      society: HENU_SOCIETY,
      fyLabel: '2026-2027',
      openingDebtors: 125000,
      closingReceivable: 142000,
      totalDebits: 450000,
      totalCredits: 433000,
      summary: {
        openingDebtors: 125000,
        closingReceivable: 142000,
        totalMaintenanceRaised: 450000,
        totalCollections: 433000,
        totalAdjustments: 0
      },
      rows: [
        { srNo: 1, postingDate: '2026-10-01', voucher: 'BILL-OCT', transaction: 'Maintenance Demand Invoiced for October 2026', debit: 450000, credit: 0, runningBalance: 575000 },
        { srNo: 2, postingDate: '2026-10-15', voucher: 'RCPT-OCT', transaction: 'Total Collections Received in Bank Account', debit: 0, credit: 433000, runningBalance: 142000 }
      ]
    },

    'balance-confirmation-letter': {
      society: HENU_SOCIETY,
      fyLabel: '2026-2027',
      asOnDate: '2026-10-31',
      letters: [
        {
          member: {
            name: 'HENU TEST MEMBER',
            memberName: 'HENU TEST MEMBER',
            flatNo: 'HENU-A-101',
            flat: 'HENU-A-101',
            wing: 'HENU',
            code: 'HENU-M-001',
            memberCode: 'HENU-M-001'
          },
          openingBalance: 1200,
          billedAmount: 5500,
          demands: 5500,
          collectedAmount: 6700,
          payments: 6700,
          adjustedAmount: 0,
          closingBalance: 0,
          closingDue: 0
        }
      ]
    },

    'bank-deposit-list': {
      society: HENU_SOCIETY,
      fyLabel: '2026-2027',
      deposits: [
        { depositDate: '2026-10-05', receiptNo: 'HENU-TEST-REC-001', member: 'HENU TEST MEMBER', flat: 'HENU-A-101', paymentMode: 'Cheque', chequeNo: 'CHQ-882190', bankName: 'HDFC Bank Ltd.', amount: 7840, clearanceStatus: 'Cleared' },
        { depositDate: '2026-10-06', receiptNo: 'HENU-TEST-REC-002', member: 'HENU TEST MEMBER 2', flat: 'HENU-A-102', paymentMode: 'NEFT', chequeNo: 'UTIB0002198', bankName: 'Axis Bank', amount: 6500, clearanceStatus: 'Received' },
        { depositDate: '2026-10-07', receiptNo: 'HENU-TEST-REC-003', member: 'HENU TEST MEMBER 3', flat: 'HENU-B-201', paymentMode: 'Cash', chequeNo: '-', bankName: 'Direct Cash Counter', amount: 4200, clearanceStatus: 'Deposited' }
      ]
    },

    'data-sheet': {
      society: HENU_SOCIETY,
      members: [
        { memberCode: 'HENU-M-001', memberName: 'HENU TEST MEMBER 1', coOwner: 'HENU CO-OWNER 1', wing: 'A', flat: '101', flatType: '2 BHK', areaSqft: 1250, mobile: '9876543210', email: 'testmember1@henu.org', pan: 'AAACH9999K', totalOpening: 1200 },
        { memberCode: 'HENU-M-002', memberName: 'HENU TEST MEMBER 2', coOwner: 'HENU CO-OWNER 2', wing: 'A', flat: '102', flatType: '3 BHK', areaSqft: 1650, mobile: '9876543211', email: 'testmember2@henu.org', pan: 'AAACH9998L', totalOpening: 0 },
        { memberCode: 'HENU-M-003', memberName: 'HENU TEST MEMBER 3', coOwner: '-', wing: 'B', flat: '201', flatType: '2 BHK', areaSqft: 1100, mobile: '9876543212', email: 'testmember3@henu.org', pan: 'AAACH9997M', totalOpening: 2500 }
      ]
    },

    'bill-register': {
      society: HENU_SOCIETY,
      period: 'October 2026',
      bills: [
        { srNo: 1, billNo: 'HENU-TEST-BILL-001', billDate: '2026-10-01', wing: 'A', flatNo: '101', memberName: 'HENU TEST MEMBER 1', maintenance: 3500, sinking: 1000, parking: 1000, nonOccupancy: 0, arrears: 1200, taxable: 5500, cgst: 495, sgst: 495, total: 7840 },
        { srNo: 2, billNo: 'HENU-TEST-BILL-002', billDate: '2026-10-01', wing: 'A', flatNo: '102', memberName: 'HENU TEST MEMBER 2', maintenance: 4500, sinking: 1200, parking: 1000, nonOccupancy: 500, arrears: 0, taxable: 7200, cgst: 648, sgst: 648, total: 8496 },
        { srNo: 3, billNo: 'HENU-TEST-BILL-003', billDate: '2026-10-01', wing: 'B', flatNo: '201', memberName: 'HENU TEST MEMBER 3', maintenance: 3200, sinking: 800, parking: 0, nonOccupancy: 0, arrears: 0, taxable: 4000, cgst: 360, sgst: 360, total: 4720 }
      ]
    },

    'receipt-register': {
      society: HENU_SOCIETY,
      period: 'October 2026',
      receipts: [
        { srNo: 1, receiptNo: 'HENU-TEST-REC-001', date: '2026-10-05', memberName: 'HENU TEST MEMBER 1', wing: 'A', flatNo: '101', mode: 'NEFT', refNo: 'IMPS/987654321', bank: 'HDFC Bank', amount: 7840, status: 'CLEARED' },
        { srNo: 2, receiptNo: 'HENU-TEST-REC-002', date: '2026-10-06', memberName: 'HENU TEST MEMBER 2', wing: 'A', flatNo: '102', mode: 'CHEQUE', refNo: 'CHQ-882190', bank: 'Axis Bank', amount: 8496, status: 'CLEARED' },
        { srNo: 3, receiptNo: 'HENU-TEST-REC-003', date: '2026-10-07', memberName: 'HENU TEST MEMBER 3', wing: 'B', flatNo: '201', mode: 'CASH', refNo: 'CASH-PAY-03', bank: 'Counter', amount: 4720, status: 'CLEARED' }
      ]
    },

    'debit-note-register': {
      society: HENU_SOCIETY,
      notes: [
        { debitNoteNumber: 'HENU-TEST-DN-001', date: '2026-10-08', memberName: 'HENU TEST MEMBER 1', wing: 'A', flatNo: '101', reason: 'Clubhouse Event Booking Fee', accountHead: 'Clubhouse Maintenance', debitAmount: 2500, status: 'Posted' },
        { debitNoteNumber: 'HENU-TEST-DN-002', date: '2026-10-09', memberName: 'HENU TEST MEMBER 2', wing: 'A', flatNo: '102', reason: 'Replacement of Key Fobs', accountHead: 'Security Access Head', debitAmount: 800, status: 'Posted' }
      ]
    },

    'credit-note-register': {
      society: HENU_SOCIETY,
      notes: [
        { creditNoteNumber: 'HENU-TEST-CN-001', date: '2026-10-10', memberName: 'HENU TEST MEMBER 1', wing: 'A', flatNo: '101', reason: 'Reversal of Excess Parking Slot Invoiced', accountHead: 'Parking Fee Waiver', creditAmount: 1000, status: 'Posted' },
        { creditNoteNumber: 'HENU-TEST-CN-002', date: '2026-10-11', memberName: 'HENU TEST MEMBER 2', wing: 'A', flatNo: '102', reason: 'Early Payment Rebate Incentive', accountHead: 'Prompt Payment Rebate', creditAmount: 250, status: 'Posted' }
      ]
    },

    'adjustment-register': {
      society: HENU_SOCIETY,
      adjustments: [
        { adjustmentNumber: 'HENU-TEST-ADJ-001', date: '2026-10-12', memberName: 'HENU TEST MEMBER 1', wing: 'A', flatNo: '101', sourceHead: 'Member Advance Deposit', destHead: 'Current Maintenance Dues', adjustmentType: 'Advance Offset', amount: 3500, narration: 'Advance adjusted against Oct 2026 bill', status: 'Posted' },
        { adjustmentNumber: 'HENU-TEST-ADJ-002', date: '2026-10-13', memberName: 'HENU TEST MEMBER 2', wing: 'A', flatNo: '102', sourceHead: 'Excess Sinking Fund', destHead: 'Repair Special Levy', adjustmentType: 'Head Transfer', amount: 1200, narration: 'Reallocated to special lift repair levy', status: 'Posted' }
      ]
    },

    'member-jv-register': {
      society: HENU_SOCIETY,
      jvs: [
        {
          jvNumber: 'HENU-TEST-JV-001',
          date: '2026-10-15',
          wing: 'A',
          flatNo: '101',
          memberName: 'HENU TEST MEMBER 1',
          narration: 'Being interest on arrears waived off per AGM Resolution #14/2026.',
          lines: [
            { ledgerHead: 'Interest Waiver Expense A/C', debit: 150, credit: 0 },
            { ledgerHead: 'Member Overdue Interest Receivable A/C', debit: 0, credit: 150 }
          ]
        },
        {
          jvNumber: 'HENU-TEST-JV-002',
          date: '2026-10-16',
          wing: 'A',
          flatNo: '102',
          memberName: 'HENU TEST MEMBER 2',
          narration: 'Being transfer of security deposit to society corpus fund upon tenancy completion.',
          lines: [
            { ledgerHead: 'Tenant Security Deposit Held', debit: 5000, credit: 0 },
            { ledgerHead: 'Society Sinking & Corpus Fund', debit: 0, credit: 5000 }
          ]
        }
      ]
    }
  };

  // INITIALIZATION
  async function init() {
    renderModuleTabs();
    await selectModule(state.activeReportKey);
  }

  // RENDER 18 MODULE TABS
  function renderModuleTabs() {
    const container = document.getElementById('moduleTabsStrip');
    if (!container) return;

    container.innerHTML = MODULES.map(m => `
      <div class="hod-module-tab ${m.key === state.activeReportKey ? 'active' : ''}" id="modTab_${m.key}" onclick="selectModule('${m.key}')">
        <i class="bi ${m.icon}"></i>
        <span>${m.name}</span>
      </div>
    `).join('');
  }

  // SELECT MODULE TAB
  async function selectModule(reportKey) {
    state.activeReportKey = reportKey;
    const mod = MODULES.find(m => m.key === reportKey) || MODULES[0];

    // Reset test data mode safely to false upon switching modules
    state.testDataMode = false;
    const btnTest = document.getElementById('btnToggleTestData');
    const lblTest = document.getElementById('lblTestData');
    if (btnTest) {
      btnTest.classList.remove('primary');
      btnTest.style.background = '';
      btnTest.style.color = '';
    }
    if (lblTest) lblTest.textContent = 'Test Data';

    // Update active tab styling
    document.querySelectorAll('.hod-module-tab').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById(`modTab_${reportKey}`);
    if (tabEl) {
      tabEl.classList.add('active');
      tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // Update breadcrumb
    const crumbIcon = document.getElementById('crumbIcon');
    const crumbText = document.getElementById('crumbText');
    if (crumbIcon) crumbIcon.className = `bi ${mod.icon}`;
    if (crumbText) crumbText.textContent = mod.name;

    // Load active/saved design
    if (!state.configs[reportKey]) {
      const savedDesign = await HenuOsReportEngine.loadActiveDesign(reportKey);
      state.configs[reportKey] = Object.assign({}, DEFAULT_DESIGN, { orientation: mod.orientation }, savedDesign || {});
    }

    // Select category (default to first available)
    if (!mod.categories.includes(state.activeCategory)) {
      state.activeCategory = mod.categories[0] || 'general';
    }

    state.isDirty = false;
    updateStatusBadge();
    renderCategoryTabs();
    renderSettingsForm();
    await loadAndRenderPreview();
  }

  // RENDER CATEGORY TABS
  function renderCategoryTabs() {
    const container = document.getElementById('categoryTabsStrip');
    if (!container) return;

    const mod = MODULES.find(m => m.key === state.activeReportKey) || MODULES[0];
    const availableCats = ALL_CATEGORIES.filter(c => mod.categories.includes(c.id));

    container.innerHTML = availableCats.map(c => `
      <div class="hod-cat-pill ${c.id === state.activeCategory ? 'active' : ''}" onclick="selectCategory('${c.id}')">
        <i class="bi ${c.icon}"></i>
        <span>${c.label}</span>
      </div>
    `).join('');
  }

  // SELECT CATEGORY
  function selectCategory(catId) {
    state.activeCategory = catId;
    renderCategoryTabs();
    renderSettingsForm();
  }

  // RENDER SETTINGS FORM (CONTROLLED ERP FIELDS)
  function renderSettingsForm() {
    const container = document.getElementById('settingsFormContainer');
    if (!container) return;

    const cfg = state.configs[state.activeReportKey] || DEFAULT_DESIGN;
    const cat = state.activeCategory;

    let html = '';

    if (cat === 'general') {
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-sliders"></i> General Document Settings</div>
          <div class="hod-card-body">
            <div class="hod-field-row">
              <span class="hod-field-label">Report Enabled</span>
              <label class="hod-switch">
                <input type="checkbox" id="f_reportEnabled" ${cfg.reportEnabled ? 'checked' : ''} onchange="updateField('reportEnabled', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Report Title</span>
              <label class="hod-switch">
                <input type="checkbox" id="f_showTitle" ${cfg.showTitle ? 'checked' : ''} onchange="updateField('showTitle', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Title Alignment</span>
              <select class="hod-select" onchange="updateField('titleAlign', this.value)">
                <option value="left" ${cfg.titleAlign === 'left' ? 'selected' : ''}>Left</option>
                <option value="center" ${cfg.titleAlign === 'center' ? 'selected' : ''}>Center</option>
                <option value="right" ${cfg.titleAlign === 'right' ? 'selected' : ''}>Right</option>
              </select>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Font Family</span>
              <select class="hod-select" onchange="updateField('fontFamily', this.value)">
                <option value="Segoe UI, Arial, sans-serif" ${cfg.fontFamily.includes('Segoe') ? 'selected' : ''}>Segoe UI / System</option>
                <option value="Inter, Roboto, sans-serif" ${cfg.fontFamily.includes('Inter') ? 'selected' : ''}>Inter / Modern</option>
                <option value="Georgia, serif" ${cfg.fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia / Serif</option>
                <option value="'Courier New', monospace" ${cfg.fontFamily.includes('Courier') ? 'selected' : ''}>Courier / Monospace</option>
              </select>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Base Font Size (pt)</span>
              <input type="number" class="hod-input" min="9" max="16" value="${cfg.baseFontSize || 12}" onchange="updateField('baseFontSize', Number(this.value))">
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Primary Brand Color</span>
              <input type="color" class="hod-input" value="${cfg.primaryColor || '#1e40af'}" onchange="updateField('primaryColor', this.value)">
            </div>
          </div>
        </div>
      `;
    } else if (cat === 'header') {
      const hDisabled = !cfg.showHeader;
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-layout-text-sidebar"></i> Society Masthead & Header</div>
          <div class="hod-card-body">
            <div class="hod-field-row">
              <span class="hod-field-label">Show Header Masthead</span>
              <label class="hod-switch">
                <input type="checkbox" id="f_showHeader" ${cfg.showHeader ? 'checked' : ''} onchange="updateField('showHeader', this.checked); renderSettingsForm();">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${hDisabled ? 'hod-text-muted' : ''}">Show Society Logo</span>
              <label class="hod-switch">
                <input type="checkbox" id="f_showLogo" ${cfg.showLogo ? 'checked' : ''} ${hDisabled ? 'disabled' : ''} onchange="updateField('showLogo', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${hDisabled ? 'hod-text-muted' : ''}">Logo Position</span>
              <select class="hod-select" ${hDisabled ? 'disabled' : ''} onchange="updateField('logoPosition', this.value)">
                <option value="left" ${cfg.logoPosition === 'left' ? 'selected' : ''}>Left</option>
                <option value="center" ${cfg.logoPosition === 'center' ? 'selected' : ''}>Center</option>
                <option value="right" ${cfg.logoPosition === 'right' ? 'selected' : ''}>Right</option>
              </select>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${hDisabled ? 'hod-text-muted' : ''}">Show Society Name</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showSocietyName ? 'checked' : ''} ${hDisabled ? 'disabled' : ''} onchange="updateField('showSocietyName', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${hDisabled ? 'hod-text-muted' : ''}">Show Registration Number</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showRegNo ? 'checked' : ''} ${hDisabled ? 'disabled' : ''} onchange="updateField('showRegNo', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${hDisabled ? 'hod-text-muted' : ''}">Show GSTIN / PAN</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showGstin ? 'checked' : ''} ${hDisabled ? 'disabled' : ''} onchange="updateField('showGstin', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${hDisabled ? 'hod-text-muted' : ''}">Show Registered Address</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showAddress ? 'checked' : ''} ${hDisabled ? 'disabled' : ''} onchange="updateField('showAddress', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${hDisabled ? 'hod-text-muted' : ''}">Header Alignment</span>
              <select class="hod-select" ${hDisabled ? 'disabled' : ''} onchange="updateField('headerAlign', this.value)">
                <option value="left" ${cfg.headerAlign === 'left' ? 'selected' : ''}>Left</option>
                <option value="center" ${cfg.headerAlign === 'center' ? 'selected' : ''}>Center</option>
                <option value="right" ${cfg.headerAlign === 'right' ? 'selected' : ''}>Right</option>
              </select>
            </div>
          </div>
        </div>
      `;
    } else if (cat === 'member') {
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-person-vcard"></i> Member & Document Metadata</div>
          <div class="hod-card-body">
            <div class="hod-field-row">
              <span class="hod-field-label">Show Member Name</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showMemberName ? 'checked' : ''} onchange="updateField('showMemberName', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Flat / Unit & Wing</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showFlatNo ? 'checked' : ''} onchange="updateField('showFlatNo', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Document / Voucher No</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showDocNo ? 'checked' : ''} onchange="updateField('showDocNo', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Transaction Date</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showDate ? 'checked' : ''} onchange="updateField('showDate', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Billing Period</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showBillingPeriod ? 'checked' : ''} onchange="updateField('showBillingPeriod', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Due Date</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showDueDate ? 'checked' : ''} onchange="updateField('showDueDate', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      `;
    } else if (cat === 'table') {
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-table"></i> Table Presentation & Borders</div>
          <div class="hod-card-body">
            <div class="hod-field-row">
              <span class="hod-field-label">Show Table</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showTable ? 'checked' : ''} onchange="updateField('showTable', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Border Style</span>
              <select class="hod-select" onchange="updateField('borderStyle', this.value)">
                <option value="grid" ${cfg.borderStyle === 'grid' ? 'selected' : ''}>Full Grid</option>
                <option value="horizontal" ${cfg.borderStyle === 'horizontal' ? 'selected' : ''}>Horizontal Lines Only</option>
                <option value="minimal" ${cfg.borderStyle === 'minimal' ? 'selected' : ''}>Minimal / Outer</option>
              </select>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Alternate Row Zebra Shading</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.alternateRows ? 'checked' : ''} onchange="updateField('alternateRows', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Table Header Background</span>
              <input type="color" class="hod-input" value="${cfg.tableHeaderBg || '#1e40af'}" onchange="updateField('tableHeaderBg', this.value)">
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Table Font Size (pt)</span>
              <input type="number" class="hod-input" min="8" max="14" value="${cfg.tableFontSize || 11}" onchange="updateField('tableFontSize', Number(this.value))">
            </div>
          </div>
        </div>
      `;
    } else if (cat === 'amounts') {
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-currency-rupee"></i> Financial & Amount Formatting</div>
          <div class="hod-card-body">
            <div class="hod-field-row">
              <span class="hod-field-label">Show Grand Totals Row</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showGrandTotal ? 'checked' : ''} onchange="updateField('showGrandTotal', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Amount in Words</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showAmountInWords ? 'checked' : ''} onchange="updateField('showAmountInWords', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Numeric Alignment</span>
              <select class="hod-select" onchange="updateField('amountAlign', this.value)">
                <option value="right" ${cfg.amountAlign === 'right' ? 'selected' : ''}>Right Aligned (Standard)</option>
                <option value="center" ${cfg.amountAlign === 'center' ? 'selected' : ''}>Center</option>
                <option value="left" ${cfg.amountAlign === 'left' ? 'selected' : ''}>Left</option>
              </select>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Decimal Places</span>
              <select class="hod-select" onchange="updateField('decimalPlaces', Number(this.value))">
                <option value="2" ${cfg.decimalPlaces === 2 ? 'selected' : ''}>2 Decimals (e.g. 1,250.00)</option>
                <option value="0" ${cfg.decimalPlaces === 0 ? 'selected' : ''}>0 Decimals (Round Integer)</option>
              </select>
            </div>
          </div>
        </div>
      `;
    } else if (cat === 'labels') {
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-tags"></i> Custom Labels & Prefixes</div>
          <div class="hod-card-body">
            <div class="hod-field-row vertical">
              <span class="hod-field-label">Custom Report Title Override</span>
              <input type="text" class="hod-input" style="width:100%;" placeholder="Default Title" value="${cfg.customTitle || ''}" oninput="updateField('customTitle', this.value)">
            </div>

            <div class="hod-field-row vertical">
              <span class="hod-field-label">Document Number Prefix (e.g. "BILL/", "REC/")</span>
              <input type="text" class="hod-input" style="width:100%;" placeholder="e.g. BILL-" value="${cfg.docPrefix || ''}" oninput="updateField('docPrefix', this.value)">
            </div>

            <div class="hod-field-row vertical">
              <span class="hod-field-label">Custom Reference / Subtitle Text</span>
              <input type="text" class="hod-input" style="width:100%;" placeholder="e.g. For Official Purpose" value="${cfg.refPrefix || ''}" oninput="updateField('refPrefix', this.value)">
            </div>
          </div>
        </div>
      `;
    } else if (cat === 'qr') {
      const qrDisabled = !cfg.showQrCode;
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-qr-code"></i> UPI QR & Payment Block</div>
          <div class="hod-card-body">
            <div class="hod-field-row">
              <span class="hod-field-label">Show Dynamic Payment QR</span>
              <label class="hod-switch">
                <input type="checkbox" id="f_showQrCode" ${cfg.showQrCode ? 'checked' : ''} onchange="updateField('showQrCode', this.checked); renderSettingsForm();">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${qrDisabled ? 'hod-text-muted' : ''}">QR Code Position</span>
              <select class="hod-select" ${qrDisabled ? 'disabled' : ''} onchange="updateField('qrPosition', this.value)">
                <option value="right" ${cfg.qrPosition === 'right' ? 'selected' : ''}>Right</option>
                <option value="left" ${cfg.qrPosition === 'left' ? 'selected' : ''}>Left</option>
                <option value="center" ${cfg.qrPosition === 'center' ? 'selected' : ''}>Center</option>
              </select>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Bank Account Details</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showBankDetails ? 'checked' : ''} onchange="updateField('showBankDetails', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Payment Terms / Instructions</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showPaymentInstructions ? 'checked' : ''} onchange="updateField('showPaymentInstructions', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      `;
    } else if (cat === 'footer') {
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-layout-text-sidebar-reverse"></i> Footer & Generation Details</div>
          <div class="hod-card-body">
            <div class="hod-field-row">
              <span class="hod-field-label">Show Footer</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showFooter ? 'checked' : ''} onchange="updateField('showFooter', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Page Numbers</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showPageNumber ? 'checked' : ''} onchange="updateField('showPageNumber', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show System Generation Timestamp</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showGeneratedDate ? 'checked' : ''} onchange="updateField('showGeneratedDate', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Show Top Border</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.footerBorder ? 'checked' : ''} onchange="updateField('footerBorder', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      `;
    } else if (cat === 'signature') {
      const sigDisabled = !cfg.showSignature;
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-pen"></i> Authorized Signature Area</div>
          <div class="hod-card-body">
            <div class="hod-field-row">
              <span class="hod-field-label">Show Signature Block</span>
              <label class="hod-switch">
                <input type="checkbox" id="f_showSignature" ${cfg.showSignature ? 'checked' : ''} onchange="updateField('showSignature', this.checked); renderSettingsForm();">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${sigDisabled ? 'hod-text-muted' : ''}">Show Authorized Signatory</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showAuthSignatory ? 'checked' : ''} ${sigDisabled ? 'disabled' : ''} onchange="updateField('showAuthSignatory', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${sigDisabled ? 'hod-text-muted' : ''}">Show Prepared By</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showPreparedBy ? 'checked' : ''} ${sigDisabled ? 'disabled' : ''} onchange="updateField('showPreparedBy', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label ${sigDisabled ? 'hod-text-muted' : ''}">Show Checked By</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.showCheckedBy ? 'checked' : ''} ${sigDisabled ? 'disabled' : ''} onchange="updateField('showCheckedBy', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      `;
    } else if (cat === 'page') {
      html = `
        <div class="hod-card">
          <div class="hod-card-header"><i class="bi bi-printer"></i> Page Setup & Print Options</div>
          <div class="hod-card-body">
            <div class="hod-field-row">
              <span class="hod-field-label">Paper Size</span>
              <select class="hod-select" onchange="updateField('paperSize', this.value)">
                <option value="A4" ${cfg.paperSize === 'A4' ? 'selected' : ''}>A4 (210 x 297 mm)</option>
                <option value="A5" ${cfg.paperSize === 'A5' ? 'selected' : ''}>A5 (148 x 210 mm)</option>
                <option value="Letter" ${cfg.paperSize === 'Letter' ? 'selected' : ''}>Letter (8.5 x 11 in)</option>
              </select>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Page Orientation</span>
              <select class="hod-select" onchange="updateField('orientation', this.value)">
                <option value="portrait" ${cfg.orientation === 'portrait' ? 'selected' : ''}>Portrait</option>
                <option value="landscape" ${cfg.orientation === 'landscape' ? 'selected' : ''}>Landscape</option>
              </select>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Print Margins</span>
              <select class="hod-select" onchange="updateField('margins', this.value)">
                <option value="small" ${cfg.margins === 'small' ? 'selected' : ''}>Compact (8 mm)</option>
                <option value="normal" ${cfg.margins === 'normal' ? 'selected' : ''}>Standard (12 mm)</option>
                <option value="large" ${cfg.margins === 'large' ? 'selected' : ''}>Spacious (18 mm)</option>
              </select>
            </div>

            <div class="hod-field-row">
              <span class="hod-field-label">Repeat Table Header on Each Page</span>
              <label class="hod-switch">
                <input type="checkbox" ${cfg.repeatHeader ? 'checked' : ''} onchange="updateField('repeatHeader', this.checked)">
                <span class="hod-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  // UPDATE FIELD VALUE & REACTIVELY RE-RENDER
  function updateField(key, val) {
    if (!state.configs[state.activeReportKey]) {
      state.configs[state.activeReportKey] = Object.assign({}, DEFAULT_DESIGN);
    }
    state.configs[state.activeReportKey][key] = val;
    state.isDirty = true;
    updateStatusBadge();
    renderLivePreview();
  }

  function updateStatusBadge() {
    const badge = document.getElementById('designStatusBadge');
    const sub = document.getElementById('previewStateSub');
    if (!badge || !sub) return;

    if (state.isDirty) {
      badge.textContent = 'DRAFT CHANGES';
      badge.style.background = '#fef3c7';
      badge.style.color = '#b45309';
      badge.style.borderColor = '#fde68a';
      if (!state.testDataMode) {
        sub.textContent = '(Draft Changes Unsaved)';
      }
    } else {
      badge.textContent = 'ACTIVE DESIGN';
      badge.style.background = '#dcfce7';
      badge.style.color = '#166534';
      badge.style.borderColor = '#bbf7d0';
      if (!state.testDataMode) {
        sub.textContent = '(Real ERP Data • Current Active Design)';
      }
    }
  }

  // TOGGLE TEST DATA (PREVIEW ONLY)
  function toggleTestData() {
    state.testDataMode = !state.testDataMode;
    const btn = document.getElementById('btnToggleTestData');
    const lbl = document.getElementById('lblTestData');
    const sub = document.getElementById('previewStateSub');

    if (state.testDataMode) {
      if (btn) {
        btn.classList.add('primary');
        btn.style.background = 'var(--hod-primary)';
        btn.style.color = '#ffffff';
      }
      if (lbl) lbl.textContent = 'Remove Test Data';
      if (sub) sub.textContent = '(HENU Test Data • Current Active Design)';
      showToast('Test Data mode ON (Temporary preview only, database untouched).', 'success');
    } else {
      if (btn) {
        btn.classList.remove('primary');
        btn.style.background = '';
        btn.style.color = '';
      }
      if (lbl) lbl.textContent = 'Test Data';
      updateStatusBadge();
      showToast('Test Data removed. Restored live ERP / blank template mode.', 'success');
    }
    renderLivePreview();
  }

  // LOAD REAL DATA & RENDER PREVIEW
  async function loadAndRenderPreview() {
    const sheet = document.getElementById('previewSheet');
    if (!sheet) return;

    const mod = MODULES.find(m => m.key === state.activeReportKey) || MODULES[0];
    const ctx = HenuOsReportEngine.getSystemContext();

    if (!state.reportDataCache[state.activeReportKey]) {
      try {
        const url = `${ctx.apiBase}${mod.endpoint}?societyId=${ctx.societyId}&fyId=${ctx.fyId}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          state.reportDataCache[state.activeReportKey] = json;
        } else {
          state.reportDataCache[state.activeReportKey] = null;
        }
      } catch (e) {
        console.warn(`[HOD] Live data fetch note for ${mod.key}:`, e);
        state.reportDataCache[state.activeReportKey] = null;
      }
    }

    renderLivePreview();
  }

  // REACTIVE LIVE PREVIEW RENDERER (Uses the Real Report Renderer & DOM Structures)
  function renderLivePreview() {
    const sheet = document.getElementById('previewSheet');
    if (!sheet) return;

    const mod = MODULES.find(m => m.key === state.activeReportKey) || MODULES[0];
    const cfg = state.configs[state.activeReportKey] || DEFAULT_DESIGN;

    // Resolve Data according to the 3-State Model:
    // Mode 1: TEST DATA (if testDataMode === true)
    // Mode 2: REAL ERP DATA (if testDataMode === false and real database data exists)
    // Mode 3: BLANK TEMPLATE (if testDataMode === false and real data has no records)
    let data = null;
    let dataMode = 'REAL';

    if (state.testDataMode) {
      data = PREVIEW_FIXTURES[mod.key] || {};
      dataMode = 'TEST';
    } else {
      const real = state.reportDataCache[state.activeReportKey];
      if (real && (real.bills || real.vouchers || real.receipts || real.notes || real.adjustments || real.jvs || real.members || real.deposits || real.letters || real.memberLedgers || real.memberRegisters || real.rows || real.items)) {
        data = real;
        dataMode = 'REAL';
      } else {
        // Blank Template mode: Real society info, but 0 records
        data = { society: (real && real.society) ? real.society : HENU_SOCIETY };
        dataMode = 'EMPTY';
      }
    }

    // Set Orientation on container sheet
    if (cfg.orientation === 'landscape') {
      sheet.classList.add('landscape');
    } else {
      sheet.classList.remove('landscape');
    }

    // Dynamic Style Properties
    sheet.style.setProperty('--bill-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--rcpt-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--dn-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--cn-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--adj-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--ctrl-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--bac-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--bd-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--ds-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--br-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--rr-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--dnr-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--cnr-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--ar-primary', cfg.primaryColor || '#1e40af');
    sheet.style.setProperty('--jv-primary', cfg.primaryColor || '#1e40af');
    sheet.style.fontFamily = cfg.fontFamily || 'Segoe UI, Arial, sans-serif';
    sheet.style.fontSize = `${cfg.baseFontSize || 12}pt`;

    const soc = data.society || HENU_SOCIETY;

    // Dispatch to dedicated real report renderer
    switch (mod.key) {
      case 'bill-format':
        sheet.innerHTML = renderBillFormatDoc(soc, data.bills || [], cfg, dataMode);
        break;
      case 'receipt':
        sheet.innerHTML = renderReceiptDoc(soc, data.receipts || data.vouchers || [], cfg, dataMode);
        break;
      case 'debit-note':
        sheet.innerHTML = renderDebitNoteDoc(soc, data.notes || data.items || [], cfg, dataMode);
        break;
      case 'credit-note':
        sheet.innerHTML = renderCreditNoteDoc(soc, data.notes || data.items || [], cfg, dataMode);
        break;
      case 'adjustment':
        sheet.innerHTML = renderAdjustmentDoc(soc, data.adjustments || data.vouchers || [], cfg, dataMode);
        break;
      case 'outstanding-list':
        sheet.innerHTML = renderOutstandingListDoc(soc, data, data.members || data.rows || [], cfg, dataMode);
        break;
      case 'member-account-head-wise':
        sheet.innerHTML = renderMemberAccountHeadWiseDoc(soc, data, data.memberLedgers || [], cfg, dataMode);
        break;
      case 'member-register-dr-cr':
        sheet.innerHTML = renderMemberRegisterDrCrDoc(soc, data, data.memberRegisters || [], cfg, dataMode);
        break;
      case 'member-control-account':
        sheet.innerHTML = renderMemberControlAccountDoc(soc, data, data.rows || [], cfg, dataMode);
        break;
      case 'balance-confirmation-letter':
        sheet.innerHTML = renderBalanceConfirmationLetterDoc(soc, data, data.letters || [], cfg, dataMode);
        break;
      case 'bank-deposit-list':
        sheet.innerHTML = renderBankDepositListDoc(soc, data, data.deposits || [], cfg, dataMode);
        break;
      case 'data-sheet':
        sheet.innerHTML = renderDataSheetDoc(soc, data.members || [], cfg, dataMode);
        break;
      case 'bill-register':
        sheet.innerHTML = renderBillRegisterDoc(soc, data, data.bills || [], cfg, dataMode);
        break;
      case 'receipt-register':
        sheet.innerHTML = renderReceiptRegisterDoc(soc, data, data.receipts || [], cfg, dataMode);
        break;
      case 'debit-note-register':
        sheet.innerHTML = renderDebitNoteRegisterDoc(soc, data, data.notes || data.items || [], cfg, dataMode);
        break;
      case 'credit-note-register':
        sheet.innerHTML = renderCreditNoteRegisterDoc(soc, data, data.notes || data.items || [], cfg, dataMode);
        break;
      case 'adjustment-register':
        sheet.innerHTML = renderAdjustmentRegisterDoc(soc, data, data.adjustments || data.items || [], cfg, dataMode);
        break;
      case 'member-jv-register':
        sheet.innerHTML = renderMemberJVRegisterDoc(soc, data, data.jvs || data.items || [], cfg, dataMode);
        break;
      default:
        sheet.innerHTML = `<div style="padding:40px; text-align:center;">Unknown report module: ${mod.key}</div>`;
    }
  }

  // ── HELPER: BUILD SOCIETY HEADER HTML ACCORDING TO DESIGN CONFIG ─────────
  function buildSocietyHeaderHtml(soc, cfg, defaultClass = 'bill-header') {
    if (!cfg.showHeader) return '';

    const socName = soc.SocietyName || soc.societyName || soc.name || 'CO-OPERATIVE HOUSING SOCIETY LTD.';
    const regNo = soc.RegistrationNo || soc.registrationNo || '';
    const pan = soc.PANNumber || soc.pan || '';
    const gstin = soc.GSTNumber || soc.gstin || '';
    const addr = soc.Address || soc.address || '';

    return `
      <header class="${defaultClass}" style="text-align:${cfg.headerAlign || 'left'}; border-bottom:${cfg.headerBorder === 'none' ? 'none' : '1.5px solid ' + (cfg.primaryColor || '#1e40af')}; padding-bottom:8px; margin-bottom:12px;">
        ${cfg.showLogo ? `<div style="text-align:${cfg.logoPosition || 'left'}; margin-bottom:4px;"><i class="bi bi-buildings-fill" style="font-size:24px; color:${cfg.primaryColor || '#1e40af'};"></i></div>` : ''}
        ${cfg.showSocietyName ? `<div style="font-size:14pt; font-weight:800; color:${cfg.primaryColor || '#1e40af'}; text-transform:uppercase; letter-spacing:0.5px;">${HenuOsReportEngine.escapeHtml(socName)}</div>` : ''}
        <div style="font-size:8.5pt; color:#64748b; margin-top:2px;">
          ${cfg.showRegNo && regNo ? `Reg No: <strong>${HenuOsReportEngine.escapeHtml(regNo)}</strong> | ` : ''}
          ${cfg.showPan && pan ? `PAN: <strong>${HenuOsReportEngine.escapeHtml(pan)}</strong> | ` : ''}
          ${cfg.showGstin && gstin ? `GSTIN: <strong>${HenuOsReportEngine.escapeHtml(gstin)}</strong>` : ''}
          ${cfg.showAddress && addr ? `<br>${HenuOsReportEngine.escapeHtml(addr)}` : ''}
        </div>
      </header>
    `;
  }

  // ── 1. BILL FORMAT RENDERER ──────────────────────────────────────────────
  function renderBillFormatDoc(soc, bills, cfg, mode) {
    const b = bills[0] || {};
    const mem = b.member || {};
    const items = b.items || [];
    const prefix = cfg.docPrefix || '';
    const netPayable = b.netPayable || b.totalAmount || 0;
    const isBlank = (mode === 'EMPTY' || bills.length === 0);

    let chargeRows = '';
    if (!isBlank && items.length > 0) {
      items.forEach((it, idx) => {
        chargeRows += `
          <tr style="${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td class="center" style="text-align:center; width:35px;">${idx + 1}</td>
            <td>${HenuOsReportEngine.escapeHtml(it.description || it.headName || 'Maintenance Charge')}</td>
            <td class="center" style="text-align:center; width:75px;">${HenuOsReportEngine.escapeHtml(it.sac || '999598')}</td>
            <td class="right" style="text-align:${cfg.amountAlign || 'right'}; width:90px;">${HenuOsReportEngine.formatINR(it.taxable || it.amount || 0)}</td>
            <td class="right" style="text-align:${cfg.amountAlign || 'right'}; width:70px;">${HenuOsReportEngine.formatINR(it.cgst || 0)}</td>
            <td class="right" style="text-align:${cfg.amountAlign || 'right'}; width:70px;">${HenuOsReportEngine.formatINR(it.sgst || 0)}</td>
            <td class="right" style="text-align:${cfg.amountAlign || 'right'}; width:95px; font-weight:700;">${HenuOsReportEngine.formatINR(it.amount || 0)}</td>
          </tr>
        `;
      });
    } else {
      chargeRows = `
        <tr>
          <td class="center" style="text-align:center;">${isBlank ? '—' : '1'}</td>
          <td>${isBlank ? '—' : 'Society Maintenance Charges'}</td>
          <td class="center" style="text-align:center;">${isBlank ? '—' : '999598'}</td>
          <td class="right" style="text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(b.principalAmount || 0)}</td>
          <td class="right" style="text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : '₹0.00'}</td>
          <td class="right" style="text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : '₹0.00'}</td>
          <td class="right" style="text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${isBlank ? '—' : HenuOsReportEngine.formatINR(b.totalAmount || 0)}</td>
        </tr>
      `;
    }

    const title = cfg.customTitle || 'TAX INVOICE / MAINTENANCE BILL';

    return `
      <div class="bill-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'bill-header')}

        ${cfg.showTitle ? `
          <div class="bill-title-bar" style="text-align:${cfg.titleAlign || 'center'}; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
            <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${HenuOsReportEngine.escapeHtml(title)}</div>
            ${cfg.showBillingPeriod ? `<div style="font-size:8pt; color:#64748b;">Billing Period: ${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (b.period || 'Current Period'))}</div>` : ''}
          </div>
        ` : ''}

        <div class="bill-meta-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; font-size:9pt;">
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 10px;">
            <div style="font-weight:700; color:${cfg.primaryColor || '#1e40af'}; margin-bottom:4px; font-size:8.5pt; text-transform:uppercase;">Bill To (Member Details)</div>
            ${cfg.showMemberName ? `<div><strong>Member:</strong> ${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.name || mem.memberName || ''))}</div>` : ''}
            ${cfg.showFlatNo ? `<div><strong>Flat / Unit:</strong> ${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.flatNo || mem.flat || ''))} ${(!isBlank && mem.wing) ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</div>` : ''}
            <div><strong>Member Code:</strong> ${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.memberCode || mem.code || ''))}</div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 10px; text-align:right;">
            <div style="font-weight:700; color:${cfg.primaryColor || '#1e40af'}; margin-bottom:4px; font-size:8.5pt; text-transform:uppercase;">Invoice Details</div>
            ${cfg.showDocNo ? `<div><strong>Bill No:</strong> <span style="color:${cfg.primaryColor || '#1e40af'}; font-weight:700;">${prefix}${HenuOsReportEngine.escapeHtml(isBlank ? '' : (b.billNo || ''))}</span></div>` : ''}
            ${cfg.showDate ? `<div><strong>Bill Date:</strong> ${isBlank ? '' : HenuOsReportEngine.formatDate(b.billDate)}</div>` : ''}
            ${cfg.showDueDate ? `<div><strong>Due Date:</strong> <span style="color:#b45309; font-weight:700;">${isBlank ? '' : HenuOsReportEngine.formatDate(b.dueDate)}</span></div>` : ''}
          </div>
        </div>

        ${cfg.showTable ? `
          <div class="bill-table-wrapper" style="margin-bottom:12px;">
            <table class="bill-table" style="width:100%; border-collapse:collapse; font-size:${cfg.tableFontSize || 11}pt; border:${cfg.borderStyle === 'minimal' ? '1px solid #e2e8f0' : '1px solid #cbd5e1'};">
              <thead>
                <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
                  <th style="padding:6px; text-align:center; width:35px;">Sr</th>
                  <th style="padding:6px; text-align:left;">Particulars / Description</th>
                  <th style="padding:6px; text-align:center; width:75px;">SAC</th>
                  <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:90px;">Taxable (₹)</th>
                  <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:70px;">CGST (₹)</th>
                  <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:70px;">SGST (₹)</th>
                  <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:95px;">Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${chargeRows}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div class="bill-summary-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div>
            ${cfg.showAmountInWords ? `
              <div style="font-size:8.5pt; margin-bottom:8px;">
                <strong>Amount in Words:</strong><br>
                <span style="font-style:italic; color:#334155;">${isBlank ? '—' : HenuOsReportEngine.numberToWordsINR(netPayable)}</span>
              </div>
            ` : ''}
            ${cfg.showBankDetails ? `
              <div style="font-size:8pt; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:6px 8px;">
                <div style="font-weight:700; color:${cfg.primaryColor || '#1e40af'};">Bank Details for Payment:</div>
                <div>Bank: <strong>${HenuOsReportEngine.escapeHtml(soc.BankName || 'State Bank of India')}</strong></div>
                <div>A/C No: <strong>${HenuOsReportEngine.escapeHtml(soc.BankAccountNo || '10293847561')}</strong> | IFSC: <strong>${HenuOsReportEngine.escapeHtml(soc.IFSCCode || 'SBIN0001234')}</strong></div>
              </div>
            ` : ''}
          </div>
          <div>
            ${cfg.showGrandTotal ? `
              <table style="width:100%; border-collapse:collapse; font-size:9pt;">
                <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:4px 0;">Current Charges:</td><td style="padding:4px 0; text-align:right; font-weight:700;">${isBlank ? '—' : HenuOsReportEngine.formatINR(b.currentBillTotal || b.principalAmount || 0)}</td></tr>
                <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:4px 0;">Previous Arrears:</td><td style="padding:4px 0; text-align:right; color:#b45309;">${isBlank ? '—' : HenuOsReportEngine.formatINR(b.prevArrears || 0)}</td></tr>
                <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
                  <td style="padding:6px 0; color:${cfg.primaryColor || '#1e40af'};">NET PAYABLE:</td>
                  <td style="padding:6px 0; text-align:right; color:${cfg.primaryColor || '#1e40af'}; font-size:11pt;">${isBlank ? '—' : HenuOsReportEngine.formatINR(netPayable)}</td>
                </tr>
              </table>
            ` : ''}
          </div>
        </div>

        ${(cfg.showQrCode || cfg.showSignature) ? `
          <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:16px; padding-top:10px; border-top:1px dashed #cbd5e1;">
            <div>
              ${cfg.showQrCode ? `
                <div style="display:flex; align-items:center; gap:8px;">
                  <div style="width:50px; height:50px; background:#f1f5f9; border:1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; border-radius:4px;">
                    <i class="bi bi-qr-code" style="font-size:30px; color:#1e293b;"></i>
                  </div>
                  <div style="font-size:7.5pt; color:#475569;">
                    <div><strong>UPI Dynamic Payment QR</strong></div>
                    <div>Scan & Pay via any UPI App</div>
                  </div>
                </div>
              ` : ''}
            </div>
            <div>
              ${cfg.showSignature ? `
                <div style="text-align:${cfg.signaturePosition || 'right'}; font-size:8pt;">
                  <div style="height:30px;"></div>
                  <div style="border-top:1px solid #334155; padding-top:2px; font-weight:700;">
                    ${cfg.showAuthSignatory ? 'Hon. Treasurer / Secretary' : 'Authorized Representative'}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        ${cfg.showFooter ? `
          <footer style="margin-top:16px; font-size:7.5pt; color:#64748b; display:flex; justify-content:space-between; border-top:${cfg.footerBorder ? '1px solid #e2e8f0' : 'none'}; padding-top:6px;">
            <div>${cfg.showGeneratedDate ? 'Generated: ' + new Date().toLocaleString('en-IN') : ''}</div>
            <div>${cfg.showPageNumber ? 'Page 1 of 1' : ''}</div>
          </footer>
        ` : ''}
      </div>
    `;
  }

  // ── 2. RECEIPT RENDERER ──────────────────────────────────────────────────
  function renderReceiptDoc(soc, receipts, cfg, mode) {
    const r = receipts[0] || {};
    const mem = r.member || {};
    const prefix = cfg.docPrefix || '';
    const amount = r.amount || 0;
    const isBlank = (mode === 'EMPTY' || receipts.length === 0);

    const particulars = r.particulars || [
      { head: 'Society Maintenance & Service Charges Dues', amount: amount }
    ];

    let rowsHtml = '';
    particulars.forEach(p => {
      rowsHtml += `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:5px 8px;">${isBlank ? '—' : HenuOsReportEngine.escapeHtml(p.head || 'Payment Allocation')}</td>
          <td class="right" style="padding:5px 8px; text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${isBlank ? '—' : HenuOsReportEngine.formatINR(p.amount || 0)}</td>
        </tr>
      `;
    });

    return `
      <div class="receipt-card" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        ${buildSocietyHeaderHtml(soc, cfg, 'receipt-header')}

        <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:6px 10px; margin-bottom:12px; border-radius:4px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <span style="font-weight:800; font-size:10pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'RECEIPT VOUCHER'}</span>
          <div style="font-size:8.5pt; text-align:right;">
            ${cfg.showDocNo ? `<span>No: <strong>${prefix}${HenuOsReportEngine.escapeHtml(isBlank ? '' : (r.receiptNo || r.voucherNo || ''))}</strong></span> | ` : ''}
            ${cfg.showDate ? `<span>Date: <strong>${isBlank ? '' : HenuOsReportEngine.formatDate(r.date || r.receiptDate || r.voucherDate)}</strong></span>` : ''}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; font-size:9pt; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 10px;">
          <div>
            ${cfg.showMemberName ? `<div>Received With Thanks From: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.name || mem.memberName || ''))}</strong></div>` : ''}
            ${cfg.showFlatNo ? `<div>Flat / Unit No: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.flatNo || mem.flat || ''))}</strong> ${(!isBlank && mem.wing) ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div>Billing Period: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (r.period || '-'))}</strong></div>
            <div>Member Code: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.memberCode || mem.code || '-'))}</strong></div>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:10px; font-size:9pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:6px 8px; text-align:left;">Particulars</th>
              <th style="padding:6px 8px; text-align:${cfg.amountAlign || 'right'}; width:120px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:8px 12px; border-radius:4px; margin-bottom:10px;">
          <div>
            ${cfg.showAmountInWords ? `
              <span style="font-size:7.5pt; color:#64748b; font-weight:700; text-transform:uppercase;">Amount in Words:</span><br>
              <span style="font-size:8.5pt; font-style:italic; font-weight:600;">${isBlank ? '—' : HenuOsReportEngine.numberToWordsINR(amount)}</span>
            ` : ''}
          </div>
          <div style="font-size:12pt; font-weight:800; color:${cfg.primaryColor || '#1e40af'};">
            ${isBlank ? '—' : HenuOsReportEngine.formatINR(amount)}
          </div>
        </div>

        <div style="font-size:8pt; color:#475569; margin-bottom:12px; display:flex; justify-content:space-between;">
          <div>Payment Mode: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (r.paymentMode || r.mode || 'NEFT'))}</strong> ${(!isBlank && r.chequeNo) ? '| Ref: <strong>' + HenuOsReportEngine.escapeHtml(r.chequeNo) + '</strong>' : ''}</div>
          <div>Subject to realization</div>
        </div>

        ${cfg.showSignature ? `
          <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #cbd5e1; padding-top:8px; font-size:8pt;">
            <div style="color:#64748b;">Collected By: ${HenuOsReportEngine.escapeHtml(isBlank ? '' : (r.collectedBy || 'HENU ERP'))}</div>
            <div style="text-align:right;">
              <div style="color:#64748b; margin-bottom:16px;">For ${HenuOsReportEngine.escapeHtml(soc.SocietyName || 'Society')}</div>
              <div style="border-top:1px solid #334155; padding-top:2px; font-weight:700;">Authorized Signatory</div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ── 3. DEBIT NOTE RENDERER ───────────────────────────────────────────────
  function renderDebitNoteDoc(soc, notes, cfg, mode) {
    const item = notes[0] || {};
    const note = item.note || item;
    const mem = item.member || {};
    const entries = item.items || item.particulars || [{ srNo: 1, particulars: note.reason || 'Debit Note Particulars', amount: note.totalAmount || note.amount || 0 }];
    const totalAmount = note.totalAmount || note.amount || 0;
    const prefix = cfg.docPrefix || '';
    const isBlank = (mode === 'EMPTY' || notes.length === 0);

    let rowsHtml = '';
    entries.forEach((e, idx) => {
      rowsHtml += `
        <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
          <td style="padding:6px; text-align:center; width:40px;">${idx + 1}</td>
          <td style="padding:6px;">
            <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (e.particulars || e.accountHead || 'Debit Adjustment'))}</strong>
            ${(!isBlank && e.narration) ? `<div style="font-size:8pt; color:#64748b;">${HenuOsReportEngine.escapeHtml(e.narration)}</div>` : ''}
          </td>
          <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:120px; font-weight:700;">${isBlank ? '—' : HenuOsReportEngine.formatINR(e.amount || 0)}</td>
        </tr>
      `;
    });

    return `
      <div class="debit-note-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'debit-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'DEBIT NOTE'}</div>
          <div>Date: <strong>${isBlank ? '' : HenuOsReportEngine.formatDate(note.noteDate || note.date)}</strong></div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; font-size:9pt;">
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 10px;">
            <div style="font-weight:700; color:${cfg.primaryColor || '#1e40af'}; margin-bottom:4px; text-transform:uppercase;">Member / Resident Details</div>
            ${cfg.showMemberName ? `<div><strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.name || mem.memberName || ''))}</strong></div>` : ''}
            ${cfg.showFlatNo ? `<div>Flat: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.flatNo || mem.flat || ''))}</strong> ${(!isBlank && mem.wing) ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</div>` : ''}
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 10px; text-align:right;">
            <div style="font-weight:700; color:${cfg.primaryColor || '#1e40af'}; margin-bottom:4px; text-transform:uppercase;">Document Details</div>
            ${cfg.showDocNo ? `<div>Note No: <strong style="color:${cfg.primaryColor || '#1e40af'};">${prefix}${HenuOsReportEngine.escapeHtml(isBlank ? '' : (note.noteNo || note.voucherNo || ''))}</strong></div>` : ''}
            ${(!isBlank && note.refBillNo) ? `<div>Against Bill: <strong>${HenuOsReportEngine.escapeHtml(note.refBillNo)}</strong></div>` : ''}
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:9pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:6px; text-align:center;">Sr</th>
              <th style="padding:6px; text-align:left;">Account Head / Reason for Debit</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'};">Debit Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:8px 12px; border-radius:4px; margin-bottom:14px;">
          <div>
            ${cfg.showAmountInWords ? `
              <span style="font-size:7.5pt; color:#64748b; font-weight:700; text-transform:uppercase;">Amount in Words:</span><br>
              <span style="font-size:8.5pt; font-style:italic; font-weight:600;">${isBlank ? '—' : HenuOsReportEngine.numberToWordsINR(totalAmount)}</span>
            ` : ''}
          </div>
          <div style="text-align:right;">
            <div style="font-size:7.5pt; font-weight:700; color:#64748b; text-transform:uppercase;">Total Debit Amount</div>
            <div style="font-size:12pt; font-weight:800; color:${cfg.primaryColor || '#1e40af'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totalAmount)}</div>
          </div>
        </div>

        ${cfg.showSignature ? `
          <footer style="margin-top:20px; display:flex; justify-content:space-between; text-align:center; font-size:8pt;">
            <div style="width:30%;"><div style="height:25px;"></div><div style="border-top:1px solid #334155; padding-top:2px;">Prepared By</div></div>
            <div style="width:30%;"><div style="height:25px;"></div><div style="border-top:1px solid #334155; padding-top:2px;">Checked By</div></div>
            <div style="width:30%;"><div style="height:25px;"></div><div style="border-top:1px solid #334155; padding-top:2px; font-weight:700;">Hon. Treasurer / Secretary</div></div>
          </footer>
        ` : ''}
      </div>
    `;
  }

  // ── 4. CREDIT NOTE RENDERER ──────────────────────────────────────────────
  function renderCreditNoteDoc(soc, notes, cfg, mode) {
    const item = notes[0] || {};
    const note = item.note || item;
    const mem = item.member || {};
    const entries = item.items || item.particulars || [{ srNo: 1, particulars: note.reason || 'Credit Note Particulars', amount: note.totalAmount || note.amount || 0 }];
    const totalAmount = note.totalAmount || note.amount || 0;
    const prefix = cfg.docPrefix || '';
    const isBlank = (mode === 'EMPTY' || notes.length === 0);

    let rowsHtml = '';
    entries.forEach((e, idx) => {
      rowsHtml += `
        <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
          <td style="padding:6px; text-align:center; width:40px;">${idx + 1}</td>
          <td style="padding:6px;">
            <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (e.particulars || e.accountHead || 'Credit Adjustment / Waiver'))}</strong>
            ${(!isBlank && e.narration) ? `<div style="font-size:8pt; color:#64748b;">${HenuOsReportEngine.escapeHtml(e.narration)}</div>` : ''}
          </td>
          <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:120px; font-weight:700; color:#15803d;">${isBlank ? '—' : HenuOsReportEngine.formatINR(e.amount || 0)}</td>
        </tr>
      `;
    });

    return `
      <div class="credit-note-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'credit-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'CREDIT NOTE'}</div>
          <div>Date: <strong>${isBlank ? '' : HenuOsReportEngine.formatDate(note.noteDate || note.date)}</strong></div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; font-size:9pt;">
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 10px;">
            <div style="font-weight:700; color:${cfg.primaryColor || '#1e40af'}; margin-bottom:4px; text-transform:uppercase;">Beneficiary Resident Details</div>
            ${cfg.showMemberName ? `<div><strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.name || mem.memberName || ''))}</strong></div>` : ''}
            ${cfg.showFlatNo ? `<div>Flat: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.flatNo || mem.flat || ''))}</strong> ${(!isBlank && mem.wing) ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</div>` : ''}
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 10px; text-align:right;">
            <div style="font-weight:700; color:${cfg.primaryColor || '#1e40af'}; margin-bottom:4px; text-transform:uppercase;">Document Details</div>
            ${cfg.showDocNo ? `<div>Credit Note No: <strong style="color:${cfg.primaryColor || '#1e40af'};">${prefix}${HenuOsReportEngine.escapeHtml(isBlank ? '' : (note.noteNo || note.voucherNo || ''))}</strong></div>` : ''}
            ${(!isBlank && note.refBillNo) ? `<div>Against Bill: <strong>${HenuOsReportEngine.escapeHtml(note.refBillNo)}</strong></div>` : ''}
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:9pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:6px; text-align:center;">Sr</th>
              <th style="padding:6px; text-align:left;">Account Head / Reason for Credit</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'};">Credit Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:8px 12px; border-radius:4px; margin-bottom:14px;">
          <div>
            ${cfg.showAmountInWords ? `
              <span style="font-size:7.5pt; color:#64748b; font-weight:700; text-transform:uppercase;">Amount in Words:</span><br>
              <span style="font-size:8.5pt; font-style:italic; font-weight:600;">${isBlank ? '—' : HenuOsReportEngine.numberToWordsINR(totalAmount)}</span>
            ` : ''}
          </div>
          <div style="text-align:right;">
            <div style="font-size:7.5pt; font-weight:700; color:#64748b; text-transform:uppercase;">Total Credit Amount</div>
            <div style="font-size:12pt; font-weight:800; color:#15803d;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totalAmount)}</div>
          </div>
        </div>

        ${cfg.showSignature ? `
          <footer style="margin-top:20px; display:flex; justify-content:space-between; text-align:center; font-size:8pt;">
            <div style="width:30%;"><div style="height:25px;"></div><div style="border-top:1px solid #334155; padding-top:2px;">Prepared By</div></div>
            <div style="width:30%;"><div style="height:25px;"></div><div style="border-top:1px solid #334155; padding-top:2px;">Checked By</div></div>
            <div style="width:30%;"><div style="height:25px;"></div><div style="border-top:1px solid #334155; padding-top:2px; font-weight:700;">Hon. Treasurer / Secretary</div></div>
          </footer>
        ` : ''}
      </div>
    `;
  }

  // ── 5. ADJUSTMENT VOUCHER RENDERER ───────────────────────────────────────
  function renderAdjustmentDoc(soc, vouchers, cfg, mode) {
    const v = vouchers[0] || {};
    const mem = v.member || {};
    const amount = v.amount || v.totalAmount || 0;
    const entries = v.entries || v.items || [
      { accountHead: v.sourceHead || 'Advance Maintenance', debit: amount, credit: 0 },
      { accountHead: v.destHead || 'Maintenance Bill Dues', debit: 0, credit: amount }
    ];
    const prefix = cfg.docPrefix || '';
    const isBlank = (mode === 'EMPTY' || vouchers.length === 0);

    let rowsHtml = '';
    entries.forEach(e => {
      rowsHtml += `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px 8px;"><strong>${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (e.accountHead || e.ledgerHead || 'Transfer Account'))}</strong></td>
          <td class="right" style="padding:6px 8px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : (e.debit > 0 ? HenuOsReportEngine.formatINR(e.debit) : '-')}</td>
          <td class="right" style="padding:6px 8px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : (e.credit > 0 ? HenuOsReportEngine.formatINR(e.credit) : '-')}</td>
        </tr>
      `;
    });

    return `
      <div class="adj-voucher-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'adj-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'ADJUSTMENT / TRANSFER VOUCHER'}</div>
          <div>Date: <strong>${isBlank ? '' : HenuOsReportEngine.formatDate(v.date || v.voucherDate)}</strong></div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; font-size:9pt;">
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 10px;">
            <div style="font-weight:700; color:${cfg.primaryColor || '#1e40af'}; margin-bottom:4px; text-transform:uppercase;">Resident & Unit Information</div>
            ${cfg.showMemberName ? `<div><strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.name || mem.memberName || ''))}</strong></div>` : ''}
            ${cfg.showFlatNo ? `<div>Flat: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.flatNo || mem.flat || ''))}</strong> ${(!isBlank && mem.wing) ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</div>` : ''}
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 10px; text-align:right;">
            <div style="font-weight:700; color:${cfg.primaryColor || '#1e40af'}; margin-bottom:4px; text-transform:uppercase;">Voucher Details</div>
            ${cfg.showDocNo ? `<div>Voucher No: <strong style="color:${cfg.primaryColor || '#1e40af'};">${prefix}${HenuOsReportEngine.escapeHtml(isBlank ? '' : (v.voucherNo || v.adjustmentNo || ''))}</strong></div>` : ''}
            <div>Type: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (v.adjType || 'Internal Transfer'))}</strong></div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-around; align-items:center; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:8px 12px; margin-bottom:12px; font-size:9pt;">
          <div><span style="font-size:7.5pt; color:#64748b; font-weight:700; text-transform:uppercase;">Source (From):</span><br><strong style="color:#b91c1c;">${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (v.sourceHead || 'Advance Ledger'))}</strong></div>
          <div style="font-size:14pt; color:${cfg.primaryColor || '#1e40af'}; font-weight:800;">➔</div>
          <div><span style="font-size:7.5pt; color:#64748b; font-weight:700; text-transform:uppercase;">Destination (To):</span><br><strong style="color:#15803d;">${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (v.destHead || 'Dues Ledger'))}</strong></div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:9pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:6px 8px; text-align:left;">Ledger Account Head</th>
              <th style="padding:6px 8px; text-align:${cfg.amountAlign || 'right'}; width:120px;">Debit (₹)</th>
              <th style="padding:6px 8px; text-align:${cfg.amountAlign || 'right'}; width:120px;">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td style="padding:6px 8px; text-align:right;">TOTAL:</td>
              <td class="right" style="padding:6px 8px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(amount)}</td>
              <td class="right" style="padding:6px 8px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(amount)}</td>
            </tr>
          </tbody>
        </table>

        ${(!isBlank && v.narration) ? `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:6px 10px; margin-bottom:12px; font-size:8pt;">
            <strong>Narration:</strong> ${HenuOsReportEngine.escapeHtml(v.narration)}
          </div>
        ` : ''}
      </div>
    `;
  }

  // ── 6. OUTSTANDING LIST RENDERER ─────────────────────────────────────────
  function renderOutstandingListDoc(soc, data, rows, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || rows.length === 0);
    let totPrin = 0, totInt = 0, totDr = 0, totCr = 0;

    let trRows = '';
    if (!isBlank) {
      rows.forEach((r, idx) => {
        totPrin += (r.principal || 0);
        totInt += (r.interest || 0);
        totDr += (r.closingDebit || 0);
        totCr += (r.closingCredit || 0);

        trRows += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:5px; text-align:center;">${idx + 1}</td>
            <td style="padding:5px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(r.flatNo || '')}</td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.escapeHtml(r.wing || '')}</td>
            <td style="padding:5px; font-weight:700; color:${cfg.primaryColor || '#1e40af'};">${HenuOsReportEngine.escapeHtml(r.memName || r.memberName || '')}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${r.principal > 0 ? HenuOsReportEngine.formatINR(r.principal) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${r.interest > 0 ? HenuOsReportEngine.formatINR(r.interest) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700; color:#b91c1c;">${r.closingDebit > 0 ? HenuOsReportEngine.formatINR(r.closingDebit) : '0.00'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700; color:#15803d;">${r.closingCredit > 0 ? HenuOsReportEngine.formatINR(r.closingCredit) : '0.00'}</td>
          </tr>
        `;
      });
    } else {
      trRows = `
        <tr>
          <td colspan="8" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="format-sheet" style="border:none; box-shadow:none; padding:0; width:100%; max-width:100%;">
        ${buildSocietyHeaderHtml(soc, cfg, 'br-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'MEMBER OUTSTANDING DUES STATEMENT'}</div>
          <div>Period: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (data.period || 'Current Period'))}</strong></div>
        </div>

        <table class="ledger-grid" style="width:100%; border-collapse:collapse; font-size:9pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:6px; text-align:center; width:30px;">#</th>
              <th style="padding:6px; text-align:center; width:50px;">Flat</th>
              <th style="padding:6px; text-align:center; width:50px;">Wing</th>
              <th style="padding:6px; text-align:left;">Member Name</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:90px;">Principal (₹)</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:80px;">Interest (₹)</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:105px;">Net Dues Dr (₹)</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:105px;">Advance Cr (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${trRows}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="4" style="padding:6px; text-align:right;">TOTALS:</td>
              <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totPrin)}</td>
              <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totInt)}</td>
              <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'}; color:#b91c1c;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totDr)}</td>
              <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'}; color:#15803d;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totCr)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 7. MEMBER ACCOUNT HEAD-WISE RENDERER ─────────────────────────────────
  function renderMemberAccountHeadWiseDoc(soc, data, ledgers, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || ledgers.length === 0);
    const m = ledgers[0] || {};
    const info = m.memberInfo || {};
    const cols = data.dynamicColumns || [{ headName: 'Maintenance' }, { headName: 'Sinking Fund' }, { headName: 'Parking' }];
    const txs = m.transactions || [];

    let txRows = '';
    if (!isBlank && txs.length > 0) {
      txs.forEach((t, idx) => {
        const headVals = cols.map(c => `<td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${HenuOsReportEngine.formatINR(t.headWiseAmounts?.[c.key] || 0)}</td>`).join('');
        txRows += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.formatDate(t.date)}</td>
            <td style="padding:5px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(t.voucherTypeNo || '-')}</td>
            <td style="padding:5px;">${HenuOsReportEngine.escapeHtml(t.particulars || '-')}</td>
            ${headVals}
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${t.totalDebit > 0 ? HenuOsReportEngine.formatINR(t.totalDebit) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700; color:#15803d;">${t.totalCredit > 0 ? HenuOsReportEngine.formatINR(t.totalCredit) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:800; color:${cfg.primaryColor || '#1e40af'};">${HenuOsReportEngine.formatINR(t.runningBalance || 0)}</td>
          </tr>
        `;
      });
    } else {
      txRows = `
        <tr>
          <td colspan="${6 + cols.length}" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Ledger Data ]</td>
        </tr>
      `;
    }

    const colHeaders = cols.map(c => `<th style="padding:6px; text-align:${cfg.amountAlign || 'right'};">${HenuOsReportEngine.escapeHtml((c.headName || 'HEAD').toUpperCase())} (₹)</th>`).join('');

    return `
      <div class="member-card-ui" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:12px; box-shadow:none;">
        ${buildSocietyHeaderHtml(soc, cfg, 'module-header')}

        <div style="padding:8px 10px; font-size:11pt; font-weight:800; color:${cfg.primaryColor || '#1e40af'}; background:#f1f5f9; border-left:4px solid ${cfg.primaryColor || '#1e40af'}; margin-bottom:12px;">
          ${HenuOsReportEngine.escapeHtml(isBlank ? 'MEMBER ACCOUNT LEDGER (HEAD-WISE)' : (info.memberName || 'MEMBER') + ' (' + (info.flatNo || '') + ') — ' + (data.billTypeName || 'MAINTENANCE') + ' LEDGER')}
        </div>

        <table class="headwise-table-ui" style="width:100%; border-collapse:collapse; font-size:8.5pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:6px; text-align:center; width:65px;">DATE</th>
              <th style="padding:6px; text-align:center; width:90px;">TYPE-NO</th>
              <th style="padding:6px; text-align:left;">PERIOD / PARTICULARS</th>
              ${colHeaders}
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:85px;">TOTAL DR</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:85px;">TOTAL CR</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:95px;">BALANCE</th>
            </tr>
          </thead>
          <tbody>
            ${txRows}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 8. MEMBER REGISTER [DR/CR] RENDERER ───────────────────────────────────
  function renderMemberRegisterDrCrDoc(soc, data, ledgers, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || ledgers.length === 0);
    const m = ledgers[0] || {};
    const info = m.memberInfo || {};
    const txs = m.transactions || [];

    let txRows = '';
    if (!isBlank && txs.length > 0) {
      txs.forEach((t, idx) => {
        txRows += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.formatDate(t.date)}</td>
            <td style="padding:5px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(t.voucherTypeNo || '-')}</td>
            <td style="padding:5px;">${HenuOsReportEngine.escapeHtml(t.particulars || '-')}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${t.principal > 0 ? HenuOsReportEngine.formatINR(t.principal) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${t.interest > 0 ? HenuOsReportEngine.formatINR(t.interest) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${t.totalDebit > 0 ? HenuOsReportEngine.formatINR(t.totalDebit) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700; color:#15803d;">${t.totalCredit > 0 ? HenuOsReportEngine.formatINR(t.totalCredit) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:800; color:${cfg.primaryColor || '#1e40af'};">${HenuOsReportEngine.formatINR(t.balance || 0)}</td>
          </tr>
        `;
      });
    } else {
      txRows = `
        <tr>
          <td colspan="8" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="member-card-ui" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:12px; box-shadow:none;">
        ${buildSocietyHeaderHtml(soc, cfg, 'module-header')}

        <div style="padding:8px 10px; font-size:11pt; font-weight:800; color:${cfg.primaryColor || '#1e40af'}; background:#f1f5f9; border-left:4px solid ${cfg.primaryColor || '#1e40af'}; margin-bottom:12px;">
          ${HenuOsReportEngine.escapeHtml(isBlank ? 'MEMBER REGISTER [DR/CR]' : (info.memberName || 'MEMBER') + ' (' + (info.flatNo || '') + ') — REGISTER')}
        </div>

        <table class="mreg-table-ui" style="width:100%; border-collapse:collapse; font-size:8.5pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:6px; text-align:center; width:65px;">DATE</th>
              <th style="padding:6px; text-align:center; width:90px;">TYPE-NO</th>
              <th style="padding:6px; text-align:left;">PERIOD / PARTICULARS</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:80px;">PRINCIPAL</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:75px;">INTEREST</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:85px;">DEBIT</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:85px;">CREDIT</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:95px;">BALANCE</th>
            </tr>
          </thead>
          <tbody>
            ${txRows}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 9. MEMBER CONTROL ACCOUNT RENDERER ───────────────────────────────────
  function renderMemberControlAccountDoc(soc, data, rows, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || rows.length === 0);
    const opening = data.openingDebtors || data.summary?.openingDebtors || 0;
    const closing = data.closingReceivable || data.summary?.closingReceivable || 0;
    const totRaised = data.totalDebits || data.summary?.totalMaintenanceRaised || 0;
    const totCol = data.totalCredits || data.summary?.totalCollections || 0;
    const totAdj = data.summary?.totalAdjustments || 0;

    let trRows = '';
    if (!isBlank) {
      rows.forEach((r, idx) => {
        trRows += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:5px; text-align:center;">${idx + 1}</td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.formatDate(r.postingDate || r.date)}</td>
            <td style="padding:5px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(r.voucher || r.voucherNo || '-')}</td>
            <td style="padding:5px;">${HenuOsReportEngine.escapeHtml(r.transaction || r.particulars || '-')}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${r.debit > 0 ? HenuOsReportEngine.formatINR(r.debit) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700; color:#15803d;">${r.credit > 0 ? HenuOsReportEngine.formatINR(r.credit) : '-'}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:800; color:${cfg.primaryColor || '#1e40af'};">${HenuOsReportEngine.formatINR(r.runningBalance || 0)}</td>
          </tr>
        `;
      });
    } else {
      trRows = `
        <tr>
          <td colspan="7" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="ctrl-report-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'ctrl-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'MEMBER CONTROL ACCOUNT LEDGER'}</div>
          <div>Period: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (data.fyLabel || 'FY 2026-27'))}</strong></div>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 12px; margin-bottom:12px; display:flex; justify-content:space-between; font-size:9pt;">
          <div><strong>Sundry Debtors (Control Account)</strong></div>
          <div>Opening Debtors Balance: <strong style="color:${cfg.primaryColor || '#1e40af'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(opening)} Dr</strong></div>
        </div>

        <table class="ctrl-table" style="width:100%; border-collapse:collapse; font-size:9pt; margin-bottom:12px; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:6px; text-align:center; width:35px;">Sr</th>
              <th style="padding:6px; text-align:center; width:75px;">Date</th>
              <th style="padding:6px; text-align:center; width:90px;">Voucher</th>
              <th style="padding:6px; text-align:left;">Particulars</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:110px;">Debit (Demand)</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:110px;">Credit (Collection)</th>
              <th style="padding:6px; text-align:${cfg.amountAlign || 'right'}; width:120px;">Running Balance</th>
            </tr>
          </thead>
          <tbody>
            ${trRows}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="4" style="padding:6px; text-align:right;">TOTALS:</td>
              <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totRaised)}</td>
              <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'}; color:#15803d;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totCol)}</td>
              <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'}; color:${cfg.primaryColor || '#1e40af'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(closing)}</td>
            </tr>
          </tbody>
        </table>

        <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:6px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:8px; font-size:8pt; text-align:center;">
          <div><div style="color:#64748b;">Opening Debtors</div><div style="font-weight:700;">${isBlank ? '—' : HenuOsReportEngine.formatINR(opening)}</div></div>
          <div><div style="color:#64748b;">Demand Raised (+)</div><div style="font-weight:700;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totRaised)}</div></div>
          <div><div style="color:#64748b;">Collections (-)</div><div style="font-weight:700; color:#15803d;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totCol)}</div></div>
          <div><div style="color:#64748b;">Adjustments</div><div style="font-weight:700;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totAdj)}</div></div>
          <div><div style="color:#64748b;">Net Movement</div><div style="font-weight:700;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totRaised - totCol)}</div></div>
          <div><div style="color:#64748b;">Closing Receivable</div><div style="font-weight:800; color:${cfg.primaryColor || '#1e40af'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(closing)}</div></div>
        </div>
      </div>
    `;
  }

  // ── 10. BALANCE CONFIRMATION LETTER RENDERER ─────────────────────────────
  function renderBalanceConfirmationLetterDoc(soc, data, letters, cfg, mode) {
    const item = letters[0] || {};
    const mem = item.member || item;
    const closing = item.closingBalance || item.closingDue || 0;
    const opening = item.openingBalance || 0;
    const billed = item.billedAmount || item.demands || 0;
    const collected = item.collectedAmount || item.payments || 0;
    const adjustments = item.adjustedAmount || 0;
    const isBlank = (mode === 'EMPTY' || letters.length === 0);
    const asOnStr = isBlank ? '—' : (data.asOnDate ? HenuOsReportEngine.formatDate(data.asOnDate) : HenuOsReportEngine.formatDate(new Date()));

    return `
      <div class="bac-letter-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'bac-header')}

        <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:8.5pt;">
          <div>Ref No: <strong>BCL/${HenuOsReportEngine.escapeHtml(isBlank ? 'FY' : (data.fyLabel || '2026-27'))}/${HenuOsReportEngine.escapeHtml(isBlank ? 'UNIT' : (mem.flat || '101'))}</strong></div>
          <div>Date: <strong>${asOnStr}</strong></div>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:8px 12px; margin-bottom:12px; font-size:9pt;">
          <div style="font-weight:700;">To,</div>
          <div style="font-weight:800; color:${cfg.primaryColor || '#1e40af'};">${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.name || mem.memberName || ''))}</div>
          <div>Flat: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '' : (mem.flat || mem.flatNo || ''))}</strong> ${(!isBlank && mem.wing) ? '(' + HenuOsReportEngine.escapeHtml(mem.wing) + ')' : ''}</div>
        </div>

        <div style="font-weight:800; font-size:9.5pt; color:${cfg.primaryColor || '#1e40af'}; margin-bottom:8px;">
          Subject: ${cfg.customTitle || 'Confirmation of Ledger Account Balance as on ' + asOnStr}
        </div>

        <div style="font-size:9pt; line-height:1.5; margin-bottom:12px;">
          Dear Member,<br>
          In connection with the statutory audit and finalization of accounts, please find below the statement of your maintenance and service charges account:
        </div>

        <table class="bac-summary-table" style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:9pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:6px 8px; text-align:left;">Particulars</th>
              <th style="padding:6px 8px; text-align:${cfg.amountAlign || 'right'}; width:140px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;">Opening Balance at start of period:</td><td style="padding:6px 8px; text-align:right;">${isBlank ? '—' : HenuOsReportEngine.formatINR(opening)}</td></tr>
            <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;">Add: Maintenance Demands Billed:</td><td style="padding:6px 8px; text-align:right;">${isBlank ? '—' : HenuOsReportEngine.formatINR(billed)}</td></tr>
            <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;">Less: Collections / Receipts Received:</td><td style="padding:6px 8px; text-align:right; color:#15803d;">${isBlank ? '—' : HenuOsReportEngine.formatINR(collected)}</td></tr>
            ${adjustments !== 0 ? `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 8px;">Adjustments / Waivers:</td><td style="padding:6px 8px; text-align:right;">${HenuOsReportEngine.formatINR(adjustments)}</td></tr>` : ''}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td style="padding:6px 8px; color:${cfg.primaryColor || '#1e40af'};">CLOSING DUES RECEIVABLE AS ON ${asOnStr.toUpperCase()}:</td>
              <td style="padding:6px 8px; text-align:right; color:${cfg.primaryColor || '#1e40af'}; font-size:10pt;">${isBlank ? '—' : HenuOsReportEngine.formatINR(closing)}</td>
            </tr>
          </tbody>
        </table>

        ${cfg.showAmountInWords ? `
          <div style="font-size:8.5pt; margin-bottom:14px;">
            Amount in Words: <strong style="font-style:italic;">${isBlank ? '—' : HenuOsReportEngine.numberToWordsINR(Math.abs(closing))}</strong>.
          </div>
        ` : ''}

        ${cfg.showSignature ? `
          <div style="display:flex; justify-content:space-between; text-align:center; font-size:8pt; margin-top:24px;">
            <div style="width:30%;"><div style="height:30px;"></div><div style="border-top:1px solid #334155; padding-top:2px;">Prepared By (Accountant)</div></div>
            <div style="width:30%;"><div style="height:30px;"></div><div style="border-top:1px solid #334155; padding-top:2px;">Verified By (Auditor)</div></div>
            <div style="width:30%;"><div style="height:30px;"></div><div style="border-top:1px solid #334155; padding-top:2px; font-weight:700;">Hon. Secretary / Treasurer</div></div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ── 11. BANK DEPOSIT LIST RENDERER ───────────────────────────────────────
  function renderBankDepositListDoc(soc, data, deposits, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || deposits.length === 0);
    let grandTot = 0;

    let trRows = '';
    if (!isBlank) {
      deposits.forEach((d, idx) => {
        grandTot += (d.amount || 0);
        trRows += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:5px; text-align:center;">${idx + 1}</td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.formatDate(d.depositDate || d.date)}</td>
            <td style="padding:5px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(d.receiptNo || '-')}</td>
            <td style="padding:5px;"><strong>${HenuOsReportEngine.escapeHtml(d.member || d.memberName || '-')}</strong></td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.escapeHtml(d.flat || d.flatNo || '-')}</td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.escapeHtml(d.paymentMode || 'Cheque')}</td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.escapeHtml(d.chequeNo || d.instrumentNo || '-')}</td>
            <td style="padding:5px;">${HenuOsReportEngine.escapeHtml(d.bankName || '-')}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${HenuOsReportEngine.formatINR(d.amount || 0)}</td>
            <td style="padding:5px; text-align:center;"><span style="color:#15803d; font-weight:700; font-size:7.5pt;">${HenuOsReportEngine.escapeHtml(d.clearanceStatus || 'Received')}</span></td>
          </tr>
        `;
      });
    } else {
      trRows = `
        <tr>
          <td colspan="10" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="bd-report-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'bd-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'BANK DEPOSIT / PAY-IN LIST'}</div>
          <div>Period: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (data.fyLabel || 'Current FY'))}</strong></div>
        </div>

        <table class="bd-table" style="width:100%; border-collapse:collapse; font-size:8.5pt; margin-bottom:12px; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:5px; text-align:center; width:30px;">#</th>
              <th style="padding:5px; text-align:center; width:70px;">Date</th>
              <th style="padding:5px; text-align:center; width:80px;">Receipt No</th>
              <th style="padding:5px; text-align:left;">Member Name</th>
              <th style="padding:5px; text-align:center; width:45px;">Flat</th>
              <th style="padding:5px; text-align:center; width:60px;">Mode</th>
              <th style="padding:5px; text-align:center; width:85px;">Ref / Chq No</th>
              <th style="padding:5px; text-align:left;">Drawn On Bank</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:90px;">Amount (₹)</th>
              <th style="padding:5px; text-align:center; width:65px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${trRows}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="8" style="padding:6px; text-align:right;">GRAND TOTAL DEPOSITS:</td>
              <td class="right" style="padding:6px; text-align:${cfg.amountAlign || 'right'}; color:${cfg.primaryColor || '#1e40af'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(grandTot)}</td>
              <td style="text-align:center;">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 12. DATA SHEET RENDERER ──────────────────────────────────────────────
  function renderDataSheetDoc(soc, members, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || members.length === 0);
    let totalArea = 0, totalOpening = 0;

    let trRows = '';
    if (!isBlank) {
      members.forEach((m, idx) => {
        totalArea += (m.areaSqft || 0);
        totalOpening += (m.totalOpening || 0);
        trRows += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:4px; text-align:center;">${idx + 1}</td>
            <td style="padding:4px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(m.memberCode || '-')}</td>
            <td style="padding:4px;"><strong>${HenuOsReportEngine.escapeHtml(m.memberName || '-')}</strong></td>
            <td style="padding:4px;">${HenuOsReportEngine.escapeHtml(m.coOwner || '-')}</td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.escapeHtml(m.wing || '-')}</td>
            <td style="padding:4px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(m.flat || m.flatNo || '-')}</td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.escapeHtml(m.flatType || '-')}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'};">${m.areaSqft || '-'}</td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.escapeHtml(m.mobile || '-')}</td>
            <td style="padding:4px;">${HenuOsReportEngine.escapeHtml(m.email || '-')}</td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.escapeHtml(m.pan || '-')}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${HenuOsReportEngine.formatINR(m.totalOpening || 0)}</td>
          </tr>
        `;
      });
    } else {
      trRows = `
        <tr>
          <td colspan="12" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Master Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="ds-report-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'ds-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'MEMBER MASTER DATA SHEET'}</div>
          <div>Total Listed Units: <strong>${isBlank ? '0' : members.length}</strong></div>
        </div>

        <table class="ds-table" style="width:100%; border-collapse:collapse; font-size:8pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:5px; text-align:center; width:25px;">#</th>
              <th style="padding:5px; text-align:center; width:65px;">Code</th>
              <th style="padding:5px; text-align:left;">Member Name</th>
              <th style="padding:5px; text-align:left;">Associate / Co-Owner</th>
              <th style="padding:5px; text-align:center; width:40px;">Wing</th>
              <th style="padding:5px; text-align:center; width:45px;">Flat</th>
              <th style="padding:5px; text-align:center; width:60px;">Type</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:55px;">Area (SqFt)</th>
              <th style="padding:5px; text-align:center; width:75px;">Contact</th>
              <th style="padding:5px; text-align:left;">Email</th>
              <th style="padding:5px; text-align:center; width:75px;">PAN</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:80px;">Opening (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${trRows}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="7" style="padding:5px; text-align:right;">TOTALS:</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : totalArea}</td>
              <td colspan="3" style="text-align:center;">-</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; color:${cfg.primaryColor || '#1e40af'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totalOpening)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 13. BILL REGISTER RENDERER ───────────────────────────────────────────
  function renderBillRegisterDoc(soc, data, bills, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || bills.length === 0);
    let totM = 0, totS = 0, totP = 0, totN = 0, totArr = 0, totTax = 0, totCgst = 0, totSgst = 0, totGrand = 0;

    let rowsHtml = '';
    if (!isBlank) {
      bills.forEach((b, idx) => {
        totM += Number(b.maintenance || 0);
        totS += Number(b.sinking || 0);
        totP += Number(b.parking || 0);
        totN += Number(b.nonOccupancy || 0);
        totArr += Number(b.arrears || 0);
        totTax += Number(b.taxable || 0);
        totCgst += Number(b.cgst || 0);
        totSgst += Number(b.sgst || 0);
        totGrand += Number(b.total || 0);

        rowsHtml += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:4px; text-align:center;">${idx + 1}</td>
            <td style="padding:4px; font-weight:700;">${HenuOsReportEngine.escapeHtml(b.billNo || '-')}</td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.formatDate(b.billDate)}</td>
            <td style="padding:4px; text-align:center;"><b>${HenuOsReportEngine.escapeHtml(b.wing ? b.wing + '-' : '')}${HenuOsReportEngine.escapeHtml(b.flatNo || '-')}</b></td>
            <td style="padding:4px;">${HenuOsReportEngine.escapeHtml(b.memberName || '-')}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'};">${HenuOsReportEngine.formatINR(b.maintenance)}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'};">${HenuOsReportEngine.formatINR(b.sinking)}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'};">${HenuOsReportEngine.formatINR(b.parking)}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'};">${HenuOsReportEngine.formatINR(b.arrears)}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'};">${HenuOsReportEngine.formatINR(b.taxable)}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'};">${HenuOsReportEngine.formatINR(b.cgst)}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'};">${HenuOsReportEngine.formatINR(b.sgst)}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'}; font-weight:800; color:${cfg.primaryColor || '#1e40af'};">${HenuOsReportEngine.formatINR(b.total)}</td>
          </tr>
        `;
      });
    } else {
      rowsHtml = `
        <tr>
          <td colspan="13" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="br-report-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'br-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'MEMBER BILL REGISTER (DEMAND REGISTER)'}</div>
          <div>Period: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (data.period || 'October 2026'))}</strong></div>
        </div>

        <table class="br-table" style="width:100%; border-collapse:collapse; font-size:8pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:5px; text-align:center; width:25px;">#</th>
              <th style="padding:5px; text-align:left; width:75px;">Bill No</th>
              <th style="padding:5px; text-align:center; width:65px;">Date</th>
              <th style="padding:5px; text-align:center; width:45px;">Unit</th>
              <th style="padding:5px; text-align:left;">Member Name</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:65px;">Maint (₹)</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:55px;">Sinking</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:55px;">Parking</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:60px;">Arrears</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:65px;">Taxable</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:50px;">CGST</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:50px;">SGST</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:75px;">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="5" style="padding:5px; text-align:right;">REGISTER TOTALS:</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totM)}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totS)}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totP)}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totArr)}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totTax)}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totCgst)}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totSgst)}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; color:${cfg.primaryColor || '#1e40af'}; font-size:8.5pt;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totGrand)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 14. RECEIPT REGISTER RENDERER ─────────────────────────────────────────
  function renderReceiptRegisterDoc(soc, data, receipts, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || receipts.length === 0);
    let grandTot = 0;

    let rowsHtml = '';
    if (!isBlank) {
      receipts.forEach((r, idx) => {
        grandTot += Number(r.amount || 0);
        rowsHtml += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:4px; text-align:center;">${idx + 1}</td>
            <td style="padding:4px; font-weight:700;">${HenuOsReportEngine.escapeHtml(r.receiptNo || '-')}</td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.formatDate(r.date)}</td>
            <td style="padding:4px;"><strong>${HenuOsReportEngine.escapeHtml(r.memberName || '-')}</strong></td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.escapeHtml(r.wing || '-')}</td>
            <td style="padding:4px; text-align:center;"><b>${HenuOsReportEngine.escapeHtml(r.flatNo || '-')}</b></td>
            <td style="padding:4px; text-align:center;"><span style="font-size:7pt; background:#f1f5f9; padding:2px 4px; border-radius:3px;">${HenuOsReportEngine.escapeHtml(r.mode || 'NEFT')}</span></td>
            <td style="padding:4px;">${HenuOsReportEngine.escapeHtml(r.refNo || '-')}</td>
            <td style="padding:4px;">${HenuOsReportEngine.escapeHtml(r.bank || '-')}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${HenuOsReportEngine.formatINR(r.amount)}</td>
            <td style="padding:4px; text-align:center;"><span style="font-size:7pt; background:#dcfce7; color:#166534; padding:2px 4px; border-radius:3px; font-weight:700;">${HenuOsReportEngine.escapeHtml(r.status || 'CLEARED')}</span></td>
          </tr>
        `;
      });
    } else {
      rowsHtml = `
        <tr>
          <td colspan="11" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="rr-report-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'rr-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'MEMBER RECEIPT REGISTER (COLLECTIONS LOG)'}</div>
          <div>Period: <strong>${HenuOsReportEngine.escapeHtml(isBlank ? '—' : (data.period || 'October 2026'))}</strong></div>
        </div>

        <table class="rr-table" style="width:100%; border-collapse:collapse; font-size:8pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:5px; text-align:center; width:25px;">#</th>
              <th style="padding:5px; text-align:left; width:80px;">Receipt No</th>
              <th style="padding:5px; text-align:center; width:65px;">Date</th>
              <th style="padding:5px; text-align:left;">Member Name</th>
              <th style="padding:5px; text-align:center; width:35px;">Wing</th>
              <th style="padding:5px; text-align:center; width:40px;">Flat</th>
              <th style="padding:5px; text-align:center; width:55px;">Mode</th>
              <th style="padding:5px; text-align:left; width:95px;">Ref / Chq No</th>
              <th style="padding:5px; text-align:left;">Drawn Bank</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:80px;">Amount (₹)</th>
              <th style="padding:5px; text-align:center; width:60px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="9" style="padding:5px; text-align:right;">TOTAL RECEIVED:</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; color:${cfg.primaryColor || '#1e40af'}; font-size:8.5pt;">${isBlank ? '—' : HenuOsReportEngine.formatINR(grandTot)}</td>
              <td style="text-align:center;">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 15. DEBIT NOTE REGISTER RENDERER ─────────────────────────────────────
  function renderDebitNoteRegisterDoc(soc, data, notes, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || notes.length === 0);
    const totalAmount = notes.reduce((acc, row) => acc + Number(row.debitAmount || row.amount || 0), 0);

    let rowsHtml = '';
    if (!isBlank) {
      notes.forEach((row, idx) => {
        rowsHtml += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:5px; text-align:center;">${idx + 1}</td>
            <td style="padding:5px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(row.debitNoteNumber || row.noteNo || '-')}</td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.formatDate(row.date || row.noteDate)}</td>
            <td style="padding:5px;"><strong>${HenuOsReportEngine.escapeHtml(row.memberName || row.residentName || '-')}</strong></td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.escapeHtml(row.wing || '-')}</td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.escapeHtml(row.flatNo || row.unit || '-')}</td>
            <td style="padding:5px;">${HenuOsReportEngine.escapeHtml(row.reason || row.description || '-')}</td>
            <td style="padding:5px;">${HenuOsReportEngine.escapeHtml(row.accountHead || 'Sundry Charges')}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${HenuOsReportEngine.formatINR(row.debitAmount || row.amount || 0)}</td>
            <td style="padding:5px; text-align:center;"><span style="font-size:7pt; background:#dcfce7; color:#166534; padding:2px 4px; border-radius:3px; font-weight:700;">${HenuOsReportEngine.escapeHtml(row.status || 'Posted')}</span></td>
          </tr>
        `;
      });
    } else {
      rowsHtml = `
        <tr>
          <td colspan="10" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="dnr-report-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'dnr-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'MEMBER DEBIT NOTE REGISTER'}</div>
          <div>Total Notes: <strong>${isBlank ? '0' : notes.length}</strong></div>
        </div>

        <table class="dnr-table" style="width:100%; border-collapse:collapse; font-size:8.5pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:5px; text-align:center; width:30px;">#</th>
              <th style="padding:5px; text-align:center; width:75px;">Note No</th>
              <th style="padding:5px; text-align:center; width:70px;">Date</th>
              <th style="padding:5px; text-align:left;">Member Name</th>
              <th style="padding:5px; text-align:center; width:40px;">Wing</th>
              <th style="padding:5px; text-align:center; width:45px;">Flat</th>
              <th style="padding:5px; text-align:left;">Reason / Particulars</th>
              <th style="padding:5px; text-align:left;">Account Head</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:85px;">Debit (₹)</th>
              <th style="padding:5px; text-align:center; width:60px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="8" style="padding:5px; text-align:right;">TOTAL DEBIT AMOUNT:</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; color:${cfg.primaryColor || '#1e40af'}; font-size:9pt;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totalAmount)}</td>
              <td style="text-align:center;">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 16. CREDIT NOTE REGISTER RENDERER ────────────────────────────────────
  function renderCreditNoteRegisterDoc(soc, data, notes, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || notes.length === 0);
    const totalAmount = notes.reduce((acc, row) => acc + Number(row.creditAmount || row.amount || 0), 0);

    let rowsHtml = '';
    if (!isBlank) {
      notes.forEach((row, idx) => {
        rowsHtml += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:5px; text-align:center;">${idx + 1}</td>
            <td style="padding:5px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(row.creditNoteNumber || row.noteNo || '-')}</td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.formatDate(row.date || row.noteDate)}</td>
            <td style="padding:5px;"><strong>${HenuOsReportEngine.escapeHtml(row.memberName || row.residentName || '-')}</strong></td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.escapeHtml(row.wing || '-')}</td>
            <td style="padding:5px; text-align:center;">${HenuOsReportEngine.escapeHtml(row.flatNo || row.unit || '-')}</td>
            <td style="padding:5px;">${HenuOsReportEngine.escapeHtml(row.reason || row.description || '-')}</td>
            <td style="padding:5px;">${HenuOsReportEngine.escapeHtml(row.accountHead || 'Waiver Head')}</td>
            <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; font-weight:700; color:#15803d;">${HenuOsReportEngine.formatINR(row.creditAmount || row.amount || 0)}</td>
            <td style="padding:5px; text-align:center;"><span style="font-size:7pt; background:#dcfce7; color:#166534; padding:2px 4px; border-radius:3px; font-weight:700;">${HenuOsReportEngine.escapeHtml(row.status || 'Posted')}</span></td>
          </tr>
        `;
      });
    } else {
      rowsHtml = `
        <tr>
          <td colspan="10" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="cnr-report-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'cnr-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'MEMBER CREDIT NOTE REGISTER'}</div>
          <div>Total Notes: <strong>${isBlank ? '0' : notes.length}</strong></div>
        </div>

        <table class="cnr-table" style="width:100%; border-collapse:collapse; font-size:8.5pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:5px; text-align:center; width:30px;">#</th>
              <th style="padding:5px; text-align:center; width:75px;">Note No</th>
              <th style="padding:5px; text-align:center; width:70px;">Date</th>
              <th style="padding:5px; text-align:left;">Member Name</th>
              <th style="padding:5px; text-align:center; width:40px;">Wing</th>
              <th style="padding:5px; text-align:center; width:45px;">Flat</th>
              <th style="padding:5px; text-align:left;">Reason / Particulars</th>
              <th style="padding:5px; text-align:left;">Account Head</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:85px;">Credit (₹)</th>
              <th style="padding:5px; text-align:center; width:60px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="8" style="padding:5px; text-align:right;">TOTAL CREDIT AMOUNT:</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; color:#15803d; font-size:9pt;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totalAmount)}</td>
              <td style="text-align:center;">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 17. ADJUSTMENT REGISTER RENDERER ─────────────────────────────────────
  function renderAdjustmentRegisterDoc(soc, data, items, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || items.length === 0);
    const totalAmount = items.reduce((acc, row) => acc + Number(row.amount || 0), 0);

    let rowsHtml = '';
    if (!isBlank) {
      items.forEach((row, idx) => {
        rowsHtml += `
          <tr style="border-bottom:1px solid #e2e8f0; ${cfg.alternateRows && idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
            <td style="padding:4px; text-align:center;">${idx + 1}</td>
            <td style="padding:4px; text-align:center; font-weight:700;">${HenuOsReportEngine.escapeHtml(row.adjustmentNumber || row.adjNo || '-')}</td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.formatDate(row.date || row.adjustmentDate)}</td>
            <td style="padding:4px;"><strong>${HenuOsReportEngine.escapeHtml(row.memberName || row.residentName || '-')}</strong></td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.escapeHtml(row.wing || '-')}</td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.escapeHtml(row.flatNo || row.unit || '-')}</td>
            <td style="padding:4px;">${HenuOsReportEngine.escapeHtml(row.sourceHead || row.source || 'Advance')}</td>
            <td style="padding:4px;">${HenuOsReportEngine.escapeHtml(row.destHead || row.destination || 'Dues')}</td>
            <td style="padding:4px; text-align:center;">${HenuOsReportEngine.escapeHtml(row.adjustmentType || 'Adj')}</td>
            <td class="right" style="padding:4px; text-align:${cfg.amountAlign || 'right'}; font-weight:700;">${HenuOsReportEngine.formatINR(row.amount || 0)}</td>
            <td style="padding:4px;">${HenuOsReportEngine.escapeHtml(row.narration || '-')}</td>
            <td style="padding:4px; text-align:center;"><span style="font-size:7pt; background:#dcfce7; color:#166534; padding:2px 4px; border-radius:3px; font-weight:700;">${HenuOsReportEngine.escapeHtml(row.status || 'Posted')}</span></td>
          </tr>
        `;
      });
    } else {
      rowsHtml = `
        <tr>
          <td colspan="12" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="ar-report-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'ar-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'MEMBER ADJUSTMENT REGISTER'}</div>
          <div>Total Adjustments: <strong>${isBlank ? '0' : items.length}</strong></div>
        </div>

        <table class="ar-table" style="width:100%; border-collapse:collapse; font-size:8pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:5px; text-align:center; width:25px;">#</th>
              <th style="padding:5px; text-align:center; width:75px;">Adj No</th>
              <th style="padding:5px; text-align:center; width:65px;">Date</th>
              <th style="padding:5px; text-align:left;">Member Name</th>
              <th style="padding:5px; text-align:center; width:35px;">Wing</th>
              <th style="padding:5px; text-align:center; width:35px;">Flat</th>
              <th style="padding:5px; text-align:left;">Source Head</th>
              <th style="padding:5px; text-align:left;">Destination Head</th>
              <th style="padding:5px; text-align:center; width:65px;">Type</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:75px;">Amount (₹)</th>
              <th style="padding:5px; text-align:left;">Narration</th>
              <th style="padding:5px; text-align:center; width:55px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="9" style="padding:5px; text-align:right;">TOTAL ADJUSTED AMOUNT:</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; color:${cfg.primaryColor || '#1e40af'}; font-size:8.5pt;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totalAmount)}</td>
              <td colspan="2" style="text-align:center;">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ── 18. MEMBER JV REGISTER RENDERER ──────────────────────────────────────
  function renderMemberJVRegisterDoc(soc, data, jvs, cfg, mode) {
    const isBlank = (mode === 'EMPTY' || jvs.length === 0);
    let totalDebit = 0, totalCredit = 0;

    let rowsHtml = '';
    if (!isBlank) {
      jvs.forEach((jv, idx) => {
        const lines = jv.lines || [jv];
        const jvNo = jv.jvNumber || jv.jvNo || `JV-${idx + 1}`;
        const date = jv.date || jv.voucherDate || '';
        const unit = jv.flatNo || jv.unit || '';
        const wing = jv.wing ? jv.wing + '-' : '';
        const memberName = jv.memberName || jv.residentName || '-';
        const narration = jv.narration || '';

        lines.forEach((line, lineIdx) => {
          const dr = Number(line.debit || 0);
          const cr = Number(line.credit || 0);
          totalDebit += dr;
          totalCredit += cr;
          const isFirst = (lineIdx === 0);

          rowsHtml += `
            <tr style="border-bottom:1px solid #e2e8f0; ${isFirst && idx > 0 ? 'border-top:2px solid #cbd5e1;' : ''}">
              ${isFirst ? `<td style="padding:5px; text-align:center; font-weight:700; vertical-align:top;" rowspan="${lines.length}">${HenuOsReportEngine.escapeHtml(jvNo)}</td>` : ''}
              ${isFirst ? `<td style="padding:5px; text-align:center; vertical-align:top;" rowspan="${lines.length}">${HenuOsReportEngine.formatDate(date)}</td>` : ''}
              ${isFirst ? `<td style="padding:5px; text-align:center; vertical-align:top;" rowspan="${lines.length}"><b>${HenuOsReportEngine.escapeHtml(wing + unit)}</b></td>` : ''}
              ${isFirst ? `<td style="padding:5px; vertical-align:top;" rowspan="${lines.length}"><strong>${HenuOsReportEngine.escapeHtml(memberName)}</strong></td>` : ''}
              <td style="padding:5px;">${HenuOsReportEngine.escapeHtml(line.ledgerHead || 'General Ledger')}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; ${dr > 0 ? 'font-weight:700;' : 'color:#94a3b8;'}">${dr > 0 ? HenuOsReportEngine.formatINR(dr) : '-'}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; ${cr > 0 ? 'font-weight:700; color:#15803d;' : 'color:#94a3b8;'}">${cr > 0 ? HenuOsReportEngine.formatINR(cr) : '-'}</td>
            </tr>
          `;
        });

        if (narration) {
          rowsHtml += `
            <tr style="background:#f8fafc; font-size:7.5pt; color:#475569;">
              <td colspan="7" style="padding:3px 8px;"><span style="font-weight:700; color:#1e293b;">Narration:</span> ${HenuOsReportEngine.escapeHtml(narration)}</td>
            </tr>
          `;
        }
      });
    } else {
      rowsHtml = `
        <tr>
          <td colspan="7" style="text-align:center; padding:20px; color:#64748b;">[ Blank Template — Structure Ready for Live Data ]</td>
        </tr>
      `;
    }

    return `
      <div class="jv-report-page" style="border:none; box-shadow:none; padding:0;">
        ${buildSocietyHeaderHtml(soc, cfg, 'jv-header')}

        <div style="display:flex; justify-content:space-between; background:#f1f5f9; padding:6px 12px; margin-bottom:12px; border-left:4px solid ${cfg.primaryColor || '#1e40af'};">
          <div style="font-weight:800; font-size:11pt; color:${cfg.primaryColor || '#1e40af'};">${cfg.customTitle || 'MEMBER JOURNAL VOUCHER (JV) REGISTER'}</div>
          <div>Total Vouchers: <strong>${isBlank ? '0' : jvs.length}</strong></div>
        </div>

        <table class="jv-table" style="width:100%; border-collapse:collapse; font-size:8.5pt; border:1px solid #cbd5e1;">
          <thead>
            <tr style="background:${cfg.tableHeaderBg || '#1e40af'}; color:${cfg.tableHeaderText || '#ffffff'};">
              <th style="padding:5px; text-align:center; width:80px;">JV No</th>
              <th style="padding:5px; text-align:center; width:70px;">Date</th>
              <th style="padding:5px; text-align:center; width:55px;">Unit</th>
              <th style="padding:5px; text-align:left; width:150px;">Member Name</th>
              <th style="padding:5px; text-align:left;">Ledger Head</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:100px;">Debit (₹)</th>
              <th style="padding:5px; text-align:${cfg.amountAlign || 'right'}; width:100px;">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background:#f1f5f9; font-weight:800; border-top:2px solid ${cfg.primaryColor || '#1e40af'};">
              <td colspan="5" style="padding:5px; text-align:right;">JOURNAL REGISTER TOTALS:</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'};">${isBlank ? '—' : HenuOsReportEngine.formatINR(totalDebit)}</td>
              <td class="right" style="padding:5px; text-align:${cfg.amountAlign || 'right'}; color:#15803d;">${isBlank ? '—' : HenuOsReportEngine.formatINR(totalCredit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // SAVE DRAFT
  async function saveDraft() {
    const reportKey = state.activeReportKey;
    const cfg = state.configs[reportKey];
    const ctx = HenuOsReportEngine.getSystemContext();

    try {
      const payload = {
        reportKey: reportKey.toUpperCase(),
        templateKey: 'default',
        templateName: 'Default Official Template',
        templateJson: JSON.stringify(cfg),
        isSystem: false
      };

      const res = await fetch(`${ctx.apiBase}/reports/member/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        state.isDirty = false;
        updateStatusBadge();
        showToast('Draft design saved successfully.', 'success');
      } else {
        throw new Error('Failed to save draft');
      }
    } catch (e) {
      console.error('[HOD] saveDraft error:', e);
      showToast('Error saving draft: ' + e.message, 'error');
    }
  }

  // PUBLISH ACTIVE DESIGN
  async function publishActive() {
    const reportKey = state.activeReportKey;
    const cfg = state.configs[reportKey];
    const ctx = HenuOsReportEngine.getSystemContext();

    try {
      // 1. Publish Template
      const templatePayload = {
        reportKey: reportKey.toUpperCase(),
        templateKey: 'default',
        templateName: 'Default Official Template',
        templateJson: JSON.stringify(cfg),
        publishedBy: 'ADMIN'
      };

      const res1 = await fetch(`${ctx.apiBase}/reports/member/templates/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templatePayload)
      });

      // 2. Update Runtime Settings
      const settingsPayload = {
        reportKey: reportKey,
        settingJson: JSON.stringify(cfg),
        updatedBy: 'ADMIN'
      };

      const res2 = await fetch(`${ctx.apiBase}/reports/member/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload)
      });

      if (res1.ok || res2.ok) {
        state.isDirty = false;
        updateStatusBadge();
        showToast(`Design for "${reportKey}" published successfully as Active!`, 'success');
      } else {
        throw new Error('Server returned error publishing design.');
      }
    } catch (e) {
      console.error('[HOD] publishActive error:', e);
      showToast('Error publishing design: ' + e.message, 'error');
    }
  }

  // RESET TO DEFAULT
  function resetToDefault() {
    const reportKey = state.activeReportKey;
    const mod = MODULES.find(m => m.key === reportKey) || MODULES[0];
    state.configs[reportKey] = Object.assign({}, DEFAULT_DESIGN, { orientation: mod.orientation });
    state.isDirty = true;
    updateStatusBadge();
    renderSettingsForm();
    renderLivePreview();
    showToast('Reset to default official HENU ERP design.', 'success');
  }

  // TOAST NOTIFICATION
  function showToast(msg, type = 'success') {
    const toast = document.getElementById('hodToast');
    const toastText = document.getElementById('hodToastText');
    if (!toast || !toastText) return;

    toast.className = `hod-toast ${type} show`;
    toastText.textContent = msg;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  // HORIZONTAL TAB SCROLL
  function scrollModuleTabs(delta) {
    const strip = document.getElementById('moduleTabsStrip');
    if (strip) {
      strip.scrollBy({ left: delta, behavior: 'smooth' });
    }
  }

  // GLOBAL EXPORTS
  window.selectModule = selectModule;
  window.selectCategory = selectCategory;
  window.updateField = updateField;
  window.saveDraft = saveDraft;
  window.publishActive = publishActive;
  window.resetToDefault = resetToDefault;
  window.refreshPreview = loadAndRenderPreview;
  window.toggleTestData = toggleTestData;
  window.testPrint = () => window.print();
  window.scrollModuleTabs = scrollModuleTabs;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
