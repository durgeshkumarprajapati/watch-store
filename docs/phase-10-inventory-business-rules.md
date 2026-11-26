# Phase 10 — Inventory Business Rules & Invariants

1. **Quantity Definitions**:
   - `available`: Units available for new customer orders (`ProductStock.available`).
   - `reserved`: Units held by `RESERVED` order items (`ProductStock.reserved`).
   - `physicalStock`: `available + reserved`.
2. **Invariants**:
   - `available >= 0`
   - `reserved >= 0`
   - `physicalStock >= reserved`
   - Reserved stock is never consumed by admin outward or adjustment operations.
3. **Low-Stock Classification**:
   - `available <= 0` -> `OUT_OF_STOCK`
   - `0 < available <= lowStockThreshold` -> `LOW_STOCK`
   - `available > lowStockThreshold` -> `IN_STOCK`
4. **Immutability**:
   - `StockAdjustment` rows cannot be edited or deleted through admin UI/actions; corrections require a compensating movement.
5. **RBAC**:
   - Viewing inventory, movements, and reservations requires `inventory.read`.
   - Stock inward, outward, adjustments, and threshold updates require `inventory.update`.
