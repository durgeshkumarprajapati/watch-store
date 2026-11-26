# Phase 17 — CI/CD Pipeline

Implemented in [.github/workflows/ci.yml](file:///home/ppsd-021/watch-store/.github/workflows/ci.yml):
- Triggers on `push` and `pull_request` to `main`.
- Spins up a disposable `postgres:17-alpine` service container with non-production CI secrets.
- Executes: `npm ci` → `npx prisma validate` → `npm run db:generate` → `npm run db:deploy` → `npm run db:seed` → `npm run rbac:seed` → `npm run typecheck` → `npm run lint` → `npm test` → `npm run test:db` → `npm run qa:build`.
- Never connects to production databases or exposes production secrets.
