-- ═══════════════════════════════════════════════════════════
-- JEEVIKA ERP v2 — CANONICAL LOCAL SQLITE MASTER SCHEMA
-- Location: Database/Local/schema/sqlite_schema.sql
-- Single source of truth for SQLite tables, columns & constraints.
-- ═══════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- 0. Migration Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1. Users
CREATE TABLE IF NOT EXISTS SoftUser (
    UserId        INTEGER PRIMARY KEY AUTOINCREMENT,
    UserName      TEXT NOT NULL UNIQUE,
    PasswordHash  TEXT NOT NULL,
    UserType      TEXT DEFAULT 'USER',
    UserLevel     TEXT DEFAULT '1',
    Role          TEXT DEFAULT 'StandardUser',
    IsActive      INTEGER DEFAULT 1,
    CreatedAt     TEXT DEFAULT (datetime('now')),
    UpdatedAt     TEXT DEFAULT (datetime('now'))
);

-- 2. Society Info
CREATE TABLE IF NOT EXISTS SocietyInfo (
    SocietyId       INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyCode     TEXT NOT NULL UNIQUE,
    SocietyName     TEXT NOT NULL,
    SocMarName      TEXT,
    StartingYear    TEXT,
    Address         TEXT,
    City            TEXT,
    Pincode         TEXT,
    Phone           TEXT,
    Email           TEXT,
    RegistrationNo  TEXT,
    PANNumber       TEXT,
    TAN             TEXT,
    PTNo            TEXT,
    UIDNumber       TEXT,
    AreaType        TEXT,
    AreaCategory    TEXT,
    AreaUnit        TEXT DEFAULT 'Sq.Ft',
    GSTApplicable   INTEGER DEFAULT 0,
    GSTNumber       TEXT,
    HSNCode         TEXT,
    CGSTCode        TEXT,
    SGSTCode        TEXT,
    CGSTPct         NUMERIC DEFAULT 9.00,
    SGSTPct         NUMERIC DEFAULT 9.00,
    IntDuesGST      TEXT DEFAULT 'No',
    ExemptLimit     NUMERIC DEFAULT 7500.00,
    ExemptAmount    NUMERIC DEFAULT 7500.00,
    ChairmanName    TEXT,
    SecretaryName   TEXT,
    TreasurerName   TEXT,
    HonChairman     TEXT,
    HonSecretary    TEXT,
    HonTreasurer    TEXT,
    ContactName1    TEXT,
    ContactPhone1   TEXT,
    ContactEmail1   TEXT,
    ContactName2    TEXT,
    ContactPhone2   TEXT,
    ContactEmail2   TEXT,
    CommWhatsApp    TEXT DEFAULT 'N',
    CommSMS         TEXT DEFAULT 'N',
    CommRCS         TEXT DEFAULT 'N',
    CommEmail       TEXT DEFAULT 'N',
    CommNotification TEXT DEFAULT 'N',
    BankName        TEXT,
    BankAccountNo   TEXT,
    BankBranch      TEXT,
    IFSCCode        TEXT,
    LogoPath        TEXT,
    IsActive        INTEGER DEFAULT 1,
    CreatedAt       TEXT DEFAULT (datetime('now')),
    UpdatedAt       TEXT DEFAULT (datetime('now'))
);

-- 3. Financial Year
CREATE TABLE IF NOT EXISTS FinancialYear (
    FYId        INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId   INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYLabel     TEXT NOT NULL,
    FYStart     TEXT NOT NULL,
    FYEnd       TEXT NOT NULL,
    IsActive    INTEGER DEFAULT 1,
    IsClosed    INTEGER DEFAULT 0,
    CreatedAt   TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, FYLabel)
);

