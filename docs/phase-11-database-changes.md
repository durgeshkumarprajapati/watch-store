# Phase 11 — Database Changes

## Migration: `0007_phase11_admin_orders`

Applied additively via `npm run db:deploy` without resetting or dropping any tables.

### 1. `FulfilmentStatus` Enum
`AWAITING_PACKING`, `PACKED`, `DISPATCHED`, `DELIVERED`, `CANCELLED`.

### 2. `Order` Extensions
- `fulfilmentStatus FulfilmentStatus @default(AWAITING_PACKING)`
- `packedAt DateTime?`, `packedByAdminId String?` (FK to `AdminUser`, `onDelete: SetNull`)
- `carrierName String?`, `trackingNumber String?`, `trackingUrl String?`, `shipmentReference String?`, `shippingNotes String?`
- `shippedAt DateTime?`, `deliveredAt DateTime?`
- `cancelledAt DateTime?`, `cancellationReason String?`, `cancellationNotes String?`, `manualRefundRequired Boolean @default(false)`
- Index on `(fulfilmentStatus, createdAt)`.

### 3. `OrderStatusHistory` Extensions
- `actorAdminId String?` (FK to `AdminUser`, `onDelete: SetNull`)
- `idempotencyKey String? @unique`
