import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ProductCard } from "@/components/store/product-card";
import { ActiveFilters } from "@/components/store/catalogue/active-filters";
import { CatalogueEmpty } from "@/components/store/catalogue/catalogue-empty";
import { CatalogueSidebar, MobileFilterDrawer } from "@/components/store/catalogue/catalogue-filters";
import { CataloguePagination } from "@/components/store/catalogue/catalogue-pagination";
import { CatalogueSortSelect } from "@/components/store/catalogue/catalogue-sort";
import { getProductRepository } from "@/modules/catalogue";
import { parseCatalogueSearchParams } from "@/modules/catalogue/query";
import { getWishlistIds } from "@/modules/wishlist/wishlist-store";

export const metadata: Metadata = {
  title: "Timepieces Catalogue",
  description: "Explore mechanical chronographs, minimal dress watches, automatic divers, and women's atelier pieces.",
};

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const { query, priceError, preservedParams } = parseCatalogueSearchParams(rawParams);

  const repo = getProductRepository();
  const [result, wishlist] = await Promise.all([repo.listProducts(query), getWishlistIds()]);
  const saved = new Set(wishlist);

  const countLabel = `Showing ${result.items.length} of ${result.total} ${result.total === 1 ? "Timepiece" : "Timepieces"}`;

  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-8 lg:py-10">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-on-surface-variant font-body text-body-md mb-6">
        <Link href="/" className="hover:text-secondary dark:hover:text-primary transition-colors duration-state-change">
          Home
        </Link>
        <Icon name="chevron_right" size={16} />
        <span className="text-on-surface font-semibold">All Timepieces</span>
      </nav>

      {/* Page Header & Sort Bar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-outline mb-8">
        <div>
          <h1 className="font-headline text-display-md-mobile lg:text-display-md text-on-background">
            The Horology Catalogue
          </h1>
          <p className="font-body text-body-lg text-on-surface-variant mt-2 max-w-2xl">
            Explore Swiss-regulated automatic chronographs, minimalist dress watches, and precision quartz instruments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:gap-4">
          <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums">{countLabel}</span>
          <MobileFilterDrawer
            query={query}
            facets={result.facets}
            priceError={priceError}
            preservedParams={preservedParams}
          />
          <CatalogueSortSelect query={query} preservedParams={preservedParams} />
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <CatalogueSidebar
          query={query}
          facets={result.facets}
          priceError={priceError}
          preservedParams={preservedParams}
        />

        <div className="lg:col-span-9 flex flex-col gap-6">
          <ActiveFilters
            query={query}
            facets={result.facets}
            preservedParams={preservedParams}
          />

          {result.items.length === 0 ? (
            <CatalogueEmpty
              query={query}
              priceError={priceError}
              preservedParams={preservedParams}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 items-stretch">
              {result.items.map((product) => (
                <ProductCard key={product.id} product={product} saved={saved.has(product.id)} />
              ))}
            </div>
          )}

          <CataloguePagination
            query={query}
            page={result.page}
            totalPages={result.totalPages}
            preservedParams={preservedParams}
          />
        </div>
      </div>
    </div>
  );
}
