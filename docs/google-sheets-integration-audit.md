# Google Sheets Catalogue Integration — Technical Audit

## 1. Existing Implementation Review
- **Database Models (`prisma/schema.prisma`)**: `GoogleSheetsConnection` (stores active `spreadsheetId`, `worksheetName`, `spreadsheetTitle`, `lastExportedAt`, `lastImportedAt`), `CatalogueSyncJob` (tracks `EXPORT` / `IMPORT`, `isDryRun`, `idempotencyKey`, counts), and `CatalogueSyncRowResult` (per-row outcomes & errors).
- **Auth & API Client (`src/modules/admin/catalogue-sync/google-sheets-client.ts`)**: Signs RS256 JWT assertions with `GOOGLE_SERVICE_ACCOUNT_EMAIL` & `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (`replace(/\\n/g, "\n")`) and exchanges at `https://oauth2.googleapis.com/token` for `https://www.googleapis.com/auth/spreadsheets`. Caches token in memory and retries `429`/`5xx` with exponential backoff.
- **Mapper (`src/modules/admin/catalogue-sync/sheets-mapper.ts`)**: Enforces 24-column `CATALOGUE_SHEET_HEADERS`, `MAX_IMPORT_ROWS = 500`, `MAX_CELL_LENGTH = 4000`, `escapeFormulaInjection`, `parseRupeesToPaise`, and `parseGstPercentToBps`.
- **Sync Service & RBAC (`sheets-sync-service.ts`, `sheets-sync-actions.ts`)**: Enforces `catalogue.sync.read`, `catalogue.sync.configure`, `catalogue.sync.import`, `catalogue.sync.export`, and `catalogue.publish`; persists `AdminAuditLog`; leaves `ProductStock`, `InventoryReservation`, and `OrderItem` untouched.

## 2. Environment Variable Findings
- **`GOOGLE_SHEET_ID` is NOT required**: Spreadsheet IDs are stored in PostgreSQL (`GoogleSheetsConnection`) via `/admin/google-sheets`, not via an env var.
- **`GOOGLE_SERVICE_ACCOUNT_EMAIL` & `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`**: Present and valid in `.env` (server-only via `getServerEnv()`, never sent to browser).

## 3. Live Connectivity Finding
- `OAUTH_STATUS: 200` (`HAS_TOKEN: true`) confirmed service account key parsing and JWT exchange work end-to-end.
- `POST https://sheets.googleapis.com/v4/spreadsheets` returned `HTTP 403 PERMISSION_DENIED ("The caller does not have permission")` because a standalone service account without Google Drive delegation cannot create new spreadsheets in a personal Google Drive. The spreadsheet must be created in Google Drive by an admin and shared with the service account email as **Editor**.
