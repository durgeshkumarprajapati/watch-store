# WatchStore — Pre-Deployment Technical Audit (Read-Only)

**Audit Date:** 2026-11-26  
**Repository:** `/home/ppsd-021/watch-store`  
**Target Platform:** Vercel (Next.js `16.4.6`) + Supabase PostgreSQL (`oovkkzetdjiphjumponn`, PostgreSQL `17.6`)

---

## 1. Repository & Build Verification (Audit 1)

| Check | Command | Observed Result |
| :--- | :--- | :--- |
| **Node.js / npm** | `node -v && npm -v` | `v24.19.0` / `11.17.0` (`package.json` requires `>=20.9`; CI uses `22`) |
| **Next.js / Prisma** | `package.json` | `next: ^16.4.6`, `react: ^19.3.1`, `@prisma/client: ^6.19.3`, `prisma: ^6.19.3`, `next-auth: ^5.0.0-beta.32` |
| **TypeScript Strict** | `npm run typecheck` (`tsc --noEmit`) | **PASS** (`0` errors; `strict: true`, `noUncheckedIndexedAccess: true`) |
| **ESLint** | `npm run lint` (`eslint .`) | **PASS** (`0` errors; 1 `jsx-ast-utils` warning on `TSNonNullExpression`) |
| **Production Build** | `npm run qa:build` (`NEXT_DIST_DIR=.next-build next build`) | **PASS** (compiled in `1669ms`, 17/17 static pages; 1 Turbopack dynamic FS tracing warning at `src/modules/admin/catalogue/media-storage.ts:126`) |
| **Unit Tests** | `npm test` (`vitest run`) | **16 files passed, 12 skipped, 2 failed** (`112` passed, `35` skipped, `7` failed — `cart-and-newsletter.test.ts` and `product-details.test.ts` hit 5000ms timeouts because `.env` `DATABASE_URL` points to remote Sydney Supabase instead of a local DB) |
| **Secret Hygiene** | `.gitignore` & config review | `.env` and `.env.*` (except `!.env.example`) are gitignored; no committed secrets or local DB fallbacks in production (`hasDatabaseUrl()` / `requireDatabaseUrl()` fail closed) |

---

## 2. Prisma & Supabase Compatibility (Audit 3)

- **Prisma `6.19.3`:** Compatible with Next.js 16 and Vercel Node.js serverless runtime (`src/lib/prisma.ts` uses `globalThis.__watchStorePrisma` singleton).
- **Pooler Separation:**
  - `DATABASE_URL`: Supabase Transaction Pooler (`aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true`).
  - `DIRECT_URL`: Supabase Session Pooler (`aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres`), used by `prisma migrate deploy`.
- **Observed Port `6543` Concurrency Finding:** During Phase 3G testing, a `Promise.all` burst of `6` concurrent Prisma queries against port `6543` returned `Can't reach database server at aws-1-ap-southeast-2.pooler.supabase.com:6543`, whereas sequential queries succeeded.
- **Recommended Connection-Pool Tuning (Do Not Apply Here):** Append `&connection_limit=5&pool_timeout=20&connect_timeout=15` to `DATABASE_URL` in Vercel environment settings so serverless instances do not open excessive concurrent connections against Supabase's pooler.
- **Deployment Safety:** No `postinstall` or build script runs `prisma migrate deploy` or `prisma db seed` automatically.

---

## 3. Cloudinary Media Readiness (Audit 5)

