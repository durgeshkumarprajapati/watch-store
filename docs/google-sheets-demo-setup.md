# Google Sheets Demo Spreadsheet Setup Guide

Because standalone Google Service Accounts receive `403 PERMISSION_DENIED` on `spreadsheets.create` without Drive ownership/delegation, follow these steps to create and connect your demo spreadsheet:

1. **Create a Spreadsheet in Google Drive**:
   - Open Google Sheets and create a new blank spreadsheet named:
     `WatchStore — Demo Catalogue Sync`
   - Copy its **Spreadsheet ID** from the URL:
     `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`
2. **Create Required Tabs**:
   - Rename `Sheet1` to **`Catalogue`** (used for all export/import operations).
   - Optionally add an **`Instructions`** tab for admin reference (documented in [google-sheets-column-mapping.md](file:///home/ppsd-021/watch-store/docs/google-sheets-column-mapping.md)).
   - *(Note: Import validation outcomes are stored in PostgreSQL `CatalogueSyncRowResult` and viewed at `/admin/google-sheets/[syncJobId]`, not written to a separate sheet tab.)*
3. **Share with the Service Account**:
   - Click **Share** on the Google Sheet.
   - Add your `GOOGLE_SERVICE_ACCOUNT_EMAIL` (`...@traders-515307.iam.gserviceaccount.com`) with **Editor** access.
4. **Connect & Export in WatchStore Admin**:
   - Sign in as admin and open **`/admin/google-sheets`**.
   - Enter the **Spreadsheet ID** and Worksheet Name **`Catalogue`**, then click **Save Connection**.
   - Click **Export Catalogue to Google Sheets** to populate the `Catalogue` tab with the 24 headers and all PostgreSQL products.
   - Edit rows or add a test `DRAFT` row, run **Dry Run Import** first, review the preview, and then click **Confirm & Commit Import**.
