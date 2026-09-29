# Email Module Reference — JEEVIKA ERP

This document describes the Email Communication engine, configuration parameters, member dispatch workflows, and committee report attachments in **JEEVIKA ERP**.

---

## 1. Supported Features

- **SMTP Protocol Support**: Standard SMTP with SSL/TLS (port 465) and STARTTLS (port 587/25).
- **Authentication**: Plain, Login, and CRAM-MD5 credential handling via `MailKit` / `System.Net.Mail`.
- **Payloads**: Rich HTML email body with fallback plaintext preview.
- **Attachments**: Generated PDF bills, ledger statements, balance sheets, and receipts attached directly to outgoing messages.
- **Zero-Secret Storage**: Passwords encrypted with AES-256 before storage in database.

---

## 2. Modules & Workflows

### A. Email Settings (`modules/communication/email-settings/`)
Allows society administrators to configure and test the society SMTP gateway:
- **Test Connection**: Opens an immediate TCP handshake and SMTP EHLO/AUTH verification with the target server without saving dummy messages.
- **Test Send**: Dispatches an actual verification test message to a specified administrator email.

### B. Mail to Member (`modules/communication/mail-to-member/`)
Supports 9 member communication document types:
1. **Bill Format**: Monthly maintenance bills and supplementary assessments.
2. **Receipt**: Payment confirmation receipts for maintenance fees.
3. **Member Account**: Detailed ledger statement of debit/credit entries.
4. **Member Register**: Member profile & share certificate summary.
5. **Outstanding Reminder**: Polite payment reminder with overdue balance.
6. **Outstanding Letter**: Formal legal warning for default arrears.
7. **Message**: General society circulars and notices.
8. **Balance Confirmation Letter**: Annual audit balance confirmation letters.
9. **Message with PDF**: Custom notice with uploaded PDF annexures.

### C. Mail to Committee (`modules/communication/mail-to-committee/`)
Distributes 14 comprehensive financial and accounting reports to society managing committee members:
1. Income & Expenditure Statement
2. Balance Sheet
3. Trial Balance
4. Cash / Bank Book
5. Account Ledger Code Wise
6. Account Ledger Group Wise
7. Receipt & Payment Groupwise
8. Receipt & Payment Accountwise
9. Schedule Reports
10. Monthly Financial Summary
11. Receipt Register
12. Payment Register
13. Contra Register
14. Journal Register

---

## 3. REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/communication/email/config` | Retrieves masked SMTP configuration |
| `POST` | `/api/communication/email/config` | Saves encrypted SMTP configuration |
| `POST` | `/api/communication/email/test-connection` | Validates SMTP gateway connectivity |
| `POST` | `/api/communication/email/test-send` | Dispatches a live test email |
| `GET` | `/api/communication/members` | Resolves active members with email addresses |
| `GET` | `/api/communication/committee` | Resolves active committee members |
| `POST` | `/api/communication/members/preview` | Generates email body & PDF preview |
| `POST` | `/api/communication/committee/preview` | Generates committee financial report preview |
| `POST` | `/api/communication/members/queue` | Enqueues member email batch to outbox |
| `POST` | `/api/communication/committee/queue` | Enqueues committee email batch to outbox |
| `GET` | `/api/communication/outbox` | Queries real-time queue status |
| `GET` | `/api/communication/history` | Audits dispatched email history |
| `POST` | `/api/communication/history/{id}/retry` | Manually re-queues failed email |
