// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — IDatabaseProvider
// High-level database provider interface extending connection factory
// with migration and integrity check capabilities.
// ═══════════════════════════════════════════════════════════

using System.Data.Common;

namespace JeevikaERP.Database.Abstractions
{
    public interface IDatabaseProvider : IDbConnectionFactory
    {
        void Initialize();
        (bool Success, string Message) RunMigrations();
        (bool Success, string Details) CheckIntegrity();
    }
}
