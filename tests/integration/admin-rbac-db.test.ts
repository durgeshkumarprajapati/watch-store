import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/modules/auth/auth", () => ({
  auth: vi.fn(async () => null),
}));

import { PrismaClient } from "@prisma/client";
import { seedRbac } from "../../prisma/seed-rbac";
import { hashPassword } from "@/modules/auth/password-service";
import {
  verifyAdminCredentials,
  type AuthenticatedAdmin,
} from "@/modules/admin/admin-auth-service";
import {
  createAdminUser,
  setAdminUserActiveStatus,
  updateAdminUserRoles,
} from "@/modules/admin/admin-user-service";
import { ADMIN_PERMISSIONS, ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 8 Admin Auth & RBAC PostgreSQL integration against watchstore_db", () => {
  let prisma: PrismaClient;
  const testEmails: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedRbac(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    if (testEmails.length > 0) {
      const users = await prisma.user.findMany({
        where: { email: { in: testEmails } },
        select: { id: true, adminUser: { select: { id: true } } },
      });
      const userIds = users.map((u) => u.id);
      const adminIds = users
        .map((u) => u.adminUser?.id)
        .filter((id): id is string => Boolean(id));

      if (adminIds.length > 0) {
        await prisma.adminAuditLog.deleteMany({
          where: {
            OR: [
              { actorAdminId: { in: adminIds } },
              { targetId: { in: adminIds } },
            ],
          },
        });
        await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
      }
      if (userIds.length > 0) {
        await prisma.adminAuditLog.deleteMany({
          where: { targetId: { in: userIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }
    await prisma.$disconnect();
  });

  it("seeds all 6 admin roles and all catalogue permissions idempotently", async () => {
    await seedRbac(prisma);

    const rolesCount = await prisma.adminRole.count();
    const permsCount = await prisma.adminPermission.count();

    expect(rolesCount).toBe(6);
    expect(permsCount).toBe(ADMIN_PERMISSIONS.length);
  });

  it("verifies valid admin credentials, rejects wrong password, customer-only users, and inactive admins, and records audit logs", async () => {
    const suffix = Date.now();
    const adminEmail = `phase8-admin-${suffix}@watchstore.test`;
    const customerEmail = `phase8-customer-${suffix}@watchstore.test`;
    testEmails.push(adminEmail, customerEmail);

    const passwordHash = await hashPassword("StrongPass!2026");

    const adminUserRecord = await prisma.user.create({
      data: {
        name: "Phase8 Test Admin",
        email: adminEmail,
        passwordHash,
        emailVerified: new Date(),
      },
    });
    const adminRecord = await prisma.adminUser.create({
      data: {
        userId: adminUserRecord.id,
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        name: "Phase8 Test Customer",
        email: customerEmail,
        passwordHash,
        emailVerified: new Date(),
      },
    });

    const validResult = await verifyAdminCredentials(
      { email: adminEmail, password: "StrongPass!2026" },
      prisma,
    );
    expect(validResult).toEqual({
      ok: true,
      adminId: adminRecord.id,
      email: adminEmail,
    });

    const wrongPassResult = await verifyAdminCredentials(
      { email: adminEmail, password: "WrongPassword123!" },
      prisma,
    );
    expect(wrongPassResult.ok).toBe(false);

    const customerResult = await verifyAdminCredentials(
      { email: customerEmail, password: "StrongPass!2026" },
      prisma,
    );
    expect(customerResult.ok).toBe(false);

    await prisma.adminUser.update({
      where: { id: adminRecord.id },
      data: { isActive: false },
    });

    const inactiveResult = await verifyAdminCredentials(
      { email: adminEmail, password: "StrongPass!2026" },
      prisma,
    );
    expect(inactiveResult.ok).toBe(false);

    const auditEntries = await prisma.adminAuditLog.findMany({
      where: {
        action: { in: ["ADMIN_LOGIN_SUCCESS", "ADMIN_LOGIN_FAILURE"] },
        OR: [{ actorAdminId: adminRecord.id }, { targetId: adminRecord.id }],
      },
    });
    expect(auditEntries.length).toBeGreaterThanOrEqual(3);
  });

  it("enforces SUPER_ADMIN provisioning rules, self-modification blocks, last-active-SUPER_ADMIN protection, and sessionVersion bumps", async () => {
    const suffix = Date.now();
    const superEmail = `phase8-super-${suffix}@watchstore.test`;
    const targetEmail = `phase8-target-${suffix}@watchstore.test`;
    const escalatedEmail = `phase8-escalated-${suffix}@watchstore.test`;
    testEmails.push(superEmail, targetEmail, escalatedEmail);

    const passwordHash = await hashPassword("SuperAdmin!2026");
    const superUser = await prisma.user.create({
      data: {
        name: "Phase8 Super",
        email: superEmail,
        passwordHash,
        emailVerified: new Date(),
      },
    });
    const superRole = await prisma.adminRole.findUniqueOrThrow({
      where: { code: "SUPER_ADMIN" },
    });
    const superAdminRecord = await prisma.adminUser.create({
      data: {
        userId: superUser.id,
        isActive: true,
        roles: { create: [{ roleId: superRole.id }] },
      },
    });

    const superActor: AuthenticatedAdmin = {
      adminId: superAdminRecord.id,
      userId: superUser.id,
      email: superEmail,
      name: "Phase8 Super",
      initials: "PS",
      roles: ["SUPER_ADMIN"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };

    const nonSuperActor: AuthenticatedAdmin = {
      adminId: "non-super-actor-id",
      userId: "non-super-user-id",
      email: "manager@watchstore.test",
      name: "Non Super",
      initials: "NS",
      roles: ["ADMIN"],
      permissions: new Set(ADMIN_ROLE_DEFINITIONS.ADMIN.permissions),
      isSuperAdmin: false,
    };

    // Non-SUPER_ADMIN cannot create a SUPER_ADMIN
    const escalationAttempt = await createAdminUser(
      {
        actor: nonSuperActor,
        name: "Escalated User",
        email: escalatedEmail,
        password: "StrongPassword!2026",
        roleCodes: ["SUPER_ADMIN"],
      },
      prisma,
    );
    expect(escalationAttempt.ok).toBe(false);

    // SUPER_ADMIN can create an ORDER_MANAGER
    const created = await createAdminUser(
      {
        actor: superActor,
        name: "Target Manager",
        email: targetEmail,
        password: "StrongPassword!2026",
        roleCodes: ["ORDER_MANAGER"],
      },
      prisma,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Self-role modification is blocked
    const selfRoleEdit = await updateAdminUserRoles(
      {
        actor: superActor,
        targetAdminId: superAdminRecord.id,
        roleCodes: ["ADMIN"],
      },
      prisma,
    );
    expect(selfRoleEdit.ok).toBe(false);

    // Self-deactivation is blocked
    const selfDeactivate = await setAdminUserActiveStatus(
      {
        actor: superActor,
        targetAdminId: superAdminRecord.id,
        isActive: false,
      },
      prisma,
    );
    expect(selfDeactivate.ok).toBe(false);

    // Updating target admin roles increments sessionVersion
    const targetUserBefore = await prisma.user.findUniqueOrThrow({
      where: { email: targetEmail },
    });
    const roleUpdate = await updateAdminUserRoles(
      {
        actor: superActor,
        targetAdminId: created.adminId,
        roleCodes: ["CATALOG_MANAGER", "INVENTORY_MANAGER"],
      },
      prisma,
    );
    expect(roleUpdate.ok).toBe(true);

    const targetUserAfterRole = await prisma.user.findUniqueOrThrow({
      where: { email: targetEmail },
    });
    expect(targetUserAfterRole.sessionVersion).toBe(targetUserBefore.sessionVersion + 1);

    // Deactivating target admin sets isActive=false and increments sessionVersion
    const deactivateTarget = await setAdminUserActiveStatus(
      {
        actor: superActor,
        targetAdminId: created.adminId,
        isActive: false,
      },
      prisma,
    );
    expect(deactivateTarget.ok).toBe(true);

    const targetAdminAfterDeactivate = await prisma.adminUser.findUniqueOrThrow({
      where: { id: created.adminId },
      include: { user: true },
    });
    expect(targetAdminAfterDeactivate.isActive).toBe(false);
    expect(targetAdminAfterDeactivate.user.sessionVersion).toBe(
      targetUserAfterRole.sessionVersion + 1,
    );

    // If superAdminRecord is the only active SUPER_ADMIN in DB, verify last-active-SUPER_ADMIN protection via another actor
    const activeSuperCount = await prisma.adminUser.count({
      where: {
        isActive: true,
        roles: { some: { role: { code: "SUPER_ADMIN" } } },
      },
    });
    if (activeSuperCount === 1) {
      const otherSuperActor: AuthenticatedAdmin = {
        ...superActor,
        adminId: "external-actor-check",
      };
      const lastSuperRoleRemoval = await updateAdminUserRoles(
        {
          actor: otherSuperActor,
          targetAdminId: superAdminRecord.id,
          roleCodes: ["ADMIN"],
        },
        prisma,
      );
      expect(lastSuperRoleRemoval.ok).toBe(false);

      const lastSuperDeactivate = await setAdminUserActiveStatus(
        {
          actor: otherSuperActor,
          targetAdminId: superAdminRecord.id,
          isActive: false,
        },
        prisma,
      );
      expect(lastSuperDeactivate.ok).toBe(false);
    }
  });
});
