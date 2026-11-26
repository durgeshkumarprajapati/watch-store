import Link from "next/link";
import type { ReservationStatus } from "@prisma/client";
import { InventorySubnav } from "@/components/admin/inventory/inventory-subnav";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listInventoryReservations } from "@/modules/admin/inventory/inventory-query-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

const STATUSES: ReservationStatus[] = ["RESERVED", "COMMITTED", "RELEASED", "EXPIRED"];

export default async function AdminInventoryReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPermission("inventory.read");
  const canUpdate = hasAdminPermission(admin.permissions, "inventory.update");
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status =
    typeof sp.status === "string" && STATUSES.includes(sp.status as ReservationStatus)
      ? (sp.status as ReservationStatus)
      : undefined;
  const fromDate = typeof sp.fromDate === "string" && sp.fromDate ? sp.fromDate : undefined;
  const toDate = typeof sp.toDate === "string" && sp.toDate ? sp.toDate : undefined;
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const result = await listInventoryReservations({ q, status, fromDate, toDate, page, pageSize: 20 });

  function buildPageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/inventory/reservations?${qs}` : "/admin/inventory/reservations";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-surface">
          Stock Reservations (Read-Only)
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Visibility into active, committed, released, and expired order stock reservations.
        </p>
      </div>

      <InventorySubnav active="reservations" canUpdate={canUpdate} />

      <form
        method="GET"
        className="bg-surface border border-outline rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
      >
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Order #, product, or SKU..."
          className="px-3 py-2 rounded bg-background border border-outline text-body-md lg:col-span-2"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Statuses</option>
          <option value="RESERVED">Active (Reserved)</option>
          <option value="COMMITTED">Committed</option>
          <option value="RELEASED">Released</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <input
          type="date"
          name="fromDate"
          defaultValue={fromDate ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        />
        <div className="flex gap-2">
          <input
            type="date"
            name="toDate"
            defaultValue={toDate ?? ""}
            className="flex-1 min-w-0 px-3 py-2 rounded bg-background border border-outline text-body-md"
          />
          <button
            type="submit"
            className="px-3.5 py-2 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
          >
            Filter
          </button>
        </div>
      </form>

      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        {result.items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-title text-title-md text-on-surface">No reservations found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Order</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Product &amp; SKU</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Qty</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Status</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Created</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Expires / Settled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {result.items.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-mono text-mono-sm">{r.orderNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-title text-title-md">{r.productName}</p>
                      <p className="font-mono text-mono-sm text-on-surface-variant">{r.sku}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md">{r.quantity}</td>
                    <td className="px-4 py-3 font-mono text-mono-sm">{r.status}</td>
                    <td className="px-4 py-3 font-mono text-mono-sm text-on-surface-variant">
                      {new Date(r.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm text-on-surface-variant">
                      {r.committedAt
                        ? `Committed ${new Date(r.committedAt).toLocaleString("en-IN")}`
                        : r.releasedAt
                          ? `Released ${new Date(r.releasedAt).toLocaleString("en-IN")}`
                          : `Expires ${new Date(r.expiresAt).toLocaleString("en-IN")}`}
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
            Page {result.page} of {result.totalPages} ({result.total} reservations)
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
