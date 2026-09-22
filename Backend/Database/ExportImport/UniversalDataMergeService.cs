// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — UniversalDataMergeService
// Universal Database Export/Import & Multi-Society Merge Engine
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data;
using System.Diagnostics;
using System.Linq;
using System.Text.Json;

namespace JeevikaERP.Database.ExportImport
{
    public class MergeOptions
    {
        public string Mode { get; set; } = "SAFE_MERGE"; // EMPTY_TARGET, SAFE_MERGE, VALIDATE_ONLY
        public string ConflictPolicy { get; set; } = "SKIP_EXISTING"; // REJECT_CONFLICTS, SKIP_EXISTING, ADD_AS_NEW
        public string FinancialYearScope { get; set; } = "ALL_FYS"; // ALL_FYS, CURRENT_FY, SELECT_FYS
        public int? TargetCurrentFYId { get; set; }
        public List<int>? SelectedFinancialYearIds { get; set; }
        public string SourceNodeId { get; set; } = "LAPTOP-SOURCE";
        public string TargetNodeId { get; set; } = "LAPTOP-TARGET";
        public string ExecutedBy { get; set; } = "Admin";
    }

    public class MergeReport
    {
        public string OperationId { get; set; } = Guid.NewGuid().ToString("N");
        public string ImportMode { get; set; } = "SAFE_MERGE";
        public string ConflictPolicy { get; set; } = "SKIP_EXISTING";
        public string FinancialYearScope { get; set; } = "ALL_FYS";
        public string ChecksumSha256 { get; set; } = string.Empty;
        public int TotalRecordsInspected { get; set; }
        public int RecordsAdded { get; set; }
        public int RecordsMatched { get; set; }
        public int RecordsSkipped { get; set; }
        public int RecordsConflicted { get; set; }
        public int RecordsRejected { get; set; }
        public bool RollbackOccurred { get; set; }
        public bool Success { get; set; }
        public string StatusMessage { get; set; } = string.Empty;
        public double DurationMs { get; set; }
        public Dictionary<string, Dictionary<string, string>> IdMappings { get; set; } = new();
        public List<string> ValidationErrors { get; set; } = new();
        public List<string> ConflictReasons { get; set; } = new();
        public List<string> Warnings { get; set; } = new();
    }

