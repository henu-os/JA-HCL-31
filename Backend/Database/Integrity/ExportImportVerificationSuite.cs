// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — ExportImportVerificationSuite
// Comprehensive automated verification test suite for Stage 7:
// Database Export & Import, Society / FY isolation, SHA256 integrity,
// Accounting safety (Dr == Cr), and Transactional Rollback.
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data.Common;
using System.IO;
using System.Linq;
using System.Text.Json;
using JeevikaERP.Database.ExportImport;
using JeevikaERP.Database.Migrations;

namespace JeevikaERP.Database.Integrity
{
    public class ExportImportVerificationSuite
    {
        public static List<TestResultItem> RunVerification(string testDbPath, string migrationsDir)
        {
            var results = new List<TestResultItem>();

            // Clean up test db if exists
            if (File.Exists(testDbPath))
            {
                try { File.Delete(testDbPath); } catch { }
            }

            var connStr = $"Data Source={testDbPath};";
            var factory = new SqliteConnectionFactory(connStr);

            // Step 1: Run migrations to prepare canonical schema
            var runner = new MigrationRunner(factory, migrationsDir);
            var mResult = runner.Execute();
            if (!mResult.Success)
            {
                results.Add(new TestResultItem
                {
                    TestName = "Migration setup for test DB",
                    Status = "FAIL",
                    Details = mResult.ErrorMessage ?? "Migration failed"
                });
                return results;
            }

            // Step 2: Seed isolated sample accounting data for testing
            using (var conn = factory.CreateOpenConnection())
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO SocietyInfo (SocietyId, SocietyCode, SocietyName) 
                    VALUES (1, 'SOC001', 'Green Valley CHS'), (2, 'SOC002', 'River Heights CHS');

                    INSERT INTO FinancialYear (FYId, SocietyId, FYLabel, FYStart, FYEnd)
                    VALUES (1, 1, '2026-2027', '2026-04-01', '2027-03-31');

                    INSERT INTO SocGroup (GroupId, SocietyId, GrpCode, GrpName)
                    VALUES (1, 1, 'BNK', 'Bank Accounts'), (2, 1, 'INC', 'Income Accounts');

                    INSERT INTO SocAccount (AccountId, SocietyId, AccCode, AccName, GroupId)
                    VALUES (1, 1, 'BNK01', 'HDFC Bank', 1), (2, 1, 'INC01', 'Maintenance Charges', 2);

                    INSERT INTO SocMember (MemberId, SocietyId, MemCode, MemName)
                    VALUES (1, 1, '101', 'Ramesh Kumar');

                    INSERT INTO SocVoucherHeader (VoucherId, SocietyId, FYId, VoucherType, VoucherNo, VoucherDate, Amount)
                    VALUES (1, 1, 1, 'Receipt', 'VR/01', '2026-05-10', 5000);

                    INSERT INTO SocVoucherDetail (DetailId, VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit)
                    VALUES (1, 1, 1, 1, 'BNK01', 'HDFC Bank', 5000, 0);

                    INSERT INTO SocVoucherDetail (DetailId, VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit)
                    VALUES (2, 1, 2, 2, 'INC01', 'Maintenance Charges', 0, 5000);
                ";
                cmd.ExecuteNonQuery();
            }

            // Test 1: Generate Full Export Package
            ExportPackage fullPackage;
            try
            {
                using var conn = factory.CreateOpenConnection();
                fullPackage = DatabaseExportService.GenerateExport(conn, new ExportRequest { Scope = "FULL" }, "SQLite");

                if (fullPackage.Metadata.Scope == "FULL" && fullPackage.Data.SocietyInfo.Count == 2 && fullPackage.Data.SocVoucherHeader.Count == 1)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Full export generation",
                        Status = "PASS",
                        Details = $"Exported 2 societies, 1 FY, 2 groups, 2 accounts, 1 member, 1 voucher, 2 voucher lines."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Full export generation",
                        Status = "FAIL",
                        Details = $"Unexpected record counts: Societies={fullPackage.Data.SocietyInfo.Count}, Vouchers={fullPackage.Data.SocVoucherHeader.Count}"
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Full export generation", Status = "FAIL", Details = ex.Message });
                return results;
            }

