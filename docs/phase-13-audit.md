# Phase 13 — Repository Audit & Transactional Notification Plan

## 1. Existing Notification & Email Infrastructure

Inspected `src/modules/notifications/email-service.ts`, `src/config/env.ts`, `src/config/brand.ts`, and `src/modules/auth/auth-service.ts`.

- **Email Client (`src/modules/notifications/email-service.ts`)**: Server-only Resend HTTP client (`https://api.resend.com/emails`) with `AbortSignal.timeout(10_000)`, validating `RESEND_API_KEY` and `EMAIL_FROM` via `getServerEnv()`. Currently used for email verification and password reset emails.
- **Brand Identity (`src/config/brand.ts`)**: Centrally configured as `WatchStore` (`brand.name`, `brand.wordmark`, `brand.contact.email`). "Aurelia Horology" is not used.
- **Gaps**: No durable `Notification` / `NotificationJob` outbox, no order/payment/shipping email templates, no HTML escaping on template parameters, no Resend `Idempotency-Key` header, no customer `NotificationPreference`, and no admin notification visibility/retry UI.

## 2. Existing Database & Background Job Architecture

- **`Order`, `OrderItem`, `OrderAddressSnapshot`, `Payment`, `PaymentAttempt`, `Shipment`, `ShipmentStatusHistory`** store immutable snapshots and authoritative states.
- **`ShippingJob` (`prisma/schema.prisma`)** provides a proven PostgreSQL `FOR UPDATE SKIP LOCKED` durable job pattern with `attempts`, `maxAttempts`, `nextRunAt`, `lockedUntil`, `lockedBy`, and `lastError`.
- **Scheduler**: `POST /api/internal/shipping/sync` authenticates with `SHIPROCKET_CRON_SECRET` (`Authorization: Bearer ...`). No Vercel Cron config (`vercel.json`) exists yet; external scheduler configuration remains a production-readiness prerequisite.

## 3. Authoritative Business Event Sources

| Event | Authoritative Source | Trigger Condition |
| --- | --- | --- |
| `ORDER_CONFIRMED` | `markPaymentCapturedInTx` (`payment-settlement.ts`) | Razorpay payment captured & order transitions to `CONFIRMED` |
| `PAYMENT_SUCCESS` | `markPaymentCapturedInTx` (`payment-settlement.ts`) | `Payment.status` transitions to `PAID` (deduped across webhook & browser verification) |
| `PAYMENT_FAILED` | `markPaymentFailedInTx` (`payment-settlement.ts`) | Authoritative payment failure recorded |
| `COD_ORDER_CONFIRMED` | `transitionAdminOrderStatus` (`admin-order-transition-service.ts`) | COD order transitions `PENDING -> CONFIRMED` |
| `SHIPMENT_CREATED` | `createShiprocketShipment` / `createManualShipmentRecord` | `Shipment` persisted in `SHIPMENT_CREATED` / `IN_TRANSIT` |
| `SHIPMENT_DISPATCHED` | `dispatchAdminOrder` / `applyTrackingUpdateInTx` | Order `SHIPPED` or shipment `IN_TRANSIT` |
| `OUT_FOR_DELIVERY` | `applyTrackingUpdateInTx` (`tracking-sync-service.ts`) | Shipment transitions to `OUT_FOR_DELIVERY` |
| `ORDER_DELIVERED` | `transitionAdminOrderStatus` / `applyTrackingUpdateInTx` | Order/Shipment transitions to `DELIVERED` |
| `ORDER_CANCELLED` | `cancelAdminOrder` (`admin-order-transition-service.ts`) | Cancellation commits (notes manual refund pending if `manualRefundRequired`, never claims refund completed) |

*(Refund events `REFUND_INITIATED`, `REFUND_COMPLETED`, `REFUND_FAILED` are intentionally omitted from active triggers because automated Razorpay refunds are not yet implemented.)*

## 4. Proposed Database Changes (Additive Migration `0009_phase13_notifications`)

1. **Enums**: `NotificationChannel` (`EMAIL`), `NotificationStatus` (`PENDING`, `PROCESSING`, `SENT`, `FAILED`, `DEAD_LETTER`), `NotificationEventType` (`ORDER_CONFIRMED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `COD_ORDER_CONFIRMED`, `SHIPMENT_CREATED`, `SHIPMENT_DISPATCHED`, `OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_CANCELLED`).
2. **`Notification`**: `id`, `customerId` (nullable FK `onDelete: SetNull`), `orderId` (nullable FK `onDelete: SetNull`), `eventType`, `channel`, `recipient`, `subject`, `payload` (`Json`), `status`, `provider` (`"RESEND"`), `providerMessageId`, `dedupeKey (@unique)`, `attemptCount`, `lastAttemptAt`, `sentAt`, `failedAt`, `lastError`, `createdAt`, `updatedAt`.
3. **`NotificationJob`**: `id`, `notificationId (@unique)` (FK `onDelete: Cascade`), `status`, `attempts`, `maxAttempts`, `nextRunAt`, `lockedUntil`, `lockedBy`, `lastError`, `completedAt`, `createdAt`, `updatedAt`.
4. **`NotificationPreference`**: `customerId (@id)`, `orderUpdatesEnabled` (`@default(true)`), `paymentUpdatesEnabled` (`@default(true)`), `shippingUpdatesEnabled` (`@default(true)`), `accountSecurityUpdatesEnabled` (`@default(true)`), `updatedAt`. *(Mandatory transactional notifications for order confirmation, payment settlement/failure, and cancellation cannot be silenced; optional shipping milestone updates respect `shippingUpdatesEnabled`.)*

## 5. Proposed Architecture, RBAC & UI

- **Transactional Outbox**: `enqueueNotificationInTx(tx, ...)` writes `Notification` (`PENDING`) + `NotificationJob` (`PENDING`) inside the same PostgreSQL transaction as the business event, using `dedupeKey` uniqueness to prevent duplicates.
- **Worker & Endpoint**: Atomic `FOR UPDATE SKIP LOCKED` claiming (`claimNextNotificationJob`), 2-minute lease, bounded exponential backoff, `DEAD_LETTER` after `maxAttempts`, Resend `Idempotency-Key` header, and `POST /api/internal/notifications/process` (authenticated via `SHIPROCKET_CRON_SECRET` / `NOTIFICATION_CRON_SECRET`).
- **RBAC**: Add `notifications.read` and `notifications.retry` (`SUPER_ADMIN`, `ADMIN`; `notifications.read` for `CUSTOMER_SUPPORT`).
- **Admin UI**: `/admin/notifications` & `/admin/notifications/[notificationId]` (metrics, filters, detail view, audited manual retry).
- **Customer UI**: `/account/notifications` tab in `AccountShell` for preference management scoped strictly by authenticated `customer.id`.

## 6. Security & Test Strategy

- **Security**: Escape all HTML template variables (`escapeHtml`), validate `https://` tracking URLs, never expose secrets/admin URLs/tokens in emails, sanitize provider errors.
- **Tests**: Unit tests (templates, HTML escaping, retry/backoff, RBAC, ownership) + PostgreSQL integration tests against `watchstore_db` (transactional rollback, dedupeKey idempotency, concurrent `FOR UPDATE SKIP LOCKED` job claiming, lease recovery, `DEAD_LETTER`, audited retry, customer scoping) + full Phase 5–12 regression suite.
