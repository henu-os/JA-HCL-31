// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — DatabaseImportService
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data;
using System.Diagnostics;
using System.Linq;
using System.Text.Json;

namespace JeevikaERP.Database.ExportImport
{
    public class DatabaseImportService
    {
        public static void NormalizePackage(ExportPackage package)
        {
            if (package?.Data == null) return;
            var d = package.Data;

            List<Dictionary<string, object?>> NormalizeList(List<Dictionary<string, object?>>? list)
            {
                var result = new List<Dictionary<string, object?>>();
                if (list == null) return result;
                foreach (var row in list)
                {
                    var normalizedRow = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                    if (row != null)
                    {
                        foreach (var kvp in row)
                        {
                            normalizedRow[kvp.Key] = kvp.Value;
                        }
                    }
                    result.Add(normalizedRow);
                }
                return result;
            }

            d.SocietyInfo = NormalizeList(d.SocietyInfo);
            d.FinancialYear = NormalizeList(d.FinancialYear);
            d.TxNumberConfig = NormalizeList(d.TxNumberConfig);
            d.SocGroup = NormalizeList(d.SocGroup);
            d.SocAccount = NormalizeList(d.SocAccount);
            d.SocMember = NormalizeList(d.SocMember);
            d.SocVendor = NormalizeList(d.SocVendor);
            d.SocStaff = NormalizeList(d.SocStaff);
            d.SocCommittee = NormalizeList(d.SocCommittee);
            d.SocBillType = NormalizeList(d.SocBillType);
            d.SocBillingMatrix = NormalizeList(d.SocBillingMatrix);
            d.SocBillingSetting = NormalizeList(d.SocBillingSetting);
            d.SocOpeningBankReco = NormalizeList(d.SocOpeningBankReco);
            d.SocVoucherHeader = NormalizeList(d.SocVoucherHeader);
            d.SocVoucherDetail = NormalizeList(d.SocVoucherDetail);
            d.SocMemberBill = NormalizeList(d.SocMemberBill);
            d.SocMemberBillItem = NormalizeList(d.SocMemberBillItem);
            d.SocMemberNote = NormalizeList(d.SocMemberNote);
            d.SocOpeningBalance = NormalizeList(d.SocOpeningBalance);
            d.SocFixedDeposit = NormalizeList(d.SocFixedDeposit);
            d.SocMemberTransfer = NormalizeList(d.SocMemberTransfer);
        }

