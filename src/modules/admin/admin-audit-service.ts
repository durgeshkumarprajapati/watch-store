import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export async function recordAdminAuditLog(
  params: {
    actorAdminId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    success: boolean;
    metadata?: Prisma.InputJsonValue;
  },
  client?: PrismaClient | Prisma.TransactionClient,
) {
  const db = client ?? getPrisma();
  await db.adminAuditLog.create({
    data: {
      actorAdminId: params.actorAdminId ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      success: params.success,
      ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
    },
  });
}

export async function listAdminAuditLogs(
  opts: { page?: number; pageSize?: number } = {},
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 25), 100);
  const page = Math.max(1, opts.page ?? 1);
  const total = await prisma.adminAuditLog.count();
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);

  const items = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    include: {
      actorAdmin: {
        include: {
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  return { items, total, page: safePage, pageSize, totalPages };
}
