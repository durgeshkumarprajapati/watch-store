# Phase 10 — Inventory Management Architecture

## Routes
- `/admin/inventory`: Real-time overview metrics, server-side search, brand/category/stock-status filters, sorting, and pagination.
- `/admin/inventory/[productId]`: Product stock breakdown (`physical = available + reserved`), low-stock threshold editor, recent movements, and quick operation links.
- `/admin/inventory/inward`: Atomic stock inward form (`RESTOCK`).
- `/admin/inventory/outward`: Atomic stock outward form (`OUTWARD`) with reservation protection.
- `/admin/inventory/adjustments`: Controlled physical cycle count / delta adjustment form (`MANUAL_ADJUSTMENT`) with confirmation.
- `/admin/inventory/movements`: Read-only unified movement ledger distinguishing admin vs system actors.
- `/admin/inventory/reservations`: Read-only reservation visibility (`RESERVED`, `COMMITTED`, `RELEASED`, `EXPIRED`).

## Concurrency & Idempotency
- Every admin stock mutation runs inside `prisma.$transaction` with:
  1. `idempotencyKey` uniqueness check (replays return the prior result without mutating stock).
  2. PostgreSQL `SELECT "available", "reserved" FROM "ProductStock" WHERE "productId" = $1 FOR UPDATE` row-level lock, serializing against concurrent checkouts, commitments, and other admin mutations.
  3. Atomic update of `ProductStock.available`, creation of immutable `StockAdjustment`, and `AdminAuditLog` entry.
