// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — DbHelper.cs
// PostgreSQL database helper using Npgsql.
// Handles connection strings, initialization, and queries.
// ═══════════════════════════════════════════════════════════

using Npgsql;
using Microsoft.Extensions.Configuration;
using System.Text.RegularExpressions;

namespace JeevikaERP
{
    public static class DbHelper
    {
        private static string? _connectionString;
        public static IDbConnectionFactory? ConnectionFactory { get; private set; }

        public static void Initialize(IConfiguration config)
        {
            var provider = config["DatabaseProvider"] ?? "PostgreSQL";
            if (provider.Equals("SQLite", StringComparison.OrdinalIgnoreCase))
            {
                ConnectionFactory = JeevikaERP.Database.DatabaseInitializer.Initialize(config);
                return;
            }

            _connectionString = config.GetConnectionString("Default")
                ?? throw new InvalidOperationException(
                    "Connection string 'Default' not found in appsettings.json. " +
                    "Please set Host, Port, Database, Username, Password.");

            ResolveWorkingConnectionString();
            if (!string.IsNullOrEmpty(_connectionString))
            {
                ConnectionFactory = new PostgresConnectionFactory(_connectionString);
            }
            EnsureDatabaseCreated();
        }

        private static void ResolveWorkingConnectionString()
        {
            if (string.IsNullOrEmpty(_connectionString)) return;

            var builder = new NpgsqlConnectionStringBuilder(_connectionString);
            var configuredPass = builder.Password ?? "";

            var candidates = new List<string>();
            var envPass = Environment.GetEnvironmentVariable("PGPASSWORD");
            if (!string.IsNullOrWhiteSpace(envPass)) candidates.Add(envPass);
            if (!string.IsNullOrWhiteSpace(configuredPass)) candidates.Add(configuredPass);
            candidates.AddRange(new[] { "postgres", "admin", "root", "1234", "henuos" });

            foreach (var pass in candidates.Distinct())
            {
                builder.Password = pass;
                try
                {
                    using var testConn = new NpgsqlConnection(builder.ConnectionString);
                    testConn.Open();
                    _connectionString = builder.ConnectionString;
                    Console.WriteLine($"[DbHelper] Database authenticated using password: '{(pass.Length > 0 ? "*****" : "(empty)")}'");
                    return;
                }
                catch (NpgsqlException)
                {
                    // continue searching candidates
                }
                catch (Exception)
                {
                    // other errors
                }
            }

            // Restore configured if none succeeded
            builder.Password = configuredPass;
            _connectionString = builder.ConnectionString;
        }

