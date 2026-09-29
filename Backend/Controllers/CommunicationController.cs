// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — CommunicationController
// Complete Delivery & Real-Time Configuration Engine for:
// - Mail to Member (9 subfeatures)
// - Mail to Committee (14 reports)
// - Email ID Setting (Real-Time SMTP Configuration)
// - WhatsApp to Member (8 subfeatures)
// - WhatsApp to Committee (14 reports)
// - WhatsApp Setting (Real-Time Meta Cloud API Configuration)
// - Communication Outbox, Queue, Dispatch, Webhooks & Logs
// ═══════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using JeevikaERP.Hubs;
using JeevikaERP.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/communication")]
    [AllowAnonymous]
    public class CommunicationController : ControllerBase
    {
        private static readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        private readonly IHubContext<CommunicationHub>? _hubContext;

        public CommunicationController(IHubContext<CommunicationHub>? hubContext = null)
        {
            _hubContext = hubContext;
        }

        public static string GetSchemaPrefix(DbConnection conn)
        {
            return conn.GetType().Name.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) ? "jeevika_erp." : "";
        }

        public static string GetEncryptionKey()
        {
            var key = Environment.GetEnvironmentVariable("ENCRYPTION_KEY");
            if (string.IsNullOrWhiteSpace(key))
            {
                key = "jeevika_erp_secure_master_key_2026_aes256";
            }
            return key;
        }

        public static string EncryptSecret(string plainText)
        {
            if (string.IsNullOrEmpty(plainText)) return "";
            try
            {
                using var sha = SHA256.Create();
                byte[] keyBytes = sha.ComputeHash(Encoding.UTF8.GetBytes(GetEncryptionKey()));

                using var aes = Aes.Create();
                aes.Key = keyBytes;
                aes.GenerateIV();

                using var encryptor = aes.CreateEncryptor(aes.Key, aes.IV);
                using var ms = new MemoryStream();
                ms.Write(aes.IV, 0, aes.IV.Length); // Prepend 16-byte IV

                using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
                using (var sw = new StreamWriter(cs, Encoding.UTF8))
                {
                    sw.Write(plainText);
                }

                return "ENC:" + Convert.ToBase64String(ms.ToArray());
            }
            catch
            {
                return plainText;
            }
        }

        public static string DecryptSecret(string cipherText)
        {
            if (string.IsNullOrEmpty(cipherText)) return "";
            if (!cipherText.StartsWith("ENC:"))
            {
                return cipherText; // Plain text backwards-compatibility
            }

            try
            {
                string base64 = cipherText.Substring(4);
                byte[] cipherBytes = Convert.FromBase64String(base64);

                using var sha = SHA256.Create();
                byte[] keyBytes = sha.ComputeHash(Encoding.UTF8.GetBytes(GetEncryptionKey()));

                using var aes = Aes.Create();
                aes.Key = keyBytes;

                byte[] iv = new byte[16];
                Array.Copy(cipherBytes, 0, iv, 0, 16);
                aes.IV = iv;

                using var decryptor = aes.CreateDecryptor(aes.Key, aes.IV);
                using var ms = new MemoryStream(cipherBytes, 16, cipherBytes.Length - 16);
                using var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read);
                using var sr = new StreamReader(cs, Encoding.UTF8);

                return sr.ReadToEnd();
            }
            catch
            {
                return cipherText;
            }
        }

        public static string NormalizePhone(string mobile) => NormalizeIndianMobile(mobile);

        private static void AddParam(DbCommand cmd, string name, object? value)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        public static void EnsureCommunicationTables(DbConnection conn)
        {
            try
            {
                using var cmd = conn.CreateCommand();
                string prefix = GetSchemaPrefix(conn);
                bool isSqlite = conn.GetType().Name.Contains("Sqlite", StringComparison.OrdinalIgnoreCase);
                string pk = isSqlite ? "INTEGER PRIMARY KEY AUTOINCREMENT" : "SERIAL PRIMARY KEY";
                string ts = isSqlite ? "DATETIME DEFAULT CURRENT_TIMESTAMP" : "TIMESTAMP DEFAULT CURRENT_TIMESTAMP";

                cmd.CommandText = $@"
                    CREATE TABLE IF NOT EXISTS {prefix}communication_configurations (
                        id {pk},
                        society_id INT NOT NULL,
                        channel VARCHAR(20) NOT NULL,
                        provider_type VARCHAR(50) DEFAULT 'SMTP',
                        smtp_host VARCHAR(255),
                        smtp_port INT DEFAULT 587,
                        smtp_secure VARCHAR(20) DEFAULT 'STARTTLS',
                        smtp_username VARCHAR(255),
                        smtp_password_encrypted TEXT,
                        from_email VARCHAR(255),
                        from_name VARCHAR(255),
                        reply_to VARCHAR(255),
                        waba_id VARCHAR(100),
                        phone_number_id VARCHAR(100),
                        access_token_encrypted TEXT,
                        webhook_verify_token VARCHAR(100),
                        webhook_url TEXT,
                        default_language VARCHAR(20) DEFAULT 'en_US',
                        default_namespace VARCHAR(100),
                        daily_limit INT DEFAULT 1000,
                        rate_limit INT DEFAULT 30,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at {ts},
                        updated_at {ts},
                        UNIQUE(society_id, channel)
                    );

                    CREATE TABLE IF NOT EXISTS {prefix}communication_templates (
                        id {pk},
                        society_id INT NOT NULL,
                        channel VARCHAR(20) NOT NULL,
                        communication_type VARCHAR(50) NOT NULL,
                        template_name VARCHAR(150) NOT NULL,
                        meta_template_id VARCHAR(100),
                        meta_template_name VARCHAR(150),
                        category VARCHAR(50),
                        subject VARCHAR(255),
                        body TEXT NOT NULL,
                        components TEXT,
                        language VARCHAR(20) DEFAULT 'en_US',
                        status VARCHAR(50) DEFAULT 'APPROVED',
                        last_synced_at {ts},
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at {ts},
                        updated_at {ts}
                    );

                    CREATE TABLE IF NOT EXISTS {prefix}communication_conversations (
                        id {pk},
                        society_id INT NOT NULL,
                        member_id INT DEFAULT 0,
                        contact_name VARCHAR(255),
                        phone_number VARCHAR(50) NOT NULL,
                        status VARCHAR(50) DEFAULT 'OPEN',
                        unread_count INT DEFAULT 0,
                        last_message TEXT,
                        last_message_at {ts},
                        assigned_user VARCHAR(100),
                        created_at {ts},
                        updated_at {ts},
                        UNIQUE(society_id, phone_number)
                    );

                    CREATE TABLE IF NOT EXISTS {prefix}communication_messages (
                        id {pk},
                        society_id INT NOT NULL,
                        conversation_id INT NOT NULL,
                        member_id INT DEFAULT 0,
                        committee_id INT DEFAULT 0,
                        phone_number VARCHAR(50) NOT NULL,
                        direction VARCHAR(20) NOT NULL,
                        message_type VARCHAR(50) DEFAULT 'TEXT',
                        body TEXT,
                        template_name VARCHAR(150),
                        template_language VARCHAR(20),
                        media_id VARCHAR(255),
                        media_url TEXT,
                        filename VARCHAR(255),
                        mime_type VARCHAR(100),
                        whatsapp_message_id VARCHAR(255),
                        status VARCHAR(50) DEFAULT 'QUEUED',
                        error_code VARCHAR(100),
                        error_message TEXT,
                        created_at {ts},
                        sent_at {ts},
                        delivered_at {ts},
                        read_at {ts}
                    );

                    CREATE TABLE IF NOT EXISTS {prefix}communication_outbox (
                        id {pk},
                        society_id INT NOT NULL,
                        financial_year_id INT DEFAULT 0,
                        channel VARCHAR(20) NOT NULL,
                        recipient_type VARCHAR(50) NOT NULL,
                        recipient_id INT DEFAULT 0,
                        recipient_name VARCHAR(255),
                        recipient_address VARCHAR(255) NOT NULL,
                        subject VARCHAR(255),
                        message_body TEXT,
                        attachment_path TEXT,
                        attachment_name VARCHAR(255),
                        template_id INT DEFAULT 0,
                        communication_type VARCHAR(50),
                        provider_message_id VARCHAR(255),
                        status VARCHAR(50) DEFAULT 'QUEUED',
                        attempt_count INT DEFAULT 0,
                        last_error TEXT,
                        scheduled_at {ts},
                        sent_at {ts},
                        delivered_at {ts},
                        read_at {ts},
                        created_at {ts},
                        updated_at {ts}
                    );

                    CREATE TABLE IF NOT EXISTS {prefix}communication_logs (
                        id {pk},
                        outbox_id INT,
                        society_id INT NOT NULL,
                        channel VARCHAR(20) NOT NULL,
                        recipient VARCHAR(255) NOT NULL,
                        communication_type VARCHAR(50),
                        provider VARCHAR(50),
                        provider_message_id VARCHAR(255),
                        provider_event_id VARCHAR(255),
                        status VARCHAR(50),
                        response_code VARCHAR(50),
                        error_message TEXT,
                        attempt_count INT DEFAULT 0,
                        is_test BOOLEAN DEFAULT FALSE,
                        created_at {ts}
                    );

                    CREATE TABLE IF NOT EXISTS {prefix}communication_quick_replies (
                        id {pk},
                        society_id INT NOT NULL,
                        name VARCHAR(150) NOT NULL,
                        type VARCHAR(50) DEFAULT 'TEXT',
                        interactive_type VARCHAR(50) DEFAULT 'BUTTONS',
                        body TEXT NOT NULL,
                        header VARCHAR(255),
                        footer VARCHAR(255),
                        list_button_label VARCHAR(100),
                        rows_json TEXT,
                        created_at {ts},
                        updated_at {ts}
                    );

                    CREATE INDEX IF NOT EXISTS idx_comm_conv_soc ON {prefix}communication_conversations (society_id, phone_number);
                    CREATE INDEX IF NOT EXISTS idx_comm_msg_conv ON {prefix}communication_messages (conversation_id, created_at);
                    CREATE INDEX IF NOT EXISTS idx_comm_msg_wamid ON {prefix}communication_messages (whatsapp_message_id);
                    CREATE INDEX IF NOT EXISTS idx_comm_outbox_st ON {prefix}communication_outbox (status, channel);";
                cmd.ExecuteNonQuery();

                // Column migrations for previously created tables
                if (!isSqlite)
                {
                    try
                    {
                        using var migCmd = conn.CreateCommand();
                        migCmd.CommandText = $@"
                            ALTER TABLE {prefix}communication_templates ADD COLUMN IF NOT EXISTS meta_template_id VARCHAR(100);
                            ALTER TABLE {prefix}communication_templates ADD COLUMN IF NOT EXISTS meta_template_name VARCHAR(150);
                            ALTER TABLE {prefix}communication_templates ADD COLUMN IF NOT EXISTS category VARCHAR(50);
                            ALTER TABLE {prefix}communication_templates ADD COLUMN IF NOT EXISTS components TEXT;
                            ALTER TABLE {prefix}communication_templates ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'APPROVED';
                            ALTER TABLE {prefix}communication_templates ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
                        ";
                        migCmd.ExecuteNonQuery();
                    }
                    catch { }
                }
            }
            catch { }
        }

        // ═══════════════════════════════════════════════════════════
        // 1. EMAIL CONFIGURATION & TESTING
        // ═══════════════════════════════════════════════════════════

        public class EmailConfigRequest
        {
            public int SocietyId { get; set; } = 1;
            public string ProviderType { get; set; } = "SMTP";
            public string SmtpHost { get; set; } = "";
            public int SmtpPort { get; set; } = 587;
            public string SmtpSecure { get; set; } = "STARTTLS";
            public string SmtpUsername { get; set; } = "";
            public string? SmtpPassword { get; set; }
            public string FromEmail { get; set; } = "";
            public string FromName { get; set; } = "";
            public string? ReplyTo { get; set; }
            public int DailyLimit { get; set; } = 1000;
            public int RateLimit { get; set; } = 30;
            public bool IsActive { get; set; } = true;
        }

        [HttpGet("email/config")]
        public IActionResult GetEmailConfig([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT id, society_id, provider_type, smtp_host, smtp_port, smtp_secure,
                           smtp_username, smtp_password_encrypted, from_email, from_name, reply_to,
                           daily_limit, rate_limit, is_active, updated_at
                    FROM {prefix}communication_configurations
                    WHERE society_id = @sid AND channel = 'EMAIL'";
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);

                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    bool hasPass = !string.IsNullOrEmpty(r["smtp_password_encrypted"]?.ToString());
                    return Ok(new
                    {
                        success = true,
                        data = new
                        {
                            societyId = Convert.ToInt32(r["society_id"]),
                            providerType = r["provider_type"]?.ToString() ?? "SMTP",
                            smtpHost = r["smtp_host"]?.ToString() ?? "",
                            smtpPort = Convert.ToInt32(r["smtp_port"]),
                            smtpSecure = r["smtp_secure"]?.ToString() ?? "STARTTLS",
                            smtpUsername = r["smtp_username"]?.ToString() ?? "",
                            passwordConfigured = hasPass,
                            fromEmail = r["from_email"]?.ToString() ?? "",
                            fromName = r["from_name"]?.ToString() ?? "",
                            replyTo = r["reply_to"]?.ToString() ?? "",
                            dailyLimit = Convert.ToInt32(r["daily_limit"]),
                            rateLimit = Convert.ToInt32(r["rate_limit"]),
                            isActive = Convert.ToBoolean(r["is_active"]),
                            updatedAt = r["updated_at"] is DateTime dt ? dt.ToString("yyyy-MM-dd HH:mm:ss") : ""
                        }
                    });
                }

                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        societyId = societyId > 0 ? societyId : 1,
                        providerType = "SMTP",
                        smtpHost = "",
                        smtpPort = 587,
                        smtpSecure = "STARTTLS",
                        smtpUsername = "",
                        passwordConfigured = false,
                        fromEmail = "",
                        fromName = "",
                        replyTo = "",
                        dailyLimit = 1000,
                        rateLimit = 30,
                        isActive = true
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load email configuration: " + ex.Message });
            }
        }

        [HttpPost("email/config")]
        public IActionResult SaveEmailConfig([FromBody] EmailConfigRequest req)
        {
            if (req == null || req.SocietyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            if (string.IsNullOrWhiteSpace(req.SmtpHost) || string.IsNullOrWhiteSpace(req.FromEmail))
                return BadRequest(new { success = false, message = "SMTP Host and From Email are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                // Check existing password if not updated
                string existingPass = "";
                using (var chk = conn.CreateCommand())
                {
                    chk.CommandText = $"SELECT smtp_password_encrypted FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'EMAIL'";
                    AddParam(chk, "@sid", req.SocietyId);
                    var exObj = chk.ExecuteScalar();
                    if (exObj != null) existingPass = exObj.ToString() ?? "";
                }

                string passToSave = !string.IsNullOrWhiteSpace(req.SmtpPassword) ? EncryptSecret(req.SmtpPassword) : existingPass;

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}communication_configurations
                        (society_id, channel, provider_type, smtp_host, smtp_port, smtp_secure,
                         smtp_username, smtp_password_encrypted, from_email, from_name, reply_to,
                         daily_limit, rate_limit, is_active, updated_at)
                    VALUES
                        (@sid, 'EMAIL', @prov, @host, @port, @sec, @user, @pass, @fromE, @fromN, @reply, @dLim, @rLim, @act, CURRENT_TIMESTAMP)
                    ON CONFLICT(society_id, channel)
                    DO UPDATE SET
                        provider_type = EXCLUDED.provider_type,
                        smtp_host = EXCLUDED.smtp_host,
                        smtp_port = EXCLUDED.smtp_port,
                        smtp_secure = EXCLUDED.smtp_secure,
                        smtp_username = EXCLUDED.smtp_username,
                        smtp_password_encrypted = EXCLUDED.smtp_password_encrypted,
                        from_email = EXCLUDED.from_email,
                        from_name = EXCLUDED.from_name,
                        reply_to = EXCLUDED.reply_to,
                        daily_limit = EXCLUDED.daily_limit,
                        rate_limit = EXCLUDED.rate_limit,
                        is_active = EXCLUDED.is_active,
                        updated_at = CURRENT_TIMESTAMP";

                AddParam(cmd, "@sid", req.SocietyId);
                AddParam(cmd, "@prov", req.ProviderType ?? "SMTP");
                AddParam(cmd, "@host", req.SmtpHost.Trim());
                AddParam(cmd, "@port", req.SmtpPort > 0 ? req.SmtpPort : 587);
                AddParam(cmd, "@sec", req.SmtpSecure ?? "STARTTLS");
                AddParam(cmd, "@user", req.SmtpUsername?.Trim() ?? "");
                AddParam(cmd, "@pass", passToSave);
                AddParam(cmd, "@fromE", req.FromEmail.Trim());
                AddParam(cmd, "@fromN", req.FromName?.Trim() ?? "");
                AddParam(cmd, "@reply", req.ReplyTo?.Trim() ?? req.FromEmail.Trim());
                AddParam(cmd, "@dLim", req.DailyLimit > 0 ? req.DailyLimit : 1000);
                AddParam(cmd, "@rLim", req.RateLimit > 0 ? req.RateLimit : 30);
                AddParam(cmd, "@act", req.IsActive);

                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Email configuration saved successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to save email configuration: " + ex.Message });
            }
        }

        [HttpDelete("email/config")]
        public IActionResult DeleteEmailConfig([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"DELETE FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'EMAIL'";
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Email configuration reset successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to delete email configuration: " + ex.Message });
            }
        }

        public class EmailTestConnectionRequest
        {
            public int SocietyId { get; set; } = 1;
            public string? SmtpHost { get; set; }
            public int SmtpPort { get; set; } = 587;
            public string? SmtpSecure { get; set; }
            public string? SmtpUsername { get; set; }
            public string? SmtpPassword { get; set; }
        }

        [HttpPost("email/test-connection")]
        public async Task<IActionResult> TestEmailConnection([FromBody] EmailTestConnectionRequest req)
        {
            try
            {
                string host = req.SmtpHost ?? "";
                int port = req.SmtpPort > 0 ? req.SmtpPort : 587;
                string secure = req.SmtpSecure ?? "STARTTLS";
                string user = req.SmtpUsername ?? "";
                string pass = req.SmtpPassword ?? "";

                // If not provided in body, load from DB
                if (string.IsNullOrWhiteSpace(host) && req.SocietyId > 0)
                {
                    using var conn = DbHelper.GetConn();
                    EnsureCommunicationTables(conn);
                    string prefix = GetSchemaPrefix(conn);
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = $"SELECT smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password_encrypted FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'EMAIL'";
                    AddParam(cmd, "@sid", req.SocietyId);
                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        host = r["smtp_host"]?.ToString() ?? "";
                        port = Convert.ToInt32(r["smtp_port"]);
                        secure = r["smtp_secure"]?.ToString() ?? "STARTTLS";
                        user = r["smtp_username"]?.ToString() ?? "";
                        pass = r["smtp_password_encrypted"]?.ToString() ?? "";
                    }
                }

                pass = DecryptSecret(pass);

                if (string.IsNullOrWhiteSpace(host))
                    return BadRequest(new { success = false, message = "SMTP host is required for testing connection." });

                using var client = new SmtpClient(host, port);
                client.EnableSsl = secure.Equals("SSL", StringComparison.OrdinalIgnoreCase) || secure.Equals("STARTTLS", StringComparison.OrdinalIgnoreCase) || port == 465 || port == 587;
                client.Timeout = 10000;
                if (!string.IsNullOrWhiteSpace(user))
                {
                    client.Credentials = new NetworkCredential(user, pass);
                }

                // Verify TCP / socket reachability
                using var tcpClient = new System.Net.Sockets.TcpClient();
                var connectTask = tcpClient.ConnectAsync(host, port);
                if (await Task.WhenAny(connectTask, Task.Delay(5000)) != connectTask)
                {
                    return Ok(new { success = false, message = $"Connection timed out connecting to {host}:{port}." });
                }

                return Ok(new
                {
                    success = true,
                    message = $"SMTP server '{host}:{port}' is reachable and responded to connection test.",
                    host,
                    port,
                    sslEnabled = client.EnableSsl
                });
            }
            catch (Exception ex)
            {
                return Ok(new { success = false, message = "SMTP Connection test failed: " + ex.Message });
            }
        }

        public class EmailTestSendRequest
        {
            public int SocietyId { get; set; } = 1;
            public string Recipient { get; set; } = "";
            public string Subject { get; set; } = "JEEVIKA ERP — Email Configuration Test";
            public string Message { get; set; } = "This is a real-time verification email sent from JEEVIKA ERP.";
        }

        [HttpPost("email/test-send")]
        public async Task<IActionResult> TestEmailSend([FromBody] EmailTestSendRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Recipient))
                return BadRequest(new { success = false, message = "Recipient email address is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                string host = "", user = "", pass = "", fromEmail = "", fromName = "", secure = "STARTTLS";
                int port = 587;

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password_encrypted, from_email, from_name
                        FROM {prefix}communication_configurations
                        WHERE society_id = @sid AND channel = 'EMAIL' AND is_active = TRUE";
                    AddParam(cmd, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        host = r["smtp_host"]?.ToString() ?? "";
                        port = Convert.ToInt32(r["smtp_port"]);
                        secure = r["smtp_secure"]?.ToString() ?? "STARTTLS";
                        user = r["smtp_username"]?.ToString() ?? "";
                        pass = r["smtp_password_encrypted"]?.ToString() ?? "";
                        fromEmail = r["from_email"]?.ToString() ?? "";
                        fromName = r["from_name"]?.ToString() ?? "JEEVIKA ERP";
                    }
                }

                pass = DecryptSecret(pass);

                if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(fromEmail))
                {
                    return BadRequest(new { success = false, message = "Email is not configured or is inactive. Please configure SMTP settings first." });
                }

                using var mailMsg = new MailMessage();
                mailMsg.From = new MailAddress(fromEmail, fromName);
                mailMsg.To.Add(req.Recipient);
                mailMsg.Subject = req.Subject;
                mailMsg.Body = $@"
                    <div style='font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px;'>
                        <h2 style='color: #1565C0; margin-top: 0;'>JEEVIKA ERP — Email Verification</h2>
                        <p>{WebUtility.HtmlEncode(req.Message)}</p>
                        <hr style='border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;'>
                        <p style='font-size: 12px; color: #64748b;'>Society ID: {req.SocietyId} | Dispatched: {DateTime.Now:yyyy-MM-dd HH:mm:ss}</p>
                    </div>";
                mailMsg.IsBodyHtml = true;

                using var smtp = new SmtpClient(host, port);
                smtp.EnableSsl = secure.Equals("SSL", StringComparison.OrdinalIgnoreCase) || secure.Equals("STARTTLS", StringComparison.OrdinalIgnoreCase) || port == 465 || port == 587;
                smtp.Timeout = 15000;
                if (!string.IsNullOrWhiteSpace(user))
                {
                    smtp.Credentials = new NetworkCredential(user, pass);
                }

                await smtp.SendMailAsync(mailMsg);

                // Log test activity
                using (var logCmd = conn.CreateCommand())
                {
                    logCmd.CommandText = $@"
                        INSERT INTO {prefix}communication_logs
                            (society_id, channel, recipient, communication_type, provider, status, response_code, is_test)
                        VALUES
                            (@sid, 'EMAIL', @rec, 'TEST_EMAIL', 'SMTP', 'SENT', '250', TRUE)";
                    AddParam(logCmd, "@sid", req.SocietyId);
                    AddParam(logCmd, "@rec", req.Recipient);
                    logCmd.ExecuteNonQuery();
                }

                return Ok(new
                {
                    success = true,
                    message = $"Test email successfully sent to '{req.Recipient}' via {host}:{port}."
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to send test email: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 2. WHATSAPP CONFIGURATION & TESTING (Meta Cloud API)
        // ═══════════════════════════════════════════════════════════

        public class WhatsAppConfigRequest
        {
            public int SocietyId { get; set; } = 1;
            public string ProviderType { get; set; } = "META_CLOUD";
            public string WabaId { get; set; } = "";
            public string PhoneNumberId { get; set; } = "";
            public string? AccessToken { get; set; }
            public string WebhookVerifyToken { get; set; } = "HENUOS2025";
            public string? WebhookUrl { get; set; }
            public string DefaultLanguage { get; set; } = "en_US";
            public string? DefaultNamespace { get; set; }
            public int DailyLimit { get; set; } = 1000;
            public int RateLimit { get; set; } = 30;
            public bool IsActive { get; set; } = true;
        }

        [HttpGet("whatsapp/config")]
        public IActionResult GetWhatsAppConfig([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT id, society_id, provider_type, waba_id, phone_number_id, access_token_encrypted,
                           webhook_verify_token, webhook_url, default_language, default_namespace,
                           daily_limit, rate_limit, is_active, updated_at
                    FROM {prefix}communication_configurations
                    WHERE society_id = @sid AND channel = 'WHATSAPP'";
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);

                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    bool hasToken = !string.IsNullOrEmpty(r["access_token_encrypted"]?.ToString());
                    return Ok(new
                    {
                        success = true,
                        data = new
                        {
                            societyId = Convert.ToInt32(r["society_id"]),
                            providerType = r["provider_type"]?.ToString() ?? "META_CLOUD",
                            wabaId = r["waba_id"]?.ToString() ?? "",
                            phoneNumberId = r["phone_number_id"]?.ToString() ?? "",
                            tokenConfigured = hasToken,
                            webhookVerifyToken = r["webhook_verify_token"]?.ToString() ?? "jeevika_verify_2026",
                            webhookUrl = r["webhook_url"]?.ToString() ?? "http://localhost:5002/api/communication/webhook/whatsapp",
                            defaultLanguage = r["default_language"]?.ToString() ?? "en_US",
                            defaultNamespace = r["default_namespace"]?.ToString() ?? "",
                            dailyLimit = Convert.ToInt32(r["daily_limit"]),
                            rateLimit = Convert.ToInt32(r["rate_limit"]),
                            isActive = Convert.ToBoolean(r["is_active"]),
                            updatedAt = r["updated_at"] is DateTime dt ? dt.ToString("yyyy-MM-dd HH:mm:ss") : ""
                        }
                    });
                }

                return Ok(new
                {
                    success = true,
                    data = new
                    {
                        societyId = societyId > 0 ? societyId : 1,
                        providerType = "META_CLOUD",
                        wabaId = "",
                        phoneNumberId = "",
                        tokenConfigured = false,
                        webhookVerifyToken = "jeevika_verify_2026",
                        webhookUrl = "http://localhost:5002/api/communication/webhook/whatsapp",
                        defaultLanguage = "en_US",
                        defaultNamespace = "",
                        dailyLimit = 1000,
                        rateLimit = 30,
                        isActive = true
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load WhatsApp configuration: " + ex.Message });
            }
        }

        [HttpPost("whatsapp/config")]
        public async Task<IActionResult> SaveWhatsAppConfig([FromBody] WhatsAppConfigRequest req)
        {
            if (req == null || req.SocietyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            if (string.IsNullOrWhiteSpace(req.PhoneNumberId))
                return BadRequest(new { success = false, message = "Phone Number ID is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                string existingToken = "";
                using (var chk = conn.CreateCommand())
                {
                    chk.CommandText = $"SELECT access_token_encrypted FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'WHATSAPP'";
                    AddParam(chk, "@sid", req.SocietyId);
                    var exObj = chk.ExecuteScalar();
                    if (exObj != null) existingToken = exObj.ToString() ?? "";
                }

                string tokenToSave = !string.IsNullOrWhiteSpace(req.AccessToken) ? EncryptSecret(req.AccessToken) : existingToken;

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}communication_configurations
                        (society_id, channel, provider_type, waba_id, phone_number_id, access_token_encrypted,
                         webhook_verify_token, webhook_url, default_language, default_namespace,
                         daily_limit, rate_limit, is_active, updated_at)
                    VALUES
                        (@sid, 'WHATSAPP', @prov, @waba, @phone, @token, @wToken, @wUrl, @lang, @ns, @dLim, @rLim, @act, CURRENT_TIMESTAMP)
                    ON CONFLICT(society_id, channel)
                    DO UPDATE SET
                        provider_type = EXCLUDED.provider_type,
                        waba_id = EXCLUDED.waba_id,
                        phone_number_id = EXCLUDED.phone_number_id,
                        access_token_encrypted = EXCLUDED.access_token_encrypted,
                        webhook_verify_token = EXCLUDED.webhook_verify_token,
                        webhook_url = EXCLUDED.webhook_url,
                        default_language = EXCLUDED.default_language,
                        default_namespace = EXCLUDED.default_namespace,
                        daily_limit = EXCLUDED.daily_limit,
                        rate_limit = EXCLUDED.rate_limit,
                        is_active = EXCLUDED.is_active,
                        updated_at = CURRENT_TIMESTAMP";

                AddParam(cmd, "@sid", req.SocietyId);
                AddParam(cmd, "@prov", req.ProviderType ?? "META_CLOUD");
                AddParam(cmd, "@waba", req.WabaId?.Trim() ?? "");
                AddParam(cmd, "@phone", req.PhoneNumberId.Trim());
                AddParam(cmd, "@token", tokenToSave);
                AddParam(cmd, "@wToken", req.WebhookVerifyToken?.Trim() ?? "jeevika_verify_2026");
                AddParam(cmd, "@wUrl", req.WebhookUrl?.Trim() ?? "http://localhost:5002/api/communication/webhook/whatsapp");
                AddParam(cmd, "@lang", req.DefaultLanguage ?? "en_US");
                AddParam(cmd, "@ns", req.DefaultNamespace?.Trim() ?? "");
                AddParam(cmd, "@dLim", req.DailyLimit > 0 ? req.DailyLimit : 1000);
                AddParam(cmd, "@rLim", req.RateLimit > 0 ? req.RateLimit : 30);
                AddParam(cmd, "@act", req.IsActive);

                cmd.ExecuteNonQuery();

                // Broadcast real-time configuration change via SignalR
                if (_hubContext != null)
                {
                    await _hubContext.Clients.Group($"society_{req.SocietyId}").SendAsync("WhatsAppConfigurationChanged", new
                    {
                        societyId = req.SocietyId,
                        configured = true,
                        phoneNumberId = req.PhoneNumberId,
                        wabaId = req.WabaId ?? "",
                        updatedAt = DateTime.UtcNow.ToString("o")
                    });
                }

                return Ok(new { success = true, message = "WhatsApp configuration saved successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to save WhatsApp configuration: " + ex.Message });
            }
        }

        [HttpDelete("whatsapp/config")]
        public async Task<IActionResult> DeleteWhatsAppConfig([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"DELETE FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'WHATSAPP'";
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                cmd.ExecuteNonQuery();

                if (_hubContext != null)
                {
                    await _hubContext.Clients.Group($"society_{societyId}").SendAsync("WhatsAppConfigurationChanged", new
                    {
                        societyId = societyId,
                        configured = false,
                        updatedAt = DateTime.UtcNow.ToString("o")
                    });
                }

                return Ok(new { success = true, message = "WhatsApp configuration reset successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to delete WhatsApp configuration: " + ex.Message });
            }
        }

        public class WhatsAppTestSendRequest
        {
            public int SocietyId { get; set; } = 1;
            public string RecipientMobile { get; set; } = "";
            public string MessageText { get; set; } = "Hello from JEEVIKA ERP! WhatsApp Cloud API integration is active.";
        }

        [HttpPost("whatsapp/test-connection")]
        public async Task<IActionResult> TestWhatsAppConnection([FromBody] WhatsAppConfigRequest req)
        {
            try
            {
                string phoneId = req.PhoneNumberId;
                string token = req.AccessToken ?? "";

                if ((string.IsNullOrWhiteSpace(phoneId) || string.IsNullOrWhiteSpace(token)) && req.SocietyId > 0)
                {
                    using var conn = DbHelper.GetConn();
                    EnsureCommunicationTables(conn);
                    string prefix = GetSchemaPrefix(conn);
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = $"SELECT phone_number_id, access_token_encrypted FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'WHATSAPP'";
                    AddParam(cmd, "@sid", req.SocietyId);
                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        if (string.IsNullOrWhiteSpace(phoneId)) phoneId = r["phone_number_id"]?.ToString() ?? "";
                        if (string.IsNullOrWhiteSpace(token)) token = r["access_token_encrypted"]?.ToString() ?? "";
                    }
                }

                token = DecryptSecret(token);

                if (string.IsNullOrWhiteSpace(phoneId))
                    return BadRequest(new { success = false, message = "Phone Number ID is required." });

                var version = Environment.GetEnvironmentVariable("META_GRAPH_API_VERSION") ?? "v21.0";
                var url = $"https://graph.facebook.com/{version}/{phoneId}";
                using var reqMsg = new HttpRequestMessage(HttpMethod.Get, url);
                if (!string.IsNullOrWhiteSpace(token))
                {
                    reqMsg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                }

                var res = await _httpClient.SendAsync(reqMsg);
                var content = await res.Content.ReadAsStringAsync();

                if (res.IsSuccessStatusCode)
                {
                    return Ok(new
                    {
                        success = true,
                        message = "Successfully connected to WhatsApp Cloud API.",
                        details = JsonSerializer.Deserialize<object>(content)
                    });
                }
                else
                {
                    return Ok(new
                    {
                        success = false,
                        message = $"WhatsApp Cloud API responded with status {res.StatusCode}.",
                        response = content
                    });
                }
            }
            catch (Exception ex)
            {
                return Ok(new { success = false, message = "WhatsApp connection test failed: " + ex.Message });
            }
        }

        [HttpPost("whatsapp/test-send")]
        public async Task<IActionResult> TestWhatsAppSend([FromBody] WhatsAppTestSendRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.RecipientMobile))
                return BadRequest(new { success = false, message = "Recipient mobile number is required." });

            string normNumber = NormalizeIndianMobile(req.RecipientMobile);
            if (string.IsNullOrWhiteSpace(normNumber))
                return BadRequest(new { success = false, message = "Invalid mobile number format. Please provide a valid 10-digit number." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                string phoneId = "", token = "";
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT phone_number_id, access_token_encrypted FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'WHATSAPP' AND is_active = TRUE";
                    AddParam(cmd, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        phoneId = r["phone_number_id"]?.ToString() ?? "";
                        token = r["access_token_encrypted"]?.ToString() ?? "";
                    }
                }

                token = DecryptSecret(token);

                if (string.IsNullOrWhiteSpace(phoneId) || string.IsNullOrWhiteSpace(token))
                {
                    return BadRequest(new { success = false, message = "WhatsApp Cloud API is not configured or active. Please save credentials first." });
                }

                var payload = new
                {
                    messaging_product = "whatsapp",
                    to = normNumber,
                    type = "text",
                    text = new { body = req.MessageText }
                };

                var json = JsonSerializer.Serialize(payload);
                var url = $"https://graph.facebook.com/v20.0/{phoneId}/messages";

                using var reqMsg = new HttpRequestMessage(HttpMethod.Post, url);
                reqMsg.Headers.Add("Authorization", $"Bearer {token}");
                reqMsg.Content = new StringContent(json, Encoding.UTF8, "application/json");

                var res = await _httpClient.SendAsync(reqMsg);
                var responseContent = await res.Content.ReadAsStringAsync();

                string provId = "";
                try
                {
                    using var doc = JsonDocument.Parse(responseContent);
                    if (doc.RootElement.TryGetProperty("messages", out var msgs) && msgs.GetArrayLength() > 0)
                    {
                        provId = msgs[0].GetProperty("id").GetString() ?? "";
                    }
                }
                catch { }

                using (var logCmd = conn.CreateCommand())
                {
                    logCmd.CommandText = $@"
                        INSERT INTO {prefix}communication_logs
                            (society_id, channel, recipient, communication_type, provider, provider_message_id, status, response_code, is_test)
                        VALUES
                            (@sid, 'WHATSAPP', @rec, 'TEST_WHATSAPP', 'META_CLOUD', @pid, @st, @rc, TRUE)";
                    AddParam(logCmd, "@sid", req.SocietyId);
                    AddParam(logCmd, "@rec", normNumber);
                    AddParam(logCmd, "@pid", provId);
                    AddParam(logCmd, "@st", res.IsSuccessStatusCode ? "SENT" : "FAILED");
                    AddParam(logCmd, "@rc", ((int)res.StatusCode).ToString());
                    logCmd.ExecuteNonQuery();
                }

                if (res.IsSuccessStatusCode)
                {
                    // Create conversation and message entry for shared inbox
                    int convId = EnsureConversationInternal(conn, prefix, req.SocietyId, 0, normNumber, normNumber);
                    InsertMessageInternal(conn, prefix, req.SocietyId, convId, 0, normNumber, "OUTBOUND", "TEXT", req.MessageText, provId, "SENT");

                    if (_hubContext != null)
                    {
                        await _hubContext.Clients.Group($"society_{req.SocietyId}").SendAsync("WhatsAppMessageSent", new
                        {
                            conversationId = convId,
                            recipient = normNumber,
                            providerMessageId = provId,
                            status = "SENT",
                            body = req.MessageText,
                            timestamp = DateTime.UtcNow.ToString("o")
                        });
                    }

                    return Ok(new
                    {
                        success = true,
                        message = $"Test WhatsApp message dispatched successfully to {normNumber}.",
                        providerMessageId = provId
                    });
                }
                else
                {
                    return Ok(new
                    {
                        success = false,
                        message = $"Meta API Error (HTTP {res.StatusCode}): {responseContent}"
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to send WhatsApp message: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 2B. WHATSAPP TEMPLATES MANAGEMENT & META SYNC
        // ═══════════════════════════════════════════════════════════

        public class TemplateDto
        {
            public int Id { get; set; }
            public int SocietyId { get; set; } = 1;
            public string Channel { get; set; } = "WHATSAPP";
            public string CommunicationType { get; set; } = "GENERAL";
            public string TemplateName { get; set; } = "";
            public string? MetaTemplateId { get; set; }
            public string? MetaTemplateName { get; set; }
            public string? Category { get; set; } = "UTILITY";
            public string? Subject { get; set; }
            public string Body { get; set; } = "";
            public string? Components { get; set; }
            public string Language { get; set; } = "en_US";
            public string Status { get; set; } = "APPROVED";
            public bool IsActive { get; set; } = true;
        }

        [HttpGet("whatsapp/templates")]
        public IActionResult GetWhatsAppTemplates([FromQuery] int societyId = 1, [FromQuery] string? category = null, [FromQuery] string? status = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT id, society_id, channel, communication_type, template_name, meta_template_id,
                           meta_template_name, category, subject, body, components, language, status,
                           last_synced_at, is_active, updated_at
                    FROM {prefix}communication_templates
                    WHERE society_id = @sid AND channel = 'WHATSAPP'";

                if (!string.IsNullOrWhiteSpace(category) && category != "ALL")
                {
                    sql += " AND category = @cat";
                    AddParam(cmd, "@cat", category);
                }
                if (!string.IsNullOrWhiteSpace(status) && status != "ALL")
                {
                    sql += " AND status = @st";
                    AddParam(cmd, "@st", status);
                }

                sql += " ORDER BY id DESC";
                cmd.CommandText = sql;
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        id = Convert.ToInt32(r["id"]),
                        societyId = Convert.ToInt32(r["society_id"]),
                        templateName = r["template_name"]?.ToString() ?? "",
                        metaTemplateId = r["meta_template_id"]?.ToString() ?? "",
                        metaTemplateName = r["meta_template_name"]?.ToString() ?? "",
                        category = r["category"]?.ToString() ?? "UTILITY",
                        communicationType = r["communication_type"]?.ToString() ?? "GENERAL",
                        subject = r["subject"]?.ToString() ?? "",
                        body = r["body"]?.ToString() ?? "",
                        components = r["components"]?.ToString() ?? "",
                        language = r["language"]?.ToString() ?? "en_US",
                        status = r["status"]?.ToString() ?? "APPROVED",
                        lastSyncedAt = r["last_synced_at"] is DateTime sdt ? sdt.ToString("yyyy-MM-dd HH:mm:ss") : "",
                        isActive = Convert.ToBoolean(r["is_active"]),
                        updatedAt = r["updated_at"] is DateTime udt ? udt.ToString("yyyy-MM-dd HH:mm:ss") : ""
                    });
                }

                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load templates: " + ex.Message });
            }
        }

        [HttpPost("whatsapp/templates")]
        public async Task<IActionResult> SaveWhatsAppTemplate([FromBody] TemplateDto req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.TemplateName) || string.IsNullOrWhiteSpace(req.Body))
                return BadRequest(new { success = false, message = "Template name and body are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                if (req.Id > 0)
                {
                    cmd.CommandText = $@"
                        UPDATE {prefix}communication_templates
                        SET template_name = @tname, communication_type = @ctype, category = @cat,
                            subject = @sub, body = @body, components = @comp, language = @lang,
                            status = @st, is_active = @act, updated_at = CURRENT_TIMESTAMP
                        WHERE id = @id AND society_id = @sid";
                    AddParam(cmd, "@id", req.Id);
                }
                else
                {
                    cmd.CommandText = $@"
                        INSERT INTO {prefix}communication_templates
                            (society_id, channel, communication_type, template_name, meta_template_name,
                             category, subject, body, components, language, status, is_active, updated_at)
                        VALUES
                            (@sid, 'WHATSAPP', @ctype, @tname, @mname, @cat, @sub, @body, @comp, @lang, @st, @act, CURRENT_TIMESTAMP)";
                    AddParam(cmd, "@mname", req.MetaTemplateName ?? req.TemplateName);
                }

                AddParam(cmd, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                AddParam(cmd, "@tname", req.TemplateName.Trim());
                AddParam(cmd, "@ctype", req.CommunicationType ?? "GENERAL");
                AddParam(cmd, "@cat", req.Category ?? "UTILITY");
                AddParam(cmd, "@sub", req.Subject ?? "");
                AddParam(cmd, "@body", req.Body);
                AddParam(cmd, "@comp", req.Components ?? "");
                AddParam(cmd, "@lang", req.Language ?? "en_US");
                AddParam(cmd, "@st", req.Status ?? "APPROVED");
                AddParam(cmd, "@act", req.IsActive);

                cmd.ExecuteNonQuery();

                if (_hubContext != null)
                {
                    await _hubContext.Clients.Group($"society_{req.SocietyId}").SendAsync("WhatsAppTemplateUpdated", new
                    {
                        societyId = req.SocietyId,
                        templateName = req.TemplateName,
                        status = req.Status
                    });
                }

                return Ok(new { success = true, message = "Template saved successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to save template: " + ex.Message });
            }
        }

        [HttpDelete("whatsapp/templates/{id:int}")]
        public IActionResult DeleteWhatsAppTemplate(int id, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"DELETE FROM {prefix}communication_templates WHERE id = @id AND society_id = @sid";
                AddParam(cmd, "@id", id);
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Template deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to delete template: " + ex.Message });
            }
        }

        [HttpPost("whatsapp/templates/sync")]
        public async Task<IActionResult> SyncTemplatesFromMeta([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                string wabaId = "", token = "";
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT waba_id, access_token_encrypted FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'WHATSAPP' AND is_active = TRUE";
                    AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        wabaId = r["waba_id"]?.ToString() ?? "";
                        token = r["access_token_encrypted"]?.ToString() ?? "";
                    }
                }

                token = DecryptSecret(token);

                if (string.IsNullOrWhiteSpace(wabaId) || string.IsNullOrWhiteSpace(token))
                {
                    return BadRequest(new { success = false, message = "WhatsApp Business Account ID (WABA ID) or Access Token is missing. Please configure them in WhatsApp Settings." });
                }

                var url = $"https://graph.facebook.com/v20.0/{wabaId}/message_templates?limit=100";
                using var reqMsg = new HttpRequestMessage(HttpMethod.Get, url);
                reqMsg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var res = await _httpClient.SendAsync(reqMsg);
                var content = await res.Content.ReadAsStringAsync();

                if (!res.IsSuccessStatusCode)
                {
                    return Ok(new { success = false, message = $"Failed to sync from Meta: {content}" });
                }

                int syncedCount = 0;
                using (var doc = JsonDocument.Parse(content))
                {
                    if (doc.RootElement.TryGetProperty("data", out var templates) && templates.GetArrayLength() > 0)
                    {
                        foreach (var t in templates.EnumerateArray())
                        {
                            string tId = t.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
                            string tName = t.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "" : "";
                            string status = t.TryGetProperty("status", out var stProp) ? stProp.GetString() ?? "APPROVED" : "APPROVED";
                            string category = t.TryGetProperty("category", out var catProp) ? catProp.GetString() ?? "UTILITY" : "UTILITY";
                            string lang = t.TryGetProperty("language", out var langProp) ? langProp.GetString() ?? "en_US" : "en_US";

                            string bodyText = "";
                            string componentsJson = "";
                            if (t.TryGetProperty("components", out var comps))
                            {
                                componentsJson = comps.GetRawText();
                                foreach (var comp in comps.EnumerateArray())
                                {
                                    if (comp.TryGetProperty("type", out var typeProp) && typeProp.GetString() == "BODY" && comp.TryGetProperty("text", out var textProp))
                                    {
                                        bodyText = textProp.GetString() ?? "";
                                    }
                                }
                            }

                            // Upsert template
                            using var upCmd = conn.CreateCommand();
                            upCmd.CommandText = $@"
                                DELETE FROM {prefix}communication_templates
                                WHERE society_id = @sid AND channel = 'WHATSAPP' AND (meta_template_name = @tname OR template_name = @tname);

                                INSERT INTO {prefix}communication_templates
                                    (society_id, channel, communication_type, template_name, meta_template_id, meta_template_name,
                                     category, subject, body, components, language, status, last_synced_at, is_active, updated_at)
                                VALUES
                                    (@sid, 'WHATSAPP', 'UTILITY', @tname, @tid, @tname, @cat, @tname, @body, @comp, @lang, @st, CURRENT_TIMESTAMP, TRUE, CURRENT_TIMESTAMP);";

                            AddParam(upCmd, "@sid", societyId > 0 ? societyId : 1);
                            AddParam(upCmd, "@tname", tName);
                            AddParam(upCmd, "@tid", tId);
                            AddParam(upCmd, "@cat", category);
                            AddParam(upCmd, "@body", string.IsNullOrWhiteSpace(bodyText) ? tName : bodyText);
                            AddParam(upCmd, "@comp", componentsJson);
                            AddParam(upCmd, "@lang", lang);
                            AddParam(upCmd, "@st", status);

                            upCmd.ExecuteNonQuery();
                            syncedCount++;
                        }
                    }
                }

                if (_hubContext != null)
                {
                    await _hubContext.Clients.Group($"society_{societyId}").SendAsync("WhatsAppTemplateUpdated", new
                    {
                        societyId = societyId,
                        syncedCount = syncedCount,
                        timestamp = DateTime.UtcNow.ToString("o")
                    });
                }

                return Ok(new { success = true, count = syncedCount, message = $"Successfully synchronized {syncedCount} templates from Meta WhatsApp Business Account." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Template synchronization failed: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 2C. WHATSAPP SHARED INBOX & REAL-TIME CONVERSATIONS
        // ═══════════════════════════════════════════════════════════

        public class ConversationMessageRequest
        {
            public int SocietyId { get; set; } = 1;
            public int ConversationId { get; set; }
            public string? MessageText { get; set; }
            public string? TemplateName { get; set; }
            public string? MediaUrl { get; set; }
            public string? AttachmentPath { get; set; }
            public string? Filename { get; set; }
            public string? MimeType { get; set; }
        }

        [HttpGet("whatsapp/conversations")]
        public IActionResult GetWhatsAppConversations([FromQuery] int societyId = 1, [FromQuery] string? status = null, [FromQuery] string? search = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT c.id, c.society_id, c.member_id, c.contact_name, c.phone_number,
                           c.status, c.unread_count, c.last_message, c.last_message_at, c.assigned_user, c.created_at,
                           m.MemName, m.FlatNo, m.Wing
                    FROM {prefix}communication_conversations c
                    LEFT JOIN {prefix}SocMember m ON m.MemberId = c.member_id
                    WHERE c.society_id = @sid";

                if (!string.IsNullOrWhiteSpace(status) && status != "ALL")
                {
                    sql += " AND c.status = @st";
                    AddParam(cmd, "@st", status);
                }
                if (!string.IsNullOrWhiteSpace(search))
                {
                    sql += " AND (c.contact_name ILIKE @srch OR c.phone_number ILIKE @srch OR m.MemName ILIKE @srch OR m.FlatNo ILIKE @srch)";
                    AddParam(cmd, "@srch", $"%{search.Trim()}%");
                }

                sql += " ORDER BY c.last_message_at DESC, c.id DESC";
                cmd.CommandText = sql;
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);

                var list = new List<object>();
                int totalUnread = 0;

                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    int unread = Convert.ToInt32(r["unread_count"]);
                    totalUnread += unread;

                    list.Add(new
                    {
                        id = Convert.ToInt32(r["id"]),
                        societyId = Convert.ToInt32(r["society_id"]),
                        memberId = Convert.ToInt32(r["member_id"]),
                        contactName = r["contact_name"]?.ToString() ?? "",
                        memberName = r["MemName"]?.ToString() ?? r["contact_name"]?.ToString() ?? "",
                        flatNo = r["FlatNo"]?.ToString() ?? "",
                        wing = r["Wing"]?.ToString() ?? "",
                        phoneNumber = r["phone_number"]?.ToString() ?? "",
                        status = r["status"]?.ToString() ?? "OPEN",
                        unreadCount = unread,
                        lastMessage = r["last_message"]?.ToString() ?? "",
                        lastMessageAt = r["last_message_at"] is DateTime ldt ? ldt.ToString("yyyy-MM-dd HH:mm:ss") : "",
                        assignedUser = r["assigned_user"]?.ToString() ?? "",
                        createdAt = r["created_at"] is DateTime cdt ? cdt.ToString("yyyy-MM-dd HH:mm:ss") : ""
                    });
                }

                return Ok(new
                {
                    success = true,
                    totalCount = list.Count,
                    totalUnread,
                    data = list
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load conversations: " + ex.Message });
            }
        }

        [HttpGet("whatsapp/conversations/{id:int}")]
        public IActionResult GetWhatsAppConversation(int id, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT c.id, c.society_id, c.member_id, c.contact_name, c.phone_number,
                           c.status, c.unread_count, c.last_message, c.last_message_at, c.assigned_user, c.created_at,
                           m.MemName, m.FlatNo, m.Wing, m.Email
                    FROM {prefix}communication_conversations c
                    LEFT JOIN {prefix}SocMember m ON m.MemberId = c.member_id
                    WHERE c.id = @id AND c.society_id = @sid";
                AddParam(cmd, "@id", id);
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);

                using var r = cmd.ExecuteReader();
                if (r.Read())
                {
                    return Ok(new
                    {
                        success = true,
                        data = new
                        {
                            id = Convert.ToInt32(r["id"]),
                            societyId = Convert.ToInt32(r["society_id"]),
                            memberId = Convert.ToInt32(r["member_id"]),
                            contactName = r["contact_name"]?.ToString() ?? "",
                            memberName = r["MemName"]?.ToString() ?? r["contact_name"]?.ToString() ?? "",
                            flatNo = r["FlatNo"]?.ToString() ?? "",
                            wing = r["Wing"]?.ToString() ?? "",
                            email = r["Email"]?.ToString() ?? "",
                            phoneNumber = r["phone_number"]?.ToString() ?? "",
                            status = r["status"]?.ToString() ?? "OPEN",
                            unreadCount = Convert.ToInt32(r["unread_count"]),
                            lastMessage = r["last_message"]?.ToString() ?? "",
                            lastMessageAt = r["last_message_at"] is DateTime ldt ? ldt.ToString("yyyy-MM-dd HH:mm:ss") : "",
                            assignedUser = r["assigned_user"]?.ToString() ?? ""
                        }
                    });
                }

                return NotFound(new { success = false, message = "Conversation not found." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load conversation: " + ex.Message });
            }
        }

        [HttpGet("whatsapp/conversations/{id:int}/messages")]
        public IActionResult GetConversationMessages(int id, [FromQuery] int societyId = 1, [FromQuery] int limit = 100)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    SELECT id, society_id, conversation_id, member_id, phone_number,
                           direction, message_type, body, template_name, media_id, media_url,
                           filename, mime_type, whatsapp_message_id, status, error_message,
                           created_at, sent_at, delivered_at, read_at
                    FROM {prefix}communication_messages
                    WHERE conversation_id = @cid AND society_id = @sid
                    ORDER BY id ASC
                    LIMIT @lim";
                AddParam(cmd, "@cid", id);
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                AddParam(cmd, "@lim", limit > 0 ? limit : 100);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        id = Convert.ToInt32(r["id"]),
                        conversationId = Convert.ToInt32(r["conversation_id"]),
                        phoneNumber = r["phone_number"]?.ToString() ?? "",
                        direction = r["direction"]?.ToString() ?? "OUTBOUND",
                        messageType = r["message_type"]?.ToString() ?? "TEXT",
                        body = r["body"]?.ToString() ?? "",
                        templateName = r["template_name"]?.ToString() ?? "",
                        mediaId = r["media_id"]?.ToString() ?? "",
                        mediaUrl = r["media_url"]?.ToString() ?? "",
                        filename = r["filename"]?.ToString() ?? "",
                        mimeType = r["mime_type"]?.ToString() ?? "",
                        whatsappMessageId = r["whatsapp_message_id"]?.ToString() ?? "",
                        status = r["status"]?.ToString() ?? "SENT",
                        errorMessage = r["error_message"]?.ToString() ?? "",
                        createdAt = r["created_at"] is DateTime cdt ? cdt.ToString("yyyy-MM-dd HH:mm:ss") : "",
                        sentAt = r["sent_at"] is DateTime sdt ? sdt.ToString("yyyy-MM-dd HH:mm:ss") : "",
                        deliveredAt = r["delivered_at"] is DateTime ddt ? ddt.ToString("yyyy-MM-dd HH:mm:ss") : "",
                        readAt = r["read_at"] is DateTime rdt ? rdt.ToString("yyyy-MM-dd HH:mm:ss") : ""
                    });
                }

                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load messages: " + ex.Message });
            }
        }

        [HttpPost("whatsapp/conversations/{id:int}/messages")]
        public async Task<IActionResult> SendConversationMessage(int id, [FromBody] ConversationMessageRequest req)
        {
            if (req == null || (string.IsNullOrWhiteSpace(req.MessageText) && string.IsNullOrWhiteSpace(req.TemplateName) && string.IsNullOrWhiteSpace(req.MediaUrl)))
                return BadRequest(new { success = false, message = "Message text, template name, or media is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                // Fetch conversation info
                string recipientPhone = "";
                int memberId = 0;
                using (var cCmd = conn.CreateCommand())
                {
                    cCmd.CommandText = $"SELECT phone_number, member_id FROM {prefix}communication_conversations WHERE id = @id AND society_id = @sid";
                    AddParam(cCmd, "@id", id);
                    AddParam(cCmd, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                    using var cr = cCmd.ExecuteReader();
                    if (cr.Read())
                    {
                        recipientPhone = cr["phone_number"]?.ToString() ?? "";
                        memberId = Convert.ToInt32(cr["member_id"]);
                    }
                }

                if (string.IsNullOrWhiteSpace(recipientPhone))
                    return NotFound(new { success = false, message = "Conversation not found." });

                // Fetch WhatsApp config
                string phoneId = "", token = "";
                using (var cfgCmd = conn.CreateCommand())
                {
                    cfgCmd.CommandText = $"SELECT phone_number_id, access_token_encrypted FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'WHATSAPP' AND is_active = TRUE";
                    AddParam(cfgCmd, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                    using var r = cfgCmd.ExecuteReader();
                    if (r.Read())
                    {
                        phoneId = r["phone_number_id"]?.ToString() ?? "";
                        token = r["access_token_encrypted"]?.ToString() ?? "";
                    }
                }

                token = DecryptSecret(token);
                if (string.IsNullOrWhiteSpace(phoneId) || string.IsNullOrWhiteSpace(token))
                    return BadRequest(new { success = false, message = "WhatsApp is not configured or active." });

                // Prepare payload
                object payload;
                string msgType = "TEXT";
                string msgBody = req.MessageText ?? "";

                if (!string.IsNullOrWhiteSpace(req.TemplateName))
                {
                    msgType = "TEMPLATE";
                    msgBody = $"[Template: {req.TemplateName}] " + (req.MessageText ?? "");
                    payload = new
                    {
                        messaging_product = "whatsapp",
                        to = recipientPhone,
                        type = "template",
                        template = new
                        {
                            name = req.TemplateName,
                            language = new { code = "en_US" }
                        }
                    };
                }
                else if (!string.IsNullOrWhiteSpace(req.MediaUrl))
                {
                    msgType = "DOCUMENT";
                    payload = new
                    {
                        messaging_product = "whatsapp",
                        to = recipientPhone,
                        type = "document",
                        document = new
                        {
                            link = req.MediaUrl,
                            caption = req.MessageText ?? req.Filename ?? "Official Document",
                            filename = req.Filename ?? "Document.pdf"
                        }
                    };
                }
                else
                {
                    payload = new
                    {
                        messaging_product = "whatsapp",
                        to = recipientPhone,
                        type = "text",
                        text = new { preview_url = false, body = req.MessageText }
                    };
                }

                var json = JsonSerializer.Serialize(payload);
                var url = $"https://graph.facebook.com/v20.0/{phoneId}/messages";

                using var reqMsg = new HttpRequestMessage(HttpMethod.Post, url);
                reqMsg.Headers.Add("Authorization", $"Bearer {token}");
                reqMsg.Content = new StringContent(json, Encoding.UTF8, "application/json");

                var res = await _httpClient.SendAsync(reqMsg);
                var responseContent = await res.Content.ReadAsStringAsync();

                string provId = "";
                try
                {
                    using var doc = JsonDocument.Parse(responseContent);
                    if (doc.RootElement.TryGetProperty("messages", out var msgs) && msgs.GetArrayLength() > 0)
                    {
                        provId = msgs[0].GetProperty("id").GetString() ?? "";
                    }
                }
                catch { }

                string status = res.IsSuccessStatusCode ? "SENT" : "FAILED";

                // Record message into DB
                using (var ins = conn.CreateCommand())
                {
                    ins.CommandText = $@"
                        INSERT INTO {prefix}communication_messages
                            (society_id, conversation_id, member_id, phone_number, direction, message_type, body,
                             template_name, media_url, filename, mime_type, whatsapp_message_id, status, error_message, sent_at, created_at)
                        VALUES
                            (@sid, @cid, @mid, @ph, 'OUTBOUND', @mtype, @body, @tname, @murl, @fn, @mt, @wamid, @st, @err, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

                        UPDATE {prefix}communication_conversations
                        SET last_message = @body, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                        WHERE id = @cid;";

                    AddParam(ins, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                    AddParam(ins, "@cid", id);
                    AddParam(ins, "@mid", memberId);
                    AddParam(ins, "@ph", recipientPhone);
                    AddParam(ins, "@mtype", msgType);
                    AddParam(ins, "@body", msgBody);
                    AddParam(ins, "@tname", req.TemplateName ?? "");
                    AddParam(ins, "@murl", req.MediaUrl ?? "");
                    AddParam(ins, "@fn", req.Filename ?? "");
                    AddParam(ins, "@mt", req.MimeType ?? "");
                    AddParam(ins, "@wamid", provId);
                    AddParam(ins, "@st", status);
                    AddParam(ins, "@err", res.IsSuccessStatusCode ? "" : responseContent);
                    ins.ExecuteNonQuery();
                }

                // Broadcast SignalR event
                if (_hubContext != null)
                {
                    await _hubContext.Clients.Group($"society_{req.SocietyId}").SendAsync("WhatsAppMessageSent", new
                    {
                        conversationId = id,
                        recipient = recipientPhone,
                        direction = "OUTBOUND",
                        messageType = msgType,
                        body = msgBody,
                        providerMessageId = provId,
                        status = status,
                        timestamp = DateTime.UtcNow.ToString("o")
                    });

                    await _hubContext.Clients.Group($"conv_{id}").SendAsync("WhatsAppMessageSent", new
                    {
                        conversationId = id,
                        recipient = recipientPhone,
                        direction = "OUTBOUND",
                        messageType = msgType,
                        body = msgBody,
                        providerMessageId = provId,
                        status = status,
                        timestamp = DateTime.UtcNow.ToString("o")
                    });
                }

                if (res.IsSuccessStatusCode)
                {
                    return Ok(new
                    {
                        success = true,
                        message = "Message sent successfully via WhatsApp Cloud API.",
                        providerMessageId = provId
                    });
                }
                else
                {
                    return Ok(new
                    {
                        success = false,
                        message = $"Meta API Error (HTTP {res.StatusCode}): {responseContent}"
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to send message: " + ex.Message });
            }
        }

        [HttpPost("whatsapp/conversations/{id:int}/read")]
        public async Task<IActionResult> MarkConversationRead(int id, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    UPDATE {prefix}communication_conversations
                    SET unread_count = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE id = @id AND society_id = @sid;

                    UPDATE {prefix}communication_messages
                    SET status = 'READ', read_at = CURRENT_TIMESTAMP
                    WHERE conversation_id = @id AND society_id = @sid AND direction = 'INBOUND' AND status != 'READ';";
                AddParam(cmd, "@id", id);
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                cmd.ExecuteNonQuery();

                if (_hubContext != null)
                {
                    await _hubContext.Clients.Group($"society_{societyId}").SendAsync("WhatsAppUnreadCountChanged", new
                    {
                        conversationId = id,
                        unreadCount = 0
                    });
                }

                return Ok(new { success = true, message = "Conversation marked as read." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to mark as read: " + ex.Message });
            }
        }

        [HttpPost("whatsapp/conversations/{id:int}/status")]
        public async Task<IActionResult> UpdateConversationStatus(int id, [FromQuery] string status, [FromQuery] int societyId = 1)
        {
            if (string.IsNullOrWhiteSpace(status))
                return BadRequest(new { success = false, message = "Status is required." });

            string validStatus = status.ToUpperInvariant() switch
            {
                "CLOSED" => "CLOSED",
                "PENDING" => "PENDING",
                _ => "OPEN"
            };

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"UPDATE {prefix}communication_conversations SET status = @st, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND society_id = @sid";
                AddParam(cmd, "@st", validStatus);
                AddParam(cmd, "@id", id);
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                cmd.ExecuteNonQuery();

                if (_hubContext != null)
                {
                    await _hubContext.Clients.Group($"society_{societyId}").SendAsync("WhatsAppConversationUpdated", new
                    {
                        conversationId = id,
                        status = validStatus
                    });
                }

                return Ok(new { success = true, message = $"Conversation status updated to {validStatus}." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to update conversation status: " + ex.Message });
            }
        }

        public class DirectSendRequest
        {
            public int SocietyId { get; set; } = 1;
            public string RecipientMobile { get; set; } = "";
            public string? MessageText { get; set; }
            public string? TemplateName { get; set; }
            public string? MediaUrl { get; set; }
            public string? Filename { get; set; }
            public string? MimeType { get; set; }
        }

        public class SendWhatsAppTemplateApiRequest
        {
            public int SocietyId { get; set; } = 1;
            public string PhoneNumber { get; set; } = "";
            public string TemplateName { get; set; } = "";
            public string? LanguageCode { get; set; } = "en_US";
            public List<string>? Parameters { get; set; }
        }

        [HttpPost("whatsapp/send/template")]
        public async Task<IActionResult> SendWhatsAppTemplateDirect([FromBody] SendWhatsAppTemplateApiRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.PhoneNumber) || string.IsNullOrWhiteSpace(req.TemplateName))
                return BadRequest(new { success = false, message = "Phone number and template name are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                string cleanPhone = NormalizeIndianMobile(req.PhoneNumber);

                // Fetch WhatsApp config
                string wabaId = "";
                string phoneId = "";
                string encToken = "";
                string apiVer = "v21.0";

                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $"SELECT waba_id, phone_number_id, access_token_encrypted FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'WHATSAPP'";
                    AddParam(cmd, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        wabaId = r["waba_id"]?.ToString() ?? "";
                        phoneId = r["phone_number_id"]?.ToString() ?? "";
                        encToken = r["access_token_encrypted"]?.ToString() ?? "";
                    }
                }

                string token = DecryptSecret(encToken);
                if (string.IsNullOrWhiteSpace(token)) token = Environment.GetEnvironmentVariable("META_ACCESS_TOKEN") ?? "";
                if (string.IsNullOrWhiteSpace(phoneId)) phoneId = Environment.GetEnvironmentVariable("META_PHONE_NUMBER_ID") ?? "1185567017980748";
                if (string.IsNullOrWhiteSpace(apiVer)) apiVer = "v21.0";

                if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(phoneId))
                    return BadRequest(new { success = false, message = "WhatsApp credentials not configured." });

                // Construct Meta Template Payload
                object templatePayload;
                if (req.Parameters != null && req.Parameters.Count > 0 && req.Parameters.Any(p => !string.IsNullOrWhiteSpace(p)))
                {
                    var paramObjects = req.Parameters.Select(p => new { type = "text", text = p }).ToList();
                    templatePayload = new
                    {
                        messaging_product = "whatsapp",
                        recipient_type = "individual",
                        to = cleanPhone,
                        type = "template",
                        template = new
                        {
                            name = req.TemplateName,
                            language = new { code = string.IsNullOrWhiteSpace(req.LanguageCode) ? "en_US" : req.LanguageCode },
                            components = new object[]
                            {
                                new
                                {
                                    type = "body",
                                    parameters = paramObjects
                                }
                            }
                        }
                    };
                }
                else
                {
                    templatePayload = new
                    {
                        messaging_product = "whatsapp",
                        recipient_type = "individual",
                        to = cleanPhone,
                        type = "template",
                        template = new
                        {
                            name = req.TemplateName,
                            language = new { code = string.IsNullOrWhiteSpace(req.LanguageCode) ? "en_US" : req.LanguageCode }
                        }
                    };
                }

                string url = $"https://graph.facebook.com/{apiVer}/{phoneId}/messages";
                using var httpClient = new HttpClient();
                httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                var content = new StringContent(JsonSerializer.Serialize(templatePayload), System.Text.Encoding.UTF8, "application/json");

                var resp = await httpClient.PostAsync(url, content);
                var respBody = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    return BadRequest(new { success = false, message = "Meta API Error: " + respBody });
                }

                string wamid = "";
                try
                {
                    using var doc = JsonDocument.Parse(respBody);
                    if (doc.RootElement.TryGetProperty("messages", out var msgs) && msgs.GetArrayLength() > 0)
                    {
                        wamid = msgs[0].GetProperty("id").GetString() ?? "";
                    }
                }
                catch { }

                // Ensure Conversation & Message Record
                int convId = EnsureConversationInternal(conn, prefix, req.SocietyId, 0, cleanPhone, cleanPhone);

                using (var insCmd = conn.CreateCommand())
                {
                    insCmd.CommandText = $@"
                        INSERT INTO {prefix}communication_messages
                            (society_id, conversation_id, member_id, phone_number, direction, message_type,
                             body, template_name, template_language, whatsapp_message_id, status, created_at, sent_at)
                        VALUES
                            (@sid, @cid, 0, @ph, 'OUTBOUND', 'TEMPLATE', @body, @tname, @tlang, @wamid, 'SENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
                    AddParam(insCmd, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                    AddParam(insCmd, "@cid", convId);
                    AddParam(insCmd, "@ph", cleanPhone);
                    AddParam(insCmd, "@body", $"[Template: {req.TemplateName}]");
                    AddParam(insCmd, "@tname", req.TemplateName);
                    AddParam(insCmd, "@tlang", req.LanguageCode ?? "en_US");
                    AddParam(insCmd, "@wamid", wamid);
                    insCmd.ExecuteNonQuery();
                }

                if (_hubContext != null)
                {
                    await _hubContext.Clients.Group($"society_{req.SocietyId}").SendAsync("WhatsAppMessageSent", new
                    {
                        societyId = req.SocietyId,
                        conversationId = convId,
                        wamid = wamid,
                        status = "SENT"
                    });
                }

                return Ok(new { success = true, wamid = wamid, message = "Template dispatched successfully via Meta Cloud API." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Dispatch Exception: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // QUICK REPLIES CRUD
        // ═══════════════════════════════════════════════════════════
        public class QuickReplyDto
        {
            public int Id { get; set; }
            public int SocietyId { get; set; } = 1;
            public string Name { get; set; } = "";
            public string Type { get; set; } = "TEXT";
            public string InteractiveType { get; set; } = "BUTTONS";
            public string Body { get; set; } = "";
            public string? Header { get; set; }
            public string? Footer { get; set; }
            public string? ListButtonLabel { get; set; }
            public string? RowsJson { get; set; }
        }

        [HttpGet("whatsapp/quick-replies")]
        public IActionResult GetQuickReplies([FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"SELECT id, society_id, name, type, interactive_type, body, header, footer, list_button_label, rows_json, created_at FROM {prefix}communication_quick_replies WHERE society_id = @sid ORDER BY id ASC";
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        id = Convert.ToInt32(r["id"]),
                        society_id = Convert.ToInt32(r["society_id"]),
                        name = r["name"]?.ToString() ?? "",
                        type = r["type"]?.ToString() ?? "TEXT",
                        interactive_type = r["interactive_type"]?.ToString() ?? "BUTTONS",
                        body = r["body"]?.ToString() ?? "",
                        header = r["header"]?.ToString() ?? "",
                        footer = r["footer"]?.ToString() ?? "",
                        list_button_label = r["list_button_label"]?.ToString() ?? "",
                        rows_json = r["rows_json"]?.ToString() ?? "",
                        created_at = r["created_at"] is DateTime dt ? dt.ToString("yyyy-MM-dd HH:mm:ss") : ""
                    });
                }

                // If empty, return default initial snippets
                if (list.Count == 0)
                {
                    r.Close();
                    // Seed initial defaults
                    using var ins = conn.CreateCommand();
                    ins.CommandText = $@"
                        INSERT INTO {prefix}communication_quick_replies (society_id, name, type, interactive_type, body, header, footer, list_button_label, rows_json)
                        VALUES 
                            (@sid, 'HENU OS', 'INTERACTIVE', 'LIST', 'is an Indian private company incorporated on December 2, 2025. Registered under the Registrar of Companies (RoC) Jaipur, its corporate office is located in Pali, Rajasthan. The company operates primarily within the computer software and IT ecosystem.', 'HENU OS Private Limited', 'siddharth', 'Menu', '[{{""id"":""dir"",""title"":""Active Directors""}},{{""id"":""serv"",""title"":""Services""}}]'),
                            (@sid, 'sidd', 'TEXT', 'BUTTONS', 'how are you henu os', '', '', '', '')";
                    AddParam(ins, "@sid", societyId > 0 ? societyId : 1);
                    ins.ExecuteNonQuery();

                    return GetQuickReplies(societyId);
                }

                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load quick replies: " + ex.Message });
            }
        }

        [HttpPost("whatsapp/quick-replies")]
        public IActionResult CreateQuickReply([FromBody] QuickReplyDto req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Body))
                return BadRequest(new { success = false, message = "Name and body are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    INSERT INTO {prefix}communication_quick_replies
                        (society_id, name, type, interactive_type, body, header, footer, list_button_label, rows_json, created_at, updated_at)
                    VALUES
                        (@sid, @name, @type, @itype, @body, @hdr, @ftr, @lbl, @rows, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
                AddParam(cmd, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                AddParam(cmd, "@name", req.Name.Trim());
                AddParam(cmd, "@type", req.Type ?? "TEXT");
                AddParam(cmd, "@itype", req.InteractiveType ?? "BUTTONS");
                AddParam(cmd, "@body", req.Body.Trim());
                AddParam(cmd, "@hdr", req.Header ?? "");
                AddParam(cmd, "@ftr", req.Footer ?? "");
                AddParam(cmd, "@lbl", req.ListButtonLabel ?? "");
                AddParam(cmd, "@rows", req.RowsJson ?? "");
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Quick reply created successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to create quick reply: " + ex.Message });
            }
        }

        [HttpPut("whatsapp/quick-replies/{id:int}")]
        public IActionResult UpdateQuickReply(int id, [FromBody] QuickReplyDto req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Body))
                return BadRequest(new { success = false, message = "Name and body are required." });

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    UPDATE {prefix}communication_quick_replies
                    SET name = @name, type = @type, interactive_type = @itype, body = @body,
                        header = @hdr, footer = @ftr, list_button_label = @lbl, rows_json = @rows, updated_at = CURRENT_TIMESTAMP
                    WHERE id = @id AND society_id = @sid";
                AddParam(cmd, "@id", id);
                AddParam(cmd, "@sid", req.SocietyId > 0 ? req.SocietyId : 1);
                AddParam(cmd, "@name", req.Name.Trim());
                AddParam(cmd, "@type", req.Type ?? "TEXT");
                AddParam(cmd, "@itype", req.InteractiveType ?? "BUTTONS");
                AddParam(cmd, "@body", req.Body.Trim());
                AddParam(cmd, "@hdr", req.Header ?? "");
                AddParam(cmd, "@ftr", req.Footer ?? "");
                AddParam(cmd, "@lbl", req.ListButtonLabel ?? "");
                AddParam(cmd, "@rows", req.RowsJson ?? "");
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Quick reply updated successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to update quick reply: " + ex.Message });
            }
        }

        [HttpDelete("whatsapp/quick-replies/{id:int}")]
        public IActionResult DeleteQuickReply(int id, [FromQuery] int societyId = 1)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"DELETE FROM {prefix}communication_quick_replies WHERE id = @id AND society_id = @sid";
                AddParam(cmd, "@id", id);
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                cmd.ExecuteNonQuery();

                return Ok(new { success = true, message = "Quick reply deleted successfully." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to delete quick reply: " + ex.Message });
            }
        }

        [HttpGet("whatsapp/logs")]
        public IActionResult GetWhatsAppLogs([FromQuery] int societyId = 1, [FromQuery] string? status = null, [FromQuery] string? phone = null, [FromQuery] int limit = 100)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT m.id, m.society_id, m.conversation_id, m.member_id, m.phone_number,
                           m.direction, m.message_type, m.body, m.template_name, m.whatsapp_message_id,
                           m.status, m.error_code, m.error_message, m.created_at, m.sent_at, m.delivered_at, m.read_at,
                           c.contact_name AS member_name
                    FROM {prefix}communication_messages m
                    LEFT JOIN {prefix}communication_conversations c ON m.conversation_id = c.id
                    WHERE m.society_id = @sid";

                if (!string.IsNullOrWhiteSpace(status) && status != "ALL")
                {
                    sql += " AND m.status = @st";
                    AddParam(cmd, "@st", status);
                }
                if (!string.IsNullOrWhiteSpace(phone))
                {
                    sql += " AND (m.phone_number ILIKE @ph OR c.contact_name ILIKE @ph)";
                    AddParam(cmd, "@ph", $"%{phone.Trim()}%");
                }

                sql += " ORDER BY m.id DESC LIMIT @lim";
                cmd.CommandText = sql;
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);
                AddParam(cmd, "@lim", limit > 0 ? limit : 100);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        id = Convert.ToInt32(r["id"]),
                        society_id = Convert.ToInt32(r["society_id"]),
                        conversation_id = r["conversation_id"] == DBNull.Value ? 0 : Convert.ToInt32(r["conversation_id"]),
                        member_id = r["member_id"] == DBNull.Value ? 0 : Convert.ToInt32(r["member_id"]),
                        member_name = r["member_name"]?.ToString() ?? "",
                        phone_number = r["phone_number"]?.ToString() ?? "",
                        direction = r["direction"]?.ToString() ?? "OUTBOUND",
                        message_type = r["message_type"]?.ToString() ?? "TEXT",
                        body = r["body"]?.ToString() ?? "",
                        template_name = r["template_name"]?.ToString() ?? "",
                        whatsapp_message_id = r["whatsapp_message_id"]?.ToString() ?? "",
                        status = r["status"]?.ToString() ?? "SENT",
                        error_code = r["error_code"]?.ToString() ?? "",
                        error_message = r["error_message"]?.ToString() ?? "",
                        created_at = r["created_at"] is DateTime dt ? dt.ToString("yyyy-MM-dd HH:mm:ss") : ""
                    });
                }

                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load WhatsApp logs: " + ex.Message });
            }
        }

        private static int EnsureConversationInternal(DbConnection conn, string prefix, int societyId, int memberId, string name, string phone)
        {
            string cleanPhone = NormalizeIndianMobile(phone);
            using var chk = conn.CreateCommand();
            chk.CommandText = $"SELECT id FROM {prefix}communication_conversations WHERE society_id = @sid AND phone_number = @ph LIMIT 1";
            AddParam(chk, "@sid", societyId);
            AddParam(chk, "@ph", cleanPhone);

            var obj = chk.ExecuteScalar();
            if (obj != null && obj != DBNull.Value)
            {
                return Convert.ToInt32(obj);
            }

            using var ins = conn.CreateCommand();
            ins.CommandText = $@"
                INSERT INTO {prefix}communication_conversations
                    (society_id, member_id, contact_name, phone_number, status, unread_count, created_at, updated_at)
                VALUES
                    (@sid, @mid, @cname, @ph, 'OPEN', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)";
            AddParam(ins, "@sid", societyId);
            AddParam(ins, "@mid", memberId);
            AddParam(ins, "@cname", string.IsNullOrWhiteSpace(name) ? cleanPhone : name);
            AddParam(ins, "@ph", cleanPhone);
            ins.ExecuteNonQuery();

            using var getNew = conn.CreateCommand();
            getNew.CommandText = $"SELECT id FROM {prefix}communication_conversations WHERE society_id = @sid AND phone_number = @ph LIMIT 1";
            AddParam(getNew, "@sid", societyId);
            AddParam(getNew, "@ph", cleanPhone);
            return Convert.ToInt32(getNew.ExecuteScalar() ?? 0);
        }

        private static void InsertMessageInternal(DbConnection conn, string prefix, int societyId, int convId, int memberId, string phone, string direction, string msgType, string body, string wamid, string status)
        {
            string cleanPhone = NormalizeIndianMobile(phone);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $@"
                INSERT INTO {prefix}communication_messages
                    (society_id, conversation_id, member_id, phone_number, direction, message_type, body, whatsapp_message_id, status, sent_at, created_at)
                VALUES
                    (@sid, @cid, @mid, @ph, @dir, @mtype, @body, @wamid, @st, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

                UPDATE {prefix}communication_conversations
                SET last_message = @body, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = @cid;";

            AddParam(cmd, "@sid", societyId);
            AddParam(cmd, "@cid", convId);
            AddParam(cmd, "@mid", memberId);
            AddParam(cmd, "@ph", cleanPhone);
            AddParam(cmd, "@dir", direction);
            AddParam(cmd, "@mtype", msgType);
            AddParam(cmd, "@body", body);
            AddParam(cmd, "@wamid", wamid);
            AddParam(cmd, "@st", status);
            cmd.ExecuteNonQuery();
        }

        // ═══════════════════════════════════════════════════════════
        // 3. RECIPIENT RESOLVERS (Members & Committee)
        // ═══════════════════════════════════════════════════════════

        [HttpGet("members")]
        public IActionResult GetMemberRecipients([FromQuery] int societyId, [FromQuery] string? wing = null, [FromQuery] string? status = null)
        {
            if (societyId <= 0) societyId = 1;

            try
            {
                using var conn = DbHelper.GetConn();
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT m.MemberId, m.MemCode, m.MemName, COALESCE(m.MemName2, '') AS CoMemberName, m.FlatNo, m.Wing,
                           m.ContactNo, m.Email,
                           COALESCE(m.OpPrincipal, 0) + COALESCE(m.OpInterest, 0) AS OpeningBal
                    FROM {prefix}SocMember m
                    WHERE m.SocietyId = @sid AND m.IsDeleted = FALSE";

                if (!string.IsNullOrWhiteSpace(wing) && wing != "ALL")
                {
                    sql += " AND m.Wing = @wing";
                    AddParam(cmd, "@wing", wing);
                }

                sql += " ORDER BY m.Wing ASC, m.FlatNo ASC, m.MemberId ASC";
                cmd.CommandText = sql;
                AddParam(cmd, "@sid", societyId);

                var list = new List<object>();
                int validEmailCount = 0;
                int validMobileCount = 0;

                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        string email = r["Email"]?.ToString()?.Trim() ?? "";
                        string mobile = r["ContactNo"]?.ToString()?.Trim() ?? "";
                        bool hasValidEmail = IsValidEmail(email);
                        string normMobile = NormalizeIndianMobile(mobile);
                        bool hasValidMobile = !string.IsNullOrWhiteSpace(normMobile);

                        if (hasValidEmail) validEmailCount++;
                        if (hasValidMobile) validMobileCount++;

                        list.Add(new
                        {
                            memberId = Convert.ToInt32(r["MemberId"]),
                            memCode = r["MemCode"]?.ToString() ?? "",
                            memberName = r["MemName"]?.ToString() ?? "",
                            coMemberName = r["CoMemberName"]?.ToString() ?? "",
                            flatNo = r["FlatNo"]?.ToString() ?? "",
                            wing = r["Wing"]?.ToString() ?? "",
                            email,
                            mobile,
                            normalizedMobile = normMobile,
                            hasValidEmail,
                            hasValidMobile,
                            status = "Active",
                            openingBalance = Convert.ToDecimal(r["OpeningBal"])
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    totalCount = list.Count,
                    validEmailCount,
                    missingEmailCount = list.Count - validEmailCount,
                    validMobileCount,
                    missingMobileCount = list.Count - validMobileCount,
                    data = list
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load member recipients: " + ex.Message });
            }
        }

        [HttpGet("committee")]
        public IActionResult GetCommitteeRecipients([FromQuery] int societyId, [FromQuery] string? designation = null)
        {
            if (societyId <= 0) societyId = 1;

            try
            {
                using var conn = DbHelper.GetConn();
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT CommitteeId, SocietyId, FYId, MemberName, Designation,
                           FromDate, ToDate, ContactNo, Email, IsActive
                    FROM {prefix}SocCommittee
                    WHERE SocietyId = @sid AND IsActive = TRUE";

                if (!string.IsNullOrWhiteSpace(designation) && designation != "ALL")
                {
                    sql += " AND Designation = @desig";
                    AddParam(cmd, "@desig", designation);
                }

                sql += " ORDER BY Designation ASC, MemberName ASC";
                cmd.CommandText = sql;
                AddParam(cmd, "@sid", societyId);

                var list = new List<object>();
                int validEmailCount = 0;
                int validMobileCount = 0;

                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        string email = r["Email"]?.ToString()?.Trim() ?? "";
                        string contact = r["ContactNo"]?.ToString()?.Trim() ?? "";
                        bool hasValidEmail = IsValidEmail(email);
                        string normMobile = NormalizeIndianMobile(contact);
                        bool hasValidMobile = !string.IsNullOrWhiteSpace(normMobile);

                        if (hasValidEmail) validEmailCount++;
                        if (hasValidMobile) validMobileCount++;

                        list.Add(new
                        {
                            committeeId = Convert.ToInt32(r["CommitteeId"]),
                            societyId = Convert.ToInt32(r["SocietyId"]),
                            memberName = r["MemberName"]?.ToString() ?? "",
                            designation = r["Designation"]?.ToString() ?? "Committee Member",
                            email,
                            contactNo = contact,
                            normalizedMobile = normMobile,
                            hasValidEmail,
                            hasValidMobile,
                            fromDate = r["FromDate"] is DateTime df ? df.ToString("yyyy-MM-dd") : null,
                            toDate = r["ToDate"] is DateTime dt ? dt.ToString("yyyy-MM-dd") : null,
                            isActive = Convert.ToBoolean(r["IsActive"])
                        });
                    }
                }

                return Ok(new
                {
                    success = true,
                    totalCount = list.Count,
                    validEmailCount,
                    missingEmailCount = list.Count - validEmailCount,
                    validMobileCount,
                    missingMobileCount = list.Count - validMobileCount,
                    data = list
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load committee recipients: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 4. PREVIEW & CONTENT GENERATOR (Members & Committee)
        // ═══════════════════════════════════════════════════════════

        public class MemberPreviewRequest
        {
            public int SocietyId { get; set; } = 1;
            public int FYId { get; set; } = 1;
            public string Channel { get; set; } = "EMAIL";
            public string CommunicationType { get; set; } = "BILL";
            public int SampleMemberId { get; set; }
            public int MemberId { get; set; }
            public string? CustomSubject { get; set; }
            public string? TemplateSubject { get; set; }
            public string? CustomMessage { get; set; }
            public string? TemplateBody { get; set; }
            public string? PeriodLabel { get; set; }
            public string? BillMonth { get; set; }
            public string? BillNo { get; set; }
            public string? ReceiptNo { get; set; }
            public string? FromDate { get; set; }
            public string? ToDate { get; set; }
            public string? AttachmentFilename { get; set; }
        }

        [HttpPost("members/preview")]
        public IActionResult PreviewMemberCommunication([FromBody] MemberPreviewRequest req)
        {
            if (req == null || req.SocietyId <= 0)
                return BadRequest(new { success = false, message = "SocietyId is required." });

            try
            {
                using var conn = DbHelper.GetConn();
                string prefix = GetSchemaPrefix(conn);

                int effectiveMid = req.MemberId > 0 ? req.MemberId : req.SampleMemberId;
                string effectiveSub = !string.IsNullOrWhiteSpace(req.TemplateSubject) ? req.TemplateSubject : (req.CustomSubject ?? "");
                string effectiveBody = !string.IsNullOrWhiteSpace(req.TemplateBody) ? req.TemplateBody : (req.CustomMessage ?? "");
                string effectivePeriod = !string.IsNullOrWhiteSpace(req.BillMonth) ? req.BillMonth : (req.PeriodLabel ?? "Current Period");

                // Fetch society details
                string socName = "JEEVIKA CO-OP HOUSING SOCIETY";
                using (var sCmd = conn.CreateCommand())
                {
                    sCmd.CommandText = $"SELECT SocietyName FROM {prefix}SocietyInfo WHERE SocietyId = @sid";
                    AddParam(sCmd, "@sid", req.SocietyId);
                    var sn = sCmd.ExecuteScalar();
                    if (sn != null) socName = sn.ToString() ?? socName;
                }

                // Fetch sample member details
                string memName = "Rajesh Sharma", flatNo = "A-101", wing = "A", email = "rajesh.sharma@example.com", mobile = "9876543210";
                decimal outstanding = 4500.00m, billAmount = 3500.00m;

                using (var mCmd = conn.CreateCommand())
                {
                    mCmd.CommandText = $@"
                        SELECT MemberId, MemName, FlatNo, Wing, Email, ContactNo,
                               COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0) AS OpBal
                        FROM {prefix}SocMember
                        WHERE SocietyId = @sid AND IsDeleted = FALSE {(effectiveMid > 0 ? "AND MemberId = @mid" : "")}
                        ORDER BY MemberId ASC LIMIT 1";
                    AddParam(mCmd, "@sid", req.SocietyId);
                    if (effectiveMid > 0) AddParam(mCmd, "@mid", effectiveMid);

                    using var r = mCmd.ExecuteReader();
                    if (r.Read())
                    {
                        memName = r["MemName"]?.ToString() ?? memName;
                        flatNo = r["FlatNo"]?.ToString() ?? flatNo;
                        wing = r["Wing"]?.ToString() ?? wing;
                        email = r["Email"]?.ToString() ?? email;
                        mobile = r["ContactNo"]?.ToString() ?? mobile;
                        outstanding = Convert.ToDecimal(r["OpBal"]);
                        if (outstanding == 0) outstanding = 4500.00m;
                    }
                }

                string subject = effectiveSub;
                string body = effectiveBody;
                string attachName = req.AttachmentFilename ?? "";

                // Default content based on communication type
                switch (req.CommunicationType?.ToUpperInvariant())
                {
                    case "BILL":
                    case "BILL_FORMAT":
                        subject = string.IsNullOrWhiteSpace(subject) ? $"Maintenance Bill for {effectivePeriod} - Flat {flatNo}" : subject;
                        body = string.IsNullOrWhiteSpace(body) ?
                            $"Dear {memName},\n\nPlease find attached the maintenance bill for {effectivePeriod} for your unit Flat {flatNo}, Wing {wing}.\n\nBill Amount: ₹{billAmount:N2}\nTotal Outstanding: ₹{outstanding:N2}\n\nKindly clear the dues before the due date to avoid interest charges.\n\nRegards,\n{socName}" : body;
                        attachName = $"Bill_{flatNo}_{DateTime.Now:yyyyMM}.pdf";
                        break;

                    case "RECEIPT":
                        subject = string.IsNullOrWhiteSpace(subject) ? $"Payment Receipt Confirmation - Flat {flatNo}" : subject;
                        body = string.IsNullOrWhiteSpace(body) ?
                            $"Dear {memName},\n\nWe gratefully acknowledge receipt of your payment.\n\nReceipt No: {req.ReceiptNo ?? "MRV/2026/01"}\nAmount Paid: ₹{billAmount:N2}\nFlat No: {flatNo}\n\nPlease find your official digital payment receipt attached.\n\nThank you,\n{socName}" : body;
                        attachName = $"Receipt_{flatNo}_{req.ReceiptNo ?? "MRV01"}.pdf";
                        break;

                    case "MEMBER_ACCOUNT":
                        subject = string.IsNullOrWhiteSpace(subject) ? $"Statement of Member Account Ledger - Flat {flatNo}" : subject;
                        string toDateStr = string.IsNullOrWhiteSpace(req.ToDate) ? DateTime.Now.ToString("dd-MM-yyyy") : req.ToDate;
                        body = string.IsNullOrWhiteSpace(body) ?
                            $"Dear {memName},\n\nPlease find attached your complete member account statement for the period {req.FromDate ?? "01-04-2025"} to {toDateStr}.\n\nClosing Balance: ₹{outstanding:N2}\n\nRegards,\n{socName}" : body;
                        attachName = $"Statement_{flatNo}.pdf";
                        break;

                    case "MEMBER_REGISTER":
                        subject = string.IsNullOrWhiteSpace(subject) ? $"Member Register Copy - Flat {flatNo}" : subject;
                        body = string.IsNullOrWhiteSpace(body) ?
                            $"Dear {memName},\n\nPlease find attached your registered member profile and share capital record summary from society registers.\n\nRegards,\n{socName}" : body;
                        attachName = $"Member_Register_{flatNo}.pdf";
                        break;

                    case "OUTSTANDING_REMINDER":
                        subject = string.IsNullOrWhiteSpace(subject) ? $"Reminder: Outstanding Maintenance Dues - Flat {flatNo}" : subject;
                        body = string.IsNullOrWhiteSpace(body) ?
                            $"Dear {memName},\n\nOur records indicate a pending outstanding balance of ₹{outstanding:N2} against your unit Flat {flatNo}, Wing {wing}.\n\nWe request you to arrange payment at your earliest convenience to facilitate uninterrupted society operations.\n\nSociety: {socName}\nFlat: {flatNo}" : body;
                        attachName = "";
                        break;

                    case "OUTSTANDING_LETTER":
                        subject = string.IsNullOrWhiteSpace(subject) ? $"Formal Outstanding Notice - Flat {flatNo}" : subject;
                        body = string.IsNullOrWhiteSpace(body) ?
                            $"Dear {memName},\n\nPlease find attached the formal notice regarding overdue society maintenance dues of ₹{outstanding:N2}.\n\nKindly refer to the attached letter for payment schedule and bank account details.\n\nAuthorized Signatory,\n{socName}" : body;
                        attachName = $"Notice_Outstanding_{flatNo}.pdf";
                        break;

                    case "MESSAGE":
                        subject = string.IsNullOrWhiteSpace(subject) ? $"Notice from {socName}" : subject;
                        body = string.IsNullOrWhiteSpace(body) ?
                            $"Dear {memName},\n\nPlease be informed about upcoming society maintenance and AGM schedule.\n\nRegards,\nManaging Committee, {socName}" : body;
                        attachName = "";
                        break;

                    case "BALANCE_CONFIRMATION":
                        subject = string.IsNullOrWhiteSpace(subject) ? $"Balance Confirmation Letter as on {DateTime.Now:dd-MM-yyyy}" : subject;
                        body = string.IsNullOrWhiteSpace(body) ?
                            $"Dear {memName},\n\nPlease find attached your annual Balance Confirmation Letter for audit purposes.\n\nConfirmed Balance: ₹{outstanding:N2}\nAs on Date: {DateTime.Now:dd-MM-yyyy}\n\nRegards,\n{socName}" : body;
                        attachName = $"Balance_Confirmation_{flatNo}.pdf";
                        break;

                    case "MESSAGE_WITH_PDF":
                        subject = string.IsNullOrWhiteSpace(subject) ? $"Society Circular & Document - {socName}" : subject;
                        body = string.IsNullOrWhiteSpace(body) ?
                            $"Dear {memName},\n\nPlease find attached the official circular regarding society updates.\n\nRegards,\n{socName}" : body;
                        attachName = string.IsNullOrWhiteSpace(attachName) ? "Circular.pdf" : attachName;
                        break;
                }

                // Render dynamic placeholders
                subject = RenderTemplate(subject, memName, flatNo, wing, socName, billAmount, outstanding, effectivePeriod);
                body = RenderTemplate(body, memName, flatNo, wing, socName, billAmount, outstanding, effectivePeriod);

                var previewObj = new
                {
                    channel = req.Channel?.ToUpperInvariant() ?? "EMAIL",
                    communicationType = req.CommunicationType,
                    recipientName = memName,
                    flatNo,
                    wing,
                    recipientEmail = email,
                    recipientMobile = NormalizeIndianMobile(mobile),
                    subject,
                    body,
                    renderedSubject = subject,
                    renderedBody = body,
                    attachmentName = attachName,
                    hasAttachment = !string.IsNullOrWhiteSpace(attachName)
                };

                return Ok(new
                {
                    success = true,
                    preview = previewObj,
                    data = previewObj
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Preview generation failed: " + ex.Message });
            }
        }

        public class CommitteePreviewRequest
        {
            public int? SocietyId { get; set; } = 1;
            public int? FYId { get; set; } = 1;
            public string? Channel { get; set; } = "EMAIL";
            public string? ReportType { get; set; } = "TRIAL_BALANCE";
            public int? CommitteeId { get; set; }
            public string? FromDate { get; set; }
            public string? ToDate { get; set; }
            public string? CustomSubject { get; set; }
            public string? TemplateSubject { get; set; }
            public string? CustomMessage { get; set; }
            public string? TemplateBody { get; set; }
        }

        [HttpPost("committee/preview")]
        public IActionResult PreviewCommitteeReport([FromBody] CommitteePreviewRequest req)
        {
            if (req == null)
                return BadRequest(new { success = false, message = "Invalid preview request payload." });

            int sid = (req.SocietyId.HasValue && req.SocietyId.Value > 0) ? req.SocietyId.Value : 1;

            try
            {
                using var conn = DbHelper.GetConn();
                string prefix = GetSchemaPrefix(conn);

                string socName = "HENU CO-OP HOUSING SOCIETY LTD.";
                using (var sCmd = conn.CreateCommand())
                {
                    sCmd.CommandText = $"SELECT SocietyName FROM {prefix}SocietyInfo WHERE SocietyId = @sid";
                    AddParam(sCmd, "@sid", sid);
                    var sn = sCmd.ExecuteScalar();
                    if (sn != null) socName = sn.ToString() ?? socName;
                }

                string memberName = "Committee Member", desig = "Secretary", email = "", contact = "";
                int cid = (req.CommitteeId.HasValue && req.CommitteeId.Value > 0) ? req.CommitteeId.Value : 0;
                
                using (var cCmd = conn.CreateCommand())
                {
                    cCmd.CommandText = cid > 0
                        ? $"SELECT MemberName, Designation, Email, ContactNo FROM {prefix}SocCommittee WHERE SocietyId = @sid AND CommitteeId = @cid"
                        : $"SELECT MemberName, Designation, Email, ContactNo FROM {prefix}SocCommittee WHERE SocietyId = @sid AND IsActive = TRUE LIMIT 1";
                    AddParam(cCmd, "@sid", sid);
                    if (cid > 0) AddParam(cCmd, "@cid", cid);

                    using var cr = cCmd.ExecuteReader();
                    if (cr.Read())
                    {
                        memberName = cr["MemberName"]?.ToString() ?? memberName;
                        desig = cr["Designation"]?.ToString() ?? desig;
                        email = cr["Email"]?.ToString() ?? "";
                        contact = cr["ContactNo"]?.ToString() ?? "";
                    }
                }

                string repType = req.ReportType ?? "INCOME_EXPENDITURE";
                string reportName = repType.ToUpperInvariant() switch
                {
                    "INCOME_EXPENDITURE" => "Income & Expenditure Statement",
                    "BALANCE_SHEET" => "Form N — Statutory Balance Sheet Statement",
                    "TRIAL_BALANCE" => "Trial Balance Statement",
                    "CASH_BANK_BOOK" => "Cash and Bank Book Statement",
                    "LEDGER_CODE_WISE" or "ACCOUNT_LEDGER_CODE" => "Account Ledger (Code Wise)",
                    "LEDGER_GROUP_WISE" or "ACCOUNT_LEDGER_GROUP" => "Account Ledger (Group Wise)",
                    "RECEIPT_PAYMENT_GROUP" => "Receipt & Payment Summary (Groupwise)",
                    "RECEIPT_PAYMENT_ACCOUNT" => "Receipt & Payment Summary (Accountwise)",
                    "SCHEDULE" => "Financial Balance Sheet Schedules",
                    "MONTHLY_REPORT" => "Monthly Financial Summary Report",
                    "RECEIPT_REGISTER" => "Receipt Voucher Register",
                    "PAYMENT_REGISTER" => "Payment Voucher Register",
                    "CONTRA_REGISTER" => "Contra Voucher Register",
                    "JOURNAL_REGISTER" => "Journal Voucher Register",
                    _ => "Financial Statement Report"
                };

                string commToDate = string.IsNullOrWhiteSpace(req.ToDate) ? DateTime.Now.ToString("dd-MM-yyyy") : req.ToDate;
                string rawSub = !string.IsNullOrWhiteSpace(req.TemplateSubject) ? req.TemplateSubject : (req.CustomSubject ?? $"Management Committee: {reportName} - {socName}");
                string rawBody = !string.IsNullOrWhiteSpace(req.TemplateBody) ? req.TemplateBody : (req.CustomMessage ?? $"Dear {{member_name}},\n\nPlease find attached the official {{report_name}} for your review and records.\n\nSociety: {socName}\nPeriod: {req.FromDate ?? "01-04-2026"} to {commToDate}\n\nRegards,\nAccounts Department");
                string effectiveSub = RenderCommitteeTemplate(rawSub, memberName, desig, socName, reportName, req.FromDate, commToDate);
                string effectiveBody = RenderCommitteeTemplate(rawBody, memberName, desig, socName, reportName, req.FromDate, commToDate);
                string attachName = $"{repType}_{DateTime.Now:yyyyMMdd}.pdf";

                var previewObj = new
                {
                    channel = req.Channel?.ToUpperInvariant() ?? "EMAIL",
                    reportType = repType,
                    reportName,
                    recipientName = memberName,
                    designation = desig,
                    recipientEmail = email,
                    recipientMobile = NormalizeIndianMobile(contact),
                    subject = effectiveSub,
                    body = effectiveBody,
                    renderedSubject = effectiveSub,
                    renderedBody = effectiveBody,
                    attachmentName = attachName
                };

                return Ok(new
                {
                    success = true,
                    preview = previewObj,
                    data = previewObj
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Preview failed: " + ex.Message });
            }
        }

        public class MemberQueueRequest
        {
            public int? SocietyId { get; set; } = 1;
            public int? FYId { get; set; } = 1;
            public string? Channel { get; set; } = "EMAIL";
            public string? FeatureType { get; set; } = "BILL";
            public string? CommunicationType { get; set; }
            public List<int?>? MemberIds { get; set; }
            public string? Subject { get; set; }
            public string? TemplateSubject { get; set; }
            public string? MessageTemplate { get; set; }
            public string? TemplateBody { get; set; }
            public string? AttachmentName { get; set; }
            public string? BillMonth { get; set; }
            public string? PeriodLabel { get; set; }
        }

        [HttpPost("members/queue")]
        public IActionResult QueueMemberCommunications([FromBody] MemberQueueRequest req)
        {
            if (req == null)
                return BadRequest(new { success = false, message = "Invalid request payload." });

            int sid = (req.SocietyId.HasValue && req.SocietyId.Value > 0) ? req.SocietyId.Value : 1;
            int fyid = (req.FYId.HasValue && req.FYId.Value > 0) ? req.FYId.Value : 1;
            string channel = !string.IsNullOrWhiteSpace(req.Channel) ? req.Channel.ToUpperInvariant() : "EMAIL";

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var validIds = (req.MemberIds ?? new List<int?>())
                    .Where(x => x.HasValue && x.Value > 0)
                    .Select(x => x!.Value)
                    .ToList();

                if (validIds.Count == 0)
                {
                    using var allCmd = conn.CreateCommand();
                    allCmd.CommandText = $"SELECT MemberId FROM {prefix}SocMember WHERE (@sid <= 0 OR SocietyId = @sid) AND IsDeleted = FALSE LIMIT 10";
                    AddParam(allCmd, "@sid", sid);
                    using var rAll = allCmd.ExecuteReader();
                    while (rAll.Read()) validIds.Add(Convert.ToInt32(rAll["MemberId"]));
                }

                if (validIds.Count == 0)
                    return BadRequest(new { success = false, message = "At least one Member recipient is required." });

                string subTemplate = !string.IsNullOrWhiteSpace(req.TemplateSubject) ? req.TemplateSubject : (req.Subject ?? "");
                string bodyTemplate = !string.IsNullOrWhiteSpace(req.TemplateBody) ? req.TemplateBody : (req.MessageTemplate ?? "");
                string period = !string.IsNullOrWhiteSpace(req.BillMonth) ? req.BillMonth : (req.PeriodLabel ?? "");

                string socName = "HENU CO-OP HOUSING SOCIETY LTD.";
                string regNo = "MH/BOM/2025/1102";
                string socAddress = "Mumbai, Maharashtra";

                using (var sCmd = conn.CreateCommand())
                {
                    sCmd.CommandText = $"SELECT SocietyName, RegistrationNo, Address FROM {prefix}SocietyInfo WHERE SocietyId = @sid";
                    AddParam(sCmd, "@sid", sid);
                    using var sdr = sCmd.ExecuteReader();
                    if (sdr.Read())
                    {
                        socName = sdr["SocietyName"]?.ToString() ?? socName;
                        regNo = sdr["RegistrationNo"]?.ToString() ?? regNo;
                        socAddress = sdr["Address"]?.ToString() ?? socAddress;
                    }
                }

                // Fetch members
                using var mCmd = conn.CreateCommand();
                mCmd.CommandText = $@"
                    SELECT MemberId, MemName, FlatNo, Wing, Email, ContactNo,
                           COALESCE(OpPrincipal, 0) + COALESCE(OpInterest, 0) AS OpBal
                    FROM {prefix}SocMember
                    WHERE (@sid <= 0 OR SocietyId = @sid) AND MemberId IN ({string.Join(",", validIds)})";
                AddParam(mCmd, "@sid", sid);

                var jobsToInsert = new List<(int mid, string name, string address, string sub, string body, string attach)>();
                int skipped = 0;

                using (var r = mCmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        int mid = Convert.ToInt32(r["MemberId"]);
                        string name = r["MemName"]?.ToString() ?? "";
                        string flat = r["FlatNo"]?.ToString() ?? "";
                        string wing = r["Wing"]?.ToString() ?? "";
                        string email = r["Email"]?.ToString()?.Trim() ?? "";
                        string mobile = r["ContactNo"]?.ToString()?.Trim() ?? "";
                        decimal bal = Convert.ToDecimal(r["OpBal"]);

                        string targetAddress = channel.Equals("WHATSAPP", StringComparison.OrdinalIgnoreCase)
                            ? NormalizeIndianMobile(mobile)
                            : (IsValidEmail(email) ? email : "");

                        if (string.IsNullOrWhiteSpace(targetAddress))
                        {
                            skipped++;
                            continue;
                        }

                        string itemSub = RenderTemplate(subTemplate, name, flat, wing, socName, 0, bal, period);
                        string itemBody = RenderTemplate(bodyTemplate, name, flat, wing, socName, 0, bal, period);
                        string itemAttach = !string.IsNullOrWhiteSpace(req.AttachmentName) 
                            ? $"{flat}_{req.AttachmentName}" 
                            : $"{req.CommunicationType ?? "BILL"}_{(!string.IsNullOrWhiteSpace(flat) ? flat : name)}_{DateTime.Now:yyyyMMdd}.pdf";

                        jobsToInsert.Add((mid, name, targetAddress, itemSub, itemBody, itemAttach));
                    }
                }

                using var tx = conn.BeginTransaction();
                int queuedCount = 0;

                foreach (var j in jobsToInsert)
                {
                    using var qCmd = conn.CreateCommand();
                    qCmd.Transaction = tx;
                    qCmd.CommandText = $@"
                        INSERT INTO {prefix}communication_outbox
                            (society_id, financial_year_id, channel, recipient_type, recipient_id,
                             recipient_name, recipient_address, subject, message_body, attachment_name,
                             communication_type, status, attempt_count, scheduled_at)
                        VALUES
                            (@sid, @fyid, @chan, 'MEMBER', @mid, @rname, @raddr, @sub, @body, @attach, @ctype, 'QUEUED', 0, CURRENT_TIMESTAMP)";

                    AddParam(qCmd, "@sid", sid);
                    AddParam(qCmd, "@fyid", fyid);
                    AddParam(qCmd, "@chan", channel);
                    AddParam(qCmd, "@mid", j.mid);
                    AddParam(qCmd, "@rname", j.name);
                    AddParam(qCmd, "@raddr", j.address);
                    AddParam(qCmd, "@sub", j.sub);
                    AddParam(qCmd, "@body", j.body);
                    AddParam(qCmd, "@attach", j.attach);
                    AddParam(qCmd, "@ctype", req.CommunicationType ?? req.FeatureType ?? "BILL");
                    qCmd.ExecuteNonQuery();
                    queuedCount++;
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = $"Successfully queued {queuedCount} {channel} message(s).",
                    queuedCount,
                    skippedCount = skipped,
                    totalRequested = validIds.Count,
                    data = new
                    {
                        queuedCount,
                        skippedCount = skipped,
                        totalRequested = validIds.Count
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to queue communications: " + ex.Message });
            }
        }

        public class CommitteeQueueRequest
        {
            public int? SocietyId { get; set; } = 1;
            public int? FYId { get; set; } = 1;
            public string? Channel { get; set; } = "EMAIL";
            public string? ReportType { get; set; } = "TRIAL_BALANCE";
            public List<int?>? CommitteeIds { get; set; }
            public string? Subject { get; set; }
            public string? TemplateSubject { get; set; }
            public string? MessageTemplate { get; set; }
            public string? TemplateBody { get; set; }
            public string? AttachmentName { get; set; }
            public string? FromDate { get; set; }
            public string? ToDate { get; set; }
        }

        [HttpPost("committee/queue")]
        public IActionResult QueueCommitteeCommunications([FromBody] CommitteeQueueRequest req)
        {
            if (req == null)
                return BadRequest(new { success = false, message = "Invalid request payload." });

            int sid = (req.SocietyId.HasValue && req.SocietyId.Value > 0) ? req.SocietyId.Value : 1;
            int fyid = (req.FYId.HasValue && req.FYId.Value > 0) ? req.FYId.Value : 1;
            string channel = !string.IsNullOrWhiteSpace(req.Channel) ? req.Channel.ToUpperInvariant() : "EMAIL";

            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                var validIds = (req.CommitteeIds ?? new List<int?>())
                    .Where(x => x.HasValue && x.Value > 0)
                    .Select(x => x!.Value)
                    .ToList();

                if (validIds.Count == 0)
                {
                    using var allCmd = conn.CreateCommand();
                    allCmd.CommandText = $"SELECT CommitteeId FROM {prefix}SocCommittee WHERE (@sid <= 0 OR SocietyId = @sid) AND IsActive = TRUE LIMIT 10";
                    AddParam(allCmd, "@sid", sid);
                    using var rAll = allCmd.ExecuteReader();
                    while (rAll.Read()) validIds.Add(Convert.ToInt32(rAll["CommitteeId"]));
                }

                if (validIds.Count == 0)
                    return BadRequest(new { success = false, message = "At least one Committee recipient is required." });

                string rawSub = !string.IsNullOrWhiteSpace(req.TemplateSubject) ? req.TemplateSubject : (req.Subject ?? "");
                string rawBody = !string.IsNullOrWhiteSpace(req.TemplateBody) ? req.TemplateBody : (req.MessageTemplate ?? "");
                string fDate = string.IsNullOrWhiteSpace(req.FromDate) ? "01-04-2026" : req.FromDate;
                string tDate = string.IsNullOrWhiteSpace(req.ToDate) ? DateTime.Now.ToString("dd-MM-yyyy") : req.ToDate;

                string socName = "HENU CO-OP HOUSING SOCIETY LTD.";
                string regNo = "MH/BOM/2025/1102";
                string socAddress = "Mumbai, Maharashtra";

                using (var sCmd = conn.CreateCommand())
                {
                    sCmd.CommandText = $"SELECT SocietyName, RegistrationNo, Address FROM {prefix}SocietyInfo WHERE SocietyId = @sid";
                    AddParam(sCmd, "@sid", sid);
                    using var sdr = sCmd.ExecuteReader();
                    if (sdr.Read())
                    {
                        socName = sdr["SocietyName"]?.ToString() ?? socName;
                        regNo = sdr["RegistrationNo"]?.ToString() ?? regNo;
                        socAddress = sdr["Address"]?.ToString() ?? socAddress;
                    }
                }

                string reportName = (req.ReportType ?? "REPORT").ToUpperInvariant() switch
                {
                    "INCOME_EXPENDITURE" => "Income & Expenditure Statement",
                    "BALANCE_SHEET" => "Form N — Statutory Balance Sheet Statement",
                    "TRIAL_BALANCE" => "Trial Balance Statement",
                    "CASH_BANK_BOOK" => "Cash and Bank Book Statement",
                    "LEDGER_CODE_WISE" or "ACCOUNT_LEDGER_CODE" => "Account Ledger (Code Wise)",
                    "LEDGER_GROUP_WISE" or "ACCOUNT_LEDGER_GROUP" => "Account Ledger (Group Wise)",
                    "RECEIPT_PAYMENT_GROUP" => "Receipt & Payment Summary (Groupwise)",
                    "RECEIPT_PAYMENT_ACCOUNT" => "Receipt & Payment Summary (Accountwise)",
                    "SCHEDULE" => "Financial Balance Sheet Schedules",
                    "MONTHLY_REPORT" => "Monthly Financial Summary Report",
                    "RECEIPT_REGISTER" => "Receipt Voucher Register",
                    "PAYMENT_REGISTER" => "Payment Voucher Register",
                    "CONTRA_REGISTER" => "Contra Voucher Register",
                    "JOURNAL_REGISTER" => "Journal Voucher Register",
                    _ => "Financial Statement Report"
                };

                using var cCmd = conn.CreateCommand();
                cCmd.CommandText = $@"
                    SELECT CommitteeId, MemberName, Designation, Email, ContactNo
                    FROM {prefix}SocCommittee
                    WHERE (@sid <= 0 OR SocietyId = @sid) AND CommitteeId IN ({string.Join(",", validIds)})";
                AddParam(cCmd, "@sid", sid);

                var jobsToInsert = new List<(int cid, string name, string desig, string target)>();
                int skipped = 0;

                using (var r = cCmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        int cid = Convert.ToInt32(r["CommitteeId"]);
                        string name = r["MemberName"]?.ToString() ?? "";
                        string desig = r["Designation"]?.ToString() ?? "";
                        string email = r["Email"]?.ToString()?.Trim() ?? "";
                        string contact = r["ContactNo"]?.ToString()?.Trim() ?? "";

                        string target = channel.Equals("WHATSAPP", StringComparison.OrdinalIgnoreCase)
                            ? NormalizeIndianMobile(contact)
                            : (IsValidEmail(email) ? email : "");

                        if (string.IsNullOrWhiteSpace(target))
                        {
                            skipped++;
                            continue;
                        }

                        jobsToInsert.Add((cid, name, desig, target));
                    }
                }

                using var tx = conn.BeginTransaction();
                int queuedCount = 0;

                foreach (var j in jobsToInsert)
                {
                    string effectiveSub = RenderCommitteeTemplate(rawSub, j.name, j.desig, socName, reportName, fDate, tDate);
                    if (string.IsNullOrWhiteSpace(effectiveSub))
                    {
                        effectiveSub = $"{socName}: Official Financial Report - {reportName}";
                    }
                    effectiveSub = effectiveSub.Replace("[Society]", socName);

                    string effectiveBody = RenderCommitteeTemplate(rawBody, j.name, j.desig, socName, reportName, fDate, tDate);
                    effectiveBody = effectiveBody.Replace("[Society]", socName);

                    if (channel.Equals("WHATSAPP", StringComparison.OrdinalIgnoreCase))
                    {
                        if (string.IsNullOrWhiteSpace(effectiveBody) || effectiveBody.Length < 10)
                        {
                            effectiveBody = $"*HENU ERP — Financial Report Notice*\n\nRespected {j.name} ({j.desig}),\n\nOfficial Accounting Report: *{reportName}*\nSociety: *{socName}*\nPeriod: {fDate} to {tDate}\n\nPlease find attached your official financial statement.\n\n_Accounts & Finance Department_";
                        }
                    }
                    else
                    {
                        if (string.IsNullOrWhiteSpace(effectiveBody) || effectiveBody.Length < 10)
                        {
                            effectiveBody = $"Respected {j.name} ({j.desig}),\n\nPlease find attached the official {reportName} for {socName}.\n\nFinancial Period: {fDate} to {tDate}\n\nRegards,\nAccounts & Finance Department\n{socName}";
                        }
                    }

                    string attachFile = req.AttachmentName ?? $"{req.ReportType}_{DateTime.Now:yyyyMMdd}.pdf";

                    using var insCmd = conn.CreateCommand();
                    insCmd.Transaction = tx;
                    insCmd.CommandText = $@"
                        INSERT INTO {prefix}communication_outbox
                            (society_id, financial_year_id, channel, recipient_type, recipient_id,
                             recipient_name, recipient_address, subject, message_body, attachment_name,
                             communication_type, status, attempt_count, scheduled_at)
                        VALUES
                            (@sid, @fyid, @chan, 'COMMITTEE', @cid, @rname, @raddr, @sub, @body, @attach, @ctype, 'QUEUED', 0, CURRENT_TIMESTAMP)";

                    AddParam(insCmd, "@sid", sid);
                    AddParam(insCmd, "@fyid", fyid);
                    AddParam(insCmd, "@chan", channel);
                    AddParam(insCmd, "@cid", j.cid);
                    AddParam(insCmd, "@rname", $"{j.name} ({j.desig})");
                    AddParam(insCmd, "@raddr", j.target);
                    AddParam(insCmd, "@sub", effectiveSub);
                    AddParam(insCmd, "@body", effectiveBody);
                    AddParam(insCmd, "@attach", attachFile);
                    AddParam(insCmd, "@ctype", req.ReportType ?? "REPORT");
                    insCmd.ExecuteNonQuery();
                    queuedCount++;
                }

                tx.Commit();

                return Ok(new
                {
                    success = true,
                    message = $"Successfully queued {queuedCount} report dispatch(es) to committee members.",
                    queuedCount,
                    skippedCount = skipped,
                    totalRequested = validIds.Count,
                    data = new
                    {
                        queuedCount,
                        skippedCount = skipped,
                        totalRequested = validIds.Count
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to queue committee communications: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 6. BACKGROUND WORKER / OUTBOX PROCESSOR
        // ═══════════════════════════════════════════════════════════

        [HttpPost("outbox/process")]
        public async Task<IActionResult> ProcessOutboxQueue([FromQuery] int societyId = 0, [FromQuery] int batchSize = 50)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                // Fetch queued jobs
                using var fetchCmd = conn.CreateCommand();
                var sql = $@"
                    SELECT id, society_id, channel, recipient_address, recipient_name, subject, message_body,
                           attachment_name, communication_type, attempt_count
                    FROM {prefix}communication_outbox
                    WHERE status IN ('QUEUED', 'RETRY') AND attempt_count < 4";

                if (societyId > 0)
                {
                    sql += " AND society_id = @sid";
                    AddParam(fetchCmd, "@sid", societyId);
                }

                sql += " ORDER BY id ASC LIMIT @limit";
                fetchCmd.CommandText = sql;
                AddParam(fetchCmd, "@limit", batchSize > 0 ? batchSize : 50);

                var jobs = new List<dynamic>();
                using (var r = fetchCmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        jobs.Add(new
                        {
                            id = Convert.ToInt32(r["id"]),
                            societyId = Convert.ToInt32(r["society_id"]),
                            channel = r["channel"]?.ToString() ?? "",
                            address = r["recipient_address"]?.ToString() ?? "",
                            name = r["recipient_name"]?.ToString() ?? "",
                            subject = r["subject"]?.ToString() ?? "",
                            body = r["message_body"]?.ToString() ?? "",
                            attach = r["attachment_name"]?.ToString() ?? "",
                            ctype = r["communication_type"]?.ToString() ?? "",
                            attempts = Convert.ToInt32(r["attempt_count"])
                        });
                    }
                }

                if (jobs.Count == 0)
                    return Ok(new { success = true, message = "No pending jobs in outbox queue.", processed = 0 });

                int successCount = 0;
                int failureCount = 0;

                foreach (var job in jobs)
                {
                    int jobId = job.id;
                    int jobSid = job.societyId;
                    string chan = job.channel;
                    string addr = job.address;
                    string sub = job.subject;
                    string body = job.body;
                    string ctype = job.ctype;
                    int attempts = job.attempts + 1;

                    bool sent = false;
                    string error = "";
                    string provId = "";

                    // Fetch configuration for this specific society
                    string smtpHost = Environment.GetEnvironmentVariable("SMTP_HOST") ?? "smtp.gmail.com";
                    int smtpPort = int.TryParse(Environment.GetEnvironmentVariable("SMTP_PORT"), out var sp) ? sp : 587;
                    string smtpSec = Environment.GetEnvironmentVariable("SMTP_SECURE") ?? "STARTTLS";
                    string smtpUser = Environment.GetEnvironmentVariable("SMTP_USER") ?? "henuospvtltd@gmail.com";
                    string smtpPass = Environment.GetEnvironmentVariable("SMTP_PASS") ?? "khcw oler xtix zmem";
                    string fromEmail = Environment.GetEnvironmentVariable("SMTP_FROM_EMAIL") ?? "henuospvtltd@gmail.com";
                    string fromName = Environment.GetEnvironmentVariable("SMTP_FROM_NAME") ?? "HENU OS PRIVATE LIMITED";
                    bool emailActive = true;

                    string waPhoneId = Environment.GetEnvironmentVariable("META_PHONE_NUMBER_ID") ?? "1185567017980748";
                    string waToken = Environment.GetEnvironmentVariable("META_ACCESS_TOKEN") ?? "EAAPYNIdf3wIBSot66zRZBFoajCCYPf8ZBCo0b5IRT6rnwIsm8oVLISzlsFZCq0aB66SzZCt2obacSu8MsWveZAxuQB2ieRhqRDdl2Onl1HXO2ZCzuuZAQhAy00FQe6X8bAh2u3gyH3QlkvZCMwj8Iu6TRes3R1lbMOonV3nJMlaRZCMpFSbZCJMkfKdfRvZBTkOfCKiUgZDZD";
                    bool waActive = true;

                    using (var cfgCmd = conn.CreateCommand())
                    {
                        cfgCmd.CommandText = $"SELECT * FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = @chan AND is_active = TRUE";
                        AddParam(cfgCmd, "@sid", jobSid);
                        AddParam(cfgCmd, "@chan", chan);
                        using var rCfg = cfgCmd.ExecuteReader();
                        if (rCfg.Read())
                        {
                            if (chan == "EMAIL")
                            {
                                var h = rCfg["smtp_host"]?.ToString();
                                if (!string.IsNullOrWhiteSpace(h)) smtpHost = h;
                                var p = Convert.ToInt32(rCfg["smtp_port"]);
                                if (p > 0) smtpPort = p;
                                var s = rCfg["smtp_secure"]?.ToString();
                                if (!string.IsNullOrWhiteSpace(s)) smtpSec = s;
                                var u = rCfg["smtp_username"]?.ToString();
                                if (!string.IsNullOrWhiteSpace(u)) smtpUser = u;
                                var ep = rCfg["smtp_password_encrypted"]?.ToString();
                                if (!string.IsNullOrWhiteSpace(ep)) smtpPass = DecryptSecret(ep);
                                var fe = rCfg["from_email"]?.ToString();
                                if (!string.IsNullOrWhiteSpace(fe)) fromEmail = fe;
                                var fn = rCfg["from_name"]?.ToString();
                                if (!string.IsNullOrWhiteSpace(fn)) fromName = fn;
                            }
                            else if (chan == "WHATSAPP")
                            {
                                var pid = rCfg["phone_number_id"]?.ToString();
                                if (!string.IsNullOrWhiteSpace(pid)) waPhoneId = pid;
                                var tok = rCfg["access_token_encrypted"]?.ToString();
                                if (!string.IsNullOrWhiteSpace(tok)) waToken = DecryptSecret(tok);
                            }
                        }
                    }

                    // Fetch Society Details for document and branding
                    string jobSocName = "HENU CO-OP HOUSING SOCIETY LTD.";
                    string jobRegNo = "MH/BOM/2025/1102";
                    string jobSocAddress = "Mumbai, Maharashtra";

                    using (var sCmd = conn.CreateCommand())
                    {
                        sCmd.CommandText = $"SELECT SocietyName, RegistrationNo, Address FROM {prefix}SocietyInfo WHERE SocietyId = @sid";
                        AddParam(sCmd, "@sid", jobSid);
                        using var sdr = sCmd.ExecuteReader();
                        if (sdr.Read())
                        {
                            jobSocName = sdr["SocietyName"]?.ToString() ?? jobSocName;
                            jobRegNo = sdr["RegistrationNo"]?.ToString() ?? jobRegNo;
                            jobSocAddress = sdr["Address"]?.ToString() ?? jobSocAddress;
                        }
                    }

                    if (chan == "EMAIL")
                    {
                        if (string.IsNullOrWhiteSpace(smtpHost) || string.IsNullOrWhiteSpace(fromEmail))
                        {
                            error = "Email SMTP is not configured.";
                        }
                        else
                        {
                            try
                            {
                                using var msg = new MailMessage(new MailAddress(fromEmail, fromName), new MailAddress(addr));
                                msg.Subject = sub;

                                string htmlBody = $@"
<!DOCTYPE html>
<html>
<head>
<meta charset='utf-8'>
<style>
  body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #333; }}
  .email-container {{ max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }}
  .email-header {{ background: linear-gradient(135deg, #005F73 0%, #0A9396 100%); color: #ffffff; padding: 24px 30px; text-align: left; }}
  .soc-name {{ font-size: 18px; font-weight: 700; margin: 0 0 4px 0; letter-spacing: 0.5px; text-transform: uppercase; }}
  .soc-meta {{ font-size: 12px; color: #e0f2f1; margin: 0; }}
  .email-body {{ padding: 30px; line-height: 1.6; font-size: 14px; color: #2d3748; }}
  .content-text {{ margin-bottom: 24px; white-space: pre-line; }}
  .attachment-card {{ display: flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 18px; margin: 20px 0; }}
  .attachment-icon {{ font-size: 24px; margin-right: 14px; color: #e53e3e; }}
  .attachment-info {{ flex: 1; }}
  .attachment-title {{ font-size: 13px; font-weight: 600; color: #1e293b; margin: 0; }}
  .attachment-sub {{ font-size: 11px; color: #64748b; margin: 2px 0 0 0; }}
  .email-footer {{ background: #f8fafc; padding: 16px 30px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }}
</style>
</head>
<body>
<div class='email-container'>
  <div class='email-header'>
    <h1 class='soc-name'>{WebUtility.HtmlEncode(jobSocName)}</h1>
    <p class='soc-meta'>Reg. No: {WebUtility.HtmlEncode(jobRegNo)} | {WebUtility.HtmlEncode(jobSocAddress)}</p>
  </div>
  <div class='email-body'>
    <div class='content-text'>{WebUtility.HtmlEncode(body).Replace("\n", "<br>")}</div>
    {(!string.IsNullOrWhiteSpace(job.attach) ? $@"
    <div class='attachment-card'>
      <div class='attachment-icon'>&#128196;</div>
      <div class='attachment-info'>
        <p class='attachment-title'>{WebUtility.HtmlEncode(job.attach)}</p>
        <p class='attachment-sub'>Official Certified PDF Attachment (Attached to this email)</p>
      </div>
    </div>" : "")}
  </div>
  <div class='email-footer'>
    <p>This is an official communication dispatched from <strong>HENU ERP</strong> Society Accounting System.</p>
    <p>&copy; 2026 {WebUtility.HtmlEncode(jobSocName)}. All rights reserved.</p>
  </div>
</div>
</body>
</html>";

                                msg.Body = htmlBody;
                                msg.IsBodyHtml = true;

                                // Generate and attach statutory PDF report
                                if (!string.IsNullOrWhiteSpace(job.attach))
                                {
                                    try
                                    {
                                        byte[] pdfBytes = PdfReportGenerator.GenerateReportPdf(
                                            ctype,
                                            jobSid,
                                            jobSocName,
                                            jobRegNo,
                                            jobSocAddress,
                                            job.name,
                                            "",
                                            "01-04-2026",
                                            DateTime.Now.ToString("dd-MM-yyyy"),
                                            conn);

                                        if (pdfBytes != null && pdfBytes.Length > 0)
                                        {
                                            var msPdf = new MemoryStream(pdfBytes);
                                            var att = new Attachment(msPdf, job.attach, "application/pdf");
                                            msg.Attachments.Add(att);
                                        }
                                    }
                                    catch
                                    {
                                        // If PDF generation has any error, still deliver the email
                                    }
                                }

                                using var smtp = new SmtpClient(smtpHost, smtpPort);
                                smtp.EnableSsl = smtpSec.Equals("SSL", StringComparison.OrdinalIgnoreCase) || smtpSec.Equals("STARTTLS", StringComparison.OrdinalIgnoreCase) || smtpPort == 465 || smtpPort == 587;
                                smtp.Timeout = 15000;
                                if (!string.IsNullOrWhiteSpace(smtpUser)) smtp.Credentials = new NetworkCredential(smtpUser, smtpPass);

                                await smtp.SendMailAsync(msg);
                                sent = true;
                                provId = $"SMTP-{Guid.NewGuid().ToString("N")[..12]}";
                            }
                            catch (Exception ex)
                            {
                                error = ex.Message;
                            }
                        }
                    }
                    else if (chan == "WHATSAPP")
                    {
                        if (!waActive)
                        {
                            error = "WhatsApp Cloud API is not configured or inactive.";
                        }
                        else
                        {
                            try
                            {
                                string waBody = body;
                                if (string.IsNullOrWhiteSpace(waBody))
                                {
                                    waBody = $"*HENU ERP — Official Society Notice*\n\nRespected {job.name},\n\nOfficial Accounting Report: *{ctype}*\nSociety: *{jobSocName}*\n\nPlease find your official accounting notice.\n\n_Accounts & Finance Department_";
                                }

                                var payload = new
                                {
                                    messaging_product = "whatsapp",
                                    recipient_type = "individual",
                                    to = addr,
                                    type = "text",
                                    text = new { preview_url = false, body = waBody }
                                };
                                var json = JsonSerializer.Serialize(payload);
                                var url = $"https://graph.facebook.com/v20.0/{waPhoneId}/messages";
                                using var reqMsg = new HttpRequestMessage(HttpMethod.Post, url);
                                reqMsg.Headers.Add("Authorization", $"Bearer {waToken}");
                                reqMsg.Content = new StringContent(json, Encoding.UTF8, "application/json");

                                var resp = await _httpClient.SendAsync(reqMsg);
                                var respText = await resp.Content.ReadAsStringAsync();

                                if (resp.IsSuccessStatusCode)
                                {
                                    sent = true;
                                    try
                                    {
                                        using var doc = JsonDocument.Parse(respText);
                                        if (doc.RootElement.TryGetProperty("messages", out var msgs) && msgs.GetArrayLength() > 0)
                                            provId = msgs[0].GetProperty("id").GetString() ?? "";
                                    }
                                    catch { }
                                }
                                else
                                {
                                    error = $"Meta API {resp.StatusCode}: {respText}";
                                }
                            }
                            catch (Exception ex)
                            {
                                error = ex.Message;
                            }
                        }
                    }

                    // Update outbox row
                    using var upCmd = conn.CreateCommand();
                    if (sent)
                    {
                        upCmd.CommandText = $@"
                            UPDATE {prefix}communication_outbox
                            SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, provider_message_id = @pid, attempt_count = @att, updated_at = CURRENT_TIMESTAMP
                            WHERE id = @id";
                        AddParam(upCmd, "@pid", provId);
                        AddParam(upCmd, "@att", attempts);
                        AddParam(upCmd, "@id", jobId);
                        upCmd.ExecuteNonQuery();
                        successCount++;
                    }
                    else
                    {
                        string nextStatus = attempts >= 3 ? "FAILED" : "RETRY";
                        upCmd.CommandText = $@"
                            UPDATE {prefix}communication_outbox
                            SET status = @st, last_error = @err, attempt_count = @att, failed_at = CASE WHEN @st = 'FAILED' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
                            WHERE id = @id";
                        AddParam(upCmd, "@st", nextStatus);
                        AddParam(upCmd, "@err", error);
                        AddParam(upCmd, "@att", attempts);
                        AddParam(upCmd, "@id", jobId);
                        upCmd.ExecuteNonQuery();
                        failureCount++;
                    }

                    // Log activity
                    using var lCmd = conn.CreateCommand();
                    lCmd.CommandText = $@"
                        INSERT INTO {prefix}communication_logs
                            (outbox_id, society_id, channel, recipient, communication_type, provider, provider_message_id, status, error_message, attempt_count)
                        VALUES
                            (@oid, @sid, @chan, @rec, @ctype, @prov, @pid, @st, @err, @att)";
                    AddParam(lCmd, "@oid", jobId);
                    AddParam(lCmd, "@sid", societyId);
                    AddParam(lCmd, "@chan", chan);
                    AddParam(lCmd, "@rec", addr);
                    AddParam(lCmd, "@ctype", ctype);
                    AddParam(lCmd, "@prov", chan == "EMAIL" ? "SMTP" : "META_CLOUD");
                    AddParam(lCmd, "@pid", provId);
                    AddParam(lCmd, "@st", sent ? "SENT" : "FAILED");
                    AddParam(lCmd, "@err", string.IsNullOrEmpty(error) ? DBNull.Value : error);
                    AddParam(lCmd, "@att", attempts);
                    lCmd.ExecuteNonQuery();
                }

                return Ok(new
                {
                    success = true,
                    message = $"Processed {jobs.Count} jobs from outbox queue: {successCount} sent, {failureCount} failed/queued for retry.",
                    processed = jobs.Count,
                    sent = successCount,
                    failed = failureCount
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Outbox processing error: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 7. OUTBOX & DELIVERY HISTORY AUDIT
        // ═══════════════════════════════════════════════════════════

        [HttpGet("outbox")]
        public IActionResult GetOutboxStatus([FromQuery] int societyId = 1, [FromQuery] string? channel = null, [FromQuery] string? status = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT id, society_id, channel, recipient_type, recipient_name, recipient_address,
                           subject, attachment_name, communication_type, status, attempt_count,
                           scheduled_at, sent_at, failed_at, last_error
                    FROM {prefix}communication_outbox
                    WHERE society_id = @sid";

                if (!string.IsNullOrWhiteSpace(channel) && channel != "ALL")
                {
                    sql += " AND channel = @chan";
                    AddParam(cmd, "@chan", channel);
                }
                if (!string.IsNullOrWhiteSpace(status) && status != "ALL")
                {
                    sql += " AND status = @st";
                    AddParam(cmd, "@st", status);
                }

                sql += " ORDER BY id DESC LIMIT 100";
                cmd.CommandText = sql;
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        id = Convert.ToInt32(r["id"]),
                        societyId = Convert.ToInt32(r["society_id"]),
                        channel = r["channel"]?.ToString() ?? "",
                        recipientType = r["recipient_type"]?.ToString() ?? "",
                        recipientName = r["recipient_name"]?.ToString() ?? "",
                        recipientAddress = r["recipient_address"]?.ToString() ?? "",
                        subject = r["subject"]?.ToString() ?? "",
                        attachmentName = r["attachment_name"]?.ToString() ?? "",
                        communicationType = r["communication_type"]?.ToString() ?? "",
                        status = r["status"]?.ToString() ?? "",
                        attemptCount = Convert.ToInt32(r["attempt_count"]),
                        scheduledAt = r["scheduled_at"] is DateTime dtS ? dtS.ToString("yyyy-MM-dd HH:mm:ss") : "",
                        sentAt = r["sent_at"] is DateTime dtSent ? dtSent.ToString("yyyy-MM-dd HH:mm:ss") : null,
                        failedAt = r["failed_at"] is DateTime dtFail ? dtFail.ToString("yyyy-MM-dd HH:mm:ss") : null,
                        lastError = r["last_error"]?.ToString() ?? ""
                    });
                }

                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load outbox: " + ex.Message });
            }
        }

        [HttpGet("history")]
        public IActionResult GetCommunicationHistory([FromQuery] int societyId = 1, [FromQuery] string? channel = null, [FromQuery] string? communicationType = null)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                var sql = $@"
                    SELECT id, outbox_id, society_id, channel, recipient, communication_type,
                           provider, provider_message_id, status, error_message, attempt_count, is_test, created_at
                    FROM {prefix}communication_logs
                    WHERE society_id = @sid";

                if (!string.IsNullOrWhiteSpace(channel) && channel != "ALL")
                {
                    sql += " AND channel = @chan";
                    AddParam(cmd, "@chan", channel);
                }
                if (!string.IsNullOrWhiteSpace(communicationType) && communicationType != "ALL")
                {
                    sql += " AND communication_type = @ctype";
                    AddParam(cmd, "@ctype", communicationType);
                }

                sql += " ORDER BY id DESC LIMIT 150";
                cmd.CommandText = sql;
                AddParam(cmd, "@sid", societyId > 0 ? societyId : 1);

                var list = new List<object>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    list.Add(new
                    {
                        id = Convert.ToInt32(r["id"]),
                        outboxId = r["outbox_id"] == DBNull.Value ? (int?)null : Convert.ToInt32(r["outbox_id"]),
                        societyId = Convert.ToInt32(r["society_id"]),
                        channel = r["channel"]?.ToString() ?? "",
                        recipient = r["recipient"]?.ToString() ?? "",
                        communicationType = r["communication_type"]?.ToString() ?? "",
                        provider = r["provider"]?.ToString() ?? "",
                        providerMessageId = r["provider_message_id"]?.ToString() ?? "",
                        status = r["status"]?.ToString() ?? "",
                        errorMessage = r["error_message"]?.ToString() ?? "",
                        attemptCount = Convert.ToInt32(r["attempt_count"]),
                        isTest = Convert.ToBoolean(r["is_test"]),
                        createdAt = r["created_at"] is DateTime dt ? dt.ToString("yyyy-MM-dd HH:mm:ss") : ""
                    });
                }

                return Ok(new { success = true, count = list.Count, data = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Failed to load history: " + ex.Message });
            }
        }

        [HttpPost("history/{id:int}/retry")]
        public IActionResult RetryCommunicationJob(int id)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                using var cmd = conn.CreateCommand();
                cmd.CommandText = $@"
                    UPDATE {prefix}communication_outbox
                    SET status = 'QUEUED', attempt_count = 0, last_error = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE id = @id OR id = (SELECT outbox_id FROM {prefix}communication_logs WHERE id = @id AND outbox_id IS NOT NULL LIMIT 1)";
                AddParam(cmd, "@id", id);
                int rows = cmd.ExecuteNonQuery();

                if (rows == 0) return NotFound(new { success = false, message = "Job not found in outbox or history." });

                return Ok(new { success = true, message = "Job re-queued for immediate dispatch." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Retry failed: " + ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 8. WHATSAPP WEBHOOK (Verification & Real-Time Ingest)
        // ═══════════════════════════════════════════════════════════

        [HttpGet("webhook/whatsapp")]
        public IActionResult VerifyWhatsAppWebhook([FromQuery(Name = "hub.mode")] string? mode,
                                                  [FromQuery(Name = "hub.verify_token")] string? verifyToken,
                                                  [FromQuery(Name = "hub.challenge")] string? challenge)
        {
            if (mode == "subscribe" && !string.IsNullOrWhiteSpace(challenge))
            {
                return Ok(challenge);
            }
            return Forbid();
        }

        [HttpPost("webhook/whatsapp")]
        public async Task<IActionResult> ReceiveWhatsAppWebhook([FromBody] JsonElement body)
        {
            try
            {
                using var conn = DbHelper.GetConn();
                EnsureCommunicationTables(conn);
                string prefix = GetSchemaPrefix(conn);

                if (body.TryGetProperty("entry", out var entry) && entry.GetArrayLength() > 0)
                {
                    foreach (var e in entry.EnumerateArray())
                    {
                        if (e.TryGetProperty("changes", out var changes))
                        {
                            foreach (var c in changes.EnumerateArray())
                            {
                                if (c.TryGetProperty("value", out var val))
                                {
                                    int societyId = 1; // Default or resolve via phone_number_id
                                    string metaPhoneId = "";
                                    if (val.TryGetProperty("metadata", out var meta) && meta.TryGetProperty("phone_number_id", out var pidProp))
                                    {
                                        metaPhoneId = pidProp.GetString() ?? "";
                                        using var scmd = conn.CreateCommand();
                                        scmd.CommandText = $"SELECT society_id FROM {prefix}communication_configurations WHERE phone_number_id = @pid LIMIT 1";
                                        AddParam(scmd, "@pid", metaPhoneId);
                                        var sObj = scmd.ExecuteScalar();
                                        if (sObj != null && sObj != DBNull.Value) societyId = Convert.ToInt32(sObj);
                                    }

                                    // 1. Process Status Updates (SENT, DELIVERED, READ, FAILED)
                                    if (val.TryGetProperty("statuses", out var statuses))
                                    {
                                        foreach (var st in statuses.EnumerateArray())
                                        {
                                            string msgId = st.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
                                            string status = st.TryGetProperty("status", out var sProp) ? sProp.GetString()?.ToUpperInvariant() ?? "" : "";
                                            string recipientPhone = st.TryGetProperty("recipient_id", out var rProp) ? rProp.GetString() ?? "" : "";

                                            if (!string.IsNullOrEmpty(msgId) && !string.IsNullOrEmpty(status))
                                            {
                                                using var upCmd = conn.CreateCommand();
                                                upCmd.CommandText = $@"
                                                    UPDATE {prefix}communication_outbox
                                                    SET status = @st,
                                                        delivered_at = CASE WHEN @st = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
                                                        read_at = CASE WHEN @st = 'READ' THEN CURRENT_TIMESTAMP ELSE read_at END,
                                                        updated_at = CURRENT_TIMESTAMP
                                                    WHERE provider_message_id = @pid;

                                                    UPDATE {prefix}communication_messages
                                                    SET status = @st,
                                                        delivered_at = CASE WHEN @st = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
                                                        read_at = CASE WHEN @st = 'READ' THEN CURRENT_TIMESTAMP ELSE read_at END
                                                    WHERE whatsapp_message_id = @pid;

                                                    INSERT INTO {prefix}communication_logs
                                                        (society_id, channel, recipient, communication_type, provider, provider_message_id, status, is_test)
                                                    VALUES
                                                        (@sid, 'WHATSAPP', @rec, 'STATUS_WEBHOOK', 'META_CLOUD', @pid, @st, FALSE);";
                                                AddParam(upCmd, "@st", status);
                                                AddParam(upCmd, "@pid", msgId);
                                                AddParam(upCmd, "@sid", societyId);
                                                AddParam(upCmd, "@rec", recipientPhone);
                                                upCmd.ExecuteNonQuery();

                                                // SignalR Event Emission
                                                if (_hubContext != null)
                                                {
                                                    string eventName = status switch
                                                    {
                                                        "DELIVERED" => "WhatsAppMessageDelivered",
                                                        "READ" => "WhatsAppMessageRead",
                                                        "FAILED" => "WhatsAppMessageFailed",
                                                        _ => "WhatsAppMessageSent"
                                                    };

                                                    await _hubContext.Clients.Group($"society_{societyId}").SendAsync(eventName, new
                                                    {
                                                        providerMessageId = msgId,
                                                        recipient = recipientPhone,
                                                        status = status,
                                                        timestamp = DateTime.UtcNow.ToString("o")
                                                    });
                                                }
                                            }
                                        }
                                    }

                                    // 2. Process Incoming Messages (Inbound)
                                    if (val.TryGetProperty("messages", out var messages))
                                    {
                                        string contactName = "";
                                        if (val.TryGetProperty("contacts", out var contacts) && contacts.GetArrayLength() > 0)
                                        {
                                            var firstContact = contacts[0];
                                            if (firstContact.TryGetProperty("profile", out var prof) && prof.TryGetProperty("name", out var cpName))
                                            {
                                                contactName = cpName.GetString() ?? "";
                                            }
                                        }

                                        foreach (var msg in messages.EnumerateArray())
                                        {
                                            string wamid = msg.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
                                            string fromPhone = msg.TryGetProperty("from", out var fProp) ? fProp.GetString() ?? "" : "";
                                            string msgType = msg.TryGetProperty("type", out var tProp) ? tProp.GetString()?.ToUpperInvariant() ?? "TEXT" : "TEXT";

                                            string bodyText = "";
                                            string mediaId = "";
                                            string mediaUrl = "";
                                            string filename = "";
                                            string mimeType = "";

                                            if (msgType == "TEXT" && msg.TryGetProperty("text", out var txtObj) && txtObj.TryGetProperty("body", out var bProp))
                                            {
                                                bodyText = bProp.GetString() ?? "";
                                            }
                                            else if (msgType == "IMAGE" && msg.TryGetProperty("image", out var imgObj))
                                            {
                                                mediaId = imgObj.TryGetProperty("id", out var miProp) ? miProp.GetString() ?? "" : "";
                                                mimeType = imgObj.TryGetProperty("mime_type", out var mtProp) ? mtProp.GetString() ?? "image/jpeg" : "image/jpeg";
                                                bodyText = imgObj.TryGetProperty("caption", out var capProp) ? capProp.GetString() ?? "[Image]" : "[Image]";
                                            }
                                            else if (msgType == "DOCUMENT" && msg.TryGetProperty("document", out var docObj))
                                            {
                                                mediaId = docObj.TryGetProperty("id", out var diProp) ? diProp.GetString() ?? "" : "";
                                                filename = docObj.TryGetProperty("filename", out var fnProp) ? fnProp.GetString() ?? "Document.pdf" : "Document.pdf";
                                                mimeType = docObj.TryGetProperty("mime_type", out var dmtProp) ? dmtProp.GetString() ?? "application/pdf" : "application/pdf";
                                                bodyText = docObj.TryGetProperty("caption", out var dcapProp) ? dcapProp.GetString() ?? $"[Document: {filename}]" : $"[Document: {filename}]";
                                            }
                                            else if (msgType == "INTERACTIVE" && msg.TryGetProperty("interactive", out var intObj))
                                            {
                                                if (intObj.TryGetProperty("button_reply", out var btnObj) && btnObj.TryGetProperty("title", out var btProp))
                                                {
                                                    bodyText = btProp.GetString() ?? "[Button Clicked]";
                                                }
                                                else if (intObj.TryGetProperty("list_reply", out var listObj) && listObj.TryGetProperty("title", out var ltProp))
                                                {
                                                    bodyText = ltProp.GetString() ?? "[List Item Selected]";
                                                }
                                            }
                                            else
                                            {
                                                bodyText = $"[{msgType} Message Received]";
                                            }

                                            string cleanFrom = NormalizeIndianMobile(fromPhone);

                                            // Match member by contact number
                                            int memberId = 0;
                                            string resolvedName = contactName;
                                            using (var mCmd = conn.CreateCommand())
                                            {
                                                mCmd.CommandText = $"SELECT MemberId, MemName, FlatNo, Wing FROM {prefix}SocMember WHERE SocietyId = @sid AND (ContactNo LIKE @c1 OR ContactNo LIKE @c2) LIMIT 1";
                                                AddParam(mCmd, "@sid", societyId);
                                                AddParam(mCmd, "@c1", $"%{cleanFrom.Substring(Math.Max(0, cleanFrom.Length - 10))}%");
                                                AddParam(mCmd, "@c2", $"%{cleanFrom}%");
                                                using var mr = mCmd.ExecuteReader();
                                                if (mr.Read())
                                                {
                                                    memberId = Convert.ToInt32(mr["MemberId"]);
                                                    resolvedName = $"{mr["MemName"]} ({mr["Wing"]}-{mr["FlatNo"]})";
                                                }
                                            }

                                            if (string.IsNullOrWhiteSpace(resolvedName)) resolvedName = cleanFrom;

                                            // Ensure conversation
                                            int convId = EnsureConversationInternal(conn, prefix, societyId, memberId, resolvedName, cleanFrom);

                                            // Insert message
                                            using (var insCmd = conn.CreateCommand())
                                            {
                                                insCmd.CommandText = $@"
                                                    INSERT INTO {prefix}communication_messages
                                                        (society_id, conversation_id, member_id, phone_number, direction, message_type, body,
                                                         media_id, media_url, filename, mime_type, whatsapp_message_id, status, created_at, delivered_at)
                                                    VALUES
                                                        (@sid, @cid, @mid, @ph, 'INBOUND', @mtype, @body, @mid_media, @murl, @fn, @mt, @wamid, 'DELIVERED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

                                                    UPDATE {prefix}communication_conversations
                                                    SET unread_count = unread_count + 1, last_message = @body, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                                                    WHERE id = @cid;

                                                    INSERT INTO {prefix}communication_logs
                                                        (society_id, channel, recipient, communication_type, provider, provider_message_id, status, is_test)
                                                    VALUES
                                                        (@sid, 'WHATSAPP', @ph, 'INBOUND_MESSAGE', 'META_CLOUD', @wamid, 'DELIVERED', FALSE);";

                                                AddParam(insCmd, "@sid", societyId);
                                                AddParam(insCmd, "@cid", convId);
                                                AddParam(insCmd, "@mid", memberId);
                                                AddParam(insCmd, "@ph", cleanFrom);
                                                AddParam(insCmd, "@mtype", msgType);
                                                AddParam(insCmd, "@body", bodyText);
                                                AddParam(insCmd, "@mid_media", mediaId);
                                                AddParam(insCmd, "@murl", mediaUrl);
                                                AddParam(insCmd, "@fn", filename);
                                                AddParam(insCmd, "@mt", mimeType);
                                                AddParam(insCmd, "@wamid", wamid);
                                                insCmd.ExecuteNonQuery();
                                            }

                                            // SignalR Live Events
                                            if (_hubContext != null)
                                            {
                                                var eventData = new
                                                {
                                                    conversationId = convId,
                                                    memberId = memberId,
                                                    contactName = resolvedName,
                                                    phoneNumber = cleanFrom,
                                                    direction = "INBOUND",
                                                    messageType = msgType,
                                                    body = bodyText,
                                                    providerMessageId = wamid,
                                                    status = "DELIVERED",
                                                    timestamp = DateTime.UtcNow.ToString("o")
                                                };

                                                await _hubContext.Clients.Group($"society_{societyId}").SendAsync("WhatsAppMessageReceived", eventData);
                                                await _hubContext.Clients.Group($"society_{societyId}").SendAsync("WhatsAppConversationUpdated", new
                                                {
                                                    conversationId = convId,
                                                    lastMessage = bodyText,
                                                    lastMessageAt = DateTime.UtcNow.ToString("o")
                                                });
                                                await _hubContext.Clients.Group($"conv_{convId}").SendAsync("WhatsAppMessageReceived", eventData);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                return Ok(new { status = "EVENT_RECEIVED" });
            }
            catch
            {
                return Ok(new { status = "EVENT_RECEIVED" });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // HELPER METHODS & VALIDATION
        // ═══════════════════════════════════════════════════════════

        private static bool IsValidEmail(string email)
        {
            if (string.IsNullOrWhiteSpace(email)) return false;
            return Regex.IsMatch(email.Trim(), @"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.IgnoreCase);
        }

        private static string NormalizeIndianMobile(string mobile)
        {
            if (string.IsNullOrWhiteSpace(mobile)) return "";
            var digits = Regex.Replace(mobile, @"[^\d]", "");
            if (digits.Length == 10) return "91" + digits;
            if (digits.StartsWith("0") && digits.Length == 11) return "91" + digits.Substring(1);
            if (digits.StartsWith("91") && digits.Length == 12) return digits;
            if (digits.Length >= 10) return digits;
            return digits;
        }

        private static string RenderTemplate(string template, string memName, string flatNo, string wing, string socName, decimal billAmt, decimal outBal, string? period)
        {
            if (string.IsNullOrWhiteSpace(template)) return "";
            string billDateStr = period ?? DateTime.Now.ToString("MMMM yyyy");
            string dueDateStr = DateTime.Now.AddDays(15).ToString("dd-MM-yyyy");
            string billAmtStr = billAmt > 0 ? $"₹{billAmt:N2}" : "₹3,500.00";
            string outBalStr = outBal > 0 ? $"₹{outBal:N2}" : "₹12,450.00";

            return template
                .Replace("{{member_name}}", memName)
                .Replace("{member_name}", memName)
                .Replace("{{name}}", memName)
                .Replace("{name}", memName)
                .Replace("{{flat_no}}", flatNo)
                .Replace("{flat_no}", flatNo)
                .Replace("{{wing}}", wing)
                .Replace("{wing}", wing)
                .Replace("{{society_name}}", socName)
                .Replace("{society_name}", socName)
                .Replace("{{bill_no}}", $"BILL/{DateTime.Now:yyyyMM}/001")
                .Replace("{bill_no}", $"BILL/{DateTime.Now:yyyyMM}/001")
                .Replace("{{bill_date}}", billDateStr)
                .Replace("{bill_date}", billDateStr)
                .Replace("{{bill_amount}}", billAmtStr)
                .Replace("{bill_amount}", billAmtStr)
                .Replace("{{outstanding_amount}}", outBalStr)
                .Replace("{outstanding_amount}", outBalStr)
                .Replace("{{due_date}}", dueDateStr)
                .Replace("{due_date}", dueDateStr)
                .Replace("{{receipt_no}}", $"MRV/{DateTime.Now:yyyyMM}/104")
                .Replace("{receipt_no}", $"MRV/{DateTime.Now:yyyyMM}/104")
                .Replace("{{period}}", billDateStr)
                .Replace("{period}", billDateStr)
                .Replace("{{financial_year}}", "2026-27")
                .Replace("{financial_year}", "2026-27");
        }

        private static string RenderCommitteeTemplate(string template, string memName, string desig, string socName, string reportName, string? fromDate, string? toDate)
        {
            if (string.IsNullOrWhiteSpace(template)) return "";
            string fDate = fromDate ?? "01-04-2026";
            string tDate = toDate ?? DateTime.Now.ToString("dd-MM-yyyy");
            string periodStr = $"{fDate} to {tDate}";

            return template
                .Replace("{{member_name}}", memName)
                .Replace("{member_name}", memName)
                .Replace("{{designation}}", desig)
                .Replace("{designation}", desig)
                .Replace("{{society_name}}", socName)
                .Replace("{society_name}", socName)
                .Replace("{{report_name}}", reportName)
                .Replace("{report_name}", reportName)
                .Replace("{{period}}", periodStr)
                .Replace("{period}", periodStr)
                .Replace("{{from_date}}", fDate)
                .Replace("{from_date}", fDate)
                .Replace("{{to_date}}", tDate)
                .Replace("{to_date}", tDate)
                .Replace("{{financial_year}}", "2026-27")
                .Replace("{financial_year}", "2026-27");
        }
    }
}
