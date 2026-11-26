import type {
  FulfilmentStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export interface AdminOrderSummary {
  totalOrders: number;
  pendingOrders: number;
  confirmedOrders: number;
  processingOrders: number;
  packedOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  pendingCodOrders: number;
  awaitingPaymentOrders: number;
}

export async function getAdminOrderSummary(
  prismaClient?: PrismaClient,
): Promise<AdminOrderSummary> {
  const prisma = prismaClient ?? getPrisma();
  const [
    totalOrders,
    pendingOrders,
    confirmedOrders,
    processingOrders,
    packedOrders,
    shippedOrders,
    deliveredOrders,
    cancelledOrders,
    pendingCodOrders,
    awaitingPaymentOrders,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "CONFIRMED" } }),
    prisma.order.count({ where: { status: "PROCESSING" } }),
    prisma.order.count({ where: { fulfilmentStatus: "PACKED", status: { not: "CANCELLED" } } }),
    prisma.order.count({ where: { status: "SHIPPED" } }),
    prisma.order.count({ where: { status: "DELIVERED" } }),
    prisma.order.count({ where: { status: "CANCELLED" } }),
    prisma.order.count({
      where: { paymentProvider: "COD", paymentStatus: "PENDING", status: { not: "CANCELLED" } },
    }),
    prisma.order.count({
      where: {
        paymentProvider: "RAZORPAY",
        paymentStatus: { in: ["PENDING", "REQUIRES_GATEWAY", "AUTHORIZED"] },
        status: { not: "CANCELLED" },
      },
    }),
  ]);

  return {
    totalOrders,
    pendingOrders,
    confirmedOrders,
    processingOrders,
    packedOrders,
    shippedOrders,
    deliveredOrders,
    cancelledOrders,
    pendingCodOrders,
    awaitingPaymentOrders,
  };
}

export type AdminOrderSort = "created-desc" | "created-asc" | "total-desc" | "total-asc";

export interface AdminOrderListQuery {
  q?: string;
  status?: OrderStatus;
  fulfilmentStatus?: FulfilmentStatus;
  paymentStatus?: PaymentStatus;
  paymentProvider?: PaymentProvider;
  fromDate?: string;
  toDate?: string;
  sort?: AdminOrderSort;
  page?: number;
  pageSize?: number;
}

export async function listAdminOrders(
  query: AdminOrderListQuery = {},
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const pageSize = Math.min(Math.max(1, query.pageSize ?? 15), 50);
  const requestedPage = Math.max(1, query.page ?? 1);
  const q = query.q?.trim();

  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.fulfilmentStatus ? { fulfilmentStatus: query.fulfilmentStatus } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(query.paymentProvider ? { paymentProvider: query.paymentProvider } : {}),
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
            { orderNumber: { contains: q, mode: "insensitive" } },
            { guestName: { contains: q, mode: "insensitive" } },
            { guestEmail: { contains: q, mode: "insensitive" } },
            { guestPhone: { contains: q, mode: "insensitive" } },
            {
              items: {
                some: {
                  OR: [
                    { productNameSnapshot: { contains: q, mode: "insensitive" } },
                    { skuSnapshot: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  let orderBy: Prisma.OrderOrderByWithRelationInput = { createdAt: "desc" };
  switch (query.sort) {
    case "created-asc":
      orderBy = { createdAt: "asc" };
      break;
    case "total-desc":
      orderBy = { grandTotalPaise: "desc" };
      break;
    case "total-asc":
      orderBy = { grandTotalPaise: "asc" };
      break;
    case "created-desc":
    default:
      orderBy = { createdAt: "desc" };
  }

  const total = await prisma.order.count({ where });
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

  const rows = await prisma.order.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      _count: { select: { items: true } },
    },
  });

  return {
    items: rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      guestName: r.guestName,
      guestEmail: r.guestEmail,
      guestPhone: r.guestPhone,
      itemCount: r._count.items,
      grandTotalPaise: r.grandTotalPaise,
      paymentProvider: r.paymentProvider,
      paymentStatus: r.paymentStatus,
      status: r.status,
      fulfilmentStatus: r.fulfilmentStatus,
      manualRefundRequired: r.manualRefundRequired,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getAdminOrderDetail(orderId: string, prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
            },
          },
        },
      },
      addressSnapshot: true,
      packedByAdmin: { include: { user: { select: { name: true, email: true } } } },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: { actorAdmin: { include: { user: { select: { name: true, email: true } } } } },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        include: {
          attempts: {
            orderBy: { attemptNumber: "desc" },
            select: {
              id: true,
              attemptNumber: true,
              status: true,
              providerRef: true,
              razorpayOrderId: true,
              razorpayPaymentId: true,
              errorCode: true,
              errorMessage: true,
              verifiedAt: true,
              capturedAt: true,
              createdAt: true,
            },
          },
        },
      },
      reservations: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { select: { sku: true, name: true } },
        },
      },
      shipments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return order;
}
