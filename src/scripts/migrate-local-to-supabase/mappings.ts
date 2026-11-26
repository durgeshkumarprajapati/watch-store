import { PrismaClient } from "@prisma/client";

export interface IdentityMappings {
  userIdMap: Map<string, string>;
  adminIdMap: Map<string, string>;
  customerIdMap: Map<string, string>;
  roleIdMap: Map<string, string>;
  permissionIdMap: Map<string, string>;
  userEmailConflicts: Array<{ email: string; localId: string; destId: string }>;
  adminConflicts: Array<{ email: string; localAdminId: string; destAdminId: string }>;
  customerEmailConflicts: Array<{ email: string; localCustomerId: string; destCustomerId: string }>;
}

/**
 * Builds deterministic source-to-destination ID mappings for preserved Supabase
 * auth, RBAC, and pre-existing Customer records without modifying destination data.
 */
export async function buildIdentityMappings(
  source: PrismaClient,
  dest: PrismaClient
): Promise<IdentityMappings> {
  const [
    localUsers,
    destUsers,
    localAdmins,
    destAdmins,
    localCustomers,
    destCustomers,
    localRoles,
    destRoles,
    localPerms,
    destPerms,
  ] = await Promise.all([
    source.user.findMany({ select: { id: true, email: true } }),
    dest.user.findMany({ select: { id: true, email: true } }),
    source.adminUser.findMany({
      select: { id: true, user: { select: { email: true } } },
    }),
    dest.adminUser.findMany({
      select: { id: true, user: { select: { email: true } } },
    }),
    source.customer.findMany({ select: { id: true, email: true } }),
    dest.customer.findMany({ select: { id: true, email: true } }),
    source.adminRole.findMany({ select: { id: true, code: true } }),
    dest.adminRole.findMany({ select: { id: true, code: true } }),
    source.adminPermission.findMany({ select: { id: true, code: true } }),
    dest.adminPermission.findMany({ select: { id: true, code: true } }),
  ]);

  const destUserByEmail = new Map(destUsers.map((u) => [u.email.toLowerCase(), u.id]));
  const userIdMap = new Map<string, string>();
  const userEmailConflicts: Array<{ email: string; localId: string; destId: string }> = [];

  for (const lu of localUsers) {
    const destId = destUserByEmail.get(lu.email.toLowerCase());
    if (destId) {
      userIdMap.set(lu.id, destId);
      if (destId !== lu.id) {
        userEmailConflicts.push({ email: lu.email, localId: lu.id, destId });
      }
    }
  }

  const destAdminByEmail = new Map(
    destAdmins.map((a) => [a.user.email.toLowerCase(), a.id])
  );
  const adminIdMap = new Map<string, string>();
  const adminConflicts: Array<{ email: string; localAdminId: string; destAdminId: string }> = [];

  for (const la of localAdmins) {
    const destAdminId = destAdminByEmail.get(la.user.email.toLowerCase());
    if (destAdminId) {
      adminIdMap.set(la.id, destAdminId);
      if (destAdminId !== la.id) {
        adminConflicts.push({
          email: la.user.email,
          localAdminId: la.id,
          destAdminId,
        });
      }
    }
  }

  const destCustomerByEmail = new Map(
    destCustomers.map((c) => [c.email.toLowerCase(), c.id])
  );
  const customerIdMap = new Map<string, string>();
  const customerEmailConflicts: Array<{
    email: string;
    localCustomerId: string;
    destCustomerId: string;
  }> = [];

  for (const lc of localCustomers) {
    const destCustomerId = destCustomerByEmail.get(lc.email.toLowerCase());
    if (destCustomerId) {
      customerIdMap.set(lc.id, destCustomerId);
      if (destCustomerId !== lc.id) {
        customerEmailConflicts.push({
          email: lc.email,
          localCustomerId: lc.id,
          destCustomerId,
        });
      }
    }
  }

  const destRoleByCode = new Map(destRoles.map((r) => [r.code, r.id]));
  const roleIdMap = new Map<string, string>();
  for (const lr of localRoles) {
    const destId = destRoleByCode.get(lr.code);
    if (destId) roleIdMap.set(lr.id, destId);
  }

  const destPermByCode = new Map(destPerms.map((p) => [p.code, p.id]));
  const permissionIdMap = new Map<string, string>();
  for (const lp of localPerms) {
    const destId = destPermByCode.get(lp.code);
    if (destId) permissionIdMap.set(lp.id, destId);
  }

  return {
    userIdMap,
    adminIdMap,
    customerIdMap,
    roleIdMap,
    permissionIdMap,
    userEmailConflicts,
    adminConflicts,
    customerEmailConflicts,
  };
}

export function remapNullableId(
  id: string | null,
  map: Map<string, string>,
  fieldLabel: string
): string | null {
  if (id === null) return null;
  const mapped = map.get(id);
  if (!mapped) {
    throw new Error(`Unmapped ${fieldLabel} foreign key: ${id}`);
  }
  return mapped;
}
