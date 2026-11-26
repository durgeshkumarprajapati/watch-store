# Phase 8 — Database Changes

## Schema Additions (`prisma/schema.prisma`)

Phase 8 adds an additive, PostgreSQL-backed admin identity and RBAC layer linked to the existing `User` model from Phase 7:

1. **`AdminRoleCode` enum**:
   - `SUPER_ADMIN`
   - `ADMIN`
   - `CATALOG_MANAGER`
   - `ORDER_MANAGER`
   - `INVENTORY_MANAGER`
   - `CUSTOMER_SUPPORT`
2. **`AdminUser` model (`admin_users`)**:
   - `id` (`cuid`), `userId` (`@unique` FK to `User` with `onDelete: Cascade`), `isActive` (`Boolean @default(true)`), `lastLoginAt` (`DateTime?`), `createdAt`, `updatedAt`.
   - Indexed on `isActive`.
3. **`AdminRole` model (`admin_roles`)**:
   - `id` (`cuid`), `code` (`AdminRoleCode @unique`), `name`, `description`, `createdAt`, `updatedAt`.
4. **`AdminPermission` model (`admin_permissions`)**:
   - `id` (`cuid`), `code` (`String @unique`), `description`, `createdAt`, `updatedAt`.
5. **`AdminRolePermission` model (`admin_role_permissions`)**:
   - Composite primary key `(roleId, permissionId)` with cascading foreign keys to `AdminRole` and `AdminPermission`.
6. **`AdminUserRole` model (`admin_user_roles`)**:
   - Composite primary key `(adminUserId, roleId)` with cascading foreign keys to `AdminUser` and `AdminRole`.
7. **`AdminAuditLog` model (`admin_audit_logs`)**:
   - `id` (`cuid`), `actorAdminId` (`String?` FK to `AdminUser` with `onDelete: SetNull`), `action` (`String`), `targetType` (`String?`), `targetId` (`String?`), `metadata` (`Json?`), `createdAt`.
   - Indexed on `(actorAdminId, createdAt)` and `(action, createdAt)`.
8. **`User` model extension**:
   - Added optional `adminUser AdminUser?` reverse relation.

## Migration & Seeding

- Migration file: `prisma/migrations/0004_phase8_admin_rbac/migration.sql` (applied via `npm run db:deploy` without resetting the database).
- Seed script: `prisma/seed-rbac.ts` (`npm run rbac:seed`), which idempotently upserts all 6 `AdminRole` records, 21 `AdminPermission` records, and their `AdminRolePermission` mappings.
