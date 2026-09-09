# 🏗️ JEEVIKA ERP — NEW ARCHITECTURE BLUEPRINT
**Version:** 1.0 | **Status:** Awaiting Approval

---

## 🎯 CORE PRINCIPLES (NON-NEGOTIABLE)

1. **ZERO HARDCODED DATA** — Every value comes from PostgreSQL or `config.js`
2. **ONE FILE PER MODULE** — No duplicates, no fragments, no shells-within-shells
3. **STANDALONE-SAFE UI** — Any HTML file looks identical whether opened alone or via workspace
4. **SINGLE SOURCE OF TRUTH** — One CSS system, one API base URL, one DB schema
5. **PROPER SEPARATION** — Frontend talks to Backend API only. Backend talks to DB only.
6. **SOCIETY + FY SCOPED** — Every single DB record tagged with `society_id` + `fy_id`

---

## 📱 APPLICATION FLOW

```
Browser Opens
     │
     ▼
[login.html]
  ─ User enters credentials
  ─ API: POST /api/auth/login
  ─ Returns JWT token + user info
     │
     ▼ (On success)
[setup.html]  ← SOCIETY + FINANCIAL YEAR SELECTION
  ─ Step 1: Select Society (dropdown, fetched live from API)
  ─ Step 2: Select Financial Year (dropdown, fetched for chosen society)
  ─ Step 3: Confirm → Stored in sessionStorage ONLY
     │
     ▼
[workspace.html]  ← MAIN ERP SHELL (always same UI)
  ─ Top Nav: Module categories (Master, Transaction, Reports, etc.)
  ─ Left Sidebar: Module list for active category
  ─ Main Content: Single iframe-like panel that loads modules
  ─ Status Bar: Shows active Society | Active FY | Logged-in User
     │
     ▼ (User clicks a module)
  Module HTML loads inside Content Panel
  ─ Reads societyId + fyId from sessionStorage
  ─ Calls API with those IDs
  ─ Displays REAL data from PostgreSQL
```

---

## 🗂️ NEW FOLDER STRUCTURE

