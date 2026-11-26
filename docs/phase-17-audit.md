# Phase 17 — Production Readiness Audit Report (WatchStore)

**Status:** Stage A Complete — Awaiting Approval (No application code, schema, migrations, `.env`, or deployment config modified)

---

## 1. Executive Summary
WatchStore's core e-commerce, RBAC, payment, shipping, notification, Google Sheets, Cloudinary, and operational scheduling modules (Phases 1–16) are implemented and pass local automated checks. Before production launch on **Vercel Pro + Supabase Pro**, key hardening gaps remain: HTTP security headers (`next.config.ts`), a `/api/health` readiness endpoint, strict production environment validation (`assertProductionEnv()`), production seed protection (`prisma/seed.ts`), a GitHub Actions CI/CD pipeline (`.github/workflows/ci.yml`), and external credential/webhook/migration execution.

## 2. Architecture and Hosting Assessment
- **Vercel Pro + Supabase Pro Compatibility**: `IMPLEMENTED`. Next.js 16.4.6 (`package.json`, Node `>=20.9`), React 19, Prisma `6.19.3` (`directUrl = env("DIRECT_URL")` in `prisma/schema.prisma`), and `vercel.json` Cron (`*/2` to `*/15` min bounded batches) align with serverless execution.
- **Gap**: `next.config.ts` sets `allowedDevOrigins: ["*.trycloudflare.com", ...]` and `images.remotePatterns` (`res.cloudinary.com`), but defines no HTTP security headers (`MISSING`).

## 3. Supabase Database Readiness
- **Connection Pooling**: `prisma/schema.prisma` configures `url = env("DATABASE_URL")` (PgBouncer pooled) and `directUrl = env("DIRECT_URL")` (direct session for `prisma migrate deploy`) (`IMPLEMENTED`).
- **Prisma Singleton**: `src/lib/prisma.ts` reuses `globalThis.__watchStorePrisma` and logs `["error"]` in production (`IMPLEMENTED`).
- **Gap**: No `/api/health` database connectivity check (`SELECT 1`) for Vercel/uptime probes (`MISSING`).

## 4. Migration Safety
- `13` additive migrations (`0001_init` through `0013_phase16_operations`) in `prisma/migrations/` deploy cleanly without `db push` or destructive resets (`IMPLEMENTED`).
- **Gap**: `prisma/seed.ts` (`npm run db:seed`) can overwrite `Brand`, `Category`, and `Product` rows if accidentally invoked in `NODE_ENV === "production"` (`PARTIALLY IMPLEMENTED` — needs `ALLOW_PRODUCTION_SEED=true` guard).

## 5. Backup and Recovery Assessment
- **Status**: `NEEDS VERIFICATION` / `MISSING` documentation. Supabase Pro provides daily automated backups and Point-in-Time Recovery (PITR), which must be enabled in Supabase Dashboard and restore-tested before launch. Additive forward-fix migrations are required during Vercel application rollbacks.

## 6. Environment Variable Inventory
| Variable | Required in Prod | Scope | Consumer | Present in Local `.env` |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Required | Server | `src/config/env.ts` | Yes (runtime) |
| `DATABASE_URL` | Required | Server | `prisma/schema.prisma`, `src/lib/prisma.ts` | `true` |
| `DIRECT_URL` | Required (migrations) | Server | `prisma/schema.prisma` | `true` |
| `AUTH_SECRET` | Required | Server | `src/modules/auth/auth.ts` | `false` (**BLOCKER** for prod) |
| `AUTH_URL` | Required | Server | `src/modules/auth/auth.ts`, `auth-service.ts` | `true` (`localhost:3000`) |
| `CRON_SECRET` | Required | Server | `src/modules/operations/scheduler-auth.ts` | `false` (**BLOCKER** for prod) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Required | Server | `src/modules/payments/*` | `true` |
| `SHIPROCKET_API_EMAIL`, `SHIPROCKET_API_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN` | Required for shipping | Server | `src/modules/shipping/*` | `false` (**PENDING**) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Required for email | Server | `src/modules/notifications/email-service.ts` | `RESEND_API_KEY: false` (**PENDING**) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Required | Server | `src/modules/admin/catalogue/cloudinary-media-storage.ts` | `true` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Optional (Sheets sync) | Server | `src/modules/admin/catalogue-sync/google-sheets-client.ts` | `true` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional (OAuth) | Server | `src/modules/auth/auth.ts` | `false` |

- **Problem (`src/config/env.ts`)**: `assertProductionEnv()` does not exist to fail fast when `NODE_ENV === "production"` is missing `AUTH_SECRET` or `CRON_SECRET` (`PARTIALLY IMPLEMENTED`, Medium risk).

## 7. Cloudinary Readiness
- Fail-closed production selection (`NODE_ENV === "production"` never falls back to local disk), magic-byte validation, 5 MB limit, `MediaCleanupJob`, and `MediaImage` compatibility are `IMPLEMENTED`.
- Local `.env` has `CLOUDINARY_*` set, and `--dry-run` on `watchstore_db` reports `12` eligible product images (`DRY_RUN_READY`), while actual `--execute` migration + remote asset verification remain `PENDING`.

## 8. Razorpay Readiness
- Server-side amount calculation, HMAC-SHA256 signature & webhook verification, `RazorpayWebhookEvent` deduplication, `markPaymentCapturedInTx`, and `reconcilePendingPayments` (zero automatic refunds) are `IMPLEMENTED`. Live production keys & webhook URL registration in Razorpay Dashboard are `PENDING`.

