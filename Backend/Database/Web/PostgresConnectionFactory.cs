// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — PostgresConnectionFactory
// Location: Backend/Database/Web/PostgresConnectionFactory.cs
// PostgreSQL connection provider implementation for web / cloud mode
// ═══════════════════════════════════════════════════════════

using System;
using System.Data.Common;
using Npgsql;

namespace JeevikaERP
{
    public class PostgresConnectionFactory : IDbConnectionFactory
    {
        private readonly string _connectionString;

        public PostgresConnectionFactory(string connectionString)
        {
            _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
        }

        public string ProviderName => "PostgreSQL";

        public DbConnection CreateConnection()
        {
            return new NpgsqlConnection(_connectionString);
        }

        public DbConnection CreateOpenConnection()
        {
            var conn = new NpgsqlConnection(_connectionString);
            conn.Open();
            return conn;
        }

        public NpgsqlConnection CreateOpenNpgsqlConnection()
        {
            var conn = new NpgsqlConnection(_connectionString);
            conn.Open();
            return conn;
        }
    }
}
