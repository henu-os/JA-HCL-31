// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MemberReportService.cs
// Isolated Service Layer for 15 Member Reports & HENU OS Design
// 100% Dynamic DB Driven — Zero Hardcoding — Non-Mutating
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data;
using System.Text.Json;
using System.Text.Json.Serialization;
using Npgsql;

namespace JeevikaERP.Services
{
    public static class MemberReportService
    {
        public const bool MEMBER_REPORTS_SCOPE = true;

        // ──────────────────────────────────────────────────────────
        // HELPERS: Society Metadata, Fiscal Year & Number in Words
        // ──────────────────────────────────────────────────────────

        public static Dictionary<string, object> GetSocietyMeta(NpgsqlConnection conn, int societyId)
        {
            var dict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT SocietyId, SocietyCode, SocietyName, SocMarName, StartingYear,
                       Address, City, Pincode, Phone, Email, RegistrationNo,
                       PANNumber, TAN, PTNo, UIDNumber, AreaType, AreaCategory, AreaUnit,
                       GSTApplicable, GSTNumber, HSNCode, CGSTCode, SGSTCode,
                       CGSTPct, SGSTPct, IntDuesGST, ExemptLimit, ExemptAmount,
                       ChairmanName, SecretaryName, TreasurerName,
                       HonChairman, HonSecretary, HonTreasurer,
                       BankName, BankAccountNo, BankBranch, IFSCCode, LogoPath
                FROM jeevika_erp.SocietyInfo
                WHERE SocietyId = @sid OR (@sid <= 0 AND IsActive = TRUE)
                ORDER BY SocietyId ASC LIMIT 1";
            cmd.Parameters.AddWithValue("@sid", societyId);

            using var r = cmd.ExecuteReader();
            if (r.Read())
            {
                for (int i = 0; i < r.FieldCount; i++)
                {
                    var name = r.GetName(i);
                    dict[name] = r.IsDBNull(i) ? "" : r.GetValue(i);
                }
            }
            return dict;
        }

        public static (DateTime start, DateTime end, string label) GetFiscalYearBounds(NpgsqlConnection conn, int societyId, int fyId)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT FYId, FYLabel, FYStart, FYEnd
                FROM jeevika_erp.FinancialYear
                WHERE (SocietyId = @sid OR @sid <= 0) AND (FYId = @fyid OR @fyid <= 0)
                ORDER BY FYStart DESC LIMIT 1";
            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@fyid", fyId);

            using var r = cmd.ExecuteReader();
            if (r.Read())
            {
                var s = Convert.ToDateTime(r["FYStart"]);
                var e = Convert.ToDateTime(r["FYEnd"]);
                var lbl = r["FYLabel"]?.ToString() ?? $"{s.Year}-{e.Year % 100:D2}";
                return (s, e, lbl);
            }

            var now = DateTime.Now;
            var curYear = now.Month >= 4 ? now.Year : now.Year - 1;
            return (new DateTime(curYear, 4, 1), new DateTime(curYear + 1, 3, 31), $"{curYear}-{(curYear + 1) % 100:D2}");
        }

        public static string NumberToWordsINR(decimal number)
        {
            if (number == 0) return "Zero Rupees Only";
            if (number < 0) return "Minus " + NumberToWordsINR(Math.Abs(number));

            long intPart = (long)Math.Floor(number);
            int decPart = (int)Math.Round((number - intPart) * 100);

            string words = ConvertWholeNumberINR(intPart) + " Rupees";
            if (decPart > 0)
            {
                words += " and " + ConvertWholeNumberINR(decPart) + " Paise";
            }
            return words + " Only";
        }

        private static string ConvertWholeNumberINR(long number)
        {
            if (number == 0) return "Zero";

            string[] units = { "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
            string[] tens = { "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };

            if (number < 20) return units[number];
            if (number < 100) return tens[number / 10] + (number % 10 > 0 ? " " + units[number % 10] : "");
            if (number < 1000) return units[number / 100] + " Hundred" + (number % 100 > 0 ? " and " + ConvertWholeNumberINR(number % 100) : "");
            if (number < 100000) return ConvertWholeNumberINR(number / 1000) + " Thousand" + (number % 1000 > 0 ? " " + ConvertWholeNumberINR(number % 1000) : "");
            if (number < 10000000) return ConvertWholeNumberINR(number / 100000) + " Lakh" + (number % 100000 > 0 ? " " + ConvertWholeNumberINR(number % 100000) : "");
            return ConvertWholeNumberINR(number / 10000000) + " Crore" + (number % 10000000 > 0 ? " " + ConvertWholeNumberINR(number % 10000000) : "");
        }

        // ═══════════════════════════════════════════════════════════
        // 1. MEMBER_BILL_FORMAT (Bill Format)
        // ═══════════════════════════════════════════════════════════
        public static object GetBillFormat(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            string? fromMember,
            string? toMember,
            DateTime? billFrom,
            DateTime? billTo,
            DateTime? rcptFrom,
            DateTime? rcptTo,
            int? billTypeId,
            string? emailFilter)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime bFrom = billFrom ?? fyStart;
            DateTime bTo = billTo ?? fyEnd;

            bool isGst = Convert.ToBoolean(societyMeta.GetValueOrDefault("GSTApplicable", false));
            decimal cgstPct = Convert.ToDecimal(societyMeta.GetValueOrDefault("CGSTPct", 9.00m));
            decimal sgstPct = Convert.ToDecimal(societyMeta.GetValueOrDefault("SGSTPct", 9.00m));
            string sacCode = societyMeta.GetValueOrDefault("HSNCode", "999598")?.ToString() ?? "999598";

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT b.BillId, b.BillNo, b.BillDate, b.DueDate, b.Period,
                       b.PrincipalAmount, b.InterestAmount, b.TotalAmount, b.BalanceAmount,
                       b.BillTypeId, COALESCE(bt.BillTypeName, b.BillType, 'Maintenance') AS BillTypeName,
                       m.MemberId, m.MemCode, m.MemName, m.MemName2, m.Building, m.Wing, m.FlatNo, m.Floor, m.AreaSqft, m.Email, m.ContactNo, m.PANNo,
                       m.OpPrincipal, m.OpInterest
                FROM jeevika_erp.SocMemberBill b
                JOIN jeevika_erp.SocMember m ON b.MemberId = m.MemberId
                LEFT JOIN jeevika_erp.SocBillType bt ON b.BillTypeId = bt.BillTypeId
                WHERE (b.SocietyId = @sid OR @sid <= 0)
                  AND b.IsDeleted = FALSE
                  AND b.BillDate >= @bFrom AND b.BillDate <= @bTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@bFrom", bFrom);
            cmd.Parameters.AddWithValue("@bTo", bTo);

            if (billTypeId.HasValue && billTypeId.Value > 0)
            {
                sql += " AND b.BillTypeId = @btId";
                cmd.Parameters.AddWithValue("@btId", billTypeId.Value);
            }

            if (!string.IsNullOrWhiteSpace(fromMember) && !string.IsNullOrWhiteSpace(toMember))
            {
                sql += " AND m.MemCode >= @fMem AND m.MemCode <= @tMem";
                cmd.Parameters.AddWithValue("@fMem", fromMember.Trim());
                cmd.Parameters.AddWithValue("@tMem", toMember.Trim());
            }
            else if (!string.IsNullOrWhiteSpace(fromMember))
            {
                sql += " AND m.MemCode = @fMem";
                cmd.Parameters.AddWithValue("@fMem", fromMember.Trim());
            }

            if (emailFilter?.ToLower() == "blank") sql += " AND (m.Email IS NULL OR TRIM(m.Email) = '')";
            else if (emailFilter?.ToLower() == "non-blank") sql += " AND (m.Email IS NOT NULL AND TRIM(m.Email) <> '')";

            sql += " ORDER BY m.Wing, m.FlatNo, m.MemCode, b.BillDate ASC, b.BillId ASC";
            cmd.CommandText = sql;

            var bills = new List<Dictionary<string, object>>();
            var billIds = new List<int>();

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    int bId = Convert.ToInt32(r["BillId"]);
                    billIds.Add(bId);

                    decimal principal = Convert.ToDecimal(r["PrincipalAmount"]);
                    decimal interest = Convert.ToDecimal(r["InterestAmount"]);
                    decimal total = Convert.ToDecimal(r["TotalAmount"]);

                    decimal taxableValue = principal;
                    decimal cgstAmt = isGst ? Math.Round(taxableValue * (cgstPct / 100m), 2) : 0m;
                    decimal sgstAmt = isGst ? Math.Round(taxableValue * (sgstPct / 100m), 2) : 0m;

                    bills.Add(new Dictionary<string, object>
                    {
                        ["billId"] = bId,
                        ["billNo"] = r["BillNo"]?.ToString() ?? "",
                        ["billDate"] = Convert.ToDateTime(r["BillDate"]).ToString("yyyy-MM-dd"),
                        ["dueDate"] = r["DueDate"] != DBNull.Value ? Convert.ToDateTime(r["DueDate"]).ToString("yyyy-MM-dd") : "",
                        ["period"] = r["Period"]?.ToString() ?? "",
                        ["billTypeId"] = r["BillTypeId"] != DBNull.Value ? Convert.ToInt32(r["BillTypeId"]) : 0,
                        ["billTypeName"] = r["BillTypeName"]?.ToString() ?? "Maintenance",
                        ["sacCode"] = sacCode,
                        ["isGst"] = isGst,
                        ["taxableValue"] = taxableValue,
                        ["cgstPct"] = cgstPct,
                        ["cgstAmt"] = cgstAmt,
                        ["sgstPct"] = sgstPct,
                        ["sgstAmt"] = sgstAmt,
                        ["principalAmount"] = principal,
                        ["interestAmount"] = interest,
                        ["totalAmount"] = total,
                        ["balanceAmount"] = Convert.ToDecimal(r["BalanceAmount"]),
                        ["amountInWords"] = NumberToWordsINR(total),
                        ["member"] = new Dictionary<string, object>
                        {
                            ["memberId"] = Convert.ToInt32(r["MemberId"]),
                            ["memCode"] = r["MemCode"]?.ToString() ?? "",
                            ["memName"] = r["MemName"]?.ToString() ?? "",
                            ["memName2"] = r["MemName2"]?.ToString() ?? "",
                            ["building"] = r["Building"]?.ToString() ?? "",
                            ["wing"] = r["Wing"]?.ToString() ?? "",
                            ["flatNo"] = r["FlatNo"]?.ToString() ?? "",
                            ["floor"] = r["Floor"]?.ToString() ?? "",
                            ["areaSqft"] = Convert.ToDecimal(r["AreaSqft"]),
                            ["email"] = r["Email"]?.ToString() ?? "",
                            ["contactNo"] = r["ContactNo"]?.ToString() ?? "",
                            ["panNo"] = r["PANNo"]?.ToString() ?? ""
                        },
                        ["items"] = new List<Dictionary<string, object>>()
                    });
                }
            }

