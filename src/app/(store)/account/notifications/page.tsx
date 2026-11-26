import type { Metadata } from "next";
import { AccountShell } from "@/components/store/account/account-shell";
import { NotificationPreferencesForm } from "@/components/store/account/notification-preferences-form";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";
import { getCustomerNotificationPreferences } from "@/modules/notifications/notification-query-service";

export const metadata: Metadata = {
  title: "Notification Preferences",
  description: "Manage your WatchStore transactional notification preferences.",
};

export const dynamic = "force-dynamic";

export default async function AccountNotificationsPage() {
  const customer = await requireAuthenticatedCustomerPage();
  const prefs = await getCustomerNotificationPreferences(customer.id);

  return (
    <AccountShell customer={customer} activeTab="notifications">
      <section className="bg-surface border border-outline rounded-md p-6 sm:p-8 flex flex-col gap-6">
        <div className="border-b border-outline pb-4">
          <h2 className="font-headline text-headline-lg text-on-surface">
            Notification Preferences
          </h2>
          <p className="font-body text-body-md text-on-surface-variant mt-1">
            Control optional shipment milestone emails. Mandatory order, payment, and security
            notices remain active.
          </p>
        </div>

        <NotificationPreferencesForm initialShippingEnabled={prefs.shippingUpdatesEnabled} />
      </section>
    </AccountShell>
  );
}
