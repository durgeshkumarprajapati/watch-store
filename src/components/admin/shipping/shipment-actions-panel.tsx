"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShipmentStatus, ShippingProvider } from "@prisma/client";
import {
  assignShipmentAwbAction,
  cancelShiprocketShipmentAction,
  checkOrderServiceabilityAction,
  createManualShipmentAction,
  createShiprocketShipmentAction,
  generateShipmentLabelAction,
  reconcileShipmentAction,
  scheduleShipmentPickupAction,
  syncShipmentTrackingAction,
} from "@/modules/shipping/presentation/shipping-actions";

interface CourierOption {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  etd?: string;
}

export function ShipmentActionsPanel({
  orderId,
  shiprocketConfigured,
  activeShipment,
  canManage,
  canCancel,
  canRetry,
}: {
  orderId: string;
  shiprocketConfigured: boolean;
  activeShipment?: {
    id: string;
    provider: ShippingProvider;
    isManual: boolean;
    status: ShipmentStatus;
    shiprocketOrderId: string | null;
    awbCode: string | null;
    labelUrl: string | null;
    pickupScheduledAt: string | null;
    reconciliationRequired: boolean;
  } | null;
  canManage: boolean;
  canCancel: boolean;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>("");
  const [cancelReason, setCancelReason] = useState("Admin requested shipment cancellation");

  const [manualCarrier, setManualCarrier] = useState("");
  const [manualTracking, setManualTracking] = useState("");
  const [manualUrl, setManualUrl] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Shipping operation failed.");
        return;
      }
      setSuccess(okMsg);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckServiceability() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await checkOrderServiceabilityAction(orderId, 0.5);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCouriers(res.couriers);
      if (res.couriers[0]) {
        setSelectedCourierId(String(res.couriers[0].courier_company_id));
      }
      setSuccess(`Found ${res.couriers.length} serviceable courier option(s).`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline pb-3">
        <h2 className="font-headline text-headline-md">Shiprocket &amp; Automated Shipping</h2>
        <span className="font-mono text-mono-sm text-on-surface-variant">
          {shiprocketConfigured ? "Shiprocket API Configured" : "Shiprocket Not Configured (Manual Fallback)"}
        </span>
      </div>

      {error ? (
        <div className="p-3 rounded border border-error bg-error/10 text-error font-body text-body-md">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="p-3 rounded border border-success bg-success/10 text-success font-body text-body-md">
          {success}
        </div>
      ) : null}

      {!activeShipment ? (
        <div className="flex flex-col gap-4">
          {shiprocketConfigured && canManage ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleCheckServiceability}
                className="px-4 py-2 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary"
              >
                Check Serviceability
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      createShiprocketShipmentAction({
                        orderId,
                        idempotencyKey: crypto.randomUUID(),
                      }),
                    "Shiprocket shipment created.",
                  )
                }
                className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase"
              >
                Create Shiprocket Shipment
              </button>
            </div>
          ) : null}

          {couriers.length > 0 ? (
            <div className="border border-outline rounded p-3 bg-background flex flex-col gap-2">
              <p className="font-label text-label-sm uppercase text-on-surface-variant">
                Available Couriers
              </p>
              <ul className="divide-y divide-outline text-body-md">
                {couriers.slice(0, 6).map((c) => (
                  <li key={c.courier_company_id} className="py-1.5 flex justify-between">
                    <span>{c.courier_name}</span>
                    <span className="font-mono text-mono-sm">
                      ₹{c.rate} {c.etd ? `• ETD ${c.etd}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canManage ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    createManualShipmentAction({
                      orderId,
                      carrierName: manualCarrier,
                      trackingNumber: manualTracking,
                      trackingUrl: manualUrl || undefined,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  "Manual shipment recorded.",
                );
              }}
              className="border-t border-outline pt-4 grid grid-cols-1 md:grid-cols-3 gap-3"
            >
              <input
                type="text"
                required
                value={manualCarrier}
                onChange={(e) => setManualCarrier(e.target.value)}
                placeholder="Manual Carrier Name"
                className="px-3 py-2 rounded bg-background border border-outline text-body-md"
              />
              <input
                type="text"
                required
                value={manualTracking}
                onChange={(e) => setManualTracking(e.target.value)}
                placeholder="Tracking / AWB #"
                className="px-3 py-2 rounded bg-background border border-outline font-mono text-mono-sm"
              />
              <div className="flex gap-2">
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://tracking..."
                  className="flex-1 min-w-0 px-3 py-2 rounded bg-background border border-outline font-mono text-mono-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3.5 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
                >
                  Save Manual
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 font-mono text-mono-sm">
            <span>Mode: {activeShipment.isManual ? "MANUAL" : "SHIPROCKET"}</span>
            <span>Status: {activeShipment.status}</span>
            {activeShipment.awbCode ? <span>AWB: {activeShipment.awbCode}</span> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {!activeShipment.isManual &&
            canManage &&
            !activeShipment.awbCode &&
            activeShipment.status === "SHIPMENT_CREATED" ? (
              <div className="flex items-center gap-2">
                {couriers.length > 0 ? (
                  <select
                    value={selectedCourierId}
                    onChange={(e) => setSelectedCourierId(e.target.value)}
                    className="px-3 py-2 rounded bg-background border border-outline text-body-md"
                  >
                    {couriers.map((c) => (
                      <option key={c.courier_company_id} value={c.courier_company_id}>
                        {c.courier_name} (₹{c.rate})
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        assignShipmentAwbAction(
                          activeShipment.id,
                          selectedCourierId ? Number(selectedCourierId) : undefined,
                        ),
                      "AWB assigned.",
                    )
                  }
                  className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase"
                >
                  Assign AWB
                </button>
              </div>
            ) : null}

            {!activeShipment.isManual && canManage && activeShipment.awbCode ? (
              <>
                {activeShipment.labelUrl ? (
                  <a
                    href={activeShipment.labelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary"
                  >
                    Download Label
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => generateShipmentLabelAction(activeShipment.id),
                        "Shipping label generated.",
                      )
                    }
                    className="px-4 py-2 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary"
                  >
                    Generate Label
                  </button>
                )}

                {!activeShipment.pickupScheduledAt && activeShipment.status === "AWB_ASSIGNED" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => scheduleShipmentPickupAction(activeShipment.id),
                        "Pickup scheduled.",
                      )
                    }
                    className="px-4 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
                  >
                    Schedule Pickup
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => syncShipmentTrackingAction(activeShipment.id),
                      "Tracking synchronized.",
                    )
                  }
                  className="px-4 py-2 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary"
                >
                  Refresh Tracking
                </button>
              </>
            ) : null}

            {!activeShipment.isManual && canRetry && activeShipment.reconciliationRequired ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () => reconcileShipmentAction(activeShipment.id),
                    "Shipment reconciled with Shiprocket.",
                  )
                }
                className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase"
              >
                Reconcile Shipment
              </button>
            ) : null}

            {canCancel &&
            activeShipment.status !== "DELIVERED" &&
            activeShipment.status !== "CANCELLED" &&
            activeShipment.status !== "IN_TRANSIT" &&
            activeShipment.status !== "OUT_FOR_DELIVERY" ? (
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="px-3 py-1.5 rounded bg-background border border-outline text-body-md"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => cancelShiprocketShipmentAction(activeShipment.id, cancelReason),
                      "Shipment cancelled.",
                    )
                  }
                  className="px-3.5 py-2 rounded-sm border border-error text-error font-label text-label-sm uppercase"
                >
                  Cancel Shipment
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
