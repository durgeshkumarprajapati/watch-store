import { describe, expect, it } from "vitest";
import {
  cancelOrderSchema,
  dispatchOrderSchema,
  safeTrackingUrlSchema,
  transitionOrderSchema,
} from "@/modules/admin/orders/order-validation";
import { ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";

describe("Phase 11 — Order Validation, Tracking URL Security & RBAC", () => {
  it("validates tracking URLs and blocks unsafe URL schemes", () => {
    expect(safeTrackingUrlSchema.safeParse("").success).toBe(true);
    expect(safeTrackingUrlSchema.safeParse("https://bluedart.com/track/123").success).toBe(true);
    expect(safeTrackingUrlSchema.safeParse("http://insecure.example.com/123").success).toBe(false);
    expect(safeTrackingUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(safeTrackingUrlSchema.safeParse("data:text/html,<script>").success).toBe(false);
  });

  it("validates dispatch, cancellation, and transition schemas", () => {
    expect(
      dispatchOrderSchema.safeParse({
        orderId: "ord_1",
        carrierName: "BlueDart Insured",
        trackingNumber: "BD99887766",
        trackingUrl: "https://bluedart.com/track/BD99887766",
        idempotencyKey: "dispatch-key-12345",
      }).success,
    ).toBe(true);

    expect(
      cancelOrderSchema.safeParse({
        orderId: "ord_1",
        reason: "Customer requested cancellation",
        idempotencyKey: "cancel-key-12345",
      }).success,
    ).toBe(true);

    expect(
      transitionOrderSchema.safeParse({
        orderId: "ord_1",
        targetStatus: "CANCELLED",
        idempotencyKey: "trans-key-12345",
      }).success,
    ).toBe(false);
  });

  it("enforces order RBAC permissions across roles", () => {
    const orderMgr = new Set(ADMIN_ROLE_DEFINITIONS.ORDER_MANAGER.permissions);
    expect(orderMgr.has("orders.read")).toBe(true);
    expect(orderMgr.has("orders.update")).toBe(true);
    expect(orderMgr.has("orders.cancel")).toBe(true);

    const support = new Set(ADMIN_ROLE_DEFINITIONS.CUSTOMER_SUPPORT.permissions);
    expect(support.has("orders.read")).toBe(true);
    expect(support.has("orders.update")).toBe(false);
    expect(support.has("orders.cancel")).toBe(false);

    const invMgr = new Set(ADMIN_ROLE_DEFINITIONS.INVENTORY_MANAGER.permissions);
    expect(invMgr.has("orders.read")).toBe(false);
    expect(invMgr.has("orders.update")).toBe(false);
  });
});
