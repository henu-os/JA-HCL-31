// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MemberReceiptReversalController
// Handles Member Receipt Reversal Entries
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/receipt-reversals")]
    [Route("api/member-receipt-reversals")]
    [AllowAnonymous]
    public class MemberReceiptReversalController : ControllerBase
    {
        // ── GET /api/receipt-reversals?societyId=X&fyId=Y ──
        [HttpGet]
        public IActionResult GetReversals([FromQuery] int societyId = 0, [FromQuery] int fyId = 0)
        {
            if (societyId <= 0)
                societyId = 4;

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();

                cmd.CommandText = @"
                    SELECT VoucherId, SocietyId, FYId, VoucherNo, VoucherDate, CashBankCode, CashBankName,
                           Amount, ChqNo, ChqDate, BankName, PersonName, PersonCode, RefNo, Particular1, Particular2, Narration, Status, CreatedAt
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid AND (@fyid = 0 OR FYId = @fyid) AND VoucherType IN ('MemberReceiptReversal', 'ReceiptReversal') AND IsDeleted = FALSE
                    ORDER BY VoucherDate DESC, VoucherId DESC";

                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

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
                    var refNoStr = r["RefNo"] != DBNull.Value ? r["RefNo"].ToString() ?? "" : "";
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

                    list.Add(new
                    {
                        reversalId   = Convert.ToInt32(r["VoucherId"]),
                        reversalNo   = r["VoucherNo"].ToString() ?? "",
                        reversalDate = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        billType     = billType,
                        cashBank     = r["CashBankName"].ToString() ?? "Cash In Hand",
                        personName   = personStr,
                        memberName   = parsedMemberName,
                        flatNo       = parsedFlat,
                        wingFlat     = parsedFlat,
                        amount       = Convert.ToDecimal(r["Amount"]),
                        chqNo        = r["ChqNo"].ToString() ?? "",
                        chqDate      = r["ChqDate"] != DBNull.Value ? ((DateTime)r["ChqDate"]).ToString("yyyy-MM-dd") : "",
                        bankName     = r["BankName"].ToString() ?? "",
                        receiptNo    = refNoStr,
                        particular1  = !string.IsNullOrWhiteSpace(part1Str) ? part1Str : narrStr,
                        particular2  = r["Particular2"] != DBNull.Value ? r["Particular2"].ToString() ?? "" : "",
                        narration    = narrStr,
                        status       = r["Status"].ToString() ?? "Posted"
                    });
                }

                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/member-receipt-reversals or /api/receipt-reversals ──
        [HttpPost]
        public IActionResult CreateReversal([FromBody] ReceiptReversalModel model)
        {
            if (model.Amount <= 0)
                return BadRequest(new { success = false, message = "Amount is required and must be greater than 0." });

            try
            {
                using var conn = DbHelper.GetConn();

                if (model.SocietyId <= 0)
                {
                    using var sCmd = conn.CreateCommand();
                    sCmd.CommandText = "SELECT SocietyId FROM jeevika_erp.SocietyInfo WHERE IsActive = TRUE ORDER BY SocietyId LIMIT 1";
                    var sRes = sCmd.ExecuteScalar();
                    model.SocietyId = (sRes != null && sRes != DBNull.Value) ? Convert.ToInt32(sRes) : 4;
                }

                if (model.FYId <= 0)
                {
                    using var fyCmd = conn.CreateCommand();
                    fyCmd.CommandText = "SELECT FYId FROM jeevika_erp.FinancialYear WHERE IsActive = TRUE ORDER BY FYId DESC LIMIT 1";
                    var fyRes = fyCmd.ExecuteScalar();
                    model.FYId = (fyRes != null && fyRes != DBNull.Value) ? Convert.ToInt32(fyRes) : 1;
                }

                using var tx = conn.BeginTransaction();

                // 1. Generate Reversal Voucher No if not supplied
                string reversalNo = model.ReversalNo ?? "";
                if (string.IsNullOrWhiteSpace(reversalNo))
                {
                    using var countCmd = conn.CreateCommand();
                    countCmd.Transaction = tx;
                    countCmd.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType = 'MemberReceiptReversal'";
                    countCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                    countCmd.Parameters.AddWithValue("@fyid", model.FYId);

                    int count = Convert.ToInt32(countCmd.ExecuteScalar() ?? 0);
                    reversalNo = $"REV-{(count + 1):D4}";
                }

                string memCode = model.MemberCode ?? "";
                string memName = model.MemberName ?? "";
                string personDisplayName = !string.IsNullOrEmpty(model.PersonName) ? model.PersonName : (!string.IsNullOrEmpty(model.MemberName) ? model.MemberName : "Member");

                if (model.MemberId > 0)
                {
                    using var mCmd = conn.CreateCommand();
                    mCmd.Transaction = tx;
                    mCmd.CommandText = "SELECT MemCode, MemName, Wing, FlatNo FROM jeevika_erp.SocMember WHERE MemberId = @mid";
                    mCmd.Parameters.AddWithValue("@mid", model.MemberId);
                    using var rM = mCmd.ExecuteReader();
                    if (rM.Read())
                    {
                        memCode = rM["MemCode"]?.ToString() ?? memCode;
                        memName = rM["MemName"]?.ToString() ?? memName;
                        string wing = rM["Wing"]?.ToString() ?? "";
                        string flat = rM["FlatNo"]?.ToString() ?? "";
                        string flatLabel = (string.IsNullOrEmpty(wing) ? flat : $"{wing}-{flat}").Trim();
                        personDisplayName = $"{memName} ({flatLabel})";
                    }
                }
                else if (!string.IsNullOrEmpty(model.FlatNo) && !personDisplayName.Contains(model.FlatNo))
                {
                    personDisplayName = $"{personDisplayName} ({model.FlatNo})";
                }

                // Clean up any soft-deleted voucher with same number to prevent unique constraint violation
                using (var cleanCmd = conn.CreateCommand())
                {
                    cleanCmd.Transaction = tx;
                    cleanCmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE);
                        DELETE FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE;";
                    cleanCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                    cleanCmd.Parameters.AddWithValue("@fyid", model.FYId);
                    cleanCmd.Parameters.AddWithValue("@vno",  reversalNo);
                    cleanCmd.ExecuteNonQuery();
                }

                // 2. Create Reversal Voucher Header
                DateTime revDate = model.ReversalDate > DateTime.MinValue ? model.ReversalDate : DateTime.Today;
                string billType = !string.IsNullOrWhiteSpace(model.BillType) ? model.BillType.Trim() : "Maintenance";
                string rcptNo = !string.IsNullOrWhiteSpace(model.ReceiptNo) ? model.ReceiptNo.Trim() : "";
                string part1 = $"[BillType: {billType}] {(string.IsNullOrWhiteSpace(model.Particular1) ? $"Reversal of Receipt {rcptNo}" : model.Particular1)}";
                string part2 = model.Particular2 ?? "Cheque Dishonoured by Bank";
                string narr = $"{billType.ToUpper()} Receipt Reversal {(string.IsNullOrWhiteSpace(rcptNo) ? "" : $"({rcptNo})")}";

                using var vCmd = conn.CreateCommand();
                vCmd.Transaction = tx;
                vCmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocVoucherHeader
                        (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, CashBankCode, CashBankName,
                         Amount, ChqNo, ChqDate, BankName, PersonName, PersonType, PersonCode, RefNo, Particular1, Particular2, Narration, Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                    VALUES
                        (@sid, @fyid, @vno, 'MemberReceiptReversal', @vdate, @cbCode, @cbName,
                         @amt, @chqNo, @chqDate, @bank, @person, 'Member', @pcode, @refNo, @part1, @part2, @narr, 'Posted', FALSE, @user, NOW(), NOW())
                    RETURNING VoucherId";

                vCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                vCmd.Parameters.AddWithValue("@fyid",   model.FYId);
                vCmd.Parameters.AddWithValue("@vno",    reversalNo);
                vCmd.Parameters.AddWithValue("@vdate",  revDate);
                vCmd.Parameters.AddWithValue("@cbCode", (object?)model.CashBankCode ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@cbName", (object?)model.CashBankName ?? (object?)model.CashBank ?? "Cash In Hand");
                vCmd.Parameters.AddWithValue("@amt",    model.Amount);
                vCmd.Parameters.AddWithValue("@chqNo",  (object?)model.ChqNo        ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@chqDate",model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                vCmd.Parameters.AddWithValue("@bank",   (object?)model.BankName     ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@person", personDisplayName);
                vCmd.Parameters.AddWithValue("@pcode",  !string.IsNullOrEmpty(memCode) ? memCode : (model.MemberId > 0 ? model.MemberId.ToString() : (object)DBNull.Value));
                vCmd.Parameters.AddWithValue("@refNo",  !string.IsNullOrWhiteSpace(rcptNo) ? rcptNo : (!string.IsNullOrEmpty(memCode) ? memCode : (object)DBNull.Value));
                vCmd.Parameters.AddWithValue("@part1",  part1);
                vCmd.Parameters.AddWithValue("@part2",  part2);
                vCmd.Parameters.AddWithValue("@narr",   narr);
                vCmd.Parameters.AddWithValue("@user",   User.Identity?.Name ?? "ADMIN");

                var voucherId = Convert.ToInt32(vCmd.ExecuteScalar());

                // 3. Double-Entry Posting in SocVoucherDetail
                // Line 1: Credit Cash/Bank (Money returned)
                using var dCmd1 = conn.CreateCommand();
                dCmd1.Transaction = tx;
                dCmd1.CommandText = @"
                    INSERT INTO jeevika_erp.SocVoucherDetail
                        (VoucherId, AccountCode, AccountName, Debit, Credit, Narration)
                    VALUES
                        (@vid, @code, @name, 0, @amt, @narr)";
                dCmd1.Parameters.AddWithValue("@vid",  voucherId);
                dCmd1.Parameters.AddWithValue("@code", (object?)model.CashBankCode ?? "ASS-1001");
                dCmd1.Parameters.AddWithValue("@name", (object?)model.CashBankName ?? (object?)model.CashBank ?? "Cash In Hand");
                dCmd1.Parameters.AddWithValue("@amt",  model.Amount);
                dCmd1.Parameters.AddWithValue("@narr", $"Receipt reversal from {model.CashBankName ?? model.CashBank ?? "Cash"}");
                dCmd1.ExecuteNonQuery();

                // Line 2: Debit Member Dues (Dues Restored)
                using var dCmd2 = conn.CreateCommand();
                dCmd2.Transaction = tx;
                dCmd2.CommandText = @"
                    INSERT INTO jeevika_erp.SocVoucherDetail
                        (VoucherId, AccountCode, AccountName, Debit, Credit, Narration)
                    VALUES
                        (@vid, 'ASS-1025', @name, @amt, 0, @narr)";
                dCmd2.Parameters.AddWithValue("@vid",  voucherId);
                dCmd2.Parameters.AddWithValue("@name", $"Dues From Members - {personDisplayName}");
                dCmd2.Parameters.AddWithValue("@amt",  model.Amount);
                dCmd2.Parameters.AddWithValue("@narr", $"Dues restored via Reversal {reversalNo}");
                dCmd2.ExecuteNonQuery();

                // 4. Restore Bill Balance if BillNo is provided
                if (!string.IsNullOrEmpty(model.BillNo) && model.BillNo != "—" && model.BillNo != "-")
                {
                    using var bCmd = conn.CreateCommand();
                    bCmd.Transaction = tx;
                    bCmd.CommandText = @"
                        UPDATE jeevika_erp.SocMemberBill
                        SET PaidAmount    = GREATEST(0, PaidAmount - @amt),
                            BalanceAmount = TotalAmount - GREATEST(0, PaidAmount - @amt),
                            Status        = CASE WHEN GREATEST(0, PaidAmount - @amt) <= 0 THEN 'Unpaid' ELSE 'PartPaid' END
                        WHERE BillNo = @billNo AND SocietyId = @sid";

                    bCmd.Parameters.AddWithValue("@amt",    model.Amount);
                    bCmd.Parameters.AddWithValue("@billNo", model.BillNo);
                    bCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                    bCmd.ExecuteNonQuery();
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = "Member receipt reversal recorded successfully.",
                    reversalNo,
                    voucherId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/member-receipt-reversals/{id} or /api/receipt-reversals/{id} (ALTER) ──
        [HttpPut("{id:int}")]
        public IActionResult UpdateReversal(int id, [FromBody] ReceiptReversalModel model)
        {
            if (model.Amount <= 0)
                return BadRequest(new { success = false, message = "Amount is required and must be greater than 0." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                string personDisplayName = !string.IsNullOrEmpty(model.PersonName) ? model.PersonName : (!string.IsNullOrEmpty(model.MemberName) ? model.MemberName : "Member");
                if (!string.IsNullOrEmpty(model.FlatNo) && !personDisplayName.Contains(model.FlatNo))
                {
                    personDisplayName = $"{personDisplayName} ({model.FlatNo})";
                }

                DateTime revDate = model.ReversalDate > DateTime.MinValue ? model.ReversalDate : DateTime.Today;
                string billType = !string.IsNullOrWhiteSpace(model.BillType) ? model.BillType.Trim() : "Maintenance";
                string rcptNo = !string.IsNullOrWhiteSpace(model.ReceiptNo) ? model.ReceiptNo.Trim() : "";
                string part1 = $"[BillType: {billType}] {(string.IsNullOrWhiteSpace(model.Particular1) ? $"Reversal of Receipt {rcptNo}" : model.Particular1)}";
                string part2 = model.Particular2 ?? "Cheque Dishonoured by Bank";
                string narr = $"{billType.ToUpper()} Receipt Reversal {(string.IsNullOrWhiteSpace(rcptNo) ? "" : $"({rcptNo})")}";

                // 1. Update Voucher Header
                using var vCmd = conn.CreateCommand();
                vCmd.Transaction = tx;
                vCmd.CommandText = @"
                    UPDATE jeevika_erp.SocVoucherHeader SET
                        VoucherDate  = @vdate,
                        CashBankCode = @cbCode,
                        CashBankName = @cbName,
                        Amount       = @amt,
                        ChqNo        = @chqNo,
                        ChqDate      = @chqDate,
                        BankName     = @bank,
                        PersonName   = @person,
                        RefNo        = @refNo,
                        Particular1  = @part1,
                        Particular2  = @part2,
                        Narration    = @narr,
                        UpdatedAt    = NOW()
                    WHERE VoucherId = @id AND VoucherType = 'MemberReceiptReversal' AND IsDeleted = FALSE";

                vCmd.Parameters.AddWithValue("@id",     id);
                vCmd.Parameters.AddWithValue("@vdate",  revDate);
                vCmd.Parameters.AddWithValue("@cbCode", (object?)model.CashBankCode ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@cbName", (object?)model.CashBankName ?? (object?)model.CashBank ?? "Cash In Hand");
                vCmd.Parameters.AddWithValue("@amt",    model.Amount);
                vCmd.Parameters.AddWithValue("@chqNo",  (object?)model.ChqNo        ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@chqDate",model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                vCmd.Parameters.AddWithValue("@bank",   (object?)model.BankName     ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@person", personDisplayName);
                vCmd.Parameters.AddWithValue("@refNo",  !string.IsNullOrWhiteSpace(rcptNo) ? rcptNo : (object)DBNull.Value);
                vCmd.Parameters.AddWithValue("@part1",  part1);
                vCmd.Parameters.AddWithValue("@part2",  part2);
                vCmd.Parameters.AddWithValue("@narr",   narr);

                var rows = vCmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Reversal voucher not found." });

                // 2. Refresh Voucher Details
                using var delDCmd = conn.CreateCommand();
                delDCmd.Transaction = tx;
                delDCmd.CommandText = "DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId = @vid";
                delDCmd.Parameters.AddWithValue("@vid", id);
                delDCmd.ExecuteNonQuery();

                // Line 1: Credit Cash/Bank
                using var dCmd1 = conn.CreateCommand();
                dCmd1.Transaction = tx;
                dCmd1.CommandText = @"
                    INSERT INTO jeevika_erp.SocVoucherDetail
                        (VoucherId, AccountCode, AccountName, Debit, Credit, Narration)
                    VALUES
                        (@vid, @code, @name, 0, @amt, @narr)";
                dCmd1.Parameters.AddWithValue("@vid",  id);
                dCmd1.Parameters.AddWithValue("@code", (object?)model.CashBankCode ?? "ASS-1001");
                dCmd1.Parameters.AddWithValue("@name", (object?)model.CashBankName ?? (object?)model.CashBank ?? "Cash In Hand");
                dCmd1.Parameters.AddWithValue("@amt",  model.Amount);
                dCmd1.Parameters.AddWithValue("@narr", $"Receipt reversal from {model.CashBankName ?? model.CashBank ?? "Cash"}");
                dCmd1.ExecuteNonQuery();

                // Line 2: Debit Member Dues
                using var dCmd2 = conn.CreateCommand();
                dCmd2.Transaction = tx;
                dCmd2.CommandText = @"
                    INSERT INTO jeevika_erp.SocVoucherDetail
                        (VoucherId, AccountCode, AccountName, Debit, Credit, Narration)
                    VALUES
                        (@vid, 'ASS-1025', @name, @amt, 0, @narr)";
                dCmd2.Parameters.AddWithValue("@vid",  id);
                dCmd2.Parameters.AddWithValue("@name", $"Dues From Members - {personDisplayName}");
                dCmd2.Parameters.AddWithValue("@amt",  model.Amount);
                dCmd2.Parameters.AddWithValue("@narr", $"Dues restored via Reversal {model.ReversalNo}");
                dCmd2.ExecuteNonQuery();

                // 3. Real-Time Two-Way Sync: If this reversal references an original receipt, sync the original receipt as well
                string origRcptNo = rcptNo;
                if (string.IsNullOrWhiteSpace(origRcptNo) || origRcptNo.Equals("MANUAL", StringComparison.OrdinalIgnoreCase))
                {
                    using var rCmd = conn.CreateCommand();
                    rCmd.Transaction = tx;
                    rCmd.CommandText = "SELECT RefNo FROM jeevika_erp.SocVoucherHeader WHERE VoucherId = @vid";
                    rCmd.Parameters.AddWithValue("@vid", id);
                    var refVal = rCmd.ExecuteScalar()?.ToString() ?? "";
                    if (!string.IsNullOrWhiteSpace(refVal) && !refVal.Equals("MANUAL", StringComparison.OrdinalIgnoreCase))
                    {
                        origRcptNo = refVal.Trim();
                    }
                }

                string revEquivRcptNo = !string.IsNullOrEmpty(model.ReversalNo)
                    ? model.ReversalNo.Replace("MRV-R/", "MRV/").Replace("REC-R/", "REC/").Replace("-R/", "/")
                    : "";
                var revSeqMatch = System.Text.RegularExpressions.Regex.Match(model.ReversalNo ?? "", @"(\d+)$");
                string revSeq = revSeqMatch.Success ? revSeqMatch.Groups[1].Value : "";

                int origVoucherId = 0;
                using (var fCmd = conn.CreateCommand())
                {
                    fCmd.Transaction = tx;
                    fCmd.CommandText = @"
                        SELECT VoucherId 
                        FROM jeevika_erp.SocVoucherHeader 
                        WHERE SocietyId = @sid 
                          AND VoucherType = 'MemberReceipt' 
                          AND (
                              (VoucherNo = @rno AND @rno <> '')
                              OR (VoucherNo = @rEquiv AND @rEquiv <> '')
                              OR (RefNo = @rno AND @rno <> '')
                              OR (@seq <> '' AND VoucherNo ILIKE '%/' || @seq AND (PersonCode = @pcode OR PersonName ILIKE '%' || @pname || '%'))
                          )
                          AND IsDeleted = FALSE 
                        ORDER BY (CASE WHEN VoucherNo = @rno THEN 1 WHEN VoucherNo = @rEquiv THEN 2 ELSE 3 END)
                        LIMIT 1";
                    fCmd.Parameters.AddWithValue("@sid",    model.SocietyId > 0 ? model.SocietyId : 4);
                    fCmd.Parameters.AddWithValue("@rno",    origRcptNo ?? "");
                    fCmd.Parameters.AddWithValue("@rEquiv", revEquivRcptNo ?? "");
                    fCmd.Parameters.AddWithValue("@seq",    revSeq);
                    fCmd.Parameters.AddWithValue("@pcode",  !string.IsNullOrEmpty(model.MemberCode) ? model.MemberCode : (object)DBNull.Value);
                    fCmd.Parameters.AddWithValue("@pname",  !string.IsNullOrEmpty(model.MemberName) ? model.MemberName : personDisplayName);
                    var fRes = fCmd.ExecuteScalar();
                    if (fRes != null && fRes != DBNull.Value)
                    {
                        origVoucherId = Convert.ToInt32(fRes);
                    }
                }

                    if (origVoucherId > 0)
                    {
                        using (var uOrigCmd = conn.CreateCommand())
                        {
                            uOrigCmd.Transaction = tx;
                            uOrigCmd.CommandText = @"
                                UPDATE jeevika_erp.SocVoucherHeader SET
                                    CashBankCode = @cbCode,
                                    CashBankName = @cbName,
                                    Amount       = @amt,
                                    ChqNo        = @chqNo,
                                    ChqDate      = @chqDate,
                                    BankName     = @bank,
                                    PersonName   = @person,
                                    PersonCode   = @pcode,
                                    UpdatedAt    = NOW()
                                WHERE VoucherId = @origVid";
                            uOrigCmd.Parameters.AddWithValue("@origVid", origVoucherId);
                            uOrigCmd.Parameters.AddWithValue("@cbCode",  (object?)model.CashBankCode ?? DBNull.Value);
                            uOrigCmd.Parameters.AddWithValue("@cbName",  (object?)model.CashBankName ?? (object?)model.CashBank ?? "Cash In Hand");
                            uOrigCmd.Parameters.AddWithValue("@amt",     model.Amount);
                            uOrigCmd.Parameters.AddWithValue("@chqNo",   (object?)model.ChqNo ?? DBNull.Value);
                            uOrigCmd.Parameters.AddWithValue("@chqDate", model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                            uOrigCmd.Parameters.AddWithValue("@bank",    (object?)model.BankName ?? DBNull.Value);
                            uOrigCmd.Parameters.AddWithValue("@person",  personDisplayName);
                            uOrigCmd.Parameters.AddWithValue("@pcode",   !string.IsNullOrEmpty(model.MemberCode) ? model.MemberCode : (object)DBNull.Value);
                            uOrigCmd.ExecuteNonQuery();
                        }

                        // Re-post original receipt details
                        using (var delOrigDtl = conn.CreateCommand())
                        {
                            delOrigDtl.Transaction = tx;
                            delOrigDtl.CommandText = "DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId = @origVid";
                            delOrigDtl.Parameters.AddWithValue("@origVid", origVoucherId);
                            delOrigDtl.ExecuteNonQuery();
                        }

                        // Line 1: Debit Cash/Bank
                        using (var insOrigDtl1 = conn.CreateCommand())
                        {
                            insOrigDtl1.Transaction = tx;
                            insOrigDtl1.CommandText = @"
                                INSERT INTO jeevika_erp.SocVoucherDetail
                                    (VoucherId, SrNo, AccountCode, AccountName, Debit, Credit, Narration)
                                VALUES
                                    (@vid, 1, @code, @name, @amt, 0, @narr)";
                            insOrigDtl1.Parameters.AddWithValue("@vid",  origVoucherId);
                            insOrigDtl1.Parameters.AddWithValue("@code", (object?)model.CashBankCode ?? "ASS-1001");
                            insOrigDtl1.Parameters.AddWithValue("@name", (object?)model.CashBankName ?? (object?)model.CashBank ?? "Cash In Hand");
                            insOrigDtl1.Parameters.AddWithValue("@amt",  model.Amount);
                            insOrigDtl1.Parameters.AddWithValue("@narr", $"{billType} Receipt {origRcptNo}");
                            insOrigDtl1.ExecuteNonQuery();
                        }

                        // Line 2: Credit Member Dues
                        using (var insOrigDtl2 = conn.CreateCommand())
                        {
                            insOrigDtl2.Transaction = tx;
                            insOrigDtl2.CommandText = @"
                                INSERT INTO jeevika_erp.SocVoucherDetail
                                    (VoucherId, SrNo, AccountCode, AccountName, Debit, Credit, Narration)
                                VALUES
                                    (@vid, 2, 'ASS-1025', @name, 0, @amt, @narr)";
                            insOrigDtl2.Parameters.AddWithValue("@vid",  origVoucherId);
                            insOrigDtl2.Parameters.AddWithValue("@name", $"Dues From Members - {personDisplayName}");
                            insOrigDtl2.Parameters.AddWithValue("@amt",  model.Amount);
                            insOrigDtl2.Parameters.AddWithValue("@narr", $"{personDisplayName} - {billType} Receipt {origRcptNo}");
                            insOrigDtl2.ExecuteNonQuery();
                        }
                    }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = "Member receipt reversal updated successfully.",
                    reversalNo = model.ReversalNo,
                    voucherId = id
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/member-receipt-reversals/{*id} or /api/receipt-reversals/{*id} ──
        [HttpDelete("{*id}")]
        public IActionResult DeleteReversal(string id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();

                if (int.TryParse(id, out int numericId))
                {
                    cmd.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherId = @id AND VoucherType IN ('MemberReceiptReversal', 'ReceiptReversal')";
                    cmd.Parameters.AddWithValue("@id", numericId);
                }
                else
                {
                    cmd.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherNo = @vno AND VoucherType IN ('MemberReceiptReversal', 'ReceiptReversal')";
                    cmd.Parameters.AddWithValue("@vno", Uri.UnescapeDataString(id));
                }

                var rows = cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Member receipt reversal deleted successfully.", rowsAffected = rows });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("purge-all")]
        [HttpPost("purge-all")]
        public IActionResult PurgeAllReversals([FromQuery] int societyId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    DELETE FROM jeevika_erp.SocVoucherDetail 
                    WHERE VoucherId IN (SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE (@sid = 0 OR SocietyId = @sid) AND VoucherType IN ('MemberReceiptReversal', 'ReceiptReversal'));
                    DELETE FROM jeevika_erp.SocVoucherHeader 
                    WHERE (@sid = 0 OR SocietyId = @sid) AND VoucherType IN ('MemberReceiptReversal', 'ReceiptReversal');";
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.ExecuteNonQuery();
                return Ok(new { success = true, message = "All receipt reversals purged successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class ReceiptReversalModel
    {
        public int       SocietyId         { get; set; }
        public int       FYId              { get; set; }
        public int       MemberId          { get; set; }
        public string?   ReversalNo        { get; set; }
        public string?   ReceiptNo         { get; set; }
        public string?   BillType          { get; set; }
        public DateTime  ReversalDate      { get; set; } = DateTime.Today;
        public decimal   Amount            { get; set; } = 0;
        public decimal   PrincipalRestored { get; set; } = 0;
        public decimal   InterestRestored  { get; set; } = 0;
        public string?   CashBankCode      { get; set; }
        public string?   CashBankName      { get; set; }
        public string?   CashBank          { get; set; }
        public string?   ChqNo             { get; set; }
        public DateTime? ChqDate           { get; set; }
        public string?   BankName          { get; set; }
        public string?   PersonName        { get; set; }
        public string?   MemberName        { get; set; }
        public string?   MemberCode        { get; set; }
        public string?   FlatNo            { get; set; }
        public string?   BillNo            { get; set; }
        public string?   ReturnReason      { get; set; }
        public string?   Reason            { get; set; }
        public string?   Narration         { get; set; }
        public string?   Particular1       { get; set; }
        public string?   Particular2       { get; set; }
    }
}
