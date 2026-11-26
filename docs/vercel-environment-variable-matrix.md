# Vercel Environment Variable Matrix (Audit 2)

**Note:** WatchStore uses Prisma directly against PostgreSQL. **`NEXT_PUBLIC_SUPABASE_URL` and Supabase publishable/anon keys are NOT used and NOT required.** Zero `NEXT_PUBLIC_*` variables are referenced in `src/` or `prisma/`.

---

## 1. Complete Variable Inventory

| Variable | Required? | Purpose | Scope | Production vs Preview |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Required (Runtime)** | Supabase Transaction Pooler (`:6543?pgbouncer=true&connection_limit=5`) | Server | Different DB/project recommended for Preview vs Production |
| `DIRECT_URL` | **Required (CLI/Migrations)** | Supabase Session Pooler (`:5432`) for `prisma migrate deploy` | Server / CLI | Different DB/project recommended for Preview vs Production |
| `AUTH_SECRET` | **Required (Runtime)** | Auth.js JWT encryption/signing secret (`>=16` chars, `openssl rand -base64 32`) | Server | Must differ between Preview and Production |
| `AUTH_URL` | **Required (Runtime)** | Canonical `https://` origin for Auth.js callbacks (`validateProductionEnv` requires `https://`) | Server | Preview URL (`https://...vercel.app`) vs Production domain (`https://...`) |
| `CRON_SECRET` | **Required (Runtime)** | Bearer token (`>=16` chars) authenticating Vercel Cron requests to `/api/internal/*` | Server | Must differ between Preview and Production |
| `CLOUDINARY_CLOUD_NAME` | **Required in Prod** | Cloudinary cloud name (`NODE_ENV=production` fails closed without it) | Server | Can share or use separate folder/env |
| `CLOUDINARY_API_KEY` | **Required in Prod** | Cloudinary API key | Server | Same or separate |
| `CLOUDINARY_API_SECRET` | **Required in Prod** | Cloudinary API secret (SHA-1 signing) | Server | Same or separate |
| `RAZORPAY_KEY_ID` | **Required for Payments** | Razorpay Key ID (`rzp_test_...` in Preview, `rzp_live_...` in Production) | Server (passed to checkout init) | **Must differ** (Test vs Live) |
| `RAZORPAY_KEY_SECRET` | **Required for Payments** | Razorpay Key Secret | Server | **Must differ** (Test vs Live) |
| `RAZORPAY_WEBHOOK_SECRET` | **Required for Webhooks** | Razorpay webhook HMAC-SHA256 secret | Server | **Must differ** per webhook endpoint |
| `RESEND_API_KEY` | **Required for Email** | Resend transactional email API key | Server | Same or separate |
| `EMAIL_FROM` | **Required for Email** | Verified sender address (e.g. `WatchStore <orders@yourdomain.com>`) | Server | Verified domain in Production |
| `GOOGLE_CLIENT_ID` | **Optional (OAuth)** | Auth.js Google OAuth Client ID (paired with `GOOGLE_CLIENT_SECRET`) | Server | Separate OAuth client or shared with Preview/Prod callback URLs |
| `GOOGLE_CLIENT_SECRET` | **Optional (OAuth)** | Auth.js Google OAuth Client Secret | Server | Paired with `GOOGLE_CLIENT_ID` |
| `SHIPROCKET_API_EMAIL` | **Required for Shipping** | Dedicated Shiprocket API user email | Server | Same or test/prod |
| `SHIPROCKET_API_PASSWORD` | **Required for Shipping** | Shiprocket API user password | Server | Same or test/prod |
| `SHIPROCKET_PICKUP_LOCATION` | **Required for Shipping** | Shiprocket pickup location name (e.g. `home`) | Server | Production warehouse name |
| `SHIPROCKET_PICKUP_PINCODE` | **Required for Shipping** | 6-digit pickup pincode (e.g. `391410`) | Server | Production warehouse pincode |
| `SHIPROCKET_WEBHOOK_TOKEN` | **Required for Shipping Webhooks** | Shared secret (`>=8` chars) in `x-api-key` header | Server | **Must differ** per webhook endpoint |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | **Optional (Sheets)** | Google service account email for `/admin/google-sheets` | Server | Same or separate |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | **Optional (Sheets)** | Service account PEM private key | Server | Same or separate |
| `SHIPROCKET_CRON_SECRET` | **Legacy / Unused** | Present in `.env.example` & `env.ts`; cron routes use `CRON_SECRET` instead | Server | Omit in Vercel |
| `CATALOGUE_SOURCE` | **NEVER SET in Prod/Preview** | Local QA flag (`seed` forces dev fixture catalogue) | Server | **Must be unset** |
| `SHOW_PLACEHOLDER_CLAIMS` | **NEVER SET in Prod/Preview** | Local QA flag (`true` shows placeholder marketing claims) | Server | **Must be unset** |
| `ALLOW_UNPROTECTED_ADMIN_PREVIEW` | **NEVER SET in Prod/Preview** | Legacy QA preview flag in `.env.example` | Server | **Must be unset** |
| `ADMIN_PROVISION_*` | **CLI Only** | Used only by `prisma/create-admin.ts` | CLI | **Do not set** in Vercel |
| `LOCAL_SOURCE_DATABASE_URL` | **CLI Only** | Used only by `src/scripts/migrate-local-to-supabase/` | CLI | **Do not set** in Vercel |

---

## 2. Environment Validation Gaps (`validateProductionEnv()` vs Actual App)

1. **`validateProductionEnv()` is never invoked at runtime:** Defined in `src/config/env.ts:131`, it is currently only called in `tests/unit/phase-17-hardening.test.ts` (not in `src/instrumentation.ts` or root layout).
2. **Optional vs Commercial-Required Mismatch:** `validateProductionEnv()` only enforces `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `AUTH_URL` (`https://`), and paired provider keys. It does **not** require `CLOUDINARY_*`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`/`EMAIL_FROM`, or `SHIPROCKET_WEBHOOK_TOKEN` if omitted completely.
3. **Build-Time vs Runtime:** `next build` (`NEXT_PHASE === "phase-production-build"`) does **not** require runtime secrets (`validateProductionEnv()` explicitly skips build phase). All secrets are runtime-only.
4. **`.env.example` Coverage:** All runtime variables are documented in `.env.example`; `LOCAL_SOURCE_DATABASE_URL` (migration script only) and `ADMIN_PROVISION_ROLE` (CLI only) are omitted from `.env.example`, which is acceptable.
