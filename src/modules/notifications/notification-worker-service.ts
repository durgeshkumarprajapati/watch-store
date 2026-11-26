import { randomUUID } from "node:crypto";
import type { NotificationJob, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditLog } from "@/modules/admin/admin-audit-service";
import type { AuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { sendTransactionalEmail, type SendEmailResult } from "./email-service";
import { notificationPayloadSchema, renderNotificationEmail } from "./notification-templates";

export type EmailSenderFn = (params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
}) => Promise<SendEmailResult>;

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

export async function processNextNotificationJob(
  workerId = `notif-${randomUUID().slice(0, 8)}`,
  emailSender: EmailSenderFn = sendTransactionalEmail,
  prismaClient?: PrismaClient,
): Promise<{ claimed: boolean; notificationId?: string; status?: string }> {
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
