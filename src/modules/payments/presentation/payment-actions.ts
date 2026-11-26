"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRazorpayConfig } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { initiateRazorpayPayment, type InitiatePaymentResult } from "../application/payment-service";
import {
  verifyRazorpayCheckoutPayment,
  type VerifyPaymentResult,
} from "../application/payment-verification-service";
import { verifyOrderAccessToken } from "../infrastructure/razorpay-signature";

const initiateSchema = z.object({
  orderNumber: z.string().trim().min(3).max(64),
  accessToken: z.string().trim().min(32).max(128),
});

const verifySchema = z.object({
  orderNumber: z.string().trim().min(3).max(64),
  accessToken: z.string().trim().min(32).max(128),
  razorpayOrderId: z.string().trim().min(4).max(128),
  razorpayPaymentId: z.string().trim().min(4).max(128),
  razorpaySignature: z.string().trim().min(32).max(256),
});

export async function initiatePaymentAction(
  orderNumber: string,
  accessToken: string,
): Promise<InitiatePaymentResult> {
  const parsed = initiateSchema.safeParse({ orderNumber, accessToken });
  if (!parsed.success) {
    return { ok: false, code: "UNAUTHORIZED", error: "Invalid payment initiation request." };
  }
  return initiateRazorpayPayment(parsed.data);
}

export async function verifyPaymentAction(raw: {
  orderNumber: string;
  accessToken: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<VerifyPaymentResult> {
  const parsed = verifySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_SIGNATURE", error: "Malformed payment verification payload." };
  }
  const result = await verifyRazorpayCheckoutPayment(parsed.data);
  if (result.ok) {
    revalidatePath("/checkout/confirmation");
  }
  return result;
}

export async function getOrderPaymentStatusAction(
  orderNumber: string,
  accessToken: string,
): Promise<
  | { ok: true; orderStatus: string; paymentStatus: string }
  | { ok: false; error: string }
> {
  const parsed = initiateSchema.safeParse({ orderNumber, accessToken });
  if (!parsed.success) {
    return { ok: false, error: "Invalid order lookup request." };
  }
  const { keySecret } = requireRazorpayConfig();
  const order = await getPrisma().order.findUnique({
    where: { orderNumber: parsed.data.orderNumber },
    select: { orderNumber: true, guestEmail: true, status: true, paymentStatus: true },
  });
  if (
    !order ||
    !verifyOrderAccessToken({
      token: parsed.data.accessToken,
      orderNumber: order.orderNumber,
      guestEmail: order.guestEmail,
      secret: keySecret,
    })
  ) {
    return { ok: false, error: "Order not found." };
  }
  return { ok: true, orderStatus: order.status, paymentStatus: order.paymentStatus };
}
