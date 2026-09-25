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
                           CashBankCode, CashBankName, ChqNo, ChqDate, BankName,
                           PersonName, PersonType, RefNo, Narration, Particular1, Particular2,
                           Status, CreatedAt
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
                        receiptId   = Convert.ToInt32(r["VoucherId"]),
                        voucherNo   = r["VoucherNo"].ToString() ?? "",
                        voucherDate = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        personName  = r["PersonName"].ToString() ?? "",
                        personType  = r["PersonType"].ToString() ?? "Vendor",
                        amount      = Convert.ToDecimal(r["Amount"]),
                        narration   = r["Narration"].ToString() ?? "",
                        particular1 = r["Particular1"]?.ToString() ?? "",
                        particular2 = r["Particular2"]?.ToString() ?? "",
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
                         CashBankCode, CashBankName, ChqNo, ChqDate, BankName,
                         PersonName, PersonType, RefNo, Narration, Particular1, Particular2,
                         Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                    VALUES
                        (@sid, @fyid, @vno, 'OtherReceipt', @vdate, @amt,
                         @cbCode, @cbName, @chqNo, @chqDate, @bank,
                         @person, @ptype, @ref, @narr, @p1, @p2,
                         'Posted', FALSE, @user, NOW(), NOW())
                    RETURNING VoucherId";

                vCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                vCmd.Parameters.AddWithValue("@fyid",   model.FYId);
                vCmd.Parameters.AddWithValue("@vno",    vNo);
                vCmd.Parameters.AddWithValue("@vdate",  model.ReceiptDate);
                vCmd.Parameters.AddWithValue("@amt",    model.Amount);
                vCmd.Parameters.AddWithValue("@cbCode", (object?)model.CashBankCode ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@cbName", (object?)model.CashBankName ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@chqNo",  (object?)model.ChqNo ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@chqDate",model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                vCmd.Parameters.AddWithValue("@bank",   (object?)model.BankName ?? DBNull.Value);
                vCmd.Parameters.AddWithValue("@person", (object?)model.PersonName ?? "General");
                vCmd.Parameters.AddWithValue("@ptype",  (object?)model.PersonType ?? "Vendor");
                vCmd.Parameters.AddWithValue("@ref",    (object?)model.ReferenceNo ?? "");
                var narration = !string.IsNullOrWhiteSpace(model.Narration) ? model.Narration : (!string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1 : "Other Receipt Entry");
                vCmd.Parameters.AddWithValue("@narr",   narration);
                vCmd.Parameters.AddWithValue("@p1",     (object?)model.Particular1 ?? narration);
                vCmd.Parameters.AddWithValue("@p2",     (object?)model.Particular2 ?? DBNull.Value);
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

                // 4. Resolve items and ensure balanced compound double-entry
                int srNo = 1;
                if (model.Items != null && model.Items.Count > 0)
                {
                    decimal sumDr = Math.Round(model.Items.Sum(d => d != null ? d.Debit : 0), 2);
                    decimal sumCr = Math.Round(model.Items.Sum(d => d != null ? (d.Credit > 0 ? d.Credit : (d.Amount > 0 ? d.Amount : 0)) : 0), 2);

                    // If credits exceed debits and deposit row not already present, inject deposit debit to balance
                    bool isAlreadyBalanced = Math.Abs(sumDr - sumCr) <= 0.01m;
                    if (!isAlreadyBalanced && (sumCr - sumDr) > 0.01m && cbAccId > 0)
                    {
                        decimal netBankDr = Math.Round(sumCr - sumDr, 2);
                        using var dCb = conn.CreateCommand();
                        dCb.Transaction = tx;
                        dCb.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, @sr, @aid, @code, @name, @amt, 0, @narr)";
                        dCb.Parameters.AddWithValue("@vid",   voucherId);
                        dCb.Parameters.AddWithValue("@sr",    srNo++);
                        dCb.Parameters.AddWithValue("@aid",   cbAccId);
                        dCb.Parameters.AddWithValue("@code",  cbAccCode);
                        dCb.Parameters.AddWithValue("@name",  cbAccName);
                        dCb.Parameters.AddWithValue("@amt",   netBankDr);
                        dCb.Parameters.AddWithValue("@narr",  narration);
                        dCb.ExecuteNonQuery();

                        sumDr += netBankDr;
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

                    // Insert detail line items (preserving both Debit e.g. TDS Receivable and Credit e.g. Income)
                    foreach (var d in model.Items)
                    {
                        if (d == null) continue;
                        int lineAccId = d.AccountId ?? 0;
                        string lineCode = d.AccountCode ?? "";
                        string lineName = d.AccountName ?? "Income";
                        decimal lineDr = d.Debit;
                        decimal lineCr = d.Credit > 0 ? d.Credit : (d.Debit == 0 && d.Amount > 0 ? d.Amount : 0);

                        if (lineDr == 0 && lineCr == 0) continue;

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

                    // Update header amount to sum of credits
                    using var updH = conn.CreateCommand();
                    updH.Transaction = tx;
                    updH.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET Amount = @amt WHERE VoucherId = @vid";
                    updH.Parameters.AddWithValue("@amt", sumCr);
                    updH.Parameters.AddWithValue("@vid", voucherId);
                    updH.ExecuteNonQuery();
                }
                else
                {
                    // Fallback single line item if no items provided
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
        public decimal  Amount      { get; set; }
        public string?  Narration   { get; set; }
    }
}
