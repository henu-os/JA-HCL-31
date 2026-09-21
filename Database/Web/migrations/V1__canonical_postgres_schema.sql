-- ═══════════════════════════════════════════════════════════
-- JEEVIKA ERP v2 — CANONICAL WEB POSTGRESQL SCHEMA (V1 MIGRATION)
-- Location: Database/Web/migrations/
-- PostgreSQL 14+ / 16+ compatible
-- Schema: jeevika_erp
-- ═══════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS jeevika_erp;
SET search_path TO jeevika_erp, public;

-- ──────────────────────────────────────────────────────────
-- 0. MIGRATION TRACKING TABLE
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jeevika_erp.schema_migrations (
    version INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- 1. SYSTEM TABLES (Global)
-- ──────────────────────────────────────────────────────────

-- 1. Users (Authentication)
CREATE TABLE IF NOT EXISTS jeevika_erp.SoftUser (
    UserId        SERIAL PRIMARY KEY,
    UserName      VARCHAR(100) NOT NULL UNIQUE,
    PasswordHash  VARCHAR(255) NOT NULL,
    UserType      VARCHAR(50)  DEFAULT 'USER',
    UserLevel     VARCHAR(50)  DEFAULT '1',
    Role          VARCHAR(50)  DEFAULT 'StandardUser',
    IsActive      BOOLEAN      DEFAULT TRUE,
    CreatedAt     TIMESTAMPTZ  DEFAULT NOW(),
    UpdatedAt     TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. Society Info
CREATE TABLE IF NOT EXISTS jeevika_erp.SocietyInfo (
    SocietyId       SERIAL PRIMARY KEY,
    SocietyCode     VARCHAR(50)  NOT NULL UNIQUE,
    SocietyName     VARCHAR(255) NOT NULL,
    SocMarName      VARCHAR(255),
    StartingYear    VARCHAR(20),
    Address         TEXT,
    City            VARCHAR(100),
    Pincode         VARCHAR(20),
    Phone           VARCHAR(50),
    Email           VARCHAR(100),
    RegistrationNo  VARCHAR(100),
    PANNumber       VARCHAR(20),
    TAN             VARCHAR(20),
    PTNo            VARCHAR(50),
    UIDNumber       VARCHAR(50),
    AreaType        VARCHAR(50),
    AreaCategory    VARCHAR(50),
    AreaUnit        VARCHAR(20)  DEFAULT 'Sq.Ft',
    GSTApplicable   BOOLEAN      DEFAULT FALSE,
    GSTNumber       VARCHAR(50),
    HSNCode         VARCHAR(50),
    CGSTCode        VARCHAR(50),
    SGSTCode        VARCHAR(50),
    CGSTPct         NUMERIC(5,2) DEFAULT 9,
    SGSTPct         NUMERIC(5,2) DEFAULT 9,
    IntDuesGST      VARCHAR(50)  DEFAULT 'No',
    ExemptLimit     NUMERIC(18,2) DEFAULT 7500,
    ExemptAmount    NUMERIC(18,2) DEFAULT 7500,
    ChairmanName    VARCHAR(100),
    SecretaryName   VARCHAR(100),
    TreasurerName   VARCHAR(100),
    HonChairman     VARCHAR(100),
    HonSecretary    VARCHAR(100),
    HonTreasurer    VARCHAR(100),
    ContactName1    VARCHAR(100),
    ContactPhone1   VARCHAR(50),
    ContactEmail1   VARCHAR(100),
    ContactName2    VARCHAR(100),
    ContactPhone2   VARCHAR(50),
    ContactEmail2   VARCHAR(100),
    CommWhatsApp    CHAR(1)      DEFAULT 'N',
    CommSMS         CHAR(1)      DEFAULT 'N',
    CommRCS         CHAR(1)      DEFAULT 'N',
    CommEmail       CHAR(1)      DEFAULT 'N',
    CommNotification CHAR(1)    DEFAULT 'N',
    BankName        VARCHAR(100),
    BankAccountNo   VARCHAR(50),
    BankBranch      VARCHAR(100),
    IFSCCode        VARCHAR(20),
    LogoPath        VARCHAR(255),
    IsActive        BOOLEAN      DEFAULT TRUE,
    CreatedAt       TIMESTAMPTZ  DEFAULT NOW(),
    UpdatedAt       TIMESTAMPTZ  DEFAULT NOW()
);

-- 3. Financial Year
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

-- 4. Transaction Number Config
CREATE TABLE IF NOT EXISTS jeevika_erp.TxNumberConfig (
    ConfigId      SERIAL PRIMARY KEY,
    SocietyId     INT         NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId          INT         NOT NULL REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE CASCADE,
    VoucherType   VARCHAR(50) NOT NULL,
    Prefix        VARCHAR(20)  DEFAULT '',
    StartNo       INT          DEFAULT 1,
    LastNo        INT          DEFAULT 0,
    UNIQUE(SocietyId, FYId, VoucherType)
);

-- ──────────────────────────────────────────────────────────
-- 2. MASTER TABLES (Scoped by SocietyId)
-- ──────────────────────────────────────────────────────────

-- 5. Group Master
CREATE TABLE IF NOT EXISTS jeevika_erp.SocGroup (
    GroupId         SERIAL PRIMARY KEY,
    SocietyId       INT          NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    GrpCode         VARCHAR(50),
    GrpName         VARCHAR(255) NOT NULL,
    GrpMarName      VARCHAR(255),
    GrpMainId       INT          NOT NULL DEFAULT 1,
    GrpPrimaryId    INT,
    GrpPrimaryName  VARCHAR(255),
    GrpType         INT          DEFAULT 1,
    GrpSubtotal     BOOLEAN      DEFAULT FALSE,
    IsDeleted       BOOLEAN      DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ  DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_socgroup_code_active ON jeevika_erp.SocGroup (SocietyId, GrpCode) WHERE IsDeleted = FALSE;

-- 6. Account Master
CREATE TABLE IF NOT EXISTS jeevika_erp.SocAccount (
    AccountId     SERIAL PRIMARY KEY,
    SocietyId     INT          NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    AccCode       VARCHAR(50)  NOT NULL,
    AccName       VARCHAR(255) NOT NULL,
    AccMarName    VARCHAR(255),
    AccBSName     VARCHAR(255),
    GroupId       INT          REFERENCES jeevika_erp.SocGroup(GroupId),
    GrpMainId     INT,
    OpBal         NUMERIC(18,2) DEFAULT 0,
    OpDrCr        VARCHAR(5)    DEFAULT 'Dr',
    PrBal         NUMERIC(18,2) DEFAULT 0,
    PrDrCr        VARCHAR(5)    DEFAULT 'Dr',
    ClBal         NUMERIC(18,2) DEFAULT 0,
    DepAnnual     NUMERIC(5,2)  DEFAULT 0,
    DepHalf       NUMERIC(5,2)  DEFAULT 0,
    AccAddress    TEXT,
    AccPAN        VARCHAR(50),
    AccTAN        VARCHAR(50),
    GSTIN         VARCHAR(50),
    Mobile        VARCHAR(50),
    Mobile2       VARCHAR(50),
    Email         VARCHAR(100),
    TdsRate       NUMERIC(5,2)  DEFAULT 0,
    TdsSection    VARCHAR(50),
    IsDefault     BOOLEAN      DEFAULT FALSE,
    IsDeleted     BOOLEAN      DEFAULT FALSE,
    CreatedAt     TIMESTAMPTZ  DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_socaccount_code_active ON jeevika_erp.SocAccount (SocietyId, AccCode) WHERE IsDeleted = FALSE;

-- 7. Member Master
CREATE TABLE IF NOT EXISTS jeevika_erp.SocMember (
    MemberId          SERIAL PRIMARY KEY,
    SocietyId         INT          NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemCode           VARCHAR(50)  NOT NULL,
    MemName           VARCHAR(255) NOT NULL,
    MemName2          VARCHAR(255),
    MemName3          VARCHAR(255),
    MemName4          VARCHAR(255),
    MemName5          VARCHAR(255),
    MemMarName        VARCHAR(255),
    Building          VARCHAR(50),
    Wing              VARCHAR(50),
    FlatNo            VARCHAR(50),
    Floor             VARCHAR(50),
    UnitType          VARCHAR(50),
    FlatType          VARCHAR(50),
    UnitNo            VARCHAR(50),
    AreaSqft          NUMERIC(10,2) DEFAULT 0,
    AreaType          VARCHAR(50),
    AreaCategory      VARCHAR(50),
    AreaUnit          VARCHAR(20)   DEFAULT 'Sq.Ft',
    ContactNo         VARCHAR(50),
    Email             VARCHAR(100),
    PANNo             VARCHAR(20),
    TANNo             VARCHAR(20),
    EntryDate         DATE,
    MemberType        VARCHAR(50)   DEFAULT 'Owner',
    Shares            INT           DEFAULT 0,
    NonOccApplicable  VARCHAR(10)   DEFAULT 'No',
    NonOccReason      VARCHAR(100),
    TenantName        VARCHAR(255),
    TenantContact     VARCHAR(50),
    ParkingSlot2W     VARCHAR(50),
    ParkingSlot4W     VARCHAR(50),
    VehicleNo2W       VARCHAR(50),
    VehicleNo4W       VARCHAR(50),
    LienBankName      VARCHAR(255),
    LienLoanNo        VARCHAR(100),
    LienAmount        NUMERIC(18,2) DEFAULT 0,
    LienStatus        VARCHAR(50)   DEFAULT 'None',
    ShareCertNo       VARCHAR(50),
    FolioNo           VARCHAR(50),
    ShareFromNo       INT           DEFAULT 0,
    ShareToNo         INT           DEFAULT 0,
    NomineeName       VARCHAR(255),
    NomineeRelation   VARCHAR(100),
    NomineeAddress    TEXT,
    NomineeSharePct   NUMERIC(5,2)  DEFAULT 100,
    IsTransferred     VARCHAR(10)   DEFAULT 'No',
    TransferDate      DATE,
    TransferType      VARCHAR(50),
    TransfereeName    VARCHAR(255),
    OpPrincipal       NUMERIC(18,2) DEFAULT 0,
    OpInterest        NUMERIC(18,2) DEFAULT 0,
    IsDeleted         BOOLEAN       DEFAULT FALSE,
    CreatedAt         TIMESTAMPTZ   DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_socmember_active_memcode ON jeevika_erp.SocMember (SocietyId, UPPER(MemCode)) WHERE IsDeleted = FALSE;

-- 8. Vendor Master
CREATE TABLE IF NOT EXISTS jeevika_erp.SocVendor (
    VendorId        SERIAL PRIMARY KEY,
    SocietyId       INT          NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    VendorCode      VARCHAR(50)  NOT NULL,
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
    IsDeleted       BOOLEAN       DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, VendorCode)
);

-- 9. Staff Master
CREATE TABLE IF NOT EXISTS jeevika_erp.SocStaff (
    StaffId         SERIAL PRIMARY KEY,
    SocietyId       INT          NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    StaffCode       VARCHAR(50)  NOT NULL,
    StaffName       VARCHAR(255) NOT NULL,
    Designation     VARCHAR(100),
    PANNo           VARCHAR(20),
    TDSRate         NUMERIC(5,2) DEFAULT 0,
    ContactNo       VARCHAR(50),
    Phone2          VARCHAR(50),
    Email           VARCHAR(100),
    JoiningDate     DATE,
    EndDate         DATE,
    MonthlyCost     NUMERIC(18,2) DEFAULT 0,
    Status          VARCHAR(50)   DEFAULT 'Active',
    BankHolder      VARCHAR(255),
    BankAccount     VARCHAR(100),
    BankName        VARCHAR(255),
    BankIfsc        VARCHAR(50),
    BankBranch      VARCHAR(255),
    TdsSection      VARCHAR(50)   DEFAULT 'None',
    PfNo            VARCHAR(100),
    EsicNo          VARCHAR(100),
    IsAuthorized    BOOLEAN       DEFAULT FALSE,
    Notes           TEXT,
    IsDeleted       BOOLEAN       DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, StaffCode)
);

-- 10. Committee Master
CREATE TABLE IF NOT EXISTS jeevika_erp.SocCommittee (
    CommitteeId   SERIAL PRIMARY KEY,
    SocietyId     INT          NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId          INT          REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE SET NULL,
    MemberName    VARCHAR(255) NOT NULL,
    Designation   VARCHAR(100),
    FromDate      DATE,
    ToDate        DATE,
    ContactNo     VARCHAR(50),
    Email         VARCHAR(100),
    IsActive      BOOLEAN      DEFAULT TRUE
);

-- 11. Bill Type Master
CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillType (
    BillTypeId    SERIAL PRIMARY KEY,
    SocietyId     INT          NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    BillTypeCode  VARCHAR(50)  DEFAULT 'MAINT',
    BillTypeName  VARCHAR(100) NOT NULL,
    Description   VARCHAR(255),
    AccountId     INT          REFERENCES jeevika_erp.SocAccount(AccountId) ON DELETE SET NULL,
    IsDefault     BOOLEAN      DEFAULT FALSE,
    IsActive      BOOLEAN      DEFAULT TRUE,
    IsDeleted     BOOLEAN      DEFAULT FALSE,
    CreatedAt     TIMESTAMPTZ  DEFAULT NOW(),
    UpdatedAt     TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(SocietyId, BillTypeName)
);

-- 12. Billing Master Matrix
CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillingMatrix (
    MatrixId      SERIAL PRIMARY KEY,
    SocietyId     INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId          INT           REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE SET NULL,
    BillTypeId    INT           NOT NULL REFERENCES jeevika_erp.SocBillType(BillTypeId) ON DELETE CASCADE,
    MemberId      INT           NOT NULL REFERENCES jeevika_erp.SocMember(MemberId) ON DELETE CASCADE,
    AccountCode   VARCHAR(50)   NOT NULL,
    Amount        NUMERIC(18,2) DEFAULT 0,
    UpdatedAt     TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, BillTypeId, MemberId, AccountCode)
);

-- 12b. Billing Setting
CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillingSetting (
    SettingId     SERIAL PRIMARY KEY,
    SocietyId     INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    BillTypeId    INT           NOT NULL REFERENCES jeevika_erp.SocBillType(BillTypeId) ON DELETE CASCADE,
    GSTCalc       VARCHAR(20)   DEFAULT 'MANUAL',
    InterestCalc  VARCHAR(20)   DEFAULT 'MANUAL',
    UpdatedAt     TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, BillTypeId)
);

-- 13. Opening Bank Reco Master
CREATE TABLE IF NOT EXISTS jeevika_erp.SocOpeningBankReco (
    RecoId          SERIAL PRIMARY KEY,
    SocietyId       INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INT           REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE SET NULL,
    VoucherNo       VARCHAR(50)   NOT NULL,
    VoucherDate     DATE          NOT NULL,
    AccountId       INT           REFERENCES jeevika_erp.SocAccount(AccountId) ON DELETE SET NULL,
    BankName        VARCHAR(255)  NOT NULL,
    UnclearedAmount NUMERIC(18,2) NOT NULL DEFAULT 0,
    ChequeNo        VARCHAR(50),
    ChequeDate      DATE,
    BillRefNo       VARCHAR(50),
    PaidTo          VARCHAR(255),
    Narration       TEXT,
    Particular1     TEXT,
    Particular2     TEXT,
    IsCleared       BOOLEAN       DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, VoucherNo)
);

