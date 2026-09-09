// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — Program.cs
// Application entry point.
// Configures: CORS, JWT Auth, Swagger, Controllers, DB init.
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using JeevikaERP;

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
