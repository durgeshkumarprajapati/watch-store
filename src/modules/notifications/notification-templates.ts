import type { NotificationEventType } from "@prisma/client";
import { z } from "zod";
import { brand } from "@/config/brand";
import { getServerEnv } from "@/config/env";
import { formatINR } from "@/lib/format";
import { escapeHtml } from "./email-service";

export const NOTIFICATION_EVENT_CATALOGUE: Record<
  NotificationEventType,
  { label: string; isMandatory: boolean; description: string }
> = {
  ORDER_CONFIRMED: {
    label: "Order Confirmed",
    isMandatory: true,
    description: "Sent when an online order is confirmed after payment capture.",
  },
  PAYMENT_SUCCESS: {
    label: "Payment Successful",
    isMandatory: true,
    description: "Sent when Razorpay payment settlement is authoritatively captured.",
  },
  PAYMENT_FAILED: {
    label: "Payment Failed",
    isMandatory: true,
    description: "Sent when a payment attempt records a definitive failure.",
  },
  COD_ORDER_CONFIRMED: {
    label: "COD Order Confirmed",
    isMandatory: true,
    description: "Sent when a Cash on Delivery order is confirmed for fulfilment.",
  },
  SHIPMENT_CREATED: {
    label: "Shipment Created",
    isMandatory: false,
    description: "Sent when a shipment record is created for an order.",
  },
  SHIPMENT_DISPATCHED: {
    label: "Shipment Dispatched",
    isMandatory: false,
    description: "Sent when an order is dispatched with carrier tracking.",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    isMandatory: false,
    description: "Sent when carrier tracking confirms out-for-delivery.",
  },
  ORDER_DELIVERED: {
    label: "Order Delivered",
    isMandatory: false,
    description: "Sent when delivery is confirmed.",
  },
  ORDER_CANCELLED: {
    label: "Order Cancelled",
    isMandatory: true,
    description: "Sent when an order cancellation is committed.",
  },
};

export const notificationPayloadSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  customerName: z.string().min(1),
  orderDateIso: z.string().min(1),
  paymentMethod: z.enum(["COD", "RAZORPAY"]),
  paymentStatus: z.string().min(1),
  grandTotalPaise: z.number().int().nonnegative(),
  includedGstPaise: z.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().int().positive(),
        lineTotalPaise: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  addressSummary: z.string().optional(),
  courierName: z.string().nullable().optional(),
  awbCode: z.string().nullable().optional(),
  trackingUrl: z.string().nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
  manualRefundRequired: z.boolean().optional(),
});

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

function safeHttpsUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function getOrderSubjectAndHeading(
  eventType: NotificationEventType,
  orderNumber: string,
): { subject: string; heading: string; intro: string } {
  switch (eventType) {
    case "ORDER_CONFIRMED":
      return {
        subject: `${brand.name} — Order ${orderNumber} Confirmed`,
        heading: "Your Order Is Confirmed",
        intro: `Thank you for your order ${orderNumber}. Our watchmakers are preparing your timepiece for insured dispatch.`,
      };
    case "PAYMENT_SUCCESS":
      return {
        subject: `${brand.name} — Payment Received for ${orderNumber}`,
        heading: "Payment Confirmed",
        intro: `We have received your payment for order ${orderNumber}.`,
      };
    case "PAYMENT_FAILED":
      return {
        subject: `${brand.name} — Payment Issue for ${orderNumber}`,
        heading: "Payment Could Not Be Completed",
        intro: `Your recent payment attempt for order ${orderNumber} was unsuccessful. You can retry payment securely from your order page.`,
      };
    case "COD_ORDER_CONFIRMED":
      return {
        subject: `${brand.name} — COD Order ${orderNumber} Confirmed`,
        heading: "Cash on Delivery Order Confirmed",
        intro: `Your Cash on Delivery order ${orderNumber} is confirmed and being prepared for dispatch. Please keep the exact amount ready at delivery.`,
      };
    case "SHIPMENT_CREATED":
      return {
        subject: `${brand.name} — Shipment Prepared for ${orderNumber}`,
        heading: "Shipment Prepared",
        intro: `A shipment has been created for your order ${orderNumber}.`,
      };
    case "SHIPMENT_DISPATCHED":
      return {
        subject: `${brand.name} — Order ${orderNumber} Dispatched`,
        heading: "Your Timepiece Has Been Dispatched",
        intro: `Your order ${orderNumber} is on its way.`,
      };
    case "OUT_FOR_DELIVERY":
      return {
        subject: `${brand.name} — Order ${orderNumber} Out for Delivery`,
        heading: "Out for Delivery Today",
        intro: `Your order ${orderNumber} is out for delivery with our courier partner.`,
      };
    case "ORDER_DELIVERED":
      return {
        subject: `${brand.name} — Order ${orderNumber} Delivered`,
        heading: "Order Delivered",
        intro: `Your order ${orderNumber} has been marked delivered. Thank you for collecting with ${brand.name}.`,
      };
    case "ORDER_CANCELLED":
      return {
        subject: `${brand.name} — Order ${orderNumber} Cancelled`,
        heading: "Order Cancelled",
        intro: `Your order ${orderNumber} has been cancelled.`,
      };
  }
}