        public static void EnsureDatabaseCreated()
        {
            try
            {
                if (string.IsNullOrEmpty(_connectionString)) return;

                var builder = new NpgsqlConnectionStringBuilder(_connectionString);
                var targetDb = builder.Database;

                // 1. Connect to postgres default DB to check if target exists
                builder.Database = "postgres";
                using (var conn = new NpgsqlConnection(builder.ConnectionString))
                {
                    conn.Open();
                    using var checkCmd = conn.CreateCommand();
                    checkCmd.CommandText = "SELECT COUNT(*) FROM pg_database WHERE datname = @db";
                    checkCmd.Parameters.AddWithValue("@db", targetDb ?? "jeevika_erp");
                    var exists = Convert.ToInt64(checkCmd.ExecuteScalar() ?? 0) > 0;

                    if (!exists && !string.IsNullOrEmpty(targetDb))
                    {
                        Console.WriteLine($"[DbHelper] Database '{targetDb}' does not exist. Creating...");
                        using var createCmd = conn.CreateCommand();
                        createCmd.CommandText = $"CREATE DATABASE \"{targetDb}\"";
                        createCmd.ExecuteNonQuery();
                        Console.WriteLine($"[DbHelper] Database '{targetDb}' created successfully.");
                    }
                }

                // 2. Connect to target database and check if schema exists
                using (var targetConn = new NpgsqlConnection(_connectionString))
                {
                    targetConn.Open();
                    using var checkSchema = targetConn.CreateCommand();
                    checkSchema.CommandText = "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = 'jeevika_erp'";
                    var schemaExists = Convert.ToInt64(checkSchema.ExecuteScalar() ?? 0) > 0;

                    if (!schemaExists)
                    {
                        Console.WriteLine($"[DbHelper] Schema 'jeevika_erp' not found. Executing schema.sql and seed.sql...");
                        var baseDir = AppContext.BaseDirectory;
                        var rootDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));

                        var schemaPath = Path.Combine(rootDir, "Database", "Web", "schema", "schema.sql");
                        var seedPath   = Path.Combine(rootDir, "Database", "Web", "seeds", "seed.sql");

                        if (!File.Exists(schemaPath))
                        {
                            schemaPath = Path.Combine(rootDir, "Database", "schema.sql");
                            seedPath   = Path.Combine(rootDir, "Database", "seed.sql");
                        }

                        if (!File.Exists(schemaPath))
                        {
                            // fallback search
                            schemaPath = Path.Combine(Directory.GetCurrentDirectory(), "..", "Database", "Web", "schema", "schema.sql");
                            seedPath   = Path.Combine(Directory.GetCurrentDirectory(), "..", "Database", "Web", "seeds", "seed.sql");
                            if (!File.Exists(schemaPath))
                            {
                                schemaPath = Path.Combine(Directory.GetCurrentDirectory(), "..", "Database", "schema.sql");
                                seedPath   = Path.Combine(Directory.GetCurrentDirectory(), "..", "Database", "seed.sql");
                            }
                        }

                        if (File.Exists(schemaPath))
                        {
                            var schemaSql = File.ReadAllText(schemaPath);
                            using var runSchema = targetConn.CreateCommand();
                            runSchema.CommandText = schemaSql;
                            runSchema.ExecuteNonQuery();
                            Console.WriteLine("[DbHelper] Applied schema.sql successfully.");
                        }

                        if (File.Exists(seedPath))
                        {
                            var seedSql = File.ReadAllText(seedPath);
                            using var runSeed = targetConn.CreateCommand();
                            runSeed.CommandText = seedSql;
                            runSeed.ExecuteNonQuery();
                            Console.WriteLine("[DbHelper] Applied seed.sql successfully.");
                        }
                    }

                    // 3. Ensure required tables exist even if schema was created previously
                    using var ensureTables = targetConn.CreateCommand();
                    ensureTables.CommandText = @"
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocStaff (
                            StaffId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, StaffCode VARCHAR(50),
                            StaffName VARCHAR(255) NOT NULL, Role VARCHAR(100), Phone VARCHAR(50),
                            Salary NUMERIC(18,2) DEFAULT 0, StartDate DATE, CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocVendor (
                            VendorId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, VendorCode VARCHAR(50),
                            VendorName VARCHAR(255) NOT NULL, Category VARCHAR(100), ContactPerson VARCHAR(255),
                            Phone VARCHAR(50), Email VARCHAR(255), PanNo VARCHAR(50), GstNo VARCHAR(50),
                            Address TEXT, CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocPurchaseOrder (
                            POId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, PONo VARCHAR(50) NOT NULL,
                            PODate DATE NOT NULL, VendorId INT REFERENCES jeevika_erp.SocVendor(VendorId),
                            SubTotal NUMERIC(18,2) DEFAULT 0, TaxAmount NUMERIC(18,2) DEFAULT 0,
                            TotalAmount NUMERIC(18,2) DEFAULT 0, Status VARCHAR(50) DEFAULT 'Draft',
                            Remarks TEXT, CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocPurchaseOrderItem (
                            POItemId SERIAL PRIMARY KEY, POId INT NOT NULL REFERENCES jeevika_erp.SocPurchaseOrder(POId) ON DELETE CASCADE,
                            ItemName VARCHAR(255) NOT NULL, Qty NUMERIC(18,4) DEFAULT 1, UnitPrice NUMERIC(18,2) DEFAULT 0,
                            Amount NUMERIC(18,2) DEFAULT 0, TaxRate NUMERIC(5,2) DEFAULT 0, TaxAmount NUMERIC(18,2) DEFAULT 0,
                            Total NUMERIC(18,2) DEFAULT 0
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocCommittee (
                            CommitteeId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, MemberId INT,
                            Designation VARCHAR(100) NOT NULL, FromDate DATE, ToDate DATE,
                            IsActive BOOLEAN DEFAULT TRUE, CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS MemberName VARCHAR(255);
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS FlatNo VARCHAR(100);
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS UnitNo VARCHAR(100);
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS ContactNo VARCHAR(50);
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS Email VARCHAR(255);
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS WorkingPeriod VARCHAR(150);
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS Address TEXT;
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS Remark TEXT;
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS IsSignatory BOOLEAN DEFAULT FALSE;
                        ALTER TABLE jeevika_erp.SocCommittee ADD COLUMN IF NOT EXISTS FYId INT;
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocTenant (
                            TenantId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, MemberId INT NOT NULL,
                            TenantName VARCHAR(255), FamilyCount INT DEFAULT 1, FamilyNames TEXT, PrimaryMobile VARCHAR(50),
                            SecondaryMobile VARCHAR(50), AgreementAssignBetween VARCHAR(255), PeriodFrom DATE, PeriodTo DATE,
                            AgreementIndexVerify VARCHAR(10) DEFAULT 'NO', TenantAadharVerify VARCHAR(10) DEFAULT 'NO',
                            PoliceVerifyLetter VARCHAR(10) DEFAULT 'NO', Status VARCHAR(50) DEFAULT 'Active', CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberNominee (
                            NomineeId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, MemberId INT NOT NULL,
                            NomineeName VARCHAR(255), Relationship VARCHAR(100), SharePct NUMERIC(5,2) DEFAULT 100,
                            DOB DATE, AgeCategory VARCHAR(20) DEFAULT 'Major', RcvDate DATE, MeetingType VARCHAR(50),
                            MeetingDate DATE, ResolutionNo VARCHAR(100), Address TEXT, Status VARCHAR(50) DEFAULT 'Active', CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberBillOverride (
                            OverrideId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, MemberId INT NOT NULL,
                            LedgerName VARCHAR(255) NOT NULL, StandardAmount NUMERIC(18,2) DEFAULT 0,
                            OverrideAmount NUMERIC(18,2) DEFAULT 0, IsExempted BOOLEAN DEFAULT FALSE, CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillType (
                            BillTypeId SERIAL PRIMARY KEY, SocietyId INT NOT NULL,
                            BillTypeCode VARCHAR(50) DEFAULT 'MAINT', BillTypeName VARCHAR(100) NOT NULL, Description VARCHAR(255),
                            IsActive BOOLEAN DEFAULT TRUE, CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        ALTER TABLE jeevika_erp.SocBillType ADD COLUMN IF NOT EXISTS BillTypeCode VARCHAR(50) DEFAULT 'MAINT';
                        ALTER TABLE jeevika_erp.SocBillType ADD COLUMN IF NOT EXISTS Description VARCHAR(255);
                        ALTER TABLE jeevika_erp.SocBillType ADD COLUMN IF NOT EXISTS IsActive BOOLEAN DEFAULT TRUE;
                        ALTER TABLE jeevika_erp.SocBillType ADD COLUMN IF NOT EXISTS CreatedAt TIMESTAMPTZ DEFAULT NOW();
                        ALTER TABLE jeevika_erp.SocBillType ADD COLUMN IF NOT EXISTS UpdatedAt TIMESTAMPTZ DEFAULT NOW();
                        UPDATE jeevika_erp.SocBillType SET BillTypeName = REGEXP_REPLACE(TRIM(BillTypeName), '\s+', ' ', 'g') WHERE BillTypeName IS NOT NULL;
                        CREATE UNIQUE INDEX IF NOT EXISTS uidx_socbilltype_name ON jeevika_erp.SocBillType (SocietyId, BillTypeName);

                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillTypeHead (
                            HeadId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, BillTypeId INT NOT NULL,
                            SrNo INT DEFAULT 1, AccountId INT, AccountCode VARCHAR(50), AccountName VARCHAR(255),
                            GSTApplicable BOOLEAN DEFAULT FALSE, GSTExempted BOOLEAN DEFAULT FALSE, CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        ALTER TABLE jeevika_erp.SocBillTypeHead ADD COLUMN IF NOT EXISTS AccountCode VARCHAR(50);
                        ALTER TABLE jeevika_erp.SocBillTypeHead ADD COLUMN IF NOT EXISTS AccountName VARCHAR(255);
                        ALTER TABLE jeevika_erp.SocBillTypeHead ADD COLUMN IF NOT EXISTS DisplayName VARCHAR(255);
                        ALTER TABLE jeevika_erp.SocBillTypeHead ADD COLUMN IF NOT EXISTS GstCategory VARCHAR(50);
                        ALTER TABLE jeevika_erp.SocBillTypeHead ADD COLUMN IF NOT EXISTS IncludeThreshold BOOLEAN DEFAULT FALSE;

                        ALTER TABLE jeevika_erp.SocietyInfo ALTER COLUMN IntDuesGST TYPE VARCHAR(50);

                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillTypeNote (
                            NoteId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, BillTypeId INT NOT NULL,
                            Note1 TEXT, Note2 TEXT, Note3 TEXT, Note4 TEXT, Note5 TEXT, Note6 TEXT, Note7 TEXT, Note8 TEXT,
                            BankName TEXT, AccountNo TEXT, IFSCCode TEXT, AccountType VARCHAR(50) DEFAULT 'saving', UPINote TEXT,
                            QRCodePath TEXT, SignaturePath TEXT, DynamicQR BOOLEAN DEFAULT FALSE,
                            InterestMethod VARCHAR(50) DEFAULT 'M-CM', InterestRate VARCHAR(50) DEFAULT '21%', InterestType VARCHAR(50) DEFAULT 'Simple',
                            GrossDays VARCHAR(50) DEFAULT '', InterestPriority VARCHAR(50) DEFAULT 'Interest First', ShowBillPeriodNotes BOOLEAN DEFAULT FALSE,
                            BillMethod VARCHAR(50) DEFAULT 'Monthly', BillMonths VARCHAR(50) DEFAULT '1', BillDate VARCHAR(50) DEFAULT '01', BillDue VARCHAR(50) DEFAULT '15', BillPeriod TEXT,
                            UpdatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS Note7 TEXT;
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS Note8 TEXT;
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS BankName TEXT;
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS AccountNo TEXT;
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS IFSCCode TEXT;
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS AccountType VARCHAR(50) DEFAULT 'saving';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS UPINote TEXT;
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS DynamicQR BOOLEAN DEFAULT FALSE;
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS InterestMethod VARCHAR(50) DEFAULT 'M-CM';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS InterestRate VARCHAR(50) DEFAULT '21%';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS InterestType VARCHAR(50) DEFAULT 'Simple';
                        UPDATE jeevika_erp.SocBillTypeNote SET GrossDays = '' WHERE GrossDays IS NULL;

                        UPDATE jeevika_erp.SocVoucherHeader
                        SET PersonName = 'Ramesh Sharma (D-102)', RefNo = 'E-101'
                        WHERE VoucherNo = 'MRV/2025-26/01' AND (PersonName ILIKE '%LAKSHITA%' OR PersonName = 'LAKSHITA (A-101)');

                        UPDATE jeevika_erp.SocVoucherHeader
                        SET PersonName = '[D-101] Ajay Devgn (C-201)', RefNo = 'D-101'
                        WHERE VoucherNo = 'JV/2025-26/01';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS GrossDays VARCHAR(50) DEFAULT '';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS InterestPriority VARCHAR(50) DEFAULT 'Interest First';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS ShowBillPeriodNotes BOOLEAN DEFAULT FALSE;
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS BillMethod VARCHAR(50) DEFAULT 'Monthly';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS BillMonths VARCHAR(50) DEFAULT '1';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS BillDate VARCHAR(50) DEFAULT '01';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS BillDue VARCHAR(50) DEFAULT '15';
                        ALTER TABLE jeevika_erp.SocBillTypeNote ADD COLUMN IF NOT EXISTS BillPeriod TEXT;

                        -- Fix default group LI-15 if it was incorrectly named INPUT GST
                        UPDATE jeevika_erp.SocGroup
                        SET GrpName = 'OUTPUT GST', GrpPrimaryName = 'OUTPUT GST'
                        WHERE GrpCode = 'LI-15' AND GrpMainId = 2 AND GrpName ILIKE '%INPUT GST%';

                        -- Migrate any historical vouchers using LIA-1021 / LIA-1022 to LIA-1032 (CGST 9%) and LIA-1033 (SGST 9%)
                        UPDATE jeevika_erp.SocVoucherDetail
                        SET AccountCode = 'LIA-1032', AccountName = 'CGST 9%'
                        WHERE AccountCode = 'LIA-1021';

                        UPDATE jeevika_erp.SocVoucherDetail
                        SET AccountCode = 'LIA-1033', AccountName = 'SGST 9%'
                        WHERE AccountCode = 'LIA-1022';

                        -- Soft-delete redundant Output CGST & Output SGST accounts so CGST 9% and SGST 9% take over
                        UPDATE jeevika_erp.SocAccount
                        SET IsDeleted = TRUE, IsDefault = FALSE
                        WHERE AccCode IN ('LIA-1021', 'LIA-1022');

                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillingMatrix (
                            MatrixId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, FYId INT, BillTypeId INT NOT NULL, MemberId INT NOT NULL,
                            AccountCode VARCHAR(50) NOT NULL, Amount NUMERIC(18,2) DEFAULT 0, UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE(SocietyId, BillTypeId, MemberId, AccountCode)
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocBillingSetting (
                            SettingId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, BillTypeId INT NOT NULL,
                            GSTCalc VARCHAR(20) DEFAULT 'MANUAL', InterestCalc VARCHAR(20) DEFAULT 'MANUAL', UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE(SocietyId, BillTypeId)
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocOpeningBankReco (
                            RecoId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, VoucherNo VARCHAR(50) NOT NULL, VoucherDate DATE NOT NULL,
                            AccountId INT, BankName VARCHAR(255) NOT NULL, UnclearedAmount NUMERIC(18,2) NOT NULL DEFAULT 0,
                            ChequeNo VARCHAR(50), ChequeDate DATE, BillRefNo VARCHAR(50), PaidTo VARCHAR(255),
                            Narration TEXT, Particular1 TEXT, Particular2 TEXT, IsCleared BOOLEAN DEFAULT FALSE, CreatedAt TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE(SocietyId, VoucherNo)
                        );
                        ALTER TABLE jeevika_erp.SocMemberBill ADD COLUMN IF NOT EXISTS BillType VARCHAR(100) DEFAULT 'Maintenance';
                        ALTER TABLE jeevika_erp.SocMemberBill ADD COLUMN IF NOT EXISTS Period VARCHAR(100);
                        ALTER TABLE jeevika_erp.SocMemberBill ADD COLUMN IF NOT EXISTS Particular1 TEXT;
                        ALTER TABLE jeevika_erp.SocMemberBill ADD COLUMN IF NOT EXISTS Particular2 TEXT;
                        ALTER TABLE jeevika_erp.SocMemberOpBalance ADD COLUMN IF NOT EXISTS BillTypeId INT;

                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberBillItem (
                            ItemId SERIAL PRIMARY KEY,
                            BillId INT NOT NULL REFERENCES jeevika_erp.SocMemberBill(BillId) ON DELETE CASCADE,
                            AccountCode VARCHAR(50),
                            AccountName VARCHAR(255),
                            Amount NUMERIC(18,2) DEFAULT 0
                        );

                        -- Ensure SocMember columns exist for secondary contact details
                        ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS ContactNo2 VARCHAR(50);
                        ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS Email2 VARCHAR(100);

                        -- Ensure SocStaff columns exist for extended details
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS Phone2 VARCHAR(50);
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS MonthlyCost NUMERIC(18,2) DEFAULT 0;
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS EndDate DATE;
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS Status VARCHAR(50) DEFAULT 'Active';
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS BankHolder VARCHAR(255);
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS BankAccount VARCHAR(100);
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS BankName VARCHAR(255);
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS BankIfsc VARCHAR(50);
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS BankBranch VARCHAR(255);
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS TdsSection VARCHAR(50) DEFAULT 'None';
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS PfNo VARCHAR(100);
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS EsicNo VARCHAR(100);
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS IsAuthorized BOOLEAN DEFAULT FALSE;
                        ALTER TABLE jeevika_erp.SocStaff ADD COLUMN IF NOT EXISTS Notes TEXT;

                        -- Ensure Bank Reconciliation columns exist on SocVoucherHeader
                        ALTER TABLE jeevika_erp.SocVoucherHeader ADD COLUMN IF NOT EXISTS ClearingDate DATE;
                        ALTER TABLE jeevika_erp.SocVoucherHeader ADD COLUMN IF NOT EXISTS ClearingRemark TEXT;

                        -- Only 'Maintenance' is the default bill type
                        INSERT INTO jeevika_erp.SocBillType (SocietyId, BillTypeCode, BillTypeName, Description) VALUES
                            (1, 'MAINT', 'Maintenance', 'Regular Monthly Maintenance Bill')
                        ON CONFLICT DO NOTHING;

                        -- Clean up any orphaned opening balances and billing matrix rows belonging to deleted members
                        DELETE FROM jeevika_erp.SocMemberOpBalance WHERE MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE IsDeleted = TRUE);
                        DELETE FROM jeevika_erp.SocBillingMatrix WHERE MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE IsDeleted = TRUE);

                        -- ═══════════════════════════════════════════════════════════
                        -- MEMBER REPORTS & HENU OS DESIGN CONFIGURATION TABLES
                        -- ═══════════════════════════════════════════════════════════
                        CREATE TABLE IF NOT EXISTS jeevika_erp.report_definitions (
                            id SERIAL PRIMARY KEY,
                            report_key VARCHAR(100) NOT NULL UNIQUE,
                            report_name VARCHAR(255) NOT NULL,
                            category VARCHAR(100) DEFAULT 'Member Reports',
                            parent_group VARCHAR(100) DEFAULT '',
                            description TEXT,
                            source_type VARCHAR(100) DEFAULT 'SQL_SERVICE',
                            active BOOLEAN DEFAULT TRUE,
                            created_at TIMESTAMPTZ DEFAULT NOW(),
                            updated_at TIMESTAMPTZ DEFAULT NOW()
                        );
                        ALTER TABLE jeevika_erp.report_definitions ADD COLUMN IF NOT EXISTS parent_group VARCHAR(100) DEFAULT '';

                        CREATE TABLE IF NOT EXISTS jeevika_erp.report_templates (
                            id SERIAL PRIMARY KEY,
                            report_key VARCHAR(100) NOT NULL,
                            template_key VARCHAR(100) NOT NULL,
                            template_name VARCHAR(255) NOT NULL,
                            template_version INT DEFAULT 1,
                            template_json TEXT NOT NULL,
                            is_system_template BOOLEAN DEFAULT TRUE,
                            is_active BOOLEAN DEFAULT TRUE,
                            created_at TIMESTAMPTZ DEFAULT NOW(),
                            updated_at TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE(report_key, template_key)
                        );

                        CREATE TABLE IF NOT EXISTS jeevika_erp.report_template_versions (
                            id SERIAL PRIMARY KEY,
                            template_id INT NOT NULL REFERENCES jeevika_erp.report_templates(id) ON DELETE CASCADE,
                            version_no INT NOT NULL,
                            template_json TEXT NOT NULL,
                            created_by VARCHAR(100) DEFAULT 'SYSTEM',
                            created_at TIMESTAMPTZ DEFAULT NOW(),
                            is_published BOOLEAN DEFAULT TRUE
                        );

                        CREATE TABLE IF NOT EXISTS jeevika_erp.report_runtime_settings (
                            id SERIAL PRIMARY KEY,
                            report_key VARCHAR(100) NOT NULL UNIQUE,
                            setting_json TEXT NOT NULL,
                            updated_by VARCHAR(100) DEFAULT 'SYSTEM',
                            updated_at TIMESTAMPTZ DEFAULT NOW()
                        );

                        CREATE TABLE IF NOT EXISTS jeevika_erp.report_filter_presets (
                            id SERIAL PRIMARY KEY,
                            report_key VARCHAR(100) NOT NULL,
                            preset_name VARCHAR(100) NOT NULL,
                            filter_json TEXT NOT NULL,
                            created_by VARCHAR(100) DEFAULT 'SYSTEM',
                            created_at TIMESTAMPTZ DEFAULT NOW(),
                            UNIQUE(report_key, preset_name)
                        );

                        CREATE TABLE IF NOT EXISTS jeevika_erp.report_assets (
                            id SERIAL PRIMARY KEY,
                            report_key VARCHAR(100) NOT NULL,
                            asset_type VARCHAR(50) NOT NULL,
                            file_name VARCHAR(255) NOT NULL,
                            storage_path TEXT NOT NULL,
                            mime_type VARCHAR(100),
                            metadata_json TEXT,
                            created_at TIMESTAMPTZ DEFAULT NOW()
                        );

                        CREATE TABLE IF NOT EXISTS jeevika_erp.report_audit_log (
                            id SERIAL PRIMARY KEY,
                            report_key VARCHAR(100) NOT NULL,
                            action VARCHAR(100) NOT NULL,
                            changed_by VARCHAR(100) DEFAULT 'SYSTEM',
                            old_value TEXT,
                            new_value TEXT,
                            version INT DEFAULT 1,
                            created_at TIMESTAMPTZ DEFAULT NOW()
                        );

                        -- Seed Central Report Registry for ALL 18 Member Report Items (19 tree nodes)
                        INSERT INTO jeevika_erp.report_definitions (report_key, report_name, category, parent_group, description) VALUES
                            ('MEMBER_BILL_FORMAT', 'Bill Format', 'Member Reports', '', 'Printable A4 GST and standard maintenance bills with full ledger breakdowns'),
                            ('MEMBER_RECEIPT', 'Receipt', 'Member Reports', '', 'Official payment receipts with multi-mode transaction confirmation'),
                            ('MEMBER_DEBIT_NOTE', 'Debit Note', 'Member Reports', '', 'Debit notes for penalties, revisions, and additional charges'),
                            ('MEMBER_CREDIT_NOTE', 'Credit Note', 'Member Reports', '', 'Credit notes for waivers, rebates, and billing adjustments'),
                            ('MEMBER_ADJUSTMENT', 'Adjustment', 'Member Reports', '', 'Bill type transfer and inter-account adjustment vouchers'),
                            ('MEMBER_OUTSTANDING_LIST', 'Outstanding List', 'Member Reports', '', 'Summary list of member dues, arrears, and aging balances'),
                            ('MEMBER_ACCOUNT_HEAD_WISE', 'Member Account | Head wise', 'Member Reports', 'Member Ledger', 'Head-wise pivot ledger breakdown for member debits and credits'),
                            ('MEMBER_REGISTER_DR_CR', 'Member Register [Dr/Cr]', 'Member Reports', 'Member Ledger', 'Member Dr/Cr tabular register with opening, billing, collections, and closing'),
                            ('MEMBER_CONTROL_ACCOUNT', 'Member Control Account', 'Member Reports', '', 'Month-by-month reconciliation of member demands and collections'),
                            ('MEMBER_BALANCE_CONFIRMATION', 'Balance Confirmation Letter', 'Member Reports', '', 'Formal annual/audit balance confirmation letters to members'),
                            ('MEMBER_BANK_DEPOSIT', 'Bank Deposite List', 'Member Reports', '', 'Banking schedule and pay-in slip for member cheque/digital receipts'),
                            ('MEMBER_DATA_SHEET', 'Data Sheet', 'Member Reports', '', 'Comprehensive registry datasheet of flat owners, areas, and contacts'),
                            ('MEMBER_BILL_REGISTER', 'Bill Register', 'Member Reports', 'Bill Register', 'Chronological and wing-wise register of all generated bills'),
                            ('MEMBER_RECEIPT_REGISTER', 'Receipt Register', 'Member Reports', 'Bill Register', 'Register of all member collections with mode and bank details'),
                            ('MEMBER_DEBIT_NOTE_REGISTER', 'Debit Note Register', 'Member Reports', 'Note Register', 'Register of all debit notes issued with reason and account heads'),
                            ('MEMBER_CREDIT_NOTE_REGISTER', 'Credit Note Register', 'Member Reports', 'Note Register', 'Register of all credit notes issued with reason and account heads'),
                            ('MEMBER_ADJUSTMENT_REGISTER', 'Adjustment Register', 'Member Reports', 'Note Register', 'Register of member adjustments and bill type transfers'),
                            ('MEMBER_JV_REGISTER', 'Member JV Register', 'Member Reports', 'Note Register', 'Register of member-related journal vouchers with double-entry leg breakdown')
                        ON CONFLICT (report_key) DO UPDATE SET 
                            report_name = EXCLUDED.report_name,
                            category = EXCLUDED.category,
                            parent_group = EXCLUDED.parent_group,
                            description = EXCLUDED.description,
                            updated_at = NOW();";
                    ensureTables.ExecuteNonQuery();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DbHelper] Auto-create database check note: {ex.Message}");
            }
        }

        public static NpgsqlConnection GetConn()
        {
            if (string.IsNullOrEmpty(_connectionString))
                throw new InvalidOperationException("DbHelper not initialized. Call DbHelper.Initialize() first.");

            var conn = new NpgsqlConnection(_connectionString);
            conn.Open();
            return conn;
        }

        public static System.Data.Common.DbConnection GetDbConnection()
        {
            return ConnectionFactory?.CreateOpenConnection() ?? GetConn();
        }

        public static void Execute(string sql, Action<NpgsqlCommand>? configure = null)
        {
            using var conn = GetConn();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = sql;
            configure?.Invoke(cmd);
            cmd.ExecuteNonQuery();
        }

        public static (bool ok, string message) TestConnection()
        {
            try
            {
                if (ConnectionFactory != null)
                {
                    using var conn = ConnectionFactory.CreateOpenConnection();
                    return (true, $"Connected successfully to {ConnectionFactory.ProviderName}.");
                }
                using var pConn = GetConn();
                return (true, "Connected successfully.");
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }

        public static void EnsureDefaultAdmin(string username, string plainPassword)
        {
            try
            {
                using var conn = GetConn();
                using var checkCmd = conn.CreateCommand();
                checkCmd.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SoftUser WHERE IsActive = TRUE";
                var count = Convert.ToInt64(checkCmd.ExecuteScalar() ?? 0L);

                if (count == 0)
                {
                    var hash = BCrypt.Net.BCrypt.HashPassword(plainPassword, workFactor: 12);

                    using var insertCmd = conn.CreateCommand();
                    insertCmd.CommandText = @"
                        INSERT INTO jeevika_erp.SoftUser
                            (UserName, PasswordHash, UserType, Role, IsActive, CreatedAt)
                        VALUES
                            (@user, @hash, 'ADMIN', 'SuperAdmin', TRUE, NOW())
                        ON CONFLICT (UserName) DO NOTHING";
                    insertCmd.Parameters.AddWithValue("@user", username.ToUpper());
                    insertCmd.Parameters.AddWithValue("@hash", hash);
                    insertCmd.ExecuteNonQuery();

                    Console.WriteLine($"[DbHelper] Default admin user '{username}' created.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DbHelper] Warning: Could not ensure default admin: {ex.Message}");
            }
        }
    }
}
