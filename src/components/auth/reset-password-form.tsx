"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPasswordAction, type AuthActionResult } from "@/modules/auth/actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setResult(await resetPasswordAction({ token, password, confirmPassword }));
    });
  }

  return (
    <>
      <div>
        <h1 className="font-headline text-display-md-mobile sm:text-display-md text-on-background">
          Set New Password
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          Choose a new password for your collector account.
        </p>
      </div>

      {result && !result.ok && (
        <div role="alert" className="p-4 rounded bg-error text-on-error font-body text-body-md">
          {result.error}
        </div>
      )}

      {result && result.ok ? (
        <div className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-4">
          <p className="font-body text-body-md text-success">{result.message}</p>
          <Link
            href="/login"
            className="px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider text-center"
          >
            Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg text-on-surface">New Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-surface border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg text-on-surface">Confirm New Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-surface border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full py-3.5 px-6 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Updating…" : "Update Password"}
          </button>
        </form>
      )}
    </>
  );
}
