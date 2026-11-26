"use client";

import { useOptimistic, useTransition } from "react";
import { toggleWishlistAction } from "@/modules/wishlist/actions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function WishlistButton({ productId, saved, className }: { productId: string; saved: boolean; className?: string }) {
  const [optimistic, setOptimistic] = useOptimistic(saved, (_cur, next: boolean) => next);
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={optimistic ? "Remove from wishlist" : "Save to wishlist"}
      aria-pressed={optimistic}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleWishlistAction(productId);
        })
      }
      className={cn(
        "absolute top-3 right-3 w-9 h-9 rounded-full bg-surface border border-outline flex items-center justify-center transition-colors duration-state-change",
        optimistic ? "text-primary" : "text-on-surface hover:text-primary",
        className,
      )}
    >
      <Icon name="favorite_border" size={18} filled={optimistic} />
    </button>
  );
}
