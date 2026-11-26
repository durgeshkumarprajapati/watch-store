import type { Metadata } from "next";
import Link from "next/link";
import { MediaImage } from "@/components/ui/media-image";
import { InfoPageShell } from "@/components/store/info-page-shell";
import { brand } from "@/config/brand";
import { placeholderClaimsVisible } from "@/config/claims";

export const metadata: Metadata = {
  title: "About & Atelier",
  description: `Learn about ${brand.name} and our curation of mechanical and quartz timepieces.`,
};

export default function AboutPage() {
  const showClaims = placeholderClaimsVisible();
  return (
    <InfoPageShell activeTab="about">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6 flex flex-col gap-4">
          <h2 className="font-headline text-headline-lg text-on-background">
            Horological Craftsmanship for the Modern Collector
          </h2>
          <p className="font-body text-body-lg text-on-surface-variant">
            {brand.name} curates mechanical chronographs, automatic divers, and minimalist dress watches for collectors across India.
          </p>
          <p className="font-body text-body-md text-on-surface-variant">
            {showClaims
              ? "Every timepiece is inspected in our climate-controlled watchmaking studio, issued a serialized warranty card, and dispatched with 100% transit insurance."
              : "Every timepiece in our collection is selected for movement reliability, case finishing, and enduring design."}
          </p>
          <div className="pt-2">
            <Link
              href="/products"
              className="inline-flex px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 transition-opacity duration-state-change"
            >
              Explore Collection
            </Link>
          </div>
        </div>
        <div className="lg:col-span-6">
          <MediaImage
            src="/images/site/site_heritage.webp"
            alt={`${brand.name} watchmaking atelier`}
            sizes="(min-width:1024px) 50vw, 100vw"
            className="w-full aspect-[4/3] rounded border border-outline"
          />
        </div>
      </section>
    </InfoPageShell>
  );
}
