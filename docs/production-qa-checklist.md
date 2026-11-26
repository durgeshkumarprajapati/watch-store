# Production QA Readiness Checklist (Audit 9)

Distinguishes **Automated/DB Verification** (already run or runnable via CLI) from **Real-Browser & Live-Provider Verification** (required on Vercel Preview/Production).

| Area | Automated / DB Verified? | Real-Browser / Live-Provider QA Required |
| :--- | :--- | :--- |
| **Homepage (`/`)** | `GET /` HTTP `200` verified | Visual layout, hero/banner images, LCP, mobile viewport |
| **Product Catalogue (`/products`)** | `GET /products` HTTP `200`, `12` DB products | Filters, sorting, pagination, stock badges, empty states |
| **Product Details (`/product/[slug]`)** | `GET /product/...` HTTP `200` | Gallery zoom, specs, add-to-cart, out-of-stock handling |
| **Cart (`/cart`)** | Unit tests (timed out locally due to remote DB RTT; pass in CI) | Add/update/remove items, stock cap enforcement, persistence |
| **Checkout (`/checkout`)** | Unit/DB tests | Address entry, promo/shipping calculation, COD & Razorpay handoff |
| **Customer Registration & Login** | Auth.js unit tests | Real signup, email verification link via Resend, login, cookie persistence |
| **Google OAuth** | Code & callback logic reviewed | End-to-end Google sign-in on `https://` Preview/Prod URL (`NOT TESTED` — keys not set) |
| **Password Reset** | Token & `sessionVersion` tests | Forgot-password email delivery + reset + old-session invalidation |
| **Customer Account & Orders (`/account*`)** | Unauthenticated `307 -> /login` verified | Authenticated profile, addresses, order history, order detail |
| **Admin Auth & RBAC Denial** | Unauthenticated `307 -> /admin/login`; RBAC DB seeded (`6` roles, `37` perms) | Login as `SUPER_ADMIN`, verify `/admin/access-denied` for restricted role |
| **Product & Category Management** | DB CRUD & unit tests | Create/edit/archive product, brand, category via `/admin/*` |
| **Inventory Management** | `ProductStock` (`12`), `StockAdjustment` (`8`), `InventoryReservation` (`4`) reconciled | Inward/outward/adjustment UI flows & low-stock alerts |
| **Order Management** | `Order` (`4`) & `OrderStatusHistory` (`10`) reconciled | Status transitions, packing, cancellation, manual refund flag |
| **Payments (Razorpay)** | Test-mode signature & settlement unit/DB tests | Live `rzp_live_*` test ₹1 order, capture, and webhook delivery |
| **Shipping (Shiprocket)** | Live auth, pickup `"home"` (`391410`), serviceability verified | Live AWB/label generation & `/api/webhooks/shiprocket` callback |
| **Notifications (Resend)** | Outbox (`280` rows) & templates unit-tested | Live email delivery + Resend domain SPF/DKIM check |
| **Google Sheets** | Live export & import dry-run **PASS** | Confirmed live import (`isDryRun: false`) on demo sheet |
| **Media Upload (Cloudinary)** | Code & fail-closed unit tests **PASS** | Live upload/replace/delete in `/admin/products` + 12-image migration |
| **Mobile Responsiveness & Theme** | Not automated | Manual viewport (`375px`, `768px`, `1280px`) & dark/light theme toggle check |
