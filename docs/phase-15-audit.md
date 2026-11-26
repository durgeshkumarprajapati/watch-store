# Phase 15 — Repository Audit Report: Production Media Storage Integration (Cloudinary)

**Status:** Stage A Complete — Awaiting Approval (No application code, schema, or assets modified)

---

## 1. Existing Media Architecture
- **Provider Abstraction (`src/modules/admin/catalogue/media-storage.ts`)**:
  - `MediaStorageProvider` currently exposes `saveProductImage({ buffer, originalFilename }): Promise<StoredMediaResult>` returning `{ url, mimeType, sizeBytes }`.
  - `LocalMediaStorageProvider` writes validated files (`<= 5 MB`, magic-byte checked for `image/webp`, `image/jpeg`, `image/png`) to `public/images/uploads/products/<uuid>.<ext>` and returns `/images/uploads/products/<uuid>.<ext>`.
  - `mediaStorage` is currently instantiated directly as `new LocalMediaStorageProvider()`.
- **Image Validation (`src/modules/admin/catalogue/catalogue-schemas.ts`)**:
  - `imagePathSchema` permits local `/images/...` paths (rejecting `..`) and `https://` URLs up to 500 characters.
- **Image Rendering (`src/components/ui/media-image.tsx` & `next.config.ts`)**:
  - `MediaImage` wraps `next/image` (`fill`) with an error placeholder fallback.
  - `next.config.ts` already configures `images.remotePatterns` for `https://res.cloudinary.com`.

