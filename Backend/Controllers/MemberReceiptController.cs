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

                // 1. Fetch Opening Balances for this member & bill type
                decimal opPrin = 0;
                decimal opInt = 0;

                using (var opCmd = conn.CreateCommand())
                {
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
                    opCmd.Parameters.AddWithValue("@btype", billType.Trim());

                    using var rOp = opCmd.ExecuteReader();
                    if (rOp.Read())
                    {
                        opPrin = Convert.ToDecimal(rOp["OpPrin"]);
                        opInt  = Convert.ToDecimal(rOp["OpInt"]);
                    }
                }

                // 2. Fetch Unpaid / Outstanding Bills for this member and bill type
                var unpaidBills = new List<object>();
                decimal billedPrin = 0;
                decimal billedInt = 0;

                using (var bCmd = conn.CreateCommand())
                {
                    bCmd.CommandText = @"
                        SELECT b.BillId, b.BillNo, b.BillDate, b.PrincipalAmount, b.InterestAmount, b.TotalAmount, b.BalanceAmount, b.Status
                        FROM jeevika_erp.SocMemberBill b
                        LEFT JOIN jeevika_erp.SocBillType bt ON b.BillTypeId = bt.BillTypeId
                        WHERE b.SocietyId = @sid AND b.MemberId = @mid AND (bt.BillTypeName ILIKE @btype OR b.BillTypeId IS NULL OR LOWER(@btype) = 'maintenance') AND b.IsDeleted = FALSE
                        ORDER BY b.BillDate ASC, b.BillId ASC";
                    bCmd.Parameters.AddWithValue("@sid",   societyId);
                    bCmd.Parameters.AddWithValue("@mid",   memberId);
                    bCmd.Parameters.AddWithValue("@btype", billType.Trim());

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

                        unpaidBills.Add(new
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

                // 3. Fetch Total Prior Receipts for this member & bill type
                decimal settledAmount = 0;
                using (var rCmd = conn.CreateCommand())
                {
                    rCmd.CommandText = @"
                        SELECT COALESCE(SUM(CASE WHEN vh.VoucherType = 'MemberReceipt' THEN vh.Amount 
                                                 WHEN vh.VoucherType IN ('MemberReceiptReversal', 'ReceiptReversal') THEN -vh.Amount 
                                                 ELSE 0 END), 0) AS SettledAmt
                        FROM jeevika_erp.SocVoucherHeader vh
                        WHERE vh.SocietyId = @sid 
                          AND vh.VoucherType IN ('MemberReceipt', 'MemberReceiptReversal', 'ReceiptReversal')
                          AND (vh.PersonName ILIKE @midPattern OR vh.RefNo ILIKE @midPattern2)
                          AND vh.IsDeleted = FALSE";
                    rCmd.Parameters.AddWithValue("@sid", societyId);
                    rCmd.Parameters.AddWithValue("@midPattern", $"%({memberId})%");
                    rCmd.Parameters.AddWithValue("@midPattern2", $"%M-{memberId}%");

                    var res = rCmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value) settledAmount = Convert.ToDecimal(res);
                }

                // 4. Waterfall calculation: Total Due = (OpPrin + BilledPrin) + (OpInt + BilledInt) - SettledAmt
                decimal totalPrin = opPrin + billedPrin;
                decimal totalInt  = opInt + billedInt;

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

                decimal netDue = currentPrinDue + currentIntDue;

                // 5. Fetch Recent Transactions for this member (Bills, Receipts, Debit/Credit Notes, Reversals)
                var recentTransactions = new List<object>();
                using (var txCmd = conn.CreateCommand())
                {
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

                        recentTransactions.Add(new
                        {
                            date = txDate,
                            vchNo = vchNo,
                            dr = dr,
                            cr = cr
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    billType,
                    opPrincipal = opPrin,
                    opInterest = opInt,
                    principalDue = currentPrinDue,
                    interestDue = currentIntDue,
                    netDue = netDue,
                    currentBillInterest = billedInt,
                    currentBillPrincipal = billedPrin,
                    unpaidBills,
                    recentTransactions
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
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
                    using var countCmd = conn.CreateCommand();
                    countCmd.Transaction = tx;
                    countCmd.CommandText = "SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType IN ('MemberReceipt', 'Receipt')";
                    countCmd.Parameters.AddWithValue("@sid",  sid);
                    countCmd.Parameters.AddWithValue("@fyid", fyid);

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

                    receiptNo = $"MRV/2025-26/{(maxSeq + 1):D2}";
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
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE
                        );
                        UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE;";
                    cmd.Parameters.AddWithValue("@numId", numId);
                    cmd.Parameters.AddWithValue("@id",    id);
                }
                else
                {
                    cmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE VoucherNo = @id AND IsDeleted = FALSE
                        );
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
}
