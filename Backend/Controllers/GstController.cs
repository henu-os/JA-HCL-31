// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — GstController
// CRUD for GST rates table (SocGSTRate)
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/gst-rates")]
    [AllowAnonymous]
    public class GstController : ControllerBase
    {
        [HttpGet]
        public IActionResult GetAll([FromQuery] int societyId)
        {
            if (societyId <= 0) return BadRequest(new { success = false, message = "societyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT GSTRateId, SocietyId, GSTCode, GSTName, CGSTRate, SGSTRate, IGSTRate, IsDeleted
                    FROM jeevika_erp.SocGSTRate
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                    ORDER BY GSTName";
                cmd.Parameters.AddWithValue("@sid", societyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        gstRateId = Convert.ToInt32(r["GSTRateId"]),
                        societyId = Convert.ToInt32(r["SocietyId"]),
                        gstCode   = r["GSTCode"].ToString() ?? "",
                        gstName   = r["GSTName"].ToString() ?? "",
                        cgstRate  = Convert.ToDecimal(r["CGSTRate"]),
                        sgstRate  = Convert.ToDecimal(r["SGSTRate"]),
                        igstRate  = Convert.ToDecimal(r["IGSTRate"])
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
        public IActionResult Create([FromBody] GstModel model)
        {
            if (model.SocietyId <= 0 || string.IsNullOrWhiteSpace(model.GSTName))
                return BadRequest(new { success = false, message = "SocietyId and GSTName are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocGSTRate
                        (SocietyId, GSTCode, GSTName, CGSTRate, SGSTRate, IGSTRate, IsDeleted)
                    VALUES
                        (@sid, @code, @name, @cgst, @sgst, @igst, FALSE)
                    RETURNING GSTRateId";

                cmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                cmd.Parameters.AddWithValue("@code", (object?)model.GSTCode ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@name", model.GSTName.Trim());
                cmd.Parameters.AddWithValue("@cgst", model.CGSTRate);
                cmd.Parameters.AddWithValue("@sgst", model.SGSTRate);
                cmd.Parameters.AddWithValue("@igst", model.IGSTRate);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, message = "GST Rate created.", gstRateId = newId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] GstModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocGSTRate SET
                        GSTCode  = @code,
                        GSTName  = @name,
                        CGSTRate = @cgst,
                        SGSTRate = @sgst,
                        IGSTRate = @igst
                    WHERE GSTRateId = @id AND IsDeleted = FALSE";

                cmd.Parameters.AddWithValue("@code", (object?)model.GSTCode ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@name", model.GSTName.Trim());
                cmd.Parameters.AddWithValue("@cgst", model.CGSTRate);
                cmd.Parameters.AddWithValue("@sgst", model.SGSTRate);
                cmd.Parameters.AddWithValue("@igst", model.IGSTRate);
                cmd.Parameters.AddWithValue("@id",   id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0) return NotFound(new { success = false, message = "GST rate not found." });

                return Ok(new { success = true, message = "GST Rate updated." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "UPDATE jeevika_erp.SocGSTRate SET IsDeleted = TRUE WHERE GSTRateId = @id";
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0) return NotFound(new { success = false, message = "GST rate not found." });

                return Ok(new { success = true, message = "GST Rate deleted." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class GstModel
    {
        public int     SocietyId { get; set; }
        public string? GSTCode   { get; set; }
        public string  GSTName   { get; set; } = "";
        public decimal CGSTRate  { get; set; } = 0;
        public decimal SGSTRate  { get; set; } = 0;
        public decimal IGSTRate  { get; set; } = 0;
    }

    public class GstMasterSettingsModel
    {
        public int     SocietyId     { get; set; } = 1;
        public bool    GSTApplicable { get; set; } = false;
        public string? GSTNumber     { get; set; }
        public string? CGSTCode      { get; set; } = "LIA-1032";
        public string? SGSTCode      { get; set; } = "LIA-1033";
        public decimal CGSTPct       { get; set; } = 9;
        public decimal SGSTPct       { get; set; } = 9;
        public string? IntDuesGST    { get; set; } = "No";
        public decimal ExemptLimit   { get; set; } = 7500;
    }
}
