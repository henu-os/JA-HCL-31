# JEEVIKA ERP v2 — DATABASE ARCHITECTURAL REPORT (`report_db.md`)
**Database Logic, Schema Blueprint, Hardcoded Data Scraping & Production Specification**
**Modules Covered:** 14 Masters + 15 Transactions (Exclusively)
**Database Engine:** PostgreSQL 14+ | **Schema:** `jeevika_erp` | **Design Pattern:** Scoped Multi-Tenant Double-Entry ERP

---

## EXECUTIVE SUMMARY & ARCHITECTURAL FOUNDATION

This document provides the complete **Database Braining, Architecture Blueprint, and Hardcoded Data Audit** for the Jeevika ERP v2 system, focusing strictly on the **14 Master Modules** and **15 Transaction Modules**.

```
                           ┌─────────────────────────────────────────┐
                           │      SYSTEM & MULTI-TENANCY CORE        │
                           │   SoftUser  •  SocietyInfo  •  FY       │
                           └────────────────────┬────────────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
  ┌───────────────────────────────┐                             ┌───────────────────────────────┐
  │      14 MASTER MODULES        │                             │    15 TRANSACTION MODULES     │
  │  • Society Master             │                             │  • Bill / Invoice Generation  │
  │  • Group Master               │◄────────────────────────────│  • Member Receipt Entry       │
  │  • Account Master             │      Ledger & Entity        │  • Member Receipt Reversal    │
  │  • Member Master              │      Referential Link       │  • Member Debit Note          │
  │  • Bill Type & Notes Master   │                             │  • Member Credit Note         │
  │  • Billing Master             │                             │  • Bill Type Transfer         │
  │  • Opening Bank Reco          │                             │  • Other Receipt Entry        │
  │  • Opening Balances           │                             │  • Payment Entry (Voucher)    │
  │  • Bill Print Setup           │                             │  • Contra Entry               │
  │  • GST Master                 │                             │  • Journal Voucher (JV)       │
  │  • Committee Master           │                             │  • Purchase Order (PO)        │
  │  • Staff Master               │                             │  • Fixed Deposit (FD)         │
  │  • Vendor Master              │                             │  • FD Accrued Interest        │
  │  • Configuration & Notes      │                             │  • Bank Reconciliation        │
  └───────────────────────────────┘                             │  • Voucher Check (Audit)      │
                                                                └───────────────────────────────┘
```

### Core Architecture Axioms:
1. **Strict Society Scoping (`SocietyId`):** Every master and transactional table (except `SoftUser`) must contain `SocietyId INT NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE`.
2. **Financial Year Isolation (`FYId`):** All financial transactions, opening balances, voucher series, and committee tenures must be scoped by `FYId INT NOT NULL REFERENCES jeevika_erp.FinancialYear(FYId)`.
3. **Double-Entry Ledger Invariance:** All monetary transactions are recorded using header-detail pairs (`SocVoucherHeader` + `SocVoucherDetail`) where $\sum \text{Debit} = \sum \text{Credit}$, preserving accounting integrity across Real, Personal, and Nominal accounts.
4. **Soft Deletion & Audit Integrity:** Master and transaction records enforce soft deletion (`IsDeleted BOOLEAN DEFAULT FALSE`) to maintain referential integrity with historic financial ledgers.

---

## 1. COMPREHENSIVE AUDIT OF HARDCODED DATA & SCHEMA GAPS (CURRENT STATE)

Before designing the production database, here is the complete itemized inventory of hardcoded arrays, fallback static values, missing database tables, and schema inconsistencies identified across the codebase:

### 1.1 In-Memory & LocalStorage Fallbacks (No DB Persistence)
| Module | Location | Current Hardcoded / Fallback Logic | Production DB Fix Required |
| :--- | :--- | :--- | :--- |
| **Bill Print Setup** | `BillPrintSetupController.cs` | `private static object? _currentConfig = null;` & hardcoded JSON fallback in controller. | Create persistent table `SocBillPrintConfig` scoped by `SocietyId`. |
| **Bill Print Setup (UI)** | `bill-print-setup.html` | Saves to `localStorage.getItem('jeevika_bps_config')`. | Save/Load from `/api/bill-print-setup?societyId=X`. |
| **Purchase Order** | `purchase-order.js` | Falls back to `localStorage.getItem('jeevika_pos_' + sid)` when API returns empty. | Complete DB table `SocPurchaseOrder` & `SocPurchaseOrderItem` with multi-line items. |
| **FD Accrued Interest** | `fd-accrued-interest.js` | Hardcoded fallback mock banks & FDs array (e.g. "State Co-operative Bank", "FD2024/00123"). | Fetch dynamic FDs from `SocFixedDeposit` and store accruals in `SocFDInterestPosting`. |
| **Voucher Check (Audit)**| `voucher-check.js` | Stores checklist toggles (`chkNoComm`, `chkNoSupp`, etc.) in `localStorage.getItem('jeevika_voucher_check_' + sid)`. | Create audit checklist table `SocVoucherAudit` or extend `SocVoucherHeader`. |

### 1.2 Missing Tables in `Database/schema.sql` (Used in Code but Absent from Schema)
1. `jeevika_erp.SocMemberBillItem`: Used in `MemberBillController.cs` (lines 157, 204) for bill head line items, but missing from primary `schema.sql`.
2. `jeevika_erp.SocGSTRate`: Used in `GstController.cs` (lines 28, 68) for GST rate lookup, but missing from `schema.sql`.
3. `jeevika_erp.SocBillPrintConfig`: Missing completely; uses in-memory C# static variable.
4. `jeevika_erp.SocGeneralConfig`: General toggles (Manual mode per module, Auto-select bill, Cash/Bank in JV, PO mode in Payment) currently stored in client JS objects without persistent schema.
5. `jeevika_erp.SocGroupVisibilityConfig`: Account group visibility configuration per module (Other Receipt, Payment Entry, PO) is client-side only.

### 1.3 Schema Discrepancies & Duplicate Table Definitions in `schema.sql`
- **Duplicate `SocBillType` Table:** Defined twice in `schema.sql` (Line 297 and Line 575) with differing column structures.
- **Duplicate `SocOpeningBankReco` Table:** Defined twice in `schema.sql` (Line 333 and Line 454) with conflicting column names (`UnclearedAmount, ChequeNo` vs `ChqNo, Amount`).
- **Column Name Mismatch in Reversal Controller:** `MemberReceiptReversalController.cs` queries `SocMemberBill` with `WHERE VoucherNo = @billNo`, but `SocMemberBill` only contains `BillNo`. This triggers runtime SQL errors.
- **Data Truncation in Controllers:** `PurchaseOrderController.cs`, `MemberBillTypeTransferController.cs`, and `PaymentEntryController.cs` discard sub-items, transfer source/destination pairs, and line-item breakdowns upon saving.

### 1.4 Hardcoded Dropdowns & Static System Lookups in HTML/JS
| Module | Hardcoded Elements in Code | Target Dynamic Master / System Enum |
| :--- | :--- | :--- |
| **Society Master** | Area Types (`RERA, MOFA, CIDCO, MHADA, SRA, MMRDA`), Units (`Sq.Ft, Sq.Mtr`), Categories (`Carpet, Built-up, Super built-up`) | System Lookup Constants / `AreaType` Enum |
| **Group Master** | 34 Hardcoded Chart of Accounts Groups (`AS-01` to `EX-04`) | Seeded via Database Migration `seed.sql` into `SocGroup` |
| **Account Master** | 46 Hardcoded Standard Ledgers (`INC-1001` to `LIA-1999`) | Seeded via Database Migration `seed.sql` into `SocAccount` |
| **Member Master** | Flat Types (`1BHK, 2BHK, 3BHK, Shop, Office, Penthouse`), Member Types (`Owner, Associate, Nominee, Tenant`), Lien Statuses (`None, Active, Released, Foreclosed`) | System Lookup Enums in PostgreSQL DDL |
| **Bill Type Master** | Bill Calculation Methods (`Monthly, Bi-Monthly, Quarterly, Half-Yearly, Annually`), Interest Methods (`M-CM, Daily, Simple, Compound`) | Validated ENUM columns in `SocBillTypeNote` |
| **Voucher Numbering** | Default Prefixes (`PV, RV, JV, CV, OR, MBIL, PO, REV, TR, DN, CN`) in `config-notes-master.html` | Seeded in `TxNumberConfig` table per society & FY |

---

## 2. THE 14 MASTER MODULES — DATABASE SPECIFICATION & BUSINESS LOGIC

