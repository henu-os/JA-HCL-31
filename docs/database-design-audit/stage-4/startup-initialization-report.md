# Startup & Initialization Verification Report

## 1. Startup Flow Architecture
The application initialization sequence in `Backend/Program.cs` and `DbHelper.cs` executes as follows:

```
                  ┌───────────────────────────────┐
                  │    ASP.NET Core Startup       │
                  │        (Program.cs)           │
                  └───────────────┬───────────────┘
                                  │
                 Check CLI Flag (--verify-db)
                                  │
                   ┌──────────────┴──────────────┐
                   │                             │
                   ▼                             ▼
        [Verification Suite Mode]       [Web Server Runtime]
        - Run 12-point checks           - Read appsettings.json
        - Output test diagnostics       - DbHelper.Initialize(config)
        - Clean exit                    - Initialize Provider
                                                 │
                                ┌────────────────┴────────────────┐
                                │                                 │
                                ▼                                 ▼
                     [DatabaseProvider: SQLite]      [DatabaseProvider: PostgreSQL]
                     - SqliteConnectionFactory       - PostgresConnectionFactory
                     - Run SQLite migrations         - Validate PostgreSQL connection
                     - Check PRAGMAs & Integrity     - Ensure default admin user
```

## 2. Startup Verification Diagnostics
- **CLI Diagnostic Mode**: `dotnet run --project Backend/JeevikaERP.csproj -- --verify-db` executes automated verification across SQLite database creation, migration runner, foreign keys, transactions, and society/FY boundaries without launching HTTP listeners.
- **Server Startup Mode**: Starts HTTP API listener at `http://0.0.0.0:5002` with Swagger UI enabled at `/swagger`.
