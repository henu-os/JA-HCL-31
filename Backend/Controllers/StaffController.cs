// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — StaffController
// CRUD endpoints for Staff Master table
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/staff")]
    [AllowAnonymous]
    public class StaffController : ControllerBase
    {
        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetAll([FromQuery] int societyId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                if (societyId <= 0)
                    return Ok(new { success = true, data = new List<object>(), count = 0 });

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT StaffId, SocietyId, StaffCode, StaffName, Designation,
                           PANNo, TDSRate, ContactNo, Email, JoiningDate,
                           Phone2, MonthlyCost, EndDate, Status, BankHolder, BankAccount,
                           BankName, BankIfsc, BankBranch, TdsSection, PfNo, EsicNo,
                           IsAuthorized, Notes, IsDeleted, CreatedAt
                    FROM jeevika_erp.SocStaff
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                    ORDER BY StaffName";
                cmd.Parameters.AddWithValue("@sid", societyId);

                var list = new List<object>();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read()) list.Add(MapStaff(r));
                }

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost]
        public IActionResult Create([FromBody] StaffModel model)
        {
            if (model.SocietyId <= 0 || string.IsNullOrWhiteSpace(model.StaffName) || string.IsNullOrWhiteSpace(model.StaffCode))
                return BadRequest(new { success = false, message = "SocietyId, StaffCode and StaffName are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocStaff
                        (SocietyId, StaffCode, StaffName, Designation, PANNo, TDSRate, ContactNo, Email, JoiningDate,
                         Phone2, MonthlyCost, EndDate, Status, BankHolder, BankAccount, BankName, BankIfsc, BankBranch,
                         TdsSection, PfNo, EsicNo, IsAuthorized, Notes, IsDeleted, CreatedAt)
                    VALUES
                        (@sid, @code, @name, @desig, @pan, @tds, @contact, @email, @jdate,
                         @phone2, @cost, @edate, @status, @bholder, @bacc, @bname, @bifsc, @bbranch,
                         @tdssec, @pf, @esic, @isauth, @notes, FALSE, NOW())
                    RETURNING StaffId";

                cmd.Parameters.AddWithValue("@sid",     model.SocietyId);
                cmd.Parameters.AddWithValue("@code",    model.StaffCode.Trim());
                cmd.Parameters.AddWithValue("@name",    model.StaffName.Trim());
                cmd.Parameters.AddWithValue("@desig",   (object?)model.Designation ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@pan",     (object?)model.PANNo       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tds",     model.TDSRate);
                cmd.Parameters.AddWithValue("@contact", (object?)model.ContactNo   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@email",   (object?)model.Email       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@jdate",   model.JoiningDate.HasValue ? model.JoiningDate.Value : DBNull.Value);

                cmd.Parameters.AddWithValue("@phone2",  (object?)model.Phone2      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cost",    model.MonthlyCost);
                cmd.Parameters.AddWithValue("@edate",   model.EndDate.HasValue ? model.EndDate.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@status",  string.IsNullOrWhiteSpace(model.Status) ? "Active" : model.Status);
                cmd.Parameters.AddWithValue("@bholder", (object?)model.BankHolder  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bacc",    (object?)model.BankAccount ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bname",   (object?)model.BankName    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bifsc",   (object?)model.BankIfsc    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bbranch", (object?)model.BankBranch  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tdssec",  string.IsNullOrWhiteSpace(model.TdsSection) ? "None" : model.TdsSection);
                cmd.Parameters.AddWithValue("@pf",      (object?)model.PfNo        ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@esic",    (object?)model.EsicNo      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@isauth",  model.IsAuthorized);
                cmd.Parameters.AddWithValue("@notes",   (object?)model.Notes       ?? DBNull.Value);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, message = "Staff created successfully.", staffId = newId });
            }
            catch (PostgresException ex) when (ex.SqlState == "23505")
            {
                return Conflict(new { success = false, message = "Staff code already exists in this society." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] StaffModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocStaff SET
                        StaffCode   = @code,
                        StaffName   = @name,
                        Designation = @desig,
                        PANNo       = @pan,
                        TDSRate     = @tds,
                        ContactNo   = @contact,
                        Email       = @email,
                        JoiningDate = @jdate,
                        Phone2      = @phone2,
                        MonthlyCost = @cost,
                        EndDate     = @edate,
                        Status      = @status,
                        BankHolder  = @bholder,
                        BankAccount = @bacc,
                        BankName    = @bname,
                        BankIfsc    = @bifsc,
                        BankBranch  = @bbranch,
                        TdsSection  = @tdssec,
                        PfNo        = @pf,
                        EsicNo      = @esic,
                        IsAuthorized= @isauth,
                        Notes       = @notes
                    WHERE StaffId = @id AND IsDeleted = FALSE";

                cmd.Parameters.AddWithValue("@code",    model.StaffCode.Trim());
                cmd.Parameters.AddWithValue("@name",    model.StaffName.Trim());
                cmd.Parameters.AddWithValue("@desig",   (object?)model.Designation ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@pan",     (object?)model.PANNo       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tds",     model.TDSRate);
                cmd.Parameters.AddWithValue("@contact", (object?)model.ContactNo   ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@email",   (object?)model.Email       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@jdate",   model.JoiningDate.HasValue ? model.JoiningDate.Value : DBNull.Value);

                cmd.Parameters.AddWithValue("@phone2",  (object?)model.Phone2      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cost",    model.MonthlyCost);
                cmd.Parameters.AddWithValue("@edate",   model.EndDate.HasValue ? model.EndDate.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@status",  string.IsNullOrWhiteSpace(model.Status) ? "Active" : model.Status);
                cmd.Parameters.AddWithValue("@bholder", (object?)model.BankHolder  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bacc",    (object?)model.BankAccount ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bname",   (object?)model.BankName    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bifsc",   (object?)model.BankIfsc    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bbranch", (object?)model.BankBranch  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tdssec",  string.IsNullOrWhiteSpace(model.TdsSection) ? "None" : model.TdsSection);
                cmd.Parameters.AddWithValue("@pf",      (object?)model.PfNo        ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@esic",    (object?)model.EsicNo      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@isauth",  model.IsAuthorized);
                cmd.Parameters.AddWithValue("@notes",   (object?)model.Notes       ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@id",      id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0) return NotFound(new { success = false, message = "Staff member not found." });

                return Ok(new { success = true, message = "Staff updated successfully." });
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
                cmd.CommandText = "UPDATE jeevika_erp.SocStaff SET IsDeleted = TRUE WHERE StaffId = @id AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0) return NotFound(new { success = false, message = "Staff member not found." });

                return Ok(new { success = true, message = "Staff deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static object MapStaff(NpgsqlDataReader r)
        {
            T? Get<T>(string col)
            {
                try
                {
                    var ordinal = r.GetOrdinal(col);
                    var v = r[ordinal];
                    return v == DBNull.Value ? default : (T)Convert.ChangeType(v, typeof(T));
                }
                catch { return default; }
            }
            string S(string col)
            {
                try
                {
                    var ordinal = r.GetOrdinal(col);
                    return r[ordinal]?.ToString() ?? "";
                }
                catch { return ""; }
            }

            var staffId = Get<int>("StaffId");
            var staffCode = S("StaffCode");
            var staffName = S("StaffName");
            var designation = S("Designation");
            var panNo = S("PANNo");
            var tdsRate = Get<decimal>("TDSRate");
            var contactNo = S("ContactNo");
            var email = S("Email");
            var jDate = r["JoiningDate"] == DBNull.Value ? null : ((DateTime)r["JoiningDate"]).ToString("yyyy-MM-dd");
            var eDate = r["EndDate"] == DBNull.Value ? null : ((DateTime)r["EndDate"]).ToString("yyyy-MM-dd");

            var phone2 = S("Phone2");
            var monthlyCost = Get<decimal>("MonthlyCost");
            var status = S("Status");
            if (string.IsNullOrWhiteSpace(status)) status = "Active";
            var bankHolder = S("BankHolder");
            var bankAccount = S("BankAccount");
            var bankName = S("BankName");
            var bankIfsc = S("BankIfsc");
            var bankBranch = S("BankBranch");
            var tdsSection = S("TdsSection");
            if (string.IsNullOrWhiteSpace(tdsSection)) tdsSection = "None";
            var pfNo = S("PfNo");
            var esicNo = S("EsicNo");
            var isAuthorized = Get<bool>("IsAuthorized");
            var notes = S("Notes");

            return new
            {
                staffId     = staffId,
                societyId   = Get<int>("SocietyId"),
                staffCode   = staffCode,
                staffName   = staffName,
                designation = designation,
                panNo       = panNo,
                tdsRate     = tdsRate,
                contactNo   = contactNo,
                phone2      = phone2,
                email       = email,
                joiningDate = jDate,
                endDate     = eDate,
                monthlyCost = monthlyCost,
                status      = status,
                bankHolder  = bankHolder,
                bankAccount = bankAccount,
                bankName    = bankName,
                bankIfsc    = bankIfsc,
                bankBranch  = bankBranch,
                tdsSection  = tdsSection,
                pfNo        = pfNo,
                esicNo      = esicNo,
                isAuthorized= isAuthorized,
                notes       = notes,
                isDeleted   = Get<bool>("IsDeleted"),
                createdAt   = Get<DateTime>("CreatedAt")
            };
        }
    }

    public class StaffModel
    {
        public int       SocietyId    { get; set; }
        public string    StaffCode    { get; set; } = "";
        public string    StaffName    { get; set; } = "";
        public string?   Designation  { get; set; }
        public string?   PANNo        { get; set; }
        public decimal   TDSRate      { get; set; } = 0;
        public string?   ContactNo    { get; set; }
        public string?   Phone2       { get; set; }
        public string?   Email        { get; set; }
        public decimal   MonthlyCost  { get; set; } = 0;
        public DateTime? JoiningDate  { get; set; }
        public DateTime? EndDate      { get; set; }
        public string?   Status       { get; set; } = "Active";
        public string?   BankHolder   { get; set; }
        public string?   BankAccount  { get; set; }
        public string?   BankName     { get; set; }
        public string?   BankIfsc     { get; set; }
        public string?   BankBranch   { get; set; }
        public string?   TdsSection   { get; set; } = "None";
        public string?   PfNo         { get; set; }
        public string?   EsicNo       { get; set; }
        public bool      IsAuthorized { get; set; } = false;
        public string?   Notes        { get; set; }
    }
}
