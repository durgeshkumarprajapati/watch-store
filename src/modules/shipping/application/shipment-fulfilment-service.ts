import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditLog } from "@/modules/admin/admin-audit-service";
import type { AuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { canTransitionShipmentStatus } from "../domain/shipment-state-machine";
import { getShiprocketAuthToken } from "../infrastructure/shiprocket-auth-service";
import {
  httpShiprocketClient,
  ShiprocketApiError,
  type ShiprocketClient,
} from "../infrastructure/shiprocket-client";
import {
  assignAwbSchema,
  cancelShipmentSchema,
  schedulePickupSchema,
} from "./shipping-validation";

export async function assignShipmentAwb(
  actor: AuthenticatedAdmin,
  rawInput: { shipmentId: string; courierId?: number },
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; awbCode: string; idempotentReplay: boolean } | { ok: false; error: string }> {
  const parsed = assignAwbSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid AWB input." };
  }
  const { shipmentId, courierId } = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return { ok: false, error: "Shipment not found." };
  if (shipment.isManual) return { ok: false, error: "Manual shipments do not use Shiprocket AWB assignment." };
  if (shipment.awbCode) {
    return { ok: true, awbCode: shipment.awbCode, idempotentReplay: true };
  }
  if (!shipment.shiprocketShipmentId) {
    return { ok: false, error: "Shiprocket shipment ID is missing." };
  }
  if (!canTransitionShipmentStatus(shipment.status, "AWB_ASSIGNED")) {
    return { ok: false, error: `Cannot assign AWB in ${shipment.status} state.` };
  }

  try {
    const token = await getShiprocketAuthToken(client, prisma);
    const res = await client.assignAwb(token, {
      shipmentId: shipment.shiprocketShipmentId,
      courierId,
    });
    const awbData = res.response?.data;
    if (!awbData?.awb_code) {
      return { ok: false, error: "Shiprocket did not return an AWB code." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: "AWB_ASSIGNED",
          awbCode: awbData.awb_code,
          courierId: awbData.courier_company_id ?? courierId ?? null,
          courierName: awbData.courier_name ?? shipment.courierName,
          reconciliationRequired: false,
          lastError: null,
        },
      });
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: shipment.status,
          toStatus: "AWB_ASSIGNED",
          note: `AWB assigned: ${awbData.awb_code}${awbData.courier_name ? ` (${awbData.courier_name})` : ""}`,
          actorAdminId: actor.adminId,
        },
      });
      await tx.order.update({
        where: { id: shipment.orderId },
        data: {
          trackingNumber: awbData.awb_code,
          ...(awbData.courier_name ? { carrierName: awbData.courier_name } : {}),
        },
      });
    });

    await recordAdminAuditLog(
      {
        actorAdminId: actor.adminId,
        action: "SHIPMENT_AWB_ASSIGNED",
        targetType: "Shipment",
        targetId: shipment.id,
        success: true,
        metadata: { awbCode: awbData.awb_code },
      },
      prisma,
    );

    return { ok: true, awbCode: awbData.awb_code, idempotentReplay: false };
  } catch (error) {
    const isRetryable = error instanceof ShiprocketApiError ? error.retryable : true;
    const message = error instanceof Error ? error.message : "AWB assignment failed.";
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        lastError: message,
        ...(isRetryable ? { status: "RECONCILIATION_REQUIRED", reconciliationRequired: true } : {}),
      },
    });
    return { ok: false, error: message };
  }
}

export async function generateShipmentLabel(
  actor: AuthenticatedAdmin,
  shipmentId: string,
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; labelUrl: string } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return { ok: false, error: "Shipment not found." };
  if (shipment.isManual) return { ok: false, error: "Manual shipments do not support Shiprocket labels." };
  if (shipment.labelUrl) return { ok: true, labelUrl: shipment.labelUrl };
  if (!shipment.shiprocketShipmentId || !shipment.awbCode) {
    return { ok: false, error: "Assign an AWB before generating a shipping label." };
  }

  try {
    const token = await getShiprocketAuthToken(client, prisma);
    const res = await client.generateLabel(token, { shipmentId: shipment.shiprocketShipmentId });
    if (!res.label_url || !res.label_url.startsWith("https://")) {
      return { ok: false, error: "Shiprocket returned an invalid or missing HTTPS label URL." };
    }

    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { labelUrl: res.label_url, lastError: null },
    });

    await recordAdminAuditLog(
      {
        actorAdminId: actor.adminId,
        action: "SHIPMENT_LABEL_GENERATED",
        targetType: "Shipment",
        targetId: shipment.id,
        success: true,
      },
      prisma,
    );

    return { ok: true, labelUrl: res.label_url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to generate shipping label.",
    };
  }
}