-- ──────────────────────────────────────────────────────────
-- 3. TRANSACTION TABLES (Scoped by SocietyId + FYId)
-- ──────────────────────────────────────────────────────────

-- 14. Voucher Header
CREATE TABLE IF NOT EXISTS jeevika_erp.SocVoucherHeader (
    VoucherId       SERIAL PRIMARY KEY,
    SocietyId       INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INT           NOT NULL REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE CASCADE,
    VoucherNo       VARCHAR(50)   NOT NULL,
    VoucherType     VARCHAR(50)   NOT NULL,
    VoucherDate     DATE          NOT NULL,
    CashBankCode    VARCHAR(50),
    CashBankName    VARCHAR(255),
    Amount          NUMERIC(18,2) DEFAULT 0,
    ChqNo           VARCHAR(50),
    ChqDate         DATE,
    BankName        VARCHAR(100),
    PersonName      VARCHAR(255),
    PersonType      VARCHAR(50),
    PersonCode      VARCHAR(50),
    RefNo           VARCHAR(100),
    Narration       TEXT,
    Particular1     TEXT,
    Particular2     TEXT,
    IsAudited       BOOLEAN       DEFAULT FALSE,
    AuditedBy       VARCHAR(100),
    AuditedDate     TIMESTAMPTZ,
    ClearingDate    DATE,
    ClearingRemark  TEXT,
    Status          VARCHAR(50)   DEFAULT 'Posted',
    IsDeleted       BOOLEAN       DEFAULT FALSE,
    CreatedBy       VARCHAR(100),
    CreatedAt       TIMESTAMPTZ   DEFAULT NOW(),
    UpdatedAt       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, FYId, VoucherNo)
);

