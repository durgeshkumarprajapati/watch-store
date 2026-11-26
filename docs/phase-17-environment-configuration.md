# Phase 17 — Environment Configuration

## Mandatory Production Runtime Variables (`validateProductionEnv`)
- `NODE_ENV=production`
- `DATABASE_URL` (Supabase PgBouncer pooled PostgreSQL URL)
- `AUTH_SECRET` (minimum 16 chars; 32+ random bytes recommended)
- `AUTH_URL` (`https://` production origin)
- `CRON_SECRET` (minimum 16 chars; dedicated Vercel Cron Bearer secret)

## Migration-Only Variable
- `DIRECT_URL` (required when running `npm run db:deploy`, not required for normal Next.js runtime)

## Provider Variables
- **Razorpay**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- **Shiprocket**: `SHIPROCKET_API_EMAIL`, `SHIPROCKET_API_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN`
- **Cloudinary**: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (required in production; fail-closed)
- **Resend**: `RESEND_API_KEY`, `EMAIL_FROM`
- **Google Sheets**: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- **Google OAuth (optional)**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

`validateProductionEnv()` skips enforcement during `next build` (`NEXT_PHASE === "phase-production-build"`) and never logs secret values.
