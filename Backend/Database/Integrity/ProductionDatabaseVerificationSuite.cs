// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — ProductionDatabaseVerificationSuite
// Read-only Non-destructive Verification Suite for Configured Production / Server Database
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Linq;

namespace JeevikaERP.Database.Integrity
{
    public class ProductionVerificationResult
    {
        public string CheckName { get; set; } = string.Empty;
        public string Status { get; set; } = "PASS"; // PASS, FAIL, BLOCKED
        public string Details { get; set; } = string.Empty;
    }

    public static class ProductionDatabaseVerificationSuite
    {
        private static readonly string[] RequiredTables = new[]
        {
            "SocietyInfo", "FinancialYear", "TxNumberConfig", "SocGroup",
            "SocAccount", "SocMember", "SocVendor", "SocStaff", "SocCommittee",
            "SocBillType", "SocBillingMatrix", "SocBillingSetting", "SocOpeningBankReco",
            "SocVoucherHeader", "SocVoucherDetail", "SocMemberBill", "SocMemberBillItem",
            "SocMemberNote", "SocOpeningBalance", "SocFixedDeposit", "SocMemberTransfer",
            "SoftUser"
        };

        public static List<ProductionVerificationResult> RunVerification()
        {
            var results = new List<ProductionVerificationResult>();

            DbConnection? conn = null;
            try
            {
                conn = DbHelper.GetDbConnection();
                if (conn.State != ConnectionState.Open) conn.Open();

                string provider = conn.GetType().Name.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) ? "PostgreSQL" : "SQLite";
                string prefix = provider == "PostgreSQL" ? "jeevika_erp." : "";

                results.Add(new ProductionVerificationResult
                {
                    CheckName = "Database Connection & Provider Resolution",
                    Status = "PASS",
                    Details = $"Successfully connected to live {provider} database: '{conn.Database}'."
                });

                // ── Check 1: Schema Namespace Verification ──
                if (provider == "PostgreSQL")
                {
                    using var checkSchema = conn.CreateCommand();
                    checkSchema.CommandText = "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = 'jeevika_erp'";
                    var schemaExists = Convert.ToInt64(checkSchema.ExecuteScalar() ?? 0L) > 0;
                    if (schemaExists)
                    {
                        results.Add(new ProductionVerificationResult
                        {
                            CheckName = "Schema Namespace 'jeevika_erp'",
                            Status = "PASS",
                            Details = "Canonical schema 'jeevika_erp' exists in target PostgreSQL database."
                        });
                    }
                    else
                    {
                        results.Add(new ProductionVerificationResult
                        {
                            CheckName = "Schema Namespace 'jeevika_erp'",
                            Status = "FAIL",
                            Details = "Schema 'jeevika_erp' was not found in PostgreSQL instance."
                        });
                    }
                }

                // ── Check 2: Table Existence & Record Counts ──
                var tableCounts = new Dictionary<string, long>();
                int missingCount = 0;
                foreach (var table in RequiredTables)
                {
                    try
                    {
                        using var countCmd = conn.CreateCommand();
                        countCmd.CommandText = $"SELECT COUNT(*) FROM {prefix}{table}";
                        var count = Convert.ToInt64(countCmd.ExecuteScalar() ?? 0L);
                        tableCounts[table] = count;
                    }
                    catch (Exception)
                    {
                        missingCount++;
                        tableCounts[table] = -1;
                    }
                }

                if (missingCount == 0)
                {
                    var summary = string.Join(", ", tableCounts.Take(6).Select(kvp => $"{kvp.Key}={kvp.Value}"));
                    results.Add(new ProductionVerificationResult
                    {
                        CheckName = "Required Table Schema & Existence",
                        Status = "PASS",
                        Details = $"All {RequiredTables.Length} canonical tables exist ({summary}, ...)."
                    });
                }
                else
                {
                    results.Add(new ProductionVerificationResult
                    {
                        CheckName = "Required Table Schema & Existence",
                        Status = "FAIL",
                        Details = $"{missingCount} required table(s) missing from database."
                    });
                }

                // ── Check 3: Foreign Key & Referential Integrity ──
                try
                {
                    using var orphanCmd = conn.CreateCommand();
                    orphanCmd.CommandText = $@"
                        SELECT COUNT(*) FROM {prefix}SocVoucherDetail vd
                        LEFT JOIN {prefix}SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId
                        WHERE vh.VoucherId IS NULL;";
                    var orphanedDetails = Convert.ToInt64(orphanCmd.ExecuteScalar() ?? 0L);

                    if (orphanedDetails == 0)
                    {
                        results.Add(new ProductionVerificationResult
                        {
                            CheckName = "Foreign Key Integrity (Voucher Header/Detail)",
                            Status = "PASS",
                            Details = "0 orphaned voucher details found. Parent-child referential integrity intact."
                        });
                    }
                    else
                    {
                        results.Add(new ProductionVerificationResult
                        {
                            CheckName = "Foreign Key Integrity (Voucher Header/Detail)",
                            Status = "FAIL",
                            Details = $"{orphanedDetails} orphaned voucher details detected."
                        });
                    }
                }
                catch (Exception ex)
                {
                    results.Add(new ProductionVerificationResult
                    {
                        CheckName = "Foreign Key Integrity (Voucher Header/Detail)",
                        Status = "FAIL",
                        Details = ex.Message
                    });
                }

                // ── Check 4: Double-Entry Accounting Invariant & Voucher Balancing ──
                try
                {
                    using var vchCmd = conn.CreateCommand();
                    vchCmd.CommandText = $@"
                        SELECT h.VoucherId, h.VoucherNo, h.VoucherType, COALESCE(h.Amount, 0) AS HeaderAmount,
                               COALESCE(SUM(d.Debit), 0) AS SumDebit,
                               COALESCE(SUM(d.Credit), 0) AS SumCredit
                        FROM {prefix}SocVoucherHeader h
                        LEFT JOIN {prefix}SocVoucherDetail d ON h.VoucherId = d.VoucherId
                        GROUP BY h.VoucherId, h.VoucherNo, h.VoucherType, h.Amount;";

                    int totalVouchers = 0;
                    int balancedVouchers = 0;
                    int unbalancedCount = 0;
                    var unbalancedDetails = new List<string>();

                    var singleLegTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    {
                        "MemberDebitNote", "MemberCreditNote", "DebitNote", "CreditNote", "MDN", "MCN", "ADJ", "Note"
                    };

                    using (var rdr = vchCmd.ExecuteReader())
                    {
                        while (rdr.Read())
                        {
                            totalVouchers++;
                            var vchId = rdr["VoucherId"]?.ToString() ?? "";
                            var vchNo = rdr["VoucherNo"]?.ToString() ?? vchId;
                            var vchType = rdr["VoucherType"]?.ToString() ?? "";
                            var headerAmount = Convert.ToDecimal(rdr["HeaderAmount"]);
                            var sumDr = Convert.ToDecimal(rdr["SumDebit"]);
                            var sumCr = Convert.ToDecimal(rdr["SumCredit"]);

                            bool isSingleLeg = singleLegTypes.Contains(vchType) ||
                                              vchNo.StartsWith("MDN", StringComparison.OrdinalIgnoreCase) ||
                                              vchNo.StartsWith("MCN", StringComparison.OrdinalIgnoreCase) ||
                                              vchNo.StartsWith("ADJ", StringComparison.OrdinalIgnoreCase) ||
                                              (sumDr == 0 && Math.Abs(sumCr - headerAmount) < 0.01m && headerAmount > 0) ||
                                              (sumCr == 0 && Math.Abs(sumDr - headerAmount) < 0.01m && headerAmount > 0);

                            if (isSingleLeg)
                            {
                                var totalDetail = sumDr > 0 ? sumDr : sumCr;
                                if (headerAmount > 0 && Math.Abs(totalDetail - headerAmount) > 0.01m)
                                {
                                    unbalancedCount++;
                                    unbalancedDetails.Add($"Note voucher '{vchNo}' detail total ({totalDetail:F2}) != header amount ({headerAmount:F2})");
                                }
                                else
                                {
                                    balancedVouchers++;
                                }
                            }
                            else
                            {
                                if (Math.Abs(sumDr - sumCr) > 0.001m)
                                {
                                    unbalancedCount++;
                                    unbalancedDetails.Add($"Standard voucher '{vchNo}' unbalanced (Dr={sumDr:F2}, Cr={sumCr:F2})");
                                }
                                else
                                {
                                    balancedVouchers++;
                                }
                            }
                        }
                    }

                    if (unbalancedCount == 0)
                    {
                        results.Add(new ProductionVerificationResult
                        {
                            CheckName = "Double-Entry Accounting & Voucher Integrity",
                            Status = "PASS",
                            Details = $"All {totalVouchers} vouchers verified. Standard vouchers strictly balanced (Dr == Cr) and note vouchers match header amounts."
                        });
                    }
                    else
                    {
                        results.Add(new ProductionVerificationResult
                        {
                            CheckName = "Double-Entry Accounting & Voucher Integrity",
                            Status = "FAIL",
                            Details = $"{unbalancedCount} voucher(s) failed balancing invariants: {string.Join("; ", unbalancedDetails.Take(3))}"
                        });
                    }
                }
                catch (Exception ex)
                {
                    results.Add(new ProductionVerificationResult
                    {
                        CheckName = "Double-Entry Accounting & Voucher Integrity",
                        Status = "FAIL",
                        Details = ex.Message
                    });
                }

                // ── Check 5: Financial Year Scoping & Duplicate Check ──
                try
                {
                    using var dupFyCmd = conn.CreateCommand();
                    dupFyCmd.CommandText = $@"
                        SELECT SocietyId, UPPER(FYLabel), COUNT(*)
                        FROM {prefix}FinancialYear
                        GROUP BY SocietyId, UPPER(FYLabel)
                        HAVING COUNT(*) > 1;";
                    using var rdr = dupFyCmd.ExecuteReader();
                    bool hasDuplicates = rdr.Read();

                    if (!hasDuplicates)
                    {
                        results.Add(new ProductionVerificationResult
                        {
                            CheckName = "Financial Year Uniqueness & Society Scoping",
                            Status = "PASS",
                            Details = "0 duplicate financial years across all societies. Composite identity valid."
                        });
                    }
                    else
                    {
                        results.Add(new ProductionVerificationResult
                        {
                            CheckName = "Financial Year Uniqueness & Society Scoping",
                            Status = "FAIL",
                            Details = "Duplicate financial year records detected for same society."
                        });
                    }
                }
                catch (Exception ex)
                {
                    results.Add(new ProductionVerificationResult
                    {
                        CheckName = "Financial Year Uniqueness & Society Scoping",
                        Status = "FAIL",
                        Details = ex.Message
                    });
                }

                // ── Check 6: Active Societies Count ──
                try
                {
                    using var socCmd = conn.CreateCommand();
                    if (provider == "PostgreSQL")
                    {
                        socCmd.CommandText = $"SELECT COUNT(*) FROM {prefix}SocietyInfo WHERE IsActive = TRUE;";
                    }
                    else
                    {
                        socCmd.CommandText = $"SELECT COUNT(*) FROM {prefix}SocietyInfo WHERE IsActive = 1;";
                    }
                    var socCount = Convert.ToInt64(socCmd.ExecuteScalar() ?? 0L);
                    results.Add(new ProductionVerificationResult
                    {
                        CheckName = "Active Society Verification",
                        Status = "PASS",
                        Details = $"{socCount} active societies verified in production database."
                    });
                }
                catch (Exception ex)
                {
                    results.Add(new ProductionVerificationResult
                    {
                        CheckName = "Active Society Verification",
                        Status = "FAIL",
                        Details = ex.Message
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new ProductionVerificationResult
                {
                    CheckName = "Database Connection & Provider Resolution",
                    Status = "BLOCKED",
                    Details = $"Cannot connect to production database: {ex.Message}"
                });
            }
            finally
            {
                conn?.Dispose();
            }

            return results;
        }
    }
}
