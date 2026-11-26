import { ButtonLink } from "@/components/ui/button";
import { MediaImage } from "@/components/ui/media-image";
import { homeContent } from "@/config/content/home";
import { cn } from "@/lib/cn";

/** Hero uses the "band" (always-dark) tokens in both themes, as in Stitch. */
export function HomeHero({ image }: { image: string | null }) {
  const { hero } = homeContent;
  return (
    <section className="bg-band text-on-band overflow-hidden">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 items-center lg:min-h-[600px]">
        <div className="lg:col-span-6 px-5 lg:px-6 py-8 lg:py-24 z-10 flex flex-col gap-4 lg:gap-6">
          <span className="font-label text-label-sm uppercase tracking-widest text-band-primary">{hero.eyebrow}</span>
          <h1 className="font-display text-display-lg-mobile lg:text-display-lg text-on-band text-balance">{hero.title}</h1>
          <p className="font-body text-body-md lg:text-body-lg text-on-band-variant max-w-prose text-pretty">
            <span className="lg:hidden">{hero.bodyMobile}</span>
            <span className="hidden lg:inline">{hero.body}</span>
          </p>
          <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 lg:gap-4 pt-2">
            <ButtonLink href={hero.primaryCta.href} className={cn("w-full lg:w-auto py-3.5 bg-band-primary text-on-band-primary lg:bg-primary lg:text-on-primary")}>
              {hero.primaryCta.label}
            </ButtonLink>
            <ButtonLink
              href={hero.secondaryCta.href}
              variant="secondary"
              className="w-full lg:w-auto py-3.5 bg-transparent border border-band-outline text-on-band lg:border-transparent lg:bg-secondary lg:text-on-secondary"
            >
              {hero.secondaryCta.label}
            </ButtonLink>
          </div>
        </div>
        <div className="lg:col-span-6 order-first lg:order-last relative aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[600px]">
          <MediaImage
            src={image}
            alt="Mechanical chronograph wristwatch resting on dark slate stone"
            sizes="(min-width:1024px) 50vw, 100vw"
            priority
            className="absolute inset-0 bg-on-band-variant/10"
          />
        </div>
      </div>
    </section>
  );
}
