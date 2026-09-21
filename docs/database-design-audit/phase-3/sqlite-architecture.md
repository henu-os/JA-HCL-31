# SQLite Architecture — Local & Offline Data Foundation

## Architecture Overview
The SQLite database layer is designed for offline desktop, single-user, and local field operations for Jeevika ERP 2.0.

```
                    ┌─────────────────────────┐
                    │       JEEVIKA ERP       │
                    │   Business Controllers  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  IDbConnectionFactory   │
                    │  Database Abstraction   │
                    └────────────┬────────────┘
                                 │
             ┌───────────────────┴───────────────────┐
             │                                       │
┌────────────▼────────────┐             ┌────────────▼────────────┐
│ PostgresConnectionFactory│             │  SqliteConnectionFactory│
│  (Cloud / PostgreSQL)   │             │   (Local SQLite WAL)    │
└─────────────────────────┘             └────────────┬────────────┘
                                                     │
                                        ┌────────────▼────────────┐
                                        │ PRAGMA foreign_keys=ON; │
                                        │ PRAGMA journal_mode=WAL;│
                                        │ Database/jeevika_local.db│
                                        └─────────────────────────┘
```

## SQLite Data Mapping & Types
| Domain Concept | PostgreSQL Type | SQLite Type | Application Handling |
| :--- | :--- | :--- | :--- |
| Primary Key | `SERIAL PRIMARY KEY` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Auto-incrementing 64-bit integer |
| Financial Amounts | `NUMERIC(18,2)` | `NUMERIC` | Read/Written as C# `decimal` |
| Short Codes / Names | `VARCHAR(n)` | `TEXT` | UTF-8 String |
| Dates | `DATE` | `TEXT` | ISO-8601 `YYYY-MM-DD` |
| Timestamps | `TIMESTAMPTZ` | `TEXT` | ISO-8601 UTC `YYYY-MM-DDTHH:MM:SSZ` |
| JSON Snapshots | `JSONB` | `TEXT` | Raw serialized JSON string |
| Flags / Booleans | `BOOLEAN` | `INTEGER` | `0` = False, `1` = True |

## SQLite Connection Invariants
1. **Foreign Key Enforcement**: SQLite disables foreign keys by default. `SqliteConnectionFactory` explicitly issues `PRAGMA foreign_keys = ON;` upon opening every connection.
2. **Concurrency & Durability**: `PRAGMA journal_mode = WAL;` (Write-Ahead Logging) enables concurrent reads during writes and prevents database locking contention.
3. **Partial Unique Indexes**: Employs `WHERE IsDeleted = 0` (e.g. `idx_socmember_active_memcode`, `uq_socgroup_code_active`, `uq_socaccount_code_active`) allowing soft-deleted code reuse without violating unique constraints.
