import { AdminShell } from "@/components/admin/admin-shell";
import { requireAuthenticatedAdmin } from "@/modules/admin/admin-auth-service";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAuthenticatedAdmin();

  return (
    <AdminShell
      title="Operations Console"
      user={{
        name: admin.name,
        initials: admin.initials,
        roles: admin.roles,
        permissions: Array.from(admin.permissions),
      }}
    >
      {children}
    </AdminShell>
  );
}
