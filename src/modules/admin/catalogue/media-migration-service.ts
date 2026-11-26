import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  buildSafeCloudinaryFolder,
  buildSafeCloudinaryPublicId,
  CloudinaryMediaStorageProvider,
} from "./cloudinary-media-storage";
import { type MediaStorageProvider, validateImageBuffer } from "./media-storage";

export type MediaMigrationMode = "dry-run" | "execute";

export interface MediaMigrationItemResult {
  productImageId: string;
  productId: string;
  sku: string;
  sourceUrl: string;
  expectedFolder: string;
  expectedPublicId: string;
  status:
    | "ELIGIBLE_DRY_RUN"
    | "MIGRATED"
    | "SKIPPED_ALREADY_MIGRATED"
    | "SKIPPED_NON_LOCAL"
    | "MISSING_FILE"
    | "INVALID_FILE"
    | "UPLOAD_FAILED"
    | "DB_UPDATE_FAILED";
  migratedUrl?: string;
  isDuplicateSource?: boolean;
  error?: string;
}

export interface MediaMigrationReport {
  mode: MediaMigrationMode;
  totalDiscovered: number;
  eligibleCount: number;
  migratedCount: number;
  skippedCount: number;
  alreadyMigratedCount: number;
  missingFilesCount: number;
  failedUploadsCount: number;
  dbUpdateFailuresCount: number;
  duplicateSourcesCount: number;
  verificationStatus: "DRY_RUN_READY" | "COMPLETED" | "COMPLETED_WITH_ERRORS";
  items: MediaMigrationItemResult[];
}

