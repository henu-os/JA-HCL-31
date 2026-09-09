// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — CommitteeController
// CRUD endpoints for Committee Master (Managing Committee)
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/committee")]
    [AllowAnonymous]
    public class CommitteeController : ControllerBase
    {
        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetAll([FromQuery] int societyId)
        {
            if (societyId <= 0) return BadRequest(new { success = false, message = "societyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT CommitteeId, SocietyId, FYId, MemberName, Designation,
                           FromDate, ToDate, ContactNo, Email, IsActive
                    FROM jeevika_erp.SocCommittee
                    WHERE SocietyId = @sid AND IsActive = TRUE
                    ORDER BY MemberName";
                cmd.Parameters.AddWithValue("@sid", societyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read()) list.Add(MapCommittee(r));

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost]
        public IActionResult Create([FromBody] CommitteeModel model)
        {
            if (model.SocietyId <= 0 || string.IsNullOrWhiteSpace(model.MemberName))
                return BadRequest(new { success = false, message = "SocietyId and MemberName are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocCommittee
                        (SocietyId, FYId, MemberName, Designation, FromDate, ToDate, ContactNo, Email, IsActive)
                    VALUES
                        (@sid, @fyid, @name, @desig, @from, @to, @contact, @email, TRUE)
                    RETURNING CommitteeId";

                cmd.Parameters.AddWithValue("@sid",     model.SocietyId);
                cmd.Parameters.AddWithValue("@fyid",    (object?)model.FYId    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@name",    model.MemberName.Trim());
                cmd.Parameters.AddWithValue("@desig",   (object?)model.Designation ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@from",    model.FromDate.HasValue ? model.FromDate.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@to",      model.ToDate.HasValue   ? model.ToDate.Value   : DBNull.Value);
                cmd.Parameters.AddWithValue("@contact", (object?)model.ContactNo   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@email",   (object?)model.Email       ?? DBNull.Value);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, message = "Committee member added successfully.", committeeId = newId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] CommitteeModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocCommittee SET
                        MemberName  = @name,
                        Designation = @desig,
                        FromDate    = @from,
                        ToDate      = @to,
                        ContactNo   = @contact,
                        Email       = @email
                    WHERE CommitteeId = @id AND IsActive = TRUE";

                cmd.Parameters.AddWithValue("@name",    model.MemberName.Trim());
                cmd.Parameters.AddWithValue("@desig",   (object?)model.Designation ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@from",    model.FromDate.HasValue ? model.FromDate.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@to",      model.ToDate.HasValue   ? model.ToDate.Value   : DBNull.Value);
                cmd.Parameters.AddWithValue("@contact", (object?)model.ContactNo   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@email",   (object?)model.Email       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@id",      id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0) return NotFound(new { success = false, message = "Committee member not found." });

                return Ok(new { success = true, message = "Committee member updated successfully." });
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
                cmd.CommandText = "UPDATE jeevika_erp.SocCommittee SET IsActive = FALSE WHERE CommitteeId = @id";
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0) return NotFound(new { success = false, message = "Committee member not found." });

                return Ok(new { success = true, message = "Committee member deleted." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static object MapCommittee(NpgsqlDataReader r)
        {
            T? Get<T>(string col) { try { var v = r[col]; return v == DBNull.Value ? default : (T)Convert.ChangeType(v, typeof(T)); } catch { return default; } }
            string S(string col) => r[col]?.ToString() ?? "";

            return new
            {
                committeeId = Get<int>("CommitteeId"),
                societyId   = Get<int>("SocietyId"),
                fyId        = r["FYId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["FYId"]),
                memberName  = S("MemberName"),
                designation = S("Designation"),
                fromDate    = r["FromDate"] == DBNull.Value ? null : ((DateTime)r["FromDate"]).ToString("yyyy-MM-dd"),
                toDate      = r["ToDate"] == DBNull.Value ? null : ((DateTime)r["ToDate"]).ToString("yyyy-MM-dd"),
                contactNo   = S("ContactNo"),
                email       = S("Email"),
                isActive    = Get<bool>("IsActive")
            };
        }
    }

    public class CommitteeModel
    {
        public int       SocietyId   { get; set; }
        public int?      FYId        { get; set; }
        public string    MemberName  { get; set; } = "";
        public string?   Designation { get; set; }
        public DateTime? FromDate    { get; set; }
        public DateTime? ToDate      { get; set; }
        public string?   ContactNo   { get; set; }
        public string?   Email       { get; set; }
    }
}
