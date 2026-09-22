# Migration Architecture & Versioning Specification

## Migration Design
The Jeevika ERP 2.0 migration system provides deterministic, transactional, and idempotent schema evolution across both PostgreSQL and SQLite providers.

### File Naming Convention
```
V{Version}__{Description}.sql
```
- `V`: Version prefix.
- `{Version}`: Strictly increasing positive integer (1, 2, 3...).
- `__`: Double underscore separator.
- `{Description}`: Snake_case summary of the migration purpose.
- `.sql`: Extension.

### Directory Structure
```
Database/
└── migrations/
    ├── postgres/
    │   └── V1__canonical_postgres_schema.sql
    ├── sqlite/
    │   └── V1__canonical_sqlite_schema.sql
    └── shared/
        └── README.md
```

### Migration History Tracking
Applied migrations are recorded in `schema_migrations`:
- `version` (INT / INTEGER PRIMARY KEY): Unique version number.
- `name` (VARCHAR / TEXT): Migration descriptor.
- `checksum` (VARCHAR / TEXT): SHA-256 hash of script text content at runtime.
- `applied_at` (TIMESTAMPTZ / TEXT): Timestamp of successful execution.

### Execution Workflow
1. Connects via the active `IDbConnectionFactory`.
2. Creates `schema_migrations` tracking table if missing.
3. Reads existing applied versions.
4. Identifies pending migration scripts from the provider's migration directory.
5. In version order, executes migration scripts within isolated transactions.
6. Writes audit entry to `schema_migrations` and commits transaction.
7. If an error occurs, rolls back transaction and aborts migration pipeline.
