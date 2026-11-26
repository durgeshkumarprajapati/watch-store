import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { seedProductRepository as repo } from "@/modules/catalogue/seed/seed-product-repository";
import { discountPercent } from "@/modules/catalogue/summary";
import { formatINR } from "@/lib/format";
import { addToCartAction } from "@/modules/cart/actions";
import { getCartCount, getCartLines } from "@/modules/cart/cart-store";
import { toggleWishlistAction } from "@/modules/wishlist/actions";
import { getWishlistIds } from "@/modules/wishlist/wishlist-store";

beforeEach(() => jar.clear());

describe("product details repository & mapping", () => {
  it("looks up an existing product by slug", async () => {
    const product = await repo.getBySlug("tempora-heritage-chronograph-40mm");
    expect(product).not.toBeNull();
    expect(product?.id).toBe("p-001");
    expect(product?.sku).toBe("VRN-CHR-402");
  });

  it("returns null for invalid or missing product slugs", async () => {
    expect(await repo.getBySlug("")).toBeNull();
    expect(await repo.getBySlug("non-existent-watch-999")).toBeNull();
    expect(await repo.getBySlug("../../../etc/passwd")).toBeNull();
  });

  it("formats product price and computes discount accurately", async () => {
    const product = (await repo.getBySlug("tempora-heritage-chronograph-40mm"))!;
    expect(formatINR(product.pricePaise)).toBe("₹1,45,000");
    expect(formatINR(product.mrpPaise)).toBe("₹1,65,000");
    expect(discountPercent(product.mrpPaise, product.pricePaise)).toBe(12);
  });

  it("maps local WebP image paths to actual files on disk", async () => {
    const chrono = (await repo.getBySlug("tempora-heritage-chronograph-40mm"))!;
    expect(chrono.images).toEqual(["/images/products/chronographs/chronograph_vrn_chr_402_1.webp"]);
    const single = (await repo.getBySlug("solstice-ultra-thin-38mm"))!;
    expect(single.images).toEqual(["/images/products/minimal-dress/minimal_dress_orr_drs_094_1.webp"]);

    const all = await repo.listProducts({ pageSize: 20 });
    for (const item of all.items) {
      expect(item.image).not.toBeNull();
      const filePath = path.join(process.cwd(), "public", item.image!.src);
      expect(fs.existsSync(filePath)).toBe(true);
    }

    const categories = await repo.listCategories();
    for (const cat of categories) {
      expect(cat.image).not.toBeNull();
      expect(fs.existsSync(path.join(process.cwd(), "public", cat.image!))).toBe(true);
    }

    for (const siteImg of [
      "/images/site/site_hero.webp",
      "/images/site/site_heritage.webp",
      "/images/site/site_lifestyle_1.webp",
      "/images/site/site_lifestyle_2.webp",
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), "public", siteImg))).toBe(true);
    }
  });

  it("selects related products excluding the current product", async () => {
    const product = (await repo.getBySlug("tempora-heritage-chronograph-40mm"))!;
    const related = await repo.listRelated(product, 4);
    expect(related.length).toBe(4);
    expect(related.some((r) => r.id === product.id)).toBe(false);
    expect(related.some((r) => r.brandName === product.brand.name)).toBe(true);
  });
});

describe("product details cart & wishlist integration", () => {
  it("adds valid multi-quantity to bag and stores only productId and quantity", async () => {
    const res = await addToCartAction("p-001", 3);
    expect(res).toEqual({ ok: true, count: 3 });
    expect(await getCartCount()).toBe(3);
    const lines = await getCartLines();
    expect(lines).toEqual([{ productId: "p-001", quantity: 3 }]);
  });

  it("rejects invalid quantities (zero, negative, non-integer, over max)", async () => {
    expect(await addToCartAction("p-001", 0)).toEqual({ ok: false, error: "Invalid quantity." });
    expect(await addToCartAction("p-001", -2)).toEqual({ ok: false, error: "Invalid quantity." });
    expect(await addToCartAction("p-001", 1.5)).toEqual({ ok: false, error: "Invalid quantity." });
    expect(await addToCartAction("p-001", 11)).toEqual({ ok: false, error: "Invalid quantity." });
    expect(await getCartCount()).toBe(0);
  });

  it("enforces available stock maximum (p-004 has 3 available)", async () => {
    expect(await addToCartAction("p-004", 4)).toEqual({ ok: false, error: "Only 3 available." });
    expect(await addToCartAction("p-004", 2)).toEqual({ ok: true, count: 2 });
    expect(await addToCartAction("p-004", 2)).toEqual({ ok: false, error: "Only 3 available." });
    expect(await getCartCount()).toBe(2);
  });

  it("rejects out-of-stock products", async () => {
    expect(await addToCartAction("p-010", 1)).toEqual({ ok: false, error: "Currently out of stock." });
  });

  it("toggles wishlist persistence for existing products", async () => {
    expect(await toggleWishlistAction("p-001")).toEqual({ ok: true, saved: true });
    expect(await getWishlistIds()).toEqual(["p-001"]);
    expect(await toggleWishlistAction("p-001")).toEqual({ ok: true, saved: false });
    expect(await getWishlistIds()).toEqual([]);
  });
});
