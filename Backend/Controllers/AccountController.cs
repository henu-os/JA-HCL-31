// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — AccountController
// GET    /api/accounts?societyId=X  → list accounts for society (auto-seeds defaults if empty)
// GET    /api/accounts/{id}        → get single account
// POST   /api/accounts             → create account
// PUT    /api/accounts/{id}        → update account
// DELETE /api/accounts/{id}        → soft-delete account (protects default accounts)
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/accounts")]
    [AllowAnonymous]
    public class AccountController : ControllerBase
    {
        // Default standard ledger accounts for society chart of accounts
        private static readonly (string code, string name, string groupName, int mainId)[] DefaultAccounts = new[]
        {
            // Income
            ("INC-1001", "Property Tax", "Rent & Taxes", 3),
            ("INC-1002", "Water Charges", "Rent & Taxes", 3),
            ("INC-1003", "Electricity Charges", "Rent & Taxes", 3),
            ("INC-1004", "Service Charges", "Maintenance & Service Charges", 3),
            ("INC-1005", "Non Occupancy Charges", "Maintenance & Service Charges", 3),
            ("INC-1006", "4-Wheeler Parking Charges", "Maintenance & Service Charges", 3),
            ("INC-1007", "2-Wheeler Parking Charges", "Maintenance & Service Charges", 3),
            ("INC-1008", "Interest From Member", "Interest Received From", 3),
            ("INC-1009", "Bank SB A/c. Interest", "Interest Received From", 3),
            ("INC-1010", "Interest on FDR", "Interest Received From", 3),
            ("INC-1011", "Bank Charges", "Interest Received From", 3),
            ("INC-1012", "Other Income", "Other Sources", 3),
            ("INC-1013", "Sale of Scrap", "Other Sources", 3),
            ("INC-1999", "Excess of Expenditure over Income", "Other Sources", 3),

            // Expenditure
            ("EXP-1001", "Property Tax Exp.", "Rent, Rates & Taxes", 4),
            ("EXP-1002", "Water Charges Exp.", "Rent, Rates & Taxes", 4),
            ("EXP-1003", "Electricity Charges Exp.", "Rent, Rates & Taxes", 4),
            ("EXP-1004", "Security Charges Exp.", "Establishment Expenses", 4),
            ("EXP-1005", "Housekeeping Charges Exp.", "Establishment Expenses", 4),
            ("EXP-1006", "Building Insurance Exp.", "Establishment Expenses", 4),
            ("EXP-1007", "CCTV Maintance & AMC Exp.", "Establishment Expenses", 4),
            ("EXP-1008", "Lift Maintenace & AMC Exp.", "Establishment Expenses", 4),
            ("EXP-1009", "Pest Control Exp.", "Establishment Expenses", 4),
            ("EXP-1010", "Repair & Maintenance Exp.", "Maintenance", 4),
            ("EXP-1011", "Salary & Wages Exp.", "Establishment Expenses", 4),
            ("EXP-1012", "Managerial Salary Exp.", "Establishment Expenses", 4),
            ("EXP-1013", "Legal Fees Exp.", "Others", 4),
            ("EXP-1014", "Professional Fees Exp.", "Others", 4),
            ("EXP-1015", "Accounting Charges Exp.", "Others", 4),
            ("EXP-1016", "Audit Fees Exp.", "Others", 4),
            ("EXP-1017", "Accounting Software AMC Exp", "Others", 4),
            ("EXP-1018", "Printing & Stationary Exp.", "Others", 4),
            ("EXP-1019", "Postage & Telegram Exp.", "Others", 4),
            ("EXP-1020", "Function & Festival Exp.", "Others", 4),
            ("EXP-1021", "Travel & Conveyance Exp.", "Others", 4),
            ("EXP-1022", "Telephone Exp.", "Others", 4),
            ("EXP-1023", "Education & Training Fund", "Others", 4),
            ("EXP-1024", "Miscellaneous Exp.", "Others", 4),
            ("EXP-1025", "Meeting Exp. (AGM,SGM & MCM)", "Others", 4),
            ("EXP-1026", "Housing Federation Subscription Exp.", "Others", 4),
            ("EXP-1027", "Bank Charges Exp.", "Others", 4),
            ("EXP-1028", "Depreciation", "Others", 4),
            ("EXP-1999", "Excess of Income over Expenditure", "Others", 4),

            // Assets
            ("ASS-1001", "Cash in Hand", "Cash & Bank Balance", 1),
            ("ASS-1002", "The M.D C.C. Bank A/C No.", "Cash & Bank Balance", 1),
            ("ASS-1003", "The Saraswat Bank A/C No.", "Cash & Bank Balance", 1),
            ("ASS-1004", "One Share of Housing Federation", "Investments", 1),
            ("ASS-1005", "One Share of MDCC Bank", "Investments", 1),
            ("ASS-1006", "FDR Share Capital - (Bank name)", "Investments", 1),
            ("ASS-1007", "FDR Reserve Fund - (Bank Name)", "Investments", 1),
            ("ASS-1008", "FDR Sinking Fund - (Bank Name)", "Investments", 1),
            ("ASS-1009", "FDR Repair & Maintenance Fund - (Bank Name)", "Investments", 1),
            ("ASS-1010", "FDR General Fund - (Bank Name)", "Investments", 1),
            ("ASS-1011", "Accrued Int on-MDCC Share Capital", "Accrued Interest", 1),
            ("ASS-1012", "Accrued Int on MDCC Bank - Reserve Fund", "Accrued Interest", 1),
            ("ASS-1013", "Accrued Int on MDCC Bank - Sinking Fund", "Accrued Interest", 1),
            ("ASS-1014", "Accrued Int on MDCC Bank - Repair & Maint Fund", "Accrued Interest", 1),
            ("ASS-1015", "Accrued Int on MDCC Bank - General Fund", "Accrued Interest", 1),
            ("ASS-1016", "Deposit With MSEDC", "Advance & Deposit", 1),
            ("ASS-1017", "Deposit With Water Connection", "Advance & Deposit", 1),
            ("ASS-1018", "Furniture and Fixture", "Fixed Assets", 1),
            ("ASS-1019", "Fire Fighting Equipments", "Fixed Assets", 1),
            ("ASS-1020", "Water Moter Pump", "Fixed Assets", 1),
            ("ASS-1021", "CCTV System", "Fixed Assets", 1),
            ("ASS-1022", "Computer System", "Fixed Assets", 1),
            ("ASS-1023", "Mobile Phone", "Fixed Assets", 1),
            ("ASS-1024", "Epson Printer", "Fixed Assets", 1),
            ("ASS-1025", "Dues From Members", "Dues from Members", 1),
            ("ASS-1026", "TDS Receivable", "Advance & Deposit", 1),
            ("ASS-1027", "Input CGST", "INPUT GST", 1),
            ("ASS-1028", "Input SGST", "INPUT GST", 1),
            ("ASS-1029", "Input IGST", "INPUT GST", 1),
            ("ASS-1999", "INCOME & EXPENDITURE A/C", "Income & Expenditure", 1),

            // Liabilities
            ("LIA-1001", "Paidup Share Capital", "Issued, Sub. & Paid Up Captial", 2),
            ("LIA-1002", "Reserve Fund", "Reserve Fund", 2),
            ("LIA-1003", "Common Amenity Fund", "Ammenity Fund", 2),
            ("LIA-1004", "Sinking Fund", "Sinking Fund", 2),
            ("LIA-1005", "Repair & Major Repair Fund", "Building Repair Fund", 2),
            ("LIA-1006", "Education & Training Fund", "Education Fund", 2),
            ("LIA-1007", "Social Welfare Fund", "Common Welfare Fund", 2),
            ("LIA-1008", "TDS Payable", "Current Liabilities & Provisions", 2),
            ("LIA-1009", "Prov. Audit Fees Payable", "Current Liabilities & Provisions", 2),
            ("LIA-1010", "Prov. Accounting Charges", "Current Liabilities & Provisions", 2),
            ("LIA-1011", "Prov. Professional Fees", "Current Liabilities & Provisions", 2),
            ("LIA-1012", "Prov. Salary & Wages", "Current Liabilities & Provisions", 2),
            ("LIA-1013", "Prov. Managerial Salary", "Current Liabilities & Provisions", 2),
            ("LIA-1014", "Prov. Security Charges", "Current Liabilities & Provisions", 2),
            ("LIA-1015", "Prov. Houekeeping Charges", "Current Liabilities & Provisions", 2),
            ("LIA-1016", "Prov. Waste Manegment", "Current Liabilities & Provisions", 2),
            ("LIA-1017", "Prov. Pest Control Exp.", "Current Liabilities & Provisions", 2),
            ("LIA-1018", "Prov. Accounting Software AMC Exp.", "Current Liabilities & Provisions", 2),
            ("LIA-1019", "Prov. Income Tax", "Current Liabilities & Provisions", 2),
            ("LIA-1020", "Advance From Members", "Advance from Members", 2),
            ("LIA-1021", "Output CGST", "OUTPUT GST", 2),
            ("LIA-1022", "Output SGST", "OUTPUT GST", 2),
            ("LIA-1023", "Output IGST", "OUTPUT GST", 2),
            ("LIA-1032", "CGST 9%", "Current Liabilities & Provisions", 2),
            ("LIA-1033", "SGST 9%", "Current Liabilities & Provisions", 2),
            ("LIA-1999", "INCOME & EXPENDITURE A/C", "Income & Expenditure", 2)
        };

        // ── GET /api/accounts?societyId=X ───────────────────────
        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetAll([FromQuery] int societyId = 0, [FromQuery] int? groupId = null, [FromQuery] int fyId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                if (societyId <= 0)
                    return Ok(new { success = true, data = new List<object>(), count = 0 });

                // Auto seed default accounts for society if missing
                EnsureDefaultAccounts(conn, societyId);

                if (fyId <= 0)
                {
                    using var fyCmd = conn.CreateCommand();
                    fyCmd.CommandText = "SELECT FYId FROM jeevika_erp.financialyear WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY FYId DESC LIMIT 1";
                    fyCmd.Parameters.AddWithValue("@sid", societyId);
                    var fRes = fyCmd.ExecuteScalar();
                    if (fRes != null && fRes != DBNull.Value) fyId = Convert.ToInt32(fRes);
                }

                using var cmd = conn.CreateCommand();
                var sql = @"
                    SELECT a.AccountId, a.SocietyId, a.AccCode, a.AccName, a.AccMarName, a.AccBSName,
                           a.GroupId, g.GrpName, a.GrpMainId,
                           COALESCE(ob.OpenBal, a.OpBal, 0) AS OpBal,
                           COALESCE(ob.DrCr, a.OpDrCr, 'Dr') AS OpDrCr,
                           a.PrBal, a.PrDrCr,
                           a.ClBal, a.DepAnnual, a.DepHalf, a.AccAddress, a.AccPAN, a.AccTAN,
                           a.GSTIN, a.Mobile, a.Mobile2, a.Email, a.TdsRate, a.TdsSection,
                           a.IsDefault, a.IsDeleted, a.CreatedAt
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                    WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE";

                if (groupId.HasValue && groupId.Value > 0)
                {
                    sql += " AND a.GroupId = @gid";
                    cmd.Parameters.AddWithValue("@gid", groupId.Value);
                }

                sql += @" ORDER BY 
                            CASE a.GrpMainId 
                                WHEN 3 THEN 1 -- Income
                                WHEN 4 THEN 2 -- Expenditure
                                WHEN 1 THEN 3 -- Asset
                                WHEN 2 THEN 4 -- Liability
                                ELSE 5 
                            END, a.AccCode, a.AccName";

                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read()) list.Add(MapAccount(r));

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/accounts/{id} ───────────────────────────────
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id, [FromQuery] int fyId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                if (fyId <= 0)
                {
                    using var sCmd = conn.CreateCommand();
                    sCmd.CommandText = @"
                        SELECT f.FYId 
                        FROM jeevika_erp.SocAccount a
                        JOIN jeevika_erp.financialyear f ON a.SocietyId = f.SocietyId AND f.IsActive = TRUE
                        WHERE a.AccountId = @id
                        ORDER BY f.FYId DESC LIMIT 1";
                    sCmd.Parameters.AddWithValue("@id", id);
                    var fRes = sCmd.ExecuteScalar();
                    if (fRes != null && fRes != DBNull.Value) fyId = Convert.ToInt32(fRes);
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT a.AccountId, a.SocietyId, a.AccCode, a.AccName, a.AccMarName, a.AccBSName,
                           a.GroupId, g.GrpName, a.GrpMainId,
                           COALESCE(ob.OpenBal, a.OpBal, 0) AS OpBal,
                           COALESCE(ob.DrCr, a.OpDrCr, 'Dr') AS OpDrCr,
                           a.PrBal, a.PrDrCr,
                           a.ClBal, a.DepAnnual, a.DepHalf, a.AccAddress, a.AccPAN, a.AccTAN,
                           a.GSTIN, a.Mobile, a.Mobile2, a.Email, a.TdsRate, a.TdsSection,
                           a.IsDefault, a.IsDeleted, a.CreatedAt
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                    WHERE a.AccountId = @id AND a.IsDeleted = FALSE
                    LIMIT 1";
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                using var r = cmd.ExecuteReader();
                if (!r.Read())
                    return NotFound(new { success = false, message = "Account not found." });

                return Ok(new { success = true, data = MapAccount(r) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/accounts ───────────────────────────────────
        [HttpPost]
        public IActionResult Create([FromBody] AccountModel model)
        {
            if (string.IsNullOrWhiteSpace(model.AccName))
                return BadRequest(new { success = false, message = "AccName is required." });

            try
            {
                using var conn = DbHelper.GetConn();

                if (model.SocietyId <= 0)
                    return BadRequest(new { success = false, message = "societyId is required." });
                int sid = model.SocietyId;

                if (string.IsNullOrWhiteSpace(model.AccCode))
                {
                    model.AccCode = AutoGenerateAccountCode(conn, sid, model.GrpMainId);
                }

                if (string.IsNullOrWhiteSpace(model.AccBSName))
                {
                    model.AccBSName = model.AccName;
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocAccount
                        (SocietyId, AccCode, AccName, AccMarName, AccBSName, GroupId, GrpMainId,
                         OpBal, OpDrCr, PrBal, PrDrCr, ClBal, DepAnnual, DepHalf, AccAddress,
                         AccPAN, AccTAN, GSTIN, Mobile, Mobile2, Email, TdsRate, TdsSection,
                         IsDefault, IsDeleted, CreatedAt)
                    VALUES
                        (@sid, @code, @name, @marname, @bsname, @groupId, @mainId,
                         @opbal, @drcr, @prbal, @prdrcr, @clbal, @depAnn, @depHalf, @addr,
                         @pan, @tan, @gst, @mobile, @mobile2, @email, @tdsRate, @tdsSec,
                         FALSE, FALSE, NOW())
                    RETURNING AccountId";

                AddAccountParams(cmd, model);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());

                // Auto-sync into SocOpeningBalance for active Financial Year
                int fyId = model.FYId.GetValueOrDefault(0);
                if (fyId <= 0 && sid > 0)
                {
                    using var fyCmd = conn.CreateCommand();
                    fyCmd.CommandText = "SELECT FYId FROM jeevika_erp.financialyear WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY FYId DESC LIMIT 1";
                    fyCmd.Parameters.AddWithValue("@sid", sid);
                    var fRes = fyCmd.ExecuteScalar();
                    if (fRes != null && fRes != DBNull.Value) fyId = Convert.ToInt32(fRes);
                }

                if (fyId > 0 && newId > 0)
                {
                    using var obCmd = conn.CreateCommand();
                    obCmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocOpeningBalance
                            (SocietyId, FYId, AccountId, OpenBal, DrCr, EntryDate)
                        VALUES
                            (@sid, @fyid, @accId, @opbal, @drcr, CURRENT_DATE)
                        ON CONFLICT (SocietyId, FYId, AccountId) DO UPDATE SET
                            OpenBal   = EXCLUDED.OpenBal,
                            DrCr      = EXCLUDED.DrCr,
                            EntryDate = EXCLUDED.EntryDate";
                    obCmd.Parameters.AddWithValue("@sid", sid);
                    obCmd.Parameters.AddWithValue("@fyid", fyId);
                    obCmd.Parameters.AddWithValue("@accId", newId);
                    obCmd.Parameters.AddWithValue("@opbal", model.OpBal);
                    obCmd.Parameters.AddWithValue("@drcr", string.IsNullOrWhiteSpace(model.OpDrCr) ? "Dr" : model.OpDrCr);
                    obCmd.ExecuteNonQuery();
                }

                return Ok(new { success = true, message = "Account created successfully.", accountId = newId, accCode = model.AccCode });
            }
            catch (PostgresException ex) when (ex.SqlState == "23505")
            {
                return Conflict(new { success = false, message = "Account code already exists in this society." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/accounts/{id} ───────────────────────────────
        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] AccountModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocAccount SET
                        AccCode    = @code,
                        AccName    = @name,
                        AccMarName = @marname,
                        AccBSName  = @bsname,
                        GroupId    = @groupId,
                        GrpMainId  = @mainId,
                        OpBal      = @opbal,
                        OpDrCr     = @drcr,
                        PrBal      = @prbal,
                        PrDrCr     = @prdrcr,
                        DepAnnual  = @depAnn,
                        DepHalf    = @depHalf,
                        AccAddress = @addr,
                        AccPAN     = @pan,
                        AccTAN     = @tan,
                        GSTIN      = @gst,
                        Mobile     = @mobile,
                        Mobile2    = @mobile2,
                        Email      = @email,
                        TdsRate    = @tdsRate,
                        TdsSection = @tdsSec
                    WHERE AccountId = @id AND IsDeleted = FALSE";

                AddAccountParams(cmd, model);
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Account not found." });

                // Auto-sync into SocOpeningBalance for active Financial Year
                int sid = model.SocietyId;
                if (sid <= 0)
                {
                    using var sCmd = conn.CreateCommand();
                    sCmd.CommandText = "SELECT SocietyId FROM jeevika_erp.SocAccount WHERE AccountId = @id LIMIT 1";
                    sCmd.Parameters.AddWithValue("@id", id);
                    var sRes = sCmd.ExecuteScalar();
                    if (sRes != null && sRes != DBNull.Value) sid = Convert.ToInt32(sRes);
                }

                int fyId = model.FYId.GetValueOrDefault(0);
                if (fyId <= 0 && sid > 0)
                {
                    using var fyCmd = conn.CreateCommand();
                    fyCmd.CommandText = "SELECT FYId FROM jeevika_erp.financialyear WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY FYId DESC LIMIT 1";
                    fyCmd.Parameters.AddWithValue("@sid", sid);
                    var fRes = fyCmd.ExecuteScalar();
                    if (fRes != null && fRes != DBNull.Value) fyId = Convert.ToInt32(fRes);
                }

                if (fyId > 0)
                {
                    using var obCmd = conn.CreateCommand();
                    obCmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocOpeningBalance
                            (SocietyId, FYId, AccountId, OpenBal, DrCr, EntryDate)
                        VALUES
                            (@sid, @fyid, @accId, @opbal, @drcr, CURRENT_DATE)
                        ON CONFLICT (SocietyId, FYId, AccountId) DO UPDATE SET
                            OpenBal   = EXCLUDED.OpenBal,
                            DrCr      = EXCLUDED.DrCr,
                            EntryDate = EXCLUDED.EntryDate";
                    obCmd.Parameters.AddWithValue("@sid", sid);
                    obCmd.Parameters.AddWithValue("@fyid", fyId);
                    obCmd.Parameters.AddWithValue("@accId", id);
                    obCmd.Parameters.AddWithValue("@opbal", model.OpBal);
                    obCmd.Parameters.AddWithValue("@drcr", string.IsNullOrWhiteSpace(model.OpDrCr) ? "Dr" : model.OpDrCr);
                    obCmd.ExecuteNonQuery();
                }

                return Ok(new { success = true, message = "Account updated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/accounts/{id} ────────────────────────────
        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                // 1. Fetch Account Details
                using var getCmd = conn.CreateCommand();
                getCmd.CommandText = "SELECT AccCode, AccName, SocietyId, IsDefault FROM jeevika_erp.SocAccount WHERE AccountId = @id AND IsDeleted = FALSE";
                getCmd.Parameters.AddWithValue("@id", id);
                string accCode = "";
                string accName = "";
                int societyId = 0;
                bool isDefault = false;

                using (var r = getCmd.ExecuteReader())
                {
                    if (!r.Read())
                        return NotFound(new { success = false, message = "Account not found or already deleted." });

                    accCode   = r["AccCode"].ToString() ?? "";
                    accName   = r["AccName"].ToString() ?? "";
                    societyId = Convert.ToInt32(r["SocietyId"]);
                    isDefault = Convert.ToBoolean(r["IsDefault"]);
                }

                // Check default flag
                if (isDefault)
                    return BadRequest(new { success = false, message = $"System default account '{accName}' ({accCode}) cannot be deleted." });

                var conflicts = new List<string>();

                // 2. Check line items in Voucher Details (Payment Entry, Other Receipt, JV, Contra, Purchase Order, etc.)
                using (var checkVoucher = conn.CreateCommand())
                {
                    checkVoucher.CommandText = @"
                        SELECT vh.VoucherType, COUNT(*) AS TxCount
                        FROM jeevika_erp.SocVoucherDetail vd
                        JOIN jeevika_erp.SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId
                        WHERE (vd.AccountId = @id OR vd.AccountCode = @code OR vd.AccountName ILIKE @name) AND vh.IsDeleted = FALSE
                        GROUP BY vh.VoucherType";
                    checkVoucher.Parameters.AddWithValue("@id", id);
                    checkVoucher.Parameters.AddWithValue("@code", accCode);
                    checkVoucher.Parameters.AddWithValue("@name", accName);

                    using var r = checkVoucher.ExecuteReader();
                    while (r.Read())
                    {
                        var vType = r["VoucherType"]?.ToString() ?? "General Voucher";
                        var count = Convert.ToInt64(r["TxCount"]);
                        conflicts.Add($"{count} entry/entries in {vType}");
                    }
                }

                // 3. Check Cash/Bank header account references (Payment, Receipt, Contra, etc.)
                using (var checkHeader = conn.CreateCommand())
                {
                    checkHeader.CommandText = @"
                        SELECT vh.VoucherType, COUNT(*) AS TxCount
                        FROM jeevika_erp.SocVoucherHeader vh
                        WHERE (vh.CashBankCode = @code OR vh.CashBankName ILIKE @name) AND vh.IsDeleted = FALSE
                        GROUP BY vh.VoucherType";
                    checkHeader.Parameters.AddWithValue("@code", accCode);
                    checkHeader.Parameters.AddWithValue("@name", accName);

                    using var r = checkHeader.ExecuteReader();
                    while (r.Read())
                    {
                        var vType = r["VoucherType"]?.ToString() ?? "Voucher";
                        var count = Convert.ToInt64(r["TxCount"]);
                        conflicts.Add($"{count} entry/entries as Cash/Bank ledger in {vType}");
                    }
                }

                // 4. Check if account is configured as charge head in Bill Type Master
                using (var checkBillHead = conn.CreateCommand())
                {
                    checkBillHead.CommandText = @"
                        SELECT bt.BillTypeName, COUNT(*) AS Cnt
                        FROM jeevika_erp.SocBillTypeHead h
                        JOIN jeevika_erp.SocBillType bt ON h.BillTypeId = bt.BillTypeId
                        WHERE bt.SocietyId = @sid AND (h.AccountCode = @code OR h.AccountName ILIKE @name) AND bt.IsActive = TRUE
                        GROUP BY bt.BillTypeName";
                    checkBillHead.Parameters.AddWithValue("@sid",  societyId);
                    checkBillHead.Parameters.AddWithValue("@code", accCode);
                    checkBillHead.Parameters.AddWithValue("@name", accName);

                    using var r = checkBillHead.ExecuteReader();
                    while (r.Read())
                    {
                        var bName = r["BillTypeName"]?.ToString() ?? "Bill Type";
                        conflicts.Add($"Configured as charge head in Bill Type '{bName}'");
                    }
                }

                // 5. Check if member billing transactions / matrices exist for this account
                using (var checkBillItems = conn.CreateCommand())
                {
                    checkBillItems.CommandText = @"
                        SELECT COUNT(*) 
                        FROM jeevika_erp.SocMemberBillItem mbi
                        JOIN jeevika_erp.SocMemberBill mb ON mbi.BillId = mb.BillId
                        WHERE (mbi.AccountCode = @code OR mbi.AccountName ILIKE @name) AND mb.IsDeleted = FALSE";
                    checkBillItems.Parameters.AddWithValue("@code", accCode);
                    checkBillItems.Parameters.AddWithValue("@name", accName);
                    var billItemCount = Convert.ToInt64(checkBillItems.ExecuteScalar() ?? 0L);
                    if (billItemCount > 0)
                    {
                        conflicts.Add($"{billItemCount} generated bill item(s) in Member Bills");
                    }
                }

                using (var checkMatrix = conn.CreateCommand())
                {
                    checkMatrix.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocBillingMatrix WHERE SocietyId = @sid AND AccountCode = @code AND Amount > 0";
                    checkMatrix.Parameters.AddWithValue("@sid", societyId);
                    checkMatrix.Parameters.AddWithValue("@code", accCode);
                    var matrixCount = Convert.ToInt64(checkMatrix.ExecuteScalar() ?? 0L);
                    if (matrixCount > 0)
                    {
                        conflicts.Add($"{matrixCount} active entry/entries in Billing Matrix Master");
                    }
                }

                if (conflicts.Count > 0)
                {
                    var details = string.Join("; ", conflicts);
                    return Conflict(new
                    {
                        success = false,
                        message = $"Cannot delete '{accName}' ({accCode}) because active references exist: {details}. Please delete or remove these entries first."
                    });
                }

                // 5. Perform Safe Soft-Delete
                using var delCmd = conn.CreateCommand();
                delCmd.CommandText = "UPDATE jeevika_erp.SocAccount SET IsDeleted = TRUE WHERE AccountId = @id AND IsDeleted = FALSE";
                delCmd.Parameters.AddWithValue("@id", id);

                var rows = delCmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Account not found." });

                return Ok(new { success = true, message = $"Account '{accName}' ({accCode}) deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/accounts/restore/{id} ──────────────────────
        [HttpPost("restore/{id:int}")]
        public IActionResult Restore(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "UPDATE jeevika_erp.SocAccount SET IsDeleted = FALSE WHERE AccountId = @id RETURNING AccName, AccCode";
                cmd.Parameters.AddWithValue("@id", id);
                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    var name = r["AccName"]?.ToString();
                    var code = r["AccCode"]?.ToString();
                    return Ok(new { success = true, message = $"Account '{name}' ({code}) restored successfully." });
                }
                return NotFound(new { success = false, message = "Account not found." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/accounts/restore-by-name ────────────────────
        [HttpPost("restore-by-name")]
        public IActionResult RestoreByName([FromBody] AccountModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocAccount 
                    SET IsDeleted = FALSE 
                    WHERE (AccName ILIKE @name OR AccCode ILIKE @code)
                    RETURNING AccountId, AccName, AccCode";
                cmd.Parameters.AddWithValue("@name", "%" + (model.AccName ?? "") + "%");
                cmd.Parameters.AddWithValue("@code", "%" + (model.AccCode ?? "") + "%");

                var restored = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    restored.Add(new {
                        id = r["AccountId"],
                        name = r["AccName"]?.ToString(),
                        code = r["AccCode"]?.ToString()
                    });
                }
                return Ok(new { success = true, restoredCount = restored.Count, accounts = restored });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // Designated System Default Accounts that cannot be deleted and show (D)
        private static readonly HashSet<string> SystemDefaultAccountCodes = new(StringComparer.OrdinalIgnoreCase)
        {
            // Income
            "INC-1005", "INC-1006", "INC-1007", "INC-1008", "INC-1999",

            // Expenditure
            "EXP-1028", "EXP-1999",

            // Asset
            "ASS-1025", "ASS-1026", "ASS-1027", "ASS-1028", "ASS-1029", "ASS-1999",

            // Liability
            "LIA-1001", "LIA-1002", "LIA-1004", "LIA-1020", "LIA-1021", "LIA-1022", "LIA-1023", "LIA-1032", "LIA-1033", "LIA-1999"
        };

        // ── Helpers ──────────────────────────────────────────────
        public static void EnsureDefaultAccounts(NpgsqlConnection conn, int societyId)
        {
            if (societyId <= 0) return;

            using var chkSoc = conn.CreateCommand();
            chkSoc.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocietyInfo WHERE SocietyId = @sid";
            chkSoc.Parameters.AddWithValue("@sid", societyId);
            if (Convert.ToInt64(chkSoc.ExecuteScalar() ?? 0L) == 0) return;

            // Ensure groups exist first
            GroupController.EnsureDefaultGroups(conn, societyId);

            // Fetch group map: key = $"{GrpMainId}_{GrpName.ToLower()}", fallback key = GrpName.ToLower()
            var grpMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            using (var gCmd = conn.CreateCommand())
            {
                gCmd.CommandText = "SELECT GroupId, GrpName, GrpMainId FROM jeevika_erp.SocGroup WHERE SocietyId = @sid AND IsDeleted = FALSE";
                gCmd.Parameters.AddWithValue("@sid", societyId);
                using var gr = gCmd.ExecuteReader();
                while (gr.Read())
                {
                    var gId = gr.GetInt32(0);
                    var gName = gr.GetString(1);
                    var gMain = gr.GetInt32(2);
                    grpMap[$"{gMain}_{gName}"] = gId;
                    if (!grpMap.ContainsKey(gName)) grpMap[gName] = gId;
                }
            }

            foreach (var a in DefaultAccounts)
            {
                int? groupId = null;
                if (grpMap.TryGetValue($"{a.mainId}_{a.groupName}", out int gid))
                    groupId = gid;
                else if (grpMap.TryGetValue(a.groupName, out int gid2))
                    groupId = gid2;

                bool isSysDef = SystemDefaultAccountCodes.Contains(a.code);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocAccount
                        (SocietyId, AccCode, AccName, AccBSName, GroupId, GrpMainId,
                         OpBal, OpDrCr, PrBal, PrDrCr, ClBal, DepAnnual, DepHalf,
                         IsDefault, IsDeleted, CreatedAt)
                    SELECT @sid, @code, @name, @name, @gid, @mainId,
                           0, 'Dr', 0, 'Dr', 0, 0, 0,
                           @isDef, FALSE, NOW()
                    WHERE NOT EXISTS (
                        SELECT 1 FROM jeevika_erp.SocAccount
                        WHERE SocietyId = @sid AND AccCode = @code
                    );

                    UPDATE jeevika_erp.SocAccount
                    SET IsDefault = @isDef,
                        AccName = CASE 
                            WHEN AccCode IN ('LIA-1021', 'LIA-1022') AND AccName ILIKE '%INPUT%' THEN @name 
                            WHEN AccCode IN ('ASS-1027', 'ASS-1028') AND AccName = 'INPUT CGST' THEN 'Input CGST'
                            WHEN AccCode IN ('ASS-1027', 'ASS-1028') AND AccName = 'INPUT SGST' THEN 'Input SGST'
                            ELSE AccName 
                        END,
                        AccBSName = CASE 
                            WHEN AccCode IN ('LIA-1021', 'LIA-1022') AND AccBSName ILIKE '%INPUT%' THEN @name 
                            WHEN AccCode IN ('ASS-1027', 'ASS-1028') AND AccBSName = 'INPUT CGST' THEN 'Input CGST'
                            WHEN AccCode IN ('ASS-1027', 'ASS-1028') AND AccBSName = 'INPUT SGST' THEN 'Input SGST'
                            ELSE AccBSName 
                        END,
                        GroupId = COALESCE(@gid, GroupId),
                        GrpMainId = @mainId,
                        IsDeleted = FALSE
                    WHERE SocietyId = @sid AND AccCode = @code;
                ";
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.Parameters.AddWithValue("@code", a.code);
                cmd.Parameters.AddWithValue("@name", a.name);
                cmd.Parameters.AddWithValue("@gid", (object?)groupId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@mainId", a.mainId);
                cmd.Parameters.AddWithValue("@isDef", isSysDef);
                cmd.ExecuteNonQuery();
            }
        }

        private static string AutoGenerateAccountCode(NpgsqlConnection conn, int societyId, int mainId)
        {
            string pfx = mainId switch
            {
                1 => "ASS",
                2 => "LIA",
                3 => "INC",
                4 => "EXP",
                _ => "ACC"
            };

            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT AccCode FROM jeevika_erp.SocAccount
                WHERE SocietyId = @sid AND AccCode LIKE @pfx
                ORDER BY AccCode DESC";
            cmd.Parameters.AddWithValue("@sid", societyId);
            cmd.Parameters.AddWithValue("@pfx", $"{pfx}-%");

            int max = 1000;
            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                var codeStr = r.GetString(0);
                var numPart = codeStr.Replace($"{pfx}-", "").Trim();
                if (int.TryParse(numPart, out int n))
                {
                    // Ignore reserve/closing accounts in 1900+ series (e.g. ASS-1999, LIA-1999)
                    if (n < 1900 && n > max) max = n;
                }
            }

            int next = max + 1;
            return $"{pfx}-{next}";
        }

        private static object MapAccount(NpgsqlDataReader r)
        {
            T? Get<T>(string col)
            {
                try { var v = r[col]; return v == DBNull.Value ? default : (T)Convert.ChangeType(v, typeof(T)); }
                catch { return default; }
            }
            string S(string col) => r[col]?.ToString() ?? "";

            bool isDef = Get<bool>("IsDefault");
            string code = S("AccCode");

            return new
            {
                socAccId    = Get<int>("AccountId"),
                accountId   = Get<int>("AccountId"),
                societyId   = Get<int>("SocietyId"),
                accCode     = code,
                _code       = isDef ? $"{code} (D)" : code,
                accName     = S("AccName"),
                accMarName  = S("AccMarName"),
                accBSName   = S("AccBSName"),
                socSubGroupId = r["GroupId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["GroupId"]),
                groupId     = r["GroupId"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["GroupId"]),
                groupName   = S("GrpName"),
                grpMainId   = Get<int>("GrpMainId"),
                opBal       = Get<decimal>("OpBal"),
                opDrCr      = S("OpDrCr"),
                prBal       = Get<decimal>("PrBal"),
                prDrCr      = S("PrDrCr"),
                clBal       = Get<decimal>("ClBal"),
                depAnnual   = Get<decimal>("DepAnnual"),
                depHalf     = Get<decimal>("DepHalf"),
                accAddress  = S("AccAddress"),
                accPAN      = S("AccPAN"),
                accTAN      = S("AccTAN"),
                gstin       = S("GSTIN"),
                mobile      = S("Mobile"),
                mobile2     = S("Mobile2"),
                email       = S("Email"),
                tdsRate     = Get<decimal>("TdsRate"),
                tdsSection  = S("TdsSection"),
                isDefault   = isDef,
                isDeleted   = Get<bool>("IsDeleted"),
                createdAt   = Get<DateTime>("CreatedAt")
            };
        }

        private static void AddAccountParams(NpgsqlCommand cmd, AccountModel m)
        {
            cmd.Parameters.AddWithValue("@sid",     m.SocietyId);
            cmd.Parameters.AddWithValue("@code",    m.AccCode.Trim());
            cmd.Parameters.AddWithValue("@name",    m.AccName.Trim());
            cmd.Parameters.AddWithValue("@marname", (object?)m.AccMarName ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@bsname",  string.IsNullOrWhiteSpace(m.AccBSName) ? m.AccName.Trim() : m.AccBSName.Trim());
            cmd.Parameters.AddWithValue("@groupId", (object?)m.GroupId    ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@mainId",  m.GrpMainId <= 0 ? 1 : m.GrpMainId);
            cmd.Parameters.AddWithValue("@opbal",   m.OpBal);
            cmd.Parameters.AddWithValue("@drcr",    string.IsNullOrWhiteSpace(m.OpDrCr) ? "Dr" : m.OpDrCr);
            cmd.Parameters.AddWithValue("@prbal",   m.PrBal);
            cmd.Parameters.AddWithValue("@prdrcr",  string.IsNullOrWhiteSpace(m.PrDrCr) ? "Dr" : m.PrDrCr);
            cmd.Parameters.AddWithValue("@clbal",   m.ClBal);
            cmd.Parameters.AddWithValue("@depAnn",  m.DepAnnual);
            cmd.Parameters.AddWithValue("@depHalf", m.DepHalf);
            cmd.Parameters.AddWithValue("@addr",    (object?)m.AccAddress ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@pan",     (object?)m.AccPAN     ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tan",     (object?)m.AccTAN     ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gst",     (object?)m.GSTIN      ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@mobile",  (object?)m.Mobile     ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@mobile2", (object?)m.Mobile2    ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@email",   (object?)m.Email      ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tdsRate", m.TdsRate);
            cmd.Parameters.AddWithValue("@tdsSec",  (object?)m.TdsSection ?? DBNull.Value);
        }
    }

    public class AccountModel
    {
        public int      SocietyId  { get; set; }
        public string   AccCode    { get; set; } = "";
        public string   AccName    { get; set; } = "";
        public string?  AccMarName { get; set; }
        public string?  AccBSName  { get; set; }
        public int?     GroupId    { get; set; }
        public int      GrpMainId  { get; set; } = 1;
        public decimal  OpBal      { get; set; } = 0;
        public string   OpDrCr     { get; set; } = "Dr";
        public decimal  PrBal      { get; set; } = 0;
        public string   PrDrCr     { get; set; } = "Dr";
        public decimal  ClBal      { get; set; } = 0;
        public decimal  DepAnnual  { get; set; } = 0;
        public decimal  DepHalf    { get; set; } = 0;
        public string?  AccAddress { get; set; }
        public string?  AccPAN     { get; set; }
        public string?  AccTAN     { get; set; }
        public string?  GSTIN      { get; set; }
        public string?  Mobile     { get; set; }
        public string?  Mobile2    { get; set; }
        public string?  Email      { get; set; }
        public decimal  TdsRate    { get; set; } = 0;
        public string?  TdsSection { get; set; }
        public int?     FYId       { get; set; }
    }
}