export function renderNotificationEmail(
  eventType: NotificationEventType,
  rawPayload: NotificationPayload,
): { subject: string; html: string; text: string } {
  const payload = notificationPayloadSchema.parse(rawPayload);
  const { subject, heading, intro } = getOrderSubjectAndHeading(eventType, payload.orderNumber);
  const baseUrl = getServerEnv().AUTH_URL ?? "http://localhost:3000";
  const orderLink = `${baseUrl.replace(/\/$/, "")}/account/orders/${encodeURIComponent(payload.orderId)}`;
  const trackingUrl = safeHttpsUrl(payload.trackingUrl);

  const itemsText = payload.items
    .map((i) => `- ${i.name} x${i.quantity} (${formatINR(i.lineTotalPaise)})`)
    .join("\n");

  const itemsHtml = payload.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #E5DED3;">${escapeHtml(i.name)} &times; ${i.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #E5DED3;text-align:right;font-family:monospace;">${escapeHtml(formatINR(i.lineTotalPaise))}</td></tr>`,
    )
    .join("");

  const refundLine =
    eventType === "ORDER_CANCELLED" && payload.manualRefundRequired
      ? "Refund status: Pending manual refund processing by our concierge team."
      : "";

  const trackingLines = [
    payload.courierName ? `Courier: ${payload.courierName}` : "",
    payload.awbCode ? `Tracking / AWB: ${payload.awbCode}` : "",
    trackingUrl ? `Track Shipment: ${trackingUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    `Hello ${payload.customerName},`,
    "",
    intro,
    refundLine,
    "",
    `Order Number: ${payload.orderNumber}`,
    `Total: ${formatINR(payload.grandTotalPaise)} (Incl. GST ${formatINR(payload.includedGstPaise)})`,
    `Payment: ${payload.paymentMethod} (${payload.paymentStatus})`,
    payload.addressSummary ? `Delivery Address: ${payload.addressSummary}` : "",
    trackingLines,
    itemsText ? `\nItems:\n${itemsText}` : "",
    `\nView Order: ${orderLink}`,
    `\nQuestions? Contact ${brand.contact.email}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background-color:#F5F2EC;color:#171717;font-family:Raleway,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E5DED3;border-radius:6px;overflow:hidden;">
    <tr>
      <td style="background:#171717;color:#F7F5EF;padding:20px 28px;font-size:20px;letter-spacing:2px;font-weight:600;">
        ${escapeHtml(brand.wordmark)}
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 12px;font-size:24px;color:#171717;">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333;">Hello ${escapeHtml(payload.customerName)},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333;">${escapeHtml(intro)}</p>
        ${refundLine ? `<p style="margin:0 0 16px;padding:12px;background:#F5F2EC;border-left:3px solid #A87832;font-size:14px;">${escapeHtml(refundLine)}</p>` : ""}
        ${
          payload.awbCode || payload.courierName
            ? `<div style="margin:0 0 16px;padding:12px;background:#F5F2EC;border:1px solid #E5DED3;font-size:14px;">
                <strong>Shipment Details</strong><br/>
                ${payload.courierName ? `Courier: ${escapeHtml(payload.courierName)}<br/>` : ""}
                ${payload.awbCode ? `AWB / Tracking: <span style="font-family:monospace;">${escapeHtml(payload.awbCode)}</span><br/>` : ""}
                ${trackingUrl ? `<a href="${escapeHtml(trackingUrl)}" style="color:#A87832;">Track Shipment</a>` : ""}
              </div>`
            : ""
        }
        ${
          itemsHtml
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;">${itemsHtml}</table>`
            : ""
        }
        <p style="margin:0 0 6px;font-size:14px;"><strong>Order Total:</strong> ${escapeHtml(formatINR(payload.grandTotalPaise))} (Incl. GST ${escapeHtml(formatINR(payload.includedGstPaise))})</p>
        <p style="margin:0 0 16px;font-size:14px;"><strong>Payment:</strong> ${escapeHtml(payload.paymentMethod)} (${escapeHtml(payload.paymentStatus)})</p>
        ${payload.addressSummary ? `<p style="margin:0 0 20px;font-size:13px;color:#68645D;"><strong>Delivery Address:</strong> ${escapeHtml(payload.addressSummary)}</p>` : ""}
        <a href="${escapeHtml(orderLink)}" style="display:inline-block;padding:12px 22px;background:#A87832;color:#171717;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;border-radius:3px;">View Order Details</a>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;background:#ECE7DE;color:#68645D;font-size:12px;">
        ${escapeHtml(brand.name)} &bull; ${escapeHtml(brand.contact.email)}
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return { subject, html, text };
}