```
                                  MASTER MODULES RELATIONSHIP
  
                               ┌─────────────────────────────┐
                               │   jeevika_erp.SocietyInfo   │
                               └──────────────┬──────────────┘
                                              │
         ┌──────────────────┬─────────────────┼──────────────────┬──────────────────┐
         ▼                  ▼                 ▼                  ▼                  ▼
  ┌──────────────┐   ┌──────────────┐  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │FinancialYear │   │   SocGroup   │  │  SocMember   │   │  SocVendor   │   │   SocStaff   │
  └──────┬───────┘   └──────┬───────┘  └──────┬───────┘   └──────────────┘   └──────────────┘
         │                  │                 │
         │                  ▼                 ▼
         │           ┌──────────────┐  ┌────────────────────────────────────────────────────────┐
         │           │  SocAccount  │  │ SocMemberTransfer, SocMemberLien, SocMemberTenant,     │
         │           └──────┬───────┘  │ SocMemberNominee, SocMemberBillOverride                │
         │                  │          └────────────────────────────────────────────────────────┘
         ▼                  ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │ SocBillType • SocBillTypeHead • SocBillTypeNote • SocBillingMatrix • SocBillingSetting  │
  │ SocOpeningBalance • SocOpeningBankReco • SocBillPrintConfig • SocGeneralConfig          │
  └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Master Module 1: Society Master
- **Directory / Files:** `modules/master/society-master/` (`society-master.html`, `.js`, `.css`)
- **Backend Controller:** `SocietyController.cs`, `FinancialYearController.cs`
- **Purpose:** Central tenant profile defining society registration, banking, tax registrations, office bearers, communication flags, and area configurations.

#### Database Table: `jeevika_erp.SocietyInfo`
| Column Name | Data Type | Constraints / Default | Description & Business Rules |
| :--- | :--- | :--- | :--- |
| `SocietyId` | `SERIAL` | `PRIMARY KEY` | Unique Society Identifier (Tenant ID). |
| `SocietyCode` | `VARCHAR(50)` | `NOT NULL UNIQUE` | Unique alphanumeric code (e.g., `SRS001`). |
| `SocietyName` | `VARCHAR(255)`| `NOT NULL` | Registered English name of the cooperative housing society. |
| `SocMarName` | `VARCHAR(255)`| `NULL` | Marathi / Regional language society name for bilingual reporting. |
| `StartingYear`| `VARCHAR(20)` | `DEFAULT '2025-2026'` | The initial accounting year of onboarding. |
| `Address` | `TEXT` | `NULL` | Complete physical street address. |
| `City` | `VARCHAR(100)`| `NULL` | City location (e.g., Mumbai, Pune). |
| `Pincode` | `VARCHAR(20)` | `NULL` | Postal PIN code. |
| `Phone` | `VARCHAR(50)` | `NULL` | Primary society landline / contact number. |
| `Email` | `VARCHAR(100)`| `NULL` | Official society email address for bill dispatches. |
| `RegistrationNo`| `VARCHAR(100)`| `NULL` | Cooperative Societies Act Registration Number. |
| `PANNumber` | `VARCHAR(20)` | `NULL` | Permanent Account Number of Society (10 characters). |
| `TAN` | `VARCHAR(20)` | `NULL` | Tax Deduction and Collection Account Number (10 characters). |
| `PTNo` | `VARCHAR(50)` | `NULL` | Professional Tax Registration Number. |
| `UIDNumber` | `VARCHAR(50)` | `NULL` | UDYAM / Central Society UID Number. |
| `AreaType` | `VARCHAR(50)` | `DEFAULT 'RERA'` | Area authority basis: `RERA`, `MOFA`, `CIDCO`, `MHADA`, `SRA`, `MMRDA`. |
| `AreaCategory`| `VARCHAR(50)` | `DEFAULT 'Carpet'` | Measurement category: `Carpet`, `Build up`, `Super build up`. |
| `AreaUnit` | `VARCHAR(20)` | `DEFAULT 'Sq.Ft'` | Unit of measurement: `Sq.Ft`, `Sq.Mtr`. |
| `GSTApplicable`| `BOOLEAN` | `DEFAULT FALSE` | Global GST activation toggle for the society. |
| `GSTNumber` | `VARCHAR(50)` | `NULL` | 15-digit GSTIN (e.g. `27AABCS1234D1Z5`). |
| `HSNCode` | `VARCHAR(50)` | `DEFAULT '999598'` | SAC / HSN Code for Housing Society Maintenance Services. |
| `CGSTCode` | `VARCHAR(50)` | `DEFAULT 'LIA-1032'` | Account code for Central GST liability ledger. |
| `SGSTCode` | `VARCHAR(50)` | `DEFAULT 'LIA-1033'` | Account code for State GST liability ledger. |
| `CGSTPct` | `NUMERIC(5,2)`| `DEFAULT 9.00` | CGST percentage rate (Standard: 9.00%). |
| `SGSTPct` | `NUMERIC(5,2)`| `DEFAULT 9.00` | SGST percentage rate (Standard: 9.00%). |
| `IntDuesGST` | `VARCHAR(50)` | `DEFAULT 'No'` | Whether GST applies to interest on delayed dues (`Yes`/`No`). |
| `ExemptLimit` | `NUMERIC(18,2)`| `DEFAULT 7500.00`| Monthly maintenance exemption ceiling per member (₹7,500). |
| `ExemptAmount`| `NUMERIC(18,2)`| `DEFAULT 7500.00`| Taxable threshold deduction amount. |
| `ChairmanName`| `VARCHAR(100)`| `NULL` | Primary Chairman name. |
| `SecretaryName`| `VARCHAR(100)`| `NULL` | Primary Secretary name. |
| `TreasurerName`| `VARCHAR(100)`| `NULL` | Primary Treasurer name. |
| `HonChairman` | `VARCHAR(100)`| `NULL` | Honorary Chairman signature label for bill prints. |
| `HonSecretary`| `VARCHAR(100)`| `NULL` | Honorary Secretary signature label for bill prints. |
| `HonTreasurer`| `VARCHAR(100)`| `NULL` | Honorary Treasurer signature label for bill prints. |
| `CommWhatsApp`| `CHAR(1)` | `DEFAULT 'N'` | WhatsApp notification dispatch flag (`Y`/`N`). |
| `CommSMS` | `CHAR(1)` | `DEFAULT 'N'` | SMS dispatch flag (`Y`/`N`). |
| `CommEmail` | `CHAR(1)` | `DEFAULT 'N'` | Email dispatch flag (`Y`/`N`). |
| `BankName` | `VARCHAR(100)`| `NULL` | Society Primary Operating Bank Name. |
| `BankAccountNo`| `VARCHAR(50)`| `NULL` | Primary Bank Account Number. |
| `BankBranch` | `VARCHAR(100)`| `NULL` | Bank Branch Name. |
| `IFSCCode` | `VARCHAR(20)` | `NULL` | Bank IFSC Code. |
| `LogoPath` | `TEXT` | `NULL` | File path / Base64 image of Society Crest / Logo. |
| `StampPath` | `TEXT` | `NULL` | File path / Base64 image of Society Stamp / Seal. |
| `ShareCapitalDesc`| `VARCHAR(255)`| `NULL` | Authorised share capital label (e.g. "4000 Shares of Rs. 50/-"). |
| `ShareCapitalAmt` | `NUMERIC(18,2)`| `DEFAULT 0` | Authorised share capital monetary total (₹). |
| `IsActive` | `BOOLEAN` | `DEFAULT TRUE` | Soft active status. |
| `CreatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp. |
| `UpdatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record modification timestamp. |

#### Database Table: `jeevika_erp.FinancialYear`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `FYId` | `SERIAL` | `PRIMARY KEY` | Financial Year Unique ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Tenant society reference. |
| `FYLabel` | `VARCHAR(20)` | `NOT NULL` | FY string representation (e.g. `2025-26`). |
| `FYStart` | `DATE` | `NOT NULL` | Fiscal year start date (e.g. `2025-04-01`). |
| `FYEnd` | `DATE` | `NOT NULL` | Fiscal year end date (e.g. `2026-03-31`). |
| `IsActive` | `BOOLEAN` | `DEFAULT TRUE` | Currently active operating FY for the society. |
| `IsClosed` | `BOOLEAN` | `DEFAULT FALSE` | Closed / Audited year lock (prevents retroactive edits). |

---

### Master Module 2: Group Master (Chart of Accounts Groups)
- **Directory / Files:** `modules/master/group-master/` (`group-master.html`, `.js`, `.css`)
- **Backend Controller:** `GroupController.cs`
- **Purpose:** Manages the hierarchical Chart of Accounts (Assets, Liabilities, Income, Expenditure).

#### Database Table: `jeevika_erp.SocGroup`
| Column Name | Data Type | Constraints / Default | Description & Accounting Logic |
| :--- | :--- | :--- | :--- |
| `GroupId` | `SERIAL` | `PRIMARY KEY` | Account Group ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Scoped to active society. |
| `GrpCode` | `VARCHAR(50)` | `NOT NULL` | Unique Group Code (e.g. `AS-01`, `LI-03`, `IN-01`, `EX-02`). |
| `GrpName` | `VARCHAR(255)`| `NOT NULL` | Account Group Name (e.g. "Maintenance & Service Charges"). |
| `GrpMarName` | `VARCHAR(255)`| `NULL` | Marathi Name for Marathi Balance Sheet / P&L. |
| `GrpMainId` | `INT` | `NOT NULL` | `1` = Asset, `2` = Liability, `3` = Income, `4` = Expenditure. |
| `GrpPrimaryId`| `INT` | `REFERENCES SocGroup(GroupId)` | Self-referencing parent group ID for nested hierarchies. |
| `GrpPrimaryName`| `VARCHAR(255)`| `NULL` | Denormalized parent group name. |
| `GrpType` | `INT` | `DEFAULT 1` | `1` = User Created, `2` = System Default (Protected). |
| `GrpSubtotal` | `BOOLEAN` | `DEFAULT FALSE` | Group subtotal display flag on financial statements. |
| `IsDeleted` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete flag. |
| `CreatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp. |

---

### Master Module 3: Account Master (General Ledger Accounts)
- **Directory / Files:** `modules/master/account-master/` (`account-master.html`, `.js`, `.css`)
- **Backend Controller:** `AccountController.cs`
- **Purpose:** Defines every General Ledger account head with its default Dr/Cr classification, parent group, opening balances, depreciation, and TDS settings.

