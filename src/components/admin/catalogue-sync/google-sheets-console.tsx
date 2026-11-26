"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  disconnectSheetsConnectionAction,
  exportCatalogueToSheetsAction,
  runCatalogueImportAction,
  saveSheetsConnectionAction,
} from "@/modules/admin/catalogue-sync/sheets-sync-actions";

export function GoogleSheetsConsole({
  configuredOnServer,
  connection,
  canConfigure,
  canExport,
  canImport,
}: {
  configuredOnServer: boolean;
  connection: {
    spreadsheetId: string;
    worksheetName: string;
    isActive: boolean;
  } | null;
  canConfigure: boolean;
  canExport: boolean;
  canImport: boolean;
}) {
  const router = useRouter();
  const [spreadsheetId, setSpreadsheetId] = useState(connection?.spreadsheetId ?? "");
  const [worksheetName, setWorksheetName] = useState(connection?.worksheetName ?? "Catalogue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [dryRunReady, setDryRunReady] = useState(false);

  async function handleSaveConnection(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await saveSheetsConnectionAction({ spreadsheetId, worksheetName });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Connected to spreadsheet "${res.title}" (${worksheetName}).`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await disconnectSheetsConnectionAction();
      setSuccess("Google Sheets connection disconnected.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setLastJobId(null);
    try {
      const res = await exportCatalogueToSheetsAction(crypto.randomUUID());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLastJobId(res.syncJobId);
      setSuccess(`Exported ${res.totalRows} product(s) to Google Sheets.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(isDryRun: boolean) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setLastJobId(null);
    try {
      const res = await runCatalogueImportAction({
        isDryRun,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!res.ok) {
        setError(res.error);
        setDryRunReady(false);
        return;
      }
      setLastJobId(res.syncJobId);
      if (isDryRun) {
        setDryRunReady(res.failedRows === 0);
        setSuccess(
          `Dry-run complete: ${res.createdRows} new, ${res.updatedRows} updates, ${res.unchangedRows} unchanged, ${res.failedRows} errors.`,
        );
      } else {
        setDryRunReady(false);
        setSuccess(
          `Import applied: ${res.createdRows} created, ${res.updatedRows} updated, ${res.unchangedRows} unchanged, ${res.failedRows} failed.`,
        );
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!configuredOnServer ? (
        <div className="p-4 rounded border border-outline bg-surface-container font-body text-body-md text-on-surface-variant">
          Google Service Account credentials (<code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and{" "}
          <code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code>) are not configured on the server.
        </div>
      ) : null}

      {error ? (
        <div className="p-4 rounded border border-error bg-error/10 text-error font-body text-body-md">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="p-4 rounded border border-success bg-success/10 text-success font-body text-body-md flex flex-wrap items-center justify-between gap-2">
          <span>{success}</span>
          {lastJobId ? (
            <Link
              href={`/admin/google-sheets/${lastJobId}`}
              className="font-label text-label-sm uppercase underline"
            >
              View Row Results
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Connection Settings */}
      {canConfigure ? (
        <form
          onSubmit={handleSaveConnection}
          className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-4"
        >
          <h2 className="font-headline text-headline-md border-b border-outline pb-2">
            Spreadsheet Connection
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-label text-label-lg">Spreadsheet ID</span>
              <input
                type="text"
                required
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                className="px-3.5 py-2 rounded bg-background border border-outline font-mono text-mono-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-label text-label-lg">Worksheet Name</span>
              <input
                type="text"
                required
                value={worksheetName}
                onChange={(e) => setWorksheetName(e.target.value)}
                placeholder="Catalogue"
                className="px-3.5 py-2 rounded bg-background border border-outline"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase"
            >
              {busy ? "Verifying..." : "Verify & Save Connection"}
            </button>
            {connection?.isActive ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-sm border border-error text-error font-label text-label-sm uppercase"
              >
                Disconnect
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {/* Export & Import Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {canExport ? (
          <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
            <h2 className="font-headline text-headline-md">Export: PostgreSQL → Sheets</h2>
            <p className="font-body text-body-md text-on-surface-variant">
              Replaces the managed catalogue range (<code>A1:X</code>) with authoritative
              PostgreSQL product data. Stock, orders, and customer data are never exported.
            </p>
            <button
              type="button"
              disabled={busy || !connection?.isActive}
              onClick={handleExport}
              className="self-start px-4 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase disabled:opacity-50"
            >
              Export Catalogue
            </button>
          </section>
        ) : null}

        {canImport ? (
          <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
            <h2 className="font-headline text-headline-md">Import: Sheets → PostgreSQL</h2>
            <p className="font-body text-body-md text-on-surface-variant">
              Run Dry-Run Validation first to preview creates, updates, and conflicts. New products
              default to DRAFT.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !connection?.isActive}
                onClick={() => handleImport(true)}
                className="px-4 py-2 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary disabled:opacity-50"
              >
                Run Dry-Run Preview
              </button>
              <button
                type="button"
                disabled={busy || !connection?.isActive || !dryRunReady}
                onClick={() => handleImport(false)}
                className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase disabled:opacity-50"
              >
                Confirm &amp; Apply Import
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
