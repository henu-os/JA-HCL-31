# HENU ERP — Additional Reports Technical Data Lineage & Query Documentation

## Overview
This document outlines the end-to-end data lineage, database schema mappings, query architecture, calculation logic, and duplicate prevention strategies for the three accounting report modules in **Additional Reports**:
1. **TDS Report** (Tax Deducted at Source Register & Compliance)
2. **GST Report** (Outward Member Billing Register & Inward Purchase ITC Register)
3. **Fund Reports** (Multi-Fund Ledger Statement & Statutory Reserve Movement)

---

## 1. TDS Report (Tax Deducted at Source)

### 1.1 Field-by-Field Data Lineage Mapping

| Report | Excel Column / Field | Source Table | Source Column | Join / Relationship | Transformation / Rule |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TDS** | Date of Payment | `SocVoucherHeader` / `SocTdsTransaction` | `VoucherDate` / `VoucherDate` | Direct | Formatted as `YYYY-MM-DD` / `DD/MM/YYYY` |
| **TDS** | Voucher No. | `SocVoucherHeader` / `SocTdsTransaction` | `VoucherNo` / `VoucherNo` | `SocVoucherHeader.VoucherId` | Raw string (e.g. `PV-2026-001`) |
| **TDS** | Invoice/Bill Date | `SocVoucherDetail` / `SocTdsTransaction` | `BillDate` / `VoucherDate` | Inner join on `VoucherId` | Inward vendor invoice date |
| **TDS** | Vendor/Party Invoice No. | `SocVoucherDetail` / `SocTdsTransaction` | `BillNo` / `Remarks` | Inner join on `VoucherId` | Inward vendor invoice number |
| **TDS** | Vendor/Party Name | `SocVendor` / `SocTdsTransaction` | `VendorName` / `DeducteeName` | `SocVoucherDetail.VendorId` → `SocVendor.VendorId` | Fallback to DeducteeName if vendor master empty |
| **TDS** | Vendor/Party PAN No. | `SocVendor` / `SocTdsTransaction` | `Pan` / `Pan` | `SocVendor.Pan` | Upper-cased 10-digit PAN (e.g. `ABCDE1234F`) |
| **TDS** | Account Head | `SocAccount` / `SocVoucherDetail` | `AccountName` / `AccountHead` | `SocVoucherDetail.AccountCode` → `SocAccount.AccountCode` | Head under which expense is booked |
| **TDS** | Particulars | `SocVoucherDetail` / `SocTdsTransaction` | `Narration` / `NatureOfPayment` | Direct | Description of service / contract |
| **TDS** | Section Code (New) | `SocTdsTransaction` / `SocAccount` | `Section` / `TdsSection` | Linked via Deductee/Account | Income Tax section (194C, 194J, 194I, 194H) |
| **TDS** | Section Code (Old) | `SocTdsTransaction` | `OldSection` / `Section` | Derived | Preserves legacy tax codes |
| **TDS** | Bill/Invoice Amount | `SocVoucherDetail` / `SocTdsTransaction` | `Debit` / `TaxableAmount` or `GrossAmount` | Aggregate sum | Gross contractual amount |
| **TDS** | CGST | `SocVoucherDetail` / `SocTdsTransaction` | `Cgst` / `CGST` | Computed or stored on voucher | 0.00 if tax excluded from TDS base |
| **TDS** | SGST | `SocVoucherDetail` / `SocTdsTransaction` | `Sgst` / `SGST` | Computed or stored on voucher | 0.00 if tax excluded from TDS base |
| **TDS** | Less TDS % | `SocTdsTransaction` / `SocVendor` | `TdsRate` / `DefaultTdsRate` | Direct | e.g. 2.0%, 10.0%, 5.0% |
| **TDS** | TDS Amount | `SocVoucherDetail` / `SocTdsTransaction` | `TdsAmount` / `Credit` (on TDS account) | Exact double-entry deduction | Stored accounting amount |
| **TDS** | Net Paid | Computed | — | `GrossAmount - TdsAmount` | Net payment issued to vendor |
| **TDS** | BSR Code | `SocTdsChallan` | `BsrCode` | `SocTdsTransaction.ChallanNo` → `SocTdsChallan.ChallanNo` | 7-digit bank branch code |
| **TDS** | Challan Date | `SocTdsChallan` | `ChallanDate` | `SocTdsTransaction.ChallanNo` → `SocTdsChallan.ChallanNo` | Date ITNS-281 deposited |
| **TDS** | Challan No. | `SocTdsChallan` / `SocTdsTransaction` | `ChallanNo` / `ChallanNo` | Direct | 5-digit Challan identification number |
| **TDS** | TDS Payment Status | `SocTdsTransaction` | `Status` | Computed / Stored | `Confirmed`, `Deposited`, `Suggested`, `Outstanding` |