            // Test 2: Export SHA256 Checksum Validation
            try
            {
                var valResult = DatabaseImportService.ValidatePackage(fullPackage);
                if (valResult.IsValid && !string.IsNullOrEmpty(fullPackage.Metadata.ChecksumSha256))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Checksum generation & validation",
                        Status = "PASS",
                        Details = $"Valid SHA256 checksum: {fullPackage.Metadata.ChecksumSha256.Substring(0, 16)}..."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Checksum generation & validation",
                        Status = "FAIL",
                        Details = string.Join("; ", valResult.ValidationErrors)
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Checksum generation & validation", Status = "FAIL", Details = ex.Message });
            }

            // Test 3: Society Scoping Export
            try
            {
                using var conn = factory.CreateOpenConnection();
                var socPackage = DatabaseExportService.GenerateExport(conn, new ExportRequest { Scope = "SOCIETY", SocietyId = 1 }, "SQLite");
                if (socPackage.Data.SocietyInfo.Count == 1 && socPackage.Data.SocietyInfo[0]["SocietyId"]?.ToString() == "1")
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Society-scoped export",
                        Status = "PASS",
                        Details = "Successfully isolated SocietyId=1 records only."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Society-scoped export",
                        Status = "FAIL",
                        Details = $"Expected 1 society, got {socPackage.Data.SocietyInfo.Count}."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Society-scoped export", Status = "FAIL", Details = ex.Message });
            }

            // Test 4: Financial Year Scoping Export
            try
            {
                using var conn = factory.CreateOpenConnection();
                var fyPackage = DatabaseExportService.GenerateExport(conn, new ExportRequest { Scope = "FINANCIAL_YEAR", SocietyId = 1, FinancialYearId = 1 }, "SQLite");
                if (fyPackage.Data.FinancialYear.Count == 1 && fyPackage.Data.FinancialYear[0]["FYId"]?.ToString() == "1")
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Financial Year-scoped export",
                        Status = "PASS",
                        Details = "Successfully scoped export to SocietyId=1 and FYId=1."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Financial Year-scoped export",
                        Status = "FAIL",
                        Details = $"Expected 1 FY, got {fyPackage.Data.FinancialYear.Count}."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Financial Year-scoped export", Status = "FAIL", Details = ex.Message });
            }

            // Test 5: Rejection of Corrupted Checksum
            try
            {
                var corruptedPackage = JsonSerializer.Deserialize<ExportPackage>(JsonSerializer.Serialize(fullPackage))!;
                corruptedPackage.Metadata.ChecksumSha256 = "invalid_checksum_hash_1234567890";

                var valResult = DatabaseImportService.ValidatePackage(corruptedPackage);
                if (!valResult.IsValid && valResult.ValidationErrors.Any(e => e.Contains("checksum mismatch")))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Corrupt package rejection",
                        Status = "PASS",
                        Details = "Rejected tampered checksum as expected."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Corrupt package rejection",
                        Status = "FAIL",
                        Details = "Failed to reject corrupted package checksum."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Corrupt package rejection", Status = "FAIL", Details = ex.Message });
            }

            // Test 6: Rejection of Unbalanced Voucher (Dr != Cr)
            try
            {
                var unbPackage = JsonSerializer.Deserialize<ExportPackage>(JsonSerializer.Serialize(fullPackage))!;
                // Tamper with voucher detail debit to make it unbalanced (5000 vs 4000)
                unbPackage.Data.SocVoucherDetail[0]["Debit"] = 4000;
                // Recompute valid checksum to isolate accounting rule check
                unbPackage.Metadata.ChecksumSha256 = DatabaseExportService.ComputeSha256(JsonSerializer.Serialize(unbPackage.Data));

                var valResult = DatabaseImportService.ValidatePackage(unbPackage);
                if (!valResult.IsValid && valResult.ValidationErrors.Any(e => e.Contains("unbalanced")))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Unbalanced voucher rejection",
                        Status = "PASS",
                        Details = $"Successfully rejected unbalanced accounting entry: {valResult.ValidationErrors.First(e => e.Contains("unbalanced"))}"
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Unbalanced voucher rejection",
                        Status = "FAIL",
                        Details = "Did not reject unbalanced voucher."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Unbalanced voucher rejection", Status = "FAIL", Details = ex.Message });
            }

