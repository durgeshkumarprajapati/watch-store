# WatchStore — Complete Application Performance Audit (Read-Only)

**Audit Date:** 2026-11-26  
**Branch:** `development`  
**Scope:** Strictly read-only performance investigation across environment, frontend, Next.js rendering, Prisma/PostgreSQL queries, Supabase network latency, images/fonts, and backend APIs.

---

## 1. Executive Summary & Overall Assessment

WatchStore's primary performance bottleneck is **not** PostgreSQL query execution speed (`0.023–0.083 ms` inside PostgreSQL) or CPU rendering — it is **cross-region network round-trip latency (`India ↔ Sydney ap-southeast-2`) amplified by Supabase's port `6543` transaction pooler overhead (`1,912 ms` average per `SELECT 1` vs `380 ms` on port `5432`)**, combined with **un-deduplicated/sequential Prisma queries per page** (e.g., `/product/[slug]` querying `getBySlug` twice for a `10.5s` warm TTFB) and **large unmigrated local WebP images (`0.85–1.4 MB` each)**.

---

## 2. Environment Details (Phase 1)

- **Execution Mode Measured:** Local Next.js `16.4.6` (Turbopack) dev server (`http://127.0.0.1:3000`) connected to remote Supabase PostgreSQL (`oovkkzetdjiphjumponn`, PostgreSQL `17.6`, region `ap-southeast-2` Sydney). *(Deployed Vercel Preview performance was not measured directly here; deploying Vercel Functions in `syd1` or `sin1` will materially change DB RTT compared to local India → Sydney.)*
- **Database Connection:**
  - `DATABASE_URL`: Supabase Transaction Pooler (`:6543?pgbouncer=true`, no `connection_limit` set).
  - `DIRECT_URL`: Supabase Session Pooler (`:5432`).
- **Media Storage:** `ProductImage` rows (`12`) in Supabase still reference `/images/products/...` local static files (`24 MB` total in `public/images`); Cloudinary is configured in `.env` and enforced in `NODE_ENV=production`, but the 12-image migration has not been executed on the DB.
- **Caching:** Public storefront pages currently have **no** data cache (`revalidate` / `unstable_cache`), and `StoreLayout` reads cookies (`getCartCount`, `getAuthenticatedCustomer`), forcing dynamic rendering on every request.

---

## 3. Measured Performance Results (Phases 5 & 8)

### A. Database Latency Benchmark (Local India → DB)

| Target | Cold 1st Query | Warm `SELECT 1` Avg | `product.findMany` (12 rows + 4 relations) | PostgreSQL `EXPLAIN ANALYZE` Execution Time |
| :--- | ---: | ---: | ---: | ---: |
| **Local `watchstore_db`** | `130 ms` | `0 ms` | `8 ms` | `0.023 ms` |
| **Supabase Session Pooler (`:5432`)** | `3,230 ms` | `380 ms` | `3,817 ms` | `0.083 ms` |
| **Supabase Transaction Pooler (`:6543`)** | `4,302 ms` | **`1,912 ms`** | **`4,986 ms`** | `0.050 ms` |

> **Key Insight:** PostgreSQL executes the `Product` query in **`0.050 ms`**. Over 99.9% of the `4,986 ms` latency is network RTT (`India ↔ Sydney`) plus Supavisor `:6543` per-query overhead (`1,912 ms` vs `380 ms` on `:5432`).

### B. HTTP Response Times (`http://127.0.0.1:3000`, Next.js Dev Server → Supabase `:6543`)

| Route | Status | Cold (ms) | Warm (ms) | Response Size (Bytes) |
| :--- | ---: | ---: | ---: | ---: |
| `/api/health` | `200` | `2,585` | `1,934` | `54` |
| `/` (Homepage) | `200` | `5,729` | `5,326` | `127,973` |
| `/products` (Catalogue) | `200` | `5,669` | `5,177` | `121,474` |
| `/product/tempora-heritage-chronograph-40mm` | `200` | `10,666` | **`10,518`** | `94,512` |
| `/cart` (empty cookie) | `200` | `168` | `48` | `15,944` |
| `/checkout` (empty cookie) | `200` | `147` | `39` | `16,066` |
| `/login` | `200` | `148` | `47` | `21,178` |
| `/admin/login` | `200` | `126` | `51` | `21,890` |

- **Browser Core Web Vitals (LCP, INP, CLS):** **NOT TESTED** (no real-browser Lighthouse/DevTools run executed in this audit).
- **Production JS Chunks (`.next-build/static/chunks/`):** `1.2 MB` total across chunks (largest chunk `224 KB`).

---

## 4. Prioritized Findings & Root Cause Classification

### CRITICAL

1. **Cross-Region DB RTT (`India ↔ Sydney`) + `:6543` Pooler Per-Query Overhead**
   - **Affected:** All DB-backed pages, APIs, and interactive transactions (`checkout`, `admin/orders`, `/api/health`).
   - **Root Cause:** Supabase project `oovkkzetdjiphjumponn` is in `ap-southeast-2` (Sydney), and `:6543?pgbouncer=true` exhibits `1,912 ms` per `SELECT 1` from India (`380 ms` on `:5432`).
   - **Impact:** `1.9s` minimum per sequential query; `9–15s` for multi-query interactive transactions.
   - **Recommended Fix:** Deploy Vercel Functions in `syd1` (co-located with `oovkkzetdjiphjumponn`) or `sin1`, **or** migrate Supabase region to `ap-south-1` (Mumbai) for Indian traffic; configure `connection_limit=5&pool_timeout=20` on `DATABASE_URL`.
   - **Risk / Migration / Config:** Low risk; `0` DB migrations; requires Vercel region or Supabase project/env config change.

