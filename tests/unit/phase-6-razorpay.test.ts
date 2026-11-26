import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRazorpayClient, RazorpayApiError } from "@/modules/payments/infrastructure/razorpay-client";
import {
  createOrderAccessToken,
  verifyOrderAccessToken,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from "@/modules/payments/infrastructure/razorpay-signature";
import { processRazorpayWebhook } from "@/modules/payments/application/payment-webhook-service";
import { requireRazorpayConfig, requireRazorpayWebhookSecret } from "@/config/env";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Razorpay client", () => {
  it("constructs POST /v1/orders with Basic Auth, INR amount, and receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "order_test_123",
          entity: "order",
          amount: 14500000,
          currency: "INR",
          receipt: "WS-1001-A1",
          status: "created",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = createRazorpayClient({
      keyId: "rzp_test_key",
      keySecret: "rzp_test_secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const order = await client.createOrder({
      amountPaise: 14500000,
      currency: "INR",
      receipt: "WS-1001-A1",
    });

    expect(order.id).toBe("order_test_123");
    expect(order.amount).toBe(14500000);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.method).toBe("POST");
    const expectedAuth = `Basic ${Buffer.from("rzp_test_key:rzp_test_secret").toString("base64")}`;
    expect(init.headers.Authorization).toBe(expectedAuth);
  });

  it("handles HTTP errors, invalid schemas, network errors, and timeouts", async () => {
    const httpErrFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR", description: "Bad amount" } }), {
        status: 400,
      }),
    );
    const c1 = createRazorpayClient({ keyId: "k", keySecret: "s", fetchImpl: httpErrFetch as unknown as typeof fetch });
    await expect(c1.createOrder({ amountPaise: 100, receipt: "r" })).rejects.toMatchObject({
      name: "RazorpayApiError",
      status: 400,
      code: "BAD_REQUEST_ERROR",
    });

    const badSchemaFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ wrong: true }), { status: 200 }));
    const c2 = createRazorpayClient({ keyId: "k", keySecret: "s", fetchImpl: badSchemaFetch as unknown as typeof fetch });
    await expect(c2.fetchOrder("order_1")).rejects.toMatchObject({ code: "INVALID_SCHEMA" });

    const netErrFetch = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const c3 = createRazorpayClient({ keyId: "k", keySecret: "s", fetchImpl: netErrFetch as unknown as typeof fetch });
    await expect(c3.fetchPayment("pay_1")).rejects.toMatchObject({ isNetworkError: true, code: "NETWORK_ERROR" });

    const timeoutErr = Object.assign(new Error("Timed out"), { name: "TimeoutError" });
    const timeoutFetch = vi.fn().mockRejectedValue(timeoutErr);
    const c4 = createRazorpayClient({ keyId: "k", keySecret: "s", fetchImpl: timeoutFetch as unknown as typeof fetch });
    await expect(c4.fetchPayment("pay_1")).rejects.toBeInstanceOf(RazorpayApiError);
    await expect(c4.fetchPayment("pay_1")).rejects.toMatchObject({ isTimeout: true, code: "TIMEOUT" });
  });

  it("fails clearly when Razorpay env vars are missing", () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(() => requireRazorpayConfig()).toThrow(/RAZORPAY_KEY_ID/);
    expect(() => requireRazorpayWebhookSecret()).toThrow(/RAZORPAY_WEBHOOK_SECRET/);
  });
});

describe("Razorpay signatures & order access tokens", () => {
  const secret = "test_key_secret_12345";
  const webhookSecret = "test_webhook_secret_12345";

  it("verifies valid checkout signatures and rejects invalid/malformed/mismatched ones", () => {
    const orderId = "order_ABC123";
    const paymentId = "pay_XYZ789";
    const sig = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

    expect(
      verifyRazorpayCheckoutSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        signature: sig,
        keySecret: secret,
      }),
    ).toBe(true);

    expect(
      verifyRazorpayCheckoutSignature({
        razorpayOrderId: "order_OTHER",
        razorpayPaymentId: paymentId,
        signature: sig,
        keySecret: secret,
      }),
    ).toBe(false);

    expect(
      verifyRazorpayCheckoutSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: "pay_OTHER",
        signature: sig,
        keySecret: secret,
      }),
    ).toBe(false);

    expect(
      verifyRazorpayCheckoutSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        signature: "not-hex",
        keySecret: secret,
      }),
    ).toBe(false);

    expect(
      verifyRazorpayCheckoutSignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        signature: "",
        keySecret: secret,
      }),
    ).toBe(false);
  });

  it("verifies raw-body webhook signatures", () => {
    const rawBody = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1"}}}}';
    const sig = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

    expect(verifyRazorpayWebhookSignature({ rawBody, signature: sig, webhookSecret })).toBe(true);
    expect(verifyRazorpayWebhookSignature({ rawBody: rawBody + " ", signature: sig, webhookSecret })).toBe(false);
    expect(verifyRazorpayWebhookSignature({ rawBody, signature: "0".repeat(64), webhookSecret })).toBe(false);
  });

  it("binds order access tokens to orderNumber and guestEmail", () => {
    const token = createOrderAccessToken({
      orderNumber: "WS-1001",
      guestEmail: "Buyer@Example.com",
      secret,
    });
    expect(
      verifyOrderAccessToken({
        token,
        orderNumber: "WS-1001",
        guestEmail: "buyer@example.com",
        secret,
      }),
    ).toBe(true);
    expect(
      verifyOrderAccessToken({
        token,
        orderNumber: "WS-1002",
        guestEmail: "buyer@example.com",
        secret,
      }),
    ).toBe(false);
    expect(
      verifyOrderAccessToken({
        token,
        orderNumber: "WS-1001",
        guestEmail: "other@example.com",
        secret,
      }),
    ).toBe(false);
  });
});

describe("Webhook validation edge cases", () => {
  const webhookSecret = "whsec_test_123";

  it("rejects missing signature, invalid signature, and malformed JSON", async () => {
    const missing = await processRazorpayWebhook({
      rawBody: "{}",
      signature: null,
      webhookSecret,
    });
    expect(missing.status).toBe(401);

    const invalid = await processRazorpayWebhook({
      rawBody: "{}",
      signature: "a".repeat(64),
      webhookSecret,
    });
    expect(invalid.status).toBe(401);

    const badJson = "{not-json";
    const sig = createHmac("sha256", webhookSecret).update(badJson).digest("hex");
    const malformed = await processRazorpayWebhook({
      rawBody: badJson,
      signature: sig,
      webhookSecret,
    });
    expect(malformed.status).toBe(400);
  });
});
