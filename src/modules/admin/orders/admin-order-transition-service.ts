import type { FulfilmentStatus, OrderStatus, PaymentProvider, PaymentStatus, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { canTransitionOrderStatus, canTransitionPaymentStatus } from "@/modules/checkout/status-transitions";
import { commitReservationInTx, releaseReservationInTx } from "@/modules/inventory/reservation-service";
import { enqueueOrderNotificationInTx } from "@/modules/notifications/notification-outbox-service";
import { recordAdminAuditLog } from "../admin-audit-service";
import type { AuthenticatedAdmin } from "../admin-auth-service";
import {
  cancelOrderSchema,
  confirmCodCollectionSchema,
  dispatchOrderSchema,
  packOrderSchema,
  transitionOrderSchema,
  type CancelOrderInput,
  type ConfirmCodCollectionInput,
  type DispatchOrderInput,
  type PackOrderInput,
  type TransitionOrderInput,
} from "./order-validation";

export type OrderMutationResult =
  | { ok: true; idempotentReplay: boolean; status: OrderStatus; fulfilmentStatus: FulfilmentStatus }
  | { ok: false; error: string };

class OrderRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderRuleError";
  }
}

interface LockedOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfilmentStatus: FulfilmentStatus;
  paymentStatus: PaymentStatus;
  paymentProvider: PaymentProvider;
  trackingNumber: string | null;
}

