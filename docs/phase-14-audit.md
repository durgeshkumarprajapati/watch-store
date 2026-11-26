# Phase 14 — Repository Audit & Google Sheets Catalogue Integration Plan

## 1. Existing Catalogue Architecture

Inspected `prisma/schema.prisma`, `src/modules/admin/catalogue/admin-product-service.ts`, `admin-brand-service.ts`, `admin-category-service.ts`, `catalogue-schemas.ts`, and `src/modules/catalogue/`.

- **`Product` Model**: `id`, `slug (@unique)`, `sku (@unique)`, `name`, `brandId` (FK to `Brand`), `gender` (`men | women | unisex`), `watchType` (`chronograph | automatic | dress | diver`), `strapMaterial` (`steel | leather | mesh`), `dialAndStrap`, `description`, `specMovement`, `specCaseDimensions`, `specCrystal`, `specWaterResistance`, `specHsn` (4–8 digits), `mrpPaise` (`Int`), `pricePaise` (`Int`), `gstRateBps` (`Int`), `badge` (`best_seller | new_arrival | limited | null`), `isBestSeller` (`Boolean`), `warrantyYears` (`Int?`), `status` (`DRAFT | PUBLISHED | ARCHIVED`), `isActive` (`Boolean`), `createdAt`, `updatedAt`.
- **Relationships**: `ProductCategory` (many-to-many with `Category`), `ProductImage` (ordered `sortOrder: 0..n`), `ProductStock` (`available`, `reserved`, `lowStockThreshold`).
- **Business Rules**:
  - `pricePaise > 0`, `pricePaise <= mrpPaise`, `0 <= gstRateBps <= 2800`.
  - `Product.isActive` is synchronized with `Product.status === "PUBLISHED"`.
  - Published products require at least one category and an active brand.
  - Newly created products default to `DRAFT` unless explicitly authorized for publication (`catalogue.publish`).

## 2. Inventory Synchronization Boundaries

- `ProductStock`, `InventoryReservation`, and `StockAdjustment` are managed exclusively by Phase 10 and Phase 5–6 checkout/reservation services.
- **Boundary**: Catalogue sync must **never** modify `ProductStock.available`, `ProductStock.reserved`, `InventoryReservation`, or `OrderItem` snapshots. Stock is excluded from Google Sheets imports.

## 3. Existing RBAC & Admin Navigation

- `src/components/admin/admin-nav.ts` already contains `{ href: "/admin/google-sheets", label: "Google Sheets Sync", icon: "table_view", permission: "products.update" }`.
- Proposed minimal RBAC additions (`src/modules/admin/rbac-catalogue.ts`):
  - `catalogue.sync.read`
  - `catalogue.sync.configure`
  - `catalogue.sync.import`
  - `catalogue.sync.export`
  - Assigned to `SUPER_ADMIN`, `ADMIN`, and `CATALOG_MANAGER` (with `catalogue.sync.configure` restricted to `SUPER_ADMIN` and `ADMIN`).

## 4. Existing Background Job Architecture

- `ShippingJob` and `NotificationJob` use PostgreSQL `FOR UPDATE SKIP LOCKED` with leases, retry counts, and exponential backoff.
- For Phase 14, bounded catalogue imports/exports (e.g., up to 500 rows per sync) can run deterministically with durable `CatalogueSyncJob` + `CatalogueSyncRowResult` records, preventing concurrent syncs on the same worksheet via a PostgreSQL advisory/row lock on `GoogleSheetsConnection` (`FOR UPDATE`).

## 5. Google Sheets API v4 Authentication Recommendation

