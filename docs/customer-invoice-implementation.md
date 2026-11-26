# Customer Invoice Implementation

**Date:** 2026-11-26  
**Branch:** `development`

---

## 1. Database Schema & Migration (`0014_phase18_order_invoices`)

- **Applied Locally:** `prisma/migrations/0014_phase18_order_invoices/migration.sql` applied to local `watchstore_db` (`prisma migrate deploy` must be run against Supabase `DIRECT_URL` before deploying this branch).
- **Models Added (`prisma/schema.prisma`):**
  - `InvoiceSequence` (`yearMonth` PK, `lastValue` Int) — atomic sequence counter via `INSERT ... ON CONFLICT ("yearMonth") DO UPDATE SET "lastValue" = "InvoiceSequence"."lastValue" + 1 RETURNING "lastValue"`.
  - `OrderInvoice` (`id`, `orderId @unique`, `invoiceNumber @unique`, `issuedAt`, `snapshot Json`, `createdAt`) — 1:1 immutable invoice record linked to `Order`.

---

## 2. Invoice Rules, GST Logic & PDF Generation

1. **Eligibility (`src/modules/invoices/invoice-service.ts`):**
   - Server-side check requires `order.status === "DELIVERED"` under `SELECT ... FOR UPDATE` row lock.
   - `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, and `CANCELLED` orders return `409 Conflict`.
2. **Invoice Numbering & Idempotency:**
   - Format: `INV-WS-YYYYMM-NNNNN` (e.g. `INV-WS-202611-00001`).
   - Repeated or concurrent requests return the existing `OrderInvoice` without incrementing `InvoiceSequence` or modifying `Order`, `Payment`, or `Notification`.
3. **Historical Snapshots & Integer-Paise GST:**
   - Uses `OrderItem` (`skuSnapshot`, `productNameSnapshot`, `brandNameSnapshot`, `dialAndStrapSnapshot`, `lineTotalPaise`, `lineGstPaise`, `gstRateBps`) and `OrderAddressSnapshot`.
   - `taxableValuePaise = lineTotalPaise - lineGstPaise`.
   - When `SELLER_GSTIN` is configured: intra-state (`SELLER_STATE === customerState`) splits GST into `CGST` (`Math.floor(lineGstPaise / 2)`) + `SGST` (`lineGstPaise - cgstPaise`); inter-state assigns `IGST`. Without `SELLER_GSTIN`, records `GST_INCLUSIVE_UNREGISTERED` without fabricating a GSTIN.
4. **Seller Configuration (`src/modules/invoices/seller-config.ts`):**
   - Reads `SELLER_LEGAL_NAME`, `SELLER_ADDRESS`, `SELLER_STATE`, `SELLER_GSTIN`, `SELLER_EMAIL`, `SELLER_PHONE`.
   - Rejects placeholder values (`[LEGAL_NAME]`, `[GSTIN]`, `"Address line, City, State PIN"`) with `InvoiceConfigurationError` (`503`).
5. **PDF Generation & Storage (`src/modules/invoices/invoice-pdf.ts`):**
   - Zero-dependency pure TypeScript PDF 1.4 (`%PDF-1.4`) generator with `FlateDecode` compression, A4 (`595.28 x 841.89 pt`) pages, word wrapping for long product names, multi-page pagination (`Page X of Y`), and WatchStore branding.
   - Generated on demand from the immutable `OrderInvoice.snapshot` (no binary blobs in PostgreSQL, no public URLs).

---

## 3. Secure Download API & Customer UI

- **API Endpoint:** `GET /api/orders/[orderId]/invoice` (`src/app/api/orders/[orderId]/invoice/route.ts`)
  - Validates `orderId` format (`^[a-zA-Z0-9_-]{4,64}$`).
  - Authenticates registered customer (`order.customerId === customer.id`) or guest checkout (`?token=<hmac>` verified via `verifyOrderAccessToken`).
  - Rate-limits (`20` requests per 10 minutes per customer/guest order).
  - Returns `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="WatchStore-Invoice-<invoiceNumber>.pdf"`, `Cache-Control: private, no-store, max-age=0`, `X-Content-Type-Options: nosniff`.
- **Customer UI:** `DownloadInvoiceButton` (`src/components/store/account/download-invoice-button.tsx`) integrated into `/account/orders/[orderId]`, `/checkout/confirmation` (for delivered guest orders with token), and `"Invoice Ready"` badge on `/account/orders`.
