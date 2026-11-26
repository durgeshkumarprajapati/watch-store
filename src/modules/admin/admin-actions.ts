"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import type { AdminRoleCode } from "@prisma/client";
import { signIn, signOut } from "@/modules/auth/auth";
import { emailSchema, loginSchema, passwordPolicySchema } from "@/validations/auth";
import { recordAdminAuditLog } from "./admin-audit-service";
import {
  getAuthenticatedAdmin,
  requireAdminActionPermission,
  verifyAdminCredentials,
} from "./admin-auth-service";
import {
  createAdminUser,
  setAdminUserActiveStatus,
  updateAdminUserRoles,
} from "./admin-user-service";

const roleCodeSchema = z.enum([
  "SUPER_ADMIN",
  "ADMIN",
  "CATALOG_MANAGER",
  "ORDER_MANAGER",
  "INVENTORY_MANAGER",
  "CUSTOMER_SUPPORT",
]);

const createAdminSchema = z.object({
  name: z.string().trim().min(2, "Enter administrator name.").max(100),
  email: emailSchema,
  password: passwordPolicySchema,
  roleCodes: z.array(roleCodeSchema).min(1, "Select at least one role."),
});

const updateRolesSchema = z.object({
  targetAdminId: z.string().trim().min(1),
  roleCodes: z.array(roleCodeSchema).min(1, "Select at least one role."),
});

export async function adminLoginAction(raw: {
  email: string;
  password: string;
}): Promise<{ ok: false; error: string } | never> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid administrator credentials." };
  }

  const verified = await verifyAdminCredentials(parsed.data);
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/admin/dashboard",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Invalid administrator credentials." };
    }
    throw err;
  }
  redirect("/admin/dashboard");
}

export async function adminLogoutAction() {
  const admin = await getAuthenticatedAdmin();
  if (admin) {
    await recordAdminAuditLog({
      actorAdminId: admin.adminId,
      action: "ADMIN_LOGOUT",
      targetType: "AdminUser",
      targetId: admin.adminId,
      success: true,
    });
  }
  await signOut({ redirectTo: "/admin/login" });
}

export async function createAdminUserAction(raw: {
  name: string;
  email: string;
  password: string;
  roleCodes: AdminRoleCode[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAdminActionPermission("admins.create");
  const parsed = createAdminSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const res = await createAdminUser({ actor, ...parsed.data });
  if (!res.ok) return res;
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateAdminRolesAction(raw: {
  targetAdminId: string;
  roleCodes: AdminRoleCode[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAdminActionPermission("admins.update");
  const parsed = updateRolesSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const res = await updateAdminUserRoles({ actor, ...parsed.data });
  if (!res.ok) return res;
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function toggleAdminActiveAction(
  targetAdminId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAdminActionPermission("admins.deactivate");
  if (!targetAdminId) return { ok: false, error: "Invalid administrator ID." };
  const res = await setAdminUserActiveStatus({ actor, targetAdminId, isActive });
  if (!res.ok) return res;
  revalidatePath("/admin/users");
  return { ok: true };
}
