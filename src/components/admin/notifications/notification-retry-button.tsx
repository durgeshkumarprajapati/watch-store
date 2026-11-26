"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { retryAdminNotificationAction } from "@/modules/notifications/notification-actions";

export function NotificationRetryButton({ notificationId }: { notificationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleRetry() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await retryAdminNotificationAction(notificationId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess("Notification re-queued for delivery.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <button
        type="button"
        disabled={busy}
        onClick={handleRetry}
        className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider disabled:opacity-50"
      >
        {busy ? "Re-queueing..." : "Retry Delivery"}
      </button>
      {error ? <p className="font-body text-body-md text-error">{error}</p> : null}
      {success ? <p className="font-body text-body-md text-success">{success}</p> : null}
    </div>
  );
}
