-- AlterTable: Brand logo provider metadata
ALTER TABLE "Brand"
ADD COLUMN IF NOT EXISTS "logoProvider" TEXT DEFAULT 'local',
ADD COLUMN IF NOT EXISTS "logoPublicId" TEXT;

-- AlterTable: Category image provider metadata
ALTER TABLE "Category"
ADD COLUMN IF NOT EXISTS "imageProvider" TEXT DEFAULT 'local',
ADD COLUMN IF NOT EXISTS "imagePublicId" TEXT;

-- Drop old non-unique index on ProductImage.publicId and replace with compound unique constraint
DROP INDEX IF EXISTS "ProductImage_publicId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "ProductImage_provider_publicId_key" ON "ProductImage"("provider", "publicId");
CREATE UNIQUE INDEX IF NOT EXISTS "Brand_logoProvider_logoPublicId_key" ON "Brand"("logoProvider", "logoPublicId");
CREATE UNIQUE INDEX IF NOT EXISTS "Category_imageProvider_imagePublicId_key" ON "Category"("imageProvider", "imagePublicId");

-- CreateTable: Durable media cleanup queue
CREATE TABLE IF NOT EXISTS "MediaCleanupJob" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "publicId" TEXT,
    "url" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaCleanupJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MediaCleanupJob_status_nextRetryAt_idx" ON "MediaCleanupJob"("status", "nextRetryAt");
CREATE INDEX IF NOT EXISTS "MediaCleanupJob_publicId_idx" ON "MediaCleanupJob"("publicId");
