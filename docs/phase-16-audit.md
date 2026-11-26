# Phase 16 — Repository Audit Report: Production Shipping & Operations

**Status:** Stage A Complete — Awaiting Approval (No application code, schema, migrations, or `.env` modified)

---

## 1. Executive Summary
WatchStore has strong durable foundations across Phases 5–15 (`InventoryReservation`, `ShippingJob`, `NotificationJob`, `MediaCleanupJob`, `PaymentAttempt`, `RazorpayWebhookEvent`, `AdminAuditLog`), but lacks automated production scheduling (`vercel.json` Cron / unified scheduler), Razorpay payment reconciliation, automated reservation/media cleanup endpoints, Shiprocket bulk tracking/reconciliation scheduling, and a centralized `/admin/operations` monitoring & retry console.

## 2. Existing Architecture Review
- **Modular Monolith**: Next.js 16 App Router (`package.json`), React 19, TypeScript strict, Prisma ORM `6.19.3`, PostgreSQL (`12` migrations `0001_init` through `0012_phase15_media_durability`).
- **Hosting Target**: Vercel (serverless functions) + Supabase PostgreSQL. No `vercel.json` exists yet (`MISSING`).
- **RBAC**: `35` permissions across `6` roles in `src/modules/admin/rbac-catalogue.ts` (`IMPLEMENTED`).

## 3. Existing Worker and Scheduler Inventory
- `src/app/api/internal/shipping/sync/route.ts`: `POST` handler, processes up to `10` `ShippingJob` rows (`PARTIALLY IMPLEMENTED` — Vercel Cron uses `GET` and no `vercel.json` invokes it).
- `src/app/api/internal/notifications/process/route.ts`: `POST` handler, processes up to `20` `NotificationJob` rows (`PARTIALLY IMPLEMENTED` — same gap).
- `cleanupExpiredReservations` (`src/modules/inventory/reservation-service.ts`): Not exposed via any internal endpoint (`MISSING`).
- `processMediaCleanupJobs` (`src/modules/admin/catalogue/media-cleanup-service.ts`): Not exposed via any internal endpoint (`MISSING`).
- Payment reconciliation & tracking sync sweep: Not implemented (`MISSING`).

## 4. Reservation Cleanup Assessment
- `cleanupExpiredReservations` & `releaseReservationInTx` (`src/modules/inventory/reservation-service.ts`): **PARTIALLY IMPLEMENTED**.
- **Gaps**:
  1. Does not check `Order.status` (`CONFIRMED`, `PACKED`, `SHIPPED`, `DELIVERED`) or `Payment.status === 'PAID'` before releasing an expired `RESERVED` row.
  2. No batch limit (`take`) or row lock (`FOR UPDATE SKIP LOCKED`), risking long transactions or duplicate work under concurrent workers.

## 5. Payment Reconciliation Assessment
- Razorpay client (`src/modules/payments/infrastructure/razorpay-client.ts`) already implements `fetchOrder`, `fetchPayment`, and `fetchOrderPayments` (`IMPLEMENTED`).
- `markPaymentCapturedInTx` (`src/modules/payments/application/payment-settlement.ts`) & `processRazorpayWebhook` (`src/modules/payments/application/payment-webhook-service.ts`) handle idempotent capture, amount/currency validation, and late capture after reservation expiry (`IMPLEMENTED`).
- **Gaps (`MISSING`)**: No scheduled or admin-triggered reconciliation service to scan stale `PENDING` / `AUTHORIZED` / `REQUIRES_GATEWAY` / `FAILED` Razorpay `Payment` & `PaymentAttempt` records, fetch authoritative status via `fetchOrderPayments` / `fetchPayment`, settle verified captures, mark failed attempts, or flag ambiguous/late captures for manual review without fabricating refunds.

## 6. Shiprocket Reconciliation Assessment
- `claimNextShippingJob` & `processNextShippingJob` (`src/modules/shipping/application/shipping-job-service.ts`): **IMPLEMENTED** (`FOR UPDATE SKIP LOCKED`, 2-minute lease, exponential backoff, `DEAD_LETTER`).
- `reconcileShipment` & `syncShipmentTracking` (`src/modules/shipping/application/tracking-sync-service.ts`): **IMPLEMENTED** (reconciles via `getOrderDetails` & `getTrackingByAwb`, preserves history via `ShipmentStatusHistory` + `dedupeKey`, never overwrites newer states).
- **Gaps (`PARTIALLY IMPLEMENTED`)**:
  1. No scheduled sweep enqueuing `TRACKING_SYNC` for active non-terminal shipments (`AWB_ASSIGNED`, `PICKUP_SCHEDULED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`) or `RECONCILE_SHIPMENT` for `reconciliationRequired = true` shipments.
  2. `vercel.json` Cron does not invoke `/api/internal/shipping/sync`.

