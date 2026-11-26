# Customer Invoice — Final Verification & Production Readiness Audit

**Audit Date:** 2026-11-26  
**Branch:** `development`  
**Test Database:** Local PostgreSQL `watchstore_db` (remote Supabase was **not** modified)

---

## 1. Automated Regression & Build Results

| Check | Command | Verdict | Scope & Counts |
| :--- | :--- | :--- | :--- |
| **TypeScript Typecheck** | `npm run typecheck` | **PASS** | `0` errors |
| **ESLint** | `npm run lint` | **PASS** | `0` errors (1 pre-existing `jsx-ast-utils` warning) |
| **Unit Tests** | `vitest run tests/unit/` (local `watchstore_db`) | **PASS** | **`19` files, `125` tests passed** (incl. `phase-18-invoices.test.ts` `3` tests, `phase-13-notifications.test.ts` `7` tests) |
| **DB Integration Tests** | `RUN_DB_TESTS=1 vitest run --no-file-parallelism tests/integration/` (local `watchstore_db`) | **PASS** | **`13` files, `38` tests passed** (incl. `invoices-db.test.ts` `2` tests, `notifications-db.test.ts` `3` tests, `admin-orders-db.test.ts` `3` tests, `razorpay-db.test.ts` `3` tests) |
| **Production Build** | `npm run qa:build` (`NEXT_DIST_DIR=.next-build next build`) | **PASS** | `Next.js 16.4.6` Turbopack build succeeded (`17/17` static pages) |

---

## 2. Invoice Number Concurrency Findings (`PASS`)

- **Same-Order Concurrency:** `SELECT "id", "status" FROM "Order" WHERE "id" = $1 FOR UPDATE` serializes concurrent requests for the same order inside `prisma.$transaction`; the second request sees `tx.orderInvoice.findUnique` and returns the existing invoice without touching `InvoiceSequence`.
- **Cross-Order Concurrency:** `INSERT INTO "InvoiceSequence" ("yearMonth", "lastValue") VALUES ($1, 1) ON CONFLICT ("yearMonth") DO UPDATE SET "lastValue" = "InvoiceSequence"."lastValue" + 1 RETURNING "lastValue"` acquires an atomic PostgreSQL row lock on the `"InvoiceSequence"` row for that `yearMonth`, guaranteeing unique sequential `INV-WS-YYYYMM-NNNNN` numbers across concurrent orders without consuming sequence numbers on rolled-back transactions.
- **Database Enforcement:** `OrderInvoice.orderId` (`@unique`) and `OrderInvoice.invoiceNumber` (`@unique`) enforce uniqueness at the PostgreSQL level.
- **Verified:** `invoices-db.test.ts` tested both same-order `Promise.all` (3 concurrent calls → 1 invoice) and cross-order `Promise.all` (2 different delivered orders → 2 distinct sequential invoice numbers).

---

## 3. GST & Invoice Classification Findings (`PASS` with Statutory Confirmation Note)

- **Registered vs Unregistered Seller:** `resolveSellerInvoiceConfig()` fails closed (`503`) if `SELLER_LEGAL_NAME` or `SELLER_ADDRESS` is missing or still a placeholder. If `SELLER_GSTIN` is unset/placeholder, `taxMode` is `GST_INCLUSIVE_UNREGISTERED` and no GSTIN is fabricated.
- **CGST/SGST vs IGST:** When `SELLER_GSTIN` is configured, intra-state (`SELLER_STATE === customerState`, case-insensitive) splits `lineGstPaise` into `CGST` (`Math.floor(lineGstPaise / 2)`) + `SGST` (`lineGstPaise - cgstPaise`), while inter-state assigns `IGST`. All calculations use historical `Order` / `OrderItem` / `OrderAddressSnapshot` integer-paise snapshots.
- **Statutory / Accountant Confirmation Notes:**
  1. Confirm with the seller's CA/tax adviser whether `SELLER_STATE` is configured alongside `SELLER_GSTIN` (if `SELLER_GSTIN` is set without `SELLER_STATE`, `determineTaxMode` defaults to `IGST`) and validate the 15-character GSTIN format (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`).
  2. Confirm whether `promoDiscountPaise` or `shippingPaise` requires separate GST apportionment under the seller's tax invoicing rules (currently `OrderItem.lineGstPaise` is inclusive on item lines as stored at checkout).

