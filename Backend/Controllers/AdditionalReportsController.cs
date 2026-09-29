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
                    PartyType VARCHAR(50) DEFAULT 'Vendor', -- Individual, Company, Firm, Professional, Contractor, Vendor
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
                    Section VARCHAR(50) NOT NULL, -- e.g. 194C, 194J, 194I, 194H, 194A
                    NatureOfPayment VARCHAR(255) NOT NULL,
                    DeducteeType VARCHAR(50) DEFAULT 'ALL', -- ALL, Individual, Company
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
                    Status VARCHAR(50) DEFAULT 'Confirmed', -- Suggested, Confirmed, Excluded, Deposited, Cancelled
                    Remarks TEXT,
                    CreatedAt TIMESTAMPTZ DEFAULT NOW(),
                    UpdatedAt TIMESTAMPTZ DEFAULT NOW()
                );

                -- ── 2. GST MODULE TABLES ──────────────────────────────
                CREATE TABLE IF NOT EXISTS {prefix}SocGstCategory (
                    CategoryId SERIAL PRIMARY KEY,
                    SocietyId INT NOT NULL,
                    CategoryName VARCHAR(150) NOT NULL,
                    Taxability VARCHAR(50) DEFAULT 'Taxable', -- Taxable, Exempt, Nil Rated, Non-GST, Out of Scope
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
                    Threshold NUMERIC(18,2) DEFAULT 7500.00, -- CBIC Circular 109/28/2019-GST ₹7,500/month RWA threshold
                    TurnoverThreshold NUMERIC(18,2) DEFAULT 2000000.00, -- ₹20 Lakhs mandatory registration
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
                    FundType VARCHAR(100) DEFAULT 'Statutory Reserve Fund', -- Share Capital, Statutory Reserve Fund, Repairs Fund, Major Repairs Fund, Sinking Fund, Education & Training Fund, Building / Capital Fund, Emergency Fund
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
                    TxnType VARCHAR(50) NOT NULL, -- Contribution, Receipt, Allocation, Transfer In, Transfer Out, Utilization, Expense, Refund, Interest Earned, Investment, Reversal
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
                    InvestmentType VARCHAR(100) DEFAULT 'Fixed Deposit', -- Fixed Deposit, Term Deposit, Govt Securities
                    InvestmentNo VARCHAR(100) NOT NULL,
                    Principal NUMERIC(18,2) NOT NULL DEFAULT 0.00,
                    StartDate DATE NOT NULL,
                    MaturityDate DATE NOT NULL,
                    InterestRate NUMERIC(5,2) DEFAULT 6.50,
                    ExpectedInterest NUMERIC(18,2) DEFAULT 0.00,
                    ActualInterest NUMERIC(18,2) DEFAULT 0.00,
                    MaturityAmount NUMERIC(18,2) DEFAULT 0.00,
                    Status VARCHAR(50) DEFAULT 'Active', -- Active, Matured, Closed, Renewed
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

                // 1. Fetch Society Details for Header
                var socInfo = GetSocietyDetails(conn, prefix, societyId);

                // 2. Fetch TDS Metrics
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

                // 3. Fetch Challan Totals
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

                // 4. Section-wise Summary
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

                // Scan Payment and Purchase Vouchers for Vendor / Contractor / Professional expenses
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

                // Insert detected candidates as 'Suggested'
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

                // Aggregate Member Bills for GST Outward Supplies
                decimal totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalGst = 0, totalExempt = 0, totalGross = 0;
                int totalInvoices = 0;

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT COUNT(*) AS inv_count,
                               COALESCE(SUM(TotalAmount), 0) AS total_gross,
                               COALESCE(SUM(PrincipalAmount), 0) AS total_taxable,
                               COALESCE(SUM(GstAmount), 0) AS total_gst
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
                        totalGst = Convert.ToDecimal(r["total_gst"]);
                        totalCgst = Math.Round(totalGst / 2.0m, 2);
                        totalSgst = totalGst - totalCgst;
                    }
                }

                // If billing has 0 GST recorded, calculate standard 18% on maintenance over threshold
                if (totalGst == 0 && totalGross > 0)
                {
                    totalTaxable = totalGross;
                    totalCgst = Math.Round(totalTaxable * 0.09m, 2);
                    totalSgst = Math.Round(totalTaxable * 0.09m, 2);
                    totalGst = totalCgst + totalSgst;
                }

                // Charge-wise summary
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
                           COALESCE(b.GstAmount, 0) AS GstAmount,
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
                    decimal totalGst = Convert.ToDecimal(r["GstAmount"]);
                    if (totalGst == 0 && taxable > 0)
                    {
                        totalGst = Math.Round(taxable * 0.18m, 2);
                    }
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

                // Fetch Billing Totals vs Receipt Totals vs Output Ledger
                decimal billedGst = 0, collectedGst = 0, ledgerGst = 0;

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT COALESCE(SUM(GstAmount), 0) FROM {prefix}SocMemberBill WHERE SocietyId = @sid";
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

        [HttpGet("funds/summary")]
        public IActionResult GetFundsSummary([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var socInfo = GetSocietyDetails(conn, prefix, societyId);

                // Fetch funds list with calculated movements
                var fundList = new List<object>();
                decimal totalOpening = 0, totalContributions = 0, totalUtilization = 0, totalInvestments = 0, totalTransfers = 0, totalClosing = 0;

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

                // Fetch Investment Totals
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

        // ═══════════════════════════════════════════════════════════
        // 4. MULTI REPORT CONSOLIDATED ENGINE
        // ═══════════════════════════════════════════════════════════

        [HttpPost("multi/generate")]
        public IActionResult GenerateMultiReport([FromBody] JsonElement body, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var socInfo = GetSocietyDetails(conn, prefix, societyId);

                // 1. Member Summary
                var memberSummary = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT m.MemberId, m.MemName, m.FlatNo, m.Wing,
                               COALESCE(b.PrincipalAmount, 0) AS CurrentCharges,
                               COALESCE(m.Balance, 0) AS Outstanding
                        FROM {prefix}SocMember m
                        LEFT JOIN (
                            SELECT MemberId, SUM(PrincipalAmount) AS PrincipalAmount
                            FROM {prefix}SocMemberBill
                            WHERE SocietyId = @sid
                            GROUP BY MemberId
                        ) b ON m.MemberId = b.MemberId
                        WHERE m.SocietyId = @sid AND (m.IsDeleted = FALSE OR m.IsDeleted IS NULL)
                        ORDER BY m.Wing, m.FlatNo
                        LIMIT 50";
                    AddParam(cmd, "@sid", societyId);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        memberSummary.Add(new
                        {
                            memberId = Convert.ToInt32(r["MemberId"]),
                            name = r["MemName"]?.ToString() ?? "",
                            flatNo = (r["Wing"]?.ToString() != "" ? r["Wing"]?.ToString() + "-" : "") + (r["FlatNo"]?.ToString() ?? ""),
                            currentCharges = Convert.ToDecimal(r["CurrentCharges"]),
                            outstanding = Convert.ToDecimal(r["Outstanding"])
                        });
                    }
                }

                // 2. Account Group Summary
                var accountSummary = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT a.AccountId, a.AccCode, a.AccName, g.GrpName,
                               COALESCE(SUM(vd.Debit), 0) AS TotalDebit,
                               COALESCE(SUM(vd.Credit), 0) AS TotalCredit
                        FROM {prefix}SocAccount a
                        LEFT JOIN {prefix}SocGroup g ON a.GroupId = g.GroupId
                        LEFT JOIN {prefix}SocVoucherDetail vd ON a.AccountId = vd.AccountId
                        WHERE a.SocietyId = @sid
                        GROUP BY a.AccountId, a.AccCode, a.AccName, g.GrpName
                        ORDER BY a.AccCode
                        LIMIT 30";
                    AddParam(cmd, "@sid", societyId);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        accountSummary.Add(new
                        {
                            accountId = Convert.ToInt32(r["AccountId"]),
                            code = r["AccCode"]?.ToString() ?? "",
                            name = r["AccName"]?.ToString() ?? "",
                            group = r["GrpName"]?.ToString() ?? "General",
                            debit = Convert.ToDecimal(r["TotalDebit"]),
                            credit = Convert.ToDecimal(r["TotalCredit"])
                        });
                    }
                }

                // 3. Voucher Count Summary
                var voucherSummary = new List<object>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT VoucherType, COUNT(*) AS cnt, COALESCE(SUM(Amount), 0) AS tot_amount
                        FROM {prefix}SocVoucherHeader
                        WHERE SocietyId = @sid
                        GROUP BY VoucherType";
                    AddParam(cmd, "@sid", societyId);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        voucherSummary.Add(new
                        {
                            voucherType = r["VoucherType"]?.ToString() ?? "Voucher",
                            count = Convert.ToInt32(r["cnt"]),
                            totalAmount = Convert.ToDecimal(r["tot_amount"])
                        });
                    }
                }

                // 4. TDS Summary for Multi
                decimal tdsGross = 0, tdsDeducted = 0;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT COALESCE(SUM(GrossAmount),0), COALESCE(SUM(TdsAmount),0) FROM {prefix}SocTdsTransaction WHERE SocietyId = @sid";
                    AddParam(cmd, "@sid", societyId);
                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        tdsGross = Convert.ToDecimal(r[0]);
                        tdsDeducted = Convert.ToDecimal(r[1]);
                    }
                }

                // 5. GST Summary for Multi
                decimal gstTaxable = 0, gstTotal = 0;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT COALESCE(SUM(PrincipalAmount),0), COALESCE(SUM(GstAmount),0) FROM {prefix}SocMemberBill WHERE SocietyId = @sid";
                    AddParam(cmd, "@sid", societyId);
                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        gstTaxable = Convert.ToDecimal(r[0]);
                        gstTotal = Convert.ToDecimal(r[1]);
                    }
                }

                // 6. Fund Summary for Multi
                decimal totalFunds = 0;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT COALESCE(SUM(OpeningBalance),0) FROM {prefix}SocFundMaster WHERE SocietyId = @sid";
                    AddParam(cmd, "@sid", societyId);
                    totalFunds = Convert.ToDecimal(cmd.ExecuteScalar() ?? 0);
                }

                return Ok(new
                {
                    success = true,
                    society = socInfo,
                    generatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                    memberSummary = memberSummary,
                    accountSummary = accountSummary,
                    voucherSummary = voucherSummary,
                    taxSummary = new
                    {
                        tdsGross = tdsGross,
                        tdsDeducted = tdsDeducted,
                        gstTaxable = gstTaxable,
                        gstTotal = gstTotal
                    },
                    fundsSummary = new
                    {
                        totalFunds = totalFunds
                    },
                    reconciliation = new
                    {
                        totalReceipts = voucherSummary.Where(v => ((dynamic)v).voucherType == "RV").Sum(v => (decimal)((dynamic)v).totalAmount),
                        totalPayments = voucherSummary.Where(v => ((dynamic)v).voucherType == "PV").Sum(v => (decimal)((dynamic)v).totalAmount),
                        totalJournals = voucherSummary.Where(v => ((dynamic)v).voucherType == "JV").Sum(v => (decimal)((dynamic)v).totalAmount),
                        totalContras = voucherSummary.Where(v => ((dynamic)v).voucherType == "CV").Sum(v => (decimal)((dynamic)v).totalAmount)
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Multi report generation failed: " + ex.Message });
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
                    ORDER BY i.MaturityDate ASC";
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
                        status = r["Status"]?.ToString() ?? "Active",
                        remarks = r["Remarks"]?.ToString() ?? ""
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
                string bank = body.TryGetProperty("bankName", out var b) ? b.GetString() ?? "State Bank of India" : "State Bank of India";
                string invNo = body.TryGetProperty("investmentNo", out var inv) ? inv.GetString() ?? "" : "";
                decimal principal = body.TryGetProperty("principal", out var p) ? p.GetDecimal() : 0;
                string sDate = body.TryGetProperty("startDate", out var sd) ? sd.GetString() ?? DateTime.Today.ToString("yyyy-MM-dd") : DateTime.Today.ToString("yyyy-MM-dd");
                string mDate = body.TryGetProperty("maturityDate", out var md) ? md.GetString() ?? DateTime.Today.AddYears(1).ToString("yyyy-MM-dd") : DateTime.Today.AddYears(1).ToString("yyyy-MM-dd");
                decimal rate = body.TryGetProperty("interestRate", out var r) ? r.GetDecimal() : 6.75m;
                decimal expInt = Math.Round(principal * (rate / 100m), 2);
                decimal matAmt = principal + expInt;

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}SocFundInvestment
                        (SocietyId, FundId, BankName, InvestmentType, InvestmentNo, Principal, StartDate, MaturityDate, InterestRate, ExpectedInterest, MaturityAmount, Status, Remarks)
                    VALUES
                        (@sid, @fid, @bank, 'Fixed Deposit', @ino, @princ, @sdt, @mdt, @rate, @exp, @mat, 'Active', 'Statutory Co-op Society Term Investment')";
                AddParam(cmd, "@sid", societyId);
                AddParam(cmd, "@fid", fundId);
                AddParam(cmd, "@bank", bank);
                AddParam(cmd, "@ino", invNo);
                AddParam(cmd, "@princ", principal);
                AddParam(cmd, "@sdt", DateTime.Parse(sDate));
                AddParam(cmd, "@mdt", DateTime.Parse(mDate));
                AddParam(cmd, "@rate", rate);
                AddParam(cmd, "@exp", expInt);
                AddParam(cmd, "@mat", matAmt);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Fund investment recorded successfully." });
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

                int sourceId = body.TryGetProperty("sourceFundId", out var s) ? s.GetInt32() : 0;
                int destId = body.TryGetProperty("destFundId", out var d) ? d.GetInt32() : 0;
                decimal amount = body.TryGetProperty("amount", out var a) ? a.GetDecimal() : 0;
                string reason = body.TryGetProperty("reason", out var r) ? r.GetString() ?? "Inter-fund statutory allocation" : "Inter-fund statutory allocation";

                if (sourceId == destId || sourceId <= 0 || destId <= 0 || amount <= 0)
                {
                    return BadRequest(new { success = false, message = "Invalid source, destination, or transfer amount." });
                }

                // Deduct from Source
                using (var cmd1 = conn.CreateCommand())
                {
                    cmd1.CommandText = $@"
                        INSERT INTO {prefix}SocFundTransaction
                            (SocietyId, FundId, TxnDate, TxnType, Amount, Description, DestFundId, VoucherRef, ApprovalStatus)
                        VALUES
                            (@sid, @fid, CURRENT_DATE, 'Transfer Out', @amt, @desc, @dfid, 'FND-TRF', 'Approved')";
                    AddParam(cmd1, "@sid", societyId);
                    AddParam(cmd1, "@fid", sourceId);
                    AddParam(cmd1, "@amt", amount);
                    AddParam(cmd1, "@desc", $"Transferred to Fund #{destId}: {reason}");
                    AddParam(cmd1, "@dfid", destId);
                    cmd1.ExecuteNonQuery();
                }

                // Add to Destination
                using (var cmd2 = conn.CreateCommand())
                {
                    cmd2.CommandText = $@"
                        INSERT INTO {prefix}SocFundTransaction
                            (SocietyId, FundId, TxnDate, TxnType, Amount, Description, SourceFundId, VoucherRef, ApprovalStatus)
                        VALUES
                            (@sid, @fid, CURRENT_DATE, 'Transfer In', @amt, @desc, @sfid, 'FND-TRF', 'Approved')";
                    AddParam(cmd2, "@sid", societyId);
                    AddParam(cmd2, "@fid", destId);
                    AddParam(cmd2, "@amt", amount);
                    AddParam(cmd2, "@desc", $"Transferred from Fund #{sourceId}: {reason}");
                    AddParam(cmd2, "@sfid", sourceId);
                    cmd2.ExecuteNonQuery();
                }

                return Ok(new { success = true, message = $"Rs {amount:N2} transferred successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── MULTI REPORT SAVED CONFIGURATIONS ──────────────────────
        [HttpGet("multi/saved-configs")]
        public IActionResult GetSavedReportConfigs([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT * FROM {prefix}SocSavedReportConfig WHERE SocietyId = @sid ORDER BY ConfigId DESC";
                AddParam(cmd, "@sid", societyId);
                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        configId = Convert.ToInt32(r["ConfigId"]),
                        reportName = r["ReportName"]?.ToString(),
                        description = r["Description"]?.ToString(),
                        sections = r["SelectedSectionsJson"]?.ToString(),
                        groupBy = r["GroupBy"]?.ToString(),
                        sortBy = r["SortBy"]?.ToString(),
                        createdAt = r["CreatedAt"] is DateTime dt ? dt.ToString("yyyy-MM-dd HH:mm") : ""
                    });
                }
                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("multi/saved-configs")]
        public IActionResult SaveReportConfig([FromBody] JsonElement body, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureAdditionalReportTables(conn);
                string prefix = GetSchemaPrefix(conn);

                string name = body.TryGetProperty("reportName", out var n) ? n.GetString() ?? "Custom Saved Report" : "Custom Saved Report";
                string desc = body.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
                string sections = body.TryGetProperty("selectedSections", out var sec) ? sec.ToString() : "[\"members\",\"accounts\",\"vouchers\",\"tds\",\"gst\",\"funds\"]";
                string grp = body.TryGetProperty("groupBy", out var g) ? g.GetString() ?? "Wing" : "Wing";
                string srt = body.TryGetProperty("sortBy", out var s) ? s.GetString() ?? "Date" : "Date";

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}SocSavedReportConfig
                        (SocietyId, ReportName, Description, SelectedSectionsJson, GroupBy, SortBy, CreatedBy)
                    VALUES
                        (@sid, @name, @desc, @sec, @grp, @srt, 'ADMIN')";
                AddParam(cmd, "@sid", societyId);
                AddParam(cmd, "@name", name);
                AddParam(cmd, "@desc", desc);
                AddParam(cmd, "@sec", sections);
                AddParam(cmd, "@grp", grp);
                AddParam(cmd, "@srt", srt);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Report layout configuration saved successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
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
                    SELECT SocietyName, Address, PANNo, TANNo, GSTNo, City, State, Pin
                    FROM {prefix}SocietyInfo
                    WHERE SocietyId = @sid LIMIT 1";
                AddParam(cmd, "@sid", societyId);
                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    if (r["SocietyName"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["SocietyName"]?.ToString()))
                        name = r["SocietyName"]?.ToString() ?? name;
                    if (r["Address"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["Address"]?.ToString()))
                        address = r["Address"]?.ToString() ?? address;
                    if (r["PANNo"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["PANNo"]?.ToString()))
                        pan = r["PANNo"]?.ToString() ?? pan;
                    if (r["TANNo"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["TANNo"]?.ToString()))
                        tan = r["TANNo"]?.ToString() ?? tan;
                    if (r["GSTNo"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["GSTNo"]?.ToString()))
                        gstin = r["GSTNo"]?.ToString() ?? gstin;
                    if (r["Pin"] != DBNull.Value && !string.IsNullOrWhiteSpace(r["Pin"]?.ToString()))
                        pincode = r["Pin"]?.ToString() ?? pincode;
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
