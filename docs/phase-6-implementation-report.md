# Phase 6 — Razorpay Payment Gateway Implementation Report

See [`docs/phase-6-audit.md`](./phase-6-audit.md) for the initial repository audit and [`docs/phase-6-razorpay-setup.md`](./phase-6-razorpay-setup.md) for Razorpay test-mode setup.

## Summary
- **Database**: Additive migration [`0002_phase6_razorpay_payments`](../prisma/migrations/0002_phase6_razorpay_payments/migration.sql) applied to `watchstore_db`, adding `RazorpayWebhookEvent` and extending `Payment` / `PaymentAttempt` with `attemptNumber`, `razorpayOrderId`, `razorpayPaymentId`, `verifiedAt`, `capturedAt`, and `gatewayMetadata`.
- **Razorpay Client & Security**: Server-only REST client (`src/modules/payments/infrastructure/razorpay-client.ts`) with Basic Auth, `10s` timeout, and Zod response validation; constant-time HMAC SHA-256 verification (`razorpay-signature.ts`) for Checkout callbacks, raw-body webhooks, and `orderAccessToken`.
- **Lifecycle & Idempotency**: `initiateRazorpayPayment` reconciles existing gateway orders before retry; `verifyRazorpayCheckoutPayment` & `processRazorpayWebhook` share `markPaymentCapturedInTx` so inventory is committed **exactly once** and late captures after reservation expiry are flagged `needsReconciliation` rather than silently committing unavailable stock.
- **Visual QA**: **PENDING** (browser-based screenshot comparison was not run in this environment).
