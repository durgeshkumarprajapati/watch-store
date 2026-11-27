# WatchStore — Advanced Performance & User Experience Audit Report

**Repository:** `/home/ppsd-021/watch-store`  
**Branch:** `development`  
**Audit Mode:** Strictly Read-Only (zero code, schema, env, or deployment changes)

---

## Executive Summary

Previous optimization work (`bom1` Vercel region, public catalogue `unstable_cache`, `React.cache` on `getBySlug`/`getAuthenticatedCustomer`, bounded `listRelated`, WebP compression from `23.88 MB → 1.29 MB`, streamed `StoreHeader`, route `loading.tsx` skeletons, and customer PWA) addressed the primary structural bottlenecks.

This deeper audit identifies **9 remaining high-leverage opportunities** across error recovery, checkout friction, catalogue SQL scaling, client hydration, background polling, and Web Vitals observability — all achievable **without** altering business rules, payment/inventory calculations, or security controls.

---

## Findings

### Finding 1 — Missing App Router Error Boundaries (`error.tsx` / `global-error.tsx`)
- **Classification:** `CONFIRMED`
- **Area & Affected Files:** Reliability & Customer Experience — `src/app/` (no `error.tsx` or `global-error.tsx` exists; only `src/app/(store)/product/[slug]/not-found.tsx` is present).
- **Current Implementation:** Unhandled runtime or transient database errors bubble up to Next.js's default unbranded error screen.
- **Identified Problem:** Customers encountering a transient network/DB error see a generic 500 error with no WatchStore branding, no "Try Again" (`reset()`) action, and no navigation back to `/`.
- **Evidence:** `find src/app -name "*error.tsx"` returned 0 files.
- **Expected User Benefit:** Graceful branded recovery with one-click retry (`reset()`) and homepage fallback on both storefront and admin routes.
- **Priority:** `P1`
- **Estimated Implementation Complexity:** Low
- **Potential Regression Risks:** Very low (purely additive fallback UI).
- **Recommended Solution:** Add `src/app/(store)/error.tsx`, `src/app/admin/(protected)/error.tsx`, and `src/app/global-error.tsx` matching WatchStore light/dark tokens.
- **Verification Method:** `npm run typecheck`, `npm run lint`, `npm run qa:build`, plus simulated error boundary render test.

---

### Finding 2 — Full-Catalogue Fetch & Excess Column Selection in `listProducts()`
- **Classification:** `CONFIRMED`
- **Area & Affected Files:** Database Performance — `src/modules/catalogue/prisma/prisma-product-repository.ts` (`listProducts`, `productInclude`).
- **Current Implementation:** On cache miss, `listProducts()` fetches all active `Product` rows with `brand`, `categories`, `images`, `stock`, plus full `description` and `spec*` columns, along with all categories and brands, then filters/sorts/paginates in JavaScript.
- **Identified Problem:** Transfers unused text columns (`description`, `specMovement`, `specCaseDimensions`, etc.) and all rows on every uncached filter combination. Will degrade linearly as SKU count grows.
- **Evidence:** `prisma-product-repository.ts:146-230` (`prisma.product.findMany` without `where` filters for `query` or `select` projection).
- **Expected User Benefit:** Faster cache-miss `/products` queries and lower memory/JSON overhead.
- **Priority:** `P1`
- **Estimated Implementation Complexity:** Medium
- **Potential Regression Risks:** Medium — facet counts and sorting (`popularity`, `price-asc`, `price-desc`, `newest`) must match `catalogue-query.test.ts` (`20/20`) identically.
- **Recommended Solution:** First introduce a summary `select` projection (omitting `description`/`spec*` for `listProducts`/`listBestSellers`/`listRelated`), and optionally push non-facet filters/pagination to SQL while preserving exact facet counts.
- **Verification Method:** Existing `catalogue-query.test.ts`, `catalogue.test.ts`, and `phase-9-catalogue.test.ts` parity tests.

---

### Finding 3 — Checkout Does Not Pre-Fill Signed-In Customer Profile & Default Address
- **Classification:** `CONFIRMED`
- **Area & Affected Files:** Customer Experience — `src/app/checkout/page.tsx`, `src/components/store/checkout/checkout-view.tsx`.
- **Current Implementation:** `CheckoutView` initializes `fullName`, `email`, `phone`, `addressLine1`, `city`, `stateName`, and `pinCode` as `""` even when the customer is signed in and has saved addresses.
- **Identified Problem:** Returning signed-in customers must re-type their name, email, phone, and delivery address manually on every order.
- **Evidence:** `src/components/store/checkout/checkout-view.tsx:64-71` (`useState("")` with no `initialCustomer` / `initialAddress` props).
- **Expected User Benefit:** Faster checkout completion and fewer mobile typing errors for logged-in collectors.
- **Priority:** `P1`
- **Estimated Implementation Complexity:** Low
- **Potential Regression Risks:** Low — pre-filling form state only; server-side `submitCheckoutAction` validation and authoritative totals remain untouched.
- **Recommended Solution:** Pass optional `initialProfile` and `defaultAddress` from `src/app/checkout/page.tsx` (when `getAuthenticatedCustomer()` is non-null) to pre-populate `CheckoutView` state.
- **Verification Method:** `npm run typecheck`, `cart-and-checkout.test.ts`, and manual/E2E checkout verification for both guest and signed-in users.