-- 15. Voucher Detail
CREATE TABLE IF NOT EXISTS jeevika_erp.SocVoucherDetail (
    DetailId      SERIAL PRIMARY KEY,
    VoucherId     INT           NOT NULL REFERENCES jeevika_erp.SocVoucherHeader(VoucherId) ON DELETE CASCADE,
    SrNo          INT           NOT NULL DEFAULT 1,
    AccountId     INT           REFERENCES jeevika_erp.SocAccount(AccountId) ON DELETE SET NULL,
    AccountCode   VARCHAR(50),
    AccountName   VARCHAR(255),
    Debit         NUMERIC(18,2) DEFAULT 0,
    Credit        NUMERIC(18,2) DEFAULT 0,
    Narration     TEXT
);

-- 16. Member Bill Header
CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberBill (
    BillId          SERIAL PRIMARY KEY,
    SocietyId       INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INT           NOT NULL REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE CASCADE,
    BillNo          VARCHAR(50)   NOT NULL,
    MemberId        INT           NOT NULL REFERENCES jeevika_erp.SocMember(MemberId) ON DELETE RESTRICT,
    BillTypeId      INT           REFERENCES jeevika_erp.SocBillType(BillTypeId) ON DELETE SET NULL,
    BillType        VARCHAR(100)  DEFAULT 'Maintenance',
    Period          VARCHAR(100),
    BillDate        DATE          NOT NULL,
    DueDate         DATE,
    PrincipalAmount NUMERIC(18,2) DEFAULT 0,
    InterestAmount  NUMERIC(18,2) DEFAULT 0,
    TotalAmount     NUMERIC(18,2) DEFAULT 0,
    PaidAmount      NUMERIC(18,2) DEFAULT 0,
    BalanceAmount   NUMERIC(18,2) DEFAULT 0,
    Particular1     TEXT,
    Particular2     TEXT,
    Status          VARCHAR(50)   DEFAULT 'Unpaid',
    VoucherId       INT           REFERENCES jeevika_erp.SocVoucherHeader(VoucherId) ON DELETE SET NULL,
    IsDeleted       BOOLEAN       DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, FYId, BillNo)
);

