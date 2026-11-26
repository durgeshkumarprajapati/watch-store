import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  createRazorpayClient,
  RazorpayApiError,
  type RazorpayClient,
  type RazorpayPaymentDto,
} from "../infrastructure/razorpay-client";
import {
  markPaymentAuthorizedInTx,
  markPaymentCapturedInTx,
  markPaymentFailedInTx,
} from "./payment-settlement";

export interface PaymentReconciliationItemResult {
  paymentId: string;
  orderId: string;
  outcome:
    | "SETTLED_PAID"
    | "AUTHORIZED_PENDING_CAPTURE"
    | "MARKED_FAILED"
    | "NEEDS_MANUAL_RECONCILIATION"
    | "NO_CHANGE"
    | "PROVIDER_ERROR";
  note: string;
}

export interface PaymentReconciliationSummary {
  scanned: number;
  settledPaid: number;
  markedFailed: number;
  flaggedManual: number;
  providerErrors: number;
  results: PaymentReconciliationItemResult[];
}

export async function reconcileSinglePayment(
  paymentId: string,
  opts?: {
    prismaClient?: PrismaClient;
    razorpayClient?: RazorpayClient;
  },
): Promise<PaymentReconciliationItemResult> {
  const prisma = opts?.prismaClient ?? getPrisma();
  const rzp = opts?.razorpayClient ?? createRazorpayClient();
  const now = new Date();

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: { select: { id: true, orderNumber: true, status: true } },
      attempts: { orderBy: { attemptNumber: "desc" } },
    },
  });

  if (!payment) {
    return {
      paymentId,
      orderId: "",
      outcome: "NO_CHANGE",
      note: "Payment record not found.",
    };
  }

  if (payment.provider !== "RAZORPAY") {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      outcome: "NO_CHANGE",
      note: "Non-Razorpay payment does not require gateway reconciliation.",
    };
  }

  if (payment.status === "PAID" && !payment.needsReconciliation) {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      outcome: "NO_CHANGE",
      note: "Payment already settled.",
    };
  }

  const targetOrderId =
    payment.providerOrderId ??
    payment.attempts.find((a) => Boolean(a.razorpayOrderId))?.razorpayOrderId ??
    null;

  if (!targetOrderId && !payment.providerPaymentId) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        lastReconciledAt: now,
        reconciliationNote: "No Razorpay order or payment reference recorded.",
      },
    });
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      outcome: "NO_CHANGE",
      note: "No Razorpay order or payment reference recorded.",
    };
  }

  let providerPayments: RazorpayPaymentDto[] = [];
  try {
    if (targetOrderId) {
      providerPayments = await rzp.fetchOrderPayments(targetOrderId);
    } else if (payment.providerPaymentId) {
      const single = await rzp.fetchPayment(payment.providerPaymentId);
      providerPayments = [single];
    }
  } catch (err) {
    const msg =
      err instanceof RazorpayApiError
        ? `Razorpay fetch failed (${err.code}).`
        : "Razorpay provider lookup failed.";
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        needsReconciliation: true,
        lastReconciledAt: now,
        reconciliationNote: msg,
      },
    });
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      outcome: "PROVIDER_ERROR",
      note: msg,
    };
  }

  const captured = providerPayments.find(
    (p) => p.status === "captured" || p.captured === true,
  );
  if (captured) {
    const matchingAttempt =
      payment.attempts.find((a) => a.razorpayPaymentId === captured.id) ??
      payment.attempts.find((a) => a.razorpayOrderId === (captured.order_id ?? targetOrderId)) ??
      payment.attempts[0];

    const settlement = await prisma.$transaction((tx) =>
      markPaymentCapturedInTx(tx, {
        paymentId: payment.id,
        attemptId: matchingAttempt?.id,
        razorpayOrderId: captured.order_id ?? targetOrderId ?? "",
        razorpayPaymentId: captured.id,
        amountPaise: captured.amount,
        currency: captured.currency,
        metadata: captured as unknown as Prisma.InputJsonValue,
      }),
    );

    if (!settlement.ok) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          needsReconciliation: true,
          lastReconciledAt: now,
          reconciliationNote: settlement.error,
        },
      });
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        outcome: "NEEDS_MANUAL_RECONCILIATION",
        note: settlement.error,
      };
    }

    if (settlement.needsReconciliation) {
      const note = `Captured (${captured.id}) after reservation expiry — manual stock reconciliation required.`;
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          needsReconciliation: true,
          lastReconciledAt: now,
          reconciliationNote: note,
        },
      });
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        outcome: "NEEDS_MANUAL_RECONCILIATION",
        note,
      };
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        needsReconciliation: false,
        lastReconciledAt: now,
        reconciliationNote: `Reconciled captured payment ${captured.id}.`,
      },
    });
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      outcome: "SETTLED_PAID",
      note: `Reconciled captured payment ${captured.id}.`,
    };
  }

  const authorized = providerPayments.find((p) => p.status === "authorized");
  if (authorized) {
    const matchingAttempt =
      payment.attempts.find((a) => a.razorpayPaymentId === authorized.id) ??
      payment.attempts.find((a) => a.razorpayOrderId === (authorized.order_id ?? targetOrderId)) ??
      payment.attempts[0];

    await prisma.$transaction((tx) =>
      markPaymentAuthorizedInTx(tx, {
        paymentId: payment.id,
        attemptId: matchingAttempt?.id,
        razorpayOrderId: authorized.order_id ?? targetOrderId ?? "",
        razorpayPaymentId: authorized.id,
        metadata: authorized as unknown as Prisma.InputJsonValue,
      }),
    );

    const note = `Payment ${authorized.id} is authorized at Razorpay but not yet captured.`;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        needsReconciliation: true,
        lastReconciledAt: now,
        reconciliationNote: note,
      },
    });
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      outcome: "AUTHORIZED_PENDING_CAPTURE",
      note,
    };
  }

  const failed = providerPayments.find((p) => p.status === "failed");
  if (failed) {
    const matchingAttempt =
      payment.attempts.find((a) => a.razorpayPaymentId === failed.id) ??
      payment.attempts.find((a) => a.razorpayOrderId === (failed.order_id ?? targetOrderId)) ??
      payment.attempts[0];

    await prisma.$transaction((tx) =>
      markPaymentFailedInTx(tx, {
        paymentId: payment.id,
        attemptId: matchingAttempt?.id,
        razorpayPaymentId: failed.id,
        errorCode: failed.error_code ?? "PAYMENT_FAILED",
        errorMessage: failed.error_description ?? "Payment failed at Razorpay.",
        metadata: failed as unknown as Prisma.InputJsonValue,
      }),
    );

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        needsReconciliation: false,
        lastReconciledAt: now,
        reconciliationNote: `Reconciled failed payment ${failed.id}.`,
      },
    });
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      outcome: "MARKED_FAILED",
      note: `Reconciled failed payment ${failed.id}.`,
    };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      lastReconciledAt: now,
      reconciliationNote: "No captured, authorized, or failed payment found at Razorpay yet.",
    },
  });

  return {
    paymentId: payment.id,
    orderId: payment.orderId,
    outcome: "NO_CHANGE",
    note: "No captured, authorized, or failed payment found at Razorpay yet.",
  };
}

