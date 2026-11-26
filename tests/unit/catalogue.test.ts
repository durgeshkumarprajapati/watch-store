import { describe, expect, it } from "vitest";
import { devBrands, devCategories, devProducts } from "@/modules/catalogue/seed/dev-catalogue";
import { seedProductRepository as repo } from "@/modules/catalogue/seed/seed-product-repository";
import { availabilityOf, discountPercent, toSummary } from "@/modules/catalogue/summary";
import { formatINR } from "@/lib/format";

describe("price helpers", () => {
  it("matches the discount percentages shown in the Stitch design", () => {
    expect(discountPercent(16500000, 14500000)).toBe(12);
    expect(discountPercent(9800000, 8850000)).toBe(10);
    expect(discountPercent(13200000, 11800000)).toBe(11);
    expect(discountPercent(6200000, 5400000)).toBe(13);
  });
  it("returns 0 when not discounted or MRP invalid", () => {
    expect(discountPercent(19200000, 19200000)).toBe(0);
    expect(discountPercent(0, 100)).toBe(0);
  });
  it("formats integer paise with Indian grouping", () => {
    expect(formatINR(14500000)).toBe("₹1,45,000");
    expect(formatINR(8850000)).toBe("₹88,500");
    expect(formatINR(12288136, { decimals: true })).toBe("₹1,22,881.36");
  });
});

describe("availability", () => {
  it("derives states from stock", () => {
    expect(availabilityOf({ stock: { available: 0, reserved: 0 } })).toBe("out_of_stock");
    expect(availabilityOf({ stock: { available: 3, reserved: 1 } })).toBe("low_stock");
    expect(availabilityOf({ stock: { available: 18, reserved: 3 } })).toBe("in_stock");
  });
});

describe("dev seed integrity", () => {
  it("has unique ids, slugs and SKUs", () => {
    for (const key of ["id", "slug", "sku"] as const) {
      const values = devProducts.map((p) => p[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });
  it("only references existing categories and brands, with integer paise", () => {
    const cats = new Set(devCategories.map((c) => c.id));
    const brands = new Set(devBrands.map((b) => b.id));
    for (const p of devProducts) {
      expect(p.categoryIds.length).toBeGreaterThan(0);
      p.categoryIds.forEach((id) => expect(cats.has(id)).toBe(true));
      expect(brands.has(p.brand.id)).toBe(true);
      expect(Number.isInteger(p.pricePaise) && Number.isInteger(p.mrpPaise)).toBe(true);
      expect(p.pricePaise).toBeLessThanOrEqual(p.mrpPaise);
    }
  });
  it("contains no brand names from the original reference design", () => {
    const blob = JSON.stringify([devBrands, devCategories, devProducts]).toLowerCase();
    expect(blob).not.toContain("aurelia");
    expect(blob).not.toContain("vespera");
    expect(blob).not.toContain("chronomaster");
  });
});

describe("seed repository", () => {
  it("computes category counts from products", async () => {
    const cats = await repo.listCategories();
    for (const c of cats) {
      expect(c.productCount).toBe(devProducts.filter((p) => p.categoryIds.includes(c.id)).length);
    }
  });
  it("filters best sellers by gender (unisex included) and honours the limit", async () => {
    const all = await repo.listBestSellers({ limit: 4 });
    expect(all.length).toBe(4);
    const women = await repo.listBestSellers({ gender: "women", limit: 4 });
    expect(women.every((p) => p.gender === "women" || p.gender === "unisex")).toBe(true);
    expect((await repo.listBestSellers({ limit: 2 })).length).toBe(2);
  });
  it("looks products up by id and slug", async () => {
    expect((await repo.getByIds(["p-001", "nope"])).map((p) => p.id)).toEqual(["p-001"]);
    expect(await repo.getBySlug("does-not-exist")).toBeNull();
    expect(toSummary(devProducts[0]!).discountPercent).toBe(12);
  });
});