### 1.2 Query, Joins & Duplicate Prevention
- **Primary Source Table**: `SocTdsTransaction` (or live `SocVoucherHeader` + `SocVoucherDetail` entries where account is mapped to TDS Deductions).
- **Date Filter**: `VoucherDate >= @FromDate AND VoucherDate <= @ToDate`.
- **Duplicate Prevention**: The report grains at the `SocTdsTransaction.Id` level (or `VoucherId` + `DeducteeId`). Multiple voucher detail lines for expense items are aggregated to single voucher-level payments before computing tax components.

---

## 2. GST Report (Outward Sales & Inward Purchase ITC)

### 2.1 Outward Sales / Member Billing (30-Column Matrix)

| Excel Column | Source Table | Source Column | Join / Relation | Transformation / Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Sr No** | Index | — | Auto-increment | 1-based sequential index |
| **GST Invoice No.** | `SocMemberBill` | `BillNo` | Primary Key `BillId` | e.g. `BILL-2026-001` |
| **Bill Date** | `SocMemberBill` | `BillDate` | Direct | `YYYY-MM-DD` |
| **Flat No.** | `SocMember` | `FlatNo` (or `Wing + '-' + FlatNo`) | `SocMemberBill.MemberId` → `SocMember.MemberId` | e.g. `A-101` |
| **Member Name** | `SocMember` | `MemName` | `SocMemberBill.MemberId` → `SocMember.MemberId` | Member full legal name |
| **Area (Sq.Ft)** | `SocMember` | `AreaSqft` | Direct | Numeric unit area |
| **Property Tax** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '101'` | Non-taxable municipal tax |
| **Water & Electricity** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode IN ('102', '103')` | Pure utility recharge (Exempt) |
| **Mhada Lease & NA Tax** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '104'` | Government statutory lease |
| **GST Not Applicable** | `SocMemberBill` | Sum of non-taxable heads | Aggregated line items | Sum of exempt items |
| **Sinking Fund** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '309'` | Capital reserve contribution |
| **Repair & Maint Fund** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '310'` | Statutory building repair fund |
| **Lift AMC & Repair** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '201'` | Lift maintenance charges |
| **AMC/DG Set/Gym/Intercom**| `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode IN ('202', '203')` | Common amenity charges |
| **CCTV Rental** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '204'` | Security equipment rental |
| **Security & Housekeeping**| `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '205'` | Common area services |
| **Meeting & Welfare** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '206'` | Society administrative costs |
| **Salary & Wages** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '207'` | Staff payroll allocations |
| **Insurance & Audit** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode IN ('208', '209')` | Statutory audit & premise insurance |
| **Total GST Exempt** | `SocMemberBill` | Sum of exempt charges | Aggregated | Subtotal exempt amount |
| **Non-Occupancy Charges**| `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '401'` | 10% statutory service charges |
| **Parking Charges** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '402'` | Stilt/Open car parking charges |
| **Bank Charges** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '403'` | Cheque return / ECS charges |
| **Other Charges** | `SocMemberBillItem` | `Amount` | `BillId` AND Other codes | Miscellaneous heads |
| **Interest on Arrears** | `SocMemberBillItem` | `Amount` | `BillId` AND `AccountCode = '501'` | 21% p.a. simple interest on dues |
| **GST Applicable Amount** | `SocMemberBill` | `TaxableAmount` | Stored / derived from taxable items | Threshold rule applied (₹7,500/mo) |
| **CGST (9%)** | `SocMemberBill` | `Cgst` | Stored accounting value | 9% on taxable value |
| **SGST (9%)** | `SocMemberBill` | `Sgst` | Stored accounting value | 9% on taxable value |
| **Total GST** | `SocMemberBill` | `TotalGst` | Stored `Cgst + Sgst` | Total output liability |
| **Total Bill Amount** | `SocMemberBill` | `TotalAmount` | Stored Grand Total | Principal + GST + Arrears |

### 2.2 Inward Purchase / Input Tax Credit (ITC) (12-Column Matrix)

| Excel Column | Source Table | Source Column | Join / Relation | Transformation / Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Sr No** | Index | — | Auto-increment | 1-based sequential index |
| **Bill Date** | `SocVoucherHeader` / `SocVoucherDetail` | `VoucherDate` / `BillDate` | Direct | Date of invoice |
| **Vendor Bill No.** | `SocVoucherDetail` | `BillNo` | Direct | Vendor tax invoice number |
| **Voucher No.** | `SocVoucherHeader` | `VoucherNo` | `VoucherId` | Payment / Purchase voucher ref |
| **Vendor / Party Name**| `SocVendor` | `VendorName` | `VendorId` | Registered vendor legal name |
| **Vendor GSTIN** | `SocVendor` | `Gstin` | `VendorId` | 15-character GSTIN |
| **Account Head** | `SocAccount` | `AccountName` | `AccountCode` | Expense account head |
| **Particulars** | `SocVoucherDetail` | `Narration` | Direct | Voucher line item narration |
| **Taxable Amount** | `SocVoucherDetail` | `Debit` | Sum of taxable line debits | Taxable inward supply |
| **CGST Amount** | `SocVoucherDetail` | Stored `Cgst` or Input GST Acc | Sub-ledger / detail | Input CGST credit claimable |
| **SGST Amount** | `SocVoucherDetail` | Stored `Sgst` or Input GST Acc | Sub-ledger / detail | Input SGST credit claimable |
| **Total Amount** | `SocVoucherHeader` | `TotalAmount` | Aggregated | Gross invoice total paid |

