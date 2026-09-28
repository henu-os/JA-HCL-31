# Database Folder Architecture Specification

## Clean Directory Separation

The repository organizes database and backend data abstractions cleanly without disrupting existing controller namespaces or breaking runtime references.

```
JA-HCL-31/
├── Backend/
│   ├── Controllers/                      # 29 Existing Accounting & Society Controllers (FROZEN)
│   ├── Database/                         # New Clean Database Subsystem
│   │   ├── Abstractions/
│   │   │   └── IDatabaseProvider.cs      # Provider abstraction
│   │   ├── Integrity/
│   │   │   ├── DatabaseIntegrityChecker.cs # Structural & PRAGMA validation
│   │   │   └── DatabaseVerificationSuite.cs# Automated 12-point test runner
│   │   ├── Migrations/
│   │   │   └── MigrationRunner.cs        # Versioned migration engine
│   │   └── DatabaseInitializer.cs        # Provider coordinator & startup bootstrapper
│   ├── IDbConnectionFactory.cs           # Root interface
│   ├── PostgresConnectionFactory.cs      # PostgreSQL implementation
│   ├── SqliteConnectionFactory.cs        # SQLite implementation
│   ├── DbHelper.cs                       # Primary connection facade (Backward Compatible)
│   ├── Program.cs                        # Web entrypoint + CLI test flags
│   ├── JeevikaERP.csproj                 # .NET 8 Project file
│   └── appsettings.json                  # Provider & connection configuration
│
├── Database/
│   ├── migrations/
│   │   ├── postgres/
│   │   │   └── V1__canonical_postgres_schema.sql
│   │   ├── sqlite/
│   │   │   └── V1__canonical_sqlite_schema.sql
│   │   └── shared/
│   │       └── README.md
│   ├── schema/
│   │   ├── schema.sql                    # PostgreSQL Master Reference Schema
│   │   └── sqlite_schema.sql             # SQLite Master Reference Schema
│   ├── seeds/
│   │   ├── seed.sql                      # PostgreSQL Seed Data
│   │   └── sqlite_seed.sql               # SQLite Seed Data
│   ├── schema.sql                        # Root reference
│   ├── seed.sql                          # Root reference
│   └── README.md                         # Database Directory Guide
│
└── docs/
    └── database-design-audit/
        ├── phase-1/
        ├── phase-2/
        └── phase-3/
            ├── phase-3-implementation-report.md
            ├── sqlite-architecture.md
            ├── migration-architecture.md
            ├── database-integrity-report.md
            ├── provider-compatibility.md
            ├── database-folder-architecture.md
            └── accounting-regression-report.md
```
