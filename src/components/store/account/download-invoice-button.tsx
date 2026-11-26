"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

export function DownloadInvoiceButton({
  orderId,
  orderNumber,
  accessToken,
}: {
  orderId: string;
  orderNumber: string;
  accessToken?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const qs = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice${qs}`, {
        method: "GET",
        credentials: "same-origin",
      });

      if (!response.ok) {
        let message = "Unable to download invoice. Please try again.";
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // Non-JSON error body
        }
        setError(message);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `WatchStore-Invoice-${orderNumber}.pdf`;

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError("Network error while downloading invoice. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-sm border border-primary bg-primary/10 text-on-surface hover:bg-primary hover:text-on-primary disabled:opacity-60 font-label text-label-sm uppercase tracking-wider transition-colors duration-state-change"
      >
        <Icon name={loading ? "progress_activity" : "download"} size={16} />
        <span>{loading ? "Preparing Invoice..." : "Download Invoice (PDF)"}</span>
      </button>
      {error ? (
        <p role="alert" className="font-body text-body-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
