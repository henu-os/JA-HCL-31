// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — OpeningBankRecoController
// RESTful API for Opening Bank Reconciliation Vouchers
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/opening-bank-reco")]
    [AllowAnonymous]
    public class OpeningBankRecoController : ControllerBase
    {
        private static string GetStringSafe(NpgsqlDataReader r, string colName, string def = "")
        {
            try
            {
                int ord = r.GetOrdinal(colName);
                return r.IsDBNull(ord) ? def : (r.GetValue(ord)?.ToString() ?? def);
            }
            catch
            {
                return def;
            }
        }

        private static string GetDateStringSafe(NpgsqlDataReader r, string colName)
        {
            try
            {
                int ord = r.GetOrdinal(colName);
                if (r.IsDBNull(ord)) return "";
                var val = r.GetValue(ord);
                if (val is DateTime dt) return dt.ToString("yyyy-MM-dd");
                return val?.ToString() ?? "";
            }
            catch
            {
                return "";
            }
        }

        // ── GET /api/opening-bank-reco/banks ───────────────────────
        // Queries bank & cash ledger accounts live from SocAccount table
        [HttpGet("banks")]
        public IActionResult GetBankAccounts([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT a.AccountId, a.AccCode, a.AccName
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    WHERE a.SocietyId = @socId AND a.IsDeleted = FALSE
                      AND (g.GrpMainId IN (1, 2) OR LOWER(g.GrpName) LIKE '%bank%' OR LOWER(g.GrpName) LIKE '%cash%' OR LOWER(a.AccName) LIKE '%bank%' OR LOWER(a.AccName) LIKE '%cash%')
                    ORDER BY a.AccName ASC";
                cmd.Parameters.AddWithValue("@socId", societyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new {
                        accountId = Convert.ToInt32(r["AccountId"]),
                        accCode   = GetStringSafe(r, "AccCode"),
                        accName   = GetStringSafe(r, "AccName")
                    });
                }

                // If no specific bank group accounts found, fallback to all active accounts
                if (list.Count == 0)
                {
                    using var allCmd = conn.CreateCommand();
                    allCmd.CommandText = @"
                        SELECT AccountId, AccCode, AccName
                        FROM jeevika_erp.SocAccount
                        WHERE SocietyId = @socId AND IsDeleted = FALSE
                        ORDER BY AccName ASC";
                    allCmd.Parameters.AddWithValue("@socId", societyId);

                    using var rAll = allCmd.ExecuteReader();
                    while (rAll.Read())
                    {
                        list.Add(new {
                            accountId = Convert.ToInt32(rAll["AccountId"]),
                            accCode   = GetStringSafe(rAll, "AccCode"),
                            accName   = GetStringSafe(rAll, "AccName")
                        });
                    }
                }

                return Ok(new { success = true, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/opening-bank-reco ─────────────────────────────
        [HttpGet]
        public IActionResult GetAll([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT *
                    FROM jeevika_erp.SocOpeningBankReco
                    WHERE SocietyId = @socId
                    ORDER BY 1 DESC";
                cmd.Parameters.AddWithValue("@socId", societyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    int idVal = Convert.ToInt32(r[0]);
                    list.Add(new {
                        id        = idVal,
                        vchNo     = GetStringSafe(r, "VoucherNo"),
                        vchDate   = GetDateStringSafe(r, "VoucherDate"),
                        accountId = GetStringSafe(r, "AccountId") != "" ? Convert.ToInt32(r["AccountId"]) : (int?)null,
                        bank      = GetStringSafe(r, "BankName"),
                        amount    = r["UnclearedAmount"] != DBNull.Value ? Convert.ToDecimal(r["UnclearedAmount"]) : 0m,
                        chqNo     = GetStringSafe(r, "ChequeNo"),
                        chqDate   = GetDateStringSafe(r, "ChequeDate"),
                        billNo    = GetStringSafe(r, "BillRefNo"),
                        paidTo    = GetStringSafe(r, "PaidTo"),
                        narration = GetStringSafe(r, "Narration"),
                        part1     = GetStringSafe(r, "Particular1"),
                        part2     = GetStringSafe(r, "Particular2"),
                        isCleared = GetStringSafe(r, "IsCleared") != "" && Convert.ToBoolean(r["IsCleared"])
                    });
                }
                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/opening-bank-reco ────────────────────────────
        [HttpPost]
        public IActionResult Create([FromBody] OpeningBankRecoModel model, [FromQuery] int societyId = 1)
        {
            if (string.IsNullOrWhiteSpace(model.VchNo))
                return BadRequest(new { success = false, message = "Voucher Number is required." });

            try
            {
                using var conn = DbHelper.GetConn();

                DateTime vchDt = DateTime.Now;
                if (!string.IsNullOrWhiteSpace(model.VchDate))
                    DateTime.TryParse(model.VchDate, out vchDt);

                DateTime? chqDt = null;
                if (!string.IsNullOrWhiteSpace(model.ChqDate) && DateTime.TryParse(model.ChqDate, out var parsedChq))
                    chqDt = parsedChq;

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocOpeningBankReco (
                        SocietyId, VoucherNo, VoucherDate, AccountId, BankName, UnclearedAmount,
                        ChequeNo, ChequeDate, BillRefNo, PaidTo, Narration, Particular1, Particular2, IsCleared, CreatedAt
                    ) VALUES (
                        @socId, @vchNo, @vchDate, @accId, @bank, @amt,
                        @chqNo, @chqDate, @billNo, @paidTo, @narr, @part1, @part2, @cleared, NOW()
                    ) RETURNING RecoId";

                cmd.Parameters.AddWithValue("@socId", societyId);
                cmd.Parameters.AddWithValue("@vchNo", model.VchNo.Trim());
                cmd.Parameters.AddWithValue("@vchDate", vchDt);
                cmd.Parameters.AddWithValue("@accId", model.AccountId.HasValue ? (object)model.AccountId.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@bank", string.IsNullOrWhiteSpace(model.Bank) ? "Bank Account" : model.Bank.Trim());
                cmd.Parameters.AddWithValue("@amt", model.Amount);
                cmd.Parameters.AddWithValue("@chqNo", (object?)model.ChqNo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@chqDate", chqDt.HasValue ? (object)chqDt.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@billNo", (object?)model.BillNo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@paidTo", (object?)model.PaidTo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@narr", (object?)model.Narration ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@part1", (object?)model.Part1 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@part2", (object?)model.Part2 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cleared", model.IsCleared);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, message = "Voucher saved successfully!", id = newId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/opening-bank-reco/{id} ────────────────────────
        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] OpeningBankRecoModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                DateTime vchDt = DateTime.Now;
                if (!string.IsNullOrWhiteSpace(model.VchDate))
                    DateTime.TryParse(model.VchDate, out vchDt);

                DateTime? chqDt = null;
                if (!string.IsNullOrWhiteSpace(model.ChqDate) && DateTime.TryParse(model.ChqDate, out var parsedChq))
                    chqDt = parsedChq;

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocOpeningBankReco SET
                        VoucherNo       = @vchNo,
                        VoucherDate     = @vchDate,
                        AccountId       = @accId,
                        BankName        = @bank,
                        UnclearedAmount = @amt,
                        ChequeNo        = @chqNo,
                        ChequeDate      = @chqDate,
                        BillRefNo       = @billNo,
                        PaidTo          = @paidTo,
                        Narration       = @narr,
                        Particular1     = @part1,
                        Particular2     = @part2,
                        IsCleared       = @cleared
                    WHERE RecoId = @id";

                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@vchNo", model.VchNo.Trim());
                cmd.Parameters.AddWithValue("@vchDate", vchDt);
                cmd.Parameters.AddWithValue("@accId", model.AccountId.HasValue ? (object)model.AccountId.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@bank", string.IsNullOrWhiteSpace(model.Bank) ? "Bank Account" : model.Bank.Trim());
                cmd.Parameters.AddWithValue("@amt", model.Amount);
                cmd.Parameters.AddWithValue("@chqNo", (object?)model.ChqNo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@chqDate", chqDt.HasValue ? (object)chqDt.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@billNo", (object?)model.BillNo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@paidTo", (object?)model.PaidTo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@narr", (object?)model.Narration ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@part1", (object?)model.Part1 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@part2", (object?)model.Part2 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cleared", model.IsCleared);

                cmd.ExecuteNonQuery();
                return Ok(new { success = true, message = "Voucher updated successfully!" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/opening-bank-reco/{id} ─────────────────────
        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = "DELETE FROM jeevika_erp.SocOpeningBankReco WHERE RecoId = @id";
                cmd.Parameters.AddWithValue("@id", id);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Voucher deleted successfully!" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class OpeningBankRecoModel
    {
        public int?    AccountId { get; set; }
        public string  VchNo     { get; set; } = "";
        public string? VchDate   { get; set; }
        public string? Bank      { get; set; }
        public decimal Amount    { get; set; }
        public string? ChqNo     { get; set; }
        public string? ChqDate   { get; set; }
        public string? BillNo    { get; set; }
        public string? PaidTo    { get; set; }
        public string? Narration { get; set; }
        public string? Part1     { get; set; }
        public string? Part2     { get; set; }
        public bool    IsCleared { get; set; }
    }
}