    public class UniversalDataMergeService
    {
        public static MergeReport PreviewOrExecute(
            IDbConnection conn,
            ExportPackage package,
            MergeOptions options,
            string providerName = "PostgreSQL")
        {
            var sw = Stopwatch.StartNew();
            var report = new MergeReport
            {
                ImportMode = options.Mode.ToUpperInvariant(),
                ConflictPolicy = options.ConflictPolicy.ToUpperInvariant(),
                FinancialYearScope = (options.FinancialYearScope ?? "ALL_FYS").ToUpperInvariant(),
                ChecksumSha256 = package?.Metadata?.ChecksumSha256 ?? string.Empty
            };

            // 1. Pre-validation of package structure & double-entry invariants
            var basicValidation = DatabaseImportService.ValidatePackage(package);
            if (!basicValidation.IsValid)
            {
                report.Success = false;
                report.StatusMessage = "Merge rejected due to invalid package or accounting invariant violations.";
                report.ValidationErrors.AddRange(basicValidation.ValidationErrors);
                report.DurationMs = sw.ElapsedMilliseconds;
                return report;
            }

            report.TotalRecordsInspected = basicValidation.TotalRecords;
            bool isDryRun = report.ImportMode == "VALIDATE_ONLY";

            bool wasClosed = conn.State != ConnectionState.Open;
            if (wasClosed) conn.Open();

            // Setup Financial Year Filter Set
            HashSet<int>? allowedFYIds = null;
            if (report.FinancialYearScope == "SELECT_FYS" && options.SelectedFinancialYearIds != null && options.SelectedFinancialYearIds.Count > 0)
            {
                allowedFYIds = new HashSet<int>(options.SelectedFinancialYearIds);
            }
            else if (report.FinancialYearScope == "CURRENT_FY" && options.TargetCurrentFYId.HasValue)
            {
                allowedFYIds = new HashSet<int> { options.TargetCurrentFYId.Value };
            }

            // Initialize Remapping Tables
            var socIdMap = new Dictionary<string, string>();     // SourceSocId -> TargetSocId
            var fyIdMap = new Dictionary<string, string>();      // SourceFYId -> TargetFYId
            var grpIdMap = new Dictionary<string, string>();     // SourceGroupId -> TargetGroupId
            var accIdMap = new Dictionary<string, string>();     // SourceAccountId -> TargetAccountId
            var memIdMap = new Dictionary<string, string>();     // SourceMemberId -> TargetMemberId
            var billTypeIdMap = new Dictionary<string, string>();// SourceBillTypeId -> TargetBillTypeId
            var vchIdMap = new Dictionary<string, string>();     // SourceVoucherId -> TargetVoucherId
            var billIdMap = new Dictionary<string, string>();    // SourceBillId -> TargetBillId

            report.IdMappings["Societies"] = socIdMap;
            report.IdMappings["FinancialYears"] = fyIdMap;
            report.IdMappings["Groups"] = grpIdMap;
            report.IdMappings["Accounts"] = accIdMap;
            report.IdMappings["Members"] = memIdMap;
            report.IdMappings["BillTypes"] = billTypeIdMap;
            report.IdMappings["Vouchers"] = vchIdMap;
            report.IdMappings["Bills"] = billIdMap;

            IDbTransaction? tx = null;
            if (!isDryRun)
            {
                tx = conn.BeginTransaction();
            }

            try
            {
                string prefix = providerName.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase) ? "jeevika_erp." : "";
                var d = package.Data;

                // ── STEP 1: SOCIETY INFO ──────────────────────────────
                foreach (var soc in d.SocietyInfo ?? new())
                {
                    var srcSocId = soc.GetValueOrDefault("SocietyId")?.ToString() ?? "";
                    var socCode = soc.GetValueOrDefault("SocietyCode")?.ToString() ?? "";
                    var socName = soc.GetValueOrDefault("SocietyName")?.ToString() ?? "";

                    // Query existing target society by SocietyCode
                    string existingTgtId = "";
                    using (var checkCmd = conn.CreateCommand())
                    {
                        if (tx != null) checkCmd.Transaction = tx;
                        checkCmd.CommandText = $"SELECT SocietyId FROM {prefix}SocietyInfo WHERE UPPER(SocietyCode) = @code;";
                        AddParam(checkCmd, "@code", socCode.ToUpperInvariant());
                        var obj = checkCmd.ExecuteScalar();
                        if (obj != null && obj != DBNull.Value) existingTgtId = obj.ToString()!;
                    }

                    if (!string.IsNullOrEmpty(existingTgtId))
                    {
                        // Match found
                        socIdMap[srcSocId] = existingTgtId;
                        report.RecordsMatched++;
                        if (report.ConflictPolicy == "REJECT_CONFLICTS" && report.ImportMode == "EMPTY_TARGET")
                        {
                            report.ConflictReasons.Add($"Society '{socCode}' already exists in non-empty database.");
                            report.RecordsConflicted++;
                        }
                    }
                    else
                    {
                        // New Society
                        if (!isDryRun)
                        {
                            var newId = InsertRowAndGetId(conn, tx, $"{prefix}SocietyInfo", "SocietyId", soc, new(), providerName);
                            socIdMap[srcSocId] = newId.ToString();
                            report.RecordsAdded++;
                        }
                        else
                        {
                            socIdMap[srcSocId] = $"TEMP_{srcSocId}";
                            report.RecordsAdded++;
                        }
                    }
                }

                // ── STEP 2: FINANCIAL YEARS ───────────────────────────
                foreach (var fy in d.FinancialYear ?? new())
                {
                    var srcFYId = fy.GetValueOrDefault("FYId")?.ToString() ?? "";
                    var srcSocId = fy.GetValueOrDefault("SocietyId")?.ToString() ?? "";
                    var fyLabel = fy.GetValueOrDefault("FYLabel")?.ToString() ?? "";

                    if (allowedFYIds != null && int.TryParse(srcFYId, out var numSrcFY) && !allowedFYIds.Contains(numSrcFY))
                    {
                        report.RecordsSkipped++;
                        continue;
                    }

                    var tgtSocId = socIdMap.TryGetValue(srcSocId, out var mappedSoc) ? mappedSoc : srcSocId;

                    string existingTgtFYId = "";
                    if (int.TryParse(tgtSocId, out var numSocId))
                    {
                        using var checkCmd = conn.CreateCommand();
                        if (tx != null) checkCmd.Transaction = tx;
                        checkCmd.CommandText = $"SELECT FYId FROM {prefix}FinancialYear WHERE SocietyId = @sId AND UPPER(FYLabel) = @label;";
                        AddParam(checkCmd, "@sId", numSocId);
                        AddParam(checkCmd, "@label", fyLabel.ToUpperInvariant());
                        var obj = checkCmd.ExecuteScalar();
                        if (obj != null && obj != DBNull.Value) existingTgtFYId = obj.ToString()!;
                    }

                    if (!string.IsNullOrEmpty(existingTgtFYId))
                    {
                        fyIdMap[srcFYId] = existingTgtFYId;
                        report.RecordsMatched++;
                    }
                    else
                    {
                        if (!isDryRun)
                        {
                            var overrides = new Dictionary<string, object?> { ["SocietyId"] = int.TryParse(tgtSocId, out var sid) ? sid : (object)DBNull.Value };
                            var newFYId = InsertRowAndGetId(conn, tx, $"{prefix}FinancialYear", "FYId", fy, overrides, providerName);
                            fyIdMap[srcFYId] = newFYId.ToString();
                            report.RecordsAdded++;
                        }
                        else
                        {
                            fyIdMap[srcFYId] = $"TEMP_FY_{srcFYId}";
                            report.RecordsAdded++;
                        }
                    }
                }

                // ── STEP 3: SOC GROUPS ────────────────────────────────
                foreach (var grp in d.SocGroup ?? new())
                {
                    var srcGrpId = grp.GetValueOrDefault("GroupId")?.ToString() ?? "";
                    var srcSocId = grp.GetValueOrDefault("SocietyId")?.ToString() ?? "";
                    var grpCode = grp.GetValueOrDefault("GrpCode")?.ToString() ?? "";

                    var tgtSocId = socIdMap.TryGetValue(srcSocId, out var mappedSoc) ? mappedSoc : srcSocId;

                    string existingTgtGrpId = "";
                    if (int.TryParse(tgtSocId, out var numSocId))
                    {
                        using var checkCmd = conn.CreateCommand();
                        if (tx != null) checkCmd.Transaction = tx;
                        checkCmd.CommandText = $"SELECT GroupId FROM {prefix}SocGroup WHERE SocietyId = @sId AND UPPER(GrpCode) = @code AND IsDeleted = 0;";
                        AddParam(checkCmd, "@sId", numSocId);
                        AddParam(checkCmd, "@code", grpCode.ToUpperInvariant());
                        var obj = checkCmd.ExecuteScalar();
                        if (obj != null && obj != DBNull.Value) existingTgtGrpId = obj.ToString()!;
                    }

                    if (!string.IsNullOrEmpty(existingTgtGrpId))
                    {
                        grpIdMap[srcGrpId] = existingTgtGrpId;
                        report.RecordsMatched++;
                    }
                    else
                    {
                        if (!isDryRun)
                        {
                            var overrides = new Dictionary<string, object?> { ["SocietyId"] = int.TryParse(tgtSocId, out var sid) ? sid : (object)DBNull.Value };
                            var newGrpId = InsertRowAndGetId(conn, tx, $"{prefix}SocGroup", "GroupId", grp, overrides, providerName);
                            grpIdMap[srcGrpId] = newGrpId.ToString();
                            report.RecordsAdded++;
                        }
                        else
                        {
                            grpIdMap[srcGrpId] = $"TEMP_GRP_{srcGrpId}";
                            report.RecordsAdded++;
                        }
                    }
                }

                // ── STEP 4: SOC ACCOUNTS ──────────────────────────────
                foreach (var acc in d.SocAccount ?? new())
                {
                    var srcAccId = acc.GetValueOrDefault("AccountId")?.ToString() ?? "";
                    var srcSocId = acc.GetValueOrDefault("SocietyId")?.ToString() ?? "";
                    var accCode = acc.GetValueOrDefault("AccCode")?.ToString() ?? "";
                    var srcGrpId = acc.GetValueOrDefault("GroupId")?.ToString() ?? "";

                    var tgtSocId = socIdMap.TryGetValue(srcSocId, out var mappedSoc) ? mappedSoc : srcSocId;

                    string existingTgtAccId = "";
                    if (int.TryParse(tgtSocId, out var numSocId))
                    {
                        using var checkCmd = conn.CreateCommand();
                        if (tx != null) checkCmd.Transaction = tx;
                        checkCmd.CommandText = $"SELECT AccountId FROM {prefix}SocAccount WHERE SocietyId = @sId AND UPPER(AccCode) = @code AND IsDeleted = 0;";
                        AddParam(checkCmd, "@sId", numSocId);
                        AddParam(checkCmd, "@code", accCode.ToUpperInvariant());
                        var obj = checkCmd.ExecuteScalar();
                        if (obj != null && obj != DBNull.Value) existingTgtAccId = obj.ToString()!;
                    }

                    if (!string.IsNullOrEmpty(existingTgtAccId))
                    {
                        accIdMap[srcAccId] = existingTgtAccId;
                        report.RecordsMatched++;
                    }
                    else
                    {
                        if (!isDryRun)
                        {
                            var overrides = new Dictionary<string, object?>
                            {
                                ["SocietyId"] = int.TryParse(tgtSocId, out var sid) ? sid : (object)DBNull.Value,
                                ["GroupId"] = (grpIdMap.TryGetValue(srcGrpId, out var remappedGrpId) && int.TryParse(remappedGrpId, out var gid)) ? gid : (object)DBNull.Value
                            };
                            var newAccId = InsertRowAndGetId(conn, tx, $"{prefix}SocAccount", "AccountId", acc, overrides, providerName);
                            accIdMap[srcAccId] = newAccId.ToString();
                            report.RecordsAdded++;
                        }
                        else
                        {
                            accIdMap[srcAccId] = $"TEMP_ACC_{srcAccId}";
                            report.RecordsAdded++;
                        }
                    }
                }

                // ── STEP 5: SOC MEMBERS ───────────────────────────────
                foreach (var mem in d.SocMember ?? new())
                {
                    var srcMemId = mem.GetValueOrDefault("MemberId")?.ToString() ?? "";
                    var srcSocId = mem.GetValueOrDefault("SocietyId")?.ToString() ?? "";
                    var memCode = mem.GetValueOrDefault("MemCode")?.ToString() ?? "";

                    var tgtSocId = socIdMap.TryGetValue(srcSocId, out var mappedSoc) ? mappedSoc : srcSocId;

                    string existingTgtMemId = "";
                    if (int.TryParse(tgtSocId, out var numSocId))
                    {
                        using var checkCmd = conn.CreateCommand();
                        if (tx != null) checkCmd.Transaction = tx;
                        checkCmd.CommandText = $"SELECT MemberId FROM {prefix}SocMember WHERE SocietyId = @sId AND UPPER(MemCode) = @code AND IsDeleted = 0;";
                        AddParam(checkCmd, "@sId", numSocId);
                        AddParam(checkCmd, "@code", memCode.ToUpperInvariant());
                        var obj = checkCmd.ExecuteScalar();
                        if (obj != null && obj != DBNull.Value) existingTgtMemId = obj.ToString()!;
                    }

                    if (!string.IsNullOrEmpty(existingTgtMemId))
                    {
                        memIdMap[srcMemId] = existingTgtMemId;
                        report.RecordsMatched++;
                    }
                    else
                    {
                        if (!isDryRun)
                        {
                            var overrides = new Dictionary<string, object?> { ["SocietyId"] = int.TryParse(tgtSocId, out var sid) ? sid : (object)DBNull.Value };
                            var newMemId = InsertRowAndGetId(conn, tx, $"{prefix}SocMember", "MemberId", mem, overrides, providerName);
                            memIdMap[srcMemId] = newMemId.ToString();
                            report.RecordsAdded++;
                        }
                        else
                        {
                            memIdMap[srcMemId] = $"TEMP_MEM_{srcMemId}";
                            report.RecordsAdded++;
                        }
                    }
                }

                // ── STEP 6: SOC BILL TYPES ────────────────────────────
                foreach (var bt in d.SocBillType ?? new())
                {
                    var srcBtId = bt.GetValueOrDefault("BillTypeId")?.ToString() ?? "";
                    var srcSocId = bt.GetValueOrDefault("SocietyId")?.ToString() ?? "";
                    var btName = bt.GetValueOrDefault("BillTypeName")?.ToString() ?? "";
                    var srcAccId = bt.GetValueOrDefault("AccountId")?.ToString() ?? "";

                    var tgtSocId = socIdMap.TryGetValue(srcSocId, out var mappedSoc) ? mappedSoc : srcSocId;

                    string existingTgtBtId = "";
                    if (int.TryParse(tgtSocId, out var numSocId))
                    {
                        using var checkCmd = conn.CreateCommand();
                        if (tx != null) checkCmd.Transaction = tx;
                        checkCmd.CommandText = $"SELECT BillTypeId FROM {prefix}SocBillType WHERE SocietyId = @sId AND UPPER(BillTypeName) = @name AND IsDeleted = 0;";
                        AddParam(checkCmd, "@sId", numSocId);
                        AddParam(checkCmd, "@name", btName.ToUpperInvariant());
                        var obj = checkCmd.ExecuteScalar();
                        if (obj != null && obj != DBNull.Value) existingTgtBtId = obj.ToString()!;
                    }

                    if (!string.IsNullOrEmpty(existingTgtBtId))
                    {
                        billTypeIdMap[srcBtId] = existingTgtBtId;
                        report.RecordsMatched++;
                    }
                    else
                    {
                        if (!isDryRun)
                        {
                            var overrides = new Dictionary<string, object?>
                            {
                                ["SocietyId"] = int.TryParse(tgtSocId, out var sid) ? sid : (object)DBNull.Value,
                                ["AccountId"] = (accIdMap.TryGetValue(srcAccId, out var remappedAccId) && int.TryParse(remappedAccId, out var aid)) ? aid : (object)DBNull.Value
                            };
                            var newBtId = InsertRowAndGetId(conn, tx, $"{prefix}SocBillType", "BillTypeId", bt, overrides, providerName);
                            billTypeIdMap[srcBtId] = newBtId.ToString();
                            report.RecordsAdded++;
                        }
                        else
                        {
                            billTypeIdMap[srcBtId] = $"TEMP_BT_{srcBtId}";
                            report.RecordsAdded++;
                        }
                    }
                }

                // ── STEP 7: SOC VOUCHERS & DETAILS ────────────────────
                foreach (var vch in d.SocVoucherHeader ?? new())
                {
                    var srcVchId = vch.GetValueOrDefault("VoucherId")?.ToString() ?? "";
                    var srcSocId = vch.GetValueOrDefault("SocietyId")?.ToString() ?? "";
                    var srcFYId = vch.GetValueOrDefault("FYId")?.ToString() ?? "";
                    var vchNo = vch.GetValueOrDefault("VoucherNo")?.ToString() ?? "";

                    if (allowedFYIds != null && int.TryParse(srcFYId, out var numSrcFY) && !allowedFYIds.Contains(numSrcFY))
                    {
                        report.RecordsSkipped++;
                        continue;
                    }

                    var tgtSocId = socIdMap.TryGetValue(srcSocId, out var mappedSoc) ? mappedSoc : srcSocId;
                    var tgtFYId = fyIdMap.TryGetValue(srcFYId, out var mappedFY) ? mappedFY : srcFYId;

                    string existingTgtVchId = "";
                    string existingStatus = "Posted";
                    if (int.TryParse(tgtSocId, out var numSocId) && int.TryParse(tgtFYId, out var numFYId))
                    {
                        using var checkCmd = conn.CreateCommand();
                        if (tx != null) checkCmd.Transaction = tx;
                        checkCmd.CommandText = $"SELECT VoucherId, Status FROM {prefix}SocVoucherHeader WHERE SocietyId = @sId AND FYId = @fyId AND VoucherNo = @vNo AND IsDeleted = 0;";
                        AddParam(checkCmd, "@sId", numSocId);
                        AddParam(checkCmd, "@fyId", numFYId);
                        AddParam(checkCmd, "@vNo", vchNo);
                        using var rdr = checkCmd.ExecuteReader();
                        if (rdr.Read())
                        {
                            existingTgtVchId = rdr.GetValue(0)?.ToString() ?? "";
                            existingStatus = rdr.IsDBNull(1) ? "Posted" : rdr.GetString(1);
                        }
                    }

                    if (!string.IsNullOrEmpty(existingTgtVchId))
                    {
                        vchIdMap[srcVchId] = existingTgtVchId;
                        report.RecordsMatched++;

                        if (existingStatus == "Audited" || existingStatus == "Locked" || report.ConflictPolicy == "REJECT_CONFLICTS")
                        {
                            report.ConflictReasons.Add($"Voucher '{vchNo}' already exists and is locked/audited in society {tgtSocId}.");
                            report.RecordsConflicted++;
                        }
                    }
                    else
                    {
                        if (!isDryRun)
                        {
                            var overrides = new Dictionary<string, object?>
                            {
                                ["SocietyId"] = int.TryParse(tgtSocId, out var sid) ? sid : (object)DBNull.Value,
                                ["FYId"] = int.TryParse(tgtFYId, out var fid) ? fid : (object)DBNull.Value
                            };
                            var newVchId = InsertRowAndGetId(conn, tx, $"{prefix}SocVoucherHeader", "VoucherId", vch, overrides, providerName);
                            vchIdMap[srcVchId] = newVchId.ToString();
                            report.RecordsAdded++;

                            // Insert matching voucher details
                            var childDetails = (d.SocVoucherDetail ?? new())
                                .Where(vd => vd.GetValueOrDefault("VoucherId")?.ToString() == srcVchId)
                                .ToList();

                            foreach (var vd in childDetails)
                            {
                                var srcDetailAccId = vd.GetValueOrDefault("AccountId")?.ToString() ?? "";
                                var detailOverrides = new Dictionary<string, object?>
                                {
                                    ["VoucherId"] = newVchId,
                                    ["AccountId"] = (accIdMap.TryGetValue(srcDetailAccId, out var remappedAccId) && int.TryParse(remappedAccId, out var aid)) ? aid : (object)DBNull.Value
                                };
                                InsertRowAndGetId(conn, tx, $"{prefix}SocVoucherDetail", "DetailId", vd, detailOverrides, providerName);
                                report.RecordsAdded++;
                            }
                        }
                        else
                        {
                            vchIdMap[srcVchId] = $"TEMP_VCH_{srcVchId}";
                            report.RecordsAdded++;
                        }
                    }
                }

                // ── STEP 8: MEMBER BILLS & ITEMS ──────────────────────
                foreach (var bill in d.SocMemberBill ?? new())
                {
                    var srcBillId = bill.GetValueOrDefault("BillId")?.ToString() ?? "";
                    var srcSocId = bill.GetValueOrDefault("SocietyId")?.ToString() ?? "";
                    var srcFYId = bill.GetValueOrDefault("FYId")?.ToString() ?? "";
                    var srcMemId = bill.GetValueOrDefault("MemberId")?.ToString() ?? "";
                    var srcBtId = bill.GetValueOrDefault("BillTypeId")?.ToString() ?? "";
                    var billNo = bill.GetValueOrDefault("BillNo")?.ToString() ?? "";

                    if (allowedFYIds != null && int.TryParse(srcFYId, out var numSrcFY) && !allowedFYIds.Contains(numSrcFY))
                    {
                        report.RecordsSkipped++;
                        continue;
                    }

                    var tgtSocId = socIdMap.TryGetValue(srcSocId, out var mappedSoc) ? mappedSoc : srcSocId;
                    var tgtFYId = fyIdMap.TryGetValue(srcFYId, out var mappedFY) ? mappedFY : srcFYId;
                    var tgtMemId = memIdMap.TryGetValue(srcMemId, out var mappedMem) ? mappedMem : srcMemId;

                    string existingTgtBillId = "";
                    if (int.TryParse(tgtSocId, out var numSocId) && int.TryParse(tgtFYId, out var numFYId))
                    {
                        using var checkCmd = conn.CreateCommand();
                        if (tx != null) checkCmd.Transaction = tx;
                        checkCmd.CommandText = $"SELECT BillId FROM {prefix}SocMemberBill WHERE SocietyId = @sId AND FYId = @fyId AND BillNo = @bNo AND IsDeleted = 0;";
                        AddParam(checkCmd, "@sId", numSocId);
                        AddParam(checkCmd, "@fyId", numFYId);
                        AddParam(checkCmd, "@bNo", billNo);
                        var obj = checkCmd.ExecuteScalar();
                        if (obj != null && obj != DBNull.Value) existingTgtBillId = obj.ToString()!;
                    }

                    if (!string.IsNullOrEmpty(existingTgtBillId))
                    {
                        billIdMap[srcBillId] = existingTgtBillId;
                        report.RecordsMatched++;
                    }
                    else
                    {
                        if (!isDryRun)
                        {
                            var overrides = new Dictionary<string, object?>
                            {
                                ["SocietyId"] = int.TryParse(tgtSocId, out var sid) ? sid : (object)DBNull.Value,
                                ["FYId"] = int.TryParse(tgtFYId, out var fid) ? fid : (object)DBNull.Value,
                                ["MemberId"] = int.TryParse(tgtMemId, out var mid) ? mid : (object)DBNull.Value,
                                ["BillTypeId"] = (billTypeIdMap.TryGetValue(srcBtId, out var remappedBtId) && int.TryParse(remappedBtId, out var bid)) ? bid : (object)DBNull.Value
                            };
                            var newBillId = InsertRowAndGetId(conn, tx, $"{prefix}SocMemberBill", "BillId", bill, overrides, providerName);
                            billIdMap[srcBillId] = newBillId.ToString();
                            report.RecordsAdded++;

                            // Insert child bill items
                            var childItems = (d.SocMemberBillItem ?? new())
                                .Where(bi => bi.GetValueOrDefault("BillId")?.ToString() == srcBillId)
                                .ToList();

                            foreach (var item in childItems)
                            {
                                var itemOverrides = new Dictionary<string, object?>
                                {
                                    ["BillId"] = newBillId
                                };
                                InsertRowAndGetId(conn, tx, $"{prefix}SocMemberBillItem", "ItemId", item, itemOverrides, providerName);
                                report.RecordsAdded++;
                            }
                        }
                        else
                        {
                            billIdMap[srcBillId] = $"TEMP_BILL_{srcBillId}";
                            report.RecordsAdded++;
                        }
                    }
                }

                // Check conflict policy validation abort condition
                if (report.RecordsConflicted > 0 && report.ConflictPolicy == "REJECT_CONFLICTS")
                {
                    if (tx != null) { tx.Rollback(); report.RollbackOccurred = true; }
                    report.Success = false;
                    report.StatusMessage = $"Merge rejected due to {report.RecordsConflicted} conflict(s). Database remained unchanged.";
                    report.DurationMs = sw.ElapsedMilliseconds;
                    return report;
                }

                // Commit transaction if executing
                if (tx != null)
                {
                    tx.Commit();
                }

                report.Success = true;
                report.StatusMessage = isDryRun
                    ? "Dry run validation completed successfully. 0 database writes performed."
                    : $"Universal merge completed successfully. {report.RecordsAdded} added, {report.RecordsMatched} matched.";
                report.DurationMs = sw.ElapsedMilliseconds;
                return report;
            }
            catch (Exception ex)
            {
                if (tx != null)
                {
                    try { tx.Rollback(); } catch { }
                    report.RollbackOccurred = true;
                }
                report.Success = false;
                report.StatusMessage = $"Merge failed and transaction rolled back: {ex.Message}";
                report.ValidationErrors.Add(ex.Message);
                report.DurationMs = sw.ElapsedMilliseconds;
                return report;
            }
            finally
            {
                if (wasClosed) conn.Close();
            }
        }

