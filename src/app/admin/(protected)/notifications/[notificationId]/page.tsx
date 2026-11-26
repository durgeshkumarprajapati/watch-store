import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { NotificationRetryButton } from "@/components/admin/notifications/notification-retry-button";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";
import { getAdminNotificationDetail } from "@/modules/notifications/notification-query-service";

export default async function AdminNotificationDetailPage({
  params,
}: {
  params: Promise<{ notificationId: string }>;
}) {
  const admin = await requireAdminPermission("notifications.read");
  const { notificationId } = await params;
  const notification = await getAdminNotificationDetail(notificationId);
  if (!notification) notFound();

  const canRetry =
    hasAdminPermission(admin.permissions, "notifications.retry") &&
    (notification.status === "FAILED" ||
      notification.status === "DEAD_LETTER" ||
      notification.status === "PENDING");

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <Link
          href="/admin/notifications"
          className="inline-flex items-center gap-1.5 font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-primary mb-2"
        >
          <Icon name="arrow_back" size={16} /> Back to Notifications
        </Link>
        <h1 className="font-headline text-headline-lg text-on-surface">
          {notification.eventType}
        </h1>
        <p className="font-mono text-mono-sm text-on-surface-variant">
          {notification.id} • {notification.channel} • {notification.status}
        </p>
      </div>

      {canRetry ? <NotificationRetryButton notificationId={notification.id} /> : null}

      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-3 font-body text-body-md">
        <p>
          <strong>Recipient:</strong> {notification.recipient}
        </p>
        <p>
          <strong>Subject:</strong> {notification.subject}
        </p>
        <p>
          <strong>Order:</strong>{" "}
          {notification.order ? (
            <Link
              href={`/admin/orders/${notification.order.id}`}
              className="font-mono text-primary underline"
            >
              {notification.order.orderNumber}
            </Link>
          ) : (
            "—"
          )}
        </p>
        <p className="font-mono text-mono-sm">
          <strong>Provider:</strong> {notification.provider} •{" "}
          <strong>Message ID:</strong> {notification.providerMessageId ?? "—"}
        </p>
        <p className="font-mono text-mono-sm">
          <strong>Attempts:</strong> {notification.attemptCount} •{" "}
          <strong>Created:</strong> {notification.createdAt.toLocaleString("en-IN")}
        </p>
        {notification.sentAt ? (
          <p className="font-mono text-mono-sm text-success">
            <strong>Sent At:</strong> {notification.sentAt.toLocaleString("en-IN")}
          </p>
        ) : null}
        {notification.lastError ? (
          <p className="text-error">
            <strong>Last Error:</strong> {notification.lastError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
