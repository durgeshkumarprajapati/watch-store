import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";

export const RESERVATION_TTL_MINUTES = 30;

export class InsufficientStockError extends Error {
  readonly productId: string;
  constructor(productId: string, message = "Insufficient stock available for reservation.") {
    super(message);
    this.name = "InsufficientStockError";
    this.productId = productId;
  }
}

export async function reserveStockInTx(
  tx: Prisma.TransactionClient,
  params: {
    orderId: string;
    orderItemId: string;
    productId: string;
    quantity: number;
    expiresAt?: Date;
  },
) {
  const { orderId, orderItemId, productId, quantity } = params;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Reservation quantity must be a positive integer.");
  }

  // Atomic conditional update prevents negative stock under concurrent checkouts.
  const updated = await tx.productStock.updateMany({
    where: {
      productId,
      available: { gte: quantity },
    },
    data: {
      available: { decrement: quantity },
      reserved: { increment: quantity },
    },
  });

  if (updated.count !== 1) {
    throw new InsufficientStockError(productId);
  }

  const expiresAt =
    params.expiresAt ?? new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);

  const reservation = await tx.inventoryReservation.create({
    data: {
      orderId,
      orderItemId,
      productId,
      quantity,
      status: "RESERVED",
      expiresAt,
    },
  });

  await tx.stockAdjustment.create({
    data: {
      productId,
      deltaAvailable: -quantity,
      deltaReserved: quantity,
      reason: "RESERVATION",
      referenceId: orderId,
      note: `Reserved ${quantity} unit(s) for order item ${orderItemId}`,
    },
  });

  return reservation;
}

export async function commitReservationInTx(
  tx: Prisma.TransactionClient,
  reservationId: string,
): Promise<boolean> {
  const existing = await tx.inventoryReservation.findUnique({
    where: { id: reservationId },
  });
  if (!existing || existing.status !== "RESERVED") return false;

  const updated = await tx.inventoryReservation.updateMany({
    where: { id: reservationId, status: "RESERVED" },
    data: { status: "COMMITTED", committedAt: new Date() },
  });
  if (updated.count !== 1) return false;

  await tx.productStock.updateMany({
    where: { productId: existing.productId, reserved: { gte: existing.quantity } },
    data: { reserved: { decrement: existing.quantity } },
  });

  await tx.stockAdjustment.create({
    data: {
      productId: existing.productId,
      deltaAvailable: 0,
      deltaReserved: -existing.quantity,
      reason: "COMMIT",
      referenceId: existing.orderId,
      note: `Committed reservation ${reservationId}`,
    },
  });

  return true;
}

export async function releaseReservationInTx(
  tx: Prisma.TransactionClient,
  reservationId: string,
  targetStatus: "RELEASED" | "EXPIRED" = "RELEASED",
): Promise<boolean> {
  const existing = await tx.inventoryReservation.findUnique({
    where: { id: reservationId },
  });
  if (!existing || existing.status !== "RESERVED") return false;

  const updated = await tx.inventoryReservation.updateMany({
    where: { id: reservationId, status: "RESERVED" },
    data: { status: targetStatus, releasedAt: new Date() },
  });
  if (updated.count !== 1) return false;

  await tx.productStock.updateMany({
    where: { productId: existing.productId, reserved: { gte: existing.quantity } },
    data: {
      available: { increment: existing.quantity },
      reserved: { decrement: existing.quantity },
    },
  });

  await tx.stockAdjustment.create({
    data: {
      productId: existing.productId,
      deltaAvailable: existing.quantity,
      deltaReserved: -existing.quantity,
      reason: targetStatus === "EXPIRED" ? "EXPIRATION" : "RELEASE",
      referenceId: existing.orderId,
      note: `${targetStatus} reservation ${reservationId}`,
    },
  });

  return true;
}

/**
 * Safe, idempotent, concurrency-locked expiration cleanup service.
 * - Uses FOR UPDATE SKIP LOCKED to avoid overlapping worker contention.
 * - Never releases a reservation if its Order is CONFIRMED/PROCESSING/SHIPPED/DELIVERED
 *   or has a PAID payment (commits it instead).
 */
export async function cleanupExpiredReservations(
  prisma: PrismaClient,
  now = new Date(),
  opts?: { batchSize?: number },
): Promise<number> {
  const batchSize = Math.max(1, Math.min(opts?.batchSize ?? 50, 200));
  const expired = await prisma.inventoryReservation.findMany({
    where: {
      status: "RESERVED",
      expiresAt: { lte: now },
    },
    orderBy: { expiresAt: "asc" },
    take: batchSize,
    select: { id: true },
  });

  let releasedCount = 0;
  for (const row of expired) {
    const outcome = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "InventoryReservation"
        WHERE "id" = ${row.id}
          AND "status" = 'RESERVED'
          AND "expiresAt" <= ${now}
        FOR UPDATE SKIP LOCKED
      `;
      if (locked.length === 0) return "skipped" as const;

      const reservation = await tx.inventoryReservation.findUnique({
        where: { id: row.id },
        include: {
          order: {
            select: {
              status: true,
              paymentStatus: true,
              payments: { select: { status: true } },
            },
          },
        },
      });
      if (!reservation || reservation.status !== "RESERVED") return "skipped" as const;

      const orderIsPaidOrFulfilled =
        reservation.order.paymentStatus === "PAID" ||
        reservation.order.status === "CONFIRMED" ||
        reservation.order.status === "PROCESSING" ||
        reservation.order.status === "SHIPPED" ||
        reservation.order.status === "DELIVERED" ||
        reservation.order.payments.some((p) => p.status === "PAID");

      if (orderIsPaidOrFulfilled) {
        await commitReservationInTx(tx, row.id);
        return "committed" as const;
      }

      const released = await releaseReservationInTx(tx, row.id, "EXPIRED");
      return released ? ("released" as const) : ("skipped" as const);
    });

    if (outcome === "released") releasedCount += 1;
  }

  return releasedCount;
}
