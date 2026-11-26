import { z } from "zod";

export type InventoryStockStatus = "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK";

export function classifyStockStatus(available: number, threshold: number): InventoryStockStatus {
  if (available <= 0) return "OUT_OF_STOCK";
  if (available <= threshold) return "LOW_STOCK";
  return "IN_STOCK";
}

export const stockInwardSchema = z.object({
  productId: z.string().trim().min(1, "Select a product."),
  quantity: z.number().int("Quantity must be a whole number.").positive("Quantity must be greater than zero."),
  reason: z.string().trim().min(2, "Reason is required.").max(160),
  referenceId: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type StockInwardInput = z.infer<typeof stockInwardSchema>;

export const stockOutwardSchema = z.object({
  productId: z.string().trim().min(1, "Select a product."),
  quantity: z.number().int("Quantity must be a whole number.").positive("Quantity must be greater than zero."),
  reason: z.string().trim().min(2, "Reason is required.").max(160),
  referenceId: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type StockOutwardInput = z.infer<typeof stockOutwardSchema>;

export const stockAdjustmentSchema = z
  .object({
    productId: z.string().trim().min(1, "Select a product."),
    mode: z.enum(["SET_PHYSICAL", "DELTA_INCREASE", "DELTA_DECREASE"]),
    quantity: z.number().int("Quantity must be a whole number.").min(0, "Quantity cannot be negative."),
    reason: z.string().trim().min(2, "Reason is required.").max(160),
    referenceId: z.string().trim().max(80).optional(),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .refine((d) => d.mode === "SET_PHYSICAL" || d.quantity > 0, {
    message: "Adjustment quantity must be greater than zero.",
    path: ["quantity"],
  });

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const lowStockThresholdSchema = z.object({
  productId: z.string().trim().min(1, "Product ID is required."),
  threshold: z
    .number()
    .int("Threshold must be a whole number.")
    .min(0, "Threshold cannot be negative.")
    .max(10000, "Threshold cannot exceed 10,000."),
});

export type LowStockThresholdInput = z.infer<typeof lowStockThresholdSchema>;
