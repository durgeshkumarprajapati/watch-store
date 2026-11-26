import type { ShipmentStatus } from "@prisma/client";

const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  PENDING: [
    "SERVICEABILITY_CHECKED",
    "SHIPMENT_CREATED",
    "AWB_ASSIGNED",
    "IN_TRANSIT",
    "CANCELLED",
    "FAILED",
    "RECONCILIATION_REQUIRED",
  ],
  SERVICEABILITY_CHECKED: [
    "SHIPMENT_CREATED",
    "CANCELLED",
    "FAILED",
    "RECONCILIATION_REQUIRED",
  ],
  SHIPMENT_CREATED: [
    "AWB_ASSIGNED",
    "CANCELLED",
    "FAILED",
    "RECONCILIATION_REQUIRED",
  ],
  AWB_ASSIGNED: [
    "PICKUP_SCHEDULED",
    "PICKUP_COMPLETED",
    "IN_TRANSIT",
    "CANCELLED",
    "FAILED",
    "RECONCILIATION_REQUIRED",
  ],
  PICKUP_SCHEDULED: [
    "PICKUP_COMPLETED",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
    "RTO_INITIATED",
    "RECONCILIATION_REQUIRED",
  ],
  PICKUP_COMPLETED: [
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "RTO_INITIATED",
  ],
  IN_TRANSIT: [
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "RTO_INITIATED",
  ],
  OUT_FOR_DELIVERY: [
    "DELIVERED",
    "IN_TRANSIT",
    "RTO_INITIATED",
  ],
  DELIVERED: [],
  RTO_INITIATED: ["RTO_DELIVERED"],
  RTO_DELIVERED: [],
  CANCELLED: [],
  FAILED: ["PENDING", "SHIPMENT_CREATED", "RECONCILIATION_REQUIRED", "CANCELLED"],
  RECONCILIATION_REQUIRED: [
    "SHIPMENT_CREATED",
    "AWB_ASSIGNED",
    "PICKUP_SCHEDULED",
    "IN_TRANSIT",
    "DELIVERED",
    "CANCELLED",
    "FAILED",
  ],
};

export function canTransitionShipmentStatus(from: ShipmentStatus, to: ShipmentStatus): boolean {
  if (from === to) return true;
  return SHIPMENT_TRANSITIONS[from].includes(to);
}

export function isActiveShipmentStatus(status: ShipmentStatus): boolean {
  return status !== "CANCELLED" && status !== "FAILED";
}

export function normalizeShiprocketStatus(providerStatus: string): ShipmentStatus | null {
  const s = providerStatus.trim().toUpperCase();
  if (!s) return null;
  if (s.includes("RTO DELIVERED")) return "RTO_DELIVERED";
  if (s.includes("RTO")) return "RTO_INITIATED";
  if (s.includes("DELIVERED")) return "DELIVERED";
  if (s.includes("OUT FOR DELIVERY") || s === "OFD") return "OUT_FOR_DELIVERY";
  if (s.includes("IN TRANSIT") || s.includes("SHIPPED") || s.includes("DISPATCHED")) {
    return "IN_TRANSIT";
  }
  if (s.includes("PICKED UP") || s.includes("PICKUP COMPLETED")) return "PICKUP_COMPLETED";
  if (s.includes("PICKUP SCHEDULED") || s.includes("PICKUP GENERATED")) return "PICKUP_SCHEDULED";
  if (s.includes("AWB ASSIGNED")) return "AWB_ASSIGNED";
  if (s.includes("CANCEL")) return "CANCELLED";
  if (s.includes("NEW") || s.includes("CREATED")) return "SHIPMENT_CREATED";
  return null;
}
