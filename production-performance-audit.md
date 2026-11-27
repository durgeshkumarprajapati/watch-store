# WatchStore — Production Performance Audit (Read-Only)

**Target URL:** `https://watch-store-red.vercel.app`  
**Hosting:** Vercel Hobby  
**Database:** Supabase PostgreSQL (`ap-south-1`, Mumbai)  
**Audit Mode:** Strictly Read-Only (zero source code, DB, env, or Vercel changes made)

---

## 1. Executive Summary

Although Supabase PostgreSQL was migrated from Sydney to Mumbai (`ap-south-1`), live production HTTP probes against `https://watch-store-red.vercel.app` confirm that **Vercel Serverless Functions are still executing in `iad1` (Washington D.C., US East)** — Vercel Hobby's default function region (`x-vercel-id: bom1::iad1::...`).

As a result, every dynamic SSR page and API call from India traverses:
`User (India) → Vercel Edge (bom1, Mumbai) → Vercel Function (iad1, US East) → Supabase Postgres (ap-south-1, Mumbai) → iad1 → bom1 → User`.

Because **every storefront page** (`/`, `/products`, `/product/[slug]`, `/about`, `/contact`, `/faq`) is forced into dynamic uncached SSR (`cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS`) by `cookies()`/`auth()` calls in `StoreLayout`, every single storefront navigation pays this cross-continental latency penalty (measured **2.95s–5.65s** total server response time, and **4.08s** on `/api/health`).

---

## 2. Vercel & Supabase Region Findings

- **Vercel Function Region (`CONFIRMED`):**
  - `vercel.json` specifies `crons` only and does **not** set `"regions": ["bom1"]`.
  - Live `curl` probes against `https://watch-store-red.vercel.app` returned `x-vercel-id: bom1::iad1::...` on all dynamic/API routes (`/`, `/products`, `/product/[slug]`, `/cart`, `/checkout`, `/login`, `/admin/login`, `/api/health`).
  - `bom1` is the Mumbai Edge PoP receiving the request; `iad1` is the US East region executing the Serverless Function.
- **Static Assets (`CONFIRMED`):**
  - Static files in `public/` (e.g. `/manifest.webmanifest`) are served directly from Vercel Edge (`x-vercel-id: bom1::...`, `x-vercel-cache: HIT`) in **64ms**.
- **Supabase Region (`CONFIRMED`):**
  - Active `DATABASE_URL` in `.env` uses `aws-1-ap-south-1.pooler.supabase.com:6543` (Supabase Mumbai).
- **Root Cause & Impact:**
  - Every SQL round-trip from `iad1` to `ap-south-1` adds ~200–250ms of network RTT (plus cold-start/TLS/PgBouncer overhead), turning a 3–5 query SSR page into a 3–5+ second response.
- **Recommended Solution:**
  - Set `"regions": ["bom1"]` in `vercel.json` (or in Vercel Project Settings → Functions → Function Region = Mumbai `bom1`, if available on your Vercel plan; note: Vercel Hobby supports selecting 1 function region in Project Settings → Functions).
  - **Risk:** Low (single region setting; verify whether Vercel Hobby allows `bom1` in `vercel.json` or Project Settings). **Priority:** **P0 (Critical)**.

---

## 3. Route-by-Route Live Production Measurements

Measured via `curl` from the workspace (`2026-11-27`):

| Route | HTTP | Vercel Cache | `x-vercel-id` | TTFB | Total Time | Download Size |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 200 | `MISS` | `bom1::iad1::n25hb-...` | `4.249s` | `4.446s` | `109,234 B` |
| `/products` | 200 | `MISS` | `bom1::iad1::lsns6-...` | `0.315s` | `2.945s` | `108,167 B` |
| `/product/tempora-heritage-chronograph-40mm` | 200 | `MISS` | `bom1::iad1::pjzb4-...` | `0.398s` | `5.646s` | `80,519 B` |
| `/cart` | 200 | `MISS` | `bom1::iad1::rcqt4-...` | `0.348s` | `0.348s` | `12,220 B` |
| `/checkout` | 200 | `MISS` | `bom1::iad1::kg25w-...` | `0.383s` | `0.383s` | `12,113 B` |
| `/login` | 200 | `MISS` | `bom1::iad1::j8xjq-...` | `0.332s` | `0.332s` | `17,182 B` |
| `/admin/login` | 200 | `MISS` | `bom1::iad1::rx7h4-...` | `0.349s` | `0.357s` | `17,538 B` |
| `/api/health` | 200 | `MISS` | `bom1::iad1::nxjl5-...` | `4.082s` | `4.082s` | `54 B` |
| `/images/site/site_hero.webp` | 200 | `MISS` | `bom1::cw67l-...` | `0.795s` | `0.852s` | `1,381,520 B` |
| `/manifest.webmanifest` | 200 | `HIT` | `bom1::j8xjq-...` | `0.064s` | `0.064s` | `880 B` |

