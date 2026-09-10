// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — PaymentEntryController
// Handles Payment Voucher Entries & PostgreSQL Persistence
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/payment-entries")]
    [AllowAnonymous]
    public class PaymentEntryController : ControllerBase
    {
        // ── GET /api/payment-entries?societyId=X&fyId=Y ──
        [HttpGet]
        public IActionResult GetPayments([FromQuery] int societyId, [FromQuery] int fyId = 0)
        {
            if (societyId <= 0) societyId = 1;

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();

                cmd.CommandText = @"
                    SELECT VoucherId, SocietyId, FYId, VoucherNo, VoucherDate, Amount,
                           CashBankCode, CashBankName, ChqNo, ChqDate, BankName,
                           PersonName, PersonType, RefNo, Narration, Particular1, Particular2,
                           Status, CreatedAt
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid AND (@fyid = 0 OR FYId = @fyid) AND VoucherType = 'Payment' AND IsDeleted = FALSE
                    ORDER BY VoucherDate DESC, VoucherId DESC";

                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        voucherId    = Convert.ToInt32(r["VoucherId"]),
                        paymentId    = Convert.ToInt32(r["VoucherId"]),
                        voucherNo    = r["VoucherNo"].ToString() ?? "",
                        voucherDate  = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        cashBankCode = r["CashBankCode"]?.ToString() ?? "",
                        cashBankName = r["CashBankName"]?.ToString() ?? "",
                        personName   = r["PersonName"].ToString() ?? "",
                        paidTo       = r["PersonName"].ToString() ?? "",
                        personType   = r["PersonType"].ToString() ?? "Vendor",
                        amount       = Convert.ToDecimal(r["Amount"]),
                        chqNo        = r["ChqNo"]?.ToString() ?? "",
                        refNo        = r["RefNo"]?.ToString() ?? "",
                        narration    = r["Narration"].ToString() ?? "",
                        particular1  = r["Particular1"]?.ToString() ?? r["Narration"].ToString() ?? "",
                        particular2  = r["Particular2"]?.ToString() ?? "",
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

        // ── POST /api/payment-entries ──
        [HttpPost]
        public IActionResult CreatePayment([FromBody] PaymentEntryModel model)
        {
            if (model.SocietyId <= 0) model.SocietyId = 1;
            if (model.FYId <= 0) model.FYId = 1;
            if (model.Amount <= 0)
                return BadRequest(new { success = false, message = "Payment amount must be greater than 0." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                // 1. Scan all existing numbers in header to prevent duplicate key constraint
                using var checkCmd = conn.CreateCommand();
                checkCmd.Transaction = tx;
                checkCmd.CommandText = "SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid";
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

                string vNo = model.VoucherNo?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(vNo) || existingNos.Contains(vNo))
                {
                    string prefix = (model.VoucherType ?? "").ToLower().Contains("cash") ? "CASH/2026-27/" : "PV/2026-27/";
                    int seq = 1;
                    do
                    {
                        vNo = $"{prefix}{seq++:D2}";
                    } while (existingNos.Contains(vNo));
                }

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
                         CashBankCode, CashBankName, ChqNo, ChqDate, BankName,
                         PersonName, PersonType, RefNo, Narration, Particular1, Particular2,
                         Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                    VALUES
                        (@sid, @fyid, @vno, 'Payment', @vdate, @amt,
                         @cbCode, @cbName, @chqNo, @chqDate, @bank,
                         @person, @ptype, @ref, @narr, @p1, @p2,
                         'Posted', FALSE, @user, NOW(), NOW())
                    RETURNING VoucherId";

                var pName = (object?)model.PersonName ?? (object?)model.PaidTo ?? "General Vendor";
                var pType = (object?)model.PersonType ?? "Vendor";
                var refStr = (object?)model.ReferenceNo ?? (object?)model.BillNo ?? (object?)model.RefNo ?? "";
                var narration = !string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1 : (!string.IsNullOrWhiteSpace(model.Narration) ? model.Narration : (!string.IsNullOrWhiteSpace(model.Particulars) ? model.Particulars : "Payment Voucher"));
                var p1 = !string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1 : narration;
                var p2 = !string.IsNullOrWhiteSpace(model.Particular2) ? model.Particular2 : "";

                vCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                vCmd.Parameters.AddWithValue("@fyid",   model.FYId);
                vCmd.Parameters.AddWithValue("@vno",    vNo);
                vCmd.Parameters.AddWithValue("@vdate",  model.PaymentDate != default ? model.PaymentDate : (model.VoucherDate != default ? model.VoucherDate : DateTime.Today));
                vCmd.Parameters.AddWithValue("@amt",    model.Amount);
                vCmd.Parameters.AddWithValue("@cbCode", (object?)model.CashBankCode ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@cbName", (object?)model.CashBankName ?? (object?)model.CashBank ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@chqNo",  (object?)model.ChqNo ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@chqDate",model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                vCmd.Parameters.AddWithValue("@bank",   (object?)model.BankName ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@person", pName);
                vCmd.Parameters.AddWithValue("@ptype",  pType);
                vCmd.Parameters.AddWithValue("@ref",    refStr);
                vCmd.Parameters.AddWithValue("@narr",   narration);
                vCmd.Parameters.AddWithValue("@p1",     p1);
                vCmd.Parameters.AddWithValue("@p2",     p2);
                vCmd.Parameters.AddWithValue("@user",   User.Identity?.Name ?? "ADMIN");

                var voucherId = Convert.ToInt32(vCmd.ExecuteScalar());

                // 3. Resolve Header Cash/Bank AccountId and Insert Detail
                int cbAccId = model.CashBankAccountId ?? 0;
                string cbAccName = model.CashBankName ?? model.CashBank ?? model.AccountName ?? "Bank A/c";
                string cbAccCode = model.CashBankCode ?? "";

                if (cbAccId <= 0 && !string.IsNullOrWhiteSpace(cbAccName))
                {
                    using var findCb = conn.CreateCommand();
                    findCb.Transaction = tx;
                    findCb.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccName ILIKE @name OR AccCode = @name) AND IsDeleted = FALSE LIMIT 1";
                    findCb.Parameters.AddWithValue("@sid", model.SocietyId);
                    findCb.Parameters.AddWithValue("@name", cbAccName.Trim());
                    using (var rCb = findCb.ExecuteReader())
                    {
                        if (rCb.Read())
                        {
                            cbAccId = Convert.ToInt32(rCb["AccountId"]);
                            cbAccCode = rCb["AccCode"]?.ToString() ?? "";
                            cbAccName = rCb["AccName"]?.ToString() ?? cbAccName;
                        }
                    }
                }

                if (cbAccId <= 0)
                {
                    using var fallbackCb = conn.CreateCommand();
                    fallbackCb.Transaction = tx;
                    fallbackCb.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND GrpMainId = 1 AND IsDeleted = FALSE ORDER BY AccountId LIMIT 1";
                    fallbackCb.Parameters.AddWithValue("@sid", model.SocietyId);
                    using (var rFb = fallbackCb.ExecuteReader())
                    {
                        if (rFb.Read())
                        {
                            cbAccId = Convert.ToInt32(rFb["AccountId"]);
                            cbAccCode = rFb["AccCode"]?.ToString() ?? "ASS-1001";
                            cbAccName = rFb["AccName"]?.ToString() ?? "Cash in Hand";
                        }
                    }
                }

                // 4. Resolve details and ensure balanced compound double-entry
                var details = model.Details ?? model.Items;
                int srNo = 1;

                if (details != null && details.Count > 0)
                {
                    decimal sumDr = Math.Round(details.Sum(d => d != null ? (d.Debit > 0 ? d.Debit : (d.Amount > 0 ? d.Amount : 0)) : 0), 2);
                    decimal sumCr = Math.Round(details.Sum(d => d != null ? d.Credit : 0), 2);

                    // Check if bank/cash withdrawal account is already included in items
                    bool hasBankCredit = details.Any(d => d != null && d.Credit > 0 && 
                        ((cbAccId > 0 && d.AccountId == cbAccId) || 
                         (!string.IsNullOrWhiteSpace(cbAccCode) && string.Equals(d.AccountCode, cbAccCode, StringComparison.OrdinalIgnoreCase)) ||
                         (!string.IsNullOrWhiteSpace(cbAccName) && string.Equals(d.AccountName, cbAccName, StringComparison.OrdinalIgnoreCase))));

                    // If bank row not already in details, compute net payable = total debits - other credits (e.g. TDS)
                    if (!hasBankCredit && cbAccId > 0)
                    {
                        decimal netBankCr = Math.Round(sumDr - sumCr, 2);
                        if (netBankCr > 0)
                        {
                            using var dCb = conn.CreateCommand();
                            dCb.Transaction = tx;
                            dCb.CommandText = @"
                                INSERT INTO jeevika_erp.SocVoucherDetail
                                    (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                                VALUES
                                    (@vid, @sr, @aid, @code, @name, 0, @amt, @narr)";
                            dCb.Parameters.AddWithValue("@vid",   voucherId);
                            dCb.Parameters.AddWithValue("@sr",    srNo++);
                            dCb.Parameters.AddWithValue("@aid",   cbAccId);
                            dCb.Parameters.AddWithValue("@code",  cbAccCode);
                            dCb.Parameters.AddWithValue("@name",  cbAccName);
                            dCb.Parameters.AddWithValue("@amt",   netBankCr);
                            dCb.Parameters.AddWithValue("@narr",  narration);
                            dCb.ExecuteNonQuery();

                            sumCr += netBankCr;
                        }
                    }

                    // Strict balance validation
                    if (Math.Abs(sumDr - sumCr) > 0.01m)
                    {
                        tx.Rollback();
                        return BadRequest(new 
                        { 
                            success = false, 
                            message = $"Double-entry validation failed: Total Debit (₹{sumDr:N2}) does not match Total Credit (₹{sumCr:N2}). Difference: ₹{Math.Abs(sumDr - sumCr):N2}." 
                        });
                    }

                    // Insert detail line items
                    foreach (var d in details)
                    {
                        if (d == null) continue;
                        int lineAccId = d.AccountId ?? 0;
                        string lineCode = d.AccountCode ?? "";
                        string lineName = d.AccountName ?? "Expense";
                        decimal lineDr = d.Debit > 0 ? d.Debit : (d.Amount > 0 ? d.Amount : 0);
                        decimal lineCr = d.Credit;

                        if (lineDr == 0 && lineCr == 0) continue;

                        if (lineAccId <= 0 && !string.IsNullOrWhiteSpace(lineName))
                        {
                            using var findLine = conn.CreateCommand();
                            findLine.Transaction = tx;
                            findLine.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccName ILIKE @name OR AccCode = @name) AND IsDeleted = FALSE LIMIT 1";
                            findLine.Parameters.AddWithValue("@sid", model.SocietyId);
                            findLine.Parameters.AddWithValue("@name", lineName.Trim());
                            using (var rLine = findLine.ExecuteReader())
                            {
                                if (rLine.Read())
                                {
                                    lineAccId = Convert.ToInt32(rLine["AccountId"]);
                                    lineCode = rLine["AccCode"]?.ToString() ?? lineCode;
                                    lineName = rLine["AccName"]?.ToString() ?? lineName;
                                }
                            }
                        }

                        using var dLine = conn.CreateCommand();
                        dLine.Transaction = tx;
                        dLine.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, @sr, @aid, @code, @name, @dr, @cr, @narr)";
                        dLine.Parameters.AddWithValue("@vid",  voucherId);
                        dLine.Parameters.AddWithValue("@sr",   srNo++);
                        dLine.Parameters.AddWithValue("@aid",  lineAccId > 0 ? (object)lineAccId : DBNull.Value);
                        dLine.Parameters.AddWithValue("@code", lineCode);
                        dLine.Parameters.AddWithValue("@name", lineName);
                        dLine.Parameters.AddWithValue("@dr",   lineDr);
                        dLine.Parameters.AddWithValue("@cr",   lineCr);
                        dLine.Parameters.AddWithValue("@narr", !string.IsNullOrWhiteSpace(d.Narration) ? d.Narration : narration);
                        dLine.ExecuteNonQuery();
                    }

                    // Update header amount to sum of debits
                    using var updH = conn.CreateCommand();
                    updH.Transaction = tx;
                    updH.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET Amount = @amt WHERE VoucherId = @vid";
                    updH.Parameters.AddWithValue("@amt", sumDr);
                    updH.Parameters.AddWithValue("@vid", voucherId);
                    updH.ExecuteNonQuery();
                }
                else
                {
                    // Fallback single line item if no details array provided
                    if (cbAccId > 0)
                    {
                        using var dCb = conn.CreateCommand();
                        dCb.Transaction = tx;
                        dCb.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, 1, @aid, @code, @name, 0, @amt, @narr)";
                        dCb.Parameters.AddWithValue("@vid",   voucherId);
                        dCb.Parameters.AddWithValue("@aid",   cbAccId);
                        dCb.Parameters.AddWithValue("@code",  cbAccCode);
                        dCb.Parameters.AddWithValue("@name",  cbAccName);
                        dCb.Parameters.AddWithValue("@amt",   model.Amount);
                        dCb.Parameters.AddWithValue("@narr",  narration);
                        dCb.ExecuteNonQuery();
                    }

                    int lineAccId = 0;
                    string lineName = !string.IsNullOrWhiteSpace(model.AccountName) ? model.AccountName : "General Expense";
                    string lineCode = "";

                    using (var findLine = conn.CreateCommand())
                    {
                        findLine.Transaction = tx;
                        findLine.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccName ILIKE @name OR AccCode = @name) AND IsDeleted = FALSE LIMIT 1";
                        findLine.Parameters.AddWithValue("@sid", model.SocietyId);
                        findLine.Parameters.AddWithValue("@name", lineName.Trim());
                        using (var rLine = findLine.ExecuteReader())
                        {
                            if (rLine.Read())
                            {
                                lineAccId = Convert.ToInt32(rLine["AccountId"]);
                                lineCode = rLine["AccCode"]?.ToString() ?? "";
                                lineName = rLine["AccName"]?.ToString() ?? lineName;
                            }
                        }
                    }

                    using var dLine = conn.CreateCommand();
                    dLine.Transaction = tx;
                    dLine.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 2, @aid, @code, @name, @amt, 0, @narr)";
                    dLine.Parameters.AddWithValue("@vid",  voucherId);
                    dLine.Parameters.AddWithValue("@aid",  lineAccId > 0 ? (object)lineAccId : DBNull.Value);
                    dLine.Parameters.AddWithValue("@code", lineCode);
                    dLine.Parameters.AddWithValue("@name", lineName);
                    dLine.Parameters.AddWithValue("@amt",  model.Amount);
                    dLine.Parameters.AddWithValue("@narr", narration);
                    dLine.ExecuteNonQuery();
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = "Payment Entry recorded successfully.",
                    voucherNo = vNo,
                    voucherId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/payment-entries/{id} ──
        [HttpPut("{id}")]
        public IActionResult UpdatePayment(string id, [FromBody] PaymentEntryModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                var pName = (object?)model.PersonName ?? (object?)model.PaidTo ?? "General Vendor";
                var narration = !string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1 : (!string.IsNullOrWhiteSpace(model.Narration) ? model.Narration : "Payment Voucher");

                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;

                if (int.TryParse(id, out int numId))
                {
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET Amount = @amt, PersonName = @person, Narration = @narr, Particular1 = @p1, Particular2 = @p2,
                            VoucherDate = @vdate, UpdatedAt = NOW()
                        WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@numId", numId);
                    cmd.Parameters.AddWithValue("@id",    id);
                }
                else
                {
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET Amount = @amt, PersonName = @person, Narration = @narr, Particular1 = @p1, Particular2 = @p2,
                            VoucherDate = @vdate, UpdatedAt = NOW()
                        WHERE VoucherNo = @id AND IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@id", id);
                }

                cmd.Parameters.AddWithValue("@amt",   model.Amount);
                cmd.Parameters.AddWithValue("@person",pName);
                cmd.Parameters.AddWithValue("@narr",  narration);
                cmd.Parameters.AddWithValue("@p1",    model.Particular1 ?? narration);
                cmd.Parameters.AddWithValue("@p2",    model.Particular2 ?? "");
                cmd.Parameters.AddWithValue("@vdate", model.PaymentDate != default ? model.PaymentDate : (model.VoucherDate != default ? model.VoucherDate : DateTime.Today));

                cmd.ExecuteNonQuery();
                tx.Commit();

                return Ok(new { success = true, message = "Payment Entry updated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/payment-entries/{*id} ──
        [HttpDelete("{*id}")]
        public IActionResult DeletePayment(string id, [FromQuery] string? voucherNo = null)
        {
            var target = !string.IsNullOrWhiteSpace(voucherNo) ? voucherNo : id;
            if (string.IsNullOrWhiteSpace(target))
                return BadRequest(new { success = false, message = "Invalid payment ID." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();

                if (int.TryParse(target, out int numId))
                {
                    cmd.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@numId", numId);
                    cmd.Parameters.AddWithValue("@id",    target);
                }
                else
                {
                    cmd.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherNo = @id AND IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@id", target);
                }

                var rows = cmd.ExecuteNonQuery();
                return Ok(new { success = true, message = "Payment Entry deleted successfully.", rowsAffected = rows });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/payment-entries/batch-delete ──
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

                return Ok(new { success = true, message = $"{rows} payment(s) deleted successfully.", deletedCount = rows });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class PaymentVoucherLineDto
    {
        public int?     AccountId   { get; set; }
        public string?  AccountCode { get; set; }
        public string?  AccountName { get; set; }
        public decimal  Debit       { get; set; } = 0;
        public decimal  Credit      { get; set; } = 0;
        public decimal  Amount      { get; set; } = 0;
        public string?  Narration   { get; set; }
    }

    public class PaymentEntryModel
    {
        public int       SocietyId          { get; set; }
        public int       FYId               { get; set; }
        public int       VoucherId          { get; set; } = 0;
        public string?   VoucherNo          { get; set; }
        public DateTime  PaymentDate        { get; set; } = DateTime.Today;
        public DateTime  VoucherDate        { get; set; } = DateTime.Today;
        public decimal   Amount             { get; set; } = 0;
        public string?   VoucherType        { get; set; }
        public string?   PersonType         { get; set; }
        public string?   PersonName         { get; set; }
        public string?   PaidTo             { get; set; }
        public int?      CashBankAccountId  { get; set; }
        public string?   CashBankCode       { get; set; }
        public string?   CashBankName       { get; set; }
        public string?   CashBank           { get; set; }
        public string?   AccountName        { get; set; }
        public string?   TransType          { get; set; }
        public string?   ReferenceNo        { get; set; }
        public string?   RefNo              { get; set; }
        public string?   ChqNo              { get; set; }
        public DateTime? ChqDate            { get; set; }
        public string?   BankName           { get; set; }
        public string?   BillNo             { get; set; }
        public string?   Particulars        { get; set; }
        public string?   Particular1        { get; set; }
        public string?   Particular2        { get; set; }
        public string?   Narration          { get; set; }
        public List<PaymentVoucherLineDto>? Details { get; set; }
        public List<PaymentVoucherLineDto>? Items   { get; set; }
    }
}