-- 16b. Member Bill Item Breakdown
CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberBillItem (
    ItemId          SERIAL PRIMARY KEY,
    BillId          INT NOT NULL REFERENCES jeevika_erp.SocMemberBill(BillId) ON DELETE CASCADE,
    AccountCode     VARCHAR(50),
    AccountName     VARCHAR(255),
    Amount          NUMERIC(18,2) DEFAULT 0
);

-- 17. Member Note
CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberNote (
    NoteId      SERIAL PRIMARY KEY,
    SocietyId   INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId        INT           NOT NULL REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE CASCADE,
    NoteNo      VARCHAR(50)   NOT NULL,
    NoteType    VARCHAR(50)   NOT NULL,
    NoteDate    DATE          NOT NULL,
    MemberId    INT           REFERENCES jeevika_erp.SocMember(MemberId) ON DELETE RESTRICT,
    BillId      INT           REFERENCES jeevika_erp.SocMemberBill(BillId) ON DELETE SET NULL,
    Amount      NUMERIC(18,2) DEFAULT 0,
    Reason      TEXT,
    IsDeleted   BOOLEAN       DEFAULT FALSE,
    CreatedAt   TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, FYId, NoteNo)
);

-- 18. Opening Balances
CREATE TABLE IF NOT EXISTS jeevika_erp.SocOpeningBalance (
    OpenBalId   SERIAL PRIMARY KEY,
    SocietyId   INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId        INT           NOT NULL REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE CASCADE,
    AccountId   INT           NOT NULL REFERENCES jeevika_erp.SocAccount(AccountId) ON DELETE CASCADE,
    OpenBal     NUMERIC(18,2) DEFAULT 0,
    DrCr        VARCHAR(5)    DEFAULT 'Dr',
    EntryDate   DATE,
    UNIQUE(SocietyId, FYId, AccountId)
);

