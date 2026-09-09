// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — SocietyController
// GET    /api/societies        → list all societies
// GET    /api/societies/{id}   → get one society by ID
// POST   /api/societies        → create society
// PUT    /api/societies/{id}   → update society
// DELETE /api/societies/{id}   → soft-delete society
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/societies")]
    [AllowAnonymous]
    public class SocietyController : ControllerBase
    {
        // ── GET /api/societies ────────────────────────────
        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetAll()
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT SocietyId, SocietyCode, SocietyName, SocMarName,
                           StartingYear, Address, City, Pincode, Phone, Email,
                           RegistrationNo, PANNumber, TAN, PTNo, UIDNumber,
                           AreaType, AreaCategory, AreaUnit,
                           GSTApplicable, GSTNumber, HSNCode, CGSTCode, SGSTCode,
                           CGSTPct, SGSTPct, IntDuesGST, ExemptLimit, ExemptAmount,
                           ChairmanName, SecretaryName, TreasurerName,
                           HonChairman, HonSecretary, HonTreasurer,
                           ContactName1, ContactPhone1, ContactEmail1,
                           ContactName2, ContactPhone2, ContactEmail2,
                           CommWhatsApp, CommSMS, CommRCS, CommEmail, CommNotification,
                           BankName, BankAccountNo, BankBranch, IFSCCode,
                           LogoPath, IsActive, CreatedAt, UpdatedAt
                    FROM jeevika_erp.SocietyInfo
                    WHERE IsActive = TRUE
                    ORDER BY SocietyName";

                var list = new List<object>();
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                    list.Add(MapSociety(reader));

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/societies/{id} ───────────────────────
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT * FROM jeevika_erp.SocietyInfo
                    WHERE SocietyId = @id AND IsActive = TRUE
                    LIMIT 1";
                cmd.Parameters.AddWithValue("@id", id);

                using var reader = cmd.ExecuteReader();
                if (!reader.Read())
                    return NotFound(new { success = false, message = "Society not found." });

                return Ok(new { success = true, data = MapSociety(reader) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/societies ───────────────────────────
        [HttpPost]
        public IActionResult Create([FromBody] SocietyModel model)
        {
            if (string.IsNullOrWhiteSpace(model.SocietyCode) ||
                string.IsNullOrWhiteSpace(model.SocietyName))
                return BadRequest(new { success = false, message = "Society Code and Name are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocietyInfo
                        (SocietyCode, SocietyName, SocMarName,
                         StartingYear, Address, City, Pincode, Phone, Email,
                         RegistrationNo, PANNumber, TAN, PTNo, UIDNumber,
                         AreaType, AreaCategory, AreaUnit,
                         GSTApplicable, GSTNumber, HSNCode, CGSTCode, SGSTCode,
                         CGSTPct, SGSTPct, IntDuesGST, ExemptLimit, ExemptAmount,
                         ChairmanName, SecretaryName, TreasurerName,
                         HonChairman, HonSecretary, HonTreasurer,
                         ContactName1, ContactPhone1, ContactEmail1,
                         ContactName2, ContactPhone2, ContactEmail2,
                         CommWhatsApp, CommSMS, CommRCS, CommEmail, CommNotification,
                         BankName, BankAccountNo, BankBranch, IFSCCode,
                         IsActive, CreatedAt, UpdatedAt)
                    VALUES
                        (@code, @name, @marname,
                         @startyear, @addr, @city, @pin, @phone, @email,
                         @regno, @pan, @tan, @ptno, @uid,
                         @areatype, @areacat, @areaunit,
                         @gstapp, @gstno, @hsn, @cgstcode, @sgstcode,
                         @cgstpct, @sgstpct, @intdues, @exemptlimit, @exemptamt,
                         @chair, @sec, @trea, @honchair, @honsec, @hontrea,
                         @cn1, @cp1, @ce1, @cn2, @cp2, @ce2,
                         @cwa, @csms, @crcs, @cemail, @cnotif,
                         @bank, @bankno, @branch, @ifsc,
                         TRUE, NOW(), NOW())
                    RETURNING SocietyId";

                AddParams(cmd, model);
                var newId = Convert.ToInt32(cmd.ExecuteScalar());

                // Auto-create user's selected Starting Financial Year for this new society
                if (!string.IsNullOrWhiteSpace(model.StartingYear))
                {
                    var fyLabel = model.StartingYear.Trim();
                    DateTime fyStart = new DateTime(DateTime.Now.Year, 4, 1);
                    DateTime fyEnd   = new DateTime(DateTime.Now.Year + 1, 3, 31);

                    var match = System.Text.RegularExpressions.Regex.Match(fyLabel, @"^(\d{4})");
                    if (match.Success && int.TryParse(match.Groups[1].Value, out int startYr))
                    {
                        fyStart = new DateTime(startYr, 4, 1);
                        fyEnd   = new DateTime(startYr + 1, 3, 31);
                    }

                    using var fyCmd = conn.CreateCommand();
                    fyCmd.CommandText = @"
                        INSERT INTO jeevika_erp.FinancialYear
                            (SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed, CreatedAt)
                        VALUES
                            (@sid, @label, @start, @end, TRUE, FALSE, NOW())
                        ON CONFLICT (SocietyId, FYLabel) DO NOTHING";
                    fyCmd.Parameters.AddWithValue("@sid",   newId);
                    fyCmd.Parameters.AddWithValue("@label", fyLabel);
                    fyCmd.Parameters.AddWithValue("@start", fyStart);
                    fyCmd.Parameters.AddWithValue("@end",   fyEnd);
                    fyCmd.ExecuteNonQuery();
                }

                return Ok(new { success = true, message = "Society created successfully.", societyId = newId });
            }
            catch (PostgresException ex) when (ex.SqlState == "23505")
            {
                return Conflict(new { success = false, message = "Society code already exists." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/societies/{id} ───────────────────────
        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] SocietyModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocietyInfo SET
                        SocietyName   = @name,       SocMarName    = @marname,
                        StartingYear  = @startyear,
                        Address       = @addr,        City          = @city,
                        Pincode       = @pin,         Phone         = @phone,
                        Email         = @email,       RegistrationNo= @regno,
                        PANNumber     = @pan,         TAN           = @tan,
                        PTNo          = @ptno,        UIDNumber     = @uid,
                        AreaType      = @areatype,    AreaCategory  = @areacat,
                        AreaUnit      = @areaunit,
                        GSTApplicable = @gstapp,      GSTNumber     = @gstno,
                        HSNCode       = @hsn,         CGSTCode      = @cgstcode,
                        SGSTCode      = @sgstcode,    CGSTPct       = @cgstpct,
                        SGSTPct       = @sgstpct,     IntDuesGST    = @intdues,
                        ExemptLimit   = @exemptlimit, ExemptAmount  = @exemptamt,
                        ChairmanName  = @chair,       SecretaryName = @sec,
                        TreasurerName = @trea,        HonChairman   = @honchair,
                        HonSecretary  = @honsec,      HonTreasurer  = @hontrea,
                        ContactName1  = @cn1,         ContactPhone1 = @cp1,
                        ContactEmail1 = @ce1,         ContactName2  = @cn2,
                        ContactPhone2 = @cp2,         ContactEmail2 = @ce2,
                        CommWhatsApp  = @cwa,         CommSMS       = @csms,
                        CommRCS       = @crcs,        CommEmail     = @cemail,
                        CommNotification = @cnotif,
                        BankName      = @bank,        BankAccountNo = @bankno,
                        BankBranch    = @branch,      IFSCCode      = @ifsc,
                        UpdatedAt     = NOW()
                    WHERE SocietyId = @id AND IsActive = TRUE";

                AddParams(cmd, model);
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Society not found." });

                // Auto-create/ensure active FinancialYear for updated StartingYear
                object? activeFY = null;
                if (!string.IsNullOrWhiteSpace(model.StartingYear))
                {
                    string rawYear = model.StartingYear.Trim();
                    var match = System.Text.RegularExpressions.Regex.Match(rawYear, @"^(\d{4})");
                    int startYr = match.Success && int.TryParse(match.Groups[1].Value, out int sy) ? sy : DateTime.Now.Year;
                    int endYr = startYr + 1;
                    string fyLabel = $"{startYr}-{(endYr % 100):D2}";
                    DateTime fyStart = new DateTime(startYr, 4, 1);
                    DateTime fyEnd = new DateTime(endYr, 3, 31);

                    using var fyCmd = conn.CreateCommand();
                    fyCmd.CommandText = @"
                        INSERT INTO jeevika_erp.FinancialYear
                            (SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed, CreatedAt)
                        VALUES
                            (@sid, @label, @start, @end, TRUE, FALSE, NOW())
                        ON CONFLICT (SocietyId, FYLabel) DO UPDATE
                        SET IsActive = TRUE";
                    fyCmd.Parameters.AddWithValue("@sid", id);
                    fyCmd.Parameters.AddWithValue("@label", fyLabel);
                    fyCmd.Parameters.AddWithValue("@start", fyStart);
                    fyCmd.Parameters.AddWithValue("@end", fyEnd);
                    fyCmd.ExecuteNonQuery();

                    using var getIdCmd = conn.CreateCommand();
                    getIdCmd.CommandText = "SELECT FYId, FYLabel, FYStart, FYEnd FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid AND FYLabel = @label LIMIT 1";
                    getIdCmd.Parameters.AddWithValue("@sid", id);
                    getIdCmd.Parameters.AddWithValue("@label", fyLabel);
                    using var rFy = getIdCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        activeFY = new
                        {
                            fYId = Convert.ToInt32(rFy["FYId"]),
                            fYLabel = rFy["FYLabel"].ToString() ?? fyLabel,
                            fYStart = ((DateTime)rFy["FYStart"]).ToString("yyyy-MM-dd"),
                            fYEnd = ((DateTime)rFy["FYEnd"]).ToString("yyyy-MM-dd")
                        };
                    }
                }

                return Ok(new { success = true, message = "Society updated successfully.", activeFY });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/societies/{id} ────────────────────
        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocietyInfo
                    SET IsActive = FALSE, UpdatedAt = NOW()
                    WHERE SocietyId = @id AND IsActive = TRUE";
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Society not found." });

                return Ok(new { success = true, message = "Society deleted." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── Helper: Map reader → anonymous object ─────────
        private static object MapSociety(NpgsqlDataReader r)
        {
            string S(string col)
            {
                try { var v = r[col]; return v == DBNull.Value ? "" : v.ToString() ?? ""; }
                catch { return ""; }
            }
            bool B(string col)
            {
                try { var v = r[col]; return v != DBNull.Value && Convert.ToBoolean(v); }
                catch { return false; }
            }
            decimal D(string col)
            {
                try { var v = r[col]; return v == DBNull.Value ? 0 : Convert.ToDecimal(v); }
                catch { return 0; }
            }
            int I(string col)
            {
                try { var v = r[col]; return v == DBNull.Value ? 0 : Convert.ToInt32(v); }
                catch { return 0; }
            }

            return new
            {
                societyId         = I("SocietyId"),
                societyCode       = S("SocietyCode"),
                societyName       = S("SocietyName"),
                socMarName        = S("SocMarName"),
                startingYear      = S("StartingYear"),
                address           = S("Address"),
                city              = S("City"),
                pincode           = S("Pincode"),
                phone             = S("Phone"),
                email             = S("Email"),
                registrationNo    = S("RegistrationNo"),
                panNumber         = S("PANNumber"),
                tan               = S("TAN"),
                ptNo              = S("PTNo"),
                uidNumber         = S("UIDNumber"),
                areaType          = S("AreaType"),
                areaCategory      = S("AreaCategory"),
                areaUnit          = S("AreaUnit"),
                gstApplicable     = B("GSTApplicable"),
                gstNumber         = S("GSTNumber"),
                hsnCode           = S("HSNCode"),
                cgstCode          = S("CGSTCode"),
                sgstCode          = S("SGSTCode"),
                cgstPct           = D("CGSTPct"),
                sgstPct           = D("SGSTPct"),
                intDuesGST        = S("IntDuesGST"),
                exemptLimit       = D("ExemptLimit"),
                exemptAmount      = D("ExemptAmount"),
                chairmanName      = S("ChairmanName"),
                secretaryName     = S("SecretaryName"),
                treasurerName     = S("TreasurerName"),
                honChairman       = S("HonChairman"),
                honSecretary      = S("HonSecretary"),
                honTreasurer      = S("HonTreasurer"),
                contactName1      = S("ContactName1"),
                contactPhone1     = S("ContactPhone1"),
                contactEmail1     = S("ContactEmail1"),
                contactName2      = S("ContactName2"),
                contactPhone2     = S("ContactPhone2"),
                contactEmail2     = S("ContactEmail2"),
                commWhatsApp      = S("CommWhatsApp"),
                commSMS           = S("CommSMS"),
                commRCS           = S("CommRCS"),
                commEmail         = S("CommEmail"),
                commNotification  = S("CommNotification"),
                bankName          = S("BankName"),
                bankAccountNo     = S("BankAccountNo"),
                bankBranch        = S("BankBranch"),
                ifscCode          = S("IFSCCode"),
                logoPath          = S("LogoPath"),
                isActive          = B("IsActive")
            };
        }

        // ── Helper: Bind all model params to command ──────
        private static void AddParams(NpgsqlCommand cmd, SocietyModel m)
        {
            void P(string k, object? v) => cmd.Parameters.AddWithValue(k, v ?? DBNull.Value);

            P("@code",        m.SocietyCode);
            P("@name",        m.SocietyName);
            P("@marname",     m.SocMarName);
            P("@startyear",   m.StartingYear);
            P("@addr",        m.Address);
            P("@city",        m.City);
            P("@pin",         m.Pincode);
            P("@phone",       m.Phone);
            P("@email",       m.Email);
            P("@regno",       m.RegistrationNo);
            P("@pan",         m.PANNumber);
            P("@tan",         m.TAN);
            P("@ptno",        m.PTNo);
            P("@uid",         m.UIDNumber);
            P("@areatype",    m.AreaType);
            P("@areacat",     m.AreaCategory);
            P("@areaunit",    m.AreaUnit ?? "Sq.Ft");
            cmd.Parameters.AddWithValue("@gstapp", m.GSTApplicable);
            P("@gstno",       m.GSTNumber);
            P("@hsn",         m.HSNCode);
            P("@cgstcode",    m.CGSTCode);
            P("@sgstcode",    m.SGSTCode);
            cmd.Parameters.AddWithValue("@cgstpct",      m.CGSTPct);
            cmd.Parameters.AddWithValue("@sgstpct",      m.SGSTPct);
            P("@intdues",     m.IntDuesGST ?? "No");
            cmd.Parameters.AddWithValue("@exemptlimit",  m.ExemptLimit);
            cmd.Parameters.AddWithValue("@exemptamt",    m.ExemptAmount);
            P("@chair",       m.ChairmanName);
            P("@sec",         m.SecretaryName);
            P("@trea",        m.TreasurerName);
            P("@honchair",    m.HonChairman);
            P("@honsec",      m.HonSecretary);
            P("@hontrea",     m.HonTreasurer);
            P("@cn1",         m.ContactName1);
            P("@cp1",         m.ContactPhone1);
            P("@ce1",         m.ContactEmail1);
            P("@cn2",         m.ContactName2);
            P("@cp2",         m.ContactPhone2);
            P("@ce2",         m.ContactEmail2);
            P("@cwa",         m.CommWhatsApp ?? "N");
            P("@csms",        m.CommSMS      ?? "N");
            P("@crcs",        m.CommRCS      ?? "N");
            P("@cemail",      m.CommEmail    ?? "N");
            P("@cnotif",      m.CommNotification ?? "N");
            P("@bank",        m.BankName);
            P("@bankno",      m.BankAccountNo);
            P("@branch",      m.BankBranch);
            P("@ifsc",        m.IFSCCode);
        }
    }

    // ── Society Model ─────────────────────────────────────
    public class SocietyModel
    {
        public string?  SocietyCode       { get; set; }
        public string?  SocietyName       { get; set; }
        public string?  SocMarName        { get; set; }
        public string?  StartingYear      { get; set; }
        public string?  Address           { get; set; }
        public string?  City              { get; set; }
        public string?  Pincode           { get; set; }
        public string?  Phone             { get; set; }
        public string?  Email             { get; set; }
        public string?  RegistrationNo    { get; set; }
        public string?  PANNumber         { get; set; }
        public string?  TAN               { get; set; }
        public string?  PTNo              { get; set; }
        public string?  UIDNumber         { get; set; }
        public string?  AreaType          { get; set; }
        public string?  AreaCategory      { get; set; }
        public string?  AreaUnit          { get; set; }
        public bool     GSTApplicable     { get; set; } = false;
        public string?  GSTNumber         { get; set; }
        public string?  HSNCode           { get; set; }
        public string?  CGSTCode          { get; set; }
        public string?  SGSTCode          { get; set; }
        public decimal  CGSTPct           { get; set; } = 9;
        public decimal  SGSTPct           { get; set; } = 9;
        public string?  IntDuesGST        { get; set; }
        public decimal  ExemptLimit       { get; set; } = 7500;
        public decimal  ExemptAmount      { get; set; } = 7500;
        public string?  ChairmanName      { get; set; }
        public string?  SecretaryName     { get; set; }
        public string?  TreasurerName     { get; set; }
        public string?  HonChairman       { get; set; }
        public string?  HonSecretary      { get; set; }
        public string?  HonTreasurer      { get; set; }
        public string?  ContactName1      { get; set; }
        public string?  ContactPhone1     { get; set; }
        public string?  ContactEmail1     { get; set; }
        public string?  ContactName2      { get; set; }
        public string?  ContactPhone2     { get; set; }
        public string?  ContactEmail2     { get; set; }
        public string?  CommWhatsApp      { get; set; }
        public string?  CommSMS           { get; set; }
        public string?  CommRCS           { get; set; }
        public string?  CommEmail         { get; set; }
        public string?  CommNotification  { get; set; }
        public string?  BankName          { get; set; }
        public string?  BankAccountNo     { get; set; }
        public string?  BankBranch        { get; set; }
        public string?  IFSCCode          { get; set; }
    }
}
