import { describe, expect, it } from "vitest";
import {
  classifyStockStatus,
  lowStockThresholdSchema,
  stockAdjustmentSchema,
  stockInwardSchema,
  stockOutwardSchema,
} from "@/modules/admin/inventory/inventory-validation";
import { ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";

describe("Phase 10 — Inventory Validation, Low-Stock Rules & RBAC", () => {
  it("classifies stock status accurately using available stock and threshold", () => {
    expect(classifyStockStatus(0, 3)).toBe("OUT_OF_STOCK");
    expect(classifyStockStatus(1, 3)).toBe("LOW_STOCK");
    expect(classifyStockStatus(3, 3)).toBe("LOW_STOCK");
    expect(classifyStockStatus(4, 3)).toBe("IN_STOCK");
    expect(classifyStockStatus(0, 0)).toBe("OUT_OF_STOCK");
    expect(classifyStockStatus(1, 0)).toBe("IN_STOCK");
  });

  it("validates inward, outward, adjustment, and threshold schemas strictly", () => {
    expect(
      stockInwardSchema.safeParse({
        productId: "p-001",
        quantity: 5,
        reason: "Supplier delivery",
        idempotencyKey: "inward-key-12345",
      }).success,
    ).toBe(true);

    expect(
      stockInwardSchema.safeParse({
        productId: "p-001",
        quantity: 0,
        reason: "Invalid zero",
        idempotencyKey: "inward-key-12345",
      }).success,
    ).toBe(false);

    expect(
      stockOutwardSchema.safeParse({
        productId: "p-001",
        quantity: 1.5,
        reason: "Non-integer",
        idempotencyKey: "outward-key-12345",
      }).success,
    ).toBe(false);

    expect(
      stockAdjustmentSchema.safeParse({
        productId: "p-001",
        mode: "SET_PHYSICAL",
        quantity: 0,
        reason: "Zero count",
        idempotencyKey: "adj-key-12345",
      }).success,
    ).toBe(true);

    expect(
      stockAdjustmentSchema.safeParse({
        productId: "p-001",
        mode: "DELTA_DECREASE",
        quantity: 0,
        reason: "Invalid zero delta",
        idempotencyKey: "adj-key-12345",
      }).success,
    ).toBe(false);

    expect(
      lowStockThresholdSchema.safeParse({
        productId: "p-001",
        threshold: -1,
      }).success,
    ).toBe(false);
  });

  it("grants inventory permissions to INVENTORY_MANAGER and restricts ORDER_MANAGER", () => {
    const invPerms = new Set(ADMIN_ROLE_DEFINITIONS.INVENTORY_MANAGER.permissions);
    expect(invPerms.has("inventory.read")).toBe(true);
    expect(invPerms.has("inventory.update")).toBe(true);

    const orderPerms = new Set(ADMIN_ROLE_DEFINITIONS.ORDER_MANAGER.permissions);
    expect(orderPerms.has("inventory.read")).toBe(false);
    expect(orderPerms.has("inventory.update")).toBe(false);
  });
});
