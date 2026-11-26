import type { Metadata } from "next";
import { BrowserPushSettings } from "@/components/notifications/browser-push-settings";
import { InAppInbox } from "@/components/notifications/in-app-inbox";
import { AccountShell } from "@/components/store/account/account-shell";
import { NotificationPreferencesForm } from "@/components/store/account/notification-preferences-form";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";
import { listInboxNotifications } from "@/modules/notifications/inbox-service";
import {
  markAllCustomerInboxNotificationsReadAction,
  markCustomerInboxNotificationReadAction,
} from "@/modules/notifications/notification-actions";
import { getCustomerNotificationPreferences } from "@/modules/notifications/notification-query-service";

export const metadata: Metadata = {
  title: "Notification Preferences",
  description: "Manage your WatchStore notifications, browser push alerts, and inbox.",
};

export const dynamic = "force-dynamic";

export default async function AccountNotificationsPage() {
  const customer = await requireAuthenticatedCustomerPage();
  const [prefs, inbox] = await Promise.all([
    getCustomerNotificationPreferences(customer.id),
    listInboxNotifications({ type: "customer", customerId: customer.id }, { page: 1, pageSize: 20 }),
  ]);

  return (
    <AccountShell customer={customer} activeTab="notifications">
      <section className="bg-surface border border-outline rounded-md p-6 sm:p-8 flex flex-col gap-6">
        <div className="border-b border-outline pb-4">
          <h2 className="font-headline text-headline-lg text-on-surface">
            Notifications &amp; Browser Push
          </h2>
          <p className="font-body text-body-md text-on-surface-variant mt-1">
            Control optional shipment milestone emails, enable instant browser push alerts, and
            review your recent notifications.
          </p>
        </div>

        <NotificationPreferencesForm initialShippingEnabled={prefs.shippingUpdatesEnabled} />

        <BrowserPushSettings />

        <InAppInbox
          items={inbox.items}
          unreadCount={inbox.unreadCount}
          onMarkRead={markCustomerInboxNotificationReadAction}
          onMarkAllRead={markAllCustomerInboxNotificationsReadAction}
        />
      </section>
    </AccountShell>
  );
}