#### Database Table: `jeevika_erp.SocAccount`
| Column Name | Data Type | Constraints / Default | Description & Accounting Logic |
| :--- | :--- | :--- | :--- |
| `AccountId` | `SERIAL` | `PRIMARY KEY` | Ledger Account Unique ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Scoped to active society. |
| `AccCode` | `VARCHAR(50)` | `NOT NULL` | Unique Account Code (e.g. `INC-1001`, `EXP-1010`, `ASS-1001`). |
| `AccName` | `VARCHAR(255)`| `NOT NULL` | Ledger Name (e.g. "Property Tax", "Cash in Hand"). |
| `AccMarName` | `VARCHAR(255)`| `NULL` | Marathi Ledger Title for statutory reports. |
| `AccBSName` | `VARCHAR(255)`| `NULL` | Alternate Balance Sheet presentation title. |
| `GroupId` | `INT` | `NOT NULL REFERENCES SocGroup(GroupId)` | Parent Group Link. |
| `GrpMainId` | `INT` | `NOT NULL` | `1`=Asset, `2`=Liability, `3`=Income, `4`=Expenditure. |
| `OpBal` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Opening Balance amount for the foundation year. |
| `OpDrCr` | `VARCHAR(5)` | `DEFAULT 'Dr'` | Opening Debit/Credit direction (`Dr` / `Cr`). |
| `PrBal` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Previous Year Balance. |
| `PrDrCr` | `VARCHAR(5)` | `DEFAULT 'Dr'` | Previous Year Debit/Credit direction. |
| `ClBal` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Current Closing Balance (dynamically computed or snapshot). |
| `DepAnnual` | `NUMERIC(5,2)`| `DEFAULT 0.00` | Annual Depreciation rate percentage (for Fixed Assets). |
| `DepHalf` | `NUMERIC(5,2)`| `DEFAULT 0.00` | Half-Yearly Depreciation rate percentage. |
| `AccAddress` | `TEXT` | `NULL` | Party address (if account is a debtor/creditor). |
| `AccPAN` | `VARCHAR(50)` | `NULL` | Party PAN number. |
| `AccTAN` | `VARCHAR(50)` | `NULL` | Party TAN number. |
| `GSTIN` | `VARCHAR(50)` | `NULL` | Party GST Identification Number. |
| `Mobile` | `VARCHAR(50)` | `NULL` | Primary Mobile contact. |
| `Email` | `VARCHAR(100)`| `NULL` | Primary Email. |
| `TdsRate` | `NUMERIC(5,2)`| `DEFAULT 0.00` | Applicable TDS rate deduction percentage. |
| `TdsSection` | `VARCHAR(50)` | `NULL` | Income Tax TDS Section (e.g. `194C`, `194J`, `194I`). |
| `IsDefault` | `BOOLEAN` | `DEFAULT FALSE` | System default accounts cannot be deleted. |
| `IsDeleted` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete flag. |
| `CreatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp. |

---

### Master Module 4: Member Master (Flat & Co-Owner Registry)
- **Directory / Files:** `modules/master/member-master/` (`member-master.html`, `.js`, `.css`)
- **Backend Controller:** `MemberController.cs`
- **Purpose:** Comprehensive flat/unit member directory managing unit ownership, 5 joint owners, parking allocations, lien markings, tenant lease rosters, nominee registry, and transfer history.

#### Database Table: `jeevika_erp.SocMember`
| Column Name | Data Type | Constraints / Default | Description & Business Rules |
| :--- | :--- | :--- | :--- |
| `MemberId` | `SERIAL` | `PRIMARY KEY` | Member Unique Primary Key. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society isolation. |
| `MemCode` | `VARCHAR(50)` | `NOT NULL` | Unique Member Code (e.g. `M-A-101`). |
| `MemName` | `VARCHAR(255)`| `NOT NULL` | Primary Member Name (Person 1 / First Owner). |
| `MemName2` | `VARCHAR(255)`| `NULL` | Joint Owner 2 Name. |
| `MemName3` | `VARCHAR(255)`| `NULL` | Joint Owner 3 Name. |
| `MemName4` | `VARCHAR(255)`| `NULL` | Joint Owner 4 Name. |
| `MemName5` | `VARCHAR(255)`| `NULL` | Joint Owner 5 Name. |
| `MemMarName` | `VARCHAR(255)`| `NULL` | Marathi Name of Member for statutory registers. |
| `Building` | `VARCHAR(50)` | `NULL` | Building Name / Number. |
| `Wing` | `VARCHAR(50)` | `NULL` | Wing Identifier (e.g. `A`, `B`, `East Wing`). |
| `FlatNo` | `VARCHAR(50)` | `NOT NULL` | Flat / Unit Number (e.g. `101`, `G-02`). |
| `Floor` | `VARCHAR(50)` | `NULL` | Floor Number (e.g. `1st Floor`). |
| `FlatType` | `VARCHAR(50)` | `DEFAULT '2BHK'` | Unit type: `1BHK`, `2BHK`, `3BHK`, `Shop`, `Office`, `Row House`. |
| `UnitNo` | `VARCHAR(50)` | `NULL` | Municipal / Property Assessment Unit Number. |
| `AreaSqft` | `NUMERIC(10,2)`| `DEFAULT 0.00` | Measurable area for Sq.Ft.-based maintenance calculation. |
| `AreaType` | `VARCHAR(50)` | `DEFAULT 'RERA'` | Area Standard basis (`RERA`, `MOFA`, etc.). |
| `AreaCategory`| `VARCHAR(50)` | `DEFAULT 'Carpet'` | `Carpet`, `Built up`, `Super built up`. |
| `AreaUnit` | `VARCHAR(20)` | `DEFAULT 'Sq.Ft'` | `Sq.Ft`, `Sq.Mtr`. |
| `ContactNo` | `VARCHAR(50)` | `NULL` | Primary Mobile Number (used for WhatsApp/SMS billing). |
| `Email` | `VARCHAR(100)`| `NULL` | Member Email Address for e-Invoicing. |
| `PANNo` | `VARCHAR(20)` | `NULL` | Member PAN Number. |
| `EntryDate` | `DATE` | `NULL` | Admission date into society membership. |
| `MemberType` | `VARCHAR(50)` | `DEFAULT 'Owner'` | `Owner`, `Associate`, `Nominee`, `Tenant`. |
| `Shares` | `INT` | `DEFAULT 5` | Number of society shares held (Standard: 5 shares). |
| `ShareCertNo` | `VARCHAR(50)` | `NULL` | Share Certificate Number. |
| `FolioNo` | `VARCHAR(50)` | `NULL` | Member Ledger Folio Number. |
| `ShareFromNo` | `INT` | `DEFAULT 0` | Distinctive Share Number From. |
| `ShareToNo` | `INT` | `DEFAULT 0` | Distinctive Share Number To. |
| `NonOccApplicable`| `VARCHAR(10)`| `DEFAULT 'No'` | Non-Occupancy Charges Applicable flag (`Yes`/`No`). |
| `NonOccReason`| `VARCHAR(100)`| `NULL` | Reason (e.g. `Rented out to Tenant`, `Vacant`). |
| `TenantName` | `VARCHAR(255)`| `NULL` | Current Active Tenant Name. |
| `TenantContact`| `VARCHAR(50)`| `NULL` | Active Tenant Contact Number. |
| `ParkingSlot2W`| `VARCHAR(50)`| `NULL` | Two-Wheeler Allocated Slot Number (e.g. `2W-14`). |
| `ParkingSlot4W`| `VARCHAR(50)`| `NULL` | Four-Wheeler Allocated Slot Number (e.g. `4W-05`). |
| `VehicleNo2W` | `VARCHAR(50)` | `NULL` | Two-Wheeler Vehicle Registration Number. |
| `VehicleNo4W` | `VARCHAR(50)` | `NULL` | Four-Wheeler Vehicle Registration Number. |
| `LienBankName`| `VARCHAR(255)`| `NULL` | Bank holding mortgage lien (if flat financed). |
| `LienLoanNo` | `VARCHAR(100)`| `NULL` | Housing Loan Account Number. |
| `LienAmount` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Sanctioned mortgage loan amount. |
| `LienStatus` | `VARCHAR(50)` | `DEFAULT 'None'` | `None`, `Active`, `NOC Issued`, `Released`. |
| `IsTransferred`| `VARCHAR(10)`| `DEFAULT 'No'` | Has membership been transferred (`Yes`/`No`). |
| `TransferDate`| `DATE` | `NULL` | Date of ownership transfer. |
| `TransfereeName`| `VARCHAR(255)`| `NULL` | Name of new buyer / transferee. |
| `OpPrincipal` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Opening Arrears Principal Dues. |
| `OpInterest` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Opening Arrears Simple Interest Dues. |
| `IsDeleted` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete flag. |
| `CreatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp. |

#### Child Tables of Member Master:
1. **`SocMemberTransfer`** (Historical Ownership Audit Log):
   - Columns: `TransferId (PK), SocietyId (FK), MemberId (FK), TransferDate, TransferType ('Sale','Gift Deed','Inheritance'), MeetingType ('MCM','AGM'), MeetingDate, ResolutionNo, TransferNo, RegNoTransferor, RegNoTransferee, TransferorName, TransfereeName, Remarks, OldOwnerSnapshot (JSONB), CreatedAt`.
2. **`SocMemberLien`** (Bank Mortgage & Loan Register):
   - Columns: `LienId (PK), SocietyId (FK), MemberId (FK), BankName, BankAddress, LoanAmount, PeriodYears, MeetingDate, ResolutionNo, SanctionDate, NocDate, CancelDate, Status ('Active','Released'), IsArchived, CreatedAt`.
3. **`SocMemberTenant`** (Tenant Police Verification & Lease Roster):
   - Columns: `TenantId (PK), SocietyId (FK), MemberId (FK), TenantName, FamilyCount, FamilyNames, PrimaryMobile, SecondaryMobile, AgreementAssignBetween, PeriodFrom, PeriodTo, AgreementIndexVerify, TenantAadharVerify, PoliceVerifyLetter, Status, CreatedAt`.
4. **`SocMemberNominee`** (Nomination Registry):
   - Columns: `NomineeId (PK), SocietyId (FK), MemberId (FK), NomineeName, Relationship, SharePct, DOB, AgeCategory ('Major','Minor'), RcvDate, MeetingType, MeetingDate, ResolutionNo, Address, Status, CreatedAt`.
5. **`SocMemberBillOverride`** (Flat-Specific Maintenance Head Overrides):
   - Columns: `OverrideId (PK), SocietyId (FK), MemberId (FK), LedgerName, StandardAmount, OverrideAmount, IsExempted, CreatedAt`.

---

### Master Module 5: Bill Type & Notes Master
- **Directory / Files:** `modules/master/bill-type-master/` (`bill-type-master.html`, `.js`, `.css`)
- **Backend Controller:** `BillTypeController.cs`
- **Purpose:** Configures distinct billing categories (e.g., Maintenance, Sinking Fund, Festival Bill, Construction Surcharge), associated ledger heads, billing frequencies, payment grace days, and 8 standard bill notes.

