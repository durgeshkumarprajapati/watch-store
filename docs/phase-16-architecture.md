# Phase 16 — Production Operations Architecture

WatchStore uses a **Vercel Cron + Next.js App Router + PostgreSQL (`watchstore_db`)** operational architecture:
- **Scheduler**: `vercel.json` triggers 5 authenticated `GET`/`POST` endpoints under `/api/internal/*` using `CRON_SECRET`.
- **Concurrency & Locking**: `ShippingJob` and `NotificationJob` use `FOR UPDATE SKIP LOCKED`; `InventoryReservation` cleanup locks each row with `FOR UPDATE SKIP LOCKED` and checks `Order.status`/`Payment.status`; `MediaCleanupJob` uses atomic `PROCESSING` claiming.
- **Execution Tracking**: Every scheduled run is persisted in `SchedulerRun` (`RUNNING` → `COMPLETED` | `FAILED` | `ABANDONED` after 5 minutes).
- **Visibility**: `/admin/operations` provides RBAC-protected (`operations.read`, `operations.manage`) health metrics, dead-letter queues, and audited manual triggers.
