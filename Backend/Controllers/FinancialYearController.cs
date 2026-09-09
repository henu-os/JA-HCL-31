// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — FinancialYearController
// GET    /api/financial-years?societyId=X  → list FYs
// GET    /api/financial-years/{id}          → get one FY
// POST   /api/financial-years               → create FY
// PUT    /api/financial-years/{id}          → update FY
// DELETE /api/financial-years/{id}          → delete FY
// POST   /api/financial-years/{id}/close    → mark FY as closed
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/financial-years")]
    [AllowAnonymous]
    public class FinancialYearController : ControllerBase
    {
        // ── GET /api/financial-years?societyId=X ─────────
        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetAll([FromQuery] int societyId)
        {
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "societyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT FYId, SocietyId, FYLabel, FYStart, FYEnd,
                           IsActive, IsClosed, CreatedAt
                    FROM jeevika_erp.FinancialYear
                    WHERE SocietyId = @sid
                    ORDER BY FYStart DESC";
                cmd.Parameters.AddWithValue("@sid", societyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read()) list.Add(MapFY(r));

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/financial-years/{id} ────────────────
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT * FROM jeevika_erp.FinancialYear
                    WHERE FYId = @id LIMIT 1";
                cmd.Parameters.AddWithValue("@id", id);

                using var r = cmd.ExecuteReader();
                if (!r.Read())
                    return NotFound(new { success = false, message = "Financial year not found." });

                return Ok(new { success = true, data = MapFY(r) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/financial-years ─────────────────────
        [HttpPost]
        public IActionResult Create([FromBody] FYModel model)
        {
            if (model.SocietyId <= 0 || string.IsNullOrWhiteSpace(model.FYLabel))
                return BadRequest(new { success = false, message = "SocietyId and FYLabel are required." });

            if (model.FYStart >= model.FYEnd)
                return BadRequest(new { success = false, message = "FY End must be after FY Start." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.FinancialYear
                        (SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed, CreatedAt)
                    VALUES
                        (@sid, @label, @start, @end, TRUE, FALSE, NOW())
                    RETURNING FYId";

                cmd.Parameters.AddWithValue("@sid",   model.SocietyId);
                cmd.Parameters.AddWithValue("@label", model.FYLabel.Trim());
                cmd.Parameters.AddWithValue("@start", model.FYStart);
                cmd.Parameters.AddWithValue("@end",   model.FYEnd);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, message = "Financial year created.", fYId = newId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/financial-years/{id} ────────────────
        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] FYModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.FinancialYear
                    SET FYLabel  = @label,
                        FYStart  = @start,
                        FYEnd    = @end,
                        IsActive = @active
                    WHERE FYId = @id AND IsClosed = FALSE";

                cmd.Parameters.AddWithValue("@label",  model.FYLabel?.Trim() ?? "");
                cmd.Parameters.AddWithValue("@start",  model.FYStart);
                cmd.Parameters.AddWithValue("@end",    model.FYEnd);
                cmd.Parameters.AddWithValue("@active", model.IsActive);
                cmd.Parameters.AddWithValue("@id",     id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Financial year not found or is closed." });

                return Ok(new { success = true, message = "Financial year updated." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/financial-years/{id} ─────────────
        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                // Check if any transactions exist for this FY
                using var checkCmd = conn.CreateCommand();
                checkCmd.CommandText = @"
                    SELECT COUNT(*) FROM jeevika_erp.SocVoucherHeader
                    WHERE FYId = @id";
                checkCmd.Parameters.AddWithValue("@id", id);
                var count = (long)(checkCmd.ExecuteScalar() ?? 0L);

                if (count > 0)
                    return Conflict(new
                    {
                        success = false,
                        message = $"Cannot delete: {count} transactions exist for this financial year."
                    });

                using var delCmd = conn.CreateCommand();
                delCmd.CommandText = "DELETE FROM jeevika_erp.FinancialYear WHERE FYId = @id AND IsClosed = FALSE";
                delCmd.Parameters.AddWithValue("@id", id);

                var rows = delCmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Financial year not found or is closed." });

                return Ok(new { success = true, message = "Financial year deleted." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/financial-years/{id}/close ─────────
        [HttpPost("{id:int}/close")]
        public IActionResult Close(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.FinancialYear
                    SET IsClosed = TRUE, IsActive = FALSE
                    WHERE FYId = @id";
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Financial year not found." });

                return Ok(new { success = true, message = "Financial year closed successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── Helper: Map reader → object ───────────────────
        private static object MapFY(Npgsql.NpgsqlDataReader r)
        {
            return new
            {
                fYId      = Convert.ToInt32(r["FYId"]),
                societyId = Convert.ToInt32(r["SocietyId"]),
                fYLabel   = r["FYLabel"].ToString() ?? "",
                fYStart   = r["FYStart"] == DBNull.Value ? null : ((DateTime)r["FYStart"]).ToString("yyyy-MM-dd"),
                fYEnd     = r["FYEnd"]   == DBNull.Value ? null : ((DateTime)r["FYEnd"]).ToString("yyyy-MM-dd"),
                isActive  = Convert.ToBoolean(r["IsActive"]),
                isClosed  = Convert.ToBoolean(r["IsClosed"])
            };
        }
    }

    // ── FY Model ──────────────────────────────────────────
    public class FYModel
    {
        public int      SocietyId { get; set; }
        public string   FYLabel   { get; set; } = "";
        public DateTime FYStart   { get; set; }
        public DateTime FYEnd     { get; set; }
        public bool     IsActive  { get; set; } = true;
    }
}
