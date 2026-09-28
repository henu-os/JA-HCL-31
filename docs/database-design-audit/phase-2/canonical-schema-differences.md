# CANONICAL SCHEMA DIFFERENCE & RECONCILIATION AUDIT

**Project:** JEEVIKA ERP 2.0  
**Phase:** Phase 2  
**Purpose:** Precise Itemization of Differences Between `Database/schema.sql`, `DbHelper.cs`, and Controller Queries.

---

## 1. Discrepancy Matrix

| Entity | Primary Schema (`schema.sql`) | Runtime DDL (`DbHelper.cs`) | Controller Queries | Reconciliation Recommendation (Phase 3) |
| :--- | :--- | :--- | :--- | :--- |
| **`SocBillType`** | Defined twice (Line 302 and Line 580) with differing column subsets. | Lines 194-205 create unified table with `BillTypeCode`, `BillTypeName`, `Description`, `IsActive`, `CreatedAt`, `UpdatedAt`. | `BillTypeController`, `MemberBillController` query unified columns. | Consolidate into a single canonical DDL matching `DbHelper.cs` and controllers. |
| **`SocOpeningBankReco`** | Defined twice (Line 338 and Line 459) with conflicting column names (`UnclearedAmount` vs `Amount`). | Lines 265-271 create canonical table with `UnclearedAmount`, `ChequeNo`, `ChequeDate`, `BillRefNo`, `PaidTo`. | `OpeningBankRecoController` queries canonical columns. | Consolidate into canonical DDL. |
| **`SocMemberBillItem`** | Missing from primary `schema.sql`. | Created on startup (Lines 277-283). | `MemberBillController` saves line items. | Add explicitly to canonical schema file. |
| **`SocGSTRate`** | Missing from primary `schema.sql`. | Missing from `DbHelper.cs`. | Queried in `GstController.cs` (Lines 27, 67, 97). | Add explicitly to canonical schema file. |
| **`SocMemberBill`** | Defined without `BillType`, `Period`, `Particular1`, `Particular2`. | Alters table to add columns (Lines 272-275). | `MemberBillController` queries all 4 columns. | Include columns directly in canonical table definition. |
| **`SocStaff`** | Defined without extended bank and payroll columns. | Alters table to add extended columns (Lines 286-300). | `StaffController` queries extended columns. | Include columns directly in canonical table definition. |
| **`SocVoucherHeader`** | Defined without bank reco clearing columns. | Alters table to add `ClearingDate` and `ClearingRemark` (Lines 302-303). | `BankRecoController` queries clearing columns. | Include columns directly in canonical table definition. |
