# Phase 13 — Database Changes

## Migration: `0009_phase13_notifications`

Applied additively via `npm run db:deploy` without resetting or dropping any tables.

- **Enums**: `NotificationChannel` (`EMAIL`), `NotificationStatus` (`PENDING`, `PROCESSING`, `SENT`, `FAILED`, `DEAD_LETTER`), `NotificationEventType` (`ORDER_CONFIRMED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `COD_ORDER_CONFIRMED`, `SHIPMENT_CREATED`, `SHIPMENT_DISPATCHED`, `OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_CANCELLED`).
- **`Notification`**: Durable notification record with `dedupeKey @unique`, `customerId` (`onDelete: SetNull`), `orderId` (`onDelete: SetNull`), `providerMessageId`, `attemptCount`, `sentAt`, `failedAt`, `lastError`.
- **`NotificationJob`**: Durable outbox job table (`notificationId @unique` `onDelete: Cascade`) with `attempts`, `maxAttempts`, `nextRunAt`, `lockedUntil`, `lockedBy`, `lastError`, `completedAt`.
- **`NotificationPreference`**: Per-customer preferences (`customerId @id` `onDelete: Cascade`).
