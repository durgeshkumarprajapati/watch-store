# Phase 2 — Backup and Recovery Strategy

## 1. Pre-Migration Backups

Both databases must be backed up **before** any write occurs. Local `pg_dump` (`17.10`) is installed and compatible with both PostgreSQL `16.14` (local) and `17.6` (Supabase).

### A. Local `watchstore_db` Full Backup
```bash
mkdir -p backups
pg_dump --format=custom --no-owner --no-privileges \
  --file="backups/watchstore_local_$(date +%Y%m%d_%H%M%S).dump" \
  "$LOCAL_DIRECT_URL"
```

### B. Supabase `oovkkzetdjiphjumponn` Pre-Migration Backup
Use `DIRECT_URL` (port `5432` session pooler, **not** `6543`) and restrict to `--schema=public` so Supabase-managed internal schemas (`auth`, `storage`, `vault`) are not touched:
```bash
pg_dump --format=custom --schema=public --no-owner --no-privileges \
  --file="backups/watchstore_supabase_pre_migration_$(date +%Y%m%d_%H%M%S).dump" \
  "$DIRECT_URL"
```

---

## 2. Backup Verification (Mandatory Before Migration)

Never assume a dump is valid without testing it:
1. **Archive Table-of-Contents Check:**
   ```bash
   pg_restore --list backups/watchstore_local_*.dump | head -n 40
   pg_restore --list backups/watchstore_supabase_pre_migration_*.dump | head -n 40
   ```
2. **Test Restore into Ephemeral Local DB (`watchstore_test`):**
   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges \
     --dbname="$TEST_DATABASE_URL" backups/watchstore_local_*.dump
   ```
   Verify `42` tables and `854` application rows are present in `watchstore_test`.

---

## 3. Migration Checkpointing & Partial-Failure Recovery

- **Checkpointing:** The Prisma migration script should log each completed topological level (`Level 0` through `Level 4`) and table count to a local JSON checkpoint file.
- **Partial Migration Recovery:** Because all inserts preserve original PKs (`id`) and use `ON CONFLICT DO NOTHING` (`skipDuplicates: true`), a failed run can be safely resumed from the failed level without duplicating rows.

---

## 4. Rollback Strategy

If critical verification fails after migration:
1. **Local Database:** Untouched throughout (remains the source of truth).
2. **Supabase Rollback (Targeted Truncate + Pre-Migration Restore):**
   - Truncate only the migrated business/operational tables (leaving `_prisma_migrations`, RBAC, `User`, `AdminUser`, `AdminUserRole`, `AuthActionToken`, and Supabase's initial `AdminAuditLog` intact), **or**
   - Restore `public` schema from `watchstore_supabase_pre_migration_*.dump` via `DIRECT_URL`:
     ```bash
     pg_restore --clean --if-exists --schema=public --no-owner --no-privileges \
       --dbname="$DIRECT_URL" backups/watchstore_supabase_pre_migration_*.dump
     ```
