// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Synchronization Models & Data Contracts
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;

namespace JeevikaERP.Database.Synchronization
{
    public class SyncChangeItem
    {
        public string EntityType { get; set; } = string.Empty; // e.g. "SocMember", "SocAccount", "SocVoucherHeader", "SocVoucherDetail"
        public string EntityKey { get; set; } = string.Empty; // Primary or natural key e.g. "101", "VR/01"
        public string Action { get; set; } = "INSERT"; // "INSERT", "UPDATE", "DELETE"
        public Dictionary<string, object?> Data { get; set; } = new();
        public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
    }

    public class SyncPackage
    {
        public string BatchId { get; set; } = Guid.NewGuid().ToString("N");
        public string SourceNodeId { get; set; } = "DESKTOP-CLIENT";
        public string? TargetNodeId { get; set; } = "SERVER-CENTRAL";
        public int SocietyId { get; set; }
        public int? FinancialYearId { get; set; }
        public string FormatVersion { get; set; } = "1.0.0";
        public string Scope { get; set; } = "SOCIETY";
        public DateTime CreatedTimestampUtc { get; set; } = DateTime.UtcNow;
        public string ChecksumSha256 { get; set; } = string.Empty;
        public List<SyncChangeItem> Changes { get; set; } = new();
    }

    public class SyncConflictItem
    {
        public string EntityType { get; set; } = string.Empty;
        public string EntityKey { get; set; } = string.Empty;
        public string IncomingAction { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
        public bool IsUnsafeAccountingConflict { get; set; }
    }

    public class SyncPreviewResult
    {
        public bool IsValid { get; set; }
        public string BatchId { get; set; } = string.Empty;
        public int TotalChanges { get; set; }
        public int InsertCount { get; set; }
        public int UpdateCount { get; set; }
        public int DeleteCount { get; set; }
        public List<SyncConflictItem> Conflicts { get; set; } = new();
        public List<string> ValidationErrors { get; set; } = new();
        public List<string> Warnings { get; set; } = new();
    }

    public class SyncExecutionResult
    {
        public bool Success { get; set; }
        public string BatchId { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public int AppliedCount { get; set; }
        public int SkippedCount { get; set; }
        public List<string> Errors { get; set; } = new();
        public double DurationMs { get; set; }
    }

    public class SyncBatchSummary
    {
        public string BatchId { get; set; } = string.Empty;
        public string SourceNodeId { get; set; } = string.Empty;
        public int SocietyId { get; set; }
        public int? FYId { get; set; }
        public int TotalChanges { get; set; }
        public string Status { get; set; } = "Pending";
        public string? ErrorMessage { get; set; }
        public string? CreatedAt { get; set; }
        public string? AppliedAt { get; set; }
        public string? CreatedBy { get; set; }
    }
}
