import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";

export const metadata: Metadata = {
  title: "Payments (Razorpay) — WatchStore Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminPermission("orders.read");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";

  const prisma = getPrisma();
  const where = q
    ? {
        OR: [
          { providerOrderId: { contains: q, mode: "insensitive" as const } },
          { providerPaymentId: { contains: q, mode: "insensitive" as const } },
          { order: { orderNumber: { contains: q, mode: "insensitive" as const } } },
          { order: { guestEmail: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      order: { select: { id: true, orderNumber: true, guestEmail: true, status: true } },
      _count: { select: { attempts: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-headline-lg text-on-background">
            Payments (Razorpay &amp; COD)
          </h1>
          <p className="font-body text-body-md text-on-surface-variant mt-1">
            Inspect payment records, gateway IDs, attempt counts, and reconciliation status.
          </p>
        </div>

        <form method="get" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Order #, Razorpay ID, or email..."
            className="px-3.5 py-2 rounded bg-surface border border-outline font-body text-body-md text-on-surface w-64"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider"
          >
            Search
          </button>
        </form>
      </div>

      <div className="bg-surface border border-outline rounded-md overflow-x-auto">
        {payments.length === 0 ? (
          <p className="p-6 font-body text-body-md text-on-surface-variant">
            No payment records found.
          </p>
        ) : (
          <table className="w-full text-left font-body text-body-md">
            <thead>
              <tr className="border-b border-outline text-label-sm uppercase tracking-wider text-on-surface-variant">
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Provider</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Gateway Refs</th>
                <th className="py-3 px-4">Attempts</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-outline/50 last:border-b-0">
                  <td className="py-3 px-4">
                    <Link
                      href={`/admin/orders/${p.order.id}`}
                      className="font-mono text-mono-sm underline hover:text-primary"
                    >
                      {p.order.orderNumber}
                    </Link>
                    <p className="text-on-surface-variant">{p.order.guestEmail}</p>
                  </td>
                  <td className="py-3 px-4 font-mono">{p.provider}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        tone={
                          p.status === "PAID"
                            ? "success"
                            : p.status === "FAILED"
                              ? "error"
                              : "secondary"
                        }
                      >
                        {p.status}
                      </Badge>
                      {p.needsReconciliation && <Badge tone="primary">Reconcile</Badge>}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-mono-sm text-on-surface-variant">
                    <p>{p.providerOrderId ?? "—"}</p>
                    <p>{p.providerPaymentId ?? ""}</p>
                  </td>
                  <td className="py-3 px-4 font-mono">{p._count.attempts}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatINR(p.amountPaise)}
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
