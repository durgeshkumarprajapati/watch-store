# Phase 17 — Production Architecture

WatchStore is architected as a Next.js 16 App Router modular monolith deployed on **Vercel Pro** with **Supabase Pro (PostgreSQL 17)**, **Cloudinary** media storage, **Razorpay** payments, **Shiprocket** shipping, **Resend** transactional email, **Google Sheets** catalogue sync, and **Vercel Cron** (`vercel.json`).
- **Health Probe**: `GET /api/health` runs `SELECT 1` with `Cache-Control: no-store, max-age=0`, returning `200` or sanitized `503`.
- **Database Pooling**: `DATABASE_URL` uses Supabase PgBouncer transaction pooling for serverless runtime; `DIRECT_URL` uses direct session connection for `prisma migrate deploy`.