-- 19. Fixed Deposit
CREATE TABLE IF NOT EXISTS jeevika_erp.SocFixedDeposit (
    FDId            SERIAL PRIMARY KEY,
    SocietyId       INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INT           NOT NULL REFERENCES jeevika_erp.FinancialYear(FYId) ON DELETE CASCADE,
    FDNo            VARCHAR(50),
    BankName        VARCHAR(255),
    AccountId       INT           REFERENCES jeevika_erp.SocAccount(AccountId) ON DELETE SET NULL,
    Principal       NUMERIC(18,2) DEFAULT 0,
    InterestRate    NUMERIC(5,2)  DEFAULT 0,
    StartDate       DATE,
    MaturityDate    DATE,
    MaturityAmount  NUMERIC(18,2) DEFAULT 0,
    Status          VARCHAR(50)   DEFAULT 'Active',
    IsDeleted       BOOLEAN       DEFAULT FALSE
);

-- 20. Member Transfer Log
CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberTransfer (
    TransferId        SERIAL PRIMARY KEY,
    SocietyId         INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId          INT           NOT NULL REFERENCES jeevika_erp.SocMember(MemberId) ON DELETE CASCADE,
    TransferDate      DATE,
    TransferType      VARCHAR(100),
    MeetingType       VARCHAR(50),
    MeetingDate       DATE,
    ResolutionNo      VARCHAR(100),
    TransferNo        VARCHAR(50),
    RegNoTransferor   VARCHAR(100),
    RegNoTransferee   VARCHAR(100),
    AgreementAssign   VARCHAR(255),
    TransferorName    VARCHAR(255),
    TransfereeName    VARCHAR(255),
    Remarks           TEXT,
    OldOwnerSnapshot  JSONB,
    CreatedAt         TIMESTAMPTZ   DEFAULT NOW()
);

