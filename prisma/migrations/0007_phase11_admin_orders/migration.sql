-- Phase 11: Additive Order Fulfilment, Manual Shipment Tracking & Cancellation Extensions
CREATE TYPE "FulfilmentStatus" AS ENUM ('AWAITING_PACKING', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

ALTER TABLE "Order"
  ADD COLUMN "fulfilmentStatus" "FulfilmentStatus" NOT NULL DEFAULT 'AWAITING_PACKING',
  ADD COLUMN "packedAt" TIMESTAMP(3),
  ADD COLUMN "packedByAdminId" TEXT,
  ADD COLUMN "carrierName" TEXT,
  ADD COLUMN "trackingNumber" TEXT,
  ADD COLUMN "trackingUrl" TEXT,
  ADD COLUMN "shipmentReference" TEXT,
  ADD COLUMN "shippingNotes" TEXT,
  ADD COLUMN "shippedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "cancellationNotes" TEXT,
  ADD COLUMN "manualRefundRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrderStatusHistory"
  ADD COLUMN "actorAdminId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "OrderStatusHistory_idempotencyKey_key" ON "OrderStatusHistory"("idempotencyKey");
CREATE INDEX "Order_fulfilmentStatus_createdAt_idx" ON "Order"("fulfilmentStatus", "createdAt");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_packedByAdminId_fkey"
  FOREIGN KEY ("packedByAdminId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderStatusHistory"
  ADD CONSTRAINT "OrderStatusHistory_actorAdminId_fkey"
  FOREIGN KEY ("actorAdminId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
