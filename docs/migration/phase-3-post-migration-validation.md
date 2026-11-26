# Phase 3G — Post-Migration Validation Report

**Verification Method:** Independent read-only SQL and Prisma queries executed against both `watchstore_db` and Supabase `oovkkzetdjiphjumponn` after migration completion.

---

## 1. Database, Schema & Row-Count Reconciliation

- **Public Tables on Destination:** `42` (`41` application tables + `_prisma_migrations`)
- **Prisma Migrations on Destination:** `13` applied, `0` rolled back (unchanged)
- **Total Source Application Rows:** `854`
- **Total Destination Application Rows:** `854`
- **Table-Wise Differences (`source !== dest`):** Only the `2` expected differences:
  1. `AdminAuditLog`: `source = 11`, `dest = 12` (`1` preserved Supabase `SUPER_ADMIN` provisioning log + `11` migrated local logs).
  2. `ShiprocketAuthToken`: `source = 1`, `dest = 0` (expired `1970-01-01` local placeholder intentionally skipped).
- **Empty Tables (`0` source, `0` dest):** `Account`, `CustomerAddress`, `NotificationPreference`, `RazorpayWebhookEvent`, `SchedulerRun`, `Session`, `Shipment`, `ShipmentStatusHistory`, `ShippingJob`, `ShippingWebhookEvent`, `VerificationToken`.

---

## 2. Foreign-Key & Identity Mapping Validation

- **Orphaned Foreign Keys Across All FK Constraints:** `0`
- **Preserved Supabase `SUPER_ADMIN` & RBAC:**
  - `AdminUser`: `cmwx6nc150019wgx7w9ks83v6` (`admin@watchstore.com`, `userId: cmwx6nbfx0017wgx7qzp5qh2d`, `isActive: true`, role: `['SUPER_ADMIN']`)
  - `AdminRole`: `6` | `AdminPermission`: `37` | `AdminRolePermission`: `103` | `AdminUserRole`: `1`
- **All 28 Remapped Foreign Keys Verified:**
  - `Customer.authUserId`: `cmww4w7870003wgcimgykybb2` → `cmwx6nbfx0017wgx7qzp5qh2d` (`1` remap) and preserved `cmwx702dz0004wgu14bfo1fy0` → `cmwx6nidb0000wgu1gzb9zkro`
  - `Order.packedByAdminId`: `1` row (`WS-5691226B0B`) → `cmwx6nc150019wgx7w9ks83v6`
  - `Order.customerId`: `2` rows → `cmwx702dz0004wgu14bfo1fy0`
  - `OrderStatusHistory.actorAdminId`: `3` non-null rows → `cmwx6nc150019wgx7w9ks83v6` (`7` null)
  - `CatalogueSyncJob.startedByAdminId`: `3` rows → `cmwx6nc150019wgx7w9ks83v6`
  - `GoogleSheetsConnection.updatedByAdminId`: `1` row (`default`, worksheet `Catalogue`, `isActive: true`) → `cmwx6nc150019wgx7w9ks83v6`
  - `AdminAuditLog.actorAdminId`: `12` rows (`11` migrated + `1` preserved) → `cmwx6nc150019wgx7w9ks83v6`
  - `Notification.customerId`: `6` rows → `cmwx702dz0004wgu14bfo1fy0` (`274` null)

---

## 3. Exact Business-Data Value Reconciliation

- **Catalogue (`Product` 12, `Brand` 4, `Category` 4, `ProductCategory` 14, `ProductImage` 12):** Exact JSON comparison of `id`, `sku`, `pricePaise`, `mrpPaise`, `gstRateBps`, `status`, `isActive` = **100% MATCH**.
- **Inventory (`ProductStock` 12, `InventoryReservation` 4, `StockAdjustment` 8):** Exact JSON comparison of `productId`, `available`, `reserved`, `lowStockThreshold` = **100% MATCH**. All 7 seeded reserved values (`p-001`: 3, `p-002`: 1, `p-005`: 2, `p-007`: 2, `p-008`: 1, `p-009`: 2, `p-011`: 1) preserved verbatim.
- **Orders & Payments (`Order` 4, `OrderItem` 4, `OrderAddressSnapshot` 4, `OrderStatusHistory` 10, `Payment` 4, `PaymentAttempt` 3):** Exact JSON comparison of IDs, `orderNumber`, `subtotalPaise`, `grandTotalPaise`, `includedGstPaise`, `lineTotalPaise`, `lineGstPaise`, `amountPaise`, `providerOrderId`, `providerPaymentId`, `status` = **100% MATCH**.
- **Notifications & Operations (`Notification` 280, `NotificationJob` 280, `MediaCleanupJob` 12, `CatalogueSyncJob` 3, `CatalogueSyncRowResult` 12):** Row counts and FK integrity = **100% MATCH**.

---

## 4. Read-Only Application Smoke Tests

| Check | Target | Result |
| :--- | :--- | :--- |
| Runtime Prisma DB Smoke (`DATABASE_URL` port `6543`, sequential) | `AdminRole` (6), `AdminPermission` (37), `Product` active (12), `Order` (4), `Shipment` (0), `MediaCleanupJob` (12) | **PASS** |
| `GET /api/health` | `http://127.0.0.1:3000/api/health` | **PASS** (`200 {"status":"ok"}`) |
| `GET /` (Homepage) | `http://127.0.0.1:3000/` | **PASS** (`200`) |
| `GET /products` (Catalogue) | `http://127.0.0.1:3000/products` | **PASS** (`200`) |
| `GET /product/tempora-heritage-chronograph-40mm` (Product Detail) | `http://127.0.0.1:3000/product/...` | **PASS** (`200`) |
| `GET /account`, `/account/orders` (Unauthenticated) | Redirect protection | **PASS** (`307 -> /login`) |
| `GET /admin/login` | Admin login page | **PASS** (`200`) |
| `GET /admin/dashboard`, `/admin/orders`, `/admin/inventory`, `/admin/shipments`, `/admin/operations` (Unauthenticated) | Admin auth protection | **PASS** (`307 -> /admin/login`) |
| Authenticated Customer/Admin UI session reads & write flows | Orders/payments/shipments/emails | **NOT TESTED** (excluded by read-only safety rules) |
