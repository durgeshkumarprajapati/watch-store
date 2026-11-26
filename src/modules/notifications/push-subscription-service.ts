import "server-only";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { isVapidConfigured } from "./push-sender";
import { pushSubscriptionInputSchema, validatePushEndpoint } from "./push-validation";

export type PushOwner =
  | { type: "customer"; customerId: string }
  | { type: "admin"; adminUserId: string };

export interface SanitizedPushDevice {
  id: string;
  endpointHost: string;
  userAgent: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

function toSanitizedDevice(row: {
  id: string;
  endpoint: string;
  userAgent: string | null;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}): SanitizedPushDevice {
  let host = "push-provider";
  try {
    host = new URL(row.endpoint).hostname;
  } catch {
    // fallback
  }
  return {
    id: row.id,
    endpointHost: host,
    userAgent: row.userAgent,
    isActive: row.isActive,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function upsertPushSubscription(
  owner: PushOwner,
  rawInput: unknown,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; device: SanitizedPushDevice } | { ok: false; status: number; error: string }> {
  const parsed = pushSubscriptionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "Invalid push subscription." };
  }

  const endpointCheck = validatePushEndpoint(parsed.data.endpoint);
  if (!endpointCheck.ok) {
    return { ok: false, status: 400, error: endpointCheck.error };
  }

  const prisma = prismaClient ?? getPrisma();
  const ownerData =
    owner.type === "customer"
      ? { customerId: owner.customerId, adminUserId: null }
      : { customerId: null, adminUserId: owner.adminUserId };

  const row = await prisma.pushSubscription.upsert({
    where: { endpoint: endpointCheck.url },
    create: {
      ...ownerData,
      endpoint: endpointCheck.url,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent ?? null,
      isActive: true,
    },
    update: {
      ...ownerData,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent ?? null,
      isActive: true,
    },
  });

  return { ok: true, device: toSanitizedDevice(row) };
}

export async function deactivatePushSubscription(
  owner: PushOwner,
  params: { subscriptionId?: string; endpoint?: string },
  prismaClient?: PrismaClient,
): Promise<{ ok: true; deactivatedCount: number }> {
  const prisma = prismaClient ?? getPrisma();
  const ownerWhere =
    owner.type === "customer"
      ? { customerId: owner.customerId }
      : { adminUserId: owner.adminUserId };

  const res = await prisma.pushSubscription.updateMany({
    where: {
      ...ownerWhere,
      ...(params.subscriptionId ? { id: params.subscriptionId } : {}),
      ...(params.endpoint ? { endpoint: params.endpoint } : {}),
    },
    data: { isActive: false },
  });

  return { ok: true, deactivatedCount: res.count };
}

export async function getPushSubscriptionStatus(
  owner: PushOwner,
  prismaClient?: PrismaClient,
): Promise<{ vapidConfigured: boolean; activeCount: number; devices: SanitizedPushDevice[] }> {
  const prisma = prismaClient ?? getPrisma();
  const ownerWhere =
    owner.type === "customer"
      ? { customerId: owner.customerId }
      : { adminUserId: owner.adminUserId };

  const rows = await prisma.pushSubscription.findMany({
    where: { ...ownerWhere, isActive: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return {
    vapidConfigured: isVapidConfigured(),
    activeCount: rows.length,
    devices: rows.map(toSanitizedDevice),
  };
}

/**
 * Resolves ALL active, email-verified AdminUser browser subscriptions without
 * filtering by role or permission.
 */
export async function listActiveAdminPushSubscriptions(prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  return prisma.pushSubscription.findMany({
    where: {
      isActive: true,
      adminUserId: { not: null },
      adminUser: {
        isActive: true,
        user: { emailVerified: { not: null } },
      },
    },
    select: {
      id: true,
      adminUserId: true,
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  });
}
