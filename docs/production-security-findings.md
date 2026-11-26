# Production Security Findings (Audit 6)

---

## 1. Authentication, Sessions & Cookies

- **Auth.js (`src/modules/auth/auth.ts`):**
  - `trustHost: true` (required for Vercel reverse proxy).
  - `strategy: "jwt"`, `maxAge: 7 days`.
  - `secret`: reads `env.AUTH_SECRET` (no insecure fallback in `NODE_ENV === "production"`).
  - `jwt` callback validates `sessionVersion` and `emailVerified` against PostgreSQL on every check so password resets invalidate active sessions.
  - Google OAuth (`allowDangerousEmailAccountLinking: false`) verifies `profile.email_verified === true` and refuses linking to unverified password accounts.
  - **Callback URL Requirement:** Google Cloud Console must register `https://<production-domain>/api/auth/callback/google` (and preview URLs if tested on Preview).
- **Admin RBAC (`src/modules/admin/admin-auth-service.ts`):**
  - `requireAuthenticatedAdmin()`, `requireAdminPermission()`, `requireSuperAdmin()`, and `*Action*` variants enforce DB-backed `AdminUser.isActive`, `emailVerified`, and `AdminRolePermission` checks on every page and server action.
  - `ALLOW_UNPROTECTED_ADMIN_PREVIEW` is not referenced in `admin-auth-service.ts` (must remain unset).

---

## 2. Security Headers, Webhooks & Cron Auth

- **Security Headers (`next.config.ts`):** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `poweredByHeader: false`, plus `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` in `NODE_ENV === "production"`.
- **Webhooks:**
  - Razorpay: `timingSafeEqual` HMAC-SHA256 verification on raw body (`256 KB` cap), `RazorpayWebhookEvent` deduplication.
  - Shiprocket: `timingSafeEqual` comparison on `x-api-key` (`256 KB` cap), `ShippingWebhookEvent` deduplication.
- **Cron Auth:** `isAuthorizedCronRequest` uses `timingSafeEqual` against `CRON_SECRET` (`>=16` chars).

---

## 3. Security Findings & Risks

| Severity | Finding | Location | Impact & Recommendation |
| :--- | :--- | :--- | :--- |
| **MEDIUM** | **In-Memory Rate Limiter on Serverless** | `src/lib/rate-limit.ts` | Uses `new Map<string, number[]>()`. On Vercel, cold starts and parallel Lambda instances do not share memory, so brute-force protection on `login`, `admin-login`, `register`, `reset`, and `media-upload` is per-instance only. Replace with Upstash Redis / Vercel KV or DB-backed rate limiting before commercial scale. |
| **LOW** | **`validateProductionEnv()` Not Invoked at Startup** | `src/config/env.ts:131` | Exists and is unit-tested, but is not wired into `src/instrumentation.ts`, so missing optional-paired/production vars fail lazily on first route call instead of at boot. |
| **LOW** | **Error Message Hygiene** | `/api/admin/catalogue/upload/route.ts:86` | Generic `catch` returns `error.message` on `400` responses; ensure internal provider/DB errors are not surfaced verbatim to clients. |
