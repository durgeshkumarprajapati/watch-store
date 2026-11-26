# Supabase Pro Production Setup Guide

1. **Create Supabase Pro Project**:
   - Select the region closest to your Vercel deployment (e.g., `ap-south-1` Mumbai for India).
   - Enable **Daily Backups** and **Point-in-Time Recovery (PITR)**.
2. **Copy Connection Strings (Project Settings → Database)**:
   - **Transaction Pooler (port `6543`)** → set as `DATABASE_URL` in Vercel (ensure `?pgbouncer=true&sslmode=require`).
   - **Direct Connection (port `5432`)** → set as `DIRECT_URL` for controlled migration runs (`npm run db:deploy`).
3. **Deploy Additive Migrations (Never Reset)**:
   ```bash
   npx prisma validate
   npm run db:deploy
   npm run rbac:seed
   ```
   *(All `13` migrations `0001_init` through `0013_phase16_operations` are strictly additive.)*
4. **Provision Initial Super Admin**:
   ```bash
   ADMIN_PROVISION_EMAIL="..." ADMIN_PROVISION_NAME="..." ADMIN_PROVISION_PASSWORD="..." npm run admin:create
   ```
5. **Verify Health Endpoint**:
   - Call `GET https://<your-domain>/api/health` (`200 OK` confirms `SELECT 1` over `DATABASE_URL`).
