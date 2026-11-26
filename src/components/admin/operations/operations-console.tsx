"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  reconcilePaymentAction,
  retryMediaCleanupJobAction,
  triggerOperationsJobAction,
} from "@/modules/operations/operations-actions";

interface OperationsConsoleProps {
  canManage: boolean;
  snapshot: {
    recentRuns: {
      id: string;
      jobName: string;
      status: string;
      startedAt: string;
      durationMs: number | null;
      processedCount: number;
      errorCount: number;
      lastError: string | null;
    }[];
    shippingSummary: Record<string, number>;
    notificationSummary: Record<string, number>;
    mediaSummary: Record<string, number>;
    failedShippingJobs: {
      id: string;
      jobType: string;
      status: string;
      attempts: number;
      maxAttempts: number;
      lastError: string | null;
      shipmentId: string | null;
    }[];
    failedNotifications: {
      id: string;
      status: string;
      attempts: number;
      maxAttempts: number;
      lastError: string | null;
      notification: { id: string; orderId: string | null; eventType: string };
    }[];
    failedMediaJobs: {
      id: string;
      provider: string;
      reason: string;
      status: string;
      attempts: number;
      maxAttempts: number;
      lastError: string | null;
    }[];
    paymentsNeedingReconcile: {
      id: string;
      status: string;
      amountPaise: number;
      reconciliationNote: string | null;
      order: { id: string; orderNumber: string };
    }[];
    shipmentsNeedingReconcile: {
      id: string;
      status: string;
      awbCode: string | null;
      lastError: string | null;
      order: { id: string; orderNumber: string };
    }[];
    expiredReservationsCount: number;
  };
}