#### Database Table: `jeevika_erp.SocBillType`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `BillTypeId` | `SERIAL` | `PRIMARY KEY` | Bill Type ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `BillTypeCode`| `VARCHAR(50)` | `DEFAULT 'MAINT'` | Code (e.g. `MAINT`, `WATER`, `SINK`). |
| `BillTypeName`| `VARCHAR(100)`| `NOT NULL` | Name (e.g. "Maintenance Bill", "Supplementary Bill"). |
| `Description` | `VARCHAR(255)`| `NULL` | Purpose description. |
| `IsActive` | `BOOLEAN` | `DEFAULT TRUE` | Active billing category. |
| `CreatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp. |

#### Database Table: `jeevika_erp.SocBillTypeHead` (Line Heads in Bill Type)
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `HeadId` | `SERIAL` | `PRIMARY KEY` | Line item head ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society reference. |
| `BillTypeId` | `INT` | `NOT NULL REFERENCES SocBillType(BillTypeId) ON DELETE CASCADE` | Parent Bill Type. |
| `SrNo` | `INT` | `DEFAULT 1` | Display sequence order on bill. |
| `AccountId` | `INT` | `REFERENCES SocAccount(AccountId)` | Target Income Ledger Account. |
| `AccountCode`| `VARCHAR(50)` | `NOT NULL` | Account code (e.g. `INC-1004`). |
| `AccountName`| `VARCHAR(255)`| `NOT NULL` | Head Title (e.g. "Service Charges"). |
| `GSTApplicable`| `BOOLEAN` | `DEFAULT FALSE` | Does GST apply to this specific head? |
| `GSTExempted`| `BOOLEAN` | `DEFAULT FALSE` | Explicit exemption from GST computation. |

#### Database Table: `jeevika_erp.SocBillTypeNote` (Terms, Rules & Bank QR)
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `NoteId` | `SERIAL` | `PRIMARY KEY` | Note configuration ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society reference. |
| `BillTypeId` | `INT` | `NOT NULL REFERENCES SocBillType(BillTypeId) ON DELETE CASCADE` | Associated Bill Type. |
| `Note1` to `Note8`| `TEXT` | `NULL` | Standard Note lines 1 to 8 displayed on printed bills. |
| `BankName` | `TEXT` | `NULL` | Bank Name printed on bill for cheque remittance. |
| `AccountNo` | `TEXT` | `NULL` | Account number printed on bill. |
| `IFSCCode` | `TEXT` | `NULL` | IFSC code. |
| `AccountType`| `VARCHAR(50)` | `DEFAULT 'saving'` | Bank account type (`saving`, `current`). |
| `UPINote` | `TEXT` | `NULL` | UPI ID string (e.g. `society@upi`) for QR generation. |
| `DynamicQR` | `BOOLEAN` | `DEFAULT FALSE` | Generate dynamic QR encoding exact bill amount & bill no. |
| `InterestMethod`| `VARCHAR(50)`| `DEFAULT 'M-CM'` | `M-CM` (Month-to-Month Simple), `Daily`, `Annual`. |
| `InterestRate`| `VARCHAR(50)` | `DEFAULT '21%'` | Bylaw standard interest rate on overdue payments (e.g. 21% p.a.). |
| `InterestType`| `VARCHAR(50)` | `DEFAULT 'Simple'` | `Simple` or `Compound`. |
| `GrossDays` | `VARCHAR(50)` | `DEFAULT '15'` | Payment grace period days before interest starts. |
| `InterestPriority`| `VARCHAR(50)`| `DEFAULT 'Interest First'` | Receipt settlement priority: `Interest First` vs `Principal First`. |
| `BillMethod` | `VARCHAR(50)` | `DEFAULT 'Monthly'` | `Monthly`, `Bi-Monthly`, `Quarterly`. |
| `BillDate` | `VARCHAR(50)` | `DEFAULT '01'` | Default day of month for bill generation (e.g. 1st). |
| `BillDue` | `VARCHAR(50)` | `DEFAULT '15'` | Default day of month for bill due date (e.g. 15th). |

---

### Master Module 6: Billing Master (Flat Matrix & Rate Setting)
- **Directory / Files:** `modules/master/billing-master/` (`billing-master.html`, `.js`, `.css`)
- **Backend Controller:** `BillingMasterController.cs`
- **Purpose:** Stores the multi-dimensional billing matrix ($Member \times BillHead \rightarrow Amount$) and formula settings for automated batch billing.

#### Database Table: `jeevika_erp.SocBillingMatrix`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `MatrixId` | `SERIAL` | `PRIMARY KEY` | Matrix row ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `REFERENCES FinancialYear(FYId)` | Applicable Financial Year. |
| `BillTypeId` | `INT` | `NOT NULL REFERENCES SocBillType(BillTypeId) ON DELETE CASCADE` | Bill Type. |
| `MemberId` | `INT` | `NOT NULL REFERENCES SocMember(MemberId) ON DELETE CASCADE` | Flat/Member. |
| `AccountCode`| `VARCHAR(50)` | `NOT NULL` | Ledger Account Code (e.g. `INC-1004`). |
| `Amount` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Fixed charge amount for this member and head. |
| `UpdatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Matrix update timestamp. |
| `UNIQUE` | `(SocietyId, BillTypeId, MemberId, AccountCode)` | Unique constraint per member head. |

#### Database Table: `jeevika_erp.SocBillingSetting`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `SettingId` | `SERIAL` | `PRIMARY KEY` | Setting ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `BillTypeId` | `INT` | `NOT NULL REFERENCES SocBillType(BillTypeId) ON DELETE CASCADE` | Bill Type. |
| `GSTCalc` | `VARCHAR(20)` | `DEFAULT 'MANUAL'` | Calculation mode: `MANUAL` vs `AUTO`. |
| `InterestCalc`| `VARCHAR(20)` | `DEFAULT 'MANUAL'` | Interest calculation mode: `MANUAL` vs `AUTO`. |
| `FormulaType` | `VARCHAR(50)` | `DEFAULT 'FLAT_RATE'` | `FLAT_RATE`, `PER_SQFT`, `SLAB_BASED`. |

---

### Master Module 7: Opening Bank Reco Master
- **Directory / Files:** `modules/master/opening-bank-reco/` (`opening-bank-reco.html`, `.js`, `.css`)
- **Backend Controller:** `OpeningBankRecoController.cs`
- **Purpose:** Captures historic uncleared cheques issued or received prior to software migration date for opening bank reconciliation.

#### Database Table: `jeevika_erp.SocOpeningBankReco`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `RecoId` | `SERIAL` | `PRIMARY KEY` | Bank Reco record ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `REFERENCES FinancialYear(FYId)` | Financial year of opening reco. |
| `VoucherNo` | `VARCHAR(50)` | `NOT NULL` | Opening reference voucher number. |
| `VoucherDate`| `DATE` | `NOT NULL` | Date cheque was written / deposited. |
| `AccountId` | `INT` | `REFERENCES SocAccount(AccountId)` | Bank Ledger Account ID. |
| `BankName` | `VARCHAR(255)`| `NOT NULL` | Bank Account Name. |
| `UnclearedAmount`| `NUMERIC(18,2)`| `NOT NULL DEFAULT 0.00`| Uncleared cheque value (₹). |
| `ChequeNo` | `VARCHAR(50)` | `NULL` | Cheque / Instrument number. |
| `ChequeDate` | `DATE` | `NULL` | Cheque instrument date. |
| `BillRefNo` | `VARCHAR(50)` | `NULL` | Associated reference bill number. |
| `PaidTo` | `VARCHAR(255)`| `NULL` | Payee / Drawer party name. |
| `Narration` | `TEXT` | `NULL` | Remarks / Reason for un-clearance. |
| `IsCleared` | `BOOLEAN` | `DEFAULT FALSE` | Reconciled / Cleared flag. |
| `ClearedDate`| `DATE` | `NULL` | Bank clearance date (when reconciled). |
| `CreatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp. |

---

### Master Module 8: Opening Balances Master
- **Directory / Files:** `modules/master/opening-balances/` (`opening-balances.html`, `.js`, `.css`)
- **Backend Controller:** `OpeningBalanceController.cs`
- **Purpose:** Manages Trial Balance opening balances for every Ledger account as of the beginning of the initial financial year.

#### Database Table: `jeevika_erp.SocOpeningBalance`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `OpenBalId` | `SERIAL` | `PRIMARY KEY` | Opening balance row ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `NOT NULL REFERENCES FinancialYear(FYId)` | Financial Year scoping. |
| `AccountId` | `INT` | `NOT NULL REFERENCES SocAccount(AccountId)` | Ledger Account ID. |
| `OpenBal` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Absolute opening balance amount. |
| `DrCr` | `VARCHAR(5)` | `DEFAULT 'Dr'` | Opening Direction (`Dr` / `Cr`). |
| `EntryDate` | `DATE` | `DEFAULT NOW()` | Date of opening balance entry. |
| `UNIQUE` | `(SocietyId, FYId, AccountId)` | Enforces single opening balance per account per FY. |

---

### Master Module 9: Bill Print Setup Master
- **Directory / Files:** `modules/master/bill-print-setup/` (`bill-print-setup.html`, `.js`, `.css`)
- **Backend Controller:** `BillPrintSetupController.cs`
- **Purpose:** Configures visual layout, print formats, signature titles, headers, and section toggles for invoice printing.

#### Database Table: `jeevika_erp.SocBillPrintConfig` *(New Production Table)*
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `ConfigId` | `SERIAL` | `PRIMARY KEY` | Configuration ID. |
| `SocietyId` | `INT` | `NOT NULL UNIQUE REFERENCES SocietyInfo(SocietyId)` | Society scoped. |
| `Format` | `VARCHAR(50)` | `DEFAULT 'G01'` | Layout format: `G01` (Half Page), `G02` (Full Page), `GST`, `Receipt`, `Thermal`. |
| `Heading` | `VARCHAR(100)`| `DEFAULT 'MAINTENANCE BILL'` | Main Invoice Title. |
| `PrintBldg` | `BOOLEAN` | `DEFAULT TRUE` | Print Building / Wing title toggle. |
| `PrintSrNo` | `BOOLEAN` | `DEFAULT TRUE` | Show serial numbers on bill line items. |
| `NewPageEach`| `BOOLEAN` | `DEFAULT FALSE` | Force page-break after each flat's bill. |
| `ShowArrearsBifurcation`| `BOOLEAN`| `DEFAULT TRUE`| Split arrears into Principal and Interest columns. |
| `ShowBlankReceipt`| `BOOLEAN` | `DEFAULT FALSE` | Append blank tear-off receipt slip at bottom. |
| `BlankAccountHead`| `BOOLEAN` | `DEFAULT FALSE` | Hide zero-amount account heads. |
| `QRCodeType` | `VARCHAR(50)` | `DEFAULT 'upi'` | `none`, `upi`, `payment`, `dynamic`. |
| `SignType` | `VARCHAR(50)` | `DEFAULT 'sig'` | `none`, `sig` (Signature), `stamp` (Digital Stamp), `seal` (Crest Seal). |
| `UpdatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last modified timestamp. |

---

### Master Module 10: GST Master
- **Directory / Files:** `modules/master/gst-master/` (`gst-master.html`, `.js`, `.css`)
- **Backend Controller:** `GstMasterController.cs`, `GstController.cs`
- **Purpose:** Manages society GST threshold settings, SAC/HSN codes, statutory exemption limits (₹7,500/month), and tax slab rates.

#### Database Table: `jeevika_erp.SocGSTRate` *(New Production Table)*
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `GSTRateId` | `SERIAL` | `PRIMARY KEY` | Rate Slab ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society reference. |
| `GSTCode` | `VARCHAR(50)` | `NULL` | GST Code (e.g. `GST-18`, `GST-05`, `EXEMPT`). |
| `GSTName` | `VARCHAR(100)`| `NOT NULL` | Slab Name (e.g. "Standard GST 18%", "Exempted Services"). |
| `CGSTRate` | `NUMERIC(5,2)`| `DEFAULT 9.00` | Central GST Percentage. |
| `SGSTRate` | `NUMERIC(5,2)`| `DEFAULT 9.00` | State GST Percentage. |
| `IGSTRate` | `NUMERIC(5,2)`| `DEFAULT 18.00`| Integrated GST Percentage. |
| `IsDeleted` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete flag. |

---

### Master Module 11: Committee Master (Managing Committee Directory)
- **Directory / Files:** `modules/master/committee-master/` (`committee-master.html`, `.js`, `.css`)
- **Backend Controller:** `CommitteeController.cs`
- **Purpose:** Maintains official roster of elected Managing Committee office bearers for statutory election audits and signing authority validity.

#### Database Table: `jeevika_erp.SocCommittee`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `CommitteeId`| `SERIAL` | `PRIMARY KEY` | Committee member ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `REFERENCES FinancialYear(FYId)` | Tenure Financial Year. |
| `MemberName` | `VARCHAR(255)`| `NOT NULL` | Full Name of Committee Member. |
| `Designation`| `VARCHAR(100)`| `NOT NULL` | `Chairman`, `Secretary`, `Treasurer`, `Executive Member`. |
| `FromDate` | `DATE` | `NULL` | Term Start Date. |
| `ToDate` | `DATE` | `NULL` | Term Expiry Date. |
| `ContactNo` | `VARCHAR(50)` | `NULL` | Mobile Phone Number. |
| `Email` | `VARCHAR(100)`| `NULL` | Email Address. |
| `IsActive` | `BOOLEAN` | `DEFAULT TRUE` | Active Office Bearer flag. |

