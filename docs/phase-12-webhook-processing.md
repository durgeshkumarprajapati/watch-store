# Phase 12 — Shiprocket Webhook Processing

- **Endpoint**: `POST /api/webhooks/shiprocket` (256 KB body limit).
- **Authentication**: Timing-safe comparison (`crypto.timingSafeEqual`) of the `x-api-key` header against `SHIPROCKET_WEBHOOK_TOKEN` (official Shiprocket webhook token mechanism; no invented HMAC).
- **Persistence & Deduplication**: Payloads are validated with Zod and persisted in `ShippingWebhookEvent` with a deterministic SHA-256 `dedupeKey` (`awb|sr_order_id|current_status|current_timestamp`) before processing. Duplicate deliveries return `200 { ok: true, duplicate: true }`.
- **Retries**: Processing errors increment `attempts`, record `lastError`, and enqueue a durable `WEBHOOK_PROCESS` `ShippingJob`.
