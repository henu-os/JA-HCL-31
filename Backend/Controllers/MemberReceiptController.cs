// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MemberReceiptController
// Handles Member Receipt Entries & Bill Settlement
// Creates Voucher + Updates SocMemberBill balance
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/member-receipts")]
    [AllowAnonymous]
    public class MemberReceiptController : ControllerBase
    {
        // ── GET /api/member-receipts/member-due?societyId=X&memberId=Y&billType=Z ─
        [HttpGet("member-due")]
        public IActionResult GetMemberDue([FromQuery] int societyId, [FromQuery] int fyId, [FromQuery] int memberId, [FromQuery] string? billType)
        {
            if (societyId <= 0 || memberId <= 0)
                return BadRequest(new { success = false, message = "societyId and memberId are required." });

            if (string.IsNullOrWhiteSpace(billType))
                billType = "Maintenance";

            try
            {
                using var conn = DbHelper.GetConn();
                var result = CalculateMemberDueInternal(conn, societyId, memberId, billType);

                return Ok(new
                {
                    success = true,
                    billType = result.BillType,
                    opPrincipal = result.OpPrincipal,
                    opInterest = result.OpInterest,
                    principalDue = result.PrincipalDue,
                    interestDue = result.InterestDue,
                    netDue = result.NetDue,
                    currentBillInterest = result.CurrentBillInterest,
                    currentBillPrincipal = result.CurrentBillPrincipal,
                    unpaidBills = result.UnpaidBills,
                    recentTransactions = result.RecentTransactions
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public static MemberDueResult CalculateMemberDueInternal(Npgsql.NpgsqlConnection conn, int societyId, int memberId, string? billType, Npgsql.NpgsqlTransaction? tx = null)
        {
            var res = new MemberDueResult();
            if (string.IsNullOrWhiteSpace(billType)) billType = "Maintenance";
            res.BillType = billType.Trim();

            // 1. Fetch Opening Balances for this member & bill type
            using (var opCmd = conn.CreateCommand())
            {
                if (tx != null) opCmd.Transaction = tx;
                opCmd.CommandText = @"
                    SELECT 
                        COALESCE(ob.OpPrincipal, CASE WHEN LOWER(@btype) = 'maintenance' THEN m.OpPrincipal ELSE 0 END) AS OpPrin,
                        COALESCE(ob.OpInterest, CASE WHEN LOWER(@btype) = 'maintenance' THEN m.OpInterest ELSE 0 END) AS OpInt
                    FROM jeevika_erp.SocMember m
                    LEFT JOIN jeevika_erp.SocMemberOpBalance ob 
                           ON m.MemberId = ob.MemberId AND ob.SocietyId = @sid AND LOWER(ob.BillType) = LOWER(@btype)
                    WHERE m.SocietyId = @sid AND m.MemberId = @mid AND m.IsDeleted = FALSE";
                opCmd.Parameters.AddWithValue("@sid",   societyId);
                opCmd.Parameters.AddWithValue("@mid",   memberId);
                opCmd.Parameters.AddWithValue("@btype", res.BillType);

                using var rOp = opCmd.ExecuteReader();
                if (rOp.Read())
                {
                    res.OpPrincipal = Convert.ToDecimal(rOp["OpPrin"]);
                    res.OpInterest  = Convert.ToDecimal(rOp["OpInt"]);
                }
            }

            // 2. Fetch Unpaid / Outstanding Bills for this member and bill type
            decimal billedPrin = 0;
            decimal billedInt = 0;

            using (var bCmd = conn.CreateCommand())
            {
                if (tx != null) bCmd.Transaction = tx;
                bCmd.CommandText = @"
                    SELECT b.BillId, b.BillNo, b.BillDate, b.PrincipalAmount, b.InterestAmount, b.TotalAmount, b.BalanceAmount, b.Status
                    FROM jeevika_erp.SocMemberBill b
                    LEFT JOIN jeevika_erp.SocBillType bt ON b.BillTypeId = bt.BillTypeId
                    WHERE b.SocietyId = @sid AND b.MemberId = @mid 
                      AND (bt.BillTypeName ILIKE @btype OR (b.BillTypeId IS NULL AND LOWER(@btype) = 'maintenance')) 
                      AND b.IsDeleted = FALSE
                    ORDER BY b.BillDate ASC, b.BillId ASC";
                bCmd.Parameters.AddWithValue("@sid",   societyId);
                bCmd.Parameters.AddWithValue("@mid",   memberId);
                bCmd.Parameters.AddWithValue("@btype", res.BillType);

                using var rB = bCmd.ExecuteReader();
                while (rB.Read())
                {
                    var bId = Convert.ToInt32(rB["BillId"]);
                    var bNo = rB["BillNo"]?.ToString() ?? $"BILL-{bId}";
                    var bPrin = Convert.ToDecimal(rB["PrincipalAmount"]);
                    var bInt = Convert.ToDecimal(rB["InterestAmount"]);
                    var bTot = Convert.ToDecimal(rB["TotalAmount"]);
                    var bBal = Convert.ToDecimal(rB["BalanceAmount"]);
                    var bDate = rB["BillDate"] != DBNull.Value ? ((DateTime)rB["BillDate"]).ToString("yyyy-MM-dd") : "";
                    var status = rB["Status"]?.ToString() ?? "Generated";

                    billedPrin += bPrin;
                    billedInt  += bInt;

                    res.UnpaidBills.Add(new
                    {
                        billId = bId,
                        billNo = bNo,
                        billDate = bDate,
                        principalAmount = bPrin,
                        interestAmount = bInt,
                        totalAmount = bTot,
                        balanceAmount = bBal,
                        status
                    });
                }
            }

            res.CurrentBillPrincipal = billedPrin;
            res.CurrentBillInterest  = billedInt;

            // 3. Fetch Total Prior Receipts for this member & bill type
            decimal settledAmount = 0;
            using (var rCmd = conn.CreateCommand())
            {
                if (tx != null) rCmd.Transaction = tx;
                rCmd.CommandText = @"
                    SELECT COALESCE(SUM(CASE WHEN vh.VoucherType = 'MemberReceipt' THEN vh.Amount 
                                             WHEN vh.VoucherType IN ('MemberReceiptReversal', 'ReceiptReversal') THEN -vh.Amount 
                                             ELSE 0 END), 0) AS SettledAmt
                    FROM jeevika_erp.SocVoucherHeader vh
                    WHERE vh.SocietyId = @sid 
                      AND vh.VoucherType IN ('MemberReceipt', 'MemberReceiptReversal', 'ReceiptReversal')
                      AND (vh.PersonName ILIKE @midPattern OR vh.RefNo ILIKE @midPattern2)
                      AND (vh.Particular1 ILIKE '%' || @btype || '%' OR vh.Narration ILIKE '%' || @btype || '%' 
                           OR (LOWER(@btype) = 'maintenance' AND vh.Particular1 NOT ILIKE '%major repair%' AND vh.Narration NOT ILIKE '%major repair%'))
                      AND vh.IsDeleted = FALSE";
                rCmd.Parameters.AddWithValue("@sid", societyId);
                rCmd.Parameters.AddWithValue("@btype", res.BillType);
                rCmd.Parameters.AddWithValue("@midPattern", $"%({memberId})%");
                rCmd.Parameters.AddWithValue("@midPattern2", $"%M-{memberId}%");

                var scalarRes = rCmd.ExecuteScalar();
                if (scalarRes != null && scalarRes != DBNull.Value) settledAmount = Convert.ToDecimal(scalarRes);
            }

            res.SettledAmount = settledAmount;

            // 4. Waterfall calculation: Total Due = (OpPrin + BilledPrin) + (OpInt + BilledInt) - SettledAmt
            decimal totalPrin = res.OpPrincipal + billedPrin;
            decimal totalInt  = res.OpInterest  + billedInt;

            decimal remainingSettled = settledAmount;
            decimal currentIntDue = totalInt;
            decimal currentPrinDue = totalPrin;

            if (remainingSettled > 0)
            {
                if (currentIntDue > 0)
                {
                    if (remainingSettled <= currentIntDue)
                    {
                        currentIntDue -= remainingSettled;
                        remainingSettled = 0;
                    }
                    else
                    {
                        remainingSettled -= currentIntDue;
                        currentIntDue = 0;
                        currentPrinDue = Math.Max(0, currentPrinDue - remainingSettled);
                    }
                }
                else
                {
                    currentPrinDue = Math.Max(0, currentPrinDue - remainingSettled);
                }
            }

            res.PrincipalDue = currentPrinDue;
            res.InterestDue  = currentIntDue;
            res.NetDue       = currentPrinDue + currentIntDue;

            // 5. Fetch Recent Transactions for this member (Bills, Receipts, Debit/Credit Notes, Reversals)
            using (var txCmd = conn.CreateCommand())
            {
                if (tx != null) txCmd.Transaction = tx;
                txCmd.CommandText = @"
                    SELECT b.BillDate AS TxDate, b.BillNo AS VchNo, b.TotalAmount AS Dr, 0.00 AS Cr
                    FROM jeevika_erp.SocMemberBill b
                    WHERE b.SocietyId = @sid AND b.MemberId = @mid AND b.IsDeleted = FALSE
                    UNION ALL
                    SELECT vh.VoucherDate AS TxDate, vh.VoucherNo AS VchNo, 
                           CASE WHEN vh.VoucherType IN ('DebitNote', 'MemberDebitNote', 'MemberReceiptReversal', 'ReceiptReversal') THEN vh.Amount ELSE 0.00 END AS Dr,
                           CASE WHEN vh.VoucherType IN ('MemberReceipt', 'Receipt', 'CreditNote', 'MemberCreditNote') THEN vh.Amount ELSE 0.00 END AS Cr
                    FROM jeevika_erp.SocVoucherHeader vh
                    WHERE vh.SocietyId = @sid 
                      AND (vh.PersonName ILIKE @midPattern OR vh.RefNo ILIKE @midPattern2)
                      AND vh.VoucherType IN ('MemberReceipt', 'Receipt', 'MemberReceiptReversal', 'ReceiptReversal', 'CreditNote', 'MemberCreditNote', 'DebitNote', 'MemberDebitNote')
                      AND vh.IsDeleted = FALSE
                    ORDER BY TxDate DESC
                    LIMIT 5";
                txCmd.Parameters.AddWithValue("@sid", societyId);
                txCmd.Parameters.AddWithValue("@mid", memberId);
                txCmd.Parameters.AddWithValue("@midPattern", $"%({memberId})%");
                txCmd.Parameters.AddWithValue("@midPattern2", $"%M-{memberId}%");

                using var rTx = txCmd.ExecuteReader();
                while (rTx.Read())
                {
                    var txDate = rTx["TxDate"] != DBNull.Value ? ((DateTime)rTx["TxDate"]).ToString("dd/MM/yyyy") : "";
                    var vchNo = rTx["VchNo"]?.ToString() ?? "—";
                    var dr = Convert.ToDecimal(rTx["Dr"]);
                    var cr = Convert.ToDecimal(rTx["Cr"]);

                    res.RecentTransactions.Add(new
                    {
                        date = txDate,
                        vchNo = vchNo,
                        dr = dr,
                        cr = cr
                    });
                }
            }

            return res;
        }

        // ── GET /api/member-receipts?societyId=X&fyId=Y ────────────
        [HttpGet]
        public IActionResult GetReceipts([FromQuery] int societyId = 0, [FromQuery] int fyId = 0)
        {
            if (societyId <= 0)
                societyId = 4;

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureReceiptLedgerEntries(conn, societyId);

                using var cmd  = conn.CreateCommand();

                if (fyId > 0)
                {
                    cmd.CommandText = @"
                        SELECT vh.VoucherId, vh.SocietyId, vh.FYId, vh.VoucherNo, vh.VoucherDate, vh.CashBankCode, vh.CashBankName,
                               vh.Amount, vh.ChqNo, vh.ChqDate, vh.BankName, vh.PersonName, vh.PersonCode, vh.RefNo, vh.Narration, vh.Particular1, vh.Particular2, vh.Status, vh.CreatedAt,
                               m.MemberId
                        FROM jeevika_erp.SocVoucherHeader vh
                        LEFT JOIN jeevika_erp.SocMember m 
                               ON (vh.PersonCode = m.MemCode OR vh.PersonCode = CAST(m.MemberId AS VARCHAR) OR vh.RefNo = m.MemCode)
                              AND (m.SocietyId = vh.SocietyId OR m.SocietyId = 1) AND m.IsDeleted = FALSE
                        WHERE vh.SocietyId = @sid AND vh.FYId = @fyid AND vh.VoucherType = 'MemberReceipt' AND vh.IsDeleted = FALSE
                        ORDER BY vh.VoucherDate DESC, vh.VoucherId DESC";
                    cmd.Parameters.AddWithValue("@sid",  societyId);
                    cmd.Parameters.AddWithValue("@fyid", fyId);
                }
                else
                {
                    cmd.CommandText = @"
                        SELECT vh.VoucherId, vh.SocietyId, vh.FYId, vh.VoucherNo, vh.VoucherDate, vh.CashBankCode, vh.CashBankName,
                               vh.Amount, vh.ChqNo, vh.ChqDate, vh.BankName, vh.PersonName, vh.PersonCode, vh.RefNo, vh.Narration, vh.Particular1, vh.Particular2, vh.Status, vh.CreatedAt,
                               m.MemberId
                        FROM jeevika_erp.SocVoucherHeader vh
                        LEFT JOIN jeevika_erp.SocMember m 
                               ON (vh.PersonCode = m.MemCode OR vh.PersonCode = CAST(m.MemberId AS VARCHAR) OR vh.RefNo = m.MemCode)
                              AND (m.SocietyId = vh.SocietyId OR m.SocietyId = 1) AND m.IsDeleted = FALSE
                        WHERE vh.SocietyId = @sid AND vh.VoucherType = 'MemberReceipt' AND vh.IsDeleted = FALSE
                        ORDER BY vh.VoucherDate DESC, vh.VoucherId DESC";
                    cmd.Parameters.AddWithValue("@sid",  societyId);
                }

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    var personStr = r["PersonName"].ToString() ?? "";
                    string parsedMemberName = personStr;
                    string parsedFlat = "";
                    var matchFlat = System.Text.RegularExpressions.Regex.Match(personStr, @"^(.*?)\s*\((.*?)\)$");
                    if (matchFlat.Success)
                    {
                        parsedMemberName = matchFlat.Groups[1].Value.Trim();
                        parsedFlat = matchFlat.Groups[2].Value.Trim();
                    }

                    var part1Str = r["Particular1"] != DBNull.Value ? r["Particular1"].ToString() ?? "" : "";
                    var narrStr = r["Narration"] != DBNull.Value ? r["Narration"].ToString() ?? "" : "";
                    string billType = "Maintenance";

                    var btMatch = System.Text.RegularExpressions.Regex.Match(part1Str + " " + narrStr, @"\[BillType:\s*([^\]]+)\]", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    if (btMatch.Success)
                    {
                        billType = btMatch.Groups[1].Value.Trim();
                    }
                    else if (part1Str.IndexOf("major repair", StringComparison.OrdinalIgnoreCase) >= 0 || narrStr.IndexOf("major repair", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        billType = "Major Repair";
                    }
                    else if (part1Str.IndexOf("sinking", StringComparison.OrdinalIgnoreCase) >= 0 || narrStr.IndexOf("sinking", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        billType = "Sinking Fund";
                    }
                    else if (part1Str.IndexOf("maintenance", StringComparison.OrdinalIgnoreCase) >= 0 || narrStr.IndexOf("maintenance", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        billType = "Maintenance";
                    }
                    else
                    {
                        var rMatch = System.Text.RegularExpressions.Regex.Match(part1Str + " " + narrStr, @"^([A-Za-z\s]+?)\s+Receipt", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                        if (rMatch.Success && !string.IsNullOrWhiteSpace(rMatch.Groups[1].Value))
                        {
                            billType = rMatch.Groups[1].Value.Trim();
                        }
                    }

                    int? resolvedMemberId = null;
                    if (r["MemberId"] != DBNull.Value)
                    {
                        resolvedMemberId = Convert.ToInt32(r["MemberId"]);
                    }
                    else if (int.TryParse(r["PersonCode"]?.ToString(), out int parsedMid))
                    {
                        resolvedMemberId = parsedMid;
                    }

                    var part2Str = r["Particular2"] != DBNull.Value ? r["Particular2"].ToString() ?? "" : "";
                    decimal parsedPrinAmt = Convert.ToDecimal(r["Amount"]);
                    decimal parsedIntAmt = 0.00m;

                    var mBif = System.Text.RegularExpressions.Regex.Match(part2Str, @"\[Bifurcation:\s*Principal=([\d\.]+),\s*Interest=([\d\.]+)\]");
                    if (mBif.Success)
                    {
                        if (decimal.TryParse(mBif.Groups[1].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decimal pVal))
                            parsedPrinAmt = pVal;
                        if (decimal.TryParse(mBif.Groups[2].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decimal iVal))
                            parsedIntAmt = iVal;
                    }

                    list.Add(new
                    {
                        receiptId   = Convert.ToInt32(r["VoucherId"]),
                        receiptNo   = r["VoucherNo"].ToString() ?? "",
                        receiptDate = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        billType    = billType,
                        cashBank    = r["CashBankName"].ToString() ?? "Cash In Hand",
                        memberId    = resolvedMemberId,
                        personCode  = r["PersonCode"]?.ToString() ?? "",
                        personName  = personStr,
                        memberName  = parsedMemberName,
                        flatNo      = parsedFlat,
                        wingFlat    = parsedFlat,
                        amount      = Convert.ToDecimal(r["Amount"]),
                        principalAmount = parsedPrinAmt,
                        interestAmount  = parsedIntAmt,
                        chqNo       = r["ChqNo"].ToString() ?? "",
                        chqDate     = r["ChqDate"] != DBNull.Value ? ((DateTime)r["ChqDate"]).ToString("yyyy-MM-dd") : "",
                        bankName    = r["BankName"].ToString() ?? "",
                        billNo      = r["RefNo"].ToString() ?? "",
                        particular1 = !string.IsNullOrWhiteSpace(part1Str) ? part1Str : narrStr,
                        particular2 = part2Str,
                        narration   = narrStr,
                        status      = r["Status"].ToString() ?? "Posted"
                    });
                }

                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost]
        public IActionResult CreateReceipt([FromBody] MemberReceiptModel model)
        {
            if (model == null)
                return BadRequest(new { success = false, message = "Invalid receipt payload." });

            try
            {
                using var conn = DbHelper.GetConn();

                int sid = model.SocietyId.HasValue && model.SocietyId.Value > 0 ? model.SocietyId.Value : 0;
                if (sid <= 0)
                {
                    using var sCmd = conn.CreateCommand();
                    sCmd.CommandText = "SELECT SocietyId FROM jeevika_erp.SocietyInfo WHERE IsActive = TRUE ORDER BY SocietyId LIMIT 1";
                    var sRes = sCmd.ExecuteScalar();
                    if (sRes != null && sRes != DBNull.Value) sid = Convert.ToInt32(sRes);
                }

                int fyid = model.FYId.HasValue && model.FYId.Value > 0 ? model.FYId.Value : 0;
                if (fyid <= 0)
                {
                    using var fyCmd = conn.CreateCommand();
                    fyCmd.CommandText = "SELECT FYId FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY FYStart DESC LIMIT 1";
                    fyCmd.Parameters.AddWithValue("@sid", sid);
                    var fyRes = fyCmd.ExecuteScalar();
                    if (fyRes != null && fyRes != DBNull.Value) fyid = Convert.ToInt32(fyRes);
                    else
                    {
                        using var anyFy = conn.CreateCommand();
                        anyFy.CommandText = "SELECT FYId FROM jeevika_erp.FinancialYear WHERE IsActive = TRUE ORDER BY FYId DESC LIMIT 1";
                        var aRes = anyFy.ExecuteScalar();
                        if (aRes != null && aRes != DBNull.Value) fyid = Convert.ToInt32(aRes);
                    }
                }

                int memberId = model.MemberId.HasValue && model.MemberId.Value > 0 ? model.MemberId.Value : 0;

                if (sid <= 0 || fyid <= 0 || memberId <= 0 || model.Amount <= 0)
                    return BadRequest(new { success = false, message = "SocietyId, FYId, MemberId and Amount (> 0) are required." });

                using var tx = conn.BeginTransaction();

                // 1. Generate Receipt Voucher No monotonically if empty
                string receiptNo = model.ReceiptNo?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(receiptNo))
                {
                    string fyLabel = "2026-27";
                    using (var fyCmd = conn.CreateCommand())
                    {
                        fyCmd.Transaction = tx;
                        fyCmd.CommandText = "SELECT FYStart, FYEnd FROM jeevika_erp.FinancialYear WHERE FYId = @fyid LIMIT 1";
                        fyCmd.Parameters.AddWithValue("@fyid", fyid);
                        using var rFy = fyCmd.ExecuteReader();
                        if (rFy.Read())
                        {
                            var sDate = Convert.ToDateTime(rFy["FYStart"]);
                            var eDate = Convert.ToDateTime(rFy["FYEnd"]);
                            fyLabel = $"{sDate.Year}-{eDate.ToString("yy")}";
                        }
                    }

                    using var countCmd = conn.CreateCommand();
                    countCmd.Transaction = tx;
                    countCmd.CommandText = "SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType IN ('MemberReceipt', 'Receipt') AND IsDeleted = FALSE AND (VoucherNo LIKE @prefix OR VoucherNo LIKE @altPrefix)";
                    countCmd.Parameters.AddWithValue("@sid",  sid);
                    countCmd.Parameters.AddWithValue("@fyid", fyid);
                    countCmd.Parameters.AddWithValue("@prefix", $"MRV/{fyLabel}/%");
                    countCmd.Parameters.AddWithValue("@altPrefix", $"REC/{fyLabel}/%");

                    int maxSeq = 0;
                    using (var r = countCmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            var v = r["VoucherNo"]?.ToString() ?? "";
                            if (string.IsNullOrWhiteSpace(v)) continue;
                            var match = System.Text.RegularExpressions.Regex.Match(v, @"(\d+)$");
                            if (match.Success && int.TryParse(match.Groups[1].Value, out int s))
                            {
                                if (s > maxSeq) maxSeq = s;
                            }
                        }
                    }

                    receiptNo = $"MRV/{fyLabel}/{(maxSeq + 1):D2}";
                }

                // 2. Fetch Member Name & Flat No
                using var memCmd = conn.CreateCommand();
                memCmd.Transaction = tx;
                memCmd.CommandText = "SELECT MemCode, MemName, Wing, FlatNo FROM jeevika_erp.SocMember WHERE MemberId = @mid";
                memCmd.Parameters.AddWithValue("@mid", model.MemberId);

                string memCode = "", memName = "", flat = "";
                using (var rM = memCmd.ExecuteReader())
                {
                    if (rM.Read())
                    {
                        memCode = rM["MemCode"].ToString() ?? "";
                        memName = rM["MemName"].ToString() ?? "";
                        flat    = $"{rM["Wing"]}-{rM["FlatNo"]}";
                    }
                }

                // Format Bill Type, Narration, and Particular1
                string bType = !string.IsNullOrWhiteSpace(model.BillType) ? model.BillType.Trim() : "Maintenance";
                string formattedNarration = !string.IsNullOrWhiteSpace(model.Narration) ? model.Narration.Trim() : $"{bType} Receipt";
                string formattedParticular1 = !string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1.Trim() : $"{bType} Receipt";
                if (!formattedParticular1.Contains("[BillType:", StringComparison.OrdinalIgnoreCase))
                {
                    formattedParticular1 = $"[BillType: {bType}] " + formattedParticular1;
                }

                // Calculate Principal & Interest Bifurcation
                decimal intAmt = model.InterestAmount.HasValue && model.InterestAmount.Value >= 0 ? model.InterestAmount.Value : 0;
                decimal prinAmt = model.PrincipalAmount.HasValue && model.PrincipalAmount.Value >= 0 ? model.PrincipalAmount.Value : Math.Max(0, model.Amount - intAmt);
                if (prinAmt + intAmt != model.Amount && intAmt > 0)
                {
                    prinAmt = Math.Max(0, model.Amount - intAmt);
                }

                string bifTag = $"[Bifurcation: Principal={prinAmt:F2}, Interest={intAmt:F2}]";
                string rawPart2 = model.Particular2 ?? "";
                string formattedParticular2 = rawPart2;
                if (formattedParticular2.Contains("[Bifurcation:"))
                {
                    formattedParticular2 = System.Text.RegularExpressions.Regex.Replace(formattedParticular2, @"\[Bifurcation:[^\]]+\]", bifTag).Trim();
                }
                else
                {
                    formattedParticular2 = (formattedParticular2 + " " + bifTag).Trim();
                }

                // Check if voucher already exists for upsert
                int existingVoucherId = 0;
                int checkVid = (model.VoucherId.HasValue && model.VoucherId.Value > 0 && model.VoucherId.Value < 2000000000) ? (int)model.VoucherId.Value : 0;
                if (checkVid <= 0 && model.ReceiptId.HasValue && model.ReceiptId.Value > 0 && model.ReceiptId.Value < 2000000000)
                {
                    checkVid = (int)model.ReceiptId.Value;
                }
                using (var checkCmd = conn.CreateCommand())
                {
                    checkCmd.Transaction = tx;
                    checkCmd.CommandText = "SELECT VoucherId, VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND ((@vid > 0 AND VoucherId = @vid) OR VoucherNo = @vno) AND IsDeleted = FALSE LIMIT 1";
                    checkCmd.Parameters.AddWithValue("@sid", sid);
                    checkCmd.Parameters.AddWithValue("@vid", checkVid);
                    checkCmd.Parameters.AddWithValue("@vno", receiptNo);
                    using var foundR = checkCmd.ExecuteReader();
                    if (foundR.Read())
                    {
                        existingVoucherId = Convert.ToInt32(foundR["VoucherId"]);
                        receiptNo = foundR["VoucherNo"]?.ToString() ?? receiptNo; // IMMUTABILITY
                    }
                }

                int voucherId = existingVoucherId;
                if (existingVoucherId > 0)
                {
                    // Revert previous bill settlement for this voucher to ensure clean state
                    using (var revertCmd = conn.CreateCommand())
                    {
                        revertCmd.Transaction = tx;
                        revertCmd.CommandText = @"
                            UPDATE jeevika_erp.SocMemberBill
                            SET PaidAmount = GREATEST(0, PaidAmount - @amt),
                                BalanceAmount = LEAST(TotalAmount, TotalAmount - GREATEST(0, PaidAmount - @amt)),
                                Status = CASE WHEN TotalAmount - GREATEST(0, PaidAmount - @amt) >= TotalAmount THEN 'Generated' ELSE 'PartPaid' END,
                                VoucherId = NULL
                            WHERE VoucherId = @vid AND SocietyId = @sid";
                        revertCmd.Parameters.AddWithValue("@vid", existingVoucherId);
                        revertCmd.Parameters.AddWithValue("@amt", model.Amount);
                        revertCmd.Parameters.AddWithValue("@sid", sid);
                        revertCmd.ExecuteNonQuery();
                    }

                    using var uCmd = conn.CreateCommand();
                    uCmd.Transaction = tx;
                    uCmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET VoucherDate = @vdate, CashBankCode = @cbCode, CashBankName = @cbName,
                            Amount = @amt, ChqNo = @chqNo, ChqDate = @chqDate, BankName = @bank,
                            PersonName = @person, PersonCode = @pcode, RefNo = @refNo, 
                            Narration = @narr, Particular1 = @part1, Particular2 = @part2, UpdatedAt = NOW()
                        WHERE VoucherId = @vid";
                    uCmd.Parameters.AddWithValue("@vid",    existingVoucherId);
                    uCmd.Parameters.AddWithValue("@vdate",  model.ReceiptDate);
                    uCmd.Parameters.AddWithValue("@cbCode", (object?)model.CashBankCode ?? DBNull.Value);
                    uCmd.Parameters.AddWithValue("@cbName", (object?)model.CashBankName ?? DBNull.Value);
                    uCmd.Parameters.AddWithValue("@amt",    model.Amount);
                    uCmd.Parameters.AddWithValue("@chqNo",  (object?)model.ChqNo        ?? DBNull.Value);
                    uCmd.Parameters.AddWithValue("@chqDate",model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                    uCmd.Parameters.AddWithValue("@bank",   (object?)model.BankName     ?? DBNull.Value);
                    uCmd.Parameters.AddWithValue("@person", $"{memName} ({flat})");
                    uCmd.Parameters.AddWithValue("@pcode",  !string.IsNullOrWhiteSpace(memCode) ? memCode : memberId.ToString());
                    uCmd.Parameters.AddWithValue("@refNo",  !string.IsNullOrWhiteSpace(model.BillNo) ? model.BillNo : (!string.IsNullOrWhiteSpace(memCode) ? memCode : DBNull.Value));
                    uCmd.Parameters.AddWithValue("@narr",   formattedNarration);
                    uCmd.Parameters.AddWithValue("@part1",  formattedParticular1);
                    uCmd.Parameters.AddWithValue("@part2",  formattedParticular2);
                    uCmd.ExecuteNonQuery();
                }
                else
                {
                    // Clean up any soft-deleted voucher with same number to prevent unique constraint violation
                    using (var cleanCmd = conn.CreateCommand())
                    {
                        cleanCmd.Transaction = tx;
                        cleanCmd.CommandText = @"
                            DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE);
                            DELETE FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE;";
                        cleanCmd.Parameters.AddWithValue("@sid",  sid);
                        cleanCmd.Parameters.AddWithValue("@fyid", fyid);
                        cleanCmd.Parameters.AddWithValue("@vno",  receiptNo);
                        cleanCmd.ExecuteNonQuery();
                    }

                    using var vCmd = conn.CreateCommand();
                    vCmd.Transaction = tx;
                    vCmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherHeader
                            (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, CashBankCode, CashBankName,
                             Amount, ChqNo, ChqDate, BankName, PersonName, PersonType, PersonCode, RefNo, Narration, Particular1, Particular2, Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                        VALUES
                            (@sid, @fyid, @vno, 'MemberReceipt', @vdate, @cbCode, @cbName,
                             @amt, @chqNo, @chqDate, @bank, @person, 'Member', @pcode, @refNo, @narr, @part1, @part2, 'Posted', FALSE, @user, NOW(), NOW())
                        RETURNING VoucherId";

                    vCmd.Parameters.AddWithValue("@sid",    sid);
                    vCmd.Parameters.AddWithValue("@fyid",   fyid);
                    vCmd.Parameters.AddWithValue("@vno",    receiptNo);
                    vCmd.Parameters.AddWithValue("@vdate",  model.ReceiptDate);
                    vCmd.Parameters.AddWithValue("@cbCode", (object?)model.CashBankCode ?? DBNull.Value);
                    vCmd.Parameters.AddWithValue("@cbName", (object?)model.CashBankName ?? DBNull.Value);
                    vCmd.Parameters.AddWithValue("@amt",    model.Amount);
                    vCmd.Parameters.AddWithValue("@chqNo",  (object?)model.ChqNo        ?? DBNull.Value);
                    vCmd.Parameters.AddWithValue("@chqDate",model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                    vCmd.Parameters.AddWithValue("@bank",   (object?)model.BankName     ?? DBNull.Value);
                    vCmd.Parameters.AddWithValue("@person", $"{memName} ({flat})");
                    vCmd.Parameters.AddWithValue("@pcode",  !string.IsNullOrWhiteSpace(memCode) ? memCode : memberId.ToString());
                    vCmd.Parameters.AddWithValue("@refNo",  !string.IsNullOrWhiteSpace(model.BillNo) ? model.BillNo : (!string.IsNullOrWhiteSpace(memCode) ? memCode : DBNull.Value));
                    vCmd.Parameters.AddWithValue("@narr",   formattedNarration);
                    vCmd.Parameters.AddWithValue("@part1",  formattedParticular1);
                    vCmd.Parameters.AddWithValue("@part2",  formattedParticular2);
                    vCmd.Parameters.AddWithValue("@user",   User.Identity?.Name ?? "ADMIN");

                    voucherId = Convert.ToInt32(vCmd.ExecuteScalar());
                }

                // 3. Double-Entry Posting in SocVoucherDetail
                // Clean up any existing details for this voucher
                using (var delDtl = conn.CreateCommand())
                {
                    delDtl.Transaction = tx;
                    delDtl.CommandText = "DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId = @vid";
                    delDtl.Parameters.AddWithValue("@vid", voucherId);
                    delDtl.ExecuteNonQuery();
                }

                // Resolve Cash/Bank Account
                int cbAccId = 0;
                string cbCode = model.CashBankCode ?? "";
                string cbName = model.CashBankName ?? "Cash In Hand";

                using (var findCb = conn.CreateCommand())
                {
                    findCb.Transaction = tx;
                    findCb.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND ((@code <> '' AND AccCode = @code) OR AccName ILIKE @name) AND IsDeleted = FALSE LIMIT 1";
                    findCb.Parameters.AddWithValue("@sid", sid);
                    findCb.Parameters.AddWithValue("@code", cbCode.Trim());
                    findCb.Parameters.AddWithValue("@name", cbName.Trim());
                    using var rCb = findCb.ExecuteReader();
                    if (rCb.Read())
                    {
                        cbAccId = Convert.ToInt32(rCb["AccountId"]);
                        cbCode  = rCb["AccCode"]?.ToString() ?? cbCode;
                        cbName  = rCb["AccName"]?.ToString() ?? cbName;
                    }
                }
                if (cbAccId <= 0)
                {
                    using var fbCb = conn.CreateCommand();
                    fbCb.Transaction = tx;
                    fbCb.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccCode = 'ASS-1001' OR AccName ILIKE '%Cash in Hand%') AND IsDeleted = FALSE LIMIT 1";
                    fbCb.Parameters.AddWithValue("@sid", sid);
                    using var rFb = fbCb.ExecuteReader();
                    if (rFb.Read())
                    {
                        cbAccId = Convert.ToInt32(rFb["AccountId"]);
                        cbCode  = rFb["AccCode"]?.ToString() ?? "ASS-1001";
                        cbName  = rFb["AccName"]?.ToString() ?? "Cash In Hand";
                    }
                }

                // Resolve Member Dues Account
                int duesAccId = 0;
                string duesCode = "ASS-1025";
                string duesName = "Dues From Members";

                using (var accCmd = conn.CreateCommand())
                {
                    accCmd.Transaction = tx;
                    accCmd.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccCode = 'ASS-1025' OR AccName ILIKE 'Dues From Members%') AND IsDeleted = FALSE LIMIT 1";
                    accCmd.Parameters.AddWithValue("@sid", sid);
                    using var rA = accCmd.ExecuteReader();
                    if (rA.Read())
                    {
                        duesAccId = Convert.ToInt32(rA["AccountId"]);
                        duesCode  = rA["AccCode"]?.ToString() ?? "ASS-1025";
                        duesName  = rA["AccName"]?.ToString() ?? "Dues From Members";
                    }
                }

                // Line 1: Debit Cash/Bank (Money received)
                using (var dCmd1 = conn.CreateCommand())
                {
                    dCmd1.Transaction = tx;
                    dCmd1.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 1, @aid, @code, @name, @amt, 0, @narr)";
                    dCmd1.Parameters.AddWithValue("@vid",  voucherId);
                    dCmd1.Parameters.AddWithValue("@aid",  cbAccId > 0 ? cbAccId : (object)DBNull.Value);
                    dCmd1.Parameters.AddWithValue("@code", cbCode);
                    dCmd1.Parameters.AddWithValue("@name", cbName);
                    dCmd1.Parameters.AddWithValue("@amt",  model.Amount);
                    dCmd1.Parameters.AddWithValue("@narr", formattedNarration);
                    dCmd1.ExecuteNonQuery();
                }

                // Line 2 & Line 3: Credit Member Dues (with Principal & Interest Split if any)
                if (intAmt > 0)
                {
                    // Line 2: Credit Member Dues (Principal Portion)
                    using (var dCmd2 = conn.CreateCommand())
                    {
                        dCmd2.Transaction = tx;
                        dCmd2.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, 2, @aid, @code, @name, 0, @amt, @narr)";
                        dCmd2.Parameters.AddWithValue("@vid",  voucherId);
                        dCmd2.Parameters.AddWithValue("@aid",  duesAccId > 0 ? duesAccId : (object)DBNull.Value);
                        dCmd2.Parameters.AddWithValue("@code", duesCode);
                        dCmd2.Parameters.AddWithValue("@name", duesName);
                        dCmd2.Parameters.AddWithValue("@amt",  prinAmt);
                        dCmd2.Parameters.AddWithValue("@narr", $"{memName} ({flat}) - {bType} Principal Receipt {receiptNo}");
                        dCmd2.ExecuteNonQuery();
                    }

                    // Line 3: Credit Member Dues - Interest (Interest Portion)
                    using (var dCmd3 = conn.CreateCommand())
                    {
                        dCmd3.Transaction = tx;
                        dCmd3.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, 3, @aid, @code, @name, 0, @amt, @narr)";
                        dCmd3.Parameters.AddWithValue("@vid",  voucherId);
                        dCmd3.Parameters.AddWithValue("@aid",  duesAccId > 0 ? duesAccId : (object)DBNull.Value);
                        dCmd3.Parameters.AddWithValue("@code", duesCode);
                        dCmd3.Parameters.AddWithValue("@name", "Interest on Dues");
                        dCmd3.Parameters.AddWithValue("@amt",  intAmt);
                        dCmd3.Parameters.AddWithValue("@narr", $"{memName} ({flat}) - {bType} Interest Collection {receiptNo}");
                        dCmd3.ExecuteNonQuery();
                    }
                }
                else
                {
                    // Line 2: Credit Member Dues (Full Amount)
                    using (var dCmd2 = conn.CreateCommand())
                    {
                        dCmd2.Transaction = tx;
                        dCmd2.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, 2, @aid, @code, @name, 0, @amt, @narr)";
                        dCmd2.Parameters.AddWithValue("@vid",  voucherId);
                        dCmd2.Parameters.AddWithValue("@aid",  duesAccId > 0 ? duesAccId : (object)DBNull.Value);
                        dCmd2.Parameters.AddWithValue("@code", duesCode);
                        dCmd2.Parameters.AddWithValue("@name", duesName);
                        dCmd2.Parameters.AddWithValue("@amt",  model.Amount);
                        dCmd2.Parameters.AddWithValue("@narr", $"{memName} ({flat}) - {bType} Receipt {receiptNo}");
                        dCmd2.ExecuteNonQuery();
                    }
                }

                // 4. Update Bill balance if BillId or BillNo is specified
                if (model.BillId.HasValue && model.BillId.Value > 0)
                {
                    using var bCmd = conn.CreateCommand();
                    bCmd.Transaction = tx;
                    bCmd.CommandText = @"
                        UPDATE jeevika_erp.SocMemberBill
                        SET PaidAmount    = PaidAmount + @amt,
                            BalanceAmount = TotalAmount - (PaidAmount + @amt),
                            Status        = CASE WHEN TotalAmount - (PaidAmount + @amt) <= 0 THEN 'Paid' ELSE 'PartPaid' END,
                            VoucherId     = @vid
                        WHERE BillId = @bid AND SocietyId = @sid";

                    bCmd.Parameters.AddWithValue("@amt", model.Amount);
                    bCmd.Parameters.AddWithValue("@vid", voucherId);
                    bCmd.Parameters.AddWithValue("@bid", model.BillId.Value);
                    bCmd.Parameters.AddWithValue("@sid", sid);
                    bCmd.ExecuteNonQuery();
                }
                else if (!string.IsNullOrWhiteSpace(model.BillNo) && model.BillNo != "—")
                {
                    using var bCmd = conn.CreateCommand();
                    bCmd.Transaction = tx;
                    bCmd.CommandText = @"
                        UPDATE jeevika_erp.SocMemberBill
                        SET PaidAmount    = PaidAmount + @amt,
                            BalanceAmount = TotalAmount - (PaidAmount + @amt),
                            Status        = CASE WHEN TotalAmount - (PaidAmount + @amt) <= 0 THEN 'Paid' ELSE 'PartPaid' END,
                            VoucherId     = @vid
                        WHERE BillNo = @bno AND SocietyId = @sid AND MemberId = @mid";

                    bCmd.Parameters.AddWithValue("@amt", model.Amount);
                    bCmd.Parameters.AddWithValue("@vid", voucherId);
                    bCmd.Parameters.AddWithValue("@bno", model.BillNo.Trim());
                    bCmd.Parameters.AddWithValue("@sid", sid);
                    bCmd.Parameters.AddWithValue("@mid", memberId);
                    bCmd.ExecuteNonQuery();
                }

                // 5. Real-Time Two-Way Sync: If an existing reversal entry references this receipt, update it in real time
                if (existingVoucherId > 0)
                {
                    string revEquivNo = receiptNo.Replace("MRV/", "MRV-R/").Replace("REC/", "REC-R/");
                    var matchSeq = System.Text.RegularExpressions.Regex.Match(receiptNo, @"(\d+)$");
                    string rcptSeq = matchSeq.Success ? matchSeq.Groups[1].Value : "";

                    var linkedReversals = new List<(int RevId, string RevNo)>();
                    using (var syncRevCmd = conn.CreateCommand())
                    {
                        syncRevCmd.Transaction = tx;
                        syncRevCmd.CommandText = @"
                            SELECT VoucherId, VoucherNo 
                            FROM jeevika_erp.SocVoucherHeader 
                            WHERE SocietyId = @sid 
                              AND VoucherType IN ('MemberReceiptReversal', 'ReceiptReversal') 
                              AND (
                                  RefNo = @rcptNo 
                                  OR VoucherNo = @revEquiv
                                  OR Narration ILIKE '%' || @rcptNo || '%' 
                                  OR Particular1 ILIKE '%' || @rcptNo || '%'
                                  OR (@seq <> '' AND VoucherNo ILIKE '%/' || @seq AND (PersonCode = @pcode OR PersonName = @person))
                                  OR (@seq <> '' AND RefNo ILIKE '%/' || @seq AND (PersonCode = @pcode OR PersonName = @person))
                              )
                              AND IsDeleted = FALSE";
                        syncRevCmd.Parameters.AddWithValue("@sid",      sid);
                        syncRevCmd.Parameters.AddWithValue("@rcptNo",   receiptNo);
                        syncRevCmd.Parameters.AddWithValue("@revEquiv", revEquivNo);
                        syncRevCmd.Parameters.AddWithValue("@seq",      rcptSeq);
                        syncRevCmd.Parameters.AddWithValue("@pcode",    !string.IsNullOrWhiteSpace(memCode) ? memCode : (object)DBNull.Value);
                        syncRevCmd.Parameters.AddWithValue("@person",   $"{memName} ({flat})");

                        using var rRev = syncRevCmd.ExecuteReader();
                        while (rRev.Read())
                        {
                            linkedReversals.Add((Convert.ToInt32(rRev["VoucherId"]), rRev["VoucherNo"]?.ToString() ?? ""));
                        }
                    }

                    foreach (var (revId, revNo) in linkedReversals)
                    {
                        // Update Reversal Header
                        using (var uRevCmd = conn.CreateCommand())
                        {
                            uRevCmd.Transaction = tx;
                            uRevCmd.CommandText = @"
                                UPDATE jeevika_erp.SocVoucherHeader SET
                                    CashBankCode = @cbCode,
                                    CashBankName = @cbName,
                                    Amount       = @amt,
                                    ChqNo        = @chqNo,
                                    ChqDate      = @chqDate,
                                    BankName     = @bank,
                                    PersonName   = @person,
                                    PersonCode   = @pcode,
                                    RefNo        = @rcptNo,
                                    Particular1  = @part1,
                                    Particular2  = @part2,
                                    Narration    = @narr,
                                    UpdatedAt    = NOW()
                                WHERE VoucherId = @revId";
                            uRevCmd.Parameters.AddWithValue("@revId", revId);
                            uRevCmd.Parameters.AddWithValue("@cbCode", (object?)cbCode ?? DBNull.Value);
                            uRevCmd.Parameters.AddWithValue("@cbName", (object?)cbName ?? DBNull.Value);
                            uRevCmd.Parameters.AddWithValue("@amt",    model.Amount);
                            uRevCmd.Parameters.AddWithValue("@chqNo",  (object?)model.ChqNo ?? DBNull.Value);
                            uRevCmd.Parameters.AddWithValue("@chqDate",model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                            uRevCmd.Parameters.AddWithValue("@bank",   (object?)model.BankName ?? DBNull.Value);
                            uRevCmd.Parameters.AddWithValue("@person", $"{memName} ({flat})");
                            uRevCmd.Parameters.AddWithValue("@pcode",  !string.IsNullOrWhiteSpace(memCode) ? memCode : model.MemberId.ToString());
                            uRevCmd.Parameters.AddWithValue("@rcptNo", receiptNo);
                            uRevCmd.Parameters.AddWithValue("@part1",  $"[BillType: {bType}] Reversal of Receipt {receiptNo}");
                            uRevCmd.Parameters.AddWithValue("@part2",  "Cheque Dishonoured by Bank");
                            uRevCmd.Parameters.AddWithValue("@narr",   $"{bType.ToUpper()} Receipt Reversal ({receiptNo})");
                            uRevCmd.ExecuteNonQuery();
                        }

                        // Refresh Reversal Details (SocVoucherDetail)
                        using (var delRevDtl = conn.CreateCommand())
                        {
                            delRevDtl.Transaction = tx;
                            delRevDtl.CommandText = "DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId = @revId";
                            delRevDtl.Parameters.AddWithValue("@revId", revId);
                            delRevDtl.ExecuteNonQuery();
                        }

                        // Line 1: Credit Cash/Bank
                        using (var dRev1 = conn.CreateCommand())
                        {
                            dRev1.Transaction = tx;
                            dRev1.CommandText = @"
                                INSERT INTO jeevika_erp.SocVoucherDetail
                                    (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                                VALUES
                                    (@vid, 1, @aid, @code, @name, 0, @amt, @narr)";
                            dRev1.Parameters.AddWithValue("@vid",  revId);
                            dRev1.Parameters.AddWithValue("@aid",  cbAccId > 0 ? cbAccId : (object)DBNull.Value);
                            dRev1.Parameters.AddWithValue("@code", cbCode);
                            dRev1.Parameters.AddWithValue("@name", cbName);
                            dRev1.Parameters.AddWithValue("@amt",  model.Amount);
                            dRev1.Parameters.AddWithValue("@narr", $"Receipt reversal from {cbName}");
                            dRev1.ExecuteNonQuery();
                        }

                        // Line 2: Debit Member Dues
                        using (var dRev2 = conn.CreateCommand())
                        {
                            dRev2.Transaction = tx;
                            dRev2.CommandText = @"
                                INSERT INTO jeevika_erp.SocVoucherDetail
                                    (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                                VALUES
                                    (@vid, 2, @aid, @code, @name, @amt, 0, @narr)";
                            dRev2.Parameters.AddWithValue("@vid",  revId);
                            dRev2.Parameters.AddWithValue("@aid",  duesAccId > 0 ? duesAccId : (object)DBNull.Value);
                            dRev2.Parameters.AddWithValue("@code", duesCode);
                            dRev2.Parameters.AddWithValue("@name", $"Dues From Members - {memName} ({flat})");
                            dRev2.Parameters.AddWithValue("@amt",  model.Amount);
                            dRev2.Parameters.AddWithValue("@narr", $"Dues restored via Reversal {revNo}");
                            dRev2.ExecuteNonQuery();
                        }
                    }
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = "Member receipt recorded successfully.",
                    receiptNo,
                    voucherId,
                    billType = bType,
                    principalAmount = model.PrincipalAmount > 0 ? model.PrincipalAmount : (model.Amount - (model.InterestAmount ?? 0)),
                    interestAmount = model.InterestAmount ?? 0
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/member-receipts/{*id} ───────────────────────────
        [HttpDelete("{*id}")]
        public IActionResult DeleteReceipt(string id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();
                using var cmd  = conn.CreateCommand();
                cmd.Transaction = tx;

                if (int.TryParse(id, out int numId))
                {
                    cmd.CommandText = @"
                        -- 1. Revert any linked member bill balance
                        UPDATE jeevika_erp.SocMemberBill b
                        SET PaidAmount = GREATEST(0, b.PaidAmount - v.Amount),
                            BalanceAmount = LEAST(b.TotalAmount, b.TotalAmount - GREATEST(0, b.PaidAmount - v.Amount)),
                            Status = CASE WHEN b.TotalAmount - GREATEST(0, b.PaidAmount - v.Amount) >= b.TotalAmount THEN 'Generated' ELSE 'PartPaid' END,
                            VoucherId = NULL
                        FROM jeevika_erp.SocVoucherHeader v
                        WHERE b.VoucherId = v.VoucherId AND v.SocietyId = b.SocietyId AND (v.VoucherId = @numId OR v.VoucherNo = @id) AND v.IsDeleted = FALSE;

                        -- 2. Delete voucher details
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE
                        );

                        -- 3. Soft-delete voucher header
                        UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE;";
                    cmd.Parameters.AddWithValue("@numId", numId);
                    cmd.Parameters.AddWithValue("@id",    id);
                }
                else
                {
                    cmd.CommandText = @"
                        -- 1. Revert any linked member bill balance
                        UPDATE jeevika_erp.SocMemberBill b
                        SET PaidAmount = GREATEST(0, b.PaidAmount - v.Amount),
                            BalanceAmount = LEAST(b.TotalAmount, b.TotalAmount - GREATEST(0, b.PaidAmount - v.Amount)),
                            Status = CASE WHEN b.TotalAmount - GREATEST(0, b.PaidAmount - v.Amount) >= b.TotalAmount THEN 'Generated' ELSE 'PartPaid' END,
                            VoucherId = NULL
                        FROM jeevika_erp.SocVoucherHeader v
                        WHERE b.VoucherId = v.VoucherId AND v.SocietyId = b.SocietyId AND v.VoucherNo = @id AND v.IsDeleted = FALSE;

                        -- 2. Delete voucher details
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE VoucherNo = @id AND IsDeleted = FALSE
                        );

                        -- 3. Soft-delete voucher header
                        UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherNo = @id AND IsDeleted = FALSE;";
                    cmd.Parameters.AddWithValue("@id", id);
                }

                cmd.ExecuteNonQuery();
                tx.Commit();

                return Ok(new { success = true, message = "Member receipt deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public static void EnsureReceiptLedgerEntries(Npgsql.NpgsqlConnection conn, int societyId, Npgsql.NpgsqlTransaction? tx = null)
        {
            if (societyId <= 0) return;

            try
            {
                var missingReceipts = new List<(int VoucherId, string VoucherNo, string? CbCode, string? CbName, decimal Amount, string? PersonName, string? Narration, string? Part1)>();

                using (var findCmd = conn.CreateCommand())
                {
                    if (tx != null) findCmd.Transaction = tx;
                    findCmd.CommandText = @"
                        SELECT vh.VoucherId, vh.VoucherNo, vh.CashBankCode, vh.CashBankName, vh.Amount, vh.PersonName, vh.Narration, vh.Particular1
                        FROM jeevika_erp.SocVoucherHeader vh
                        WHERE vh.SocietyId = @sid
                          AND vh.VoucherType = 'MemberReceipt'
                          AND vh.IsDeleted = FALSE
                          AND NOT EXISTS (
                              SELECT 1 FROM jeevika_erp.SocVoucherDetail vd WHERE vd.VoucherId = vh.VoucherId
                          )";
                    findCmd.Parameters.AddWithValue("@sid", societyId);
                    using var r = findCmd.ExecuteReader();
                    while (r.Read())
                    {
                        missingReceipts.Add((
                            Convert.ToInt32(r["VoucherId"]),
                            r["VoucherNo"]?.ToString() ?? "",
                            r["CashBankCode"]?.ToString(),
                            r["CashBankName"]?.ToString(),
                            Convert.ToDecimal(r["Amount"]),
                            r["PersonName"]?.ToString(),
                            r["Narration"]?.ToString(),
                            r["Particular1"]?.ToString()
                        ));
                    }
                }

                if (missingReceipts.Count == 0) return;

                // Resolve Dues Account
                int duesAccId = 0;
                string duesCode = "ASS-1025";
                string duesName = "Dues From Members";
                using (var accCmd = conn.CreateCommand())
                {
                    if (tx != null) accCmd.Transaction = tx;
                    accCmd.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccCode = 'ASS-1025' OR AccName ILIKE 'Dues From Members%') AND IsDeleted = FALSE LIMIT 1";
                    accCmd.Parameters.AddWithValue("@sid", societyId);
                    using var rA = accCmd.ExecuteReader();
                    if (rA.Read())
                    {
                        duesAccId = Convert.ToInt32(rA["AccountId"]);
                        duesCode  = rA["AccCode"]?.ToString() ?? "ASS-1025";
                        duesName  = rA["AccName"]?.ToString() ?? "Dues From Members";
                    }
                }

                foreach (var rc in missingReceipts)
                {
                    int cbAccId = 0;
                    string cbCode = rc.CbCode ?? "";
                    string cbName = rc.CbName ?? "Cash in Hand";

                    using (var findCb = conn.CreateCommand())
                    {
                        if (tx != null) findCb.Transaction = tx;
                        findCb.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND ((@code <> '' AND AccCode = @code) OR AccName ILIKE @name) AND IsDeleted = FALSE LIMIT 1";
                        findCb.Parameters.AddWithValue("@sid", societyId);
                        findCb.Parameters.AddWithValue("@code", cbCode.Trim());
                        findCb.Parameters.AddWithValue("@name", cbName.Trim());
                        using var rCb = findCb.ExecuteReader();
                        if (rCb.Read())
                        {
                            cbAccId = Convert.ToInt32(rCb["AccountId"]);
                            cbCode  = rCb["AccCode"]?.ToString() ?? cbCode;
                            cbName  = rCb["AccName"]?.ToString() ?? cbName;
                        }
                    }
                    if (cbAccId <= 0)
                    {
                        using var fbCb = conn.CreateCommand();
                        if (tx != null) fbCb.Transaction = tx;
                        fbCb.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccCode = 'ASS-1001' OR AccName ILIKE '%Cash in Hand%') AND IsDeleted = FALSE LIMIT 1";
                        fbCb.Parameters.AddWithValue("@sid", societyId);
                        using var rFb = fbCb.ExecuteReader();
                        if (rFb.Read())
                        {
                            cbAccId = Convert.ToInt32(rFb["AccountId"]);
                            cbCode  = rFb["AccCode"]?.ToString() ?? "ASS-1001";
                            cbName  = rFb["AccName"]?.ToString() ?? "Cash in Hand";
                        }
                    }

                    string narr1 = !string.IsNullOrWhiteSpace(rc.Narration) ? rc.Narration : (!string.IsNullOrWhiteSpace(rc.Part1) ? rc.Part1 : "Member Receipt");
                    string narr2 = $"{rc.PersonName ?? "Member"} - Receipt {rc.VoucherNo}";

                    // Insert Line 1: Debit Cash/Bank
                    using (var dCmd1 = conn.CreateCommand())
                    {
                        if (tx != null) dCmd1.Transaction = tx;
                        dCmd1.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, 1, @aid, @code, @name, @amt, 0, @narr)";
                        dCmd1.Parameters.AddWithValue("@vid",  rc.VoucherId);
                        dCmd1.Parameters.AddWithValue("@aid",  cbAccId > 0 ? cbAccId : (object)DBNull.Value);
                        dCmd1.Parameters.AddWithValue("@code", cbCode);
                        dCmd1.Parameters.AddWithValue("@name", cbName);
                        dCmd1.Parameters.AddWithValue("@amt",  rc.Amount);
                        dCmd1.Parameters.AddWithValue("@narr", narr1);
                        dCmd1.ExecuteNonQuery();
                    }

                    // Insert Line 2: Credit Member Dues
                    using (var dCmd2 = conn.CreateCommand())
                    {
                        if (tx != null) dCmd2.Transaction = tx;
                        dCmd2.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, 2, @aid, @code, @name, 0, @amt, @narr)";
                        dCmd2.Parameters.AddWithValue("@vid",  rc.VoucherId);
                        dCmd2.Parameters.AddWithValue("@aid",  duesAccId > 0 ? duesAccId : (object)DBNull.Value);
                        dCmd2.Parameters.AddWithValue("@code", duesCode);
                        dCmd2.Parameters.AddWithValue("@name", duesName);
                        dCmd2.Parameters.AddWithValue("@amt",  rc.Amount);
                        dCmd2.Parameters.AddWithValue("@narr", narr2);
                        dCmd2.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EnsureReceiptLedgerEntries] Warning: {ex.Message}");
            }
        }

        // ── GET /api/member-receipts/template-meta?societyId=X ───────
        [HttpGet("template-meta")]
        public IActionResult GetTemplateMeta([FromQuery] int societyId)
        {
            if (societyId <= 0) societyId = 4;
            try
            {
                using var conn = DbHelper.GetConn();

                // 1. Bill Types
                var billTypes = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT BillTypeId, BillTypeName FROM jeevika_erp.SocBillType WHERE SocietyId = @sid OR SocietyId = 1 ORDER BY BillTypeId ASC";
                    cmd.Parameters.AddWithValue("@sid", societyId);
                    using var r = cmd.ExecuteReader();
                    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    while (r.Read())
                    {
                        var name = r["BillTypeName"]?.ToString()?.Trim() ?? "";
                        if (!string.IsNullOrEmpty(name) && seen.Add(name))
                        {
                            billTypes.Add(new { billTypeId = Convert.ToInt32(r["BillTypeId"]), billTypeName = name });
                        }
                    }
                }
                if (billTypes.Count == 0)
                {
                    billTypes.Add(new { billTypeId = 1, billTypeName = "Maintenance" });
                    billTypes.Add(new { billTypeId = 2, billTypeName = "Major Repair" });
                }

                // 2. Members with current dues
                var rawMembers = new List<(int MemberId, string Code, string Name, string Wing, string Flat, string FlatStr, string Label)>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT MemberId, MemCode, MemName, Wing, FlatNo FROM jeevika_erp.SocMember WHERE (SocietyId = @sid OR SocietyId = 1) AND IsDeleted = FALSE ORDER BY MemCode ASC, MemName ASC";
                    cmd.Parameters.AddWithValue("@sid", societyId);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        var mid = Convert.ToInt32(r["MemberId"]);
                        var code = r["MemCode"]?.ToString()?.Trim() ?? mid.ToString();
                        var name = r["MemName"]?.ToString()?.Trim() ?? "";
                        var wing = r["Wing"]?.ToString()?.Trim() ?? "";
                        var flat = r["FlatNo"]?.ToString()?.Trim() ?? "";
                        var flatStr = !string.IsNullOrEmpty(wing) ? $"{wing}-{flat}" : flat;
                        var label = !string.IsNullOrEmpty(flatStr) ? $"[{code}] {name} ({flatStr})" : $"[{code}] {name}";
                        rawMembers.Add((mid, code, name, wing, flat, flatStr, label));
                    }
                }

                var members = new List<object>();
                foreach (var rm in rawMembers)
                {
                    decimal prinDue = 0;
                    decimal intDue = 0;
                    decimal netDue = 0;
                    try
                    {
                        var d = CalculateMemberDueInternal(conn, societyId, rm.MemberId, "Maintenance");
                        prinDue = d.PrincipalDue;
                        intDue = d.InterestDue;
                        netDue = d.NetDue;
                    }
                    catch { }

                    members.Add(new
                    {
                        memberId = rm.MemberId,
                        memCode = rm.Code,
                        memName = rm.Name,
                        wing = rm.Wing,
                        flatNo = rm.Flat,
                        label = rm.Label,
                        principalDue = prinDue,
                        interestDue = intDue,
                        netDue = netDue
                    });
                }

                // 3. Accounts under Asset -> Cash & Bank Balance
                var cashAccounts = new List<object>();
                var bankAccounts = new List<object>();
                var allDepositAccounts = new List<object>();
                var seenAcc = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        SELECT a.AccountId, a.AccCode, a.AccName, a.GroupId, g.GrpName, a.GrpMainId
                        FROM jeevika_erp.SocAccount a
                        LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                        WHERE (a.SocietyId = @sid OR a.SocietyId = 1) AND a.IsDeleted = FALSE
                        ORDER BY a.AccCode ASC, a.AccName ASC";
                    cmd.Parameters.AddWithValue("@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        var aid = Convert.ToInt32(r["AccountId"]);
                        var code = r["AccCode"]?.ToString()?.Trim() ?? "";
                        var name = r["AccName"]?.ToString()?.Trim() ?? "";
                        var gmName = r["GrpName"]?.ToString()?.Trim()?.ToLower() ?? "";
                        var grpMainId = r["GrpMainId"] != DBNull.Value ? Convert.ToInt32(r["GrpMainId"]) : 0;

                        bool isAsset = (grpMainId == 1);
                        bool isCashBankGrp = gmName.Contains("cash & bank") || gmName.Contains("cash and bank") ||
                                             gmName.Contains("bank accounts") || gmName.Contains("cash in hand") || gmName.Contains("cash-in-hand");

                        if (!isAsset || !isCashBankGrp)
                        {
                            if (code != "ASS-1001" && code != "ASS-1002" && code != "ASS-1003" && !name.ToLower().Contains("cash in hand"))
                                continue;
                        }

                        var key = (!string.IsNullOrEmpty(code) ? code : name).ToLower();
                        if (seenAcc.Contains(key)) continue;
                        seenAcc.Add(key);

                        var label = !string.IsNullOrEmpty(code) ? $"[{code}] {name}" : name;
                        var accObj = new { accountId = aid, accCode = code, accName = name, label };
                        allDepositAccounts.Add(accObj);

                        bool isCashAcc = (code == "ASS-1001" || name.ToLower().Contains("cash in hand") || (name.ToLower().Contains("cash") && !name.ToLower().Contains("bank")));
                        if (isCashAcc)
                        {
                            cashAccounts.Add(accObj);
                        }
                        else
                        {
                            bankAccounts.Add(accObj);
                        }
                    }
                }

                if (cashAccounts.Count == 0)
                {
                    var fallbackCash = new { accountId = 0, accCode = "ASS-1001", accName = "Cash in Hand", label = "[ASS-1001] Cash in Hand" };
                    cashAccounts.Add(fallbackCash);
                    allDepositAccounts.Insert(0, fallbackCash);
                }

                var transactionTypes = new[] { "Cheque", "NEFT", "UPI", "IMPS", "IB [Internal Bank Transfer]", "RTGS", "Cash" };
                var allocationModes = new[] { "AUTO", "MANUAL" };

                return Ok(new
                {
                    success = true,
                    billTypes,
                    members,
                    cashAccounts,
                    bankAccounts,
                    allDepositAccounts,
                    transactionTypes,
                    allocationModes
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/member-receipts/export-data?societyId=X&fyId=Y ──
        [HttpGet("export-data")]
        public IActionResult GetExportData([FromQuery] int societyId = 0, [FromQuery] int fyId = 0, [FromQuery] string? billType = null)
        {
            if (societyId <= 0) societyId = 4;
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureReceiptLedgerEntries(conn, societyId);

                using var cmd = conn.CreateCommand();
                string sql = @"
                    SELECT vh.VoucherId, vh.SocietyId, vh.FYId, vh.VoucherNo, vh.VoucherDate, vh.CashBankCode, vh.CashBankName,
                           vh.Amount, vh.ChqNo, vh.ChqDate, vh.BankName, vh.PersonName, vh.PersonCode, vh.RefNo, vh.Narration, vh.Particular1, vh.Particular2, vh.Status,
                           m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo
                    FROM jeevika_erp.SocVoucherHeader vh
                    LEFT JOIN jeevika_erp.SocMember m 
                           ON (vh.PersonCode = m.MemCode OR vh.PersonCode = CAST(m.MemberId AS VARCHAR) OR vh.RefNo = m.MemCode)
                          AND (m.SocietyId = vh.SocietyId OR m.SocietyId = 1) AND m.IsDeleted = FALSE
                    WHERE vh.SocietyId = @sid AND vh.VoucherType = 'MemberReceipt' AND vh.IsDeleted = FALSE";

                if (fyId > 0)
                {
                    sql += " AND vh.FYId = @fyid";
                    cmd.Parameters.AddWithValue("@fyid", fyId);
                }

                sql += " ORDER BY vh.VoucherDate DESC, vh.VoucherId DESC";
                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid", societyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    var personStr = r["PersonName"].ToString() ?? "";
                    string parsedMemberName = personStr;
                    string parsedFlat = "";
                    var matchFlat = System.Text.RegularExpressions.Regex.Match(personStr, @"^(.*?)\s*\((.*?)\)$");
                    if (matchFlat.Success)
                    {
                        parsedMemberName = matchFlat.Groups[1].Value.Trim();
                        parsedFlat = matchFlat.Groups[2].Value.Trim();
                    }
                    if (r["MemName"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["MemName"]?.ToString()))
                    {
                        parsedMemberName = r["MemName"]?.ToString()?.Trim() ?? parsedMemberName;
                        var w = r["Wing"]?.ToString()?.Trim() ?? "";
                        var f = r["FlatNo"]?.ToString()?.Trim() ?? "";
                        parsedFlat = !string.IsNullOrEmpty(w) ? $"{w}-{f}" : f;
                    }

                    var part1Str = r["Particular1"] != DBNull.Value ? r["Particular1"].ToString() ?? "" : "";
                    var narrStr = r["Narration"] != DBNull.Value ? r["Narration"].ToString() ?? "" : "";
                    string parsedBillType = "Maintenance";

                    var btMatch = System.Text.RegularExpressions.Regex.Match(part1Str + " " + narrStr, @"\[BillType:\s*([^\]]+)\]", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    if (btMatch.Success)
                    {
                        parsedBillType = btMatch.Groups[1].Value.Trim();
                    }
                    else if (part1Str.IndexOf("major repair", StringComparison.OrdinalIgnoreCase) >= 0 || narrStr.IndexOf("major repair", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        parsedBillType = "Major Repair";
                    }
                    else if (part1Str.IndexOf("sinking", StringComparison.OrdinalIgnoreCase) >= 0 || narrStr.IndexOf("sinking", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        parsedBillType = "Sinking Fund";
                    }
                    else
                    {
                        var rMatch = System.Text.RegularExpressions.Regex.Match(part1Str + " " + narrStr, @"^([A-Za-z\s]+?)\s+Receipt", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                        if (rMatch.Success && !string.IsNullOrWhiteSpace(rMatch.Groups[1].Value))
                        {
                            parsedBillType = rMatch.Groups[1].Value.Trim();
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(billType) && !billType.Equals("ALL", StringComparison.OrdinalIgnoreCase))
                    {
                        if (!parsedBillType.Equals(billType.Trim(), StringComparison.OrdinalIgnoreCase))
                            continue;
                    }

                    var part2Str = r["Particular2"] != DBNull.Value ? r["Particular2"].ToString() ?? "" : "";
                    decimal parsedPrinAmt = Convert.ToDecimal(r["Amount"]);
                    decimal parsedIntAmt = 0.00m;

                    var mBif = System.Text.RegularExpressions.Regex.Match(part2Str, @"\[Bifurcation:\s*Principal=([\d\.]+),\s*Interest=([\d\.]+)\]");
                    if (mBif.Success)
                    {
                        if (decimal.TryParse(mBif.Groups[1].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decimal pVal))
                            parsedPrinAmt = pVal;
                        if (decimal.TryParse(mBif.Groups[2].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decimal iVal))
                            parsedIntAmt = iVal;
                    }

                    var cbName = r["CashBankName"]?.ToString() ?? "Cash in Hand";
                    var cbCode = r["CashBankCode"]?.ToString() ?? "";
                    bool isCash = cbCode == "ASS-1001" || cbName.ToLower().Contains("cash in hand") || (cbName.ToLower().Contains("cash") && !cbName.ToLower().Contains("bank"));
                    var debitType = isCash ? "Cash" : "Bank";
                    var depositAcc = !string.IsNullOrEmpty(cbCode) ? $"[{cbCode}] {cbName}" : cbName;

                    var memCode = r["MemCode"]?.ToString() ?? (r["PersonCode"]?.ToString() ?? "");
                    var chq = r["ChqNo"]?.ToString() ?? "";
                    string transType = isCash ? "Cash" : (!string.IsNullOrWhiteSpace(chq) ? "Cheque" : "NEFT");

                    list.Add(new
                    {
                        receiptNo   = r["VoucherNo"].ToString() ?? "",
                        receiptDate = ((DateTime)r["VoucherDate"]).ToString("dd-MM-yyyy"),
                        billType    = parsedBillType,
                        memberCode  = memCode,
                        memberName  = parsedMemberName,
                        wingFlat    = parsedFlat,
                        debitAccountType = debitType,
                        depositToAccount = depositAcc,
                        transactionType  = transType,
                        chqNo       = chq,
                        chqDate     = r["ChqDate"] != DBNull.Value ? ((DateTime)r["ChqDate"]).ToString("dd-MM-yyyy") : "",
                        refNo       = r["RefNo"]?.ToString() ?? "",
                        drawnOnBank = r["BankName"]?.ToString() ?? "",
                        amount      = Convert.ToDecimal(r["Amount"]),
                        allocationMode = (parsedIntAmt > 0) ? "MANUAL" : "AUTO",
                        principalAmount = parsedPrinAmt,
                        interestAmount  = parsedIntAmt,
                        againstBillNo = r["RefNo"]?.ToString() ?? "",
                        particular1 = part1Str,
                        particular2 = part2Str,
                        status      = r["Status"].ToString() ?? "Posted"
                    });
                }

                return Ok(new { success = true, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/member-receipts/validate-bulk ───────────────────
        [HttpPost("validate-bulk")]
        public IActionResult ValidateBulk([FromBody] BulkReceiptValidateRequest req)
        {
            if (req == null || req.Rows == null || req.Rows.Count == 0)
                return BadRequest(new { success = false, message = "No receipt rows provided." });

            int sid = req.SocietyId > 0 ? req.SocietyId : 4;
            int fyid = req.FYId > 0 ? req.FYId : 1;

            try
            {
                using var conn = DbHelper.GetConn();

                // 1. Preload master entities for resolution
                var members = new List<(int Id, string Code, string Name, string Wing, string Flat)>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT MemberId, MemCode, MemName, Wing, FlatNo FROM jeevika_erp.SocMember WHERE (SocietyId = @sid OR SocietyId = 1) AND IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@sid", sid);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        members.Add((
                            Convert.ToInt32(r["MemberId"]),
                            r["MemCode"]?.ToString()?.Trim() ?? "",
                            r["MemName"]?.ToString()?.Trim() ?? "",
                            r["Wing"]?.ToString()?.Trim() ?? "",
                            r["FlatNo"]?.ToString()?.Trim() ?? ""
                        ));
                    }
                }

                var billTypes = new Dictionary<string, (int Id, string Name)>(StringComparer.OrdinalIgnoreCase);
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT BillTypeId, BillTypeName FROM jeevika_erp.SocBillType WHERE SocietyId = @sid OR SocietyId = 1";
                    cmd.Parameters.AddWithValue("@sid", sid);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        var n = r["BillTypeName"]?.ToString()?.Trim() ?? "";
                        if (!string.IsNullOrEmpty(n) && !billTypes.ContainsKey(n))
                        {
                            billTypes[n] = (Convert.ToInt32(r["BillTypeId"]), n);
                        }
                    }
                }
                if (!billTypes.ContainsKey("Maintenance")) billTypes["Maintenance"] = (1, "Maintenance");
                if (!billTypes.ContainsKey("Major Repair")) billTypes["Major Repair"] = (2, "Major Repair");

                var accounts = new List<(int Id, string Code, string Name, bool IsCash)>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        SELECT a.AccountId, a.AccCode, a.AccName, g.GrpName
                        FROM jeevika_erp.SocAccount a
                        LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                        WHERE (a.SocietyId = @sid OR a.SocietyId = 1) AND a.IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@sid", sid);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        var c = r["AccCode"]?.ToString()?.Trim() ?? "";
                        var n = r["AccName"]?.ToString()?.Trim() ?? "";
                        var g = r["GrpName"]?.ToString()?.Trim()?.ToLower() ?? "";
                        bool isCash = c == "ASS-1001" || n.ToLower().Contains("cash") || g.Contains("cash");
                        accounts.Add((Convert.ToInt32(r["AccountId"]), c, n, isCash));
                    }
                }

                var existingVouchers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@sid", sid);
                    cmd.Parameters.AddWithValue("@fyid", fyid);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        var v = r["VoucherNo"]?.ToString()?.Trim();
                        if (!string.IsNullOrEmpty(v)) existingVouchers.Add(v);
                    }
                }

                int validCount = 0;
                int errorCount = 0;

                foreach (var row in req.Rows)
                {
                    row.Errors.Clear();
                    row.IsValid = true;

                    // 1. Validate Date (Optional - defaults to today)
                    if (string.IsNullOrWhiteSpace(row.ReceiptDate))
                    {
                        row.ReceiptDate = DateTime.Today.ToString("dd-MM-yyyy");
                    }
                    else
                    {
                        if (!DateTime.TryParseExact(row.ReceiptDate.Trim(), new[] { "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yyyy", "d/M/yyyy", "d-M-yyyy", "yyyy/MM/dd", "yyyy-MM-dd HH:mm:ss", "dd-MM-yyyy HH:mm:ss", "dd/MM/yyyy HH:mm:ss" },
                            System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out _) &&
                            !DateTime.TryParse(row.ReceiptDate.Trim(), System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out _))
                        {
                            row.Errors.Add($"Invalid Date format '{row.ReceiptDate}'. Expected DD-MM-YYYY or YYYY-MM-DD.");
                        }
                    }

                    // 3. Resolve Member & Strictly Detect Conflicts (Rule 11)
                    (int Id, string Code, string Name, string Wing, string Flat)? memByCode = null;
                    (int Id, string Code, string Name, string Wing, string Flat)? memByName = null;
                    (int Id, string Code, string Name, string Wing, string Flat)? memByFlat = null;
                    var mCode = row.MemberCode?.Trim() ?? "";
                    var mName = row.MemberName?.Trim() ?? "";
                    var mFlat = row.WingFlat?.Trim() ?? "";

                    if (!string.IsNullOrEmpty(mCode))
                    {
                        var f = members.FirstOrDefault(m => m.Code.Equals(mCode, StringComparison.OrdinalIgnoreCase) || m.Id.ToString() == mCode);
                        if (f.Id > 0) memByCode = f;
                    }

                    if (!string.IsNullOrEmpty(mName))
                    {
                        var mMatch = System.Text.RegularExpressions.Regex.Match(mName, @"\[(.*?)\]");
                        if (mMatch.Success)
                        {
                            var bracketCode = mMatch.Groups[1].Value.Trim();
                            var f = members.FirstOrDefault(m => m.Code.Equals(bracketCode, StringComparison.OrdinalIgnoreCase) || m.Id.ToString() == bracketCode);
                            if (f.Id > 0) memByName = f;
                        }
                    }

                    if (memByName == null && !string.IsNullOrEmpty(mName))
                    {
                        var cleanName = System.Text.RegularExpressions.Regex.Replace(mName, @"\[.*?\]|\(.*?\)", "").Trim().ToLower();
                        var f = members.FirstOrDefault(m => m.Name.Equals(cleanName, StringComparison.OrdinalIgnoreCase));
                        if (f.Id > 0) memByName = f;
                        else
                        {
                            var f2 = members.FirstOrDefault(m => m.Name.ToLower().Contains(cleanName) || cleanName.Contains(m.Name.ToLower()));
                            if (f2.Id > 0) memByName = f2;
                        }
                    }

                    if (!string.IsNullOrEmpty(mFlat))
                    {
                        var cleanFlat = mFlat.Trim().ToLower();
                        var f = members.FirstOrDefault(m =>
                            (!string.IsNullOrEmpty(m.Wing) && $"{m.Wing}-{m.Flat}".Equals(cleanFlat, StringComparison.OrdinalIgnoreCase)) ||
                            (!string.IsNullOrEmpty(m.Wing) && $"{m.Wing}{m.Flat}".Equals(cleanFlat, StringComparison.OrdinalIgnoreCase)) ||
                            m.Flat.Equals(cleanFlat, StringComparison.OrdinalIgnoreCase)
                        );
                        if (f.Id > 0) memByFlat = f;
                    }

                    if (memByCode != null && memByName != null)
                    {
                        if (memByCode.Value.Id != memByName.Value.Id)
                        {
                            row.Errors.Add($"Member conflict: Member Code '{mCode}' belongs to '{memByCode.Value.Name}', but Member Name '{mName}' was provided. They do not belong to the same Member.");
                        }
                        else
                        {
                            row.ResolvedMemberId = memByCode.Value.Id;
                            row.ResolvedMemberName = memByCode.Value.Name;
                            row.ResolvedFlatNo = !string.IsNullOrEmpty(memByCode.Value.Wing) ? $"{memByCode.Value.Wing}-{memByCode.Value.Flat}" : memByCode.Value.Flat;
                        }
                    }
                    else if (memByCode != null)
                    {
                        row.ResolvedMemberId = memByCode.Value.Id;
                        row.ResolvedMemberName = memByCode.Value.Name;
                        row.ResolvedFlatNo = !string.IsNullOrEmpty(memByCode.Value.Wing) ? $"{memByCode.Value.Wing}-{memByCode.Value.Flat}" : memByCode.Value.Flat;
                    }
                    else if (memByName != null)
                    {
                        row.ResolvedMemberId = memByName.Value.Id;
                        row.ResolvedMemberName = memByName.Value.Name;
                        row.ResolvedFlatNo = !string.IsNullOrEmpty(memByName.Value.Wing) ? $"{memByName.Value.Wing}-{memByName.Value.Flat}" : memByName.Value.Flat;
                    }
                    else if (memByFlat != null)
                    {
                        row.ResolvedMemberId = memByFlat.Value.Id;
                        row.ResolvedMemberName = memByFlat.Value.Name;
                        row.ResolvedFlatNo = !string.IsNullOrEmpty(memByFlat.Value.Wing) ? $"{memByFlat.Value.Wing}-{memByFlat.Value.Flat}" : memByFlat.Value.Flat;
                    }
                    else
                    {
                        row.Errors.Add($"Member '{(!string.IsNullOrEmpty(mCode) ? mCode : (!string.IsNullOrEmpty(mName) ? mName : mFlat))}' could not be resolved from Member Master.");
                    }

                    // 4. Resolve Bill Type
                    var bTypeStr = !string.IsNullOrWhiteSpace(row.BillType) ? row.BillType.Trim() : "Maintenance";
                    if (billTypes.TryGetValue(bTypeStr, out var bt))
                    {
                        row.ResolvedBillTypeId = bt.Id;
                        row.ResolvedBillTypeName = bt.Name;
                    }
                    else
                    {
                        var fb = billTypes.Values.FirstOrDefault(v => v.Name.IndexOf(bTypeStr, StringComparison.OrdinalIgnoreCase) >= 0);
                        if (fb.Id > 0)
                        {
                            row.ResolvedBillTypeId = fb.Id;
                            row.ResolvedBillTypeName = fb.Name;
                        }
                        else
                        {
                            row.Errors.Add($"Bill Type '{bTypeStr}' not found in Bill Type Master.");
                        }
                    }

                    // 5. Resolve Deposit Account
                    var depStr = row.DepositToAccount?.Trim() ?? "";
                    var debType = row.DebitAccountType?.Trim() ?? "";
                    (int Id, string Code, string Name, bool IsCash)? matchedAcc = null;

                    if (!string.IsNullOrEmpty(depStr))
                    {
                        var accCodeMatch = System.Text.RegularExpressions.Regex.Match(depStr, @"\[(.*?)\]");
                        if (accCodeMatch.Success)
                        {
                            var c = accCodeMatch.Groups[1].Value.Trim();
                            var f = accounts.FirstOrDefault(a => a.Code.Equals(c, StringComparison.OrdinalIgnoreCase));
                            if (f.Id > 0) matchedAcc = f;
                        }
                        if (matchedAcc == null)
                        {
                            var f = accounts.FirstOrDefault(a => a.Code.Equals(depStr, StringComparison.OrdinalIgnoreCase) || a.Name.Equals(depStr, StringComparison.OrdinalIgnoreCase));
                            if (f.Id > 0) matchedAcc = f;
                        }
                    }

                    if (matchedAcc == null)
                    {
                        if (debType.Equals("Cash", StringComparison.OrdinalIgnoreCase))
                        {
                            var c = accounts.FirstOrDefault(a => a.IsCash);
                            if (c.Id > 0) matchedAcc = c;
                        }
                        else
                        {
                            var b = accounts.FirstOrDefault(a => !a.IsCash);
                            if (b.Id > 0) matchedAcc = b;
                        }
                    }

                    if (matchedAcc != null && matchedAcc.Value.Id > 0)
                    {
                        row.ResolvedAccountId = matchedAcc.Value.Id;
                        row.ResolvedAccountCode = matchedAcc.Value.Code;
                        row.ResolvedAccountName = matchedAcc.Value.Name;
                    }
                    else
                    {
                        row.ResolvedAccountCode = "ASS-1001";
                        row.ResolvedAccountName = "Cash in Hand";
                    }

                    // 6. Check Duplicate Receipt No
                    if (!string.IsNullOrWhiteSpace(row.ReceiptNo) && existingVouchers.Contains(row.ReceiptNo.Trim()))
                    {
                        row.Errors.Add($"Receipt No '{row.ReceiptNo}' already exists in society.");
                    }

                    // 7. Calculate Bifurcation & Ledger Outstanding
                    if (row.ResolvedMemberId.HasValue && !string.IsNullOrEmpty(row.ResolvedBillTypeName))
                    {
                        var due = CalculateMemberDueInternal(conn, sid, row.ResolvedMemberId.Value, row.ResolvedBillTypeName);
                        row.OutstandingPrincipal = due.PrincipalDue;
                        row.OutstandingInterest  = due.InterestDue;

                        // Auto-populate amount from member due if empty/zero
                        if (row.Amount <= 0 && due.NetDue > 0)
                        {
                            row.Amount = due.NetDue;
                        }

                        // Validate Amount
                        if (row.Amount <= 0)
                        {
                            row.Errors.Add("Received Amount must be greater than 0.");
                        }

                        var mode = row.AllocationMode?.Trim().ToUpper() ?? "AUTO";
                        if (mode == "MANUAL" && (row.PrincipalAmount.HasValue || row.InterestAmount.HasValue))
                        {
                            decimal p = row.PrincipalAmount ?? 0;
                            decimal i = row.InterestAmount ?? 0;
                            if (Math.Round(p + i, 2) != Math.Round(row.Amount, 2))
                            {
                                row.Errors.Add($"In MANUAL mode, Principal (₹{p:F2}) + Interest (₹{i:F2}) must equal Received Amount (₹{row.Amount:F2}).");
                            }
                            else
                            {
                                row.AllocatedPrincipal = p;
                                row.AllocatedInterest = i;
                            }
                        }
                        else
                        {
                            // AUTO waterfall: Interest First
                            if (due.InterestDue > 0)
                            {
                                row.AllocatedInterest = Math.Min(row.Amount, due.InterestDue);
                                row.AllocatedPrincipal = Math.Max(0, row.Amount - row.AllocatedInterest);
                            }
                            else
                            {
                                row.AllocatedInterest = 0;
                                row.AllocatedPrincipal = row.Amount;
                            }
                        }

                        row.RemainingPrincipal = Math.Max(0, row.OutstandingPrincipal - row.AllocatedPrincipal);
                        row.RemainingInterest = Math.Max(0, row.OutstandingInterest - row.AllocatedInterest);
                    }
                    else
                    {
                        if (row.Amount <= 0)
                        {
                            row.Errors.Add("Received Amount must be greater than 0.");
                        }
                    }

                    row.IsValid = (row.Errors.Count == 0);
                    if (row.IsValid) validCount++;
                    else errorCount++;
                }

                return Ok(new
                {
                    success = true,
                    totalRows = req.Rows.Count,
                    validRows = validCount,
                    errorRows = errorCount,
                    rows = req.Rows
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/member-receipts/bulk-import ─────────────────────
        [HttpPost("bulk-import")]
        public IActionResult BulkImport([FromBody] BulkReceiptImportRequest req)
        {
            if (req == null || req.Rows == null || req.Rows.Count == 0)
                return BadRequest(new { success = false, message = "No receipt rows to import." });

            int sid = req.SocietyId > 0 ? req.SocietyId : 4;
            int fyid = req.FYId > 0 ? req.FYId : 1;

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx = conn.BeginTransaction();

                // 1. Fetch FY Label
                string fyLabel = "2026-27";
                using (var fyCmd = conn.CreateCommand())
                {
                    fyCmd.Transaction = tx;
                    fyCmd.CommandText = "SELECT FYStart, FYEnd FROM jeevika_erp.FinancialYear WHERE FYId = @fyid LIMIT 1";
                    fyCmd.Parameters.AddWithValue("@fyid", fyid);
                    using var rFy = fyCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        var sDate = Convert.ToDateTime(rFy["FYStart"]);
                        var eDate = Convert.ToDateTime(rFy["FYEnd"]);
                        fyLabel = $"{sDate.Year}-{eDate.ToString("yy")}";
                    }
                }

                // 2. Fetch Max Voucher Sequence
                int maxSeq = 0;
                using (var countCmd = conn.CreateCommand())
                {
                    countCmd.Transaction = tx;
                    countCmd.CommandText = "SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType IN ('MemberReceipt', 'Receipt') AND IsDeleted = FALSE AND (VoucherNo LIKE @prefix OR VoucherNo LIKE @altPrefix)";
                    countCmd.Parameters.AddWithValue("@sid", sid);
                    countCmd.Parameters.AddWithValue("@fyid", fyid);
                    countCmd.Parameters.AddWithValue("@prefix", $"MRV/{fyLabel}/%");
                    countCmd.Parameters.AddWithValue("@altPrefix", $"REC/{fyLabel}/%");
                    using var r = countCmd.ExecuteReader();
                    while (r.Read())
                    {
                        var v = r["VoucherNo"]?.ToString() ?? "";
                        var match = System.Text.RegularExpressions.Regex.Match(v, @"(\d+)$");
                        if (match.Success && int.TryParse(match.Groups[1].Value, out int s))
                        {
                            if (s > maxSeq) maxSeq = s;
                        }
                    }
                }

                // Resolve Dues Account
                int duesAccId = 0;
                string duesCode = "ASS-1025";
                string duesName = "Dues From Members";
                using (var accCmd = conn.CreateCommand())
                {
                    accCmd.Transaction = tx;
                    accCmd.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE (SocietyId = @sid OR SocietyId = 1) AND (AccCode = 'ASS-1025' OR AccName ILIKE 'Dues From Members%') AND IsDeleted = FALSE ORDER BY (CASE WHEN SocietyId = @sid THEN 0 ELSE 1 END) LIMIT 1";
                    accCmd.Parameters.AddWithValue("@sid", sid);
                    using var rA = accCmd.ExecuteReader();
                    if (rA.Read())
                    {
                        duesAccId = Convert.ToInt32(rA["AccountId"]);
                        duesCode = rA["AccCode"]?.ToString() ?? "ASS-1025";
                        duesName = rA["AccName"]?.ToString() ?? "Dues From Members";
                    }
                }

                var importedReceipts = new List<object>();

                foreach (var row in req.Rows)
                {
                    if (!row.IsValid) continue;

                    string rNo = row.ReceiptNo?.Trim() ?? "";
                    if (string.IsNullOrWhiteSpace(rNo))
                    {
                        maxSeq++;
                        rNo = $"MRV/{fyLabel}/{maxSeq:D2}";
                    }

                    DateTime rDate = DateTime.Today;
                    if (!string.IsNullOrWhiteSpace(row.ReceiptDate))
                    {
                        if (DateTime.TryParseExact(row.ReceiptDate.Trim(), new[] { "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yyyy", "d/M/yyyy", "yyyy/MM/dd" },
                            System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out DateTime pDate))
                        {
                            rDate = pDate;
                        }
                    }

                    string bType = !string.IsNullOrWhiteSpace(row.ResolvedBillTypeName) ? row.ResolvedBillTypeName : (!string.IsNullOrWhiteSpace(row.BillType) ? row.BillType.Trim() : "Maintenance");
                    string part1 = !string.IsNullOrWhiteSpace(row.Particular1) ? row.Particular1.Trim() : $"{bType} Receipt";
                    if (!part1.Contains("[BillType:", StringComparison.OrdinalIgnoreCase))
                    {
                        part1 = $"[BillType: {bType}] " + part1;
                    }

                    decimal prinAmt = row.AllocatedPrincipal > 0 ? row.AllocatedPrincipal : (row.Amount - (row.AllocatedInterest > 0 ? row.AllocatedInterest : 0));
                    decimal intAmt = row.AllocatedInterest;
                    if (prinAmt + intAmt != row.Amount && intAmt > 0)
                    {
                        prinAmt = Math.Max(0, row.Amount - intAmt);
                    }

                    string bifTag = $"[Bifurcation: Principal={prinAmt:F2}, Interest={intAmt:F2}]";
                    string rawPart2 = row.Particular2 ?? "";
                    string part2 = rawPart2;
                    if (part2.Contains("[Bifurcation:"))
                    {
                        part2 = System.Text.RegularExpressions.Regex.Replace(part2, @"\[Bifurcation:[^\]]+\]", bifTag).Trim();
                    }
                    else
                    {
                        part2 = (part2 + " " + bifTag).Trim();
                    }

                    string memCode = row.MemberCode?.Trim() ?? "";
                    string memName = row.ResolvedMemberName ?? row.MemberName ?? "Member";
                    string flatStr = row.ResolvedFlatNo ?? "";
                    string personName = !string.IsNullOrEmpty(flatStr) ? $"{memName} ({flatStr})" : memName;

                    string cbCode = row.ResolvedAccountCode ?? "ASS-1001";
                    string cbName = row.ResolvedAccountName ?? "Cash in Hand";
                    int cbAccId = row.ResolvedAccountId ?? 0;

                    DateTime? chqDate = null;
                    if (!string.IsNullOrWhiteSpace(row.ChqDate))
                    {
                        if (DateTime.TryParseExact(row.ChqDate.Trim(), new[] { "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yyyy" },
                            System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out DateTime pCDate))
                        {
                            chqDate = pCDate;
                        }
                    }

                    // Clean up any soft-deleted voucher with same number to prevent unique constraint violation
                    using (var cleanCmd = conn.CreateCommand())
                    {
                        cleanCmd.Transaction = tx;
                        cleanCmd.CommandText = @"
                            DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (
                                SELECT VoucherId FROM jeevika_erp.SocVoucherHeader 
                                WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE
                            );
                            DELETE FROM jeevika_erp.SocVoucherHeader 
                            WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE;";
                        cleanCmd.Parameters.AddWithValue("@sid",  sid);
                        cleanCmd.Parameters.AddWithValue("@fyid", fyid);
                        cleanCmd.Parameters.AddWithValue("@vno",  rNo);
                        cleanCmd.ExecuteNonQuery();
                    }

                    // Insert SocVoucherHeader
                    int voucherId = 0;
                    using (var vCmd = conn.CreateCommand())
                    {
                        vCmd.Transaction = tx;
                        vCmd.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherHeader
                                (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, CashBankCode, CashBankName,
                                 Amount, ChqNo, ChqDate, BankName, PersonName, PersonType, PersonCode, RefNo, Narration, Particular1, Particular2, Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                            VALUES
                                (@sid, @fyid, @vno, 'MemberReceipt', @vdate, @cbCode, @cbName,
                                 @amt, @chqNo, @chqDate, @bank, @person, 'Member', @pcode, @refNo, @narr, @part1, @part2, 'Posted', FALSE, @user, NOW(), NOW())
                            RETURNING VoucherId";

                        vCmd.Parameters.AddWithValue("@sid", sid);
                        vCmd.Parameters.AddWithValue("@fyid", fyid);
                        vCmd.Parameters.AddWithValue("@vno", rNo);
                        vCmd.Parameters.AddWithValue("@vdate", rDate);
                        vCmd.Parameters.AddWithValue("@cbCode", cbCode);
                        vCmd.Parameters.AddWithValue("@cbName", cbName);
                        vCmd.Parameters.AddWithValue("@amt", row.Amount);
                        vCmd.Parameters.AddWithValue("@chqNo", (object?)row.ChqNo ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("@chqDate", chqDate.HasValue ? (object)chqDate.Value : DBNull.Value);
                        vCmd.Parameters.AddWithValue("@bank", (object?)row.DrawnOnBank ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("@person", personName);
                        vCmd.Parameters.AddWithValue("@pcode", !string.IsNullOrEmpty(memCode) ? memCode : (row.ResolvedMemberId.HasValue ? row.ResolvedMemberId.Value.ToString() : ""));
                        vCmd.Parameters.AddWithValue("@refNo", (object?)row.AgainstBillNo ?? DBNull.Value);
                        vCmd.Parameters.AddWithValue("@narr", part1);
                        vCmd.Parameters.AddWithValue("@part1", part1);
                        vCmd.Parameters.AddWithValue("@part2", part2);
                        vCmd.Parameters.AddWithValue("@user", User.Identity?.Name ?? "ADMIN");

                        voucherId = Convert.ToInt32(vCmd.ExecuteScalar());
                    }

                    // Line 1: Debit Cash/Bank
                    using (var dCmd1 = conn.CreateCommand())
                    {
                        dCmd1.Transaction = tx;
                        dCmd1.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, 1, @aid, @code, @name, @amt, 0, @narr)";
                        dCmd1.Parameters.AddWithValue("@vid", voucherId);
                        dCmd1.Parameters.AddWithValue("@aid", cbAccId > 0 ? cbAccId : (object)DBNull.Value);
                        dCmd1.Parameters.AddWithValue("@code", cbCode);
                        dCmd1.Parameters.AddWithValue("@name", cbName);
                        dCmd1.Parameters.AddWithValue("@amt", row.Amount);
                        dCmd1.Parameters.AddWithValue("@narr", part1);
                        dCmd1.ExecuteNonQuery();
                    }

                    // Line 2 & 3: Credit Member Dues (with split if interest > 0)
                    if (intAmt > 0)
                    {
                        using (var dCmd2 = conn.CreateCommand())
                        {
                            dCmd2.Transaction = tx;
                            dCmd2.CommandText = @"
                                INSERT INTO jeevika_erp.SocVoucherDetail
                                    (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                                VALUES
                                    (@vid, 2, @aid, @code, @name, 0, @amt, @narr)";
                            dCmd2.Parameters.AddWithValue("@vid", voucherId);
                            dCmd2.Parameters.AddWithValue("@aid", duesAccId > 0 ? duesAccId : (object)DBNull.Value);
                            dCmd2.Parameters.AddWithValue("@code", duesCode);
                            dCmd2.Parameters.AddWithValue("@name", duesName);
                            dCmd2.Parameters.AddWithValue("@amt", prinAmt);
                            dCmd2.Parameters.AddWithValue("@narr", $"{personName} - {bType} Principal Receipt {rNo}");
                            dCmd2.ExecuteNonQuery();
                        }

                        using (var dCmd3 = conn.CreateCommand())
                        {
                            dCmd3.Transaction = tx;
                            dCmd3.CommandText = @"
                                INSERT INTO jeevika_erp.SocVoucherDetail
                                    (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                                VALUES
                                    (@vid, 3, @aid, @code, @name, 0, @amt, @narr)";
                            dCmd3.Parameters.AddWithValue("@vid", voucherId);
                            dCmd3.Parameters.AddWithValue("@aid", duesAccId > 0 ? duesAccId : (object)DBNull.Value);
                            dCmd3.Parameters.AddWithValue("@code", duesCode);
                            dCmd3.Parameters.AddWithValue("@name", "Interest on Dues");
                            dCmd3.Parameters.AddWithValue("@amt", intAmt);
                            dCmd3.Parameters.AddWithValue("@narr", $"{personName} - {bType} Interest Collection {rNo}");
                            dCmd3.ExecuteNonQuery();
                        }
                    }
                    else
                    {
                        using (var dCmd2 = conn.CreateCommand())
                        {
                            dCmd2.Transaction = tx;
                            dCmd2.CommandText = @"
                                INSERT INTO jeevika_erp.SocVoucherDetail
                                    (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                                VALUES
                                    (@vid, 2, @aid, @code, @name, 0, @amt, @narr)";
                            dCmd2.Parameters.AddWithValue("@vid", voucherId);
                            dCmd2.Parameters.AddWithValue("@aid", duesAccId > 0 ? duesAccId : (object)DBNull.Value);
                            dCmd2.Parameters.AddWithValue("@code", duesCode);
                            dCmd2.Parameters.AddWithValue("@name", duesName);
                            dCmd2.Parameters.AddWithValue("@amt", row.Amount);
                            dCmd2.Parameters.AddWithValue("@narr", $"{personName} - {bType} Receipt {rNo}");
                            dCmd2.ExecuteNonQuery();
                        }
                    }

                    // Update SocMemberBill if bill matched
                    if (!string.IsNullOrWhiteSpace(row.AgainstBillNo) && row.ResolvedMemberId.HasValue)
                    {
                        using var bCmd = conn.CreateCommand();
                        bCmd.Transaction = tx;
                        bCmd.CommandText = @"
                            UPDATE jeevika_erp.SocMemberBill
                            SET PaidAmount = PaidAmount + @amt,
                                BalanceAmount = TotalAmount - (PaidAmount + @amt),
                                Status = CASE WHEN TotalAmount - (PaidAmount + @amt) <= 0 THEN 'Paid' ELSE 'PartPaid' END,
                                VoucherId = @vid
                            WHERE BillNo = @bno AND SocietyId = @sid AND MemberId = @mid";
                        bCmd.Parameters.AddWithValue("@amt", row.Amount);
                        bCmd.Parameters.AddWithValue("@vid", voucherId);
                        bCmd.Parameters.AddWithValue("@bno", row.AgainstBillNo.Trim());
                        bCmd.Parameters.AddWithValue("@sid", sid);
                        bCmd.Parameters.AddWithValue("@mid", row.ResolvedMemberId.Value);
                        bCmd.ExecuteNonQuery();
                    }

                    importedReceipts.Add(new { voucherId, voucherNo = rNo, amount = row.Amount });
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = $"Successfully imported {importedReceipts.Count} member receipt(s).",
                    count = importedReceipts.Count,
                    importedCount = importedReceipts.Count,
                    receipts = importedReceipts
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Import failed: " + ex.Message });
            }
        }
    }

    public class MemberReceiptModel
    {
        public long?     VoucherId        { get; set; }
        public long?     ReceiptId        { get; set; }
        public int?      SocietyId        { get; set; }
        public int?      FYId             { get; set; }
        public int?      MemberId         { get; set; }
        public int?      BillId           { get; set; }
        public string?   BillNo           { get; set; }
        public string?   ReceiptNo        { get; set; }
        public string?   BillType         { get; set; }
        public string?   PreviousBillType { get; set; }
        public DateTime  ReceiptDate      { get; set; } = DateTime.Today;
        public decimal   Amount           { get; set; } = 0;
        public decimal?  PrincipalAmount  { get; set; }
        public decimal?  InterestAmount   { get; set; }
        public string?   CashBankCode     { get; set; }
        public string?   CashBankName     { get; set; }
        public string?   ChqNo            { get; set; }
        public DateTime? ChqDate          { get; set; }
        public string?   BankName         { get; set; }
        public string?   Narration        { get; set; }
        public string?   Particular1      { get; set; }
        public string?   Particular2      { get; set; }
    }

    public class MemberDueResult
    {
        public string BillType { get; set; } = "Maintenance";
        public decimal OpPrincipal { get; set; }
        public decimal OpInterest { get; set; }
        public decimal CurrentBillPrincipal { get; set; }
        public decimal CurrentBillInterest { get; set; }
        public decimal SettledAmount { get; set; }
        public decimal PrincipalDue { get; set; }
        public decimal InterestDue { get; set; }
        public decimal NetDue { get; set; }
        public List<object> UnpaidBills { get; set; } = new();
        public List<object> RecentTransactions { get; set; } = new();
    }

    public class BulkReceiptValidateRequest
    {
        public int SocietyId { get; set; }
        public int FYId { get; set; }
        public List<ReceiptImportRowDto> Rows { get; set; } = new();
    }

    public class BulkReceiptImportRequest
    {
        public int SocietyId { get; set; }
        public int FYId { get; set; }
        public List<ReceiptImportRowDto> Rows { get; set; } = new();
    }

    public class ReceiptImportRowDto
    {
        public int RowIndex { get; set; }
        public string? ReceiptNo { get; set; }
        public string? ReceiptDate { get; set; }
        public string? BillType { get; set; }
        public string? MemberCode { get; set; }
        public string? MemberName { get; set; }
        public string? WingFlat { get; set; }
        public string? DebitAccountType { get; set; }
        public string? DepositToAccount { get; set; }
        public string? TransactionType { get; set; }
        public string? ChqNo { get; set; }
        public string? ChqDate { get; set; }
        public string? RefNo { get; set; }
        public string? DrawnOnBank { get; set; }
        public decimal Amount { get; set; }
        public string? AllocationMode { get; set; } = "AUTO";
        public decimal? PrincipalAmount { get; set; }
        public decimal? InterestAmount { get; set; }
        public string? AgainstBillNo { get; set; }
        public string? Particular1 { get; set; }
        public string? Particular2 { get; set; }

        public bool IsValid { get; set; } = true;
        public List<string> Errors { get; set; } = new();
        public int? ResolvedMemberId { get; set; }
        public string? ResolvedMemberName { get; set; }
        public string? ResolvedFlatNo { get; set; }
        public int? ResolvedBillTypeId { get; set; }
        public string? ResolvedBillTypeName { get; set; }
        public int? ResolvedAccountId { get; set; }
        public string? ResolvedAccountCode { get; set; }
        public string? ResolvedAccountName { get; set; }
        public decimal OutstandingPrincipal { get; set; }
        public decimal OutstandingInterest { get; set; }
        public decimal AllocatedPrincipal { get; set; }
        public decimal AllocatedInterest { get; set; }
        public decimal RemainingPrincipal { get; set; }
        public decimal RemainingInterest { get; set; }
    }
}
