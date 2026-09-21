// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MemberController
// GET    /api/members?societyId=X  → list members for society
// GET    /api/members/{id}         → get single member
// POST   /api/members              → create member
// PUT    /api/members/{id}         → update member
// DELETE /api/members/{id}         → soft-delete member
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/members")]
    [AllowAnonymous]
    public class MemberController : ControllerBase
    {
        private static bool _schemaEnsured = false;
        private static void EnsureSchema(NpgsqlConnection conn)
        {
            if (_schemaEnsured) return;
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS UnitType VARCHAR(50);
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS MemName6 VARCHAR(200);
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS GSTIN VARCHAR(50);
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS DefaultBillType VARCHAR(100) DEFAULT 'Maintenance';
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS AgreementDate TIMESTAMP;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS RegistrationDate TIMESTAMP;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS StampDate TIMESTAMP;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS AgreementRegNo VARCHAR(100);
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS AgreementValue NUMERIC(15, 2) DEFAULT 0;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS StampValue NUMERIC(15, 2) DEFAULT 0;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS RegistrationFees NUMERIC(15, 2) DEFAULT 0;
                    ALTER TABLE jeevika_erp.SocMemberOpBalance ADD COLUMN IF NOT EXISTS BillTypeId INT;

                    -- Suffix existing soft-deleted members so their codes can be reused immediately
                    UPDATE jeevika_erp.SocMember 
                    SET MemCode = MemCode || '_del_' || MemberId 
                    WHERE IsDeleted = TRUE AND MemCode NOT LIKE '%_del_%';

                    -- Drop legacy full-table unique constraints on SocMember to allow partial indexing
                    DO $$
                    DECLARE
                        r RECORD;
                    BEGIN
                        FOR r IN (
                            SELECT conname
                            FROM pg_constraint
                            WHERE conrelid = 'jeevika_erp.SocMember'::regclass
                              AND contype = 'u'
                        ) LOOP
                            EXECUTE 'ALTER TABLE jeevika_erp.SocMember DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
                        END LOOP;
                    END $$;

                    -- Create partial unique index on active (non-deleted) members only
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_socmember_active_memcode 
                    ON jeevika_erp.SocMember (SocietyId, UPPER(MemCode)) 
                    WHERE IsDeleted = FALSE;

                    -- Clean up any orphaned opening balances or matrix rows from deleted members
                    DELETE FROM jeevika_erp.SocMemberOpBalance 
                    WHERE MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE IsDeleted = TRUE);

                    DELETE FROM jeevika_erp.SocBillingMatrix 
                    WHERE MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE IsDeleted = TRUE);
                ";
                cmd.ExecuteNonQuery();
                EnsureOpBalTable(conn);
                _schemaEnsured = true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("[MemberController.EnsureSchema] Error: " + ex.Message);
            }
        }

        [HttpGet("debug-find-amounts")]
        [AllowAnonymous]
        public IActionResult DebugFindAmounts()
        {
            using var conn = DbHelper.GetConn();
            var list = new List<object>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT SocietyId, MemberId, BillType, OpPrincipal, OpInterest FROM jeevika_erp.SocMemberOpBalance";
                using var r = cmd.ExecuteReader();
                while (r.Read()) list.Add(new { table = "SocMemberOpBalance", sid = r["SocietyId"], mid = r["MemberId"], bt = r["BillType"], prin = r["OpPrincipal"], intr = r["OpInterest"] });
            }
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT BillId, SocietyId, MemberId, BillNo, BillType, BillTypeId, TotalAmount, PaidAmount, BalanceAmount, IsDeleted FROM jeevika_erp.SocMemberBill";
                using var r = cmd.ExecuteReader();
                while (r.Read()) list.Add(new { table = "SocMemberBill", bid = r["BillId"], sid = r["SocietyId"], mid = r["MemberId"], bno = r["BillNo"], bt = r["BillType"], btid = r["BillTypeId"], tot = r["TotalAmount"], paid = r["PaidAmount"], bal = r["BalanceAmount"], del = r["IsDeleted"] });
            }
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT MemberId, SocietyId, MemCode, MemName, FlatNo, OpPrincipal, OpInterest, IsDeleted FROM jeevika_erp.SocMember";
                using var r = cmd.ExecuteReader();
                while (r.Read()) list.Add(new { table = "SocMember", mid = r["MemberId"], sid = r["SocietyId"], code = r["MemCode"], name = r["MemName"], flat = r["FlatNo"], prin = r["OpPrincipal"], intr = r["OpInterest"], del = r["IsDeleted"] });
            }
            return Ok(list);
        }

        // ── GET /api/members?societyId=X ────────────────────────
        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetAll([FromQuery] int societyId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureSchema(conn);

                if (societyId <= 0)
                    return Ok(new { success = true, data = new List<object>(), count = 0 });

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT * FROM jeevika_erp.SocMember
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                    ORDER BY Wing, FlatNo, MemName";
                cmd.Parameters.AddWithValue("@sid", societyId);

                var opBalMap = GetOpBalancesForSociety(conn, societyId);

                var list = new List<object>();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read()) list.Add(MapMember(r, opBalMap));
                }

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/members/{id} ────────────────────────────────
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureSchema(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT * FROM jeevika_erp.SocMember
                    WHERE MemberId = @id AND IsDeleted = FALSE
                    LIMIT 1";
                cmd.Parameters.AddWithValue("@id", id);

                using var r = cmd.ExecuteReader();
                if (!r.Read())
                    return NotFound(new { success = false, message = "Member not found." });

                int memId = Convert.ToInt32(r["MemberId"]);
                int socId = Convert.ToInt32(r["SocietyId"]);
                var opBalMap = GetOpBalancesForMember(conn, socId, memId);

                return Ok(new { success = true, data = MapMember(r, opBalMap) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/members ────────────────────────────────────
        [HttpPost]
        [AllowAnonymous]
        public IActionResult Create([FromBody] MemberModel model)
        {
            if (string.IsNullOrWhiteSpace(model.MemName))
                return BadRequest(new { success = false, message = "MemName is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureSchema(conn);

                if (model.SocietyId <= 0)
                {
                    return BadRequest(new { success = false, message = "societyId is required." });
                }
                int sid = model.SocietyId;

                if (string.IsNullOrWhiteSpace(model.MemCode))
                {
                    return BadRequest(new { success = false, message = "Member Code is required. Please enter a valid Member Code." });
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocMember
                        (SocietyId, MemCode, MemName, MemName2, MemName3, MemName4, MemName5, MemName6, MemMarName,
                         Building, Wing, FlatNo, Floor, UnitType, FlatType, UnitNo, AreaSqft, AreaType, AreaCategory, AreaUnit,
                         ContactNo, Email, PANNo, TANNo, EntryDate, MemberType, Shares,
                         NonOccApplicable, NonOccReason, TenantName, TenantContact,
                         ParkingSlot2W, ParkingSlot4W, VehicleNo2W, VehicleNo4W,
                         LienBankName, LienLoanNo, LienAmount, LienStatus,
                         ShareCertNo, FolioNo, ShareFromNo, ShareToNo,
                         NomineeName, NomineeRelation, NomineeAddress, NomineeSharePct,
                         IsTransferred, TransferDate, TransferType, TransfereeName,
                         OpPrincipal, OpInterest, IsDeleted, CreatedAt)
                    VALUES
                        (@sid, @code, @name, @name2, @name3, @name4, @name5, @name6, @marname,
                         @bldg, @wing, @flat, @floor, @unitType, @flatType, @unit, @area, @areaType, @areaCat, @areaUnit,
                         @contact, @email, @pan, @tan, @entryDate, @memType, @shares,
                         @nonOccApp, @nonOccReason, @tenantName, @tenantContact,
                         @park2w, @park4w, @veh2w, @veh4w,
                         @lienBank, @lienLoan, @lienAmt, @lienStatus,
                         @shareCert, @folio, @shareFrom, @shareTo,
                         @nominee, @nomRelation, @nomAddr, @nomPct,
                         @isTransferred, @transDate, @transType, @transferee,
                         @opPrin, @opInt, FALSE, NOW())
                    RETURNING MemberId";

                AddMemberParams(cmd, model);

                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                SaveOpBalances(conn, model.SocietyId, newId, model.OpBalances);

                return Ok(new { success = true, message = "Member created successfully.", memberId = newId, memCode = model.MemCode });
            }
            catch (PostgresException ex) when (ex.SqlState == "23505")
            {
                return Conflict(new { success = false, message = "Member code already exists in this society." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/members/{id} ────────────────────────────────
        [HttpPut("{id:int}")]
        [AllowAnonymous]
        public IActionResult Update(int id, [FromBody] MemberModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureSchema(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE jeevika_erp.SocMember SET
                        MemCode          = @code,
                        MemName          = @name,
                        MemName2         = @name2,
                        MemName3         = @name3,
                        MemName4         = @name4,
                        MemName5         = @name5,
                        MemName6         = @name6,
                        MemMarName       = @marname,
                        Building         = @bldg,
                        Wing             = @wing,
                        FlatNo           = @flat,
                        Floor            = @floor,
                        UnitType         = @unitType,
                        FlatType         = @flatType,
                        UnitNo           = @unit,
                        AreaSqft         = @area,
                        AreaType         = @areaType,
                        AreaCategory     = @areaCat,
                        AreaUnit         = @areaUnit,
                        ContactNo        = @contact,
                        Email            = @email,
                        PANNo            = @pan,
                        TANNo            = @tan,
                        EntryDate        = @entryDate,
                        MemberType       = @memType,
                        Shares           = @shares,
                        NonOccApplicable = @nonOccApp,
                        NonOccReason     = @nonOccReason,
                        TenantName       = @tenantName,
                        TenantContact    = @tenantContact,
                        ParkingSlot2W    = @park2w,
                        ParkingSlot4W    = @park4w,
                        VehicleNo2W      = @veh2w,
                        VehicleNo4W      = @veh4w,
                        LienBankName     = @lienBank,
                        LienLoanNo       = @lienLoan,
                        LienAmount       = @lienAmt,
                        LienStatus       = @lienStatus,
                        ShareCertNo      = @shareCert,
                        FolioNo          = @folio,
                        ShareFromNo      = @shareFrom,
                        ShareToNo        = @shareTo,
                        NomineeName      = @nominee,
                        NomineeRelation  = @nomRelation,
                        NomineeAddress   = @nomAddr,
                        NomineeSharePct  = @nomPct,
                        IsTransferred    = @isTransferred,
                        TransferDate     = @transDate,
                        TransferType     = @transType,
                        TransfereeName   = @transferee,
                        OpPrincipal      = @opPrin,
                        OpInterest       = @opInt
                    WHERE MemberId = @id AND IsDeleted = FALSE";

                AddMemberParams(cmd, model);
                cmd.Parameters.AddWithValue("@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Member not found." });

                SaveOpBalances(conn, model.SocietyId, id, model.OpBalances);

                return Ok(new { success = true, message = "Member updated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/members/{id} ─────────────────────────────
        [HttpDelete("{id:int}")]
        [AllowAnonymous]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureSchema(conn);

                // 1. Check if member exists and get society ID
                int sid = 0;
                string memCode = "";
                string memName = "";
                string flatNo = "";
                using (var checkCmd = conn.CreateCommand())
                {
                    checkCmd.CommandText = "SELECT SocietyId, MemCode, MemName, FlatNo FROM jeevika_erp.SocMember WHERE MemberId = @id AND IsDeleted = FALSE LIMIT 1";
                    checkCmd.Parameters.AddWithValue("@id", id);
                    using var r = checkCmd.ExecuteReader();
                    if (!r.Read())
                        return NotFound(new { success = false, message = "Member not found or already deleted." });
                    sid = Convert.ToInt32(r["SocietyId"]);
                    memCode = r["MemCode"]?.ToString()?.Trim() ?? "";
                    memName = r["MemName"]?.ToString()?.Trim() ?? "";
                    flatNo = r["FlatNo"]?.ToString()?.Trim() ?? "";
                }

                // 2. CHECK EXISTING TRANSACTIONS (Zero tolerance: Bills, Other Receipts, Payments, Contra, JV, Purchase Orders, Receipts, Notes)
                var txDetails = GetMemberExistingTransactions(conn, sid, id, memCode, flatNo, memName);
                if (txDetails.Count > 0)
                {
                    return BadRequest(new { 
                        success = false, 
                        message = $"Cannot delete member <b>'{memName}'</b> ({memCode}).<br><br><b>Reason:</b> Member has existing transaction records:<br>• {string.Join("<br>• ", txDetails)}<br><br><b>Rule:</b> A member with transaction history cannot be deleted to preserve accounting and audit integrity." 
                    });
                }

                // 3. CHECK LEDGER BALANCES ACROSS ALL BILL TYPES
                var billTypeBalances = CalculateAllBillTypeBalances(conn, sid, id, memCode, flatNo);
                var nonZeroBals = billTypeBalances.Where(b => Math.Abs(b.Balance) > 0.01m).ToList();
                if (nonZeroBals.Count > 0)
                {
                    var balLines = nonZeroBals.Select(b => {
                        string sign = b.Balance > 0 ? "Dues" : "Advance Credit";
                        return $"• {b.BillTypeName}: <b>₹{Math.Abs(b.Balance):N2}</b> ({sign})";
                    });

                    return BadRequest(new { 
                        success = false, 
                        message = $"Cannot delete member <b>'{memName}'</b> ({memCode}).<br><br><b>Reason:</b> Member has an outstanding ledger balance in the following Bill Type(s):<br>{string.Join("<br>", balLines)}<br><br><b>Rule:</b> A member can only be deleted when their ledger balance is <b>₹0.00</b> across all bill types." 
                    });
                }

                // 4. If zero transactions and zero balance, perform soft-delete
                using var tx = conn.BeginTransaction();
                try
                {
                    using var cmd = conn.CreateCommand();
                    cmd.Transaction = tx;
                    cmd.CommandText = @"
                        UPDATE jeevika_erp.SocMember 
                        SET IsDeleted = TRUE, 
                            MemCode = MemCode || '_del_' || MemberId 
                        WHERE MemberId = @id AND IsDeleted = FALSE";
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.ExecuteNonQuery();

                    // Remove orphaned entries in billing matrix and opening balances
                    using var matCmd = conn.CreateCommand();
                    matCmd.Transaction = tx;
                    matCmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocBillingMatrix WHERE MemberId = @id;
                        DELETE FROM jeevika_erp.SocMemberOpBalance WHERE MemberId = @id;";
                    matCmd.Parameters.AddWithValue("@id", id);
                    matCmd.ExecuteNonQuery();

                    tx.Commit();
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }

                return Ok(new { success = true, message = "Member deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static List<string> GetMemberExistingTransactions(NpgsqlConnection conn, int societyId, int memberId, string memCode, string flatNo, string memName)
        {
            var txDetails = new List<string>();

            // 1. Check Bills (SocMemberBill) across all bill types
            using (var cmdBills = conn.CreateCommand())
            {
                cmdBills.CommandText = @"
                    SELECT COALESCE(b.BillType, bt.BillTypeName, 'Maintenance') AS BType, COUNT(*) AS Cnt
                    FROM jeevika_erp.SocMemberBill b
                    LEFT JOIN jeevika_erp.SocBillType bt ON b.BillTypeId = bt.BillTypeId
                    WHERE b.MemberId = @id AND b.IsDeleted = FALSE
                    GROUP BY COALESCE(b.BillType, bt.BillTypeName, 'Maintenance')";
                cmdBills.Parameters.AddWithValue("@id", memberId);
                using var rB = cmdBills.ExecuteReader();
                while (rB.Read())
                {
                    string bt = rB["BType"]?.ToString() ?? "Bill";
                    int cnt = Convert.ToInt32(rB["Cnt"]);
                    txDetails.Add($"{cnt} Bill(s) in '{bt}'");
                }
            }

            // 2. Check Vouchers from SocVoucherHeader (Other Receipt, Payment, Contra, JV, Purchase Order, Receipt, etc.)
            using (var cmdVouchers = conn.CreateCommand())
            {
                cmdVouchers.CommandText = @"
                    SELECT VoucherType, COUNT(*) AS Cnt
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid 
                      AND IsDeleted = FALSE
                      AND (
                          PersonCode = @code 
                          OR PersonCode = @flat
                          OR RefNo = @code 
                          OR RefNo = @flat
                          OR (PersonType = 'Member' AND (PersonCode = @code OR PersonCode = @flat OR PersonName = @name))
                          OR PersonName ILIKE @pattern
                          OR RefNo ILIKE @pattern2
                      )
                    GROUP BY VoucherType";
                cmdVouchers.Parameters.AddWithValue("@sid", societyId);
                cmdVouchers.Parameters.AddWithValue("@code", memCode);
                cmdVouchers.Parameters.AddWithValue("@flat", flatNo);
                cmdVouchers.Parameters.AddWithValue("@name", memName);
                cmdVouchers.Parameters.AddWithValue("@pattern", $"%({memberId})%");
                cmdVouchers.Parameters.AddWithValue("@pattern2", $"%M-{memberId}%");
                using var rV = cmdVouchers.ExecuteReader();
                while (rV.Read())
                {
                    string vType = rV["VoucherType"]?.ToString() ?? "Voucher";
                    int cnt = Convert.ToInt32(rV["Cnt"]);
                    string label = vType switch
                    {
                        "OtherReceipt" => $"{cnt} Other Receipt(s)",
                        "Payment" => $"{cnt} Payment Entry(ies)",
                        "Contra" => $"{cnt} Contra Entry(ies)",
                        "Journal" or "JV" => $"{cnt} Journal Voucher(s) (JV)",
                        "PurchaseOrder" => $"{cnt} Purchase Order(s)",
                        "MemberReceipt" or "Receipt" => $"{cnt} Member Receipt(s)",
                        "DebitNote" => $"{cnt} Debit Note(s)",
                        "CreditNote" => $"{cnt} Credit Note(s)",
                        _ => $"{cnt} {vType} Voucher(s)"
                    };
                    txDetails.Add(label);
                }
            }

            // 3. Check Member Notes (SocMemberNote)
            using (var cmdNotes = conn.CreateCommand())
            {
                cmdNotes.CommandText = @"
                    SELECT NoteType, COUNT(*) AS Cnt 
                    FROM jeevika_erp.SocMemberNote 
                    WHERE MemberId = @id AND IsDeleted = FALSE 
                    GROUP BY NoteType";
                cmdNotes.Parameters.AddWithValue("@id", memberId);
                using var rN = cmdNotes.ExecuteReader();
                while (rN.Read())
                {
                    string nType = rN["NoteType"]?.ToString() ?? "Note";
                    int cnt = Convert.ToInt32(rN["Cnt"]);
                    txDetails.Add($"{cnt} {nType}(s)");
                }
            }

            // 4. Check SocMemberReceipt if table exists
            try
            {
                using (var cmdRec = conn.CreateCommand())
                {
                    cmdRec.CommandText = "SELECT COUNT(*) FROM jeevika_erp.SocMemberReceipt WHERE MemberId = @id AND IsDeleted = FALSE";
                    cmdRec.Parameters.AddWithValue("@id", memberId);
                    int recCnt = Convert.ToInt32(cmdRec.ExecuteScalar() ?? 0);
                    if (recCnt > 0 && !txDetails.Any(x => x.Contains("Member Receipt")))
                    {
                        txDetails.Add($"{recCnt} Member Receipt(s)");
                    }
                }
            }
            catch { }

            return txDetails;
        }

        private class BillTypeBalanceDto
        {
            public int BillTypeId { get; set; }
            public string BillTypeName { get; set; } = "";
            public decimal Balance { get; set; }
        }

        private static List<BillTypeBalanceDto> CalculateAllBillTypeBalances(NpgsqlConnection conn, int societyId, int memberId, string memCode, string flatNo)
        {
            var result = new List<BillTypeBalanceDto>();

            // 1. Get all active bill types for this society
            var billTypes = new List<(int Id, string Name)>();
            using (var cmdBt = conn.CreateCommand())
            {
                cmdBt.CommandText = "SELECT BillTypeId, BillTypeName FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY BillTypeId ASC";
                cmdBt.Parameters.AddWithValue("@sid", societyId);
                using var rBt = cmdBt.ExecuteReader();
                while (rBt.Read())
                {
                    billTypes.Add((Convert.ToInt32(rBt["BillTypeId"]), rBt["BillTypeName"]?.ToString()?.Trim() ?? ""));
                }
            }
            if (!billTypes.Any(x => x.Name.Equals("Maintenance", StringComparison.OrdinalIgnoreCase)))
            {
                billTypes.Insert(0, (0, "Maintenance"));
            }

            // 2. Member base opening balances
            decimal memOpPrin = 0;
            decimal memOpInt = 0;
            using (var mCmd = conn.CreateCommand())
            {
                mCmd.CommandText = "SELECT OpPrincipal, OpInterest FROM jeevika_erp.SocMember WHERE MemberId = @id LIMIT 1";
                mCmd.Parameters.AddWithValue("@id", memberId);
                using var rM = mCmd.ExecuteReader();
                if (rM.Read())
                {
                    memOpPrin = rM["OpPrincipal"] != DBNull.Value ? Convert.ToDecimal(rM["OpPrincipal"]) : 0;
                    memOpInt = rM["OpInterest"] != DBNull.Value ? Convert.ToDecimal(rM["OpInterest"]) : 0;
                }
            }

            // 3. For each bill type, compute balance
            foreach (var bt in billTypes)
            {
                bool isMaint = bt.Name.Equals("Maintenance", StringComparison.OrdinalIgnoreCase);
                decimal op = isMaint ? (memOpPrin + memOpInt) : 0;

                // Check SocMemberOpBalance table for this specific bill type
                using (var cmdOp = conn.CreateCommand())
                {
                    cmdOp.CommandText = @"
                        SELECT COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0) 
                        FROM jeevika_erp.SocMemberOpBalance 
                        WHERE SocietyId = @sid 
                          AND MemberId = @mid
                          AND LOWER(TRIM(BillType)) = LOWER(TRIM(@btype))
                        LIMIT 1";
                    cmdOp.Parameters.AddWithValue("@sid", societyId);
                    cmdOp.Parameters.AddWithValue("@mid", memberId);
                    cmdOp.Parameters.AddWithValue("@btype", bt.Name);
                    var opRes = cmdOp.ExecuteScalar();
                    if (opRes != null && opRes != DBNull.Value)
                    {
                        decimal specificOp = Convert.ToDecimal(opRes);
                        if (specificOp != 0 || !isMaint)
                        {
                            op = specificOp;
                        }
                    }
                }

                decimal billsTotal = 0;
                using (var cmdB = conn.CreateCommand())
                {
                    var sqlB = @"
                        SELECT COALESCE(SUM(TotalAmount), 0) - COALESCE(SUM(PaidAmount), 0)
                        FROM jeevika_erp.SocMemberBill
                        WHERE SocietyId = @sid AND MemberId = @mid AND IsDeleted = FALSE";
                    if (isMaint)
                    {
                        sqlB += @" AND (BillTypeId = @btid OR BillTypeId IS NULL OR BillTypeId = 0 OR LOWER(TRIM(COALESCE(BillType, ''))) = 'maintenance' OR TRIM(COALESCE(BillType, '')) = '')";
                    }
                    else
                    {
                        sqlB += @" AND (BillTypeId = @btid OR LOWER(TRIM(COALESCE(BillType, ''))) = LOWER(TRIM(@btype)))";
                    }
                    cmdB.CommandText = sqlB;
                    cmdB.Parameters.AddWithValue("@sid", societyId);
                    cmdB.Parameters.AddWithValue("@mid", memberId);
                    cmdB.Parameters.AddWithValue("@btid", bt.Id);
                    cmdB.Parameters.AddWithValue("@btype", bt.Name);
                    billsTotal = Convert.ToDecimal(cmdB.ExecuteScalar() ?? 0);
                }

                decimal netBal = op + billsTotal;
                result.Add(new BillTypeBalanceDto
                {
                    BillTypeId = bt.Id,
                    BillTypeName = bt.Name,
                    Balance = netBal
                });
            }

            return result;
        }

        // ── Helpers ──────────────────────────────────────────────
        private static void EnsureOpBalTable(NpgsqlConnection conn)
        {
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberOpBalance (
                        SocietyId INT NOT NULL,
                        MemberId INT NOT NULL,
                        BillType VARCHAR(100) NOT NULL,
                        OpPrincipal NUMERIC(15, 2) DEFAULT 0,
                        OpInterest NUMERIC(15, 2) DEFAULT 0,
                        PRIMARY KEY (SocietyId, MemberId, BillType)
                    );";
                cmd.ExecuteNonQuery();
            }
            catch { }
        }

        private static Dictionary<int, Dictionary<string, object>> GetOpBalancesForSociety(NpgsqlConnection conn, int societyId)
        {
            EnsureOpBalTable(conn);
            var map = new Dictionary<int, Dictionary<string, object>>();
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT MemberId, BillType, OpPrincipal, OpInterest 
                    FROM jeevika_erp.SocMemberOpBalance 
                    WHERE SocietyId = @sid";
                cmd.Parameters.AddWithValue("@sid", societyId);

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    int mId = Convert.ToInt32(r["MemberId"]);
                    string bType = r["BillType"]?.ToString() ?? "Maintenance";
                    decimal prin = Convert.ToDecimal(r["OpPrincipal"]);
                    decimal intr = Convert.ToDecimal(r["OpInterest"]);

                    if (!map.ContainsKey(mId))
                        map[mId] = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

                    map[mId][bType] = new { principal = prin, interest = intr };
                }
            }
            catch { }
            return map;
        }

        private static Dictionary<int, Dictionary<string, object>> GetOpBalancesForMember(NpgsqlConnection conn, int societyId, int memberId)
        {
            EnsureOpBalTable(conn);
            var map = new Dictionary<int, Dictionary<string, object>>();
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT MemberId, BillType, OpPrincipal, OpInterest 
                    FROM jeevika_erp.SocMemberOpBalance 
                    WHERE SocietyId = @sid AND MemberId = @mid";
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.Parameters.AddWithValue("@mid", memberId);

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    int mId = Convert.ToInt32(r["MemberId"]);
                    string bType = r["BillType"]?.ToString() ?? "Maintenance";
                    decimal prin = Convert.ToDecimal(r["OpPrincipal"]);
                    decimal intr = Convert.ToDecimal(r["OpInterest"]);

                    if (!map.ContainsKey(mId))
                        map[mId] = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

                    map[mId][bType] = new { principal = prin, interest = intr };
                }
            }
            catch { }
            return map;
        }

        private static void SaveOpBalances(NpgsqlConnection conn, int societyId, int memberId, Dictionary<string, MemberOpBalItemDto>? opBalances)
        {
            if (opBalances == null || opBalances.Count == 0) return;
            EnsureOpBalTable(conn);
            try
            {
                foreach (var kvp in opBalances)
                {
                    if (string.IsNullOrWhiteSpace(kvp.Key)) continue;
                    var item = kvp.Value ?? new MemberOpBalItemDto();

                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        INSERT INTO jeevika_erp.SocMemberOpBalance
                            (SocietyId, MemberId, BillType, OpPrincipal, OpInterest)
                        VALUES
                            (@sid, @mid, @btype, @prin, @int)
                        ON CONFLICT (SocietyId, MemberId, BillType) DO UPDATE SET
                            OpPrincipal = EXCLUDED.OpPrincipal,
                            OpInterest  = EXCLUDED.OpInterest";

                    cmd.Parameters.AddWithValue("@sid",   societyId);
                    cmd.Parameters.AddWithValue("@mid",   memberId);
                    cmd.Parameters.AddWithValue("@btype", kvp.Key.Trim());
                    cmd.Parameters.AddWithValue("@prin",  item.Principal);
                    cmd.Parameters.AddWithValue("@int",   item.Interest);
                    cmd.ExecuteNonQuery();
                }
            }
            catch { }
        }

        private static object MapMember(NpgsqlDataReader r, Dictionary<int, Dictionary<string, object>>? opBalMap = null)
        {
            bool HasCol(string col)
            {
                try { return r.GetOrdinal(col) >= 0; }
                catch { return false; }
            }
            T? Get<T>(string col)
            {
                try {
                    if (!HasCol(col)) return default;
                    var v = r[col]; return v == DBNull.Value ? default : (T)Convert.ChangeType(v, typeof(T));
                }
                catch { return default; }
            }
            string S(string col)
            {
                try {
                    if (!HasCol(col)) return "";
                    return r[col]?.ToString() ?? "";
                } catch { return ""; }
            }

            int mId = Get<int>("MemberId");
            Dictionary<string, object>? memberOpBals = null;
            if (opBalMap != null && opBalMap.TryGetValue(mId, out var dict))
            {
                memberOpBals = dict;
            }

            return new
            {
                socMemId         = mId,
                memberId         = mId,
                societyId        = Get<int>("SocietyId"),
                memCode          = S("MemCode"),
                memName          = S("MemName"),
                memName1         = S("MemName"),
                memName2         = S("MemName2"),
                memName3         = S("MemName3"),
                memName4         = S("MemName4"),
                memName5         = S("MemName5"),
                memName6         = S("MemName6"),
                memMarName       = S("MemMarName"),
                building         = S("Building"),
                bldg             = S("Building"),
                wing             = S("Wing"),
                flatNo           = S("FlatNo"),
                floor            = S("Floor"),
                unitType         = S("UnitType"),
                flatType         = S("FlatType"),
                unitNo           = S("UnitNo"),
                areaSqft         = Get<decimal>("AreaSqft"),
                sqft             = Get<decimal>("AreaSqft"),
                areaType         = S("AreaType"),
                areaCategory     = S("AreaCategory"),
                areaUnit         = S("AreaUnit"),
                memMobile        = S("ContactNo"),
                contactNo        = S("ContactNo"),
                memEmail         = S("Email"),
                email            = S("Email"),
                panNo            = S("PANNo"),
                tanNo            = S("TANNo"),
                entryDate        = r["EntryDate"] == DBNull.Value ? null : r.GetDateTime(r.GetOrdinal("EntryDate")).ToString("yyyy-MM-dd"),
                memberType       = S("MemberType"),
                shares           = Get<int>("Shares"),
                nonOccApplicable = S("NonOccApplicable"),
                nonOccReason     = S("NonOccReason"),
                tenantName       = S("TenantName"),
                tenantContact    = S("TenantContact"),
                parkingSlot2W    = S("ParkingSlot2W"),
                parkingSlot4W    = S("ParkingSlot4W"),
                vehicleNo2W      = S("VehicleNo2W"),
                vehicleNo4W      = S("VehicleNo4W"),
                lienBankName     = S("LienBankName"),
                lienLoanNo       = S("LienLoanNo"),
                lienAmount       = Get<decimal>("LienAmount"),
                lienStatus       = S("LienStatus"),
                shareCertNo      = S("ShareCertNo"),
                folioNo          = S("FolioNo"),
                shareFromNo      = Get<int>("ShareFromNo"),
                shareToNo        = Get<int>("ShareToNo"),
                nomineeName      = S("NomineeName"),
                nomineeRelation  = S("NomineeRelation"),
                nomineeAddress   = S("NomineeAddress"),
                nomineeSharePct  = Get<decimal>("NomineeSharePct"),
                isTransferred    = S("IsTransferred"),
                transferDate     = r["TransferDate"] == DBNull.Value ? null : r.GetDateTime(r.GetOrdinal("TransferDate")).ToString("yyyy-MM-dd"),
                transferType     = S("TransferType"),
                transfereeName   = S("TransfereeName"),
                opPrincipal      = Get<decimal>("OpPrincipal"),
                opInterest       = Get<decimal>("OpInterest"),
                totalBalance     = Get<decimal>("OpPrincipal") + Get<decimal>("OpInterest"),
                gstin            = S("GSTIN"),
                defaultBillType  = S("DefaultBillType"),
                billType         = S("DefaultBillType"),
                agreementDate    = (!HasCol("AgreementDate") || r["AgreementDate"] == DBNull.Value) ? null : Convert.ToDateTime(r["AgreementDate"]).ToString("yyyy-MM-dd"),
                registrationDate = (!HasCol("RegistrationDate") || r["RegistrationDate"] == DBNull.Value) ? null : Convert.ToDateTime(r["RegistrationDate"]).ToString("yyyy-MM-dd"),
                stampDate        = (!HasCol("StampDate") || r["StampDate"] == DBNull.Value) ? null : Convert.ToDateTime(r["StampDate"]).ToString("yyyy-MM-dd"),
                agreementRegNo   = S("AgreementRegNo"),
                agreementValue   = Get<decimal>("AgreementValue"),
                stampValue       = Get<decimal>("StampValue"),
                registrationFees = Get<decimal>("RegistrationFees"),
                opBalances       = memberOpBals,
                isDeleted        = Get<bool>("IsDeleted"),
                createdAt        = Get<DateTime>("CreatedAt")
            };
        }

        private static void AddMemberParams(NpgsqlCommand cmd, MemberModel m)
        {
            cmd.Parameters.AddWithValue("@sid",           m.SocietyId);
            cmd.Parameters.AddWithValue("@code",          m.MemCode.Trim());
            cmd.Parameters.AddWithValue("@name",          m.MemName.Trim());
            cmd.Parameters.AddWithValue("@name2",         (object?)m.MemName2        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@name3",         (object?)m.MemName3        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@name4",         (object?)m.MemName4        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@name5",         (object?)m.MemName5        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@name6",         (object?)m.MemName6        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@marname",       (object?)m.MemMarName      ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@bldg",          (object?)m.Building        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@wing",          (object?)m.Wing            ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@flat",          (object?)m.FlatNo          ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@floor",         (object?)m.Floor           ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@unitType",      (object?)m.UnitType        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@flatType",      (object?)m.FlatType        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@unit",          (object?)m.UnitNo          ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@area",          m.AreaSqft);
            cmd.Parameters.AddWithValue("@areaType",      (object?)m.AreaType        ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@areaCat",       (object?)m.AreaCategory    ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@areaUnit",      string.IsNullOrWhiteSpace(m.AreaUnit) ? "Sq.Ft" : m.AreaUnit);
            cmd.Parameters.AddWithValue("@contact",       (object?)m.ContactNo       ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@email",         (object?)m.Email           ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@pan",           (object?)m.PANNo           ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tan",           (object?)m.TANNo           ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@entryDate",     m.EntryDate.HasValue ? (object)m.EntryDate.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@memType",       string.IsNullOrWhiteSpace(m.MemberType) ? "Owner" : m.MemberType);
            cmd.Parameters.AddWithValue("@shares",        m.Shares);
            cmd.Parameters.AddWithValue("@nonOccApp",     string.IsNullOrWhiteSpace(m.NonOccApplicable) ? "No" : m.NonOccApplicable);
            cmd.Parameters.AddWithValue("@nonOccReason",  (object?)m.NonOccReason    ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tenantName",    (object?)m.TenantName      ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tenantContact", (object?)m.TenantContact   ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@park2w",        (object?)m.ParkingSlot2W   ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@park4w",        (object?)m.ParkingSlot4W   ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@veh2w",         (object?)m.VehicleNo2W     ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@veh4w",         (object?)m.VehicleNo4W     ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@lienBank",      (object?)m.LienBankName    ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@lienLoan",      (object?)m.LienLoanNo      ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@lienAmt",       m.LienAmount);
            cmd.Parameters.AddWithValue("@lienStatus",    string.IsNullOrWhiteSpace(m.LienStatus) ? "None" : m.LienStatus);
            cmd.Parameters.AddWithValue("@shareCert",     (object?)m.ShareCertNo     ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@folio",         (object?)m.FolioNo         ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@shareFrom",     m.ShareFromNo);
            cmd.Parameters.AddWithValue("@shareTo",       m.ShareToNo);
            cmd.Parameters.AddWithValue("@nominee",       (object?)m.NomineeName     ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nomRelation",   (object?)m.NomineeRelation ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nomAddr",       (object?)m.NomineeAddress  ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nomPct",        m.NomineeSharePct);
            cmd.Parameters.AddWithValue("@isTransferred", string.IsNullOrWhiteSpace(m.IsTransferred) ? "No" : m.IsTransferred);
            cmd.Parameters.AddWithValue("@transDate",     m.TransferDate.HasValue ? (object)m.TransferDate.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@transType",     (object?)m.TransferType    ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@transferee",    (object?)m.TransfereeName  ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@opPrin",        m.OpPrincipal);
            cmd.Parameters.AddWithValue("@opInt",         m.OpInterest);
        }

        // ── GET /api/members/{id}/statement ──────────────────────
        [HttpGet("{id:int}/statement")]
        [AllowAnonymous]
        public IActionResult GetStatement(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT MemCode, MemName, Wing, FlatNo, OpPrincipal, OpInterest
                    FROM jeevika_erp.SocMember
                    WHERE MemberId = @id AND IsDeleted = FALSE
                    LIMIT 1";
                cmd.Parameters.AddWithValue("@id", id);

                using var r = cmd.ExecuteReader();
                if (!r.Read())
                    return NotFound(new { success = false, message = "Member not found." });

                var memCode = r["MemCode"]?.ToString();
                var memName = r["MemName"]?.ToString();
                var wing    = r["Wing"]?.ToString();
                var flat    = r["FlatNo"]?.ToString();
                var opPrin  = Convert.ToDecimal(r["OpPrincipal"]);
                var opInt   = Convert.ToDecimal(r["OpInterest"]);

                var entries = new List<object>
                {
                    new {
                        date = "01-04-2025",
                        particulars = "OPENING BALANCE DUES",
                        maint = opPrin,
                        water = 0, elec = 0, park = 0,
                        interest = opInt,
                        cgst = 0, sgst = 0, noc = 0, other = 0,
                        total = opPrin + opInt
                    },
                    new {
                        date = "01-05-2025",
                        particulars = "MAINTENANCE BILL MAY-2025",
                        maint = 1500.00,
                        water = 450.00, elec = 250.00, park = 500.00,
                        interest = 0,
                        cgst = 135.00, sgst = 135.00, noc = 0, other = 0,
                        total = 2970.00
                    }
                };

                return Ok(new {
                    success = true,
                    member = new { memCode, memName, wing, flat },
                    data = entries
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static void EnsureKYCColumns(NpgsqlConnection conn)
        {
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS AgreementDate TIMESTAMP;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS RegistrationDate TIMESTAMP;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS StampDate TIMESTAMP;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS AgreementRegNo VARCHAR(100);
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS AgreementValue NUMERIC(15, 2) DEFAULT 0;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS StampValue NUMERIC(15, 2) DEFAULT 0;
                    ALTER TABLE jeevika_erp.SocMember ADD COLUMN IF NOT EXISTS RegistrationFees NUMERIC(15, 2) DEFAULT 0;
                ";
                cmd.ExecuteNonQuery();
            }
            catch { }
        }

        private static void EnsureTransferTable(NpgsqlConnection conn)
        {
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    CREATE TABLE IF NOT EXISTS jeevika_erp.SocMemberTransfer (
                        TransferId SERIAL PRIMARY KEY,
                        SocietyId INT NOT NULL,
                        MemberId INT NOT NULL,
                        TransferDate TIMESTAMP,
                        TransferType VARCHAR(100),
                        MeetingType VARCHAR(100),
                        MeetingDate TIMESTAMP,
                        ResolutionNo VARCHAR(100),
                        TransferNo VARCHAR(100),
                        RegNoTransferor VARCHAR(100),
                        RegNoTransferee VARCHAR(100),
                        AgreementAssign VARCHAR(100),
                        TransferorName VARCHAR(255),
                        TransfereeName VARCHAR(255),
                        Remarks TEXT,
                        OldOwnerSnapshot JSONB
                    );";
                cmd.ExecuteNonQuery();
            }
            catch { }
        }

        // ── POST /api/members/{id}/transfer ──────────────────────
        [HttpPost("{id:int}/transfer")]
        [AllowAnonymous]
        public IActionResult ExecuteTransfer(int id, [FromBody] TransferModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureKYCColumns(conn);
                EnsureTransferTable(conn);

                // Get current member info to save JSON snapshot
                using var getCmd = conn.CreateCommand();
                getCmd.CommandText = "SELECT * FROM jeevika_erp.SocMember WHERE MemberId = @id LIMIT 1";
                getCmd.Parameters.AddWithValue("@id", id);

                string oldName = "";
                string snapshotJson = "{}";
                int memberSocId = 1;
                using (var r = getCmd.ExecuteReader())
                {
                    if (r.Read())
                    {
                        oldName = r["MemName"]?.ToString() ?? "";
                        memberSocId = r["SocietyId"] != DBNull.Value ? Convert.ToInt32(r["SocietyId"]) : 1;
                        var opMap = GetOpBalancesForMember(conn, memberSocId, id);
                        var snapshotDict = MapMember(r, opMap);
                        snapshotJson = System.Text.Json.JsonSerializer.Serialize(snapshotDict);
                    }
                }

                if (string.IsNullOrEmpty(oldName))
                    return NotFound(new { success = false, message = "Member not found." });

                // Insert into SocMemberTransfer
                using var insCmd = conn.CreateCommand();
                insCmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocMemberTransfer (
                        SocietyId, MemberId, TransferDate, TransferType, MeetingType, MeetingDate,
                        ResolutionNo, TransferNo, RegNoTransferor, RegNoTransferee, AgreementAssign,
                        TransferorName, TransfereeName, Remarks, OldOwnerSnapshot
                    ) VALUES (
                        @sid, @id, @tDate, @tType, @mType, @mDate,
                        @resNo, @tNo, @regTransferor, @regTransferee, @assign,
                        @transferor, @transferee, @remarks, @snapshot::jsonb
                    )";
                insCmd.Parameters.AddWithValue("@sid", memberSocId);
                insCmd.Parameters.AddWithValue("@id", id);
                insCmd.Parameters.AddWithValue("@tDate", model.TransferDate.HasValue ? (object)model.TransferDate.Value : DateTime.Now);
                insCmd.Parameters.AddWithValue("@tType", model.TransferType ?? "Sell");
                insCmd.Parameters.AddWithValue("@mType", model.MeetingType ?? "AGM");
                insCmd.Parameters.AddWithValue("@mDate", model.MeetingDate.HasValue ? (object)model.MeetingDate.Value : DBNull.Value);
                insCmd.Parameters.AddWithValue("@resNo", model.ResolutionNo ?? "");
                insCmd.Parameters.AddWithValue("@tNo", model.TransferNo ?? "");
                insCmd.Parameters.AddWithValue("@regTransferor", model.RegNoTransferor ?? "");
                insCmd.Parameters.AddWithValue("@regTransferee", model.RegNoTransferee ?? "");
                insCmd.Parameters.AddWithValue("@assign", model.AgreementAssign ?? "");
                insCmd.Parameters.AddWithValue("@transferor", oldName);
                insCmd.Parameters.AddWithValue("@transferee", model.TransfereeName ?? "");
                insCmd.Parameters.AddWithValue("@remarks", model.Remarks ?? "");
                insCmd.Parameters.AddWithValue("@snapshot", snapshotJson);
                insCmd.ExecuteNonQuery();

                // Update SocMember with new Transferee owner details & KYC values
                using var upCmd = conn.CreateCommand();
                upCmd.CommandText = @"
                    UPDATE jeevika_erp.SocMember SET
                        MemName = @newPrimary,
                        MemName2 = @new2,
                        MemName3 = @new3,
                        MemName4 = @new4,
                        MemName5 = @new5,
                        MemName6 = @new6,
                        ContactNo = @newPhone,
                        Email = @newEmail,
                        IsTransferred = 'Yes',
                        TransferDate = @tDate,
                        TransferType = @tType,
                        TransfereeName = @newPrimary,
                        AgreementDate = @agreeDate,
                        RegistrationDate = @regDate,
                        StampDate = @stampDate,
                        AgreementRegNo = @agreeRegNo,
                        AgreementValue = @agreeVal,
                        StampValue = @stampVal,
                        RegistrationFees = @regFees
                    WHERE MemberId = @id";
                upCmd.Parameters.AddWithValue("@newPrimary", model.TransfereeName ?? "");
                upCmd.Parameters.AddWithValue("@new2", model.NewPerson2 ?? "");
                upCmd.Parameters.AddWithValue("@new3", model.NewPerson3 ?? "");
                upCmd.Parameters.AddWithValue("@new4", (object?)model.NewPerson4 ?? DBNull.Value);
                upCmd.Parameters.AddWithValue("@new5", (object?)model.NewPerson5 ?? DBNull.Value);
                upCmd.Parameters.AddWithValue("@new6", (object?)model.NewPerson6 ?? DBNull.Value);
                upCmd.Parameters.AddWithValue("@newPhone", model.NewMobilePhone ?? "");
                upCmd.Parameters.AddWithValue("@newEmail", model.NewEmailID ?? "");
                upCmd.Parameters.AddWithValue("@tDate", model.TransferDate.HasValue ? (object)model.TransferDate.Value : DateTime.Now);
                upCmd.Parameters.AddWithValue("@tType", model.TransferType ?? "Sell");
                upCmd.Parameters.AddWithValue("@agreeDate", model.AgreementDate.HasValue ? (object)model.AgreementDate.Value : DBNull.Value);
                upCmd.Parameters.AddWithValue("@regDate", model.RegistrationDate.HasValue ? (object)model.RegistrationDate.Value : DBNull.Value);
                upCmd.Parameters.AddWithValue("@stampDate", model.StampDate.HasValue ? (object)model.StampDate.Value : DBNull.Value);
                upCmd.Parameters.AddWithValue("@agreeRegNo", (object?)model.AgreementRegNo ?? DBNull.Value);
                upCmd.Parameters.AddWithValue("@agreeVal", model.AgreementValue);
                upCmd.Parameters.AddWithValue("@stampVal", model.StampValue);
                upCmd.Parameters.AddWithValue("@regFees", model.RegistrationFees);
                upCmd.Parameters.AddWithValue("@id", id);
                upCmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Member ownership transfer executed successfully!" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/members/{id}/transfers ──────────────────────
        [HttpGet("{id:int}/transfers")]
        [AllowAnonymous]
        public IActionResult GetTransfers(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT * FROM jeevika_erp.SocMemberTransfer
                    WHERE MemberId = @id
                    ORDER BY TransferId DESC";
                cmd.Parameters.AddWithValue("@id", id);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new {
                        transferId      = Convert.ToInt32(r["TransferId"]),
                        transferDate    = r["TransferDate"] != DBNull.Value ? Convert.ToDateTime(r["TransferDate"]).ToString("dd-MM-yyyy") : "",
                        transferType    = r["TransferType"]?.ToString(),
                        meetingType     = r["MeetingType"]?.ToString(),
                        meetingDate     = r["MeetingDate"] != DBNull.Value ? Convert.ToDateTime(r["MeetingDate"]).ToString("dd-MM-yyyy") : "",
                        resolutionNo    = r["ResolutionNo"]?.ToString(),
                        transferNo      = r["TransferNo"]?.ToString(),
                        regNoTransferor = r["RegNoTransferor"]?.ToString(),
                        regNoTransferee = r["RegNoTransferee"]?.ToString(),
                        agreementAssign = r["AgreementAssign"]?.ToString(),
                        transferorName  = r["TransferorName"]?.ToString(),
                        transfereeName  = r["TransfereeName"]?.ToString(),
                        remarks         = r["Remarks"]?.ToString(),
                        snapshot        = r["OldOwnerSnapshot"]?.ToString()
                    });
                }
                return Ok(new { success = true, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/members/bulk-reassign ──────────────────────
        [HttpPost("bulk-reassign")]
        [AllowAnonymous]
        public IActionResult BulkReassign([FromBody] BulkReassignModel model)
        {
            if (model.MemberIds == null || model.MemberIds.Count == 0)
                return BadRequest(new { success = false, message = "No member IDs selected." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();

                var setList = new List<string>();
                if (!string.IsNullOrWhiteSpace(model.Wing))     setList.Add("Wing = @wing");
                if (!string.IsNullOrWhiteSpace(model.Building)) setList.Add("Building = @bldg");

                if (setList.Count == 0)
                    return BadRequest(new { success = false, message = "No change parameters provided." });

                cmd.CommandText = $"UPDATE jeevika_erp.SocMember SET {string.Join(", ", setList)} WHERE MemberId = ANY(@ids)";
                if (!string.IsNullOrWhiteSpace(model.Wing))     cmd.Parameters.AddWithValue("@wing", model.Wing.Trim());
                if (!string.IsNullOrWhiteSpace(model.Building)) cmd.Parameters.AddWithValue("@bldg", model.Building.Trim());
                cmd.Parameters.AddWithValue("@ids", model.MemberIds.ToArray());

                var rows = cmd.ExecuteNonQuery();
                return Ok(new { success = true, message = $"{rows} member(s) updated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/members/{id}/bill-breakup ───────────────────
        [HttpGet("{id:int}/bill-breakup")]
        [AllowAnonymous]
        public IActionResult GetMemberBillBreakup(int id, [FromQuery] int societyId = 0, [FromQuery] int billTypeId = 0)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                if (societyId <= 0)
                {
                    using var sCmd = conn.CreateCommand();
                    sCmd.CommandText = "SELECT SocietyId FROM jeevika_erp.SocMember WHERE MemberId = @id LIMIT 1";
                    sCmd.Parameters.AddWithValue("@id", id);
                    var res = sCmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value) societyId = Convert.ToInt32(res);
                }

                if (billTypeId <= 0)
                {
                    using var btCmd = conn.CreateCommand();
                    btCmd.CommandText = @"
                        SELECT BillTypeId FROM jeevika_erp.SocBillType
                        WHERE (SocietyId = @sid OR SocietyId = 1) AND IsActive = TRUE
                        ORDER BY (UPPER(BillTypeName) LIKE '%MAINT%') DESC, BillTypeId ASC LIMIT 1";
                    btCmd.Parameters.AddWithValue("@sid", societyId);
                    var bRes = btCmd.ExecuteScalar();
                    if (bRes != null && bRes != DBNull.Value) billTypeId = Convert.ToInt32(bRes);
                }

                if (billTypeId <= 0)
                {
                    return Ok(new { success = true, data = new { billTypeId = 0, billTypeName = "", total = 0, heads = new List<object>() } });
                }

                string billTypeName = "";
                using (var btCmd = conn.CreateCommand())
                {
                    btCmd.CommandText = "SELECT BillTypeName FROM jeevika_erp.SocBillType WHERE BillTypeId = @btId LIMIT 1";
                    btCmd.Parameters.AddWithValue("@btId", billTypeId);
                    billTypeName = btCmd.ExecuteScalar()?.ToString() ?? "";
                }

                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT h.HeadId, h.SrNo, h.AccountId,
                           COALESCE(NULLIF(h.AccountCode, ''), a.AccCode, '') AS AccCode,
                           COALESCE(NULLIF(h.AccountName, ''), a.AccName, '') AS AccName,
                           COALESCE(bm.Amount, 0) AS Amount
                    FROM jeevika_erp.SocBillTypeHead h
                    LEFT JOIN jeevika_erp.SocAccount a ON h.AccountId = a.AccountId
                    LEFT JOIN jeevika_erp.SocBillingMatrix bm ON (
                        bm.SocietyId = @sid AND
                        bm.BillTypeId = @btId AND
                        bm.MemberId = @memId AND
                        LOWER(bm.AccountCode) = LOWER(COALESCE(NULLIF(h.AccountCode, ''), a.AccCode, ''))
                    )
                    WHERE h.BillTypeId = @btId
                    ORDER BY h.SrNo ASC";
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.Parameters.AddWithValue("@btId", billTypeId);
                cmd.Parameters.AddWithValue("@memId", id);

                var heads = new List<object>();
                decimal total = 0;
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    var amt = r["Amount"] != DBNull.Value ? Convert.ToDecimal(r["Amount"]) : 0;
                    total += amt;
                    heads.Add(new {
                        headId    = Convert.ToInt32(r["HeadId"]),
                        srNo      = Convert.ToInt32(r["SrNo"]),
                        accountId = r["AccountId"] != DBNull.Value ? Convert.ToInt32(r["AccountId"]) : (int?)null,
                        accCode   = r["AccCode"]?.ToString() ?? "",
                        accName   = r["AccName"]?.ToString() ?? "",
                        amount    = amt
                    });
                }

                return Ok(new {
                    success = true,
                    data = new {
                        billTypeId,
                        billTypeName,
                        total,
                        heads
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/members/{id}/bill-breakup ───────────────────
        [HttpPost("{id:int}/bill-breakup")]
        [AllowAnonymous]
        public IActionResult SaveMemberBillBreakup(int id, [FromBody] MemberBillBreakupSaveModel model)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                int sid = model.SocietyId;
                if (sid <= 0)
                {
                    using var sCmd = conn.CreateCommand();
                    sCmd.CommandText = "SELECT SocietyId FROM jeevika_erp.SocMember WHERE MemberId = @id LIMIT 1";
                    sCmd.Parameters.AddWithValue("@id", id);
                    var res = sCmd.ExecuteScalar();
                    if (res != null && res != DBNull.Value) sid = Convert.ToInt32(res);
                }

                if (model.BillTypeId <= 0)
                    return BadRequest(new { success = false, message = "BillTypeId is required." });

                if (model.Heads != null && model.Heads.Count > 0)
                {
                    foreach (var h in model.Heads)
                    {
                        if (string.IsNullOrWhiteSpace(h.AccCode)) continue;
                        using var insCmd = conn.CreateCommand();
                        insCmd.CommandText = @"
                            INSERT INTO jeevika_erp.SocBillingMatrix (SocietyId, BillTypeId, MemberId, AccountCode, Amount, UpdatedAt)
                            VALUES (@sid, @btId, @memId, @code, @amt, NOW())
                            ON CONFLICT (SocietyId, BillTypeId, MemberId, AccountCode)
                            DO UPDATE SET Amount = EXCLUDED.Amount, UpdatedAt = NOW()";
                        insCmd.Parameters.AddWithValue("@sid", sid);
                        insCmd.Parameters.AddWithValue("@btId", model.BillTypeId);
                        insCmd.Parameters.AddWithValue("@memId", id);
                        insCmd.Parameters.AddWithValue("@code", h.AccCode.Trim());
                        insCmd.Parameters.AddWithValue("@amt", h.Amount);
                        insCmd.ExecuteNonQuery();
                    }
                }

                return Ok(new { success = true, message = "Member bill breakup saved successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static DateTime? ParseDateSafe(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return null;
            s = s.Trim();
            if (DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var dt))
                return dt;
            if (DateTime.TryParseExact(s, new[] { "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy/MM/dd", "d-M-yyyy", "d/M/yyyy" },
                System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out dt))
                return dt;
            if (double.TryParse(s, out double oaDate) && oaDate > 20000 && oaDate < 60000)
            {
                try { return DateTime.FromOADate(oaDate); } catch { }
            }
            return null;
        }

        // ── POST /api/members/bulk-import ────────────────────────
        [HttpPost("bulk-import")]
        [AllowAnonymous]
        public IActionResult BulkImport([FromBody] BulkImportRequestDto req)
        {
            if (req == null || req.Members == null || req.Members.Count == 0)
                return BadRequest(new { success = false, message = "No member records provided for import." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureSchema(conn);

                int sid = req.SocietyId;
                if (sid <= 0)
                    return BadRequest(new { success = false, message = "societyId is required for member bulk import." });

                // Load existing members for fast matching
                var existingByCode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                var existingByWingFlat = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

                using (var loadCmd = conn.CreateCommand())
                {
                    loadCmd.CommandText = "SELECT MemberId, MemCode, Wing, FlatNo FROM jeevika_erp.SocMember WHERE SocietyId = @sid AND IsDeleted = FALSE";
                    loadCmd.Parameters.AddWithValue("@sid", sid);
                    using var r = loadCmd.ExecuteReader();
                    while (r.Read())
                    {
                        int mId = Convert.ToInt32(r["MemberId"]);
                        string code = r["MemCode"]?.ToString()?.Trim() ?? "";
                        string wing = r["Wing"]?.ToString()?.Trim() ?? "";
                        string flat = r["FlatNo"]?.ToString()?.Trim() ?? "";

                        if (!string.IsNullOrEmpty(code) && !existingByCode.ContainsKey(code))
                            existingByCode[code] = mId;

                        string wingFlatKey = $"{wing}|{flat}".ToLowerInvariant();
                        if (!string.IsNullOrEmpty(wing) || !string.IsNullOrEmpty(flat))
                        {
                            if (!existingByWingFlat.ContainsKey(wingFlatKey))
                                existingByWingFlat[wingFlatKey] = mId;
                        }
                    }
                }

                int totalCount = req.Members.Count;
                int insertedCount = 0;
                int updatedCount = 0;
                int unchangedCount = 0;
                int errorCount = 0;
                var details = new List<object>();
                var seenCodesInBatch = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var skippedMembers = new List<object>();

                using var tx = conn.BeginTransaction();
                try
                {
                    for (int i = 0; i < req.Members.Count; i++)
                    {
                        var item = req.Members[i];
                        int rowNum = i + 1;

                        // Normalize values
                        string memCode = item.MemCode?.Trim() ?? "";
                        string person1 = item.Person1?.Trim() ?? "";
                        string person2 = item.Person2?.Trim() ?? "";
                        string person3 = item.Person3?.Trim() ?? "";
                        string person4 = item.Person4?.Trim() ?? "";
                        string person5 = item.Person5?.Trim() ?? "";
                        string person6 = item.Person6?.Trim() ?? "";
                        string memType = string.IsNullOrWhiteSpace(item.Type) ? "Owner" : item.Type.Trim();
                        string unitType = item.UnitType?.Trim() ?? "";
                        if (string.IsNullOrEmpty(unitType) && !string.IsNullOrEmpty(item.Type))
                        {
                            var tLower = item.Type.Trim().ToLowerInvariant();
                            if (tLower == "flat" || tLower == "shop" || tLower == "office" || tLower == "unit" || tLower == "room" || tLower == "residential" || tLower == "commercial")
                                unitType = item.Type.Trim();
                        }
                        string flatNo  = item.FlatNo?.Trim() ?? "";
                        string wing    = item.Wing?.Trim() ?? "";
                        string floor   = item.Floor?.Trim() ?? "";
                        string flatType = string.IsNullOrWhiteSpace(item.FlatType) ? "Residential" : item.FlatType.Trim();
                        string bldg    = item.Building?.Trim() ?? "";
                        string gstin   = item.GSTIN?.Trim() ?? "";
                        string panNo   = item.PANNo?.Trim() ?? "";
                        decimal areaSqft = item.AreaValue ?? 0;
                        string areaType = string.IsNullOrWhiteSpace(item.AreaType) ? "Carpet" : item.AreaType.Trim();
                        string billType = string.IsNullOrWhiteSpace(item.BillType) ? "Maintenance" : item.BillType.Trim();
                        decimal opPrin  = item.OpPrincipal ?? 0;
                        decimal opInt   = item.OpInterest ?? 0;

                        DateTime? agreeDate = ParseDateSafe(item.AgreementDate);
                        DateTime? regDate   = ParseDateSafe(item.RegistrationDate);
                        DateTime? stampDate = ParseDateSafe(item.StampDate);
                        string agreeRegNo   = item.AgreementRegNo?.Trim() ?? "";
                        decimal agreeVal    = item.AgreementValue ?? 0;
                        decimal stampVal    = item.StampValue ?? 0;
                        decimal regFees     = item.RegistrationFees ?? 0;

                        // Check if row is completely empty
                        if (string.IsNullOrWhiteSpace(memCode) && string.IsNullOrWhiteSpace(person1) &&
                            string.IsNullOrWhiteSpace(flatNo) && string.IsNullOrWhiteSpace(wing))
                        {
                            continue;
                        }

                        // Fallback name if missing
                        if (string.IsNullOrWhiteSpace(person1))
                        {
                            person1 = !string.IsNullOrWhiteSpace(memCode) ? $"Member {memCode}" : $"Member {wing}-{flatNo}";
                        }

                        // Normalize member code
                        if (string.IsNullOrWhiteSpace(memCode))
                        {
                            memCode = !string.IsNullOrWhiteSpace(wing) || !string.IsNullOrWhiteSpace(flatNo)
                                ? $"{wing}-{flatNo}".Trim('-')
                                : $"M-{DateTime.Now.Ticks % 1000000}";
                        }

                        // STRICT DUPLICATE MEMBER CODE CHECK: DO NOT OVERRIDE EXISTING
                        if (existingByCode.ContainsKey(memCode) || seenCodesInBatch.Contains(memCode))
                        {
                            string reason = existingByCode.ContainsKey(memCode)
                                ? $"Member code '{memCode}' already exists in Member Master"
                                : $"Duplicate member code '{memCode}' within the upload file";

                            skippedMembers.Add(new
                            {
                                row = rowNum,
                                memberCode = memCode,
                                memberName = person1,
                                wing = wing,
                                flatNo = flatNo,
                                wingFlat = $"{wing}-{flatNo}".Trim('-'),
                                reason = reason
                            });
                            continue;
                        }

                        seenCodesInBatch.Add(memCode);

                        // INSERT NEW MEMBER
                        using var insCmd = conn.CreateCommand();
                        insCmd.Transaction = tx;
                        insCmd.CommandText = @"
                            INSERT INTO jeevika_erp.SocMember
                                (SocietyId, MemCode, MemName, MemName2, MemName3, MemName4, MemName5, MemName6,
                                 Building, Wing, FlatNo, Floor, UnitType, FlatType, AreaSqft, AreaType, MemberType,
                                 GSTIN, PANNo, DefaultBillType, AgreementDate, RegistrationDate, StampDate,
                                 AgreementRegNo, AgreementValue, StampValue, RegistrationFees,
                                 OpPrincipal, OpInterest, IsDeleted, CreatedAt)
                            VALUES
                                (@sid, @code, @name, @name2, @name3, @name4, @name5, @name6,
                                 @bldg, @wing, @flat, @floor, @unitType, @flatType, @area, @areaType, @memType,
                                 @gstin, @pan, @billType, @agreeDate, @regDate, @stampDate,
                                 @agreeRegNo, @agreeVal, @stampVal, @regFees,
                                 @opPrin, @opInt, FALSE, NOW())
                            RETURNING MemberId";

                        insCmd.Parameters.AddWithValue("@sid", sid);
                        insCmd.Parameters.AddWithValue("@code", memCode);
                        insCmd.Parameters.AddWithValue("@name", person1);
                        insCmd.Parameters.AddWithValue("@name2", (object)person2 ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@name3", (object)person3 ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@name4", (object)person4 ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@name5", (object)person5 ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@name6", (object)person6 ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@bldg", (object)bldg ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@wing", (object)wing ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@flat", (object)flatNo ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@floor", (object)floor ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@unitType", (object)unitType ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@flatType", (object)flatType ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@area", areaSqft);
                        insCmd.Parameters.AddWithValue("@areaType", (object)areaType ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@memType", memType);
                        insCmd.Parameters.AddWithValue("@gstin", (object)gstin ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@pan", (object)panNo ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@billType", billType);
                        insCmd.Parameters.AddWithValue("@agreeDate", agreeDate.HasValue ? (object)agreeDate.Value : DBNull.Value);
                        insCmd.Parameters.AddWithValue("@regDate", regDate.HasValue ? (object)regDate.Value : DBNull.Value);
                        insCmd.Parameters.AddWithValue("@stampDate", stampDate.HasValue ? (object)stampDate.Value : DBNull.Value);
                        insCmd.Parameters.AddWithValue("@agreeRegNo", (object)agreeRegNo ?? DBNull.Value);
                        insCmd.Parameters.AddWithValue("@agreeVal", agreeVal);
                        insCmd.Parameters.AddWithValue("@stampVal", stampVal);
                        insCmd.Parameters.AddWithValue("@regFees", regFees);
                        insCmd.Parameters.AddWithValue("@opPrin", opPrin);
                        insCmd.Parameters.AddWithValue("@opInt", opInt);

                        int newMemId = Convert.ToInt32(insCmd.ExecuteScalar());

                        // Save OpBalances table entry
                        using var opCmd = conn.CreateCommand();
                        opCmd.Transaction = tx;
                        opCmd.CommandText = @"
                            INSERT INTO jeevika_erp.SocMemberOpBalance (SocietyId, MemberId, BillType, OpPrincipal, OpInterest)
                            VALUES (@sid, @mid, @btype, @prin, @int)
                            ON CONFLICT (SocietyId, MemberId, BillType) DO UPDATE SET
                                OpPrincipal = EXCLUDED.OpPrincipal,
                                OpInterest  = EXCLUDED.OpInterest";
                        opCmd.Parameters.AddWithValue("@sid", sid);
                        opCmd.Parameters.AddWithValue("@mid", newMemId);
                        opCmd.Parameters.AddWithValue("@btype", billType);
                        opCmd.Parameters.AddWithValue("@prin", opPrin);
                        opCmd.Parameters.AddWithValue("@int", opInt);
                        opCmd.ExecuteNonQuery();

                        existingByCode[memCode] = newMemId;
                        string wfKey = $"{wing}|{flatNo}".ToLowerInvariant();
                        if (!string.IsNullOrEmpty(wing) || !string.IsNullOrEmpty(flatNo))
                        {
                            existingByWingFlat[wfKey] = newMemId;
                        }

                        insertedCount++;
                        details.Add(new { row = rowNum, action = "INSERTED", memberCode = memCode, memberName = person1, memberId = newMemId });
                    }

                    tx.Commit();
                }
                catch (Exception ex)
                {
                    tx.Rollback();
                    return StatusCode(500, new { success = false, message = "Import failed during transaction: " + ex.Message });
                }

                return Ok(new
                {
                    success = true,
                    message = $"Bulk import completed! Total: {totalCount}, Inserted: {insertedCount}, Skipped (Duplicate Codes): {skippedMembers.Count}",
                    summary = new
                    {
                        total = totalCount,
                        inserted = insertedCount,
                        skipped = skippedMembers.Count,
                        updated = 0,
                        unchanged = 0,
                        errors = errorCount
                    },
                    skippedMembers,
                    details
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }

    public class MemberBillBreakupSaveModel
    {
        public int SocietyId { get; set; }
        public int BillTypeId { get; set; }
        public List<MemberBillBreakupHeadItem> Heads { get; set; } = new();
    }

    public class MemberBillBreakupHeadItem
    {
        public string AccCode { get; set; } = "";
        public decimal Amount { get; set; } = 0;
    }

    public class TransferModel
    {
        public DateTime? TransferDate     { get; set; }
        public string?   TransferType     { get; set; }
        public string?   MeetingType      { get; set; }
        public DateTime? MeetingDate      { get; set; }
        public string?   ResolutionNo     { get; set; }
        public string?   TransferNo       { get; set; }
        public string?   RegNoTransferor  { get; set; }
        public string?   RegNoTransferee  { get; set; }
        public string?   AgreementAssign  { get; set; }
        public string?   TransfereeName   { get; set; }
        public string?   NewPerson2       { get; set; }
        public string?   NewPerson3       { get; set; }
        public string?   NewPerson4       { get; set; }
        public string?   NewPerson5       { get; set; }
        public string?   NewPerson6       { get; set; }
        public string?   NewMobilePhone   { get; set; }
        public string?   NewEmailID       { get; set; }
        public string?   Remarks          { get; set; }
        public DateTime? AgreementDate    { get; set; }
        public DateTime? RegistrationDate { get; set; }
        public DateTime? StampDate        { get; set; }
        public string?   AgreementRegNo   { get; set; }
        public decimal   AgreementValue   { get; set; } = 0;
        public decimal   StampValue       { get; set; } = 0;
        public decimal   RegistrationFees { get; set; } = 0;
    }

    public class BulkReassignModel
    {
        public List<int> MemberIds { get; set; } = new();
        public string?   Group     { get; set; }
        public string?   Wing      { get; set; }
        public string?   Building  { get; set; }
    }

    public class MemberModel
    {
        public int       SocietyId        { get; set; }
        public string    MemCode          { get; set; } = "";
        public string    MemName          { get; set; } = "";
        public string?   MemName2         { get; set; }
        public string?   MemName3         { get; set; }
        public string?   MemName4         { get; set; }
        public string?   MemName5         { get; set; }
        public string?   MemName6         { get; set; }
        public string?   MemMarName       { get; set; }
        public string?   Building         { get; set; }
        public string?   Wing             { get; set; }
        public string?   FlatNo           { get; set; }
        public string?   Floor            { get; set; }
        public string?   UnitType         { get; set; }
        public string?   FlatType         { get; set; }
        public string?   UnitNo           { get; set; }
        public decimal   AreaSqft         { get; set; } = 0;
        public string?   AreaType         { get; set; }
        public string?   AreaCategory     { get; set; }
        public string?   AreaUnit         { get; set; } = "Sq.Ft";
        public string?   ContactNo        { get; set; }
        public string?   Email            { get; set; }
        public string?   PANNo            { get; set; }
        public string?   TANNo            { get; set; }
        public DateTime? EntryDate        { get; set; }
        public string?   MemberType       { get; set; } = "Owner";
        public int       Shares           { get; set; } = 0;
        public string?   NonOccApplicable { get; set; } = "No";
        public string?   NonOccReason     { get; set; }
        public string?   TenantName       { get; set; }
        public string?   TenantContact    { get; set; }
        public string?   ParkingSlot2W    { get; set; }
        public string?   ParkingSlot4W    { get; set; }
        public string?   VehicleNo2W      { get; set; }
        public string?   VehicleNo4W      { get; set; }
        public string?   LienBankName     { get; set; }
        public string?   LienLoanNo       { get; set; }
        public decimal   LienAmount       { get; set; } = 0;
        public string?   LienStatus       { get; set; } = "None";
        public string?   ShareCertNo      { get; set; }
        public string?   FolioNo          { get; set; }
        public int       ShareFromNo      { get; set; } = 0;
        public int       ShareToNo        { get; set; } = 0;
        public string?   NomineeName      { get; set; }
        public string?   NomineeRelation  { get; set; }
        public string?   NomineeAddress   { get; set; }
        public decimal   NomineeSharePct  { get; set; } = 100;
        public string?   IsTransferred    { get; set; } = "No";
        public DateTime? TransferDate     { get; set; }
        public string?   TransferType     { get; set; }
        public string?   TransfereeName   { get; set; }
        public decimal   OpPrincipal      { get; set; } = 0;
        public decimal   OpInterest       { get; set; } = 0;
        public Dictionary<string, MemberOpBalItemDto>? OpBalances { get; set; }
    }

    public class MemberOpBalItemDto
    {
        [System.Text.Json.Serialization.JsonPropertyName("principal")]
        public decimal Principal { get; set; } = 0;

        [System.Text.Json.Serialization.JsonPropertyName("interest")]
        public decimal Interest { get; set; } = 0;
    }

    public class BulkImportRequestDto
    {
        public int SocietyId { get; set; }
        public List<BulkImportMemberItemDto> Members { get; set; } = new();
    }

    public class BulkImportMemberItemDto
    {
        public string? MemCode { get; set; }
        public string? Person1 { get; set; }
        public string? Person2 { get; set; }
        public string? Person3 { get; set; }
        public string? Person4 { get; set; }
        public string? Person5 { get; set; }
        public string? Person6 { get; set; }
        public string? Type { get; set; }
        public string? FlatNo { get; set; }
        public string? Wing { get; set; }
        public string? Floor { get; set; }
        public string? UnitType { get; set; }
        public string? FlatType { get; set; }
        public string? Building { get; set; }
        public string? GSTIN { get; set; }
        public string? PANNo { get; set; }
        public decimal? AreaValue { get; set; }
        public string? AreaType { get; set; }
        public string? BillType { get; set; }
        public decimal? OpPrincipal { get; set; }
        public decimal? OpInterest { get; set; }
        public decimal? TotalBalance { get; set; }
        public string? AgreementDate { get; set; }
        public string? RegistrationDate { get; set; }
        public string? StampDate { get; set; }
        public string? AgreementRegNo { get; set; }
        public decimal? AgreementValue { get; set; }
        public decimal? StampValue { get; set; }
        public decimal? RegistrationFees { get; set; }
    }
}
