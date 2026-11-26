import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const webpush = require("web-push") as typeof import("web-push");

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/modules/auth/auth", () => ({
  auth: vi.fn(async () => null),
}));

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/modules/auth/password-service";
import {
  getInboxUnreadCount,
  listInboxNotifications,
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
} from "@/modules/notifications/inbox-service";
import { enqueueAdminBroadcastInTx } from "@/modules/notifications/notification-outbox-service";
import { processNextNotificationJob } from "@/modules/notifications/notification-worker-service";
import {
  deactivatePushSubscription,
  getPushSubscriptionStatus,
  upsertPushSubscription,
} from "@/modules/notifications/push-subscription-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 19 Web Push & In-App Inbox PostgreSQL integration", () => {
  let prisma: PrismaClient;
  const createdCustomerIds: string[] = [];
  const createdAdminIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdDedupePrefixes = [`phase19-test-${Date.now()}`];

  const origPub = process.env.VAPID_PUBLIC_KEY;
  const origPriv = process.env.VAPID_PRIVATE_KEY;
  const origSubj = process.env.VAPID_SUBJECT;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:support@watchstore.com";
  });

  afterAll(async () => {
    process.env.VAPID_PUBLIC_KEY = origPub;
    process.env.VAPID_PRIVATE_KEY = origPriv;
    process.env.VAPID_SUBJECT = origSubj;

    if (createdCustomerIds.length > 0 || createdAdminIds.length > 0) {
      await prisma.notificationJob.deleteMany({
        where: {
          notification: {
            OR: [
              { customerId: { in: createdCustomerIds } },
              { adminUserId: { in: createdAdminIds } },
              { dedupeKey: { startsWith: createdDedupePrefixes[0] } },
            ],
          },
        },
      });
      await prisma.notification.deleteMany({
        where: {
          OR: [
            { customerId: { in: createdCustomerIds } },
            { adminUserId: { in: createdAdminIds } },
            { dedupeKey: { startsWith: createdDedupePrefixes[0] } },
          ],
        },
      });
      await prisma.pushSubscription.deleteMany({
        where: {
          OR: [
            { customerId: { in: createdCustomerIds } },
            { adminUserId: { in: createdAdminIds } },
          ],
        },
      });
      await prisma.customer.deleteMany({
        where: { id: { in: createdCustomerIds } },
      });
      await prisma.adminUser.deleteMany({
        where: { id: { in: createdAdminIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("isolates PushSubscription ownership between customers", async () => {
    const suffix = Date.now();
    const custA = await prisma.customer.create({
      data: {
        email: `push-a-${suffix}@watchstore.test`,
        fullName: "Push Customer A",
        phone: "9876543210",
      },
    });
    const custB = await prisma.customer.create({
      data: {
        email: `push-b-${suffix}@watchstore.test`,
        fullName: "Push Customer B",
        phone: "9876543211",
      },
    });
    createdCustomerIds.push(custA.id, custB.id);

    const endpointA = `https://fcm.googleapis.com/fcm/send/cust-a-${suffix}`;
    const upRes = await upsertPushSubscription(
      { type: "customer", customerId: custA.id },
      {
        endpoint: endpointA,
        keys: { p256dh: "p256dh_valid_key_length_12345", auth: "auth_valid_1234" },
        userAgent: "Vitest",
      },
      prisma,
    );
    expect(upRes.ok).toBe(true);

    const statusA = await getPushSubscriptionStatus({ type: "customer", customerId: custA.id }, prisma);
    const statusB = await getPushSubscriptionStatus({ type: "customer", customerId: custB.id }, prisma);
    expect(statusA.activeCount).toBe(1);
    expect(statusB.activeCount).toBe(0);

    // Customer B cannot deactivate Customer A's endpoint
    const deactivatedByB = await deactivatePushSubscription(
      { type: "customer", customerId: custB.id },
      { endpoint: endpointA },
      prisma,
    );
    expect(deactivatedByB.deactivatedCount).toBe(0);

    const deactivatedByA = await deactivatePushSubscription(
      { type: "customer", customerId: custA.id },
      { endpoint: endpointA },
      prisma,
    );
    expect(deactivatedByA.deactivatedCount).toBe(1);
  });

  it("broadcasts admin alerts to ALL active verified admins regardless of role and processes IN_APP + PUSH independently", async () => {
    const suffix = Date.now();
    const passwordHash = await hashPassword("Admin@123456");

    const createAdminWithUser = async (tag: string, isActive: boolean, emailVerified: Date | null) => {
      const user = await prisma.user.create({
        data: {
          email: `admin-push-${tag}-${suffix}@watchstore.test`,
          name: `Admin ${tag}`,
          passwordHash,
          emailVerified,
        },
      });
      createdUserIds.push(user.id);
      const admin = await prisma.adminUser.create({
        data: {
          userId: user.id,
          isActive,
        },
      });
      createdAdminIds.push(admin.id);
      return admin;
    };

    const activeAdmin1 = await createAdminWithUser("active1", true, new Date());
    const activeAdmin2 = await createAdminWithUser("active2", true, new Date());
    const inactiveAdmin = await createAdminWithUser("inactive", false, new Date());
    const unverifiedAdmin = await createAdminWithUser("unverified", true, null);

    const ep1 = `https://fcm.googleapis.com/fcm/send/admin1-${suffix}`;
    const ep2 = `https://updates.push.services.mozilla.com/wpush/v2/admin2-${suffix}`;
    const up1 = await upsertPushSubscription(
      { type: "admin", adminUserId: activeAdmin1.id },
      {
        endpoint: ep1,
        keys: { p256dh: "p256dh_admin1_valid_key_12345", auth: "auth_admin1_1234" },
        userAgent: "Chrome",
      },
      prisma,
    );
    const up2 = await upsertPushSubscription(
      { type: "admin", adminUserId: activeAdmin2.id },
      {
        endpoint: ep2,
        keys: { p256dh: "p256dh_admin2_valid_key_12345", auth: "auth_admin2_1234" },
        userAgent: "Firefox",
      },
      prisma,
    );
    expect(up1.ok).toBe(true);
    expect(up2.ok).toBe(true);

    const dedupeKey = `${createdDedupePrefixes[0]}-new-order`;
    await prisma.$transaction(async (tx) => {
      await enqueueAdminBroadcastInTx(tx, {
        eventType: "NEW_ORDER_ADMIN",
        dedupeKey,
        title: "New Order WS-TEST-1",
        body: "₹88,500 (RAZORPAY)",
        targetUrl: "/admin/orders/ord_test",
      });
    });

    const createdNotifications = await prisma.notification.findMany({
      where: { dedupeKey: { contains: dedupeKey } },
    });

    // Only active+verified admins receive IN_APP and PUSH
    const targetAdminIds = new Set(createdNotifications.map((n) => n.adminUserId));
    expect(targetAdminIds.has(activeAdmin1.id)).toBe(true);
    expect(targetAdminIds.has(activeAdmin2.id)).toBe(true);
    expect(targetAdminIds.has(inactiveAdmin.id)).toBe(false);
    expect(targetAdminIds.has(unverifiedAdmin.id)).toBe(false);

    // Check Inbox unread & mark read isolation
    const inbox1Before = await listInboxNotifications(
      { type: "admin", adminUserId: activeAdmin1.id },
      { page: 1, pageSize: 10 },
      prisma,
    );
    expect(inbox1Before.unreadCount).toBeGreaterThanOrEqual(1);

    const firstId = inbox1Before.items[0]!.id;
    expect(
      await markInboxNotificationRead({ type: "admin", adminUserId: activeAdmin2.id }, firstId, prisma),
    ).toEqual({ ok: false });
    expect(
      await markInboxNotificationRead({ type: "admin", adminUserId: activeAdmin1.id }, firstId, prisma),
    ).toEqual({ ok: true });
    expect(
      await getInboxUnreadCount({ type: "admin", adminUserId: activeAdmin1.id }, prisma),
    ).toBe(0);

    await markAllInboxNotificationsRead({ type: "admin", adminUserId: activeAdmin2.id }, prisma);
    expect(
      await getInboxUnreadCount({ type: "admin", adminUserId: activeAdmin2.id }, prisma),
    ).toBe(0);

    // Prioritize our test jobs so leftover DB jobs don't delay them
    await prisma.notificationJob.updateMany({
      where: { notification: { dedupeKey: { contains: dedupeKey } } },
      data: { nextRunAt: new Date(Date.now() - 86_400_000) },
    });

    // Process PUSH notifications: ep1 succeeds (201), ep2 returns 410 -> deactivates sub
    let safety = 0;
    while (safety < 50) {
      safety += 1;
      const res = await processNextNotificationJob(
        "phase19-test-worker",
        {
          emailSender: async () => ({ ok: true, id: "mock-email-id" }),
          pushSender: async ({ endpoint }) => {
            if (endpoint === ep2) {
              return {
                ok: false,
                skipped: false,
                expired: true,
                retryable: false,
                statusCode: 410,
                error: "Gone",
              };
            }
            return { ok: true, statusCode: 201 };
          },
        },
        prisma,
      );
      if (!res.claimed) break;
    }

    const sub1 = await prisma.pushSubscription.findUnique({ where: { endpoint: ep1 } });
    const sub2 = await prisma.pushSubscription.findUnique({ where: { endpoint: ep2 } });
    expect(sub1?.lastUsedAt).not.toBeNull();
    expect(sub1?.isActive).toBe(true);
    expect(sub2?.isActive).toBe(false);
  }, 15_000);
});
