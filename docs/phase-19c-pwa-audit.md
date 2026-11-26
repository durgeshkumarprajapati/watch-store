# Phase 19C — Customer-Only Progressive Web App (PWA) Pre-Implementation Audit

**Repository:** `/home/ppsd-021/watch-store`  
**Branch:** `development`  
**Audit Type:** Strictly Read-Only Pre-Implementation Audit (no source code modified)

---

## 1. Existing Architecture

- **Framework & Runtime:** Next.js `16.4.6` (App Router, Turbopack), React 19, TypeScript strict mode, Tailwind CSS v4.
- **Root Layout (`src/app/layout.tsx`):**
  - Loads self-hosted fonts (`@fontsource-variable/bodoni-moda`, `@fontsource-variable/raleway`, `@fontsource-variable/jetbrains-mono`), `globals.css`, and `ThemeProvider`.
  - Sets `metadata` (`title`, `description`, `icons: { icon: brand.favicon }`).
- **Design Tokens (`src/app/globals.css` & `src/config/brand.ts`):**
  - Brand: `WatchStore` (`WATCHSTORE`).
  - Light mode: `--background: #f5f2ec`, `--surface: #ffffff`, `--primary: #a87832`, `--secondary: #172a3a`.
  - Dark mode (`.dark` class): `--background: #111315`, `--surface: #1b1e21`, `--primary: #d1a65d`, `--secondary: #344c61`.
- **Security & Image Config (`next.config.ts`):**
  - Sets global security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `Strict-Transport-Security` in production).
  - Allows `remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }]` for Next.js Image Optimization.
- **Static Assets (`public/`):**
  - Contains `public/fonts/`, `public/images/`, and `public/sw.js`.
  - No `manifest.webmanifest` or PWA icon set (`192x192`, `512x512`, maskable, `apple-touch-icon` `180x180`) exists yet.

---

## 2. Existing Customer & Admin Route Boundaries

- **Customer Storefront Group (`src/app/(store)/`):**
  - Uses `src/app/(store)/layout.tsx` (`StoreLayout` with `StoreHeader` and `StoreFooter`).
  - Routes: `/`, `/products`, `/product/[slug]`, `/about`, `/contact`, `/faq`, `/policies/[slug]`, `/account`, `/account/orders`, `/account/orders/[orderId]`, `/account/profile`, `/account/addresses`, `/account/notifications`, `/account/security`, `/account/wishlist`.
