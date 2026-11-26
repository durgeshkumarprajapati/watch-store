# WatchStore — Deployment Readiness Summary

**Audit Date:** 2026-11-26  
**Target:** Vercel (Next.js `16.4.6`) + Supabase PostgreSQL (`oovkkzetdjiphjumponn`)

---

## 1. Classified Findings

### BLOCKER (Must resolve before any deployment)
- **None in code.** All TypeScript (`tsc --noEmit`), ESLint (`eslint .`), and production build (`npm run qa:build`) checks pass, and Supabase (`oovkkzetdjiphjumponn`) is migrated (`13` migrations) and populated (`854` application rows). *(Deployment-time config requirement: set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` (`https://`), `CRON_SECRET`, and `CLOUDINARY_*` in Vercel Environment Variables before first deploy.)*

### HIGH (Must resolve before commercial production launch)
1. **Live Payment, Shipping & Email Configuration:** Switch Razorpay from test keys to `rzp_live_*`, register production webhooks (`https://<domain>/api/webhooks/razorpay` and `/api/webhooks/shiprocket`), and verify the `EMAIL_FROM` sender domain in Resend.
2. **Google OAuth Credentials Missing:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are currently `NOT SET` in `.env`; configure them with production callback URLs if Google Sign-In is enabled.
3. **12 Seeded `ProductImage` Rows Still Local Paths:** Supabase `ProductImage` rows still reference `/images/products/...` rather than Cloudinary URLs; run `npx tsx --env-file=.env scripts/migrate-product-media.ts --execute` if serving seeded catalogue images from Cloudinary CDN.
4. **Supabase Pooler Concurrency Tuning (`:6543`):** A `Promise.all` burst of `6` concurrent Prisma queries against `:6543` failed with `Can't reach database server`; configure `connection_limit=5&pool_timeout=20` on Vercel's `DATABASE_URL` and load-test concurrency.

### MEDIUM (Should resolve before launch or shortly after)
1. **In-Memory Rate Limiter (`src/lib/rate-limit.ts`):** Per-Lambda `Map` does not share state across Vercel serverless instances; replace with Upstash/Redis or DB-backed rate limiting.
2. **Newsletter Disabled in Production (`src/modules/newsletter/actions.ts`):** Throws `"Newsletter storage is not configured (Phase 4)."` when `NODE_ENV === "production"` because only `devFileNewsletterRepository` exists; implement a Prisma newsletter repository or hide the form.
3. **Turbopack Dynamic FS Warning (`media-storage.ts:126`):** `path.join(this.uploadDir, filename)` triggers whole-project file tracing; add `/*turbopackIgnore: true*/` or isolate local dev storage.
4. **Vercel Cron `maxDuration`:** Cron routes (`/api/internal/*`) do not export `maxDuration`; on heavy sync/reconcile batches over Sydney RTT, default timeouts (`10s` Hobby) may be tight.

### LOW (Improvements)
1. **Wire `validateProductionEnv()` at Runtime Startup** (e.g. `src/instrumentation.ts`) and require `CLOUDINARY_*` / webhook secrets when commercial providers are active.
2. **Remove Legacy `SHIPROCKET_CRON_SECRET`** from `.env.example` / `env.ts` (unused; `CRON_SECRET` is used).
3. **Plan `prisma` CLI `7.10.1+` Upgrade** when ready to clear the `4` dev-only `npm audit` advisories (`deepmerge-ts`, `effect` via `@prisma/config`).

---

## 2. Final Verdicts

1. **Is the application safe to deploy to a restricted Vercel Preview environment?**  
   **YES — SAFE TO DEPLOY** (with required Preview environment variables configured in Vercel: `DATABASE_URL` with `connection_limit=5`, `AUTH_SECRET`, `AUTH_URL=https://<preview-domain>`, `CRON_SECRET`, `CLOUDINARY_*`, and test-mode provider keys; keep `CATALOGUE_SOURCE`, `SHOW_PLACEHOLDER_CLAIMS`, and `ALLOW_UNPROTECTED_ADMIN_PREVIEW` unset).
2. **Is the application safe for a commercial production launch?**  
   **NO — HOLD UNTIL HIGH ITEMS ARE RESOLVED.** Complete live Razorpay/Shiprocket/Resend setup & webhook registration, configure Google OAuth (or disable the button), execute the 12-image Cloudinary migration if desired, tune `DATABASE_URL` pooling, and run the real-browser QA checklist on Preview before opening commercial traffic.
