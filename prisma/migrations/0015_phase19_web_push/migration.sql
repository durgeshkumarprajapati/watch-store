-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'IN_APP';
ALTER TYPE "NotificationChannel" ADD VALUE 'PUSH';

-- AlterEnum
ALTER TYPE "NotificationEventType" ADD VALUE 'SECURITY_ALERT';
ALTER TYPE "NotificationEventType" ADD VALUE 'NEW_ORDER_ADMIN';
ALTER TYPE "NotificationEventType" ADD VALUE 'PAYMENT_RECEIVED_ADMIN';
ALTER TYPE "NotificationEventType" ADD VALUE 'PAYMENT_FAILED_ADMIN';
ALTER TYPE "NotificationEventType" ADD VALUE 'NEW_CUSTOMER_ADMIN';
ALTER TYPE "NotificationEventType" ADD VALUE 'LOW_STOCK_ADMIN';
ALTER TYPE "NotificationEventType" ADD VALUE 'SHIPMENT_EXCEPTION_ADMIN';
ALTER TYPE "NotificationEventType" ADD VALUE 'REFUND_REQUIRED_ADMIN';
ALTER TYPE "NotificationEventType" ADD VALUE 'NOTIFICATION_FAILED_ADMIN';

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "adminUserId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PushSubscription_single_owner_chk" CHECK (
      ("customerId" IS NOT NULL AND "adminUserId" IS NULL)
      OR ("customerId" IS NULL AND "adminUserId" IS NOT NULL)
    )
);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "adminUserId" TEXT,
ADD COLUMN "pushSubscriptionId" TEXT,
ADD COLUMN "targetUrl" TEXT,
ADD COLUMN "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_customerId_isActive_idx" ON "PushSubscription"("customerId", "isActive");

-- CreateIndex
CREATE INDEX "PushSubscription_adminUserId_isActive_idx" ON "PushSubscription"("adminUserId", "isActive");

-- CreateIndex
CREATE INDEX "PushSubscription_isActive_updatedAt_idx" ON "PushSubscription"("isActive", "updatedAt");

-- CreateIndex
CREATE INDEX "Notification_customerId_channel_readAt_idx" ON "Notification"("customerId", "channel", "readAt");

-- CreateIndex
CREATE INDEX "Notification_adminUserId_channel_createdAt_idx" ON "Notification"("adminUserId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_adminUserId_channel_readAt_idx" ON "Notification"("adminUserId", "channel", "readAt");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_pushSubscriptionId_fkey" FOREIGN KEY ("pushSubscriptionId") REFERENCES "PushSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