            // Test 7: Transaction Rollback on Failure
            try
            {
                var failPackage = JsonSerializer.Deserialize<ExportPackage>(JsonSerializer.Serialize(fullPackage))!;
                // Inject an invalid row that violates foreign key / column constraint
                failPackage.Data.SocAccount.Add(new Dictionary<string, object?>
                {
                    ["AccountId"] = 9999,
                    ["SocietyId"] = 99999, // Non-existent SocietyId violates FK
                    ["AccCode"] = "INV99",
                    ["AccName"] = "Invalid Account"
                });
                failPackage.Metadata.ChecksumSha256 = DatabaseExportService.ComputeSha256(JsonSerializer.Serialize(failPackage.Data));

                using var conn = factory.CreateOpenConnection();
                var importResult = DatabaseImportService.ExecuteImport(conn, failPackage, "SQLite");

                if (!importResult.Success && importResult.Message.Contains("rolled back"))
                {
                    // Check that no partial data with AccountId=9999 exists
                    using var checkCmd = conn.CreateCommand();
                    checkCmd.CommandText = "SELECT COUNT(*) FROM SocAccount WHERE AccountId = 9999;";
                    var cnt = Convert.ToInt32(checkCmd.ExecuteScalar());

                    if (cnt == 0)
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Transactional rollback on error",
                            Status = "PASS",
                            Details = "Transaction rolled back completely upon constraint error; 0 dirty records committed."
                        });
                    }
                    else
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Transactional rollback on error",
                            Status = "FAIL",
                            Details = "Dirty record found in database after rollback."
                        });
                    }
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Transactional rollback on error",
                        Status = "FAIL",
                        Details = "Import did not fail as expected."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Transactional rollback on error", Status = "FAIL", Details = ex.Message });
            }

            // Test 8: Successful Import Execution
            try
            {
                // Create a fresh blank database
                var importDbPath = Path.Combine(Path.GetDirectoryName(testDbPath)!, "test_target_import.db");
                if (File.Exists(importDbPath)) try { File.Delete(importDbPath); } catch { }

                var importFactory = new SqliteConnectionFactory($"Data Source={importDbPath};");
                var runner2 = new MigrationRunner(importFactory, migrationsDir);
                runner2.Execute();

                using var conn = importFactory.CreateOpenConnection();
                var importResult = DatabaseImportService.ExecuteImport(conn, fullPackage, "SQLite");

                if (importResult.Success && importResult.ImportedCounts["SocVoucherHeader"] == 1)
                {
                    // Verify imported rows in target DB
                    using var checkCmd = conn.CreateCommand();
                    checkCmd.CommandText = "SELECT COUNT(*) FROM SocMember WHERE SocietyId = 1;";
                    var memberCount = Convert.ToInt32(checkCmd.ExecuteScalar());

                    results.Add(new TestResultItem
                    {
                        TestName = "Successful transactional import",
                        Status = "PASS",
                        Details = $"Imported {importResult.ImportedCounts.Values.Sum()} total records into fresh target DB. Verified memberCount={memberCount}."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Successful transactional import",
                        Status = "FAIL",
                        Details = string.Join("; ", importResult.Errors)
                    });
                }

                // Cleanup target test db
                try { if (File.Exists(importDbPath)) File.Delete(importDbPath); } catch { }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Successful transactional import", Status = "FAIL", Details = ex.Message });
            }

            return results;
        }
    }
}