-- 4. Transaction Number Config
CREATE TABLE IF NOT EXISTS TxNumberConfig (
    ConfigId      INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId     INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId          INTEGER NOT NULL REFERENCES FinancialYear(FYId) ON DELETE CASCADE,
    VoucherType   TEXT NOT NULL,
    Prefix        TEXT DEFAULT '',
    StartNo       INTEGER DEFAULT 1,
    LastNo        INTEGER DEFAULT 0,
    UNIQUE(SocietyId, FYId, VoucherType)
);

-- 5. Group Master
CREATE TABLE IF NOT EXISTS SocGroup (
    GroupId         INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    GrpCode         TEXT,
    GrpName         TEXT NOT NULL,
    GrpMarName      TEXT,
    GrpMainId       INTEGER NOT NULL DEFAULT 1,
    GrpPrimaryId    INTEGER,
    GrpPrimaryName  TEXT,
    GrpType         INTEGER DEFAULT 1,
    GrpSubtotal     INTEGER DEFAULT 0,
    IsDeleted       INTEGER DEFAULT 0,
    CreatedAt       TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_socgroup_code_active ON SocGroup (SocietyId, GrpCode) WHERE IsDeleted = 0;

-- 6. Account Master
CREATE TABLE IF NOT EXISTS SocAccount (
    AccountId     INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId     INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    AccCode       TEXT NOT NULL,
    AccName       TEXT NOT NULL,
    AccMarName    TEXT,
    AccBSName     TEXT,
    GroupId       INTEGER REFERENCES SocGroup(GroupId),
    GrpMainId     INTEGER,
    OpBal         NUMERIC DEFAULT 0.00,
    OpDrCr        TEXT DEFAULT 'Dr',
    PrBal         NUMERIC DEFAULT 0.00,
    PrDrCr        TEXT DEFAULT 'Dr',
    ClBal         NUMERIC DEFAULT 0.00,
    DepAnnual     NUMERIC DEFAULT 0.00,
    DepHalf       NUMERIC DEFAULT 0.00,
    AccAddress    TEXT,
    AccPAN        TEXT,
    AccTAN        TEXT,
    GSTIN         TEXT,
    Mobile        TEXT,
    Mobile2       TEXT,
    Email         TEXT,
    TdsRate       NUMERIC DEFAULT 0.00,
    TdsSection    TEXT,
    IsDefault     INTEGER DEFAULT 0,
    IsDeleted     INTEGER DEFAULT 0,
    CreatedAt     TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_socaccount_code_active ON SocAccount (SocietyId, AccCode) WHERE IsDeleted = 0;

-- 7. Member Master
CREATE TABLE IF NOT EXISTS SocMember (
    MemberId          INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId         INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemCode           TEXT NOT NULL,
    MemName           TEXT NOT NULL,
    MemName2          TEXT,
    MemName3          TEXT,
    MemName4          TEXT,
    MemName5          TEXT,
    MemMarName        TEXT,
    Building          TEXT,
    Wing              TEXT,
    FlatNo            TEXT,
    Floor             TEXT,
    UnitType          TEXT,
    FlatType          TEXT,
    UnitNo            TEXT,
    AreaSqft          NUMERIC DEFAULT 0.00,
    AreaType          TEXT,
    AreaCategory      TEXT,
    AreaUnit          TEXT DEFAULT 'Sq.Ft',
    ContactNo         TEXT,
    Email             TEXT,
    PANNo             TEXT,
    TANNo             TEXT,
    EntryDate         TEXT,
    MemberType        TEXT DEFAULT 'Owner',
    Shares            INTEGER DEFAULT 0,
    NonOccApplicable  TEXT DEFAULT 'No',
    NonOccReason      TEXT,
    TenantName        TEXT,
    TenantContact     TEXT,
    ParkingSlot2W     TEXT,
    ParkingSlot4W     TEXT,
    VehicleNo2W       TEXT,
    VehicleNo4W       TEXT,
    LienBankName      TEXT,
    LienLoanNo        TEXT,
    LienAmount        NUMERIC DEFAULT 0.00,
    LienStatus        TEXT DEFAULT 'None',
    ShareCertNo       TEXT,
    FolioNo           TEXT,
    ShareFromNo       INTEGER DEFAULT 0,
    ShareToNo         INTEGER DEFAULT 0,
    NomineeName       TEXT,
    NomineeRelation   TEXT,
    NomineeAddress    TEXT,
    NomineeSharePct   NUMERIC DEFAULT 100.00,
    IsTransferred     TEXT DEFAULT 'No',
    TransferDate      TEXT,
    TransferType      TEXT,
    TransfereeName    TEXT,
    OpPrincipal       NUMERIC DEFAULT 0.00,
    OpInterest        NUMERIC DEFAULT 0.00,
    IsDeleted         INTEGER DEFAULT 0,
    CreatedAt         TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_socmember_active_memcode ON SocMember (SocietyId, UPPER(MemCode)) WHERE IsDeleted = 0;

-- 8. Vendor Master
CREATE TABLE IF NOT EXISTS SocVendor (
    VendorId        INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    VendorCode      TEXT NOT NULL,
    VendorName      TEXT NOT NULL,
    PANNo           TEXT,
    GSTIN           TEXT,
    TDSSection      TEXT,
    TDSRate         NUMERIC DEFAULT 0.00,
    ContactNo       TEXT,
    Email           TEXT,
    Address         TEXT,
    ContractNo      TEXT,
    ContractFrom    TEXT,
    ContractTo      TEXT,
    ContractValue   NUMERIC DEFAULT 0.00,
    IsDeleted       INTEGER DEFAULT 0,
    CreatedAt       TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, VendorCode)
);

-- 9. Staff Master
CREATE TABLE IF NOT EXISTS SocStaff (
    StaffId         INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    StaffCode       TEXT NOT NULL,
    StaffName       TEXT NOT NULL,
    Designation     TEXT,
    PANNo           TEXT,
    TDSRate         NUMERIC DEFAULT 0.00,
    ContactNo       TEXT,
    Phone2          TEXT,
    Email           TEXT,
    JoiningDate     TEXT,
    EndDate         TEXT,
    MonthlyCost     NUMERIC DEFAULT 0.00,
    Status          TEXT DEFAULT 'Active',
    BankHolder      TEXT,
    BankAccount     TEXT,
    BankName        TEXT,
    BankIfsc        TEXT,
    BankBranch      TEXT,
    TdsSection      TEXT DEFAULT 'None',
    PfNo            TEXT,
    EsicNo          TEXT,
    IsAuthorized    INTEGER DEFAULT 0,
    Notes           TEXT,
    IsDeleted       INTEGER DEFAULT 0,
    CreatedAt       TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, StaffCode)
);

-- 10. Committee Master
CREATE TABLE IF NOT EXISTS SocCommittee (
    CommitteeId   INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId     INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId          INTEGER REFERENCES FinancialYear(FYId) ON DELETE SET NULL,
    MemberName    TEXT NOT NULL,
    Designation   TEXT,
    FromDate      TEXT,
    ToDate        TEXT,
    ContactNo     TEXT,
    Email         TEXT,
    IsActive      INTEGER DEFAULT 1
);

-- 11. Bill Type Master
CREATE TABLE IF NOT EXISTS SocBillType (
    BillTypeId    INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId     INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    BillTypeCode  TEXT DEFAULT 'MAINT',
    BillTypeName  TEXT NOT NULL,
    Description   TEXT,
    AccountId     INTEGER REFERENCES SocAccount(AccountId) ON DELETE SET NULL,
    IsDefault     INTEGER DEFAULT 0,
    IsActive      INTEGER DEFAULT 1,
    IsDeleted     INTEGER DEFAULT 0,
    CreatedAt     TEXT DEFAULT (datetime('now')),
    UpdatedAt     TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, BillTypeName)
);

