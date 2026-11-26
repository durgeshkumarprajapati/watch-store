# Phase 6 — Repository Payment & Checkout Audit

## 1. Existing Payment-Related Database Models
Inspected [`prisma/schema.prisma`](../prisma/schema.prisma) and [`prisma/migrations/0001_init/migration.sql`](../prisma/migrations/0001_init/migration.sql):
- **`Order`**: `id`, `orderNumber` (`@unique`), `idempotencyKey` (`@unique`), `customerId`, `guestEmail`, `guestName`, `guestPhone`, `status` (`OrderStatus`), `paymentStatus` (`PaymentStatus`), `paymentProvider` (`PaymentProvider`), `grandTotalPaise`, `createdAt`, `updatedAt`.
- **`Payment`**: `id`, `orderId`, `provider` (`RAZORPAY | COD`), `status` (`PaymentStatus`), `amountPaise`, `currency` (`"INR"`), `providerOrderId`, `providerPaymentId`, `createdAt`, `updatedAt`.
- **`PaymentAttempt`**: `id`, `paymentId`, `status` (`PaymentStatus`), `providerRef`, `errorCode`, `errorMessage`, `createdAt`.

## 2. Existing Order & Payment State Machines
Inspected [`src/modules/checkout/status-transitions.ts`](../src/modules/checkout/status-transitions.ts):
- `OrderStatus`: `PENDING -> CONFIRMED | CANCELLED`, `CONFIRMED -> PROCESSING | CANCELLED`, `PROCESSING -> SHIPPED | CANCELLED`, `SHIPPED -> DELIVERED`.
- `PaymentStatus`: `PENDING -> REQUIRES_GATEWAY | AUTHORIZED | PAID | FAILED`, `REQUIRES_GATEWAY -> AUTHORIZED | PAID | FAILED`, `AUTHORIZED -> PAID | FAILED | REFUNDED`, `PAID -> REFUNDED`, `FAILED -> REQUIRES_GATEWAY`.

## 3. Existing Checkout Creation Flow
Inspected [`src/modules/checkout/actions.ts`](../src/modules/checkout/actions.ts) and [`src/modules/checkout/persistent-order-service.ts`](../src/modules/checkout/persistent-order-service.ts):
- `submitCheckoutAction` validates `checkoutSchema`, loads cart/promo cookies, and calls `createPersistentOrder`.
- Inside `prisma.$transaction`, `createPersistentOrder` enforces `idempotencyKey` uniqueness + `guestEmail` ownership, re-reads DB products/prices/GST, enforces `<= ₹50,000` COD limit, creates `Order`, `OrderItem[]`, `OrderAddressSnapshot`, `OrderStatusHistory`, `Payment`, and `InventoryReservation[]`, and clears cart cookies only after commit.

## 4. Inventory Reservations
Inspected [`src/modules/inventory/reservation-service.ts`](../src/modules/inventory/reservation-service.ts):
- `reserveStockInTx`: atomic `ProductStock.updateMany` (`available >= quantity`), creates `InventoryReservation` (`RESERVED`, 30-min TTL), logs `StockAdjustment`.
- `commitReservationInTx`: idempotent `RESERVED -> COMMITTED`, decrements `reserved`.
- `releaseReservationInTx` & `cleanupExpiredReservations`: idempotent `RESERVED -> RELEASED | EXPIRED`, restores `available`.

## 5. COD vs Razorpay-Pending Representation
- **COD**: `Order(PENDING)` + `Payment(COD, PENDING)` + `InventoryReservation(RESERVED)`.
- **Razorpay**: `Order(PENDING)` + `Payment(RAZORPAY, REQUIRES_GATEWAY)` + `InventoryReservation(RESERVED)`. No `PaymentAttempt` or Razorpay gateway order is created yet.

## 6. Multiple Payment Attempts & Schema Gaps
- `PaymentAttempt` exists but lacks `attemptNumber`, `razorpayOrderId` (`@unique`), `razorpayPaymentId` (`@unique`), `verifiedAt`, `capturedAt`, and `gatewayMetadata` (`Json?`).
- `Payment` lacks `verifiedAt`, `capturedAt`, and unique constraints on `providerOrderId` / `providerPaymentId`.
- No `RazorpayWebhookEvent` table exists for durable webhook `eventId` deduplication.

## 7. Required Additive Database Changes
Create additive migration `0002_phase6_razorpay_payments`:
1. Extend `Payment` with `verifiedAt`, `capturedAt`, and unique indexes on `providerOrderId` and `providerPaymentId`.
2. Extend `PaymentAttempt` with `attemptNumber`, `razorpayOrderId` (`@unique`), `razorpayPaymentId` (`@unique`), `verifiedAt`, `capturedAt`, `gatewayMetadata` (`Json?`), and `@@unique([paymentId, attemptNumber])`.
3. Add `RazorpayWebhookEvent` (`id`, `eventId @unique`, `eventType`, `razorpayOrderId`, `razorpayPaymentId`, `payload`, `processedAt`, `createdAt`).

## 8. Reusable Components & Security Risks
- **Reused**: `createPersistentOrder`, `reserveStockInTx`, `commitReservationInTx`, `canTransitionOrderStatus`, `canTransitionPaymentStatus`, `getPrisma`, `getServerEnv`, `CheckoutView`.
- **Security risks to address**:
  - Guest checkout has no user session yet: bind client verification, retry, and order-confirmation lookups to an HMAC-signed `orderAccessToken` (derived from server secret) plus `orderNumber` + persisted `PaymentAttempt` association, never trusting raw `orderNumber` or `?success=true` query params.
  - Keep `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` strictly server-only; pass only `RAZORPAY_KEY_ID` to Checkout.js.
  - Webhook `POST /api/webhooks/razorpay` must verify `X-Razorpay-Signature` against the raw request body using `crypto.timingSafeEqual` before parsing/processing.