-- 21. Member Lien Mark Loans
CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberLien (
    LienId         SERIAL PRIMARY KEY,
    SocietyId      INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId       INT           NOT NULL REFERENCES jeevika_erp.SocMember(MemberId) ON DELETE CASCADE,
    BankName       VARCHAR(255),
    BankAddress    TEXT,
    LoanAmount     NUMERIC(18,2) DEFAULT 0,
    PeriodYears    VARCHAR(50),
    MeetingDate    DATE,
    ResolutionNo   VARCHAR(100),
    SanctionDate   DATE,
    NocDate        DATE,
    CancelDate     DATE,
    Status         VARCHAR(50)   DEFAULT 'Active',
    IsArchived     BOOLEAN       DEFAULT FALSE,
    CreatedAt      TIMESTAMPTZ   DEFAULT NOW()
);

-- 22. Member Tenant Lease Roster
CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberTenant (
    TenantId               SERIAL PRIMARY KEY,
    SocietyId              INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId               INT           NOT NULL REFERENCES jeevika_erp.SocMember(MemberId) ON DELETE CASCADE,
    TenantName             VARCHAR(255),
    FamilyCount            INT           DEFAULT 1,
    FamilyNames            TEXT,
    PrimaryMobile          VARCHAR(50),
    SecondaryMobile        VARCHAR(50),
    AgreementAssignBetween VARCHAR(255),
    PeriodFrom             DATE,
    PeriodTo               DATE,
    AgreementIndexVerify   VARCHAR(10)   DEFAULT 'NO',
    TenantAadharVerify     VARCHAR(10)   DEFAULT 'NO',
    PoliceVerifyLetter     VARCHAR(10)   DEFAULT 'NO',
    Status                 VARCHAR(50)   DEFAULT 'Active',
    CreatedAt              TIMESTAMPTZ   DEFAULT NOW()
);

