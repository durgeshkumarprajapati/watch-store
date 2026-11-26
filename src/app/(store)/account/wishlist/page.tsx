import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ProductCard } from "@/components/store/product-card";
import { getProductRepository, toSummary } from "@/modules/catalogue";
import { getWishlistIds } from "@/modules/wishlist/wishlist-store";

export const metadata: Metadata = {
  title: "Saved Wishlist",
  description: "Your saved timepieces on WatchStore.",
};

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const wishlistIds = await getWishlistIds();
  const products =
    wishlistIds.length > 0 ? await getProductRepository().getByIds(wishlistIds) : [];
  const summaries = products.map(toSummary);

  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-10 lg:py-12 flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-outline pb-6">
        <div>
          <span className="font-label text-label-sm uppercase tracking-widest text-secondary dark:text-primary">
            Account
          </span>
          <h1 className="font-headline text-display-md-mobile sm:text-display-md text-on-background mt-1">
            Saved Wishlist ({summaries.length})
          </h1>
        </div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 font-label text-label-lg uppercase tracking-wider text-on-surface hover:text-primary transition-colors duration-state-change"
        >
          <span>Explore Catalogue</span>
          <Icon name="arrow_forward" size={18} />
        </Link>
      </div>

      {summaries.length === 0 ? (
        <div className="bg-surface border border-outline rounded-md p-10 sm:p-16 text-center max-w-2xl mx-auto flex flex-col items-center gap-4">
          <Icon name="favorite_border" size={48} className="text-primary" />
          <h2 className="font-headline text-headline-lg text-on-surface">Your Wishlist is Empty</h2>
          <p className="font-body text-body-lg text-on-surface-variant max-w-md">
            Save timepieces you love while browsing the catalogue to compare or purchase later.
          </p>
          <Link
            href="/products"
            className="mt-2 px-7 py-3.5 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 transition-opacity duration-state-change"
          >
            Browse Timepieces
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {summaries.map((product) => (
            <ProductCard key={product.id} product={product} saved />
          ))}
        </div>
      )}
    </div>
  );
}
