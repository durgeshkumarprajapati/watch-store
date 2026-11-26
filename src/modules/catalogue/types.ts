/** Catalogue domain types. All money values are integer paise. */

export type Gender = "men" | "women" | "unisex";
export type WatchType = "chronograph" | "automatic" | "dress" | "diver";
export type StrapMaterial = "steel" | "leather" | "mesh";
export type ProductBadge = "best_seller" | "new_arrival" | "limited";
export type Availability = "in_stock" | "low_stock" | "out_of_stock";

export interface Brand {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  /** Public path under /images/categories (may not exist yet; UI falls back to placeholder). */
  image: string | null;
}

export interface ProductSpecs {
  movement: string;
  caseDimensions: string;
  crystal: string;
  waterResistance: string;
  /** HSN code for GST; the tax rate itself is configured per product (gstRateBps). */
  hsn: string;
}

export interface Product {
  id: string;
  slug: string;
  sku: string;
  name: string;
  brand: Brand;
  categoryIds: string[];
  gender: Gender;
  watchType: WatchType;
  strapMaterial: StrapMaterial;
  dialAndStrap: string;
  description: string;
  specs: ProductSpecs;
  mrpPaise: number;
  pricePaise: number;
  /** GST rate in basis points (1800 = 18%). Configurable per product. */
  gstRateBps: number;
  badge: ProductBadge | null;
  isBestSeller: boolean;
  /** Public image paths (first is the primary image). */
  images: string[];
  stock: { available: number; reserved: number };
  warrantyYears: number | null;
  createdAt: string;
}

/** Light-weight view used by cards and lists. */
export interface ProductSummary {
  id: string;
  slug: string;
  sku: string;
  name: string;
  brandName: string;
  pricePaise: number;
  mrpPaise: number;
  /** Whole-number percent off MRP, 0 when not discounted. */
  discountPercent: number;
  badge: ProductBadge | null;
  image: { src: string; alt: string } | null;
  availability: Availability;
  gender: Gender;
}

export interface CategorySummary extends Category {
  productCount: number;
}

export interface BrandSummary extends Brand {
  slug: string;
  productCount: number;
}

export type CatalogueSort = "popularity" | "price-asc" | "price-desc" | "newest";

export interface CatalogueQuery {
  q?: string;
  categories?: string[];
  watchTypes?: WatchType[];
  brands?: string[];
  genders?: Gender[];
  strapMaterials?: StrapMaterial[];
  availability?: Availability[];
  minPricePaise?: number;
  maxPricePaise?: number;
  sort?: CatalogueSort;
  page?: number;
  pageSize?: number;
}

export interface CatalogueFacets {
  categories: CategorySummary[];
  brands: BrandSummary[];
  watchTypes: { value: WatchType; count: number }[];
  genders: { value: Gender; count: number }[];
  strapMaterials: { value: StrapMaterial; count: number }[];
  availability: { value: Availability; count: number }[];
  priceRangePaise: { min: number; max: number };
}

export interface CatalogueResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: CatalogueFacets;
}