-- 23. Member Nominee Registry
CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberNominee (
    NomineeId       SERIAL PRIMARY KEY,
    SocietyId       INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId        INT           NOT NULL REFERENCES jeevika_erp.SocMember(MemberId) ON DELETE CASCADE,
    NomineeName     VARCHAR(255),
    Relationship    VARCHAR(100),
    SharePct        NUMERIC(5,2)  DEFAULT 100,
    DOB             DATE,
    AgeCategory     VARCHAR(20)   DEFAULT 'Major',
    RcvDate         DATE,
    MeetingType     VARCHAR(50),
    MeetingDate     DATE,
    ResolutionNo    VARCHAR(100),
    Address         TEXT,
    Status          VARCHAR(50)   DEFAULT 'Active',
    CreatedAt       TIMESTAMPTZ   DEFAULT NOW()
);

-- 24. Member Bill Head Overrides
CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberBillOverride (
    OverrideId      SERIAL PRIMARY KEY,
    SocietyId       INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId        INT           NOT NULL REFERENCES jeevika_erp.SocMember(MemberId) ON DELETE CASCADE,
    LedgerName      VARCHAR(255)  NOT NULL,
    StandardAmount  NUMERIC(18,2) DEFAULT 0,
    OverrideAmount  NUMERIC(18,2) DEFAULT 0,
    IsExempted      BOOLEAN       DEFAULT FALSE,
    CreatedAt       TIMESTAMPTZ   DEFAULT NOW()
);

-- 25. Bill Type Heads Configuration
CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillTypeHead (
    HeadId        SERIAL PRIMARY KEY,
    SocietyId     INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    BillTypeId    INT           NOT NULL REFERENCES jeevika_erp.SocBillType(BillTypeId) ON DELETE CASCADE,
    SrNo          INT           DEFAULT 1,
    AccountId     INT           REFERENCES jeevika_erp.SocAccount(AccountId) ON DELETE SET NULL,
    AccountCode   VARCHAR(50),
    AccountName   VARCHAR(255),
    GSTApplicable BOOLEAN       DEFAULT FALSE,
    GSTExempted   BOOLEAN       DEFAULT FALSE,
    CreatedAt     TIMESTAMPTZ   DEFAULT NOW()
);

