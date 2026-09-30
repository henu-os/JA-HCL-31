// ═══════════════════════════════════════════════════════════
// HENU ERP v2 — MultiReportController.cs
// Multi-Report Pack Builder, Index Calculation, Reordering,
// Template Management & Report Package Orchestration Engine
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Data.Common;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/multi-report")]
    [AllowAnonymous]
    public class MultiReportController : ControllerBase
    {
        private static readonly string SettingsFilePath = Path.Combine(AppContext.BaseDirectory, "multi_report_settings.json");
        private static readonly string TemplatesDirPath = Path.Combine(AppContext.BaseDirectory, "uploads", "templates");

        private static void AddParam(DbCommand cmd, string name, object? value)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        public class ReportRegistryItem
        {
            public string Id { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string Category { get; set; } = string.Empty;
            public string Subgroup { get; set; } = string.Empty;
            public int Order { get; set; }
            public bool Enabled { get; set; } = true;
            public bool SupportsEdit { get; set; } = true;
            public List<string> Formats { get; set; } = new List<string> { "pdf", "xlsx" };
            public List<string> RequiredFilters { get; set; } = new List<string> { "fy", "fromDate", "toDate" };
            public Dictionary<string, object> Settings { get; set; } = new Dictionary<string, object>();
            public List<string> Aliases { get; set; } = new List<string>();
        }

        public class MultiReportSettingsModel
        {
            public int SocietyId { get; set; } = 1;
            public string FinancialYear { get; set; } = "2026-2027";
            public string FromDate { get; set; } = "2026-04-01";
            public string ToDate { get; set; } = "2027-03-31";
            public string? PdfTemplatePath { get; set; }
            public string? PdfTemplateName { get; set; }
            public string? ExcelTemplatePath { get; set; }
            public string? ExcelTemplateName { get; set; }
            public List<ReportRegistryItem> Reports { get; set; } = new List<ReportRegistryItem>();
            public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        }

        private static readonly List<ReportRegistryItem> DefaultRegistry = new List<ReportRegistryItem>
        {
            // ── MEMBER REPORTS ──────────────────────────────────────────
            new ReportRegistryItem { Id = "member_bill_format", Name = "Bill Format", Category = "Member Reports", Subgroup = "Member Reports", Order = 1, Enabled = true },
            new ReportRegistryItem { Id = "member_receipt", Name = "Receipt", Category = "Member Reports", Subgroup = "Member Reports", Order = 2, Enabled = true },
            new ReportRegistryItem { Id = "member_debit_note", Name = "Debit Note", Category = "Member Reports", Subgroup = "Member Reports", Order = 3, Enabled = true },
            new ReportRegistryItem { Id = "member_credit_note", Name = "Credit Note", Category = "Member Reports", Subgroup = "Member Reports", Order = 4, Enabled = true },
            new ReportRegistryItem { Id = "member_adjustment", Name = "Adjustment", Category = "Member Reports", Subgroup = "Member Reports", Order = 5, Enabled = true },
            new ReportRegistryItem { Id = "member_outstanding", Name = "Outstanding List", Category = "Member Reports", Subgroup = "Member Reports", Order = 6, Enabled = true },
            
            // Member Ledger Subgroup
            new ReportRegistryItem { Id = "member_account_headwise", Name = "Member Account | Head wise", Category = "Member Reports", Subgroup = "Member Ledger", Order = 7, Enabled = true },
            new ReportRegistryItem { Id = "member_register_drcr", Name = "Member Register [Dr/Cr]", Category = "Member Reports", Subgroup = "Member Ledger", Order = 8, Enabled = true },
            new ReportRegistryItem { Id = "member_control_account", Name = "Member Control Account", Category = "Member Reports", Subgroup = "Member Ledger", Order = 9, Enabled = true },
            new ReportRegistryItem { Id = "balance_confirmation", Name = "Balance Confirmation Letter", Category = "Member Reports", Subgroup = "Member Ledger", Order = 10, Enabled = true },
            
            // Bill Register Subgroup
            new ReportRegistryItem { Id = "member_bill_register", Name = "Bill Register", Category = "Member Reports", Subgroup = "Bill Register", Order = 11, Enabled = true },
            new ReportRegistryItem { Id = "member_receipt_register", Name = "Receipt Register", Category = "Member Reports", Subgroup = "Bill Register", Order = 12, Enabled = true },
            
            // Note Register Subgroup
            new ReportRegistryItem { Id = "debit_note_register", Name = "Debit Note Register", Category = "Member Reports", Subgroup = "Note Register", Order = 13, Enabled = true },
            new ReportRegistryItem { Id = "credit_note_register", Name = "Credit Note Register", Category = "Member Reports", Subgroup = "Note Register", Order = 14, Enabled = true },
            new ReportRegistryItem { Id = "adjustment_register", Name = "Adjustment Register", Category = "Member Reports", Subgroup = "Note Register", Order = 15, Enabled = true },
            new ReportRegistryItem { Id = "member_jv_register", Name = "Member JV Register", Category = "Member Reports", Subgroup = "Note Register", Order = 16, Enabled = true },

            // ── ACCOUNT REPORTS ─────────────────────────────────────────
            new ReportRegistryItem { Id = "cash_bank_book", Name = "Cash/Bank Book", Category = "Account Reports", Subgroup = "Account Reports", Order = 17, Enabled = true },
            new ReportRegistryItem { Id = "account_ledger", Name = "Account Ledger", Category = "Account Reports", Subgroup = "Account Reports", Order = 18, Enabled = true },
            new ReportRegistryItem { Id = "receipt_payment", Name = "Receipt & Payment Report", Category = "Account Reports", Subgroup = "Account Reports", Order = 19, Enabled = true, Aliases = new List<string> { "Receipt Payment Report" } },
            new ReportRegistryItem { Id = "trial_balance", Name = "Trial Balance", Category = "Account Reports", Subgroup = "Account Reports", Order = 20, Enabled = true },
            new ReportRegistryItem { Id = "income_expenditure", Name = "Income & Expenditure", Category = "Account Reports", Subgroup = "Account Reports", Order = 21, Enabled = true },
            new ReportRegistryItem { Id = "balance_sheet", Name = "Balance Sheet", Category = "Account Reports", Subgroup = "Account Reports", Order = 22, Enabled = true },
            new ReportRegistryItem { Id = "dues_advance_ledger", Name = "Dues/Advance Ledger", Category = "Account Reports", Subgroup = "Account Reports", Order = 23, Enabled = true },
            new ReportRegistryItem { Id = "account_receipt_register", Name = "Receipt Register", Category = "Account Reports", Subgroup = "Account Reports", Order = 24, Enabled = true },
            new ReportRegistryItem { Id = "payment_register", Name = "Payment Register", Category = "Account Reports", Subgroup = "Account Reports", Order = 25, Enabled = true },
            new ReportRegistryItem { Id = "contra_register", Name = "Contra Register", Category = "Account Reports", Subgroup = "Account Reports", Order = 26, Enabled = true },
            new ReportRegistryItem { Id = "journal_register", Name = "Journal Register", Category = "Account Reports", Subgroup = "Account Reports", Order = 27, Enabled = true },
            new ReportRegistryItem { Id = "monthly_report", Name = "Monthly Report", Category = "Account Reports", Subgroup = "Account Reports", Order = 28, Enabled = true },

            // ── ADDITIONAL REPORTS ──────────────────────────────────────
            new ReportRegistryItem { Id = "tds_report", Name = "TDS Report", Category = "Additional Reports", Subgroup = "Additional Reports", Order = 29, Enabled = true },
            new ReportRegistryItem { Id = "gst_report", Name = "GST Report", Category = "Additional Reports", Subgroup = "Additional Reports", Order = 30, Enabled = true },
            new ReportRegistryItem { Id = "fund_reports", Name = "Fund Reports", Category = "Additional Reports", Subgroup = "Additional Reports", Order = 31, Enabled = true }
        };

        // ── GET /api/multi-report/registry ──────────────────────────
        [HttpGet("registry")]
        public IActionResult GetRegistry()
        {
            return Ok(new
            {
                success = true,
                totalReports = DefaultRegistry.Count,
                reports = DefaultRegistry
            });
        }

        // ── GET /api/multi-report/settings ──────────────────────────
        [HttpGet("settings")]
        public IActionResult GetSettings([FromQuery] int societyId = 1)
        {
            try
            {
                EnsureSettingsTableCreated();

                using var conn = (DbConnection)DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT SettingsJson, UpdatedAt FROM jeevika_erp.SocMultiReportSetting WHERE SocietyId = @socId LIMIT 1";
                AddParam(cmd, "@socId", societyId);

                using var reader = cmd.ExecuteReader();
                if (reader.Read())
                {
                    var json = reader["SettingsJson"]?.ToString();
                    if (!string.IsNullOrEmpty(json))
                    {
                        var settings = JsonSerializer.Deserialize<MultiReportSettingsModel>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                        if (settings != null)
                        {
                            MergeMissingReports(settings);
                            return Ok(new { success = true, settings });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MultiReport] Database settings load failed: {ex.Message}. Falling back to file/memory.");
            }

            if (System.IO.File.Exists(SettingsFilePath))
            {
                try
                {
                    var fileJson = System.IO.File.ReadAllText(SettingsFilePath);
                    var settings = JsonSerializer.Deserialize<MultiReportSettingsModel>(fileJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (settings != null)
                    {
                        MergeMissingReports(settings);
                        return Ok(new { success = true, settings });
                    }
                }
                catch { }
            }

            var defaultSettings = new MultiReportSettingsModel
            {
                SocietyId = societyId,
                FinancialYear = "2026-2027",
                FromDate = "2026-04-01",
                ToDate = "2027-03-31",
                Reports = DefaultRegistry.Select(r => new ReportRegistryItem
                {
                    Id = r.Id,
                    Name = r.Name,
                    Category = r.Category,
                    Subgroup = r.Subgroup,
                    Order = r.Order,
                    Enabled = r.Enabled,
                    SupportsEdit = r.SupportsEdit,
                    Formats = r.Formats,
                    RequiredFilters = r.RequiredFilters
                }).ToList()
            };

            return Ok(new { success = true, settings = defaultSettings });
        }

        // ── POST /api/multi-report/settings ─────────────────────────
        [HttpPost("settings")]
        public IActionResult SaveSettings([FromBody] MultiReportSettingsModel model)
        {
            if (model == null || model.Reports == null || model.Reports.Count == 0)
                return BadRequest(new { success = false, message = "Invalid settings data provided." });

            try
            {
                model.UpdatedAt = DateTime.UtcNow;
                var json = JsonSerializer.Serialize(model, new JsonSerializerOptions { WriteIndented = true });

                try
                {
                    System.IO.File.WriteAllText(SettingsFilePath, json);
                }
                catch (Exception fEx)
                {
                    Console.WriteLine($"[MultiReport] File save warning: {fEx.Message}");
                }

                EnsureSettingsTableCreated();
                using var conn = (DbConnection)DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO jeevika_erp.SocMultiReportSetting (SocietyId, SettingsJson, UpdatedAt)
                    VALUES (@socId, @json, @updatedAt)
                    ON CONFLICT (SocietyId) DO UPDATE
                    SET SettingsJson = EXCLUDED.SettingsJson, UpdatedAt = EXCLUDED.UpdatedAt;
                ";
                AddParam(cmd, "@socId", model.SocietyId);
                AddParam(cmd, "@json", json);
                AddParam(cmd, "@updatedAt", model.UpdatedAt);
                cmd.ExecuteNonQuery();

                return Ok(new
                {
                    success = true,
                    message = "Multi Report layout, order, and configuration saved successfully.",
                    updatedAt = model.UpdatedAt
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Failed to save settings: {ex.Message}" });
            }
        }

        // ── POST /api/multi-report/upload-template ───────────────────
        [HttpPost("upload-template")]
        public async Task<IActionResult> UploadTemplate([FromForm] IFormFile file, [FromForm] string type)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { success = false, message = "No file uploaded." });

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (type == "pdf" && ext != ".pdf")
                return BadRequest(new { success = false, message = "Invalid file format. Only .pdf files are supported for PDF index templates." });

            if (type == "excel" && ext != ".xlsx")
                return BadRequest(new { success = false, message = "Invalid file format. Only .xlsx workbooks are supported for Excel index templates." });

            try
            {
                if (!Directory.Exists(TemplatesDirPath))
                    Directory.CreateDirectory(TemplatesDirPath);

                var safeFileName = $"index_template_{type}_{DateTime.UtcNow.Ticks}{ext}";
                var targetPath = Path.Combine(TemplatesDirPath, safeFileName);

                using (var stream = new FileStream(targetPath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                return Ok(new
                {
                    success = true,
                    message = $"{type.ToUpper()} template uploaded successfully.",
                    filePath = targetPath,
                    fileName = file.FileName,
                    fileSize = file.Length,
                    uploadedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Upload failed: {ex.Message}" });
            }
        }

        // ── POST /api/multi-report/generate-pack ─────────────────────
        [HttpPost("generate-pack")]
        public IActionResult GeneratePack([FromBody] MultiReportSettingsModel request)
        {
            if (request == null)
                return BadRequest(new { success = false, message = "Request payload is required." });

            try
            {
                var enabledReports = (request.Reports ?? new List<ReportRegistryItem>())
                    .Where(r => r.Enabled)
                    .OrderBy(r => r.Order)
                    .ToList();

                if (enabledReports.Count == 0)
                    return BadRequest(new { success = false, message = "No reports are enabled in the Multi Report configuration." });

                using var conn = (DbConnection)DbHelper.GetConn();

                var soc = FetchSocietyDetails(conn, request.SocietyId);

                var assembledSections = new List<object>();
                var indexItems = new List<object>();
                int currentPage = 1;

                int indexPageCount = 1;
                currentPage += indexPageCount;

                for (int i = 0; i < enabledReports.Count; i++)
                {
                    var r = enabledReports[i];
                    int estimatedPages = 1;

                    int pageFrom = currentPage;
                    int pageTo = pageFrom + estimatedPages - 1;
                    currentPage = pageTo + 1;

                    indexItems.Add(new
                    {
                        srNo = i + 1,
                        reportId = r.Id,
                        reportName = r.Name,
                        category = r.Category,
                        subgroup = r.Subgroup,
                        pageFrom = pageFrom,
                        pageTo = pageTo,
                        status = "Included"
                    });

                    assembledSections.Add(new
                    {
                        srNo = i + 1,
                        reportId = r.Id,
                        reportName = r.Name,
                        category = r.Category,
                        subgroup = r.Subgroup,
                        pageFrom = pageFrom,
                        pageTo = pageTo,
                        sheetName = SanitizeWorksheetName($"{(i + 1):D2} - {r.Name}")
                    });
                }

                return Ok(new
                {
                    success = true,
                    society = soc,
                    financialYear = request.FinancialYear,
                    fromDate = request.FromDate,
                    toDate = request.ToDate,
                    totalReports = enabledReports.Count,
                    totalPages = currentPage - 1,
                    index = indexItems,
                    sections = assembledSections,
                    pdfTemplate = request.PdfTemplateName,
                    excelTemplate = request.ExcelTemplateName,
                    generatedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Multi Report pack generation failed: {ex.Message}" });
            }
        }

        private static void EnsureSettingsTableCreated()
        {
            try
            {
                using var conn = (DbConnection)DbHelper.GetConn();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    CREATE TABLE IF NOT EXISTS jeevika_erp.SocMultiReportSetting (
                        SocietyId INT PRIMARY KEY,
                        SettingsJson TEXT NOT NULL,
                        UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                ";
                cmd.ExecuteNonQuery();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MultiReport] Table init warning: {ex.Message}");
            }
        }

        private static void MergeMissingReports(MultiReportSettingsModel settings)
        {
            var existingIds = new HashSet<string>(settings.Reports.Select(r => r.Id));
            int maxOrder = settings.Reports.Count > 0 ? settings.Reports.Max(r => r.Order) : 0;

            foreach (var def in DefaultRegistry)
            {
                if (!existingIds.Contains(def.Id))
                {
                    maxOrder++;
                    settings.Reports.Add(new ReportRegistryItem
                    {
                        Id = def.Id,
                        Name = def.Name,
                        Category = def.Category,
                        Subgroup = def.Subgroup,
                        Order = maxOrder,
                        Enabled = def.Enabled,
                        SupportsEdit = def.SupportsEdit,
                        Formats = def.Formats,
                        RequiredFilters = def.RequiredFilters
                    });
                }
            }
        }

        private static string SanitizeWorksheetName(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return "Sheet";
            var clean = Regex.Replace(name, @"[\\/?*:\[\]]", "-");
            if (clean.Length > 31)
            {
                clean = clean.Substring(0, 31);
            }
            return clean.Trim();
        }

        private static object FetchSocietyDetails(DbConnection conn, int societyId)
        {
            string name = "HENU CO-OPERATIVE HOUSING SOCIETY LTD.";
            string address = "Plot 12, Sector 19, Seawoods, Navi Mumbai, Maharashtra - 400706";
            string pan = "AAACH1234F";
            string tan = "MUMH01234F";
            string gstin = "27AAACH1234F1Z5";
            string state = "Maharashtra";
            string pincode = "400706";

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT SocietyName, Address, PANNumber, TAN, GSTNumber, City, Pincode
                    FROM jeevika_erp.SocietyInfo
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
                pincode = pincode
            };
        }
    }
}
