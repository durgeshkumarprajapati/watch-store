# Customer Invoice Audit (Phase 1 — Read-Only)

**Audit Date:** 2026-11-26  
**Branch:** `development`

---

## 1. Existing Invoice Functionality Discovered

- **No customer invoice download or persistence exists.**
- `src/app/admin/(protected)/gst/page.tsx` displays an aggregate GST summary across non-cancelled orders and labels the `Order.orderNumber` column `"Order / Invoice"`.
- No PDF generation dependency (`pdfkit`, `pdf-lib`, etc.) is installed in `package.json`.

---

## 2. Authoritative Historical Order Data Already in PostgreSQL

1. **`Order` (`prisma/schema.prisma:461`):**
   - `orderNumber`, `createdAt`, `deliveredAt`, `status`, `paymentProvider`, `paymentStatus`
   - Integer-paise totals: `mrpTotalPaise`, `productSavingsPaise`, `promoCode`, `promoDiscountPaise`, `subtotalPaise`, `shippingPaise`, `includedGstPaise`, `grandTotalPaise`
   - Authoritative customer link `customerId` + `guestEmail`, `guestName`, `guestPhone`
2. **`OrderItem` (`prisma/schema.prisma:513`):**
   - Historical snapshots: `skuSnapshot`, `productNameSnapshot`, `brandNameSnapshot`, `dialAndStrapSnapshot`, `unitMrpPaise`, `unitPricePaise`, `unitDiscountPaise`, `gstRateBps`, `quantity`, `lineTotalPaise`, `lineGstPaise` (inclusive GST).
3. **`OrderAddressSnapshot` (`prisma/schema.prisma:536`):**
   - Immutable billing/shipping snapshot captured at checkout: `fullName`, `email`, `phone`, `addressLine1`, `addressLine2`, `city`, `state`, `pinCode`, `country`.
4. **`Payment` (`prisma/schema.prisma`):**
   - Authoritative payment settlement: `provider`, `status`, `amountPaise`, `providerOrderId`, `providerPaymentId`, `capturedAt`.

---

## 3. Gaps & Requirements Identified

1. **Seller & Tax Configuration (`src/config/brand.ts`):**
   - `brand.business.legalName` (`"[LEGAL_NAME]"`), `brand.business.gstin` (`"[GSTIN]"`), and `brand.contact.address` (`"Address line, City, State PIN"`) are currently placeholders.
   - Invoice generation must read real seller details from environment variables (`SELLER_LEGAL_NAME`, `SELLER_ADDRESS`, `SELLER_STATE`, `SELLER_GSTIN`, `SELLER_EMAIL`, `SELLER_PHONE`) and **fail closed** if required seller details are missing or still placeholders — never fabricating a GSTIN or legal name.
2. **Persistence & Concurrency:**
   - Need `OrderInvoice` (1:1 with `Order`, storing unique `invoiceNumber`, `issuedAt`, and immutable `snapshot` JSON) + `InvoiceSequence` (atomic `ON CONFLICT DO UPDATE` counter) so concurrent or repeated downloads are idempotent and never create duplicate invoice numbers.
3. **PDF Generation & Access Control:**
   - Zero-dependency pure TypeScript A4 PDF 1.4 generator rendering from `OrderInvoice.snapshot` on demand (no binary blobs in PostgreSQL, no public URLs).
   - Download endpoint `/api/orders/[orderId]/invoice` enforcing:
     - Registered customer session ownership (`order.customerId === customer.id`), **or**
     - Guest HMAC `token` (`verifyOrderAccessToken`) for guest orders.
     - Server-side eligibility check (`order.status === "DELIVERED"`).
     - `Content-Type: application/pdf`, `Cache-Control: private, no-store, max-age=0`, and safe `Content-Disposition`.
