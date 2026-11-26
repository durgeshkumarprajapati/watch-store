# Phase 3F — Migration Execution Report

**Execution Window (UTC):** `2026-11-26T07:05:03Z` → `2026-11-26T07:06:02Z` (`59` seconds)  
**Source Database:** Local PostgreSQL `watchstore_db` (`localhost:5432`, user `watchstore_user`)  
**Destination Database:** Supabase PostgreSQL `oovkkzetdjiphjumponn` (`aws-1-ap-southeast-2.pooler.supabase.com:5432`, database `postgres`, user `postgres.oovkkzetdjiphjumponn`, via `DIRECT_URL`)  
**Command Used:** `npx tsx --env-file=.env src/scripts/migrate-local-to-supabase/index.ts --execute` (batch size `50`, `--resume=false`)  
**Checkpoint File:** `/home/ppsd-021/watchstore-backups/migration-checkpoint.json` (`22` tables recorded as completed at `2026-11-26T07:06:02.795Z`)

---

## 1. Per-Table Execution Summary

| Table | Source Rows | Destination Before | Inserted | Skipped | Remapped (FKs) | Failed | Destination After |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `Brand` | 4 | 0 | 4 | 0 | 0 | 0 | 4 |
| `Category` | 4 | 0 | 4 | 0 | 0 | 0 | 4 |
| `MediaCleanupJob` | 12 | 0 | 12 | 0 | 0 | 0 | 12 |
| `Customer` | 4 | 1 | 3 | 1 | 1 | 0 | 4 |
| `Product` | 12 | 0 | 12 | 0 | 0 | 0 | 12 |
| `ProductCategory` | 14 | 0 | 14 | 0 | 0 | 0 | 14 |
| `ProductImage` | 12 | 0 | 12 | 0 | 0 | 0 | 12 |
| `ProductStock` | 12 | 0 | 12 | 0 | 0 | 0 | 12 |
| `StockAdjustment` | 8 | 0 | 8 | 0 | 0 | 0 | 8 |
| `Order` | 4 | 0 | 4 | 0 | 3 | 0 | 4 |
| `CatalogueSyncJob` | 3 | 0 | 3 | 0 | 3 | 0 | 3 |
| `GoogleSheetsConnection` | 1 | 0 | 1 | 0 | 1 | 0 | 1 |
| `AdminAuditLog` | 11 | 1 | 11 | 0 | 11 | 0 | 12 |
| `CatalogueSyncRowResult` | 12 | 0 | 12 | 0 | 0 | 0 | 12 |
| `OrderAddressSnapshot` | 4 | 0 | 4 | 0 | 0 | 0 | 4 |
| `OrderItem` | 4 | 0 | 4 | 0 | 0 | 0 | 4 |
| `OrderStatusHistory` | 10 | 0 | 10 | 0 | 3 | 0 | 10 |
| `Payment` | 4 | 0 | 4 | 0 | 0 | 0 | 4 |
| `Notification` | 280 | 0 | 280 | 0 | 6 | 0 | 280 |
| `InventoryReservation` | 4 | 0 | 4 | 0 | 0 | 0 | 4 |
| `PaymentAttempt` | 3 | 0 | 3 | 0 | 0 | 0 | 3 |
| `NotificationJob` | 280 | 0 | 280 | 0 | 0 | 0 | 280 |
| **Migrated Subtotal (22 tables)** | **702** | **2** | **701** | **1** | **28** | **0** | **703** |

### Preserved & Intentionally Skipped Tables

- **Preserved Untouched on Supabase (`151` rows):** `AdminPermission` (`37`), `AdminRole` (`6`), `AdminRolePermission` (`103`), `User` (`2`), `AdminUser` (`1`), `AdminUserRole` (`1`), `AuthActionToken` (`1`).
- **Intentionally Skipped Local Tables:** `_prisma_migrations` (`13` migrations already applied on destination), `ShiprocketAuthToken` (`1` expired `1970-01-01` placeholder), `AuthActionToken` (`1` duplicate `EMAIL_VERIFICATION` token).
- **Final Destination Total (excl. `_prisma_migrations`):** `703 + 151 = 854` application rows.

---

## 2. Execution Errors

- **None (`0` errors, `0` failed records, `0` retries triggered).**