export async function scheduleShipmentPickup(
  actor: AuthenticatedAdmin,
  rawInput: { shipmentId: string },
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; idempotentReplay: boolean } | { ok: false; error: string }> {
  const parsed = schedulePickupSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Invalid pickup request." };
  }
  const prisma = prismaClient ?? getPrisma();
  const shipment = await prisma.shipment.findUnique({ where: { id: parsed.data.shipmentId } });
  if (!shipment) return { ok: false, error: "Shipment not found." };
  if (shipment.isManual) return { ok: false, error: "Manual shipments do not support Shiprocket pickup." };
  if (shipment.pickupScheduledAt || shipment.status === "PICKUP_SCHEDULED") {
    return { ok: true, idempotentReplay: true };
  }
  if (!shipment.shiprocketShipmentId || !shipment.awbCode) {
    return { ok: false, error: "Assign an AWB before scheduling pickup." };
  }
  if (!canTransitionShipmentStatus(shipment.status, "PICKUP_SCHEDULED")) {
    return { ok: false, error: `Cannot schedule pickup in ${shipment.status} state.` };
  }

  try {
    const token = await getShiprocketAuthToken(client, prisma);
    const res = await client.schedulePickup(token, { shipmentId: shipment.shiprocketShipmentId });
    const pickupRef = res.response?.pickup_token_number ?? null;
    const pickupAt = res.response?.pickup_scheduled_date
      ? new Date(res.response.pickup_scheduled_date)
      : new Date();

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: "PICKUP_SCHEDULED",
          pickupScheduledAt: Number.isNaN(pickupAt.getTime()) ? new Date() : pickupAt,
          pickupReference: pickupRef,
          reconciliationRequired: false,
          lastError: null,
        },
      });
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: shipment.status,
          toStatus: "PICKUP_SCHEDULED",
          note: `Pickup scheduled${pickupRef ? ` (Ref: ${pickupRef})` : ""}`,
          actorAdminId: actor.adminId,
        },
      });
    });

    await recordAdminAuditLog(
      {
        actorAdminId: actor.adminId,
        action: "SHIPMENT_PICKUP_SCHEDULED",
        targetType: "Shipment",
        targetId: shipment.id,
        success: true,
        metadata: { pickupRef },
      },
      prisma,
    );

    return { ok: true, idempotentReplay: false };
  } catch (error) {
    const isRetryable = error instanceof ShiprocketApiError ? error.retryable : true;
    const message = error instanceof Error ? error.message : "Pickup scheduling failed.";
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        lastError: message,
        ...(isRetryable ? { status: "RECONCILIATION_REQUIRED", reconciliationRequired: true } : {}),
      },
    });
    return { ok: false, error: message };
  }
}

export async function cancelShiprocketShipment(
  actor: AuthenticatedAdmin,
  rawInput: { shipmentId: string; reason: string },
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = cancelShipmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid cancellation input." };
  }
  const { shipmentId, reason } = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return { ok: false, error: "Shipment not found." };
  if (!canTransitionShipmentStatus(shipment.status, "CANCELLED")) {
    return {
      ok: false,
      error: `Shipment in ${shipment.status} status cannot be cancelled.`,
    };
  }

  if (!shipment.isManual && shipment.shiprocketOrderId) {
    try {
      const token = await getShiprocketAuthToken(client, prisma);
      await client.cancelOrder(token, [shipment.shiprocketOrderId]);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Shiprocket cancellation failed.",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason,
        reconciliationRequired: false,
      },
    });
    await tx.shipmentStatusHistory.create({
      data: {
        shipmentId: shipment.id,
        fromStatus: shipment.status,
        toStatus: "CANCELLED",
        note: `Shipment cancelled: ${reason}`,
        actorAdminId: actor.adminId,
      },
    });
  });

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "SHIPMENT_CANCELLED",
      targetType: "Shipment",
      targetId: shipment.id,
      success: true,
      metadata: { reason },
    },
    prisma,
  );

  return { ok: true };
}
