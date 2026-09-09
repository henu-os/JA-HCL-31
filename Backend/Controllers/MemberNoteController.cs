// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MemberNoteController
// Handles Member Debit Note & Credit Note Entries
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/member-notes")]
    [Route("api/member-debit-notes")]
    [Route("api/member-credit-notes")]
    [AllowAnonymous]
    public class MemberNoteController : ControllerBase
    {
        // ── GET /api/member-notes or /api/member-debit-notes or /api/member-credit-notes ──
        [HttpGet]
        public IActionResult GetNotes([FromQuery] int societyId, [FromQuery] int fyId = 0, [FromQuery] string? type = null)
        {
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            string path = HttpContext.Request.Path.Value?.ToLower() ?? "";
            string vType = "MemberDebitNote";
            if (path.Contains("credit-note") || type?.ToLower() == "creditnote" || type?.ToLower() == "credit")
                vType = "MemberCreditNote";
            else if (path.Contains("debit-note") || type?.ToLower() == "debitnote" || type?.ToLower() == "debit")
                vType = "MemberDebitNote";

            try
            {
                using var conn = DbHelper.GetConn();

                // Auto-sync BillType into member notes from line items in SocVoucherDetail or SocBillTypeHead if missing
                using (var syncCmd = conn.CreateCommand())
                {
                    syncCmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader vh
                        SET Particular1 = CASE 
                                WHEN (
                                    EXISTS (
                                        SELECT 1 FROM jeevika_erp.SocVoucherDetail vd 
                                        JOIN jeevika_erp.SocBillTypeHead bth ON vd.AccountCode = bth.AccountCode 
                                        JOIN jeevika_erp.SocBillType bt ON bth.BillTypeId = bt.BillTypeId
                                        WHERE vd.VoucherId = vh.VoucherId AND LOWER(TRIM(bt.BillTypeName)) = 'major repair'
                                    )
                                    OR vh.Narration ILIKE '%major repair%'
                                    OR EXISTS (
                                        SELECT 1 FROM jeevika_erp.SocVoucherDetail vd2 
                                        WHERE vd2.VoucherId = vh.VoucherId AND (vd2.AccountName ILIKE '%major repair%' OR vd2.AccountName ILIKE '%sinking fund%' OR vd2.AccountName ILIKE '%education & training%' OR vd2.AccountName ILIKE '%share capital%')
                                    )
                                ) THEN '[BillType: Major Repair] ' || COALESCE(vh.Narration, 'Debit Note')
                                ELSE '[BillType: Maintenance] ' || COALESCE(vh.Narration, 'Debit Note')
                            END,
                            Narration = CASE 
                                WHEN (
                                    EXISTS (
                                        SELECT 1 FROM jeevika_erp.SocVoucherDetail vd 
                                        JOIN jeevika_erp.SocBillTypeHead bth ON vd.AccountCode = bth.AccountCode 
                                        JOIN jeevika_erp.SocBillType bt ON bth.BillTypeId = bt.BillTypeId
                                        WHERE vd.VoucherId = vh.VoucherId AND LOWER(TRIM(bt.BillTypeName)) = 'major repair'
                                    )
                                    OR vh.Narration ILIKE '%major repair%'
                                    OR EXISTS (
                                        SELECT 1 FROM jeevika_erp.SocVoucherDetail vd2 
                                        WHERE vd2.VoucherId = vh.VoucherId AND (vd2.AccountName ILIKE '%major repair%' OR vd2.AccountName ILIKE '%sinking fund%' OR vd2.AccountName ILIKE '%education & training%' OR vd2.AccountName ILIKE '%share capital%')
                                    )
                                ) THEN 'MAJOR REPAIR ' || vh.VoucherType
                                ELSE 'MAINTENANCE ' || vh.VoucherType
                            END
                        WHERE vh.SocietyId = @sid 
                          AND vh.VoucherType IN ('MemberDebitNote', 'MemberCreditNote', 'DebitNote', 'CreditNote')
                          AND (vh.Particular1 IS NULL OR vh.Particular1 NOT ILIKE '%[BillType:%');";
                    syncCmd.Parameters.AddWithValue("@sid", societyId);
                    syncCmd.ExecuteNonQuery();
                }

                using var cmd  = conn.CreateCommand();

                cmd.CommandText = @"
                    SELECT vh.VoucherId, vh.SocietyId, vh.FYId, vh.VoucherNo, vh.VoucherDate, vh.Amount,
                           vh.PersonName, vh.PersonType, vh.PersonCode, vh.RefNo, vh.Particular1, vh.Particular2, vh.Narration, vh.Status, vh.CreatedAt,
                           m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo
                    FROM jeevika_erp.SocVoucherHeader vh
                    LEFT JOIN LATERAL (
                        SELECT MemberId, MemCode, MemName, Wing, FlatNo 
                        FROM jeevika_erp.SocMember m 
                        WHERE m.SocietyId = vh.SocietyId 
                          AND (
                              m.MemCode = vh.PersonCode 
                              OR m.MemCode = vh.RefNo 
                              OR m.MemName = vh.PersonName 
                              OR CONCAT(m.Wing, '-', m.FlatNo) = vh.RefNo
                          )
                        ORDER BY (CASE WHEN m.IsDeleted = FALSE THEN 0 ELSE 1 END),
                                 (CASE WHEN m.MemCode = vh.PersonCode THEN 0 WHEN m.MemCode = vh.RefNo THEN 1 ELSE 2 END),
                                 m.MemberId DESC
                        LIMIT 1
                    ) m ON TRUE
                    WHERE vh.SocietyId = @sid 
                      AND (@fyid = 0 OR vh.FYId = @fyid) 
                      AND vh.VoucherType IN (@vtype, CASE WHEN @vtype = 'MemberDebitNote' THEN 'DebitNote' ELSE 'CreditNote' END) 
                      AND vh.IsDeleted = FALSE
                    ORDER BY vh.VoucherDate DESC, vh.VoucherId DESC";

                cmd.Parameters.AddWithValue("@sid",   societyId);
                cmd.Parameters.AddWithValue("@fyid",  fyId);
                cmd.Parameters.AddWithValue("@vtype", vType);

                var list = new List<Dictionary<string, object>>();
                var vids = new List<int>();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        int vid = Convert.ToInt32(r["VoucherId"]);
                        vids.Add(vid);

                        var part1Str = r["Particular1"] != DBNull.Value ? r["Particular1"].ToString() ?? "" : "";
                        var part2Str = r["Particular2"] != DBNull.Value ? r["Particular2"].ToString() ?? "" : "";
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

                        var item = new Dictionary<string, object>
                        {
                            ["noteId"]      = vid,
                            ["voucherId"]   = vid,
                            ["noteNo"]      = r["VoucherNo"].ToString() ?? "",
                            ["voucherNo"]   = r["VoucherNo"].ToString() ?? "",
                            ["dnNo"]        = r["VoucherNo"].ToString() ?? "",
                            ["cnNo"]        = r["VoucherNo"].ToString() ?? "",
                            ["dnDate"]      = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                            ["cnDate"]      = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                            ["noteDate"]    = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                            ["voucherDate"] = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                            ["billType"]    = billType,
                            ["personName"]  = r["PersonName"].ToString() ?? "",
                            ["memberName"]  = r["MemName"] != DBNull.Value ? r["MemName"].ToString() : (r["PersonName"].ToString() ?? ""),
                            ["memberCode"]  = r["MemCode"] != DBNull.Value ? r["MemCode"].ToString() : (r["PersonCode"] != DBNull.Value ? r["PersonCode"].ToString() : ""),
                            ["memberId"]    = r["MemberId"] != DBNull.Value ? Convert.ToInt32(r["MemberId"]) : 0,
                            ["wing"]        = r["Wing"] != DBNull.Value ? r["Wing"].ToString() : "",
                            ["flatNo"]      = r["FlatNo"] != DBNull.Value ? r["FlatNo"].ToString() : "",
                            ["amount"]      = Convert.ToDecimal(r["Amount"]),
                            ["principalAmount"] = Convert.ToDecimal(r["Amount"]),
                            ["interestAmount"] = 0m,
                            ["totalAmount"] = Convert.ToDecimal(r["Amount"]),
                            ["period"]      = r["RefNo"].ToString() ?? "",
                            ["narration"]   = narrStr,
                            ["particular1"] = !string.IsNullOrWhiteSpace(part1Str) ? part1Str : narrStr,
                            ["particular2"] = part2Str,
                            ["status"]      = r["Status"].ToString() ?? "Posted",
                            ["items"]       = new List<object>()
                        };
                        list.Add(item);
                    }
                }

                // Query Line Items from SocVoucherDetail
                if (vids.Count > 0)
                {
                    using var dtlCmd = conn.CreateCommand();
                    dtlCmd.CommandText = @"
                        SELECT VoucherId, AccountCode, AccountName, Debit, Credit, Narration
                        FROM jeevika_erp.SocVoucherDetail
                        WHERE VoucherId = ANY(@vids)
                        ORDER BY SrNo ASC, DetailId ASC";
                    dtlCmd.Parameters.AddWithValue("@vids", vids.ToArray());
                    using var dR = dtlCmd.ExecuteReader();
                    var dtlMap = new Dictionary<int, List<object>>();
                    while (dR.Read())
                    {
                        int vid = Convert.ToInt32(dR["VoucherId"]);
                        if (!dtlMap.ContainsKey(vid)) dtlMap[vid] = new List<object>();
                        decimal dr = dR["Debit"] != DBNull.Value ? Convert.ToDecimal(dR["Debit"]) : 0;
                        decimal cr = dR["Credit"] != DBNull.Value ? Convert.ToDecimal(dR["Credit"]) : 0;
                        dtlMap[vid].Add(new
                        {
                            accountCode = dR["AccountCode"].ToString() ?? "",
                            accountName = dR["AccountName"].ToString() ?? "",
                            amount      = dr > 0 ? dr : cr,
                            narration   = dR["Narration"].ToString() ?? ""
                        });
                    }

                    foreach (var it in list)
                    {
                        int vid = (int)it["voucherId"];
                        if (dtlMap.ContainsKey(vid))
                        {
                            it["items"] = dtlMap[vid];
                        }
                    }
                }

                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/member-notes or /api/member-debit-notes or /api/member-credit-notes ──
        [HttpPost]
        public IActionResult CreateNote([FromBody] MemberNoteModel model)
        {
            if (model.SocietyId <= 0 || model.FYId <= 0 || model.Amount <= 0)
                return BadRequest(new { success = false, message = "SocietyId, FYId and Amount are required." });

            string path = HttpContext.Request.Path.Value?.ToLower() ?? "";
            string vType = "MemberDebitNote";
            if (path.Contains("credit-note") || model.NoteType?.ToLower() == "creditnote" || model.NoteType?.ToLower() == "membercreditnote")
                vType = "MemberCreditNote";
            else if (path.Contains("debit-note") || model.NoteType?.ToLower() == "debitnote" || model.NoteType?.ToLower() == "memberdebitnote")
                vType = "MemberDebitNote";

            string prefix = (vType == "MemberCreditNote") ? "CN" : "DN";

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                // 1. Resolve Member Details if MemberId is supplied
                string memCode = model.MemberCode ?? "";
                string memName = model.MemberName ?? "";
                string personDisplayName = model.PersonName ?? "";

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
                        personDisplayName = string.IsNullOrEmpty(personDisplayName) ? $"{memName} ({flatLabel})" : personDisplayName;
                    }
                }

                if (string.IsNullOrEmpty(personDisplayName))
                {
                    personDisplayName = !string.IsNullOrEmpty(memName) ? memName : "Member";
                }

                // 2. Generate Note Voucher No monotonically
                string noteNo = model.NoteNo?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(noteNo))
                {
                    using var countCmd = conn.CreateCommand();
                    countCmd.Transaction = tx;
                    countCmd.CommandText = "SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType = @vtype";
                    countCmd.Parameters.AddWithValue("@sid",   model.SocietyId);
                    countCmd.Parameters.AddWithValue("@fyid",  model.FYId);
                    countCmd.Parameters.AddWithValue("@vtype", vType);

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

                    string actualPfx = (vType == "MemberCreditNote") ? "MCN" : "MDN";
                    noteNo = $"{actualPfx}/2025-26/{(maxSeq + 1):D2}";
                }

                // Clean up any soft-deleted voucher with same number to prevent unique constraint violation
                using (var cleanCmd = conn.CreateCommand())
                {
                    cleanCmd.Transaction = tx;
                    cleanCmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE);
                        DELETE FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE;
                        DELETE FROM jeevika_erp.SocMemberNote WHERE SocietyId = @sid AND FYId = @fyid AND NoteNo = @vno AND IsDeleted = TRUE;";
                    cleanCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                    cleanCmd.Parameters.AddWithValue("@fyid", model.FYId);
                    cleanCmd.Parameters.AddWithValue("@vno",  noteNo);
                    cleanCmd.ExecuteNonQuery();
                }

                // 3. Check for existing active voucher
                int existingVoucherId = 0;
                using (var checkCmd = conn.CreateCommand())
                {
                    checkCmd.Transaction = tx;
                    checkCmd.CommandText = "SELECT VoucherId, VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = FALSE LIMIT 1";
                    checkCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                    checkCmd.Parameters.AddWithValue("@fyid", model.FYId);
                    checkCmd.Parameters.AddWithValue("@vno",  noteNo);
                    using var foundR = checkCmd.ExecuteReader();
                    if (foundR.Read())
                    {
                        existingVoucherId = Convert.ToInt32(foundR["VoucherId"]);
                        noteNo = foundR["VoucherNo"]?.ToString() ?? noteNo; // IMMUTABILITY
                    }
                }

                string billType = !string.IsNullOrWhiteSpace(model.BillType) ? model.BillType.Trim() : "Maintenance";
                string part1 = $"[BillType: {billType}] {(string.IsNullOrWhiteSpace(model.Particular1) ? (!string.IsNullOrWhiteSpace(model.Narration) ? model.Narration : $"{vType} adjustment") : model.Particular1)}";
                string part2 = model.Particular2 ?? "";
                string narr = !string.IsNullOrWhiteSpace(model.Narration) ? model.Narration : $"{billType.ToUpper()} {vType} {(string.IsNullOrWhiteSpace(model.Period) ? "" : $"({model.Period})")}";

                int voucherId = existingVoucherId;
                if (existingVoucherId > 0)
                {
                    using var uCmd = conn.CreateCommand();
                    uCmd.Transaction = tx;
                    uCmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET VoucherDate = @vdate, Amount = @amt, PersonName = @person, PersonCode = @pcode,
                            RefNo = @refno, Particular1 = @p1, Particular2 = @p2, Narration = @narr, UpdatedAt = NOW()
                        WHERE VoucherId = @vid";
                    uCmd.Parameters.AddWithValue("@vid",    existingVoucherId);
                    uCmd.Parameters.AddWithValue("@vdate",  model.NoteDate);
                    uCmd.Parameters.AddWithValue("@amt",    model.Amount);
                    uCmd.Parameters.AddWithValue("@person", personDisplayName);
                    uCmd.Parameters.AddWithValue("@pcode",  !string.IsNullOrEmpty(memCode) ? memCode : (model.MemberId > 0 ? model.MemberId.ToString() : (object)DBNull.Value));
                    uCmd.Parameters.AddWithValue("@refno",  !string.IsNullOrEmpty(memCode) ? memCode : (object?)model.Period ?? "");
                    uCmd.Parameters.AddWithValue("@p1",     part1);
                    uCmd.Parameters.AddWithValue("@p2",     part2);
                    uCmd.Parameters.AddWithValue("@narr",   narr);
                    uCmd.ExecuteNonQuery();

                    if (model.MemberId > 0)
                    {
                        using var mnUpCmd = conn.CreateCommand();
                        mnUpCmd.Transaction = tx;
                        mnUpCmd.CommandText = @"
                            UPDATE jeevika_erp.SocMemberNote
                            SET NoteDate = @ndate, MemberId = @mid, Amount = @amt, Reason = @reason
                            WHERE SocietyId = @sid AND FYId = @fyid AND NoteNo = @nno";
                        mnUpCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                        mnUpCmd.Parameters.AddWithValue("@fyid",   model.FYId);
                        mnUpCmd.Parameters.AddWithValue("@nno",    noteNo);
                        mnUpCmd.Parameters.AddWithValue("@ndate",  model.NoteDate);
                        mnUpCmd.Parameters.AddWithValue("@mid",    model.MemberId);
                        mnUpCmd.Parameters.AddWithValue("@amt",    model.Amount);
                        mnUpCmd.Parameters.AddWithValue("@reason", (object?)model.Narration ?? (object?)model.Period ?? "");
                        mnUpCmd.ExecuteNonQuery();
                    }
                }
                else
                {
                    using var vCmd = conn.CreateCommand();
                    vCmd.Transaction = tx;
                    vCmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherHeader
                            (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, Amount,
                             PersonName, PersonType, PersonCode, RefNo, Particular1, Particular2, Narration, Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                        VALUES
                            (@sid, @fyid, @vno, @vtype, @vdate, @amt,
                             @person, 'Member', @pcode, @refno, @p1, @p2, @narr, 'Posted', FALSE, @user, NOW(), NOW())
                        RETURNING VoucherId";

                    vCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                    vCmd.Parameters.AddWithValue("@fyid",   model.FYId);
                    vCmd.Parameters.AddWithValue("@vno",    noteNo);
                    vCmd.Parameters.AddWithValue("@vtype",  vType);
                    vCmd.Parameters.AddWithValue("@vdate",  model.NoteDate);
                    vCmd.Parameters.AddWithValue("@amt",    model.Amount);
                    vCmd.Parameters.AddWithValue("@person", personDisplayName);
                    vCmd.Parameters.AddWithValue("@pcode",  !string.IsNullOrEmpty(memCode) ? memCode : (model.MemberId > 0 ? model.MemberId.ToString() : (object)DBNull.Value));
                    vCmd.Parameters.AddWithValue("@refno",  !string.IsNullOrEmpty(memCode) ? memCode : (object?)model.Period ?? "");
                    vCmd.Parameters.AddWithValue("@p1",     part1);
                    vCmd.Parameters.AddWithValue("@p2",     part2);
                    vCmd.Parameters.AddWithValue("@narr",   narr);
                    vCmd.Parameters.AddWithValue("@user",   User.Identity?.Name       ?? "ADMIN");

                    voucherId = Convert.ToInt32(vCmd.ExecuteScalar());

                    // 4. Create record in SocMemberNote
                    if (model.MemberId > 0)
                    {
                        using var mnCmd = conn.CreateCommand();
                        mnCmd.Transaction = tx;
                        mnCmd.CommandText = @"
                            INSERT INTO jeevika_erp.SocMemberNote
                                (SocietyId, FYId, NoteNo, NoteType, NoteDate, MemberId, Amount, Reason, IsDeleted, CreatedAt)
                            VALUES
                                (@sid, @fyid, @nno, @ntype, @ndate, @mid, @amt, @reason, FALSE, NOW())";
                        mnCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                        mnCmd.Parameters.AddWithValue("@fyid",   model.FYId);
                        mnCmd.Parameters.AddWithValue("@nno",    noteNo);
                        mnCmd.Parameters.AddWithValue("@ntype",  vType);
                        mnCmd.Parameters.AddWithValue("@ndate",  model.NoteDate);
                        mnCmd.Parameters.AddWithValue("@mid",    model.MemberId);
                        mnCmd.Parameters.AddWithValue("@amt",    model.Amount);
                        mnCmd.Parameters.AddWithValue("@reason", (object?)model.Narration ?? (object?)model.Period ?? "");
                        mnCmd.ExecuteNonQuery();
                    }
                }

                // 5. Insert / Update Line Items into SocVoucherDetail
                using (var delDtl = conn.CreateCommand())
                {
                    delDtl.Transaction = tx;
                    delDtl.CommandText = "DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId = @vid";
                    delDtl.Parameters.AddWithValue("@vid", voucherId);
                    delDtl.ExecuteNonQuery();
                }

                if (model.Items != null && model.Items.Count > 0)
                {
                    int sr = 1;
                    foreach (var it in model.Items)
                    {
                        if (it.Amount <= 0) continue;
                        using var dCmd = conn.CreateCommand();
                        dCmd.Transaction = tx;
                        dCmd.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, @sr, @acode, @aname, @dr, @cr, @narr)";
                        dCmd.Parameters.AddWithValue("@vid",   voucherId);
                        dCmd.Parameters.AddWithValue("@sr",    sr++);
                        dCmd.Parameters.AddWithValue("@acode", it.AccountCode ?? "ACC-101");
                        dCmd.Parameters.AddWithValue("@aname", it.AccountName ?? "Charge Head");
                        dCmd.Parameters.AddWithValue("@dr",    vType == "MemberDebitNote" ? it.Amount : 0);
                        dCmd.Parameters.AddWithValue("@cr",    vType == "MemberCreditNote" ? it.Amount : 0);
                        dCmd.Parameters.AddWithValue("@narr",  (object?)model.Narration ?? $"{vType} line item");
                        dCmd.ExecuteNonQuery();
                    }
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = $"{vType} recorded successfully.",
                    noteNo,
                    voucherId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/member-notes/{*id} or /api/member-debit-notes/{*id} or /api/member-credit-notes/{*id} ──
        [HttpDelete("{*id}")]
        public IActionResult DeleteNote(string id)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(id))
                    return BadRequest(new { success = false, message = "ID is required." });

                id = System.Net.WebUtility.UrlDecode(id).Trim();

                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();
                using var cmd  = conn.CreateCommand();
                cmd.Transaction = tx;

                if (int.TryParse(id, out int numId))
                {
                    cmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE (VoucherId = @numId OR VoucherNo = @id)
                        );
                        UPDATE jeevika_erp.SocMemberNote SET IsDeleted = TRUE WHERE NoteNo IN (
                            SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE (VoucherId = @numId OR VoucherNo = @id)
                        );
                        UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE (VoucherId = @numId OR VoucherNo = @id);";
                    cmd.Parameters.AddWithValue("@numId", numId);
                    cmd.Parameters.AddWithValue("@id",    id);
                }
                else
                {
                    cmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE VoucherNo = @id
                        );
                        UPDATE jeevika_erp.SocMemberNote SET IsDeleted = TRUE WHERE NoteNo = @id;
                        UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherNo = @id;";
                    cmd.Parameters.AddWithValue("@id", id);
                }

                cmd.ExecuteNonQuery();
                tx.Commit();

                return Ok(new { success = true, message = "Note deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("purge-all")]
        [HttpPost("purge-all")]
        public IActionResult PurgeAllNotes([FromQuery] int societyId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    DELETE FROM jeevika_erp.SocVoucherDetail 
                    WHERE VoucherId IN (SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE (@sid = 0 OR SocietyId = @sid) AND VoucherType IN ('MemberDebitNote', 'DebitNote', 'MemberCreditNote', 'CreditNote'));
                    DELETE FROM jeevika_erp.SocMemberNote 
                    WHERE (@sid = 0 OR SocietyId = @sid);
                    DELETE FROM jeevika_erp.SocVoucherHeader 
                    WHERE (@sid = 0 OR SocietyId = @sid) AND VoucherType IN ('MemberDebitNote', 'DebitNote', 'MemberCreditNote', 'CreditNote');";
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.ExecuteNonQuery();
                return Ok(new { success = true, message = "All member notes purged successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class MemberNoteItemModel
    {
        public string? AccountCode { get; set; }
        public string? AccountName { get; set; }
        public decimal Amount      { get; set; }
    }

    public class MemberNoteModel
    {
        public int                         SocietyId   { get; set; }
        public int                         FYId        { get; set; }
        public int                         MemberId    { get; set; }
        public string?                     MemberCode  { get; set; }
        public string?                     MemberName  { get; set; }
        public string?                     NoteNo      { get; set; }
        public string?                     NoteType    { get; set; } // "DebitNote" or "CreditNote"
        public string?                     BillType    { get; set; }
        public int                         BillTypeId  { get; set; }
        public DateTime                    NoteDate    { get; set; } = DateTime.Today;
        public decimal                     Amount      { get; set; } = 0;
        public string?                     PersonName  { get; set; }
        public string?                     Period      { get; set; }
        public string?                     Particular1 { get; set; }
        public string?                     Particular2 { get; set; }
        public string?                     Narration   { get; set; }
        public List<MemberNoteItemModel>?  Items       { get; set; }
    }
}
