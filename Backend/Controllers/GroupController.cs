// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — GroupController
// GET    /api/groups?societyId=X  → list groups for society (auto-seeds defaults if empty)
// GET    /api/groups/{id}         → get single group
// POST   /api/groups              → create group
// PUT    /api/groups/{id}         → update group
// DELETE /api/groups/{id}         → soft-delete group (protects default groups)
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/groups")]
    [AllowAnonymous]
    public class GroupController : ControllerBase
    {
        // Default 34 system groups for Society Chart of Accounts
        private static readonly (string name, int mainId, string code)[] DefaultGroups = new[]
        {
            // Assets (MainId = 1)
            ("Cost of Land", 1, "AS-01"),
            ("Cash & Bank Balance", 1, "AS-02"),
            ("Investments", 1, "AS-03"),
            ("Sundry Debtors", 1, "AS-04"),
            ("Dues from Members", 1, "AS-05"),
            ("Fixed Assets", 1, "AS-06"),
            ("Current Assets", 1, "AS-07"),
            ("Cost of Construction", 1, "AS-08"),
            ("Misc.Assets", 1, "AS-09"),
            ("Accrued Interest", 1, "AS-10"),
            ("Income & Expenditure", 1, "AS-11"),
            ("Advance & Deposit", 1, "AS-12"),
            ("INPUT GST", 1, "AS-13"),

            // Liabilities (MainId = 2)
            ("Current Liabilities & Provisions", 2, "LI-01"),
            ("Advances & Deposits", 2, "LI-02"),
            ("Issued, Sub. & Paid Up Captial", 2, "LI-03"),
            ("Cost of Construction", 2, "LI-04"),
            ("Common Welfare Fund", 2, "LI-05"),
            ("Ammenity Fund", 2, "LI-06"),
            ("Building Repair Fund", 2, "LI-07"),
            ("Income & Expenditure", 2, "LI-08"),
            ("Sinking Fund", 2, "LI-09"),
            ("Reserve Fund", 2, "LI-10"),
            ("Sundry Creditors", 2, "LI-11"),
            ("Education Fund", 2, "LI-12"),
            ("Major Repair Fund", 2, "LI-13"),
            ("Dues from Members", 2, "LI-14"),
            ("OUTPUT GST", 2, "LI-15"),

            // Income (MainId = 3)
            ("Maintenance & Service Charges", 3, "IN-01"),
            ("Interest Received From", 3, "IN-02"),
            ("Other Sources", 3, "IN-03"),
            ("Rent & Taxes", 3, "IN-04"),

            // Expenditure (MainId = 4)
            ("Rent, Rates & Taxes", 4, "EX-01"),
            ("Establishment Expenses", 4, "EX-02"),
            ("Maintenance", 4, "EX-03"),
            ("Others", 4, "EX-04")
        };

        // ── GET /api/groups?societyId=X ─────────────────────────
        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetAll([FromQuery] int societyId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                if (societyId <= 0)
                    return Ok(new { success = true, data = new List<object>(), count = 0 });

                // Ensure default groups are seeded for this society
                EnsureDefaultGroups(conn, societyId);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT GroupId, SocietyId, GrpCode, GrpName, GrpMarName,
                           GrpMainId, GrpPrimaryId, GrpPrimaryName, GrpType,
                           GrpSubtotal, IsDeleted, CreatedAt
                    FROM jeevika_erp.SocGroup
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                    ORDER BY 
                        CASE GrpMainId 
                            WHEN 3 THEN 1 -- Income
                            WHEN 4 THEN 2 -- Expenditure
                            WHEN 1 THEN 3 -- Asset
                            WHEN 2 THEN 4 -- Liability
                            ELSE 5 
                        END, GrpCode, GrpName";
                cmd.Parameters.AddWithValue("@sid", societyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read()) list.Add(MapGroup(r));

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/groups/{id} ─────────────────────────────────
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT * FROM jeevika_erp.SocGroup
                    WHERE GroupId = @id AND IsDeleted = FALSE
                    LIMIT 1";
                cmd.Parameters.AddWithValue("@id", id);

                using var r = cmd.ExecuteReader();
                if (!r.Read())
                    return NotFound(new { success = false, message = "Group not found." });

                return Ok(new { success = true, data = MapGroup(r) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/groups/next-code?societyId=X&mainId=Y ──────
        [HttpGet("next-code")]
        public IActionResult GetNextCode([FromQuery] int societyId, [FromQuery] int mainId)
        {
            if (societyId <= 0 || mainId <= 0)
                return BadRequest(new { success = false, message = "societyId and mainId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                string nextCode = AutoGenerateCode(conn, societyId, mainId);
                return Ok(new { success = true, nextCode });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/groups ─────────────────────────────────────
        [HttpPost]
        public IActionResult Create([FromBody] GroupModel model)
        {
            if (string.IsNullOrWhiteSpace(model.GrpName))
                return BadRequest(new { success = false, message = "GrpName is required." });

            try
            {
                using var conn = DbHelper.GetConn();

                if (model.SocietyId <= 0)
                    return BadRequest(new { success = false, message = "societyId is required." });
                int sid = model.SocietyId;

                // Auto generate code if empty
                if (string.IsNullOrWhiteSpace(model.GrpCode))
                {
                    model.GrpCode = AutoGenerateCode(conn, sid, model.GrpMainId);
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocGroup
                        (SocietyId, GrpCode, GrpName, GrpMarName, GrpMainId,
                         GrpPrimaryId, GrpPrimaryName, GrpType, GrpSubtotal, IsDeleted, CreatedAt)
                    VALUES
                        (@sid, @code, @name, @marname, @mainId,
                         @primId, @primName, @type, @subtotal, FALSE, NOW())
                    RETURNING GroupId";

                AddGroupParams(cmd, model);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, message = "Group created successfully.", groupId = newId, grpCode = model.GrpCode });
            }
            catch (PostgresException ex) when (ex.SqlState == "23505")
            {
                return Conflict(new { success = false, message = "Group code already exists in this society." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/groups/{id} ─────────────────────────────────
        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] GroupModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                // Verify if it's default group
                using var checkDefault = conn.CreateCommand();
                checkDefault.CommandText = "SELECT GrpType FROM jeevika_erp.SocGroup WHERE GroupId = @id AND IsDeleted = FALSE";
                checkDefault.Parameters.AddWithValue("@id", id);
                var typeRes = checkDefault.ExecuteScalar();
                if (typeRes == null)
                    return NotFound(new { success = false, message = "Group not found." });

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocGroup SET
                        GrpCode        = @code,
                        GrpName        = @name,
                        GrpMarName     = @marname,
                        GrpMainId      = @mainId,
                        GrpPrimaryId   = @primId,
                        GrpPrimaryName = @primName,
                        GrpSubtotal    = @subtotal
                    WHERE GroupId = @id AND IsDeleted = FALSE";

                AddGroupParams(cmd, model);
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Group not found." });

                return Ok(new { success = true, message = "Group updated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/groups/{id} ──────────────────────────────
        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                // Check group type (2 = System default group cannot be deleted)
                using var checkTypeCmd = conn.CreateCommand();
                checkTypeCmd.CommandText = "SELECT GrpType FROM jeevika_erp.SocGroup WHERE GroupId = @id AND IsDeleted = FALSE";
                checkTypeCmd.Parameters.AddWithValue("@id", id);
                var typeObj = checkTypeCmd.ExecuteScalar();
                if (typeObj != null && Convert.ToInt32(typeObj) == 2)
                {
                    return BadRequest(new { success = false, message = "Default system groups cannot be deleted at any cost." });
                }

                // Check if accounts exist under this group
                using var checkCmd = conn.CreateCommand();
                checkCmd.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocAccount WHERE GroupId = @id AND IsDeleted = FALSE";
                checkCmd.Parameters.AddWithValue("@id", id);
                var count = Convert.ToInt64(checkCmd.ExecuteScalar() ?? 0L);

                if (count > 0)
                    return Conflict(new { success = false, message = $"Cannot delete: {count} account ledgers belong to this group." });

                // Delete directly from DB
                using var delCmd = conn.CreateCommand();
                delCmd.CommandText = "DELETE FROM jeevika_erp.SocGroup WHERE GroupId = @id";
                delCmd.Parameters.AddWithValue("@id", id);
                var rows = delCmd.ExecuteNonQuery();

                if (rows == 0)
                    return NotFound(new { success = false, message = "Group not found." });

                return Ok(new { success = true, message = "Group deleted successfully from database." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── Helpers ──────────────────────────────────────────────
        public static void EnsureDefaultGroups(NpgsqlConnection conn, int societyId)
        {
            if (societyId <= 0) return;

            using var chkSoc = conn.CreateCommand();
            chkSoc.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocietyInfo WHERE SocietyId = @sid";
            chkSoc.Parameters.AddWithValue("@sid", societyId);
            if (Convert.ToInt64(chkSoc.ExecuteScalar() ?? 0L) == 0) return;

            foreach (var g in DefaultGroups)
            {
                using var ins = conn.CreateCommand();
                ins.CommandText = @"
                    INSERT INTO jeevika_erp.SocGroup
                        (SocietyId, GrpCode, GrpName, GrpMainId, GrpPrimaryName, GrpType, GrpSubtotal, IsDeleted, CreatedAt)
                    SELECT @sid, @code, @name, @mainId, @name, 2, FALSE, FALSE, NOW()
                    WHERE NOT EXISTS (
                        SELECT 1 FROM jeevika_erp.SocGroup
                        WHERE SocietyId = @sid AND GrpCode = @code
                    );

                    UPDATE jeevika_erp.SocGroup
                    SET GrpType = 2,
                        GrpName = CASE WHEN GrpCode = 'LI-15' AND GrpName ILIKE '%INPUT GST%' THEN @name ELSE GrpName END,
                        GrpPrimaryName = CASE WHEN GrpCode = 'LI-15' AND GrpPrimaryName ILIKE '%INPUT GST%' THEN @name ELSE GrpPrimaryName END,
                        IsDeleted = FALSE
                    WHERE SocietyId = @sid AND GrpCode = @code;
                ";
                ins.Parameters.AddWithValue("@sid", societyId);
                ins.Parameters.AddWithValue("@code", g.code);
                ins.Parameters.AddWithValue("@name", g.name);
                ins.Parameters.AddWithValue("@mainId", g.mainId);
                ins.ExecuteNonQuery();
            }
        }

        private static string AutoGenerateCode(NpgsqlConnection conn, int societyId, int mainId)
        {
            string pfx = mainId switch
            {
                1 => "AS",
                2 => "LI",
                3 => "IN",
                4 => "EX",
                _ => "AS"
            };

            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT GrpCode FROM jeevika_erp.SocGroup
                WHERE SocietyId = @sid AND GrpMainId = @mid AND GrpCode LIKE @pfx AND IsDeleted = FALSE
                ORDER BY GrpCode DESC";
            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@mid", mainId);
            cmd.Parameters.AddWithValue("@pfx", $"{pfx}-%");

            int max = 0;
            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                var codeStr = r.GetString(0);
                var numPart = codeStr.Replace($"{pfx}-", "").Trim();
                if (int.TryParse(numPart, out int n) && n > max) max = n;
            }

            int next = max + 1;
            return $"{pfx}-{(next < 10 ? "0" + next : next.ToString())}";
        }

        private static object MapGroup(NpgsqlDataReader r)
        {
            T? Get<T>(string col)
            {
                try { var v = r[col]; return v == DBNull.Value ? default : (T)Convert.ChangeType(v, typeof(T)); }
                catch { return default; }
            }
            string S(string col) => r[col]?.ToString() ?? "";

            int type = Get<int>("GrpType");
            string code = S("GrpCode");

            return new
            {
                socGroupId     = Get<int>("GroupId"),
                groupId        = Get<int>("GroupId"),
                societyId      = Get<int>("SocietyId"),
                grpCode        = code,
                _code          = type == 2 ? $"{code} (D)" : code,
                grpName        = S("GrpName"),
                grpMarName     = S("GrpMarName"),
                grpMainId      = Get<int>("GrpMainId"),
                grpPrimaryId   = r["GrpPrimaryId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["GrpPrimaryId"]),
                grpPrimaryName = S("GrpPrimaryName"),
                grpType        = type,
                grpSubtotal    = Get<bool>("GrpSubtotal") ? "True" : "False",
                isDeleted      = Get<bool>("IsDeleted"),
                createdAt      = Get<DateTime>("CreatedAt")
            };
        }

        private static void AddGroupParams(NpgsqlCommand cmd, GroupModel m)
        {
            cmd.Parameters.AddWithValue("@sid",      m.SocietyId);
            cmd.Parameters.AddWithValue("@code",     (object?)m.GrpCode     ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@name",     m.GrpName.Trim());
            cmd.Parameters.AddWithValue("@marname",  (object?)m.GrpMarName  ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@mainId",   m.GrpMainId <= 0 ? 1 : m.GrpMainId);
            cmd.Parameters.AddWithValue("@primId",   (object?)m.GrpPrimaryId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@primName", (object?)m.GrpPrimaryName ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@type",     m.GrpType <= 0 ? 1 : m.GrpType);
            cmd.Parameters.AddWithValue("@subtotal", m.GrpSubtotal);
        }
    }

    public class GroupModel
    {
        public int     SocietyId      { get; set; }
        public string? GrpCode        { get; set; }
        public string  GrpName        { get; set; } = "";
        public string? GrpMarName     { get; set; }
        public int     GrpMainId      { get; set; } = 1; // 1=Asset, 2=Liability, 3=Income, 4=Expense
        public int?    GrpPrimaryId   { get; set; }
        public string? GrpPrimaryName { get; set; }
        public int     GrpType        { get; set; } = 1; // 1=User, 2=Default
        public bool    GrpSubtotal    { get; set; } = false;
    }
}
