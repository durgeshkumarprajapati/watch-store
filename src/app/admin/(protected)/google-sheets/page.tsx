import Link from "next/link";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { GoogleSheetsConsole } from "@/components/admin/catalogue-sync/google-sheets-console";
import { isGoogleSheetsConfigured } from "@/modules/admin/catalogue-sync/google-sheets-client";
import { getSheetsSyncDashboardMetrics } from "@/modules/admin/catalogue-sync/sheets-sync-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

export default async function AdminGoogleSheetsPage() {
  const admin = await requireAdminPermission("catalogue.sync.read");
  const metrics = await getSheetsSyncDashboardMetrics();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-surface">
          Google Sheets Catalogue Sync
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Controlled export and dry-run validated import with PostgreSQL as the single source of
          truth.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Connection",
            value: metrics.connection?.isActive ? "Active" : "Not Connected",
          },
          { label: "Exported Rows", value: metrics.totalExportedRows },
          { label: "Imported Rows", value: metrics.totalImportedRows },
          { label: "Failed Syncs", value: metrics.failedCount },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-surface border border-outline rounded-md p-4 flex flex-col gap-1"
          >
            <span className="font-label text-label-sm uppercase text-on-surface-variant">
              {card.label}
            </span>
            <span className="font-mono text-headline-md text-on-surface">{card.value}</span>
          </div>
        ))}
      </div>

      <GoogleSheetsConsole
        configuredOnServer={isGoogleSheetsConfigured()}
        connection={
          metrics.connection
            ? {
                spreadsheetId: metrics.connection.spreadsheetId,
                worksheetName: metrics.connection.worksheetName,
                isActive: metrics.connection.isActive,
              }
            : null
        }
        canConfigure={hasAdminPermission(admin.permissions, "catalogue.sync.configure")}
        canExport={hasAdminPermission(admin.permissions, "catalogue.sync.export")}
        canImport={hasAdminPermission(admin.permissions, "catalogue.sync.import")}
      />

      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-outline">
          <h2 className="font-headline text-headline-md">Synchronization History</h2>
        </div>
        {metrics.jobs.length === 0 ? (
          <p className="p-6 font-body text-body-md text-on-surface-variant">
            No synchronization jobs executed yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Direction</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Status</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Rows</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Started</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {metrics.jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="px-4 py-3 font-mono text-mono-sm">
                      {j.direction} {j.isDryRun ? "(DRY RUN)" : ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm">{j.status}</td>
                    <td className="px-4 py-3 font-mono text-mono-sm">
                      {j.totalRows} total ({j.createdRows} new / {j.updatedRows} upd /{" "}
                      {j.failedRows} err)
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm text-on-surface-variant">
                      {j.startedAt.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/google-sheets/${j.id}`}
                        className="font-label text-label-sm uppercase text-primary hover:underline"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
