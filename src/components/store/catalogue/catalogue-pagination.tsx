import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { buildCatalogueHref } from "@/modules/catalogue/query";
import type { CatalogueQuery } from "@/modules/catalogue/types";

export function CataloguePagination({
  query,
  page,
  totalPages,
  preservedParams,
}: {
  query: CatalogueQuery;
  page: number;
  totalPages: number;
  preservedParams: Record<string, string | string[]>;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const btnBase =
    "w-10 h-10 rounded flex items-center justify-center font-mono text-mono-sm transition-colors duration-state-change";

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-4">
      {page > 1 ? (
        <Link
          href={buildCatalogueHref({ ...query, page: page - 1 }, preservedParams)}
          aria-label="Previous page"
          className={cn(btnBase, "border border-outline bg-surface text-on-surface hover:border-primary")}
        >
          <Icon name="chevron_left" size={18} />
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={cn(btnBase, "border border-outline bg-surface text-on-surface-variant opacity-40 pointer-events-none")}
        >
          <Icon name="chevron_left" size={18} />
        </span>
      )}

      {pages.map((p) => {
        const active = p === page;
        return (
          <Link
            key={p}
            href={buildCatalogueHref({ ...query, page: p }, preservedParams)}
            aria-current={active ? "page" : undefined}
            className={cn(
              btnBase,
              active
                ? "bg-primary text-on-primary"
                : "border border-outline bg-surface text-on-surface hover:border-primary",
            )}
          >
            {p}
          </Link>
        );
      })}

      {page < totalPages ? (
        <Link
          href={buildCatalogueHref({ ...query, page: page + 1 }, preservedParams)}
          aria-label="Next page"
          className={cn(btnBase, "border border-outline bg-surface text-on-surface hover:border-primary")}
        >
          <Icon name="chevron_right" size={18} />
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={cn(btnBase, "border border-outline bg-surface text-on-surface-variant opacity-40 pointer-events-none")}
        >
          <Icon name="chevron_right" size={18} />
        </span>
      )}
    </nav>
  );
}
