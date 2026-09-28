# JEEVIKA ERP 2.0 — Society Accounting System

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/henu-os/JA-HCL-31)
[![.NET](https://img.shields.io/badge/.NET-8.0-purple.svg)](https://dotnet.microsoft.com/)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F.svg)](https://www.electronjs.org/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%7C%20SQLite-336791.svg)](https://www.postgresql.org/)
[![Status](https://img.shields.io/badge/Stage%2010-Release%20Ready-brightgreen.svg)](https://github.com/henu-os/JA-HCL-31)

**JEEVIKA ERP 2.0** is an enterprise-grade, offline-capable, double-entry cooperative housing society accounting and property management ERP system. Built with an absolute preservation-first architecture, it ensures 100% financial precision, strict multi-society isolation, and seamless data portability between local desktop environments and cloud PostgreSQL hosting.

---

## 🏢 System Overview

- **Developed by:** TEAM HENU OS
- **System Owner:** HENU OS PRIVATE LIMITED
- **Repository:** [https://github.com/henu-os/JA-HCL-31](https://github.com/henu-os/JA-HCL-31)
- **Target Platform:** Windows / macOS / Linux Desktop (Electron) & Web Deployment

---

## ✨ Key Features & Capabilities

### 1. 📊 Double-Entry Accounting Core
- Strict double-entry ledger enforcement where $\sum \text{Debit} = \sum \text{Credit}$ for every voucher transaction.
- Banker's AwayFromZero rounding invariant across all calculations.
- Automatic dues waterfall allocation and interest computation.
- Financial Year locking with clean cross-year transition and isolated transaction numbering.

### 2. 🏘️ Multi-Society & Multi-FY Management
- Full multi-tenant isolation: manage multiple housing societies with independent chart of accounts, members, billing settings, and financial years.
- Granular society switching without data cross-contamination.

### 3. 🔄 Universal Database Import, Export & Merge Engine
- **Full Database Export:** Complete export of all societies, financial years, members, billing records, and balanced vouchers with SHA256 integrity checksums.
- **Current Society Export:** Single-society export maintaining complete isolation.
- **Select Societies Export:** Multi-selection export utility enabling selective migration of one or more societies.
- **Universal Multi-Society Merge:** Merges source societies into target databases without ID collisions or data corruption (`SAFE_MERGE`, `EMPTY_TARGET`, `VALIDATE_ONLY`).
- **Conflict Policies:** `SKIP_EXISTING`, `ADD_AS_NEW`, `REJECT_CONFLICTS`.

### 4. 🖥️ Secure Electron Desktop Foundation
- Strict renderer sandboxing: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Zero Node.js primitives or credentials exposed to the frontend renderer.
- Automatic managed backend lifecycle with self-healing port attachment (PID ownership and zero orphan processes).

### 5. ☁️ Dual-Database Persistence Architecture
- **Local Desktop:** Embedded SQLite 3 with `PRAGMA foreign_keys = ON` and canonical schema migrations.
- **Web & Cloud:** PostgreSQL 14–16 with `jeevika_erp` schema namespace, connection pooling, and SSL/TLS support (compatible with Supabase, AWS RDS, GCP Cloud SQL, and Azure).

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Backend API** | ASP.NET Core 8.0 Web API (C#) |
| **Data Access** | Dapper ORM / Npgsql (PostgreSQL) / Microsoft.Data.Sqlite (SQLite) |
| **Desktop Shell** | Electron 32+ (Node.js runtime with secure IPC bridge) |
| **Frontend UI** | HTML5, Modern CSS (Responsive Vanilla Design), Modular ES6 JavaScript |
| **Authentication** | JWT Bearer Authentication & Role-Based Access Control |
| **Documentation** | OpenAPI / Swagger UI (`/swagger`) |

---

## 🚀 Quick Start Guide

### Prerequisites
- [.NET 8.0 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 18+](https://nodejs.org/)
- [PostgreSQL](https://www.postgresql.org/) (optional if running in local SQLite mode)

### 1. Clone the Repository
```bash
git clone https://github.com/henu-os/JA-HCL-31.git
cd JA-HCL-31
```

### 2. Start the Backend API
```bash
# Build and run the ASP.NET Core Web API backend
dotnet run --project Backend/JeevikaERP.csproj
```
The backend API will start on:
- **API Base:** `http://localhost:5002/api`
- **Swagger Documentation:** `http://localhost:5002/swagger`
- **Web UI:** `http://localhost:5002/login.html`

### 3. Launch Desktop Application (Electron)
```bash
# In a new terminal window
cd Desktop
npm install
npm start
```
*Alternatively, you can run `start-desktop.bat` from the root directory.*

---

## 🧪 Verification & Test Suites

JEEVIKA ERP 2.0 contains comprehensive built-in automated test suites verifying database integrity, accounting balancing, and merge safety.

```bash
# 1. Verify Phase 3 Database Foundation Invariants
dotnet run --project Backend/JeevikaERP.csproj -- --verify-db

# 2. Verify Stage 7 Database Export & Import Engine
dotnet run --project Backend/JeevikaERP.csproj -- --verify-export-import

# 3. Verify Stage 9 Cloud Synchronization Engine
dotnet run --project Backend/JeevikaERP.csproj -- --verify-sync

# 4. Verify Universal Import & Multi-Society Merge Engine
dotnet run --project Backend/JeevikaERP.csproj -- --verify-import-merge

# 5. Run Electron Desktop Security & Runtime E2E Scenarios
cd Desktop
npm test
npm run test:e2e
```

---

## 📁 Repository Structure

```
JA-HCL-31/
├── assets/                     # Global CSS stylesheets, branding, and central API clients
│   ├── css/                    # UI component stylesheets & design tokens
│   └── js/                     # Central API (api.js), auth, and navigation helpers
├── Backend/                    # ASP.NET Core 8 Web API Project
│   ├── Controllers/            # Society, Member, Billing, Voucher, & DataTransfer APIs
│   ├── Database/               # Dual-provider abstraction, ExportImport, & Sync engines
│   │   ├── ExportImport/       # Universal export package generator & safe merge engine
│   │   ├── Integrity/          # Verification suites for DB, Merge, & Accounting invariants
│   │   ├── Migrations/         # Canonical SQLite and PostgreSQL migration scripts
│   │   └── Synchronization/    # Batch tracking and audit synchronization engine
│   ├── DbHelper.cs             # Central connection factory & provider switch
│   └── Program.cs              # ASP.NET entry point, middleware, & CLI verification flags
├── Database/                   # Migration repositories and database initialization files
│   ├── Local/migrations/       # Canonical SQLite migrations
│   └── Web/migrations/         # Canonical PostgreSQL migrations
├── Desktop/                    # Electron Desktop Application Shell
│   ├── src/main/               # Electron main process & backend manager
│   ├── src/preload/            # Context isolation bridge (zero Node leaks)
│   ├── scripts/                # Automated security & e2e verification suites
│   └── package.json            # Desktop package dependencies and scripts
├── docs/                       # Architectural audits, migration guides, & QA reports
├── modules/                    # Application UI modules (Masters, Accounts, Settings, etc.)
│   └── settings/               # Universal Database Merge & Import/Export UI
├── login.html                  # Secure application login portal
├── workspace.html              # Main ERP responsive workspace shell
└── README.md                   # Repository documentation
```

---

## 🔒 Security & Data Integrity

1. **Deterministic Checksum Hashing:** Every export package is protected with a SHA256 canonical digest. Tampered or corrupted packages are strictly rejected before database execution.
2. **Credential Scrubbing:** Password hashes, secret keys, and tokens are automatically omitted during database exports.
3. **Atomic Rollbacks:** All import and merge operations execute within explicit database transactions. If a constraint or invariant check fails, zero dirty records are committed.
4. **Isolated Electron Bridge:** Zero direct access to Node.js `fs`, `child_process`, or `process` primitives from the renderer window.

---

## 📄 License & Attribution

Copyright © 2026 **HENU OS PRIVATE LIMITED**. All Rights Reserved.  
**System Owner:** Siddharth Singh
