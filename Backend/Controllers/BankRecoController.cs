// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — BankRecoController & FixedDepositController & PurchaseOrderController
// Auxiliary controllers for Bank Reco, FD, and Purchase Orders
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/bank-reco")]
    [AllowAnonymous]
    public class BankRecoController : ControllerBase
    {
        [HttpGet]
        public IActionResult GetUncleared([FromQuery] int societyId, [FromQuery] int fyId, [FromQuery] int? bankAccountId)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "societyId and fyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();

                var sql = @"
                    SELECT VoucherId, VoucherNo, VoucherType, VoucherDate, CashBankName,
                           Amount, ChqNo, ChqDate, BankName, PersonName, Narration, Status
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid AND FYId = @fyid AND IsDeleted = FALSE
                      AND ChqNo IS NOT NULL AND ChqNo != ''";

                if (bankAccountId.HasValue && bankAccountId.Value > 0)
                {
                    sql += " AND CashBankCode = @bcode";
                    cmd.Parameters.AddWithValue("@bcode", bankAccountId.Value.ToString());
                }

                sql += " ORDER BY VoucherDate DESC";
                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        voucherId    = Convert.ToInt32(r["VoucherId"]),
                        voucherNo    = r["VoucherNo"].ToString() ?? "",
                        voucherType  = r["VoucherType"].ToString() ?? "",
                        voucherDate  = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                        cashBankName = r["CashBankName"]?.ToString() ?? "",
                        amount       = Convert.ToDecimal(r["Amount"]),
                        chqNo        = r["ChqNo"].ToString() ?? "",
                        chqDate      = r["ChqDate"] == DBNull.Value ? null : ((DateTime)r["ChqDate"]).ToString("yyyy-MM-dd"),
                        bankName     = r["BankName"]?.ToString() ?? "",
                        personName   = r["PersonName"]?.ToString() ?? "",
                        narration    = r["Narration"]?.ToString() ?? "",
                        status       = r["Status"]?.ToString() ?? "Posted"
                    });
                }

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    [ApiController]
    [Route("api/fixed-deposits")]
    [AllowAnonymous]
    public class FixedDepositController : ControllerBase
    {
        [HttpGet]
        public IActionResult GetAll([FromQuery] int societyId, [FromQuery] int fyId)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "societyId and fyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT FDId, SocietyId, FYId, FDNo, BankName, AccountId,
                           Principal, InterestRate, StartDate, MaturityDate,
                           MaturityAmount, Status
                    FROM jeevika_erp.SocFixedDeposit
                    WHERE SocietyId = @sid AND FYId = @fyid AND IsDeleted = FALSE
                    ORDER BY StartDate DESC";
                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        fDId           = Convert.ToInt32(r["FDId"]),
                        societyId      = Convert.ToInt32(r["SocietyId"]),
                        fyId           = Convert.ToInt32(r["FYId"]),
                        fDNo           = r["FDNo"].ToString() ?? "",
                        bankName       = r["BankName"].ToString() ?? "",
                        accountId      = r["AccountId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["AccountId"]),
                        principal      = Convert.ToDecimal(r["Principal"]),
                        interestRate   = Convert.ToDecimal(r["InterestRate"]),
                        startDate      = r["StartDate"] == DBNull.Value ? null : ((DateTime)r["StartDate"]).ToString("yyyy-MM-dd"),
                        maturityDate   = r["MaturityDate"] == DBNull.Value ? null : ((DateTime)r["MaturityDate"]).ToString("yyyy-MM-dd"),
                        maturityAmount = Convert.ToDecimal(r["MaturityAmount"]),
                        status         = r["Status"].ToString() ?? "Active"
                    });
                }

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost]
        public IActionResult Create([FromBody] FixedDepositModel model)
        {
            if (model.SocietyId <= 0 || model.FYId <= 0 || string.IsNullOrWhiteSpace(model.FDNo) || model.Principal <= 0)
                return BadRequest(new { success = false, message = "SocietyId, FYId, FDNo and Principal are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocFixedDeposit
                        (SocietyId, FYId, FDNo, BankName, AccountId, Principal, InterestRate, StartDate, MaturityDate, MaturityAmount, Status, IsDeleted)
                    VALUES
                        (@sid, @fyid, @no, @bank, @accId, @prin, @rate, @sdate, @mdate, @mamt, 'Active', FALSE)
                    RETURNING FDId";

                cmd.Parameters.AddWithValue("@sid",   model.SocietyId);
                cmd.Parameters.AddWithValue("@fyid",  model.FYId);
                cmd.Parameters.AddWithValue("@no",    model.FDNo.Trim());
                cmd.Parameters.AddWithValue("@bank",  (object?)model.BankName      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@accId", (object?)model.AccountId     ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@prin",  model.Principal);
                cmd.Parameters.AddWithValue("@rate",  model.InterestRate);
                cmd.Parameters.AddWithValue("@sdate", model.StartDate.HasValue    ? model.StartDate.Value    : DBNull.Value);
                cmd.Parameters.AddWithValue("@mdate", model.MaturityDate.HasValue ? model.MaturityDate.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@mamt",  model.MaturityAmount);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, message = "Fixed deposit recorded.", fDId = newId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class FixedDepositModel
    {
        public int       SocietyId      { get; set; }
        public int       FYId           { get; set; }
        public string    FDNo           { get; set; } = "";
        public string?   BankName       { get; set; }
        public int?      AccountId      { get; set; }
        public decimal   Principal      { get; set; } = 0;
        public decimal   InterestRate   { get; set; } = 0;
        public DateTime? StartDate      { get; set; }
        public DateTime? MaturityDate   { get; set; }
        public decimal   MaturityAmount { get; set; } = 0;
    }
}
