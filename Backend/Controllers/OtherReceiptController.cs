// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — OtherReceiptController
// Handles Other Receipt Entries & PostgreSQL Persistence
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/other-receipts")]
    [AllowAnonymous]
    public class OtherReceiptController : ControllerBase
    {
        // ── GET /api/other-receipts?societyId=X&fyId=Y ──
        [HttpGet]
        public IActionResult GetReceipts([FromQuery] int societyId, [FromQuery] int fyId)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId and FYId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();

                cmd.CommandText = @"
                    SELECT VoucherId, SocietyId, FYId, VoucherNo, VoucherDate, Amount,
                           PersonName, PersonType, RefNo, Narration, Status, CreatedAt
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType = 'OtherReceipt' AND IsDeleted = FALSE
                    ORDER BY VoucherDate DESC, VoucherId DESC";

                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        receiptId  = Convert.ToInt32(r["VoucherId"]),
                        voucherNo  = r["VoucherNo"].ToString() ?? "",
                        voucherDate= ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        personName = r["PersonName"].ToString() ?? "",
                        personType = r["PersonType"].ToString() ?? "Vendor",
                        amount     = Convert.ToDecimal(r["Amount"]),
                        narration  = r["Narration"].ToString() ?? "",
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

        // ── POST /api/other-receipts ──
        [HttpPost]
        public IActionResult CreateReceipt([FromBody] OtherReceiptModel model)
        {
            if (model.SocietyId <= 0 || model.FYId <= 0 || model.Amount <= 0)
                return BadRequest(new { success = false, message = "SocietyId, FYId and Amount are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                // 1. Generate Voucher No if not supplied
                string vNo = model.VoucherNo ?? "";
                if (string.IsNullOrWhiteSpace(vNo))
                {
                    using var countCmd = conn.CreateCommand();
                    countCmd.Transaction = tx;
                    countCmd.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType = 'OtherReceipt'";
                    countCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                    countCmd.Parameters.AddWithValue("@fyid", model.FYId);

                    int count = Convert.ToInt32(countCmd.ExecuteScalar() ?? 0);
                    vNo = $"OR-{(count + 1):D4}";
                }

                // 2. Create Header
                using var vCmd = conn.CreateCommand();
                vCmd.Transaction = tx;
                vCmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocVoucherHeader
                        (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, Amount,
                         PersonName, PersonType, RefNo, Narration, Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                    VALUES
                        (@sid, @fyid, @vno, 'OtherReceipt', @vdate, @amt,
                         @person, @ptype, @ref, @narr, 'Posted', FALSE, @user, NOW(), NOW())
                    RETURNING VoucherId";

                vCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                vCmd.Parameters.AddWithValue("@fyid",   model.FYId);
                vCmd.Parameters.AddWithValue("@vno",    vNo);
                vCmd.Parameters.AddWithValue("@vdate",  model.ReceiptDate);
                vCmd.Parameters.AddWithValue("@amt",    model.Amount);
                vCmd.Parameters.AddWithValue("@person", (object?)model.PersonName ?? "General");
                vCmd.Parameters.AddWithValue("@ptype",  (object?)model.PersonType ?? "Vendor");
                vCmd.Parameters.AddWithValue("@ref",    (object?)model.ReferenceNo ?? "");
                var narration = !string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1 : (!string.IsNullOrWhiteSpace(model.Narration) ? model.Narration : "Other Receipt Entry");
                vCmd.Parameters.AddWithValue("@narr",   narration);
                vCmd.Parameters.AddWithValue("@user",   User.Identity?.Name ?? "ADMIN");

                var voucherId = Convert.ToInt32(vCmd.ExecuteScalar());

                // 3. Resolve Header Cash/Bank AccountId and Insert Detail (Debit for Receipt)
                int cbAccId = 0;
                string cbAccName = model.CashBankName ?? model.AccountType ?? "Bank A/c";
                string cbAccCode = model.CashBankCode ?? "";

                if (!string.IsNullOrWhiteSpace(cbAccName))
                {
                    using var findCb = conn.CreateCommand();
                    findCb.Transaction = tx;
                    findCb.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccName ILIKE @name OR AccCode = @name) AND IsDeleted = FALSE LIMIT 1";
                    findCb.Parameters.AddWithValue("@sid", model.SocietyId);
                    findCb.Parameters.AddWithValue("@name", cbAccName.Trim());
                    using var rCb = findCb.ExecuteReader();
                    if (rCb.Read())
                    {
                        cbAccId = Convert.ToInt32(rCb["AccountId"]);
                        cbAccCode = rCb["AccCode"]?.ToString() ?? "";
                        cbAccName = rCb["AccName"]?.ToString() ?? cbAccName;
                    }
                }

                if (cbAccId <= 0)
                {
                    using var fallbackCb = conn.CreateCommand();
                    fallbackCb.Transaction = tx;
                    fallbackCb.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND GrpMainId = 1 AND IsDeleted = FALSE ORDER BY AccountId LIMIT 1";
                    fallbackCb.Parameters.AddWithValue("@sid", model.SocietyId);
                    using var rFb = fallbackCb.ExecuteReader();
                    if (rFb.Read())
                    {
                        cbAccId = Convert.ToInt32(rFb["AccountId"]);
                        cbAccCode = rFb["AccCode"]?.ToString() ?? "ASS-1001";
                        cbAccName = rFb["AccName"]?.ToString() ?? "Cash in Hand";
                    }
                }

                if (cbAccId > 0)
                {
                    using var dCb = conn.CreateCommand();
                    dCb.Transaction = tx;
                    dCb.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 1, @aid, @code, @name, @amt, 0, @narr)";
                    dCb.Parameters.AddWithValue("@vid",   voucherId);
                    dCb.Parameters.AddWithValue("@aid",   cbAccId);
                    dCb.Parameters.AddWithValue("@code",  cbAccCode);
                    dCb.Parameters.AddWithValue("@name",  cbAccName);
                    dCb.Parameters.AddWithValue("@amt",   model.Amount);
                    dCb.Parameters.AddWithValue("@narr",  narration);
                    dCb.ExecuteNonQuery();
                }

                // 4. Insert Table Line Items (Credit for Receipt)
                int srNo = 2;
                if (model.Items != null && model.Items.Count > 0)
                {
                    foreach (var d in model.Items)
                    {
                        if (d == null) continue;
                        int lineAccId = d.AccountId ?? 0;
                        string lineCode = d.AccountCode ?? "";
                        string lineName = d.AccountName ?? "Income";
                        decimal lineCr = d.Credit > 0 ? d.Credit : (d.Debit > 0 ? d.Debit : 0);

                        if (lineAccId <= 0 && !string.IsNullOrWhiteSpace(lineName))
                        {
                            using var findLine = conn.CreateCommand();
                            findLine.Transaction = tx;
                            findLine.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccName ILIKE @name OR AccCode = @name) AND IsDeleted = FALSE LIMIT 1";
                            findLine.Parameters.AddWithValue("@sid", model.SocietyId);
                            findLine.Parameters.AddWithValue("@name", lineName.Trim());
                            using var rLine = findLine.ExecuteReader();
                            if (rLine.Read())
                            {
                                lineAccId = Convert.ToInt32(rLine["AccountId"]);
                                lineCode = rLine["AccCode"]?.ToString() ?? lineCode;
                                lineName = rLine["AccName"]?.ToString() ?? lineName;
                            }
                        }

                        using var dLine = conn.CreateCommand();
                        dLine.Transaction = tx;
                        dLine.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, @sr, @aid, @code, @name, 0, @cr, @narr)";
                        dLine.Parameters.AddWithValue("@vid",  voucherId);
                        dLine.Parameters.AddWithValue("@sr",   srNo++);
                        dLine.Parameters.AddWithValue("@aid",  lineAccId > 0 ? (object)lineAccId : DBNull.Value);
                        dLine.Parameters.AddWithValue("@code", lineCode);
                        dLine.Parameters.AddWithValue("@name", lineName);
                        dLine.Parameters.AddWithValue("@cr",   lineCr);
                        dLine.Parameters.AddWithValue("@narr", !string.IsNullOrWhiteSpace(d.Narration) ? d.Narration : narration);
                        dLine.ExecuteNonQuery();
                    }
                }
                else
                {
                    // Fallback single line item if no items provided
                    using var dLine = conn.CreateCommand();
                    dLine.Transaction = tx;
                    dLine.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 2, NULL, 'INC-GEN', 'Other Receipts', 0, @amt, @narr)";
                    dLine.Parameters.AddWithValue("@vid",  voucherId);
                    dLine.Parameters.AddWithValue("@amt",  model.Amount);
                    dLine.Parameters.AddWithValue("@narr", narration);
                    dLine.ExecuteNonQuery();
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = "Other Receipt recorded successfully.",
                    voucherNo = vNo,
                    voucherId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/other-receipts/{id} ──
        [HttpDelete("{id:int}")]
        public IActionResult DeleteReceipt(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherId = @id AND VoucherType = 'OtherReceipt'";
                cmd.Parameters.AddWithValue("@id", id);
                var rows = cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Other Receipt deleted successfully.", rowsAffected = rows });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class OtherReceiptModel
    {
        public int       SocietyId    { get; set; }
        public int       FYId         { get; set; }
        public string?   VoucherNo    { get; set; }
        public DateTime  ReceiptDate  { get; set; } = DateTime.Today;
        public decimal   Amount       { get; set; } = 0;
        public string?   PersonType   { get; set; }
        public string?   PersonName   { get; set; }
        public string?   PaidTo       { get; set; }
        public string?   AccountType  { get; set; }
        public string?   CashBankCode { get; set; }
        public string?   CashBankName { get; set; }
        public string?   TransType    { get; set; }
        public string?   ChqNo        { get; set; }
        public DateTime? ChqDate      { get; set; }
        public string?   ReferenceNo  { get; set; }
        public string?   BillNo       { get; set; }
        public string?   DrawnOn      { get; set; }
        public string?   BankName     { get; set; }
        public string?   Particular1  { get; set; }
        public string?   Particular2  { get; set; }
        public string?   Narration    { get; set; }
        public List<OtherReceiptDetailModel>? Items { get; set; }
    }

    public class OtherReceiptDetailModel
    {
        public int?     AccountId   { get; set; }
        public string?  AccountCode { get; set; }
        public string?  AccountName { get; set; }
        public decimal  Debit       { get; set; }
        public decimal  Credit      { get; set; }
        public string?  Narration   { get; set; }
    }
}
