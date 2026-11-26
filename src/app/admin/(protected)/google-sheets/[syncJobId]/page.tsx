import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { getCatalogueSyncJobDetail } from "@/modules/admin/catalogue-sync/sheets-sync-service";

export default async function AdminGoogleSheetsJobDetailPage({
  params,
}: {
  params: Promise<{ syncJobId: string }>;
}) {
  await requireAdminPermission("catalogue.sync.read");
  const { syncJobId } = await params;
  const job = await getCatalogueSyncJobDetail(syncJobId);
  if (!job) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/google-sheets"
          className="inline-flex items-center gap-1.5 font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-primary mb-2"
        >
          <Icon name="arrow_back" size={16} /> Back to Google Sheets Sync
        </Link>
        <h1 className="font-headline text-headline-lg text-on-surface">
          {job.direction} {job.isDryRun ? "(Dry-Run)" : ""} — {job.status}
        </h1>
        <p className="font-mono text-mono-sm text-on-surface-variant">
          Worksheet: {job.worksheetName} • Total: {job.totalRows} • Created: {job.createdRows} •
          Updated: {job.updatedRows} • Unchanged: {job.unchangedRows} • Failed: {job.failedRows}
        </p>
      </div>

      {job.lastError ? (
        <div className="p-4 rounded border border-error bg-error/10 text-error font-body text-body-md">
          {job.lastError}
        </div>
      ) : null}

      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        {job.rowResults.length === 0 ? (
          <p className="p-6 font-body text-body-md text-on-surface-variant">
            No row-level results recorded for this job.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Row</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">SKU</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Operation</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Status</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Validation Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {job.rowResults.map((r) => {
                  const errs = Array.isArray(r.validationErrors)
                    ? (r.validationErrors as string[])
                    : [];
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-mono text-mono-sm">{r.rowNumber}</td>
                      <td className="px-4 py-3 font-mono text-mono-sm">{r.sku}</td>
                      <td className="px-4 py-3 font-mono text-mono-sm">{r.operation}</td>
                      <td className="px-4 py-3 font-mono text-mono-sm">{r.status}</td>
                      <td className="px-4 py-3 font-body text-body-md text-error">
                        {errs.length > 0 ? errs.join("; ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
