import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { getAuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { getAuthenticatedCustomer } from "@/modules/auth/session-service";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create your WatchStore collector profile.",
};

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const admin = await getAuthenticatedAdmin();
  if (admin) redirect("/admin/dashboard");

  const customer = await getAuthenticatedCustomer();
  if (customer) redirect("/account");

  return (
    <AuthSplitShell>
      <RegisterForm />
    </AuthSplitShell>
  );
}
