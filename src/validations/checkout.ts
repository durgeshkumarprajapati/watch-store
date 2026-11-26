import { z } from "zod";

function normalizeIndianMobile(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, "").replace(/^\+91/, "").replace(/^91(?=\d{10}$)/, "");
  return digits;
}

export const checkoutSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(64),
  fullName: z.string().trim().min(2, "Enter your full name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(120),
  phone: z
    .string()
    .trim()
    .transform(normalizeIndianMobile)
    .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit Indian mobile number."),
  addressLine1: z.string().trim().min(5, "Enter your street address.").max(200),
  addressLine2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().min(2, "Enter your city.").max(80),
  state: z.string().trim().min(2, "Enter your state.").max(80),
  pinCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter a valid 6-digit PIN code."),
  country: z.literal("India").default("India"),
  shippingMethod: z.enum(["standard"]).default("standard"),
  paymentMethod: z.enum(["razorpay", "cod"]),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type ValidatedCheckoutInput = z.output<typeof checkoutSchema>;
