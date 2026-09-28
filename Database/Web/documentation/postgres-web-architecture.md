# Web Database Architecture (PostgreSQL)

## Scope
The Web database subsystem provides cloud, multi-tenant server, and web hosting database persistence for Jeevika ERP 2.0.

## Components
- **Provider Driver**: `Npgsql` (8.0.5).
- **Connection Factory**: `PostgresConnectionFactory`.
- **Migrations**: `Database/Web/migrations/` (`V1__canonical_postgres_schema.sql`).
- **Schema Reference**: `Database/Web/schema/schema.sql`.
- **Seeds**: `Database/Web/seeds/seed.sql`.

## Infrastructure Compatibility
- **Self-Hosted PostgreSQL**: PostgreSQL 14, 15, 16.
- **Managed Cloud PostgreSQL**: Supabase, AWS RDS PostgreSQL, GCP Cloud SQL PostgreSQL, Azure Database for PostgreSQL.
- **Security**: Database connections remain strictly inside backend ASP.NET Core controllers; credentials are never exposed to browser clients.
