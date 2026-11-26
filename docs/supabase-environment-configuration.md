# Supabase Environment Variable Configuration

## 1. Required for Production (Supabase PostgreSQL via Prisma)
- `DATABASE_URL`: Supabase **Transaction Pooler** URL (port `6543` with `?pgbouncer=true&sslmode=require`, plus `&connection_limit=1` or appropriate serverless pool size for Vercel).
- `DIRECT_URL`: Supabase **Direct Connection** URL (port `5432` with `?sslmode=require`), used by `npx prisma migrate deploy` (`npm run db:deploy`).

## 2. Required Only If a Supabase Platform Feature Is Added Later
- `NEXT_PUBLIC_SUPABASE_URL`: Only needed if `@supabase/supabase-js` is added for Supabase Storage/Realtime/Auth.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Only needed for browser-side Supabase API calls.
- `SUPABASE_SERVICE_ROLE_KEY`: Only needed for privileged server-side Supabase Storage/Auth Admin HTTP calls.

## 3. Not Required (Do Not Add)
For WatchStore's current architecture, **do not add** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY`.
