import type { Metadata } from "next";
import { BrowserPushSettings } from "@/components/notifications/browser-push-settings";
import { InAppInbox } from "@/components/notifications/in-app-inbox";
import { requireAuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { listInboxNotifications } from "@/modules/notifications/inbox-service";
import {
  markAdminInboxNotificationReadAction,
  markAllAdminInboxNotificationsReadAction,
} from "@/modules/notifications/notification-actions";

export const metadata: Metadata = {
  title: "Inbox & Browser Push — WatchStore Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminInboxPage() {
  const admin = await requireAuthenticatedAdmin();
  const inbox = await listInboxNotifications(
    { type: "admin", adminUserId: admin.adminId },
    { page: 1, pageSize: 25 },
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-background">
          Admin Inbox &amp; Browser Push
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          All active, email-verified administrators receive real-time operational alerts here and on
          subscribed devices.
        </p>
      </div>

      <BrowserPushSettings enableAdminTest />

      <section className="p-5 rounded bg-surface border border-outline">
        <InAppInbox
          items={inbox.items}
          unreadCount={inbox.unreadCount}
          onMarkRead={markAdminInboxNotificationReadAction}
          onMarkAllRead={markAllAdminInboxNotificationsReadAction}
        />
      </section>
    </div>
  );
}
