# Web Database Area (PostgreSQL)

## Directory Structure
```
Database/Web/
├── migrations/
│   └── V1__canonical_postgres_schema.sql
├── schema/
│   └── schema.sql
├── seeds/
│   └── seed.sql
├── documentation/
│   └── postgres-web-architecture.md
└── README.md
```

## Description
This area houses all artifacts strictly associated with PostgreSQL server and cloud deployments.
- **Migrations**: Executed for PostgreSQL database initialization.
- **Multi-tenancy**: Scoped by `SocietyId` across all master and transaction tables.
- **Precision**: Monetary fields use `NUMERIC(18,2)`.
