-- Phase 13: Additive Customer Notifications, Durable Outbox Queue & Preferences
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER');
CREATE TYPE "NotificationEventType" AS ENUM (
  'ORDER_CONFIRMED',
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'COD_ORDER_CONFIRMED',
  'SHIPMENT_CREATED',
  'SHIPMENT_DISPATCHED',
  'OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED'
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "customerId" TEXT,
  "orderId" TEXT,
  "eventType" "NotificationEventType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT NOT NULL DEFAULT 'RESEND',
  "providerMessageId" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationJob" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "customerId" TEXT NOT NULL,
  "orderUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "paymentUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "shippingUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "accountSecurityUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("customerId")
);

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_customerId_createdAt_idx" ON "Notification"("customerId", "createdAt");
CREATE INDEX "Notification_orderId_createdAt_idx" ON "Notification"("orderId", "createdAt");
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");
CREATE INDEX "Notification_eventType_createdAt_idx" ON "Notification"("eventType", "createdAt");

CREATE UNIQUE INDEX "NotificationJob_notificationId_key" ON "NotificationJob"("notificationId");
CREATE INDEX "NotificationJob_status_nextRunAt_idx" ON "NotificationJob"("status", "nextRunAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
