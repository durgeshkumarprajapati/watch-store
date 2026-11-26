# Phase 5 — Local PostgreSQL & Migration Setup

## 1. Environment Variables
Copy `.env.example` to `.env` (for Prisma CLI) and `.env.local` (for Next.js):

```bash
cp .env.example .env
```

Set `DATABASE_URL` and `DIRECT_URL` (for Supabase PostgreSQL, `DATABASE_URL` uses the pooler port `6543` with `?pgbouncer=true` and `DIRECT_URL` uses port `5432`):

```env
DATABASE_URL="postgresql://watchstore:password@localhost:5432/watch_store?schema=public"
DIRECT_URL="postgresql://watchstore:password@localhost:5432/watch_store?schema=public"
```

## 2. Generate Client, Apply Migrations & Seed
```bash
npm run db:generate   # Generates Prisma Client
npm run db:deploy     # Applies versioned migrations (prisma migrate deploy)
npm run db:seed       # Idempotently seeds 4 brands, 4 categories, 12 products
```

For local schema development:
```bash
npm run db:migrate    # Runs prisma migrate dev
```

## 3. Running Integration Tests
Set `TEST_DATABASE_URL` to an isolated test database (never a shared dev or production DB):
```bash
TEST_DATABASE_URL="postgresql://watchstore:password@localhost:5432/watch_store_test?schema=public" npm test
```

## 4. Migration Rollback Considerations
- Migrations are forward-only SQL files under `prisma/migrations/`.
- Never use `prisma migrate reset` in production or shared environments.
- To roll back a failed production migration, author a compensating forward migration or restore from a PostgreSQL point-in-time backup.