export function OperationsConsole({ canManage, snapshot }: OperationsConsoleProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function triggerJob(
    jobName:
      | "RESERVATION_CLEANUP"
      | "SHIPPING_SYNC"
      | "NOTIFICATION_PROCESS"
      | "MEDIA_CLEANUP"
      | "PAYMENT_RECONCILE",
  ) {
    setFeedback(null);
    startTransition(async () => {
      const res = await triggerOperationsJobAction(jobName);
      setFeedback(
        res.ok
          ? `${jobName}: ${res.status} (${res.processedCount} processed, ${res.errorCount} errors)`
          : `${jobName} failed: ${res.error ?? "Unknown error"}`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <div className="p-3 rounded bg-surface border border-primary text-body-md text-on-surface">
          {feedback}
        </div>
      )}

      {/* Health Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Expired Reservations</p>
          <p className="font-mono text-headline-md text-on-surface mt-1">{snapshot.expiredReservationsCount}</p>
        </div>
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Shipping Dead-Letter / Failed</p>
          <p className="font-mono text-headline-md text-on-surface mt-1">
            {(snapshot.shippingSummary.DEAD_LETTER ?? 0) + (snapshot.shippingSummary.FAILED ?? 0)}
          </p>
        </div>
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Notification Failures</p>
          <p className="font-mono text-headline-md text-on-surface mt-1">
            {(snapshot.notificationSummary.DEAD_LETTER ?? 0) + (snapshot.notificationSummary.FAILED ?? 0)}
          </p>
        </div>
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Media Cleanup Failures</p>
          <p className="font-mono text-headline-md text-on-surface mt-1">
            {(snapshot.mediaSummary.DEAD_LETTER ?? 0) + (snapshot.mediaSummary.FAILED ?? 0)}
          </p>
        </div>
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Payments / Shipments Reconcile</p>
          <p className="font-mono text-headline-md text-on-surface mt-1">
            {snapshot.paymentsNeedingReconcile.length} / {snapshot.shipmentsNeedingReconcile.length}
          </p>
        </div>
      </div>

      {/* Manual Triggers */}
      {canManage && (
        <section className="p-5 rounded bg-surface border border-outline flex flex-col gap-3">
          <h2 className="font-title text-title-md text-on-surface">Manual Operations Triggers</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["RESERVATION_CLEANUP", "Run Reservation Cleanup"],
                ["SHIPPING_SYNC", "Run Shipping Sync"],
                ["NOTIFICATION_PROCESS", "Process Notifications"],
                ["MEDIA_CLEANUP", "Run Media Cleanup"],
                ["PAYMENT_RECONCILE", "Reconcile Razorpay Payments"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                disabled={pending}
                onClick={() => triggerJob(key)}
                className="px-3.5 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Payments Requiring Reconciliation */}
      <section className="p-5 rounded bg-surface border border-outline flex flex-col gap-3">
        <h2 className="font-title text-title-md text-on-surface">
          Payments Requiring Reconciliation ({snapshot.paymentsNeedingReconcile.length})
        </h2>
        {snapshot.paymentsNeedingReconcile.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">All Razorpay payments are consistent.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-md">
              <thead>
                <tr className="border-b border-outline text-label-sm uppercase text-on-surface-variant">
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Note</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.paymentsNeedingReconcile.map((p) => (
                  <tr key={p.id} className="border-b border-outline/50">
                    <td className="py-2 pr-3 font-mono">
                      <Link href={`/admin/orders/${p.order.id}`} className="underline">
                        {p.order.orderNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 font-mono">{p.status}</td>
                    <td className="py-2 pr-3 text-on-surface-variant">{p.reconciliationNote ?? "Pending check"}</td>
                    <td className="py-2">
                      {canManage && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              const r = await reconcilePaymentAction(p.id);
                              setFeedback(`Payment ${p.order.orderNumber}: ${r.outcome} — ${r.note}`);
                              router.refresh();
                            });
                          }}
                          className="px-2.5 py-1 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary"
                        >
                          Reconcile
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Media Cleanup Failures */}
      <section className="p-5 rounded bg-surface border border-outline flex flex-col gap-3">
        <h2 className="font-title text-title-md text-on-surface">
          Failed / Dead-Letter Media Cleanup Jobs ({snapshot.failedMediaJobs.length})
        </h2>
        {snapshot.failedMediaJobs.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No failed media cleanup jobs.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {snapshot.failedMediaJobs.map((j) => (
              <div key={j.id} className="p-3 rounded border border-outline flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-mono-sm text-on-surface">
                    [{j.status}] {j.provider} · {j.reason} ({j.attempts}/{j.maxAttempts})
                  </p>
                  <p className="text-body-md text-on-surface-variant">{j.lastError ?? "Cleanup error"}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const r = await retryMediaCleanupJobAction(j.id);
                        setFeedback(r.ok ? `Media cleanup retry: ${r.completed} completed, ${r.failed} failed` : r.error);
                        router.refresh();
                      });
                    }}
                    className="px-3 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary"
                  >
                    Retry
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Scheduler Runs */}
      <section className="p-5 rounded bg-surface border border-outline flex flex-col gap-3">
        <h2 className="font-title text-title-md text-on-surface">Recent Scheduler Executions</h2>
        {snapshot.recentRuns.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No scheduler runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-md">
              <thead>
                <tr className="border-b border-outline text-label-sm uppercase text-on-surface-variant">
                  <th className="py-2 pr-3">Job</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Processed</th>
                  <th className="py-2 pr-3">Errors</th>
                  <th className="py-2 pr-3">Duration</th>
                  <th className="py-2">Started</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recentRuns.map((run) => (
                  <tr key={run.id} className="border-b border-outline/50">
                    <td className="py-2 pr-3 font-mono">{run.jobName}</td>
                    <td className="py-2 pr-3 font-mono">{run.status}</td>
                    <td className="py-2 pr-3 font-mono">{run.processedCount}</td>
                    <td className="py-2 pr-3 font-mono">{run.errorCount}</td>
                    <td className="py-2 pr-3 font-mono">{run.durationMs != null ? `${run.durationMs}ms` : "—"}</td>
                    <td className="py-2 text-on-surface-variant">{new Date(run.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
