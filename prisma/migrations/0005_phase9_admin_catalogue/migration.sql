-- Phase 9: Additive Admin Catalogue Extensions (Brand, Category Hierarchy, ProductStatus)
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "Brand"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Category"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Product"
  ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'PUBLISHED';

CREATE INDEX "Brand_isActive_idx" ON "Brand"("isActive");
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");
CREATE INDEX "Category_isActive_idx" ON "Category"("isActive");
CREATE INDEX "Product_status_idx" ON "Product"("status");

ALTER TABLE "Category"
  ADD CONSTRAINT "Category_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Category"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
