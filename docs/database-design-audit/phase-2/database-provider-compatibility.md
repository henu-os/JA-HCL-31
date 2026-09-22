# DATABASE PROVIDER COMPATIBILITY REPORT (POSTGRESQL & SQLITE)

**Project:** JEEVIKA ERP 2.0  
**Phase:** Phase 2  
**Purpose:** Comprehensive SQL Syntax & Type Mapping Analysis between PostgreSQL and SQLite.

---

## 1. SQL Query Classification Across Existing Controllers

| Category | Description | Existing Usage in Controllers | Strategy for SQLite Adapter |
| :--- | :--- | :--- | :--- |
| **Category 1: ANSI-Compliant SQL** | Standard `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `JOIN`, `WHERE`, `GROUP BY`, `ORDER BY` | 85% of queries across all 29 controllers | Compatible as-is with zero modification |
| **Category 2: Upsert Statements** | `INSERT INTO ... ON CONFLICT (...) DO UPDATE` | `SocMemberBill`, `SocBillingMatrix`, `SocBillType`, `SocUser` | Supported natively in SQLite 3.24.0+ with identical column syntax |
| **Category 3: String Filtering** | `ILIKE '%term%'` | `VoucherController`, `ReportController`, `MemberController` | Use `LIKE` with case-insensitive column collations or `LOWER()` in SQLite |
| **Category 4: Auto-Increment Sequences** | `SERIAL PRIMARY KEY` | Primary key definitions across all 30 tables | Map to `INTEGER PRIMARY KEY AUTOINCREMENT` in SQLite DDL |
| **Category 5: Date Restrictions** | `VoucherDate >= @fromDate AND VoucherDate <= @toDate` | `ReportController`, `VoucherController`, `MemberBillController` | ISO-8601 formatted text dates (`YYYY-MM-DD`) in SQLite |
| **Category 6: Complex Json Snapshots** | `OldOwnerSnapshot JSONB` | `SocMemberTransfer` | Stored as serialized JSON string in SQLite `TEXT` |

---

## 2. Type Mapping Invariant Matrix

| Column Purpose | PostgreSQL Type | SQLite Type | Invariant Requirement |
| :--- | :--- | :--- | :--- |
| Monetary Currency | `NUMERIC(18,2)` | `NUMERIC` / `REAL` | Must always deserialize into C# `decimal` with 2-decimal precision. Never use float. |
| Tax & Interest Rates | `NUMERIC(5,2)` | `NUMERIC` / `REAL` | Deserializes into C# `decimal`. |
| Primary Keys | `SERIAL` | `INTEGER PRIMARY KEY` | 64-bit integer compatibility. |
| Transaction Dates | `DATE` | `TEXT` (`YYYY-MM-DD`) | Enforce zero-padded ISO date format for string sorting. |
| Audit Timestamps | `TIMESTAMPTZ` | `TEXT` (ISO-8601 UTC) | Standard UTC string storage. |
| Flags / Booleans | `BOOLEAN` | `INTEGER` (`0` / `1`) | ADO.NET SQLite automatically maps boolean parameters to integers. |
