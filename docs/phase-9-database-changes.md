# Phase 9 — Database Changes

## Migration: `0005_phase9_admin_catalogue`

Applied additively via `npm run db:deploy` without resetting or dropping any tables.

### 1. `ProductStatus` Enum
Added `ProductStatus` enum (`DRAFT`, `PUBLISHED`, `ARCHIVED`).

### 2. `Product` Extensions
- Added `status ProductStatus @default(PUBLISHED)` and `@@index([status])`.
- All 12 existing seeded products defaulted to `PUBLISHED` (`isActive = true`).
- `Product.isActive` is synchronized on every create/update/status change (`status === "PUBLISHED"`), ensuring all Phase 1–8 storefront, cart, and checkout queries (`isActive: true`) automatically exclude `DRAFT` and `ARCHIVED` products.

### 3. `Brand` Extensions
- Added `description String?`, `logoUrl String?`, `isActive Boolean @default(true)`, and `@@index([isActive])`.

### 4. `Category` Extensions
- Added `parentId String?`, self-referencing relation `parent` / `children` (`onDelete: SetNull`), `isActive Boolean @default(true)`, `@@index([parentId])`, and `@@index([isActive])`.
