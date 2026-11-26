import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export default function ProductNotFound() {
  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-16 lg:py-24">
      <div className="max-w-lg mx-auto bg-surface border border-outline rounded-md p-10 text-center flex flex-col items-center gap-5">
        <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
          <Icon name="watch" size={28} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-label text-label-sm uppercase tracking-widest text-secondary dark:text-primary">
            Timepiece Unavailable
          </span>
          <h1 className="font-headline text-headline-lg text-on-surface">Timepiece Not Found</h1>
          <p className="font-body text-body-md text-on-surface-variant">
            The timepiece you are looking for may have been retired or the link may be incorrect.
          </p>
        </div>
        <Link
          href="/products"
          className="px-7 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 transition-opacity duration-state-change"
        >
          Browse Full Catalogue
        </Link>
      </div>
    </div>
  );
}
