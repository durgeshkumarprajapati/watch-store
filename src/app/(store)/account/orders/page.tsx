import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AccountShell } from "@/components/store/account/account-shell";
import { formatINR } from "@/lib/format";
import { requireAuthenticatedCustomerPage } from "@/modules/auth/session-service";
import { listCustomerOrders } from "@/modules/customers/customer-service";

export const metadata: Metadata = {
  title: "My Orders",
  description: "View your WatchStore order history.",
};

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const customer = await requireAuthenticatedCustomerPage();
  const { page: rawPage } = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const orders = await listCustomerOrders(customer.id, { page: pageNum, pageSize: 10 });

  return (
    <AccountShell customer={customer} activeTab="orders">
      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
        <h2 className="font-headline text-headline-md text-on-surface border-b border-outline pb-4">
          Order History ({orders.total})
        </h2>

        {orders.items.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center gap-4">
            <p className="font-body text-body-md text-on-surface-variant">
              You haven&apos;t placed any orders yet.
            </p>
            <Link
              href="/products"
              className="px-6 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider"
            >
              Browse Catalogue
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.items.map((o) => (
              <Link
                key={o.id}
                href={`/account/orders/${o.id}`}
                className="p-4 sm:p-5 rounded border border-outline hover:border-primary flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors duration-state-change"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-mono-md text-on-surface">{o.orderNumber}</span>
                    <Badge tone={o.status === "CONFIRMED" || o.status === "DELIVERED" ? "success" : "secondary"}>{o.status}</Badge>
                    <Badge tone={o.paymentStatus === "PAID" ? "success" : "primary"}>
                      Payment: {o.paymentStatus}
                    </Badge>
                    {o.status === "DELIVERED" ? (
                      <Badge tone="secondary">Invoice Ready</Badge>
                    ) : null}
                  </div>
                  <p className="font-body text-body-md text-on-surface-variant">
                    {o.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} •{" "}
                    {o.items.reduce((n, i) => n + i.quantity, 0)} item(s)
                  </p>
                </div>
                <span className="font-headline text-headline-md text-on-surface tabular-nums">
                  {formatINR(o.grandTotalPaise)}
                </span>
              </Link>
            ))}
          </div>
        )}

        {orders.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            {Array.from({ length: orders.totalPages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`/account/orders?page=${p}`}
                className={
                  p === orders.page
                    ? "w-9 h-9 rounded bg-primary text-on-primary font-mono text-mono-sm flex items-center justify-center"
                    : "w-9 h-9 rounded border border-outline bg-background font-mono text-mono-sm flex items-center justify-center hover:border-primary"
                }
              >
                {p}
              </Link>
            ))}
          </div>
        )}
      </section>
    </AccountShell>
  );
}
