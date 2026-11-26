import { AdminCategoryForm } from "@/components/admin/catalogue/admin-category-form";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listAdminCategories } from "@/modules/admin/catalogue/admin-category-service";

export default async function NewAdminCategoryPage() {
  await requireAdminPermission("categories.manage");
  const allCategories = await listAdminCategories();
  return <AdminCategoryForm mode="create" allCategories={allCategories} canManage={true} />;
}
