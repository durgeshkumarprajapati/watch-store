# Phase 17 — Supabase Production Deployment

1. Provision a Supabase Pro PostgreSQL 17 project and enable Point-in-Time Recovery (PITR).
2. Configure `DATABASE_URL` (Transaction Pooler port `6543` with `?pgbouncer=true`) and `DIRECT_URL` (Direct port `5432`).
3. Deploy all `13` additive migrations (`0001_init` through `0013_phase16_operations`) from a controlled release step:
   ```bash
   npm run db:deploy
   npm run rbac:seed
   ```
4. **Never** run `prisma db push`, `prisma migrate reset`, or `npm run db:seed` against production (`prisma/seed.ts` refuses `NODE_ENV=production` unless `ALLOW_PRODUCTION_SEED=true`).
5. Create initial `SUPER_ADMIN` using `npm run admin:create` after deployment.
