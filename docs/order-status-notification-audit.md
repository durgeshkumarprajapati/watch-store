# Order Status Notification Audit (Phase 1 — Read-Only)

**Audit Date:** 2026-11-26  
**Branch:** `development`

---

## 1. Execution Flow Inspected

`Admin Order UI / Action` (`src/modules/admin/orders/admin-order-actions.ts`)  
→ `Admin Order Transition Service` (`src/modules/admin/orders/admin-order-transition-service.ts`)  
→ `Notification Outbox` (`src/modules/notifications/notification-outbox-service.ts`)  
→ `Notification + NotificationJob` (PostgreSQL outbox tables)  
→ `Cron / Worker` (`/api/internal/notifications/process` → `operations-service.ts` → `notification-worker-service.ts`)  
→ `Email Templates & Sender` (`notification-templates.ts` → `email-service.ts` via Resend API)

---

## 2. Root Causes Identified

1. **Missing Outbox Enqueue for `PROCESSING` & Manual `CONFIRMED` (Razorpay) Transitions:**
   - `transitionAdminOrderStatus()` (`admin-order-transition-service.ts:137-149`) only enqueues notifications for `CONFIRMED` (`COD` only) and `DELIVERED`.
   - Transitioning an order to `PROCESSING` via `transitionAdminOrderStatus()` or `markOrderPacked()` (`lines 180-238`) creates **zero** `Notification` / `NotificationJob` records.
   - Manually transitioning a paid `RAZORPAY` order from `PENDING` → `CONFIRMED` via `transitionAdminOrderStatus()` also creates **zero** notification if payment capture didn't already enqueue `ORDER_CONFIRMED:${orderId}`.
2. **Incomplete Email Template Data (`notification-templates.ts`):**
   - `notificationPayloadSchema` and `renderNotificationEmail()` do **not** include `previousStatus`, `newStatus`, or `statusUpdatedAt` (status update date and time).
   - `cancellationReason` is present in `notificationPayloadSchema` and passed by `enqueueOrderNotificationInTx`, **but is never rendered** in either the plain-text or HTML body for `ORDER_CANCELLED` emails.
   - `expectedDelivery` (when available) is not supported in `SHIPMENT_DISPATCHED` templates.
3. **Authoritative Customer Recipient Resolution (`notification-outbox-service.ts:99`):**
   - `enqueueOrderNotificationInTx()` reads only `order.guestEmail` and `order.guestName` instead of preferring `order.customer?.email` / `order.customer?.fullName` when a registered `Customer` is linked, and does not validate the resolved email before inserting into `Notification`.
4. **Local Development Scheduler Behavior (Operational, Not a Code Bug):**
   - Emails are intentionally not sent synchronously inside admin actions. They are queued in `Notification` + `NotificationJob` and processed by `/api/internal/notifications/process` (`*/2 * * * *` in `vercel.json`). In local development, the cron endpoint must be triggered (or `executeScheduledNotificationProcess()` invoked) for queued jobs to be dispatched.
5. **Customer In-App Notification UI:**
   - `/account/notifications` (`src/app/(store)/account/notifications/page.tsx`) only provides `NotificationPreferencesForm` (`shippingUpdatesEnabled`). There is no separate in-app notification inbox; `/account/orders/[orderId]` displays order status & history.

---

## 3. Existing Strengths Verified

- Transactional outbox (`Notification` + `NotificationJob` created inside `prisma.$transaction`).
- `FOR UPDATE SKIP LOCKED` job claiming (`claimNextNotificationJob`), `Idempotency-Key` header on Resend requests, exponential backoff on `429`/`5xx`, and `DEAD_LETTER` handling.
- Mandatory transactional events (`ORDER_CONFIRMED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `COD_ORDER_CONFIRMED`, `ORDER_CANCELLED`) bypass `shippingUpdatesEnabled`, while optional shipping milestones (`SHIPMENT_CREATED`, `SHIPMENT_DISPATCHED`, `OUT_FOR_DELIVERY`, `ORDER_DELIVERED`) respect `NotificationPreference.shippingUpdatesEnabled`.