        private static long InsertRowAndGetId(
            IDbConnection conn,
            IDbTransaction? tx,
            string tableName,
            string pkName,
            Dictionary<string, object?> row,
            Dictionary<string, object?> overrides,
            string providerName)
        {
            var cols = new List<string>();
            var paramNames = new List<string>();
            var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

            foreach (var kvp in row)
            {
                if (string.Equals(kvp.Key, pkName, StringComparison.OrdinalIgnoreCase)) continue; // Omit PK to allow target auto-generation
                values[kvp.Key] = kvp.Value;
            }

            foreach (var kvp in overrides)
            {
                values[kvp.Key] = kvp.Value;
            }

            int idx = 0;
            var cmd = conn.CreateCommand();
            if (tx != null) cmd.Transaction = tx;

            foreach (var kvp in values)
            {
                cols.Add(kvp.Key);
                var pName = $"@p{idx++}";
                paramNames.Add(pName);
                AddParam(cmd, pName, ParseValue(kvp.Value));
            }

            var colsJoined = string.Join(", ", cols);
            var paramsJoined = string.Join(", ", paramNames);

            if (providerName.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase))
            {
                cmd.CommandText = $"INSERT INTO {tableName} ({colsJoined}) VALUES ({paramsJoined}) RETURNING {pkName};";
                var result = cmd.ExecuteScalar();
                return Convert.ToInt64(result);
            }
            else
            {
                cmd.CommandText = $"INSERT INTO {tableName} ({colsJoined}) VALUES ({paramsJoined}); SELECT last_insert_rowid();";
                var result = cmd.ExecuteScalar();
                return Convert.ToInt64(result);
            }
        }

        private static void AddParam(IDbCommand cmd, string name, object? val)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = val ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        private static object ParseValue(object? raw)
        {
            if (raw == null) return DBNull.Value;
            if (raw is JsonElement jsonElem)
            {
                switch (jsonElem.ValueKind)
                {
                    case JsonValueKind.String:
                        return jsonElem.GetString() ?? (object)DBNull.Value;
                    case JsonValueKind.Number:
                        if (jsonElem.TryGetInt64(out var l)) return l;
                        if (jsonElem.TryGetDecimal(out var d)) return d;
                        return jsonElem.GetDouble();
                    case JsonValueKind.True: return 1;
                    case JsonValueKind.False: return 0;
                    case JsonValueKind.Null: return DBNull.Value;
                    default: return jsonElem.GetRawText();
                }
            }
            if (raw is bool b) return b ? 1 : 0;
            return raw;
        }
    }
}
