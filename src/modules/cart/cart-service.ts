import "server-only";
import { getProductRepository } from "@/modules/catalogue";
import { availabilityOf, discountPercent } from "@/modules/catalogue/summary";
import type { Availability, Product } from "@/modules/catalogue/types";
import { MAX_LINE_QUANTITY, getCartLines, getPromoCode, type CartLine } from "./cart-store";

export interface CartItemView {
  productId: string;
  slug: string;
  sku: string;
  name: string;
  brandName: string;
  dialAndStrap: string;
  image: { src: string; alt: string } | null;
  unitPricePaise: number;
  unitMrpPaise: number;
  discountPercent: number;
  gstRateBps: number;
  quantity: number;
  maxQuantity: number;
  availableStock: number;
  availability: Availability;
  lineTotalPaise: number;
  lineGstPaise: number;
  hasStockIssue: boolean;
}

export interface CartIssue {
  productId: string;
  name: string;
  reason: "unavailable" | "out_of_stock" | "exceeds_stock";
  message: string;
}

export interface CartSummary {
  items: CartItemView[];
  issues: CartIssue[];
  itemCount: number;
  subtotalPaise: number;
  mrpTotalPaise: number;
  productSavingsPaise: number;
  promoCode: string | null;
  promoDiscountPaise: number;
  shippingPaise: number;
  includedGstPaise: number;
  grandTotalPaise: number;
  canCheckout: boolean;
}

export const COD_MAX_ORDER_PAISE = 50_000_00; // ₹50,000

const SAMPLE_PROMOS: Record<string, { discountPaise: number; minSubtotalPaise: number }> = {
  WATCH10: { discountPaise: 10_000_00, minSubtotalPaise: 50_000_00 },
};

/** Inclusive GST extraction: total * rate / (10000 + rate). */
export function calculateIncludedGstPaise(totalPaise: number, gstRateBps: number): number {
  if (totalPaise <= 0 || gstRateBps <= 0) return 0;
  return Math.round((totalPaise * gstRateBps) / (10000 + gstRateBps));
}

export function validatePromoCode(
  rawCode: string | null,
  subtotalPaise: number,
): { code: string | null; discountPaise: number; error: string | null } {
  if (!rawCode) return { code: null, discountPaise: 0, error: null };
  const normalized = rawCode.trim().toUpperCase();
  const rule = SAMPLE_PROMOS[normalized];
  if (!rule) {
    return { code: null, discountPaise: 0, error: "Invalid or expired promo code." };
  }
  if (subtotalPaise < rule.minSubtotalPaise) {
    return {
      code: null,
      discountPaise: 0,
      error: `Promo code ${normalized} requires a minimum order of ₹${Math.round(rule.minSubtotalPaise / 100).toLocaleString("en-IN")}.`,
    };
  }
  return {
    code: normalized,
    discountPaise: Math.min(rule.discountPaise, subtotalPaise),
    error: null,
  };
}

export function computeCartSummary(
  lines: CartLine[],
  products: Product[],
  rawPromoCode: string | null,
): CartSummary {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items: CartItemView[] = [];
  const issues: CartIssue[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) {
      issues.push({
        productId: line.productId,
        name: "Unavailable timepiece",
        reason: "unavailable",
        message: "A timepiece in your bag is no longer available and should be removed.",
      });
      continue;
    }

    const available = product.stock.available;
    const maxQuantity = Math.max(0, Math.min(MAX_LINE_QUANTITY, available));
    const hasStockIssue = available <= 0 || line.quantity > available;

    if (available <= 0) {
      issues.push({
        productId: product.id,
        name: product.name,
        reason: "out_of_stock",
        message: `${product.name} is currently out of stock.`,
      });
    } else if (line.quantity > available) {
      issues.push({
        productId: product.id,
        name: product.name,
        reason: "exceeds_stock",
        message: `Only ${available} unit(s) of ${product.name} remain in stock.`,
      });
    }

    const lineTotalPaise = product.pricePaise * line.quantity;
    const primaryImg = product.images[0];

    items.push({
      productId: product.id,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      brandName: product.brand.name,
      dialAndStrap: product.dialAndStrap,
      image: primaryImg ? { src: primaryImg, alt: product.name } : null,
      unitPricePaise: product.pricePaise,
      unitMrpPaise: product.mrpPaise,
      discountPercent: discountPercent(product.mrpPaise, product.pricePaise),
      gstRateBps: product.gstRateBps,
      quantity: line.quantity,
      maxQuantity,
      availableStock: available,
      availability: availabilityOf(product),
      lineTotalPaise,
      lineGstPaise: calculateIncludedGstPaise(lineTotalPaise, product.gstRateBps),
      hasStockIssue,
    });
  }

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotalPaise = items.reduce((sum, i) => sum + i.lineTotalPaise, 0);
  const mrpTotalPaise = items.reduce((sum, i) => sum + i.unitMrpPaise * i.quantity, 0);
  const productSavingsPaise = Math.max(0, mrpTotalPaise - subtotalPaise);

  const promo = validatePromoCode(rawPromoCode, subtotalPaise);
  const promoDiscountPaise = promo.discountPaise;
  const discountedSubtotal = Math.max(0, subtotalPaise - promoDiscountPaise);

  // Proportional GST after promo discount across lines
  const rawGstSum = items.reduce((sum, i) => sum + i.lineGstPaise, 0);
  const includedGstPaise =
    subtotalPaise > 0
      ? Math.round((rawGstSum * discountedSubtotal) / subtotalPaise)
      : 0;

  const shippingPaise = 0; // Complimentary insured standard delivery
  const grandTotalPaise = discountedSubtotal + shippingPaise;
  const canCheckout = items.length > 0 && issues.length === 0;

  return {
    items,
    issues,
    itemCount,
    subtotalPaise,
    mrpTotalPaise,
    productSavingsPaise,
    promoCode: promo.code,
    promoDiscountPaise,
    shippingPaise,
    includedGstPaise,
    grandTotalPaise,
    canCheckout,
  };
}

export async function getCartSummary(): Promise<CartSummary> {
  const [lines, promoCode] = await Promise.all([getCartLines(), getPromoCode()]);
  if (lines.length === 0) {
    return computeCartSummary([], [], promoCode);
  }
  const products = await getProductRepository().getByIds(lines.map((l) => l.productId));
  return computeCartSummary(lines, products, promoCode);
}
