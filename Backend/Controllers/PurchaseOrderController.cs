// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — PurchaseOrderController
// Handles Purchase Order Entries & PostgreSQL Persistence
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/purchase-orders")]
    [AllowAnonymous]
    public class PurchaseOrderController : ControllerBase
    {
        // ── GET /api/purchase-orders?societyId=X&fyId=Y ──
        [HttpGet]
        public IActionResult GetPurchaseOrders([FromQuery] int societyId, [FromQuery] int fyId)
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
                    WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType = 'PurchaseOrder' AND IsDeleted = FALSE
                    ORDER BY VoucherDate DESC, VoucherId DESC";

                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        poId       = Convert.ToInt32(r["VoucherId"]),
                        poNo       = r["VoucherNo"].ToString() ?? "",
                        poDate     = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        vendorName = r["PersonName"].ToString() ?? "",
                        personName = r["PersonName"].ToString() ?? "",
                        amount     = Convert.ToDecimal(r["Amount"]),
                        invNo      = r["RefNo"].ToString() ?? "",
                        narration  = r["Narration"].ToString() ?? "",
                        status     = r["Status"].ToString() ?? "BOOKED"
                    });
                }

                return Ok(list);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/purchase-orders ──
        [HttpPost]
        public IActionResult CreatePurchaseOrder([FromBody] PurchaseOrderModel model)
        {
            if (model.SocietyId <= 0 || model.FYId <= 0 || model.Amount <= 0)
                return BadRequest(new { success = false, message = "SocietyId, FYId and Amount are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                // 1. Generate PO Number
                using var countCmd = conn.CreateCommand();
                countCmd.Transaction = tx;
                countCmd.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType = 'PurchaseOrder'";
                countCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                countCmd.Parameters.AddWithValue("@fyid", model.FYId);

                int count = Convert.ToInt32(countCmd.ExecuteScalar() ?? 0);
                string poNo = $"PO-{(count + 1):D4}";

                // 2. Create Voucher Header
                using var vCmd = conn.CreateCommand();
                vCmd.Transaction = tx;
                vCmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocVoucherHeader
                        (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, Amount,
                         PersonName, PersonType, RefNo, Narration, Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                    VALUES
                        (@sid, @fyid, @vno, 'PurchaseOrder', @vdate, @amt,
                         @person, 'Vendor', @refNo, @narr, 'BOOKED', FALSE, @user, NOW(), NOW())
                    RETURNING VoucherId";

                vCmd.Parameters.AddWithValue("@sid",    model.SocietyId);
                vCmd.Parameters.AddWithValue("@fyid",   model.FYId);
                vCmd.Parameters.AddWithValue("@vno",    poNo);
                vCmd.Parameters.AddWithValue("@vdate",  model.PoDate);
                vCmd.Parameters.AddWithValue("@amt",    model.Amount);
                vCmd.Parameters.AddWithValue("@person", (object?)model.VendorName ?? (object?)model.PersonName ?? "Vendor");
                vCmd.Parameters.AddWithValue("@refNo",  (object?)model.InvNo     ?? "");
                vCmd.Parameters.AddWithValue("@narr",   (object?)model.Narration ?? "Purchase Order");
                vCmd.Parameters.AddWithValue("@user",   User.Identity?.Name      ?? "ADMIN");

                var poId = Convert.ToInt32(vCmd.ExecuteScalar());

                // 3. Resolve Vendor Account (Credit)
                int vendorAccId = 0;
                string vName = model.VendorName ?? model.PersonName ?? "Vendor";
                string vCode = "";

                using var findVendor = conn.CreateCommand();
                findVendor.Transaction = tx;
                findVendor.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccName ILIKE @name OR AccCode = @name) AND IsDeleted = FALSE LIMIT 1";
                findVendor.Parameters.AddWithValue("@sid", model.SocietyId);
                findVendor.Parameters.AddWithValue("@name", vName.Trim());
                using (var rV = findVendor.ExecuteReader())
                {
                    if (rV.Read())
                    {
                        vendorAccId = Convert.ToInt32(rV["AccountId"]);
                        vCode = rV["AccCode"]?.ToString() ?? "";
                        vName = rV["AccName"]?.ToString() ?? vName;
                    }
                }

                // 4. Resolve details and ensure balanced compound double-entry
                var details = model.Details ?? model.Items;
                int srNo = 1;

                if (details != null && details.Count > 0)
                {
                    decimal sumDr = Math.Round(details.Sum(d => d != null ? (d.Debit > 0 ? d.Debit : (d.Amount > 0 ? d.Amount : 0)) : 0), 2);
                    decimal sumCr = Math.Round(details.Sum(d => d != null ? d.Credit : 0), 2);

                    // If debits exceed credits and vendor payable row not already present, inject vendor payable to balance
                    bool isAlreadyBalanced = Math.Abs(sumDr - sumCr) <= 0.01m;
                    if (!isAlreadyBalanced && (sumDr - sumCr) > 0.01m)
                    {
                        decimal netVendorCr = Math.Round(sumDr - sumCr, 2);
                        using var dVendor = conn.CreateCommand();
                        dVendor.Transaction = tx;
                        dVendor.CommandText = @"
                            INSERT INTO jeevika_erp.SocVoucherDetail
                                (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                            VALUES
                                (@vid, @sr, @aid, @code, @name, 0, @amt, @narr)";
                        dVendor.Parameters.AddWithValue("@vid",  poId);
                        dVendor.Parameters.AddWithValue("@sr",   srNo++);
                        dVendor.Parameters.AddWithValue("@aid",  vendorAccId > 0 ? (object)vendorAccId : DBNull.Value);
                        dVendor.Parameters.AddWithValue("@code", vCode);
                        dVendor.Parameters.AddWithValue("@name", vName);
                        dVendor.Parameters.AddWithValue("@amt",  netVendorCr);
                        dVendor.Parameters.AddWithValue("@narr", (object?)model.Narration ?? "PO Booking - Vendor Payable");
                        dVendor.ExecuteNonQuery();

                        sumCr += netVendorCr;
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

                    // Insert detail line items (preserving Expense Dr, TDS Cr, etc.)
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
                        dLine.Parameters.AddWithValue("@vid",  poId);
                        dLine.Parameters.AddWithValue("@sr",   srNo++);
                        dLine.Parameters.AddWithValue("@aid",  lineAccId > 0 ? (object)lineAccId : DBNull.Value);
                        dLine.Parameters.AddWithValue("@code", lineCode);
                        dLine.Parameters.AddWithValue("@name", lineName);
                        dLine.Parameters.AddWithValue("@dr",   lineDr);
                        dLine.Parameters.AddWithValue("@cr",   lineCr);
                        dLine.Parameters.AddWithValue("@narr", !string.IsNullOrWhiteSpace(d.Narration) ? d.Narration : (object?)model.Narration ?? "PO Booking");
                        dLine.ExecuteNonQuery();
                    }

                    // Update header amount to sum of debits
                    using var updH = conn.CreateCommand();
                    updH.Transaction = tx;
                    updH.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET Amount = @amt WHERE VoucherId = @vid";
                    updH.Parameters.AddWithValue("@amt", sumDr);
                    updH.Parameters.AddWithValue("@vid", poId);
                    updH.ExecuteNonQuery();
                }
                else
                {
                    // Fallback single line item if no details array provided
                    using var dVendor = conn.CreateCommand();
                    dVendor.Transaction = tx;
                    dVendor.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 1, @aid, @code, @name, 0, @amt, @narr)";
                    dVendor.Parameters.AddWithValue("@vid",  poId);
                    dVendor.Parameters.AddWithValue("@aid",  vendorAccId > 0 ? (object)vendorAccId : DBNull.Value);
                    dVendor.Parameters.AddWithValue("@code", vCode);
                    dVendor.Parameters.AddWithValue("@name", vName);
                    dVendor.Parameters.AddWithValue("@amt",  model.Amount);
                    dVendor.Parameters.AddWithValue("@narr", (object?)model.Narration ?? "PO Booking - Vendor Payable");
                    dVendor.ExecuteNonQuery();

                    int expAccId = model.AccountId ?? 0;
                    string expName = model.AccountName ?? "General Expense";
                    string expCode = "";

                    if (expAccId <= 0 && !string.IsNullOrWhiteSpace(expName))
                    {
                        using var findExp = conn.CreateCommand();
                        findExp.Transaction = tx;
                        findExp.CommandText = "SELECT AccountId, AccCode, AccName FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND (AccName ILIKE @name OR AccCode = @name) AND IsDeleted = FALSE LIMIT 1";
                        findExp.Parameters.AddWithValue("@sid", model.SocietyId);
                        findExp.Parameters.AddWithValue("@name", expName.Trim());
                        using (var rE = findExp.ExecuteReader())
                        {
                            if (rE.Read())
                            {
                                expAccId = Convert.ToInt32(rE["AccountId"]);
                                expCode = rE["AccCode"]?.ToString() ?? "";
                                expName = rE["AccName"]?.ToString() ?? expName;
                            }
                        }
                    }

                    using var dExp = conn.CreateCommand();
                    dExp.Transaction = tx;
                    dExp.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, 2, @aid, @code, @name, @amt, 0, @narr)";
                    dExp.Parameters.AddWithValue("@vid",  poId);
                    dExp.Parameters.AddWithValue("@aid",  expAccId > 0 ? (object)expAccId : DBNull.Value);
                    dExp.Parameters.AddWithValue("@code", expCode);
                    dExp.Parameters.AddWithValue("@name", expName);
                    dExp.Parameters.AddWithValue("@amt",  model.Amount);
                    dExp.Parameters.AddWithValue("@narr", (object?)model.Narration ?? "PO Booking - Expense");
                    dExp.ExecuteNonQuery();
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = "Purchase Order recorded successfully.",
                    poNo,
                    poId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/purchase-orders/{id} ──
        [HttpDelete("{id}")]
        public IActionResult DeletePurchaseOrder(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = "UPDATE jeevika_erp.SocVoucherHeader SET IsDeleted = TRUE, UpdatedAt = NOW() WHERE VoucherId = @id AND VoucherType = 'PurchaseOrder'";
                cmd.Parameters.AddWithValue("@id", id);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Purchase Order deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class PurchaseOrderModel
    {
        public int       SocietyId   { get; set; }
        public int       FYId        { get; set; }
        public string?   VoucherNo   { get; set; }
        public DateTime  PoDate      { get; set; } = DateTime.Today;
        public decimal   Amount      { get; set; } = 0;
        public string?   VendorName  { get; set; }
        public string?   PersonName  { get; set; }
        public int?      AccountId   { get; set; }
        public string?   AccountName { get; set; }
        public string?   InvNo       { get; set; }
        public string?   Narration   { get; set; }
        public List<VoucherItemModel>? Items   { get; set; }
        public List<VoucherItemModel>? Details { get; set; }
    }
}
