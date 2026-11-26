import { revalidatePath } from "next/cache";

export function revalidateCataloguePaths(productSlugs: string[] = []): void {
  try {
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
