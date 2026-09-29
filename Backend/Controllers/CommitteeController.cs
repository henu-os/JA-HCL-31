// ═══════════════════════════════════════════════════════════
// HENU ERP v2 — CommitteeController
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
        public IActionResult GetAll([FromQuery] int societyId, [FromQuery] bool includeInactive = false)
        {
            if (societyId <= 0) return BadRequest(new { success = false, message = "societyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                var activeClause = includeInactive ? "" : "AND IsActive = TRUE";
                cmd.CommandText = $@"
                    SELECT CommitteeId, SocietyId, FYId, 
                           COALESCE(MemberName, '') AS MemberName, 
                           COALESCE(Designation, 'Committee Member') AS Designation,
                           COALESCE(FlatNo, UnitNo, '') AS FlatNo,
                           COALESCE(UnitNo, FlatNo, '') AS UnitNo,
                           COALESCE(ContactNo, '') AS ContactNo, 
                           COALESCE(Email, '') AS Email, 
                           COALESCE(WorkingPeriod, '') AS WorkingPeriod,
                           COALESCE(Address, '') AS Address,
                           COALESCE(Remark, '') AS Remark,
                           FromDate, ToDate, 
                           COALESCE(IsSignatory, FALSE) AS IsSignatory,
                           COALESCE(IsActive, TRUE) AS IsActive
                    FROM jeevika_erp.SocCommittee
                    WHERE SocietyId = @sid {activeClause}
                    ORDER BY CommitteeId ASC";
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
                        (SocietyId, FYId, MemberName, Designation, FlatNo, UnitNo, ContactNo, Email, WorkingPeriod, Address, Remark, FromDate, ToDate, IsSignatory, IsActive)
                    VALUES
                        (@sid, @fyid, @name, @desig, @flat, @unit, @contact, @email, @period, @addr, @rem, @from, @to, @sign, @active)
                    RETURNING CommitteeId";

                var flatVal = !string.IsNullOrWhiteSpace(model.FlatNo) ? model.FlatNo.Trim() : (!string.IsNullOrWhiteSpace(model.UnitNo) ? model.UnitNo.Trim() : "");

                cmd.Parameters.AddWithValue("@sid",     model.SocietyId);
                cmd.Parameters.AddWithValue("@fyid",    (object?)model.FYId    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@name",    model.MemberName.Trim());
                cmd.Parameters.AddWithValue("@desig",   (object?)model.Designation?.Trim() ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@flat",    (object?)flatVal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@unit",    (object?)flatVal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@contact", (object?)model.ContactNo?.Trim()   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@email",   (object?)model.Email?.Trim()       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@period",  (object?)model.WorkingPeriod?.Trim() ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@addr",    (object?)model.Address?.Trim()     ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@rem",     (object?)model.Remark?.Trim()      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@from",    model.FromDate.HasValue ? model.FromDate.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@to",      model.ToDate.HasValue   ? model.ToDate.Value   : DBNull.Value);
                cmd.Parameters.AddWithValue("@sign",    model.IsSignatory);
                cmd.Parameters.AddWithValue("@active",  model.IsActive);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { 
                    success = true, 
                    message = "Committee member added successfully.", 
                    committeeId = newId,
                    data = new {
                        committeeId = newId,
                        societyId = model.SocietyId,
                        memberName = model.MemberName.Trim(),
                        designation = model.Designation?.Trim() ?? "",
                        flatNo = flatVal,
                        unitNo = flatVal,
                        contactNo = model.ContactNo?.Trim() ?? "",
                        email = model.Email?.Trim() ?? "",
                        workingPeriod = model.WorkingPeriod?.Trim() ?? "",
                        address = model.Address?.Trim() ?? "",
                        remark = model.Remark?.Trim() ?? "",
                        isSignatory = model.IsSignatory,
                        isActive = model.IsActive
                    }
                });
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
                var flatVal = !string.IsNullOrWhiteSpace(model.FlatNo) ? model.FlatNo.Trim() : (!string.IsNullOrWhiteSpace(model.UnitNo) ? model.UnitNo.Trim() : "");

                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocCommittee SET
                        MemberName    = @name,
                        Designation   = @desig,
                        FlatNo        = @flat,
                        UnitNo        = @unit,
                        ContactNo     = @contact,
                        Email         = @email,
                        WorkingPeriod = @period,
                        Address       = @addr,
                        Remark        = @rem,
                        FromDate      = @from,
                        ToDate        = @to,
                        IsSignatory   = @sign,
                        IsActive      = @active
                    WHERE CommitteeId = @id";

                cmd.Parameters.AddWithValue("@name",    model.MemberName.Trim());
                cmd.Parameters.AddWithValue("@desig",   (object?)model.Designation?.Trim() ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@flat",    (object?)flatVal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@unit",    (object?)flatVal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@contact", (object?)model.ContactNo?.Trim()   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@email",   (object?)model.Email?.Trim()       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@period",  (object?)model.WorkingPeriod?.Trim() ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@addr",    (object?)model.Address?.Trim()     ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@rem",     (object?)model.Remark?.Trim()      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@from",    model.FromDate.HasValue ? model.FromDate.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@to",      model.ToDate.HasValue   ? model.ToDate.Value   : DBNull.Value);
                cmd.Parameters.AddWithValue("@sign",    model.IsSignatory);
                cmd.Parameters.AddWithValue("@active",  model.IsActive);
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
                cmd.CommandText = "DELETE FROM jeevika_erp.SocCommittee WHERE CommitteeId = @id";
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
            string S(string col) { try { return r[col]?.ToString() ?? ""; } catch { return ""; } }

            var flat = S("FlatNo");
            if (string.IsNullOrWhiteSpace(flat)) flat = S("UnitNo");

            return new
            {
                committeeId   = Get<int>("CommitteeId"),
                commMemberId  = Get<int>("CommitteeId"),
                societyId     = Get<int>("SocietyId"),
                fyId          = r["FYId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["FYId"]),
                memberName    = S("MemberName"),
                name          = S("MemberName"),
                designation   = S("Designation"),
                flatNo        = flat,
                unitNo        = flat,
                contactNo     = S("ContactNo"),
                phone         = S("ContactNo"),
                email         = S("Email"),
                email_Id      = S("Email"),
                workingPeriod = S("WorkingPeriod"),
                address       = S("Address"),
                remark        = S("Remark"),
                fromDate      = r["FromDate"] == DBNull.Value ? null : ((DateTime)r["FromDate"]).ToString("yyyy-MM-dd"),
                toDate        = r["ToDate"] == DBNull.Value ? null : ((DateTime)r["ToDate"]).ToString("yyyy-MM-dd"),
                isSignatory   = Get<bool>("IsSignatory"),
                isActive      = Get<bool>("IsActive")
            };
        }
    }

    public class CommitteeModel
    {
        public int       SocietyId     { get; set; }
        public int?      FYId          { get; set; }
        public string    MemberName    { get; set; } = "";
        public string?   Designation   { get; set; }
        public string?   FlatNo        { get; set; }
        public string?   UnitNo        { get; set; }
        public string?   ContactNo     { get; set; }
        public string?   Email         { get; set; }
        public string?   WorkingPeriod { get; set; }
        public string?   Address       { get; set; }
        public string?   Remark        { get; set; }
        public DateTime? FromDate      { get; set; }
        public DateTime? ToDate        { get; set; }
        public bool      IsSignatory   { get; set; } = false;
        public bool      IsActive      { get; set; } = true;
    }
}
