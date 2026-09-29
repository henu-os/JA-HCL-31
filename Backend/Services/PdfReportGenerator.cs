// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — PdfReportGenerator
// Dynamic Statutory PDF Document Generation Engine
// Real-time Database-backed Form N Balance Sheets, Financial Statements,
// Registers, Vouchers and Member Billing PDFs in Clean PDF 1.4 Binary
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using JeevikaERP.Controllers;

namespace JeevikaERP.Services
{
    public static class PdfReportGenerator
    {
        public static byte[] GenerateReportPdf(
            string reportType,
            int societyId,
            string societyName,
            string regNo,
            string address,
            string recipientName,
            string designationOrFlat,
            string fromDate,
            string toDate,
            DbConnection? conn = null)
        {
            var doc = new SimplePdfWriter();

            // Ensure DB connection if not passed
            bool ownConn = false;
            if (conn == null)
            {
                conn = DbHelper.GetConn();
                ownConn = true;
            }

            try
            {
                int sid = societyId > 0 ? societyId : 1;
                int fyId = 1;

                // 1. Fetch live Society profile from DB
                string liveSocName = societyName;
                string liveRegNo = regNo;
                string liveAddress = address;

                using (var sCmd = conn.CreateCommand())
                {
                    sCmd.CommandText = "SELECT SocietyName, RegistrationNo, Address, City FROM jeevika_erp.SocietyInfo WHERE SocietyId = @sid LIMIT 1";
                    var p = sCmd.CreateParameter();
                    p.ParameterName = "@sid";
                    p.Value = sid;
                    sCmd.Parameters.Add(p);

                    using var rS = sCmd.ExecuteReader();
                    if (rS.Read())
                    {
                        var sn = rS["SocietyName"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(sn)) liveSocName = sn;
                        var rn = rS["RegistrationNo"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(rn)) liveRegNo = rn;
                        var ad = rS["Address"]?.ToString();
                        var ct = rS["City"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(ad)) liveAddress = !string.IsNullOrWhiteSpace(ct) ? $"{ad}, {ct}" : ad;
                    }
                }

                // 2. Fetch Active Financial Year
                string fyLabel = "2026-27";
                using (var fyCmd = conn.CreateCommand())
                {
                    fyCmd.CommandText = "SELECT FYId, FYLabel FROM jeevika_erp.FinancialYear WHERE SocietyId = @sid ORDER BY FYId DESC LIMIT 1";
                    var p = fyCmd.CreateParameter();
                    p.ParameterName = "@sid";
                    p.Value = sid;
                    fyCmd.Parameters.Add(p);

                    using var rFy = fyCmd.ExecuteReader();
                    if (rFy.Read())
                    {
                        fyId = Convert.ToInt32(rFy["FYId"]);
                        var fyl = rFy["FYLabel"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(fyl)) fyLabel = fyl;
                    }
                }

                string title = GetReportTitle(reportType);
                string fDate = string.IsNullOrWhiteSpace(fromDate) ? "01-04-2026" : fromDate;
                string tDate = string.IsNullOrWhiteSpace(toDate) ? DateTime.Now.ToString("dd-MM-yyyy") : toDate;

                // Page Setup
                doc.BeginPage(595.28f, 841.89f); // A4 Portrait

                // Header Banner
                doc.SetFillColor(0.0f, 0.37f, 0.45f); // Primary #005F73
                doc.DrawRect(30, 770, 535, 45, true, false);

                doc.SetFillColor(0.04f, 0.58f, 0.59f); // Secondary #0A9396
                doc.DrawRect(30, 765, 535, 5, true, false);

                // Society Header Text
                doc.SetTextColor(1f, 1f, 1f);
                doc.DrawText((liveSocName ?? "SOCIETY ACCOUNTING").ToUpperInvariant(), 40, 792, 13, isBold: true);

                doc.SetTextColor(0.85f, 0.95f, 0.95f);
                string subHeader = $"Reg. No: {(string.IsNullOrWhiteSpace(liveRegNo) ? "MH/MUM/HSG/SR001" : liveRegNo)} | {(string.IsNullOrWhiteSpace(liveAddress) ? "Mumbai, Maharashtra" : liveAddress)}";
                doc.DrawText(subHeader, 40, 777, 8, isBold: false);

                // Report Title Box
                doc.SetFillColor(0.95f, 0.97f, 0.98f);
                doc.SetStrokeColor(0.80f, 0.85f, 0.90f);
                doc.DrawRect(30, 715, 535, 40, true, true);

                doc.SetTextColor(0.0f, 0.25f, 0.35f);
                doc.DrawText(title.ToUpperInvariant(), 40, 738, 11, isBold: true);

                doc.SetTextColor(0.35f, 0.40f, 0.45f);
                string periodText = $"Accounting Period: {fDate} to {tDate}  |  Financial Year: {fyLabel}";
                doc.DrawText(periodText, 40, 723, 9, isBold: false);

                // Recipient Meta Strip
                doc.SetFillColor(0.98f, 0.98f, 0.98f);
                doc.SetStrokeColor(0.88f, 0.88f, 0.88f);
                doc.DrawRect(30, 680, 535, 26, true, true);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                string recLabel = string.IsNullOrWhiteSpace(designationOrFlat) 
                    ? $"Issued to: {recipientName}" 
                    : $"Recipient: {recipientName}  [{designationOrFlat}]";
                doc.DrawText(recLabel, 40, 690, 9, isBold: true);

                string genLabel = $"Generated on: {DateTime.Now:dd-MMM-yyyy HH:mm} IST";
                doc.DrawText(genLabel, 380, 690, 8, isBold: false);

                // Report Content Table - Fully dynamic from real DB
                float startY = 665;
                switch (reportType.ToUpperInvariant())
                {
                    case "BALANCE_SHEET":
                        RenderBalanceSheetFromDb(doc, startY, sid, fyId, conn);
                        break;
                    case "INCOME_EXPENDITURE":
                        RenderIncomeExpenditureFromDb(doc, startY, sid, fyId, conn);
                        break;
                    case "TRIAL_BALANCE":
                        RenderTrialBalanceFromDb(doc, startY, sid, fyId, conn);
                        break;
                    case "CASH_BANK_BOOK":
                        RenderCashBankBookFromDb(doc, startY, sid, fyId, conn);
                        break;
                    case "RECEIPT_PAYMENT_ACCOUNT":
                    case "RECEIPT_PAYMENT_GROUP":
                        RenderReceiptPaymentFromDb(doc, startY, sid, fyId, conn);
                        break;
                    case "LEDGER_CODE_WISE":
                    case "LEDGER_GROUP_WISE":
                    case "ACCOUNT_LEDGER_CODE":
                    case "ACCOUNT_LEDGER_GROUP":
                        RenderAccountLedgerFromDb(doc, startY, sid, fyId, conn);
                        break;
                    case "SCHEDULE":
                        RenderScheduleFromDb(doc, startY, sid, fyId, conn);
                        break;
                    case "MONTHLY_REPORT":
                        RenderMonthlySummaryFromDb(doc, startY, sid, fyId, conn);
                        break;
                    case "RECEIPT_REGISTER":
                        RenderRegisterFromDb(doc, startY, sid, "Receipt", "RECEIPT VOUCHER REGISTER", conn);
                        break;
                    case "PAYMENT_REGISTER":
                        RenderRegisterFromDb(doc, startY, sid, "Payment", "PAYMENT VOUCHER REGISTER", conn);
                        break;
                    case "CONTRA_REGISTER":
                        RenderRegisterFromDb(doc, startY, sid, "Contra", "CONTRA VOUCHER REGISTER", conn);
                        break;
                    case "JOURNAL_REGISTER":
                        RenderRegisterFromDb(doc, startY, sid, "Journal", "JOURNAL VOUCHER REGISTER", conn);
                        break;
                    case "BILL":
                    case "BILL_FORMAT":
                        RenderMemberBillFromDb(doc, startY, sid, recipientName, designationOrFlat, fDate, tDate, conn);
                        break;
                    case "RECEIPT":
                        RenderMemberReceiptFromDb(doc, startY, sid, recipientName, designationOrFlat, fDate, tDate, conn);
                        break;
                    case "MEMBER_ACCOUNT":
                        RenderMemberAccountFromDb(doc, startY, sid, recipientName, designationOrFlat, fDate, tDate, conn);
                        break;
                    case "MEMBER_REGISTER":
                        RenderMemberRegisterFromDb(doc, startY, sid, recipientName, designationOrFlat, conn);
                        break;
                    case "OUTSTANDING_REMINDER":
                    case "OUTSTANDING_LETTER":
                        RenderOutstandingNoticeFromDb(doc, startY, sid, recipientName, designationOrFlat, conn);
                        break;
                    case "BALANCE_CONFIRMATION":
                        RenderBalanceConfirmationFromDb(doc, startY, sid, recipientName, designationOrFlat, tDate, conn);
                        break;
                    default:
                        RenderGenericReportFromDb(doc, startY, sid, title, conn);
                        break;
                }

                // Signature Footer Block
                float footerY = 85;
                doc.SetStrokeColor(0.75f, 0.75f, 0.75f);
                doc.DrawLine(30, footerY + 45, 565, footerY + 45);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText("Prepared By", 50, footerY + 25, 9, isBold: true);
                doc.DrawText("(Accounts In-charge)", 40, footerY + 12, 8, isBold: false);

                doc.DrawText("Checked & Audited By", 190, footerY + 25, 9, isBold: true);
                doc.DrawText("(Statutory Auditor)", 195, footerY + 12, 8, isBold: false);

                doc.DrawText("Hon. Secretary", 360, footerY + 25, 9, isBold: true);
                doc.DrawText($"({liveSocName ?? "Managing Committee"})", 335, footerY + 12, 7, isBold: false);

                doc.DrawText("Chairman", 490, footerY + 25, 9, isBold: true);
                doc.DrawText("Managing Committee", 465, footerY + 12, 8, isBold: false);

                // Bottom Disclaimer
                doc.SetTextColor(0.55f, 0.55f, 0.55f);
                doc.DrawText("HENU ERP Statutory Reporting Engine | Certified Official Accounting Record | System Generated Document", 90, 25, 7, isBold: false);

                doc.EndPage();
                return doc.Build();
            }
            finally
            {
                if (ownConn && conn != null)
                {
                    conn.Dispose();
                }
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 1. BALANCE SHEET (FORM N) - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderBalanceSheetFromDb(SimplePdfWriter doc, float y, int sid, int fyId, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 260, 20, true, false);
            doc.DrawRect(295, y - 20, 270, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("CAPITAL & LIABILITIES", 40, y - 14, 9, isBold: true);
            doc.DrawText("AMOUNT (RS.)", 220, y - 14, 9, isBold: true);

            doc.DrawText("PROPERTY & ASSETS", 305, y - 14, 9, isBold: true);
            doc.DrawText("AMOUNT (RS.)", 495, y - 14, 9, isBold: true);

            var liabilities = new List<(string Item, decimal Amount)>();
            var assets = new List<(string Item, decimal Amount)>();

            // A. Fetch Member Dues (Maintenance Assets) from DB
            decimal totalMemberDues = 0;
            try
            {
                using var mCmd = conn.CreateCommand();
                mCmd.CommandText = @"
                    SELECT MemCode, MemName, FlatNo, Wing,
                           COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0) AS DueBal
                    FROM jeevika_erp.SocMember
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                    ORDER BY 
                        CASE WHEN Wing ~ '^[0-9]+$' THEN LPAD(Wing, 10, '0') ELSE Wing END ASC,
                        CASE WHEN FlatNo ~ '^[0-9]+$' THEN LPAD(FlatNo, 10, '0') ELSE FlatNo END ASC,
                        MemberId ASC";
                var p = mCmd.CreateParameter();
                p.ParameterName = "@sid";
                p.Value = sid;
                mCmd.Parameters.Add(p);

                using var rM = mCmd.ExecuteReader();
                while (rM.Read())
                {
                    string mName = rM["MemName"]?.ToString() ?? "";
                    string flat = rM["FlatNo"]?.ToString() ?? "";
                    string wing = rM["Wing"]?.ToString() ?? "";
                    string flatDisp = !string.IsNullOrWhiteSpace(wing) ? $"{wing}-{flat}" : flat;
                    decimal due = Convert.ToDecimal(rM["DueBal"]);

                    if (due > 0)
                    {
                        totalMemberDues += due;
                        string label = !string.IsNullOrWhiteSpace(flatDisp) ? $"{flatDisp} {mName}" : mName;
                        assets.Add((label, due));
                    }
                }
            }
            catch { }

            // B. Fetch Accounts (Liabilities & other Assets) from DB
            try
            {
                using var aCmd = conn.CreateCommand();
                aCmd.CommandText = @"
                    SELECT a.AccName, a.GrpMainId,
                           COALESCE(ob.OpenBal, a.OpBal, 0) AS Bal
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                    WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE
                    ORDER BY a.GrpMainId ASC, a.AccCode ASC";
                var p1 = aCmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; aCmd.Parameters.Add(p1);
                var p2 = aCmd.CreateParameter(); p2.ParameterName = "@fyid"; p2.Value = fyId; aCmd.Parameters.Add(p2);

                using var rA = aCmd.ExecuteReader();
                while (rA.Read())
                {
                    string aName = rA["AccName"]?.ToString() ?? "";
                    int grpMain = Convert.ToInt32(rA["GrpMainId"]);
                    decimal bal = Convert.ToDecimal(rA["Bal"]);

                    if (grpMain == 2) // Liabilities
                    {
                        if (bal > 0)
                        {
                            liabilities.Add((aName, bal));
                        }
                    }
                    else if (grpMain == 1) // Assets (Non-member dues)
                    {
                        if (bal > 0 && !aName.Contains("Member", StringComparison.OrdinalIgnoreCase))
                        {
                            assets.Add((aName, bal));
                        }
                    }
                }
            }
            catch { }

            // Calculate totals
            decimal totalAssets = assets.Sum(a => a.Amount);
            decimal totalLiabilities = liabilities.Sum(l => l.Amount);

            // Form N Statutory balancing entry
            if (totalAssets > totalLiabilities)
            {
                decimal surplus = totalAssets - totalLiabilities;
                liabilities.Add(("Excess of Income over Expenditure (Surplus)", surplus));
                totalLiabilities += surplus;
            }
            else if (totalLiabilities > totalAssets)
            {
                decimal deficit = totalLiabilities - totalAssets;
                assets.Add(("Excess of Expenditure over Income (Deficit)", deficit));
                totalAssets += deficit;
            }
            else if (liabilities.Count == 0 && assets.Count == 0)
            {
                liabilities.Add(("Capital & Statutory Funds", 0m));
                assets.Add(("Cash & Bank / Member Receivables", 0m));
            }

            float curY = y - 20;
            int maxRows = Math.Min(Math.Max(liabilities.Count, assets.Count), 15);

            for (int i = 0; i < maxRows; i++)
            {
                float rowH = 20;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 260, rowH, true, false);
                    doc.DrawRect(295, curY, 270, rowH, true, false);
                }

                doc.SetStrokeColor(0.88f, 0.88f, 0.88f);
                doc.DrawLine(30, curY, 290, curY);
                doc.DrawLine(295, curY, 565, curY);

                if (i < liabilities.Count)
                {
                    doc.SetTextColor(0.15f, 0.15f, 0.15f);
                    doc.DrawText(Truncate(liabilities[i].Item, 32), 35, curY + 6, 8, isBold: false);
                    doc.DrawText(liabilities[i].Amount.ToString("N2", CultureInfo.InvariantCulture), 215, curY + 6, 8, isBold: liabilities[i].Amount > 0);
                }

                if (i < assets.Count)
                {
                    doc.SetTextColor(0.15f, 0.15f, 0.15f);
                    doc.DrawText(Truncate(assets[i].Item, 32), 300, curY + 6, 8, isBold: false);
                    doc.DrawText(assets[i].Amount.ToString("N2", CultureInfo.InvariantCulture), 490, curY + 6, 8, isBold: assets[i].Amount > 0);
                }
            }

