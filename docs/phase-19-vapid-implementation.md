# WatchStore Phase 19B — VAPID Browser Push & In-App Inbox Implementation

**Branch:** `development`  
**Status:** Implemented and locally verified (pre-cutover; production Vercel/Supabase untouched)

## 1. Architecture Summary

WatchStore now supports three independent notification channels backed by the PostgreSQL outbox:

1. **`EMAIL`** — Existing Resend transactional email pipeline (`Notification` + `NotificationJob` retry/dead-letter).
2. **`IN_APP`** — Immediate (`SENT`) persistent inbox rows per `Customer` or `AdminUser`, surfaced on `/account/notifications` and `/admin/inbox` with unread counts and ownership-enforced mark-read actions.
3. **`PUSH`** — Web Push via `web-push` (VAPID) delivered asynchronously by `NotificationJob` workers to active `PushSubscription` device endpoints.

Failure or backoff on one channel does not block or suppress the other channels.

## 2. Database & Environment

- **Schema & Migration:** `prisma/migrations/0015_phase19_web_push/migration.sql`
  - Added `IN_APP` and `PUSH` to `NotificationChannel`.
  - Added `SECURITY_ALERT`, `NEW_ORDER_ADMIN`, `PAYMENT_RECEIVED_ADMIN`, `PAYMENT_FAILED_ADMIN`, `NEW_CUSTOMER_ADMIN`, `LOW_STOCK_ADMIN`, `SHIPMENT_EXCEPTION_ADMIN`, `REFUND_REQUIRED_ADMIN`, and `NOTIFICATION_FAILED_ADMIN` to `NotificationEventType`.
  - Added `PushSubscription` (`customerId?`, `adminUserId?`, `endpoint @unique`, `p256dh`, `auth`, `userAgent?`, `isActive`, `lastUsedAt?`) with database check constraint `PushSubscription_single_owner_chk` enforcing single-owner isolation.
  - Added `adminUserId`, `pushSubscriptionId`, `targetUrl`, and `readAt` to `Notification`.
- **Environment (`src/config/env.ts`, `.env.example`):**
  - Added optional `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` with pairing validation in `validateProductionEnv()`.

## 3. APIs & Service Worker

- `GET /api/push/vapid-public-key` (`src/app/api/push/vapid-public-key/route.ts`) — Returns `{ publicKey }` when configured, or `503` when unconfigured.
- `POST /api/notifications/push/subscribe` (`src/app/api/notifications/push/subscribe/route.ts`) — Same-origin check, Zod schema + SSRF endpoint validation (`src/modules/notifications/push-validation.ts`), upserts `PushSubscription` scoped to authenticated customer or admin.
- `DELETE /api/notifications/push/unsubscribe` (`src/app/api/notifications/push/unsubscribe/route.ts`) — Same-origin check, ownership-scoped deactivation (`isActive = false`).
- `GET /api/notifications/push/status` (`src/app/api/notifications/push/status/route.ts`) — Returns `{ configured, activeCount, devices }` (sanitized hostnames only).
- `POST /api/admin/push-subscriptions/test` (`src/app/api/admin/push-subscriptions/test/route.ts`) — Authenticated admin test push (rate-limited 5 per 5 minutes), sends only to the requesting admin's own active devices.
- **Service Worker (`public/sw.js`):** Handles `push` and `notificationclick` only (validates same-origin relative `targetUrl`, no `fetch` caching).

## 4. Worker, Inbox & Business Triggers

- **Worker (`src/modules/notifications/notification-worker-service.ts`):**
  - Processes `EMAIL`, `IN_APP`, and `PUSH` jobs independently.
  - `PUSH` deactivates expired subscriptions (`404`/`410`) and marks `DEAD_LETTER`; updates `lastUsedAt` on `201`; retries `429`/`5xx`/network errors with exponential backoff.
  - When an `EMAIL` notification enters `DEAD_LETTER`, triggers `NOTIFICATION_FAILED_ADMIN` broadcast (guarded against self-looping).
- **Cron Batching (`src/modules/operations/operations-service.ts`):**
  - `executeScheduledNotificationProcess` processes bounded concurrent batches (5 parallel workers, up to 25 jobs per run).
- **Admin Broadcast Isolation:**
  - `enqueueAdminBroadcastInTx` fans out `IN_APP` + `PUSH` to **all** active, email-verified `AdminUser` accounts across all active devices with **no** RBAC role or permission filtering.
- **Business Triggers:**
  - Customer order/payment/shipping events: `enqueueOrderNotificationInTx` fans out `IN_APP` + `PUSH` alongside `EMAIL`.
  - Customer `SECURITY_ALERT`: `resetPasswordWithToken` in `src/modules/auth/auth-service.ts`.
  - Admin `NEW_ORDER_ADMIN` & `LOW_STOCK_ADMIN`: `createPersistentOrder` in `src/modules/checkout/persistent-order-service.ts`.
  - Admin `PAYMENT_RECEIVED_ADMIN` & `PAYMENT_FAILED_ADMIN`: `src/modules/payments/application/payment-settlement.ts`.
  - Admin `SHIPMENT_EXCEPTION_ADMIN`: `src/modules/shipping/application/shipment-creation-service.ts`.
  - Admin `REFUND_REQUIRED_ADMIN`: `cancelAdminOrder` in `src/modules/admin/orders/admin-order-transition-service.ts` when `manualRefundRequired === true`.
  - Admin `NEW_CUSTOMER_ADMIN`: `registerCustomerAccount` in `src/modules/auth/auth-service.ts`.
  - Admin `NOTIFICATION_FAILED_ADMIN`: `notification-worker-service.ts` on email `DEAD_LETTER`.
  - *Note:* Customer `REFUND_STATUS_UPDATED` was not wired because WatchStore does not yet have a dedicated customer refund-state transition workflow beyond `ORDER_CANCELLED` (`manualRefundRequired` flag).

## 5. UI Integration

- Customer portal: `/account/notifications` (`src/app/(store)/account/notifications/page.tsx`) includes `NotificationPreferencesForm`, `BrowserPushSettings`, and `InAppInbox`.
- Admin portal: `/admin/inbox` (`src/app/admin/(protected)/inbox/page.tsx`) accessible to all authenticated admins without RBAC permission gates, including `BrowserPushSettings` (with "Send Test Push") and `InAppInbox`.
- Admin sidebar (`src/components/admin/admin-shell.tsx`) and `/admin/settings` (`src/app/admin/(protected)/settings/page.tsx`) updated with `Inbox & Push` link and `VAPID Browser Push` status indicator.
