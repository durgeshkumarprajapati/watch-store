import { Badge } from "@/components/ui/badge";
import { listAdminAuditLogs } from "@/modules/admin/admin-audit-service";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";

export default async function AdminAuditPage() {
  await requireAdminPermission("audit.read");
  const logs = await listAdminAuditLogs({ page: 1, pageSize: 50 });

  return (
    <section className="bg-surface border border-outline rounded-md overflow-hidden">
      <div className="px-6 py-4 border-b border-outline">
        <h1 className="font-headline text-headline-md text-on-surface">
          Administrator Audit Log ({logs.total})
        </h1>
      </div>
      <div className="divide-y divide-outline">
        {logs.items.length === 0 ? (
          <p className="px-6 py-8 font-body text-body-md text-on-surface-variant">
            No audit events recorded yet.
          </p>
        ) : (
          logs.items.map((log) => (
            <div key={log.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-mono-sm text-on-surface">{log.action}</span>
                  <Badge tone={log.success ? "success" : "error"}>
                    {log.success ? "Success" : "Failure"}
                  </Badge>
                </div>
                <p className="font-body text-body-md text-on-surface-variant mt-1">
                  Actor: {log.actorAdmin?.user.email ?? "System"} • Target: {log.targetType}
                  {log.targetId ? ` (${log.targetId})` : ""}
                </p>
              </div>
              <span className="font-mono text-mono-sm text-on-surface-variant">
                {log.createdAt.toISOString()}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
