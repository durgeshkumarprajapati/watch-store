import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your WatchStore account.",
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthSplitShell>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-4">
          <h1 className="font-headline text-headline-lg text-on-surface">Invalid Reset Link</h1>
          <p className="font-body text-body-md text-on-surface-variant">
            The password reset token is missing. Please request a new reset link.
          </p>
          <Link
            href="/forgot-password"
            className="px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider text-center"
          >
            Request New Link
          </Link>
        </div>
      )}
    </AuthSplitShell>
  );
}
