# Phase 16 — Razorpay Payment Reconciliation

Implemented in [payment-reconciliation-service.ts](file:///home/ppsd-021/watch-store/src/modules/payments/application/payment-reconciliation-service.ts):
1. Scans `RAZORPAY` `Payment` records that are `needsReconciliation = true` or stale (`PENDING`, `REQUIRES_GATEWAY`, `AUTHORIZED`).
2. Fetches authoritative state via `RazorpayClient.fetchOrderPayments` / `fetchPayment`.
3. **Captured (`captured = true`)**: Matches `PaymentAttempt` and settles atomically via `markPaymentCapturedInTx` (verifying `amountPaise` and `currency`). If reservations already expired, records `PAID` and flags `needsReconciliation = true` for manual stock review.
4. **Authorized Only**: Marks `AUTHORIZED`, sets `needsReconciliation = true` — **never** fabricates captures or automatic refunds.
5. **Failed**: Marks `FAILED` via `markPaymentFailedInTx`.
6. **Provider Timeout / Error**: Sets `needsReconciliation = true` and `lastReconciledAt` with a sanitized note.
