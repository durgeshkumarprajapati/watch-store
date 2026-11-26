import { afterEach, describe, expect, it, vi } from "vitest";
import { canTransitionOrderStatus, canTransitionPaymentStatus } from "@/modules/checkout/status-transitions";
import { getServerEnv, hasDatabaseUrl, requireDatabaseUrl } from "@/config/env";
import { checkDatabaseHealth } from "@/lib/db-health";
import {
  InsufficientStockError,
  commitReservationInTx,
  releaseReservationInTx,
  reserveStockInTx,
} from "@/modules/inventory/reservation-service";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("order and payment status transitions", () => {
  it("allows valid order lifecycle transitions and blocks invalid ones", () => {
    expect(canTransitionOrderStatus("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransitionOrderStatus("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionOrderStatus("CONFIRMED", "PROCESSING")).toBe(true);
    expect(canTransitionOrderStatus("PROCESSING", "SHIPPED")).toBe(true);
    expect(canTransitionOrderStatus("SHIPPED", "DELIVERED")).toBe(true);

    expect(canTransitionOrderStatus("PENDING", "DELIVERED")).toBe(false);
    expect(canTransitionOrderStatus("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransitionOrderStatus("CANCELLED", "CONFIRMED")).toBe(false);
  });

  it("allows valid payment transitions and blocks invalid ones", () => {
    expect(canTransitionPaymentStatus("PENDING", "REQUIRES_GATEWAY")).toBe(true);
    expect(canTransitionPaymentStatus("REQUIRES_GATEWAY", "PAID")).toBe(true);
    expect(canTransitionPaymentStatus("PAID", "REFUNDED")).toBe(true);
    expect(canTransitionPaymentStatus("FAILED", "REQUIRES_GATEWAY")).toBe(true);

    expect(canTransitionPaymentStatus("REFUNDED", "PAID")).toBe(false);
    expect(canTransitionPaymentStatus("PENDING", "REFUNDED")).toBe(false);
  });
});

describe("database environment validation & health", () => {
  it("reports missing DATABASE_URL cleanly without exposing secrets", async () => {
    delete process.env.DATABASE_URL;
    expect(hasDatabaseUrl()).toBe(false);
    expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL is not configured/);
    const health = await checkDatabaseHealth();
    expect(health).toEqual({
      ok: false,
      reason: "not_configured",
      message: "Database connection is not configured.",
    });
  });

  it("rejects malformed non-postgres URLs", () => {
    process.env.DATABASE_URL = "mysql://user:secret@localhost:3306/db";
    expect(() => getServerEnv()).toThrow(/Invalid server environment configuration/);
  });

  it("accepts valid postgresql:// URLs", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/watch_store";
    expect(hasDatabaseUrl()).toBe(true);
    expect(requireDatabaseUrl()).toBe("postgresql://user:pass@localhost:5432/watch_store");
  });
});

describe("inventory reservation service invariants", () => {
  it("throws InsufficientStockError when conditional update affects 0 rows", async () => {
    const tx = {
      productStock: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      inventoryReservation: { create: vi.fn() },
      stockAdjustment: { create: vi.fn() },
    } as unknown as Parameters<typeof reserveStockInTx>[0];

    await expect(
      reserveStockInTx(tx, {
        orderId: "ord-1",
        orderItemId: "item-1",
        productId: "p-001",
        quantity: 2,
      }),
    ).rejects.toThrow(InsufficientStockError);
    expect(tx.inventoryReservation.create).not.toHaveBeenCalled();
  });

  it("reserves stock atomically and records adjustment", async () => {
    const tx = {
      productStock: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      inventoryReservation: { create: vi.fn().mockResolvedValue({ id: "res-1", status: "RESERVED" }) },
      stockAdjustment: { create: vi.fn().mockResolvedValue({ id: "adj-1" }) },
    } as unknown as Parameters<typeof reserveStockInTx>[0];

    const res = await reserveStockInTx(tx, {
      orderId: "ord-1",
      orderItemId: "item-1",
      productId: "p-001",
      quantity: 2,
    });
    expect(res.status).toBe("RESERVED");
    expect(tx.productStock.updateMany).toHaveBeenCalledWith({
      where: { productId: "p-001", available: { gte: 2 } },
      data: { available: { decrement: 2 }, reserved: { increment: 2 } },
    });
    expect(tx.stockAdjustment.create).toHaveBeenCalledTimes(1);
  });

  it("releases and commits reservations idempotently", async () => {
    const txAlreadyReleased = {
      inventoryReservation: {
        findUnique: vi.fn().mockResolvedValue({ id: "res-1", status: "RELEASED" }),
        updateMany: vi.fn(),
      },
      productStock: { updateMany: vi.fn() },
      stockAdjustment: { create: vi.fn() },
    } as unknown as Parameters<typeof releaseReservationInTx>[0];

    expect(await releaseReservationInTx(txAlreadyReleased, "res-1")).toBe(false);
    expect(txAlreadyReleased.productStock.updateMany).not.toHaveBeenCalled();

    const txCommit = {
      inventoryReservation: {
        findUnique: vi.fn().mockResolvedValue({
          id: "res-1",
          orderId: "ord-1",
          productId: "p-001",
          quantity: 1,
          status: "RESERVED",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      productStock: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      stockAdjustment: { create: vi.fn().mockResolvedValue({ id: "adj-2" }) },
    } as unknown as Parameters<typeof commitReservationInTx>[0];

    expect(await commitReservationInTx(txCommit, "res-1")).toBe(true);
    expect(txCommit.productStock.updateMany).toHaveBeenCalledWith({
      where: { productId: "p-001", reserved: { gte: 1 } },
      data: { reserved: { decrement: 1 } },
    });
  });
});
