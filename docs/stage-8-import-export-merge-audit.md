# JEEVIKA ERP 2.0 — STAGE 8 ARCHITECTURAL AUDIT
## UNIVERSAL DATABASE IMPORT/EXPORT MERGE MODULE

**Project:** JEEVIKA ERP 2.0  
**Repository:** https://github.com/henu-os/JA-HCL-31  
**Developer:** HENU OS PRIVATE LIMITED  
**System Owner:** Siddharth Singh  
**Stage:** Stage 8 — Universal Database Import/Export Merge Module (Phase 1: Read-Only Audit)  
**Date:** 2026-09-21  

---

### 1. Overview & Objective

This audit evaluates the database architecture, schema constraints, identifier generation mechanisms, and existing data transfer modules of JEEVIKA ERP 2.0 to design a **Universal Database Import/Export Merge Engine**.

The merge engine must safely support:
1. **Scenario A (Empty Target Database):** Clean full import of 7 societies with all child and transaction records into a fresh database.
2. **Scenario B (Merge into Existing Database):** Merging a 7-society package from Laptop A into Laptop C (which already has 7 different societies) **without numeric ID collisions**, **without overwriting existing societies or vouchers**, and **with dynamic source-to-target foreign key remapping**.

---

### 2. Schema Analysis & Scoping Matrix

| Table Name | Primary Key | Scoped by SocietyId? | Scoped by FYId? | Natural / Business Unique Key | Dependent On (Foreign Keys) |
|---|---|---|---|---|---|
| `SocietyInfo` | `SocietyId` | N/A (Root) | No | `SocietyCode` (Global unique) | None |
| `FinancialYear` | `FYId` | Yes | N/A (Root FY) | `(SocietyId, FYLabel)` | `SocietyInfo` |
| `TxNumberConfig` | `ConfigId` | Yes | Yes | `(SocietyId, FYId, VoucherType)` | `SocietyInfo`, `FinancialYear` |
| `SocGroup` | `GroupId` | Yes | No | `(SocietyId, UPPER(GrpCode))` (Active) | `SocietyInfo` |
| `SocAccount` | `AccountId` | Yes | No | `(SocietyId, UPPER(AccCode))` (Active) | `SocietyInfo`, `SocGroup` |
| `SocMember` | `MemberId` | Yes | No | `(SocietyId, UPPER(MemCode))` (Active) | `SocietyInfo` |
| `SocVendor` | `VendorId` | Yes | No | `(SocietyId, VendorCode)` | `SocietyInfo` |
| `SocStaff` | `StaffId` | Yes | No | `(SocietyId, StaffCode)` | `SocietyInfo` |
| `SocCommittee` | `CommitteeId` | Yes | Optional | `(SocietyId, MemberName, Designation)` | `SocietyInfo`, `FinancialYear` |
| `SocBillType` | `BillTypeId` | Yes | No | `(SocietyId, BillTypeName)` | `SocietyInfo`, `SocAccount` |
| `SocBillingMatrix` | `MatrixId` | Yes | Optional | `(SocietyId, BillTypeId, MemberId, AccountCode)` | `SocietyInfo`, `SocBillType`, `SocMember` |
| `SocBillingSetting` | `SettingId` | Yes | No | `(SocietyId, BillTypeId)` | `SocietyInfo`, `SocBillType` |
| `SocOpeningBankReco` | `RecoId` | Yes | Optional | `(SocietyId, VoucherNo)` | `SocietyInfo`, `SocAccount` |
| `SocVoucherHeader` | `VoucherId` | Yes | Yes | `(SocietyId, FYId, VoucherNo)` | `SocietyInfo`, `FinancialYear` |
| `SocVoucherDetail` | `DetailId` | Via Voucher | Via Voucher | `(VoucherId, SrNo)` | `SocVoucherHeader`, `SocAccount` |
| `SocMemberBill` | `BillId` | Yes | Yes | `(SocietyId, FYId, BillNo)` | `SocietyInfo`, `FinancialYear`, `SocMember`, `SocBillType` |
| `SocMemberBillItem` | `ItemId` | Via Bill | Via Bill | `(BillId, AccountCode)` | `SocMemberBill` |
| `SocMemberNote` | `NoteId` | Yes | Yes | `(SocietyId, FYId, NoteNo)` | `SocietyInfo`, `FinancialYear`, `SocMember`, `SocMemberBill` |
| `SocOpeningBalance` | `OpenBalId` | Yes | Yes | `(SocietyId, FYId, AccountId)` | `SocietyInfo`, `FinancialYear`, `SocAccount` |
| `SocFixedDeposit` | `FDId` | Yes | Yes | `(SocietyId, FYId, FDNo)` | `SocietyInfo`, `FinancialYear`, `SocAccount` |
| `SocMemberTransfer` | `TransferId` | Yes | No | `(SocietyId, MemberId, TransferDate)` | `SocietyInfo`, `SocMember` |

