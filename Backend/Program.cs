// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Program.cs
// Application entry point.
// Configures: CORS, JWT Auth, Swagger, Controllers, DB init.
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using JeevikaERP;

// Check for Phase 3 database verification CLI flag
if (args.Length > 0 && args[0] == "--verify-db")
{
    Console.WriteLine("[Verification] Running Phase 3 Database Verification Suite...");
    var baseDir = AppContext.BaseDirectory;
    var rootDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));
    if (!Directory.Exists(Path.Combine(rootDir, "Database")))
    {
        rootDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));
    }
    var testDbPath = Path.Combine(rootDir, "Database", "test_verification.db");
    var migrationsDir = Path.Combine(rootDir, "Database", "Local", "migrations");
    if (!Directory.Exists(migrationsDir))
    {
        migrationsDir = Path.Combine(rootDir, "Database", "migrations", "sqlite");
    }

    var results = JeevikaERP.Database.Integrity.DatabaseVerificationSuite.RunVerification(testDbPath, migrationsDir);
    Console.WriteLine("============================================================");
    Console.WriteLine("DATABASE VERIFICATION TEST RESULTS");
    Console.WriteLine("============================================================");
    bool allPass = true;
    foreach (var r in results)
    {
        Console.WriteLine($"[{r.Status}] {r.TestName}: {r.Details}");
        if (r.Status != "PASS") allPass = false;
    }
    Console.WriteLine("============================================================");
    Console.WriteLine($"Overall Status: {(allPass ? "ALL TESTS PASSED (PASS)" : "TESTS FAILED (FAIL)")}");
    Console.WriteLine("============================================================");
    try { if (File.Exists(testDbPath)) File.Delete(testDbPath); } catch { }
    return;
}

// Check for Stage 7 export/import verification CLI flag
if (args.Length > 0 && args[0] == "--verify-export-import")
{
    Console.WriteLine("[Verification] Running Stage 7 Database Export & Import Verification Suite...");
    var baseDir = AppContext.BaseDirectory;
    var rootDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));
    if (!Directory.Exists(Path.Combine(rootDir, "Database")))
    {
        rootDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));
    }
    var testDbPath = Path.Combine(rootDir, "Database", "test_export_import.db");
    var migrationsDir = Path.Combine(rootDir, "Database", "Local", "migrations");
    if (!Directory.Exists(migrationsDir))
    {
        migrationsDir = Path.Combine(rootDir, "Database", "migrations", "sqlite");
    }

    var results = JeevikaERP.Database.Integrity.ExportImportVerificationSuite.RunVerification(testDbPath, migrationsDir);
    Console.WriteLine("============================================================");
    Console.WriteLine("EXPORT & IMPORT VERIFICATION TEST RESULTS");
    Console.WriteLine("============================================================");
    bool allPass = true;
    foreach (var r in results)
    {
        Console.WriteLine($"[{r.Status}] {r.TestName}: {r.Details}");
        if (r.Status != "PASS") allPass = false;
    }
    Console.WriteLine("============================================================");
    Console.WriteLine($"Overall Status: {(allPass ? "ALL TESTS PASSED (PASS)" : "TESTS FAILED (FAIL)")}");
    Console.WriteLine("============================================================");
    try { if (File.Exists(testDbPath)) File.Delete(testDbPath); } catch { }
    return;
}