### HIGH

2. **Duplicate `getBySlug()` Query on Product Detail Page (`10.5s` Warm TTFB)**
   - **Affected:** `src/app/(store)/product/[slug]/page.tsx` (`generateMetadata` line 28 + `ProductDetailsPage` line 45).
   - **Root Cause:** `getBySlug(slug)` is called twice per page request without `React.cache()`, doubling DB latency (`~5s × 2 = 10.5s`).
   - **Recommended Fix:** Wrap `getBySlug` in `React.cache()` (per-request memoization, zero stale data risk).
   - **Risk / Migration / Config:** Very low risk; `0` migrations; `0` config changes.

3. **Repeated Auth/RBAC DB Queries on Authenticated Requests**
   - **Affected:** `src/modules/auth/auth.ts` (`jwt` callback lines 117-125), `src/modules/auth/session-service.ts`, `src/modules/admin/admin-auth-service.ts` (`getAuthenticatedAdmin`).
   - **Root Cause:** Every `auth()` call for a signed-in user executes `prisma.user.findUnique()`, followed by `customer.findUnique()` (customer) or `adminUser.findUnique` with a 4-level nested `include` (admin) without `React.cache()` per request.
   - **Recommended Fix:** Memoize `getAuthenticatedCustomer()` and `getAuthenticatedAdmin()` with `React.cache()` within the same request; consider caching role-permission sets briefly or optimizing the query shape.
   - **Risk / Migration / Config:** Low risk (preserve `sessionVersion` & `isActive` checks); `0` migrations; `0` config changes.

4. **Large Unmigrated Product WebP Assets (`0.85–1.4 MB` per image)**
   - **Affected:** `public/images/products/*/*.webp` (`24 MB` total in `public/images`), `ProductImage` table (`12` local paths).
   - **Root Cause:** Seeded WebPs are ~1 MB each and `ProductImage` rows have not been migrated to Cloudinary CDN (`f_auto,q_auto` responsive transforms).
   - **Recommended Fix:** Run `scripts/migrate-product-media.ts --execute` to move the 12 images to Cloudinary CDN and/or re-encode local WebPs to `<150 KB` (`800–1200px` max width).
   - **Risk / Migration / Config:** Low risk; `0` schema migrations; updates `ProductImage.url` data.

### MEDIUM

5. **No Request-Safe Caching for Public Catalogue & Category Reads**
   - **Affected:** `StoreLayout`, `HomePage` (`/`), `CataloguePage` (`/products`).
   - **Root Cause:** `StoreLayout` awaits `getCartCount()` and `getAuthenticatedCustomer()` (cookie reads) at the top of `(store)`, and catalogue queries hit Supabase live on every request (`5.2–5.3s` warm TTFB).
   - **Recommended Fix:** Cache non-sensitive catalogue metadata (`Brand`, `Category`, static product fields) via `unstable_cache` with `revalidateTag` on admin catalogue mutations, while keeping `ProductStock` / `Order` / `Customer` dynamic and uncached.
   - **Risk / Migration / Config:** Medium (must never cache stock availability or customer-specific state); `0` migrations.

6. **In-Memory Catalogue Filtering & Related-Product Full-Table Fetch**
   - **Affected:** `src/modules/catalogue/prisma/prisma-product-repository.ts` (`listProducts`, `listRelated`).
   - **Root Cause:** Fetches all active products + 4 relations into Node.js memory to filter/sort/paginate and score related items.
   - **Recommended Fix:** Push `where`, `orderBy`, `skip`, `take`, and faceted `groupBy` counts into Prisma/PostgreSQL queries as catalogue size grows.
   - **Risk / Migration / Config:** Low–Medium; `0` migrations.

7. **Dual Mobile/Desktop DOM Rendering & Full Variable Font Imports**
   - **Affected:** `src/app/(store)/page.tsx:89-98` (mounts both `ProductRowCard` and `ProductCard`), `src/app/layout.tsx:4-6` (3 `@fontsource-variable` CSS imports + `material-symbols`).
   - **Recommended Fix:** Subset/optimize font weights and avoid mounting duplicate hidden card grids where possible.
   - **Risk / Migration / Config:** Low; `0` migrations.

### LOW

8. **Backend Async & Webhook Hygiene (`PASS` — No Blocking Bottlenecks Found)**
   - Admin order transitions enqueue notifications into `Notification` + `NotificationJob` inside the DB transaction and **do not** synchronously wait for Resend email delivery.
   - Shiprocket, Razorpay, and Google Sheets external API calls are isolated to their respective admin/webhook/cron routes.
   - `admin-product-form.tsx:821` uses raw `<img>` instead of `next/image` (admin-only, low impact).

---

## 5. Suggested Implementation Phases

1. **Phase 1 (Immediate, Zero-Risk Wins):** Deploy Vercel Functions in `syd1` (or move Supabase to `ap-south-1`), add `React.cache()` around `getBySlug`, `getAuthenticatedCustomer`, and `getAuthenticatedAdmin`, and tune `DATABASE_URL` pooler params.
2. **Phase 2 (Asset & Media Optimization):** Execute Cloudinary migration (`scripts/migrate-product-media.ts --execute`) and optimize oversized `public/images/` assets (`<150 KB` per image).
3. **Phase 3 (Query & Caching Refinement):** Push `listProducts` / `listRelated` filtering to SQL and add tag-invalidated caching for non-stock catalogue metadata.
