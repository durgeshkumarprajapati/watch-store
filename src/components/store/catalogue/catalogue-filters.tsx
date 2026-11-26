"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import {
  AVAILABILITY_LABELS,
  GENDER_LABELS,
  STRAP_MATERIAL_LABELS,
  WATCH_TYPE_LABELS,
  buildCatalogueHref,
  hasActiveFilters,
} from "@/modules/catalogue/query";
import type { CatalogueFacets, CatalogueQuery } from "@/modules/catalogue/types";

interface Props {
  query: CatalogueQuery;
  facets: CatalogueFacets;
  priceError: string | null;
  preservedParams: Record<string, string | string[]>;
}

function toggleValue<T extends string>(current: T[] | undefined, value: T): T[] | undefined {
  const set = new Set(current ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return set.size > 0 ? Array.from(set) : undefined;
}

function formatCompactINR(paise: number): string {
  const rupees = Math.round(paise / 100);
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2).replace(/\.00$/, "")}L`;
  if (rupees >= 1000) return `₹${Math.round(rupees / 1000)}k`;
  return `₹${rupees}`;
}

function FilterPanel({
  query,
  facets,
  priceError,
  preservedParams,
  onNavigate,
}: Props & { onNavigate?: () => void }) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(query.q ?? "");
  const [minInput, setMinInput] = useState(
    query.minPricePaise !== undefined ? String(Math.round(query.minPricePaise / 100)) : "",
  );
  const [maxInput, setMaxInput] = useState(
    query.maxPricePaise !== undefined ? String(Math.round(query.maxPricePaise / 100)) : "",
  );
  const [localPriceError, setLocalPriceError] = useState<string | null>(priceError);

  function pushQuery(next: CatalogueQuery) {
    router.push(buildCatalogueHref({ ...next, page: 1 }, preservedParams), { scroll: false });
    onNavigate?.();
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchValue.trim();
    pushQuery({ ...query, q: trimmed || undefined });
  }

  function handlePriceSubmit(e: React.FormEvent) {
    e.preventDefault();
    const minTrim = minInput.trim();
    const maxTrim = maxInput.trim();

    const minNum = minTrim === "" ? undefined : Number(minTrim);
    const maxNum = maxTrim === "" ? undefined : Number(maxTrim);

    if ((minNum !== undefined && (!Number.isFinite(minNum) || minNum < 0)) ||
        (maxNum !== undefined && (!Number.isFinite(maxNum) || maxNum < 0))) {
      setLocalPriceError("Enter valid non-negative prices.");
      return;
    }

    if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
      setLocalPriceError("Minimum price cannot exceed maximum price.");
      return;
    }

    setLocalPriceError(null);
    pushQuery({
      ...query,
      minPricePaise: minNum !== undefined ? Math.round(minNum * 100) : undefined,
      maxPricePaise: maxNum !== undefined ? Math.round(maxNum * 100) : undefined,
    });
  }

  const active = hasActiveFilters(query);
  const rangeDisplay = `${formatCompactINR(query.minPricePaise ?? facets.priceRangePaise.min)} – ${formatCompactINR(query.maxPricePaise ?? facets.priceRangePaise.max)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-outline pb-4">
        <h2 className="font-title text-title-md text-on-surface">Filters</h2>
        {active && (
          <button
            type="button"
            onClick={() => pushQuery({ sort: query.sort })}
            className="font-label text-label-sm uppercase tracking-wider text-secondary dark:text-primary hover:underline"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="relative flex items-center">
        <Icon name="search" size={18} className="text-on-surface-variant absolute left-3 pointer-events-none" />
        <input
          type="search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search model or SKU..."
          aria-label="Search model or SKU"
          className="w-full pl-9 pr-3 py-2 rounded bg-background border border-outline text-on-surface font-body text-body-md placeholder:text-on-surface-variant focus:border-primary focus-visible:ring-2 focus-visible:ring-primary outline-none"
        />
      </form>

      {/* Collection / Category */}
      <div className="flex flex-col gap-2.5">
        <h3 className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">Collection</h3>
        {facets.categories.map((cat) => {
          const checked = Boolean(query.categories?.includes(cat.slug) || query.categories?.includes(cat.id));
          return (
            <label key={cat.id} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => pushQuery({ ...query, categories: toggleValue(query.categories, cat.slug) })}
                className="rounded-sm border-outline text-primary accent-primary focus:ring-0"
              />
              <span className="font-body text-body-md text-on-surface">
                {cat.name} ({cat.productCount})
              </span>
            </label>
          );
        })}
      </div>

      {/* Watch Type (Subcategory) */}
      <div className="flex flex-col gap-2.5 border-t border-outline pt-5">
        <h3 className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">Watch Type</h3>
        {facets.watchTypes.map(({ value, count }) => {
          const checked = Boolean(query.watchTypes?.includes(value));
          return (
            <label key={value} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => pushQuery({ ...query, watchTypes: toggleValue(query.watchTypes, value) })}
                className="rounded-sm border-outline text-primary accent-primary focus:ring-0"
              />
              <span className="font-body text-body-md text-on-surface">
                {WATCH_TYPE_LABELS[value]} ({count})
              </span>
            </label>
          );
        })}
      </div>

      {/* Brand */}
      <div className="flex flex-col gap-2.5 border-t border-outline pt-5">
        <h3 className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">Brand</h3>
        {facets.brands.map((brand) => {
          const checked = Boolean(query.brands?.includes(brand.slug) || query.brands?.includes(brand.id));
          return (
            <label key={brand.id} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => pushQuery({ ...query, brands: toggleValue(query.brands, brand.slug) })}
                className="rounded-sm border-outline text-primary accent-primary focus:ring-0"
              />
              <span className="font-body text-body-md text-on-surface">
                {brand.name} ({brand.productCount})
              </span>
            </label>
          );
        })}
      </div>

      {/* Gender */}
      <div className="flex flex-col gap-2.5 border-t border-outline pt-5">
        <h3 className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">Gender</h3>
        {facets.genders.map(({ value, count }) => {
          const checked = Boolean(query.genders?.includes(value));
          return (
            <label key={value} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => pushQuery({ ...query, genders: toggleValue(query.genders, value) })}
                className="rounded-sm border-outline text-primary accent-primary focus:ring-0"
              />
              <span className="font-body text-body-md text-on-surface">
                {GENDER_LABELS[value]} ({count})
              </span>
            </label>
          );
        })}
      </div>

      {/* Strap Material */}
      <div className="flex flex-col gap-2.5 border-t border-outline pt-5">
        <h3 className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">Strap Material</h3>
        {facets.strapMaterials.map(({ value, count }) => {
          const checked = Boolean(query.strapMaterials?.includes(value));
          return (
            <label key={value} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => pushQuery({ ...query, strapMaterials: toggleValue(query.strapMaterials, value) })}
                className="rounded-sm border-outline text-primary accent-primary focus:ring-0"
              />
              <span className="font-body text-body-md text-on-surface">
                {STRAP_MATERIAL_LABELS[value]} ({count})
              </span>
            </label>
          );
        })}
      </div>

      {/* Availability */}
      <div className="flex flex-col gap-2.5 border-t border-outline pt-5">
        <h3 className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">Availability</h3>
        {facets.availability.map(({ value, count }) => {
          const checked = Boolean(query.availability?.includes(value));
          return (
            <label key={value} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => pushQuery({ ...query, availability: toggleValue(query.availability, value) })}
                className="rounded-sm border-outline text-primary accent-primary focus:ring-0"
              />
              <span className="font-body text-body-md text-on-surface">
                {AVAILABILITY_LABELS[value]} ({count})
              </span>
            </label>
          );
        })}
      </div>

      {/* Price Range */}
      <form onSubmit={handlePriceSubmit} className="flex flex-col gap-3 border-t border-outline pt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">Price Range</h3>
          <span className="font-mono text-mono-sm tabular-nums text-on-surface">{rangeDisplay}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="filter-min-price" className="sr-only">Minimum Price (INR)</label>
            <input
              id="filter-min-price"
              type="number"
              min={0}
              step={500}
              inputMode="numeric"
              placeholder="Min ₹"
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              className="w-full px-3 py-2 rounded bg-background border border-outline text-on-surface font-mono text-mono-sm placeholder:text-on-surface-variant focus:border-primary outline-none"
            />
          </div>
          <div>
            <label htmlFor="filter-max-price" className="sr-only">Maximum Price (INR)</label>
            <input
              id="filter-max-price"
              type="number"
              min={0}
              step={500}
              inputMode="numeric"
              placeholder="Max ₹"
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              className="w-full px-3 py-2 rounded bg-background border border-outline text-on-surface font-mono text-mono-sm placeholder:text-on-surface-variant focus:border-primary outline-none"
            />
          </div>
        </div>
        {localPriceError && (
          <p role="alert" className="font-body text-body-md text-error">
            {localPriceError}
          </p>
        )}
        <button
          type="submit"
          className="w-full py-2 px-4 rounded-sm border border-outline bg-surface-container text-on-surface font-label text-label-sm uppercase tracking-wider hover:border-primary transition-colors duration-state-change"
        >
          Apply Price
        </button>
      </form>
    </div>
  );
}