        public static ImportValidationResult ValidatePackage(ExportPackage package)
        {
            var result = new ImportValidationResult { IsValid = true };

            if (package == null || package.Metadata == null || package.Data == null)
            {
                result.IsValid = false;
                result.ValidationErrors.Add("Invalid or empty export package structure.");
                return result;
            }

            NormalizePackage(package);

            result.Scope = package.Metadata.Scope;

            // 1. Format Version Validation
            if (package.Metadata.FormatVersion != "1.0.0")
            {
                result.IsValid = false;
                result.ValidationErrors.Add($"Unsupported format version '{package.Metadata.FormatVersion}'. Expected '1.0.0'.");
            }

            // 2. Checksum Verification (if provided)
            if (!string.IsNullOrEmpty(package.Metadata.ChecksumSha256))
            {
                var computedCanonical = DatabaseExportService.ComputeCanonicalChecksum(package.Data);
                var legacyJson = JsonSerializer.Serialize(package.Data);
                var legacyChecksum = DatabaseExportService.ComputeSha256(legacyJson);

                bool matches = string.Equals(computedCanonical, package.Metadata.ChecksumSha256, StringComparison.OrdinalIgnoreCase) ||
                               string.Equals(legacyChecksum, package.Metadata.ChecksumSha256, StringComparison.OrdinalIgnoreCase);

                if (!matches)
                {
                    result.IsValid = false;
                    result.ValidationErrors.Add("Package data integrity checksum mismatch. The export file may be corrupted or modified.");
                }
            }

            // Count records
            var d = package.Data;
            result.RecordCounts = new Dictionary<string, int>
            {
                ["SocietyInfo"] = d.SocietyInfo?.Count ?? 0,
                ["FinancialYear"] = d.FinancialYear?.Count ?? 0,
                ["TxNumberConfig"] = d.TxNumberConfig?.Count ?? 0,
                ["SocGroup"] = d.SocGroup?.Count ?? 0,
                ["SocAccount"] = d.SocAccount?.Count ?? 0,
                ["SocMember"] = d.SocMember?.Count ?? 0,
                ["SocVendor"] = d.SocVendor?.Count ?? 0,
                ["SocStaff"] = d.SocStaff?.Count ?? 0,
                ["SocCommittee"] = d.SocCommittee?.Count ?? 0,
                ["SocBillType"] = d.SocBillType?.Count ?? 0,
                ["SocBillingMatrix"] = d.SocBillingMatrix?.Count ?? 0,
                ["SocBillingSetting"] = d.SocBillingSetting?.Count ?? 0,
                ["SocOpeningBankReco"] = d.SocOpeningBankReco?.Count ?? 0,
                ["SocVoucherHeader"] = d.SocVoucherHeader?.Count ?? 0,
                ["SocVoucherDetail"] = d.SocVoucherDetail?.Count ?? 0,
                ["SocMemberBill"] = d.SocMemberBill?.Count ?? 0,
                ["SocMemberBillItem"] = d.SocMemberBillItem?.Count ?? 0,
                ["SocMemberNote"] = d.SocMemberNote?.Count ?? 0,
                ["SocOpeningBalance"] = d.SocOpeningBalance?.Count ?? 0,
                ["SocFixedDeposit"] = d.SocFixedDeposit?.Count ?? 0,
                ["SocMemberTransfer"] = d.SocMemberTransfer?.Count ?? 0
            };
            result.TotalRecords = result.RecordCounts.Values.Sum();

            // 3. Accounting Safety Validation: Double-entry balancing (Dr == Cr)
            if (d.SocVoucherHeader != null && d.SocVoucherHeader.Count > 0)
            {
                var detailsByVoucherId = (d.SocVoucherDetail ?? new())
                    .Where(vd => (vd.ContainsKey("VoucherId") && vd["VoucherId"] != null) || (vd.ContainsKey("voucherId") && vd["voucherId"] != null))
                    .GroupBy(vd => (vd.GetValueOrDefault("VoucherId") ?? vd.GetValueOrDefault("voucherId"))!.ToString()!)
                    .ToDictionary(g => g.Key, g => g.ToList());

                var singleLegTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    "MemberDebitNote", "MemberCreditNote", "DebitNote", "CreditNote", "MDN", "MCN", "ADJ", "Note"
                };

                foreach (var vch in d.SocVoucherHeader)
                {
                    var vchId = (vch.GetValueOrDefault("VoucherId") ?? vch.GetValueOrDefault("voucherId"))?.ToString();
                    var vchNo = (vch.GetValueOrDefault("VoucherNo") ?? vch.GetValueOrDefault("voucherNo"))?.ToString() ?? vchId ?? "Unknown";
                    var vchType = (vch.GetValueOrDefault("VoucherType") ?? vch.GetValueOrDefault("voucherType"))?.ToString() ?? "";
                    var headerAmount = ConvertToDecimal(vch.GetValueOrDefault("Amount") ?? vch.GetValueOrDefault("amount"));

                    if (!string.IsNullOrEmpty(vchId) && detailsByVoucherId.TryGetValue(vchId, out var vchDetails))
                    {
                        decimal sumDr = 0;
                        decimal sumCr = 0;
                        foreach (var line in vchDetails)
                        {
                            var dVal = ConvertToDecimal(line.GetValueOrDefault("Debit") ?? line.GetValueOrDefault("debit") ?? line.GetValueOrDefault("DebitAmount"));
                            var cVal = ConvertToDecimal(line.GetValueOrDefault("Credit") ?? line.GetValueOrDefault("credit") ?? line.GetValueOrDefault("CreditAmount"));
                            sumDr += dVal;
                            sumCr += cVal;
                        }

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
                                result.IsValid = false;
                                result.ValidationErrors.Add($"Accounting rule violation: Note voucher '{vchNo}' detail total ({totalDetail}) does not match header amount ({headerAmount}).");
                            }
                        }
                        else
                        {
                            if (Math.Abs(sumDr - sumCr) > 0.001m)
                            {
                                result.IsValid = false;
                                result.ValidationErrors.Add($"Accounting rule violation: Voucher '{vchNo}' is unbalanced (Total Debit: {sumDr}, Total Credit: {sumCr}).");
                            }
                        }
                    }
                }
            }

            // 4. Foreign Key and Reference Sanity
            if (d.SocietyInfo != null && d.FinancialYear != null)
            {
                var societyIds = new HashSet<string>(d.SocietyInfo.Select(s => s.GetValueOrDefault("SocietyId")?.ToString() ?? "").Where(s => !string.IsNullOrEmpty(s)));
                foreach (var fy in d.FinancialYear)
                {
                    var sId = fy.GetValueOrDefault("SocietyId")?.ToString();
                    if (!string.IsNullOrEmpty(sId) && societyIds.Count > 0 && !societyIds.Contains(sId))
                    {
                        result.Warnings.Add($"Financial Year '{fy.GetValueOrDefault("FYLabel")}' references SocietyId {sId} which is not in the package societies list.");
                    }
                }
            }

            return result;
        }

        public static ImportExecutionResult ExecuteImport(IDbConnection conn, ExportPackage package, string providerName = "PostgreSQL")
        {
            var sw = Stopwatch.StartNew();
            var res = new ImportExecutionResult();

            // Run validation first
            var valResult = ValidatePackage(package);
            if (!valResult.IsValid)
            {
                res.Success = false;
                res.Message = "Import rejected due to validation errors.";
                res.Errors = valResult.ValidationErrors;
                return res;
            }

            bool wasClosed = conn.State != ConnectionState.Open;
            if (wasClosed) conn.Open();

            using var tx = conn.BeginTransaction();
            try
            {
                string prefix = providerName.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase) ? "jeevika_erp." : "";
                var d = package.Data;

                // 1. Primary Masters (Topological Dependency Order)
                res.ImportedCounts["SocietyInfo"] = ImportTable(conn, tx, $"{prefix}SocietyInfo", "SocietyId", d.SocietyInfo);
                res.ImportedCounts["FinancialYear"] = ImportTable(conn, tx, $"{prefix}FinancialYear", "FYId", d.FinancialYear);
                res.ImportedCounts["TxNumberConfig"] = ImportTable(conn, tx, $"{prefix}TxNumberConfig", "ConfigId", d.TxNumberConfig);
                res.ImportedCounts["SocGroup"] = ImportTable(conn, tx, $"{prefix}SocGroup", "GroupId", d.SocGroup);
                res.ImportedCounts["SocAccount"] = ImportTable(conn, tx, $"{prefix}SocAccount", "AccountId", d.SocAccount);
                res.ImportedCounts["SocMember"] = ImportTable(conn, tx, $"{prefix}SocMember", "MemberId", d.SocMember);
                res.ImportedCounts["SocVendor"] = ImportTable(conn, tx, $"{prefix}SocVendor", "VendorId", d.SocVendor);
                res.ImportedCounts["SocStaff"] = ImportTable(conn, tx, $"{prefix}SocStaff", "StaffId", d.SocStaff);
                res.ImportedCounts["SocCommittee"] = ImportTable(conn, tx, $"{prefix}SocCommittee", "CommitteeId", d.SocCommittee);

                // 2. Billing Configurations
                res.ImportedCounts["SocBillType"] = ImportTable(conn, tx, $"{prefix}SocBillType", "BillTypeId", d.SocBillType);
                res.ImportedCounts["SocBillingMatrix"] = ImportTable(conn, tx, $"{prefix}SocBillingMatrix", "MatrixId", d.SocBillingMatrix);
                res.ImportedCounts["SocBillingSetting"] = ImportTable(conn, tx, $"{prefix}SocBillingSetting", "SettingId", d.SocBillingSetting);

                // 3. Opening Records & Banking
                res.ImportedCounts["SocOpeningBankReco"] = ImportTable(conn, tx, $"{prefix}SocOpeningBankReco", "RecoId", d.SocOpeningBankReco);
                res.ImportedCounts["SocOpeningBalance"] = ImportTable(conn, tx, $"{prefix}SocOpeningBalance", "OpenBalId", d.SocOpeningBalance);
                res.ImportedCounts["SocFixedDeposit"] = ImportTable(conn, tx, $"{prefix}SocFixedDeposit", "FDId", d.SocFixedDeposit);
                res.ImportedCounts["SocMemberTransfer"] = ImportTable(conn, tx, $"{prefix}SocMemberTransfer", "TransferId", d.SocMemberTransfer);

                // 4. Accounting Transactions
                res.ImportedCounts["SocVoucherHeader"] = ImportTable(conn, tx, $"{prefix}SocVoucherHeader", "VoucherId", d.SocVoucherHeader);
                res.ImportedCounts["SocVoucherDetail"] = ImportTable(conn, tx, $"{prefix}SocVoucherDetail", "DetailId", d.SocVoucherDetail);

                // 5. Billing Transactions
                res.ImportedCounts["SocMemberBill"] = ImportTable(conn, tx, $"{prefix}SocMemberBill", "BillId", d.SocMemberBill);
                res.ImportedCounts["SocMemberBillItem"] = ImportTable(conn, tx, $"{prefix}SocMemberBillItem", "ItemId", d.SocMemberBillItem);
                res.ImportedCounts["SocMemberNote"] = ImportTable(conn, tx, $"{prefix}SocMemberNote", "NoteId", d.SocMemberNote);

                // Commit Transaction
                tx.Commit();

                res.Success = true;
                res.Message = "Database import completed successfully and transaction committed.";
                res.DurationMs = sw.ElapsedMilliseconds;
                return res;
            }
            catch (Exception ex)
            {
                try { tx.Rollback(); } catch { }
                res.Success = false;
                res.Message = "Database import failed. Transaction was completely rolled back.";
                res.Errors.Add($"Database error: {ex.Message}");
                res.DurationMs = sw.ElapsedMilliseconds;
                return res;
            }
            finally
            {
                if (wasClosed) conn.Close();
            }
        }

        private static int ImportTable(IDbConnection conn, IDbTransaction tx, string tableName, string pkName, List<Dictionary<string, object?>>? rows)
        {
            if (rows == null || rows.Count == 0) return 0;
            int count = 0;

            foreach (var row in rows)
            {
                if (row.Count == 0) continue;

                var columns = row.Keys.ToList();
                var paramNames = columns.Select((c, i) => $"@p{i}").ToList();

                var colsJoined = string.Join(", ", columns);
                var paramsJoined = string.Join(", ", paramNames);

                var cmd = conn.CreateCommand();
                cmd.Transaction = tx;

                // SQLite syntax
                cmd.CommandText = $"INSERT OR REPLACE INTO {tableName} ({colsJoined}) VALUES ({paramsJoined})";
                
                // PostgreSQL syntax
                if (tableName.StartsWith("jeevika_erp."))
                {
                    var updateSets = string.Join(", ", columns.Where(c => !string.Equals(c, pkName, StringComparison.OrdinalIgnoreCase)).Select(c => $"{c} = EXCLUDED.{c}"));
                    if (!string.IsNullOrEmpty(updateSets) && columns.Any(c => string.Equals(c, pkName, StringComparison.OrdinalIgnoreCase)))
                    {
                        cmd.CommandText = $"INSERT INTO {tableName} ({colsJoined}) VALUES ({paramsJoined}) ON CONFLICT ({pkName}) DO UPDATE SET {updateSets}";
                    }
                    else
                    {
                        cmd.CommandText = $"INSERT INTO {tableName} ({colsJoined}) VALUES ({paramsJoined}) ON CONFLICT DO NOTHING";
                    }
                }

                for (int i = 0; i < columns.Count; i++)
                {
                    var p = cmd.CreateParameter();
                    p.ParameterName = $"@p{i}";
                    var val = row[columns[i]];
                    p.Value = val == null ? DBNull.Value : ParseValue(val);
                    cmd.Parameters.Add(p);
                }

                try
                {
                    cmd.ExecuteNonQuery();
                    count++;
                }
                catch (Exception ex)
                {
                    throw new InvalidOperationException($"Failed inserting into {tableName}: {ex.Message}", ex);
                }
            }

            return count;
        }

        private static object ParseValue(object raw)
        {
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
            if (raw is bool b)
            {
                return b ? 1 : 0;
            }
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