---

### Finding 4 — Razorpay Script Loaded Lazily Only on Order Submit Click
- **Classification:** `CONFIRMED`
- **Area & Affected Files:** Customer Experience (Payment Latency) — `src/components/store/checkout/checkout-view.tsx:45-56`.
- **Current Implementation:** `loadRazorpayScript()` appends `https://checkout.razorpay.com/v1/checkout.js` only after `submitCheckoutAction` and `initiatePaymentAction` succeed.
- **Identified Problem:** Adds an extra sequential external script download + parse delay right after the user clicks "Place Order", making Razorpay modal opening feel sluggish on mobile networks.
- **Evidence:** `checkout-view.tsx:45-56` and `handleSubmit` flow.
- **Expected User Benefit:** Faster Razorpay modal open after clicking Place Order.
- **Priority:** `P2`
- **Estimated Implementation Complexity:** Low
- **Potential Regression Risks:** Very low — preloading `checkout.js` via `useEffect` when `paymentMethod === "razorpay"` does not alter payment initiation or signature verification.
- **Recommended Solution:** Trigger `void loadRazorpayScript()` inside a `useEffect` when `paymentMethod === "razorpay"` on `/checkout`.
- **Verification Method:** `npm run typecheck`, `npm run lint`, and Razorpay test checkout flow.

---

### Finding 5 — `MediaImage` Forces Client Hydration on Every Product & Category Card
- **Classification:** `CONFIRMED`
- **Area & Affected Files:** Frontend Bundle & Hydration — `src/components/ui/media-image.tsx:1-45`, `src/components/store/product-card.tsx`, `src/components/store/category-card.tsx`.
- **Current Implementation:** `MediaImage` is a `"use client"` component solely to hold `useState(false)` for `onError` fallback.
- **Identified Problem:** Every product card and category card on `/` and `/products` hydrates a client wrapper around `next/image`, increasing hydration work on mobile devices.
- **Evidence:** `src/components/ui/media-image.tsx:1` (`"use client"`) + `useState`.
- **Expected User Benefit:** Lower hydration overhead and faster INP on `/` and `/products`.
- **Priority:** `P2`
- **Estimated Implementation Complexity:** Low
- **Potential Regression Risks:** Low — must preserve fallback placeholder UI if an image URL fails to load.
- **Recommended Solution:** Keep `MediaImage` for dynamic/external/unverified images, or render `next/image` directly in Server Components when `src` is a verified local `/images/...` asset with a CSS background fallback (`bg-surface-container`).
- **Verification Method:** `npm run typecheck`, `npm run qa:build`, and visual check of missing-image fallback.

---

### Finding 6 — Cart Quantity Updates Wait for Full Server Round-Trip Without Optimistic State
- **Classification:** `CONFIRMED`
- **Area & Affected Files:** Customer Experience — `src/components/store/cart/cart-view.tsx:18-46`.
- **Current Implementation:** `handleQtyChange` and `handleRemove` call `startTransition(async () => { await updateCartQuantityAction(...) })` and wait for `revalidatePath("/cart")` before the displayed item quantity updates.
- **Identified Problem:** On slower mobile connections, tapping `+` or `-` in the cart feels unresponsive until the server action completes.
- **Evidence:** `src/components/store/cart/cart-view.tsx:24-38`.
- **Expected User Benefit:** Immediate visual quantity feedback while keeping server-authoritative stock/price validation.
- **Priority:** `P2`
- **Estimated Implementation Complexity:** Low–Medium
- **Potential Regression Risks:** Low — `useOptimistic` automatically reverts if the server action returns `{ ok: false, error }` (e.g. insufficient stock).
- **Recommended Solution:** Add `useOptimistic` for line quantities in `CartView`, while keeping `summary` from the server authoritative for totals and stock errors.
- **Verification Method:** `cart-and-newsletter.test.ts`, `cart-and-checkout.test.ts`, and interactive cart +/- testing.

---

