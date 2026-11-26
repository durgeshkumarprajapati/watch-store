import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { Icon } from "@/components/ui/icon";
import { verifyCustomerEmail } from "@/modules/auth/auth-service";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Verify your WatchStore email address.",
};

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token
    ? await verifyCustomerEmail(token)
    : { ok: false as const, error: "Verification token is missing." };

  return (
    <AuthSplitShell>
      <div className="bg-surface border border-outline rounded-md p-6 sm:p-8 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Icon
            name={result.ok ? "verified_user" : "error"}
            size={28}
            className={result.ok ? "text-success" : "text-error"}
          />
          <h1 className="font-headline text-headline-lg text-on-surface">
            {result.ok ? "Email Verified" : "Verification Failed"}
          </h1>
        </div>
        <p className="font-body text-body-md text-on-surface-variant">
          {result.ok ? result.message : result.error}
        </p>
        <Link
          href="/login"
          className="mt-2 px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider text-center hover:opacity-90"
        >
          Continue to Sign In
        </Link>
      </div>
    </AuthSplitShell>
  );
}
