import { z } from "zod";

export const safeTrackingUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (val) => {
      if (!val) return true;
      try {
        const u = new URL(val);
        return u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Tracking URL must be a valid https:// URL." },
  );

export const transitionOrderSchema = z.object({
  orderId: z.string().trim().min(1),
  targetStatus: z.enum(["CONFIRMED", "PROCESSING", "DELIVERED"]),
  note: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>;

export const packOrderSchema = z.object({
  orderId: z.string().trim().min(1),
  note: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type PackOrderInput = z.infer<typeof packOrderSchema>;

export const dispatchOrderSchema = z.object({
  orderId: z.string().trim().min(1),
  carrierName: z.string().trim().min(2, "Carrier name is required.").max(100),
  trackingNumber: z.string().trim().min(2, "Tracking number is required.").max(100),
  trackingUrl: safeTrackingUrlSchema.optional(),
  shipmentReference: z.string().trim().max(100).optional(),
  shippingNotes: z.string().trim().max(400).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type DispatchOrderInput = z.infer<typeof dispatchOrderSchema>;

export const confirmCodCollectionSchema = z.object({
  orderId: z.string().trim().min(1),
  note: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type ConfirmCodCollectionInput = z.infer<typeof confirmCodCollectionSchema>;

export const cancelOrderSchema = z.object({
  orderId: z.string().trim().min(1),
  reason: z.string().trim().min(2, "Cancellation reason is required.").max(160),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
