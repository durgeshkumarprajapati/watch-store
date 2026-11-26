import { AdminProductForm } from "@/components/admin/catalogue/admin-product-form";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listAdminBrands } from "@/modules/admin/catalogue/admin-brand-service";
import { listAdminCategories } from "@/modules/admin/catalogue/admin-category-service";
import { listExistingProductImagePaths } from "@/modules/admin/catalogue/media-storage";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

export default async function NewAdminProductPage() {
  const admin = await requireAdminPermission("products.create");
  const [brands, categories, existingImages] = await Promise.all([
    listAdminBrands(),
    listAdminCategories(),
    listExistingProductImagePaths(),
  ]);

  return (
    <AdminProductForm
      mode="create"
      brands={brands}
      categories={categories}
      existingImages={existingImages}
      canEdit={true}
      canPublish={hasAdminPermission(admin.permissions, "catalogue.publish")}
      canDelete={false}
    />
  );
}
