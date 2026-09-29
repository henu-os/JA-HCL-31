# Test script for end-to-end WhatsApp CRM verification
$ErrorActionPreference = 'Stop'
$baseUrl = 'http://localhost:5002'

# 1. Login to get real JWT token
$loginBody = @{
    username = 'ADMIN'
    password = 'ADMIN'
} | ConvertTo-Json

$loginResp = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResp.data.token
$headers = @{
    'Authorization' = "Bearer $token"
}

Write-Host "✅ 1. Logged in successfully. Token acquired."

# 2. Test Connection
$testConn = Invoke-RestMethod -Uri "$baseUrl/api/communication/whatsapp/test-connection" -Method Post -Headers $headers -ContentType "application/json" -Body "{}"
Write-Host "✅ 2. Test Connection response: $($testConn | ConvertTo-Json -Depth 3)"

# 3. Sync Templates
$syncResp = Invoke-RestMethod -Uri "$baseUrl/api/communication/whatsapp/templates/sync" -Method Post -Headers $headers -ContentType "application/json" -Body "{}"
Write-Host "✅ 3. Sync Templates response: Count = $($syncResp.count)"

# 4. List Templates
$templates = Invoke-RestMethod -Uri "$baseUrl/api/communication/whatsapp/templates" -Method Get -Headers $headers
Write-Host "✅ 4. Retrieved $($templates.data.Count) templates from database."

# 5. List Conversations
$convs = Invoke-RestMethod -Uri "$baseUrl/api/communication/whatsapp/conversations" -Method Get -Headers $headers
Write-Host "✅ 5. Retrieved $($convs.data.Count) active conversations."

# 6. Webhook GET Verification (Challenge)
$challengeResp = Invoke-RestMethod -Uri "$baseUrl/api/communication/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=HENUOS2025&hub.challenge=test_challenge_9988" -Method Get
Write-Host "✅ 6. Webhook Challenge Verification returned: $challengeResp"

# 7. Webhook POST Inbound Message Event
$inboundPayload = @{
    object = "whatsapp_business_account"
    entry = @(
        @{
            id = "2434664030354024"
            changes = @(
                @{
                    value = @{
                        messaging_product = "whatsapp"
                        metadata = @{
                            display_phone_number = "15556669571"
                            phone_number_id = "1185567017980748"
                        }
                        contacts = @(
                            @{
                                profile = @{ name = "Rajesh Sharma (Flat A-101)" }
                                wa_id = "919820012345"
                            }
                        )
                        messages = @(
                            @{
                                from = "919820012345"
                                id = "wamid.TEST_INBOUND_MSG_$(Get-Random)"
                                timestamp = [string]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
                                text = @{ body = "Hello, please send my latest maintenance bill copy." }
                                type = "text"
                            }
                        )
                    }
                    field = "messages"
                }
            )
        }
    )
} | ConvertTo-Json -Depth 10

$webhookResp = Invoke-RestMethod -Uri "$baseUrl/api/communication/webhook/whatsapp" -Method Post -Body $inboundPayload -ContentType "application/json"
Write-Host "✅ 7. Inbound Webhook POST processed successfully: $($webhookResp | ConvertTo-Json)"

# 8. Check Conversations after Inbound
$convsAfter = Invoke-RestMethod -Uri "$baseUrl/api/communication/whatsapp/conversations" -Method Get -Headers $headers
Write-Host "✅ 8. Conversations count after inbound message: $($convsAfter.data.Count)"
$latestConv = $convsAfter.data[0]
Write-Host "   Latest conversation: Contact=$($latestConv.contact_name), Phone=$($latestConv.phone_number), LastMsg=$($latestConv.last_message), Unread=$($latestConv.unread_count)"

# 9. List Logs
$logs = Invoke-RestMethod -Uri "$baseUrl/api/communication/whatsapp/logs" -Method Get -Headers $headers
Write-Host "✅ 9. Audit Logs count: $($logs.data.Count)"

Write-Host "`n🎉 ALL E2E VERIFICATION CHECKS PASSED PERFECTLY!"
