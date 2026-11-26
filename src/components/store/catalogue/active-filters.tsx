"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import {
  AVAILABILITY_LABELS,
  GENDER_LABELS,
  STRAP_MATERIAL_LABELS,
  WATCH_TYPE_LABELS,
  buildCatalogueHref,
  hasActiveFilters,
} from "@/modules/catalogue/query";
import type { CatalogueFacets, CatalogueQuery } from "@/modules/catalogue/types";

interface FilterChip {
  key: string;
  label: string;
  href: string;
}

export function ActiveFilters({
  query,
  facets,
  preservedParams,
}: {
  query: CatalogueQuery;
  facets: CatalogueFacets;
  preservedParams: Record<string, string | string[]>;
}) {
  if (!hasActiveFilters(query)) return null;

  const chips: FilterChip[] = [];

  if (query.q) {
    chips.push({
      key: `q-${query.q}`,
      label: `Search: "${query.q}"`,
      href: buildCatalogueHref({ ...query, q: undefined, page: 1 }, preservedParams),
    });
  }

  for (const catSlug of query.categories ?? []) {
    const cat = facets.categories.find((c) => c.slug === catSlug || c.id === catSlug);
    chips.push({
      key: `cat-${catSlug}`,
      label: `Collection: ${cat?.name ?? catSlug}`,
      href: buildCatalogueHref(
        {
          ...query,
          categories: query.categories?.filter((c) => c !== catSlug),
          page: 1,
        },
        preservedParams,
      ),
    });
  }

  for (const wt of query.watchTypes ?? []) {
    chips.push({
      key: `type-${wt}`,
      label: `Type: ${WATCH_TYPE_LABELS[wt]}`,
      href: buildCatalogueHref(
        {
          ...query,
          watchTypes: query.watchTypes?.filter((t) => t !== wt),
          page: 1,
        },
        preservedParams,
      ),
    });
  }

  for (const brandSlug of query.brands ?? []) {
    const brand = facets.brands.find((b) => b.slug === brandSlug || b.id === brandSlug);
    chips.push({
      key: `brand-${brandSlug}`,
      label: `Brand: ${brand?.name ?? brandSlug}`,
      href: buildCatalogueHref(
        {
          ...query,
          brands: query.brands?.filter((b) => b !== brandSlug),
          page: 1,
        },
        preservedParams,
      ),
    });
  }

  for (const gender of query.genders ?? []) {
    chips.push({
      key: `gender-${gender}`,
      label: `Gender: ${GENDER_LABELS[gender]}`,
      href: buildCatalogueHref(
        {
          ...query,
          genders: query.genders?.filter((g) => g !== gender),
          page: 1,
        },
        preservedParams,
      ),
    });
  }

  for (const strap of query.strapMaterials ?? []) {
    chips.push({
      key: `strap-${strap}`,
      label: `Strap: ${STRAP_MATERIAL_LABELS[strap]}`,
      href: buildCatalogueHref(
        {
          ...query,
          strapMaterials: query.strapMaterials?.filter((s) => s !== strap),
          page: 1,
        },
        preservedParams,
      ),
    });
  }

  for (const avail of query.availability ?? []) {
    chips.push({
      key: `avail-${avail}`,
      label: `Availability: ${AVAILABILITY_LABELS[avail]}`,
      href: buildCatalogueHref(
        {
          ...query,
          availability: query.availability?.filter((a) => a !== avail),
          page: 1,
        },
        preservedParams,
      ),
    });
  }

  if (query.minPricePaise !== undefined) {
    const rupees = Math.round(query.minPricePaise / 100).toLocaleString("en-IN");
    chips.push({
      key: "minPrice",
      label: `Min: ₹${rupees}`,
      href: buildCatalogueHref({ ...query, minPricePaise: undefined, page: 1 }, preservedParams),
    });
  }

  if (query.maxPricePaise !== undefined) {
    const rupees = Math.round(query.maxPricePaise / 100).toLocaleString("en-IN");
    chips.push({
      key: "maxPrice",
      label: `Max: ₹${rupees}`,
      href: buildCatalogueHref({ ...query, maxPricePaise: undefined, page: 1 }, preservedParams),
    });
  }

  const clearAllHref = buildCatalogueHref({ sort: query.sort, page: 1 }, preservedParams);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6" aria-label="Active filters">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          scroll={false}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-surface border border-outline text-on-surface font-body text-body-md hover:border-primary transition-colors duration-state-change"
        >
          <span>{chip.label}</span>
          <Icon name="close" size={14} className="text-on-surface-variant" />
        </Link>
      ))}
      <Link
        href={clearAllHref}
        scroll={false}
        className="font-label text-label-sm uppercase tracking-wider text-secondary dark:text-primary hover:underline px-2 py-1"
      >
        Clear All
      </Link>
    </div>
  );
}
