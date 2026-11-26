import "server-only";
import { getAuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { getAuthenticatedCustomer } from "@/modules/auth/session-service";
import type { PushOwner } from "./push-subscription-service";

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser or same-origin fetch without Origin header
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Resolves the authenticated push subscription owner from server session.
 * Never trusts customerId or adminUserId from the client request.
 */
export async function resolveAuthenticatedPushOwner(
  portalHint?: "customer" | "admin",
): Promise<PushOwner | null> {
  if (portalHint === "admin") {
    const admin = await getAuthenticatedAdmin();
    return admin ? { type: "admin", adminUserId: admin.adminId } : null;
  }
  if (portalHint === "customer") {
    const customer = await getAuthenticatedCustomer();
    return customer ? { type: "customer", customerId: customer.id } : null;
  }

  const admin = await getAuthenticatedAdmin();
  if (admin) return { type: "admin", adminUserId: admin.adminId };

  const customer = await getAuthenticatedCustomer();
  if (customer) return { type: "customer", customerId: customer.id };

  return null;
}
