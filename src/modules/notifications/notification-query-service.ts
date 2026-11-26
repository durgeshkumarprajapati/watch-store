import type { NotificationEventType, NotificationStatus, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

export async function getAdminNotificationSummary(prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  const [total, sent, pending, failed, deadLetter] = await Promise.all([
    prisma.notification.count(),
    prisma.notification.count({ where: { status: "SENT" } }),
    prisma.notification.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    prisma.notification.count({ where: { status: "FAILED" } }),
    prisma.notification.count({ where: { status: "DEAD_LETTER" } }),
  ]);
  return { total, sent, pending, failed, deadLetter };
}

export async function listAdminNotifications(
  query: {
    q?: string;
    eventType?: NotificationEventType;
    status?: NotificationStatus;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  } = {},
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const pageSize = Math.min(Math.max(1, query.pageSize ?? 20), 50);
  const requestedPage = Math.max(1, query.page ?? 1);
  const q = query.q?.trim();

  const where: Prisma.NotificationWhereInput = {
    ...(query.eventType ? { eventType: query.eventType } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.fromDate || query.toDate
      ? {
          createdAt: {
            ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
            ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { recipient: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
            { order: { orderNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await prisma.notification.count({ where });
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

  const items = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      order: { select: { id: true, orderNumber: true } },
    },
  });

  return { items, total, page, pageSize, totalPages };
}

export async function getAdminNotificationDetail(
  notificationId: string,
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  return prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      order: { select: { id: true, orderNumber: true } },
      customer: { select: { id: true, fullName: true } },
      job: true,
    },
  });
}

export const notificationPreferenceSchema = z.object({
  shippingUpdatesEnabled: z.boolean(),
});

export async function getCustomerNotificationPreferences(
  customerId: string,
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const pref = await prisma.notificationPreference.findUnique({
    where: { customerId },
  });
  return {
    orderUpdatesEnabled: true,
    paymentUpdatesEnabled: true,
    accountSecurityUpdatesEnabled: true,
    shippingUpdatesEnabled: pref?.shippingUpdatesEnabled ?? true,
    updatedAt: pref?.updatedAt.toISOString() ?? null,
  };
}

export async function updateCustomerNotificationPreferences(
  customerId: string,
  rawInput: { shippingUpdatesEnabled: boolean },
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = notificationPreferenceSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Invalid notification preference settings." };
  }

  const prisma = prismaClient ?? getPrisma();
  await prisma.notificationPreference.upsert({
    where: { customerId },
    create: {
      customerId,
      orderUpdatesEnabled: true,
      paymentUpdatesEnabled: true,
      accountSecurityUpdatesEnabled: true,
      shippingUpdatesEnabled: parsed.data.shippingUpdatesEnabled,
    },
    update: {
      shippingUpdatesEnabled: parsed.data.shippingUpdatesEnabled,
    },
  });

  return { ok: true };
}
