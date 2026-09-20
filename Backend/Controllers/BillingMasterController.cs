// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — BillingMasterController
// RESTful API for Billing Master Matrix Adjustments & Settings
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/billing-master")]
    [AllowAnonymous]
    public class BillingMasterController : ControllerBase
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

        private static int GetOrCreateBillTypeId(NpgsqlConnection conn, string billType, int societyId)
        {
            if (string.IsNullOrWhiteSpace(billType)) billType = "Maintenance";
            string cleanType = System.Text.RegularExpressions.Regex.Replace(billType.Trim(), @"\s+", " ");
            bool isMajor = cleanType.IndexOf("major", StringComparison.OrdinalIgnoreCase) >= 0;
            bool isMaint = cleanType.IndexOf("maint", StringComparison.OrdinalIgnoreCase) >= 0;

            int billTypeId = 0;
            using (var btCmd = conn.CreateCommand())
            {
                btCmd.CommandText = @"
                    SELECT BillTypeId FROM jeevika_erp.SocBillType 
                    WHERE (SocietyId = @socId OR (@socId > 0 AND SocietyId = 1) OR (@socId <= 0 AND SocietyId > 0)) 
                      AND (
                          REGEXP_REPLACE(LOWER(TRIM(BillTypeName)), '\s+', ' ', 'g') = LOWER(@cleanType)
                          OR LOWER(TRIM(BillTypeCode)) = LOWER(@cleanType)
                          OR LOWER(TRIM(BillTypeName)) ILIKE '%' || LOWER(@cleanType) || '%'
                          OR LOWER(@cleanType) ILIKE '%' || LOWER(TRIM(BillTypeName)) || '%'
                          OR (@isMajor = TRUE AND (LOWER(BillTypeName) ILIKE '%major%' OR LOWER(BillTypeCode) ILIKE '%major%'))
                          OR (@isMaint = TRUE AND (LOWER(BillTypeName) ILIKE '%maint%' OR LOWER(BillTypeCode) ILIKE '%maint%'))
                      ) 
                    ORDER BY 
                        CASE WHEN SocietyId = @socId THEN 0 ELSE 1 END,
                        CASE WHEN REGEXP_REPLACE(LOWER(TRIM(BillTypeName)), '\s+', ' ', 'g') = LOWER(@cleanType) THEN 0 ELSE 1 END,
                        BillTypeId ASC 
                    LIMIT 1";
                btCmd.Parameters.AddWithValue("@socId", societyId > 0 ? societyId : 1);
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
                catch { }
            }

            return billTypeId;
        }

        // ── GET /api/billing-master?billType=Maintenance ──────────
        [HttpGet]
        public IActionResult GetMatrix([FromQuery] string billType = "Maintenance", [FromQuery] int societyId = 1, [FromQuery] int billTypeId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                if (billTypeId <= 0)
                {
                    billTypeId = GetOrCreateBillTypeId(conn, billType, societyId);
                }

                if (billTypeId == 0)
                {
                    return Ok(new { success = true, data = new List<object>() });
                }

                // Query all members via LEFT JOIN so matrix is never missing members for any bill type
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT m.MemberId, m.MemCode, m.FlatNo, m.MemName, m.Wing, m.AreaSqft AS Sqft,
                           COALESCE(ob.OpPrincipal, m.OpPrincipal, 0) AS OpPrincipal,
                           COALESCE(ob.OpInterest, m.OpInterest, 0) AS OpInterest,
                           bm.AccountCode, a.AccName AS MasterAccName, bm.Amount
                    FROM jeevika_erp.SocMember m
                    LEFT JOIN jeevika_erp.SocMemberOpBalance ob 
                           ON m.MemberId = ob.MemberId AND ob.SocietyId = @socId AND (LOWER(ob.BillType) = LOWER(@btype) OR LOWER(ob.BillType) = LOWER(@bname))
                    LEFT JOIN jeevika_erp.SocBillingMatrix bm 
                           ON bm.MemberId = m.MemberId AND (bm.SocietyId = @socId OR (@socId > 0 AND bm.SocietyId = 1)) AND bm.BillTypeId = @btId
                    LEFT JOIN jeevika_erp.SocAccount a
                           ON bm.AccountCode = a.AccCode AND (a.SocietyId = @socId OR a.SocietyId = 1)
                    WHERE (m.SocietyId = @socId OR (@socId > 0 AND m.SocietyId = 1)) AND m.IsDeleted = FALSE
                    ORDER BY m.MemCode ASC, m.FlatNo ASC";
                cmd.Parameters.AddWithValue("@socId", societyId);
                cmd.Parameters.AddWithValue("@btId", billTypeId);
                cmd.Parameters.AddWithValue("@btype", (billType ?? "").Trim());
                cmd.Parameters.AddWithValue("@bname", (billType ?? "").Trim());

                var map = new Dictionary<int, MemberMatrixRow>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    var memId = r["MemberId"] != DBNull.Value ? Convert.ToInt32(r["MemberId"]) : 0;
                    if (memId == 0) continue;

                    if (!map.ContainsKey(memId))
                    {
                        var opP = r["OpPrincipal"] != DBNull.Value ? Convert.ToDecimal(r["OpPrincipal"]) : 0m;
                        var isCr = opP < 0;
                        map[memId] = new MemberMatrixRow
                        {
                            MemberId = memId,
                            MemNo    = GetStringSafe(r, "MemCode"),
                            FlatNo   = GetStringSafe(r, "FlatNo"),
                            Name     = GetStringSafe(r, "MemName"),
                            Wing     = GetStringSafe(r, "Wing"),
                            Sqft     = r["Sqft"] != DBNull.Value ? Convert.ToDecimal(r["Sqft"]) : 0,
                            Op_Prin  = opP,
                            OpDrCr   = isCr ? "Cr" : "Dr",
                            Op_Int   = r["OpInterest"] != DBNull.Value ? Convert.ToDecimal(r["OpInterest"]) : 0,
                            Amounts  = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase)
                        };
                    }

                    var accCode = GetStringSafe(r, "AccountCode");
                    var masterName = GetStringSafe(r, "MasterAccName");
                    if (!string.IsNullOrWhiteSpace(accCode))
                    {
                        var amt = r["Amount"] != DBNull.Value ? Convert.ToDecimal(r["Amount"]) : 0;
                        map[memId].Amounts[accCode] = amt;
                        if (!string.IsNullOrWhiteSpace(masterName))
                        {
                            map[memId].Amounts[masterName] = amt;
                        }
                    }
                }

                return Ok(new { success = true, data = map.Values.ToList() });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/billing-master?billType=Maintenance ─────────
        [HttpPost]
        public IActionResult SaveMatrix([FromBody] List<SaveMatrixRowModel> rows, [FromQuery] string billType = "Maintenance", [FromQuery] int societyId = 1, [FromQuery] int billTypeId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                if (billTypeId <= 0)
                {
                    billTypeId = GetOrCreateBillTypeId(conn, billType, societyId);
                }

                if (billTypeId == 0)
                {
                    return BadRequest(new { success = false, message = $"Bill type '{billType}' could not be initialized." });
                }

                foreach (var row in rows)
                {
                    int memberId = row.MemberId;
                    if (memberId == 0 && !string.IsNullOrWhiteSpace(row.MemNo))
                    {
                        // Get MemberId from MemCode or FlatNo
                        using (var memCmd = conn.CreateCommand())
                        {
                            memCmd.CommandText = @"SELECT MemberId FROM jeevika_erp.SocMember 
                                WHERE (SocietyId = @socId OR SocietyId = 1) 
                                AND (LOWER(MemCode) = LOWER(@code) OR LOWER(FlatNo) = LOWER(@code) OR MemberId::text = @code) 
                                LIMIT 1";
                            memCmd.Parameters.AddWithValue("@socId", societyId > 0 ? societyId : 1);
                            memCmd.Parameters.AddWithValue("@code", row.MemNo.Trim());
                            var obj = memCmd.ExecuteScalar();
                            if (obj != null && obj != DBNull.Value) memberId = Convert.ToInt32(obj);
                        }
                    }

                    if (memberId == 0) continue;

                    if (row.Op_Int > 0)
                    {
                        if (row.Amounts == null) row.Amounts = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
                        if (!row.Amounts.ContainsKey("INC-1008") && !row.Amounts.ContainsKey("Interest") && !row.Amounts.ContainsKey("INTEREST"))
                        {
                            row.Amounts["INC-1008"] = row.Op_Int;
                        }
                    }

                    if (row.Amounts != null)
                    {
                        foreach (var kv in row.Amounts)
                        {
                            string code = kv.Key.Trim();
                            if (string.IsNullOrWhiteSpace(code)) continue;

                            using var insCmd = conn.CreateCommand();
                            insCmd.CommandText = @"
                                INSERT INTO jeevika_erp.SocBillingMatrix (SocietyId, BillTypeId, MemberId, AccountCode, Amount, UpdatedAt)
                                VALUES (@socId, @btId, @memId, @code, @amt, NOW())
                                ON CONFLICT (SocietyId, BillTypeId, MemberId, AccountCode)
                                DO UPDATE SET Amount = EXCLUDED.Amount, UpdatedAt = NOW()";
                            insCmd.Parameters.AddWithValue("@socId", societyId > 0 ? societyId : 1);
                            insCmd.Parameters.AddWithValue("@btId", billTypeId);
                            insCmd.Parameters.AddWithValue("@memId", memberId);
                            insCmd.Parameters.AddWithValue("@code", code);
                            insCmd.Parameters.AddWithValue("@amt", kv.Value);
                            insCmd.ExecuteNonQuery();
                        }
                    }
                }

                return Ok(new { success = true, message = "Matrix saved successfully!" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/billing-master/bulk-import ───────────────────
        [HttpPost("bulk-import")]
        public IActionResult BulkImport([FromBody] BulkImportRequestModel model)
        {
            if (model == null || model.Rows == null || model.Rows.Count == 0)
                return BadRequest(new { success = false, message = "No rows provided for import." });

            int societyId = model.SocietyId > 0 ? model.SocietyId : 1;
            int billTypeId = model.BillTypeId;

            try
            {
                using var conn = DbHelper.GetConn();
                if (billTypeId <= 0)
                {
                    billTypeId = GetOrCreateBillTypeId(conn, model.BillType ?? "Maintenance", societyId);
                }

                if (billTypeId <= 0)
                {
                    return BadRequest(new { success = false, message = "Invalid or unresolvable Bill Type." });
                }

                // 1. Fetch valid configured heads for this BillType to avoid polluting unrelated accounts
                var validHeads = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); // Name/Code -> AccountCode
                using (var headCmd = conn.CreateCommand())
                {
                    headCmd.CommandText = @"
                        SELECT h.AccountCode, h.AccountName, a.AccCode AS MasterCode, a.AccName AS MasterName
                        FROM jeevika_erp.SocBillTypeHead h
                        LEFT JOIN jeevika_erp.SocAccount a ON h.AccountId = a.AccountId
                        WHERE h.BillTypeId = @btId";
                    headCmd.Parameters.AddWithValue("@btId", billTypeId);
                    using var hr = headCmd.ExecuteReader();
                    while (hr.Read())
                    {
                        var code = GetStringSafe(hr, "AccountCode");
                        if (string.IsNullOrEmpty(code)) code = GetStringSafe(hr, "MasterCode");

                        var name = GetStringSafe(hr, "AccountName");
                        if (string.IsNullOrEmpty(name)) name = GetStringSafe(hr, "MasterName");

                        if (!string.IsNullOrWhiteSpace(code))
                        {
                            validHeads[code] = code;
                            if (!string.IsNullOrWhiteSpace(name))
                            {
                                validHeads[name] = code;
                            }
                        }
                    }
                }

                // Also support standard calculated/system accounts if present
                validHeads["INC-1008"] = "INC-1008"; // Interest
                validHeads["Interest"] = "INC-1008";
                validHeads["LIA-1032"] = "LIA-1032"; // CGST
                validHeads["CGST"] = "LIA-1032";
                validHeads["LIA-1033"] = "LIA-1033"; // SGST
                validHeads["SGST"] = "LIA-1033";

                // 2. Pre-fetch all active members for this society into lookup
                var memberLookup = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                using (var memCmd = conn.CreateCommand())
                {
                    memCmd.CommandText = @"
                        SELECT MemberId, MemCode, FlatNo, Wing 
                        FROM jeevika_erp.SocMember 
                        WHERE (SocietyId = @socId OR SocietyId = 1) AND IsDeleted = FALSE";
                    memCmd.Parameters.AddWithValue("@socId", societyId);
                    using var mr = memCmd.ExecuteReader();
                    while (mr.Read())
                    {
                        int mid = Convert.ToInt32(mr["MemberId"]);
                        var mCode = GetStringSafe(mr, "MemCode").Trim();
                        var flat = GetStringSafe(mr, "FlatNo").Trim();
                        var wing = GetStringSafe(mr, "Wing").Trim();

                        if (!string.IsNullOrEmpty(mCode)) memberLookup[mCode] = mid;
                        if (!string.IsNullOrEmpty(flat)) memberLookup[flat] = mid;
                        if (!string.IsNullOrEmpty(wing) && !string.IsNullOrEmpty(flat)) memberLookup[$"{wing}-{flat}"] = mid;
                        memberLookup[mid.ToString()] = mid;
                    }
                }

                // 3. Begin atomic transaction for all rows
                using var tx = conn.BeginTransaction();
                int inserted = 0;
                int updated = 0;
                int skipped = 0;
                var errors = new List<string>();

                for (int i = 0; i < model.Rows.Count; i++)
                {
                    var row = model.Rows[i];
                    int memberId = row.MemberId;
                    string lookupKey = (row.MemberCode ?? row.MemNo ?? "").Trim();

                    if (memberId <= 0 && !string.IsNullOrEmpty(lookupKey) && memberLookup.ContainsKey(lookupKey))
                    {
                        memberId = memberLookup[lookupKey];
                    }

                    if (memberId <= 0)
                    {
                        skipped++;
                        errors.Add($"Row {i + 1}: Member '{lookupKey}' could not be resolved for Society {societyId}.");
                        continue;
                    }

                    if (row.Amounts == null || row.Amounts.Count == 0)
                    {
                        skipped++;
                        continue;
                    }

                    foreach (var kv in row.Amounts)
                    {
                        string headKey = kv.Key.Trim();
                        decimal amt = kv.Value;

                        // Resolve headKey to actual AccountCode
                        string? targetAccCode = null;
                        if (validHeads.ContainsKey(headKey))
                        {
                            targetAccCode = validHeads[headKey];
                        }
                        else
                        {
                            // Strip any bracketed code, e.g. "Maintenance [INC-1001]"
                            var match = System.Text.RegularExpressions.Regex.Match(headKey, @"\[([^\]]+)\]");
                            if (match.Success && validHeads.ContainsKey(match.Groups[1].Value.Trim()))
                            {
                                targetAccCode = validHeads[match.Groups[1].Value.Trim()];
                            }
                        }

                        if (string.IsNullOrEmpty(targetAccCode))
                        {
                            // Skip non-head columns (like 'Principal', 'Total Heads', 'Carpet Sq Ft')
                            continue;
                        }

                        // Check if record exists for insert vs update count
                        bool exists = false;
                        using (var checkCmd = conn.CreateCommand())
                        {
                            checkCmd.Transaction = tx;
                            checkCmd.CommandText = @"
                                SELECT 1 FROM jeevika_erp.SocBillingMatrix 
                                WHERE SocietyId = @socId AND BillTypeId = @btId AND MemberId = @memId AND AccountCode = @code LIMIT 1";
                            checkCmd.Parameters.AddWithValue("@socId", societyId);
                            checkCmd.Parameters.AddWithValue("@btId", billTypeId);
                            checkCmd.Parameters.AddWithValue("@memId", memberId);
                            checkCmd.Parameters.AddWithValue("@code", targetAccCode);
                            exists = checkCmd.ExecuteScalar() != null;
                        }

                        using var upsertCmd = conn.CreateCommand();
                        upsertCmd.Transaction = tx;
                        upsertCmd.CommandText = @"
                            INSERT INTO jeevika_erp.SocBillingMatrix (SocietyId, BillTypeId, MemberId, AccountCode, Amount, UpdatedAt)
                            VALUES (@socId, @btId, @memId, @code, @amt, NOW())
                            ON CONFLICT (SocietyId, BillTypeId, MemberId, AccountCode)
                            DO UPDATE SET Amount = EXCLUDED.Amount, UpdatedAt = NOW()";
                        upsertCmd.Parameters.AddWithValue("@socId", societyId);
                        upsertCmd.Parameters.AddWithValue("@btId", billTypeId);
                        upsertCmd.Parameters.AddWithValue("@memId", memberId);
                        upsertCmd.Parameters.AddWithValue("@code", targetAccCode);
                        upsertCmd.Parameters.AddWithValue("@amt", amt);
                        upsertCmd.ExecuteNonQuery();

                        if (exists) updated++;
                        else inserted++;
                    }
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = $"Bulk import complete: {inserted} inserted, {updated} updated, {skipped} skipped.",
                    totalRows = model.Rows.Count,
                    inserted,
                    updated,
                    skipped,
                    errors
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Database transaction failed during bulk import: " + ex.Message });
            }
        }

        // ── GET /api/billing-master/settings ──────────────────────
        [HttpGet("settings")]
        public IActionResult GetSettings([FromQuery] string billType = "Maintenance", [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                int billTypeId = GetOrCreateBillTypeId(conn, billType, societyId);

                if (billTypeId == 0)
                {
                    return Ok(new { success = true, gstCalc = "MANUAL", interestCalc = "MANUAL" });
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT GSTCalc, InterestCalc FROM jeevika_erp.SocBillingSetting WHERE SocietyId = @socId AND BillTypeId = @btId LIMIT 1";
                cmd.Parameters.AddWithValue("@socId", societyId > 0 ? societyId : 1);
                cmd.Parameters.AddWithValue("@btId", billTypeId);

                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    return Ok(new
                    {
                        success = true,
                        gstCalc = GetStringSafe(r, "GSTCalc", "MANUAL"),
                        interestCalc = GetStringSafe(r, "InterestCalc", "MANUAL")
                    });
                }

                return Ok(new { success = true, gstCalc = "MANUAL", interestCalc = "MANUAL" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/billing-master/settings ─────────────────────
        [HttpPost("settings")]
        public IActionResult SaveSettings([FromBody] BillingSettingModel model, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                int billTypeId = GetOrCreateBillTypeId(conn, model.BillType ?? "Maintenance", societyId);

                if (billTypeId == 0)
                {
                    return BadRequest(new { success = false, message = "Bill type not found." });
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocBillingSetting (SocietyId, BillTypeId, GSTCalc, InterestCalc, UpdatedAt)
                    VALUES (@socId, @btId, @gst, @int, NOW())
                    ON CONFLICT (SocietyId, BillTypeId)
                    DO UPDATE SET GSTCalc = EXCLUDED.GSTCalc, InterestCalc = EXCLUDED.InterestCalc, UpdatedAt = NOW()";
                cmd.Parameters.AddWithValue("@socId", societyId > 0 ? societyId : 1);
                cmd.Parameters.AddWithValue("@btId", billTypeId);
                cmd.Parameters.AddWithValue("@gst", model.GSTCalc ?? "MANUAL");
                cmd.Parameters.AddWithValue("@int", model.InterestCalc ?? "MANUAL");
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Calculation settings saved successfully!" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class MemberMatrixRow
    {
        public int MemberId { get; set; }
        public string MemNo { get; set; } = "";
        public string FlatNo { get; set; } = "";
        public string Name { get; set; } = "";
        public string Wing { get; set; } = "";
        public decimal Sqft { get; set; }
        public decimal Op_Prin { get; set; }
        public string OpDrCr { get; set; } = "Dr";
        public decimal Op_Int { get; set; }
        public Dictionary<string, decimal> Amounts { get; set; } = new();
    }

    public class SaveMatrixRowModel
    {
        public int MemberId { get; set; }
        public string MemNo { get; set; } = "";
        public string Wing { get; set; } = "";
        public string Name { get; set; } = "";
        public decimal Sqft { get; set; }
        public decimal Op_Prin { get; set; }
        public decimal Op_Int { get; set; }
        public Dictionary<string, decimal>? Amounts { get; set; }
        public bool Checked { get; set; }
    }

    public class BillingSettingModel
    {
        public string? BillType { get; set; }
        public string? GSTCalc { get; set; }
        public string? InterestCalc { get; set; }
    }

    public class BulkImportRowModel
    {
        public int MemberId { get; set; }
        public string? MemberCode { get; set; }
        public string? MemNo { get; set; }
        public Dictionary<string, decimal>? Amounts { get; set; }
    }

    public class BulkImportRequestModel
    {
        public int SocietyId { get; set; }
        public int BillTypeId { get; set; }
        public string? BillType { get; set; }
        public List<BulkImportRowModel> Rows { get; set; } = new();
    }
}
