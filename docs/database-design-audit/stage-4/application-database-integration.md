# Application Database Integration Architecture

## 1. Architectural Strategy

The application preserves existing business controllers while enabling database provider selection:

```
                  ┌────────────────────────────────────────┐
                  │          JEEVIKA APPLICATION           │
                  │   29 Controllers & Accounting Models   │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │                DbHelper                │
                  │   GetConn() / GetDbConnection()        │
                  └───────────────────┬────────────────────┘
                                      │
                  ┌───────────────────▼────────────────────┐
                  │          IDbConnectionFactory          │
                  │          Database Abstraction          │
                  └───────────────────┬────────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 │                                         │
    ┌────────────▼────────────┐               ┌────────────▼────────────┐
    │ PostgresConnectionFactory│               │  SqliteConnectionFactory│
    │ (Active Default Provider)│               │(Local Database / Desktop)│
    └─────────────────────────┘               └─────────────────────────┘
```

## 2. Integration Mechanics
- **PostgreSQL Path (Web / Cloud)**: Default connection factory creates `NpgsqlConnection` instances targeting PostgreSQL server or managed cloud (Supabase, AWS RDS, GCP Cloud SQL, Azure PostgreSQL).
- **SQLite Path (Local / Standalone)**: Local connection factory creates `SqliteConnection` instances with `PRAGMA foreign_keys = ON;` and `PRAGMA journal_mode = WAL;`.
- **Controller Access**: Existing controllers utilize `DbHelper.GetConn()` and `DbHelper.GetDbConnection()`. No breaking refactoring is imposed on working accounting code.
