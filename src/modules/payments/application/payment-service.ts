import "server-only";
import type { PrismaClient } from "@prisma/client";
import { requireRazorpayConfig } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import {
  RazorpayApiError,
  createRazorpayClient,
  type RazorpayClient,
} from "../infrastructure/razorpay-client";
import { verifyOrderAccessToken } from "../infrastructure/razorpay-signature";
import { markPaymentCapturedInTx } from "./payment-settlement";

export type InitiatePaymentResult =
  | {
      ok: true;
      alreadyPaid: false;
      orderNumber: string;
      keyId: string;
      razorpayOrderId: string;
      amountPaise: number;
      currency: "INR";
      prefill: { name: string; email: string; contact: string };
    }
  | {
      ok: true;
      alreadyPaid: true;
      orderNumber: string;
      orderStatus: string;
      paymentStatus: string;
    }
  | {
      ok: false;
      code: "UNAUTHORIZED" | "NOT_FOUND" | "INVALID_METHOD" | "ALREADY_PAID" | "GATEWAY_ERROR";
      error: string;
    };

export async function initiateRazorpayPayment(params: {
  orderNumber: string;
  accessToken: string;
  prismaClient?: PrismaClient;
  razorpayClient?: RazorpayClient;
  config?: { keyId: string; keySecret: string };
}): Promise<InitiatePaymentResult> {
  const cfg = params.config ?? requireRazorpayConfig();
  const prisma = params.prismaClient ?? getPrisma();
  const rzp =
    params.razorpayClient ?? createRazorpayClient({ keyId: cfg.keyId, keySecret: cfg.keySecret });

  const order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          attempts: { orderBy: { attemptNumber: "desc" } },
        },
      },
    },
  });

  if (!order) {
    return { ok: false, code: "NOT_FOUND", error: "Order not found." };
  }

  const validToken = verifyOrderAccessToken({
    token: params.accessToken,
    orderNumber: order.orderNumber,
    guestEmail: order.guestEmail,
    secret: cfg.keySecret,
  });
  if (!validToken) {
    return { ok: false, code: "UNAUTHORIZED", error: "Unauthorized order access." };
  }

  if (order.paymentProvider !== "RAZORPAY") {
    return { ok: false, code: "INVALID_METHOD", error: "Order does not use online payment." };
  }

  const payment = order.payments[0];
  if (!payment) {
    return { ok: false, code: "NOT_FOUND", error: "Payment record not found." };
  }

  if (payment.status === "PAID" || order.paymentStatus === "PAID") {
    return {
      ok: true,
      alreadyPaid: true,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paymentStatus: "PAID",
    };
  }

  const latestAttempt = payment.attempts[0];

  // Reconcile any existing Razorpay order before creating a retry attempt.
  if (latestAttempt?.razorpayOrderId && latestAttempt.status !== "FAILED") {
    try {
      const existingPayments = await rzp.fetchOrderPayments(latestAttempt.razorpayOrderId);
      const captured = existingPayments.find((p) => p.status === "captured");
      if (captured) {
        const settled = await prisma.$transaction((tx) =>
          markPaymentCapturedInTx(tx, {
            paymentId: payment.id,
            attemptId: latestAttempt.id,
            razorpayOrderId: latestAttempt.razorpayOrderId!,
            razorpayPaymentId: captured.id,
            amountPaise: captured.amount,
            currency: captured.currency,
          }),
        );
        if (settled.ok) {
          return {
            ok: true,
            alreadyPaid: true,
            orderNumber: settled.orderNumber,
            orderStatus: settled.orderStatus,
            paymentStatus: settled.paymentStatus,
          };
        }
      }

      // Reuse the existing unpaid Razorpay order instead of creating a duplicate.
      return {
        ok: true,
        alreadyPaid: false,
        orderNumber: order.orderNumber,
        keyId: cfg.keyId,
        razorpayOrderId: latestAttempt.razorpayOrderId,
        amountPaise: payment.amountPaise,
        currency: "INR",
        prefill: {
          name: order.guestName,
          email: order.guestEmail,
          contact: order.guestPhone,
        },
      };
    } catch {
      // If reconciliation fetch failed transiently, do not create a conflicting order blindly.
      return {
        ok: false,
        code: "GATEWAY_ERROR",
        error: "Unable to verify existing payment session. Please try again in a moment.",
      };
    }
  }

  const nextAttemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;

  // Create Razorpay order outside DB transaction.
  let rzpOrder;
  try {
    rzpOrder = await rzp.createOrder({
      amountPaise: payment.amountPaise,
      currency: "INR",
      receipt: `${order.orderNumber}-A${nextAttemptNumber}`,
      notes: {
        orderNumber: order.orderNumber,
        attempt: String(nextAttemptNumber),
      },
    });
  } catch (err) {
    const code = err instanceof RazorpayApiError ? err.code : "GATEWAY_ERROR";
    const message = err instanceof RazorpayApiError ? err.message : "Payment gateway unavailable.";
    await prisma.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        attemptNumber: nextAttemptNumber,
        status: "FAILED",
        errorCode: code,
        errorMessage: message,
      },
    });
    return {
      ok: false,
      code: "GATEWAY_ERROR",
      error: "Unable to initiate online payment right now. Your order is saved and you can retry.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        attemptNumber: nextAttemptNumber,
        status: "REQUIRES_GATEWAY",
        razorpayOrderId: rzpOrder.id,
        providerRef: rzpOrder.id,
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "REQUIRES_GATEWAY",
        providerOrderId: rzpOrder.id,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "REQUIRES_GATEWAY" },
    });
  });

  return {
    ok: true,
    alreadyPaid: false,
    orderNumber: order.orderNumber,
    keyId: cfg.keyId,
    razorpayOrderId: rzpOrder.id,
    amountPaise: payment.amountPaise,
    currency: "INR",
    prefill: {
      name: order.guestName,
      email: order.guestEmail,
      contact: order.guestPhone,
    },
  };
}
