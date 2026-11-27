"use client";

import { ErrorFallback } from "@/components/shared/error-fallback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-on-background font-body antialiased min-h-screen flex items-center justify-center">
        <ErrorFallback error={error} reset={reset} homeHref="/" homeLabel="Return to Storefront" />
      </body>
    </html>
  );
}
