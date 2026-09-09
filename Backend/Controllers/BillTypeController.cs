// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — BillTypeController
// Full RESTful API for Bill Types, Configured Heads, Interest Specs & Notes
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/bill-types")]
    [AllowAnonymous]
    public class BillTypeController : ControllerBase
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

        private static bool GetBoolSafe(NpgsqlDataReader r, string colName, bool def = false)
        {
            try
            {
                int ord = r.GetOrdinal(colName);
                return r.IsDBNull(ord) ? def : Convert.ToBoolean(r.GetValue(ord));
            }
            catch
            {
                return def;
            }
        }

        // ── GET /api/bill-types ──────────────────────────────────
        [HttpGet]
        public IActionResult GetAll([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                // Check Society GST Applicable
                bool isGstEnabled = false;
                using (var gstCmd = conn.CreateCommand())
                {
                    gstCmd.CommandText = "SELECT GSTApplicable FROM jeevika_erp.SocietyInfo WHERE SocietyId = @socId LIMIT 1";
                    gstCmd.Parameters.AddWithValue("@socId", societyId);
                    var obj = gstCmd.ExecuteScalar();
                    if (obj != null && obj != DBNull.Value)
                    {
                        if (obj is bool b) isGstEnabled = b;
                        else if (bool.TryParse(obj.ToString(), out bool parsed)) isGstEnabled = parsed;
                        else
                        {
                            var str = obj.ToString()?.Trim().ToUpper();
                            isGstEnabled = (str == "Y" || str == "YES" || str == "TRUE" || str == "1");
                        }
                    }
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT bt.BillTypeId, bt.SocietyId, bt.BillTypeCode, bt.BillTypeName, bt.Description, bt.IsActive,
                           COALESCE(btn.InterestPriority, 'Interest First') AS InterestPriority,
                           COALESCE(btn.InterestMethod, 'M-CM') AS InterestMethod,
                           COALESCE(btn.InterestRate, '21%') AS InterestRate
                    FROM jeevika_erp.SocBillType bt
                    LEFT JOIN (
                        SELECT DISTINCT ON (BillTypeId) BillTypeId, SocietyId, InterestPriority, InterestMethod, InterestRate
                        FROM jeevika_erp.SocBillTypeNote
                        ORDER BY BillTypeId, CASE WHEN SocietyId = @socId THEN 0 ELSE 1 END, NoteId DESC
                    ) btn ON bt.BillTypeId = btn.BillTypeId
                    WHERE (bt.SocietyId = @socId OR (@socId <= 0 AND bt.SocietyId = 1)) AND bt.IsActive = TRUE
                    ORDER BY 
                        CASE WHEN LOWER(TRIM(bt.BillTypeName)) = 'maintenance' OR LOWER(TRIM(bt.BillTypeCode)) = 'maint' THEN 0 ELSE 1 END,
                        bt.BillTypeId ASC";
                cmd.Parameters.AddWithValue("@socId", societyId);

                var list = new List<object>();
                var seenIds = new HashSet<int>();
                var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var bId = Convert.ToInt32(r["BillTypeId"]);
                        var rawName = GetStringSafe(r, "BillTypeName", "");
                        var normName = System.Text.RegularExpressions.Regex.Replace(rawName.Trim(), @"\s+", " ");

                        if (seenIds.Contains(bId) || seenNames.Contains(normName))
                        {
                            continue;
                        }

                        seenIds.Add(bId);
                        seenNames.Add(normName);

                        list.Add(new {
                            billTypeId       = bId,
                            societyId        = Convert.ToInt32(r["SocietyId"]),
                            billTypeCode     = GetStringSafe(r, "BillTypeCode", "MAINT"),
                            billTypeName     = normName,
                            description      = GetStringSafe(r, "Description", ""),
                            interestPriority = GetStringSafe(r, "InterestPriority", "Interest First"),
                            interestMethod   = GetStringSafe(r, "InterestMethod", "M-CM"),
                            interestRate     = GetStringSafe(r, "InterestRate", "21%"),
                            isActive         = GetBoolSafe(r, "IsActive", true)
                        });
                    }
                }

                if (list.Count == 0)
                {
                    int sid = societyId > 0 ? societyId : 1;
                    // Create an independent default Maintenance bill type for this society
                    using var createCmd = conn.CreateCommand();
                    createCmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocBillType
                            (SocietyId, BillTypeCode, BillTypeName, Description, IsActive)
                        VALUES
                            (@sid, 'MAINT', 'Maintenance', 'Regular Monthly Maintenance', TRUE)
                        ON CONFLICT (SocietyId, BillTypeCode) DO UPDATE
                        SET IsActive = TRUE, BillTypeName = 'Maintenance'
                        RETURNING BillTypeId";
                    createCmd.Parameters.AddWithValue("@sid", sid);
                    var newBtId = Convert.ToInt32(createCmd.ExecuteScalar());

                    // Create blank notes for this society's bill type
                    using var noteCmd = conn.CreateCommand();
                    noteCmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocBillTypeNote
                            (SocietyId, BillTypeId, Note1, Note2, Note3, BankName, AccountNo, IFSCCode, AccountType, UPINote, InterestMethod, InterestRate, UpdatedAt)
                        VALUES
                            (@sid, @btid, '', '', '', '', '', '', 'saving', '', 'M-CM', '21%', NOW())
                        ON CONFLICT (SocietyId, BillTypeId) DO NOTHING";
                    noteCmd.Parameters.AddWithValue("@sid", sid);
                    noteCmd.Parameters.AddWithValue("@btid", newBtId);
                    noteCmd.ExecuteNonQuery();

                    list.Insert(0, new {
                        billTypeId       = newBtId,
                        societyId        = sid,
                        billTypeCode     = "MAINT",
                        billTypeName     = "Maintenance",
                        description      = "Regular Monthly Maintenance",
                        interestPriority = "Interest First",
                        interestMethod   = "M-CM",
                        interestRate     = "21%",
                        isActive         = true
                    });
                }
                return Ok(new { success = true, isGstEnabled, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/bill-types/{id} ─────────────────────────────
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT BillTypeId, SocietyId, BillTypeCode, BillTypeName, Description, IsActive
                    FROM jeevika_erp.SocBillType
                    WHERE BillTypeId = @id LIMIT 1";
                cmd.Parameters.AddWithValue("@id", id);

                object? billType = null;
                using (var r = cmd.ExecuteReader())
                {
                    if (r.Read())
                    {
                        billType = new {
                            billTypeId   = Convert.ToInt32(r["BillTypeId"]),
                            societyId    = Convert.ToInt32(r["SocietyId"]),
                            billTypeCode = GetStringSafe(r, "BillTypeCode", "MAINT"),
                            billTypeName = System.Text.RegularExpressions.Regex.Replace(GetStringSafe(r, "BillTypeName", "").Trim(), @"\s+", " "),
                            description  = GetStringSafe(r, "Description", ""),
                            isActive     = GetBoolSafe(r, "IsActive", true)
                        };
                    }
                }

                if (billType == null)
                    return NotFound(new { success = false, message = "Bill type not found." });

                // Fetch Heads
                using var headCmd = conn.CreateCommand();
                headCmd.CommandText = @"
                    SELECT h.HeadId, h.SrNo, h.AccountId, h.AccountCode, h.AccountName, a.AccCode AS MasterCode, a.AccName AS MasterName, h.GSTApplicable, h.GSTExempted
                    FROM jeevika_erp.SocBillTypeHead h
                    LEFT JOIN jeevika_erp.SocAccount a ON h.AccountId = a.AccountId
                    WHERE h.BillTypeId = @id
                    ORDER BY h.SrNo ASC";
                headCmd.Parameters.AddWithValue("@id", id);

                var heads = new List<object>();
                using (var r = headCmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var code = GetStringSafe(r, "AccountCode");
                        if (string.IsNullOrEmpty(code)) code = GetStringSafe(r, "MasterCode");

                        var name = GetStringSafe(r, "AccountName");
                        if (string.IsNullOrEmpty(name)) name = GetStringSafe(r, "MasterName");

                        heads.Add(new {
                            headId        = Convert.ToInt32(r["HeadId"]),
                            srNo          = Convert.ToInt32(r["SrNo"]),
                            accountId     = r["AccountId"] != DBNull.Value ? Convert.ToInt32(r["AccountId"]) : (int?)null,
                            accCode       = code,
                            accName       = name,
                            gstApp        = GetBoolSafe(r, "GSTApplicable"),
                            gstExm        = GetBoolSafe(r, "GSTExempted")
                        });
                    }
                }

                // Fetch Notes & Config
                using var noteCmd = conn.CreateCommand();
                noteCmd.CommandText = @"
                    SELECT * FROM jeevika_erp.SocBillTypeNote
                    WHERE BillTypeId = @id LIMIT 1";
                noteCmd.Parameters.AddWithValue("@id", id);

                object? notes = null;
                using (var r = noteCmd.ExecuteReader())
                {
                    if (r.Read())
                    {
                        notes = new {
                            note1               = GetStringSafe(r, "Note1"),
                            note2               = GetStringSafe(r, "Note2"),
                            note3               = GetStringSafe(r, "Note3"),
                            note4               = GetStringSafe(r, "Note4"),
                            note5               = GetStringSafe(r, "Note5"),
                            note6               = GetStringSafe(r, "Note6"),
                            note7               = GetStringSafe(r, "Note7"),
                            note8               = GetStringSafe(r, "Note8"),
                            bankName            = GetStringSafe(r, "BankName"),
                            accountNo           = GetStringSafe(r, "AccountNo"),
                            ifscCode            = GetStringSafe(r, "IFSCCode"),
                            accountType         = GetStringSafe(r, "AccountType", "saving"),
                            upiNote             = GetStringSafe(r, "UPINote"),
                            qrCodePath          = GetStringSafe(r, "QRCodePath"),
                            signaturePath       = GetStringSafe(r, "SignaturePath"),
                            dynamicQR           = GetBoolSafe(r, "DynamicQR"),
                            interestMethod      = GetStringSafe(r, "InterestMethod", "M-CM"),
                            interestRate        = GetStringSafe(r, "InterestRate", "21%"),
                            interestType        = GetStringSafe(r, "InterestType", "Simple"),
                            grossDays           = GetStringSafe(r, "GrossDays"),
                            interestPriority    = GetStringSafe(r, "InterestPriority", "Interest First"),
                            showBillPeriodNotes = GetBoolSafe(r, "ShowBillPeriodNotes"),
                            billMethod          = GetStringSafe(r, "BillMethod", "Monthly"),
                            billMonths          = GetStringSafe(r, "BillMonths", "1"),
                            billDate            = GetStringSafe(r, "BillDate", "01"),
                            billDue             = GetStringSafe(r, "BillDue", "15"),
                            billPeriod          = GetStringSafe(r, "BillPeriod")
                        };
                    }
                }

                return Ok(new { success = true, billType, heads, notes });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message, detail = ex.ToString() });
            }
        }

        // ── POST /api/bill-types ─────────────────────────────────
        [HttpPost]
        public IActionResult Create([FromBody] SaveBillTypeModel model)
        {
            if (string.IsNullOrWhiteSpace(model.BillTypeName))
                return BadRequest(new { success = false, message = "Bill Type Name is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocBillType (SocietyId, BillTypeCode, BillTypeName, Description)
                    VALUES (@socId, @code, @name, @desc)
                    RETURNING BillTypeId";
                cmd.Parameters.AddWithValue("@socId", model.SocietyId > 0 ? model.SocietyId : 1);
                cmd.Parameters.AddWithValue("@code", string.IsNullOrWhiteSpace(model.BillTypeCode) ? model.BillTypeName.Substring(0, Math.Min(5, model.BillTypeName.Length)).ToUpper() : model.BillTypeCode);
                cmd.Parameters.AddWithValue("@name", model.BillTypeName.Trim());
                cmd.Parameters.AddWithValue("@desc", (object?)model.Description ?? DBNull.Value);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, message = "Bill type created successfully!", billTypeId = newId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/bill-types/{id} ─────────────────────────────
        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] SaveBillTypeConfigModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                // 0. Fetch actual SocietyId for this BillType
                int socId = 1;
                using (var getSocCmd = conn.CreateCommand())
                {
                    getSocCmd.CommandText = "SELECT SocietyId FROM jeevika_erp.SocBillType WHERE BillTypeId = @id LIMIT 1";
                    getSocCmd.Parameters.AddWithValue("@id", id);
                    var sObj = getSocCmd.ExecuteScalar();
                    if (sObj != null && sObj != DBNull.Value) socId = Convert.ToInt32(sObj);
                }

                // 1. Update Notes & Config
                using var noteCmd = conn.CreateCommand();
                noteCmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocBillTypeNote (
                        SocietyId, BillTypeId, Note1, Note2, Note3, Note4, Note5, Note6, Note7, Note8,
                        BankName, AccountNo, IFSCCode, AccountType, UPINote, QRCodePath, SignaturePath, DynamicQR,
                        InterestMethod, InterestRate, InterestType, GrossDays, InterestPriority, ShowBillPeriodNotes,
                        BillMethod, BillMonths, BillDate, BillDue, BillPeriod, UpdatedAt
                    ) VALUES (
                        @socId, @id, @n1, @n2, @n3, @n4, @n5, @n6, @n7, @n8,
                        @bn, @ano, @ifsc, @atype, @upi, @qr, @sig, @dynqr,
                        @imethod, @irate, @itype, @gross, @ipriority, @showbp,
                        @bmethod, @bmonths, @bdate, @bdue, @bperiod, NOW()
                    ) ON CONFLICT (SocietyId, BillTypeId) DO UPDATE SET
                        Note1 = EXCLUDED.Note1, Note2 = EXCLUDED.Note2, Note3 = EXCLUDED.Note3,
                        Note4 = EXCLUDED.Note4, Note5 = EXCLUDED.Note5, Note6 = EXCLUDED.Note6,
                        Note7 = EXCLUDED.Note7, Note8 = EXCLUDED.Note8,
                        BankName = EXCLUDED.BankName, AccountNo = EXCLUDED.AccountNo, IFSCCode = EXCLUDED.IFSCCode,
                        AccountType = EXCLUDED.AccountType, UPINote = EXCLUDED.UPINote,
                        QRCodePath = EXCLUDED.QRCodePath, SignaturePath = EXCLUDED.SignaturePath, DynamicQR = EXCLUDED.DynamicQR,
                        InterestMethod = EXCLUDED.InterestMethod, InterestRate = EXCLUDED.InterestRate, InterestType = EXCLUDED.InterestType,
                        GrossDays = EXCLUDED.GrossDays, InterestPriority = EXCLUDED.InterestPriority, ShowBillPeriodNotes = EXCLUDED.ShowBillPeriodNotes,
                        BillMethod = EXCLUDED.BillMethod, BillMonths = EXCLUDED.BillMonths, BillDate = EXCLUDED.BillDate,
                        BillDue = EXCLUDED.BillDue, BillPeriod = EXCLUDED.BillPeriod, UpdatedAt = NOW()";
                noteCmd.Parameters.AddWithValue("@id", id);
                noteCmd.Parameters.AddWithValue("@socId", socId);
                noteCmd.Parameters.AddWithValue("@n1", (object?)model.Note1 ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@n2", (object?)model.Note2 ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@n3", (object?)model.Note3 ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@n4", (object?)model.Note4 ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@n5", (object?)model.Note5 ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@n6", (object?)model.Note6 ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@n7", (object?)model.Note7 ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@n8", (object?)model.Note8 ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@bn", (object?)model.BankName ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@ano", (object?)model.AccountNo ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@ifsc", (object?)model.IFSCCode ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@atype", (object?)model.AccountType ?? "saving");
                noteCmd.Parameters.AddWithValue("@upi", (object?)model.UPINote ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@qr", (object?)model.QRCodePath ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@sig", (object?)model.SignaturePath ?? DBNull.Value);
                noteCmd.Parameters.AddWithValue("@dynqr", model.DynamicQR);
                noteCmd.Parameters.AddWithValue("@imethod", (object?)model.InterestMethod ?? "M-CM");
                noteCmd.Parameters.AddWithValue("@irate", (object?)model.InterestRate ?? "21%");
                noteCmd.Parameters.AddWithValue("@itype", (object?)model.InterestType ?? "Simple");
                noteCmd.Parameters.AddWithValue("@gross", (object?)model.GrossDays ?? "");
                noteCmd.Parameters.AddWithValue("@ipriority", (object?)model.InterestPriority ?? "Interest First");
                noteCmd.Parameters.AddWithValue("@showbp", model.ShowBillPeriodNotes);
                noteCmd.Parameters.AddWithValue("@bmethod", (object?)model.BillMethod ?? "Monthly");
                noteCmd.Parameters.AddWithValue("@bmonths", (object?)model.BillMonths ?? "1");
                noteCmd.Parameters.AddWithValue("@bdate", (object?)model.BillDate ?? "01");
                noteCmd.Parameters.AddWithValue("@bdue", (object?)model.BillDue ?? "15");
                noteCmd.Parameters.AddWithValue("@bperiod", (object?)model.BillPeriod ?? "");
                noteCmd.ExecuteNonQuery();

                // 2. Replace Heads
                using var delHeadCmd = conn.CreateCommand();
                delHeadCmd.CommandText = "DELETE FROM jeevika_erp.SocBillTypeHead WHERE BillTypeId = @id";
                delHeadCmd.Parameters.AddWithValue("@id", id);
                delHeadCmd.ExecuteNonQuery();

                if (model.Heads != null && model.Heads.Count > 0)
                {
                    int autoSr = 1;
                    foreach (var h in model.Heads)
                    {
                        if (string.IsNullOrWhiteSpace(h.AccCode) && string.IsNullOrWhiteSpace(h.AccName))
                        {
                            autoSr++;
                            continue;
                        }

                        int headSrNo = h.SrNo.HasValue && h.SrNo.Value > 0 ? h.SrNo.Value : autoSr;

                        using var insHead = conn.CreateCommand();
                        insHead.CommandText = @"
                            INSERT INTO jeevika_erp.SocBillTypeHead (SocietyId, BillTypeId, SrNo, AccountId, AccountCode, AccountName, GSTApplicable, GSTExempted)
                            VALUES (@socId, @id, @sr, @accId, @code, @name, @gstApp, @gstEx)";
                        insHead.Parameters.AddWithValue("@socId", socId);
                        insHead.Parameters.AddWithValue("@id", id);
                        insHead.Parameters.AddWithValue("@sr", headSrNo);
                        insHead.Parameters.AddWithValue("@accId", h.AccountId.HasValue ? (object)h.AccountId.Value : DBNull.Value);
                        insHead.Parameters.AddWithValue("@code", (object?)h.AccCode ?? DBNull.Value);
                        insHead.Parameters.AddWithValue("@name", (object?)h.AccName ?? DBNull.Value);
                        insHead.Parameters.AddWithValue("@gstApp", h.GSTApplicable);
                        insHead.Parameters.AddWithValue("@gstEx", h.GSTExempted);
                        insHead.ExecuteNonQuery();
                        autoSr++;
                    }
                }

                return Ok(new { success = true, message = "Bill type settings and notes saved successfully!" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/bill-types/{id} ──────────────────────────
        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                // Prevent deleting last remaining bill type
                using (var countCmd = conn.CreateCommand())
                {
                    countCmd.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocBillType WHERE IsActive = TRUE";
                    var cnt = Convert.ToInt32(countCmd.ExecuteScalar());
                    if (cnt <= 1)
                    {
                        return BadRequest(new { success = false, message = "Cannot delete the last remaining Bill Type." });
                    }
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = "DELETE FROM jeevika_erp.SocBillType WHERE BillTypeId = @id";
                cmd.Parameters.AddWithValue("@id", id);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Bill type deleted successfully!" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class SaveBillTypeModel
    {
        public int     SocietyId    { get; set; } = 1;
        public string? BillTypeCode { get; set; }
        public string  BillTypeName { get; set; } = "";
        public string? Description  { get; set; }
    }

    public class SaveBillTypeConfigModel
    {
        public string? Note1               { get; set; }
        public string? Note2               { get; set; }
        public string? Note3               { get; set; }
        public string? Note4               { get; set; }
        public string? Note5               { get; set; }
        public string? Note6               { get; set; }
        public string? Note7               { get; set; }
        public string? Note8               { get; set; }
        public string? BankName            { get; set; }
        public string? AccountNo           { get; set; }
        public string? IFSCCode            { get; set; }
        public string  AccountType         { get; set; } = "saving";
        public string? UPINote             { get; set; }
        public string? QRCodePath          { get; set; }
        public string? SignaturePath       { get; set; }
        public bool    DynamicQR           { get; set; }
        public string  InterestMethod      { get; set; } = "M-CM";
        public string  InterestRate        { get; set; } = "21%";
        public string  InterestType        { get; set; } = "Simple";
        public string  GrossDays           { get; set; } = "";
        public string  InterestPriority    { get; set; } = "Interest First";
        public bool    ShowBillPeriodNotes { get; set; }
        public string  BillMethod          { get; set; } = "Monthly";
        public string  BillMonths          { get; set; } = "1";
        public string  BillDate            { get; set; } = "01";
        public string  BillDue             { get; set; } = "15";
        public string? BillPeriod          { get; set; }
        public List<HeadItemModel>? Heads { get; set; }
    }

    public class HeadItemModel
    {
        public int?    SrNo          { get; set; }
        public int?    AccountId     { get; set; }
        public string? AccCode       { get; set; }
        public string? AccName       { get; set; }
        public bool    GSTApplicable { get; set; }
        public bool    GSTExempted   { get; set; }
    }
}
