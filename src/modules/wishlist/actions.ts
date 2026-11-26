"use server";

import { revalidatePath } from "next/cache";
import { getProductRepository } from "@/modules/catalogue";
import { getWishlistIds, saveWishlistIds } from "./wishlist-store";

export async function toggleWishlistAction(
  productId: string,
): Promise<{ ok: true; saved: boolean } | { ok: false; error: string }> {
  if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) {
    return { ok: false, error: "Invalid product." };
  }
  const ids = await getWishlistIds();
  const saved = ids.includes(productId);
  if (!saved) {
    const [product] = await getProductRepository().getByIds([productId]);
    if (!product) return { ok: false, error: "This timepiece is no longer available." };
  }
  await saveWishlistIds(saved ? ids.filter((i) => i !== productId) : [...ids, productId]);
  revalidatePath("/", "layout");
  return { ok: true, saved: !saved };
}
