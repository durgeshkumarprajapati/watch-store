# WatchStore — Supabase Integration Audit

**Date:** 2026-11-26  
**Architecture Verdict:** Supabase is used **exclusively as a managed PostgreSQL host through Prisma ORM `6.19.3`**, NOT via Supabase platform APIs.

---

## 1. Codebase & Dependency Findings
- **`package.json`**: `@supabase/supabase-js` and `@supabase/ssr` are **not installed**. Database access uses `@prisma/client` (`6.19.3`) and `prisma` (`6.19.3`).
- **`src/` & `prisma/`**: Zero references to `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY`.
- **Feature Mapping**:
  - **Authentication**: Auth.js v5 (`src/modules/auth/auth.ts`) with `@auth/prisma-adapter`, Argon2id, and Google OAuth (not Supabase Auth).
  - **Media Storage**: Cloudinary & Local provider (`src/modules/admin/catalogue/media-storage.ts`, not Supabase Storage).
  - **Database**: Prisma Client singleton (`src/lib/prisma.ts`) using `DATABASE_URL` (runtime pooled) and `DIRECT_URL` (migrations in `prisma/schema.prisma`).

## 2. Credential Requirement Matrix
| Variable | Required? | Used By | Reason |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | **NO** | None | No `@supabase/supabase-js` or browser/server Supabase REST calls exist |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **NO** | None | No Supabase Auth, Storage, Realtime, or PostgREST browser access exists |
| `SUPABASE_SERVICE_ROLE_KEY` | **NO** | None | All DB operations run server-side through Prisma (`DATABASE_URL`) |
| `DATABASE_URL` | **YES** | `prisma/schema.prisma`, `src/lib/prisma.ts`, `src/config/env.ts` | Required PostgreSQL connection string (Supabase PgBouncer pooler in prod) |
| `DIRECT_URL` | **YES** (for migrations) | `prisma/schema.prisma` (`directUrl`) | Required by `prisma migrate deploy` to bypass PgBouncer transaction pooling |

## 3. Security & RLS Assessment
- **Secret Isolation**: `DATABASE_URL` and `DIRECT_URL` are server-only (`src/config/env.ts` imports `server-only`); neither uses `NEXT_PUBLIC_`.
- **RLS Behavior**: Prisma connects as the PostgreSQL `postgres` / database owner role, which bypasses Supabase Row Level Security (RLS) by default. Data access is protected by WatchStore's server-side Auth.js sessions, `requireAuthenticatedCustomer*` ownership checks, and `requireAdminPermission` RBAC (`37` permissions across `6` roles).
- **Recommendation**: Do **not** enable public PostgREST (`anon`) table exposure without RLS policies; keep Supabase Data API disabled or restrict `anon`/`authenticated` roles if unused, since WatchStore never queries Supabase over HTTP.
