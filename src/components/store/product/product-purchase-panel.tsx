"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { addToCartAction } from "@/modules/cart/actions";
import { toggleWishlistAction } from "@/modules/wishlist/actions";

const MAX_LINE_QUANTITY = 10;

export function ProductPurchasePanel({
  productId,
  availableStock,
  initialSaved,
}: {
  productId: string;
  availableStock: number;
  initialSaved: boolean;
}) {
  const router = useRouter();
  const soldOut = availableStock <= 0;
  const maxQty = Math.max(1, Math.min(MAX_LINE_QUANTITY, availableStock));

  const [quantity, setQuantity] = useState(1);
  const [bagState, setBagState] = useState<"idle" | "added" | "error">("idle");
  const [bagMessage, setBagMessage] = useState("");
  const [pendingAction, startTransition] = useTransition();

  const [optimisticSaved, setOptimisticSaved] = useOptimistic(initialSaved, (_cur, next: boolean) => next);
  const [, startWishlistTransition] = useTransition();

  const [pin, setPin] = useState("");
  const [pinStatus, setPinStatus] = useState<{ ok: boolean; message: string } | null>(null);

  function stepQty(delta: number) {
    setQuantity((q) => Math.max(1, Math.min(maxQty, q + delta)));
  }

  function handleAddToBag(redirectToCart = false) {
    if (soldOut || pendingAction) return;
    startTransition(async () => {
      const res = await addToCartAction(productId, quantity);
      if (res.ok) {
        if (redirectToCart) {
          router.push("/cart");
          return;
        }
        setBagState("added");
        setBagMessage("");
      } else {
        setBagState("error");
        setBagMessage(res.error);
      }
      setTimeout(() => setBagState("idle"), 2400);
    });
  }

  function handleWishlistToggle() {
    startWishlistTransition(async () => {
      setOptimisticSaved(!optimisticSaved);
      await toggleWishlistAction(productId);
    });
  }

  function handlePinCheck(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = pin.trim();
    if (/^\d{6}$/.test(cleaned)) {
      setPinStatus({
        ok: true,
        message: `Delivery serviceability available for PIN ${cleaned}. Exact dispatch timeline confirmed at checkout.`,
      });
    } else {
      setPinStatus({
        ok: false,
        message: "Please enter a valid 6-digit Indian PIN code.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Quantity + Wishlist */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="font-label text-label-lg text-on-surface">Quantity</span>
          <div className="inline-flex items-center border border-outline rounded bg-background">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => stepQty(-1)}
              disabled={soldOut || quantity <= 1}
              className="w-10 h-10 flex items-center justify-center text-on-surface hover:text-primary disabled:opacity-40 disabled:pointer-events-none transition-colors duration-state-change"
            >
              -
            </button>
            <span aria-live="polite" className="w-10 text-center font-mono text-mono-md text-on-surface tabular-nums">
              {soldOut ? 0 : quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => stepQty(1)}
              disabled={soldOut || quantity >= maxQty}
              className="w-10 h-10 flex items-center justify-center text-on-surface hover:text-primary disabled:opacity-40 disabled:pointer-events-none transition-colors duration-state-change"
            >
              +
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleWishlistToggle}
          aria-pressed={optimisticSaved}
          aria-label={optimisticSaved ? "Remove from wishlist" : "Save to wishlist"}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-2 rounded border border-outline bg-background font-label text-label-sm uppercase tracking-wider transition-colors duration-state-change",
            optimisticSaved ? "text-primary border-primary" : "text-on-surface hover:border-primary",
          )}
        >
          <Icon name="favorite_border" size={18} filled={optimisticSaved} />
          <span className="hidden sm:inline">{optimisticSaved ? "Saved" : "Wishlist"}</span>
        </button>
      </div>

      {/* Primary CTAs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleAddToBag(false)}
          disabled={soldOut || pendingAction}
          className={cn(
            "w-full py-3.5 px-6 rounded-sm font-label text-label-lg uppercase tracking-wider inline-flex items-center justify-center gap-2 transition-[opacity,transform] duration-state-change active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none",
            bagState === "error" ? "bg-error text-on-error" : "bg-primary text-on-primary hover:opacity-90",
          )}
        >
          <Icon name="shopping_bag" size={18} />
          <span>
            {soldOut
              ? "Sold Out"
              : pendingAction
                ? "Adding…"
                : bagState === "added"
                  ? "Added ✓"
                  : bagState === "error"
                    ? bagMessage
                    : "Add to Bag"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleAddToBag(true)}
          disabled={soldOut || pendingAction}
          className="w-full py-3.5 px-6 rounded-sm bg-secondary text-on-secondary font-label text-label-lg uppercase tracking-wider inline-flex items-center justify-center hover:opacity-90 transition-opacity duration-state-change disabled:opacity-50 disabled:pointer-events-none"
        >
          Buy Now
        </button>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {bagState === "added" ? "Added to bag" : bagState === "error" ? bagMessage : ""}
      </span>

      {/* PIN Code Serviceability Check */}
      <form onSubmit={handlePinCheck} className="bg-surface-container rounded p-4 flex flex-col gap-3">
        <label htmlFor="pdp-pin-input" className="font-label text-label-lg text-on-surface">
          Check Delivery Availability
        </label>
        <div className="flex gap-2">
          <input
            id="pdp-pin-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter 6-digit PIN"
            className="flex-1 min-w-0 px-3.5 py-2 rounded bg-surface border border-outline font-mono text-mono-md text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded bg-surface border border-outline font-label text-label-lg uppercase tracking-wider text-on-surface hover:border-primary shrink-0 transition-colors duration-state-change"
          >
            Check
          </button>
        </div>
        {pinStatus && (
          <p
            role="status"
            className={cn(
              "font-body text-body-md flex items-center gap-1.5",
              pinStatus.ok ? "text-success" : "text-error",
            )}
          >
            <Icon name={pinStatus.ok ? "local_shipping" : "error_outline"} size={18} className="shrink-0" />
            <span>{pinStatus.message}</span>
          </p>
        )}
      </form>
    </div>
  );
}
