import type { Metadata } from "next";
import Link from "next/link";
import { MinimalShell } from "@/components/shared/minimal-shell";
import { CartView } from "@/components/store/cart/cart-view";
import { getCartSummary } from "@/modules/cart/cart-service";

export const metadata: Metadata = {
  title: "Shopping Bag",
  description: "Review your selected timepieces and proceed to checkout.",
};

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const summary = await getCartSummary();

  return (
    <MinimalShell
      actions={
        <Link
          href="/products"
          className="px-3.5 py-2 rounded border border-outline font-label text-label-sm uppercase tracking-wider text-on-surface hover:border-primary transition-colors duration-state-change"
        >
          Catalogue
        </Link>
      }
    >
      <CartView summary={summary} />
    </MinimalShell>
  );
}
