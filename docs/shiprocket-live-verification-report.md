# Shiprocket Integration — Live Credential & End-to-End Verification Report

**Date:** 2026-11-25  
**Scope:** Re-verification of Shiprocket integration after configuring `SHIPROCKET_PICKUP_LOCATION="home"`, `SHIPROCKET_PICKUP_PINCODE="391410"`, and `CRON_SECRET` in `.env`.

---

## 1. Environment Configuration Status

| Check | Status | Details |
| --- | --- | --- |
| `SHIPROCKET_API_EMAIL` & `SHIPROCKET_API_PASSWORD` | **PASS** | Present and non-empty in `.env` (values not printed) |
| `SHIPROCKET_PICKUP_LOCATION` | **PASS** | Set to `"home"` |
| `SHIPROCKET_PICKUP_PINCODE` | **PASS** | Set to `"391410"` |
| `SHIPROCKET_WEBHOOK_TOKEN` | **PASS** | Present and non-empty in `.env` |
| `CRON_SECRET` | **PASS** | Present and non-empty in `.env` |
| `.env` Git Ignore & Secret Isolation | **PASS** | `.env` ignored in `.gitignore`; no secrets printed |

## 2. Live Shiprocket API Verification (Read-Only)

| Check | Status | Details |
| --- | --- | --- |
| Authentication (`/auth/login`) | **PASS** | Live API accepted credentials and returned a 400-char JWT token matching `shiprocketLoginResponseSchema` |
| Pickup Address Lookup (`/settings/company/pickup`) | **PASS** | HTTP `200`, returned `1` pickup location: `"home"`, PIN `"391410"` (`pinMatchesEnv: true`), Vadodara, Gujarat, `status: 2` (Active), `phone_verified: 1` (Verified) |
| Courier Serviceability (`/courier/serviceability/`) | **PASS** | Live API succeeded for `391410` → `110001` (`0.5 kg`, prepaid), returning `3` couriers (e.g., `Blue Dart Air`, rate `132.84`, ETD `Nov 27, 2026`) |
| Token Caching & Concurrency Lock | **PASS (DB/Mock)** | Fixed concurrent initialization race in `getShiprocketAuthToken` using `INSERT ... ON CONFLICT ("id") DO NOTHING` before `FOR UPDATE` |

## 3. CRON_SECRET & Scheduled Sync Verification

| Check | Status | Details |
| --- | --- | --- |
| `CRON_SECRET` Auth (`isAuthorizedCronRequest`) | **PASS** | Valid `Bearer <CRON_SECRET>` accepted; invalid header, missing header, and legacy `SHIPROCKET_CRON_SECRET` rejected |
| Live Vercel Cron Execution | **NOT TESTED** | Pending Vercel deployment |

## 4. Shipment Workflows & Webhook Verification (Mocked)

| Workflow | Status | Details |
| --- | --- | --- |
| Shipment Creation, AWB, Label, Pickup, Cancel | **PASS (Mocked)** / **NOT TESTED (Live)** | Verified via mocked tests; no live shipments created or modified |
| Webhook (`/api/webhooks/shiprocket`) | **PASS (Mocked)** / **NOT TESTED (Live)** | Timing-safe `x-api-key`, `256 KB` limit, and idempotency verified; live delivery requires public URL registration |

## 5. Regression Tests & Build Results

| Check | Status | Exact Result |
| --- | --- | --- |
| `npm run typecheck` | **PASS** | `0` errors |
| `npm run lint` | **PASS** | `0` errors, `0` warnings |
| Shiprocket Unit Tests (`tests/unit/phase-12-shipping.test.ts`) | **PASS** | `4` tests passed |
| PostgreSQL Integration (`npm run test:db`) | **PASS** | `12` test files passed, `35` tests passed against `watchstore_db` (including `admin-shipping-db.test.ts` and `operations-db.test.ts`) |
| Production Build (`npm run qa:build`) | **PASS** | `Next.js 16.4.6` Turbopack build succeeded |

## 6. Issues Found & Fixed
- **Concurrent Token Initialization Race (`shiprocket-auth-service.ts`)**: Replaced non-atomic Prisma `upsert` with atomic PostgreSQL `INSERT ... ON CONFLICT ("id") DO NOTHING` before acquiring the `FOR UPDATE` row lock, resolving a `P2002` race under concurrent `getShiprocketAuthToken` calls.

## 7. Remaining Dashboard Actions
- Register `https://<production-domain>/api/webhooks/shiprocket` with `x-api-key: <SHIPROCKET_WEBHOOK_TOKEN>` in Shiprocket Panel once deployed to Vercel.
