# Migration Conventions & Versioning Standard

## 1. Naming Standard
All migration files follow strict versioning:
```
V{Version}__{Description}.sql
```
- Example: `V1__canonical_sqlite_schema.sql`
- Example: `V1__canonical_postgres_schema.sql`

## 2. Directory Layout
- **Local (SQLite)**: `Database/Local/migrations/`
- **Web (PostgreSQL)**: `Database/Web/migrations/`

## 3. Execution Rules
- Migration numbers must be strictly increasing integers.
- Migrations must be transactional and idempotent.
- Scripts must not execute destructive operations (`DROP TABLE`, `TRUNCATE`) on existing data.
- Checksums are calculated at runtime using SHA-256 and stored in `schema_migrations`.
