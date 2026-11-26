# Phase 17 — Production Operations Runbook

- **Health Check**: Monitor `GET /api/health` (`200` expected, `503` indicates DB connectivity failure).
- **Operations Console**: Authorized admins (`operations.read`, `operations.manage`) monitor `SchedulerRun`, expired reservations, `ShippingJob` / `NotificationJob` / `MediaCleanupJob` dead-letters, and Razorpay/Shiprocket reconciliation at `/admin/operations`.
- **Cloudinary Migration**: After configuring `CLOUDINARY_*` in production, run `npx tsx --env-file=.env scripts/migrate-product-media.ts --dry-run` and then `--execute` while preserving local originals until verified.
