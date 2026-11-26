# Phase 14 — Google Sheets Catalogue Integration Architecture

## 1. Overview
WatchStore integrates with Google Sheets as an **explicit, admin-triggered catalogue synchronization channel**. PostgreSQL (`watchstore_db`) remains the single authoritative source of truth for all product, brand, category, pricing, inventory, and order data.

## 2. Core Components
- **Database Schema (`prisma/schema.prisma`, migration `0010_phase14_google_sheets_sync`)**:
  - `GoogleSheetsConnection`: Stores the active spreadsheet ID, worksheet name, spreadsheet title, `lastExportedAt`, `lastImportedAt`, and `isActive` flag.
  - `CatalogueSyncJob`: Records every `EXPORT` and `IMPORT` (dry-run or commit) job, including `idempotencyKey`, `status`, row counters (`totalRows`, `createdRows`, `updatedRows`, `unchangedRows`, `failedRows`), and admin actor.
  - `CatalogueSyncRowResult`: Stores per-row outcomes (`CREATE`, `UPDATE`, `UNCHANGED`, `SKIP`, `ERROR`), SKU, row number, and field-level validation/conflict errors.
- **Google Sheets API Client (`src/modules/admin/catalogue-sync/google-sheets-client.ts`)**:
  - Authenticates using a Google Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`) with Node `crypto.createSign("RSA-SHA256")` JWT exchange against `https://oauth2.googleapis.com/token`.
  - Scoped to `https://www.googleapis.com/auth/spreadsheets`.
- **Mapper & Validation (`src/modules/admin/catalogue-sync/sheets-mapper.ts`)**:
  - Defines the 24-column `CATALOGUE_SHEET_HEADERS` contract, formula injection escaping, INR-to-paise parsing, and GST percentage-to-bps parsing.
- **Sync Service & Actions (`src/modules/admin/catalogue-sync/sheets-sync-service.ts`, `sheets-sync-actions.ts`)**:
  - Coordinates connection verification, catalogue export, dry-run validation, atomic per-product import commits, conflict detection, and `AdminAuditLog` recording.
- **Admin UI (`src/app/admin/(protected)/google-sheets/`)**:
  - Provides connection configuration, export trigger, mandatory dry-run preview before commit import, sync job history, and per-row error inspection.

## 3. Data Boundaries
Catalogue sync **never** creates, updates, or deletes:
- `ProductStock` (physical/reserved/available stock)
- `InventoryReservation`
- `StockAdjustment`
- `Order` or `OrderItem` snapshots
