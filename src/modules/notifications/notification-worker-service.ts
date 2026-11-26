import { randomUUID } from "node:crypto";
import type { NotificationJob, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditLog } from "@/modules/admin/admin-audit-service";
import type { AuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { sendTransactionalEmail, type SendEmailResult } from "./email-service";
import { enqueueAdminBroadcastInTx } from "./notification-outbox-service";
import { notificationPayloadSchema, renderNotificationEmail } from "./notification-templates";
import { sendWebPushNotification, type PushPayloadData, type SendPushResult } from "./push-sender";

export type EmailSenderFn = (params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
}) => Promise<SendEmailResult>;

export type PushSenderFn = (params: {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: PushPayloadData;
}) => Promise<SendPushResult>;

export interface NotificationWorkerDeps {
  emailSender?: EmailSenderFn;
  pushSender?: PushSenderFn;
}

export async function claimNextNotificationJob(
  workerId = `notif-${randomUUID().slice(0, 8)}`,
  prismaClient?: PrismaClient,
): Promise<NotificationJob | null> {
  const prisma = prismaClient ?? getPrisma();
  const rows = await prisma.$queryRaw<NotificationJob[]>`
    UPDATE "NotificationJob"
    SET
      "status" = 'PROCESSING',
      "lockedUntil" = NOW() + INTERVAL '2 minutes',
      "lockedBy" = ${workerId},
      "attempts" = "attempts" + 1,
      "updatedAt" = NOW()
    WHERE "id" = (
      SELECT "id"
      FROM "NotificationJob"
      WHERE "status" IN ('PENDING', 'FAILED')
        AND "nextRunAt" <= NOW()
        AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW())
      ORDER BY "nextRunAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

async function notifyAdminsOnEmailDeadLetter(
  prisma: PrismaClient,
  notification: { id: string; eventType: string; recipient: string; orderId: string | null },
) {
  if (notification.eventType === "NOTIFICATION_FAILED_ADMIN") return;
  try {
    await prisma.$transaction(async (tx) => {
      await enqueueAdminBroadcastInTx(tx, {
        eventType: "NOTIFICATION_FAILED_ADMIN",
        dedupeKey: `admin-notif-failed:${notification.id}`,
        title: "Email notification delivery failed",
        body: `Notification ${notification.eventType} to ${notification.recipient} moved to dead-letter queue.`,
        targetUrl: "/admin/notifications",
        orderId: notification.orderId ?? undefined,
      });
    });
  } catch {
    // Best-effort alert; do not fail the outer worker transaction.
  }
}

export async function processNextNotificationJob(
  workerId = `notif-${randomUUID().slice(0, 8)}`,
  emailSenderOrDeps: EmailSenderFn | NotificationWorkerDeps = sendTransactionalEmail,
  prismaClient?: PrismaClient,
): Promise<{ claimed: boolean; notificationId?: string; status?: string }> {
  const emailSender =
    typeof emailSenderOrDeps === "function"
      ? emailSenderOrDeps
      : (emailSenderOrDeps.emailSender ?? sendTransactionalEmail);
  const pushSender =
    typeof emailSenderOrDeps === "function"
      ? sendWebPushNotification
      : (emailSenderOrDeps.pushSender ?? sendWebPushNotification);

  const prisma = prismaClient ?? getPrisma();
  const job = await claimNextNotificationJob(workerId, prisma);
  if (!job) return { claimed: false };

  const notification = await prisma.notification.findUnique({
    where: { id: job.notificationId },
  });
  if (!notification) {
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: { status: "DEAD_LETTER", lastError: "Notification record missing.", lockedUntil: null },
    });
    return { claimed: true, notificationId: job.notificationId, status: "DEAD_LETTER" };
  }

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });

  if (notification.channel === "IN_APP") {
    const now = new Date();
    await prisma.$transaction([
      prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: now,
          lastError: null,
        },
      }),
      prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          status: "SENT",
          completedAt: now,
          lockedUntil: null,
          lockedBy: null,
          lastError: null,
        },
      }),
    ]);
    return { claimed: true, notificationId: notification.id, status: "SENT" };
  }

  if (notification.channel === "PUSH") {
    try {
      const sub = notification.pushSubscriptionId
        ? await prisma.pushSubscription.findUnique({
            where: { id: notification.pushSubscriptionId },
          })
        : await prisma.pushSubscription.findUnique({
            where: { endpoint: notification.recipient },
          });

      if (!sub || !sub.isActive) {
        const now = new Date();
        await prisma.$transaction([
          prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: "DEAD_LETTER",
              failedAt: now,
              lastError: "Push subscription missing or inactive.",
            },
          }),
          prisma.notificationJob.update({
            where: { id: job.id },
            data: {
              status: "DEAD_LETTER",
              lockedUntil: null,
              lockedBy: null,
              lastError: "Push subscription missing or inactive.",
            },
          }),
        ]);
        return { claimed: true, notificationId: notification.id, status: "DEAD_LETTER" };
      }

      const rawPayload =
        notification.payload && typeof notification.payload === "object"
          ? (notification.payload as Record<string, unknown>)
          : {};
      const title =
        typeof rawPayload.title === "string" && rawPayload.title.trim().length > 0
          ? rawPayload.title
          : notification.subject;
      const body =
        typeof rawPayload.body === "string" && rawPayload.body.trim().length > 0
          ? rawPayload.body
          : notification.subject;
      const url =
        notification.targetUrl ??
        (typeof rawPayload.url === "string" ? rawPayload.url : undefined);
      const tag =
        typeof rawPayload.tag === "string" ? rawPayload.tag : notification.eventType;

      const pushResult = await pushSender({
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        payload: { title, body, url, tag },
      });

      const now = new Date();
      if (pushResult.ok) {
        await prisma.$transaction([
          prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: "SENT",
              sentAt: now,
              lastError: null,
            },
          }),
          prisma.notificationJob.update({
            where: { id: job.id },
            data: {
              status: "SENT",
              completedAt: now,
              lockedUntil: null,
              lockedBy: null,
              lastError: null,
            },
          }),
          prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { lastUsedAt: now },
          }),
        ]);
        return { claimed: true, notificationId: notification.id, status: "SENT" };
      }

      if (pushResult.expired) {
        await prisma.$transaction([
          prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          }),
          prisma.notification.update({
            where: { id: notification.id },
            data: {
              status: "DEAD_LETTER",
              failedAt: now,
              lastError: pushResult.error,
            },
          }),
          prisma.notificationJob.update({
            where: { id: job.id },
            data: {
              status: "DEAD_LETTER",
              lockedUntil: null,
              lockedBy: null,
              lastError: pushResult.error,
            },
          }),
        ]);
        return { claimed: true, notificationId: notification.id, status: "DEAD_LETTER" };
      }

      const exhausted = job.attempts >= job.maxAttempts;
      const isPermanent = !pushResult.retryable && !pushResult.skipped;
      const nextStatus = isPermanent || exhausted ? "DEAD_LETTER" : "FAILED";
      const backoffSeconds = Math.min(3600, 30 * 2 ** Math.max(0, job.attempts - 1));

      await prisma.$transaction([
        prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: nextStatus,
            failedAt: now,
            lastError: pushResult.error,
          },
        }),
        prisma.notificationJob.update({
          where: { id: job.id },
          data: {
            status: nextStatus,
            lockedUntil: null,
            lockedBy: null,
            lastError: pushResult.error,
            nextRunAt: new Date(now.getTime() + backoffSeconds * 1000),
          },
        }),
      ]);

      return { claimed: true, notificationId: notification.id, status: nextStatus };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Push delivery failed.";
      const now = new Date();
      await prisma.$transaction([
        prisma.notification.update({
          where: { id: notification.id },
          data: { status: "DEAD_LETTER", failedAt: now, lastError: message },
        }),
        prisma.notificationJob.update({
          where: { id: job.id },
          data: { status: "DEAD_LETTER", lockedUntil: null, lockedBy: null, lastError: message },
        }),
      ]);
      return { claimed: true, notificationId: notification.id, status: "DEAD_LETTER" };
    }
  }

  try {
    const parsedPayload = notificationPayloadSchema.parse(notification.payload);
    const rendered = renderNotificationEmail(notification.eventType, parsedPayload);
    const result = await emailSender({
      to: notification.recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: notification.dedupeKey,
    });

    if (result.ok) {
      const now = new Date();
      await prisma.$transaction([
        prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: "SENT",
            providerMessageId: result.id,
            sentAt: now,
            lastError: null,
          },
        }),
        prisma.notificationJob.update({
          where: { id: job.id },
          data: {
            status: "SENT",
            completedAt: now,
            lockedUntil: null,
            lockedBy: null,
            lastError: null,
          },
        }),
      ]);
      return { claimed: true, notificationId: notification.id, status: "SENT" };
    }

    const exhausted = job.attempts >= job.maxAttempts;
    const isPermanent = !result.retryable && !result.skipped;
    const nextStatus = isPermanent || exhausted ? "DEAD_LETTER" : "FAILED";
    const backoffSeconds = Math.min(3600, 30 * 2 ** Math.max(0, job.attempts - 1));
    const now = new Date();

    await prisma.$transaction([
      prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: nextStatus,
          failedAt: now,
          lastError: result.error,
        },
      }),
      prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
          lockedUntil: null,
          lockedBy: null,
          lastError: result.error,
          nextRunAt: new Date(now.getTime() + backoffSeconds * 1000),
        },
      }),
    ]);

    if (nextStatus === "DEAD_LETTER") {
      await notifyAdminsOnEmailDeadLetter(prisma, notification);
    }

    return { claimed: true, notificationId: notification.id, status: nextStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Notification rendering failed.";
    const now = new Date();
    await prisma.$transaction([
      prisma.notification.update({
        where: { id: notification.id },
        data: { status: "DEAD_LETTER", failedAt: now, lastError: message },
      }),
      prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: "DEAD_LETTER", lockedUntil: null, lockedBy: null, lastError: message },
      }),
    ]);
    await notifyAdminsOnEmailDeadLetter(prisma, notification);
    return { claimed: true, notificationId: notification.id, status: "DEAD_LETTER" };
  }
}

export async function retryAdminNotification(
  actor: AuthenticatedAdmin,
  notificationId: string,
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { job: true },
  });
  if (!notification) return { ok: false, error: "Notification not found." };
  if (notification.status === "SENT") {
    return { ok: false, error: "Cannot retry a notification already confirmed as SENT." };
  }
  if (notification.status === "PROCESSING") {
    return { ok: false, error: "Notification is currently being processed." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.notification.update({
      where: { id: notification.id },
      data: { status: "PENDING", lastError: null },
    });
    if (notification.job) {
      await tx.notificationJob.update({
        where: { id: notification.job.id },
        data: {
          status: "PENDING",
          attempts: 0,
          nextRunAt: new Date(),
          lockedUntil: null,
          lockedBy: null,
          lastError: null,
        },
      });
    } else {
      await tx.notificationJob.create({
        data: { notificationId: notification.id, status: "PENDING" },
      });
    }
  });

  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "NOTIFICATION_MANUAL_RETRY",
      targetType: "Notification",
      targetId: notification.id,
      success: true,
      metadata: { eventType: notification.eventType },
    },
    prisma,
  );

  return { ok: true };
}
