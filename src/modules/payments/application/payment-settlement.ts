import "server-only";
import type { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { canTransitionOrderStatus, canTransitionPaymentStatus } from "@/modules/checkout/status-transitions";
import { commitReservationInTx } from "@/modules/inventory/reservation-service";
import { enqueueOrderNotificationInTx } from "@/modules/notifications/notification-outbox-service";

export type SettlementResult =
  | {
      ok: true;
      alreadyPaid: boolean;
      needsReconciliation: boolean;
      orderNumber: string;
      orderStatus: OrderStatus;
      paymentStatus: PaymentStatus;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "AMOUNT_MISMATCH" | "CURRENCY_MISMATCH" | "PAYMENT_CONFLICT" | "INVALID_TRANSITION";
      error: string;
    };

export async function markPaymentCapturedInTx(
  tx: Prisma.TransactionClient,
  params: {
    paymentId: string;
    attemptId?: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    amountPaise: number;
    currency: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<SettlementResult> {
  const payment = await tx.payment.findUnique({
    where: { id: params.paymentId },
    include: {
      order: {
        include: { reservations: true },
      },
    },
  });

  if (!payment) {
    return { ok: false, code: "NOT_FOUND", error: "Payment record not found." };
  }

  if (payment.amountPaise !== params.amountPaise) {
    return { ok: false, code: "AMOUNT_MISMATCH", error: "Payment amount mismatch." };
  }

  if (payment.currency !== params.currency) {
    return { ok: false, code: "CURRENCY_MISMATCH", error: "Payment currency mismatch." };
  }

  if (payment.status === "PAID") {
    if (payment.providerPaymentId && payment.providerPaymentId !== params.razorpayPaymentId) {
      return {
        ok: false,
        code: "PAYMENT_CONFLICT",
        error: "Order is already paid with a different payment.",
      };
    }
    return {
      ok: true,
      alreadyPaid: true,
      needsReconciliation: false,
      orderNumber: payment.order.orderNumber,
      orderStatus: payment.order.status,
      paymentStatus: payment.status,
    };
  }

  if (!canTransitionPaymentStatus(payment.status, "PAID")) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      error: `Cannot transition payment from ${payment.status} to PAID.`,
    };
  }

  const now = new Date();
  const reservations = payment.order.reservations;
  const hasExpiredOrReleased = reservations.some(
    (r) => r.status === "EXPIRED" || r.status === "RELEASED",
  );

  // Conditional update ensures only one concurrent caller settles the payment.
  const updatedPayment = await tx.payment.updateMany({
    where: { id: payment.id, status: { not: "PAID" } },
    data: {
      status: "PAID",
      providerOrderId: params.razorpayOrderId,
      providerPaymentId: params.razorpayPaymentId,
      verifiedAt: now,
      capturedAt: now,
    },
  });

  if (updatedPayment.count === 0) {
    const reloaded = await tx.payment.findUnique({
      where: { id: payment.id },
      include: { order: true },
    });
    return {
      ok: true,
      alreadyPaid: true,
      needsReconciliation: false,
      orderNumber: reloaded?.order.orderNumber ?? payment.order.orderNumber,
      orderStatus: reloaded?.order.status ?? payment.order.status,
      paymentStatus: reloaded?.status ?? "PAID",
    };
  }

  if (params.attemptId) {
    await tx.paymentAttempt.update({
      where: { id: params.attemptId },
      data: {
        status: "PAID",
        razorpayOrderId: params.razorpayOrderId,
        razorpayPaymentId: params.razorpayPaymentId,
        providerRef: params.razorpayPaymentId,
        verifiedAt: now,
        capturedAt: now,
        ...(params.metadata !== undefined ? { gatewayMetadata: params.metadata } : {}),
      },
    });
  }

  // If reservations already expired/released, record payment capture but DO NOT
  // silently commit unavailable stock or mark order CONFIRMED.
  if (hasExpiredOrReleased) {
    await tx.order.update({
      where: { id: payment.order.id },
      data: { paymentStatus: "PAID" },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.order.id,
        fromStatus: payment.order.status,
        toStatus: payment.order.status,
        note: `Payment ${params.razorpayPaymentId} captured after reservation expiry — requires stock reconciliation`,
      },
    });
    return {
      ok: true,
      alreadyPaid: false,
      needsReconciliation: true,
      orderNumber: payment.order.orderNumber,
      orderStatus: payment.order.status,
      paymentStatus: "PAID",
    };
  }

  // Commit each RESERVED inventory reservation exactly once.
  for (const res of reservations) {
    if (res.status === "RESERVED") {
      await commitReservationInTx(tx, res.id);
    }
  }

  let nextOrderStatus = payment.order.status;
  if (canTransitionOrderStatus(payment.order.status, "CONFIRMED")) {
    nextOrderStatus = "CONFIRMED";
    await tx.order.update({
      where: { id: payment.order.id },
      data: {
        status: "CONFIRMED",
        paymentStatus: "PAID",
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.order.id,
        fromStatus: payment.order.status,
        toStatus: "CONFIRMED",
        note: `Payment captured (${params.razorpayPaymentId})`,
      },
    });
  } else {
    await tx.order.update({
      where: { id: payment.order.id },
      data: { paymentStatus: "PAID" },
    });
  }

  await enqueueOrderNotificationInTx(tx, {
    orderId: payment.order.id,
    eventType: "PAYMENT_SUCCESS",
    dedupeKey: `PAYMENT_SUCCESS:${payment.order.id}`,
  });
  if (nextOrderStatus === "CONFIRMED") {
    await enqueueOrderNotificationInTx(tx, {
      orderId: payment.order.id,
      eventType: "ORDER_CONFIRMED",
      dedupeKey: `ORDER_CONFIRMED:${payment.order.id}`,
    });
  }

  return {
    ok: true,
    alreadyPaid: false,
    needsReconciliation: false,
    orderNumber: payment.order.orderNumber,
    orderStatus: nextOrderStatus,
    paymentStatus: "PAID",
  };
}

