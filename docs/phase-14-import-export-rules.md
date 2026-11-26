# Phase 14 — Import & Export Rules

## Export Rules
1. Only authenticated admins with `catalogue.sync.export` may export the WatchStore catalogue.
2. All `Product` records are exported ordered by `SKU` ascending, formatted into the 24-column template.
3. Monetary fields (`mrpPaise`, `pricePaise`) are converted from integer paise to INR (`paise / 100`).
4. Tax rate (`gstRateBps`) is converted from basis points to percentage (`bps / 100`).
5. Every string cell is passed through `escapeFormulaInjection` so leading `=`, `+`, `-`, `@`, `\t`, or `\r` characters are prefixed with `'` to prevent spreadsheet formula execution.
6. Exporting updates `GoogleSheetsConnection.lastExportedAt` and writes a `CatalogueSyncJob` (`EXPORT`) plus an `AdminAuditLog` entry.

## Import Rules
1. **Mandatory Dry-Run**: Admins review row-level `CREATE`, `UPDATE`, `UNCHANGED`, and `ERROR` previews before committing.
2. **Row & Cell Caps**: Maximum `500` data rows per import (`MAX_IMPORT_ROWS`) and `4000` characters per cell (`MAX_CELL_LENGTH`).
3. **SKU Matching**: Products are matched by trimmed, uppercased `SKU`. `Product.id` is never overwritten.
4. **Duplicate SKUs**: Duplicate SKUs within the same sheet are rejected on the duplicate row.
5. **Partial Update Semantics**: Empty cells on an existing SKU preserve the existing PostgreSQL field value.
6. **Non-Destructive Sync**: Removing a row from Google Sheets **never** deletes or archives the corresponding product in PostgreSQL.
7. **Inventory & Order Isolation**: `ProductStock`, `InventoryReservation`, `StockAdjustment`, `Order`, and `OrderItem` are never modified by Google Sheets import.
8. **Idempotency**: Each export/import request uses a unique `idempotencyKey` stored on `CatalogueSyncJob` to prevent duplicate execution on retries.
