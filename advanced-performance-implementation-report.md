# WatchStore — Advanced Performance Implementation Report

**Branch:** `development`  
**Audit Reference:** `advanced-performance-ux-audit-report.md`  
**Mode:** Implemented in Groups A → B → C (no schema, migration, env, or Vercel config changes; not merged to `main`; not deployed)

---

## 1. Changes Implemented by Group

### Group A — Error Boundaries, Checkout Prefill, Razorpay Preload & Notification Bell
1. **Branded App Router Error Boundaries (`Finding 1`):**
   - Created `src/components/shared/error-fallback.tsx` (light/dark compatible, `reset()` retry, storefront/dashboard fallback, no stack traces or sensitive errors).
   - Added `src/app/(store)/error.tsx`, `src/app/admin/(protected)/error.tsx`, and `src/app/global-error.tsx`.
2. **Authenticated Customer Checkout Prefill (`Finding 3`):**
   - Updated `src/app/checkout/page.tsx` to fetch `getAuthenticatedCustomer()` and `listCustomerAddresses(customer.id)` (when signed in) and pass `prefill` (`fullName`, `email`, `phone`, plus `isDefault` or first saved address) to `CheckoutView`.
   - Updated `src/components/store/checkout/checkout-view.tsx` to initialize editable form fields from `prefill` while keeping guest checkout unchanged and server-side validation/totals authoritative.
3. **Razorpay `checkout.js` Preload (`Finding 4`):**
   - Updated `loadRazorpayScript()` in `src/components/store/checkout/checkout-view.tsx` to deduplicate `<script>` injection via a shared promise and preload `https://checkout.razorpay.com/v1/checkout.js` when `paymentMethod === "razorpay"` and checkout is available (without creating payments).
4. **NotificationBell Visibility-Aware Polling (`Finding 7`):**
   - Updated `src/components/notifications/notification-bell.tsx` with `inFlightRef` overlap guard, `document.visibilityState === "visible"` check on interval polls, and `visibilitychange` refresh on tab focus.

### Group B — Hydration Reduction, Optimistic Cart & Lightweight Monitoring
5. **Reduced `MediaImage` Client Hydration (`Finding 5`):**
   - Created Server Component `src/components/ui/static-media-image.tsx` for verified local `/images/...` assets (delegating missing or external URLs to `MediaImage` so `onError` fallback behavior is preserved).
   - Updated `src/components/store/product-card.tsx` and `src/components/store/category-card.tsx` to use `StaticMediaImage`.
6. **Optimistic Cart Quantity Updates (`Finding 6`):**
   - Updated `src/components/store/cart/cart-view.tsx` with `useOptimistic` for `qty`, `remove`, and `clear` actions inside `startTransition`, with `pending` guards preventing conflicting submissions and automatic reversion if server validation fails (e.g. insufficient stock). Server-returned `summary` remains authoritative for prices, GST, and totals.
7. **Lightweight Web Vitals & Slow-Query Monitoring (`Finding 8`):**
   - Created `src/components/monitoring/web-vitals-reporter.tsx` (`useReportWebVitals`, non-blocking, zero PII) and mounted in `src/app/layout.tsx`.
   - Updated `src/lib/prisma.ts` with `$extends` query timing logging `{ event: "slow_prisma_query", model, operation, durationMs }` for queries `>= 300ms` (never logging SQL parameters or PII; disabled in `VITEST`/`test`).

### Group C — Summary Catalogue Prisma Projection
8. **Summary `select` Projection (`Finding 2`):**
   - Updated `src/modules/catalogue/prisma/prisma-product-repository.ts` to use `productSummarySelect` (excluding `description`, `spec*`, `gstRateBps`, `warrantyYears`, extra images beyond `take: 1`, and unused `brand`/`stock` columns) on `listBestSellers`, `listProducts`, and `listRelated`.
   - Full `productInclude` remains intact on `getBySlug` and `getByIds`. All filtering, sorting, pagination, and facet-count semantics remain unchanged.

---

## 2. Verification Results

| Check | Status | Details |
| --- | --- | --- |
| `npm run typecheck` | **PASS** | `tsc --noEmit` exited `0` |
| `npm run lint` | **PASS** | `eslint .` exited `0` (`0` errors, `0` warnings) |
| `npm run qa:build` | **PASS** | Next.js 16.4.6 Turbopack build exited `0` |
| `npx vitest run tests/unit/` | **PASS** | `21/21` files, `134/134` tests passed |
| `RUN_DB_TESTS=1` on `localhost:5432/watchstore_db` | **PASS** | Verified across `auth-db`, `notifications-db`, `push-notifications-db`, `invoices-db`, `operations-db`, `admin-catalogue-db` |
| Live Vercel Preview `bom1` / Browser Web Vitals | **NOT TESTED** | Preview SSO bypass token not configured; not pushed/deployed |

---

## 3. Preserved Business Logic & Safety

- No changes to pricing, discounts, GST, coupon validation, stock reservations, order state transitions, Razorpay settlement/webhooks, Shiprocket, Google Sheets, RBAC, or PWA/VAPID push logic.
- No changes to `prisma/schema.prisma`, migrations, `.env`, or `vercel.json`.
