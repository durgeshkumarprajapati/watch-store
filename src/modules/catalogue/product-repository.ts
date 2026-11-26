import type { CatalogueQuery, CatalogueResult, CategorySummary, Gender, Product, ProductSummary } from "./types";

/**
 * Catalogue data access contract. The UI depends ONLY on this interface.
 * Phase 4 replaces the development seed implementation with a Prisma one.
 */
export interface ProductRepository {
  listCategories(): Promise<CategorySummary[]>;
  listBestSellers(opts: { gender?: Exclude<Gender, "unisex">; limit: number }): Promise<ProductSummary[]>;
  listProducts(query: CatalogueQuery): Promise<CatalogueResult>;
  listRelated(product: Pick<Product, "id" | "categoryIds" | "brand">, limit: number): Promise<ProductSummary[]>;
  getByIds(ids: string[]): Promise<Product[]>;
  getBySlug(slug: string): Promise<Product | null>;
}
