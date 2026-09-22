// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — FinancialYearController
// Provider-agnostic Financial Year Controller (PostgreSQL & SQLite)
// GET    /api/financial-years?societyId=X  → list FYs
// GET    /api/financial-years/{id}          → get one FY
// POST   /api/financial-years               → create FY
// PUT    /api/financial-years/{id}          → update FY
// DELETE /api/financial-years/{id}          → delete FY
// POST   /api/financial-years/{id}/close    → mark FY as closed
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/financial-years")]
    [AllowAnonymous]
    public class FinancialYearController : ControllerBase
    {
        private static string GetSchemaPrefix(DbConnection conn)
        {
            return conn.GetType().Name.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) ? "jeevika_erp." : "";
        }

        private static void AddParameter(DbCommand cmd, string paramName, object? value)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = paramName;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        // ── GET /api/financial-years?societyId=X ─────────
        [HttpGet]
        [AllowAnonymous]
        public IActionResult GetAll([FromQuery] int societyId)
        {
            if (societyId <= 0)
                return BadRequest(new { success = false, message = "societyId is required." });

            try
            {
                using var conn = DbHelper.GetDbConnection();
                if (conn.State != ConnectionState.Open) conn.Open();

                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT FYId, SocietyId, FYLabel, FYStart, FYEnd,
                           IsActive, IsClosed, CreatedAt
                    FROM {prefix}FinancialYear
                    WHERE SocietyId = @sid
                    ORDER BY FYStart DESC";
                AddParameter(cmd, "@sid", societyId);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read()) list.Add(MapFY(r));

                return Ok(new { success = true, data = list, count = list.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── GET /api/financial-years/{id} ────────────────
        [HttpGet("{id:int}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = DbHelper.GetDbConnection();
                if (conn.State != ConnectionState.Open) conn.Open();

                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT * FROM {prefix}FinancialYear
                    WHERE FYId = @id LIMIT 1";
                AddParameter(cmd, "@id", id);

                using var r = cmd.ExecuteReader();
                if (!r.Read())
                    return NotFound(new { success = false, message = "Financial year not found." });

                return Ok(new { success = true, data = MapFY(r) });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/financial-years ─────────────────────
        [HttpPost]
        [AllowAnonymous]
        public IActionResult Create([FromBody] FYModel model)
        {
            if (model == null)
                return BadRequest(new { success = false, message = "Invalid request payload." });

            if (model.SocietyId <= 0 || string.IsNullOrWhiteSpace(model.FYLabel))
                return BadRequest(new { success = false, message = "SocietyId and FYLabel are required." });

            DateTime startDt;
            if (model.FYStart is DateTime dtS) startDt = dtS;
            else if (DateTime.TryParse(model.FYStart?.ToString(), out var pS)) startDt = pS;
            else startDt = new DateTime(2026, 4, 1);

            DateTime endDt;
            if (model.FYEnd is DateTime dtE) endDt = dtE;
            else if (DateTime.TryParse(model.FYEnd?.ToString(), out var pE)) endDt = pE;
            else endDt = new DateTime(2027, 3, 31);

            if (startDt >= endDt)
                return BadRequest(new { success = false, message = "FY End date must be after FY Start date." });

            try
            {
                using var conn = DbHelper.GetDbConnection();
                if (conn.State != ConnectionState.Open) conn.Open();

                string prefix = GetSchemaPrefix(conn);

                // 1. Verify society exists
                using (var checkSoc = conn.CreateCommand())
                {
                    checkSoc.CommandText = $"SELECT COUNT(*) FROM {prefix}SocietyInfo WHERE SocietyId = @sid";
                    AddParameter(checkSoc, "@sid", model.SocietyId);
                    var socCount = Convert.ToInt64(checkSoc.ExecuteScalar() ?? 0L);
                    if (socCount == 0)
                        return BadRequest(new { success = false, message = $"Selected society (ID: {model.SocietyId}) does not exist." });
                }

                bool isPostgres = prefix.Length > 0;

                // 2. Duplicate Check: Ensure financial year doesn't already exist for this society
                using (var checkDup = conn.CreateCommand())
                {
                    if (isPostgres)
                    {
                        checkDup.CommandText = $@"
                            SELECT COUNT(*) FROM {prefix}FinancialYear 
                            WHERE SocietyId = @sid 
                              AND (UPPER(FYLabel) = @label OR (FYStart = @start::date AND FYEnd = @end::date))";
                    }
                    else
                    {
                        checkDup.CommandText = $@"
                            SELECT COUNT(*) FROM FinancialYear 
                            WHERE SocietyId = @sid 
                              AND (UPPER(FYLabel) = @label OR (FYStart = @start AND FYEnd = @end))";
                    }

                    AddParameter(checkDup, "@sid", model.SocietyId);
                    AddParameter(checkDup, "@label", model.FYLabel.Trim().ToUpperInvariant());
                    AddParameter(checkDup, "@start", startDt.ToString("yyyy-MM-dd"));
                    AddParameter(checkDup, "@end", endDt.ToString("yyyy-MM-dd"));

                    var dupCount = Convert.ToInt64(checkDup.ExecuteScalar() ?? 0L);
                    if (dupCount > 0)
                    {
                        return BadRequest(new
                        {
                            success = false,
                            message = "This financial year already exists for the selected society."
                        });
                    }
                }

                // 3. Insert new Financial Year (Provider-specific SQL)
                using var insertCmd = conn.CreateCommand();

                if (isPostgres)
                {
                    insertCmd.CommandText = $@"
                        INSERT INTO {prefix}FinancialYear
                            (SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed, CreatedAt)
                        VALUES
                            (@sid, @label, @start::date, @end::date, TRUE, FALSE, NOW())
                        RETURNING FYId";
                    AddParameter(insertCmd, "@sid", model.SocietyId);
                    AddParameter(insertCmd, "@label", model.FYLabel.Trim());
                    AddParameter(insertCmd, "@start", startDt.ToString("yyyy-MM-dd"));
                    AddParameter(insertCmd, "@end", endDt.ToString("yyyy-MM-dd"));

                    var newId = Convert.ToInt32(insertCmd.ExecuteScalar());
                    return Ok(new
                    {
                        success = true,
                        message = "Financial year created successfully.",
                        fYId = newId,
                        data = new
                        {
                            fYId = newId,
                            societyId = model.SocietyId,
                            fYLabel = model.FYLabel.Trim(),
                            fYStart = startDt.ToString("yyyy-MM-dd"),
                            fYEnd = endDt.ToString("yyyy-MM-dd"),
                            isActive = true,
                            isClosed = false
                        }
                    });
                }
                else
                {
                    insertCmd.CommandText = $@"
                        INSERT INTO FinancialYear
                            (SocietyId, FYLabel, FYStart, FYEnd, IsActive, IsClosed, CreatedAt)
                        VALUES
                            (@sid, @label, @start, @end, 1, 0, CURRENT_TIMESTAMP);
                        SELECT last_insert_rowid();";
                    AddParameter(insertCmd, "@sid", model.SocietyId);
                    AddParameter(insertCmd, "@label", model.FYLabel.Trim());
                    AddParameter(insertCmd, "@start", startDt.ToString("yyyy-MM-dd"));
                    AddParameter(insertCmd, "@end", endDt.ToString("yyyy-MM-dd"));

                    var newId = Convert.ToInt32(insertCmd.ExecuteScalar());
                    return Ok(new
                    {
                        success = true,
                        message = "Financial year created successfully.",
                        fYId = newId,
                        data = new
                        {
                            fYId = newId,
                            societyId = model.SocietyId,
                            fYLabel = model.FYLabel.Trim(),
                            fYStart = startDt.ToString("yyyy-MM-dd"),
                            fYEnd = endDt.ToString("yyyy-MM-dd"),
                            isActive = true,
                            isClosed = false
                        }
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static DateTime ParseDate(object? raw, DateTime fallback)
        {
            if (raw is DateTime dt) return dt;
            if (raw != null && DateTime.TryParse(raw.ToString(), out var parsed)) return parsed;
            return fallback;
        }

        // ── PUT /api/financial-years/{id} ────────────────
        [HttpPut("{id:int}")]
        public IActionResult Update(int id, [FromBody] FYModel model)
        {
            try
            {
                using var conn = DbHelper.GetDbConnection();
                if (conn.State != ConnectionState.Open) conn.Open();

                DateTime startDt = ParseDate(model.FYStart, new DateTime(2026, 4, 1));
                DateTime endDt = ParseDate(model.FYEnd, new DateTime(2027, 3, 31));

                string prefix = GetSchemaPrefix(conn);
                bool isPostgres = prefix.Length > 0;
                using var cmd = conn.CreateCommand();
                if (isPostgres)
                {
                    cmd.CommandText = $@"
                        UPDATE {prefix}FinancialYear
                        SET FYLabel  = @label,
                            FYStart  = @start::date,
                            FYEnd    = @end::date,
                            IsActive = @active
                        WHERE FYId = @id AND (IsClosed = FALSE OR IsClosed = 0)";
                }
                else
                {
                    cmd.CommandText = $@"
                        UPDATE FinancialYear
                        SET FYLabel  = @label,
                            FYStart  = @start,
                            FYEnd    = @end,
                            IsActive = @active
                        WHERE FYId = @id AND (IsClosed = 0)";
                }

                AddParameter(cmd, "@label", model.FYLabel?.Trim() ?? "");
                AddParameter(cmd, "@start", startDt.ToString("yyyy-MM-dd"));
                AddParameter(cmd, "@end", endDt.ToString("yyyy-MM-dd"));
                AddParameter(cmd, "@active", model.IsActive ? 1 : 0);
                AddParameter(cmd, "@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Financial year not found or is closed." });

                return Ok(new { success = true, message = "Financial year updated." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── DELETE /api/financial-years/{id} ─────────────
        [HttpDelete("{id:int}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = DbHelper.GetDbConnection();
                if (conn.State != ConnectionState.Open) conn.Open();

                string prefix = GetSchemaPrefix(conn);

                // Check if any transactions exist for this FY
                using var checkCmd = conn.CreateCommand();
                checkCmd.CommandText = $@"
                    SELECT COUNT(*) FROM {prefix}SocVoucherHeader
                    WHERE FYId = @id";
                AddParameter(checkCmd, "@id", id);
                var count = Convert.ToInt64(checkCmd.ExecuteScalar() ?? 0L);

                if (count > 0)
                    return Conflict(new
                    {
                        success = false,
                        message = $"Cannot delete: {count} transactions exist for this financial year."
                    });

                using var delCmd = conn.CreateCommand();
                delCmd.CommandText = $"DELETE FROM {prefix}FinancialYear WHERE FYId = @id AND (IsClosed = FALSE OR IsClosed = 0)";
                AddParameter(delCmd, "@id", id);

                var rows = delCmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Financial year not found or is closed." });

                return Ok(new { success = true, message = "Financial year deleted." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── POST /api/financial-years/{id}/close ─────────
        [HttpPost("{id:int}/close")]
        public IActionResult Close(int id)
        {
            try
            {
                using var conn = DbHelper.GetDbConnection();
                if (conn.State != ConnectionState.Open) conn.Open();

                string prefix = GetSchemaPrefix(conn);
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    UPDATE {prefix}FinancialYear
                    SET IsClosed = TRUE, IsActive = FALSE
                    WHERE FYId = @id";
                AddParameter(cmd, "@id", id);

                var rows = cmd.ExecuteNonQuery();
                if (rows == 0)
                    return NotFound(new { success = false, message = "Financial year not found." });

                return Ok(new { success = true, message = "Financial year closed successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // ── Helper: Map reader → object ───────────────────
        private static object MapFY(DbDataReader r)
        {
            var rawStart = r["FYStart"];
            var rawEnd = r["FYEnd"];
            string? fYStart = null;
            string? fYEnd = null;

            if (rawStart != DBNull.Value && rawStart != null)
            {
                if (rawStart is DateTime dt) fYStart = dt.ToString("yyyy-MM-dd");
                else fYStart = rawStart.ToString();
            }

            if (rawEnd != DBNull.Value && rawEnd != null)
            {
                if (rawEnd is DateTime dt) fYEnd = dt.ToString("yyyy-MM-dd");
                else fYEnd = rawEnd.ToString();
            }

            var rawActive = r["IsActive"];
            bool isActive = true;
            if (rawActive is bool bActive) isActive = bActive;
            else if (rawActive != null && rawActive != DBNull.Value) isActive = Convert.ToInt32(rawActive) == 1;

            var rawClosed = r["IsClosed"];
            bool isClosed = false;
            if (rawClosed is bool bClosed) isClosed = bClosed;
            else if (rawClosed != null && rawClosed != DBNull.Value) isClosed = Convert.ToInt32(rawClosed) == 1;

            return new
            {
                fYId = Convert.ToInt32(r["FYId"]),
                societyId = Convert.ToInt32(r["SocietyId"]),
                fYLabel = r["FYLabel"]?.ToString() ?? "",
                fYStart = fYStart,
                fYEnd = fYEnd,
                isActive = isActive,
                isClosed = isClosed
            };
        }
    }

    // ── FY Model ──────────────────────────────────────────
    public class FYModel
    {
        public int SocietyId { get; set; }
        public string FYLabel { get; set; } = "";
        public object? FYStart { get; set; }
        public object? FYEnd { get; set; }
        public bool IsActive { get; set; } = true;
    }
}
