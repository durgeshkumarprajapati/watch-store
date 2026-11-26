"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  stockAdjustmentAction,
  stockInwardAction,
  stockOutwardAction,
} from "@/modules/admin/inventory/inventory-actions";

interface ProductStockOption {
  productId: string;
  name: string;
  sku: string;
  available: number;
  reserved: number;
  physicalStock: number;
}

export function InventoryOperationForm({
  mode,
  products,
  defaultProductId,
}: {
  mode: "inward" | "outward" | "adjustment";
  products: ProductStockOption[];
  defaultProductId?: string;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(defaultProductId || products[0]?.productId || "");
  const [adjustMode, setAdjustMode] = useState<"SET_PHYSICAL" | "DELTA_INCREASE" | "DELTA_DECREASE">(
    "SET_PHYSICAL",
  );
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState(
    mode === "inward"
      ? "Replenishment received"
      : mode === "outward"
        ? "Verified manual stock issue"
        : "Verified physical cycle count",
  );
  const [referenceId, setReferenceId] = useState("");
  const [note, setNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selected = products.find((p) => p.productId === productId);

  async function executeSubmit() {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    const qty = Number(quantity);

    try {
      const res =
        mode === "inward"
          ? await stockInwardAction({
              productId,
              quantity: qty,
              reason,
              referenceId: referenceId || undefined,
              note: note || undefined,
              idempotencyKey,
            })
          : mode === "outward"
            ? await stockOutwardAction({
                productId,
                quantity: qty,
                reason,
                referenceId: referenceId || undefined,
                note: note || undefined,
                idempotencyKey,
              })
            : await stockAdjustmentAction({
                productId,
                mode: adjustMode,
                quantity: qty,
                reason,
                referenceId: referenceId || undefined,
                note: note || undefined,
                idempotencyKey,
              });

      if (!res.ok) {
        setError(res.error);
        setConfirmSensitive(false);
        return;
      }

      setSuccess(
        `Updated stock — Physical: ${res.physicalStock}, Reserved: ${res.reserved}, Available: ${res.available}.`,
      );
      setIdempotencyKey(crypto.randomUUID());
      setConfirmSensitive(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode !== "inward" && !confirmSensitive) {
      setConfirmSensitive(true);
      return;
    }
    void executeSubmit();
  }

  return (
    <form
      onSubmit={handleFormSubmit}
      className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5 max-w-2xl"
    >
      {error ? (
        <div className="p-3.5 rounded border border-error bg-error/10 text-error font-body text-body-md">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="p-3.5 rounded border border-success bg-success/10 text-success font-body text-body-md">
          {success}
        </div>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="font-label text-label-lg">Timepiece</span>
        <select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setConfirmSensitive(false);
          }}
          className="px-3.5 py-2.5 rounded bg-background border border-outline"
        >
          {products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.name} ({p.sku})
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <div className="grid grid-cols-3 gap-3 p-4 rounded bg-surface-container border border-outline">
          <div>
            <span className="font-label text-label-sm uppercase text-on-surface-variant block">
              Physical
            </span>
            <span className="font-mono text-title-lg">{selected.physicalStock}</span>
          </div>
          <div>
            <span className="font-label text-label-sm uppercase text-on-surface-variant block">
              Reserved
            </span>
            <span className="font-mono text-title-lg">{selected.reserved}</span>
          </div>
          <div>
            <span className="font-label text-label-sm uppercase text-on-surface-variant block">
              Available
            </span>
            <span className="font-mono text-title-lg">{selected.available}</span>
          </div>
        </div>
      ) : null}

      {mode === "adjustment" ? (
        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg">Adjustment Mode</span>
          <select
            value={adjustMode}
            onChange={(e) =>
              setAdjustMode(
                e.target.value as "SET_PHYSICAL" | "DELTA_INCREASE" | "DELTA_DECREASE",
              )
            }
            className="px-3.5 py-2.5 rounded bg-background border border-outline"
          >
            <option value="SET_PHYSICAL">Set Verified Physical Count</option>
            <option value="DELTA_INCREASE">Increase Physical Stock (+)</option>
            <option value="DELTA_DECREASE">Decrease Physical Stock (-)</option>
          </select>
        </label>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg">
            {mode === "adjustment" && adjustMode === "SET_PHYSICAL"
              ? "Verified Physical Quantity"
              : "Quantity"}
          </span>
          <input
            type="number"
            min={mode === "adjustment" && adjustMode === "SET_PHYSICAL" ? 0 : 1}
            step="1"
            required
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setConfirmSensitive(false);
            }}
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg">Reference Number (Optional)</span>
          <input
            type="text"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            placeholder="e.g. GRN-2026-042"
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-label text-label-lg">Reason</span>
        <input
          type="text"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="px-3.5 py-2.5 rounded bg-background border border-outline"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-label text-label-lg">Notes (Optional)</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="px-3.5 py-2.5 rounded bg-background border border-outline"
        />
      </label>

      {confirmSensitive ? (
        <div className="p-4 rounded border border-primary bg-primary/10 flex flex-wrap items-center justify-between gap-3">
          <span className="font-body text-body-md text-on-surface">
            Confirm this stock {mode} operation? Movement history is immutable.
          </span>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase"
            >
              {submitting ? "Recording..." : "Confirm & Record"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmSensitive(false)}
              className="px-4 py-2 rounded-sm border border-outline font-label text-label-sm uppercase"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !productId}
            className="px-6 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider disabled:opacity-50"
          >
            {submitting
              ? "Recording..."
              : mode === "inward"
                ? "Record Stock Inward"
                : mode === "outward"
                  ? "Record Stock Outward"
                  : "Record Adjustment"}
          </button>
        </div>
      )}
    </form>
  );
}