-- 12. Billing Master Matrix
CREATE TABLE IF NOT EXISTS SocBillingMatrix (
    MatrixId      INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId     INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId          INTEGER REFERENCES FinancialYear(FYId) ON DELETE SET NULL,
    BillTypeId    INTEGER NOT NULL REFERENCES SocBillType(BillTypeId) ON DELETE CASCADE,
    MemberId      INTEGER NOT NULL REFERENCES SocMember(MemberId) ON DELETE CASCADE,
    AccountCode   TEXT NOT NULL,
    Amount        NUMERIC DEFAULT 0.00,
    UpdatedAt     TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, BillTypeId, MemberId, AccountCode)
);

-- 12b. Billing Setting
CREATE TABLE IF NOT EXISTS SocBillingSetting (
    SettingId     INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId     INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    BillTypeId    INTEGER NOT NULL REFERENCES SocBillType(BillTypeId) ON DELETE CASCADE,
    GSTCalc       TEXT DEFAULT 'MANUAL',
    InterestCalc  TEXT DEFAULT 'MANUAL',
    UpdatedAt     TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, BillTypeId)
);

-- 13. Opening Bank Reco Master
CREATE TABLE IF NOT EXISTS SocOpeningBankReco (
    RecoId          INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INTEGER REFERENCES FinancialYear(FYId) ON DELETE SET NULL,
    VoucherNo       TEXT NOT NULL,
    VoucherDate     TEXT NOT NULL,
    AccountId       INTEGER REFERENCES SocAccount(AccountId) ON DELETE SET NULL,
    BankName        TEXT NOT NULL,
    UnclearedAmount NUMERIC NOT NULL DEFAULT 0.00,
    ChequeNo        TEXT,
    ChequeDate      TEXT,
    BillRefNo       TEXT,
    PaidTo          TEXT,
    Narration       TEXT,
    Particular1     TEXT,
    Particular2     TEXT,
    IsCleared       INTEGER DEFAULT 0,
    CreatedAt       TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, VoucherNo)
);

