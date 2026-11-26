-- Phase 14: Additive Google Sheets Catalogue Sync Models
CREATE TYPE "CatalogueSyncDirection" AS ENUM ('EXPORT', 'IMPORT');
CREATE TYPE "CatalogueSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');
CREATE TYPE "CatalogueSyncRowOperation" AS ENUM ('CREATE', 'UPDATE', 'UNCHANGED', 'SKIP', 'ERROR');

CREATE TABLE "GoogleSheetsConnection" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "spreadsheetId" TEXT NOT NULL,
  "worksheetName" TEXT NOT NULL DEFAULT 'Catalogue',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastConnectedAt" TIMESTAMP(3),
  "lastExportedAt" TIMESTAMP(3),
  "lastImportedAt" TIMESTAMP(3),
  "updatedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleSheetsConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogueSyncJob" (
  "id" TEXT NOT NULL,
  "direction" "CatalogueSyncDirection" NOT NULL,
  "spreadsheetId" TEXT NOT NULL,
  "worksheetName" TEXT NOT NULL,
  "status" "CatalogueSyncStatus" NOT NULL DEFAULT 'PENDING',
  "isDryRun" BOOLEAN NOT NULL DEFAULT false,
  "startedByAdminId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "createdRows" INTEGER NOT NULL DEFAULT 0,
  "updatedRows" INTEGER NOT NULL DEFAULT 0,
  "unchangedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  CONSTRAINT "CatalogueSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogueSyncRowResult" (
  "id" TEXT NOT NULL,
  "syncJobId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "sku" TEXT NOT NULL,
  "operation" "CatalogueSyncRowOperation" NOT NULL,
  "status" TEXT NOT NULL,
  "validationErrors" JSONB,
  "previousValues" JSONB,
  "proposedValues" JSONB,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogueSyncRowResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogueSyncJob_idempotencyKey_key" ON "CatalogueSyncJob"("idempotencyKey");
CREATE INDEX "CatalogueSyncJob_direction_startedAt_idx" ON "CatalogueSyncJob"("direction", "startedAt");
CREATE INDEX "CatalogueSyncJob_status_startedAt_idx" ON "CatalogueSyncJob"("status", "startedAt");

CREATE INDEX "CatalogueSyncRowResult_syncJobId_rowNumber_idx" ON "CatalogueSyncRowResult"("syncJobId", "rowNumber");
CREATE INDEX "CatalogueSyncRowResult_sku_idx" ON "CatalogueSyncRowResult"("sku");

ALTER TABLE "GoogleSheetsConnection" ADD CONSTRAINT "GoogleSheetsConnection_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CatalogueSyncJob" ADD CONSTRAINT "CatalogueSyncJob_startedByAdminId_fkey" FOREIGN KEY ("startedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CatalogueSyncRowResult" ADD CONSTRAINT "CatalogueSyncRowResult_syncJobId_fkey" FOREIGN KEY ("syncJobId") REFERENCES "CatalogueSyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
