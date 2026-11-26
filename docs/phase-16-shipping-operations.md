# Phase 16 — Shiprocket Shipping Operations

- `enqueueActiveShipmentSyncs` in [shipping-job-service.ts](file:///home/ppsd-021/watch-store/src/modules/shipping/application/shipping-job-service.ts) periodically enqueues idempotent `RECONCILE_SHIPMENT` jobs (for `reconciliationRequired = true`) and `TRACKING_SYNC` jobs (for active AWB shipments not synced in the last 15 minutes).
- `processNextShippingJob` claims jobs atomically with `FOR UPDATE SKIP LOCKED`, 2-minute leases, exponential backoff, and `DEAD_LETTER` exhaustion.
- `reconcileShipment` and `syncShipmentTracking` never overwrite newer shipment states or mutate `Payment` / `ProductStock`.