- **Provider Selection (`src/modules/admin/catalogue/media-storage.ts`):**
  - `NODE_ENV === "production"` **always** selects `CloudinaryMediaStorageProvider` (fail-closed with HTTP `503` `CloudinaryConfigurationError` if `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, or `CLOUDINARY_API_SECRET` are missing).
  - `next.config.ts` allows `https://res.cloudinary.com` in `images.remotePatterns`.
- **Upload / Delete / Cleanup:**
  - `/api/admin/catalogue/upload` enforces admin RBAC, 5 MB limit, magic-byte MIME validation (`webp`/`jpeg`/`png`), and rate limiting.
  - `MediaCleanupJob` provides durable DB-backed retry & dead-letter tracking for asset deletion (`/api/internal/media/cleanup`).
- **12-Image Migration Status:** **NOT EXECUTED on database.** Inspection of Supabase `ProductImage` confirmed all `12` rows still reference local `/images/products/...` paths. Because `public/images/products/` is committed in the repo, images will still load on Vercel, but moving them to Cloudinary CDN requires running `npx tsx --env-file=.env scripts/migrate-product-media.ts --execute`.

---

## 4. Payment, Shipping, Email & Google Sheets (Audit 7)

| Integration | Code Status | Live Verification Status | Required Production Setup |
| :--- | :--- | :--- | :--- |
| **Razorpay** | Implemented (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, timing-safe HMAC-SHA256 webhook, 256 KB limit, idempotent `RazorpayWebhookEvent`) | Test-mode verified locally; **Live mode NOT TESTED** | Switch to `rzp_live_*` keys for commercial launch; register `https://<domain>/api/webhooks/razorpay` in Razorpay Dashboard |
| **Shiprocket** | Implemented (`SHIPROCKET_API_EMAIL`, `SHIPROCKET_API_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_PICKUP_PINCODE`, `SHIPROCKET_WEBHOOK_TOKEN`, atomic DB token lock) | Auth, pickup `"home"` (`391410`), and serviceability verified live; **live shipment creation & webhook delivery NOT TESTED** | Register `https://<domain>/api/webhooks/shiprocket` with `x-api-key: <SHIPROCKET_WEBHOOK_TOKEN>` in Shiprocket Panel |
| **Resend** | Implemented (`RESEND_API_KEY`, `EMAIL_FROM`, `Notification` + `NotificationJob` outbox with retry/dead-letter) | Credentials present in `.env`; **live email delivery & SPF/DKIM domain verification NOT TESTED** | Verify production sender domain in Resend; set `EMAIL_FROM` to verified domain |
| **Google Sheets** | Implemented (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GoogleSheetsConnection` migrated to Supabase) | Live export & import dry-run **PASS**; **confirmed live import NOT TESTED** | Configure service account env vars in Vercel (ensure `\n` newline escaping in private key is handled) |

---

## 5. Dependency & Security Audit (`npm audit`) (Audit 8)

`npm audit` reported **4 high** vulnerabilities (`0` critical, `0` moderate, `0` low). **All 4 are inside `devDependencies` (`prisma` CLI `6.19.3`) and are NOT reachable in the Next.js/Vercel production runtime (`@prisma/client`):**

| Package | Installed Range | Advisory | Dependency Path | Prod Reachable? | Mitigation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `deepmerge-ts` | `<8.0.0` | `GHSA-ggr8-5vv4-36mx` (stack exhaustion on recursive graphs) | `prisma` → `@prisma/config` → `deepmerge-ts` | **No** (dev CLI only) | Upgrade `prisma` to `7.10.1+` (breaking major; defer until planned upgrade) |
| `effect` | `<=3.22.0` | `GHSA-7589-6fvf-x4pw` (ReDoS in `Schema.TemplateLiteral`) | `prisma` → `@prisma/config` → `effect` | **No** (dev CLI only) | Upgrade `prisma` to `7.10.1+` (breaking major; defer until planned upgrade) |
| `@prisma/config` | `>=6.13.0-dev.1` | Transitive (`deepmerge-ts`, `effect`) | `prisma` → `@prisma/config` | **No** (dev CLI only) | Same as above |
| `prisma` | `6.13.0-dev.1 – 7.10.0` | Transitive (`@prisma/config`) | `devDependencies.prisma` (`6.19.3`) | **No** (dev CLI only) | Same as above |
