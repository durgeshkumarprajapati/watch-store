import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { MediaImage } from "@/components/ui/media-image";
import { CategoryCard } from "@/components/store/category-card";
import { HomeHero } from "@/components/store/home-hero";
import { NewsletterForm } from "@/components/store/newsletter-form";
import { ProductCard, ProductRowCard } from "@/components/store/product-card";
import { SectionHeading } from "@/components/store/section-heading";
import { placeholderClaimsVisible } from "@/config/claims";
import { homeContent } from "@/config/content/home";
import { cn } from "@/lib/cn";
import { getProductRepository } from "@/modules/catalogue";
import { getWishlistIds } from "@/modules/wishlist/wishlist-store";

const tabs = [
  { key: "all", label: "All", gender: undefined },
  { key: "men", label: "Men's", gender: "men" as const },
  { key: "women", label: "Women's", gender: "women" as const },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ best?: string }> }) {
  const { best } = await searchParams;
  const tab = tabs.find((t) => t.key === best) ?? tabs[0]!;
  const repo = getProductRepository();
  const [categories, bestSellers, wishlist] = await Promise.all([
    repo.listCategories(),
    repo.listBestSellers({ gender: tab.gender, limit: 4 }),
    getWishlistIds(),
  ]);
  const saved = new Set(wishlist);
  const claims = placeholderClaimsVisible();
  const { categories: cat, bestSellers: bs, newsletter, claims: c } = homeContent;

  return (
    <>
      <HomeHero image="/images/site/site_hero.webp" />

      <section id="collections" className="max-w-7xl mx-auto px-4 lg:px-6 py-8 lg:py-16">
        <SectionHeading
          eyebrow={cat.eyebrow}
          title={cat.title}
          actions={
            <Link href={cat.viewAll.href} className="hidden lg:inline-flex items-center gap-1.5 font-label text-label-lg uppercase tracking-wider text-on-surface hover:text-secondary dark:hover:text-primary transition-colors duration-state-change">
              <span>{cat.viewAll.label}</span>
              <Icon name="arrow_forward" size={18} />
            </Link>
          }
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {categories.map((category, i) => (
            <div key={category.id} className={cn(i > 1 && "hidden sm:block")}>
              <CategoryCard category={category} />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface-container py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <SectionHeading
            eyebrow={bs.eyebrow}
            title={bs.title}
            actions={
              <div className="hidden sm:flex items-center gap-2" role="tablist" aria-label="Best seller filter">
                {tabs.map((t) => (
                  <Link
                    key={t.key}
                    href={t.key === "all" ? "/" : `/?best=${t.key}`}
                    scroll={false}
                    role="tab"
                    aria-selected={t.key === tab.key}
                    className={cn(
                      "px-4 py-2 rounded-sm font-label text-label-sm uppercase tracking-wider transition-colors duration-state-change",
                      t.key === tab.key
                        ? "bg-secondary text-on-secondary"
                        : "bg-surface border border-outline text-on-surface hover:border-primary",
                    )}
                  >
                    {t.label}
                  </Link>
                ))}
              </div>
            }
          />
          {bestSellers.length === 0 ? (
            <p className="font-body text-body-lg text-on-surface-variant">No best sellers in this selection yet.</p>
          ) : (
            <>
              <div className="sm:hidden flex flex-col gap-4">
                {bestSellers.map((p) => (
                  <ProductRowCard key={p.id} product={p} />
                ))}
              </div>
              <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
                {bestSellers.map((p) => (
                  <ProductCard key={p.id} product={p} saved={saved.has(p.id)} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {claims && (
        <section id="atelier" className="max-w-7xl mx-auto px-4 lg:px-6 py-8 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-6 rounded overflow-hidden border border-outline">
              <MediaImage
                src="/images/site/site_heritage.webp"
                alt="Master watchmaker inspecting mechanical calibre gears"
                sizes="(min-width:1024px) 50vw, 100vw"
                className="aspect-[4/3]"
              />
            </div>
            <div className="lg:col-span-6 flex flex-col gap-5">
              <span className="font-label text-label-sm uppercase tracking-widest text-secondary dark:text-primary">{c.heritage.eyebrow}</span>
              <h2 className="font-headline text-display-md-mobile lg:text-display-md text-on-background text-balance">{c.heritage.title}</h2>
              <p className="font-body text-body-lg text-on-surface-variant text-pretty">{c.heritage.body}</p>
              <dl className="grid grid-cols-3 gap-6 pt-4 border-t border-outline">
                {c.heritage.stats.map((s) => (
                  <div key={s.label}>
                    <dd className="font-headline text-headline-md text-secondary dark:text-primary tabular-nums">{s.value}</dd>
                    <dt className="font-body text-body-md text-on-surface-variant">{s.label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      )}

      <section className="bg-secondary dark:bg-surface-container text-on-secondary dark:text-on-surface py-8 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 flex flex-col gap-4">
            <span className="font-label text-label-sm uppercase tracking-widest text-band-primary">{newsletter.eyebrow}</span>
            <h2 className="font-headline text-display-md-mobile lg:text-display-md text-balance">{newsletter.title}</h2>
            <p className="font-body text-body-lg opacity-85 max-w-prose">{claims ? c.newsletterBody : newsletter.body}</p>
            <NewsletterForm placeholder={newsletter.placeholder} cta={newsletter.cta} />
          </div>
          <div className="hidden lg:grid lg:col-span-5 grid-cols-2 gap-4">
            <MediaImage src="/images/site/site_lifestyle_1.webp" alt="Wrist shot with leather watch" sizes="20vw" className="aspect-square rounded" />
            <MediaImage src="/images/site/site_lifestyle_2.webp" alt="Minimal slate dial watch" sizes="20vw" className="aspect-square rounded" />
          </div>
        </div>
      </section>
    </>
  );
}
