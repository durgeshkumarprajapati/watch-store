-- AlterTable: Additive Cloudinary media metadata columns on ProductImage
ALTER TABLE "ProductImage"
ADD COLUMN IF NOT EXISTS "provider" TEXT DEFAULT 'local',
ADD COLUMN IF NOT EXISTS "publicId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductImage_publicId_idx" ON "ProductImage"("publicId");
