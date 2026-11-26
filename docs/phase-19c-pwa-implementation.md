# Phase 19C — Customer-Only Progressive Web App (PWA) Implementation

**Branch:** `development`  
**Status:** Implemented and locally verified (pre-deployment; production Vercel/Supabase untouched)

---

## 1. PWA Architecture & Customer-Only Scope

WatchStore's customer storefront is now an installable PWA while the Admin Portal remains a standard web application:

- **Manifest (`public/manifest.webmanifest`):**
  - `name`: `WatchStore`
  - `short_name`: `WatchStore`
  - `description`: `Luxury Watches and Premium Timepieces`
  - `start_url`: `/`
  - `scope`: `/`
  - `display`: `standalone`
  - `orientation`: `portrait-primary`
  - `background_color`: `#f5f2ec` (matches light-mode `--background`)
  - `theme_color`: `#172a3a` (matches `--secondary`)
- **Manifest Scope Limitation (Documented):**
  - Because `start_url` and `scope` are `/`, the manifest scope technically encompasses `/admin/*` at the URL-prefix level.
  - To isolate Admin Portal without restructuring routes:
    1. `<link rel="manifest" href="/manifest.webmanifest">` and Apple Web App meta tags are exported **only** in `src/app/(store)/layout.tsx`, **not** in `src/app/layout.tsx` or `src/app/admin/layout.tsx`.
    2. `CustomerPwaManager` (`src/components/pwa/customer-pwa-manager.tsx`) is mounted **only** inside `src/app/(store)/layout.tsx`.
    3. `public/sw.js` immediately bypasses all `/admin` and `/admin/*` requests before any caching logic.
- **WatchStore Brand Icons (`public/icons/`):**
  - `icon-192x192.png` (`192x192`, `purpose: "any"`)
  - `icon-512x512.png` (`512x512`, `purpose: "any"`)
  - `icon-maskable-192x192.png` (`192x192`, `purpose: "maskable"`)
  - `icon-maskable-512x512.png` (`512x512`, `purpose: "maskable"`)
  - `apple-touch-icon.png` (`180x180`)
- **Safe-Area Support:**
  - `src/app/layout.tsx` exports `viewport` with `viewportFit: "cover"` and light/dark `themeColor`.
  - `src/app/(store)/layout.tsx` and `CustomerPwaManager` apply `env(safe-area-inset-bottom)` padding for standalone notch/home-indicator devices without altering Admin layout.

---

## 2. Service Worker (`public/sw.js`) & VAPID Preservation

The existing `public/sw.js` (registered at `scope: "/"`) is shared with Phase 19B VAPID Web Push for both Customer and Admin portals:

- **Preserved Unchanged:**
  - `push` event listener (`self.registration.showNotification(...)`).
  - `notificationclick` event listener (`toSafeRelativeUrl`, focus/navigate or `openWindow`).
  - `install` (`self.skipWaiting()`) and `activate` (`self.clients.claim()`), extended to pre-cache `/offline` and clean up old `watchstore-*` cache versions not in `ACTIVE_CACHES`.
- **Caching Strategy (`fetch`):**
  - **Immediate Bypass (network pass-through, never intercepted):**
    - Non-`GET` requests.
    - Cross-origin requests.
    - `/admin`, `/admin/*`, `/api`, `/api/*`, `/_next/webpack-hmr`.
    - Requests with `RSC` header or `_rsc=` query parameter.
  - **Static Assets (`watchstore-static-v1`, Cache-First):**
    - `/_next/static/*`, `/fonts/*`, `/icons/*`, `/favicon.ico`, `/manifest.webmanifest`.
    - Cached only if `response.status === 200`, not redirected, no `Set-Cookie`, and no `no-store`/`private` `Cache-Control`.
  - **Public Images (`watchstore-images-v1`, Stale-While-Revalidate, max 60 entries):**
    - `/images/*` and `/_next/image`.
    - Enforces `MAX_IMAGE_ENTRIES = 60` via FIFO trimming and `isSafeToCacheResponse`.
  - **Customer Navigations (Network-Only with `/offline` fallback):**
    - Public and sensitive customer routes (`/`, `/products`, `/cart`, `/checkout/*`, `/account/*`, `/login`, etc.) are **never** stored as full HTML in the cache, preventing stale cart/auth/pricing/stock state. When offline, `mode === "navigate"` serves the pre-cached `/offline` page (`src/app/offline/page.tsx`).

---

## 3. Installation Experience (`src/components/pwa/customer-pwa-manager.tsx`)

- Registers `/sw.js` (`scope: "/"`) on customer pages without disturbing existing push subscriptions.
- Detects standalone mode (`display-mode: standalone` or `navigator.standalone === true`) and hides install UI when already installed.
- Captures `beforeinstallprompt` on Android/Desktop Chrome/Edge, presents a dismissible install card, handles `accepted`/`dismissed` outcomes, and respects a 14-day dismissal cooldown in `localStorage`.
- Detects iOS Safari (`isIosSafariUserAgent`) and displays the 4-step `Add to Home Screen` instructions.

---

## 4. Deployment Requirements (Future Vercel Preview)

- Ensure HTTPS is enabled (Vercel Preview provides HTTPS automatically; required for Service Workers and Web Push outside `localhost`).
- Ensure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` are set in the Vercel Preview environment.
- No database migrations or production Supabase changes are required for Phase 19C.

## 5. Known Limitations

- Manifest `scope: "/"` technically covers `/admin/*` at the URL level (mitigated by customer-only manifest linking, customer-only `CustomerPwaManager`, and strict `/admin/*` bypass in `sw.js`).
- Public storefront pages are network-only (not cached offline) so customers never see stale stock, pricing, or authentication state; offline navigation serves `/offline`.
- Interactive browser installation, iOS Safari `Add to Home Screen`, and standalone viewport rendering require manual or real-browser verification (not executed in this headless CLI session).
