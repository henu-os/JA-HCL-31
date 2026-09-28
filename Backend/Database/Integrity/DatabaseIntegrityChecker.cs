// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — DatabaseIntegrityChecker
// Performs structural integrity checks, PRAGMA validation (SQLite),
// foreign-key enforcement checks, and Society/FY isolation audits.
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data.Common;

namespace JeevikaERP.Database.Integrity
{
    public class IntegrityReport
    {
        public bool IsValid { get; set; }
        public List<string> ChecksPassed { get; set; } = new();
        public List<string> Violations { get; set; } = new();
        public string Summary => IsValid 
            ? $"All {ChecksPassed.Count} integrity checks passed successfully." 
            : $"Integrity check FAILED: {Violations.Count} violation(s) found.";
    }

    public class DatabaseIntegrityChecker
    {
        private readonly IDbConnectionFactory _connectionFactory;

        public static readonly string[] RequiredTables = new[]
        {
            "SoftUser",
            "SocietyInfo",
            "FinancialYear",
            "TxNumberConfig",
            "SocGroup",
            "SocAccount",
            "SocMember",
            "SocVendor",
            "SocStaff",
            "SocCommittee",
            "SocBillType",
            "SocBillingMatrix",
            "SocBillingSetting",
            "SocOpeningBankReco",
            "SocVoucherHeader",
            "SocVoucherDetail",
            "SocMemberBill",
            "SocMemberBillItem",
            "SocMemberNote",
            "SocOpeningBalance",
            "SocFixedDeposit",
            "SocMemberTransfer",
            "SocMemberLien",
            "SocMemberTenant",
            "SocMemberNominee",
            "SocMemberBillOverride",
            "SocBillTypeHead",
            "SocBillTypeNote",
            "AuditLog",
            "schema_migrations"
        };

        public DatabaseIntegrityChecker(IDbConnectionFactory connectionFactory)
        {
            _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        }

        public IntegrityReport RunAllChecks()
        {
            var report = new IntegrityReport { IsValid = true };

            try
            {
                using var conn = _connectionFactory.CreateOpenConnection();

                // 1. Check SQLite low-level integrity if SQLite
                if (_connectionFactory.ProviderName == "SQLite")
                {
                    CheckSqlitePragmas(conn, report);
                }

                // 2. Verify all required core tables exist
                CheckRequiredTables(conn, report);

                // 3. Verify Foreign Key relationships & Orphan Records
                CheckOrphanRecords(conn, report);

                // 4. Verify Active Society / Financial Year boundaries
                CheckSocietyFYScoping(conn, report);

                report.IsValid = report.Violations.Count == 0;
            }
            catch (Exception ex)
            {
                report.IsValid = false;
                report.Violations.Add($"Integrity check runner error: {ex.Message}");
            }

            return report;
        }

        private void CheckSqlitePragmas(DbConnection conn, IntegrityReport report)
        {
            // PRAGMA quick_check
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "PRAGMA quick_check;";
                var res = Convert.ToString(cmd.ExecuteScalar()) ?? "failed";
                if (res.Equals("ok", StringComparison.OrdinalIgnoreCase))
                {
                    report.ChecksPassed.Add("SQLite PRAGMA quick_check: ok");
                }
                else
                {
                    report.Violations.Add($"SQLite PRAGMA quick_check failed: {res}");
                }
            }

            // PRAGMA foreign_key_check
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "PRAGMA foreign_key_check;";
                using var reader = cmd.ExecuteReader();
                var fkViolations = 0;
                while (reader.Read())
                {
                    fkViolations++;
                    var table = reader[0]?.ToString() ?? "unknown";
                    report.Violations.Add($"SQLite foreign key violation on table '{table}'");
                }

                if (fkViolations == 0)
                {
                    report.ChecksPassed.Add("SQLite PRAGMA foreign_key_check: 0 violations");
                }
            }
        }

        private void CheckRequiredTables(DbConnection conn, IntegrityReport report)
        {
            var existingTables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            using (var cmd = conn.CreateCommand())
            {
                if (_connectionFactory.ProviderName == "PostgreSQL")
                {
                    cmd.CommandText = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'jeevika_erp';";
                }
                else
                {
                    cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table';";
                }

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    existingTables.Add(reader.GetString(0));
                }
            }

            foreach (var table in RequiredTables)
            {
                if (existingTables.Contains(table))
                {
                    report.ChecksPassed.Add($"Table '{table}' exists");
                }
                else
                {
                    report.Violations.Add($"Missing required table '{table}'");
                }
            }
        }

        private void CheckOrphanRecords(DbConnection conn, IntegrityReport report)
        {
            var isPg = _connectionFactory.ProviderName == "PostgreSQL";
            var schema = isPg ? "jeevika_erp." : "";

            // Check orphaned Voucher Details
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT COUNT(*) FROM {schema}SocVoucherDetail vd LEFT JOIN {schema}SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId WHERE vh.VoucherId IS NULL;";
                var orphans = Convert.ToInt64(cmd.ExecuteScalar() ?? 0L);
                if (orphans == 0)
                {
                    report.ChecksPassed.Add("Voucher Details foreign integrity: 0 orphans");
                }
                else
                {
                    report.Violations.Add($"Found {orphans} orphaned SocVoucherDetail records without parent SocVoucherHeader.");
                }
            }
            catch (Exception ex)
            {
                report.Violations.Add($"Orphan check error for SocVoucherDetail: {ex.Message}");
            }
        }

        private void CheckSocietyFYScoping(DbConnection conn, IntegrityReport report)
        {
            var isPg = _connectionFactory.ProviderName == "PostgreSQL";
            var schema = isPg ? "jeevika_erp." : "";

            // Check Financial Year foreign reference to SocietyInfo
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT COUNT(*) FROM {schema}FinancialYear fy LEFT JOIN {schema}SocietyInfo s ON fy.SocietyId = s.SocietyId WHERE s.SocietyId IS NULL;";
                var orphans = Convert.ToInt64(cmd.ExecuteScalar() ?? 0L);
                if (orphans == 0)
                {
                    report.ChecksPassed.Add("FinancialYear society relationship: 0 orphans");
                }
                else
                {
                    report.Violations.Add($"Found {orphans} FinancialYear records referencing invalid SocietyId.");
                }
            }
            catch (Exception ex)
            {
                report.Violations.Add($"Scoping check error for FinancialYear: {ex.Message}");
            }
        }
    }
}
