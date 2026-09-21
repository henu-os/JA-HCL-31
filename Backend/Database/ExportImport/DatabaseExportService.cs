// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — DatabaseExportService
// Financial-Year-Aware Universal Database Export Engine
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace JeevikaERP.Database.ExportImport
{
    public class DatabaseExportService
    {
        private static readonly HashSet<string> SensitiveColumns = new(StringComparer.OrdinalIgnoreCase)
        {
            "PasswordHash", "Password", "Secret", "SecretKey"
        };

        public static ExportPackage GenerateExport(IDbConnection conn, ExportRequest request, string providerName = "PostgreSQL")
        {
            var package = new ExportPackage();
            var scope = (request.Scope ?? "FULL").ToUpperInvariant();
            var fyScope = (request.FinancialYearScope ?? "ALL_FYS").ToUpperInvariant();

            package.Metadata.Scope = scope;
            package.Metadata.SocietyId = request.SocietyId;
            package.Metadata.SelectedSocietyIds = request.SelectedSocietyIds;
            package.Metadata.FinancialYearScope = fyScope;
            package.Metadata.FinancialYearId = request.FinancialYearId;
            package.Metadata.SelectedFinancialYearIds = request.SelectedFinancialYearIds;
            package.Metadata.SourceProvider = providerName;
            package.Metadata.AppVersion = "2.0.0";
            package.Metadata.FormatVersion = "1.0.0";
            package.Metadata.ExportTimestampUtc = DateTime.UtcNow;

            bool isClosed = conn.State != ConnectionState.Open;
            if (isClosed) conn.Open();

            try
            {
                // Detect schema prefix for Postgres vs SQLite
                string prefix = providerName.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase) ? "jeevika_erp." : "";

                // 1. SocietyInfo
                string socSql = $"SELECT * FROM {prefix}SocietyInfo WHERE 1=1";
                if ((scope == "SOCIETY" || scope == "CURRENT_SOCIETY") && request.SocietyId.HasValue)
                {
                    socSql += $" AND SocietyId = {request.SocietyId.Value}";
                }
                else if ((scope == "SELECT_SOCIETIES" || scope == "SELECTED_SOCIETIES") && request.SelectedSocietyIds != null && request.SelectedSocietyIds.Count > 0)
                {
                    socSql += $" AND SocietyId IN ({string.Join(",", request.SelectedSocietyIds)})";
                }
                package.Data.SocietyInfo = ReadTable(conn, socSql);
                if (package.Data.SocietyInfo.Count > 0 && request.SocietyId.HasValue)
                {
                    package.Metadata.SocietyName = package.Data.SocietyInfo[0].GetValueOrDefault("SocietyName")?.ToString();
                }

                // 2. FinancialYear
                string fySql = $"SELECT * FROM {prefix}FinancialYear WHERE 1=1";
                if ((scope == "SOCIETY" || scope == "CURRENT_SOCIETY") && request.SocietyId.HasValue)
                {
                    fySql += $" AND SocietyId = {request.SocietyId.Value}";
                }
                else if ((scope == "SELECT_SOCIETIES" || scope == "SELECTED_SOCIETIES") && request.SelectedSocietyIds != null && request.SelectedSocietyIds.Count > 0)
                {
                    fySql += $" AND SocietyId IN ({string.Join(",", request.SelectedSocietyIds)})";
                }

                // Apply Financial Year Scoping
                if (fyScope == "CURRENT_FY" && request.FinancialYearId.HasValue)
                {
                    fySql += $" AND FYId = {request.FinancialYearId.Value}";
                }
                else if (fyScope == "SELECT_FYS" && request.SelectedFinancialYearIds != null && request.SelectedFinancialYearIds.Count > 0)
                {
                    fySql += $" AND FYId IN ({string.Join(",", request.SelectedFinancialYearIds)})";
                }

                package.Data.FinancialYear = ReadTable(conn, fySql);
                if (package.Data.FinancialYear.Count > 0 && request.FinancialYearId.HasValue)
                {
                    package.Metadata.FYLabel = package.Data.FinancialYear[0].GetValueOrDefault("FYLabel")?.ToString();
                }

                // Collect list of exported FYIds to apply to dependent tables
                var exportedFYIds = package.Data.FinancialYear
                    .Select(f => f.GetValueOrDefault("FYId"))
                    .Where(id => id != null && id != DBNull.Value)
                    .Select(id => Convert.ToInt32(id))
                    .Distinct()
                    .ToList();

                bool isFYFiltered = (fyScope == "CURRENT_FY" || fyScope == "SELECT_FYS") && exportedFYIds.Count > 0;
                string fyIdInClause = exportedFYIds.Count > 0 ? string.Join(",", exportedFYIds) : "";

                // Filter condition helper for SocietyId
                string socFilter = "";
                if ((scope == "SOCIETY" || scope == "CURRENT_SOCIETY") && request.SocietyId.HasValue)
                {
                    socFilter = $" WHERE SocietyId = {request.SocietyId.Value}";
                }
                else if ((scope == "SELECT_SOCIETIES" || scope == "SELECTED_SOCIETIES") && request.SelectedSocietyIds != null && request.SelectedSocietyIds.Count > 0)
                {
                    socFilter = $" WHERE SocietyId IN ({string.Join(",", request.SelectedSocietyIds)})";
                }

                // 3. TxNumberConfig
                string txConfigFilter = socFilter;
                if (isFYFiltered)
                {
                    txConfigFilter += (string.IsNullOrEmpty(txConfigFilter) ? " WHERE" : " AND") + $" FYId IN ({fyIdInClause})";
                }
                package.Data.TxNumberConfig = ReadTable(conn, $"SELECT * FROM {prefix}TxNumberConfig{txConfigFilter}");

                // 4. SocGroup & SocAccount
                package.Data.SocGroup = ReadTable(conn, $"SELECT * FROM {prefix}SocGroup{socFilter}");
                package.Data.SocAccount = ReadTable(conn, $"SELECT * FROM {prefix}SocAccount{socFilter}");

                // 5. SocMember, SocVendor, SocStaff
                package.Data.SocMember = ReadTable(conn, $"SELECT * FROM {prefix}SocMember{socFilter}");
                package.Data.SocVendor = ReadTable(conn, $"SELECT * FROM {prefix}SocVendor{socFilter}");
                package.Data.SocStaff = ReadTable(conn, $"SELECT * FROM {prefix}SocStaff{socFilter}");

                // 6. SocCommittee
                string comFilter = socFilter;
                if (isFYFiltered)
                {
                    comFilter += (string.IsNullOrEmpty(comFilter) ? " WHERE" : " AND") + $" (FYId IN ({fyIdInClause}) OR FYId IS NULL)";
                }
                package.Data.SocCommittee = ReadTable(conn, $"SELECT * FROM {prefix}SocCommittee{comFilter}");

                // 7. SocBillType, SocBillingMatrix, SocBillingSetting
                package.Data.SocBillType = ReadTable(conn, $"SELECT * FROM {prefix}SocBillType{socFilter}");
                
                string matrixFilter = socFilter;
                if (isFYFiltered)
                {
                    matrixFilter += (string.IsNullOrEmpty(matrixFilter) ? " WHERE" : " AND") + $" (FYId IN ({fyIdInClause}) OR FYId IS NULL)";
                }
                package.Data.SocBillingMatrix = ReadTable(conn, $"SELECT * FROM {prefix}SocBillingMatrix{matrixFilter}");
                package.Data.SocBillingSetting = ReadTable(conn, $"SELECT * FROM {prefix}SocBillingSetting{socFilter}");

                // 8. SocOpeningBankReco
                string recoFilter = socFilter;
                if (isFYFiltered)
                {
                    recoFilter += (string.IsNullOrEmpty(recoFilter) ? " WHERE" : " AND") + $" (FYId IN ({fyIdInClause}) OR FYId IS NULL)";
                }
                package.Data.SocOpeningBankReco = ReadTable(conn, $"SELECT * FROM {prefix}SocOpeningBankReco{recoFilter}");

                // 9. SocVoucherHeader and SocVoucherDetail
                string vchFilter = socFilter;
                if (isFYFiltered)
                {
                    vchFilter += (string.IsNullOrEmpty(vchFilter) ? " WHERE" : " AND") + $" FYId IN ({fyIdInClause})";
                }
                package.Data.SocVoucherHeader = ReadTable(conn, $"SELECT * FROM {prefix}SocVoucherHeader{vchFilter}");

                string vchDetailSql = $"SELECT vd.* FROM {prefix}SocVoucherDetail vd";
                if (!string.IsNullOrEmpty(vchFilter))
                {
                    vchDetailSql += $" INNER JOIN {prefix}SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId {vchFilter}";
                }
                package.Data.SocVoucherDetail = ReadTable(conn, vchDetailSql);

                // 10. SocMemberBill and SocMemberBillItem
                string billFilter = socFilter;
                if (isFYFiltered)
                {
                    billFilter += (string.IsNullOrEmpty(billFilter) ? " WHERE" : " AND") + $" FYId IN ({fyIdInClause})";
                }
                package.Data.SocMemberBill = ReadTable(conn, $"SELECT * FROM {prefix}SocMemberBill{billFilter}");

                string billItemSql = $"SELECT bi.* FROM {prefix}SocMemberBillItem bi";
                if (!string.IsNullOrEmpty(billFilter))
                {
                    billItemSql += $" INNER JOIN {prefix}SocMemberBill mb ON bi.BillId = mb.BillId {billFilter}";
                }
                package.Data.SocMemberBillItem = ReadTable(conn, billItemSql);

                // 11. SocMemberNote
                string noteFilter = socFilter;
                if (isFYFiltered)
                {
                    noteFilter += (string.IsNullOrEmpty(noteFilter) ? " WHERE" : " AND") + $" FYId IN ({fyIdInClause})";
                }
                package.Data.SocMemberNote = ReadTable(conn, $"SELECT * FROM {prefix}SocMemberNote{noteFilter}");

                // 12. SocOpeningBalance
                string openBalFilter = socFilter;
                if (isFYFiltered)
                {
                    openBalFilter += (string.IsNullOrEmpty(openBalFilter) ? " WHERE" : " AND") + $" FYId IN ({fyIdInClause})";
                }
                package.Data.SocOpeningBalance = ReadTable(conn, $"SELECT * FROM {prefix}SocOpeningBalance{openBalFilter}");

                // 13. SocFixedDeposit
                string fdFilter = socFilter;
                if (isFYFiltered)
                {
                    fdFilter += (string.IsNullOrEmpty(fdFilter) ? " WHERE" : " AND") + $" (FYId IN ({fyIdInClause}) OR FYId IS NULL)";
                }
                package.Data.SocFixedDeposit = ReadTable(conn, $"SELECT * FROM {prefix}SocFixedDeposit{fdFilter}");

                // 14. SocMemberTransfer
                package.Data.SocMemberTransfer = ReadTable(conn, $"SELECT * FROM {prefix}SocMemberTransfer{socFilter}");

                // Record counts in metadata
                package.Metadata.RecordCounts = new Dictionary<string, int>
                {
                    ["SocietyInfo"] = package.Data.SocietyInfo.Count,
                    ["FinancialYear"] = package.Data.FinancialYear.Count,
                    ["TxNumberConfig"] = package.Data.TxNumberConfig.Count,
                    ["SocGroup"] = package.Data.SocGroup.Count,
                    ["SocAccount"] = package.Data.SocAccount.Count,
                    ["SocMember"] = package.Data.SocMember.Count,
                    ["SocVendor"] = package.Data.SocVendor.Count,
                    ["SocStaff"] = package.Data.SocStaff.Count,
                    ["SocCommittee"] = package.Data.SocCommittee.Count,
                    ["SocBillType"] = package.Data.SocBillType.Count,
                    ["SocBillingMatrix"] = package.Data.SocBillingMatrix.Count,
                    ["SocBillingSetting"] = package.Data.SocBillingSetting.Count,
                    ["SocOpeningBankReco"] = package.Data.SocOpeningBankReco.Count,
                    ["SocVoucherHeader"] = package.Data.SocVoucherHeader.Count,
                    ["SocVoucherDetail"] = package.Data.SocVoucherDetail.Count,
                    ["SocMemberBill"] = package.Data.SocMemberBill.Count,
                    ["SocMemberBillItem"] = package.Data.SocMemberBillItem.Count,
                    ["SocMemberNote"] = package.Data.SocMemberNote.Count,
                    ["SocOpeningBalance"] = package.Data.SocOpeningBalance.Count,
                    ["SocFixedDeposit"] = package.Data.SocFixedDeposit.Count,
                    ["SocMemberTransfer"] = package.Data.SocMemberTransfer.Count
                };

                // Compute Deterministic SHA256 Canonical Checksum
                package.Metadata.ChecksumSha256 = ComputeCanonicalChecksum(package.Data);

                return package;
            }
            finally
            {
                if (isClosed) conn.Close();
            }
        }

        private static List<Dictionary<string, object?>> ReadTable(IDbConnection conn, string sql)
        {
            var list = new List<Dictionary<string, object?>>();
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = sql;
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        var colName = reader.GetName(i);
                        if (SensitiveColumns.Contains(colName)) continue; // Strip sensitive fields

                        var val = reader.GetValue(i);
                        if (val == DBNull.Value)
                        {
                            row[colName] = null;
                        }
                        else if (val is DateTime dt)
                        {
                            row[colName] = dt.ToString("yyyy-MM-ddTHH:mm:ssZ");
                        }
                        else if (val is byte[] bytes)
                        {
                            row[colName] = Convert.ToBase64String(bytes);
                        }
                        else
                        {
                            row[colName] = val;
                        }
                    }
                    list.Add(row);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DatabaseExportService] Note on query '{sql}': {ex.Message}");
            }
            return list;
        }

        public static string ComputeSha256(string raw)
        {
            using var sha = SHA256.Create();
            var hashBytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
            return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
        }

        public static string ComputeSha256(ExportDataPayload data)
        {
            return ComputeCanonicalChecksum(data);
        }

        public static string ComputeCanonicalChecksum(ExportDataPayload data)
        {
            // Normalize payload to sorted JSON representation for deterministic hashing
            var sortedDict = new SortedDictionary<string, object>();

            void AddTable(string name, List<Dictionary<string, object?>> rows)
            {
                var normRows = new List<SortedDictionary<string, object?>>();
                foreach (var r in rows)
                {
                    var sortedRow = new SortedDictionary<string, object?>(StringComparer.Ordinal);
                    foreach (var kvp in r)
                    {
                        if (SensitiveColumns.Contains(kvp.Key)) continue;

                        if (kvp.Value is JsonElement je)
                        {
                            sortedRow[kvp.Key] = NormalizeJsonElement(je);
                        }
                        else if (kvp.Value is double or float or decimal)
                        {
                            sortedRow[kvp.Key] = Convert.ToDecimal(kvp.Value).ToString("F2");
                        }
                        else
                        {
                            sortedRow[kvp.Key] = kvp.Value?.ToString();
                        }
                    }
                    normRows.Add(sortedRow);
                }
                sortedDict[name] = normRows;
            }

            AddTable("1_SocietyInfo", data.SocietyInfo);
            AddTable("2_FinancialYear", data.FinancialYear);
            AddTable("3_TxNumberConfig", data.TxNumberConfig);
            AddTable("4_SocGroup", data.SocGroup);
            AddTable("5_SocAccount", data.SocAccount);
            AddTable("6_SocMember", data.SocMember);
            AddTable("7_SocVendor", data.SocVendor);
            AddTable("8_SocStaff", data.SocStaff);
            AddTable("9_SocCommittee", data.SocCommittee);
            AddTable("A_SocBillType", data.SocBillType);
            AddTable("B_SocBillingMatrix", data.SocBillingMatrix);
            AddTable("C_SocBillingSetting", data.SocBillingSetting);
            AddTable("D_SocOpeningBankReco", data.SocOpeningBankReco);
            AddTable("E_SocVoucherHeader", data.SocVoucherHeader);
            AddTable("F_SocVoucherDetail", data.SocVoucherDetail);
            AddTable("G_SocMemberBill", data.SocMemberBill);
            AddTable("H_SocMemberBillItem", data.SocMemberBillItem);
            AddTable("I_SocMemberNote", data.SocMemberNote);
            AddTable("J_SocOpeningBalance", data.SocOpeningBalance);
            AddTable("K_SocFixedDeposit", data.SocFixedDeposit);
            AddTable("L_SocMemberTransfer", data.SocMemberTransfer);

            var options = new JsonSerializerOptions { WriteIndented = false };
            var json = JsonSerializer.Serialize(sortedDict, options);

            using var sha = SHA256.Create();
            var hashBytes = sha.ComputeHash(Encoding.UTF8.GetBytes(json));
            return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
        }

        private static object? NormalizeJsonElement(JsonElement el)
        {
            switch (el.ValueKind)
            {
                case JsonValueKind.Null:
                case JsonValueKind.Undefined:
                    return null;
                case JsonValueKind.True:
                    return "true";
                case JsonValueKind.False:
                    return "false";
                case JsonValueKind.Number:
                    if (el.TryGetDecimal(out var dec)) return dec.ToString("F2");
                    return el.GetRawText();
                default:
                    return el.GetString();
            }
        }
    }
}
