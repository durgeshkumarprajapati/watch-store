import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isSameOriginRequest,
  resolveAuthenticatedPushOwner,
} from "@/modules/notifications/push-route-auth";
import { upsertPushSubscription } from "@/modules/notifications/push-subscription-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const portalHint =
    body.portal === "admin" || body.portal === "customer" ? body.portal : undefined;
  const owner = await resolveAuthenticatedPushOwner(portalHint);
  if (!owner) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const rateKey =
    owner.type === "admin"
      ? `push-sub:admin:${owner.adminUserId}`
      : `push-sub:cust:${owner.customerId}`;
  const limit = checkRateLimit(rateKey, 20, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const res = await upsertPushSubscription(owner, {
    ...body,
    userAgent:
      typeof body.userAgent === "string"
        ? body.userAgent
        : request.headers.get("user-agent")?.slice(0, 300) ?? undefined,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  return NextResponse.json({ ok: true, device: res.device }, { status: 201 });
}
