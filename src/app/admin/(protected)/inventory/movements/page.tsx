import Link from "next/link";
import type { StockAdjustmentReason } from "@prisma/client";
import { InventorySubnav } from "@/components/admin/inventory/inventory-subnav";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";
import { listInventoryMovements } from "@/modules/admin/inventory/inventory-query-service";
import { hasAdminPermission } from "@/modules/admin/rbac-catalogue";

const REASONS: StockAdjustmentReason[] = [
  "RESTOCK",
  "OUTWARD",
  "MANUAL_ADJUSTMENT",
  "RESERVATION",
  "COMMIT",
  "RELEASE",
  "EXPIRATION",
];

export default async function AdminInventoryMovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPermission("inventory.read");
  const canUpdate = hasAdminPermission(admin.permissions, "inventory.update");
  const sp = await searchParams;

  const productId = typeof sp.productId === "string" && sp.productId ? sp.productId : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const referenceId = typeof sp.referenceId === "string" ? sp.referenceId : undefined;
  const reason =
    typeof sp.reason === "string" && REASONS.includes(sp.reason as StockAdjustmentReason)
      ? (sp.reason as StockAdjustmentReason)
      : undefined;
  const actorType =
    sp.actorType === "ADMIN" || sp.actorType === "SYSTEM" ? sp.actorType : undefined;
  const fromDate = typeof sp.fromDate === "string" && sp.fromDate ? sp.fromDate : undefined;
  const toDate = typeof sp.toDate === "string" && sp.toDate ? sp.toDate : undefined;
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;

  const result = await listInventoryMovements({
    productId,
    q,
    referenceId,
    reason,
    actorType,
    fromDate,
    toDate,
    page,
    pageSize: 20,
  });

  function buildPageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (productId) params.set("productId", productId);
    if (q) params.set("q", q);
    if (referenceId) params.set("referenceId", referenceId);
    if (reason) params.set("reason", reason);
    if (actorType) params.set("actorType", actorType);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/inventory/movements?${qs}` : "/admin/inventory/movements";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-surface">
          Inventory Movement History
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Read-only ledger of all administrator and system-generated stock movements.
        </p>
      </div>

      <InventorySubnav active="movements" canUpdate={canUpdate} />

      <form
        method="GET"
        className="bg-surface border border-outline rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
      >
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Product or SKU..."
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        />
        <input
          type="text"
          name="referenceId"
          defaultValue={referenceId ?? ""}
          placeholder="Reference / Order ID..."
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        />
        <select
          name="reason"
          defaultValue={reason ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Movement Types</option>
          <option value="RESTOCK">STOCK_INWARD</option>
          <option value="OUTWARD">STOCK_OUTWARD</option>
          <option value="MANUAL_ADJUSTMENT">STOCK_ADJUSTMENT</option>
          <option value="RESERVATION">RESERVATION_CREATED</option>
          <option value="COMMIT">RESERVATION_COMMITTED</option>
          <option value="RELEASE">RESERVATION_RELEASED</option>
          <option value="EXPIRATION">RESERVATION_EXPIRED</option>
        </select>
        <select
          name="actorType"
          defaultValue={actorType ?? ""}
          className="px-3 py-2 rounded bg-background border border-outline text-body-md"
        >
          <option value="">All Actors</option>
          <option value="ADMIN">Administrator</option>
          <option value="SYSTEM">System (Checkout / Payment)</option>
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
            <p className="font-title text-title-md text-on-surface">No movements found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline bg-surface-container">
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Timestamp</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Product &amp; SKU</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Type</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Qty Change</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Physical</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Reference</th>
                  <th className="px-4 py-3 font-label text-label-sm uppercase">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline">
                {result.items.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-mono text-mono-sm text-on-surface-variant whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-title text-title-md">{m.productName}</p>
                      <p className="font-mono text-mono-sm text-on-surface-variant">{m.sku}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm">{m.movementLabel}</td>
                    <td className="px-4 py-3 font-mono text-mono-md">
                      {m.deltaAvailable >= 0 ? `+${m.deltaAvailable}` : m.deltaAvailable} avail
                      {m.deltaReserved !== 0
                        ? ` / ${m.deltaReserved >= 0 ? `+${m.deltaReserved}` : m.deltaReserved} res`
                        : ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm">
                      {m.previousPhysical ?? "—"} → {m.newPhysical ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-sm text-on-surface-variant">
                      {m.referenceId ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md">
                      {m.actorLabel}
                      {m.note ? (
                        <span className="block text-body-md text-on-surface-variant">{m.note}</span>
                      ) : null}
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
            Page {result.page} of {result.totalPages} ({result.total} movements)
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
