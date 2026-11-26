# WatchStore Phase 19B — VAPID Push & In-App Inbox Test Results

**Branch:** `development`  
**Database Target:** Local PostgreSQL (`watchstore_db`) — remote Supabase and production Vercel untouched.

## 1. Automated Verification Summary

| Check | Command | Result | Notes |
| --- | --- | --- | --- |
| Prisma schema validation | `npx prisma validate` | Passed | Exit code `0` |
| Prisma client generation | `npx prisma generate` | Passed | Exit code `0` |
| Local DB migration | `prisma migrate deploy` (against `watchstore_db`) | Passed | Applied `0015_phase19_web_push` |
| TypeScript typecheck | `npm run typecheck` | Passed | `tsc --noEmit` exit code `0` |
| ESLint | `npm run lint` | Passed | `eslint .` 0 errors, 0 warnings |
| Production build | `npm run qa:build` | Passed | Next.js 16.4.6 Turbopack compiled all routes including `/admin/inbox`, `/account/notifications`, and all 5 push API routes |
| Unit tests | `npx vitest run tests/unit/` | Passed | 20 test files, 129 tests passed (`phase-19-push.test.ts`: 4/4, `phase-13-notifications.test.ts`: 7/7) |
| DB Integration tests | `RUN_DB_TESTS=1 vitest run --no-file-parallelism` | Passed | 5 suites, 12 tests passed (`push-notifications-db.test.ts`, `notifications-db.test.ts`, `auth-db.test.ts`, `invoices-db.test.ts`, `operations-db.test.ts`) |

## 2. Coverage Highlights

- **SSRF & Endpoint Validation (`tests/unit/phase-19-push.test.ts`):**
  - Verifies approved HTTPS Web Push provider hosts (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`).
  - Rejects `http://`, embedded URL credentials, loopback/private IPs (`127.0.0.1`, `10.0.0.5`, `169.254.169.254`, `localhost`), and unapproved hosts.
  - Verifies `isSafeRelativeTargetUrl` strips protocol-relative (`//evil.com`), external (`https://evil.com`), and `javascript:` URLs.
- **VAPID Sender (`tests/unit/phase-19-push.test.ts`):**
  - Handles missing VAPID config (`skipped: true`), `201` delivery success, `410` expired subscription classification, and `503` retryable classification.
- **Customer & Admin Isolation (`tests/integration/push-notifications-db.test.ts`):**
  - Enforces per-customer `PushSubscription` ownership isolation (Customer B cannot deactivate Customer A's endpoint).
  - Verifies `enqueueAdminBroadcastInTx` fans out `IN_APP` + `PUSH` to **all** active, email-verified `AdminUser` accounts regardless of RBAC role, while excluding inactive or unverified admins.
  - Verifies `InAppInbox` unread counts and ownership-enforced mark-read / mark-all-read operations.
  - Verifies `PUSH` worker updates `lastUsedAt` on `201` and deactivates `PushSubscription` (`isActive = false`) on `410`.

## 3. Not Tested (Requires Live Browser + Production VAPID Cutover)

- **Real Browser Service Worker E2E:** **NOT TESTED** — Interactive browser `Notification.requestPermission()`, `PushManager.subscribe()`, and live OS/browser push delivery via `/sw.js` require an interactive HTTPS browser session and real VAPID keys configured in the deployment environment.
- **Production Vercel / Supabase Cutover:** Intentionally **NOT EXECUTED** per Phase 19B authorization rules.
