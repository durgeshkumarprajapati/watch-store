import type { PrismaClient } from "@prisma/client";
import { getServerEnv } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditLog } from "@/modules/admin/admin-audit-service";
import type { AuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { enqueueOrderNotificationInTx } from "@/modules/notifications/notification-outbox-service";
import { isActiveShipmentStatus } from "../domain/shipment-state-machine";
import { getShiprocketAuthToken } from "../infrastructure/shiprocket-auth-service";
import {
  httpShiprocketClient,
  ShiprocketApiError,
  type ShiprocketClient,
} from "../infrastructure/shiprocket-client";
import {
  checkServiceabilitySchema,
  createShipmentSchema,
  manualShipmentSchema,
} from "./shipping-validation";

export async function checkOrderServiceability(
  orderId: string,
  weightKg = 0.5,
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
) {
  const parsed = checkServiceabilitySchema.safeParse({ orderId, weightKg });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const prisma = prismaClient ?? getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { addressSnapshot: true },
  });
  if (!order || !order.addressSnapshot) {
    return { ok: false as const, error: "Order or delivery address snapshot not found." };
  }
  if (!/^\d{6}$/.test(order.addressSnapshot.pinCode)) {
    return { ok: false as const, error: "Delivery address PIN code is invalid for courier serviceability." };
  }

  const env = getServerEnv();
  const pickupPostcode = env.SHIPROCKET_PICKUP_PINCODE ?? "400001";

  try {
    const token = await getShiprocketAuthToken(client, prisma);
    const res = await client.checkServiceability(token, {
      pickupPostcode,
      deliveryPostcode: order.addressSnapshot.pinCode,
      weightKg: parsed.data.weightKg,
      cod: order.paymentProvider === "COD" ? 1 : 0,
    });
    return {
      ok: true as const,
      couriers: res.data.available_courier_companies,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Serviceability check failed.",
    };
  }
}

export async function createShiprocketShipment(
  actor: AuthenticatedAdmin,
  rawInput: {
    orderId: string;
    weightKg?: number;
    lengthCm?: number;
    breadthCm?: number;
    heightCm?: number;
    idempotencyKey: string;
  },
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
): Promise<
  | { ok: true; idempotentReplay: boolean; shipmentId: string }
  | { ok: false; error: string; reconciliationRequired?: boolean }
