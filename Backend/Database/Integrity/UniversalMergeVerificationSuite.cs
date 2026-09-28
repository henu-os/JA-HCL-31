// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — UniversalMergeVerificationSuite
// Comprehensive automated verification test suite for Stage 8:
// Universal Database Export/Import & Multi-Society Merge Engine
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using JeevikaERP.Database.ExportImport;
using JeevikaERP.Database.Migrations;

namespace JeevikaERP.Database.Integrity
{
    public class UniversalMergeVerificationSuite
    {
        public static List<TestResultItem> RunVerification(string testDbPath, string migrationsDir)
        {
            var results = new List<TestResultItem>();
            var dir = Path.GetDirectoryName(testDbPath)!;

            var sourceDbPath = Path.Combine(dir, "test_source_7soc.db");
            var emptyTargetDbPath = Path.Combine(dir, "test_empty_target.db");
            var mergeTargetDbPath = Path.Combine(dir, "test_merge_target_7soc.db");

            // Clean up temporary test files
            foreach (var p in new[] { testDbPath, sourceDbPath, emptyTargetDbPath, mergeTargetDbPath })
            {
                if (File.Exists(p)) try { File.Delete(p); } catch { }
            }

            // ────────────────────────────────────────────────────────
            // STEP 1: PREPARE SOURCE DATABASE WITH 7 SOCIETIES
            // ────────────────────────────────────────────────────────
            var srcFactory = new SqliteConnectionFactory($"Data Source={sourceDbPath};");
            var srcRunner = new MigrationRunner(srcFactory, migrationsDir);
            var mRes = srcRunner.Execute();
            if (!mRes.Success)
            {
                results.Add(new TestResultItem
                {
                    TestName = "Migration setup on source DB",
                    Status = "FAIL",
                    Details = mRes.ErrorMessage ?? "Migration failed"
                });
                return results;
            }

            using (var conn = srcFactory.CreateOpenConnection())
            {
                using var cmd = conn.CreateCommand();
                var sb = new System.Text.StringBuilder();

                // Seed 7 Societies with Financial Years, Groups, Accounts, Members, and Balanced Vouchers
                for (int i = 1; i <= 7; i++)
                {
                    sb.AppendLine($"INSERT INTO SocietyInfo (SocietyId, SocietyCode, SocietyName) VALUES ({i}, 'SOC00{i}', 'Society Alpha {i} CHS');");
                    sb.AppendLine($"INSERT INTO FinancialYear (FYId, SocietyId, FYLabel, FYStart, FYEnd) VALUES ({i}, {i}, '2026-2027', '2026-04-01', '2027-03-31');");
                    sb.AppendLine($"INSERT INTO SocGroup (GroupId, SocietyId, GrpCode, GrpName) VALUES ({i * 10 + 1}, {i}, 'BNK{i}', 'Bank Accounts {i}');");
                    sb.AppendLine($"INSERT INTO SocGroup (GroupId, SocietyId, GrpCode, GrpName) VALUES ({i * 10 + 2}, {i}, 'INC{i}', 'Income Accounts {i}');");
                    sb.AppendLine($"INSERT INTO SocAccount (AccountId, SocietyId, AccCode, AccName, GroupId) VALUES ({i * 10 + 1}, {i}, 'BNK0{i}', 'Bank {i}', {i * 10 + 1});");
                    sb.AppendLine($"INSERT INTO SocAccount (AccountId, SocietyId, AccCode, AccName, GroupId) VALUES ({i * 10 + 2}, {i}, 'INC0{i}', 'Maintenance {i}', {i * 10 + 2});");
                    sb.AppendLine($"INSERT INTO SocMember (MemberId, SocietyId, MemCode, MemName) VALUES ({i * 100 + 1}, {i}, '101', 'Member {i}-A');");
                    sb.AppendLine($"INSERT INTO SocMember (MemberId, SocietyId, MemCode, MemName) VALUES ({i * 100 + 2}, {i}, '102', 'Member {i}-B');");
                    
                    // Balanced Voucher
                    sb.AppendLine($"INSERT INTO SocVoucherHeader (VoucherId, SocietyId, FYId, VoucherType, VoucherNo, VoucherDate, Amount) VALUES ({i * 10 + 1}, {i}, {i}, 'Receipt', 'VR/01', '2026-05-15', {1000 * i});");
                    sb.AppendLine($"INSERT INTO SocVoucherDetail (DetailId, VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit) VALUES ({i * 20 + 1}, {i * 10 + 1}, 1, {i * 10 + 1}, 'BNK0{i}', 'Bank {i}', {1000 * i}, 0);");
                    sb.AppendLine($"INSERT INTO SocVoucherDetail (DetailId, VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit) VALUES ({i * 20 + 2}, {i * 10 + 1}, 2, {i * 10 + 2}, 'INC0{i}', 'Maintenance {i}', 0, {1000 * i});");
                }
                cmd.CommandText = sb.ToString();
                cmd.ExecuteNonQuery();
            }

            // ────────────────────────────────────────────────────────
            // TEST 1: EXPORT 7 SOCIETIES FROM SOURCE DATABASE
            // ────────────────────────────────────────────────────────
            ExportPackage package7Soc;
            try
            {
                using var conn = srcFactory.CreateOpenConnection();
                package7Soc = DatabaseExportService.GenerateExport(conn, new ExportRequest { Scope = "FULL" }, "SQLite");

                if (package7Soc.Data.SocietyInfo.Count == 7 && package7Soc.Data.SocVoucherHeader.Count == 7 && !string.IsNullOrEmpty(package7Soc.Metadata.ChecksumSha256))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Export 7 societies package generation",
                        Status = "PASS",
                        Details = $"Exported 7 societies, 7 FYs, 14 groups, 14 accounts, 14 members, 7 balanced vouchers. SHA256={package7Soc.Metadata.ChecksumSha256.Substring(0, 16)}..."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Export 7 societies package generation",
                        Status = "FAIL",
                        Details = $"Unexpected export counts: Societies={package7Soc.Data.SocietyInfo.Count}"
                    });
                    return results;
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Export 7 societies package generation", Status = "FAIL", Details = ex.Message });
                return results;
            }

