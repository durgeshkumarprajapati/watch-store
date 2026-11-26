import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { MediaImage } from "@/components/ui/media-image";
import type { CategorySummary } from "@/modules/catalogue/types";

export function CategoryCard({ category }: { category: CategorySummary }) {
  return (
    <Link
      href={`/products?category=${category.slug}`}
      className="group block bg-surface border border-outline rounded overflow-hidden transition-colors duration-state-change hover:border-primary"
    >
      <MediaImage
        src={category.image}
        alt={category.name}
        sizes="(min-width:1024px) 25vw, 50vw"
        className="aspect-square"
        imageClassName="transition-transform duration-surface-enter group-hover:scale-105"
      />
      <div className="p-3 sm:p-5 flex items-center justify-between">
        <div>
          <h3 className="font-title text-title-md text-on-surface">{category.name}</h3>
          <p className="hidden sm:block font-body text-body-md text-on-surface-variant">
            {category.productCount} {category.productCount === 1 ? "Timepiece" : "Timepieces"}
          </p>
        </div>
        <Icon name="arrow_forward" className="hidden sm:inline text-secondary dark:text-primary transition-transform duration-state-change group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
