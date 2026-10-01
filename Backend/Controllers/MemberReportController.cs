// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MemberReportController
// Handles Member Account Ledger (Head-Wise Pivot) and Member Register [Dr/Cr]
// 100% Dynamic DB Driven — Zero Hardcoding
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Serialization;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/reports")]
    [AllowAnonymous]
    public class MemberReportController : ControllerBase
    {
        // ── Data Transfer Objects ──────────────────────────────────
        public class DynamicColumnDto
        {
            [JsonPropertyName("headId")]
            public int HeadId { get; set; }

            [JsonPropertyName("headCode")]
            public string HeadCode { get; set; } = "";

            [JsonPropertyName("headName")]
            public string HeadName { get; set; } = "";
        }

        public class MemberInfoDto
        {
            [JsonPropertyName("memberId")]
            public int MemberId { get; set; }

            [JsonPropertyName("memberCode")]
            public string MemberCode { get; set; } = "";

            [JsonPropertyName("memberName")]
            public string MemberName { get; set; } = "";

            [JsonPropertyName("wing")]
            public string Wing { get; set; } = "";

            [JsonPropertyName("flatNo")]
            public string FlatNo { get; set; } = "";

            [JsonPropertyName("contactNo")]
            public string ContactNo { get; set; } = "";

            [JsonPropertyName("building")]
            public string Building { get; set; } = "";

            [JsonPropertyName("areaSqFt")]
            public decimal AreaSqFt { get; set; }
        }

        public class OpeningBalanceDto
        {
            [JsonPropertyName("headWise")]
            public Dictionary<string, decimal> HeadWise { get; set; } = new();

            [JsonPropertyName("principal")]
            public decimal Principal { get; set; }

            [JsonPropertyName("interest")]
            public decimal Interest { get; set; }

            [JsonPropertyName("totalOpening")]
            public decimal TotalOpening { get; set; }
        }

        public class TransactionDto
        {
            [JsonPropertyName("voucherDate")]
            public string VoucherDate { get; set; } = "";

            [JsonPropertyName("voucherNo")]
            public string VoucherNo { get; set; } = "";

            [JsonPropertyName("period")]
            public string Period { get; set; } = "";

            [JsonPropertyName("voucherType")]
            public string VoucherType { get; set; } = "";

            [JsonPropertyName("headAmounts")]
            public Dictionary<string, decimal> HeadAmounts { get; set; } = new();

            [JsonPropertyName("principalAmount")]
            public decimal PrincipalAmount { get; set; }

            [JsonPropertyName("interestAmount")]
            public decimal InterestAmount { get; set; }

            [JsonPropertyName("totalDebit")]
            public decimal TotalDebit { get; set; }

            [JsonPropertyName("totalCredit")]
            public decimal TotalCredit { get; set; }

            [JsonPropertyName("runningBalance")]
            public decimal RunningBalance { get; set; }
        }

        public class ClosingBalanceDto
        {
            [JsonPropertyName("headWiseTotals")]
            public Dictionary<string, decimal> HeadWiseTotals { get; set; } = new();

            [JsonPropertyName("totalPrincipal")]
            public decimal TotalPrincipal { get; set; }

            [JsonPropertyName("totalInterest")]
            public decimal TotalInterest { get; set; }

            [JsonPropertyName("grandTotalDebit")]
            public decimal GrandTotalDebit { get; set; }

            [JsonPropertyName("grandTotalCredit")]
            public decimal GrandTotalCredit { get; set; }

            [JsonPropertyName("netClosingBalance")]
            public decimal NetClosingBalance { get; set; }
        }

        public class MemberLedgerDto
        {
            [JsonPropertyName("memberInfo")]
            public MemberInfoDto MemberInfo { get; set; } = new();

            [JsonPropertyName("billTypeId")]
            public int BillTypeId { get; set; }

            [JsonPropertyName("billTypeName")]
            public string BillTypeName { get; set; } = "Maintenance";

            [JsonPropertyName("dynamicColumns")]
            public List<DynamicColumnDto> DynamicColumns { get; set; } = new();

            [JsonPropertyName("openingBalance")]
            public OpeningBalanceDto OpeningBalance { get; set; } = new();

            [JsonPropertyName("transactions")]
            public List<TransactionDto> Transactions { get; set; } = new();

            [JsonPropertyName("closingBalance")]
            public ClosingBalanceDto ClosingBalance { get; set; } = new();
        }

        // ── GET /api/reports/member-headwise-ledger ───────────────────────────
        [HttpGet("member-headwise-ledger")]
        public IActionResult GetMemberHeadwiseLedger(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] int? billTypeId,
            [FromQuery] string? fromMemberCode,
            [FromQuery] string? toMemberCode,
            [FromQuery] string? individualMemberCode,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var data = GetMemberHeadwiseLedgerData(conn, societyId, fyId, billTypeId, fromMemberCode, toMemberCode, individualMemberCode, fromDate, toDate);
                return Ok(new
                {
                    success = true,
                    societyName = data.societyName,
                    billTypeName = data.billTypeName,
                    fyLabel = data.fyLabel,
                    startDate = data.startDate.ToString("yyyy-MM-dd"),
                    endDate = data.endDate.ToString("yyyy-MM-dd"),
                    dynamicColumns = data.globalColumns,
                    memberLedgers = data.memberLedgers
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public static (List<MemberLedgerDto> memberLedgers, List<DynamicColumnDto> globalColumns, string societyName, string billTypeName, string fyLabel, DateTime startDate, DateTime endDate)
        GetMemberHeadwiseLedgerData(
            Npgsql.NpgsqlConnection conn,
            int societyId,
            int fyId,
            int? billTypeId = null,
            string? fromMemberCode = null,
            string? toMemberCode = null,
            string? individualMemberCode = null,
            DateTime? fromDate = null,
            DateTime? toDate = null)
        {

                // Dynamic resolution if societyId not provided
                if (societyId <= 0)
                {
                    using var cmdDefSoc = conn.CreateCommand();
                    cmdDefSoc.CommandText = "SELECT societyid FROM jeevika_erp.societyinfo ORDER BY societyid ASC LIMIT 1";
                    var sRes = cmdDefSoc.ExecuteScalar();
                    societyId = (sRes != null && sRes != DBNull.Value) ? Convert.ToInt32(sRes) : 1;
                }

                // Dynamic resolution if fyId not provided
                if (fyId <= 0)
                {
                    using var cmdDefFy = conn.CreateCommand();
                    cmdDefFy.CommandText = @"
                        SELECT fyid FROM jeevika_erp.financialyear 
                        WHERE societyid = @sid AND isactive = TRUE 
                        ORDER BY fystart DESC LIMIT 1";
                    cmdDefFy.Parameters.AddWithValue("@sid", societyId);
                    var fRes = cmdDefFy.ExecuteScalar();
                    if (fRes != null && fRes != DBNull.Value)
                    {
                        fyId = Convert.ToInt32(fRes);
                    }
                    else
                    {
                        using var cmdAnyFy = conn.CreateCommand();
                        cmdAnyFy.CommandText = "SELECT fyid FROM jeevika_erp.financialyear ORDER BY fyid DESC LIMIT 1";
                        var aRes = cmdAnyFy.ExecuteScalar();
                        fyId = (aRes != null && aRes != DBNull.Value) ? Convert.ToInt32(aRes) : 1;
                    }
                }

                // 1. Dynamic Financial Year Date Range Resolution
                DateTime startDate;
                DateTime endDate;
                string fyLabel = "";

                using (var cmdFy = conn.CreateCommand())
                {
                    cmdFy.CommandText = @"
                        SELECT fystart, fyend, fylabel 
                        FROM jeevika_erp.financialyear 
                        WHERE fyid = @fyid";
                    cmdFy.Parameters.AddWithValue("@fyid", fyId);
                    using var rFy = cmdFy.ExecuteReader();
                    if (rFy.Read())
                    {
                        startDate = fromDate ?? Convert.ToDateTime(rFy["fystart"]);
                        endDate = toDate ?? Convert.ToDateTime(rFy["fyend"]);
                        fyLabel = rFy["fylabel"]?.ToString() ?? "";
                    }
                    else
                    {
                        startDate = fromDate ?? new DateTime(DateTime.Today.Year, 4, 1);
                        endDate = toDate ?? new DateTime(DateTime.Today.Year + 1, 3, 31);
                    }
                }

                // 2. Resolve Society Name & Bill Type List
                string societyName = "";
                using (var cmdSoc = conn.CreateCommand())
                {
                    cmdSoc.CommandText = "SELECT societyname FROM jeevika_erp.societyinfo WHERE societyid = @sid";
                    cmdSoc.Parameters.AddWithValue("@sid", societyId);
                    societyName = cmdSoc.ExecuteScalar()?.ToString() ?? "";
                }

                bool isSpecificBillType = billTypeId.HasValue && billTypeId.Value > 0;
                string billTypeName = isSpecificBillType ? "" : "All Bill Types";

                var targetBillTypes = new List<(int BillTypeId, string BillTypeName, List<DynamicColumnDto> DynamicColumns, Dictionary<string, string> HeadMap, List<string> ActiveHeadNames)>();

                using (var cmdBt = conn.CreateCommand())
                {
                    if (isSpecificBillType)
                    {
                        cmdBt.CommandText = "SELECT BillTypeId, BillTypeName FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND BillTypeId = @btid LIMIT 1";
                        cmdBt.Parameters.AddWithValue("@btid", billTypeId!.Value);
                    }
                    else
                    {
                        cmdBt.CommandText = @"
                            SELECT BillTypeId, BillTypeName 
                            FROM jeevika_erp.SocBillType 
                            WHERE SocietyId = @sid AND IsActive = TRUE
                            ORDER BY CASE WHEN LOWER(BillTypeName) = 'maintenance' THEN 0 ELSE 1 END, BillTypeId ASC";
                    }
                    cmdBt.Parameters.AddWithValue("@sid", societyId);
                    using var rBt = cmdBt.ExecuteReader();
                    while (rBt.Read())
                    {
                        var btid = Convert.ToInt32(rBt["BillTypeId"]);
                        var btname = rBt["BillTypeName"]?.ToString() ?? "";
                        if (!string.IsNullOrWhiteSpace(btname) && !targetBillTypes.Any(x => x.BillTypeId == btid || x.BillTypeName.Equals(btname, StringComparison.OrdinalIgnoreCase)))
                        {
                            targetBillTypes.Add((btid, btname, new List<DynamicColumnDto>(), new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase), new List<string>()));
                        }
                    }
                }

                if (targetBillTypes.Count == 0)
                {
                    targetBillTypes.Add((1, "Maintenance", new List<DynamicColumnDto>(), new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase), new List<string>()));
                }

                if (isSpecificBillType)
                {
                    billTypeName = targetBillTypes[0].BillTypeName;
                }

                // 3. Resolve Dynamic Column Heads for each Bill Type strictly from Bill Type configuration
                var globalColumns = new List<DynamicColumnDto>();
                for (int i = 0; i < targetBillTypes.Count; i++)
                {
                    var bt = targetBillTypes[i];
                    using (var cmdHeads = conn.CreateCommand())
                    {
                        cmdHeads.CommandText = @"
                            SELECT DISTINCT h.HeadId, h.SrNo, h.AccountCode, h.AccountName, a.AccCode AS MasterCode, a.AccName AS MasterName
                            FROM jeevika_erp.SocBillTypeHead h
                            LEFT JOIN jeevika_erp.SocAccount a ON h.AccountId = a.AccountId
                            WHERE (h.SocietyId = @sid OR h.SocietyId IS NULL)
                              AND (h.BillTypeId = @btid OR h.BillTypeId IN (SELECT BillTypeId FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND LOWER(TRIM(BillTypeName)) = LOWER(TRIM(@btname))))
                            ORDER BY h.SrNo ASC, h.HeadId ASC";
                        cmdHeads.Parameters.AddWithValue("@sid", societyId);
                        cmdHeads.Parameters.AddWithValue("@btid", bt.BillTypeId);
                        cmdHeads.Parameters.AddWithValue("@btname", bt.BillTypeName.Trim());

                        using var rH = cmdHeads.ExecuteReader();
                        while (rH.Read())
                        {
                            var hId = Convert.ToInt32(rH["HeadId"]);
                            var code = rH["AccountCode"]?.ToString() ?? "";
                            if (string.IsNullOrWhiteSpace(code)) code = rH["MasterCode"]?.ToString() ?? "";

                            var name = rH["AccountName"]?.ToString() ?? "";
                            if (string.IsNullOrWhiteSpace(name)) name = rH["MasterName"]?.ToString() ?? "";

                            if (!string.IsNullOrWhiteSpace(name))
                            {
                                if (!bt.ActiveHeadNames.Contains(name))
                                {
                                    bt.ActiveHeadNames.Add(name);
                                    bt.DynamicColumns.Add(new DynamicColumnDto { HeadId = hId, HeadCode = code, HeadName = name });
                                }
                                if (!string.IsNullOrWhiteSpace(code)) bt.HeadMap[code] = name;
                                bt.HeadMap[name] = name;
                            }
                        }
                    }

                    // Fallback to billing matrix heads for this society & bill type only
                    if (bt.DynamicColumns.Count == 0)
                    {
                        using var cmdBm = conn.CreateCommand();
                        cmdBm.CommandText = @"
                            SELECT DISTINCT bm.AccountCode, COALESCE(a.AccName, bm.AccountCode) AS HeadName
                            FROM jeevika_erp.SocBillingMatrix bm
                            LEFT JOIN jeevika_erp.SocAccount a ON bm.AccountCode = a.AccCode AND a.SocietyId = @sid
                            WHERE bm.SocietyId = @sid AND bm.BillTypeId = @btid AND bm.Amount > 0
                            ORDER BY HeadName";
                        cmdBm.Parameters.AddWithValue("@sid", societyId);
                        cmdBm.Parameters.AddWithValue("@btid", bt.BillTypeId);
                        using var rBm = cmdBm.ExecuteReader();
                        while (rBm.Read())
                        {
                            var code = rBm["AccountCode"]?.ToString() ?? "";
                            var name = rBm["HeadName"]?.ToString() ?? "";
                            if (!string.IsNullOrWhiteSpace(name))
                            {
                                if (!bt.ActiveHeadNames.Contains(name))
                                {
                                    bt.ActiveHeadNames.Add(name);
                                    bt.DynamicColumns.Add(new DynamicColumnDto { HeadId = 0, HeadCode = code, HeadName = name });
                                }
                                if (!string.IsNullOrWhiteSpace(code)) bt.HeadMap[code] = name;
                                bt.HeadMap[name] = name;
                            }
                        }
                    }

                    // Fallback to actual generated bill line items for this bill type
                    if (bt.DynamicColumns.Count == 0)
                    {
                        using var cmdBi = conn.CreateCommand();
                        cmdBi.CommandText = @"
                            SELECT DISTINCT bi.AccountCode, bi.AccountName
                            FROM jeevika_erp.SocMemberBillItem bi
                            JOIN jeevika_erp.SocMemberBill b ON bi.BillId = b.BillId
                            WHERE b.SocietyId = @sid AND (b.BillTypeId = @btid OR LOWER(TRIM(b.BillType)) = LOWER(TRIM(@btname))) AND b.IsDeleted = FALSE";
                        cmdBi.Parameters.AddWithValue("@sid", societyId);
                        cmdBi.Parameters.AddWithValue("@btid", bt.BillTypeId);
                        cmdBi.Parameters.AddWithValue("@btname", bt.BillTypeName.Trim());
                        using var rBi = cmdBi.ExecuteReader();
                        while (rBi.Read())
                        {
                            var code = rBi["AccountCode"]?.ToString() ?? "";
                            var name = rBi["AccountName"]?.ToString() ?? "";
                            if (!string.IsNullOrWhiteSpace(name))
                            {
                                if (!bt.ActiveHeadNames.Contains(name))
                                {
                                    bt.ActiveHeadNames.Add(name);
                                    bt.DynamicColumns.Add(new DynamicColumnDto { HeadId = 0, HeadCode = code, HeadName = name });
                                }
                                if (!string.IsNullOrWhiteSpace(code)) bt.HeadMap[code] = name;
                                bt.HeadMap[name] = name;
                            }
                        }
                    }

                    // Final fallback: Single default head for this bill type (never dump entire chart of accounts)
                    if (bt.DynamicColumns.Count == 0)
                    {
                        var defName = bt.BillTypeName + " Charges";
                        bt.ActiveHeadNames.Add(defName);
                        bt.DynamicColumns.Add(new DynamicColumnDto { HeadId = 0, HeadCode = "", HeadName = defName });
                        bt.HeadMap[defName] = defName;
                    }

                    if (i == 0)
                    {
                        globalColumns = bt.DynamicColumns;
                    }
                }

                // 4. Fetch Scoped Members
                var members = new List<(int MemberId, string Code, string Name, string Wing, string FlatNo, string Contact, decimal OpPrinc, decimal OpInt, string Building, decimal AreaSqFt)>();
                using (var cmdMem = conn.CreateCommand())
                {
                    var sqlMem = @"
                        SELECT MemberId, MemCode, MemName, Wing, FlatNo, ContactNo, OpPrincipal, OpInterest, Building, AreaSqFt
                        FROM jeevika_erp.SocMember
                        WHERE SocietyId = @sid AND IsDeleted = FALSE";

                    if (!string.IsNullOrWhiteSpace(individualMemberCode))
                    {
                        sqlMem += " AND (MemCode = @indCode OR FlatNo = @indCode OR CONCAT(Wing, '-', FlatNo) = @indCode)";
                        cmdMem.Parameters.AddWithValue("@indCode", individualMemberCode.Trim());
                    }
                    else
                    {
                        if (!string.IsNullOrWhiteSpace(fromMemberCode))
                        {
                            sqlMem += " AND MemCode >= @fromCode";
                            cmdMem.Parameters.AddWithValue("@fromCode", fromMemberCode.Trim());
                        }
                        if (!string.IsNullOrWhiteSpace(toMemberCode))
                        {
                            sqlMem += " AND MemCode <= @toCode";
                            cmdMem.Parameters.AddWithValue("@toCode", toMemberCode.Trim());
                        }
                    }

                    sqlMem += " ORDER BY Wing, FlatNo, MemCode";
                    cmdMem.CommandText = sqlMem;
                    cmdMem.Parameters.AddWithValue("@sid", societyId);

                    using var rM = cmdMem.ExecuteReader();
                    while (rM.Read())
                    {
                        members.Add((
                            Convert.ToInt32(rM["MemberId"]),
                            rM["MemCode"]?.ToString() ?? "",
                            rM["MemName"]?.ToString() ?? "",
                            rM["Wing"]?.ToString() ?? "",
                            rM["FlatNo"]?.ToString() ?? "",
                            rM["ContactNo"]?.ToString() ?? "",
                            rM["OpPrincipal"] == DBNull.Value ? 0 : Convert.ToDecimal(rM["OpPrincipal"]),
                            rM["OpInterest"] == DBNull.Value ? 0 : Convert.ToDecimal(rM["OpInterest"]),
                            rM["Building"]?.ToString() ?? "",
                            rM["AreaSqFt"] == DBNull.Value ? 0 : Convert.ToDecimal(rM["AreaSqFt"])
                        ));
                    }
                }

                var memberLedgers = new List<MemberLedgerDto>();

                foreach (var mem in members)
                {
                    foreach (var bt in targetBillTypes)
                    {
                        bool isBtMaintenance = bt.BillTypeName.Equals("Maintenance", StringComparison.OrdinalIgnoreCase);

                        decimal memOpPrinc = 0.00m;
                        decimal memOpInt = 0.00m;

                        if (isBtMaintenance)
                        {
                            memOpPrinc = mem.OpPrinc;
                            memOpInt = mem.OpInt;
                        }
                        else
                        {
                            // Check SocMemberOpBalance for this specific Bill Type
                            using (var cmdOp = conn.CreateCommand())
                            {
                                cmdOp.CommandText = @"
                                    SELECT OpPrincipal, OpInterest 
                                    FROM jeevika_erp.SocMemberOpBalance 
                                    WHERE SocietyId = @sid 
                                      AND MemberId = @mid
                                      AND (LOWER(TRIM(BillType)) = LOWER(TRIM(@btype)) OR LOWER(TRIM(BillType)) = LOWER(TRIM(@bname)))
                                    LIMIT 1";
                                cmdOp.Parameters.AddWithValue("@sid", societyId);
                                cmdOp.Parameters.AddWithValue("@mid", mem.MemberId);
                                cmdOp.Parameters.AddWithValue("@mcode", mem.Code);
                                cmdOp.Parameters.AddWithValue("@mflat", mem.FlatNo);
                                cmdOp.Parameters.AddWithValue("@btype", bt.BillTypeName);
                                cmdOp.Parameters.AddWithValue("@bname", bt.BillTypeName.Trim());
                                using var rOp = cmdOp.ExecuteReader();
                                if (rOp.Read())
                                {
                                    memOpPrinc = rOp["OpPrincipal"] != DBNull.Value ? Convert.ToDecimal(rOp["OpPrincipal"]) : 0.00m;
                                    memOpInt = rOp["OpInterest"] != DBNull.Value ? Convert.ToDecimal(rOp["OpInterest"]) : 0.00m;
                                }
                            }
                        }

                        var headWiseOp = new Dictionary<string, decimal>();
                        foreach (var h in bt.ActiveHeadNames) headWiseOp[h] = 0.00m;

                        // If Interest column exists in active heads, populate opening interest under it
                        var intHeadKey = bt.ActiveHeadNames.FirstOrDefault(h => h.Equals("Interest", StringComparison.OrdinalIgnoreCase));
                        if (!string.IsNullOrEmpty(intHeadKey) && memOpInt > 0)
                        {
                            headWiseOp[intHeadKey] = memOpInt;
                        }

                        decimal totalOpBal = memOpPrinc + memOpInt;

                        decimal priorTxDiff = 0;
                        using (var cmdPrior = conn.CreateCommand())
                        {
                            var sqlPrior = @"
                                SELECT COALESCE(SUM(b.TotalAmount), 0) - COALESCE(SUM(b.PaidAmount), 0)
                                FROM jeevika_erp.SocMemberBill b
                                WHERE b.SocietyId = @sid
                                  AND b.MemberId = @mid
                                  AND b.IsDeleted = FALSE 
                                  AND b.BillDate < @sdate";

                            if (isBtMaintenance)
                            {
                                sqlPrior += @"
                                  AND (
                                    b.BillTypeId = @btid 
                                    OR b.BillTypeId IS NULL 
                                    OR b.BillTypeId = 0 
                                    OR b.BillType IS NULL 
                                    OR TRIM(b.BillType) = '' 
                                    OR LOWER(TRIM(b.BillType)) = 'maintenance'
                                    OR b.BillTypeId IN (SELECT BillTypeId FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND LOWER(TRIM(BillTypeName)) = 'maintenance')
                                  )";
                            }
                            else
                            {
                                sqlPrior += @"
                                  AND (
                                    b.BillTypeId = @btid 
                                    OR (b.BillTypeId > 0 AND b.BillTypeId IN (SELECT BillTypeId FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND LOWER(TRIM(BillTypeName)) = LOWER(TRIM(@btname))))
                                    OR LOWER(TRIM(COALESCE(b.BillType, ''))) = LOWER(TRIM(@btname))
                                    OR LOWER(TRIM(COALESCE(b.BillType, ''))) LIKE '%' || LOWER(TRIM(@btname)) || '%'
                                  )";
                            }

                            cmdPrior.CommandText = sqlPrior;
                            cmdPrior.Parameters.AddWithValue("@sid", societyId);
                            cmdPrior.Parameters.AddWithValue("@mid", mem.MemberId);
                            cmdPrior.Parameters.AddWithValue("@mcode", mem.Code);
                            cmdPrior.Parameters.AddWithValue("@mflat", mem.FlatNo);
                            cmdPrior.Parameters.AddWithValue("@sdate", startDate);
                            cmdPrior.Parameters.AddWithValue("@btid", bt.BillTypeId);
                            cmdPrior.Parameters.AddWithValue("@btname", bt.BillTypeName.Trim());
                            priorTxDiff = Convert.ToDecimal(cmdPrior.ExecuteScalar() ?? 0);
                        }
                        totalOpBal += priorTxDiff;

                        var rawTxList = new List<(DateTime Date, string VoucherNo, string Period, string Type, decimal Debit, decimal Credit, int RefId)>();

                        // 1. Fetch Bills for THIS specific bill type
                        using (var cmdBills = conn.CreateCommand())
                        {
                            var sqlBills = @"
                                SELECT b.BillId, b.BillNo, b.BillDate, b.Period, b.TotalAmount, b.PaidAmount, b.BillTypeId, b.BillType
                                FROM jeevika_erp.SocMemberBill b
                                WHERE b.SocietyId = @sid
                                  AND b.MemberId = @mid
                                  AND b.IsDeleted = FALSE 
                                  AND (b.FYId = @fyid OR (b.BillDate >= @sdate AND b.BillDate <= @edate))";

                            if (isBtMaintenance)
                            {
                                sqlBills += @"
                                  AND (
                                    b.BillTypeId = @btid 
                                    OR b.BillTypeId IS NULL 
                                    OR b.BillTypeId = 0 
                                    OR b.BillType IS NULL 
                                    OR TRIM(b.BillType) = '' 
                                    OR LOWER(TRIM(b.BillType)) = 'maintenance'
                                    OR b.BillTypeId IN (SELECT BillTypeId FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND LOWER(TRIM(BillTypeName)) = 'maintenance')
                                  )";
                            }
                            else
                            {
                                sqlBills += @"
                                  AND (
                                    b.BillTypeId = @btid 
                                    OR (b.BillTypeId > 0 AND b.BillTypeId IN (SELECT BillTypeId FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND LOWER(TRIM(BillTypeName)) = LOWER(TRIM(@btname))))
                                    OR LOWER(TRIM(COALESCE(b.BillType, ''))) = LOWER(TRIM(@btname))
                                    OR LOWER(TRIM(COALESCE(b.BillType, ''))) LIKE '%' || LOWER(TRIM(@btname)) || '%'
                                  )";
                            }

                            cmdBills.CommandText = sqlBills;
                            cmdBills.Parameters.AddWithValue("@sid", societyId);
                            cmdBills.Parameters.AddWithValue("@mid", mem.MemberId);
                            cmdBills.Parameters.AddWithValue("@mcode", mem.Code);
                            cmdBills.Parameters.AddWithValue("@mflat", mem.FlatNo);
                            cmdBills.Parameters.AddWithValue("@fyid", fyId);
                            cmdBills.Parameters.AddWithValue("@sdate", startDate);
                            cmdBills.Parameters.AddWithValue("@edate", endDate);
                            cmdBills.Parameters.AddWithValue("@btid", bt.BillTypeId);
                            cmdBills.Parameters.AddWithValue("@btname", bt.BillTypeName.Trim());

                            using var rB = cmdBills.ExecuteReader();
                            while (rB.Read())
                            {
                                var bid = Convert.ToInt32(rB["BillId"]);
                                var bno = rB["BillNo"]?.ToString() ?? "";
                                var bdate = Convert.ToDateTime(rB["BillDate"]);
                                var period = rB["Period"]?.ToString() ?? "";
                                var totAmt = Convert.ToDecimal(rB["TotalAmount"]);
                                var paidAmt = Convert.ToDecimal(rB["PaidAmount"]);

                                rawTxList.Add((bdate, bno, period, "Bill", totAmt, 0.00m, bid));
                                if (paidAmt > 0)
                                {
                                    rawTxList.Add((bdate, "RCPT-" + bno, period, "Receipt", 0.00m, paidAmt, bid));
                                }
                            }
                        }

                        // 2. Fetch Vouchers/Receipts for THIS specific bill type
                        using (var cmdRcpt = conn.CreateCommand())
                        {
                            var sqlRcpt = @"
                                SELECT vh.VoucherId, vh.VoucherNo, vh.VoucherDate, vh.VoucherType, vh.Amount, vh.Narration, vh.RefNo, vh.PersonCode, vh.PersonName, vh.Particular1, vh.Particular2
                                FROM jeevika_erp.SocVoucherHeader vh
                                WHERE vh.SocietyId = @sid AND vh.IsDeleted = FALSE
                                  AND vh.VoucherType IN ('MemberReceipt', 'MemberReceiptReversal', 'MemberDebitNote', 'MemberCreditNote', 'BillTypeTransfer', 'CreditNote', 'DebitNote', 'MemberNote', 'Receipt', 'Journal')
                                  AND vh.VoucherDate >= @sdate AND vh.VoucherDate <= @edate
                                  AND (
                                    vh.PersonCode = @mcode
                                    OR vh.PersonCode = @midStr
                                    OR vh.RefNo = @mcode
                                    OR vh.RefNo = @midStr
                                    OR vh.PersonName ILIKE @mname
                                    OR (vh.PersonName ILIKE @mflat AND vh.PersonName ILIKE @mname)
                                    OR EXISTS (
                                      SELECT 1 FROM jeevika_erp.SocMemberNote mn 
                                      WHERE mn.SocietyId = @sid AND mn.MemberId = @mid AND mn.NoteNo = vh.VoucherNo AND mn.IsDeleted = FALSE
                                    )
                                  )";

                            if (isBtMaintenance)
                            {
                                sqlRcpt += @"
                                  AND (
                                    EXISTS (
                                      SELECT 1 FROM jeevika_erp.SocMemberBill b 
                                      WHERE b.SocietyId = @sid AND (b.BillTypeId = @btid OR LOWER(b.BillType) = 'maintenance') AND b.IsDeleted = FALSE 
                                        AND (b.VoucherId = vh.VoucherId OR vh.RefNo = b.BillNo OR vh.Narration ILIKE '%' || b.BillNo || '%')
                                    )
                                    OR (
                                      (vh.Narration ILIKE '%maintenance%' OR COALESCE(vh.Particular1, '') ILIKE '%maintenance%')
                                      AND (vh.VoucherType = 'BillTypeTransfer' OR (
                                        vh.Narration NOT ILIKE '%major repair%'
                                        AND COALESCE(vh.Particular1, '') NOT ILIKE '%major repair%'
                                        AND vh.Narration NOT ILIKE '%repair%'
                                        AND COALESCE(vh.Particular1, '') NOT ILIKE '%repair%'
                                      ))
                                    )
                                    OR (
                                      vh.VoucherType = 'BillTypeTransfer'
                                      AND (vh.Narration ILIKE '%maintenance%' OR COALESCE(vh.Particular1, '') ILIKE '%maintenance%' OR COALESCE(vh.Particular2, '') ILIKE '%maintenance%' OR vh.RefNo ILIKE '%maintenance%')
                                    )
                                    OR (
                                      vh.Narration NOT ILIKE '%major repair%'
                                      AND COALESCE(vh.Particular1, '') NOT ILIKE '%major repair%'
                                      AND vh.Narration NOT ILIKE '%repair%'
                                      AND COALESCE(vh.Particular1, '') NOT ILIKE '%repair%'
                                      AND NOT EXISTS (
                                        SELECT 1 FROM jeevika_erp.SocBillType obt 
                                        WHERE (obt.SocietyId = @sid OR obt.SocietyId = 0 OR obt.SocietyId IS NULL) AND obt.BillTypeId != @btid 
                                          AND (vh.Narration ILIKE '%' || obt.BillTypeName || '%' OR COALESCE(vh.Particular1, '') ILIKE '%' || obt.BillTypeName || '%')
                                      )
                                      AND NOT EXISTS (
                                        SELECT 1 FROM jeevika_erp.SocMemberBill obill
                                        WHERE obill.SocietyId = @sid AND obill.BillTypeId != @btid AND obill.IsDeleted = FALSE
                                          AND (obill.VoucherId = vh.VoucherId OR vh.RefNo = obill.BillNo OR vh.Narration ILIKE '%' || obill.BillNo || '%')
                                      )
                                    )
                                  )";
                            }
                            else
                            {
                                sqlRcpt += @"
                                  AND (
                                    EXISTS (
                                      SELECT 1 FROM jeevika_erp.SocMemberBill b 
                                      WHERE b.SocietyId = @sid AND (b.BillTypeId = @btid OR LOWER(b.BillType) = LOWER(@btypeName)) AND b.IsDeleted = FALSE 
                                        AND (b.VoucherId = vh.VoucherId OR vh.RefNo = b.BillNo OR vh.Narration ILIKE '%' || b.BillNo || '%')
                                    )
                                    OR vh.Narration ILIKE '%' || @btypeName || '%'
                                    OR COALESCE(vh.Particular1, '') ILIKE '%' || @btypeName || '%'
                                    OR (
                                      vh.VoucherType = 'BillTypeTransfer'
                                      AND (vh.Narration ILIKE '%' || @btypeName || '%' OR COALESCE(vh.Particular1, '') ILIKE '%' || @btypeName || '%' OR COALESCE(vh.Particular2, '') ILIKE '%' || @btypeName || '%' OR vh.RefNo ILIKE '%' || @btypeName || '%')
                                    )
                                    OR (
                                      LOWER(@btypeName) LIKE '%repair%' 
                                      AND (vh.Narration ILIKE '%repair%' OR COALESCE(vh.Particular1, '') ILIKE '%repair%')
                                    )
                                  )";
                                cmdRcpt.Parameters.AddWithValue("@btypeName", bt.BillTypeName);
                            }
                            cmdRcpt.Parameters.AddWithValue("@btid", bt.BillTypeId);

                            cmdRcpt.CommandText = sqlRcpt;
                            cmdRcpt.Parameters.AddWithValue("@sid", societyId);
                            cmdRcpt.Parameters.AddWithValue("@mid", mem.MemberId);
                            cmdRcpt.Parameters.AddWithValue("@midStr", mem.MemberId.ToString());
                            cmdRcpt.Parameters.AddWithValue("@sdate", startDate);
                            cmdRcpt.Parameters.AddWithValue("@edate", endDate);
                            cmdRcpt.Parameters.AddWithValue("@mname", "%" + mem.Name + "%");
                            cmdRcpt.Parameters.AddWithValue("@mflat", "%" + mem.FlatNo + "%");
                            cmdRcpt.Parameters.AddWithValue("@mcode", mem.Code);

                            using var rR = cmdRcpt.ExecuteReader();
                            while (rR.Read())
                            {
                                var vNo = rR["VoucherNo"]?.ToString() ?? "";
                                var vDate = Convert.ToDateTime(rR["VoucherDate"]);
                                var vType = rR["VoucherType"]?.ToString() ?? "Receipt";
                                var vAmt = Convert.ToDecimal(rR["Amount"]);
                                var narr = rR["Narration"]?.ToString() ?? vType;

                                if (!rawTxList.Any(t => t.VoucherNo.Equals(vNo, StringComparison.OrdinalIgnoreCase)))
                                {
                                    decimal dr = 0.00m;
                                    decimal cr = 0.00m;
                                    string displayType = vType;

                                    if (vType.Equals("MemberReceipt", StringComparison.OrdinalIgnoreCase) ||
                                        vType.Equals("Receipt", StringComparison.OrdinalIgnoreCase) ||
                                        vType.Equals("MemberCreditNote", StringComparison.OrdinalIgnoreCase) ||
                                        vType.Equals("CreditNote", StringComparison.OrdinalIgnoreCase))
                                    {
                                        cr = Math.Abs(vAmt);
                                        displayType = vType.Contains("Credit", StringComparison.OrdinalIgnoreCase) ? "Credit Note" : "Receipt";
                                    }
                                    else if (vType.Equals("MemberReceiptReversal", StringComparison.OrdinalIgnoreCase))
                                    {
                                        dr = Math.Abs(vAmt);
                                        displayType = "Receipt Reversal";
                                    }
                                    else if (vType.Equals("MemberDebitNote", StringComparison.OrdinalIgnoreCase) ||
                                             vType.Equals("DebitNote", StringComparison.OrdinalIgnoreCase))
                                    {
                                        dr = Math.Abs(vAmt);
                                        displayType = "Debit Note";
                                    }
                                    else if (vType.Equals("BillTypeTransfer", StringComparison.OrdinalIgnoreCase))
                                    {
                                        bool isDebit = false;
                                        bool isCredit = false;
                                        var refStr = rR["RefNo"]?.ToString() ?? "";
                                        var p1Str = rR["Particular1"]?.ToString() ?? "";
                                        var p2Str = rR["Particular2"]?.ToString() ?? "";
                                        var allMeta = $"{refStr} {p1Str} {p2Str} {narr}";

                                        string otherBt = "";
                                        var parts = refStr.Split('|');
                                        if (parts.Length >= 4)
                                        {
                                            if (parts[0].Trim().Equals(bt.BillTypeName, StringComparison.OrdinalIgnoreCase))
                                            {
                                                isDebit = parts[1].Trim().Equals("Dr", StringComparison.OrdinalIgnoreCase);
                                                isCredit = parts[1].Trim().Equals("Cr", StringComparison.OrdinalIgnoreCase);
                                                otherBt = parts[2].Trim();
                                            }
                                            else if (parts[2].Trim().Equals(bt.BillTypeName, StringComparison.OrdinalIgnoreCase))
                                            {
                                                isDebit = parts[3].Trim().Equals("Dr", StringComparison.OrdinalIgnoreCase);
                                                isCredit = parts[3].Trim().Equals("Cr", StringComparison.OrdinalIgnoreCase);
                                                otherBt = parts[0].Trim();
                                            }
                                        }

                                        if (!isDebit && !isCredit)
                                        {
                                            if (allMeta.IndexOf("to " + bt.BillTypeName, StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                allMeta.IndexOf("into " + bt.BillTypeName, StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                allMeta.IndexOf("-> " + bt.BillTypeName, StringComparison.OrdinalIgnoreCase) >= 0)
                                            {
                                                isDebit = true;
                                            }
                                            else
                                            {
                                                isCredit = true;
                                            }
                                        }

                                        if (isDebit)
                                        {
                                            dr = Math.Abs(vAmt);
                                            displayType = "Transfer (In)";
                                            if (!string.IsNullOrEmpty(otherBt)) narr = $"Transfer from {otherBt}";
                                        }
                                        else
                                        {
                                            cr = Math.Abs(vAmt);
                                            displayType = "Transfer (Out)";
                                            if (!string.IsNullOrEmpty(otherBt)) narr = $"Transfer to {otherBt}";
                                        }
                                    }
                                    else if (vType.Equals("Journal", StringComparison.OrdinalIgnoreCase))
                                    {
                                        if (vAmt < 0) { dr = Math.Abs(vAmt); }
                                        else { cr = Math.Abs(vAmt); }
                                        displayType = "Journal";
                                    }
                                    else
                                    {
                                        cr = Math.Abs(vAmt);
                                        displayType = vType;
                                    }

                                    rawTxList.Add((vDate, vNo, narr, displayType, dr, cr, Convert.ToInt32(rR["VoucherId"])));
                                }
                            }
                        }

                        // In 'All Bill Types' view, skip custom bill types that have 0 opening balance and 0 transactions
                        if (!isSpecificBillType && !isBtMaintenance && totalOpBal == 0 && rawTxList.Count == 0)
                        {
                            continue;
                        }

                        rawTxList = rawTxList.OrderBy(t => t.Date)
                            .ThenBy(t => t.Type == "Bill" ? 0 
                                       : t.Type.Contains("Debit Note", StringComparison.OrdinalIgnoreCase) ? 1 
                                       : (t.Type == "Receipt" || t.Type == "Transfer (Out)") ? 2 
                                       : t.Type.Contains("Reversal", StringComparison.OrdinalIgnoreCase) ? 3 
                                       : t.Type.Contains("Credit Note", StringComparison.OrdinalIgnoreCase) ? 4 
                                       : 5)
                            .ThenBy(t => t.RefId)
                            .ToList();

                        var txList = new List<TransactionDto>();
                        decimal runningBal = totalOpBal;

                        foreach (var tx in rawTxList)
                        {
                            var headAmounts = new Dictionary<string, decimal>();
                            foreach (var hName in bt.ActiveHeadNames) headAmounts[hName] = 0.00m;

                            if (tx.Type == "Bill")
                            {
                                using (var cmdItems = conn.CreateCommand())
                                {
                                    cmdItems.CommandText = @"
                                        SELECT AccountCode, AccountName, Amount
                                        FROM jeevika_erp.SocMemberBillItem
                                        WHERE BillId = @bid";
                                    cmdItems.Parameters.AddWithValue("@bid", tx.RefId);

                                    using var rI = cmdItems.ExecuteReader();
                                    while (rI.Read())
                                    {
                                        var code = rI["AccountCode"]?.ToString() ?? "";
                                        var name = rI["AccountName"]?.ToString() ?? "";
                                        var amt = Convert.ToDecimal(rI["Amount"]);

                                        string matchedHead = "";
                                        if (bt.HeadMap.ContainsKey(code)) matchedHead = bt.HeadMap[code];
                                        else if (bt.HeadMap.ContainsKey(name)) matchedHead = bt.HeadMap[name];
                                        else
                                        {
                                            var foundKey = bt.ActiveHeadNames.FirstOrDefault(hn => hn.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0 || name.IndexOf(hn, StringComparison.OrdinalIgnoreCase) >= 0);
                                            if (!string.IsNullOrEmpty(foundKey)) matchedHead = foundKey;
                                        }

                                        if (!string.IsNullOrEmpty(matchedHead) && headAmounts.ContainsKey(matchedHead))
                                        {
                                            headAmounts[matchedHead] += amt;
                                        }
                                    }
                                }

                                runningBal += tx.Debit;
                            }
                            else if (tx.Type.Contains("Debit Note", StringComparison.OrdinalIgnoreCase) || 
                                     tx.Type.Contains("Credit Note", StringComparison.OrdinalIgnoreCase) ||
                                     tx.Type.Contains("Receipt", StringComparison.OrdinalIgnoreCase))
                            {
                                using (var cmdItems = conn.CreateCommand())
                                {
                                    cmdItems.CommandText = @"
                                        SELECT AccountCode, AccountName, Debit, Credit
                                        FROM jeevika_erp.SocVoucherDetail
                                        WHERE VoucherId = @vid";
                                    cmdItems.Parameters.AddWithValue("@vid", tx.RefId);

                                    using var rI = cmdItems.ExecuteReader();
                                    while (rI.Read())
                                    {
                                        var code = rI["AccountCode"]?.ToString() ?? "";
                                        var name = rI["AccountName"]?.ToString() ?? "";
                                        var dDr = rI["Debit"] != DBNull.Value ? Convert.ToDecimal(rI["Debit"]) : 0;
                                        var dCr = rI["Credit"] != DBNull.Value ? Convert.ToDecimal(rI["Credit"]) : 0;
                                        var amt = dDr > 0 ? dDr : dCr;

                                        // For receipts, only credit lines represent member dues/interest settlements
                                        if (tx.Type.Contains("Receipt", StringComparison.OrdinalIgnoreCase) && dCr <= 0) continue;

                                        string matchedHead = "";
                                        if (bt.HeadMap.ContainsKey(code)) matchedHead = bt.HeadMap[code];
                                        else if (bt.HeadMap.ContainsKey(name)) matchedHead = bt.HeadMap[name];
                                        else
                                        {
                                            var foundKey = bt.ActiveHeadNames.FirstOrDefault(hn => hn.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0 || name.IndexOf(hn, StringComparison.OrdinalIgnoreCase) >= 0);
                                            if (!string.IsNullOrEmpty(foundKey)) matchedHead = foundKey;
                                        }

                                        if (!string.IsNullOrEmpty(matchedHead) && headAmounts.ContainsKey(matchedHead))
                                        {
                                            headAmounts[matchedHead] += amt;
                                        }
                                    }
                                }

                                runningBal += (tx.Debit - tx.Credit);
                            }
                            else
                            {
                                runningBal += (tx.Debit - tx.Credit);
                            }

                            txList.Add(new TransactionDto
                            {
                                VoucherDate = tx.Date.ToString("yyyy-MM-dd"),
                                VoucherNo = tx.VoucherNo,
                                Period = tx.Period,
                                VoucherType = tx.Type,
                                HeadAmounts = headAmounts,
                                TotalDebit = tx.Debit,
                                TotalCredit = tx.Credit,
                                RunningBalance = runningBal
                            });
                        }

                        var closingHeadTotals = new Dictionary<string, decimal>();
                        foreach (var hName in bt.ActiveHeadNames)
                        {
                            closingHeadTotals[hName] = txList.Sum(t => t.HeadAmounts.ContainsKey(hName) ? t.HeadAmounts[hName] : 0.00m);
                        }

                        decimal grandDr = txList.Sum(t => t.TotalDebit);
                        decimal grandCr = txList.Sum(t => t.TotalCredit);

                        var ledger = new MemberLedgerDto
                        {
                            MemberInfo = new MemberInfoDto
                            {
                                MemberId = mem.MemberId,
                                MemberCode = mem.Code,
                                MemberName = mem.Name,
                                Wing = mem.Wing,
                                FlatNo = mem.FlatNo,
                                ContactNo = mem.Contact,
                                Building = mem.Building,
                                AreaSqFt = mem.AreaSqFt
                            },
                            BillTypeId = bt.BillTypeId,
                            BillTypeName = bt.BillTypeName,
                            DynamicColumns = bt.DynamicColumns,
                            OpeningBalance = new OpeningBalanceDto
                            {
                                HeadWise = headWiseOp,
                                TotalOpening = totalOpBal
                            },
                            Transactions = txList,
                            ClosingBalance = new ClosingBalanceDto
                            {
                                HeadWiseTotals = closingHeadTotals,
                                GrandTotalDebit = grandDr,
                                GrandTotalCredit = grandCr,
                                NetClosingBalance = runningBal
                            }
                        };

                        memberLedgers.Add(ledger);
                    }
                }

            return (memberLedgers, globalColumns, societyName, billTypeName, fyLabel, startDate, endDate);
        }

        // ── GET /api/reports/member-drcr-register ─────────────────────────────
        [HttpGet("member-drcr-register")]
        public IActionResult GetMemberDrCrRegister(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] int? billTypeId,
            [FromQuery] string? fromMemberCode,
            [FromQuery] string? toMemberCode,
            [FromQuery] string? individualMemberCode,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate)
        {
            try
            {
                using var conn = DbHelper.GetConn();

                // Dynamic resolution if societyId not provided
                if (societyId <= 0)
                {
                    using var cmdDefSoc = conn.CreateCommand();
                    cmdDefSoc.CommandText = "SELECT societyid FROM jeevika_erp.societyinfo ORDER BY societyid ASC LIMIT 1";
                    var sRes = cmdDefSoc.ExecuteScalar();
                    societyId = (sRes != null && sRes != DBNull.Value) ? Convert.ToInt32(sRes) : 1;
                }

                // Dynamic resolution if fyId not provided
                if (fyId <= 0)
                {
                    using var cmdDefFy = conn.CreateCommand();
                    cmdDefFy.CommandText = @"
                        SELECT fyid FROM jeevika_erp.financialyear 
                        WHERE societyid = @sid AND isactive = TRUE 
                        ORDER BY fystart DESC LIMIT 1";
                    cmdDefFy.Parameters.AddWithValue("@sid", societyId);
                    var fRes = cmdDefFy.ExecuteScalar();
                    if (fRes != null && fRes != DBNull.Value)
                    {
                        fyId = Convert.ToInt32(fRes);
                    }
                    else
                    {
                        using var cmdAnyFy = conn.CreateCommand();
                        cmdAnyFy.CommandText = "SELECT fyid FROM jeevika_erp.financialyear ORDER BY fyid DESC LIMIT 1";
                        var aRes = cmdAnyFy.ExecuteScalar();
                        fyId = (aRes != null && aRes != DBNull.Value) ? Convert.ToInt32(aRes) : 1;
                    }
                }

                // 1. Dynamic FY Dates Resolution
                DateTime startDate;
                DateTime endDate;
                string fyLabel = "";

                using (var cmdFy = conn.CreateCommand())
                {
                    cmdFy.CommandText = @"
                        SELECT fystart, fyend, fylabel 
                        FROM jeevika_erp.financialyear 
                        WHERE fyid = @fyid";
                    cmdFy.Parameters.AddWithValue("@fyid", fyId);
                    using var rFy = cmdFy.ExecuteReader();
                    if (rFy.Read())
                    {
                        startDate = fromDate ?? Convert.ToDateTime(rFy["fystart"]);
                        endDate = toDate ?? Convert.ToDateTime(rFy["fyend"]);
                        fyLabel = rFy["fylabel"]?.ToString() ?? "";
                    }
                    else
                    {
                        startDate = fromDate ?? new DateTime(DateTime.Today.Year, 4, 1);
                        endDate = toDate ?? new DateTime(DateTime.Today.Year + 1, 3, 31);
                    }
                }

                // 2. Resolve Society Name & Bill Type Info
                string societyName = "";
                using (var cmdSoc = conn.CreateCommand())
                {
                    cmdSoc.CommandText = "SELECT societyname FROM jeevika_erp.societyinfo WHERE societyid = @sid";
                    cmdSoc.Parameters.AddWithValue("@sid", societyId);
                    societyName = cmdSoc.ExecuteScalar()?.ToString() ?? "";
                }

                bool isSpecificBillType = billTypeId.HasValue && billTypeId.Value > 0;
                string billTypeName = isSpecificBillType ? "" : "All Bill Types";

                var targetBillTypes = new List<(int BillTypeId, string BillTypeName, string PriorityOrder)>();

                using (var cmdBt = conn.CreateCommand())
                {
                    if (isSpecificBillType)
                    {
                        cmdBt.CommandText = @"
                            SELECT bt.BillTypeId, bt.BillTypeName, COALESCE(n.InterestPriority, 'Interest First') AS InterestPriority 
                            FROM jeevika_erp.SocBillType bt
                            LEFT JOIN jeevika_erp.SocBillTypeNote n ON bt.BillTypeId = n.BillTypeId
                            WHERE bt.SocietyId = @sid AND bt.BillTypeId = @btid LIMIT 1";
                        cmdBt.Parameters.AddWithValue("@btid", billTypeId!.Value);
                    }
                    else
                    {
                        cmdBt.CommandText = @"
                            SELECT bt.BillTypeId, bt.BillTypeName, COALESCE(n.InterestPriority, 'Interest First') AS InterestPriority 
                            FROM jeevika_erp.SocBillType bt
                            LEFT JOIN jeevika_erp.SocBillTypeNote n ON bt.BillTypeId = n.BillTypeId
                            WHERE bt.SocietyId = @sid AND bt.IsActive = TRUE
                            ORDER BY CASE WHEN LOWER(bt.BillTypeName) = 'maintenance' THEN 0 ELSE 1 END, bt.BillTypeId ASC";
                    }
                    cmdBt.Parameters.AddWithValue("@sid", societyId);
                    using var rBt = cmdBt.ExecuteReader();
                    while (rBt.Read())
                    {
                        var btid = Convert.ToInt32(rBt["BillTypeId"]);
                        var btname = rBt["BillTypeName"]?.ToString() ?? "";
                        var priority = rBt["InterestPriority"]?.ToString() ?? "Interest First";
                        if (!string.IsNullOrWhiteSpace(btname) && !targetBillTypes.Any(x => x.BillTypeId == btid || x.BillTypeName.Equals(btname, StringComparison.OrdinalIgnoreCase)))
                        {
                            targetBillTypes.Add((btid, btname, priority));
                        }
                    }
                }

                if (targetBillTypes.Count == 0)
                {
                    targetBillTypes.Add((1, "Maintenance", "Interest First"));
                }

                if (isSpecificBillType)
                {
                    billTypeName = targetBillTypes[0].BillTypeName;
                }

                // 3. Fetch Scoped Members
                var members = new List<(int MemberId, string Code, string Name, string Wing, string FlatNo, string Contact, decimal OpPrinc, decimal OpInt, string Building, decimal AreaSqFt)>();
                using (var cmdMem = conn.CreateCommand())
                {
                    var sqlMem = @"
                        SELECT MemberId, MemCode, MemName, Wing, FlatNo, ContactNo, OpPrincipal, OpInterest, Building, AreaSqFt
                        FROM jeevika_erp.SocMember
                        WHERE SocietyId = @sid AND IsDeleted = FALSE";

                    if (!string.IsNullOrWhiteSpace(individualMemberCode))
                    {
                        sqlMem += " AND (MemCode = @indCode OR FlatNo = @indCode)";
                        cmdMem.Parameters.AddWithValue("@indCode", individualMemberCode.Trim());
                    }
                    else
                    {
                        if (!string.IsNullOrWhiteSpace(fromMemberCode))
                        {
                            sqlMem += " AND MemCode >= @fromCode";
                            cmdMem.Parameters.AddWithValue("@fromCode", fromMemberCode.Trim());
                        }
                        if (!string.IsNullOrWhiteSpace(toMemberCode))
                        {
                            sqlMem += " AND MemCode <= @toCode";
                            cmdMem.Parameters.AddWithValue("@toCode", toMemberCode.Trim());
                        }
                    }

                    sqlMem += " ORDER BY Wing, FlatNo, MemCode";
                    cmdMem.CommandText = sqlMem;
                    cmdMem.Parameters.AddWithValue("@sid", societyId);

                    using var rM = cmdMem.ExecuteReader();
                    while (rM.Read())
                    {
                        members.Add((
                            Convert.ToInt32(rM["MemberId"]),
                            rM["MemCode"]?.ToString() ?? "",
                            rM["MemName"]?.ToString() ?? "",
                            rM["Wing"]?.ToString() ?? "",
                            rM["FlatNo"]?.ToString() ?? "",
                            rM["ContactNo"]?.ToString() ?? "",
                            rM["OpPrincipal"] == DBNull.Value ? 0 : Convert.ToDecimal(rM["OpPrincipal"]),
                            rM["OpInterest"] == DBNull.Value ? 0 : Convert.ToDecimal(rM["OpInterest"]),
                            rM["Building"]?.ToString() ?? "",
                            rM["AreaSqFt"] == DBNull.Value ? 0 : Convert.ToDecimal(rM["AreaSqFt"])
                        ));
                    }
                }

                var memberRegisters = new List<MemberLedgerDto>();

                // 4. Process Each Member for Dr/Cr Register (Separated by Bill Type)
                foreach (var mem in members)
                {
                    foreach (var bt in targetBillTypes)
                    {
                        bool isBtMaintenance = bt.BillTypeName.Equals("Maintenance", StringComparison.OrdinalIgnoreCase);

                        decimal memOpPrinc = 0.00m;
                        decimal memOpInt = 0.00m;

                        if (isBtMaintenance)
                        {
                            memOpPrinc = mem.OpPrinc;
                            memOpInt = mem.OpInt;
                        }
                        else
                        {
                            using (var cmdOp = conn.CreateCommand())
                            {
                                cmdOp.CommandText = @"
                                    SELECT OpPrincipal, OpInterest 
                                    FROM jeevika_erp.SocMemberOpBalance 
                                    WHERE SocietyId = @sid 
                                      AND MemberId = @mid
                                      AND (LOWER(TRIM(BillType)) = LOWER(TRIM(@btype)) OR LOWER(TRIM(BillType)) = LOWER(TRIM(@bname)))
                                    LIMIT 1";
                                cmdOp.Parameters.AddWithValue("@sid", societyId);
                                cmdOp.Parameters.AddWithValue("@mid", mem.MemberId);
                                cmdOp.Parameters.AddWithValue("@mcode", mem.Code);
                                cmdOp.Parameters.AddWithValue("@mflat", mem.FlatNo);
                                cmdOp.Parameters.AddWithValue("@btype", bt.BillTypeName);
                                cmdOp.Parameters.AddWithValue("@bname", bt.BillTypeName.Trim());
                                using var rOp = cmdOp.ExecuteReader();
                                if (rOp.Read())
                                {
                                    memOpPrinc = rOp["OpPrincipal"] != DBNull.Value ? Convert.ToDecimal(rOp["OpPrincipal"]) : 0.00m;
                                    memOpInt = rOp["OpInterest"] != DBNull.Value ? Convert.ToDecimal(rOp["OpInterest"]) : 0.00m;
                                }
                            }
                        }

                        var ledger = new MemberLedgerDto
                        {
                            MemberInfo = new MemberInfoDto
                            {
                                MemberId = mem.MemberId,
                                MemberCode = mem.Code,
                                MemberName = mem.Name,
                                Wing = mem.Wing,
                                FlatNo = mem.FlatNo,
                                ContactNo = mem.Contact,
                                Building = mem.Building,
                                AreaSqFt = mem.AreaSqFt
                            },
                            BillTypeId = bt.BillTypeId,
                            BillTypeName = bt.BillTypeName,
                            OpeningBalance = new OpeningBalanceDto
                            {
                                Principal = memOpPrinc,
                                Interest = memOpInt,
                                TotalOpening = memOpPrinc + memOpInt
                            }
                        };

                        // Prior transactions carry forward before startDate
                        decimal priorDiff = 0;
                        using (var cmdPrior = conn.CreateCommand())
                        {
                            var sqlPrior = @"
                                SELECT COALESCE(SUM(b.TotalAmount), 0) - COALESCE(SUM(b.PaidAmount), 0)
                                FROM jeevika_erp.SocMemberBill b
                                WHERE b.SocietyId = @sid 
                                  AND b.MemberId = @mid
                                  AND b.IsDeleted = FALSE 
                                  AND b.BillDate < @sdate";

                            if (isBtMaintenance)
                            {
                                sqlPrior += @"
                                  AND (
                                    b.BillTypeId = @btid 
                                    OR b.BillTypeId IS NULL 
                                    OR b.BillTypeId = 0 
                                    OR b.BillType IS NULL 
                                    OR TRIM(b.BillType) = '' 
                                    OR LOWER(TRIM(b.BillType)) = 'maintenance'
                                    OR b.BillTypeId IN (SELECT BillTypeId FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND LOWER(TRIM(BillTypeName)) = 'maintenance')
                                  )";
                            }
                            else
                            {
                                sqlPrior += @"
                                  AND (
                                    b.BillTypeId = @btid 
                                    OR (b.BillTypeId > 0 AND b.BillTypeId IN (SELECT BillTypeId FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND LOWER(TRIM(BillTypeName)) = LOWER(TRIM(@btname))))
                                    OR LOWER(TRIM(COALESCE(b.BillType, ''))) = LOWER(TRIM(@btname))
                                    OR LOWER(TRIM(COALESCE(b.BillType, ''))) LIKE '%' || LOWER(TRIM(@btname)) || '%'
                                  )";
                            }

                            cmdPrior.CommandText = sqlPrior;
                            cmdPrior.Parameters.AddWithValue("@sid", societyId);
                            cmdPrior.Parameters.AddWithValue("@mid", mem.MemberId);
                            cmdPrior.Parameters.AddWithValue("@mcode", mem.Code);
                            cmdPrior.Parameters.AddWithValue("@mflat", mem.FlatNo);
                            cmdPrior.Parameters.AddWithValue("@sdate", startDate);
                            cmdPrior.Parameters.AddWithValue("@btid", bt.BillTypeId);
                            cmdPrior.Parameters.AddWithValue("@btname", bt.BillTypeName.Trim());
                            priorDiff = Convert.ToDecimal(cmdPrior.ExecuteScalar() ?? 0);
                        }
                        ledger.OpeningBalance.TotalOpening += priorDiff;

                        // Fetch Transactions (Bills + Receipts + JVs) in date range for THIS specific bill type
                        var rawTxList = new List<(DateTime Date, string VoucherNo, string Period, string Type, decimal Principal, decimal Interest, decimal Debit, decimal Credit, int RefId)>();

                        // A. Member Bills (Splitting into Principal vs Interest)
                        using (var cmdBills = conn.CreateCommand())
                        {
                            var sqlBills = @"
                                SELECT b.BillId, b.BillNo, b.BillDate, b.Period, b.TotalAmount, b.PaidAmount, b.BillTypeId, b.BillType
                                FROM jeevika_erp.SocMemberBill b
                                WHERE b.SocietyId = @sid 
                                  AND b.MemberId = @mid
                                  AND b.IsDeleted = FALSE 
                                  AND (b.FYId = @fyid OR (b.BillDate >= @sdate AND b.BillDate <= @edate))";

                            if (isBtMaintenance)
                            {
                                sqlBills += @"
                                  AND (
                                    b.BillTypeId = @btid 
                                    OR b.BillTypeId IS NULL 
                                    OR b.BillTypeId = 0 
                                    OR b.BillType IS NULL 
                                    OR TRIM(b.BillType) = '' 
                                    OR LOWER(TRIM(b.BillType)) = 'maintenance'
                                    OR b.BillTypeId IN (SELECT BillTypeId FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND LOWER(TRIM(BillTypeName)) = 'maintenance')
                                  )";
                            }
                            else
                            {
                                sqlBills += @"
                                  AND (
                                    b.BillTypeId = @btid 
                                    OR (b.BillTypeId > 0 AND b.BillTypeId IN (SELECT BillTypeId FROM jeevika_erp.SocBillType WHERE SocietyId = @sid AND LOWER(TRIM(BillTypeName)) = LOWER(TRIM(@btname))))
                                    OR LOWER(TRIM(COALESCE(b.BillType, ''))) = LOWER(TRIM(@btname))
                                    OR LOWER(TRIM(COALESCE(b.BillType, ''))) LIKE '%' || LOWER(TRIM(@btname)) || '%'
                                  )";
                            }

                            cmdBills.CommandText = sqlBills;
                            cmdBills.Parameters.AddWithValue("@sid", societyId);
                            cmdBills.Parameters.AddWithValue("@mid", mem.MemberId);
                            cmdBills.Parameters.AddWithValue("@mcode", mem.Code);
                            cmdBills.Parameters.AddWithValue("@mflat", mem.FlatNo);
                            cmdBills.Parameters.AddWithValue("@fyid", fyId);
                            cmdBills.Parameters.AddWithValue("@sdate", startDate);
                            cmdBills.Parameters.AddWithValue("@edate", endDate);
                            cmdBills.Parameters.AddWithValue("@btid", bt.BillTypeId);
                            cmdBills.Parameters.AddWithValue("@btname", bt.BillTypeName.Trim());

                            var rawBills = new List<(int BillId, string BillNo, DateTime BillDate, string Period, decimal TotalAmt, decimal PaidAmt)>();
                            using (var rB = cmdBills.ExecuteReader())
                            {
                                while (rB.Read())
                                {
                                    rawBills.Add((
                                        Convert.ToInt32(rB["BillId"]),
                                        rB["BillNo"]?.ToString() ?? "",
                                        Convert.ToDateTime(rB["BillDate"]),
                                        rB["Period"]?.ToString() ?? "",
                                        Convert.ToDecimal(rB["TotalAmount"]),
                                        Convert.ToDecimal(rB["PaidAmount"])
                                    ));
                                }
                            }

                            foreach (var b in rawBills)
                            {
                                decimal princAmt = 0;
                                decimal intAmt = 0;

                                using (var cmdItems = conn.CreateCommand())
                                {
                                    cmdItems.CommandText = @"
                                        SELECT AccountCode, AccountName, Amount
                                        FROM jeevika_erp.SocMemberBillItem
                                        WHERE BillId = @bid";
                                    cmdItems.Parameters.AddWithValue("@bid", b.BillId);

                                    using var rI = cmdItems.ExecuteReader();
                                    while (rI.Read())
                                    {
                                        var code = rI["AccountCode"]?.ToString() ?? "";
                                        var name = rI["AccountName"]?.ToString() ?? "";
                                        var amt = Convert.ToDecimal(rI["Amount"]);

                                        if (code.Equals("INC-1008", StringComparison.OrdinalIgnoreCase) ||
                                            name.IndexOf("Interest", StringComparison.OrdinalIgnoreCase) >= 0)
                                        {
                                            intAmt += amt;
                                        }
                                        else
                                        {
                                            princAmt += amt;
                                        }
                                    }
                                }

                                // If no line items, fallback all to principal
                                if (princAmt == 0 && intAmt == 0) princAmt = b.TotalAmt;

                                rawTxList.Add((b.BillDate, b.BillNo, b.Period, "Bill", princAmt, intAmt, b.TotalAmt, 0.00m, b.BillId));

                                if (b.PaidAmt > 0)
                                {
                                    rawTxList.Add((b.BillDate, "RCPT-" + b.BillNo, b.Period, "Receipt", 0.00m, 0.00m, 0.00m, b.PaidAmt, b.BillId));
                                }
                            }
                        }

                        // B. Standalone Receipts & Vouchers from SocVoucherHeader for THIS specific bill type
                        using (var cmdRcpt = conn.CreateCommand())
                        {
                            var sqlRcpt = @"
                                SELECT vh.VoucherId, vh.VoucherNo, vh.VoucherDate, vh.VoucherType, vh.Amount, vh.Narration, vh.RefNo, vh.PersonCode, vh.PersonName, vh.Particular1, vh.Particular2
                                FROM jeevika_erp.SocVoucherHeader vh
                                WHERE vh.SocietyId = @sid AND vh.IsDeleted = FALSE
                                  AND vh.VoucherType IN ('MemberReceipt', 'MemberReceiptReversal', 'MemberDebitNote', 'MemberCreditNote', 'BillTypeTransfer', 'CreditNote', 'DebitNote', 'MemberNote', 'Receipt', 'Journal')
                                  AND vh.VoucherDate >= @sdate AND vh.VoucherDate <= @edate
                                  AND (
                                    vh.PersonCode = @mcode
                                    OR vh.PersonCode = @midStr
                                    OR vh.RefNo = @mcode
                                    OR vh.RefNo = @midStr
                                    OR vh.PersonName ILIKE @mname
                                    OR (vh.PersonName ILIKE @mflat AND vh.PersonName ILIKE @mname)
                                    OR EXISTS (
                                      SELECT 1 FROM jeevika_erp.SocMemberNote mn 
                                      WHERE mn.SocietyId = @sid AND mn.MemberId = @mid AND mn.NoteNo = vh.VoucherNo AND mn.IsDeleted = FALSE
                                    )
                                  )";

                            if (isBtMaintenance)
                            {
                                sqlRcpt += @"
                                  AND (
                                    EXISTS (
                                      SELECT 1 FROM jeevika_erp.SocMemberBill b 
                                      WHERE b.SocietyId = @sid AND (b.BillTypeId = @btid OR LOWER(b.BillType) = 'maintenance') AND b.IsDeleted = FALSE 
                                        AND (b.VoucherId = vh.VoucherId OR vh.RefNo = b.BillNo OR vh.Narration ILIKE '%' || b.BillNo || '%')
                                    )
                                    OR (
                                      (vh.Narration ILIKE '%maintenance%' OR COALESCE(vh.Particular1, '') ILIKE '%maintenance%')
                                      AND (vh.VoucherType = 'BillTypeTransfer' OR (
                                        vh.Narration NOT ILIKE '%major repair%'
                                        AND COALESCE(vh.Particular1, '') NOT ILIKE '%major repair%'
                                        AND vh.Narration NOT ILIKE '%repair%'
                                        AND COALESCE(vh.Particular1, '') NOT ILIKE '%repair%'
                                      ))
                                    )
                                    OR (
                                      vh.VoucherType = 'BillTypeTransfer'
                                      AND (vh.Narration ILIKE '%maintenance%' OR COALESCE(vh.Particular1, '') ILIKE '%maintenance%' OR COALESCE(vh.Particular2, '') ILIKE '%maintenance%' OR vh.RefNo ILIKE '%maintenance%')
                                    )
                                    OR (
                                      vh.Narration NOT ILIKE '%major repair%'
                                      AND COALESCE(vh.Particular1, '') NOT ILIKE '%major repair%'
                                      AND vh.Narration NOT ILIKE '%repair%'
                                      AND COALESCE(vh.Particular1, '') NOT ILIKE '%repair%'
                                      AND NOT EXISTS (
                                        SELECT 1 FROM jeevika_erp.SocBillType obt 
                                        WHERE (obt.SocietyId = @sid OR obt.SocietyId = 0 OR obt.SocietyId IS NULL) AND obt.BillTypeId != @btid 
                                          AND (vh.Narration ILIKE '%' || obt.BillTypeName || '%' OR COALESCE(vh.Particular1, '') ILIKE '%' || obt.BillTypeName || '%')
                                      )
                                      AND NOT EXISTS (
                                        SELECT 1 FROM jeevika_erp.SocMemberBill obill
                                        WHERE obill.SocietyId = @sid AND obill.BillTypeId != @btid AND obill.IsDeleted = FALSE
                                          AND (obill.VoucherId = vh.VoucherId OR vh.RefNo = obill.BillNo OR vh.Narration ILIKE '%' || obill.BillNo || '%')
                                      )
                                    )
                                  )";
                            }
                            else
                            {
                                sqlRcpt += @"
                                  AND (
                                    EXISTS (
                                      SELECT 1 FROM jeevika_erp.SocMemberBill b 
                                      WHERE b.SocietyId = @sid AND (b.BillTypeId = @btid OR LOWER(b.BillType) = LOWER(@btypeName)) AND b.IsDeleted = FALSE 
                                        AND (b.VoucherId = vh.VoucherId OR vh.RefNo = b.BillNo OR vh.Narration ILIKE '%' || b.BillNo || '%')
                                    )
                                    OR vh.Narration ILIKE '%' || @btypeName || '%'
                                    OR COALESCE(vh.Particular1, '') ILIKE '%' || @btypeName || '%'
                                    OR (
                                      vh.VoucherType = 'BillTypeTransfer'
                                      AND (vh.Narration ILIKE '%' || @btypeName || '%' OR COALESCE(vh.Particular1, '') ILIKE '%' || @btypeName || '%' OR COALESCE(vh.Particular2, '') ILIKE '%' || @btypeName || '%' OR vh.RefNo ILIKE '%' || @btypeName || '%')
                                    )
                                    OR (
                                      LOWER(@btypeName) LIKE '%repair%' 
                                      AND (vh.Narration ILIKE '%repair%' OR COALESCE(vh.Particular1, '') ILIKE '%repair%')
                                    )
                                  )";
                                cmdRcpt.Parameters.AddWithValue("@btypeName", bt.BillTypeName);
                            }
                            cmdRcpt.Parameters.AddWithValue("@btid", bt.BillTypeId);

                            cmdRcpt.CommandText = sqlRcpt;
                            cmdRcpt.Parameters.AddWithValue("@sid", societyId);
                            cmdRcpt.Parameters.AddWithValue("@mid", mem.MemberId);
                            cmdRcpt.Parameters.AddWithValue("@midStr", mem.MemberId.ToString());
                            cmdRcpt.Parameters.AddWithValue("@sdate", startDate);
                            cmdRcpt.Parameters.AddWithValue("@edate", endDate);
                            cmdRcpt.Parameters.AddWithValue("@mname", "%" + mem.Name + "%");
                            cmdRcpt.Parameters.AddWithValue("@mflat", "%" + mem.FlatNo + "%");
                            cmdRcpt.Parameters.AddWithValue("@mcode", mem.Code);

                            var rcptRows = new List<(int VoucherId, string VoucherNo, DateTime VoucherDate, string VoucherType, decimal Amount, string Narration, string RefNo, string Particular1, string Particular2)>();

                            using (var rR = cmdRcpt.ExecuteReader())
                            {
                                while (rR.Read())
                                {
                                    rcptRows.Add((
                                        Convert.ToInt32(rR["VoucherId"]),
                                        rR["VoucherNo"]?.ToString() ?? "",
                                        Convert.ToDateTime(rR["VoucherDate"]),
                                        rR["VoucherType"]?.ToString() ?? "Receipt",
                                        Convert.ToDecimal(rR["Amount"]),
                                        rR["Narration"]?.ToString() ?? "",
                                        rR["RefNo"]?.ToString() ?? "",
                                        rR["Particular1"]?.ToString() ?? "",
                                        rR["Particular2"]?.ToString() ?? ""
                                    ));
                                }
                            }

                            foreach (var row in rcptRows)
                            {
                                var vNo = row.VoucherNo;
                                var vDate = row.VoucherDate;
                                var vType = row.VoucherType;
                                var vAmt = row.Amount;
                                var narr = string.IsNullOrWhiteSpace(row.Narration) ? vType : row.Narration;
                                var vId = row.VoucherId;

                                if (!rawTxList.Any(t => t.VoucherNo.Equals(vNo, StringComparison.OrdinalIgnoreCase)))
                                {
                                    decimal dr = 0.00m;
                                    decimal cr = 0.00m;
                                    decimal princ = 0.00m;
                                    decimal obInt = 0.00m;
                                    string displayType = vType;

                                    if (vType.Equals("MemberDebitNote", StringComparison.OrdinalIgnoreCase) ||
                                        vType.Equals("DebitNote", StringComparison.OrdinalIgnoreCase))
                                    {
                                        dr = Math.Abs(vAmt);
                                        displayType = "Debit Note";

                                        // Resolve note principal and interest breakup from SocVoucherDetail
                                        using (var cmdDtl = conn.CreateCommand())
                                        {
                                            cmdDtl.CommandText = @"
                                                SELECT AccountCode, AccountName, Debit, Credit 
                                                FROM jeevika_erp.SocVoucherDetail 
                                                WHERE VoucherId = @vid";
                                            cmdDtl.Parameters.AddWithValue("@vid", vId);
                                            using var rDtl = cmdDtl.ExecuteReader();
                                            while (rDtl.Read())
                                            {
                                                var dName = rDtl["AccountName"]?.ToString() ?? "";
                                                var dCode = rDtl["AccountCode"]?.ToString() ?? "";
                                                decimal dDr = rDtl["Debit"] != DBNull.Value ? Convert.ToDecimal(rDtl["Debit"]) : 0;
                                                decimal dCr = rDtl["Credit"] != DBNull.Value ? Convert.ToDecimal(rDtl["Credit"]) : 0;
                                                decimal lineAmt = dDr > 0 ? dDr : dCr;
                                                if (dName.IndexOf("interest", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                    dName.IndexOf("penalty", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                    dCode.IndexOf("int", StringComparison.OrdinalIgnoreCase) >= 0)
                                                {
                                                    obInt += lineAmt;
                                                }
                                                else
                                                {
                                                    princ += lineAmt;
                                                }
                                            }
                                        }
                                        if (princ == 0 && obInt == 0) princ = dr;
                                    }
                                    else if (vType.Equals("MemberCreditNote", StringComparison.OrdinalIgnoreCase) ||
                                             vType.Equals("CreditNote", StringComparison.OrdinalIgnoreCase))
                                    {
                                        cr = Math.Abs(vAmt);
                                        displayType = "Credit Note";

                                        // Resolve note principal and interest breakup from SocVoucherDetail
                                        using (var cmdDtl = conn.CreateCommand())
                                        {
                                            cmdDtl.CommandText = @"
                                                SELECT AccountCode, AccountName, Debit, Credit 
                                                FROM jeevika_erp.SocVoucherDetail 
                                                WHERE VoucherId = @vid";
                                            cmdDtl.Parameters.AddWithValue("@vid", vId);
                                            using var rDtl = cmdDtl.ExecuteReader();
                                            while (rDtl.Read())
                                            {
                                                var dName = rDtl["AccountName"]?.ToString() ?? "";
                                                var dCode = rDtl["AccountCode"]?.ToString() ?? "";
                                                decimal dDr = rDtl["Debit"] != DBNull.Value ? Convert.ToDecimal(rDtl["Debit"]) : 0;
                                                decimal dCr = rDtl["Credit"] != DBNull.Value ? Convert.ToDecimal(rDtl["Credit"]) : 0;
                                                decimal lineAmt = dDr > 0 ? dDr : dCr;
                                                if (dName.IndexOf("interest", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                    dName.IndexOf("penalty", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                    dCode.IndexOf("int", StringComparison.OrdinalIgnoreCase) >= 0)
                                                {
                                                    obInt += lineAmt;
                                                }
                                                else
                                                {
                                                    princ += lineAmt;
                                                }
                                            }
                                        }
                                        if (princ == 0 && obInt == 0) princ = cr;
                                    }
                                    else if (vType.Equals("MemberReceipt", StringComparison.OrdinalIgnoreCase) ||
                                             vType.Equals("Receipt", StringComparison.OrdinalIgnoreCase))
                                    {
                                        cr = Math.Abs(vAmt);
                                        displayType = "Receipt";

                                        // 1. Check if Particular2 has [Bifurcation: Principal=X, Interest=Y]
                                        var p2Str = row.Particular2 ?? "";
                                        var mBif = System.Text.RegularExpressions.Regex.Match(p2Str, @"\[Bifurcation:\s*Principal=([\d\.]+),\s*Interest=([\d\.]+)\]");
                                        if (mBif.Success)
                                        {
                                            if (decimal.TryParse(mBif.Groups[1].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decimal pVal))
                                                princ = pVal;
                                            if (decimal.TryParse(mBif.Groups[2].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out decimal iVal))
                                                obInt = iVal;
                                        }

                                        // 2. Check SocVoucherDetail lines
                                        if (princ == 0 && obInt == 0)
                                        {
                                            using (var cmdDtl = conn.CreateCommand())
                                            {
                                                cmdDtl.CommandText = @"
                                                    SELECT AccountCode, AccountName, Debit, Credit, Narration
                                                    FROM jeevika_erp.SocVoucherDetail
                                                    WHERE VoucherId = @vid AND Credit > 0";
                                                cmdDtl.Parameters.AddWithValue("@vid", vId);
                                                using var rDtl = cmdDtl.ExecuteReader();
                                                while (rDtl.Read())
                                                {
                                                    var dName = rDtl["AccountName"]?.ToString() ?? "";
                                                    var dCode = rDtl["AccountCode"]?.ToString() ?? "";
                                                    var dNarr = rDtl["Narration"]?.ToString() ?? "";
                                                    decimal dCr = rDtl["Credit"] != DBNull.Value ? Convert.ToDecimal(rDtl["Credit"]) : 0;
                                                    if (dName.IndexOf("interest", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                        dNarr.IndexOf("interest", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                        dCode.IndexOf("int", StringComparison.OrdinalIgnoreCase) >= 0)
                                                    {
                                                        obInt += dCr;
                                                    }
                                                    else
                                                    {
                                                        princ += dCr;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    else if (vType.Equals("MemberReceiptReversal", StringComparison.OrdinalIgnoreCase))
                                    {
                                        dr = Math.Abs(vAmt);
                                        princ = dr;
                                        displayType = "Receipt Reversal";
                                    }
                                    else if (vType.Equals("BillTypeTransfer", StringComparison.OrdinalIgnoreCase))
                                    {
                                        bool isDebit = false;
                                        bool isCredit = false;
                                        var refStr = row.RefNo;
                                        var p1Str = row.Particular1;
                                        var p2Str = row.Particular2;
                                        var allMeta = $"{refStr} {p1Str} {p2Str} {narr}";

                                        string otherBt = "";
                                        var parts = refStr.Split('|');
                                        if (parts.Length >= 4)
                                        {
                                            if (parts[0].Trim().Equals(bt.BillTypeName, StringComparison.OrdinalIgnoreCase))
                                            {
                                                isDebit = parts[1].Trim().Equals("Dr", StringComparison.OrdinalIgnoreCase);
                                                isCredit = parts[1].Trim().Equals("Cr", StringComparison.OrdinalIgnoreCase);
                                                otherBt = parts[2].Trim();
                                            }
                                            else if (parts[2].Trim().Equals(bt.BillTypeName, StringComparison.OrdinalIgnoreCase))
                                            {
                                                isDebit = parts[3].Trim().Equals("Dr", StringComparison.OrdinalIgnoreCase);
                                                isCredit = parts[3].Trim().Equals("Cr", StringComparison.OrdinalIgnoreCase);
                                                otherBt = parts[0].Trim();
                                            }
                                        }

                                        if (!isDebit && !isCredit)
                                        {
                                            if (allMeta.IndexOf("to " + bt.BillTypeName, StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                allMeta.IndexOf("into " + bt.BillTypeName, StringComparison.OrdinalIgnoreCase) >= 0 ||
                                                allMeta.IndexOf("-> " + bt.BillTypeName, StringComparison.OrdinalIgnoreCase) >= 0)
                                            {
                                                isDebit = true;
                                            }
                                            else
                                            {
                                                isCredit = true;
                                            }
                                        }

                                        if (isDebit)
                                        {
                                            dr = Math.Abs(vAmt);
                                            princ = dr;
                                            displayType = "Transfer (In)";
                                            if (!string.IsNullOrEmpty(otherBt)) narr = $"Transfer from {otherBt}";
                                        }
                                        else
                                        {
                                            cr = Math.Abs(vAmt);
                                            princ = cr;
                                            displayType = "Transfer (Out)";
                                            if (!string.IsNullOrEmpty(otherBt)) narr = $"Transfer to {otherBt}";
                                        }
                                    }
                                    else if (vType.Equals("Journal", StringComparison.OrdinalIgnoreCase))
                                    {
                                        if (vAmt < 0) { dr = Math.Abs(vAmt); princ = dr; }
                                        else { cr = Math.Abs(vAmt); }
                                        displayType = "Journal";
                                    }
                                    else
                                    {
                                        cr = Math.Abs(vAmt);
                                        displayType = vType;
                                    }

                                    rawTxList.Add((vDate, vNo, narr, displayType, princ, obInt, dr, cr, vId));
                                }
                            }
                        }

                        // In 'All Bill Types' view, skip custom bill types that have 0 opening balance and 0 transactions
                        if (!isSpecificBillType && !isBtMaintenance && ledger.OpeningBalance.TotalOpening == 0 && rawTxList.Count == 0)
                        {
                            continue;
                        }

                        // Sort Transactions Chronologically
                        rawTxList = rawTxList.OrderBy(t => t.Date)
                            .ThenBy(t => t.Type == "Bill" ? 0 
                                       : t.Type.Contains("Debit Note", StringComparison.OrdinalIgnoreCase) ? 1 
                                       : (t.Type == "Receipt" || t.Type == "Transfer (Out)") ? 2 
                                       : t.Type.Contains("Reversal", StringComparison.OrdinalIgnoreCase) ? 3 
                                       : t.Type.Contains("Credit Note", StringComparison.OrdinalIgnoreCase) ? 4 
                                       : 5)
                            .ThenBy(t => t.RefId)
                            .ToList();

                        var txList = new List<TransactionDto>();
                        decimal runningBal = ledger.OpeningBalance.TotalOpening;
                        decimal curAccPrinc = ledger.OpeningBalance.Principal;
                        decimal curAccInt = ledger.OpeningBalance.Interest;

                        if (runningBal <= 0)
                        {
                            curAccPrinc = 0.00m;
                            curAccInt = 0.00m;
                        }

                        foreach (var tx in rawTxList)
                        {
                            runningBal += (tx.Debit - tx.Credit);

                            decimal displayPrinc = tx.Principal;
                            decimal displayInt = tx.Interest;

                            if (tx.Debit > 0)
                            {
                                if (tx.Principal > 0 || tx.Interest > 0)
                                {
                                    curAccPrinc += tx.Principal;
                                    curAccInt += tx.Interest;
                                }
                                else
                                {
                                    curAccPrinc += tx.Debit;
                                }
                            }

                            if (tx.Credit > 0)
                            {
                                if ((tx.Type.Contains("Credit Note", StringComparison.OrdinalIgnoreCase) || tx.Type.Contains("Receipt", StringComparison.OrdinalIgnoreCase)) && (tx.Principal > 0 || tx.Interest > 0))
                                {
                                    curAccPrinc = Math.Max(0, curAccPrinc - tx.Principal);
                                    curAccInt   = Math.Max(0, curAccInt - tx.Interest);

                                    decimal specifiedTotal = tx.Principal + tx.Interest;
                                    if (tx.Credit > specifiedTotal)
                                    {
                                        decimal extraCredit = tx.Credit - specifiedTotal;
                                        bool isPrincipalFirst = bt.PriorityOrder.Equals("Principal First", StringComparison.OrdinalIgnoreCase);
                                        if (isPrincipalFirst)
                                        {
                                            decimal dP = Math.Min(curAccPrinc, extraCredit);
                                            curAccPrinc -= dP;
                                            extraCredit -= dP;
                                            decimal dI = Math.Min(curAccInt, extraCredit);
                                            curAccInt -= dI;
                                        }
                                        else
                                        {
                                            decimal dI = Math.Min(curAccInt, extraCredit);
                                            curAccInt -= dI;
                                            extraCredit -= dI;
                                            decimal dP = Math.Min(curAccPrinc, extraCredit);
                                            curAccPrinc -= dP;
                                        }
                                    }
                                }
                                else
                                {
                                    decimal remCredit = tx.Credit;
                                    bool isPrincipalFirst = bt.PriorityOrder.Equals("Principal First", StringComparison.OrdinalIgnoreCase);

                                    decimal deductedPrinc = 0;
                                    decimal deductedInt = 0;

                                    if (isPrincipalFirst)
                                    {
                                        if (curAccPrinc > 0)
                                        {
                                            if (remCredit <= curAccPrinc)
                                            {
                                                deductedPrinc = remCredit;
                                                curAccPrinc -= remCredit;
                                                remCredit = 0;
                                            }
                                            else
                                            {
                                                deductedPrinc = curAccPrinc;
                                                remCredit -= curAccPrinc;
                                                curAccPrinc = 0;
                                                deductedInt = remCredit;
                                                curAccInt = Math.Max(0, curAccInt - remCredit);
                                            }
                                        }
                                        else
                                        {
                                            deductedInt = remCredit;
                                            curAccInt = Math.Max(0, curAccInt - remCredit);
                                        }
                                    }
                                    else
                                    {
                                        if (curAccInt > 0)
                                        {
                                            if (remCredit <= curAccInt)
                                            {
                                                deductedInt = remCredit;
                                                curAccInt -= remCredit;
                                                remCredit = 0;
                                            }
                                            else
                                            {
                                                deductedInt = curAccInt;
                                                remCredit -= curAccInt;
                                                curAccInt = 0;
                                                deductedPrinc = remCredit;
                                                curAccPrinc = Math.Max(0, curAccPrinc - remCredit);
                                            }
                                        }
                                        else
                                        {
                                            deductedPrinc = remCredit;
                                            curAccPrinc = Math.Max(0, curAccPrinc - remCredit);
                                        }
                                    }

                                    if (displayPrinc == 0 && displayInt == 0)
                                    {
                                        displayPrinc = deductedPrinc;
                                        displayInt = deductedInt;
                                    }
                                }
                            }

                            // Keep curAccPrinc and curAccInt strictly aligned with running balance
                            if (runningBal <= 0)
                            {
                                curAccPrinc = 0.00m;
                                curAccInt = 0.00m;
                            }
                            else
                            {
                                if (bt.PriorityOrder.Equals("Principal First", StringComparison.OrdinalIgnoreCase))
                                {
                                    curAccPrinc = Math.Min(runningBal, Math.Max(0, curAccPrinc));
                                    curAccInt = Math.Max(0, runningBal - curAccPrinc);
                                }
                                else
                                {
                                    curAccInt = Math.Min(runningBal, Math.Max(0, curAccInt));
                                    curAccPrinc = Math.Max(0, runningBal - curAccInt);
                                }
                            }

                            txList.Add(new TransactionDto
                            {
                                VoucherDate = tx.Date.ToString("yyyy-MM-dd"),
                                VoucherNo = tx.VoucherNo,
                                Period = tx.Period,
                                VoucherType = tx.Type,
                                PrincipalAmount = displayPrinc,
                                InterestAmount = displayInt,
                                TotalDebit = tx.Debit,
                                TotalCredit = tx.Credit,
                                RunningBalance = runningBal
                            });
                        }

                        decimal grandDr = txList.Sum(t => t.TotalDebit);
                        decimal grandCr = txList.Sum(t => t.TotalCredit);

                        decimal finalPrinc = 0.00m;
                        decimal finalInt = 0.00m;
                        if (runningBal > 0)
                        {
                            if (bt.PriorityOrder.Equals("Principal First", StringComparison.OrdinalIgnoreCase))
                            {
                                finalPrinc = Math.Min(runningBal, Math.Max(0, curAccPrinc));
                                finalInt = Math.Max(0, runningBal - finalPrinc);
                            }
                            else
                            {
                                finalInt = Math.Min(runningBal, Math.Max(0, curAccInt));
                                finalPrinc = Math.Max(0, runningBal - finalInt);
                            }
                        }

                        ledger.Transactions = txList;
                        ledger.ClosingBalance = new ClosingBalanceDto
                        {
                            TotalPrincipal = finalPrinc,
                            TotalInterest = finalInt,
                            GrandTotalDebit = grandDr,
                            GrandTotalCredit = grandCr,
                            NetClosingBalance = runningBal
                        };

                        memberRegisters.Add(ledger);
                    }
                }

                return Ok(new
                {
                    success = true,
                    societyName,
                    billTypeName,
                    fyLabel,
                    startDate = startDate.ToString("yyyy-MM-dd"),
                    endDate = endDate.ToString("yyyy-MM-dd"),
                    memberRegisters
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // ── 1. BILL FORMAT — GST INVOICE (A4) ───────────────────────
        // ═══════════════════════════════════════════════════════════
        [HttpGet("bill-format/gst-a4")]
        public IActionResult GetGstBillFormat(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? fromMemberCode,
            [FromQuery] string? toMemberCode,
            [FromQuery] string? billDateFrom,
            [FromQuery] string? billDateTo,
            [FromQuery] string? receiptDateFrom,
            [FromQuery] string? receiptDateTo,
            [FromQuery] string? emailFilter)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(emailFilter)) emailFilter = "all";
                using var conn = DbHelper.GetConn();

                if (societyId <= 0)
                {
                    using var cmdDefSoc = conn.CreateCommand();
                    cmdDefSoc.CommandText = "SELECT SocietyId FROM jeevika_erp.SocietyInfo WHERE IsActive = TRUE ORDER BY SocietyId ASC LIMIT 1";
                    var sRes = cmdDefSoc.ExecuteScalar();
                    societyId = (sRes != null && sRes != DBNull.Value) ? Convert.ToInt32(sRes) : 1;
                }

                // Resolve Financial Year Bounds if not passed
                DateTime? bFrom = null;
                DateTime? bTo = null;
                if (!string.IsNullOrWhiteSpace(billDateFrom) && DateTime.TryParse(billDateFrom, out var parsedFrom)) bFrom = parsedFrom;
                if (!string.IsNullOrWhiteSpace(billDateTo) && DateTime.TryParse(billDateTo, out var parsedTo)) bTo = parsedTo;

                if (!bFrom.HasValue || !bTo.HasValue)
                {
                    using var cmdFy = conn.CreateCommand();
                    cmdFy.CommandText = @"
                        SELECT FYStart, FYEnd FROM jeevika_erp.FinancialYear 
                        WHERE (SocietyId = @sid OR @sid <= 0) AND (FYId = @fyid OR @fyid <= 0)
                        ORDER BY FYStart DESC LIMIT 1";
                    cmdFy.Parameters.AddWithValue("@sid", societyId);
                    cmdFy.Parameters.AddWithValue("@fyid", fyId);
                    using var rFy = cmdFy.ExecuteReader();
                    if (rFy.Read())
                    {
                        if (!bFrom.HasValue && rFy["FYStart"] != DBNull.Value) bFrom = Convert.ToDateTime(rFy["FYStart"]);
                        if (!bTo.HasValue && rFy["FYEnd"] != DBNull.Value) bTo = Convert.ToDateTime(rFy["FYEnd"]);
                    }
                }

                // Society Meta
                var societyObj = GetSocietyMetaDictionary(conn, societyId);
                decimal cgstRate = Convert.ToDecimal(societyObj.GetValueOrDefault("cgstPct", 9m));
                decimal sgstRate = Convert.ToDecimal(societyObj.GetValueOrDefault("sgstPct", 9m));
                bool isGstApp = Convert.ToBoolean(societyObj.GetValueOrDefault("gstApplicable", true));

                // Fetch Bills & Members
                var billsList = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    var sql = @"
                        SELECT b.BillId, b.BillNo, b.BillDate, b.DueDate, b.Period,
                               b.PrincipalAmount, b.InterestAmount, b.TotalAmount, b.BalanceAmount,
                               m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo, m.Floor, m.Building, m.AreaSqFt, m.Email
                        FROM jeevika_erp.SocMemberBill b
                        JOIN jeevika_erp.SocMember m ON b.MemberId = m.MemberId
                        WHERE (b.SocietyId = @sid OR (@sid <= 0 AND b.SocietyId > 0))
                          AND b.IsDeleted = FALSE";

                    if (bFrom.HasValue)
                    {
                        sql += " AND b.BillDate >= @bFrom";
                        cmd.Parameters.AddWithValue("@bFrom", bFrom.Value);
                    }
                    if (bTo.HasValue)
                    {
                        sql += " AND b.BillDate <= @bTo";
                        cmd.Parameters.AddWithValue("@bTo", bTo.Value);
                    }

                    if (!string.IsNullOrWhiteSpace(fromMemberCode) && !string.IsNullOrWhiteSpace(toMemberCode))
                    {
                        sql += " AND m.MemCode >= @fromMem AND m.MemCode <= @toMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                        cmd.Parameters.AddWithValue("@toMem", toMemberCode.Trim());
                    }
                    else if (!string.IsNullOrWhiteSpace(fromMemberCode))
                    {
                        sql += " AND m.MemCode = @fromMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                    }

                    if (emailFilter?.ToLower() == "blank")
                    {
                        sql += " AND (m.Email IS NULL OR TRIM(m.Email) = '')";
                    }
                    else if (emailFilter?.ToLower() == "non-blank")
                    {
                        sql += " AND (m.Email IS NOT NULL AND TRIM(m.Email) <> '')";
                    }

                    sql += " ORDER BY m.Wing, m.FlatNo, m.MemCode, b.BillDate ASC, b.BillId ASC";
                    cmd.CommandText = sql;
                    cmd.Parameters.AddWithValue("@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    var rawBills = new List<(int BillId, string BillNo, DateTime BillDate, DateTime? DueDate, string Period, decimal Principal, decimal Interest, decimal Total, int MemberId, string MemCode, string MemName, string Wing, string FlatNo, string Floor, string Building, decimal Area)>();

                    while (r.Read())
                    {
                        rawBills.Add((
                            Convert.ToInt32(r["BillId"]),
                            r["BillNo"]?.ToString() ?? "",
                            Convert.ToDateTime(r["BillDate"]),
                            r["DueDate"] != DBNull.Value ? Convert.ToDateTime(r["DueDate"]) : null,
                            r["Period"]?.ToString() ?? "",
                            Convert.ToDecimal(r["PrincipalAmount"]),
                            Convert.ToDecimal(r["InterestAmount"]),
                            Convert.ToDecimal(r["TotalAmount"]),
                            Convert.ToInt32(r["MemberId"]),
                            r["MemCode"]?.ToString() ?? "",
                            r["MemName"]?.ToString() ?? "",
                            r["Wing"]?.ToString() ?? "",
                            r["FlatNo"]?.ToString() ?? "",
                            r["Floor"]?.ToString() ?? "FIRST",
                            r["Building"]?.ToString() ?? "",
                            r["AreaSqFt"] != DBNull.Value ? Convert.ToDecimal(r["AreaSqFt"]) : 0m
                        ));
                    }
                    r.Close();

                    foreach (var bill in rawBills)
                    {
                        var nonGstItems = new List<(string head, decimal amount)>();
                        var exemptItems = new List<(string head, decimal amount)>();
                        var taxableItems = new List<(string head, decimal amount)>();

                        using (var itemCmd = conn.CreateCommand())
                        {
                            itemCmd.CommandText = @"
                                SELECT ItemId, AccountCode, AccountName, Amount 
                                FROM jeevika_erp.SocMemberBillItem 
                                WHERE BillId = @bid 
                                ORDER BY ItemId ASC";
                            itemCmd.Parameters.AddWithValue("@bid", bill.BillId);
                            using var rItem = itemCmd.ExecuteReader();
                            while (rItem.Read())
                            {
                                var accName = rItem["AccountName"]?.ToString() ?? "Charge";
                                var amt = Convert.ToDecimal(rItem["Amount"]);
                                var accLower = accName.ToLower();

                                if (accLower.Contains("sinking") || accLower.Contains("share capital") || accLower.Contains("interest") || accLower.Contains("reserve") || accLower.Contains("non-gst"))
                                {
                                    nonGstItems.Add((accName, amt));
                                }
                                else if (accLower.Contains("tax") || accLower.Contains("water") || accLower.Contains("insurance") || accLower.Contains("municipal") || accLower.Contains("exempt"))
                                {
                                    exemptItems.Add((accName, amt));
                                }
                                else
                                {
                                    if (isGstApp) taxableItems.Add((accName, amt));
                                    else exemptItems.Add((accName, amt));
                                }
                            }
                        }

                        // Fallback if no itemized breakdown exists in database
                        if (nonGstItems.Count == 0 && exemptItems.Count == 0 && taxableItems.Count == 0)
                        {
                            if (isGstApp)
                            {
                                taxableItems.Add(("Maintenance Charges", bill.Principal));
                            }
                            else
                            {
                                exemptItems.Add(("Maintenance Charges", bill.Principal));
                            }
                            if (bill.Interest > 0)
                            {
                                nonGstItems.Add(("Interest on Arrears", bill.Interest));
                            }
                        }

                        decimal subNonGst = nonGstItems.Sum(x => x.amount);
                        decimal subExempt = exemptItems.Sum(x => x.amount);
                        decimal subTaxable = taxableItems.Sum(x => x.amount);

                        decimal cgstAmt = isGstApp ? Math.Round(subTaxable * (cgstRate / 100m), 2) : 0m;
                        decimal sgstAmt = isGstApp ? Math.Round(subTaxable * (sgstRate / 100m), 2) : 0m;
                        decimal totGstPlusTax = subTaxable + cgstAmt + sgstAmt;
                        decimal totNonGstPlusExempt = subNonGst + subExempt;
                        decimal currentBillAmt = totGstPlusTax + totNonGstPlusExempt;
                        if (currentBillAmt == 0m && bill.Total > 0m) currentBillAmt = bill.Total;

                        // Calculate Arrears prior to this bill
                        decimal arrPrin = 0m;
                        decimal arrInt = 0m;
                        using (var arrCmd = conn.CreateCommand())
                        {
                            arrCmd.CommandText = @"
                                SELECT 
                                    COALESCE(SUM(b2.PrincipalAmount), 0) - COALESCE((
                                        SELECT SUM(vh.Amount) FROM jeevika_erp.SocVoucherHeader vh
                                        WHERE vh.SocietyId = @sid AND vh.VoucherType IN ('MemberReceipt', 'Receipt')
                                          AND (vh.PersonCode = @mcode OR vh.RefNo = @mcode)
                                          AND vh.VoucherDate < @bdate AND vh.IsDeleted = FALSE
                                    ), 0) AS NetPrinArrears,
                                    COALESCE(SUM(b2.InterestAmount), 0) AS NetIntArrears
                                FROM jeevika_erp.SocMemberBill b2
                                WHERE b2.SocietyId = @sid AND b2.MemberId = @mid AND b2.BillDate < @bdate AND b2.IsDeleted = FALSE";
                            arrCmd.Parameters.AddWithValue("@sid", societyId);
                            arrCmd.Parameters.AddWithValue("@mid", bill.MemberId);
                            arrCmd.Parameters.AddWithValue("@mcode", bill.MemCode);
                            arrCmd.Parameters.AddWithValue("@bdate", bill.BillDate);
                            using var rArr = arrCmd.ExecuteReader();
                            if (rArr.Read())
                            {
                                arrPrin = Math.Max(0m, Convert.ToDecimal(rArr["NetPrinArrears"]));
                                arrInt = Math.Max(0m, Convert.ToDecimal(rArr["NetIntArrears"]));
                            }
                        }

                        decimal arrTotal = arrPrin + arrInt;
                        decimal netPayable = currentBillAmt + arrTotal;

                        billsList.Add(new
                        {
                            member = new
                            {
                                code = bill.MemCode,
                                name = bill.MemName,
                                flatNo = bill.FlatNo,
                                floor = bill.Floor,
                                building = bill.Building,
                                wing = bill.Wing,
                                area = bill.Area
                            },
                            bill = new
                            {
                                billNo = bill.BillNo,
                                dueDate = bill.DueDate?.ToString("yyyy-MM-dd") ?? "",
                                billDate = bill.BillDate.ToString("yyyy-MM-dd"),
                                month = !string.IsNullOrWhiteSpace(bill.Period) ? bill.Period : bill.BillDate.ToString("MMM-yyyy").ToUpper()
                            },
                            nonGstItems = nonGstItems.Select(x => new { head = x.head, amount = x.amount }).ToList(),
                            exemptItems = exemptItems.Select(x => new { head = x.head, amount = x.amount }).ToList(),
                            taxableItems = taxableItems.Select(x => new { head = x.head, amount = x.amount }).ToList(),
                            summary = new
                            {
                                subtotalNonGst = subNonGst,
                                subtotalExempt = subExempt,
                                subtotalTaxable = subTaxable,
                                cgst = cgstAmt,
                                sgst = sgstAmt,
                                totalGstHeadPlusTax = totGstPlusTax,
                                totalNonGstPlusExempt = totNonGstPlusExempt,
                                currentBill = currentBillAmt,
                                arrearsPrin = arrPrin,
                                arrearsInt = arrInt,
                                arrearsTotal = arrTotal,
                                netPayable = netPayable
                            }
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    society = societyObj,
                    bills = billsList
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // ── 2. MEMBER RECEIPT REPORT ────────────────────────────────
        // ═══════════════════════════════════════════════════════════
        [HttpGet("receipt-number-bounds")]
        public IActionResult GetReceiptNumberBounds([FromQuery] int societyId, [FromQuery] int fyId)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT 
                        MIN(NULLIF(REGEXP_REPLACE(VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT) AS MinNo,
                        MAX(NULLIF(REGEXP_REPLACE(VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT) AS MaxNo
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE (SocietyId = @sid OR (@sid <= 0 AND SocietyId > 0))
                      AND VoucherType IN ('MemberReceipt', 'Receipt')
                      AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@sid", societyId);
                using var r = cmd.ExecuteReader();
                long minNo = 1;
                long maxNo = 999999;
                if (r.Read())
                {
                    if (r["MinNo"] != DBNull.Value) minNo = Convert.ToInt64(r["MinNo"]);
                    if (r["MaxNo"] != DBNull.Value) maxNo = Convert.ToInt64(r["MaxNo"]);
                }
                return Ok(new { success = true, minReceiptNo = minNo, maxReceiptNo = maxNo });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("receipt-print")]
        public IActionResult GetReceiptPrint(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? fromReceiptNo,
            [FromQuery] string? toReceiptNo,
            [FromQuery] string? fromDate,
            [FromQuery] string? toDate,
            [FromQuery] string? fromMemberCode,
            [FromQuery] string? toMemberCode,
            [FromQuery] string? indexBy,
            [FromQuery] string? printBldgWing,
            [FromQuery] string? newPageEach,
            [FromQuery] string? emailFilter)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(indexBy)) indexBy = "Numberwise";
                if (string.IsNullOrWhiteSpace(printBldgWing)) printBldgWing = "No";
                if (string.IsNullOrWhiteSpace(newPageEach)) newPageEach = "No";
                if (string.IsNullOrWhiteSpace(emailFilter)) emailFilter = "all";
                using var conn = DbHelper.GetConn();

                if (societyId <= 0)
                {
                    using var cmdDefSoc = conn.CreateCommand();
                    cmdDefSoc.CommandText = "SELECT SocietyId FROM jeevika_erp.SocietyInfo WHERE IsActive = TRUE ORDER BY SocietyId ASC LIMIT 1";
                    var sRes = cmdDefSoc.ExecuteScalar();
                    societyId = (sRes != null && sRes != DBNull.Value) ? Convert.ToInt32(sRes) : 1;
                }

                var societyObj = GetSocietyMetaDictionary(conn, societyId);

                DateTime? fDate = null;
                DateTime? tDate = null;
                if (!string.IsNullOrWhiteSpace(fromDate) && DateTime.TryParse(fromDate, out var pd1)) fDate = pd1;
                if (!string.IsNullOrWhiteSpace(toDate) && DateTime.TryParse(toDate, out var pd2)) tDate = pd2;

                long? fromNo = null;
                long? toNo = null;
                if (!string.IsNullOrWhiteSpace(fromReceiptNo) && long.TryParse(System.Text.RegularExpressions.Regex.Replace(fromReceiptNo, @"[^\d]", ""), out var fn)) fromNo = fn;
                if (!string.IsNullOrWhiteSpace(toReceiptNo) && long.TryParse(System.Text.RegularExpressions.Regex.Replace(toReceiptNo, @"[^\d]", ""), out var tn)) toNo = tn;

                var receipts = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    var sql = @"
                        SELECT vh.VoucherId, vh.VoucherNo, vh.VoucherDate, vh.Amount, vh.CashBankCode, vh.CashBankName,
                               vh.ChqNo, vh.ChqDate, vh.BankName, vh.PersonName, vh.PersonCode, vh.RefNo, vh.Narration, vh.Particular1, vh.Particular2,
                               m.MemberId, m.MemCode, m.MemName, m.Building, m.Wing, m.FlatNo, m.Email
                        FROM jeevika_erp.SocVoucherHeader vh
                        LEFT JOIN jeevika_erp.SocMember m 
                               ON (vh.PersonCode = m.MemCode OR vh.PersonCode = CAST(m.MemberId AS VARCHAR) OR vh.RefNo = m.MemCode OR vh.PersonName = m.MemName)
                              AND (m.SocietyId = vh.SocietyId OR m.SocietyId = 1) AND m.IsDeleted = FALSE
                        WHERE (vh.SocietyId = @sid OR (@sid <= 0 AND vh.SocietyId > 0))
                          AND vh.VoucherType IN ('MemberReceipt', 'Receipt')
                          AND vh.IsDeleted = FALSE";

                    if (fDate.HasValue)
                    {
                        sql += " AND vh.VoucherDate >= @fDate";
                        cmd.Parameters.AddWithValue("@fDate", fDate.Value);
                    }
                    if (tDate.HasValue)
                    {
                        sql += " AND vh.VoucherDate <= @tDate";
                        cmd.Parameters.AddWithValue("@tDate", tDate.Value);
                    }

                    if (fromNo.HasValue && toNo.HasValue)
                    {
                        sql += " AND NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT >= @fromNo AND NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT <= @toNo";
                        cmd.Parameters.AddWithValue("@fromNo", fromNo.Value);
                        cmd.Parameters.AddWithValue("@toNo", toNo.Value);
                    }

                    if (!string.IsNullOrWhiteSpace(fromMemberCode) && !string.IsNullOrWhiteSpace(toMemberCode))
                    {
                        sql += " AND COALESCE(m.MemCode, vh.PersonCode) >= @fromMem AND COALESCE(m.MemCode, vh.PersonCode) <= @toMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                        cmd.Parameters.AddWithValue("@toMem", toMemberCode.Trim());
                    }
                    else if (!string.IsNullOrWhiteSpace(fromMemberCode))
                    {
                        sql += " AND COALESCE(m.MemCode, vh.PersonCode) = @fromMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                    }

                    if (emailFilter?.ToLower() == "blank")
                    {
                        sql += " AND (m.Email IS NULL OR TRIM(m.Email) = '')";
                    }
                    else if (emailFilter?.ToLower() == "non-blank")
                    {
                        sql += " AND (m.Email IS NOT NULL AND TRIM(m.Email) <> '')";
                    }

                    if (indexBy?.ToLower() == "memberwise")
                    {
                        sql += " ORDER BY m.MemCode ASC, vh.VoucherDate ASC, vh.VoucherId ASC";
                    }
                    else
                    {
                        sql += " ORDER BY NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT ASC, vh.VoucherDate ASC, vh.VoucherId ASC";
                    }

                    cmd.CommandText = sql;
                    cmd.Parameters.AddWithValue("@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        var chqNo = r["ChqNo"]?.ToString() ?? "";
                        var cbName = r["CashBankName"]?.ToString() ?? "";
                        var cbCode = r["CashBankCode"]?.ToString() ?? "";
                        string paymentMode = "Cheque";
                        if (!string.IsNullOrWhiteSpace(chqNo)) paymentMode = "Cheque";
                        else if (cbName.ToLower().Contains("cash") || cbCode.ToLower().Contains("cash")) paymentMode = "Cash";
                        else paymentMode = "Online Transfer";

                        var vDate = Convert.ToDateTime(r["VoucherDate"]);
                        var chqDate = r["ChqDate"] != DBNull.Value ? Convert.ToDateTime(r["ChqDate"]).ToString("yyyy-MM-dd") : "";
                        var personName = r["MemName"]?.ToString();
                        if (string.IsNullOrWhiteSpace(personName)) personName = r["PersonName"]?.ToString() ?? "";
                        var personCode = r["MemCode"]?.ToString();
                        if (string.IsNullOrWhiteSpace(personCode)) personCode = r["PersonCode"]?.ToString() ?? "";

                        var refNo = r["RefNo"]?.ToString() ?? "";
                        var part1 = r["Particular1"]?.ToString() ?? "";

                        receipts.Add(new
                        {
                            receiptNo = r["VoucherNo"]?.ToString() ?? "",
                            receiptDate = vDate.ToString("yyyy-MM-dd"),
                            amount = Convert.ToDecimal(r["Amount"]),
                            paymentMode = paymentMode,
                            chequeNo = chqNo,
                            chequeDate = chqDate,
                            bankName = r["BankName"]?.ToString() ?? cbName,
                            branchName = "",
                            transactionRef = refNo,
                            member = new
                            {
                                code = personCode,
                                name = personName,
                                building = r["Building"]?.ToString() ?? "",
                                wing = r["Wing"]?.ToString() ?? "",
                                flatNo = r["FlatNo"]?.ToString() ?? "",
                                email = r["Email"]?.ToString() ?? ""
                            },
                            againstBill = new
                            {
                                billNo = !string.IsNullOrWhiteSpace(refNo) ? refNo : (part1.Contains("BILL") ? part1 : ""),
                                billDate = ""
                            }
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    society = societyObj,
                    receipts
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // ── 3. DEBIT NOTE REPORT ────────────────────────────────────
        // ═══════════════════════════════════════════════════════════
        [HttpGet("debit-note-number-bounds")]
        public IActionResult GetDebitNoteNumberBounds([FromQuery] int societyId, [FromQuery] int fyId)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT 
                        MIN(NULLIF(REGEXP_REPLACE(VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT) AS MinNo,
                        MAX(NULLIF(REGEXP_REPLACE(VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT) AS MaxNo
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE (SocietyId = @sid OR (@sid <= 0 AND SocietyId > 0))
                      AND VoucherType IN ('MemberDebitNote', 'DebitNote')
                      AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@sid", societyId);
                using var r = cmd.ExecuteReader();
                long minNo = 1;
                long maxNo = 999999;
                if (r.Read())
                {
                    if (r["MinNo"] != DBNull.Value) minNo = Convert.ToInt64(r["MinNo"]);
                    if (r["MaxNo"] != DBNull.Value) maxNo = Convert.ToInt64(r["MaxNo"]);
                }
                return Ok(new { success = true, minNoteNo = minNo, maxNoteNo = maxNo });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("debit-note-print")]
        public IActionResult GetDebitNotePrint(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? formatType,
            [FromQuery] string? fromNo,
            [FromQuery] string? toNo,
            [FromQuery] string? fromDate,
            [FromQuery] string? toDate,
            [FromQuery] string? fromMemberCode,
            [FromQuery] string? toMemberCode,
            [FromQuery] string? emailFilter)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(formatType)) formatType = "FullPage14";
                if (string.IsNullOrWhiteSpace(emailFilter)) emailFilter = "all";
                using var conn = DbHelper.GetConn();

                if (societyId <= 0)
                {
                    using var cmdDefSoc = conn.CreateCommand();
                    cmdDefSoc.CommandText = "SELECT SocietyId FROM jeevika_erp.SocietyInfo WHERE IsActive = TRUE ORDER BY SocietyId ASC LIMIT 1";
                    var sRes = cmdDefSoc.ExecuteScalar();
                    societyId = (sRes != null && sRes != DBNull.Value) ? Convert.ToInt32(sRes) : 1;
                }

                var societyObj = GetSocietyMetaDictionary(conn, societyId);

                DateTime? fDate = null;
                DateTime? tDate = null;
                if (!string.IsNullOrWhiteSpace(fromDate) && DateTime.TryParse(fromDate, out var pd1)) fDate = pd1;
                if (!string.IsNullOrWhiteSpace(toDate) && DateTime.TryParse(toDate, out var pd2)) tDate = pd2;

                long? nFrom = null;
                long? nTo = null;
                if (!string.IsNullOrWhiteSpace(fromNo) && long.TryParse(System.Text.RegularExpressions.Regex.Replace(fromNo, @"[^\d]", ""), out var fn)) nFrom = fn;
                if (!string.IsNullOrWhiteSpace(toNo) && long.TryParse(System.Text.RegularExpressions.Regex.Replace(toNo, @"[^\d]", ""), out var tn)) nTo = tn;

                var notes = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    var sql = @"
                        SELECT vh.VoucherId, vh.VoucherNo, vh.VoucherDate, vh.Amount,
                               vh.PersonName, vh.PersonCode, vh.RefNo, vh.Narration, vh.Particular1, vh.Particular2,
                               m.MemberId, m.MemCode, m.MemName, m.Building, m.Wing, m.FlatNo, m.AreaSqFt, m.Email
                        FROM jeevika_erp.SocVoucherHeader vh
                        LEFT JOIN jeevika_erp.SocMember m 
                               ON (vh.PersonCode = m.MemCode OR vh.PersonCode = CAST(m.MemberId AS VARCHAR) OR vh.RefNo = m.MemCode OR vh.PersonName = m.MemName)
                              AND (m.SocietyId = vh.SocietyId OR m.SocietyId = 1) AND m.IsDeleted = FALSE
                        WHERE (vh.SocietyId = @sid OR (@sid <= 0 AND vh.SocietyId > 0))
                          AND vh.VoucherType IN ('MemberDebitNote', 'DebitNote')
                          AND vh.IsDeleted = FALSE";

                    if (fDate.HasValue)
                    {
                        sql += " AND vh.VoucherDate >= @fDate";
                        cmd.Parameters.AddWithValue("@fDate", fDate.Value);
                    }
                    if (tDate.HasValue)
                    {
                        sql += " AND vh.VoucherDate <= @tDate";
                        cmd.Parameters.AddWithValue("@tDate", tDate.Value);
                    }

                    if (nFrom.HasValue && nTo.HasValue)
                    {
                        sql += " AND NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT >= @nFrom AND NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT <= @nTo";
                        cmd.Parameters.AddWithValue("@nFrom", nFrom.Value);
                        cmd.Parameters.AddWithValue("@nTo", nTo.Value);
                    }

                    if (!string.IsNullOrWhiteSpace(fromMemberCode) && !string.IsNullOrWhiteSpace(toMemberCode))
                    {
                        sql += " AND COALESCE(m.MemCode, vh.PersonCode) >= @fromMem AND COALESCE(m.MemCode, vh.PersonCode) <= @toMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                        cmd.Parameters.AddWithValue("@toMem", toMemberCode.Trim());
                    }
                    else if (!string.IsNullOrWhiteSpace(fromMemberCode))
                    {
                        sql += " AND COALESCE(m.MemCode, vh.PersonCode) = @fromMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                    }

                    if (emailFilter?.ToLower() == "blank")
                    {
                        sql += " AND (m.Email IS NULL OR TRIM(m.Email) = '')";
                    }
                    else if (emailFilter?.ToLower() == "non-blank")
                    {
                        sql += " AND (m.Email IS NOT NULL AND TRIM(m.Email) <> '')";
                    }

                    sql += " ORDER BY NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT ASC, vh.VoucherDate ASC, vh.VoucherId ASC";
                    cmd.CommandText = sql;
                    cmd.Parameters.AddWithValue("@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    var rawNotes = new List<(int VoucherId, string VoucherNo, DateTime Date, decimal Amount, string PersonCode, string PersonName, string RefNo, string Narration, string Part1, string MemCode, string MemName, string Building, string Wing, string FlatNo, decimal Area)>();

                    while (r.Read())
                    {
                        rawNotes.Add((
                            Convert.ToInt32(r["VoucherId"]),
                            r["VoucherNo"]?.ToString() ?? "",
                            Convert.ToDateTime(r["VoucherDate"]),
                            Convert.ToDecimal(r["Amount"]),
                            r["PersonCode"]?.ToString() ?? "",
                            r["PersonName"]?.ToString() ?? "",
                            r["RefNo"]?.ToString() ?? "",
                            r["Narration"]?.ToString() ?? "",
                            r["Particular1"]?.ToString() ?? "",
                            r["MemCode"]?.ToString() ?? r["PersonCode"]?.ToString() ?? "",
                            r["MemName"]?.ToString() ?? r["PersonName"]?.ToString() ?? "",
                            r["Building"]?.ToString() ?? "",
                            r["Wing"]?.ToString() ?? "",
                            r["FlatNo"]?.ToString() ?? "",
                            r["AreaSqFt"] != DBNull.Value ? Convert.ToDecimal(r["AreaSqFt"]) : 0m
                        ));
                    }
                    r.Close();

                    foreach (var n in rawNotes)
                    {
                        var items = new List<object>();
                        using (var dtCmd = conn.CreateCommand())
                        {
                            dtCmd.CommandText = @"
                                SELECT DetailId, AccountCode, AccountName, Narration, Debit, Credit 
                                FROM jeevika_erp.SocVoucherDetail 
                                WHERE VoucherId = @vid AND Debit > 0
                                ORDER BY DetailId ASC";
                            dtCmd.Parameters.AddWithValue("@vid", n.VoucherId);
                            using var rDt = dtCmd.ExecuteReader();
                            int sr = 1;
                            while (rDt.Read())
                            {
                                items.Add(new
                                {
                                    srNo = sr++,
                                    particulars = rDt["AccountName"]?.ToString() ?? "Debit Particulars",
                                    narration = rDt["Narration"]?.ToString() ?? n.Narration,
                                    amount = Convert.ToDecimal(rDt["Debit"])
                                });
                            }
                        }

                        if (items.Count == 0)
                        {
                            items.Add(new
                            {
                                srNo = 1,
                                particulars = !string.IsNullOrWhiteSpace(n.Part1) ? n.Part1 : (!string.IsNullOrWhiteSpace(n.Narration) ? n.Narration : "Debit Note"),
                                narration = n.Narration,
                                amount = n.Amount
                            });
                        }

                        notes.Add(new
                        {
                            member = new
                            {
                                code = n.MemCode,
                                name = n.MemName,
                                building = n.Building,
                                wing = n.Wing,
                                flatNo = n.FlatNo,
                                area = n.Area
                            },
                            note = new
                            {
                                noteNo = n.VoucherNo,
                                noteDate = n.Date.ToString("yyyy-MM-dd"),
                                refBillNo = n.RefNo,
                                totalAmount = n.Amount
                            },
                            items
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    society = societyObj,
                    notes
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // ── 4. CREDIT NOTE REPORT ───────────────────────────────────
        // ═══════════════════════════════════════════════════════════
        [HttpGet("credit-note-number-bounds")]
        public IActionResult GetCreditNoteNumberBounds([FromQuery] int societyId, [FromQuery] int fyId)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT 
                        MIN(NULLIF(REGEXP_REPLACE(VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT) AS MinNo,
                        MAX(NULLIF(REGEXP_REPLACE(VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT) AS MaxNo
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE (SocietyId = @sid OR (@sid <= 0 AND SocietyId > 0))
                      AND VoucherType IN ('MemberCreditNote', 'CreditNote')
                      AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@sid", societyId);
                using var r = cmd.ExecuteReader();
                long minNo = 1;
                long maxNo = 999999;
                if (r.Read())
                {
                    if (r["MinNo"] != DBNull.Value) minNo = Convert.ToInt64(r["MinNo"]);
                    if (r["MaxNo"] != DBNull.Value) maxNo = Convert.ToInt64(r["MaxNo"]);
                }
                return Ok(new { success = true, minNoteNo = minNo, maxNoteNo = maxNo });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("credit-note-print")]
        public IActionResult GetCreditNotePrint(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? formatType,
            [FromQuery] string? fromNo,
            [FromQuery] string? toNo,
            [FromQuery] string? fromDate,
            [FromQuery] string? toDate,
            [FromQuery] string? fromMemberCode,
            [FromQuery] string? toMemberCode,
            [FromQuery] string? emailFilter)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(formatType)) formatType = "FullPage14";
                if (string.IsNullOrWhiteSpace(emailFilter)) emailFilter = "all";
                using var conn = DbHelper.GetConn();

                if (societyId <= 0)
                {
                    using var cmdDefSoc = conn.CreateCommand();
                    cmdDefSoc.CommandText = "SELECT SocietyId FROM jeevika_erp.SocietyInfo WHERE IsActive = TRUE ORDER BY SocietyId ASC LIMIT 1";
                    var sRes = cmdDefSoc.ExecuteScalar();
                    societyId = (sRes != null && sRes != DBNull.Value) ? Convert.ToInt32(sRes) : 1;
                }

                var societyObj = GetSocietyMetaDictionary(conn, societyId);

                DateTime? fDate = null;
                DateTime? tDate = null;
                if (!string.IsNullOrWhiteSpace(fromDate) && DateTime.TryParse(fromDate, out var pd1)) fDate = pd1;
                if (!string.IsNullOrWhiteSpace(toDate) && DateTime.TryParse(toDate, out var pd2)) tDate = pd2;

                long? nFrom = null;
                long? nTo = null;
                if (!string.IsNullOrWhiteSpace(fromNo) && long.TryParse(System.Text.RegularExpressions.Regex.Replace(fromNo, @"[^\d]", ""), out var fn)) nFrom = fn;
                if (!string.IsNullOrWhiteSpace(toNo) && long.TryParse(System.Text.RegularExpressions.Regex.Replace(toNo, @"[^\d]", ""), out var tn)) nTo = tn;

                var notes = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    var sql = @"
                        SELECT vh.VoucherId, vh.VoucherNo, vh.VoucherDate, vh.Amount,
                               vh.PersonName, vh.PersonCode, vh.RefNo, vh.Narration, vh.Particular1, vh.Particular2,
                               m.MemberId, m.MemCode, m.MemName, m.Building, m.Wing, m.FlatNo, m.AreaSqFt, m.Email
                        FROM jeevika_erp.SocVoucherHeader vh
                        LEFT JOIN jeevika_erp.SocMember m 
                               ON (vh.PersonCode = m.MemCode OR vh.PersonCode = CAST(m.MemberId AS VARCHAR) OR vh.RefNo = m.MemCode OR vh.PersonName = m.MemName)
                              AND (m.SocietyId = vh.SocietyId OR m.SocietyId = 1) AND m.IsDeleted = FALSE
                        WHERE (vh.SocietyId = @sid OR (@sid <= 0 AND vh.SocietyId > 0))
                          AND vh.VoucherType IN ('MemberCreditNote', 'CreditNote')
                          AND vh.IsDeleted = FALSE";

                    if (fDate.HasValue)
                    {
                        sql += " AND vh.VoucherDate >= @fDate";
                        cmd.Parameters.AddWithValue("@fDate", fDate.Value);
                    }
                    if (tDate.HasValue)
                    {
                        sql += " AND vh.VoucherDate <= @tDate";
                        cmd.Parameters.AddWithValue("@tDate", tDate.Value);
                    }

                    if (nFrom.HasValue && nTo.HasValue)
                    {
                        sql += " AND NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT >= @nFrom AND NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT <= @nTo";
                        cmd.Parameters.AddWithValue("@nFrom", nFrom.Value);
                        cmd.Parameters.AddWithValue("@nTo", nTo.Value);
                    }

                    if (!string.IsNullOrWhiteSpace(fromMemberCode) && !string.IsNullOrWhiteSpace(toMemberCode))
                    {
                        sql += " AND COALESCE(m.MemCode, vh.PersonCode) >= @fromMem AND COALESCE(m.MemCode, vh.PersonCode) <= @toMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                        cmd.Parameters.AddWithValue("@toMem", toMemberCode.Trim());
                    }
                    else if (!string.IsNullOrWhiteSpace(fromMemberCode))
                    {
                        sql += " AND COALESCE(m.MemCode, vh.PersonCode) = @fromMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                    }

                    if (emailFilter?.ToLower() == "blank")
                    {
                        sql += " AND (m.Email IS NULL OR TRIM(m.Email) = '')";
                    }
                    else if (emailFilter?.ToLower() == "non-blank")
                    {
                        sql += " AND (m.Email IS NOT NULL AND TRIM(m.Email) <> '')";
                    }

                    sql += " ORDER BY NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT ASC, vh.VoucherDate ASC, vh.VoucherId ASC";
                    cmd.CommandText = sql;
                    cmd.Parameters.AddWithValue("@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    var rawNotes = new List<(int VoucherId, string VoucherNo, DateTime Date, decimal Amount, int MemberId, string PersonCode, string PersonName, string RefNo, string Narration, string Part1, string MemCode, string MemName, string Building, string Wing, string FlatNo, decimal Area)>();

                    while (r.Read())
                    {
                        rawNotes.Add((
                            Convert.ToInt32(r["VoucherId"]),
                            r["VoucherNo"]?.ToString() ?? "",
                            Convert.ToDateTime(r["VoucherDate"]),
                            Convert.ToDecimal(r["Amount"]),
                            r["MemberId"] != DBNull.Value ? Convert.ToInt32(r["MemberId"]) : 0,
                            r["PersonCode"]?.ToString() ?? "",
                            r["PersonName"]?.ToString() ?? "",
                            r["RefNo"]?.ToString() ?? "",
                            r["Narration"]?.ToString() ?? "",
                            r["Particular1"]?.ToString() ?? "",
                            r["MemCode"]?.ToString() ?? r["PersonCode"]?.ToString() ?? "",
                            r["MemName"]?.ToString() ?? r["PersonName"]?.ToString() ?? "",
                            r["Building"]?.ToString() ?? "",
                            r["Wing"]?.ToString() ?? "",
                            r["FlatNo"]?.ToString() ?? "",
                            r["AreaSqFt"] != DBNull.Value ? Convert.ToDecimal(r["AreaSqFt"]) : 0m
                        ));
                    }
                    r.Close();

                    foreach (var n in rawNotes)
                    {
                        var items = new List<object>();
                        using (var dtCmd = conn.CreateCommand())
                        {
                            dtCmd.CommandText = @"
                                SELECT DetailId, AccountCode, AccountName, Narration, Debit, Credit 
                                FROM jeevika_erp.SocVoucherDetail 
                                WHERE VoucherId = @vid AND Credit > 0
                                ORDER BY DetailId ASC";
                            dtCmd.Parameters.AddWithValue("@vid", n.VoucherId);
                            using var rDt = dtCmd.ExecuteReader();
                            int sr = 1;
                            while (rDt.Read())
                            {
                                items.Add(new
                                {
                                    srNo = sr++,
                                    particulars = rDt["AccountName"]?.ToString() ?? "Credit / Allowance",
                                    narration = rDt["Narration"]?.ToString() ?? n.Narration,
                                    amount = Convert.ToDecimal(rDt["Credit"])
                                });
                            }
                        }

                        if (items.Count == 0)
                        {
                            items.Add(new
                            {
                                srNo = 1,
                                particulars = !string.IsNullOrWhiteSpace(n.Part1) ? n.Part1 : (!string.IsNullOrWhiteSpace(n.Narration) ? n.Narration : "Credit Note / Allowance"),
                                narration = n.Narration,
                                amount = n.Amount
                            });
                        }

                        // Outstanding Dues / Arrears for credit note
                        decimal arrPrin = 0m;
                        decimal arrInt = 0m;
                        if (n.MemberId > 0)
                        {
                            using var arrCmd = conn.CreateCommand();
                            arrCmd.CommandText = @"
                                SELECT 
                                    COALESCE(SUM(PrincipalAmount), 0) AS DuePrin,
                                    COALESCE(SUM(InterestAmount), 0) AS DueInt
                                FROM jeevika_erp.SocMemberBill
                                WHERE SocietyId = @sid AND MemberId = @mid AND IsDeleted = FALSE";
                            arrCmd.Parameters.AddWithValue("@sid", societyId);
                            arrCmd.Parameters.AddWithValue("@mid", n.MemberId);
                            using var rArr = arrCmd.ExecuteReader();
                            if (rArr.Read())
                            {
                                arrPrin = Convert.ToDecimal(rArr["DuePrin"]);
                                arrInt = Convert.ToDecimal(rArr["DueInt"]);
                            }
                        }

                        notes.Add(new
                        {
                            member = new
                            {
                                code = n.MemCode,
                                name = n.MemName,
                                building = n.Building,
                                wing = n.Wing,
                                flatNo = n.FlatNo,
                                area = n.Area
                            },
                            note = new
                            {
                                noteNo = n.VoucherNo,
                                noteDate = n.Date.ToString("yyyy-MM-dd"),
                                refBillNo = n.RefNo,
                                totalAmount = n.Amount
                            },
                            items,
                            arrears = new
                            {
                                principal = arrPrin,
                                interest = arrInt,
                                total = arrPrin + arrInt
                            }
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    society = societyObj,
                    notes
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // ── 5. MEMBER ADJUSTMENT / PAYMENT REPORT ───────────────────
        // ═══════════════════════════════════════════════════════════
        [HttpGet("adjustment-number-bounds")]
        public IActionResult GetAdjustmentNumberBounds([FromQuery] int societyId, [FromQuery] int fyId)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT 
                        MIN(NULLIF(REGEXP_REPLACE(VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT) AS MinNo,
                        MAX(NULLIF(REGEXP_REPLACE(VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT) AS MaxNo
                    FROM jeevika_erp.SocVoucherHeader
                    WHERE (SocietyId = @sid OR (@sid <= 0 AND SocietyId > 0))
                      AND VoucherType IN ('MemberAdjustment', 'Adjustment', 'MemberJV', 'Journal', 'JV', 'MemberPayment')
                      AND IsDeleted = FALSE";
                cmd.Parameters.AddWithValue("@sid", societyId);
                using var r = cmd.ExecuteReader();
                long minNo = 1;
                long maxNo = 999999;
                if (r.Read())
                {
                    if (r["MinNo"] != DBNull.Value) minNo = Convert.ToInt64(r["MinNo"]);
                    if (r["MaxNo"] != DBNull.Value) maxNo = Convert.ToInt64(r["MaxNo"]);
                }
                return Ok(new { success = true, minAdjustmentNo = minNo, maxAdjustmentNo = maxNo });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("adjustment-print")]
        public IActionResult GetAdjustmentPrint(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? formatStyle,
            [FromQuery] string? fromNo,
            [FromQuery] string? toNo,
            [FromQuery] string? fromDate,
            [FromQuery] string? toDate,
            [FromQuery] string? fromMemberCode,
            [FromQuery] string? toMemberCode,
            [FromQuery] string? emailFilter)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(formatStyle)) formatStyle = "Slip";
                if (string.IsNullOrWhiteSpace(emailFilter)) emailFilter = "all";
                using var conn = DbHelper.GetConn();

                if (societyId <= 0)
                {
                    using var cmdDefSoc = conn.CreateCommand();
                    cmdDefSoc.CommandText = "SELECT SocietyId FROM jeevika_erp.SocietyInfo WHERE IsActive = TRUE ORDER BY SocietyId ASC LIMIT 1";
                    var sRes = cmdDefSoc.ExecuteScalar();
                    societyId = (sRes != null && sRes != DBNull.Value) ? Convert.ToInt32(sRes) : 1;
                }

                var societyObj = GetSocietyMetaDictionary(conn, societyId);

                DateTime? fDate = null;
                DateTime? tDate = null;
                if (!string.IsNullOrWhiteSpace(fromDate) && DateTime.TryParse(fromDate, out var pd1)) fDate = pd1;
                if (!string.IsNullOrWhiteSpace(toDate) && DateTime.TryParse(toDate, out var pd2)) tDate = pd2;

                long? nFrom = null;
                long? nTo = null;
                if (!string.IsNullOrWhiteSpace(fromNo) && long.TryParse(System.Text.RegularExpressions.Regex.Replace(fromNo, @"[^\d]", ""), out var fn)) nFrom = fn;
                if (!string.IsNullOrWhiteSpace(toNo) && long.TryParse(System.Text.RegularExpressions.Regex.Replace(toNo, @"[^\d]", ""), out var tn)) nTo = tn;

                var adjustments = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    var sql = @"
                        SELECT vh.VoucherId, vh.VoucherNo, vh.VoucherType, vh.VoucherDate, vh.Amount,
                               vh.CashBankName, vh.BankName, vh.PersonName, vh.PersonCode, vh.RefNo, vh.Narration, vh.Particular1, vh.Particular2,
                               m.MemberId, m.MemCode, m.MemName, m.Building, m.Wing, m.FlatNo, m.Email
                        FROM jeevika_erp.SocVoucherHeader vh
                        LEFT JOIN jeevika_erp.SocMember m 
                               ON (vh.PersonCode = m.MemCode OR vh.PersonCode = CAST(m.MemberId AS VARCHAR) OR vh.RefNo = m.MemCode OR vh.PersonName = m.MemName)
                              AND (m.SocietyId = vh.SocietyId OR m.SocietyId = 1) AND m.IsDeleted = FALSE
                        WHERE (vh.SocietyId = @sid OR (@sid <= 0 AND vh.SocietyId > 0))
                          AND vh.VoucherType IN ('MemberAdjustment', 'Adjustment', 'MemberJV', 'Journal', 'JV', 'MemberPayment')
                          AND vh.IsDeleted = FALSE";

                    if (fDate.HasValue)
                    {
                        sql += " AND vh.VoucherDate >= @fDate";
                        cmd.Parameters.AddWithValue("@fDate", fDate.Value);
                    }
                    if (tDate.HasValue)
                    {
                        sql += " AND vh.VoucherDate <= @tDate";
                        cmd.Parameters.AddWithValue("@tDate", tDate.Value);
                    }

                    if (nFrom.HasValue && nTo.HasValue)
                    {
                        sql += " AND NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT >= @nFrom AND NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT <= @nTo";
                        cmd.Parameters.AddWithValue("@nFrom", nFrom.Value);
                        cmd.Parameters.AddWithValue("@nTo", nTo.Value);
                    }

                    if (!string.IsNullOrWhiteSpace(fromMemberCode) && !string.IsNullOrWhiteSpace(toMemberCode))
                    {
                        sql += " AND COALESCE(m.MemCode, vh.PersonCode) >= @fromMem AND COALESCE(m.MemCode, vh.PersonCode) <= @toMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                        cmd.Parameters.AddWithValue("@toMem", toMemberCode.Trim());
                    }
                    else if (!string.IsNullOrWhiteSpace(fromMemberCode))
                    {
                        sql += " AND COALESCE(m.MemCode, vh.PersonCode) = @fromMem";
                        cmd.Parameters.AddWithValue("@fromMem", fromMemberCode.Trim());
                    }

                    if (emailFilter?.ToLower() == "blank")
                    {
                        sql += " AND (m.Email IS NULL OR TRIM(m.Email) = '')";
                    }
                    else if (emailFilter?.ToLower() == "non-blank")
                    {
                        sql += " AND (m.Email IS NOT NULL AND TRIM(m.Email) <> '')";
                    }

                    sql += " ORDER BY NULLIF(REGEXP_REPLACE(vh.VoucherNo, '[^0-9]', '', 'g'), '')::BIGINT ASC, vh.VoucherDate ASC, vh.VoucherId ASC";
                    cmd.CommandText = sql;
                    cmd.Parameters.AddWithValue("@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        var vType = r["VoucherType"]?.ToString() ?? "Journal";
                        var paymentMode = vType == "MemberPayment" ? "Payment" : "Journal / Adjustment";
                        var drawnOn = r["CashBankName"]?.ToString();
                        if (string.IsNullOrWhiteSpace(drawnOn)) drawnOn = r["BankName"]?.ToString() ?? "Adjustment / Internal Transfer";

                        var vDate = Convert.ToDateTime(r["VoucherDate"]);
                        var personCode = r["MemCode"]?.ToString();
                        if (string.IsNullOrWhiteSpace(personCode)) personCode = r["PersonCode"]?.ToString() ?? "";
                        var personName = r["MemName"]?.ToString();
                        if (string.IsNullOrWhiteSpace(personName)) personName = r["PersonName"]?.ToString() ?? "";

                        adjustments.Add(new
                        {
                            adjustmentNo = r["VoucherNo"]?.ToString() ?? "",
                            date = vDate.ToString("yyyy-MM-dd"),
                            amount = Convert.ToDecimal(r["Amount"]),
                            paymentMode,
                            drawnOn,
                            refNo = r["RefNo"]?.ToString() ?? "",
                            narration = r["Narration"]?.ToString() ?? r["Particular1"]?.ToString() ?? "Member adjustment",
                            member = new
                            {
                                code = personCode,
                                name = personName,
                                building = r["Building"]?.ToString() ?? "",
                                wing = r["Wing"]?.ToString() ?? "",
                                flatNo = r["FlatNo"]?.ToString() ?? ""
                            }
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    society = societyObj,
                    adjustments
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static Dictionary<string, object> GetSocietyMetaDictionary(NpgsqlConnection conn, int societyId)
        {
            var dict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT SocietyId, SocietyName, Address, City, Pincode, Phone, Email,
                       RegistrationNo, PANNumber, GSTNumber, HSNCode,
                       BankName, BankAccountNo, IFSCCode,
                       GSTApplicable, CGSTPct, SGSTPct, ExemptLimit
                FROM jeevika_erp.SocietyInfo
                WHERE (SocietyId = @sid OR (@sid <= 0 AND SocietyId > 0) OR NOT EXISTS (SELECT 1 FROM jeevika_erp.SocietyInfo WHERE SocietyId = @sid AND IsActive = TRUE))
                  AND IsActive = TRUE
                ORDER BY CASE WHEN SocietyId = @sid THEN 0 ELSE 1 END, SocietyId ASC
                LIMIT 1";
            cmd.Parameters.AddWithValue("@sid", societyId > 0 ? societyId : 1);

            using var r = cmd.ExecuteReader();
            if (r.Read())
            {
                var addressParts = new List<string>();
                var addr = r["Address"]?.ToString()?.Trim();
                if (!string.IsNullOrEmpty(addr)) addressParts.Add(addr);
                var city = r["City"]?.ToString()?.Trim();
                var pin = r["Pincode"]?.ToString()?.Trim();
                if (!string.IsNullOrEmpty(city) && !string.IsNullOrEmpty(pin)) addressParts.Add($"{city} - {pin}");
                else if (!string.IsNullOrEmpty(city)) addressParts.Add(city);
                else if (!string.IsNullOrEmpty(pin)) addressParts.Add(pin);

                bool gstApp = false;
                var gObj = r["GSTApplicable"];
                if (gObj != null && gObj != DBNull.Value)
                {
                    if (gObj is bool b) gstApp = b;
                    else if (bool.TryParse(gObj.ToString(), out bool pb)) gstApp = pb;
                    else
                    {
                        var s = gObj.ToString()?.Trim().ToUpper();
                        gstApp = (s == "Y" || s == "YES" || s == "TRUE" || s == "1");
                    }
                }

                dict["id"] = Convert.ToInt32(r["SocietyId"]);
                dict["name"] = r["SocietyName"]?.ToString() ?? "";
                dict["registrationNo"] = r["RegistrationNo"]?.ToString() ?? "";
                dict["address"] = addressParts.Count > 0 ? string.Join(", ", addressParts) : "";
                dict["phone"] = r["Phone"]?.ToString() ?? "";
                dict["email"] = r["Email"]?.ToString() ?? "";
                dict["pan"] = r["PANNumber"]?.ToString() ?? "";
                dict["gstin"] = r["GSTNumber"]?.ToString() ?? "";
                dict["sacCode"] = r["HSNCode"]?.ToString() ?? "999598";
                dict["bankName"] = r["BankName"]?.ToString() ?? "";
                dict["accountNo"] = r["BankAccountNo"]?.ToString() ?? "";
                dict["ifsc"] = r["IFSCCode"]?.ToString() ?? "";
                dict["gstApplicable"] = gstApp;
                dict["cgstPct"] = r["CGSTPct"] != DBNull.Value ? Convert.ToDecimal(r["CGSTPct"]) : 9m;
                dict["sgstPct"] = r["SGSTPct"] != DBNull.Value ? Convert.ToDecimal(r["SGSTPct"]) : 9m;
            }
            else
            {
                dict["id"] = 1;
                dict["name"] = "Co-Operative Housing Society Ltd.";
                dict["registrationNo"] = "";
                dict["address"] = "";
                dict["phone"] = "";
                dict["email"] = "";
                dict["pan"] = "";
                dict["gstin"] = "";
                dict["sacCode"] = "999598";
                dict["bankName"] = "";
                dict["accountNo"] = "";
                dict["ifsc"] = "";
                dict["gstApplicable"] = false;
                dict["cgstPct"] = 9m;
                dict["sgstPct"] = 9m;
            }

            return dict;
        }

        // ═══════════════════════════════════════════════════════════
        // ── ISOLATED 15 MEMBER REPORTS & HENU OS DESIGN API ─────────
        // ═══════════════════════════════════════════════════════════

        [HttpGet("member/bill-format")]
        public IActionResult GetMemberBillFormatApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember,
            [FromQuery] DateTime? billFrom,
            [FromQuery] DateTime? billTo,
            [FromQuery] DateTime? rcptFrom,
            [FromQuery] DateTime? rcptTo,
            [FromQuery] int? billTypeId,
            [FromQuery] string? emailFilter)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetBillFormat(conn, societyId, fyId, fromMember, toMember, billFrom, billTo, rcptFrom, rcptTo, billTypeId, emailFilter);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/receipt")]
        public IActionResult GetMemberReceiptApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? fromReceiptNo,
            [FromQuery] string? toReceiptNo,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] string? paymentMode)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetReceipt(conn, societyId, fyId, fromReceiptNo, toReceiptNo, fromMember, toMember, fromDate, toDate, paymentMode);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/debit-note")]
        public IActionResult GetMemberDebitNoteApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? fromNoteNo,
            [FromQuery] string? toNoteNo,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetDebitNote(conn, societyId, fyId, fromNoteNo, toNoteNo, fromMember, toMember, fromDate, toDate);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/credit-note")]
        public IActionResult GetMemberCreditNoteApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? fromNoteNo,
            [FromQuery] string? toNoteNo,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetCreditNote(conn, societyId, fyId, fromNoteNo, toNoteNo, fromMember, toMember, fromDate, toDate);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/adjustment")]
        public IActionResult GetMemberAdjustmentApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? fromVoucherNo,
            [FromQuery] string? toVoucherNo,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetAdjustment(conn, societyId, fyId, fromVoucherNo, toVoucherNo, fromMember, toMember, fromDate, toDate);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/control-account")]
        [HttpGet("member/member-control-account")]
        public IActionResult GetMemberControlAccountApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] int? billTypeId,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetControlAccount(conn, societyId, fyId, billTypeId, fromDate, toDate);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/balance-confirmation")]
        public IActionResult GetMemberBalanceConfirmationApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] DateTime? asOnDate,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember,
            [FromQuery] string? wing,
            [FromQuery] string? flatNo)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetBalanceConfirmation(conn, societyId, fyId, asOnDate, fromMember, toMember, wing, flatNo);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/bank-deposit-list")]
        [HttpGet("member/bank-deposit")]
        public IActionResult GetMemberBankDepositListApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] string? bankName,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] string? paymentMode)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetBankDepositList(conn, societyId, fyId, bankName, fromDate, toDate, paymentMode);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/data-sheet")]
        public IActionResult GetMemberDataSheetApi(
            [FromQuery] int societyId,
            [FromQuery] string? wing,
            [FromQuery] string? flatType,
            [FromQuery] string? memberType,
            [FromQuery] string? searchText)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetDataSheet(conn, societyId, wing, flatType, memberType, searchText);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/bill-register")]
        public IActionResult GetMemberBillRegisterApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] int? billTypeId,
            [FromQuery] string? wing,
            [FromQuery] string? fromBillNo,
            [FromQuery] string? toBillNo)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetBillRegister(conn, societyId, fyId, fromDate, toDate, billTypeId, wing, fromBillNo, toBillNo);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/receipt-register")]
        public IActionResult GetMemberReceiptRegisterApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] string? paymentMode,
            [FromQuery] string? bankName,
            [FromQuery] string? wing)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetReceiptRegister(conn, societyId, fyId, fromDate, toDate, paymentMode, bankName, wing);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/debit-note-register")]
        public IActionResult GetMemberDebitNoteRegisterApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] string? wing,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetDebitNoteRegister(conn, societyId, fyId, fromDate, toDate, wing, fromMember, toMember);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/credit-note-register")]
        public IActionResult GetMemberCreditNoteRegisterApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] string? wing,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetCreditNoteRegister(conn, societyId, fyId, fromDate, toDate, wing, fromMember, toMember);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/adjustment-register")]
        public IActionResult GetMemberAdjustmentRegisterApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] string? wing,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetAdjustmentRegister(conn, societyId, fyId, fromDate, toDate, wing, fromMember, toMember);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/member-jv-register")]
        public IActionResult GetMemberJVRegisterApi(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] string? wing,
            [FromQuery] string? fromMember,
            [FromQuery] string? toMember)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetMemberJVRegister(conn, societyId, fyId, fromDate, toDate, wing, fromMember, toMember);
                return Ok(res);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── Template and Runtime Settings API ──

        [HttpGet("member/definitions")]
        public IActionResult GetReportDefinitionsApi()
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetReportDefinitions(conn);
                return Ok(new { success = true, definitions = res });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/templates/{reportKey}")]
        public IActionResult GetTemplatesApi([FromRoute] string reportKey)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetTemplates(conn, reportKey);
                return Ok(new { success = true, templates = res });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class SaveTemplateRequest
        {
            [JsonPropertyName("reportKey")] public string ReportKey { get; set; } = "";
            [JsonPropertyName("templateKey")] public string TemplateKey { get; set; } = "";
            [JsonPropertyName("templateName")] public string TemplateName { get; set; } = "";
            [JsonPropertyName("templateJson")] public string TemplateJson { get; set; } = "{}";
            [JsonPropertyName("isSystem")] public bool IsSystem { get; set; }
        }

        [HttpPost("member/templates")]
        public IActionResult SaveTemplateApi([FromBody] SaveTemplateRequest req)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.SaveTemplate(conn, req.ReportKey, req.TemplateKey, req.TemplateName, req.TemplateJson, req.IsSystem);
                return Ok(new { success = res });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/settings/{reportKey}")]
        public IActionResult GetRuntimeSettingsApi([FromRoute] string reportKey)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetRuntimeSettings(conn, reportKey);
                return Ok(new { success = true, settingsJson = res });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class SaveSettingsRequest
        {
            [JsonPropertyName("reportKey")] public string ReportKey { get; set; } = "";
            [JsonPropertyName("settingJson")] public string SettingJson { get; set; } = "{}";
            [JsonPropertyName("updatedBy")] public string UpdatedBy { get; set; } = "SYSTEM";
        }

        [HttpPost("member/settings")]
        public IActionResult SaveRuntimeSettingsApi([FromBody] SaveSettingsRequest req)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.SaveRuntimeSettings(conn, req.ReportKey, req.SettingJson, req.UpdatedBy);
                return Ok(new { success = res });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class PublishTemplateRequest
        {
            [JsonPropertyName("reportKey")] public string ReportKey { get; set; } = "";
            [JsonPropertyName("templateKey")] public string TemplateKey { get; set; } = "";
            [JsonPropertyName("templateName")] public string TemplateName { get; set; } = "";
            [JsonPropertyName("templateJson")] public string TemplateJson { get; set; } = "{}";
            [JsonPropertyName("publishedBy")] public string PublishedBy { get; set; } = "ADMIN";
        }

        [HttpPost("member/templates/publish")]
        public IActionResult PublishTemplateApi([FromBody] PublishTemplateRequest req)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.PublishTemplate(conn, req.ReportKey, req.TemplateKey, req.TemplateName, req.TemplateJson, req.PublishedBy);
                return Ok(new { success = res, message = "Template published successfully as active design" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class DuplicateTemplateRequest
        {
            [JsonPropertyName("reportKey")] public string ReportKey { get; set; } = "";
            [JsonPropertyName("sourceTemplateKey")] public string SourceTemplateKey { get; set; } = "";
            [JsonPropertyName("newTemplateKey")] public string NewTemplateKey { get; set; } = "";
            [JsonPropertyName("newTemplateName")] public string NewTemplateName { get; set; } = "";
            [JsonPropertyName("createdBy")] public string CreatedBy { get; set; } = "ADMIN";
        }

        [HttpPost("member/templates/duplicate")]
        public IActionResult DuplicateTemplateApi([FromBody] DuplicateTemplateRequest req)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.DuplicateTemplate(conn, req.ReportKey, req.SourceTemplateKey, req.NewTemplateKey, req.NewTemplateName, req.CreatedBy);
                return Ok(new { success = res, message = res ? "Template duplicated successfully" : "Failed to duplicate template" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("member/templates/{reportKey}/{templateKey}")]
        public IActionResult DeleteTemplateApi([FromRoute] string reportKey, [FromRoute] string templateKey)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var (ok, msg) = Services.MemberReportService.DeleteTemplate(conn, reportKey, templateKey);
                return Ok(new { success = ok, message = msg });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/templates/{reportKey}/{templateKey}/versions")]
        public IActionResult GetTemplateVersionsApi([FromRoute] string reportKey, [FromRoute] string templateKey)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var list = Services.MemberReportService.GetTemplateVersions(conn, reportKey, templateKey);
                return Ok(new { success = true, versions = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class RollbackVersionRequest
        {
            [JsonPropertyName("reportKey")] public string ReportKey { get; set; } = "";
            [JsonPropertyName("templateKey")] public string TemplateKey { get; set; } = "";
            [JsonPropertyName("versionNo")] public int VersionNo { get; set; }
            [JsonPropertyName("restoredBy")] public string RestoredBy { get; set; } = "ADMIN";
        }

        [HttpPost("member/templates/rollback")]
        public IActionResult RollbackVersionApi([FromBody] RollbackVersionRequest req)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.RollbackTemplateVersion(conn, req.ReportKey, req.TemplateKey, req.VersionNo, req.RestoredBy);
                return Ok(new { success = res, message = res ? $"Restored to v{req.VersionNo} successfully" : "Version not found" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/audit-logs/{reportKey}")]
        public IActionResult GetAuditLogsApi([FromRoute] string reportKey)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var list = Services.MemberReportService.GetAuditLogs(conn, reportKey);
                return Ok(new { success = true, auditLogs = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/assets/{reportKey}")]
        public IActionResult GetAssetsApi([FromRoute] string reportKey)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var list = Services.MemberReportService.GetAssets(conn, reportKey);
                return Ok(new { success = true, assets = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class SaveAssetRequest
        {
            [JsonPropertyName("reportKey")] public string ReportKey { get; set; } = "";
            [JsonPropertyName("assetType")] public string AssetType { get; set; } = "";
            [JsonPropertyName("fileName")] public string FileName { get; set; } = "";
            [JsonPropertyName("storagePath")] public string StoragePath { get; set; } = "";
            [JsonPropertyName("mimeType")] public string MimeType { get; set; } = "";
            [JsonPropertyName("metadataJson")] public string MetadataJson { get; set; } = "{}";
        }

        [HttpPost("member/assets")]
        public IActionResult SaveAssetApi([FromBody] SaveAssetRequest req)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.SaveAsset(conn, req.ReportKey, req.AssetType, req.FileName, req.StoragePath, req.MimeType, req.MetadataJson);
                return Ok(new { success = res });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("member/presets/{reportKey}")]
        public IActionResult GetFilterPresetsApi([FromRoute] string reportKey)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.GetFilterPresets(conn, reportKey);
                return Ok(new { success = true, presets = res });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class SavePresetRequest
        {
            [JsonPropertyName("reportKey")] public string ReportKey { get; set; } = "";
            [JsonPropertyName("presetName")] public string PresetName { get; set; } = "";
            [JsonPropertyName("filterJson")] public string FilterJson { get; set; } = "{}";
            [JsonPropertyName("createdBy")] public string CreatedBy { get; set; } = "USER";
        }

        [HttpPost("member/presets")]
        public IActionResult SaveFilterPresetApi([FromBody] SavePresetRequest req)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                var res = Services.MemberReportService.SaveFilterPreset(conn, req.ReportKey, req.PresetName, req.FilterJson, req.CreatedBy);
                return Ok(new { success = res });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
