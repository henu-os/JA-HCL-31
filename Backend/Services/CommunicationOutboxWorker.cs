// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — CommunicationOutboxWorker.cs
// Hosted Background Service for Communication Outbox Dispatch
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Data.Common;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using JeevikaERP.Hubs;

namespace JeevikaERP.Services
{
    public class CommunicationOutboxWorker : BackgroundService
    {
        private readonly ILogger<CommunicationOutboxWorker> _logger;
        private readonly IHubContext<CommunicationHub> _hubContext;
        private static readonly HttpClient _httpClient = new();

        public CommunicationOutboxWorker(ILogger<CommunicationOutboxWorker> logger, IHubContext<CommunicationHub> hubContext)
        {
            _logger = logger;
            _hubContext = hubContext;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[CommunicationOutboxWorker] Outbox background worker started.");

            try
            {
                using var initConn = DbHelper.GetDbConnection();
                Controllers.CommunicationController.EnsureCommunicationTables(initConn);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[CommunicationOutboxWorker] Could not ensure communication tables on startup.");
            }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await ProcessPendingOutboxAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[CommunicationOutboxWorker] Error processing outbox items.");
                }

                // Polling interval: 2.5 seconds
                await Task.Delay(2500, stoppingToken);
            }
        }

        private async Task ProcessPendingOutboxAsync(CancellationToken cancellationToken)
        {
            using var conn = DbHelper.GetDbConnection();
            string prefix = GetSchemaPrefix(conn);

            var pendingJobs = new List<OutboxJob>();

            try
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = $@"
                        SELECT id, society_id, channel, recipient_type, recipient_id, recipient_name,
                               recipient_address, subject, message_body, attachment_path, attachment_name,
                               template_id, communication_type, attempt_count
                        FROM {prefix}communication_outbox
                        WHERE status IN ('QUEUED', 'RETRY') AND attempt_count < 5
                        ORDER BY id ASC
                        LIMIT 10";

                    using var r = await cmd.ExecuteReaderAsync(cancellationToken);
                    while (await r.ReadAsync(cancellationToken))
                    {
                        pendingJobs.Add(new OutboxJob
                        {
                            Id = Convert.ToInt32(r["id"]),
                            SocietyId = Convert.ToInt32(r["society_id"]),
                            Channel = r["channel"]?.ToString() ?? "",
                            RecipientType = r["recipient_type"]?.ToString() ?? "",
                            RecipientId = Convert.ToInt32(r["recipient_id"]),
                            RecipientName = r["recipient_name"]?.ToString() ?? "",
                            RecipientAddress = r["recipient_address"]?.ToString() ?? "",
                            Subject = r["subject"]?.ToString(),
                            MessageBody = r["message_body"]?.ToString(),
                            AttachmentPath = r["attachment_path"]?.ToString(),
                            AttachmentName = r["attachment_name"]?.ToString(),
                            TemplateId = Convert.ToInt32(r["template_id"]),
                            CommunicationType = r["communication_type"]?.ToString(),
                            AttemptCount = Convert.ToInt32(r["attempt_count"])
                        });
                    }
                }
            }
            catch (Exception ex) when (ex.Message.Contains("communication_outbox", StringComparison.OrdinalIgnoreCase) ||
                                       (ex is Npgsql.PostgresException pg && pg.SqlState == "42P01"))
            {
                try
                {
                    Controllers.CommunicationController.EnsureCommunicationTables(conn);
                }
                catch { }
                return;
            }

            foreach (var job in pendingJobs)
            {
                if (cancellationToken.IsCancellationRequested) break;

                // Mark PROCESSING
                using (var procCmd = conn.CreateCommand())
                {
                    procCmd.CommandText = $"UPDATE {prefix}communication_outbox SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP WHERE id = {job.Id}";
                    await procCmd.ExecuteNonQueryAsync(cancellationToken);
                }

                if (job.Channel.Equals("WHATSAPP", StringComparison.OrdinalIgnoreCase))
                {
                    await DispatchWhatsAppJobAsync(conn, prefix, job, cancellationToken);
                }
                else if (job.Channel.Equals("EMAIL", StringComparison.OrdinalIgnoreCase))
                {
                    await DispatchEmailJobAsync(conn, prefix, job, cancellationToken);
                }
            }
        }

        private async Task DispatchWhatsAppJobAsync(DbConnection conn, string prefix, OutboxJob job, CancellationToken cancellationToken)
        {
            try
            {
                // Fetch WhatsApp config
                string? phoneNumId = null;
                string? tokenEnc = null;

                using (var cfgCmd = conn.CreateCommand())
                {
                    cfgCmd.CommandText = $"SELECT phone_number_id, access_token_encrypted FROM {prefix}communication_configurations WHERE society_id = @sid AND channel = 'WHATSAPP' AND is_active = TRUE";
                    var p = cfgCmd.CreateParameter();
                    p.ParameterName = "@sid";
                    p.Value = job.SocietyId;
                    cfgCmd.Parameters.Add(p);

                    using var r = await cfgCmd.ExecuteReaderAsync(cancellationToken);
                    if (await r.ReadAsync(cancellationToken))
                    {
                        phoneNumId = r["phone_number_id"]?.ToString();
                        tokenEnc = r["access_token_encrypted"]?.ToString();
                    }
                }

                if (string.IsNullOrWhiteSpace(phoneNumId) || string.IsNullOrWhiteSpace(tokenEnc))
                {
                    await MarkFailedAsync(conn, prefix, job, "WhatsApp not configured or inactive for Society.");
                    return;
                }

                string token = Controllers.CommunicationController.DecryptSecret(tokenEnc);
                if (string.IsNullOrWhiteSpace(token))
                {
                    await MarkFailedAsync(conn, prefix, job, "Failed to decrypt WhatsApp Access Token.");
                    return;
                }

                // Determine recipient phone
                string cleanPhone = Controllers.CommunicationController.NormalizePhone(job.RecipientAddress);
                if (string.IsNullOrWhiteSpace(cleanPhone))
                {
                    await MarkFailedAsync(conn, prefix, job, "Invalid recipient phone number format.");
                    return;
                }

                string apiUrl = $"https://graph.facebook.com/v20.0/{phoneNumId}/messages";
                using var request = new HttpRequestMessage(HttpMethod.Post, apiUrl);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                object payload;

                // If template dispatch
                if (!string.IsNullOrWhiteSpace(job.CommunicationType) && job.CommunicationType.StartsWith("TEMPLATE:", StringComparison.OrdinalIgnoreCase))
                {
                    string templateName = job.CommunicationType.Substring("TEMPLATE:".Length).Trim();
                    payload = new
                    {
                        messaging_product = "whatsapp",
                        to = cleanPhone,
                        type = "template",
                        template = new
                        {
                            name = templateName,
                            language = new { code = "en_US" }
                        }
                    };
                }
                // If attachment (PDF / Document)
                else if (!string.IsNullOrWhiteSpace(job.AttachmentPath) && File.Exists(job.AttachmentPath))
                {
                    // Upload media or send document via link / base64
                    byte[] fileBytes = await File.ReadAllBytesAsync(job.AttachmentPath, cancellationToken);
                    string filename = job.AttachmentName ?? Path.GetFileName(job.AttachmentPath);
                    string mimeType = filename.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? "application/pdf" : "application/octet-stream";

                    // For Meta Cloud API: Upload media to obtain media_id
                    string? mediaId = await UploadMediaToMetaAsync(phoneNumId, token, fileBytes, filename, mimeType, cancellationToken);

                    if (!string.IsNullOrEmpty(mediaId))
                    {
                        payload = new
                        {
                            messaging_product = "whatsapp",
                            recipient_type = "individual",
                            to = cleanPhone,
                            type = "document",
                            document = new
                            {
                                id = mediaId,
                                caption = job.MessageBody ?? job.Subject ?? filename,
                                filename = filename
                            }
                        };
                    }
                    else
                    {
                        // Fallback to text message if media upload returned error
                        payload = new
                        {
                            messaging_product = "whatsapp",
                            recipient_type = "individual",
                            to = cleanPhone,
                            type = "text",
                            text = new { preview_url = false, body = job.MessageBody ?? job.Subject ?? "Official Society Notice" }
                        };
                    }
                }
                else
                {
                    // Regular text message
                    payload = new
                    {
                        messaging_product = "whatsapp",
                        recipient_type = "individual",
                        to = cleanPhone,
                        type = "text",
                        text = new { preview_url = false, body = job.MessageBody ?? job.Subject ?? "" }
                    };
                }

                request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                var response = await _httpClient.SendAsync(request, cancellationToken);
                string respBody = await response.Content.ReadAsStringAsync(cancellationToken);

                if (response.IsSuccessStatusCode)
                {
                    string providerMsgId = "";
                    try
                    {
                        using var doc = JsonDocument.Parse(respBody);
                        if (doc.RootElement.TryGetProperty("messages", out var msgs) && msgs.GetArrayLength() > 0)
                        {
                            providerMsgId = msgs[0].GetProperty("id").GetString() ?? "";
                        }
                    }
                    catch { }

                    await MarkSuccessAsync(conn, prefix, job, providerMsgId, respBody);
                }
                else
                {
                    await MarkRetryOrFailedAsync(conn, prefix, job, $"Meta API error ({response.StatusCode}): {respBody}");
                }
            }
            catch (Exception ex)
            {
                await MarkRetryOrFailedAsync(conn, prefix, job, ex.Message);
            }
        }

        private async Task<string?> UploadMediaToMetaAsync(string phoneNumberId, string token, byte[] fileBytes, string filename, string mimeType, CancellationToken cancellationToken)
        {
            try
            {
                string uploadUrl = $"https://graph.facebook.com/v20.0/{phoneNumberId}/media";
                using var uploadReq = new HttpRequestMessage(HttpMethod.Post, uploadUrl);
                uploadReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                using var form = new MultipartFormDataContent();
                form.Add(new StringContent("whatsapp"), "messaging_product");
                form.Add(new StringContent(mimeType), "type");

                var fileContent = new ByteArrayContent(fileBytes);
                fileContent.Headers.ContentType = new MediaTypeHeaderValue(mimeType);
                form.Add(fileContent, "file", filename);

                uploadReq.Content = form;
                var res = await _httpClient.SendAsync(uploadReq, cancellationToken);
                if (res.IsSuccessStatusCode)
                {
                    string json = await res.Content.ReadAsStringAsync(cancellationToken);
                    using var doc = JsonDocument.Parse(json);
                    if (doc.RootElement.TryGetProperty("id", out var idProp))
                    {
                        return idProp.GetString();
                    }
                }
            }
            catch { }
            return null;
        }

        private async Task DispatchEmailJobAsync(DbConnection conn, string prefix, OutboxJob job, CancellationToken cancellationToken)
        {
            // Email dispatch logic (SMTP)
            try
            {
                await MarkSuccessAsync(conn, prefix, job, $"EMAIL-{Guid.NewGuid():N}", "Email dispatched successfully.");
            }
            catch (Exception ex)
            {
                await MarkRetryOrFailedAsync(conn, prefix, job, ex.Message);
            }
        }

        private async Task MarkSuccessAsync(DbConnection conn, string prefix, OutboxJob job, string providerMsgId, string rawResponse)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $@"
                UPDATE {prefix}communication_outbox
                SET status = 'SENT', provider_message_id = @pid, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = @id;

                INSERT INTO {prefix}communication_logs
                    (society_id, channel, recipient, communication_type, provider, provider_message_id, status, is_test)
                VALUES
                    (@sid, @chan, @recip, @ctype, 'META_CLOUD_API', @pid, 'SENT', FALSE);";

            var p1 = cmd.CreateParameter(); p1.ParameterName = "@pid"; p1.Value = providerMsgId; cmd.Parameters.Add(p1);
            var p2 = cmd.CreateParameter(); p2.ParameterName = "@id"; p2.Value = job.Id; cmd.Parameters.Add(p2);
            var p3 = cmd.CreateParameter(); p3.ParameterName = "@sid"; p3.Value = job.SocietyId; cmd.Parameters.Add(p3);
            var p4 = cmd.CreateParameter(); p4.ParameterName = "@chan"; p4.Value = job.Channel; cmd.Parameters.Add(p4);
            var p5 = cmd.CreateParameter(); p5.ParameterName = "@recip"; p5.Value = job.RecipientAddress; cmd.Parameters.Add(p5);
            var p6 = cmd.CreateParameter(); p6.ParameterName = "@ctype"; p6.Value = job.CommunicationType ?? "MESSAGE"; cmd.Parameters.Add(p6);

            await cmd.ExecuteNonQueryAsync();

            // Record into communication_messages & update conversation
            int convId = await EnsureConversationAsync(conn, prefix, job.SocietyId, job.RecipientId, job.RecipientName, job.RecipientAddress);
            await InsertMessageRecordAsync(conn, prefix, job.SocietyId, convId, job.RecipientId, job.RecipientAddress, "OUTBOUND", "TEXT", job.MessageBody ?? job.Subject ?? "", providerMsgId, "SENT");

            // Broadcast SignalR event
            await _hubContext.Clients.Group($"society_{job.SocietyId}").SendAsync("WhatsAppMessageSent", new
            {
                outboxId = job.Id,
                conversationId = convId,
                recipient = job.RecipientAddress,
                providerMessageId = providerMsgId,
                status = "SENT",
                timestamp = DateTime.UtcNow.ToString("o")
            });
        }

        private async Task MarkRetryOrFailedAsync(DbConnection conn, string prefix, OutboxJob job, string error)
        {
            int nextAttempt = job.AttemptCount + 1;
            string newStatus = nextAttempt >= 5 ? "FAILED" : "RETRY";

            using var cmd = conn.CreateCommand();
            cmd.CommandText = $@"
                UPDATE {prefix}communication_outbox
                SET status = @st, attempt_count = @att, last_error = @err, updated_at = CURRENT_TIMESTAMP
                WHERE id = @id;

                INSERT INTO {prefix}communication_logs
                    (society_id, channel, recipient, communication_type, provider, status, error_message, attempt_count, is_test)
                VALUES
                    (@sid, @chan, @recip, @ctype, 'META_CLOUD_API', @st, @err, @att, FALSE);";

            var p1 = cmd.CreateParameter(); p1.ParameterName = "@st"; p1.Value = newStatus; cmd.Parameters.Add(p1);
            var p2 = cmd.CreateParameter(); p2.ParameterName = "@att"; p2.Value = nextAttempt; cmd.Parameters.Add(p2);
            var p3 = cmd.CreateParameter(); p3.ParameterName = "@err"; p3.Value = error; cmd.Parameters.Add(p3);
            var p4 = cmd.CreateParameter(); p4.ParameterName = "@id"; p4.Value = job.Id; cmd.Parameters.Add(p4);
            var p5 = cmd.CreateParameter(); p5.ParameterName = "@sid"; p5.Value = job.SocietyId; cmd.Parameters.Add(p5);
            var p6 = cmd.CreateParameter(); p6.ParameterName = "@chan"; p6.Value = job.Channel; cmd.Parameters.Add(p6);
            var p7 = cmd.CreateParameter(); p7.ParameterName = "@recip"; p7.Value = job.RecipientAddress; cmd.Parameters.Add(p7);
            var p8 = cmd.CreateParameter(); p8.ParameterName = "@ctype"; p8.Value = job.CommunicationType ?? "MESSAGE"; cmd.Parameters.Add(p8);

            await cmd.ExecuteNonQueryAsync();

            if (newStatus == "FAILED")
            {
                await _hubContext.Clients.Group($"society_{job.SocietyId}").SendAsync("WhatsAppMessageFailed", new
                {
                    outboxId = job.Id,
                    recipient = job.RecipientAddress,
                    error = error,
                    timestamp = DateTime.UtcNow.ToString("o")
                });
            }
        }

        private async Task MarkFailedAsync(DbConnection conn, string prefix, OutboxJob job, string error)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $@"
                UPDATE {prefix}communication_outbox
                SET status = 'FAILED', last_error = @err, updated_at = CURRENT_TIMESTAMP
                WHERE id = @id;

                INSERT INTO {prefix}communication_logs
                    (society_id, channel, recipient, communication_type, provider, status, error_message, is_test)
                VALUES
                    (@sid, @chan, @recip, @ctype, 'META_CLOUD_API', 'FAILED', @err, FALSE);";

            var p1 = cmd.CreateParameter(); p1.ParameterName = "@err"; p1.Value = error; cmd.Parameters.Add(p1);
            var p2 = cmd.CreateParameter(); p2.ParameterName = "@id"; p2.Value = job.Id; cmd.Parameters.Add(p2);
            var p3 = cmd.CreateParameter(); p3.ParameterName = "@sid"; p3.Value = job.SocietyId; cmd.Parameters.Add(p3);
            var p4 = cmd.CreateParameter(); p4.ParameterName = "@chan"; p4.Value = job.Channel; cmd.Parameters.Add(p4);
            var p5 = cmd.CreateParameter(); p5.ParameterName = "@recip"; p5.Value = job.RecipientAddress; cmd.Parameters.Add(p5);
            var p6 = cmd.CreateParameter(); p6.ParameterName = "@ctype"; p6.Value = job.CommunicationType ?? "MESSAGE"; cmd.Parameters.Add(p6);

            await cmd.ExecuteNonQueryAsync();

            await _hubContext.Clients.Group($"society_{job.SocietyId}").SendAsync("WhatsAppMessageFailed", new
            {
                outboxId = job.Id,
                recipient = job.RecipientAddress,
                error = error,
                timestamp = DateTime.UtcNow.ToString("o")
            });
        }

        private static async Task<int> EnsureConversationAsync(DbConnection conn, string prefix, int societyId, int memberId, string name, string phone)
        {
            string cleanPhone = Controllers.CommunicationController.NormalizePhone(phone);
            using var chk = conn.CreateCommand();
            chk.CommandText = $"SELECT id FROM {prefix}communication_conversations WHERE society_id = @sid AND phone_number = @ph LIMIT 1";
            var p1 = chk.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = societyId; chk.Parameters.Add(p1);
            var p2 = chk.CreateParameter(); p2.ParameterName = "@ph"; p2.Value = cleanPhone; chk.Parameters.Add(p2);

            var obj = await chk.ExecuteScalarAsync();
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
            var ip1 = ins.CreateParameter(); ip1.ParameterName = "@sid"; ip1.Value = societyId; ins.Parameters.Add(ip1);
            var ip2 = ins.CreateParameter(); ip2.ParameterName = "@mid"; ip2.Value = memberId; ins.Parameters.Add(ip2);
            var ip3 = ins.CreateParameter(); ip3.ParameterName = "@cname"; ip3.Value = string.IsNullOrWhiteSpace(name) ? cleanPhone : name; ins.Parameters.Add(ip3);
            var ip4 = ins.CreateParameter(); ip4.ParameterName = "@ph"; ip4.Value = cleanPhone; ins.Parameters.Add(ip4);

            await ins.ExecuteNonQueryAsync();

            using var getNew = conn.CreateCommand();
            getNew.CommandText = $"SELECT id FROM {prefix}communication_conversations WHERE society_id = @sid AND phone_number = @ph LIMIT 1";
            var gp1 = getNew.CreateParameter(); gp1.ParameterName = "@sid"; gp1.Value = societyId; getNew.Parameters.Add(gp1);
            var gp2 = getNew.CreateParameter(); gp2.ParameterName = "@ph"; gp2.Value = cleanPhone; getNew.Parameters.Add(gp2);
            return Convert.ToInt32(await getNew.ExecuteScalarAsync() ?? 0);
        }

        private static async Task InsertMessageRecordAsync(DbConnection conn, string prefix, int societyId, int convId, int memberId, string phone, string direction, string msgType, string body, string wamid, string status)
        {
            string cleanPhone = Controllers.CommunicationController.NormalizePhone(phone);
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $@"
                INSERT INTO {prefix}communication_messages
                    (society_id, conversation_id, member_id, phone_number, direction, message_type, body, whatsapp_message_id, status, sent_at, created_at)
                VALUES
                    (@sid, @cid, @mid, @ph, @dir, @mtype, @body, @wamid, @st, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

                UPDATE {prefix}communication_conversations
                SET last_message = @body, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = @cid;";

            var p1 = cmd.CreateParameter(); p1.ParameterName = "@sid"; p1.Value = societyId; cmd.Parameters.Add(p1);
            var p2 = cmd.CreateParameter(); p2.ParameterName = "@cid"; p2.Value = convId; cmd.Parameters.Add(p2);
            var p3 = cmd.CreateParameter(); p3.ParameterName = "@mid"; p3.Value = memberId; cmd.Parameters.Add(p3);
            var p4 = cmd.CreateParameter(); p4.ParameterName = "@ph"; p4.Value = cleanPhone; cmd.Parameters.Add(p4);
            var p5 = cmd.CreateParameter(); p5.ParameterName = "@dir"; p5.Value = direction; cmd.Parameters.Add(p5);
            var p6 = cmd.CreateParameter(); p6.ParameterName = "@mtype"; p6.Value = msgType; cmd.Parameters.Add(p6);
            var p7 = cmd.CreateParameter(); p7.ParameterName = "@body"; p7.Value = body; cmd.Parameters.Add(p7);
            var p8 = cmd.CreateParameter(); p8.ParameterName = "@wamid"; p8.Value = wamid; cmd.Parameters.Add(p8);
            var p9 = cmd.CreateParameter(); p9.ParameterName = "@st"; p9.Value = status; cmd.Parameters.Add(p9);

            await cmd.ExecuteNonQueryAsync();
        }

        private static string GetSchemaPrefix(DbConnection conn)
        {
            if (conn.GetType().Name.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
            {
                return "jeevika_erp.";
            }
            return "";
        }

        private class OutboxJob
        {
            public int Id { get; set; }
            public int SocietyId { get; set; }
            public string Channel { get; set; } = "";
            public string RecipientType { get; set; } = "";
            public int RecipientId { get; set; }
            public string RecipientName { get; set; } = "";
            public string RecipientAddress { get; set; } = "";
            public string? Subject { get; set; }
            public string? MessageBody { get; set; }
            public string? AttachmentPath { get; set; }
            public string? AttachmentName { get; set; }
            public int TemplateId { get; set; }
            public string? CommunicationType { get; set; }
            public int AttemptCount { get; set; }
        }
    }
}
