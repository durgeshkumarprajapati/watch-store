# Phase 2 — Data Integrity Report (`watchstore_db`)

**Audit Date:** 2026-11-26  
**Scope:** Read-only integrity verification of all `854` local rows across `41` application tables. No automatic repairs were performed.

---

## 1. Summary of Integrity Checks

| Check | Result | Findings |
| :--- | :--- | :--- |
| **Orphaned Foreign Keys** (all FK constraints) | **PASS** | `0` orphaned FK references across the entire database |
| **Case-Insensitive Duplicate Emails** (`User`, `Customer`) | **PASS** | `0` duplicates |
| **Duplicate Order Numbers / Payment Refs / Webhook Events** | **PASS** | `0` duplicates (`Order.orderNumber`, `Payment.providerOrderId`, `Payment.providerPaymentId`, `RazorpayWebhookEvent.eventId`) |
| **Negative Stock (`ProductStock.available < 0` or `reserved < 0`)** | **PASS** | `0` negative values |
| **Inventory Reservation Consistency** | **WARNING (7 rows)** | `7` products have `ProductStock.reserved > 0` while active `RESERVED` `InventoryReservation` sum is `0` (see details below) |
| **Expired Active (`RESERVED`) Reservations** | **PASS** | `0` expired active reservations (`3` `COMMITTED`, `1` `EXPIRED`) |
| **Product Pricing (`pricePaise <= 0` or `mrpPaise < pricePaise`)** | **PASS** | `0` invalid product prices |
| **Order Monetary Consistency** | **PASS** | `0` negative totals, `0` `grandTotalPaise` formula mismatches, `0` `OrderItem` subtotal mismatches |
| **Payment Amount vs Order Grand Total** | **PASS** | `0` mismatches |
| **Products Without Images or Stock** | **PASS** | `0` products missing `ProductImage` or `ProductStock`, `0` empty image URLs |

---

## 2. Exception Details: `ProductStock.reserved` vs `InventoryReservation` (7 Products)

Seven seeded products in `ProductStock` have `reserved > 0` even though `InventoryReservation` has `0` rows with `status = 'RESERVED'` (the 4 rows in `InventoryReservation` are `3` `COMMITTED` and `1` `EXPIRED`):

| `productId` | `sku` | `available` | `reserved` | Active `RESERVED` Sum |
| :--- | :--- | ---: | ---: | ---: |
| `p-001` | `VRN-CHR-402` | 18 | 3 | 0 |
| `p-002` | `ORR-DRS-118` | 12 | 1 | 0 |
| `p-005` | `ORR-DRS-094` | 25 | 2 | 0 |
| `p-007` | `VRN-CHR-417` | 14 | 2 | 0 |
| `p-008` | `VRN-CHR-431` | 5 | 1 | 0 |
| `p-009` | `VRM-DIV-206` | 16 | 2 | 0 |
| `p-011` | `VRF-FEM-128` | 11 | 1 | 0 |

**Root Cause:** `prisma/seed.ts` seeds initial `ProductStock.reserved` values without creating corresponding `InventoryReservation` rows.  
**Recommendation:** Migrate `ProductStock` as-is during data transfer (zero data loss) and optionally reconcile `reserved` to `0` post-migration only if desired by operations.

---

## 3. Supabase Conflict Analysis (Existing Target Data)

Supabase currently contains `152` rows across `8` tables:
- `AdminPermission` (37), `AdminRole` (6), `AdminRolePermission` (103), `AdminUser` (1), `AdminUserRole` (1), `AdminAuditLog` (1), `AuthActionToken` (1), `User` (2).

### Identified Conflicts

1. **`User` Email Collisions (2/2 rows):**
   - `admin@watchstore.com`: Local `cmww4mr1o0017wgmh27mvsrp9` vs Supabase `cmwx6nbfx0017wgx7qzp5qh2d`
   - `durgeshpardypanda@gmail.com`: Local `cmww136iq0000wgg1gdvx84op` vs Supabase `cmwx6nidb0000wgu1gzb9zkro`
2. **`AdminUser` Collision (1/1 row):**
   - Local `cmww4mr1q0019wgmhnqmttf4v` vs Supabase `cmwx6nc150019wgx7w9ks83v6` (both `admin@watchstore.com`).
3. **`AdminRole` & `AdminPermission` CUID Mismatches:**
   - All `6` `AdminRole` codes and `37` `AdminPermission` codes match, but all CUID `id` values differ between local and Supabase because `seed-rbac.ts` generates fresh CUIDs.
4. **No Conflicts on Business Tables:**
   - `Brand`, `Category`, `Product`, `Customer`, `Order`, `Payment`, `Notification`, etc. all have `0` rows in Supabase.
