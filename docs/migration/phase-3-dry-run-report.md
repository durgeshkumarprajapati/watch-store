# Phase 3D & 3E — Dry-Run Report

**Command:** `npx tsx --env-file=.env src/scripts/migrate-local-to-supabase/index.ts --dry-run`  
**Destination Writes Performed:** `0`

---

## 1. Identity & Conflict Resolution Mappings

| Entity | Match Key | Local ID | Preserved Supabase ID | Action |
| :--- | :--- | :--- | :--- | :--- |
| `User` | `durgeshpardypanda@gmail.com` | `cmww136iq0000wgg1gdvx84op` | `cmwx6nidb0000wgu1gzb9zkro` | Preserve Supabase `User`; remap `Customer.authUserId` |
| `User` | `admin@watchstore.com` | `cmww4mr1o0017wgmh27mvsrp9` | `cmwx6nbfx0017wgx7qzp5qh2d` | Preserve Supabase `User`; remap `Customer.authUserId` |
| `AdminUser` | `admin@watchstore.com` | `cmww4mr1q0019wgmhnqmttf4v` | `cmwx6nc150019wgx7w9ks83v6` | Preserve Supabase `SUPER_ADMIN`; remap all admin FKs |
| `Customer` | `durgeshpardypanda@gmail.com` | `cmww1yuth0001wgj6kjet4706` | `cmwx702dz0004wgu14bfo1fy0` | Preserve Supabase `Customer`; skip duplicate insert; remap `Order.customerId` & `Notification.customerId` |
| `AdminRole` / `AdminPermission` | `code` (`6` / `37`) | Local CUIDs | Supabase CUIDs | Preserve Supabase RBAC untouched |

---

## 2. Table-Wise Dry-Run Plan

| Level | Table | Source Rows | Dest Existing | Expected Inserts | Expected Skips | FK Remaps | Expected Final Count |
| :---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| L0 | `Brand` | 4 | 0 | 4 | 0 | 0 | 4 |
| L0 | `Category` | 4 | 0 | 4 | 0 | 0 | 4 |
| L0 | `MediaCleanupJob` | 12 | 0 | 12 | 0 | 0 | 12 |
| L1 | `Customer` | 4 | 1 | 3 | 1 | 1 | 4 |
| L1 | `Product` | 12 | 0 | 12 | 0 | 0 | 12 |
| L2 | `ProductCategory` | 14 | 0 | 14 | 0 | 0 | 14 |
| L2 | `ProductImage` | 12 | 0 | 12 | 0 | 0 | 12 |
| L2 | `ProductStock` | 12 | 0 | 12 | 0 | 0 | 12 |
| L2 | `StockAdjustment` | 8 | 0 | 8 | 0 | 0 | 8 |
| L2 | `Order` | 4 | 0 | 4 | 0 | 3 | 4 |
| L2 | `CatalogueSyncJob` | 3 | 0 | 3 | 0 | 3 | 3 |
| L2 | `GoogleSheetsConnection` | 1 | 0 | 1 | 0 | 1 | 1 |
| L2 | `AdminAuditLog` | 11 | 1 | 11 | 0 | 11 | 12 |
| L3 | `CatalogueSyncRowResult` | 12 | 0 | 12 | 0 | 0 | 12 |
| L3 | `OrderAddressSnapshot` | 4 | 0 | 4 | 0 | 0 | 4 |
| L3 | `OrderItem` | 4 | 0 | 4 | 0 | 0 | 4 |
| L3 | `OrderStatusHistory` | 10 | 0 | 10 | 0 | 3 | 10 |
| L3 | `Payment` | 4 | 0 | 4 | 0 | 0 | 4 |
| L3 | `Notification` | 280 | 0 | 280 | 0 | 6 | 280 |
| L4 | `InventoryReservation` | 4 | 0 | 4 | 0 | 0 | 4 |
| L4 | `PaymentAttempt` | 3 | 0 | 3 | 0 | 0 | 3 |
| L4 | `NotificationJob` | 280 | 0 | 280 | 0 | 0 | 280 |
| **Total** | **22 Migrated Tables** | **702** | **2** | **701** | **1** | **28** | **703** |

- **Preserved Untouched Tables (`151` rows):** `AdminPermission` (`37`), `AdminRole` (`6`), `AdminRolePermission` (`103`), `User` (`2`), `AdminUser` (`1`), `AdminUserRole` (`1`), `AuthActionToken` (`1`).
- **Skipped Local Tables:** `_prisma_migrations` (`13`), `ShiprocketAuthToken` (`1` expired `1970-01-01` placeholder), `AuthActionToken` (`1` duplicate `EMAIL_VERIFICATION` token).
- **Expected Final Total Application Rows on Supabase:** `703 + 151 = 854` rows.
