"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { brand } from "@/config/brand";
import { registerAction, type AuthActionResult } from "@/modules/auth/actions";

export function RegisterForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await registerAction({
        fullName,
        email,
        password,
        confirmPassword,
        acceptTerms,
      });
      setResult(res);
    });
  }

  return (
    <>
      <div>
        <h1 className="font-headline text-display-md-mobile sm:text-display-md text-on-background">
          Create Profile
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          Register your {brand.name} collector account.
        </p>
      </div>

      {result && !result.ok && (
        <div role="alert" className="p-4 rounded bg-error text-on-error flex items-start gap-3">
          <Icon name="error" size={20} className="shrink-0" />
          <p className="font-body text-body-md">{result.error}</p>
        </div>
      )}

      {result && result.ok ? (
        <div className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
          <p className="font-title text-title-md text-success">{result.message}</p>
          {result.devUrl && (
            <p className="font-body text-body-md text-on-surface-variant">
              Development verification link:{" "}
              <Link href={result.devUrl} className="text-primary underline break-all">
                Verify Email
              </Link>
            </p>
          )}
          <Link
            href="/login"
            className="mt-2 px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider text-center"
          >
            Go to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg text-on-surface">Full Name</span>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Aarav Mehta"
              className="px-3.5 py-2.5 rounded bg-surface border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
            />
          </label>

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
            <span className="font-label text-label-lg text-on-surface">Password (min 8 characters)</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="px-3.5 py-2.5 rounded bg-surface border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg text-on-surface">Confirm Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="px-3.5 py-2.5 rounded bg-surface border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
            />
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 rounded-sm border-outline text-primary accent-primary"
            />
            <span className="font-body text-body-md text-on-surface-variant">
              I accept the{" "}
              <Link href="/policies/privacy" className="text-secondary dark:text-primary hover:underline">
                Privacy Policy &amp; Terms
              </Link>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3.5 px-6 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 mt-2 disabled:opacity-60"
          >
            {pending ? "Creating Account…" : "Create Collector Profile"}
          </button>
        </form>
      )}

      <p className="font-body text-body-md text-center text-on-surface-variant">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-secondary dark:text-primary hover:underline">
          Sign In
        </Link>
      </p>
    </>
  );
}
