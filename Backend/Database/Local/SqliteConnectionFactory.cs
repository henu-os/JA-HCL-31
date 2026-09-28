// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — SqliteConnectionFactory
// Location: Backend/Database/Local/SqliteConnectionFactory.cs
// SQLite connection provider implementation for local / offline mode
// Ensures PRAGMA foreign_keys = ON on all opened connections.
// ═══════════════════════════════════════════════════════════

using System;
using System.Data.Common;
using System.IO;
using Microsoft.Data.Sqlite;

namespace JeevikaERP
{
    public class SqliteConnectionFactory : IDbConnectionFactory
    {
        private readonly string _connectionString;

        public SqliteConnectionFactory(string connectionString)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
            EnsureDirectoryExists(_connectionString);
        }

        public string ProviderName => "SQLite";

        public DbConnection CreateConnection()
        {
            return new SqliteConnection(_connectionString);
        }

        public DbConnection CreateOpenConnection()
        {
            var conn = new SqliteConnection(_connectionString);
            conn.Open();

            // Enable foreign key enforcement and journal mode
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;";
                cmd.ExecuteNonQuery();
            }

            return conn;
        }

        public SqliteConnection CreateOpenSqliteConnection()
        {
            return (SqliteConnection)CreateOpenConnection();
        }

        private static void EnsureDirectoryExists(string connectionString)
        {
            try
            {
                var builder = new SqliteConnectionStringBuilder(connectionString);
                var dataSource = builder.DataSource;
                if (!string.IsNullOrWhiteSpace(dataSource) && dataSource != ":memory:")
                {
                    var dir = Path.GetDirectoryName(Path.GetFullPath(dataSource));
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    {
                        Directory.CreateDirectory(dir);
                    }
                }
            }
            catch
            {
                // In-memory or invalid path handled during Open()
            }
        }
    }
}