---

### Master Module 12: Staff Master (Society Employees & Payroll Profiles)
- **Directory / Files:** `modules/master/staff-master/` (`staff-master.html`, `.js`, `.css`)
- **Backend Controller:** `StaffController.cs`
- **Purpose:** Maintains registry of society salaried employees (Manager, Security, Sweeper, Electrician) with PAN and TDS details for payment vouchers.

#### Database Table: `jeevika_erp.SocStaff`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `StaffId` | `SERIAL` | `PRIMARY KEY` | Staff ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `StaffCode` | `VARCHAR(50)` | `NOT NULL` | Employee Code (e.g. `STF-001`). |
| `StaffName` | `VARCHAR(255)`| `NOT NULL` | Employee Full Name. |
| `Designation`| `VARCHAR(100)`| `NULL` | `Society Manager`, `Accountant`, `Watchman`, `Gardener`. |
| `PANNo` | `VARCHAR(20)` | `NULL` | Employee PAN number. |
| `TDSRate` | `NUMERIC(5,2)`| `DEFAULT 0.00` | Applicable TDS deduction rate. |
| `ContactNo` | `VARCHAR(50)` | `NULL` | Contact Mobile Number. |
| `Email` | `VARCHAR(100)`| `NULL` | Contact Email. |
| `JoiningDate`| `DATE` | `NULL` | Date of Employment. |
| `IsDeleted` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete flag. |
| `UNIQUE` | `(SocietyId, StaffCode)` | Unique constraint per society. |

---

### Master Module 13: Vendor Master (Contractors & Service Providers)
- **Directory / Files:** `modules/master/vendor-master/` (`vendor-master.html`, `.js`, `.css`)
- **Backend Controller:** `VendorController.cs`
- **Purpose:** Contractor and vendor registry with GSTIN, PAN, TDS sections (194C/194J), and annual maintenance contracts (AMC) for purchase orders and payment vouchers.

#### Database Table: `jeevika_erp.SocVendor`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `VendorId` | `SERIAL` | `PRIMARY KEY` | Vendor ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `VendorCode` | `VARCHAR(50)` | `NOT NULL` | Vendor Code (e.g. `VND-001`). |
| `VendorName` | `VARCHAR(255)`| `NOT NULL` | Business / Contractor Name. |
| `PANNo` | `VARCHAR(20)` | `NULL` | Contractor PAN Number. |
| `GSTIN` | `VARCHAR(50)` | `NULL` | 15-digit GSTIN. |
| `TDSSection` | `VARCHAR(50)` | `DEFAULT '194C'` | Tax Section: `194C` (Contractors), `194J` (Professionals). |
| `TDSRate` | `NUMERIC(5,2)`| `DEFAULT 2.00` | TDS Rate Percentage (Standard: 1% Individual, 2% Company). |
| `ContactNo` | `VARCHAR(50)` | `NULL` | Phone / Mobile. |
| `Email` | `VARCHAR(100)`| `NULL` | Email for PO dispatches. |
| `Address` | `TEXT` | `NULL` | Physical office address. |
| `ContractNo` | `VARCHAR(100)`| `NULL` | AMC Contract / Agreement Reference Number. |
| `ContractFrom`| `DATE` | `NULL` | Contract Start Date. |
| `ContractTo` | `DATE` | `NULL` | Contract Expiry Date. |
| `ContractValue`| `NUMERIC(18,2)`| `DEFAULT 0.00`| Total AMC Contract Value (₹). |
| `IsDeleted` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete flag. |
| `UNIQUE` | `(SocietyId, VendorCode)` | Unique constraint per society. |

---

### Master Module 14: Configuration & Notes Master
- **Directory / Files:** `modules/master/config-notes-master/` (`config-notes-master.html`, `.js`)
- **Backend Controller:** `SocietyController.cs`, `DbHelper.cs`
- **Purpose:** Centralized operational hub controlling:
  1. Transaction serial numbering sequences and prefix patterns (`TxNumberConfig`).
  2. Balance sheet 6-line management and auditor footers.
  3. Module-level manual number entry overrides.
  4. Account group visibility restrictions per transaction module.

#### Database Table: `jeevika_erp.TxNumberConfig` (Voucher Numbering Engine)
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `ConfigId` | `SERIAL` | `PRIMARY KEY` | Configuration ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `NOT NULL REFERENCES FinancialYear(FYId)` | Financial Year scoping. |
| `VoucherType`| `VARCHAR(50)` | `NOT NULL` | Module Type (`Payment`, `Receipt`, `Journal`, `Contra`, `MemberBill`, `PurchaseOrder`, etc.). |
| `Prefix` | `VARCHAR(20)` | `DEFAULT ''` | Primary Prefix (e.g. `PV`, `MRV`, `MBIL`, `PO`, `JV`). |
| `AltPrefix` | `VARCHAR(20)` | `NULL` | Alternate Prefix (e.g. `MINV` for Invoices, `MTT-I` for Transfers). |
| `UseAltPrefix`| `BOOLEAN` | `DEFAULT FALSE` | Active switch for Alternate Prefix. |
| `UseShortFy` | `BOOLEAN` | `DEFAULT FALSE` | Use 2-digit FY (`25-26`) instead of full (`2025-26`). |
| `StartNo` | `INT` | `DEFAULT 1` | Starting counter number for the financial year. |
| `LastNo` | `INT` | `DEFAULT 0` | Current last issued voucher number. |
| `UNIQUE` | `(SocietyId, FYId, VoucherType)` | Enforces unique sequence configuration per module per FY. |

#### Database Table: `jeevika_erp.SocGeneralConfig` *(New Production Table)*
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `GeneralConfigId`| `SERIAL` | `PRIMARY KEY` | Config ID. |
| `SocietyId` | `INT` | `NOT NULL UNIQUE REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `ManualMasterToggle`| `BOOLEAN`| `DEFAULT FALSE` | Master override enabling manual numbering for all modules. |
| `ManualModulesJSON`| `JSONB` | `DEFAULT '{}'` | Key-value JSON of manual permissions for 12 transaction screens. |
| `AutoSelectBill` | `BOOLEAN` | `DEFAULT TRUE` | Auto-match oldest unpaid bills during receipt entry. |
| `AllowMemberManualMode`| `BOOLEAN`| `DEFAULT TRUE`| Allow manual mode in receipt reversals. |
| `AllowPOModeInPayment` | `BOOLEAN`| `DEFAULT TRUE`| Show PO selection mode in Payment Entry form. |
| `AllowCashBankInJV` | `BOOLEAN` | `DEFAULT FALSE` | Allow Cash & Bank Balance accounts in Journal Vouchers. |
| `AllowGridAccountSelect`| `BOOLEAN`| `DEFAULT TRUE`| Allow inline ledger selection within table grid rows. |
| `FooterGeneralJSON` | `JSONB` | `DEFAULT '[]'` | Array of 6 general footer strings for balance sheet. |
| `FooterAuditorJSON` | `JSONB` | `DEFAULT '[]'` | Array of 6 auditor disclaimer lines. |

#### Database Table: `jeevika_erp.SocGroupVisibilityConfig` *(New Production Table)*
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `VisibilityId` | `SERIAL` | `PRIMARY KEY` | Visibility Config ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `ModuleKey` | `VARCHAR(50)` | `NOT NULL` | `otherreceipt`, `paymententry`, `purchaseorder`. |
| `ShowAssets` | `BOOLEAN` | `DEFAULT TRUE` | Show Asset accounts in 'Select Account' dropdown. |
| `ShowLiabilities`| `BOOLEAN`| `DEFAULT TRUE` | Show Liability accounts. |
| `ShowIncome` | `BOOLEAN` | `DEFAULT TRUE` | Show Income accounts. |
| `ShowExpense` | `BOOLEAN` | `DEFAULT TRUE` | Show Expense accounts. |
| `UNIQUE` | `(SocietyId, ModuleKey)` | Unique visibility setting per module. |

---

## 3. THE 15 TRANSACTION MODULES — DATABASE SPECIFICATION & TRANSACTION LOGIC

```
                              TRANSACTION POSTING DATA FLOW
  
                     ┌──────────────────────────────────────────────┐
                     │          TRANSACTION EVENT TRIGGER           │
                     │  (Bill Run, Receipt, Payment, JV, PO, etc.)  │
                     └──────────────────────┬───────────────────────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
  ┌─────────────────────────────────────┐       ┌─────────────────────────────────────┐
  │         HEADER TRANSACTION          │       │          MEMBER LEDGER LINK         │
  │   jeevika_erp.SocVoucherHeader      │       │     jeevika_erp.SocMemberBill       │
  │   • VoucherId, No, Date, Type       │       │     • BillId, DueDate, Amount       │
  │   • PersonName, TotalAmount         │       │     • PaidAmount, BalanceAmount     │
  └──────────────────┬──────────────────┘       └──────────────────┬──────────────────┘
                     │                                             │
                     ▼                                             ▼
  ┌─────────────────────────────────────┐       ┌─────────────────────────────────────┐
  │         DETAIL LEDGER POSTING       │       │          BILL HEAD BREAKDOWN        │
  │   jeevika_erp.SocVoucherDetail      │       │     jeevika_erp.SocMemberBillItem   │
  │   • AccountId, Debit, Credit        │       │     • AccountCode, Name, Amount     │
  │   • Double-Entry Balance Check      │       │     • GST & Exemption Breakdown     │
  └─────────────────────────────────────┘       └─────────────────────────────────────┘
