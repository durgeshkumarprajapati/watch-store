import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditLog } from "@/modules/admin/admin-audit-service";
import type { AuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { processMediaCleanupJobs } from "@/modules/admin/catalogue/media-cleanup-service";
import { cleanupExpiredReservations } from "@/modules/inventory/reservation-service";
import { processNextNotificationJob } from "@/modules/notifications/notification-worker-service";
import {
  reconcilePendingPayments,
  reconcileSinglePayment,
} from "@/modules/payments/application/payment-reconciliation-service";
import {
  enqueueActiveShipmentSyncs,
  processNextShippingJob,
} from "@/modules/shipping/application/shipping-job-service";

export type ScheduledJobName =
  | "RESERVATION_CLEANUP"
  | "SHIPPING_SYNC"
  | "NOTIFICATION_PROCESS"
  | "MEDIA_CLEANUP"
  | "PAYMENT_RECONCILE";

export interface TrackedJobOutcome {
  processedCount: number;
  errorCount: number;
  summary: Record<string, unknown>;
}

const ABANDONED_THRESHOLD_MS = 5 * 60_000;

/**
 * Marks stale RUNNING executions (> 5 min) as ABANDONED, runs the bounded job,
 * records structured JSON logs, and updates SchedulerRun.
 */
export async function runTrackedScheduledJob(
  jobName: ScheduledJobName,
  fn: (prisma: PrismaClient) => Promise<TrackedJobOutcome>,
  prismaClient?: PrismaClient,
): Promise<{
  runId: string;
  ok: boolean;
  status: "COMPLETED" | "FAILED";
  durationMs: number;
  processedCount: number;
  errorCount: number;
  summary?: Record<string, unknown>;
  error?: string;
}> {
  const prisma = prismaClient ?? getPrisma();
  const startedAt = new Date();
  const abandonedCutoff = new Date(startedAt.getTime() - ABANDONED_THRESHOLD_MS);

  await prisma.schedulerRun.updateMany({
    where: {
      jobName,
      status: "RUNNING",
      startedAt: { lte: abandonedCutoff },
    },
    data: {
      status: "ABANDONED",
      completedAt: startedAt,
      lastError: "Execution exceeded lease window without completion.",
    },
  });

  const run = await prisma.schedulerRun.create({
    data: {
      jobName,
      status: "RUNNING",
      startedAt,
    },
  });

  try {
    const outcome = await fn(prisma);
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const status = outcome.errorCount > 0 && outcome.processedCount === 0 ? "FAILED" : "COMPLETED";

    await prisma.schedulerRun.update({
      where: { id: run.id },
      data: {
        status,
        completedAt,
        durationMs,
        processedCount: outcome.processedCount,
        errorCount: outcome.errorCount,
        summary: outcome.summary as Prisma.InputJsonValue,
      },
    });

    console.info(
      JSON.stringify({
        event: "scheduler_run_completed",
        runId: run.id,
        jobName,
        status,
        durationMs,
        processedCount: outcome.processedCount,
        errorCount: outcome.errorCount,
      }),
    );

    return {
      runId: run.id,
      ok: true,
      status,
      durationMs,
      processedCount: outcome.processedCount,
      errorCount: outcome.errorCount,
      summary: outcome.summary,
    };
  } catch (err) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const message =
      err instanceof Error ? err.message.slice(0, 240) : "Scheduled job failed.";

    await prisma.schedulerRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt,
        durationMs,
        errorCount: 1,
        lastError: message,
      },
    });

    console.error(
      JSON.stringify({
        event: "scheduler_run_failed",
        runId: run.id,
        jobName,
        durationMs,
        error: message,
      }),
    );

    return {
      runId: run.id,
      ok: false,
      status: "FAILED",
      durationMs,
      processedCount: 0,
      errorCount: 1,
      error: message,
    };
  }
}

export async function executeScheduledReservationCleanup(prisma?: PrismaClient) {
  return runTrackedScheduledJob(
    "RESERVATION_CLEANUP",
    async (db) => {
      const released = await cleanupExpiredReservations(db, new Date(), { batchSize: 50 });
      return { processedCount: released, errorCount: 0, summary: { released } };
    },
    prisma,
  );
}

export async function executeScheduledShippingSync(prisma?: PrismaClient) {
  return runTrackedScheduledJob(
    "SHIPPING_SYNC",
    async (db) => {
      const enqueued = await enqueueActiveShipmentSyncs(db, { limit: 15, staleMinutes: 15 });
      let processed = 0;
      let errors = 0;
      for (let i = 0; i < 10; i++) {
        const res = await processNextShippingJob(undefined, undefined, db);
        if (!res.claimed) break;
        processed += 1;
        if (res.status === "FAILED" || res.status === "DEAD_LETTER") errors += 1;
      }
      return {
        processedCount: processed,
        errorCount: errors,
        summary: { ...enqueued, processed },
      };
    },
    prisma,
  );
}

