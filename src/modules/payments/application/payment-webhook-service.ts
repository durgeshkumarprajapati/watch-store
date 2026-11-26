import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { requireRazorpayWebhookSecret } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { scheduleImmediatePushDispatch } from "@/modules/notifications/notification-worker-service";
import { verifyRazorpayWebhookSignature } from "../infrastructure/razorpay-signature";
import {
  markPaymentAuthorizedInTx,
  markPaymentCapturedInTx,
  markPaymentFailedInTx,
} from "./payment-settlement";

export type WebhookProcessResult = {
  status: number;
  body: { ok: boolean; duplicate?: boolean; message: string };
};

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        error_code?: string | null;
        error_description?: string | null;
      };
    };
    order?: {
      entity?: {
        id?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };
  };
}

export async function processRazorpayWebhook(params: {
  rawBody: string;
  signature: string | null;
  eventIdHeader?: string | null;
  prismaClient?: PrismaClient;
  webhookSecret?: string;
}): Promise<WebhookProcessResult> {
  const secret = params.webhookSecret ?? requireRazorpayWebhookSecret();
  if (!params.signature) {
    return { status: 401, body: { ok: false, message: "Missing signature." } };
  }

  const valid = verifyRazorpayWebhookSignature({
    rawBody: params.rawBody,
    signature: params.signature,
    webhookSecret: secret,
  });
  if (!valid) {
    return { status: 401, body: { ok: false, message: "Invalid signature." } };
  }

  let parsed: RazorpayWebhookPayload;
  try {
    parsed = JSON.parse(params.rawBody) as RazorpayWebhookPayload;
  } catch {
    return { status: 400, body: { ok: false, message: "Malformed JSON payload." } };
  }

  const eventType = parsed.event;
  if (!eventType || typeof eventType !== "string") {
    return { status: 400, body: { ok: false, message: "Missing event type." } };
  }

  const paymentEntity = parsed.payload?.payment?.entity;
  const orderEntity = parsed.payload?.order?.entity;
  const razorpayOrderId = paymentEntity?.order_id ?? orderEntity?.id ?? null;
  const razorpayPaymentId = paymentEntity?.id ?? null;

  const eventId =
    params.eventIdHeader?.trim() ||
    createHash("sha256").update(`${eventType}:${params.rawBody}`).digest("hex");

  const prisma = params.prismaClient ?? getPrisma();

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Persist event ID with unique constraint for durable deduplication.
      try {
        await tx.razorpayWebhookEvent.create({
          data: {
            eventId,
            eventType,
            razorpayOrderId,
            razorpayPaymentId,
            payload: parsed as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return { duplicate: true, message: "Duplicate webhook event ignored." };
        }
        throw err;
      }

      if (razorpayOrderId) {
        const attempt = await tx.paymentAttempt.findUnique({
          where: { razorpayOrderId },
          include: { payment: true },
        });
        const payment =
          attempt?.payment ??
          (await tx.payment.findUnique({ where: { providerOrderId: razorpayOrderId } }));

        if (payment) {
          if (eventType === "payment.captured" || eventType === "order.paid") {
            const amount = paymentEntity?.amount ?? orderEntity?.amount ?? payment.amountPaise;
            const currency = paymentEntity?.currency ?? orderEntity?.currency ?? payment.currency;
            if (razorpayPaymentId) {
              await markPaymentCapturedInTx(tx, {
                paymentId: payment.id,
                attemptId: attempt?.id,
                razorpayOrderId,
                razorpayPaymentId,
                amountPaise: amount,
                currency,
                metadata: parsed as unknown as Prisma.InputJsonValue,
              });
            }
          } else if (eventType === "payment.authorized" && razorpayPaymentId) {
            await markPaymentAuthorizedInTx(tx, {
              paymentId: payment.id,
              attemptId: attempt?.id,
              razorpayOrderId,
              razorpayPaymentId,
              metadata: parsed as unknown as Prisma.InputJsonValue,
            });
          } else if (eventType === "payment.failed") {
            await markPaymentFailedInTx(tx, {
              paymentId: payment.id,
              attemptId: attempt?.id,
              razorpayPaymentId,
              errorCode: paymentEntity?.error_code ?? "PAYMENT_FAILED",
              errorMessage: paymentEntity?.error_description ?? "Payment failed via webhook.",
              metadata: parsed as unknown as Prisma.InputJsonValue,
            });
          }
        }
      }

      await tx.razorpayWebhookEvent.update({
        where: { eventId },
        data: { processedAt: new Date() },
      });

      return { duplicate: false, message: "Webhook processed." };
    });

    if (!outcome.duplicate) {
      scheduleImmediatePushDispatch();
    }

    return {
      status: 200,
      body: { ok: true, duplicate: outcome.duplicate, message: outcome.message },
    };
  } catch (err) {
    console.error("Webhook processing error:", err instanceof Error ? err.message : "Unknown error");
    return { status: 500, body: { ok: false, message: "Webhook processing failed." } };
  }
}
