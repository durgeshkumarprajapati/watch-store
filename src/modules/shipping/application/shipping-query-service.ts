import type { Prisma, PrismaClient, ShipmentStatus, ShippingProvider } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export async function listAdminShipments(
  query: {
    q?: string;
    status?: ShipmentStatus;
    provider?: ShippingProvider;
    reconciliationOnly?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const pageSize = Math.min(Math.max(1, query.pageSize ?? 15), 50);
  const requestedPage = Math.max(1, query.page ?? 1);
  const q = query.q?.trim();

  const where: Prisma.ShipmentWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.provider ? { provider: query.provider } : {}),
    ...(query.reconciliationOnly ? { reconciliationRequired: true } : {}),
    ...(q
      ? {
          OR: [
            { awbCode: { contains: q, mode: "insensitive" } },
            { shiprocketOrderId: { contains: q, mode: "insensitive" } },
            { courierName: { contains: q, mode: "insensitive" } },
            { order: { orderNumber: { contains: q, mode: "insensitive" } } },
            { order: { guestName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await prisma.shipment.count({ where });
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

  const items = await prisma.shipment.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          guestName: true,
          status: true,
          paymentProvider: true,
          paymentStatus: true,
        },
      },
    },
  });

  return { items, total, page, pageSize, totalPages };
}

export async function getAdminShipmentDetail(shipmentId: string, prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  return prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      order: {
        include: {
          addressSnapshot: true,
          items: true,
        },
      },
      statusHistory: {
        orderBy: { eventAt: "desc" },
        include: { actorAdmin: { include: { user: { select: { name: true, email: true } } } } },
      },
      jobs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}

export async function getCustomerOrderShipments(
  orderId: string,
  customerId: string,
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    select: { id: true },
  });
  if (!order) return [];

  return prisma.shipment.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      isManual: true,
      status: true,
      awbCode: true,
      courierName: true,
      trackingUrl: true,
      lastSyncedAt: true,
      statusHistory: {
        orderBy: { eventAt: "desc" },
        select: {
          id: true,
          toStatus: true,
          location: true,
          note: true,
          eventAt: true,
        },
      },
    },
  });
}