-- 14. Voucher Header
CREATE TABLE IF NOT EXISTS SocVoucherHeader (
    VoucherId       INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INTEGER NOT NULL REFERENCES FinancialYear(FYId) ON DELETE CASCADE,
    VoucherNo       TEXT NOT NULL,
    VoucherType     TEXT NOT NULL,
    VoucherDate     TEXT NOT NULL,
    CashBankCode    TEXT,
    CashBankName    TEXT,
    Amount          NUMERIC DEFAULT 0.00,
    ChqNo           TEXT,
    ChqDate         TEXT,
    BankName        TEXT,
    PersonName      TEXT,
    PersonType      TEXT,
    PersonCode      TEXT,
    RefNo           TEXT,
    Narration       TEXT,
    Particular1     TEXT,
    Particular2     TEXT,
    IsAudited       INTEGER DEFAULT 0,
    AuditedBy       TEXT,
    AuditedDate     TEXT,
    ClearingDate    TEXT,
    ClearingRemark  TEXT,
    Status          TEXT DEFAULT 'Posted',
    IsDeleted       INTEGER DEFAULT 0,
    CreatedBy       TEXT,
    CreatedAt       TEXT DEFAULT (datetime('now')),
    UpdatedAt       TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, FYId, VoucherNo)
);

-- 15. Voucher Detail
CREATE TABLE IF NOT EXISTS SocVoucherDetail (
    DetailId      INTEGER PRIMARY KEY AUTOINCREMENT,
    VoucherId     INTEGER NOT NULL REFERENCES SocVoucherHeader(VoucherId) ON DELETE CASCADE,
    SrNo          INTEGER NOT NULL DEFAULT 1,
    AccountId     INTEGER REFERENCES SocAccount(AccountId) ON DELETE SET NULL,
    AccountCode   TEXT,
    AccountName   TEXT,
    Debit         NUMERIC DEFAULT 0.00,
    Credit        NUMERIC DEFAULT 0.00,
    Narration     TEXT
);

