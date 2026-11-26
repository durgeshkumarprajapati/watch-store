import "server-only";
import { Prisma, type AdminRoleCode, type PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { hashPassword } from "@/modules/auth/password-service";
import { recordAdminAuditLog } from "./admin-audit-service";
import type { AuthenticatedAdmin } from "./admin-auth-service";

export async function listAdminUsers(prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  return prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, emailVerified: true } },
      roles: { include: { role: true } },
    },
  });
}

async function countActiveSuperAdminsInTx(tx: Prisma.TransactionClient, excludeAdminId?: string) {
  return tx.adminUser.count({
    where: {
      isActive: true,
      ...(excludeAdminId ? { id: { not: excludeAdminId } } : {}),
      roles: {
        some: { role: { code: "SUPER_ADMIN" } },
      },
    },
  });
}

export async function createAdminUser(
  params: {
    actor: AuthenticatedAdmin;
    name: string;
    email: string;
    password: string;
    roleCodes: AdminRoleCode[];
  },
  prismaClient?: PrismaClient,
): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const email = params.email.trim().toLowerCase();
  if (params.roleCodes.length === 0) {
    return { ok: false, error: "Select at least one role." };
  }
  if (params.roleCodes.includes("SUPER_ADMIN") && !params.actor.isSuperAdmin) {
    return { ok: false, error: "Only SUPER_ADMIN can assign the SUPER_ADMIN role." };
  }

  const prisma = prismaClient ?? getPrisma();
  const passwordHash = await hashPassword(params.password);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const roles = await tx.adminRole.findMany({
        where: { code: { in: params.roleCodes } },
      });
      if (roles.length !== params.roleCodes.length) {
        throw new Error("INVALID_ROLE");
      }

      const existingUser = await tx.user.findUnique({
        where: { email },
        include: { adminUser: true },
      });
      if (existingUser?.adminUser) {
        throw new Error("ADMIN_EXISTS");
      }

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: params.name.trim(),
              passwordHash,
              emailVerified: existingUser.emailVerified ?? new Date(),
              sessionVersion: { increment: 1 },
            },
          })
        : await tx.user.create({
            data: {
              email,
              name: params.name.trim(),
              passwordHash,
              emailVerified: new Date(),
            },
          });

      const adminUser = await tx.adminUser.create({
        data: {
          userId: user.id,
          isActive: true,
          createdByAdminId: params.actor.adminId,
          roles: {
            create: roles.map((r) => ({ roleId: r.id })),
          },
        },
      });

      await recordAdminAuditLog(
        {
          actorAdminId: params.actor.adminId,
          action: "ADMIN_CREATED",
          targetType: "AdminUser",
          targetId: adminUser.id,
          success: true,
          metadata: { email, roleCodes: params.roleCodes },
        },
        tx,
      );

      return adminUser;
    });

    return { ok: true, adminId: created.id };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "ADMIN_EXISTS") return { ok: false, error: "Administrator already exists for this email." };
      if (err.message === "INVALID_ROLE") return { ok: false, error: "Invalid role selection." };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Administrator already exists." };
    }
    throw err;
  }
}

