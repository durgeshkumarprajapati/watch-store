import "server-only";
import { z } from "zod";
import { readJsonCookie, writeJsonCookie } from "@/lib/cookie-list";

/**
 * Guest cart: the cookie stores ONLY product ids and quantities. Prices, names and
 * availability are always re-read from the catalogue on the server — never from the client.
 * Phase 4/5: persisted per-customer cart + merge-on-login replaces/extends this.
 */
export const MAX_LINE_QUANTITY = 10;
export const MAX_CART_LINES = 50;

const cartSchema = z
  .array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) }))
  .max(MAX_CART_LINES);

const promoSchema = z.string().trim().min(1).max(32).nullable();

export type CartLine = z.infer<typeof cartSchema>[number];

export const getCartLines = () => readJsonCookie("cart", cartSchema, []);
export const saveCartLines = (lines: CartLine[]) => writeJsonCookie("cart", lines);
export const clearCartLines = () => writeJsonCookie("cart", []);

export const getPromoCode = () => readJsonCookie("cart_promo", promoSchema, null);
export const savePromoCode = (code: string | null) => writeJsonCookie("cart_promo", code);

export async function getCartCount(): Promise<number> {
  return (await getCartLines()).reduce((n, l) => n + l.quantity, 0);
}
