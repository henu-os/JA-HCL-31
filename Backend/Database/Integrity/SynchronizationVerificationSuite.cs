// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — SynchronizationVerificationSuite
// Comprehensive automated verification test suite for Stage 9:
// Optional Synchronization, Idempotency, Checksums, Conflict
// Detection, Accounting Safety (Dr == Cr), and Atomic Rollback.
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using JeevikaERP.Database.Migrations;
using JeevikaERP.Database.Synchronization;

namespace JeevikaERP.Database.Integrity
{
    public class SynchronizationVerificationSuite
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

            // Step 1: Run migrations to prepare canonical V1 + V2 schema
            var runner = new MigrationRunner(factory, migrationsDir);
            var mResult = runner.Execute();
            if (!mResult.Success)
            {
                results.Add(new TestResultItem
                {
                    TestName = "Sync migrations execution",
                    Status = "FAIL",
                    Details = mResult.ErrorMessage ?? "Migration failed"
                });
                return results;
            }

            results.Add(new TestResultItem
            {
                TestName = "Sync migrations execution",
                Status = "PASS",
                Details = $"Applied {mResult.AppliedCount} migration(s): {string.Join(", ", mResult.AppliedMigrations)}"
            });

            // Step 2: Verify sync tables exist
            try
            {
                using var conn = factory.CreateOpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('SyncBatch', 'SyncChangeLog', 'SyncAuditLog');";
                using var rdr = cmd.ExecuteReader();
                var found = new List<string>();
                while (rdr.Read()) found.Add(rdr.GetString(0));

                if (found.Count == 3)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Sync schema tables existence",
                        Status = "PASS",
                        Details = "Verified SyncBatch, SyncChangeLog, and SyncAuditLog tables exist."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Sync schema tables existence",
                        Status = "FAIL",
                        Details = $"Expected 3 sync tables, found {found.Count}."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Sync schema tables existence", Status = "FAIL", Details = ex.Message });
            }

