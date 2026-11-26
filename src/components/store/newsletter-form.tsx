"use client";

import { useActionState } from "react";
import { subscribeNewsletterAction, type NewsletterState } from "@/modules/newsletter/actions";

const initial: NewsletterState = { status: "idle", message: "" };

export function NewsletterForm({ placeholder, cta }: { placeholder: string; cta: string }) {
  const [state, action, pending] = useActionState(subscribeNewsletterAction, initial);
  return (
    <div className="max-w-lg">
      <form action={action} className="flex flex-col sm:flex-row gap-3 mt-2" noValidate>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={placeholder}
          aria-label="Email address"
          aria-invalid={state.status === "error"}
          aria-describedby="newsletter-status"
          className="flex-1 px-4 py-3 rounded-sm bg-surface text-on-surface border border-outline font-body text-body-md placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 disabled:opacity-60 transition-opacity duration-state-change"
        >
          {pending ? "Subscribing…" : cta}
        </button>
      </form>
      <p
        id="newsletter-status"
        role="status"
        aria-live="polite"
        className={`mt-3 font-body text-body-md min-h-[22px] ${state.status === "error" ? "text-error" : ""}`}
      >
        {state.message}
      </p>
    </div>
  );
}
