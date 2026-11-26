import "server-only";
import { redirect } from "next/navigation";
import type { AdminRoleCode, PrismaClient } from "@prisma/client";
import { hasDatabaseUrl } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { auth } from "@/modules/auth/auth";
import { verifyPassword } from "@/modules/auth/password-service";
import { recordAdminAuditLog } from "./admin-audit-service";
import { hasAdminPermission, type AdminPermissionCode } from "./rbac-catalogue";

export interface AuthenticatedAdmin {
  adminId: string;
  userId: string;
  email: string;
  name: string;
  initials: string;
  roles: AdminRoleCode[];
  permissions: Set<AdminPermissionCode>;
  isSuperAdmin: boolean;
}

export class AdminUnauthorizedError extends Error {
  constructor(message = "Administrator authentication required.") {
    super(message);
    this.name = "AdminUnauthorizedError";
  }
}

export class AdminForbiddenError extends Error {
  constructor(message = "Insufficient administrator permissions.") {
    super(message);
    this.name = "AdminForbiddenError";
  }
}

function makeInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  return (parts[0] ?? email).slice(0, 2).toUpperCase();
}

export async function getAuthenticatedAdmin(
  prismaClient?: PrismaClient,
): Promise<AuthenticatedAdmin | null> {
  if (!hasDatabaseUrl()) return null;
  let session = null;
  try {
    session = await auth();
  } catch {
    return null;
  }
  const userId = session?.user?.id;
  if (!userId) return null;

  const prisma = prismaClient ?? getPrisma();
  const admin = await prisma.adminUser.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, email: true, name: true, emailVerified: true } },
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!admin || !admin.isActive || !admin.user.emailVerified) {
    return null;
  }

  const roles = admin.roles.map((r) => r.role.code);
  const permissions = new Set<AdminPermissionCode>();
  for (const r of admin.roles) {
    for (const rp of r.role.permissions) {
      permissions.add(rp.permission.code as AdminPermissionCode);
    }
  }

  const name = admin.user.name?.trim() || admin.user.email;
  return {
    adminId: admin.id,
    userId: admin.user.id,
    email: admin.user.email,
    name,
    initials: makeInitials(name, admin.user.email),
    roles,
    permissions,
    isSuperAdmin: roles.includes("SUPER_ADMIN"),
  };
}

export async function requireAuthenticatedAdmin(): Promise<AuthenticatedAdmin> {
  const admin = await getAuthenticatedAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function requireAdminPermission(
  permission: AdminPermissionCode,
): Promise<AuthenticatedAdmin> {
  const admin = await requireAuthenticatedAdmin();
  if (!hasAdminPermission(admin.permissions, permission)) {
    redirect("/admin/access-denied");
  }
  return admin;
}

export async function requireSuperAdmin(): Promise<AuthenticatedAdmin> {
  const admin = await requireAuthenticatedAdmin();
  if (!admin.isSuperAdmin) {
    redirect("/admin/access-denied");
  }
  return admin;
}

export async function requireAdminActionPermission(
  permission: AdminPermissionCode,
): Promise<AuthenticatedAdmin> {
  const admin = await getAuthenticatedAdmin();
  if (!admin) throw new AdminUnauthorizedError();
  if (!hasAdminPermission(admin.permissions, permission)) {
    throw new AdminForbiddenError();
  }
  return admin;
}

export async function requireSuperAdminAction(): Promise<AuthenticatedAdmin> {
  const admin = await getAuthenticatedAdmin();
  if (!admin) throw new AdminUnauthorizedError();
  if (!admin.isSuperAdmin) throw new AdminForbiddenError();
  return admin;
}

export async function verifyAdminCredentials(
  params: { email: string; password: string },
  prismaClient?: PrismaClient,
): Promise<{ ok: true; adminId: string; email: string } | { ok: false; error: string }> {
  const email = params.email.trim().toLowerCase();
  const limit = checkRateLimit(`admin-login:${email}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return { ok: false, error: `Too many login attempts. Try again in ${limit.retryAfterSeconds}s.` };
  }

  const prisma = prismaClient ?? getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    include: { adminUser: true },
  });

  if (!user || !user.passwordHash || !user.emailVerified || !user.adminUser || !user.adminUser.isActive) {
    if (user?.adminUser) {
      await recordAdminAuditLog(
        {
          actorAdminId: user.adminUser.id,
          action: "ADMIN_LOGIN_FAILURE",
          targetType: "AdminUser",
          targetId: user.adminUser.id,
          success: false,
          metadata: { reason: !user.adminUser.isActive ? "INACTIVE" : "INVALID_CREDENTIALS" },
        },
        prisma,
      );
    }
    return { ok: false, error: "Invalid administrator credentials." };
  }

  const valid = await verifyPassword(user.passwordHash, params.password);
  if (!valid) {
    await recordAdminAuditLog(
      {
        actorAdminId: user.adminUser.id,
        action: "ADMIN_LOGIN_FAILURE",
        targetType: "AdminUser",
        targetId: user.adminUser.id,
        success: false,
        metadata: { reason: "WRONG_PASSWORD" },
      },
      prisma,
    );
    return { ok: false, error: "Invalid administrator credentials." };
  }

  await recordAdminAuditLog(
    {
      actorAdminId: user.adminUser.id,
      action: "ADMIN_LOGIN_SUCCESS",
      targetType: "AdminUser",
      targetId: user.adminUser.id,
      success: true,
    },
    prisma,
  );

  return { ok: true, adminId: user.adminUser.id, email: user.email };
}