export async function reconcilePendingPayments(opts?: {
  prismaClient?: PrismaClient;
  razorpayClient?: RazorpayClient;
  batchSize?: number;
  staleMinutes?: number;
}): Promise<PaymentReconciliationSummary> {
  const prisma = opts?.prismaClient ?? getPrisma();
  const batchSize = Math.max(1, Math.min(opts?.batchSize ?? 20, 50));
  const staleMinutes = opts?.staleMinutes ?? 5;
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);

  const candidates = await prisma.payment.findMany({
    where: {
      provider: "RAZORPAY",
      OR: [
        { needsReconciliation: true, status: { not: "REFUNDED" } },
        {
          status: { in: ["PENDING", "REQUIRES_GATEWAY", "AUTHORIZED"] },
          updatedAt: { lte: cutoff },
        },
      ],
    },
    orderBy: [{ lastReconciledAt: "asc" }, { updatedAt: "asc" }],
    take: batchSize,
    select: { id: true },
  });

  const results: PaymentReconciliationItemResult[] = [];
  let settledPaid = 0;
  let markedFailed = 0;
  let flaggedManual = 0;
  let providerErrors = 0;

  for (const c of candidates) {
    const res = await reconcileSinglePayment(c.id, {
      prismaClient: prisma,
      razorpayClient: opts?.razorpayClient,
    });
    results.push(res);
    if (res.outcome === "SETTLED_PAID") settledPaid += 1;
    else if (res.outcome === "MARKED_FAILED") markedFailed += 1;
    else if (
      res.outcome === "NEEDS_MANUAL_RECONCILIATION" ||
      res.outcome === "AUTHORIZED_PENDING_CAPTURE"
    ) {
      flaggedManual += 1;
    } else if (res.outcome === "PROVIDER_ERROR") {
      providerErrors += 1;
    }
  }

  return {
    scanned: candidates.length,
    settledPaid,
    markedFailed,
    flaggedManual,
    providerErrors,
    results,
  };
}
