# Phase 9 — Repository Audit & Architecture Plan

## 1. Existing Database Architecture

Inspected `prisma/schema.prisma` (migrations `0001_init` through `0004_phase8_admin_rbac`). Current `watchstore_db` baseline: **4 brands, 4 categories, 12 products, 12 product images**.

- **`Brand`**: `id`, `name`, `slug (@unique)`, `createdAt`, `updatedAt`, `products[]`.
- **`Category`**: `id`, `slug (@unique)`, `name`, `image`, `createdAt`, `updatedAt`, `products[]`.
- **`Product`**: `id`, `slug (@unique)`, `sku (@unique)`, `name`, `brandId` (FK to `Brand`, `onDelete: Restrict`), `gender`, `watchType`, `strapMaterial`, `dialAndStrap`, `description`, `specMovement`, `specCaseDimensions`, `specCrystal`, `specWaterResistance`, `specHsn`, `mrpPaise`, `pricePaise`, `gstRateBps`, `badge`, `isBestSeller`, `warrantyYears`, `isActive` (`Boolean @default(true)`), `createdAt`, `updatedAt`.
- **`ProductCategory`**: Composite `(productId, categoryId)` join table.
- **`ProductImage`**: `id`, `productId`, `url`, `alt`, `sortOrder`, `@@unique([productId, sortOrder])`.
- **`ProductStock` / `InventoryReservation` / `StockAdjustment`**: Stock and reservation tracking linked to `Product`.
- **`OrderItem`**: Stores immutable product/pricing/GST snapshots at checkout time.

## 2. Existing Product & Catalogue Data Flow

- `getProductRepository()` (`src/modules/catalogue/index.ts`) selects `prismaProductRepository` whenever `DATABASE_URL` is configured.
- `prismaProductRepository` (`src/modules/catalogue/prisma/prisma-product-repository.ts`) powers:
  - Homepage (`src/app/(store)/page.tsx`) via `listCategories()` and `listBestSellers()`.
  - Product listing (`src/app/(store)/products/page.tsx`) via `listProducts(query)`.
  - Product details (`src/app/(store)/product/[slug]/page.tsx`) via `getBySlug(slug)` and `listRelated()`.
  - Wishlist, Cart (`src/modules/cart/cart-service.ts`), and Checkout (`src/modules/checkout/persistent-order-service.ts`) via `getByIds()` and direct `prisma.product.findMany({ where: { id: { in: productIds }, isActive: true } })`.

## 3. Existing Product, Brand & Category CRUD Capabilities

- **None**. All existing routes under `src/app/admin/(protected)/` cover only `dashboard`, `users`, `audit`, and `access-denied`. `Brand`, `Category`, and `Product` are currently only populated by `prisma/seed.ts`.

## 4. Existing Image Handling

- Product, category, and site images are local `.webp` assets under `public/images/` (documented in `docs/phase-3-image-assets-required.md`).
- `ProductImage` stores `url`, `alt`, and `sortOrder` (`0` = primary image).
- No external storage provider (Cloudinary/S3) is integrated yet.

## 5. Existing RBAC Permissions

`src/modules/admin/rbac-catalogue.ts` currently defines:
- `products.read`, `products.create`, `products.update`, `products.delete`
- `categories.read`, `categories.manage`

Missing for Phase 9:
- `brands.read`, `brands.manage`
- `catalogue.publish`

## 6. Missing Functionality & Required Schema Changes

To satisfy Phase 9 without breaking Phase 1–8 queries:

1. **`ProductStatus` enum (`DRAFT`, `PUBLISHED`, `ARCHIVED`)** on `Product.status` (`@default(PUBLISHED)`):
   - Existing 12 products default to `PUBLISHED` (`isActive = true`).
   - `Product.isActive` is kept synchronized (`status === "PUBLISHED"`) so all existing storefront, cart, and checkout `isActive: true` queries automatically exclude `DRAFT` and `ARCHIVED` products.
2. **`Brand` extensions**: `description String?`, `logoUrl String?`, `isActive Boolean @default(true)`.
3. **`Category` extensions**: `parentId String?` (self-referencing `parent` / `children` for subcategory hierarchy) and `isActive Boolean @default(true)`.

All changes are strictly additive (`0005_phase9_admin_catalogue`).

## 7. Proposed Implementation Architecture

1. **Migration & RBAC Update**: Add `0005_phase9_admin_catalogue`, extend `ADMIN_PERMISSIONS` with `brands.read`, `brands.manage`, `catalogue.publish`, and re-run `npm run rbac:seed`.
2. **Backend Modules (`src/modules/admin/catalogue/`)**:
   - `catalogue-schemas.ts`: Zod schemas for product, brand, category, and image inputs (integer paise, basis points GST, `pricePaise <= mrpPaise`, slug/SKU normalization).
   - `media-storage.ts`: Provider-agnostic `MediaStorageProvider` interface with `LocalMediaStorageProvider` validating magic bytes (WebP/JPEG/PNG), size (<= 5 MB), and safe UUID filenames under `public/images/uploads/products/`.
   - `admin-product-service.ts`, `admin-brand-service.ts`, `admin-category-service.ts`: Transactional CRUD, circular-hierarchy prevention, safe archival vs restricted hard-delete, `AdminAuditLog` recording, and `revalidatePath` cache invalidation.
   - `admin-catalogue-actions.ts`: Server actions + `/api/admin/catalogue/upload` route enforcing server-side RBAC.
3. **Admin UI (`src/app/admin/(protected)/`)**:
   - `/admin/products`, `/admin/products/new`, `/admin/products/[productId]`
   - `/admin/brands`, `/admin/brands/new`, `/admin/brands/[brandId]`
   - `/admin/categories`, `/admin/categories/new`, `/admin/categories/[categoryId]`
   - Update `adminNav` to expose `Brands` and `Categories` alongside `Products`.
4. **Verification**: Unit tests, PostgreSQL integration tests against `watchstore_db`, full Phase 1–8 regression suite, typecheck, lint, and production build.
