# Phase 16 — Scheduler Configuration & Deployment Guide

## Vercel Cron (`vercel.json`)
| Route | Schedule | Purpose | Batch Bound |
| --- | --- | --- | --- |
| `/api/internal/reservations/cleanup` | `*/5 * * * *` | Release expired unpaid reservations | 50 |
| `/api/internal/shipping/sync` | `*/5 * * * *` | Enqueue tracking/reconcile sweeps & process jobs | 10 jobs |
| `/api/internal/notifications/process` | `*/2 * * * *` | Process transactional email outbox | 20 jobs |
| `/api/internal/media/cleanup` | `*/15 * * * *` | Retry unreferenced media deletions | 20 jobs |
| `/api/internal/payments/reconcile` | `*/10 * * * *` | Reconcile stale Razorpay payments | 20 payments |

## Production Environment Variables
- `CRON_SECRET`: Required (min 16 chars). Sent by Vercel Cron as `Authorization: Bearer <CRON_SECRET>`. Never reuse `SHIPROCKET_CRON_SECRET`.
- `DATABASE_URL` / `DIRECT_URL`: Supabase PgBouncer pooled URL (`DATABASE_URL`) and direct migration URL (`DIRECT_URL`).