```
jeevika_erp/                        ← Project Root
│
├── config.js                       ← SINGLE config: API_BASE_URL, APP_NAME, VERSION
│
├── login.html                      ← Login page (standalone, full HTML)
├── setup.html                      ← Society + FY selection (standalone, full HTML)
├── workspace.html                  ← Main ERP shell (standalone, full HTML)
│
├── assets/
│   ├── css/
│   │   ├── global.css              ← ONE global CSS (design tokens, layout)
│   │   └── components.css          ← Reusable component styles (buttons, tables, forms)
│   ├── js/
│   │   ├── api.js                  ← Central API client (uses config.js for base URL)
│   │   ├── auth.js                 ← Token management, session handling
│   │   ├── workspace.js            ← Tab management, module loading engine
│   │   └── utils.js                ← Shared utilities (formatDate, formatAmount, etc.)
│   └── img/                        ← Images, logos
│
├── modules/
│   ├── master/
│   │   ├── society-master.html     ← ONE file, standalone-safe
│   │   ├── society-master.js
│   │   ├── group-master.html
│   │   ├── group-master.js
│   │   ├── account-master.html
│   │   ├── account-master.js
│   │   ├── member-master.html
│   │   ├── member-master.js
│   │   ├── vendor-master.html
│   │   ├── vendor-master.js
│   │   ├── staff-master.html
│   │   ├── staff-master.js
│   │   ├── committee-master.html
│   │   ├── committee-master.js
│   │   ├── bill-type-master.html
│   │   ├── bill-type-master.js
│   │   ├── billing-master.html
│   │   ├── billing-master.js
│   │   ├── gst-master.html
│   │   ├── gst-master.js
│   │   ├── opening-balances.html
│   │   ├── opening-balances.js
│   │   ├── opening-bank-reco.html
│   │   ├── opening-bank-reco.js
│   │   ├── bill-print-setup.html
│   │   └── bill-print-setup.js
│   │
│   ├── transaction/
│   │   ├── journal-voucher.html
│   │   ├── journal-voucher.js
│   │   ├── payment-entry.html
│   │   ├── payment-entry.js
│   │   ├── receipt-entry.html
│   │   ├── receipt-entry.js
│   │   ├── contra-entry.html
│   │   ├── contra-entry.js
│   │   ├── member-bill.html
│   │   ├── member-bill.js
│   │   ├── member-receipt.html
│   │   ├── member-receipt.js
│   │   ├── credit-note.html
│   │   ├── credit-note.js
│   │   ├── debit-note.html
│   │   ├── debit-note.js
│   │   ├── other-receipt.html
│   │   ├── other-receipt.js
│   │   ├── bill-type-transfer.html
│   │   ├── bill-type-transfer.js
│   │   ├── bank-reco.html
│   │   ├── bank-reco.js
│   │   ├── fixed-deposit.html
│   │   ├── fixed-deposit.js
│   │   ├── purchase-order.html
│   │   ├── purchase-order.js
│   │   ├── voucher-check.html
│   │   └── voucher-check.js
│   │
│   ├── member-reports/
│   │   ├── member-register.html
│   │   ├── outstanding-list.html
│   │   ├── bill-register.html
│   │   ├── receipt-register.html
│   │   ├── credit-note-register.html
│   │   ├── debit-note-register.html
│   │   ├── member-account.html
│   │   ├── data-sheet.html
│   │   └── ... (one file per report)
│   │
│   ├── account-reports/
│   │   ├── trial-balance.html
│   │   ├── balance-sheet.html
│   │   ├── income-expenditure.html
│   │   ├── cash-bank-book/
│   │   ├── cash-bank-book.html
│   │   └── cash-bank-book.js
│   │   ├── account-ledger.html
│   │   └── ... (one file per report)
│   │
│   ├── utilities/
│   │   ├── new-year-cf.html
│   │   ├── last-year-bf.html
│   │   ├── import-master-data.html
│   │   ├── export-member-master.html
│   │   └── ... (one file per utility)
│   │
│   ├── statutory/
│   │   └── ... (one file per statutory form)
│   │
│   ├── billing-utilities/
│   │   └── ... (one file per billing utility)
│   │
│   └── admin/
│       ├── user-management.html
│       ├── role-permissions.html
│       └── audit-log.html
│
└── Backend/                        ← ASP.NET Core Web API
    ├── Program.cs
    ├── appsettings.json            ← DB connection string HERE (not in code)
    ├── appsettings.Development.json
    ├── Controllers/
    │   ├── AuthController.cs
    │   ├── SocietyController.cs
    │   ├── FinancialYearController.cs
    │   ├── GroupController.cs
    │   ├── AccountController.cs
    │   ├── MemberController.cs
    │   ├── VendorController.cs
    │   ├── StaffController.cs
    │   ├── CommitteeController.cs
    │   ├── BillTypeController.cs
    │   ├── BillingMasterController.cs
    │   ├── GstController.cs
    │   ├── OpeningBalanceController.cs
    │   ├── VoucherController.cs       ← Handles ALL voucher types via `type` param
    │   ├── MemberBillController.cs
    │   ├── MemberReceiptController.cs
    │   ├── MemberNoteController.cs
    │   ├── BankRecoController.cs
    │   ├── ReportController.cs
    │   └── AdminController.cs
    ├── Models/                        ← All C# model classes
    ├── Services/                      ← Business logic layer
    └── Database/
        ├── schema.sql                 ← SINGLE master schema file
        └── seed.sql                   ← Seed data (only defaults, no test data)
```

---

## 🔧 TECHNOLOGY STACK

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | HTML5 + Vanilla CSS + Vanilla JS | No framework, no CDN-only dependencies |
| **CSS** | Custom CSS with CSS Variables | No Bootstrap, no Tailwind — full control |
| **Icons** | Bootstrap Icons (local copy) | Downloaded locally, no CDN dependency |
| **Charts** | Chart.js (local copy) | For dashboard widgets |
| **Backend** | ASP.NET Core 8 Web API | C#, same as current |
| **Database** | PostgreSQL 14+ | Same as current |
| **ORM** | Npgsql (raw SQL) | Same as current |
| **Auth** | JWT Bearer tokens | Secret from `appsettings.json` |
| **Port** | Configurable in `appsettings.json` | Default 5002 but changeable |

---

## 🔑 CONFIG SYSTEM (Solving Hardcoding Problem)

### `config.js` — The ONLY place API URL is defined:
```javascript
// config.js — loaded FIRST in every HTML file
window.APP_CONFIG = {
  API_BASE: 'http://localhost:5002/api',   // Change once = changes everywhere
  APP_NAME: 'JEEVIKA ERP',
  VERSION: '2.0.0'
};
```

### Every HTML module loads it first:
```html
<script src="../../config.js"></script>
<script src="../../assets/js/api.js"></script>
<script src="./module-name.js"></script>
```

### `api.js` — Central API client:
```javascript
const API = {
  get: (endpoint) => fetch(`${APP_CONFIG.API_BASE}${endpoint}`, {...headers}),
  post: (endpoint, body) => fetch(`${APP_CONFIG.API_BASE}${endpoint}`, {method:'POST',...}),
  put: (endpoint, body) => fetch(...),
  delete: (endpoint) => fetch(...)
};
```

