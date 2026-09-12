// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MemberBillController
// Maintenance Bill Generation & Management
// Tables: SocMemberBill, SocMemberBillItem, SocBillingMatrix, SocMember, SocBillTypeHead
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/member-bills")]
    [AllowAnonymous]
    public class MemberBillController : ControllerBase
    {
        private static string GetStringSafe(NpgsqlDataReader r, string colName, string def = "")
        {
            try
            {
                int ord = r.GetOrdinal(colName);
                return r.IsDBNull(ord) ? def : (r.GetValue(ord)?.ToString() ?? def);
            }
            catch { return def; }
        }

        // ── GET /api/member-bills?societyId=X&fyId=Y ────────────
        [HttpGet]
        public IActionResult GetAll([FromQuery] int societyId, [FromQuery] int fyId, [FromQuery] int? memberId)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "societyId and fyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();

                // Resolve active FY date bounds
                DateTime? fyStart = null;
                DateTime? fyEnd = null;
                if (fyId > 0)
                {
                    using var fyCmd = conn.CreateCommand();
                    fyCmd.CommandText = "SELECT FYStart, FYEnd FROM jeevika_erp.FinancialYear WHERE FYId = @fyid";
                    fyCmd.Parameters.AddWithValue("@fyid", fyId);
                    using var rFy = fyCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        fyStart = Convert.ToDateTime(rFy["FYStart"]);
                        fyEnd = Convert.ToDateTime(rFy["FYEnd"]);
                    }
                }

                using var cmd = conn.CreateCommand();

                var sql = @"
                    SELECT b.BillId, b.SocietyId, b.FYId, b.BillNo, b.MemberId,
                           COALESCE(b.BillType, 'Maintenance') AS BillType,
                           COALESCE(b.Period, '') AS Period,
                           COALESCE(b.Particular1, '') AS Particular1,
                           COALESCE(b.Particular2, '') AS Particular2,
                           m.MemCode, m.MemName, m.Wing, m.FlatNo,
                           b.BillDate, b.DueDate, b.PrincipalAmount, b.InterestAmount,
                           b.TotalAmount, b.PaidAmount, b.BalanceAmount, b.Status, b.CreatedAt
                    FROM jeevika_erp.SocMemberBill b
                    JOIN jeevika_erp.SocMember m ON b.MemberId = m.MemberId
                    WHERE (b.SocietyId = @sid OR (@sid <= 0 AND b.SocietyId > 0)) 
                      AND (
                        b.FYId = @fyid 
                        OR @fyid <= 0 
                        OR (@hasRange = TRUE AND b.BillDate >= @sdate AND b.BillDate <= @edate)
                      )
                      AND b.IsDeleted = FALSE";

                if (memberId.HasValue && memberId.Value > 0)
                {
                    sql += " AND b.MemberId = @mid";
                    cmd.Parameters.AddWithValue("@mid", memberId.Value);
                }

                sql += " ORDER BY b.BillId DESC, m.Wing, m.FlatNo";
                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);
                cmd.Parameters.AddWithValue("@hasRange", fyStart.HasValue && fyEnd.HasValue);
                cmd.Parameters.AddWithValue("@sdate", fyStart ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@edate", fyEnd ?? (object)DBNull.Value);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        billId          = Convert.ToInt32(r["BillId"]),
                        societyId       = Convert.ToInt32(r["SocietyId"]),
                        fyId            = Convert.ToInt32(r["FYId"]),
                        billNo          = r["BillNo"].ToString() ?? "",
                        billType        = r["BillType"].ToString() ?? "Maintenance",
                        period          = r["Period"].ToString() ?? "",
                        particular1     = r["Particular1"].ToString() ?? "",
                        particular2     = r["Particular2"].ToString() ?? "",
                        memberId        = Convert.ToInt32(r["MemberId"]),
                        memberCode      = r["MemCode"].ToString() ?? "",
                        memberName      = r["MemName"].ToString() ?? "",
                        wing            = r["Wing"].ToString() ?? "",
                        flatNo          = r["FlatNo"].ToString() ?? "",
                        billDate        = ((DateTime)r["BillDate"]).ToString("yyyy-MM-dd"),
                        dueDate         = r["DueDate"] == DBNull.Value ? null : ((DateTime)r["DueDate"]).ToString("yyyy-MM-dd"),
                        principalAmount = Convert.ToDecimal(r["PrincipalAmount"]),
                        interestAmount  = Convert.ToDecimal(r["InterestAmount"]),
                        totalAmount     = Convert.ToDecimal(r["TotalAmount"]),
                        paidAmount      = Convert.ToDecimal(r["PaidAmount"]),
                        balanceAmount   = Convert.ToDecimal(r["BalanceAmount"]),
                        status          = r["Status"].ToString() ?? "Unpaid"
                    });
                }

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/member-bills/{id} ───────────────────────────
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT b.BillId, b.SocietyId, b.FYId, b.BillNo, b.MemberId,
                           COALESCE(b.BillType, 'Maintenance') AS BillType,
                           COALESCE(b.Period, '') AS Period,
                           COALESCE(b.Particular1, '') AS Particular1,
                           COALESCE(b.Particular2, '') AS Particular2,
                           m.MemCode, m.MemName, m.Wing, m.FlatNo,
                           b.BillDate, b.DueDate, b.PrincipalAmount, b.InterestAmount,
                           b.TotalAmount, b.PaidAmount, b.BalanceAmount, b.Status, b.CreatedAt
                    FROM jeevika_erp.SocMemberBill b
                    JOIN jeevika_erp.SocMember m ON b.MemberId = m.MemberId
                    WHERE b.BillId = @id AND b.IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@id", id);

                using var r = cmd.ExecuteReader();
                if (!r.Read()) return NotFound(new { success = false, message = "Bill not found." });

                var bill = new
                {
                    billId          = Convert.ToInt32(r["BillId"]),
                    societyId       = Convert.ToInt32(r["SocietyId"]),
                    fyId            = Convert.ToInt32(r["FYId"]),
                    billNo          = r["BillNo"].ToString() ?? "",
                    billType        = r["BillType"].ToString() ?? "Maintenance",
                    period          = r["Period"].ToString() ?? "",
                    particular1     = r["Particular1"].ToString() ?? "",
                    particular2     = r["Particular2"].ToString() ?? "",
                    memberId        = Convert.ToInt32(r["MemberId"]),
                    memberCode      = r["MemCode"].ToString() ?? "",
                    memberName      = r["MemName"].ToString() ?? "",
                    wing            = r["Wing"].ToString() ?? "",
                    flatNo          = r["FlatNo"].ToString() ?? "",
                    billDate        = ((DateTime)r["BillDate"]).ToString("yyyy-MM-dd"),
                    dueDate         = r["DueDate"] == DBNull.Value ? null : ((DateTime)r["DueDate"]).ToString("yyyy-MM-dd"),
                    principalAmount = Convert.ToDecimal(r["PrincipalAmount"]),
                    interestAmount  = Convert.ToDecimal(r["InterestAmount"]),
                    totalAmount     = Convert.ToDecimal(r["TotalAmount"]),
                    paidAmount      = Convert.ToDecimal(r["PaidAmount"]),
                    balanceAmount   = Convert.ToDecimal(r["BalanceAmount"]),
                    status          = r["Status"].ToString() ?? "Unpaid"
                };
                r.Close();

                // Fetch line items
                using var itemCmd = conn.CreateCommand();
                itemCmd.CommandText = "SELECT AccountCode, AccountName, Amount FROM jeevika_erp.SocMemberBillItem WHERE BillId = @id ORDER BY ItemId ASC";
                itemCmd.Parameters.AddWithValue("@id", id);
                var items = new List<object>();
                using var rItem = itemCmd.ExecuteReader();
                while (rItem.Read())
                {
                    items.Add(new
                    {
                        accountCode = rItem["AccountCode"]?.ToString() ?? "",
                        accountName = rItem["AccountName"]?.ToString() ?? "",
                        amount      = Convert.ToDecimal(rItem["Amount"])
                    });
                }

                return Ok(new { success = true, data = bill, items });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static int ResolveOrCreateBillTypeId(NpgsqlConnection conn, string billType, int societyId, int explicitId = 0, NpgsqlTransaction? tx = null)
        {
            if (explicitId > 0) return explicitId;
            if (string.IsNullOrWhiteSpace(billType)) billType = "Maintenance";

            string cleanType = System.Text.RegularExpressions.Regex.Replace(billType.Trim(), @"\s+", " ");
            bool isMajor = cleanType.IndexOf("major", StringComparison.OrdinalIgnoreCase) >= 0;
            bool isMaint = cleanType.IndexOf("maint", StringComparison.OrdinalIgnoreCase) >= 0;

            int billTypeId = 0;
            using (var btCmd = conn.CreateCommand())
            {
                if (tx != null) btCmd.Transaction = tx;
                btCmd.CommandText = @"
                    SELECT BillTypeId FROM jeevika_erp.SocBillType
                    WHERE (SocietyId = @sid OR (@sid > 0 AND SocietyId = 1) OR (@sid <= 0 AND SocietyId > 0)) 
                      AND (
                          REGEXP_REPLACE(LOWER(TRIM(BillTypeName)), '\s+', ' ', 'g') = LOWER(@cleanType)
                          OR LOWER(TRIM(BillTypeCode)) = LOWER(@cleanType)
                          OR LOWER(TRIM(BillTypeName)) ILIKE '%' || LOWER(@cleanType) || '%'
                          OR LOWER(@cleanType) ILIKE '%' || LOWER(TRIM(BillTypeName)) || '%'
                          OR (@isMajor = TRUE AND (LOWER(BillTypeName) ILIKE '%major%' OR LOWER(BillTypeCode) ILIKE '%major%'))
                          OR (@isMaint = TRUE AND (LOWER(BillTypeName) ILIKE '%maint%' OR LOWER(BillTypeCode) ILIKE '%maint%'))
                      )
                    ORDER BY 
                        CASE WHEN SocietyId = @sid THEN 0 ELSE 1 END,
                        CASE WHEN REGEXP_REPLACE(LOWER(TRIM(BillTypeName)), '\s+', ' ', 'g') = LOWER(@cleanType) THEN 0 ELSE 1 END,
                        BillTypeId ASC
                    LIMIT 1";
                btCmd.Parameters.AddWithValue("@sid", societyId > 0 ? societyId : 1);
                btCmd.Parameters.AddWithValue("@cleanType", cleanType);
                btCmd.Parameters.AddWithValue("@isMajor", isMajor);
                btCmd.Parameters.AddWithValue("@isMaint", isMaint);
                var obj = btCmd.ExecuteScalar();
                if (obj != null && obj != DBNull.Value) billTypeId = Convert.ToInt32(obj);
            }

            if (billTypeId == 0)
            {
                try
                {
                    using var insBtCmd = conn.CreateCommand();
                    if (tx != null) insBtCmd.Transaction = tx;
                    insBtCmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocBillType (SocietyId, BillTypeCode, BillTypeName, Description, IsActive)
                        VALUES (@socId, UPPER(SUBSTRING(REGEXP_REPLACE(@name, '\s+', '', 'g') FROM 1 FOR 5)), @name, @name || ' Bill', TRUE)
                        ON CONFLICT (SocietyId, BillTypeCode) DO UPDATE SET BillTypeName = EXCLUDED.BillTypeName, IsActive = TRUE
                        RETURNING BillTypeId";
                    insBtCmd.Parameters.AddWithValue("@socId", societyId > 0 ? societyId : 1);
                    insBtCmd.Parameters.AddWithValue("@name", cleanType);
                    var obj = insBtCmd.ExecuteScalar();
                    if (obj != null && obj != DBNull.Value) billTypeId = Convert.ToInt32(obj);
                }
                catch (Exception btEx)
                {
                    Console.WriteLine($"[ResolveOrCreateBillTypeId Error] {btEx}");
                }
            }

            return billTypeId;
        }

        // ── POST /api/member-bills (Single Bill Save) ────────────
        [HttpPost]
        public IActionResult CreateBill([FromBody] CreateMemberBillModel model)
        {
            if (model.SocietyId <= 0 || model.FYId <= 0 || model.MemberId <= 0)
                return BadRequest(new { success = false, message = "SocietyId, FYId, and MemberId are required." });

            try
            {
                using var conn = DbHelper.GetConn();

                // Validate BillDate against active FinancialYear
                using (var fyCheckCmd = conn.CreateCommand())
                {
                    fyCheckCmd.CommandText = "SELECT FYStart, FYEnd, FYLabel FROM jeevika_erp.FinancialYear WHERE FYId = @fyid LIMIT 1";
                    fyCheckCmd.Parameters.AddWithValue("@fyid", model.FYId);
                    using var rFy = fyCheckCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        var fyStart = Convert.ToDateTime(rFy["FYStart"]).Date;
                        var fyEnd = Convert.ToDateTime(rFy["FYEnd"]).Date;
                        var fyLabel = rFy["FYLabel"]?.ToString() ?? "";
                        var bDate = model.BillDate.Date;
                        if (bDate < fyStart || bDate > fyEnd)
                        {
                            return BadRequest(new { 
                                success = false, 
                                message = $"Bill Date ({bDate:dd/MM/yyyy}) must fall within Financial Year {fyLabel} ({fyStart:dd/MM/yyyy} to {fyEnd:dd/MM/yyyy})." 
                            });
                        }
                    }
                }

                // Look up or initialize BillTypeId BEFORE starting the transaction
                int billTypeId = ResolveOrCreateBillTypeId(conn, model.BillType ?? "Maintenance", model.SocietyId, model.BillTypeId);

                using var tx = conn.BeginTransaction();

                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocMemberBill
                        (SocietyId, FYId, BillNo, MemberId, BillTypeId, BillType, Period, Particular1, Particular2,
                         BillDate, DueDate, PrincipalAmount, InterestAmount, TotalAmount, PaidAmount, BalanceAmount, Status, CreatedAt)
                    VALUES
                        (@sid, @fyid, @bno, @mid, @btid, @btype, @period, @p1, @p2,
                         @bdate, @ddate, @prin, @interest, @total, 0, @total, 'Unpaid', NOW())
                    ON CONFLICT (SocietyId, FYId, BillNo)
                    DO UPDATE SET
                        MemberId        = EXCLUDED.MemberId,
                        BillTypeId      = EXCLUDED.BillTypeId,
                        BillType        = EXCLUDED.BillType,
                        Period          = EXCLUDED.Period,
                        Particular1     = EXCLUDED.Particular1,
                        Particular2     = EXCLUDED.Particular2,
                        BillDate        = EXCLUDED.BillDate,
                        DueDate         = EXCLUDED.DueDate,
                        PrincipalAmount = EXCLUDED.PrincipalAmount,
                        InterestAmount  = EXCLUDED.InterestAmount,
                        TotalAmount     = EXCLUDED.TotalAmount,
                        BalanceAmount   = EXCLUDED.TotalAmount - jeevika_erp.SocMemberBill.PaidAmount,
                        IsDeleted       = FALSE
                    RETURNING BillId";

                decimal roundedPrin = Math.Round(model.PrincipalAmount, 0, MidpointRounding.AwayFromZero);
                decimal roundedInt  = Math.Round(model.InterestAmount, 0, MidpointRounding.AwayFromZero);
                decimal roundedTot  = Math.Round(model.TotalAmount > 0 ? model.TotalAmount : (roundedPrin + roundedInt), 0, MidpointRounding.AwayFromZero);

                cmd.Parameters.AddWithValue("@sid",      model.SocietyId);
                cmd.Parameters.AddWithValue("@fyid",     model.FYId);
                cmd.Parameters.AddWithValue("@bno",      model.BillNo ?? "MBIL-" + DateTime.Now.Ticks.ToString().Substring(10));
                cmd.Parameters.AddWithValue("@mid",      model.MemberId);
                cmd.Parameters.AddWithValue("@btid",     billTypeId > 0 ? (object)billTypeId : DBNull.Value);
                cmd.Parameters.AddWithValue("@btype",    model.BillType ?? "Maintenance");
                cmd.Parameters.AddWithValue("@period",   model.Period ?? "");
                cmd.Parameters.AddWithValue("@p1",       model.Particular1 ?? "");
                cmd.Parameters.AddWithValue("@p2",       model.Particular2 ?? "");
                cmd.Parameters.AddWithValue("@bdate",    model.BillDate.Date);
                cmd.Parameters.AddWithValue("@ddate",    model.DueDate.HasValue ? model.DueDate.Value.Date : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@prin",     roundedPrin);
                cmd.Parameters.AddWithValue("@interest", roundedInt);
                cmd.Parameters.AddWithValue("@total",    roundedTot);

                int billId = Convert.ToInt32(cmd.ExecuteScalar());

                // Save line items
                if (model.Items != null && model.Items.Count > 0)
                {
                    using var delCmd = conn.CreateCommand();
                    delCmd.Transaction = tx;
                    delCmd.CommandText = "DELETE FROM jeevika_erp.SocMemberBillItem WHERE BillId = @bid";
                    delCmd.Parameters.AddWithValue("@bid", billId);
                    delCmd.ExecuteNonQuery();

                    foreach (var item in model.Items)
                    {
                        using var itemCmd = conn.CreateCommand();
                        itemCmd.Transaction = tx;
                        itemCmd.CommandText = @"
                            INSERT INTO jeevika_erp.SocMemberBillItem (BillId, AccountCode, AccountName, Amount)
                            VALUES (@bid, @code, @name, @amt)";
                        itemCmd.Parameters.AddWithValue("@bid",  billId);
                        itemCmd.Parameters.AddWithValue("@code", (object?)item.AccountCode ?? "");
                        itemCmd.Parameters.AddWithValue("@name", (object?)item.AccountName ?? "");
                        itemCmd.Parameters.AddWithValue("@amt",  Math.Round(item.Amount, 0, MidpointRounding.AwayFromZero));
                        itemCmd.ExecuteNonQuery();

                        // 2-Way Sync to SocBillingMatrix
                        if (billTypeId > 0 && model.MemberId > 0)
                        {
                            string code = (item.AccountCode ?? "").Trim();
                            if (!string.IsNullOrEmpty(code) &&
                                !code.Equals("LIA-1032", StringComparison.OrdinalIgnoreCase) &&
                                !code.Equals("LIA-1033", StringComparison.OrdinalIgnoreCase) &&
                                !code.StartsWith("CGST", StringComparison.OrdinalIgnoreCase) &&
                                !code.StartsWith("SGST", StringComparison.OrdinalIgnoreCase))
                            {
                                using var syncCmd = conn.CreateCommand();
                                syncCmd.Transaction = tx;
                                syncCmd.CommandText = @"
                                    INSERT INTO jeevika_erp.SocBillingMatrix (SocietyId, BillTypeId, MemberId, AccountCode, Amount, UpdatedAt)
                                    VALUES (@socId, @btId, @memId, @code, @amt, NOW())
                                    ON CONFLICT (SocietyId, BillTypeId, MemberId, AccountCode)
                                    DO UPDATE SET Amount = EXCLUDED.Amount, UpdatedAt = NOW()";
                                syncCmd.Parameters.AddWithValue("@socId", model.SocietyId);
                                syncCmd.Parameters.AddWithValue("@btId",  billTypeId);
                                syncCmd.Parameters.AddWithValue("@memId", model.MemberId);
                                syncCmd.Parameters.AddWithValue("@code",  code);
                                syncCmd.Parameters.AddWithValue("@amt",   Math.Round(item.Amount, 0, MidpointRounding.AwayFromZero));
                                syncCmd.ExecuteNonQuery();
                            }
                        }
                    }
                }

                tx.Commit();
                return Ok(new { success = true, message = "Bill saved successfully.", billId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/member-bills/generate-batch ────────────────
        [HttpPost("generate-batch")]
        public IActionResult GenerateBatch([FromBody] GenerateBatchBillModel model)
        {
            if (model.SocietyId <= 0 || model.FYId <= 0)
                return BadRequest(new { success = false, message = "SocietyId and FYId are required." });

            NpgsqlTransaction? tx = null;
            try
            {
                using var conn = DbHelper.GetConn();

                // Validate BillDate against active FinancialYear
                using (var fyCheckCmd = conn.CreateCommand())
                {
                    fyCheckCmd.CommandText = "SELECT FYStart, FYEnd, FYLabel FROM jeevika_erp.FinancialYear WHERE FYId = @fyid LIMIT 1";
                    fyCheckCmd.Parameters.AddWithValue("@fyid", model.FYId);
                    using var rFy = fyCheckCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        var fyStart = Convert.ToDateTime(rFy["FYStart"]).Date;
                        var fyEnd = Convert.ToDateTime(rFy["FYEnd"]).Date;
                        var fyLabel = rFy["FYLabel"]?.ToString() ?? "";
                        var bDate = model.BillDate.Date;
                        if (bDate < fyStart || bDate > fyEnd)
                        {
                            return BadRequest(new { 
                                success = false, 
                                message = $"Batch Bill Date ({bDate:dd/MM/yyyy}) must fall within Financial Year {fyLabel} ({fyStart:dd/MM/yyyy} to {fyEnd:dd/MM/yyyy})." 
                            });
                        }
                    }
                }

                int targetSocietyId = model.SocietyId;

                // 1. Fetch active members for this society
                using var cmdM = conn.CreateCommand();
                cmdM.CommandText = @"
                    SELECT MemberId, MemCode, MemName, Wing, FlatNo, OpPrincipal, OpInterest
                    FROM jeevika_erp.SocMember
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                    ORDER BY Wing, FlatNo";
                cmdM.Parameters.AddWithValue("@sid", targetSocietyId);

                var members = new List<(int id, string code, string name, string wing, string flat, decimal opPrin, decimal opInt)>();
                using (var rM = cmdM.ExecuteReader())
                {
                    while (rM.Read())
                    {
                        members.Add((
                            Convert.ToInt32(rM["MemberId"]),
                            rM["MemCode"]?.ToString() ?? "",
                            rM["MemName"]?.ToString() ?? "",
                            rM["Wing"]?.ToString() ?? "",
                            rM["FlatNo"]?.ToString() ?? "",
                            rM["OpPrincipal"] != DBNull.Value ? Convert.ToDecimal(rM["OpPrincipal"]) : 0m,
                            rM["OpInterest"] != DBNull.Value ? Convert.ToDecimal(rM["OpInterest"]) : 0m
                        ));
                    }
                }

                // Apply member range filter by list order
                if (model.MemberFrom.HasValue || model.MemberTo.HasValue)
                {
                    int fromIdx = 0;
                    int toIdx = members.Count - 1;

                    if (model.MemberFrom.HasValue && model.MemberFrom.Value > 0)
                    {
                        int fIdx = members.FindIndex(m => m.id == model.MemberFrom.Value);
                        if (fIdx >= 0) fromIdx = fIdx;
                    }

                    if (model.MemberTo.HasValue && model.MemberTo.Value > 0)
                    {
                        int tIdx = members.FindIndex(m => m.id == model.MemberTo.Value);
                        if (tIdx >= 0) toIdx = tIdx;
                    }

                    if (fromIdx > toIdx)
                    {
                        var temp = fromIdx;
                        fromIdx = toIdx;
                        toIdx = temp;
                    }

                    members = members.Skip(fromIdx).Take(toIdx - fromIdx + 1).ToList();
                }

                if (members.Count == 0)
                    return BadRequest(new { success = false, message = "No active members found in selected range." });

                // 2. Fetch Bill Type dynamically
                string targetType = string.IsNullOrWhiteSpace(model.BillType) ? "Maintenance" : model.BillType.Trim();
                int billTypeId = ResolveOrCreateBillTypeId(conn, targetType, targetSocietyId, model.BillTypeId ?? 0);

                // 3. Fetch GST settings from SocietyInfo
                bool isGstApp = false;
                decimal cgstPct = 9m, sgstPct = 9m, exemptLimit = 7500m;
                string intDuesGST = "No";
                using (var socCmd = conn.CreateCommand())
                {
                    socCmd.CommandText = @"
                        SELECT GSTApplicable, CGSTPct, SGSTPct, ExemptLimit, IntDuesGST 
                        FROM jeevika_erp.SocietyInfo 
                        WHERE SocietyId = @sid OR (@sid > 0 AND SocietyId = 1) 
                        ORDER BY CASE WHEN SocietyId = @sid THEN 0 ELSE 1 END LIMIT 1";
                    socCmd.Parameters.AddWithValue("@sid", targetSocietyId);
                    using var rSoc = socCmd.ExecuteReader();
                    if (rSoc.Read())
                    {
                        var gObj = rSoc["GSTApplicable"];
                        if (gObj != null && gObj != DBNull.Value)
                        {
                            if (gObj is bool b) isGstApp = b;
                            else if (bool.TryParse(gObj.ToString(), out bool pb)) isGstApp = pb;
                        }
                        if (rSoc["CGSTPct"] != DBNull.Value) cgstPct = Convert.ToDecimal(rSoc["CGSTPct"]);
                        if (rSoc["SGSTPct"] != DBNull.Value) sgstPct = Convert.ToDecimal(rSoc["SGSTPct"]);
                        if (rSoc["ExemptLimit"] != DBNull.Value) exemptLimit = Convert.ToDecimal(rSoc["ExemptLimit"]);
                        intDuesGST = rSoc["IntDuesGST"]?.ToString() ?? "No";
                    }
                }

                // 4. Fetch configured heads for this bill type
                var configuredHeads = new List<(string code, string name, bool gstApp, bool gstEx)>();
                if (billTypeId > 0)
                {
                    using var headCmd = conn.CreateCommand();
                    headCmd.CommandText = @"
                        SELECT AccountCode, AccountName, GSTApplicable, GSTExempted
                        FROM jeevika_erp.SocBillTypeHead
                        WHERE BillTypeId = @btId
                        ORDER BY SrNo ASC";
                    headCmd.Parameters.AddWithValue("@btId", billTypeId);
                    using var rH = headCmd.ExecuteReader();
                    while (rH.Read())
                    {
                        var c = rH["AccountCode"]?.ToString()?.Trim() ?? "";
                        var n = rH["AccountName"]?.ToString()?.Trim() ?? "";
                        if (!string.IsNullOrWhiteSpace(n))
                        {
                            configuredHeads.Add((c, n, 
                                rH["GSTApplicable"] != DBNull.Value && Convert.ToBoolean(rH["GSTApplicable"]),
                                rH["GSTExempted"] != DBNull.Value && Convert.ToBoolean(rH["GSTExempted"])
                            ));
                        }
                    }
                }

                if (configuredHeads.Count == 0)
                {
                    using var accCmd = conn.CreateCommand();
                    accCmd.CommandText = @"
                        SELECT AccCode, AccName 
                        FROM jeevika_erp.SocAccount 
                        WHERE (SocietyId = @sid OR (@sid > 0 AND SocietyId = 1)) AND IsDeleted = FALSE AND GrpMainId = 3 
                        ORDER BY AccName ASC";
                    accCmd.Parameters.AddWithValue("@sid", targetSocietyId);
                    using var rA = accCmd.ExecuteReader();
                    while (rA.Read())
                    {
                        var c = rA["AccCode"]?.ToString()?.Trim() ?? "";
                        var n = rA["AccName"]?.ToString()?.Trim() ?? "";
                        if (!string.IsNullOrWhiteSpace(n))
                        {
                            configuredHeads.Add((c, n, false, false));
                        }
                    }
                }

                // 5. Fetch amounts from SocBillingMatrix
                var matrixMap = new Dictionary<int, Dictionary<string, decimal>>();
                if (billTypeId > 0)
                {
                    using var matCmd = conn.CreateCommand();
                    matCmd.CommandText = @"
                        SELECT MemberId, AccountCode, Amount
                        FROM jeevika_erp.SocBillingMatrix
                        WHERE (SocietyId = @sid OR (@sid > 0 AND SocietyId = 1)) AND BillTypeId = @btId";
                    matCmd.Parameters.AddWithValue("@sid",  targetSocietyId);
                    matCmd.Parameters.AddWithValue("@btId", billTypeId);
                    using var rMat = matCmd.ExecuteReader();
                    while (rMat.Read())
                    {
                        int mId = Convert.ToInt32(rMat["MemberId"]);
                        string code = rMat["AccountCode"]?.ToString()?.Trim() ?? "";
                        decimal amt = rMat["Amount"] != DBNull.Value ? Convert.ToDecimal(rMat["Amount"]) : 0m;
                        if (!matrixMap.ContainsKey(mId)) matrixMap[mId] = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
                        matrixMap[mId][code] = amt;
                    }
                }

                // 6. Sequence numbering with custom StartNo format support
                string startNoStr = !string.IsNullOrWhiteSpace(model.StartNo) ? model.StartNo.Trim() : "";
                string prefix = "MBIL/25-26/";
                int startNum = 1;
                int padLen = 2;

                if (!string.IsNullOrWhiteSpace(startNoStr))
                {
                    var match = System.Text.RegularExpressions.Regex.Match(startNoStr, @"^(.*?)(\d+)$");
                    if (match.Success)
                    {
                        prefix = match.Groups[1].Value;
                        padLen = match.Groups[2].Value.Length;
                        startNum = int.Parse(match.Groups[2].Value);
                    }
                    else
                    {
                        prefix = startNoStr;
                    }
                }
                else
                {
                    using var countCmd = conn.CreateCommand();
                    countCmd.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocMemberBill WHERE (SocietyId = @sid OR (@sid > 0 AND SocietyId = 1)) AND FYId = @fyid";
                    countCmd.Parameters.AddWithValue("@sid",  targetSocietyId);
                    countCmd.Parameters.AddWithValue("@fyid", model.FYId);
                    int billSeq = Convert.ToInt32(countCmd.ExecuteScalar() ?? 0);
                    startNum = billSeq + 1;
                }

                int currentBillNum = startNum - 1;
                int generatedCount = 0;
                var billDate = model.BillDate.Date;
                var dueDate  = model.DueDate.HasValue ? model.DueDate.Value.Date : billDate.AddDays(15);
                string periodStr = !string.IsNullOrWhiteSpace(model.Period) ? model.Period : billDate.ToString("MMMM yyyy");
                string part1Str  = !string.IsNullOrWhiteSpace(model.Particular1) ? model.Particular1 : $"{targetType} Charges for {periodStr}";

                tx = conn.BeginTransaction();

                foreach (var m in members)
                {
                    decimal principal = 0m;
                    decimal gstAppTotal = 0m;
                    decimal gstExmTotal = 0m;
                    decimal interest = 0m;
                    var memberItems = new List<(string code, string name, decimal amount)>();

                    if (matrixMap.ContainsKey(m.id))
                    {
                        var userAmounts = matrixMap[m.id];

                        // Exact lookup for Interest in Billing Master Matrix
                        var intKey = userAmounts.Keys.FirstOrDefault(k => 
                            k.Equals("INC-1008", StringComparison.OrdinalIgnoreCase) || 
                            k.Equals("Interest", StringComparison.OrdinalIgnoreCase) || 
                            k.Equals("INTEREST", StringComparison.OrdinalIgnoreCase) ||
                            k.Equals("Int", StringComparison.OrdinalIgnoreCase));

                        if (!string.IsNullOrEmpty(intKey))
                        {
                            interest = userAmounts[intKey];
                        }

                        if (configuredHeads.Count > 0)
                        {
                            foreach (var head in configuredHeads)
                            {
                                var hName = head.name;
                                var hCode = head.code;

                                if (hName.Equals("Interest", StringComparison.OrdinalIgnoreCase) || hCode.Equals("INC-1008", StringComparison.OrdinalIgnoreCase))
                                {
                                    continue;
                                }
                                if (hName.Equals("CGST", StringComparison.OrdinalIgnoreCase) || hName.Equals("SGST", StringComparison.OrdinalIgnoreCase) ||
                                    hName.Equals("Principal", StringComparison.OrdinalIgnoreCase) || hName.Equals("Total Heads", StringComparison.OrdinalIgnoreCase))
                                {
                                    continue;
                                }

                                decimal headAmt = 0m;
                                if (userAmounts.ContainsKey(hCode)) headAmt = userAmounts[hCode];
                                else if (userAmounts.ContainsKey(hName)) headAmt = userAmounts[hName];

                                if (headAmt > 0)
                                {
                                    principal += headAmt;
                                    memberItems.Add((string.IsNullOrEmpty(hCode) ? hName : hCode, hName, headAmt));
                                    if (isGstApp)
                                    {
                                        if (head.gstApp) gstAppTotal += headAmt;
                                        else if (head.gstEx) gstExmTotal += headAmt;
                                    }
                                }
                            }
                        }
                        else
                        {
                            // Fallback if no configured heads in master
                            var seenCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            foreach (var kv in userAmounts)
                            {
                                var k = kv.Key;
                                var amt = kv.Value;
                                if (amt <= 0 || seenCodes.Contains(k)) continue;

                                if (k.Equals("Interest", StringComparison.OrdinalIgnoreCase) || k.Equals("INC-1008", StringComparison.OrdinalIgnoreCase))
                                {
                                    interest = amt;
                                }
                                else if (!k.Equals("CGST", StringComparison.OrdinalIgnoreCase) && !k.Equals("SGST", StringComparison.OrdinalIgnoreCase) &&
                                         !k.Equals("Principal", StringComparison.OrdinalIgnoreCase) && !k.Equals("Total Heads", StringComparison.OrdinalIgnoreCase) &&
                                         !k.Equals("LIA-1032", StringComparison.OrdinalIgnoreCase) && !k.Equals("LIA-1033", StringComparison.OrdinalIgnoreCase))
                                {
                                    principal += amt;
                                    memberItems.Add((k, k, amt));
                                    if (isGstApp) gstAppTotal += amt;
                                }
                                seenCodes.Add(k);
                            }
                        }
                    }

                    // Fallback to opening principal if no matrix charges
                    if (principal <= 0 && m.opPrin > 0)
                    {
                        principal = m.opPrin;
                    }

                    if (principal <= 0 && interest <= 0)
                    {
                        continue; // skip members with 0 charge
                    }

                    principal = Math.Round(principal, 0, MidpointRounding.AwayFromZero);
                    interest  = Math.Round(interest, 0, MidpointRounding.AwayFromZero);

                    // Compute GST if applicable based on the 7,500 threshold:
                    // If (GST Applicable + GST Exempt) > 7500 -> Both are taxed
                    // If (GST Applicable + GST Exempt) <= 7500 -> Only GST Applicable is taxed
                    decimal cgstAmt = 0m;
                    decimal sgstAmt = 0m;
                    if (isGstApp)
                    {
                        decimal taxableBase = 0m;
                        if ((gstAppTotal + gstExmTotal) > exemptLimit)
                        {
                            taxableBase = gstAppTotal + gstExmTotal;
                        }
                        else
                        {
                            taxableBase = gstAppTotal;
                        }

                        if (taxableBase > 0)
                        {
                            cgstAmt = Math.Round(taxableBase * (cgstPct / 100m), 0, MidpointRounding.AwayFromZero);
                            sgstAmt = Math.Round(taxableBase * (sgstPct / 100m), 0, MidpointRounding.AwayFromZero);
                        }

                        if (intDuesGST.Equals("Yes", StringComparison.OrdinalIgnoreCase) && interest > 0)
                        {
                            cgstAmt += Math.Round(interest * (cgstPct / 100m), 0, MidpointRounding.AwayFromZero);
                            sgstAmt += Math.Round(interest * (sgstPct / 100m), 0, MidpointRounding.AwayFromZero);
                        }
                    }

                    if (cgstAmt > 0) memberItems.Add(("LIA-1032", $"CGST {cgstPct}%", cgstAmt));
                    if (sgstAmt > 0) memberItems.Add(("LIA-1033", $"SGST {sgstPct}%", sgstAmt));

                    // Combined Principal includes GST: [Principal Heads + CGST + SGST]
                    decimal billPrincipal = Math.Round(principal + cgstAmt + sgstAmt, 0, MidpointRounding.AwayFromZero);
                    decimal total = Math.Round(billPrincipal + interest, 0, MidpointRounding.AwayFromZero);
                    currentBillNum++;
                    string billNo = $"{prefix}{currentBillNum.ToString().PadLeft(padLen, '0')}";

                    using var insCmd = conn.CreateCommand();
                    insCmd.Transaction = tx;
                    insCmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocMemberBill
                            (SocietyId, FYId, BillNo, MemberId, BillTypeId, BillType, Period, Particular1, Particular2,
                             BillDate, DueDate, PrincipalAmount, InterestAmount, TotalAmount, PaidAmount, BalanceAmount, Status, CreatedAt)
                        VALUES
                            (@sid, @fyid, @bno, @mid, @btid, @btype, @period, @p1, '',
                             @bdate, @ddate, @prin, @interest, @total, 0, @total, 'Unpaid', NOW())
                        ON CONFLICT (SocietyId, FYId, BillNo) DO UPDATE
                        SET MemberId        = EXCLUDED.MemberId,
                            BillTypeId      = EXCLUDED.BillTypeId,
                            BillType        = EXCLUDED.BillType,
                            Period          = EXCLUDED.Period,
                            Particular1     = EXCLUDED.Particular1,
                            BillDate        = EXCLUDED.BillDate,
                            DueDate         = EXCLUDED.DueDate,
                            PrincipalAmount = EXCLUDED.PrincipalAmount,
                            InterestAmount  = EXCLUDED.InterestAmount,
                            TotalAmount     = EXCLUDED.TotalAmount,
                            BalanceAmount   = EXCLUDED.TotalAmount - jeevika_erp.SocMemberBill.PaidAmount,
                            IsDeleted       = FALSE
                        RETURNING BillId";

                    insCmd.Parameters.AddWithValue("@sid",      model.SocietyId);
                    insCmd.Parameters.AddWithValue("@fyid",     model.FYId);
                    insCmd.Parameters.AddWithValue("@bno",      billNo);
                    insCmd.Parameters.AddWithValue("@mid",      m.id);
                    insCmd.Parameters.AddWithValue("@btid",     billTypeId > 0 ? (object)billTypeId : DBNull.Value);
                    insCmd.Parameters.AddWithValue("@btype",    targetType);
                    insCmd.Parameters.AddWithValue("@period",   periodStr);
                    insCmd.Parameters.AddWithValue("@p1",       part1Str);
                    insCmd.Parameters.AddWithValue("@bdate",    billDate);
                    insCmd.Parameters.AddWithValue("@ddate",    dueDate);
                    insCmd.Parameters.AddWithValue("@prin",     billPrincipal);
                    insCmd.Parameters.AddWithValue("@interest", interest);
                    insCmd.Parameters.AddWithValue("@total",    total);

                    var bIdObj = insCmd.ExecuteScalar();
                    if (bIdObj != null && bIdObj != DBNull.Value)
                    {
                        int newBillId = Convert.ToInt32(bIdObj);

                        // Delete old line items first to prevent duplicates on re-generation
                        using var delItemCmd = conn.CreateCommand();
                        delItemCmd.Transaction = tx;
                        delItemCmd.CommandText = "DELETE FROM jeevika_erp.SocMemberBillItem WHERE BillId = @bid";
                        delItemCmd.Parameters.AddWithValue("@bid", newBillId);
                        delItemCmd.ExecuteNonQuery();

                        // Add Interest as a line item (INC-1008) if applicable
                        if (interest > 0)
                            memberItems.Add(("INC-1008", "Interest", interest));

                        // Re-insert all line items fresh
                        foreach (var it in memberItems)
                        {
                            using var insItemCmd = conn.CreateCommand();
                            insItemCmd.Transaction = tx;
                            insItemCmd.CommandText = @"
                                INSERT INTO jeevika_erp.SocMemberBillItem (BillId, AccountCode, AccountName, Amount)
                                VALUES (@bid, @code, @name, @amt)";
                            insItemCmd.Parameters.AddWithValue("@bid",  newBillId);
                            insItemCmd.Parameters.AddWithValue("@code", it.code);
                            insItemCmd.Parameters.AddWithValue("@name", it.name);
                            insItemCmd.Parameters.AddWithValue("@amt",  it.amount);
                            insItemCmd.ExecuteNonQuery();
                        }
                    }

                    generatedCount++;
                }

                tx.Commit();
                return Ok(new
                {
                    success = true,
                    message = $"Generated {generatedCount} bills successfully for {periodStr}.",
                    count = generatedCount
                });
            }
            catch (Exception ex)
            {
                try { tx?.Rollback(); } catch { }
                Console.WriteLine($"[GenerateBatch Error] {ex}");
                return StatusCode(500, new { success = false, message = ex.ToString() });
            }
            finally
            {
                tx?.Dispose();
            }
        }

        // ── DELETE /api/member-bills/{id} ─────────────────────────
        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "UPDATE jeevika_erp.SocMemberBill SET IsDeleted = TRUE WHERE BillId = @id AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0) return NotFound(new { success = false, message = "Bill not found." });

                return Ok(new { success = true, message = "Bill deleted." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/member-bills/multi-delete ───────────────────
        [HttpPost("multi-delete")]
        public IActionResult MultiDelete([FromBody] MultiDeleteBillModel model)
        {
            if (model.SocietyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            if (string.IsNullOrWhiteSpace(model.FromBillNo) || string.IsNullOrWhiteSpace(model.ToBillNo))
                return BadRequest(new { success = false, message = "FromBillNo and ToBillNo are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                string fromNo = model.FromBillNo.Trim();
                string toNo = model.ToBillNo.Trim();

                var matchFrom = System.Text.RegularExpressions.Regex.Match(fromNo, @"(\d+)");
                var matchTo   = System.Text.RegularExpressions.Regex.Match(toNo, @"(\d+)");

                int rows = 0;
                if (matchFrom.Success && matchTo.Success)
                {
                    int numFrom = int.Parse(matchFrom.Value);
                    int numTo   = int.Parse(matchTo.Value);

                    if (numFrom > numTo)
                    {
                        var temp = numFrom; numFrom = numTo; numTo = temp;
                    }

                    // Build candidate bill numbers for both MBIL and MINV prefixes across formats
                    var billNumbers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    var prefixes = new[] { "MBIL/2025-26/", "MBIL/25-26/", "MINV/2025-26/", "MINV/25-26/", "MBIL-", "MINV-", "BILL-", "MBIL/", "MINV/" };

                    for (int i = numFrom; i <= numTo; i++)
                    {
                        billNumbers.Add(i.ToString());
                        billNumbers.Add(i.ToString().PadLeft(2, '0'));
                        billNumbers.Add(i.ToString().PadLeft(3, '0'));
                        billNumbers.Add(i.ToString().PadLeft(4, '0'));

                        foreach (var pfx in prefixes)
                        {
                            billNumbers.Add($"{pfx}{i}");
                            billNumbers.Add($"{pfx}{i.ToString().PadLeft(2, '0')}");
                            billNumbers.Add($"{pfx}{i.ToString().PadLeft(3, '0')}");
                            billNumbers.Add($"{pfx}{i.ToString().PadLeft(4, '0')}");
                        }
                    }

                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocMemberBill
                        SET IsDeleted = TRUE
                        WHERE (SocietyId = @sid OR (@sid <= 0 AND SocietyId > 0))
                          AND (FYId = @fyid OR @fyid <= 0)
                          AND IsDeleted = FALSE
                          AND (
                            BillNo = ANY(@bNos)
                            OR (BillNo ~ '[0-9]+$' AND (SUBSTRING(BillNo FROM '([0-9]+)$'))::int >= @numFrom AND (SUBSTRING(BillNo FROM '([0-9]+)$'))::int <= @numTo)
                            OR (BillNo >= @fromStr AND BillNo <= @toStr)
                          )";
                    cmd.Parameters.AddWithValue("@sid", model.SocietyId);
                    cmd.Parameters.AddWithValue("@fyid", model.FYId);
                    cmd.Parameters.AddWithValue("@bNos", billNumbers.ToArray());
                    cmd.Parameters.AddWithValue("@numFrom", numFrom);
                    cmd.Parameters.AddWithValue("@numTo", numTo);
                    cmd.Parameters.AddWithValue("@fromStr", fromNo);
                    cmd.Parameters.AddWithValue("@toStr", toNo);

                    rows = cmd.ExecuteNonQuery();
                }
                else
                {
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocMemberBill
                        SET IsDeleted = TRUE
                        WHERE (SocietyId = @sid OR (@sid <= 0 AND SocietyId > 0))
                          AND (FYId = @fyid OR @fyid <= 0)
                          AND IsDeleted = FALSE
                          AND BillNo >= @fromStr AND BillNo <= @toStr";
                    cmd.Parameters.AddWithValue("@sid", model.SocietyId);
                    cmd.Parameters.AddWithValue("@fyid", model.FYId);
                    cmd.Parameters.AddWithValue("@fromStr", fromNo);
                    cmd.Parameters.AddWithValue("@toStr", toNo);

                    rows = cmd.ExecuteNonQuery();
                }

                return Ok(new { success = true, message = $"Successfully deleted {rows} bill(s) in range.", count = rows });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class CreateMemberBillModel
    {
        public int       SocietyId       { get; set; }
        public int       FYId            { get; set; }
        public string?   BillNo          { get; set; }
        public int       BillTypeId      { get; set; }
        public string?   BillType        { get; set; } = "Maintenance";
        public string?   Period          { get; set; }
        public string?   Particular1     { get; set; }
        public string?   Particular2     { get; set; }
        public int       MemberId        { get; set; }
        public string?   MemberName      { get; set; }
        public DateTime  BillDate        { get; set; } = DateTime.Today;
        public DateTime? DueDate         { get; set; }
        public decimal   PrincipalAmount { get; set; }
        public decimal   InterestAmount  { get; set; }
        public decimal   TotalAmount     { get; set; }
        public List<BillItemModel>? Items { get; set; }
    }

    public class BillItemModel
    {
        public string? AccountCode { get; set; }
        public string? AccountName { get; set; }
        public decimal Amount      { get; set; }
    }

    public class GenerateBatchBillModel
    {
        public int       SocietyId   { get; set; }
        public int       FYId        { get; set; }
        public int?      BillTypeId  { get; set; }
        public string?   BillType    { get; set; } = "Maintenance";
        public string?   StartNo     { get; set; }
        public string?   Period      { get; set; }
        public string?   Particular1 { get; set; }
        public DateTime  BillDate    { get; set; } = DateTime.Today;
        public DateTime? DueDate     { get; set; }
        public int?      MemberFrom  { get; set; }
        public int?      MemberTo    { get; set; }
    }

    public class MultiDeleteBillModel
    {
        public int     SocietyId  { get; set; }
        public int     FYId       { get; set; }
        public string? FromBillNo { get; set; }
        public string? ToBillNo   { get; set; }
    }
}
