import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";
import { escapeHtml, sendTransactionalEmail } from "@/modules/notifications/email-service";
import {
  NOTIFICATION_EVENT_CATALOGUE,
  renderNotificationEmail,
} from "@/modules/notifications/notification-templates";
import { notificationPreferenceSchema } from "@/modules/notifications/notification-query-service";

describe("Phase 13 — Transactional Notifications, Templates & Security", () => {
  const origKey = process.env.RESEND_API_KEY;
  const origFrom = process.env.EMAIL_FROM;

  afterEach(() => {
    process.env.RESEND_API_KEY = origKey;
    process.env.EMAIL_FROM = origFrom;
  });

  it("escapes HTML and renders branded WatchStore emails without Aurelia Horology", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );

    const rendered = renderNotificationEmail("SHIPMENT_DISPATCHED", {
      orderId: "ord_123",
      orderNumber: "WS-2026-0001",
      customerName: 'Aarav <script>alert(1)</script>',
      orderDateIso: "2026-11-25T10:00:00.000Z",
      paymentMethod: "RAZORPAY",
      paymentStatus: "PAID",
      grandTotalPaise: 14500000,
      includedGstPaise: 2211864,
      items: [{ name: "Chronomaster 40mm", quantity: 1, lineTotalPaise: 14500000 }],
      courierName: "BlueDart Air",
      awbCode: "BD998877",
      trackingUrl: "javascript:alert(1)",
    });

    expect(rendered.subject).toContain("WatchStore");
    expect(rendered.subject).not.toContain("Aurelia");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("javascript:alert");
    expect(rendered.html).not.toContain("Aurelia");
    expect(rendered.text).toContain("WS-2026-0001");
  });

  it("distinguishes mandatory transactional events from optional shipping updates", () => {
    expect(NOTIFICATION_EVENT_CATALOGUE.ORDER_CONFIRMED.isMandatory).toBe(true);
    expect(NOTIFICATION_EVENT_CATALOGUE.PAYMENT_SUCCESS.isMandatory).toBe(true);
    expect(NOTIFICATION_EVENT_CATALOGUE.ORDER_CANCELLED.isMandatory).toBe(true);
    expect(NOTIFICATION_EVENT_CATALOGUE.SHIPMENT_DISPATCHED.isMandatory).toBe(false);
  });

  it("handles unconfigured Resend and classifies 429/5xx vs 4xx provider responses", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const skipped = await sendTransactionalEmail({
      to: "c@example.com",
      subject: "Test",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(skipped).toMatchObject({ ok: false, skipped: true, retryable: false });

    process.env.RESEND_API_KEY = "re_test_key_123";
    process.env.EMAIL_FROM = "WatchStore <no-reply@example.com>";

    const okRes = await sendTransactionalEmail({
      to: "c@example.com",
      subject: "Test",
      html: "<p>Hi</p>",
      text: "Hi",
      idempotencyKey: "dedupe-1",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })),
    });
    expect(okRes).toEqual({ ok: true, id: "msg_1" });

    const rateLimit = await sendTransactionalEmail({
      to: "c@example.com",
      subject: "Test",
      html: "<p>Hi</p>",
      text: "Hi",
      fetchImpl: vi.fn(async () => new Response("{}", { status: 429 })),
    });
    expect(rateLimit).toMatchObject({ ok: false, retryable: true });

    const badReq = await sendTransactionalEmail({
      to: "c@example.com",
      subject: "Test",
      html: "<p>Hi</p>",
      text: "Hi",
      fetchImpl: vi.fn(async () => new Response("{}", { status: 400 })),
    });
    expect(badReq).toMatchObject({ ok: false, retryable: false });
  });

  it("validates preference schema and notification RBAC roles", () => {
    expect(notificationPreferenceSchema.safeParse({ shippingUpdatesEnabled: false }).success).toBe(
      true,
    );
    const adminPerms = new Set(ADMIN_ROLE_DEFINITIONS.ADMIN.permissions);
    expect(adminPerms.has("notifications.read")).toBe(true);
    expect(adminPerms.has("notifications.retry")).toBe(true);

    const supportPerms = new Set(ADMIN_ROLE_DEFINITIONS.CUSTOMER_SUPPORT.permissions);
    expect(supportPerms.has("notifications.read")).toBe(true);
    expect(supportPerms.has("notifications.retry")).toBe(false);
  });
});