### Finding 7 — `NotificationBell` Polls `/api/notifications/inbox` When Browser Tab Is Hidden
- **Classification:** `CONFIRMED`
- **Area & Affected Files:** Network & Server Load — `src/components/notifications/notification-bell.tsx:41-66`.
- **Current Implementation:** `window.setInterval(() => void load(), 30_000)` polls `/api/notifications/inbox` every 30s unconditionally for signed-in customers and admins.
- **Identified Problem:** Background/inactive browser tabs continue firing authenticated DB-backed `/api/notifications/inbox` requests every 30s, consuming serverless invocations on Vercel Hobby and Supabase connections.
- **Evidence:** `src/components/notifications/notification-bell.tsx:57-59` (no `document.visibilityState === "visible"` check).
- **Expected User Benefit:** Reduced idle serverless/DB load and better battery life on mobile PWAs.
- **Priority:** `P2`
- **Estimated Implementation Complexity:** Low
- **Potential Regression Risks:** Very low — refresh immediately on `visibilitychange` when returning to the tab.
- **Recommended Solution:** Skip interval fetches when `document.visibilityState !== "visible"`, and trigger `void load()` on `visibilitychange` when the tab becomes visible.
- **Verification Method:** `npm run typecheck`, `npm run lint`, and manual tab-switch verification.

---

### Finding 8 — No Web Vitals / Real-User Performance Monitoring (RUM) or Slow-Query Logging
- **Classification:** `CONFIRMED`
- **Area & Affected Files:** Performance Monitoring — `package.json`, `src/app/layout.tsx`, `src/lib/prisma.ts`.
- **Current Implementation:** No `useReportWebVitals`, `@vercel/speed-insights`, or Prisma query-duration warning logs exist.
- **Identified Problem:** Without RUM or slow-query logging, regressions in `LCP`, `INP`, `CLS`, or `TTFB` cannot be detected proactively across real customer devices.
- **Evidence:** `grep` across `src/` and `package.json` returned `NO_WEB_VITALS_MONITORING`.
- **Expected User Benefit:** Actionable production telemetry on `LCP`, `INP`, `CLS`, and slow DB queries.
- **Priority:** `P2`
- **Estimated Implementation Complexity:** Low
- **Potential Regression Risks:** Very low (read-only telemetry).
- **Recommended Solution:** Add lightweight Next.js `useReportWebVitals` reporter (or `@vercel/speed-insights` if desired on Vercel) and optional Prisma `$on("query")` / timing wrapper logging queries exceeding `> 250ms` (without logging PII or SQL parameters).
- **Verification Method:** `npm run typecheck`, `npm run lint`, and console/telemetry verification.

---

### Finding 9 — Live Browser Web Vitals & Mobile Touch Audit on `bom1` Preview
- **Classification:** `NOT TESTED`
- **Area & Affected Files:** Live Preview (`https://watch-store-git-development-durgeshs-projects-2a547312.vercel.app`) across `360x800`, `390x844`, `768x1024`, `1280x800`, `1440x900`.
- **Current Implementation:** Preview deployment is gated by Vercel Authentication SSO (`HTTP/2 302` → `vercel.com/sso-api`).
- **Identified Problem:** Real-browser `LCP`, `INP`, `CLS`, `TTFB`, touch-target ergonomics, and font-render timing (`FOUT`/`FOIT`) cannot be measured until bypass token or authenticated browser access is available.
- **Priority:** `P1` (verification)
- **Recommended Solution:** Run Lighthouse / Playwright Web Vitals pass once Preview bypass secret is provided.

---

## Summary Table

| # | Area | Priority | Complexity | Status |
| --- | --- | --- | --- | --- |
| 1 | App Router Error Boundaries (`error.tsx`, `global-error.tsx`) | P1 | Low | `CONFIRMED` |
| 2 | `listProducts()` Summary Projection & SQL Filtering | P1 | Medium | `CONFIRMED` |
| 3 | Pre-fill Signed-In Customer Profile & Address in Checkout | P1 | Low | `CONFIRMED` |
| 4 | Preload Razorpay `checkout.js` on Checkout Page | P2 | Low | `CONFIRMED` |
| 5 | Reduce `MediaImage` Client Hydration on Cards | P2 | Low | `CONFIRMED` |
| 6 | Optimistic Quantity Controls in `CartView` | P2 | Low–Medium | `CONFIRMED` |
| 7 | Pause `NotificationBell` Polling When Tab Hidden | P2 | Low | `CONFIRMED` |
| 8 | Web Vitals (`useReportWebVitals`) & Slow-Query Monitoring | P2 | Low | `CONFIRMED` |
| 9 | Live Preview `bom1` Web Vitals & Mobile Touch QA | P1 | Low | `NOT TESTED` |