- **Recommended Approach**: **Option A — Google Service Account** (RS256 JWT signed via Node's built-in `node:crypto`, exchanged at `https://oauth2.googleapis.com/token` for an `https://www.googleapis.com/auth/spreadsheets` Bearer token, calling `https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}` with `RAW` / `USER_ENTERED` and batch operations).
- **Why**: WatchStore manages a single business-owned catalogue spreadsheet rather than per-user Drive files. Service Account avoids OAuth user-consent complexity, requires zero extra SDK dependencies, and restricts access to spreadsheets explicitly shared with `GOOGLE_SERVICE_ACCOUNT_EMAIL` (`Editor`).
- **Rate Limits & Quotas**: Handle HTTP `429` / `5xx` with truncated exponential backoff.

## 6. Proposed Spreadsheet Structure (`Catalogue` Worksheet)

Columns mapped 1:1 to `Product`:
`SKU` (required, matching key) | `Product Name` (required) | `Slug` | `Brand` (name/slug) | `Categories` (comma-separated slugs) | `Gender` | `Watch Type` | `Strap Material` | `Dial & Strap` | `Description` | `Movement` | `Case Dimensions` | `Crystal` | `Water Resistance` | `HSN Code` | `MRP (INR)` | `Selling Price (INR)` | `GST (%)` | `Badge` | `Best Seller` | `Warranty (Years)` | `Status` (`DRAFT` / `PUBLISHED` / `ARCHIVED`) | `Primary Image` | `Updated At (Read-Only)`.

- Branded as `WatchStore` (never `Aurelia Horology`).
- Formula-injection protection on export: prefix string cells starting with `=`, `+`, `-`, `@` with `'` (without corrupting legitimate numeric cells).

## 7. Conflict Detection & Synchronization Rules

- **Explicit Direction**: `EXPORT` (`PostgreSQL -> Google Sheets`) or `IMPORT` (`Google Sheets -> PostgreSQL`). No silent bidirectional sync.
- **Dry-Run Mandatory**: Dry-run executes the exact validation, SKU normalization, brand/category lookup, currency-to-paise conversion, and conflict detection (`Product.updatedAt > lastExportedAt`) without mutating PostgreSQL.
- **Empty Cells & Deletions**: Empty cells on update preserve existing PostgreSQL values; deleting a spreadsheet row never deletes or archives a PostgreSQL product.
- **New Products**: Default to `DRAFT` unless `PUBLISHED` is explicitly requested and actor holds `catalogue.publish`.

## 8. Proposed Database Changes (Additive Migration `0010_phase14_google_sheets_sync`)

1. **Enums**: `CatalogueSyncDirection` (`EXPORT`, `IMPORT`), `CatalogueSyncStatus` (`PENDING`, `RUNNING`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`), `CatalogueSyncRowOperation` (`CREATE`, `UPDATE`, `UNCHANGED`, `SKIP`, `ERROR`).
2. **`GoogleSheetsConnection`**: Singleton/configured connection (`id`, `spreadsheetId`, `worksheetName`, `isActive`, `lastConnectedAt`, `lastExportedAt`, `lastImportedAt`, `updatedByAdminId`, `updatedAt`).
3. **`CatalogueSyncJob`**: `id`, `direction`, `spreadsheetId`, `worksheetName`, `status`, `isDryRun`, `startedByAdminId`, `startedAt`, `completedAt`, `totalRows`, `createdRows`, `updatedRows`, `unchangedRows`, `skippedRows`, `failedRows`, `lastError`, `idempotencyKey (@unique)`.
4. **`CatalogueSyncRowResult`**: `id`, `syncJobId` (FK `onDelete: Cascade`), `rowNumber`, `sku`, `operation`, `status`, `validationErrors` (`Json?`), `previousValues` (`Json?`), `proposedValues` (`Json?`), `processedAt`.

## 9. Proposed Admin UI, Environment Variables & Testing

- **Routes**: `/admin/google-sheets` (dashboard, connection settings, dry-run/import, export, history) and `/admin/google-sheets/[syncJobId]` (job & row-level inspection) — matching the existing `adminNav` href `/admin/google-sheets`!
- **Env Vars (`.env.example` & `src/config/env.ts`)**: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (optional in dev/test).
- **Tests**: Unit tests (header validation, SKU normalization, formula-injection escaping, INR-to-paise, GST bps, dry-run diff/conflict detection, RBAC) + PostgreSQL integration tests against `watchstore_db` using mocked `GoogleSheetsClient` + full Phase 5–13 regression suite.
