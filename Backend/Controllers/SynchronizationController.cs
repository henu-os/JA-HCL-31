// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — SynchronizationController
// Authenticated API endpoints for optional database synchronization.
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using JeevikaERP.Database.Synchronization;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/synchronization")]
    [Authorize]
    public class SynchronizationController : ControllerBase
    {
        private readonly IConfiguration _config;

        public SynchronizationController(IConfiguration config)
        {
            _config = config;
        }

        [HttpPost("package")]
        public IActionResult CreatePackage([FromBody] SyncPackageRequest req)
        {
            try
            {
                var societyId = req.SocietyId;
                if (societyId <= 0)
                {
                    return BadRequest(new { success = false, message = "Valid SocietyId is required." });
                }

                using var conn = DbHelper.GetConn();
                var provider = _config["DatabaseProvider"] ?? "PostgreSQL";
                var package = SynchronizationService.CreatePackage(
                    conn,
                    societyId,
                    req.FinancialYearId,
                    req.SourceNodeId ?? "DESKTOP-CLIENT",
                    req.Changes ?? new(),
                    provider);

                return Ok(new { success = true, package });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Failed to create sync package: {ex.Message}" });
            }
        }

        [HttpPost("preview")]
        public IActionResult PreviewSync([FromBody] SyncPackage package)
        {
            if (package == null)
            {
                return BadRequest(new { success = false, message = "Sync package payload is required." });
            }

            try
            {
                using var conn = DbHelper.GetConn();
                var provider = _config["DatabaseProvider"] ?? "PostgreSQL";
                var result = SynchronizationService.PreviewAndValidate(conn, package, provider);
                return Ok(new { success = result.IsValid, preview = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Preview failed: {ex.Message}" });
            }
        }

        [HttpPost("apply")]
        public IActionResult ApplySync([FromBody] SyncPackage package)
        {
            if (package == null)
            {
                return BadRequest(new { success = false, message = "Sync package payload is required." });
            }

            var username = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("unique_name") ?? "AuthorizedUser";

            try
            {
                using var conn = DbHelper.GetConn();
                var provider = _config["DatabaseProvider"] ?? "PostgreSQL";
                var result = SynchronizationService.ApplySyncPackage(conn, package, username, provider);
                
                if (!result.Success)
                {
                    return UnprocessableEntity(new { success = false, result });
                }

                return Ok(new { success = true, result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Sync apply failed: {ex.Message}" });
            }
        }

        [HttpGet("batches")]
        public IActionResult GetRecentBatches([FromQuery] int societyId)
        {
            if (societyId <= 0)
            {
                return BadRequest(new { success = false, message = "Valid SocietyId is required." });
            }

            try
            {
                using var conn = DbHelper.GetConn();
                var provider = _config["DatabaseProvider"] ?? "PostgreSQL";
                string prefix = provider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase) ? "jeevika_erp." : "";

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT BatchId, SourceNodeId, SocietyId, FYId, TotalChanges, Status, ErrorMessage, CreatedAt, AppliedAt, CreatedBy
                    FROM {prefix}SyncBatch
                    WHERE SocietyId = @socId
                    ORDER BY CreatedAt DESC
                    LIMIT 50;
                ";
                var p = cmd.CreateParameter();
                p.ParameterName = "@socId";
                p.Value = societyId;
                cmd.Parameters.Add(p);

                var list = new List<SyncBatchSummary>();
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    list.Add(new SyncBatchSummary
                    {
                        BatchId = reader.GetString(0),
                        SourceNodeId = reader.GetString(1),
                        SocietyId = reader.GetInt32(2),
                        FYId = reader.IsDBNull(3) ? null : reader.GetInt32(3),
                        TotalChanges = reader.GetInt32(4),
                        Status = reader.GetString(5),
                        ErrorMessage = reader.IsDBNull(6) ? null : reader.GetString(6),
                        CreatedAt = reader.IsDBNull(7) ? null : reader.GetValue(7).ToString(),
                        AppliedAt = reader.IsDBNull(8) ? null : reader.GetValue(8).ToString(),
                        CreatedBy = reader.IsDBNull(9) ? null : reader.GetString(9)
                    });
                }

                return Ok(new { success = true, batches = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"Failed retrieving sync batches: {ex.Message}" });
            }
        }
    }

    public class SyncPackageRequest
    {
        public int SocietyId { get; set; }
        public int? FinancialYearId { get; set; }
        public string? SourceNodeId { get; set; }
        public List<SyncChangeItem> Changes { get; set; } = new();
    }
}
