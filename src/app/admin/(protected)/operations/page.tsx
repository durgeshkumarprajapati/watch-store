import type { Metadata } from "next";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";
import { getOperationsDashboardSnapshot } from "@/modules/operations/operations-service";
import { OperationsConsole } from "@/components/admin/operations/operations-console";

export const metadata: Metadata = {
  title: "Operations Health — WatchStore Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminOperationsPage() {
  const actor = await requireAdminPermission("operations.read");
  const canManage = hasAdminPermission(actor.permissions, "operations.manage");
  const raw = await getOperationsDashboardSnapshot();

  const snapshot = {
    ...raw,
    recentRuns: raw.recentRuns.map((r) => ({
      id: r.id,
      jobName: r.jobName,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      durationMs: r.durationMs,
      processedCount: r.processedCount,
      errorCount: r.errorCount,
      lastError: r.lastError,
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-background">
          Operations &amp; Background Health
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          Monitor scheduled jobs, dead-letter queues, reservation cleanup, and provider reconciliation.
        </p>
      </div>
      <OperationsConsole canManage={canManage} snapshot={snapshot} />
    </div>
  );
}
