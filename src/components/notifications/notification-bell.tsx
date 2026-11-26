"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CountBadge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

interface HeaderInboxItem {
  id: string;
  eventType: string;
  title: string;
  body: string;
  targetUrl: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell({
  allNotificationsHref,
  className,
}: {
  allNotificationsHref: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HeaderInboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/inbox", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        items?: HeaderInboxItem[];
        unreadCount?: number;
      };
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(Number(data.unreadCount ?? 0));
    } catch {
      // Ignore transient network errors in header polling
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/notifications/inbox", { cache: "no-store" });
        if (!active || !res.ok) return;
        const data = (await res.json()) as {
          items?: HeaderInboxItem[];
          unreadCount?: number;
        };
        if (!active) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setUnreadCount(Number(data.unreadCount ?? 0));
      } catch {
        // Ignore transient network errors
      }
    }
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function markRead(notificationId?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/notifications/inbox/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationId ? { notificationId } : { all: true }),
      });
      if (res.ok) {
        const data = (await res.json()) as { unreadCount?: number };
        setUnreadCount(Number(data.unreadCount ?? 0));
        setItems((prev) =>
          prev.map((item) =>
            !notificationId || item.id === notificationId
              ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
              : item,
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void fetchInbox();
        }}
        className={cn(
          "relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors duration-state-change",
          className,
        )}
      >
        <Icon name="notifications" filled={unreadCount > 0} />
        {unreadCount > 0 ? <CountBadge count={unreadCount} /> : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[28rem] rounded-md bg-surface border border-outline shadow-xl z-50 flex flex-col overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-outline flex items-center justify-between gap-2 bg-surface-container/40">
            <span className="font-title text-title-sm text-on-surface">
              Notifications ({unreadCount})
            </span>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void markRead()}
                className="font-label text-label-sm uppercase tracking-wider text-primary hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="overflow-y-auto divide-y divide-outline/60">
            {items.length === 0 ? (
              <p className="p-4 text-body-sm text-on-surface-variant">
                No notifications yet.
              </p>
            ) : (
              items.map((item) => {
                const isUnread = !item.readAt;
                return (
                  <Link
                    key={item.id}
                    href={item.targetUrl || allNotificationsHref}
                    onClick={() => {
                      if (isUnread) void markRead(item.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "block px-4 py-3 hover:bg-surface-container/50 transition-colors",
                      isUnread ? "bg-primary/5" : "",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {isUnread ? (
                        <span
                          className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0"
                          aria-label="Unread"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="font-title text-title-sm text-on-surface truncate">
                          {item.title}
                        </p>
                        {item.body && item.body !== item.title ? (
                          <p className="font-body text-body-sm text-on-surface-variant line-clamp-2 mt-0.5">
                            {item.body}
                          </p>
                        ) : null}
                        <p className="font-mono text-label-sm text-on-surface-variant mt-1">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-outline bg-surface-container/30 text-center">
            <Link
              href={allNotificationsHref}
              onClick={() => setOpen(false)}
              className="font-label text-label-sm uppercase tracking-wider text-primary hover:underline"
            >
              View all &amp; push settings
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