export function CatalogueSidebar(props: Props) {
  const panelKey = `${props.query.q ?? ""}-${props.query.minPricePaise ?? ""}-${props.query.maxPricePaise ?? ""}-${props.priceError ?? ""}`;
  return (
    <aside className="hidden lg:flex lg:col-span-3 bg-surface border border-outline rounded-md p-6 flex-col">
      <FilterPanel key={panelKey} {...props} />
    </aside>
  );
}

export function MobileFilterDrawer(props: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const activeCount =
    (props.query.q ? 1 : 0) +
    (props.query.categories?.length ?? 0) +
    (props.query.watchTypes?.length ?? 0) +
    (props.query.brands?.length ?? 0) +
    (props.query.genders?.length ?? 0) +
    (props.query.strapMaterials?.length ?? 0) +
    (props.query.availability?.length ?? 0) +
    (props.query.minPricePaise !== undefined || props.query.maxPricePaise !== undefined ? 1 : 0);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded border border-outline bg-surface text-on-surface font-label text-label-sm uppercase tracking-wider hover:border-primary transition-colors duration-state-change"
      >
        <Icon name="tune" size={18} />
        <span>Filters{activeCount > 0 ? ` (${activeCount})` : ""}</span>
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Catalogue Filters"
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-50 flex transition-opacity",
          open ? "opacity-100 visible duration-surface-enter" : "opacity-0 invisible duration-surface-exit pointer-events-none",
        )}
      >
        <div
          className="fixed inset-0 bg-band/60"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <div className="relative z-10 w-full max-w-sm bg-surface border-r border-outline h-full overflow-y-auto p-6 flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <button
              type="button"
              aria-label="Close Filters"
              onClick={() => setOpen(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <FilterPanel
            key={`${props.query.q ?? ""}-${props.query.minPricePaise ?? ""}-${props.query.maxPricePaise ?? ""}-${props.priceError ?? ""}`}
            {...props}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
