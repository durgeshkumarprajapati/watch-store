# Phase 7 — Customer Authentication & Account Audit

## 1. Existing Architecture & Findings
Inspected [`prisma/schema.prisma`](../prisma/schema.prisma), [`src/app/(store)/account/page.tsx`](../src/app/(store)/account/page.tsx), [`src/app/auth/signin/page.tsx`](../src/app/auth/signin/page.tsx), [`src/modules/checkout/persistent-order-service.ts`](../src/modules/checkout/persistent-order-service.ts), and [`src/config/env.ts`](../src/config/env.ts):
1. **Auth.js**: Not yet installed (`package.json` has no `next-auth` or `@auth/prisma-adapter`).
2. **Customer model**: `Customer` (`id`, `email @unique`, `fullName`, `phone`, `authUserId String? @unique`) already exists with `addresses CustomerAddress[]` and `orders Order[]`.
3. **Guest checkout**: `createPersistentOrder` upserts `Customer` by normalized `email` (`authUserId` remains `null`), stores `guestEmail`/`guestName`/`guestPhone` on `Order`, and creates immutable `OrderAddressSnapshot` and `OrderItem` snapshots.
4. **Guest order access**: Protected via HMAC-signed `orderAccessToken` (`orderNumber` + `guestEmail`) on `/checkout/confirmation`.
5. **Authentication gaps**: No `User`, `Account`, `VerificationToken`, password hashing, email verification, password reset, login/registration pages, protected `/account/*` routes, or Resend email integration exist yet.

## 2. Required Additive Schema Changes
Create additive migration `0003_phase7_customer_auth`:
- `User`: `id`, `name`, `email @unique`, `emailVerified DateTime?`, `image`, `passwordHash`, `sessionVersion Int @default(1)`, `createdAt`, `updatedAt`.
- `Account` (Auth.js OAuth): `provider`, `providerAccountId` (`@@id([provider, providerAccountId])`), FK to `User`.
- `AuthActionToken`: `id`, `userId` (FK -> `User`), `type` (`EMAIL_VERIFICATION | PASSWORD_RESET | EMAIL_CHANGE`), `tokenHash @unique`, `targetEmail?`, `expiresAt`, `usedAt?`, `createdAt`.
- `Customer.authUserId` links to `User.id` (`@unique`, `onDelete: SetNull`) so existing guest `Customer` and `Order` records remain intact.

## 3. Proposed Authentication & Account Plan
- **Auth.js v5 (`next-auth`)** with `PrismaAdapter`, `Google` provider, and `Credentials` provider (Argon2id password verification + email-verified check + `sessionVersion` check in `jwt`/`session` callbacks so password resets invalidate existing sessions).
- **Email Service**: Modular Resend REST client (`src/modules/notifications/email-service.ts`) that fails honestly when `RESEND_API_KEY` is unconfigured.
- **Guest-to-Account Association**: Only upon **verified** email ownership (email verification token or verified Google OAuth), link `Customer` (where `email` matches and `authUserId` is `null`) to `User.id` inside a transaction.
- **Account Routes**: `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account`, `/account/profile`, `/account/addresses`, `/account/orders`, `/account/orders/[orderId]`, `/account/security` — every server action & page independently enforces `requireAuthenticatedCustomer()`.
