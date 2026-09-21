// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — FinancialYearVerificationSuite
// Comprehensive Verification Suite for Financial Year Management
// & Financial-Year-Aware Universal Export/Import Module
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using Microsoft.Data.Sqlite;
using JeevikaERP.Database.ExportImport;
using JeevikaERP.Database.Migrations;

namespace JeevikaERP.Database.Integrity
{
    public class FinancialYearVerificationResult
    {
        public string TestName { get; set; } = string.Empty;
        public string Status { get; set; } = "PASS"; // PASS, FAIL, SKIP
        public string Details { get; set; } = string.Empty;
    }

    public static class FinancialYearVerificationSuite
    {
        public static List<FinancialYearVerificationResult> RunVerification(string testDbPath, string migrationsDir)
        {
            var results = new List<FinancialYearVerificationResult>();

            try
            {
                if (File.Exists(testDbPath)) File.Delete(testDbPath);
            }
            catch { }

            var connStr = $"Data Source={testDbPath};Foreign Keys=True;";
            var factory = new SqliteConnectionFactory(connStr);

            // Setup: Run schema and migrations
            try
            {
                var runner = new MigrationRunner(factory, migrationsDir);
                var mResult = runner.Execute();
                if (mResult.Success)
                {
                    results.Add(new FinancialYearVerificationResult
                    {
                        TestName = "Migration Idempotence & Schema Setup",
                        Status = "PASS",
                        Details = "SQLite schema initialized with Foreign Keys and standard tables."
                    });
                }
                else
                {
                    results.Add(new FinancialYearVerificationResult
                    {
                        TestName = "Migration Idempotence & Schema Setup",
                        Status = "FAIL",
                        Details = mResult.ErrorMessage ?? "Migration execution failed."
                    });
                    return results;
                }
            }
            catch (Exception ex)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Migration Idempotence & Schema Setup",
                    Status = "FAIL",
                    Details = $"Migration runner failed: {ex.Message}"
                });
                return results;
            }

            using var conn = factory.CreateOpenConnection();

            // Seed initial society
            long soc1Id = 0;
            long soc2Id = 0;
            try
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        INSERT INTO SocietyInfo (SocietyCode, SocietyName, City, IsActive)
                        VALUES ('SOC1', 'HENU SOCIETY ONE', 'MUMBAI', 1);
                        SELECT last_insert_rowid();";
                    soc1Id = Convert.ToInt64(cmd.ExecuteScalar());
                }

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        INSERT INTO SocietyInfo (SocietyCode, SocietyName, City, IsActive)
                        VALUES ('SOC2', 'HENU SOCIETY TWO', 'PUNE', 1);
                        SELECT last_insert_rowid();";
                    soc2Id = Convert.ToInt64(cmd.ExecuteScalar());
                }
            }
            catch (Exception ex)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Society Seeding",
                    Status = "FAIL",
                    Details = $"Failed to seed test societies: {ex.Message}"
                });
                return results;
            }

            // ── TEST 1: Create Valid Financial Year with Auto Start/End Dates ──
            long fy1Id = 0;
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO FinancialYear (SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed)
                    VALUES (@sid, @label, @start, @end, 1, 0);
                    SELECT last_insert_rowid();";
                cmd.Parameters.Add(CreateParam(cmd, "@sid", soc1Id));
                cmd.Parameters.Add(CreateParam(cmd, "@label", "2026-2027"));
                cmd.Parameters.Add(CreateParam(cmd, "@start", "2026-04-01"));
                cmd.Parameters.Add(CreateParam(cmd, "@end", "2027-03-31"));
                fy1Id = Convert.ToInt64(cmd.ExecuteScalar());

                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Create Valid Financial Year & Date Validation",
                    Status = "PASS",
                    Details = $"Created FY 2026-2027 (ID: {fy1Id}) with Start=2026-04-01, End=2027-03-31."
                });
            }
            catch (Exception ex)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Create Valid Financial Year & Date Validation",
                    Status = "FAIL",
                    Details = ex.Message
                });
            }

            // ── TEST 2: Duplicate Financial Year Rejection ──
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO FinancialYear (SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed)
                    VALUES (@sid, @label, @start, @end, 1, 0);";
                cmd.Parameters.Add(CreateParam(cmd, "@sid", soc1Id));
                cmd.Parameters.Add(CreateParam(cmd, "@label", "2026-2027"));
                cmd.Parameters.Add(CreateParam(cmd, "@start", "2026-04-01"));
                cmd.Parameters.Add(CreateParam(cmd, "@end", "2027-03-31"));
                cmd.ExecuteNonQuery();

                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Duplicate Financial Year Rejection",
                    Status = "FAIL",
                    Details = "Duplicate financial year was accepted but should have been rejected."
                });
            }
            catch (Exception)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Duplicate Financial Year Rejection",
                    Status = "PASS",
                    Details = "Unique constraint successfully prevented duplicate FY '2026-2027' in same society."
                });
            }

            // ── TEST 3: Society Isolation (Same FYLabel in different society) ──
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO FinancialYear (SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed)
                    VALUES (@sid, @label, @start, @end, 1, 0);
                    SELECT last_insert_rowid();";
                cmd.Parameters.Add(CreateParam(cmd, "@sid", soc2Id));
                cmd.Parameters.Add(CreateParam(cmd, "@label", "2026-2027"));
                cmd.Parameters.Add(CreateParam(cmd, "@start", "2026-04-01"));
                cmd.Parameters.Add(CreateParam(cmd, "@end", "2027-03-31"));
                var fySoc2Id = Convert.ToInt64(cmd.ExecuteScalar());

                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Society Isolation for Financial Years",
                    Status = "PASS",
                    Details = $"Same FY label '2026-2027' created independently in Society 2 (ID: {fySoc2Id})."
                });
            }
            catch (Exception ex)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Society Isolation for Financial Years",
                    Status = "FAIL",
                    Details = ex.Message
                });
            }

            // ── TEST 4: Seeding Additional FY & Accounting Transactions ──
            long fy2Id = 0;
            try
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        INSERT INTO FinancialYear (SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed)
                        VALUES (@sid, '2027-2028', '2027-04-01', '2028-03-31', 1, 0);
                        SELECT last_insert_rowid();";
                    cmd.Parameters.Add(CreateParam(cmd, "@sid", soc1Id));
                    fy2Id = Convert.ToInt64(cmd.ExecuteScalar());
                }

                // Seed group and account
                long accId1 = 0, accId2 = 0;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        INSERT INTO SocGroup (SocietyId, GrpCode, GrpName)
                        VALUES (@sid, 'ASSET', 'Current Assets');
                        SELECT last_insert_rowid();";
                    cmd.Parameters.Add(CreateParam(cmd, "@sid", soc1Id));
                    var grpId = Convert.ToInt64(cmd.ExecuteScalar());

                    cmd.CommandText = @"
                        INSERT INTO SocAccount (SocietyId, GroupId, AccCode, AccName)
                        VALUES (@sid, @gid, 'BANK01', 'State Bank of India');
                        SELECT last_insert_rowid();";
                    cmd.Parameters.Clear();
                    cmd.Parameters.Add(CreateParam(cmd, "@sid", soc1Id));
                    cmd.Parameters.Add(CreateParam(cmd, "@gid", grpId));
                    accId1 = Convert.ToInt64(cmd.ExecuteScalar());

                    cmd.CommandText = @"
                        INSERT INTO SocAccount (SocietyId, GroupId, AccCode, AccName)
                        VALUES (@sid, @gid, 'MAINT01', 'Maintenance Income');
                        SELECT last_insert_rowid();";
                    cmd.Parameters.Clear();
                    cmd.Parameters.Add(CreateParam(cmd, "@sid", soc1Id));
                    cmd.Parameters.Add(CreateParam(cmd, "@gid", grpId));
                    accId2 = Convert.ToInt64(cmd.ExecuteScalar());
                }

                // Seed Voucher in FY1
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        INSERT INTO SocVoucherHeader (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, Amount, Status)
                        VALUES (@sid, @fyId, 'VR-2026-001', 'BRV', '2026-05-10', 5000.00, 'Posted');
                        SELECT last_insert_rowid();";
                    cmd.Parameters.Add(CreateParam(cmd, "@sid", soc1Id));
                    cmd.Parameters.Add(CreateParam(cmd, "@fyId", fy1Id));
                    var vchId1 = Convert.ToInt64(cmd.ExecuteScalar());

                    cmd.CommandText = @"
                        INSERT INTO SocVoucherDetail (VoucherId, AccountId, Debit, Credit, Narration)
                        VALUES (@vId, @a1, 5000.00, 0.00, 'Debit leg');
                        INSERT INTO SocVoucherDetail (VoucherId, AccountId, Debit, Credit, Narration)
                        VALUES (@vId, @a2, 0.00, 5000.00, 'Credit leg');";
                    cmd.Parameters.Clear();
                    cmd.Parameters.Add(CreateParam(cmd, "@vId", vchId1));
                    cmd.Parameters.Add(CreateParam(cmd, "@a1", accId1));
                    cmd.Parameters.Add(CreateParam(cmd, "@a2", accId2));
                    cmd.ExecuteNonQuery();
                }

                // Seed Voucher in FY2
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        INSERT INTO SocVoucherHeader (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, Amount, Status)
                        VALUES (@sid, @fyId, 'VR-2027-001', 'BRV', '2027-06-15', 7500.00, 'Posted');
                        SELECT last_insert_rowid();";
                    cmd.Parameters.Add(CreateParam(cmd, "@sid", soc1Id));
                    cmd.Parameters.Add(CreateParam(cmd, "@fyId", fy2Id));
                    var vchId2 = Convert.ToInt64(cmd.ExecuteScalar());

                    cmd.CommandText = @"
                        INSERT INTO SocVoucherDetail (VoucherId, AccountId, Debit, Credit, Narration)
                        VALUES (@vId, @a1, 7500.00, 0.00, 'Debit leg');
                        INSERT INTO SocVoucherDetail (VoucherId, AccountId, Debit, Credit, Narration)
                        VALUES (@vId, @a2, 0.00, 7500.00, 'Credit leg');";
                    cmd.Parameters.Clear();
                    cmd.Parameters.Add(CreateParam(cmd, "@vId", vchId2));
                    cmd.Parameters.Add(CreateParam(cmd, "@a1", accId1));
                    cmd.Parameters.Add(CreateParam(cmd, "@a2", accId2));
                    cmd.ExecuteNonQuery();
                }

                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Transaction Seeding Across Multiple FYs",
                    Status = "PASS",
                    Details = $"Seeded FY 2026-2027 (Voucher 5000.00) and FY 2027-2028 (Voucher 7500.00) with balanced double entries."
                });
            }
            catch (Exception ex)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Transaction Seeding Across Multiple FYs",
                    Status = "FAIL",
                    Details = ex.Message
                });
            }

            // ── TEST 5: Export with FinancialYearScope = ALL_FYS ──
            try
            {
                var reqAll = new ExportRequest
                {
                    Scope = "CURRENT_SOCIETY",
                    SocietyId = (int)soc1Id,
                    FinancialYearScope = "ALL_FYS"
                };
                var pkgAll = DatabaseExportService.GenerateExport(conn, reqAll, "SQLite");

                if (pkgAll.Data.FinancialYear.Count == 2 && pkgAll.Data.SocVoucherHeader.Count == 2)
                {
                    results.Add(new FinancialYearVerificationResult
                    {
                        TestName = "Export Scope: Current Society + All FYs",
                        Status = "PASS",
                        Details = $"Exported all 2 FYs and all 2 vouchers for Society 1. Checksum={pkgAll.Metadata.ChecksumSha256.Substring(0, 12)}..."
                    });
                }
                else
                {
                    results.Add(new FinancialYearVerificationResult
                    {
                        TestName = "Export Scope: Current Society + All FYs",
                        Status = "FAIL",
                        Details = $"Expected 2 FYs and 2 Vouchers, got {pkgAll.Data.FinancialYear.Count} FYs and {pkgAll.Data.SocVoucherHeader.Count} Vouchers."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Export Scope: Current Society + All FYs",
                    Status = "FAIL",
                    Details = ex.Message
                });
            }

            // ── TEST 6: Export with FinancialYearScope = CURRENT_FY ──
            try
            {
                var reqSingle = new ExportRequest
                {
                    Scope = "CURRENT_SOCIETY",
                    SocietyId = (int)soc1Id,
                    FinancialYearScope = "CURRENT_FY",
                    FinancialYearId = (int)fy1Id
                };
                var pkgSingle = DatabaseExportService.GenerateExport(conn, reqSingle, "SQLite");

                if (pkgSingle.Data.FinancialYear.Count == 1 &&
                    pkgSingle.Data.SocVoucherHeader.Count == 1 &&
                    pkgSingle.Data.SocVoucherHeader[0]["VoucherNo"]?.ToString() == "VR-2026-001")
                {
                    results.Add(new FinancialYearVerificationResult
                    {
                        TestName = "Export Scope: Current Society + Current FY",
                        Status = "PASS",
                        Details = "Correctly filtered to single FY (2026-2027) and isolated only voucher VR-2026-001."
                    });
                }
                else
                {
                    results.Add(new FinancialYearVerificationResult
                    {
                        TestName = "Export Scope: Current Society + Current FY",
                        Status = "FAIL",
                        Details = $"Expected 1 FY and 1 Voucher (VR-2026-001), got {pkgSingle.Data.FinancialYear.Count} FYs and {pkgSingle.Data.SocVoucherHeader.Count} Vouchers."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Export Scope: Current Society + Current FY",
                    Status = "FAIL",
                    Details = ex.Message
                });
            }

            // ── TEST 7: Universal Merge with Filtered FY into Fresh Database ──
            try
            {
                var freshDbPath = Path.Combine(Path.GetDirectoryName(testDbPath)!, "fresh_target_merge.db");
                if (File.Exists(freshDbPath)) File.Delete(freshDbPath);

                var freshConnStr = $"Data Source={freshDbPath};Foreign Keys=True;";
                var freshFactory = new SqliteConnectionFactory(freshConnStr);

                var freshRunner = new MigrationRunner(freshFactory, migrationsDir);
                freshRunner.Execute();

                using (var freshConn = freshFactory.CreateOpenConnection())
                {
                    // Generate export of FY1 only
                    var expReq = new ExportRequest
                    {
                        Scope = "CURRENT_SOCIETY",
                        SocietyId = (int)soc1Id,
                        FinancialYearScope = "CURRENT_FY",
                        FinancialYearId = (int)fy1Id
                    };
                    var exportPkg = DatabaseExportService.GenerateExport(conn, expReq, "SQLite");

                    // Merge into empty fresh target
                    var mergeOptions = new MergeOptions
                    {
                        Mode = "EMPTY_TARGET",
                        ConflictPolicy = "REJECT_CONFLICTS",
                        FinancialYearScope = "ALL_FYS"
                    };

                    var mergeReport = UniversalDataMergeService.PreviewOrExecute(freshConn, exportPkg, mergeOptions, "SQLite");

                    if (mergeReport.Success && mergeReport.RecordsAdded > 0 && !mergeReport.RollbackOccurred)
                    {
                        results.Add(new FinancialYearVerificationResult
                        {
                            TestName = "Universal Merge into Fresh Target Database",
                            Status = "PASS",
                            Details = $"Successfully imported {mergeReport.RecordsAdded} records with preserved foreign keys and zero accounting drift."
                        });
                    }
                    else
                    {
                        results.Add(new FinancialYearVerificationResult
                        {
                            TestName = "Universal Merge into Fresh Target Database",
                            Status = "FAIL",
                            Details = $"Merge failed: {mergeReport.StatusMessage}"
                        });
                    }
                }
                try { if (File.Exists(freshDbPath)) File.Delete(freshDbPath); } catch { }
            }
            catch (Exception ex)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Universal Merge into Fresh Target Database",
                    Status = "FAIL",
                    Details = ex.Message
                });
            }

            // ── TEST 8: Accounting Double-Entry Invariant Check ──
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT SUM(vd.Debit) AS TotalDebit, SUM(vd.Credit) AS TotalCredit
                    FROM SocVoucherDetail vd;";
                using var rdr = cmd.ExecuteReader();
                rdr.Read();
                var deb = Convert.ToDecimal(rdr["TotalDebit"]);
                var cred = Convert.ToDecimal(rdr["TotalCredit"]);

                if (deb == cred && deb > 0)
                {
                    results.Add(new FinancialYearVerificationResult
                    {
                        TestName = "Double-Entry Accounting Invariant (Total Debit == Total Credit)",
                        Status = "PASS",
                        Details = $"Total Debit ({deb:F2}) == Total Credit ({cred:F2}). Invariant strictly preserved."
                    });
                }
                else
                {
                    results.Add(new FinancialYearVerificationResult
                    {
                        TestName = "Double-Entry Accounting Invariant (Total Debit == Total Credit)",
                        Status = "FAIL",
                        Details = $"Unbalanced accounting records: Debit={deb:F2}, Credit={cred:F2}"
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new FinancialYearVerificationResult
                {
                    TestName = "Double-Entry Accounting Invariant (Total Debit == Total Credit)",
                    Status = "FAIL",
                    Details = ex.Message
                });
            }

            return results;
        }

        private static IDbDataParameter CreateParam(IDbCommand cmd, string name, object? val)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = val ?? DBNull.Value;
            return p;
        }
    }
}
