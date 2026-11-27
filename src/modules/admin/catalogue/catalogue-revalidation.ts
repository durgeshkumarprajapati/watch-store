import { revalidatePath } from "next/cache";
import { revalidatePublicCatalogueCache } from "@/modules/catalogue/catalogue-cache";

export function revalidateCataloguePaths(productSlugs: string[] = []): void {
  try {
    revalidatePublicCatalogueCache();
    revalidatePath("/", "layout");
    revalidatePath("/products");
    revalidatePath("/admin/products");
    revalidatePath("/admin/brands");
    revalidatePath("/admin/categories");
    for (const slug of productSlugs) {
      if (slug) {
        revalidatePath(`/product/${slug}`);
      }
    }
  } catch {
    // Outside Next.js request/action context (e.g. Vitest integration tests).
  }
}
