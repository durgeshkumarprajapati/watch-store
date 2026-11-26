# Phase 3C — Migration Utility Implementation

**Location:** `src/scripts/migrate-local-to-supabase/`

---

## 1. Architecture & Files

1. [`config.ts`](file:///home/ppsd-021/watch-store/src/scripts/migrate-local-to-supabase/config.ts)
   - Resolves source connection explicitly to local `watchstore_db` (asserting database name `watchstore_db`).
   - Resolves destination connection exclusively from `DIRECT_URL` (explicitly rejecting port `6543` / `pgbouncer=true` transaction pooler).
   - Supports `--dry-run` (default safe mode), `--execute`, `--batch-size=N` (default `50`), `--checkpoint-file=<path>`, and `--resume`.
   - Never prints or logs connection strings or passwords.
2. [`mappings.ts`](file:///home/ppsd-021/watch-store/src/scripts/migrate-local-to-supabase/mappings.ts)
   - Builds deterministic source-to-destination ID maps for preserved Supabase records:
     - `userIdMap` (matched by `LOWER(User.email)`)
     - `adminIdMap` (matched by `LOWER(User.email)` via `AdminUser.user`)
     - `customerIdMap` (matched by `LOWER(Customer.email)`)
     - `roleIdMap` & `permissionIdMap` (matched by `code`, verifying `6` roles and `37` permissions)
3. [`index.ts`](file:///home/ppsd-021/watch-store/src/scripts/migrate-local-to-supabase/index.ts)
   - Migrates in strict topological order (`Level 0` → `Level 4`), sorting `Category` parent-first.
   - Preserves all business primary keys and timestamps/monetary values.
   - Remaps foreign keys referencing preserved Supabase `User`, `AdminUser`, and `Customer` records.
   - Uses batched `createMany({ skipDuplicates: true })` inside per-batch `dest.$transaction(..., { timeout: 30000 })` with automatic retry (`3` attempts) and per-table checkpointing (`/home/ppsd-021/watchstore-backups/migration-checkpoint.json`).
   - Preserves `_prisma_migrations`, `User`, `AdminUser`, `AdminRole`, `AdminPermission`, `AdminRolePermission`, `AdminUserRole`, and `AuthActionToken` untouched on Supabase.

---

## 2. Verification

- `npm run typecheck` (`tsc --noEmit`): **PASS (0 errors)**
- Dry-run execution: **PASS (0 destination writes)**
