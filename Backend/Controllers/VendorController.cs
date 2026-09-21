// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — VendorController
// GET    /api/vendors?societyId=X  → list vendors
// GET    /api/vendors/{id}         → get single vendor
// POST   /api/vendors              → create vendor
// PUT    /api/vendors/{id}         → update vendor
// DELETE /api/vendors/{id}         → soft-delete vendor
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/vendors")]
    [AllowAnonymous]
    public class VendorController : ControllerBase
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
                    SELECT VendorId, SocietyId, VendorCode, VendorName, PANNo, GSTIN,
                           TDSSection, TDSRate, ContactNo, Email, Address, ContractNo,
                           ContractFrom, ContractTo, ContractValue, IsDeleted, CreatedAt
                    FROM jeevika_erp.SocVendor
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                    ORDER BY VendorName";
                cmd.Parameters.AddWithValue("@sid", societyId);

                var list = new List<object>();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read()) list.Add(MapVendor(r));
                }

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT * FROM jeevika_erp.SocVendor WHERE VendorId = @id AND IsDeleted = FALSE LIMIT 1";
                cmd.Parameters.AddWithValue("@id", id);

                using var r = cmd.ExecuteReader();
                if (!r.Read()) return NotFound(new { success = false, message = "Vendor not found." });

                return Ok(new { success = true, data = MapVendor(r) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost]
        public IActionResult Create([FromBody] VendorModel model)
        {
            if (model.SocietyId <= 0) return BadRequest(new { success = false, message = "societyId is required." });
            if (string.IsNullOrWhiteSpace(model.VendorCode)) model.VendorCode = model.StaffCode ?? model.Code ?? "";
            if (string.IsNullOrWhiteSpace(model.VendorName)) model.VendorName = model.StaffName ?? model.Name ?? "";
            if (string.IsNullOrWhiteSpace(model.ContactNo)) model.ContactNo = model.Phone ?? "";
            if (string.IsNullOrWhiteSpace(model.Address)) model.Address = model.Notes ?? model.Category ?? "";
            if (string.IsNullOrWhiteSpace(model.ContractNo)) model.ContractNo = model.Category ?? model.Designation ?? "";
            if (model.ContractValue == 0 && model.MonthlyCost > 0) model.ContractValue = model.MonthlyCost;

            if (string.IsNullOrWhiteSpace(model.VendorName) || string.IsNullOrWhiteSpace(model.VendorCode))
                return BadRequest(new { success = false, message = "VendorCode and VendorName are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocVendor
                        (SocietyId, VendorCode, VendorName, PANNo, GSTIN, TDSSection, TDSRate,
                         ContactNo, Email, Address, ContractNo, ContractFrom, ContractTo, ContractValue, IsDeleted, CreatedAt)
                    VALUES
                        (@sid, @code, @name, @pan, @gst, @tdsSec, @tdsRate,
                         @contact, @email, @addr, @cNo, @cFrom, @cTo, @cVal, FALSE, NOW())
                    ON CONFLICT (SocietyId, VendorCode) DO UPDATE SET
                        VendorName = EXCLUDED.VendorName,
                        PANNo = EXCLUDED.PANNo,
                        GSTIN = EXCLUDED.GSTIN,
                        TDSSection = EXCLUDED.TDSSection,
                        TDSRate = EXCLUDED.TDSRate,
                        ContactNo = EXCLUDED.ContactNo,
                        Email = EXCLUDED.Email,
                        Address = EXCLUDED.Address,
                        ContractNo = EXCLUDED.ContractNo,
                        ContractFrom = EXCLUDED.ContractFrom,
                        ContractTo = EXCLUDED.ContractTo,
                        ContractValue = EXCLUDED.ContractValue,
                        IsDeleted = FALSE
                    RETURNING VendorId";

                AddVendorParams(cmd, model);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, message = "Vendor saved successfully.", vendorId = newId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] VendorModel model)
        {
            if (model.SocietyId <= 0) return BadRequest(new { success = false, message = "societyId is required." });
            if (string.IsNullOrWhiteSpace(model.VendorCode)) model.VendorCode = model.StaffCode ?? model.Code ?? "";
            if (string.IsNullOrWhiteSpace(model.VendorName)) model.VendorName = model.StaffName ?? model.Name ?? "";
            if (string.IsNullOrWhiteSpace(model.ContactNo)) model.ContactNo = model.Phone ?? "";
            if (string.IsNullOrWhiteSpace(model.Address)) model.Address = model.Notes ?? model.Category ?? "";
            if (string.IsNullOrWhiteSpace(model.ContractNo)) model.ContractNo = model.Category ?? model.Designation ?? "";
            if (model.ContractValue == 0 && model.MonthlyCost > 0) model.ContractValue = model.MonthlyCost;

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocVendor SET
                        VendorCode    = @code,
                        VendorName    = @name,
                        PANNo         = @pan,
                        GSTIN         = @gst,
                        TDSSection    = @tdsSec,
                        TDSRate       = @tdsRate,
                        ContactNo     = @contact,
                        Email         = @email,
                        Address       = @addr,
                        ContractNo    = @cNo,
                        ContractFrom  = @cFrom,
                        ContractTo    = @cTo,
                        ContractValue = @cVal,
                        IsDeleted     = FALSE
                    WHERE VendorId = @id";

                AddVendorParams(cmd, model);
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0) return NotFound(new { success = false, message = "Vendor not found." });

                return Ok(new { success = true, message = "Vendor updated successfully.", vendorId = id });
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
                cmd.CommandText = "UPDATE jeevika_erp.SocVendor SET IsDeleted = TRUE WHERE VendorId = @id";
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                return Ok(new { success = true, message = "Vendor deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static object MapVendor(NpgsqlDataReader r)
        {
            T? Get<T>(string col)
            {
                try { var v = r[col]; return v == DBNull.Value ? default : (T)Convert.ChangeType(v, typeof(T)); }
                catch { return default; }
            }
            string S(string col) => r[col]?.ToString() ?? "";

            return new
            {
                vendorId      = Get<int>("VendorId"),
                societyId     = Get<int>("SocietyId"),
                vendorCode    = S("VendorCode"),
                vendorName    = S("VendorName"),
                panNo         = S("PANNo"),
                gstin         = S("GSTIN"),
                tdsSection    = S("TDSSection"),
                tdsRate       = Get<decimal>("TDSRate"),
                contactNo     = S("ContactNo"),
                email         = S("Email"),
                address       = S("Address"),
                contractNo    = S("ContractNo"),
                category      = S("ContractNo"),
                contractFrom  = r["ContractFrom"] == DBNull.Value ? null : ((DateTime)r["ContractFrom"]).ToString("yyyy-MM-dd"),
                contractTo    = r["ContractTo"] == DBNull.Value ? null : ((DateTime)r["ContractTo"]).ToString("yyyy-MM-dd"),
                contractValue = Get<decimal>("ContractValue"),
                monthlyCost   = Get<decimal>("ContractValue"),
                isDeleted     = Get<bool>("IsDeleted"),
                createdAt     = Get<DateTime>("CreatedAt")
            };
        }

        private static void AddVendorParams(NpgsqlCommand cmd, VendorModel m)
        {
            cmd.Parameters.AddWithValue("@sid",     m.SocietyId <= 0 ? 1 : m.SocietyId);
            cmd.Parameters.AddWithValue("@code",    (m.VendorCode ?? "").Trim());
            cmd.Parameters.AddWithValue("@name",    (m.VendorName ?? "").Trim());
            cmd.Parameters.AddWithValue("@pan",     (object?)m.PANNo        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gst",     (object?)m.GSTIN        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tdsSec",  (object?)m.TDSSection   ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tdsRate", m.TDSRate);
            cmd.Parameters.AddWithValue("@contact", (object?)m.ContactNo    ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@email",   (object?)m.Email        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@addr",    (object?)m.Address      ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@cNo",     (object?)m.ContractNo   ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@cFrom",   m.ContractFrom.HasValue ? m.ContractFrom.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@cTo",     m.ContractTo.HasValue   ? m.ContractTo.Value   : DBNull.Value);
            cmd.Parameters.AddWithValue("@cVal",    m.ContractValue);
        }
    }

    public class VendorModel
    {
        public int       SocietyId     { get; set; }
        public string?   VendorCode    { get; set; }
        public string?   StaffCode     { get; set; }
        public string?   Code          { get; set; }
        public string?   VendorName    { get; set; }
        public string?   StaffName     { get; set; }
        public string?   Name          { get; set; }
        public string?   PANNo         { get; set; }
        public string?   GSTIN         { get; set; }
        public string?   TDSSection    { get; set; }
        public decimal   TDSRate       { get; set; } = 0;
        public string?   ContactNo     { get; set; }
        public string?   Phone         { get; set; }
        public string?   Email         { get; set; }
        public string?   Address       { get; set; }
        public string?   ContractNo    { get; set; }
        public string?   Category      { get; set; }
        public string?   Designation   { get; set; }
        public string?   Notes         { get; set; }
        public DateTime? ContractFrom  { get; set; }
        public DateTime? ContractTo    { get; set; }
        public decimal   ContractValue { get; set; } = 0;
        public decimal   MonthlyCost   { get; set; } = 0;
    }
}