- **Standalone Customer Routes (share `RootLayout`, outside `(store)/`):**
  - `/cart`, `/checkout`, `/checkout/confirmation`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/signin`.
- **Admin Portal (`src/app/admin/`):**
  - Uses `src/app/admin/layout.tsx` and `src/app/admin/(protected)/layout.tsx` (`AdminShell`).
  - Routes: `/admin/login`, `/admin/dashboard`, `/admin/orders`, `/admin/products`, `/admin/brands`, `/admin/categories`, `/admin/customers`, `/admin/inventory`, `/admin/payments`, `/admin/shipments`, `/admin/notifications`, `/admin/inbox`, `/admin/operations`, `/admin/settings`, `/admin/users`, `/admin/audit`, `/admin/reports`, `/admin/gst`, `/admin/google-sheets`, `/admin/access-denied`.
- **API Routes (`src/app/api/`):**
  - Auth, cart, checkout, Razorpay webhooks, Shiprocket webhooks, invoices (`/api/orders/[orderId]/invoice`), push endpoints (`/api/push/vapid-public-key`, `/api/notifications/push/*`, `/api/notifications/inbox/*`, `/api/admin/push-subscriptions/test`), internal cron jobs (`/api/internal/*`).

---

## 3. Existing Service Worker Behaviour (`public/sw.js`)

- Currently registered at `scope: "/"` when a user enables Browser Push in `BrowserPushSettings` (`src/components/notifications/browser-push-settings.tsx`).
- Implements:
  - `install`: `self.skipWaiting()`.
  - `activate`: `self.clients.claim()`.
  - `push`: parses JSON/text payload and calls `self.registration.showNotification(title, { body, tag, data: { url } })` with same-origin relative URL sanitization (`toSafeRelativeUrl`).
  - `notificationclick`: closes notification and focuses/navigates an existing same-origin window client or opens a new window.
- **No `fetch` event listener** is currently registered; all HTTP/RSC/asset requests bypass the service worker directly to the network.

---

## 4. Existing Push Notification Implementation (Phase 19B)

- **VAPID & Subscription APIs:**
  - `GET /api/push/vapid-public-key`
  - `POST /api/notifications/push/subscribe` (same-origin + SSRF endpoint validation, scoped to `Customer` or `AdminUser`)
  - `DELETE /api/notifications/push/unsubscribe` (ownership-scoped deactivation)
  - `GET /api/notifications/push/status?portal=customer|admin`
  - `POST /api/admin/push-subscriptions/test`
- **Inbox & Header Integration:**
  - `GET /api/notifications/inbox` and `POST /api/notifications/inbox/read`
  - `NotificationBell` in both `StoreHeader` and `AdminShell`.
  - `BrowserPushSettings` in `/account/notifications`, `/account/profile`, `/admin/inbox`, and `/admin/settings`.
- **Key Compatibility Constraint:** Both Customer and Admin push subscriptions share `public/sw.js` at `scope: "/"`. Registering a second service worker at `/` or a conflicting scope would break existing push subscriptions.

---

## 5. Recommended PWA Architecture (Customer-Only)

1. **Web App Manifest (`public/manifest.webmanifest`):**
   - Served from `/manifest.webmanifest` rather than `src/app/manifest.ts` (because Next.js `app/manifest.ts` automatically injects `<link rel="manifest">` into `RootLayout`, which would expose it on `/admin/*`).
   - Instead, link `<link rel="manifest" href="/manifest.webmanifest">` and `<meta name="apple-mobile-web-app-capable" content="yes">` only in customer-facing layouts/routes (or conditionally outside `/admin/*`), keeping `/admin/*` completely excluded.
   - `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `orientation: "portrait-primary"`, `background_color: "#f5f2ec"`, `theme_color: "#172a3a"`.
2. **WatchStore Brand Icons (`public/icons/`):**
   - Generate crisp WatchStore-branded PNG icons (matching the WatchStore `#172a3a` / `#a87832` / `#f5f2ec` luxury palette and clock/timepiece emblem) in sizes:
     - `icon-192x192.png`
     - `icon-512x512.png`
     - `icon-maskable-192x192.png`
     - `icon-maskable-512x512.png`
     - `apple-touch-icon.png` (`180x180`)
3. **Single Unified Service Worker (`public/sw.js`):**
   - Preserve `install`, `activate` (adding old-cache cleanup for non-current `watchstore-pwa-*` caches), `push`, and `notificationclick` **untouched in behaviour**.
   - Add a `fetch` handler with strict bypass rules:
     - **Immediate network pass-through (never intercept or cache):**
       - Any non-`GET` request (`POST`, `PUT`, `DELETE`, etc.).
       - Any cross-origin request (except optional safe public Cloudinary product images if desired, or keep strictly same-origin + `/_next/image` / `/images/`).
       - Any `/admin` or `/admin/*` path.
       - Any `/api/*` path (auth, cart, checkout, Razorpay, Shiprocket, invoices, notifications, push).
       - Any sensitive/dynamic customer route navigation: `/cart`, `/checkout`, `/checkout/*`, `/account`, `/account/*`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/*`.
       - Any Next.js RSC/data/HMR request (`_rsc` query param, `Accept: text/x-component`, `/_next/webpack-hmr`).
     - **Versioned Static Cache (`watchstore-static-v1`, Cache-First with max cap):**
       - `/_next/static/*`, `/fonts/*`, `/icons/*`, `/favicon.ico`.
     - **Versioned Public Image Cache (`watchstore-images-v1`, Stale-While-Revalidate with FIFO cap e.g. 60 entries):**
       - `/images/*` and `/_next/image*` (only when `res.ok`).
     - **Safe Public Customer Navigation (`watchstore-pages-v1`, Network-First with `/offline` fallback):**
       - Public storefront pages (`/`, `/products`, `/product/*`, `/about`, `/contact`, `/faq`, `/policies/*`, `/offline`).
       - If offline and not in cache, serve `/offline` (pre-cached during `install`).
       - Sensitive pages (`/cart`, `/checkout`, `/account/*`, `/login`, etc.) are **never cached**; if offline during navigation to them, serve `/offline` cleanly without showing stale account/checkout data.
4. **Customer-Only Service Worker Auto-Registration & Install Prompt:**
   - Mount a lightweight `CustomerPwaManager` client component inside `StoreLayout` (`src/app/(store)/layout.tsx`) — and never inside `AdminShell` or `src/app/admin/layout.tsx`.
   - Registers `/sw.js` (`scope: "/"`) idempotently on customer pages (without disturbing existing push subscriptions).
   - Listens for `beforeinstallprompt`, detects standalone mode (`window.matchMedia("(display-mode: standalone)").matches` or `navigator.standalone`), respects dismissal persistence in `localStorage` (cooldown e.g. 14 days), and provides an unobtrusive, dismissible install banner/card for Android/Desktop Chrome/Edge plus Safari iOS Share → Add to Home Screen instructions on iOS Safari.
5. **Offline Fallback Page (`src/app/offline/page.tsx`):**
   - Styled with WatchStore light/dark tokens, clear offline explanation, "Retry" button (`window.location.reload()`), and "Return to Homepage" link (`/`).
6. **Safe-Area Standalone Polish (`src/app/globals.css` & `src/app/layout.tsx`):**
   - Add `viewportFit: "cover"` (via Next.js `viewport` export) and `env(safe-area-inset-*)` padding where needed on sticky headers/body without altering existing layouts.

---

## 6. Files to Modify and New Files Required

### New Files
- `public/manifest.webmanifest`
- `public/icons/icon-192x192.png`
- `public/icons/icon-512x512.png`
- `public/icons/icon-maskable-192x192.png`
- `public/icons/icon-maskable-512x512.png`
- `public/icons/apple-touch-icon.png`
- `src/app/offline/page.tsx`
- `src/components/pwa/customer-pwa-manager.tsx`
- `src/lib/pwa-config.ts` (shared manifest/cache exclusion helpers testable by Vitest)
- `tests/unit/phase-19c-pwa.test.ts`
- `docs/phase-19c-pwa-implementation.md`
- `docs/phase-19c-pwa-test-results.md`

### Files to Modify
- `public/sw.js` (extend with versioned caches, strict exclusions, and `/offline` fallback while preserving `push` and `notificationclick`)
- `src/app/(store)/layout.tsx` (mount `CustomerPwaManager` and customer manifest/apple-touch-icon metadata or head tags)
- `src/app/layout.tsx` (export `viewport` with `viewportFit: "cover"` and `themeColor`)
- `src/app/globals.css` (safe-area-inset utility support if needed)

---

## 7. Risks and Compatibility Issues

1. **Shared Service Worker Scope (`/`):** Admin push notifications use `public/sw.js` at `scope: "/"`. Any bug in `sw.js` `fetch` handling could impact `/admin/*`. Mitigation: strict early `return` bypass for `/admin`, `/api`, non-`GET`, and `_rsc` requests before any cache lookup.
2. **Next.js App Router RSC Caching:** Caching RSC payloads (`?_rsc=...`) across auth state transitions can leak stale UI or cause hydration mismatches. Mitigation: explicitly bypass any request with `_rsc` query parameter or `RSC` header.
3. **Auth & Checkout Data Safety:** Caching `/account/*`, `/cart`, `/checkout`, or `/api/*` would violate data safety and show stale stock/orders. Mitigation: never cache those routes; fall back to `/offline` on failed navigation.
4. **iOS Safari Limitations:** iOS Safari does not fire `beforeinstallprompt` and requires HTTPS (or localhost) + `apple-touch-icon` + `Add to Home Screen` user instructions. Web Push on iOS only works when installed to the Home Screen (iOS 16.4+).
5. **Existing Push Subscriptions:** Keeping `public/sw.js` at `scope: "/"` ensures zero migration/re-registration impact for existing Phase 19B customers and admins.

---

## 8. Testing Requirements

- **Automated Checks:** `npm run typecheck`, `npm run lint`, `npm run qa:build`, `npx vitest run tests/unit/`, and `RUN_DB_TESTS=1` DB integration suites.
- **New Unit Tests (`tests/unit/phase-19c-pwa.test.ts`):**
  - Manifest JSON validity, icon file existence, customer `start_url` / `scope`.
  - Cache exclusion rules (`/admin/*`, `/api/*`, `/cart`, `/checkout`, `/account/*`, `POST`, `_rsc`).
  - `public/sw.js` preservation of `push` and `notificationclick` handlers and cache cleanup logic.
- **Browser / Device Testing (report `NOT TESTED` if headless/browser unavailable):**
  - Manifest & Service Worker activation in DevTools, offline fallback (`/offline`), install prompt & dismissal, standalone viewport check across `360x800`, `390x844`, `768x1024`, `1280x800`, `1440x900` in light & dark mode, plus push notification preservation and admin isolation.
