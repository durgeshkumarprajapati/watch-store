"use client";

import { useRouter } from "next/navigation";
import { SORT_OPTIONS, buildCatalogueHref } from "@/modules/catalogue/query";
import type { CatalogueQuery, CatalogueSort } from "@/modules/catalogue/types";

export function CatalogueSortSelect({
  query,
  preservedParams,
}: {
  query: CatalogueQuery;
  preservedParams: Record<string, string | string[]>;
}) {
  const router = useRouter();
  const currentSort = query.sort ?? "popularity";

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextSort = e.target.value as CatalogueSort;
    router.push(buildCatalogueHref({ ...query, sort: nextSort, page: 1 }, preservedParams), {
      scroll: false,
    });
  }

  return (
    <select
      aria-label="Sort products"
      value={currentSort}
      onChange={onChange}
      className="px-4 py-2.5 rounded bg-surface border border-outline text-on-surface font-body text-body-md focus:border-primary focus-visible:ring-2 focus-visible:ring-primary outline-none transition-colors duration-state-change"
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
