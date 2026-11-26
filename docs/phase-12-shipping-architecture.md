# Phase 12 — Shipping Architecture

- **Provider Boundary**: `ShiprocketClient` (`src/modules/shipping/infrastructure/shiprocket-client.ts`) isolates HTTP calls, Zod response validation, and 12s timeouts behind an interface.
- **Encrypted Token Cache**: `getShiprocketAuthToken` locks `ShiprocketAuthToken` via `FOR UPDATE`, decrypts/encrypts using AES-256-GCM (`token-crypto.ts`), and refreshes before Shiprocket's 240h expiry.
- **Single Active Shipment Policy**: An order may have historical `CANCELLED`/`FAILED` shipments and at most one active shipment. Partial/multi-package shipments are intentionally excluded in Phase 12.
- **Manual Fallback**: `createManualShipmentRecord` supports external/manual carriers without Shiprocket credentials.
- **Durable Serverless Jobs**: `ShippingJob` uses `FOR UPDATE SKIP LOCKED` with a 2-minute lease (`lockedUntil`) and bounded exponential backoff (`30s * 2^attempts`, capped at 1h), triggered by `/api/internal/shipping/sync` (`Authorization: Bearer $SHIPROCKET_CRON_SECRET`).
