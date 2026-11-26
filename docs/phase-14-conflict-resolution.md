# Phase 14 — Conflict Resolution Policy

WatchStore uses an **optimistic staleness guard** anchored on `GoogleSheetsConnection.lastExportedAt` and `Product.updatedAt`:

1. **Detection**: During import (both dry-run and commit), if an existing product matched by `SKU` has `product.updatedAt > connection.lastExportedAt` (with `lastExportedAt` present), the row is flagged as a conflict (`ERROR` operation) with a clear message instructing the administrator to re-export or edit the product directly in the WatchStore Admin Catalogue.
2. **Authoritative Source**: PostgreSQL always wins. Conflicted rows are skipped during commit rather than silently overwriting newer admin edits in the database.
3. **Auditability**: Every conflicted row is persisted in `CatalogueSyncRowResult` with the row number, SKU, and conflict reason so administrators can inspect and resolve discrepancies from `/admin/google-sheets/[syncJobId]`.
4. **Resolution Workflow**:
   - Re-export the catalogue from `/admin/google-sheets` to refresh the sheet and advance `lastExportedAt`.
   - Re-apply any intended spreadsheet edits on top of the fresh export.
   - Run Dry Run Import, verify zero conflicts/errors, then Commit Import.