---

### 3. Primary Key Generation & ID Remapping Requirements

1. **Auto-Increment / Sequence Behavior:**
   - In SQLite, primary keys use `INTEGER PRIMARY KEY AUTOINCREMENT`.
   - In PostgreSQL, primary keys use `SERIAL PRIMARY KEY` or identity sequences.
   - When Laptop A exports records with `SocietyId = 1..7`, and Laptop C already has `SocietyId = 1..7`, inserting records directly with raw numeric IDs would either fail due to primary key collisions or overwrite Laptop C's data.

2. **Source-to-Target ID Mapping Requirement:**
   The merge engine must establish in-memory lookup maps during import:
   - `Map<SourceSocietyId, TargetSocietyId>`
   - `Map<SourceFYId, TargetFYId>`
   - `Map<SourceGroupId, TargetGroupId>`
   - `Map<SourceAccountId, TargetAccountId>`
   - `Map<SourceMemberId, TargetMemberId>`
   - `Map<SourceBillTypeId, TargetBillTypeId>`
   - `Map<SourceVoucherId, TargetVoucherId>`
   - `Map<SourceBillId, TargetBillId>`

3. **Foreign Key Integrity Rewriting:**
   - When importing `SocAccount`, its `GroupId` must be remapped from `SourceGroupId` to `TargetGroupId`.
   - When importing `SocVoucherDetail`, its `VoucherId` and `AccountId` must be remapped to `TargetVoucherId` and `TargetAccountId`.
   - When importing `SocMemberBill`, its `MemberId` and `BillTypeId` must be remapped to `TargetMemberId` and `TargetBillTypeId`.

---

### 4. Import Modes & Conflict Resolution

1. **Mode 1: `EMPTY_TARGET`**
   - Condition: Target database has 0 societies.
   - Action: Direct import preserving relationships with 1:1 ID tracking or sequential target ID allocation.
   - Validation: All 7 societies, members, accounts, and balanced vouchers are validated before commit.

2. **Mode 2: `SAFE_MERGE`**
   - Condition: Target database already contains existing business data.
   - Matching Strategy:
     - Match `SocietyInfo` by `SocietyCode`. If matched, re-use existing `TargetSocietyId` (or reject/skip based on policy). If not found, insert as new society and obtain new `TargetSocietyId`.
     - Match `FinancialYear` by `(TargetSocietyId, FYLabel)`. If matched, re-use existing `TargetFYId`. If not, insert new FY under `TargetSocietyId`.
     - Match `SocGroup` by `(TargetSocietyId, UPPER(GrpCode))`.
     - Match `SocAccount` by `(TargetSocietyId, UPPER(AccCode))`.
     - Match `SocMember` by `(TargetSocietyId, UPPER(MemCode))`.
     - Match `SocVoucherHeader` by `(TargetSocietyId, TargetFYId, VoucherNo)`.
       - **Accounting Invariant Protection**: Existing vouchers marked `Audited` or `Posted` cannot be overwritten. If a voucher exists with different amount or details, it is flagged as a conflict and rejected.
   - Policies:
     - `REJECT_CONFLICTS`: Abort and rollback if any conflict or duplicate exists.
     - `SKIP_EXISTING`: Preserve existing target records; skip duplicate matching incoming records; import only non-conflicting new items.
     - `ADD_AS_NEW`: Add new non-colliding records with remapped foreign keys.

3. **Mode 3: `VALIDATE_ONLY` (Dry Run)**
   - Performs full structural validation, double-entry audit ($\text{Dr} == \text{Cr}$), checksum verification, and conflict detection with **0 database writes**.

---

### 5. Existing Implementation Status & Compatibility

- `DatabaseExportService.cs`: **IMPLEMENTED**. Generates versioned JSON packages with SHA256 checksums, stripping sensitive credentials.
- `DatabaseImportService.cs`: **PARTIALLY IMPLEMENTED**. Handles basic direct replacement; requires Universal Merge extension for dynamic ID remapping and multi-society merging.
- `DataTransferController.cs`: **IMPLEMENTED**. Exposes basic data transfer; needs extensions for `/preview`, `/validate`, `/execute`, and operation reports.
- `Frontend`: **COMPATIBLE**. Workspace sidebar supports sub-modules and drop-down groups. A new `Settings` category with `HENU DB UNIVERSAL` sub-module will be added.

---

### 6. Verification & Safety Plan

1. Build an isolated automated test suite (`--verify-import-merge`).
2. Test Scenario A: Export 7 societies -> Import into empty SQLite DB -> Verify 7 societies & relationships.
3. Test Scenario B: Merge 7 societies into a target DB already having 7 different societies -> Verify target has 14 societies with 0 collisions and zero overwritten vouchers.
4. Verify transactional rollback on constraint error.
5. Verify zero modification to accounting engine arithmetic.
