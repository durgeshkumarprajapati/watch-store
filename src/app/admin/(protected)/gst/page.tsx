import type { Metadata } from "next";
import Link from "next/link";
import { formatINR } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";

export const metadata: Metadata = {
  title: "GST & Invoices — WatchStore Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminGstPage() {
  await requireAdminPermission("reports.read");
  const prisma = getPrisma();

  const [totals, orders] = await Promise.all([
    prisma.order.aggregate({
      where: { status: { not: "CANCELLED" } },
      _sum: { includedGstPaise: true, grandTotalPaise: true, subtotalPaise: true },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        orderNumber: true,
        guestName: true,
        paymentStatus: true,
        subtotalPaise: true,
        includedGstPaise: true,
        grandTotalPaise: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-headline text-headline-lg text-on-background">GST &amp; Invoices</h1>
        <p className="font-body text-body-md text-on-surface-variant mt-1">
          Included GST tax summary across non-cancelled WatchStore orders.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Taxable Orders</p>
          <p className="font-mono text-headline-md mt-1">{totals._count._all}</p>
        </div>
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Total Included GST</p>
          <p className="font-mono text-headline-md mt-1">
            {formatINR(totals._sum.includedGstPaise ?? 0)}
          </p>
        </div>
        <div className="p-4 rounded bg-surface border border-outline">
          <p className="font-label text-label-sm uppercase text-on-surface-variant">Gross Order Value</p>
          <p className="font-mono text-headline-md mt-1">
            {formatINR(totals._sum.grandTotalPaise ?? 0)}
          </p>
        </div>
      </div>

      <div className="bg-surface border border-outline rounded-md overflow-x-auto">
        {orders.length === 0 ? (
          <p className="p-6 font-body text-body-md text-on-surface-variant">No invoices yet.</p>
        ) : (
          <table className="w-full text-left font-body text-body-md">
            <thead>
              <tr className="border-b border-outline text-label-sm uppercase tracking-wider text-on-surface-variant">
                <th className="py-3 px-4">Order / Invoice</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">Included GST</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-outline/50 last:border-b-0">
                  <td className="py-3 px-4 font-mono text-mono-sm">
                    <Link href={`/admin/orders/${o.id}`} className="underline hover:text-primary">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="py-3 px-4">{o.guestName}</td>
                  <td className="py-3 px-4 font-mono">{o.paymentStatus}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatINR(o.subtotalPaise)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatINR(o.includedGstPaise)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatINR(o.grandTotalPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
