import "server-only";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { withCatalogueCache } from "../catalogue-cache";
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

const productInclude = {
  brand: true,
  categories: { select: { categoryId: true } },
  images: { orderBy: { sortOrder: "asc" as const } },
  stock: true,
} satisfies Prisma.ProductInclude;

type PrismaProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function mapProduct(row: PrismaProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    brand: { id: row.brand.id, name: row.brand.name },
    categoryIds: row.categories.map((c) => c.categoryId),
    gender: row.gender,
    watchType: row.watchType,
    strapMaterial: row.strapMaterial,
    dialAndStrap: row.dialAndStrap,
    description: row.description,
    specs: {
      movement: row.specMovement,
      caseDimensions: row.specCaseDimensions,
      crystal: row.specCrystal,
      waterResistance: row.specWaterResistance,
      hsn: row.specHsn,
    },
    mrpPaise: row.mrpPaise,
    pricePaise: row.pricePaise,
    gstRateBps: row.gstRateBps,
    badge: row.badge,
    isBestSeller: row.isBestSeller,
    images: row.images.map((i) => i.url),
    stock: {
      available: row.stock?.available ?? 0,
      reserved: row.stock?.reserved ?? 0,
    },
    warrantyYears: row.warrantyYears,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildFacets(
  allProducts: Product[],
  categories: { id: string; slug: string; name: string; image: string | null }[],
  brands: { id: string; name: string; slug: string }[],
): CatalogueFacets {
  const watchTypeOrder: WatchType[] = ["chronograph", "automatic", "dress", "diver"];
  const genderOrder: Gender[] = ["men", "women", "unisex"];
  const strapOrder: StrapMaterial[] = ["steel", "leather", "mesh"];
  const availabilityOrder: Availability[] = ["in_stock", "low_stock", "out_of_stock"];
  const prices = allProducts.map((p) => p.pricePaise);

  return {
    categories: categories.map((c) => ({
      ...c,
      productCount: allProducts.filter((p) => p.categoryIds.includes(c.id)).length,
    })),
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      productCount: allProducts.filter((p) => p.brand.id === b.id).length,
    })),
    watchTypes: watchTypeOrder.map((value) => ({
      value,
      count: allProducts.filter((p) => p.watchType === value).length,
    })),
    genders: genderOrder.map((value) => ({
      value,
      count: allProducts.filter((p) => p.gender === value).length,
    })),
    strapMaterials: strapOrder.map((value) => ({
      value,
      count: allProducts.filter((p) => p.strapMaterial === value).length,
    })),
    availability: availabilityOrder.map((value) => ({
      value,
      count: allProducts.filter((p) => availabilityOf(p) === value).length,
    })),
    priceRangePaise: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
  };
}

