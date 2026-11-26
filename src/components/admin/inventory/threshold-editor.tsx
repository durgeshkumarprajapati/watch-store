"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLowStockThresholdAction } from "@/modules/admin/inventory/inventory-actions";

export function ThresholdEditor({
  productId,
  initialThreshold,
  canUpdate,
}: {
  productId: string;
  initialThreshold: number;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [threshold, setThreshold] = useState(String(initialThreshold));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canUpdate) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await updateLowStockThresholdAction({
        productId,
        threshold: Number(threshold),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("Threshold updated.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-label text-label-sm uppercase text-on-surface-variant">
          Low-Stock Threshold
        </span>
        <input
          type="number"
          min="0"
          max="10000"
          disabled={!canUpdate}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className="w-28 px-3 py-1.5 rounded bg-background border border-outline font-mono"
        />
      </label>
      {canUpdate ? (
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-1.5 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
        >
          {saving ? "Saving..." : "Update"}
        </button>
      ) : null}
      {message ? <span className="font-body text-body-md text-success">{message}</span> : null}
      {error ? <span className="font-body text-body-md text-error">{error}</span> : null}
    </form>
  );
}