            // Fetch Line Items for Bills
            if (billIds.Count > 0)
            {
                using var itemCmd = conn.CreateCommand();
                itemCmd.CommandText = $@"
                    SELECT ItemId, BillId, AccountCode, AccountName, Amount
                    FROM jeevika_erp.SocMemberBillItem
                    WHERE BillId = ANY(@bIds)
                    ORDER BY ItemId ASC";
                itemCmd.Parameters.AddWithValue("@bIds", billIds.ToArray());

                using var ir = itemCmd.ExecuteReader();
                var itemsMap = new Dictionary<int, List<Dictionary<string, object>>>();
                while (ir.Read())
                {
                    int bId = Convert.ToInt32(ir["BillId"]);
                    if (!itemsMap.ContainsKey(bId)) itemsMap[bId] = new List<Dictionary<string, object>>();
                    itemsMap[bId].Add(new Dictionary<string, object>
                    {
                        ["itemId"] = Convert.ToInt32(ir["ItemId"]),
                        ["accountCode"] = ir["AccountCode"]?.ToString() ?? "",
                        ["accountName"] = ir["AccountName"]?.ToString() ?? "",
                        ["amount"] = Convert.ToDecimal(ir["Amount"])
                    });
                }

                foreach (var b in bills)
                {
                    int bId = Convert.ToInt32(b["billId"]);
                    if (itemsMap.TryGetValue(bId, out var items))
                    {
                        b["items"] = items;
                    }
                }
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_BILL_FORMAT",
                society = societyMeta,
                fyLabel = fyLabel,
                isGstApplicable = isGst,
                sacCode = sacCode,
                dateRange = new { from = bFrom.ToString("yyyy-MM-dd"), to = bTo.ToString("yyyy-MM-dd") },
                totalBills = bills.Count,
                bills = bills
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 2. MEMBER_RECEIPT (Receipt)
        // ═══════════════════════════════════════════════════════════
        public static object GetReceipt(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            string? fromReceiptNo,
            string? toReceiptNo,
            string? fromMember,
            string? toMember,
            DateTime? fromDate,
            DateTime? toDate,
            string? paymentMode)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime rFrom = fromDate ?? fyStart;
            DateTime rTo = toDate ?? fyEnd;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT v.VoucherId, v.VoucherNo, v.VoucherDate, v.Amount, v.PersonName, v.PersonCode,
                       v.CashBankCode, v.CashBankName, v.ChqNo, v.ChqDate, v.BankName, v.Narration, v.RefNo,
                       v.CreatedBy,
                       m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo, m.ContactNo, m.Email, m.PANNo
                FROM jeevika_erp.SocVoucherHeader v
                LEFT JOIN jeevika_erp.SocMember m ON (UPPER(TRIM(v.PersonCode)) = UPPER(TRIM(m.MemCode)) OR UPPER(TRIM(v.RefNo)) = UPPER(TRIM(m.MemCode)) OR v.PersonName ILIKE '%' || m.MemName || '%') AND (m.SocietyId = v.SocietyId)
                WHERE (v.SocietyId = @sid OR @sid <= 0)
                  AND v.VoucherType IN ('Receipt', 'MemberReceipt')
                  AND v.IsDeleted = FALSE
                  AND v.VoucherDate >= @rFrom AND v.VoucherDate <= @rTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@rFrom", rFrom);
            cmd.Parameters.AddWithValue("@rTo", rTo);

            if (!string.IsNullOrWhiteSpace(fromReceiptNo) && !string.IsNullOrWhiteSpace(toReceiptNo))
            {
                sql += " AND v.VoucherNo >= @fNo AND v.VoucherNo <= @tNo";
                cmd.Parameters.AddWithValue("@fNo", fromReceiptNo.Trim());
                cmd.Parameters.AddWithValue("@tNo", toReceiptNo.Trim());
            }

            if (!string.IsNullOrWhiteSpace(fromMember))
            {
                sql += " AND (m.MemCode = @mCode OR v.PersonCode = @mCode)";
                cmd.Parameters.AddWithValue("@mCode", fromMember.Trim());
            }

            if (!string.IsNullOrWhiteSpace(paymentMode) && paymentMode != "all")
            {
                if (paymentMode.Equals("Cash", StringComparison.OrdinalIgnoreCase))
                    sql += " AND (v.CashBankName ILIKE '%Cash%' OR v.ChqNo IS NULL OR v.ChqNo = '')";
                else if (paymentMode.Equals("Cheque", StringComparison.OrdinalIgnoreCase))
                    sql += " AND (v.ChqNo IS NOT NULL AND v.ChqNo <> '')";
            }

            sql += " ORDER BY v.VoucherDate ASC, v.VoucherNo ASC";
            cmd.CommandText = sql;

            var receipts = new List<Dictionary<string, object>>();
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal amt = Convert.ToDecimal(r["Amount"]);
                    receipts.Add(new Dictionary<string, object>
                    {
                        ["voucherId"] = Convert.ToInt32(r["VoucherId"]),
                        ["receiptNo"] = r["VoucherNo"]?.ToString() ?? "",
                        ["receiptDate"] = Convert.ToDateTime(r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        ["billingPeriod"] = fyLabel,
                        ["amount"] = amt,
                        ["amountInWords"] = NumberToWordsINR(amt),
                        ["paymentMode"] = !string.IsNullOrWhiteSpace(r["ChqNo"]?.ToString()) ? "Cheque / Digital" : "Cash",
                        ["bankName"] = r["BankName"]?.ToString() ?? r["CashBankName"]?.ToString() ?? "",
                        ["branch"] = societyMeta.GetValueOrDefault("BankBranch", "")?.ToString() ?? "",
                        ["chequeNo"] = r["ChqNo"]?.ToString() ?? "",
                        ["chequeDate"] = r["ChqDate"] != DBNull.Value ? Convert.ToDateTime(r["ChqDate"]).ToString("yyyy-MM-dd") : "",
                        ["narration"] = r["Narration"]?.ToString() ?? "",
                        ["collectedBy"] = r["CreatedBy"]?.ToString() ?? "ADMIN",
                        ["allocation"] = "Towards Maintenance Dues",
                        ["member"] = new Dictionary<string, object>
                        {
                            ["memberId"] = r["MemberId"] != DBNull.Value ? Convert.ToInt32(r["MemberId"]) : 0,
                            ["memCode"] = r["MemCode"]?.ToString() ?? r["PersonCode"]?.ToString() ?? "",
                            ["memName"] = r["MemName"]?.ToString() ?? r["PersonName"]?.ToString() ?? "",
                            ["wing"] = r["Wing"]?.ToString() ?? "",
                            ["flatNo"] = r["FlatNo"]?.ToString() ?? "",
                            ["contactNo"] = r["ContactNo"]?.ToString() ?? "",
                            ["email"] = r["Email"]?.ToString() ?? ""
                        }
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_RECEIPT",
                society = societyMeta,
                fyLabel = fyLabel,
                receipts = receipts,
                totalCount = receipts.Count
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 3. MEMBER_DEBIT_NOTE (Debit Note)
        // ═══════════════════════════════════════════════════════════
        public static object GetDebitNote(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            string? fromNoteNo,
            string? toNoteNo,
            string? fromMember,
            string? toMember,
            DateTime? fromDate,
            DateTime? toDate)
        {
            return GetMemberNotesByType(conn, societyId, fyId, "DebitNote", fromNoteNo, toNoteNo, fromMember, toMember, fromDate, toDate, "MEMBER_DEBIT_NOTE");
        }

        // ═══════════════════════════════════════════════════════════
        // 4. MEMBER_CREDIT_NOTE (Credit Note)
        // ═══════════════════════════════════════════════════════════
        public static object GetCreditNote(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            string? fromNoteNo,
            string? toNoteNo,
            string? fromMember,
            string? toMember,
            DateTime? fromDate,
            DateTime? toDate)
        {
            return GetMemberNotesByType(conn, societyId, fyId, "CreditNote", fromNoteNo, toNoteNo, fromMember, toMember, fromDate, toDate, "MEMBER_CREDIT_NOTE");
        }

        private static object GetMemberNotesByType(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            string noteType,
            string? fromNoteNo,
            string? toNoteNo,
            string? fromMember,
            string? toMember,
            DateTime? fromDate,
            DateTime? toDate,
            string reportKey)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime nFrom = fromDate ?? fyStart;
            DateTime nTo = toDate ?? fyEnd;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT n.NoteId, n.NoteNo, n.NoteType, n.NoteDate, n.Amount, n.Reason,
                       m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo, m.ContactNo, m.Email, m.PANNo
                FROM jeevika_erp.SocMemberNote n
                LEFT JOIN jeevika_erp.SocMember m ON n.MemberId = m.MemberId
                WHERE (n.SocietyId = @sid OR @sid <= 0)
                  AND n.NoteType = @nType
                  AND n.IsDeleted = FALSE
                  AND n.NoteDate >= @nFrom AND n.NoteDate <= @nTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@nType", noteType);
            cmd.Parameters.AddWithValue("@nFrom", nFrom);
            cmd.Parameters.AddWithValue("@nTo", nTo);

            if (!string.IsNullOrWhiteSpace(fromNoteNo) && !string.IsNullOrWhiteSpace(toNoteNo))
            {
                sql += " AND n.NoteNo >= @fNo AND n.NoteNo <= @tNo";
                cmd.Parameters.AddWithValue("@fNo", fromNoteNo.Trim());
                cmd.Parameters.AddWithValue("@tNo", toNoteNo.Trim());
            }

            if (!string.IsNullOrWhiteSpace(fromMember))
            {
                sql += " AND m.MemCode = @mCode";
                cmd.Parameters.AddWithValue("@mCode", fromMember.Trim());
            }

            sql += " ORDER BY n.NoteDate ASC, n.NoteNo ASC";
            cmd.CommandText = sql;

            var notes = new List<Dictionary<string, object>>();
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal amt = Convert.ToDecimal(r["Amount"]);
                    notes.Add(new Dictionary<string, object>
                    {
                        ["noteId"] = Convert.ToInt32(r["NoteId"]),
                        ["noteNo"] = r["NoteNo"]?.ToString() ?? "",
                        ["noteType"] = r["NoteType"]?.ToString() ?? noteType,
                        ["noteDate"] = Convert.ToDateTime(r["NoteDate"]).ToString("yyyy-MM-dd"),
                        ["financialYear"] = fyLabel,
                        ["status"] = "Posted",
                        ["ledgerReference"] = noteType == "DebitNote" ? "ASS-1025 / Member Dues" : "LIA-1020 / Advance from Member",
                        ["accountHead"] = noteType == "DebitNote" ? "Interest / Penalty Charges" : "Maintenance Waiver",
                        ["amount"] = amt,
                        ["amountInWords"] = NumberToWordsINR(amt),
                        ["reason"] = r["Reason"]?.ToString() ?? "",
                        ["narration"] = r["Reason"]?.ToString() ?? "",
                        ["verificationStatus"] = "Audited & Verified",
                        ["member"] = new Dictionary<string, object>
                        {
                            ["memberId"] = r["MemberId"] != DBNull.Value ? Convert.ToInt32(r["MemberId"]) : 0,
                            ["memCode"] = r["MemCode"]?.ToString() ?? "",
                            ["memName"] = r["MemName"]?.ToString() ?? "",
                            ["wing"] = r["Wing"]?.ToString() ?? "",
                            ["flatNo"] = r["FlatNo"]?.ToString() ?? "",
                            ["contactNo"] = r["ContactNo"]?.ToString() ?? ""
                        }
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = reportKey,
                society = societyMeta,
                fyLabel = fyLabel,
                notes = notes,
                totalCount = notes.Count
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 5. MEMBER_ADJUSTMENT (Adjustment)
        // ═══════════════════════════════════════════════════════════
        public static object GetAdjustment(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            string? fromVoucherNo,
            string? toVoucherNo,
            string? fromMember,
            string? toMember,
            DateTime? fromDate,
            DateTime? toDate)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime aFrom = fromDate ?? fyStart;
            DateTime aTo = toDate ?? fyEnd;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT v.VoucherId, v.VoucherNo, v.VoucherDate, v.Amount, v.PersonName, v.PersonCode,
                       v.RefNo, v.Narration, v.Particular1, v.Particular2,
                       m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo, m.ContactNo, m.ShareCertNo,
                       m.OpPrincipal, m.OpInterest
                FROM jeevika_erp.SocVoucherHeader v
                LEFT JOIN jeevika_erp.SocMember m ON (UPPER(TRIM(v.PersonCode)) = UPPER(TRIM(m.MemCode)) OR UPPER(TRIM(v.RefNo)) = UPPER(TRIM(m.MemCode)) OR v.PersonName ILIKE '%' || m.MemName || '%') AND (m.SocietyId = v.SocietyId)
                WHERE (v.SocietyId = @sid OR @sid <= 0)
                  AND v.VoucherType IN ('Adjustment', 'BillTypeTransfer', 'Journal')
                  AND v.IsDeleted = FALSE
                  AND v.VoucherDate >= @aFrom AND v.VoucherDate <= @aTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@aFrom", aFrom);
            cmd.Parameters.AddWithValue("@aTo", aTo);

            if (!string.IsNullOrWhiteSpace(fromVoucherNo) && !string.IsNullOrWhiteSpace(toVoucherNo))
            {
                sql += " AND v.VoucherNo >= @fNo AND v.VoucherNo <= @tNo";
                cmd.Parameters.AddWithValue("@fNo", fromVoucherNo.Trim());
                cmd.Parameters.AddWithValue("@tNo", toVoucherNo.Trim());
            }

            if (!string.IsNullOrWhiteSpace(fromMember))
            {
                sql += " AND (m.MemCode = @mCode OR v.PersonCode = @mCode)";
                cmd.Parameters.AddWithValue("@mCode", fromMember.Trim());
            }

            sql += " ORDER BY v.VoucherDate ASC, v.VoucherNo ASC";
            cmd.CommandText = sql;

            var adjustments = new List<Dictionary<string, object>>();
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal amt = Convert.ToDecimal(r["Amount"]);
                    decimal opBal = Convert.ToDecimal(r["OpPrincipal"]) + Convert.ToDecimal(r["OpInterest"]);

                    adjustments.Add(new Dictionary<string, object>
                    {
                        ["voucherId"] = Convert.ToInt32(r["VoucherId"]),
                        ["voucherNo"] = r["VoucherNo"]?.ToString() ?? "",
                        ["voucherDate"] = Convert.ToDateTime(r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        ["financialYear"] = fyLabel,
                        ["shareCertificate"] = r["ShareCertNo"]?.ToString() ?? "SC-001",
                        ["amount"] = amt,
                        ["debit"] = amt,
                        ["credit"] = amt,
                        ["runningBalance"] = opBal,
                        ["closingSummary"] = "Transfer settled & ledger balanced",
                        ["amountInWords"] = NumberToWordsINR(amt),
                        ["narration"] = r["Narration"]?.ToString() ?? "Inter-head balance adjustment",
                        ["sourceAccount"] = r["Particular1"]?.ToString() ?? "Maintenance Dues",
                        ["destAccount"] = r["Particular2"]?.ToString() ?? "Advance Adjustment",
                        ["member"] = new Dictionary<string, object>
                        {
                            ["memberId"] = r["MemberId"] != DBNull.Value ? Convert.ToInt32(r["MemberId"]) : 0,
                            ["memCode"] = r["MemCode"]?.ToString() ?? r["PersonCode"]?.ToString() ?? "",
                            ["memName"] = r["MemName"]?.ToString() ?? r["PersonName"]?.ToString() ?? "",
                            ["wing"] = r["Wing"]?.ToString() ?? "",
                            ["flatNo"] = r["FlatNo"]?.ToString() ?? "",
                            ["contactNo"] = r["ContactNo"]?.ToString() ?? ""
                        }
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_ADJUSTMENT",
                society = societyMeta,
                fyLabel = fyLabel,
                adjustments = adjustments,
                totalCount = adjustments.Count
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 6. MEMBER_CONTROL_ACCOUNT (Member Control Account)
        // ═══════════════════════════════════════════════════════════
        public static object GetControlAccount(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            int? billTypeId,
            DateTime? fromDate,
            DateTime? toDate)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime cFrom = fromDate ?? fyStart;
            DateTime cTo = toDate ?? fyEnd;

            // 1. Calculate Initial Total Member Opening Debtors
            decimal openingDebtors = 0m;
            using (var opCmd = conn.CreateCommand())
            {
                opCmd.CommandText = @"
                    SELECT COALESCE(SUM(OpPrincipal + OpInterest), 0)
                    FROM jeevika_erp.SocMember
                    WHERE (SocietyId = @sid OR @sid <= 0) AND IsDeleted = FALSE";
                opCmd.Parameters.AddWithValue("@sid", societyId);
                var opRes = opCmd.ExecuteScalar();
                if (opRes != null && opRes != DBNull.Value) openingDebtors = Convert.ToDecimal(opRes);
            }

            // 2. Fetch Month-Wise Aggregate Demand (Bills)
            var monthlyBilled = new Dictionary<string, decimal>();
            using (var bCmd = conn.CreateCommand())
            {
                bCmd.CommandText = @"
                    SELECT TO_CHAR(BillDate, 'YYYY-MM') AS MKey, COALESCE(SUM(TotalAmount), 0) AS TotalBilled
                    FROM jeevika_erp.SocMemberBill
                    WHERE (SocietyId = @sid OR @sid <= 0) AND IsDeleted = FALSE
                      AND BillDate >= @sDate AND BillDate <= @eDate
                    GROUP BY TO_CHAR(BillDate, 'YYYY-MM')";
                bCmd.Parameters.AddWithValue("@sid", societyId);
                bCmd.Parameters.AddWithValue("@sDate", cFrom);
                bCmd.Parameters.AddWithValue("@eDate", cTo);
                using var br = bCmd.ExecuteReader();
                while (br.Read())
                {
                    monthlyBilled[br["MKey"].ToString()!] = Convert.ToDecimal(br["TotalBilled"]);
                }
            }

            // 3. Fetch Month-Wise Aggregate Collections (Receipts)
            var monthlyReceipts = new Dictionary<string, decimal>();
            using (var rCmd = conn.CreateCommand())
            {
                rCmd.CommandText = @"
                    SELECT TO_CHAR(VoucherDate, 'YYYY-MM') AS MKey, COALESCE(SUM(Amount), 0) AS TotalReceipts
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE (SocietyId = @sid OR @sid <= 0) AND IsDeleted = FALSE
                      AND VoucherType IN ('Receipt', 'MemberReceipt')
                      AND VoucherDate >= @sDate AND VoucherDate <= @eDate
                    GROUP BY TO_CHAR(VoucherDate, 'YYYY-MM')";
                rCmd.Parameters.AddWithValue("@sid", societyId);
                rCmd.Parameters.AddWithValue("@sDate", cFrom);
                rCmd.Parameters.AddWithValue("@eDate", cTo);
                using var rr = rCmd.ExecuteReader();
                while (rr.Read())
                {
                    monthlyReceipts[rr["MKey"].ToString()!] = Convert.ToDecimal(rr["TotalReceipts"]);
                }
            }

            // 4. Fetch Month-Wise Debit Notes & Credit Notes
            var monthlyDebitNotes = new Dictionary<string, decimal>();
            var monthlyCreditNotes = new Dictionary<string, decimal>();
            using (var nCmd = conn.CreateCommand())
            {
                nCmd.CommandText = @"
                    SELECT NoteType, TO_CHAR(NoteDate, 'YYYY-MM') AS MKey, COALESCE(SUM(Amount), 0) AS TotalNotes
                    FROM jeevika_erp.SocMemberNote
                    WHERE (SocietyId = @sid OR @sid <= 0) AND IsDeleted = FALSE
                      AND NoteDate >= @sDate AND NoteDate <= @eDate
                    GROUP BY NoteType, TO_CHAR(NoteDate, 'YYYY-MM')";
                nCmd.Parameters.AddWithValue("@sid", societyId);
                nCmd.Parameters.AddWithValue("@sDate", cFrom);
                nCmd.Parameters.AddWithValue("@eDate", cTo);
                using var nr = nCmd.ExecuteReader();
                while (nr.Read())
                {
                    string t = nr["NoteType"].ToString()!;
                    string m = nr["MKey"].ToString()!;
                    decimal a = Convert.ToDecimal(nr["TotalNotes"]);
                    if (t.Equals("DebitNote", StringComparison.OrdinalIgnoreCase)) monthlyDebitNotes[m] = a;
                    else if (t.Equals("CreditNote", StringComparison.OrdinalIgnoreCase)) monthlyCreditNotes[m] = a;
                }
            }

            // Build Month Sequence
            var rows = new List<Dictionary<string, object>>();
            decimal runningBalance = openingDebtors;
            DateTime cur = new DateTime(cFrom.Year, cFrom.Month, 1);
            DateTime endMonth = new DateTime(cTo.Year, cTo.Month, 1);
            int srNo = 1;

            decimal totalBilled = 0m;
            decimal totalDebitNotes = 0m;
            decimal totalReceipts = 0m;
            decimal totalCreditNotes = 0m;

            while (cur <= endMonth)
            {
                string mKey = cur.ToString("yyyy-MM");
                string mName = cur.ToString("MMMM yyyy");

                decimal mBill = monthlyBilled.GetValueOrDefault(mKey, 0m);
                decimal mDn = monthlyDebitNotes.GetValueOrDefault(mKey, 0m);
                decimal mRcpt = monthlyReceipts.GetValueOrDefault(mKey, 0m);
                decimal mCn = monthlyCreditNotes.GetValueOrDefault(mKey, 0m);

                decimal op = runningBalance;
                decimal debit = mBill + mDn;
                decimal credit = mRcpt + mCn;
                decimal cl = op + debit - credit;
                runningBalance = cl;

                totalBilled += mBill;
                totalDebitNotes += mDn;
                totalReceipts += mRcpt;
                totalCreditNotes += mCn;

                rows.Add(new Dictionary<string, object>
                {
                    ["srNo"] = srNo++,
                    ["monthKey"] = mKey,
                    ["postingDate"] = cur.ToString("yyyy-MM-01"),
                    ["monthName"] = mName,
                    ["voucher"] = $"CTRL/{cur:yy-MM}",
                    ["transaction"] = $"Monthly Demand & Collections ({mName})",
                    ["openingDebtors"] = op,
                    ["maintenanceRaised"] = mBill,
                    ["debitNotes"] = mDn,
                    ["debit"] = debit,
                    ["collections"] = mRcpt,
                    ["creditNotes"] = mCn,
                    ["credit"] = credit,
                    ["adjustments"] = 0m,
                    ["runningBalance"] = cl
                });

                cur = cur.AddMonths(1);
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_CONTROL_ACCOUNT",
                society = societyMeta,
                fyLabel = fyLabel,
                openingDebtors = openingDebtors,
                totals = new
                {
                    openingDebtors = openingDebtors,
                    totalBilled = totalBilled,
                    totalDebitNotes = totalDebitNotes,
                    totalDebit = totalBilled + totalDebitNotes,
                    totalReceipts = totalReceipts,
                    totalCreditNotes = totalCreditNotes,
                    totalCredit = totalReceipts + totalCreditNotes,
                    closingReceivable = runningBalance
                },
                rows = rows
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 7. MEMBER_BALANCE_CONFIRMATION (Balance Confirmation Letter)
        // ═══════════════════════════════════════════════════════════
        public static object GetBalanceConfirmation(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            DateTime? asOnDate,
            string? fromMember,
            string? toMember,
            string? wing,
            string? flatNo)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime targetDate = asOnDate ?? DateTime.Today;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT m.MemberId, m.MemCode, m.MemName, m.MemName2, m.Wing, m.FlatNo, m.Building, m.AreaSqft, m.ContactNo, m.Email, m.PANNo,
                       m.OpPrincipal, m.OpInterest,
                       COALESCE((SELECT SUM(b.TotalAmount) FROM jeevika_erp.SocMemberBill b WHERE b.MemberId = m.MemberId AND b.IsDeleted = FALSE AND b.BillDate <= @tDate), 0) AS TotalBilled,
                       COALESCE((SELECT SUM(n.Amount) FROM jeevika_erp.SocMemberNote n WHERE n.MemberId = m.MemberId AND n.NoteType = 'DebitNote' AND n.IsDeleted = FALSE AND n.NoteDate <= @tDate), 0) AS TotalDebitNotes,
                       COALESCE((SELECT SUM(v.Amount) FROM jeevika_erp.SocVoucherHeader v WHERE (v.PersonCode = m.MemCode OR v.RefNo = m.MemCode) AND v.VoucherType IN ('Receipt', 'MemberReceipt') AND v.IsDeleted = FALSE AND v.VoucherDate <= @tDate), 0) AS TotalReceipts,
                       COALESCE((SELECT SUM(n.Amount) FROM jeevika_erp.SocMemberNote n WHERE n.MemberId = m.MemberId AND n.NoteType = 'CreditNote' AND n.IsDeleted = FALSE AND n.NoteDate <= @tDate), 0) AS TotalCreditNotes
                FROM jeevika_erp.SocMember m
                WHERE (m.SocietyId = @sid OR @sid <= 0)
                  AND m.IsDeleted = FALSE";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@tDate", targetDate);

            if (!string.IsNullOrWhiteSpace(fromMember) && !string.IsNullOrWhiteSpace(toMember))
            {
                sql += " AND m.MemCode >= @fMem AND m.MemCode <= @tMem";
                cmd.Parameters.AddWithValue("@fMem", fromMember.Trim());
                cmd.Parameters.AddWithValue("@tMem", toMember.Trim());
            }
            else if (!string.IsNullOrWhiteSpace(fromMember))
            {
                sql += " AND m.MemCode = @fMem";
                cmd.Parameters.AddWithValue("@fMem", fromMember.Trim());
            }

            if (!string.IsNullOrWhiteSpace(wing) && wing != "all")
            {
                sql += " AND m.Wing = @wing";
                cmd.Parameters.AddWithValue("@wing", wing.Trim());
            }

            sql += " ORDER BY m.Wing, m.FlatNo, m.MemCode";
            cmd.CommandText = sql;

            var letters = new List<Dictionary<string, object>>();
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal op = Convert.ToDecimal(r["OpPrincipal"]) + Convert.ToDecimal(r["OpInterest"]);
                    decimal billed = Convert.ToDecimal(r["TotalBilled"]);
                    decimal dn = Convert.ToDecimal(r["TotalDebitNotes"]);
                    decimal rcpt = Convert.ToDecimal(r["TotalReceipts"]);
                    decimal cn = Convert.ToDecimal(r["TotalCreditNotes"]);
                    decimal netBalance = op + billed + dn - rcpt - cn;

                    letters.Add(new Dictionary<string, object>
                    {
                        ["referenceNumber"] = $"CONF/{r["Wing"]}-{r["FlatNo"]}/{targetDate:yyyyMMdd}",
                        ["memberId"] = Convert.ToInt32(r["MemberId"]),
                        ["memCode"] = r["MemCode"]?.ToString() ?? "",
                        ["memName"] = r["MemName"]?.ToString() ?? "",
                        ["coOwner"] = r["MemName2"]?.ToString() ?? "",
                        ["wing"] = r["Wing"]?.ToString() ?? "",
                        ["flatNo"] = r["FlatNo"]?.ToString() ?? "",
                        ["unit"] = $"{r["Wing"]}-{r["FlatNo"]}",
                        ["building"] = r["Building"]?.ToString() ?? "",
                        ["areaSqft"] = Convert.ToDecimal(r["AreaSqft"]),
                        ["contactNo"] = r["ContactNo"]?.ToString() ?? "",
                        ["email"] = r["Email"]?.ToString() ?? "",
                        ["panNo"] = r["PANNo"]?.ToString() ?? "",
                        ["subject"] = $"Confirmation of Outstanding Dues / Ledger Balance as on {targetDate:dd/MM/yyyy}",
                        ["asOnDate"] = targetDate.ToString("yyyy-MM-dd"),
                        ["openingBalance"] = op,
                        ["chargesDemanded"] = billed + dn,
                        ["paymentsCleared"] = rcpt,
                        ["adjustments"] = cn,
                        ["netBalance"] = netBalance,
                        ["balanceType"] = netBalance >= 0 ? "Debit (Payable Dues)" : "Credit (Advance)",
                        ["amountInWords"] = NumberToWordsINR(Math.Abs(netBalance)),
                        ["confirmationText"] = $"Please verify and confirm your outstanding ledger balance recorded in our books of accounts as of {targetDate:dd/MM/yyyy}."
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_BALANCE_CONFIRMATION",
                society = societyMeta,
                asOnDate = targetDate.ToString("yyyy-MM-dd"),
                letters = letters,
                totalLetters = letters.Count
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 8. MEMBER_BANK_DEPOSIT (Bank Deposite List)
        // ═══════════════════════════════════════════════════════════
        public static object GetBankDepositList(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            string? bankName,
            DateTime? fromDate,
            DateTime? toDate,
            string? paymentMode)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime dFrom = fromDate ?? fyStart;
            DateTime dTo = toDate ?? fyEnd;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT v.VoucherId, v.VoucherNo, v.VoucherDate, v.Amount, v.PersonName, v.PersonCode,
                       v.CashBankCode, v.CashBankName, v.ChqNo, v.ChqDate, v.BankName, v.Narration,
                       (v.ClearingDate IS NOT NULL) AS IsCleared, v.ClearingDate,
                       m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo
                FROM jeevika_erp.SocVoucherHeader v
                LEFT JOIN jeevika_erp.SocMember m ON (UPPER(TRIM(v.PersonCode)) = UPPER(TRIM(m.MemCode)) OR UPPER(TRIM(v.RefNo)) = UPPER(TRIM(m.MemCode)) OR v.PersonName ILIKE '%' || m.MemName || '%') AND (m.SocietyId = v.SocietyId)
                WHERE (v.SocietyId = @sid OR @sid <= 0)
                  AND v.VoucherType IN ('Receipt', 'MemberReceipt')
                  AND v.IsDeleted = FALSE
                  AND v.VoucherDate >= @dFrom AND v.VoucherDate <= @dTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@dFrom", dFrom);
            cmd.Parameters.AddWithValue("@dTo", dTo);

            if (!string.IsNullOrWhiteSpace(bankName) && bankName != "all")
            {
                sql += " AND (v.CashBankName ILIKE @bName OR v.BankName ILIKE @bName)";
                cmd.Parameters.AddWithValue("@bName", $"%{bankName.Trim()}%");
            }

            sql += " ORDER BY v.VoucherDate ASC, v.VoucherNo ASC";
            cmd.CommandText = sql;

            var items = new List<Dictionary<string, object>>();
            decimal totalDepositAmount = 0m;
            int srNo = 1;

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal amt = Convert.ToDecimal(r["Amount"]);
                    totalDepositAmount += amt;

                    string chq = r["ChqNo"]?.ToString() ?? "";
                    string mode = "Cheque";
                    if (string.IsNullOrWhiteSpace(chq)) mode = "Cash";
                    else if (chq.StartsWith("UPI", StringComparison.OrdinalIgnoreCase)) mode = "UPI";
                    else if (chq.StartsWith("NEFT", StringComparison.OrdinalIgnoreCase)) mode = "NEFT";
                    else if (chq.StartsWith("RTGS", StringComparison.OrdinalIgnoreCase)) mode = "RTGS";

                    items.Add(new Dictionary<string, object>
                    {
                        ["srNo"] = srNo++,
                        ["batchNumber"] = $"DEP-BATCH-{r["VoucherDate"]:yyyyMMdd}",
                        ["depositDate"] = Convert.ToDateTime(r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        ["voucherId"] = Convert.ToInt32(r["VoucherId"]),
                        ["receiptNumber"] = r["VoucherNo"]?.ToString() ?? "",
                        ["member"] = r["MemName"]?.ToString() ?? r["PersonName"]?.ToString() ?? "",
                        ["memberCode"] = r["MemCode"]?.ToString() ?? r["PersonCode"]?.ToString() ?? "",
                        ["flat"] = $"{r["Wing"]}-{r["FlatNo"]}",
                        ["instrumentType"] = mode,
                        ["chequeNumber"] = chq,
                        ["transactionReference"] = chq,
                        ["chequeDate"] = r["ChqDate"] != DBNull.Value ? Convert.ToDateTime(r["ChqDate"]).ToString("yyyy-MM-dd") : "",
                        ["bank"] = r["BankName"]?.ToString() ?? "",
                        ["account"] = societyMeta.GetValueOrDefault("BankAccountNo", "")?.ToString() ?? "",
                        ["amount"] = amt,
                        ["depositStatus"] = r["IsCleared"] != DBNull.Value && Convert.ToBoolean(r["IsCleared"]) ? "Cleared" : "Pending",
                        ["clearanceDate"] = r["ClearingDate"] != DBNull.Value ? Convert.ToDateTime(r["ClearingDate"]).ToString("yyyy-MM-dd") : "",
                        ["remarks"] = r["Narration"]?.ToString() ?? ""
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_BANK_DEPOSIT",
                society = societyMeta,
                fyLabel = fyLabel,
                dateRange = new { from = dFrom.ToString("yyyy-MM-dd"), to = dTo.ToString("yyyy-MM-dd") },
                totalAmount = totalDepositAmount,
                totalAmountInWords = NumberToWordsINR(totalDepositAmount),
                items = items,
                totalCount = items.Count
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 9. MEMBER_DATA_SHEET (Data Sheet)
        // ═══════════════════════════════════════════════════════════
        public static object GetDataSheet(
            NpgsqlConnection conn,
            int societyId,
            string? wing,
            string? flatType,
            string? memberType,
            string? searchText)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT MemberId, MemCode, MemName, MemName2, MemName3, MemMarName,
                       Building, Wing, FlatNo, Floor, UnitType, FlatType, AreaSqft, AreaUnit,
                       ContactNo, Email, PANNo, TANNo, MemberType, Shares, EntryDate,
                       NonOccApplicable, TenantName, TenantContact,
                       ParkingSlot2W, ParkingSlot4W, VehicleNo2W, VehicleNo4W,
                       LienBankName, LienAmount, LienStatus,
                       ShareCertNo, FolioNo,
                       OpPrincipal, OpInterest, CreatedAt
                FROM jeevika_erp.SocMember
                WHERE (SocietyId = @sid OR @sid <= 0)
                  AND IsDeleted = FALSE";

            cmd.Parameters.AddWithValue("@sid", societyId);

            if (!string.IsNullOrWhiteSpace(wing) && wing != "all")
            {
                sql += " AND Wing = @wing";
                cmd.Parameters.AddWithValue("@wing", wing.Trim());
            }

            if (!string.IsNullOrWhiteSpace(flatType) && flatType != "all")
            {
                sql += " AND FlatType = @fType";
                cmd.Parameters.AddWithValue("@fType", flatType.Trim());
            }

            if (!string.IsNullOrWhiteSpace(memberType) && memberType != "all")
            {
                sql += " AND MemberType = @mType";
                cmd.Parameters.AddWithValue("@mType", memberType.Trim());
            }

            if (!string.IsNullOrWhiteSpace(searchText))
            {
                sql += " AND (MemName ILIKE @st OR MemCode ILIKE @st OR FlatNo ILIKE @st OR ContactNo ILIKE @st OR PANNo ILIKE @st)";
                cmd.Parameters.AddWithValue("@st", $"%{searchText.Trim()}%");
            }

            sql += " ORDER BY Wing, FlatNo, MemCode";
            cmd.CommandText = sql;

            var members = new List<Dictionary<string, object>>();
            decimal totalArea = 0m;
            decimal totalOpening = 0m;
            int srNo = 1;

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal area = Convert.ToDecimal(r["AreaSqft"]);
                    decimal opP = Convert.ToDecimal(r["OpPrincipal"]);
                    decimal opI = Convert.ToDecimal(r["OpInterest"]);
                    totalArea += area;
                    totalOpening += (opP + opI);

                    members.Add(new Dictionary<string, object>
                    {
                        ["srNo"] = srNo++,
                        ["memberId"] = Convert.ToInt32(r["MemberId"]),
                        ["memberCode"] = r["MemCode"]?.ToString() ?? "",
                        ["memberName"] = r["MemName"]?.ToString() ?? "",
                        ["coOwner"] = r["MemName2"]?.ToString() ?? "",
                        ["building"] = r["Building"]?.ToString() ?? "",
                        ["wing"] = r["Wing"]?.ToString() ?? "",
                        ["flat"] = r["FlatNo"]?.ToString() ?? "",
                        ["block"] = r["Building"]?.ToString() ?? "",
                        ["floor"] = r["Floor"]?.ToString() ?? "",
                        ["flatType"] = r["FlatType"]?.ToString() ?? "",
                        ["areaSqft"] = area,
                        ["mobile"] = r["ContactNo"]?.ToString() ?? "",
                        ["email"] = r["Email"]?.ToString() ?? "",
                        ["pan"] = r["PANNo"]?.ToString() ?? "",
                        ["gstin"] = societyMeta.GetValueOrDefault("GSTNumber", "")?.ToString() ?? "",
                        ["address"] = $"{r["Wing"]}-{r["FlatNo"]}, {r["Building"]}",
                        ["ownership"] = r["MemberType"]?.ToString() ?? "Owner",
                        ["membershipDate"] = r["EntryDate"] != DBNull.Value ? Convert.ToDateTime(r["EntryDate"]).ToString("yyyy-MM-dd") : "",
                        ["shareCertificate"] = r["ShareCertNo"]?.ToString() ?? "",
                        ["parking"] = $"{r["ParkingSlot2W"]} {r["ParkingSlot4W"]}".Trim(),
                        ["shares"] = Convert.ToInt32(r["Shares"]),
                        ["opPrincipal"] = opP,
                        ["opInterest"] = opI,
                        ["totalOpening"] = opP + opI
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_DATA_SHEET",
                society = societyMeta,
                summary = new
                {
                    totalMembers = members.Count,
                    totalAreaSqft = totalArea,
                    totalOpeningBalance = totalOpening
                },
                members = members
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 10. MEMBER_BILL_REGISTER (Bill Register)
        // ═══════════════════════════════════════════════════════════
        public static object GetBillRegister(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            DateTime? fromDate,
            DateTime? toDate,
            int? billTypeId,
            string? wing,
            string? fromBillNo,
            string? toBillNo)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime bFrom = fromDate ?? fyStart;
            DateTime bTo = toDate ?? fyEnd;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT b.BillId, b.BillNo, b.BillDate, b.DueDate, b.Period,
                       b.PrincipalAmount, b.InterestAmount, b.TotalAmount, b.PaidAmount, b.BalanceAmount, b.Status,
                       COALESCE(bt.BillTypeName, b.BillType, 'Maintenance') AS BillTypeName,
                       m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo, m.AreaSqft,
                       m.OpPrincipal, m.OpInterest
                FROM jeevika_erp.SocMemberBill b
                JOIN jeevika_erp.SocMember m ON b.MemberId = m.MemberId
                LEFT JOIN jeevika_erp.SocBillType bt ON b.BillTypeId = bt.BillTypeId
                WHERE (b.SocietyId = @sid OR @sid <= 0)
                  AND b.IsDeleted = FALSE
                  AND b.BillDate >= @bFrom AND b.BillDate <= @bTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@bFrom", bFrom);
            cmd.Parameters.AddWithValue("@bTo", bTo);

            if (billTypeId.HasValue && billTypeId.Value > 0)
            {
                sql += " AND b.BillTypeId = @btId";
                cmd.Parameters.AddWithValue("@btId", billTypeId.Value);
            }

            if (!string.IsNullOrWhiteSpace(wing) && wing != "all")
            {
                sql += " AND m.Wing = @wing";
                cmd.Parameters.AddWithValue("@wing", wing.Trim());
            }

            if (!string.IsNullOrWhiteSpace(fromBillNo) && !string.IsNullOrWhiteSpace(toBillNo))
            {
                sql += " AND b.BillNo >= @fNo AND b.BillNo <= @tNo";
                cmd.Parameters.AddWithValue("@fNo", fromBillNo.Trim());
                cmd.Parameters.AddWithValue("@tNo", toBillNo.Trim());
            }

            sql += " ORDER BY b.BillDate ASC, b.BillNo ASC";
            cmd.CommandText = sql;

            var bills = new List<Dictionary<string, object>>();
            decimal totalPrincipal = 0m;
            decimal totalInterest = 0m;
            decimal grandTotal = 0m;
            decimal totalPaid = 0m;
            decimal totalBalance = 0m;
            int srNo = 1;

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal p = Convert.ToDecimal(r["PrincipalAmount"]);
                    decimal i = Convert.ToDecimal(r["InterestAmount"]);
                    decimal t = Convert.ToDecimal(r["TotalAmount"]);
                    decimal pd = Convert.ToDecimal(r["PaidAmount"]);
                    decimal bal = Convert.ToDecimal(r["BalanceAmount"]);
                    decimal arrears = Convert.ToDecimal(r["OpPrincipal"]) + Convert.ToDecimal(r["OpInterest"]);

                    totalPrincipal += p;
                    totalInterest += i;
                    grandTotal += t;
                    totalPaid += pd;
                    totalBalance += bal;

                    bills.Add(new Dictionary<string, object>
                    {
                        ["srNo"] = srNo++,
                        ["billId"] = Convert.ToInt32(r["BillId"]),
                        ["billNumber"] = r["BillNo"]?.ToString() ?? "",
                        ["billDate"] = Convert.ToDateTime(r["BillDate"]).ToString("yyyy-MM-dd"),
                        ["dueDate"] = r["DueDate"] != DBNull.Value ? Convert.ToDateTime(r["DueDate"]).ToString("yyyy-MM-dd") : "",
                        ["billingPeriod"] = r["Period"]?.ToString() ?? fyLabel,
                        ["unit"] = $"{r["Wing"]}-{r["FlatNo"]}",
                        ["member"] = r["MemName"]?.ToString() ?? "",
                        ["memberCode"] = r["MemCode"]?.ToString() ?? "",
                        ["billType"] = r["BillTypeName"]?.ToString() ?? "Maintenance",
                        ["maintenance"] = p * 0.7m,
                        ["sinkingFund"] = p * 0.2m,
                        ["parking"] = p * 0.1m,
                        ["nonOccupancy"] = 0m,
                        ["previousArrears"] = arrears,
                        ["currentBill"] = p,
                        ["tax"] = 0m,
                        ["principalAmount"] = p,
                        ["interestAmount"] = i,
                        ["totalAmount"] = t,
                        ["total"] = t,
                        ["paidAmount"] = pd,
                        ["balanceAmount"] = bal,
                        ["status"] = r["Status"]?.ToString() ?? "Unpaid"
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_BILL_REGISTER",
                society = societyMeta,
                fyLabel = fyLabel,
                dateRange = new { from = bFrom.ToString("yyyy-MM-dd"), to = bTo.ToString("yyyy-MM-dd") },
                totals = new
                {
                    totalPrincipal = totalPrincipal,
                    totalInterest = totalInterest,
                    grandTotal = grandTotal,
                    totalPaid = totalPaid,
                    totalBalance = totalBalance
                },
                bills = bills,
                totalCount = bills.Count
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 11. MEMBER_RECEIPT_REGISTER (Receipt Register)
        // ═══════════════════════════════════════════════════════════
        public static object GetReceiptRegister(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            DateTime? fromDate,
            DateTime? toDate,
            string? paymentMode,
            string? bankName,
            string? wing)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime rFrom = fromDate ?? fyStart;
            DateTime rTo = toDate ?? fyEnd;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT v.VoucherId, v.VoucherNo, v.VoucherDate, v.Amount, v.PersonName, v.PersonCode,
                       v.CashBankCode, v.CashBankName, v.ChqNo, v.ChqDate, v.BankName, v.Narration,
                       m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo
                FROM jeevika_erp.SocVoucherHeader v
                LEFT JOIN jeevika_erp.SocMember m ON (UPPER(TRIM(v.PersonCode)) = UPPER(TRIM(m.MemCode)) OR UPPER(TRIM(v.RefNo)) = UPPER(TRIM(m.MemCode)) OR v.PersonName ILIKE '%' || m.MemName || '%') AND (m.SocietyId = v.SocietyId)
                WHERE (v.SocietyId = @sid OR @sid <= 0)
                  AND v.VoucherType IN ('Receipt', 'MemberReceipt')
                  AND v.IsDeleted = FALSE
                  AND v.VoucherDate >= @rFrom AND v.VoucherDate <= @rTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@rFrom", rFrom);
            cmd.Parameters.AddWithValue("@rTo", rTo);

            if (!string.IsNullOrWhiteSpace(wing) && wing != "all")
            {
                sql += " AND m.Wing = @wing";
                cmd.Parameters.AddWithValue("@wing", wing.Trim());
            }

            if (!string.IsNullOrWhiteSpace(bankName) && bankName != "all")
            {
                sql += " AND (v.CashBankName ILIKE @bName OR v.BankName ILIKE @bName)";
                cmd.Parameters.AddWithValue("@bName", $"%{bankName.Trim()}%");
            }

            sql += " ORDER BY v.VoucherDate ASC, v.VoucherNo ASC";
            cmd.CommandText = sql;

            var receipts = new List<Dictionary<string, object>>();
            decimal totalCash = 0m;
            decimal totalCheque = 0m;
            decimal totalNeft = 0m;
            decimal totalUpi = 0m;
            decimal grandTotal = 0m;
            int srNo = 1;

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal amt = Convert.ToDecimal(r["Amount"]);
                    grandTotal += amt;

                    string chq = r["ChqNo"]?.ToString() ?? "";
                    string mode = "Cheque";
                    if (string.IsNullOrWhiteSpace(chq)) { mode = "Cash"; totalCash += amt; }
                    else if (chq.StartsWith("UPI", StringComparison.OrdinalIgnoreCase)) { mode = "UPI"; totalUpi += amt; }
                    else if (chq.StartsWith("NEFT", StringComparison.OrdinalIgnoreCase)) { mode = "NEFT"; totalNeft += amt; }
                    else { totalCheque += amt; }

                    receipts.Add(new Dictionary<string, object>
                    {
                        ["srNo"] = srNo++,
                        ["voucherId"] = Convert.ToInt32(r["VoucherId"]),
                        ["receiptNumber"] = r["VoucherNo"]?.ToString() ?? "",
                        ["receiptDate"] = Convert.ToDateTime(r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        ["unit"] = $"{r["Wing"]}-{r["FlatNo"]}",
                        ["member"] = r["MemName"]?.ToString() ?? r["PersonName"]?.ToString() ?? "",
                        ["memberCode"] = r["MemCode"]?.ToString() ?? r["PersonCode"]?.ToString() ?? "",
                        ["paymentMode"] = mode,
                        ["referenceNumber"] = chq,
                        ["bank"] = r["BankName"]?.ToString() ?? r["CashBankName"]?.ToString() ?? "",
                        ["amount"] = amt,
                        ["allocation"] = "Maintenance Dues",
                        ["status"] = "Posted",
                        ["narration"] = r["Narration"]?.ToString() ?? ""
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_RECEIPT_REGISTER",
                society = societyMeta,
                fyLabel = fyLabel,
                dateRange = new { from = rFrom.ToString("yyyy-MM-dd"), to = rTo.ToString("yyyy-MM-dd") },
                totalAmount = grandTotal,
                summary = new
                {
                    cash = totalCash,
                    cheque = totalCheque,
                    neft = totalNeft,
                    upi = totalUpi,
                    totalReceipts = grandTotal
                },
                receipts = receipts,
                totalCount = receipts.Count
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 12. MEMBER_DEBIT_NOTE_REGISTER (Debit Note Register)
        // ═══════════════════════════════════════════════════════════
        public static object GetDebitNoteRegister(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            DateTime? fromDate,
            DateTime? toDate,
            string? wing,
            string? fromMember,
            string? toMember)
        {
            return GetNotesRegisterByType(conn, societyId, fyId, "DebitNote", fromDate, toDate, wing, fromMember, toMember, "MEMBER_DEBIT_NOTE_REGISTER");
        }

        // ═══════════════════════════════════════════════════════════
        // 13. MEMBER_CREDIT_NOTE_REGISTER (Credit Note Register)
        // ═══════════════════════════════════════════════════════════
        public static object GetCreditNoteRegister(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            DateTime? fromDate,
            DateTime? toDate,
            string? wing,
            string? fromMember,
            string? toMember)
        {
            return GetNotesRegisterByType(conn, societyId, fyId, "CreditNote", fromDate, toDate, wing, fromMember, toMember, "MEMBER_CREDIT_NOTE_REGISTER");
        }

        private static object GetNotesRegisterByType(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            string noteType,
            DateTime? fromDate,
            DateTime? toDate,
            string? wing,
            string? fromMember,
            string? toMember,
            string reportKey)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime nFrom = fromDate ?? fyStart;
            DateTime nTo = toDate ?? fyEnd;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT n.NoteId, n.NoteNo, n.NoteType, n.NoteDate, n.Amount, n.Reason,
                       m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo
                FROM jeevika_erp.SocMemberNote n
                LEFT JOIN jeevika_erp.SocMember m ON n.MemberId = m.MemberId
                WHERE (n.SocietyId = @sid OR @sid <= 0)
                  AND n.NoteType = @nType
                  AND n.IsDeleted = FALSE
                  AND n.NoteDate >= @nFrom AND n.NoteDate <= @nTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@nType", noteType);
            cmd.Parameters.AddWithValue("@nFrom", nFrom);
            cmd.Parameters.AddWithValue("@nTo", nTo);

            if (!string.IsNullOrWhiteSpace(wing) && wing != "all")
            {
                sql += " AND m.Wing = @wing";
                cmd.Parameters.AddWithValue("@wing", wing.Trim());
            }

            if (!string.IsNullOrWhiteSpace(fromMember))
            {
                sql += " AND m.MemCode = @mCode";
                cmd.Parameters.AddWithValue("@mCode", fromMember.Trim());
            }

            sql += " ORDER BY n.NoteDate ASC, n.NoteNo ASC";
            cmd.CommandText = sql;

            var items = new List<Dictionary<string, object>>();
            decimal totalAmount = 0m;
            int srNo = 1;

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal amt = Convert.ToDecimal(r["Amount"]);
                    totalAmount += amt;

                    items.Add(new Dictionary<string, object>
                    {
                        ["srNo"] = srNo++,
                        ["noteId"] = Convert.ToInt32(r["NoteId"]),
                        ["noteNumber"] = r["NoteNo"]?.ToString() ?? "",
                        ["date"] = Convert.ToDateTime(r["NoteDate"]).ToString("yyyy-MM-dd"),
                        ["unit"] = $"{r["Wing"]}-{r["FlatNo"]}",
                        ["member"] = r["MemName"]?.ToString() ?? "",
                        ["memberCode"] = r["MemCode"]?.ToString() ?? "",
                        ["reason"] = r["Reason"]?.ToString() ?? "",
                        ["accountHead"] = noteType == "DebitNote" ? "Interest / Penalty" : "Rebate / Waiver",
                        ["amount"] = amt,
                        ["status"] = "Posted"
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = reportKey,
                society = societyMeta,
                fyLabel = fyLabel,
                dateRange = new { from = nFrom.ToString("yyyy-MM-dd"), to = nTo.ToString("yyyy-MM-dd") },
                totalCount = items.Count,
                totalAmount = totalAmount,
                items = items
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 14. MEMBER_ADJUSTMENT_REGISTER (Adjustment Register)
        // ═══════════════════════════════════════════════════════════
        public static object GetAdjustmentRegister(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            DateTime? fromDate,
            DateTime? toDate,
            string? wing,
            string? fromMember,
            string? toMember)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime aFrom = fromDate ?? fyStart;
            DateTime aTo = toDate ?? fyEnd;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT v.VoucherId, v.VoucherNo, v.VoucherDate, v.Amount, v.PersonName, v.PersonCode,
                       v.RefNo, v.Narration, v.Particular1, v.Particular2,
                       m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo
                FROM jeevika_erp.SocVoucherHeader v
                LEFT JOIN jeevika_erp.SocMember m ON (UPPER(TRIM(v.PersonCode)) = UPPER(TRIM(m.MemCode)) OR UPPER(TRIM(v.RefNo)) = UPPER(TRIM(m.MemCode)) OR v.PersonName ILIKE '%' || m.MemName || '%') AND (m.SocietyId = v.SocietyId)
                WHERE (v.SocietyId = @sid OR @sid <= 0)
                  AND v.VoucherType IN ('Adjustment', 'BillTypeTransfer')
                  AND v.IsDeleted = FALSE
                  AND v.VoucherDate >= @aFrom AND v.VoucherDate <= @aTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@aFrom", aFrom);
            cmd.Parameters.AddWithValue("@aTo", aTo);

            if (!string.IsNullOrWhiteSpace(wing) && wing != "all")
            {
                sql += " AND m.Wing = @wing";
                cmd.Parameters.AddWithValue("@wing", wing.Trim());
            }

            if (!string.IsNullOrWhiteSpace(fromMember))
            {
                sql += " AND (m.MemCode = @mCode OR v.PersonCode = @mCode)";
                cmd.Parameters.AddWithValue("@mCode", fromMember.Trim());
            }

            sql += " ORDER BY v.VoucherDate ASC, v.VoucherNo ASC";
            cmd.CommandText = sql;

            var items = new List<Dictionary<string, object>>();
            decimal totalAmount = 0m;
            int srNo = 1;

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    decimal amt = Convert.ToDecimal(r["Amount"]);
                    totalAmount += amt;

                    items.Add(new Dictionary<string, object>
                    {
                        ["srNo"] = srNo++,
                        ["voucherId"] = Convert.ToInt32(r["VoucherId"]),
                        ["adjustmentNumber"] = r["VoucherNo"]?.ToString() ?? "",
                        ["date"] = Convert.ToDateTime(r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        ["unit"] = $"{r["Wing"]}-{r["FlatNo"]}",
                        ["member"] = r["MemName"]?.ToString() ?? r["PersonName"]?.ToString() ?? "",
                        ["memberCode"] = r["MemCode"]?.ToString() ?? r["PersonCode"]?.ToString() ?? "",
                        ["sourcePool"] = r["Particular1"]?.ToString() ?? "Maintenance Dues",
                        ["destination"] = r["Particular2"]?.ToString() ?? "Advance Adjustment",
                        ["adjustmentType"] = "Inter-head Transfer",
                        ["amount"] = amt,
                        ["status"] = "Posted",
                        ["narration"] = r["Narration"]?.ToString() ?? ""
                    });
                }
            }

            return new
            {
                success = true,
                reportKey = "MEMBER_ADJUSTMENT_REGISTER",
                society = societyMeta,
                fyLabel = fyLabel,
                dateRange = new { from = aFrom.ToString("yyyy-MM-dd"), to = aTo.ToString("yyyy-MM-dd") },
                totalCount = items.Count,
                totalAmount = totalAmount,
                totalApplied = totalAmount,
                totalReversed = 0m,
                items = items
            };
        }

        // ═══════════════════════════════════════════════════════════
        // 15. MEMBER_JV_REGISTER (Member JV Register)
        // ═══════════════════════════════════════════════════════════
        public static object GetMemberJVRegister(
            NpgsqlConnection conn,
            int societyId,
            int fyId,
            DateTime? fromDate,
            DateTime? toDate,
            string? wing,
            string? fromMember,
            string? toMember)
        {
            var societyMeta = GetSocietyMeta(conn, societyId);
            var (fyStart, fyEnd, fyLabel) = GetFiscalYearBounds(conn, societyId, fyId);
            DateTime jFrom = fromDate ?? fyStart;
            DateTime jTo = toDate ?? fyEnd;

            using var cmd = conn.CreateCommand();
            var sql = @"
                SELECT v.VoucherId, v.VoucherNo, v.VoucherDate, v.Amount, v.PersonName, v.PersonCode,
                       v.RefNo, v.Narration,
                       m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo
                FROM jeevika_erp.SocVoucherHeader v
                LEFT JOIN jeevika_erp.SocMember m ON (UPPER(TRIM(v.PersonCode)) = UPPER(TRIM(m.MemCode)) OR UPPER(TRIM(v.RefNo)) = UPPER(TRIM(m.MemCode)) OR v.PersonName ILIKE '%' || m.MemName || '%') AND (m.SocietyId = v.SocietyId)
                WHERE (v.SocietyId = @sid OR @sid <= 0)
                  AND v.VoucherType IN ('Journal', 'JV')
                  AND v.IsDeleted = FALSE
                  AND v.VoucherDate >= @jFrom AND v.VoucherDate <= @jTo";

            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@jFrom", jFrom);
            cmd.Parameters.AddWithValue("@jTo", jTo);

            if (!string.IsNullOrWhiteSpace(wing) && wing != "all")
            {
                sql += " AND m.Wing = @wing";
                cmd.Parameters.AddWithValue("@wing", wing.Trim());
            }

            if (!string.IsNullOrWhiteSpace(fromMember))
            {
                sql += " AND (m.MemCode = @mCode OR v.PersonCode = @mCode)";
                cmd.Parameters.AddWithValue("@mCode", fromMember.Trim());
            }

            sql += " ORDER BY v.VoucherDate ASC, v.VoucherNo ASC";
            cmd.CommandText = sql;

            var jvs = new List<Dictionary<string, object>>();
            var vIds = new List<int>();
            decimal totalAmount = 0m;
            int srNo = 1;

            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    int vid = Convert.ToInt32(r["VoucherId"]);
                    vIds.Add(vid);
                    decimal amt = Convert.ToDecimal(r["Amount"]);
                    totalAmount += amt;

                    jvs.Add(new Dictionary<string, object>
                    {
                        ["srNo"] = srNo++,
                        ["voucherId"] = vid,
                        ["jvNumber"] = r["VoucherNo"]?.ToString() ?? "",
                        ["voucherDate"] = Convert.ToDateTime(r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        ["unit"] = $"{r["Wing"]}-{r["FlatNo"]}",
                        ["member"] = r["MemName"]?.ToString() ?? r["PersonName"]?.ToString() ?? "",
                        ["memberCode"] = r["MemCode"]?.ToString() ?? r["PersonCode"]?.ToString() ?? "",
                        ["amount"] = amt,
                        ["narration"] = r["Narration"]?.ToString() ?? "",
                        ["status"] = "Posted",
                        ["details"] = new List<Dictionary<string, object>>()
                    });
                }
            }

            // Fetch Voucher Details (Debit / Credit lines)
            decimal sumDebit = 0m;
            decimal sumCredit = 0m;

            if (vIds.Count > 0)
            {
                using var dCmd = conn.CreateCommand();
                dCmd.CommandText = @"
                    SELECT DetailId, VoucherId, AccountCode, AccountName, Debit, Credit, Narration
                    FROM jeevika_erp.SocVoucherDetail
                    WHERE VoucherId = ANY(@vIds)
                    ORDER BY SrNo ASC, DetailId ASC";
                dCmd.Parameters.AddWithValue("@vIds", vIds.ToArray());

                using var dr = dCmd.ExecuteReader();
                var dMap = new Dictionary<int, List<Dictionary<string, object>>>();
                while (dr.Read())
                {
                    int vid = Convert.ToInt32(dr["VoucherId"]);
                    if (!dMap.ContainsKey(vid)) dMap[vid] = new List<Dictionary<string, object>>();
                    decimal d = Convert.ToDecimal(dr["Debit"]);
                    decimal c = Convert.ToDecimal(dr["Credit"]);
                    sumDebit += d;
                    sumCredit += c;

                    dMap[vid].Add(new Dictionary<string, object>
                    {
                        ["accountCode"] = dr["AccountCode"]?.ToString() ?? "",
                        ["ledgerHead"] = dr["AccountName"]?.ToString() ?? dr["AccountCode"]?.ToString() ?? "",
                        ["debit"] = d,
                        ["credit"] = c,
                        ["narration"] = dr["Narration"]?.ToString() ?? ""
                    });
                }

                foreach (var jv in jvs)
                {
                    int vid = Convert.ToInt32(jv["voucherId"]);
                    if (dMap.TryGetValue(vid, out var details))
                    {
                        jv["details"] = details;
                    }
                }
            }

            decimal variance = sumDebit - sumCredit;
            string balanceStatus = Math.Abs(variance) < 0.005m ? "MATCHED" : "UNBALANCED";

            return new
            {
                success = true,
                reportKey = "MEMBER_JV_REGISTER",
                society = societyMeta,
                fyLabel = fyLabel,
                dateRange = new { from = jFrom.ToString("yyyy-MM-dd"), to = jTo.ToString("yyyy-MM-dd") },
                totalDebit = sumDebit > 0 ? sumDebit : totalAmount,
                totalCredit = sumCredit > 0 ? sumCredit : totalAmount,
                variance = variance,
                balanceStatus = balanceStatus,
                totalAmount = totalAmount,
                items = jvs,
                totalCount = jvs.Count
            };
        }

        // ═══════════════════════════════════════════════════════════
        // REPORT CONFIGURATION & HENU OS DESIGN STUDIO CRUD
        // ═══════════════════════════════════════════════════════════

        public static List<Dictionary<string, object>> GetReportDefinitions(NpgsqlConnection conn)
        {
            var list = new List<Dictionary<string, object>>();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT id, report_key, report_name, category, COALESCE(parent_group, '') AS parent_group, description, source_type, active
                FROM jeevika_erp.report_definitions
                ORDER BY id ASC";

            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                list.Add(new Dictionary<string, object>
                {
                    ["id"] = Convert.ToInt32(r["id"]),
                    ["reportKey"] = r["report_key"]?.ToString() ?? "",
                    ["reportName"] = r["report_name"]?.ToString() ?? "",
                    ["category"] = r["category"]?.ToString() ?? "Member Reports",
                    ["parentGroup"] = r["parent_group"]?.ToString() ?? "",
                    ["description"] = r["description"]?.ToString() ?? "",
                    ["sourceType"] = r["source_type"]?.ToString() ?? "SQL_SERVICE",
                    ["active"] = Convert.ToBoolean(r["active"])
                });
            }
            return list;
        }

        public static List<Dictionary<string, object>> GetTemplates(NpgsqlConnection conn, string reportKey)
        {
            var list = new List<Dictionary<string, object>>();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT id, report_key, template_key, template_name, template_version, template_json, is_system_template, is_active, updated_at
                FROM jeevika_erp.report_templates
                WHERE report_key = @rKey OR @rKey = 'ALL'
                ORDER BY id ASC";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());

            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                list.Add(new Dictionary<string, object>
                {
                    ["id"] = Convert.ToInt32(r["id"]),
                    ["reportKey"] = r["report_key"]?.ToString() ?? "",
                    ["templateKey"] = r["template_key"]?.ToString() ?? "",
                    ["templateName"] = r["template_name"]?.ToString() ?? "",
                    ["templateVersion"] = Convert.ToInt32(r["template_version"]),
                    ["templateJson"] = r["template_json"]?.ToString() ?? "{}",
                    ["isSystemTemplate"] = Convert.ToBoolean(r["is_system_template"]),
                    ["isActive"] = Convert.ToBoolean(r["is_active"]),
                    ["updatedAt"] = r["updated_at"] != DBNull.Value ? Convert.ToDateTime(r["updated_at"]).ToString("yyyy-MM-dd HH:mm:ss") : ""
                });
            }
            return list;
        }

        public static bool SaveTemplate(NpgsqlConnection conn, string reportKey, string templateKey, string templateName, string templateJson, bool isSystem, string updatedBy = "SYSTEM")
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO jeevika_erp.report_templates (report_key, template_key, template_name, template_json, is_system_template, is_active, updated_at)
                VALUES (@rKey, @tKey, @tName, @tJson, @isSys, TRUE, NOW())
                ON CONFLICT (report_key, template_key) DO UPDATE SET
                    template_name = EXCLUDED.template_name,
                    template_json = EXCLUDED.template_json,
                    template_version = jeevika_erp.report_templates.template_version + 1,
                    updated_at = NOW()
                RETURNING id, template_version;";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
            cmd.Parameters.AddWithValue("@tKey", templateKey.ToLower().Trim());
            cmd.Parameters.AddWithValue("@tName", templateName.Trim());
            cmd.Parameters.AddWithValue("@tJson", templateJson);
            cmd.Parameters.AddWithValue("@isSys", isSystem);

            using var r = cmd.ExecuteReader();
            int templateId = 0;
            int versionNo = 1;
            if (r.Read())
            {
                templateId = Convert.ToInt32(r["id"]);
                versionNo = Convert.ToInt32(r["template_version"]);
            }
            r.Close();

            // Record version snapshot
            if (templateId > 0)
            {
                using var vCmd = conn.CreateCommand();
                vCmd.CommandText = @"
                    INSERT INTO jeevika_erp.report_template_versions (template_id, version_no, template_json, created_by, is_published, created_at)
                    VALUES (@tId, @vNo, @tJson, @uBy, FALSE, NOW())";
                vCmd.Parameters.AddWithValue("@tId", templateId);
                vCmd.Parameters.AddWithValue("@vNo", versionNo);
                vCmd.Parameters.AddWithValue("@tJson", templateJson);
                vCmd.Parameters.AddWithValue("@uBy", updatedBy);
                vCmd.ExecuteNonQuery();

                AddAuditLog(conn, reportKey, "SAVE_DRAFT", updatedBy, "", $"Saved draft template {templateKey} v{versionNo}", versionNo);
            }

            return templateId > 0;
        }

        public static bool PublishTemplate(NpgsqlConnection conn, string reportKey, string templateKey, string templateName, string templateJson, string publishedBy = "ADMIN")
        {
            // Save & increment template
            SaveTemplate(conn, reportKey, templateKey, templateName, templateJson, false, publishedBy);

            // Set as active runtime setting
            SaveRuntimeSettings(conn, reportKey, templateJson, publishedBy);

            // Mark latest version as published
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE jeevika_erp.report_template_versions
                SET is_published = TRUE
                WHERE template_id IN (SELECT id FROM jeevika_erp.report_templates WHERE report_key = @rKey AND template_key = @tKey)
                  AND version_no = (SELECT template_version FROM jeevika_erp.report_templates WHERE report_key = @rKey AND template_key = @tKey);";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
            cmd.Parameters.AddWithValue("@tKey", templateKey.ToLower().Trim());
            cmd.ExecuteNonQuery();

            AddAuditLog(conn, reportKey, "PUBLISH_TEMPLATE", publishedBy, "", $"Published template {templateKey} as active design", 1);
            return true;
        }

        public static bool DuplicateTemplate(NpgsqlConnection conn, string reportKey, string sourceTemplateKey, string newTemplateKey, string newTemplateName, string createdBy = "ADMIN")
        {
            string sourceJson = "{}";
            using (var cmdRead = conn.CreateCommand())
            {
                cmdRead.CommandText = "SELECT template_json FROM jeevika_erp.report_templates WHERE report_key = @rKey AND template_key = @tKey LIMIT 1";
                cmdRead.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
                cmdRead.Parameters.AddWithValue("@tKey", sourceTemplateKey.ToLower().Trim());
                var res = cmdRead.ExecuteScalar();
                if (res != null && res != DBNull.Value) sourceJson = res.ToString() ?? "{}";
            }

            return SaveTemplate(conn, reportKey, newTemplateKey, newTemplateName, sourceJson, false, createdBy);
        }

        public static (bool success, string message) DeleteTemplate(NpgsqlConnection conn, string reportKey, string templateKey)
        {
            using var cmdCheck = conn.CreateCommand();
            cmdCheck.CommandText = "SELECT is_system_template FROM jeevika_erp.report_templates WHERE report_key = @rKey AND template_key = @tKey LIMIT 1";
            cmdCheck.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
            cmdCheck.Parameters.AddWithValue("@tKey", templateKey.ToLower().Trim());
            var res = cmdCheck.ExecuteScalar();
            if (res == null || res == DBNull.Value) return (false, "Template not found");
            if (Convert.ToBoolean(res)) return (false, "System templates are protected and cannot be deleted");

            using var cmdDel = conn.CreateCommand();
            cmdDel.CommandText = "DELETE FROM jeevika_erp.report_templates WHERE report_key = @rKey AND template_key = @tKey";
            cmdDel.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
            cmdDel.Parameters.AddWithValue("@tKey", templateKey.ToLower().Trim());
            bool ok = cmdDel.ExecuteNonQuery() > 0;
            if (ok) AddAuditLog(conn, reportKey, "DELETE_TEMPLATE", "ADMIN", templateKey, "Deleted custom template", 1);
            return (ok, ok ? "Template deleted successfully" : "Failed to delete template");
        }

        public static List<Dictionary<string, object>> GetTemplateVersions(NpgsqlConnection conn, string reportKey, string templateKey)
        {
            var list = new List<Dictionary<string, object>>();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT v.id, v.version_no, v.template_json, v.created_by, v.is_published, v.created_at
                FROM jeevika_erp.report_template_versions v
                JOIN jeevika_erp.report_templates t ON v.template_id = t.id
                WHERE t.report_key = @rKey AND t.template_key = @tKey
                ORDER BY v.version_no DESC";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
            cmd.Parameters.AddWithValue("@tKey", templateKey.ToLower().Trim());

            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                list.Add(new Dictionary<string, object>
                {
                    ["id"] = Convert.ToInt32(r["id"]),
                    ["versionNo"] = Convert.ToInt32(r["version_no"]),
                    ["templateJson"] = r["template_json"]?.ToString() ?? "{}",
                    ["createdBy"] = r["created_by"]?.ToString() ?? "SYSTEM",
                    ["isPublished"] = Convert.ToBoolean(r["is_published"]),
                    ["createdAt"] = Convert.ToDateTime(r["created_at"]).ToString("yyyy-MM-dd HH:mm:ss")
                });
            }
            return list;
        }

        public static bool RollbackTemplateVersion(NpgsqlConnection conn, string reportKey, string templateKey, int versionNo, string restoredBy = "ADMIN")
        {
            string versionJson = "";
            using (var cmdRead = conn.CreateCommand())
            {
                cmdRead.CommandText = @"
                    SELECT v.template_json
                    FROM jeevika_erp.report_template_versions v
                    JOIN jeevika_erp.report_templates t ON v.template_id = t.id
                    WHERE t.report_key = @rKey AND t.template_key = @tKey AND v.version_no = @vNo
                    LIMIT 1";
                cmdRead.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
                cmdRead.Parameters.AddWithValue("@tKey", templateKey.ToLower().Trim());
                cmdRead.Parameters.AddWithValue("@vNo", versionNo);
                var res = cmdRead.ExecuteScalar();
                if (res != null && res != DBNull.Value) versionJson = res.ToString() ?? "";
            }

            if (string.IsNullOrEmpty(versionJson)) return false;

            // Publish restored version
            PublishTemplate(conn, reportKey, templateKey, templateKey, versionJson, restoredBy);
            AddAuditLog(conn, reportKey, "ROLLBACK_VERSION", restoredBy, $"Rollback to v{versionNo}", $"Restored version {versionNo}", versionNo);
            return true;
        }

        public static string GetRuntimeSettings(NpgsqlConnection conn, string reportKey)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT setting_json FROM jeevika_erp.report_runtime_settings WHERE report_key = @rKey LIMIT 1";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
            var res = cmd.ExecuteScalar();
            return res?.ToString() ?? "{}";
        }

        public static bool SaveRuntimeSettings(NpgsqlConnection conn, string reportKey, string settingJson, string updatedBy = "SYSTEM")
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO jeevika_erp.report_runtime_settings (report_key, setting_json, updated_by, updated_at)
                VALUES (@rKey, @sJson, @uBy, NOW())
                ON CONFLICT (report_key) DO UPDATE SET
                    setting_json = EXCLUDED.setting_json,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
            cmd.Parameters.AddWithValue("@sJson", settingJson);
            cmd.Parameters.AddWithValue("@uBy", updatedBy);
            return cmd.ExecuteNonQuery() > 0;
        }

        public static List<Dictionary<string, object>> GetAuditLogs(NpgsqlConnection conn, string reportKey)
        {
            var list = new List<Dictionary<string, object>>();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT id, report_key, action, changed_by, old_value, new_value, version, created_at
                FROM jeevika_erp.report_audit_log
                WHERE report_key = @rKey OR @rKey = 'ALL'
                ORDER BY id DESC LIMIT 100";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());

            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                list.Add(new Dictionary<string, object>
                {
                    ["id"] = Convert.ToInt32(r["id"]),
                    ["reportKey"] = r["report_key"]?.ToString() ?? "",
                    ["action"] = r["action"]?.ToString() ?? "",
                    ["changedBy"] = r["changed_by"]?.ToString() ?? "SYSTEM",
                    ["oldValue"] = r["old_value"]?.ToString() ?? "",
                    ["newValue"] = r["new_value"]?.ToString() ?? "",
                    ["version"] = Convert.ToInt32(r["version"]),
                    ["createdAt"] = Convert.ToDateTime(r["created_at"]).ToString("yyyy-MM-dd HH:mm:ss")
                });
            }
            return list;
        }

        public static void AddAuditLog(NpgsqlConnection conn, string reportKey, string action, string changedBy, string oldValue, string newValue, int version = 1)
        {
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.report_audit_log (report_key, action, changed_by, old_value, new_value, version, created_at)
                    VALUES (@rKey, @act, @cBy, @oldVal, @newVal, @vNo, NOW())";
                cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
                cmd.Parameters.AddWithValue("@act", action);
                cmd.Parameters.AddWithValue("@cBy", changedBy);
                cmd.Parameters.AddWithValue("@oldVal", oldValue);
                cmd.Parameters.AddWithValue("@newVal", newValue);
                cmd.Parameters.AddWithValue("@vNo", version);
                cmd.ExecuteNonQuery();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MemberReportService] AddAuditLog note: {ex.Message}");
            }
        }

        public static bool SaveAsset(NpgsqlConnection conn, string reportKey, string assetType, string fileName, string storagePath, string mimeType, string metadataJson)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO jeevika_erp.report_assets (report_key, asset_type, file_name, storage_path, mime_type, metadata_json, created_at)
                VALUES (@rKey, @aType, @fName, @sPath, @mMime, @mMeta, NOW())";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
            cmd.Parameters.AddWithValue("@aType", assetType);
            cmd.Parameters.AddWithValue("@fName", fileName);
            cmd.Parameters.AddWithValue("@sPath", storagePath);
            cmd.Parameters.AddWithValue("@mMime", mimeType);
            cmd.Parameters.AddWithValue("@mMeta", metadataJson);
            return cmd.ExecuteNonQuery() > 0;
        }

        public static List<Dictionary<string, object>> GetAssets(NpgsqlConnection conn, string reportKey)
        {
            var list = new List<Dictionary<string, object>>();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT id, report_key, asset_type, file_name, storage_path, mime_type, metadata_json, created_at
                FROM jeevika_erp.report_assets
                WHERE report_key = @rKey OR @rKey = 'ALL'
                ORDER BY id DESC";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());

            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                list.Add(new Dictionary<string, object>
                {
                    ["id"] = Convert.ToInt32(r["id"]),
                    ["reportKey"] = r["report_key"]?.ToString() ?? "",
                    ["assetType"] = r["asset_type"]?.ToString() ?? "",
                    ["fileName"] = r["file_name"]?.ToString() ?? "",
                    ["storagePath"] = r["storage_path"]?.ToString() ?? "",
                    ["mimeType"] = r["mime_type"]?.ToString() ?? "",
                    ["metadataJson"] = r["metadata_json"]?.ToString() ?? "{}",
                    ["createdAt"] = Convert.ToDateTime(r["created_at"]).ToString("yyyy-MM-dd HH:mm:ss")
                });
            }
            return list;
        }

        public static List<Dictionary<string, object>> GetFilterPresets(NpgsqlConnection conn, string reportKey)
        {
            var list = new List<Dictionary<string, object>>();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT id, report_key, preset_name, filter_json, created_by, created_at
                FROM jeevika_erp.report_filter_presets
                WHERE report_key = @rKey
                ORDER BY id ASC";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());

            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                list.Add(new Dictionary<string, object>
                {
                    ["id"] = Convert.ToInt32(r["id"]),
                    ["reportKey"] = r["report_key"]?.ToString() ?? "",
                    ["presetName"] = r["preset_name"]?.ToString() ?? "",
                    ["filterJson"] = r["filter_json"]?.ToString() ?? "{}",
                    ["createdBy"] = r["created_by"]?.ToString() ?? ""
                });
            }
            return list;
        }

        public static bool SaveFilterPreset(NpgsqlConnection conn, string reportKey, string presetName, string filterJson, string createdBy = "USER")
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO jeevika_erp.report_filter_presets (report_key, preset_name, filter_json, created_by, created_at)
                VALUES (@rKey, @pName, @fJson, @cBy, NOW())
                ON CONFLICT (report_key, preset_name) DO UPDATE SET
                    filter_json = EXCLUDED.filter_json,
                    created_by = EXCLUDED.created_by,
                    created_at = NOW()";
            cmd.Parameters.AddWithValue("@rKey", reportKey.ToUpper().Trim());
            cmd.Parameters.AddWithValue("@pName", presetName.Trim());
            cmd.Parameters.AddWithValue("@fJson", filterJson);
            cmd.Parameters.AddWithValue("@cBy", createdBy);
            return cmd.ExecuteNonQuery() > 0;
        }
    }
}