## 2. Existing Image Upload Flow
1. Admin forms ([admin-product-form.tsx](file:///home/ppsd-021/watch-store/src/components/admin/catalogue/admin-product-form.tsx), [admin-brand-form.tsx](file:///home/ppsd-021/watch-store/src/components/admin/catalogue/admin-brand-form.tsx), [admin-category-form.tsx](file:///home/ppsd-021/watch-store/src/components/admin/catalogue/admin-category-form.tsx)) `POST` `FormData` to `/api/admin/catalogue/upload`.
2. [route.ts](file:///home/ppsd-021/watch-store/src/app/api/admin/catalogue/upload/route.ts) authenticates the admin (`getAuthenticatedAdmin()`), checks RBAC (`products.create`, `products.update`, `brands.manage`, or `categories.manage`), validates non-empty and `<= 5 MB`, and calls `mediaStorage.saveProductImage(...)`.
3. Product create/update actions persist the returned URL array into `ProductImage` rows via `createAdminProduct` / `updateAdminProduct` in [admin-product-service.ts](file:///home/ppsd-021/watch-store/src/modules/admin/catalogue/admin-product-service.ts).
4. Currently, removing or replacing an image in `updateAdminProduct` deletes the `ProductImage` DB row (`tx.productImage.deleteMany`) without deleting orphaned remote assets, and `/api/admin/catalogue/upload` has no rate limit.

## 3. Existing Database Relationships
- **`ProductImage` (`prisma/schema.prisma`)**: `id`, `productId`, `url`, `alt`, `sortOrder` (`@@unique([productId, sortOrder])`, `@@index([productId])`, `onDelete: Cascade` to `Product`).
- **`Brand` / `Category`**: Optional `logoUrl` / `image` string columns.
- **`OrderItem`**: Stores immutable product snapshots; no FK to `ProductImage`, so image updates/deletions never mutate historical orders.
- **`ProductStock` / `InventoryReservation`**: Independent of `ProductImage`.

## 4. Existing Image Asset Inventory
- **Static Website Assets (`public/images/site/`)**: 4 `.webp` files (`site_hero.webp`, `site_heritage.webp`, `site_lifestyle_1.webp`, `site_lifestyle_2.webp`).
- **Static Category Assets (`public/images/categories/`)**: 4 `.webp` files (`category_automatic_divers.webp`, `category_chronographs.webp`, `category_minimal_dress.webp`, `category_womens_atelier.webp`).
- **Seeded Product Images (`public/images/products/`)**: 12 `.webp` files across `automatic-divers/` (2), `chronographs/` (4), `minimal-dress/` (3), and `womens-atelier/` (3).
- **Admin Uploads (`public/images/uploads/products/`)**: Directory does not exist yet (created lazily on first local upload).

## 5. Local Filesystem Dependencies Identified
1. `LocalMediaStorageProvider` in [media-storage.ts](file:///home/ppsd-021/watch-store/src/modules/admin/catalogue/media-storage.ts) writes directly to `public/images/uploads/products/`.
2. `listExistingProductImagePaths()` in [media-storage.ts](file:///home/ppsd-021/watch-store/src/modules/admin/catalogue/media-storage.ts) scans `public/images/products` and `public/images/uploads/products`.
3. `next.config.ts` Turbopack build emits a dynamic-filesystem tracing warning for `path.join(this.uploadDir, filename)` in `media-storage.ts`.

## 6. Proposed Cloudinary Integration Design
- **Provider Interface Extension (`MediaStorageProvider`)**:
  - `saveProductImage(params: { buffer: Buffer; originalFilename: string; folder?: string; publicId?: string }): Promise<StoredMediaResult>` returning `{ url, mimeType, sizeBytes, provider, publicId }`.
  - `deleteProductImage(params: { publicId: string }): Promise<void>`.
- **`CloudinaryMediaStorageProvider`**:
  - Server-side REST integration using Node `node:crypto` SHA-1 request signing + `fetch` (`FormData`) against `https://api.cloudinary.com/v1_1/<cloud_name>/image/upload` and `/image/destroy`. Zero new npm dependencies required.
  - Predictable folder & public IDs: `watchstore/products/<sku-or-uuid>` (sanitized server-side; never user-controlled paths).
- **Provider Selection (`getMediaStorageProvider()`)**:
  - `NODE_ENV === "production"`: Requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`; throws a sanitized configuration error if missing (never silently falls back to local disk).
  - Development (`NODE_ENV !== "production"`): Uses Cloudinary when all 3 env vars are set; otherwise uses `LocalMediaStorageProvider`.
  - Tests: Accept injected mock `MediaStorageProvider`.
- **Failure-Safe Replacement & Deletion**:
  - Upload new asset first -> persist in PostgreSQL transaction -> delete old remote asset only after DB commit and only if no other `ProductImage` references that `publicId`.
  - If DB persistence fails after upload, attempt best-effort orphan cleanup of the newly uploaded asset.
- **Migration Utility**:
  - Separate service/CLI supporting `--dry-run` (zero Cloudinary/DB mutations) and `--execute` (idempotent upload using deterministic `publicId` derived from SKU/filename, preserving `sortOrder`, `alt`, `productId`, and keeping local files intact).

## 7. Required Environment Variables
Add empty placeholders to `.env.example` and optional server-only fields to `src/config/env.ts`:
- `CLOUDINARY_CLOUD_NAME=`
- `CLOUDINARY_API_KEY=`
- `CLOUDINARY_API_SECRET=`

## 8. Proposed Files to Add or Modify
- **Modify**: `.env.example`, `src/config/env.ts`, `prisma/schema.prisma`, `src/modules/admin/catalogue/media-storage.ts`, `src/modules/admin/catalogue/catalogue-schemas.ts`, `src/modules/admin/catalogue/admin-product-service.ts`, `src/app/api/admin/catalogue/upload/route.ts`, `src/components/admin/catalogue/admin-product-form.tsx`.
- **Add**:
  - `prisma/migrations/0011_phase15_cloudinary_media/migration.sql`
  - `src/modules/admin/catalogue/cloudinary-media-storage.ts`
  - `src/modules/admin/catalogue/media-migration-service.ts`
  - `scripts/migrate-product-media.ts`
  - `tests/unit/phase-15-media.test.ts`
  - `tests/integration/admin-media-db.test.ts`
  - `docs/phase-15-*.md` (architecture, media storage rules, migration guide, security, testing, implementation report)

## 9. Database Changes
Smallest additive change on `ProductImage` (`0011_phase15_cloudinary_media`):
- `provider String? @default("local")` (`"local"` | `"cloudinary"`)
- `publicId String?` (Cloudinary `public_id` for safe deletion, replacement, and migration deduplication)
- `@@index([publicId])`

No changes to `ProductStock`, `InventoryReservation`, `Order`, `OrderItem`, `Payment`, `Shipment`, or `Notification`.

## 10. Security Risks & Mitigations
- **Credential Exposure**: Keep `CLOUDINARY_API_SECRET` strictly server-side; sanitize all provider errors before returning to UI/logs.
- **Arbitrary Path / Public ID Injection**: Generate folder (`watchstore/products/`) and `publicId` server-side; verify `ProductImage.productId` ownership before deletion.
- **Spoofed Files / Oversized Payloads**: Enforce 5 MB limit + magic-byte inspection (`detectImageMimeType`) for WebP, JPEG, PNG.
- **Upload Abuse**: Add per-admin rate limiting (`checkRateLimit`) on `/api/admin/catalogue/upload`.

## 11. Existing Flows Potentially Affected
- Admin product create/edit/delete, brand/category image upload, public storefront (`MediaImage`), and Google Sheets image URL export/import (all continue working because `ProductImage.url` remains a standard `/images/...` or `https://res.cloudinary.com/...` URL).

## 12. Testing Strategy
- **Unit (`tests/unit/phase-15-media.test.ts`)**: Provider selection, production fail-closed behavior when credentials missing, Cloudinary SHA-1 signature generation, upload/delete success & sanitized error handling, magic-byte & 5 MB checks, safe public ID generation, orphan cleanup, migration dry-run & idempotency.
- **PostgreSQL Integration (`tests/integration/admin-media-db.test.ts`)**: Product image association, replacement & old-asset cleanup after DB commit, rollback orphan cleanup, ownership/RBAC checks, migration dry-run & retry without duplicates, historical `OrderItem` preservation.
- **Regression**: Re-run all unit tests, DB integration tests, `typecheck`, `lint`, and `qa:build`.

## 13. Existing Limitations & Migration Considerations
- Live Cloudinary API connectivity cannot be executed until real credentials are added to `.env` after implementation.
- Static `public/images/site/` and `public/images/categories/` remain local static assets and will not be migrated unless separately approved.
- Local original files under `public/images/products/` and `public/images/uploads/products/` will be preserved during migration until verified.
