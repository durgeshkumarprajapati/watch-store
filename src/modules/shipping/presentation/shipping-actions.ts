"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "@/modules/admin/admin-auth-service";
import {
  checkOrderServiceability,
  createManualShipmentRecord,
  createShiprocketShipment,
} from "../application/shipment-creation-service";
import {
  assignShipmentAwb,
  cancelShiprocketShipment,
  generateShipmentLabel,
  scheduleShipmentPickup,
} from "../application/shipment-fulfilment-service";
import { reconcileShipment, syncShipmentTracking } from "../application/tracking-sync-service";

function revalidateShippingRoutes(orderId?: string, shipmentId?: string) {
  try {
    revalidatePath("/admin/shipments");
    if (shipmentId) revalidatePath(`/admin/shipments/${shipmentId}`);
    if (orderId) {
      revalidatePath(`/admin/orders/${orderId}`);
      revalidatePath(`/account/orders/${orderId}`);
    }
    revalidatePath("/admin/orders");
  } catch {
    // Outside Next.js request context.
  }
}

export async function checkOrderServiceabilityAction(orderId: string, weightKg = 0.5) {
  await requireAdminActionPermission("shipments.read");
  return checkOrderServiceability(orderId, weightKg);
}

export async function createShiprocketShipmentAction(input: {
  orderId: string;
  weightKg?: number;
  lengthCm?: number;
  breadthCm?: number;
  heightCm?: number;
  idempotencyKey: string;
}) {
  const actor = await requireAdminActionPermission("shipments.manage");
  const res = await createShiprocketShipment(actor, input);
  if (res.ok) revalidateShippingRoutes(input.orderId, res.shipmentId);
  return res;
}

export async function createManualShipmentAction(input: {
  orderId: string;
  carrierName: string;
  trackingNumber: string;
  trackingUrl?: string;
  idempotencyKey: string;
}) {
  const actor = await requireAdminActionPermission("shipments.manage");
  const res = await createManualShipmentRecord(actor, input);
  if (res.ok) revalidateShippingRoutes(input.orderId, res.shipmentId);
  return res;
}

export async function assignShipmentAwbAction(shipmentId: string, courierId?: number) {
  const actor = await requireAdminActionPermission("shipments.manage");
  const res = await assignShipmentAwb(actor, { shipmentId, courierId });
  if (res.ok) revalidateShippingRoutes(undefined, shipmentId);
  return res;
}

export async function generateShipmentLabelAction(shipmentId: string) {
  const actor = await requireAdminActionPermission("shipments.manage");
  const res = await generateShipmentLabel(actor, shipmentId);
  if (res.ok) revalidateShippingRoutes(undefined, shipmentId);
  return res;
}

export async function scheduleShipmentPickupAction(shipmentId: string) {
  const actor = await requireAdminActionPermission("shipments.manage");
  const res = await scheduleShipmentPickup(actor, { shipmentId });
  if (res.ok) revalidateShippingRoutes(undefined, shipmentId);
  return res;
}

export async function syncShipmentTrackingAction(shipmentId: string) {
  await requireAdminActionPermission("shipments.read");
  const res = await syncShipmentTracking(shipmentId);
  if (res.ok) revalidateShippingRoutes(undefined, shipmentId);
  return res;
}

export async function reconcileShipmentAction(shipmentId: string) {
  await requireAdminActionPermission("shipments.retry");
  const res = await reconcileShipment(shipmentId);
  if (res.ok) revalidateShippingRoutes(undefined, shipmentId);
  return res;
}

export async function cancelShiprocketShipmentAction(shipmentId: string, reason: string) {
  const actor = await requireAdminActionPermission("shipments.cancel");
  const res = await cancelShiprocketShipment(actor, { shipmentId, reason });
  if (res.ok) revalidateShippingRoutes(undefined, shipmentId);
  return res;
}
