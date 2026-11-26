import type { Prisma, PrismaClient, ReservationStatus, StockAdjustmentReason } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { classifyStockStatus, type InventoryStockStatus } from "./inventory-validation";

export interface InventoryOverviewSummary {
  totalProducts: number;
  totalPhysicalUnits: number;
  totalReservedUnits: number;
  totalAvailableUnits: number;
  lowStockProducts: number;
  outOfStockProducts: number;
}

export interface InventoryListItem {
  productId: string;
  name: string;
  sku: string;
  slug: string;
  brandName: string;
  imageUrl: string | null;
  physicalStock: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  stockStatus: InventoryStockStatus;
  updatedAt: string;
}

export type InventorySort = "updated-desc" | "available-asc" | "available-desc" | "name-asc";

export interface InventoryListQuery {
  q?: string;
  brandId?: string;
  categoryId?: string;
  stockStatus?: InventoryStockStatus;
  sort?: InventorySort;
  page?: number;
  pageSize?: number;
}

export async function getInventoryOverviewSummary(
  prismaClient?: PrismaClient,
): Promise<InventoryOverviewSummary> {
  const prisma = prismaClient ?? getPrisma();
  const rows = await prisma.productStock.findMany({
    select: { available: true, reserved: true, lowStockThreshold: true },
  });

  let totalPhysicalUnits = 0;
  let totalReservedUnits = 0;
  let totalAvailableUnits = 0;
  let lowStockProducts = 0;
  let outOfStockProducts = 0;

  for (const r of rows) {
    totalAvailableUnits += r.available;
    totalReservedUnits += r.reserved;
    totalPhysicalUnits += r.available + r.reserved;
    const status = classifyStockStatus(r.available, r.lowStockThreshold);
    if (status === "OUT_OF_STOCK") outOfStockProducts += 1;
    else if (status === "LOW_STOCK") lowStockProducts += 1;
  }

  return {
    totalProducts: rows.length,
    totalPhysicalUnits,
    totalReservedUnits,
    totalAvailableUnits,
    lowStockProducts,
    outOfStockProducts,
  };
}

export async function listInventoryItems(
  query: InventoryListQuery = {},
  prismaClient?: PrismaClient,
): Promise<{
  items: InventoryListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const prisma = prismaClient ?? getPrisma();
  const pageSize = Math.min(Math.max(1, query.pageSize ?? 12), 50);
  const requestedPage = Math.max(1, query.page ?? 1);
  const q = query.q?.trim();

  const where: Prisma.ProductWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query.brandId ? { brandId: query.brandId } : {}),
    ...(query.categoryId ? { categories: { some: { categoryId: query.categoryId } } } : {}),
  };

  const rows = await prisma.product.findMany({
    where,
    include: {
      brand: { select: { name: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      stock: true,
    },
  });

  let mapped: InventoryListItem[] = rows.map((r) => {
    const available = r.stock?.available ?? 0;
    const reserved = r.stock?.reserved ?? 0;
    const threshold = r.stock?.lowStockThreshold ?? 3;
    return {
      productId: r.id,
      name: r.name,
      sku: r.sku,
      slug: r.slug,
      brandName: r.brand.name,
      imageUrl: r.images[0]?.url ?? null,
      physicalStock: available + reserved,
      reserved,
      available,
      lowStockThreshold: threshold,
      stockStatus: classifyStockStatus(available, threshold),
      updatedAt: (r.stock?.updatedAt ?? r.updatedAt).toISOString(),
    };
  });

  if (query.stockStatus) {
    mapped = mapped.filter((m) => m.stockStatus === query.stockStatus);
  }

  mapped.sort((a, b) => {
    switch (query.sort) {
      case "available-asc":
        return a.available - b.available || a.name.localeCompare(b.name);
      case "available-desc":
        return b.available - a.available || a.name.localeCompare(b.name);
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "updated-desc":
      default:
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    }
  });

  const total = mapped.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: mapped.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function listInventoryOptions(prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  const rows = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: { stock: true },
  });
  return rows.map((r) => {
    const available = r.stock?.available ?? 0;
    const reserved = r.stock?.reserved ?? 0;
    return {
      productId: r.id,
      name: r.name,
      sku: r.sku,
      available,
      reserved,
      physicalStock: available + reserved,
      lowStockThreshold: r.stock?.lowStockThreshold ?? 3,
    };
  });
}

export interface InventoryMovementRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  reason: StockAdjustmentReason;
  movementLabel: string;
  deltaAvailable: number;
  deltaReserved: number;
  previousPhysical: number | null;
  newPhysical: number | null;
  referenceId: string | null;
  note: string | null;
  actorLabel: string;
  isSystemActor: boolean;
  createdAt: string;
}

