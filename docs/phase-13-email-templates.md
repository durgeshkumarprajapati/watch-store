# Phase 13 — Email Templates & Resend Integration

- **Provider**: Server-only Resend HTTP API (`src/modules/notifications/email-service.ts`) using `RESEND_API_KEY`, `EMAIL_FROM`, 10s timeout, and `Idempotency-Key` header (`notification.dedupeKey`).
- **Branding**: Uses `brand.name` (`WatchStore`), `brand.wordmark` (`WATCHSTORE`), and `brand.contact.email` from `src/config/brand.ts` (never "Aurelia Horology").
- **Templates**: Responsive HTML + plain-text fallback rendered from persisted `Order` / `OrderItem` / `OrderAddressSnapshot` / `Shipment` snapshots (`src/modules/notifications/notification-templates.ts`).
