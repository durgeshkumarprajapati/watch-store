"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FulfilmentStatus, OrderStatus, PaymentProvider, PaymentStatus } from "@prisma/client";
import {
  cancelAdminOrderAction,
  confirmCodPaymentCollectedAction,
  dispatchAdminOrderAction,
  markOrderPackedAction,
  transitionAdminOrderStatusAction,
} from "@/modules/admin/orders/admin-order-actions";

export function OrderFulfilmentControls({
  orderId,
  status,
  fulfilmentStatus,
  paymentProvider,
  paymentStatus,
  canUpdate,
  canCancel,
}: {
  orderId: string;
  status: OrderStatus;
  fulfilmentStatus: FulfilmentStatus;
  paymentProvider: PaymentProvider;
  paymentStatus: PaymentStatus;
  canUpdate: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [carrierName, setCarrierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [shipmentReference, setShipmentReference] = useState("");
  const [shippingNotes, setShippingNotes] = useState("");

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("Customer requested cancellation");
  const [cancelNotes, setCancelNotes] = useState("");

  const unpaidRazorpay = paymentProvider === "RAZORPAY" && paymentStatus !== "PAID";
  const canConfirm = canUpdate && status === "PENDING" && !unpaidRazorpay;
  const canProcess = canUpdate && status === "CONFIRMED" && !unpaidRazorpay;
  const canPack =
    canUpdate &&
    (status === "CONFIRMED" || status === "PROCESSING") &&
    fulfilmentStatus === "AWAITING_PACKING" &&
    !unpaidRazorpay;
  const canDispatch =
    canUpdate && status === "PROCESSING" && fulfilmentStatus === "PACKED" && !unpaidRazorpay;
  const canDeliver =
    canUpdate && status === "SHIPPED" && fulfilmentStatus === "DISPATCHED" && !unpaidRazorpay;
  const canConfirmCod =
    canUpdate &&
    paymentProvider === "COD" &&
    paymentStatus === "PENDING" &&
    status !== "CANCELLED";
  const canCancelOrder =
    canCancel && (status === "PENDING" || status === "CONFIRMED" || status === "PROCESSING");

  async function runAction(fn: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Operation failed.");
        return;
      }
      setSuccess(message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
      <h2 className="font-headline text-headline-md border-b border-outline pb-3">
        Fulfilment &amp; Order Actions
      </h2>

      {unpaidRazorpay && status !== "CANCELLED" ? (
        <div className="p-3.5 rounded border border-outline bg-surface-container text-body-md text-on-surface-variant">
          Razorpay payment is <strong>{paymentStatus}</strong>. Order confirmation and fulfilment are
          blocked until authoritative payment capture completes.
        </div>
      ) : null}

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

      <div className="flex flex-wrap gap-2.5">
        {canConfirm ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              runAction(
                () =>
                  transitionAdminOrderStatusAction({
                    orderId,
                    targetStatus: "CONFIRMED",
                    idempotencyKey: crypto.randomUUID(),
                  }),
                "Order confirmed.",
              )
            }
            className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase"
          >
            Confirm Order
          </button>
        ) : null}

        {canProcess ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              runAction(
                () =>
                  transitionAdminOrderStatusAction({
                    orderId,
                    targetStatus: "PROCESSING",
                    idempotencyKey: crypto.randomUUID(),
                  }),
                "Order moved to processing.",
              )
            }
            className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase"
          >
            Start Processing
          </button>
        ) : null}

        {canPack ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              runAction(
                () =>
                  markOrderPackedAction({
                    orderId,
                    idempotencyKey: crypto.randomUUID(),
                  }),
                "Order marked as packed.",
              )
            }
            className="px-4 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
          >
            Mark Packed
          </button>
        ) : null}

        {canDeliver ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              runAction(
                () =>
                  transitionAdminOrderStatusAction({
                    orderId,
                    targetStatus: "DELIVERED",
                    idempotencyKey: crypto.randomUUID(),
                  }),
                "Order marked as delivered.",
              )
            }
            className="px-4 py-2 rounded-sm bg-success text-on-success font-label text-label-sm uppercase"
          >
            Mark Delivered
          </button>
        ) : null}

        {canConfirmCod ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              runAction(
                () =>
                  confirmCodPaymentCollectedAction({
                    orderId,
                    idempotencyKey: crypto.randomUUID(),
                  }),
                "COD payment marked as collected (PAID).",
              )
            }
            className="px-4 py-2 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary"
          >
            Confirm COD Collected
          </button>
        ) : null}

        {canCancelOrder && !showCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowCancel(true)}
            className="ml-auto px-4 py-2 rounded-sm border border-error text-error font-label text-label-sm uppercase"
          >
            Cancel Order
          </button>
        ) : null}
      </div>

      {canDispatch ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAction(
              () =>
                dispatchAdminOrderAction({
                  orderId,
                  carrierName,
                  trackingNumber,
                  trackingUrl: trackingUrl || undefined,
                  shipmentReference: shipmentReference || undefined,
                  shippingNotes: shippingNotes || undefined,
                  idempotencyKey: crypto.randomUUID(),
                }),
              "Order dispatched with manual tracking details.",
            );
          }}
          className="border-t border-outline pt-4 flex flex-col gap-4"
        >
          <h3 className="font-title text-title-md">Record Manual Shipment &amp; Dispatch</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-label text-label-sm uppercase">Carrier Name</span>
              <input
                type="text"
                required
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="e.g. BlueDart Insured"
                className="px-3 py-2 rounded bg-background border border-outline"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label text-label-sm uppercase">Tracking Number</span>
              <input
                type="text"
                required
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="AWB / Tracking #"
                className="px-3 py-2 rounded bg-background border border-outline font-mono"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label text-label-sm uppercase">Tracking URL (HTTPS)</span>
              <input
                type="url"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://..."
                className="px-3 py-2 rounded bg-background border border-outline font-mono"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label text-label-sm uppercase">Shipment Reference</span>
              <input
                type="text"
                value={shipmentReference}
                onChange={(e) => setShipmentReference(e.target.value)}
                className="px-3 py-2 rounded bg-background border border-outline font-mono"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-label text-label-sm uppercase">Shipping Notes (Internal)</span>
            <input
              type="text"
              value={shippingNotes}
              onChange={(e) => setShippingNotes(e.target.value)}
              className="px-3 py-2 rounded bg-background border border-outline"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase"
            >
              {busy ? "Dispatching..." : "Dispatch & Mark Shipped"}
            </button>
          </div>
        </form>
      ) : null}

      {showCancel ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAction(
              () =>
                cancelAdminOrderAction({
                  orderId,
                  reason: cancelReason,
                  notes: cancelNotes || undefined,
                  idempotencyKey: crypto.randomUUID(),
                }),
              "Order cancelled.",
            );
          }}
          className="border border-error/50 bg-error/5 rounded-md p-4 flex flex-col gap-3"
        >
          <h3 className="font-title text-title-md text-error">Confirm Order Cancellation</h3>
          <label className="flex flex-col gap-1">
            <span className="font-label text-label-sm uppercase">Cancellation Reason</span>
            <input
              type="text"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="px-3 py-2 rounded bg-background border border-outline"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label text-label-sm uppercase">Internal Notes</span>
            <input
              type="text"
              value={cancelNotes}
              onChange={(e) => setCancelNotes(e.target.value)}
              className="px-3 py-2 rounded bg-background border border-outline"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCancel(false)}
              className="px-4 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-1.5 rounded-sm bg-error text-on-error font-label text-label-sm uppercase"
            >
              {busy ? "Cancelling..." : "Confirm Cancellation"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
