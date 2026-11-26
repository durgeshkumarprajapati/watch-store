# Customer Invoice & Notification Regression Test Results

**Date:** 2026-11-26  
**Branch:** `development`  
**Test Database:** Local PostgreSQL `watchstore_db` (remote Supabase was **not** modified)

---

## 1. Automated Quality & Test Summary

| Check | Command | Result | Scope & Counts |
| :--- | :--- | :--- | :--- |
| **TypeScript Typecheck** | `npm run typecheck` | **PASS** | `0` errors |
| **ESLint** | `npm run lint` | **PASS** | `0` errors (1 pre-existing `jsx-ast-utils` warning) |
| **Unit Tests** | `vitest run tests/unit/` (local `watchstore_db`) | **PASS** | **`19` files, `125` tests passed** (incl. `phase-18-invoices.test.ts` `3` tests, `phase-13-notifications.test.ts` `7` tests) |
| **DB Integration Tests** | `RUN_DB_TESTS=1 vitest run --no-file-parallelism tests/integration/` (local `watchstore_db`) | **PASS** | **`13` files, `37` tests passed** (incl. `invoices-db.test.ts` `1` comprehensive test, `notifications-db.test.ts` `3` tests, `admin-orders-db.test.ts` `4` tests, `razorpay-db.test.ts` `3` tests, `admin-shipping-db.test.ts` `2` tests) |
| **Production Build** | `npm run qa:build` (`NEXT_DIST_DIR=.next-build next build`) | **PASS** | `Next.js 16.4.6` Turbopack build succeeded (`17/17` static pages; `/api/orders/[orderId]/invoice` built cleanly) |

---

## 2. Coverage Matrix

- **Invoice Eligibility & Security:** Verified `PENDING`/`CONFIRMED`/`PROCESSING`/`SHIPPED`/`CANCELLED` rejection (`409`), `DELIVERED` acceptance (`200`), path-traversal rejection (`400`), unauthenticated rejection (`401`), cross-customer denial (`403`), guest HMAC token verification, and `private, no-store` PDF headers.
- **Idempotency, Concurrency & Historical Immutability:** Verified `Promise.all` concurrent calls produce one unique `INV-WS-YYYYMM-NNNNN` invoice number, post-issuance `Product.pricePaise` mutation does not alter `OrderInvoice.snapshot`, and invoice generation creates `0` extra `Notification` rows.
- **PDF Output:** Verified `%PDF-1.4` header, `%%EOF` trailer, single-page and 28-item multi-page pagination with long product names.
- **Notification Regressions:** All `phase-13-notifications.test.ts` unit tests and `notifications-db.test.ts` integration tests passed with `0` regressions.
- **NOT TESTED:** Live browser PDF download UI interaction and live production deployment with `SELLER_*` env vars + `0014_phase18_order_invoices` applied to Supabase.
