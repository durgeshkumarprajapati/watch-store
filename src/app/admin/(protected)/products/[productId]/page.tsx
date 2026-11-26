import { notFound } from "next/navigation";
import { AdminProductForm } from "@/components/admin/catalogue/admin-product-form";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listAdminBrands } from "@/modules/admin/catalogue/admin-brand-service";
import { listAdminCategories } from "@/modules/admin/catalogue/admin-category-service";
import { getAdminProductById } from "@/modules/admin/catalogue/admin-product-service";
import { listExistingProductImagePaths } from "@/modules/admin/catalogue/media-storage";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

export default async function EditAdminProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const admin = await requireAdminPermission("products.read");
  const { productId } = await params;

  const [product, brands, categories, existingImages] = await Promise.all([
    getAdminProductById(productId),
    listAdminBrands(),
    listAdminCategories(),
    listExistingProductImagePaths(),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <AdminProductForm
      mode="edit"
      initialProduct={product}
      brands={brands}
      categories={categories}
      existingImages={existingImages}
      canEdit={hasAdminPermission(admin.permissions, "products.update")}
      canPublish={hasAdminPermission(admin.permissions, "catalogue.publish")}
      canDelete={hasAdminPermission(admin.permissions, "products.delete")}
    />
  );
}
