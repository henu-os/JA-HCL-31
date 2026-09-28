# Jeevika ERP 2.0 Database Architecture & Directory Layout

## Canonical Directory Organization
```
Database/
├── Local/                               # Standalone SQLite / Desktop / Offline
│   ├── migrations/
│   │   └── V1__canonical_sqlite_schema.sql
│   ├── schema/
│   │   └── sqlite_schema.sql
│   ├── seeds/
│   │   └── sqlite_seed.sql
│   ├── documentation/
│   │   └── sqlite-architecture.md
│   └── README.md
│
├── Web/                                 # Multi-tenant PostgreSQL / Web / Cloud
│   ├── migrations/
│   │   └── V1__canonical_postgres_schema.sql
│   ├── schema/
│   │   └── schema.sql
│   ├── seeds/
│   │   └── seed.sql
│   ├── documentation/
│   │   └── postgres-web-architecture.md
│   └── README.md
│
├── Shared/                              # Common documentation & standards
│   ├── documentation/
│   │   └── shared-data-dictionary.md
│   └── migration-conventions.md
│
├── schema.sql                           # Root reference schema (Backward Compatibility)
├── seed.sql                             # Root reference seed (Backward Compatibility)
└── README.md
```

## Supported Providers
1. **Local Provider**: SQLite 3.24+ via `Microsoft.Data.Sqlite` (`PRAGMA foreign_keys = ON;`).
2. **Web Provider**: PostgreSQL 14+ via `Npgsql` (`schema jeevika_erp`).
