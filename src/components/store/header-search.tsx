"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function HeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    setOpen(false);
    router.push(trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : "/products");
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Search watches"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors duration-state-change",
          className,
        )}
      >
        <Icon name="search" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Search timepieces"
          className="fixed inset-x-4 top-24 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80 z-50 bg-surface border border-outline rounded-md p-3 shadow-ambient"
        >
          <form onSubmit={onSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search model, brand, or SKU..."
              aria-label="Search model, brand, or SKU"
              className="flex-1 min-w-0 px-3 py-2 rounded bg-background border border-outline font-body text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary"
            />
            <button
              type="submit"
              aria-label="Submit search"
              className="px-3.5 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider hover:opacity-90 shrink-0"
            >
              Go
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
