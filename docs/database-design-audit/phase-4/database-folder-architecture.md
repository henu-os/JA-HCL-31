# Database Folder Architecture Specification

## Clean Directory Separation

```
JA-HCL-31/
├── Backend/
│   ├── Controllers/                      # 29 Existing Accounting Controllers (FROZEN)
│   ├── Database/                         # Clean Database Subsystem
│   │   ├── Abstractions/
│   │   │   ├── IDbConnectionFactory.cs   # Base connection factory interface
│   │   │   └── IDatabaseProvider.cs      # Provider lifecycle interface
│   │   ├── Local/
│   │   │   └── SqliteConnectionFactory.cs # SQLite provider implementation
│   │   ├── Web/
│   │   │   └── PostgresConnectionFactory.cs # PostgreSQL provider implementation
│   │   ├── Migrations/
│   │   │   └── MigrationRunner.cs        # Versioned migration engine
│   │   ├── Integrity/
│   │   │   ├── DatabaseIntegrityChecker.cs # Structural & PRAGMA validator
│   │   │   └── DatabaseVerificationSuite.cs# 12-point automated test runner
│   │   └── DatabaseInitializer.cs        # Startup orchestrator
│   ├── DbHelper.cs                       # Primary connection facade (Backward Compatible)
│   ├── Program.cs                        # Web entrypoint + CLI test flags
│   ├── JeevikaERP.csproj                 # .NET 8 Project file
│   └── appsettings.json                  # DatabaseProvider configuration
│
├── Database/
│   ├── Local/                            # Local SQLite Standalone Domain
│   │   ├── migrations/
│   │   │   └── V1__canonical_sqlite_schema.sql
│   │   ├── schema/
│   │   │   └── sqlite_schema.sql
│   │   ├── seeds/
│   │   │   └── sqlite_seed.sql
│   │   ├── documentation/
│   │   │   └── sqlite-architecture.md
│   │   └── README.md
│   │
│   ├── Web/                              # Web PostgreSQL Multi-tenant Domain
│   │   ├── migrations/
│   │   │   └── V1__canonical_postgres_schema.sql
│   │   ├── schema/
│   │   │   └── schema.sql
│   │   ├── seeds/
│   │   │   └── seed.sql
│   │   ├── documentation/
│   │   │   └── postgres-web-architecture.md
│   │   └── README.md
│   │
│   ├── Shared/                           # Shared Specifications
│   │   ├── documentation/
│   │   │   └── shared-data-dictionary.md
│   │   └── migration-conventions.md
│   │
│   ├── schema.sql                        # Root reference (Backward Compatibility)
│   ├── seed.sql                          # Root reference (Backward Compatibility)
│   └── README.md                         # Database Root README
│
└── docs/
    └── database-design-audit/
        ├── phase-1/
        ├── phase-2/
        ├── phase-3/
        └── phase-4/
            ├── phase-4-implementation-report.md
            ├── local-database-architecture.md
            ├── web-database-architecture.md
            ├── migration-path-audit.md
            ├── database-folder-architecture.md
            ├── cloud-postgres-compatibility.md
            └── accounting-regression-report.md
```