const MOVEMENT_LABEL: Record<StockAdjustmentReason, string> = {
  RESTOCK: "STOCK_INWARD",
  OUTWARD: "STOCK_OUTWARD",
  MANUAL_ADJUSTMENT: "STOCK_ADJUSTMENT",
  RESERVATION: "RESERVATION_CREATED",
  COMMIT: "RESERVATION_COMMITTED",
  RELEASE: "RESERVATION_RELEASED",
  EXPIRATION: "RESERVATION_EXPIRED",
};

export async function listInventoryMovements(
  query: {
    productId?: string;
    q?: string;
    reason?: StockAdjustmentReason;
    actorType?: "ADMIN" | "SYSTEM";
    referenceId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  } = {},
  prismaClient?: PrismaClient,
): Promise<{
  items: InventoryMovementRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const prisma = prismaClient ?? getPrisma();
  const pageSize = Math.min(Math.max(1, query.pageSize ?? 20), 50);
  const requestedPage = Math.max(1, query.page ?? 1);
  const q = query.q?.trim();
  const ref = query.referenceId?.trim();

  const where: Prisma.StockAdjustmentWhereInput = {
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.reason ? { reason: query.reason } : {}),
    ...(query.actorType === "ADMIN"
      ? { actorAdminId: { not: null } }
      : query.actorType === "SYSTEM"
        ? { actorAdminId: null }
        : {}),
    ...(ref ? { referenceId: { contains: ref, mode: "insensitive" } } : {}),
    ...(q
      ? {
          product: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
    ...(query.fromDate || query.toDate
      ? {
          createdAt: {
            ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
            ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const total = await prisma.stockAdjustment.count({ where });
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

  const rows = await prisma.stockAdjustment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      product: { select: { name: true, sku: true } },
      actorAdmin: { include: { user: { select: { name: true, email: true } } } },
    },
  });

  return {
    items: rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.product.name,
      sku: r.product.sku,
      reason: r.reason,
      movementLabel: MOVEMENT_LABEL[r.reason],
      deltaAvailable: r.deltaAvailable,
      deltaReserved: r.deltaReserved,
      previousPhysical: r.previousPhysical,
      newPhysical: r.newPhysical,
      referenceId: r.referenceId,
      note: r.note,
      actorLabel: r.actorAdmin
        ? r.actorAdmin.user.name ?? r.actorAdmin.user.email
        : "System (Checkout / Payment)",
      isSystemActor: !r.actorAdminId,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export interface InventoryReservationRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  status: ReservationStatus;
  orderNumber: string;
  expiresAt: string;
  committedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
}

export async function listInventoryReservations(
  query: {
    productId?: string;
    status?: ReservationStatus;
    q?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  } = {},
  prismaClient?: PrismaClient,
): Promise<{
  items: InventoryReservationRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const prisma = prismaClient ?? getPrisma();
  const pageSize = Math.min(Math.max(1, query.pageSize ?? 20), 50);
  const requestedPage = Math.max(1, query.page ?? 1);
  const q = query.q?.trim();

  const where: Prisma.InventoryReservationWhereInput = {
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(q
      ? {
          OR: [
            { order: { orderNumber: { contains: q, mode: "insensitive" } } },
            { product: { name: { contains: q, mode: "insensitive" } } },
            { product: { sku: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(query.fromDate || query.toDate
      ? {
          createdAt: {
            ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
            ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const total = await prisma.inventoryReservation.count({ where });
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

  const rows = await prisma.inventoryReservation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      product: { select: { name: true, sku: true } },
      order: { select: { orderNumber: true } },
    },
  });

  return {
    items: rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.product.name,
      sku: r.product.sku,
      quantity: r.quantity,
      status: r.status,
      orderNumber: r.order.orderNumber,
      expiresAt: r.expiresAt.toISOString(),
      committedAt: r.committedAt?.toISOString() ?? null,
      releasedAt: r.releasedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getProductInventoryDetail(
  productId: string,
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      brand: { select: { name: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      stock: true,
    },
  });
  if (!product) return null;

  const available = product.stock?.available ?? 0;
  const reserved = product.stock?.reserved ?? 0;
  const threshold = product.stock?.lowStockThreshold ?? 3;

  const [movements, reservations] = await Promise.all([
    listInventoryMovements({ productId, page: 1, pageSize: 10 }, prisma),
    listInventoryReservations({ productId, page: 1, pageSize: 10 }, prisma),
  ]);

  return {
    productId: product.id,
    name: product.name,
    sku: product.sku,
    slug: product.slug,
    brandName: product.brand.name,
    imageUrl: product.images[0]?.url ?? null,
    available,
    reserved,
    physicalStock: available + reserved,
    lowStockThreshold: threshold,
    stockStatus: classifyStockStatus(available, threshold),
    updatedAt: (product.stock?.updatedAt ?? product.updatedAt).toISOString(),
    movements: movements.items,
    reservations: reservations.items,
  };
}
