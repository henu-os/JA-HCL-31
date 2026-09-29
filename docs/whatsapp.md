# WhatsApp Cloud API Module Reference — JEEVIKA ERP

This document details the WhatsApp Cloud API integration, Meta Graph API configuration, webhook lifecycle, and dispatch capabilities in **JEEVIKA ERP**.

---

## 1. Supported Features

- **Meta Graph API Version**: Configurable (Default: `v21.0`).
- **Authentication**: Bearer token authentication via System User Access Token encrypted at rest.
- **Phone Number Normalization**: Automatic formatting to E.164 standard (e.g., `+91 9876543210` -> `919876543210`).
- **Media Support**: Sends dynamic documents (PDF bills, receipts, accounting statements) via Meta Cloud Media URLs.
- **Webhook Status Synchronization**: Captures asynchronous real-time message statuses (`sent`, `delivered`, `read`, `failed`).

---

## 2. Modules & Workflows

### A. WhatsApp Settings (`modules/communication/whatsapp-settings/`)
Configure credentials provided in the Meta Developer Portal / WhatsApp Business Account:
- `Meta App ID` & `Meta App Secret`
- `WABA ID` (WhatsApp Business Account ID)
- `Phone Number ID`
- `System User Access Token`
- `Webhook Verify Token`
- **Test Connection**: Queries the Meta Graph API endpoint `https://graph.facebook.com/{version}/{phoneNumberId}` to verify authorization and phone number active status.
- **Test Send**: Dispatches a test template or text message to verify end-to-end messaging.

### B. WhatsApp to Member (`modules/communication/whatsapp-member/`)
Dispatches customized notices and media to society members:
1. **Bill Format**: Sends bill notification with download link or direct PDF document attachment.
2. **Receipt**: Sends instant confirmation upon payment voucher entry.
3. **Member Account**: Dispatches summary statement with current outstanding balance.
4. **Member Register**: Profile details confirmation.
5. **Outstanding Reminder**: Polite reminder with payment gateway/bank UPI details.
6. **Message**: Society general alerts and event broadcasts.
7. **Balance Confirmation Letter**: Formal audit balance confirmation.
8. **Message with PDF**: Circular with attached society resolution PDF.

### C. WhatsApp to Committee (`modules/communication/whatsapp-committee/`)
Sends key financial summaries and PDF reports directly to society office bearers (Chairman, Secretary, Treasurer).

---

## 3. Webhook Architecture & Verification

Meta sends webhook notifications for status updates and inbound messages.

### GET Verification (Challenge Handshake):
When configuring the webhook URL in Meta Business Manager:
```
GET /api/communication/webhook/whatsapp?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=HENUOS2025
```
The endpoint validates `hub.verify_token` against the runtime configuration in `communication_configurations` and echoes back `hub.challenge`.

### POST Event Processing:
```
POST /api/communication/webhook/whatsapp
```
Meta sends JSON payload containing status updates:
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "statuses": [{
          "id": "wamid.HBgLMTIzNDU2Nzg5...",
          "status": "delivered",
          "timestamp": "1727515200",
          "recipient_id": "919876543210"
        }]
      }
    }]
  }]
}
```
The backend maps `wamid` to `communication_outbox` / `communication_logs` and transitions the record status (`SENT` -> `DELIVERED` -> `READ`).

---

## 4. REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/communication/whatsapp/config` | Retrieves masked WhatsApp configuration |
| `POST` | `/api/communication/whatsapp/config` | Saves encrypted WhatsApp configuration |
| `POST` | `/api/communication/whatsapp/test-connection` | Verifies Meta Graph API token & Phone ID |
| `POST` | `/api/communication/whatsapp/test-send` | Dispatches a live test WhatsApp message |
| `GET` | `/api/communication/webhook/whatsapp` | Meta Webhook challenge verification |
| `POST` | `/api/communication/webhook/whatsapp` | Meta Webhook status event receiver |
