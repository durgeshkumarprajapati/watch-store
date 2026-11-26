# Phase 15 — Media Storage & Lifecycle Rules

## Upload Validation Rules
- **Supported Formats**: WebP (`image/webp`), JPEG (`image/jpeg`), PNG (`image/png`) verified by magic-byte header inspection (`detectImageMimeType`), never by file extension or client MIME type.
- **Max Size**: `5 MB` (`5 * 1024 * 1024` bytes), non-empty.
- **Rate Limiting**: `/api/admin/catalogue/upload` enforces 30 uploads per 10 minutes per admin (`checkRateLimit`).

## Failure-Safe Replacement Sequence
1. Validate RBAC (`products.update`) and product ownership (`ProductImage.productId`).
2. Validate and upload the new image to the active `MediaStorageProvider`.
3. Persist the new `url`, `provider`, and `publicId` in PostgreSQL (`ProductImage`).
4. If DB persistence fails, delete the newly uploaded orphaned asset and preserve the old DB record.
5. Only after DB commit succeeds, delete the old remote asset if `prisma.productImage.count` confirms no other record references it.

## Safe Deletion Rules
- Verify RBAC (`products.update`) and `ProductImage.productId` ownership.
- Delete the `ProductImage` row and reindex `sortOrder` inside a PostgreSQL transaction.
- Delete the remote asset only when `cleanupUnreferencedMediaAsset` confirms zero remaining references.
- Historical `OrderItem` snapshots are never modified.
- Static assets in `public/images/site/` and `public/images/categories/` remain untouched.