---

## 3. Fund Reports (Multi-Fund Statutory Ledger)

### 3.1 Field-by-Field Data Lineage Mapping

| Excel Column | Source Table | Source Column | Join / Relation | Transformation / Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Section Banner** | `SocAccount` / `SocFund` | `AccountCode`, `AccountName` | `SocAccount.AccountCode` | `[ 309 - SINKING FUND ]` |
| **Date** | `SocVoucherHeader` | `VoucherDate` | `VoucherId` | Transaction date |
| **Type - No** | `SocVoucherHeader` | `VoucherType` + `-` + `VoucherNo` | `VoucherId` | e.g. `RV-001`, `PV-012`, `JV-004` |
| **Code** | `SocAccount` | `AccountCode` | `SocAccount.AccountCode` | 3-digit chart of accounts code |
| **Particular** | `SocVoucherDetail` / `SocMember` / `SocVendor` | `Narration` or Party Name | Resolved via `MemberId` / `VendorId` | Clear transaction source/purpose |
| **Debit** | `SocVoucherDetail` | `Debit` | Filtered on Fund Account | Outflow / Utilization / Transfer |
| **Credit** | `SocVoucherDetail` | `Credit` | Filtered on Fund Account | Inflow / Billing contribution / Interest |
| **Balance** | Computed | Running Balance | `Opening + Credits - Debits` | Running balance respecting liability sign |

### 3.2 Opening & Closing Balance Logic
1. **Opening Balance as of `FromDate - 1 day`**:
   $$\text{Opening Balance} = \text{Initial Opening Balance} + \sum_{t < \text{FromDate}} (\text{Credit}_t - \text{Debit}_t)$$
2. **Current Period Movement**:
   $$\text{Closing Balance} = \text{Opening Balance} + \sum_{t \in [\text{FromDate}, \text{ToDate}]} \text{Credit}_t - \sum_{t \in [\text{FromDate}, \text{ToDate}]} \text{Debit}_t$$
3. **Reconciliation Check**:
   $$\text{Opening Balance} + \text{Total Additions} - \text{Total Deductions} = \text{Closing Balance}$$

---

## 4. Summary of API Endpoints

| UI Action | API Route | Controller Action | Target Entity |
| :--- | :--- | :--- | :--- |
| **TDS Report** | `GET /api/additional-reports/tds/report` | `AdditionalReportsController.GetTdsReport` | `SocTdsTransaction`, `SocVoucherHeader`, `SocVendor` |
| **TDS Summary** | `GET /api/additional-reports/tds/summary` | `AdditionalReportsController.GetTdsSummary` | `SocTdsTransaction`, `SocTdsChallan` |
| **TDS Parties** | `GET /api/additional-reports/tds/parties` | `AdditionalReportsController.GetTdsParties` | `SocVendor`, `SocTdsDeductee` |
| **GST Report** | `GET /api/additional-reports/gst/report` | `AdditionalReportsController.GetGstReport` | `SocMemberBill`, `SocMemberBillItem`, `SocVoucherDetail` |
| **GST Reconciliation**| `GET /api/additional-reports/gst/reconciliation` | `AdditionalReportsController.GetGstReconciliation` | `SocMemberBill`, `SocVoucherDetail` |
| **Fund Report** | `GET /api/additional-reports/funds/report` | `AdditionalReportsController.GetFundReport` | `SocAccount`, `SocVoucherHeader`, `SocVoucherDetail` |
| **Fund Accounts**| `GET /api/additional-reports/funds/accounts` | `AdditionalReportsController.GetFundAccounts` | `SocAccount` (Fund Category) |

---

## 5. Excel Generation Architecture
- **Engine**: `xlsx-js-style` / `XLSX` (`assets/js/xlsx-js-style.bundle.js`).
- **File Format**: Strict `.xlsx` only (no PDF, no CSV fallback).
- **Styling Tokens**:
  - Main Title: Dark Blue (`#0D47A1`), 14pt bold.
  - Section Banners: Deep Navy (`#1E3A8A`), 11pt bold white text, merged across table width.
  - Column Headers: Royal Blue (`#1565C0` / `#2563EB`), 10pt bold white text, wrapped, centered.
  - Cell Borders: Thin light grey (`#E2E8F0` / `#CCCCCC`).
  - Total / Footer Rows: Soft Blue (`#E3F2FD` / `#EFF6FF`), bold 10pt text, top thin border, bottom double border (`#000000`).
  - Number Formats: `#,##0.00` for currency amounts, `0.0%` for rates, `YYYY-MM-DD` for dates.