```

---

### Transaction Module 1: Bill / Invoice Generation
- **Directory / Files:** `modules/transaction/member-bill/` (`member-bill.html`, `.js`, `.css`)
- **Backend Controller:** `MemberBillController.cs`
- **Accounting Posting:**
  - **Debit:** Dues From Members / Member Personal Ledger (`ASS-1025`)
  - **Credit:** Individual Income Heads (e.g. Service Charges `INC-1004`, Sinking Fund `INC-1005`, Water `INC-1002`, CGST `LIA-1032`, SGST `LIA-1033`)

#### Database Table: `jeevika_erp.SocMemberBill` (Bill Header)
| Column Name | Data Type | Constraints / Default | Description & Accounting Logic |
| :--- | :--- | :--- | :--- |
| `BillId` | `SERIAL` | `PRIMARY KEY` | Bill Unique ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `NOT NULL REFERENCES FinancialYear(FYId)` | Financial Year scoping. |
| `BillNo` | `VARCHAR(50)` | `NOT NULL` | Invoice Number (e.g. `MBIL/2025-26/0001`). |
| `MemberId` | `INT` | `NOT NULL REFERENCES SocMember(MemberId)` | Member billed. |
| `BillTypeId` | `INT` | `REFERENCES SocBillType(BillTypeId)` | Associated Bill Type category. |
| `BillType` | `VARCHAR(100)`| `DEFAULT 'Maintenance'` | Bill Type Name. |
| `Period` | `VARCHAR(100)`| `NULL` | Billing Period (e.g. "April 2025 - June 2025"). |
| `BillDate` | `DATE` | `NOT NULL` | Invoice Issue Date. |
| `DueDate` | `DATE` | `NULL` | Payment Due Date. |
| `PrincipalAmount`| `NUMERIC(18,2)`| `DEFAULT 0.00`| Total current period charges excluding interest. |
| `InterestAmount` | `NUMERIC(18,2)`| `DEFAULT 0.00`| Arrears Simple Interest added to bill. |
| `TotalAmount` | `NUMERIC(18,2)`| `DEFAULT 0.00`| Total Bill Amount ($\text{Principal} + \text{Interest}$). |
| `PaidAmount` | `NUMERIC(18,2)`| `DEFAULT 0.00`| Cumulative amount paid against this bill. |
| `BalanceAmount`| `NUMERIC(18,2)`| `DEFAULT 0.00`| Unpaid Outstanding ($\text{Total} - \text{Paid}$). |
| `Status` | `VARCHAR(50)` | `DEFAULT 'Unpaid'` | `Unpaid`, `PartPaid`, `Paid`. |
| `Particular1` | `TEXT` | `NULL` | Custom note / narration line 1. |
| `Particular2` | `TEXT` | `NULL` | Custom note / narration line 2. |
| `VoucherId` | `INT` | `REFERENCES SocVoucherHeader(VoucherId)` | Linked general ledger voucher entry. |
| `IsDeleted` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete flag. |
| `CreatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp. |
| `UNIQUE` | `(SocietyId, FYId, BillNo)` | Enforces unique bill numbers per society per FY. |

#### Database Table: `jeevika_erp.SocMemberBillItem` (Bill Line Heads)
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `ItemId` | `SERIAL` | `PRIMARY KEY` | Line item ID. |
| `BillId` | `INT` | `NOT NULL REFERENCES SocMemberBill(BillId) ON DELETE CASCADE` | Parent bill reference. |
| `AccountId` | `INT` | `REFERENCES SocAccount(AccountId)` | Target Income account. |
| `AccountCode`| `VARCHAR(50)` | `NOT NULL` | Account code (e.g. `INC-1004`). |
| `AccountName`| `VARCHAR(255)`| `NOT NULL` | Account title (e.g. "Service Charges"). |
| `Amount` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Monetary amount for this head. |

---

### Transaction Module 2: Member Receipt Entry
- **Directory / Files:** `modules/transaction/member-receipt/` / `receipt-entry` (`receipt-entry.html`, `.js`, `.css`)
- **Backend Controller:** `MemberReceiptController.cs`
- **Accounting Posting:**
  - **Debit:** Cash in Hand (`ASS-1001`) or Bank Account (`ASS-1002`)
  - **Credit:** Dues From Members / Member Personal Ledger (`ASS-1025`)
  - **Settlement:** Reduces `BalanceAmount` on target `SocMemberBill` and updates status (`Paid`/`PartPaid`).

---

### Transaction Module 3: Member Receipt Reversal (Cheque Return / Dishonour)
- **Directory / Files:** `modules/transaction/receipt-reversal/` (`receipt-reversal.html`, `.js`, `.css`)
- **Backend Controller:** `MemberReceiptReversalController.cs`
- **Accounting Posting:**
  - **Debit:** Dues From Members / Member Personal Ledger (`ASS-1025`)
  - **Credit:** Cash/Bank Account (`ASS-1002`) (Reverses bounce cheque)
  - **Optional Debit:** Bank Charges Expense (`EXP-1027`)
  - **Bill Balance Restoration:** Automatically increases `BalanceAmount` on `SocMemberBill` using corrected `BillNo` key.

---

### Transaction Module 4: Member Debit Note
- **Directory / Files:** `modules/transaction/member-debit-note/` (`member-debit-note.html`, `.js`, `.css`)
- **Backend Controller:** `MemberNoteController.cs`
- **Accounting Posting:**
  - **Debit:** Dues From Members (`ASS-1025`) (Increases member debt)
  - **Credit:** Income / Repair / Penalty Ledger (e.g. "Water Leakage Penalty", "Late Fee")
  - **Numbering:** Auto-prefixed as `MDN-0001` or `DN-0001`.

---

### Transaction Module 5: Member Credit Note
- **Directory / Files:** `modules/transaction/member-credit-note/` (`member-credit-note.html`, `.js`, `.css`)
- **Backend Controller:** `MemberNoteController.cs`
- **Accounting Posting:**
  - **Debit:** Income Ledger / Maintenance Adjustment (Decreases society income / reverses excess billing)
  - **Credit:** Dues From Members (`ASS-1025`) (Reduces member debt)
  - **Numbering:** Auto-prefixed as `MCN-0001` or `CN-0001`.

---

### Transaction Module 6: Member Bill Type Transfer
- **Directory / Files:** `modules/transaction/member-bill-type-transfer/` (`member-bill-type-transfer.html`, `.js`, `.css`)
- **Backend Controller:** `MemberBillTypeTransferController.cs`
- **Purpose:** Transfers funds or adjustments between two bill types or two members (e.g., Transfer excess Maintenance credit to Sinking Fund, or Flat transfer adjustment).

#### Database Table: `jeevika_erp.SocBillTypeTransfer` *(New Production Detail Table)*
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `TransferId` | `SERIAL` | `PRIMARY KEY` | Transfer ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `NOT NULL REFERENCES FinancialYear(FYId)` | Financial year. |
| `VoucherId` | `INT` | `NOT NULL REFERENCES SocVoucherHeader(VoucherId) ON DELETE CASCADE` | Voucher header. |
| `SourceMemberId`| `INT`| `REFERENCES SocMember(MemberId)` | Originating Member. |
| `DestMemberId` | `INT` | `REFERENCES SocMember(MemberId)` | Destination Member. |
| `SourceBillTypeId`| `INT`| `REFERENCES SocBillType(BillTypeId)` | Originating Bill Category. |
| `DestBillTypeId` | `INT`| `REFERENCES SocBillType(BillTypeId)` | Destination Bill Category. |
| `Amount` | `NUMERIC(18,2)`| `NOT NULL` | Transfer Amount. |
| `TransferType` | `VARCHAR(50)` | `DEFAULT 'INTERNAL'` | `INTERNAL`, `INTER_MEMBER`, `INTER_HEAD`. |

---

### Transaction Module 7: Other Receipt Entry (Non-Member Collections)
- **Directory / Files:** `modules/transaction/other-receipt/` (`other-receipt.html`, `.js`, `.css`)
- **Backend Controller:** `OtherReceiptController.cs`, `VoucherController.cs`
- **Accounting Posting:**
  - **Debit:** Cash in Hand (`ASS-1001`) or Bank Account (`ASS-1002`)
  - **Credit:** Miscellaneous Income Ledger (e.g. Sale of Scrap `INC-1013`, Clubhouse Rental `INC-1012`, Mobile Tower Rent `INC-1012`)

---

### Transaction Module 8: Payment Entry (Voucher)
- **Directory / Files:** `modules/transaction/payment-entry/` (`payment-entry.html`, `.js`, `.css`)
- **Backend Controller:** `PaymentEntryController.cs`, `VoucherController.cs`
- **Accounting Posting:**
  - **Debit:** Expense Ledger (e.g. Security Charges `EXP-1004`, Lift AMC `EXP-1008`) or Vendor Account (`LIA-1011`)
  - **Credit:** Cash in Hand (`ASS-1001`) or Bank Ledger (`ASS-1002`)
  - **Credit (Optional):** TDS Payable (`LIA-1008`) if statutory TDS deducted at source.
  - **PO Linkage:** Links to `SocPurchaseOrder` if paying against a booked Purchase Order.

---

### Transaction Module 9: Contra Entry (Cash & Bank Fund Transfers)
- **Directory / Files:** `modules/transaction/contra-entry/` (`contra-entry.html`, `.js`, `.css`)
- **Backend Controller:** `ContraEntryController.cs`, `VoucherController.cs`
- **Accounting Posting:**
  - **Case A (Cash Deposit into Bank):** Debit Bank Ledger (`ASS-1002`), Credit Cash in Hand (`ASS-1001`).
  - **Case B (Cash Withdrawal for Petty Cash):** Debit Cash in Hand (`ASS-1001`), Credit Bank Ledger (`ASS-1002`).
  - **Case C (Inter-Bank Transfer):** Debit Destination Bank (`ASS-1003`), Credit Source Bank (`ASS-1002`).

---

### Transaction Module 10: Journal Voucher (JV)
- **Directory / Files:** `modules/transaction/journal-voucher/` (`journal-voucher.html`, `.js`, `.css`)
- **Backend Controller:** `VoucherController.cs`
- **Accounting Posting:**
  - General non-cash accounting adjustments, year-end accruals, depreciation postings, and provisions.
  - Supports $N$ multi-line entries in `SocVoucherDetail` satisfying $\sum \text{Debit} = \sum \text{Credit}$.

---

### Transaction Module 11: Purchase Order (PO & Work Order)
- **Directory / Files:** `modules/transaction/purchase-order/` (`purchase-order.html`, `.js`, `.css`)
- **Backend Controller:** `PurchaseOrderController.cs`
- **Purpose:** Issues official Purchase Orders to registered vendors with multi-item quotation rates, tax computations, and delivery schedules.

