# WatchStore — Phase 19A: VAPID Browser Push Notification Architecture Audit

**Audit Date:** 2026-11-26  
**Classification:** Strictly Read-Only Audit & Phase 19B Implementation Plan  
**Repository:** `/home/ppsd-021/watch-store`  
**Branch:** `development`

> **Status Legend:** Every statement is categorized as **VERIFIED** (directly observed in repo/commands), **INFERRED**, **RECOMMENDED**, **NOT FOUND**, or **NOT TESTED**.

---

## 1. Executive Summary

- **VERIFIED:** WatchStore already has a mature PostgreSQL outbox (`Notification` + `NotificationJob` + `FOR UPDATE SKIP LOCKED` worker + Vercel Cron `/api/internal/notifications/process` every 2 minutes) delivering transactional emails via Resend.
- **NOT FOUND:** No `PushSubscription` model, no `PUSH` or `IN_APP` implementation in `NotificationChannel` (currently `EMAIL` only), no Service Worker (`public/sw.js`), no Web App Manifest, no `web-push` dependency, and no VAPID environment variables exist yet.
- **VERIFIED:** Zero routes use Edge Runtime; all APIs run on Node.js (`v24.19.0` locally, `>=20.9`), which is fully compatible with `web-push`.
- **RECOMMENDED:** Implement VAPID Web Push and In-App notifications as **independent** channels alongside Email by extending `NotificationChannel` (`EMAIL`, `PUSH`, `IN_APP`), adding `PushSubscription` (with a PostgreSQL `CHECK` constraint enforcing single ownership: `customerId` XOR `adminUserId`), and dispatching each push device delivery as its own `Notification` + `NotificationJob` so email, push, and in-app never block or invalidate one another.

---

## 2. Repository and Git State (`VERIFIED`)

- **Current Branch:** `development` (`## development...origin/development`)
- **Working Tree Before Audit:** Clean (only `docs/phase-19-vapid-audit.md` created during Phase 19A).
- **Package Manager & Lockfile:** `npm` (`11.17.0`) with `package-lock.json`.
- **Node.js & Stack:** Node `v24.19.0` (`engines.node >= 20.9`), Next.js `^16.4.6` (App Router), React `^19.3.1`, TypeScript strict mode, Tailwind CSS v4, Prisma `6.19.3`, Auth.js `^5.0.0-beta.32`, Vitest `^5.1.1`.
- **Existing Docs:** `docs/phase-13-*.md`, `docs/order-status-notification-*.md`, `docs/customer-invoice-*.md`, `docs/performance-audit.md`.

---

## 3. Existing Notification Architecture (`VERIFIED`)

