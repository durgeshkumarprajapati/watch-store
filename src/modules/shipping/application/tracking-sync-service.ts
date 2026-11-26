import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, Shipment, ShipmentStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { enqueueOrderNotificationInTx } from "@/modules/notifications/notification-outbox-service";
import {
  canTransitionShipmentStatus,
  normalizeShiprocketStatus,
} from "../domain/shipment-state-machine";
import { getShiprocketAuthToken } from "../infrastructure/shiprocket-auth-service";
import {
  httpShiprocketClient,
  ShiprocketApiError,
  type ShiprocketClient,
} from "../infrastructure/shiprocket-client";

export function buildHistoryDedupeKey(
  shipmentId: string,
  status: string,
  timestamp: string,
  location?: string,
): string {
  return createHash("sha256")
    .update(`${shipmentId}|${status}|${timestamp}|${location ?? ""}`)
    .digest("hex");
}

export async function applyTrackingUpdateInTx(
  tx: Prisma.TransactionClient,
  shipment: Pick<Shipment, "id" | "orderId" | "status" | "awbCode" | "courierName">,
  params: {
    providerStatus: string;
    location?: string;
    note?: string;
    eventAt?: Date;
    dedupeKey?: string;
    courierName?: string;
    trackingUrl?: string;
  },
): Promise<{ updated: boolean; status: ShipmentStatus }> {
  const normalized = normalizeShiprocketStatus(params.providerStatus);
  const now = new Date();

  if (!normalized || !canTransitionShipmentStatus(shipment.status, normalized)) {
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        lastSyncedAt: now,
        lastProviderStatus: params.providerStatus,
      },
    });
    return { updated: false, status: shipment.status };
  }

  const dedupeKey =
    params.dedupeKey ??
    buildHistoryDedupeKey(
      shipment.id,
      normalized,
      (params.eventAt ?? now).toISOString(),
      params.location,
    );

  const existingHistory = await tx.shipmentStatusHistory.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  if (existingHistory) {
    await tx.shipment.update({
      where: { id: shipment.id },
      data: { lastSyncedAt: now, lastProviderStatus: params.providerStatus },
    });
    return { updated: false, status: shipment.status };
  }

  await tx.shipment.update({
    where: { id: shipment.id },
    data: {
      status: normalized,
      lastSyncedAt: now,
      lastProviderStatus: params.providerStatus,
      reconciliationRequired: false,
      lastError: null,
      ...(params.courierName && !shipment.courierName ? { courierName: params.courierName } : {}),
      ...(params.trackingUrl ? { trackingUrl: params.trackingUrl } : {}),
    },
  });

  await tx.shipmentStatusHistory.create({
    data: {
      shipmentId: shipment.id,
      fromStatus: shipment.status,
      toStatus: normalized,
      providerStatus: params.providerStatus,
      location: params.location || null,
      note: params.note || `Provider status: ${params.providerStatus}`,
      dedupeKey,
      eventAt: params.eventAt ?? now,
    },
  });

  if (normalized === "IN_TRANSIT") {
    await enqueueOrderNotificationInTx(tx, {
      orderId: shipment.orderId,
      eventType: "SHIPMENT_DISPATCHED",
      dedupeKey: `SHIPMENT_DISPATCHED:${shipment.orderId}`,
      courierName: params.courierName ?? shipment.courierName,
      awbCode: shipment.awbCode,
      trackingUrl: params.trackingUrl,
    });
  } else if (normalized === "OUT_FOR_DELIVERY") {
    await enqueueOrderNotificationInTx(tx, {
      orderId: shipment.orderId,
      eventType: "OUT_FOR_DELIVERY",
      dedupeKey: `OUT_FOR_DELIVERY:${shipment.orderId}`,
      courierName: params.courierName ?? shipment.courierName,
      awbCode: shipment.awbCode,
      trackingUrl: params.trackingUrl,
    });
  } else if (normalized === "DELIVERED") {
    await enqueueOrderNotificationInTx(tx, {
      orderId: shipment.orderId,
      eventType: "ORDER_DELIVERED",
      dedupeKey: `ORDER_DELIVERED:${shipment.orderId}`,
      courierName: params.courierName ?? shipment.courierName,
      awbCode: shipment.awbCode,
      trackingUrl: params.trackingUrl,
    });
  }

  return { updated: true, status: normalized };
}

