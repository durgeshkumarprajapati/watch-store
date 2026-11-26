# Phase 2 — Dependency Map & Migration Order

## 1. Graph Properties

- **Cycles:** **None** (`0` circular dependencies across all 41 application tables).
- **Self-Referencing Relationship:** `Category.parentId → Category.id` (nullable, `ON DELETE SET NULL`, `ON UPDATE CASCADE`). All 4 local `Category` rows currently have `parentId = NULL`.
- **Nullable Foreign Keys (Auth / Admin / Hierarchy):**
  - `Category.parentId → Category.id`
  - `Customer.authUserId → User.id` (`ON DELETE SET NULL`)
  - `Order.packedByAdminId → AdminUser.id` (`ON DELETE SET NULL`)
  - `OrderStatusHistory.actorAdminId → AdminUser.id` (`ON DELETE SET NULL`)
  - `ShipmentStatusHistory.actorAdminId → AdminUser.id` (`ON DELETE SET NULL`)
  - `StockAdjustment.actorAdminId → AdminUser.id` (`ON DELETE SET NULL`)
  - `CatalogueSyncJob.startedByAdminId → AdminUser.id` (`ON DELETE SET NULL`)
  - `GoogleSheetsConnection.updatedByAdminId → AdminUser.id` (`ON DELETE SET NULL`)
  - `AdminAuditLog.actorAdminId → AdminUser.id` (`ON DELETE SET NULL`)

---

## 2. Topological Migration Levels

Tables must be migrated strictly in level order (`Level 0` → `Level 4`) so every parent record exists before any child foreign key is inserted. All original primary keys and business foreign keys are preserved (never regenerated), except `User.id` and `AdminUser.id` references which are remapped to the existing Supabase identities.

### Level 0 (Root Tables — No Foreign Keys)
- **Preserve in Supabase (Do Not Overwrite):** `AdminPermission` (37), `AdminRole` (6), `User` (2)
- **Migrate from Local:** `Brand` (4), `Category` (4, parents before children if `parentId` is non-null), `MediaCleanupJob` (12)
- **Optional / Skip (0 rows or expired token):** `ShiprocketAuthToken` (1 expired placeholder), `RazorpayWebhookEvent` (0), `SchedulerRun` (0), `ShippingWebhookEvent` (0), `VerificationToken` (0)

### Level 1 (Depends on Level 0)
- **Preserve in Supabase (Do Not Overwrite):** `AdminRolePermission` (103), `AdminUser` (1), `AuthActionToken` (1)
- **Migrate from Local:**
  - `Customer` (4) — remap `authUserId` via email (`cmww136iq0000wgg1gdvx84op` → `cmwx6nidb0000wgu1gzb9zkro`; `cmww4mr1o0017wgmh27mvsrp9` → `cmwx6nbfx0017wgx7qzp5qh2d`)
  - `Product` (12) — depends on `Brand`
- **Skip (0 rows):** `Account` (0), `Session` (0)

### Level 2 (Depends on Level 0–1)
- **Preserve in Supabase:** `AdminUserRole` (1)
- **Migrate from Local:**
  - `ProductCategory` (14) — depends on `Product`, `Category`
  - `ProductImage` (12) — depends on `Product`
  - `ProductStock` (12) — depends on `Product`
  - `StockAdjustment` (8) — depends on `Product`, `AdminUser` (currently 0 non-null `actorAdminId`)
  - `Order` (4) — depends on `Customer`, `AdminUser` (remap `packedByAdminId`: `cmww4mr1q0019wgmhnqmttf4v` → `cmwx6nc150019wgx7w9ks83v6`)
  - `CatalogueSyncJob` (3) — depends on `AdminUser` (remap `startedByAdminId`)
  - `GoogleSheetsConnection` (1) — depends on `AdminUser` (remap `updatedByAdminId`)
  - `AdminAuditLog` (11) — depends on `AdminUser` (remap `actorAdminId`; append alongside Supabase's existing 1 row)
- **Skip (0 rows):** `CustomerAddress` (0), `NotificationPreference` (0)

### Level 3 (Depends on Level 2)
- **Migrate from Local:**
  - `CatalogueSyncRowResult` (12) — depends on `CatalogueSyncJob`
  - `OrderAddressSnapshot` (4) — depends on `Order`
  - `OrderItem` (4) — depends on `Order`, `Product`
  - `OrderStatusHistory` (10) — depends on `Order`, `AdminUser` (remap `actorAdminId`)
  - `Payment` (4) — depends on `Order`
  - `Notification` (280) — depends on `Order`
- **Skip (0 rows):** `Shipment` (0)

### Level 4 (Depends on Level 3)
- **Migrate from Local:**
  - `InventoryReservation` (4) — depends on `Order`, `OrderItem`, `Product`
  - `PaymentAttempt` (3) — depends on `Payment`
  - `NotificationJob` (280) — depends on `Notification`
- **Skip (0 rows):** `ShipmentStatusHistory` (0), `ShippingJob` (0)

---

## 3. Sensitive / Authentication Data Tables

- `User` (`passwordHash`), `AuthActionToken` (`tokenHash`), `Account`, `Session`, `VerificationToken`
- `GoogleSheetsConnection` (`spreadsheetId`, `worksheetName` — service account key is in env, not DB)
- `ShiprocketAuthToken` (`token` — expired `1970-01-01` placeholder locally; safe to skip)
