import "server-only";
import { z } from "zod";

const postgresUrlSchema = z
  .string()
  .trim()
  .refine(
    (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
    "Database URL must start with postgresql:// or postgres://",
  );

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: postgresUrlSchema.optional(),
  DIRECT_URL: postgresUrlSchema.optional(),
  CATALOGUE_SOURCE: z.string().optional(),
  SHOW_PLACEHOLDER_CLAIMS: z.string().optional(),
  ALLOW_UNPROTECTED_ADMIN_PREVIEW: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().trim().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().trim().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
  AUTH_SECRET: z.string().trim().min(16).optional(),
  AUTH_URL: z.string().trim().url().optional(),
  GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(1).optional(),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  EMAIL_FROM: z.string().trim().min(3).optional(),
  SHIPROCKET_API_EMAIL: z.string().trim().email().optional(),
  SHIPROCKET_API_PASSWORD: z.string().trim().min(1).optional(),
  SHIPROCKET_PICKUP_LOCATION: z.string().trim().min(1).optional(),
  SHIPROCKET_PICKUP_PINCODE: z.string().trim().regex(/^\d{6}$/).optional(),
  SHIPROCKET_WEBHOOK_TOKEN: z.string().trim().min(8).optional(),
  SHIPROCKET_CRON_SECRET: z.string().trim().min(8).optional(),
  CRON_SECRET: z.string().trim().min(16).optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().trim().email().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().trim().min(20).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().trim().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().trim().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().trim().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL || undefined,
    DIRECT_URL: process.env.DIRECT_URL || undefined,
    CATALOGUE_SOURCE: process.env.CATALOGUE_SOURCE || undefined,
    SHOW_PLACEHOLDER_CLAIMS: process.env.SHOW_PLACEHOLDER_CLAIMS || undefined,
    ALLOW_UNPROTECTED_ADMIN_PREVIEW: process.env.ALLOW_UNPROTECTED_ADMIN_PREVIEW || undefined,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || undefined,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || undefined,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || undefined,
    AUTH_SECRET: process.env.AUTH_SECRET || undefined,
    AUTH_URL: process.env.AUTH_URL || undefined,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || undefined,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    SHIPROCKET_API_EMAIL: process.env.SHIPROCKET_API_EMAIL || undefined,
    SHIPROCKET_API_PASSWORD: process.env.SHIPROCKET_API_PASSWORD || undefined,
    SHIPROCKET_PICKUP_LOCATION: process.env.SHIPROCKET_PICKUP_LOCATION || undefined,
    SHIPROCKET_PICKUP_PINCODE: process.env.SHIPROCKET_PICKUP_PINCODE || undefined,
    SHIPROCKET_WEBHOOK_TOKEN: process.env.SHIPROCKET_WEBHOOK_TOKEN || undefined,
    SHIPROCKET_CRON_SECRET: process.env.SHIPROCKET_CRON_SECRET || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || undefined,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || undefined,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || undefined,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || undefined,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || undefined,
  });

  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment configuration for: ${fields}`);
  }

  return parsed.data;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

export function requireDatabaseUrl(): string {
  const env = getServerEnv();
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. Set DATABASE_URL in your environment to connect to PostgreSQL.",
    );
  }
  return env.DATABASE_URL;
}

export function requireRazorpayConfig(): { keyId: string; keySecret: string } {
  const env = getServerEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.",
    );
  }
  return { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET };
}

export function requireRazorpayWebhookSecret(): string {
  const env = getServerEnv();
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error(
      "Razorpay webhook secret is not configured. Set RAZORPAY_WEBHOOK_SECRET on the server.",
    );
  }
  return env.RAZORPAY_WEBHOOK_SECRET;
}

export class ProductionEnvError extends Error {
  readonly missingOrInvalid: string[];
  constructor(missingOrInvalid: string[]) {
    super(`Invalid production environment configuration for: ${missingOrInvalid.join(", ")}`);
    this.name = "ProductionEnvError";
    this.missingOrInvalid = missingOrInvalid;
  }
}

/**
 * Validates mandatory production runtime configuration without requiring secrets
 * during `next build` (`NEXT_PHASE === "phase-production-build"`).
 * Never logs secret values.
 */
export function validateProductionEnv(opts?: {
  force?: boolean;
  envSource?: NodeJS.ProcessEnv;
}): { ok: true; skippedBuildTime?: boolean } {
  const src = opts?.envSource ?? process.env;
  if (src.NEXT_PHASE === "phase-production-build" && !opts?.force) {
    return { ok: true, skippedBuildTime: true };
  }
  if (src.NODE_ENV !== "production" && !opts?.force) {
    return { ok: true };
  }

  const parsed = serverEnvSchema.safeParse({
    ...src,
    NODE_ENV: src.NODE_ENV ?? "production",
  });
  const errors: string[] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(issue.path.join("."));
    }
  }

  const data = parsed.success ? parsed.data : undefined;
  if (!src.DATABASE_URL?.trim()) errors.push("DATABASE_URL");
  if (!src.AUTH_SECRET?.trim() || src.AUTH_SECRET.trim().length < 16) errors.push("AUTH_SECRET");
  if (!src.CRON_SECRET?.trim() || src.CRON_SECRET.trim().length < 16) errors.push("CRON_SECRET");
  if (!src.AUTH_URL?.trim() || !src.AUTH_URL.trim().startsWith("https://")) {
    errors.push("AUTH_URL");
  }

  // Paired optional provider checks (if partially configured, fail fast)
  if (Boolean(src.GOOGLE_CLIENT_ID?.trim()) !== Boolean(src.GOOGLE_CLIENT_SECRET?.trim())) {
    errors.push("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET");
  }
  if (Boolean(src.RAZORPAY_KEY_ID?.trim()) !== Boolean(src.RAZORPAY_KEY_SECRET?.trim())) {
    errors.push("RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET");
  }
  if (
    Boolean(src.SHIPROCKET_API_EMAIL?.trim()) !== Boolean(src.SHIPROCKET_API_PASSWORD?.trim())
  ) {
    errors.push("SHIPROCKET_API_EMAIL/SHIPROCKET_API_PASSWORD");
  }
  if (
    Boolean(src.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()) !==
    Boolean(src.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim())
  ) {
    errors.push("GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  }
  const cloudParts = [
    Boolean(data?.CLOUDINARY_CLOUD_NAME || src.CLOUDINARY_CLOUD_NAME?.trim()),
    Boolean(data?.CLOUDINARY_API_KEY || src.CLOUDINARY_API_KEY?.trim()),
    Boolean(data?.CLOUDINARY_API_SECRET || src.CLOUDINARY_API_SECRET?.trim()),
  ];
  if (cloudParts.some(Boolean) && !cloudParts.every(Boolean)) {
    errors.push("CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET");
  }

  const uniqueErrors = Array.from(new Set(errors));
  if (uniqueErrors.length > 0) {
    throw new ProductionEnvError(uniqueErrors);
  }
  return { ok: true };
}
