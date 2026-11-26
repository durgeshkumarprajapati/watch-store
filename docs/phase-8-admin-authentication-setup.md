# Phase 8 — Admin Authentication Setup

## Overview

Admin authentication reuses WatchStore's Auth.js v5 (`next-auth`) session infrastructure and Argon2id password hashing (`src/modules/auth/password-service.ts`), while strictly isolating administrator privileges in the `AdminUser` table and database-backed RBAC tables.

## Key Security Boundaries

- **No public admin registration**: Customer registration (`/register`) and Google OAuth only create `User` and `Customer` records and never grant `AdminUser` access.
- **Explicit provisioning only**:
  - CLI provisioning: `npm run admin:create -- --email <email> --password <password> --name "<name>" --role SUPER_ADMIN` (`prisma/create-admin.ts`).
  - UI provisioning: `SUPER_ADMIN` (or `admins.create` holder) can provision admins from `/admin/users`, subject to `SUPER_ADMIN`-only escalation rules.
- **Server-side verification on every request**:
  - `getAuthenticatedAdmin()` validates the Auth.js session, checks `User.sessionVersion` against the session token, verifies `AdminUser.isActive === true`, and loads live roles & permissions from PostgreSQL.
  - `src/app/admin/(protected)/layout.tsx` enforces authentication on every protected `/admin/*` route and redirects unauthenticated callers to `/admin/login`.
  - Every admin server action calls `requireAdminActionPermission(...)` or `requireSuperAdminAction()` before mutating state.
- **Immediate session invalidation**:
  - Updating an admin's roles or toggling `isActive` increments `User.sessionVersion` inside the same database transaction, invalidating active sessions immediately.
- **Audit logging**:
  - Login successes/failures, admin creation, role changes, and activation/deactivation events are persisted in `AdminAuditLog`.
