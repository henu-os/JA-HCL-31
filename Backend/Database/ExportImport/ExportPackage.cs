// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Export & Import Package Models
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace JeevikaERP.Database.ExportImport
{
    public class ExportMetadata
    {
        public string FormatVersion { get; set; } = "1.0.0";
        public string AppVersion { get; set; } = "2.0.0";
        public DateTime ExportTimestampUtc { get; set; } = DateTime.UtcNow;
        public string SourceProvider { get; set; } = "PostgreSQL";
        public string Scope { get; set; } = "FULL"; // FULL, SOCIETY, CURRENT_SOCIETY, SELECT_SOCIETIES
        public int? SocietyId { get; set; }
        public List<int>? SelectedSocietyIds { get; set; }
        public string? SocietyName { get; set; }
        public string FinancialYearScope { get; set; } = "ALL_FYS"; // ALL_FYS, CURRENT_FY, SELECT_FYS
        public int? FinancialYearId { get; set; }
        public List<int>? SelectedFinancialYearIds { get; set; }
        public string? FYLabel { get; set; }
        public string ChecksumSha256 { get; set; } = string.Empty;
        public Dictionary<string, int> RecordCounts { get; set; } = new();
    }

    public class ExportDataPayload
    {
        public List<Dictionary<string, object?>> SocietyInfo { get; set; } = new();
        public List<Dictionary<string, object?>> FinancialYear { get; set; } = new();
        public List<Dictionary<string, object?>> TxNumberConfig { get; set; } = new();
        public List<Dictionary<string, object?>> SocGroup { get; set; } = new();
        public List<Dictionary<string, object?>> SocAccount { get; set; } = new();
        public List<Dictionary<string, object?>> SocMember { get; set; } = new();
        public List<Dictionary<string, object?>> SocVendor { get; set; } = new();
        public List<Dictionary<string, object?>> SocStaff { get; set; } = new();
        public List<Dictionary<string, object?>> SocCommittee { get; set; } = new();
        public List<Dictionary<string, object?>> SocBillType { get; set; } = new();
        public List<Dictionary<string, object?>> SocBillingMatrix { get; set; } = new();
        public List<Dictionary<string, object?>> SocBillingSetting { get; set; } = new();
        public List<Dictionary<string, object?>> SocOpeningBankReco { get; set; } = new();
        public List<Dictionary<string, object?>> SocVoucherHeader { get; set; } = new();
        public List<Dictionary<string, object?>> SocVoucherDetail { get; set; } = new();
        public List<Dictionary<string, object?>> SocMemberBill { get; set; } = new();
        public List<Dictionary<string, object?>> SocMemberBillItem { get; set; } = new();
        public List<Dictionary<string, object?>> SocMemberNote { get; set; } = new();
        public List<Dictionary<string, object?>> SocOpeningBalance { get; set; } = new();
        public List<Dictionary<string, object?>> SocFixedDeposit { get; set; } = new();
        public List<Dictionary<string, object?>> SocMemberTransfer { get; set; } = new();
    }

    public class ExportPackage
    {
        public ExportMetadata Metadata { get; set; } = new();
        public ExportDataPayload Data { get; set; } = new();
    }

    public class ExportRequest
    {
        public string Scope { get; set; } = "FULL"; // FULL, SOCIETY, CURRENT_SOCIETY, SELECT_SOCIETIES
        public int? SocietyId { get; set; }
        public List<int>? SelectedSocietyIds { get; set; }
        public string FinancialYearScope { get; set; } = "ALL_FYS"; // ALL_FYS, CURRENT_FY, SELECT_FYS
        public int? FinancialYearId { get; set; }
        public List<int>? SelectedFinancialYearIds { get; set; }
    }

    public class ImportValidationResult
    {
        public bool IsValid { get; set; }
        public string? Scope { get; set; }
        public int TotalRecords { get; set; }
        public Dictionary<string, int> RecordCounts { get; set; } = new();
        public List<string> ValidationErrors { get; set; } = new();
        public List<string> Warnings { get; set; } = new();
    }

    public class ImportExecutionResult
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public Dictionary<string, int> ImportedCounts { get; set; } = new();
        public List<string> Errors { get; set; } = new();
        public double DurationMs { get; set; }
    }
}
