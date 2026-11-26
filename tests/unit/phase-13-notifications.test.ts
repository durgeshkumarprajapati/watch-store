import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";
import { escapeHtml, sendTransactionalEmail } from "@/modules/notifications/email-service";
import { enqueueOrderNotificationInTx } from "@/modules/notifications/notification-outbox-service";
import {
  NOTIFICATION_EVENT_CATALOGUE,
  renderNotificationEmail,
} from "@/modules/notifications/notification-templates";
import { notificationPreferenceSchema } from "@/modules/notifications/notification-query-service";
import { processNextNotificationJob } from "@/modules/notifications/notification-worker-service";

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

  it("renders PROCESSING status transition, cancellationReason, and optional expectedDelivery", () => {
    const processing = renderNotificationEmail("ORDER_CONFIRMED", {
      orderId: "ord_proc",
      orderNumber: "WS-2026-0002",
      customerName: "Priya Sharma",
      orderDateIso: "2026-11-25T10:00:00.000Z",
      paymentMethod: "RAZORPAY",
      paymentStatus: "PAID",
      grandTotalPaise: 9800000,
      includedGstPaise: 1494915,
      items: [{ name: "Atelier Bronze", quantity: 1, lineTotalPaise: 9800000 }],
      previousStatus: "CONFIRMED",
      newStatus: "PROCESSING",
      statusUpdatedAt: "2026-11-26T09:00:00.000Z",
    });
    expect(processing.subject).toContain("Being Prepared");
    expect(processing.text).toContain("CONFIRMED -> PROCESSING");
    expect(processing.text).toContain("2026-11-26T09:00:00.000Z");
    expect(processing.html).toContain("CONFIRMED -&gt; PROCESSING");

    const cancelled = renderNotificationEmail("ORDER_CANCELLED", {
      orderId: "ord_can",
      orderNumber: "WS-2026-0003",
      customerName: "Rohan Verma",
      orderDateIso: "2026-11-25T10:00:00.000Z",
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      grandTotalPaise: 4850000,
      includedGstPaise: 739831,
      items: [],
      previousStatus: "CONFIRMED",
      newStatus: "CANCELLED",
      statusUpdatedAt: "2026-11-26T09:05:00.000Z",
      cancellationReason: "Customer requested cancellation",
    });
    expect(cancelled.text).toContain("Cancellation Reason: Customer requested cancellation");
    expect(cancelled.html).toContain("Cancellation Reason: Customer requested cancellation");

    const shipped = renderNotificationEmail("SHIPMENT_DISPATCHED", {
      orderId: "ord_ship",
      orderNumber: "WS-2026-0004",
      customerName: "Guest Buyer",
      orderDateIso: "2026-11-25T10:00:00.000Z",
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      grandTotalPaise: 4850000,
      includedGstPaise: 739831,
      items: [],
      courierName: "BlueDart",
      awbCode: "BD12345",
      expectedDelivery: "2026-11-29",
    });
    expect(shipped.text).toContain("Expected Delivery: 2026-11-29");
    expect(shipped.html).toContain("Expected Delivery: 2026-11-29");
  });

  it("resolves authoritative customer email, supports guest checkout, respects preferences, and dedupes", async () => {
    const createNotif = vi.fn(async ({ data }) => ({ id: "notif_1", ...data }));
    const createJob = vi.fn(async () => ({ id: "job_1" }));
    const makeTx = (opts: {
      customerEmail?: string | null;
      guestEmail?: string;
      shippingUpdatesEnabled?: boolean;
      existingNotifId?: string | null;
    }) =>
      ({
        order: {
          findUnique: vi.fn(async () => ({
            id: "ord_1",
            orderNumber: "WS-1",
            customerId: opts.customerEmail !== undefined ? "cust_1" : null,
            customer: opts.customerEmail !== undefined ? { email: opts.customerEmail, fullName: "Registered Name" } : null,
            guestEmail: opts.guestEmail ?? "guest@example.com",
            guestName: "Guest Name",
            createdAt: new Date("2026-11-26T08:00:00.000Z"),
            paymentProvider: "COD",
            paymentStatus: "PENDING",
            grandTotalPaise: 100000,
            includedGstPaise: 15254,
            carrierName: null,
            trackingNumber: null,
            trackingUrl: null,
            cancellationReason: null,
            manualRefundRequired: false,
            items: [],
            addressSnapshot: null,
            shipments: [],
          })),
        },
        notificationPreference: {
          findUnique: vi.fn(async () =>
            opts.shippingUpdatesEnabled === undefined
              ? null
              : { shippingUpdatesEnabled: opts.shippingUpdatesEnabled },
          ),
        },
        notification: {
          findUnique: vi.fn(async () => (opts.existingNotifId ? { id: opts.existingNotifId } : null)),
          create: createNotif,
        },
        notificationJob: { create: createJob },
      }) as unknown as Parameters<typeof enqueueOrderNotificationInTx>[0];

    // 1. Registered customer overrides guestEmail
    const reg = await enqueueOrderNotificationInTx(
      makeTx({ customerEmail: "authoritative@example.com", guestEmail: "stale@example.com" }),
      { orderId: "ord_1", eventType: "ORDER_CONFIRMED", dedupeKey: "k1", newStatus: "PROCESSING" },
    );
    expect(reg.created).toBe(true);
    expect(createNotif).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipient: "authoritative@example.com" }),
      }),
    );

    // 2. Guest checkout order works
    const guest = await enqueueOrderNotificationInTx(makeTx({ guestEmail: "guest@example.com" }), {
      orderId: "ord_1",
      eventType: "COD_ORDER_CONFIRMED",
      dedupeKey: "k2",
    });
    expect(guest.created).toBe(true);

    // 3. Invalid email safely returns created: false
    const bad = await enqueueOrderNotificationInTx(makeTx({ guestEmail: "not-an-email" }), {
      orderId: "ord_1",
      eventType: "COD_ORDER_CONFIRMED",
      dedupeKey: "k3",
    });
    expect(bad.created).toBe(false);

    // 4. shippingUpdatesEnabled=false skips optional SHIPMENT_DISPATCHED, allows mandatory PROCESSING
    const optSkipped = await enqueueOrderNotificationInTx(
      makeTx({ customerEmail: "c@example.com", shippingUpdatesEnabled: false }),
      { orderId: "ord_1", eventType: "SHIPMENT_DISPATCHED", dedupeKey: "k4" },
    );
    expect(optSkipped.created).toBe(false);

    const mandAllowed = await enqueueOrderNotificationInTx(
      makeTx({ customerEmail: "c@example.com", shippingUpdatesEnabled: false }),
      { orderId: "ord_1", eventType: "ORDER_CONFIRMED", dedupeKey: "k5", newStatus: "PROCESSING" },
    );
    expect(mandAllowed.created).toBe(true);

    // 5. Duplicate dedupeKey does not create a duplicate notification
    const dup = await enqueueOrderNotificationInTx(
      makeTx({ customerEmail: "c@example.com", existingNotifId: "notif_existing" }),
      { orderId: "ord_1", eventType: "ORDER_CONFIRMED", dedupeKey: "k1" },
    );
    expect(dup).toEqual({ created: false, notificationId: "notif_existing" });
  });

  it("records SENT on Resend success and schedules FAILED retry on transient error", async () => {
    const notifUpdate = vi.fn(async () => ({}));
    const jobUpdate = vi.fn(async () => ({}));
    const makePrisma = (attempts: number) =>
      ({
        $queryRaw: vi.fn(async () => [
          {
            id: "job_1",
            notificationId: "notif_1",
            status: "PROCESSING",
            attempts,
            maxAttempts: 5,
          },
        ]),
        notification: {
          findUnique: vi.fn(async () => ({
            id: "notif_1",
            eventType: "ORDER_CONFIRMED",
            recipient: "cust@example.com",
            dedupeKey: "ORDER_PROCESSING:ord_1",
            payload: {
              orderId: "ord_1",
              orderNumber: "WS-1",
              customerName: "Cust",
              orderDateIso: "2026-11-26T08:00:00.000Z",
              paymentMethod: "COD",
              paymentStatus: "PENDING",
              grandTotalPaise: 100000,
              includedGstPaise: 15254,
              items: [],
              previousStatus: "CONFIRMED",
              newStatus: "PROCESSING",
            },
          })),
          update: notifUpdate,
        },
        notificationJob: { update: jobUpdate },
        $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      }) as unknown as Parameters<typeof processNextNotificationJob>[2];

    const sent = await processNextNotificationJob(
      "w1",
      async () => ({ ok: true, id: "resend_msg_1" }),
      makePrisma(1),
    );
    expect(sent).toEqual({ claimed: true, notificationId: "notif_1", status: "SENT" });
    expect(notifUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT", providerMessageId: "resend_msg_1" }),
      }),
    );

    const retried = await processNextNotificationJob(
      "w2",
      async () => ({ ok: false, skipped: false, retryable: true, error: "HTTP 429" }),
      makePrisma(1),
    );
    expect(retried).toEqual({ claimed: true, notificationId: "notif_1", status: "FAILED" });
    expect(jobUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", lastError: "HTTP 429" }),
      }),
    );
  });
});
