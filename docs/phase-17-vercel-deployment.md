# Phase 17 — Vercel Production Deployment

1. Connect the repository to **Vercel Pro** (Node.js `22.x`, Build Command `npm run build`, Install Command `npm ci`).
2. Configure all production environment variables in Vercel Project Settings (isolated across Development, Preview, and Production).
3. Configure custom domain and verify automatic SSL/HTTPS certificate provisioning.
4. `vercel.json` automatically registers the 5 Cron schedules (`/api/internal/reservations/cleanup`, `/api/internal/shipping/sync`, `/api/internal/notifications/process`, `/api/internal/media/cleanup`, `/api/internal/payments/reconcile`) using `CRON_SECRET`.
5. Register production webhook URLs:
   - Razorpay: `https://<domain>/api/webhooks/razorpay`
   - Shiprocket: `https://<domain>/api/webhooks/shiprocket` (`x-api-key: <SHIPROCKET_WEBHOOK_TOKEN>`)
6. Run post-deploy smoke test: `GET https://<domain>/api/health` (`200 OK`).
