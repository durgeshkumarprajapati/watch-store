# Phase 10 — Repository Audit & Inventory Architecture Plan

## 1. Existing Inventory Architecture

Inspected `prisma/schema.prisma`, `src/modules/inventory/reservation-service.ts`, `src/modules/checkout/persistent-order-service.ts`, and `src/modules/catalogue/summary.ts`. Current `watchstore_db` baseline: **12 `ProductStock` rows, 2 `InventoryReservation` rows, 4 `StockAdjustment` rows**.

- **`ProductStock`**: Stores integer `available` (`@default(0)`), `reserved` (`@default(0)`), and `updatedAt` keyed by `productId (@id)`.
- **`InventoryReservation`**: Tracks per-`OrderItem` reservations (`RESERVED`, `COMMITTED`, `RELEASED`, `EXPIRED`) with `expiresAt`, `committedAt`, and `releasedAt`.
- **`StockAdjustment`**: Immutable ledger recording `deltaAvailable`, `deltaReserved`, `reason` (`RESTOCK`, `RESERVATION`, `RELEASE`, `COMMIT`, `EXPIRATION`, `MANUAL_ADJUSTMENT`), `referenceId`, `note`, and `createdAt`.

## 2. Existing Stock Calculation Rules

- **Available stock**: `ProductStock.available` (units purchasable by new orders).
- **Reserved stock**: `ProductStock.reserved` (units held by `RESERVED` orders).
- **Physical stock**: `available + reserved` (total physical units on hand).
- **Low-stock classification** (`src/modules/catalogue/summary.ts`): `available <= 0` -> `out_of_stock`; `0 < available <= 3` -> `low_stock`; `available > 3` -> `in_stock`.

## 3. Existing Reservation Lifecycle

- **Reserve (`reserveStockInTx`)**: Atomic `updateMany` with `available >= quantity` decrements `available` and increments `reserved`, creates `InventoryReservation` (`RESERVED`, 30-minute TTL), and writes `StockAdjustment` (`RESERVATION`).
- **Commit (`commitReservationInTx`)**: Conditional `updateMany` (`status = RESERVED` -> `COMMITTED`), decrements `reserved` (leaving `available` unchanged, reducing physical stock), and writes `StockAdjustment` (`COMMIT`).
- **Release / Expire (`releaseReservationInTx`)**: Conditional `updateMany` (`status = RESERVED` -> `RELEASED` or `EXPIRED`), increments `available`, decrements `reserved`, and writes `StockAdjustment` (`RELEASE` or `EXPIRATION`).
- **Cleanup (`cleanupExpiredReservations`)**: Batch-releases expired `RESERVED` records inside individual transactions.

## 4. Existing Stock Mutation Flows & Payment Dependencies

- COD orders and Razorpay-pending orders reserve stock inside `createPersistentOrder` (`persistent-order-service.ts`).
- Payment verification (`payment-verification-service.ts`), settlement (`payment-settlement.ts`), and webhooks (`payment-webhook-service.ts`) call `commitReservationInTx` / `releaseReservationInTx` idempotently.
- No administrator-facing stock inward, stock outward, adjustment, threshold configuration, movement history UI, or reservation visibility UI exists yet.

## 5. Existing Database Constraints & RBAC

- `ProductStock.productId` is `@id` with cascading FK to `Product`.
- `InventoryReservation.orderItemId` is `@unique`.
- `src/modules/admin/rbac-catalogue.ts` already defines `inventory.read` and `inventory.update` (assigned to `SUPER_ADMIN`, `ADMIN`, and `INVENTORY_MANAGER`).

## 6. Missing Functionality & Minimal Additive Schema Changes

To support Phase 10 without duplicating models or altering payment/reservation behavior:

1. **`ProductStock.lowStockThreshold`** (`Int @default(3)`): Configurable per-product non-negative low-stock threshold.
2. **`StockAdjustmentReason` enum**: Add `OUTWARD` alongside `RESTOCK`, `RESERVATION`, `RELEASE`, `COMMIT`, `EXPIRATION`, `MANUAL_ADJUSTMENT` so inward (`RESTOCK`), outward (`OUTWARD`), and count adjustments (`MANUAL_ADJUSTMENT`) are cleanly distinguished.
3. **`StockAdjustment` extensions**:
   - `previousPhysical Int?`, `newPhysical Int?`
   - `actorAdminId String?` (FK to `AdminUser`, `onDelete: SetNull`) — `null` indicates system/checkout/payment actor; non-null identifies the administrator.
   - `idempotencyKey String? @unique` — prevents duplicate admin stock mutations on retries.

All changes are strictly additive (`0006_phase10_admin_inventory`).

## 7. Proposed Transaction, Concurrency & UI Strategy

- **Concurrency**: Every admin stock mutation runs inside `prisma.$transaction`:
  - Idempotency check on `idempotencyKey` (returns prior result if already applied).
  - Row-level lock (`SELECT available, reserved FROM "ProductStock" WHERE "productId" = $1 FOR UPDATE`) inside the transaction, ensuring serialized reads/writes against concurrent checkouts, commitments, and admin adjustments.
  - Conditional/invariant checks: `newAvailable >= 0`, `newPhysical >= reserved`, and `available` never becomes negative.
- **UI Routes**:
  - `/admin/inventory` (overview metrics, server-side filtered/paginated listing, low-stock/out-of-stock filters)
  - `/admin/inventory/[productId]` (product stock detail, threshold editor, quick inward/outward/adjustment links)
  - `/admin/inventory/inward`, `/admin/inventory/outward`, `/admin/inventory/adjustments`
  - `/admin/inventory/movements` (read-only unified movement ledger)
  - `/admin/inventory/reservations` (read-only reservation visibility)
- **Testing**: Unit tests for validation, low-stock classification, and RBAC; PostgreSQL integration tests against `watchstore_db` for inward, outward, adjustments, idempotency, threshold updates, and real concurrent operations (`Promise.all`) alongside full Phase 1–9 regression.