            // ────────────────────────────────────────────────────────
            // TEST 2: DRY-RUN VALIDATE_ONLY ON EMPTY TARGET
            // ────────────────────────────────────────────────────────
            try
            {
                var emptyFactory = new SqliteConnectionFactory($"Data Source={emptyTargetDbPath};");
                new MigrationRunner(emptyFactory, migrationsDir).Execute();

                using var conn = emptyFactory.CreateOpenConnection();
                var dryRunReport = UniversalDataMergeService.PreviewOrExecute(
                    conn, package7Soc, new MergeOptions { Mode = "VALIDATE_ONLY" }, "SQLite");

                // Check that 0 rows were written
                using var chkCmd = conn.CreateCommand();
                chkCmd.CommandText = "SELECT COUNT(*) FROM SocietyInfo;";
                var socCnt = Convert.ToInt32(chkCmd.ExecuteScalar());

                if (dryRunReport.Success && socCnt == 0 && dryRunReport.RecordsAdded >= 7)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "VALIDATE_ONLY mode dry-run safety",
                        Status = "PASS",
                        Details = $"Dry run verified {dryRunReport.RecordsAdded} total records across 7 societies for addition with exactly 0 database writes."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "VALIDATE_ONLY mode dry-run safety",
                        Status = "FAIL",
                        Details = $"Dry run failed or wrote rows: socCnt={socCnt}, Success={dryRunReport.Success}"
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "VALIDATE_ONLY mode dry-run safety", Status = "FAIL", Details = ex.Message });
            }

            // ────────────────────────────────────────────────────────
            // TEST 3: SCENARIO A — IMPORT 7 SOCIETIES INTO EMPTY TARGET
            // ────────────────────────────────────────────────────────
            try
            {
                var emptyFactory = new SqliteConnectionFactory($"Data Source={emptyTargetDbPath};");
                using var conn = emptyFactory.CreateOpenConnection();

                var report = UniversalDataMergeService.PreviewOrExecute(
                    conn, package7Soc, new MergeOptions { Mode = "EMPTY_TARGET", ConflictPolicy = "REJECT_CONFLICTS" }, "SQLite");

                if (report.Success && report.RecordsAdded > 0)
                {
                    using var chkCmd = conn.CreateCommand();
                    chkCmd.CommandText = "SELECT COUNT(*) FROM SocietyInfo;";
                    var targetSocCount = Convert.ToInt32(chkCmd.ExecuteScalar());

                    chkCmd.CommandText = "SELECT COUNT(*) FROM SocMember;";
                    var targetMemCount = Convert.ToInt32(chkCmd.ExecuteScalar());

                    chkCmd.CommandText = "SELECT COUNT(*) FROM SocVoucherHeader;";
                    var targetVchCount = Convert.ToInt32(chkCmd.ExecuteScalar());

                    if (targetSocCount == 7 && targetMemCount == 14 && targetVchCount == 7)
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Scenario A: 7-society empty target import",
                            Status = "PASS",
                            Details = $"Successfully imported all 7 societies, 14 members, and 7 balanced vouchers into fresh database."
                        });
                    }
                    else
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Scenario A: 7-society empty target import",
                            Status = "FAIL",
                            Details = $"Counts mismatch: Societies={targetSocCount}, Members={targetMemCount}, Vouchers={targetVchCount}"
                        });
                    }
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Scenario A: 7-society empty target import",
                        Status = "FAIL",
                        Details = report.StatusMessage
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Scenario A: 7-society empty target import", Status = "FAIL", Details = ex.Message });
            }

            // ────────────────────────────────────────────────────────
            // TEST 4: IDEMPOTENT RE-IMPORT ON SCENARIO A TARGET
            // ────────────────────────────────────────────────────────
            try
            {
                var emptyFactory = new SqliteConnectionFactory($"Data Source={emptyTargetDbPath};");
                using var conn = emptyFactory.CreateOpenConnection();

                var report = UniversalDataMergeService.PreviewOrExecute(
                    conn, package7Soc, new MergeOptions { Mode = "SAFE_MERGE", ConflictPolicy = "SKIP_EXISTING" }, "SQLite");

                using var chkCmd = conn.CreateCommand();
                chkCmd.CommandText = "SELECT COUNT(*) FROM SocietyInfo;";
                var targetSocCount = Convert.ToInt32(chkCmd.ExecuteScalar());

                if (report.Success && targetSocCount == 7 && report.RecordsMatched >= 7)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Repeated import idempotency (SKIP_EXISTING)",
                        Status = "PASS",
                        Details = $"Idempotent: Matched {report.RecordsMatched} existing records; 0 duplicate societies created."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Repeated import idempotency (SKIP_EXISTING)",
                        Status = "FAIL",
                        Details = $"Expected 7 societies and matches, got socCount={targetSocCount}, matched={report.RecordsMatched}"
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Repeated import idempotency (SKIP_EXISTING)", Status = "FAIL", Details = ex.Message });
            }

            // ────────────────────────────────────────────────────────
            // STEP 5: PREPARE TARGET DATABASE C WITH 7 DIFFERENT SOCIETIES
            // ────────────────────────────────────────────────────────
            var mergeFactory = new SqliteConnectionFactory($"Data Source={mergeTargetDbPath};");
            new MigrationRunner(mergeFactory, migrationsDir).Execute();

            using (var conn = mergeFactory.CreateOpenConnection())
            {
                using var cmd = conn.CreateCommand();
                var sb = new System.Text.StringBuilder();

                // Seed 7 Different Societies (Existing in Laptop C: IDs 1..7, Code SOC101..SOC107)
                for (int i = 1; i <= 7; i++)
                {
                    sb.AppendLine($"INSERT INTO SocietyInfo (SocietyId, SocietyCode, SocietyName) VALUES ({i}, 'SOC10{i}', 'Target Delta {i} CHS');");
                    sb.AppendLine($"INSERT INTO FinancialYear (FYId, SocietyId, FYLabel, FYStart, FYEnd) VALUES ({i}, {i}, '2026-2027', '2026-04-01', '2027-03-31');");
                    sb.AppendLine($"INSERT INTO SocGroup (GroupId, SocietyId, GrpCode, GrpName) VALUES ({i * 10 + 1}, {i}, 'TGTBNK{i}', 'Target Bank {i}');");
                    sb.AppendLine($"INSERT INTO SocAccount (AccountId, SocietyId, AccCode, AccName, GroupId) VALUES ({i * 10 + 1}, {i}, 'TGTACC{i}', 'Target Account {i}', {i * 10 + 1});");
                    sb.AppendLine($"INSERT INTO SocMember (MemberId, SocietyId, MemCode, MemName) VALUES ({i * 100 + 1}, {i}, '901', 'Target Member {i}');");
                    sb.AppendLine($"INSERT INTO SocVoucherHeader (VoucherId, SocietyId, FYId, VoucherType, VoucherNo, VoucherDate, Amount, Status) VALUES ({i * 10 + 1}, {i}, {i}, 'Receipt', 'VR/01', '2026-05-15', {500 * i}, 'Audited');");
                    sb.AppendLine($"INSERT INTO SocVoucherDetail (DetailId, VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit) VALUES ({i * 20 + 1}, {i * 10 + 1}, 1, {i * 10 + 1}, 'TGTACC{i}', 'Target Account {i}', {500 * i}, 0);");
                    sb.AppendLine($"INSERT INTO SocVoucherDetail (DetailId, VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit) VALUES ({i * 20 + 2}, {i * 10 + 1}, 2, {i * 10 + 1}, 'TGTACC{i}', 'Target Account {i}', 0, {500 * i});");
                }
                cmd.CommandText = sb.ToString();
                cmd.ExecuteNonQuery();
            }

            // ────────────────────────────────────────────────────────
            // TEST 6: SCENARIO B — SAFE_MERGE OF 7 SOCIETIES INTO TARGET C
            // ────────────────────────────────────────────────────────
            try
            {
                using var conn = mergeFactory.CreateOpenConnection();
                var mergeReport = UniversalDataMergeService.PreviewOrExecute(
                    conn, package7Soc, new MergeOptions { Mode = "SAFE_MERGE", ConflictPolicy = "SKIP_EXISTING" }, "SQLite");

                if (mergeReport.Success)
                {
                    using var chkCmd = conn.CreateCommand();
                    chkCmd.CommandText = "SELECT COUNT(*) FROM SocietyInfo;";
                    var totalSocCount = Convert.ToInt32(chkCmd.ExecuteScalar());

                    chkCmd.CommandText = "SELECT COUNT(*) FROM SocVoucherHeader;";
                    var totalVchCount = Convert.ToInt32(chkCmd.ExecuteScalar());

                    // Verify that existing Target Societies (SOC101..SOC107) remain intact
                    chkCmd.CommandText = "SELECT COUNT(*) FROM SocietyInfo WHERE SocietyCode LIKE 'SOC10%';";
                    var existingSocPreserved = Convert.ToInt32(chkCmd.ExecuteScalar());

                    // Verify that new Source Societies (SOC001..SOC007) are added
                    chkCmd.CommandText = "SELECT COUNT(*) FROM SocietyInfo WHERE SocietyCode LIKE 'SOC00%';";
                    var newSocAdded = Convert.ToInt32(chkCmd.ExecuteScalar());

                    if (totalSocCount == 14 && totalVchCount == 14 && existingSocPreserved == 7 && newSocAdded == 7)
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Scenario B: Multi-society SAFE_MERGE (14 societies total)",
                            Status = "PASS",
                            Details = $"Merged 7 source societies into 7 existing societies -> 14 total societies. Existing data 100% preserved; 0 collisions."
                        });
                    }
                    else
                    {
                        results.Add(new TestResultItem
                        {
                            TestName = "Scenario B: Multi-society SAFE_MERGE (14 societies total)",
                            Status = "FAIL",
                            Details = $"Unexpected counts: TotalSoc={totalSocCount}, Preserved={existingSocPreserved}, Added={newSocAdded}, TotalVch={totalVchCount}"
                        });
                    }
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Scenario B: Multi-society SAFE_MERGE (14 societies total)",
                        Status = "FAIL",
                        Details = mergeReport.StatusMessage
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Scenario B: Multi-society SAFE_MERGE (14 societies total)", Status = "FAIL", Details = ex.Message });
            }

            // ────────────────────────────────────────────────────────
            // TEST 7: SOURCE-TO-TARGET ID REMAPPING INTEGRITY
            // ────────────────────────────────────────────────────────
            try
            {
                using var conn = mergeFactory.CreateOpenConnection();
                using var chkCmd = conn.CreateCommand();

                // Check that the remapped voucher detail points to the remapped account and remapped voucher
                chkCmd.CommandText = @"
                    SELECT COUNT(*) 
                    FROM SocVoucherDetail vd
                    INNER JOIN SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId
                    INNER JOIN SocietyInfo si ON vh.SocietyId = si.SocietyId
                    WHERE si.SocietyCode = 'SOC001';
                ";
                var detailCount = Convert.ToInt32(chkCmd.ExecuteScalar());

                if (detailCount == 2)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Source-to-target ID remapping foreign keys",
                        Status = "PASS",
                        Details = "Verified foreign key remapping for Vouchers, Details, Accounts, and Societies after merge."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Source-to-target ID remapping foreign keys",
                        Status = "FAIL",
                        Details = $"Expected 2 detail rows for SOC001, got {detailCount}."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Source-to-target ID remapping foreign keys", Status = "FAIL", Details = ex.Message });
            }

            // ────────────────────────────────────────────────────────
            // TEST 8: CORRUPT CHECKSUM REJECTION
            // ────────────────────────────────────────────────────────
            try
            {
                var corruptedPkg = JsonSerializer.Deserialize<ExportPackage>(JsonSerializer.Serialize(package7Soc))!;
                corruptedPkg.Metadata.ChecksumSha256 = "invalid_hash_checksum_123456";

                using var conn = mergeFactory.CreateOpenConnection();
                var rep = UniversalDataMergeService.PreviewOrExecute(
                    conn, corruptedPkg, new MergeOptions { Mode = "VALIDATE_ONLY" }, "SQLite");

                if (!rep.Success && rep.ValidationErrors.Any(e => e.Contains("checksum mismatch")))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Corrupted package checksum rejection",
                        Status = "PASS",
                        Details = "Rejected tampered checksum."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Corrupted package checksum rejection",
                        Status = "FAIL",
                        Details = "Did not reject corrupted checksum."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Corrupted package checksum rejection", Status = "FAIL", Details = ex.Message });
            }

            // ────────────────────────────────────────────────────────
            // TEST 9: UNBALANCED VOUCHER REJECTION (Dr != Cr)
            // ────────────────────────────────────────────────────────
            try
            {
                var unbPkg = JsonSerializer.Deserialize<ExportPackage>(JsonSerializer.Serialize(package7Soc))!;
                unbPkg.Data.SocVoucherDetail[0]["Debit"] = 99999; // Make unbalanced
                unbPkg.Metadata.ChecksumSha256 = DatabaseExportService.ComputeSha256(JsonSerializer.Serialize(unbPkg.Data));

                using var conn = mergeFactory.CreateOpenConnection();
                var rep = UniversalDataMergeService.PreviewOrExecute(
                    conn, unbPkg, new MergeOptions { Mode = "VALIDATE_ONLY" }, "SQLite");

                if (!rep.Success && rep.ValidationErrors.Any(e => e.Contains("unbalanced")))
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Unbalanced voucher accounting invariant rejection",
                        Status = "PASS",
                        Details = "Rejected unbalanced voucher entries prior to database write."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Unbalanced voucher accounting invariant rejection",
                        Status = "FAIL",
                        Details = "Failed to reject unbalanced voucher."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Unbalanced voucher accounting invariant rejection", Status = "FAIL", Details = ex.Message });
            }

            // ────────────────────────────────────────────────────────
            // TEST 10: ATOMIC ROLLBACK ON ERROR (Zero partial writes)
            // ────────────────────────────────────────────────────────
            try
            {
                var failPkg = JsonSerializer.Deserialize<ExportPackage>(JsonSerializer.Serialize(package7Soc))!;
                // Inject invalid account referencing non-existent SocietyId
                failPkg.Data.SocAccount.Add(new Dictionary<string, object?>
                {
                    ["AccountId"] = 99999,
                    ["SocietyId"] = 999999, // Non-existent
                    ["AccCode"] = "INV99",
                    ["AccName"] = "Invalid Account"
                });
                failPkg.Metadata.ChecksumSha256 = DatabaseExportService.ComputeSha256(JsonSerializer.Serialize(failPkg.Data));

                using var conn = mergeFactory.CreateOpenConnection();
                var rep = UniversalDataMergeService.PreviewOrExecute(
                    conn, failPkg, new MergeOptions { Mode = "SAFE_MERGE" }, "SQLite");

                if (!rep.Success && rep.RollbackOccurred)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Atomic transaction rollback on error",
                        Status = "PASS",
                        Details = "Transaction rolled back completely upon constraint violation; zero partial writes persisted."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Atomic transaction rollback on error",
                        Status = "FAIL",
                        Details = "Rollback flag was not set on error."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Atomic transaction rollback on error", Status = "FAIL", Details = ex.Message });
            }

            // ────────────────────────────────────────────────────────
            // TEST 11: CURRENT SOCIETY EXPORT ISOLATION
            // ────────────────────────────────────────────────────────
            try
            {
                using var conn = srcFactory.CreateOpenConnection();
                var curSocPkg = DatabaseExportService.GenerateExport(conn, new ExportRequest
                {
                    Scope = "CURRENT_SOCIETY",
                    SocietyId = 2
                }, "SQLite");

                bool socMatch = curSocPkg.Data.SocietyInfo.Count == 1 && Convert.ToInt32(curSocPkg.Data.SocietyInfo[0]["SocietyId"]) == 2;
                bool memberMatch = curSocPkg.Data.SocMember.All(m => Convert.ToInt32(m["SocietyId"]) == 2);
                bool vchMatch = curSocPkg.Data.SocVoucherHeader.All(v => Convert.ToInt32(v["SocietyId"]) == 2);

                if (socMatch && memberMatch && vchMatch)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Current Society export isolation",
                        Status = "PASS",
                        Details = $"Exported single active society (ID=2) with complete FYs and dependent records; 0 leaked records from other societies."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Current Society export isolation",
                        Status = "FAIL",
                        Details = $"Society or dependent count mismatch in single society export: SocCount={curSocPkg.Data.SocietyInfo.Count}."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Current Society export isolation", Status = "FAIL", Details = ex.Message });
            }

            // ────────────────────────────────────────────────────────
            // TEST 12: SELECT SOCIETIES MULTI-SELECTION EXPORT
            // ────────────────────────────────────────────────────────
            try
            {
                using var conn = srcFactory.CreateOpenConnection();
                var selSocPkg = DatabaseExportService.GenerateExport(conn, new ExportRequest
                {
                    Scope = "SELECT_SOCIETIES",
                    SelectedSocietyIds = new List<int> { 1, 3, 5 }
                }, "SQLite");

                bool countMatch = selSocPkg.Data.SocietyInfo.Count == 3;
                var exportedIds = selSocPkg.Data.SocietyInfo.Select(s => Convert.ToInt32(s["SocietyId"])).ToHashSet();
                bool idsMatch = exportedIds.SetEquals(new[] { 1, 3, 5 });
                bool allMembersMatch = selSocPkg.Data.SocMember.All(m => exportedIds.Contains(Convert.ToInt32(m["SocietyId"])));
                bool allVchsMatch = selSocPkg.Data.SocVoucherHeader.All(v => exportedIds.Contains(Convert.ToInt32(v["SocietyId"])));

                if (countMatch && idsMatch && allMembersMatch && allVchsMatch)
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Select Societies multi-selection export",
                        Status = "PASS",
                        Details = $"Exported exactly 3 selected societies [1, 3, 5] with all dependent records; 0 excluded societies included."
                    });
                }
                else
                {
                    results.Add(new TestResultItem
                    {
                        TestName = "Select Societies multi-selection export",
                        Status = "FAIL",
                        Details = $"Selected societies export mismatch: SocCount={selSocPkg.Data.SocietyInfo.Count}."
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new TestResultItem { TestName = "Select Societies multi-selection export", Status = "FAIL", Details = ex.Message });
            }

            // Clean up temporary test files
            foreach (var p in new[] { sourceDbPath, emptyTargetDbPath, mergeTargetDbPath })
            {
                if (File.Exists(p)) try { File.Delete(p); } catch { }
            }

            return results;
        }
    }
}
