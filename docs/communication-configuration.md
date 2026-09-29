# Real-Time Communication Configuration Architecture — JEEVIKA ERP

This document details the real-time configuration lifecycle, encryption-at-rest model, and outbox dispatch architecture for Email and WhatsApp communication modules in **JEEVIKA ERP**.

---

## 1. Two-Tier Configuration Model

The system implements a clean separation between **Deployment/Infrastructure Configuration** and **Runtime Operational Configuration**:

```
┌────────────────────────────────────────────────────────┐
│   Tier 1: Deployment Configuration (.env / Environment)│
│   - DATABASE_CONNECTION_STRING                         │
│   - POSTGRES_HOST / POSTGRES_USER / POSTGRES_PASSWORD  │
│   - ENCRYPTION_KEY                                     │
│   - APP_PORT / APP_ENVIRONMENT                         │
└──────────────────────────┬─────────────────────────────┘
                           │ Bootstrap fallback if DB empty
                           ▼
┌────────────────────────────────────────────────────────┐
│   Tier 2: Runtime Operational Configuration (Database) │
│   - Table: communication_configurations                │
│   - SMTP Host, Port, TLS, Username, Encrypted Pass     │
│   - Meta Graph API Version, App ID, Encrypted Secret,  │
│     WABA ID, Phone Number ID, Encrypted Token          │
│   - Webhook Verify Token                               │
│   - Daily Limits, Rate Limits, Enablement Flag         │
└──────────────────────────┬─────────────────────────────┘
                           │ Loaded & Decrypted dynamically
                           ▼
┌────────────────────────────────────────────────────────┐
│   Real-Time Dispatch Engine & Outbox Background Worker │
└────────────────────────────────────────────────────────┘
```

---

## 2. Real-Time Hot Reload (Zero Restart)

When an administrator modifies and saves Email (SMTP) or WhatsApp (Meta Cloud API) settings from either the **Web** UI or the **Desktop/Electron** client:

1. **Client Request**: `POST /api/communication/email/config` or `POST /api/communication/whatsapp/config`.
2. **Backend Handler**: Encrypts secret credentials with AES-256 and writes to `communication_configurations`.
3. **Cache Invalidation**: The runtime query dynamically retrieves the freshest configuration on each outbox dispatch cycle and preview generation.
4. **Immediate Effect**: The subsequent email or WhatsApp dispatch uses the updated credentials without requiring:
   - Server restart
   - Container rebuild or restart
   - Desktop app relaunch

---

## 3. Security & Encryption-at-Rest

### Encryption Mechanism
- Algorithm: **AES-256-CBC** with dynamic PKCS7 padding and cryptographically secure random Initialization Vector (IV).
- Storage Format: `ENC:<base64-encoded(IV + Ciphertext)>`.
- Master Key: Loaded from `ENCRYPTION_KEY` environment variable.

### API Secret Masking
Secrets are **NEVER** returned over the wire to client browsers or desktop renderers.

- **Email Config Response**:
  ```json
  {
    "success": true,
    "data": {
      "providerType": "SMTP",
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": false,
      "username": "society.jeevika@gmail.com",
      "passwordConfigured": true,
      "fromName": "JEEVIKA Housing Society",
      "fromEmail": "society.jeevika@gmail.com",
      "replyTo": "office@jeevika.org",
      "enabled": true
    }
  }
  ```
- **WhatsApp Config Response**:
  ```json
  {
    "success": true,
    "data": {
      "provider": "META_CLOUD",
      "graphApiVersion": "v21.0",
      "appId": "104928374829102",
      "appSecretConfigured": true,
      "wabaId": "948271049281726",
      "phoneNumberId": "582910492817263",
      "accessTokenConfigured": true,
      "webhookVerifyTokenConfigured": true,
      "enabled": true
    }
  }
  ```

---

## 4. Communication Outbox & Queue Architecture

All communication triggers (Member Bill / Receipt / Reminder dispatch, Committee Financial Report distribution) are strictly non-blocking:

```
[UI Trigger] ──> [Create Outbox Batches in tbl communication_outbox (Status: PENDING)]
                      │
                      └──> [Return Batch ID Immediately to UI (Fast response)]
                                    │
                                    ▼
                      [Communication Worker Loop (Every 1000ms)]
                                    │
                      ┌─────────────┴─────────────┐
                      ▼                           ▼
                 [Send SMTP]              [Send Meta Cloud API]
                      │                           │
                      ▼                           ▼
            [Update Outbox & Log]       [Update Outbox & WAMID]
                                                  │
                                                  ▼
                                      [Receive Webhook Callbacks]
                                      (Sent -> Delivered -> Read)
```

### Outbox Lifecycle Statuses:
- `PENDING`: Enqueued and waiting for background worker pickup.
- `PROCESSING`: Picked up by worker, active connection opened.
- `SENT`: Successfully transmitted to SMTP server or Meta Cloud Graph API.
- `DELIVERED`: Confirmed delivered by WhatsApp Webhook event.
- `READ`: Confirmed read by recipient via WhatsApp Webhook event.
- `FAILED`: Dispatch error occurred (retry count incremented up to 3).
- `CANCELLED`: Manually cancelled prior to dispatch.
