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
import { transitionAdminOrderStatus } from "@/modules/admin/orders/admin-order-transition-service";
import {
  ShiprocketApiError,
  type ShiprocketClient,
} from "@/modules/shipping/infrastructure/shiprocket-client";
import {
  getShiprocketAuthToken,
  invalidateShiprocketAuthToken,
} from "@/modules/shipping/infrastructure/shiprocket-auth-service";
import {
  createManualShipmentRecord,
  createShiprocketShipment,
} from "@/modules/shipping/application/shipment-creation-service";
import {
  assignShipmentAwb,
  cancelShiprocketShipment,
  generateShipmentLabel,
  scheduleShipmentPickup,
} from "@/modules/shipping/application/shipment-fulfilment-service";
import { syncShipmentTracking } from "@/modules/shipping/application/tracking-sync-service";
import { processShiprocketWebhook } from "@/modules/shipping/application/shipping-webhook-service";
import { processNextShippingJob } from "@/modules/shipping/application/shipping-job-service";
import { getCustomerOrderShipments } from "@/modules/shipping/application/shipping-query-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 12 Shiprocket Shipping PostgreSQL integration", () => {
  let prisma: PrismaClient;
  let actor: AuthenticatedAdmin;
  const createdOrderIds: string[] = [];
  const createdCustomerEmails: string[] = [];
  const origEnv = { ...process.env };

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    process.env.SHIPROCKET_API_EMAIL = "api@watchstore.test";
    process.env.SHIPROCKET_API_PASSWORD = "sr_test_password";
    process.env.SHIPROCKET_WEBHOOK_TOKEN = "sr_webhook_secret_12345";
    process.env.SHIPROCKET_PICKUP_PINCODE = "400001";

    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
    await seedRbac(prisma);

    const suffix = Date.now();
    const email = `phase12-ship-admin-${suffix}@watchstore.test`;
    const user = await prisma.user.create({
      data: {
        name: "Phase12 Ship Admin",
        email,
        passwordHash: await hashPassword("Phase12Ship!2026"),
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
      name: "Phase12 Ship Admin",
      initials: "PS",
      roles: ["ORDER_MANAGER"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };
  });

  afterAll(async () => {
    process.env = origEnv;
    if (!prisma) return;
    await prisma.shippingWebhookEvent.deleteMany({});
    await prisma.shippingJob.deleteMany({});
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
    await prisma.shiprocketAuthToken.deleteMany({});
    await prisma.$disconnect();
  });

  function makeMockClient(overrides: Partial<ShiprocketClient> = {}): ShiprocketClient {
    return {
      login: vi.fn(async () => ({ token: "mock_sr_bearer_token_12345" })),
      checkServiceability: vi.fn(async () => ({
        data: {
          available_courier_companies: [
            { courier_company_id: 14, courier_name: "BlueDart Air", rate: 250, etd: "2 Days" },
          ],
        },
      })),
      createAdhocOrder: vi.fn(async () => ({
        order_id: 900101,
        shipment_id: 800101,
        status: "NEW",
      })),
      assignAwb: vi.fn(async () => ({
        awb_assign_status: 1,
        response: {
          data: {
            awb_code: "AWB900101",
            courier_company_id: 14,
            courier_name: "BlueDart Air",
          },
        },
      })),
      generateLabel: vi.fn(async () => ({
        label_created: 1,
        label_url: "https://shiprocket.example.com/labels/AWB900101.pdf",
      })),
      schedulePickup: vi.fn(async () => ({
        pickup_status: 1,
        response: {
          pickup_scheduled_date: "2026-11-26 10:00:00",
          pickup_token_number: "PKP-900101",
        },
      })),
      trackByAwb: vi.fn(async () => ({
        tracking_data: {
          track_status: 1,
          shipment_track: [
            {
              current_status: "In Transit",
              awb_code: "AWB900101",
              courier_name: "BlueDart Air",
            },
          ],
          shipment_track_activities: [
            {
              date: "2026-11-25 17:00:00",
              status: "IN TRANSIT",
              activity: "Arrived at Mumbai Hub",
              location: "Mumbai",
            },
          ],
          track_url: "https://shiprocket.example.com/track/AWB900101",
        },
      })),
      getOrderDetails: vi.fn(async () => ({
        data: {
          id: 900101,
          status: "NEW",
          shipments: { id: 800101, awb: null, courier: null },
        },
      })),
      cancelOrder: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  async function createConfirmedCodOrder(keySuffix: string) {
    const email = `p12-cust-${keySuffix}@watchstore.test`;
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
    const idempotencyKey = `p12-ord-${keySuffix}`;
    const res = await createPersistentOrder(
      {
        fullName: "Phase12 Collector",
        email,
        phone: "9876543210",
        addressLine1: "12 Marine Drive",
        addressLine2: "",
        city: "Mumbai",
        state: "Maharashtra",
        pinCode: "400001",
        country: "India",
        shippingMethod: "standard",
        paymentMethod: "cod",
        idempotencyKey,
      },
      [{ productId: product.id, quantity: 1 }],
      null,
      null,
    );
    if (!res.ok) throw new Error(res.error);
    const order = await prisma.order.findUniqueOrThrow({
      where: { idempotencyKey },
      select: { id: true, customerId: true },
    });
    createdOrderIds.push(order.id);
    await transitionAdminOrderStatus(
      actor,
      { orderId: order.id, targetStatus: "CONFIRMED", idempotencyKey: `p12-conf-${keySuffix}` },
      prisma,
    );
    return { orderId: order.id, customerId: order.customerId! };
  }

  it("caches encrypted Shiprocket auth token under DB lock and prevents concurrent login races", async () => {
    await invalidateShiprocketAuthToken(prisma);
    const mockClient = makeMockClient();

    const [t1, t2, t3] = await Promise.all([
      getShiprocketAuthToken(mockClient, prisma),
      getShiprocketAuthToken(mockClient, prisma),
      getShiprocketAuthToken(mockClient, prisma),
    ]);

    expect(t1).toBe("mock_sr_bearer_token_12345");
    expect(t2).toBe(t1);
    expect(t3).toBe(t1);
    expect(mockClient.login).toHaveBeenCalledTimes(1);

    const stored = await prisma.shiprocketAuthToken.findUniqueOrThrow({ where: { id: "default" } });
    expect(stored.encryptedToken).not.toContain("mock_sr_bearer_token_12345");
  });

  it("handles full Shiprocket lifecycle, concurrent creation, webhooks, and preserves payment/inventory isolation", async () => {
    const suffix = `${Date.now()}`;
    const { orderId, customerId } = await createConfirmedCodOrder(suffix);
    const mockClient = makeMockClient();

    // Concurrent creation attempts -> only 1 succeeds
    const [c1, c2] = await Promise.all([
      createShiprocketShipment(
        actor,
        { orderId, idempotencyKey: `p12-ship-1-${suffix}` },
        mockClient,
        prisma,
      ),
      createShiprocketShipment(
        actor,
        { orderId, idempotencyKey: `p12-ship-2-${suffix}` },
        mockClient,
        prisma,
      ),
    ]);
    const winner = c1.ok ? c1 : c2;
    const loser = c1.ok ? c2 : c1;
    expect(winner.ok).toBe(true);
    expect(loser.ok).toBe(false);
    if (!winner.ok) return;

    // Assign AWB + idempotent replay
    const awb1 = await assignShipmentAwb(actor, { shipmentId: winner.shipmentId, courierId: 14 }, mockClient, prisma);
    expect(awb1).toMatchObject({ ok: true, awbCode: "AWB900101", idempotentReplay: false });
    const awb2 = await assignShipmentAwb(actor, { shipmentId: winner.shipmentId, courierId: 14 }, mockClient, prisma);
    expect(awb2).toMatchObject({ ok: true, awbCode: "AWB900101", idempotentReplay: true });

    // Generate label & schedule pickup
    const labelRes = await generateShipmentLabel(actor, winner.shipmentId, mockClient, prisma);
    expect(labelRes).toMatchObject({
      ok: true,
      labelUrl: "https://shiprocket.example.com/labels/AWB900101.pdf",
    });

    const pickup1 = await scheduleShipmentPickup(actor, { shipmentId: winner.shipmentId }, mockClient, prisma);
    expect(pickup1).toMatchObject({ ok: true, idempotentReplay: false });
    const pickup2 = await scheduleShipmentPickup(actor, { shipmentId: winner.shipmentId }, mockClient, prisma);
    expect(pickup2).toMatchObject({ ok: true, idempotentReplay: true });

    // Sync tracking
    const synced = await syncShipmentTracking(winner.shipmentId, mockClient, prisma);
    expect(synced).toMatchObject({ ok: true, status: "IN_TRANSIT", updated: true });

    // Invalid webhook rejected
    const badWh = await processShiprocketWebhook(
      { rawBody: "{}", apiKeyHeader: "wrong_secret" },
      prisma,
    );
    expect(badWh.status).toBe(401);

    // Valid Delivered webhook + duplicate deduplication
    const deliveredPayload = JSON.stringify({
      awb: "AWB900101",
      current_status: "Delivered",
      current_timestamp: "2026-11-26 15:00:00",
    });
    const wh1 = await processShiprocketWebhook(
      { rawBody: deliveredPayload, apiKeyHeader: "sr_webhook_secret_12345" },
      prisma,
    );
    expect(wh1).toEqual({ status: 200, body: { ok: true, duplicate: false } });

    const wh2 = await processShiprocketWebhook(
      { rawBody: deliveredPayload, apiKeyHeader: "sr_webhook_secret_12345" },
      prisma,
    );
    expect(wh2).toEqual({ status: 200, body: { ok: true, duplicate: true } });

    // Payment must remain PENDING (COD not falsely marked PAID by delivery webhook!)
    const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(orderAfter.paymentStatus).toBe("PENDING");

    // Customer ownership boundary
    const ownerShipments = await getCustomerOrderShipments(orderId, customerId, prisma);
    expect(ownerShipments).toHaveLength(1);
    const otherShipments = await getCustomerOrderShipments(orderId, "wrong_customer_id", prisma);
    expect(otherShipments).toHaveLength(0);
  });

  it("handles timeout reconciliation via durable ShippingJob, cancellation, and manual fallback", async () => {
    const suffix = `rec-${Date.now()}`;
    const { orderId } = await createConfirmedCodOrder(suffix);

    const timeoutClient = makeMockClient({
      createAdhocOrder: vi.fn(async () => {
        throw new ShiprocketApiError("Timeout", 504, true);
      }),
    });

    const failedCreate = await createShiprocketShipment(
      actor,
      { orderId, idempotencyKey: `p12-timeout-${suffix}` },
      timeoutClient,
      prisma,
    );
    expect(failedCreate.ok).toBe(false);
    if (failedCreate.ok) return;
    expect(failedCreate.reconciliationRequired).toBe(true);

    // Cancel failed/reconciliation shipment and record manual fallback
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId } });
    const cancelled = await cancelShiprocketShipment(
      actor,
      { shipmentId: shipment.id, reason: "Switching to manual courier" },
      timeoutClient,
      prisma,
    );
    expect(cancelled.ok).toBe(true);

    const manual = await createManualShipmentRecord(
      actor,
      {
        orderId,
        carrierName: "Delhivery Insured",
        trackingNumber: `DLV-${suffix}`,
        trackingUrl: "https://delhivery.com/track/123",
        idempotencyKey: `p12-manual-${suffix}`,
      },
      prisma,
    );
    expect(manual.ok).toBe(true);

    // Ensure durable job processor runs cleanly
    const jobRes = await processNextShippingJob("test-worker", makeMockClient(), prisma);
    expect(typeof jobRes.claimed).toBe("boolean");
  });
});
