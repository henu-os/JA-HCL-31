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

                // Insert Credit row (Vendor Payable)
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

                // 4. Insert Debit row(s) (Expense / Line Accounts)
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
    }
}
