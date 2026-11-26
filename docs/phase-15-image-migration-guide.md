# Phase 15 — Local Product Image Migration Guide

## Overview
[media-migration-service.ts](file:///home/ppsd-021/watch-store/src/modules/admin/catalogue/media-migration-service.ts) and [migrate-product-media.ts](file:///home/ppsd-021/watch-store/scripts/migrate-product-media.ts) safely migrate locally stored `ProductImage` records (`/images/...`) to Cloudinary without modifying static site/category assets or deleting local originals.

## Commands
### 1. Dry-Run (No Cloudinary or DB mutations)
```bash
npx tsx --env-file=.env scripts/migrate-product-media.ts --dry-run
```
Reports total discovered images, eligible images, expected Cloudinary folder (`watchstore/products/<sku>`), deterministic `public_id`, already migrated images, missing files, and duplicate source paths.

### 2. Execute Migration (Requires Cloudinary credentials in `.env`)
```bash
npx tsx --env-file=.env scripts/migrate-product-media.ts --execute
```
Uploads each eligible local image using a deterministic `public_id` (`img_<sha256_20>`), updates `ProductImage.url`, `provider`, and `publicId`, and preserves `sortOrder`, `alt`, and `productId`.

## Retry & Recovery
- Re-running `--execute` automatically skips records already marked `provider = "cloudinary"` or `https://res.cloudinary.com/...` (`SKIPPED_ALREADY_MIGRATED`).
- Because deterministic `public_id` values are used per `<sku>:<sourceUrl>`, interrupted uploads retry cleanly without creating duplicate Cloudinary assets.
- Local files under `public/images/products/` and `public/images/uploads/products/` are never deleted automatically.
