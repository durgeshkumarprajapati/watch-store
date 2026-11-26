import { requireAdminPermission } from "@/modules/admin/admin-auth-service";

export default async function AdminDashboardPage() {
  const admin = await requireAdminPermission("dashboard.read");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-headline text-headline-lg text-on-background">Store Operations Overview</h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          Signed in as {admin.name} ({admin.roles.join(", ")}).
        </p>
      </div>
      <div className="bg-surface border border-outline rounded-md p-6">
        <p className="font-body text-body-md text-on-surface-variant">
          Role-based access control is active. Operational modules (catalogue, orders, inventory, and reports) will populate in subsequent phases.
        </p>
      </div>
    </div>
  );
}
