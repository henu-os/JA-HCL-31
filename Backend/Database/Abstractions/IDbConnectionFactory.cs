// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — IDbConnectionFactory
// Location: Backend/Database/Abstractions/IDbConnectionFactory.cs
// Abstraction interface for database connection providers
// Supports PostgreSQL (Cloud/Web) and SQLite (Local Desktop)
// ═══════════════════════════════════════════════════════════

using System.Data.Common;

namespace JeevikaERP
{
    public interface IDbConnectionFactory
    {
        string ProviderName { get; }
        DbConnection CreateConnection();
        DbConnection CreateOpenConnection();
    }
}
