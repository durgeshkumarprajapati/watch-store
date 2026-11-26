# Phase 16 — Operations Security Controls

1. **Dedicated Scheduler Secret**: All `/api/internal/*` routes validate `Authorization: Bearer <CRON_SECRET>` using `crypto.timingSafeEqual` ([scheduler-auth.ts](file:///home/ppsd-021/watch-store/src/modules/operations/scheduler-auth.ts)). `SHIPROCKET_CRON_SECRET` is not accepted as a global fallback.
2. **RBAC Enforcement**: `operations.read` and `operations.manage` are granted exclusively to `SUPER_ADMIN` and `ADMIN`.
3. **Structured Sanitized Logging**: `SchedulerRun` logs JSON events with `runId`, `jobName`, `durationMs`, `processedCount`, `errorCount`, and sanitized `lastError` — never logging secrets, tokens, or PII.
4. **No Automated Refunds or Blind Retries**: Payment reconciliation verifies Razorpay state before settling and never issues automatic refunds.
