import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/modules/admin/admin-auth-service";

export const metadata: Metadata = {
  title: "Customers — WatchStore Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdminPermission("customers.read");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 20;

  const prisma = getPrisma();
  const where = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        authUser: { select: { emailVerified: true } },
        orders: {
          select: { id: true, grandTotalPaise: true, paymentStatus: true },
        },
        _count: { select: { addresses: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-headline-lg text-on-background">Customers</h1>
          <p className="font-body text-body-md text-on-surface-variant mt-1">
            View registered collector profiles, linked guest orders, and order totals ({total} total).
          </p>
        </div>

        <form method="get" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, email, or phone..."
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
        {customers.length === 0 ? (
          <p className="p-6 font-body text-body-md text-on-surface-variant">
            No customer records found.
          </p>
        ) : (
          <table className="w-full text-left font-body text-body-md">
            <thead>
              <tr className="border-b border-outline text-label-sm uppercase tracking-wider text-on-surface-variant">
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Email / Phone</th>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Orders</th>
                <th className="py-3 px-4">Addresses</th>
                <th className="py-3 px-4 text-right">Paid Spend</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const paidSpendPaise = c.orders
                  .filter((o) => o.paymentStatus === "PAID")
                  .reduce((sum, o) => sum + o.grandTotalPaise, 0);

                return (
                  <tr key={c.id} className="border-b border-outline/50 last:border-b-0">
                    <td className="py-3 px-4 font-semibold text-on-surface">{c.fullName}</td>
                    <td className="py-3 px-4">
                      <p className="text-on-surface">{c.email}</p>
                      {c.phone ? (
                        <p className="font-mono text-mono-sm text-on-surface-variant">{c.phone}</p>
                      ) : null}
                    </td>
                    <td className="py-3 px-4">
                      {c.authUser ? (
                        <Badge tone={c.authUser.emailVerified ? "success" : "secondary"}>
                          {c.authUser.emailVerified ? "Verified" : "Unverified"}
                        </Badge>
                      ) : (
                        <Badge tone="muted">Guest</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <Link
                        href={`/admin/orders?q=${encodeURIComponent(c.email)}`}
                        className="underline hover:text-primary"
                      >
                        {c.orders.length}
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-mono">{c._count.addresses}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatINR(paidSpendPaise)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-body-md text-on-surface-variant">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/customers?q=${encodeURIComponent(q)}&page=${page - 1}`}
                className="px-3 py-1.5 rounded border border-outline hover:border-primary"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/customers?q=${encodeURIComponent(q)}&page=${page + 1}`}
                className="px-3 py-1.5 rounded border border-outline hover:border-primary"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
