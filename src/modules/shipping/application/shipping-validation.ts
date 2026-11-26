import { z } from "zod";
import { safeTrackingUrlSchema } from "@/modules/admin/orders/order-validation";

export const checkServiceabilitySchema = z.object({
  orderId: z.string().trim().min(1),
  weightKg: z.number().positive().max(50).default(0.5),
});

export const createShipmentSchema = z.object({
  orderId: z.string().trim().min(1),
  weightKg: z.number().positive().max(50).default(0.5),
  lengthCm: z.number().positive().max(200).default(16),
  breadthCm: z.number().positive().max(200).default(14),
  heightCm: z.number().positive().max(200).default(10),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const assignAwbSchema = z.object({
  shipmentId: z.string().trim().min(1),
  courierId: z.number().int().positive().optional(),
});

export const schedulePickupSchema = z.object({
  shipmentId: z.string().trim().min(1),
});

export const cancelShipmentSchema = z.object({
  shipmentId: z.string().trim().min(1),
  reason: z.string().trim().min(2, "Cancellation reason is required.").max(200),
});

export const manualShipmentSchema = z.object({
  orderId: z.string().trim().min(1),
  carrierName: z.string().trim().min(2, "Carrier name is required.").max(100),
  trackingNumber: z.string().trim().min(2, "Tracking number is required.").max(100),
  trackingUrl: safeTrackingUrlSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const shiprocketWebhookPayloadSchema = z
  .object({
    awb: z.string().trim().optional(),
    courier_name: z.string().trim().optional(),
    current_status: z.string().trim().min(1),
    current_timestamp: z.string().trim().optional(),
    order_id: z.union([z.string(), z.number()]).optional(),
    sr_order_id: z.union([z.string(), z.number()]).optional(),
    shipment_status: z.string().trim().optional(),
    etd: z.string().trim().optional(),
    scans: z
      .array(
        z.object({
          date: z.string().optional(),
          status: z.string().optional(),
          activity: z.string().optional(),
          location: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

export type ShiprocketWebhookPayload = z.infer<typeof shiprocketWebhookPayloadSchema>;
