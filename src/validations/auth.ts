import { z } from "zod";

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeIndianMobileOptional(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[\s\-()]/g, "").replace(/^\+91/, "").replace(/^91(?=\d{10}$)/, "");
}

export const emailSchema = z
  .string()
  .trim()
  .min(3, "Enter a valid email address.")
  .max(120)
  .transform(normalizeEmail)
  .pipe(z.string().email("Enter a valid email address."));

export const passwordPolicySchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password cannot exceed 128 characters.");

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(100),
    email: emailSchema,
    password: passwordPolicySchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { error: "You must accept the Privacy Policy and Terms." }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(128),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(32, "Invalid reset token.").max(128),
    password: passwordPolicySchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(128),
    newPassword: passwordPolicySchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(100),
  phone: z
    .string()
    .trim()
    .transform(normalizeIndianMobileOptional)
    .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit Indian mobile number."),
});

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional().default(""),
  addressLine1: z.string().trim().min(5, "Enter your street address.").max(200),
  addressLine2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().min(2, "Enter your city.").max(80),
  state: z.string().trim().min(2, "Enter your state.").max(80),
  pinCode: z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code."),
  isDefault: z.boolean().optional().default(false),
});
