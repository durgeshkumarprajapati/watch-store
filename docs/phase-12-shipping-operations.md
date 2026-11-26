# Phase 12 — Shipping Operations & Deployment Guide

## Environment Variables (`.env.example`)
- `SHIPROCKET_API_EMAIL`, `SHIPROCKET_API_PASSWORD` (dedicated Shiprocket API user)
- `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_PICKUP_PINCODE`
- `SHIPROCKET_WEBHOOK_TOKEN` (configured in Shiprocket Panel -> Settings -> API -> Webhooks)
- `SHIPROCKET_CRON_SECRET` (Bearer token for `POST /api/internal/shipping/sync`)

## Production Scheduler Setup
Configure Vercel Cron (or an external HTTPS scheduler) to call `POST /api/internal/shipping/sync` with `Authorization: Bearer <SHIPROCKET_CRON_SECRET>` every 5–15 minutes to drain pending `ShippingJob` retries and reconciliation tasks.

## Admin & Customer Routes
- Admin Shipments: `/admin/shipments`, `/admin/shipments/[shipmentId]`, and `/admin/orders/[orderId]`
- Customer Tracking: `/account/orders/[orderId]` (scoped strictly by `customerId`).
