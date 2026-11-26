"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { brand } from "@/config/brand";
import { googleSignInAction, loginAction } from "@/modules/auth/actions";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await loginAction({ email, password });
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <>
      <div>
        <h1 className="font-headline text-display-md-mobile sm:text-display-md text-on-background">
          Welcome Back
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          Sign in to your {brand.name} collector account.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded bg-error text-on-error flex items-start gap-3">
          <Icon name="error" size={20} className="shrink-0" />
          <p className="font-body text-body-md">{error}</p>
        </div>
      )}

      {googleEnabled && (
        <>
          <form action={googleSignInAction}>
            <button
              type="submit"
              className="w-full py-3 px-4 rounded bg-surface border border-outline font-label text-label-lg uppercase tracking-wider text-on-surface flex items-center justify-center gap-2.5 hover:border-primary transition-colors duration-state-change"
            >
              <Icon name="account_circle" size={20} />
              <span>Continue with Google</span>
            </button>
          </form>

          <div className="flex items-center gap-4">
            <span className="flex-1 h-px bg-outline" />
            <span className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
              Or with Email
            </span>
            <span className="flex-1 h-px bg-outline" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg text-on-surface">Email Address</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="px-3.5 py-2.5 rounded bg-surface border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-label text-label-lg text-on-surface">Password</span>
            <Link
              href="/forgot-password"
              className="font-label text-label-sm uppercase tracking-wider text-secondary dark:text-primary hover:underline"
            >
              Forgot?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="px-3.5 py-2.5 rounded bg-surface border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3.5 px-6 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 mt-2 disabled:opacity-60"
        >
          {pending ? "Verifying Credentials…" : "Sign In to Account"}
        </button>
      </form>

      <p className="font-body text-body-md text-center text-on-surface-variant">
        New to {brand.name}?{" "}
        <Link href="/register" className="font-semibold text-secondary dark:text-primary hover:underline">
          Create Collector Profile
        </Link>
      </p>
    </>
  );
}
