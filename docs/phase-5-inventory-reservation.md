# Phase 5 — Atomic Inventory Reservation

Source: [`src/modules/inventory/reservation-service.ts`](../src/modules/inventory/reservation-service.ts)

## Concurrency Safety
Inside `createPersistentOrder`'s `PrismaClient.$transaction`:
1. `reserveStockInTx` executes an atomic conditional update:
   ```ts
   tx.productStock.updateMany({
     where: { productId, available: { gte: quantity } },
     data: { available: { decrement: quantity }, reserved: { increment: quantity } },
   });
   ```
2. If `count !== 1`, `InsufficientStockError` is thrown and the entire transaction rolls back — `available` can never become negative.
3. `InventoryReservation` has `@unique` on `orderItemId`, preventing duplicate reservations for the same order line.
4. Every movement (`RESERVATION`, `COMMIT`, `RELEASE`, `EXPIRATION`) is logged in `StockAdjustment`.

## Reservation Lifecycle (`ReservationStatus`)
- `RESERVED`: Created at checkout with `expiresAt = now + 30 minutes`.
- `COMMITTED`: Finalized via `commitReservationInTx` when payment/order is confirmed (decrements `reserved`).
- `RELEASED`: Released via `releaseReservationInTx` on cancellation (increments `available`, decrements `reserved`). Idempotent if already released.
- `EXPIRED`: Released via `cleanupExpiredReservations(prisma, now)` when `expiresAt <= now`. **Limitation**: No background cron worker is scheduled in Phase 5; `cleanupExpiredReservations` is ready to be invoked by a future worker.
