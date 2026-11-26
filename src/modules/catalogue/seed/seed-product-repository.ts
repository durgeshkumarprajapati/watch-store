import type { ProductRepository } from "../product-repository";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, slugifyBrand } from "../query";
import { availabilityOf, toSummary } from "../summary";
import type {
  Availability,
  CatalogueFacets,
  CatalogueQuery,
  CatalogueResult,
  Gender,
  Product,
  StrapMaterial,
  WatchType,
} from "../types";
import { devBrands, devCategories, devProducts } from "./dev-catalogue";

function computeFacets(): CatalogueFacets {
  const categories = devCategories.map((c) => ({
    ...c,
    productCount: devProducts.filter((p) => p.categoryIds.includes(c.id)).length,
  }));

  const brands = devBrands.map((b) => ({
    ...b,
    slug: slugifyBrand(b.name),
    productCount: devProducts.filter((p) => p.brand.id === b.id).length,
  }));

  const watchTypeOrder: WatchType[] = ["chronograph", "automatic", "dress", "diver"];
  const watchTypes = watchTypeOrder.map((value) => ({
    value,
    count: devProducts.filter((p) => p.watchType === value).length,
  }));

  const genderOrder: Gender[] = ["men", "women", "unisex"];
  const genders = genderOrder.map((value) => ({
    value,
    count: devProducts.filter((p) => p.gender === value).length,
  }));

  const strapOrder: StrapMaterial[] = ["steel", "leather", "mesh"];
  const strapMaterials = strapOrder.map((value) => ({
    value,
    count: devProducts.filter((p) => p.strapMaterial === value).length,
  }));

  const availabilityOrder: Availability[] = ["in_stock", "low_stock", "out_of_stock"];
  const availability = availabilityOrder.map((value) => ({
    value,
    count: devProducts.filter((p) => availabilityOf(p) === value).length,
  }));

  const prices = devProducts.map((p) => p.pricePaise);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;

  return {
    categories,
    brands,
    watchTypes,
    genders,
    strapMaterials,
    availability,
    priceRangePaise: { min, max },
  };
}

function matchesQuery(p: Product, query: CatalogueQuery): boolean {
  if (query.q) {
    const needle = query.q.toLowerCase();
    const haystack = `${p.name} ${p.sku} ${p.brand.name} ${p.dialAndStrap}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  if (query.categories?.length) {
    const wantedSlugs = new Set(query.categories.map((c) => c.toLowerCase()));
    const matchedCatIds = devCategories
      .filter((c) => wantedSlugs.has(c.slug.toLowerCase()) || wantedSlugs.has(c.id.toLowerCase()))
      .map((c) => c.id);
    if (!matchedCatIds.some((id) => p.categoryIds.includes(id))) return false;
  }

  if (query.watchTypes?.length && !query.watchTypes.includes(p.watchType)) {
    return false;
  }

  if (query.brands?.length) {
    const wantedBrands = new Set(query.brands.map((b) => b.toLowerCase()));
    const brandSlug = slugifyBrand(p.brand.name);
    if (!wantedBrands.has(p.brand.id.toLowerCase()) && !wantedBrands.has(brandSlug)) {
      return false;
    }
  }

  if (query.genders?.length && !query.genders.includes(p.gender)) {
    return false;
  }

  if (query.strapMaterials?.length && !query.strapMaterials.includes(p.strapMaterial)) {
    return false;
  }

  if (query.availability?.length && !query.availability.includes(availabilityOf(p))) {
    return false;
  }

  if (
    query.minPricePaise !== undefined &&
    query.maxPricePaise !== undefined &&
    query.minPricePaise > query.maxPricePaise
  ) {
    return false;
  }

  if (query.minPricePaise !== undefined && p.pricePaise < query.minPricePaise) {
    return false;
  }

  if (query.maxPricePaise !== undefined && p.pricePaise > query.maxPricePaise) {
    return false;
  }

  return true;
}

function sortProducts(items: Product[], sort: CatalogueQuery["sort"]): Product[] {
  const copy = [...items];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => a.pricePaise - b.pricePaise || a.id.localeCompare(b.id));
    case "price-desc":
      return copy.sort((a, b) => b.pricePaise - a.pricePaise || a.id.localeCompare(b.id));
    case "newest":
      return copy.sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id),
      );
    case "popularity":
    default:
      return copy.sort((a, b) => {
        if (a.isBestSeller !== b.isBestSeller) return a.isBestSeller ? -1 : 1;
        const aInStock = a.stock.available > 0 ? 1 : 0;
        const bInStock = b.stock.available > 0 ? 1 : 0;
        if (aInStock !== bInStock) return bInStock - aInStock;
        return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
      });
  }
}

/** Development-only implementation backed by static seed data. */
export const seedProductRepository: ProductRepository = {
  async listCategories() {
    return devCategories.map((c) => ({
      ...c,
      productCount: devProducts.filter((p) => p.categoryIds.includes(c.id)).length,
    }));
  },
  async listBestSellers({ gender, limit }) {
    return devProducts
      .filter((p) => p.isBestSeller)
      .filter((p) => !gender || p.gender === gender || p.gender === "unisex")
      .slice(0, limit)
      .map(toSummary);
  },
  async listProducts(query: CatalogueQuery): Promise<CatalogueResult> {
    const facets = computeFacets();
    const filtered = sortProducts(
      devProducts.filter((p) => matchesQuery(p, query)),
      query.sort,
    );

    const rawPageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(Math.max(1, Math.floor(rawPageSize)), MAX_PAGE_SIZE);
    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const requestedPage = Number.isInteger(query.page) && (query.page ?? 0) >= 1 ? query.page! : 1;
    const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

    const start = (page - 1) * pageSize;
    const items = total === 0 ? [] : filtered.slice(start, start + pageSize).map(toSummary);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      facets,
    };
  },
  async listRelated(product, limit) {
    const catSet = new Set(product.categoryIds);
    return devProducts
      .filter((p) => p.id !== product.id)
      .map((p) => {
        let score = 0;
        if (p.categoryIds.some((c) => catSet.has(c))) score += 2;
        if (p.brand.id === product.brand.id) score += 1;
        if (p.stock.available > 0) score += 1;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
      .slice(0, Math.max(0, limit))
      .map(({ p }) => toSummary(p));
  },
  async getByIds(ids) {
    const wanted = new Set(ids);
    return devProducts.filter((p) => wanted.has(p.id));
  },
  async getBySlug(slug) {
    return devProducts.find((p) => p.slug === slug) ?? null;
  },
};
