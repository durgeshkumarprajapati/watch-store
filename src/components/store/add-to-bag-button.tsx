"use client";

import { useState, useTransition } from "react";
import { addToCartAction } from "@/modules/cart/actions";
import { cn } from "@/lib/cn";

export function AddToBagButton({
  productId, soldOut = false, label = "Add to Bag", className,
}: { productId: string; soldOut?: boolean; label?: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "added" | "error">("idle");
  const [message, setMessage] = useState("");

  function onClick() {
    startTransition(async () => {
      const res = await addToCartAction(productId);
      if (res.ok) {
        setState("added");
        setMessage("");
      } else {
        setState("error");
        setMessage(res.error);
      }
      setTimeout(() => setState("idle"), 2200);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={soldOut || pending}
        title={state === "error" ? message : undefined}
        className={cn(
          "rounded-sm font-label uppercase tracking-wider transition-[opacity,transform] duration-state-change active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none",
          state === "error" ? "bg-error text-on-error" : "bg-primary text-on-primary hover:opacity-90",
          className,
        )}
      >
        {soldOut ? "Sold Out" : pending ? "Adding…" : state === "added" ? "Added ✓" : state === "error" ? message : label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "added" ? "Added to bag" : state === "error" ? message : ""}
      </span>
    </>
  );
}
