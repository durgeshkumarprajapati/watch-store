import type { PrismaClient } from "@prisma/client";
import { getMediaStorageProvider, type MediaStorageProvider } from "./media-storage";

export type MediaCleanupReason =
  | "PRODUCT_IMAGE_REPLACED"
  | "PRODUCT_IMAGE_DELETED"
  | "BRAND_LOGO_REPLACED"
  | "BRAND_DELETED"
  | "CATEGORY_IMAGE_REPLACED"
  | "CATEGORY_DELETED"
  | "ORPHAN_ROLLBACK";

export async function isMediaAssetReferenced(
  prisma: PrismaClient,
  asset: { url: string; publicId?: string | null },
): Promise<boolean> {
  const [productRefs, brandRefs, categoryRefs] = await Promise.all([
    prisma.productImage.count({
      where: {
        OR: [
          ...(asset.publicId ? [{ publicId: asset.publicId }] : []),
          { url: asset.url },
        ],
      },
    }),
    prisma.brand.count({
      where: {
        OR: [
          ...(asset.publicId ? [{ logoPublicId: asset.publicId }] : []),
          { logoUrl: asset.url },
        ],
      },
    }),
    prisma.category.count({
      where: {
        OR: [
          ...(asset.publicId ? [{ imagePublicId: asset.publicId }] : []),
          { image: asset.url },
        ],
      },
    }),
  ]);

  return productRefs + brandRefs + categoryRefs > 0;
}

export async function enqueueMediaCleanupJob(
  prisma: PrismaClient,
  params: {
    provider: string;
    publicId?: string | null;
    url: string;
    reason: MediaCleanupReason;
  },
) {
  return prisma.mediaCleanupJob.create({
    data: {
      provider: params.provider,
      publicId: params.publicId ?? null,
      url: params.url,
      reason: params.reason,
      status: "PENDING",
      nextRetryAt: new Date(),
    },
  });
}

export async function processMediaCleanupJobs(
  prisma: PrismaClient,
  storageProvider?: MediaStorageProvider,
  opts?: { limit?: number; now?: Date; jobId?: string },
): Promise<{
  processed: number;
  completed: number;
  failed: number;
  skippedReferenced: number;
}> {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 20;
  const provider = getMediaStorageProvider(storageProvider);

  const dueJobs = await prisma.mediaCleanupJob.findMany({
    where: {
      ...(opts?.jobId ? { id: opts.jobId } : {}),
      status: { in: ["PENDING", "FAILED"] },
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let completed = 0;
  let failed = 0;
  let skippedReferenced = 0;

  for (const job of dueJobs) {
    if (job.attempts >= job.maxAttempts) {
      await prisma.mediaCleanupJob.update({
        where: { id: job.id },
        data: { status: "DEAD_LETTER" },
      });
      continue;
    }

    const claimed = await prisma.mediaCleanupJob.updateMany({
      where: { id: job.id, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "PROCESSING" },
    });
    if (claimed.count === 0) continue;

    processed += 1;

    const stillReferenced = await isMediaAssetReferenced(prisma, {
      url: job.url,
      publicId: job.publicId,
    });
    if (stillReferenced) {
      await prisma.mediaCleanupJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          lastError: null,
        },
      });
      skippedReferenced += 1;
      completed += 1;
      continue;
    }

    try {
      await provider.deleteProductImage({
        publicId: job.publicId ?? undefined,
        url: job.url,
      });
      await prisma.mediaCleanupJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          attempts: job.attempts + 1,
          completedAt: new Date(),
          lastError: null,
        },
      });
      completed += 1;
      console.info(
        JSON.stringify({
          event: "media_cleanup_completed",
          jobId: job.id,
          provider: job.provider,
          reason: job.reason,
        }),
      );
    } catch (err) {
      const nextAttempts = job.attempts + 1;
      const exhausted = nextAttempts >= job.maxAttempts;
      const backoffMs = Math.pow(2, nextAttempts) * 60_000;
      const message =
        err instanceof Error ? err.message.slice(0, 240) : "Remote media cleanup failed.";

      await prisma.mediaCleanupJob.update({
        where: { id: job.id },
        data: {
          status: exhausted ? "DEAD_LETTER" : "FAILED",
          attempts: nextAttempts,
          nextRetryAt: new Date(now.getTime() + backoffMs),
          lastError: message,
        },
      });
      failed += 1;
      console.warn(
        JSON.stringify({
          event: "media_cleanup_retry_scheduled",
          jobId: job.id,
          provider: job.provider,
          attempts: nextAttempts,
          exhausted,
        }),
      );
    }
  }

  return { processed, completed, failed, skippedReferenced };
}

/**
 * Checks references, durably enqueues cleanup, and attempts immediate execution.
 * Any remote deletion error is safely persisted in MediaCleanupJob for retry
 * without rolling back or failing the primary DB mutation.
 */
export async function scheduleAndAttemptMediaCleanup(
  prisma: PrismaClient,
  storageProvider: MediaStorageProvider | undefined,
  asset: { url: string; provider?: string | null; publicId?: string | null },
  reason: MediaCleanupReason,
): Promise<{ enqueued: boolean; deletedImmediately: boolean; jobId?: string }> {
  const isLocalStatic =
    asset.url.startsWith("/images/products/") ||
    asset.url.startsWith("/images/site/") ||
    asset.url.startsWith("/images/categories/");

  if (isLocalStatic) {
    return { enqueued: false, deletedImmediately: false };
  }

  const stillReferenced = await isMediaAssetReferenced(prisma, asset);
  if (stillReferenced) {
    return { enqueued: false, deletedImmediately: false };
  }

  const resolvedProvider =
    asset.provider ??
    (asset.url.startsWith("https://res.cloudinary.com/") ? "cloudinary" : "local");

  const job = await enqueueMediaCleanupJob(prisma, {
    provider: resolvedProvider,
    publicId: asset.publicId,
    url: asset.url,
    reason,
  });

  const result = await processMediaCleanupJobs(prisma, storageProvider, { jobId: job.id });
  return {
    enqueued: true,
    deletedImmediately: result.completed > 0,
    jobId: job.id,
  };
}
