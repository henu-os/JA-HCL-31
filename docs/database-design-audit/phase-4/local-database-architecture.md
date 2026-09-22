# Local Database Architecture (SQLite)

## Overview
The Local Database Area is isolated for offline desktop operations and local single-node execution.

## File Manifest
- **Canonical Migration Path**: `Database/Local/migrations/V1__canonical_sqlite_schema.sql`
- **Canonical Schema Path**: `Database/Local/schema/sqlite_schema.sql`
- **Canonical Seed Path**: `Database/Local/seeds/sqlite_seed.sql`
- **Architecture Documentation**: `Database/Local/documentation/sqlite-architecture.md`
- **Local Readme**: `Database/Local/README.md`
- **C# Local Factory**: `Backend/Database/Local/SqliteConnectionFactory.cs`

## Key Capabilities & Safety Invariants
1. **Foreign Key Enforcement**: Configured with `PRAGMA foreign_keys = ON;` upon connection opening.
2. **Journal Mode**: Configured with `PRAGMA journal_mode = WAL;` (Write-Ahead Logging).
3. **Partial Indexes**: Leverages `WHERE IsDeleted = 0` for active record code uniqueness.
4. **Precision**: All financial columns store standard decimal values without IEEE floating-point conversion.