-- 26. Bill Type Notes & Interest Configuration
CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillTypeNote (
    NoteId              SERIAL PRIMARY KEY,
    SocietyId           INT           NOT NULL REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    BillTypeId          INT           NOT NULL REFERENCES jeevika_erp.SocBillType(BillTypeId) ON DELETE CASCADE,
    Note1               TEXT,
    Note2               TEXT,
    Note3               TEXT,
    Note4               TEXT,
    Note5               TEXT,
    Note6               TEXT,
    Note7               TEXT,
    Note8               TEXT,
    BankName            TEXT,
    AccountNo           TEXT,
    IFSCCode            TEXT,
    AccountType         VARCHAR(50)   DEFAULT 'saving',
    UPINote             TEXT,
    QRCodePath          TEXT,
    SignaturePath       TEXT,
    DynamicQR           BOOLEAN       DEFAULT FALSE,
    InterestMethod      VARCHAR(50)   DEFAULT 'M-CM',
    InterestRate        VARCHAR(50)   DEFAULT '21%',
    InterestType        VARCHAR(50)   DEFAULT 'Simple',
    GrossDays           VARCHAR(50)   DEFAULT '',
    InterestPriority    VARCHAR(50)   DEFAULT 'Interest First',
    ShowBillPeriodNotes BOOLEAN       DEFAULT FALSE,
    BillMethod          VARCHAR(50)   DEFAULT 'Monthly',
    BillMonths          VARCHAR(50)   DEFAULT '1',
    BillDate            VARCHAR(50)   DEFAULT '01',
    BillDue             VARCHAR(50)   DEFAULT '15',
    BillPeriod          TEXT,
    UpdatedAt           TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE(SocietyId, BillTypeId)
);

-- 27. Audit Log
CREATE TABLE IF NOT EXISTS jeevika_erp.AuditLog (
    LogId       SERIAL PRIMARY KEY,
    SocietyId   INT REFERENCES jeevika_erp.SocietyInfo(SocietyId) ON DELETE CASCADE,
    UserId      INT,
    Action      VARCHAR(100) NOT NULL,
    EntityName  VARCHAR(100),
    EntityId    VARCHAR(100),
    Details     TEXT,
    IPAddress   VARCHAR(50),
    CreatedAt   TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- 4. PERFORMANCE & LOOKUP INDEXES
-- ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fy_society          ON jeevika_erp.FinancialYear(SocietyId);
CREATE INDEX IF NOT EXISTS idx_group_society       ON jeevika_erp.SocGroup(SocietyId);
CREATE INDEX IF NOT EXISTS idx_account_society     ON jeevika_erp.SocAccount(SocietyId);
CREATE INDEX IF NOT EXISTS idx_account_group       ON jeevika_erp.SocAccount(GroupId);
CREATE INDEX IF NOT EXISTS idx_member_society      ON jeevika_erp.SocMember(SocietyId);
CREATE INDEX IF NOT EXISTS idx_vendor_society      ON jeevika_erp.SocVendor(SocietyId);
CREATE INDEX IF NOT EXISTS idx_voucher_society_fy  ON jeevika_erp.SocVoucherHeader(SocietyId, FYId);
CREATE INDEX IF NOT EXISTS idx_voucher_type        ON jeevika_erp.SocVoucherHeader(VoucherType);
CREATE INDEX IF NOT EXISTS idx_voucher_date        ON jeevika_erp.SocVoucherHeader(VoucherDate);
CREATE INDEX IF NOT EXISTS idx_vdetail_voucher     ON jeevika_erp.SocVoucherDetail(VoucherId);
CREATE INDEX IF NOT EXISTS idx_bill_society_fy     ON jeevika_erp.SocMemberBill(SocietyId, FYId);
CREATE INDEX IF NOT EXISTS idx_bill_member         ON jeevika_erp.SocMemberBill(MemberId);
CREATE INDEX IF NOT EXISTS idx_audit_society       ON jeevika_erp.AuditLog(SocietyId);
CREATE INDEX IF NOT EXISTS idx_audit_user          ON jeevika_erp.AuditLog(UserId);
