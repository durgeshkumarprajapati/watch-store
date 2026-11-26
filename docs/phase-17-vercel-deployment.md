# Phase 17 — Vercel Deployment (Hobby-Compatible Cron Configuration)

1. Connect the repository to Vercel (Node.js `22.x`, Build Command `npm run build`, Install Command `npm ci`).
2. Configure all environment variables in Vercel Project Settings (isolated across Development, Preview, and Production).
3. Configure custom domain and verify automatic SSL/HTTPS certificate provisioning.
4. `vercel.json` registers the 5 Cron schedules using `CRON_SECRET` on **staggered once-daily UTC schedules** (`01:00`–`05:00` UTC) for Vercel Hobby compatibility:
   - `0 1 * * *` — `/api/internal/reservations/cleanup`
   - `0 2 * * *` — `/api/internal/payments/reconcile`
   - `0 3 * * *` — `/api/internal/shipping/sync`
   - `0 4 * * *` — `/api/internal/notifications/process`
   - `0 5 * * *` — `/api/internal/media/cleanup`
5. Register webhook URLs:
   - Razorpay: `https://<domain>/api/webhooks/razorpay`
   - Shiprocket: `https://<domain>/api/webhooks/shiprocket` (`x-api-key: <SHIPROCKET_WEBHOOK_TOKEN>`)
6. Run post-deploy smoke test: `GET https://<domain>/api/health` (`200 OK`).

## Vercel Hobby Plan Operational Limitations

- **Hobby Cron Jobs execute at most once daily.**
- **Customer notification processing may be delayed** (queued email outbox jobs and failed push retries wait up to 24 hours for the next `04:00 UTC` run).
- **Payment reconciliation and shipment synchronization may be delayed** (stale payment sweeps run at `02:00 UTC` and Shiprocket sync sweeps run at `03:00 UTC`; real-time webhooks remain immediate).
- **Reservation cleanup (`01:00 UTC`) and media cleanup (`05:00 UTC`) run daily.**
- **Demonstration/Testing Only:** This configuration is suitable only for initial demonstration and testing, **not** normal commercial e-commerce operations.
- **Upgrade / External Scheduler Path:** Restore the original sub-daily schedules (`*/2`, `*/5`, `*/10`, `*/15`) when moving to Vercel Pro or an external scheduler that supports sub-daily intervals.
