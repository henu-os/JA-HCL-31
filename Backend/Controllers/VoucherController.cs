// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — VoucherController
// Handles ALL General Vouchers: Payment, Receipt, Journal, Contra, OtherReceipt
// Tables: SocVoucherHeader & SocVoucherDetail
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/vouchers")]
    [AllowAnonymous]
    public class VoucherController : ControllerBase
    {
        // ── GET /api/vouchers?societyId=X&fyId=Y&type=Payment ────
        [HttpGet]
        public IActionResult GetAll([FromQuery] int societyId, [FromQuery] int fyId = 0, [FromQuery] string? type = null)
        {
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "societyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();

                var sql = @"
                    SELECT VoucherId, SocietyId, FYId, VoucherNo, VoucherType, VoucherDate,
                           CashBankCode, CashBankName, Amount, ChqNo, ChqDate, BankName,
                           PersonName, PersonType, RefNo, Narration, Particular1, Particular2,
                           IsAudited, Status, CreatedBy, CreatedAt
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid AND (@fyid = 0 OR FYId = @fyid) AND IsDeleted = FALSE";

                if (!string.IsNullOrWhiteSpace(type))
                {
                    sql += " AND VoucherType = @type";
                    cmd.Parameters.AddWithValue("@type", type.Trim());
                }

                sql += " ORDER BY VoucherDate DESC, VoucherId DESC";
                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read()) list.Add(MapVoucherHeader(r));

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/vouchers/register?societyId=X&fyId=Y&type=Payment ────
        [HttpGet("register")]
        public IActionResult GetRegister(
            [FromQuery] int societyId,
            [FromQuery] int fyId = 0,
            [FromQuery] string? type = null,
            [FromQuery] string? fromDate = null,
            [FromQuery] string? toDate = null,
            [FromQuery] string? cashBankCode = null)
        {
            if (societyId <= 0) societyId = 1;

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();

                var sql = @"
                    SELECT VoucherId, SocietyId, FYId, VoucherNo, VoucherType, VoucherDate,
                           CashBankCode, CashBankName, Amount, ChqNo, ChqDate, BankName,
                           PersonName, PersonType, RefNo, Narration, Particular1, Particular2,
                           IsAudited, Status, CreatedBy, CreatedAt
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid AND (@fyid = 0 OR FYId = @fyid) AND IsDeleted = FALSE";

                if (!string.IsNullOrWhiteSpace(type))
                {
                    if (type.Equals("Payment", StringComparison.OrdinalIgnoreCase))
                    {
                        sql += " AND VoucherType IN ('Payment', 'PV')";
                    }
                    else if (type.Equals("OtherReceipt", StringComparison.OrdinalIgnoreCase))
                    {
                        sql += " AND VoucherType IN ('OtherReceipt', 'ORV')";
                    }
                    else if (type.Equals("Contra", StringComparison.OrdinalIgnoreCase))
                    {
                        sql += " AND VoucherType IN ('Contra', 'CV')";
                    }
                    else
                    {
                        sql += " AND VoucherType = @type";
                        cmd.Parameters.AddWithValue("@type", type.Trim());
                    }
                }

                if (!string.IsNullOrWhiteSpace(fromDate) && DateTime.TryParse(fromDate, out var dtFrom))
                {
                    sql += " AND VoucherDate >= @fromDate";
                    cmd.Parameters.AddWithValue("@fromDate", dtFrom.Date);
                }

                if (!string.IsNullOrWhiteSpace(toDate) && DateTime.TryParse(toDate, out var dtTo))
                {
                    sql += " AND VoucherDate <= @toDate";
                    cmd.Parameters.AddWithValue("@toDate", dtTo.Date);
                }

                if (!string.IsNullOrWhiteSpace(cashBankCode) && !cashBankCode.Equals("all", StringComparison.OrdinalIgnoreCase))
                {
                    sql += @" AND (
                        CashBankCode = @cbCode 
                        OR CashBankName ILIKE @cbCodeLike 
                        OR EXISTS (
                            SELECT 1 FROM jeevika_erp.SocVoucherDetail d 
                            WHERE d.VoucherId = jeevika_erp.SocVoucherHeader.VoucherId 
                              AND (d.AccountCode = @cbCode OR d.AccountName ILIKE @cbCodeLike)
                        )
                    )";
                    cmd.Parameters.AddWithValue("@cbCode", cashBankCode.Trim());
                    cmd.Parameters.AddWithValue("@cbCodeLike", "%" + cashBankCode.Trim() + "%");
                }

                sql += " ORDER BY VoucherDate ASC, VoucherId ASC";
                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var headers = new List<Dictionary<string, object?>>();
                var voucherIds = new List<int>();

                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        int vid = Convert.ToInt32(r["VoucherId"]);
                        voucherIds.Add(vid);

                        var row = new Dictionary<string, object?>
                        {
                            ["voucherId"]    = vid,
                            ["societyId"]    = Convert.ToInt32(r["SocietyId"]),
                            ["fyId"]         = Convert.ToInt32(r["FYId"]),
                            ["voucherNo"]    = r["VoucherNo"]?.ToString() ?? "",
                            ["voucherType"]  = r["VoucherType"]?.ToString() ?? "",
                            ["voucherDate"]  = r["VoucherDate"] == DBNull.Value ? "" : ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                            ["cashBankCode"] = r["CashBankCode"]?.ToString() ?? "",
                            ["cashBankName"] = r["CashBankName"]?.ToString() ?? "",
                            ["amount"]       = Convert.ToDecimal(r["Amount"]),
                            ["chqNo"]        = r["ChqNo"]?.ToString() ?? "",
                            ["chqDate"]      = r["ChqDate"] == DBNull.Value ? null : ((DateTime)r["ChqDate"]).ToString("yyyy-MM-dd"),
                            ["bankName"]     = r["BankName"]?.ToString() ?? "",
                            ["personName"]   = r["PersonName"]?.ToString() ?? "",
                            ["personType"]   = r["PersonType"]?.ToString() ?? "",
                            ["refNo"]        = r["RefNo"]?.ToString() ?? "",
                            ["narration"]    = r["Narration"]?.ToString() ?? "",
                            ["particular1"]  = r["Particular1"]?.ToString() ?? "",
                            ["particular2"]  = r["Particular2"]?.ToString() ?? "",
                            ["isAudited"]    = r["IsAudited"] != DBNull.Value && Convert.ToBoolean(r["IsAudited"]),
                            ["status"]       = r["Status"]?.ToString() ?? "Posted"
                        };
                        headers.Add(row);
                    }
                }

                // Batch fetch line item splits
                var detailsMap = new Dictionary<int, List<object>>();
                if (voucherIds.Count > 0)
                {
                    using var cmdD = conn.CreateCommand();
                    var idList = string.Join(",", voucherIds);
                    cmdD.CommandText = $@"
                        SELECT DetailId, VoucherId, SrNo, AccountId, AccountCode, AccountName,
                               Debit, Credit, Narration
                        FROM jeevika_erp.SocVoucherDetail
                        WHERE VoucherId IN ({idList})
                        ORDER BY VoucherId ASC, SrNo ASC";

                    using var rD = cmdD.ExecuteReader();
                    while (rD.Read())
                    {
                        int vid = Convert.ToInt32(rD["VoucherId"]);
                        if (!detailsMap.ContainsKey(vid)) detailsMap[vid] = new List<object>();

                        detailsMap[vid].Add(new
                        {
                            detailId    = Convert.ToInt32(rD["DetailId"]),
                            voucherId   = vid,
                            srNo        = Convert.ToInt32(rD["SrNo"]),
                            accountId   = rD["AccountId"] == DBNull.Value ? (int?)null : Convert.ToInt32(rD["AccountId"]),
                            accountCode = rD["AccountCode"]?.ToString() ?? "",
                            accountName = rD["AccountName"]?.ToString() ?? "",
                            debit       = Convert.ToDecimal(rD["Debit"]),
                            credit      = Convert.ToDecimal(rD["Credit"]),
                            narration   = rD["Narration"]?.ToString() ?? ""
                        });
                    }
                }

                var list = new List<object>();
                decimal totalAmount = 0;
                decimal bankAmount = 0;
                decimal cashAmount = 0;

                foreach (var h in headers)
                {
                    int vid = (int)h["voucherId"]!;
                    var items = detailsMap.ContainsKey(vid) ? detailsMap[vid] : new List<object>();
                    decimal amt = (decimal)h["amount"]!;
                    totalAmount += amt;

                    string cbName = (h["cashBankName"]?.ToString() ?? "").ToLower();
                    if (cbName.Contains("cash"))
                        cashAmount += amt;
                    else
                        bankAmount += amt;

                    h["items"] = items;
                    list.Add(h);
                }

                return Ok(new
                {
                    success = true,
                    data = list,
                    count = list.Count,
                    summary = new
                    {
                        totalVouchers = list.Count,
                        totalAmount   = totalAmount,
                        bankAmount    = bankAmount,
                        cashAmount    = cashAmount
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/vouchers/{id} (Header + Line Items) ───────
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                // 1. Fetch Header
                using var cmdH = conn.CreateCommand();
                cmdH.CommandText = @"
                    SELECT * FROM jeevika_erp.SocVoucherHeader
                    WHERE VoucherId = @id AND IsDeleted = FALSE LIMIT 1";
                cmdH.Parameters.AddWithValue("@id", id);

                using var rH = cmdH.ExecuteReader();
                if (!rH.Read())
                    return NotFound(new { success = false, message = "Voucher not found." });

                var header = MapVoucherHeader(rH);
                rH.Close();

                // 2. Fetch Line Items
                using var cmdD = conn.CreateCommand();
                cmdD.CommandText = @"
                    SELECT DetailId, VoucherId, SrNo, AccountId, AccountCode, AccountName,
                           Debit, Credit, Narration
                    FROM jeevika_erp.SocVoucherDetail
                    WHERE VoucherId = @id
                    ORDER BY SrNo";
                cmdD.Parameters.AddWithValue("@id", id);

                var items = new List<object>();
                using var rD = cmdD.ExecuteReader();
                while (rD.Read())
                {
                    items.Add(new
                    {
                        detailId    = Convert.ToInt32(rD["DetailId"]),
                        voucherId   = Convert.ToInt32(rD["VoucherId"]),
                        srNo        = Convert.ToInt32(rD["SrNo"]),
                        accountId   = rD["AccountId"] == DBNull.Value ? (int?)null : Convert.ToInt32(rD["AccountId"]),
                        accountCode = rD["AccountCode"]?.ToString() ?? "",
                        accountName = rD["AccountName"]?.ToString() ?? "",
                        debit       = Convert.ToDecimal(rD["Debit"]),
                        credit      = Convert.ToDecimal(rD["Credit"]),
                        narration   = rD["Narration"]?.ToString() ?? ""
                    });
                }

                return Ok(new { success = true, data = header, items });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/vouchers/next-no?societyId=X&fyId=Y&type=Payment&prefix=JV&fyLabel=2026-27
        [HttpGet("next-no")]
        public IActionResult GetNextVoucherNo([FromQuery] int societyId, [FromQuery] int fyId = 0, [FromQuery] string type = "Payment", [FromQuery] string? prefix = null, [FromQuery] string? fyLabel = null)
        {
            if (societyId <= 0 || string.IsNullOrWhiteSpace(type))
                return BadRequest(new { success = false, message = "societyId and type are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                var typeClean = type.Trim();
                var voucherTypes = new List<string> { typeClean };
                if (typeClean.Equals("MemberReceipt", StringComparison.OrdinalIgnoreCase) || typeClean.Equals("Receipt", StringComparison.OrdinalIgnoreCase))
                {
                    voucherTypes.Add("MemberReceipt");
                    voucherTypes.Add("Receipt");
                }
                else if (typeClean.Equals("MemberDebitNote", StringComparison.OrdinalIgnoreCase) || typeClean.Equals("DebitNote", StringComparison.OrdinalIgnoreCase) || typeClean.Equals("Debit", StringComparison.OrdinalIgnoreCase))
                {
                    voucherTypes.Add("MemberDebitNote");
                    voucherTypes.Add("DebitNote");
                }
                else if (typeClean.Equals("MemberCreditNote", StringComparison.OrdinalIgnoreCase) || typeClean.Equals("CreditNote", StringComparison.OrdinalIgnoreCase) || typeClean.Equals("Credit", StringComparison.OrdinalIgnoreCase))
                {
                    voucherTypes.Add("MemberCreditNote");
                    voucherTypes.Add("CreditNote");
                }
                else if (typeClean.Equals("ReceiptReversal", StringComparison.OrdinalIgnoreCase) || typeClean.Equals("MemberReceiptReversal", StringComparison.OrdinalIgnoreCase) || typeClean.Equals("Reversal", StringComparison.OrdinalIgnoreCase))
                {
                    voucherTypes.Add("ReceiptReversal");
                    voucherTypes.Add("MemberReceiptReversal");
                }

                voucherTypes = voucherTypes.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                var inClause = string.Join(",", voucherTypes.Select((_, i) => $"@vt{i}"));

                cmd.CommandText = $@"
                    SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader
                    WHERE SocietyId = @sid AND (@fyid = 0 OR FYId = @fyid) AND VoucherType IN ({inClause}) AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);
                for (int i = 0; i < voucherTypes.Count; i++)
                {
                    cmd.Parameters.AddWithValue($"@vt{i}", voucherTypes[i]);
                }

                var prefixes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    { "Payment", "PYMT" },
                    { "Receipt", "MRV" },
                    { "MemberReceipt", "MRV" },
                    { "Journal", "JV" },
                    { "Contra", "CV" },
                    { "OtherReceipt", "ORV" },
                    { "PurchaseOrder", "PO" },
                    { "MemberDebitNote", "MDN" },
                    { "MemberCreditNote", "MCN" },
                    { "MemberBill", "MBIL" },
                    { "BillTypeTransfer", "MTT-B" },
                    { "ReceiptReversal", "MRV-R" }
                };

                string actualPrefix = !string.IsNullOrWhiteSpace(prefix) 
                    ? prefix.Trim().ToUpper() 
                    : (prefixes.ContainsKey(type) ? prefixes[type] : type.ToUpper());

                string actualFy = !string.IsNullOrWhiteSpace(fyLabel) ? fyLabel.Trim() : "2025-26";

                int maxSeq = 0;
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var vNo = r["VoucherNo"]?.ToString() ?? "";
                        if (string.IsNullOrWhiteSpace(vNo)) continue;

                        var match = System.Text.RegularExpressions.Regex.Match(vNo, @"(\d+)$");
                        if (match.Success && int.TryParse(match.Groups[1].Value, out int seq))
                        {
                            if (seq > maxSeq) maxSeq = seq;
                        }
                    }
                }

                int nextSeq = maxSeq + 1;
                string nextVoucherNo = $"{actualPrefix}/{actualFy}/{nextSeq:D2}";

                return Ok(new { success = true, nextVoucherNo, nextSeq, prefix = actualPrefix, fyLabel = actualFy });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── PUT /api/vouchers/{id} (Update Header + Line Items) ─────
        [HttpPut("{id:int}")]
        public IActionResult UpdateVoucher(int id, [FromBody] VoucherFullModel model)
        {
            model.VoucherId = id;
            return SaveVoucher(model);
        }

        // ── POST /api/vouchers (Create or Update Header + Line Items) ─────
        [HttpPost]
        public IActionResult SaveVoucher([FromBody] VoucherFullModel model)
        {
            if (model.SocietyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            if (model.FYId <= 0)
            {
                using var connFy = DbHelper.GetConn();
                using var cmdFy = connFy.CreateCommand();
                cmdFy.CommandText = "SELECT FYId FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid AND IsActive = TRUE LIMIT 1";
                cmdFy.Parameters.AddWithValue("@sid", model.SocietyId);
                var resolvedFy = cmdFy.ExecuteScalar();
                if (resolvedFy != null && resolvedFy != DBNull.Value)
                    model.FYId = Convert.ToInt32(resolvedFy);
            }
            if (string.IsNullOrWhiteSpace(model.VoucherType)) model.VoucherType = "PurchaseOrder";

            if (model.Items == null || model.Items.Count == 0)
            {
                return BadRequest(new { success = false, message = "Voucher must have at least one valid line item." });
            }

            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();

                // 1. Check existing voucherId or check if VoucherNo already exists for this society & FY
                int existingId = model.VoucherId;
                if (existingId <= 0 && !string.IsNullOrWhiteSpace(model.VoucherNo))
                {
                    using var checkCmd = conn.CreateCommand();
                    checkCmd.Transaction = tx;
                    checkCmd.CommandText = @"
                        SELECT VoucherId FROM jeevika_erp.SocVoucherHeader
                        WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = FALSE
                        LIMIT 1";
                    checkCmd.Parameters.AddWithValue("@sid", model.SocietyId);
                    checkCmd.Parameters.AddWithValue("@fyid", model.FYId);
                    checkCmd.Parameters.AddWithValue("@vno", model.VoucherNo.Trim());

                    var foundObj = checkCmd.ExecuteScalar();
                    if (foundObj != null && foundObj != DBNull.Value)
                    {
                        existingId = Convert.ToInt32(foundObj);
                    }
                }

                // If updating an existing voucher, strictly lock and preserve original VoucherNo (IMMUTABLE)
                if (existingId > 0)
                {
                    using var origCmd = conn.CreateCommand();
                    origCmd.Transaction = tx;
                    origCmd.CommandText = "SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader WHERE VoucherId = @vid";
                    origCmd.Parameters.AddWithValue("@vid", existingId);
                    var vObj = origCmd.ExecuteScalar();
                    if (vObj != null && vObj != DBNull.Value && !string.IsNullOrWhiteSpace(vObj.ToString()))
                    {
                        model.VoucherNo = vObj.ToString()!.Trim(); // IMMUTABLE
                    }
                }

                // Auto-generate voucher number monotonically if empty
                if (string.IsNullOrWhiteSpace(model.VoucherNo))
                {
                    using var seqCmd = conn.CreateCommand();
                    seqCmd.Transaction = tx;
                    seqCmd.CommandText = @"
                        SELECT VoucherNo FROM jeevika_erp.SocVoucherHeader
                        WHERE SocietyId = @sid AND FYId = @fyid AND VoucherType = @type";
                    seqCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                    seqCmd.Parameters.AddWithValue("@fyid", model.FYId);
                    seqCmd.Parameters.AddWithValue("@type", model.VoucherType.Trim());

                    int maxSeq = 0;
                    using (var reader = seqCmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var v = reader.GetString(0);
                            if (string.IsNullOrWhiteSpace(v)) continue;
                            var match = System.Text.RegularExpressions.Regex.Match(v, @"(\d+)$");
                            if (match.Success && int.TryParse(match.Groups[1].Value, out int s))
                            {
                                if (s > maxSeq) maxSeq = s;
                            }
                        }
                    }

                    var prefixes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        { "Payment", "PYMT/2025-26/" }, { "Receipt", "MRV/2025-26/" }, { "MemberReceipt", "MRV/2025-26/" },
                        { "Journal", "JV/2025-26/" }, { "Contra", "CV/2025-26/" }, { "OtherReceipt", "ORV/2025-26/" },
                        { "PurchaseOrder", "PO/2025-26/" }, { "MemberBill", "MBIL/2025-26/" }
                    };
                    var pfx = prefixes.ContainsKey(model.VoucherType) ? prefixes[model.VoucherType] : "V/2025-26/";
                    model.VoucherNo = $"{pfx}{(maxSeq + 1):D2}";
                }

            // Strict double-entry validation
            decimal totalDebit = Math.Round(model.Items.Sum(i => i.Debit), 2);
            decimal totalCredit = Math.Round(model.Items.Sum(i => i.Credit), 2);

            if (Math.Abs(totalDebit - totalCredit) > 0.01m)
            {
                return BadRequest(new 
                { 
                    success = false, 
                    message = $"Double-entry validation failed: Total Debit (₹{totalDebit:N2}) does not match Total Credit (₹{totalCredit:N2}). Difference: ₹{Math.Abs(totalDebit - totalCredit):N2}." 
                });
            }

            // Transaction amount is the balanced single side
            decimal totalAmount = totalDebit;
            int targetVoucherId = existingId;

                if (existingId > 0)
                {
                    // Update Header (preserving VoucherNo)
                    using var cmdU = conn.CreateCommand();
                    cmdU.Transaction = tx;
                    cmdU.CommandText = @"
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET VoucherNo = @vno,
                            VoucherType = @type,
                            VoucherDate = @vdate,
                            CashBankCode = @cbCode,
                            CashBankName = @cbName,
                            Amount = @amt,
                            ChqNo = @chqNo,
                            ChqDate = @chqDate,
                            BankName = @bank,
                            PersonName = @person,
                            PersonType = @pType,
                            RefNo = @refNo,
                            Narration = @narr,
                            Particular1 = @p1,
                            Particular2 = @p2,
                            UpdatedAt = NOW()
                        WHERE VoucherId = @vid";

                    cmdU.Parameters.AddWithValue("@vid",    existingId);
                    cmdU.Parameters.AddWithValue("@vno",    model.VoucherNo.Trim());
                    cmdU.Parameters.AddWithValue("@type",   model.VoucherType.Trim());
                    cmdU.Parameters.AddWithValue("@vdate",  model.VoucherDate);
                    cmdU.Parameters.AddWithValue("@cbCode", (object?)model.CashBankCode ?? DBNull.Value);
                    cmdU.Parameters.AddWithValue("@cbName", (object?)model.CashBankName ?? DBNull.Value);
                    cmdU.Parameters.AddWithValue("@amt",    totalAmount);
                    cmdU.Parameters.AddWithValue("@chqNo",  (object?)model.ChqNo        ?? DBNull.Value);
                    cmdU.Parameters.AddWithValue("@chqDate",model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                    cmdU.Parameters.AddWithValue("@bank",   (object?)model.BankName     ?? DBNull.Value);
                    cmdU.Parameters.AddWithValue("@person", (object?)model.PersonName   ?? DBNull.Value);
                    cmdU.Parameters.AddWithValue("@pType",  (object?)model.PersonType   ?? DBNull.Value);
                    cmdU.Parameters.AddWithValue("@refNo",  (object?)model.RefNo        ?? DBNull.Value);
                    cmdU.Parameters.AddWithValue("@narr",   (object?)model.Narration    ?? DBNull.Value);
                    cmdU.Parameters.AddWithValue("@p1",     (object?)model.Particular1  ?? DBNull.Value);
                    cmdU.Parameters.AddWithValue("@p2",     (object?)model.Particular2  ?? DBNull.Value);

                    cmdU.ExecuteNonQuery();

                    // Clear old details atomically
                    using var cmdDelD = conn.CreateCommand();
                    cmdDelD.Transaction = tx;
                    cmdDelD.CommandText = "DELETE FROM jeevika_erp.SocVoucherDetail WHERE VoucherId = @vid";
                    cmdDelD.Parameters.AddWithValue("@vid", existingId);
                    cmdDelD.ExecuteNonQuery();
                }
                else
                {
                    // Clean up any soft-deleted voucher with same number to prevent unique constraint violation
                    using var cleanCmd = conn.CreateCommand();
                    cleanCmd.Transaction = tx;
                    cleanCmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail
                        WHERE VoucherId IN (SELECT VoucherId FROM jeevika_erp.SocVoucherHeader WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE);
                        DELETE FROM jeevika_erp.SocVoucherHeader
                        WHERE SocietyId = @sid AND FYId = @fyid AND VoucherNo = @vno AND IsDeleted = TRUE;";
                    cleanCmd.Parameters.AddWithValue("@sid",  model.SocietyId);
                    cleanCmd.Parameters.AddWithValue("@fyid", model.FYId);
                    cleanCmd.Parameters.AddWithValue("@vno",  model.VoucherNo.Trim());
                    cleanCmd.ExecuteNonQuery();

                    // Insert Header
                    using var cmdH = conn.CreateCommand();
                    cmdH.Transaction = tx;
                    cmdH.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherHeader
                            (SocietyId, FYId, VoucherNo, VoucherType, VoucherDate, CashBankCode, CashBankName,
                             Amount, ChqNo, ChqDate, BankName, PersonName, PersonType, RefNo, Narration,
                             Particular1, Particular2, Status, IsDeleted, CreatedBy, CreatedAt, UpdatedAt)
                        VALUES
                            (@sid, @fyid, @vno, @type, @vdate, @cbCode, @cbName,
                             @amt, @chqNo, @chqDate, @bank, @person, @pType, @refNo, @narr,
                             @p1, @p2, 'Posted', FALSE, @user, NOW(), NOW())
                        RETURNING VoucherId";

                    cmdH.Parameters.AddWithValue("@sid",    model.SocietyId);
                    cmdH.Parameters.AddWithValue("@fyid",   model.FYId);
                    cmdH.Parameters.AddWithValue("@vno",    model.VoucherNo.Trim());
                    cmdH.Parameters.AddWithValue("@type",   model.VoucherType.Trim());
                    cmdH.Parameters.AddWithValue("@vdate",  model.VoucherDate);
                    cmdH.Parameters.AddWithValue("@cbCode", (object?)model.CashBankCode ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@cbName", (object?)model.CashBankName ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@amt",    totalAmount);
                    cmdH.Parameters.AddWithValue("@chqNo",  (object?)model.ChqNo        ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@chqDate",model.ChqDate.HasValue ? model.ChqDate.Value : DBNull.Value);
                    cmdH.Parameters.AddWithValue("@bank",   (object?)model.BankName     ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@person", (object?)model.PersonName   ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@pType",  (object?)model.PersonType   ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@refNo",  (object?)model.RefNo        ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@narr",   (object?)model.Narration    ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@p1",     (object?)model.Particular1  ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@p2",     (object?)model.Particular2  ?? DBNull.Value);
                    cmdH.Parameters.AddWithValue("@user",   User.Identity?.Name ?? "ADMIN");

                    targetVoucherId = Convert.ToInt32(cmdH.ExecuteScalar());
                }

                // Insert Line Items
                int srNo = 1;
                foreach (var item in model.Items)
                {
                    // Resolve AccountId safely against SocAccount to avoid FK constraint errors
                    int? resolvedAccId = null;
                    if (item.AccountId.HasValue && item.AccountId.Value > 0)
                    {
                        using var chkAcc = conn.CreateCommand();
                        chkAcc.Transaction = tx;
                        chkAcc.CommandText = "SELECT AccountId FROM jeevika_erp.SocAccount WHERE AccountId = @aid AND SocietyId = @sid LIMIT 1";
                        chkAcc.Parameters.AddWithValue("@aid", item.AccountId.Value);
                        chkAcc.Parameters.AddWithValue("@sid", model.SocietyId);
                        var found = chkAcc.ExecuteScalar();
                        if (found != null && found != DBNull.Value)
                        {
                            resolvedAccId = Convert.ToInt32(found);
                        }
                    }

                    if (!resolvedAccId.HasValue && (!string.IsNullOrWhiteSpace(item.AccountCode) || !string.IsNullOrWhiteSpace(item.AccountName)))
                    {
                        using var findAcc = conn.CreateCommand();
                        findAcc.Transaction = tx;
                        findAcc.CommandText = @"
                            SELECT AccountId FROM jeevika_erp.SocAccount
                            WHERE SocietyId = @sid AND (
                                (LENGTH(@code) > 0 AND LOWER(AccCode) = LOWER(@code)) OR
                                (LENGTH(@name) > 0 AND LOWER(AccName) = LOWER(@name))
                            ) LIMIT 1";
                        findAcc.Parameters.AddWithValue("@sid",  model.SocietyId);
                        findAcc.Parameters.AddWithValue("@code", item.AccountCode ?? "");
                        findAcc.Parameters.AddWithValue("@name", item.AccountName ?? "");
                        var found = findAcc.ExecuteScalar();
                        if (found != null && found != DBNull.Value)
                        {
                            resolvedAccId = Convert.ToInt32(found);
                        }
                    }

                    using var cmdD = conn.CreateCommand();
                    cmdD.Transaction = tx;
                    cmdD.CommandText = @"
                        INSERT INTO jeevika_erp.SocVoucherDetail
                            (VoucherId, SrNo, AccountId, AccountCode, AccountName, Debit, Credit, Narration)
                        VALUES
                            (@vid, @sr, @accId, @accCode, @accName, @dr, @cr, @narr)";

                    cmdD.Parameters.AddWithValue("@vid",     targetVoucherId);
                    cmdD.Parameters.AddWithValue("@sr",      srNo++);
                    cmdD.Parameters.AddWithValue("@accId",   (object?)resolvedAccId    ?? DBNull.Value);
                    cmdD.Parameters.AddWithValue("@accCode", (object?)item.AccountCode ?? DBNull.Value);
                    cmdD.Parameters.AddWithValue("@accName", (object?)item.AccountName ?? DBNull.Value);
                    cmdD.Parameters.AddWithValue("@dr",      item.Debit);
                    cmdD.Parameters.AddWithValue("@cr",      item.Credit);
                    cmdD.Parameters.AddWithValue("@narr",    (object?)item.Narration   ?? DBNull.Value);

                    cmdD.ExecuteNonQuery();
                }

                tx.Commit();
                return Ok(new
                {
                    success = true,
                    message = "Voucher saved successfully.",
                    voucherId = targetVoucherId,
                    voucherNo = model.VoucherNo
                });
            }
            catch (PostgresException ex) when (ex.SqlState == "23505")
            {
                return Conflict(new { success = false, message = $"Voucher number '{model.VoucherNo}' already exists." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/vouchers/multi-change (Batch update multiple vouchers by ID or Range) ─────
        [HttpPost("multi-change")]
        public IActionResult MultiChange([FromBody] MultiChangeModel model)
        {
            if ((model.VoucherIds == null || model.VoucherIds.Count == 0) &&
                (string.IsNullOrWhiteSpace(model.FromVoucherNo) || string.IsNullOrWhiteSpace(model.ToVoucherNo)))
            {
                return BadRequest(new { success = false, message = "Selected voucher IDs or Voucher Range required." });
            }

            if (string.IsNullOrWhiteSpace(model.Field))
                return BadRequest(new { success = false, message = "Field to change is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();

                string setClause = "";
                var f = model.Field.ToLower();
                if (f == "transtype" || f == "vouchertype")
                {
                    setClause = "VoucherType = @val";
                }
                else if (f == "cashbank" || f == "cashbankname")
                {
                    setClause = "CashBankName = @val";
                }
                else if (f == "voucherdate" || f == "date")
                {
                    if (DateTime.TryParse(model.NewValue, out var parsedDate))
                    {
                        setClause = "VoucherDate = @dateVal";
                        cmd.Parameters.AddWithValue("@dateVal", parsedDate);
                    }
                    else
                    {
                        setClause = "VoucherDate = @val";
                    }
                }
                else if (f == "particular1" || f == "narration")
                {
                    setClause = "Particular1 = @val, Narration = @val";
                }
                else if (f == "particular2")
                {
                    setClause = "Particular2 = @val";
                }
                else if (f == "status")
                {
                    setClause = "Status = @val";
                }
                else if (f == "personname" || f == "vendorname")
                {
                    setClause = "PersonName = @val";
                }
                else
                {
                    setClause = "Particular1 = @val";
                }

                cmd.Parameters.AddWithValue("@val", (object?)model.NewValue ?? "");
                cmd.Parameters.AddWithValue("@sid", model.SocietyId > 0 ? model.SocietyId : 1);
                cmd.Parameters.AddWithValue("@fyid", model.FYId > 0 ? model.FYId : 1);

                string whereClause = "SocietyId = @sid AND FYId = @fyid AND IsDeleted = FALSE";
                if (model.VoucherIds != null && model.VoucherIds.Count > 0)
                {
                    whereClause += " AND VoucherId = ANY(@ids)";
                    cmd.Parameters.AddWithValue("@ids", model.VoucherIds.ToArray());
                }
                else
                {
                    whereClause += " AND VoucherNo >= @fromNo AND VoucherNo <= @toNo";
                    cmd.Parameters.AddWithValue("@fromNo", model.FromVoucherNo?.Trim() ?? "");
                    cmd.Parameters.AddWithValue("@toNo", model.ToVoucherNo?.Trim() ?? "");
                }

                cmd.CommandText = $"UPDATE jeevika_erp.SocVoucherHeader SET {setClause}, UpdatedAt = NOW() WHERE {whereClause}";
                int rows = cmd.ExecuteNonQuery();

                return Ok(new { success = true, updatedCount = rows, message = $"{rows} voucher(s) updated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/vouchers/{*id} ───────────────────────────
        [HttpDelete("{*id}")]
        public IActionResult Delete(string id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var tx   = conn.BeginTransaction();
                using var cmd  = conn.CreateCommand();
                cmd.Transaction = tx;

                if (int.TryParse(id, out int numId))
                {
                    cmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail 
                        WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader 
                            WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE
                        );
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET IsDeleted = TRUE, UpdatedAt = NOW()
                        WHERE (VoucherId = @numId OR VoucherNo = @id) AND IsDeleted = FALSE;";
                    cmd.Parameters.AddWithValue("@numId", numId);
                    cmd.Parameters.AddWithValue("@id", id);
                }
                else
                {
                    cmd.CommandText = @"
                        DELETE FROM jeevika_erp.SocVoucherDetail 
                        WHERE VoucherId IN (
                            SELECT VoucherId FROM jeevika_erp.SocVoucherHeader 
                            WHERE VoucherNo = @id AND IsDeleted = FALSE
                        );
                        UPDATE jeevika_erp.SocVoucherHeader
                        SET IsDeleted = TRUE, UpdatedAt = NOW()
                        WHERE VoucherNo = @id AND IsDeleted = FALSE;";
                    cmd.Parameters.AddWithValue("@id", id);
                }

                int affected = cmd.ExecuteNonQuery();
                tx.Commit();
                return Ok(new { success = true, message = "Voucher and details deleted successfully.", affected });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── Helper: Map Header Reader ───────────────────────────
        private static object MapVoucherHeader(NpgsqlDataReader r)
        {
            T? Get<T>(string col)
            {
                try { var v = r[col]; return v == DBNull.Value ? default : (T)Convert.ChangeType(v, typeof(T)); }
                catch { return default; }
            }
            string S(string col) => r[col]?.ToString() ?? "";

            return new
            {
                voucherId    = Get<int>("VoucherId"),
                societyId    = Get<int>("SocietyId"),
                fyId         = Get<int>("FYId"),
                voucherNo    = S("VoucherNo"),
                voucherType  = S("VoucherType"),
                voucherDate  = r["VoucherDate"] == DBNull.Value ? "" : ((DateTime)r["VoucherDate"]).ToString("yyyy-MM-dd"),
                cashBankCode = S("CashBankCode"),
                cashBankName = S("CashBankName"),
                amount       = Get<decimal>("Amount"),
                chqNo        = S("ChqNo"),
                chqDate      = r["ChqDate"] == DBNull.Value ? null : ((DateTime)r["ChqDate"]).ToString("yyyy-MM-dd"),
                bankName     = S("BankName"),
                personName   = S("PersonName"),
                personType   = S("PersonType"),
                refNo        = S("RefNo"),
                narration    = S("Narration"),
                particular1  = S("Particular1"),
                particular2  = S("Particular2"),
                isAudited    = Get<bool>("IsAudited"),
                status       = S("Status"),
                createdBy    = S("CreatedBy"),
                createdAt    = Get<DateTime>("CreatedAt")
            };
        }
    }

    // ── Models ────────────────────────────────────────────────
    public class VoucherItemModel
    {
        public int?    AccountId   { get; set; }
        public string? AccountCode { get; set; }
        public string? AccountName { get; set; }
        public decimal Debit       { get; set; } = 0;
        public decimal Credit      { get; set; } = 0;
        public decimal Amount      { get; set; } = 0;
        public string? Narration   { get; set; }
    }

    public class VoucherFullModel
    {
        public int       VoucherId    { get; set; } = 0;
        public int       SocietyId    { get; set; }
        public int       FYId         { get; set; }
        public string?   VoucherNo    { get; set; }
        public string    VoucherType  { get; set; } = "Journal";
        public DateTime  VoucherDate  { get; set; } = DateTime.Today;
        public string?   CashBankCode { get; set; }
        public string?   CashBankName { get; set; }
        public string?   ChqNo        { get; set; }
        public DateTime? ChqDate      { get; set; }
        public string?   BankName     { get; set; }
        public string?   PersonName   { get; set; }
        public string?   PersonType   { get; set; }
        public decimal   Amount       { get; set; } = 0;
        public string?   RefNo        { get; set; }
        public string?   Narration    { get; set; }
        public string?   Particular1  { get; set; }
        public string?   Particular2  { get; set; }
        public List<VoucherItemModel> Items { get; set; } = new();
    }

    public class MultiChangeModel
    {
        public int           SocietyId     { get; set; }
        public int           FYId          { get; set; }
        public List<int>?    VoucherIds    { get; set; }
        public string?       FromVoucherNo { get; set; }
        public string?       ToVoucherNo   { get; set; }
        public string        Field         { get; set; } = "";
        public string?       NewValue      { get; set; }
    }
}
