# Phase 17 — Database Backup & Recovery

1. **Automated Backups & PITR**: Enable Supabase Pro daily backups and Point-in-Time Recovery (PITR) before go-live (status: **PENDING EXTERNAL CONFIGURATION**).
2. **Pre-Migration Backup**: Always verify the latest Supabase snapshot/PITR checkpoint before running `npm run db:deploy`.
3. **Recovery Procedure**:
   - Restore to a new Supabase branch/point-in-time first to verify data integrity (`Order`, `OrderItem`, `Payment`, `ProductStock`, `AdminAuditLog`).
   - Never run destructive `DROP` or `prisma migrate reset` on production.
4. **Restore Verification**: Status is **NOT VERIFIED** until executed on the provisioned Supabase Pro instance.
