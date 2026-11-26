"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { brand } from "@/config/brand";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-background text-on-background flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-surface border border-outline rounded-md p-8 text-center flex flex-col items-center gap-5 shadow-sm">
        <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-primary">
          <Icon name="wifi_off" size={28} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-label text-label-sm uppercase tracking-widest text-on-surface-variant">
            {brand.wordmark}
          </p>
          <h1 className="font-headline text-headline-md text-on-surface">
            You are currently offline
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Live catalogue pricing, stock availability, cart, and account details require an active
            internet connection. Please reconnect and try again.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 w-full pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 transition-opacity"
          >
            Retry Connection
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded border border-outline font-label text-label-lg uppercase tracking-wider text-on-surface hover:border-primary transition-colors"
          >
            Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
