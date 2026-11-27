import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { MediaImage } from "@/components/ui/media-image";
import { StaticMediaImage } from "@/components/ui/static-media-image";
import type { ProductBadge, ProductSummary } from "@/modules/catalogue/types";
import { AddToBagButton } from "./add-to-bag-button";
import { Price } from "./price";
import { WishlistButton } from "./wishlist-button";

const badgeMeta: Record<ProductBadge, { label: string; tone: "secondary" | "primary" }> = {
  best_seller: { label: "Best Seller", tone: "secondary" },
  new_arrival: { label: "New Arrival", tone: "primary" },
  limited: { label: "Limited", tone: "secondary" },
};

/** Vertical card (Stitch "card-action"). */
export function ProductCard({ product, saved }: { product: ProductSummary; saved: boolean }) {
  const badge = product.badge ? badgeMeta[product.badge] : null;
  const href = `/product/${product.slug}`;
  return (
    <article className="group bg-surface border border-outline rounded overflow-hidden flex flex-col h-full transition-[transform,box-shadow] duration-surface-enter hover:-translate-y-1 hover:shadow-ambient">
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
          <StaticMediaImage
            src={product.image?.src ?? null}
            alt={product.image?.alt ?? product.name}
            sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw"
            className="aspect-[4/5]"
            imageClassName="transition-transform duration-surface-enter group-hover:scale-105"
          />
        </Link>
        {badge && <Badge tone={badge.tone} className="absolute top-3 left-3 px-2.5 py-1">{badge.label}</Badge>}
        <WishlistButton productId={product.id} saved={saved} />
      </div>
      <div className="p-5 flex flex-col gap-1.5 flex-1">
        <span className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">{product.brandName}</span>
        <h3 className="font-title text-title-md text-on-surface">
          <Link href={href} className="hover:text-primary transition-colors duration-state-change">{product.name}</Link>
        </h3>
        <div className="mt-auto pt-2"><Price product={product} /></div>
      </div>
      <footer className="px-5 pb-5 flex items-center gap-2">
        <AddToBagButton
          productId={product.id}
          soldOut={product.availability === "out_of_stock"}
          className="flex-1 py-2.5 px-4 text-label-lg"
        />
        <Link
          href={href}
          aria-label={`View ${product.name}`}
          className="py-2.5 px-3 rounded-sm border border-outline text-on-surface hover:bg-surface-container transition-colors duration-state-change"
        >
          <Icon name="visibility" size={18} />
        </Link>
      </footer>
    </article>
  );
}

/** Compact horizontal card used on small screens (Stitch mobile best sellers). */
export function ProductRowCard({ product }: { product: ProductSummary }) {
  return (
    <article className="bg-surface border border-outline rounded overflow-hidden flex">
      <Link href={`/product/${product.slug}`} tabIndex={-1} aria-hidden="true" className="shrink-0">
        <MediaImage src={product.image?.src ?? null} alt={product.name} sizes="112px" className="w-28 h-32" />
      </Link>
      <div className="p-4 flex flex-col justify-between flex-1 min-w-0">
        <div>
          <span className="font-label text-label-sm uppercase text-on-surface-variant">{product.brandName}</span>
          <h3 className="font-title text-title-md">
            <Link href={`/product/${product.slug}`}>{product.name}</Link>
          </h3>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Price product={product} compact />
          <AddToBagButton productId={product.id} soldOut={product.availability === "out_of_stock"} label="Add" className="px-3 py-1.5 text-label-sm" />
        </div>
      </div>
    </article>
  );
}
