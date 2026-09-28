# Local Database Architecture (SQLite)

## Scope
The Local database subsystem provides standalone, single-tenant, and offline database persistence for desktop and offline Jeevika ERP installations.

## Components
- **Provider Driver**: `Microsoft.Data.Sqlite` (8.0.8).
- **Connection Factory**: `SqliteConnectionFactory`.
- **Migrations**: `Database/Local/migrations/` (`V1__canonical_sqlite_schema.sql`).
- **Schema Reference**: `Database/Local/schema/sqlite_schema.sql`.
- **Seeds**: `Database/Local/seeds/sqlite_seed.sql`.

## Key Invariants
- `PRAGMA foreign_keys = ON;` is enforced on every open connection.
- `PRAGMA journal_mode = WAL;` is enabled for concurrent read durability.
- All financial calculations (`Math.Round(..., MidpointRounding.AwayFromZero)`) and double-entry invariants are preserved.