#### Database Table: `jeevika_erp.SocPurchaseOrder` *(New Production Structure)*
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `POId` | `SERIAL` | `PRIMARY KEY` | Purchase Order ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `NOT NULL REFERENCES FinancialYear(FYId)` | Financial year. |
| `PONo` | `VARCHAR(50)` | `NOT NULL` | PO Number (e.g. `PO-0001`). |
| `PODate` | `DATE` | `NOT NULL` | Order Issue Date. |
| `VendorId` | `INT` | `REFERENCES SocVendor(VendorId)` | Selected Vendor. |
| `VendorName` | `VARCHAR(255)`| `NOT NULL` | Vendor Business Name. |
| `TotalAmount` | `NUMERIC(18,2)`| `NOT NULL DEFAULT 0.00`| Total Order Amount. |
| `TaxAmount` | `NUMERIC(18,2)`| `DEFAULT 0.00` | GST Tax Amount. |
| `NetAmount` | `NUMERIC(18,2)`| `NOT NULL DEFAULT 0.00`| Net Payable ($\text{Total} + \text{Tax}$). |
| `RefNo` | `VARCHAR(100)`| `NULL` | Vendor Quotation / Estimate Ref No. |
| `Narration` | `TEXT` | `NULL` | Scope of Work / Delivery terms. |
| `Status` | `VARCHAR(50)` | `DEFAULT 'BOOKED'` | `BOOKED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`. |
| `IsDeleted` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete flag. |
| `CreatedBy` | `VARCHAR(100)`| `NULL` | User who generated the PO. |
| `CreatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp. |

#### Database Table: `jeevika_erp.SocPurchaseOrderItem` (PO Line Items)
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `POItemId` | `SERIAL` | `PRIMARY KEY` | Line item ID. |
| `POId` | `INT` | `NOT NULL REFERENCES SocPurchaseOrder(POId) ON DELETE CASCADE` | Parent PO. |
| `AccountId` | `INT` | `REFERENCES SocAccount(AccountId)` | Expense Account Head. |
| `ItemDescription`| `VARCHAR(255)`| `NOT NULL` | Description of material / service. |
| `Quantity` | `NUMERIC(10,2)`| `DEFAULT 1.00` | Quantity ordered. |
| `UnitRate` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Price per unit. |
| `Amount` | `NUMERIC(18,2)`| `DEFAULT 0.00` | Line total ($\text{Qty} \times \text{Rate}$). |

---

### Transaction Module 12: Fixed Deposit (FD Investment Registry)
- **Directory / Files:** `modules/transaction/fixed-deposit/` (`fixed-deposit.html`, `.js`, `.css`)
- **Backend Controller:** `BankRecoController.cs` (`FixedDepositController`)
- **Accounting Posting (Upon Booking):**
  - **Debit:** Fixed Deposit Asset Ledger (e.g. `ASS-1007` FDR Reserve Fund)
  - **Credit:** Operating Bank Account (`ASS-1002`)

#### Database Table: `jeevika_erp.SocFixedDeposit`
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `FDId` | `SERIAL` | `PRIMARY KEY` | Fixed Deposit Record ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `NOT NULL REFERENCES FinancialYear(FYId)` | Financial year. |
| `FDNo` | `VARCHAR(50)` | `NOT NULL` | FDR Receipt Certificate Number. |
| `BankName` | `VARCHAR(255)`| `NOT NULL` | Bank / Financial Institution Name. |
| `Branch` | `VARCHAR(100)`| `NULL` | Bank Branch. |
| `AccountId` | `INT` | `REFERENCES SocAccount(AccountId)` | Investment Asset Ledger Account. |
| `Principal` | `NUMERIC(18,2)`| `NOT NULL DEFAULT 0.00`| Principal Deposit Amount (₹). |
| `InterestRate`| `NUMERIC(5,2)`| `NOT NULL DEFAULT 0.00`| Annual Interest Rate (ROI %). |
| `InterestType`| `VARCHAR(50)` | `DEFAULT 'Quarterly Compounding'`| `Simple`, `Quarterly Compounding`, `Cumulative`. |
| `StartDate` | `DATE` | `NOT NULL` | Investment Date. |
| `MaturityDate`| `DATE` | `NOT NULL` | Maturity Date. |
| `MaturityAmount`| `NUMERIC(18,2)`| `NOT NULL DEFAULT 0.00`| Expected Maturity Realization Amount. |
| `AccruedInterest`| `NUMERIC(18,2)`| `DEFAULT 0.00`| Cumulative Accrued Interest earned to date. |
| `NominationName`| `VARCHAR(255)`| `NULL` | Society Nominee / Fund Designation. |
| `Status` | `VARCHAR(50)` | `DEFAULT 'Active'` | `Active`, `Matured`, `Reinvested`, `Liquidated`. |
| `IsDeleted` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete flag. |

---

### Transaction Module 13: FD Accrued Interest (Provision & Accounting Engine)
- **Directory / Files:** `modules/transaction/fd-accrued-interest/` (`fd-accrued-interest.html`, `.js`)
- **Backend Controller:** `BankRecoController.cs`, `VoucherController.cs`
- **Accounting Posting (Upon Accrual Run):**
  - **Debit:** Accrued Interest on FD Asset (`ASS-1011` to `ASS-1015`)
  - **Credit:** Interest on FDR Income Ledger (`INC-1010`)
  - **Debit (Upon TDS Deduction):** TDS Receivable Asset Ledger (`ASS-1016`)

#### Database Table: `jeevika_erp.SocFDInterestPosting` *(New Production Table)*
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `PostingId` | `SERIAL` | `PRIMARY KEY` | Interest Posting ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `NOT NULL REFERENCES FinancialYear(FYId)` | Financial year. |
| `FDId` | `INT` | `NOT NULL REFERENCES SocFixedDeposit(FDId) ON DELETE CASCADE` | Target Fixed Deposit. |
| `PostingDate`| `DATE` | `NOT NULL` | Quarter-end / Year-end provision date. |
| `PeriodLabel`| `VARCHAR(50)` | `NOT NULL` | Period (e.g. `Q1 (Apr-Jun)`, `FY 2025-26`). |
| `InterestEarned`| `NUMERIC(18,2)`| `NOT NULL` | Interest amount calculated. |
| `TDSDeducted`| `NUMERIC(18,2)`| `DEFAULT 0.00` | 26AS TDS deducted by bank (10%). |
| `NetAccrued` | `NUMERIC(18,2)`| `NOT NULL` | Net Accrual ($\text{Interest} - \text{TDS}$). |
| `VoucherId` | `INT` | `REFERENCES SocVoucherHeader(VoucherId)` | Generated Journal Voucher ID. |
| `CreatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp. |

---

### Transaction Module 14: Bank Reconciliation (BRS Engine)
- **Directory / Files:** `modules/transaction/bank-reco/` (`bank-reco.html`, `.js`, `.css`)
- **Backend Controller:** `BankRecoController.cs`
- **Purpose:** Reconciles Society Book Balance with Bank Statement Balance by flagging uncleared cheques and deposits in transit.

#### Database Table: `jeevika_erp.SocBankReconciliation` *(New Production Table)*
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `ReconcileId` | `SERIAL` | `PRIMARY KEY` | Reconciliation Record ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `FYId` | `INT` | `NOT NULL REFERENCES FinancialYear(FYId)` | Financial year. |
| `VoucherId` | `INT` | `NOT NULL REFERENCES SocVoucherHeader(VoucherId) ON DELETE CASCADE` | Associated Voucher. |
| `BankAccountId`| `INT` | `NOT NULL REFERENCES SocAccount(AccountId)` | Bank Ledger Account. |
| `ChequeNo` | `VARCHAR(50)` | `NULL` | Cheque Number. |
| `ChequeDate` | `DATE` | `NULL` | Cheque Issue Date. |
| `Amount` | `NUMERIC(18,2)`| `NOT NULL` | Cheque Value. |
| `IsCleared` | `BOOLEAN` | `DEFAULT FALSE` | Clearance status. |
| `ClearanceDate`| `DATE` | `NULL` | Date cleared as per bank passbook. |
| `StatementRef`| `VARCHAR(100)`| `NULL` | Bank Statement line identifier / UTR. |
| `ReconciledBy`| `VARCHAR(100)`| `NULL` | Auditor / User who verified the entry. |
| `UpdatedAt` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Timestamp. |

---

### Transaction Module 15: Voucher Check (Auditor Verification & Checklist Hub)
- **Directory / Files:** `modules/transaction/voucher-check/` (`voucher-check.html`, `.js`, `.css`)
- **Backend Controller:** `VoucherController.cs`
- **Purpose:** Statutory audit inspection interface allowing internal and statutory auditors to verify physical vouchers, supporting bills, committee resolutions, and TDS compliances.

#### Database Table: `jeevika_erp.SocVoucherAudit` *(New Production Table)*
| Column Name | Data Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `AuditId` | `SERIAL` | `PRIMARY KEY` | Audit Record ID. |
| `SocietyId` | `INT` | `NOT NULL REFERENCES SocietyInfo(SocietyId)` | Society scoping. |
| `VoucherId` | `INT` | `NOT NULL UNIQUE REFERENCES SocVoucherHeader(VoucherId) ON DELETE CASCADE` | Checked voucher. |
| `IsChecked` | `BOOLEAN` | `DEFAULT FALSE` | Physical Voucher Verified (`chkChecked`). |
| `NoCommitteeApproval`| `BOOLEAN`| `DEFAULT FALSE`| Defect: No Committee Approval (`chkNoComm`). |
| `NoReceiptSlip` | `BOOLEAN` | `DEFAULT FALSE` | Defect: No Acknowledgment Receipt (`chkNoRecv`). |
| `NoSupportingDoc` | `BOOLEAN` | `DEFAULT FALSE` | Defect: Missing Invoice / Bill (`chkNoSupp`). |
| `NoMeetingResolution`| `BOOLEAN`| `DEFAULT FALSE`| Defect: No MCM Resolution (`chkNoMeet`). |
| `NoTDSDeduction` | `BOOLEAN` | `DEFAULT FALSE` | Defect: TDS Violation (`chkNoTds`). |
| `NoPhysicalVoucher`| `BOOLEAN` | `DEFAULT FALSE` | Defect: Missing Voucher Paper (`chkNoVouch`). |
| `ExcessCashPayment`| `BOOLEAN` | `DEFAULT FALSE` | Defect: Cash payment exceeding ₹10,000 statutory limit (`chkExcessCash`). |
| `AuditStatus` | `VARCHAR(50)` | `DEFAULT 'Pending'` | `Pending`, `Approved`, `Rejected`, `Queried`. |
| `AuditorRemark` | `TEXT` | `NULL` | Primary audit observation notes. |
| `AuditorRemark2`| `TEXT` | `NULL` | Secondary / Compliance remark. |
| `AuditedBy` | `VARCHAR(100)`| `NULL` | Auditor username. |
| `AuditedDate` | `TIMESTAMPTZ` | `NULL` | Timestamp of audit sign-off. |

---

## 4. MASTER VOUCHER CORE TABLES (Universal Journal Engine)

All transaction vouchers (Payment, Receipt, Journal, Contra, Other Receipt, Debit Note, Credit Note, Purchase Order, Bill Type Transfer) converge on the unified double-entry ledger engine:

