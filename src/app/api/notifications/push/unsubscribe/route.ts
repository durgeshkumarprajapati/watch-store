import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isSameOriginRequest,
  resolveAuthenticatedPushOwner,
} from "@/modules/notifications/push-route-auth";
import { deactivatePushSubscription } from "@/modules/notifications/push-subscription-service";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  let body: { subscriptionId?: string; endpoint?: string; portal?: "customer" | "admin" } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Allow query params fallback
  }

  const url = new URL(request.url);
  const portalHint =
    body.portal === "admin" || body.portal === "customer"
      ? body.portal
      : url.searchParams.get("portal") === "admin"
        ? "admin"
        : url.searchParams.get("portal") === "customer"
          ? "customer"
          : undefined;

  const owner = await resolveAuthenticatedPushOwner(portalHint);
  if (!owner) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const rateKey =
    owner.type === "admin"
      ? `push-unsub:admin:${owner.adminUserId}`
      : `push-unsub:cust:${owner.customerId}`;
  const limit = checkRateLimit(rateKey, 30, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const subscriptionId = body.subscriptionId ?? url.searchParams.get("subscriptionId") ?? undefined;
  const endpoint = body.endpoint ?? undefined;

  const res = await deactivatePushSubscription(owner, { subscriptionId, endpoint });
  return NextResponse.json(res, { status: 200 });
}
