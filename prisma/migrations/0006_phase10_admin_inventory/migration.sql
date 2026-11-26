-- Phase 10: Additive Inventory Extensions (lowStockThreshold, OUTWARD reason, audit & idempotency)
ALTER TYPE "StockAdjustmentReason" ADD VALUE IF NOT EXISTS 'OUTWARD';

ALTER TABLE "ProductStock"
  ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "StockAdjustment"
  ADD COLUMN "previousPhysical" INTEGER,
  ADD COLUMN "newPhysical" INTEGER,
  ADD COLUMN "actorAdminId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "StockAdjustment_idempotencyKey_key" ON "StockAdjustment"("idempotencyKey");
CREATE INDEX "StockAdjustment_actorAdminId_createdAt_idx" ON "StockAdjustment"("actorAdminId", "createdAt");
CREATE INDEX "StockAdjustment_reason_createdAt_idx" ON "StockAdjustment"("reason", "createdAt");

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_actorAdminId_fkey"
  FOREIGN KEY ("actorAdminId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