// Check for Stage 9 synchronization verification CLI flag
if (args.Length > 0 && args[0] == "--verify-sync")
{
    Console.WriteLine("[Verification] Running Stage 9 Database Synchronization Verification Suite...");
    var baseDir = AppContext.BaseDirectory;
    var rootDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));
    if (!Directory.Exists(Path.Combine(rootDir, "Database")))
    {
        rootDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));
    }
    var testDbPath = Path.Combine(rootDir, "Database", "test_sync.db");
    var migrationsDir = Path.Combine(rootDir, "Database", "Local", "migrations");
    if (!Directory.Exists(migrationsDir))
    {
        migrationsDir = Path.Combine(rootDir, "Database", "migrations", "sqlite");
    }

    var results = JeevikaERP.Database.Integrity.SynchronizationVerificationSuite.RunVerification(testDbPath, migrationsDir);
    Console.WriteLine("============================================================");
    Console.WriteLine("SYNCHRONIZATION VERIFICATION TEST RESULTS");
    Console.WriteLine("============================================================");
    bool allPass = true;
    foreach (var r in results)
    {
        Console.WriteLine($"[{r.Status}] {r.TestName}: {r.Details}");
        if (r.Status != "PASS") allPass = false;
    }
    Console.WriteLine("============================================================");
    Console.WriteLine($"Overall Status: {(allPass ? "ALL TESTS PASSED (PASS)" : "TESTS FAILED (FAIL)")}");
    Console.WriteLine("============================================================");
    try { if (File.Exists(testDbPath)) File.Delete(testDbPath); } catch { }
    return;
}

// Check for Stage 8 universal import/export merge verification CLI flag
if (args.Length > 0 && args[0] == "--verify-import-merge")
{
    Console.WriteLine("[Verification] Running Stage 8 Universal Database Import/Export Merge Verification Suite...");
    var baseDir = AppContext.BaseDirectory;
    var rootDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));
    if (!Directory.Exists(Path.Combine(rootDir, "Database")))
    {
        rootDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));
    }
    var testDbPath = Path.Combine(rootDir, "Database", "test_import_merge.db");
    var migrationsDir = Path.Combine(rootDir, "Database", "Local", "migrations");
    if (!Directory.Exists(migrationsDir))
    {
        migrationsDir = Path.Combine(rootDir, "Database", "migrations", "sqlite");
    }

    var results = JeevikaERP.Database.Integrity.UniversalMergeVerificationSuite.RunVerification(testDbPath, migrationsDir);
    Console.WriteLine("============================================================");
    Console.WriteLine("UNIVERSAL IMPORT & MERGE VERIFICATION TEST RESULTS");
    Console.WriteLine("============================================================");
    bool allPass = true;
    foreach (var r in results)
    {
        Console.WriteLine($"[{r.Status}] {r.TestName}: {r.Details}");
        if (r.Status != "PASS") allPass = false;
    }
    Console.WriteLine("============================================================");
    Console.WriteLine($"Overall Status: {(allPass ? "ALL TESTS PASSED (PASS)" : "TESTS FAILED (FAIL)")}");
    Console.WriteLine("============================================================");
    try { if (File.Exists(testDbPath)) File.Delete(testDbPath); } catch { }
    return;
}

// Check for Financial Year Management & FY-Aware Export/Import verification CLI flag
if (args.Length > 0 && args[0] == "--verify-financial-year")
{
    Console.WriteLine("[Verification] Running Financial Year Management & Universal Export/Import Verification Suite...");
    var baseDir = AppContext.BaseDirectory;
    var rootDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));
    if (!Directory.Exists(Path.Combine(rootDir, "Database")))
    {
        rootDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));
    }
    var testDbPath = Path.Combine(rootDir, "Database", "test_financial_year.db");
    var migrationsDir = Path.Combine(rootDir, "Database", "Local", "migrations");
    if (!Directory.Exists(migrationsDir))
    {
        migrationsDir = Path.Combine(rootDir, "Database", "migrations", "sqlite");
    }

    var results = JeevikaERP.Database.Integrity.FinancialYearVerificationSuite.RunVerification(testDbPath, migrationsDir);
    Console.WriteLine("============================================================");
    Console.WriteLine("FINANCIAL YEAR MANAGEMENT & EXPORT/IMPORT TEST RESULTS");
    Console.WriteLine("============================================================");
    bool allPass = true;
    foreach (var r in results)
    {
        Console.WriteLine($"[{r.Status}] {r.TestName}: {r.Details}");
        if (r.Status != "PASS") allPass = false;
    }
    Console.WriteLine("============================================================");
    Console.WriteLine($"Overall Status: {(allPass ? "ALL TESTS PASSED (PASS)" : "TESTS FAILED (FAIL)")}");
    Console.WriteLine("============================================================");
    try { if (File.Exists(testDbPath)) File.Delete(testDbPath); } catch { }
    return;
}

