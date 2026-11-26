# Phase 9 — Product, Brand, Category & Media Management Architecture

## 1. Product Management
- **Routes**: `/admin/products`, `/admin/products/new`, `/admin/products/[productId]`.
- **Listing**: Server-side search (`name`, `sku`), brand filter, category filter, publication status filter (`DRAFT`, `PUBLISHED`, `ARCHIVED`), sorting (`updated-desc`, `created-desc`, `name-asc`, `price-asc`, `price-desc`), and pagination (`12` per page). Stock is displayed read-only (`available`, `reserved`).
- **Pricing & GST**: Stored in integer paise (`mrpPaise`, `pricePaise`) and basis points (`gstRateBps`). Enforces `pricePaise > 0`, `pricePaise <= mrpPaise`, and `0 <= gstRateBps <= 2800`. Historical `OrderItem` snapshots are never altered.
- **Lifecycle**: Products referenced by `OrderItem` or `InventoryReservation` cannot be hard-deleted; they are archived (`status = ARCHIVED`, `isActive = false`).

## 2. Brand Management
- **Routes**: `/admin/brands`, `/admin/brands/new`, `/admin/brands/[brandId]`.
- Supports creation, editing, descriptions, logos, active/inactive toggle, and safe delete protection when referenced by products.

## 3. Category & Subcategory Management
- **Routes**: `/admin/categories`, `/admin/categories/new`, `/admin/categories/[categoryId]`.
- Supports hierarchical parent-child relationships (`parentId`), prevents self-parenting and circular ancestor chains, and blocks deletion when products or child categories exist.

## 4. Media & Gallery Storage
- `MediaStorageProvider` (`src/modules/admin/catalogue/media-storage.ts`) with `LocalMediaStorageProvider` saving validated WebP/JPEG/PNG uploads (magic-byte verified, <= 5 MB, UUID filenames) to `public/images/uploads/products/`.
- Preserves all existing `public/images/products/` assets and allows selecting existing assets, uploading new ones, setting the main image (`sortOrder = 0`), reordering, editing alt text, and removing gallery items.
- **Limitation**: Local filesystem storage is suitable for development/single-node environments; multi-instance production hosting should swap in a Cloudinary/S3 implementation of `MediaStorageProvider`.

## 5. RBAC & Cache Invalidation
- Extended `ADMIN_PERMISSIONS` with `brands.read`, `brands.manage`, and `catalogue.publish` (assigned to `SUPER_ADMIN`, `ADMIN`, `CATALOG_MANAGER`).
- Every admin mutation writes an `AdminAuditLog` entry and calls `revalidateCataloguePaths()` for `/`, `/products`, `/product/[slug]`, and admin catalogue routes.
