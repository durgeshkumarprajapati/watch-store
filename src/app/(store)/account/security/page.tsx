import type { Metadata } from "next";
import { AccountShell } from "@/components/store/account/account-shell";
import { SecurityForm } from "@/components/store/account/security-form";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";

export const metadata: Metadata = {
  title: "Security",
  description: "Manage your WatchStore password and account security.",
};

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const customer = await requireAuthenticatedCustomerPage();

  return (
    <AccountShell customer={customer} activeTab="security">
      <SecurityForm />
    </AccountShell>
  );
}