-- 16. Member Bill Header
CREATE TABLE IF NOT EXISTS SocMemberBill (
    BillId          INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INTEGER NOT NULL REFERENCES FinancialYear(FYId) ON DELETE CASCADE,
    BillNo          TEXT NOT NULL,
    MemberId        INTEGER NOT NULL REFERENCES SocMember(MemberId) ON DELETE RESTRICT,
    BillTypeId      INTEGER REFERENCES SocBillType(BillTypeId) ON DELETE SET NULL,
    BillType        TEXT DEFAULT 'Maintenance',
    Period          TEXT,
    BillDate        TEXT NOT NULL,
    DueDate         TEXT,
    PrincipalAmount NUMERIC DEFAULT 0.00,
    InterestAmount  NUMERIC DEFAULT 0.00,
    TotalAmount     NUMERIC DEFAULT 0.00,
    PaidAmount      NUMERIC DEFAULT 0.00,
    BalanceAmount   NUMERIC DEFAULT 0.00,
    Particular1     TEXT,
    Particular2     TEXT,
    Status          TEXT DEFAULT 'Unpaid',
    VoucherId       INTEGER REFERENCES SocVoucherHeader(VoucherId) ON DELETE SET NULL,
    IsDeleted       INTEGER DEFAULT 0,
    CreatedAt       TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, FYId, BillNo)
);

-- 16b. Member Bill Item Breakdown
CREATE TABLE IF NOT EXISTS SocMemberBillItem (
    ItemId          INTEGER PRIMARY KEY AUTOINCREMENT,
    BillId          INTEGER NOT NULL REFERENCES SocMemberBill(BillId) ON DELETE CASCADE,
    AccountCode     TEXT,
    AccountName     TEXT,
    Amount          NUMERIC DEFAULT 0.00
);

-- 17. Member Note
CREATE TABLE IF NOT EXISTS SocMemberNote (
    NoteId      INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId   INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId        INTEGER NOT NULL REFERENCES FinancialYear(FYId) ON DELETE CASCADE,
    NoteNo      TEXT NOT NULL,
    NoteType    TEXT NOT NULL,
    NoteDate    TEXT NOT NULL,
    MemberId    INTEGER REFERENCES SocMember(MemberId) ON DELETE RESTRICT,
    BillId      INTEGER REFERENCES SocMemberBill(BillId) ON DELETE SET NULL,
    Amount      NUMERIC DEFAULT 0.00,
    Reason      TEXT,
    IsDeleted   INTEGER DEFAULT 0,
    CreatedAt   TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, FYId, NoteNo)
);

-- 18. Opening Balances
CREATE TABLE IF NOT EXISTS SocOpeningBalance (
    OpenBalId   INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId   INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId        INTEGER NOT NULL REFERENCES FinancialYear(FYId) ON DELETE CASCADE,
    AccountId   INTEGER NOT NULL REFERENCES SocAccount(AccountId) ON DELETE CASCADE,
    OpenBal     NUMERIC DEFAULT 0.00,
    DrCr        TEXT DEFAULT 'Dr',
    EntryDate   TEXT,
    UNIQUE(SocietyId, FYId, AccountId)
);

-- 19. Fixed Deposit
CREATE TABLE IF NOT EXISTS SocFixedDeposit (
    FDId            INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    FYId            INTEGER NOT NULL REFERENCES FinancialYear(FYId) ON DELETE CASCADE,
    FDNo            TEXT,
    BankName        TEXT,
    AccountId       INTEGER REFERENCES SocAccount(AccountId) ON DELETE SET NULL,
    Principal       NUMERIC DEFAULT 0.00,
    InterestRate    NUMERIC DEFAULT 0.00,
    StartDate       TEXT,
    MaturityDate    TEXT,
    MaturityAmount  NUMERIC DEFAULT 0.00,
    Status          TEXT DEFAULT 'Active',
    IsDeleted       INTEGER DEFAULT 0
);

