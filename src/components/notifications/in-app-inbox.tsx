"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export interface InboxItemView {
  id: string;
  eventType: string;
  title: string;
  body: string;
  targetUrl: string;
  readAt: string | null;
  createdAt: string;
}

export function InAppInbox({
  items,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: {
  items: InboxItemView[];
  unreadCount: number;
  onMarkRead: (id: string) => Promise<unknown>;
  onMarkAllRead: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await onMarkRead(id);
      router.refresh();
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await onMarkAllRead();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-title text-title-md text-on-surface">
            Notification Inbox ({unreadCount} unread)
          </h3>
          <p className="font-body text-body-sm text-on-surface-variant">
            Recent order, payment, and operational alerts.
          </p>
        </div>
        {unreadCount > 0 ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={handleMarkAllRead}
          >
            Mark all read
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="p-6 rounded-md border border-outline bg-surface-container/20 text-body-md text-on-surface-variant">
          No notifications yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const isUnread = !item.readAt;
            return (
              <li
                key={item.id}
                className={`p-4 rounded-md border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isUnread
                    ? "border-primary/50 bg-primary/5"
                    : "border-outline bg-surface"
                }`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {isUnread ? (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    ) : null}
                    <span className="font-title text-title-sm text-on-surface">
                      {item.title}
                    </span>
                  </div>
                  {item.body && item.body !== item.title ? (
                    <p className="font-body text-body-sm text-on-surface-variant">{item.body}</p>
                  ) : null}
                  <div className="flex items-center gap-3 text-label-sm text-on-surface-variant">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    {item.targetUrl ? (
                      <Link
                        href={item.targetUrl}
                        className="text-primary underline underline-offset-2"
                      >
                        View details
                      </Link>
                    ) : null}
                  </div>
                </div>
                {isUnread ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => handleMarkRead(item.id)}
                  >
                    Mark read
                  </Button>
                ) : (
                  <span className="text-label-sm text-on-surface-variant">Read</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
