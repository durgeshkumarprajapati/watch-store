import { PrismaClient, type AdminRoleCode } from "@prisma/client";
import { ADMIN_PERMISSIONS, ADMIN_ROLE_DEFINITIONS } from "../src/modules/admin/rbac-catalogue";

export async function seedRbac(prisma: PrismaClient) {
  const permIdByCode = new Map<string, string>();
  for (const code of ADMIN_PERMISSIONS) {
    const perm = await prisma.adminPermission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
    permIdByCode.set(code, perm.id);
  }

  for (const [roleCode, def] of Object.entries(ADMIN_ROLE_DEFINITIONS) as [
    AdminRoleCode,
    (typeof ADMIN_ROLE_DEFINITIONS)[AdminRoleCode],
  ][]) {
    const role = await prisma.adminRole.upsert({
      where: { code: roleCode },
      create: {
        code: roleCode,
        name: def.name,
        description: def.description,
      },
      update: {
        name: def.name,
        description: def.description,
      },
    });

    const desiredPermIds = def.permissions.map((c) => permIdByCode.get(c)!);
    for (const permissionId of desiredPermIds) {
      await prisma.adminRolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
    await prisma.adminRolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: desiredPermIds },
      },
    });
  }
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("seed-rbac.ts") || process.argv[1].endsWith("seed-rbac.js"));

if (isDirect) {
  const client = new PrismaClient();
  seedRbac(client)
    .then(() => console.log(`Seeded 6 admin roles and ${ADMIN_PERMISSIONS.length} permissions.`))
    .catch((err) => {
      console.error("RBAC seed failed:", err);
      process.exitCode = 1;
    })
    .finally(() => client.$disconnect());
}
