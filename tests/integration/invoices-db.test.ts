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
  dispatchAdminOrder,
  markOrderPacked,
  transitionAdminOrderStatus,
} from "@/modules/admin/orders/admin-order-transition-service";
import { generateOrGetOrderInvoice } from "@/modules/invoices/invoice-service";
import { renderInvoicePdf } from "@/modules/invoices/invoice-pdf";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 18 Customer Invoices PostgreSQL integration against watchstore_db", () => {
  let prisma: PrismaClient;
  let actor: AuthenticatedAdmin;
  const createdOrderIds: string[] = [];
  const createdCustomerEmails: string[] = [];

  const sellerOverride = {
    legalName: "WatchStore Horology Pvt Ltd",
    address: "101 Heritage Tower, Mumbai, Maharashtra 400001",
    state: "Maharashtra",
    gstin: "27ABCDE1234F1Z5",
    email: "concierge@watchstore.example",
    phone: "+91 22 4000 1000",
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
    await seedRbac(prisma);

    const suffix = Date.now();
    const email = `phase18-inv-admin-${suffix}@watchstore.test`;
    const user = await prisma.user.create({
      data: {
        name: "Phase18 Invoice Admin",
        email,
        passwordHash: await hashPassword("Phase18Inv!2026"),
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
      name: "Phase18 Invoice Admin",
      initials: "PI",
      roles: ["ORDER_MANAGER"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdOrderIds.length > 0) {
      await prisma.orderInvoice.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.notification.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.stockAdjustment.deleteMany({ where: { referenceId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdCustomerEmails.length > 0) {
      await prisma.customer.deleteMany({ where: { email: { in: createdCustomerEmails } } });
    }
    if (actor) {
      await prisma.adminAuditLog.deleteMany({ where: { actorAdminId: actor.adminId } });
      await prisma.adminUser.deleteMany({ where: { id: actor.adminId } });
      await prisma.user.deleteMany({ where: { id: actor.userId } });
    }
    await prisma.$disconnect();
  });

  it("blocks pre-delivery invoices, generates idempotent immutable invoice on DELIVERED, and does not duplicate notifications", async () => {
    const suffix = `${Date.now()}`;
    const email = `p18-cust-${suffix}@watchstore.test`;
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

    const idempotencyKey = `p18-ord-${suffix}`;
    const createdRes = await createPersistentOrder(
      {
        fullName: "Invoice Collector",
        email,
        phone: "9876543210",
        addressLine1: "42 Marine Drive",
        addressLine2: "",
        city: "Mumbai",
        state: "Maharashtra",
        pinCode: "400001",
        country: "India",
        paymentMethod: "cod",
        shippingMethod: "standard",
        idempotencyKey,
      },
      [{ productId: product.id, quantity: 1 }],
      null,
      null,
    );
    if (!createdRes.ok) throw new Error(createdRes.error);
    const order = await prisma.order.findUniqueOrThrow({ where: { idempotencyKey } });
    createdOrderIds.push(order.id);

    // PENDING -> blocked
    const pendingAttempt = await generateOrGetOrderInvoice({ orderId: order.id, sellerOverride }, prisma);
    expect(pendingAttempt).toMatchObject({ ok: false, status: 409 });

    // Transition through CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED
    await transitionAdminOrderStatus(actor, { orderId: order.id, targetStatus: "CONFIRMED", idempotencyKey: `p18-cnf-${suffix}` }, prisma);
    expect(await generateOrGetOrderInvoice({ orderId: order.id, sellerOverride }, prisma)).toMatchObject({ ok: false, status: 409 });

    await markOrderPacked(actor, { orderId: order.id, idempotencyKey: `p18-pack-${suffix}` }, prisma);
    expect(await generateOrGetOrderInvoice({ orderId: order.id, sellerOverride }, prisma)).toMatchObject({ ok: false, status: 409 });

    await dispatchAdminOrder(actor, { orderId: order.id, carrierName: "BlueDart", trackingNumber: `BD-${suffix}`, idempotencyKey: `p18-ship-${suffix}` }, prisma);
    expect(await generateOrGetOrderInvoice({ orderId: order.id, sellerOverride }, prisma)).toMatchObject({ ok: false, status: 409 });

    await transitionAdminOrderStatus(actor, { orderId: order.id, targetStatus: "DELIVERED", idempotencyKey: `p18-del-${suffix}` }, prisma);

    const notifCountBeforeInvoice = await prisma.notification.count({ where: { orderId: order.id } });

    // Concurrent invoice generation requests must yield exactly one invoiceNumber
    const [inv1, inv2, inv3] = await Promise.all([
      generateOrGetOrderInvoice({ orderId: order.id, sellerOverride }, prisma),
      generateOrGetOrderInvoice({ orderId: order.id, sellerOverride }, prisma),
      generateOrGetOrderInvoice({ orderId: order.id, sellerOverride }, prisma),
    ]);

    expect(inv1.ok && inv2.ok && inv3.ok).toBe(true);
    if (!inv1.ok || !inv2.ok || !inv3.ok) return;

    expect(inv1.invoiceNumber).toMatch(/^INV-WS-\d{6}-\d{5}$/);
    expect(inv2.invoiceNumber).toBe(inv1.invoiceNumber);
    expect(inv3.invoiceNumber).toBe(inv1.invoiceNumber);
    expect(inv1.snapshot.totals.grandTotalPaise).toBe(order.grandTotalPaise);
    expect(inv1.snapshot.taxMode).toBe("CGST_SGST");
    expect(inv1.snapshot.totals.cgstTotalPaise + inv1.snapshot.totals.sgstTotalPaise).toBe(
      inv1.snapshot.totals.includedGstPaise,
    );

    // Ensure invoice generation did not trigger extra notifications
    const notifCountAfterInvoice = await prisma.notification.count({ where: { orderId: order.id } });
    expect(notifCountAfterInvoice).toBe(notifCountBeforeInvoice);

    // Mutate product price in DB and verify historical invoice snapshot remains immutable
    const origPrice = product.pricePaise;
    await prisma.product.update({ where: { id: product.id }, data: { pricePaise: origPrice + 500000 } });
    try {
      const reFetched = await generateOrGetOrderInvoice({ orderId: order.id, sellerOverride }, prisma);
      expect(reFetched.ok).toBe(true);
      if (reFetched.ok) {
        expect(reFetched.created).toBe(false);
        expect(reFetched.snapshot.totals.grandTotalPaise).toBe(order.grandTotalPaise);
        const pdf = renderInvoicePdf(reFetched.snapshot);
        expect(pdf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
      }
    } finally {
      await prisma.product.update({ where: { id: product.id }, data: { pricePaise: origPrice } });
    }
  });
});
