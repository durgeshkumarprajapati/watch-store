"use server";

import { revalidatePath } from "next/cache";
import { getProductRepository } from "@/modules/catalogue";
import { validatePromoCode } from "./cart-service";
import {
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  clearCartLines,
  getCartLines,
  saveCartLines,
  savePromoCode,
} from "./cart-store";

export type AddToCartResult = { ok: true; count: number } | { ok: false; error: string };
export type CartMutationResult = { ok: true } | { ok: false; error: string };

function revalidateCartViews() {
  revalidatePath("/", "layout");
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

export async function addToCartAction(productId: string, quantity = 1): Promise<AddToCartResult> {
  if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) {
    return { ok: false, error: "Invalid product." };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return { ok: false, error: "Invalid quantity." };
  }
  const [product] = await getProductRepository().getByIds([productId]);
  if (!product) return { ok: false, error: "This timepiece is no longer available." };

  const lines = await getCartLines();
  const existing = lines.find((l) => l.productId === product.id);
  const limit = Math.min(MAX_LINE_QUANTITY, product.stock.available);
  const nextQty = (existing?.quantity ?? 0) + quantity;

  if (limit <= 0) return { ok: false, error: "Currently out of stock." };
  if (nextQty > limit) return { ok: false, error: `Only ${limit} available.` };
  if (!existing && lines.length >= MAX_CART_LINES) return { ok: false, error: "Your bag is full." };

  const updated = existing
    ? lines.map((l) => (l.productId === product.id ? { ...l, quantity: nextQty } : l))
    : [...lines, { productId: product.id, quantity }];
  await saveCartLines(updated);
  revalidateCartViews();
  return { ok: true, count: updated.reduce((n, l) => n + l.quantity, 0) };
}

export async function updateCartQuantityAction(
  productId: string,
  quantity: number,
): Promise<CartMutationResult> {
  if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) {
    return { ok: false, error: "Invalid product." };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return { ok: false, error: `Quantity must be between 1 and ${MAX_LINE_QUANTITY}.` };
  }
  const [product] = await getProductRepository().getByIds([productId]);
  if (!product) return { ok: false, error: "This timepiece is no longer available." };

  const limit = Math.min(MAX_LINE_QUANTITY, product.stock.available);
  if (limit <= 0) return { ok: false, error: "Currently out of stock." };
  if (quantity > limit) return { ok: false, error: `Only ${limit} available.` };

  const lines = await getCartLines();
  if (!lines.some((l) => l.productId === product.id)) {
    return { ok: false, error: "Item is not in your bag." };
  }

  const updated = lines.map((l) => (l.productId === product.id ? { ...l, quantity } : l));
  await saveCartLines(updated);
  revalidateCartViews();
  return { ok: true };
}

export async function removeFromCartAction(productId: string): Promise<CartMutationResult> {
  if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) {
    return { ok: false, error: "Invalid product." };
  }
  const lines = await getCartLines();
  const updated = lines.filter((l) => l.productId !== productId);
  await saveCartLines(updated);
  revalidateCartViews();
  return { ok: true };
}

export async function clearCartAction(): Promise<CartMutationResult> {
  await clearCartLines();
  await savePromoCode(null);
  revalidateCartViews();
  return { ok: true };
}

export async function applyPromoCodeAction(
  rawCode: string,
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const lines = await getCartLines();
  if (lines.length === 0) {
    return { ok: false, error: "Add a timepiece before applying a promo code." };
  }
  const products = await getProductRepository().getByIds(lines.map((l) => l.productId));
  const byId = new Map(products.map((p) => [p.id, p]));
  const subtotalPaise = lines.reduce((sum, l) => {
    const p = byId.get(l.productId);
    return sum + (p ? p.pricePaise * l.quantity : 0);
  }, 0);

  const result = validatePromoCode(rawCode, subtotalPaise);
  if (!result.code) {
    return { ok: false, error: result.error ?? "Invalid promo code." };
  }
  await savePromoCode(result.code);
  revalidateCartViews();
  return { ok: true, code: result.code };
}

export async function removePromoCodeAction(): Promise<CartMutationResult> {
  await savePromoCode(null);
  revalidateCartViews();
  return { ok: true };
}
