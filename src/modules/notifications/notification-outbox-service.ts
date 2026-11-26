import type { NotificationEventType, Prisma } from "@prisma/client";
import {
  NOTIFICATION_EVENT_CATALOGUE,
  notificationPayloadSchema,
  renderNotificationEmail,
  type NotificationPayload,
} from "./notification-templates";

export async function enqueueNotificationInTx(
  tx: Prisma.TransactionClient,
  params: {
    customerId: string | null;
    orderId: string | null;
    eventType: NotificationEventType;
    recipient: string;
    dedupeKey: string;
    payload: NotificationPayload;
  },
): Promise<{ created: boolean; notificationId?: string }> {
  const parsedPayload = notificationPayloadSchema.parse(params.payload);
  const meta = NOTIFICATION_EVENT_CATALOGUE[params.eventType];

  if (!meta.isMandatory && params.customerId) {
    const pref = await tx.notificationPreference.findUnique({
      where: { customerId: params.customerId },
      select: { shippingUpdatesEnabled: true },
    });
    if (pref && !pref.shippingUpdatesEnabled) {
      return { created: false };
    }
  }

  const existing = await tx.notification.findUnique({
    where: { dedupeKey: params.dedupeKey },
    select: { id: true },
  });
  if (existing) {
    return { created: false, notificationId: existing.id };
  }

  const rendered = renderNotificationEmail(params.eventType, parsedPayload);

  const notification = await tx.notification.create({
    data: {
      customerId: params.customerId,
      orderId: params.orderId,
      eventType: params.eventType,
      channel: "EMAIL",
      recipient: params.recipient,
      subject: rendered.subject,
      payload: parsedPayload as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      provider: "RESEND",
      dedupeKey: params.dedupeKey,
    },
  });

  await tx.notificationJob.create({
    data: {
      notificationId: notification.id,
      status: "PENDING",
    },
  });

  return { created: true, notificationId: notification.id };
}

export async function enqueueOrderNotificationInTx(
  tx: Prisma.TransactionClient,
  params: {
    orderId: string;
    eventType: NotificationEventType;
    dedupeKey: string;
    courierName?: string | null;
    awbCode?: string | null;
    trackingUrl?: string | null;
  },
): Promise<{ created: boolean; notificationId?: string }> {
  const order = await tx.order.findUnique({
    where: { id: params.orderId },
    include: {
      items: true,
      addressSnapshot: true,
      shipments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) return { created: false };

  const latestShipment = order.shipments[0];
  const addr = order.addressSnapshot;
  const addressSummary = addr
    ? `${addr.addressLine1}, ${addr.city}, ${addr.state} ${addr.pinCode}`
    : undefined;

  return enqueueNotificationInTx(tx, {
    customerId: order.customerId,
    orderId: order.id,
    eventType: params.eventType,
    recipient: order.guestEmail,
    dedupeKey: params.dedupeKey,
    payload: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.guestName,
      orderDateIso: order.createdAt.toISOString(),
      paymentMethod: order.paymentProvider,
      paymentStatus: order.paymentStatus,
      grandTotalPaise: order.grandTotalPaise,
      includedGstPaise: order.includedGstPaise,
      items: order.items.map((i) => ({
        name: i.productNameSnapshot,
        quantity: i.quantity,
        lineTotalPaise: i.lineTotalPaise,
      })),
      addressSummary,
      courierName: params.courierName ?? latestShipment?.courierName ?? order.carrierName,
      awbCode: params.awbCode ?? latestShipment?.awbCode ?? order.trackingNumber,
      trackingUrl: params.trackingUrl ?? latestShipment?.trackingUrl ?? order.trackingUrl,
      cancellationReason: order.cancellationReason,
      manualRefundRequired: order.manualRefundRequired,
    },
  });
}
