# Phase 2 — Complete Table Inventory

**Total Tables Discovered (`public` schema):** `42` (`41` application tables + `_prisma_migrations`)  
**Total Local Rows (excl. `_prisma_migrations`):** `854`  
**Total Supabase Rows (excl. `_prisma_migrations`):** `152`

> **Note:** Four tables (`ProductCategory`, `ShipmentStatusHistory`, `ShippingWebhookEvent`, `ShiprocketAuthToken`) exist in `prisma/schema.prisma` in addition to the 37 tables explicitly listed in the audit brief, bringing the total application table count to `41`.

| Table Name | Local Rows | Supabase Rows | Primary Key | Foreign Key Dependencies | Category | Migration Requirement |
| :--- | ---: | ---: | :--- | :--- | :--- | :--- |
| `Account` | 0 | 0 | `id` | `User` | Auth / Session | Skip (0 rows) |
| `AdminAuditLog` | 11 | 1 | `id` | `AdminUser` (nullable `actorAdminId`) | Audit Data | **Migrate (11 rows) + Remap `actorAdminId`** (preserve Supabase's 1 row) |
| `AdminPermission` | 37 | 37 | `id` | None | Configuration (RBAC) | **Preserve Supabase** (IDs differ; map by `code`) |
| `AdminRole` | 6 | 6 | `id` | None | Configuration (RBAC) | **Preserve Supabase** (IDs differ; map by `code`) |
| `AdminRolePermission` | 103 | 103 | `id` | `AdminRole`, `AdminPermission` | Configuration (RBAC) | **Preserve Supabase** |
| `AdminUser` | 1 | 1 | `id` | `User` | Auth / RBAC | **Preserve Supabase `SUPER_ADMIN`** (remap local `AdminUser.id` → Supabase `AdminUser.id`) |
| `AdminUserRole` | 1 | 1 | `id` | `AdminUser`, `AdminRole` | Auth / RBAC | **Preserve Supabase** |
| `AuthActionToken` | 1 | 1 | `id` | `User` | Auth / Security | **Preserve Supabase** (skip local duplicate `EMAIL_VERIFICATION` token for `durgeshpardypanda@gmail.com`) |
| `Brand` | 4 | 0 | `id` | None | Business (Catalogue) | **Migrate (4 rows)** |
| `CatalogueSyncJob` | 3 | 0 | `id` | `AdminUser` (nullable `startedByAdminId`) | Operational (Sheets Sync) | **Migrate (3 rows) + Remap `startedByAdminId`** |
| `CatalogueSyncRowResult` | 12 | 0 | `id` | `CatalogueSyncJob` | Operational (Sheets Sync) | **Migrate (12 rows)** |
| `Category` | 4 | 0 | `id` | `Category` (self-ref nullable `parentId`) | Business (Catalogue) | **Migrate (4 rows)** |
| `Customer` | 4 | 0 | `id` | `User` (nullable `authUserId`) | Business (Customers) | **Migrate (4 rows) + Remap `authUserId`** |
| `CustomerAddress` | 0 | 0 | `id` | `Customer` | Business (Customers) | Skip (0 rows) |
| `GoogleSheetsConnection` | 1 | 0 | `id` | `AdminUser` (nullable `updatedByAdminId`) | Configuration (Sheets) | **Migrate (1 row) + Remap `updatedByAdminId`** |
| `InventoryReservation` | 4 | 0 | `id` | `Order`, `OrderItem`, `Product` | Operational (Inventory) | **Migrate (4 rows)** |
| `MediaCleanupJob` | 12 | 0 | `id` | None | Operational (Media) | **Migrate (12 rows)** |
| `Notification` | 280 | 0 | `id` | `Order` | Operational (Notifications) | **Migrate (280 rows)** |
| `NotificationJob` | 280 | 0 | `id` | `Notification` | Operational (Notifications) | **Migrate (280 rows)** |
| `NotificationPreference` | 0 | 0 | `id` | `Customer` | Configuration | Skip (0 rows) |
| `Order` | 4 | 0 | `id` | `Customer`, `AdminUser` (nullable `packedByAdminId`) | Business (Orders) | **Migrate (4 rows) + Remap `packedByAdminId`** |
| `OrderAddressSnapshot` | 4 | 0 | `id` | `Order` | Business (Orders) | **Migrate (4 rows)** |
| `OrderItem` | 4 | 0 | `id` | `Order`, `Product` | Business (Orders) | **Migrate (4 rows)** |
| `OrderStatusHistory` | 10 | 0 | `id` | `Order`, `AdminUser` (nullable `actorAdminId`) | Audit Data | **Migrate (10 rows) + Remap `actorAdminId`** |
| `Payment` | 4 | 0 | `id` | `Order` | Business (Payments) | **Migrate (4 rows)** |
| `PaymentAttempt` | 3 | 0 | `id` | `Payment` | Operational (Payments) | **Migrate (3 rows)** |
| `Product` | 12 | 0 | `id` | `Brand` | Business (Catalogue) | **Migrate (12 rows)** |
| `ProductCategory` | 14 | 0 | `id` | `Product`, `Category` | Business (Catalogue) | **Migrate (14 rows)** |
| `ProductImage` | 12 | 0 | `id` | `Product` | Business (Catalogue) | **Migrate (12 rows)** |
| `ProductStock` | 12 | 0 | `productId` | `Product` | Business (Inventory) | **Migrate (12 rows)** |
| `RazorpayWebhookEvent` | 0 | 0 | `id` | None | Operational (Webhooks) | Skip (0 rows) |
| `SchedulerRun` | 0 | 0 | `id` | None | Operational (Scheduler) | Skip (0 rows) |
| `Session` | 0 | 0 | `id` | `User` | Auth / Session | Skip (0 rows) |
| `Shipment` | 0 | 0 | `id` | `Order` | Business (Shipping) | Skip (0 rows) |
| `ShipmentStatusHistory` | 0 | 0 | `id` | `Shipment`, `AdminUser` | Audit Data | Skip (0 rows) |
| `ShippingJob` | 0 | 0 | `id` | `Shipment` | Operational (Shipping) | Skip (0 rows) |
| `ShippingWebhookEvent` | 0 | 0 | `id` | None | Operational (Webhooks) | Skip (0 rows) |
| `ShiprocketAuthToken` | 1 | 0 | `id` | None | Configuration / Auth Token | **Optional / Skip** (expired `1970-01-01` placeholder) |
| `StockAdjustment` | 8 | 0 | `id` | `Product`, `AdminUser` (nullable `actorAdminId`) | Audit / Inventory | **Migrate (8 rows) + Remap `actorAdminId`** |
| `User` | 2 | 2 | `id` | None | Auth / Identity | **Preserve Supabase** (both emails match; map local `User.id` → Supabase `User.id`) |
| `VerificationToken` | 0 | 0 | `identifier, token` | None | Auth / Security | Skip (0 rows) |
| `_prisma_migrations` | 13 | 13 | `id` | None | Prisma Internal | **Do NOT touch** |
