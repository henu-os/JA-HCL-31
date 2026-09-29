// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — ContraEntryController
// Handles Contra Voucher Entries & PostgreSQL Persistence
// ═══════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/contra-entries")]
    [AllowAnonymous]
    public class ContraEntryController : ControllerBase
    {
        // ── GET /api/contra-entries?societyId=X&fyId=Y ──
        [HttpGet]
        public IActionResult GetContras([FromQuery] int societyId, [FromQuery] int fyId)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId and FYId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();

                cmd.CommandText = @"
                    SELECT VoucherId, SocietyId, FYId, VoucherNo, VoucherDate, Amount,
                           PersonName, PersonType, RefNo, Narration, Particular1, Particular2,
                           ChqNo, ChqDate, Status, CreatedAt
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType = 'Contra' AND IsDeleted = FALSE
                    ORDER BY VoucherDate DESC, VoucherId DESC";

                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        contraId   = Convert.ToInt32(r["VoucherId"]),
                        voucherNo  = r["VoucherNo"].ToString() ?? "",
                        voucherDate= ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        personName = r["PersonName"].ToString() ?? "Bank Transfer",
                        amount     = Convert.ToDecimal(r["Amount"]),
                        narration  = r["Narration"].ToString() ?? "",
                        particular1= r["Particular1"]?.ToString() ?? "",
                        particular2= r["Particular2"]?.ToString() ?? "",
                        refNo      = r["RefNo"]?.ToString() ?? "",
                        chqNo      = r["ChqNo"]?.ToString() ?? "",
                        chqDate    = r["ChqDate"] == DBNull.Value ? null : ((DateTime)r["ChqDate"]).ToString("yyyy-MM-dd"),
                        status     = r["Status"].ToString() ?? "Posted"
                    });
                }

                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/contra-entries ──
        [HttpPost]
        public IActionResult CreateContra([FromBody] ContraEntryModel model)
        {
            if (model.SocietyId <= 0 || model.FYId <= 0 || model.Amount <= 0)
                return BadRequest(new { success = false, message = "SocietyId, FYId and Amount are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                // 1. Generate Voucher No
                using var countCmd = conn.CreateCommand();
                countCmd.Transaction = tx;
                countCmd.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType = 'Contra'";
                countCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                countCmd.Parameters.AddWithValue("@fyid", model.FYId);

                int count = Convert.ToInt32(countCmd.ExecuteScalar() ?? 0);
                string vNo = $"CE-{(count + 1):D4}";

                // 2. Create Header
                var p1 = !string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1 : (!string.IsNullOrWhiteSpace(model.Particulars) ? model.Particulars : (!string.IsNullOrWhiteSpace(model.Narration) ? model.Narration : "Contra Voucher"));
                var p2 = model.Particular2 ?? "";
                var narration = !string.IsNullOrWhiteSpace(p1) ? p1 : "Contra Voucher Entry";

                using var vCmd = conn.CreateCommand();
                vCmd.Transaction = tx;
                vCmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocVoucherHeader
                        (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, Amount,
                         PersonName, PersonType, RefNo, Narration, Particular1, Particular2,
                         ChqNo, ChqDate, Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                    VALUES
                        (@sid, @fyid, @vno, 'Contra', @vdate, @amt,
                         @person, 'Bank/Cash', @ref, @narr, @p1, @p2,
                         @chqNo, @chqDate, 'Posted', FALSE, @user, NOW(), NOW())
                    RETURNING VoucherId";

                vCmd.Parameters.AddWithValue("@sid",     model.SocietyId);
                vCmd.Parameters.AddWithValue("@fyid",    model.FYId);
                vCmd.Parameters.AddWithValue("@vno",     vNo);
                vCmd.Parameters.AddWithValue("@vdate",   model.ContraDate);
                vCmd.Parameters.AddWithValue("@amt",     model.Amount);
                vCmd.Parameters.AddWithValue("@person",  (object?)model.PersonName ?? "Bank/Cash Transfer");
                vCmd.Parameters.AddWithValue("@ref",     (object?)model.ReferenceNo ?? "");
                vCmd.Parameters.AddWithValue("@narr",    narration);
                vCmd.Parameters.AddWithValue("@p1",      (object?)p1 ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@p2",      (object?)p2 ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@chqNo",   (object?)model.ChqNo ?? "");
                vCmd.Parameters.AddWithValue("@chqDate", (object?)model.ChqDate ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@user",    User.Identity?.Name ?? "ADMIN");

                var voucherId = Convert.ToInt32(vCmd.ExecuteScalar());

                // 3. Resolve From Account (Credit) and To Account (Debit)
                int fromAccId = model.FromAccountId ?? 0;
                string fromName = model.FromAccount ?? model.WithdrawFrom ?? "Cash in Hand";
                string fromCode = "";

                if (fromAccId <= 0 && !string.IsNullOrWhiteSpace(fromName))
                {
                    using var findFrom = conn.CreateCommand();
                    findFrom.Transaction = tx;
                    findFrom.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccName ILIKE @name OR AccCode = @name) AND IsDeleted = FALSE LIMIT 1";
                    findFrom.Parameters.AddWithValue("@sid", model.SocietyId);
                    findFrom.Parameters.AddWithValue("@name", fromName.Trim());
                    using var rF = findFrom.ExecuteReader();
                    if (rF.Read())
                    {
                        fromAccId = Convert.ToInt32(rF["AccountId"]);
                        fromCode = rF["AccCode"]?.ToString() ?? "";
                        fromName = rF["AccName"]?.ToString() ?? fromName;
                    }
                }

                int toAccId = model.ToAccountId ?? 0;
                string toName = model.ToAccount ?? model.DepositTo ?? "Bank A/c";
                string toCode = "";

                if (toAccId <= 0 && !string.IsNullOrWhiteSpace(toName))
                {
                    using var findTo = conn.CreateCommand();
                    findTo.Transaction = tx;
                    findTo.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccName ILIKE @name OR AccCode = @name) AND IsDeleted = FALSE LIMIT 1";
                    findTo.Parameters.AddWithValue("@sid", model.SocietyId);
                    findTo.Parameters.AddWithValue("@name", toName.Trim());
                    using var rT = findTo.ExecuteReader();
                    if (rT.Read())
                    {
                        toAccId = Convert.ToInt32(rT["AccountId"]);
                        toCode = rT["AccCode"]?.ToString() ?? "";
                        toName = rT["AccName"]?.ToString() ?? toName;
                    }
                }

                // Insert Credit row (From Account)
                if (fromAccId > 0)
                {
                    using var dFrom = conn.CreateCommand();
                    dFrom.Transaction = tx;
                    dFrom.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 1, @aid, @code, @name, 0, @amt, @narr)";
                    dFrom.Parameters.AddWithValue("@vid",  voucherId);
                    dFrom.Parameters.AddWithValue("@aid",  fromAccId);
                    dFrom.Parameters.AddWithValue("@code", fromCode);
                    dFrom.Parameters.AddWithValue("@name", fromName);
                    dFrom.Parameters.AddWithValue("@amt",  model.Amount);
                    dFrom.Parameters.AddWithValue("@narr", (object?)model.Particulars ?? "Contra Outflow");
                    dFrom.ExecuteNonQuery();
                }

                // Insert Debit row (To Account)
                if (toAccId > 0)
                {
                    using var dTo = conn.CreateCommand();
                    dTo.Transaction = tx;
                    dTo.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 2, @aid, @code, @name, @amt, 0, @narr)";
                    dTo.Parameters.AddWithValue("@vid",  voucherId);
                    dTo.Parameters.AddWithValue("@aid",  toAccId);
                    dTo.Parameters.AddWithValue("@code", toCode);
                    dTo.Parameters.AddWithValue("@name", toName);
                    dTo.Parameters.AddWithValue("@amt",  model.Amount);
                    dTo.Parameters.AddWithValue("@narr", (object?)model.Particulars ?? "Contra Inflow");
                    dTo.ExecuteNonQuery();
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = "Contra Voucher recorded successfully.",
                    voucherNo = vNo,
                    voucherId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/contra-entries/{id} or /api/contra/{id} ──
        [HttpDelete("{id:int}")]
        public IActionResult DeleteContra(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherId = @id AND VoucherType = 'Contra'";
                cmd.Parameters.AddWithValue("@id", id);
                var rows = cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Contra Voucher deleted successfully.", rowsAffected = rows });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class ContraEntryModel
    {
        public int       SocietyId     { get; set; }
        public int       FYId          { get; set; }
        public string?   VoucherNo     { get; set; }
        public DateTime  ContraDate    { get; set; } = DateTime.Today;
        public decimal   Amount        { get; set; } = 0;
        public string?   VoucherType   { get; set; }
        public int?      FromAccountId { get; set; }
        public string?   FromAccount   { get; set; }
        public string?   WithdrawFrom  { get; set; }
        public int?      ToAccountId   { get; set; }
        public string?   ToAccount     { get; set; }
        public string?   DepositTo     { get; set; }
        public string?   PersonName    { get; set; }
        public string?   TransType     { get; set; }
        public string?   ReferenceNo   { get; set; }
        public string?   ChqNo         { get; set; }
        public DateTime? ChqDate       { get; set; }
        public string?   Particulars   { get; set; }
        public string?   Particular1   { get; set; }
        public string?   Particular2   { get; set; }
        public string?   Narration     { get; set; }
    }
}
