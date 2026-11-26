import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { buildCatalogueHref } from "@/modules/catalogue/query";
import type { CatalogueQuery } from "@/modules/catalogue/types";

export function CatalogueEmpty({
  query,
  priceError,
  preservedParams,
}: {
  query: CatalogueQuery;
  priceError: string | null;
  preservedParams: Record<string, string | string[]>;
}) {
  const resetHref = buildCatalogueHref({ sort: query.sort, page: 1 }, preservedParams);
  return (
    <div className="bg-surface border border-outline rounded-md p-10 text-center flex flex-col items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
        <Icon name="watch" size={28} />
      </div>
      <div className="flex flex-col gap-1.5 max-w-md">
        <h2 className="font-headline text-headline-md text-on-surface">No timepieces match your selection</h2>
        <p className="font-body text-body-md text-on-surface-variant">
          {priceError ?? "Try adjusting or clearing your active filters to explore the full collection."}
        </p>
      </div>
      <Link
        href={resetHref}
        className="px-6 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 transition-opacity duration-state-change"
      >
        Clear All Filters
      </Link>
    </div>
  );
}
