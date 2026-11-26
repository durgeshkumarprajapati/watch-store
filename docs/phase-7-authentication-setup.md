# Phase 7 — Customer Authentication & Email Setup Guide

## 1. Auth.js Configuration
WatchStore uses **Auth.js v5 (`next-auth`)** with `@auth/prisma-adapter`, Argon2id password hashing, and JWT sessions with DB-checked `sessionVersion` invalidation.

Generate `AUTH_SECRET`:
```bash
openssl rand -base64 32
```

Add to `.env` / `.env.local`:
```env
AUTH_SECRET="your_generated_32_byte_secret"
AUTH_URL="http://localhost:3000"
```

## 2. Google OAuth Setup
1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add **Authorized redirect URI**:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://<your-domain>/api/auth/callback/google`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

## 3. Resend Transactional Email Setup
1. Create an API key in [Resend](https://resend.com/) and verify your sending domain.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` in `.env`.
   - When `RESEND_API_KEY` is unset in local development, registration/reset actions skip email delivery and surface a `devUrl` link in development mode only.

## 4. Database Migration
```bash
npm run db:deploy
npm run db:generate
```

## 5. Testing Flows Locally
- **Register**: `/register` → submit details → open verification link (`/verify-email?token=...`).
- **Login**: `/login` → sign in with verified email/password or Google.
- **Password Reset**: `/forgot-password` → open `/reset-password?token=...` → set new password (invalidates prior sessions via `sessionVersion`).
- **Account**: `/account`, `/account/orders`, `/account/profile`, `/account/addresses`, `/account/security`.
