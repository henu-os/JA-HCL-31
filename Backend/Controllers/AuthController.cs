// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — AuthController
// POST /api/auth/login  → validates credentials → returns JWT
// GET  /api/auth/me     → returns current user info
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly IConfiguration _config;

        public AuthController(IConfiguration config)
        {
            _config = config;
        }

        // ── POST /api/auth/login ──────────────────────────
        [HttpPost("login")]
        [AllowAnonymous]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Username) ||
                string.IsNullOrWhiteSpace(request.Password))
            {
                return BadRequest(new { success = false, message = "Username and password are required." });
            }

            try
            {
                using var conn = DbHelper.GetConn();
                using var cmd  = conn.CreateCommand();

                cmd.CommandText = @"
                    SELECT UserId, UserName, PasswordHash, UserType, UserLevel, Role, IsActive
                    FROM jeevika_erp.SoftUser
                    WHERE UserName = @uname
                      AND IsActive = TRUE
                    LIMIT 1";
                cmd.Parameters.AddWithValue("@uname", request.Username.Trim().ToUpper());

                using var reader = cmd.ExecuteReader();

                if (!reader.Read())
                {
                    return Unauthorized(new { success = false, message = "Invalid username or password." });
                }

                var dbHash    = reader["PasswordHash"].ToString() ?? "";
                var userId    = Convert.ToInt32(reader["UserId"]);
                var userName  = reader["UserName"].ToString()  ?? "";
                var userType  = reader["UserType"].ToString()  ?? "USER";
                var userLevel = reader["UserLevel"].ToString() ?? "1";
                var role      = reader["Role"].ToString()      ?? "StandardUser";

                reader.Close();

                // Verify password using BCrypt
                bool valid = false;
                try
                {
                    valid = BCrypt.Net.BCrypt.Verify(request.Password.Trim(), dbHash);
                }
                catch
                {
                    // Fallback: plain text check (for migration scenarios only)
                    valid = (request.Password.Trim() == dbHash);
                }

                if (!valid)
                {
                    return Unauthorized(new { success = false, message = "Invalid username or password." });
                }

                // Generate JWT token
                var token = GenerateJwtToken(userId, userName, userType, role);

                return Ok(new
                {
                    success  = true,
                    token,
                    userId,
                    userName,
                    userType,
                    userLevel,
                    role
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = "Database error: " + ex.Message
                });
            }
        }

        // ── GET /api/auth/me ──────────────────────────────
        [HttpGet("me")]
        [Authorize]
        public IActionResult Me()
        {
            var name = User.Identity?.Name ?? "";
            return Ok(new { success = true, userName = name });
        }

        // ── GET /api/auth/status ──────────────────────────
        [HttpGet("status")]
        [AllowAnonymous]
        public IActionResult Status()
        {
            var (ok, msg) = DbHelper.TestConnection();
            return Ok(new
            {
                success = true,
                app = "JEEVIKA ERP",
                version = "2.0.0",
                database = ok ? "connected" : "error",
                dbMessage = msg,
                time = DateTime.Now
            });
        }

        // ── JWT Token Generator ───────────────────────────
        private string GenerateJwtToken(int userId, string userName, string userType, string role)
        {
            var secret   = _config["JwtSettings:Secret"] ?? throw new InvalidOperationException("JWT Secret missing");
            var issuer   = _config["JwtSettings:Issuer"]   ?? "JeevikaERP";
            var audience = _config["JwtSettings:Audience"] ?? "JeevikaERPClients";
            var expHours = int.Parse(_config["JwtSettings:ExpiryHours"] ?? "8");

            var key = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(secret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(ClaimTypes.Name,           userName),
                new Claim(ClaimTypes.Role,           role),
                new Claim("userType",                userType)
            };

            var token = new JwtSecurityToken(
                issuer:             issuer,
                audience:           audience,
                claims:             claims,
                expires:            DateTime.UtcNow.AddHours(expHours),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

    // ── Request Model ─────────────────────────────────────
    public class LoginRequest
    {
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
    }
}
