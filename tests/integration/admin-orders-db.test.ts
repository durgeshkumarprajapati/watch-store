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
  cancelAdminOrder,
  confirmCodPaymentCollected,
  dispatchAdminOrder,
  markOrderPacked,
  transitionAdminOrderStatus,
} from "@/modules/admin/orders/admin-order-transition-service";
import {
  getAdminOrderDetail,
  getAdminOrderSummary,
  listAdminOrders,
} from "@/modules/admin/orders/admin-order-query-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 11 Admin Order Fulfilment & Concurrency PostgreSQL integration", () => {
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
    const email = `phase11-order-admin-${suffix}@watchstore.test`;
    const user = await prisma.user.create({
      data: {
        name: "Phase11 Order Admin",
        email,
        passwordHash: await hashPassword("Phase11Order!2026"),
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
      name: "Phase11 Order Admin",
      initials: "PO",
      roles: ["ORDER_MANAGER"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdOrderIds.length > 0) {
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

  async function placeTestOrder(paymentMethod: "cod" | "razorpay", keySuffix: string) {
    const email = `p11-cust-${keySuffix}@watchstore.test`;
    createdCustomerEmails.push(email);
    // Use a product within the ₹50,000 COD limit
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

    const idempotencyKey = `p11-order-${keySuffix}`;
    const res = await createPersistentOrder(
      {
        fullName: "Phase11 Collector",
        email,
        phone: "9876543210",
        addressLine1: "42 Horology Lane",
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
    if (!res.ok) {
      throw new Error(`Failed to create test order: ${res.error}`);
    }
    const createdRow = await prisma.order.findUniqueOrThrow({
      where: { idempotencyKey },
      select: { id: true, orderNumber: true },
    });
    createdOrderIds.push(createdRow.id);
    return { orderId: createdRow.id, orderNumber: createdRow.orderNumber, productId: product.id };
  }

  it("processes a COD order end-to-end (confirm -> pack -> dispatch -> deliver -> COD collected)", async () => {
    const suffix = `cod-${Date.now()}`;
    const { orderId, orderNumber } = await placeTestOrder("cod", suffix);

    // Confirm COD order -> commits reservation
    const confirmKey = `p11-confirm-${suffix}`;
    const confirmed = await transitionAdminOrderStatus(
      actor,
      { orderId, targetStatus: "CONFIRMED", idempotencyKey: confirmKey },
      prisma,
    );
    expect(confirmed).toMatchObject({ ok: true, idempotentReplay: false, status: "CONFIRMED" });

    // Idempotency replay
    const replay = await transitionAdminOrderStatus(
      actor,
      { orderId, targetStatus: "CONFIRMED", idempotencyKey: confirmKey },
      prisma,
    );
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, status: "CONFIRMED" });

    const resAfterConfirm = await prisma.inventoryReservation.findMany({ where: { orderId } });
    expect(resAfterConfirm.every((r) => r.status === "COMMITTED")).toBe(true);

    // Pack
    const packed = await markOrderPacked(
      actor,
      { orderId, idempotencyKey: `p11-pack-${suffix}` },
      prisma,
    );
    expect(packed).toMatchObject({
      ok: true,
      status: "PROCESSING",
      fulfilmentStatus: "PACKED",
    });

    // Dispatch with manual tracking
    const dispatched = await dispatchAdminOrder(
      actor,
      {
        orderId,
        carrierName: "BlueDart Insured",
        trackingNumber: `BD-${suffix}`,
        trackingUrl: "https://bluedart.com/track/123",
        idempotencyKey: `p11-disp-${suffix}`,
      },
      prisma,
    );
    expect(dispatched).toMatchObject({
      ok: true,
      status: "SHIPPED",
      fulfilmentStatus: "DISPATCHED",
    });

    // COD payment is STILL PENDING after dispatch
    const detailAfterShip = await getAdminOrderDetail(orderId, prisma);
    expect(detailAfterShip?.paymentStatus).toBe("PENDING");

    // Deliver
    const delivered = await transitionAdminOrderStatus(
      actor,
      { orderId, targetStatus: "DELIVERED", idempotencyKey: `p11-deliv-${suffix}` },
      prisma,
    );
    expect(delivered).toMatchObject({ ok: true, status: "DELIVERED", fulfilmentStatus: "DELIVERED" });

    // Terminal state: cannot revert to PROCESSING or CANCELLED
    const revert = await transitionAdminOrderStatus(
      actor,
      { orderId, targetStatus: "PROCESSING", idempotencyKey: `p11-rev-${suffix}` },
      prisma,
    );
    expect(revert.ok).toBe(false);

    const cancelDelivered = await cancelAdminOrder(
      actor,
      { orderId, reason: "Too late", idempotencyKey: `p11-cancel-deliv-${suffix}` },
      prisma,
    );
    expect(cancelDelivered.ok).toBe(false);

    // Confirm COD payment collected
    const codPaid = await confirmCodPaymentCollected(
      actor,
      { orderId, idempotencyKey: `p11-cod-paid-${suffix}` },
      prisma,
    );
    expect(codPaid.ok).toBe(true);

    const finalDetail = await getAdminOrderDetail(orderId, prisma);
    expect(finalDetail?.paymentStatus).toBe("PAID");

    const listed = await listAdminOrders({ q: orderNumber }, prisma);
    expect(listed.total).toBe(1);
    const summary = await getAdminOrderSummary(prisma);
    expect(summary.totalOrders).toBeGreaterThanOrEqual(1);
  });

  it("blocks unpaid Razorpay fulfilment, releases stock on unpaid cancellation, and marks paid cancellation for manual refund", async () => {
    const suffix = `rzp-${Date.now()}`;
    const unpaid = await placeTestOrder("razorpay", `${suffix}-1`);

    const blockedConfirm = await transitionAdminOrderStatus(
      actor,
      { orderId: unpaid.orderId, targetStatus: "CONFIRMED", idempotencyKey: `p11-blk-${suffix}` },
      prisma,
    );
    expect(blockedConfirm.ok).toBe(false);

    const stockBeforeCancel = await prisma.productStock.findUniqueOrThrow({
      where: { productId: unpaid.productId },
    });

    const cancelledUnpaid = await cancelAdminOrder(
      actor,
      {
        orderId: unpaid.orderId,
        reason: "Customer abandoned checkout",
        idempotencyKey: `p11-can-unpaid-${suffix}`,
      },
      prisma,
    );
    expect(cancelledUnpaid).toMatchObject({ ok: true, status: "CANCELLED" });

    const stockAfterCancel = await prisma.productStock.findUniqueOrThrow({
      where: { productId: unpaid.productId },
    });
    expect(stockAfterCancel.available).toBe(stockBeforeCancel.available + 1);
    expect(stockAfterCancel.reserved).toBe(stockBeforeCancel.reserved - 1);

    const unpaidOrderRow = await prisma.order.findUniqueOrThrow({ where: { id: unpaid.orderId } });
    expect(unpaidOrderRow.manualRefundRequired).toBe(false);

    // Paid Razorpay cancellation
    const paid = await placeTestOrder("razorpay", `${suffix}-2`);
    await prisma.order.update({
      where: { id: paid.orderId },
      data: { status: "CONFIRMED", paymentStatus: "PAID" },
    });
    await prisma.payment.updateMany({
      where: { orderId: paid.orderId },
      data: { status: "PAID", verifiedAt: new Date(), capturedAt: new Date() },
    });

    const cancelledPaid = await cancelAdminOrder(
      actor,
      {
        orderId: paid.orderId,
        reason: "Out of stock after review",
        idempotencyKey: `p11-can-paid-${suffix}`,
      },
      prisma,
    );
    expect(cancelledPaid).toMatchObject({ ok: true, status: "CANCELLED" });

    const paidOrderRow = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
    expect(paidOrderRow.manualRefundRequired).toBe(true);
    expect(paidOrderRow.paymentStatus).toBe("PAID"); // Never fabricates REFUNDED
  });

  it("serializes concurrent order transitions and cancellations safely under FOR UPDATE", async () => {
    const suffix = `conc-${Date.now()}`;
    const { orderId } = await placeTestOrder("cod", suffix);

    const [r1, r2] = await Promise.all([
      transitionAdminOrderStatus(
        actor,
        { orderId, targetStatus: "CONFIRMED", idempotencyKey: `p11-c1-${suffix}` },
        prisma,
      ),
      transitionAdminOrderStatus(
        actor,
        { orderId, targetStatus: "CONFIRMED", idempotencyKey: `p11-c2-${suffix}` },
        prisma,
      ),
    ]);

    const okCount = [r1, r2].filter((r) => r.ok).length;
    const failCount = [r1, r2].filter((r) => !r.ok).length;
    expect(okCount).toBe(1);
    expect(failCount).toBe(1);
  });
});
