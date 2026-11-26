import type { Metadata } from "next";
import { BrowserPushSettings } from "@/components/notifications/browser-push-settings";
import { AccountShell } from "@/components/store/account/account-shell";
import { ProfileForm } from "@/components/store/account/profile-form";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";

export const metadata: Metadata = {
  title: "Profile",
  description: "Update your WatchStore collector profile.",
};

export const dynamic = "force-dynamic";

export default async function AccountProfilePage() {
  const customer = await requireAuthenticatedCustomerPage();

  return (
    <AccountShell customer={customer} activeTab="profile">
      <div className="flex flex-col gap-6">
        <ProfileForm
          initialName={customer.fullName}
          email={customer.email}
          initialPhone={customer.phone}
        />
        <BrowserPushSettings />
      </div>
    </AccountShell>
  );
}
