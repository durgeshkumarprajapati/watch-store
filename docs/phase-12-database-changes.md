# Phase 12 — Database Changes

## Migration: `0008_phase12_shiprocket_shipping`

Applied additively via `npm run db:deploy` without resetting or dropping any tables.

### 1. New Enums
- `ShippingProvider`: `MANUAL`, `SHIPROCKET`
- `ShipmentStatus`: `PENDING`, `SERVICEABILITY_CHECKED`, `SHIPMENT_CREATED`, `AWB_ASSIGNED`, `PICKUP_SCHEDULED`, `PICKUP_COMPLETED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `RTO_INITIATED`, `RTO_DELIVERED`, `CANCELLED`, `FAILED`, `RECONCILIATION_REQUIRED`
- `ShippingJobType`: `TRACKING_SYNC`, `WEBHOOK_PROCESS`, `RECONCILE_SHIPMENT`
- `ShippingJobStatus`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `DEAD_LETTER`

### 2. New Models
- **`ShiprocketAuthToken`**: Server-only AES-256-GCM encrypted token cache (`id`, `encryptedToken`, `expiresAt`, `updatedAt`).
- **`Shipment`**: `orderId` (non-unique FK to `Order`, enforcing at most 1 active non-cancelled/non-failed shipment per order under `Order` `FOR UPDATE` lock so cancelled unpicked shipments can be re-booked; partial/multi-package shipments are intentionally excluded in Phase 12), unique `shiprocketOrderId`, `shiprocketShipmentId`, `awbCode`, `idempotencyKey`.
- **`ShipmentStatusHistory`**: Immutable carrier/admin timeline with `dedupeKey @unique`.
- **`ShippingWebhookEvent`**: Durable webhook log with `dedupeKey @unique`, `processedAt`, `attempts`, `lastError`.
- **`ShippingJob`**: PostgreSQL-backed durable job table with `attempts`, `maxAttempts`, `nextRunAt`, `lockedUntil`, `lockedBy`, `idempotencyKey @unique`.