async function lockOrder(tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], orderId: string) {
  const rows = await tx.$queryRaw<LockedOrderRow[]>`
    SELECT "id", "orderNumber", "status", "fulfilmentStatus", "paymentStatus", "paymentProvider", "trackingNumber"
    FROM "Order"
    WHERE "id" = ${orderId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new OrderRuleError("Order not found.");
  return row;
}

async function checkHistoryIdempotency(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  idempotencyKey: string,
) {
  const existing = await tx.orderStatusHistory.findUnique({
    where: { idempotencyKey },
    include: { order: { select: { status: true, fulfilmentStatus: true } } },
  });
  if (!existing) return null;
  return {
    ok: true as const,
    idempotentReplay: true,
    status: existing.order.status,
    fulfilmentStatus: existing.order.fulfilmentStatus,
  };
}

export async function transitionAdminOrderStatus(
  actor: AuthenticatedAdmin,
  rawInput: TransitionOrderInput,
  prismaClient?: PrismaClient,
): Promise<OrderMutationResult> {
  const parsed = transitionOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid transition request." };
  }
  const d = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await checkHistoryIdempotency(tx, d.idempotencyKey);
      if (replay) return replay;

      const order = await lockOrder(tx, d.orderId);
      if (!canTransitionOrderStatus(order.status, d.targetStatus)) {
        throw new OrderRuleError(`Cannot transition order from ${order.status} to ${d.targetStatus}.`);
      }

      if (order.paymentProvider === "RAZORPAY" && order.paymentStatus !== "PAID") {
        throw new OrderRuleError(
          `Cannot advance unpaid Razorpay order (payment status: ${order.paymentStatus}).`,
        );
      }

      if (d.targetStatus === "DELIVERED" && order.fulfilmentStatus !== "DISPATCHED") {
        throw new OrderRuleError("Order must be dispatched before marking as delivered.");
      }

      // Confirming a COD order commits its active stock reservations atomically.
      if (d.targetStatus === "CONFIRMED" && order.paymentProvider === "COD") {
        const reservations = await tx.inventoryReservation.findMany({
          where: { orderId: order.id, status: "RESERVED" },
          select: { id: true },
        });
        for (const r of reservations) {
          await commitReservationInTx(tx, r.id);
        }
      }

      const nextFulfilment: FulfilmentStatus =
        d.targetStatus === "DELIVERED" ? "DELIVERED" : order.fulfilmentStatus;

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: d.targetStatus,
          fulfilmentStatus: nextFulfilment,
          ...(d.targetStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: d.targetStatus,
          note: d.note?.trim() || `Order transitioned to ${d.targetStatus} by administrator`,
          actorAdminId: actor.adminId,
          idempotencyKey: d.idempotencyKey,
        },
      });

      if (d.targetStatus === "CONFIRMED" && order.paymentProvider === "COD") {
        await enqueueOrderNotificationInTx(tx, {
          orderId: order.id,
          eventType: "COD_ORDER_CONFIRMED",
          dedupeKey: `COD_ORDER_CONFIRMED:${order.id}`,
        });
      } else if (d.targetStatus === "DELIVERED") {
        await enqueueOrderNotificationInTx(tx, {
          orderId: order.id,
          eventType: "ORDER_DELIVERED",
          dedupeKey: `ORDER_DELIVERED:${order.id}`,
        });
      }

      return {
        ok: true as const,
        idempotentReplay: false,
        status: d.targetStatus,
        fulfilmentStatus: nextFulfilment,
      };
    });

    if (!result.idempotentReplay) {
      await recordAdminAuditLog(
        {
          actorAdminId: actor.adminId,
          action: "ORDER_STATUS_TRANSITION",
          targetType: "Order",
          targetId: d.orderId,
          success: true,
          metadata: { targetStatus: d.targetStatus },
        },
        prisma,
      );
    }

    return result;
  } catch (error) {
    if (error instanceof OrderRuleError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function markOrderPacked(
  actor: AuthenticatedAdmin,
  rawInput: PackOrderInput,
  prismaClient?: PrismaClient,
): Promise<OrderMutationResult> {
  const parsed = packOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid pack input." };
  }
  const d = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await checkHistoryIdempotency(tx, d.idempotencyKey);
      if (replay) return replay;

      const order = await lockOrder(tx, d.orderId);
      if (order.status !== "CONFIRMED" && order.status !== "PROCESSING") {
        throw new OrderRuleError(
          `Order must be CONFIRMED or PROCESSING to pack (current: ${order.status}).`,
        );
      }
      if (order.fulfilmentStatus !== "AWAITING_PACKING") {
        throw new OrderRuleError(`Order fulfilment is already ${order.fulfilmentStatus}.`);
      }
      if (order.paymentProvider === "RAZORPAY" && order.paymentStatus !== "PAID") {
        throw new OrderRuleError("Cannot pack an unpaid Razorpay order.");
      }

      const nextStatus: OrderStatus = "PROCESSING";
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          fulfilmentStatus: "PACKED",
          packedAt: new Date(),
          packedByAdminId: actor.adminId,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: nextStatus,
          note: d.note?.trim() || "Order packed and ready for dispatch",
          actorAdminId: actor.adminId,
          idempotencyKey: d.idempotencyKey,
        },
      });

      return {
        ok: true as const,
        idempotentReplay: false,
        status: nextStatus,
        fulfilmentStatus: "PACKED" as FulfilmentStatus,
      };
    });

    if (!result.idempotentReplay) {
      await recordAdminAuditLog(
        {
          actorAdminId: actor.adminId,
          action: "ORDER_PACKED",
          targetType: "Order",
          targetId: d.orderId,
          success: true,
        },
        prisma,
      );
    }

    return result;
  } catch (error) {
    if (error instanceof OrderRuleError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function dispatchAdminOrder(
  actor: AuthenticatedAdmin,
  rawInput: DispatchOrderInput,
  prismaClient?: PrismaClient,
): Promise<OrderMutationResult> {
  const parsed = dispatchOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid dispatch input." };
  }
  const d = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await checkHistoryIdempotency(tx, d.idempotencyKey);
      if (replay) return replay;

      const order = await lockOrder(tx, d.orderId);
      if (order.status !== "PROCESSING" || order.fulfilmentStatus !== "PACKED") {
        throw new OrderRuleError("Order must be in PROCESSING / PACKED state before dispatch.");
      }
      if (order.paymentProvider === "RAZORPAY" && order.paymentStatus !== "PAID") {
        throw new OrderRuleError("Cannot dispatch an unpaid Razorpay order.");
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "SHIPPED",
          fulfilmentStatus: "DISPATCHED",
          carrierName: d.carrierName,
          trackingNumber: d.trackingNumber,
          trackingUrl: d.trackingUrl || null,
          shipmentReference: d.shipmentReference || null,
          shippingNotes: d.shippingNotes || null,
          shippedAt: new Date(),
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "SHIPPED",
          note: `Dispatched via ${d.carrierName} (Tracking: ${d.trackingNumber})`,
          actorAdminId: actor.adminId,
          idempotencyKey: d.idempotencyKey,
        },
      });

      await enqueueOrderNotificationInTx(tx, {
        orderId: order.id,
        eventType: "SHIPMENT_DISPATCHED",
        dedupeKey: `SHIPMENT_DISPATCHED:${order.id}`,
        courierName: d.carrierName,
        awbCode: d.trackingNumber,
        trackingUrl: d.trackingUrl || null,
      });

      return {
        ok: true as const,
        idempotentReplay: false,
        status: "SHIPPED" as OrderStatus,
        fulfilmentStatus: "DISPATCHED" as FulfilmentStatus,
      };
    });

    if (!result.idempotentReplay) {
      await recordAdminAuditLog(
        {
          actorAdminId: actor.adminId,
          action: "ORDER_DISPATCHED",
          targetType: "Order",
          targetId: d.orderId,
          success: true,
          metadata: { carrierName: d.carrierName, trackingNumber: d.trackingNumber },
        },
        prisma,
      );
    }

    return result;
  } catch (error) {
    if (error instanceof OrderRuleError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function confirmCodPaymentCollected(
  actor: AuthenticatedAdmin,
  rawInput: ConfirmCodCollectionInput,
  prismaClient?: PrismaClient,
): Promise<OrderMutationResult> {
  const parsed = confirmCodCollectionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid COD confirmation." };
  }
  const d = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await checkHistoryIdempotency(tx, d.idempotencyKey);
      if (replay) return replay;

      const order = await lockOrder(tx, d.orderId);
      if (order.paymentProvider !== "COD") {
        throw new OrderRuleError("Only COD orders can be marked collected manually.");
      }
      if (order.status === "CANCELLED") {
        throw new OrderRuleError("Cannot mark a cancelled order as paid.");
      }
      if (order.paymentStatus === "PAID") {
        throw new OrderRuleError("COD payment is already recorded as PAID.");
      }
      if (!canTransitionPaymentStatus(order.paymentStatus, "PAID")) {
        throw new OrderRuleError(`Cannot transition payment from ${order.paymentStatus} to PAID.`);
      }

      const now = new Date();
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID" },
      });

      await tx.payment.updateMany({
        where: { orderId: order.id, provider: "COD", status: { not: "PAID" } },
        data: { status: "PAID", verifiedAt: now, capturedAt: now },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: order.status,
          note: d.note?.trim() || "COD payment collection confirmed by administrator",
          actorAdminId: actor.adminId,
          idempotencyKey: d.idempotencyKey,
        },
      });

      return {
        ok: true as const,
        idempotentReplay: false,
        status: order.status,
        fulfilmentStatus: order.fulfilmentStatus,
      };
    });

    if (!result.idempotentReplay) {
      await recordAdminAuditLog(
        {
          actorAdminId: actor.adminId,
          action: "ORDER_COD_PAID_CONFIRMED",
          targetType: "Order",
          targetId: d.orderId,
          success: true,
        },
        prisma,
      );
    }

    return result;
  } catch (error) {
    if (error instanceof OrderRuleError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function cancelAdminOrder(
  actor: AuthenticatedAdmin,
  rawInput: CancelOrderInput,
  prismaClient?: PrismaClient,
): Promise<OrderMutationResult> {
  const parsed = cancelOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid cancellation input." };
  }
  const d = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await checkHistoryIdempotency(tx, d.idempotencyKey);
      if (replay) return replay;

      const order = await lockOrder(tx, d.orderId);
      if (!canTransitionOrderStatus(order.status, "CANCELLED")) {
        throw new OrderRuleError(
          `Order in ${order.status} status cannot be cancelled.`,
        );
      }

      const reservations = await tx.inventoryReservation.findMany({
        where: { orderId: order.id },
        select: { id: true, status: true },
      });

      let releasedCount = 0;
      let committedCount = 0;
      for (const r of reservations) {
        if (r.status === "RESERVED") {
          const released = await releaseReservationInTx(tx, r.id, "RELEASED");
          if (released) releasedCount += 1;
        } else if (r.status === "COMMITTED") {
          committedCount += 1;
        }
      }

      const manualRefundRequired =
        order.paymentProvider === "RAZORPAY" && order.paymentStatus === "PAID";

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          fulfilmentStatus: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: d.reason,
          cancellationNotes: d.notes?.trim() || null,
          manualRefundRequired,
        },
      });

      const inventorySummary =
        committedCount > 0
          ? "Committed stock retained (manual inward required if physically returned)"
          : `Released ${releasedCount} active reservation(s)`;
      const refundSummary = manualRefundRequired
        ? " • Prepaid order marked awaiting manual refund"
        : "";

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "CANCELLED",
          note: `Cancelled (${d.reason}) — ${inventorySummary}${refundSummary}`,
          actorAdminId: actor.adminId,
          idempotencyKey: d.idempotencyKey,
        },
      });

      await enqueueOrderNotificationInTx(tx, {
        orderId: order.id,
        eventType: "ORDER_CANCELLED",
        dedupeKey: `ORDER_CANCELLED:${order.id}`,
      });

      return {
        ok: true as const,
        idempotentReplay: false,
        status: "CANCELLED" as OrderStatus,
        fulfilmentStatus: "CANCELLED" as FulfilmentStatus,
      };
    });

    if (!result.idempotentReplay) {
      await recordAdminAuditLog(
        {
          actorAdminId: actor.adminId,
          action: "ORDER_CANCELLED",
          targetType: "Order",
          targetId: d.orderId,
          success: true,
          metadata: { reason: d.reason },
        },
        prisma,
      );
    }

    return result;
  } catch (error) {
    if (error instanceof OrderRuleError) return { ok: false, error: error.message };
    throw error;
  }
}
