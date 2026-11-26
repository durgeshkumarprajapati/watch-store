# Phase 13 — Security Controls

- **HTML Escaping & Link Validation**: All dynamic strings pass through `escapeHtml()`; external tracking URLs are validated to `https://` only; internal admin URLs and secrets are never included in emails.
- **Customer Scoping**: `/account/notifications` derives `customer.id` strictly from `requireAuthenticatedCustomerPage()`. Mandatory transactional notices cannot be silenced.
- **Admin RBAC & Audit**: `/admin/notifications` requires `notifications.read`; manual retry requires `notifications.retry`, rejects `SENT` notifications, and records `NOTIFICATION_MANUAL_RETRY` in `AdminAuditLog`.
- **Internal Worker Auth**: `POST /api/internal/notifications/process` validates `Authorization: Bearer` via `crypto.timingSafeEqual`.
