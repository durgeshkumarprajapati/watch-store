import Link from "next/link";
import type { NotificationEventType, NotificationStatus } from "@prisma/client";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import {
  getAdminNotificationSummary,
  listAdminNotifications,
} from "@/modules/notifications/notification-query-service";

const EVENT_TYPES: NotificationEventType[] = [
  "ORDER_CONFIRMED",
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "COD_ORDER_CONFIRMED",
  "SHIPMENT_CREATED",
  "SHIPMENT_DISPATCHED",
  "OUT_FOR_DELIVERY",
  "ORDER_DELIVERED",
  "ORDER_CANCELLED",
];

const STATUSES: NotificationStatus[] = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "DEAD_LETTER",
];

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("notifications.read");
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : undefined;
  const eventType =
    typeof sp.eventType === "string" && EVENT_TYPES.includes(sp.eventType as NotificationEventType)
      ? (sp.eventType as NotificationEventType)
      : undefined;
  const status =
    typeof sp.status === "string" && STATUSES.includes(sp.status as NotificationStatus)
      ? (sp.status as NotificationStatus)
      : undefined;
  const fromDate = typeof sp.fromDate === "string" && sp.fromDate ? sp.fromDate : undefined;
  const toDate = typeof sp.toDate === "string" && sp.toDate ? sp.toDate : undefined;
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const [summary, result] = await Promise.all([
    getAdminNotificationSummary(),
    listAdminNotifications({ q, eventType, status, fromDate, toDate, page, pageSize: 20 }),
  ]);

  function buildPageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (eventType) params.set("eventType", eventType);
    if (status) params.set("status", status);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/notifications?${qs}` : "/admin/notifications";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-surface">
          Customer Notifications
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Monitor transactional email delivery, retry failed jobs, and inspect outbox status.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: summary.total },
          { label: "Sent", value: summary.sent },
          { label: "Pending", value: summary.pending },
          { label: "Failed", value: summary.failed },
          { label: "Dead Letter", value: summary.deadLetter },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-surface border border-outline rounded-md p-4 flex flex-col gap-1"
          >
            <span className="font-label text-label-sm uppercase text-on-surface-variant">
              {card.label}
            </span>
            <span className="font-mono text-headline-md text-on-surface">{card.value}</span>
          </div>
        ))}
      </div>

      <form
        method="GET"
        className="bg-surface border border-outline rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
      >
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Recipient, subject, or order #..."
          className="px-3 py-2 rounded bg-background border border-outline text-body-md lg:col-span-2"
        />
        <select
          name="eventType"
          defaultValue={eventType ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Events</option>
          {EVENT_TYPES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="fromDate"
          defaultValue={fromDate ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        />
        <div className="flex gap-2">
          <input
            type="date"
            name="toDate"
            defaultValue={toDate ?? ""}
            className="flex-1 min-w-0 px-3 py-2 rounded bg-background border border-outline text-body-md"
          />
          <button
            type="submit"
            className="px-3.5 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
          >
            Filter
          </button>
        </div>
      </form>

      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-title text-title-md text-on-surface">No notifications found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Event</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Recipient</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Order</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Status</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Attempts</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Created</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {result.items.map((n) => (
                  <tr key={n.id}>
                    <td className="px-4 py-3 font-mono text-mono-sm">{n.eventType}</td>
                    <td className="px-4 py-3 font-body text-body-md">{n.recipient}</td>
                    <td className="px-4 py-3 font-mono text-mono-sm">
                      {n.order ? n.order.orderNumber : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm">{n.status}</td>
                    <td className="px-4 py-3 font-mono text-mono-sm">{n.attemptCount}</td>
                    <td className="px-4 py-3 font-mono text-mono-sm text-on-surface-variant">
                      {n.createdAt.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/notifications/${n.id}`}
                        className="font-label text-label-sm uppercase text-primary hover:underline"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {result.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="font-body text-body-md text-on-surface-variant">
            Page {result.page} of {result.totalPages} ({result.total} notifications)
          </p>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={buildPageHref(result.page - 1)}
                className="px-3.5 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase"
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link
                href={buildPageHref(result.page + 1)}
                className="px-3.5 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
