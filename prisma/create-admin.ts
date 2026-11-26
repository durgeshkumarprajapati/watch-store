/**
 * Secure CLI to provision the first SUPER_ADMIN (or specified AdminRoleCode).
 * Never hardcode credentials. Pass via environment variables:
 *   ADMIN_PROVISION_EMAIL="..." ADMIN_PROVISION_NAME="..." ADMIN_PROVISION_PASSWORD="..." npm run admin:create
 */
import { PrismaClient, type AdminRoleCode } from "@prisma/client";
import argon2 from "argon2";
import { emailSchema, passwordPolicySchema } from "../src/validations/auth";
import { seedRbac } from "./seed-rbac";

async function main() {
  const emailRaw = process.env.ADMIN_PROVISION_EMAIL ?? "";
  const nameRaw = (process.env.ADMIN_PROVISION_NAME ?? "Super Admin").trim();
  const passwordRaw = process.env.ADMIN_PROVISION_PASSWORD ?? "";
  const roleCode = (process.env.ADMIN_PROVISION_ROLE ?? "SUPER_ADMIN") as AdminRoleCode;

  const emailParsed = emailSchema.safeParse(emailRaw);
  const passParsed = passwordPolicySchema.safeParse(passwordRaw);
  if (!emailParsed.success || !passParsed.success || nameRaw.length < 2) {
    console.error(
      "Usage: ADMIN_PROVISION_EMAIL=... ADMIN_PROVISION_NAME=... ADMIN_PROVISION_PASSWORD=... npm run admin:create",
    );
    process.exit(1);
  }

  const email = emailParsed.data;
  const passwordHash = await argon2.hash(passParsed.data, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const prisma = new PrismaClient();
  try {
    await seedRbac(prisma);
    const role = await prisma.adminRole.findUnique({ where: { code: roleCode } });
    if (!role) throw new Error(`Unknown role: ${roleCode}`);

    const admin = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        create: {
          email,
          name: nameRaw,
          passwordHash,
          emailVerified: new Date(),
        },
        update: {
          name: nameRaw,
          passwordHash,
          emailVerified: new Date(),
          sessionVersion: { increment: 1 },
        },
      });

      const adminUser = await tx.adminUser.upsert({
        where: { userId: user.id },
        create: { userId: user.id, isActive: true },
        update: { isActive: true },
      });

      await tx.adminUserRole.upsert({
        where: { adminUserId_roleId: { adminUserId: adminUser.id, roleId: role.id } },
        create: { adminUserId: adminUser.id, roleId: role.id },
        update: {},
      });

      await tx.adminAuditLog.create({
        data: {
          actorAdminId: adminUser.id,
          action: "ADMIN_PROVISIONED_CLI",
          targetType: "AdminUser",
          targetId: adminUser.id,
          success: true,
          metadata: { roleCode },
        },
      });

      return adminUser;
    });

    console.log(`Provisioned active ${roleCode} admin (${admin.id}) for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Admin provisioning failed:", err instanceof Error ? err.message : "Unknown error");
  process.exit(1);
});
