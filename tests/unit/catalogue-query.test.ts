import { describe, expect, it } from "vitest";
import { seedProductRepository as repo } from "@/modules/catalogue/seed/seed-product-repository";
import {
  buildCatalogueHref,
  hasActiveFilters,
  parseCatalogueSearchParams,
} from "@/modules/catalogue/query";

describe("catalogue filtering, sorting, and pagination", () => {
  it("1. filters by category", async () => {
    const res = await repo.listProducts({ categories: ["chronographs"], pageSize: 20 });
    expect(res.total).toBe(4);
    expect(res.items.every((p) => p.brandName === "Verrane Chrono")).toBe(true);
  });

  it("2. filters by subcategory (watchType)", async () => {
    const res = await repo.listProducts({ watchTypes: ["diver"], pageSize: 20 });
    expect(res.total).toBe(3);
    expect(res.items.map((p) => p.id).sort()).toEqual(["p-003", "p-009", "p-012"]);
  });

  it("3. filters by brand", async () => {
    const res = await repo.listProducts({ brands: ["orrin-studio"], pageSize: 20 });
    expect(res.total).toBe(3);
    expect(res.items.every((p) => p.brandName === "Orrin Studio")).toBe(true);
  });

  it("4. filters by minimum price", async () => {
    const res = await repo.listProducts({ minPricePaise: 14500000, pageSize: 20 });
    expect(res.total).toBe(3);
    expect(res.items.every((p) => p.pricePaise >= 14500000)).toBe(true);
  });

  it("5. filters by maximum price", async () => {
    const res = await repo.listProducts({ maxPricePaise: 6200000, pageSize: 20 });
    expect(res.total).toBe(3);
    expect(res.items.every((p) => p.pricePaise <= 6200000)).toBe(true);
  });

  it("6. combines category, subcategory, brand, gender, strap, and price filters", async () => {
    const res = await repo.listProducts({
      categories: ["womens-atelier"],
      watchTypes: ["diver"],
      brands: ["verrane-femme"],
      genders: ["women"],
      strapMaterials: ["steel"],
      minPricePaise: 8000000,
      maxPricePaise: 9000000,
      pageSize: 20,
    });
    expect(res.total).toBe(1);
    expect(res.items[0]?.id).toBe("p-012");
  });

  it("7. filters by availability", async () => {
    const out = await repo.listProducts({ availability: ["out_of_stock"], pageSize: 20 });
    expect(out.total).toBe(1);
    expect(out.items[0]?.id).toBe("p-010");

    const low = await repo.listProducts({ availability: ["low_stock"], pageSize: 20 });
    expect(low.total).toBe(1);
    expect(low.items[0]?.id).toBe("p-004");
  });

  it("8. sorts by price ascending", async () => {
    const res = await repo.listProducts({ sort: "price-asc", pageSize: 20 });
    const prices = res.items.map((p) => p.pricePaise);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("9. sorts by price descending", async () => {
    const res = await repo.listProducts({ sort: "price-desc", pageSize: 20 });
    const prices = res.items.map((p) => p.pricePaise);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  it("10. sorts by newest", async () => {
    const res = await repo.listProducts({ sort: "newest", pageSize: 20 });
    expect(res.items[0]?.id).toBe("p-012");
    expect(res.items[res.items.length - 1]?.id).toBe("p-001");
  });

  it("11. sorts by popularity (best sellers first, then in-stock)", async () => {
    const res = await repo.listProducts({ sort: "popularity", pageSize: 20 });
    const firstFourIds = new Set(res.items.slice(0, 4).map((p) => p.id));
    expect(firstFourIds).toEqual(new Set(["p-001", "p-002", "p-003", "p-004"]));
    expect(res.items[res.items.length - 1]?.availability).toBe("out_of_stock");
  });

  it("12. paginates results accurately", async () => {
    const p1 = await repo.listProducts({ page: 1, pageSize: 6 });
    const p2 = await repo.listProducts({ page: 2, pageSize: 6 });
    expect(p1.total).toBe(12);
    expect(p1.totalPages).toBe(2);
    expect(p1.page).toBe(1);
    expect(p1.items.length).toBe(6);
    expect(p2.page).toBe(2);
    expect(p2.items.length).toBe(6);
    const ids = new Set([...p1.items, ...p2.items].map((p) => p.id));
    expect(ids.size).toBe(12);
  });

  it("13. handles invalid and out-of-range page values safely", async () => {
    expect(parseCatalogueSearchParams({ page: "-3" }).query.page).toBe(1);
    expect(parseCatalogueSearchParams({ page: "abc" }).query.page).toBe(1);
    expect(parseCatalogueSearchParams({ page: "1.5" }).query.page).toBe(1);
    const clamped = await repo.listProducts({ page: 99, pageSize: 6 });
    expect(clamped.page).toBe(2);
    expect(clamped.items.length).toBe(6);
  });

  it("14. rejects invalid or negative price values", () => {
    const neg = parseCatalogueSearchParams({ minPrice: "-500" });
    expect(neg.query.minPricePaise).toBeUndefined();
    expect(neg.priceError).toBeTruthy();

    const nan = parseCatalogueSearchParams({ maxPrice: "not-a-number" });
    expect(nan.query.maxPricePaise).toBeUndefined();
    expect(nan.priceError).toBeTruthy();
  });

  it("15. handles minimum price greater than maximum price", async () => {
    const parsed = parseCatalogueSearchParams({ minPrice: "200000", maxPrice: "50000" });
    expect(parsed.priceError).toBe("Minimum price cannot exceed maximum price.");
    const res = await repo.listProducts(parsed.query);
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });

  it("16. handles unknown categories safely", async () => {
    const res = await repo.listProducts({ categories: ["non-existent-category"] });
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });

  it("17. handles unknown brands safely", async () => {
    const res = await repo.listProducts({ brands: ["unknown-brand"] });
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });

  it("18. handles empty search results", async () => {
    const res = await repo.listProducts({ q: "tourbillon-unicorn-999" });
    expect(res.total).toBe(0);
    expect(res.totalPages).toBe(0);
    expect(res.page).toBe(1);
    expect(res.items).toEqual([]);
  });

  it("19. clears filters while preserving sort and unrelated query params", () => {
    const parsed = parseCatalogueSearchParams({
      category: "chronographs",
      brand: "verrane-chrono",
      sort: "price-asc",
      utm_source: "newsletter",
      page: "2",
    });
    expect(hasActiveFilters(parsed.query)).toBe(true);
    const clearedHref = buildCatalogueHref({ sort: parsed.query.sort, page: 1 }, parsed.preservedParams);
    expect(clearedHref).toBe("/products?utm_source=newsletter&sort=price-asc");
  });

  it("20. resets pagination when filters change", () => {
    const parsed = parseCatalogueSearchParams({
      category: "chronographs",
      page: "2",
    });
    const nextHref = buildCatalogueHref({ ...parsed.query, genders: ["men"], page: 1 }, parsed.preservedParams);
    expect(nextHref).not.toContain("page=2");
    expect(nextHref).toContain("gender=men");
  });
});
