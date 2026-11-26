import { notFound } from "next/navigation";
import { AdminBrandForm } from "@/components/admin/catalogue/admin-brand-form";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { getAdminBrandById } from "@/modules/admin/catalogue/admin-brand-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

export default async function EditAdminBrandPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const admin = await requireAdminPermission("brands.read");
  const { brandId } = await params;
  const brand = await getAdminBrandById(brandId);
  if (!brand) notFound();

  return (
    <AdminBrandForm
      mode="edit"
      initialBrand={brand}
      canManage={hasAdminPermission(admin.permissions, "brands.manage")}
    />
  );
}