-- 20. Member Transfer Log
CREATE TABLE IF NOT EXISTS SocMemberTransfer (
    TransferId        INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId         INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId          INTEGER NOT NULL REFERENCES SocMember(MemberId) ON DELETE CASCADE,
    TransferDate      TEXT,
    TransferType      TEXT,
    MeetingType       TEXT,
    MeetingDate       TEXT,
    ResolutionNo      TEXT,
    TransferNo        TEXT,
    RegNoTransferor   TEXT,
    RegNoTransferee   TEXT,
    AgreementAssign   TEXT,
    TransferorName    TEXT,
    TransfereeName    TEXT,
    Remarks           TEXT,
    OldOwnerSnapshot  TEXT,
    CreatedAt         TEXT DEFAULT (datetime('now'))
);

-- 21. Member Lien Mark Loans
CREATE TABLE IF NOT EXISTS SocMemberLien (
    LienId         INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId      INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId       INTEGER NOT NULL REFERENCES SocMember(MemberId) ON DELETE CASCADE,
    BankName       TEXT,
    BankAddress    TEXT,
    LoanAmount     NUMERIC DEFAULT 0.00,
    PeriodYears    TEXT,
    MeetingDate    TEXT,
    ResolutionNo   TEXT,
    SanctionDate   TEXT,
    NocDate        TEXT,
    CancelDate     TEXT,
    Status         TEXT DEFAULT 'Active',
    IsArchived     INTEGER DEFAULT 0,
    CreatedAt      TEXT DEFAULT (datetime('now'))
);

-- 22. Member Tenant Lease Roster
CREATE TABLE IF NOT EXISTS SocMemberTenant (
    TenantId               INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId              INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId               INTEGER NOT NULL REFERENCES SocMember(MemberId) ON DELETE CASCADE,
    TenantName             TEXT,
    FamilyCount            INTEGER DEFAULT 1,
    FamilyNames            TEXT,
    PrimaryMobile          TEXT,
    SecondaryMobile        TEXT,
    AgreementAssignBetween TEXT,
    PeriodFrom             TEXT,
    PeriodTo               TEXT,
    AgreementIndexVerify   TEXT DEFAULT 'NO',
    TenantAadharVerify     TEXT DEFAULT 'NO',
    PoliceVerifyLetter     TEXT DEFAULT 'NO',
    Status                 TEXT DEFAULT 'Active',
    CreatedAt              TEXT DEFAULT (datetime('now'))
);

-- 23. Member Nominee Registry
CREATE TABLE IF NOT EXISTS SocMemberNominee (
    NomineeId       INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId        INTEGER NOT NULL REFERENCES SocMember(MemberId) ON DELETE CASCADE,
    NomineeName     TEXT,
    Relationship    TEXT,
    SharePct        NUMERIC DEFAULT 100.00,
    DOB             TEXT,
    AgeCategory     TEXT DEFAULT 'Major',
    RcvDate         TEXT,
    MeetingType     TEXT,
    MeetingDate     TEXT,
    ResolutionNo    TEXT,
    Address         TEXT,
    Status          TEXT DEFAULT 'Active',
    CreatedAt       TEXT DEFAULT (datetime('now'))
);

-- 24. Member Bill Head Overrides
CREATE TABLE IF NOT EXISTS SocMemberBillOverride (
    OverrideId      INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId       INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    MemberId        INTEGER NOT NULL REFERENCES SocMember(MemberId) ON DELETE CASCADE,
    LedgerName      TEXT NOT NULL,
    StandardAmount  NUMERIC DEFAULT 0.00,
    OverrideAmount  NUMERIC DEFAULT 0.00,
    IsExempted      INTEGER DEFAULT 0,
    CreatedAt       TEXT DEFAULT (datetime('now'))
);