### Table: `jeevika_erp.SocVoucherHeader`
```sql
CREATE TABLE IF NOT EXISTS jeevika_erp.SocVoucherHeader (
    VoucherId     SERIAL PRIMARY KEY,
    SocietyId     INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId          INT           NOT NULL REFERENCES jeevika_erp.FinancialYear(FYId),
    VoucherNo     VARCHAR(50)   NOT NULL,
    VoucherType   VARCHAR(50)   NOT NULL,  -- 'Payment','Receipt','Journal','Contra','OtherReceipt','MemberReceipt','MemberDebitNote','MemberCreditNote','BillTypeTransfer','PurchaseOrder'
    VoucherDate   DATE          NOT NULL,
    CashBankCode  VARCHAR(50),
    CashBankName  VARCHAR(255),
    Amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
    ChqNo         VARCHAR(50),
    ChqDate       DATE,
    BankName      VARCHAR(100),
    PersonName    VARCHAR(255),
    PersonType    VARCHAR(50),             -- 'Vendor','Staff','Member','Other','Bank/Cash'
    PersonCode    VARCHAR(50),
    RefNo         VARCHAR(100),            -- Invoice No / Bill No / Cheque No
    Narration     TEXT,
    Particular1   TEXT,
    Particular2   TEXT,
    IsAudited     BOOLEAN       DEFAULT FALSE,
    AuditedBy     VARCHAR(100),
    AuditedDate   TIMESTAMPTZ,
    Status        VARCHAR(50)   DEFAULT 'Posted', -- 'Draft','Posted','Cancelled'
    IsDeleted     BOOLEAN       DEFAULT FALSE,
    CreatedBy     VARCHAR(100),
    CreatedAt     TIMESTAMPTZ   DEFAULT NOW(),
    UpdatedAt     TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, FYId, VoucherNo)
);
```

### Table: `jeevika_erp.SocVoucherDetail` (Double-Entry Line Items)
```sql
CREATE TABLE IF NOT EXISTS jeevika_erp.SocVoucherDetail (
    DetailId      SERIAL PRIMARY KEY,
    VoucherId     INT           NOT NULL REFERENCES jeevika_erp.SocVoucherHeader(VoucherId) ON DELETE CASCADE,
    SrNo          INT           NOT NULL DEFAULT 1,
    AccountId     INT           REFERENCES jeevika_erp.SocAccount(AccountId),
    AccountCode   VARCHAR(50),
    AccountName   VARCHAR(255),
    Debit         NUMERIC(18,2) DEFAULT 0,
    Credit        NUMERIC(18,2) DEFAULT 0,
    Narration     TEXT,
    CONSTRAINT chk_debit_credit_positive CHECK (Debit >= 0 AND Credit >= 0)
);
```

---

## 5. COMPLETE PRODUCTION TABLE CATALOG & ENTITY MATRIX

Below is the complete catalog of all 26 required database tables for the 14 Masters + 15 Transactions:

| # | Table Name | Category | Module Association | Primary Key | Foreign Keys / Scoping |
|---|:---|:---|:---|:---|:---|
| 1 | `SoftUser` | System | Authentication | `UserId` | Global (Admin & Society Users) |
| 2 | `SocietyInfo` | Master 1 | Society Master | `SocietyId` | Global Tenant Root |
| 3 | `FinancialYear` | Master 1 | Society Master / FY Setup | `FYId` | `SocietyId` |
| 4 | `TxNumberConfig` | Master 14 | Configuration & Notes Master | `ConfigId` | `SocietyId, FYId` |
| 5 | `SocGroup` | Master 2 | Group Master (COA) | `GroupId` | `SocietyId, GrpPrimaryId` |
| 6 | `SocAccount` | Master 3 | Account Master (Ledger) | `AccountId` | `SocietyId, GroupId` |
| 7 | `SocMember` | Master 4 | Member Master (Flats) | `MemberId` | `SocietyId` |
| 8 | `SocMemberTransfer` | Master 4 | Member Master (Ownership Transfer) | `TransferId` | `SocietyId, MemberId` |
| 9 | `SocMemberLien` | Master 4 | Member Master (Bank Mortgage) | `LienId` | `SocietyId, MemberId` |
| 10| `SocMemberTenant` | Master 4 | Member Master (Tenant Lease) | `TenantId` | `SocietyId, MemberId` |
| 11| `SocMemberNominee` | Master 4 | Member Master (Nominees) | `NomineeId` | `SocietyId, MemberId` |
| 12| `SocMemberBillOverride`| Master 4| Member Master (Head Overrides) | `OverrideId`| `SocietyId, MemberId` |
| 13| `SocBillType` | Master 5 | Bill Type & Notes Master | `BillTypeId` | `SocietyId` |
| 14| `SocBillTypeHead` | Master 5 | Bill Type & Notes Master | `HeadId` | `SocietyId, BillTypeId, AccountId` |
| 15| `SocBillTypeNote` | Master 5 | Bill Type & Notes Master | `NoteId` | `SocietyId, BillTypeId` |
| 16| `SocBillingMatrix` | Master 6 | Billing Master | `MatrixId` | `SocietyId, FYId, BillTypeId, MemberId` |
| 17| `SocBillingSetting` | Master 6 | Billing Master | `SettingId` | `SocietyId, BillTypeId` |
| 18| `SocOpeningBankReco` | Master 7 | Opening Bank Reco Master | `RecoId` | `SocietyId, FYId, AccountId` |
| 19| `SocOpeningBalance` | Master 8 | Opening Balances Master | `OpenBalId` | `SocietyId, FYId, AccountId` |
| 20| `SocBillPrintConfig`| Master 9 | Bill Print Setup Master | `ConfigId` | `SocietyId` |
| 21| `SocGSTRate` | Master 10| GST Master | `GSTRateId` | `SocietyId` |
| 22| `SocCommittee` | Master 11| Committee Master | `CommitteeId`| `SocietyId, FYId` |
| 23| `SocStaff` | Master 12| Staff Master | `StaffId` | `SocietyId` |
| 24| `SocVendor` | Master 13| Vendor Master | `VendorId` | `SocietyId` |
| 25| `SocGeneralConfig` | Master 14| Configuration & Notes Master | `GeneralConfigId`| `SocietyId` |
| 26| `SocGroupVisibilityConfig`| Master 14| Configuration & Notes Master | `VisibilityId`| `SocietyId` |
| 27| `SocVoucherHeader` | Trans 1-10| Core Voucher Header | `VoucherId` | `SocietyId, FYId` |
| 28| `SocVoucherDetail` | Trans 1-10| Core Voucher Line Items | `DetailId` | `VoucherId, AccountId` |
| 29| `SocMemberBill` | Trans 1 | Bill / Invoice Header | `BillId` | `SocietyId, FYId, MemberId, BillTypeId` |
| 30| `SocMemberBillItem` | Trans 1 | Bill / Invoice Line Items | `ItemId` | `BillId, AccountId` |
| 31| `SocBillTypeTransfer`| Trans 6 | Bill Type Transfer Details | `TransferId` | `SocietyId, FYId, VoucherId, MemberId` |
| 32| `SocPurchaseOrder` | Trans 11| Purchase Order Header | `POId` | `SocietyId, FYId, VendorId` |
| 33| `SocPurchaseOrderItem`| Trans 11| Purchase Order Line Items | `POItemId` | `POId, AccountId` |
| 34| `SocFixedDeposit` | Trans 12| Fixed Deposit Investment | `FDId` | `SocietyId, FYId, AccountId` |
| 35| `SocFDInterestPosting`| Trans 13| FD Accrued Interest Schedule | `PostingId` | `SocietyId, FYId, FDId, VoucherId` |
| 36| `SocBankReconciliation`| Trans 14| Bank Reconciliation Items | `ReconcileId`| `SocietyId, FYId, VoucherId, AccountId` |
| 37| `SocVoucherAudit` | Trans 15| Voucher Check Audit Record | `AuditId` | `SocietyId, VoucherId` |
| 38| `AuditLog` | System | Universal Change Audit Log | `LogId` | `SocietyId, UserId` |

---

## 6. PRODUCTION INDEXING & PERFORMANCE STRATEGY

To ensure sub-second response times across large housing societies with thousands of members and multi-year voucher registers:

```sql
-- Multi-Tenancy & Fiscal Year Compound Indexes
CREATE INDEX IF NOT EXISTS idx_vouchers_soc_fy ON jeevika_erp.SocVoucherHeader(SocietyId, FYId, VoucherDate DESC);
CREATE INDEX IF NOT EXISTS idx_vdetails_voucher ON jeevika_erp.SocVoucherDetail(VoucherId);
CREATE INDEX IF NOT EXISTS idx_vdetails_account ON jeevika_erp.SocVoucherDetail(AccountId);
CREATE INDEX IF NOT EXISTS idx_bills_soc_fy ON jeevika_erp.SocMemberBill(SocietyId, FYId, Status);
CREATE INDEX IF NOT EXISTS idx_bills_member ON jeevika_erp.SocMemberBill(MemberId, BalanceAmount);
CREATE INDEX IF NOT EXISTS idx_billitems_bill ON jeevika_erp.SocMemberBillItem(BillId);
CREATE INDEX IF NOT EXISTS idx_accounts_soc_grp ON jeevika_erp.SocAccount(SocietyId, GroupId);
CREATE INDEX IF NOT EXISTS idx_members_soc_wing_flat ON jeevika_erp.SocMember(SocietyId, Wing, FlatNo);
CREATE INDEX IF NOT EXISTS idx_billing_matrix_lookup ON jeevika_erp.SocBillingMatrix(SocietyId, BillTypeId, MemberId);
CREATE INDEX IF NOT EXISTS idx_bankreco_cleared ON jeevika_erp.SocBankReconciliation(SocietyId, BankAccountId, IsCleared);
CREATE INDEX IF NOT EXISTS idx_fd_accrual_fd ON jeevika_erp.SocFDInterestPosting(FDId);
CREATE INDEX IF NOT EXISTS idx_audit_voucher ON jeevika_erp.SocVoucherAudit(VoucherId);
```

---

## 7. MIGRATION & REFACTORING CHECKLIST (SCRAPING TO PRODUCTION)

1. **Clean Duplicate Schema Definitions:** Remove duplicate `SocBillType` (line 575) and `SocOpeningBankReco` (line 454) definitions in `Database/schema.sql`.
2. **Execute New Tables DDL:** Add `SocBillPrintConfig`, `SocGSTRate`, `SocGeneralConfig`, `SocGroupVisibilityConfig`, `SocPurchaseOrder`, `SocPurchaseOrderItem`, `SocFDInterestPosting`, `SocBankReconciliation`, and `SocVoucherAudit` to `schema.sql`.
3. **Fix SQL Column Bug in Reversals:** Update `MemberReceiptReversalController.cs` to query `SocMemberBill` by `BillNo` instead of `VoucherNo`.
4. **Persist Bill Print Setup:** Refactor `BillPrintSetupController.cs` to read and write to `SocBillPrintConfig` using the active `SocietyId` instead of static C# memory.
5. **Strip Hardcoded Fallbacks:** Remove `localStorage` fallbacks in `purchase-order.js`, `fd-accrued-interest.js`, `voucher-check.js`, and `bill-print-setup.html`, directing all reads/writes through the REST API.
6. **Seed Default Chart of Accounts:** Ensure `seed.sql` populates the standard 34 Groups and 46 Accounts automatically whenever a new society is initialized.

---
*Report Generated for JEEVIKA ERP v2 — Master & Transaction Database Architecture Blueprint.*
