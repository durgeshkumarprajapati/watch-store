"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCustomerNotificationPreferencesAction } from "@/modules/notifications/notification-actions";

export function NotificationPreferencesForm({
  initialShippingEnabled,
}: {
  initialShippingEnabled: boolean;
}) {
  const router = useRouter();
  const [shippingUpdatesEnabled, setShippingUpdatesEnabled] = useState(initialShippingEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await updateCustomerNotificationPreferencesAction({ shippingUpdatesEnabled });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("Notification preferences saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error ? (
        <div className="p-3.5 rounded border border-error bg-error/10 text-error font-body text-body-md">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="p-3.5 rounded border border-success bg-success/10 text-success font-body text-body-md">
          {message}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="p-4 rounded border border-outline bg-background flex items-center justify-between gap-4">
          <div>
            <p className="font-title text-title-md text-on-surface">
              Order &amp; Payment Confirmations
            </p>
            <p className="font-body text-body-md text-on-surface-variant">
              Essential transactional confirmations, payment receipts, and cancellation notices.
            </p>
          </div>
          <span className="font-label text-label-sm uppercase text-on-surface-variant shrink-0">
            Always On
          </span>
        </div>

        <label className="p-4 rounded border border-outline bg-background flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="font-title text-title-md text-on-surface">
              Shipment &amp; Delivery Milestones
            </p>
            <p className="font-body text-body-md text-on-surface-variant">
              Email updates when your shipment is created, dispatched, out for delivery, or delivered.
            </p>
          </div>
          <input
            type="checkbox"
            checked={shippingUpdatesEnabled}
            onChange={(e) => setShippingUpdatesEnabled(e.target.checked)}
            className="w-5 h-5"
          />
        </label>
      </div>

      <div>
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </form>
  );
}
