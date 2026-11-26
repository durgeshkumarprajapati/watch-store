import type { Availability, Product, ProductSummary } from "./types";

export const LOW_STOCK_THRESHOLD = 3;

export function availabilityOf(p: Pick<Product, "stock">): Availability {
  if (p.stock.available <= 0) return "out_of_stock";
  if (p.stock.available <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

export function discountPercent(mrpPaise: number, pricePaise: number): number {
  if (mrpPaise <= 0 || pricePaise >= mrpPaise) return 0;
  return Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
}

export function toSummary(p: Product): ProductSummary {
  const primary = p.images[0];
  return {
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    name: p.name,
    brandName: p.brand.name,
    pricePaise: p.pricePaise,
    mrpPaise: p.mrpPaise,
    discountPercent: discountPercent(p.mrpPaise, p.pricePaise),
    badge: p.badge,
    image: primary ? { src: primary, alt: p.name } : null,
    availability: availabilityOf(p),
    gender: p.gender,
  };
}