export async function executeScheduledNotificationProcess(prisma?: PrismaClient) {
  return runTrackedScheduledJob(
    "NOTIFICATION_PROCESS",
    async (db) => {
      let processed = 0;
      let errors = 0;
      const batchSize = 5;
      const maxJobs = 25;

      for (let offset = 0; offset < maxJobs; offset += batchSize) {
        const results = await Promise.all(
          Array.from({ length: batchSize }, (_, idx) =>
            processNextNotificationJob(`cron-${offset + idx}`, undefined, db),
          ),
        );
        let claimedInBatch = 0;
        for (const res of results) {
          if (!res.claimed) continue;
          claimedInBatch += 1;
          processed += 1;
          if (res.status === "FAILED" || res.status === "DEAD_LETTER") errors += 1;
        }
        if (claimedInBatch < batchSize) break;
      }

      return { processedCount: processed, errorCount: errors, summary: { processed } };
    },
    prisma,
  );
}

export async function executeScheduledMediaCleanup(prisma?: PrismaClient) {
  return runTrackedScheduledJob(
    "MEDIA_CLEANUP",
    async (db) => {
      const res = await processMediaCleanupJobs(db, undefined, { limit: 20 });
      return {
        processedCount: res.processed,
        errorCount: res.failed,
        summary: res,
      };
    },
    prisma,
  );
}

export async function executeScheduledPaymentReconcile(prisma?: PrismaClient) {
  return runTrackedScheduledJob(
    "PAYMENT_RECONCILE",
    async (db) => {
      const res = await reconcilePendingPayments({ prismaClient: db, batchSize: 20 });
      return {
        processedCount: res.scanned,
        errorCount: res.providerErrors,
        summary: {
          scanned: res.scanned,
          settledPaid: res.settledPaid,
          markedFailed: res.markedFailed,
          flaggedManual: res.flaggedManual,
          providerErrors: res.providerErrors,
        },
      };
    },
    prisma,
  );
}

export async function getOperationsDashboardSnapshot(prismaClient?: PrismaClient) {
  const prisma = prismaClient ?? getPrisma();
  const now = new Date();

  const [
    recentRuns,
    shippingCounts,
    notificationCounts,
    mediaCounts,
    failedShippingJobs,
    failedNotifications,
    failedMediaJobs,
    paymentsNeedingReconcile,
    shipmentsNeedingReconcile,
    expiredReservationsCount,
  ] = await Promise.all([
    prisma.schedulerRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    prisma.shippingJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.notificationJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.mediaCleanupJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.shippingJob.findMany({
      where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
      orderBy: { updatedAt: "desc" },
      take: 15,
      include: { shipment: { select: { id: true, orderId: true, awbCode: true } } },
    }),
    prisma.notificationJob.findMany({
      where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
      orderBy: { updatedAt: "desc" },
      take: 15,
      include: {
        notification: { select: { id: true, orderId: true, eventType: true, recipient: true } },
      },
    }),
    prisma.mediaCleanupJob.findMany({
      where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
      orderBy: { updatedAt: "desc" },
      take: 15,
    }),
    prisma.payment.findMany({
      where: {
        provider: "RAZORPAY",
        OR: [
          { needsReconciliation: true },
          { status: { in: ["AUTHORIZED", "REQUIRES_GATEWAY"] } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { order: { select: { id: true, orderNumber: true, status: true } } },
    }),
    prisma.shipment.findMany({
      where: { reconciliationRequired: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { order: { select: { id: true, orderNumber: true } } },
    }),
    prisma.inventoryReservation.count({
      where: { status: "RESERVED", expiresAt: { lte: now } },
    }),
  ]);

  const toMap = (rows: { status: string; _count: { _all: number } }[]) => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.status] = r._count._all;
    return m;
  };

  return {
    recentRuns,
    shippingSummary: toMap(shippingCounts),
    notificationSummary: toMap(notificationCounts),
    mediaSummary: toMap(mediaCounts),
    failedShippingJobs,
    failedNotifications,
    failedMediaJobs,
    paymentsNeedingReconcile,
    shipmentsNeedingReconcile,
    expiredReservationsCount,
  };
}

export async function adminRetryMediaCleanupJob(
  actor: AuthenticatedAdmin,
  jobId: string,
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const job = await prisma.mediaCleanupJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false as const, error: "Media cleanup job not found." };

  await prisma.mediaCleanupJob.update({
    where: { id: job.id },
    data: { status: "PENDING", nextRetryAt: new Date(), attempts: Math.min(job.attempts, job.maxAttempts - 1) },
  });

  const res = await processMediaCleanupJobs(prisma, undefined, { jobId: job.id });
  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "OPERATIONS_MEDIA_CLEANUP_RETRY",
      targetType: "MediaCleanupJob",
      targetId: job.id,
      success: res.failed === 0,
      metadata: res,
    },
    prisma,
  );
  return { ok: true as const, ...res };
}

export async function adminReconcilePaymentById(
  actor: AuthenticatedAdmin,
  paymentId: string,
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const res = await reconcileSinglePayment(paymentId, { prismaClient: prisma });
  await recordAdminAuditLog(
    {
      actorAdminId: actor.adminId,
      action: "OPERATIONS_PAYMENT_RECONCILE",
      targetType: "Payment",
      targetId: paymentId,
      success: res.outcome !== "PROVIDER_ERROR",
      metadata: { outcome: res.outcome, note: res.note },
    },
    prisma,
  );
  return res;
}