---

## 🗄️ DATABASE ARCHITECTURE

### Core Design Rules:
1. Every table has `society_id` (FK to SocietyInfo)
2. Every transactional table has `fy_id` (FK to FinancialYear)
3. No data is stored in `Remarks` JSON blobs
4. All credentials in `appsettings.json`
5. Single schema: `jeevika_erp`
6. No duplicate tables created at runtime

### Complete Schema (All Tables):

```sql
-- Schema and search path
CREATE SCHEMA IF NOT EXISTS jeevika_erp;
SET search_path TO jeevika_erp, public;

-- ──────────────────────────────────────────────
-- SYSTEM TABLES (No society_id — global)
-- ──────────────────────────────────────────────

-- 1. Users (authentication)
CREATE TABLE SoftUser (
    UserId      SERIAL PRIMARY KEY,
    UserName    VARCHAR(100) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,    -- BCrypt hash, NEVER plain text
    UserType    VARCHAR(50) DEFAULT 'USER',
    UserLevel   VARCHAR(50) DEFAULT '1',
    Role        VARCHAR(50) DEFAULT 'StandardUser',
    IsActive    BOOLEAN DEFAULT TRUE,
    CreatedAt   TIMESTAMPTZ DEFAULT NOW(),
    UpdatedAt   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Society (multi-society support)
CREATE TABLE SocietyInfo (
    SocietyId       SERIAL PRIMARY KEY,
    SocietyCode     VARCHAR(50) NOT NULL UNIQUE,
    SocietyName     VARCHAR(255) NOT NULL,
    SocMarName      VARCHAR(255),           -- Marathi name
    Address         TEXT,
    City            VARCHAR(100),
    Pincode         VARCHAR(20),
    Phone           VARCHAR(50),
    Email           VARCHAR(100),
    RegistrationNo  VARCHAR(100),
    PANNumber       VARCHAR(20),
    TAN             VARCHAR(20),
    GSTNumber       VARCHAR(50),
    GSTApplicable   BOOLEAN DEFAULT FALSE,
    ChairmanName    VARCHAR(100),
    SecretaryName   VARCHAR(100),
    TreasurerName   VARCHAR(100),
    BankName        VARCHAR(100),
    BankAccountNo   VARCHAR(50),
    BankBranch      VARCHAR(100),
    IFSCCode        VARCHAR(20),
    LogoPath        VARCHAR(255),
    IsActive        BOOLEAN DEFAULT TRUE,
    CreatedAt       TIMESTAMPTZ DEFAULT NOW(),
    UpdatedAt       TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Financial Year (per society)
CREATE TABLE FinancialYear (
    FYId        SERIAL PRIMARY KEY,
    SocietyId   INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYLabel     VARCHAR(20) NOT NULL,       -- e.g., '2025-26'
    FYStart     DATE NOT NULL,              -- e.g., 2025-04-01
    FYEnd       DATE NOT NULL,              -- e.g., 2026-03-31
    IsActive    BOOLEAN DEFAULT TRUE,
    IsClosed    BOOLEAN DEFAULT FALSE,
    CreatedAt   TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Transaction Number Config (per type per FY)
CREATE TABLE TxNumberConfig (
    ConfigId        SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYId            INT NOT NULL REFERENCES FinancialYear(FYId),
    VoucherType     VARCHAR(50) NOT NULL,   -- 'Payment', 'Receipt', 'Journal', etc.
    Prefix          VARCHAR(20),            -- e.g., 'PV', 'RV', 'JV'
    StartNo         INT DEFAULT 1,
    LastNo          INT DEFAULT 0,
    UNIQUE(SocietyId, FYId, VoucherType)
);

-- ──────────────────────────────────────────────
-- MASTER TABLES (All have society_id)
-- ──────────────────────────────────────────────

-- 5. Group Master
CREATE TABLE SocGroup (
    GroupId         SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    GrpCode         VARCHAR(50),
    GrpName         VARCHAR(255) NOT NULL,
    GrpMarName      VARCHAR(255),
    GrpMainId       INT NOT NULL,           -- 1=Asset, 2=Liability, 3=Income, 4=Expense
    GrpPrimaryId    INT,
    GrpPrimaryName  VARCHAR(255),
    GrpType         INT DEFAULT 1,          -- 1=User, 2=Default/System
    GrpSubtotal     BOOLEAN DEFAULT FALSE,
    IsDeleted       BOOLEAN DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Account Master
CREATE TABLE SocAccount (
    AccountId       SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    AccCode         VARCHAR(50) NOT NULL,
    AccName         VARCHAR(255) NOT NULL,
    AccMarName      VARCHAR(255),
    GroupId         INT REFERENCES SocGroup(GroupId),
    GrpMainId       INT,
    OpBal           NUMERIC(18,2) DEFAULT 0,
    OpDrCr          VARCHAR(5) DEFAULT 'Dr',
    ClBal           NUMERIC(18,2) DEFAULT 0,
    AccAddress      TEXT,
    AccPAN          VARCHAR(50),
    AccTAN          VARCHAR(50),
    GSTIN           VARCHAR(50),
    Mobile          VARCHAR(50),
    Email           VARCHAR(100),
    TdsRate         NUMERIC(5,2) DEFAULT 0,
    TdsSection      VARCHAR(50),
    IsDefault       BOOLEAN DEFAULT FALSE,  -- System accounts cannot be deleted
    IsDeleted       BOOLEAN DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(SocietyId, AccCode)
);

-- 7. Member Master
CREATE TABLE SocMember (
    MemberId        SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    MemCode         VARCHAR(50) NOT NULL,
    MemName         VARCHAR(255) NOT NULL,
    MemMarName      VARCHAR(255),
    Building        VARCHAR(50),
    Wing            VARCHAR(50),
    FlatNo          VARCHAR(50),
    Floor           VARCHAR(50),
    FlatType        VARCHAR(50),
    UnitNo          VARCHAR(50),
    AreaSqft        NUMERIC(10,2) DEFAULT 0,
    ContactNo       VARCHAR(50),
    Email           VARCHAR(100),
    PANNo           VARCHAR(20),
    TANNo           VARCHAR(20),
    EntryDate       DATE,
    MemberType      VARCHAR(50),
    Shares          INT DEFAULT 0,
    NomineeName     VARCHAR(255),
    OpPrincipal     NUMERIC(18,2) DEFAULT 0,
    OpInterest      NUMERIC(18,2) DEFAULT 0,
    IsDeleted       BOOLEAN DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(SocietyId, MemCode)
);

-- 8. Vendor Master
CREATE TABLE SocVendor (
    VendorId        SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    VendorCode      VARCHAR(50) NOT NULL,
    VendorName      VARCHAR(255) NOT NULL,
    PANNo           VARCHAR(20),
    GSTIN           VARCHAR(50),
    TDSSection      VARCHAR(50),
    TDSRate         NUMERIC(5,2) DEFAULT 0,
    ContactNo       VARCHAR(50),
    Email           VARCHAR(100),
    Address         TEXT,
    ContractNo      VARCHAR(100),
    ContractFrom    DATE,
    ContractTo      DATE,
    ContractValue   NUMERIC(18,2) DEFAULT 0,
    CategoryId      INT,
    IsDeleted       BOOLEAN DEFAULT FALSE,
    UNIQUE(SocietyId, VendorCode)
);

-- 9. Staff Master
CREATE TABLE SocStaff (
    StaffId         SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    StaffCode       VARCHAR(50) NOT NULL,
    StaffName       VARCHAR(255) NOT NULL,
    Designation     VARCHAR(100),
    PANNo           VARCHAR(20),
    TDSRate         NUMERIC(5,2) DEFAULT 0,
    ContactNo       VARCHAR(50),
    Email           VARCHAR(100),
    JoiningDate     DATE,
    IsDeleted       BOOLEAN DEFAULT FALSE,
    UNIQUE(SocietyId, StaffCode)
);

-- 10. Committee Master
CREATE TABLE SocCommittee (
    CommitteeId     SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYId            INT REFERENCES FinancialYear(FYId),
    MemberName      VARCHAR(255) NOT NULL,
    Designation     VARCHAR(100),
    FromDate        DATE,
    ToDate          DATE,
    ContactNo       VARCHAR(50),
    Email           VARCHAR(100),
    IsActive        BOOLEAN DEFAULT TRUE
);

-- 11. Bill Type Master
CREATE TABLE SocBillType (
    BillTypeId      SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    BillTypeCode    VARCHAR(50) NOT NULL,
    BillTypeName    VARCHAR(255) NOT NULL,
    AccountId       INT REFERENCES SocAccount(AccountId),
    IsDefault       BOOLEAN DEFAULT FALSE,
    IsDeleted       BOOLEAN DEFAULT FALSE,
    UNIQUE(SocietyId, BillTypeCode)
);

-- 12. Billing Master (members assigned to bill types)
CREATE TABLE SocBillingMaster (
    BillingId       SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYId            INT NOT NULL REFERENCES FinancialYear(FYId),
    BillTypeId      INT NOT NULL REFERENCES SocBillType(BillTypeId),
    MemberId        INT NOT NULL REFERENCES SocMember(MemberId),
    Amount          NUMERIC(18,2) DEFAULT 0,
    InterestRate    NUMERIC(5,2) DEFAULT 0,
    DueDay          INT DEFAULT 31,
    Remarks         TEXT,
    UNIQUE(SocietyId, FYId, BillTypeId, MemberId)
);

-- 13. GST Master
CREATE TABLE SocGSTRate (
    GSTRateId       SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    GSTCode         VARCHAR(50),
    GSTName         VARCHAR(255),
    CGSTRate        NUMERIC(5,2) DEFAULT 0,
    SGSTRate        NUMERIC(5,2) DEFAULT 0,
    IGSTRate        NUMERIC(5,2) DEFAULT 0,
    IsDeleted       BOOLEAN DEFAULT FALSE
);

-- ──────────────────────────────────────────────
-- TRANSACTION TABLES (All have society_id + fy_id)
-- ──────────────────────────────────────────────

-- 14. Voucher Header (single table for ALL voucher types)
CREATE TABLE SocVoucherHeader (
    VoucherId       SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYId            INT NOT NULL REFERENCES FinancialYear(FYId),
    VoucherNo       VARCHAR(50) NOT NULL,
    VoucherType     VARCHAR(50) NOT NULL,   -- 'Payment','Receipt','Journal','Contra','OtherReceipt'
    VoucherDate     DATE NOT NULL,
    CashBankCode    VARCHAR(50),
    CashBankName    VARCHAR(255),
    Amount          NUMERIC(18,2) DEFAULT 0,
    ChqNo           VARCHAR(50),
    ChqDate         DATE,
    BankName        VARCHAR(100),
    PersonName      VARCHAR(255),
    PersonType      VARCHAR(50),            -- 'Vendor','Staff','Member','Other'
    PersonCode      VARCHAR(50),
    RefNo           VARCHAR(100),
    Narration       TEXT,
    Particular1     TEXT,
    Particular2     TEXT,
    IsAudited       BOOLEAN DEFAULT FALSE,
    AuditedBy       VARCHAR(100),
    AuditedDate     TIMESTAMPTZ,
    Status          VARCHAR(50) DEFAULT 'Posted',
    IsDeleted       BOOLEAN DEFAULT FALSE,
    CreatedBy       VARCHAR(100),
    CreatedAt       TIMESTAMPTZ DEFAULT NOW(),
    UpdatedAt       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(SocietyId, FYId, VoucherNo)
);

-- 15. Voucher Detail (line items)
CREATE TABLE SocVoucherDetail (
    DetailId        SERIAL PRIMARY KEY,
    VoucherId       INT NOT NULL REFERENCES SocVoucherHeader(VoucherId) ON DELETE CASCADE,
    SrNo            INT NOT NULL,
    AccountId       INT REFERENCES SocAccount(AccountId),
    AccountCode     VARCHAR(50),
    AccountName     VARCHAR(255),
    Debit           NUMERIC(18,2) DEFAULT 0,
    Credit          NUMERIC(18,2) DEFAULT 0,
    Narration       TEXT
);

-- 16. Member Bill Header
CREATE TABLE SocMemberBill (
    BillId          SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYId            INT NOT NULL REFERENCES FinancialYear(FYId),
    BillNo          VARCHAR(50) NOT NULL,
    MemberId        INT NOT NULL REFERENCES SocMember(MemberId),
    BillTypeId      INT REFERENCES SocBillType(BillTypeId),
    BillDate        DATE NOT NULL,
    DueDate         DATE,
    PrincipalAmount NUMERIC(18,2) DEFAULT 0,
    InterestAmount  NUMERIC(18,2) DEFAULT 0,
    TotalAmount     NUMERIC(18,2) DEFAULT 0,
    PaidAmount      NUMERIC(18,2) DEFAULT 0,
    BalanceAmount   NUMERIC(18,2) DEFAULT 0,
    Status          VARCHAR(50) DEFAULT 'Unpaid',
    VoucherId       INT REFERENCES SocVoucherHeader(VoucherId),
    IsDeleted       BOOLEAN DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(SocietyId, FYId, BillNo)
);

-- 17. Member Note (Credit Note / Debit Note)
CREATE TABLE SocMemberNote (
    NoteId          SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYId            INT NOT NULL REFERENCES FinancialYear(FYId),
    NoteNo          VARCHAR(50) NOT NULL,
    NoteType        VARCHAR(50) NOT NULL,   -- 'CreditNote', 'DebitNote'
    NoteDate        DATE NOT NULL,
    MemberId        INT REFERENCES SocMember(MemberId),
    BillId          INT REFERENCES SocMemberBill(BillId),
    Amount          NUMERIC(18,2) DEFAULT 0,
    Reason          TEXT,
    IsDeleted       BOOLEAN DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(SocietyId, FYId, NoteNo)
);

-- 18. Opening Balances
CREATE TABLE SocOpeningBalance (
    OpenBalId       SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYId            INT NOT NULL REFERENCES FinancialYear(FYId),
    AccountId       INT NOT NULL REFERENCES SocAccount(AccountId),
    OpenBal         NUMERIC(18,2) DEFAULT 0,
    DrCr            VARCHAR(5) DEFAULT 'Dr',
    EntryDate       DATE,
    UNIQUE(SocietyId, FYId, AccountId)
);

-- 19. Opening Bank Reco
CREATE TABLE SocOpeningBankReco (
    BankRecoId      SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYId            INT NOT NULL REFERENCES FinancialYear(FYId),
    AccountId       INT NOT NULL REFERENCES SocAccount(AccountId),
    ChqNo           VARCHAR(50),
    ChqDate         DATE,
    Amount          NUMERIC(18,2) DEFAULT 0,
    Narration       TEXT,
    IsCleared       BOOLEAN DEFAULT FALSE
);

-- 20. Fixed Deposit
CREATE TABLE SocFixedDeposit (
    FDId            SERIAL PRIMARY KEY,
    SocietyId       INT NOT NULL REFERENCES SocietyInfo(SocietyId),
    FYId            INT NOT NULL REFERENCES FinancialYear(FYId),
    FDNo            VARCHAR(50),
    BankName        VARCHAR(255),
    AccountId       INT REFERENCES SocAccount(AccountId),
    Principal       NUMERIC(18,2) DEFAULT 0,
    InterestRate    NUMERIC(5,2) DEFAULT 0,
    StartDate       DATE,
    MaturityDate    DATE,
    MaturityAmount  NUMERIC(18,2) DEFAULT 0,
    Status          VARCHAR(50) DEFAULT 'Active',
    IsDeleted       BOOLEAN DEFAULT FALSE
);

-- 21. Audit Log
CREATE TABLE AuditLog (
    AuditId         SERIAL PRIMARY KEY,
    SocietyId       INT REFERENCES SocietyInfo(SocietyId),
    UserId          INT REFERENCES SoftUser(UserId),
    TableName       VARCHAR(100),
    RecordId        INT,
    Action          VARCHAR(50),            -- 'INSERT','UPDATE','DELETE'
    OldData         JSONB,
    NewData         JSONB,
    IPAddress       VARCHAR(50),
    CreatedAt       TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- INDEXES (Performance)
-- ──────────────────────────────────────────────
CREATE INDEX idx_voucher_society_fy ON SocVoucherHeader(SocietyId, FYId);
CREATE INDEX idx_voucher_date ON SocVoucherHeader(VoucherDate);
CREATE INDEX idx_voucher_type ON SocVoucherHeader(VoucherType);
CREATE INDEX idx_member_society ON SocMember(SocietyId);
CREATE INDEX idx_account_society ON SocAccount(SocietyId);
CREATE INDEX idx_bill_society_fy ON SocMemberBill(SocietyId, FYId);
CREATE INDEX idx_bill_member ON SocMemberBill(MemberId);
```

