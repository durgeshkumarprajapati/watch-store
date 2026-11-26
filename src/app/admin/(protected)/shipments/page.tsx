import Link from "next/link";
import type { ShipmentStatus, ShippingProvider } from "@prisma/client";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listAdminShipments } from "@/modules/shipping/application/shipping-query-service";

const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "PENDING",
  "SERVICEABILITY_CHECKED",
  "SHIPMENT_CREATED",
  "AWB_ASSIGNED",
  "PICKUP_SCHEDULED",
  "PICKUP_COMPLETED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RTO_INITIATED",
  "RTO_DELIVERED",
  "CANCELLED",
  "FAILED",
  "RECONCILIATION_REQUIRED",
];

export default async function AdminShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("shipments.read");
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status =
    typeof sp.status === "string" && SHIPMENT_STATUSES.includes(sp.status as ShipmentStatus)
      ? (sp.status as ShipmentStatus)
      : undefined;
  const provider =
    sp.provider === "SHIPROCKET" || sp.provider === "MANUAL"
      ? (sp.provider as ShippingProvider)
      : undefined;
  const reconciliationOnly = sp.reconciliation === "1";
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const result = await listAdminShipments({
    q,
    status,
    provider,
    reconciliationOnly,
    page,
    pageSize: 15,
  });

  function buildPageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (provider) params.set("provider", provider);
    if (reconciliationOnly) params.set("reconciliation", "1");
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/shipments?${qs}` : "/admin/shipments";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-surface">
          Shipments &amp; Carrier Tracking
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Manage Shiprocket automated shipments, AWB labels, pickups, and manual carrier fallback.
        </p>
      </div>

      <form
        method="GET"
        className="bg-surface border border-outline rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
      >
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Order #, AWB, courier, or customer..."
          className="px-3 py-2 rounded bg-background border border-outline text-body-md lg:col-span-2"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Shipment Statuses</option>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="provider"
          defaultValue={provider ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Modes</option>
          <option value="SHIPROCKET">Shiprocket</option>
          <option value="MANUAL">Manual</option>
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
          >
            Filter
          </button>
          <Link
            href="/admin/shipments"
            className="px-3 py-2 rounded-sm border border-outline font-label text-label-sm uppercase inline-flex items-center"
          >
            Clear
          </Link>
        </div>
      </form>

      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-title text-title-md text-on-surface">
              No shipments match the current filters.
            </p>
            <p className="font-body text-body-md text-on-surface-variant mt-1">
              Create shipments from an eligible order detail page under Orders.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Order</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Mode</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Carrier &amp; AWB</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Status</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Last Synced</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {result.items.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/admin/orders/${s.order.id}`}
                        className="font-mono text-mono-md font-semibold text-primary hover:underline"
                      >
                        {s.order.orderNumber}
                      </Link>
                      <p className="font-body text-body-md text-on-surface-variant">
                        {s.order.guestName}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm">
                      {s.isManual ? "Manual" : "Shiprocket"}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm">
                      <span>{s.courierName ?? "—"}</span>
                      <span className="block text-on-surface-variant">{s.awbCode ?? "No AWB"}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm">
                      {s.status}
                      {s.reconciliationRequired ? (
                        <span className="block text-error">Needs Reconciliation</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm text-on-surface-variant">
                      {s.lastSyncedAt ? s.lastSyncedAt.toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/admin/shipments/${s.id}`}
                        className="font-label text-label-sm uppercase text-primary hover:underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {result.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="font-body text-body-md text-on-surface-variant">
            Page {result.page} of {result.totalPages} ({result.total} shipments)
          </p>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={buildPageHref(result.page - 1)}
                className="px-3.5 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase"
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link
                href={buildPageHref(result.page + 1)}
                className="px-3.5 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
