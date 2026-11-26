# Phase 12 — Repository Audit & Shiprocket Architecture Plan

## 1. Existing Architecture Relevant to Shipping

Inspected `prisma/schema.prisma`, `package.json`, `src/config/env.ts`, `.env.example`, `src/app/api/webhooks/razorpay/route.ts`, `src/modules/admin/orders/`, `src/modules/admin/rbac-catalogue.ts`, `src/modules/customers/customer-service.ts`, and `src/app/(store)/account/orders/[orderId]/page.tsx`.

- **Order & Fulfilment Models (`Order`, `OrderItem`, `OrderAddressSnapshot`, `OrderStatusHistory`)**:
  - `OrderStatus`: `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`.
  - `FulfilmentStatus` (added in Phase 11): `AWAITING_PACKING`, `PACKED`, `DISPATCHED`, `DELIVERED`, `CANCELLED`.
  - Manual shipment fields already on `Order`: `carrierName`, `trackingNumber`, `trackingUrl`, `shipmentReference`, `shippingNotes`, `shippedAt`, `deliveredAt`.
- **Payment & Inventory Separation**:
  - `Payment` (`RAZORPAY` / `COD`) and `InventoryReservation` (`RESERVED` -> `COMMITTED` / `RELEASED` / `EXPIRED`) are authoritative in PostgreSQL.
  - Shipping events must **never** alter `Payment.status`, initiate refunds, or restore committed inventory.

## 2. Existing Webhook & Background Job Infrastructure

- **Webhooks**: `src/app/api/webhooks/razorpay/route.ts` enforces a 256 KB body limit, authenticates headers, persists `RazorpayWebhookEvent` before processing, and processes idempotently.
- **Background Jobs**: No durable job queue or cron worker exists yet in `src/modules/`. Because target production hosting is Vercel Pro + Supabase PostgreSQL (serverless execution), in-memory timers/queues (`setTimeout`, unawaited promises) cannot be relied upon. A PostgreSQL-backed durable `ShippingJob` table (with `status`, `attempts`, `maxAttempts`, `nextRunAt`, `lastError`) executable via an authenticated cron/worker endpoint and manual admin retry is required.

## 3. Existing RBAC Permissions

`src/modules/admin/rbac-catalogue.ts` currently defines `orders.read`, `orders.update`, and `orders.cancel` (25 total permissions).
- Proposed Phase 12 permissions: `shipments.read`, `shipments.manage`, `shipments.cancel`, `shipments.retry` (assigned to `SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`; `shipments.read` also to `CUSTOMER_SUPPORT`).

## 4. Official Shiprocket API v2 Integration Reference (`apiv2.shiprocket.in/v1/external`)

- **Auth**: `POST /auth/login` returns a Bearer token valid for 240 hours (10 days). Store/lock token in PostgreSQL (`ShiprocketTokenCache` or server-only DB table) to prevent concurrent refresh races across serverless instances.
- **Serviceability**: `GET /courier/serviceability/` (`pickup_postcode`, `delivery_postcode`, `weight`, `cod`).
- **Create Adhoc Order**: `POST /orders/create/adhoc` -> returns `order_id`, `shipment_id`.
- **Assign AWB**: `POST /courier/assign/awb` -> returns `awb_code`, `courier_name`.
- **Generate Label**: `POST /courier/generate/label` -> returns downloadable label URL.
- **Schedule Pickup**: `POST /courier/generate/pickup`.
- **Track by AWB**: `GET /courier/track/awb/{awb_code}`.
- **Cancel**: `POST /orders/cancel` / `POST /orders/cancel/shipment/awbs`.
- **Webhooks**: Shiprocket uses a configured shared secret token in the `x-api-key` header (verified via timing-safe comparison against `SHIPROCKET_WEBHOOK_TOKEN`), not an HMAC payload signature. Events will be persisted in `ShippingWebhookEvent` with a deterministic deduplication key before processing.

## 5. Proposed Database Changes (Additive Migration `0008_phase12_shiprocket_shipping`)

