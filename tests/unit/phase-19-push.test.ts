import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const webpush = require("web-push") as typeof import("web-push");

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/auth", () => ({
  auth: vi.fn(async () => null),
}));
vi.mock("@/modules/admin/admin-auth-service", () => ({
  getAuthenticatedAdminForApi: vi.fn(async () => null),
}));

import { isSameOriginRequest } from "@/modules/notifications/push-route-auth";
import { sendWebPushNotification } from "@/modules/notifications/push-sender";
import {
  isSafeRelativeTargetUrl,
  pushSubscriptionInputSchema,
  validatePushEndpoint,
} from "@/modules/notifications/push-validation";
import { renderPushSummaryForOrderEvent } from "@/modules/notifications/notification-templates";

describe("Phase 19 — Web Push Validation, VAPID Sender & Templates", () => {
  const origPub = process.env.VAPID_PUBLIC_KEY;
  const origPriv = process.env.VAPID_PRIVATE_KEY;
  const origSubj = process.env.VAPID_SUBJECT;

  afterEach(() => {
    process.env.VAPID_PUBLIC_KEY = origPub;
    process.env.VAPID_PRIVATE_KEY = origPriv;
    process.env.VAPID_SUBJECT = origSubj;
  });

  it("validates approved HTTPS push endpoints and rejects SSRF / non-HTTPS / unapproved hosts", () => {
    expect(
      validatePushEndpoint("https://fcm.googleapis.com/fcm/send/abc123").ok,
    ).toBe(true);
    expect(
      validatePushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/xyz").ok,
    ).toBe(true);
    expect(
      validatePushEndpoint("https://web.push.apple.com/Q12345").ok,
    ).toBe(true);
    expect(
      validatePushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=abc").ok,
    ).toBe(true);

    expect(validatePushEndpoint("http://fcm.googleapis.com/fcm/send/abc").ok).toBe(false);
    expect(validatePushEndpoint("https://user:pass@fcm.googleapis.com/fcm/send/abc").ok).toBe(false);
    expect(validatePushEndpoint("https://127.0.0.1/push").ok).toBe(false);
    expect(validatePushEndpoint("https://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validatePushEndpoint("https://10.0.0.5/push").ok).toBe(false);
    expect(validatePushEndpoint("https://localhost/push").ok).toBe(false);
    expect(validatePushEndpoint("https://evil.example.com/push").ok).toBe(false);
  });

  it("validates push subscription input schema and safe relative target URLs", () => {
    const parsed = pushSubscriptionInputSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/token-1",
      keys: {
        p256dh: "BOr7_valid_p256dh_key_value_1234567890",
        auth: "auth_secret_12345",
      },
    });
    expect(parsed.success).toBe(true);

    expect(isSafeRelativeTargetUrl("/account/orders/ord_1")).toBe("/account/orders/ord_1");
    expect(isSafeRelativeTargetUrl("/admin/orders/ord_1")).toBe("/admin/orders/ord_1");
    expect(isSafeRelativeTargetUrl("//evil.com")).toBe("/");
    expect(isSafeRelativeTargetUrl("https://evil.com/phish")).toBe("/");
    expect(isSafeRelativeTargetUrl("javascript:alert(1)")).toBe("/");
  });

  it("handles missing VAPID config, success, 410 expiry, and 503 retryable responses", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;

    const skipped = await sendWebPushNotification({
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      p256dh: "p256dh-key",
      auth: "auth-key",
      payload: { title: "Test", body: "Hello" },
    });
    expect(skipped.ok).toBe(false);
    if (!skipped.ok) {
      expect(skipped.skipped).toBe(true);
      expect(skipped.expired).toBe(false);
    }

    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:support@watchstore.com";

    const okRes = await sendWebPushNotification({
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      p256dh: "p256dh-key",
      auth: "auth-key",
      payload: { title: "Order Confirmed", body: "Order #WS-1", url: "/account/orders/1" },
      sendImpl: async () => ({ statusCode: 201 }),
    });
    expect(okRes).toEqual({ ok: true, statusCode: 201 });

    const expiredRes = await sendWebPushNotification({
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      p256dh: "p256dh-key",
      auth: "auth-key",
      payload: { title: "Order Confirmed", body: "Order #WS-1" },
      sendImpl: async () => {
        const err = new Error("Gone") as Error & { statusCode: number };
        err.statusCode = 410;
        throw err;
      },
    });
    expect(expiredRes.ok).toBe(false);
    if (!expiredRes.ok) {
      expect(expiredRes.expired).toBe(true);
      expect(expiredRes.retryable).toBe(false);
    }

    const retryRes = await sendWebPushNotification({
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      p256dh: "p256dh-key",
      auth: "auth-key",
      payload: { title: "Order Confirmed", body: "Order #WS-1" },
      sendImpl: async () => {
        const err = new Error("Service Unavailable") as Error & { statusCode: number };
        err.statusCode = 503;
        throw err;
      },
    });
    expect(retryRes.ok).toBe(false);
    if (!retryRes.ok) {
      expect(retryRes.expired).toBe(false);
      expect(retryRes.retryable).toBe(true);
    }
  });

  it("renders push summaries for customer order events and validates same-origin headers", () => {
    const summary = renderPushSummaryForOrderEvent("ORDER_DELIVERED", {
      orderId: "ord_99",
      orderNumber: "WS-2026-0099",
      customerName: "Aarav",
      orderDateIso: "2026-11-26T10:00:00.000Z",
      paymentMethod: "RAZORPAY",
      paymentStatus: "PAID",
      grandTotalPaise: 5000000,
      includedGstPaise: 762712,
      items: [{ name: "Atelier Bronze", quantity: 1, lineTotalPaise: 5000000 }],
    });
    expect(summary.title).toContain("Order Delivered");
    expect(summary.body).toContain("WS-2026-0099");
    expect(summary.url).toBe("/account/orders/ord_99");

    const sameOriginReq = new Request("https://watchstore.local/api/notifications/push/subscribe", {
      method: "POST",
      headers: {
        origin: "https://watchstore.local",
        host: "watchstore.local",
      },
    });
    expect(isSameOriginRequest(sameOriginReq)).toBe(true);

    const crossOriginReq = new Request("https://watchstore.local/api/notifications/push/subscribe", {
      method: "POST",
      headers: {
        origin: "https://evil.example.com",
        host: "watchstore.local",
      },
    });
    expect(isSameOriginRequest(crossOriginReq)).toBe(false);
  });
});
