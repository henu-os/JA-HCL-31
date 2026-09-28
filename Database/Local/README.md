# Local Database Area (SQLite)

## Directory Structure
```
Database/Local/
├── migrations/
│   └── V1__canonical_sqlite_schema.sql
├── schema/
│   └── sqlite_schema.sql
├── seeds/
│   └── sqlite_seed.sql
├── documentation/
│   └── sqlite-architecture.md
└── README.md
```

## Description
This area houses all artifacts strictly associated with SQLite local/offline execution.
- **Migrations**: Executed automatically by `MigrationRunner` when `DatabaseProvider` is set to `"SQLite"`.
- **Foreign Keys**: Enabled at runtime via `PRAGMA foreign_keys = ON;`.
- **Precision**: Monetary fields use `NUMERIC` and map to `decimal` in C#.
