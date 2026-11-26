import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getServerEnv } from "@/config/env";
import { getAuthenticatedCustomer } from "@/modules/auth/session-service";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your WatchStore collector account.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const customer = await getAuthenticatedCustomer();
  if (customer) redirect("/account");

  const env = getServerEnv();
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <AuthSplitShell>
      <LoginForm googleEnabled={googleEnabled} />
    </AuthSplitShell>
  );
}
