import { AdminBrandForm } from "@/components/admin/catalogue/admin-brand-form";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";

export default async function NewAdminBrandPage() {
  await requireAdminPermission("brands.manage");
  return <AdminBrandForm mode="create" canManage={true} />;
}
