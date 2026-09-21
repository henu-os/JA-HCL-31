# Cloud PostgreSQL Compatibility & Deployment Guide

## Target Environments
The Web Database Area is engineered for standard relational PostgreSQL hosting across multiple cloud providers:

1. **Self-Hosted PostgreSQL** (Ubuntu / Debian / Windows / Docker)
2. **Supabase PostgreSQL** (Direct connection via port 5432 / Transaction pooler port 6543)
3. **AWS RDS PostgreSQL / Aurora PostgreSQL**
4. **Google Cloud SQL for PostgreSQL**
5. **Azure Database for PostgreSQL (Flexible Server)**

## Configuration Requirements
- **PostgreSQL Version**: 14.x, 15.x, or 16.x.
- **Required Extensions**: None mandatory (core relational SQL only).
- **Search Path**: `jeevika_erp, public`.
- **Connection String Parameters**:
  ```
  Host=<PG_HOST>;Port=5432;Database=<PG_DATABASE>;Username=<PG_USER>;Password=<PG_PASSWORD>;SearchPath=jeevika_erp,public;SSL Mode=Require;Trust Server Certificate=true;
  ```
- **Security & Secret Management**: Store connection strings in environment variables (`ConnectionStrings__Default` or `PGPASSWORD`) rather than checking plain-text secrets into source control.
- **Client Boundary**: Web browser clients never connect directly to PostgreSQL. All operations pass through authenticated ASP.NET Core REST API endpoints.
