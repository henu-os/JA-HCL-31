# Database Provider Configuration Report

## 1. Configuration Model
Provider configuration is managed in `Backend/appsettings.json`:

```json
{
  "DatabaseProvider": "PostgreSQL",
  "ConnectionStrings": {
    "Default": "Host=127.0.0.1;Port=5432;Database=jeevika_db_v2;Username=postgres;Password=henuos;SearchPath=jeevika_erp,public;Include Error Detail=true",
    "Sqlite": "Data Source=Database/jeevika_local.db;"
  }
}
```

## 2. Configuration Invariants
- **Default Provider**: `"PostgreSQL"`.
- **Environment Overrides**:
  - `DatabaseProvider`: `"SQLite"` (for local standalone deployment).
  - `ConnectionStrings__Default`: Configures PostgreSQL production connection string securely without committing credentials.
  - `ConnectionStrings__Sqlite`: Configures SQLite database file location.
- **Frontend Security**: Connection strings and credentials are never exposed via API endpoints or frontend bundles.
