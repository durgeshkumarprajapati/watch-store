import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/modules/auth/auth", () => ({
  auth: vi.fn(async () => null),
}));

import { PrismaClient } from "@prisma/client";
import { seedCatalogue } from "../../prisma/seed";
import { seedRbac } from "../../prisma/seed-rbac";
import { hashPassword } from "@/modules/auth/password-service";
import type { AuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { ADMIN_PERMISSIONS } from "@/modules/admin/rbac-catalogue";
import { createPersistentOrder } from "@/modules/checkout/persistent-order-service";
import {
  markPaymentAuthorizedInTx,
  markPaymentCapturedInTx,
  markPaymentFailedInTx,
} from "@/modules/payments/application/payment-settlement";
import {
  cancelAdminOrder,
  dispatchAdminOrder,
  markOrderPacked,
  transitionAdminOrderStatus,
} from "@/modules/admin/orders/admin-order-transition-service";
import {
  claimNextNotificationJob,
  processNextNotificationJob,
  retryAdminNotification,
} from "@/modules/notifications/notification-worker-service";
import {
  getCustomerNotificationPreferences,
  updateCustomerNotificationPreferences,
} from "@/modules/notifications/notification-query-service";
import { enqueueOrderNotificationInTx } from "@/modules/notifications/notification-outbox-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 13 Transactional Notifications PostgreSQL integration", () => {
  let prisma: PrismaClient;
  let actor: AuthenticatedAdmin;
  const createdOrderIds: string[] = [];
  const createdCustomerEmails: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
    await seedRbac(prisma);

    const suffix = Date.now();
    const email = `phase13-notif-admin-${suffix}@watchstore.test`;
    const user = await prisma.user.create({
      data: {
        name: "Phase13 Notif Admin",
        email,
        passwordHash: await hashPassword("Phase13Notif!2026"),
        emailVerified: new Date(),
      },
    });
    const adminUser = await prisma.adminUser.create({
      data: { userId: user.id, isActive: true },
    });
    actor = {
      adminId: adminUser.id,
      userId: user.id,
      email,
      name: "Phase13 Notif Admin",
      initials: "PN",
      roles: ["ADMIN"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdOrderIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.stockAdjustment.deleteMany({
        where: { referenceId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdCustomerEmails.length > 0) {
      await prisma.customer.deleteMany({
        where: { email: { in: createdCustomerEmails } },
      });
    }
    if (actor) {
      await prisma.adminAuditLog.deleteMany({ where: { actorAdminId: actor.adminId } });
      await prisma.adminUser.deleteMany({ where: { id: actor.adminId } });
      await prisma.user.deleteMany({ where: { id: actor.userId } });
    }
    await prisma.$disconnect();
  });

  async function placeOrder(paymentMethod: "cod" | "razorpay", keySuffix: string) {
    const email = `p13-cust-${keySuffix}@watchstore.test`;
    createdCustomerEmails.push(email);
    const product = await prisma.product.findFirstOrThrow({
      where: { isActive: true, pricePaise: { lte: 5000000 } },
      include: { stock: true },
    });
    if ((product.stock?.available ?? 0) < 5) {
      await prisma.productStock.upsert({
        where: { productId: product.id },
        create: { productId: product.id, available: 10, reserved: 0 },
        update: { available: { increment: 10 } },
      });
    }
    const idempotencyKey = `p13-ord-${keySuffix}`;
    const res = await createPersistentOrder(
      {
        fullName: "Phase13 Collector",
        email,
        phone: "9876543210",
        addressLine1: "99 Chronometer Ave",
        addressLine2: "",
        city: "Mumbai",
        state: "Maharashtra",
        pinCode: "400001",
        country: "India",
        shippingMethod: "standard",
        paymentMethod,
        idempotencyKey,
      },
      [{ productId: product.id, quantity: 1 }],
      null,
      null,
    );
    if (!res.ok) throw new Error(res.error);
    const order = await prisma.order.findUniqueOrThrow({
      where: { idempotencyKey },
      include: { payments: true },
    });
    createdOrderIds.push(order.id);
    return order;
  }

  it("enqueues deduplicated notifications on payment capture, ignores auth-only, and handles failure/cancellation", async () => {
    const suffix = `${Date.now()}`;
    const order = await placeOrder("razorpay", suffix);
    const payment = order.payments[0]!;

    // Authorization-only must NOT enqueue PAYMENT_SUCCESS or ORDER_CONFIRMED
    await prisma.$transaction((tx) =>
      markPaymentAuthorizedInTx(tx, {
        paymentId: payment.id,
        razorpayOrderId: `rzp_ord_${suffix}`,
        razorpayPaymentId: `rzp_pay_${suffix}`,
      }),
    );
    expect(
      await prisma.notification.count({
        where: { orderId: order.id, eventType: { in: ["PAYMENT_SUCCESS", "ORDER_CONFIRMED"] } },
      }),
    ).toBe(0);

    // Capture -> creates exactly 1 PAYMENT_SUCCESS and 1 ORDER_CONFIRMED
    await prisma.$transaction((tx) =>
      markPaymentCapturedInTx(tx, {
        paymentId: payment.id,
        razorpayOrderId: `rzp_ord_${suffix}`,
        razorpayPaymentId: `rzp_pay_${suffix}`,
        amountPaise: payment.amountPaise,
        currency: "INR",
      }),
    );
    expect(await prisma.notification.count({ where: { orderId: order.id, channel: "EMAIL" } })).toBe(2);

    // Second order: payment failure + cancellation
    const order2 = await placeOrder("razorpay", `${suffix}-2`);
    const payment2 = order2.payments[0]!;
    await prisma.$transaction((tx) =>
      markPaymentFailedInTx(tx, { paymentId: payment2.id }),
    );
    expect(
      await prisma.notification.count({
        where: { orderId: order2.id, eventType: "PAYMENT_FAILED", channel: "EMAIL" },
      }),
    ).toBe(1);

    await cancelAdminOrder(
      actor,
      { orderId: order2.id, reason: "Cancelled", idempotencyKey: `p13-can-${suffix}` },
      prisma,
    );
    expect(
      await prisma.notification.count({
        where: { orderId: order2.id, eventType: "ORDER_CANCELLED", channel: "EMAIL" },
      }),
    ).toBe(1);
  });

  it("claims jobs atomically under concurrency, handles retries/DEAD_LETTER, and respects preferences", async () => {
    const suffix = `w-${Date.now()}`;
    const order = await placeOrder("cod", suffix);

    // COD confirmation -> COD_ORDER_CONFIRMED
    await transitionAdminOrderStatus(
      actor,
      { orderId: order.id, targetStatus: "CONFIRMED", idempotencyKey: `p13-cod-${suffix}` },
      prisma,
    );
    const notif = await prisma.notification.findFirstOrThrow({
      where: { orderId: order.id, eventType: "COD_ORDER_CONFIRMED", channel: "EMAIL" },
    });

    // Customer disables optional shipping updates; optional SHIPMENT_CREATED is skipped, mandatory stays active
    await updateCustomerNotificationPreferences(
      order.customerId!,
      { shippingUpdatesEnabled: false },
      prisma,
    );
    const prefs = await getCustomerNotificationPreferences(order.customerId!, prisma);
    expect(prefs.shippingUpdatesEnabled).toBe(false);

    const optRes = await prisma.$transaction((tx) =>
      enqueueOrderNotificationInTx(tx, {
        orderId: order.id,
        eventType: "SHIPMENT_CREATED",
        dedupeKey: `SHIPMENT_CREATED:opt:${suffix}`,
      }),
    );
    expect(optRes.created).toBe(false);

    // Concurrent claim check: two workers never claim the same job ID
    const [claim1, claim2] = await Promise.all([
      claimNextNotificationJob("worker-a", prisma),
      claimNextNotificationJob("worker-b", prisma),
    ]);
    const claimedJobs = [claim1, claim2].filter((j): j is NonNullable<typeof j> => Boolean(j));
    expect(claimedJobs.length).toBeGreaterThanOrEqual(1);
    expect(new Set(claimedJobs.map((j) => j.id)).size).toBe(claimedJobs.length);

    // Simulate expired lease recovery + permanent failure -> DEAD_LETTER -> manual retry -> SENT
    await prisma.notificationJob.update({
      where: { notificationId: notif.id },
      data: {
        status: "FAILED",
        lockedUntil: new Date(Date.now() - 60_000),
        nextRunAt: new Date(Date.now() - 86_400_000),
      },
    });

    const permFail = await processNextNotificationJob(
      "worker-c",
      async () => ({ ok: false, skipped: false, retryable: false, error: "Bad recipient" }),
      prisma,
    );
    expect(permFail).toMatchObject({ claimed: true, notificationId: notif.id, status: "DEAD_LETTER" });

    // Admin retries DEAD_LETTER notification -> SENT
    const retried = await retryAdminNotification(actor, notif.id, prisma);
    expect(retried.ok).toBe(true);

    await prisma.notificationJob.update({
      where: { notificationId: notif.id },
      data: { nextRunAt: new Date(Date.now() - 86_400_000) },
    });

    const sentRes = await processNextNotificationJob(
      "worker-d",
      async () => ({ ok: true, id: "resend_msg_123" }),
      prisma,
    );
    expect(sentRes).toMatchObject({ claimed: true, notificationId: notif.id, status: "SENT" });

    // Retrying a SENT notification is rejected
    const retrySent = await retryAdminNotification(actor, notif.id, prisma);
    expect(retrySent.ok).toBe(false);
  });

  it("queues notifications for CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED and skips invalid/same-status transitions", async () => {
    const suffix = `flow-${Date.now()}`;
    const placed = await placeOrder("cod", suffix);
    const orderId = placed.id;
    const email = placed.guestEmail;

    // Failed transition (PENDING -> DELIVERED) must not enqueue notification
    const invalid = await transitionAdminOrderStatus(
      actor,
      { orderId, targetStatus: "DELIVERED", idempotencyKey: `p13-inv-${suffix}` },
      prisma,
    );
    expect(invalid.ok).toBe(false);
    expect(await prisma.notification.count({ where: { orderId, channel: "EMAIL" } })).toBe(0);

    // CONFIRMED (COD)
    const confirmed = await transitionAdminOrderStatus(
      actor,
      { orderId, targetStatus: "CONFIRMED", idempotencyKey: `p13-cnf-${suffix}` },
      prisma,
    );
    expect(confirmed.ok).toBe(true);

    // Same-status transition (CONFIRMED -> CONFIRMED) fails and creates no duplicate
    const sameStatus = await transitionAdminOrderStatus(
      actor,
      { orderId, targetStatus: "CONFIRMED", idempotencyKey: `p13-same-${suffix}` },
      prisma,
    );
    expect(sameStatus.ok).toBe(false);

    // PROCESSING via markOrderPacked
    const packed = await markOrderPacked(
      actor,
      { orderId, idempotencyKey: `p13-pack-${suffix}` },
      prisma,
    );
    expect(packed.ok).toBe(true);

    // SHIPPED via dispatchAdminOrder
    const shipped = await dispatchAdminOrder(
      actor,
      {
        orderId,
        carrierName: "BlueDart Air",
        trackingNumber: `BD-${suffix}`,
        trackingUrl: "https://bluedart.com/track/123",
        idempotencyKey: `p13-ship-${suffix}`,
      },
      prisma,
    );
    expect(shipped.ok).toBe(true);

    // DELIVERED
    const delivered = await transitionAdminOrderStatus(
      actor,
      { orderId, targetStatus: "DELIVERED", idempotencyKey: `p13-del-${suffix}` },
      prisma,
    );
    expect(delivered.ok).toBe(true);

    const notifs = await prisma.notification.findMany({
      where: { orderId, channel: "EMAIL" },
      orderBy: { createdAt: "asc" },
    });
    expect(notifs.map((n) => n.dedupeKey)).toEqual([
      `COD_ORDER_CONFIRMED:${orderId}`,
      `ORDER_PROCESSING:${orderId}`,
      `SHIPMENT_DISPATCHED:${orderId}`,
      `ORDER_DELIVERED:${orderId}`,
    ]);
    expect(notifs.every((n) => n.recipient === email)).toBe(true);
  });
});
