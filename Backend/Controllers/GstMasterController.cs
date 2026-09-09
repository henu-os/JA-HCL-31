// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — GstMasterController
// Settings for GST Master Configuration (reads/writes SocietyInfo)
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/gst-master")]
    [AllowAnonymous]
    public class GstMasterController : ControllerBase
    {
        // ── GET /api/gst-master/settings ─────────────────────────
        [HttpGet("settings")]
        public IActionResult GetSettings([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT SocietyId, SocietyName, GSTApplicable, GSTNumber, HSNCode, CGSTCode, SGSTCode,
                           CGSTPct, SGSTPct, IntDuesGST, ExemptLimit, ExemptAmount
                    FROM jeevika_erp.SocietyInfo
                    WHERE (SocietyId = @sid OR (@sid <= 0 AND SocietyId > 0) OR NOT EXISTS (SELECT 1 FROM jeevika_erp.SocietyInfo WHERE SocietyId = @sid AND IsActive = TRUE))
                      AND IsActive = TRUE
                    ORDER BY CASE WHEN SocietyId = @sid THEN 0 ELSE 1 END, SocietyId ASC
                    LIMIT 1";
                cmd.Parameters.AddWithValue("@sid", societyId > 0 ? societyId : 1);

                using var r = cmd.ExecuteReader();
                if (!r.Read())
                    return NotFound(new { success = false, message = "Society not found." });

                bool gstApp = false;
                var gObj = r["GSTApplicable"];
                if (gObj != null && gObj != DBNull.Value)
                {
                    if (gObj is bool b) gstApp = b;
                    else if (bool.TryParse(gObj.ToString(), out bool pb)) gstApp = pb;
                    else
                    {
                        var s = gObj.ToString()?.Trim().ToUpper();
                        gstApp = (s == "Y" || s == "YES" || s == "TRUE" || s == "1");
                    }
                }

                var data = new
                {
                    societyId     = Convert.ToInt32(r["SocietyId"]),
                    societyName   = r["SocietyName"]?.ToString() ?? "",
                    gstApplicable = gstApp,
                    gstNumber     = r["GSTNumber"]?.ToString() ?? "",
                    hsnCode       = r["HSNCode"]?.ToString() ?? "",
                    cgstCode      = r["CGSTCode"]?.ToString() ?? "LIA-1032",
                    sgstCode      = r["SGSTCode"]?.ToString() ?? "LIA-1033",
                    cgstPct       = r["CGSTPct"] != DBNull.Value ? Convert.ToDecimal(r["CGSTPct"]) : 9m,
                    sgstPct       = r["SGSTPct"] != DBNull.Value ? Convert.ToDecimal(r["SGSTPct"]) : 9m,
                    intDuesGST    = r["IntDuesGST"]?.ToString() ?? "No",
                    exemptLimit   = r["ExemptLimit"] != DBNull.Value ? Convert.ToDecimal(r["ExemptLimit"]) : 7500m,
                    exemptAmount  = r["ExemptAmount"] != DBNull.Value ? Convert.ToDecimal(r["ExemptAmount"]) : 7500m
                };

                return Ok(new { success = true, data });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/gst-master/settings ────────────────────────
        [HttpPost("settings")]
        public IActionResult SaveSettings([FromBody] GstMasterSettingsModel model)
        {
            int sid = model.SocietyId > 0 ? model.SocietyId : 1;

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocietyInfo SET
                        GSTApplicable = @gstApp,
                        GSTNumber     = @gstNo,
                        CGSTCode      = @cgstCode,
                        SGSTCode      = @sgstCode,
                        CGSTPct       = @cgstPct,
                        SGSTPct       = @sgstPct,
                        IntDuesGST    = @intDues,
                        ExemptLimit   = @exemptLimit,
                        ExemptAmount  = @exemptAmt,
                        UpdatedAt     = NOW()
                    WHERE SocietyId = (
                        SELECT SocietyId FROM jeevika_erp.SocietyInfo
                        WHERE (SocietyId = @sid OR (@sid <= 0 AND SocietyId > 0) OR NOT EXISTS (SELECT 1 FROM jeevika_erp.SocietyInfo WHERE SocietyId = @sid AND IsActive = TRUE))
                          AND IsActive = TRUE
                        ORDER BY CASE WHEN SocietyId = @sid THEN 0 ELSE 1 END, SocietyId ASC
                        LIMIT 1
                    )";

                cmd.Parameters.AddWithValue("@sid", sid);
                cmd.Parameters.AddWithValue("@gstApp", model.GSTApplicable);
                cmd.Parameters.AddWithValue("@gstNo", (object?)model.GSTNumber ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cgstCode", (object?)model.CGSTCode ?? "LIA-1032");
                cmd.Parameters.AddWithValue("@sgstCode", (object?)model.SGSTCode ?? "LIA-1033");
                cmd.Parameters.AddWithValue("@cgstPct", model.CGSTPct);
                cmd.Parameters.AddWithValue("@sgstPct", model.SGSTPct);
                cmd.Parameters.AddWithValue("@intDues", (object?)model.IntDuesGST ?? "No");
                cmd.Parameters.AddWithValue("@exemptLimit", model.ExemptLimit);
                cmd.Parameters.AddWithValue("@exemptAmt", model.ExemptLimit);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0) return NotFound(new { success = false, message = "Society not found." });

                return Ok(new { success = true, message = "GST Master settings saved to database successfully.", isGstEnabled = model.GSTApplicable });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
