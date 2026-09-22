# Phase 1 — Read-Only Audit Report: Financial Year Management & Universal Export/Import Enhancement

**Project:** JEEVIKA ERP 2.0  
**Repository:** `https://github.com/henu-os/JA-HCL-31`  
**System Owner:** Siddharth Singh  
**Developer:** HENU OS PRIVATE LIMITED  
**Audit Date:** 2026-09-21  

---

## 1. Executive Summary

This read-only audit examines the existing Financial Year management, society context loading, and universal database export/import/merge subsystems across SQLite (Desktop local) and PostgreSQL (Web/Cloud) backends.

The objective is to implement a robust **Financial Year Management** flow (dynamic Year dropdowns, automatic April 1 to March 31 date calculation, duplicate detection, society scoping) and **Financial-Year-Aware Universal Export & Import/Merge** without disturbing any existing double-entry accounting engines, waterfall dues calculations, or database relational integrity.

---

## 2. Existing Schema Analysis

### FinancialYear Table Definition

#### PostgreSQL (`Database/Web/schema/schema.sql`):
```sql
CREATE TABLE IF NOT EXISTS jeevika_erp.FinancialYear (
    FYId        SERIAL PRIMARY KEY,
    SocietyId   INT          NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYLabel     VARCHAR(20)  NOT NULL,
    FYStart     DATE         NOT NULL,
    FYEnd       DATE         NOT NULL,
    IsActive    BOOLEAN      DEFAULT TRUE,
    IsClosed    BOOLEAN      DEFAULT FALSE,
    CreatedAt   TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(SocietyId, FYLabel)
);
CREATE INDEX IF NOT EXISTS idx_fy_society ON jeevika_erp.FinancialYear(SocietyId);
```

#### SQLite (`Database/Local/schema/sqlite_schema.sql`):
```sql
CREATE TABLE IF NOT EXISTS FinancialYear (
    FYId        INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId   INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYLabel     VARCHAR(20) NOT NULL,
    FYStart     TEXT NOT NULL,
    FYEnd       TEXT NOT NULL,
    IsActive    INTEGER DEFAULT 1,
    IsClosed    INTEGER DEFAULT 0,
    CreatedAt   TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(SocietyId, FYLabel)
);
CREATE INDEX IF NOT EXISTS idx_fy_society ON FinancialYear(SocietyId);
```

### Key Findings from Schema:
1. **Scoping**: `FinancialYear` is strictly scoped to `SocietyId` with a composite unique constraint `UNIQUE(SocietyId, FYLabel)`.
2. **Foreign Keys**: Dependent tables referencing `FinancialYear(FYId)` include:
   - `TxNumberConfig` (CASCADE)
   - `SocCommittee` (SET NULL)
   - `SocBillingMatrix` (CASCADE / SET NULL)
   - `SocOpeningBankReco` (CASCADE / SET NULL)
   - `SocVoucherHeader` (CASCADE / SET NULL)
   - `SocMemberBill` (CASCADE / SET NULL)
   - `SocMemberNote` (CASCADE / SET NULL)
   - `SocOpeningBalance` (CASCADE / SET NULL)
   - `SocFixedDeposit` (CASCADE / SET NULL)
3. **Date Storage**:
   - PostgreSQL: native `DATE` type (`YYYY-MM-DD`).
   - SQLite: ISO `TEXT` type (`YYYY-MM-DD`).
4. **Current Status Representation**:
   - `IsActive` (Boolean/Integer) indicates active operational status.
   - `IsClosed` (Boolean/Integer) indicates whether books for that FY are locked.
5. **No Schema Changes Required**: Existing schema already possesses all required columns (`FYId`, `SocietyId`, `FYLabel`, `FYStart`, `FYEnd`, `IsActive`, `IsClosed`, `CreatedAt`).

---

## 3. Existing API & Backend Controller Audit

1. **`FinancialYearController.cs`**:
   - `GET /api/financial-years?societyId={id}`: Queries FYs ordered by `FYStart DESC`.
   - `POST /api/financial-years`: Creates a new FY. Currently uses `NpgsqlConnection` directly and `RETURNING FYId` which causes issues under SQLite if executed directly against `DbHelper.GetConn()`.
   - **Remediation Needed**: Refactor `FinancialYearController` to use `DbHelper.GetDbConnection()` and provider-agnostic SQL (handling PostgreSQL `RETURNING FYId` and SQLite `last_insert_rowid()`), plus duplicate detection before insert.

2. **`DataTransferController.cs`**:
   - `POST /api/data-transfer/export`: Accepts `ExportRequest`.
   - `POST /api/data-transfer/import/preview`: Dry-run validation via `UniversalDataMergeService`.
   - `POST /api/data-transfer/import/execute`: Atomic merge execution.
   - **Remediation Needed**: Extend `ExportRequest` and `ExportMetadata` with `FinancialYearScope` (`ALL_FYS`, `CURRENT_FY`, `SELECT_FYS`) and `SelectedFinancialYearIds`.

