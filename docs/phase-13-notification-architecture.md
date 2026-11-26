# Phase 13 — Notification Architecture

- **Transactional Outbox**: `enqueueNotificationInTx` writes `Notification` + `NotificationJob` inside the exact same PostgreSQL transaction as the business event (`payment-settlement.ts`, `admin-order-transition-service.ts`, `shipment-creation-service.ts`, `tracking-sync-service.ts`).
- **Concurrency-Safe Worker**: `claimNextNotificationJob` uses `FOR UPDATE SKIP LOCKED` with a 2-minute `lockedUntil` lease and bounded exponential backoff (`30s * 2^attempts`, capped at 1h). Exhausted or permanent `4xx` failures move to `DEAD_LETTER`.
- **Internal Endpoint**: `POST /api/internal/notifications/process` (Bearer-authenticated with `SHIPROCKET_CRON_SECRET`, timing-safe comparison). External scheduler/Vercel Cron configuration is required in production.
