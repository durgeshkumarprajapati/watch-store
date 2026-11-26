import { NextResponse } from "next/server";
import { listInboxNotifications } from "@/modules/notifications/inbox-service";
import { resolveAuthenticatedPushOwner } from "@/modules/notifications/push-route-auth";

export async function GET() {
  const owner = await resolveAuthenticatedPushOwner();
  if (!owner) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const result = await listInboxNotifications(owner, { page: 1, pageSize: 15 });
  return NextResponse.json(
    {
      items: result.items,
      unreadCount: result.unreadCount,
      total: result.total,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