---

## 🔌 BACKEND API ARCHITECTURE

### `appsettings.json` (No hardcoding in code):
```json
{
  "ConnectionStrings": {
    "Default": "Host=127.0.0.1;Port=5432;Database=jeevika_db;Username=postgres;Password=YOUR_PASSWORD;SearchPath=jeevika_erp,public"
  },
  "JwtSettings": {
    "Secret": "your-256-bit-secret-from-environment",
    "ExpiryHours": 8
  },
  "AllowedHosts": "*",
  "ApplicationPort": 5002
}
```

### Complete API Endpoint Map:

```
AUTH
  POST   /api/auth/login
  POST   /api/auth/logout
  GET    /api/auth/me

SOCIETY
  GET    /api/societies
  POST   /api/societies
  PUT    /api/societies/{id}
  DELETE /api/societies/{id}

FINANCIAL YEAR
  GET    /api/societies/{id}/financial-years
  POST   /api/societies/{id}/financial-years
  PUT    /api/financial-years/{id}

MASTER — GROUP
  GET    /api/groups?societyId=&fyId=
  POST   /api/groups
  PUT    /api/groups/{id}
  DELETE /api/groups/{id}

MASTER — ACCOUNT
  GET    /api/accounts?societyId=&fyId=
  POST   /api/accounts
  PUT    /api/accounts/{id}
  DELETE /api/accounts/{id}

MASTER — MEMBER
  GET    /api/members?societyId=
  POST   /api/members
  PUT    /api/members/{id}
  DELETE /api/members/{id}

MASTER — VENDOR, STAFF, COMMITTEE, BILL-TYPE, BILLING, GST
  (same REST pattern: GET, POST, PUT, DELETE with societyId query param)

TRANSACTIONS — VOUCHERS
  GET    /api/vouchers?societyId=&fyId=&type=Payment
  GET    /api/vouchers/{id}
  POST   /api/vouchers
  PUT    /api/vouchers/{id}
  DELETE /api/vouchers/{id}
  GET    /api/vouchers/next-no?societyId=&fyId=&type=Payment

TRANSACTIONS — MEMBER BILLS
  GET    /api/member-bills?societyId=&fyId=
  GET    /api/member-bills/{id}
  POST   /api/member-bills
  PUT    /api/member-bills/{id}
  DELETE /api/member-bills/{id}
  GET    /api/member-bills/next-no?societyId=&fyId=

REPORTS
  GET    /api/reports/trial-balance?societyId=&fyId=
  GET    /api/reports/balance-sheet?societyId=&fyId=
  GET    /api/reports/account-ledger?societyId=&fyId=&accountId=
  GET    /api/reports/cash-book?societyId=&fyId=
  GET    /api/reports/bank-book?societyId=&fyId=&bankAccountId=
  GET    /api/reports/member-register?societyId=&fyId=
  GET    /api/reports/outstanding-list?societyId=&fyId=
  (... one endpoint per report)
```

