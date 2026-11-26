# Phase 15 — Media Security Controls

1. **Server-Only Credentials**: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are read strictly on the server via `src/config/env.ts` / `cloudinary-media-storage.ts` and are never exposed to client components, API responses, or logs.
2. **Signed Operations Only**: Uploads and deletions use server-generated SHA-1 signatures (`signCloudinaryParams`) with timestamps. Unsigned presets are never used.
3. **Fail-Closed Production Guard**: In `NODE_ENV === "production"`, missing Cloudinary credentials throw `CloudinaryConfigurationError` rather than falling back to local disk.
4. **Magic-Byte & Size Validation**: Every uploaded buffer is inspected for PNG, JPEG, or WebP magic bytes and capped at `5 MB`.
5. **Path & Public ID Sanitization**: Folders are restricted to `^watchstore(?:\/[a-zA-Z0-9_-]+)*$` and deletion IDs to `^watchstore\/[a-zA-Z0-9/_-]+$`. Client-provided public IDs or arbitrary remote URLs are never trusted for deletion.
6. **RBAC, Ownership & Rate Limiting**: Upload endpoint and image service functions enforce admin authentication, `products.create` / `products.update` / `brands.manage` / `categories.manage` permissions, `ProductImage.productId` ownership checks, and per-admin rate limiting (`30` uploads / 10 min).
7. **Sanitized Errors**: Provider HTTP errors return generic messages so API secrets or internal responses never leak.
