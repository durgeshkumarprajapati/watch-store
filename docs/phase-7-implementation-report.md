# Phase 7 — Customer Authentication & Account Implementation Report

See [`docs/phase-7-audit.md`](./phase-7-audit.md) for the initial audit and [`docs/phase-7-authentication-setup.md`](./phase-7-authentication-setup.md) for setup instructions.

## Summary
- **Auth.js v5 + Prisma**: Added `next-auth@beta`, `@auth/prisma-adapter`, and `argon2`; applied additive migration [`0003_phase7_customer_auth`](../prisma/migrations/0003_phase7_customer_auth/migration.sql) to `watchstore_db` (`User`, `Account`, `Session`, `VerificationToken`, `AuthActionToken`, and `Customer.authUserId` relation).
- **Security**: Argon2id password hashing, SHA-256 hashed one-time verification/reset tokens, sliding-window rate limiting (`src/lib/rate-limit.ts`), verified-only Google OAuth linking, and `sessionVersion` invalidation on password reset/change.
- **Guest Checkout & Account Association**: Preserved guest checkout and `orderAccessToken` confirmation links; `linkVerifiedUserToCustomerInTx` links `Customer` and unlinked guest orders only after verified email ownership.
- **Account Management**: Implemented `/account`, `/account/profile`, `/account/addresses`, `/account/orders`, `/account/orders/[orderId]`, and `/account/security` with strict server-side `customerId` ownership checks.
- **Visual QA**: **PENDING** (browser-based screenshot comparison against Stitch HTML/PDF was not executed in this environment).
