import { createHmac, timingSafeEqual } from "node:crypto";

function timingSafeHexEqual(expectedHex: string, receivedHex: string): boolean {
  const normalized = receivedHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) return false;
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(normalized, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verifies Razorpay Checkout callback signature:
 * HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET)
 */
export function verifyRazorpayCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const { razorpayOrderId, razorpayPaymentId, signature, keySecret } = params;
  if (!razorpayOrderId || !razorpayPaymentId || !signature || !keySecret) return false;
  const expected = createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  return timingSafeHexEqual(expected, signature);
}

/**
 * Verifies Razorpay Webhook signature against the raw request body:
 * HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
 */
export function verifyRazorpayWebhookSignature(params: {
  rawBody: string | Buffer;
  signature: string;
  webhookSecret: string;
}): boolean {
  const { rawBody, signature, webhookSecret } = params;
  if (!rawBody || !signature || !webhookSecret) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return timingSafeHexEqual(expected, signature);
}

/**
 * HMAC-signed access token binding guest order confirmation, status checks,
 * and payment retries to a specific persisted order without exposing DB IDs.
 */
export function createOrderAccessToken(params: {
  orderNumber: string;
  guestEmail: string;
  secret: string;
}): string {
  return createHmac("sha256", params.secret)
    .update(`order-access:${params.orderNumber}:${params.guestEmail.toLowerCase()}`)
    .digest("hex");
}

export function verifyOrderAccessToken(params: {
  token: string;
  orderNumber: string;
  guestEmail: string;
  secret: string;
}): boolean {
  if (!params.token || !params.orderNumber || !params.guestEmail || !params.secret) {
    return false;
  }
  const expected = createOrderAccessToken({
    orderNumber: params.orderNumber,
    guestEmail: params.guestEmail,
    secret: params.secret,
  });
  return timingSafeHexEqual(expected, params.token);
}
