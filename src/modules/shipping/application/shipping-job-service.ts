import { randomUUID } from "node:crypto";
import type { PrismaClient, ShippingJob, ShippingJobType } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { httpShiprocketClient, type ShiprocketClient } from "../infrastructure/shiprocket-client";
import { reconcileShipment, syncShipmentTracking } from "./tracking-sync-service";

export async function enqueueShippingJob(
  params: {
    jobType: ShippingJobType;
    shipmentId?: string;
    idempotencyKey?: string;
    delaySeconds?: number;
  },
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const nextRunAt = new Date(Date.now() + (params.delaySeconds ?? 0) * 1000);

  if (params.idempotencyKey) {
    return prisma.shippingJob.upsert({
      where: { idempotencyKey: params.idempotencyKey },
      create: {
        jobType: params.jobType,
        shipmentId: params.shipmentId ?? null,
        status: "PENDING",
        nextRunAt,
        idempotencyKey: params.idempotencyKey,
      },
      update: {},
    });
  }

  return prisma.shippingJob.create({
    data: {
      jobType: params.jobType,
      shipmentId: params.shipmentId ?? null,
      status: "PENDING",
      nextRunAt,
    },
  });
}

export async function claimNextShippingJob(
  workerId = `worker-${randomUUID().slice(0, 8)}`,
  prismaClient?: PrismaClient,
): Promise<ShippingJob | null> {
  const prisma = prismaClient ?? getPrisma();
  const rows = await prisma.$queryRaw<ShippingJob[]>`
    UPDATE "ShippingJob"
    SET
      "status" = 'PROCESSING',
      "lockedUntil" = NOW() + INTERVAL '2 minutes',
      "lockedBy" = ${workerId},
      "attempts" = "attempts" + 1,
      "updatedAt" = NOW()
    WHERE "id" = (
      SELECT "id"
      FROM "ShippingJob"
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

export async function processNextShippingJob(
  workerId = `worker-${randomUUID().slice(0, 8)}`,
  client: ShiprocketClient = httpShiprocketClient,
  prismaClient?: PrismaClient,
): Promise<{ claimed: boolean; jobId?: string; status?: string }> {
  const prisma = prismaClient ?? getPrisma();
  const job = await claimNextShippingJob(workerId, prisma);
  if (!job) return { claimed: false };

  try {
    if (job.jobType === "TRACKING_SYNC" && job.shipmentId) {
      const res = await syncShipmentTracking(job.shipmentId, client, prisma);
      if (!res.ok) throw new Error(res.error);
    } else if (job.jobType === "RECONCILE_SHIPMENT" && job.shipmentId) {
      const res = await reconcileShipment(job.shipmentId, client, prisma);
      if (!res.ok) throw new Error(res.error);
    }

    await prisma.shippingJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        lockedUntil: null,
        lockedBy: null,
        lastError: null,
      },
    });
    return { claimed: true, jobId: job.id, status: "COMPLETED" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shipping job failed.";
    const exhausted = job.attempts >= job.maxAttempts;
    const backoffSeconds = Math.min(3600, 30 * 2 ** Math.max(0, job.attempts - 1));

    await prisma.shippingJob.update({
      where: { id: job.id },
      data: {
        status: exhausted ? "DEAD_LETTER" : "FAILED",
        lockedUntil: null,
        lockedBy: null,
        lastError: message,
        nextRunAt: new Date(Date.now() + backoffSeconds * 1000),
      },
    });
    return { claimed: true, jobId: job.id, status: exhausted ? "DEAD_LETTER" : "FAILED" };
  }
}

/**
 * Enqueues idempotent reconciliation/tracking jobs for active Shiprocket shipments
 * and shipments flagged with reconciliationRequired = true.
 */
export async function enqueueActiveShipmentSyncs(
  prismaClient?: PrismaClient,
  opts?: { limit?: number; staleMinutes?: number },
): Promise<{ enqueuedTracking: number; enqueuedReconcile: number }> {
  const prisma = prismaClient ?? getPrisma();
  const limit = Math.max(1, Math.min(opts?.limit ?? 20, 50));
  const staleBefore = new Date(Date.now() - (opts?.staleMinutes ?? 15) * 60_000);
  const bucket = Math.floor(Date.now() / ((opts?.staleMinutes ?? 15) * 60_000));

  const [reconcileCandidates, trackingCandidates] = await Promise.all([
    prisma.shipment.findMany({
      where: {
        isManual: false,
        provider: "SHIPROCKET",
        reconciliationRequired: true,
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: { id: true },
    }),
    prisma.shipment.findMany({
      where: {
        isManual: false,
        provider: "SHIPROCKET",
        reconciliationRequired: false,
        awbCode: { not: null },
        status: {
          in: ["AWB_ASSIGNED", "PICKUP_SCHEDULED", "IN_TRANSIT", "OUT_FOR_DELIVERY"],
        },
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lte: staleBefore } }],
      },
      orderBy: [{ lastSyncedAt: "asc" }, { updatedAt: "asc" }],
      take: limit,
      select: { id: true },
    }),
  ]);

  let enqueuedReconcile = 0;
  for (const s of reconcileCandidates) {
    await enqueueShippingJob(
      {
        jobType: "RECONCILE_SHIPMENT",
        shipmentId: s.id,
        idempotencyKey: `RECONCILE:${s.id}:${bucket}`,
      },
      prisma,
    );
    enqueuedReconcile += 1;
  }

  let enqueuedTracking = 0;
  for (const s of trackingCandidates) {
    await enqueueShippingJob(
      {
        jobType: "TRACKING_SYNC",
        shipmentId: s.id,
        idempotencyKey: `TRACK:${s.id}:${bucket}`,
      },
      prisma,
    );
    enqueuedTracking += 1;
  }

  return { enqueuedTracking, enqueuedReconcile };
}