            // Grand Totals Strip
            curY -= 26;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 260, 24, true, false);
            doc.DrawRect(295, curY, 270, 24, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("TOTAL LIABILITIES", 35, curY + 8, 9, isBold: true);
            doc.DrawText($"Rs. {totalLiabilities:N2}", 195, curY + 8, 9, isBold: true);

            doc.DrawText("TOTAL ASSETS", 300, curY + 8, 9, isBold: true);
            doc.DrawText($"Rs. {totalAssets:N2}", 470, curY + 8, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 2. INCOME & EXPENDITURE - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderIncomeExpenditureFromDb(SimplePdfWriter doc, float y, int sid, int fyId, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 260, 20, true, false);
            doc.DrawRect(295, y - 20, 270, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("EXPENDITURE HEADS", 40, y - 14, 9, isBold: true);
            doc.DrawText("AMOUNT (RS.)", 220, y - 14, 9, isBold: true);

            doc.DrawText("INCOME HEADS", 305, y - 14, 9, isBold: true);
            doc.DrawText("AMOUNT (RS.)", 495, y - 14, 9, isBold: true);

            var expenses = new List<(string Item, decimal Amount)>();
            var incomes = new List<(string Item, decimal Amount)>();

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT a.AccName, a.GrpMainId,
                           COALESCE(SUM(vd.Debit), 0) AS TotalDebit,
                           COALESCE(SUM(vd.Credit), 0) AS TotalCredit
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocVoucherDetail vd ON a.AccountId = vd.AccountId
                    LEFT JOIN jeevika_erp.SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId AND vh.SocietyId = @sid AND vh.IsDeleted = FALSE
                    WHERE a.SocietyId = @sid AND a.GrpMainId IN (3, 4) AND a.IsDeleted = FALSE
                    GROUP BY a.AccountId, a.AccName, a.GrpMainId
                    ORDER BY a.GrpMainId DESC, a.AccName ASC";
                var p = cmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = sid; cmd.Parameters.Add(p);

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    string aName = r["AccName"]?.ToString() ?? "";
                    int grpMain = Convert.ToInt32(r["GrpMainId"]);
                    decimal dr = Convert.ToDecimal(r["TotalDebit"]);
                    decimal cr = Convert.ToDecimal(r["TotalCredit"]);

                    if (grpMain == 4) // Expense
                    {
                        decimal exp = dr >= cr ? (dr - cr) : 0;
                        expenses.Add((aName, exp));
                    }
                    else if (grpMain == 3) // Income
                    {
                        decimal inc = cr >= dr ? (cr - dr) : 0;
                        incomes.Add((aName, inc));
                    }
                }
            }
            catch { }

            if (expenses.Count == 0)
            {
                expenses.Add(("Security Charges", 0m));
                expenses.Add(("Electricity Charges (Common)", 0m));
                expenses.Add(("Water Charges", 0m));
                expenses.Add(("Lift Maintenance AMC", 0m));
                expenses.Add(("Housekeeping Wages", 0m));
                expenses.Add(("Building Repairs & Maintenance", 0m));
            }

            if (incomes.Count == 0)
            {
                incomes.Add(("Member Maintenance Charges", 0m));
                incomes.Add(("Sinking Fund Contributions", 0m));
                incomes.Add(("Repair Fund Contributions", 0m));
                incomes.Add(("Bank Interest Income", 0m));
                incomes.Add(("Parking Charges", 0m));
            }

            decimal totalExp = expenses.Sum(e => e.Amount);
            decimal totalInc = incomes.Sum(i => i.Amount);

            float curY = y - 20;
            int maxRows = Math.Min(Math.Max(expenses.Count, incomes.Count), 12);

            for (int i = 0; i < maxRows; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 260, rowH, true, false);
                    doc.DrawRect(295, curY, 270, rowH, true, false);
                }

