# Vercel Compatibility Report (Audit 4)

**Target:** Vercel Serverless Functions (Next.js `16.4.6` App Router)

---

## 1. Runtime & Route Architecture

- **Runtime:** All dynamic routes and API handlers use Node.js runtime (`node:crypto`, `node:fs/promises`, `@prisma/client`). No Edge Runtime incompatibilities were found.
- **Dynamic vs Static Routes:** `npm run qa:build` cleanly separated `17` static pages (`/_not-found`, `/auth/signin`, `/forgot-password`) from dynamic SSR/API routes.
- **Webhook Raw-Body Handling:** Both `/api/webhooks/razorpay` and `/api/webhooks/shiprocket` read `await request.text()` directly before HMAC/token validation and enforce a `256 KB` payload cap — fully compatible with Vercel App Router.

---

## 2. Filesystem & Output File Tracing Findings

1. **Turbopack Bundle Tracing Warning (`MEDIUM`):**
   - `npm run qa:build` emitted: `Warning: Dynamic filesystem access causes tracing of the whole project` at `src/modules/admin/catalogue/media-storage.ts:126` (`const targetPath = path.join(this.uploadDir, filename)`).
   - **Impact:** Can bloat Vercel serverless function size by tracing `public/` and source files into Lambda bundles. Fixable later by annotating `/*turbopackIgnore: true*/` on `writeFile`/`unlink` or isolating `LocalMediaStorageProvider`.
2. **Ephemeral Filesystem Persistence (`devFileNewsletterRepository`):**
   - `src/modules/newsletter/dev-file-newsletter-repository.ts` writes to `.data/newsletter-subscribers.json` (used only when `seedDataAllowed()` is `true`).
   - In production (`NODE_ENV === "production"`), `src/modules/newsletter/actions.ts:12` throws `"Newsletter storage is not configured (Phase 4)."` and returns `"Subscriptions are temporarily unavailable. Please try again later."` — safe against silent data loss, but newsletter signups will fail until a Prisma repository is implemented.
3. **Production Media Storage:** `getMediaStorageProvider()` in `NODE_ENV === "production"` strictly selects `CloudinaryMediaStorageProvider` (never `LocalMediaStorageProvider`).

---

## 3. Vercel Cron Pipelines (`vercel.json`)

All `5` scheduled endpoints implement `GET` and `POST` handlers protected by `isAuthorizedCronRequest(request.headers.get("authorization"))` (`Bearer <CRON_SECRET>`, constant-time comparison):

| Cron Path | Schedule | Idempotency & Concurrency | Timeout Risk on Vercel |
| :--- | :--- | :--- | :--- |
| `/api/internal/notifications/process` | `*/2 * * * *` | DB outbox locking + Resend `Idempotency-Key` | Low for small batches; **no `export const maxDuration` set** (defaults to `10s` on Hobby / `15s`–`60s` on Pro) |
| `/api/internal/reservations/cleanup` | `*/5 * * * *` | Transactional expiry of stale `RESERVED` rows | Low |
| `/api/internal/shipping/sync` | `*/5 * * * *` | Tracks active shipments via Shiprocket API | Medium if many active shipments + Sydney DB RTT; consider `maxDuration = 60` on Pro |
| `/api/internal/payments/reconcile` | `*/10 * * * *` | Queries Razorpay for pending/reconcile payments | Medium if backlog grows |
| `/api/internal/media/cleanup` | `*/15 * * * *` | Processes `MediaCleanupJob` queue with retry/dead-letter | Low |
