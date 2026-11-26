import { afterEach, describe, expect, it } from "vitest";
import { ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";
import {
  canTransitionShipmentStatus,
  isActiveShipmentStatus,
  normalizeShiprocketStatus,
} from "@/modules/shipping/domain/shipment-state-machine";
import {
  decryptShiprocketToken,
  encryptShiprocketToken,
} from "@/modules/shipping/infrastructure/token-crypto";
import {
  computeWebhookDedupeKey,
  verifyShiprocketWebhookToken,
} from "@/modules/shipping/application/shipping-webhook-service";
import { manualShipmentSchema } from "@/modules/shipping/application/shipping-validation";

describe("Phase 12 — Shiprocket Crypto, State Machine, Webhooks & RBAC", () => {
  const originalWebhookToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;

  afterEach(() => {
    process.env.SHIPROCKET_WEBHOOK_TOKEN = originalWebhookToken;
  });

  it("encrypts and decrypts Shiprocket tokens with AES-256-GCM and rejects tampering", () => {
    const plain = "sr_live_bearer_token_example_123456";
    const encrypted = encryptShiprocketToken(plain);
    expect(encrypted).not.toContain(plain);
    expect(decryptShiprocketToken(encrypted)).toBe(plain);

    const tampered = `${encrypted.slice(0, -2)}AA`;
    expect(() => decryptShiprocketToken(tampered)).toThrow();
  });

  it("enforces shipment state transitions and normalizes provider statuses", () => {
    expect(canTransitionShipmentStatus("PENDING", "SHIPMENT_CREATED")).toBe(true);
    expect(canTransitionShipmentStatus("SHIPMENT_CREATED", "AWB_ASSIGNED")).toBe(true);
    expect(canTransitionShipmentStatus("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(canTransitionShipmentStatus("CANCELLED", "PICKUP_SCHEDULED")).toBe(false);

    expect(isActiveShipmentStatus("SHIPMENT_CREATED")).toBe(true);
    expect(isActiveShipmentStatus("CANCELLED")).toBe(false);
    expect(isActiveShipmentStatus("FAILED")).toBe(false);

    expect(normalizeShiprocketStatus("AWB Assigned")).toBe("AWB_ASSIGNED");
    expect(normalizeShiprocketStatus("Pickup Scheduled")).toBe("PICKUP_SCHEDULED");
    expect(normalizeShiprocketStatus("In Transit")).toBe("IN_TRANSIT");
    expect(normalizeShiprocketStatus("Out For Delivery")).toBe("OUT_FOR_DELIVERY");
    expect(normalizeShiprocketStatus("Delivered")).toBe("DELIVERED");
    expect(normalizeShiprocketStatus("RTO Initiated")).toBe("RTO_INITIATED");
    expect(normalizeShiprocketStatus("Canceled")).toBe("CANCELLED");
  });

  it("verifies Shiprocket webhook x-api-key header and computes deterministic dedupe keys", () => {
    process.env.SHIPROCKET_WEBHOOK_TOKEN = "sr_webhook_secret_token_99";
    expect(verifyShiprocketWebhookToken("sr_webhook_secret_token_99")).toBe(true);
    expect(verifyShiprocketWebhookToken("wrong_token")).toBe(false);
    expect(verifyShiprocketWebhookToken(null)).toBe(false);

    const k1 = computeWebhookDedupeKey("{}", {
      awb: "AWB123",
      current_status: "In Transit",
      current_timestamp: "2026-11-25 16:00:00",
    });
    const k2 = computeWebhookDedupeKey("{}", {
      awb: "AWB123",
      current_status: "IN TRANSIT",
      current_timestamp: "2026-11-25 16:00:00",
    });
    expect(k1).toBe(k2);
  });

  it("validates manual shipment fallback URLs and shipping RBAC roles", () => {
    expect(
      manualShipmentSchema.safeParse({
        orderId: "ord_1",
        carrierName: "BlueDart",
        trackingNumber: "BD123456",
        trackingUrl: "javascript:alert(1)",
        idempotencyKey: "manual-key-12345",
      }).success,
    ).toBe(false);

    const orderMgr = new Set(ADMIN_ROLE_DEFINITIONS.ORDER_MANAGER.permissions);
    expect(orderMgr.has("shipments.read")).toBe(true);
    expect(orderMgr.has("shipments.manage")).toBe(true);
    expect(orderMgr.has("shipments.cancel")).toBe(true);
    expect(orderMgr.has("shipments.retry")).toBe(true);

    const support = new Set(ADMIN_ROLE_DEFINITIONS.CUSTOMER_SUPPORT.permissions);
    expect(support.has("shipments.read")).toBe(true);
    expect(support.has("shipments.manage")).toBe(false);
  });
});
