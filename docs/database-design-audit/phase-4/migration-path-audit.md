# Migration Path Audit & Checksum Verification

## 1. Migration Paths Resolution
| Provider | Target Migration Path | Fallback Path | Active Status |
| :--- | :--- | :--- | :--- |
| **SQLite (Local)** | `Database/Local/migrations/` | `Database/migrations/sqlite/` | **Active & Verified** |
| **PostgreSQL (Web)** | `Database/Web/migrations/` | `Database/migrations/postgres/` | **Active & Verified** |

## 2. Checksum Verification
- `Database/Local/migrations/V1__canonical_sqlite_schema.sql`:
  - Name: `V1__canonical_sqlite_schema`
  - Version: 1
  - Checksum: SHA-256 validated dynamically at runtime.
  - Tracking Table: `schema_migrations`.
- `Database/Web/migrations/V1__canonical_postgres_schema.sql`:
  - Name: `V1__canonical_postgres_schema`
  - Version: 1
  - Checksum: SHA-256 validated dynamically at runtime.
  - Tracking Table: `jeevika_erp.schema_migrations`.

## 3. Code Path Reference Map
- `Backend/Database/DatabaseInitializer.cs`: Resolves `Database/Local/migrations/`.
- `Backend/Program.cs`: Resolves `Database/Local/migrations/`.
- `Backend/DbHelper.cs`: Resolves `Database/Web/schema/schema.sql` and `Database/Web/seeds/seed.sql`.
