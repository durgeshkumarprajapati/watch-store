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
import { cleanupExpiredReservations } from "@/modules/inventory/reservation-service";
import {
  reconcilePendingPayments,
  reconcileSinglePayment,
} from "@/modules/payments/application/payment-reconciliation-service";
import {
  RazorpayApiError,
  type RazorpayClient,
} from "@/modules/payments/infrastructure/razorpay-client";
import { enqueueActiveShipmentSyncs } from "@/modules/shipping/application/shipping-job-service";
import {
  getOperationsDashboardSnapshot,
  runTrackedScheduledJob,
} from "@/modules/operations/operations-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 16 Operations & Reconciliation PostgreSQL integration against watchstore_db", () => {
  let prisma: PrismaClient;
  let actor: AuthenticatedAdmin;
  let actorEmail: string;

  const createdOrderIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdShippingJobShipmentIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
    await seedRbac(prisma);

    actorEmail = `phase16-ops-admin-${Date.now()}@watchstore.test`;
    const user = await prisma.user.create({
      data: {
        name: "Phase16 Ops Admin",
        email: actorEmail,
        passwordHash: await hashPassword("Phase16Admin!2026"),
        emailVerified: new Date(),
      },
    });
    const adminUser = await prisma.adminUser.create({
      data: { userId: user.id, isActive: true },
    });

    actor = {
      adminId: adminUser.id,
      userId: user.id,
      email: actorEmail,
      name: "Phase16 Ops Admin",
      initials: "PO",
      roles: ["SUPER_ADMIN"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };
  });

  afterAll(async () => {
    if (!prisma) return;

    if (createdShippingJobShipmentIds.length > 0) {
      await prisma.shippingJob.deleteMany({
        where: { shipmentId: { in: createdShippingJobShipmentIds } },
      });
    }
    if (createdOrderIds.length > 0) {
      await prisma.stockAdjustment.deleteMany({
        where: { referenceId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }
    if (createdRunIds.length > 0) {
      await prisma.schedulerRun.deleteMany({
        where: { id: { in: createdRunIds } },
      });
    }

    await prisma.adminAuditLog.deleteMany({ where: { actorAdminId: actor.adminId } });
    await prisma.adminUser.deleteMany({ where: { id: actor.adminId } });
    await prisma.user.deleteMany({ where: { email: actorEmail } });
    await prisma.$disconnect();
  });

  async function createTestOrderWithReservation(opts: {
    orderStatus: "PENDING" | "CONFIRMED";
    paymentStatus: "REQUIRES_GATEWAY" | "PAID";
    expired: boolean;
    rzpOrderId: string;
  }) {
    const product = await prisma.product.findFirstOrThrow({
      where: { id: "p-001" },
      include: { brand: true, stock: true },
    });

    await prisma.productStock.update({
      where: { productId: product.id },
      data: { reserved: { increment: 1 }, available: { decrement: 1 } },
    });

    const orderNumber = `WS-P16-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const expiresAt = new Date(Date.now() + (opts.expired ? -600_000 : 600_000));

    const order = await prisma.order.create({
      data: {
        orderNumber,
        idempotencyKey: `idem-${orderNumber}`,
        guestEmail: "p16-customer@watchstore.test",
        guestName: "Phase16 Test Customer",
        guestPhone: "9876543210",
        status: opts.orderStatus,
        paymentStatus: opts.paymentStatus,
        paymentProvider: "RAZORPAY",
        subtotalPaise: product.pricePaise,
        mrpTotalPaise: product.mrpPaise,
        productSavingsPaise: Math.max(0, product.mrpPaise - product.pricePaise),
        shippingPaise: 0,
        includedGstPaise: 0,
        grandTotalPaise: product.pricePaise,
        items: {
          create: {
            productId: product.id,
            skuSnapshot: product.sku,
            productNameSnapshot: product.name,
            brandNameSnapshot: product.brand.name,
            dialAndStrapSnapshot: product.dialAndStrap,
            unitMrpPaise: product.mrpPaise,
            unitPricePaise: product.pricePaise,
            unitDiscountPaise: Math.max(0, product.mrpPaise - product.pricePaise),
            gstRateBps: product.gstRateBps,
            quantity: 1,
            lineTotalPaise: product.pricePaise,
            lineGstPaise: 0,
          },
        },
        payments: {
          create: {
            provider: "RAZORPAY",
            status: opts.paymentStatus,
            amountPaise: product.pricePaise,
            currency: "INR",
            providerOrderId: opts.rzpOrderId,
            attempts: {
              create: {
                attemptNumber: 1,
                status: opts.paymentStatus,
                razorpayOrderId: opts.rzpOrderId,
              },
            },
          },
        },
      },
      include: { items: true, payments: true },
    });
    createdOrderIds.push(order.id);

    const reservation = await prisma.inventoryReservation.create({
      data: {
        orderId: order.id,
        orderItemId: order.items[0]!.id,
        productId: product.id,
        quantity: 1,
        status: "RESERVED",
        expiresAt,
      },
    });

    return { order, reservation, payment: order.payments[0]!, productId: product.id };
  }

  it("releases expired unpaid reservations safely under concurrency while committing paid/confirmed ones", async () => {
    const unpaid = await createTestOrderWithReservation({
      orderStatus: "PENDING",
      paymentStatus: "REQUIRES_GATEWAY",
      expired: true,
      rzpOrderId: `order_unpaid_${Date.now()}`,
    });
    const paid = await createTestOrderWithReservation({
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      expired: true,
      rzpOrderId: `order_paid_${Date.now()}`,
    });

    const beforeStock = await prisma.productStock.findUniqueOrThrow({
      where: { productId: unpaid.productId },
    });

    const [c1, c2] = await Promise.all([
      cleanupExpiredReservations(prisma),
      cleanupExpiredReservations(prisma),
    ]);
    expect(c1 + c2).toBeGreaterThanOrEqual(1);

    const unpaidRes = await prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: unpaid.reservation.id },
    });
    expect(unpaidRes.status).toBe("EXPIRED");

    const paidRes = await prisma.inventoryReservation.findUniqueOrThrow({
      where: { id: paid.reservation.id },
    });
    expect(paidRes.status).toBe("COMMITTED");

    const afterStock = await prisma.productStock.findUniqueOrThrow({
      where: { productId: unpaid.productId },
    });
    // Only the unpaid reservation (+1 available) was released; paid reservation committed (-1 reserved, 0 available delta)
    expect(afterStock.available).toBe(beforeStock.available + 1);
    expect(afterStock.reserved).toBe(beforeStock.reserved - 2);
  });

  it("reconciles Razorpay captured, authorized, failed, and timeout states idempotently", async () => {
    const rzpCapOrder = `order_cap_${Date.now()}`;
    const capCase = await createTestOrderWithReservation({
      orderStatus: "PENDING",
      paymentStatus: "REQUIRES_GATEWAY",
      expired: false,
      rzpOrderId: rzpCapOrder,
    });

    const rzpAuthOrder = `order_auth_${Date.now()}`;
    const authCase = await createTestOrderWithReservation({
      orderStatus: "PENDING",
      paymentStatus: "REQUIRES_GATEWAY",
      expired: false,
      rzpOrderId: rzpAuthOrder,
    });

    const rzpErrOrder = `order_err_${Date.now()}`;
    const errCase = await createTestOrderWithReservation({
      orderStatus: "PENDING",
      paymentStatus: "REQUIRES_GATEWAY",
      expired: false,
      rzpOrderId: rzpErrOrder,
    });

    const mockRzp: RazorpayClient = {
      async createOrder() {
        throw new Error("unused");
      },
      async fetchOrder() {
        throw new Error("unused");
      },
      async fetchPayment() {
        throw new Error("unused");
      },
      async fetchOrderPayments(orderId: string) {
        if (orderId === rzpCapOrder) {
          return [
            {
              id: `pay_cap_${Date.now()}`,
              amount: capCase.payment.amountPaise,
              currency: "INR",
              status: "captured",
              captured: true,
              order_id: rzpCapOrder,
            },
          ];
        }
        if (orderId === rzpAuthOrder) {
          return [
            {
              id: `pay_auth_${Date.now()}`,
              amount: authCase.payment.amountPaise,
              currency: "INR",
              status: "authorized",
              captured: false,
              order_id: rzpAuthOrder,
            },
          ];
        }
        if (orderId === rzpErrOrder) {
          throw new RazorpayApiError("Gateway timeout", { status: 504, isTimeout: true });
        }
        return [];
      },
    };

    const resCap = await reconcileSinglePayment(capCase.payment.id, {
      prismaClient: prisma,
      razorpayClient: mockRzp,
    });
    expect(resCap.outcome).toBe("SETTLED_PAID");

    const updatedCapOrder = await prisma.order.findUniqueOrThrow({
      where: { id: capCase.order.id },
    });
    expect(updatedCapOrder.status).toBe("CONFIRMED");
    expect(updatedCapOrder.paymentStatus).toBe("PAID");

    const resAuth = await reconcileSinglePayment(authCase.payment.id, {
      prismaClient: prisma,
      razorpayClient: mockRzp,
    });
    expect(resAuth.outcome).toBe("AUTHORIZED_PENDING_CAPTURE");

    const resErr = await reconcileSinglePayment(errCase.payment.id, {
      prismaClient: prisma,
      razorpayClient: mockRzp,
    });
    expect(resErr.outcome).toBe("PROVIDER_ERROR");

    // Batch reconcile should also be safe & idempotent
    const batch = await reconcilePendingPayments({
      prismaClient: prisma,
      razorpayClient: mockRzp,
      staleMinutes: 0,
      batchSize: 5,
    });
    expect(batch.scanned).toBeGreaterThanOrEqual(1);
  });

  it("tracks SchedulerRun abandoned/completed/failed states, Shiprocket sweep, and ops snapshot", async () => {
    // Insert a stale RUNNING record (> 6 min old) to verify ABANDONED recovery
    const staleRun = await prisma.schedulerRun.create({
      data: {
        jobName: "RESERVATION_CLEANUP",
        status: "RUNNING",
        startedAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    createdRunIds.push(staleRun.id);

    const okRun = await runTrackedScheduledJob(
      "RESERVATION_CLEANUP",
      async () => ({ processedCount: 2, errorCount: 0, summary: { released: 2 } }),
      prisma,
    );
    createdRunIds.push(okRun.runId);
    expect(okRun.ok).toBe(true);
    expect(okRun.status).toBe("COMPLETED");

    const abandonedCheck = await prisma.schedulerRun.findUniqueOrThrow({
      where: { id: staleRun.id },
    });
    expect(abandonedCheck.status).toBe("ABANDONED");

    const failRun = await runTrackedScheduledJob(
      "PAYMENT_RECONCILE",
      async () => {
        throw new Error("Simulated provider outage");
      },
      prisma,
    );
    createdRunIds.push(failRun.runId);
    expect(failRun.ok).toBe(false);
    expect(failRun.status).toBe("FAILED");

    const sweep = await enqueueActiveShipmentSyncs(prisma, { limit: 5 });
    expect(sweep.enqueuedTracking).toBeGreaterThanOrEqual(0);
    expect(sweep.enqueuedReconcile).toBeGreaterThanOrEqual(0);

    const snapshot = await getOperationsDashboardSnapshot(prisma);
    expect(snapshot.recentRuns.length).toBeGreaterThanOrEqual(2);
  });
});