**Browser Core Web Vitals (`LCP`, `INP`, `CLS`, Desktop & Mobile JS/Image Transfer):** **NOT TESTED** — No interactive browser or Lighthouse session was run in this CLI audit.

---

## 4. Database Bottlenecks

1. **Duplicate `getBySlug()` + Full-Table `listRelated()` on Product Detail (`CONFIRMED`):**
   - **Evidence:** `src/app/(store)/product/[slug]/page.tsx` calls `getProductRepository().getBySlug(slug)` in `generateMetadata` (line 28) and again in `ProductDetailsPage` (line 45) without `React.cache()`. It then calls `repo.listRelated(product, 4)` (`src/modules/catalogue/prisma/prisma-product-repository.ts:232-250`), which queries **all** active products with `brand`, `categories`, `images`, and `stock`.
   - **Impact:** 2 duplicate slug queries + full-catalogue query on every product detail view (`5.646s` total on live `/product/...`).
   - **Solution:** Wrap `getBySlug` in `React.cache()`, and filter `listRelated` in SQL (`take` / category-or-brand match) or cache catalogue data with `unstable_cache`. **Risk:** Low. **Priority:** **P1**.
2. **In-Memory Filtering/Pagination in `listProducts()` (`CONFIRMED`):**
   - **Evidence:** `src/modules/catalogue/prisma/prisma-product-repository.ts:146-230` fetches all active products (`productInclude`: `brand`, `categories`, `images`, `stock`), all categories, and all brands, then filters and paginates in JS.
   - **Impact:** Acceptable at current small catalogue size, but transfers unnecessary rows/relations from `ap-south-1` on every `/products` load (`2.945s` total).
   - **Solution:** Cache public catalogue queries (`unstable_cache` with tag invalidation on admin product/inventory updates). **Risk:** Medium (requires cache revalidation on stock/price edits). **Priority:** **P1**.
3. **Every Page Runs `getAuthenticatedCustomer()` & `getCartCount()` (`CONFIRMED`):**
   - **Evidence:** `src/app/(store)/layout.tsx:7` executes `Promise.all([getCartCount(), getAuthenticatedCustomer()])` on every storefront route.
   - **Impact:** Adds an auth/DB check to every storefront navigation and disables static/ISR caching across the whole storefront.
   - **Solution:** Keep public pages cacheable where safe, or move user-specific header badges (cart count, signed-in state, notification bell) to a lightweight client hydration/edge check after initial shell render. **Risk:** Medium (must preserve SSR accuracy for cart/auth). **Priority:** **P1**.
4. **Sequential DB Connection Cold Start (`SUSPECTED`):**
   - **Evidence:** `/api/health` (`SELECT 1` only) took `4.082s` on first hit from `iad1`.
   - **Impact:** Cold serverless function + TLS handshake from `iad1` to Supabase `ap-south-1` PgBouncer adds ~3.5–4s on cold invocations.
   - **Solution:** Move Vercel function region to `bom1` (Mumbai) to cut RTT ~10x. **Priority:** **P0**.

---

## 5. Image Optimization Findings

- **Inventory (`CONFIRMED`):** `25` image files under `public/` totaling **23.96 MB** (`24,532.9 KB`).
- **Largest 20 Images (`CONFIRMED`):**
  1. `public/images/categories/category_womens_atelier.webp` — `2,037.2 KB` (`1200x1500`)
  2. `public/images/categories/category_automatic_divers.webp` — `1,804.8 KB` (`1200x1500`)
  3. `public/images/products/chronographs/chronograph_vrn_chr_402_1.webp` — `1,401.8 KB` (`1200x1500`)
  4. `public/images/site/site_lifestyle_2.webp` — `1,389.5 KB` (`1200x900`)
  5. `public/images/site/site_hero.webp` — `1,349.1 KB` (`1600x900`)
  6. `public/images/categories/category_chronographs.webp` — `1,318.5 KB` (`1200x1500`)
  7. `public/images/site/site_heritage.webp` — `1,311.5 KB` (`1200x900`)
  8. `public/images/products/automatic-divers/automatic_diver_vrm_div_206_1.webp` — `1,290.2 KB` (`1200x1500`)
  9. `public/images/site/site_lifestyle_1.webp` — `1,249.7 KB` (`1200x900`)
  10. `public/images/categories/category_minimal_dress.webp` — `1,245.9 KB` (`1200x1500`)
  11. `public/images/products/chronographs/chronograph_vrn_gmt_510_1.webp` — `1,155.3 KB` (`1200x1500`)
  12. `public/images/products/womens-atelier/women_s_atelier_vrf_fem_209_1.webp` — `1,152.6 KB` (`1200x1500`)
  13. `public/images/products/chronographs/chronograph_vrn_chr_431_1.webp` — `1,091.9 KB` (`1200x1500`)
  14. `public/images/products/womens-atelier/women_s_atelier_vrf_div_134_1.webp` — `1,033.6 KB` (`1200x1500`)
  15. `public/images/products/chronographs/chronograph_vrn_chr_417_1.webp` — `1,019.6 KB` (`1200x1500`)
  16. `public/images/products/minimal-dress/minimal_dress_orr_drs_094_1.webp` — `976.3 KB` (`1200x1500`)
  17. `public/images/products/automatic-divers/automatic_diver_vrm_div_300_1.webp` — `943.5 KB` (`1200x1500`)
  18. `public/images/products/minimal-dress/minimal_dress_orr_drs_136_1.webp` — `939.9 KB` (`1200x1500`)
  19. `public/images/products/minimal-dress/minimal_dress_orr_drs_118_1.webp` — `884.1 KB` (`1200x1500`)
  20. `public/images/products/womens-atelier/women_s_atelier_vrf_fem_128_1.webp` — `854.6 KB` (`1200x1500`)
