import { timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/config/env";

/**
 * Verifies Authorization: Bearer <CRON_SECRET> using constant-time comparison.
 * Never falls back to SHIPROCKET_CRON_SECRET or any other provider secret.
 */
export function isAuthorizedCronRequest(
  authHeader: string | null,
  overrideSecret?: string,
): boolean {
  const secret = overrideSecret ?? getServerEnv().CRON_SECRET;
  if (!secret || !authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const provided = Buffer.from(authHeader.slice("Bearer ".length).trim(), "utf8");
  const expected = Buffer.from(secret, "utf8");
  if (provided.length === 0 || provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}
