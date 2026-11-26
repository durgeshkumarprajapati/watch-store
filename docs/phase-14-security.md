# Phase 14 — Security & Authorization Controls

1. **Service Account Credential Isolation**:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` are validated on the server via `src/config/env.ts` (`getServerEnv()`) and never exposed to client bundles or browser responses.
   - OAuth2 access tokens are signed server-side using Node `crypto.createSign("RSA-SHA256")` and exchanged over HTTPS with `https://oauth2.googleapis.com/token`.
2. **RBAC Enforcement**:
   - `catalogue.sync.read`: View `/admin/google-sheets` and sync job details.
   - `catalogue.sync.configure`: Save or disconnect `GoogleSheetsConnection`.
   - `catalogue.sync.export`: Trigger catalogue export to Google Sheets.
   - `catalogue.sync.import`: Run dry-run and commit imports.
   - `catalogue.publish`: Required for newly imported products to be set to `ACTIVE`; otherwise they default to `DRAFT`.
   - Every Server Action enforces `requireAdminPermission(...)` before touching database or Google Sheets APIs.
3. **Spreadsheet Formula Injection Protection**:
   - All exported string cells are sanitized with `escapeFormulaInjection`, prefixing leading `=`, `+`, `-`, `@`, `\t`, or `\r` with `'`.
4. **Input Validation & Bounds**:
   - `spreadsheetId` and `worksheetName` are validated against strict regexes (`spreadsheetConfigSchema`).
   - Imports are capped at `500` rows (`MAX_IMPORT_ROWS`) and `4000` chars/cell (`MAX_CELL_LENGTH`).
   - All product payloads are validated with `adminProductInputSchema` before database writes.
5. **Audit Trail**:
   - Connection updates, disconnects, exports, dry-runs, and commits are logged in `AdminAuditLog`.
