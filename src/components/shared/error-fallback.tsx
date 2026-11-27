"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { brand } from "@/config/brand";

export function ErrorFallback({
  error,
  reset,
  homeHref = "/",
  homeLabel = "Return to Storefront",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    if (error?.digest) {
      console.error("Route boundary error:", error.digest);
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-surface border border-outline rounded-md p-8 text-center flex flex-col items-center gap-5 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-error">
          <Icon name="error_outline" size={26} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-label text-label-sm uppercase tracking-widest text-on-surface-variant">
            {brand.wordmark}
          </p>
          <h1 className="font-headline text-headline-md text-on-surface">
            Something went wrong
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            We encountered an unexpected issue loading this page. Please try again.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 w-full pt-1">
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 rounded bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
          <Link
            href={homeHref}
            className="px-5 py-2.5 rounded border border-outline font-label text-label-lg uppercase tracking-wider text-on-surface hover:border-primary transition-colors"
          >
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