---

## 4. PDF Rendering Findings (`PASS` — Verified with `pdfinfo`, `pdftotext`, and `pdftoppm`)

- Verified single-page (`1` page, `2265` bytes) and 28-item multi-page (`3` pages, `5098` bytes) A4 (`595.28 x 841.89 pts`, PDF `1.4`) outputs with `pdfinfo`, `pdftotext`, and `pdftoppm` PNG rendering.
- **Defects Found & Fixed During Audit (`src/modules/invoices/invoice-pdf.ts`):**
  1. Right-aligned monospace `Invoice #: INV-WS-202611-00001` in the header previously touched the right edge of the banner due to `0.52` width factor; updated to `0.605` for `Courier` (`F3`).
  2. `Shipping Charges:` descenders previously touched the top of the `Grand Total:` highlight box; added `4pt` extra vertical spacing before highlighted summary rows.
- Re-rendered `single_fixed-1.png` confirmed crisp alignment, clean spacing, wrapped long product names/addresses, `Rs.` Indian digit grouping, tax breakdown, and `Page X of Y` footer.
- **Rounding Note:** `toAsciiMoney()` rounds integer paise to nearest whole rupee (`Math.round(paise / 100)`), matching WatchStore's `formatINR()` default display convention.

---

## 5. API & Security Findings (`PASS`)

- **Access Control:** `GET /api/orders/[orderId]/invoice` enforces `orderId` format (`^[a-zA-Z0-9_-]{4,64}$`), registered customer ownership (`order.customerId === customer.id`, `403` otherwise), or guest HMAC `token` (`verifyOrderAccessToken`, `401` otherwise).
- **Eligibility & Headers:** Server-side `order.status === "DELIVERED"` check (`409` otherwise), rate limiting (`20/10m`), `Content-Type: application/pdf`, `Content-Disposition: attachment`, `Cache-Control: private, no-store, max-age=0`, `X-Content-Type-Options: nosniff`.
- **Guest Token Note:** `verifyOrderAccessToken` is stateless HMAC-SHA256 bound to `orderNumber + guestEmail` and `RAZORPAY_KEY_SECRET` (same as `/checkout/confirmation`); it does not carry an expiration timestamp.

---

## 6. Browser UI & Migration Findings

- **Customer UI (`NOT TESTED` in live browser):** `DownloadInvoiceButton` is integrated into `/account/orders/[orderId]` and `/checkout/confirmation` (gated by `status === "DELIVERED"`), with loading state, error alert + retry, and `"Invoice Ready"` badge on `/account/orders`. Live browser click-through was **NOT TESTED** in this audit.
- **Database Migration `0014_phase18_order_invoices` (`PASS`):** Purely additive (`InvoiceSequence` and `OrderInvoice` tables, unique indexes, FK `ON DELETE CASCADE` to `Order`). Does not modify or delete existing `Order` or `Payment` rows. Compatible with Supabase PostgreSQL `17.6`. **Not yet applied to remote Supabase** (`npm run db:deploy` via `DIRECT_URL` required before deploying this branch).

---

## 7. Remaining Production Configuration

1. Apply `0014_phase18_order_invoices` to Supabase (`npm run db:deploy` via `DIRECT_URL`) when approved for deployment.
2. Configure `SELLER_LEGAL_NAME`, `SELLER_ADDRESS`, `SELLER_STATE`, `SELLER_GSTIN` (confirmed by accountant), `SELLER_EMAIL`, and `SELLER_PHONE` in Vercel Environment Variables.
3. Perform live-browser QA of `/account/orders/[orderId]` and `/checkout/confirmation` invoice downloads on Preview/Staging.
