# Phase 10 — Database Changes

## Migration: `0006_phase10_admin_inventory`

Applied additively via `npm run db:deploy` without resetting or dropping any tables.

### 1. `StockAdjustmentReason` Enum
- Added `OUTWARD` value alongside `RESTOCK`, `RESERVATION`, `RELEASE`, `COMMIT`, `EXPIRATION`, `MANUAL_ADJUSTMENT`.

### 2. `ProductStock` Extensions
- Added `lowStockThreshold Int @default(3)` (configurable per product, non-negative).

### 3. `StockAdjustment` Extensions
- Added `previousPhysical Int?` and `newPhysical Int?` to record authoritative physical stock before/after each admin movement.
- Added `actorAdminId String?` (FK to `AdminUser`, `onDelete: SetNull`) to distinguish administrator operations from system/checkout/payment movements (`actorAdminId = null`).
- Added `idempotencyKey String? @unique` to guarantee idempotent retries for admin stock mutations.
- Added indexes on `(actorAdminId, createdAt)` and `(reason, createdAt)`.
