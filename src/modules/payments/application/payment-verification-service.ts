import "server-only";
import type { OrderStatus, PaymentStatus, Prisma, PrismaClient } from "@prisma/client";
import { requireRazorpayConfig } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { createRazorpayClient, type RazorpayClient } from "../infrastructure/razorpay-client";
import {
  verifyOrderAccessToken,
  verifyRazorpayCheckoutSignature,
} from "../infrastructure/razorpay-signature";
import {
  markPaymentAuthorizedInTx,
  markPaymentCapturedInTx,
  markPaymentFailedInTx,
} from "./payment-settlement";

export type VerifyPaymentResult =
  | {
      ok: true;
      orderNumber: string;
      orderStatus: OrderStatus;
      paymentStatus: PaymentStatus;
      needsReconciliation: boolean;
    }
  | {
      ok: false;
      code:
        | "UNAUTHORIZED"
        | "NOT_FOUND"
        | "INVALID_SIGNATURE"
        | "MISMATCH"
        | "NOT_CAPTURED"
        | "GATEWAY_ERROR";
      error: string;
    };

export async function verifyRazorpayCheckoutPayment(params: {
  orderNumber: string;
  accessToken: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  prismaClient?: PrismaClient;
  razorpayClient?: RazorpayClient;
  config?: { keyId: string; keySecret: string };
}): Promise<VerifyPaymentResult> {
  const cfg = params.config ?? requireRazorpayConfig();
  const prisma = params.prismaClient ?? getPrisma();
  const rzp =
    params.razorpayClient ?? createRazorpayClient({ keyId: cfg.keyId, keySecret: cfg.keySecret });

  const attempt = await prisma.paymentAttempt.findUnique({
    where: { razorpayOrderId: params.razorpayOrderId },
    include: {
      payment: {
        include: { order: true },
      },
    },
  });

  if (!attempt || attempt.payment.order.orderNumber !== params.orderNumber) {
    return { ok: false, code: "NOT_FOUND", error: "Matching payment attempt not found." };
  }

  const order = attempt.payment.order;
  const validToken = verifyOrderAccessToken({
    token: params.accessToken,
    orderNumber: order.orderNumber,
    guestEmail: order.guestEmail,
    secret: cfg.keySecret,
  });
  if (!validToken) {
    return { ok: false, code: "UNAUTHORIZED", error: "Unauthorized order access." };
  }

  const validSignature = verifyRazorpayCheckoutSignature({
    razorpayOrderId: params.razorpayOrderId,
    razorpayPaymentId: params.razorpayPaymentId,
    signature: params.razorpaySignature,
    keySecret: cfg.keySecret,
  });
  if (!validSignature) {
    return { ok: false, code: "INVALID_SIGNATURE", error: "Payment signature verification failed." };
  }

  // Idempotent short-circuit if already paid with the same payment ID.
  if (attempt.payment.status === "PAID" && attempt.payment.providerPaymentId === params.razorpayPaymentId) {
    return {
      ok: true,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paymentStatus: "PAID",
      needsReconciliation: false,
    };
  }

  // Authoritative server-side fetch from Razorpay.
  let rzpPayment;
  try {
    rzpPayment = await rzp.fetchPayment(params.razorpayPaymentId);
  } catch {
    return {
      ok: false,
      code: "GATEWAY_ERROR",
      error: "Unable to confirm payment with gateway. Please refresh status shortly.",
    };
  }

  if (rzpPayment.order_id && rzpPayment.order_id !== params.razorpayOrderId) {
    return { ok: false, code: "MISMATCH", error: "Payment does not belong to this order." };
  }
  if (rzpPayment.amount !== attempt.payment.amountPaise || rzpPayment.currency !== attempt.payment.currency) {
    return { ok: false, code: "MISMATCH", error: "Payment amount or currency mismatch." };
  }

  if (rzpPayment.status === "captured") {
    const settled = await prisma.$transaction((tx) =>
      markPaymentCapturedInTx(tx, {
        paymentId: attempt.payment.id,
        attemptId: attempt.id,
        razorpayOrderId: params.razorpayOrderId,
        razorpayPaymentId: rzpPayment.id,
        amountPaise: rzpPayment.amount,
        currency: rzpPayment.currency,
        metadata: rzpPayment as unknown as Prisma.InputJsonValue,
      }),
    );

    if (!settled.ok) {
      return { ok: false, code: "MISMATCH", error: settled.error };
    }

    return {
      ok: true,
      orderNumber: settled.orderNumber,
      orderStatus: settled.orderStatus,
      paymentStatus: settled.paymentStatus,
      needsReconciliation: settled.needsReconciliation,
    };
  }

  if (rzpPayment.status === "authorized") {
    await prisma.$transaction((tx) =>
      markPaymentAuthorizedInTx(tx, {
        paymentId: attempt.payment.id,
        attemptId: attempt.id,
        razorpayOrderId: params.razorpayOrderId,
        razorpayPaymentId: rzpPayment.id,
        metadata: rzpPayment as unknown as Prisma.InputJsonValue,
      }),
    );
    return {
      ok: false,
      code: "NOT_CAPTURED",
      error: "Payment is authorized and awaiting capture confirmation.",
    };
  }

  await prisma.$transaction((tx) =>
    markPaymentFailedInTx(tx, {
      paymentId: attempt.payment.id,
      attemptId: attempt.id,
      razorpayPaymentId: rzpPayment.id,
      errorCode: rzpPayment.error_code ?? "NOT_CAPTURED",
      errorMessage: rzpPayment.error_description ?? `Gateway status: ${rzpPayment.status}`,
      metadata: rzpPayment as unknown as Prisma.InputJsonValue,
    }),
  );

  return {
    ok: false,
    code: "NOT_CAPTURED",
    error: "Payment was not completed. You can retry payment for this order.",
  };
}