-- 25. Bill Type Heads Configuration
CREATE TABLE IF NOT EXISTS SocBillTypeHead (
    HeadId        INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId     INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    BillTypeId    INTEGER NOT NULL REFERENCES SocBillType(BillTypeId) ON DELETE CASCADE,
    SrNo          INTEGER DEFAULT 1,
    AccountId     INTEGER REFERENCES SocAccount(AccountId) ON DELETE SET NULL,
    AccountCode   TEXT,
    AccountName   TEXT,
    GSTApplicable INTEGER DEFAULT 0,
    GSTExempted   INTEGER DEFAULT 0,
    CreatedAt     TEXT DEFAULT (datetime('now'))
);

-- 26. Bill Type Notes & Interest Configuration
CREATE TABLE IF NOT EXISTS SocBillTypeNote (
    NoteId              INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId           INTEGER NOT NULL REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    BillTypeId          INTEGER NOT NULL REFERENCES SocBillType(BillTypeId) ON DELETE CASCADE,
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
    AccountType         TEXT DEFAULT 'saving',
    UPINote             TEXT,
    QRCodePath          TEXT,
    SignaturePath       TEXT,
    DynamicQR           INTEGER DEFAULT 0,
    InterestMethod      TEXT DEFAULT 'M-CM',
    InterestRate        TEXT DEFAULT '21%',
    InterestType        TEXT DEFAULT 'Simple',
    GrossDays           TEXT DEFAULT '',
    InterestPriority    TEXT DEFAULT 'Interest First',
    ShowBillPeriodNotes INTEGER DEFAULT 0,
    BillMethod          TEXT DEFAULT 'Monthly',
    BillMonths          TEXT DEFAULT '1',
    BillDate            TEXT DEFAULT '01',
    BillDue             TEXT DEFAULT '15',
    BillPeriod          TEXT,
    UpdatedAt           TEXT DEFAULT (datetime('now')),
    UNIQUE(SocietyId, BillTypeId)
);

-- 27. Audit Log
CREATE TABLE IF NOT EXISTS AuditLog (
    LogId       INTEGER PRIMARY KEY AUTOINCREMENT,
    SocietyId   INTEGER REFERENCES SocietyInfo(SocietyId) ON DELETE CASCADE,
    UserId      INTEGER,
    Action      TEXT NOT NULL,
    EntityName  TEXT,
    EntityId    TEXT,
    Details     TEXT,
    IPAddress   TEXT,
    CreatedAt   TEXT DEFAULT (datetime('now'))
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_fy_society          ON FinancialYear(SocietyId);
CREATE INDEX IF NOT EXISTS idx_group_society       ON SocGroup(SocietyId);
CREATE INDEX IF NOT EXISTS idx_account_society     ON SocAccount(SocietyId);
CREATE INDEX IF NOT EXISTS idx_account_group       ON SocAccount(GroupId);
CREATE INDEX IF NOT EXISTS idx_member_society      ON SocMember(SocietyId);
CREATE INDEX IF NOT EXISTS idx_vendor_society      ON SocVendor(SocietyId);
CREATE INDEX IF NOT EXISTS idx_voucher_society_fy  ON SocVoucherHeader(SocietyId, FYId);
CREATE INDEX IF NOT EXISTS idx_voucher_type        ON SocVoucherHeader(VoucherType);
CREATE INDEX IF NOT EXISTS idx_voucher_date        ON SocVoucherHeader(VoucherDate);
CREATE INDEX IF NOT EXISTS idx_vdetail_voucher     ON SocVoucherDetail(VoucherId);
CREATE INDEX IF NOT EXISTS idx_bill_society_fy     ON SocMemberBill(SocietyId, FYId);
CREATE INDEX IF NOT EXISTS idx_bill_member         ON SocMemberBill(MemberId);
CREATE INDEX IF NOT EXISTS idx_audit_society       ON AuditLog(SocietyId);
CREATE INDEX IF NOT EXISTS idx_audit_user          ON AuditLog(UserId);
