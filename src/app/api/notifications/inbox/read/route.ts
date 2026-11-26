import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getInboxUnreadCount,
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
} from "@/modules/notifications/inbox-service";
import {
  isSameOriginRequest,
  resolveAuthenticatedPushOwner,
} from "@/modules/notifications/push-route-auth";

const bodySchema = z.object({
  notificationId: z.string().trim().min(1).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const owner = await resolveAuthenticatedPushOwner();
  if (!owner) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  if (parsed.data.all) {
    await markAllInboxNotificationsRead(owner);
  } else if (parsed.data.notificationId) {
    await markInboxNotificationRead(owner, parsed.data.notificationId);
  } else {
    return NextResponse.json(
      { error: "Provide notificationId or all: true." },
      { status: 400 },
    );
  }

  const unreadCount = await getInboxUnreadCount(owner);
  return NextResponse.json({ ok: true, unreadCount }, { status: 200 });
}