export async function updateAdminUserRoles(
  params: {
    actor: AuthenticatedAdmin;
    targetAdminId: string;
    roleCodes: AdminRoleCode[];
  },
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.roleCodes.length === 0) {
    return { ok: false, error: "Administrator must have at least one role." };
  }
  if (params.targetAdminId === params.actor.adminId) {
    return { ok: false, error: "Administrators cannot modify their own roles." };
  }
  if (params.roleCodes.includes("SUPER_ADMIN") && !params.actor.isSuperAdmin) {
    return { ok: false, error: "Only SUPER_ADMIN can assign the SUPER_ADMIN role." };
  }

  const prisma = prismaClient ?? getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.adminUser.findUnique({
        where: { id: params.targetAdminId },
        include: { roles: { include: { role: true } } },
      });
      if (!target) throw new Error("NOT_FOUND");

      const wasSuper = target.roles.some((r) => r.role.code === "SUPER_ADMIN");
      const willBeSuper = params.roleCodes.includes("SUPER_ADMIN");

      if (wasSuper && !params.actor.isSuperAdmin) {
        throw new Error("FORBIDDEN_SUPER_EDIT");
      }

      if (wasSuper && !willBeSuper && target.isActive) {
        const remainingSupers = await countActiveSuperAdminsInTx(tx, target.id);
        if (remainingSupers === 0) {
          throw new Error("LAST_SUPER_ADMIN");
        }
      }

      const roles = await tx.adminRole.findMany({
        where: { code: { in: params.roleCodes } },
      });
      if (roles.length !== params.roleCodes.length) throw new Error("INVALID_ROLE");

      await tx.adminUserRole.deleteMany({ where: { adminUserId: target.id } });
      await tx.adminUserRole.createMany({
        data: roles.map((r) => ({ adminUserId: target.id, roleId: r.id })),
      });

      await tx.user.update({
        where: { id: target.userId },
        data: { sessionVersion: { increment: 1 } },
      });

      await recordAdminAuditLog(
        {
          actorAdminId: params.actor.adminId,
          action: "ADMIN_ROLES_UPDATED",
          targetType: "AdminUser",
          targetId: target.id,
          success: true,
          metadata: { roleCodes: params.roleCodes },
        },
        tx,
      );
    });

    return { ok: true };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_FOUND") return { ok: false, error: "Administrator not found." };
      if (err.message === "FORBIDDEN_SUPER_EDIT") return { ok: false, error: "Only SUPER_ADMIN can modify a SUPER_ADMIN." };
      if (err.message === "LAST_SUPER_ADMIN") return { ok: false, error: "Cannot remove SUPER_ADMIN from the last active super administrator." };
      if (err.message === "INVALID_ROLE") return { ok: false, error: "Invalid role selection." };
    }
    throw err;
  }
}

export async function setAdminUserActiveStatus(
  params: {
    actor: AuthenticatedAdmin;
    targetAdminId: string;
    isActive: boolean;
  },
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.targetAdminId === params.actor.adminId && !params.isActive) {
    return { ok: false, error: "You cannot deactivate your own administrator account." };
  }

  const prisma = prismaClient ?? getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.adminUser.findUnique({
        where: { id: params.targetAdminId },
        include: { roles: { include: { role: true } } },
      });
      if (!target) throw new Error("NOT_FOUND");

      const isSuper = target.roles.some((r) => r.role.code === "SUPER_ADMIN");
      if (isSuper && !params.actor.isSuperAdmin) {
        throw new Error("FORBIDDEN_SUPER_EDIT");
      }

      if (isSuper && !params.isActive && target.isActive) {
        const remainingSupers = await countActiveSuperAdminsInTx(tx, target.id);
        if (remainingSupers === 0) {
          throw new Error("LAST_SUPER_ADMIN");
        }
      }

      await tx.adminUser.update({
        where: { id: target.id },
        data: { isActive: params.isActive },
      });

      if (!params.isActive) {
        await tx.user.update({
          where: { id: target.userId },
          data: { sessionVersion: { increment: 1 } },
        });
      }

      await recordAdminAuditLog(
        {
          actorAdminId: params.actor.adminId,
          action: params.isActive ? "ADMIN_ACTIVATED" : "ADMIN_DEACTIVATED",
          targetType: "AdminUser",
          targetId: target.id,
          success: true,
        },
        tx,
      );
    });

    return { ok: true };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_FOUND") return { ok: false, error: "Administrator not found." };
      if (err.message === "FORBIDDEN_SUPER_EDIT") return { ok: false, error: "Only SUPER_ADMIN can deactivate a SUPER_ADMIN." };
      if (err.message === "LAST_SUPER_ADMIN") return { ok: false, error: "Cannot deactivate the last active SUPER_ADMIN." };
    }
    throw err;
  }
}
