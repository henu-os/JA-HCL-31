// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MemberBillTypeTransferController
// Handles Member Bill Type Transfer Entries & Double-Entry Ledger Posting
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/member-bill-type-transfers")]
    [AllowAnonymous]
    public class MemberBillTypeTransferController : ControllerBase
    {
        // ── GET /api/member-bill-type-transfers?societyId=X&fyId=Y ──
        [HttpGet]
        public IActionResult GetTransfers([FromQuery] int societyId, [FromQuery] int fyId = 0)
        {
            if (societyId <= 0) societyId = 1;

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();

                cmd.CommandText = @"
                    SELECT vh.VoucherId, vh.SocietyId, vh.FYId, vh.VoucherNo, vh.VoucherDate, vh.Amount,
                           vh.PersonName, vh.PersonType, vh.PersonCode, vh.RefNo, vh.Narration, vh.Status, vh.CreatedAt,
                           m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo
                    FROM jeevika_erp.SocVoucherHeader vh
                    LEFT JOIN jeevika_erp.SocMember m ON (m.SocietyId = vh.SocietyId AND (m.MemCode = vh.PersonCode OR m.MemCode = vh.RefNo OR CONCAT(m.Wing, '-', m.FlatNo) = vh.RefNo OR vh.PersonName ILIKE CONCAT('%', m.MemName, '%') OR (vh.PersonCode ~ '^\d+$' AND m.MemberId = CAST(vh.PersonCode AS INTEGER))))
                    WHERE vh.SocietyId = @sid AND (@fyid = 0 OR vh.FYId = @fyid) AND vh.VoucherType = 'BillTypeTransfer' AND vh.IsDeleted = FALSE
                    ORDER BY vh.VoucherDate DESC, vh.VoucherId DESC";

                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    var vId    = Convert.ToInt32(r["VoucherId"]);
                    var vNo    = r["VoucherNo"].ToString() ?? "";
                    var vDate  = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd");
                    var pName  = r["PersonName"].ToString() ?? "";
                    var amt    = Convert.ToDecimal(r["Amount"]);
                    var refStr = r["RefNo"].ToString() ?? "";
                    var narr   = r["Narration"].ToString() ?? "";
                    var status = r["Status"].ToString() ?? "Posted";

                    var parts = refStr.Split('|');
                    var leftBt    = parts.Length > 0 && !string.IsNullOrWhiteSpace(parts[0]) ? parts[0] : "Major Repair";
                    var leftType  = parts.Length > 1 && !string.IsNullOrWhiteSpace(parts[1]) ? parts[1] : "Dr";
                    var rightBt   = parts.Length > 2 && !string.IsNullOrWhiteSpace(parts[2]) ? parts[2] : "Maintenance";
                    var rightType = parts.Length > 3 && !string.IsNullOrWhiteSpace(parts[3]) ? parts[3] : "Cr";
                    var flatNo    = parts.Length > 4 ? parts[4] : (r["FlatNo"] != DBNull.Value ? r["FlatNo"].ToString() : "");
                    var part2     = parts.Length > 5 ? parts[5] : "Approved by Society";

                    var mId = r["MemberId"] != DBNull.Value ? Convert.ToInt32(r["MemberId"]) : 0;
                    var mCode = r["MemCode"] != DBNull.Value ? r["MemCode"].ToString() : (r["PersonCode"] != DBNull.Value ? r["PersonCode"].ToString() : "");
                    var mName = r["MemName"] != DBNull.Value ? r["MemName"].ToString() : pName;

                    list.Add(new
                    {
                        trfId          = vId,
                        voucherId      = vId,
                        transferId     = vId,
                        trfNo          = vNo,
                        voucherNo      = vNo,
                        trfDate        = vDate,
                        date           = vDate,
                        member1Id      = mId,
                        member2Id      = mId,
                        memberCode     = mCode,
                        memberName     = mName,
                        memName        = mName,
                        wing           = r["Wing"] != DBNull.Value ? r["Wing"].ToString() : "",
                        flatNo         = flatNo,
                        leftBillType   = leftBt,
                        leftType       = leftType,
                        leftPrincipal  = amt,
                        leftInterest   = 0m,
                        rightBillType  = rightBt,
                        rightType      = rightType,
                        rightPrincipal = amt,
                        rightInterest  = 0m,
                        amount         = amt,
                        particular1    = narr,
                        particular2    = part2,
                        narration      = narr,
                        status         = status
                    });
                }

                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/member-bill-type-transfers ──
        [HttpPost]
        public IActionResult CreateTransfer([FromBody] BillTypeTransferModel model)
        {
            if (model.SocietyId <= 0) model.SocietyId = 1;
            if (model.FYId <= 0) model.FYId = 1;
            if (model.Amount <= 0)
                return BadRequest(new { success = false, message = "Transfer amount must be greater than 0." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                // 1. Scan only active existing numbers in header to prevent duplicate key constraint
                using var checkCmd = conn.CreateCommand();
                checkCmd.Transaction = tx;
                checkCmd.CommandText = "SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND IsDeleted = FALSE";
                checkCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                checkCmd.Parameters.AddWithValue("@fyid", model.FYId);

                var existingNos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                using (var reader = checkCmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        var n = reader.GetString(0);
                        if (!string.IsNullOrWhiteSpace(n)) existingNos.Add(n.Trim());
                    }
                }

                string vNo = model.TrfNo?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(vNo) || existingNos.Contains(vNo))
                {
                    string prefix = "MTT-B/2026-27/";
                    int seq = 1;
                    do
                    {
                        vNo = $"{prefix}{seq++:D2}";
                    } while (existingNos.Contains(vNo));
                }

                var memberName = !string.IsNullOrWhiteSpace(model.MemberName) ? model.MemberName : (!string.IsNullOrWhiteSpace(model.Member1Name) ? model.Member1Name : "Member");
                var narration = !string.IsNullOrWhiteSpace(model.Particulars) ? model.Particulars : (!string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1 : $"Bill Type Transfer {model.LeftBillType} to {model.RightBillType}");

                string leftName = !string.IsNullOrWhiteSpace(model.LeftBillType) ? model.LeftBillType : "Major Repair";
                string rightName = !string.IsNullOrWhiteSpace(model.RightBillType) ? model.RightBillType : "Maintenance";
                string leftType = !string.IsNullOrWhiteSpace(model.LeftType) ? model.LeftType : "Dr";
                string rightType = !string.IsNullOrWhiteSpace(model.RightType) ? model.RightType : "Cr";
                string flatNo = !string.IsNullOrWhiteSpace(model.FlatNo) ? model.FlatNo : "";
                string part2 = !string.IsNullOrWhiteSpace(model.Particular2) ? model.Particular2 : "Approved by Society";

                string metaRef = $"{leftName}|{leftType}|{rightName}|{rightType}|{flatNo}|{part2}";

                // 1.5 Clean up any soft-deleted voucher with same number to prevent unique constraint violation
                using var cleanCmd = conn.CreateCommand();
                cleanCmd.Transaction = tx;
                cleanCmd.CommandText = @"
                    DELETE FROM jeevika_erp.SocVoucherDetail
                    WHERE VoucherId IN (SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE);
                    DELETE FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE;";
                cleanCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                cleanCmd.Parameters.AddWithValue("@fyid", model.FYId);
                cleanCmd.Parameters.AddWithValue("@vno",  vNo);
                cleanCmd.ExecuteNonQuery();

                // 2. Create Header
                using var vCmd = conn.CreateCommand();
                vCmd.Transaction = tx;
                vCmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocVoucherHeader
                        (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, Amount,
                         PersonName, PersonType, PersonCode, RefNo, Particular1, Particular2, Narration, Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                    VALUES
                        (@sid, @fyid, @vno, 'BillTypeTransfer', @vdate, @amt,
                         @person, 'Member', @pcode, @ref, @p1, @p2, @narr, 'Posted', FALSE, @user, NOW(), NOW())
                    RETURNING VoucherId";

                var personNameFormatted = !string.IsNullOrWhiteSpace(model.MemberCode)
                    ? $"[{model.MemberCode}] {memberName} ({model.FlatNo})"
                    : (!string.IsNullOrWhiteSpace(model.FlatNo) ? $"{memberName} ({model.FlatNo})" : memberName);

                var memCodeVal = !string.IsNullOrWhiteSpace(model.MemberCode)
                    ? model.MemberCode.Trim()
                    : (model.MemberId > 0 ? model.MemberId.ToString() : (model.FlatNo ?? ""));

                vCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                vCmd.Parameters.AddWithValue("@fyid",   model.FYId);
                vCmd.Parameters.AddWithValue("@vno",    vNo);
                vCmd.Parameters.AddWithValue("@vdate",  model.TransferDate != default ? model.TransferDate : (model.TrfDate != default ? model.TrfDate : DateTime.Today));
                vCmd.Parameters.AddWithValue("@amt",    model.Amount);
                vCmd.Parameters.AddWithValue("@person", personNameFormatted);
                vCmd.Parameters.AddWithValue("@pcode",  memCodeVal);
                vCmd.Parameters.AddWithValue("@ref",    metaRef);
                vCmd.Parameters.AddWithValue("@p1",     $"[Transfer: {leftName} to {rightName}]");
                vCmd.Parameters.AddWithValue("@p2",     $"Trf: {leftName} ({leftType}) -> {rightName} ({rightType})");
                vCmd.Parameters.AddWithValue("@narr",   narration);
                vCmd.Parameters.AddWithValue("@user",   User.Identity?.Name ?? "ADMIN");

                var voucherId = Convert.ToInt32(vCmd.ExecuteScalar());

                // 3. Resolve Dues From Members / Member AccountId
                int duesAccId = 0;
                string duesCode = "ASS-1025";
                string duesName = "Dues From Members";

                using (var accCmd = conn.CreateCommand())
                {
                    accCmd.Transaction = tx;
                    accCmd.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccCode = 'ASS-1025' OR AccName ILIKE 'Dues From Members%') AND IsDeleted = FALSE LIMIT 1";
                    accCmd.Parameters.AddWithValue("@sid", model.SocietyId);
                    using var rA = accCmd.ExecuteReader();
                    if (rA.Read())
                    {
                        duesAccId = Convert.ToInt32(rA["AccountId"]);
                        duesCode  = rA["AccCode"]?.ToString() ?? "ASS-1025";
                        duesName  = rA["AccName"]?.ToString() ?? "Dues From Members";
                    }
                }

                // If not found, fallback to first available account
                if (duesAccId <= 0)
                {
                    using var fallbackCmd = conn.CreateCommand();
                    fallbackCmd.Transaction = tx;
                    fallbackCmd.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND IsDeleted = FALSE ORDER BY AccountId LIMIT 1";
                    fallbackCmd.Parameters.AddWithValue("@sid", model.SocietyId);
                    using (var rFb = fallbackCmd.ExecuteReader())
                    {
                        if (rFb.Read())
                        {
                            duesAccId = Convert.ToInt32(rFb["AccountId"]);
                            duesCode  = rFb["AccCode"]?.ToString() ?? "ASS-1025";
                            duesName  = rFb["AccName"]?.ToString() ?? "Dues From Members";
                        }
                    }
                }

                if (duesAccId > 0)
                {
                    // Detail Line 1: Left Bill Type Transfer Out (Credit)
                    using var d1Cmd = conn.CreateCommand();
                    d1Cmd.Transaction = tx;
                    d1Cmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 1, @aid, @code, @name, 0, @amt, @narr)";
                    d1Cmd.Parameters.AddWithValue("@vid",   voucherId);
                    d1Cmd.Parameters.AddWithValue("@aid",   duesAccId);
                    d1Cmd.Parameters.AddWithValue("@code",  duesCode);
                    d1Cmd.Parameters.AddWithValue("@name",  $"{duesName} [{leftName}]");
                    d1Cmd.Parameters.AddWithValue("@amt",   model.Amount);
                    d1Cmd.Parameters.AddWithValue("@narr",  $"Transfer Out from {leftName} for {memberName}");
                    d1Cmd.ExecuteNonQuery();

                    // Detail Line 2: Right Bill Type Transfer In (Debit)
                    using var d2Cmd = conn.CreateCommand();
                    d2Cmd.Transaction = tx;
                    d2Cmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 2, @aid, @code, @name, @amt, 0, @narr)";
                    d2Cmd.Parameters.AddWithValue("@vid",   voucherId);
                    d2Cmd.Parameters.AddWithValue("@aid",   duesAccId);
                    d2Cmd.Parameters.AddWithValue("@code",  duesCode);
                    d2Cmd.Parameters.AddWithValue("@name",  $"{duesName} [{rightName}]");
                    d2Cmd.Parameters.AddWithValue("@amt",   model.Amount);
                    d2Cmd.Parameters.AddWithValue("@narr",  $"Transfer In to {rightName} for {memberName}");
                    d2Cmd.ExecuteNonQuery();
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = "Bill Type Transfer recorded successfully.",
                    voucherNo = vNo,
                    voucherId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/member-bill-type-transfers/{id} ──
        [HttpPut("{id}")]
        public IActionResult UpdateTransfer(string id, [FromBody] BillTypeTransferModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                var memberName = !string.IsNullOrWhiteSpace(model.MemberName) ? model.MemberName : (!string.IsNullOrWhiteSpace(model.Member1Name) ? model.Member1Name : "Member");
                var narration = !string.IsNullOrWhiteSpace(model.Particulars) ? model.Particulars : (!string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1 : $"Bill Type Transfer {model.LeftBillType} to {model.RightBillType}");

                string leftName = !string.IsNullOrWhiteSpace(model.LeftBillType) ? model.LeftBillType : "Major Repair";
                string rightName = !string.IsNullOrWhiteSpace(model.RightBillType) ? model.RightBillType : "Maintenance";
                string leftType = !string.IsNullOrWhiteSpace(model.LeftType) ? model.LeftType : "Dr";
                string rightType = !string.IsNullOrWhiteSpace(model.RightType) ? model.RightType : "Cr";
                string flatNo = !string.IsNullOrWhiteSpace(model.FlatNo) ? model.FlatNo : "";
                string part2 = !string.IsNullOrWhiteSpace(model.Particular2) ? model.Particular2 : "Approved by Society";

                string metaRef = $"{leftName}|{leftType}|{rightName}|{rightType}|{flatNo}|{part2}";

                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;

                if (int.TryParse(id, out int numId))
                {
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET Amount = @amt, PersonName = @person, PersonCode = @pcode, RefNo = @ref, 
                            Particular1 = @p1, Particular2 = @p2, Narration = @narr,
                            VoucherDate = @vdate, UpdatedAt = NOW()
                        WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@numId",  numId);
                    cmd.Parameters.AddWithValue("@id",     id);
                }
                else
                {
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET Amount = @amt, PersonName = @person, PersonCode = @pcode, RefNo = @ref, 
                            Particular1 = @p1, Particular2 = @p2, Narration = @narr,
                            VoucherDate = @vdate, UpdatedAt = NOW()
                        WHERE VoucherNo = @id AND IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@id", id);
                }

                var personNameFormatted = !string.IsNullOrWhiteSpace(model.MemberCode)
                    ? $"[{model.MemberCode}] {memberName} ({model.FlatNo})"
                    : (!string.IsNullOrWhiteSpace(model.FlatNo) ? $"{memberName} ({model.FlatNo})" : memberName);

                var memCodeVal = !string.IsNullOrWhiteSpace(model.MemberCode)
                    ? model.MemberCode.Trim()
                    : (model.MemberId > 0 ? model.MemberId.ToString() : (model.FlatNo ?? ""));

                cmd.Parameters.AddWithValue("@amt",    model.Amount);
                cmd.Parameters.AddWithValue("@person", personNameFormatted);
                cmd.Parameters.AddWithValue("@pcode",  memCodeVal);
                cmd.Parameters.AddWithValue("@ref",    metaRef);
                cmd.Parameters.AddWithValue("@p1",     $"[Transfer: {leftName} to {rightName}]");
                cmd.Parameters.AddWithValue("@p2",     $"Trf: {leftName} ({leftType}) -> {rightName} ({rightType})");
                cmd.Parameters.AddWithValue("@narr",   narration);
                cmd.Parameters.AddWithValue("@vdate",  model.TransferDate != default ? model.TransferDate : (model.TrfDate != default ? model.TrfDate : DateTime.Today));

                cmd.ExecuteNonQuery();
                tx.Commit();

                return Ok(new { success = true, message = "Bill Type Transfer updated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/member-bill-type-transfers/{*id} ──
        [HttpDelete("{*id}")]
        public IActionResult DeleteTransfer(string id, [FromQuery] string? voucherNo = null)
        {
            var target = !string.IsNullOrWhiteSpace(voucherNo) ? voucherNo : id;
            if (string.IsNullOrWhiteSpace(target))
                return BadRequest(new { success = false, message = "Invalid transfer ID." });

            target = System.Net.WebUtility.UrlDecode(target).Trim();

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                if (int.TryParse(target, out int numId))
                {
                    cmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE (VoucherId = @numId OR VoucherNo = @id)
                        );
                        UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE;";
                    cmd.Parameters.AddWithValue("@numId", numId);
                    cmd.Parameters.AddWithValue("@id",    target);
                }
                else
                {
                    cmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE VoucherNo = @id
                        );
                        UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherNo = @id AND IsDeleted = FALSE;";
                    cmd.Parameters.AddWithValue("@id", target);
                }

                int rows = cmd.ExecuteNonQuery();
                tx.Commit();

                return Ok(new { success = true, message = "Bill Type Transfer deleted successfully.", deletedCount = rows });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/member-bill-type-transfers/batch-delete ──
        [HttpPost("batch-delete")]
        public IActionResult BatchDelete([FromBody] List<int> ids)
        {
            if (ids == null || ids.Count == 0)
                return BadRequest(new { success = false, message = "No IDs provided." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherId = ANY(@ids) AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@ids", ids.ToArray());
                int rows = cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = $"{rows} transfer(s) deleted successfully.", deletedCount = rows });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("purge-all")]
        [HttpPost("purge-all")]
        public IActionResult PurgeAllTransfers([FromQuery] int societyId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    DELETE FROM jeevika_erp.SocVoucherDetail 
                    WHERE VoucherId IN (SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE (@sid = 0 OR SocietyId = @sid) AND VoucherType = 'BillTypeTransfer');
                    DELETE FROM jeevika_erp.SocVoucherHeader 
                    WHERE (@sid = 0 OR SocietyId = @sid) AND VoucherType = 'BillTypeTransfer';";
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.ExecuteNonQuery();
                return Ok(new { success = true, message = "All bill type transfers purged successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class BillTypeTransferModel
    {
        public int      SocietyId     { get; set; }
        public int      FYId          { get; set; }
        public int      VoucherId     { get; set; } = 0;
        public string?  TrfNo         { get; set; }
        public DateTime TransferDate  { get; set; } = DateTime.Today;
        public DateTime TrfDate       { get; set; } = DateTime.Today;
        public decimal  Amount        { get; set; } = 0;
        public int      MemberId      { get; set; } = 0;
        public string?  MemberName    { get; set; }
        public string?  MemName       { get; set; }
        public string?  MemberCode    { get; set; }
        public string?  MemCode       { get; set; }
        public string?  Member1Name   { get; set; }
        public string?  Member2Name   { get; set; }
        public string?  LeftBillType  { get; set; }
        public string?  RightBillType { get; set; }
        public string?  TransType     { get; set; }
        public string?  ReferenceNo   { get; set; }
        public string?  RefNo         { get; set; }
        public string?  Particulars   { get; set; }
        public string?  Particular1   { get; set; }
        public string?  Particular2   { get; set; }
        public string?  FlatNo        { get; set; }
        public string?  LeftType      { get; set; }
        public string?  RightType     { get; set; }
    }
}

