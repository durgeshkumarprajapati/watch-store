# Phase 16 — Scheduler Configuration & Deployment Guide

## Vercel Cron (`vercel.json` — Hobby-Compatible Once-Daily Schedules)

| Route | Hobby Schedule (UTC) | Original Sub-Daily Schedule | Purpose |
| --- | --- | --- | --- |
| `/api/internal/reservations/cleanup` | `0 1 * * *` (01:00 UTC) | `*/5 * * * *` | Release expired unpaid reservations |
| `/api/internal/payments/reconcile` | `0 2 * * *` (02:00 UTC) | `*/10 * * * *` | Reconcile stale Razorpay payments |
| `/api/internal/shipping/sync` | `0 3 * * *` (03:00 UTC) | `*/5 * * * *` | Enqueue tracking/reconcile sweeps & process jobs |
| `/api/internal/notifications/process` | `0 4 * * *` (04:00 UTC) | `*/2 * * * *` | Process transactional email outbox & push retries |
| `/api/internal/media/cleanup` | `0 5 * * *` (05:00 UTC) | `*/15 * * * *` | Retry unreferenced media deletions |

## Operational Limitations on Vercel Hobby

- Hobby Cron Jobs execute **at most once daily**.
- **Customer notification processing** (email outbox and push retries) may be delayed up to 24 hours.
- **Payment reconciliation** and **shipment synchronization** sweeps may be delayed up to 24 hours.
- **Reservation cleanup** and **media cleanup** run daily.
- This schedule configuration is suitable **only for initial demonstration and testing**, not normal commercial e-commerce operations.
- Restore the original sub-daily schedules when moving to Vercel Pro or an external scheduler that supports sub-daily intervals.

## Production Environment Variables
- `CRON_SECRET`: Required (min 16 chars). Sent by Vercel Cron as `Authorization: Bearer <CRON_SECRET>`. Never reuse `SHIPROCKET_CRON_SECRET`.
- `DATABASE_URL` / `DIRECT_URL`: Supabase PgBouncer pooled URL (`DATABASE_URL`) and direct migration URL (`DIRECT_URL`).