---

## 🎨 FRONTEND ARCHITECTURE

### Standalone-Safe Module Design

Every module HTML file is **complete and self-contained**:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Group Master — JEEVIKA ERP</title>
  <!-- Load global config FIRST -->
  <script src="../../config.js"></script>
  <!-- Global CSS — works from any location via absolute or root-relative path -->
  <link rel="stylesheet" href="../../assets/css/global.css">
  <link rel="stylesheet" href="../../assets/css/components.css">
</head>
<body class="erp-module-standalone">
  <!-- This wrapper is transparent when running inside workspace -->
  <div class="module-container" id="group-master-root">
    <!-- Full module content here -->
  </div>
  
  <!-- Scripts -->
  <script src="../../assets/js/api.js"></script>
  <script src="../../assets/js/utils.js"></script>
  <script src="./group-master.js"></script>
</body>
</html>
```

When loaded inside workspace, the workspace CSS hides `body` padding and the module fits seamlessly. When opened standalone, it looks identical because all CSS/JS paths use relative-from-root references that work from any depth.

### UI Design System (Consistent Across ALL Files):
- Same classic Windows XP-era 3D ERP aesthetic as current (user requested UI stays same)
- CSS Variables defined in `global.css` — never repeated in modules
- Same fonts (Segoe UI as primary, system-ui as fallback)
- Color palette: `#D4D0C8` (silver), `#000080` (navy), `#808080` (gray borders)
- Every button: `classic-erp-btn` class from `global.css`
- Every table: `classic-erp-table` class from `global.css`

