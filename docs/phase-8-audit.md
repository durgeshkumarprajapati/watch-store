# Phase 8 — Admin Authentication & RBAC Repository Audit

## 1. Existing Architecture & Findings
Inspected [`src/app/admin/layout.tsx`](../src/app/admin/layout.tsx), [`src/app/admin/dashboard/page.tsx`](../src/app/admin/dashboard/page.tsx), [`src/components/admin/admin-shell.tsx`](../src/components/admin/admin-shell.tsx), [`src/components/admin/admin-nav.ts`](../src/components/admin/admin-nav.ts), [`src/config/security.ts`](../src/config/security.ts), [`src/modules/auth/auth.ts`](../src/modules/auth/auth.ts), and [`prisma/schema.prisma`](../prisma/schema.prisma):
- **Admin protection**: `ADMIN_AUTH_IMPLEMENTED = false`. `/admin/*` returns `404` in production unless `ALLOW_UNPROTECTED_ADMIN_PREVIEW=true` and is unprotected in development.
- **Admin routes**: Only `/admin/dashboard` exists, wrapped by `AdminShell` with hardcoded `user={{ name: "Admin", initials: "AD" }}`.
- **Auth.js v5**: Already configured with `PrismaAdapter`, `Credentials` (Argon2id + `emailVerified` + `sessionVersion`), and `Google` OAuth.

## 2. Security Gaps Identified
1. No `AdminUser`, `AdminRole`, `AdminPermission`, or `AdminAuditLog` tables exist.
2. Any visitor in development (or with preview flag) can access `/admin/dashboard`.
3. No `/admin/login` route, no admin session/permission helpers, and no admin provisioning CLI.
4. No audit logging for admin logins or privilege changes.

## 3. Proposed Database & RBAC Design
Reuse `User` (`passwordHash`, `sessionVersion`, `emailVerified`) via a 1-to-1 `AdminUser` (`userId @unique`, `isActive`) table so:
- Customer registration and Google OAuth **never** create `AdminUser`.
- `getAuthenticatedAdmin()` resolves `session.user.id` → active `AdminUser` + live DB roles/permissions on every request (no stale JWT role claims).
- **Roles**: `SUPER_ADMIN`, `ADMIN`, `CATALOG_MANAGER`, `ORDER_MANAGER`, `INVENTORY_MANAGER`, `CUSTOMER_SUPPORT`.
- **Permissions**: 21 explicit permissions (`dashboard.read`, `products.*`, `categories.*`, `orders.*`, `inventory.*`, `customers.*`, `reports.read`, `admins.*`, `roles.*`, `audit.read`).
- **Audit Log**: Append-only `AdminAuditLog` recording actor, action, target, success/failure, and non-sensitive metadata.
- **Route Structure**: Move protected admin pages under `src/app/admin/(protected)/` (enforcing `requireAuthenticatedAdmin()` in layout AND in each page/action) while keeping `src/app/admin/login/page.tsx` public.
