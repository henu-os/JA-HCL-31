// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — SynchronizationService
// Safe, atomic, and idempotent database synchronization service.
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data;
using System.Diagnostics;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace JeevikaERP.Database.Synchronization
{
    public class SynchronizationService
    {
        private static readonly HashSet<string> SupportedEntities = new(StringComparer.OrdinalIgnoreCase)
        {
            "SocGroup", "SocAccount", "SocMember", "SocVendor", "SocStaff",
            "SocCommittee", "SocBillType", "SocBillingMatrix", "SocBillingSetting",
            "SocOpeningBankReco", "SocVoucherHeader", "SocVoucherDetail",
            "SocMemberBill", "SocMemberBillItem", "SocMemberNote",
            "SocOpeningBalance", "SocFixedDeposit", "SocMemberTransfer"
        };

        private static readonly HashSet<string> SensitiveColumns = new(StringComparer.OrdinalIgnoreCase)
        {
            "PasswordHash", "Password", "Secret", "SecretKey"
        };

        public static string ComputeSha256(string raw)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
            var sb = new StringBuilder();
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        public static SyncPackage CreatePackage(
            IDbConnection conn,
            int societyId,
            int? fyId,
            string sourceNodeId,
            List<SyncChangeItem> changes,
            string providerName = "PostgreSQL")
        {
            var package = new SyncPackage
            {
                BatchId = Guid.NewGuid().ToString("N"),
                SourceNodeId = sourceNodeId,
                SocietyId = societyId,
                FinancialYearId = fyId,
                FormatVersion = "1.0.0",
                Scope = fyId.HasValue ? "FINANCIAL_YEAR" : "SOCIETY",
                CreatedTimestampUtc = DateTime.UtcNow,
                Changes = changes ?? new()
            };

            // Strip sensitive fields from payload
            foreach (var change in package.Changes)
            {
                if (change.Data != null)
                {
                    var keysToRemove = change.Data.Keys.Where(k => SensitiveColumns.Contains(k)).ToList();
                    foreach (var k in keysToRemove) change.Data.Remove(k);
                }
            }

            // Compute Checksum
            var json = JsonSerializer.Serialize(package.Changes);
            package.ChecksumSha256 = ComputeSha256(json);

            return package;
        }

        public static SyncPreviewResult PreviewAndValidate(
            IDbConnection conn,
            SyncPackage package,
            string providerName = "PostgreSQL")
        {
            var result = new SyncPreviewResult
            {
                IsValid = true,
                BatchId = package?.BatchId ?? string.Empty
            };

            if (package == null || package.Changes == null)
            {
                result.IsValid = false;
                result.ValidationErrors.Add("Invalid synchronization package structure.");
                return result;
            }

            result.TotalChanges = package.Changes.Count;
            result.InsertCount = package.Changes.Count(c => string.Equals(c.Action, "INSERT", StringComparison.OrdinalIgnoreCase));
            result.UpdateCount = package.Changes.Count(c => string.Equals(c.Action, "UPDATE", StringComparison.OrdinalIgnoreCase));
            result.DeleteCount = package.Changes.Count(c => string.Equals(c.Action, "DELETE", StringComparison.OrdinalIgnoreCase));

            // 1. Format Version Validation
            if (package.FormatVersion != "1.0.0")
            {
                result.IsValid = false;
                result.ValidationErrors.Add($"Unsupported format version '{package.FormatVersion}'. Expected '1.0.0'.");
            }

            // 2. Checksum Verification
            if (!string.IsNullOrEmpty(package.ChecksumSha256))
            {
                var json = JsonSerializer.Serialize(package.Changes);
                var computed = ComputeSha256(json);
                if (!string.Equals(computed, package.ChecksumSha256, StringComparison.OrdinalIgnoreCase))
                {
                    result.IsValid = false;
                    result.ValidationErrors.Add("Checksum verification failed. Synchronization package is corrupt or modified.");
                }
            }

            bool wasClosed = conn.State != ConnectionState.Open;
            if (wasClosed) conn.Open();

            try
            {
                string prefix = providerName.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase) ? "jeevika_erp." : "";

                // 3. Idempotency check: Duplicate BatchId in SyncBatch
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT COUNT(*) FROM {prefix}SyncBatch WHERE BatchId = @bId AND Status = 'Applied';";
                    var p = cmd.CreateParameter();
                    p.ParameterName = "@bId";
                    p.Value = package.BatchId;
                    cmd.Parameters.Add(p);

                    var count = Convert.ToInt32(cmd.ExecuteScalar() ?? 0);
                    if (count > 0)
                    {
                        result.IsValid = false;
                        result.ValidationErrors.Add($"Duplicate batch: BatchId '{package.BatchId}' has already been applied.");
                    }
                }

                // 4. Society Validation
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT COUNT(*) FROM {prefix}SocietyInfo WHERE SocietyId = @socId;";
                    var p = cmd.CreateParameter();
                    p.ParameterName = "@socId";
                    p.Value = package.SocietyId;
                    cmd.Parameters.Add(p);

                    var socCount = Convert.ToInt32(cmd.ExecuteScalar() ?? 0);
                    if (socCount == 0)
                    {
                        result.IsValid = false;
                        result.ValidationErrors.Add($"Target SocietyId '{package.SocietyId}' does not exist in target database.");
                    }
                }

                // 5. Entity and Action Validation
                foreach (var change in package.Changes)
                {
                    if (string.IsNullOrEmpty(change.EntityType) || !SupportedEntities.Contains(change.EntityType))
                    {
                        result.IsValid = false;
                        result.ValidationErrors.Add($"Unsupported or unrecognized entity type: '{change.EntityType}'.");
                    }
                }

                // 6. Accounting Invariant: Double-Entry Balancing on Vouchers
                var voucherHeaders = package.Changes
                    .Where(c => string.Equals(c.EntityType, "SocVoucherHeader", StringComparison.OrdinalIgnoreCase))
                    .ToList();
                var voucherDetails = package.Changes
                    .Where(c => string.Equals(c.EntityType, "SocVoucherDetail", StringComparison.OrdinalIgnoreCase))
                    .ToList();

                if (voucherHeaders.Count > 0 && voucherDetails.Count > 0)
                {
                    foreach (var vh in voucherHeaders)
                    {
                        var vchId = vh.Data.GetValueOrDefault("VoucherId")?.ToString();
                        var vchNo = vh.Data.GetValueOrDefault("VoucherNo")?.ToString() ?? vchId ?? "Unknown";

                        if (!string.IsNullOrEmpty(vchId))
                        {
                            var detailsForVch = voucherDetails
                                .Where(vd => vd.Data.GetValueOrDefault("VoucherId")?.ToString() == vchId)
                                .ToList();

                            if (detailsForVch.Count > 0)
                            {
                                decimal sumDr = detailsForVch.Sum(d => ConvertToDecimal(d.Data.GetValueOrDefault("Debit") ?? d.Data.GetValueOrDefault("DebitAmount")));
                                decimal sumCr = detailsForVch.Sum(d => ConvertToDecimal(d.Data.GetValueOrDefault("Credit") ?? d.Data.GetValueOrDefault("CreditAmount")));

                                if (Math.Abs(sumDr - sumCr) > 0.001m)
                                {
                                    result.IsValid = false;
                                    result.ValidationErrors.Add($"Accounting invariant violation: Incoming voucher '{vchNo}' is unbalanced (Dr: {sumDr}, Cr: {sumCr}).");
                                    result.Conflicts.Add(new SyncConflictItem
                                    {
                                        EntityType = "SocVoucherHeader",
                                        EntityKey = vchNo,
                                        IncomingAction = vh.Action,
                                        Reason = $"Unbalanced debit/credit sum: Dr={sumDr}, Cr={sumCr}",
                                        IsUnsafeAccountingConflict = true
                                    });
                                }
                            }
                        }
                    }
                }

                // 7. Conflict Detection on Existing Transactions
                foreach (var vh in voucherHeaders.Where(c => string.Equals(c.Action, "UPDATE", StringComparison.OrdinalIgnoreCase)))
                {
                    var vchNo = vh.Data.GetValueOrDefault("VoucherNo")?.ToString();
                    if (!string.IsNullOrEmpty(vchNo))
                    {
                        using var chkCmd = conn.CreateCommand();
                        chkCmd.CommandText = $"SELECT Amount, Status FROM {prefix}SocVoucherHeader WHERE SocietyId = @socId AND VoucherNo = @vNo;";
                        
                        var p1 = chkCmd.CreateParameter();
                        p1.ParameterName = "@socId";
                        p1.Value = package.SocietyId;
                        chkCmd.Parameters.Add(p1);

                        var p2 = chkCmd.CreateParameter();
                        p2.ParameterName = "@vNo";
                        p2.Value = vchNo;
                        chkCmd.Parameters.Add(p2);

                        using var rdr = chkCmd.ExecuteReader();
                        if (rdr.Read())
                        {
                            var existingStatus = rdr.IsDBNull(1) ? "Posted" : rdr.GetString(1);
                            if (string.Equals(existingStatus, "Audited", StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(existingStatus, "Locked", StringComparison.OrdinalIgnoreCase))
                            {
                                result.IsValid = false;
                                result.Conflicts.Add(new SyncConflictItem
                                {
                                    EntityType = "SocVoucherHeader",
                                    EntityKey = vchNo,
                                    IncomingAction = "UPDATE",
                                    Reason = $"Cannot update audited or locked transaction '{vchNo}'.",
                                    IsUnsafeAccountingConflict = true
                                });
                            }
                        }
                    }
                }

                return result;
            }
            finally
            {
                if (wasClosed) conn.Close();
            }
        }

        public static SyncExecutionResult ApplySyncPackage(
            IDbConnection conn,
            SyncPackage package,
            string executedBy = "System",
            string providerName = "PostgreSQL")
        {
            var sw = Stopwatch.StartNew();
            var res = new SyncExecutionResult
            {
                BatchId = package?.BatchId ?? string.Empty
            };

            // 1. Run Pre-Validation
            var preview = PreviewAndValidate(conn, package, providerName);
            if (!preview.IsValid)
            {
                res.Success = false;
                res.Message = "Synchronization rejected due to validation errors.";
                res.Errors = preview.ValidationErrors;
                return res;
            }

            bool wasClosed = conn.State != ConnectionState.Open;
            if (wasClosed) conn.Open();

            using var tx = conn.BeginTransaction();
            try
            {
                string prefix = providerName.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase) ? "jeevika_erp." : "";

                // 2. Insert Batch record with Status = 'Pending'
                using (var batchCmd = conn.CreateCommand())
                {
                    batchCmd.Transaction = tx;
                    batchCmd.CommandText = $@"
                        INSERT INTO {prefix}SyncBatch (BatchId, SourceNodeId, TargetNodeId, SocietyId, FYId, FormatVersion, Scope, ChecksumSha256, TotalChanges, Status, CreatedBy)
                        VALUES (@bId, @src, @tgt, @socId, @fyId, @ver, @scope, @chk, @total, 'In Progress', @by);
                    ";

                    AddParam(batchCmd, "@bId", package.BatchId);
                    AddParam(batchCmd, "@src", package.SourceNodeId);
                    AddParam(batchCmd, "@tgt", package.TargetNodeId ?? (object)DBNull.Value);
                    AddParam(batchCmd, "@socId", package.SocietyId);
                    AddParam(batchCmd, "@fyId", package.FinancialYearId.HasValue ? package.FinancialYearId.Value : (object)DBNull.Value);
                    AddParam(batchCmd, "@ver", package.FormatVersion);
                    AddParam(batchCmd, "@scope", package.Scope);
                    AddParam(batchCmd, "@chk", package.ChecksumSha256);
                    AddParam(batchCmd, "@total", package.Changes.Count);
                    AddParam(batchCmd, "@by", executedBy);

                    batchCmd.ExecuteNonQuery();
                }

                // 3. Apply Changes in Topological Entity Order
                var sortedChanges = package.Changes
                    .OrderBy(c => GetEntityPrecedence(c.EntityType))
                    .ToList();

                int appliedCount = 0;
                foreach (var change in sortedChanges)
                {
                    var tableName = $"{prefix}{change.EntityType}";
                    var pkName = GetPrimaryKeyName(change.EntityType);

                    if (string.Equals(change.Action, "DELETE", StringComparison.OrdinalIgnoreCase))
                    {
                        using var delCmd = conn.CreateCommand();
                        delCmd.Transaction = tx;
                        delCmd.CommandText = $"DELETE FROM {tableName} WHERE SocietyId = @socId AND {pkName} = @pkVal;";
                        AddParam(delCmd, "@socId", package.SocietyId);
                        AddParam(delCmd, "@pkVal", change.EntityKey);
                        delCmd.ExecuteNonQuery();
                    }
                    else // INSERT or UPDATE (Upsert)
                    {
                        var row = change.Data;
                        if (row != null && row.Count > 0)
                        {
                            var columns = row.Keys.ToList();
                            var paramNames = columns.Select((c, i) => $"@p{i}").ToList();
                            var colsJoined = string.Join(", ", columns);
                            var paramsJoined = string.Join(", ", paramNames);

                            using var upsertCmd = conn.CreateCommand();
                            upsertCmd.Transaction = tx;

                            // SQLite syntax
                            upsertCmd.CommandText = $"INSERT OR REPLACE INTO {tableName} ({colsJoined}) VALUES ({paramsJoined})";

                            // PostgreSQL syntax
                            if (tableName.StartsWith("jeevika_erp."))
                            {
                                var updateSets = string.Join(", ", columns.Where(c => !string.Equals(c, pkName, StringComparison.OrdinalIgnoreCase)).Select(c => $"{c} = EXCLUDED.{c}"));
                                if (!string.IsNullOrEmpty(updateSets) && columns.Any(c => string.Equals(c, pkName, StringComparison.OrdinalIgnoreCase)))
                                {
                                    upsertCmd.CommandText = $"INSERT INTO {tableName} ({colsJoined}) VALUES ({paramsJoined}) ON CONFLICT ({pkName}) DO UPDATE SET {updateSets}";
                                }
                                else
                                {
                                    upsertCmd.CommandText = $"INSERT INTO {tableName} ({colsJoined}) VALUES ({paramsJoined}) ON CONFLICT DO NOTHING";
                                }
                            }

                            for (int i = 0; i < columns.Count; i++)
                            {
                                AddParam(upsertCmd, $"@p{i}", ParseValue(row[columns[i]]));
                            }

                            upsertCmd.ExecuteNonQuery();
                        }
                    }

                    // Log into SyncChangeLog
                    using (var logCmd = conn.CreateCommand())
                    {
                        logCmd.Transaction = tx;
                        logCmd.CommandText = $@"
                            INSERT INTO {prefix}SyncChangeLog (BatchId, SocietyId, EntityType, EntityKey, Action, PayloadJson, AppliedStatus)
                            VALUES (@bId, @socId, @eType, @eKey, @act, @payload, 'Applied');
                        ";
                        AddParam(logCmd, "@bId", package.BatchId);
                        AddParam(logCmd, "@socId", package.SocietyId);
                        AddParam(logCmd, "@eType", change.EntityType);
                        AddParam(logCmd, "@eKey", change.EntityKey);
                        AddParam(logCmd, "@act", change.Action);
                        AddParam(logCmd, "@payload", JsonSerializer.Serialize(change.Data));

                        logCmd.ExecuteNonQuery();
                    }

                    appliedCount++;
                }

                // 4. Update SyncBatch to 'Applied'
                using (var updateBatchCmd = conn.CreateCommand())
                {
                    updateBatchCmd.Transaction = tx;
                    updateBatchCmd.CommandText = $@"
                        UPDATE {prefix}SyncBatch 
                        SET Status = 'Applied', AppliedAt = {(providerName.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase) ? "NOW()" : "datetime('now')")}
                        WHERE BatchId = @bId;
                    ";
                    AddParam(updateBatchCmd, "@bId", package.BatchId);
                    updateBatchCmd.ExecuteNonQuery();
                }

                // 5. Write to SyncAuditLog
                using (var auditCmd = conn.CreateCommand())
                {
                    auditCmd.Transaction = tx;
                    auditCmd.CommandText = $@"
                        INSERT INTO {prefix}SyncAuditLog (BatchId, SocietyId, Action, Status, Details, ExecutedBy)
                        VALUES (@bId, @socId, 'SYNC_APPLY', 'SUCCESS', @details, @by);
                    ";
                    AddParam(auditCmd, "@bId", package.BatchId);
                    AddParam(auditCmd, "@socId", package.SocietyId);
                    AddParam(auditCmd, "@details", $"Successfully synchronized {appliedCount} changes.");
                    AddParam(auditCmd, "@by", executedBy);
                    auditCmd.ExecuteNonQuery();
                }

                // 6. Commit Transaction
                tx.Commit();

                res.Success = true;
                res.AppliedCount = appliedCount;
                res.Message = $"Synchronization batch '{package.BatchId}' successfully applied and committed.";
                res.DurationMs = sw.ElapsedMilliseconds;
                return res;
            }
            catch (Exception ex)
            {
                try { tx.Rollback(); } catch { }

                res.Success = false;
                res.Message = "Synchronization transaction failed. All changes rolled back completely.";
                res.Errors.Add($"Database transaction error: {ex.Message}");
                res.DurationMs = sw.ElapsedMilliseconds;
                return res;
            }
            finally
            {
                if (wasClosed) conn.Close();
            }
        }

        private static int GetEntityPrecedence(string entityType)
        {
            return entityType.ToLowerInvariant() switch
            {
                "societyinfo" => 1,
                "financialyear" => 2,
                "txnumberconfig" => 3,
                "socgroup" => 4,
                "socaccount" => 5,
                "socmember" => 6,
                "socvendor" => 7,
                "socstaff" => 8,
                "soccommittee" => 9,
                "socbilltype" => 10,
                "socbillingmatrix" => 11,
                "socbillingsetting" => 12,
                "socopeningbankreco" => 13,
                "socopeningbalance" => 14,
                "socvoucherheader" => 15,
                "socvoucherdetail" => 16,
                "socmemberbill" => 17,
                "socmemberbillitem" => 18,
                "socmembernote" => 19,
                "socfixeddeposit" => 20,
                "socmembertransfer" => 21,
                _ => 100
            };
        }

        private static string GetPrimaryKeyName(string entityType)
        {
            return entityType.ToLowerInvariant() switch
            {
                "societyinfo" => "SocietyId",
                "financialyear" => "FYId",
                "txnumberconfig" => "ConfigId",
                "socgroup" => "GroupId",
                "socaccount" => "AccountId",
                "socmember" => "MemberId",
                "socvendor" => "VendorId",
                "socstaff" => "StaffId",
                "soccommittee" => "CommitteeId",
                "socbilltype" => "BillTypeId",
                "socbillingmatrix" => "MatrixId",
                "socbillingsetting" => "SettingId",
                "socopeningbankreco" => "RecoId",
                "socvoucherheader" => "VoucherId",
                "socvoucherdetail" => "DetailId",
                "socmemberbill" => "BillId",
                "socmemberbillitem" => "ItemId",
                "socmembernote" => "NoteId",
                "socopeningbalance" => "OpenBalId",
                "socfixeddeposit" => "FDId",
                "socmembertransfer" => "TransferId",
                _ => "Id"
            };
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

        private static decimal ConvertToDecimal(object? val)
        {
            if (val == null || val == DBNull.Value) return 0;
            if (val is decimal d) return d;
            if (val is double db) return (decimal)db;
            if (val is int i) return i;
            if (val is long l) return l;
            if (val is JsonElement je && je.ValueKind == JsonValueKind.Number)
            {
                if (je.TryGetDecimal(out var dec)) return dec;
            }
            if (decimal.TryParse(val.ToString(), out var parsed)) return parsed;
            return 0;
        }
    }
}