### Session Management (No localStorage for data):
```javascript
// Stored in sessionStorage (cleared on browser close, secure)
sessionStorage.setItem('activeSocietyId', '1');
sessionStorage.setItem('activeSocietyName', 'Sai Ram Society');
sessionStorage.setItem('activeFYId', '3');
sessionStorage.setItem('activeFYLabel', '2025-26');
sessionStorage.setItem('jwtToken', '...');
sessionStorage.setItem('userName', 'ADMIN');

// ALL module JS reads from sessionStorage — NEVER from localStorage
const societyId = sessionStorage.getItem('activeSocietyId');
const fyId = sessionStorage.getItem('activeFYId');
```

---

## 📋 BUILD PHASES

### PHASE 1: Foundation (Week 1)
**Goal:** Working login → setup → workspace shell with no modules

1. `config.js` — API base URL, app name
2. `assets/css/global.css` — Complete design system (variables, layout, classic ERP style)
3. `assets/css/components.css` — Buttons, tables, forms, modals
4. `assets/js/api.js` — Central fetch wrapper with JWT header injection
5. `assets/js/auth.js` — Token management, redirect guards
6. `assets/js/utils.js` — formatDate, formatAmount, showToast, showConfirm
7. `login.html` + `login.js` — Complete login flow
8. `setup.html` + `setup.js` — Society + FY selection (live from API)
9. `workspace.html` + `assets/js/workspace.js` — Shell with sidebar, tab system
10. `Backend/` — Program.cs, appsettings.json, AuthController, SocietyController, FinancialYearController
11. `Database/schema.sql` — Complete single schema file

