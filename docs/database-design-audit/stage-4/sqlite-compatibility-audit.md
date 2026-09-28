# SQLite Compatibility Audit & Operation Classification

## Overview
A detailed audit of existing controller queries was performed to categorize database operations and identify dialect adaptations required when executing against SQLite.

## Operation Classification Matrix

| Database Operation / Feature | PostgreSQL Usage in Codebase | SQLite Compatibility Status | Recommended Handling / Adaptation |
| :--- | :--- | :--- | :--- |
| **Standard DML (`INSERT`, `UPDATE`, `DELETE`, `SELECT`)** | All 29 controllers | **COMPATIBLE** | Direct execution supported by `Microsoft.Data.Sqlite`. |
| **`PRAGMA foreign_keys = ON;`** | Enforced on every connection | **COMPATIBLE** | Managed in `SqliteConnectionFactory`. |
| **Numeric Monetary Fields** | `NUMERIC(18,2)` mapped to C# `decimal` | **COMPATIBLE** | SQLite `NUMERIC` converts accurately to C# `decimal`. |
| **Transactions (Commit/Rollback)** | Explicit `BeginTransaction()` | **COMPATIBLE** | ACID compliance verified in WAL mode. |
| **Partial Unique Indexes** | `WHERE IsDeleted = FALSE` | **COMPATIBLE** | Supported in SQLite 3.8+ using `WHERE IsDeleted = 0`. |
| **`RETURNING` Clause on INSERT** | `RETURNING VoucherId`, `RETURNING MemberId` | **COMPATIBLE** | Supported in SQLite 3.35.0+ and `Microsoft.Data.Sqlite` 8.0+. |
| **Schema Qualifier (`jeevika_erp.TableName`)** | Hardcoded in 90+ SQL strings across controllers | **REQUIRES ADAPTER HANDLING** | In SQLite, strip `jeevika_erp.` or attach database as `jeevika_erp`. |
| **`ILIKE` Operator** | 50+ case-insensitive lookups in reports/search | **REQUIRES ADAPTER HANDLING** | In SQLite, translate to `LIKE` or `LOWER(col) LIKE LOWER(...)`. |
| **PostgreSQL Cast Syntax (`::INT`, `::DATE`, `::jsonb`)** | 6 occurrences (`ReportController`, `MemberController`) | **REQUIRES ADAPTER HANDLING** | In SQLite, translate to standard `CAST(col AS INTEGER)` or plain parameters. |
| **`ON CONFLICT (col) DO NOTHING`** | User & seed initialization | **COMPATIBLE** | Supported in SQLite 3.24.0+ / `INSERT OR IGNORE`. |
| **Regex Match (`BillNo ~ '[0-9]+$'`)** | `MemberBillController.cs` line 953 | **REQUIRES APPROVAL** | Requires custom regex registration in SQLite or query adaptation. |
| **Direct `NpgsqlConnection` Typecast** | Explicit in `DbHelper.GetConn()` | **REQUIRES ADAPTER HANDLING** | Use `DbConnection` interface or generic adapter facade. |

## Classification Legend
- **COMPATIBLE**: Directly works without query modification.
- **REQUIRES ADAPTER HANDLING**: Can be transparently translated by database adapter/facade without touching controller business rules.
- **REQUIRES APPROVAL**: Involves complex or vendor-specific function needing review before deployment.
- **NOT COMPATIBLE**: Not supported natively in target engine.
- **NOT TESTED**: Yet to be verified against live workload.
