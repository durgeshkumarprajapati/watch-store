import Link from "next/link";
import { brand } from "@/config/brand";

const link = "font-body text-body-md text-on-surface-variant hover:text-secondary dark:hover:text-primary";
const heading = "font-label text-label-lg uppercase tracking-wider text-on-surface mb-1";

export function StoreFooter() {
  return (
    <footer className="bg-surface border-t border-outline">
      <div className="md:hidden px-5 py-8 text-center">
        <p className="font-headline text-title-lg mb-2">{brand.wordmark}</p>
        <p className="font-body text-body-md text-on-surface-variant">
          {[...brand.contact.locations, brand.contact.email].join(" • ")}
        </p>
      </div>
      <div className="hidden md:grid py-14 max-w-7xl mx-auto px-6 grid-cols-4 gap-10">
        <div className="flex flex-col gap-3">
          <span className="font-headline text-headline-md text-on-surface">{brand.wordmark}</span>
          <p className="font-body text-body-md text-on-surface-variant">{brand.tagline}</p>
        </div>
        <div className="flex flex-col gap-2.5">
          <h3 className={heading}>Collections</h3>
          <Link className={link} href="/products?type=chronograph">Chronographs</Link>
          <Link className={link} href="/products?type=dress">Minimal Dress</Link>
          <Link className={link} href="/products?type=diver">Automatic Divers</Link>
          <Link className={link} href="/products?gender=women">Women&apos;s Atelier</Link>
        </div>
        <div className="flex flex-col gap-2.5">
          <h3 className={heading}>Client Care</h3>
          <Link className={link} href="/policies/shipping">Shipping &amp; Insured Delivery</Link>
          <Link className={link} href="/policies/returns">Return Policy</Link>
          <Link className={link} href="/policies/warranty">Warranty</Link>
          <Link className={link} href="/faq">FAQ &amp; Sizing Guide</Link>
        </div>
        <div className="flex flex-col gap-2.5">
          <h3 className={heading}>Boutique Concierge</h3>
          <p className="font-body text-body-md text-on-surface-variant">{brand.contact.address}</p>
          <p className="font-mono text-mono-sm text-on-surface-variant">{brand.contact.email}</p>
          <p className="font-mono text-mono-sm text-on-surface-variant">{brand.contact.phone}</p>
        </div>
      </div>
    </footer>
  );
}
