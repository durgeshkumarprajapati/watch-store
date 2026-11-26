import "server-only";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { PushOwner } from "./push-subscription-service";
import { isSafeRelativeTargetUrl } from "./push-validation";

export interface InboxNotificationItem {
  id: string;
  eventType: string;
  title: string;
  body: string;
  targetUrl: string;
  readAt: string | null;
  createdAt: string;
}

export interface InboxPageResult {
  items: InboxNotificationItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unreadCount: number;
}

function ownerWhere(owner: PushOwner) {
  return owner.type === "customer"
    ? { customerId: owner.customerId, adminUserId: null }
    : { adminUserId: owner.adminUserId };
}

export async function getInboxUnreadCount(
  owner: PushOwner,
  prismaClient?: PrismaClient,
): Promise<number> {
  const prisma = prismaClient ?? getPrisma();
  return prisma.notification.count({
    where: {
      ...ownerWhere(owner),
      channel: "IN_APP",
      readAt: null,
    },
  });
}

export async function listInboxNotifications(
  owner: PushOwner,
  opts?: { page?: number; pageSize?: number },
  prismaClient?: PrismaClient,
): Promise<InboxPageResult> {
  const prisma = prismaClient ?? getPrisma();
  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(opts?.pageSize ?? 15)));
  const where = {
    ...ownerWhere(owner),
    channel: "IN_APP" as const,
  };

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        eventType: true,
        subject: true,
        payload: true,
        targetUrl: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);

  const items: InboxNotificationItem[] = rows.map((r) => {
    const payloadObj =
      r.payload && typeof r.payload === "object" && !Array.isArray(r.payload)
        ? (r.payload as Record<string, unknown>)
        : {};
    const body =
      typeof payloadObj.summaryBody === "string"
        ? payloadObj.summaryBody
        : typeof payloadObj.orderNumber === "string"
          ? `Order ${payloadObj.orderNumber}`
          : r.subject;

    return {
      id: r.id,
      eventType: r.eventType,
      title: r.subject,
      body,
      targetUrl: isSafeRelativeTargetUrl(r.targetUrl),
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    unreadCount,
  };
}

export async function markInboxNotificationRead(
  owner: PushOwner,
  notificationId: string,
  prismaClient?: PrismaClient,
): Promise<{ ok: boolean }> {
  const prisma = prismaClient ?? getPrisma();
  const res = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      ...ownerWhere(owner),
      channel: "IN_APP",
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return { ok: res.count > 0 };
}

export async function markAllInboxNotificationsRead(
  owner: PushOwner,
  prismaClient?: PrismaClient,
): Promise<{ updated: number }> {
  const prisma = prismaClient ?? getPrisma();
  const res = await prisma.notification.updateMany({
    where: {
      ...ownerWhere(owner),
      channel: "IN_APP",
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return { updated: res.count };
}