3. **`DatabaseExportService.cs`**:
   - Filters tables by `SocietyId` when `scope == "SOCIETY"` or `scope == "SELECT_SOCIETIES"`.
   - When filtering by financial year (`FinancialYearScope`), dependent tables (`SocVoucherHeader`, `SocVoucherDetail`, `SocMemberBill`, `SocMemberBillItem`, `SocMemberNote`, `SocOpeningBalance`, `SocFixedDeposit`, `TxNumberConfig`, `SocCommittee`, `SocBillingMatrix`) must be filtered by `FYId IN (...)`.

4. **`UniversalDataMergeService.cs`**:
   - Correctly maps `SourceFYId` to target `FYId` via composite key `(SocietyId, FYLabel)`.
   - Needs support for filtering incoming financial years based on user selection during import.

---

## 4. Existing Frontend Flow Audit

1. **Setup Flow (`setup.html`)**:
   - Step 1: Select Society.
   - Step 2: Select Financial Year from real database API (`GET /api/financial-years?societyId=X`).
   - Step 3: Confirm and save session context (`activeSocietyId`, `activeFYId`, `activeFYLabel`, `activeFYStart`).
   - **Remediation Needed**:
     - Add `+ Create New Financial Year` interactive UI in Step 2.
     - Provide `From Year` (e.g., 2026) and `To Year` (e.g., 2027) dropdowns (no calendar date pickers).
     - Range policy: Dynamic list of years (e.g., `CurrentYear - 5` to `CurrentYear + 5`, plus existing DB years).
     - Auto-calculate: `FYLabel = "2026-2027"`, `FYStart = "2026-04-01"`, `FYEnd = "2027-03-31"`.
     - Prevent duplicate creation and auto-select newly created FY on backend confirmation.

2. **Universal Export / Import Interface (`henu-db-universal.html` & `henu-db-universal.js`)**:
   - Export section currently has `Export Scope` (`FULL`, `SOCIETY`, `SELECT_SOCIETIES`).
   - Import section currently has `Import Mode` and `Conflict Policy`.
   - **Remediation Needed**:
     - Add `Financial Year Scope` (`All Financial Years`, `Current Financial Year`, `Select Financial Years`) with dynamic financial year checklist for selected societies in Export.
     - Add `Financial Year Scope` with filtered package preview in Import.

---

## 5. Compatibility Risks & Mitigation Strategies

| Risk | Impact | Mitigation Strategy |
| --- | --- | --- |
| Provider SQL Syntax Differences | PostgreSQL uses `RETURNING FYId` and `NOW()`; SQLite uses `last_insert_rowid()` and `CURRENT_TIMESTAMP`. | Use `DbHelper.GetDbConnection()` and provider-agnostic parameterization with conditional ID retrieval. |
| Duplicate FY insertion | Violates unique constraint `(SocietyId, FYLabel)`. | Check existence first in `FinancialYearController.Create()` and return 400 Bad Request with a clear message: `"This financial year already exists for the selected society."` |
| Orphaned Dependent Records in FY Export | Exporting vouchers without header/detail relationship intact. | `DatabaseExportService` joins `SocVoucherDetail` on filtered `SocVoucherHeader` and `SocMemberBillItem` on filtered `SocMemberBill`. |
| Cross-Society Financial Year Collision | FY belonging to Society A accidentally assigned to Society B. | Strict multi-column validation in both backend controller and merge service: `(SocietyId, FYLabel)`. |

---

## 6. Files Requiring Modification vs Frozen Files

### Files to Modify:
1. `Backend/Controllers/FinancialYearController.cs` (Provider-agnostic DB access, duplicate check, range check).
2. `Backend/Database/ExportImport/ExportPackage.cs` (Add `FinancialYearScope` and `SelectedFinancialYearIds`).
3. `Backend/Database/ExportImport/DatabaseExportService.cs` (Support FY-scoping across all dependent tables).
4. `Backend/Database/ExportImport/UniversalDataMergeService.cs` (Support FY-scoping during import/merge).
5. `setup.html` (Add `+ Create New Financial Year` modal/card with From/To year dropdowns).
6. `modules/settings/henu-db-universal/henu-db-universal.html` (Add FY scope selector and dynamic FY checklist).
7. `modules/settings/henu-db-universal/henu-db-universal.js` (Export & Import FY scope handling).
8. `Backend/Program.cs` (Wire up `--verify-financial-year` CLI test suite).
9. `Backend/Database/Integrity/FinancialYearVerificationSuite.cs` (New comprehensive verification suite).

### Strictly Frozen Components:
- Accounting double-entry rules (`Total Debit == Total Credit`).
- Receipt waterfall logic (Interest -> Principal -> Advance).
- Interest calculation algorithms.
- Rounding rules (`MidpointRounding.AwayFromZero`).
- Database column names and schemas.
- Existing migration files (`V1`, `V2`, etc.).

---

## 7. Audit Conclusion
The codebase is clean, well-architected, and ready for the Financial Year Management & Financial-Year-Aware Universal Export/Import Enhancement. All changes can be implemented safely without violating any preservation rules.
