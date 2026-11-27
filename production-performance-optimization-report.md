# WatchStore — Production Performance Optimization Report

**Branch:** `development`  
**Target Production URL:** `https://watch-store-red.vercel.app` (not auto-deployed)

---

## 1. Original Bottlenecks (from `production-performance-audit.md`)

1. **Vercel Function Region Mismatch (`P0`):** Live `x-vercel-id` headers showed `bom1::iad1::...` (Edge in Mumbai, Functions executing in US East `iad1`, Supabase DB in Mumbai `ap-south-1`). Measured baseline: `/` TTFB `4.249s` (`4.446s` total), `/products` `2.945s`, `/product/tempora-heritage-chronograph-40mm` `5.646s`, `/api/health` `4.082s`.
2. **Duplicate & Unbounded Product Queries (`P1`):** `ProductDetailsPage` called `getBySlug(slug)` twice per request (`generateMetadata` + page component), and `listRelated()` loaded all active products with 4 relations before ranking 4 items in JS.
3. **Uncached Public Catalogue Reads (`P1`):** Every storefront page queried PostgreSQL live for categories, best sellers, and product listings.
4. **Blocking Storefront Layout (`P1`):** `StoreLayout` awaited `getCartCount()` and `getAuthenticatedCustomer()` before streaming page content.
5. **Large Source WebP Images (`P2`):** 20 WebP files under `public/images/` totaled `23.88 MB` (up to `2,037.2 KB` per image).
6. **Missing Route-Level Loading Skeletons (`Phase 6`):** Only `/products` and `/product/[slug]` had `loading.tsx` boundaries.

---

## 2. Changes Implemented

### Phase 1 — Vercel Function Region (`vercel.json`)
- Added `"regions": ["bom1"]` to `vercel.json` so Vercel Functions execute in Mumbai (`bom1`), co-located with Supabase `ap-south-1`.
- Preserved all 5 Hobby-compatible once-daily Cron entries (`01:00`–`05:00` UTC).

### Phase 2 & 3 — Database Query Optimization & Public Catalogue Caching
- **`src/app/(store)/product/[slug]/page.tsx`:** Wrapped `getProductRepository().getBySlug(slug)` in `React.cache()` (`getCachedProductBySlug`) so `generateMetadata` and `ProductDetailsPage` share a single request-scoped lookup.
- **`src/modules/catalogue/prisma/prisma-product-repository.ts`:**
  - Replaced `listRelated()` full-table scan with a targeted Prisma `OR` query (`categoryIds` or `brandId`, `take: Math.max(limit * 3, 12)`) plus a bounded fallback only when fewer than `limit` items match.
  - Added `withCatalogueCache` (`src/modules/catalogue/catalogue-cache.ts`, `unstable_cache` with `revalidate: 60` and tag `"catalogue"`, bypassed in `VITEST`/`test`) for public `listCategories`, `listBestSellers`, `listProducts`, `listRelated`, and `getBySlug`.
  - Authoritative checkout, cart, payment, and inventory reservation paths (`getByIds`, `reserveStockInTx`, `createPersistentOrder`) remain **uncached**.
- **Tag Invalidation (`revalidatePublicCatalogueCache()`):** Wired into:
  - `src/modules/admin/catalogue/catalogue-revalidation.ts` (product/brand/category/image/price mutations)
  - `src/modules/admin/inventory/inventory-actions.ts` (stock inward/outward/adjustments)
  - `src/modules/admin/orders/admin-order-actions.ts` (order transitions/cancellations)
  - `src/modules/checkout/actions.ts` (order placement stock reservation)
  - `src/modules/admin/catalogue-sync/sheets-sync-actions.ts` (Google Sheets import/sync)

### Phase 4 — Storefront Layout & Session Memoization
- **`src/modules/auth/session-service.ts`:** Wrapped `getAuthenticatedCustomer` in `React.cache()` to deduplicate session/customer lookups within the same RSC render pass.
- **`src/app/(store)/layout.tsx`:** Wrapped the personalized `StoreHeaderWithSession` (`getCartCount()` + `getAuthenticatedCustomer()`) in `<Suspense fallback={<StoreHeader cartCount={0} signedIn={false} />}>`, allowing main page content to stream without blocking on header session/cart queries while preserving server-authoritative cart counts and auth state.

### Phase 5 — WebP Image Optimization (`public/images/`)
- Compressed all 20 `.webp` assets under `public/images/` using `sharp` (`quality: 80`, `effort: 6`, max width `1600px` for `site_hero.webp` and `1200px` for product/category/site assets), preserving original filenames and paths:
  - **Before:** `23.88 MB` across 20 WebP files (`site_hero.webp`: `1,349.1 KB`, `category_womens_atelier.webp`: `2,037.2 KB`).
  - **After:** `1.29 MB` across 20 WebP files (**94.6% reduction**; `site_hero.webp`: `87.9 KB`, `category_womens_atelier.webp`: `109.2 KB`).

### Phase 6 — Instant Navigation & Loading UI
- Verified all internal navigation uses Next.js `<Link>` (no plain internal `<a href>` reloads) and `WishlistButton` uses `useOptimistic` + `useTransition`.
- Added consistent light/dark-compatible `loading.tsx` skeletons for:
  - `src/app/(store)/loading.tsx`
  - `src/app/(store)/account/loading.tsx`
  - `src/app/cart/loading.tsx`
  - `src/app/checkout/loading.tsx`
  - `src/app/admin/(protected)/loading.tsx`

### Phase 7 — PWA & Push Preservation
- `public/sw.js`, `public/manifest.webmanifest`, `src/app/offline/page.tsx`, `CustomerPwaManager`, and VAPID push services were not modified; all cache exclusions (`/admin/*`, `/api/*`, `/cart`, `/checkout`, `/account/*`, `_rsc`) remain intact.

---

## 3. Verification Results

| Check | Status | Details |
| --- | --- | --- |
| `npm run typecheck` | **PASS** | `tsc --noEmit` exited `0` |
| `npm run lint` | **PASS** | `eslint .` exited `0` (`0` errors, `0` warnings) |
| `npm run qa:build` | **PASS** | Next.js 16.4.6 Turbopack build exited `0` |
| `npx vitest run tests/unit/` | **PASS** | `21/21` test files, `134/134` tests passed (including `phase-19c-pwa.test.ts` `5/5` and `phase-19-push.test.ts` `4/4`) |
| Local `watchstore_db` integration tests | **PASS** | Verified against `localhost:5432/watchstore_db` |
| Deployed `bom1` region & Browser Web Vitals (`LCP`, `INP`, `CLS`, before/after TTFB) | **NOT TESTED** | Deployment to Vercel Preview/Production was not executed per no-auto-deploy restriction |

---

## 4. Remaining Limitations & Deployment Instructions

1. **Deployment Required for `bom1` & Live Web Vitals:** Merge/deploy `development` to Vercel Preview (or Production when approved), then verify `x-vercel-id` shows `bom1::bom1::...` (no `iad1`) and measure `curl` TTFB + Chrome Lighthouse `LCP`/`INP`/`CLS` across `/`, `/products`, `/product/[slug]`, `/cart`, `/checkout`, and `/admin/dashboard`.
2. **Vercel Hobby Plan Note:** Verify in Vercel Project Settings → Functions that `bom1` is active on your Hobby deployment.
3. **Hobby Cron Schedule:** `vercel.json` retains staggered once-daily UTC crons (`01:00`–`05:00` UTC) for Hobby compatibility.
