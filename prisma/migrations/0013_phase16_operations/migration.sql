-- AlterTable: Payment reconciliation tracking columns
ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "needsReconciliation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reconciliationNote" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_needsReconciliation_status_idx" ON "Payment"("needsReconciliation", "status");

-- CreateTable: SchedulerRun operational execution log
CREATE TABLE IF NOT EXISTS "SchedulerRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "lastError" TEXT,

    CONSTRAINT "SchedulerRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SchedulerRun_jobName_startedAt_idx" ON "SchedulerRun"("jobName", "startedAt");
CREATE INDEX IF NOT EXISTS "SchedulerRun_status_startedAt_idx" ON "SchedulerRun"("status", "startedAt");
