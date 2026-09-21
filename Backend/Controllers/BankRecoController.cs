// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — BankRecoController & FixedDepositController & PurchaseOrderController
// Auxiliary controllers for Bank Reco, FD, and Purchase Orders
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/bank-reco")]
    [AllowAnonymous]
    public class BankRecoController : ControllerBase
    {
        // ── GET /api/bank-reco?societyId=X&fyId=Y&bankAccountId=Z ────────
        // Returns all Bank transactions with proper ERP Books Debit (Receipt/Inflow)
        // and ERP Books Credit (Payment/Outflow) matching physical statement inverse logic.
        [HttpGet]
        public IActionResult GetBankRecoList([FromQuery] int societyId, [FromQuery] int fyId = 0, [FromQuery] int? bankAccountId = null)
        {
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "societyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();

                // 1. Query Vouchers
                using var cmd = conn.CreateCommand();
                var sql = @"
                    SELECT h.VoucherId, h.SocietyId, h.FYId, h.VoucherNo, h.VoucherType, h.VoucherDate,
                           h.CashBankCode, h.CashBankName, h.Amount, h.ChqNo, h.ChqDate, h.BankName,
                           h.PersonName, h.Narration, h.Particular1, h.Particular2, h.Status,
                           h.ClearingDate, h.ClearingRemark
                    FROM jeevika_erp.SocVoucherHeader h
                    WHERE h.SocietyId = @sid AND (@fyid = 0 OR h.FYId = @fyid) AND h.IsDeleted = FALSE
                      AND h.VoucherType IN ('Payment', 'PV', 'Receipt', 'RV', 'MemberReceipt', 'MRV', 'Contra', 'CV', 'OtherReceipt')
                    ORDER BY h.VoucherDate DESC, h.VoucherId DESC";

                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var headers = new List<dynamic>();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        headers.Add(new
                        {
                            VoucherId      = Convert.ToInt32(r["VoucherId"]),
                            VoucherNo      = r["VoucherNo"].ToString() ?? "",
                            VoucherType    = r["VoucherType"].ToString() ?? "",
                            VoucherDate    = ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                            CashBankCode   = r["CashBankCode"]?.ToString() ?? "",
                            CashBankName   = r["CashBankName"]?.ToString() ?? "",
                            Amount         = Convert.ToDecimal(r["Amount"]),
                            ChqNo          = r["ChqNo"]?.ToString() ?? "",
                            ChqDate        = r["ChqDate"] == DBNull.Value ? null : ((DateTime)r["ChqDate"]).ToString("yyyy-MM-dd"),
                            BankName       = r["BankName"]?.ToString() ?? "",
                            PersonName     = r["PersonName"]?.ToString() ?? "",
                            Narration      = r["Narration"]?.ToString() ?? "",
                            Particular1    = r["Particular1"]?.ToString() ?? "",
                            Particular2    = r["Particular2"]?.ToString() ?? "",
                            Status         = r["Status"]?.ToString() ?? "Posted",
                            ClearingDate   = r["ClearingDate"] == DBNull.Value ? null : ((DateTime)r["ClearingDate"]).ToString("yyyy-MM-dd"),
                            ClearingRemark = r["ClearingRemark"]?.ToString() ?? ""
                        });
                    }
                }

                // 2. Fetch specific Bank lines from SocVoucherDetail for exact net bank amounts (after TDS deductions, etc.)
                var vchIds = headers.Select(h => (int)h.VoucherId).ToList();
                var bankLinesMap = new Dictionary<int, (decimal debit, decimal credit, string bankName)>();
                if (vchIds.Count > 0)
                {
                    using var dCmd = conn.CreateCommand();
                    dCmd.CommandText = @"
                        SELECT d.VoucherId, d.Debit, d.Credit, d.AccountName
                        FROM jeevika_erp.SocVoucherDetail d
                        JOIN jeevika_erp.SocAccount a ON d.AccountId = a.AccountId
                        LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                        WHERE d.VoucherId = ANY(@vids)
                          AND (g.GrpMainId = 1 OR LOWER(g.GrpName) LIKE '%bank%' OR LOWER(a.AccName) LIKE '%bank%' OR LOWER(a.AccCode) LIKE 'ass-1%')
                          AND (LOWER(a.AccName) LIKE '%bank%' OR LOWER(g.GrpName) LIKE '%bank%')";
                    dCmd.Parameters.AddWithValue("@vids", vchIds.ToArray());
                    using var dReader = dCmd.ExecuteReader();
                    while (dReader.Read())
                    {
                        var vid = Convert.ToInt32(dReader["VoucherId"]);
                        var dr = Convert.ToDecimal(dReader["Debit"]);
                        var cr = Convert.ToDecimal(dReader["Credit"]);
                        var bName = dReader["AccountName"]?.ToString() ?? "";
                        if (!bankLinesMap.ContainsKey(vid))
                            bankLinesMap[vid] = (dr, cr, bName);
                        else
                        {
                            var existing = bankLinesMap[vid];
                            bankLinesMap[vid] = (existing.debit + dr, existing.credit + cr, string.IsNullOrEmpty(existing.bankName) ? bName : existing.bankName);
                        }
                    }
                }

                var list = new List<object>();
                foreach (var h in headers)
                {
                    int vid = h.VoucherId;
                    string vt = h.VoucherType;
                    bool isReceipt = vt.Equals("Receipt", StringComparison.OrdinalIgnoreCase) ||
                                     vt.Equals("RV", StringComparison.OrdinalIgnoreCase) ||
                                     vt.Equals("MemberReceipt", StringComparison.OrdinalIgnoreCase) ||
                                     vt.Equals("OtherReceipt", StringComparison.OrdinalIgnoreCase);
                    bool isPayment = vt.Equals("Payment", StringComparison.OrdinalIgnoreCase) ||
                                     vt.Equals("PV", StringComparison.OrdinalIgnoreCase) ||
                                     vt.Equals("PaymentEntry", StringComparison.OrdinalIgnoreCase);

                    decimal drAmt = 0;
                    decimal crAmt = 0;
                    string effBank = h.BankName;

                    if (bankLinesMap.TryGetValue(vid, out var bLine))
                    {
                        // Exact line posting to Bank in ERP Books
                        drAmt = bLine.debit;
                        crAmt = bLine.credit;
                        if (string.IsNullOrWhiteSpace(effBank)) effBank = bLine.bankName;
                    }
                    else if (isReceipt)
                    {
                        // In ERP Books: Bank Receipt = Bank DEBIT (Inflow) -> Statement CREDIT
                        drAmt = h.Amount;
                    }
                    else if (isPayment)
                    {
                        // In ERP Books: Bank Payment = Bank CREDIT (Outflow) -> Statement DEBIT
                        crAmt = h.Amount;
                    }
                    else
                    {
                        // Contra or Other
                        var narr = ((string)h.Narration).ToLower();
                        if (narr.Contains("deposit")) drAmt = h.Amount;
                        else crAmt = h.Amount;
                    }

                    if (string.IsNullOrWhiteSpace(effBank)) effBank = h.CashBankName;

                    list.Add(new
                    {
                        voucherId      = h.VoucherId,
                        voucherNo      = h.VoucherNo,
                        voucherType    = h.VoucherType,
                        voucherDate    = h.VoucherDate,
                        cashBankName   = h.CashBankName,
                        amount         = (drAmt > 0 ? drAmt : (crAmt > 0 ? crAmt : h.Amount)),
                        debit          = drAmt, // ERP Books Bank Debit (Receipt / Deposit) -> Physical Bank Statement CREDIT
                        credit         = crAmt, // ERP Books Bank Credit (Payment / Withdrawal) -> Physical Bank Statement DEBIT
                        chqNo          = h.ChqNo,
                        chqDate        = h.ChqDate,
                        bankName       = effBank,
                        personName     = h.PersonName,
                        narration      = h.Narration,
                        particular1    = h.Particular1,
                        particular2    = h.Particular2,
                        clearingDate   = h.ClearingDate,
                        remark         = h.ClearingRemark,
                        status         = h.Status
                    });
                }

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/bank-reco ───────────────────────────────────────
        [HttpPost]
        public IActionResult SaveReconciliation([FromBody] BankRecoSaveModel model)
        {
            if (string.IsNullOrWhiteSpace(model.VoucherNo))
                return BadRequest(new { success = false, message = "VoucherNo is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocVoucherHeader
                    SET ClearingDate = @cdate,
                        ClearingRemark = @remark
                    WHERE VoucherNo = @vno
                      AND (@sid = 0 OR SocietyId = @sid)";
                cmd.Parameters.AddWithValue("@vno", model.VoucherNo.Trim());
                cmd.Parameters.AddWithValue("@cdate", string.IsNullOrWhiteSpace(model.ClearingDate) ? (object)DBNull.Value : DateTime.Parse(model.ClearingDate));
                cmd.Parameters.AddWithValue("@remark", (object?)model.Remark ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@sid", model.SocietyId);

                cmd.ExecuteNonQuery();
                return Ok(new { success = true, message = "Clearing details updated." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/bank-reco/multi-clear ───────────────────────────
        [HttpPost("multi-clear")]
        public IActionResult MultiClear([FromBody] BankRecoMultiClearModel model)
        {
            if (string.IsNullOrWhiteSpace(model.FromVoucherNo) || string.IsNullOrWhiteSpace(model.ToVoucherNo) || string.IsNullOrWhiteSpace(model.ClearingDate))
                return BadRequest(new { success = false, message = "FromVoucherNo, ToVoucherNo, and ClearingDate are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocVoucherHeader
                    SET ClearingDate = @cdate,
                        ClearingRemark = COALESCE(NULLIF(@remark, ''), 'Multi Cleared')
                    WHERE VoucherNo >= @fromV AND VoucherNo <= @toV
                      AND (@sid = 0 OR SocietyId = @sid)
                      AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@fromV", model.FromVoucherNo.Trim());
                cmd.Parameters.AddWithValue("@toV", model.ToVoucherNo.Trim());
                cmd.Parameters.AddWithValue("@cdate", DateTime.Parse(model.ClearingDate));
                cmd.Parameters.AddWithValue("@remark", (object?)model.Remark ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@sid", model.SocietyId);

                int affected = cmd.ExecuteNonQuery();
                return Ok(new { success = true, count = affected, message = $"{affected} vouchers cleared." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/bank-reco/unclear ───────────────────────────────
        [HttpPost("unclear")]
        public IActionResult Unclear([FromBody] BankRecoUnclearModel model)
        {
            if (string.IsNullOrWhiteSpace(model.VoucherNo) && (model.VoucherIds == null || model.VoucherIds.Count == 0))
                return BadRequest(new { success = false, message = "VoucherNo or VoucherIds required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();

                if (model.VoucherIds != null && model.VoucherIds.Count > 0)
                {
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET ClearingDate = NULL, ClearingRemark = NULL
                        WHERE VoucherId = ANY(@vids) AND (@sid = 0 OR SocietyId = @sid)";
                    cmd.Parameters.AddWithValue("@vids", model.VoucherIds.ToArray());
                    cmd.Parameters.AddWithValue("@sid", model.SocietyId);
                }
                else
                {
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET ClearingDate = NULL, ClearingRemark = NULL
                        WHERE VoucherNo = @vno AND (@sid = 0 OR SocietyId = @sid)";
                    cmd.Parameters.AddWithValue("@vno", model.VoucherNo!.Trim());
                    cmd.Parameters.AddWithValue("@sid", model.SocietyId);
                }

                int affected = cmd.ExecuteNonQuery();
                return Ok(new { success = true, count = affected, message = "Vouchers set to uncleared." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class BankRecoSaveModel
    {
        public int SocietyId { get; set; } = 0;
        public string VoucherNo { get; set; } = "";
        public string? ClearingDate { get; set; }
        public string? Remark { get; set; }
    }

    public class BankRecoMultiClearModel
    {
        public int SocietyId { get; set; } = 0;
        public string FromVoucherNo { get; set; } = "";
        public string ToVoucherNo { get; set; } = "";
        public string ClearingDate { get; set; } = "";
        public string? Remark { get; set; }
    }

    public class BankRecoUnclearModel
    {
        public int SocietyId { get; set; } = 0;
        public string? VoucherNo { get; set; }
        public List<int>? VoucherIds { get; set; }
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
