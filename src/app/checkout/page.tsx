import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { brand } from "@/config/brand";
import { getAuthenticatedCustomer } from "@/modules/auth/session-service";
import { getCartSummary } from "@/modules/cart/cart-service";
import { listCustomerAddresses } from "@/modules/customers/customer-service";
import { CheckoutView, type CheckoutPrefill } from "@/components/store/checkout/checkout-view";

export const metadata: Metadata = {
  title: "Secure Checkout",
  description: "Complete your timepiece order securely.",
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [summary, customer] = await Promise.all([
    getCartSummary(),
    getAuthenticatedCustomer(),
  ]);

  let prefill: CheckoutPrefill | undefined;
  if (customer) {
    const addresses = await listCustomerAddresses(customer.id);
    const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
    prefill = {
      fullName: customer.fullName ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      addressLine1: defaultAddr?.addressLine1 ?? "",
      addressLine2: defaultAddr?.addressLine2 ?? "",
      city: defaultAddr?.city ?? "",
      stateName: defaultAddr?.state ?? "",
      pinCode: defaultAddr?.pinCode ?? "",
    };
  }

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
        <CheckoutView summary={summary} prefill={prefill} />
      </main>
    </div>
  );
}