// Check for Production Database Verification CLI flag
if (args.Length > 0 && args[0] == "--verify-production-db")
{
    Console.WriteLine("[Verification] Running Production Database Verification Suite...");
    var config = new ConfigurationBuilder()
        .SetBasePath(Directory.GetCurrentDirectory())
        .AddJsonFile("appsettings.json", optional: false)
        .AddEnvironmentVariables()
        .Build();

    DbHelper.Initialize(config);
    var results = JeevikaERP.Database.Integrity.ProductionDatabaseVerificationSuite.RunVerification();
    Console.WriteLine("============================================================");
    Console.WriteLine("PRODUCTION DATABASE VERIFICATION RESULTS");
    Console.WriteLine("============================================================");
    bool allPass = true;
    foreach (var r in results)
    {
        Console.WriteLine($"[{r.Status}] {r.CheckName}: {r.Details}");
        if (r.Status != "PASS") allPass = false;
    }
    Console.WriteLine("============================================================");
    Console.WriteLine($"Overall Status: {(allPass ? "ALL CHECKS PASSED (PASS)" : "CHECKS FAILED OR BLOCKED (FAIL/BLOCKED)")}");
    Console.WriteLine("============================================================");
    return;
}

var builder = WebApplication.CreateBuilder(args);

// ── 1. CORS: Allow all origins (file://, null, localhost) ───
builder.Services.AddCors(options =>
{
    options.AddPolicy("JeevikaPolicy", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// ── 2. JWT Authentication ────────────────────────────────────
var jwtSecret = builder.Configuration["JwtSettings:Secret"]
    ?? throw new InvalidOperationException("JwtSettings:Secret not found in appsettings.json");

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme    = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ValidateIssuer = false,
        ValidateAudience = false,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization();
builder.Services.AddControllers();

// ── 3. Swagger ───────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "JEEVIKA ERP API v2",
        Version = "v1",
        Description = "Society Accounting ERP RESTful APIs"
    });

    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: 'Bearer {token}'",
        Name = "Authorization",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// ── 4. Initialize DB connection & auto-schema ────────────────
DbHelper.Initialize(builder.Configuration);

// ── Build App ────────────────────────────────────────────────
var app = builder.Build();

// ── 5. Swagger in Development ────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "JEEVIKA ERP API v2"));
}

// ── 6. Middleware Pipeline ────────────────────────────────────
app.UseCors("JeevikaPolicy");

var rootPath = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, ".."));
if (Directory.Exists(rootPath))
{
    app.UseFileServer(new FileServerOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(rootPath),
        EnableDefaultFiles = true
    });
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// ── 7. Ensure default admin user exists on startup ───────────
var adminUser = builder.Configuration["AppSettings:DefaultAdminUser"] ?? "ADMIN";
var adminPass = builder.Configuration["AppSettings:DefaultAdminPassword"] ?? "ADMIN";

var (dbOk, dbMsg) = DbHelper.TestConnection();
if (dbOk)
{
    Console.WriteLine($"[Startup] ✅ Database connected.");
    DbHelper.EnsureDefaultAdmin(adminUser, adminPass);
}
else
{
    Console.WriteLine($"[Startup] ❌ Database connection failed: {dbMsg}");
    Console.WriteLine("[Startup] Make sure PostgreSQL is running and appsettings.json has correct credentials.");
}

Console.WriteLine($"[Startup] 🚀 JEEVIKA ERP v2 running at http://localhost:5002");
Console.WriteLine($"[Startup] 📚 Swagger UI: http://localhost:5002/swagger");

app.Run("http://0.0.0.0:5002");
