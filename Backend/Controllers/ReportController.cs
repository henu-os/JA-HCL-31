// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — ReportController
// Financial Accounting Reports & Member Reporting Engine
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/reports")]
    [AllowAnonymous]
    public class ReportController : ControllerBase
    {
        // ── GET /api/reports/trial-balance?societyId=X&fyId=Y&fromDate=Z&toDate=W&mainGroupId=A ───
        [HttpGet("trial-balance")]
        public IActionResult GetTrialBalance(
            [FromQuery] int societyId, 
            [FromQuery] int fyId,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] int? mainGroupId = null)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "societyId and fyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                MemberReceiptController.EnsureReceiptLedgerEntries(conn, societyId);

                // Resolve FY date bounds if needed
                DateTime? fyStart = null;
                DateTime? fyEnd = null;
                using (var fyCmd = conn.CreateCommand())
                {
                    fyCmd.CommandText = "SELECT FYStart, FYEnd FROM jeevika_erp.FinancialYear WHERE FYId = @fyid";
                    fyCmd.Parameters.AddWithValue("@fyid", fyId);
                    using var rFy = fyCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        if (rFy["FYStart"] != DBNull.Value) fyStart = Convert.ToDateTime(rFy["FYStart"]);
                        if (rFy["FYEnd"] != DBNull.Value) fyEnd = Convert.ToDateTime(rFy["FYEnd"]);
                    }
                }

                using var cmd = conn.CreateCommand();
                var sql = @"
                    SELECT a.AccountId, a.AccCode, a.AccName, COALESCE(g.GrpName, 'General') AS GrpName, a.GrpMainId,
                           COALESCE(ob.OpenBal, a.OpBal, 0) AS MasterOpBal,
                           COALESCE(ob.DrCr, a.OpDrCr, 'Dr') AS MasterOpDrCr,
                           COALESCE(SUM(CASE WHEN @hasFrom = TRUE AND vh.VoucherDate < @fromDate THEN vd.Debit ELSE 0 END), 0) AS PriorDebit,
                           COALESCE(SUM(CASE WHEN @hasFrom = TRUE AND vh.VoucherDate < @fromDate THEN vd.Credit ELSE 0 END), 0) AS PriorCredit,
                           COALESCE(SUM(CASE WHEN (@hasFrom = FALSE OR vh.VoucherDate >= @fromDate) AND (@hasTo = FALSE OR vh.VoucherDate <= @toDate) THEN vd.Debit ELSE 0 END), 0) AS TxnDebit,
                           COALESCE(SUM(CASE WHEN (@hasFrom = FALSE OR vh.VoucherDate >= @fromDate) AND (@hasTo = FALSE OR vh.VoucherDate <= @toDate) THEN vd.Credit ELSE 0 END), 0) AS TxnCredit
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                    LEFT JOIN jeevika_erp.SocVoucherDetail vd ON a.AccountId = vd.AccountId
                    LEFT JOIN jeevika_erp.SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId 
                          AND vh.SocietyId = @sid 
                          AND (vh.FYId = @fyid OR (@hasBounds = TRUE AND vh.VoucherDate >= @fyStart AND vh.VoucherDate <= @fyEnd))
                          AND vh.IsDeleted = FALSE
                    WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE";

                if (mainGroupId.HasValue && mainGroupId.Value > 0)
                {
                    sql += " AND a.GrpMainId = @mgid";
                    cmd.Parameters.AddWithValue("@mgid", mainGroupId.Value);
                }

                sql += @"
                    GROUP BY a.AccountId, a.AccCode, a.AccName, g.GrpName, a.GrpMainId, ob.OpenBal, a.OpBal, ob.DrCr, a.OpDrCr
                    ORDER BY 
                        CASE a.GrpMainId 
                            WHEN 1 THEN 1 -- Asset
                            WHEN 2 THEN 2 -- Liability
                            WHEN 3 THEN 3 -- Income
                            WHEN 4 THEN 4 -- Expense
                            ELSE 5 
                        END, COALESCE(g.GrpName, 'General'), a.AccCode, a.AccName";

                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);
                cmd.Parameters.AddWithValue("@hasFrom", fromDate.HasValue);
                cmd.Parameters.AddWithValue("@fromDate", fromDate.HasValue ? fromDate.Value.Date : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@hasTo", toDate.HasValue);
                cmd.Parameters.AddWithValue("@toDate", toDate.HasValue ? toDate.Value.Date : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@hasBounds", (fyStart.HasValue && fyEnd.HasValue));
                cmd.Parameters.AddWithValue("@fyStart", fyStart.HasValue ? fyStart.Value.Date : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@fyEnd", fyEnd.HasValue ? fyEnd.Value.Date : (object)DBNull.Value);

                var list = new List<object>();
                decimal grandOpDr = 0, grandOpCr = 0;
                decimal grandTxnDr = 0, grandTxnCr = 0;
                decimal grandClosingDr = 0, grandClosingCr = 0;

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    var accCode = r["AccCode"].ToString() ?? "";
                    var accName = r["AccName"].ToString() ?? "";
                    var grpName = r["GrpName"]?.ToString() ?? "General";
                    int grpMain = Convert.ToInt32(r["GrpMainId"]);

                    decimal masterOpBal = Convert.ToDecimal(r["MasterOpBal"]);
                    string masterOpDrCr = r["MasterOpDrCr"]?.ToString() ?? "Dr";
                    decimal priorDebit = Convert.ToDecimal(r["PriorDebit"]);
                    decimal priorCredit = Convert.ToDecimal(r["PriorCredit"]);
                    decimal txnDebit = Convert.ToDecimal(r["TxnDebit"]);
                    decimal txnCredit = Convert.ToDecimal(r["TxnCredit"]);

                    decimal baseOpDr = masterOpDrCr.Equals("Dr", StringComparison.OrdinalIgnoreCase) ? masterOpBal : 0;
                    decimal baseOpCr = masterOpDrCr.Equals("Cr", StringComparison.OrdinalIgnoreCase) ? masterOpBal : 0;

                    decimal netPrior = (baseOpDr - baseOpCr) + (priorDebit - priorCredit);
                    decimal openingDr = netPrior >= 0 ? netPrior : 0;
                    decimal openingCr = netPrior < 0 ? Math.Abs(netPrior) : 0;

                    decimal netClosing = (openingDr - openingCr) + (txnDebit - txnCredit);
                    decimal closingDr = netClosing >= 0 ? netClosing : 0;
                    decimal closingCr = netClosing < 0 ? Math.Abs(netClosing) : 0;

                    string status = closingDr > 0 ? "DR" : (closingCr > 0 ? "CR" : "NIL");
                    string grpMainName = grpMain switch
                    {
                        1 => "Asset",
                        2 => "Liability",
                        3 => "Income",
                        4 => "Expense",
                        _ => "General"
                    };

                    grandOpDr += openingDr;
                    grandOpCr += openingCr;
                    grandTxnDr += txnDebit;
                    grandTxnCr += txnCredit;
                    grandClosingDr += closingDr;
                    grandClosingCr += closingCr;

                    list.Add(new
                    {
                        accountId = Convert.ToInt32(r["AccountId"]),
                        accCode,
                        accName,
                        groupName = grpName,
                        grpMainId = grpMain,
                        grpMainName,
                        opBal = masterOpBal,
                        opDrCr = masterOpDrCr,
                        openingDr,
                        openingCr,
                        totalDebit = txnDebit,
                        totalCredit = txnCredit,
                        closingDr,
                        closingCr,
                        status
                    });
                }

                return Ok(new
                {
                    success = true,
                    data = list,
                    totalDr = grandClosingDr,
                    totalCr = grandClosingCr,
                    difference = Math.Abs(grandClosingDr - grandClosingCr),
                    totals = new
                    {
                        openingDr = grandOpDr,
                        openingCr = grandOpCr,
                        txnDr = grandTxnDr,
                        txnCr = grandTxnCr,
                        closingDr = grandClosingDr,
                        closingCr = grandClosingCr,
                        diffOpening = Math.Abs(grandOpDr - grandOpCr),
                        diffTxn = Math.Abs(grandTxnDr - grandTxnCr),
                        diffClosing = Math.Abs(grandClosingDr - grandClosingCr),
                        isBalanced = (grandClosingDr == grandClosingCr)
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/reports/balance-sheet?societyId=X&fyId=Y&asOnDate=Z&comparePrevFY=true&includeMemberBreakup=true ───
        [HttpGet("balance-sheet")]
        public IActionResult GetBalanceSheet(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] DateTime? asOnDate = null,
            [FromQuery] bool comparePrevFY = true,
            [FromQuery] bool includeMemberBreakup = true)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "societyId and fyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                MemberReceiptController.EnsureReceiptLedgerEntries(conn, societyId);

                // 1. Society Profile
                string socName = "", regNo = "", address = "", city = "";
                using (var sCmd = conn.CreateCommand())
                {
                    sCmd.CommandText = "SELECT SocietyName, RegistrationNo, Address, City FROM jeevika_erp.SocietyInfo WHERE SocietyId = @sid LIMIT 1";
                    sCmd.Parameters.AddWithValue("@sid", societyId);
                    using var rS = sCmd.ExecuteReader();
                    if (rS.Read())
                    {
                        socName = rS["SocietyName"]?.ToString() ?? "";
                        regNo   = rS["RegistrationNo"]?.ToString() ?? "";
                        address = rS["Address"]?.ToString() ?? "";
                        city    = rS["City"]?.ToString() ?? "";
                    }
                }

                // 2. Resolve Active FY
                DateTime? fyStart = null;
                DateTime? fyEnd = null;
                string fyLabel = "";
                using (var fyCmd = conn.CreateCommand())
                {
                    fyCmd.CommandText = "SELECT FYId, FYLabel, FYStart, FYEnd FROM jeevika_erp.FinancialYear WHERE FYId = @fyid LIMIT 1";
                    fyCmd.Parameters.AddWithValue("@fyid", fyId);
                    using var rFy = fyCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        fyLabel = rFy["FYLabel"]?.ToString() ?? "";
                        if (rFy["FYStart"] != DBNull.Value) fyStart = Convert.ToDateTime(rFy["FYStart"]);
                        if (rFy["FYEnd"] != DBNull.Value) fyEnd = Convert.ToDateTime(rFy["FYEnd"]);
                    }
                }

                DateTime effectiveAsOn = asOnDate.HasValue ? asOnDate.Value.Date : (fyEnd.HasValue ? fyEnd.Value.Date : DateTime.Today);

                // 3. Resolve Previous FY (if comparePrevFY)
                int prevFyId = 0;
                string prevFyLabel = "";
                DateTime? prevFyStart = null;
                DateTime? prevFyEnd = null;
                if (comparePrevFY && fyStart.HasValue)
                {
                    using (var pFyCmd = conn.CreateCommand())
                    {
                        pFyCmd.CommandText = @"
                            SELECT FYId, FYLabel, FYStart, FYEnd 
                            FROM jeevika_erp.FinancialYear 
                            WHERE SocietyId = @sid AND FYEnd < @curStart
                            ORDER BY FYEnd DESC LIMIT 1";
                        pFyCmd.Parameters.AddWithValue("@sid", societyId);
                        pFyCmd.Parameters.AddWithValue("@curStart", fyStart.Value);
                        using var rP = pFyCmd.ExecuteReader();
                        if (rP.Read())
                        {
                            prevFyId = Convert.ToInt32(rP["FYId"]);
                            prevFyLabel = rP["FYLabel"]?.ToString() ?? "";
                            if (rP["FYStart"] != DBNull.Value) prevFyStart = Convert.ToDateTime(rP["FYStart"]);
                            if (rP["FYEnd"] != DBNull.Value) prevFyEnd = Convert.ToDateTime(rP["FYEnd"]);
                        }
                    }
                }

                // 4. Query All Accounts with Opening and Transactional balances up to effectiveAsOn
                using var cmd = conn.CreateCommand();
                var sql = @"
                    SELECT a.AccountId, a.AccCode, a.AccName, a.GroupId, 
                           COALESCE(g.GrpName, 'General') AS GrpName,
                           COALESCE(g.GrpCode, '') AS GrpCode,
                           a.GrpMainId,
                           COALESCE(ob.OpenBal, a.OpBal, 0) AS MasterOpBal,
                           COALESCE(ob.DrCr, a.OpDrCr, 'Dr') AS MasterOpDrCr,
                           COALESCE(SUM(CASE WHEN @hasBounds = TRUE AND vh.VoucherDate < @fyStart THEN vd.Debit ELSE 0 END), 0) AS PriorDebit,
                           COALESCE(SUM(CASE WHEN @hasBounds = TRUE AND vh.VoucherDate < @fyStart THEN vd.Credit ELSE 0 END), 0) AS PriorCredit,
                           COALESCE(SUM(CASE WHEN (@hasBounds = FALSE OR vh.VoucherDate >= @fyStart) AND vh.VoucherDate <= @asOn THEN vd.Debit ELSE 0 END), 0) AS TxnDebit,
                           COALESCE(SUM(CASE WHEN (@hasBounds = FALSE OR vh.VoucherDate >= @fyStart) AND vh.VoucherDate <= @asOn THEN vd.Credit ELSE 0 END), 0) AS TxnCredit
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                    LEFT JOIN jeevika_erp.SocVoucherDetail vd ON a.AccountId = vd.AccountId
                    LEFT JOIN jeevika_erp.SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId 
                          AND vh.SocietyId = @sid 
                          AND (vh.FYId = @fyid OR (@hasBounds = TRUE AND vh.VoucherDate >= @fyStart AND vh.VoucherDate <= @fyEnd))
                          AND vh.IsDeleted = FALSE
                    WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE
                    GROUP BY a.AccountId, a.AccCode, a.AccName, a.GroupId, g.GrpName, g.GrpCode, a.GrpMainId, ob.OpenBal, a.OpBal, ob.DrCr, a.OpDrCr
                    ORDER BY 
                        CASE a.GrpMainId 
                            WHEN 2 THEN 1 -- Liability
                            WHEN 1 THEN 2 -- Asset
                            WHEN 3 THEN 3 -- Income
                            WHEN 4 THEN 4 -- Expense
                            ELSE 5 
                        END, COALESCE(g.GrpName, 'General'), a.AccCode, a.AccName";

                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);
                cmd.Parameters.AddWithValue("@asOn", effectiveAsOn);
                cmd.Parameters.AddWithValue("@hasBounds", (fyStart.HasValue && fyEnd.HasValue));
                cmd.Parameters.AddWithValue("@fyStart", fyStart.HasValue ? fyStart.Value.Date : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@fyEnd", fyEnd.HasValue ? fyEnd.Value.Date : (object)DBNull.Value);

                var rawAccounts = new List<dynamic>();
                decimal totalIncome = 0;
                decimal totalExpense = 0;

                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var accId = Convert.ToInt32(r["AccountId"]);
                        var accCode = r["AccCode"].ToString() ?? "";
                        var accName = r["AccName"].ToString() ?? "";
                        var grpId = r["GroupId"] != DBNull.Value ? Convert.ToInt32(r["GroupId"]) : 0;
                        var grpName = r["GrpName"]?.ToString() ?? "General";
                        var grpCode = r["GrpCode"]?.ToString() ?? "";
                        int grpMain = Convert.ToInt32(r["GrpMainId"]);

                        decimal masterOpBal = Convert.ToDecimal(r["MasterOpBal"]);
                        string masterOpDrCr = r["MasterOpDrCr"]?.ToString() ?? "Dr";
                        decimal priorDebit = Convert.ToDecimal(r["PriorDebit"]);
                        decimal priorCredit = Convert.ToDecimal(r["PriorCredit"]);
                        decimal txnDebit = Convert.ToDecimal(r["TxnDebit"]);
                        decimal txnCredit = Convert.ToDecimal(r["TxnCredit"]);

                        decimal baseOpDr = masterOpDrCr.Equals("Dr", StringComparison.OrdinalIgnoreCase) ? masterOpBal : 0;
                        decimal baseOpCr = masterOpDrCr.Equals("Cr", StringComparison.OrdinalIgnoreCase) ? masterOpBal : 0;

                        decimal netPrior = (baseOpDr - baseOpCr) + (priorDebit - priorCredit);
                        decimal openingDr = netPrior >= 0 ? netPrior : 0;
                        decimal openingCr = netPrior < 0 ? Math.Abs(netPrior) : 0;

                        decimal netClosing = (openingDr - openingCr) + (txnDebit - txnCredit);
                        decimal closingDr = netClosing >= 0 ? netClosing : 0;
                        decimal closingCr = netClosing < 0 ? Math.Abs(netClosing) : 0;

                        decimal currentAmt = 0;
                        decimal prevAmt = 0;

                        if (grpMain == 1) // Asset (Dr normal)
                        {
                            currentAmt = closingDr - closingCr;
                            prevAmt = baseOpDr - baseOpCr;
                        }
                        else if (grpMain == 2) // Liability (Cr normal)
                        {
                            currentAmt = closingCr - closingDr;
                            prevAmt = baseOpCr - baseOpDr;
                        }
                        else if (grpMain == 3) // Income (Cr normal)
                        {
                            decimal inc = closingCr - closingDr;
                            totalIncome += inc;
                        }
                        else if (grpMain == 4) // Expense (Dr normal)
                        {
                            decimal exp = closingDr - closingCr;
                            totalExpense += exp;
                        }

                        rawAccounts.Add(new
                        {
                            AccountId = accId,
                            AccCode = accCode,
                            AccName = accName,
                            GroupId = grpId,
                            GroupName = grpName,
                            GroupCode = grpCode,
                            GrpMainId = grpMain,
                            CurrentAmount = currentAmt,
                            PrevAmount = prevAmt
                        });
                    }
                }

                decimal currentSurplus = totalIncome - totalExpense; // >0 Surplus, <0 Deficit

                // 5. Structure Liabilities & Assets into standard Schedule Groups
                var liabGroupsDict = new Dictionary<string, dynamic>();
                var assetGroupsDict = new Dictionary<string, dynamic>();

                foreach (var a in rawAccounts)
                {
                    if (a.GrpMainId == 2) // Liabilities
                    {
                        string gKey = a.GroupName;
                        if (!liabGroupsDict.ContainsKey(gKey))
                        {
                            liabGroupsDict[gKey] = new
                            {
                                GroupId = a.GroupId,
                                GroupCode = a.GroupCode,
                                GroupName = a.GroupName,
                                Accounts = new List<dynamic>(),
                                TotalCurrent = 0m,
                                TotalPrev = 0m
                            };
                        }
                        liabGroupsDict[gKey].Accounts.Add(new
                        {
                            accountId = a.AccountId,
                            accCode = a.AccCode,
                            accName = a.AccName,
                            currentAmount = (decimal)a.CurrentAmount,
                            prevAmount = (decimal)a.PrevAmount
                        });
                    }
                    else if (a.GrpMainId == 1) // Assets
                    {
                        string gKey = a.GroupName;
                        if (!assetGroupsDict.ContainsKey(gKey))
                        {
                            assetGroupsDict[gKey] = new
                            {
                                GroupId = a.GroupId,
                                GroupCode = a.GroupCode,
                                GroupName = a.GroupName,
                                Accounts = new List<dynamic>(),
                                TotalCurrent = 0m,
                                TotalPrev = 0m
                            };
                        }
                        assetGroupsDict[gKey].Accounts.Add(new
                        {
                            accountId = a.AccountId,
                            accCode = a.AccCode,
                            accName = a.AccName,
                            currentAmount = (decimal)a.CurrentAmount,
                            prevAmount = (decimal)a.PrevAmount
                        });
                    }
                }

                // Append Surplus / Deficit to Income & Expenditure Group in Liabilities
                string ieKey = liabGroupsDict.Keys.FirstOrDefault(k => k.IndexOf("Income & Expenditure", StringComparison.OrdinalIgnoreCase) >= 0) ?? "Income & Expenditure";
                if (!liabGroupsDict.ContainsKey(ieKey))
                {
                    liabGroupsDict[ieKey] = new
                    {
                        GroupId = 0,
                        GroupCode = "LI-08",
                        GroupName = "Income & Expenditure",
                        Accounts = new List<dynamic>(),
                        TotalCurrent = 0m,
                        TotalPrev = 0m
                    };
                }
                liabGroupsDict[ieKey].Accounts.Add(new
                {
                    accountId = 0,
                    accCode = "I&E-CY",
                    accName = currentSurplus >= 0 ? "Add: Surplus during the year" : "Less: Deficit during the year",
                    currentAmount = currentSurplus,
                    prevAmount = 0m,
                    isSurplusEntry = true
                });

                // Build Final Liabilities List with Group Totals
                var liabilitiesList = new List<object>();
                decimal grandTotalLiabCurrent = 0m;
                decimal grandTotalLiabPrev = 0m;

                foreach (var kvp in liabGroupsDict)
                {
                    var grp = kvp.Value;
                    decimal grpCur = 0m;
                    decimal grpPrev = 0m;
                    foreach (var item in grp.Accounts)
                    {
                        grpCur += (decimal)item.currentAmount;
                        grpPrev += (decimal)item.prevAmount;
                    }
                    grandTotalLiabCurrent += grpCur;
                    grandTotalLiabPrev += grpPrev;

                    liabilitiesList.Add(new
                    {
                        groupId = grp.GroupId,
                        groupCode = grp.GroupCode,
                        groupName = grp.GroupName,
                        totalCurrent = grpCur,
                        totalPrev = grpPrev,
                        accounts = grp.Accounts
                    });
                }

                // Build Final Assets List with Group Totals
                var assetsList = new List<object>();
                decimal grandTotalAssetCurrent = 0m;
                decimal grandTotalAssetPrev = 0m;

                foreach (var kvp in assetGroupsDict)
                {
                    var grp = kvp.Value;
                    decimal grpCur = 0m;
                    decimal grpPrev = 0m;
                    foreach (var item in grp.Accounts)
                    {
                        grpCur += (decimal)item.currentAmount;
                        grpPrev += (decimal)item.prevAmount;
                    }
                    grandTotalAssetCurrent += grpCur;
                    grandTotalAssetPrev += grpPrev;

                    assetsList.Add(new
                    {
                        groupId = grp.GroupId,
                        groupCode = grp.GroupCode,
                        groupName = grp.GroupName,
                        totalCurrent = grpCur,
                        totalPrev = grpPrev,
                        accounts = grp.Accounts
                    });
                }

                // 6. Member-wise Dues Breakup (if requested)
                var memberDuesList = new List<object>();
                decimal totalMemberDues = 0m;
                if (includeMemberBreakup)
                {
                    using var memCmd = conn.CreateCommand();
                    memCmd.CommandText = @"
                        SELECT m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo,
                               COALESCE(m.OpPrincipal, 0) + COALESCE(m.OpInterest, 0) AS OpDues,
                               COALESCE((SELECT SUM(b.BalanceAmount) FROM jeevika_erp.SocMemberBill b WHERE b.MemberId = m.MemberId AND b.SocietyId = @sid AND b.BillDate <= @asOn AND b.IsDeleted = FALSE), 0) AS BillBalance
                        FROM jeevika_erp.SocMember m
                        WHERE m.SocietyId = @sid AND m.IsDeleted = FALSE
                        ORDER BY m.Wing, m.FlatNo, m.MemCode";
                    memCmd.Parameters.AddWithValue("@sid", societyId);
                    memCmd.Parameters.AddWithValue("@asOn", effectiveAsOn);

                    using var rMem = memCmd.ExecuteReader();
                    while (rMem.Read())
                    {
                        var opDues = Convert.ToDecimal(rMem["OpDues"]);
                        var billBal = Convert.ToDecimal(rMem["BillBalance"]);
                        var bal = opDues + billBal;
                        if (bal > 0)
                        {
                            totalMemberDues += bal;
                            memberDuesList.Add(new
                            {
                                memberId = Convert.ToInt32(rMem["MemberId"]),
                                memCode = rMem["MemCode"]?.ToString() ?? "",
                                memName = rMem["MemName"]?.ToString() ?? "",
                                wing = rMem["Wing"]?.ToString() ?? "",
                                flatNo = rMem["FlatNo"]?.ToString() ?? "",
                                flatDisplay = $"{rMem["Wing"]}-{rMem["FlatNo"]}".Trim('-'),
                                dueAmount = bal
                            });
                        }
                    }
                }

                return Ok(new
                {
                    success = true,
                    society = new
                    {
                        societyName = socName,
                        registrationNo = regNo,
                        address,
                        city
                    },
                    asOnDate = effectiveAsOn.ToString("yyyy-MM-dd"),
                    asOnDateDisplay = effectiveAsOn.ToString("dd/MM/yyyy"),
                    currentFY = new
                    {
                        fyId,
                        fyLabel,
                        fyStart = fyStart.HasValue ? fyStart.Value.ToString("yyyy-MM-dd") : "",
                        fyEnd = fyEnd.HasValue ? fyEnd.Value.ToString("yyyy-MM-dd") : ""
                    },
                    prevFY = prevFyId > 0 ? new
                    {
                        fyId = prevFyId,
                        fyLabel = prevFyLabel,
                        fyStart = prevFyStart.HasValue ? prevFyStart.Value.ToString("yyyy-MM-dd") : "",
                        fyEnd = prevFyEnd.HasValue ? prevFyEnd.Value.ToString("yyyy-MM-dd") : "",
                        asOnDateDisplay = prevFyEnd.HasValue ? prevFyEnd.Value.ToString("dd/MM/yyyy") : ""
                    } : null,
                    surplusDeficit = new
                    {
                        totalIncome,
                        totalExpense,
                        surplus = currentSurplus,
                        isSurplus = currentSurplus >= 0
                    },
                    liabilities = liabilitiesList,
                    assets = assetsList,
                    memberDues = memberDuesList,
                    totalMemberDues,
                    totals = new
                    {
                        currentLiabilities = grandTotalLiabCurrent,
                        currentAssets = grandTotalAssetCurrent,
                        prevLiabilities = grandTotalLiabPrev,
                        prevAssets = grandTotalAssetPrev,
                        difference = Math.Abs(grandTotalLiabCurrent - grandTotalAssetCurrent),
                        isBalanced = (Math.Abs(grandTotalLiabCurrent - grandTotalAssetCurrent) <= 0.05m)
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/reports/income-expenditure?societyId=X&fyId=Y&fromDate=Z&toDate=W&comparePrevFY=true ───
        [HttpGet("income-expenditure")]
        public IActionResult GetIncomeExpenditure(
            [FromQuery] int societyId,
            [FromQuery] int fyId,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] bool comparePrevFY = true)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "societyId and fyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                MemberReceiptController.EnsureReceiptLedgerEntries(conn, societyId);

                // 1. Society Profile
                string socName = "", regNo = "", address = "", city = "";
                using (var sCmd = conn.CreateCommand())
                {
                    sCmd.CommandText = "SELECT SocietyName, RegistrationNo, Address, City FROM jeevika_erp.SocietyInfo WHERE SocietyId = @sid LIMIT 1";
                    sCmd.Parameters.AddWithValue("@sid", societyId);
                    using var rS = sCmd.ExecuteReader();
                    if (rS.Read())
                    {
                        socName = rS["SocietyName"]?.ToString() ?? "";
                        regNo   = rS["RegistrationNo"]?.ToString() ?? "";
                        address = rS["Address"]?.ToString() ?? "";
                        city    = rS["City"]?.ToString() ?? "";
                    }
                }

                // 2. Resolve Active FY
                DateTime? fyStart = null;
                DateTime? fyEnd = null;
                string fyLabel = "";
                using (var fyCmd = conn.CreateCommand())
                {
                    fyCmd.CommandText = "SELECT FYId, FYLabel, FYStart, FYEnd FROM jeevika_erp.FinancialYear WHERE FYId = @fyid LIMIT 1";
                    fyCmd.Parameters.AddWithValue("@fyid", fyId);
                    using var rFy = fyCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        fyLabel = rFy["FYLabel"]?.ToString() ?? "";
                        if (rFy["FYStart"] != DBNull.Value) fyStart = Convert.ToDateTime(rFy["FYStart"]);
                        if (rFy["FYEnd"] != DBNull.Value) fyEnd = Convert.ToDateTime(rFy["FYEnd"]);
                    }
                }

                DateTime effectiveFrom = fromDate.HasValue ? fromDate.Value.Date : (fyStart.HasValue ? fyStart.Value.Date : DateTime.Today);
                DateTime effectiveTo   = toDate.HasValue ? toDate.Value.Date : (fyEnd.HasValue ? fyEnd.Value.Date : DateTime.Today);

                // 3. Resolve Previous FY (if comparePrevFY)
                int prevFyId = 0;
                string prevFyLabel = "";
                DateTime? prevFyStart = null;
                DateTime? prevFyEnd = null;
                if (comparePrevFY && fyStart.HasValue)
                {
                    using (var pFyCmd = conn.CreateCommand())
                    {
                        pFyCmd.CommandText = @"
                            SELECT FYId, FYLabel, FYStart, FYEnd 
                            FROM jeevika_erp.FinancialYear 
                            WHERE SocietyId = @sid AND FYEnd < @curStart
                            ORDER BY FYEnd DESC LIMIT 1";
                        pFyCmd.Parameters.AddWithValue("@sid", societyId);
                        pFyCmd.Parameters.AddWithValue("@curStart", fyStart.Value);
                        using var rP = pFyCmd.ExecuteReader();
                        if (rP.Read())
                        {
                            prevFyId = Convert.ToInt32(rP["FYId"]);
                            prevFyLabel = rP["FYLabel"]?.ToString() ?? "";
                            if (rP["FYStart"] != DBNull.Value) prevFyStart = Convert.ToDateTime(rP["FYStart"]);
                            if (rP["FYEnd"] != DBNull.Value) prevFyEnd = Convert.ToDateTime(rP["FYEnd"]);
                        }
                    }
                }

                // 4. Query All Income (GrpMainId=3) & Expenditure (GrpMainId=4) Accounts
                using var cmd = conn.CreateCommand();
                var sql = @"
                    SELECT a.AccountId, a.AccCode, a.AccName, a.GroupId, 
                           COALESCE(g.GrpName, 'General') AS GrpName,
                           COALESCE(g.GrpCode, '') AS GrpCode,
                           a.GrpMainId,
                           COALESCE(SUM(CASE WHEN vh.VoucherDate >= @from AND vh.VoucherDate <= @to AND (vh.FYId = @fyid OR (@hasBounds = TRUE AND vh.VoucherDate >= @fyStart AND vh.VoucherDate <= @fyEnd)) THEN vd.Debit ELSE 0 END), 0) AS TxnDebit,
                           COALESCE(SUM(CASE WHEN vh.VoucherDate >= @from AND vh.VoucherDate <= @to AND (vh.FYId = @fyid OR (@hasBounds = TRUE AND vh.VoucherDate >= @fyStart AND vh.VoucherDate <= @fyEnd)) THEN vd.Credit ELSE 0 END), 0) AS TxnCredit,
                           COALESCE(SUM(CASE WHEN @hasPrev = TRUE AND (vh.FYId = @prevFyId OR (@hasPrevBounds = TRUE AND vh.VoucherDate >= @prevStart AND vh.VoucherDate <= @prevEnd)) THEN vd.Debit ELSE 0 END), 0) AS PrevDebit,
                           COALESCE(SUM(CASE WHEN @hasPrev = TRUE AND (vh.FYId = @prevFyId OR (@hasPrevBounds = TRUE AND vh.VoucherDate >= @prevStart AND vh.VoucherDate <= @prevEnd)) THEN vd.Credit ELSE 0 END), 0) AS PrevCredit
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    LEFT JOIN jeevika_erp.SocVoucherDetail vd ON a.AccountId = vd.AccountId
                    LEFT JOIN jeevika_erp.SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId 
                          AND vh.SocietyId = @sid 
                          AND vh.IsDeleted = FALSE
                    WHERE a.SocietyId = @sid AND a.GrpMainId IN (3, 4) AND a.IsDeleted = FALSE
                    GROUP BY a.AccountId, a.AccCode, a.AccName, a.GroupId, g.GrpName, g.GrpCode, a.GrpMainId
                    ORDER BY 
                        CASE a.GrpMainId 
                            WHEN 4 THEN 1 -- Expenditure first
                            WHEN 3 THEN 2 -- Income second
                            ELSE 3 
                        END, COALESCE(g.GrpName, 'General'), a.AccCode, a.AccName";

                cmd.CommandText = sql;
                cmd.Parameters.AddWithValue("@sid", societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);
                cmd.Parameters.AddWithValue("@from", effectiveFrom);
                cmd.Parameters.AddWithValue("@to", effectiveTo);
                cmd.Parameters.AddWithValue("@hasBounds", (fyStart.HasValue && fyEnd.HasValue));
                cmd.Parameters.AddWithValue("@fyStart", fyStart.HasValue ? fyStart.Value.Date : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@fyEnd", fyEnd.HasValue ? fyEnd.Value.Date : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@hasPrev", prevFyId > 0);
                cmd.Parameters.AddWithValue("@prevFyId", prevFyId);
                cmd.Parameters.AddWithValue("@hasPrevBounds", (prevFyStart.HasValue && prevFyEnd.HasValue));
                cmd.Parameters.AddWithValue("@prevStart", prevFyStart.HasValue ? prevFyStart.Value.Date : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@prevEnd", prevFyEnd.HasValue ? prevFyEnd.Value.Date : (object)DBNull.Value);

                var rawAccounts = new List<dynamic>();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        var accId = Convert.ToInt32(r["AccountId"]);
                        var accCode = r["AccCode"].ToString() ?? "";
                        var accName = r["AccName"].ToString() ?? "";
                        var grpId = r["GroupId"] != DBNull.Value ? Convert.ToInt32(r["GroupId"]) : 0;
                        var grpName = r["GrpName"]?.ToString() ?? "General";
                        var grpCode = r["GrpCode"]?.ToString() ?? "";
                        int grpMain = Convert.ToInt32(r["GrpMainId"]);

                        decimal txnDebit  = Convert.ToDecimal(r["TxnDebit"]);
                        decimal txnCredit = Convert.ToDecimal(r["TxnCredit"]);
                        decimal prevDebit  = Convert.ToDecimal(r["PrevDebit"]);
                        decimal prevCredit = Convert.ToDecimal(r["PrevCredit"]);

                        decimal currentAmt = 0;
                        decimal prevAmt = 0;

                        if (grpMain == 4) // Expenditure (Dr normal)
                        {
                            currentAmt = txnDebit - txnCredit;
                            prevAmt    = prevDebit - prevCredit;
                        }
                        else if (grpMain == 3) // Income (Cr normal)
                        {
                            currentAmt = txnCredit - txnDebit;
                            prevAmt    = prevCredit - prevDebit;
                        }

                        rawAccounts.Add(new
                        {
                            AccountId = accId,
                            AccCode = accCode,
                            AccName = accName,
                            GroupId = grpId,
                            GroupName = grpName,
                            GroupCode = grpCode,
                            GrpMainId = grpMain,
                            CurrentAmount = currentAmt,
                            PrevAmount = prevAmt
                        });
                    }
                }

                // 5. Structure into Groups
                var expGroupsDict = new Dictionary<string, dynamic>();
                var incGroupsDict = new Dictionary<string, dynamic>();

                decimal totalExpCurrent = 0m;
                decimal totalExpPrev = 0m;
                decimal totalIncCurrent = 0m;
                decimal totalIncPrev = 0m;

                foreach (var a in rawAccounts)
                {
                    if (a.GrpMainId == 4) // Expenditure
                    {
                        string gKey = a.GroupName;
                        if (!expGroupsDict.ContainsKey(gKey))
                        {
                            expGroupsDict[gKey] = new
                            {
                                GroupId = a.GroupId,
                                GroupCode = a.GroupCode,
                                GroupName = a.GroupName,
                                Accounts = new List<dynamic>(),
                                TotalCurrent = 0m,
                                TotalPrev = 0m
                            };
                        }
                        expGroupsDict[gKey].Accounts.Add(new
                        {
                            accountId = a.AccountId,
                            accCode = a.AccCode,
                            accName = a.AccName,
                            currentAmount = (decimal)a.CurrentAmount,
                            prevAmount = (decimal)a.PrevAmount
                        });
                        totalExpCurrent += (decimal)a.CurrentAmount;
                        totalExpPrev += (decimal)a.PrevAmount;
                    }
                    else if (a.GrpMainId == 3) // Income
                    {
                        string gKey = a.GroupName;
                        if (!incGroupsDict.ContainsKey(gKey))
                        {
                            incGroupsDict[gKey] = new
                            {
                                GroupId = a.GroupId,
                                GroupCode = a.GroupCode,
                                GroupName = a.GroupName,
                                Accounts = new List<dynamic>(),
                                TotalCurrent = 0m,
                                TotalPrev = 0m
                            };
                        }
                        incGroupsDict[gKey].Accounts.Add(new
                        {
                            accountId = a.AccountId,
                            accCode = a.AccCode,
                            accName = a.AccName,
                            currentAmount = (decimal)a.CurrentAmount,
                            prevAmount = (decimal)a.PrevAmount
                        });
                        totalIncCurrent += (decimal)a.CurrentAmount;
                        totalIncPrev += (decimal)a.PrevAmount;
                    }
                }

                // Build Final Expenditure Group List with Subtotals
                var expenditureList = new List<object>();
                foreach (var kvp in expGroupsDict)
                {
                    var grp = kvp.Value;
                    decimal grpCur = 0m;
                    decimal grpPrev = 0m;
                    foreach (var item in grp.Accounts)
                    {
                        grpCur += (decimal)item.currentAmount;
                        grpPrev += (decimal)item.prevAmount;
                    }
                    expenditureList.Add(new
                    {
                        groupId = grp.GroupId,
                        groupCode = grp.GroupCode,
                        groupName = grp.GroupName,
                        totalCurrent = grpCur,
                        totalPrev = grpPrev,
                        accounts = grp.Accounts
                    });
                }

                // Build Final Income Group List with Subtotals
                var incomeList = new List<object>();
                foreach (var kvp in incGroupsDict)
                {
                    var grp = kvp.Value;
                    decimal grpCur = 0m;
                    decimal grpPrev = 0m;
                    foreach (var item in grp.Accounts)
                    {
                        grpCur += (decimal)item.currentAmount;
                        grpPrev += (decimal)item.prevAmount;
                    }
                    incomeList.Add(new
                    {
                        groupId = grp.GroupId,
                        groupCode = grp.GroupCode,
                        groupName = grp.GroupName,
                        totalCurrent = grpCur,
                        totalPrev = grpPrev,
                        accounts = grp.Accounts
                    });
                }

                // 6. Calculate Surplus or Deficit
                decimal netSurplus = totalIncCurrent - totalExpCurrent;
                decimal prevNetSurplus = totalIncPrev - totalExpPrev;

                decimal grandTotalCurrent = Math.Max(totalIncCurrent, totalExpCurrent);
                decimal grandTotalPrev    = Math.Max(totalIncPrev, totalExpPrev);

                return Ok(new
                {
                    success = true,
                    society = new
                    {
                        societyName = socName,
                        registrationNo = regNo,
                        address,
                        city
                    },
                    period = new
                    {
                        fromDate = effectiveFrom.ToString("yyyy-MM-dd"),
                        toDate = effectiveTo.ToString("yyyy-MM-dd"),
                        fromDisplay = effectiveFrom.ToString("dd/MM/yyyy"),
                        toDisplay = effectiveTo.ToString("dd/MM/yyyy"),
                        fyLabel
                    },
                    prevPeriod = prevFyId > 0 ? new
                    {
                        fyId = prevFyId,
                        fyLabel = prevFyLabel,
                        fromDate = prevFyStart.HasValue ? prevFyStart.Value.ToString("yyyy-MM-dd") : "",
                        toDate = prevFyEnd.HasValue ? prevFyEnd.Value.ToString("yyyy-MM-dd") : "",
                        fromDisplay = prevFyStart.HasValue ? prevFyStart.Value.ToString("dd/MM/yyyy") : "",
                        toDisplay = prevFyEnd.HasValue ? prevFyEnd.Value.ToString("dd/MM/yyyy") : ""
                    } : null,
                    expenditure = expenditureList,
                    income = incomeList,
                    surplusDeficit = new
                    {
                        totalIncome = totalIncCurrent,
                        totalExpenditure = totalExpCurrent,
                        prevTotalIncome = totalIncPrev,
                        prevTotalExpenditure = totalExpPrev,
                        netAmount = netSurplus,
                        prevNetAmount = prevNetSurplus,
                        isSurplus = netSurplus >= 0,
                        label = netSurplus >= 0 ? "Excess of Income over Expenditure A/c" : "Excess of Expenditure over Income A/c"
                    },
                    totals = new
                    {
                        totalExpCurrent,
                        totalIncCurrent,
                        totalExpPrev,
                        totalIncPrev,
                        grandTotalCurrent,
                        grandTotalPrev,
                        difference = Math.Abs(grandTotalCurrent - grandTotalCurrent), // always 0.00 after surplus/deficit
                        isBalanced = true
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/reports/ledger?societyId=X&fyId=Y&accountId=Z&mainGroupId=A&groupId=B&fromAccCode=C&toAccCode=D&fromDate=E&toDate=F&billingMode=summary|detail&hideBlank=false
        [HttpGet("ledger")]
        public IActionResult GetLedger(
            [FromQuery] int societyId, 
            [FromQuery] int fyId, 
            [FromQuery] int? accountId = null,
            [FromQuery] int? mainGroupId = null,
            [FromQuery] int? groupId = null,
            [FromQuery] string? fromAccCode = null,
            [FromQuery] string? toAccCode = null,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] string? billingMode = "summary",
            [FromQuery] bool hideBlank = false)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "societyId and fyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                MemberReceiptController.EnsureReceiptLedgerEntries(conn, societyId);

                // Resolve FY date bounds
                DateTime? fyStart = fromDate;
                DateTime? fyEnd = toDate;
                if (!fyStart.HasValue || !fyEnd.HasValue)
                {
                    using var fyCmd = conn.CreateCommand();
                    fyCmd.CommandText = "SELECT FYStart, FYEnd FROM jeevika_erp.FinancialYear WHERE FYId = @fyid";
                    fyCmd.Parameters.AddWithValue("@fyid", fyId);
                    using var rFy = fyCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        if (!fyStart.HasValue) fyStart = Convert.ToDateTime(rFy["FYStart"]);
                        if (!fyEnd.HasValue) fyEnd = Convert.ToDateTime(rFy["FYEnd"]);
                    }
                }

                // 1. Fetch matching accounts
                using var cmdA = conn.CreateCommand();
                var sqlA = @"
                    SELECT a.AccountId, a.AccCode, a.AccName, a.GrpMainId, COALESCE(g.GrpName, 'General') AS GrpName
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE";

                if (accountId.HasValue && accountId.Value > 0)
                {
                    sqlA += " AND a.AccountId = @aid";
                    cmdA.Parameters.AddWithValue("@aid", accountId.Value);
                }
                else
                {
                    if (mainGroupId.HasValue && mainGroupId.Value > 0)
                    {
                        sqlA += " AND a.GrpMainId = @mgid";
                        cmdA.Parameters.AddWithValue("@mgid", mainGroupId.Value);
                    }
                    if (groupId.HasValue && groupId.Value > 0)
                    {
                        sqlA += " AND a.GroupId = @gid";
                        cmdA.Parameters.AddWithValue("@gid", groupId.Value);
                    }
                    if (!string.IsNullOrWhiteSpace(fromAccCode))
                    {
                        sqlA += " AND a.AccCode >= @fromCode";
                        cmdA.Parameters.AddWithValue("@fromCode", fromAccCode.Trim());
                    }
                    if (!string.IsNullOrWhiteSpace(toAccCode))
                    {
                        sqlA += " AND a.AccCode <= @toCode";
                        cmdA.Parameters.AddWithValue("@toCode", toAccCode.Trim());
                    }
                }

                sqlA += @" ORDER BY 
                            CASE a.GrpMainId 
                                WHEN 3 THEN 1 -- Income
                                WHEN 4 THEN 2 -- Expenditure
                                WHEN 1 THEN 3 -- Asset
                                WHEN 2 THEN 4 -- Liability
                                ELSE 5 
                            END, a.AccCode, a.AccName";

                cmdA.CommandText = sqlA;
                cmdA.Parameters.AddWithValue("@sid", societyId);

                var targetAccounts = new List<(int aid, string code, string name, int grpMain, string grpName)>();
                using (var rA = cmdA.ExecuteReader())
                {
                    while (rA.Read())
                    {
                        targetAccounts.Add((
                            Convert.ToInt32(rA["AccountId"]),
                            rA["AccCode"].ToString() ?? "",
                            rA["AccName"].ToString() ?? "",
                            rA["GrpMainId"] != DBNull.Value ? Convert.ToInt32(rA["GrpMainId"]) : 0,
                            rA["GrpName"].ToString() ?? ""
                        ));
                    }
                }

                if (targetAccounts.Count == 0)
                {
                    return Ok(new
                    {
                        success = true,
                        accounts = new List<object>(),
                        totalDebit = 0,
                        totalCredit = 0,
                        count = 0
                    });
                }

                var reportAccounts = new List<object>();
                decimal grandTotalDr = 0;
                decimal grandTotalCr = 0;

                foreach (var acc in targetAccounts)
                {
                    // 2. Fetch Base Opening Balance
                    using var cmdOB = conn.CreateCommand();
                    cmdOB.CommandText = @"
                        SELECT COALESCE(ob.OpenBal, a.OpBal, 0) AS OpenBal, COALESCE(ob.DrCr, a.OpDrCr, 'Dr') AS DrCr
                        FROM jeevika_erp.SocAccount a
                        LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                        WHERE a.AccountId = @aid";
                    cmdOB.Parameters.AddWithValue("@fyid", fyId);
                    cmdOB.Parameters.AddWithValue("@aid",  acc.aid);

                    decimal baseOpBal = 0;
                    string baseOpDrCr = "Dr";
                    using (var rOB = cmdOB.ExecuteReader())
                    {
                        if (rOB.Read())
                        {
                            baseOpBal = Convert.ToDecimal(rOB["OpenBal"]);
                            baseOpDrCr = rOB["DrCr"].ToString() ?? "Dr";
                        }
                    }

                    // 3. Compute Effective Opening Balance if fromDate is provided
                    decimal effectiveOpBal = baseOpBal;
                    string effectiveOpDrCr = baseOpDrCr;
                    decimal baseNet = (baseOpDrCr == "Dr" ? baseOpBal : -baseOpBal);

                    if (fromDate.HasValue)
                    {
                        using var cmdPrior = conn.CreateCommand();
                        cmdPrior.CommandText = @"
                            SELECT COALESCE(SUM(vd.Debit), 0) AS PriorDebit,
                                   COALESCE(SUM(vd.Credit), 0) AS PriorCredit
                            FROM jeevika_erp.SocVoucherDetail vd
                            JOIN jeevika_erp.SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId
                            WHERE vh.SocietyId = @sid 
                              AND (vh.FYId = @fyid OR (vh.VoucherDate >= @fyStart AND vh.VoucherDate <= @fyEnd))
                              AND vd.AccountId = @aid 
                              AND vh.VoucherDate < @fromDate 
                              AND vh.IsDeleted = FALSE";

                        cmdPrior.Parameters.AddWithValue("@sid", societyId);
                        cmdPrior.Parameters.AddWithValue("@fyid", fyId);
                        cmdPrior.Parameters.AddWithValue("@aid", acc.aid);
                        cmdPrior.Parameters.AddWithValue("@fromDate", fromDate.Value.Date);
                        cmdPrior.Parameters.AddWithValue("@fyStart", fyStart ?? (object)DBNull.Value);
                        cmdPrior.Parameters.AddWithValue("@fyEnd", fyEnd ?? (object)DBNull.Value);

                        using var rPrior = cmdPrior.ExecuteReader();
                        if (rPrior.Read())
                        {
                            decimal priorDebit = Convert.ToDecimal(rPrior["PriorDebit"]);
                            decimal priorCredit = Convert.ToDecimal(rPrior["PriorCredit"]);
                            decimal priorNet = priorDebit - priorCredit;
                            decimal totalOpNet = baseNet + priorNet;

                            effectiveOpBal = Math.Abs(totalOpNet);
                            effectiveOpDrCr = totalOpNet >= 0 ? "Dr" : "Cr";
                        }
                    }

                    // 4. Fetch Detailed Transactions (from SocVoucherHeader/SocVoucherDetail)
                    using var cmdT = conn.CreateCommand();
                    var sqlT = @"
                        SELECT vd.DetailId, vh.VoucherId, vh.VoucherNo, vh.VoucherType, vh.VoucherDate,
                               vh.ChqNo, vh.ChqDate, vh.BankName, vh.PersonName,
                               vh.Narration AS HeaderNarr, vd.Narration AS LineNarr,
                               vd.Debit, vd.Credit,
                               (
                                   SELECT STRING_AGG(DISTINCT CONCAT(COALESCE(a2.AccName, vd2.AccountName), ' [', COALESCE(a2.AccCode, vd2.AccountCode), ']'), ' / ')
                                   FROM jeevika_erp.SocVoucherDetail vd2
                                   LEFT JOIN jeevika_erp.SocAccount a2 ON vd2.AccountId = a2.AccountId
                                   WHERE vd2.VoucherId = vh.VoucherId 
                                      AND (
                                          (vd2.AccountId IS NOT NULL AND vd.AccountId IS NOT NULL AND vd2.AccountId != vd.AccountId)
                                          OR (vd2.AccountId IS NULL AND vd.AccountId IS NOT NULL)
                                          OR (vd2.AccountId IS NOT NULL AND vd.AccountId IS NULL)
                                          OR (vd2.DetailId != vd.DetailId AND COALESCE(vd2.AccountCode, '') != COALESCE(vd.AccountCode, ''))
                                      )
                               ) AS ContraAccount
                        FROM jeevika_erp.SocVoucherDetail vd
                        JOIN jeevika_erp.SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId
                        WHERE vh.SocietyId = @sid 
                          AND (vh.FYId = @fyid OR (vh.VoucherDate >= @fyStart AND vh.VoucherDate <= @fyEnd))
                          AND (vd.AccountId = @aid OR (vd.AccountCode IS NOT NULL AND vd.AccountCode = @accCode))
                          AND vh.IsDeleted = FALSE";

                    if (fromDate.HasValue)
                    {
                        sqlT += " AND vh.VoucherDate >= @fromDate";
                        cmdT.Parameters.AddWithValue("@fromDate", fromDate.Value.Date);
                    }
                    if (toDate.HasValue)
                    {
                        sqlT += " AND vh.VoucherDate <= @toDate";
                        cmdT.Parameters.AddWithValue("@toDate", toDate.Value.Date);
                    }

                    sqlT += " ORDER BY vh.VoucherDate ASC, vh.VoucherId ASC, vd.DetailId ASC";
                    cmdT.CommandText = sqlT;
                    cmdT.Parameters.AddWithValue("@sid", societyId);
                    cmdT.Parameters.AddWithValue("@fyid", fyId);
                    cmdT.Parameters.AddWithValue("@aid", acc.aid);
                    cmdT.Parameters.AddWithValue("@accCode", acc.code);
                    cmdT.Parameters.AddWithValue("@fyStart", fyStart ?? (object)DBNull.Value);
                    cmdT.Parameters.AddWithValue("@fyEnd", fyEnd ?? (object)DBNull.Value);

                    bool isSummaryBilling = !string.Equals(billingMode, "detail", StringComparison.OrdinalIgnoreCase);
                    var rawTxList = new List<LedgerItemInternal>();

                    using (var rT = cmdT.ExecuteReader())
                    {
                        while (rT.Read())
                        {
                            decimal dr = Convert.ToDecimal(rT["Debit"]);
                            decimal cr = Convert.ToDecimal(rT["Credit"]);
                            string contra = rT["ContraAccount"] != DBNull.Value ? rT["ContraAccount"].ToString() ?? "" : "";
                            string headerNarr = rT["HeaderNarr"] != DBNull.Value ? rT["HeaderNarr"].ToString() ?? "" : "";
                            string lineNarr = rT["LineNarr"] != DBNull.Value ? rT["LineNarr"].ToString() ?? "" : "";
                            string person = rT["PersonName"] != DBNull.Value ? rT["PersonName"].ToString() ?? "" : "";
                            string chqNo = rT["ChqNo"] != DBNull.Value ? rT["ChqNo"].ToString() ?? "" : "";
                            string bankName = rT["BankName"] != DBNull.Value ? rT["BankName"].ToString() ?? "" : "";
                            string chqDate = rT["ChqDate"] != DBNull.Value ? ((DateTime)rT["ChqDate"]).ToString("yyyy-MM-dd") : "";

                            string displayNarr = person;
                            if (!string.IsNullOrWhiteSpace(headerNarr))
                            {
                                if (!string.IsNullOrWhiteSpace(displayNarr)) displayNarr += " | " + headerNarr;
                                else displayNarr = headerNarr;
                            }
                            if (!string.IsNullOrWhiteSpace(lineNarr) && lineNarr != headerNarr)
                            {
                                if (!string.IsNullOrWhiteSpace(displayNarr)) displayNarr += " (" + lineNarr + ")";
                                else displayNarr = lineNarr;
                            }

                            DateTime vDate = (DateTime)rT["VoucherDate"];

                            rawTxList.Add(new LedgerItemInternal
                            {
                                DetailId = Convert.ToInt32(rT["DetailId"]),
                                VoucherId = Convert.ToInt32(rT["VoucherId"]),
                                VoucherNo = rT["VoucherNo"].ToString() ?? "",
                                VoucherType = rT["VoucherType"].ToString() ?? "",
                                VoucherDate = vDate,
                                ContraAccount = string.IsNullOrWhiteSpace(contra) ? "—" : contra,
                                PersonName = person,
                                Narration = displayNarr,
                                ChqNo = chqNo,
                                ChqDate = chqDate,
                                BankName = bankName,
                                Debit = dr,
                                Credit = cr
                            });
                        }
                    }

                    // 5. Fetch Member Bill transactions for Dues From Members and Income Heads
                    if (acc.code.Equals("ASS-1025", StringComparison.OrdinalIgnoreCase) || 
                        acc.code.Equals("LIA-1020", StringComparison.OrdinalIgnoreCase) || 
                        acc.name.Equals("Dues From Members", StringComparison.OrdinalIgnoreCase))
                    {
                        if (isSummaryBilling)
                        {
                            using var cmdBSum = conn.CreateCommand();
                            var sqlBSum = @"
                                SELECT b.BillDate, COUNT(DISTINCT b.BillId) AS BillCount, SUM(b.TotalAmount) AS TotalAmount
                                FROM jeevika_erp.SocMemberBill b
                                WHERE b.SocietyId = @sid 
                                  AND (b.FYId = @fyid OR (b.BillDate >= @fyStart AND b.BillDate <= @fyEnd)) 
                                  AND b.IsDeleted = FALSE";
                            if (fromDate.HasValue) sqlBSum += " AND b.BillDate >= @fromDate";
                            if (toDate.HasValue) sqlBSum += " AND b.BillDate <= @toDate";
                            sqlBSum += " GROUP BY b.BillDate ORDER BY b.BillDate ASC";

                            cmdBSum.CommandText = sqlBSum;
                            cmdBSum.Parameters.AddWithValue("@sid", societyId);
                            cmdBSum.Parameters.AddWithValue("@fyid", fyId);
                            cmdBSum.Parameters.AddWithValue("@fyStart", fyStart ?? (object)DBNull.Value);
                            cmdBSum.Parameters.AddWithValue("@fyEnd", fyEnd ?? (object)DBNull.Value);
                            if (fromDate.HasValue) cmdBSum.Parameters.AddWithValue("@fromDate", fromDate.Value.Date);
                            if (toDate.HasValue) cmdBSum.Parameters.AddWithValue("@toDate", toDate.Value.Date);

                            using var rBSum = cmdBSum.ExecuteReader();
                            while (rBSum.Read())
                            {
                                decimal amt = Convert.ToDecimal(rBSum["TotalAmount"]);
                                int count = Convert.ToInt32(rBSum["BillCount"]);
                                DateTime bDate = (DateTime)rBSum["BillDate"];

                                rawTxList.Add(new LedgerItemInternal
                                {
                                    DetailId = 0,
                                    VoucherId = 0,
                                    VoucherNo = "MEMBER BILL",
                                    VoucherType = "Member Bill",
                                    VoucherDate = bDate,
                                    ContraAccount = "Member Income Heads",
                                    PersonName = "By Member Billing",
                                    Narration = $"By Monthly Member Billing ({count} {(count == 1 ? "Member" : "Members")})",
                                    ChqNo = "—",
                                    ChqDate = "",
                                    BankName = "",
                                    Debit = amt,
                                    Credit = 0m
                                });
                            }
                        }
                        else
                        {
                            using var cmdB = conn.CreateCommand();
                            var sqlB = @"
                                SELECT b.BillId, b.BillNo, b.BillDate, m.MemName AS MemberName, b.TotalAmount, b.Period, b.Particular1
                                FROM jeevika_erp.SocMemberBill b
                                JOIN jeevika_erp.SocMember m ON b.MemberId = m.MemberId
                                WHERE b.SocietyId = @sid AND (b.FYId = @fyid OR (b.BillDate >= @fyStart AND b.BillDate <= @fyEnd)) AND b.IsDeleted = FALSE";
                            if (fromDate.HasValue) sqlB += " AND b.BillDate >= @fromDate";
                            if (toDate.HasValue) sqlB += " AND b.BillDate <= @toDate";
                            sqlB += " ORDER BY b.BillDate ASC, b.BillId ASC";

                            cmdB.CommandText = sqlB;
                            cmdB.Parameters.AddWithValue("@sid", societyId);
                            cmdB.Parameters.AddWithValue("@fyid", fyId);
                            cmdB.Parameters.AddWithValue("@fyStart", fyStart ?? (object)DBNull.Value);
                            cmdB.Parameters.AddWithValue("@fyEnd", fyEnd ?? (object)DBNull.Value);
                            if (fromDate.HasValue) cmdB.Parameters.AddWithValue("@fromDate", fromDate.Value.Date);
                            if (toDate.HasValue) cmdB.Parameters.AddWithValue("@toDate", toDate.Value.Date);

                            using var rB = cmdB.ExecuteReader();
                            while (rB.Read())
                            {
                                decimal amt = Convert.ToDecimal(rB["TotalAmount"]);
                                string bNo = rB["BillNo"].ToString() ?? "";
                                string bMem = rB["MemberName"].ToString() ?? "";
                                string bPeriod = rB["Period"].ToString() ?? "";
                                string bPart = rB["Particular1"]?.ToString() ?? "";
                                string narr = $"{bMem} - {bPeriod} ({bPart})";
                                DateTime bDate = (DateTime)rB["BillDate"];

                                rawTxList.Add(new LedgerItemInternal
                                {
                                    DetailId = 0,
                                    VoucherId = Convert.ToInt32(rB["BillId"]),
                                    VoucherNo = bNo,
                                    VoucherType = "Member Bill",
                                    VoucherDate = bDate,
                                    ContraAccount = "Member Income Heads",
                                    PersonName = bMem,
                                    Narration = narr,
                                    ChqNo = "—",
                                    ChqDate = "",
                                    BankName = "",
                                    Debit = amt,
                                    Credit = 0m
                                });
                            }
                        }
                    }
                    else
                    {
                        if (isSummaryBilling)
                        {
                            using var cmdBISum = conn.CreateCommand();
                            var sqlBISum = @"
                                SELECT b.BillDate, 
                                       COUNT(DISTINCT b.BillId) AS BillCount,
                                       SUM(bi.Amount) AS TotalAmount
                                FROM jeevika_erp.SocMemberBillItem bi
                                JOIN jeevika_erp.SocMemberBill b ON bi.BillId = b.BillId
                                WHERE b.SocietyId = @sid 
                                  AND (b.FYId = @fyid OR (b.BillDate >= @fyStart AND b.BillDate <= @fyEnd))
                                  AND (bi.AccountCode = @accCode OR LOWER(bi.AccountName) = LOWER(@accName))
                                  AND b.IsDeleted = FALSE";
                            if (fromDate.HasValue) sqlBISum += " AND b.BillDate >= @fromDate";
                            if (toDate.HasValue) sqlBISum += " AND b.BillDate <= @toDate";
                            sqlBISum += " GROUP BY b.BillDate ORDER BY b.BillDate ASC";

                            cmdBISum.CommandText = sqlBISum;
                            cmdBISum.Parameters.AddWithValue("@sid", societyId);
                            cmdBISum.Parameters.AddWithValue("@fyid", fyId);
                            cmdBISum.Parameters.AddWithValue("@accCode", acc.code);
                            cmdBISum.Parameters.AddWithValue("@accName", acc.name);
                            cmdBISum.Parameters.AddWithValue("@fyStart", fyStart ?? (object)DBNull.Value);
                            cmdBISum.Parameters.AddWithValue("@fyEnd", fyEnd ?? (object)DBNull.Value);
                            if (fromDate.HasValue) cmdBISum.Parameters.AddWithValue("@fromDate", fromDate.Value.Date);
                            if (toDate.HasValue) cmdBISum.Parameters.AddWithValue("@toDate", toDate.Value.Date);

                            using var rBISum = cmdBISum.ExecuteReader();
                            while (rBISum.Read())
                            {
                                decimal amt = Convert.ToDecimal(rBISum["TotalAmount"]);
                                int count = Convert.ToInt32(rBISum["BillCount"]);
                                DateTime bDate = (DateTime)rBISum["BillDate"];

                                rawTxList.Add(new LedgerItemInternal
                                {
                                    DetailId = 0,
                                    VoucherId = 0,
                                    VoucherNo = "MEMBER BILL",
                                    VoucherType = "Member Bill",
                                    VoucherDate = bDate,
                                    ContraAccount = "Dues From Members [ASS-1025]",
                                    PersonName = "By Member Billing",
                                    Narration = $"By Monthly Member Billing ({count} {(count == 1 ? "Bill" : "Bills")})",
                                    ChqNo = "—",
                                    ChqDate = "",
                                    BankName = "",
                                    Debit = 0m,
                                    Credit = amt
                                });
                            }
                        }
                        else
                        {
                            using var cmdBI = conn.CreateCommand();
                            var sqlBI = @"
                                SELECT bi.ItemId, b.BillId, b.BillNo, b.BillDate, m.MemName AS MemberName, bi.AccountCode, bi.AccountName, bi.Amount
                                FROM jeevika_erp.SocMemberBillItem bi
                                JOIN jeevika_erp.SocMemberBill b ON bi.BillId = b.BillId
                                JOIN jeevika_erp.SocMember m ON b.MemberId = m.MemberId
                                WHERE b.SocietyId = @sid 
                                  AND (b.FYId = @fyid OR (b.BillDate >= @fyStart AND b.BillDate <= @fyEnd))
                                  AND (bi.AccountCode = @accCode OR LOWER(bi.AccountName) = LOWER(@accName))
                                  AND b.IsDeleted = FALSE";
                            if (fromDate.HasValue) sqlBI += " AND b.BillDate >= @fromDate";
                            if (toDate.HasValue) sqlBI += " AND b.BillDate <= @toDate";
                            sqlBI += " ORDER BY b.BillDate ASC, b.BillId ASC";

                            cmdBI.CommandText = sqlBI;
                            cmdBI.Parameters.AddWithValue("@sid", societyId);
                            cmdBI.Parameters.AddWithValue("@fyid", fyId);
                            cmdBI.Parameters.AddWithValue("@accCode", acc.code);
                            cmdBI.Parameters.AddWithValue("@accName", acc.name);
                            cmdBI.Parameters.AddWithValue("@fyStart", fyStart ?? (object)DBNull.Value);
                            cmdBI.Parameters.AddWithValue("@fyEnd", fyEnd ?? (object)DBNull.Value);
                            if (fromDate.HasValue) cmdBI.Parameters.AddWithValue("@fromDate", fromDate.Value.Date);
                            if (toDate.HasValue) cmdBI.Parameters.AddWithValue("@toDate", toDate.Value.Date);

                            using var rBI = cmdBI.ExecuteReader();
                            while (rBI.Read())
                            {
                                decimal amt = Convert.ToDecimal(rBI["Amount"]);
                                string bNo = rBI["BillNo"].ToString() ?? "";
                                string bMem = rBI["MemberName"].ToString() ?? "";
                                string hName = rBI["AccountName"].ToString() ?? "";
                                DateTime bDate = (DateTime)rBI["BillDate"];

                                rawTxList.Add(new LedgerItemInternal
                                {
                                    DetailId = Convert.ToInt32(rBI["ItemId"]),
                                    VoucherId = Convert.ToInt32(rBI["BillId"]),
                                    VoucherNo = bNo,
                                    VoucherType = "Member Bill",
                                    VoucherDate = bDate,
                                    ContraAccount = "Dues From Members [ASS-1025]",
                                    PersonName = bMem,
                                    Narration = $"{bMem} - {hName}",
                                    ChqNo = "—",
                                    ChqDate = "",
                                    BankName = "",
                                    Debit = 0m,
                                    Credit = amt
                                });
                            }
                        }
                    }

                    // Sort chronologically
                    rawTxList = rawTxList.OrderBy(x => x.VoucherDate).ThenBy(x => x.VoucherId).ThenBy(x => x.DetailId).ToList();

                    // Calculate running balance
                    decimal runningBal = effectiveOpDrCr == "Dr" ? effectiveOpBal : -effectiveOpBal;
                    decimal totalDr = 0, totalCr = 0;
                    var transactions = new List<object>();

                    foreach (var txItem in rawTxList)
                    {
                        totalDr += txItem.Debit;
                        totalCr += txItem.Credit;
                        runningBal += (txItem.Debit - txItem.Credit);

                        transactions.Add(new
                        {
                            detailId      = txItem.DetailId,
                            voucherId     = txItem.VoucherId,
                            voucherNo     = txItem.VoucherNo,
                            voucherType   = txItem.VoucherType,
                            voucherDate   = txItem.VoucherDate.ToString("yyyy-MM-dd"),
                            contraAccount = txItem.ContraAccount,
                            personName    = txItem.PersonName,
                            narration     = txItem.Narration,
                            chqNo         = txItem.ChqNo,
                            chqDate       = txItem.ChqDate,
                            bankName      = txItem.BankName,
                            debit         = txItem.Debit,
                            credit        = txItem.Credit,
                            runningBal    = Math.Abs(runningBal),
                            balanceDrCr   = runningBal >= 0 ? "Dr" : "Cr"
                        });
                    }

                    // If hideBlank is requested, skip accounts with 0 opening balance and 0 transactions
                    if (hideBlank && effectiveOpBal == 0 && totalDr == 0 && totalCr == 0 && transactions.Count == 0)
                    {
                        continue;
                    }

                    decimal closingBal = Math.Abs(runningBal);
                    string closingDrCr = runningBal >= 0 ? "Dr" : "Cr";

                    grandTotalDr += totalDr;
                    grandTotalCr += totalCr;

                    reportAccounts.Add(new
                    {
                        accountId   = acc.aid,
                        accCode     = acc.code,
                        accName     = acc.name,
                        grpMainId   = acc.grpMain,
                        grpName     = acc.grpName,
                        opBal       = effectiveOpBal,
                        opDrCr      = effectiveOpDrCr,
                        totalDebit  = totalDr,
                        totalCredit = totalCr,
                        closingBalance = closingBal,
                        closingDrCr = closingDrCr,
                        transactions
                    });
                }

                // If single account requested, maintain flat compatibility fields
                object? firstAcc = reportAccounts.FirstOrDefault();
                decimal singleOp = 0; string singleOpDrCr = "Dr";
                decimal singleClose = 0; string singleCloseDrCr = "Dr";
                object? singleAccInfo = null;
                var singleTx = new List<object>();

                if (reportAccounts.Count == 1 && firstAcc != null)
                {
                    dynamic f = firstAcc;
                    singleOp = f.opBal;
                    singleOpDrCr = f.opDrCr;
                    singleClose = f.closingBalance;
                    singleCloseDrCr = f.closingDrCr;
                    singleAccInfo = new { accountId = f.accountId, accCode = f.accCode, accName = f.accName, grpMainId = f.grpMainId, grpName = f.grpName };
                    singleTx = f.transactions;
                }

                return Ok(new
                {
                    success = true,
                    accounts = reportAccounts,
                    accountCount = reportAccounts.Count,
                    totalDebit = grandTotalDr,
                    totalCredit = grandTotalCr,
                    // Backwards compatibility for single account queries:
                    accountInfo = singleAccInfo,
                    opBal = singleOp,
                    opDrCr = singleOpDrCr,
                    closingBalance = singleClose,
                    closingDrCr = singleCloseDrCr,
                    transactions = singleTx
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/reports/outstanding?societyId=X&fyId=Y ──────
        [HttpGet("outstanding")]
        public IActionResult GetOutstandingList([FromQuery] int societyId, [FromQuery] int fyId)
        {
            if (societyId <= 0 || fyId <= 0)
                return BadRequest(new { success = false, message = "societyId and fyId are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd = conn.CreateCommand();

                cmd.CommandText = @"
                    SELECT m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo, m.ContactNo,
                           COALESCE(SUM(b.BalanceAmount), 0) AS TotalOutstanding
                    FROM jeevika_erp.SocMember m
                    LEFT JOIN jeevika_erp.SocMemberBill b ON m.MemberId = b.MemberId AND b.FYId = @fyid AND b.IsDeleted = FALSE
                    WHERE m.SocietyId = @sid AND m.IsDeleted = FALSE
                    GROUP BY m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo, m.ContactNo
                    HAVING COALESCE(SUM(b.BalanceAmount), 0) > 0
                    ORDER BY m.Wing, m.FlatNo";

                cmd.Parameters.AddWithValue("@sid",  societyId);
                cmd.Parameters.AddWithValue("@fyid", fyId);

                var list = new List<object>();
                decimal grandTotal = 0;

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    decimal amt = Convert.ToDecimal(r["TotalOutstanding"]);
                    grandTotal += amt;

                    list.Add(new
                    {
                        memberId  = Convert.ToInt32(r["MemberId"]),
                        memCode   = r["MemCode"].ToString() ?? "",
                        memName   = r["MemName"].ToString() ?? "",
                        wing      = r["Wing"].ToString() ?? "",
                        flatNo    = r["FlatNo"].ToString() ?? "",
                        contactNo = r["ContactNo"]?.ToString() ?? "",
                        totalOutstanding = amt
                    });
                }

                return Ok(new
                {
                    success = true,
                    data = list,
                    totalOutstanding = grandTotal,
                    count = list.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private class LedgerItemInternal
        {
            public int DetailId { get; set; }
            public int VoucherId { get; set; }
            public string VoucherNo { get; set; } = "";
            public string VoucherType { get; set; } = "";
            public DateTime VoucherDate { get; set; }
            public string ContraAccount { get; set; } = "";
            public string PersonName { get; set; } = "";
            public string Narration { get; set; } = "";
            public string ChqNo { get; set; } = "";
            public string ChqDate { get; set; } = "";
            public string BankName { get; set; } = "";
            public decimal Debit { get; set; }
            public decimal Credit { get; set; }
        }
    }
}