export async function runProductMediaMigration(
  prisma: PrismaClient,
  opts: {
    mode: MediaMigrationMode;
    storageProvider?: MediaStorageProvider;
    publicRootDir?: string;
  },
): Promise<MediaMigrationReport> {
  const publicRoot = opts.publicRootDir ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "public");
  const provider =
    opts.storageProvider ??
    (opts.mode === "execute" ? new CloudinaryMediaStorageProvider() : undefined);

  const images = await prisma.productImage.findMany({
    orderBy: [{ productId: "asc" }, { sortOrder: "asc" }],
    include: {
      product: { select: { id: true, sku: true, slug: true } },
    },
  });

  const seenSourceUrls = new Set<string>();
  const items: MediaMigrationItemResult[] = [];

  let eligibleCount = 0;
  let migratedCount = 0;
  let skippedCount = 0;
  let alreadyMigratedCount = 0;
  let missingFilesCount = 0;
  let failedUploadsCount = 0;
  let dbUpdateFailuresCount = 0;
  let duplicateSourcesCount = 0;

  for (const img of images) {
    const folder = buildSafeCloudinaryFolder(img.product.sku);
    // Deterministic per-ProductImage publicId so retries recover interrupted uploads
    // without colliding across products or overwriting unrelated assets.
    const deterministicPublicId = buildSafeCloudinaryPublicId({
      deterministicKey: `${img.productId}:${img.id}`,
    });
    const fullExpectedPublicId = `${folder}/${deterministicPublicId}`;

    if (
      img.provider === "cloudinary" ||
      img.url.startsWith("https://res.cloudinary.com/")
    ) {
      alreadyMigratedCount += 1;
      skippedCount += 1;
      items.push({
        productImageId: img.id,
        productId: img.productId,
        sku: img.product.sku,
        sourceUrl: img.url,
        expectedFolder: folder,
        expectedPublicId: img.publicId ?? deterministicPublicId,
        status: "SKIPPED_ALREADY_MIGRATED",
      });
      continue;
    }

    if (!img.url.startsWith("/images/")) {
      skippedCount += 1;
      items.push({
        productImageId: img.id,
        productId: img.productId,
        sku: img.product.sku,
        sourceUrl: img.url,
        expectedFolder: folder,
        expectedPublicId: deterministicPublicId,
        status: "SKIPPED_NON_LOCAL",
      });
      continue;
    }

    const isDuplicateSource = seenSourceUrls.has(img.url);
    if (isDuplicateSource) {
      duplicateSourcesCount += 1;
    }
    seenSourceUrls.add(img.url);

    const relPath = img.url.replace(/^\/+/, "");
    const resolvedPath = path.resolve(publicRoot, relPath);
    if (!resolvedPath.startsWith(path.resolve(publicRoot))) {
      missingFilesCount += 1;
      items.push({
        productImageId: img.id,
        productId: img.productId,
        sku: img.product.sku,
        sourceUrl: img.url,
        expectedFolder: folder,
        expectedPublicId: deterministicPublicId,
        status: "INVALID_FILE",
        isDuplicateSource,
        error: "Unsafe local image path.",
      });
      continue;
    }

    let fileBuffer: Buffer;
    try {
      const fileStat = await stat(resolvedPath);
      if (!fileStat.isFile()) {
        throw new Error("Not a file");
      }
      fileBuffer = await readFile(resolvedPath);
      validateImageBuffer(fileBuffer);
    } catch (err) {
      const isMissing =
        err instanceof Error &&
        ("code" in err ? (err as NodeJS.ErrnoException).code === "ENOENT" : false);
      if (isMissing) {
        missingFilesCount += 1;
        items.push({
          productImageId: img.id,
          productId: img.productId,
          sku: img.product.sku,
          sourceUrl: img.url,
          expectedFolder: folder,
          expectedPublicId: deterministicPublicId,
          status: "MISSING_FILE",
          isDuplicateSource,
          error: "Local file not found on disk.",
        });
      } else {
        failedUploadsCount += 1;
        items.push({
          productImageId: img.id,
          productId: img.productId,
          sku: img.product.sku,
          sourceUrl: img.url,
          expectedFolder: folder,
          expectedPublicId: deterministicPublicId,
          status: "INVALID_FILE",
          isDuplicateSource,
          error: err instanceof Error ? err.message : "Invalid image file.",
        });
      }
      continue;
    }

    eligibleCount += 1;

    if (opts.mode === "dry-run") {
      items.push({
        productImageId: img.id,
        productId: img.productId,
        sku: img.product.sku,
        sourceUrl: img.url,
        expectedFolder: folder,
        expectedPublicId: `${folder}/${deterministicPublicId}`,
        status: "ELIGIBLE_DRY_RUN",
        isDuplicateSource,
      });
      continue;
    }

    if (!provider) {
      throw new Error("MediaStorageProvider is required for execute mode.");
    }

    let uploaded: { url: string; publicId?: string; provider: string } | undefined;
    if (provider.verifyAsset) {
      const existingRemote = await provider
        .verifyAsset({ publicId: fullExpectedPublicId })
        .catch(() => ({ exists: false as const }));
      if (existingRemote.exists && existingRemote.url) {
        uploaded = {
          url: existingRemote.url,
          publicId: fullExpectedPublicId,
          provider: provider.providerName,
        };
      }
    }

    if (!uploaded) {
      try {
        const res = await provider.saveProductImage({
          buffer: fileBuffer,
          originalFilename: path.basename(resolvedPath),
          folder,
          publicId: deterministicPublicId,
        });
        uploaded = {
          url: res.url,
          publicId: res.publicId,
          provider: res.provider,
        };
      } catch (err) {
        failedUploadsCount += 1;
        items.push({
          productImageId: img.id,
          productId: img.productId,
          sku: img.product.sku,
          sourceUrl: img.url,
          expectedFolder: folder,
          expectedPublicId: fullExpectedPublicId,
          status: "UPLOAD_FAILED",
          isDuplicateSource,
          error: err instanceof Error ? err.message : "Upload failed.",
        });
        continue;
      }
    }

    try {
      await prisma.productImage.update({
        where: { id: img.id },
        data: {
          url: uploaded.url,
          provider: uploaded.provider,
          publicId: uploaded.publicId ?? `${folder}/${deterministicPublicId}`,
        },
      });
      migratedCount += 1;
      items.push({
        productImageId: img.id,
        productId: img.productId,
        sku: img.product.sku,
        sourceUrl: img.url,
        expectedFolder: folder,
        expectedPublicId: uploaded.publicId ?? `${folder}/${deterministicPublicId}`,
        status: "MIGRATED",
        migratedUrl: uploaded.url,
        isDuplicateSource,
      });
    } catch (err) {
      dbUpdateFailuresCount += 1;
      items.push({
        productImageId: img.id,
        productId: img.productId,
        sku: img.product.sku,
        sourceUrl: img.url,
        expectedFolder: folder,
        expectedPublicId: uploaded.publicId ?? `${folder}/${deterministicPublicId}`,
        status: "DB_UPDATE_FAILED",
        isDuplicateSource,
        error: err instanceof Error ? err.message : "Database update failed.",
      });
    }
  }

  const hasErrors =
    missingFilesCount > 0 || failedUploadsCount > 0 || dbUpdateFailuresCount > 0;

  return {
    mode: opts.mode,
    totalDiscovered: images.length,
    eligibleCount,
    migratedCount,
    skippedCount,
    alreadyMigratedCount,
    missingFilesCount,
    failedUploadsCount,
    dbUpdateFailuresCount,
    duplicateSourcesCount,
    verificationStatus:
      opts.mode === "dry-run"
        ? hasErrors
          ? "COMPLETED_WITH_ERRORS"
          : "DRY_RUN_READY"
        : hasErrors
          ? "COMPLETED_WITH_ERRORS"
          : "COMPLETED",
    items,
  };
}
