import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { sendWebPushNotification } from "@/modules/notifications/push-sender";

export const dynamic = "force-dynamic";

/**
 * Sends a test browser push notification ONLY to the currently authenticated
 * Admin user's own active device subscriptions (never broadcasts to other admins).
 */
export async function POST() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Administrator authentication required." }, { status: 401 });
  }

  const limit = checkRateLimit(`admin-test-push:${admin.adminId}`, 5, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many test pushes. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const prisma = getPrisma();
  const subs = await prisma.pushSubscription.findMany({
    where: {
      adminUserId: admin.adminId,
      isActive: true,
    },
  });

  if (subs.length === 0) {
    return NextResponse.json(
      { error: "No active browser push subscriptions found for your admin account." },
      { status: 404 },
    );
  }

  let delivered = 0;
  let deactivated = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const res = await sendWebPushNotification({
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        payload: {
          title: "WatchStore Admin Test Push",
          body: "Browser push notifications are active for your admin device.",
          url: "/admin/notifications",
          tag: "watchstore-admin-test",
        },
      });
      if (res.ok) {
        delivered += 1;
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } else if (res.expired) {
        deactivated += 1;
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { isActive: false },
        });
      } else {
        failed += 1;
      }
    }),
  );

  for (const r of results) {
    if (r.status === "rejected") failed += 1;
  }

  return NextResponse.json({
    ok: delivered > 0,
    attempted: subs.length,
    delivered,
    deactivated,
    failed,
  });
}