## 7. Notification Processing Assessment
- `claimNextNotificationJob` & `processNextNotificationJob` (`src/modules/notifications/notification-worker-service.ts`): **IMPLEMENTED** (`FOR UPDATE SKIP LOCKED`, 2-minute lease, exponential backoff, `DEAD_LETTER`, `dedupeKey` passed as Resend `idempotencyKey`, mandatory transactional emails never suppressed).
- **Gaps (`PARTIALLY IMPLEMENTED`)**: Not scheduled in `vercel.json`; no unified operational summary on `/admin/operations` (though `/admin/notifications` exists).

## 8. Cloudinary Cleanup Assessment
- `MediaCleanupJob`, `enqueueMediaCleanupJob`, `processMediaCleanupJobs`, `isMediaAssetReferenced` (`src/modules/admin/catalogue/media-cleanup-service.ts`): **IMPLEMENTED**.
- **Gaps (`PARTIALLY IMPLEMENTED`)**: Not scheduled via any internal cron endpoint; `processMediaCleanupJobs` uses `updateMany` optimistic claim rather than `FOR UPDATE SKIP LOCKED`.

## 9. Scheduler Architecture Recommendation
- **Vercel Pro + Supabase Pro Compatible Architecture**:
  - Do **NOT** introduce a separate long-lived worker daemon unless needed; use **Vercel Cron (`vercel.json`)** invoking authenticated Next.js App Router internal endpoints (`GET` + `POST` supported) with strict batch bounds and execution time budgets (< 25s per invocation, well under Vercel Pro's 60s–300s limit).
  - Use a unified `CRON_SECRET` (plus optional fallback to `SHIPROCKET_CRON_SECRET` for backwards compatibility) with `Authorization: Bearer <secret>` and `timingSafeEqual`.
  - Record each cron run in a lightweight `SchedulerRun` table (`jobName`, `startedAt`, `completedAt`, `durationMs`, `status`, `processedCount`, `errorCount`, `summary`) so `/admin/operations` shows last execution & health.
  - Endpoints:
    - `/api/internal/operations/tick` (or dedicated endpoints `/api/internal/reservations/cleanup`, `/api/internal/shipping/sync`, `/api/internal/notifications/process`, `/api/internal/media/cleanup`, `/api/internal/payments/reconcile`). Supporting both dedicated endpoints and a safe `vercel.json` schedule keeps each job isolated and within Supabase pool limits (`connection_limit` via PgBouncer).

## 10. Internal Endpoint Security Assessment
- Existing `/api/internal/shipping/sync` and `/api/internal/notifications/process` use `timingSafeEqual` on `Bearer` token (`IMPLEMENTED`).
- **Gaps (`PARTIALLY IMPLEMENTED`)**:
  1. Both reuse `SHIPROCKET_CRON_SECRET`; should accept `CRON_SECRET` (standard Vercel Cron header) and/or dedicated secrets.
  2. Only export `POST` (Vercel Cron issues `GET`).
  3. No execution time guard or structured `SchedulerRun` logging.

## 11. Monitoring and Operations Dashboard Assessment
- **Status: `MISSING`**.
- Proposed route: `/admin/operations` (added to `adminNav` in `src/components/admin/admin-nav.ts`).
- Displays:
  - Overall system health & recent `SchedulerRun` history.
  - Pending / Failed / `DEAD_LETTER` counts across `ShippingJob`, `NotificationJob`, `MediaCleanupJob`.
  - Payments requiring reconciliation (`needsReconciliation` / stale `PENDING`/`AUTHORIZED`).
  - Shipments with `reconciliationRequired = true`.
  - Expired `InventoryReservation` backlog.
  - Authorized retry actions (audited in `AdminAuditLog`) for failed/dead-letter jobs & manual reconciliation triggers.

## 12. Database and Concurrency Safety Assessment
- `ShippingJob` and `NotificationJob` use `FOR UPDATE SKIP LOCKED` (`IMPLEMENTED`).
- `MediaCleanupJob` uses `updateMany` claim (`PARTIALLY IMPLEMENTED` — can upgrade or keep atomic `PROCESSING` claim).
- `cleanupExpiredReservations` lacks `FOR UPDATE SKIP LOCKED` and payment/order safety guard (`PARTIALLY IMPLEMENTED`).
- **Proposed Additive Migration (`0013_phase16_operations`)**:
  - `SchedulerRun` table (`id`, `jobName`, `status`, `startedAt`, `completedAt`, `durationMs`, `processedCount`, `errorCount`, `summary`, `lastError`) + index `(jobName, startedAt)`.
  - `PaymentReconciliationLog` (or `Payment.lastReconciledAt`, `Payment.reconciliationNote`, `Payment.needsReconciliation Boolean @default(false)`) to durably track Razorpay reconciliation state and failures without altering immutable `OrderItem` or `PaymentAttempt` records.

## 13. RBAC Assessment
- Existing `35` permissions cover `shipments.retry`, `notifications.retry`, `orders.read`, `audit.read` (`IMPLEMENTED`).
- **Proposed Additions**:
  - `operations.read` (view `/admin/operations`)
  - `operations.manage` (trigger manual reconciliation, retry dead-letter media/shipping/notification jobs, run cleanup)
  - Assigned to `SUPER_ADMIN` and `ADMIN` only (not `ORDER_MANAGER`, `CATALOG_MANAGER`, `INVENTORY_MANAGER`, or `CUSTOMER_SUPPORT`).

## 14. Production Environment Configuration Audit
- **Configured in `.env.example` / `src/config/env.ts`**:
  - Required for core: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`.
  - Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
  - Shiprocket: `SHIPROCKET_API_EMAIL`, `SHIPROCKET_API_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN`, `SHIPROCKET_CRON_SECRET`.
  - Resend: `RESEND_API_KEY`, `EMAIL_FROM`.
  - Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
  - Google Sheets: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
- **Missing**: `CRON_SECRET` (for Vercel Cron / internal scheduler authentication).

## 15. Testing Gaps
- Missing unit & PostgreSQL integration tests for:
  - `cleanupExpiredReservations` preserving `CONFIRMED`/`PAID` orders & concurrent execution.
  - Razorpay payment reconciliation (captured remotely, failed remotely, late capture after expiry, ambiguous/timeout states, idempotency).
  - Shiprocket bulk tracking enqueue & reconciliation sweep.
  - `CRON_SECRET` timing-safe auth (`GET` & `POST`) + batch bounds.
  - `/admin/operations` RBAC (`operations.read`, `operations.manage`) and `SchedulerRun` persistence.

## 16. Proposed Database Changes (`0013_phase16_operations`)
- Add `SchedulerRun` model.
- Add `needsReconciliation Boolean @default(false)`, `lastReconciledAt DateTime?`, `reconciliationNote String?` on `Payment` + `@@index([needsReconciliation, status])`.

## 17. Proposed Source-Code Changes
- `vercel.json`, `.env.example`, `src/config/env.ts`, `prisma/schema.prisma`, `prisma/migrations/0013_phase16_operations/migration.sql`.
- `src/modules/admin/rbac-catalogue.ts`, `src/components/admin/admin-nav.ts`.
- `src/modules/inventory/reservation-service.ts` (safe order/payment guard + `FOR UPDATE SKIP LOCKED` + batching).
- `src/modules/payments/application/payment-reconciliation-service.ts` (Razorpay reconciliation).
- `src/modules/shipping/application/tracking-sync-service.ts` / `shipping-job-service.ts` (enqueue tracking/reconciliation sweeps).
- `src/modules/operations/` (`scheduler-auth.ts`, `operations-service.ts`, `operations-actions.ts`).
- Internal routes: `/api/internal/reservations/cleanup`, `/api/internal/media/cleanup`, `/api/internal/payments/reconcile`, plus `GET`+`POST` & `SchedulerRun` tracking on `/api/internal/shipping/sync` and `/api/internal/notifications/process`.
- Admin UI: `/admin/operations` (`src/app/admin/(protected)/operations/page.tsx` + console component).

## 18. Implementation Sequence
1. Additive schema migration `0013_phase16_operations` + RBAC permissions + `CRON_SECRET` env config.
2. Safe reservation cleanup hardening + Razorpay payment reconciliation service + Shiprocket tracking/reconciliation sweep.
3. Unified scheduler auth, structured logging, `SchedulerRun` recording, internal routes (`GET`/`POST`), and `vercel.json`.
4. `/admin/operations` dashboard & audited retry/reconciliation actions.
5. Comprehensive unit & PostgreSQL integration tests + full regression & quality gates + Phase 16 documentation.

## 19. Risks and Mitigations
- **Risk**: Releasing an expired reservation for an order whose payment just settled. **Mitigation**: Lock `Order`/`InventoryReservation` and skip release if `Order.status` is `CONFIRMED`/`PACKED`/`SHIPPED`/`DELIVERED` or any `Payment.status === 'PAID'`.
- **Risk**: Overlapping Vercel Cron invocations. **Mitigation**: `FOR UPDATE SKIP LOCKED` on jobs and reservations, conditional updates on payments, and bounded batch sizes.
- **Risk**: Real provider verification unavailable without live keys. **Mitigation**: Test thoroughly with mocked Razorpay/Shiprocket/Resend/Cloudinary clients and report live provider verification as `IMPLEMENTED — EXTERNAL VERIFICATION PENDING`.

## 20. Phase 16 Acceptance Criteria
- All 5 automated job/reconciliation pipelines (Reservations, Shipping, Notifications, Media Cleanup, Razorpay Reconciliation) run safely via authenticated internal routes and `vercel.json`.
- `/admin/operations` displays health, dead-letter jobs, reconciliation issues, and audited retry actions under `operations.read`/`operations.manage`.
- Zero regressions across Phases 1–15, `typecheck`, `lint` (0 warnings), `npm test`, `npm run test:db`, and `npm run qa:build` all pass.