export async function markPaymentAuthorizedInTx(
  tx: Prisma.TransactionClient,
  params: {
    paymentId: string;
    attemptId?: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const payment = await tx.payment.findUnique({
    where: { id: params.paymentId },
    include: { order: true },
  });
  if (!payment || payment.status === "PAID") return;
  if (!canTransitionPaymentStatus(payment.status, "AUTHORIZED")) return;

  await tx.payment.updateMany({
    where: { id: payment.id, status: { notIn: ["PAID", "AUTHORIZED"] } },
    data: {
      status: "AUTHORIZED",
      providerOrderId: params.razorpayOrderId,
      providerPaymentId: params.razorpayPaymentId,
      verifiedAt: new Date(),
    },
  });

  await tx.order.updateMany({
    where: { id: payment.order.id, paymentStatus: { notIn: ["PAID", "AUTHORIZED"] } },
    data: { paymentStatus: "AUTHORIZED" },
  });

  if (params.attemptId) {
    await tx.paymentAttempt.update({
      where: { id: params.attemptId },
      data: {
        status: "AUTHORIZED",
        razorpayPaymentId: params.razorpayPaymentId,
        providerRef: params.razorpayPaymentId,
        verifiedAt: new Date(),
        ...(params.metadata !== undefined ? { gatewayMetadata: params.metadata } : {}),
      },
    });
  }
}

export async function markPaymentFailedInTx(
  tx: Prisma.TransactionClient,
  params: {
    paymentId: string;
    attemptId?: string;
    razorpayPaymentId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const payment = await tx.payment.findUnique({
    where: { id: params.paymentId },
    include: { order: true },
  });
  if (!payment || payment.status === "PAID" || payment.status === "AUTHORIZED") return;

  if (canTransitionPaymentStatus(payment.status, "FAILED")) {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    await tx.order.update({
      where: { id: payment.order.id },
      data: { paymentStatus: "FAILED" },
    });
    await enqueueOrderNotificationInTx(tx, {
      orderId: payment.order.id,
      eventType: "PAYMENT_FAILED",
      dedupeKey: `PAYMENT_FAILED:${payment.id}:${params.attemptId ?? params.razorpayPaymentId ?? "failed"}`,
    });
  }

  if (params.attemptId) {
    await tx.paymentAttempt.update({
      where: { id: params.attemptId },
      data: {
        status: "FAILED",
        ...(params.razorpayPaymentId ? { razorpayPaymentId: params.razorpayPaymentId, providerRef: params.razorpayPaymentId } : {}),
        errorCode: params.errorCode ?? "PAYMENT_FAILED",
        errorMessage: params.errorMessage ?? "Payment failed at gateway.",
        ...(params.metadata !== undefined ? { gatewayMetadata: params.metadata } : {}),
      },
    });
  }
}
