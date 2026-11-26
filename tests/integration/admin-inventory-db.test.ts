import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/modules/auth/auth", () => ({
  auth: vi.fn(async () => null),
}));

import { PrismaClient } from "@prisma/client";
import { seedCatalogue } from "../../prisma/seed";
import { hashPassword } from "@/modules/auth/password-service";
import type { AuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { ADMIN_PERMISSIONS } from "@/modules/admin/rbac-catalogue";
import {
  recordStockAdjustment,
  recordStockInward,
  recordStockOutward,
  updateLowStockThreshold,
} from "@/modules/admin/inventory/inventory-mutation-service";
import {
  getInventoryOverviewSummary,
  listInventoryItems,
  listInventoryMovements,
  listInventoryReservations,
} from "@/modules/admin/inventory/inventory-query-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 10 Admin Inventory & Concurrency PostgreSQL integration", () => {
  let prisma: PrismaClient;
  let actor: AuthenticatedAdmin;
  let testProductId: string;
  let testSku: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);

    const suffix = Date.now();
    const email = `phase10-inv-admin-${suffix}@watchstore.test`;
    const user = await prisma.user.create({
      data: {
        name: "Phase10 Inventory Admin",
        email,
        passwordHash: await hashPassword("Phase10Inv!2026"),
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
      name: "Phase10 Inventory Admin",
      initials: "PI",
      roles: ["INVENTORY_MANAGER"],
      permissions: new Set(ADMIN_PERMISSIONS),
      isSuperAdmin: true,
    };

    const brand = await prisma.brand.findFirstOrThrow({ where: { isActive: true } });
    testProductId = `p10_prod_${suffix}`;
    testSku = `P10-${suffix}`;
    await prisma.product.create({
      data: {
        id: testProductId,
        slug: `p10-test-watch-${suffix}`,
        sku: testSku,
        name: `Phase10 Test Watch ${suffix}`,
        brandId: brand.id,
        gender: "men",
        watchType: "automatic",
        strapMaterial: "steel",
        dialAndStrap: "Black / Steel",
        description: "Isolated inventory integration test product.",
        specMovement: "Calibre P10",
        specCaseDimensions: "40mm",
        specCrystal: "Sapphire",
        specWaterResistance: "100m",
        specHsn: "9102",
        mrpPaise: 10000000,
        pricePaise: 9000000,
        gstRateBps: 1800,
        status: "DRAFT",
        isActive: false,
        stock: {
          create: {
            available: 5,
            reserved: 3,
            lowStockThreshold: 4,
          },
        },
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    if (testProductId) {
      await prisma.stockAdjustment.deleteMany({ where: { productId: testProductId } });
      await prisma.product.deleteMany({ where: { id: testProductId } });
    }
    if (actor) {
      await prisma.adminAuditLog.deleteMany({ where: { actorAdminId: actor.adminId } });
      await prisma.adminUser.deleteMany({ where: { id: actor.adminId } });
      await prisma.user.deleteMany({ where: { id: actor.userId } });
    }
    await prisma.$disconnect();
  });

  it("handles stock inward, idempotency replay, outward reservation protection, and adjustments", async () => {
    const suffix = Date.now();
    const inwardKey = `p10-inward-${suffix}`;

    // Inward +5 -> available 10, reserved 3, physical 13
    const inward = await recordStockInward(
      actor,
      {
        productId: testProductId,
        quantity: 5,
        reason: "Replenishment",
        referenceId: "GRN-100",
        idempotencyKey: inwardKey,
      },
      prisma,
    );
    expect(inward).toMatchObject({
      ok: true,
      idempotentReplay: false,
      available: 10,
      reserved: 3,
      physicalStock: 13,
    });

    // Replay same idempotencyKey -> no double addition
    const replay = await recordStockInward(
      actor,
      {
        productId: testProductId,
        quantity: 5,
        reason: "Replenishment",
        referenceId: "GRN-100",
        idempotencyKey: inwardKey,
      },
      prisma,
    );
    expect(replay).toMatchObject({
      ok: true,
      idempotentReplay: true,
      available: 10,
      reserved: 3,
      physicalStock: 13,
    });

    // Outward 11 exceeds available (10) even though physical is 13 -> rejected
    const badOutward = await recordStockOutward(
      actor,
      {
        productId: testProductId,
        quantity: 11,
        reason: "Damaged",
        idempotencyKey: `p10-bad-out-${suffix}`,
      },
      prisma,
    );
    expect(badOutward.ok).toBe(false);

    // Outward 3 succeeds -> available 7, reserved 3, physical 10
    const goodOutward = await recordStockOutward(
      actor,
      {
        productId: testProductId,
        quantity: 3,
        reason: "Internal issue",
        idempotencyKey: `p10-good-out-${suffix}`,
      },
      prisma,
    );
    expect(goodOutward).toMatchObject({
      ok: true,
      available: 7,
      reserved: 3,
      physicalStock: 10,
    });

    // Adjustment setting physical below reserved (3) -> rejected
    const badAdjust = await recordStockAdjustment(
      actor,
      {
        productId: testProductId,
        mode: "SET_PHYSICAL",
        quantity: 2,
        reason: "Count",
        idempotencyKey: `p10-bad-adj-${suffix}`,
      },
      prisma,
    );
    expect(badAdjust.ok).toBe(false);

    // Adjustment setting physical to 8 -> available 5, reserved 3, physical 8
    const goodAdjust = await recordStockAdjustment(
      actor,
      {
        productId: testProductId,
        mode: "SET_PHYSICAL",
        quantity: 8,
        reason: "Verified cycle count",
        idempotencyKey: `p10-good-adj-${suffix}`,
      },
      prisma,
    );
    expect(goodAdjust).toMatchObject({
      ok: true,
      available: 5,
      reserved: 3,
      physicalStock: 8,
    });

    // Threshold update & listing/summary checks
    const threshRes = await updateLowStockThreshold(
      actor,
      { productId: testProductId, threshold: 5 },
      prisma,
    );
    expect(threshRes.ok).toBe(true);

    const listed = await listInventoryItems({ q: testSku, stockStatus: "LOW_STOCK" }, prisma);
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.lowStockThreshold).toBe(5);

    const summary = await getInventoryOverviewSummary(prisma);
    expect(summary.totalProducts).toBeGreaterThanOrEqual(13);

    const movements = await listInventoryMovements({ productId: testProductId }, prisma);
    expect(movements.total).toBe(3);
    expect(movements.items.every((m) => !m.isSystemActor)).toBe(true);

    const reservations = await listInventoryReservations({}, prisma);
    expect(reservations.total).toBeGreaterThanOrEqual(0);
  });

  it("prevents lost updates and negative stock under concurrent PostgreSQL inward & outward operations", async () => {
    const suffix = Date.now();
    // Reset test product stock to available=7, reserved=3
    await prisma.productStock.update({
      where: { productId: testProductId },
      data: { available: 7, reserved: 3 },
    });

    // 5 concurrent inward operations of +2 each -> must total +10 (available=17)
    const inwardResults = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        recordStockInward(
          actor,
          {
            productId: testProductId,
            quantity: 2,
            reason: `Concurrent inward ${idx}`,
            idempotencyKey: `p10-conc-in-${suffix}-${idx}`,
          },
          prisma,
        ),
      ),
    );
    expect(inwardResults.every((r) => r.ok)).toBe(true);

    const afterInward = await prisma.productStock.findUniqueOrThrow({
      where: { productId: testProductId },
    });
    expect(afterInward.available).toBe(17);
    expect(afterInward.reserved).toBe(3);

    // 6 concurrent outward operations of 4 units each against available=17 -> at most 4 succeed (16 units), 2 fail, available=1 (>= 0)
    const outwardResults = await Promise.all(
      Array.from({ length: 6 }, (_, idx) =>
        recordStockOutward(
          actor,
          {
            productId: testProductId,
            quantity: 4,
            reason: `Concurrent outward ${idx}`,
            idempotencyKey: `p10-conc-out-${suffix}-${idx}`,
          },
          prisma,
        ),
      ),
    );
    const succeeded = outwardResults.filter((r) => r.ok).length;
    const failed = outwardResults.filter((r) => !r.ok).length;
    expect(succeeded).toBe(4);
    expect(failed).toBe(2);

    const afterOutward = await prisma.productStock.findUniqueOrThrow({
      where: { productId: testProductId },
    });
    expect(afterOutward.available).toBe(1);
    expect(afterOutward.reserved).toBe(3);
  });
});
