import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { ProductCard } from "@/components/store/product-card";
import { ProductGallery } from "@/components/store/product/product-gallery";
import { ProductPurchasePanel } from "@/components/store/product/product-purchase-panel";
import { placeholderClaimsVisible } from "@/config/claims";
import { formatINR } from "@/lib/format";
import { availabilityOf, discountPercent, getProductRepository } from "@/modules/catalogue";
import type { Availability } from "@/modules/catalogue/types";
import { getWishlistIds } from "@/modules/wishlist/wishlist-store";

const AVAILABILITY_BADGE: Record<Availability, { label: string; tone: "success" | "primary" | "error" }> = {
  in_stock: { label: "In Stock", tone: "success" },
  low_stock: { label: "Low Stock", tone: "primary" },
  out_of_stock: { label: "Out of Stock", tone: "error" },
};

const getCachedProductBySlug = cache(async (slug: string) =>
  getProductRepository().getBySlug(slug),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!slug || slug.length > 128) return { title: "Timepiece Not Found" };
  const product = await getCachedProductBySlug(slug);
  if (!product) return { title: "Timepiece Not Found" };
  return {
    title: product.name,
    description: product.description,
  };
}

export default async function ProductDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug || slug.length > 128) notFound();

  const repo = getProductRepository();
  const product = await getCachedProductBySlug(slug);
  if (!product) notFound();

  const [categories, wishlist, related] = await Promise.all([
    repo.listCategories(),
    getWishlistIds(),
    repo.listRelated(product, 4),
  ]);

  const saved = new Set(wishlist);
  const primaryCategory = categories.find((c) => product.categoryIds.includes(c.id)) ?? null;
  const availability = availabilityOf(product);
  const badge = AVAILABILITY_BADGE[availability];
  const pctOff = discountPercent(product.mrpPaise, product.pricePaise);
  const gstPercent = Math.round(product.gstRateBps / 100);
  const showClaims = placeholderClaimsVisible();

  const specRows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Movement", value: product.specs.movement },
    { label: "Case Dimensions", value: product.specs.caseDimensions, mono: true },
    { label: "Crystal", value: product.specs.crystal },
    { label: "Water Resistance", value: product.specs.waterResistance, mono: true },
    { label: "Dial & Strap", value: product.dialAndStrap },
    { label: "HSN / GST", value: `HSN ${product.specs.hsn} • ${gstPercent}% GST Included`, mono: true },
  ];

  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-8 lg:py-10 flex flex-col gap-14">
      <div>
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-on-surface-variant font-body text-body-md mb-6 lg:mb-8">
          <Link href="/" className="hover:text-secondary dark:hover:text-primary transition-colors duration-state-change">
            Home
          </Link>
          <Icon name="chevron_right" size={16} />
          {primaryCategory ? (
            <Link
              href={`/products?category=${primaryCategory.slug}`}
              className="hover:text-secondary dark:hover:text-primary transition-colors duration-state-change"
            >
              {primaryCategory.name}
            </Link>
          ) : (
            <Link href="/products" className="hover:text-secondary dark:hover:text-primary transition-colors duration-state-change">
              Catalogue
            </Link>
          )}
          <Icon name="chevron_right" size={16} />
          <span className="text-on-surface font-semibold">{product.name}</span>
        </nav>

        {/* Main Product Showcase */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-7">
            <ProductGallery images={product.images} productName={product.name} />
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6 bg-surface border border-outline rounded-md p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-label text-label-sm uppercase tracking-widest text-secondary dark:text-primary">
                {product.brand.name} • SKU: {product.sku}
              </span>
              <Badge tone={badge.tone} className="px-2.5 py-1">
                {badge.label}
              </Badge>
            </div>

            <div>
              <h1 className="font-headline text-display-md-mobile sm:text-display-md text-on-surface">
                {product.name}
              </h1>
              <p className="font-body text-body-md text-on-surface-variant mt-1.5">
                {product.dialAndStrap}
              </p>
            </div>

            {/* Pricing */}
            <div className="border-y border-outline py-5 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-headline text-headline-lg text-on-surface tabular-nums">
                  {formatINR(product.pricePaise)}
                </span>
                {pctOff > 0 && (
                  <>
                    <span className="font-body text-body-lg text-on-surface-variant line-through tabular-nums">
                      {formatINR(product.mrpPaise)}
                    </span>
                    <Badge tone="success">Save {pctOff}%</Badge>
                  </>
                )}
              </div>
              <p className="font-body text-body-md text-on-surface-variant">
                Inclusive of {gstPercent}% GST
              </p>
            </div>

            <ProductPurchasePanel
              productId={product.id}
              availableStock={product.stock.available}
              initialSaved={saved.has(product.id)}
            />

            {/* Trust & Warranty (gated by placeholderClaimsVisible until verified by client) */}
            {showClaims && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-outline">
                {product.warrantyYears !== null && (
                  <div className="flex items-start gap-2.5">
                    <Icon name="verified_user" size={20} className="text-secondary dark:text-primary shrink-0" />
                    <div>
                      <p className="font-label text-label-lg text-on-surface">{product.warrantyYears}-Year Warranty</p>
                      <p className="font-body text-body-md text-on-surface-variant">Official calibre coverage</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2.5">
                  <Icon name="assignment_return" size={20} className="text-secondary dark:text-primary shrink-0" />
                  <div>
                    <p className="font-label text-label-lg text-on-surface">14-Day Returns</p>
                    <p className="font-body text-body-md text-on-surface-variant">Unworn with intact seal</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Technical Specifications & Description */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 border-t border-outline pt-12">
        <div className="lg:col-span-5 flex flex-col gap-4">
          <h2 className="font-headline text-headline-lg text-on-background">Calibre &amp; Architecture</h2>
          <p className="font-body text-body-lg text-on-surface-variant">{product.description}</p>
        </div>
        <div className="lg:col-span-7 bg-surface border border-outline rounded-md overflow-hidden">
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-outline">
              {specRows.map((row) => (
                <tr key={row.label}>
                  <th className="px-4 sm:px-6 py-4 font-label text-label-sm uppercase tracking-wider text-on-surface-variant w-1/3">
                    {row.label}
                  </th>
                  <td
                    className={
                      row.mono
                        ? "px-4 sm:px-6 py-4 font-mono text-mono-md text-on-surface"
                        : "px-4 sm:px-6 py-4 font-body text-body-md text-on-surface"
                    }
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Related Timepieces */}
      {related.length > 0 && (
        <section className="border-t border-outline pt-12 flex flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="font-label text-label-sm uppercase tracking-widest text-secondary dark:text-primary">
                Curated Pairings
              </span>
              <h2 className="font-headline text-headline-lg text-on-background mt-1">Related Timepieces</h2>
            </div>
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 font-label text-label-lg uppercase tracking-wider text-on-surface hover:text-secondary dark:hover:text-primary transition-colors duration-state-change"
            >
              <span>View All</span>
              <Icon name="arrow_forward" size={18} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} saved={saved.has(item.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
