// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — DatabaseInitializer
// Orchestrates provider configuration, database creation, migration runner,
// integrity validation, and safe startup diagnostics.
// ═══════════════════════════════════════════════════════════

using System;
using System.IO;
using Microsoft.Extensions.Configuration;
using JeevikaERP.Database.Migrations;
using JeevikaERP.Database.Integrity;

namespace JeevikaERP.Database
{
    public static class DatabaseInitializer
    {
        public static IDbConnectionFactory Initialize(IConfiguration config)
        {
            var providerName = config["DatabaseProvider"] ?? "PostgreSQL";
            Console.WriteLine($"[DatabaseInitializer] Configuring database provider: {providerName}");

            var baseDir = AppContext.BaseDirectory;
            var rootDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));
            if (!Directory.Exists(Path.Combine(rootDir, "Database")))
            {
                rootDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));
            }

            if (providerName.Equals("SQLite", StringComparison.OrdinalIgnoreCase))
            {
                var sqliteConnStr = config.GetConnectionString("Sqlite")
                    ?? config.GetConnectionString("Default")
                    ?? "Data Source=Database/jeevika_local.db;";

                // If relative path in connection string, make it absolute relative to rootDir
                var factory = new SqliteConnectionFactory(sqliteConnStr);

                var migrationsDir = Path.Combine(rootDir, "Database", "Local", "migrations");
                if (!Directory.Exists(migrationsDir))
                {
                    migrationsDir = Path.Combine(rootDir, "Database", "migrations", "sqlite");
                }
                Console.WriteLine($"[DatabaseInitializer] Running SQLite migrations from {migrationsDir}...");
                var runner = new MigrationRunner(factory, migrationsDir);
                var migResult = runner.Execute();

                if (!migResult.Success)
                {
                    Console.WriteLine($"[DatabaseInitializer] ❌ Migration failed: {migResult.ErrorMessage}");
                }
                else
                {
                    Console.WriteLine($"[DatabaseInitializer] ✅ Applied {migResult.AppliedCount} SQLite migration(s).");
                }

                // Integrity checks
                var checker = new DatabaseIntegrityChecker(factory);
                var integrity = checker.RunAllChecks();
                if (integrity.IsValid)
                {
                    Console.WriteLine($"[DatabaseInitializer] ✅ SQLite integrity verified: {integrity.ChecksPassed.Count} checks passed.");
                }
                else
                {
                    Console.WriteLine($"[DatabaseInitializer] ⚠️ Integrity warnings: {string.Join("; ", integrity.Violations)}");
                }

                return factory;
            }
            else
            {
                // Default: PostgreSQL
                var pgConnStr = config.GetConnectionString("Default")
                    ?? throw new InvalidOperationException("PostgreSQL connection string 'Default' not found.");

                var factory = new PostgresConnectionFactory(pgConnStr);
                return factory;
            }
        }
    }
}
