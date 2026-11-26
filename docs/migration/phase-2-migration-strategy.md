# Phase 2 — Migration Strategy & Conflict Resolution Plan

## 1. Evaluation of Migration Methods

| Method | Assessment for WatchStore | Verdict |
| :--- | :--- | :--- |
| **Full `pg_dump` / `pg_restore`** | Would collide with Supabase's existing `_prisma_migrations`, RBAC CUIDs (`AdminRole`, `AdminPermission`, `AdminRolePermission`), and `User`/`AdminUser` IDs. Requires truncating Supabase or manual conflict-resolution SQL. | **Not Recommended** |
| **PostgreSQL `COPY`-based Transfer** | Fast for millions of rows, but cannot cleanly remap `User.id` / `AdminUser.id` foreign keys inline without staging tables, and unnecessary for `854` total rows. | **Overkill** |
| **Prisma-Based Table-Wise Migration Script (via `DIRECT_URL`)** | Uses `DIRECT_URL` (port `5432` session mode), preserves all original business PKs/FKs, skips RBAC/`User`/`AdminUser` overwrites, remaps `User.id` and `AdminUser.id` FKs deterministically in memory, runs inside a single transaction or checkpointed batches, and performs row-count + FK verification. | **RECOMMENDED** |

---

## 2. Why This Strategy Fits WatchStore + Supabase

1. **Pooler Safety:** Uses `DIRECT_URL` (`aws-1-ap-southeast-2.pooler.supabase.com:5432`, session pooler) — never the `6543` transaction pooler — avoiding prepared-statement and interactive transaction timeout issues.
2. **Dataset Size:** Only `701` business/operational/audit rows need to be transferred from local (`854` total minus `153` local auth/RBAC rows that are preserved on Supabase). Over `DIRECT_URL`, batched `createMany` / `upsert` inserts across ~20 non-empty tables complete in seconds.
3. **Existing Supabase Data Protection:**
   - **Never overwrite or delete** Supabase's `AdminPermission` (37), `AdminRole` (6), `AdminRolePermission` (103), `User` (2), `AdminUser` (1), `AdminUserRole` (1), `AuthActionToken` (1), or `AdminAuditLog` (1).
   - **ID Remapping Maps:**
     - `USER_ID_MAP`:
       - `cmww136iq0000wgg1gdvx84op` → `cmwx6nidb0000wgu1gzb9zkro` (`durgeshpardypanda@gmail.com`)
       - `cmww4mr1o0017wgmh27mvsrp9` → `cmwx6nbfx0017wgx7qzp5qh2d` (`admin@watchstore.com`)
     - `ADMIN_ID_MAP`:
       - `cmww4mr1q0019wgmhnqmttf4v` → `cmwx6nc150019wgx7w9ks83v6` (`admin@watchstore.com`)
   - Apply `USER_ID_MAP` to `Customer.authUserId`.
   - Apply `ADMIN_ID_MAP` to `Order.packedByAdminId`, `OrderStatusHistory.actorAdminId`, `StockAdjustment.actorAdminId`, `CatalogueSyncJob.startedByAdminId`, `GoogleSheetsConnection.updatedByAdminId`, and `AdminAuditLog.actorAdminId`.
4. **Idempotency:** Use `skipDuplicates: true` (or `upsert` keyed by primary key `id`) so re-running after any transient network interruption is safe and never creates duplicates.

---

## 3. Execution Order & Verification Checklist

1. Take pre-migration backups of both `watchstore_db` and Supabase (see `phase-2-backup-and-recovery.md`).
2. Run migration script in topological order (`Level 0` → `Level 4`) over `DIRECT_URL` with `--dry-run` first, then live mode.
3. Verify target row counts match expected totals (`local_rows + preserved_supabase_rows`).
4. Run post-migration FK integrity, monetary consistency, and application smoke tests (`GET /api/health`, `/admin`, `/products`).
