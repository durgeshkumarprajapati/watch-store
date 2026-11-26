"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { forgotPasswordAction, type AuthActionResult } from "@/modules/auth/actions";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setResult(await forgotPasswordAction(email));
    });
  }

  return (
    <>
      <div>
        <h1 className="font-headline text-display-md-mobile sm:text-display-md text-on-background">
          Reset Password
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          Enter your email address to receive a password reset link.
        </p>
      </div>

      {result && !result.ok && (
        <div role="alert" className="p-4 rounded bg-error text-on-error font-body text-body-md">
          {result.error}
        </div>
      )}

      {result && result.ok ? (
        <div className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3">
          <p className="font-body text-body-md text-on-surface">{result.message}</p>
          {result.devUrl && (
            <p className="font-body text-body-md text-on-surface-variant">
              Development reset link:{" "}
              <Link href={result.devUrl} className="text-primary underline break-all">
                Reset Password
              </Link>
            </p>
          )}
          <Link href="/login" className="font-label text-label-sm uppercase tracking-wider text-primary hover:underline">
            Return to Sign In
          </Link>
        </div>
      ) : (
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
          <button
            type="submit"
            disabled={pending}
            className="w-full py-3.5 px-6 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send Reset Link"}
          </button>
        </form>
      )}
    </>
  );
}