- **`next/image` & `sizes` (`CONFIRMED`):**
  - `MediaImage` (`src/components/ui/media-image.tsx`), `HomeHero`, `ProductGallery`, `ProductCard`, `CartView`, and `CheckoutView` all use `next/image` with `fill` and responsive `sizes`. `priority` is set only on `HomeHero` (`site_hero.webp`) and the primary `ProductGallery` image; below-the-fold images default to lazy loading.
  - However, source WebP files at 1–2 MB each increase `/_next/image` optimization work on cold cache misses (`site_hero.webp` direct fetch took `852ms` on `MISS`).
- **Recommended Solution:** Re-compress `public/images/**/*.webp` (quality 78–82, max width 1200px / hero 1600px) to reduce source sizes by ~70–80%. **Risk:** Low. **Priority:** **P2**.

---

## 6. Next.js Rendering & Client Findings

- **Dynamic Rendering Lock (`CONFIRMED`):** `StoreLayout` (`cookies()`/`auth()`) forces `cache-control: private, no-cache, no-store` on all storefront pages, preventing Vercel Edge HTML/ISR caching (`x-vercel-cache: MISS` on `/`, `/products`, `/product/[slug]`).
- **Streaming Body Stall (`CONFIRMED`):** `/products` (`ttfb=0.315s`, `total=2.945s`) and `/product/...` (`ttfb=0.398s`, `total=5.646s`) send the initial shell quickly but block for 2.6s–5.2s waiting on `iad1 → ap-south-1` Prisma queries.
- **Font Loading (`CONFIRMED`):** `src/app/layout.tsx` bundles self-hosted `@fontsource-variable/bodoni-moda`, `@fontsource-variable/raleway`, and `@fontsource-variable/jetbrains-mono` locally (no external Google Fonts network dependency).
- **Repeated Header Polling (`CONFIRMED`):** `NotificationBell` polls `/api/notifications/inbox` on mount and every 30s for signed-in users (zero impact on anonymous visitors).

---

## 7. External Services Audit

- **CONFIRMED:** Storefront pages (`/`, `/products`, `/product/[slug]`, `/cart`, `/checkout`, `/login`) make **zero** synchronous calls to Razorpay, Shiprocket, Resend, Google Sheets, or Cloudinary during page render.
- External APIs are only called during explicit mutations (Razorpay order/verify, Shiprocket shipment creation, Resend email worker, Cloudinary admin upload, Google Sheets admin sync).

---

## 8. Prioritized Recommendations

1. **P0 — Align Vercel Function Region to Mumbai (`bom1`):** Set Vercel Function Region to `bom1` (Mumbai) in Vercel Project Settings → Functions (and/or `vercel.json` `"regions": ["bom1"]`) so serverless functions run in the same region as Supabase `ap-south-1`.
2. **P1 — Deduplicate `getBySlug` & Optimize `listRelated`:** Wrap `getBySlug` in `React.cache()` and replace full-table `listRelated` scan with a targeted Prisma query (`take: 4` matching category/brand).
3. **P1 — Add Short-Lived ISR / `unstable_cache` for Public Catalogue Reads:** Cache `listCategories`, `listBestSellers`, and `listProducts` with tag-based revalidation on admin catalogue/stock mutations.
4. **P2 — Re-compress `public/images/**/*.webp`:** Reduce 1–2 MB source WebPs to ~150–300 KB to speed up `/_next/image` cold misses and LCP.
5. **P2 — Run Live Browser Lighthouse / Web Vitals Audit:** Measure real `LCP`, `INP`, `CLS`, and JS/image transfer sizes in Chrome DevTools after moving functions to `bom1`.