export async function syncShipmentTracking(
  shipmentId: string,
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; status: ShipmentStatus; updated: boolean } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return { ok: false, error: "Shipment not found." };
  if (shipment.isManual) {
    return { ok: false, error: "Manual shipments do not sync via Shiprocket." };
  }
  if (!shipment.awbCode) {
    return { ok: false, error: "Cannot sync tracking before AWB is assigned." };
  }

  try {
    const token = await getShiprocketAuthToken(client, prisma);
    const tracking = await client.trackByAwb(token, shipment.awbCode);
    const trackInfo = tracking.tracking_data?.shipment_track?.[0];
    const currentStatus = trackInfo?.current_status;
    if (!currentStatus) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { lastSyncedAt: new Date() },
      });
      return { ok: true, status: shipment.status, updated: false };
    }

    const latestScan = tracking.tracking_data?.shipment_track_activities?.[0];
    const trackingUrl = tracking.tracking_data?.track_url;
    const safeUrl =
      trackingUrl && trackingUrl.startsWith("https://") ? trackingUrl : undefined;

    const result = await prisma.$transaction((tx) =>
      applyTrackingUpdateInTx(tx, shipment, {
        providerStatus: currentStatus,
        location: latestScan?.location,
        note: latestScan?.activity ?? `Tracking synced: ${currentStatus}`,
        eventAt: latestScan?.date ? new Date(latestScan.date) : new Date(),
        courierName: trackInfo?.courier_name,
        trackingUrl: safeUrl,
      }),
    );

    return { ok: true, status: result.status, updated: result.updated };
  } catch (error) {
    const message =
      error instanceof ShiprocketApiError
        ? error.message
        : "Failed to synchronize tracking with Shiprocket.";
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { lastError: message },
    });
    return { ok: false, error: message };
  }
}

export async function reconcileShipment(
  shipmentId: string,
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; status: ShipmentStatus } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return { ok: false, error: "Shipment not found." };
  if (shipment.isManual) return { ok: false, error: "Manual shipments do not require reconciliation." };

  if (shipment.awbCode) {
    const synced = await syncShipmentTracking(shipmentId, client, prisma);
    if (!synced.ok) return synced;
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { reconciliationRequired: false, lastError: null },
    });
    return { ok: true, status: synced.status };
  }

  if (!shipment.shiprocketOrderId) {
    return {
      ok: false,
      error: "No Shiprocket order reference recorded; verify in Shiprocket panel or retry creation.",
    };
  }

  try {
    const token = await getShiprocketAuthToken(client, prisma);
    const details = await client.getOrderDetails(token, shipment.shiprocketOrderId);
    const srShipment = details.data?.shipments;
    const nextStatus: ShipmentStatus = srShipment?.awb
      ? "AWB_ASSIGNED"
      : srShipment?.id
        ? "SHIPMENT_CREATED"
        : shipment.status;

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: nextStatus,
          reconciliationRequired: false,
          lastError: null,
          lastSyncedAt: new Date(),
          ...(srShipment?.id ? { shiprocketShipmentId: String(srShipment.id) } : {}),
          ...(srShipment?.awb ? { awbCode: srShipment.awb } : {}),
          ...(srShipment?.courier ? { courierName: srShipment.courier } : {}),
        },
      });
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: shipment.status,
          toStatus: nextStatus,
          note: "Shipment state reconciled from Shiprocket order lookup",
        },
      });
    });

    return { ok: true, status: nextStatus };
  } catch (error) {
    const message =
      error instanceof ShiprocketApiError ? error.message : "Reconciliation failed.";
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { lastError: message, reconciliationRequired: true },
    });
    return { ok: false, error: message };
  }
}
