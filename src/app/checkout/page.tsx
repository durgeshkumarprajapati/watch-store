import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { brand } from "@/config/brand";
import { getCartSummary } from "@/modules/cart/cart-service";
import { CheckoutView } from "@/components/store/checkout/checkout-view";

export const metadata: Metadata = {
  title: "Secure Checkout",
  description: "Complete your timepiece order securely.",
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const summary = await getCartSummary();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface border-b border-outline">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-20 flex items-center justify-between gap-4">
          <Link
            href="/cart"
            className="inline-flex items-center gap-2 font-label text-label-lg uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors duration-state-change"
          >
            <Icon name="arrow_back" size={18} />
            <span className="hidden sm:inline">Back to Bag</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <Icon name="lock" size={20} className="text-primary" />
            <span className="font-headline text-title-lg sm:text-headline-md text-on-surface">
              {brand.wordmark} SECURE CHECKOUT
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1">
        <CheckoutView summary={summary} />
      </main>
    </div>
  );
}