1. **`ShippingProvider` enum**: `MANUAL`, `SHIPROCKET`.
2. **`ShipmentStatus` enum**: `PENDING`, `SERVICEABILITY_CHECKED`, `SHIPMENT_CREATED`, `AWB_ASSIGNED`, `PICKUP_SCHEDULED`, `PICKUP_COMPLETED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `RTO_INITIATED`, `RTO_DELIVERED`, `CANCELLED`, `FAILED`, `RECONCILIATION_REQUIRED`.
3. **`Shipment` model**: `id`, `orderId (@unique)`, `provider`, `isManual`, `status`, `shiprocketOrderId (@unique)`, `shiprocketShipmentId (@unique)`, `awbCode (@unique)`, `courierId`, `courierName`, `trackingUrl`, `labelUrl`, `pickupScheduledAt`, `pickupReference`, `weightKg`, `lengthCm`, `breadthCm`, `heightCm`, `lastSyncedAt`, `lastProviderStatus`, `reconciliationRequired`, `lastError`, `cancelledAt`, `cancellationReason`, `idempotencyKey (@unique)`, `createdAt`, `updatedAt`.
4. **`ShipmentStatusHistory` model**: Immutable timeline (`shipmentId`, `fromStatus`, `toStatus`, `providerStatus`, `location`, `note`, `actorAdminId`, `dedupeKey (@unique)`, `eventAt`, `createdAt`).
5. **`ShippingWebhookEvent` model**: Durable inbound webhook persistence (`dedupeKey (@unique)`, `awbCode`, `shiprocketOrderId`, `eventStatus`, `payload`, `processedAt`, `attempts`, `lastError`, `createdAt`).
6. **`ShippingJob` model**: Durable retry/sync job table (`jobType`, `shipmentId`, `status`, `attempts`, `maxAttempts`, `nextRunAt`, `lockedAt`, `lastError`, `idempotencyKey (@unique)`).
7. **`ShiprocketAuthToken` model**: Server-only token cache (`id`, `token`, `expiresAt`, `updatedAt`).

## 6. Proposed Module Structure (`src/modules/shipping/`)

- `infrastructure/shiprocket-client.ts` (Zod-validated HTTP client, timeouts, sanitized logging)
- `infrastructure/shiprocket-auth-service.ts` (DB-locked 240h token management)
- `domain/shipment-state-machine.ts` (strict transitions & provider status normalization)
- `application/shipping-serviceability-service.ts`
- `application/shipment-creation-service.ts` (idempotent + timeout reconciliation)
- `application/shipment-fulfilment-service.ts` (AWB, label, pickup, cancellation, manual fallback)
- `application/tracking-sync-service.ts` (polling + shared normalization)
- `application/shipping-webhook-service.ts` (`x-api-key` verification, persistence, deduplication)
- `application/shipping-job-service.ts` (durable retries with exponential backoff)
- `presentation/shipping-actions.ts` & Admin/Customer UI (`/admin/shipments`, `/admin/shipments/[shipmentId]`, `/admin/orders/[orderId]`, `/account/orders/[orderId]`).

## 7. Risks & Backward Compatibility

- **Manual fallback**: Orders without Shiprocket credentials or manually managed orders continue using `MANUAL` mode without breaking Phase 11 workflows.
- **No automatic payment/inventory side-effects**: Shipment webhooks/RTO/delivery events never mark Razorpay orders paid, issue refunds, or restore committed stock.

## 8. Implementation & Test Plan

- **Phase 12a**: Additive migration `0008_phase12_shiprocket_shipping`, `.env.example` placeholders, `src/config/env.ts` optional Shiprocket vars, RBAC permissions.
- **Phase 12b**: Shiprocket client, token service, shipment state machine, creation/AWB/label/pickup/cancel/tracking/webhook/job services, manual fallback integration.
- **Phase 12c**: Admin `/admin/shipments`, `/admin/shipments/[shipmentId]`, `/admin/orders/[orderId]` shipping panel, customer `/account/orders/[orderId]` tracking timeline.
- **Phase 12d**: Comprehensive unit tests (mocked Shiprocket API), PostgreSQL integration & concurrency tests against `watchstore_db`, Phase 5–11 regression suite, typecheck, lint, clean production build, and Phase 12 documentation.
