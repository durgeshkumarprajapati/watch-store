# Google Sheets Live Verification Results

**Date:** 2026-11-26  
**Spreadsheet:** `WatchStore Demo Catalogue` (`1uaeVNsPznc4yVyOIFD6-ZN2gETf8iH-ceaEAnH-F3P4`)

## Live Connectivity & Functional Checks

| Check | Status | Evidence |
| --- | --- | --- |
| `GoogleSheetsConnection` in PostgreSQL | **PASS** | Active connection `id: "default"`, `spreadsheetId: "1uaeVNsPznc4yVyOIFD6-ZN2gETf8iH-ceaEAnH-F3P4"`, `worksheetName: "Catalogue"`, `isActive: true` |
| Google Service Account OAuth | **PASS** | Live `HttpGoogleSheetsClient` authenticated against `https://oauth2.googleapis.com/token` |
| Spreadsheet & Worksheet Access | **PASS** | `verifySpreadsheetAccess` returned title `"WatchStore Demo Catalogue"` and worksheets `["Catalogue", "Instructions"]`; `readRange` succeeded on both tabs |
| Live Catalogue Export | **PASS** | `exportCatalogueToSheets` (`syncJobId: "cmwx3lznj0001wglpqgeo2zr7"`) exported `12` products with `24` headers; readback matched PostgreSQL `sku`, `name`, `pricePaise`, `gstRateBps`, and `status` |
| Live Import Dry-Run | **PASS** | `runCatalogueImport({ isDryRun: true })` (`syncJobId: "cmwx3m17y0005wglpjrru91ab"`) processed `12` rows (`unchangedRows: 12`, `failedRows: 0`) with `dbCountUnchanged: true` and `dbTimestampsUnchanged: true` |
| Sync Job & Error Handling | **PASS** | `CatalogueSyncJob` (`COMPLETED`) and `12` `CatalogueSyncRowResult` rows persisted; missing tab returned `GoogleSheetsApiError` HTTP `404` |
| Live Confirmed Import | **NOT TESTED** | Intentionally excluded per verification instructions (`"Do not perform a confirmed import"`) |
