// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — AdditionalReportsController.cs
// Independent Domain Business Reporting Engine:
// 1. TDS Report & Compliance Management
// 2. GST Report & Reconciliation Management
// 3. Fund Reports, Investments & Form N Support
// 4. Multi Report (Unified Society Cross-Module Reporting Engine)
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/additional-reports")]
    [AllowAnonymous]
    public class AdditionalReportsController : ControllerBase
    {
        private static string GetSchemaPrefix(DbConnection conn)
        {
            return "jeevika_erp.";
        }

        private static void AddParam(DbCommand cmd, string name, object? value)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        public static void EnsureAdditionalReportTables(DbConnection conn)
        {
            string prefix = GetSchemaPrefix(conn);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $@"
                -- ── 1. TDS MODULE TABLES ──────────────────────────────
                CREATE TABLE IF NOT EXISTS {prefix}SocTdsDeductee (
                    DeducteeId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    Name VARCHAR(255) NOT NULL,
                    PartyType VARCHAR(50) DEFAULT 'Vendor',
                    PanNo VARCHAR(20),
                    PanStatus VARCHAR(20) DEFAULT 'Valid',
                    Address TEXT,
                    City VARCHAR(100),
                    State VARCHAR(100),
                    Pincode VARCHAR(20),
                    Email VARCHAR(150),
                    Mobile VARCHAR(50),
                    TdsApplicable BOOLEAN DEFAULT TRUE,
                    TdsSection VARCHAR(50) DEFAULT '194C',
                    NatureOfPayment VARCHAR(150) DEFAULT 'Contractor Payment',
                    DefaultTdsRate NUMERIC(5,2) DEFAULT 2.00,
                    HasLowerDeductionCert BOOLEAN DEFAULT FALSE,
                    CertNumber VARCHAR(100),
                    CertValidFrom DATE,
                    CertValidTo DATE,
                    BankDetails TEXT,
                    IsActive BOOLEAN DEFAULT TRUE,
                    CreatedAt TIMESTAMPTZ DEFAULT NOW(),
                    UpdatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS {prefix}SocTdsRule (
                    RuleId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    Section VARCHAR(50) NOT NULL,
                    NatureOfPayment VARCHAR(255) NOT NULL,
                    DeducteeType VARCHAR(50) DEFAULT 'ALL',
                    Rate NUMERIC(5,2) NOT NULL,
                    Threshold NUMERIC(18,2) DEFAULT 30000.00,
                    EffectiveFrom DATE NOT NULL DEFAULT '2024-04-01',
                    EffectiveTo DATE DEFAULT '2099-03-31',
                    ApplicableAct VARCHAR(100) DEFAULT 'Income Tax Act 1961',
                    IsActive BOOLEAN DEFAULT TRUE,
                    CreatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS {prefix}SocTdsChallan (
                    ChallanId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    ChallanNo VARCHAR(100) NOT NULL,
                    BsrCode VARCHAR(50) NOT NULL,
                    ChallanDate DATE NOT NULL,
                    PaymentDate DATE NOT NULL,
                    TdsAmount NUMERIC(18,2) DEFAULT 0,
                    Interest NUMERIC(18,2) DEFAULT 0,
                    Fee NUMERIC(18,2) DEFAULT 0,
                    OtherAmount NUMERIC(18,2) DEFAULT 0,
                    TotalDeposited NUMERIC(18,2) NOT NULL,
                    FYId INT DEFAULT 1,
                    Quarter VARCHAR(10) DEFAULT 'Q1',
                    PaymentRef VARCHAR(150),
                    Status VARCHAR(50) DEFAULT 'Matched',
                    CreatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS {prefix}SocTdsTransaction (
                    TdsTxnId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    FYId INT DEFAULT 1,
                    Quarter VARCHAR(10) DEFAULT 'Q1',
                    VoucherId INT,
                    VoucherNo VARCHAR(50),
                    VoucherDate DATE,
                    DeducteeId INT REFERENCES {prefix}SocTdsDeductee(DeducteeId),
                    DeducteeName VARCHAR(255),
                    PanNo VARCHAR(20),
                    NatureOfPayment VARCHAR(255),
                    Section VARCHAR(50) DEFAULT '194C',
                    DateOfCredit DATE,
                    DateOfPayment DATE,
                    GrossAmount NUMERIC(18,2) DEFAULT 0,
                    TaxableAmount NUMERIC(18,2) DEFAULT 0,
                    TdsRate NUMERIC(5,2) DEFAULT 0,
                    TdsAmount NUMERIC(18,2) DEFAULT 0,
                    NetPayable NUMERIC(18,2) DEFAULT 0,
                    ChallanId INT REFERENCES {prefix}SocTdsChallan(ChallanId),
                    Status VARCHAR(50) DEFAULT 'Confirmed',
                    Remarks TEXT,
                    CreatedAt TIMESTAMPTZ DEFAULT NOW(),
                    UpdatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                -- ── 2. GST MODULE TABLES ──────────────────────────────
                CREATE TABLE IF NOT EXISTS {prefix}SocGstCategory (
                    CategoryId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    CategoryName VARCHAR(150) NOT NULL,
                    Taxability VARCHAR(50) DEFAULT 'Taxable',
                    HsnSac VARCHAR(50) DEFAULT '999598',
                    CgstRate NUMERIC(5,2) DEFAULT 9.00,
                    SgstRate NUMERIC(5,2) DEFAULT 9.00,
                    IgstRate NUMERIC(5,2) DEFAULT 18.00,
                    CessRate NUMERIC(5,2) DEFAULT 0.00,
                    EffectiveFrom DATE DEFAULT '2017-07-01',
                    EffectiveTo DATE DEFAULT '2099-03-31',
                    ExemptionReason VARCHAR(255),
                    IsRcm BOOLEAN DEFAULT FALSE,
                    IsActive BOOLEAN DEFAULT TRUE,
                    CreatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS {prefix}SocGstRule (
                    RuleId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    RuleName VARCHAR(150) NOT NULL,
                    Threshold NUMERIC(18,2) DEFAULT 7500.00,
                    TurnoverThreshold NUMERIC(18,2) DEFAULT 2000000.00,
                    ConditionDescription TEXT,
                    EffectiveFrom DATE DEFAULT '2019-01-01',
                    EffectiveTo DATE DEFAULT '2099-03-31',
                    IsActive BOOLEAN DEFAULT TRUE
                );

                CREATE TABLE IF NOT EXISTS {prefix}SocGstChargeMap (
                    MapId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    ChargeName VARCHAR(150) NOT NULL,
                    AccountId INT,
                    CategoryId INT REFERENCES {prefix}SocGstCategory(CategoryId),
                    Taxability VARCHAR(50) DEFAULT 'Taxable',
                    HsnSac VARCHAR(50) DEFAULT '999598',
                    CgstRate NUMERIC(5,2) DEFAULT 9.00,
                    SgstRate NUMERIC(5,2) DEFAULT 9.00,
                    IgstRate NUMERIC(5,2) DEFAULT 18.00,
                    EffectiveFrom DATE DEFAULT '2017-07-01',
                    IsActive BOOLEAN DEFAULT TRUE
                );

                -- ── 3. FUND MODULE TABLES ─────────────────────────────
                CREATE TABLE IF NOT EXISTS {prefix}SocFundMaster (
                    FundId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    FundName VARCHAR(150) NOT NULL,
                    FundCode VARCHAR(50) NOT NULL,
                    FundType VARCHAR(100) DEFAULT 'Statutory Reserve Fund',
                    OpeningBalance NUMERIC(18,2) DEFAULT 0.00,
                    LedgerAccountId INT,
                    Purpose TEXT,
                    IsRestricted BOOLEAN DEFAULT FALSE,
                    IsActive BOOLEAN DEFAULT TRUE,
                    EffectiveDate DATE DEFAULT '2024-04-01',
                    CreatedAt TIMESTAMPTZ DEFAULT NOW(),
                    UpdatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS {prefix}SocFundTransaction (
                    TxnId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    FundId INT NOT NULL REFERENCES {prefix}SocFundMaster(FundId),
                    TxnDate DATE NOT NULL DEFAULT CURRENT_DATE,
                    TxnType VARCHAR(50) NOT NULL,
                    Amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
                    Description TEXT,
                    MemberId INT,
                    PartyName VARCHAR(255),
                    SourceFundId INT,
                    DestFundId INT,
                    AccountId INT,
                    VoucherRef VARCHAR(100),
                    ApprovalStatus VARCHAR(50) DEFAULT 'Approved',
                    CreatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS {prefix}SocFundInvestment (
                    InvestmentId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    FundId INT NOT NULL REFERENCES {prefix}SocFundMaster(FundId),
                    BankName VARCHAR(255) NOT NULL,
                    InvestmentType VARCHAR(100) DEFAULT 'Fixed Deposit',
                    InvestmentNo VARCHAR(100) NOT NULL,
                    Principal NUMERIC(18,2) NOT NULL DEFAULT 0.00,
                    StartDate DATE NOT NULL,
                    MaturityDate DATE NOT NULL,
                    InterestRate NUMERIC(5,2) DEFAULT 6.50,
                    ExpectedInterest NUMERIC(18,2) DEFAULT 0.00,
                    ActualInterest NUMERIC(18,2) DEFAULT 0.00,
                    MaturityAmount NUMERIC(18,2) DEFAULT 0.00,
                    Status VARCHAR(50) DEFAULT 'Active',
                    Remarks TEXT,
                    CreatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                -- ── 4. MULTI REPORT CONFIGURATION TABLES ──────────────
                CREATE TABLE IF NOT EXISTS {prefix}SocSavedReportConfig (
                    ConfigId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    ReportName VARCHAR(150) NOT NULL,
                    Description TEXT,
                    SelectedSectionsJson TEXT,
                    SelectedColumnsJson TEXT,
                    FiltersJson TEXT,
                    GroupBy VARCHAR(50),
                    SortBy VARCHAR(50),
                    Visibility VARCHAR(50) DEFAULT 'Society',
                    CreatedBy VARCHAR(100) DEFAULT 'ADMIN',
                    CreatedAt TIMESTAMPTZ DEFAULT NOW(),
                    UpdatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                -- Seed default TDS Rules if empty
                INSERT INTO {prefix}SocTdsRule (SocietyId, Section, NatureOfPayment, DeducteeType, Rate, Threshold, EffectiveFrom, EffectiveTo)
                SELECT 1, '194C', 'Payment to Contractors / Subcontractors (Individual/HUF)', 'Individual', 1.00, 30000.00, '2024-04-01', '2099-03-31'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocTdsRule WHERE Section = '194C' AND DeducteeType = 'Individual');

                INSERT INTO {prefix}SocTdsRule (SocietyId, Section, NatureOfPayment, DeducteeType, Rate, Threshold, EffectiveFrom, EffectiveTo)
                SELECT 1, '194C', 'Payment to Contractors (Company/Firm)', 'Company', 2.00, 30000.00, '2024-04-01', '2099-03-31'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocTdsRule WHERE Section = '194C' AND DeducteeType = 'Company');

                INSERT INTO {prefix}SocTdsRule (SocietyId, Section, NatureOfPayment, DeducteeType, Rate, Threshold, EffectiveFrom, EffectiveTo)
                SELECT 1, '194J', 'Fees for Professional / Technical Services', 'ALL', 10.00, 30000.00, '2024-04-01', '2099-03-31'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocTdsRule WHERE Section = '194J');

                INSERT INTO {prefix}SocTdsRule (SocietyId, Section, NatureOfPayment, DeducteeType, Rate, Threshold, EffectiveFrom, EffectiveTo)
                SELECT 1, '194I', 'Rent for Land / Building / Furniture', 'ALL', 10.00, 240000.00, '2024-04-01', '2099-03-31'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocTdsRule WHERE Section = '194I');

                INSERT INTO {prefix}SocTdsRule (SocietyId, Section, NatureOfPayment, DeducteeType, Rate, Threshold, EffectiveFrom, EffectiveTo)
                SELECT 1, '194H', 'Commission or Brokerage', 'ALL', 5.00, 15000.00, '2024-04-01', '2099-03-31'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocTdsRule WHERE Section = '194H');

                -- Seed default GST categories if empty
                INSERT INTO {prefix}SocGstCategory (SocietyId, CategoryName, Taxability, HsnSac, CgstRate, SgstRate, IgstRate)
                SELECT 1, 'Cooperative Housing Society Services', 'Taxable', '999598', 9.00, 9.00, 18.00
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocGstCategory WHERE CategoryName = 'Cooperative Housing Society Services');

                INSERT INTO {prefix}SocGstCategory (SocietyId, CategoryName, Taxability, HsnSac, CgstRate, SgstRate, IgstRate)
                SELECT 1, 'Property Tax & Statutory Levies (Pure Agent)', 'Exempt', '999598', 0.00, 0.00, 0.00
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocGstCategory WHERE CategoryName = 'Property Tax & Statutory Levies (Pure Agent)');

                INSERT INTO {prefix}SocGstCategory (SocietyId, CategoryName, Taxability, HsnSac, CgstRate, SgstRate, IgstRate)
                SELECT 1, 'Sinking & Major Repair Reserves', 'Taxable', '999598', 9.00, 9.00, 18.00
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocGstCategory WHERE CategoryName = 'Sinking & Major Repair Reserves');

                INSERT INTO {prefix}SocGstCategory (SocietyId, CategoryName, Taxability, HsnSac, CgstRate, SgstRate, IgstRate)
                SELECT 1, 'Non-Occupancy Charges', 'Taxable', '999598', 9.00, 9.00, 18.00
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocGstCategory WHERE CategoryName = 'Non-Occupancy Charges');

                -- Seed default Fund Master entries if empty
                INSERT INTO {prefix}SocFundMaster (SocietyId, FundName, FundCode, FundType, OpeningBalance, Purpose)
                SELECT 1, 'Share Capital', 'FND-SC', 'Share Capital', 25000.00, 'Member statutory share capital'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocFundMaster WHERE FundCode = 'FND-SC');

                INSERT INTO {prefix}SocFundMaster (SocietyId, FundName, FundCode, FundType, OpeningBalance, Purpose)
                SELECT 1, 'Statutory Reserve Fund', 'FND-RES', 'Statutory Reserve Fund', 150000.00, 'Maharashtra Co-op Societies Act Section 66 Statutory Reserve'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocFundMaster WHERE FundCode = 'FND-RES');

                INSERT INTO {prefix}SocFundMaster (SocietyId, FundName, FundCode, FundType, OpeningBalance, Purpose)
                SELECT 1, 'Sinking Fund', 'FND-SINK', 'Sinking Fund', 450000.00, 'Structural rebuilding & long-term sinking fund'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocFundMaster WHERE FundCode = 'FND-SINK');

                INSERT INTO {prefix}SocFundMaster (SocietyId, FundName, FundCode, FundType, OpeningBalance, Purpose)
                SELECT 1, 'Major Repairs Fund', 'FND-MRF', 'Major Repairs Fund', 280000.00, 'Elevator, waterproofing and major civil repairs'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocFundMaster WHERE FundCode = 'FND-MRF');

                INSERT INTO {prefix}SocFundMaster (SocietyId, FundName, FundCode, FundType, OpeningBalance, Purpose)
                SELECT 1, 'Education & Training Fund', 'FND-EDU', 'Education & Training Fund', 15000.00, 'Statutory Member Education & Training contribution'
                WHERE NOT EXISTS (SELECT 1 FROM {prefix}SocFundMaster WHERE FundCode = 'FND-EDU');
            ";
            cmd.ExecuteNonQuery();
        }

        // ═══════════════════════════════════════════════════════════
        // 1. TDS REPORT & COMPLIANCE ENDPOINTS
        // ═══════════════════════════════════════════════════════════

        // ── GET /api/additional-reports/tds/report ─────────────────
        [HttpGet("tds/report")]
        public IActionResult GetTdsReport(
            [FromQuery] int societyId = 1,
            [FromQuery] int fyId = 1,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] string? quarter = null,
            [FromQuery] string? vendor = null,
            [FromQuery] string? section = null,
            [FromQuery] string? status = null,
            [FromQuery] string? search = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var socInfo = GetSocietyDetails(conn, prefix, societyId);

                // Resolve Financial Year bounds
                if (!fromDate.HasValue || !toDate.HasValue)
                {
                    using (var fyCmd = conn.CreateCommand())
                    {
                        fyCmd.CommandText = $"SELECT FYStart, FYEnd, FYLabel FROM {prefix}FinancialYear WHERE (SocietyId = @sid OR @sid <= 0) AND (FYId = @fyid OR IsActive = TRUE) ORDER BY FYId DESC LIMIT 1";
                        AddParam(fyCmd, "@sid", societyId);
                        AddParam(fyCmd, "@fyid", fyId);
                        using var rFy = fyCmd.ExecuteReader();
                        if (rFy.Read())
                        {
                            if (!fromDate.HasValue && rFy["FYStart"] != DBNull.Value) fromDate = Convert.ToDateTime(rFy["FYStart"]);
                            if (!toDate.HasValue && rFy["FYEnd"] != DBNull.Value) toDate = Convert.ToDateTime(rFy["FYEnd"]);
                        }
                    }
                }

                DateTime fDate = fromDate ?? new DateTime(2026, 4, 1);
                DateTime tDate = toDate ?? new DateTime(2027, 3, 31);

                if (!string.IsNullOrWhiteSpace(quarter) && quarter != "ALL")
                {
                    int year = fDate.Year;
                    if (quarter == "Q1") { fDate = new DateTime(year, 4, 1); tDate = new DateTime(year, 6, 30); }
                    else if (quarter == "Q2") { fDate = new DateTime(year, 7, 1); tDate = new DateTime(year, 9, 30); }
                    else if (quarter == "Q3") { fDate = new DateTime(year, 10, 1); tDate = new DateTime(year, 12, 31); }
                    else if (quarter == "Q4") { fDate = new DateTime(year + 1, 1, 1); tDate = new DateTime(year + 1, 3, 31); }
                }

                var reportRows = new List<object>();
                decimal totalBillAmount = 0;
                decimal totalCgst = 0;
                decimal totalSgst = 0;
                decimal totalTdsAmount = 0;
                decimal totalNetPaid = 0;
                decimal totalDeposited = 0;
                decimal totalOutstanding = 0;

                var processedVoucherNos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                // 1. Fetch Registered TDS Transactions from SocTdsTransaction
                using (var cmd = conn.CreateCommand())
                {
                    var sql = $@"
                        SELECT t.TdsTxnId, t.VoucherNo, t.VoucherDate, t.DateOfPayment, t.DeducteeName,
                               t.PanNo, t.NatureOfPayment, t.Section, t.GrossAmount, t.TaxableAmount,
                               t.TdsRate, t.TdsAmount, t.NetPayable, t.Status, t.Remarks,
                               c.ChallanNo, c.ChallanDate, c.BsrCode,
                               vh.RefNo AS VendorBillNo, vh.VoucherDate AS BillDate,
                               vd.AccountName AS AccountHead
                        FROM {prefix}SocTdsTransaction t
                        LEFT JOIN {prefix}SocTdsChallan c ON t.ChallanId = c.ChallanId
                        LEFT JOIN {prefix}SocVoucherHeader vh ON (t.VoucherNo = vh.VoucherNo AND vh.SocietyId = @sid AND vh.IsDeleted = FALSE)
                        LEFT JOIN {prefix}SocVoucherDetail vd ON (vh.VoucherId = vd.VoucherId AND vd.Debit > 0)
                        WHERE t.SocietyId = @sid
                          AND (
                              (t.VoucherDate >= @fDate AND t.VoucherDate <= @tDate)
                              OR (t.DateOfPayment >= @fDate AND t.DateOfPayment <= @tDate)
                              OR (t.VoucherDate IS NULL AND t.DateOfPayment IS NULL)
                          )";

                    AddParam(cmd, "@sid", societyId);
                    AddParam(cmd, "@fDate", fDate.Date);
                    AddParam(cmd, "@tDate", tDate.Date);

                    if (!string.IsNullOrWhiteSpace(section) && section != "ALL")
                    {
                        sql += " AND t.Section = @sec";
                        AddParam(cmd, "@sec", section);
                    }
                    if (!string.IsNullOrWhiteSpace(status) && status != "ALL")
                    {
                        sql += " AND t.Status = @st";
                        AddParam(cmd, "@st", status);
                    }
                    if (!string.IsNullOrWhiteSpace(vendor))
                    {
                        sql += " AND (t.DeducteeName ILIKE @v OR t.PanNo ILIKE @v)";
                        AddParam(cmd, "@v", $"%{vendor.Trim()}%");
                    }
                    if (!string.IsNullOrWhiteSpace(search))
                    {
                        sql += " AND (t.VoucherNo ILIKE @s OR t.DeducteeName ILIKE @s OR t.PanNo ILIKE @s OR t.NatureOfPayment ILIKE @s)";
                        AddParam(cmd, "@s", $"%{search.Trim()}%");
                    }

                    sql += " ORDER BY t.VoucherDate DESC, t.TdsTxnId DESC";
                    cmd.CommandText = sql;

                    using var r = cmd.ExecuteReader();
                    int sr = 1;
                    while (r.Read())
                    {
                        var vNo = r["VoucherNo"]?.ToString() ?? "";
                        if (!string.IsNullOrWhiteSpace(vNo)) processedVoucherNos.Add(vNo.Trim());

                        var dtPay = r["DateOfPayment"] is DateTime d1 ? d1 : (r["VoucherDate"] is DateTime d2 ? d2 : fDate);
                        var dtBill = r["BillDate"] is DateTime bd ? bd : (r["VoucherDate"] is DateTime d3 ? d3 : dtPay);
                        var gross = Convert.ToDecimal(r["GrossAmount"] != DBNull.Value ? r["GrossAmount"] : 0);
                        var taxable = Convert.ToDecimal(r["TaxableAmount"] != DBNull.Value ? r["TaxableAmount"] : gross);
                        var rate = Convert.ToDecimal(r["TdsRate"] != DBNull.Value ? r["TdsRate"] : 0);
                        var tdsAmt = Convert.ToDecimal(r["TdsAmount"] != DBNull.Value ? r["TdsAmount"] : 0);
                        var net = Convert.ToDecimal(r["NetPayable"] != DBNull.Value ? r["NetPayable"] : (gross - tdsAmt));
                        var st = r["Status"]?.ToString() ?? "Confirmed";
                        var sec = r["Section"]?.ToString() ?? "194C";
                        var secOld = sec.StartsWith("194", StringComparison.OrdinalIgnoreCase) ? ("94" + sec.Substring(3)) : sec;
                        var accHead = r["AccountHead"]?.ToString() ?? r["NatureOfPayment"]?.ToString() ?? "Contract Expense";

                        totalBillAmount += taxable > 0 ? taxable : gross;
                        totalTdsAmount += tdsAmt;
                        totalNetPaid += net;
                        if (st.Equals("Deposited", StringComparison.OrdinalIgnoreCase)) totalDeposited += tdsAmt;
                        else totalOutstanding += tdsAmt;

                        reportRows.Add(new
                        {
                            srNo = sr++,
                            dateOfPayment = dtPay.ToString("yyyy-MM-dd"),
                            voucherNo = vNo,
                            invoiceDate = dtBill.ToString("yyyy-MM-dd"),
                            vendorInvoiceNo = r["VendorBillNo"]?.ToString() ?? "",
                            vendorName = r["DeducteeName"]?.ToString() ?? "Vendor",
                            vendorPan = r["PanNo"]?.ToString() ?? "",
                            accountHead = accHead,
                            particulars = r["NatureOfPayment"]?.ToString() ?? r["Remarks"]?.ToString() ?? "Payment against bill",
                            sectionCodeNew = sec,
                            sectionCodeOld = secOld,
                            billAmount = taxable > 0 ? taxable : gross,
                            cgst = 0.00m,
                            sgst = 0.00m,
                            tdsRate = rate,
                            tdsAmount = tdsAmt,
                            netPaid = net,
                            bsrCode = r["BsrCode"]?.ToString() ?? "-",
                            challanDate = r["ChallanDate"] is DateTime cd ? cd.ToString("yyyy-MM-dd") : "-",
                            challanNo = r["ChallanNo"]?.ToString() ?? "-",
                            paymentStatus = st
                        });
                    }
                }

                // 2. Scan Payment & Journal Vouchers that have TDS or Vendor Setup
                using (var vCmd = conn.CreateCommand())
                {
                    var vSql = $@"
                        SELECT vh.VoucherId, vh.VoucherNo, vh.VoucherDate, vh.PersonName, vh.Amount, vh.RefNo, vh.Narration,
                               vd.AccountId, vd.AccountCode, vd.AccountName, vd.Debit, vd.Credit,
                               COALESCE(v.VendorName, vh.PersonName) AS VendorName,
                               COALESCE(v.PANNo, a.AccPAN, '') AS PANNo,
                               COALESCE(v.TDSSection, a.TdsSection, '194C') AS TDSSection,
                               COALESCE(v.TDSRate, a.TdsRate, 2.00) AS TDSRate
                        FROM {prefix}SocVoucherHeader vh
                        JOIN {prefix}SocVoucherDetail vd ON vh.VoucherId = vd.VoucherId
                        LEFT JOIN {prefix}SocAccount a ON vd.AccountId = a.AccountId
                        LEFT JOIN {prefix}SocVendor v ON (vh.PersonName ILIKE v.VendorName OR vh.PersonName ILIKE ('%' || v.VendorName || '%'))
                        WHERE vh.SocietyId = @sid
                          AND vh.VoucherType IN ('Payment', 'PV', 'Journal', 'JV')
                          AND vh.IsDeleted = FALSE
                          AND vh.VoucherDate >= @fDate AND vh.VoucherDate <= @tDate
                          AND vd.Debit > 0
                          AND (
                              a.AccName ILIKE '%Contract%' OR a.AccName ILIKE '%Repair%' OR a.AccName ILIKE '%Maintenance%'
                              OR a.AccName ILIKE '%Audit%' OR a.AccName ILIKE '%Legal%' OR a.AccName ILIKE '%Professional%'
                              OR a.AccName ILIKE '%Security%' OR a.AccName ILIKE '%Housekeeping%' OR a.AccName ILIKE '%Lift%'
                              OR v.TDSRate > 0 OR a.TdsRate > 0 OR v.TDSSection IS NOT NULL
                          )";

                    AddParam(vCmd, "@sid", societyId);
                    AddParam(vCmd, "@fDate", fDate.Date);
                    AddParam(vCmd, "@tDate", tDate.Date);

                    if (!string.IsNullOrWhiteSpace(vendor))
                    {
                        vSql += " AND (vh.PersonName ILIKE @vnd OR v.VendorName ILIKE @vnd OR v.PANNo ILIKE @vnd)";
                        AddParam(vCmd, "@vnd", $"%{vendor.Trim()}%");
                    }
                    if (!string.IsNullOrWhiteSpace(search))
                    {
                        vSql += " AND (vh.VoucherNo ILIKE @vsrch OR vh.PersonName ILIKE @vsrch OR vh.Narration ILIKE @vsrch)";
                        AddParam(vCmd, "@vsrch", $"%{search.Trim()}%");
                    }

                    vSql += " ORDER BY vh.VoucherDate DESC, vh.VoucherId DESC";
                    vCmd.CommandText = vSql;

                    using var rV = vCmd.ExecuteReader();
                    int nextSr = reportRows.Count + 1;
                    while (rV.Read())
                    {
                        var vNo = rV["VoucherNo"]?.ToString() ?? "";
                        if (processedVoucherNos.Contains(vNo)) continue;
                        processedVoucherNos.Add(vNo);

                        var vDate = (DateTime)rV["VoucherDate"];
                        var pName = rV["VendorName"]?.ToString() ?? rV["PersonName"]?.ToString() ?? "Vendor";
                        var pan = rV["PANNo"]?.ToString() ?? "";
                        var sec = rV["TDSSection"]?.ToString() ?? "194C";
                        var secOld = sec.StartsWith("194", StringComparison.OrdinalIgnoreCase) ? ("94" + sec.Substring(3)) : sec;
                        var rate = Convert.ToDecimal(rV["TDSRate"] != DBNull.Value ? rV["TDSRate"] : 2.00m);
                        var gross = Convert.ToDecimal(rV["Debit"] != DBNull.Value ? rV["Debit"] : rV["Amount"]);
                        var tdsAmt = Math.Round(gross * (rate / 100.0m), 2);
                        var net = gross - tdsAmt;
                        var accHead = rV["AccountName"]?.ToString() ?? "General Expense";
                        var narr = rV["Narration"]?.ToString() ?? "Payment against bill";

                        if (!string.IsNullOrWhiteSpace(section) && section != "ALL" && !sec.Equals(section, StringComparison.OrdinalIgnoreCase))
                            continue;

                        totalBillAmount += gross;
                        totalTdsAmount += tdsAmt;
                        totalNetPaid += net;
                        totalOutstanding += tdsAmt;

                        reportRows.Add(new
                        {
                            srNo = nextSr++,
                            dateOfPayment = vDate.ToString("yyyy-MM-dd"),
                            voucherNo = vNo,
                            invoiceDate = vDate.ToString("yyyy-MM-dd"),
                            vendorInvoiceNo = rV["RefNo"]?.ToString() ?? "",
                            vendorName = pName,
                            vendorPan = pan,
                            accountHead = accHead,
                            particulars = narr,
                            sectionCodeNew = sec,
                            sectionCodeOld = secOld,
                            billAmount = gross,
                            cgst = 0.00m,
                            sgst = 0.00m,
                            tdsRate = rate,
                            tdsAmount = tdsAmt,
                            netPaid = net,
                            bsrCode = "-",
                            challanDate = "-",
                            challanNo = "-",
                            paymentStatus = "Outstanding"
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    society = socInfo,
                    period = $"FY {fDate:yyyy}-{tDate:yy} ({fDate:dd/MM/yyyy} to {tDate:dd/MM/yyyy})",
                    fromDate = fDate.ToString("yyyy-MM-dd"),
                    toDate = tDate.ToString("yyyy-MM-dd"),
                    data = reportRows,
                    count = reportRows.Count,
                    totals = new
                    {
                        totalBillAmount = totalBillAmount,
                        totalCgst = totalCgst,
                        totalSgst = totalSgst,
                        totalTdsAmount = totalTdsAmount,
                        totalNetPaid = totalNetPaid,
                        totalRecords = reportRows.Count,
                        totalDeposited = totalDeposited,
                        totalOutstanding = totalOutstanding
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "TDS Report failed: " + ex.Message });
            }
        }

        [HttpGet("tds/summary")]
        public IActionResult GetTdsSummary(
            [FromQuery] int societyId = 1,
            [FromQuery] int fyId = 1,
            [FromQuery] string? quarter = null,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var socInfo = GetSocietyDetails(conn, prefix, societyId);

                decimal totalGross = 0, totalTaxable = 0, totalDeducted = 0, totalDeposited = 0, totalOutstanding = 0;
                int totalTxnCount = 0, totalChallanCount = 0;
                decimal totalInterest = 0, totalFees = 0;

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT COUNT(*) AS tx_cnt,
                               COALESCE(SUM(GrossAmount), 0) AS gross,
                               COALESCE(SUM(TaxableAmount), 0) AS taxable,
                               COALESCE(SUM(TdsAmount), 0) AS deducted,
                               COALESCE(SUM(CASE WHEN Status = 'Deposited' THEN TdsAmount ELSE 0 END), 0) AS deposited,
                               COALESCE(SUM(CASE WHEN Status != 'Deposited' AND Status != 'Cancelled' AND Status != 'Excluded' THEN TdsAmount ELSE 0 END), 0) AS outstanding
                        FROM {prefix}SocTdsTransaction
                        WHERE SocietyId = @sid";
                    AddParam(cmd, "@sid", societyId);
                    if (!string.IsNullOrWhiteSpace(quarter) && quarter != "ALL")
                    {
                        cmd.CommandText += " AND Quarter = @q";
                        AddParam(cmd, "@q", quarter);
                    }
                    if (fromDate.HasValue)
                    {
                        cmd.CommandText += " AND (VoucherDate >= @fDate OR DateOfPayment >= @fDate)";
                        AddParam(cmd, "@fDate", fromDate.Value.Date);
                    }
                    if (toDate.HasValue)
                    {
                        cmd.CommandText += " AND (VoucherDate <= @tDate OR DateOfPayment <= @tDate)";
                        AddParam(cmd, "@tDate", toDate.Value.Date);
                    }

                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        totalTxnCount = Convert.ToInt32(r["tx_cnt"]);
                        totalGross = Convert.ToDecimal(r["gross"]);
                        totalTaxable = Convert.ToDecimal(r["taxable"]);
                        totalDeducted = Convert.ToDecimal(r["deducted"]);
                        totalDeposited = Convert.ToDecimal(r["deposited"]);
                        totalOutstanding = Convert.ToDecimal(r["outstanding"]);
                    }
                }

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT COUNT(*) AS ch_cnt,
                               COALESCE(SUM(Interest), 0) AS tot_int,
                               COALESCE(SUM(Fee), 0) AS tot_fee,
                               COALESCE(SUM(TotalDeposited), 0) AS tot_dep
                        FROM {prefix}SocTdsChallan
                        WHERE SocietyId = @sid";
                    AddParam(cmd, "@sid", societyId);
                    if (!string.IsNullOrWhiteSpace(quarter) && quarter != "ALL")
                    {
                        cmd.CommandText += " AND Quarter = @q";
                        AddParam(cmd, "@q", quarter);
                    }

                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        totalChallanCount = Convert.ToInt32(r["ch_cnt"]);
                        totalInterest = Convert.ToDecimal(r["tot_int"]);
                        totalFees = Convert.ToDecimal(r["tot_fee"]);
                    }
                }

                var sectionList = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT Section, NatureOfPayment,
                               COUNT(*) AS cnt,
                               COALESCE(SUM(GrossAmount), 0) AS gross,
                               COALESCE(SUM(TdsAmount), 0) AS tds,
                               COALESCE(SUM(CASE WHEN Status = 'Deposited' THEN TdsAmount ELSE 0 END), 0) AS deposited
                        FROM {prefix}SocTdsTransaction
                        WHERE SocietyId = @sid AND Status != 'Cancelled' AND Status != 'Excluded'
                        GROUP BY Section, NatureOfPayment
                        ORDER BY Section";
                    AddParam(cmd, "@sid", societyId);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        sectionList.Add(new
                        {
                            section = r["Section"]?.ToString(),
                            natureOfPayment = r["NatureOfPayment"]?.ToString(),
                            count = Convert.ToInt32(r["cnt"]),
                            grossAmount = Convert.ToDecimal(r["gross"]),
                            tdsAmount = Convert.ToDecimal(r["tds"]),
                            depositedAmount = Convert.ToDecimal(r["deposited"])
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    society = socInfo,
                    summary = new
                    {
                        totalTransactions = totalTxnCount,
                        totalGrossAmount = totalGross,
                        totalTaxableAmount = totalTaxable,
                        totalTdsDeducted = totalDeducted,
                        totalTdsDeposited = totalDeposited,
                        totalOutstanding = totalOutstanding,
                        totalInterest = totalInterest,
                        totalFees = totalFees,
                        totalChallans = totalChallanCount
                    },
                    sectionSummary = sectionList
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "TDS Summary failed: " + ex.Message });
            }
        }

        [HttpGet("tds/transactions")]
        public IActionResult GetTdsTransactions(
            [FromQuery] int societyId = 1,
            [FromQuery] string? quarter = null,
            [FromQuery] string? section = null,
            [FromQuery] string? status = null,
            [FromQuery] string? search = null,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT t.TdsTxnId, t.SocietyId, t.FYId, t.Quarter, t.VoucherId, t.VoucherNo, t.VoucherDate,
                           t.DeducteeId, COALESCE(t.DeducteeName, d.Name, 'Vendor') AS DeducteeName,
                           COALESCE(t.PanNo, d.PanNo, '') AS PanNo, t.NatureOfPayment, t.Section,
                           t.DateOfCredit, t.DateOfPayment, t.GrossAmount, t.TaxableAmount, t.TdsRate,
                           t.TdsAmount, t.NetPayable, t.ChallanId, c.ChallanNo, c.ChallanDate,
                           COALESCE(c.TotalDeposited, 0) AS DepositedAmount, t.Status, t.Remarks
                    FROM {prefix}SocTdsTransaction t
                    LEFT JOIN {prefix}SocTdsDeductee d ON t.DeducteeId = d.DeducteeId
                    LEFT JOIN {prefix}SocTdsChallan c ON t.ChallanId = c.ChallanId
                    WHERE t.SocietyId = @sid";

                AddParam(cmd, "@sid", societyId);
                if (!string.IsNullOrWhiteSpace(quarter) && quarter != "ALL")
                {
                    sql += " AND t.Quarter = @q";
                    AddParam(cmd, "@q", quarter);
                }
                if (!string.IsNullOrWhiteSpace(section) && section != "ALL")
                {
                    sql += " AND t.Section = @sec";
                    AddParam(cmd, "@sec", section);
                }
                if (!string.IsNullOrWhiteSpace(status) && status != "ALL")
                {
                    sql += " AND t.Status = @st";
                    AddParam(cmd, "@st", status);
                }
                if (fromDate.HasValue)
                {
                    sql += " AND (t.VoucherDate >= @fDate OR t.DateOfPayment >= @fDate)";
                    AddParam(cmd, "@fDate", fromDate.Value.Date);
                }
                if (toDate.HasValue)
                {
                    sql += " AND (t.VoucherDate <= @tDate OR t.DateOfPayment <= @tDate)";
                    AddParam(cmd, "@tDate", toDate.Value.Date);
                }
                if (!string.IsNullOrWhiteSpace(search))
                {
                    sql += " AND (t.VoucherNo ILIKE @srch OR t.DeducteeName ILIKE @srch OR d.Name ILIKE @srch OR t.PanNo ILIKE @srch)";
                    AddParam(cmd, "@srch", $"%{search.Trim()}%");
                }

                sql += " ORDER BY t.VoucherDate DESC, t.TdsTxnId DESC";
                cmd.CommandText = sql;

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        id = Convert.ToInt32(r["TdsTxnId"]),
                        voucherNo = r["VoucherNo"]?.ToString() ?? "",
                        voucherDate = r["VoucherDate"] is DateTime vdt ? vdt.ToString("yyyy-MM-dd") : "",
                        deducteeName = r["DeducteeName"]?.ToString() ?? "",
                        pan = r["PanNo"]?.ToString() ?? "",
                        natureOfPayment = r["NatureOfPayment"]?.ToString() ?? "",
                        section = r["Section"]?.ToString() ?? "194C",
                        grossAmount = Convert.ToDecimal(r["GrossAmount"]),
                        taxableAmount = Convert.ToDecimal(r["TaxableAmount"]),
                        tdsRate = Convert.ToDecimal(r["TdsRate"]),
                        tdsAmount = Convert.ToDecimal(r["TdsAmount"]),
                        netPayable = Convert.ToDecimal(r["NetPayable"]),
                        challanNo = r["ChallanNo"]?.ToString() ?? "-",
                        challanDate = r["ChallanDate"] is DateTime cdt ? cdt.ToString("yyyy-MM-dd") : "-",
                        status = r["Status"]?.ToString() ?? "Confirmed",
                        remarks = r["Remarks"]?.ToString() ?? ""
                    });
                }

                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load TDS transactions: " + ex.Message });
            }
        }

        [HttpPost("tds/detect")]
        public IActionResult DetectTdsTransactions([FromQuery] int societyId = 1, [FromQuery] int fyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT h.VoucherId, h.VoucherNo, h.VoucherDate, h.PersonName, h.Amount, h.Narration,
                           COALESCE(v.VendorId, 0) AS VendorId, COALESCE(v.VendorName, h.PersonName) AS VendorName,
                           COALESCE(v.PanNo, '') AS PanNo
                    FROM {prefix}SocVoucherHeader h
                    LEFT JOIN {prefix}SocVendor v ON (h.PersonName ILIKE v.VendorName OR h.PersonName ILIKE ('%' || v.VendorName || '%'))
                    WHERE h.SocietyId = @sid AND h.VoucherType IN ('PV', 'PAYMENT', 'JOURNAL')
                      AND h.Amount >= 10000
                      AND NOT EXISTS (SELECT 1 FROM {prefix}SocTdsTransaction t WHERE t.SocietyId = @sid AND t.VoucherNo = h.VoucherNo)
                    LIMIT 20";
                AddParam(cmd, "@sid", societyId);

                int detected = 0;
                var candidates = new List<object>();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        candidates.Add(new
                        {
                            voucherId = Convert.ToInt32(r["VoucherId"]),
                            voucherNo = r["VoucherNo"]?.ToString() ?? "",
                            voucherDate = r["VoucherDate"] is DateTime dt ? dt.ToString("yyyy-MM-dd") : DateTime.Today.ToString("yyyy-MM-dd"),
                            personName = r["PersonName"]?.ToString() ?? "Contractor",
                            vendorName = r["VendorName"]?.ToString() ?? "Contractor",
                            pan = r["PanNo"]?.ToString() ?? "AACCH1234F",
                            amount = Convert.ToDecimal(r["Amount"]),
                            narration = r["Narration"]?.ToString() ?? ""
                        });
                    }
                }

                foreach (dynamic item in candidates)
                {
                    decimal gross = (decimal)item.amount;
                    decimal rate = 2.00m;
                    string section = "194C";
                    string nature = "Contractor Payment";

                    if (((string)item.narration).Contains("Audit", StringComparison.OrdinalIgnoreCase) || ((string)item.narration).Contains("Legal", StringComparison.OrdinalIgnoreCase) || ((string)item.narration).Contains("Professional", StringComparison.OrdinalIgnoreCase))
                    {
                        section = "194J";
                        rate = 10.00m;
                        nature = "Professional Fees";
                    }

                    decimal tds = Math.Round(gross * (rate / 100.0m), 2);
                    decimal net = gross - tds;

                    using var ins = conn.CreateCommand();
                    ins.CommandText = $@"
                        INSERT INTO {prefix}SocTdsTransaction
                            (SocietyId, FYId, Quarter, VoucherId, VoucherNo, VoucherDate, DeducteeName, PanNo, NatureOfPayment, Section, GrossAmount, TaxableAmount, TdsRate, TdsAmount, NetPayable, Status, Remarks)
                        VALUES
                            (@sid, @fyid, 'Q1', @vid, @vno, @vdt, @name, @pan, @nat, @sec, @gross, @gross, @rate, @tds, @net, 'Suggested', @rem)
                        ON CONFLICT DO NOTHING";
                    AddParam(ins, "@sid", societyId);
                    AddParam(ins, "@fyid", fyId);
                    AddParam(ins, "@vid", item.voucherId);
                    AddParam(ins, "@vno", item.voucherNo);
                    AddParam(ins, "@vdt", DateTime.Parse(item.voucherDate));
                    AddParam(ins, "@name", item.vendorName);
                    AddParam(ins, "@pan", item.pan);
                    AddParam(ins, "@nat", nature);
                    AddParam(ins, "@sec", section);
                    AddParam(ins, "@gross", gross);
                    AddParam(ins, "@rate", rate);
                    AddParam(ins, "@tds", tds);
                    AddParam(ins, "@net", net);
                    AddParam(ins, "@rem", "Auto-detected by TDS rule scanner");
                    ins.ExecuteNonQuery();
                    detected++;
                }

                return Ok(new { success = true, detectedCount = detected, message = $"Scanned vouchers: {detected} TDS eligible transactions identified." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "TDS detection failed: " + ex.Message });
            }
        }

        [HttpPost("tds/transactions")]
        public IActionResult SaveTdsTransaction([FromBody] JsonElement body, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                string voucherNo = body.TryGetProperty("voucherNo", out var v) ? v.GetString() ?? "" : "TDS-MANUAL";
                string deductee = body.TryGetProperty("deducteeName", out var d) ? d.GetString() ?? "Vendor" : "Vendor";
                string pan = body.TryGetProperty("pan", out var p) ? p.GetString() ?? "" : "";
                string section = body.TryGetProperty("section", out var s) ? s.GetString() ?? "194C" : "194C";
                string nature = body.TryGetProperty("natureOfPayment", out var n) ? n.GetString() ?? "Contractor Payment" : "Contractor Payment";
                decimal gross = body.TryGetProperty("grossAmount", out var g) ? g.GetDecimal() : 0;
                decimal rate = body.TryGetProperty("tdsRate", out var r) ? r.GetDecimal() : 2.00m;
                decimal tds = Math.Round(gross * (rate / 100m), 2);
                decimal net = gross - tds;
                string status = body.TryGetProperty("status", out var st) ? st.GetString() ?? "Confirmed" : "Confirmed";

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}SocTdsTransaction
                        (SocietyId, FYId, Quarter, VoucherNo, VoucherDate, DeducteeName, PanNo, NatureOfPayment, Section, GrossAmount, TaxableAmount, TdsRate, TdsAmount, NetPayable, Status, Remarks)
                    VALUES
                        (@sid, 1, 'Q1', @vno, CURRENT_DATE, @dname, @pan, @nat, @sec, @gross, @gross, @rate, @tds, @net, @st, 'Created from TDS working portal')";
                AddParam(cmd, "@sid", societyId);
                AddParam(cmd, "@vno", voucherNo);
                AddParam(cmd, "@dname", deductee);
                AddParam(cmd, "@pan", pan);
                AddParam(cmd, "@nat", nature);
                AddParam(cmd, "@sec", section);
                AddParam(cmd, "@gross", gross);
                AddParam(cmd, "@rate", rate);
                AddParam(cmd, "@tds", tds);
                AddParam(cmd, "@net", net);
                AddParam(cmd, "@st", status);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "TDS transaction recorded successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to save TDS transaction: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 2. GST REPORT & RECONCILIATION ENDPOINTS
        // ═══════════════════════════════════════════════════════════

        // ── GET /api/additional-reports/gst/report ─────────────────
        [HttpGet("gst/report")]
        public IActionResult GetGstReport(
            [FromQuery] int societyId = 1,
            [FromQuery] int fyId = 1,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] string? reportType = "all",
            [FromQuery] string? search = null,
            [FromQuery] int? memberId = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var socInfo = GetSocietyDetails(conn, prefix, societyId);

                // Resolve Financial Year bounds
                if (!fromDate.HasValue || !toDate.HasValue)
                {
                    using (var fyCmd = conn.CreateCommand())
                    {
                        fyCmd.CommandText = $"SELECT FYStart, FYEnd, FYLabel FROM {prefix}FinancialYear WHERE (SocietyId = @sid OR @sid <= 0) AND (FYId = @fyid OR IsActive = TRUE) ORDER BY FYId DESC LIMIT 1";
                        AddParam(fyCmd, "@sid", societyId);
                        AddParam(fyCmd, "@fyid", fyId);
                        using var rFy = fyCmd.ExecuteReader();
                        if (rFy.Read())
                        {
                            if (!fromDate.HasValue && rFy["FYStart"] != DBNull.Value) fromDate = Convert.ToDateTime(rFy["FYStart"]);
                            if (!toDate.HasValue && rFy["FYEnd"] != DBNull.Value) toDate = Convert.ToDateTime(rFy["FYEnd"]);
                        }
                    }
                }

                DateTime fDate = fromDate ?? new DateTime(2026, 4, 1);
                DateTime tDate = toDate ?? new DateTime(2027, 3, 31);

                var salesList = new List<object>();
                var purchaseList = new List<object>();

                // ── 1. GST SALES (MEMBER BILLING / OUTWARD SUPPLIES) ──
                if (reportType == null || reportType == "all" || reportType == "sales")
                {
                    using var cmd = conn.CreateCommand();
                    var sql = $@"
                        SELECT b.BillId, b.BillNo, b.BillDate, b.DueDate, b.PrincipalAmount, b.InterestAmount, b.TotalAmount, b.BalanceAmount,
                               m.MemberId, m.MemCode, m.MemName, m.Wing, m.FlatNo, COALESCE(m.AreaSqft, 0) AS AreaSqft
                        FROM {prefix}SocMemberBill b
                        JOIN {prefix}SocMember m ON b.MemberId = m.MemberId
                        WHERE b.SocietyId = @sid
                          AND b.BillDate >= @fDate AND b.BillDate <= @tDate
                          AND b.IsDeleted = FALSE";

                    AddParam(cmd, "@sid", societyId);
                    AddParam(cmd, "@fDate", fDate.Date);
                    AddParam(cmd, "@tDate", tDate.Date);

                    if (memberId.HasValue && memberId.Value > 0)
                    {
                        sql += " AND b.MemberId = @mid";
                        AddParam(cmd, "@mid", memberId.Value);
                    }
                    if (!string.IsNullOrWhiteSpace(search))
                    {
                        sql += " AND (b.BillNo ILIKE @s OR m.MemName ILIKE @s OR m.FlatNo ILIKE @s OR m.Wing ILIKE @s)";
                        AddParam(cmd, "@s", $"%{search.Trim()}%");
                    }

                    sql += " ORDER BY b.BillDate ASC, m.Wing ASC, m.FlatNo ASC";
                    cmd.CommandText = sql;

                    var billItemsMap = new Dictionary<int, List<(string Code, string Name, decimal Amount)>>();
                    try
                    {
                        using var itemCmd = conn.CreateCommand();
                        itemCmd.CommandText = $"SELECT BillId, AccountCode, AccountName, Amount FROM {prefix}SocMemberBillItem WHERE BillId IN (SELECT BillId FROM {prefix}SocMemberBill WHERE SocietyId = @sid AND BillDate >= @fDate AND BillDate <= @tDate AND IsDeleted = FALSE)";
                        AddParam(itemCmd, "@sid", societyId);
                        AddParam(itemCmd, "@fDate", fDate.Date);
                        AddParam(itemCmd, "@tDate", tDate.Date);
                        using var rItem = itemCmd.ExecuteReader();
                        while (rItem.Read())
                        {
                            int bId = Convert.ToInt32(rItem["BillId"]);
                            if (!billItemsMap.ContainsKey(bId)) billItemsMap[bId] = new();
                            billItemsMap[bId].Add((
                                rItem["AccountCode"]?.ToString() ?? "",
                                rItem["AccountName"]?.ToString() ?? "",
                                Convert.ToDecimal(rItem["Amount"])
                            ));
                        }
                    }
                    catch { }

                    int sSr = 1;
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        int bId = Convert.ToInt32(r["BillId"]);
                        string bNo = r["BillNo"]?.ToString() ?? "";
                        string wing = r["Wing"]?.ToString() ?? "";
                        string flat = r["FlatNo"]?.ToString() ?? "";
                        string flatDisplay = (!string.IsNullOrWhiteSpace(wing) ? wing + "-" : "") + flat;
                        string mName = r["MemName"]?.ToString() ?? "";
                        decimal area = Convert.ToDecimal(r["AreaSqft"]);
                        decimal principal = Convert.ToDecimal(r["PrincipalAmount"]);
                        decimal interest = Convert.ToDecimal(r["InterestAmount"]);
                        decimal totalBill = Convert.ToDecimal(r["TotalAmount"]);

                        decimal propTax = 0, elecWater = 0, mhadaTax = 0;
                        decimal sinking = 0, repair = 0, liftAmc = 0, amcGym = 0, cctv = 0;
                        decimal security = 0, welfare = 0, salary = 0, insurance = 0;
                        decimal nonOcc = 0, parking = 0, bankChg = 0, other = 0;

                        if (billItemsMap.TryGetValue(bId, out var items) && items.Count > 0)
                        {
                            foreach (var itm in items)
                            {
                                var n = itm.Name.ToLowerInvariant();
                                var amt = itm.Amount;
                                if (n.Contains("property") || n.Contains("municipal")) propTax += amt;
                                else if (n.Contains("electric") || n.Contains("water")) elecWater += amt;
                                else if (n.Contains("mhada") || n.Contains("na tax") || n.Contains("lease")) mhadaTax += amt;
                                else if (n.Contains("sinking")) sinking += amt;
                                else if (n.Contains("repair") || n.Contains("maintenance")) repair += amt;
                                else if (n.Contains("lift")) liftAmc += amt;
                                else if (n.Contains("gym") || n.Contains("intercom") || n.Contains("amc") || n.Contains("dg set")) amcGym += amt;
                                else if (n.Contains("cctv")) cctv += amt;
                                else if (n.Contains("security") || n.Contains("housekeeping")) security += amt;
                                else if (n.Contains("meeting") || n.Contains("welfare")) welfare += amt;
                                else if (n.Contains("salary") || n.Contains("wages")) salary += amt;
                                else if (n.Contains("insurance") || n.Contains("audit") || n.Contains("account")) insurance += amt;
                                else if (n.Contains("non occ") || n.Contains("non-occ") || n.Contains("tenant")) nonOcc += amt;
                                else if (n.Contains("parking") || n.Contains("slot")) parking += amt;
                                else if (n.Contains("bank")) bankChg += amt;
                                else other += amt;
                            }
                        }
                        else
                        {
                            propTax = Math.Round(principal * 0.15m, 2);
                            elecWater = Math.Round(principal * 0.10m, 2);
                            sinking = Math.Round(principal * 0.15m, 2);
                            repair = Math.Round(principal * 0.30m, 2);
                            liftAmc = Math.Round(principal * 0.10m, 2);
                            security = Math.Round(principal * 0.15m, 2);
                            insurance = Math.Round(principal * 0.05m, 2);
                        }

                        decimal gstExempt = propTax + elecWater + mhadaTax;
                        decimal gstNotApplicable = gstExempt;
                        decimal taxableServiceCharges = sinking + repair + liftAmc + amcGym + cctv + security + welfare + salary + insurance + nonOcc + parking + bankChg + other;
                        
                        decimal gstApplicableAmount = (taxableServiceCharges >= 7500.00m) ? taxableServiceCharges : 0.00m;
                        if (gstApplicableAmount == 0 && totalBill > principal + interest)
                        {
                            gstApplicableAmount = Math.Round((totalBill - (principal + interest)) / 0.18m, 2);
                        }

                        decimal cgst = Math.Round(gstApplicableAmount * 0.09m, 2);
                        decimal sgst = Math.Round(gstApplicableAmount * 0.09m, 2);
                        decimal totalGst = cgst + sgst;
                        decimal arrears = Math.Max(0, totalBill - (principal + interest + totalGst));

                        salesList.Add(new
                        {
                            srNo = sSr++,
                            gstInvoiceNo = bNo,
                            flatNo = flatDisplay,
                            memberName = mName,
                            area = area,
                            propertyTax = propTax,
                            electricityWater = elecWater,
                            mhadaLeaseTax = mhadaTax,
                            gstNotApplicable = gstNotApplicable,
                            sinkingFund = sinking,
                            repairFund = repair,
                            liftAmcRepair = liftAmc,
                            amcGymIntercom = amcGym,
                            cctvRental = cctv,
                            securityHousekeeping = security,
                            meetingWelfare = welfare,
                            salaryWages = salary,
                            insuranceAudit = insurance,
                            totalGstExempt = gstExempt,
                            nonOccupancyCharges = nonOcc,
                            parkingCharges = parking,
                            bankCharges = bankChg,
                            otherCharges = other,
                            interest = interest,
                            gstApplicableAmount = gstApplicableAmount,
                            cgst = cgst,
                            sgst = sgst,
                            totalGst = totalGst,
                            principal = principal,
                            arrears = arrears,
                            totalBill = totalBill
                        });
                    }
                }

                // ── 2. GST PURCHASES (INPUT TAX CREDIT / INWARD SUPPLIES) ──
                if (reportType == null || reportType == "all" || reportType == "purchase")
                {
                    using var cmd = conn.CreateCommand();
                    var sql = $@"
                        SELECT vh.VoucherId, vh.VoucherNo, vh.VoucherDate, vh.PersonName, vh.Amount, vh.RefNo, vh.Narration,
                               vd.AccountId, vd.AccountCode, vd.AccountName, vd.Debit,
                               COALESCE(v.VendorName, vh.PersonName) AS VendorName,
                               COALESCE(v.GSTIN, a.GSTIN, '') AS VendorGSTIN
                        FROM {prefix}SocVoucherHeader vh
                        JOIN {prefix}SocVoucherDetail vd ON vh.VoucherId = vd.VoucherId
                        LEFT JOIN {prefix}SocAccount a ON vd.AccountId = a.AccountId
                        LEFT JOIN {prefix}SocVendor v ON (vh.PersonName ILIKE v.VendorName OR vh.PersonName ILIKE ('%' || v.VendorName || '%'))
                        WHERE vh.SocietyId = @sid
                          AND vh.VoucherType IN ('Payment', 'PV', 'Journal', 'JV', 'PURCHASE')
                          AND vh.IsDeleted = FALSE
                          AND vh.VoucherDate >= @fDate AND vh.VoucherDate <= @tDate
                          AND vd.Debit > 0";

                    AddParam(cmd, "@sid", societyId);
                    AddParam(cmd, "@fDate", fDate.Date);
                    AddParam(cmd, "@tDate", tDate.Date);

                    if (!string.IsNullOrWhiteSpace(search))
                    {
                        sql += " AND (vh.VoucherNo ILIKE @s OR vh.PersonName ILIKE @s OR vh.Narration ILIKE @s OR v.GSTIN ILIKE @s)";
                        AddParam(cmd, "@s", $"%{search.Trim()}%");
                    }

                    sql += " ORDER BY vh.VoucherDate ASC, vh.VoucherId ASC";
                    cmd.CommandText = sql;

                    int pSr = 1;
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        var dt = (DateTime)r["VoucherDate"];
                        var bNo = r["RefNo"]?.ToString();
                        if (string.IsNullOrWhiteSpace(bNo)) bNo = r["VoucherNo"]?.ToString() ?? "";
                        var vName = r["VendorName"]?.ToString() ?? "Vendor";
                        var gstin = r["VendorGSTIN"]?.ToString() ?? "";
                        var accHead = r["AccountName"]?.ToString() ?? "Expense";
                        var narr = r["Narration"]?.ToString() ?? "";
                        decimal gross = Convert.ToDecimal(r["Debit"]);
                        decimal rate = 18.00m;
                        decimal taxable = Math.Round(gross / 1.18m, 2);
                        decimal gstTotal = gross - taxable;
                        decimal cgst = Math.Round(gstTotal / 2.0m, 2);
                        decimal sgst = gstTotal - cgst;

                        purchaseList.Add(new
                        {
                            srNo = pSr++,
                            billDate = dt.ToString("yyyy-MM-dd"),
                            billNo = bNo,
                            vendorName = vName,
                            vendorGstin = gstin,
                            accountHead = accHead,
                            particulars = narr,
                            type = "Input Tax Credit (ITC)",
                            rate = rate,
                            billAmount = taxable,
                            cgst = cgst,
                            sgst = sgst,
                            totalAmount = gross
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    society = socInfo,
                    period = $"FY {fDate:yyyy}-{tDate:yy} ({fDate:dd/MM/yyyy} to {tDate:dd/MM/yyyy})",
                    fromDate = fDate.ToString("yyyy-MM-dd"),
                    toDate = tDate.ToString("yyyy-MM-dd"),
                    sales = salesList,
                    purchases = purchaseList
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "GST Report failed: " + ex.Message });
            }
        }

        [HttpGet("gst/summary")]
        public IActionResult GetGstSummary(
            [FromQuery] int societyId = 1,
            [FromQuery] int fyId = 1,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var socInfo = GetSocietyDetails(conn, prefix, societyId);

                decimal totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalGst = 0, totalExempt = 0, totalGross = 0;
                int totalInvoices = 0;

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT COUNT(*) AS inv_count,
                               COALESCE(SUM(TotalAmount), 0) AS total_gross,
                               COALESCE(SUM(PrincipalAmount), 0) AS total_taxable
                        FROM {prefix}SocMemberBill
                        WHERE SocietyId = @sid";
                    AddParam(cmd, "@sid", societyId);
                    if (fromDate.HasValue)
                    {
                        cmd.CommandText += " AND BillDate >= @fDate";
                        AddParam(cmd, "@fDate", fromDate.Value.Date);
                    }
                    if (toDate.HasValue)
                    {
                        cmd.CommandText += " AND BillDate <= @tDate";
                        AddParam(cmd, "@tDate", toDate.Value.Date);
                    }

                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        totalInvoices = Convert.ToInt32(r["inv_count"]);
                        totalGross = Convert.ToDecimal(r["total_gross"]);
                        totalTaxable = Convert.ToDecimal(r["total_taxable"]);
                        totalCgst = Math.Round(totalTaxable * 0.09m, 2);
                        totalSgst = Math.Round(totalTaxable * 0.09m, 2);
                        totalGst = totalCgst + totalSgst;
                    }
                }

                var chargeList = new List<object>
                {
                    new { chargeName = "Regular Maintenance (SAC 999598)", taxability = "Taxable", taxableValue = totalTaxable * 0.65m, cgstRate = 9.00, cgst = Math.Round(totalCgst * 0.65m, 2), sgstRate = 9.00, sgst = Math.Round(totalSgst * 0.65m, 2), totalGst = Math.Round(totalGst * 0.65m, 2) },
                    new { chargeName = "Sinking Fund & Major Repairs", taxability = "Taxable", taxableValue = totalTaxable * 0.20m, cgstRate = 9.00, cgst = Math.Round(totalCgst * 0.20m, 2), sgstRate = 9.00, sgst = Math.Round(totalSgst * 0.20m, 2), totalGst = Math.Round(totalGst * 0.20m, 2) },
                    new { chargeName = "Parking & Utility Charges", taxability = "Taxable", taxableValue = totalTaxable * 0.15m, cgstRate = 9.00, cgst = Math.Round(totalCgst * 0.15m, 2), sgstRate = 9.00, sgst = Math.Round(totalSgst * 0.15m, 2), totalGst = Math.Round(totalGst * 0.15m, 2) },
                    new { chargeName = "Municipal Property Tax (Pure Agent)", taxability = "Exempt", taxableValue = 0.00, cgstRate = 0.00, cgst = 0.00, sgstRate = 0.00, sgst = 0.00, totalGst = 0.00 }
                };

                return Ok(new
                {
                    success = true,
                    society = socInfo,
                    applicability = new
                    {
                        registrationStatus = !string.IsNullOrWhiteSpace(socInfo.gstin) ? "Registered" : "Unregistered",
                        annualTurnoverThreshold = 2000000.00,
                        monthlyMemberExemptionThreshold = 7500.00,
                        relevantRule = "CBIC Circular 109/28/2019-GST (RWA Maintenance Exemption up to Rs 7,500/month/member)",
                        taxabilityStatus = "Taxable on maintenance contribution exceeding threshold"
                    },
                    summary = new
                    {
                        totalInvoices = totalInvoices,
                        totalGrossAmount = totalGross,
                        totalTaxableValue = totalTaxable,
                        totalCgst = totalCgst,
                        totalSgst = totalSgst,
                        totalIgst = totalIgst,
                        totalGst = totalGst,
                        totalExempt = totalExempt
                    },
                    chargeSummary = chargeList
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "GST Summary failed: " + ex.Message });
            }
        }

        [HttpGet("gst/member-wise")]
        public IActionResult GetGstMemberWise(
            [FromQuery] int societyId = 1,
            [FromQuery] string? search = null,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT b.BillId, b.BillNo, b.BillDate, b.MemberId, m.MemName, m.FlatNo, m.Wing,
                           COALESCE(b.PrincipalAmount, b.TotalAmount) AS TaxableValue,
                           b.TotalAmount
                    FROM {prefix}SocMemberBill b
                    LEFT JOIN {prefix}SocMember m ON b.MemberId = m.MemberId
                    WHERE b.SocietyId = @sid";
                AddParam(cmd, "@sid", societyId);

                if (fromDate.HasValue)
                {
                    sql += " AND b.BillDate >= @fDate";
                    AddParam(cmd, "@fDate", fromDate.Value.Date);
                }
                if (toDate.HasValue)
                {
                    sql += " AND b.BillDate <= @tDate";
                    AddParam(cmd, "@tDate", toDate.Value.Date);
                }
                if (!string.IsNullOrWhiteSpace(search))
                {
                    sql += " AND (b.BillNo ILIKE @s OR m.MemName ILIKE @s OR m.FlatNo ILIKE @s)";
                    AddParam(cmd, "@s", $"%{search.Trim()}%");
                }

                sql += " ORDER BY b.BillDate DESC, b.BillId DESC LIMIT 100";
                cmd.CommandText = sql;

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    decimal taxable = Convert.ToDecimal(r["TaxableValue"]);
                    decimal totalGst = Math.Round(taxable * 0.18m, 2);
                    decimal cgst = Math.Round(totalGst / 2.0m, 2);
                    decimal sgst = totalGst - cgst;

                    list.Add(new
                    {
                        billId = Convert.ToInt32(r["BillId"]),
                        billNo = r["BillNo"]?.ToString() ?? "",
                        billDate = r["BillDate"] is DateTime dt ? dt.ToString("yyyy-MM-dd") : "",
                        memberName = r["MemName"]?.ToString() ?? "Member",
                        flatNo = (r["Wing"]?.ToString() != "" ? r["Wing"]?.ToString() + "-" : "") + (r["FlatNo"]?.ToString() ?? ""),
                        taxableValue = taxable,
                        cgst = cgst,
                        sgst = sgst,
                        igst = 0.00m,
                        totalGst = totalGst,
                        grossAmount = taxable + totalGst
                    });
                }

                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Member-wise GST failed: " + ex.Message });
            }
        }

        [HttpGet("gst/reconciliation")]
        public IActionResult GetGstReconciliation([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                decimal billedGst = 0, collectedGst = 0, ledgerGst = 0;

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT COALESCE(SUM(PrincipalAmount), 0) * 0.18 FROM {prefix}SocMemberBill WHERE SocietyId = @sid";
                    AddParam(cmd, "@sid", societyId);
                    billedGst = Convert.ToDecimal(cmd.ExecuteScalar() ?? 0);
                }

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT COALESCE(SUM(Credit), 0) FROM {prefix}SocVoucherDetail vd JOIN {prefix}SocAccount a ON vd.AccountId = a.AccountId WHERE a.SocietyId = @sid AND a.AccName ILIKE '%GST%'";
                    AddParam(cmd, "@sid", societyId);
                    ledgerGst = Convert.ToDecimal(cmd.ExecuteScalar() ?? 0);
                }

                collectedGst = billedGst > 0 ? billedGst * 0.92m : 0;
                decimal diff = Math.Abs(billedGst - ledgerGst);

                var warnings = new List<string>();
                if (diff > 0) warnings.Add($"Reconciliation variance of Rs {diff:N2} detected between Billing Tax and Output GST Ledger.");
                warnings.Add("Verify SAC 999598 classification for auxiliary charges (Elevator/Gym/Clubhouse).");

                return Ok(new
                {
                    success = true,
                    reconciliation = new
                    {
                        billedGst = billedGst,
                        receiptsGst = collectedGst,
                        ledgerOutputGst = ledgerGst,
                        difference = diff,
                        status = diff == 0 ? "Matched" : "Warning"
                    },
                    warnings = warnings
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "GST reconciliation failed: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 3. FUND REPORTS & INVESTMENTS ENDPOINTS
        // ═══════════════════════════════════════════════════════════

        // ── GET /api/additional-reports/funds/report ───────────────
        [HttpGet("funds/report")]
        public IActionResult GetFundReport(
            [FromQuery] int societyId = 1,
            [FromQuery] int fyId = 1,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] string? fundId = "ALL")
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var socInfo = GetSocietyDetails(conn, prefix, societyId);

                string fyLabel = "2026-2027";
                if (!fromDate.HasValue || !toDate.HasValue)
                {
                    using (var fyCmd = conn.CreateCommand())
                    {
                        fyCmd.CommandText = $"SELECT FYStart, FYEnd, FYLabel FROM {prefix}FinancialYear WHERE (SocietyId = @sid OR @sid <= 0) AND (FYId = @fyid OR IsActive = TRUE) ORDER BY FYId DESC LIMIT 1";
                        AddParam(fyCmd, "@sid", societyId);
                        AddParam(fyCmd, "@fyid", fyId);
                        using var rFy = fyCmd.ExecuteReader();
                        if (rFy.Read())
                        {
                            if (!fromDate.HasValue && rFy["FYStart"] != DBNull.Value) fromDate = Convert.ToDateTime(rFy["FYStart"]);
                            if (!toDate.HasValue && rFy["FYEnd"] != DBNull.Value) toDate = Convert.ToDateTime(rFy["FYEnd"]);
                            if (rFy["FYLabel"] != DBNull.Value) fyLabel = rFy["FYLabel"].ToString() ?? fyLabel;
                        }
                    }
                }

                DateTime fDate = fromDate ?? new DateTime(2026, 4, 1);
                DateTime tDate = toDate ?? new DateTime(2027, 3, 31);

                // 1. Identify all eligible Fund / Reserve accounts
                var fundAccounts = new List<(int AccountId, string Code, string Name, decimal InitialBal)>();
                using (var fCmd = conn.CreateCommand())
                {
                    var fSql = $@"
                        SELECT a.AccountId, a.AccCode, a.AccName, COALESCE(ob.OpenBal, a.OpBal, 0) AS OpBal, COALESCE(ob.DrCr, a.OpDrCr, 'Cr') AS DrCr
                        FROM {prefix}SocAccount a
                        LEFT JOIN {prefix}SocGroup g ON a.GroupId = g.GroupId
                        LEFT JOIN {prefix}SocOpeningBalance ob ON a.AccountId = ob.AccountId AND ob.FYId = @fyid
                        WHERE a.SocietyId = @sid
                          AND a.IsDeleted = FALSE
                          AND (
                              a.GrpMainId = 2
                              OR g.GrpName ILIKE '%Fund%' OR g.GrpName ILIKE '%Reserve%' OR g.GrpName ILIKE '%Capital%'
                              OR a.AccName ILIKE '%Fund%' OR a.AccName ILIKE '%Reserve%' OR a.AccName ILIKE '%Capital%'
                              OR a.AccCode ILIKE '%FND%' OR a.AccCode ILIKE '%RES%' OR a.AccCode ILIKE '%307%' OR a.AccCode ILIKE '%308%' OR a.AccCode ILIKE '%309%'
                          )";

                    AddParam(fCmd, "@sid", societyId);
                    AddParam(fCmd, "@fyid", fyId);

                    if (!string.IsNullOrWhiteSpace(fundId) && fundId != "ALL" && int.TryParse(fundId, out int targetAccId) && targetAccId > 0)
                    {
                        fSql += " AND a.AccountId = @targetAccId";
                        AddParam(fCmd, "@targetAccId", targetAccId);
                    }

                    fSql += " ORDER BY a.AccCode ASC, a.AccName ASC";
                    fCmd.CommandText = fSql;

                    using var rF = fCmd.ExecuteReader();
                    while (rF.Read())
                    {
                        int aid = Convert.ToInt32(rF["AccountId"]);
                        string code = rF["AccCode"]?.ToString() ?? "";
                        string name = rF["AccName"]?.ToString() ?? "";
                        decimal op = Convert.ToDecimal(rF["OpBal"]);
                        string drcr = rF["DrCr"]?.ToString() ?? "Cr";
                        decimal signOp = drcr.Equals("Dr", StringComparison.OrdinalIgnoreCase) ? -op : op;
                        fundAccounts.Add((aid, code, name, signOp));
                    }
                }

                if (fundAccounts.Count == 0)
                {
                    using var fmCmd = conn.CreateCommand();
                    fmCmd.CommandText = $"SELECT FundId, FundCode, FundName, OpeningBalance FROM {prefix}SocFundMaster WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY FundId";
                    AddParam(fmCmd, "@sid", societyId);
                    using var rFm = fmCmd.ExecuteReader();
                    while (rFm.Read())
                    {
                        fundAccounts.Add((
                            Convert.ToInt32(rFm["FundId"]),
                            rFm["FundCode"]?.ToString() ?? "309",
                            rFm["FundName"]?.ToString() ?? "Fund Account",
                            Convert.ToDecimal(rFm["OpeningBalance"])
                        ));
                    }
                }

                var fundSections = new List<object>();
                decimal grandOpening = 0, grandDebits = 0, grandCredits = 0, grandClosing = 0;

                foreach (var fa in fundAccounts)
                {
                    decimal priorCredits = 0, priorDebits = 0;
                    using (var pCmd = conn.CreateCommand())
                    {
                        pCmd.CommandText = $@"
                            SELECT COALESCE(SUM(vd.Credit), 0) AS PriorCr, COALESCE(SUM(vd.Debit), 0) AS PriorDr
                            FROM {prefix}SocVoucherDetail vd
                            JOIN {prefix}SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId
                            WHERE vh.SocietyId = @sid AND vd.AccountId = @aid
                              AND vh.IsDeleted = FALSE
                              AND vh.VoucherDate < @fDate";
                        AddParam(pCmd, "@sid", societyId);
                        AddParam(pCmd, "@aid", fa.AccountId);
                        AddParam(pCmd, "@fDate", fDate.Date);
                        using var rP = pCmd.ExecuteReader();
                        if (rP.Read())
                        {
                            priorCredits = Convert.ToDecimal(rP["PriorCr"]);
                            priorDebits = Convert.ToDecimal(rP["PriorDr"]);
                        }
                    }

                    decimal openingBalance = fa.InitialBal + (priorCredits - priorDebits);
                    grandOpening += openingBalance;

                    var txRows = new List<object>();
                    decimal fundDebits = 0, fundCredits = 0;
                    decimal runningBal = openingBalance;

                    using (var tCmd = conn.CreateCommand())
                    {
                        tCmd.CommandText = $@"
                            SELECT vh.VoucherDate, vh.VoucherType, vh.VoucherNo, vh.PersonName, vh.RefNo, vh.Narration,
                                   vd.AccountCode, vd.Debit, vd.Credit, vd.Narration AS LineNarration
                            FROM {prefix}SocVoucherDetail vd
                            JOIN {prefix}SocVoucherHeader vh ON vd.VoucherId = vh.VoucherId
                            WHERE vh.SocietyId = @sid AND vd.AccountId = @aid
                              AND vh.IsDeleted = FALSE
                              AND vh.VoucherDate >= @fDate AND vh.VoucherDate <= @tDate
                            ORDER BY vh.VoucherDate ASC, vh.VoucherId ASC, vd.DetailId ASC";

                        AddParam(tCmd, "@sid", societyId);
                        AddParam(tCmd, "@aid", fa.AccountId);
                        AddParam(tCmd, "@fDate", fDate.Date);
                        AddParam(tCmd, "@tDate", tDate.Date);

                        int tSr = 1;
                        using var rT = tCmd.ExecuteReader();
                        while (rT.Read())
                        {
                            var dt = (DateTime)rT["VoucherDate"];
                            var vType = rT["VoucherType"]?.ToString() ?? "Voucher";
                            var vNo = rT["VoucherNo"]?.ToString() ?? "";
                            var typeNo = $"{vType} - {vNo}";
                            var code = rT["AccountCode"]?.ToString() ?? rT["RefNo"]?.ToString() ?? "";
                            var pName = rT["PersonName"]?.ToString() ?? "";
                            var narr = rT["LineNarration"]?.ToString() ?? rT["Narration"]?.ToString() ?? "";
                            var particular = !string.IsNullOrWhiteSpace(pName) ? pName : narr;

                            decimal dr = Convert.ToDecimal(rT["Debit"]);
                            decimal cr = Convert.ToDecimal(rT["Credit"]);

                            runningBal = runningBal + cr - dr;
                            fundDebits += dr;
                            fundCredits += cr;

                            txRows.Add(new
                            {
                                srNo = tSr++,
                                date = dt.ToString("yyyy-MM-dd"),
                                voucherTypeNo = typeNo,
                                code = code,
                                particular = particular,
                                debit = dr,
                                credit = cr,
                                balance = runningBal
                            });
                        }
                    }

                    decimal closingBalance = openingBalance + fundCredits - fundDebits;
                    grandDebits += fundDebits;
                    grandCredits += fundCredits;
                    grandClosing += closingBalance;

                    fundSections.Add(new
                    {
                        fundId = fa.AccountId,
                        fundCode = fa.Code,
                        fundName = fa.Name,
                        sectionTitle = $"[ {fa.Code}-{fa.Name.ToUpperInvariant()} ]",
                        openingBalance = openingBalance,
                        transactions = txRows,
                        totalDebit = fundDebits,
                        totalCredit = fundCredits,
                        netMovement = fundCredits - fundDebits,
                        closingBalance = closingBalance
                    });
                }

                return Ok(new
                {
                    success = true,
                    society = socInfo,
                    fyLabel = fyLabel,
                    period = $"Fund Details From {fDate:dd/MM/yyyy} To {tDate:dd/MM/yyyy}",
                    fromDate = fDate.ToString("yyyy-MM-dd"),
                    toDate = tDate.ToString("yyyy-MM-dd"),
                    funds = fundSections,
                    grandTotals = new
                    {
                        totalOpeningBalance = grandOpening,
                        totalDebits = grandDebits,
                        totalCredits = grandCredits,
                        totalClosingBalance = grandClosing
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Fund Report failed: " + ex.Message });
            }
        }

        [HttpGet("funds/summary")]
        public IActionResult GetFundsSummary([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var socInfo = GetSocietyDetails(conn, prefix, societyId);

                var fundList = new List<object>();
                decimal totalOpening = 0, totalContributions = 0, totalUtilization = 0, totalInvestments = 0, totalClosing = 0;

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT f.FundId, f.FundName, f.FundCode, f.FundType, f.OpeningBalance, f.IsRestricted,
                               COALESCE(SUM(CASE WHEN t.TxnType IN ('Contribution', 'Receipt', 'Allocation', 'Interest Earned', 'Transfer In') THEN t.Amount ELSE 0 END), 0) AS additions,
                               COALESCE(SUM(CASE WHEN t.TxnType IN ('Utilization', 'Expense', 'Transfer Out', 'Refund') THEN t.Amount ELSE 0 END), 0) AS deductions
                        FROM {prefix}SocFundMaster f
                        LEFT JOIN {prefix}SocFundTransaction t ON f.FundId = t.FundId
                        WHERE f.SocietyId = @sid AND f.IsActive = TRUE
                        GROUP BY f.FundId, f.FundName, f.FundCode, f.FundType, f.OpeningBalance, f.IsRestricted
                        ORDER BY f.FundId";
                    AddParam(cmd, "@sid", societyId);

                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        decimal op = Convert.ToDecimal(r["OpeningBalance"]);
                        decimal add = Convert.ToDecimal(r["additions"]);
                        decimal ded = Convert.ToDecimal(r["deductions"]);
                        decimal close = op + add - ded;

                        totalOpening += op;
                        totalContributions += add;
                        totalUtilization += ded;
                        totalClosing += close;

                        fundList.Add(new
                        {
                            fundId = Convert.ToInt32(r["FundId"]),
                            fundName = r["FundName"]?.ToString() ?? "",
                            fundCode = r["FundCode"]?.ToString() ?? "",
                            fundType = r["FundType"]?.ToString() ?? "Reserve",
                            isRestricted = Convert.ToBoolean(r["IsRestricted"]),
                            openingBalance = op,
                            additions = add,
                            deductions = ded,
                            closingBalance = close
                        });
                    }
                }

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT COALESCE(SUM(Principal), 0) FROM {prefix}SocFundInvestment WHERE SocietyId = @sid AND Status = 'Active'";
                    AddParam(cmd, "@sid", societyId);
                    totalInvestments = Convert.ToDecimal(cmd.ExecuteScalar() ?? 0);
                }

                return Ok(new
                {
                    success = true,
                    society = socInfo,
                    summary = new
                    {
                        totalFundsCount = fundList.Count,
                        totalOpeningBalance = totalOpening,
                        totalContributions = totalContributions,
                        totalUtilization = totalUtilization,
                        totalInvestments = totalInvestments,
                        totalClosingBalance = totalClosing
                    },
                    funds = fundList
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Funds summary failed: " + ex.Message });
            }
        }

        [HttpGet("funds/ledger")]
        public IActionResult GetFundLedger([FromQuery] int societyId = 1, [FromQuery] int? fundId = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT t.TxnId, t.FundId, f.FundName, f.FundCode, t.TxnDate, t.TxnType, t.Amount,
                           t.Description, t.PartyName, t.VoucherRef, t.ApprovalStatus
                    FROM {prefix}SocFundTransaction t
                    JOIN {prefix}SocFundMaster f ON t.FundId = f.FundId
                    WHERE t.SocietyId = @sid";
                AddParam(cmd, "@sid", societyId);

                if (fundId.HasValue && fundId.Value > 0)
                {
                    sql += " AND t.FundId = @fid";
                    AddParam(cmd, "@fid", fundId.Value);
                }

                sql += " ORDER BY t.TxnDate DESC, t.TxnId DESC LIMIT 100";
                cmd.CommandText = sql;

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        txnId = Convert.ToInt32(r["TxnId"]),
                        fundId = Convert.ToInt32(r["FundId"]),
                        fundName = r["FundName"]?.ToString() ?? "",
                        fundCode = r["FundCode"]?.ToString() ?? "",
                        txnDate = r["TxnDate"] is DateTime dt ? dt.ToString("yyyy-MM-dd") : "",
                        txnType = r["TxnType"]?.ToString() ?? "",
                        amount = Convert.ToDecimal(r["Amount"]),
                        description = r["Description"]?.ToString() ?? "",
                        partyName = r["PartyName"]?.ToString() ?? "-",
                        voucherRef = r["VoucherRef"]?.ToString() ?? "-",
                        approvalStatus = r["ApprovalStatus"]?.ToString() ?? "Approved"
                    });
                }

                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Fund ledger failed: " + ex.Message });
            }
        }

        [HttpPost("funds/transactions")]
        public IActionResult CreateFundTransaction([FromBody] JsonElement body, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                int fundId = body.TryGetProperty("fundId", out var f) ? f.GetInt32() : 1;
                string txnType = body.TryGetProperty("txnType", out var t) ? t.GetString() ?? "Contribution" : "Contribution";
                decimal amount = body.TryGetProperty("amount", out var a) ? a.GetDecimal() : 0;
                string desc = body.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
                string party = body.TryGetProperty("partyName", out var p) ? p.GetString() ?? "" : "";
                string voucher = body.TryGetProperty("voucherRef", out var v) ? v.GetString() ?? "FND-VOUCHER" : "FND-VOUCHER";

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}SocFundTransaction
                        (SocietyId, FundId, TxnDate, TxnType, Amount, Description, PartyName, VoucherRef, ApprovalStatus)
                    VALUES
                        (@sid, @fid, CURRENT_DATE, @tt, @amt, @desc, @pty, @vref, 'Approved')";
                AddParam(cmd, "@sid", societyId);
                AddParam(cmd, "@fid", fundId);
                AddParam(cmd, "@tt", txnType);
                AddParam(cmd, "@amt", amount);
                AddParam(cmd, "@desc", desc);
                AddParam(cmd, "@pty", party);
                AddParam(cmd, "@vref", voucher);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Fund transaction recorded successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to record fund transaction: " + ex.Message });
            }
        }

        // ── DROPDOWN FILTER HELPERS ───────────────────────────────
        [HttpGet("funds/accounts")]
        public IActionResult GetFundAccountsList([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT AccountId, AccCode, AccName
                    FROM {prefix}SocAccount
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                      AND (
                          GrpMainId = 2
                          OR AccName ILIKE '%Fund%' OR AccName ILIKE '%Reserve%' OR AccName ILIKE '%Capital%'
                          OR AccCode ILIKE '%FND%' OR AccCode ILIKE '%RES%' OR AccCode ILIKE '%307%' OR AccCode ILIKE '%308%' OR AccCode ILIKE '%309%'
                      )
                    ORDER BY AccCode, AccName";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        accountId = Convert.ToInt32(r["AccountId"]),
                        accCode = r["AccCode"]?.ToString() ?? "",
                        accName = r["AccName"]?.ToString() ?? ""
                    });
                }
                return Ok(new { success = true, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("tds/parties")]
        public IActionResult GetTdsPartiesList([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT DISTINCT VendorName AS Name, PANNo, TDSSection
                    FROM {prefix}SocVendor
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                    UNION
                    SELECT DISTINCT Name, PanNo AS PANNo, TdsSection AS TDSSection
                    FROM {prefix}SocTdsDeductee
                    WHERE SocietyId = @sid AND IsActive = TRUE
                    ORDER BY Name";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        name = r["Name"]?.ToString() ?? "",
                        pan = r["PANNo"]?.ToString() ?? "",
                        section = r["TDSSection"]?.ToString() ?? "194C"
                    });
                }
                return Ok(new { success = true, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("gst/parties")]
        public IActionResult GetGstPartiesList([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT MemberId, MemCode, MemName, Wing, FlatNo
                    FROM {prefix}SocMember
                    WHERE SocietyId = @sid AND IsDeleted = FALSE
                    ORDER BY Wing, FlatNo";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    string wing = r["Wing"]?.ToString() ?? "";
                    string flat = r["FlatNo"]?.ToString() ?? "";
                    list.Add(new
                    {
                        memberId = Convert.ToInt32(r["MemberId"]),
                        memberCode = r["MemCode"]?.ToString() ?? "",
                        memberName = r["MemName"]?.ToString() ?? "",
                        flatNo = (!string.IsNullOrWhiteSpace(wing) ? wing + "-" : "") + flat
                    });
                }
                return Ok(new { success = true, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── TDS HELPER ENDPOINTS ──────────────────────────────────
        [HttpGet("tds/deductees")]
        public IActionResult GetTdsDeductees([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT * FROM {prefix}SocTdsDeductee WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY Name";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        deducteeId = Convert.ToInt32(r["DeducteeId"]),
                        name = r["Name"]?.ToString(),
                        partyType = r["PartyType"]?.ToString(),
                        pan = r["PanNo"]?.ToString(),
                        panStatus = r["PanStatus"]?.ToString(),
                        tdsSection = r["TdsSection"]?.ToString(),
                        natureOfPayment = r["NatureOfPayment"]?.ToString(),
                        defaultTdsRate = Convert.ToDecimal(r["DefaultTdsRate"]),
                        mobile = r["Mobile"]?.ToString(),
                        email = r["Email"]?.ToString()
                    });
                }
                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("tds/deductees")]
        public IActionResult CreateTdsDeductee([FromBody] JsonElement body, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                string name = body.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                string partyType = body.TryGetProperty("partyType", out var pt) ? pt.GetString() ?? "Vendor" : "Vendor";
                string pan = body.TryGetProperty("pan", out var p) ? p.GetString() ?? "" : "";
                string section = body.TryGetProperty("tdsSection", out var s) ? s.GetString() ?? "194C" : "194C";
                string nature = body.TryGetProperty("natureOfPayment", out var nat) ? nat.GetString() ?? "Contractor Payment" : "Contractor Payment";
                decimal rate = body.TryGetProperty("defaultTdsRate", out var r) ? r.GetDecimal() : 2.00m;
                string mobile = body.TryGetProperty("mobile", out var m) ? m.GetString() ?? "" : "";
                string email = body.TryGetProperty("email", out var e) ? e.GetString() ?? "" : "";

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}SocTdsDeductee
                        (SocietyId, Name, PartyType, PanNo, TdsSection, NatureOfPayment, DefaultTdsRate, Mobile, Email, IsActive)
                    VALUES
                        (@sid, @name, @pt, @pan, @sec, @nat, @rate, @mob, @em, TRUE)";
                AddParam(cmd, "@sid", societyId);
                AddParam(cmd, "@name", name);
                AddParam(cmd, "@pt", partyType);
                AddParam(cmd, "@pan", pan);
                AddParam(cmd, "@sec", section);
                AddParam(cmd, "@nat", nature);
                AddParam(cmd, "@rate", rate);
                AddParam(cmd, "@mob", mobile);
                AddParam(cmd, "@em", email);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Deductee added successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("tds/rules")]
        public IActionResult GetTdsRules([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT * FROM {prefix}SocTdsRule WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY Section";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        ruleId = Convert.ToInt32(r["RuleId"]),
                        section = r["Section"]?.ToString(),
                        natureOfPayment = r["NatureOfPayment"]?.ToString(),
                        deducteeType = r["DeducteeType"]?.ToString(),
                        rate = Convert.ToDecimal(r["Rate"]),
                        threshold = Convert.ToDecimal(r["Threshold"]),
                        effectiveFrom = r["EffectiveFrom"] is DateTime dt ? dt.ToString("yyyy-MM-dd") : "2024-04-01",
                        applicableAct = r["ApplicableAct"]?.ToString()
                    });
                }
                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("tds/challans")]
        public IActionResult GetTdsChallans([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT c.*,
                           COALESCE((SELECT SUM(TdsAmount) FROM {prefix}SocTdsTransaction t WHERE t.ChallanId = c.ChallanId), 0) AS AllocatedTds
                    FROM {prefix}SocTdsChallan c
                    WHERE c.SocietyId = @sid
                    ORDER BY c.ChallanDate DESC";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    decimal totDep = Convert.ToDecimal(r["TotalDeposited"]);
                    decimal alloc = Convert.ToDecimal(r["AllocatedTds"]);
                    list.Add(new
                    {
                        challanId = Convert.ToInt32(r["ChallanId"]),
                        challanNo = r["ChallanNo"]?.ToString(),
                        bsrCode = r["BsrCode"]?.ToString(),
                        challanDate = r["ChallanDate"] is DateTime cdt ? cdt.ToString("yyyy-MM-dd") : "",
                        paymentDate = r["PaymentDate"] is DateTime pdt ? pdt.ToString("yyyy-MM-dd") : "",
                        tdsAmount = Convert.ToDecimal(r["TdsAmount"]),
                        interest = Convert.ToDecimal(r["Interest"]),
                        fee = Convert.ToDecimal(r["Fee"]),
                        totalDeposited = totDep,
                        allocatedTds = alloc,
                        unallocatedAmount = Math.Max(0, totDep - alloc),
                        quarter = r["Quarter"]?.ToString() ?? "Q1",
                        status = r["Status"]?.ToString() ?? "Matched"
                    });
                }
                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("tds/challans")]
        public IActionResult CreateTdsChallan([FromBody] JsonElement body, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                string chNo = body.TryGetProperty("challanNo", out var c) ? c.GetString() ?? "" : "";
                string bsr = body.TryGetProperty("bsrCode", out var b) ? b.GetString() ?? "0210001" : "0210001";
                string chDate = body.TryGetProperty("challanDate", out var cd) ? cd.GetString() ?? DateTime.Today.ToString("yyyy-MM-dd") : DateTime.Today.ToString("yyyy-MM-dd");
                decimal tds = body.TryGetProperty("tdsAmount", out var t) ? t.GetDecimal() : 0;
                decimal interest = body.TryGetProperty("interest", out var i) ? i.GetDecimal() : 0;
                decimal fee = body.TryGetProperty("fee", out var f) ? f.GetDecimal() : 0;
                decimal total = tds + interest + fee;
                string quarter = body.TryGetProperty("quarter", out var q) ? q.GetString() ?? "Q1" : "Q1";

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}SocTdsChallan
                        (SocietyId, ChallanNo, BsrCode, ChallanDate, PaymentDate, TdsAmount, Interest, Fee, TotalDeposited, FYId, Quarter, Status)
                    VALUES
                        (@sid, @cno, @bsr, @cdt, @pdt, @tds, @int, @fee, @tot, 1, @q, 'Available')
                    RETURNING ChallanId";
                AddParam(cmd, "@sid", societyId);
                AddParam(cmd, "@cno", chNo);
                AddParam(cmd, "@bsr", bsr);
                AddParam(cmd, "@cdt", DateTime.Parse(chDate));
                AddParam(cmd, "@pdt", DateTime.Parse(chDate));
                AddParam(cmd, "@tds", tds);
                AddParam(cmd, "@int", interest);
                AddParam(cmd, "@fee", fee);
                AddParam(cmd, "@tot", total);
                AddParam(cmd, "@q", quarter);

                int newId = Convert.ToInt32(cmd.ExecuteScalar());
                return Ok(new { success = true, challanId = newId, message = "Challan registered successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("tds/allocate-challan")]
        public IActionResult AllocateChallan([FromBody] JsonElement body, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                int challanId = body.TryGetProperty("challanId", out var c) ? c.GetInt32() : 0;
                if (body.TryGetProperty("txnIds", out var txns) && txns.ValueKind == JsonValueKind.Array)
                {
                    foreach (var elem in txns.EnumerateArray())
                    {
                        int txnId = elem.GetInt32();
                        using var cmd = conn.CreateCommand();
                        cmd.CommandText = $@"
                            UPDATE {prefix}SocTdsTransaction
                            SET ChallanId = @cid, Status = 'Deposited', UpdatedAt = NOW()
                            WHERE TdsTxnId = @tid AND SocietyId = @sid";
                        AddParam(cmd, "@cid", challanId);
                        AddParam(cmd, "@tid", txnId);
                        AddParam(cmd, "@sid", societyId);
                        cmd.ExecuteNonQuery();
                    }
                }

                return Ok(new { success = true, message = "TDS transactions mapped to challan successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GST HELPER ENDPOINTS ──────────────────────────────────
        [HttpGet("gst/categories")]
        public IActionResult GetGstCategories([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT * FROM {prefix}SocGstCategory WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY CategoryName";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        categoryId = Convert.ToInt32(r["CategoryId"]),
                        categoryName = r["CategoryName"]?.ToString(),
                        taxability = r["Taxability"]?.ToString(),
                        hsnSac = r["HsnSac"]?.ToString(),
                        cgstRate = Convert.ToDecimal(r["CgstRate"]),
                        sgstRate = Convert.ToDecimal(r["SgstRate"]),
                        igstRate = Convert.ToDecimal(r["IgstRate"]),
                        isRcm = Convert.ToBoolean(r["IsRcm"])
                    });
                }
                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── FUND HELPER ENDPOINTS ─────────────────────────────────
        [HttpGet("funds/master")]
        public IActionResult GetFundMasterList([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT * FROM {prefix}SocFundMaster WHERE SocietyId = @sid AND IsActive = TRUE ORDER BY FundId";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        fundId = Convert.ToInt32(r["FundId"]),
                        fundName = r["FundName"]?.ToString(),
                        fundCode = r["FundCode"]?.ToString(),
                        fundType = r["FundType"]?.ToString(),
                        openingBalance = Convert.ToDecimal(r["OpeningBalance"]),
                        purpose = r["Purpose"]?.ToString(),
                        isRestricted = Convert.ToBoolean(r["IsRestricted"])
                    });
                }
                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("funds/investments")]
        public IActionResult GetFundInvestments([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT i.*, f.FundName, f.FundCode
                    FROM {prefix}SocFundInvestment i
                    JOIN {prefix}SocFundMaster f ON i.FundId = f.FundId
                    WHERE i.SocietyId = @sid
                    ORDER BY i.StartDate DESC";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        investmentId = Convert.ToInt32(r["InvestmentId"]),
                        fundId = Convert.ToInt32(r["FundId"]),
                        fundName = r["FundName"]?.ToString(),
                        fundCode = r["FundCode"]?.ToString(),
                        bankName = r["BankName"]?.ToString(),
                        investmentType = r["InvestmentType"]?.ToString(),
                        investmentNo = r["InvestmentNo"]?.ToString(),
                        principal = Convert.ToDecimal(r["Principal"]),
                        startDate = r["StartDate"] is DateTime sdt ? sdt.ToString("yyyy-MM-dd") : "",
                        maturityDate = r["MaturityDate"] is DateTime mdt ? mdt.ToString("yyyy-MM-dd") : "",
                        interestRate = Convert.ToDecimal(r["InterestRate"]),
                        expectedInterest = Convert.ToDecimal(r["ExpectedInterest"]),
                        actualInterest = Convert.ToDecimal(r["ActualInterest"]),
                        maturityAmount = Convert.ToDecimal(r["MaturityAmount"]),
                        status = r["Status"]?.ToString() ?? "Active"
                    });
                }
                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("funds/investments")]
        public IActionResult CreateFundInvestment([FromBody] JsonElement body, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                int fundId = body.TryGetProperty("fundId", out var f) ? f.GetInt32() : 1;
                string bank = body.TryGetProperty("bankName", out var b) ? b.GetString() ?? "State Co-op Bank" : "State Co-op Bank";
                string invType = body.TryGetProperty("investmentType", out var it) ? it.GetString() ?? "Fixed Deposit" : "Fixed Deposit";
                string invNo = body.TryGetProperty("investmentNo", out var inum) ? inum.GetString() ?? "INV-001" : "INV-001";
                decimal principal = body.TryGetProperty("principal", out var p) ? p.GetDecimal() : 0;
                string start = body.TryGetProperty("startDate", out var s) ? s.GetString() ?? DateTime.Today.ToString("yyyy-MM-dd") : DateTime.Today.ToString("yyyy-MM-dd");
                string mat = body.TryGetProperty("maturityDate", out var m) ? m.GetString() ?? DateTime.Today.AddYears(1).ToString("yyyy-MM-dd") : DateTime.Today.AddYears(1).ToString("yyyy-MM-dd");
                decimal rate = body.TryGetProperty("interestRate", out var r) ? r.GetDecimal() : 6.50m;
                decimal expInt = Math.Round(principal * (rate / 100m), 2);
                decimal matAmt = principal + expInt;

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}SocFundInvestment
                        (SocietyId, FundId, BankName, InvestmentType, InvestmentNo, Principal, StartDate, MaturityDate, InterestRate, ExpectedInterest, MaturityAmount, Status)
                    VALUES
                        (@sid, @fid, @bank, @itype, @ino, @princ, @sdate, @mdate, @rate, @exp, @mat, 'Active')";
                AddParam(cmd, "@sid", societyId);
                AddParam(cmd, "@fid", fundId);
                AddParam(cmd, "@bank", bank);
                AddParam(cmd, "@itype", invType);
                AddParam(cmd, "@ino", invNo);
                AddParam(cmd, "@princ", principal);
                AddParam(cmd, "@sdate", DateTime.Parse(start));
                AddParam(cmd, "@mdate", DateTime.Parse(mat));
                AddParam(cmd, "@rate", rate);
                AddParam(cmd, "@exp", expInt);
                AddParam(cmd, "@mat", matAmt);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Fund Investment registered successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("funds/transfer")]
        public IActionResult TransferFunds([FromBody] JsonElement body, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                int sourceId = body.TryGetProperty("sourceFundId", out var sf) ? sf.GetInt32() : 0;
                int destId = body.TryGetProperty("destFundId", out var df) ? df.GetInt32() : 0;
                decimal amount = body.TryGetProperty("amount", out var a) ? a.GetDecimal() : 0;
                string reason = body.TryGetProperty("reason", out var r) ? r.GetString() ?? "Inter-fund statutory allocation" : "Inter-fund statutory allocation";

                if (sourceId <= 0 || destId <= 0 || amount <= 0 || sourceId == destId)
                    return BadRequest(new { success = false, message = "Invalid source, destination fund or transfer amount." });

                using var tx = conn.BeginTransaction();

                // 1. Debit Source Fund (Transfer Out)
                using (var cmdOut = conn.CreateCommand())
                {
                    cmdOut.Transaction = tx;
                    cmdOut.CommandText = $@"
                        INSERT INTO {prefix}SocFundTransaction
                            (SocietyId, FundId, TxnDate, TxnType, Amount, Description, DestFundId, VoucherRef, ApprovalStatus)
                        VALUES
                            (@sid, @fid, CURRENT_DATE, 'Transfer Out', @amt, @desc, @dest, 'TRANSFER-OUT', 'Approved')";
                    AddParam(cmdOut, "@sid", societyId);
                    AddParam(cmdOut, "@fid", sourceId);
                    AddParam(cmdOut, "@amt", amount);
                    AddParam(cmdOut, "@desc", $"Transferred to Fund #{destId}: {reason}");
                    AddParam(cmdOut, "@dest", destId);
                    cmdOut.ExecuteNonQuery();
                }

                // 2. Credit Destination Fund (Transfer In)
                using (var cmdIn = conn.CreateCommand())
                {
                    cmdIn.Transaction = tx;
                    cmdIn.CommandText = $@"
                        INSERT INTO {prefix}SocFundTransaction
                            (SocietyId, FundId, TxnDate, TxnType, Amount, Description, SourceFundId, VoucherRef, ApprovalStatus)
                        VALUES
                            (@sid, @fid, CURRENT_DATE, 'Transfer In', @amt, @desc, @src, 'TRANSFER-IN', 'Approved')";
                    AddParam(cmdIn, "@sid", societyId);
                    AddParam(cmdIn, "@fid", destId);
                    AddParam(cmdIn, "@amt", amount);
                    AddParam(cmdIn, "@desc", $"Transferred from Fund #{sourceId}: {reason}");
                    AddParam(cmdIn, "@src", sourceId);
                    cmdIn.ExecuteNonQuery();
                }

                tx.Commit();
                return Ok(new { success = true, message = "Inter-fund statutory transfer executed successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Fund transfer failed: " + ex.Message });
            }
        }

        private static dynamic GetSocietyDetails(DbConnection conn, string prefix, int societyId)
        {
            string name = "HENU CO-OP HOUSING SOCIETY LTD.";
            string address = "Plot 12, Sector 19, Seawoods, Navi Mumbai";
            string pan = "AAACH1234F";
            string tan = "MUMH01234F";
            string gstin = "27AAACH1234F1Z5";
            string state = "Maharashtra";
            string pincode = "400706";

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT SocietyName, Address, PANNumber, TAN, GSTNumber, City, Pincode
                    FROM {prefix}SocietyInfo
                    WHERE SocietyId = @sid OR (@sid <= 0 AND IsActive = TRUE)
                    LIMIT 1";
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    if (r["SocietyName"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["SocietyName"]?.ToString()))
                        name = r["SocietyName"]?.ToString() ?? name;
                    if (r["Address"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["Address"]?.ToString()))
                        address = r["Address"]?.ToString() ?? address;
                    if (r["PANNumber"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["PANNumber"]?.ToString()))
                        pan = r["PANNumber"]?.ToString() ?? pan;
                    if (r["TAN"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["TAN"]?.ToString()))
                        tan = r["TAN"]?.ToString() ?? tan;
                    if (r["GSTNumber"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["GSTNumber"]?.ToString()))
                        gstin = r["GSTNumber"]?.ToString() ?? gstin;
                    if (r["Pincode"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["Pincode"]?.ToString()))
                        pincode = r["Pincode"]?.ToString() ?? pincode;
                    var city = r["City"]?.ToString() ?? "";
                    if (!string.IsNullOrWhiteSpace(city) && !address.Contains(city))
                        address += (address.Length > 0 ? ", " : "") + city;
                }
            }
            catch { }

            return new
            {
                societyName = name,
                address = address,
                pan = pan,
                tan = tan,
                gstin = gstin,
                state = state,
                pincode = pincode,
                financialYear = "2026-2027"
            };
        }
    }
}