### PHASE 2: Master Modules (Week 2)
**Goal:** All master data modules working with real PostgreSQL

Priority order:
1. `group-master.html` + `GroupController.cs`
2. `account-master.html` + `AccountController.cs`
3. `member-master.html` + `MemberController.cs`
4. `vendor-master.html` + `VendorController.cs`
5. `staff-master.html` + `StaffController.cs`
6. `committee-master.html` + `CommitteeController.cs`
7. `bill-type-master.html` + `BillTypeController.cs`
8. `billing-master.html` + `BillingMasterController.cs`
9. `gst-master.html` + `GstController.cs`
10. `opening-balances.html` + `OpeningBalanceController.cs`

### PHASE 3: Transaction Modules (Week 3)
**Goal:** All transactions saving to PostgreSQL, numbered per FY

Priority order:
1. `journal-voucher.html` + `VoucherController.cs`
2. `payment-entry.html` (reuses VoucherController)
3. `receipt-entry.html` (reuses VoucherController)
4. `contra-entry.html` (reuses VoucherController)
5. `member-bill.html` + `MemberBillController.cs`
6. `member-receipt.html` (reuses VoucherController + links to bills)
7. `credit-note.html` + `MemberNoteController.cs`
8. `debit-note.html` (reuses MemberNoteController)
9. `other-receipt.html` (reuses VoucherController)
10. `bank-reco.html` + `BankRecoController.cs`

