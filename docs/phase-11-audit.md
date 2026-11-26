# Phase 11 — Repository Audit & Order Management Architecture Plan

## 1. Existing Order Architecture

Inspected `prisma/schema.prisma`, `src/modules/checkout/persistent-order-service.ts`, `src/modules/checkout/status-transitions.ts`, `src/modules/payments/application/payment-settlement.ts`, `src/modules/inventory/reservation-service.ts`, and `src/modules/customers/customer-service.ts`. Current `watchstore_db` baseline: **2 orders, 2 payments, 3 order status history entries, 2 inventory reservations**.

- **`Order`**: Stores `orderNumber (@unique)`, `idempotencyKey (@unique)`, `customerId`, `guestEmail`, `guestName`, `guestPhone`, `status (OrderStatus)`, `paymentStatus (PaymentStatus)`, `paymentProvider (PaymentProvider)`, `shippingMethod`, `promoCode`, and immutable paise totals (`subtotalPaise`, `mrpTotalPaise`, `productSavingsPaise`, `promoDiscountPaise`, `shippingPaise`, `includedGstPaise`, `grandTotalPaise`).
- **`OrderItem`**: Immutable snapshots (`skuSnapshot`, `productNameSnapshot`, `brandNameSnapshot`, `dialAndStrapSnapshot`, `unitMrpPaise`, `unitPricePaise`, `unitDiscountPaise`, `gstRateBps`, `quantity`, `lineTotalPaise`, `lineGstPaise`).
- **`OrderAddressSnapshot`**: Immutable delivery address snapshot per order.
- **`OrderStatusHistory`**: Chronological `fromStatus`, `toStatus`, `note`, `createdAt`.
- **`Payment` / `PaymentAttempt`**: Tracks `RAZORPAY` / `COD` payment lifecycle and attempts.

## 2. Existing State Machines & Reservation Lifecycle

- **`OrderStatus` enum**: `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`.
- **`ORDER_TRANSITIONS`** (`status-transitions.ts`):
  - `PENDING -> [CONFIRMED, CANCELLED]`
  - `CONFIRMED -> [PROCESSING, CANCELLED]`
  - `PROCESSING -> [SHIPPED, CANCELLED]`
  - `SHIPPED -> [DELIVERED]`
  - `DELIVERED -> []`
  - `CANCELLED -> []`
- **`PaymentStatus` enum**: `PENDING`, `REQUIRES_GATEWAY`, `AUTHORIZED`, `PAID`, `FAILED`, `REFUNDED`.
- **Reservations**: Checkout reserves stock (`RESERVED`). Razorpay settlement (`markPaymentCapturedInTx`) sets `Payment.status = PAID`, commits reservations (`COMMITTED`), and transitions `Order.status = CONFIRMED`. COD orders start as `Order(PENDING)` + `Payment(PENDING)` + `InventoryReservation(RESERVED)`.

## 3. Existing Customer Access & Admin RBAC

- Customer order history/detail (`src/modules/customers/customer-service.ts`, `src/app/(store)/account/orders/[orderId]/page.tsx`) scopes queries strictly by `customerId`. Guest confirmation uses HMAC-verified `orderAccessToken`.
- `src/modules/admin/rbac-catalogue.ts` defines `orders.read` and `orders.update` (`SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`; `orders.read` only for `CUSTOMER_SUPPORT`). Adding `orders.cancel` (`SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`) provides explicit cancellation gating.

## 4. Missing Functionality & Minimal Additive Schema Changes

No admin order listing, detail, fulfilment, manual shipment tracking, COD collection confirmation, or cancellation workflow exists yet.

Minimal additive migration (`0007_phase11_admin_orders`):
1. **`FulfilmentStatus` enum**: `AWAITING_PACKING`, `PACKED`, `DISPATCHED`, `DELIVERED`, `CANCELLED`.
2. **`Order` extensions**:
   - `fulfilmentStatus FulfilmentStatus @default(AWAITING_PACKING)`
   - `packedAt DateTime?`, `packedByAdminId String?` (FK to `AdminUser`, `onDelete: SetNull`)
   - `carrierName String?`, `trackingNumber String?`, `trackingUrl String?`, `shipmentReference String?`, `shippingNotes String?`
   - `shippedAt DateTime?`, `deliveredAt DateTime?`
   - `cancelledAt DateTime?`, `cancellationReason String?`, `cancellationNotes String?`, `manualRefundRequired Boolean @default(false)`
3. **`OrderStatusHistory` extensions**:
   - `actorAdminId String?` (FK to `AdminUser`, `onDelete: SetNull`) — distinguishes system vs admin transitions.
   - `idempotencyKey String? @unique` — prevents duplicate transition/cancellation history entries on retries.

## 5. Proposed Transition, Fulfilment & Cancellation Rules

- **Centralized Transition Service**: All admin order mutations run inside `prisma.$transaction` with `SELECT ... FROM "Order" WHERE "id" = $1 FOR UPDATE` row-level locking and `idempotencyKey` replay protection.
- **Prepaid (Razorpay) Guard**: Orders with `paymentProvider = RAZORPAY` and `paymentStatus !== "PAID"` cannot transition to `CONFIRMED`, `PROCESSING`, `SHIPPED`, or `DELIVERED`.
- **COD Confirmation & Collection**: Confirming a COD order (`PENDING -> CONFIRMED`) commits its `RESERVED` inventory reservations atomically. Packing/shipping does NOT mark COD as paid; explicit COD collection confirmation is required to mark `Payment.status = PAID`.
- **Cancellation**: Permitted only from `PENDING`, `CONFIRMED`, or `PROCESSING`. Releases `RESERVED` inventory via `releaseReservationInTx`; never blindly restores already-`COMMITTED` stock; marks `manualRefundRequired = true` for `PAID` Razorpay orders without fabricating `REFUNDED`.