- **Schema (`prisma/schema.prisma`):**
  - `NotificationChannel`: `EMAIL` only (lines 89–91).
  - `NotificationStatus`: `PENDING`, `PROCESSING`, `SENT`, `FAILED`, `DEAD_LETTER` (lines 93–99).
  - `NotificationEventType`: `ORDER_CONFIRMED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `COD_ORDER_CONFIRMED`, `SHIPMENT_CREATED`, `SHIPMENT_DISPATCHED`, `OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_CANCELLED` (lines 101–111).
  - `Notification` (lines 818–846): `customerId?`, `orderId?`, `eventType`, `channel`, `recipient`, `subject`, `payload`, `status`, `provider`, `providerMessageId?`, `dedupeKey @unique`, `attemptCount`, `lastAttemptAt?`, `sentAt?`, `failedAt?`, `lastError?`.
  - `NotificationJob` (lines 848–864): `notificationId @unique`, `status`, `attempts`, `maxAttempts` (`5`), `nextRunAt`, `lockedUntil`, `lockedBy`, `lastError`, `completedAt`.
  - `NotificationPreference` (lines 866–874): `customerId @id`, `orderUpdatesEnabled`, `paymentUpdatesEnabled`, `shippingUpdatesEnabled`, `accountSecurityUpdatesEnabled`.
- **Outbox & Templates:**
  - `src/modules/notifications/notification-outbox-service.ts`: `enqueueNotificationInTx()` checks `!meta.isMandatory && shippingUpdatesEnabled`, checks `dedupeKey`, renders email, and creates `Notification` + `NotificationJob` inside the caller's transaction.
  - `src/modules/notifications/notification-templates.ts`: `NOTIFICATION_EVENT_CATALOGUE` + `renderNotificationEmail()`.
- **Worker, Cron & Retries:**
  - `src/modules/notifications/notification-worker-service.ts`: `claimNextNotificationJob()` uses `FOR UPDATE SKIP LOCKED` with a 2-minute lease; `processNextNotificationJob()` sends via `sendTransactionalEmail()` (Resend API with `Idempotency-Key: notification.dedupeKey`). `429`/`5xx` → `FAILED` with backoff `min(3600, 30 * 2^(attempts-1))` seconds; `4xx` or `attempts >= 5` → `DEAD_LETTER`.
  - `src/app/api/internal/notifications/process/route.ts` (`*/2 * * * *` in `vercel.json`, `CRON_SECRET` Bearer auth) → `executeScheduledNotificationProcess()` in `operations-service.ts` (up to `20` jobs/run).
- **Admin UI:** `/admin/notifications` (`notification-query-service.ts`) lists outbound `Notification` logs and supports `retryAdminNotificationAction` (`notifications.retry` permission).
- **Customer UI:** `/account/notifications` only renders `NotificationPreferencesForm` (`shippingUpdatesEnabled`). **In-app notification inbox: `NOT FOUND`.**

---

## 4. Actual Event Flow Analysis (`VERIFIED`)

| # | Event | Origin | Outbox / Delivery Path | Recipient Resolution | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **COD Order Confirmation** | `transitionAdminOrderStatus` (`admin-order-transition-service.ts`) | `enqueueOrderNotificationInTx` (`COD_ORDER_CONFIRMED`) → `Notification` + `NotificationJob` → Cron → Resend | `order.customer?.email \|\| order.guestEmail` | **VERIFIED** (Email only) |
| 2 | **Razorpay Payment Confirmation** | `markPaymentCapturedInTx` (`payment-settlement.ts`) & `transitionAdminOrderStatus` | Enqueues `PAYMENT_SUCCESS` + `ORDER_CONFIRMED` → Outbox → Cron → Resend | `order.customer?.email \|\| order.guestEmail` | **VERIFIED** (Email only) |
| 3 | **Order Processing** | `transitionAdminOrderStatus` / `markOrderPacked` (`admin-order-transition-service.ts`) | Enqueues `ORDER_CONFIRMED` (`dedupeKey: ORDER_PROCESSING:<orderId>`, `newStatus: "PROCESSING"`) → Outbox | `order.customer?.email \|\| order.guestEmail` | **VERIFIED** (Email only) |
| 4 | **Shipment Dispatch** | `dispatchAdminOrder` / `createManualShipmentRecord` / `tracking-sync-service.ts` | Enqueues `SHIPMENT_DISPATCHED` (respects `shippingUpdatesEnabled`) → Outbox | `order.customer?.email \|\| order.guestEmail` | **VERIFIED** (Email only) |
| 5 | **Out for Delivery** | `tracking-sync-service.ts` (`OUT_FOR_DELIVERY`) | Enqueues `OUT_FOR_DELIVERY` (respects `shippingUpdatesEnabled`) → Outbox | `order.customer?.email \|\| order.guestEmail` | **VERIFIED** (Email only) |
| 6 | **Order Delivery** | `transitionAdminOrderStatus` / `tracking-sync-service.ts` | Enqueues `ORDER_DELIVERED` (respects `shippingUpdatesEnabled`) → Outbox | `order.customer?.email \|\| order.guestEmail` | **VERIFIED** (Email only) |
| 7 | **Order Cancellation** | `cancelAdminOrder` (`admin-order-transition-service.ts`) | Enqueues `ORDER_CANCELLED` (mandatory) → Outbox | `order.customer?.email \|\| order.guestEmail` | **VERIFIED** (Email only) |
| 8 | **Refund Events** | `cancelAdminOrder` sets `manualRefundRequired`; `PaymentStatus.REFUNDED` in schema | **NOT FOUND** — no refund notification event exists | N/A | **NOT FOUND** |
| 9 | **New Customer Registration** | `registerCustomerAccount` (`auth-service.ts`) | Calls `sendTransactionalEmail()` **directly** (bypasses `Notification` outbox) | `input.email` | **VERIFIED** (Direct Email; no Admin alert) |
| 10 | **Inventory Threshold** | `classifyStockStatus` (`inventory-validation.ts`) | Computed on read only; **NOT FOUND** as an event/alert | N/A | **NOT FOUND** |

---

## 5. Customer Authentication Analysis (`VERIFIED`)

- `src/modules/auth/auth.ts`: Auth.js v5 (`strategy: "jwt"`, `maxAge: 7d`, `trustHost: true`). `jwt` callback checks `dbUser.emailVerified` and `dbUser.sessionVersion` against `User` on every request, invalidating tokens on password reset.
- `src/modules/auth/session-service.ts`: `getAuthenticatedCustomer()` resolves `session.user.id` → `Customer.findUnique({ where: { authUserId: userId } })`. `requireAuthenticatedCustomerAction()` throws `UnauthorizedCustomerError`.
- **Ownership Boundary:** Customer push API routes (`/api/account/push-subscriptions`) must call `requireAuthenticatedCustomerAction()` and bind `customerId: customer.id` exclusively from the server session — never from request body/params.
- **Account Deletion/Deactivation:** `Customer` has `authUserId String? @unique` (`onDelete: SetNull` on `User`). Deleting `Customer` cascades to `PushSubscription` (`onDelete: Cascade`). On customer sign-out, client/API should deactivate or unsubscribe the current device endpoint.

---

## 6. Admin Authentication & Broadcast Analysis (`VERIFIED` + `RECOMMENDED`)

- **VERIFIED (`src/modules/admin/admin-auth-service.ts`):**
  - `getAuthenticatedAdmin()` resolves `session.user.id` → `AdminUser.findUnique({ where: { userId } })` and requires `admin.isActive === true` AND `admin.user.emailVerified !== null`.
  - `requireAuthenticatedAdmin()` / `requireAdminActionPermission()` enforce separate admin boundaries (`AdminUnauthorizedError`, `AdminForbiddenError`).
- **VERIFIED (`prisma/schema.prisma:631`):** `AdminUser` has `isActive Boolean @default(true)` (`@@index([isActive])`), `userId @unique` (`onDelete: Cascade`), and `roles AdminUserRole[]`.
- **RECOMMENDED Admin Broadcast Resolution (NO RBAC Filtering):**
  - Admin push registration (`/api/admin/push-subscriptions`) requires `getAuthenticatedAdmin()` (any active, verified admin regardless of role/permission) and binds `adminUserId: admin.adminId` from the session.
  - Admin broadcast fan-out queries **all** active subscriptions belonging to **all** active, email-verified `AdminUser` accounts:
    ```ts
    prisma.pushSubscription.findMany({
      where: {
        isActive: true,
        adminUserId: { not: null },
        adminUser: { isActive: true, user: { emailVerified: { not: null } } },
      },
    })
    ```
  - Deactivating (`AdminUser.isActive = false`) or deleting (`AdminUser` cascade) immediately excludes that admin from broadcasts; additionally, deactivating `PushSubscription` rows when `isActive` is toggled to `false` provides defense-in-depth.

---

## 7. Service Worker / PWA Analysis (`NOT FOUND` + `RECOMMENDED`)

- **NOT FOUND:** `public/` contains only `fonts/` and `images/`. No `sw.js`, no `manifest.webmanifest`, no `PushManager` registration, and no Edge runtime routes exist.
- **RECOMMENDED Location & Scope:** `public/sw.js` served at `/sw.js` with `scope: "/"`.
  - Must implement **only** `push` and `notificationclick` listeners (no `fetch` interception/custom caching) so it never interferes with Next.js App Router SSR, RSC payloads, `/api/*` routes, or auth redirects.
  - `notificationclick` must validate `event.notification.data?.url` as a same-origin relative path (`startsWith("/") && !startsWith("//")`), focus an existing matching tab or call `clients.openWindow(targetUrl)`.

---

## 8. Database Design Recommendation (`RECOMMENDED`)

1. **New `PushSubscription` Model:**
   - Fields: `id` (`cuid()`), `customerId String?`, `adminUserId String?`, `endpoint String @unique`, `p256dh String`, `auth String`, `userAgent String?`, `isActive Boolean @default(true)`, `createdAt`, `updatedAt`, `lastUsedAt DateTime?`.
   - Relations: `customer Customer? @relation(fields: [customerId], references: [id], onDelete: Cascade)`, `adminUser AdminUser? @relation(fields: [adminUserId], references: [id], onDelete: Cascade)`.
   - Indexes: `@@index([customerId, isActive])`, `@@index([adminUserId, isActive])`, `@@index([isActive, updatedAt])`.
   - **Single-Owner Invariant (SQL `CHECK` constraint in migration):**
     `CHECK (("customerId" IS NOT NULL AND "adminUserId" IS NULL) OR ("customerId" IS NULL AND "adminUserId" IS NOT NULL))`
2. **Extend `Notification` & Enums (Additive Only):**
   - `NotificationChannel`: add `PUSH`, `IN_APP`.
   - `NotificationEventType`: add `NEW_ORDER_ADMIN`, `PAYMENT_RECEIVED_ADMIN`, `PAYMENT_FAILED_ADMIN`, `NEW_CUSTOMER_ADMIN`, `LOW_STOCK_ADMIN`, `SHIPMENT_EXCEPTION_ADMIN`, `REFUND_REQUIRED_ADMIN`, `NOTIFICATION_FAILED_ADMIN`, `SECURITY_ALERT`, `REFUND_STATUS_UPDATED` (only for events approved in Phase 19B).
   - `Notification`: add `adminUserId String?` (FK `AdminUser`, `onDelete: Cascade`), `pushSubscriptionId String?` (FK `PushSubscription`, `onDelete: SetNull`), `targetUrl String?`, `readAt DateTime?`.
   - **Credential Sensitivity:** `endpoint`, `p256dh`, and `auth` are bearer-like push credentials; never return `p256dh` or `auth` to client APIs (return only masked/truncated device metadata + `id`, `userAgent`, `isActive`, `lastUsedAt`).

---

## 9. VAPID & Independent Channel Delivery Design (`RECOMMENDED`)

- **Library:** Node.js `web-push` package (`setVapidDetails(subject, publicKey, privateKey)`), running strictly in Node.js API/worker routes (not Edge).
- **Independent Channels:**
  - Enqueue `EMAIL` (`dedupeKey: ${eventType}:${entityId}`), `IN_APP` (`dedupeKey: IN_APP:${eventType}:${recipientKey}:${entityId}`), and `PUSH` (one `Notification` + `NotificationJob` per active `PushSubscription`, `dedupeKey: PUSH:${eventType}:${sub.id}:${entityId}`) as **separate** rows.
  - `processNextNotificationJob()` branches on `notification.channel`:
    - `EMAIL` → `sendTransactionalEmail()` (Resend)
    - `PUSH` → `sendWebPushNotification()` (`web-push`)
    - `IN_APP` → immediately marks `SENT` (ready for UI read)
  - **Failure Isolation:** A `PUSH` failure never affects `EMAIL` or `IN_APP`. HTTP `404` or `410` from a push service marks `PushSubscription.isActive = false` and marks that `Notification` as `DEAD_LETTER` (permanent); `429`/`5xx`/network errors schedule exponential retry via `NotificationJob`.

---

## 10. Customer & Admin Notification Event Matrix

| Event | Origin | Cust? | All Active Admins? | Email | In-App | Push | Existing Status | Missing Work | Suggested Title / Body / URL |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- |
| **Order Confirmed** (Cust) | `payment-settlement` / `admin-order-transition` | Yes | No | Yes | Yes | Yes | Email **VERIFIED** | Add `PUSH` + `IN_APP` fan-out | `Order Confirmed` / `Order <no> is confirmed.` / `/account/orders/<id>` |
| **Payment Successful** (Cust) | `payment-settlement` | Yes | No | Yes | Yes | Yes | Email **VERIFIED** | Add `PUSH` + `IN_APP` | `Payment Received` / `Payment for <no> succeeded.` / `/account/orders/<id>` |
| **Order Processing** (Cust) | `admin-order-transition` / `markOrderPacked` | Yes | No | Yes | Yes | Yes | Email **VERIFIED** | Add `PUSH` + `IN_APP` | `Order Being Prepared` / `Order <no> is being prepared.` / `/account/orders/<id>` |
| **Order Shipped** (Cust) | `dispatchAdminOrder` / `tracking-sync` | Yes | No | Yes | Yes | Yes | Email **VERIFIED** | Add `PUSH` + `IN_APP` | `Order Dispatched` / `Order <no> shipped via <carrier>.` / `/account/orders/<id>` |
| **Out for Delivery** (Cust) | `tracking-sync-service` | Yes | No | Yes | Yes | Yes | Email **VERIFIED** | Add `PUSH` + `IN_APP` | `Out for Delivery` / `Order <no> is out for delivery.` / `/account/orders/<id>` |
| **Order Delivered** (Cust) | `admin-order-transition` / `tracking-sync` | Yes | No | Yes | Yes | Yes | Email **VERIFIED** | Add `PUSH` + `IN_APP` | `Order Delivered` / `Order <no> has been delivered.` / `/account/orders/<id>` |
| **Order Cancelled** (Cust) | `cancelAdminOrder` | Yes | No | Yes | Yes | Yes | Email **VERIFIED** | Add `PUSH` + `IN_APP` | `Order Cancelled` / `Order <no> was cancelled.` / `/account/orders/<id>` |
| **Refund Status Updated** (Cust) | *Proposed* (`Order.manualRefundRequired`) | Yes | No | Opt | Yes | Yes | **NOT FOUND** | Add refund trigger/action | `Refund Update` / `Refund status updated for <no>.` / `/account/orders/<id>` |
| **Security Events** (Cust) | `auth-service.ts` (password reset) | Yes | No | Yes | Opt | Opt | Direct Email **VERIFIED** | Optional `IN_APP`/`PUSH` | `Security Alert` / `Your WatchStore password was changed.` / `/account/security` |
| **New Order** (Admin) | `createPersistentOrder` | No | **Yes** | No | Yes | Yes | **NOT FOUND** | Add Admin broadcast enqueue | `New Order Received` / `Order <no> placed (<total>).` / `/admin/orders/<id>` |
| **Payment Received** (Admin) | `markPaymentCapturedInTx` | No | **Yes** | No | Yes | Yes | **NOT FOUND** | Add Admin broadcast enqueue | `Payment Captured` / `Payment received for <no>.` / `/admin/orders/<id>` |
| **Payment Failed** (Admin) | `markPaymentFailedInTx` | No | **Yes** | No | Yes | Yes | **NOT FOUND** | Add Admin broadcast enqueue | `Payment Failed` / `Payment failed for <no>.` / `/admin/payments` |
| **New Customer** (Admin) | `registerCustomerAccount` / `createUser` | No | **Yes** | No | Yes | Yes | **NOT FOUND** | Add Admin broadcast enqueue | `New Customer` / `A new customer registered.` / `/admin/customers` |
| **Low Stock** (Admin) | `reserveStockInTx` / `inventory-mutation` | No | **Yes** | No | Yes | Yes | Threshold only **VERIFIED** | Trigger when crossing `<= threshold` | `Low Stock Alert` / `<SKU> reached <qty> available.` / `/admin/inventory/<id>` |
| **Shipment Exception** (Admin) | `shipment-creation-service` / `tracking-sync` | No | **Yes** | No | Yes | Yes | **NOT FOUND** | Trigger on `FAILED`/`RECONCILIATION_REQUIRED` | `Shipment Exception` / `Shipment for <no> needs attention.` / `/admin/shipments` |
| **Refund Request** (Admin) | `cancelAdminOrder` (`manualRefundRequired`) | No | **Yes** | No | Yes | Yes | Flag only **VERIFIED** | Enqueue when `manualRefundRequired=true` | `Manual Refund Required` / `Cancelled prepaid order <no>.` / `/admin/orders/<id>` |
| **Notification Delivery Failure** (Admin) | `notification-worker-service` (`DEAD_LETTER`) | No | **Yes** | No | Yes | Yes | **NOT FOUND** | Enqueue on `EMAIL` `DEAD_LETTER` (avoid loops!) | `Notification Failed` / `Email delivery failed for <id>.` / `/admin/notifications` |

---

## 11. Frontend Integration Plan (`RECOMMENDED`)

- **Customer (`/account/notifications`):** Reuse existing page alongside `NotificationPreferencesForm` to add a **"Browser Push Notifications"** card (permission status badge, Enable/Disable toggle, current browser status, registered devices list with remove action) styled with WatchStore surface/outline/primary tokens (light & dark, responsive).
- **Admin (`/admin/settings` or `/admin/notifications` + header bell):** Add an Admin **"Browser Push Notifications"** card on `/admin/settings` (or `/admin/notifications`) with Enable/Disable, permission status, device list, and **"Send Test Push"** button (authenticated to current `adminUserId` only).

---

## 12. Security Analysis (`RECOMMENDED`)

1. **VAPID Keys:** `VAPID_PRIVATE_KEY` server-only (never `NEXT_PUBLIC_`). Public key served via `GET /api/push/vapid-public-key`.
2. **Ownership & Auth:** Customer routes require `requireAuthenticatedCustomerAction()`; Admin routes require `getAuthenticatedAdmin()` (active + verified). Server always derives `customerId` or `adminUserId` from session.
3. **CSRF & Origin:** Next.js App Router / SameSite cookies + explicit `Origin` / `Host` check on `/api/*` subscription mutations + `checkRateLimit`.
4. **Endpoint Validation & SSRF:** Validate `https://` URL, reject private/loopback/link-local IPs, and restrict `endpoint.hostname` to known Web Push service domains (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`, `*.push.samsung.com`) before persisting or calling `web-push`.
5. **Payload Privacy:** Never include PII, addresses, phone numbers, or payment IDs in push payloads.
6. **Lifecycle Cleanup:** Deactivate subscriptions on HTTP `404`/`410`, on user logout (best-effort client unsubscribe + `DELETE` endpoint), and exclude/deactivate on `AdminUser.isActive = false` or `Customer` deletion.

---

## 13. Environment & Deployment Requirements (`RECOMMENDED`)

- **New Env Vars:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:concierge@...`).
- **HTTPS:** Required by browsers for Service Workers and `PushManager` (`localhost` works in dev; Vercel Preview & Production provide HTTPS automatically).
- **Vercel Cron:** Existing `/api/internal/notifications/process` (`*/2 * * * *`) can process `PUSH` jobs. **Constraint:** Currently processes `20` jobs sequentially per run (`operations-service.ts:193`); with `N` active admins, admin broadcasts multiply job counts by `N`. Recommend bounded parallel `Promise.allSettled` batches (e.g., batch size `10`, per-request timeout `5s`) and `export const maxDuration = 60` on Pro.

---

## 14. Testing Strategy (`RECOMMENDED`)

- **Unit Tests:** Subscription schema & endpoint allowlist/SSRF rejection, `web-push` mocked `201` / `404` / `410` / `429` / `5xx` handling, independent channel isolation, admin broadcast query (active vs inactive/unverified), minimal payload privacy.
- **Integration Tests (Local `watchstore_db`):** Single-owner `CHECK` constraint, duplicate endpoint upsert, multi-device subscriptions, customer isolation, `FOR UPDATE SKIP LOCKED` concurrent push+email processing, `AdminUser` deactivation exclusion, existing email notification regressions.
- **Browser E2E (`NOT TESTED` without real HTTPS + browser):** Service Worker registration (`public/sw.js`), `Notification.requestPermission()`, `PushManager.subscribe()`, `push` event display, `notificationclick` navigation.

---

## 15. Proposed Phase 19B File Changes, Migration & Sequence

- **Proposed Prisma Migration (`0015_phase19_web_push`):** Add `PUSH`, `IN_APP` to `NotificationChannel`; add approved admin/cust values to `NotificationEventType`; add `PushSubscription` table + `CHECK` constraint; add `adminUserId`, `pushSubscriptionId`, `targetUrl`, `readAt` to `Notification`.
- **Proposed Sequence:** (1) Schema + migration on local DB → (2) `web-push` install + `env.ts` VAPID config → (3) `push-subscription-service.ts` & `push-sender.ts` → (4) Extend `notification-outbox-service.ts` & `notification-worker-service.ts` → (5) API routes (`/api/push/vapid-public-key`, `/api/account/push-subscriptions`, `/api/admin/push-subscriptions`, `/api/admin/push-subscriptions/test`) → (6) `public/sw.js` + Customer/Admin UI → (7) Unit, DB integration, and regression tests.
- **Items Requiring Explicit Approval Before Phase 19B:**
  1. Approval of `0015_phase19_web_push` schema & enum additions.
  2. Approval to install `web-push` (+ `@types/web-push`).
  3. Confirmation of which optional/proposed events (`LOW_STOCK_ADMIN`, `NEW_CUSTOMER_ADMIN`, `REFUND_STATUS_UPDATED`, `NOTIFICATION_FAILED_ADMIN`) to include in Phase 19B.
  4. Approval to generate VAPID keys in `.env` / Vercel.