            // Step 3: Seed initial society and master data
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
                ";
                cmd.ExecuteNonQuery();
            }

            // Test 3: Sync Package Creation & Checksum
            SyncPackage package;
            try
            {
                var changes = new List<SyncChangeItem>
                {
                    new()
                    {
                        EntityType = "SocMember",
                        EntityKey = "101",
                        Action = "INSERT",
                        Data = new()
                        {
                            ["MemberId"] = 101,
                            ["SocietyId"] = 1,
                            ["MemCode"] = "101",
                            ["MemName"] = "Anil Sharma"
                        }
                    },
                    new()
                    {
                        EntityType = "SocVoucherHeader",
                        EntityKey = "VR/10",
                        Action = "INSERT",
                        Data = new()
                        {
                            ["VoucherId"] = 10,
                            ["SocietyId"] = 1,
                            ["FYId"] = 1,
                            ["VoucherType"] = "Receipt",
                            ["VoucherNo"] = "VR/10",
                            ["VoucherDate"] = "2026-06-01",
                            ["Amount"] = 2500
                        }
                    },
                    new()
                    {
                        EntityType = "SocVoucherDetail",
                        EntityKey = "10-1",
                        Action = "INSERT",
                        Data = new()
                        {
                            ["DetailId"] = 101,
                            ["VoucherId"] = 10,
                            ["SrNo"] = 1,
                            ["AccountId"] = 1,
                            ["AccountCode"] = "BNK01",
                            ["AccountName"] = "HDFC Bank",
                            ["Debit"] = 2500,
                            ["Credit"] = 0
                        }
                    },
                    new()
                    {
                        EntityType = "SocVoucherDetail",
                        EntityKey = "10-2",
                        Action = "INSERT",
                        Data = new()
                        {
                            ["DetailId"] = 102,
                            ["VoucherId"] = 10,
                            ["SrNo"] = 2,
                            ["AccountId"] = 2,
                            ["AccountCode"] = "INC01",
                            ["AccountName"] = "Maintenance Charges",
                            ["Debit"] = 0,
                            ["Credit"] = 2500
                        }
                    }
                };

                using var conn = factory.CreateOpenConnection();
                package = SynchronizationService.CreatePackage(conn, 1, 1, "NODE-DESKTOP-01", changes, "SQLite");

                if (!string.IsNullOrEmpty(package.ChecksumSha256) && package.Changes.Count == 4)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Sync package creation & checksum",
                        Status = "PASS",
                        Details = $"Package created with BatchId={package.BatchId.Substring(0, 8)}..., SHA256={package.ChecksumSha256.Substring(0, 16)}..."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Sync package creation & checksum",
                        Status = "FAIL",
                        Details = "Failed to generate valid checksum or changes count."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Sync package creation & checksum", Status = "FAIL", Details = ex.Message });
                return results;
            }

            // Test 4: Package Preview & Validation (Valid Package)
            try
            {
                using var conn = factory.CreateOpenConnection();
                var preview = SynchronizationService.PreviewAndValidate(conn, package, "SQLite");

                if (preview.IsValid && preview.TotalChanges == 4 && preview.Conflicts.Count == 0)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Sync package preview & validation",
                        Status = "PASS",
                        Details = $"Validated 4 changes (4 inserts, 0 updates, 0 conflicts)."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Sync package preview & validation",
                        Status = "FAIL",
                        Details = string.Join("; ", preview.ValidationErrors)
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Sync package preview & validation", Status = "FAIL", Details = ex.Message });
            }

            // Test 5: Rejection of Corrupt Package / Checksum Mismatch
            try
            {
                var corrupted = JsonSerializer.Deserialize<SyncPackage>(JsonSerializer.Serialize(package))!;
                corrupted.ChecksumSha256 = "corrupted_tampered_checksum_987654";

                using var conn = factory.CreateOpenConnection();
                var preview = SynchronizationService.PreviewAndValidate(conn, corrupted, "SQLite");

                if (!preview.IsValid && preview.ValidationErrors.Any(e => e.Contains("Checksum verification failed")))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Corrupt sync package rejection",
                        Status = "PASS",
                        Details = "Successfully rejected package with tampered checksum."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Corrupt sync package rejection",
                        Status = "FAIL",
                        Details = "Did not reject corrupted package checksum."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Corrupt sync package rejection", Status = "FAIL", Details = ex.Message });
            }

            // Test 6: Rejection of Unbalanced Accounting Entry (Dr != Cr)
            try
            {
                var unbPackage = JsonSerializer.Deserialize<SyncPackage>(JsonSerializer.Serialize(package))!;
                unbPackage.BatchId = Guid.NewGuid().ToString("N");
                // Modify voucher line debit to create unbalance (2500 vs 1500)
                unbPackage.Changes[2].Data["Debit"] = 1500;
                // Recompute valid checksum so the accounting validation is specifically tested
                unbPackage.ChecksumSha256 = SynchronizationService.ComputeSha256(JsonSerializer.Serialize(unbPackage.Changes));

                using var conn = factory.CreateOpenConnection();
                var preview = SynchronizationService.PreviewAndValidate(conn, unbPackage, "SQLite");

                if (!preview.IsValid && preview.Conflicts.Any(c => c.IsUnsafeAccountingConflict))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Unbalanced accounting change rejection",
                        Status = "PASS",
                        Details = "Successfully caught and rejected unbalanced voucher modification."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Unbalanced accounting change rejection",
                        Status = "FAIL",
                        Details = "Failed to reject unbalanced voucher change."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Unbalanced accounting change rejection", Status = "FAIL", Details = ex.Message });
            }

            // Test 7: Society Isolation / Invalid Target Society Rejection
            try
            {
                var invalidSocPackage = JsonSerializer.Deserialize<SyncPackage>(JsonSerializer.Serialize(package))!;
                invalidSocPackage.BatchId = Guid.NewGuid().ToString("N");
                invalidSocPackage.SocietyId = 99999; // Non-existent
                invalidSocPackage.ChecksumSha256 = SynchronizationService.ComputeSha256(JsonSerializer.Serialize(invalidSocPackage.Changes));

                using var conn = factory.CreateOpenConnection();
                var preview = SynchronizationService.PreviewAndValidate(conn, invalidSocPackage, "SQLite");

                if (!preview.IsValid && preview.ValidationErrors.Any(e => e.Contains("does not exist")))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Invalid SocietyId rejection",
                        Status = "PASS",
                        Details = "Rejected package referencing non-existent SocietyId=99999."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Invalid SocietyId rejection",
                        Status = "FAIL",
                        Details = "Failed to reject invalid society reference."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Invalid SocietyId rejection", Status = "FAIL", Details = ex.Message });
            }

            // Test 8: Transactional Apply & Persistence
            try
            {
                using var conn = factory.CreateOpenConnection();
                var applyResult = SynchronizationService.ApplySyncPackage(conn, package, "TestRunner", "SQLite");

                if (applyResult.Success && applyResult.AppliedCount == 4)
                {
                    // Verify data persisted
                    using var chkCmd = conn.CreateCommand();
                    chkCmd.CommandText = "SELECT COUNT(*) FROM SocMember WHERE MemberId = 101;";
                    var memCnt = Convert.ToInt32(chkCmd.ExecuteScalar());

                    chkCmd.CommandText = "SELECT Status FROM SyncBatch WHERE BatchId = @bId;";
                    var p = chkCmd.CreateParameter();
                    p.ParameterName = "@bId";
                    p.Value = package.BatchId;
                    chkCmd.Parameters.Add(p);
                    var bStatus = chkCmd.ExecuteScalar()?.ToString();

                    if (memCnt == 1 && bStatus == "Applied")
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Transactional sync apply & persistence",
                            Status = "PASS",
                            Details = $"Successfully applied 4 changes; verified member record and Batch status='{bStatus}'."
                        });
                    }
                    else
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Transactional sync apply & persistence",
                            Status = "FAIL",
                            Details = $"Record verification failed: memCnt={memCnt}, bStatus={bStatus}"
                        });
                    }
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Transactional sync apply & persistence",
                        Status = "FAIL",
                        Details = string.Join("; ", applyResult.Errors)
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Transactional sync apply & persistence", Status = "FAIL", Details = ex.Message });
            }

            // Test 9: Duplicate Batch Rejection (Idempotency Protection)
            try
            {
                using var conn = factory.CreateOpenConnection();
                var preview = SynchronizationService.PreviewAndValidate(conn, package, "SQLite");

                if (!preview.IsValid && preview.ValidationErrors.Any(e => e.Contains("Duplicate batch")))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Duplicate batch idempotency rejection",
                        Status = "PASS",
                        Details = "Successfully prevented re-application of already applied BatchId."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Duplicate batch idempotency rejection",
                        Status = "FAIL",
                        Details = "Failed to reject duplicate applied batch."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Duplicate batch idempotency rejection", Status = "FAIL", Details = ex.Message });
            }

            // Test 10: Atomic Rollback on Constraint Violation (Zero Partial Writes)
            try
            {
                var failPackage = new SyncPackage
                {
                    BatchId = Guid.NewGuid().ToString("N"),
                    SocietyId = 1,
                    Changes = new()
                    {
                        new()
                        {
                            EntityType = "SocMember",
                            EntityKey = "202",
                            Action = "INSERT",
                            Data = new()
                            {
                                ["MemberId"] = 202,
                                ["SocietyId"] = 1,
                                ["MemCode"] = "202",
                                ["MemName"] = "Valid Member"
                            }
                        },
                        new()
                        {
                            EntityType = "SocAccount",
                            EntityKey = "999",
                            Action = "INSERT",
                            Data = new()
                            {
                                ["AccountId"] = 999,
                                ["SocietyId"] = 99999, // Non-existent SocietyId FK violation
                                ["AccCode"] = "INV99",
                                ["AccName"] = "Invalid Account"
                            }
                        }
                    }
                };
                failPackage.ChecksumSha256 = SynchronizationService.ComputeSha256(JsonSerializer.Serialize(failPackage.Changes));

                using var conn = factory.CreateOpenConnection();
                var applyResult = SynchronizationService.ApplySyncPackage(conn, failPackage, "TestRunner", "SQLite");

                if (!applyResult.Success)
                {
                    // Check that MemberId=202 was rolled back and NOT persisted
                    using var chkCmd = conn.CreateCommand();
                    chkCmd.CommandText = "SELECT COUNT(*) FROM SocMember WHERE MemberId = 202;";
                    var cnt = Convert.ToInt32(chkCmd.ExecuteScalar());

                    if (cnt == 0)
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Atomic rollback on constraint failure",
                            Status = "PASS",
                            Details = "Entire batch rolled back on error; zero partial writes committed."
                        });
                    }
                    else
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Atomic rollback on constraint failure",
                            Status = "FAIL",
                            Details = "Partial write detected after rollback (MemberId=202 found in database)."
                        });
                    }
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Atomic rollback on constraint failure",
                        Status = "FAIL",
                        Details = "Expected batch apply to fail but it succeeded."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Atomic rollback on constraint failure", Status = "FAIL", Details = ex.Message });
            }

            // Test 11: Audit Log Generation
            try
            {
                using var conn = factory.CreateOpenConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT COUNT(*) FROM SyncAuditLog WHERE Action = 'SYNC_APPLY' AND Status = 'SUCCESS';";
                var auditCount = Convert.ToInt32(cmd.ExecuteScalar());

                if (auditCount >= 1)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Sync audit log verification",
                        Status = "PASS",
                        Details = $"Verified {auditCount} successful sync audit log entry(ies) recorded."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Sync audit log verification",
                        Status = "FAIL",
                        Details = "No audit log entry found."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Sync audit log verification", Status = "FAIL", Details = ex.Message });
            }

            return results;
        }
    }
}