> {
  const parsed = createShipmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid shipment input." };
  }
  const d = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  // 1. Idempotency replay check
  const existingByKey = await prisma.shipment.findUnique({
    where: { idempotencyKey: d.idempotencyKey },
  });
  if (existingByKey) {
    return { ok: true, idempotentReplay: true, shipmentId: existingByKey.id };
  }

  // 2. Lock Order + validate eligibility + reserve local Shipment row
  let draftShipment: { id: string; orderNumber: string };
  let orderPayloadData: {
    orderNumber: string;
    createdAt: Date;
    paymentProvider: "COD" | "RAZORPAY";
    grandTotalPaise: number;
    address: {
      fullName: string;
      addressLine1: string;
      addressLine2: string;
      city: string;
      pinCode: string;
      state: string;
      country: string;
      email: string;
      phone: string;
    };
    items: { name: string; sku: string; quantity: number; unitPricePaise: number; unitDiscountPaise: number }[];
  };

  try {
    const locked = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${d.orderId} FOR UPDATE`;

      const order = await tx.order.findUnique({
        where: { id: d.orderId },
        include: {
          addressSnapshot: true,
          items: true,
          shipments: true,
        },
      });
      if (!order) throw new Error("Order not found.");
      if (order.status !== "CONFIRMED" && order.status !== "PROCESSING") {
        throw new Error(`Order must be CONFIRMED or PROCESSING to create shipment (current: ${order.status}).`);
      }
      if (order.paymentProvider === "RAZORPAY" && order.paymentStatus !== "PAID") {
        throw new Error(`Cannot create shipment for unpaid Razorpay order (${order.paymentStatus}).`);
      }
      if (!order.addressSnapshot) {
        throw new Error("Order delivery address snapshot is missing.");
      }

      const activeExisting = order.shipments.find((s) => isActiveShipmentStatus(s.status));
      if (activeExisting) {
        throw new Error("An active shipment already exists for this order.");
      }

      const created = await tx.shipment.create({
        data: {
          orderId: order.id,
          provider: "SHIPROCKET",
          isManual: false,
          status: "PENDING",
          weightKg: d.weightKg,
          lengthCm: d.lengthCm,
          breadthCm: d.breadthCm,
          heightCm: d.heightCm,
          idempotencyKey: d.idempotencyKey,
        },
      });

      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: created.id,
          fromStatus: null,
          toStatus: "PENDING",
          note: "Shipment creation initiated",
          actorAdminId: actor.adminId,
        },
      });

      return {
        shipment: { id: created.id, orderNumber: order.orderNumber },
        orderData: {
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          paymentProvider: order.paymentProvider,
          grandTotalPaise: order.grandTotalPaise,
          address: order.addressSnapshot,
          items: order.items.map((i) => ({
            name: i.productNameSnapshot,
            sku: i.skuSnapshot,
            quantity: i.quantity,
            unitPricePaise: i.unitPricePaise,
            unitDiscountPaise: i.unitDiscountPaise,
          })),
        },
      };
    });

    draftShipment = locked.shipment;
    orderPayloadData = locked.orderData;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to initiate shipment." };
  }

  // 3. Call Shiprocket API outside DB lock
  const env = getServerEnv();
  const [firstName, ...restName] = orderPayloadData.address.fullName.trim().split(/\s+/);
  const lastName = restName.join(" ") || firstName || "Customer";

  try {
    const token = await getShiprocketAuthToken(client, prisma);
    const created = await client.createAdhocOrder(token, {
      order_id: orderPayloadData.orderNumber,
      order_date: orderPayloadData.createdAt.toISOString().slice(0, 16).replace("T", " "),
      pickup_location: env.SHIPROCKET_PICKUP_LOCATION ?? "Primary",
      billing_customer_name: firstName || "Customer",
      billing_last_name: lastName,
      billing_address: [
        orderPayloadData.address.addressLine1,
        orderPayloadData.address.addressLine2,
      ]
        .filter(Boolean)
        .join(", "),
      billing_city: orderPayloadData.address.city,
      billing_pincode: orderPayloadData.address.pinCode,
      billing_state: orderPayloadData.address.state,
      billing_country: orderPayloadData.address.country,
      billing_email: orderPayloadData.address.email,
      billing_phone: orderPayloadData.address.phone,
      shipping_is_billing: true,
      order_items: orderPayloadData.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.quantity,
        selling_price: Math.round(item.unitPricePaise / 100),
        discount: Math.round(item.unitDiscountPaise / 100),
        tax: 0,
      })),
      payment_method: orderPayloadData.paymentProvider === "COD" ? "COD" : "Prepaid",
      sub_total: Math.round(orderPayloadData.grandTotalPaise / 100),
      length: d.lengthCm,
      breadth: d.breadthCm,
      height: d.heightCm,
      weight: d.weightKg,
    });

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: draftShipment.id },
        data: {
          status: "SHIPMENT_CREATED",
          shiprocketOrderId: String(created.order_id),
          shiprocketShipmentId: String(created.shipment_id),
          lastSyncedAt: new Date(),
          lastProviderStatus: created.status ?? "NEW",
        },
      });
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: draftShipment.id,
          fromStatus: "PENDING",
          toStatus: "SHIPMENT_CREATED",
          providerStatus: created.status ?? "NEW",
          note: `Shiprocket order ${created.order_id} / shipment ${created.shipment_id} created`,
          actorAdminId: actor.adminId,
        },
      });
      await enqueueOrderNotificationInTx(tx, {
        orderId: d.orderId,
        eventType: "SHIPMENT_CREATED",
        dedupeKey: `SHIPMENT_CREATED:${draftShipment.id}`,
      });
    });

    await recordAdminAuditLog(
      {
        actorAdminId: actor.adminId,
        action: "SHIPMENT_CREATED",
        targetType: "Shipment",
        targetId: draftShipment.id,
        success: true,
        metadata: {
          orderId: d.orderId,
          shiprocketOrderId: String(created.order_id),
          shiprocketShipmentId: String(created.shipment_id),
        },
      },
      prisma,
    );

    return { ok: true, idempotentReplay: false, shipmentId: draftShipment.id };
  } catch (error) {
    const isRetryable = error instanceof ShiprocketApiError ? error.retryable : true;
    const message = error instanceof Error ? error.message : "Shiprocket shipment creation failed.";

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: draftShipment.id },
        data: {
          status: isRetryable ? "RECONCILIATION_REQUIRED" : "FAILED",
          reconciliationRequired: isRetryable,
          lastError: message,
        },
      });
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: draftShipment.id,
          fromStatus: "PENDING",
          toStatus: isRetryable ? "RECONCILIATION_REQUIRED" : "FAILED",
          note: message,
          actorAdminId: actor.adminId,
        },
      });
      if (isRetryable) {
        await tx.shippingJob.create({
          data: {
            jobType: "RECONCILE_SHIPMENT",
            shipmentId: draftShipment.id,
            status: "PENDING",
            nextRunAt: new Date(Date.now() + 30_000),
            idempotencyKey: `reconcile-${draftShipment.id}`,
          },
        });
      }
    });

    return {
      ok: false,
      error: message,
      reconciliationRequired: isRetryable,
    };
  }
}

export async function createManualShipmentRecord(
  actor: AuthenticatedAdmin,
  rawInput: {
    orderId: string;
    carrierName: string;
    trackingNumber: string;
    trackingUrl?: string;
    idempotencyKey: string;
  },
  prismaClient?: PrismaClient,
): Promise<{ ok: true; shipmentId: string } | { ok: false; error: string }> {
  const parsed = manualShipmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid manual shipment." };
  }
  const d = parsed.data;
  const prisma = prismaClient ?? getPrisma();

  const existingByKey = await prisma.shipment.findUnique({
    where: { idempotencyKey: d.idempotencyKey },
  });
  if (existingByKey) return { ok: true, shipmentId: existingByKey.id };

  try {
    const shipment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${d.orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: d.orderId },
        include: { shipments: true },
      });
      if (!order) throw new Error("Order not found.");
      if (order.status === "CANCELLED") {
        throw new Error("Cannot create shipment for a cancelled order.");
      }

      const activeExisting = order.shipments.find((s) => isActiveShipmentStatus(s.status));
      if (activeExisting) {
        throw new Error("An active shipment already exists for this order.");
      }

      const created = await tx.shipment.create({
        data: {
          orderId: order.id,
          provider: "MANUAL",
          isManual: true,
          status: "IN_TRANSIT",
          courierName: d.carrierName,
          awbCode: d.trackingNumber,
          trackingUrl: d.trackingUrl || null,
          idempotencyKey: d.idempotencyKey,
        },
      });

      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: created.id,
          fromStatus: null,
          toStatus: "IN_TRANSIT",
          note: `Manual shipment recorded (${d.carrierName} / ${d.trackingNumber})`,
          actorAdminId: actor.adminId,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          carrierName: d.carrierName,
          trackingNumber: d.trackingNumber,
          trackingUrl: d.trackingUrl || null,
        },
      });

      await enqueueOrderNotificationInTx(tx, {
        orderId: order.id,
        eventType: "SHIPMENT_DISPATCHED",
        dedupeKey: `SHIPMENT_DISPATCHED:${order.id}`,
        courierName: d.carrierName,
        awbCode: d.trackingNumber,
        trackingUrl: d.trackingUrl || null,
      });

      return created;
    });

    await recordAdminAuditLog(
      {
        actorAdminId: actor.adminId,
        action: "SHIPMENT_MANUAL_RECORDED",
        targetType: "Shipment",
        targetId: shipment.id,
        success: true,
        metadata: { orderId: d.orderId, carrierName: d.carrierName },
      },
      prisma,
    );

    return { ok: true, shipmentId: shipment.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to save manual shipment." };
  }
}
