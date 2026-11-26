# Phase 13 — Testing Strategy

- **Unit Tests (`tests/unit/phase-13-notifications.test.ts`)**: HTML escaping, XSS/URL injection rejection, WatchStore branding, mandatory vs optional event classification, Resend unconfigured/429/5xx/4xx handling, preference validation, RBAC checks.
- **PostgreSQL Integration Tests (`tests/integration/notifications-db.test.ts`)**: Transactional outbox creation & dedupe, auth-only payment exclusion, failure & cancellation intents, concurrent `FOR UPDATE SKIP LOCKED` job claiming, expired lease recovery, `DEAD_LETTER`, audited manual retry, `SENT` retry rejection, and customer preference enforcement (with mocked email sender).
