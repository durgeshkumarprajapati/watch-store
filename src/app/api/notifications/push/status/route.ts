import { NextResponse } from "next/server";
import { resolveAuthenticatedPushOwner } from "@/modules/notifications/push-route-auth";
import { getPushSubscriptionStatus } from "@/modules/notifications/push-subscription-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const portalParam = url.searchParams.get("portal");
  const portalHint =
    portalParam === "admin" || portalParam === "customer" ? portalParam : undefined;

  const owner = await resolveAuthenticatedPushOwner(portalHint);
  if (!owner) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const status = await getPushSubscriptionStatus(owner);
  return NextResponse.json(status, {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
