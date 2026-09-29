// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — OpeningBalanceController
// Manages Opening Balances for accounts and members per FY & Bill Type
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/opening-balances")]
    [AllowAnonymous]
    public class OpeningBalanceController : ControllerBase
    {
        private static bool _tableChecked = false;

        private static void EnsureTable()
        {
            if (_tableChecked) return;
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberOpBalance (
                        SocietyId INT NOT NULL,
                        MemberId INT NOT NULL,
                        BillType VARCHAR(100) NOT NULL,
                        OpPrincipal NUMERIC(15, 2) DEFAULT 0,
                        OpInterest NUMERIC(15, 2) DEFAULT 0,
                        PRIMARY KEY (SocietyId, MemberId, BillType)
                    );";
                cmd.ExecuteNonQuery();
                _tableChecked = true;
            }
            catch { }
        }

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
                    SELECT a.AccountId, a.AccCode, a.AccName, g.GrpName,
                           COALESCE(ob.OpenBalId, 0) AS OpenBalId,
                           COALESCE(ob.OpenBal, a.OpBal) AS OpenBal,
                           COALESCE(ob.DrCr, a.OpDrCr) AS DrCr,
                           ob.EntryDate
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                    WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE
                    ORDER BY g.GrpName, a.AccName";
                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        openBalId = Convert.ToInt32(r["OpenBalId"]),
                        accountId = Convert.ToInt32(r["AccountId"]),
                        accCode   = r["AccCode"].ToString() ?? "",
                        accName   = r["AccName"].ToString() ?? "",
                        groupName = r["GrpName"]?.ToString() ?? "",
                        openBal   = Convert.ToDecimal(r["OpenBal"]),
                        drCr      = r["DrCr"].ToString() ?? "Dr",
                        entryDate = r["EntryDate"] == DBNull.Value ? null : ((DateTime)r["EntryDate"]).ToString("yyyy-MM-dd")
                    });
                }

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member-summary")]
        public IActionResult GetMemberOpeningSummary([FromQuery] int societyId)
        {
            EnsureTable();
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "societyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();

                cmd.CommandText = @"
                    WITH AllOpBals AS (
                        SELECT MemberId, (COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0)) AS Amount
                        FROM jeevika_erp.SocMemberOpBalance
                        WHERE SocietyId = @sid
                        UNION ALL
                        SELECT m.MemberId, (COALESCE(m.OpPrincipal, 0) + COALESCE(m.OpInterest, 0)) AS Amount
                        FROM jeevika_erp.SocMember m
                        WHERE m.SocietyId = @sid AND m.IsDeleted = FALSE
                          AND NOT EXISTS (
                              SELECT 1 FROM jeevika_erp.SocMemberOpBalance ob 
                              WHERE ob.SocietyId = @sid AND ob.MemberId = m.MemberId
                          )
                    ),
                    MemberTotals AS (
                        SELECT MemberId, SUM(Amount) AS NetBalance
                        FROM AllOpBals
                        GROUP BY MemberId
                    )
                    SELECT 
                        COALESCE(SUM(CASE WHEN NetBalance > 0 THEN NetBalance ELSE 0 END), 0) AS TotalDues,
                        COALESCE(SUM(CASE WHEN NetBalance < 0 THEN ABS(NetBalance) ELSE 0 END), 0) AS TotalAdvance
                    FROM MemberTotals;";

                cmd.Parameters.AddWithValue("@sid", societyId);

                decimal totalDues = 0;
                decimal totalAdvance = 0;
                using (var r = cmd.ExecuteReader())
                {
                    if (r.Read())
                    {
                        totalDues = Convert.ToDecimal(r["TotalDues"]);
                        totalAdvance = Convert.ToDecimal(r["TotalAdvance"]);
                    }
                }

                return Ok(new { success = true, totalDues, totalAdvance });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member")]
        public IActionResult GetMemberOpeningBalances([FromQuery] int societyId, [FromQuery] string? billType)
        {
            EnsureTable();
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "societyId is required." });

            if (string.IsNullOrWhiteSpace(billType))
                billType = "Maintenance";

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT m.MemberId, m.FlatNo, m.MemCode, m.MemName,
                           COALESCE(ob.OpPrincipal, CASE WHEN LOWER(@btype) = 'maintenance' THEN m.OpPrincipal ELSE 0 END) AS OpPrincipal,
                           COALESCE(ob.OpInterest, CASE WHEN LOWER(@btype) = 'maintenance' THEN m.OpInterest ELSE 0 END) AS OpInterest
                    FROM jeevika_erp.SocMember m
                    LEFT JOIN jeevika_erp.SocMemberOpBalance ob 
                           ON m.MemberId = ob.MemberId AND ob.SocietyId = @sid AND LOWER(ob.BillType) = LOWER(@btype)
                    WHERE m.SocietyId = @sid AND m.IsDeleted = FALSE
                    ORDER BY m.FlatNo, m.MemName";

                cmd.Parameters.AddWithValue("@sid",   societyId);
                cmd.Parameters.AddWithValue("@btype", billType);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    var prin = Convert.ToDecimal(r["OpPrincipal"]);
                    var obInt = Convert.ToDecimal(r["OpInterest"]);
                    var code = (r["FlatNo"]?.ToString() ?? r["MemCode"]?.ToString() ?? "").Trim();
                    list.Add(new
                    {
                        type = "row",
                        id = Convert.ToInt32(r["MemberId"]),
                        code = string.IsNullOrEmpty(code) ? ("M-" + r["MemberId"]) : code,
                        name = r["MemName"]?.ToString() ?? "",
                        prin = prin,
                        @int = obInt,
                        total = prin + obInt
                    });
                }

                return Ok(new { success = true, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("member")]
        public IActionResult SaveMemberOpeningBalances([FromQuery] int societyId, [FromQuery] string? billType, [FromBody] List<MemberOpBalDto> list)
        {
            EnsureTable();
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "societyId is required." });

            if (string.IsNullOrWhiteSpace(billType))
                billType = "Maintenance";

            if (list == null || list.Count == 0)
                return Ok(new { success = true, message = "No records to update." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx = conn.BeginTransaction();

                foreach (var item in list)
                {
                    if (item == null) continue;

                    if (item.Id <= 0 && !string.IsNullOrWhiteSpace(item.Code))
                    {
                        using var findCmd = conn.CreateCommand();
                        findCmd.Transaction = tx;
                        findCmd.CommandText = "SELECT MemberId FROM jeevika_erp.SocMember WHERE SocietyId = @sid AND (FlatNo = @code OR MemCode = @code) LIMIT 1";
                        findCmd.Parameters.AddWithValue("@sid", societyId);
                        findCmd.Parameters.AddWithValue("@code", item.Code.Trim());
                        var foundId = findCmd.ExecuteScalar();
                        if (foundId != null && foundId != DBNull.Value) item.Id = Convert.ToInt32(foundId);
                    }

                    if (item.Id <= 0) continue;

                    if (billType.Equals("Maintenance", StringComparison.OrdinalIgnoreCase))
                    {
                        using var updateMem = conn.CreateCommand();
                        updateMem.Transaction = tx;
                        updateMem.CommandText = @"
                            UPDATE jeevika_erp.SocMember
                            SET OpPrincipal = @prin, OpInterest = @int
                            WHERE MemberId = @mid AND SocietyId = @sid";
                        updateMem.Parameters.AddWithValue("@prin", item.Prin);
                        updateMem.Parameters.AddWithValue("@int",  item.Int);
                        updateMem.Parameters.AddWithValue("@mid",  item.Id);
                        updateMem.Parameters.AddWithValue("@sid",  societyId);
                        updateMem.ExecuteNonQuery();
                    }

                    using var cmd = conn.CreateCommand();
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocMemberOpBalance
                            (SocietyId, MemberId, BillType, OpPrincipal, OpInterest)
                        VALUES
                            (@sid, @mid, @btype, @prin, @int)
                        ON CONFLICT (SocietyId, MemberId, BillType) DO UPDATE SET
                            OpPrincipal = EXCLUDED.OpPrincipal,
                            OpInterest  = EXCLUDED.OpInterest";

                    cmd.Parameters.AddWithValue("@sid",   societyId);
                    cmd.Parameters.AddWithValue("@mid",   item.Id);
                    cmd.Parameters.AddWithValue("@btype", billType);
                    cmd.Parameters.AddWithValue("@prin",  item.Prin);
                    cmd.Parameters.AddWithValue("@int",   item.Int);
                    cmd.ExecuteNonQuery();
                }

                // Auto-sync Control Accounts ASS-1025 (Dues From Members) and LIA-1025 (Advances From Members)
                using (var syncCmd = conn.CreateCommand())
                {
                    syncCmd.Transaction = tx;
                    syncCmd.CommandText = @"
                        WITH AllOpBals AS (
                            SELECT MemberId, (COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0)) AS Amount
                            FROM jeevika_erp.SocMemberOpBalance
                            WHERE SocietyId = @sid
                            UNION ALL
                            SELECT m.MemberId, (COALESCE(m.OpPrincipal, 0) + COALESCE(m.OpInterest, 0)) AS Amount
                            FROM jeevika_erp.SocMember m
                            WHERE m.SocietyId = @sid AND m.IsDeleted = FALSE
                              AND NOT EXISTS (
                                  SELECT 1 FROM jeevika_erp.SocMemberOpBalance ob 
                                  WHERE ob.SocietyId = @sid AND ob.MemberId = m.MemberId
                              )
                        ),
                        MemberTotals AS (
                            SELECT MemberId, SUM(Amount) AS NetBalance
                            FROM AllOpBals
                            GROUP BY MemberId
                        )
                        SELECT 
                            COALESCE(SUM(CASE WHEN NetBalance > 0 THEN NetBalance ELSE 0 END), 0) AS TotalDues,
                            COALESCE(SUM(CASE WHEN NetBalance < 0 THEN ABS(NetBalance) ELSE 0 END), 0) AS TotalAdvance
                        FROM MemberTotals;";
                    syncCmd.Parameters.AddWithValue("@sid", societyId);
                    decimal totDues = 0, totAdv = 0;
                    using (var rS = syncCmd.ExecuteReader())
                    {
                        if (rS.Read())
                        {
                            totDues = Convert.ToDecimal(rS["TotalDues"]);
                            totAdv  = Convert.ToDecimal(rS["TotalAdvance"]);
                        }
                    }

                    using var upDues = conn.CreateCommand();
                    upDues.Transaction = tx;
                    upDues.CommandText = @"
                        UPDATE jeevika_erp.SocAccount
                        SET OpBal = @dues, OpDrCr = 'Dr', PrBal = @dues, PrDrCr = 'Dr'
                        WHERE SocietyId = @sid AND (AccCode = 'ASS-1025' OR LOWER(AccName) LIKE '%dues from member%');
                        UPDATE jeevika_erp.SocAccount
                        SET OpBal = @adv, OpDrCr = 'Cr', PrBal = @adv, PrDrCr = 'Cr'
                        WHERE SocietyId = @sid AND (AccCode = 'LIA-1025' OR LOWER(AccName) LIKE '%advance from member%');";
                    upDues.Parameters.AddWithValue("@sid",  societyId);
                    upDues.Parameters.AddWithValue("@dues", totDues);
                    upDues.Parameters.AddWithValue("@adv",  totAdv);
                    upDues.ExecuteNonQuery();
                }

                tx.Commit();
                return Ok(new { success = true, message = "Member opening balances saved successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("ledger")]
        public IActionResult SaveLedgerOpeningBalances([FromQuery] int societyId, [FromQuery] string? category, [FromQuery] int fyId = 0, [FromBody] List<LedgerOpBalDto> list = null!)
        {
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "societyId is required." });

            if (list == null || list.Count == 0)
                return Ok(new { success = true, message = "No records to update." });

            if (fyId <= 0)
            {
                try
                {
                    using var connF = DbHelper.GetConn();
                    using var cmdF = connF.CreateCommand();
                    cmdF.CommandText = "SELECT FYId FROM jeevika_erp.financialyear WHERE (SocietyId = @sid OR SocietyId = 0) ORDER BY IsActive DESC, FYId DESC LIMIT 1";
                    cmdF.Parameters.AddWithValue("@sid", societyId);
                    var fRes = cmdF.ExecuteScalar();
                    if (fRes != null && fRes != DBNull.Value) fyId = Convert.ToInt32(fRes);
                }
                catch { }
            }

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx = conn.BeginTransaction();

                foreach (var item in list)
                {
                    if (item == null) continue;

                    if (item.Id <= 0 && !string.IsNullOrWhiteSpace(item.Code))
                    {
                        using var findCmd = conn.CreateCommand();
                        findCmd.Transaction = tx;
                        findCmd.CommandText = "SELECT AccountId FROM jeevika_erp.SocAccount WHERE SocietyId = @sid AND AccCode = @code LIMIT 1";
                        findCmd.Parameters.AddWithValue("@sid", societyId);
                        findCmd.Parameters.AddWithValue("@code", item.Code.Trim());
                        var foundId = findCmd.ExecuteScalar();
                        if (foundId != null && foundId != DBNull.Value) item.Id = Convert.ToInt32(foundId);
                    }

                    if (item.Id <= 0) continue;

                    decimal bal = 0;
                    string drcr = "Dr";

                    if (string.Equals(category, "BS", StringComparison.OrdinalIgnoreCase))
                    {
                        if (item.Dr > 0) { bal = item.Dr; drcr = "Dr"; }
                        else if (item.Cr > 0) { bal = item.Cr; drcr = "Cr"; }
                    }
                    else
                    {
                        if (item.PDr > 0) { bal = item.PDr; drcr = "Dr"; }
                        else if (item.PCr > 0) { bal = item.PCr; drcr = "Cr"; }
                    }

                    using var cmd = conn.CreateCommand();
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocAccount
                        SET OpBal = @bal, OpDrCr = @drcr, PrBal = @bal, PrDrCr = @drcr
                        WHERE AccountId = @accId AND SocietyId = @sid";

                    cmd.Parameters.AddWithValue("@bal",   bal);
                    cmd.Parameters.AddWithValue("@drcr",  drcr);
                    cmd.Parameters.AddWithValue("@accId", item.Id);
                    cmd.Parameters.AddWithValue("@sid",   societyId);
                    cmd.ExecuteNonQuery();

                    // Also upsert into SocOpeningBalance if fyId is available
                    if (fyId > 0)
                    {
                        using var obCmd = conn.CreateCommand();
                        obCmd.Transaction = tx;
                        obCmd.CommandText = @"
                            INSERT INTO jeevika_erp.SocOpeningBalance
                                (SocietyId, FYId, AccountId, OpenBal, DrCr, EntryDate)
                            VALUES
                                (@sid, @fyid, @accId, @bal, @drcr, CURRENT_DATE)
                            ON CONFLICT (SocietyId, FYId, AccountId) DO UPDATE SET
                                OpenBal   = EXCLUDED.OpenBal,
                                DrCr      = EXCLUDED.DrCr,
                                EntryDate = EXCLUDED.EntryDate";
                        obCmd.Parameters.AddWithValue("@sid",   societyId);
                        obCmd.Parameters.AddWithValue("@fyid",  fyId);
                        obCmd.Parameters.AddWithValue("@accId", item.Id);
                        obCmd.Parameters.AddWithValue("@bal",   bal);
                        obCmd.Parameters.AddWithValue("@drcr",  drcr);
                        obCmd.ExecuteNonQuery();
                    }
                }

                tx.Commit();
                return Ok(new { success = true, message = "Ledger opening balances saved successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("bulk-save")]
        public IActionResult BulkSave([FromBody] List<OpeningBalModel> list)
        {
            if (list == null || list.Count == 0)
                return BadRequest(new { success = false, message = "No records provided." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx = conn.BeginTransaction();

                foreach (var item in list)
                {
                    using var cmd = conn.CreateCommand();
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocOpeningBalance
                            (SocietyId, FYId, AccountId, OpenBal, DrCr, EntryDate)
                        VALUES
                            (@sid, @fyid, @accId, @bal, @drcr, @edate)
                        ON CONFLICT (SocietyId, FYId, AccountId) DO UPDATE SET
                            OpenBal   = EXCLUDED.OpenBal,
                            DrCr      = EXCLUDED.DrCr,
                            EntryDate = EXCLUDED.EntryDate";

                    cmd.Parameters.AddWithValue("@sid",   item.SocietyId);
                    cmd.Parameters.AddWithValue("@fyid",  item.FYId);
                    cmd.Parameters.AddWithValue("@accId", item.AccountId);
                    cmd.Parameters.AddWithValue("@bal",   item.OpenBal);
                    cmd.Parameters.AddWithValue("@drcr",  string.IsNullOrWhiteSpace(item.DrCr) ? "Dr" : item.DrCr);
                    cmd.Parameters.AddWithValue("@edate", item.EntryDate.HasValue ? item.EntryDate.Value : DBNull.Value);
                    cmd.ExecuteNonQuery();

                    using var updateAcc = conn.CreateCommand();
                    updateAcc.Transaction = tx;
                    updateAcc.CommandText = @"
                        UPDATE jeevika_erp.SocAccount
                        SET OpBal = @bal, OpDrCr = @drcr
                        WHERE AccountId = @accId AND SocietyId = @sid";
                    updateAcc.Parameters.AddWithValue("@bal",   item.OpenBal);
                    updateAcc.Parameters.AddWithValue("@drcr",  string.IsNullOrWhiteSpace(item.DrCr) ? "Dr" : item.DrCr);
                    updateAcc.Parameters.AddWithValue("@accId", item.AccountId);
                    updateAcc.Parameters.AddWithValue("@sid",   item.SocietyId);
                    updateAcc.ExecuteNonQuery();
                }

                tx.Commit();
                return Ok(new { success = true, message = $"Saved opening balances for {list.Count} accounts." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class MemberOpBalDto
    {
        public int     Id   { get; set; }
        public string? Code { get; set; }
        public string? Name { get; set; }
        public decimal Prin { get; set; } = 0;
        public decimal Int  { get; set; } = 0;
    }

    public class LedgerOpBalDto
    {
        public int     Id   { get; set; }
        public string? Code { get; set; }
        public string? Name { get; set; }
        public decimal Dr   { get; set; } = 0;
        public decimal Cr   { get; set; } = 0;
        public decimal PDr  { get; set; } = 0;
        public decimal PCr  { get; set; } = 0;
    }

    public class OpeningBalModel
    {
        public int       SocietyId { get; set; }
        public int       FYId      { get; set; }
        public int       AccountId { get; set; }
        public decimal   OpenBal   { get; set; } = 0;
        public string    DrCr      { get; set; } = "Dr";
        public DateTime? EntryDate { get; set; }
    }
}
