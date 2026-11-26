import { AdminUsersManager } from "@/components/admin/admin-users-manager";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listAdminUsers } from "@/modules/admin/admin-user-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

export default async function AdminUsersPage() {
  const admin = await requireAdminPermission("admins.read");
  const rows = await listAdminUsers();

  const admins = rows.map((r) => ({
    id: r.id,
    isActive: r.isActive,
    name: r.user.name ?? r.user.email,
    email: r.user.email,
    roles: r.roles.map((ar) => ar.role.code),
  }));

  return (
    <AdminUsersManager
      admins={admins}
      currentAdminId={admin.adminId}
      canCreate={hasAdminPermission(admin.permissions, "admins.create")}
      canDeactivate={hasAdminPermission(admin.permissions, "admins.deactivate")}
      isSuperAdmin={admin.isSuperAdmin}
    />
  );
}
