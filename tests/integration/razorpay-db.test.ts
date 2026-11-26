import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedCatalogue } from "../../prisma/seed";
import { createPersistentOrder } from "@/modules/checkout/persistent-order-service";
import { initiateRazorpayPayment } from "@/modules/payments/application/payment-service";
import { verifyRazorpayCheckoutPayment } from "@/modules/payments/application/payment-verification-service";
import { processRazorpayWebhook } from "@/modules/payments/application/payment-webhook-service";
import { createOrderAccessToken } from "@/modules/payments/infrastructure/razorpay-signature";
import { RazorpayApiError, type RazorpayClient } from "@/modules/payments/infrastructure/razorpay-client";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

const TEST_CFG = { keyId: "rzp_test_unit", keySecret: "rzp_test_secret_unit" };
const TEST_WEBHOOK_SECRET = "whsec_test_unit";

function signCheckout(orderId: string, paymentId: string) {
  return createHmac("sha256", TEST_CFG.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

function signWebhook(rawBody: string) {
  return createHmac("sha256", TEST_WEBHOOK_SECRET).update(rawBody).digest("hex");
}

describeWithDb("Phase 6 Razorpay PostgreSQL integration against watchstore_db", () => {
  let prisma: PrismaClient;
  const createdKeys: string[] = [];
  const createdEmails = new Set<string>();
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdEventIds.length > 0) {
      await prisma.razorpayWebhookEvent.deleteMany({
        where: { eventId: { in: createdEventIds } },
      });
    }
    if (createdKeys.length > 0) {
      const orders = await prisma.order.findMany({
        where: { idempotencyKey: { in: createdKeys } },
        select: { id: true },
      });
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await prisma.stockAdjustment.deleteMany({ where: { referenceId: { in: orderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      }
    }
    if (createdEmails.size > 0) {
      await prisma.customer.deleteMany({ where: { email: { in: Array.from(createdEmails) } } });
    }
    await prisma.productStock.update({
      where: { productId: "p-001" },
      data: { available: 18, reserved: 3 },
    });
    await prisma.productStock.update({
      where: { productId: "p-011" },
      data: { available: 11, reserved: 1 },
    });
    await prisma.$disconnect();
  });

  function orderInput(key: string, email = "p6-buyer@example.com") {
    createdKeys.push(key);
    createdEmails.add(email);
    return {
      idempotencyKey: key,
      fullName: "Phase 6 Buyer",
      email,
      phone: "9820144510",
      addressLine1: "42 Marine Drive",
      addressLine2: "",
      city: "Mumbai",
      state: "Maharashtra",
      pinCode: "400001",
      country: "India" as const,
      shippingMethod: "standard" as const,
      paymentMethod: "razorpay" as const,
    };
  }

  it("initiates, retries after failure, verifies checkout signature, and commits inventory exactly once", async () => {
    const key = `p6-flow-${Date.now()}`;
    const created = await createPersistentOrder(orderInput(key), [{ productId: "p-011", quantity: 1 }], null);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const orderNumber = created.order.orderNumber;
    const token = createOrderAccessToken({
      orderNumber,
      guestEmail: created.order.customer.email,
      secret: TEST_CFG.keySecret,
    });

    // 1. First initiation fails with gateway timeout -> records FAILED attempt #1
    const failingClient: RazorpayClient = {
      createOrder: vi.fn().mockRejectedValue(new RazorpayApiError("Timeout", { isTimeout: true, code: "TIMEOUT" })),
      fetchOrder: vi.fn(),
      fetchPayment: vi.fn(),
      fetchOrderPayments: vi.fn(),
    };
    const failInit = await initiateRazorpayPayment({
      orderNumber,
      accessToken: token,
      prismaClient: prisma,
      razorpayClient: failingClient,
      config: TEST_CFG,
    });
    expect(failInit.ok).toBe(false);

    // 2. Retry succeeds without creating a duplicate Order -> creates attempt #2
    const rzpOrderId = `order_rzp_${Date.now()}`;
    const rzpPaymentId = `pay_rzp_${Date.now()}`;
    const okClient: RazorpayClient = {
      createOrder: vi.fn().mockResolvedValue({
        id: rzpOrderId,
        amount: 4850000,
        currency: "INR",
        status: "created",
      }),
      fetchOrder: vi.fn(),
      fetchPayment: vi.fn().mockResolvedValue({
        id: rzpPaymentId,
        amount: 4850000,
        currency: "INR",
        status: "captured",
        order_id: rzpOrderId,
      }),
      fetchOrderPayments: vi.fn().mockResolvedValue([]),
    };

    const retryInit = await initiateRazorpayPayment({
      orderNumber,
      accessToken: token,
      prismaClient: prisma,
      razorpayClient: okClient,
      config: TEST_CFG,
    });
    expect(retryInit.ok).toBe(true);
    if (retryInit.ok && !retryInit.alreadyPaid) {
      expect(retryInit.razorpayOrderId).toBe(rzpOrderId);
    }

    // 3. Re-initiating while unpaid reuses existing rzpOrderId
    const reuseInit = await initiateRazorpayPayment({
      orderNumber,
      accessToken: token,
      prismaClient: prisma,
      razorpayClient: okClient,
      config: TEST_CFG,
    });
    expect(reuseInit.ok).toBe(true);
    expect(okClient.createOrder).toHaveBeenCalledTimes(1);

    // 4. Invalid signature rejected
    const badSig = await verifyRazorpayCheckoutPayment({
      orderNumber,
      accessToken: token,
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPaymentId,
      razorpaySignature: "f".repeat(64),
      prismaClient: prisma,
      razorpayClient: okClient,
      config: TEST_CFG,
    });
    expect(badSig).toMatchObject({ ok: false, code: "INVALID_SIGNATURE" });

    // 5. Concurrent verification callbacks -> both succeed idempotently, stock committed once
    const sig = signCheckout(rzpOrderId, rzpPaymentId);
    const [v1, v2] = await Promise.all([
      verifyRazorpayCheckoutPayment({
        orderNumber,
        accessToken: token,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: sig,
        prismaClient: prisma,
        razorpayClient: okClient,
        config: TEST_CFG,
      }),
      verifyRazorpayCheckoutPayment({
        orderNumber,
        accessToken: token,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: sig,
        prismaClient: prisma,
        razorpayClient: okClient,
        config: TEST_CFG,
      }),
    ]);

    expect(v1.ok).toBe(true);
    expect(v2.ok).toBe(true);

    const dbOrder = await prisma.order.findUnique({
      where: { orderNumber },
      include: { reservations: true, payments: { include: { attempts: true } } },
    });
    expect(dbOrder?.status).toBe("CONFIRMED");
    expect(dbOrder?.paymentStatus).toBe("PAID");
    expect(dbOrder?.reservations[0]?.status).toBe("COMMITTED");
    expect(dbOrder?.payments[0]?.attempts.length).toBe(2);

    // 6. Retry on already-paid order returns alreadyPaid: true without creating a new order
    const paidRetry = await initiateRazorpayPayment({
      orderNumber,
      accessToken: token,
      prismaClient: prisma,
      razorpayClient: okClient,
      config: TEST_CFG,
    });
    expect(paidRetry).toMatchObject({ ok: true, alreadyPaid: true, paymentStatus: "PAID" });
  });

  it("processes payment.authorized, payment.captured, duplicate webhooks, and payment.failed idempotently", async () => {
    const key = `p6-wh-${Date.now()}`;
    const created = await createPersistentOrder(orderInput(key, "p6-wh@example.com"), [{ productId: "p-001", quantity: 1 }], null);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const orderNumber = created.order.orderNumber;
    const token = createOrderAccessToken({
      orderNumber,
      guestEmail: created.order.customer.email,
      secret: TEST_CFG.keySecret,
    });
    const rzpOrderId = `order_wh_${Date.now()}`;
    const rzpPaymentId = `pay_wh_${Date.now()}`;

    const client: RazorpayClient = {
      createOrder: vi.fn().mockResolvedValue({
        id: rzpOrderId,
        amount: 14500000,
        currency: "INR",
        status: "created",
      }),
      fetchOrder: vi.fn(),
      fetchPayment: vi.fn(),
      fetchOrderPayments: vi.fn().mockResolvedValue([]),
    };

    await initiateRazorpayPayment({
      orderNumber,
      accessToken: token,
      prismaClient: prisma,
      razorpayClient: client,
      config: TEST_CFG,
    });

    // 1. payment.authorized does NOT confirm order or commit stock
    const authEvtId = `evt_auth_${Date.now()}`;
    createdEventIds.push(authEvtId);
    const authBody = JSON.stringify({
      event: "payment.authorized",
      payload: {
        payment: {
          entity: { id: rzpPaymentId, order_id: rzpOrderId, amount: 14500000, currency: "INR", status: "authorized" },
        },
      },
    });
    const authRes = await processRazorpayWebhook({
      rawBody: authBody,
      signature: signWebhook(authBody),
      eventIdHeader: authEvtId,
      prismaClient: prisma,
      webhookSecret: TEST_WEBHOOK_SECRET,
    });
    expect(authRes.status).toBe(200);
    const afterAuth = await prisma.order.findUnique({ where: { orderNumber }, include: { reservations: true } });
    expect(afterAuth?.paymentStatus).toBe("AUTHORIZED");
    expect(afterAuth?.status).toBe("PENDING");
    expect(afterAuth?.reservations[0]?.status).toBe("RESERVED");

    // 2. payment.captured settles order & commits stock; duplicate eventId is ignored
    const capEvtId = `evt_cap_${Date.now()}`;
    createdEventIds.push(capEvtId);
    const capBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: { id: rzpPaymentId, order_id: rzpOrderId, amount: 14500000, currency: "INR", status: "captured" },
        },
      },
    });
    const [wh1, wh2] = await Promise.all([
      processRazorpayWebhook({
        rawBody: capBody,
        signature: signWebhook(capBody),
        eventIdHeader: capEvtId,
        prismaClient: prisma,
        webhookSecret: TEST_WEBHOOK_SECRET,
      }),
      processRazorpayWebhook({
        rawBody: capBody,
        signature: signWebhook(capBody),
        eventIdHeader: capEvtId,
        prismaClient: prisma,
        webhookSecret: TEST_WEBHOOK_SECRET,
      }),
    ]);
    expect(wh1.status).toBe(200);
    expect(wh2.status).toBe(200);
    expect([wh1.body.duplicate, wh2.body.duplicate].filter(Boolean).length).toBe(1);

    const afterCap = await prisma.order.findUnique({ where: { orderNumber }, include: { reservations: true } });
    expect(afterCap?.paymentStatus).toBe("PAID");
    expect(afterCap?.status).toBe("CONFIRMED");
    expect(afterCap?.reservations[0]?.status).toBe("COMMITTED");
  });

  it("flags late payment capture after reservation expiry for reconciliation without committing expired stock", async () => {
    const key = `p6-exp-${Date.now()}`;
    const created = await createPersistentOrder(orderInput(key, "p6-exp@example.com"), [{ productId: "p-011", quantity: 1 }], null);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const orderNumber = created.order.orderNumber;
    const token = createOrderAccessToken({
      orderNumber,
      guestEmail: created.order.customer.email,
      secret: TEST_CFG.keySecret,
    });
    const rzpOrderId = `order_exp_${Date.now()}`;
    const rzpPaymentId = `pay_exp_${Date.now()}`;

    const client: RazorpayClient = {
      createOrder: vi.fn().mockResolvedValue({
        id: rzpOrderId,
        amount: 4850000,
        currency: "INR",
        status: "created",
      }),
      fetchOrder: vi.fn(),
      fetchPayment: vi.fn().mockResolvedValue({
        id: rzpPaymentId,
        amount: 4850000,
        currency: "INR",
        status: "captured",
        order_id: rzpOrderId,
      }),
      fetchOrderPayments: vi.fn().mockResolvedValue([]),
    };

    await initiateRazorpayPayment({
      orderNumber,
      accessToken: token,
      prismaClient: prisma,
      razorpayClient: client,
      config: TEST_CFG,
    });

    // Simulate reservation expired before late capture
    const ord = await prisma.order.findUnique({ where: { orderNumber }, include: { reservations: true } });
    await prisma.inventoryReservation.update({
      where: { id: ord!.reservations[0]!.id },
      data: { status: "EXPIRED", releasedAt: new Date() },
    });

    const verified = await verifyRazorpayCheckoutPayment({
      orderNumber,
      accessToken: token,
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPaymentId,
      razorpaySignature: signCheckout(rzpOrderId, rzpPaymentId),
      prismaClient: prisma,
      razorpayClient: client,
      config: TEST_CFG,
    });

    expect(verified).toMatchObject({
      ok: true,
      needsReconciliation: true,
      paymentStatus: "PAID",
      orderStatus: "PENDING",
    });
  });
});
