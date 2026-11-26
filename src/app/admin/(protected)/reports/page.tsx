import type { Metadata } from "next";
import { formatINR } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";

export const metadata: Metadata = {
  title: "Reports — WatchStore Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  await requireAdminPermission("reports.read");
  const prisma = getPrisma();

  const [paidAgg, statusGroups, totalCustomers, activeProducts, lowStockCount] = await Promise.all([
    prisma.order.aggregate({
      where: { paymentStatus: "PAID" },
      _sum: { grandTotalPaise: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { grandTotalPaise: true },
    }),
    prisma.customer.count(),
    prisma.product.count({ where: { status: "PUBLISHED" } }),
    prisma.productStock.count({ where: { available: { lte: 3 } } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-background">Sales &amp; Catalogue Reports</h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          Live PostgreSQL summary across revenue, order lifecycle, customers, and stock alerts.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Paid Revenue</p>
          <p className="font-mono text-headline-md mt-1">
            {formatINR(paidAgg._sum.grandTotalPaise ?? 0)}
          </p>
        </div>
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Paid Orders</p>
          <p className="font-mono text-headline-md mt-1">{paidAgg._count._all}</p>
        </div>
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Customers</p>
          <p className="font-mono text-headline-md mt-1">{totalCustomers}</p>
        </div>
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">
            Published / Low Stock
          </p>
          <p className="font-mono text-headline-md mt-1">
            {activeProducts} / {lowStockCount}
          </p>
        </div>
      </div>

      <section className="bg-surface border border-outline rounded-md p-5 flex flex-col gap-3">
        <h2 className="font-title text-title-md text-on-surface">Orders by Status</h2>
        {statusGroups.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No orders placed yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-body-md">
              <thead>
                <tr className="border-b border-outline text-label-sm uppercase text-on-surface-variant">
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Orders</th>
                  <th className="py-2 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {statusGroups.map((g) => (
                  <tr key={g.status} className="border-b border-outline/50 last:border-b-0">
                    <td className="py-2 pr-4 font-mono">{g.status}</td>
                    <td className="py-2 pr-4 font-mono">{g._count._all}</td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {formatINR(g._sum.grandTotalPaise ?? 0)}
                    </td>
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
