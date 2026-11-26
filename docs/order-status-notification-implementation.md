# Order Status Notification Implementation

**Date:** 2026-11-26  
**Branch:** `development`

---

## 1. Status-to-Notification Mapping

| Order Transition / Action | Source Function | Outbox `NotificationEventType` | `dedupeKey` | Preference Rule |
| :--- | :--- | :--- | :--- | :--- |
| `PENDING -> CONFIRMED` (COD) | `transitionAdminOrderStatus` | `COD_ORDER_CONFIRMED` | `COD_ORDER_CONFIRMED:<orderId>` | Mandatory (`isMandatory: true`) |
| `PENDING -> CONFIRMED` (Razorpay) | `transitionAdminOrderStatus` | `ORDER_CONFIRMED` | `ORDER_CONFIRMED:<orderId>` | Mandatory (`isMandatory: true`) |
| `CONFIRMED -> PROCESSING` | `transitionAdminOrderStatus` / `markOrderPacked` | `ORDER_CONFIRMED` (`newStatus: "PROCESSING"`) | `ORDER_PROCESSING:<orderId>` | Mandatory (`isMandatory: true`) |
| `PROCESSING -> SHIPPED` | `dispatchAdminOrder` | `SHIPMENT_DISPATCHED` | `SHIPMENT_DISPATCHED:<orderId>` | Optional (`shippingUpdatesEnabled`) |
| `SHIPPED -> DELIVERED` | `transitionAdminOrderStatus` | `ORDER_DELIVERED` | `ORDER_DELIVERED:<orderId>` | Optional (`shippingUpdatesEnabled`) |
| `-> CANCELLED` | `cancelAdminOrder` | `ORDER_CANCELLED` | `ORDER_CANCELLED:<orderId>` | Mandatory (`isMandatory: true`) |
| `Shipment -> OUT_FOR_DELIVERY` | `tracking-sync-service.ts` | `OUT_FOR_DELIVERY` | `OUT_FOR_DELIVERY:<orderId>` | Optional (`shippingUpdatesEnabled`) |

---

## 2. Changes Implemented

1. **`src/modules/admin/orders/admin-order-transition-service.ts`**
   - Added outbox notification enqueuing for `PROCESSING` (both in `transitionAdminOrderStatus` and `markOrderPacked` when transitioning into `PROCESSING`) and manual `CONFIRMED` on `RAZORPAY` orders.
   - Passed `previousStatus`, `newStatus`, and `statusUpdatedAt` to `enqueueOrderNotificationInTx` across `transitionAdminOrderStatus`, `markOrderPacked`, `dispatchAdminOrder`, and `cancelAdminOrder`.
   - All enqueues remain inside the same `prisma.$transaction` as the order status update and `OrderStatusHistory` insert; failed or same-status transitions roll back / abort before any notification is created.

2. **`src/modules/notifications/notification-outbox-service.ts`**
   - Updated `enqueueOrderNotificationInTx` to query the linked `Customer` (`email`, `fullName`) and resolve the authoritative customer email (`order.customer?.email || order.guestEmail`), falling back to `guestEmail` / `guestName` for guest checkout orders.
   - Validated the resolved recipient with `emailSchema.safeParse(...)`; invalid/empty emails safely return `{ created: false }` without breaking the transaction or falling back to admin emails.

3. **`src/modules/notifications/notification-templates.ts`**
   - Added optional `previousStatus`, `newStatus`, `statusUpdatedAt`, and `expectedDelivery` fields to `notificationPayloadSchema` (backward-compatible with existing outbox rows).
   - Added `PROCESSING` subject/heading/intro rendering (`"Your Order Is Being Prepared"`).
   - Rendered status transition (`previousStatus -> newStatus`), `statusUpdatedAt` timestamp, `cancellationReason` for `ORDER_CANCELLED`, and `expectedDelivery` (only when actually provided) in both HTML and plain-text emails.

---

## 3. Outbox Processing, Retries & Environment Variables

- **Worker & Cron:** Queued `Notification` + `NotificationJob` rows are claimed atomically via `FOR UPDATE SKIP LOCKED` in `processNextNotificationJob()` and executed by `GET/POST /api/internal/notifications/process` (`*/2 * * * *` in `vercel.json`, authenticated via `Authorization: Bearer <CRON_SECRET>`).
- **Retries & Idempotency:** Resend requests include `Idempotency-Key: <dedupeKey>`. Transient `429`/`5xx` responses schedule exponential backoff retries (`FAILED`); permanent `4xx` or exhausted attempts move to `DEAD_LETTER`.
- **Required Env Vars:** `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_URL` (for `/account/orders/<orderId>` links), and `CRON_SECRET`.
- **Database Changes:** None (`0` schema or migration changes).
