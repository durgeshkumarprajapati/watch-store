# Phase 16 — Operations Monitoring (`/admin/operations`)

- Route: `/admin/operations` ([page.tsx](file:///home/ppsd-021/watch-store/src/app/admin/%28protected%29/operations/page.tsx), [operations-console.tsx](file:///home/ppsd-021/watch-store/src/components/admin/operations/operations-console.tsx)).
- Protected by `operations.read` (view) and `operations.manage` (manual triggers, payment reconciliation, media cleanup retries).
- Displays expired reservation backlog, `ShippingJob` / `NotificationJob` / `MediaCleanupJob` failed & `DEAD_LETTER` queues, Razorpay & Shiprocket reconciliation queues, and `SchedulerRun` execution history.
- Every manual admin trigger/retry is recorded in `AdminAuditLog`.
