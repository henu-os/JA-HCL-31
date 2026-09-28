// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — DataTransferController
// ═══════════════════════════════════════════════════════════
// Handles Database Export & Universal Import / Merge APIs
// POST /api/data-transfer/export          → Generates structured export package
// POST /api/data-transfer/validate        → Validates import package integrity
// POST /api/data-transfer/import          → Basic direct import
// POST /api/data-transfer/import/preview  → Previews merge changes & conflicts
// POST /api/data-transfer/import/validate → Dry-run validation of merge
// POST /api/data-transfer/import/execute  → Executes atomic universal merge
// GET  /api/data-transfer/import/{id}/report → Retrieves merge report
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using JeevikaERP.Database.ExportImport;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/data-transfer")]
    [Authorize]
    public class DataTransferController : ControllerBase
    {
        private readonly IConfiguration _config;
        private static readonly ConcurrentDictionary<string, MergeReport> OperationReports = new();

        public DataTransferController(IConfiguration config)
        {
            _config = config;
        }

        // ── POST /api/data-transfer/export ────────────────────
        [HttpPost("export")]
        public IActionResult ExportData([FromBody] ExportRequest request)
        {
            try
            {
                using var conn = DbHelper.GetDbConnection();
                var provider = _config["DatabaseProvider"] ?? "PostgreSQL";
                var package = DatabaseExportService.GenerateExport(conn, request, provider);

                return Ok(new
                {
                    success = true,
                    metadata = package.Metadata,
                    data = package.Data
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Export failed: " + ex.Message
                });
            }
        }

        // ── GET /api/data-transfer/export ─────────────────────
        [HttpGet("export")]
        public IActionResult ExportDataQuery(
            [FromQuery] string scope = "FULL",
            [FromQuery] int? societyId = null,
            [FromQuery] string fyScope = "ALL_FYS",
            [FromQuery] int? fyId = null)
        {
            var req = new ExportRequest
            {
                Scope = scope,
                SocietyId = societyId,
                FinancialYearScope = fyScope,
                FinancialYearId = fyId
            };
            return ExportData(req);
        }

        // ── POST /api/data-transfer/validate ──────────────────
        [HttpPost("validate")]
        public IActionResult ValidateImport([FromBody] ExportPackage package)
        {
            try
            {
                var validation = DatabaseImportService.ValidatePackage(package);
                return Ok(new
                {
                    success = validation.IsValid,
                    validation
                });
            }
            catch (Exception ex)
            {
                return StatusCode(400, new
                {
                    success = false,
                    message = "Validation failed: " + ex.Message
                });
            }
        }

        // ── POST /api/data-transfer/import ────────────────────
        [HttpPost("import")]
        public IActionResult ImportData([FromBody] ExportPackage package)
        {
            try
            {
                using var conn = DbHelper.GetDbConnection();
                var provider = _config["DatabaseProvider"] ?? "PostgreSQL";
                var result = DatabaseImportService.ExecuteImport(conn, package, provider);

                if (result.Success)
                {
                    return Ok(result);
                }
                else
                {
                    return BadRequest(result);
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Import execution failed: " + ex.Message
                });
            }
        }

        // ── POST /api/data-transfer/import/preview ─────────────
        [HttpPost("import/preview")]
        public IActionResult PreviewMerge([FromBody] MergeExecutionRequest req)
        {
            if (req == null || req.Package == null)
            {
                return BadRequest(new { success = false, message = "Package payload is required." });
            }

            try
            {
                using var conn = DbHelper.GetDbConnection();
                var provider = _config["DatabaseProvider"] ?? "PostgreSQL";
                var options = new MergeOptions
                {
                    Mode = "VALIDATE_ONLY",
                    ConflictPolicy = req.ConflictPolicy ?? "SKIP_EXISTING",
                    FinancialYearScope = req.FinancialYearScope ?? "ALL_FYS",
                    TargetCurrentFYId = req.TargetCurrentFYId,
                    SelectedFinancialYearIds = req.SelectedFinancialYearIds,
                    SourceNodeId = req.SourceNodeId ?? "SOURCE",
                    TargetNodeId = req.TargetNodeId ?? "TARGET",
                    ExecutedBy = User.FindFirstValue(ClaimTypes.Name) ?? "AuthorizedUser"
                };

                var report = UniversalDataMergeService.PreviewOrExecute(conn, req.Package, options, provider);
                OperationReports[report.OperationId] = report;

                return Ok(new { success = report.Success, report });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Preview failed: " + ex.Message });
            }
        }

        // ── POST /api/data-transfer/import/validate ────────────
        [HttpPost("import/validate")]
        public IActionResult ValidateMerge([FromBody] MergeExecutionRequest req)
        {
            return PreviewMerge(req);
        }

        // ── POST /api/data-transfer/import/execute ─────────────
        [HttpPost("import/execute")]
        public IActionResult ExecuteUniversalMerge([FromBody] MergeExecutionRequest req)
        {
            if (req == null || req.Package == null)
            {
                return BadRequest(new { success = false, message = "Package payload is required." });
            }

            try
            {
                using var conn = DbHelper.GetDbConnection();
                var provider = _config["DatabaseProvider"] ?? "PostgreSQL";
                var options = new MergeOptions
                {
                    Mode = req.ImportMode ?? "SAFE_MERGE",
                    ConflictPolicy = req.ConflictPolicy ?? "SKIP_EXISTING",
                    FinancialYearScope = req.FinancialYearScope ?? "ALL_FYS",
                    TargetCurrentFYId = req.TargetCurrentFYId,
                    SelectedFinancialYearIds = req.SelectedFinancialYearIds,
                    SourceNodeId = req.SourceNodeId ?? "SOURCE",
                    TargetNodeId = req.TargetNodeId ?? "TARGET",
                    ExecutedBy = User.FindFirstValue(ClaimTypes.Name) ?? "AuthorizedUser"
                };

                var report = UniversalDataMergeService.PreviewOrExecute(conn, req.Package, options, provider);
                OperationReports[report.OperationId] = report;

                return Ok(new { success = report.Success, report });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Universal merge execution failed: " + ex.Message });
            }
        }

        // ── GET /api/data-transfer/import/{operationId}/report ─
        [HttpGet("import/{operationId}/report")]
        public IActionResult GetMergeReport([FromRoute] string operationId)
        {
            if (OperationReports.TryGetValue(operationId, out var report))
            {
                return Ok(new { success = true, report });
            }
            return NotFound(new { success = false, message = $"Operation ID '{operationId}' not found." });
        }
    }

    public class MergeExecutionRequest
    {
        public ExportPackage Package { get; set; } = new();
        public string? ImportMode { get; set; } = "SAFE_MERGE"; // EMPTY_TARGET, SAFE_MERGE, VALIDATE_ONLY
        public string? ConflictPolicy { get; set; } = "SKIP_EXISTING"; // REJECT_CONFLICTS, SKIP_EXISTING, ADD_AS_NEW
        public string? FinancialYearScope { get; set; } = "ALL_FYS"; // ALL_FYS, CURRENT_FY, SELECT_FYS
        public int? TargetCurrentFYId { get; set; }
        public List<int>? SelectedFinancialYearIds { get; set; }
        public string? SourceNodeId { get; set; }
        public string? TargetNodeId { get; set; }
    }
}
