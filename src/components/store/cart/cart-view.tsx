"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { MediaImage } from "@/components/ui/media-image";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import {
  applyPromoCodeAction,
  clearCartAction,
  removeFromCartAction,
  removePromoCodeAction,
  updateCartQuantityAction,
} from "@/modules/cart/actions";
import type { CartSummary } from "@/modules/cart/cart-service";

type OptimisticCartAction =
  | { type: "qty"; productId: string; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "clear" };

export function CartView({ summary }: { summary: CartSummary }) {
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);

  const [optimisticItems, applyOptimistic] = useOptimistic(
    summary.items,
    (items, action: OptimisticCartAction) => {
      switch (action.type) {
        case "qty":
          return items.map((item) =>
            item.productId === action.productId
              ? {
                  ...item,
                  quantity: action.quantity,
                  lineTotalPaise: item.unitPricePaise * action.quantity,
                }
              : item,
          );
        case "remove":
          return items.filter((item) => item.productId !== action.productId);
        case "clear":
          return [];
      }
    },
  );

  function handleQtyChange(productId: string, nextQty: number) {
    if (pending) return;
    setActionError(null);
    startTransition(async () => {
      applyOptimistic({ type: "qty", productId, quantity: nextQty });
      const res = await updateCartQuantityAction(productId, nextQty);
      if (!res.ok) setActionError(res.error);
    });
  }

  function handleRemove(productId: string) {
    if (pending) return;
    setActionError(null);
    startTransition(async () => {
      applyOptimistic({ type: "remove", productId });
      const res = await removeFromCartAction(productId);
      if (!res.ok) setActionError(res.error);
    });
  }

  function handleClear() {
    if (pending) return;
    setActionError(null);
    startTransition(async () => {
      applyOptimistic({ type: "clear" });
      const res = await clearCartAction();
      if (!res.ok) setActionError(res.error);
    });
  }

  function handleApplyPromo(e: React.FormEvent) {
    e.preventDefault();
    setPromoError(null);
    const code = promoInput.trim();
    if (!code) {
      setPromoError("Enter a promo code.");
      return;
    }
    startTransition(async () => {
      const res = await applyPromoCodeAction(code);
      if (res.ok) {
        setPromoInput("");
      } else {
        setPromoError(res.error);
      }
    });
  }

  function handleRemovePromo() {
    setPromoError(null);
    startTransition(async () => {
      await removePromoCodeAction();
    });
  }

  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-10 lg:py-12">
      <h1 className="font-headline text-display-md-mobile sm:text-display-md text-on-background mb-8">
        Your Shopping Bag ({summary.itemCount})
      </h1>

      {(summary.issues.length > 0 || actionError) && (
        <div role="alert" className="mb-6 rounded border border-error bg-surface p-4 flex flex-col gap-1 text-error font-body text-body-md">
          {actionError && <p>{actionError}</p>}
          {summary.issues.map((issue) => (
            <p key={issue.productId}>{issue.message}</p>
          ))}
        </div>
      )}

      {optimisticItems.length === 0 ? (
        <div className="bg-surface border border-outline rounded-md p-10 sm:p-16 text-center max-w-2xl mx-auto flex flex-col items-center gap-4">
          <Icon name="shopping_bag" size={48} className="text-primary" />
          <h2 className="font-headline text-headline-lg text-on-surface">Your Shopping Bag is Empty</h2>
          <p className="font-body text-body-lg text-on-surface-variant max-w-md">
            Explore our chronographs, automatic divers, and minimal dress watches to begin your collection.
          </p>
          <Link
            href="/products"
            className="mt-2 px-7 py-3.5 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 transition-opacity duration-state-change"
          >
            Explore Collection
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Items */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {optimisticItems.map((item) => (
              <article
                key={item.productId}
                className="bg-surface border border-outline rounded-md p-5 sm:p-6 flex flex-col sm:flex-row gap-5 sm:gap-6 items-start sm:items-center"
              >
                <Link href={`/product/${item.slug}`} className="shrink-0">
                  <MediaImage
                    src={item.image?.src ?? null}
                    alt={item.image?.alt ?? item.name}
                    sizes="112px"
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded"
                  />
                </Link>
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <span className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
                    {item.brandName} • <span className="font-mono">SKU: {item.sku}</span>
                  </span>
                  <h2 className="font-title text-title-lg text-on-surface">
                    <Link href={`/product/${item.slug}`} className="hover:text-primary transition-colors duration-state-change">
                      {item.name}
                    </Link>
                  </h2>
                  <p className="font-body text-body-md text-on-surface-variant">{item.dialAndStrap}</p>
                  {item.hasStockIssue && (
                    <p className="font-body text-body-md text-error mt-1">
                      {item.availableStock <= 0
                        ? "Out of stock — remove to proceed"
                        : `Only ${item.availableStock} available`}
                    </p>
                  )}
                </div>

                <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-6">
                  <div className="inline-flex items-center border border-outline rounded bg-background">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${item.name}`}
                      disabled={pending || item.quantity <= 1}
                      onClick={() => handleQtyChange(item.productId, item.quantity - 1)}
                      className="w-9 h-9 flex items-center justify-center text-on-surface hover:text-primary disabled:opacity-40 disabled:pointer-events-none"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono text-mono-md text-on-surface tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${item.name}`}
                      disabled={pending || item.quantity >= item.maxQuantity}
                      onClick={() => handleQtyChange(item.productId, item.quantity + 1)}
                      className="w-9 h-9 flex items-center justify-center text-on-surface hover:text-primary disabled:opacity-40 disabled:pointer-events-none"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right min-w-[110px]">
                    <p className="font-title text-title-md text-on-surface tabular-nums">
                      {formatINR(item.lineTotalPaise)}
                    </p>
                    {item.discountPercent > 0 && (
                      <p className="font-body text-body-md text-on-surface-variant line-through tabular-nums">
                        {formatINR(item.unitMrpPaise * item.quantity)}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRemove(item.productId)}
                      className="font-label text-label-sm uppercase tracking-wider text-error hover:underline mt-1 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 font-label text-label-lg uppercase tracking-wider text-on-surface hover:text-secondary dark:hover:text-primary transition-colors duration-state-change"
              >
                <Icon name="arrow_back" size={18} />
                <span>Continue Shopping</span>
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={handleClear}
                className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-error transition-colors duration-state-change"
              >
                Clear Bag
              </button>
            </div>
          </div>

          {/* Order Summary */}
          <aside className="lg:col-span-4 bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
            <h2 className="font-headline text-headline-md text-on-surface border-b border-outline pb-4">
              Order Summary
            </h2>

            {/* Promo Code */}
            <div className="flex flex-col gap-2">
              {summary.promoCode ? (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded bg-surface-container border border-outline">
                  <span className="font-mono text-mono-sm text-success">
                    Applied: {summary.promoCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleRemovePromo}
                    disabled={pending}
                    className="font-label text-label-sm uppercase tracking-wider text-error hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyPromo} className="flex gap-2">
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Promo code (e.g. WATCH10)"
                    aria-label="Promo code"
                    className="flex-1 min-w-0 px-3.5 py-2.5 rounded bg-background border border-outline font-mono text-mono-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="px-4 py-2.5 rounded border border-outline font-label text-label-sm uppercase tracking-wider text-on-surface hover:border-primary shrink-0 transition-colors duration-state-change"
                  >
                    Apply
                  </button>
                </form>
              )}
              {promoError && <p className="font-body text-body-md text-error">{promoError}</p>}
            </div>

            <div className="flex flex-col gap-3 border-t border-outline pt-4 font-body text-body-md">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">
                  Subtotal ({summary.itemCount} {summary.itemCount === 1 ? "item" : "items"})
                </span>
                <span className="font-mono text-on-surface tabular-nums">{formatINR(summary.subtotalPaise)}</span>
              </div>
              {summary.productSavingsPaise > 0 && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Savings on MRP</span>
                  <span className="font-mono tabular-nums text-success">
                    -{formatINR(summary.productSavingsPaise)}
                  </span>
                </div>
              )}
              {summary.promoDiscountPaise > 0 && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Promo ({summary.promoCode})</span>
                  <span className="font-mono tabular-nums text-success">
                    -{formatINR(summary.promoDiscountPaise)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Standard Delivery</span>
                <span className="font-label text-label-sm uppercase text-success">
                  {summary.shippingPaise === 0 ? "Complimentary" : formatINR(summary.shippingPaise)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Included GST</span>
                <span className="font-mono text-on-surface tabular-nums">{formatINR(summary.includedGstPaise)}</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline border-t border-outline pt-4">
              <span className="font-title text-title-lg text-on-surface">Grand Total</span>
              <span className="font-headline text-headline-lg text-on-surface tabular-nums">
                {formatINR(summary.grandTotalPaise)}
              </span>
            </div>

            {summary.canCheckout ? (
              <Link
                href="/checkout"
                className="w-full py-3.5 px-6 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider text-center hover:opacity-90 transition-opacity duration-state-change"
              >
                Proceed to Checkout
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className={cn(
                  "w-full py-3.5 px-6 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider opacity-50 cursor-not-allowed",
                )}
              >
                Resolve Stock Issues to Checkout
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
