// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — MemberReportController
// Handles Member Account Ledger (Head-Wise Pivot) and Member Register [Dr/Cr]
// 100% Dynamic DB Driven — Zero Hardcoding
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Serialization;

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
                                      AND (MemberId = @mid OR MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE SocietyId = @sid AND (MemCode = @mcode OR FlatNo = @mflat)))
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
                                  AND (b.MemberId = @mid OR b.MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE SocietyId = @sid AND (MemCode = @mcode OR FlatNo = @mflat OR CONCAT(Wing, '-', FlatNo) = @mcode)))
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
                                  AND (b.MemberId = @mid OR b.MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE SocietyId = @sid AND (MemCode = @mcode OR FlatNo = @mflat OR CONCAT(Wing, '-', FlatNo) = @mcode OR MemCode = @mflat)))
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

                return Ok(new
                {
                    success = true,
                    societyName,
                    billTypeName,
                    fyLabel,
                    startDate = startDate.ToString("yyyy-MM-dd"),
                    endDate = endDate.ToString("yyyy-MM-dd"),
                    dynamicColumns = globalColumns,
                    memberLedgers
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
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
                                      AND (MemberId = @mid OR MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE SocietyId = @sid AND (MemCode = @mcode OR FlatNo = @mflat)))
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
                                  AND (b.MemberId = @mid OR b.MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE SocietyId = @sid AND (MemCode = @mcode OR FlatNo = @mflat OR CONCAT(Wing, '-', FlatNo) = @mcode)))
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
                                  AND (b.MemberId = @mid OR b.MemberId IN (SELECT MemberId FROM jeevika_erp.SocMember WHERE SocietyId = @sid AND (MemCode = @mcode OR FlatNo = @mflat OR CONCAT(Wing, '-', FlatNo) = @mcode OR MemCode = @mflat)))
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
    }
}
