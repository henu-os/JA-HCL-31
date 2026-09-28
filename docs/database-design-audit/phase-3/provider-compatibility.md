# Database Provider Compatibility Matrix

## Provider Comparison
| Feature / Capability | PostgreSQL Provider (Web / Cloud) | SQLite Provider (Local / Offline) |
| :--- | :--- | :--- |
| **Driver Package** | `Npgsql` (8.0.5) | `Microsoft.Data.Sqlite` (8.0.8) |
| **Connection Factory** | `PostgresConnectionFactory` | `SqliteConnectionFactory` |
| **Target Infrastructure** | Self-hosted, Supabase, AWS RDS, GCP Cloud SQL, Azure Database for PG | Local standalone disk, Desktop packaging |
| **Default in appsettings** | Yes (`DatabaseProvider: PostgreSQL`) | Configurable (`DatabaseProvider: SQLite`) |
| **Schema Namespace** | `jeevika_erp` | Direct table names / Default namespace |
| **Foreign Keys** | Always enforced by database engine | Enforced via `PRAGMA foreign_keys = ON;` |
| **Transactions** | Full ACID Multi-statement transactions | Full ACID via WAL mode (`PRAGMA journal_mode = WAL;`) |
| **Financial Precision** | `NUMERIC(18,2)` -> C# `decimal` | `NUMERIC` -> C# `decimal` |
| **Dates / Timestamps** | `DATE`, `TIMESTAMPTZ` | ISO-8601 Strings (`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:SSZ`) |
| **Partial Unique Indexes** | Supported (`WHERE IsDeleted = FALSE`) | Supported (`WHERE IsDeleted = 0`) |
| **Conflict Handling** | `ON CONFLICT (...) DO NOTHING` / `DO UPDATE` | `INSERT OR IGNORE` / `ON CONFLICT (...) DO NOTHING` |
| **Accounting Impact** | None (100% Preserved) | None (100% Preserved) |

## Cloud Infrastructure Compatibility
Managed PostgreSQL providers (Supabase, AWS RDS, Google Cloud SQL, Azure Database for PostgreSQL) are standard relational PostgreSQL endpoints. They utilize the exact same `PostgresConnectionFactory` without requiring any separate accounting engine or database modifications.
