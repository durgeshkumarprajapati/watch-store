import type { Availability, CatalogueQuery, CatalogueSort, Gender, StrapMaterial, WatchType } from "./types";

export const DEFAULT_PAGE_SIZE = 6;
export const MAX_PAGE_SIZE = 48;

export const WATCH_TYPE_LABELS: Record<WatchType, string> = {
  chronograph: "Chronograph",
  automatic: "Automatic Analog",
  dress: "Minimal Dress",
  diver: "Diver & Sport",
};

export const GENDER_LABELS: Record<Gender, string> = {
  men: "Men's",
  women: "Women's",
  unisex: "Unisex",
};

export const STRAP_MATERIAL_LABELS: Record<StrapMaterial, string> = {
  steel: "Stainless Steel",
  leather: "Italian Calfskin Leather",
  mesh: "Gold Milanese Mesh",
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
};

export const SORT_OPTIONS: { value: CatalogueSort; label: string }[] = [
  { value: "popularity", label: "Sort: Featured & Popular" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest Arrivals" },
];

export const KNOWN_CATALOGUE_PARAMS = new Set([
  "q",
  "category",
  "type",
  "subcategory",
  "brand",
  "gender",
  "strap",
  "availability",
  "minPrice",
  "maxPrice",
  "sort",
  "page",
]);

export function slugifyBrand(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toStringList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((item) => item.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
}

function toSingleString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

const VALID_WATCH_TYPES = new Set<WatchType>(["chronograph", "automatic", "dress", "diver"]);
const VALID_GENDERS = new Set<Gender>(["men", "women", "unisex"]);
const VALID_STRAPS = new Set<StrapMaterial>(["steel", "leather", "mesh"]);

function normalizeAvailability(raw: string): Availability | null {
  const norm = raw.toLowerCase().replace(/-/g, "_");
  if (norm === "in_stock" || norm === "low_stock" || norm === "out_of_stock") return norm;
  return null;
}

function parseSort(raw: string | undefined): CatalogueSort {
  if (!raw) return "popularity";
  const v = raw.toLowerCase().trim();
  if (v === "price-asc" || v === "price-desc") return v;
  if (v === "new" || v === "newest") return "newest";
  return "popularity";
}

function parsePositiveRupees(raw: string | undefined): { paise?: number; invalid: boolean } {
  if (raw === undefined || raw.trim() === "") return { invalid: false };
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return { invalid: true };
  return { paise: Math.round(num * 100), invalid: false };
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1) return 1;
  return num;
}

export interface ParsedCatalogueParams {
  query: CatalogueQuery;
  priceError: string | null;
  preservedParams: Record<string, string | string[]>;
}

export function parseCatalogueSearchParams(
  raw: Record<string, string | string[] | undefined>,
): ParsedCatalogueParams {
  const qRaw = toSingleString(raw.q)?.trim();
  const q = qRaw ? qRaw.slice(0, 100) : undefined;

  const categories = Array.from(new Set(toStringList(raw.category).map((s) => s.toLowerCase())));

  const rawTypes = [...toStringList(raw.type), ...toStringList(raw.subcategory)];
  const watchTypes = Array.from(
    new Set(
      rawTypes
        .map((s) => s.toLowerCase() as WatchType)
        .filter((s) => VALID_WATCH_TYPES.has(s)),
    ),
  );

  const brands = Array.from(new Set(toStringList(raw.brand).map((s) => s.toLowerCase())));

  const genders = Array.from(
    new Set(
      toStringList(raw.gender)
        .map((s) => s.toLowerCase() as Gender)
        .filter((s) => VALID_GENDERS.has(s)),
    ),
  );

  const strapMaterials = Array.from(
    new Set(
      toStringList(raw.strap)
        .map((s) => s.toLowerCase() as StrapMaterial)
        .filter((s) => VALID_STRAPS.has(s)),
    ),
  );

  const availability = Array.from(
    new Set(
      toStringList(raw.availability)
        .map(normalizeAvailability)
        .filter((v): v is Availability => v !== null),
    ),
  );

  const minParsed = parsePositiveRupees(toSingleString(raw.minPrice));
  const maxParsed = parsePositiveRupees(toSingleString(raw.maxPrice));

  let priceError: string | null = null;
  if (minParsed.invalid || maxParsed.invalid) {
    priceError = "Price filters must be valid non-negative numbers.";
  } else if (
    minParsed.paise !== undefined &&
    maxParsed.paise !== undefined &&
    minParsed.paise > maxParsed.paise
  ) {
    priceError = "Minimum price cannot exceed maximum price.";
  }

  const sort = parseSort(toSingleString(raw.sort));
  const page = parsePage(toSingleString(raw.page));

  const preservedParams: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_CATALOGUE_PARAMS.has(k) && v !== undefined) {
      preservedParams[k] = v;
    }
  }

  return {
    query: {
      q,
      categories: categories.length ? categories : undefined,
      watchTypes: watchTypes.length ? watchTypes : undefined,
      brands: brands.length ? brands : undefined,
      genders: genders.length ? genders : undefined,
      strapMaterials: strapMaterials.length ? strapMaterials : undefined,
      availability: availability.length ? availability : undefined,
      minPricePaise: minParsed.paise,
      maxPricePaise: maxParsed.paise,
      sort,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    },
    priceError,
    preservedParams,
  };
}

function appendList(params: URLSearchParams, key: string, values: string[] | undefined) {
  if (!values?.length) return;
  for (const v of values) params.append(key, v);
}

export function buildCatalogueHref(
  query: CatalogueQuery,
  preservedParams?: Record<string, string | string[]>,
): string {
  const params = new URLSearchParams();

  if (preservedParams) {
    for (const [k, v] of Object.entries(preservedParams)) {
      if (Array.isArray(v)) {
        for (const item of v) params.append(k, item);
      } else {
        params.set(k, v);
      }
    }
  }

  if (query.q) params.set("q", query.q);
  appendList(params, "category", query.categories);
  appendList(params, "type", query.watchTypes);
  appendList(params, "brand", query.brands);
  appendList(params, "gender", query.genders);
  appendList(params, "strap", query.strapMaterials);
  appendList(
    params,
    "availability",
    query.availability?.map((a) => a.replace(/_/g, "-")),
  );

  if (query.minPricePaise !== undefined) {
    params.set("minPrice", String(Math.round(query.minPricePaise / 100)));
  }
  if (query.maxPricePaise !== undefined) {
    params.set("maxPrice", String(Math.round(query.maxPricePaise / 100)));
  }
  if (query.sort && query.sort !== "popularity") {
    params.set("sort", query.sort === "newest" ? "new" : query.sort);
  }
  if (query.page && query.page > 1) {
    params.set("page", String(query.page));
  }

  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

export function hasActiveFilters(query: CatalogueQuery): boolean {
  return Boolean(
    query.q ||
      query.categories?.length ||
      query.watchTypes?.length ||
      query.brands?.length ||
      query.genders?.length ||
      query.strapMaterials?.length ||
      query.availability?.length ||
      query.minPricePaise !== undefined ||
      query.maxPricePaise !== undefined,
  );
}
