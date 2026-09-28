# Web Database Architecture (PostgreSQL)

## Overview
The Web Database Area is dedicated to multi-tenant cloud and web server deployments running PostgreSQL.

## File Manifest
- **Canonical Migration Path**: `Database/Web/migrations/V1__canonical_postgres_schema.sql`
- **Canonical Schema Path**: `Database/Web/schema/schema.sql`
- **Canonical Seed Path**: `Database/Web/seeds/seed.sql`
- **Architecture Documentation**: `Database/Web/documentation/postgres-web-architecture.md`
- **Web Readme**: `Database/Web/README.md`
- **C# Web Factory**: `Backend/Database/Web/PostgresConnectionFactory.cs`

## Key Capabilities & Safety Invariants
1. **Multi-Tenancy**: Scoped by `SocietyId` across all master and transaction tables.
2. **PostgreSQL Compatibility**: Compatible with PostgreSQL 14+, 15, 16, Supabase, AWS RDS, GCP Cloud SQL, and Azure PostgreSQL.
3. **Security Boundary**: The web frontend communicates exclusively over REST APIs with ASP.NET Core controllers; database credentials and connections remain strictly protected in backend infrastructure.
