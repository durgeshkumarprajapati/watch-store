import { notFound } from "next/navigation";
import { AdminCategoryForm } from "@/components/admin/catalogue/admin-category-form";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import {
  getAdminCategoryById,
  listAdminCategories,
} from "@/modules/admin/catalogue/admin-category-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

export default async function EditAdminCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const admin = await requireAdminPermission("categories.read");
  const { categoryId } = await params;

  const [category, allCategories] = await Promise.all([
    getAdminCategoryById(categoryId),
    listAdminCategories(),
  ]);
  if (!category) notFound();

  return (
    <AdminCategoryForm
      mode="edit"
      initialCategory={category}
      allCategories={allCategories}
      canManage={hasAdminPermission(admin.permissions, "categories.manage")}
    />
  );
}