## 9. Shiprocket Readiness
- Encrypted token storage, `reconcileShipment`, `syncShipmentTracking`, `ShippingJob` (`FOR UPDATE SKIP LOCKED`), and `x-api-key` webhook verification are `IMPLEMENTED`. Live Shiprocket credentials & webhook registration are `PENDING`.

## 10. Authentication and Security Assessment
- **Customer & Admin Auth**: Argon2id hashing, `sessionVersion` invalidation, RBAC (`37` permissions, `6` roles), last-`SUPER_ADMIN` guard, and `AdminAuditLog` are `IMPLEMENTED`.
- **Security Headers (`next.config.ts`)**: `MISSING` (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`).
- **Rate Limiting (`src/lib/rate-limit.ts`)**: In-memory sliding window (`PARTIALLY IMPLEMENTED` — acceptable for single-instance/burst protection, noted as serverless per-isolate limitation).

## 11. API Security Assessment
- Checkout, payment verification, Razorpay/Shiprocket webhooks, `/api/admin/catalogue/upload`, and `/api/internal/*` routes enforce Zod validation, auth/HMAC/`timingSafeEqual`, and sanitized errors (`IMPLEMENTED`).
- **Gap**: No `/api/health` route (`MISSING`).

## 12. Scheduler Readiness
- `vercel.json` defines all 5 Cron routes (`*/2`, `*/5`, `*/10`, `*/15`), using `GET`/`POST` and `CRON_SECRET` + `SchedulerRun` (`IMPLEMENTED`). Live Vercel Cron execution is `NEEDS VERIFICATION` post-deploy.

## 13. Performance Assessment
- Server Components, Prisma pagination, `next/image` (`MediaImage`) with `res.cloudinary.com`, and bounded cron batches (`10`–`50`) are `IMPLEMENTED`. No unsafe price/stock caching is present.

## 14. Monitoring Assessment
- `/admin/operations`, `SchedulerRun`, and structured JSON logs are `IMPLEMENTED`. External APM (e.g., Sentry) is `NOT APPLICABLE` unless approved separately (Vercel Logs + `/admin/operations` suffice without adding paid dependencies).

## 15. CI/CD Assessment
- **Status**: `MISSING`. No `.github/workflows/ci.yml` exists to run `typecheck`, `lint`, `npm test`, `prisma validate`, and `build` automatically on push/PR without exposing production secrets.

## 16. Deployment and Rollback Strategy
- Additive forward-only migrations (`0001`–`0013`), pre-deploy `prisma migrate deploy`, Vercel application rollback with backward-compatible schema, and Supabase PITR backup restore procedure (`MISSING` documentation — to be created in Stage B).

## 17. Dependency Security Assessment
- `npm audit --omit=dev --summary` reports `4 high severity vulnerabilities` in `prisma` (`6.13.0-dev.1 - 7.10.0`) / `effect` (`<=3.22.0` ReDoS). Fixing requires a breaking major upgrade to `prisma@7.10.1`; do **NOT** auto-upgrade in Phase 17 (`NEEDS VERIFICATION` / accepted CLI-only risk).

## 18. Existing Technical Debt
- `tests/integration/admin-media-db.test.ts:28` has 1 unused-import ESLint warning (`updateAdminCategory`).
- Turbopack build emits 1 dynamic-filesystem tracing note in `media-storage.ts` (`LocalMediaStorageProvider.saveProductImage`).

## 19. Proposed Stage B Implementation Changes
1. Add HTTP security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`) and `poweredByHeader: false` in `next.config.ts`.
2. Add `/api/health` (`src/app/api/health/route.ts`) performing a lightweight `SELECT 1` DB check with `503` on failure and zero secret exposure.
3. Add `validateProductionEnv()` in `src/config/env.ts` (enforcing `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET` when `NODE_ENV === "production"` at runtime, without blocking `next build`).
4. Add production guard in `prisma/seed.ts` (`NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true"` refuses to overwrite live catalogue).
5. Add `.github/workflows/ci.yml` running `typecheck`, `lint`, `npm test`, `npx prisma validate`, and `npm run build` (no production secrets, no auto-migrate on PR).
6. Clean up unused import in `tests/integration/admin-media-db.test.ts` and add `tests/unit/phase-17-hardening.test.ts` (testing `validateProductionEnv`, `/api/health` response shape, and security headers config).
7. Write all required `docs/phase-17-*.md` production deployment, Supabase, Vercel, security, backup/recovery, CI/CD, rollback, and operations runbooks.

## 20. Production Blockers (External Configuration Required Before Go-Live)
1. `AUTH_SECRET` and `CRON_SECRET` not yet set for production.
2. `SHIPROCKET_*` and `RESEND_API_KEY` not yet configured in `.env` / Vercel.
3. Supabase Pro database, PITR backups, Vercel Pro project, domain/SSL, and live webhook URLs not yet provisioned.
4. Cloudinary product image migration (`--execute`) not yet executed against live Cloudinary.

## 21. Phase 17 Acceptance Criteria
- Security headers, `/api/health`, `validateProductionEnv()`, production seed guard, and `.github/workflows/ci.yml` implemented and tested.
- `prisma validate`, `db:generate`, `typecheck`, `lint` (`0` warnings), `npm test`, `npm run test:db`, and `npm run qa:build` all pass.
- Complete Phase 17 deployment & operations documentation created; external deployment/credentials remain clearly marked `PENDING`.