export const prismaProductRepository: ProductRepository = {
  async listCategories() {
    return withCatalogueCache(["catalogue-categories"], async () => {
      const prisma = getPrisma();
      const rows = await prisma.category.findMany({
        where: { isActive: true },
        orderBy: { id: "asc" },
        include: {
          _count: {
            select: {
              products: { where: { product: { isActive: true, brand: { isActive: true } } } },
            },
          },
        },
      });
      return rows.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        image: c.image,
        productCount: c._count.products,
      }));
    });
  },

  async listBestSellers({ gender, limit }) {
    return withCatalogueCache(
      ["catalogue-best-sellers", gender ?? "all", String(limit)],
      async () => {
        const prisma = getPrisma();
        const rows = await prisma.product.findMany({
          where: {
            isActive: true,
            brand: { isActive: true },
            isBestSeller: true,
            ...(gender ? { gender: { in: [gender, "unisex"] } } : {}),
          },
          include: productInclude,
          orderBy: { createdAt: "asc" },
          take: limit,
        });
        return rows.map((r) => toSummary(mapProduct(r)));
      },
    );
  },

  async listProducts(query: CatalogueQuery): Promise<CatalogueResult> {
    return withCatalogueCache(["catalogue-list", JSON.stringify(query)], async () => {
      const prisma = getPrisma();
      const [productRows, categoryRows, brandRows] = await Promise.all([
        prisma.product.findMany({
          where: { isActive: true, brand: { isActive: true } },
          include: productInclude,
        }),
        prisma.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
        prisma.brand.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
      ]);

      const allProducts = productRows.map(mapProduct);
      const facets = buildFacets(allProducts, categoryRows, brandRows);

      const filtered = allProducts.filter((p) => {
        if (query.q) {
          const needle = query.q.toLowerCase();
          const haystack = `${p.name} ${p.sku} ${p.brand.name} ${p.dialAndStrap}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        if (query.categories?.length) {
          const wanted = new Set(query.categories.map((c) => c.toLowerCase()));
          const matchedCatIds = categoryRows
            .filter((c) => wanted.has(c.slug.toLowerCase()) || wanted.has(c.id.toLowerCase()))
            .map((c) => c.id);
          if (!matchedCatIds.some((id) => p.categoryIds.includes(id))) return false;
        }
        if (query.watchTypes?.length && !query.watchTypes.includes(p.watchType)) return false;
        if (query.brands?.length) {
          const wanted = new Set(query.brands.map((b) => b.toLowerCase()));
          if (!wanted.has(p.brand.id.toLowerCase()) && !wanted.has(slugifyBrand(p.brand.name))) {
            return false;
          }
        }
        if (query.genders?.length && !query.genders.includes(p.gender)) return false;
        if (query.strapMaterials?.length && !query.strapMaterials.includes(p.strapMaterial)) return false;
        if (query.availability?.length && !query.availability.includes(availabilityOf(p))) return false;
        if (
          query.minPricePaise !== undefined &&
          query.maxPricePaise !== undefined &&
          query.minPricePaise > query.maxPricePaise
        ) {
          return false;
        }
        if (query.minPricePaise !== undefined && p.pricePaise < query.minPricePaise) return false;
        if (query.maxPricePaise !== undefined && p.pricePaise > query.maxPricePaise) return false;
        return true;
      });

      const sorted = [...filtered].sort((a, b) => {
        switch (query.sort) {
          case "price-asc":
            return a.pricePaise - b.pricePaise || a.id.localeCompare(b.id);
          case "price-desc":
            return b.pricePaise - a.pricePaise || a.id.localeCompare(b.id);
          case "newest":
            return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
          case "popularity":
          default: {
            if (a.isBestSeller !== b.isBestSeller) return a.isBestSeller ? -1 : 1;
            const aInStock = a.stock.available > 0 ? 1 : 0;
            const bInStock = b.stock.available > 0 ? 1 : 0;
            if (aInStock !== bInStock) return bInStock - aInStock;
            return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
          }
        }
      });

      const rawPageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const pageSize = Math.min(Math.max(1, Math.floor(rawPageSize)), MAX_PAGE_SIZE);
      const total = sorted.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
      const requestedPage = Number.isInteger(query.page) && (query.page ?? 0) >= 1 ? query.page! : 1;
      const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
      const start = (page - 1) * pageSize;

      return {
        items: total === 0 ? [] : sorted.slice(start, start + pageSize).map(toSummary),
        total,
        page,
        pageSize,
        totalPages,
        facets,
      };
    });
  },

  async listRelated(product, limit) {
    if (limit <= 0) return [];
    return withCatalogueCache(["catalogue-related", product.id, String(limit)], async () => {
      const prisma = getPrisma();
      const rows = await prisma.product.findMany({
        where: {
          isActive: true,
          brand: { isActive: true },
          id: { not: product.id },
          OR: [
            ...(product.categoryIds.length > 0
              ? [{ categories: { some: { categoryId: { in: product.categoryIds } } } }]
              : []),
            { brandId: product.brand.id },
          ],
        },
        include: productInclude,
        take: Math.max(limit * 3, 12),
      });

      let candidates = rows;
      if (candidates.length < limit) {
        const excludeIds = [product.id, ...candidates.map((r) => r.id)];
        const fallback = await prisma.product.findMany({
          where: { isActive: true, brand: { isActive: true }, id: { notIn: excludeIds } },
          include: productInclude,
          take: limit - candidates.length,
        });
        candidates = [...candidates, ...fallback];
      }

      const catSet = new Set(product.categoryIds);
      return candidates
        .map(mapProduct)
        .map((p) => {
          let score = 0;
          if (p.categoryIds.some((c) => catSet.has(c))) score += 2;
          if (p.brand.id === product.brand.id) score += 1;
          if (p.stock.available > 0) score += 1;
          return { p, score };
        })
        .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
        .slice(0, limit)
        .map(({ p }) => toSummary(p));
    });
  },

  async getByIds(ids) {
    if (ids.length === 0) return [];
    const prisma = getPrisma();
    const rows = await prisma.product.findMany({
      where: { id: { in: ids }, isActive: true, brand: { isActive: true } },
      include: productInclude,
    });
    return rows.map(mapProduct);
  },

  async getBySlug(slug) {
    if (!slug) return null;
    return withCatalogueCache(["catalogue-slug", slug], async () => {
      const prisma = getPrisma();
      const row = await prisma.product.findFirst({
        where: { slug, isActive: true, brand: { isActive: true } },
        include: productInclude,
      });
      return row ? mapProduct(row) : null;
    });
  },
};
