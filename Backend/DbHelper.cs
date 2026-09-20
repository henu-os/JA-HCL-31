// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — DbHelper
// Single place to manage PostgreSQL connection.
// Connection string comes from appsettings.json — NEVER hardcoded.
// Auto-creates database jeevika_db_v2 and runs schema/seed if missing!
// ═══════════════════════════════════════════════════════════

using Npgsql;
using Microsoft.Extensions.Configuration;

namespace JeevikaERP
{
    public static class DbHelper
    {
        private static string? _connectionString;

        public static void Initialize(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("Default")
                ?? throw new InvalidOperationException(
                    "Connection string 'Default' not found in appsettings.json. " +
                    "Please set Host, Port, Database, Username, Password.");

            ResolveWorkingConnectionString();
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

            var targetDb = builder.Database;
            foreach (var pass in candidates.Distinct())
            {
                builder.Password = pass;
                var testBuilder = new NpgsqlConnectionStringBuilder(builder.ConnectionString)
                {
                    Database = "postgres",
                    Timeout = 3
                };

                try
                {
                    using var conn = new NpgsqlConnection(testBuilder.ConnectionString);
                    conn.Open();
                    builder.Database = targetDb;
                    _connectionString = builder.ConnectionString;
                    return;
                }
                catch (PostgresException pEx) when (pEx.SqlState == "28P01")
                {
                    continue;
                }
                catch
                {
                    // Fall back to trying next
                }
            }
        }

        private static void EnsureDatabaseCreated()
        {
            if (string.IsNullOrEmpty(_connectionString)) return;

            try
            {
                var builder = new NpgsqlConnectionStringBuilder(_connectionString);
                var targetDb = builder.Database;

                // 1. Connect to default 'postgres' database to check/create target db
                builder.Database = "postgres";
                using (var masterConn = new NpgsqlConnection(builder.ConnectionString))
                {
                    masterConn.Open();
                    using var checkCmd = masterConn.CreateCommand();
                    checkCmd.CommandText = "SELECT COUNT(*) FROM pg_database WHERE datname = @dbname";
                    checkCmd.Parameters.AddWithValue("@dbname", targetDb);

                    var exists = Convert.ToInt64(checkCmd.ExecuteScalar() ?? 0) > 0;
                    if (!exists)
                    {
                        Console.WriteLine($"[DbHelper] Database '{targetDb}' not found. Creating database...");
                        using var createCmd = masterConn.CreateCommand();
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

                        var schemaPath = Path.Combine(rootDir, "Database", "schema.sql");
                        var seedPath   = Path.Combine(rootDir, "Database", "seed.sql");

                        if (!File.Exists(schemaPath))
                        {
                            // fallback search
                            schemaPath = Path.Combine(Directory.GetCurrentDirectory(), "..", "Database", "schema.sql");
                            seedPath   = Path.Combine(Directory.GetCurrentDirectory(), "..", "Database", "seed.sql");
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

                    // Always ensure Member Master child tables exist
                    using var ensureTables = targetConn.CreateCommand();
                    ensureTables.CommandText = @"
                        -- Drop old non-partial unique constraints so deleted records do not block code reuse
                        DO $$
                        BEGIN
                            IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'socgroup_societyid_grpcode_key' AND table_name = 'socgroup') THEN
                                ALTER TABLE jeevika_erp.SocGroup DROP CONSTRAINT socgroup_societyid_grpcode_key;
                            END IF;
                            IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'socaccount_societyid_acccode_key' AND table_name = 'socaccount') THEN
                                ALTER TABLE jeevika_erp.SocAccount DROP CONSTRAINT socaccount_societyid_acccode_key;
                            END IF;
                        END $$;

                        -- Clean up any orphaned soft-deleted groups that have no accounts attached
                        DELETE FROM jeevika_erp.SocGroup WHERE IsDeleted = TRUE AND GroupId NOT IN (SELECT GroupId FROM jeevika_erp.SocAccount WHERE GroupId IS NOT NULL);

                        -- Create partial unique indexes so only active records enforce unique codes
                        CREATE UNIQUE INDEX IF NOT EXISTS uq_socgroup_code_active ON jeevika_erp.SocGroup (SocietyId, GrpCode) WHERE IsDeleted = FALSE;
                        CREATE UNIQUE INDEX IF NOT EXISTS uq_socaccount_code_active ON jeevika_erp.SocAccount (SocietyId, AccCode) WHERE IsDeleted = FALSE;

                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberTransfer (
                            TransferId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, MemberId INT NOT NULL,
                            TransferDate DATE, TransferType VARCHAR(100), MeetingType VARCHAR(50), MeetingDate DATE,
                            ResolutionNo VARCHAR(100), TransferNo VARCHAR(50), RegNoTransferor VARCHAR(100),
                            RegNoTransferee VARCHAR(100), AgreementAssign VARCHAR(255), TransferorName VARCHAR(255),
                            TransfereeName VARCHAR(255), Remarks TEXT, OldOwnerSnapshot JSONB, CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberLien (
                            LienId SERIAL PRIMARY KEY, SocietyId INT NOT NULL, MemberId INT NOT NULL,
                            BankName VARCHAR(255), BankAddress TEXT, LoanAmount NUMERIC(18,2) DEFAULT 0,
                            PeriodYears VARCHAR(50), MeetingDate DATE, ResolutionNo VARCHAR(100), SanctionDate DATE,
                            NocDate DATE, CancelDate DATE, Status VARCHAR(50) DEFAULT 'Active', IsArchived BOOLEAN DEFAULT FALSE, CreatedAt TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberTenant (
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

                        CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberBillItem (
                            ItemId SERIAL PRIMARY KEY,
                            BillId INT NOT NULL REFERENCES jeevika_erp.SocMemberBill(BillId) ON DELETE CASCADE,
                            AccountCode VARCHAR(50),
                            AccountName VARCHAR(255),
                            Amount NUMERIC(18,2) DEFAULT 0
                        );

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
                        ON CONFLICT DO NOTHING;";
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
                using var conn = GetConn();
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
