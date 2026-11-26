# Order Status Notification Test Results

**Date:** 2026-11-26  
**Branch:** `development`  
**Test Database:** Local PostgreSQL `watchstore_db` (remote Supabase was **not** used for test writes)

---

## 1. Automated Verification Summary

| Check | Command | Result | Scope & Counts |
| :--- | :--- | :--- | :--- |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **PASS** | `0` errors |
| **ESLint** | `npm run lint` (`eslint .`) | **PASS** | `0` errors (1 pre-existing `jsx-ast-utils` `TSNonNullExpression` warning) |
| **Unit Tests** | `vitest run tests/unit/` (local `watchstore_db`) | **PASS** | `18` files passed, **`122` tests passed** (incl. `phase-13-notifications.test.ts` `7` tests, `phase-11-orders.test.ts` `3` tests) |
| **DB Integration Tests** | `RUN_DB_TESTS=1 vitest run --no-file-parallelism tests/integration/` (local `watchstore_db`) | **PASS** | `12` files passed, **`36` tests passed** (incl. `notifications-db.test.ts` `3` tests, `admin-orders-db.test.ts` `4` tests, `razorpay-db.test.ts` `3` tests, `admin-shipping-db.test.ts` `2` tests, `operations-db.test.ts` `3` tests) |
| **Production Build** | `npm run qa:build` (`NEXT_DIST_DIR=.next-build next build`) | **PASS** | `Next.js 16.4.6` Turbopack build succeeded (`17/17` static pages) |

---

## 2. Scenario Coverage

- **Verified via Unit & DB Integration Tests (Mocked Resend):**
  - `CONFIRMED` (COD & Razorpay), `PROCESSING` (`transitionAdminOrderStatus` & `markOrderPacked`), `SHIPPED` (`dispatchAdminOrder`), `DELIVERED`, and `CANCELLED` enqueue exact `Notification` + `NotificationJob` records.
  - Failed transitions and same-status transitions do not create notifications.
  - Authoritative `Customer.email` is preferred for registered customers; `guestEmail` is used for guest checkout; invalid emails safely return `{ created: false }`.
  - `SHIPMENT_DISPATCHED` renders courier, AWB, tracking URL, and optional `expectedDelivery`; `ORDER_CANCELLED` renders `cancellationReason`.
  - Duplicate `dedupeKey` does not enqueue or send duplicate emails.
  - Resend `429`/`5xx` triggers `FAILED` retry backoff; `200` marks `SENT` with `providerMessageId`.
  - `shippingUpdatesEnabled: false` skips optional shipping milestones while preserving mandatory `ORDER_CONFIRMED` (`PROCESSING`), `COD_ORDER_CONFIRMED`, and `ORDER_CANCELLED`.
  - Order RBAC (`orders.update`, `orders.cancel`), checkout, Razorpay settlement, Shiprocket sync, and `SchedulerRun` regression suites all pass.
- **NOT TESTED:** Live Resend email delivery to a real inbox and live Vercel Cron invocation (intentionally excluded from automated tests; requires live Vercel environment with verified Resend domain).