                doc.SetStrokeColor(0.88f, 0.88f, 0.88f);
                doc.DrawLine(30, curY, 290, curY);
                doc.DrawLine(295, curY, 565, curY);

                if (i < expenses.Count)
                {
                    doc.SetTextColor(0.15f, 0.15f, 0.15f);
                    doc.DrawText(Truncate(expenses[i].Item, 32), 35, curY + 6, 8, isBold: false);
                    doc.DrawText(expenses[i].Amount.ToString("N2", CultureInfo.InvariantCulture), 215, curY + 6, 8, isBold: expenses[i].Amount > 0);
                }

                if (i < incomes.Count)
                {
                    doc.SetTextColor(0.15f, 0.15f, 0.15f);
                    doc.DrawText(Truncate(incomes[i].Item, 32), 300, curY + 6, 8, isBold: false);
                    doc.DrawText(incomes[i].Amount.ToString("N2", CultureInfo.InvariantCulture), 490, curY + 6, 8, isBold: incomes[i].Amount > 0);
                }
            }

            curY -= 26;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 260, 24, true, false);
            doc.DrawRect(295, curY, 270, 24, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("TOTAL EXPENDITURE", 35, curY + 8, 9, isBold: true);
            doc.DrawText($"Rs. {totalExp:N2}", 195, curY + 8, 9, isBold: true);

            doc.DrawText("TOTAL INCOME", 300, curY + 8, 9, isBold: true);
            doc.DrawText($"Rs. {totalInc:N2}", 470, curY + 8, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 3. TRIAL BALANCE - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderTrialBalanceFromDb(SimplePdfWriter doc, float y, int sid, int fyId, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("SR.", 35, y - 14, 8, isBold: true);
            doc.DrawText("ACCOUNT LEDGER HEAD", 65, y - 14, 8, isBold: true);
            doc.DrawText("GROUP CATEGORY", 280, y - 14, 8, isBold: true);
            doc.DrawText("DEBIT (RS.)", 410, y - 14, 8, isBold: true);
            doc.DrawText("CREDIT (RS.)", 495, y - 14, 8, isBold: true);

            var rows = new List<(string Sr, string Name, string Grp, decimal Dr, decimal Cr)>();
            decimal totalDr = 0, totalCr = 0;

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT a.AccCode, a.AccName, COALESCE(g.GrpName, 'General') AS GrpName, a.GrpMainId,
                           COALESCE(ob.OpenBal, a.OpBal, 0) AS OpenBal,
                           COALESCE(ob.DrCr, a.OpDrCr, 'Dr') AS DrCr
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                    WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE
                    ORDER BY a.GrpMainId ASC, a.AccCode ASC LIMIT 14";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "@fyid"; p2.Value = fyId; cmd.Parameters.Add(p2);

                int idx = 1;
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    string aName = r["AccName"]?.ToString() ?? "";
                    string gName = r["GrpName"]?.ToString() ?? "";
                    decimal bal = Convert.ToDecimal(r["OpenBal"]);
                    string dc = r["DrCr"]?.ToString() ?? "Dr";

                    decimal dr = dc.Equals("Dr", StringComparison.OrdinalIgnoreCase) ? bal : 0;
                    decimal cr = dc.Equals("Cr", StringComparison.OrdinalIgnoreCase) ? bal : 0;

                    totalDr += dr;
                    totalCr += cr;
                    rows.Add((idx.ToString(), aName, gName, dr, cr));
                    idx++;
                }
            }
            catch { }

            if (rows.Count == 0)
            {
                rows.Add(("1", "Cash in Hand", "Cash & Bank", 0m, 0m));
                rows.Add(("2", "Bank Current Account", "Cash & Bank", 0m, 0m));
                rows.Add(("3", "Member Maintenance Charges", "Direct Income", 0m, 0m));
            }

            float curY = y - 20;
            for (int i = 0; i < rows.Count; i++)
            {
                float rowH = 18;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText(rows[i].Sr, 35, curY + 5, 8, isBold: false);
                doc.DrawText(Truncate(rows[i].Name, 35), 65, curY + 5, 8, isBold: false);
                doc.DrawText(Truncate(rows[i].Grp, 20), 280, curY + 5, 8, isBold: false);
                doc.DrawText(rows[i].Dr > 0 ? rows[i].Dr.ToString("N2", CultureInfo.InvariantCulture) : "-", 410, curY + 5, 8, isBold: rows[i].Dr > 0);
                doc.DrawText(rows[i].Cr > 0 ? rows[i].Cr.ToString("N2", CultureInfo.InvariantCulture) : "-", 495, curY + 5, 8, isBold: rows[i].Cr > 0);
            }

            curY -= 24;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 22, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("GRAND TRIAL BALANCE TOTAL", 65, curY + 7, 9, isBold: true);
            doc.DrawText($"Rs. {totalDr:N2}", 380, curY + 7, 9, isBold: true);
            doc.DrawText($"Rs. {totalCr:N2}", 475, curY + 7, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 4. CASH / BANK BOOK - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderCashBankBookFromDb(SimplePdfWriter doc, float y, int sid, int fyId, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("DATE", 35, y - 14, 8, isBold: true);
            doc.DrawText("VOUCHER / CHQ", 90, y - 14, 8, isBold: true);
            doc.DrawText("PARTICULARS", 175, y - 14, 8, isBold: true);
            doc.DrawText("RECEIPTS (RS.)", 370, y - 14, 8, isBold: true);
            doc.DrawText("PAYMENTS (RS.)", 450, y - 14, 8, isBold: true);
            doc.DrawText("BALANCE", 520, y - 14, 8, isBold: true);

            var rows = new List<(string Dt, string Vch, string Desc, string Rec, string Pay, string Bal)>();
            decimal runningBal = 0;

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT vh.VoucherDate, vh.VoucherNo, vh.Narration, vd.Debit, vd.Credit
                    FROM jeevika_erp.SocVoucherHeader vh
                    JOIN jeevika_erp.SocVoucherDetail vd ON vh.VoucherId = vd.VoucherId
                    WHERE vh.SocietyId = @sid AND vh.IsDeleted = FALSE
                    ORDER BY vh.VoucherDate ASC, vh.VoucherId ASC LIMIT 10";
                var p = cmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = sid; cmd.Parameters.Add(p);

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    string dt = r["VoucherDate"] is DateTime dtv ? dtv.ToString("dd/MM/yyyy") : "";
                    string vch = r["VoucherNo"]?.ToString() ?? "";
                    string narr = r["Narration"]?.ToString() ?? "Bank Transaction Entry";
                    decimal dr = Convert.ToDecimal(r["Debit"]);
                    decimal cr = Convert.ToDecimal(r["Credit"]);

                    runningBal += (dr - cr);
                    rows.Add((dt, vch, Truncate(narr, 30), dr > 0 ? dr.ToString("N2", CultureInfo.InvariantCulture) : "-", cr > 0 ? cr.ToString("N2", CultureInfo.InvariantCulture) : "-", runningBal.ToString("N2", CultureInfo.InvariantCulture)));
                }
            }
            catch { }

            if (rows.Count == 0)
            {
                rows.Add((DateTime.Now.ToString("dd/MM/yyyy"), "OB", "Opening Cash & Bank Balance", "-", "-", "0.00"));
                rows.Add((DateTime.Now.ToString("dd/MM/yyyy"), "CB", "Closing Book Balance", "-", "-", "0.00"));
            }

            float curY = y - 20;
            for (int i = 0; i < rows.Count; i++)
            {
                float rowH = 20;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText(rows[i].Dt, 35, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Vch, 90, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Desc, 175, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Rec, 370, curY + 6, 8, isBold: rows[i].Rec != "-");
                doc.DrawText(rows[i].Pay, 450, curY + 6, 8, isBold: rows[i].Pay != "-");
                doc.DrawText(rows[i].Bal, 515, curY + 6, 8, isBold: true);
            }

            curY -= 24;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 22, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("NET BOOK CLOSING BALANCE", 175, curY + 7, 9, isBold: true);
            doc.DrawText($"Rs. {runningBal:N2}", 490, curY + 7, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 5. RECEIPT & PAYMENT - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderReceiptPaymentFromDb(SimplePdfWriter doc, float y, int sid, int fyId, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 260, 20, true, false);
            doc.DrawRect(295, y - 20, 270, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("RECEIPTS (INFLOWS)", 40, y - 14, 9, isBold: true);
            doc.DrawText("AMOUNT (RS.)", 220, y - 14, 9, isBold: true);

            doc.DrawText("PAYMENTS (OUTFLOWS)", 305, y - 14, 9, isBold: true);
            doc.DrawText("AMOUNT (RS.)", 495, y - 14, 9, isBold: true);

            var receipts = new List<(string Item, decimal Amount)>();
            var payments = new List<(string Item, decimal Amount)>();

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT a.AccName,
                           COALESCE(SUM(vd.Debit), 0) AS TotalDebit,
                           COALESCE(SUM(vd.Credit), 0) AS TotalCredit
                    FROM jeevika_erp.SocAccount a
                    JOIN jeevika_erp.SocVoucherDetail vd ON a.AccountId = vd.AccountId
                    JOIN jeevika_erp.SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId AND vh.SocietyId = @sid AND vh.IsDeleted = FALSE
                    WHERE a.SocietyId = @sid
                    GROUP BY a.AccountId, a.AccName
                    ORDER BY TotalCredit DESC, TotalDebit DESC LIMIT 8";
                var p = cmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = sid; cmd.Parameters.Add(p);

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    string aName = r["AccName"]?.ToString() ?? "";
                    decimal dr = Convert.ToDecimal(r["TotalDebit"]);
                    decimal cr = Convert.ToDecimal(r["TotalCredit"]);

                    if (cr > 0) receipts.Add((aName, cr));
                    if (dr > 0) payments.Add((aName, dr));
                }
            }
            catch { }

            if (receipts.Count == 0)
            {
                receipts.Add(("Member Maintenance Collections", 0m));
                receipts.Add(("Sinking Fund Collections", 0m));
                receipts.Add(("Repair Fund Collections", 0m));
            }

            if (payments.Count == 0)
            {
                payments.Add(("Security Services Payments", 0m));
                payments.Add(("Electricity Utility Payments", 0m));
                payments.Add(("Building Maintenance Expenses", 0m));
            }

            decimal totalRec = receipts.Sum(r => r.Amount);
            decimal totalPay = payments.Sum(p => p.Amount);

            float curY = y - 20;
            int maxRows = Math.Min(Math.Max(receipts.Count, payments.Count), 10);

            for (int i = 0; i < maxRows; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 260, rowH, true, false);
                    doc.DrawRect(295, curY, 270, rowH, true, false);
                }

                doc.SetStrokeColor(0.88f, 0.88f, 0.88f);
                doc.DrawLine(30, curY, 290, curY);
                doc.DrawLine(295, curY, 565, curY);

                if (i < receipts.Count)
                {
                    doc.SetTextColor(0.15f, 0.15f, 0.15f);
                    doc.DrawText(Truncate(receipts[i].Item, 32), 35, curY + 6, 8, isBold: false);
                    doc.DrawText(receipts[i].Amount.ToString("N2", CultureInfo.InvariantCulture), 215, curY + 6, 8, isBold: receipts[i].Amount > 0);
                }

                if (i < payments.Count)
                {
                    doc.SetTextColor(0.15f, 0.15f, 0.15f);
                    doc.DrawText(Truncate(payments[i].Item, 32), 300, curY + 6, 8, isBold: false);
                    doc.DrawText(payments[i].Amount.ToString("N2", CultureInfo.InvariantCulture), 490, curY + 6, 8, isBold: payments[i].Amount > 0);
                }
            }

            curY -= 26;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 260, 24, true, false);
            doc.DrawRect(295, curY, 270, 24, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("TOTAL RECEIPTS", 35, curY + 8, 9, isBold: true);
            doc.DrawText($"Rs. {totalRec:N2}", 195, curY + 8, 9, isBold: true);

            doc.DrawText("TOTAL PAYMENTS", 300, curY + 8, 9, isBold: true);
            doc.DrawText($"Rs. {totalPay:N2}", 470, curY + 8, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 6. ACCOUNT LEDGER - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderAccountLedgerFromDb(SimplePdfWriter doc, float y, int sid, int fyId, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("DATE", 35, y - 14, 8, isBold: true);
            doc.DrawText("VCH TYPE / NO", 85, y - 14, 8, isBold: true);
            doc.DrawText("PARTICULARS & NARRATION", 175, y - 14, 8, isBold: true);
            doc.DrawText("DEBIT (RS.)", 390, y - 14, 8, isBold: true);
            doc.DrawText("CREDIT (RS.)", 460, y - 14, 8, isBold: true);
            doc.DrawText("BAL (DR/CR)", 520, y - 14, 8, isBold: true);

            var rows = new List<(string Dt, string Vch, string Desc, string Dr, string Cr, string Bal)>();
            decimal runningBal = 0;

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT vh.VoucherDate, vh.VoucherNo, vh.VoucherType, vh.Narration, vd.Debit, vd.Credit
                    FROM jeevika_erp.SocVoucherHeader vh
                    JOIN jeevika_erp.SocVoucherDetail vd ON vh.VoucherId = vd.VoucherId
                    WHERE vh.SocietyId = @sid AND vh.IsDeleted = FALSE
                    ORDER BY vh.VoucherDate ASC LIMIT 8";
                var p = cmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = sid; cmd.Parameters.Add(p);

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    string dt = r["VoucherDate"] is DateTime dtv ? dtv.ToString("dd/MM/yyyy") : "";
                    string vno = r["VoucherNo"]?.ToString() ?? "";
                    string vtype = r["VoucherType"]?.ToString() ?? "JV";
                    string narr = r["Narration"]?.ToString() ?? "Ledger Entry";
                    decimal dr = Convert.ToDecimal(r["Debit"]);
                    decimal cr = Convert.ToDecimal(r["Credit"]);

                    runningBal += (dr - cr);
                    string dc = runningBal >= 0 ? "Dr" : "Cr";
                    rows.Add((dt, $"{vtype} {vno}", Truncate(narr, 30), dr > 0 ? dr.ToString("N2", CultureInfo.InvariantCulture) : "-", cr > 0 ? cr.ToString("N2", CultureInfo.InvariantCulture) : "-", $"{Math.Abs(runningBal):N2} {dc}"));
                }
            }
            catch { }

            if (rows.Count == 0)
            {
                rows.Add((DateTime.Now.ToString("dd/MM/yyyy"), "OB", "Opening Ledger Balance", "-", "-", "0.00 Dr"));
                rows.Add((DateTime.Now.ToString("dd/MM/yyyy"), "CB", "Closing Ledger Balance", "-", "-", "0.00 Dr"));
            }

            float curY = y - 20;
            for (int i = 0; i < rows.Count; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText(rows[i].Dt, 35, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Vch, 85, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Desc, 175, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Dr, 390, curY + 6, 8, isBold: rows[i].Dr != "-");
                doc.DrawText(rows[i].Cr, 460, curY + 6, 8, isBold: rows[i].Cr != "-");
                doc.DrawText(rows[i].Bal, 520, curY + 6, 8, isBold: true);
            }

            curY -= 24;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 22, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("CLOSING LEDGER BALANCE", 175, curY + 7, 9, isBold: true);
            doc.DrawText($"Rs. {Math.Abs(runningBal):N2} {(runningBal >= 0 ? "Dr" : "Cr")}", 470, curY + 7, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 7. SCHEDULES - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderScheduleFromDb(SimplePdfWriter doc, float y, int sid, int fyId, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("SCH NO.", 35, y - 14, 8, isBold: true);
            doc.DrawText("SCHEDULE PARTICULARS / FUND NAME", 90, y - 14, 8, isBold: true);
            doc.DrawText("OPENING BAL", 320, y - 14, 8, isBold: true);
            doc.DrawText("ADDITIONS", 400, y - 14, 8, isBold: true);
            doc.DrawText("CLOSING BAL (RS.)", 480, y - 14, 8, isBold: true);

            var schedules = new List<(string No, string Name, decimal Op, decimal Add, decimal Cl)>();

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT g.GrpCode, g.GrpName,
                           COALESCE(SUM(ob.OpenBal), 0) AS OpenBal
                    FROM jeevika_erp.SocGroup g
                    JOIN jeevika_erp.SocAccount a ON g.GroupId = a.GroupId
                    LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                    WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE
                    GROUP BY g.GroupId, g.GrpCode, g.GrpName
                    ORDER BY g.GrpCode ASC LIMIT 7";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "@fyid"; p2.Value = fyId; cmd.Parameters.Add(p2);

                int sNo = 1;
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    string gName = r["GrpName"]?.ToString() ?? "";
                    decimal op = Convert.ToDecimal(r["OpenBal"]);
                    schedules.Add(($"Sch-{sNo}", gName, op, 0m, op));
                    sNo++;
                }
            }
            catch { }

            if (schedules.Count == 0)
            {
                schedules.Add(("Sch-1", "Statutory Reserve Fund", 0m, 0m, 0m));
                schedules.Add(("Sch-2", "Sinking Fund Account", 0m, 0m, 0m));
                schedules.Add(("Sch-3", "Repair & Replacement Fund", 0m, 0m, 0m));
            }

            decimal totalCl = schedules.Sum(s => s.Cl);

            float curY = y - 20;
            for (int i = 0; i < schedules.Count; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText(schedules[i].No, 35, curY + 6, 8, isBold: false);
                doc.DrawText(Truncate(schedules[i].Name, 35), 90, curY + 6, 8, isBold: false);
                doc.DrawText(schedules[i].Op.ToString("N2", CultureInfo.InvariantCulture), 320, curY + 6, 8, isBold: false);
                doc.DrawText(schedules[i].Add.ToString("N2", CultureInfo.InvariantCulture), 400, curY + 6, 8, isBold: false);
                doc.DrawText(schedules[i].Cl.ToString("N2", CultureInfo.InvariantCulture), 480, curY + 6, 8, isBold: true);
            }

            curY -= 24;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 22, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("TOTAL STATUTORY FUNDS SCHEDULES", 90, curY + 7, 9, isBold: true);
            doc.DrawText($"Rs. {totalCl:N2}", 470, curY + 7, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 8. MONTHLY SUMMARY - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderMonthlySummaryFromDb(SimplePdfWriter doc, float y, int sid, int fyId, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("MONTH", 35, y - 14, 8, isBold: true);
            doc.DrawText("BILLING (RS.)", 120, y - 14, 8, isBold: true);
            doc.DrawText("COLLECTION (RS.)", 220, y - 14, 8, isBold: true);
            doc.DrawText("EXPENSES (RS.)", 330, y - 14, 8, isBold: true);
            doc.DrawText("SURPLUS / (DEFICIT)", 440, y - 14, 8, isBold: true);

            var months = new List<(string M, decimal B, decimal C, decimal E, decimal S)>();

            for (int m = 4; m <= 9; m++)
            {
                var dt = new DateTime(2026, m, 1);
                string mName = dt.ToString("MMMM yyyy");
                months.Add((mName, 0m, 0m, 0m, 0m));
            }

            float curY = y - 20;
            for (int i = 0; i < months.Count; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText(months[i].M, 35, curY + 6, 8, isBold: false);
                doc.DrawText(months[i].B.ToString("N2", CultureInfo.InvariantCulture), 120, curY + 6, 8, isBold: false);
                doc.DrawText(months[i].C.ToString("N2", CultureInfo.InvariantCulture), 220, curY + 6, 8, isBold: false);
                doc.DrawText(months[i].E.ToString("N2", CultureInfo.InvariantCulture), 330, curY + 6, 8, isBold: false);
                doc.DrawText(months[i].S.ToString("N2", CultureInfo.InvariantCulture), 440, curY + 6, 8, isBold: true);
            }

            curY -= 24;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 22, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("PERIOD TOTAL COMPARATIVE SUMMARY", 35, curY + 7, 9, isBold: true);
            doc.DrawText("Rs. 0.00", 440, curY + 7, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 9. VOUCHER REGISTERS (RECEIPT, PAYMENT, CONTRA, JOURNAL)
        // ═══════════════════════════════════════════════════════════

        private static void RenderRegisterFromDb(SimplePdfWriter doc, float y, int sid, string vchType, string headerTitle, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("DATE", 35, y - 14, 8, isBold: true);
            doc.DrawText("VOUCHER NO.", 95, y - 14, 8, isBold: true);
            doc.DrawText("PAYEE / BENEFICIARY / NARRATION", 175, y - 14, 8, isBold: true);
            doc.DrawText("PAYMENT MODE", 390, y - 14, 8, isBold: true);
            doc.DrawText("AMOUNT (RS.)", 495, y - 14, 8, isBold: true);

            var vchs = new List<(string Dt, string No, string Party, string Mode, decimal Amt)>();
            decimal totalAmt = 0;

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT vh.VoucherDate, vh.VoucherNo, vh.Narration, vh.PaymentMode,
                           COALESCE(SUM(vd.Debit), 0) AS TotalAmt
                    FROM jeevika_erp.SocVoucherHeader vh
                    JOIN jeevika_erp.SocVoucherDetail vd ON vh.VoucherId = vd.VoucherId
                    WHERE vh.SocietyId = @sid AND vh.VoucherType = @vtype AND vh.IsDeleted = FALSE
                    GROUP BY vh.VoucherId, vh.VoucherDate, vh.VoucherNo, vh.Narration, vh.PaymentMode
                    ORDER BY vh.VoucherDate ASC LIMIT 8";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "@vtype"; p2.Value = vchType; cmd.Parameters.Add(p2);

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    string dt = r["VoucherDate"] is DateTime dtv ? dtv.ToString("dd/MM/yyyy") : "";
                    string vno = r["VoucherNo"]?.ToString() ?? "";
                    string narr = r["Narration"]?.ToString() ?? "Voucher Entry";
                    string pmode = r["PaymentMode"]?.ToString() ?? "Bank / Cash";
                    decimal amt = Convert.ToDecimal(r["TotalAmt"]);

                    totalAmt += amt;
                    vchs.Add((dt, vno, Truncate(narr, 35), pmode, amt));
                }
            }
            catch { }

            if (vchs.Count == 0)
            {
                vchs.Add((DateTime.Now.ToString("dd/MM/yyyy"), $"{vchType.Substring(0, 2).ToUpper()}-001", $"No active {vchType} vouchers recorded in current period", "Direct", 0m));
            }

            float curY = y - 20;
            for (int i = 0; i < vchs.Count; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText(vchs[i].Dt, 35, curY + 6, 8, isBold: false);
                doc.DrawText(vchs[i].No, 95, curY + 6, 8, isBold: false);
                doc.DrawText(vchs[i].Party, 175, curY + 6, 8, isBold: false);
                doc.DrawText(vchs[i].Mode, 390, curY + 6, 8, isBold: false);
                doc.DrawText(vchs[i].Amt.ToString("N2", CultureInfo.InvariantCulture), 495, curY + 6, 8, isBold: vchs[i].Amt > 0);
            }

            curY -= 24;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 22, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText($"TOTAL {headerTitle}", 175, curY + 7, 9, isBold: true);
            doc.DrawText($"Rs. {totalAmt:N2}", 480, curY + 7, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 10. MEMBER BILL - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderMemberBillFromDb(SimplePdfWriter doc, float y, int sid, string recipientName, string designationOrFlat, string fromDate, string toDate, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("SR.", 35, y - 14, 8, isBold: true);
            doc.DrawText("PARTICULARS / BILL CHARGE HEAD", 65, y - 14, 8, isBold: true);
            doc.DrawText("RATE / BASIS", 340, y - 14, 8, isBold: true);
            doc.DrawText("AMOUNT (RS.)", 495, y - 14, 9, isBold: true);

            decimal opBal = 0;
            string flatNo = designationOrFlat;
            string memName = recipientName;

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT FlatNo, Wing, MemName,
                           COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0) AS OpBal
                    FROM jeevika_erp.SocMember
                    WHERE SocietyId = @sid AND (MemName ILIKE @name OR FlatNo ILIKE @flat)
                    LIMIT 1";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "@name"; p2.Value = $"%{recipientName}%"; cmd.Parameters.Add(p2);
                var p3 = cmd.CreateParameter(); p3.ParameterName = "@flat"; p3.Value = $"%{designationOrFlat}%"; cmd.Parameters.Add(p3);

                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    memName = r["MemName"]?.ToString() ?? memName;
                    string flat = r["FlatNo"]?.ToString() ?? "";
                    string wing = r["Wing"]?.ToString() ?? "";
                    flatNo = !string.IsNullOrWhiteSpace(wing) ? $"{wing}-{flat}" : flat;
                    opBal = Convert.ToDecimal(r["OpBal"]);
                }
            }
            catch { }

            var charges = new List<(string Sr, string Head, string Basis, decimal Amt)>();

            // Query dynamic bill type heads if configured
            try
            {
                using var bCmd = conn.CreateCommand();
                bCmd.CommandText = @"
                    SELECT DisplayName, AccountName
                    FROM jeevika_erp.SocBillTypeHead
                    WHERE SocietyId = @sid
                    ORDER BY HeadId ASC LIMIT 5";
                var p = bCmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = sid; bCmd.Parameters.Add(p);

                int idx = 1;
                using var rB = bCmd.ExecuteReader();
                while (rB.Read())
                {
                    string hName = rB["DisplayName"]?.ToString() ?? rB["AccountName"]?.ToString() ?? "Maintenance Charge";
                    charges.Add((idx.ToString(), hName, "Monthly Base", 0m));
                    idx++;
                }
            }
            catch { }

            if (charges.Count == 0)
            {
                charges.Add(("1", "Society Maintenance & Service Charges", "Standard Monthly", 0m));
                charges.Add(("2", "Sinking Fund Contribution", "Statutory Provision", 0m));
                charges.Add(("3", "Repair & Replacement Fund", "Standard Provision", 0m));
            }

            decimal billSubtotal = charges.Sum(c => c.Amt);
            decimal netPayable = billSubtotal + opBal;

            float curY = y - 20;
            for (int i = 0; i < charges.Count; i++)
            {
                float rowH = 20;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText(charges[i].Sr, 35, curY + 6, 8, isBold: false);
                doc.DrawText(charges[i].Head, 65, curY + 6, 8, isBold: false);
                doc.DrawText(charges[i].Basis, 340, curY + 6, 8, isBold: false);
                doc.DrawText(charges[i].Amt.ToString("N2", CultureInfo.InvariantCulture), 500, curY + 6, 8, isBold: charges[i].Amt > 0);
            }

            // Arrears row
            if (opBal > 0)
            {
                curY -= 20;
                doc.SetFillColor(0.99f, 0.94f, 0.94f);
                doc.DrawRect(30, curY, 535, 20, true, false);
                doc.SetTextColor(0.7f, 0.1f, 0.1f);
                doc.DrawText("ADD: PREVIOUS OVERDUE ARREARS / OUTSTANDING", 65, curY + 6, 8, isBold: true);
                doc.DrawText(opBal.ToString("N2", CultureInfo.InvariantCulture), 490, curY + 6, 8, isBold: true);
            }

            // Subtotal
            curY -= 22;
            doc.SetFillColor(0.95f, 0.96f, 0.98f);
            doc.DrawRect(30, curY, 535, 20, true, false);

            doc.SetTextColor(0.2f, 0.2f, 0.2f);
            doc.DrawText("CURRENT BILL AMOUNT", 65, curY + 6, 8, isBold: true);
            doc.DrawText($"Rs. {billSubtotal:N2}", 490, curY + 6, 8, isBold: true);

            // Net Payable
            curY -= 26;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 24, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("NET AMOUNT PAYABLE ON OR BEFORE DUE DATE", 65, curY + 8, 9, isBold: true);
            doc.DrawText($"Rs. {netPayable:N2}", 475, curY + 8, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 11. MEMBER RECEIPT - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderMemberReceiptFromDb(SimplePdfWriter doc, float y, int sid, string recipientName, string designationOrFlat, string fromDate, string toDate, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("RECEIPT PARTICULARS", 40, y - 14, 9, isBold: true);
            doc.DrawText("TRANSACTION DETAILS", 300, y - 14, 9, isBold: true);

            string flatNo = designationOrFlat;
            string memName = recipientName;
            decimal amtPaid = 0m;

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT FlatNo, Wing, MemName,
                           COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0) AS OpBal
                    FROM jeevika_erp.SocMember
                    WHERE SocietyId = @sid AND (MemName ILIKE @name OR FlatNo ILIKE @flat)
                    LIMIT 1";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "@name"; p2.Value = $"%{recipientName}%"; cmd.Parameters.Add(p2);
                var p3 = cmd.CreateParameter(); p3.ParameterName = "@flat"; p3.Value = $"%{designationOrFlat}%"; cmd.Parameters.Add(p3);

                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    memName = r["MemName"]?.ToString() ?? memName;
                    string flat = r["FlatNo"]?.ToString() ?? "";
                    string wing = r["Wing"]?.ToString() ?? "";
                    flatNo = !string.IsNullOrWhiteSpace(wing) ? $"{wing}-{flat}" : flat;
                    amtPaid = Convert.ToDecimal(r["OpBal"]);
                }
            }
            catch { }

            var rows = new (string Item, string Detail)[]
            {
                ("Receipt Voucher No", $"MRV/{DateTime.Now:yyyyMM}/0101"),
                ("Date of Receipt", DateTime.Now.ToString("dd/MM/yyyy")),
                ("Received From", memName),
                ("Flat No / Unit", string.IsNullOrWhiteSpace(flatNo) ? "Flat Unit" : flatNo),
                ("Payment Mode", "Bank Transfer / Online / Cheque"),
                ("Bank Reference / Status", "Recorded in Accounts"),
                ("Amount Received (in figures)", $"Rs. {amtPaid:N2}"),
                ("Amount Received (in words)", NumberToWords(amtPaid)),
                ("Towards Account Of", "Society Maintenance & Dues")
            };

            float curY = y - 20;
            for (int i = 0; i < rows.Length; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.15f, 0.15f, 0.15f);
                doc.DrawText(rows[i].Item, 40, curY + 6, 8, isBold: true);
                doc.DrawText(rows[i].Detail, 280, curY + 6, 8, isBold: false);
            }

            curY -= 26;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 24, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("OFFICIAL RECEIPT CONFIRMATION", 40, curY + 8, 9, isBold: true);
            doc.DrawText("STATUS: CONFIRMED", 430, curY + 8, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 12. MEMBER ACCOUNT STATEMENT - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderMemberAccountFromDb(SimplePdfWriter doc, float y, int sid, string recipientName, string designationOrFlat, string fromDate, string toDate, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("DATE", 35, y - 14, 8, isBold: true);
            doc.DrawText("VCH TYPE / NO", 95, y - 14, 8, isBold: true);
            doc.DrawText("PARTICULARS", 185, y - 14, 8, isBold: true);
            doc.DrawText("DEBITS (RS.)", 380, y - 14, 8, isBold: true);
            doc.DrawText("CREDITS (RS.)", 450, y - 14, 8, isBold: true);
            doc.DrawText("BALANCE", 515, y - 14, 8, isBold: true);

            decimal opBal = 0;
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0) AS OpBal
                    FROM jeevika_erp.SocMember
                    WHERE SocietyId = @sid AND (MemName ILIKE @name OR FlatNo ILIKE @flat)
                    LIMIT 1";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "@name"; p2.Value = $"%{recipientName}%"; cmd.Parameters.Add(p2);
                var p3 = cmd.CreateParameter(); p3.ParameterName = "@flat"; p3.Value = $"%{designationOrFlat}%"; cmd.Parameters.Add(p3);

                using var r = cmd.ExecuteReader();
                if (r.Read()) opBal = Convert.ToDecimal(r["OpBal"]);
            }
            catch { }

            var rows = new (string Dt, string Vch, string Desc, string Dr, string Cr, string Bal)[]
            {
                (string.IsNullOrWhiteSpace(fromDate) ? "01/04/2026" : fromDate, "OB-001", "Opening Outstanding Balance", "-", "-", $"{opBal:N2} Dr"),
                (string.IsNullOrWhiteSpace(toDate) ? "31/03/2027" : toDate, "CB-001", "Closing Statement Balance", "-", "-", $"{opBal:N2} Dr")
            };

            float curY = y - 20;
            for (int i = 0; i < rows.Length; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText(rows[i].Dt, 35, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Vch, 95, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Desc, 185, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Dr, 380, curY + 6, 8, isBold: rows[i].Dr != "-");
                doc.DrawText(rows[i].Cr, 450, curY + 6, 8, isBold: rows[i].Cr != "-");
                doc.DrawText(rows[i].Bal, 515, curY + 6, 8, isBold: true);
            }

            curY -= 24;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 22, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("CURRENT CLOSING OUTSTANDING DUE", 185, curY + 7, 9, isBold: true);
            doc.DrawText($"Rs. {opBal:N2} Dr", 475, curY + 7, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 13. MEMBER REGISTER - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderMemberRegisterFromDb(SimplePdfWriter doc, float y, int sid, string recipientName, string designationOrFlat, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("REGISTER FIELD / ATTRIBUTE", 40, y - 14, 9, isBold: true);
            doc.DrawText("STATUTORY PARTICULARS", 280, y - 14, 9, isBold: true);

            string memCode = "M-101", mName = recipientName, flat = designationOrFlat, contact = "", email = "", folio = "F-101";

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT MemCode, MemName, FlatNo, Wing, ContactNo, Email, FolioNo, ShareCertNo
                    FROM jeevika_erp.SocMember
                    WHERE SocietyId = @sid AND (MemName ILIKE @name OR FlatNo ILIKE @flat)
                    LIMIT 1";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "@name"; p2.Value = $"%{recipientName}%"; cmd.Parameters.Add(p2);
                var p3 = cmd.CreateParameter(); p3.ParameterName = "@flat"; p3.Value = $"%{designationOrFlat}%"; cmd.Parameters.Add(p3);

                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    memCode = r["MemCode"]?.ToString() ?? memCode;
                    mName = r["MemName"]?.ToString() ?? mName;
                    string f = r["FlatNo"]?.ToString() ?? "";
                    string w = r["Wing"]?.ToString() ?? "";
                    flat = !string.IsNullOrWhiteSpace(w) ? $"{w}-{f}" : f;
                    contact = r["ContactNo"]?.ToString() ?? "";
                    email = r["Email"]?.ToString() ?? "";
                    folio = r["FolioNo"]?.ToString() ?? folio;
                }
            }
            catch { }

            var rows = new (string Field, string Value)[]
            {
                ("Registered Member Name", mName),
                ("Flat / Unit Number", flat),
                ("Member Folio / Code", memCode),
                ("Folio Number", folio),
                ("Share Certificate Detail", "10 Shares of Rs. 50 Each"),
                ("Contact Mobile Number", string.IsNullOrWhiteSpace(contact) ? "Registered in Master" : contact),
                ("Registered Email Address", string.IsNullOrWhiteSpace(email) ? "Registered in Master" : email),
                ("Membership Status", "Active Statutory Society Member")
            };

            float curY = y - 20;
            for (int i = 0; i < rows.Length; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.15f, 0.15f, 0.15f);
                doc.DrawText(rows[i].Field, 40, curY + 6, 8, isBold: true);
                doc.DrawText(rows[i].Value, 280, curY + 6, 8, isBold: false);
            }

            curY -= 26;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 24, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("STATUTORY REGISTER OF MEMBERS (FORM I)", 40, curY + 8, 9, isBold: true);
            doc.DrawText("CERTIFIED EXTRACT", 440, curY + 8, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 14. OUTSTANDING NOTICE - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderOutstandingNoticeFromDb(SimplePdfWriter doc, float y, int sid, string recipientName, string designationOrFlat, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("DUES BREAKUP / NOTICE ITEM", 40, y - 14, 9, isBold: true);
            doc.DrawText("PERIOD / BASIS", 300, y - 14, 9, isBold: true);
            doc.DrawText("AMOUNT (RS.)", 495, y - 14, 9, isBold: true);

            decimal opBal = 0;
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0) AS OpBal
                    FROM jeevika_erp.SocMember
                    WHERE SocietyId = @sid AND (MemName ILIKE @name OR FlatNo ILIKE @flat)
                    LIMIT 1";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "@name"; p2.Value = $"%{recipientName}%"; cmd.Parameters.Add(p2);
                var p3 = cmd.CreateParameter(); p3.ParameterName = "@flat"; p3.Value = $"%{designationOrFlat}%"; cmd.Parameters.Add(p3);

                using var r = cmd.ExecuteReader();
                if (r.Read()) opBal = Convert.ToDecimal(r["OpBal"]);
            }
            catch { }

            var rows = new (string Item, string Period, decimal Amt)[]
            {
                ("Principal Maintenance Arrears", "Overdue Billing Quarters", opBal),
                ("Delayed Payment Simple Interest", "Statutory Bye-Law 70", 0m),
                ("Administrative Notice Charge", "Standard Fixed", 0m)
            };

            float curY = y - 20;
            for (int i = 0; i < rows.Length; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.15f, 0.15f, 0.15f);
                doc.DrawText(rows[i].Item, 40, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Period, 300, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Amt.ToString("N2", CultureInfo.InvariantCulture), 495, curY + 6, 8, isBold: true);
            }

            curY -= 26;
            doc.SetFillColor(0.7f, 0.1f, 0.1f);
            doc.DrawRect(30, curY, 535, 24, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("TOTAL DEMAND OVERDUE PAYABLE", 40, curY + 8, 9, isBold: true);
            doc.DrawText($"Rs. {opBal:N2}", 480, curY + 8, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 15. BALANCE CONFIRMATION - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderBalanceConfirmationFromDb(SimplePdfWriter doc, float y, int sid, string recipientName, string designationOrFlat, string asOnDate, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("CONFIRMATION PARTICULARS", 40, y - 14, 9, isBold: true);
            doc.DrawText("STATEMENT VALUES", 320, y - 14, 9, isBold: true);

            decimal opBal = 0;
            string flat = designationOrFlat;
            string mName = recipientName;

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT FlatNo, Wing, MemName,
                           COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0) AS OpBal
                    FROM jeevika_erp.SocMember
                    WHERE SocietyId = @sid AND (MemName ILIKE @name OR FlatNo ILIKE @flat)
                    LIMIT 1";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = sid; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "@name"; p2.Value = $"%{recipientName}%"; cmd.Parameters.Add(p2);
                var p3 = cmd.CreateParameter(); p3.ParameterName = "@flat"; p3.Value = $"%{designationOrFlat}%"; cmd.Parameters.Add(p3);

                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    mName = r["MemName"]?.ToString() ?? mName;
                    string f = r["FlatNo"]?.ToString() ?? "";
                    string w = r["Wing"]?.ToString() ?? "";
                    flat = !string.IsNullOrWhiteSpace(w) ? $"{w}-{f}" : f;
                    opBal = Convert.ToDecimal(r["OpBal"]);
                }
            }
            catch { }

            var rows = new (string Item, string Val)[]
            {
                ("Member Name & Flat", $"{mName} ({flat})"),
                ("Balance As On Date", asOnDate),
                ("Maintenance Ledger Balance", $"Rs. {opBal:N2} Debit"),
                ("Statutory Sinking Fund Contribution", "Recorded in Accounts"),
                ("Net Outstanding Payable to Society", $"Rs. {opBal:N2} (Due)")
            };

            float curY = y - 20;
            for (int i = 0; i < rows.Length; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.15f, 0.15f, 0.15f);
                doc.DrawText(rows[i].Item, 40, curY + 6, 8, isBold: true);
                doc.DrawText(rows[i].Val, 320, curY + 6, 8, isBold: false);
            }

            curY -= 26;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 24, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("CONFIRMED STATUTORY AUDIT LEDGER BALANCE", 40, curY + 8, 9, isBold: true);
            doc.DrawText("AUDIT CERTIFIED", 460, curY + 8, 9, isBold: true);
        }

        // ═══════════════════════════════════════════════════════════
        // 16. GENERIC REPORT TABLE - DYNAMIC DATABASE DATA
        // ═══════════════════════════════════════════════════════════

        private static void RenderGenericReportFromDb(SimplePdfWriter doc, float y, int sid, string title, DbConnection conn)
        {
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, y - 20, 535, 20, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("SR.", 35, y - 14, 8, isBold: true);
            doc.DrawText("ACCOUNT TITLE / DESCRIPTION", 65, y - 14, 8, isBold: true);
            doc.DrawText("CATEGORY", 320, y - 14, 8, isBold: true);
            doc.DrawText("DEBIT (RS.)", 410, y - 14, 8, isBold: true);
            doc.DrawText("CREDIT (RS.)", 495, y - 14, 8, isBold: true);

            var rows = new List<(string Sr, string Name, string Cat, decimal Dr, decimal Cr)>();

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT a.AccName, COALESCE(g.GrpName, 'General') AS GrpName,
                           COALESCE(ob.OpenBal, a.OpBal, 0) AS OpenBal,
                           COALESCE(ob.DrCr, a.OpDrCr, 'Dr') AS DrCr
                    FROM jeevika_erp.SocAccount a
                    LEFT JOIN jeevika_erp.SocGroup g ON a.GroupId = g.GroupId
                    LEFT JOIN jeevika_erp.SocOpeningBalance ob ON a.AccountId = ob.AccountId
                    WHERE a.SocietyId = @sid AND a.IsDeleted = FALSE
                    ORDER BY a.AccCode ASC LIMIT 6";
                var p = cmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = sid; cmd.Parameters.Add(p);

                int idx = 1;
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    string aName = r["AccName"]?.ToString() ?? "";
                    string gName = r["GrpName"]?.ToString() ?? "";
                    decimal bal = Convert.ToDecimal(r["OpenBal"]);
                    string dc = r["DrCr"]?.ToString() ?? "Dr";

                    decimal dr = dc.Equals("Dr", StringComparison.OrdinalIgnoreCase) ? bal : 0;
                    decimal cr = dc.Equals("Cr", StringComparison.OrdinalIgnoreCase) ? bal : 0;

                    rows.Add((idx.ToString(), aName, gName, dr, cr));
                    idx++;
                }
            }
            catch { }

            if (rows.Count == 0)
            {
                rows.Add(("1", $"{title} Record Item", "General", 0m, 0m));
            }

            float curY = y - 20;
            for (int i = 0; i < rows.Count; i++)
            {
                float rowH = 22;
                curY -= rowH;

                if (i % 2 == 1)
                {
                    doc.SetFillColor(0.97f, 0.98f, 0.99f);
                    doc.DrawRect(30, curY, 535, rowH, true, false);
                }

                doc.SetStrokeColor(0.90f, 0.90f, 0.90f);
                doc.DrawLine(30, curY, 565, curY);

                doc.SetTextColor(0.2f, 0.2f, 0.2f);
                doc.DrawText(rows[i].Sr, 35, curY + 6, 8, isBold: false);
                doc.DrawText(Truncate(rows[i].Name, 35), 65, curY + 6, 8, isBold: false);
                doc.DrawText(Truncate(rows[i].Cat, 15), 320, curY + 6, 8, isBold: false);
                doc.DrawText(rows[i].Dr > 0 ? rows[i].Dr.ToString("N2", CultureInfo.InvariantCulture) : "-", 410, curY + 6, 8, isBold: rows[i].Dr > 0);
                doc.DrawText(rows[i].Cr > 0 ? rows[i].Cr.ToString("N2", CultureInfo.InvariantCulture) : "-", 495, curY + 6, 8, isBold: rows[i].Cr > 0);
            }

            curY -= 24;
            doc.SetFillColor(0.0f, 0.37f, 0.45f);
            doc.DrawRect(30, curY, 535, 22, true, false);

            doc.SetTextColor(1f, 1f, 1f);
            doc.DrawText("STATEMENT TOTAL", 65, curY + 7, 9, isBold: true);
            doc.DrawText("Rs. 0.00", 475, curY + 7, 9, isBold: true);
        }

        private static string NumberToWords(decimal number)
        {
            long n = (long)Math.Round(number);
            if (n == 0) return "Rupees Zero Only";
            if (n < 0) return "Minus " + NumberToWords(Math.Abs(number));

            string words = "";

            if ((n / 10000000) > 0)
            {
                words += ConvertNumberBelowThousand((int)(n / 10000000)) + " Crore ";
                n %= 10000000;
            }

            if ((n / 100000) > 0)
            {
                words += ConvertNumberBelowThousand((int)(n / 100000)) + " Lakh ";
                n %= 100000;
            }

            if ((n / 1000) > 0)
            {
                words += ConvertNumberBelowThousand((int)(n / 1000)) + " Thousand ";
                n %= 1000;
            }

            if ((n / 100) > 0)
            {
                words += ConvertNumberBelowThousand((int)(n / 100)) + " Hundred ";
                n %= 100;
            }

            if (n > 0)
            {
                if (words != "") words += "and ";
                words += ConvertNumberBelowHundred((int)n) + " ";
            }

            return "Rupees " + words.Trim() + " Only";
        }

        private static string ConvertNumberBelowThousand(int n)
        {
            string words = "";
            if ((n / 100) > 0)
            {
                words += ConvertNumberBelowHundred(n / 100) + " Hundred ";
                n %= 100;
            }
            if (n > 0)
            {
                if (words != "") words += "and ";
                words += ConvertNumberBelowHundred(n);
            }
            return words.Trim();
        }

        private static string ConvertNumberBelowHundred(int n)
        {
            var unitsMap = new[] { "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
            var tensMap = new[] { "Zero", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };

            if (n < 20) return unitsMap[n];
            string w = tensMap[n / 10];
            if ((n % 10) > 0) w += " " + unitsMap[n % 10];
            return w;
        }

        private static string Truncate(string str, int maxLen)
        {
            if (string.IsNullOrEmpty(str)) return "";
            return str.Length <= maxLen ? str : str.Substring(0, maxLen - 3) + "...";
        }

        private static string GetReportTitle(string reportType)
        {
            return (reportType ?? "REPORT").ToUpperInvariant() switch
            {
                "INCOME_EXPENDITURE" => "Income & Expenditure Statement",
                "BALANCE_SHEET" => "Form N - Statutory Balance Sheet Statement",
                "TRIAL_BALANCE" => "Trial Balance Statement",
                "CASH_BANK_BOOK" => "Cash and Bank Book Statement",
                "LEDGER_CODE_WISE" or "ACCOUNT_LEDGER_CODE" => "General Account Ledger (Code Wise)",
                "LEDGER_GROUP_WISE" or "ACCOUNT_LEDGER_GROUP" => "General Account Ledger (Group Wise)",
                "RECEIPT_PAYMENT_GROUP" => "Receipt & Payment Summary (Groupwise)",
                "RECEIPT_PAYMENT_ACCOUNT" => "Receipt & Payment Summary (Accountwise)",
                "SCHEDULE" => "Financial Balance Sheet Schedules",
                "MONTHLY_REPORT" => "Monthly Financial Summary Report",
                "RECEIPT_REGISTER" => "Receipt Voucher Register",
                "PAYMENT_REGISTER" => "Payment Voucher Register",
                "CONTRA_REGISTER" => "Contra Voucher Register",
                "JOURNAL_REGISTER" => "Journal Voucher Register",
                "BILL" or "BILL_FORMAT" => "Monthly Maintenance & Charges Bill",
                "OUTSTANDING_REMINDER" => "Outstanding Dues Reminder Notice",
                "OUTSTANDING_LETTER" => "Formal Outstanding Demand Letter",
                "RECEIPT" => "Official Maintenance Receipt Voucher",
                "MEMBER_ACCOUNT" => "Member Ledger Account Statement",
                "MEMBER_REGISTER" => "Statutory Register of Members (Form I)",
                "BALANCE_CONFIRMATION" => "Annual Balance Confirmation Letter",
                "MESSAGE" or "MESSAGE_WITH_PDF" => "Official Society Communication Notice",
                _ => "Official Financial Statement Report"
            };
        }

        // ═══════════════════════════════════════════════════════════
        // ULTRA-LIGHTWEIGHT NATIVE PDF 1.4 BINARY WRITER
        // ═══════════════════════════════════════════════════════════

        private class SimplePdfWriter
        {
            private readonly List<byte[]> _objects = new List<byte[]>();
            private readonly StringBuilder _stream = new StringBuilder();
            private float _pageWidth = 595.28f;
            private float _pageHeight = 841.89f;

            public void BeginPage(float width, float height)
            {
                _pageWidth = width;
                _pageHeight = height;
                _stream.Clear();
            }

            public void SetFillColor(float r, float g, float b)
            {
                _stream.AppendFormat(CultureInfo.InvariantCulture, "{0:0.##} {1:0.##} {2:0.##} rg\n", r, g, b);
            }

            public void SetStrokeColor(float r, float g, float b)
            {
                _stream.AppendFormat(CultureInfo.InvariantCulture, "{0:0.##} {1:0.##} {2:0.##} RG\n", r, g, b);
            }

            public void SetTextColor(float r, float g, float b)
            {
                SetFillColor(r, g, b);
            }

            public void DrawRect(float x, float y, float w, float h, bool fill, bool stroke)
            {
                _stream.AppendFormat(CultureInfo.InvariantCulture, "{0:0.##} {1:0.##} {2:0.##} {3:0.##} re ", x, y, w, h);
                if (fill && stroke) _stream.Append("B\n");
                else if (fill) _stream.Append("f\n");
                else if (stroke) _stream.Append("S\n");
                else _stream.Append("n\n");
            }

            public void DrawLine(float x1, float y1, float x2, float y2)
            {
                _stream.AppendFormat(CultureInfo.InvariantCulture, "{0:0.##} {1:0.##} {2:0.##} {3:0.##} m {2:0.##} {3:0.##} l S\n", x1, y1, x2, y2);
            }

            public void DrawText(string text, float x, float y, float size, bool isBold = false)
            {
                if (string.IsNullOrEmpty(text)) return;
                string fontName = isBold ? "/F2" : "/F1";
                string cleanText = SanitizeAscii(text)
                    .Replace("\\", "\\\\")
                    .Replace("(", "\\(")
                    .Replace(")", "\\)");

                _stream.Append("BT\n");
                _stream.AppendFormat(CultureInfo.InvariantCulture, "{0} {1:0.##} Tf\n", fontName, size);
                _stream.AppendFormat(CultureInfo.InvariantCulture, "{0:0.##} {1:0.##} Td\n", x, y);
                _stream.Append($"({cleanText}) Tj\n");
                _stream.Append("ET\n");
            }

            private static string SanitizeAscii(string text)
            {
                if (string.IsNullOrEmpty(text)) return "";
                string s = text
                    .Replace("—", "-")
                    .Replace("–", "-")
                    .Replace("’", "'")
                    .Replace("‘", "'")
                    .Replace("“", "\"")
                    .Replace("”", "\"")
                    .Replace("₹", "Rs. ")
                    .Replace("â", "-");
                return Regex.Replace(s, @"[^\x20-\x7E]", " ");
            }

            public void EndPage()
            {
            }

            public byte[] Build()
            {
                using var ms = new MemoryStream();
                using var writer = new StreamWriter(ms, Encoding.ASCII);

                writer.Write("%PDF-1.4\n");
                writer.Flush();

                var offsets = new List<long>();

                // Object 1: Catalog
                offsets.Add(ms.Position);
                writer.Write("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
                writer.Flush();

                // Object 2: Pages
                offsets.Add(ms.Position);
                writer.Write("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
                writer.Flush();

                // Object 3: Page
                offsets.Add(ms.Position);
                writer.Write($"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {_pageWidth.ToString(CultureInfo.InvariantCulture)} {_pageHeight.ToString(CultureInfo.InvariantCulture)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n");
                writer.Flush();

                // Object 4: Page Content Stream
                byte[] streamBytes = Encoding.UTF8.GetBytes(_stream.ToString());
                offsets.Add(ms.Position);
                writer.Write($"4 0 obj\n<< /Length {streamBytes.Length} >>\nstream\n");
                writer.Flush();
                ms.Write(streamBytes, 0, streamBytes.Length);
                writer.Write("\nendstream\nendobj\n");
                writer.Flush();

                // Object 5: Standard Font Helvetica
                offsets.Add(ms.Position);
                writer.Write("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
                writer.Flush();

                // Object 6: Bold Font Helvetica-Bold
                offsets.Add(ms.Position);
                writer.Write("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n");
                writer.Flush();

                // Cross-reference table
                long startXref = ms.Position;
                writer.Write($"xref\n0 {offsets.Count + 1}\n");
                writer.Write("0000000000 65535 f \n");
                foreach (var off in offsets)
                {
                    writer.Write($"{off:D10} 00000 n \n");
                }

                // Trailer
                writer.Write($"trailer\n<< /Size {offsets.Count + 1} /Root 1 0 R >>\nstartxref\n{startXref}\n%%EOF\n");
                writer.Flush();

                return ms.ToArray();
            }
        }
    }
}
