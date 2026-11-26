-- Phase 12: Additive Shiprocket Shipping, Webhooks, Durable Jobs & Encrypted Token Cache
CREATE TYPE "ShippingProvider" AS ENUM ('MANUAL', 'SHIPROCKET');
CREATE TYPE "ShipmentStatus" AS ENUM (
  'PENDING',
  'SERVICEABILITY_CHECKED',
  'SHIPMENT_CREATED',
  'AWB_ASSIGNED',
  'PICKUP_SCHEDULED',
  'PICKUP_COMPLETED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RTO_INITIATED',
  'RTO_DELIVERED',
  'CANCELLED',
  'FAILED',
  'RECONCILIATION_REQUIRED'
);
CREATE TYPE "ShippingJobType" AS ENUM ('TRACKING_SYNC', 'WEBHOOK_PROCESS', 'RECONCILE_SHIPMENT');
CREATE TYPE "ShippingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

CREATE TABLE "ShiprocketAuthToken" (
  "id" TEXT NOT NULL,
  "encryptedToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiprocketAuthToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" "ShippingProvider" NOT NULL DEFAULT 'SHIPROCKET',
  "isManual" BOOLEAN NOT NULL DEFAULT false,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
  "shiprocketOrderId" TEXT,
  "shiprocketShipmentId" TEXT,
  "awbCode" TEXT,
  "courierId" INTEGER,
  "courierName" TEXT,
  "trackingUrl" TEXT,
  "labelUrl" TEXT,
  "pickupScheduledAt" TIMESTAMP(3),
  "pickupReference" TEXT,
  "weightKg" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "lengthCm" DOUBLE PRECISION NOT NULL DEFAULT 16,
  "breadthCm" DOUBLE PRECISION NOT NULL DEFAULT 14,
  "heightCm" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "lastSyncedAt" TIMESTAMP(3),
  "lastProviderStatus" TEXT,
  "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
  "lastError" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShipmentStatusHistory" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "fromStatus" "ShipmentStatus",
  "toStatus" "ShipmentStatus" NOT NULL,
  "providerStatus" TEXT,
  "location" TEXT,
  "note" TEXT,
  "actorAdminId" TEXT,
  "dedupeKey" TEXT,
  "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShippingWebhookEvent" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "awbCode" TEXT,
  "shiprocketOrderId" TEXT,
  "eventStatus" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShippingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShippingJob" (
  "id" TEXT NOT NULL,
  "jobType" "ShippingJobType" NOT NULL,
  "shipmentId" TEXT,
  "payload" JSONB,
  "status" "ShippingJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShippingJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shipment_shiprocketOrderId_key" ON "Shipment"("shiprocketOrderId");
CREATE UNIQUE INDEX "Shipment_shiprocketShipmentId_key" ON "Shipment"("shiprocketShipmentId");
CREATE UNIQUE INDEX "Shipment_awbCode_key" ON "Shipment"("awbCode");
CREATE UNIQUE INDEX "Shipment_idempotencyKey_key" ON "Shipment"("idempotencyKey");
CREATE INDEX "Shipment_orderId_createdAt_idx" ON "Shipment"("orderId", "createdAt");
CREATE INDEX "Shipment_status_updatedAt_idx" ON "Shipment"("status", "updatedAt");

CREATE UNIQUE INDEX "ShipmentStatusHistory_dedupeKey_key" ON "ShipmentStatusHistory"("dedupeKey");
CREATE INDEX "ShipmentStatusHistory_shipmentId_eventAt_idx" ON "ShipmentStatusHistory"("shipmentId", "eventAt");

CREATE UNIQUE INDEX "ShippingWebhookEvent_dedupeKey_key" ON "ShippingWebhookEvent"("dedupeKey");
CREATE INDEX "ShippingWebhookEvent_awbCode_idx" ON "ShippingWebhookEvent"("awbCode");
CREATE INDEX "ShippingWebhookEvent_processedAt_createdAt_idx" ON "ShippingWebhookEvent"("processedAt", "createdAt");

CREATE UNIQUE INDEX "ShippingJob_idempotencyKey_key" ON "ShippingJob"("idempotencyKey");
CREATE INDEX "ShippingJob_status_nextRunAt_idx" ON "ShippingJob"("status", "nextRunAt");
CREATE INDEX "ShippingJob_shipmentId_status_idx" ON "ShippingJob"("shipmentId", "status");

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipmentStatusHistory" ADD CONSTRAINT "ShipmentStatusHistory_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipmentStatusHistory" ADD CONSTRAINT "ShipmentStatusHistory_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShippingJob" ADD CONSTRAINT "ShippingJob_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
