# Phase 15 — Cloudinary Media Storage Architecture

## 1. Provider Abstraction (`MediaStorageProvider`)
All media storage operations flow through `MediaStorageProvider` in [media-storage.ts](file:///home/ppsd-021/watch-store/src/modules/admin/catalogue/media-storage.ts):
- `saveProductImage({ buffer, originalFilename, folder?, publicId? })`
- `deleteProductImage({ publicId?, url? })`

Implementations:
1. **`CloudinaryMediaStorageProvider`** ([cloudinary-media-storage.ts](file:///home/ppsd-021/watch-store/src/modules/admin/catalogue/cloudinary-media-storage.ts)):
   - Uses Node `node:crypto` SHA-1 request signing (`signCloudinaryParams`) and native `fetch` against `https://api.cloudinary.com/v1_1/<cloud_name>/image/upload` and `/image/destroy`.
   - Stores product assets in `watchstore/products/<sku>/` with sanitized, collision-resistant or deterministic public IDs.
2. **`LocalMediaStorageProvider`**:
   - Stores files under `public/images/uploads/products/` for local development and tests.
   - Deletion is strictly restricted to `/images/uploads/products/` so seeded `/images/products/` and static `/images/site/` or `/images/categories/` files are never removed.

## 2. Provider Selection (`getMediaStorageProvider`)
- **`NODE_ENV === "production"`**: Always returns `CloudinaryMediaStorageProvider` (throws `CloudinaryConfigurationError` if any of `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` is missing — never silently falls back to local disk).
- **Development / Test**: Uses `CloudinaryMediaStorageProvider` if all 3 env vars are set; otherwise uses `LocalMediaStorageProvider`.
- **Automated Tests**: Accepts an explicit `MediaStorageProvider` mock injection.

## 3. Database Metadata (`0011_phase15_cloudinary_media`)
`ProductImage` gained two additive, nullable columns:
- `provider String? @default("local")`
- `publicId String?` (indexed via `@@index([publicId])`)
