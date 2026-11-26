import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedCatalogue } from "../../prisma/seed";
import { checkDatabaseHealth } from "@/lib/db-health";
import { prismaProductRepository } from "@/modules/catalogue/prisma/prisma-product-repository";
import { createPersistentOrder } from "@/modules/checkout/persistent-order-service";
import {
  cleanupExpiredReservations,
  commitReservationInTx,
  releaseReservationInTx,
} from "@/modules/inventory/reservation-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("PostgreSQL integration against watchstore_db", () => {
  let prisma: PrismaClient;
  const createdIdempotencyKeys: string[] = [];
  const createdCustomerEmails = new Set<string>();

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    // Clean up test-created orders, reservations, adjustments, and customers,
    // and restore p-001 / p-008 / p-010 / p-011 stock to seeded baseline.
    if (createdIdempotencyKeys.length > 0) {
      const orders = await prisma.order.findMany({
        where: { idempotencyKey: { in: createdIdempotencyKeys } },
        select: { id: true },
      });
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await prisma.stockAdjustment.deleteMany({
          where: { referenceId: { in: orderIds } },
        });
        await prisma.order.deleteMany({
          where: { id: { in: orderIds } },
        });
      }
    }
    if (createdCustomerEmails.size > 0) {
      await prisma.customer.deleteMany({
        where: { email: { in: Array.from(createdCustomerEmails) } },
      });
    }
    // Restore stock for products used in tests
    await prisma.productStock.update({
      where: { productId: "p-001" },
      data: { available: 18, reserved: 3 },
    });
    await prisma.productStock.update({
      where: { productId: "p-008" },
      data: { available: 5, reserved: 1 },
    });
    await prisma.productStock.update({
      where: { productId: "p-010" },
      data: { available: 0, reserved: 0 },
    });
    await prisma.productStock.update({
      where: { productId: "p-011" },
      data: { available: 11, reserved: 1 },
    });
    await prisma.$disconnect();
  });

  function baseInput(key: string, email = "pg-test@example.com", paymentMethod: "cod" | "razorpay" = "cod") {
    createdIdempotencyKeys.push(key);
    createdCustomerEmails.add(email);
    return {
      idempotencyKey: key,
      fullName: "Integration Tester",
      email,
      phone: "9820144510",
      addressLine1: "100 Horology Way",
      addressLine2: "Suite 4",
      city: "Mumbai",
      state: "Maharashtra",
      pinCode: "400001",
      country: "India" as const,
      shippingMethod: "standard" as const,
      paymentMethod,
    };
  }

  it("verifies DB health and idempotent seed counts (4 brands, 4 categories, 12 products)", async () => {
    const health = await checkDatabaseHealth();
    expect(health.ok).toBe(true);

    await seedCatalogue(prisma);
    expect(await prisma.brand.count()).toBe(4);
    expect(await prisma.category.count()).toBe(4);
    expect(await prisma.product.count()).toBe(12);
    expect(await prisma.productStock.count()).toBe(12);
  });

  it("queries catalogue via PrismaProductRepository", async () => {
    const cats = await prismaProductRepository.listCategories();
    expect(cats.length).toBe(4);

    const listed = await prismaProductRepository.listProducts({
      categories: ["chronographs"],
      watchTypes: ["chronograph"],
      sort: "price-asc",
      pageSize: 6,
    });
    expect(listed.total).toBe(3);
    expect(listed.items[0]?.pricePaise).toBeLessThanOrEqual(listed.items[1]!.pricePaise);

    const pdp = await prismaProductRepository.getBySlug("tempora-heritage-chronograph-40mm");
    expect(pdp?.sku).toBe("VRN-CHR-402");
    expect(pdp?.images.length).toBe(1);

    const related = await prismaProductRepository.listRelated(pdp!, 4);
    expect(related.length).toBe(4);
    expect(related.some((r) => r.id === pdp!.id)).toBe(false);
  });

  it("creates persistent COD & Razorpay-pending orders and preserves immutable snapshots", async () => {
    const codKey = `pg-cod-${Date.now()}`;
    const codRes = await createPersistentOrder(
      baseInput(codKey, "cod-buyer@example.com", "cod"),
      [{ productId: "p-011", quantity: 1 }],
      null,
    );
    expect(codRes.ok).toBe(true);
    if (!codRes.ok) return;

    expect(codRes.order.orderStatus).toBe("PENDING");
    expect(codRes.order.paymentStatus).toBe("PENDING");
    expect(codRes.order.totals.grandTotalPaise).toBe(4850000);

    // Mutate product price temporarily; historical order snapshot must stay immutable
    await prisma.product.update({ where: { id: "p-011" }, data: { pricePaise: 4990000 } });
    const dbOrder = await prisma.order.findUnique({
      where: { idempotencyKey: codKey },
      include: { items: true, addressSnapshot: true, payments: true },
    });
    await prisma.product.update({ where: { id: "p-011" }, data: { pricePaise: 4850000 } });

    expect(dbOrder?.items[0]?.unitPricePaise).toBe(4850000);
    expect(dbOrder?.addressSnapshot?.pinCode).toBe("400001");
    expect(dbOrder?.payments[0]?.status).toBe("PENDING");

    // Razorpay-pending order (> ₹50,000)
    const rzpKey = `pg-rzp-${Date.now()}`;
    const rzpRes = await createPersistentOrder(
      baseInput(rzpKey, "rzp-buyer@example.com", "razorpay"),
      [{ productId: "p-001", quantity: 1 }],
      null,
    );
    expect(rzpRes.ok).toBe(true);
    if (rzpRes.ok) {
      expect(rzpRes.order.paymentStatus).toBe("REQUIRES_GATEWAY");
    }

    // COD > ₹50,000 rejected
    const badCod = await createPersistentOrder(
      baseInput(`pg-badcod-${Date.now()}`, "badcod@example.com", "cod"),
      [{ productId: "p-001", quantity: 1 }],
      null,
    );
    expect(badCod.ok).toBe(false);
  });

  it("enforces DB idempotency under replay, cross-email, and concurrent submissions", async () => {
    const key = `pg-idem-${Date.now()}`;
    const input = baseInput(key, "idem-owner@example.com", "cod");

    const [r1, r2] = await Promise.all([
      createPersistentOrder(input, [{ productId: "p-011", quantity: 1 }], null),
      createPersistentOrder(input, [{ productId: "p-011", quantity: 1 }], null),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.order.orderNumber).toBe(r2.order.orderNumber);
    }
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);

    // Cross-email replay blocked
    const crossEmail = await createPersistentOrder(
      { ...input, email: "attacker@example.com" },
      [{ productId: "p-011", quantity: 1 }],
      null,
    );
    expect(crossEmail.ok).toBe(false);
  });

  it("handles concurrent final-unit reservations, commit, release, and expiration safely", async () => {
    // Set p-008 to exactly 1 available unit
    await prisma.productStock.update({
      where: { productId: "p-008" },
      data: { available: 1, reserved: 0 },
    });

    const k1 = `pg-race1-${Date.now()}`;
    const k2 = `pg-race2-${Date.now()}`;
    const [a, b] = await Promise.all([
      createPersistentOrder(baseInput(k1, "race1@example.com", "razorpay"), [{ productId: "p-008", quantity: 1 }], null),
      createPersistentOrder(baseInput(k2, "race2@example.com", "razorpay"), [{ productId: "p-008", quantity: 1 }], null),
    ]);

    const successes = [a, b].filter((r) => r.ok);
    const failures = [a, b].filter((r) => !r.ok);
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const stockAfterRace = await prisma.productStock.findUnique({ where: { productId: "p-008" } });
    expect(stockAfterRace?.available).toBe(0);
    expect(stockAfterRace?.reserved).toBe(1);

    const winnerKey = a.ok ? k1 : k2;
    const winnerOrder = await prisma.order.findUnique({
      where: { idempotencyKey: winnerKey },
      include: { reservations: true },
    });
    const resId = winnerOrder!.reservations[0]!.id;

    // Commit reservation, then verify release does nothing
    const committed = await prisma.$transaction((tx) => commitReservationInTx(tx, resId));
    expect(committed).toBe(true);
    const releaseAfterCommit = await prisma.$transaction((tx) => releaseReservationInTx(tx, resId));
    expect(releaseAfterCommit).toBe(false);

    // Test release & expiration on p-011
    const relKey = `pg-rel-${Date.now()}`;
    const relOrderRes = await createPersistentOrder(
      baseInput(relKey, "rel@example.com", "cod"),
      [{ productId: "p-011", quantity: 1 }],
      null,
    );
    expect(relOrderRes.ok).toBe(true);
    const relOrder = await prisma.order.findUnique({
      where: { idempotencyKey: relKey },
      include: { reservations: true },
    });
    const relResId = relOrder!.reservations[0]!.id;
    const beforeRelease = await prisma.productStock.findUnique({ where: { productId: "p-011" } });

    expect(await prisma.$transaction((tx) => releaseReservationInTx(tx, relResId))).toBe(true);
    // Repeated release is idempotent
    expect(await prisma.$transaction((tx) => releaseReservationInTx(tx, relResId))).toBe(false);
    const afterRelease = await prisma.productStock.findUnique({ where: { productId: "p-011" } });
    expect(afterRelease?.available).toBe(beforeRelease!.available + 1);

    // Expired cleanup prevents subsequent commit
    const expKey = `pg-exp-${Date.now()}`;
    await createPersistentOrder(
      baseInput(expKey, "exp@example.com", "cod"),
      [{ productId: "p-011", quantity: 1 }],
      null,
    );
    const expOrder = await prisma.order.findUnique({
      where: { idempotencyKey: expKey },
      include: { reservations: true },
    });
    const expResId = expOrder!.reservations[0]!.id;
    await prisma.inventoryReservation.update({
      where: { id: expResId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const cleaned = await cleanupExpiredReservations(prisma, new Date());
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(await prisma.$transaction((tx) => commitReservationInTx(tx, expResId))).toBe(false);
  });

  it("rolls back completely when a multi-item order fails mid-transaction", async () => {
    const beforeP001 = await prisma.productStock.findUnique({ where: { productId: "p-001" } });
    const failKey = `pg-rollback-${Date.now()}`;

    // p-001 is in stock, p-010 has 0 available
    const res = await createPersistentOrder(
      baseInput(failKey, "rollback@example.com", "razorpay"),
      [
        { productId: "p-001", quantity: 1 },
        { productId: "p-010", quantity: 1 },
      ],
      null,
    );
    expect(res.ok).toBe(false);
    expect(await prisma.order.findUnique({ where: { idempotencyKey: failKey } })).toBeNull();

    const afterP001 = await prisma.productStock.findUnique({ where: { productId: "p-001" } });
    expect(afterP001?.available).toBe(beforeP001?.available);
    expect(afterP001?.reserved).toBe(beforeP001?.reserved);
  });
});