### PHASE 4: Reports (Week 4)
**Goal:** All reports reading live data from PostgreSQL

1. Trial Balance
2. Balance Sheet / Income & Expenditure
3. Account Ledger
4. Cash Book / Bank Book
5. Member Register / Outstanding List
6. Bill Register / Receipt Register
7. Credit Note & Debit Note Reports

### PHASE 5: Utilities + Statutory + Admin (Week 5)
1. New Year CF / Last Year BF
2. Import/Export
3. User Management / Role Permissions
4. Statutory forms (I-Register, J-Register, Share Register, etc.)
5. Communication (Email/WhatsApp) integration

---

## ✅ THINGS TO NOTE (That Were Missed / Skipped in Old Project)

> [!IMPORTANT]
> **These were missing before — must be included in new build:**

1. **Financial Year Management UI** — A proper screen to create, close, and switch FYs
2. **User Role System** — ADMIN creates users, assigns roles (View/Edit/Delete per module)
3. **Audit Trail** — Every DB insert/update/delete logged with user name + timestamp
4. **Session Timeout** — JWT expires after 8 hours, user redirected to login
5. **Print/PDF Support** — Every report and voucher must have a print-optimized CSS (`@media print`)
6. **Voucher Number Reset per FY** — Payment vouchers restart from 1 in new FY
7. **Multi-Society Data Isolation** — Every query filters by `societyId` (cannot see other society's data)
8. **Proper Password Hashing** — BCrypt in AuthController, never store plain text
9. **Error Handling** — Every API call shows user-friendly error message, never blank screen
10. **Loader/Spinner** — All async calls show a loading indicator
11. **Keyboard Shortcuts** — Tab navigation through form fields (ERP users use keyboard)
12. **Data Validation** — Both client-side (immediate feedback) and server-side (security)
13. **Backup/Restore** — A utility to export complete society data as SQL
14. **GST Calculation** — Automatic CGST/SGST split on applicable transactions
15. **Interest Calculation** — On outstanding bills (per billing master settings)

---

## 🚫 STRICT RULES FOR NEW PROJECT

| Rule | Old Project Violation | New Project Fix |
|---|---|---|
| No hardcoded API URLs | `localhost:5002` in 100+ places | Single `config.js` |
| No hardcoded passwords | `henuos` in source code | `appsettings.json` only |
| No hardcoded JWT secrets | Plain string in code | `appsettings.json` only |
| No plain text passwords | DB stores 'ADMIN'/'ADMIN' | BCrypt hash |
| No duplicate files | 2-5 HTML files per module | 1 HTML + 1 JS per module |
| No mock data files | `*-mock-data.js` everywhere | Deleted, real API only |
| No localStorage for transactions | All data in browser | PostgreSQL only |
| No runtime table creation | Controller creates tables | Schema.sql only |
| No parallel duplicate directories | `account-report` + `account-reports` | One directory per category |
| No empty stub files | 196-byte placeholder HTMLs | Either implement or omit |
| FY scoping on all transactions | No fy_id in old tables | `fy_id` column everywhere |
| Society scoping on all data | Some tables missing society_id | `society_id` column everywhere |































A                     B                      

        C                       D 